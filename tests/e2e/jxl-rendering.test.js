import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';

test.describe('JXL Rendering', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        ({ electronApp, page } = await launchApp());
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

    test('renders a static .jxl file as a visible media element without errors', async () => {
        // Capture any uncaught page errors during the JXL decode + render flow.
        const pageErrors = [];
        if (page) {
            page.on('pageerror', (err) => pageErrors.push(err.message));
        }

        tmpFixtures = await createTempFixtureDir(['static.jxl']);
        await loadFolder(page, tmpFixtures.dir);

        // The JXL decode path is async (module worker + IPC) and finishes by setting
        // a .media-display element; waitForMedia covers both the IMG (static) and
        // CANVAS (animated) cases.
        await waitForMedia(page);

        // Exactly one file should be loaded.
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(1);

        // The rendered media element must be an IMG or CANVAS (static JXL renders as IMG).
        const tagName = await page.evaluate(() => {
            const el = document.querySelector('.media-display');
            return el ? el.tagName : null;
        });
        expect(['IMG', 'CANVAS']).toContain(tagName);

        // No uncaught errors during decode/render.
        expect(pageErrors).toEqual([]);
    });

    // animated-64x64.jxl: four 64x64 frames of ffmpeg's testsrc at 4 fps, encoded with cjxl 0.11.2
    // (-d 1). Under the app scheme the decode worker runs with the response-header policy, so this
    // also proves a multi-frame decode and the canvas playback still work there.
    test('plays an animated .jxl on a canvas whose frames change', async () => {
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(err.message));
        tmpFixtures = await createTempFixtureDir(['animated-64x64.jxl']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await expect
            .poll(() =>
                page.evaluate(() => {
                    const entry = [...window.mediaViewer.jxlFrameCache.values()][0];
                    return entry ? { animated: entry.animated, frameCount: entry.frameCount } : null;
                })
            )
            .toEqual({ animated: true, frameCount: 4 });
        expect(await page.evaluate(() => document.querySelector('.media-display')?.tagName)).toBe('CANVAS');

        // The pixels on screen change while it plays (frames are 250 ms apart).
        const snapshot = () =>
            page.evaluate(() => {
                const c = document.querySelector('canvas.media-display');
                const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let h = 0;
                for (let i = 0; i < data.length; i += 7) {
                    h = (h * 31 + data[i]) >>> 0;
                }
                return h;
            });
        const first = await snapshot();
        await expect.poll(snapshot, { timeout: 3000 }).not.toBe(first);
        expect(pageErrors).toEqual([]);
    });
});
