// G1 CSP zero-violation walk (spec § 6.1): drive the main flows and assert the policy blocked
// nothing they need. Violations are collected two ways from the first byte of the document — an
// in-page listener installed before a reload, and Chromium's own console report — because a
// policy that breaks a lazy path (a worker, WASM, the face models) fails silently otherwise.
import { test, expect } from '@playwright/test';
import { cp } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
    launchApp,
    closeApp,
    loadFolder,
    waitForMedia,
    seedLocalStorage,
    createTempFixtureDir,
} from './helpers/electron-app.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const IMAGES = ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png'];

let electronApp;
let page;
let tmpFixtures;

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (tmpFixtures) {
        await tmpFixtures.cleanup();
    }
});

async function waitForIdle() {
    await page.waitForFunction(
        () => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress,
        null,
        {
            timeout: 30_000,
        }
    );
}

test('the main flows run with zero CSP violations', async () => {
    test.setTimeout(240_000);
    tmpFixtures = await createTempFixtureDir([...IMAGES, 'static.jxl', 'tiny.mp4']);
    for (const name of IMAGES) {
        await cp(join(FIXTURES, name), join(tmpFixtures.likeDir, `l-${name}`));
        await cp(join(FIXTURES, name), join(tmpFixtures.dislikeDir, `d-${name}`));
    }

    ({ electronApp, page } = await launchApp());
    const consoleReports = [];
    page.on('console', (msg) => {
        if (/Content[ -]Security[ -]Policy/i.test(msg.text())) {
            consoleReports.push(msg.text());
        }
    });
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (e) => {
            window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
        });
    });
    await page.reload(); // the listener and console capture now cover the document from its first byte
    await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined');

    await seedLocalStorage(page, {
        customLikeFolder: tmpFixtures.likeDir,
        customDislikeFolder: tmpFixtures.dislikeDir,
    });
    await loadFolder(page, tmpFixtures.dir);
    await waitForMedia(page);
    await waitForIdle();

    // Every file once: images, the static JXL (module worker + WASM), and a <video>.
    const count = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
    const shown = {};
    for (let i = 0; i < count; i++) {
        await page.evaluate(async (idx) => {
            window.mediaViewer.currentIndex = idx;
            await window.mediaViewer.showMedia();
        }, i);
        await waitForIdle();
        await page.waitForTimeout(300);
        const { name, tag, src } = await page.evaluate(() => ({
            name: window.mediaViewer.mediaFiles[window.mediaViewer.currentIndex].name,
            tag: window.mediaViewer.currentMedia?.tagName,
            src: window.mediaViewer.currentMedia?.getAttribute('src') ?? '',
        }));
        shown[name] = `${tag} ${src.split(':')[0]}`;
    }
    // The walk proves nothing about a flow that never ran: the static JXL went through the module
    // worker and its WASM decoder to a blob: image, and the video got its element.
    expect(shown['static.jxl']).toBe('IMG blob');
    expect(shown['tiny.mp4']).toMatch(/^VIDEO /);

    // Compare mode.
    await page.evaluate(() => window.mediaViewer.switchMode('compare'));
    await page.waitForFunction(() => window.mediaViewer.isCompareMode && window.mediaViewer.compareRightFile);
    await waitForIdle();
    await page.evaluate(() => window.mediaViewer.switchMode('single'));
    await waitForIdle();

    // Similarity sort (sorting worker + perceptual hashes).
    await page.evaluate(() => window.mediaViewer.handleSortBySimilarity());
    await page.waitForFunction(() => !window.mediaViewer.isComputingHashes, null, { timeout: 60_000 });
    await waitForIdle();

    // AI sort (ML worker, feature worker, face detection inside feature extraction). CLIP stays off:
    // it runs in the main process, outside the page's policy, and would download a model.
    await page.evaluate(() => {
        window.mediaViewer.isMlEnabled = true;
        window.mediaViewer.enableClipFeatures = false;
    });
    await page.evaluate(() => window.mediaViewer.handleSortByPrediction());
    await page.waitForFunction(() => !window.mediaViewer.isPredictionSorting, null, { timeout: 120_000 });
    await waitForIdle();
    expect(await page.evaluate(() => window.mediaViewer.isSortedByPrediction)).toBe(true);
    // Feature extraction runs face detection, which loads face-api and its models from file:.
    expect(await page.evaluate(() => window.FaceDetector?.isAvailable())).toBe(true);

    // Tournament mode: config modal, then the first pair.
    await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
    await expect(page.locator('#tournamentConfigModal')).toBeVisible();
    await page.locator('#tournamentConfigStart').click();
    await expect(page.locator('#tournamentOverlay')).toBeVisible();
    await waitForIdle();

    // Settings panel (shortcut rows).
    await page.keyboard.press('F1');
    await page.waitForTimeout(300);

    expect(consoleReports).toEqual([]);
    expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});
