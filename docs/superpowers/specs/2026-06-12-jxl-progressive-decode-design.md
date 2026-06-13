# Progressive Animated-JXL Decode (Frame-0-First) — Design Spec

**Date**: 2026-06-12
**Status**: Approved
**Source**: WEEKLY.md Group CW-5 (🏆 🔵, 5 SP) ← BACKLOG 🔵 [2026-06-07] Group A manual-testing intake
**Branch**: `feature/jxl-progressive-decode`

## Problem

A 270-frame, 27 MB animated `.gif.jxl` decodes **all** frames (~77 MB of PNG bytes) inside
`jxl-decode-worker.js` before the single `{type:'decoded'}` message is posted. `decodeJxl()`
therefore resolves only after the entire animation is encoded — several seconds of loading
spinner before anything renders. Every consumer blocks on the full decode even though only
`startJxlAnimation` needs more than frame 0:

| Consumer | Needs |
|---|---|
| `showMedia` static branch | `frames[0]` |
| `showMedia` animated branch → `startJxlAnimation` | all frames |
| `showCompareMedia` left + right | `frames[0]` |
| 3 feature-extraction sites (~L5543, ~L7299, ~L8387) + CLIP buffer site (~L8061) | `frames[0]` |

## Decisions (user-approved)

1. **Approach A — streaming protocol + mutable cache entry with completion promise**
   (over B: two-phase decode API; C: chunked batches).
2. **Mid-stream error policy: static frame-0 fallback.** If the worker errors after frame 0
   was delivered, keep frame 0 displayed as a static image, never start the animation,
   `logError` it. No toast spam, no file removal.
3. **Animation starts only once fully buffered** (per the WEEKLY item) — no
   play-during-decode in this iteration.

## 1. Worker protocol (`jxl-decode-worker.js`)

Inbound unchanged: `{type:'init', wasmBytes}` (once), `{type:'decode', id, buffer}`.

Outbound per decode request becomes a stream:

```
{ type: 'meta',  id, width, height, animated, numLoops, frameCount }   // right after tryInit()
{ type: 'frame', id, index, pngBytes, duration }                       // one per frame, transferable [pngBytes.buffer]
...
{ type: 'done',  id }                                                  // after loop + img.free()
{ type: 'error', id, message }                                         // unchanged shape; may now arrive mid-stream
```

`{type:'ready'}` (init ack) is unchanged.

Worker flow: `feedBytes` → `tryInit` → post `meta` → for each frame: `render(i)`, read
`r.duration` **before** `encodeToPng()` (terminal call, unchanged spike constraint), post
`frame` with the PNG buffer transferred → `img.free()` → post `done`. An exception anywhere
posts `error` (renderer keeps whatever frames already arrived).

## 2. Renderer: `decodeJxl` + `_jxlPending` (`media-viewer.js`)

`_jxlPending` entry shape changes from `{resolve, reject}` to:

```js
{ entry, resolveFirst, rejectFirst, resolveComplete, rejectComplete }
```

Cache **entry** shape (mutable; `frames` grows in place):

```js
{ frames: [],            // [{pngBytes, duration}] — appended as 'frame' messages arrive
  width, height, animated, numLoops,
  frameCount,            // total, known from 'meta' (use this for animated gating, NOT frames.length)
  complete: false,       // true once 'done' received
  whenComplete: Promise } // resolves(entry) on 'done'; rejects on mid-stream error / worker crash
```

Message routing in `ensureJxlWorker`'s `message` listener (by `m.type`, looked up via `m.id`):

- `meta` → construct the entry (+ its `whenComplete` promise), stash on the pending record.
- first `frame` → push; insert entry into `jxlFrameCache` (existing LRU move-to-end +
  `JXL_CACHE_MAX = 8` eviction unchanged); **resolve `decodeJxl`** with the entry.
- subsequent `frame` → push into `entry.frames`.
- `done` → `entry.complete = true`; `resolveComplete(entry)`; delete pending.
- `error` with no frame 0 yet → `rejectFirst` (existing caller catch paths — toast + skip in
  `showMedia`, purge + retry in compare, reject in extraction — all untouched).
- `error` after frame 0 → `rejectComplete`; **keep** the cached partial entry (decode is
  deterministic; a corrupt file would fail identically on re-visit — frame 0 stays usable).
- Worker `error` event (crash): extend the existing drain — for every pending id, reject
  both `rejectFirst` and `rejectComplete`, then clear + teardown as today.

Notes:
- Mid-flight LRU eviction is harmless: frames keep appending into an object no longer in the
  cache; it GCs when in-flight consumers release it.
- Concurrent `decodeJxl(samePath)` dedupes via the cache once frame 0 landed. (A second call
  in the sub-second window before frame 0 issues a duplicate worker request — accepted;
  matches current behavior.)
- `whenComplete` rejections must not surface as unhandled rejections for frame-0-only
  consumers: attach a no-op `.catch(() => {})` guard at entry construction, while real
  consumers (`startJxlAnimation`) attach their own handlers.

## 3. `startJxlAnimation` (frame-0-first display)

The method keeps its fire-and-forget shape (today's `drawNext()` is already not awaited) and
**returns after canvas setup** so `showMedia` can append + `finishJxlCanvasDisplay`
immediately — spinner and `isLoading` clear at frame-0 time, not full-buffer time.

1. Create canvas, `className`/`width`/`height`, `this.currentMedia = canvas`, anim token —
   unchanged.
2. Draw frame 0 immediately (`createImageBitmap` → `drawImage`, token-checked after the
   await, `bmp.close()`).
3. `entry.whenComplete.then(...)`: if token still current → `computeJxlFrameSchedule(entry.frames)`
   (moves below the await — schedule needs the full array) → run the existing `drawNext`
   loop from index 0 (re-drawing frame 0 is a visual no-op — identical pixels — and keeps
   the loop logic byte-for-byte unchanged: `numLoops`, consecutive-failure bail,
   identity-token teardown).
   `.catch(err)`: `logError('JXL streaming decode failed mid-animation: ...')`; return —
   frame 0 stays on the canvas (approved static fallback).
4. `stopJxlAnimation()` / `cleanupCurrentMedia()` ordering unchanged — token invalidation
   already covers the new pre-loop await points.

`showMedia` animated gate changes from `decoded.animated && decoded.frames.length > 1` to
`decoded.animated && decoded.frameCount > 1` (at resolve time `frames.length === 1`).
The `!decoded.frames || decoded.frames.length === 0` no-frames guard still holds (resolve
implies frame 0 present).

## 4. Untouched call sites

`showCompareMedia` (both sides), the 3 hand-crafted-extraction sites, and the CLIP
`extractClipEmbeddingFromBuffer` site all read `decoded.frames[0]` — zero changes, and each
now resolves at frame-0 time (faster for free). Static JXL: `meta` + 1 `frame` + `done`;
`whenComplete` resolves near-instantly; behavior identical to today.

## 5. Error handling summary

| Failure | Behavior |
|---|---|
| Error before frame 0 | `decodeJxl` rejects → existing per-call-site handling (unchanged) |
| Error after frame 0 (mid-stream) | `whenComplete` rejects → animation never starts, frame 0 static, `logError`; partial entry stays cached |
| Worker crash (`error` event) | Drain rejects both promises per pending id; teardown + lazy re-create unchanged |
| Whole animation undecodable at draw time | Existing `consecutiveFailures >= frames.length` bail in `drawNext` (unchanged) |

## 6. Testing

- **Update** the 4 existing `decodeJxl` tests in `tests/media-viewer-utils.test.js` — mock
  worker must speak the new `meta`/`frame`/`done` protocol (cache-hit unchanged; happy path,
  error path, and LRU eviction get the new mock).
- **New unit tests** (target: 297 → ~302+):
  1. Early resolve: `decodeJxl` resolves after `meta` + first `frame` with
     `frames.length === 1` and `frameCount === N > 1`, before `done`.
  2. Accumulation: subsequent `frame` messages grow `entry.frames`; `done` sets
     `complete: true` and resolves `whenComplete` with all frames.
  3. Mid-stream error: `whenComplete` rejects; cached entry survives with partial frames;
     `decodeJxl`'s own promise (already resolved) unaffected.
  4. Pre-frame-0 error: `decodeJxl` rejects (protocol-updated existing test).
  5. Worker-crash drain rejects both promise layers (extend existing pattern if feasible
     via the mock listener map).
- **E2E**: existing `tests/e2e/jxl-rendering.test.js` static smoke must stay green — it
  exercises the full new protocol end-to-end under Electron. No animated fixture added
  (repo-size cost; streaming logic is unit-covered).
- **CLAUDE.md**: update `jxl-decode-worker.js` protocol description + `decodeJxl`/
  `jxlFrameCache` entry-shape notes after implementation.

## 7. Out of scope

- Per-request decode timeout — CW-1 "JXL error-path hardening trio" owns it (keep the two
  changes conflict-aware if CW-1 lands first; both touch `_jxlPending` handling).
- Play-during-decode (start animating while frames stream in).
- Compare-mode animation (compare stays frame-0 static by design).
