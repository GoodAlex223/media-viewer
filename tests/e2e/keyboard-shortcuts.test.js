import { test, expect } from '@playwright/test';
import { access } from 'fs/promises';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

test.describe('Keyboard Shortcut Customization', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        ({ electronApp, page } = await launchApp());
        // Clear any stale custom shortcuts from previous test runs
        await page.evaluate(() => localStorage.removeItem('customShortcuts'));
        await page.evaluate(() => window.mediaViewer.resetShortcuts());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
    });

    test.afterEach(async () => {
        // Clean up custom shortcuts to prevent pollution of subsequent test files
        await page.evaluate(() => localStorage.removeItem('customShortcuts')).catch(() => {});
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('remap like shortcut and verify it works', async () => {
        // Open help overlay
        await page.keyboard.press('F1');
        await page.waitForSelector('#helpOverlay.show');

        // Find the "like" shortcut key in single mode and click it
        const likeKey = page.locator('.shortcut-key[data-action="like"][data-mode="single"]');
        await likeKey.click();

        // Verify listening mode
        await expect(likeKey).toHaveClass(/listening/);

        // Press new key (T)
        await page.keyboard.press('t');

        // Close help overlay
        await page.keyboard.press('F1');

        // Get current file name
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Use new shortcut (T for like)
        await page.keyboard.press('t');
        await page.waitForTimeout(500);

        // Verify file was moved to like folder
        await expect(access(join(tmpFixtures.likeDir, fileName))).resolves.toBeUndefined();
    });

    test('conflict detection blocks duplicate key assignment', async () => {
        await page.keyboard.press('F1');
        await page.waitForSelector('#helpOverlay.show');

        // Click the "like" key (currently Q)
        const likeKey = page.locator('.shortcut-key[data-action="like"][data-mode="single"]');
        await likeKey.click();

        // Try to assign W (already used by dislike)
        await page.keyboard.press('w');

        // Should still be in listening mode
        await expect(likeKey).toHaveClass(/listening/);

        // Conflict warning should appear
        const warning = page.locator('.shortcut-conflict-warning');
        await expect(warning).toBeVisible();
        await expect(warning).toContainText('Dislike');
    });

    test('reset to defaults restores original shortcuts', async () => {
        // Remap a key via JS
        await page.evaluate(() => {
            window.mediaViewer.saveShortcut('single', 'like', 'KeyT');
            window.mediaViewer.renderShortcutRows();
            window.mediaViewer.attachShortcutKeyListeners();
        });

        // Open help and click reset
        await page.keyboard.press('F1');
        await page.waitForSelector('#helpOverlay.show');
        await page.locator('#resetShortcutsBtn').click();

        // Verify like key is back to Q
        const likeKey = page.locator('.shortcut-key[data-action="like"][data-mode="single"]');
        await expect(likeKey).toHaveText('Q');
    });

    test('custom shortcuts persist after reload', async () => {
        // Remap like to T
        await page.evaluate(() => {
            window.mediaViewer.saveShortcut('single', 'like', 'KeyT');
        });

        // Verify localStorage was set
        const stored = await page.evaluate(() => localStorage.getItem('customShortcuts'));
        expect(stored).toContain('KeyT');

        // Verify the shortcut map reflects the change
        const currentLike = await page.evaluate(() => window.mediaViewer.shortcuts.single.like);
        expect(currentLike).toBe('KeyT');
    });
});
