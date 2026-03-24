# TASK-024: Per-Folder Feature Cache Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the feature extraction cache so it reloads from disk on folder switches, with file change detection and improved progress reporting.

**Architecture:** Move `loadFeatureCache()` out of the lazy-init guard so it runs unconditionally. Bump cache schema to v3 with per-entry `{vector, size, mtime}`. Add `featureMetadata` Map for save-time metadata lookup. Update progress indicators to show cache hit counts.

**Tech Stack:** Electron main process (Node.js/fs), renderer (media-viewer.js), JSON file I/O via IPC.

**Spec:** `docs/superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md`

---

### Task 1: Add `mtimeMs` to `load-folder` IPC response

**Files:**
- Modify: `main.js:109-114`

- [ ] **Step 1: Add `mtimeMs` to the file object**

In `main.js`, inside the `load-folder` IPC handler, add `mtimeMs` to the object pushed to `mediaFiles`:

```javascript
// main.js line 109-114 — change from:
mediaFiles.push({
    name: file,
    path: filePath,
    size: stats.size,
    type: getMimeType(ext),
});

// to:
mediaFiles.push({
    name: file,
    path: filePath,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    type: getMimeType(ext),
});
```

- [ ] **Step 2: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All 110 tests pass (no tests touch `load-folder` IPC directly).

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat(TASK-024): add mtimeMs to load-folder IPC response"
```

---

### Task 2: Add `featureMetadata` Map and bump cache version

**Files:**
- Modify: `media-viewer.js:335` (constructor state)
- Modify: `media-viewer.js:5479` (FEATURE_CACHE_VERSION)
- Modify: `media-viewer.js:938` (removeFileFromList cleanup)
- Modify: `media-viewer.js:2194` (loadFolder clear)

- [ ] **Step 1: Add `featureMetadata` to constructor**

After line 335 (`this.featureCache = new Map()`), add:

```javascript
this.featureMetadata = new Map(); // Map<filePath, {size: number, mtime: number}>
```

- [ ] **Step 2: Bump FEATURE_CACHE_VERSION**

Change line 5479:

```javascript
// from:
static FEATURE_CACHE_VERSION = 2;
// to:
static FEATURE_CACHE_VERSION = 3;
```

- [ ] **Step 3: Clear `featureMetadata` in `loadFolder()`**

At line 2194, after `this.featureCache.clear()`, add:

```javascript
this.featureMetadata.clear();
```

- [ ] **Step 4: Clean up `featureMetadata` in `removeFileFromList()`**

At line 938, after `this.featureCache.delete(filePath)`, add:

```javascript
this.featureMetadata.delete(filePath);
```

- [ ] **Step 5: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All 110 tests pass.

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-024): add featureMetadata Map and bump cache version to 3"
```

---

### Task 3: Update `loadFeatureCache()` with validation and pruning

**Files:**
- Modify: `media-viewer.js:5481-5521` (loadFeatureCache)

- [ ] **Step 1: Rewrite `loadFeatureCache()` for v3 schema**

Replace the entire `loadFeatureCache()` method (lines 5481-5521) with:

```javascript
async loadFeatureCache() {
    if (!this.baseFolderPath) return 0;

    try {
        const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.feature_cache.json');
        const data = await window.electronAPI.readFile(cacheFile);

        if (data) {
            const parsed = JSON.parse(data);

            // Check version compatibility
            if (parsed.version !== MediaViewer.FEATURE_CACHE_VERSION) {
                console.warn(
                    `Feature cache version mismatch: found=${parsed.version}, expected=${MediaViewer.FEATURE_CACHE_VERSION}. Cache will be invalidated.`
                );
                this.featureCache = new Map();
                this.featureMetadata = new Map();
                return 0;
            }

            // Build lookup of current files for pruning and validation
            const currentFiles = new Map();
            for (const file of this.mediaFiles) {
                currentFiles.set(file.name, file);
            }

            const expectedDim = 64;
            this.featureCache = new Map();
            this.featureMetadata = new Map();

            for (const [filename, entry] of Object.entries(parsed.features || {})) {
                // Prune: skip files no longer in folder
                const currentFile = currentFiles.get(filename);
                if (!currentFile) continue;

                // Validate dimension
                if (entry.vector?.length !== expectedDim) {
                    console.warn(
                        `Skipping cached features for ${filename}: wrong dimension (${entry.vector?.length} vs ${expectedDim})`
                    );
                    continue;
                }

                // Validate size + mtime (skip stale entries)
                if (entry.size !== currentFile.size || entry.mtime !== currentFile.mtimeMs) {
                    console.log(
                        `Feature cache stale for ${filename}: size ${entry.size}→${currentFile.size}, mtime ${entry.mtime}→${currentFile.mtimeMs}`
                    );
                    continue;
                }

                const fullPath = await window.electronAPI.path.join(this.baseFolderPath, filename);
                this.featureCache.set(fullPath, new Float32Array(entry.vector));
                this.featureMetadata.set(fullPath, { size: entry.size, mtime: entry.mtime });
            }
            return this.featureCache.size;
        }
    } catch (error) {
        console.log('No feature cache found or error loading:', error.message);
    }
    return 0;
}
```

- [ ] **Step 2: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All 110 tests pass.

- [ ] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-024): update loadFeatureCache() with v3 validation and pruning"
```

---

### Task 4: Update `saveFeatureCache()` for v3 schema

**Files:**
- Modify: `media-viewer.js:5523-5546` (saveFeatureCache)

- [ ] **Step 1: Rewrite `saveFeatureCache()` to write v3 entries**

Replace the entire `saveFeatureCache()` method (lines 5523-5546) with:

```javascript
async saveFeatureCache() {
    if (!this.baseFolderPath || this.featureCache.size === 0) return;

    try {
        const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.feature_cache.json');
        const features = {};

        for (const [fullPath, featureArray] of this.featureCache.entries()) {
            const filename = await window.electronAPI.path.basename(fullPath);
            const meta = this.featureMetadata.get(fullPath);
            if (meta) {
                features[filename] = {
                    vector: Array.from(featureArray),
                    size: meta.size,
                    mtime: meta.mtime,
                };
            } else {
                // Fallback: write without metadata (will be re-validated on next load)
                features[filename] = {
                    vector: Array.from(featureArray),
                    size: 0,
                    mtime: 0,
                };
            }
        }

        await window.electronAPI.writeFile(
            cacheFile,
            JSON.stringify({
                version: MediaViewer.FEATURE_CACHE_VERSION,
                featureDim: 64,
                features,
            })
        );
    } catch (error) {
        console.error('Failed to save feature cache:', error);
    }
}
```

- [ ] **Step 2: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All 110 tests pass.

- [ ] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-024): update saveFeatureCache() for v3 schema with metadata"
```

---

### Task 5: Populate `featureMetadata` at all `featureCache.set()` sites

**Files:**
- Modify: `media-viewer.js:6248-6251` (handleFeatureWorkerMessage)
- Modify: `media-viewer.js:3630-3631` (fallback extraction — left)
- Modify: `media-viewer.js:3643-3644` (fallback extraction — right)
- Modify: `media-viewer.js:1096` (single-mode rating extraction)
- Modify: `media-viewer.js:5637` (computeFeatures internal canvas path)
- Modify: `media-viewer.js:6159` (priority extraction from displayed media)

There are 7 total `featureCache.set()` sites. Line 5513 is inside `loadFeatureCache()` (covered by Task 3). The other 6 need matching `featureMetadata.set()` calls.

- [ ] **Step 1: Add metadata population in `handleFeatureWorkerMessage()`**

At line 6251, after `this.featureCacheDirty = true;`, add:

```javascript
// Store metadata for cache serialization
const fileInfo = this.mediaFiles.find((f) => f.path === task.filePath);
if (fileInfo) {
    this.featureMetadata.set(task.filePath, {
        size: fileInfo.size,
        mtime: fileInfo.mtimeMs || 0,
    });
}
```

- [ ] **Step 2: Add metadata population in fallback extraction (left)**

At line 3631, after `this.featureCacheDirty = true;`, add:

```javascript
const leftInfo = this.mediaFiles.find((f) => f.path === leftFile.path);
if (leftInfo) {
    this.featureMetadata.set(leftFile.path, {
        size: leftInfo.size,
        mtime: leftInfo.mtimeMs || 0,
    });
}
```

- [ ] **Step 3: Add metadata population in fallback extraction (right)**

At line 3644, after `this.featureCacheDirty = true;`, add:

```javascript
const rightInfo = this.mediaFiles.find((f) => f.path === rightFile.path);
if (rightInfo) {
    this.featureMetadata.set(rightFile.path, {
        size: rightInfo.size,
        mtime: rightInfo.mtimeMs || 0,
    });
}
```

- [ ] **Step 4: Add metadata population in single-mode rating extraction**

At line 1096, after `this.featureCache.set(currentFile.path, mlFeatures);`, add:

```javascript
const ratingFileInfo = this.mediaFiles.find((f) => f.path === currentFile.path);
if (ratingFileInfo) {
    this.featureMetadata.set(currentFile.path, {
        size: ratingFileInfo.size,
        mtime: ratingFileInfo.mtimeMs || 0,
    });
}
```

- [ ] **Step 5: Add metadata population in `computeFeatures()` internal path**

At line 5637, after `this.featureCache.set(filePath, features);`, add:

```javascript
const computeFileInfo = this.mediaFiles.find((f) => f.path === filePath);
if (computeFileInfo) {
    this.featureMetadata.set(filePath, {
        size: computeFileInfo.size,
        mtime: computeFileInfo.mtimeMs || 0,
    });
}
```

- [ ] **Step 6: Add metadata population in priority extraction**

At line 6159, after `this.featureCache.set(file.path, features);`, add:

```javascript
const prioFileInfo = this.mediaFiles.find((f) => f.path === file.path);
if (prioFileInfo) {
    this.featureMetadata.set(file.path, {
        size: prioFileInfo.size,
        mtime: prioFileInfo.mtimeMs || 0,
    });
}
```

- [ ] **Step 7: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All 110 tests pass.

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-024): populate featureMetadata at all extraction sites"
```

---

### Task 6: Move `loadFeatureCache()` out of lazy-init guard

**Files:**
- Modify: `media-viewer.js:5957-5971` (handleSortByPrediction lazy-init block)

This is the core bug fix. `loadFeatureCache()` must run on every "Sort by Prediction" click, not just during first-time worker initialization.

- [ ] **Step 1: Move `loadFeatureCache()` after the lazy-init block**

Change the lazy-init block (lines 5957-5971) from:

```javascript
// Lazy initialization: Initialize ML system on first use
if (!this.mlWorker || this.featureWorkers.length === 0) {
    this.showNotification('Initializing ML system...', 'info');
    console.log('[ML Debug] Lazy initialization of ML system');

    // Initialize workers
    this.initializeMlWorker();
    this.initializeFeaturePool();

    // Wait for ML worker to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Load cached model and features
    await this.loadMlModel();
    await this.loadFeatureCache();
}
```

to:

```javascript
// Lazy initialization: Initialize ML system on first use
if (!this.mlWorker || this.featureWorkers.length === 0) {
    this.showNotification('Initializing ML system...', 'info');
    console.log('[ML Debug] Lazy initialization of ML system');

    // Initialize workers
    this.initializeMlWorker();
    this.initializeFeaturePool();

    // Wait for ML worker to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Load cached model
    await this.loadMlModel();
}

// Always reload feature cache (cleared by loadFolder() on folder switch)
await this.loadFeatureCache();
```

- [ ] **Step 2: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All 110 tests pass.

- [ ] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "fix(TASK-024): move loadFeatureCache() out of lazy-init guard

Root cause: workers survive folder switches, so lazy-init block was
skipped on second+ folder, and featureCache (cleared by loadFolder())
was never reloaded from disk."
```

---

### Task 7: Update progress indicators for cache hits

**Files:**
- Modify: `media-viewer.js:6493-6494` (initial progress display)
- Modify: `media-viewer.js:6501-6504` (all-cached early return)
- Modify: `media-viewer.js:6510` (completedCount variable)
- Modify: `media-viewer.js:6575-6578` (completion notification)
- Modify: `media-viewer.js:6714` (showBackgroundExtractionProgress signature — no change needed, just usage)
- Modify: `media-viewer.js:6759` (progress text template)

- [ ] **Step 1: Add "all cached" notification in early-return path**

At lines 6501-6504, change:

```javascript
if (filesToProcess.length === 0) {
    this.isBackgroundExtracting = false;
    this.hideBackgroundExtractionProgress();
    return;
}
```

to:

```javascript
if (filesToProcess.length === 0) {
    this.isBackgroundExtracting = false;
    this.hideBackgroundExtractionProgress();
    this.showNotification(`All ${this.mediaFiles.length} features loaded from cache`, 'success');
    return;
}
```

- [ ] **Step 2: Replace premature progress call and add `cachedCount`**

Remove the premature progress display at line 6494:
```javascript
// Delete this line:
this.showBackgroundExtractionProgress(0, this.mediaFiles.length);
```

Then at line 6510, change:

```javascript
let completedCount = this.mediaFiles.length - filesToProcess.length;
const totalCount = this.mediaFiles.length;
```

to:

```javascript
const cachedCount = this.mediaFiles.length - filesToProcess.length;
let completedCount = cachedCount;
const totalCount = this.mediaFiles.length;

// Show progress with cache info
this.showBackgroundExtractionProgress(completedCount, totalCount, null, false, cachedCount);
```

- [ ] **Step 3: Update `showBackgroundExtractionProgress()` to accept `cachedCount`**

Change the function signature at line 6714 from:

```javascript
showBackgroundExtractionProgress(current, total, etaText = null, paused = false) {
```

to:

```javascript
showBackgroundExtractionProgress(current, total, etaText = null, paused = false, cachedCount = 0) {
```

Store `cachedCount` for redisplay, after line 6717 (`if (total !== null) ...`), add:

```javascript
if (cachedCount > 0) this._extractionCachedCount = cachedCount;
const displayCached = this._extractionCachedCount || 0;
```

Update the extracting text at line 6759 from:

```javascript
<span>Extracting features: ${displayCurrent}/${displayTotal} (${percentage}%)${etaSuffix}</span>
```

to:

```javascript
<span>Extracting features: ${displayCurrent}/${displayTotal} (${percentage}%)${displayCached > 0 ? ` \u2014 ${displayCached} cached` : ''}${etaSuffix}</span>
```

Update the paused text at line 6751 from:

```javascript
<span>Paused \u2014 ${displayCurrent}/${displayTotal} (${percentage}%)</span>
```

to:

```javascript
<span>Paused \u2014 ${displayCurrent}/${displayTotal} (${percentage}%)${displayCached > 0 ? ` \u2014 ${displayCached} cached` : ''}</span>
```

- [ ] **Step 4: Update completion notification with cache breakdown**

At line 6575-6578, change:

```javascript
if (this.extractionRunId === runId && this.extractionStartTime) {
    const totalSecs = Math.round((Date.now() - this.extractionStartTime) / 1000);
    const timeStr = this.formatElapsed(totalSecs);
    this.showNotification(`Feature extraction complete \u2014 ${totalCount} files in ${timeStr}`, 'success');
    this.extractionStartTime = null;
}
```

to:

```javascript
if (this.extractionRunId === runId && this.extractionStartTime) {
    const totalSecs = Math.round((Date.now() - this.extractionStartTime) / 1000);
    const timeStr = this.formatElapsed(totalSecs);
    const extractedCount = totalCount - cachedCount;
    const cacheNote = cachedCount > 0 ? ` (${cachedCount} cached, ${extractedCount} extracted)` : '';
    this.showNotification(
        `Feature extraction complete \u2014 ${totalCount} files${cacheNote} in ${timeStr}`,
        'success'
    );
    this.extractionStartTime = null;
}
```

- [ ] **Step 5: Initialize `_extractionCachedCount` in constructor**

In the constructor, near line 369 (after `this._extractionLastTotal`), add:

```javascript
this._extractionCachedCount = 0; // Cached file count for progress display
```

- [ ] **Step 6: Clear `_extractionCachedCount` in `cancelBackgroundExtraction()`**

In `cancelBackgroundExtraction()` (line 6597), after `this.extractionCompletionTimes = [];` (line 6617), add:

```javascript
this._extractionCachedCount = 0;
```

- [ ] **Step 7: Verify unit tests still pass**

Run: `npx vitest run`
Expected: All 110 tests pass.

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-024): update progress indicators to show cache hit count

- 'All N features loaded from cache' when 0 new files
- 'Extracting features: X/Y (Z%) — N cached' during extraction
- 'Feature extraction complete — N files (M cached, K extracted) in Xs'"
```

---

### Task 8: Run full test suite and manual verification

**Files:** None (verification only)

- [ ] **Step 1: Run unit tests**

Run: `npx vitest run`
Expected: All 110 tests pass.

- [ ] **Step 2: Run E2E tests**

Run: `npm run test:e2e`
Expected: All 29 tests pass. E2E tests don't exercise ML sort, so they validate no regressions in folder loading, navigation, rating, etc.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No errors. Warnings for `_`-prefixed unused vars are acceptable.

- [ ] **Step 4: Manual smoke test checklist**

1. Open a folder with 20+ images
2. Click "Sort by Prediction" — should extract features, save `.feature_cache.json`
3. Switch to a different folder, then switch back
4. Click "Sort by Prediction" again — should show "All N features loaded from cache" (not re-extract)
5. Modify one image externally (e.g., rename+rename back to change mtime) — that file should re-extract
6. Delete a file externally, re-sort — deleted file pruned from cache silently
7. Check `.feature_cache.json` contains `"version": 3` and per-entry `{vector, size, mtime}` objects

- [ ] **Step 5: Commit any fixes from testing**

If any issues found, fix and commit individually.
