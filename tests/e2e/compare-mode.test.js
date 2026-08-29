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

        // Wait for the in-flight showMedia() that applyBulkRating triggers to complete
        // before calling handleCancel (it guards on both isLoading and mediaNavigationInProgress).
        await page.waitForFunction(
            () => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress
        );

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

    test('bulk rating and its undo defer the re-render until the REAL ML worker re-scores (D2/D4)', async () => {
        // mlWorker is lazy in production (first AI sort / settings toggle) — bring the real
        // ml-worker.js up explicitly. No stub: the point is that the worker's own replies drive
        // the deferred-refresh protocol.
        await seedLocalStorage(page, { mlPredictionEnabled: 'true' });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await page.evaluate(() => {
            const mv = window.mediaViewer;
            mv.isMlEnabled = true;
            // Deterministic 576-dim vector per path (the model is 64 + 512 dims; a short vector
            // would score NaN).
            mv.getCombinedFeatures = (p) => {
                let h = 0;
                for (const ch of String(p)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
                const v = new Float32Array(576);
                for (let i = 0; i < 576; i++) {
                    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
                    v[i] = (h % 1000) / 1000;
                }
                return v;
            };
            mv.initializeMlWorker();

            // Instrument BEFORE warm-up so every worker exchange is observable: replies (minus
            // 'progress') go to __mlEvents, and scoreAll posts are counted so the test can wait for
            // the worker to be QUIESCENT (every scoreAll answered) before asserting. Warm-up
            // updateComplete replies straggling >100 ms apart re-arm the score debounce, which can
            // leave a second scoreAll in flight after the first reply has already populated
            // predictionScores — its late scoreComplete would then prepend to the event list.
            window.__mlEvents = [];
            window.__scoreAllPosted = 0;
            window.__scoreCompleteSeen = 0;
            const origPost = mv.mlWorker.postMessage.bind(mv.mlWorker);
            mv.mlWorker.postMessage = (m) => {
                if (m.type === 'scoreAll') window.__scoreAllPosted++;
                return origPost(m);
            };
            const origHandle = mv.handleMlWorkerMessage.bind(mv);
            mv.handleMlWorkerMessage = (m) => {
                if (m.type === 'scoreComplete') window.__scoreCompleteSeen++;
                if (m.type !== 'progress') {
                    window.__mlEvents.push(
                        m.type === 'scoreComplete' ? `scoreComplete:${m.scores ? 'scores' : 'null'}` : m.type
                    );
                }
                return origHandle(m);
            };
        });
        await page.waitForFunction(() => window.mediaViewer.mlStats != null); // initComplete
        const samplesBefore = await page.evaluate(() => window.mediaViewer.mlStats.totalSamples);

        // scoreAll replies scores:null until the model has >=3 likes and >=3 dislikes — warm it up.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            for (let i = 0; i < 3; i++) {
                mv.updateMlModelWithFeatures(mv.getCombinedFeatures(`warm-like-${i}`), 'like');
                mv.updateMlModelWithFeatures(mv.getCombinedFeatures(`warm-dislike-${i}`), 'dislike');
            }
        });
        // Quiescence: all six warm-up replies landed, the score debounce is idle, and every scoreAll it
        // posted has been answered (with real scores — the model is ready by then).
        await page.waitForFunction((before) => {
            const mv = window.mediaViewer;
            return (
                mv.mlStats?.isReady === true &&
                mv.mlStats.totalSamples === before + 6 &&
                !mv._scoreDebounceTimer &&
                window.__scoreAllPosted > 0 &&
                window.__scoreCompleteSeen === window.__scoreAllPosted &&
                mv.predictionScores.size >= 2
            );
        }, samplesBefore);

        // Record showMedia() calls too, then start the assertions from a clean event list.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            const origShow = mv.showMedia.bind(mv);
            mv.showMedia = (...args) => {
                window.__mlEvents.push('showMedia');
                return origShow(...args);
            };
            window.__mlEvents.length = 0;
            // Same forced AI-sorted compare state the persistence test uses.
            mv.isCompareMode = true;
            mv.isSortedByPrediction = true;
            mv.compareLeftFile = mv.mediaFiles[0];
            mv.compareRightFile = mv.mediaFiles[1];
        });

        // --- Rating (D2): the window is armed and NOTHING has rendered yet.
        const armed = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            await mv.applyBulkRating('good');
            return {
                pending: mv.pendingCompareRefresh,
                updates: mv.pendingCompareUpdates,
                nav: mv.mediaNavigationInProgress,
                events: [...window.__mlEvents],
            };
        });
        expect(armed.pending).toBe(true);
        expect(armed.updates).toBe(2);
        expect(armed.nav).toBe(true);
        expect(armed.events).not.toContain('showMedia');

        await page.waitForFunction(
            () => !window.mediaViewer.mediaNavigationInProgress && !window.mediaViewer.isLoading
        );
        const settled = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return {
                events: [...window.__mlEvents],
                pending: mv.pendingCompareRefresh,
                updates: mv.pendingCompareUpdates,
                timeout: mv.pendingCompareTimeout,
            };
        });
        // One render, AFTER a scoreComplete that carried real scores — settled by the reply,
        // not by the 3 s fallback (which would leave pendingCompareTimeout non-null until it fired).
        expect(settled.events).toEqual(['updateComplete', 'updateComplete', 'scoreComplete:scores', 'showMedia']);
        expect(settled.pending).toBe(false);
        expect(settled.updates).toBe(0);
        expect(settled.timeout).toBeNull();

        // --- Undo (D4): same protocol, driven by reverseUpdateComplete.
        const undoArmed = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            window.__mlEvents.length = 0;
            await mv.handleCancel();
            return {
                pending: mv.pendingCompareRefresh,
                updates: mv.pendingCompareUpdates,
                nav: mv.mediaNavigationInProgress,
                events: [...window.__mlEvents],
            };
        });
        expect(undoArmed.pending).toBe(true);
        expect(undoArmed.updates).toBe(2);
        expect(undoArmed.nav).toBe(true);
        expect(undoArmed.events).not.toContain('showMedia');

        await page.waitForFunction(
            () => !window.mediaViewer.mediaNavigationInProgress && !window.mediaViewer.isLoading
        );
        const undoSettled = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return {
                events: [...window.__mlEvents],
                pending: mv.pendingCompareRefresh,
                timeout: mv.pendingCompareTimeout,
            };
        });
        expect(undoSettled.events).toEqual([
            'reverseUpdateComplete',
            'reverseUpdateComplete',
            'scoreComplete:scores',
            'showMedia',
        ]);
        expect(undoSettled.pending).toBe(false);
        expect(undoSettled.timeout).toBeNull();
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

        // Dual-sided UI assertion (CLAUDE.md mode-switch convention): single controls shown
        // AND compare controls hidden — guards the UI-state class of regression too.
        const controlsVisible = await page.evaluate(() => document.querySelector('.controls').style.display === 'flex');
        expect(controlsVisible).toBe(true);
        const compareControlsHidden = await page.evaluate(
            () => document.querySelector('.compare-controls').style.display !== 'flex'
        );
        expect(compareControlsHidden).toBe(true);
    });
});
