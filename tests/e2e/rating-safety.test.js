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

// From Phase 0 (spec § 11): the file that, shown right after the video, exposed the stuck state.
const SLOW_NEXT = 'normal-320x240.png';

/** Reorder mediaFiles so `lead` comes first in that order, show the first, wait for it to settle. */
async function arrange(page, lead) {
    await waitForIdle(page);
    await page.evaluate(async (names) => {
        const mv = window.mediaViewer;
        const rank = (f) => (names.indexOf(f.name) === -1 ? names.length : names.indexOf(f.name));
        mv.mediaFiles.sort((a, b) => rank(a) - rank(b));
        mv.currentIndex = 0;
        await mv.showMedia();
    }, lead);
    await page.waitForFunction(
        (first) => window.mediaViewer.mediaFiles[0]?.name === first && window.mediaViewer.currentMedia !== null,
        lead[0]
    );
    await waitForIdle(page);
}

test.describe('One file action at a time (G1)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
            'tiny.mp4',
        ]);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
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

    // The held-Like end state (spec F3), driven by clicks: a burst the repeat filter cannot see,
    // at the cadence a held key used. tiny.mp4 may fail to decode here; it is still a <video>, so
    // forceVideoCleanup and its 500 ms wait still run.
    test('a burst of Like clicks on a video moves one file and leaves the controls alive', async () => {
        await arrange(page, ['tiny.mp4', SLOW_NEXT]);
        await page.evaluate(async () => {
            const btn = document.getElementById('likeBtn');
            for (let i = 0; i < 8; i++) {
                btn.click();
                await new Promise((r) => setTimeout(r, 33));
            }
        });
        await page.waitForTimeout(2000);
        await waitForIdle(page);

        expect(await countFiles(tmpFixtures.likeDir)).toBe(1);
        // Move failures only: tiny.mp4's own decode failure ("Failed to load video") is expected here.
        expect((await errors(page)).filter((m) => m.startsWith('Failed to move'))).toEqual([]);
        const visible = await page.evaluate(
            () =>
                [...document.querySelectorAll('.media-display')].filter((el) => getComputedStyle(el).display !== 'none')
                    .length
        );
        expect(visible).toBe(1);

        // The controls still act: one more Like moves exactly one more file.
        await page.evaluate(() => window.mediaViewer.handleLike());
        await page.waitForTimeout(500);
        await waitForIdle(page);
        expect(await countFiles(tmpFixtures.likeDir)).toBe(2);
    });

    test('an Undo pressed during a move is refused with a notice and reverses nothing', async () => {
        await arrange(page, ['red-1x1.png', 'tiny.mp4']);
        await page.keyboard.press('q'); // a completed like — the move a wrong undo would reverse
        await page.waitForFunction(() => window.mediaViewer.currentMedia?.tagName === 'VIDEO');
        await waitForIdle(page);

        await page.keyboard.press('q'); // the video's move waits ~600 ms before fs.rename
        await page.keyboard.press('Control+KeyA');

        await expect(page.locator('.notification').filter({ hasText: 'A move is still in progress' })).toBeVisible();
        await page.waitForTimeout(1500);
        await waitForIdle(page);

        expect((await readdir(tmpFixtures.likeDir)).sort()).toEqual(['red-1x1.png', 'tiny.mp4']);
        expect(await page.evaluate(() => window.mediaViewer.moveHistory.length)).toBe(2);
    });
});
