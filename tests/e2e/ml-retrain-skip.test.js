import { test, expect } from '@playwright/test';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    seedLocalStorage,
    createTempFixtureDir,
} from './helpers/electron-app.js';

// The properties that matter, stated as behaviour rather than as internals:
//   1. switching only the SOURCE folder must NOT re-enter the training phase — the training set
//      (like/dislike folders + bulk ratings) is unchanged, so a repeat sort must be free.
//   2. changing the LIKE folder MUST re-enter it. This is the one that proves retraining was not
//      simply disabled: before the ml-training-pipeline work, a folder with a warm
//      .ml_model.json never retrained no matter how many files were added to like/dislike.
//   3. the Settings "Rebuild model" control (this task's escape hatch) forces a retrain even when
//      the session is warm — the only way to recover from a fingerprint that ever misses an
//      input, short of touching a training folder.
//   4. the fingerprint-keyed model cache on disk survives an app restart. This is the only test
//      in the suite that drives main.js's read-ml-model-cache / write-ml-model-cache handlers
//      through their real fs.readFile/JSON.parse/fs.writeFile/fs.rename path.

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

/**
 * Pre-warm the ML worker and feature-worker pool, and wait for their version handshakes to
 * land, BEFORE taking any training-source measurement.
 *
 * Root cause this works around: initializeMlWorker() posts {type:'init'} and
 * initializeFeaturePool() posts {type:'getVersion'} both fire-and-forget (never awaited); their
 * replies populate this._mlWorkerVersions.{mlModelVersion,trainingConfigVersion} and
 * this._featureExtractorVersion asynchronously, whenever the workers get around to it. Those
 * three fields are DESCRIPTOR_KEYS inputs (see ml-training.js buildDescriptor), so the very
 * first ensureTrainedModel() call in a session can fingerprint against their {0,0,0} defaults
 * while a LATER call in the same session — after the replies have had time to arrive —
 * fingerprints against the real {3,_,1}. That alone changes the fingerprint between two calls
 * with an otherwise byte-identical training set, independent of anything this suite is actually
 * testing. It reproduced as a real, non-deterministic failure of the 'a source-folder switch
 * does not re-enter the training phase' test under the load of the full 60-test suite (passed
 * in isolation, failed embedded) — confirmed by reading
 * initializeMlWorker/initializeFeaturePool/getConfig, not guessed. Waiting for both replies to
 * land before the FIRST measurement makes every later descriptor in the session use the same,
 * already-settled version numbers, which is the steady state these tests are actually about.
 * This does not touch the race itself (out of scope for Task 9 — see main.js/ml-worker.js in
 * the task's scope limit); it only makes the test's starting conditions deterministic.
 */
async function warmMlWorkers(page) {
    await page.evaluate(() => {
        const viewer = window.mediaViewer;
        if (!viewer.mlWorker) viewer.initializeMlWorker();
        if (viewer.featureWorkers.length === 0) viewer.initializeFeaturePool();
    });
    await page.waitForFunction(
        () =>
            window.mediaViewer._mlWorkerVersions.mlModelVersion !== 0 &&
            window.mediaViewer._featureExtractorVersion !== 0
    );
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
        await warmMlWorkers(page);
        await installTrainingProbe(page);

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // Only the VIEWED folder changes; likes/dislikes (the training set) do not.
        await loadFolder(page, srcB.dir);
        await waitForMedia(page);
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 2);

        // This is the reported bug: a source-folder switch alone must be a free session hit.
        expect(await page.evaluate(() => window.__trainSources[1])).toBe('session');
    });

    test('a changed like folder does re-enter the training phase', async () => {
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await warmMlWorkers(page);
        await installTrainingProbe(page);

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // Mutate the training set itself — this must change the fingerprint.
        await likes.addFile('extra-like.png');

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction()); // toggle off
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction()); // sort again
        await page.waitForFunction(() => window.__trainSources.length === 2);

        const sources = await page.evaluate(() => window.__trainSources);
        expect(sources).toHaveLength(2);
        expect(sources[1]).toBe('trained');
    });

    test('Rebuild model forces a retrain even though the session was warm', async () => {
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await warmMlWorkers(page);
        await installTrainingProbe(page);

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('trained');

        // Toggle off, then sort again with NOTHING changed, to prove the session is genuinely
        // warm — the same property Test 1 exercises. Only then does a 'trained' result after the
        // Rebuild click below mean the CLICK caused it, rather than an incidental fingerprint
        // change or a cache that was never actually populated.
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 2);
        expect(await page.evaluate(() => window.__trainSources[1])).toBe('session');

        // Toggle off so the next handleSortByPrediction() performs a real sort, not a restore.
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());

        await page.keyboard.press('F1');
        const rebuildBtn = page.locator('#rebuildModelBtn');
        await rebuildBtn.waitFor({ state: 'visible' });
        await rebuildBtn.click();
        // The click handler is async (invalidateModelCache does a real IPC round trip); wait for
        // its own completion signal rather than assuming the click resolved before it finished.
        await page.locator('.notification').filter({ hasText: 'rebuild' }).waitFor({ state: 'visible' });
        await page.keyboard.press('F1'); // close the help overlay again

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 3);

        const sources = await page.evaluate(() => window.__trainSources);
        expect(sources[2]).toBe('trained');
    });

    test('a model-cache hit survives an app restart', async () => {
        test.setTimeout(60_000); // this test launches Electron twice

        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await warmMlWorkers(page);
        await installTrainingProbe(page);

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 1);
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
        await warmMlWorkers(page);
        await installTrainingProbe(page);

        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        await page.waitForFunction(() => window.__trainSources.length === 1);
        expect(await page.evaluate(() => window.__trainSources[0])).toBe('model-cache');
    });
});
