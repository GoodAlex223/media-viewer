# Group E: Resource Management — Design

**Date**: 2026-04-20
**Branch**: `feature/resource-management`
**Source**: WEEKLY.md Group E (Thursday April 17, 5 SP) — BACKLOG TASK-028 (CLIP unload) + TASK-025 (logger double-init)
**Status**: Design approved, ready for implementation plan

---

## Overview

Two independent, small-surface-area resource-management fixes shipped in a single PR:

1. **Unload CLIP model after extraction completes** (3 SP, IMPORTANT) — reclaim ~200–400 MB of main-process memory by nulling `clipProcessor`/`clipVisionModel` 30 seconds after background extraction finishes; re-load lazily on next CLIP IPC.
2. **Add double-init protection to `logger.js`** (2 SP, NICE TO HAVE) — close any existing file descriptor before opening a new one in `init()` to prevent fd leaks.

Both changes are backend/lifecycle plumbing. No UI changes. No user-visible behavior changes except the reclaimed memory.

---

## Architecture

### 1. CLIP Model Unload

**Trigger (renderer-driven):** at the end of `startBackgroundFeatureExtraction()` in `media-viewer.js`, schedule a 30-second `setTimeout` that fires a new `unloadClipModel` IPC. At the start of the same function, clear any pending timer — this means rapidly restarting extraction (e.g., switching folders) cancels the unload.

**Unload action (main process):** new `ipcMain.handle('unloadClipModel', ...)` nulls `clipProcessor`, `clipVisionModel`, and `clipModelError`. V8 reclaims the ~200–400 MB on the next GC cycle. No explicit `global.gc()` — would require `--expose-gc` CLI flag; not worth the infrastructure for a hint.

**Re-load:** existing `loadClipModel()` lazy-load path is unchanged. Next CLIP IPC after unload triggers a transparent re-load from the transformers.js on-disk cache (~1–2 seconds).

**Mid-await race mitigation:** each `extractClipEmbedding*` handler captures the module-level refs into local `const` variables immediately after `loadClipModel()` resolves, before any subsequent `await`. This guarantees an in-flight extraction completes with stable refs even if `unloadClipModel` fires during one of its internal `await`s.

### 2. Logger Double-Init Guard

**Current behavior:** `init(logDir)` unconditionally `fs.openSync(...)` and overwrites `logFd`. If called twice, the first fd is leaked.

**New behavior:** before `fs.openSync(...)`, if `logFd !== null`, call `fs.closeSync(logFd)` (wrapped in try/catch — an already-invalid fd on close should not block re-init). Reset `logFd = null` before reopening regardless of close outcome.

---

## Components & File-Level Changes

### `main.js` (~10 lines changed, ~15 added)

Near existing CLIP IPC handlers (~line 435):
```js
ipcMain.handle('unloadClipModel', () => {
    if (clipModelLoading) return { success: false, reason: 'loading' }; // defensive
    clipProcessor = null;
    clipVisionModel = null;
    clipModelError = null;
    return { success: true };
});
```

In `extractClipEmbedding` handler (~line 440), after `await loadClipModel(event)` success, before `try { ... }`:
```js
const processor = clipProcessor;
const model = clipVisionModel;
if (!processor || !model) return { success: false, error: 'CLIP unavailable' };
```
Replace `clipProcessor(image)` → `processor(image)` and `clipVisionModel(inputs)` → `model(inputs)` inside the try.

Same pattern in `extractClipEmbeddingBatch` handler (~line 477).

`loadClipModel()` itself: **unchanged.**

### `preload.js` (~1 line added)

In the `electronAPI` object exposed via `contextBridge`, next to other CLIP entries:
```js
unloadClipModel: () => ipcRenderer.invoke('unloadClipModel'),
```

### `media-viewer.js` (~8 lines added)

In the `MediaViewer` constructor, near other timer fields (e.g., alongside `extractionResumeTimer`):
```js
this.clipUnloadTimer = null;
```

At the start of `startBackgroundFeatureExtraction()` (~line 6849, after the early-return guards):
```js
if (this.clipUnloadTimer !== null) {
    clearTimeout(this.clipUnloadTimer);
    this.clipUnloadTimer = null;
}
```

At the end of `startBackgroundFeatureExtraction()` (after cache save and ML scoring trigger, ~line 6991):
```js
if (this.enableClipFeatures) {
    this.clipUnloadTimer = setTimeout(() => {
        window.electronAPI.unloadClipModel();
        this.clipUnloadTimer = null;
    }, 30000);
}
```

### `logger.js` (~5 lines changed)

In `init(logDir)`, before `logPath = ...`:
```js
if (logFd !== null) {
    try {
        fs.closeSync(logFd);
    } catch (_e) {
        // fd already invalid — proceed with re-init
    }
    logFd = null;
}
```

### `tests/logger.test.js` (~1 new test case)

Add inside the existing `describe('logger', ...)` suite:
```js
it('closes existing fd when init() is called twice', () => {
    const closeSyncSpy = vi.spyOn(fs, 'closeSync');
    logger.init(tmpDir);
    const firstCallCount = closeSyncSpy.mock.calls.length;
    logger.init(tmpDir);
    expect(closeSyncSpy.mock.calls.length).toBe(firstCallCount + 1);
    closeSyncSpy.mockRestore();
    logger.cleanup();
});
```

(Final test pattern may vary to match existing helper style in the file; intent is to assert one additional `closeSync` during the second `init`.)

---

## Data Flow

### Happy Path — CLIP Unload

```
User opens folder A (CLIP enabled)
  → startBackgroundFeatureExtraction() starts
  → clears any pending clipUnloadTimer
  → per-file extractClipEmbedding IPC → main loadClipModel() (lazy, ~1-2s first time)
  → extraction completes
  → setTimeout(unloadClipModel, 30000) scheduled
  → 30s elapses without new extraction
  → unloadClipModel IPC fires
  → clipProcessor/clipVisionModel/clipModelError = null
  → V8 reclaims ~200-400 MB on next GC cycle

Later, user opens folder B
  → startBackgroundFeatureExtraction() runs
  → pending timer (if any) cleared at start
  → extractClipEmbedding → loadClipModel() re-loads from transformers.js disk cache
  → extraction runs normally
```

### Happy Path — Logger Init (existing + new behavior)

```
app.whenReady() → logger.init(logsDir) → logFd === null → skip close → logFd = fdA
[hypothetical future double-init or test re-init]
                → logger.init(logsDir) → logFd === fdA → closeSync(fdA) → logFd = fdB
app 'will-quit' → logger.cleanup()       → closeSync(fdB), unlink file
```

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Extraction restarts within 30s grace | Pending timer cleared at start of `startBackgroundFeatureExtraction()`; no unload fires |
| CLIP disabled (`enableClipFeatures === false`) | Timer never scheduled; no unload IPC; model was never loaded |
| CLIP toggled off mid-session | Out of scope — existing code doesn't unload on toggle either |
| On-demand CLIP IPC during 30s grace | Model still loaded; call succeeds; timer is NOT cleared by on-demand calls. Worst case: one extra re-load later. Acceptable tradeoff |
| `unloadClipModel` fires while `extractClipEmbedding` mid-await | Local-capture in handler; in-flight call completes with stable refs |
| `unloadClipModel` fires while `loadClipModel` in progress (`clipModelLoading === true`) | Unload handler short-circuits with `{ success: false, reason: 'loading' }`; does not null refs. The extraction that triggered the load will have cleared the timer already, but the guard is defensive |
| App quits with timer pending | Electron destroys renderer, main exits, OS reclaims memory/fd. No leak |
| `logger.init()` called with `logFd === null` (normal first call) | `if (logFd !== null)` branch skipped; unchanged behavior |
| `logger.init()` called with stale/invalid fd | `closeSync` throws; caught; `logFd = null` applied regardless; new fd opens successfully |

---

## Error Handling

- CLIP unload IPC errors (vanishingly unlikely — it's three null assignments) propagate back via the `{ success: false, ... }` pattern matching other CLIP IPC handlers. The renderer's timer callback does not await or inspect the result; a failed unload is no worse than no unload.
- Logger close-on-invalid-fd errors are swallowed with a `/* already invalid */` comment; matches the pattern in the existing `cleanup()` function.
- No user-facing notifications. This is backend plumbing; any observable problems would surface through existing error surfaces (main console log file, renderer error handler).

---

## Testing & Verification

### Automated

- **`tests/logger.test.js`**: new test case asserting `closeSync` is called once on second `init()`. Expected: unit suite adds one new passing test; no existing tests regress.
- **No new automated test for CLIP unload.** Covered by:
  - Manual verification (below)
  - Existing `tests/e2e/clip-graceful-degradation.test.js` exercises the re-load path transparently

### Manual Verification (pre-merge)

1. Launch app; open a folder of ~20 images; enable CLIP Features (F1 settings panel).
2. Wait for "Feature extraction complete" notification.
3. Note Electron main-process memory in Task Manager (~500–700 MB range with CLIP loaded).
4. Wait 30 seconds.
5. Confirm memory drops by ~200–400 MB within a few seconds of the timer firing.
6. Open a different folder with CLIP-uncached images.
7. Verify extraction restarts and the model re-loads without error.
8. Repeat (2)–(5) on the new folder to confirm unload fires again.
9. Edge case: open folder A → wait until extraction 90% done → open folder B before extraction completes. Confirm no unload fires between folders.

### Pre-Commit / CI

- `npm run lint` clean
- `npm run format:check` clean
- `npm test` green
- `npm run test:e2e` green (in particular `clip-graceful-degradation.test.js`)

---

## Success Criteria

1. CLIP main-process memory footprint drops by ≥200 MB within ~40s of extraction completion (30s timer + V8 collection cycle), verified manually.
2. Opening a new folder after unload triggers transparent re-load — no user-visible errors, existing CLIP UX unchanged.
3. Logger double-init closes the first fd before opening the second; unit test covers this behavior.
4. `npm run lint` + `npm test` green; `npm run test:e2e` green.
5. No regression in compare mode, zoom, fullscreen, ML scoring, or background extraction (`regression-checker` agent review before PR).
6. No new warnings in renderer console or main log during a full extract-then-unload-then-reload cycle.

---

## Out of Scope

- Unloading CLIP on `enableClipFeatures` toggle off (tracked separately if needed)
- Unloading CLIP on folder unload / window close (folder switch handled via timer semantics; window close handled by OS)
- Memory-usage telemetry/logging (`process.memoryUsage()` polling) — not requested
- Adding `--expose-gc` flag + forced GC (declined in brainstorming Q3)
- Converting logger to per-caller instances (global `logFd` remains the design)
- GPU acceleration for CLIP inference (BACKLOG, separate)
- CLIP text-search UI (BACKLOG, separate)

---

## Risk Assessment

**Low.** Total surface area: ~25 lines of functional change across 4 files + 1 unit test.

- CLIP change leans entirely on the existing lazy-load path; worst-case failure mode is "CLIP unavailable until app restart," which the existing graceful-degradation path (`clip-graceful-degradation.test.js`) already handles.
- Logger change is a 5-line defensive guard in a single function with no current double-call paths — purely additive safety.
- No changes to cache invalidation, IPC handler signatures, or any other lifecycle code.
- No dependencies between the two changes; can be landed and reverted independently if needed.
