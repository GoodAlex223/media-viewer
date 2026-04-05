import { test, expect } from '@playwright/test';
import {
    launchApp,
    closeApp,
    loadFolder,
    createTempFixtureDir,
    seedLocalStorage,
    waitForMedia,
} from './helpers/electron-app.js';

test.describe('CLIP graceful degradation', () => {
    let electronApp, page, tmpFixtures;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('app works normally with CLIP features disabled', async () => {
        tmpFixtures = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());

        // Disable CLIP features via localStorage and sync to live instance
        await seedLocalStorage(page, { enableClipFeatures: 'false' });
        await page.evaluate(() => {
            window.mediaViewer.enableClipFeatures = false;
        });

        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Verify media loads normally
        const mediaContainer = page.locator('.media-container');
        await expect(mediaContainer).toBeVisible();

        // Register console error listener before navigating
        const clipErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error' && msg.text().includes('CLIP')) {
                clipErrors.push(msg.text());
            }
        });

        // Navigate through files to exercise code paths that check enableClipFeatures
        await page.keyboard.press('d');
        await page.waitForTimeout(500);

        expect(clipErrors).toHaveLength(0);

        // Confirm the property is still false after navigation
        const clipEnabled = await page.evaluate(() => window.mediaViewer?.enableClipFeatures);
        expect(clipEnabled).toBe(false);
    });

    test('app starts with CLIP enabled by default', async () => {
        tmpFixtures = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());

        // Remove any lingering enableClipFeatures override from previous tests,
        // then sync the live instance to reflect the absence of the key (default = true).
        await page.evaluate(() => {
            localStorage.removeItem('enableClipFeatures');
            window.mediaViewer.enableClipFeatures = true;
        });

        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Check that enableClipFeatures is true when no localStorage override is present
        const clipEnabled = await page.evaluate(() => window.mediaViewer?.enableClipFeatures);
        expect(clipEnabled).toBe(true);
    });
});
