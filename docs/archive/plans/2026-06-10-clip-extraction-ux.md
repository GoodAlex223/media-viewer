# CLIP Extraction UX Implementation Plan

**Status: Complete (2026-06-10)** — shipped on branch `feature/clip-extraction-ux`; see [DONE.md](../../planning/DONE.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an immediate "Starting feature extraction…" toast when background CLIP/feature extraction kicks off, and make toggling CLIP on mid-folder start extraction immediately.

**Architecture:** Two surgical edits to `media-viewer.js`. (1) `kickoffBackgroundExtractionIfEnabled()` gains a `mediaFiles.length === 0` early-return and fires a transient `showNotification` toast as its first in-`try` statement. (2) The `#clipFeaturesToggle` change handler gains a toggle-on `else` branch calling `kickoffBackgroundExtractionIfEnabled()`. The empty-folder guard inside kickoff makes the toggle-on path a no-op until a folder is loaded (no surprise model download).

**Tech Stack:** Vanilla JS (ES module renderer), Vitest (unit), Playwright + Electron (E2E).

**Spec:** `docs/superpowers/specs/2026-06-10-clip-extraction-ux-design.md`

**Baseline:** Branch `feature/clip-extraction-ux` off `main` (294 unit tests).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `media-viewer.js` | Renderer UI logic (MediaViewer class) | `kickoffBackgroundExtractionIfEnabled()` (≈L8406): add guard + toast. `#clipFeaturesToggle` change handler (≈L1998): add toggle-on `else` branch. |
| `tests/media-viewer-utils.test.js` | Unit tests | Update kickoff `makeCtx`; add 2 unit tests. |
| `tests/e2e/clip-graceful-degradation.test.js` | E2E tests | Add 1 toggle-on kickoff wiring test. |

The toggle handler is an inline DOM event listener (not an extractable standalone method), so its behavior is covered by E2E rather than a unit test. Change 1's logic lives inside an extractable async method and is unit-tested.

---

## Task 1: "Starting feature extraction…" toast + empty-folder guard

**Files:**
- Modify: `media-viewer.js` (`kickoffBackgroundExtractionIfEnabled`, ≈L8406-8428)
- Test: `tests/media-viewer-utils.test.js` (`describe('kickoffBackgroundExtractionIfEnabled', …)`, L525-656)

- [x] **Step 1: Update the kickoff `makeCtx` to supply `mediaFiles` + `showNotification`**

The new production guard dereferences `this.mediaFiles.length` and the new toast calls `this.showNotification`, so the mock context needs both. This keeps the 8 existing tests green against current production code (which ignores the new fields).

In `tests/media-viewer-utils.test.js`, replace the `makeCtx` at L542-554:

```js
    function makeCtx(overrides = {}) {
        return {
            enableClipFeatures: true,
            mediaFiles: [{ path: 'a' }],
            featureWorkers: [],
            clipWorkerReady: false,
            clipModelDownloading: false,
            initializeFeaturePool: vi.fn(),
            initClipModel: vi.fn(() => Promise.resolve()),
            loadFeatureCache: vi.fn(() => Promise.resolve()),
            startBackgroundFeatureExtraction: vi.fn(() => Promise.resolve()),
            showNotification: vi.fn(),
            ...overrides,
        };
    }
```

- [x] **Step 2: Run the existing kickoff tests to confirm they still pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "kickoffBackgroundExtractionIfEnabled"`
Expected: PASS (8 tests) — the added ctx fields are inert against current code.

- [x] **Step 3: Add the two new failing tests**

Insert these two `it(...)` blocks inside the `describe('kickoffBackgroundExtractionIfEnabled', …)` block, immediately before its closing `});` (after the existing "logs error if loadFeatureCache rejects" test at L648-655):

```js
    it('shows a "starting" notification immediately when enabled with files loaded', async () => {
        const ctx = makeCtx();
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledTimes(1);
        expect(ctx.showNotification.mock.calls[0][0]).toContain('Starting feature extraction');
    });

    it('no-ops (no toast, no init) when no folder is loaded', async () => {
        const ctx = makeCtx({ mediaFiles: [] });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(ctx.initializeFeaturePool).not.toHaveBeenCalled();
        expect(ctx.loadFeatureCache).not.toHaveBeenCalled();
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).not.toHaveBeenCalled();
    });
```

- [x] **Step 4: Run the new tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "kickoffBackgroundExtractionIfEnabled"`
Expected: FAIL — the "starting" test fails (`showNotification` never called by current code); the "no-ops" test fails (current code calls `loadFeatureCache`/`initClipModel`/`startBackgroundFeatureExtraction` even with empty `mediaFiles`).

- [x] **Step 5: Implement Change 1 in `media-viewer.js`**

Replace the head of `kickoffBackgroundExtractionIfEnabled()` (L8406-8411):

```js
    async kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        try {
            if (this.featureWorkers.length === 0) {
                this.initializeFeaturePool();
            }
```

with:

```js
    async kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        // No folder loaded → nothing to extract. Also makes the CLIP toggle-on path a
        // no-op until a folder is open (avoids a surprise ~87 MB model download from a
        // settings toggle with nothing on screen).
        if (this.mediaFiles.length === 0) return;
        try {
            // Fire immediately, before the awaited cache-load / model-load, so the
            // otherwise-silent kickoff window (and the kickoff-never-fired failure
            // class) is visible. Transient info toast (auto-dismisses in 2s).
            this.showNotification('⏳ Starting feature extraction…', 'info');
            if (this.featureWorkers.length === 0) {
                this.initializeFeaturePool();
            }
```

- [x] **Step 6: Run the kickoff tests to verify all pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "kickoffBackgroundExtractionIfEnabled"`
Expected: PASS (10 tests).

- [x] **Step 7: Run the full unit suite to confirm no regressions**

Run: `npm test`
Expected: PASS (296 tests — was 294, +2).

- [x] **Step 8: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(clip): starting-extraction toast + empty-folder kickoff guard

kickoffBackgroundExtractionIfEnabled() now fires a '⏳ Starting feature
extraction…' toast immediately (before the silent cache-load/model-load
awaits) and early-returns when no folder is loaded. +2 unit tests; makeCtx
gains mediaFiles + showNotification.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: CLIP toggle-on kickoff

**Files:**
- Modify: `media-viewer.js` (`#clipFeaturesToggle` change handler, ≈L1998-2029)
- Test: `tests/e2e/clip-graceful-degradation.test.js`

- [x] **Step 1: Write the failing E2E test**

Add this test inside the `test.describe('CLIP graceful degradation', …)` block in `tests/e2e/clip-graceful-degradation.test.js`, after the existing "app starts with CLIP enabled by default" test (before the describe's closing `});` at L77):

```js
    test('toggling CLIP on while a folder is loaded kicks off extraction', async () => {
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

        // Stub kickoff with a counter so we assert the wiring (toggle-on → kickoff)
        // without running the real, heavy, model-downloading extraction path.
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
        await page.waitForTimeout(200);

        const result = await page.evaluate(() => ({
            calls: window.mediaViewer.__kickoffCalls,
            enabled: window.mediaViewer.enableClipFeatures,
        }));
        expect(result.enabled).toBe(true);
        expect(result.calls).toBe(1);
    });
```

- [x] **Step 2: Run the E2E test to verify it fails**

Run: `npm run test:e2e -- clip-graceful-degradation`
Expected: FAIL on `expect(result.calls).toBe(1)` (received 0) — the current handler has no toggle-on branch, so kickoff is never called. (`enabled` is already `true` because the handler sets `enableClipFeatures` regardless.)

- [x] **Step 3: Implement Change 2 in `media-viewer.js`**

In the `#clipFeaturesToggle` change handler, the `if (!clipToggle.checked) { … }` block currently ends like this (L2022-2030):

```js
                    try {
                        await this.deleteSortCache('clip');
                    } catch (_e) {
                        // Best-effort cleanup — deleteSortCache already shows a notification
                        // on failure. Explicit catch makes the contract obvious.
                    }
                }
            });
```

Replace it with (add the `else` branch):

```js
                    try {
                        await this.deleteSortCache('clip');
                    } catch (_e) {
                        // Best-effort cleanup — deleteSortCache already shows a notification
                        // on failure. Explicit catch makes the contract obvious.
                    }
                } else {
                    // Toggle-on: start background extraction immediately, mirroring the
                    // folder-load path (see loadFolder's kickoff call). Fire-and-forget.
                    // kickoff no-ops when no folder is loaded (guards on mediaFiles.length),
                    // so toggling CLIP on with nothing loaded won't trigger a model download.
                    this.kickoffBackgroundExtractionIfEnabled();
                }
            });
```

- [x] **Step 4: Run the E2E test to verify it passes**

Run: `npm run test:e2e -- clip-graceful-degradation`
Expected: PASS (3 tests in the file).

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/e2e/clip-graceful-degradation.test.js
git commit -m "feat(clip): kick off extraction when CLIP toggled on mid-folder

The #clipFeaturesToggle change handler gains a toggle-on else branch calling
kickoffBackgroundExtractionIfEnabled(), so enabling CLIP while a folder is
loaded starts extraction immediately instead of requiring a folder reload.
+1 E2E wiring test.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Final verification

- [x] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS (296 unit tests).

- [x] **Step 2: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: All pass except the one known pre-existing failure (`app-launch.test.js` legacy `#viewModeBtn` assertion, unrelated to this work). Record the exact count in the closeout.

- [x] **Step 3: Run lint**

Run: `npm run lint`
Expected: clean (no errors).

- [x] **Step 4: Manual smoke (hand to user)**

1. Load a folder with CLIP enabled → "⏳ Starting feature extraction…" toast appears immediately, before per-file progress.
2. Open Settings (F1), toggle CLIP off then on while the folder is loaded → extraction restarts (toast + bottom-left progress).
3. With no folder loaded, toggle CLIP on → no toast, no model download.

---

## Notes for the implementer

- **Ellipsis character:** the toast uses a real `…` (U+2026), matching the existing `Downloading CLIP model...` style is NOT required — the unit test asserts only the substring `'Starting feature extraction'`, so the trailing punctuation is free to change.
- **Do not** add a unit test for the toggle handler — it is an inline DOM listener, not an `extractMethod`-compatible standalone method; the E2E test is the correct coverage level.
- **Fire-and-forget** is intentional in Change 2 (mirrors `loadFolder`'s un-awaited kickoff call); do not `await` it inside the change handler.
- Pre-commit hook runs `vitest run` (unit only) — E2E is not gated by the hook, so run `npm run test:e2e` manually per the steps above.
