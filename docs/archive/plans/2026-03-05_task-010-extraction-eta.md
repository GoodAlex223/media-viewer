# TASK-010: Estimated Time Remaining for Feature Extraction

**Status**: Complete
**Priority**: Low
**Effort**: M
**Created**: 2026-03-05
**Completed**: 2026-03-05

---

## Problem

During background feature extraction (for ML prediction sort), users see progress count and percentage but have no idea how long the process will take. For large folders (hundreds or thousands of files), this creates uncertainty about whether to wait or do something else.

## Solution

Added ETA display to the existing progress pill indicator using a rolling average rate calculation, plus a completion notification showing total elapsed time.

## Approaches Considered

1. **Minimal (closure-local state)** — ETA state as local variables inside `startBackgroundFeatureExtraction()`. ~20 lines, zero class properties. Risk: `cancelBackgroundExtraction()` can't reset closure-local state.

2. **Clean (class-level state + helper method)** — Three new class properties, `recordExtractionCompletion()` helper, `formatElapsed()`/`formatEta()` utilities. ~35 lines. Proper cleanup on cancel. **Chosen.**

3. **Cumulative average** — Simpler `totalElapsed / totalCompleted` rate. Less responsive to speed changes (e.g., videos vs images).

## Implementation

### New Methods
- `formatElapsed(totalSeconds)` — Formats seconds to human-readable duration (`"3m 12s"`, `"1h 30m"`)
- `formatEta(totalSeconds)` — Wraps `formatElapsed` with `~` prefix for approximation
- `recordExtractionCompletion(completedCount, totalCount)` — Records timestamp, computes rolling average rate, updates progress pill with ETA

### State Variables (constructor)
- `this.extractionStartTime` — `Date.now()` at extraction start, null otherwise
- `this.extractionCompletionTimes` — Rolling window array (max 20 entries) of completion timestamps

### Changes to Existing Methods
- `showBackgroundExtractionProgress(current, total, etaText)` — New optional `etaText` param, appended as `" — ~3m 12s"`
- `startBackgroundFeatureExtraction()` — Initializes ETA state, calls `recordExtractionCompletion` from all 3 completion paths, shows completion notification
- `cancelBackgroundExtraction()` — Resets ETA state (`extractionStartTime = null`, `extractionCompletionTimes = []`)

### Key Design Decisions
- **Rolling window (20 files)** over cumulative average — adapts to speed changes when processing mix of images and videos
- **ETA shown after 5 completions** — avoids wildly inaccurate estimates from small sample sizes
- **`isBackgroundExtracting` guard** in `recordExtractionCompletion` — prevents ghost pill re-creation when in-flight promise callbacks fire after cancel
- **Skip ETA when remaining <= 0** — prevents brief `~0s` flash when last file completes
- **`formatElapsed`/`formatEta` split** — base formatter reusable for exact elapsed time (completion notification), wrapper adds `~` for approximation (ETA display)

## Files Modified

- `media-viewer.js` — All changes in single file (~35 lines net)

## Key Discoveries

- The existing `formatDuration()` at line 3065 outputs video clock format `"2:34"` — not suitable for ETA display, needed a new `formatElapsed` utility
- In-flight promise callbacks from `enqueueFeatureExtraction` can fire after `cancelBackgroundExtraction()` removes the progress pill, causing ghost re-creation — guarded with `isBackgroundExtracting` check
- The `loadMediaAsImageData` failure path incremented `completedCount` but never updated the progress UI — fixed to call `recordExtractionCompletion`

## Future Improvements

1. **Show extraction rate in pill** — Display files/sec alongside ETA (e.g., "45/200 (22%) — ~3m 12s (2.3 files/s)") for users who want to understand throughput
2. **Weighted rolling average** — Give more weight to recent completions for faster adaptation to speed changes (exponential moving average instead of simple window)
3. **Reuse formatElapsed for other timed operations** — Sort-by-similarity, ML training, and other long operations could show elapsed time on completion
