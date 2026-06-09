# Mode-Switch Display Bugs (Group B) Implementation Plan

**Status: Complete** — shipped 2026-06-09 on branch `feature/mode-switch-display-bugs` (commits `8a2d932`…`0469636`). 294/294 unit tests pass; E2E 41/42 (1 known pre-existing `app-launch` failure unrelated to Group B). All 5 tasks + final whole-branch review done. See [DONE.md](../../planning/DONE.md#2026-06-09--group-b-mode-switch-display-bugs).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix two compare/single mode-switch display bugs — (1) switching compare→single after AI-sort lands on the file the user was actually viewing (the compare-left file) instead of jumping to index 0, and (2) `switchToSingleModeUI()` tears down stale compare media wrappers so folder-switch no longer leaves shrunken/shifted leftover DOM.

**Architecture:** Both fixes are localized edits in `media-viewer.js`. Bug 1 resolves the target index **at switch time** from `this.compareLeftFile` (already maintained by `showCompareMedia`) — no continuous array syncing. Bug 2 folds the wrapper-teardown that already exists inline in `moveComparePair`'s `<2 files` branch into `switchToSingleModeUI()`, then deletes the now-redundant inline block. Unit tests use the project's `extractMethod` / `extractAsyncMethod` source-extraction harness; an E2E test exercises the real DOM under Electron.

**Tech Stack:** Vanilla JS (renderer, no bundler), Vitest (unit), Playwright + Electron (E2E).

**Spec:** `docs/superpowers/specs/2026-06-08-mode-switch-display-bugs-design.md`

---

## File Structure

- `media-viewer.js` (modify):
  - `switchToSingleModeUI()` (~L4110) — add wrapper teardown (Task 1).
  - `moveComparePair()` `<2 files` branch (~L5029-5039) — delete redundant inline teardown (Task 2).
  - `_applyModeSwitch()` `single` branch (~L4157-4163) — resolve `currentIndex` from `compareLeftFile` (Task 3).
- `tests/media-viewer-utils.test.js` (modify) — unit tests for Tasks 1 and 3.
- `tests/e2e/compare-mode.test.js` (modify) — extend folder-switch test + add compare→single landing test (Task 4).

**Wrapper facts (verified):** wrappers are `document.createElement('div')` with `className = 'media-wrapper left-media-wrapper'` / `'media-wrapper right-media-wrapper'` (media-viewer.js:3104-3107), appended to `this.mediaContainer` (`.media-container`) at media-viewer.js:3215-3216, stored on `this.leftMediaWrapper` / `this.rightMediaWrapper`. Teardown elsewhere uses `this.fullscreen.cleanup(wrapper)` then `wrapper.remove()` then null (e.g. media-viewer.js:5030-5039).

---

## Task 1: `switchToSingleModeUI()` tears down compare wrappers

**Files:**
- Modify: `media-viewer.js` (method `switchToSingleModeUI`, ~L4110-4127)
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write the failing test**

Add this block to `tests/media-viewer-utils.test.js` (after the existing `describe('removeFileFromList', …)` block, anywhere at top level). It extracts the real method source and runs it against a mock context.

```js
describe('switchToSingleModeUI wrapper teardown', () => {
    const switchToSingleModeUI = extractMethod('switchToSingleModeUI');

    function makeCtx({ withWrappers }) {
        const styleStub = () => ({ display: '' });
        const classListStub = () => ({ remove: vi.fn(), add: vi.fn() });
        const ctx = {
            isCompareMode: true,
            viewModeLabel: { textContent: '' },
            controls: { style: styleStub() },
            compareControls: { style: styleStub() },
            mediaContainer: { classList: classListStub() },
            videoControls: { style: styleStub() },
            leftFileInfo: { classList: classListStub(), style: styleStub() },
            rightFileInfo: { classList: classListStub(), style: styleStub() },
            fileInfo: { style: styleStub() },
            infoToggleBtn: { style: styleStub() },
            hidePredictionBadges: vi.fn(),
            closeAllZoomPopovers: vi.fn(),
            fullscreen: { cleanup: vi.fn() },
            leftMediaWrapper: null,
            rightMediaWrapper: null,
        };
        if (withWrappers) {
            ctx.leftMediaWrapper = { remove: vi.fn() };
            ctx.rightMediaWrapper = { remove: vi.fn() };
        }
        return ctx;
    }

    it('removes and nulls both compare wrappers, cleaning up fullscreen', () => {
        const ctx = makeCtx({ withWrappers: true });
        const left = ctx.leftMediaWrapper;
        const right = ctx.rightMediaWrapper;

        switchToSingleModeUI.call(ctx);

        expect(ctx.fullscreen.cleanup).toHaveBeenCalledWith(left);
        expect(ctx.fullscreen.cleanup).toHaveBeenCalledWith(right);
        expect(left.remove).toHaveBeenCalledTimes(1);
        expect(right.remove).toHaveBeenCalledTimes(1);
        expect(ctx.leftMediaWrapper).toBeNull();
        expect(ctx.rightMediaWrapper).toBeNull();
    });

    it('is a no-op for wrapper teardown when wrappers are already null', () => {
        const ctx = makeCtx({ withWrappers: false });
        expect(() => switchToSingleModeUI.call(ctx)).not.toThrow();
        expect(ctx.fullscreen.cleanup).not.toHaveBeenCalled();
        expect(ctx.leftMediaWrapper).toBeNull();
        expect(ctx.rightMediaWrapper).toBeNull();
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "wrapper teardown"`
Expected: FAIL — the first test fails because the current `switchToSingleModeUI` never calls `fullscreen.cleanup` / `wrapper.remove` / nulls the wrappers (`expect(ctx.fullscreen.cleanup).toHaveBeenCalledWith(left)` → received 0 calls).

- [x] **Step 3: Write minimal implementation**

In `media-viewer.js`, edit `switchToSingleModeUI()` to add the teardown loop just before the final `this.hidePredictionBadges();` line. The method currently ends:

```js
        this.fileInfo.style.display = 'block';
        if (this.infoToggleBtn) {
            this.infoToggleBtn.style.display = 'flex';
        }
        this.hidePredictionBadges();
        this.closeAllZoomPopovers();
    }
```

Change it to:

```js
        this.fileInfo.style.display = 'block';
        if (this.infoToggleBtn) {
            this.infoToggleBtn.style.display = 'flex';
        }
        // Tear down stale compare wrappers so exit-to-single paths (mode switch, folder
        // switch, <2-files fallback) never leave shrunken/shifted leftover nodes. Wrappers
        // are recreated by showCompareMedia on the next compare entry, so removal is safe.
        for (const key of ['leftMediaWrapper', 'rightMediaWrapper']) {
            const wrapper = this[key];
            if (wrapper) {
                this.fullscreen.cleanup(wrapper);
                wrapper.remove();
                this[key] = null;
            }
        }
        this.hidePredictionBadges();
        this.closeAllZoomPopovers();
    }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "wrapper teardown"`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(compare): tear down stale compare wrappers in switchToSingleModeUI

Folder-switch in compare mode left old .left-media-wrapper/.right-media-wrapper
nodes shrunken on screen. Fold the wrapper teardown into switchToSingleModeUI so
every exit-to-single path removes them. +2 unit tests.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Delete the now-redundant inline teardown in `moveComparePair`

**Files:**
- Modify: `media-viewer.js` (method `moveComparePair`, `<2 files` branch, ~L5029-5041)

The `<2 files remain` branch removes the wrappers manually and *then* calls `switchToSingleModeUI()`. After Task 1, `switchToSingleModeUI()` does the teardown itself, so the manual block is dead code. Remove it (DRY).

- [x] **Step 1: Remove the redundant block**

In `media-viewer.js`, inside `moveComparePair`'s `if (this.mediaFiles.length < 2) {` branch, the current code reads:

```js
                this.pendingCompareRefresh = false;
                this.pendingCompareUpdates = 0;
                this.previousScores = null;

                // Clean up stale compare-mode wrapper DOM elements
                if (this.leftMediaWrapper) {
                    this.fullscreen.cleanup(this.leftMediaWrapper);
                    this.leftMediaWrapper.remove();
                    this.leftMediaWrapper = null;
                }
                if (this.rightMediaWrapper) {
                    this.fullscreen.cleanup(this.rightMediaWrapper);
                    this.rightMediaWrapper.remove();
                    this.rightMediaWrapper = null;
                }

                this.switchToSingleModeUI();
                this.updateFolderInfo();
```

Replace it with (delete the wrapper block; `switchToSingleModeUI()` now handles it):

```js
                this.pendingCompareRefresh = false;
                this.pendingCompareUpdates = 0;
                this.previousScores = null;

                // switchToSingleModeUI() tears down the stale compare wrappers.
                this.switchToSingleModeUI();
                this.updateFolderInfo();
```

- [x] **Step 2: Run the full unit suite to verify no regression**

Run: `npx vitest run`
Expected: PASS — 291 tests (289 prior + 2 from Task 1). No test asserted on the deleted inline block, so nothing breaks.

- [x] **Step 3: Lint the changed file**

Run: `npx eslint media-viewer.js`
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "refactor(compare): drop redundant wrapper teardown in moveComparePair

switchToSingleModeUI now owns wrapper teardown (prior commit); the inline block
in the <2-files branch is dead code.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `_applyModeSwitch` single branch lands on the compare-left file

**Files:**
- Modify: `media-viewer.js` (method `_applyModeSwitch`, `single` branch, ~L4157-4163)
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write the failing test**

Add this block to `tests/media-viewer-utils.test.js` at top level. `_applyModeSwitch` is `async` and calls `document.querySelectorAll('.mode-btn')`, so the test stubs `globalThis.document` and uses `extractAsyncMethod`.

```js
describe('_applyModeSwitch single-branch landing index', () => {
    const _applyModeSwitch = extractAsyncMethod('_applyModeSwitch');
    let origDocument;

    beforeEach(() => {
        origDocument = globalThis.document;
        globalThis.document = { querySelectorAll: () => [] };
    });
    afterEach(() => {
        globalThis.document = origDocument;
    });

    function makeCtx(mediaFilePaths, compareLeftFile) {
        return {
            isTournamentMode: false,
            isCompareMode: true,
            mediaFiles: mediaFilePaths.map((p) => ({ path: p })),
            compareLeftFile,
            currentIndex: 0,
            exitTournamentMode: vi.fn(),
            switchToSingleModeUI: vi.fn(),
            toggleViewMode: vi.fn(),
            enterTournamentMode: vi.fn(),
            updateCompareUndoButton: vi.fn(),
            showMedia: vi.fn(),
        };
    }

    it('lands on the compare-left file index', async () => {
        const files = ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg'];
        const ctx = makeCtx(files, { path: '/c.jpg' });
        await _applyModeSwitch.call(ctx, 'single');
        expect(ctx.currentIndex).toBe(2);
        expect(ctx.showMedia).toHaveBeenCalledTimes(1);
    });

    it('falls back to 0 when compareLeftFile is null', async () => {
        const ctx = makeCtx(['/a.jpg', '/b.jpg'], null);
        await _applyModeSwitch.call(ctx, 'single');
        expect(ctx.currentIndex).toBe(0);
    });

    it('falls back to 0 when compareLeftFile is absent from mediaFiles', async () => {
        const ctx = makeCtx(['/a.jpg', '/b.jpg'], { path: '/gone.jpg' });
        await _applyModeSwitch.call(ctx, 'single');
        expect(ctx.currentIndex).toBe(0);
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "single-branch landing index"`
Expected: FAIL — the first test fails: current code hard-sets `currentIndex = 0`, so `expect(ctx.currentIndex).toBe(2)` receives `0`.

- [x] **Step 3: Write minimal implementation**

In `media-viewer.js`, edit the `single` branch of `_applyModeSwitch`. Current:

```js
        if (mode === 'single') {
            if (this.isTournamentMode) this.exitTournamentMode();
            if (this.isCompareMode) this.switchToSingleModeUI();
            if (this.mediaFiles.length > 0) {
                this.currentIndex = 0;
                this.showMedia();
            }
        } else if (mode === 'compare') {
```

Change to (capture the on-screen compare-left file BEFORE switchToSingleModeUI, then resolve its index):

```js
        if (mode === 'single') {
            if (this.isTournamentMode) this.exitTournamentMode();
            // Land single view on the file the user was actually viewing — the left file of
            // the current compare pair (filesWithScores[mlComparePairIndex] when AI-sorted).
            // Capture before switchToSingleModeUI runs. -1 (null / just-rated / removed) → 0.
            const target = this.compareLeftFile;
            if (this.isCompareMode) this.switchToSingleModeUI();
            if (this.mediaFiles.length > 0) {
                const idx = target ? this.mediaFiles.findIndex((f) => f.path === target.path) : -1;
                this.currentIndex = idx >= 0 ? idx : 0;
                this.showMedia();
            }
        } else if (mode === 'compare') {
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "single-branch landing index"`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(compare): land single view on the on-screen compare-left file

After AI-sort + navigating pairs, switching compare->single jumped to index 0
instead of the file on screen. Resolve currentIndex from compareLeftFile at
switch time (-1 fallback to 0). +3 unit tests.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: E2E coverage

**Files:**
- Modify: `tests/e2e/compare-mode.test.js`

- [x] **Step 1: Extend the folder-switch test with a stale-wrapper assertion**

In `tests/e2e/compare-mode.test.js`, inside the existing test `'resets to single mode when switching folders in compare mode'`, add this assertion just before the closing `} finally {` (after the `compare-mode` class assertion at ~L249):

```js
            // No stale compare wrapper nodes should remain after the folder switch.
            const wrapperCount = await page.evaluate(
                () =>
                    document.querySelectorAll('.left-media-wrapper, .right-media-wrapper').length
            );
            expect(wrapperCount).toBe(0);
```

- [x] **Step 2: Add a compare→single landing test**

Add this test inside the same top-level `describe(...)` block in `tests/e2e/compare-mode.test.js` (e.g. right after the folder-switch test, before the closing `});` at the end of the file). It enters compare while AI-sorted, navigates one pair, switches to single, and asserts the single media element shows the file that was the compare-left.

```js
    test('compare->single lands on the on-screen compare-left file', async () => {
        // Force an AI-sorted compare state with a known pair, bypassing the ML pipeline.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            mv.isSortedByPrediction = true;
            mv.predictionScores = new Map(mv.mediaFiles.map((f, i) => [f.path, 1 - i * 0.1]));
        });
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Advance one pair so the left file is NOT mediaFiles[0].
        await page.evaluate(() => {
            window.mediaViewer.mlComparePairIndex = 1;
            return window.mediaViewer.showCompareMedia();
        });
        await page.waitForTimeout(500);

        const leftName = await page.evaluate(() => window.mediaViewer.compareLeftFile?.name);
        expect(leftName).toBeTruthy();

        // Switch to single mode.
        await page.evaluate(() => window.mediaViewer._applyModeSwitch('single'));
        await waitForMedia(page);

        // currentIndex must point at the former compare-left file.
        const currentName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex]?.name;
        });
        expect(currentName).toBe(leftName);
    });
```

- [x] **Step 3: Run the E2E suite for compare-mode**

Run: `npx playwright test tests/e2e/compare-mode.test.js`
Expected: PASS — all compare-mode tests, including the two additions. (If the harness needs the full E2E command, use `npm run test:e2e -- compare-mode`.)

Note: this requires ≥3 fixtures so `mlComparePairIndex = 1` selects a distinct pair. The `beforeEach` in this file seeds the default fixture set (all 3 PNGs) — confirm the test's folder has ≥3 files; if the file's `beforeEach` loads a smaller set, load the default 3-PNG temp dir at the top of this test via `createTempFixtureDir()` + `loadFolder(page, dir)` inside a `try/finally` (mirror the folder-switch test's pattern) before the AI-sort setup.

- [x] **Step 4: Commit**

```bash
git add tests/e2e/compare-mode.test.js
git commit -m "test(e2e): cover compare wrapper teardown + compare->single landing

Folder-switch test asserts no stale .left/.right-media-wrapper nodes remain; new
test verifies compare->single lands on the on-screen compare-left file.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full verification + closeout

**Files:** none (verification only)

- [x] **Step 1: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — 294 tests (289 prior + 2 Task 1 + 3 Task 3).

- [x] **Step 2: Lint everything**

Run: `npm run lint`
Expected: no errors.

- [x] **Step 3: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS for compare-mode additions. Note: `app-launch.test.js` has one known pre-existing failure (asserts hidden legacy `#viewModeBtn`, unrelated to this work) — record the exact pass/fail counts; do not treat that single known failure as a regression, but confirm no *new* failures.

- [x] **Step 4: Manual smoke (hand to user)**

Manual scenarios for the user to confirm before merge:
1. Load a folder, Sort by Prediction, enter Compare, press the next-pair key (A/S) once or twice, then switch to Single — Single shows the file that was on the compare **left**.
2. In Compare mode, load a different folder — new media renders cleanly in Single with no shrunken/leftover panes on the left.
3. Non-AI Compare (no sort), switch to Single — stays on the same (left) file; no visual artifacts.

- [x] **Step 5: Report results**

Summarize: unit count (X/X), lint clean, E2E counts (X/Y, noting the known `app-launch` failure if present), and the manual smoke outcome. Do not claim complete until the user confirms the manual smoke.

---

## Self-Review Notes

- **Spec coverage:** Change 1 → Task 3; Change 2 → Task 1 (+ Task 2 DRY cleanup); unit tests → Tasks 1 & 3; E2E → Task 4; acceptance criteria 1-4 → Tasks 3/4 (criteria 1,3) + Task 1/4 (criterion 2) + Task 5 (criterion 4).
- **Selector correction vs spec:** the spec mentioned `.media-wrapper-left/right`; the actual classes are `left-media-wrapper` / `right-media-wrapper` (verified at media-viewer.js:3105-3107). The plan uses the correct selectors.
- **Type/name consistency:** `compareLeftFile`, `leftMediaWrapper`, `rightMediaWrapper`, `fullscreen.cleanup`, `switchToSingleModeUI`, `_applyModeSwitch` all match current source.
- **Test counts:** 289 (current) → 291 (after Task 1) → 294 (after Task 3). Task 2 changes none.
