import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, seedLocalStorage, createTempFixtureDir } from './helpers/electron-app.js';

// G2 PR 1: the similarity sort's end. A run the user acted during ends with a sticky "Show" instead of moving
// them; Cancel keeps the finished hashes and leaves the list alone; a folder switch makes a running sort stale.

// Holds hash call 2 and later on a gate the test opens, so a run stays mid-hash for as long as the test needs.
// Call 1 goes through, so a Cancel has one finished hash to keep.
async function gateHashing(page) {
    await page.evaluate(() => {
        const viewer = window.mediaViewer;
        const original = viewer.computePerceptualHash.bind(viewer);
        let open;
        window.__hashGate = new Promise((resolve) => {
            open = resolve;
        });
        window.__openHashGate = () => open();
        window.__hashCalls = 0;
        viewer.computePerceptualHash = async (filePath) => {
            window.__hashCalls++;
            if (window.__hashCalls >= 2) {
                await window.__hashGate;
            }
            return original(filePath);
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
        await gateHashing(page);
        const startPath = await page.evaluate(() => window.mediaViewer.mediaFiles[0].path);
        await startSort(page);
        await waitForHashCalls(page, 2);
        await page.evaluate(() => window.mediaViewer.switchMode('compare'));
        await waitForIdle(page);
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

        await page.evaluate(() => {
            window.__hashCalls = 0;
        });
        await page.evaluate(() => window.mediaViewer.handleSortBySimilarity());

        expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);
        expect(await page.evaluate(() => window.__hashCalls)).toBe(0);
        await expect(page.locator('.notification.sticky')).toHaveCount(0);
    });

    test('Cancel leaves the list as it is and keeps the finished hashes', async () => {
        const before = await listedPaths(page);
        const firstName = await page.evaluate(() =>
            window.electronAPI.path.basename(window.mediaViewer.mediaFiles[0].path)
        );
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
