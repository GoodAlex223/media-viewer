import { test, expect } from '@playwright/test';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    waitForNotification,
    seedLocalStorage,
    createTempFixtureDir,
} from './helpers/electron-app.js';

// The properties that matter, stated as behaviour rather than as internals:
//   1. switching only the SOURCE folder must NOT re-enter the training phase — the training set
//      (like/dislike folders + bulk ratings) is unchanged, so a repeat sort must be free.
//   2. changing the LIKE folder MUST re-enter it. This is the one that proves retraining was not
//      simply disabled: before the ml-training-pipeline work, a folder with a warm
//      .ml_model.json never retrained no matter how many files were added to like/dislike.
//   3. bulk-rating a file in the SOURCE folder MUST also re-enter it, and the effect must revert
//      correctly on folder switch. This is the source folder's one legitimate route into the
//      descriptor (bulkRated) — without covering it, Property 1 alone is satisfiable by a
//      fingerprint that ignores the source folder entirely (or is constant), since every other
//      test here keeps bulkRated empty throughout.
//   4. the Settings "Rebuild model" control (this task's escape hatch) forces a retrain even when
//      the session is warm — the only way to recover from a fingerprint that ever misses an
//      input, short of touching a training folder.
//   5. the fingerprint-keyed model cache on disk survives an app restart. This is the only test
//      in the suite that drives main.js's read-ml-model-cache / write-ml-model-cache handlers
//      through their real fs.readFile/JSON.parse/fs.writeFile/fs.rename path.
//
// NOTE on shared state: this app has no --user-data-dir test isolation. Every 'trained' sort in
// this file writes a real entry to the developer's own <userData>/ml-model-cache.json (capped at
// MlTrainingManager.MODEL_CACHE_LIMIT = 5 entries, oldest evicted) and to the real localStorage.
// Each fixture directory is `mkdtemp`-randomized per run, so every fingerprint here is novel —
// there is no collision risk with other test files or with a developer's own real usage, only a
// bounded, harmless accumulation of stale entries referencing now-deleted temp folders.
//
// NOTE on the version-handshake race: an earlier version of this file worked around a real
// pre-existing race (initializeMlWorker/initializeFeaturePool's fire-and-forget version-probe
// replies feeding ensureTrainedModel's fingerprint) with a `warmMlWorkers` test helper that
// pre-warmed both handshakes before ever calling handleSortByPrediction. That race is now closed
// in production code: handleSortByPrediction's lazy-init block awaits both handshakes directly
// (see media-viewer.js), and ml-training.js's `versionsKnown` gate is the belt-and-suspenders
// half (closes the read side too, which awaiting alone would not — see its own comment). With the
// root cause fixed, `warmMlWorkers` was removed rather than kept: every test below now exercises
// handleSortByPrediction's actual cold-start lazy-init path on its first sort, which is the path
// the race lived in and the one a regression there would need to be caught on.

/**
 * Force ML prediction on and CLIP off for the CURRENT live instance. seedLocalStorage only
 * writes localStorage and syncs the three folder keys onto the instance (see its own doc
 * comment) — enableClipFeatures/isMlEnabled are read once at construction time and are never
 * re-synced. This app's localStorage and ml-model-cache.json are both real, persistent,
 * unscoped per-test state (no --user-data-dir isolation), so a value left over from a previous
 * run or from ordinary manual use of the app would otherwise leak in here. Mirrors the verified
 * pattern in clip-graceful-degradation.test.js.
 */
async function seedTrainingState(page, likeDir, dislikeDir) {
    await seedLocalStorage(page, {
        customLikeFolder: likeDir,
        customDislikeFolder: dislikeDir,
        mlPredictionEnabled: 'true',
        enableClipFeatures: 'false',
    });
    await page.evaluate(() => {
        window.mediaViewer.isMlEnabled = true;
        window.mediaViewer.enableClipFeatures = false;
    });
}

/** Record every source ensureTrainedModel actually resolved to, by tapping the manager. */
async function installTrainingProbe(page) {
    await page.evaluate(() => {
        window.__trainSources = [];
        const mgr = window.mediaViewer.mlTraining;
        const original = mgr.ensureTrainedModel.bind(mgr);
        mgr.ensureTrainedModel = async (opts) => {
            const res = await original(opts);
            window.__trainSources.push(res.source);
            return res;
        };
    });
}

/** Sort, wait for the probe to record one more entry, and confirm a real sort completed (not
 *  just that ensureTrainedModel was tapped) — isSortedByPrediction only flips once
 *  mlStats.isReady gates pass, which requires the >=3-like/>=3-dislike fixtures this suite uses.
 *  Without this check, a change to the default fixture count would fail as an opaque
 *  waitForFunction timeout later, rather than here with a clear assertion. */
async function sortAndConfirmCompleted(page, expectedLength) {
    await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
    await page.waitForFunction((n) => window.__trainSources.length === n, expectedLength);
    expect(await page.evaluate(() => window.mediaViewer.isSortedByPrediction)).toBe(true);
}

test.describe('ML retrain skip', () => {
    let electronApp, page, srcA, srcB, likes, dislikes;

    test.beforeEach(async () => {
        srcA = await createTempFixtureDir();
        srcB = await createTempFixtureDir();
        likes = await createTempFixtureDir();
        dislikes = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());
        await seedTrainingState(page, likes.dir, dislikes.dir);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        for (const dir of [srcA, srcB, likes, dislikes]) {
            if (dir) await dir.cleanup().catch(() => {});
        }
    });

    test('a source-folder switch does not re-enter the training phase', async () => {
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await installTrainingProbe(page);

        await sortAndConfirmCompleted(page, 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // Only the VIEWED folder changes; likes/dislikes (the training set) do not.
        await loadFolder(page, srcB.dir);
        await waitForMedia(page);
        await sortAndConfirmCompleted(page, 2);

        // This is the reported bug: a source-folder switch alone must be a free session hit.
        expect(await page.evaluate(() => window.__trainSources[1])).toBe('session');
    });

    test('a changed like folder does re-enter the training phase', async () => {
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await installTrainingProbe(page);

        await sortAndConfirmCompleted(page, 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // Mutate the training set itself — this must change the fingerprint.
        await likes.addFile('extra-like.png');

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction()); // toggle off
        await sortAndConfirmCompleted(page, 2); // sort again

        const sources = await page.evaluate(() => window.__trainSources);
        expect(sources).toHaveLength(2);
        expect(sources[1]).toBe('trained');
    });

    test('a bulk rating in the source folder re-enters the training phase, and reverts on folder switch', async () => {
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await installTrainingProbe(page);

        await sortAndConfirmCompleted(page, 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // The source folder's ONE legitimate route into the descriptor is `bulkRated` (corrective
        // ratings, which stay in the source folder rather than moving to like/dislike). Set one
        // directly and persist it exactly as the real bulk-rate UI does (saveBulkRatedFile),
        // rather than driving compare mode — this test is about the fingerprint's sensitivity to
        // that channel, not about the bulk-rating feature itself (covered elsewhere).
        await page.evaluate(async () => {
            const f = window.mediaViewer.mediaFiles[0];
            window.mediaViewer.bulkRated.set(f.name, 'good');
            await window.mediaViewer.saveBulkRatedFile();
        });

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction()); // toggle off
        await sortAndConfirmCompleted(page, 2); // sort again
        expect(await page.evaluate(() => window.__trainSources[1])).toBe('trained');

        // Reloading the SAME folder re-hydrates `bulkRated` from the .bulk_rated.json just
        // written (loadFolder -> loadBulkRatedFile rehydrates per CURRENT folder on every call) —
        // an identical descriptor, so this must still be free. Property 1 (folder reload is free)
        // must hold with a populated, persisted bulkRated in the picture, not only an empty one.
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await sortAndConfirmCompleted(page, 3);
        expect(await page.evaluate(() => window.__trainSources[2])).toBe('session');

        // Switching to a folder that was never bulk-rated drops bulkRated back to empty
        // (loadBulkRatedFile hydrates from THAT folder's own, nonexistent .bulk_rated.json) —
        // reverting the descriptor to what it was on the very first sort above, which that sort
        // already cached to disk. Not 'session' (sessionFingerprint is currently the bulk-rated
        // one) and not a fresh 'trained' (the original entry is still on disk) — 'model-cache'.
        await loadFolder(page, srcB.dir);
        await waitForMedia(page);
        await sortAndConfirmCompleted(page, 4);
        expect(await page.evaluate(() => window.__trainSources[3])).toBe('model-cache');
    });

    test('Rebuild model forces a retrain even though the session was warm', async () => {
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await installTrainingProbe(page);

        await sortAndConfirmCompleted(page, 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // Toggle off, then sort again with NOTHING changed, to prove the session is genuinely
        // warm — the same property Test 1 exercises. Only then does a 'trained' result after the
        // Rebuild click below mean the CLICK caused it, rather than an incidental fingerprint
        // change or a cache that was never actually populated.
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await sortAndConfirmCompleted(page, 2);
        expect(await page.evaluate(() => window.__trainSources[1])).toBe('session');

        // Toggle off so the next handleSortByPrediction() performs a real sort, not a restore.
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());

        await page.keyboard.press('F1');
        const rebuildBtn = page.locator('#rebuildModelBtn');
        await rebuildBtn.waitFor({ state: 'visible' });
        await rebuildBtn.click();
        // The click handler is async (invalidateModelCache does a real IPC round trip); wait for
        // its own completion signal rather than assuming the click resolved before it finished.
        // Filters on the SUCCESS message specifically ('Prediction model cleared') — a bare
        // 'rebuild' substring also matches ensureTrainedModel's own unrelated non-cacheable
        // warning ("...it will rebuild next sort"), which would either resolve on the wrong
        // notification (a false pass) or trip Playwright strict mode if both were ever present
        // (a false failure).
        await waitForNotification(page, 'Prediction model cleared');
        await page.keyboard.press('F1'); // close the help overlay again

        await sortAndConfirmCompleted(page, 3);
        const sources = await page.evaluate(() => window.__trainSources);
        expect(sources[2]).toBe('trained');
    });

    test('a model-cache hit survives an app restart', async () => {
        test.setTimeout(60_000); // this test launches Electron twice

        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await installTrainingProbe(page);

        await sortAndConfirmCompleted(page, 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // Restart the app entirely. A fresh renderer means a fresh, empty sessionFingerprint, so
        // the only way the next call can come back as anything but a full rebuild is a genuine
        // read of main.js's read-ml-model-cache handler finding the entry the 'trained' call
        // above wrote via write-ml-model-cache — the real fs.readFile/JSON.parse and
        // fs.writeFile/fs.rename path, not a mock.
        await closeApp(electronApp);
        ({ electronApp, page } = await launchApp());
        await seedTrainingState(page, likes.dir, dislikes.dir);
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await installTrainingProbe(page);

        await sortAndConfirmCompleted(page, 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('model-cache');
    });
});
