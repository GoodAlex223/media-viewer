// G1 single-mode rating safety (docs/superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md).
// A held key (Playwright: every keyboard.down after the first carries repeat:true) and overlapping
// file actions must never move more than the one file the user meant.
import { test, expect } from '@playwright/test';
import { readdir } from 'fs/promises';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

/** Press `key`, send `repeats` auto-repeat keydowns ~33 ms apart (the OS repeat rate), release. */
async function holdKey(page, key, repeats = 20) {
    await page.keyboard.down(key);
    for (let i = 0; i < repeats; i++) {
        await page.waitForTimeout(33);
        await page.keyboard.down(key);
    }
    await page.keyboard.up(key);
}

/** No render in flight — handlers guarding on these flags would otherwise no-op. */
async function waitForIdle(page) {
    await page.waitForFunction(
        () => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress,
        null,
        { timeout: 10_000 }
    );
}

/** Record every showError call (DOM toasts are capped at five, so the DOM undercounts). */
async function spyOnErrors(page) {
    await page.evaluate(() => {
        const mv = window.mediaViewer;
        window.__errors = [];
        const original = mv.showError.bind(mv);
        mv.showError = (message, options) => {
            window.__errors.push(message);
            return original(message, options);
        };
    });
}

async function errors(page) {
    return page.evaluate(() => window.__errors);
}

async function countFiles(dir) {
    return (await readdir(dir)).length;
}

test.describe('Held keys fire once (G1)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
        ]);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
            customSpecialFolder: tmpFixtures.specialDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await waitForIdle(page);
        await spyOnErrors(page);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    test('a held Like moves exactly one file', async () => {
        await holdKey(page, 'q');
        await page.waitForTimeout(1500);
        await waitForIdle(page);

        expect(await countFiles(tmpFixtures.likeDir)).toBe(1);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
        expect(await errors(page)).toEqual([]);
    });

    // The must-not-fire half: navigation is the one action allowed to repeat. Passes before and
    // after the fix — its job is to catch an over-broad filter.
    test('a held Next still auto-repeats', async () => {
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            window.__navs = 0;
            const original = mv.nextMedia.bind(mv);
            mv.nextMedia = () => {
                const before = mv.currentIndex;
                original();
                if (mv.currentIndex !== before) window.__navs++;
            };
        });
        await holdKey(page, 's');
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => window.__navs)).toBeGreaterThanOrEqual(2);
    });
});
