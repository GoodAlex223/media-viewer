import { test, expect } from '@playwright/test';
import { join } from 'path';
import { access } from 'fs/promises';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

test.describe('Undo from empty state', () => {
    let electronApp, page, tmpFixtures;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('single mode — undo via keyboard restores file after rating last one', async () => {
        // Setup: 1 file so rating it empties the folder
        tmpFixtures = await createTempFixtureDir(['red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Get the file name before rating
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Rate the only file — should trigger empty state
        await page.keyboard.press('q');
        await page.waitForTimeout(500);

        // Verify empty state: mediaFiles is empty, empty-state-undo element visible
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(0);

        const emptyStateVisible = await page.locator('.empty-state-undo').isVisible();
        expect(emptyStateVisible).toBe(true);

        // Undo via keyboard shortcut (Ctrl+A is the default undo key)
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(500);

        // Verify file restored
        const restoredCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(restoredCount).toBe(1);

        // Verify empty-state element is removed
        const emptyStateGone = await page.locator('.empty-state-undo').count();
        expect(emptyStateGone).toBe(0);

        // Verify media is displayed
        await waitForMedia(page);

        // Verify file is back in source folder
        await expect(access(join(tmpFixtures.dir, fileName))).resolves.toBeUndefined();
    });

    test('single mode — undo via button click restores file', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Rate the only file
        await page.keyboard.press('q');
        await page.waitForTimeout(500);

        // Click the undo button in the empty-state prompt
        await page.locator('.empty-state-undo-btn').click();
        await page.waitForTimeout(500);

        // Verify file restored and media displayed
        const restoredCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(restoredCount).toBe(1);
        await waitForMedia(page);

        await expect(access(join(tmpFixtures.dir, fileName))).resolves.toBeUndefined();
    });

    test('compare mode — undo restores both files after rating last pair', async () => {
        // Setup: 2 files so rating the pair empties the folder
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Switch to compare mode
        await page.evaluate(() => {
            window.mediaViewer.toggleViewMode();
        });
        await page.waitForTimeout(1000);

        // Verify compare mode is active
        const inCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(inCompare).toBe(true);

        // Rate left file as "like" (default compare shortcut: 'q' for left-like)
        await page.keyboard.press('q');
        await page.waitForTimeout(1000);

        // Verify empty state — note: switchToSingleModeUI() is called when <2 files remain,
        // so isCompareMode is now false even though the pair was rated in compare mode
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(0);

        const emptyStateVisible = await page.locator('.empty-state-undo').isVisible();
        expect(emptyStateVisible).toBe(true);

        // Undo via keyboard — handleCancel detects compare-tagged history entries
        // and restores both files even in single mode
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(1000);

        // Verify both files restored
        const restoredCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(restoredCount).toBe(2);

        // Verify empty-state element is removed
        const emptyStateGone = await page.locator('.empty-state-undo').count();
        expect(emptyStateGone).toBe(0);

        // Verify media is displayed
        await waitForMedia(page);
    });
});
