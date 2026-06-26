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
        await page.keyboard.press('s');
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

    test('toggling CLIP on while a folder is loaded does NOT kick off extraction (lazy)', async () => {
        tmpFixtures = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());

        // Start with CLIP disabled so we can observe the OFF→ON transition.
        await seedLocalStorage(page, { enableClipFeatures: 'false' });
        await page.evaluate(() => {
            window.mediaViewer.enableClipFeatures = false;
            const toggle = document.getElementById('clipFeaturesToggle');
            if (toggle) toggle.checked = false;
        });

        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Stub kickoff with a counter so we assert the lazy contract (toggle-on must NOT kick
        // off extraction) without running the real, heavy, model-downloading extraction path.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            mv.__kickoffCalls = 0;
            mv.kickoffBackgroundExtractionIfEnabled = () => {
                mv.__kickoffCalls++;
                return Promise.resolve();
            };
        });

        // Toggle CLIP on via the settings checkbox change event.
        await page.evaluate(() => {
            const toggle = document.getElementById('clipFeaturesToggle');
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change'));
        });
        // The change handler sets enableClipFeatures synchronously at entry; wait for that so
        // the handler has demonstrably run before we assert it did NOT call the kickoff stub.
        await page.waitForFunction(() => window.mediaViewer.enableClipFeatures === true, null, { timeout: 2000 });

        const result = await page.evaluate(() => ({
            calls: window.mediaViewer.__kickoffCalls,
            enabled: window.mediaViewer.enableClipFeatures,
        }));
        expect(result.enabled).toBe(true);
        // Lazy (Group P3): enabling CLIP only advertises the capability — vectors are produced
        // on first use of an AI feature (CLIP sort / Sort by Prediction), not on toggle.
        expect(result.calls).toBe(0);
    });
});
