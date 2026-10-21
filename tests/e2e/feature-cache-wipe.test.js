import { test, expect } from '@playwright/test';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    seedLocalStorage,
    createTempFixtureDir,
} from './helpers/electron-app.js';

// The everyday version of the feature-cache wipe (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md
// § 3, T3): an AI sort starts the feature pool and its autosave for the session; another folder is then opened and
// browsed, and its cache, which this session never read, is saved over with the few files viewed.

const CACHE_FILE = '.feature_cache.json';
const MEDIA = /\.(png|jpe?g|gif|webp|bmp|mp4|webm|jxl)$/i;

/** Force ML prediction on and CLIP off for the live instance (as tests/e2e/ml-retrain-skip.test.js does). */
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

/** The folder's media files, by name. */
async function mediaNames(dir) {
    return (await readdir(dir, { withFileTypes: true }))
        .filter((d) => d.isFile() && MEDIA.test(d.name))
        .map((d) => d.name)
        .sort();
}

/** Writes a valid v4 cache for every media file in `dir`, with its real size and mtime, as the app would. */
async function seedFeatureCache(dir) {
    const features = {};
    for (const name of await mediaNames(dir)) {
        const s = await stat(join(dir, name));
        features[name] = { vector: Array(64).fill(0.1), clipVector: null, size: s.size, mtime: s.mtimeMs };
    }
    await writeFile(join(dir, CACHE_FILE), JSON.stringify({ version: 4, featureDim: 64, clipDim: 512, features }));
}

async function cachedNames(dir) {
    const parsed = JSON.parse(await readFile(join(dir, CACHE_FILE), 'utf-8'));
    return Object.keys(parsed.features).sort();
}

async function waitForRenderIdle(page) {
    await page.waitForFunction(() => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress);
}

test.describe('Feature cache wipe', () => {
    let electronApp, page, srcA, srcB, likes, dislikes;

    test.beforeEach(async () => {
        srcA = await createTempFixtureDir();
        srcB = await createTempFixtureDir();
        await srcB.addFile('b4.png');
        await srcB.addFile('b5.png');
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
            if (dir) {
                await dir.cleanup().catch(() => {});
            }
        }
    });

    test.fail("browsing another folder after an AI sort leaves that folder's cache whole", async () => {
        await seedFeatureCache(srcB.dir);
        const bNames = await mediaNames(srcB.dir);
        expect(bNames.length).toBeGreaterThanOrEqual(5);
        expect(await cachedNames(srcB.dir)).toEqual(bNames);

        // The AI sort in A starts the feature pool and, with it, the 30 s autosave.
        await loadFolder(page, srcA.dir);
        await waitForMedia(page);
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
        expect(await page.evaluate(() => window.mediaViewer.isSortedByPrediction)).toBe(true);
        expect(await page.evaluate(() => window.mediaViewer.featureWorkers.length)).toBeGreaterThan(0);

        // Open B and browse: each render extracts the file on screen 200 ms later.
        await loadFolder(page, srcB.dir);
        await waitForMedia(page);
        await waitForRenderIdle(page);
        await page.waitForTimeout(500);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForRenderIdle(page);
        await page.waitForTimeout(500);

        // What the next autosave tick would do.
        await page.evaluate(() => window.mediaViewer.saveFeatureCache());

        expect(await cachedNames(srcB.dir)).toEqual(bNames);
    });
});
