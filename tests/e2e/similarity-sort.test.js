import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, seedLocalStorage, createTempFixtureDir } from './helpers/electron-app.js';

// G2 PR 1: the similarity sort's end. A run the user acted during ends with a sticky "Show" instead of moving
// them; Cancel keeps the finished hashes and leaves the list alone; a folder switch makes a running sort stale.

// Holds hash result 2 and later on a gate the test opens, so a run stays mid-hash for as long as the test needs.
// Result 1 goes through, so a Cancel has one finished hash to keep. Since G2 PR 2 the run hashes through a pool, so
// the gate wraps each pool's hashFiles (whatever route a result came by) as an async generator that iterates the
// real one: the consumer's return() reaches the real generator, and the pool stops.
async function gateHashing(page) {
    await page.evaluate(() => {
        const viewer = window.mediaViewer;
        const createPool = viewer._createHashPool.bind(viewer);
        let open;
        window.__hashGate = new Promise((resolve) => {
            open = resolve;
        });
        window.__openHashGate = () => open();
        window.__hashCalls = 0;
        viewer._createHashPool = () => {
            const pool = createPool();
            const hashFiles = pool.hashFiles.bind(pool);
            pool.hashFiles = async function* (paths, options) {
                for await (const result of hashFiles(paths, options)) {
                    window.__hashCalls++;
                    if (window.__hashCalls === 1) {
                        // Which file finishes first is the pool's order, not the folder's: tests that need to
                        // know the file the gate let through read it from here.
                        window.__firstHashedPath = result.path;
                    }
                    if (window.__hashCalls >= 2) {
                        await window.__hashGate;
                    }
                    yield result;
                }
            };
            return pool;
        };
    });
}

// Starts a run and does not wait for it.
async function startSort(page) {
    await page.evaluate(() => {
        window.__sortDone = window.mediaViewer.handleSortBySimilarity();
    });
}

async function finishSort(page) {
    await page.evaluate(async () => {
        window.__openHashGate();
        await window.__sortDone;
    });
}

async function waitForIdle(page) {
    await page.waitForFunction(() => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress);
}

async function waitForHashCalls(page, n) {
    await page.waitForFunction((count) => window.__hashCalls >= count, n);
}

const listedPaths = (page) => page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => f.path));
const listedNames = (page) =>
    page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => window.electronAPI.path.basename(f.path)));

test.describe('Similarity sort: Show, Cancel and folder switch', () => {
    let electronApp, page, tmpFixtures, otherFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
        if (otherFixtures) {
            await otherFixtures.cleanup();
            otherFixtures = null;
        }
    });

    const offerLocator = () => page.locator('.notification.sticky', { hasText: 'Similarity order ready' });

    test('a run the user waited for applies at once', async () => {
        await page.evaluate(() => window.mediaViewer.handleSortBySimilarity());

        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
    });

    // T6: showMedia() returns early on isLoading, so a restore committed mid-render would leave the screen on the
    // sorted first file while the list and the cursor are on the folder's first file.
    test('Restore Order pressed during a render restores only after the render, and the screen shows the restored first file', async () => {
        // The file on screen, as a basename (the src probe of tournament-mode.test.js's screenState).
        const shownName = () =>
            page.evaluate(() => {
                const src = window.mediaViewer.currentMedia?.getAttribute('src');
                return src ? decodeURIComponent(String(src)).split(/[\\/]/).pop() : null;
            });
        const folderFirst = await page.evaluate(() => window.mediaViewer.mediaFiles[0].name);

        // Start the sort from the second file, so the sorted first file differs from the folder's first file.
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForIdle(page);
        await gateHashing(page);
        await startSort(page);
        await finishSort(page);
        await waitForIdle(page);
        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);
        const sortedFirst = await page.evaluate(() => window.mediaViewer.mediaFiles[0].name);
        expect(sortedFirst).not.toBe(folderFirst);
        await expect.poll(shownName).toBe(sortedFirst);

        // A render in flight, then Restore Order.
        await page.evaluate(() => {
            window.mediaViewer.isLoading = true;
            window.__restoreDone = window.mediaViewer.handleSortBySimilarity();
        });
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);

        await page.evaluate(async () => {
            window.mediaViewer.isLoading = false;
            await window.__restoreDone;
        });
        await waitForIdle(page);

        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(false);
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).toBe(0);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles[0].name)).toBe(folderFirst);
        await expect.poll(shownName).toBe(folderFirst);
    });

    test('a run the user moved on during ends with Show, which survives 5 s and other notices, then applies from the start file', async () => {
        await gateHashing(page);
        const startPath = await page.evaluate(() => window.mediaViewer.mediaFiles[0].path);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForIdle(page);
        await finishSort(page);

        const offer = offerLocator();
        await expect(offer).toBeVisible();
        await expect(offer.locator('.notification-action')).toHaveText('Show');
        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(false);

        await page.waitForTimeout(5000);
        await page.evaluate(() => {
            // Success notices reach the 5-notification prune (info ones are held to two by the info prune
            // first); the infos after them exercise the info prune.
            for (let i = 0; i < 6; i++) {
                window.mediaViewer.showNotification(`n${i}`, 'success');
            }
            for (let i = 0; i < 3; i++) {
                window.mediaViewer.showNotification(`i${i}`, 'info');
            }
        });
        await expect(offer).toBeVisible();

        await offer.locator('.notification-action').click({ force: true });
        await expect(offer).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).toBe(0);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles[0].path)).toBe(startPath);
    });

    test('a file rated during the run is absent after Show', async () => {
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await gateHashing(page);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await waitForIdle(page);
        const ratedPath = await page.evaluate(
            () => window.mediaViewer.mediaFiles[window.mediaViewer.currentIndex].path
        );
        await page.evaluate(() => window.mediaViewer.moveCurrentFile('like'));
        await waitForIdle(page);
        await finishSort(page);

        const offer = offerLocator();
        await expect(offer).toBeVisible();
        await offer.locator('.notification-action').click({ force: true });
        await expect(offer).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);

        const paths = await listedPaths(page);
        expect(paths).not.toContain(ratedPath);
        expect(paths).toHaveLength(2);
    });

    test('Show after switching to compare mode renders the first pair from the start file', async () => {
        // A fourth file, so compare-mode Next can leave the first pair: with three, Next by 2 wraps back to 0.
        // Entering compare mode resets the cursor to 0 (toggleViewMode), so the move happens in compare mode.
        await tmpFixtures.addFile('yellow-1x1.png');
        await loadFolder(page, tmpFixtures.dir);
        await gateHashing(page);
        const startPath = await page.evaluate(() => window.mediaViewer.mediaFiles[0].path);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.switchMode('compare'));
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForIdle(page);
        // The pair on screen no longer starts at the start file, so only Show's own render can put it back.
        await expect
            .poll(() =>
                page.evaluate((start) => {
                    const left = window.mediaViewer.compareLeftFile?.path ?? null;
                    return left !== null && left !== start;
                }, startPath)
            )
            .toBe(true);
        await finishSort(page);

        const offer = offerLocator();
        await expect(offer).toBeVisible();
        await offer.locator('.notification-action').click({ force: true });
        await expect(offer).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);

        expect(await page.evaluate(() => window.mediaViewer.isCompareMode)).toBe(true);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles[0].path)).toBe(startPath);
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).toBe(0);
        await expect.poll(() => page.evaluate(() => window.mediaViewer.compareLeftFile?.path ?? null)).toBe(startPath);
    });

    test('a folder switch removes the Show message', async () => {
        await gateHashing(page);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForIdle(page);
        await finishSort(page);
        await expect(offerLocator()).toBeVisible();

        otherFixtures = await createTempFixtureDir(['normal-320x240.png', 'wide-short-64x4.png']);
        await loadFolder(page, otherFixtures.dir);

        await expect(offerLocator()).toHaveCount(0);
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
    });

    test('entering Tournament mode removes the Show message', async () => {
        await gateHashing(page);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForIdle(page);
        await finishSort(page);
        await expect(offerLocator()).toBeVisible();

        await page.evaluate(() => window.mediaViewer.switchMode('tournament'));

        await expect(offerLocator()).toHaveCount(0);
    });

    test('× then Sort applies the saved order at once without hashing', async () => {
        await gateHashing(page);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await waitForIdle(page);
        await finishSort(page);

        const offer = offerLocator();
        await expect(offer).toBeVisible();
        await offer.locator('.notification-close').click({ force: true });
        await expect(offer).toHaveCount(0);

        // The order was saved when the run ended, before the offer: the second press can take the cache hit.
        // A full re-sort would also hash nothing (both paths reload .hash_cache.json), so the hash count alone
        // cannot tell the two apart; the worker count and the cache-hit notice can.
        const algorithm = await page.evaluate(() => window.mediaViewer.sortAlgorithm);
        const sortCacheFile = join(tmpFixtures.dir, '.sort_cache.json');
        expect(existsSync(sortCacheFile)).toBe(true);
        const sortCache = JSON.parse(await readFile(sortCacheFile, 'utf8'));
        expect(Object.keys(sortCache)).toContain(algorithm);

        await page.evaluate(() => {
            window.__hashCalls = 0;
            const viewer = window.mediaViewer;
            window.__workerCalls = 0;
            const runSortingWorker = viewer.runSortingWorker.bind(viewer);
            viewer.runSortingWorker = (...args) => {
                window.__workerCalls++;
                return runSortingWorker(...args);
            };
            window.__notices = [];
            const showNotification = viewer.showNotification.bind(viewer);
            viewer.showNotification = (message, ...rest) => {
                window.__notices.push(String(message));
                return showNotification(message, ...rest);
            };
        });
        await page.evaluate(() => window.mediaViewer.handleSortBySimilarity());

        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);
        expect(await page.evaluate(() => window.__hashCalls)).toBe(0);
        expect(await page.evaluate(() => window.__workerCalls)).toBe(0);
        expect((await page.evaluate(() => window.__notices)).filter((m) => m.includes('Restored cached'))).toHaveLength(
            1
        );
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
    });

    test('Cancel leaves the list as it is and keeps the finished hashes', async () => {
        const before = await listedPaths(page);
        await gateHashing(page);
        await startSort(page);
        await waitForHashCalls(page, 2);
        // A press while a run computes only aborts it.
        await page.evaluate(() => window.mediaViewer.handleSortBySimilarity());
        await finishSort(page);

        expect(await listedPaths(page)).toEqual(before);
        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(false);
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
        expect(existsSync(join(tmpFixtures.dir, '.sort_cache.json'))).toBe(false);

        const hashCache = JSON.parse(await readFile(join(tmpFixtures.dir, '.hash_cache.json'), 'utf8'));
        // The file the gate let through, not mediaFiles[0]: the pool finishes in completion order. Stricter too,
        // since it proves result 2 was not stored after the Cancel.
        const firstName = await page.evaluate(() => window.electronAPI.path.basename(window.__firstHashedPath));
        expect(Object.keys(hashCache)).toEqual([firstName]);
    });

    test('a folder switch mid-run writes nothing to either folder and leaves the new list alone', async () => {
        otherFixtures = await createTempFixtureDir(['normal-320x240.png', 'wide-short-64x4.png']);
        await gateHashing(page);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await loadFolder(page, otherFixtures.dir);
        await finishSort(page);

        for (const dir of [otherFixtures.dir, tmpFixtures.dir]) {
            expect(existsSync(join(dir, '.hash_cache.json'))).toBe(false);
            expect(existsSync(join(dir, '.sort_cache.json'))).toBe(false);
        }
        expect((await listedNames(page)).sort()).toEqual(['normal-320x240.png', 'wide-short-64x4.png']);
        expect(await page.evaluate(() => window.mediaViewer.isComputingHashes)).toBe(false);
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
    });

    // A different folder also makes the run stale by its folder path alone; only the run counter that
    // loadFolder bumps catches a reload of the SAME folder, so this is the test that proves the bump.
    test('reloading the same folder mid-run writes nothing and leaves the new list alone', async () => {
        await gateHashing(page);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await loadFolder(page, tmpFixtures.dir);
        await finishSort(page);

        expect(existsSync(join(tmpFixtures.dir, '.hash_cache.json'))).toBe(false);
        expect(existsSync(join(tmpFixtures.dir, '.sort_cache.json'))).toBe(false);
        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(false);
        expect(await page.evaluate(() => window.mediaViewer.isComputingHashes)).toBe(false);
        expect(await listedNames(page)).toHaveLength(3);
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
    });
});
