# CLIP/ML Pipeline Cleanup — Design Spec

**Date**: 2026-04-09
**Branch**: `feature/clip-ml-cleanup`
**Origin**: BACKLOG.md (TASK-028 PR #26 code review, 75/100 confidence items)
**Estimated SP**: 7

## Overview

Four cleanup tasks addressing technical debt from TASK-028 (CLIP semantic features). These fix IPC listener leaks, eliminate wasted image decodes, correct a broken model persistence path, and remove a dead source file.

---

## Task 1 — Fix IPC listener accumulation for `clip-download-progress`

### Problem

`preload.js:30` exposes `ipcRenderer.on('clip-download-progress', ...)` — each call to `initClipModel()` in `media-viewer.js:6439` attaches a new listener without removing the old one. While `initClipModel()` is lazy-guarded (runs once per session normally), a failed load + retry would accumulate listeners.

### Fix

Change `ipcRenderer.on()` to `ipcRenderer.once()` in `preload.js:30`.

**File**: `preload.js`
```js
// Before
onClipDownloadProgress: (callback) => ipcRenderer.on('clip-download-progress', (_event, data) => callback(data))

// After
onClipDownloadProgress: (callback) => ipcRenderer.once('clip-download-progress', (_event, data) => callback(data))
```

**Wait — this is wrong.** `.once()` fires once per listener registration, meaning it would only receive the *first* progress event. The CLIP download emits many progress events (one per file chunk). `.once()` would miss all but the first.

### Revised Fix

Keep `ipcRenderer.on()` but expose a cleanup function. The renderer calls cleanup when the model finishes loading (success or failure).

**File**: `preload.js`
```js
onClipDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('clip-download-progress', handler);
    return () => ipcRenderer.removeListener('clip-download-progress', handler);
},
```

**File**: `media-viewer.js` (in `initClipModel()`)
```js
let removeProgressListener;
if (window.electronAPI.onClipDownloadProgress) {
    removeProgressListener = window.electronAPI.onClipDownloadProgress((data) => {
        this.clipModelDownloading = true;
        if (data.progress % 10 === 0) {
            this.showNotification(`Downloading CLIP model... ${data.progress}%`, 'info');
        }
    });
}

// ... after loadClipModel() resolves (success or failure):
if (removeProgressListener) removeProgressListener();
```

### Test impact

No unit test changes. E2E `clip-graceful-degradation.test.js` exercises the flow but doesn't assert listener count.

---

## Task 2 — Skip redundant `loadMediaAsImageData` for CLIP-only extractions

### Problem

`startBackgroundFeatureExtraction()` at `media-viewer.js:6854` calls `loadMediaAsImageData()` unconditionally for every file. But:
- `enqueueFeatureExtraction()` skips work for files already in `featureCache`
- `extractClipEmbedding()` ignores the `_imageData` parameter entirely (uses file path via IPC)

Files with cached hand-crafted features but pending CLIP extraction decode the image for nothing.

### Fix

Guard the image load with a `featureCache` check.

**File**: `media-viewer.js` (in `startBackgroundFeatureExtraction()`, around line 6854)
```js
// Before
const imageData = await this.loadMediaAsImageData(file.path);

// After
const needsHandCrafted = !this.featureCache.has(file.path);
const imageData = needsHandCrafted ? await this.loadMediaAsImageData(file.path) : null;
```

Downstream is already safe:
- `enqueueFeatureExtraction()` early-returns for cached files at lines 6654-6655 — never touches `imageData`
- `extractClipEmbedding(filePath, _imageData)` — `_imageData` is unused, reads file via IPC

### Performance impact

Eliminates one full image decode per already-cached file. For a 30K-file library on second pass (hand-crafted cached, CLIP pending), this skips 30K unnecessary decodes.

### Test impact

None — extraction loop isn't unit-tested (heavy DOM/IPC dependencies).

---

## Task 3 — Handle stale `.ml_model.json` after version upgrade

### Problem (two bugs)

**3a — Save writes wrong version**: `saveMlModel()` at `media-viewer.js:5585-5591` wraps the model state in `{ version: 1, modelState: this.mlModelState, timestamp: ... }`. The outer `version: 1` is never read by the load path (which extracts `parsed.modelState`), but it's misleading. More importantly, the `modelState` inside already contains `version: 3` and `featureDim: 576` from `OnlineLogisticRegression.toJSON()` — the wrapper version contradicts the inner model version.

**3b — Stale file persists after reset**: When the worker detects a version/dim mismatch, `modelWasReset` is sent to the renderer, which clears in-memory state (`this.mlModelState = null`, `this.predictionScores = new Map()`). But the stale `.ml_model.json` on disk is never overwritten. Every restart re-loads the stale file, the worker re-resets, and the cycle repeats until the user trains enough for a new save.

### Fix

**3a** — Remove the redundant outer `version` wrapper from `saveMlModel()`:

**File**: `media-viewer.js` (`saveMlModel()`)
```js
// Before
JSON.stringify({
    version: 1,
    modelState: this.mlModelState,
    timestamp: Date.now(),
})

// After
JSON.stringify({
    modelState: this.mlModelState,
    timestamp: Date.now(),
})
```

The model state itself (`this.mlModelState`) contains `version` and `featureDim` from `toJSON()`. The load path reads `parsed.modelState` and sends it to the worker, which checks `savedModel.version` and `savedModel.featureDim` via `isCompatible()`. No outer wrapper version is needed.

**3b** — In the `modelWasReset` handler (around `media-viewer.js:5365`), delete the stale file by writing an empty/null model cache:

**File**: `media-viewer.js` (in `handleMlWorkerMessage`, `initComplete` case)
```js
if (message.modelWasReset) {
    console.warn('ML model was reset (version/dim mismatch) — clearing stale cache');
    this.mlModelState = null;
    this.predictionScores = new Map();
    // Delete stale model file from disk
    this.deleteMlModelCache();
}
```

New method `deleteMlModelCache()`:
```js
async deleteMlModelCache() {
    if (!this.baseFolderPath) return;
    try {
        const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.ml_model.json');
        await window.electronAPI.writeFile(cacheFile, '');
    } catch (_error) {
        // Ignore — file may not exist
    }
}
```

Writing an empty string is preferred over adding a `deleteFile` IPC (which doesn't exist). The load path (`loadMlModel`) will `JSON.parse('')` which throws, caught by the existing `catch` block that logs "No ML model cache found" — clean behavior.

### Test impact

`ml-model.test.js` tests `isCompatible()` and `fromJSON()` — no changes needed. The save/load path isn't unit-tested.

---

## Task 4 — Delete `clip-worker.js` and its test

### Problem

`clip-worker.js` (225 lines) is never instantiated as a Worker. Since d21e213, CLIP inference runs in the main process via IPC (`main.js:440-535`). The main process has its own duplicate embedding extraction and averaging logic. No runtime code imports from `clip-worker.js`.

The only consumers are:
- `tests/clip-worker.test.js` — 6 unit tests for dead code
- Internal self-references within the file

### Fix

**Delete files**:
- `clip-worker.js`
- `tests/clip-worker.test.js`

**Update**:
- `eslint.config.mjs` — remove block 3c (`clip-worker.js` config)
- `CLAUDE.md` — update architecture table (remove `clip-worker.js` row), update references

### Test impact

Removes 6 unit tests that covered dead code. `npm test` must still pass. Net test count decreases but test integrity improves (no tests for phantom code).

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `preload.js` | `.on()` → `.on()` + return cleanup function |
| `media-viewer.js` | 4 changes: progress listener cleanup, conditional image load, remove save wrapper version, add `deleteMlModelCache()` + call on reset |
| `clip-worker.js` | **Delete** |
| `tests/clip-worker.test.js` | **Delete** |
| `eslint.config.mjs` | Remove block 3c |
| `CLAUDE.md` | Update architecture section |

## Out of Scope

- Refactoring `main.js` averaging into a shared utility (15 lines of simple math, not worth an abstraction)
- Adding new unit tests for IPC or extraction loop (too coupled to Electron runtime)
- CLIP model unloading after extraction (separate WEEKLY task — Thursday)
- New `deleteFile` IPC handler (writing empty string is sufficient)

## Risk Assessment

- **Low risk**: All changes are internal cleanup with no user-facing behavior changes
- **Data safety**: `.ml_model.json` is a derived cache, not user data — safe to empty
- **Regression check**: `npm test` + `npm run test:e2e` must pass; manual check of CLIP download flow with fresh model
