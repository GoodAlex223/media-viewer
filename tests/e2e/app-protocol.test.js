// G1 I1 — behaviour of the app scheme: what must keep working once the window is served from it.
import { test, expect } from '@playwright/test';
import { launchApp, closeApp } from './helpers/electron-app.js';

let electronApp;
let page;
let tmpFixtures;

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (tmpFixtures) {
        await tmpFixtures.cleanup();
        tmpFixtures = undefined;
    }
});

test('icons render from the vendored Lucide build', async () => {
    ({ electronApp, page } = await launchApp());
    expect(await page.evaluate(() => document.querySelector('script[src*="lucide"]')?.getAttribute('src'))).toBe(
        'vendor/lucide/lucide.min.js'
    );
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('svg.lucide').length)).toBeGreaterThan(0);
});
