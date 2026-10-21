import { test, expect } from '@playwright/test';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    seedLocalStorage,
    createTempFixtureDir,
} from './helpers/electron-app.js';

// The feature-cache wipe (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md).
// - The everyday trigger (§ 3, T3): an AI sort starts the feature pool and its autosave for the session; another folder
//   is then opened and browsed. Before the fix its cache, which the session never read, was saved over with the few
//   files viewed (5 cached names became 2 on main).
// - Main's second line of defence (§ 7.2), driven through window.electronAPI the way the renderer drives it.

const CACHE_FILE = '.feature_cache.json';
// The app's own rule (review #12: a copied regex listed .bmp and left out .mov).
const { isMediaFile } = createRequire(import.meta.url)('../../media-formats.js');

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
        .filter((d) => d.isFile() && isMediaFile(extname(d.name).toLowerCase()))
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

    test("browsing another folder after an AI sort leaves that folder's cache whole", async () => {
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

test.describe("Main's feature-cache rules", () => {
    let electronApp, page, folder;

    // Each test starts from a granted folder of 5 media files whose cache, written from Node, holds all 5.
    test.beforeEach(async () => {
        folder = await createTempFixtureDir();
        await folder.addFile('d4.png');
        await folder.addFile('d5.png');
        await seedFeatureCache(folder.dir);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, folder.dir);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (folder) {
            await folder.cleanup().catch(() => {});
        }
    });

    const header = (over = {}) => ({
        version: 4,
        featureDim: 64,
        clipDim: 512,
        fileCount: 5,
        clipRequired: false,
        ...over,
    });

    /** Cache entries for the named files, with their real size and mtime, as the renderer sends them. */
    async function entriesFor(names) {
        const out = [];
        for (const name of names) {
            const s = await stat(join(folder.dir, name));
            out.push([name, { vector: Array(64).fill(0.2), clipVector: null, size: s.size, mtime: s.mtimeMs }]);
        }
        return out;
    }

    /** One streamed save through the bridge: write-open, one chunk, write-close. */
    function writeThroughMain(hdr, entries) {
        return page.evaluate(
            async (args) => {
                const api = window.electronAPI;
                const opened = await api.featureCacheWriteOpen(args.dir, args.header);
                if (!opened.success) {
                    return { opened };
                }
                await api.featureCacheWriteChunk(args.entries);
                return { opened, closed: await api.featureCacheWriteClose() };
            },
            { dir: folder.dir, header: hdr, entries }
        );
    }

    const tmpLeft = async () => (await readdir(folder.dir)).includes(`${CACHE_FILE}.tmp`);

    test('main refuses a partial write to a cache it never saw', async () => {
        const before = await readFile(join(folder.dir, CACHE_FILE), 'utf-8');
        const names = await mediaNames(folder.dir);
        const { closed } = await writeThroughMain(header(), await entriesFor(names.slice(0, 1)));
        expect(closed).toEqual({ success: false, refused: 'unseen', seen: null, written: 1 });
        expect(await readFile(join(folder.dir, CACHE_FILE), 'utf-8')).toBe(before);
        expect(await tmpLeft()).toBe(false);
    });

    test('main allows a write that covers every file without a read', async () => {
        const names = await mediaNames(folder.dir);
        const { closed } = await writeThroughMain(header(), await entriesFor(names));
        expect(closed).toEqual({ success: true, written: 5 });
        expect(await cachedNames(folder.dir)).toEqual(names);
    });

    test('main refuses a shrink after a read', async () => {
        const before = await readFile(join(folder.dir, CACHE_FILE), 'utf-8');
        const opened = await page.evaluate(async (dir) => {
            const res = await window.electronAPI.featureCacheOpen(dir);
            await window.electronAPI.featureCacheClose();
            return res;
        }, folder.dir);
        expect(opened).toEqual({ success: true, version: 4, count: 5 });
        const names = await mediaNames(folder.dir);
        const { closed } = await writeThroughMain(header(), await entriesFor(names.slice(0, 1)));
        expect(closed).toEqual({ success: false, refused: 'shrink', seen: 5, written: 1 });
        expect(await readFile(join(folder.dir, CACHE_FILE), 'utf-8')).toBe(before);
        expect(await tmpLeft()).toBe(false);
    });

    test('a corrupt cache file opens as corrupt and may be replaced', async () => {
        await writeFile(join(folder.dir, CACHE_FILE), '{"version":4,"features":{"red-1x1.png":{"vector":[0.1');
        const opened = await page.evaluate(async (dir) => {
            const res = await window.electronAPI.featureCacheOpen(dir);
            await window.electronAPI.featureCacheClose();
            return res;
        }, folder.dir);
        expect(opened).toMatchObject({ success: false, corrupt: true });
        const names = await mediaNames(folder.dir);
        const { closed } = await writeThroughMain(header(), await entriesFor(names.slice(0, 1)));
        expect(closed).toEqual({ success: true, written: 1 });
        expect(await cachedNames(folder.dir)).toEqual(names.slice(0, 1));
    });

    test('a temp file main cannot create fails the save, and the next read still answers (review #3)', async () => {
        // A directory at the temp path: the open fails (EISDIR), as on a read-only share or a full disk. Before, the
        // error was uncaught in main and write-chunk waited for a 'drain' that never came.
        await mkdir(join(folder.dir, `${CACHE_FILE}.tmp`));
        const names = await mediaNames(folder.dir);
        const entries = await entriesFor(names);
        const result = await Promise.race([
            writeThroughMain(header(), entries),
            new Promise((resolve) => setTimeout(() => resolve('hung'), 5000)),
        ]);
        expect(result).not.toBe('hung');
        expect(result.opened).toMatchObject({ success: false });
        const opened = await page.evaluate(async (dir) => {
            const res = await window.electronAPI.featureCacheOpen(dir);
            await window.electronAPI.featureCacheClose();
            return res;
        }, folder.dir);
        expect(opened).toMatchObject({ success: true, count: 5 });
    });

    test('a write-open without fileCount is refused', async () => {
        const { opened } = await writeThroughMain(header({ fileCount: undefined }), []);
        expect(opened.success).toBe(false);
        expect(opened.error).toContain('fileCount');
        expect(await tmpLeft()).toBe(false);
    });
});
