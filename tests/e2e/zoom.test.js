import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';

test.describe('Zoom Controls', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('zoom popover opens and closes on button click', async () => {
        const popover = page.locator('.zoom-popover').first();

        // Popover should initially be hidden (no .show class)
        await expect(popover).not.toHaveClass(/show/);

        // Click zoom toggle button
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        // Popover should now be visible
        await expect(popover).toHaveClass(/show/);

        // Click zoom toggle again to close
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        await expect(popover).not.toHaveClass(/show/);
    });

    test('zoom slider adjusts scale value', async () => {
        // Open zoom popover
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        const slider = page.locator('.zoom-slider').first();
        const zoomValue = page.locator('.zoom-value').first();

        // Default should show 100%
        const initialValue = await zoomValue.textContent();
        expect(initialValue).toContain('100%');

        // Set slider to a higher value (right side = zoom in)
        await slider.fill('75');
        await slider.dispatchEvent('input');
        await page.waitForTimeout(200);

        // Zoom value should have changed from 100%
        const newValue = await zoomValue.textContent();
        expect(newValue).not.toBe('100%');
    });

    test('escape key resets zoom', async () => {
        // Open zoom popover and zoom in
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        const slider = page.locator('.zoom-slider').first();
        await slider.fill('75');
        await slider.dispatchEvent('input');
        await page.waitForTimeout(200);

        // Press Escape to reset zoom
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Zoom value label should be back to 100%
        const zoomValue = page.locator('.zoom-value').first();
        const resetValue = await zoomValue.textContent();
        expect(resetValue).toContain('100%');
    });
});
