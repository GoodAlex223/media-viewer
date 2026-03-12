import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';

test.describe('Fullscreen', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        // Need at least 2 files for compare mode
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        // Switch to compare mode (fullscreen is compare-mode only)
        // Use evaluate because .media-container intercepts pointer events on the button
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);
    });

    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

    test('Z key toggles left pane fullscreen', async () => {
        const leftWrapper = page.locator('.left-media-wrapper');
        await expect(leftWrapper).toBeVisible();

        // Press Z to enter fullscreen
        await page.keyboard.press('z');
        await page.waitForTimeout(300);

        // Left wrapper should have fullscreen class
        await expect(leftWrapper).toHaveClass(/fullscreen/);

        // Fullscreen indicator should be visible
        const indicator = leftWrapper.locator('.fullscreen-indicator');
        await expect(indicator).toBeVisible();
    });

    test('Escape exits fullscreen', async () => {
        const leftWrapper = page.locator('.left-media-wrapper');

        // Enter fullscreen
        await page.keyboard.press('z');
        await page.waitForTimeout(300);
        await expect(leftWrapper).toHaveClass(/fullscreen/);

        // Exit via Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Fullscreen class should be removed
        await expect(leftWrapper).not.toHaveClass(/fullscreen/);
    });

    test('X key toggles right pane fullscreen', async () => {
        const rightWrapper = page.locator('.right-media-wrapper');
        await expect(rightWrapper).toBeVisible();

        // Press X to enter fullscreen on right pane
        await page.keyboard.press('x');
        await page.waitForTimeout(300);

        await expect(rightWrapper).toHaveClass(/fullscreen/);
    });
});
