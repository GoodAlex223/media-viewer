# Group C: Test Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden E2E test teardown with null guards and fix a misleading unit test describe label.

**Architecture:** Mechanical edits only — add `if` guards to 7 E2E `afterEach` blocks and rename one describe string. No new files, no logic changes, no production code changes.

**Tech Stack:** Playwright (E2E), Vitest (unit)

---

## Task 1: Add afterEach null guards — simple files (5 files)

These 5 files all share the identical unguarded pattern. Each gets the same fix.

**Files:**
- Modify: `tests/e2e/fullscreen.test.js:19-22`
- Modify: `tests/e2e/zoom.test.js:14-17`
- Modify: `tests/e2e/navigation.test.js:14-17`
- Modify: `tests/e2e/compare-mode.test.js:27-30`
- Modify: `tests/e2e/undo-empty-state.test.js:16-19`

- [ ] **Step 1: Update fullscreen.test.js afterEach**

Replace the `afterEach` block at lines 19-22:

```js
// BEFORE (lines 19-22):
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });
```

- [ ] **Step 2: Update zoom.test.js afterEach**

Replace the `afterEach` block at lines 14-17:

```js
// BEFORE (lines 14-17):
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });
```

- [ ] **Step 3: Update navigation.test.js afterEach**

Replace the `afterEach` block at lines 14-17:

```js
// BEFORE (lines 14-17):
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });
```

- [ ] **Step 4: Update compare-mode.test.js afterEach**

Replace the `afterEach` block at lines 27-30:

```js
// BEFORE (lines 27-30):
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });
```

- [ ] **Step 5: Update undo-empty-state.test.js afterEach**

Replace the `afterEach` block at lines 16-19:

```js
// BEFORE (lines 16-19):
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });
```

- [ ] **Step 6: Run unit tests to verify no regressions**

Run: `npm test`
Expected: All 150 tests pass (no unit test files were changed, but sanity check).

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/fullscreen.test.js tests/e2e/zoom.test.js tests/e2e/navigation.test.js tests/e2e/compare-mode.test.js tests/e2e/undo-empty-state.test.js
git commit -m "test: add afterEach null guards to 5 E2E files

Wrap closeApp(electronApp) and tmpFixtures.cleanup() in null
checks to prevent TypeError when beforeEach throws mid-setup.
Matches pattern from app-launch.test.js and
clip-graceful-degradation.test.js."
```

---

## Task 2: Add afterEach null guards — rating.test.js (2 describe blocks)

`rating.test.js` has two separate describe blocks, each with its own `afterEach`. Both need the guard.

**Files:**
- Modify: `tests/e2e/rating.test.js:28-31` (first describe)
- Modify: `tests/e2e/rating.test.js:131-134` (second describe)

- [ ] **Step 1: Update first afterEach (line 28)**

Replace the `afterEach` block at lines 28-31:

```js
// BEFORE (lines 28-31):
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });
```

- [ ] **Step 2: Update second afterEach (line 131)**

Replace the `afterEach` block at lines 131-134:

```js
// BEFORE (lines 131-134):
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/rating.test.js
git commit -m "test: add afterEach null guards to rating.test.js

Both describe blocks (pre-seeded localStorage and Settings panel)
get electronApp/tmpFixtures null checks."
```

---

## Task 3: Add afterEach null guards — keyboard-shortcuts.test.js (extra localStorage cleanup)

This file has additional `page.evaluate()` localStorage cleanup before `closeApp`. The `page.evaluate` already has `.catch(() => {})` so it handles undefined `page` gracefully. We only need to wrap `closeApp` and `tmpFixtures.cleanup()`.

**Files:**
- Modify: `tests/e2e/keyboard-shortcuts.test.js:30-35`

- [ ] **Step 1: Update afterEach**

Replace the `afterEach` block at lines 30-35:

```js
// BEFORE (lines 30-35):
    test.afterEach(async () => {
        // Clean up custom shortcuts to prevent pollution of subsequent test files
        await page.evaluate(() => localStorage.removeItem('customShortcuts')).catch(() => {});
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

// AFTER:
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
```

Note: The `page.evaluate(...).catch(() => {})` line stays as-is — the `.catch()` already handles the case where `page` is undefined/destroyed.

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/keyboard-shortcuts.test.js
git commit -m "test: add afterEach null guards to keyboard-shortcuts.test.js

Wraps closeApp and tmpFixtures.cleanup in null checks.
Existing page.evaluate().catch() already handles page-undefined."
```

---

## Task 4: Rename misleading describe label

**Files:**
- Modify: `tests/media-viewer-utils.test.js:237`

- [ ] **Step 1: Rename the describe block**

Replace line 237:

```js
// BEFORE (line 237):
describe('keydown guard — undo in empty state', () => {

// AFTER:
describe('buildKeyString — key string construction', () => {
```

- [ ] **Step 2: Run unit tests to verify**

Run: `npm test`
Expected: All 150 tests pass. The two `buildKeyString` tests now appear under the correct label.

- [ ] **Step 3: Commit**

```bash
git add tests/media-viewer-utils.test.js
git commit -m "test: rename misleading describe label in media-viewer-utils

'keydown guard — undo in empty state' only tested buildKeyString(),
not the actual undo guard. Renamed to 'buildKeyString — key string
construction' to match contents."
```

---

## Task 5: Final verification

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: All 150 tests pass.

- [ ] **Step 2: Run E2E tests**

Run: `npm run test:e2e`
Expected: All E2E tests pass — no behavioral change, only teardown hardening.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors or new warnings.
