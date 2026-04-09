# CLIP/ML Pipeline Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up four pieces of CLIP/ML technical debt from TASK-028: IPC listener leak, wasted image decodes, broken model persistence, and dead source file.

**Architecture:** Four independent fixes in the CLIP/ML pipeline. Tasks 1-3 modify `media-viewer.js` and `preload.js`. Task 4 deletes `clip-worker.js` and updates ESLint config. No new files created.

**Tech Stack:** Electron IPC (`ipcRenderer.on/removeListener`), Vitest, ESLint flat config

**Design spec:** `docs/superpowers/specs/2026-04-09-clip-ml-cleanup-design.md`

---

### Task 1: Fix IPC listener accumulation for `clip-download-progress`

**Files:**
- Modify: `preload.js:30`
- Modify: `media-viewer.js:6434-6465` (`initClipModel()`)

- [ ] **Step 1: Modify `preload.js` to return a cleanup function**

In `preload.js:30`, replace the current `onClipDownloadProgress` that uses bare `ipcRenderer.on()` with a version that returns a removal function:

```js
// preload.js:30 — replace this line:
onClipDownloadProgress: (callback) => ipcRenderer.on('clip-download-progress', (_event, data) => callback(data)),

// with:
onClipDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('clip-download-progress', handler);
    return () => ipcRenderer.removeListener('clip-download-progress', handler);
},
```

- [ ] **Step 2: Modify `initClipModel()` in `media-viewer.js` to call the cleanup function**

In `media-viewer.js`, replace the `initClipModel()` method (lines 6434-6465) with:

```js
async initClipModel() {
    if (!this.enableClipFeatures) return;
    if (!window.electronAPI.loadClipModel) return;

    // Listen for download progress (returns cleanup function)
    let removeProgressListener;
    if (window.electronAPI.onClipDownloadProgress) {
        removeProgressListener = window.electronAPI.onClipDownloadProgress((data) => {
            this.clipModelDownloading = true;
            if (data.progress % 10 === 0) {
                this.showNotification(`Downloading CLIP model... ${data.progress}%`, 'info');
            }
        });
    }

    try {
        const result = await window.electronAPI.loadClipModel();
        this.clipModelDownloading = false;
        if (result.success) {
            this.clipWorkerReady = true;
            this.showNotification('CLIP model loaded', 'success');
        } else {
            this.clipWorkerReady = false;
            console.error('CLIP model failed to load:', result.error);
            this.showNotification('CLIP model unavailable — using basic features only', 'warning');
        }
    } catch (err) {
        this.clipWorkerReady = false;
        this.clipModelDownloading = false;
        console.error('CLIP model init error:', err.message);
        this.showNotification('CLIP model unavailable — using basic features only', 'warning');
    } finally {
        if (removeProgressListener) {
            removeProgressListener();
        }
    }
}
```

Key change: `finally` block ensures the listener is removed whether `loadClipModel()` succeeds or fails.

- [ ] **Step 3: Run lint to verify**

Run: `npm run lint`
Expected: PASS, no new warnings.

- [ ] **Step 4: Run tests to verify no regressions**

Run: `npm test`
Expected: All 158 tests pass.

- [ ] **Step 5: Commit**

```bash
git add preload.js media-viewer.js
git commit -m "fix: remove IPC listener accumulation for clip-download-progress

onClipDownloadProgress now returns a cleanup function; initClipModel()
calls it in a finally block after loadClipModel() resolves."
```

---

### Task 2: Skip redundant `loadMediaAsImageData` for CLIP-only extractions

**Files:**
- Modify: `media-viewer.js:6854` (in `startBackgroundFeatureExtraction()`)

- [ ] **Step 1: Add `featureCache` guard before `loadMediaAsImageData`**

In `media-viewer.js`, in the `startBackgroundFeatureExtraction()` method, find the extraction loop (around line 6854). Replace:

```js
                try {
                    const imageData = await this.loadMediaAsImageData(file.path);
```

with:

```js
                try {
                    const needsHandCrafted = !this.featureCache.has(file.path);
                    const imageData = needsHandCrafted
                        ? await this.loadMediaAsImageData(file.path)
                        : null;
```

This is safe because:
- `enqueueFeatureExtraction()` at line 6652-6656 early-returns for cached files (checks `this.featureCache.has(filePath)` and resolves immediately), never touching `imageData`.
- `extractClipEmbedding(filePath, _imageData)` at line 6467 ignores the `_imageData` parameter — it reads the file via IPC using the file path.

- [ ] **Step 2: Run lint to verify**

Run: `npm run lint`
Expected: PASS, no new warnings.

- [ ] **Step 3: Run tests to verify no regressions**

Run: `npm test`
Expected: All 158 tests pass.

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "perf: skip redundant loadMediaAsImageData for CLIP-only extractions

Files with cached hand-crafted features no longer decode the image
during background extraction. CLIP uses the file path via IPC."
```

---

### Task 3: Handle stale `.ml_model.json` after version upgrade

**Files:**
- Modify: `media-viewer.js:5580-5596` (`saveMlModel()`)
- Modify: `media-viewer.js:5365-5369` (`handleMlWorkerMessage`, `initComplete` case)
- Add method: `media-viewer.js` (`deleteMlModelCache()`, near `saveMlModel()`)

- [ ] **Step 1: Remove redundant outer `version: 1` from `saveMlModel()`**

In `media-viewer.js`, find `saveMlModel()` (line 5580). Replace:

```js
    async saveMlModel() {
        if (!this.baseFolderPath || !this.mlModelState) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.ml_model.json');
            await window.electronAPI.writeFile(
                cacheFile,
                JSON.stringify({
                    version: 1,
                    modelState: this.mlModelState,
                    timestamp: Date.now(),
                })
            );
        } catch (error) {
            console.error('Failed to save ML model:', error);
        }
    }
```

with:

```js
    async saveMlModel() {
        if (!this.baseFolderPath || !this.mlModelState) return;

        try {
            const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.ml_model.json');
            await window.electronAPI.writeFile(
                cacheFile,
                JSON.stringify({
                    modelState: this.mlModelState,
                    timestamp: Date.now(),
                })
            );
        } catch (error) {
            console.error('Failed to save ML model:', error);
        }
    }
```

The `this.mlModelState` already contains `version: 3` and `featureDim: 576` from `OnlineLogisticRegression.toJSON()`. The load path (`loadMlModel()` at line 5556) reads `parsed.modelState` and sends it to the worker. The outer wrapper `version: 1` was never used by anything.

- [ ] **Step 2: Add `deleteMlModelCache()` method**

In `media-viewer.js`, immediately after `saveMlModel()` (after line 5596), add:

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

Writing an empty string makes the load path (`loadMlModel`) hit `JSON.parse('')` which throws, caught by its existing `catch` block that logs "No ML model cache found".

- [ ] **Step 3: Call `deleteMlModelCache()` on model reset**

In `media-viewer.js`, find the `modelWasReset` handler in `handleMlWorkerMessage()` (line 5365). Replace:

```js
                if (message.modelWasReset) {
                    console.warn('ML model was reset (version/dim mismatch) — clearing stale cache');
                    this.mlModelState = null;
                    this.predictionScores = new Map();
                }
```

with:

```js
                if (message.modelWasReset) {
                    console.warn('ML model was reset (version/dim mismatch) — clearing stale cache');
                    this.mlModelState = null;
                    this.predictionScores = new Map();
                    this.deleteMlModelCache();
                }
```

- [ ] **Step 4: Run lint to verify**

Run: `npm run lint`
Expected: PASS, no new warnings.

- [ ] **Step 5: Run tests to verify no regressions**

Run: `npm test`
Expected: All 158 tests pass. (The ML model save/load path isn't unit-tested; `ml-model.test.js` tests `isCompatible()`/`fromJSON()` which are unchanged.)

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js
git commit -m "fix: handle stale .ml_model.json after version upgrade

Remove redundant outer version:1 wrapper from saveMlModel(). Add
deleteMlModelCache() to clear stale files on version/dim mismatch,
breaking the reset-on-every-restart cycle."
```

---

### Task 4: Delete `clip-worker.js` and its test

**Files:**
- Delete: `clip-worker.js`
- Delete: `tests/clip-worker.test.js`
- Modify: `eslint.config.mjs:1-14` (header comment), `eslint.config.mjs:152-167` (block 3c)

- [ ] **Step 1: Delete `clip-worker.js`**

```bash
git rm clip-worker.js
```

- [ ] **Step 2: Delete `tests/clip-worker.test.js`**

```bash
git rm tests/clip-worker.test.js
```

- [ ] **Step 3: Remove ESLint block 3c from `eslint.config.mjs`**

In `eslint.config.mjs`, remove the block 3c comment from the header (lines 1-14) and the actual config block (lines 152-167).

**Header** — update the comment block at the top of the file. Replace:

```js
// ESLint flat configuration for Electron media_viewer project.
//
// Eleven file-group blocks:
//   1.  Node/Electron main           — main.js, logger.js
//   1b. Electron preload             — preload.js (Node + browser hybrid)
//   2a. Browser renderer (module)    — media-viewer.js (loaded as type="module")
//   2b. Browser renderer (script)    — face-detector.js (loaded as plain <script>)
//   2c. Browser renderer modules     — fullscreen.js (ES module, imported by media-viewer.js)
//   3a. Web Workers                  — sorting-worker.js, ml-worker.js, feature-worker.js
//   3b. Shared libs (worker+browser) — feature-extractor.js, ml-model.js
//   3c. CLIP Worker                  — clip-worker.js (dynamic import + CJS exports)
//   4.  Unit tests (Vitest)          — tests/**/*.js (excl. e2e)
//   5a. E2E helpers (CJS)            — tests/e2e/**/*.cjs
//   5b. E2E tests (Playwright)       — tests/e2e/**/*.js, playwright.config.js
//
// eslint-config-prettier applied last to suppress formatting rule conflicts.
```

with:

```js
// ESLint flat configuration for Electron media_viewer project.
//
// Ten file-group blocks:
//   1.  Node/Electron main           — main.js, logger.js
//   1b. Electron preload             — preload.js (Node + browser hybrid)
//   2a. Browser renderer (module)    — media-viewer.js (loaded as type="module")
//   2b. Browser renderer (script)    — face-detector.js (loaded as plain <script>)
//   2c. Browser renderer modules     — fullscreen.js (ES module, imported by media-viewer.js)
//   3a. Web Workers                  — sorting-worker.js, ml-worker.js, feature-worker.js
//   3b. Shared libs (worker+browser) — feature-extractor.js, ml-model.js
//   4.  Unit tests (Vitest)          — tests/**/*.js (excl. e2e)
//   5a. E2E helpers (CJS)            — tests/e2e/**/*.cjs
//   5b. E2E tests (Playwright)       — tests/e2e/**/*.js, playwright.config.js
//
// eslint-config-prettier applied last to suppress formatting rule conflicts.
```

**Config block** — remove the entire block 3c (lines 152-167):

```js
    // 3c. CLIP Worker (module worker — dynamic import + conditional CJS exports for testing)
    {
        files: ['clip-worker.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.worker,
                module: 'readonly',
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },
```

- [ ] **Step 4: Run lint to verify config is valid**

Run: `npm run lint`
Expected: PASS (no errors about missing files, no config issues).

- [ ] **Step 5: Run tests to verify no regressions**

Run: `npm test`
Expected: PASS. Test count drops from 158 to 150 (8 tests removed from `clip-worker.test.js`). All remaining tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete dead clip-worker.js and its tests

clip-worker.js was never instantiated as a Worker since d21e213 moved
CLIP inference to main process IPC. Removes 225 lines of dead code,
8 tests for dead code, and ESLint block 3c."
```

---

### Task 5: Final verification and CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (architecture section, conventions section)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: 150 tests pass (8 removed from clip-worker.test.js).

- [ ] **Step 2: Run lint on entire project**

Run: `npm run lint`
Expected: PASS, no errors.

- [ ] **Step 3: Run format check**

Run: `npm run format:check`
Expected: PASS, all files formatted.

- [ ] **Step 4: Update CLAUDE.md architecture section**

In `CLAUDE.md`, in the architecture tree, remove the `clip-worker.js` line. Replace:

```
├── clip-worker.js       # CLIP helper module (averageEmbeddings, CLIP_EMBEDDING_DIM exports); no longer spawned as a Worker — CLIP inference moved to main process IPC (d21e213); scheduled for deletion in feature/clip-ml-cleanup (dead code)
```

with nothing (delete the entire line).

Also in CLAUDE.md, in the architecture tree, update the unit tests comment. Replace:

```
│   ├── *.test.js        # Unit: sorting-worker, ml-model, feature-extractor, media-viewer-utils, ml-pair-selection, logger, keyboard-shortcuts, clip-worker
```

with:

```
│   ├── *.test.js        # Unit: sorting-worker, ml-model, feature-extractor, media-viewer-utils, ml-pair-selection, logger, keyboard-shortcuts
```

- [ ] **Step 5: Update CLAUDE.md conventions section**

In the ESLint description, replace `Eleven file-group blocks` with `Ten file-group blocks` and remove the `3c: clip-worker` reference. Replace:

```
- ESLint flat config (`eslint.config.mjs`): Eleven file-group blocks (1: Node/main, 1b: preload, 2a: renderer module, 2b: renderer script, 2c: fullscreen.js, 3a: workers, 3b: shared libs, 3c: clip-worker, 4: unit tests, 5a: e2e CJS helpers, 5b: e2e JS tests); `clip-worker.js` gets its own block (3c) because it uses dynamic `import()` of ESM packages; shared rules: eqeqeq, curly, prefer-const, no-var, no-shadow (warn), no-unused-vars (warn, `_`-prefix escape); `eslint-config-prettier` applied last
```

with:

```
- ESLint flat config (`eslint.config.mjs`): Ten file-group blocks (1: Node/main, 1b: preload, 2a: renderer module, 2b: renderer script, 2c: fullscreen.js, 3a: workers, 3b: shared libs, 4: unit tests, 5a: e2e CJS helpers, 5b: e2e JS tests); shared rules: eqeqeq, curly, prefer-const, no-var, no-shadow (warn), no-unused-vars (warn, `_`-prefix escape); `eslint-config-prettier` applied last
```

Also remove the Module worker import reference. Replace:

```
- Module worker: `new Worker('clip-worker.js', { type: 'module' })` pattern exists but is NOT used for CLIP inference — `@huggingface/transformers` cannot resolve in Electron Web Workers (npm package resolution unavailable); CLIP moved to main process dynamic `import('@huggingface/transformers')` via IPC
```

with nothing (delete the entire line).

- [ ] **Step 6: Update CLAUDE.md git insights in-progress section**

Replace the in-progress line:

```
- `feature/clip-ml-cleanup` — CLIP/ML pipeline cleanup (7 SP); design spec at `docs/superpowers/specs/2026-04-09-clip-ml-cleanup-design.md`
```

with:

```
- `feature/clip-ml-cleanup` — CLIP/ML pipeline cleanup (7 SP); implementation complete, pending review
```

- [ ] **Step 7: Run tests one final time**

Run: `npm test`
Expected: 150 tests pass.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md after clip-worker.js deletion

Remove clip-worker.js from architecture, update ESLint block count
from eleven to ten, remove stale module worker import reference."
```
