# Group CW-1: Renderer Correctness Guards — Design Spec

**Date**: 2026-06-13
**Status**: Approved (design)
**Branch**: `cleanup/cw-1-renderer-correctness-guards`
**Source**: WEEKLY.md June 15–19 Cleanup Week, Group CW-1 (8 SP, 🟤 Auto-Generated)
**Consolidates BACKLOG entries**: PR #34 (2026-05-10), PR #41 (2026-06-04), PR #38 (2026-05-28), PR #40 (2026-06-02), Group B impl-review (2026-06-09), PR #35 (2026-05-16), PR #45 (2026-06-10), PR #31 (2026-04-28), PR #21 (2026-04-21), Group A impl-review + PR #42 (2026-06-07).

## Overview

A batch of seven independent defensive fixes accumulated from PR reviews #34–#45. Every item is small, well-isolated, and already diagnosed; this spec records the exact change, the location verified against current `main` (`4eca99a`), and the test approach. One branch, one PR, one review.

**Baseline**: 310 unit tests green on `main`.

**Method**: TDD where the unit harness reaches the code (`extractMethod` / `extractAsyncMethod` per project convention). Worker- and main-process-IPC items, which the unit harness cannot exercise, get lint + a reasoned manual trace and (for the worker init-error) a renderer-side message-routing test.

---

## Fix 1 — Clear `clipCache` in `loadFolder()`

**Bug** (real, 🟠 IMPORTANT): `loadFolder()` clears `perceptualHashes`, `featureCache`, `featureMetadata`, `predictionScores` but never `clipCache`. Stale 512-dim CLIP vectors leak across folder switches when two folders contain files at path-identical names.

**Change**: add `this.clipCache.clear();` to the cache-clear block at `media-viewer.js:2706-2709`.

**Test**: focused unit test seeding `clipCache` and asserting it is empty after the clear block runs (or extend the nearest existing `loadFolder` cache-reset assertion).

---

## Fix 2 — `isLoading` guard on `handleTournamentDraw` + `handleTournamentPick`

**Bug** (~75/100): the two tournament button click listeners (`media-viewer.js:2154`, `:2158`) call `handleTournamentDraw` directly. A rapid double-click while `showTournamentPair()` → `showCompareMedia()` is still awaiting fires a second `recordDraw`/`recordResult` after `roundQueue` has shifted → unhandled `'No active pair to record'` rejection. The keyboard path is already gated by the keydown dispatcher; the buttons are not.

**Change**:
- `handleTournamentDraw` (`media-viewer.js:4656`): add `if (this.isLoading) return;` as the first statement.
- `handleTournamentPick` (`media-viewer.js:4649`): same guard.
- Belt-and-suspenders: wrap the `tournament.handlePairDraw` / `tournament.handlePairResult` call in try/catch to swallow a stale-pair throw if one still slips through.

**Test**: `extractAsyncMethod('handleTournamentDraw')` — assert that with `isLoading=true` the method early-returns and `tournament.handlePairDraw` is not called.

---

## Fix 3 — `<2 files` fallback exits tournament mode (both sites)

**Bug** (~62/100): when file count drops below 2 during a tournament, the compare-fallback calls `switchToSingleModeUI()` but leaves `isTournamentMode = true` — the tournament keymap and overlay stay live over single-mode UI.

**Change**: add `if (this.isTournamentMode) this.exitTournamentMode();` immediately before the `switchToSingleModeUI()` call in **both** near-identical fallback sites:
- `showCompareMedia()` `<2` branch (`media-viewer.js:3065`).
- `_retryCompareAfterRemoval()` `<2` branch (`media-viewer.js:3035`).

WEEKLY names only `showCompareMedia`, but `_retryCompareAfterRemoval` carries the identical bug. No refactor into a shared helper (out of scope) — one guard line in each.

**Test**: unit assert that the `<2` path flips `isTournamentMode` to false when it was true.

---

## Fix 4 — `handleCancel` entry-type guard + null `leftMedia`/`rightMedia`

**Bug** (~25 + Group B impl-review): the compare-pair undo branch (`media-viewer.js:4023`) fires for any `isCompareMode && moveHistory.length >= 2`, even when the last move was a leftover single-mode move (no compare pair) — popping two unrelated entries. Separately, `switchToSingleModeUI` nulls the wrapper refs but leaves `leftMedia`/`rightMedia` element refs dangling.

**Verification**: `moveComparePair` (`media-viewer.js:5049`, `:5085`) sets `compareMode: true` on both entries it pushes; only single-mode `moveCurrentFile` (`:1571`) omits it. Therefore `&& lastMove.compareMode` correctly admits genuine compare-pair undos and excludes leftover single moves — production-safe.

**Change**:
- Add `&& lastMove.compareMode` to the compare-pair branch condition at `media-viewer.js:4023`.
- In the wrapper-teardown loop in `switchToSingleModeUI` (`media-viewer.js:4222-4229`), also set `this.leftMedia = null;` and `this.rightMedia = null;`.
- **Rider (forced by the guard change)**: the existing `handleCancel` compare-pair fixtures in `tests/media-viewer-utils.test.js` omit `compareMode: true`; tag them so they still reach the branch (PR #35 follow-up, BACKLOG 2026-05-16).

**Test**: add a regression case proving a leftover single-mode `lastMove` (no `compareMode`) does **not** trigger the two-entry pop; keep the tagged existing fixtures green.

---

## Fix 5 — Reset `clipWorkerReady` on unload + await/error-handle + riders

**Bug** (PR #45 + PR #31 + PR #21 follow-ups): the CLIP-unload timer callback (`media-viewer.js:8702-8705`) fires `window.electronAPI.unloadClipModel()` fire-and-forget — no await, no error handling — and never resets `clipWorkerReady`. The stale-true flag makes a toggle-on-after-unload skip the eager `initClipModel()`, so the first CLIP call eats a ~1–2s reload instead.

**Change** (rewrite the callback, folding in both approved riders):
- Hoist a `CLIP_UNLOAD_DELAY_MS = 30000` named constant (replaces the inline `30000`).
- Make the timer callback `async`.
- Re-check `this.enableClipFeatures` at fire time (skip the unload if CLIP was disabled during the grace window).
- `await window.electronAPI.unloadClipModel()`. The IPC returns `{ success: false, reason: 'loading' }` when a model load is in flight — **only set `this.clipWorkerReady = false` on a successful unload**; leave it true when the IPC reports `loading`.
- `.catch()` → `window.electronAPI.logError(...)`.
- Null `this.clipUnloadTimer` as today.

This single edit closes four BACKLOG items: reset-flag (2026-06-10), await+error-handle (2026-04-28), fire-time `enableClipFeatures` re-check (2026-04-28), `CLIP_UNLOAD_DELAY_MS` constant (2026-04-21).

**Test**: `extractAsyncMethod` (or a small extracted helper) — assert flag stays true when the IPC reports `loading`, flips false on success, and the unload is skipped when `enableClipFeatures` is false at fire time.

---

## Fix 6 — Local-capture pattern in `feature-cache-write-chunk` IPC handler

**Bug** (~75/100): the handler (`main.js:506-525`) reads module-level `featureCacheWriter` repeatedly across the `await ...once('drain')` (`:518`). If a concurrent `feature-cache-write-open` replaces the writer during the await, the handler operates on stale/destroyed state. The `feature-cache-write-close` handler (`:528`) already uses the documented local-capture pattern.

**Change**: at the top of the chunk handler, `const writer = featureCacheWriter; if (!writer) return { success: false, error: 'no open writer' };` then reference `writer.*` throughout — `writer.first` mutation, `writer.stream.write(...)`, and `writer.stream.once('drain', ...)`. This is the documented required pattern for long-running IPC handlers sharing module-level state (mirrors the CLIP IPC handlers).

**Test**: main-process IPC handlers are outside the unit harness. Verify via lint + a reasoned trace against the established close-handler pattern; note the manual verification in the PR.

---

## Fix 7 — JXL error-path hardening trio

Post-CW-5, `decodeJxl` resolves at **frame 0**, not full decode; the worker streams `meta → frame×N → done` (or `error` mid-stream). The three hardening fixes:

### 7a — `decodeJxl` per-request timeout
**Bug**: the frame-0 await (`media-viewer.js:1015`) has no timeout. If the worker never posts frame 0, `decodeJxl` hangs forever.

**Change**: mirror `loadMediaAsImageData`'s pattern (`media-viewer.js:8428`, 15s). In `decodeJxl`, start a 15s `setTimeout` that **rejects the frame-0 promise and deletes the `_jxlPending` entry** for this id. Clear the timer when `resolveFirst`/`rejectFirst` settle — store the timer handle on the pending record (cleared in `_rejectJxlPending` and on the first-frame resolve path) or wrap the resolve/reject passed into the pending record so they `clearTimeout` first. `entry.whenComplete` (the rest of the animation) stays **unbounded** — a stall there merely leaves frame 0 displayed static, which is benign (per the approved scope decision).

### 7b — worker `{type:'init'}` try/catch → structured `{type:'init-error'}`
**Bug**: the worker init branch (`jxl-decode-worker.js:16-21`) runs `ready = init(...); await ready;` un-try/caught. Bad wasm bytes throw an uncaught async rejection — the renderer waits for a `{type:'ready'}` that never comes (`_jxlReady` hangs).

**Change**:
- Worker: wrap the init branch in try/catch; on throw `self.postMessage({ type: 'init-error', message: String(...) })`.
- Renderer `_handleJxlWorkerMessage` (`media-viewer.js:933`): handle `m.type === 'init-error'` by calling `this._jxlRejectReady(new Error(m.message))` and nulling `_jxlRejectReady`/`_jxlResolveReady` (mirrors the existing worker-error path).

### 7c — whole-animation-undecodable bail toast
**Bug**: the `consecutiveFailures >= decoded.frames.length` bail in `drawNext` (`media-viewer.js:1127`) returns silently — the user sees a frozen frame 0 with no explanation.

**Change**: before that `return`, emit a one-time `this.showNotification('Could not play animation — showing first frame', 'warning')` (and/or `logError`). Guard against re-firing on subsequent navigation. (Also closes the standalone PR #42 BACKLOG XS for this toast.)

**Tests**:
- 7a: `decodeJxl` rejects after the timeout elapses (`vi.useFakeTimers()`); the `_jxlPending` entry is deleted.
- 7b: `_handleJxlWorkerMessage({type:'init-error', message})` rejects `_jxlReady`.
- 7c: extend the existing `startJxlAnimation` describe block to assert the toast fires on the whole-animation bail.

---

## Out of Scope (deliberate)

- No refactor of the duplicated `<2 files` fallback (`showCompareMedia` vs `_retryCompareAfterRemoval`) into a shared helper — two one-line guards, not a restructure.
- No `decodeJxl` `whenComplete` (full-decode) timeout — frame-0 timeout is sufficient; a `whenComplete` stall is benign.
- The JXL error-path **test backfill** for the `372ea10` hardening (`_retryCompareAfterRemoval`, `drawNext` counter, `ensureJxlWorker` teardown) is a separate BACKLOG/Friday pull-in item, not part of CW-1.

## Expected test delta

310 → ~318+ unit tests (≥1 new test per renderer fix; Fix 6 adds none — manual trace). Full E2E remains at its known state (42/43; the `#viewModeBtn` red is CW-2's job, not CW-1's).
