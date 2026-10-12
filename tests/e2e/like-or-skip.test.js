// G2 like-or-skip flow (docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md): on the AI
// order in single mode, Next records a skip; F and Enter dislike every skipped file in one action; one
// Ctrl+A puts the whole batch back.
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

const ALL = ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png', 'tiny.mp4'];

/** No render and no file action in flight — handlers guarding on these flags would otherwise refuse. */
async function waitForIdle(page) {
    await page.waitForFunction(
        () =>
            !window.mediaViewer.isLoading &&
            !window.mediaViewer.mediaNavigationInProgress &&
            !window.mediaViewer._fileOpInFlight,
        null,
        { timeout: 10_000 }
    );
}

/** Apply an AI order through the production entry point — the sort itself is not under test here. */
async function enterAiOrder(page, order) {
    await waitForIdle(page);
    await page.evaluate((names) => {
        const scores = Object.fromEntries(names.map((n, i) => [n, 1 - i / names.length]));
        window.mediaViewer.applyPredictionSortResult({ sortedFilenames: names, scores });
    }, order);
    await page.waitForFunction(
        (first) => window.mediaViewer.mediaFiles[0]?.name === first && window.mediaViewer.currentMedia !== null,
        order[0]
    );
    await waitForIdle(page);
}

/** Press a key and wait for the render it started. */
async function press(page, key) {
    await page.keyboard.press(key);
    await waitForIdle(page);
}

/** Press `key`, send `repeats` auto-repeat keydowns ~33 ms apart (the OS repeat rate), release. */
async function holdKey(page, key, repeats = 10) {
    await page.keyboard.down(key);
    for (let i = 0; i < repeats; i++) {
        await page.waitForTimeout(33);
        await page.keyboard.down(key);
    }
    await page.keyboard.up(key);
}

const onScreen = (page) => page.evaluate(() => window.mediaViewer.mediaFiles[window.mediaViewer.currentIndex]?.name);
const listed = (page) => page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => f.name));

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

test.describe('Like-or-skip (G2)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(ALL);
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

    test('three skips, F and Enter move the three skipped files; the file on screen stays, unrendered', async () => {
        await enterAiOrder(page, ALL);
        for (let i = 0; i < 3; i++) {
            await press(page, 's');
        }
        expect(await onScreen(page)).toBe('normal-320x240.png');
        await expect(page.locator('#dislikeSkippedBtn')).toBeVisible();
        await expect(page.locator('#dislikeSkippedBtn .btn-label')).toHaveText('Dislike 3 skipped');
        await page.evaluate(() => (window.__shown = window.mediaViewer.currentMedia));

        await page.keyboard.press('f');
        const modal = page.locator('.bulk-dislike-modal');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText('Dislike 3 skipped files?');
        await page.keyboard.press('Enter');
        await expect(modal).toHaveCount(0);
        await waitForIdle(page);

        expect((await readdir(tmpFixtures.dislikeDir)).sort()).toEqual([
            'blue-1x1.png',
            'green-1x1.png',
            'red-1x1.png',
        ]);
        expect(await listed(page)).toEqual(['normal-320x240.png', 'tiny.mp4']);
        expect(await onScreen(page)).toBe('normal-320x240.png');
        expect(await page.evaluate(() => window.mediaViewer.currentMedia === window.__shown)).toBe(true);
        await expect(page.locator('#dislikeSkippedBtn')).toBeHidden();
        expect(await page.evaluate(() => window.__errors)).toEqual([]);
    });

    test('a held F opens one dialog, and keys pressed while it is open reach no shortcut', async () => {
        await enterAiOrder(page, ALL);
        await press(page, 's');
        await press(page, 's');
        await holdKey(page, 'f');
        await expect(page.locator('.bulk-dislike-modal')).toHaveCount(1);
        // The dialog holds _fileOpInFlight, so q/s/Ctrl+A would be refused downstream even if they
        // leaked. Count dispatches instead (the main keydown handler calls this.executeAction), and
        // press guard-independent keys too: i (file info) and F1 (help) act without the guard.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            window.__dispatched = [];
            const original = mv.executeAction.bind(mv);
            mv.executeAction = (action) => {
                window.__dispatched.push(action);
                return original(action);
            };
            // Every notice raised from here on, read from the call rather than the DOM: an info notice
            // auto-closes after 2 s and the info cap removes older ones, so a DOM count can miss it.
            window.__notices = [];
            const notify = mv.showNotification.bind(mv);
            mv.showNotification = (message, ...rest) => {
                window.__notices.push(String(message));
                return notify(message, ...rest);
            };
        });
        await page.keyboard.press('q'); // Like — must not reach the dispatcher
        await page.keyboard.press('s'); // Next — nor this
        await page.keyboard.press('Control+a'); // Undo (spec E3) — nor this: no "No moves to undo" notice
        await page.keyboard.press('i'); // File-info toggle — a fixed utility, not behind the guard
        await page.keyboard.press('F1'); // Help toggle — global, not behind the guard
        expect(await page.evaluate(() => window.__dispatched)).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(page.locator('.bulk-dislike-modal')).toHaveCount(0);
        await waitForIdle(page);
        // showFileInfo adds its class in a requestAnimationFrame: let two frames pass before asserting.
        await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        );

        expect(await page.evaluate(() => document.getElementById('helpOverlay').classList.contains('show'))).toBe(
            false
        );
        expect(await page.evaluate(() => document.getElementById('fileInfoPanel').classList.contains('show'))).toBe(
            false
        );
        await expect(page.locator('.notification').filter({ hasText: 'No moves to undo' })).toHaveCount(0);
        await expect(page.locator('.notification').filter({ hasText: 'A move is still in progress' })).toHaveCount(0);
        expect(
            (await page.evaluate(() => window.__notices)).filter(
                (m) => m.includes('No moves to undo') || m.includes('A move is still in progress')
            )
        ).toEqual([]);
        expect(await readdir(tmpFixtures.likeDir)).toEqual([]);
        expect(await readdir(tmpFixtures.dislikeDir)).toEqual([]);
        expect(await onScreen(page)).toBe('blue-1x1.png');
        await expect(page.locator('#dislikeSkippedBtn .btn-label')).toHaveText('Dislike 2 skipped');
    });

    test('a video on screen in the batch is released and moved; the cursor goes to the next file', async () => {
        const order = ['tiny.mp4', 'red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png'];
        await enterAiOrder(page, order);
        await press(page, 's'); // tiny.mp4 skipped
        await press(page, 'a'); // back on it: still skipped, now on screen
        expect(await onScreen(page)).toBe('tiny.mp4');
        expect(await page.evaluate(() => window.mediaViewer.currentMedia?.tagName)).toBe('VIDEO');

        await page.keyboard.press('f');
        const modal = page.locator('.bulk-dislike-modal');
        await expect(modal).toContainText('Includes the file on screen.');
        await page.keyboard.press('Enter');
        await expect(modal).toHaveCount(0);
        await waitForIdle(page);

        expect(await readdir(tmpFixtures.dislikeDir)).toEqual(['tiny.mp4']);
        expect(await onScreen(page)).toBe('red-1x1.png');
        // tiny.mp4's own decode failure ("Failed to load video") may be logged; a failed MOVE may not.
        expect((await page.evaluate(() => window.__errors)).filter((m) => m.startsWith('Moved'))).toEqual([]);
    });
});
