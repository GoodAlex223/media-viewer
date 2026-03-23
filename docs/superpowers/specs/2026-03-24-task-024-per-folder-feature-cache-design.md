# TASK-024: Per-Folder Feature Cache Fix

**Date**: 2026-03-24
**Status**: Design approved
**Approach**: A — Minimal fix (move `loadFeatureCache()` call + add validation metadata)

## Problem

Feature extraction runs from scratch every time the user switches folders and clicks "Sort by Prediction", despite `.feature_cache.json` files being saved to disk. For large folders this is very slow.

### Root Cause

`loadFeatureCache()` (media-viewer.js line 5970) is inside the lazy-init guard `if (!this.mlWorker || this.featureWorkers.length === 0)`. Workers survive folder switches (not shut down), so on the second+ sort click after switching folders, the cache is never reloaded from disk. Meanwhile, `loadFolder()` clears `featureCache` (line 2194) on every folder switch.

**Flow today (broken)**:
1. User opens Folder A → `featureCache.clear()`
2. Clicks "Sort by Prediction" → lazy init → `loadFeatureCache()` ✓ → extraction runs
3. Switches to Folder B → `featureCache.clear()` → workers survive
4. Clicks "Sort by Prediction" → workers exist, skip lazy init → **`loadFeatureCache()` skipped** → full re-extraction

## Solution

### 1. Move `loadFeatureCache()` Out of Lazy-Init Guard

Call `loadFeatureCache()` unconditionally in `handleSortByPrediction()`, after the init block but before `startBackgroundFeatureExtraction()`. Since `featureCache` was cleared by `loadFolder()`, it's always empty at this point on a new folder — the load fills it from disk.

### 2. Cache Schema v3 with Validation Metadata

**Current schema (v2)**:
```json
{
  "version": 2,
  "featureDim": 64,
  "features": {
    "photo.jpg": [0.5, 0.3, ..., 0.2]
  }
}
```

**New schema (v3)**:
```json
{
  "version": 3,
  "featureDim": 64,
  "features": {
    "photo.jpg": {
      "vector": [0.5, 0.3, ..., 0.2],
      "size": 1048576,
      "mtime": 1711234567890
    }
  }
}
```

- `FEATURE_CACHE_VERSION` bumps from 2 to 3 (existing v2 caches auto-invalidated on first load — one-time re-extraction, then v3 persists)
- Per-entry value changes from bare array to object with `vector`, `size`, `mtime`
- `load-folder` IPC adds `mtimeMs` to returned file objects (from the `fs.stat()` call already happening)
- On `loadFeatureCache()`: compare stored `size`+`mtime` against current file stats. Match → use cached. Mismatch → skip (will be re-extracted)

**File stats lookup**: `loadFeatureCache()` needs current file sizes/mtimes. Build a lookup Map from `this.mediaFiles` (which has `size` and `mtimeMs` from `load-folder`). No extra I/O needed.

### 3. Deleted File Pruning

Handled implicitly by `loadFeatureCache()`: build a Set of current filenames from `this.mediaFiles`. Cached entries not in the Set are not loaded into memory. Next `saveFeatureCache()` writes only what's in the Map, so stale entries disappear from disk on the next auto-save or extraction completion save.

### 4. Progress Indicator for Cache Hits

- During extraction: `"Extracting features: 5/50 new (45 cached)"`
- On completion: `"Feature extraction complete — 50 files (45 cached, 5 extracted in 12s)"`
- All cached (0 new): `"All 50 features loaded from cache"` — skip extraction entirely (already handled at line 6501, just improve the notification)
- `startBackgroundFeatureExtraction()` already computes cache hit count as `mediaFiles.length - filesToProcess.length` (line 6510)

## Changes Summary

| File | Change |
|------|--------|
| main.js | Add `mtimeMs: stats.mtimeMs` to `load-folder` response (1 line) |
| media-viewer.js | Bump `FEATURE_CACHE_VERSION` 2 → 3 |
| media-viewer.js | Move `loadFeatureCache()` out of lazy-init guard, call unconditionally before extraction |
| media-viewer.js | Update `loadFeatureCache()`: validate `size`+`mtime` per entry, prune deleted files |
| media-viewer.js | Update `saveFeatureCache()`: write `{vector, size, mtime}` per entry |
| media-viewer.js | Update progress indicator to show cached count |
| media-viewer.js | Update completion notification with cached/extracted breakdown |
| media-viewer.js | "All N features loaded from cache" notification when 0 files need extraction |

**Not changed**: feature-extractor.js, feature-worker.js, preload.js, workers, tests.

**Estimated**: ~60-80 lines changed across 2 files.

## Acceptance Criteria (from TODO.md)

- [x] Design: Feature cache saved per folder after extraction completes (already works)
- [x] Design: Cached features loaded on folder re-open, skipping extraction (this fix)
- [x] Design: Changed/new files detected and re-extracted (size+mtime validation)
- [x] Design: Deleted files pruned from cache (implicit load-filter-save)
- [x] Design: Progress indicator reflects cache hits
- [x] Design: All unit tests pass (`npm test`)
