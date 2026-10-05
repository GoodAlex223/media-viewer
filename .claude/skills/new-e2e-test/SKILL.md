---
name: new-e2e-test
description: Create a new Playwright E2E test file for the Electron media viewer app, following project test patterns, helper utilities, and fixture conventions
---

# E2E Test Authoring

Create a new Playwright E2E test file in `tests/e2e/` following project conventions.

## Test File Template

Every E2E test file follows this structure:

```js
import { test, expect } from '@playwright/test';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    mockFolderDialog,
    createTempFixtureDir,
    waitForMedia,
    waitForNotification,
} from './helpers/electron-app.js';

test.describe('<Feature Name>', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        ({ electronApp, page } = await launchApp());
        // Optional: seed localStorage for rating/folder config
        // await seedLocalStorage(page, { customLikeFolder: tmpFixtures.likeDir });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
    });

    test.afterEach(async () => {
        // Null guards: a beforeEach that threw leaves these undefined, and a TypeError here
        // would mask the real failure (CLAUDE.md § Testing (E2E)).
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('description of behavior', async () => {
        // test body
    });
});
```

## Required Conventions

### Imports
- Always import from `'./helpers/electron-app.js'` — never create custom launch logic.
- Only import helpers you actually use.

### Lifecycle
- `launchApp()` in beforeEach — returns `{ electronApp, page }`.
- `closeApp(electronApp)` in afterEach — handles Windows process tree cleanup.
- `tmpFixtures.cleanup()` in afterEach — removes temp dirs.
- **Guard every cleanup** (`if (electronApp)`, `if (tmpFixtures)`, `if (page)`): when `beforeEach` throws, these are undefined, and an unguarded call throws a TypeError that hides the original failure. A test that needs no fixtures sets `tmpFixtures = null` and relies on the same guard.

### Fixtures
- Available in `tests/e2e/fixtures/`: `red-1x1.png`, `green-1x1.png`, `blue-1x1.png`, `normal-320x240.png`, `wide-short-64x4.png`, `static.jxl`, `tiny.mp4` (`generate.js` rebuilds the images). Note: `tiny.mp4` currently fails to load in the Playwright runs — see WEEKLY G3 before relying on video playback.
- `createTempFixtureDir(names)` copies to a temp dir with `liked/`, `disliked/`, `special/` subdirs.
- Always use temp fixtures — never reference fixture dir directly.

### Accessing MediaViewer State
- Read state: `await page.evaluate(() => window.mediaViewer.propertyName)`
- Call methods: `await page.evaluate(() => window.mediaViewer.methodName())`
- Get current file: `await page.evaluate(() => { const mv = window.mediaViewer; return mv.mediaFiles[mv.currentIndex].name; })`

### DOM Interaction Gotchas
- **Overlay interception**: `.media-container` overlay blocks pointer events on nav/rating buttons. Use `{ force: true }` on clicks or call methods via `page.evaluate()`.
- **Keyboard shortcuts**: Use `page.keyboard.press('Key')` — works without overlay issues.
- **Settings panel**: Open with `page.keyboard.press('F1')`, wait for `#helpOverlay.show`.
- **Folder dialogs**: Mock with `mockFolderDialog(electronApp, path)` before clicking browse buttons.
- **localStorage sync**: Use `seedLocalStorage(page, kvMap)` — it syncs both localStorage AND live MediaViewer instance properties.
- **Lucide CDN**: Already stubbed by `launchApp()` — no action needed.

### Waits and Timing
- `waitForMedia(page)` — wait for `.media-display` to be visible after loading.
- `waitForNotification(page, 'text')` — wait for notification with specific text.
- `page.waitForTimeout(500)` — use after file operations (move/copy) that need filesystem sync.
- `page.waitForSelector('#selector')` — wait for DOM elements.
- `page.waitForFunction(() => condition)` — wait for arbitrary JS conditions.

### Assertions
- DOM visibility: `await expect(locator).toBeVisible()` / `.toBeHidden()`
- File existence: `await expect(access(join(dir, name))).resolves.toBeUndefined()`
- State values: `expect(await page.evaluate(() => expr)).toBe(expected)`

## File Naming
- Name: `tests/e2e/<feature-name>.test.js`
- Match existing pattern: `app-launch.test.js`, `navigation.test.js`, `rating.test.js`, `compare-mode.test.js`, `fullscreen.test.js`, `zoom.test.js`

## Running
```bash
npm run test:e2e                           # all E2E tests
npx playwright test tests/e2e/file.test.js # single file
```

## Checklist Before Finalizing
- [ ] Uses `launchApp()`/`closeApp()` from helpers (never custom Electron launch)
- [ ] Cleans up temp fixtures in afterEach
- [ ] Uses `{ force: true }` for button clicks blocked by overlay
- [ ] No network dependencies (CDN already stubbed)
- [ ] Test file is in `tests/e2e/` with `.test.js` extension
- [ ] Works with `workers: 1` (no parallel assumptions)
