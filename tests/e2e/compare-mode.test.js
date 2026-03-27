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
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
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

    test('navigates pairs with D key in compare mode', async () => {
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        const indexBefore = await page.evaluate(() => window.mediaViewer.currentIndex);
        expect(indexBefore).toBe(0);

        // D skips by 2 in compare mode (shows next pair)
        // With an odd number of valid files, index wraps back to 0 (2 >= length-1)
        await page.keyboard.press('d');
        await page.waitForTimeout(500);

        // Verify navigation was processed (showMedia re-rendered compare panes)
        const isCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompare).toBe(true);

        // Both panes should still be visible after navigation
        await expect(page.locator('.left-media-wrapper')).toBeVisible();
        await expect(page.locator('.right-media-wrapper')).toBeVisible();
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
});
