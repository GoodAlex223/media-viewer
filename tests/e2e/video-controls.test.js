import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir } from './helpers/electron-app.js';

test.describe('Video play/pause icon toggle', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['tiny.mp4']);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
        // currentMedia is set synchronously when showMedia renders the video; do NOT
        // use waitForMedia (needs the video to decode+become visible, which may not happen).
        await page.waitForFunction(() => window.mediaViewer.currentMedia?.tagName === 'VIDEO', null, {
            timeout: 10_000,
        });
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('play/pause events swap the play and pause icons', async () => {
        const playIcon = page.locator('#playIcon');
        const pauseIcon = page.locator('#pauseIcon');

        // DOM refs + icon-name integrity (catches ID / data-lucide drift).
        const refs = await page.evaluate(() => ({
            playRef: !!window.mediaViewer.playIcon,
            pauseRef: !!window.mediaViewer.pauseIcon,
            playName: window.mediaViewer.playIcon?.getAttribute('data-lucide'),
            pauseName: window.mediaViewer.pauseIcon?.getAttribute('data-lucide'),
        }));
        expect(refs).toEqual({ playRef: true, pauseRef: true, playName: 'play', pauseName: 'pause' });

        // Synthetic 'pause' event → onPause: show play icon, hide pause icon.
        await page.evaluate(() => window.mediaViewer.currentMedia.dispatchEvent(new Event('pause')));
        await expect(playIcon).toHaveCSS('display', 'block');
        await expect(pauseIcon).toHaveCSS('display', 'none');

        // Synthetic 'play' event → onPlay: show pause icon, hide play icon.
        await page.evaluate(() => window.mediaViewer.currentMedia.dispatchEvent(new Event('play')));
        await expect(pauseIcon).toHaveCSS('display', 'block');
        await expect(playIcon).toHaveCSS('display', 'none');
    });
});
