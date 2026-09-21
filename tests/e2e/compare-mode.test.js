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
        // launchApp() sets no userDataDir, so localStorage survives BOTH across tests and
        // across runs in the real app profile. Any test that writes customShortcuts would
        // otherwise leave every later test — and every later run — with those bindings.
        // The constructor has already read them by now, so reload the shortcut state too.
        await page.evaluate(() => {
            localStorage.removeItem('customShortcuts');
            const mv = window.mediaViewer;
            mv.shortcuts = mv.loadShortcuts();
            mv.shortcutReverseMap = mv.buildReverseMap();
            mv.renderShortcutRows();
            mv.updateSpecialButtonsState();
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

    // Unit tests cover the binding, the reverse map and the executeAction branch, but none of
    // them prove the keydown listener actually reaches them for Digit1 in compare mode. This
    // does: a real key press, through the real dispatch, ending in a file on disk.
    test('moves the left file to the special folder with the 1 key', async () => {
        await seedLocalStorage(page, { customSpecialFolder: tmpFixtures.specialDir });
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        await page.waitForFunction(() => window.mediaViewer.compareLeftFile != null);
        const leftFileName = await page.evaluate(() => window.mediaViewer.compareLeftFile.name);

        await page.keyboard.press('1');
        await page.waitForTimeout(500);

        await expect(access(join(tmpFixtures.specialDir, leftFileName))).resolves.toBeUndefined();
    });

    test('moves the right file to the special folder with the 2 key', async () => {
        await seedLocalStorage(page, { customSpecialFolder: tmpFixtures.specialDir });
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        await page.waitForFunction(() => window.mediaViewer.compareRightFile != null);
        const rightFileName = await page.evaluate(() => window.mediaViewer.compareRightFile.name);

        await page.keyboard.press('2');
        await page.waitForTimeout(500);

        await expect(access(join(tmpFixtures.specialDir, rightFileName))).resolves.toBeUndefined();
    });

    // The tooltip is derived from this.shortcuts, so this asserts the wiring end to end:
    // seedLocalStorage calls updateSpecialButtonsState(), which must append the bound key.
    test('compare special buttons advertise their hotkey in the tooltip', async () => {
        await seedLocalStorage(page, { customSpecialFolder: tmpFixtures.specialDir });
        await expect(page.locator('#leftSpecialBtn')).toHaveAttribute('title', 'Move left to special folder (1)');
        await expect(page.locator('#rightSpecialBtn')).toHaveAttribute('title', 'Move right to special folder (2)');
        // Single mode has no special binding, so its button stays bare.
        await expect(page.locator('#specialBtn')).toHaveAttribute('title', 'Move to special folder');
    });

    // Regression, PR #71 review: Digit1/Digit2 were legal remap targets in compare mode before
    // this feature existed, so a user could already hold "1" for `next`. buildReverseMap is
    // last-write-wins and defaults iterate last, which made the new leftSpecial default steal
    // the key — pressing "1" MOVED A FILE instead of advancing. The constructor already ran by
    // the time a test can seed storage, so re-run the real merge and reverse map in place.
    test('a pre-existing remap onto 1 keeps the key and does not move a file', async () => {
        await seedLocalStorage(page, { customSpecialFolder: tmpFixtures.specialDir });
        await page.evaluate(() => {
            localStorage.setItem(
                'customShortcuts',
                JSON.stringify({
                    version: 2,
                    compare: {
                        leftLike: 'KeyQ',
                        leftDislike: 'KeyW',
                        rightLike: 'KeyE',
                        rightDislike: 'KeyR',
                        next: 'Digit1',
                        previous: 'KeyA',
                        undo: 'Ctrl+KeyA',
                        bothGood: 'KeyD',
                        bothBad: 'KeyF',
                    },
                })
            );
            const mv = window.mediaViewer;
            mv.shortcuts = mv.loadShortcuts();
            mv.shortcutReverseMap = mv.buildReverseMap();
        });

        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);
        await page.waitForFunction(() => window.mediaViewer.compareLeftFile != null);

        const before = await page.evaluate(() => ({
            name: window.mediaViewer.compareLeftFile.name,
            index: window.mediaViewer.currentIndex,
            count: window.mediaViewer.mediaFiles.length,
        }));

        await page.keyboard.press('1');
        await page.waitForTimeout(600);

        // The user's own binding still wins: "1" navigates, and nothing left the source folder.
        await expect(access(join(tmpFixtures.specialDir, before.name))).rejects.toThrow();
        const after = await page.evaluate(() => ({
            index: window.mediaViewer.currentIndex,
            count: window.mediaViewer.mediaFiles.length,
        }));
        expect(after.count).toBe(before.count);
        expect(after.index).not.toBe(before.index);

        // ...and the action that lost the race is reported as unbound, not silently missing.
        const leftSpecialKey = await page.evaluate(() => window.mediaViewer.shortcuts.compare.leftSpecial);
        expect(leftSpecialKey).toBeNull();

        await page.evaluate(() => localStorage.removeItem('customShortcuts'));
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

    test('bulk rating and its undo render immediately against a REAL ML worker — no online-update messages posted (G1)', async () => {
        // mlWorker is lazy in production (first AI sort / settings toggle) — bring the real
        // ml-worker.js up explicitly and warm it to a trained, ready state via the SAME
        // trainHistorical round trip ensureTrainedModel uses in production (Task 6's
        // _runWorkerTraining) — the per-rating online update that used to warm a model up here is
        // gone (G1): the renderer no longer posts 'update'/'reverseUpdate' (Task 7), and the
        // worker no longer even has handlers for them (Task 8) — either message now comes back as
        // an 'error' ("Unknown message type"). Using a REAL worker (not a stub) proves a negative
        // against it: a bulk rating and its undo must post NEITHER 'update' NOR 'reverseUpdate' —
        // even though a live, warmed-up worker is sitting right there and ready to receive
        // whatever the renderer sends it.
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

            // Instrument BEFORE warm-up. __postedTypes records every message type actually POSTED
            // to the worker — this is what proves the online-update senders are gone (a stale
            // sender would show up here even if its reply arrived too late for anything else to
            // observe).
            window.__postedTypes = [];
            window.__showMediaCalls = 0;
            const origPost = mv.mlWorker.postMessage.bind(mv.mlWorker);
            mv.mlWorker.postMessage = (m) => {
                window.__postedTypes.push(m.type);
                return origPost(m);
            };
            const origShow = mv.showMedia.bind(mv);
            mv.showMedia = (...args) => {
                window.__showMediaCalls++;
                return origShow(...args);
            };
        });
        await page.waitForFunction(() => window.mediaViewer.mlStats != null); // initComplete

        // Warm up via _runWorkerTraining (trainHistorical): resets the model and full-batch
        // trains it on 3 likes + 3 dislikes, exactly like ensureTrainedModel does. scoreAll
        // replies scores:null until the model has >=3 likes and >=3 dislikes.
        await page.evaluate(async () => {
            const mv = window.mediaViewer;
            const likedFeatures = [0, 1, 2].map((i) => Array.from(mv.getCombinedFeatures(`warm-like-${i}`)));
            const dislikedFeatures = [0, 1, 2].map((i) => Array.from(mv.getCombinedFeatures(`warm-dislike-${i}`)));
            await mv._runWorkerTraining(likedFeatures, dislikedFeatures, 1);
        });
        // trainComplete sets mlStats synchronously and fires requestPredictionScores() in the same
        // turn, so only the scoreAll round trip (predictionScores population) is left to wait for.
        await page.waitForFunction(() => {
            const mv = window.mediaViewer;
            return mv.mlStats?.isReady === true && mv.mlStats.totalSamples === 6 && mv.predictionScores.size >= 2;
        });

        // Start the assertions from a clean slate — the warm-up's own posts don't count.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            window.__postedTypes.length = 0;
            window.__showMediaCalls = 0;
            // Same forced AI-sorted compare state the persistence test uses.
            mv.isCompareMode = true;
            mv.isSortedByPrediction = true;
            mv.compareLeftFile = mv.mediaFiles[0];
            mv.compareRightFile = mv.mediaFiles[1];
        });

        // --- Rating (G1): renders immediately, with no 'update' message posted to the (real,
        // ready, warmed-up) worker. "Immediately" is checked synchronously, not by waiting and
        // seeing whether it eventually settles: applyBulkRating's showMedia() call is NOT awaited
        // (fire-and-forget), so a reintroduced deferred window would instead arm
        // pendingCompareRefresh and call showMedia() only later, from scoreComplete — and against
        // an already-warmed real worker that round trip can easily land inside a multi-second
        // wait too, so a wait alone would not catch the regression. The decisive check is that
        // showMedia() has ALREADY been invoked (and its render already under way) by the time
        // applyBulkRating() itself resolves, in the very same turn.
        const immediatelyAfterRating = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            await mv.applyBulkRating('good');
            return { showMediaCalls: window.__showMediaCalls, navInProgress: mv.mediaNavigationInProgress };
        });
        expect(immediatelyAfterRating.showMediaCalls).toBe(1); // invoked synchronously, not deferred
        expect(immediatelyAfterRating.navInProgress).toBe(true); // its render is already under way

        await page.waitForFunction(
            () => !window.mediaViewer.mediaNavigationInProgress && !window.mediaViewer.isLoading,
            null,
            { timeout: 2000 } // comfortably under the old 3 s deferred-refresh fallback
        );
        const afterRating = await page.evaluate(() => ({
            posted: [...window.__postedTypes],
            showMediaCalls: window.__showMediaCalls,
        }));
        // applyBulkRating never re-scores (it doesn't touch the model at all any more), so
        // nothing is posted to the worker for a rating — not even a scoreAll.
        expect(afterRating.posted).toEqual([]);
        expect(afterRating.showMediaCalls).toBe(1); // still just the one render — no second, deferred one

        // --- Undo (G1): same immediate-render contract, but handleCancel's bulk-undo branch DOES
        // call requestPredictionScores() (must-NOT-delete item 3: badges/pair-selection still
        // re-score) and, unlike applyBulkRating, DOES `await showMedia()`. That await settles once
        // showCompareMedia()'s own async steps finish (file-exists checks, DOM setup) — NOT once
        // the image has visually finished loading: that happens later, in the <img> 'load' event
        // listener (setupCompareImageHandlers), which is where mediaNavigationInProgress actually
        // clears. So navInProgress is still true here too, same as the rating side above; the
        // decisive signal remains showMediaCalls (0 in a reintroduced deferred window, since
        // handleCancel would resolve immediately via _beginDeferredCompareRefresh instead).
        const immediatelyAfterUndo = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            window.__postedTypes.length = 0;
            window.__showMediaCalls = 0;
            await mv.handleCancel();
            return { showMediaCalls: window.__showMediaCalls, navInProgress: mv.mediaNavigationInProgress };
        });
        expect(immediatelyAfterUndo.showMediaCalls).toBe(1); // invoked (and awaited) synchronously
        expect(immediatelyAfterUndo.navInProgress).toBe(true); // render started; not yet visually complete

        await page.waitForFunction(
            () => !window.mediaViewer.mediaNavigationInProgress && !window.mediaViewer.isLoading,
            null,
            { timeout: 2000 }
        );
        const afterUndo = await page.evaluate(() => ({
            posted: [...window.__postedTypes],
            showMediaCalls: window.__showMediaCalls,
        }));
        // Positive control: requestPredictionScores() must actually have posted a scoreAll, not
        // merely be absent from a list that would also be empty if the call were silently dropped.
        expect(afterUndo.posted).toContain('scoreAll');
        expect(afterUndo.posted).not.toContain('update');
        expect(afterUndo.posted).not.toContain('reverseUpdate');
        expect(afterUndo.showMediaCalls).toBe(1);
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
