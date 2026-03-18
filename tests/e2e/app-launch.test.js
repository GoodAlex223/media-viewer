import { test, expect } from '@playwright/test';
import {
    launchApp,
    closeApp,
    loadFolder,
    mockFolderDialog,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

test.describe('App Launch', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        ({ electronApp, page } = await launchApp());
    });

    test.afterEach(async () => {
        await closeApp(electronApp);
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    test('shows drop zone on initial launch', async () => {
        const dropZone = page.locator('#dropZone');
        await expect(dropZone).toBeVisible();

        // Controls should be hidden before folder is loaded
        await expect(page.locator('#controls')).toBeHidden();
        await expect(page.locator('#changeFolderBtn')).toBeHidden();
        await expect(page.locator('#viewModeBtn')).toBeHidden();
        await expect(page.locator('#helpBtn')).toBeHidden();
    });

    test('has correct window title', async () => {
        const title = await page.title();
        expect(title).toBe('Media Viewer');
    });

    test('electronAPI is available in renderer', async () => {
        const hasAPI = await page.evaluate(() => typeof window.electronAPI !== 'undefined');
        expect(hasAPI).toBe(true);
    });

    test('loads folder and hides drop zone', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await expect(page.locator('#dropZone')).toBeHidden();
        await expect(page.locator('#changeFolderBtn')).toBeVisible();
        await expect(page.locator('#viewModeBtn')).toBeVisible();
        await expect(page.locator('#helpBtn')).toBeVisible();
    });

    test('loads folder via mocked dialog when drop zone is clicked', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png']);
        await mockFolderDialog(electronApp, tmpFixtures.dir);

        await page.locator('#dropZone').click();
        await waitForMedia(page);

        await expect(page.locator('#dropZone')).toBeHidden();
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(1);
    });
});
