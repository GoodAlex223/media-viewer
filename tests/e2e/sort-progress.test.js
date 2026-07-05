import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir } from './helpers/electron-app.js';

test.describe('Sort progress card', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('appears during a real sort and is removed on completion', async () => {
        // Install the observer BEFORE sorting: the card can appear and vanish in <100ms
        // on tiny fixtures, faster than any poll. childList catches a newly appended node;
        // the class attribute filter catches a reused node that gains .notification-progress.
        await page.evaluate(() => {
            window.__sawProgressCard = false;
            const check = () => {
                if (document.querySelector('.notification-progress')) {
                    window.__sawProgressCard = true;
                }
            };
            new MutationObserver(check).observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class'],
            });
            check();
        });

        // page.evaluate awaits the returned promise → resolves only after the sort finishes.
        await page.evaluate(() => window.mediaViewer.handleSortBySimilarity());

        expect(await page.evaluate(() => window.__sawProgressCard)).toBe(true);
        await expect(page.locator('.notification-progress')).not.toBeAttached();
    });

    test('Cancel button aborts the active sort controller', async () => {
        // Deterministic wiring check (no race with the real sort): install a fresh abort
        // controller, render the card, click Cancel, assert the controller was aborted.
        await page.evaluate(() => {
            window.mediaViewer.sortAbortController = new AbortController();
            window.mediaViewer.updateSortProgress({ phase: 'Sorting…', current: 1, total: 4 });
        });

        await expect(page.locator('.notification-progress')).toBeAttached();
        await page.locator('.notification-progress .progress-cancel').click({ force: true });

        await expect.poll(() => page.evaluate(() => window.mediaViewer.sortAbortController.signal.aborted)).toBe(true);
    });
});
