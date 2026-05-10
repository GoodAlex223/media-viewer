# CLIP Extraction Silent Failure — Design Spec

**Date**: 2026-05-06
**Status**: Approved (brainstorming complete; awaiting implementation plan)
**Branch**: `fix/clip-extraction-silent-failure`
**Source**: WEEKLY.md Group A (Mon May 11) — 5 SP, 🔴 IMPORTANT (BLOCKER)
**Origin**: Manual testing during PR #33 (2026-05-03); cataloged in BACKLOG.md and CLAUDE.md "Active gotchas"

---

## Problem

Bug repro (confirmed 2026-05-03):

1. Enable CLIP in Settings (F1) — default ON.
2. Open a fresh media folder that has no prior `.feature_cache.json`.
3. Wait 60+ seconds.

**Expected**: Background extraction populates `featureCache` and `clipCache`; `.feature_cache.json` is written; CLIP-based sort works.

**Observed**: No `.feature_cache.json` written, no progress notification, no CLIP-model-load notification, no console errors. Clicking Sort-by-Similarity with the `clip` algorithm throws `"Only 0 files have CLIP embeddings."` from `handleSortBySimilarity`. Hash-based sorts (MST/VPTree) work correctly on the same folder.

## Root Cause

`startBackgroundFeatureExtraction()` is **never called from `loadFolder()`**. The only call site is inside `handleSortByPrediction()` ([media-viewer.js:6342](../../../media-viewer.js#L6342)), gated behind a lazy ML-init block ([media-viewer.js:6294-6315](../../../media-viewer.js#L6294-L6315)) that also initializes `featureWorkers` and the CLIP model.

Consequences on a fresh folder load:
- `featureWorkers.length === 0` (never populated).
- `clipWorkerReady === false` (CLIP model never loaded).
- No background extraction runs; `clipCache` stays empty.
- Hash sorts work because `handleSortBySimilarity` computes perceptual hashes inline (different pipeline that does not depend on `featureWorkers` or `clipWorkerReady`).
- CLIP sort fails because `clipCache` has 0 entries.

The earlier hypothesis ("trace each guard, add diagnostic logging") in BACKLOG / CLAUDE.md was misframed — there is no guard to trace because there is no caller. The feature was never wired to folder load; it was only wired to clicking "Sort by Prediction."

## Goals

- On every successful `loadFolder()` with `enableClipFeatures === true`, kick off background feature extraction so `clipCache` is populated by the time the user clicks Sort-by-Similarity (CLIP).
- Preserve current behavior when `enableClipFeatures === false`.
- No change to folder-load latency from the user's perspective: the kickoff is fire-and-forget after the first frame renders.
- Stay strictly scoped to the reported bug. Do not eagerly initialize the ML worker or run training on folder load.

## Non-goals

- Re-architecting the lazy ML-init block in `handleSortByPrediction` (that path stays the same for now).
- Triggering a kickoff when the user toggles CLIP **on** mid-session (deferred to BACKLOG).
- Adding hand-crafted-only background extraction when CLIP is off.
- E2E testing of full extraction completion (would require either real CLIP inference or extensive mocking; out of scope).

## Design

### Behavior

#### Trigger
At the end of `loadFolder()`'s success path, after `await this.showMedia()` and `this.updateFolderInfo()` (so the UI renders first), call a new private method `kickoffBackgroundExtractionIfEnabled()`. The method is gated on `this.enableClipFeatures === true`; the CLIP-off branch is a no-op, preserving today's behavior for that user segment.

#### Init sequence inside the helper

When `enableClipFeatures === true`:

1. If `featureWorkers.length === 0` → call `initializeFeaturePool()` (idempotent guard).
2. If `clipWorkerReady !== true && !clipModelDownloading` → call `initClipModel()` (idempotent — main-process `loadClipModel` IPC handler is concurrent-safe per CLAUDE.md). The `clipModelDownloading` guard prevents duplicate progress notifications when a download is already in flight.
3. Fire-and-forget `startBackgroundFeatureExtraction()` (no `await`). Wrap in `.catch(err => …)` to log failures via `window.electronAPI.logError` and prevent unhandled rejections.

#### Sequencing in `loadFolder`

The existing `cancelBackgroundExtraction()` call at [media-viewer.js:2261](../../../media-viewer.js#L2261) already aborts any in-flight extraction from a previous folder before the new state is applied. The new kickoff happens after `mediaFiles`/`baseFolderPath` are set and after the first frame renders.

#### Race handling
- **Rapid folder switching (A → B mid-extraction)**: `cancelBackgroundExtraction()` aborts A; `startBackgroundFeatureExtraction()` for B increments `extractionRunId` internally, so any straggler callbacks from A check `runId !== this.extractionRunId` and bail. No new code needed.
- **CLIP model download in progress when next folder opens**: `loadClipModel` IPC is concurrent-safe; the second `initClipModel()` call resolves on the same in-flight load. The `clipModelDownloading` guard prevents duplicate progress notifications.
- **User clicks Sort-by-Prediction during background extraction**: today's `handleSortByPrediction` calls `cancelBackgroundExtraction()` then `startBackgroundFeatureExtraction()` again — same pattern as folder switch. Unchanged.

#### Error handling
- `initClipModel()` already handles failure gracefully (sets `clipWorkerReady = false`, shows "CLIP model unavailable — using basic features only" notification). Folder load proceeds normally; CLIP-needing files in the loop fall through (return `null`). Hand-crafted features still extract.
- The fire-and-forget `.catch` logs to `window.electronAPI.logError` for diagnostics; no user-facing notification (would duplicate what `startBackgroundFeatureExtraction` already shows internally).

#### Notification UX
No new "Extracting features for N files…" notification on kickoff. The existing `showBackgroundExtractionProgress()` progress bar is sufficient; an upfront text notification would fire on every folder open and feel noisy.

### Implementation surface

#### File: [media-viewer.js](../../../media-viewer.js)

**Add** a new method on the `MediaViewer` class (location: alongside other extraction-related helpers, near `startBackgroundFeatureExtraction`):

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

**Call** it from `loadFolder()` after `this.updateFolderInfo();` and before `console.log('Successfully loaded …')`:

```js
this.updateFolderInfo();
this.kickoffBackgroundExtractionIfEnabled();
console.log(`Successfully loaded ${this.mediaFiles.length} media files`);
```

**Why a method, not inline:**
- Unit-testable in isolation via the existing `extractMethod()` pattern in `tests/media-viewer-utils.test.js`.
- Single source of truth if a future caller (e.g., toggle-on kickoff, deferred to BACKLOG) needs the same semantics.
- Keeps the body of `loadFolder()` readable.

The existing lazy block in `handleSortByPrediction` ([media-viewer.js:6294-6315](../../../media-viewer.js#L6294-L6315)) is **not** refactored — it still needs to also init `mlWorker` + `loadMlModel`. Sharing partial init across the two call sites is out of scope for this fix.

### Tests

#### Unit — `tests/media-viewer-utils.test.js`

New `describe` block for `kickoffBackgroundExtractionIfEnabled`. Use `extractMethod()` to lift the method body for direct invocation under a mock context. Mock context provides spy stubs for `initializeFeaturePool`, `initClipModel`, `startBackgroundFeatureExtraction`, and `window.electronAPI.logError`.

Test cases:

1. `enableClipFeatures: false` → asserts `initializeFeaturePool`, `initClipModel`, `startBackgroundFeatureExtraction` were NOT called.
2. `enableClipFeatures: true`, fresh state (`featureWorkers: []`, `clipWorkerReady: false`, `clipModelDownloading: false`) → asserts all three init/extract methods were called exactly once.
3. `enableClipFeatures: true`, `featureWorkers.length > 0` → asserts `initializeFeaturePool` was NOT called (idempotency), but `initClipModel` and `startBackgroundFeatureExtraction` still fire.
4. `enableClipFeatures: true`, `clipWorkerReady: true` → asserts `initClipModel` was NOT called (idempotency), but `initializeFeaturePool` (if needed) and `startBackgroundFeatureExtraction` still fire.
5. `enableClipFeatures: true`, `clipModelDownloading: true` → asserts `initClipModel` was NOT called (no duplicate downloads).
6. `startBackgroundFeatureExtraction` returns a rejected promise → asserts `window.electronAPI.logError` was called with a message containing the error; no exception propagates.

#### E2E — skipped intentionally

A real end-to-end "CLIP extraction completes" test would require either an 87 MB CLIP model download in CI (slow, flaky on a cold transformers.js cache) or extensive mocking that doesn't validate the production path. The unit tests above prove the kickoff wiring; the existing [tests/e2e/clip-graceful-degradation.test.js](../../../tests/e2e/clip-graceful-degradation.test.js) covers the CLIP-unavailable path.

#### Manual repro (acceptance criteria)

1. Enable CLIP in Settings (F1) — default ON.
2. Open a fresh folder with no `.feature_cache.json`.
3. Within ~5 seconds, observe the progress bar appear bottom-center showing "0/N — extracting…".
4. Within ~30 seconds (per file), observe `.feature_cache.json` written to the folder.
5. Click Sort-by-Similarity with `clip` algorithm — sort succeeds without "Only 0 files have CLIP embeddings" error.

## Files affected

| File | Change |
|------|--------|
| [media-viewer.js](../../../media-viewer.js) | Add `kickoffBackgroundExtractionIfEnabled()` method; call from `loadFolder()` after `updateFolderInfo()`. |
| [tests/media-viewer-utils.test.js](../../../tests/media-viewer-utils.test.js) | Add `describe('kickoffBackgroundExtractionIfEnabled', …)` block with 6 test cases. |
| [CLAUDE.md](../../../CLAUDE.md) | Update "Active gotchas" — replace the "CLIP background extraction may silently not fire on folder load" entry with a description of the new behavior (post-merge, as part of normal sync). |

## Acceptance criteria

- [ ] `kickoffBackgroundExtractionIfEnabled()` method added to `MediaViewer` and called from `loadFolder()` after the first frame renders.
- [ ] CLIP-disabled folder loads behave exactly as today (no extraction kickoff).
- [ ] CLIP-enabled folder loads kick off background extraction without blocking the UI.
- [ ] Idempotent guards prevent duplicate `initializeFeaturePool` / `initClipModel` calls.
- [ ] Errors from `startBackgroundFeatureExtraction` are caught and logged via `window.electronAPI.logError`; no unhandled promise rejections.
- [ ] 6 unit tests pass in `tests/media-viewer-utils.test.js`.
- [ ] All existing unit tests (167 currently) and E2E tests pass.
- [ ] Manual repro from the original bug report no longer reproduces.
- [ ] No new ESLint or Prettier issues.

## Open questions deferred to BACKLOG

- **Toggle-on kickoff**: When the user toggles CLIP **on** in Settings while a folder is already loaded, should we kick off extraction for the current folder? (Today the toggle-off path is handled; toggle-on does nothing.) Track in BACKLOG.

## Risk

- **Low**: The change is a single new method plus a single call site; no architectural change. The init helpers it invokes (`initializeFeaturePool`, `initClipModel`, `startBackgroundFeatureExtraction`) are already production code and were proven by PR #28 / Group D / Group E.
- **Folder-load latency**: Kickoff is fire-and-forget; `loadFolder` does not await. No measurable latency increase expected.
- **CLIP model first-time download (87 MB)**: Triggered on the first CLIP-enabled folder load after install. Already has progress notifications. Acceptable per Question 2 alignment.
