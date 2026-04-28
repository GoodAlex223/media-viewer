# Group E: Resource Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reclaim ~200-400 MB of main-process memory by unloading the CLIP model 30 seconds after background extraction completes (with transparent re-load on next use), and add a close-and-reopen guard to `logger.init()` to prevent fd leaks on double-init.

**Architecture:** Two independent changes bundled in one PR on `feature/resource-management`. (1) CLIP unload: renderer schedules a 30s timer at the end of `startBackgroundFeatureExtraction()` that fires a new `unloadClipModel` IPC nulling the module-level model refs in `main.js`; extraction handlers capture local refs to survive mid-await unload. (2) Logger: `init()` closes any existing fd (wrapped in try/catch) before opening a new one.

**Tech Stack:** Electron 30 main/renderer/preload IPC, vanilla JS, Vitest for unit tests, `@huggingface/transformers` CLIP (main-process IPC), Node `fs` sync APIs.

**Spec:** [docs/superpowers/specs/2026-04-20-group-e-resource-management-design.md](../specs/2026-04-20-group-e-resource-management-design.md)

**Branch:** `feature/resource-management` (already checked out; spec committed at 6c8bb68)

---

## Task 1: Logger double-init guard (TDD)

**Files:**
- Modify: `logger.js:7-11` (`init()` function)
- Modify: `tests/logger.test.js` (add test case in `describe('init()', ...)` block at line 30)

- [ ] **Step 1.1: Write the failing test**

Add this test case inside the `describe('init()', ...)` block at [tests/logger.test.js:30](../../../tests/logger.test.js#L30), after the existing `'creates directory if it does not exist'` test:

```js
it('closes existing fd before opening a new one on second init', async () => {
    const { vi } = await import('vitest');
    const closeSyncSpy = vi.spyOn(fs, 'closeSync');
    logger.init(testLogDir);
    const callsAfterFirst = closeSyncSpy.mock.calls.length;
    logger.init(testLogDir);
    const callsAfterSecond = closeSyncSpy.mock.calls.length;
    expect(callsAfterSecond).toBe(callsAfterFirst + 1);
    closeSyncSpy.mockRestore();
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run tests/logger.test.js -t "closes existing fd"`

Expected: FAIL — `expected <n> to be <n+1>` (current `init()` does not call `closeSync` on re-init).

- [ ] **Step 1.3: Implement the guard**

Edit [logger.js:7-11](../../../logger.js#L7-L11). Replace the `init()` body:

```js
function init(logDir) {
    if (logFd !== null) {
        try {
            fs.closeSync(logFd);
        } catch (_e) {
            // fd already invalid — proceed with re-init
        }
        logFd = null;
    }
    fs.mkdirSync(logDir, { recursive: true });
    logPath = path.join(logDir, 'media-viewer.log');
    logFd = fs.openSync(logPath, 'w');
}
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `npx vitest run tests/logger.test.js`

Expected: PASS — all 13 logger tests green (existing 12 + new 1).

- [ ] **Step 1.5: Commit**

```bash
git add logger.js tests/logger.test.js
git commit -m "fix(logger): close existing fd before reopening on double-init

Prevents fd leak if init() is called twice without an intervening cleanup().
Existing fd is closed (try/catch around an invalid-fd case) and logFd is
reset to null before opening a new file descriptor. Adds a unit test that
spies on fs.closeSync to verify one additional close call on second init().

Source: BACKLOG TASK-025 (double-init protection).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `unloadClipModel` IPC handler + preload bridge

**Files:**
- Modify: `main.js:438` (after `loadClipModel` IPC handler block ending at line 438)
- Modify: `preload.js:29-34` (add `unloadClipModel` entry in the CLIP section)

- [ ] **Step 2.1: Add the `unloadClipModel` IPC handler in main.js**

Insert immediately after [main.js:438](../../../main.js#L438) (the closing `});` of the `loadClipModel` handler) and before the `extractClipEmbedding` handler:

```js
    ipcMain.handle('unloadClipModel', () => {
        if (clipModelLoading) {
            return { success: false, reason: 'loading' };
        }
        clipProcessor = null;
        clipVisionModel = null;
        clipModelError = null;
        return { success: true };
    });

```

(Note the 4-space indent — matches the surrounding `ipcMain.handle(...)` block inside `app.whenReady().then(() => { ... })`.)

- [ ] **Step 2.2: Expose `unloadClipModel` in preload.js**

Edit [preload.js:29](../../../preload.js#L29). Change:

```js
    extractClipEmbeddingBatch: (imagePaths) => ipcRenderer.invoke('extractClipEmbeddingBatch', imagePaths),
    onClipDownloadProgress: (callback) => {
```

to:

```js
    extractClipEmbeddingBatch: (imagePaths) => ipcRenderer.invoke('extractClipEmbeddingBatch', imagePaths),
    unloadClipModel: () => ipcRenderer.invoke('unloadClipModel'),
    onClipDownloadProgress: (callback) => {
```

- [ ] **Step 2.3: Verify lint and existing tests still pass**

Run: `npm run lint && npx vitest run`

Expected: lint clean; 160 tests pass (159 pre-existing + 1 from Task 1).

- [ ] **Step 2.4: Commit**

```bash
git add main.js preload.js
git commit -m "feat(clip): add unloadClipModel IPC handler

New ipcMain.handle('unloadClipModel') nulls clipProcessor, clipVisionModel,
and clipModelError so V8 can reclaim the ~200-400 MB held by the CLIP ONNX
model. Handler short-circuits with { success: false, reason: 'loading' }
if loadClipModel is in flight to avoid racing against an in-progress load.
Exposed in preload.js as window.electronAPI.unloadClipModel().

The existing lazy-load path in loadClipModel() handles transparent re-load
on the next CLIP IPC — no caller-side reload logic needed.

Source: BACKLOG TASK-028 (unload CLIP model after extraction completes).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add local-capture race mitigation to extraction handlers

**Files:**
- Modify: `main.js:440-475` (`extractClipEmbedding` handler)
- Modify: `main.js:477-536` (`extractClipEmbeddingBatch` handler)

**Why:** without local capture, an in-flight `extractClipEmbedding*` handler that awaits between `loadClipModel()` success and the actual model call could see `clipProcessor` or `clipVisionModel` nulled by a concurrent `unloadClipModel` IPC, causing a TypeError.

- [ ] **Step 3.1: Refactor `extractClipEmbedding` to use locally-captured refs**

Replace the body of the `extractClipEmbedding` handler at [main.js:440-475](../../../main.js#L440-L475) so it reads:

```js
    ipcMain.handle('extractClipEmbedding', async (event, imagePath) => {
        // Load model if needed
        const loadResult = await loadClipModel(event);
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        // Capture local refs to survive a concurrent unloadClipModel during await
        const processor = clipProcessor;
        const model = clipVisionModel;
        if (!processor || !model) {
            return { success: false, error: 'CLIP unavailable' };
        }

        try {
            const { RawImage } = await import('@huggingface/transformers');

            // Read image file and create RawImage
            const image = await RawImage.read(imagePath);

            // Process through CLIP vision encoder
            const inputs = await processor(image);
            const output = await model(inputs);

            // Extract and normalize embedding
            const embedding = output.image_embeds.data;
            const dim = 512;
            const result = new Float32Array(dim);

            let norm = 0;
            for (let i = 0; i < dim; i++) {
                norm += embedding[i] * embedding[i];
            }
            norm = Math.sqrt(norm);
            for (let i = 0; i < dim; i++) {
                result[i] = norm > 0 ? embedding[i] / norm : 0;
            }

            return { success: true, embedding: Array.from(result) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
```

Only changes: added the `const processor = ...; const model = ...;` + null guard block after the `loadClipModel` success check; changed `clipProcessor(image)` → `processor(image)` and `clipVisionModel(inputs)` → `model(inputs)`.

- [ ] **Step 3.2: Refactor `extractClipEmbeddingBatch` the same way**

Replace the body of the `extractClipEmbeddingBatch` handler at [main.js:477-536](../../../main.js#L477-L536) so it reads:

```js
    ipcMain.handle('extractClipEmbeddingBatch', async (event, imagePaths) => {
        // Load model if needed
        const loadResult = await loadClipModel(event);
        if (!loadResult.success) {
            return { success: false, error: loadResult.error };
        }

        // Capture local refs to survive a concurrent unloadClipModel during await
        const processor = clipProcessor;
        const model = clipVisionModel;
        if (!processor || !model) {
            return { success: false, error: 'CLIP unavailable' };
        }

        try {
            const { RawImage } = await import('@huggingface/transformers');
            const dim = 512;
            const embeddings = [];

            for (const imagePath of imagePaths) {
                try {
                    const image = await RawImage.read(imagePath);
                    const inputs = await processor(image);
                    const output = await model(inputs);

                    const embedding = output.image_embeds.data;
                    const normalized = new Float32Array(dim);
                    let normVal = 0;
                    for (let i = 0; i < dim; i++) {
                        normVal += embedding[i] * embedding[i];
                    }
                    normVal = Math.sqrt(normVal);
                    for (let i = 0; i < dim; i++) {
                        normalized[i] = normVal > 0 ? embedding[i] / normVal : 0;
                    }
                    embeddings.push(Array.from(normalized));
                } catch (err) {
                    console.warn(`CLIP extraction failed for ${imagePath}:`, err.message);
                }
            }

            if (embeddings.length === 0) {
                return { success: false, error: 'No valid embeddings' };
            }

            // Average embeddings
            const averaged = new Float32Array(dim);
            for (const emb of embeddings) {
                for (let i = 0; i < dim; i++) {
                    averaged[i] += emb[i];
                }
            }
            let norm = 0;
            for (let i = 0; i < dim; i++) {
                averaged[i] /= embeddings.length;
                norm += averaged[i] * averaged[i];
            }
            norm = Math.sqrt(norm);
            for (let i = 0; i < dim; i++) {
                averaged[i] = norm > 0 ? averaged[i] / norm : 0;
            }

            return { success: true, embedding: Array.from(averaged), frameCount: embeddings.length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
```

Only changes: added the `const processor = ...; const model = ...;` + null guard block; replaced `clipProcessor(image)` → `processor(image)` and `clipVisionModel(inputs)` → `model(inputs)` inside the inner for-loop.

- [ ] **Step 3.3: Verify lint and existing tests still pass**

Run: `npm run lint && npx vitest run`

Expected: lint clean; 160 tests pass (no new tests added in this task; the existing `clip-graceful-degradation.test.js` E2E covers the lazy re-load path).

- [ ] **Step 3.4: Commit**

```bash
git add main.js
git commit -m "fix(clip): capture local refs in extraction handlers for race safety

extractClipEmbedding and extractClipEmbeddingBatch now capture clipProcessor
and clipVisionModel into local consts immediately after loadClipModel()
resolves, before any subsequent await. This prevents a TypeError if a
concurrent unloadClipModel IPC fires mid-await and nulls the module-level
refs while a handler is still iterating over imagePaths or awaiting
RawImage.read().

Pattern: acquire refs once, use locals throughout the try block. Matches
the guarantees provided by loadClipModel()'s clipModelLoading concurrency
check on the load side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire up renderer `clipUnloadTimer`

**Files:**
- Modify: `media-viewer.js:~405` (MediaViewer constructor — add `this.clipUnloadTimer = null` alongside `extractionResumeTimer`)
- Modify: `media-viewer.js:~6852` (start of `startBackgroundFeatureExtraction()` — clear any pending timer)
- Modify: `media-viewer.js:~6991` (end of `startBackgroundFeatureExtraction()` — schedule unload)

- [ ] **Step 4.1: Add `clipUnloadTimer` field to the constructor**

At [media-viewer.js:405](../../../media-viewer.js#L405) (the line reading `this.extractionResumeTimer = null;`), insert a new line immediately after it:

Before:
```js
        this.extractionResumeTimer = null; // setTimeout handle for 2s idle resume
        this._extractionLastCurrent = 0; // Last known current count for paused redisplay
```

After:
```js
        this.extractionResumeTimer = null; // setTimeout handle for 2s idle resume
        this.clipUnloadTimer = null; // setTimeout handle for 30s CLIP model unload after extraction
        this._extractionLastCurrent = 0; // Last known current count for paused redisplay
```

- [ ] **Step 4.2: Clear any pending timer at start of `startBackgroundFeatureExtraction()`**

At [media-viewer.js:6852](../../../media-viewer.js#L6852) (inside `startBackgroundFeatureExtraction()`, after the early-return guards and before `this.cancelBackgroundExtraction();`), insert a new block:

Before:
```js
    async startBackgroundFeatureExtraction() {
        if (this.featureWorkers.length === 0 || this.mediaFiles.length === 0) {
            return;
        }

        // Cancel any existing background extraction
        this.cancelBackgroundExtraction();
```

After:
```js
    async startBackgroundFeatureExtraction() {
        if (this.featureWorkers.length === 0 || this.mediaFiles.length === 0) {
            return;
        }

        // Cancel any pending CLIP unload — extraction is restarting, keep the model loaded
        if (this.clipUnloadTimer !== null) {
            clearTimeout(this.clipUnloadTimer);
            this.clipUnloadTimer = null;
        }

        // Cancel any existing background extraction
        this.cancelBackgroundExtraction();
```

- [ ] **Step 4.3: Schedule unload at end of `startBackgroundFeatureExtraction()`**

At [media-viewer.js:6991](../../../media-viewer.js#L6991) (end of `startBackgroundFeatureExtraction()`, after the `this.requestPredictionScores();` call and before the closing `}` of the method), insert the unload-scheduling block:

Before:
```js
        // Trigger ML scoring if enabled and model is ready
        if (this.isMlEnabled && this.mlStats?.isReady) {
            this.requestPredictionScores();
        }
    }
```

After:
```js
        // Trigger ML scoring if enabled and model is ready
        if (this.isMlEnabled && this.mlStats?.isReady) {
            this.requestPredictionScores();
        }

        // Schedule CLIP model unload 30s from now to reclaim ~200-400 MB.
        // If extraction restarts within the grace window, the timer is cleared
        // at the start of startBackgroundFeatureExtraction(). The existing
        // loadClipModel() lazy path re-loads transparently on next CLIP IPC.
        if (this.enableClipFeatures) {
            this.clipUnloadTimer = setTimeout(() => {
                window.electronAPI.unloadClipModel();
                this.clipUnloadTimer = null;
            }, 30000);
        }
    }
```

- [ ] **Step 4.4: Verify lint and existing tests still pass**

Run: `npm run lint && npx vitest run && npm run format:check`

Expected: lint clean; 160 tests pass; format check clean.

- [ ] **Step 4.5: Commit**

```bash
git add media-viewer.js
git commit -m "feat(clip): schedule CLIP model unload 30s after extraction completes

MediaViewer.clipUnloadTimer is a setTimeout handle. It is scheduled at the
end of startBackgroundFeatureExtraction() when enableClipFeatures is true,
firing a window.electronAPI.unloadClipModel() IPC after 30 seconds.

If extraction restarts within the grace window (e.g., user switches
folders), the timer is cleared at the start of the function and no unload
fires. Worst-case friction is one ~1-2s re-load from transformers.js disk
cache on the next folder's extraction — a good tradeoff for reclaiming
~200-400 MB of main-process memory during idle periods.

Source: BACKLOG TASK-028 (unload CLIP model after extraction completes).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Manual verification

**Files:** None. This is a verification-only task.

- [ ] **Step 5.1: Run pre-commit checks**

Run all three in sequence:

```bash
npm run lint
npm run format:check
npm test
```

Expected: all clean; 160 tests pass.

- [ ] **Step 5.2: Manual verification — happy path**

1. Launch app: `npm start`
2. Open Settings (F1) and confirm CLIP Features toggle is ON.
3. Drop a folder containing ~20 images with no existing feature cache.
4. Wait for "Feature extraction complete" notification.
5. Open Windows Task Manager → Details tab → find the Electron main process (not the renderer). Note the current working-set memory (expect ~500–700 MB with CLIP loaded).
6. Wait 30 seconds without interacting.
7. Verify memory drops by ~200–400 MB in Task Manager (allow a few seconds after the 30s mark for V8 to reclaim).

- [ ] **Step 5.3: Manual verification — re-load path**

1. Open a different folder with CLIP-uncached images.
2. Confirm extraction restarts (progress indicator appears, "Feature extraction complete" eventually shows).
3. No user-visible errors (check renderer DevTools console and the main-process log at `%APPDATA%\media-viewer\logs\media-viewer.log` if needed).
4. Repeat Step 5.2 on the new folder to confirm unload fires again.

- [ ] **Step 5.4: Manual verification — grace-period cancellation**

1. Open folder A, wait until extraction is ~90% done.
2. Open folder B **before** folder A's extraction completes (drag new folder or use the open dialog).
3. Confirm folder A's extraction is cancelled; folder B's extraction starts.
4. Confirm memory does NOT drop between folders (the model stays loaded because no unload was ever scheduled).

- [ ] **Step 5.5: Manual verification — CLIP disabled**

1. Open Settings (F1) and toggle CLIP Features OFF.
2. Restart app (toggle triggers ML reset; restart to be safe).
3. Open a folder; wait for extraction to complete.
4. Confirm no unload IPC is scheduled (check main-process log for absence of any `unloadClipModel` activity — there should be nothing because the renderer's `if (this.enableClipFeatures)` guard short-circuits).
5. Confirm no errors in DevTools or main log.

- [ ] **Step 5.6: Push branch and open PR**

```bash
git push -u origin feature/resource-management
gh pr create --title "Group E: Resource Management — unload CLIP model + logger double-init guard" --body "$(cat <<'EOF'
## Summary

- Unload the CLIP ONNX model 30 seconds after background extraction completes, reclaiming ~200-400 MB of main-process memory. Re-load is transparent on the next CLIP IPC via the existing lazy path.
- Add a close-and-reopen guard to `logger.init()` to prevent fd leaks on double-init.
- Local-capture `clipProcessor`/`clipVisionModel` in extraction handlers for mid-await race safety against concurrent unload.

Design spec: `docs/superpowers/specs/2026-04-20-group-e-resource-management-design.md`

## Test plan

- [x] `npm run lint` clean
- [x] `npm run format:check` clean
- [x] `npm test` — 160 tests pass (13 logger tests including new double-init test)
- [x] Manual: CLIP memory drops ~200-400 MB 30s after extraction completes
- [x] Manual: re-load succeeds on next folder open with no user-visible error
- [x] Manual: grace-period cancellation works (folder switch mid-extraction)
- [x] Manual: CLIP disabled — no unload IPC scheduled
- [ ] CI: `npm run test:e2e` (run in CI or locally before merge) — in particular `clip-graceful-degradation.test.js`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Do **NOT** merge the PR automatically. Stop here and wait for human review per the project CLAUDE.md workflow (Task Completion section — user must approve before merge and docs archival).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Architecture §1 CLIP Model Unload → Tasks 2, 3, 4 ✓
- Architecture §2 Logger Double-Init Guard → Task 1 ✓
- Components §`main.js` → Tasks 2 (unload handler), 3 (local capture) ✓
- Components §`preload.js` → Task 2 ✓
- Components §`media-viewer.js` → Task 4 ✓
- Components §`logger.js` → Task 1 ✓
- Components §`tests/logger.test.js` → Task 1.1 ✓
- Data Flow, Edge Cases — covered by design; no separate task needed (Task 5 manual verification exercises the happy path, re-load, grace-period, and CLIP-disabled edge cases) ✓
- Success Criteria 1–3 — Task 5 manual verification ✓
- Success Criterion 4 (lint + tests green) — Task 5.1 ✓
- Success Criterion 5 (no regression) — addressed by Task 5 manual verification + regression-checker agent in PR review (post-plan) ✓
- Success Criterion 6 (no new warnings) — Task 5 manual verification ✓

**Placeholder scan:** No "TBD", "TODO", "similar to Task N", or vague instructions. All code blocks contain the exact content to insert. All commands include expected output.

**Type consistency:** `clipUnloadTimer` is consistently `null | ReturnType<typeof setTimeout>`. `unloadClipModel` IPC channel name used identically in main.js handler, preload.js bridge, and renderer call site. `clipProcessor`/`clipVisionModel` local captures named consistently as `processor`/`model` in both Task 3 sub-steps.
