import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';

test.describe('Navigation', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
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

    test('displays correct file count after loading', async () => {
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(3);
    });

    test('shows navigation index', async () => {
        const indexText = await page.locator('#mediaIndex').textContent();
        // Format: "N / M" — first file of 3
        expect(indexText).toContain('1');
        expect(indexText).toContain('3');
    });

    test('navigates forward with right arrow key', async () => {
        await page.keyboard.press('d');
        await page.waitForTimeout(300); // Wait for media transition

        const currentIndex = await page.evaluate(() => window.mediaViewer.currentIndex);
        expect(currentIndex).toBe(1);
    });

    test('navigates backward with left arrow key', async () => {
        // Go forward first
        await page.keyboard.press('d');
        await page.waitForTimeout(300);

        // Then go back
        await page.keyboard.press('a');
        await page.waitForTimeout(300);

        const currentIndex = await page.evaluate(() => window.mediaViewer.currentIndex);
        expect(currentIndex).toBe(0);
    });

    test('navigates forward with next button click', async () => {
        // Use force:true because .media-container overlay intercepts pointer events
        await page.locator('#navNext').click({ force: true });
        await page.waitForTimeout(300);

        const currentIndex = await page.evaluate(() => window.mediaViewer.currentIndex);
        expect(currentIndex).toBe(1);
    });

    test('navigates backward with prev button click', async () => {
        // Go to second file first
        await page.locator('#navNext').click({ force: true });
        await page.waitForTimeout(300);

        await page.locator('#navPrev').click({ force: true });
        await page.waitForTimeout(300);

        const currentIndex = await page.evaluate(() => window.mediaViewer.currentIndex);
        expect(currentIndex).toBe(0);
    });

    test('wraps around when navigating past the last file', async () => {
        // Navigate to end (3 files, start at 0)
        await page.keyboard.press('d');
        await page.waitForTimeout(200);
        await page.keyboard.press('d');
        await page.waitForTimeout(200);
        // Now at index 2 (last file), press right to wrap
        await page.keyboard.press('d');
        await page.waitForTimeout(200);

        const currentIndex = await page.evaluate(() => window.mediaViewer.currentIndex);
        expect(currentIndex).toBe(0);
    });
});
