import { test, expect } from '@playwright/test';
import { access } from 'fs/promises';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    mockFolderDialog,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

test.describe('Rating (pre-seeded localStorage)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
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

    test('like button is enabled when folders are configured', async () => {
        const disabled = await page.locator('#likeBtn').getAttribute('disabled');
        expect(disabled).toBeNull();
    });

    test('like moves file to like folder via keyboard', async () => {
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        await page.keyboard.press('q');
        await page.waitForTimeout(500);

        // Verify file exists in like folder
        await expect(access(join(tmpFixtures.likeDir, fileName))).resolves.toBeUndefined();

        // Verify file count decreased
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(2);
    });

    test('dislike moves file to dislike folder via keyboard', async () => {
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        await page.keyboard.press('w');
        await page.waitForTimeout(500);

        // Verify file exists in dislike folder
        await expect(access(join(tmpFixtures.dislikeDir, fileName))).resolves.toBeUndefined();

        // Verify file count decreased
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(2);
    });

    test('like moves file via button click', async () => {
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Use force:true because .media-container overlay intercepts pointer events
        await page.locator('#likeBtn').click({ force: true });
        await page.waitForTimeout(500);

        await expect(access(join(tmpFixtures.likeDir, fileName))).resolves.toBeUndefined();
    });

    test('undo restores the last moved file', async () => {
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Like the file
        await page.keyboard.press('q');
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(2);

        // Undo
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(500);

        // File count should be restored
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(3);

        // File should be back in source folder
        await expect(access(join(tmpFixtures.dir, fileName))).resolves.toBeUndefined();
    });
});

test.describe('Rating (Settings panel folder configuration)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        ({ electronApp, page } = await launchApp());
        // Clear any persisted folder paths so buttons start disabled
        await page.evaluate(() => {
            localStorage.removeItem('customLikeFolder');
            localStorage.removeItem('customDislikeFolder');
            localStorage.removeItem('customSpecialFolder');
            const mv = window.mediaViewer;
            mv.customLikeFolder = '';
            mv.customDislikeFolder = '';
            mv.customSpecialFolder = '';
            mv.updateRatingButtonsState();
            mv.updateSpecialButtonsState();
        });
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

    test('configures like folder via Settings panel', async () => {
        // Rating buttons should be disabled (folders cleared in beforeEach)
        const disabledBefore = await page.locator('#likeBtn').isDisabled();
        expect(disabledBefore).toBe(true);

        // Open help/settings overlay via F1
        await page.keyboard.press('F1');
        await page.waitForSelector('#helpOverlay.show');

        // Mock the folder dialog to return our like dir
        await mockFolderDialog(electronApp, tmpFixtures.likeDir);
        await page.locator('#likeFolderBrowse').click();
        await page.waitForTimeout(300);

        // Verify the input shows the path
        const likeFolderValue = await page.locator('#likeFolderInput').inputValue();
        expect(likeFolderValue).toBe(tmpFixtures.likeDir);

        // Now set dislike folder too
        await mockFolderDialog(electronApp, tmpFixtures.dislikeDir);
        await page.locator('#dislikeFolderBrowse').click();
        await page.waitForTimeout(300);

        // Close settings
        await page.keyboard.press('F1');

        // Rating buttons should now be enabled
        const disabledAfter = await page.locator('#likeBtn').isDisabled();
        expect(disabledAfter).toBe(false);

        // Verify localStorage was set
        const storedLike = await page.evaluate(() => localStorage.getItem('customLikeFolder'));
        expect(storedLike).toBe(tmpFixtures.likeDir);
    });
});
