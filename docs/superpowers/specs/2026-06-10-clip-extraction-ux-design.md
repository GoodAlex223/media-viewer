# Group C: CLIP Extraction UX — Design

**Status: Approved**
**Date**: 2026-06-10
**Branch**: `feature/clip-extraction-ux`
**Source**: Weekly plan June 1–5 → Group C (4 SP, 🟢 NICE TO HAVE); BACKLOG.md (2026-05-03)
**Spec author**: brainstorming session 2026-06-10

---

## Problem

Two small UX gaps in the background feature-extraction pipeline (the path that
populates the 64-dim hand-crafted + 512-dim CLIP feature caches):

1. **Silent kickoff window.** When CLIP is enabled and a folder loads,
   `kickoffBackgroundExtractionIfEnabled()` runs three awaits —
   `loadFeatureCache()` (stream-parse of up to ~259 MB), `initClipModel()`
   (cold start = ~87 MB model download), then `startBackgroundFeatureExtraction()`.
   The **first** user-visible feedback only appears *inside*
   `startBackgroundFeatureExtraction()` (the bottom-left progress indicator, or an
   "All N features loaded from cache" toast). During the cache-load and warm-model
   windows there is **no feedback at all**. This also hid the PR #34-class failure
   where the kickoff silently never fired.

2. **No CLIP toggle-on kickoff.** The `#clipFeaturesToggle` change handler only has
   a toggle-**off** cleanup branch. Enabling CLIP while a folder is already loaded
   does nothing until the user reloads the folder.

## Goals

- Surface an immediate "Starting feature extraction…" toast when the kickoff begins,
  before any awaited work, so slow-cache delays and kickoff failures are visible.
- Make toggling CLIP **on** mid-folder start extraction immediately, matching the
  folder-load path.

## Non-Goals (YAGNI)

- No changes to the bottom-left progress indicator (`showBackgroundExtractionProgress`).
- No changes to the CLIP download-progress notifications (`Downloading CLIP model… X%`).
- No changes to the notification component itself.
- No self-replacing / persistent "starting" notification — a plain transient toast.
- No model pre-download on toggle-on when no folder is loaded.

---

## Design

Two surgical changes, both in `media-viewer.js`. No IPC, no new files, no HTML/CSS,
no new dependencies.

### Change 1 — "Starting feature extraction…" toast

In `kickoffBackgroundExtractionIfEnabled()` (≈ media-viewer.js:8406):

```js
async kickoffBackgroundExtractionIfEnabled() {
    if (!this.enableClipFeatures) return;
    if (this.mediaFiles.length === 0) return;          // NEW — no-op when no folder loaded
    try {
        this.showNotification('⏳ Starting feature extraction…', 'info');   // NEW — fires immediately
        if (this.featureWorkers.length === 0) {
            this.initializeFeaturePool();
        }
        await this.loadFeatureCache();
        if (!this.clipWorkerReady) {
            await this.initClipModel();
        }
        await this.startBackgroundFeatureExtraction();
    } catch (err) {
        if (window.electronAPI?.logError) {
            window.electronAPI.logError(`Background extraction failed: ${err?.message ?? err}`);
        }
    }
}
```

Decisions:

- **Toast fires immediately and always** (decision: "Immediately, always"). It is the
  first statement inside the `try`, before `loadFeatureCache()` / `initClipModel()` /
  `startBackgroundFeatureExtraction()`. This is what surfaces the otherwise-silent
  cache-load + warm-model window and the "kickoff never fired" failure class.
- **Accepted all-cached sequence**: `⏳ Starting feature extraction…` →
  (cold start only) `Downloading CLIP model… X%` / `CLIP model loaded` →
  `All N features loaded from cache`. Each auto-dismisses (info/success = 2 s).
- **Wording is "feature extraction"**, not "CLIP" — consistent with the existing
  bottom-left "Extracting features:" indicator; the method extracts both the 64-dim
  hand-crafted and 512-dim CLIP vectors.
- **New `mediaFiles.length === 0` guard** sits *before* the toast (so no misleading
  toast fires with nothing loaded) and *after* the `enableClipFeatures` guard. It
  also satisfies Change 2's empty-folder case (below). Safe for the existing sole
  caller (`loadFolder`, which only calls kickoff after files are loaded).

### Change 2 — Toggle-on kickoff

In the `#clipFeaturesToggle` change handler (≈ media-viewer.js:1998), add the missing
toggle-**on** branch:

```js
if (!clipToggle.checked) {
    // ...existing toggle-off cleanup (clipUnloadTimer clear, sortAlgorithm revert,
    //    deleteSortCache('clip'))...
} else {
    // Toggle-on: start background extraction immediately (same path as folder load).
    // kickoff no-ops if no folder is loaded (guards on mediaFiles.length).
    this.kickoffBackgroundExtractionIfEnabled();
}
```

Decisions:

- **Fire-and-forget**, mirroring `loadFolder`'s call (≈ media-viewer.js:2618).
- **Empty-folder case is a no-op** (decision: "No-op until a folder loads") — handled
  entirely by Change 1's `mediaFiles.length === 0` guard, so the toggle handler needs
  no extra check. No ~87 MB model download is triggered by a settings toggle with
  nothing loaded; the model still loads lazily on the next folder load.
- `resetMlModel()` is already called at the top of the handler (unconditionally). On
  toggle-on it clears the stale 64-dim model so it rebuilds at 576-dim; the subsequent
  extraction repopulates `clipCache`. No ordering change needed.

### Error handling

No new error surfaces. `kickoffBackgroundExtractionIfEnabled()`'s existing try/catch →
`logError` covers everything; the toast call is best-effort and cannot throw in
production (`this.mediaFiles` is always an array from the constructor; the
notification container always exists post-init).

---

## Testing

### Unit (`tests/media-viewer-utils.test.js`)

Extend the existing `describe('kickoffBackgroundExtractionIfEnabled', …)` block
(currently 8 tests via `extractAsyncMethod`):

- **+ starting toast**: enabled + non-empty `mediaFiles` → asserts `showNotification`
  was called with the "Starting feature extraction…" message.
- **+ empty-folder no-op**: `mediaFiles: []` → asserts none of
  `initializeFeaturePool` / `loadFeatureCache` / `initClipModel` /
  `startBackgroundFeatureExtraction` were called **and** no toast fired.
- **Update existing 8 tests' `makeCtx`**: add `mediaFiles: [{ path: 'a' }]` (so the
  new guard does not short-circuit them) and `showNotification: vi.fn()` (the new
  toast call dereferences it). The existing `enableClipFeatures: false` test still
  short-circuits before the new guard and is unaffected.

Net: ~8 → 10 kickoff unit tests (~294 → ~296; this branch is off `main`, before
the as-yet-unmerged PR #44).

### E2E (`tests/e2e/clip-graceful-degradation.test.js`)

Add one test: with a folder loaded, toggle CLIP **on** via Settings (F1) and assert
the kickoff path ran — e.g. the bottom-left `#featureExtractionProgress` indicator
appears, or `window.mediaViewer.isBackgroundExtracting` flips true. Asserts the
*attempt*, not CLIP-model success, so it stays green when the model is unavailable in
CI (graceful-degradation file already establishes that pattern).

### Manual smoke

1. Load a folder with CLIP enabled → "Starting feature extraction…" toast appears
   immediately, before progress.
2. Toggle CLIP off → on while a folder is loaded → extraction restarts (toast +
   progress).
3. Toggle CLIP on with **no** folder loaded → no toast, no model download.

---

## Affected files

- `media-viewer.js` — Change 1 (`kickoffBackgroundExtractionIfEnabled`) + Change 2
  (`#clipFeaturesToggle` change handler).
- `tests/media-viewer-utils.test.js` — kickoff unit tests (+2, makeCtx update).
- `tests/e2e/clip-graceful-degradation.test.js` — toggle-on kickoff E2E.

## Risks

- **Low.** The `mediaFiles.length === 0` early-return changes kickoff behavior only
  for the (currently nonexistent) no-folder call path; the sole existing caller passes
  a loaded folder. The toggle-on branch is fire-and-forget and reuses a
  concurrent-safe path (`loadClipModel` IPC dedupes; `startBackgroundFeatureExtraction`
  cancels any in-flight run first).
