# CLIP Extraction Silent Failure Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `startBackgroundFeatureExtraction()` into `loadFolder()` so CLIP `clipCache` populates automatically on folder load when `enableClipFeatures === true`. Resolves the bug where the user enables CLIP, opens a fresh folder, waits 60+ seconds, and CLIP sort throws `"Only 0 files have CLIP embeddings"` because background extraction never fired.

**Architecture:** Add a small instance method `kickoffBackgroundExtractionIfEnabled()` to `MediaViewer` that gates on `enableClipFeatures` and idempotently lazy-inits the feature worker pool + CLIP model before fire-and-forget calling the existing extraction pipeline. Call it once from `loadFolder()` after `updateFolderInfo()`. The extraction pipeline itself is unchanged. CLIP-disabled folder loads remain a no-op.

**Tech Stack:** Vanilla JS (renderer), Vitest (unit), existing `extractMethod()` test helper at [tests/media-viewer-utils.test.js:15-47](../../../tests/media-viewer-utils.test.js#L15-L47), Husky pre-commit hook (runs `npx vitest run`).

**Spec:** [docs/superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md](../specs/2026-05-06-clip-extraction-silent-failure-design.md)

**Branch:** `fix/clip-extraction-silent-failure` (already created, spec already committed at `c1379b7`)

---

## Pre-archive Checklist (run before archiving this plan)

- [ ] Flip all `- [ ]` task checkboxes → `- [x]`
- [ ] Add `**Status: Complete**` header at the top of this file
- [ ] Add this file to `docs/README.md` index
- [ ] Move this file from `docs/superpowers/plans/` to `docs/archive/plans/`
- [ ] Delete the original from `docs/superpowers/plans/` (recurring drift — see CLAUDE.md gotcha)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| [media-viewer.js](../../../media-viewer.js) | Renderer, `MediaViewer` class | Add `kickoffBackgroundExtractionIfEnabled()` method near `startBackgroundFeatureExtraction()` (currently line ~6931); call it from `loadFolder()` after `updateFolderInfo()` (currently line ~2268) |
| [tests/media-viewer-utils.test.js](../../../tests/media-viewer-utils.test.js) | Unit tests for renderer methods | Add new `describe('kickoffBackgroundExtractionIfEnabled', …)` block with 6 test cases; reuses existing `extractMethod()` helper |

No other files modified during implementation. Post-merge cleanup (Task 9) updates `CLAUDE.md`, `docs/planning/DONE.md`, and archives the spec/plan.

---

## Task 1: Test that CLIP-disabled returns without side effects

**Files:**
- Modify: `tests/media-viewer-utils.test.js` (append new describe block at end of file)
- Modify: `media-viewer.js` (add stub method near line 6931)
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Append the new describe block scaffold + first test to `tests/media-viewer-utils.test.js`**

Append at the end of the file (after the last existing `describe` block):

```js
describe('kickoffBackgroundExtractionIfEnabled', () => {
    let originalWindow;

    beforeEach(() => {
        originalWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                logError: vi.fn(),
            },
        };
    });

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    function makeCtx(overrides = {}) {
        return {
            enableClipFeatures: true,
            featureWorkers: [],
            clipWorkerReady: false,
            clipModelDownloading: false,
            initializeFeaturePool: vi.fn(),
            initClipModel: vi.fn(),
            startBackgroundFeatureExtraction: vi.fn(() => Promise.resolve()),
            ...overrides,
        };
    }

    it('does nothing when CLIP is disabled', () => {
        const fn = extractMethod('kickoffBackgroundExtractionIfEnabled');
        const ctx = makeCtx({ enableClipFeatures: false });
        fn.call(ctx);
        expect(ctx.initializeFeaturePool).not.toHaveBeenCalled();
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the test — verify it fails because the method does not exist**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t kickoffBackgroundExtractionIfEnabled
```

Expected: FAIL — error message contains `"Could not find method: kickoffBackgroundExtractionIfEnabled"` (thrown by `extractMethod()` at [tests/media-viewer-utils.test.js:20](../../../tests/media-viewer-utils.test.js#L20)).

- [ ] **Step 3: Add a minimal stub method to `media-viewer.js`**

Locate `async startBackgroundFeatureExtraction()` (currently line ~6931). Insert the new method **immediately before** it (preserve indentation: 4 spaces, class-method style):

```js
    kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
    }

```

(Leave a blank line between the new method's closing `}` and the existing `async startBackgroundFeatureExtraction()` declaration, per the file's existing style.)

- [ ] **Step 4: Run the test — verify it passes**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t kickoffBackgroundExtractionIfEnabled
```

Expected: PASS — 1 test passed (`does nothing when CLIP is disabled`).

- [ ] **Step 5: Commit**

```bash
git add tests/media-viewer-utils.test.js media-viewer.js
git commit -m "test(clip-kickoff): no-op when enableClipFeatures is false"
```

---

## Task 2: Test happy path — fresh state triggers all three init/extract calls

**Files:**
- Modify: `tests/media-viewer-utils.test.js` (add second test inside the same describe)
- Modify: `media-viewer.js` (extend `kickoffBackgroundExtractionIfEnabled` body)

- [ ] **Step 1: Add the second test inside the existing describe block**

Add this `it(...)` block immediately after the first one in the `describe('kickoffBackgroundExtractionIfEnabled', …)` block:

```js
    it('initializes feature pool, CLIP model, and starts extraction on fresh state', () => {
        const fn = extractMethod('kickoffBackgroundExtractionIfEnabled');
        const ctx = makeCtx();
        fn.call(ctx);
        expect(ctx.initializeFeaturePool).toHaveBeenCalledTimes(1);
        expect(ctx.initClipModel).toHaveBeenCalledTimes(1);
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });
```

- [ ] **Step 2: Run the test — verify it fails (method body is empty after the early return)**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t "initializes feature pool"
```

Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times`.

- [ ] **Step 3: Extend the method body in `media-viewer.js`**

Replace the stub method body so it now reads:

```js
    kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        this.initializeFeaturePool();
        this.initClipModel();
        this.startBackgroundFeatureExtraction();
    }
```

- [ ] **Step 4: Run the new test — verify it passes**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t kickoffBackgroundExtractionIfEnabled
```

Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add tests/media-viewer-utils.test.js media-viewer.js
git commit -m "feat(clip-kickoff): init feature pool, CLIP model, and start extraction"
```

---

## Task 3: Idempotency — skip `initializeFeaturePool` when workers already exist

**Files:**
- Modify: `tests/media-viewer-utils.test.js`
- Modify: `media-viewer.js`

- [ ] **Step 1: Add the third test inside the existing describe block**

```js
    it('skips initializeFeaturePool when workers already exist', () => {
        const fn = extractMethod('kickoffBackgroundExtractionIfEnabled');
        const ctx = makeCtx({ featureWorkers: [{}] });
        fn.call(ctx);
        expect(ctx.initializeFeaturePool).not.toHaveBeenCalled();
        expect(ctx.initClipModel).toHaveBeenCalledTimes(1);
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });
```

- [ ] **Step 2: Run the test — verify it fails**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t "skips initializeFeaturePool"
```

Expected: FAIL — `expected "spy" not to be called`.

- [ ] **Step 3: Add the `featureWorkers.length === 0` guard in `media-viewer.js`**

Replace the method body so it now reads:

```js
    kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        if (this.featureWorkers.length === 0) {
            this.initializeFeaturePool();
        }
        this.initClipModel();
        this.startBackgroundFeatureExtraction();
    }
```

- [ ] **Step 4: Run all tests in this describe — verify all 3 pass**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t kickoffBackgroundExtractionIfEnabled
```

Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add tests/media-viewer-utils.test.js media-viewer.js
git commit -m "feat(clip-kickoff): guard initializeFeaturePool when workers exist"
```

---

## Task 4: Idempotency — skip `initClipModel` when CLIP is already ready

**Files:**
- Modify: `tests/media-viewer-utils.test.js`
- Modify: `media-viewer.js`

- [ ] **Step 1: Add the fourth test inside the existing describe block**

```js
    it('skips initClipModel when CLIP is already ready', () => {
        const fn = extractMethod('kickoffBackgroundExtractionIfEnabled');
        const ctx = makeCtx({ clipWorkerReady: true });
        fn.call(ctx);
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });
```

- [ ] **Step 2: Run the test — verify it fails**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t "skips initClipModel when CLIP is already ready"
```

Expected: FAIL — `expected "spy" not to be called`.

- [ ] **Step 3: Add the `clipWorkerReady` guard in `media-viewer.js`** (intentionally minimal — does not yet handle `clipModelDownloading`; that's Task 5)

Replace the method body so it now reads:

```js
    kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        if (this.featureWorkers.length === 0) {
            this.initializeFeaturePool();
        }
        if (!this.clipWorkerReady) {
            this.initClipModel();
        }
        this.startBackgroundFeatureExtraction();
    }
```

- [ ] **Step 4: Run all tests in this describe — verify all 4 pass**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t kickoffBackgroundExtractionIfEnabled
```

Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add tests/media-viewer-utils.test.js media-viewer.js
git commit -m "feat(clip-kickoff): guard initClipModel when ready"
```

---

## Task 5: Idempotency — skip `initClipModel` when download is already in progress

**Files:**
- Modify: `tests/media-viewer-utils.test.js`
- Modify: `media-viewer.js`

- [ ] **Step 1: Add the fifth test inside the existing describe block**

```js
    it('skips initClipModel when download is in progress', () => {
        const fn = extractMethod('kickoffBackgroundExtractionIfEnabled');
        const ctx = makeCtx({ clipModelDownloading: true });
        fn.call(ctx);
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });
```

- [ ] **Step 2: Run the test — verify it fails**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t "skips initClipModel when download is in progress"
```

Expected: FAIL — `expected "spy" not to be called` (current guard only checks `clipWorkerReady`).

- [ ] **Step 3: Extend the `initClipModel` guard to also check `clipModelDownloading`**

Replace the method body so it now reads:

```js
    kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        if (this.featureWorkers.length === 0) {
            this.initializeFeaturePool();
        }
        if (!this.clipWorkerReady && !this.clipModelDownloading) {
            this.initClipModel();
        }
        this.startBackgroundFeatureExtraction();
    }
```

- [ ] **Step 4: Run all tests in this describe — verify all 5 pass**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t kickoffBackgroundExtractionIfEnabled
```

Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add tests/media-viewer-utils.test.js media-viewer.js
git commit -m "feat(clip-kickoff): also skip initClipModel during download"
```

---

## Task 6: Catch and log rejected extraction promises

**Files:**
- Modify: `tests/media-viewer-utils.test.js`
- Modify: `media-viewer.js`

- [ ] **Step 1: Add the sixth test inside the existing describe block**

```js
    it('logs error via window.electronAPI.logError when extraction rejects', async () => {
        const fn = extractMethod('kickoffBackgroundExtractionIfEnabled');
        const ctx = makeCtx({
            startBackgroundFeatureExtraction: vi.fn(() => Promise.reject(new Error('boom'))),
        });
        fn.call(ctx);
        // Allow the .catch handler to run on the next microtask
        await Promise.resolve();
        await Promise.resolve();
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledTimes(1);
        const msg = globalThis.window.electronAPI.logError.mock.calls[0][0];
        expect(msg).toContain('boom');
    });
```

- [ ] **Step 2: Run the test — verify it fails AND verify the unhandled rejection symptom**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t "logs error via window.electronAPI.logError"
```

Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times`. (The current method does not catch the rejection; vitest may also surface an unhandled-rejection warning — that's also a sign the catch is missing.)

- [ ] **Step 3: Add the `.catch` handler to the extraction call in `media-viewer.js`**

Replace the method body so it now reads:

```js
    kickoffBackgroundExtractionIfEnabled() {
        if (!this.enableClipFeatures) return;
        if (this.featureWorkers.length === 0) {
            this.initializeFeaturePool();
        }
        if (!this.clipWorkerReady && !this.clipModelDownloading) {
            this.initClipModel();
        }
        this.startBackgroundFeatureExtraction().catch((err) => {
            if (window.electronAPI?.logError) {
                window.electronAPI.logError(`Background extraction failed: ${err?.message ?? err}`);
            }
        });
    }
```

- [ ] **Step 4: Run all tests in this describe — verify all 6 pass**

Run:
```
npx vitest run tests/media-viewer-utils.test.js -t kickoffBackgroundExtractionIfEnabled
```

Expected: PASS — 6 tests passed, no unhandled-rejection warnings.

- [ ] **Step 5: Commit**

```bash
git add tests/media-viewer-utils.test.js media-viewer.js
git commit -m "feat(clip-kickoff): catch and log extraction failures via logError"
```

---

## Task 7: Wire the kickoff into `loadFolder()`

**Files:**
- Modify: `media-viewer.js` — `loadFolder()` body, currently at lines [2220-2280](../../../media-viewer.js#L2220-L2280)

This task has no automated test — `loadFolder()` is too DOM-heavy for the `extractMethod()` pattern (it touches `electronAPI`, `mediaContainer`, the lifecycle of `showMedia()`, etc.). The unit tests from Tasks 1-6 plus the manual repro in Task 8 cover correctness.

- [ ] **Step 1: Locate the call site**

In `media-viewer.js`, find this block inside `loadFolder()` (currently around lines 2266-2273):

```js
            this.switchToSingleModeUI();
            this.hideDropZone();
            await this.showMedia();
            this.updateFolderInfo();

            console.log(`Successfully loaded ${this.mediaFiles.length} media files`);

            // Update ML button state (actual initialization happens when user clicks the button)
            this.updateSortPredictionButton();
```

- [ ] **Step 2: Insert the kickoff call between `updateFolderInfo()` and the `console.log`**

The block should now read:

```js
            this.switchToSingleModeUI();
            this.hideDropZone();
            await this.showMedia();
            this.updateFolderInfo();

            this.kickoffBackgroundExtractionIfEnabled();

            console.log(`Successfully loaded ${this.mediaFiles.length} media files`);

            // Update ML button state (actual initialization happens when user clicks the button)
            this.updateSortPredictionButton();
```

- [ ] **Step 3: Run the full unit test suite — verify nothing else broke**

Run:
```
npm test
```

Expected: PASS — total test count is `prior + 6` (e.g., if prior was 171, new total is 177). All test files green.

- [ ] **Step 4: Run the linter — verify no new warnings**

Run:
```
npm run lint
```

Expected: no errors. (Existing warnings unchanged — do not introduce new ones.)

- [ ] **Step 5: Run Prettier check — verify formatting**

Run:
```
npm run format:check
```

Expected: all files report `(unchanged)`.

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js
git commit -m "fix(clip): trigger background extraction on folder load"
```

---

## Task 8: Manual repro verification (acceptance criteria from spec)

**Files:** none (manual testing). Document the result in the next task's commit.

- [ ] **Step 1: Start the app**

Run:
```
npm start
```

- [ ] **Step 2: Confirm CLIP is enabled**

Press **F1** to open Settings. Confirm the "Enable CLIP semantic features" checkbox is checked. Close Settings.

- [ ] **Step 3: Open a fresh folder (no prior `.feature_cache.json`)**

Use a folder containing several images (e.g., 10+ JPGs/PNGs) that has never been opened by this app. To force a fresh state, delete any pre-existing `.feature_cache.json` in that folder before opening.

- [ ] **Step 4: Within ~5 seconds, observe the extraction progress bar**

Expected: Progress bar appears bottom-center showing `0/N — extracting…` (where N = total files). On first-ever CLIP use, you may also see the "Downloading CLIP model… X%" notification. Wait until extraction completes (notification: `"Feature extraction complete — N files in Xs"`).

- [ ] **Step 5: Confirm `.feature_cache.json` was written**

Check the folder: a `.feature_cache.json` file should now exist with non-empty `clipVector` entries. (Hidden file — show hidden files in Explorer if needed.)

- [ ] **Step 6: Click Sort-by-Similarity with the `clip` algorithm**

Open the algorithm dropdown next to the Sort button, select `clip`, then click **Sort by Similarity**. Expected: sort proceeds without throwing `"Only 0 files have CLIP embeddings."`. Files reorder by visual similarity.

- [ ] **Step 7: Negative test — disable CLIP, switch folders, confirm no kickoff**

Open Settings (F1), uncheck "Enable CLIP semantic features", close Settings. Switch to a different folder. Expected: no progress bar, no `.feature_cache.json` written. (Confirms the `enableClipFeatures` gate.)

- [ ] **Step 8: Re-enable CLIP for normal use**

Open Settings, re-check the checkbox, close Settings. (Restores default state for subsequent testing.)

If any step fails, return to Task 6/7 and debug. Do not proceed to Task 9 until all manual steps pass.

---

## Task 9: Post-implementation cleanup

**Files:**
- Modify: `docs/planning/DONE.md` — add Group A entry
- Modify: `docs/planning/WEEKLY.md` — mark Group A complete
- Modify: `docs/planning/BACKLOG.md` — remove the "CLIP background extraction silent failure" entry (now resolved)
- Move: `docs/superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md` → `docs/archive/specs/` (if that convention exists; otherwise leave in place)
- Move: `docs/superpowers/plans/2026-05-06-clip-extraction-silent-failure.md` → `docs/archive/plans/`
- Modify: `docs/README.md` — add archived plan to index

The auto-memory:memory-updater agent will sync `CLAUDE.md` automatically post-merge. Do not edit `CLAUDE.md` manually in this task.

- [ ] **Step 1: Add Group A entry to `docs/planning/DONE.md`**

Add a new entry at the top of the "Completed" section (or follow the existing chronological pattern in the file). Use this template, filling in dates and the actual unit/E2E test counts from `npm test` and `npm run test:e2e`:

```markdown
### Group A: CLIP Extraction Silent Failure (2026-05-XX)

**Branch**: `fix/clip-extraction-silent-failure`
**Plan**: [docs/archive/plans/2026-05-06-clip-extraction-silent-failure.md](../archive/plans/2026-05-06-clip-extraction-silent-failure.md)
**Spec**: [docs/superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md](../superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md)

**Summary**: Wired `startBackgroundFeatureExtraction()` into `loadFolder()` via new `kickoffBackgroundExtractionIfEnabled()` helper. Resolves blocker where CLIP-enabled fresh-folder loads silently produced no `.feature_cache.json` and CLIP sort threw `"Only 0 files have CLIP embeddings"`.

**Key changes**:
- New method `kickoffBackgroundExtractionIfEnabled()` on `MediaViewer` (gates on `enableClipFeatures`, idempotently lazy-inits `initializeFeaturePool` + `initClipModel`, fire-and-forget calls `startBackgroundFeatureExtraction` with `.catch(logError)`)
- Called from `loadFolder()` after `updateFolderInfo()`
- 6 unit tests in `tests/media-viewer-utils.test.js` (no-op when CLIP off, fresh-state happy path, 3 idempotency cases, error logging)

**Test results**: <FILL_IN>/<FILL_IN> unit tests pass, <FILL_IN>/<FILL_IN> E2E tests pass.
```

- [ ] **Step 2: Update `docs/planning/WEEKLY.md`**

Find the "Group A: CLIP Extraction Silent Failure" section under "Task Groups". Change the status row in the Summary Table from `Planned` to `Complete (YYYY-MM-DD)`. In the Group A task list, flip `- [ ]` to `- [x]` for the single bullet. In the "Daily Schedule" Monday section, flip the bullet's checkbox.

- [ ] **Step 3: Remove the resolved BACKLOG entry**

In `docs/planning/BACKLOG.md`, locate the entry titled `CLIP background extraction may silently not fire on folder load` (added 2026-05-03). Remove the entire entry (the heading and its body). If the file uses bullet lists rather than headings, remove just the bullet.

- [ ] **Step 4: Run pre-archive checklist on this plan**

Open this file (`docs/superpowers/plans/2026-05-06-clip-extraction-silent-failure.md`). At the top, change the "Pre-archive Checklist" section: flip `- [ ]` to `- [x]` for each item as you complete it. Add a new line at the very top of the file:
```markdown
**Status: Complete** (2026-05-XX)
```

- [ ] **Step 5: Move plan file to archive**

Run:
```
git mv docs/superpowers/plans/2026-05-06-clip-extraction-silent-failure.md docs/archive/plans/2026-05-06-clip-extraction-silent-failure.md
```

If the spec also has an archive convention (check `docs/archive/specs/` exists; if not, skip the spec move):
```
git mv docs/superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md docs/archive/specs/2026-05-06-clip-extraction-silent-failure-design.md
```

- [ ] **Step 6: Update `docs/README.md`**

Add a line under the archived-plans index for `2026-05-06-clip-extraction-silent-failure.md` (and the spec, if you moved it). Match the existing entry format in the README.

- [ ] **Step 7: Final sanity run — full test suite**

Run:
```
npm test
```

Expected: full suite green. Then:
```
npm run lint
npm run format:check
```

Both should report clean.

- [ ] **Step 8: Commit the docs changes**

```bash
git add docs/planning/DONE.md docs/planning/WEEKLY.md docs/planning/BACKLOG.md docs/README.md docs/archive/plans/2026-05-06-clip-extraction-silent-failure.md
git commit -m "docs: archive Group A plan, mark CLIP extraction fix complete"
```

(Add the spec-move path to `git add` if you moved the spec in Step 5.)

- [ ] **Step 9: Push branch and open PR**

```bash
git push -u origin fix/clip-extraction-silent-failure
gh pr create --title "fix(clip): trigger background extraction on folder load (Group A)" --body "$(cat <<'EOF'
## Summary
- Wires `startBackgroundFeatureExtraction()` into `loadFolder()` via new `kickoffBackgroundExtractionIfEnabled()` helper
- Resolves WEEKLY.md Group A blocker — CLIP-enabled fresh-folder loads now populate `clipCache` automatically
- 6 new unit tests in `tests/media-viewer-utils.test.js`

## Test plan
- [x] All unit tests pass (`npm test`)
- [x] All E2E tests pass (`npm run test:e2e`)
- [x] Manual repro from spec (Task 8) — fresh folder + CLIP enabled → progress bar appears, `.feature_cache.json` written, CLIP sort works
- [x] Negative path — CLIP disabled → no kickoff, no progress bar
- [x] Lint + format checks clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After PR opens, return the URL to the user. Do not merge — wait for review.

---

## Self-Review

**Spec coverage:**
- ✅ Goal: "On every successful `loadFolder()` with `enableClipFeatures === true`, kick off background feature extraction" → Tasks 2 + 7
- ✅ Goal: "Preserve current behavior when `enableClipFeatures === false`" → Task 1
- ✅ Goal: "No change to folder-load latency" → Task 7 (kickoff is fire-and-forget, not awaited)
- ✅ Goal: "Stay strictly scoped" → no ML init, no toggle-on path
- ✅ Non-goal "Toggle-on kickoff" → not in plan, deferred to BACKLOG
- ✅ Init sequence: featureWorkers idempotent (Task 3), CLIP idempotent (Tasks 4 + 5), fire-and-forget with catch (Task 6)
- ✅ Test cases 1-6 from spec → Tasks 1-6 (one each)
- ✅ Manual repro acceptance criteria → Task 8
- ✅ Files affected: media-viewer.js (Tasks 2-7), tests/media-viewer-utils.test.js (Tasks 1-6), CLAUDE.md (handled by auto-memory in post-merge per Task 9 note)

**Placeholder scan:** No TBDs, no "implement later", no "similar to Task N", no test stubs without code. Two `<FILL_IN>` markers in Task 9 Step 1 are explicit placeholders for the engineer to fill with actual test counts at completion time — by design.

**Type consistency:**
- Method name `kickoffBackgroundExtractionIfEnabled` — used identically in all tasks ✓
- Mock context property names: `enableClipFeatures`, `featureWorkers`, `clipWorkerReady`, `clipModelDownloading`, `initializeFeaturePool`, `initClipModel`, `startBackgroundFeatureExtraction` — all match the actual `MediaViewer` field/method names per [media-viewer.js:372,385,386,389](../../../media-viewer.js#L372) and call sites verified during brainstorming ✓
- Spy property `globalThis.window.electronAPI.logError` — matches preload.js exposure ✓
