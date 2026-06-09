import { test, expect } from '@playwright/test';
import { access } from 'fs/promises';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

test.describe('Compare Mode', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('switches to compare mode and back', async () => {
        // Verify starts in single mode
        const labelBefore = await page.locator('#viewModeLabel').textContent();
        expect(labelBefore).toBe('Single');

        // Toggle view mode via evaluate (button is behind media-container overlay)
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Verify compare mode is active
        const isCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompare).toBe(true);

        const labelAfter = await page.locator('#viewModeLabel').textContent();
        expect(labelAfter).toBe('Compare');

        // Verify .media-container has compare-mode class
        const hasClass = await page.evaluate(() =>
            document.querySelector('.media-container').classList.contains('compare-mode')
        );
        expect(hasClass).toBe(true);

        // Switch back to single mode
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        const isCompareAfter = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompareAfter).toBe(false);
    });

    test('shows two media panes in compare mode', async () => {
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Both wrappers should be present
        const leftWrapper = page.locator('.left-media-wrapper');
        const rightWrapper = page.locator('.right-media-wrapper');
        await expect(leftWrapper).toBeVisible();
        await expect(rightWrapper).toBeVisible();

        // Each wrapper should contain a media-display element
        const leftMedia = leftWrapper.locator('.media-display');
        const rightMedia = rightWrapper.locator('.media-display');
        await expect(leftMedia).toBeVisible();
        await expect(rightMedia).toBeVisible();
    });

    test('navigates pairs with S key in compare mode', async () => {
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        const indexBefore = await page.evaluate(() => window.mediaViewer.currentIndex);
        expect(indexBefore).toBe(0);

        // S advances in compare mode; with 3 files, wraps back to start
        await page.keyboard.press('s');
        await page.waitForTimeout(500);

        // Verify still in compare mode and navigation was processed
        const isCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompare).toBe(true);

        // Left pane should be visible after navigation
        await expect(page.locator('.left-media-wrapper')).toBeVisible();
    });

    test('rates left file with Q key', async () => {
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Wait for compareLeftFile to be set by showCompareMedia(), then read its name
        await page.waitForFunction(() => window.mediaViewer.compareLeftFile != null);
        const leftFileName = await page.evaluate(() => window.mediaViewer.compareLeftFile.name);

        await page.keyboard.press('q');
        await page.waitForTimeout(500);

        // Verify file moved to like folder
        await expect(access(join(tmpFixtures.likeDir, leftFileName))).resolves.toBeUndefined();
    });

    test('switches to single mode when last pair is rated', async () => {
        // Load with only 2 files (minimum for compare mode)
        const twoFileTmp = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        // Launch fresh app with 2 files
        await closeApp(electronApp);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: twoFileTmp.likeDir,
            customDislikeFolder: twoFileTmp.dislikeDir,
        });
        await loadFolder(page, twoFileTmp.dir);
        await waitForMedia(page);

        // Enter compare mode
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Verify in compare mode
        const isCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompare).toBe(true);

        // Rate the pair (left like, right dislike)
        await page.evaluate(() => window.mediaViewer.handleLeftLike());
        await page.waitForTimeout(1000);

        // Should have switched to single mode (0 files remain)
        const isCompareAfter = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompareAfter).toBe(false);

        // Should NOT show drop zone
        const dropZoneVisible = await page.evaluate(
            () => document.querySelector('.drop-zone').style.display !== 'none'
        );
        expect(dropZoneVisible).toBe(false);

        // moveHistory should still have entries (undo available)
        const historyLength = await page.evaluate(() => window.mediaViewer.moveHistory.length);
        expect(historyLength).toBe(2);

        // Undo should restore both files
        await page.evaluate(() => window.mediaViewer.handleCancel());
        await page.waitForTimeout(1000);

        const filesAfterUndo = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(filesAfterUndo).toBe(2);

        // Clean up temp dir
        await twoFileTmp.cleanup();
    });

    test('Both good records a bulk rating, persists it, and undo clears it', async () => {
        await seedLocalStorage(page, { mlPredictionEnabled: 'true' });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Force AI-sorted compare state and a known pair, then bulk-rate.
        const result = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            mv.isCompareMode = true;
            mv.isSortedByPrediction = true;
            mv.compareLeftFile = mv.mediaFiles[0];
            mv.compareRightFile = mv.mediaFiles[1];
            mv.getCombinedFeatures = () => [0.1, 0.2, 0.3];
            await mv.applyBulkRating('good');
            const inMemory = [...mv.bulkRated.entries()];
            const onDisk = await window.electronAPI.readBulkRatedFile(mv.baseFolderPath);
            return { inMemory, onDisk, historyLen: mv.moveHistory.length };
        });

        expect(result.inMemory).toHaveLength(2);
        expect(result.inMemory.every(([, bucket]) => bucket === 'good')).toBe(true);
        expect(result.onDisk.data.good).toHaveLength(2);
        expect(result.historyLen).toBe(1);

        // Wait for any in-flight showMedia() triggered by nextMedia() to complete
        // before calling handleCancel (it guards on isLoading).
        await page.waitForFunction(() => !window.mediaViewer.isLoading);

        // Undo clears the buckets and the on-disk record.
        const afterUndo = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            await mv.handleCancel();
            const onDisk = await window.electronAPI.readBulkRatedFile(mv.baseFolderPath);
            return { size: mv.bulkRated.size, good: onDisk.data ? onDisk.data.good.length : 0 };
        });

        expect(afterUndo.size).toBe(0);
        expect(afterUndo.good).toBe(0);
    });

    test('resets to single mode when switching folders in compare mode', async () => {
        // Enter compare mode
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Verify in compare mode
        const isCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompare).toBe(true);

        // Create a second folder with different fixtures
        let secondFolder;
        try {
            secondFolder = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);

            // Load second folder while still in compare mode
            await loadFolder(page, secondFolder.dir);
            await waitForMedia(page);

            // Should have reset to single mode
            const isCompareAfter = await page.evaluate(() => window.mediaViewer.isCompareMode);
            expect(isCompareAfter).toBe(false);

            // Single mode UI should be active
            const viewModeLabel = await page.locator('#viewModeLabel').textContent();
            expect(viewModeLabel).toBe('Single');

            // .controls (single mode buttons) should be visible
            const controlsVisible = await page.evaluate(
                () => document.querySelector('.controls').style.display === 'flex'
            );
            expect(controlsVisible).toBe(true);

            // Compare controls should be hidden
            const compareControlsHidden = await page.evaluate(
                () => document.querySelector('.compare-controls').style.display !== 'flex'
            );
            expect(compareControlsHidden).toBe(true);

            // compare-mode class should be removed from media container
            const hasCompareClass = await page.evaluate(() =>
                document.querySelector('.media-container').classList.contains('compare-mode')
            );
            expect(hasCompareClass).toBe(false);

            // No stale compare wrapper nodes should remain after the folder switch.
            const wrapperCount = await page.evaluate(
                () => document.querySelectorAll('.left-media-wrapper, .right-media-wrapper').length
            );
            expect(wrapperCount).toBe(0);
        } finally {
            await secondFolder?.cleanup();
        }
    });

    test('compare->single lands on the on-screen compare-left file', async () => {
        // Force an AI-sorted compare state with known scores, bypassing the ML pipeline.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            mv.isSortedByPrediction = true;
            mv.predictionScores = new Map(mv.mediaFiles.map((f, i) => [f.path, 1 - i * 0.1]));
        });
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Advance one pair so the left file is NOT mediaFiles[0].
        await page.evaluate(() => {
            window.mediaViewer.mlComparePairIndex = 1;
            return window.mediaViewer.showCompareMedia();
        });
        await page.waitForTimeout(500);

        const leftName = await page.evaluate(() => window.mediaViewer.compareLeftFile?.name);
        expect(leftName).toBeTruthy();

        // Switch to single mode.
        await page.evaluate(() => window.mediaViewer._applyModeSwitch('single'));
        await waitForMedia(page);

        // currentIndex must point at the former compare-left file.
        const currentName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex]?.name;
        });
        expect(currentName).toBe(leftName);
    });
});
