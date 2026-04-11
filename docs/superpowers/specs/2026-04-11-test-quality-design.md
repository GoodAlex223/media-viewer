# Group C: Test Quality — Design Spec

**Date**: 2026-04-11
**Branch**: `feature/test-quality`
**Source**: BACKLOG (TASK-027 PR #25 code review findings)
**Total SP**: 2
**Approach**: Direct inline fix (Approach A) — no new abstractions

---

## Item 1: E2E afterEach null safety (1 SP)

### Problem

7 of 9 E2E test files call `tmpFixtures.cleanup()` in `afterEach` without a null guard. If `createTempFixtureDir()` throws during `beforeEach` (or setup is deferred into the test body), the `afterEach` crashes with `TypeError: Cannot read properties of undefined`.

### Solution

Add `if (electronApp)` and `if (tmpFixtures)` guards to all unguarded `afterEach` blocks, matching the pattern already established in `app-launch.test.js` and `clip-graceful-degradation.test.js`.

### Target pattern

```js
test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (tmpFixtures) {
        await tmpFixtures.cleanup();
    }
});
```

### Files to modify

| File | Notes |
|------|-------|
| `tests/e2e/fullscreen.test.js` | Single `afterEach` |
| `tests/e2e/zoom.test.js` | Single `afterEach` |
| `tests/e2e/keyboard-shortcuts.test.js` | Single `afterEach` |
| `tests/e2e/navigation.test.js` | Single `afterEach` |
| `tests/e2e/rating.test.js` | 2 describe blocks, each with own `afterEach` |
| `tests/e2e/undo-empty-state.test.js` | Single `afterEach` |
| `tests/e2e/compare-mode.test.js` | Single `afterEach` |

### Files already guarded (no changes needed)

- `tests/e2e/app-launch.test.js` — guards `tmpFixtures`
- `tests/e2e/clip-graceful-degradation.test.js` — guards both `electronApp` and `tmpFixtures`

### Verification

- `npm run test:e2e` — all existing tests pass unchanged
- Guards only activate on failure paths (no behavioral change on happy path)

---

## Item 2: Fix misleading describe label (1 SP)

### Problem

`tests/media-viewer-utils.test.js` has a describe block labeled `"keydown guard — undo in empty state"` that only contains two `buildKeyString()` tests (constructing key strings from mock keyboard events). The label implies it tests undo/empty-state guard logic, which is misleading. The actual undo-in-empty-state behavior is covered by E2E tests in `undo-empty-state.test.js`.

### Solution

Rename the describe block to accurately reflect its contents.

- **Current**: `"keydown guard — undo in empty state"`
- **New**: `"buildKeyString — key string construction"`

### Files to modify

| File | Change |
|------|--------|
| `tests/media-viewer-utils.test.js` | Rename one describe label |

### Verification

- `npm test` — unit tests pass, label is accurate

---

## Scope boundaries

- No test logic changes — only guards and a label rename
- No new helpers, utilities, or abstractions
- No changes to production code
- No new test files
