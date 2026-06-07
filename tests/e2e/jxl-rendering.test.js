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
});
