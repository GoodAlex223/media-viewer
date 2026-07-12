# Group G1 — AI-Sort Startup UX & Incremental Cache-Load: Design

**Date**: 2026-07-13
**Branch**: `feature/g1-ai-sort-startup-ux`
**Source**: 🔵 User-Flagged — WEEKLY.md Group G1 (Mon–Wed, 8 SP, 🏆). The PR3 slice of the 🔴 TODO "Speed up AI / similarity sorting on large folders (24k+ files)" plus the [2026-07-01] AI-sort-startup UX cluster + the 🟠 [2026-07-11] "Can't cancel the AI sort". Origin BACKLOG 🔵 [2026-07-01] (×4), 🟤 [2026-05-26], 🟠 TODO [2026-07-11].
**Status**: Approved (brainstorm) → ready for implementation plan.

---

## Problem

On the user's real 24 000-file folder, **Sort by Prediction** (the AI sort) is opaque and feels broken:

1. **~40s silent wait.** After clicking, `handleSortByPrediction()` awaits `loadFeatureCache()` — a streaming parse of `.feature_cache.json` — with **no progress UI at all**. The extraction bar (if any) only appears *after* the load completes. ([media-viewer.js:7523](../../../media-viewer.js#L7523))
2. **Re-extracts despite a valid cache.** The user reports feature extraction running even when the cache is present and valid — redundant CPU work.
3. **No feedback.** Unlike its sibling `handleSortBySimilarity()`, the AI path shows only transient toasts — no determinate progress card. ([media-viewer.js:7477](../../../media-viewer.js#L7477))
4. **Can't cancel.** The sort-progress card's Cancel calls `sortAbortController.abort()`, but the AI path never creates a `sortAbortController` and never checks a signal, so nothing stops.
5. **Post-tournament-exit path** shows the same long delay (same lazy-extraction + silent-load root).

### Why the good path works and the AI path doesn't

`handleSortBySimilarity()` ([media-viewer.js:5266](../../../media-viewer.js#L5266)) is the gold-standard lifecycle and the template for this work:

- creates `this.sortAbortController = new AbortController()` on entry (line 5316),
- renders the determinate `updateSortProgress({ phase, current, total })` card **immediately** and at every phase (lines 5344, 5450, 5514) — the card's Cancel button is already wired to `this.sortAbortController?.abort()` ([media-viewer.js:1234-1236](../../../media-viewer.js#L1234-L1236)),
- checks `this.sortAbortController.signal.aborted` throughout the hot loop (lines 5459, 5428) and throws to bail,
- cleans up in `finally` (nulls the controller, restores the button — lines 5565-5574).

`handleSortByPrediction()` does **none** of this. That asymmetry is the whole bug cluster.

### The cache-load cost (what the ~40s is made of)

`_loadFeatureCacheLocked()` ([media-viewer.js:6741](../../../media-viewer.js#L6741)):
- builds a **local** `freshFeatureCache` and assigns `this.featureCache` only at the very **end** (line 6797) — so nothing is served incrementally and no progress is emitted;
- pulls entries from the main process in 1000-entry chunks via `feature-cache-chunk` ([main.js:498](../../../main.js#L498)), where each vector crosses IPC as a **plain `Array<number>`** (64 + 512 numbers) that is structured-cloned element-by-element, then rebuilt renderer-side with `new Float32Array(entry.vector)` (line 6763);
- does an `await window.electronAPI.path.join(...)` **per entry** (line 6762) — ~24k awaits. (`path.join`/`basename` are *synchronous* in preload — [preload.js:77-80](../../../preload.js#L77-L80) — so this is microtask churn, not IPC, but it is still ~24k needless awaits in the hot loop.)

The main-process side already stream-parses the file (bounded memory — [main.js:439-443](../../../main.js#L439-L443)); the reducible cost is the **per-chunk clone + renderer rebuild** and the per-entry awaits, not the disk parse.

---

## Decisions (from brainstorming)

- **D1 — Aggressiveness: visible + cancelable + incremental, AND best-effort faster.** Make the load visible, cancelable, and incrementally-populating; *additionally* reduce the ~40s itself via a cheaper IPC transport. The **guaranteed** deliverable is the UX (visible/cancelable/incremental); the raw speedup is **best-effort, measured on the smoke**, not a hard gate. (Chosen over "UX-only, don't touch internals" and over a full binary-format migration.)
- **D2 — One unified progress card.** A single determinate card (bottom-right, the `updateSortProgress` card with Cancel) drives the whole operation; its phase label swaps `Loading cached features…` → `Extracting features (N/M)…` → `Sorting…`. The separate bottom-left extraction spinner (`#featureExtractionProgress`) is **suppressed while a prediction sort owns the operation**, so there is exactly one progress surface and one Cancel button. (Chosen over "sort card + keep the extraction spinner" = two surfaces at once.)
- **D3 — Cancel = stop everything.** Cancel aborts the cache-load loop, calls `cancelBackgroundExtraction()` (frees the CPU), and drops the pending ML sort. The list is left **unsorted** (order is never mutated until `sortComplete`, so there is nothing to restore). Already-extracted features remain cached for next time. (Chosen over "stop the sort but let extraction finish in the background".)
- **D4 — Mirror `handleSortBySimilarity`, don't invent a new lifecycle.** Reuse `sortAbortController`, `updateSortProgress`, and the `finally`-cleanup shape so the two sort paths stay structurally identical and reviewable side-by-side.
- **D5 — Diagnose the re-extract bug before fixing it.** Do not assume the WEEKLY's stated root cause (the "assigned only at end of load" hypothesis does **not** hold inside `handleSortByPrediction`, which fully awaits the load before the uncached check). Reproduce first on the real folder, then apply the minimal fix. Leading hypotheses: CLIP-vector absence (the line-7545 gate checks only 64-dim `featureCache`, while `startBackgroundFeatureExtraction`'s filter also re-runs when `!clipCache.has` — [media-viewer.js:8280-8286](../../../media-viewer.js#L8280-L8286)) and size/mtime staleness invalidation (line 6760).
- **D6 — No on-disk format change.** The feature cache stays JSON v4. A binary re-format on the user's real 24k folder carries data-loss risk for marginal gain; we optimize the *transport* over IPC, not the file. `FEATURE_CACHE_VERSION` is unchanged.

---

## Non-goals / scope guardrails

- **PR2 "hash computation off the renderer main thread"** and the **O(n·K) similarity neighbor-graph build** are OUT — they speed *hash/similarity* sorts, not the reported AI-sort pain. The 🔴 TODO "Speed up AI / similarity sorting" stays **OPEN** after this ships.
- **No on-disk feature-cache format migration** (D6). Streaming-parse memory ceiling preserved.
- **`handleSortBySimilarity`** is not restructured — it already has the pattern. (Its cache-load *does* call the shared `loadFeatureCache` via the CLIP path, so it inherits the incremental-populate + transport win for free, but its control flow is untouched.)
- No new settings UI. No change to the ML model / training path beyond what the sort lifecycle already calls.

---

## Architecture

### 1. `handleSortByPrediction()` — adopt the similarity lifecycle

Restructure the function to mirror `handleSortBySimilarity`:

- **Guard**: keep the tournament / ML-disabled / toggle-off-restore early returns. Add an `isPredictionSorting` re-entrancy guard (a second click while sorting is a no-op; the card's Cancel is the cancel affordance).
- **On entry**: `this.sortAbortController = new AbortController();` then `this.updateSortProgress({ phase: 'Preparing…' })` **before** any await, so the card is on screen instantly. Increment a new generation token `this.sortRunId` (mirrors `extractionRunId` at [media-viewer.js:8277](../../../media-viewer.js#L8277)); capture it locally.
- **Phase 1 — Loading cached features**: `await this.loadFeatureCache({ signal, onProgress })` (see §2). Card shows determinate `current/total`.
- **Abort check** → bail.
- **Phase 2 — Extracting features** (only if uncached remain): drive the **same** card with `phase: 'Extracting features…'`; suppress the bottom-left spinner (§3). Extraction already honors its own `backgroundExtractionAbort`; wire Cancel so `sortAbortController.abort()` also aborts extraction.
- **Abort check** → bail.
- **Phase 3 — Sorting**: `phase: 'Sorting…'`, post `getSortedOrder` to the ML worker.
- **`sortComplete` handler** ([media-viewer.js:6595](../../../media-viewer.js#L6595)): guard with the generation token — if `message.sortRunId !== this.sortRunId` (or the controller was aborted), **ignore** the result (a late/stale sort must not apply after Cancel). Pass the token through the worker round-trip, or compare against a stored "current run" field.
- **`finally`**: null `sortAbortController`, clear `isPredictionSorting`, clear the card, restore the button label. Mirror lines 5565-5574.

### 2. `loadFeatureCache` — incremental populate + signal + progress + faster transport

Add an options arg: `loadFeatureCache({ signal, onProgress } = {})`, threaded to `_loadFeatureCacheLocked`.

- **Incremental populate**: set entries into `this.featureCache` (and `this.clipCache`, already incremental) **per chunk**, not into a local map assigned at the end. After each chunk, call `onProgress(loaded, total)` and check `signal?.aborted` → stop.
- **Invalidation safety**: only **clear + adopt** the cache once the file is confirmed loadable and version-matched. A `notFound` / parse-fail / version-mismatch must **leave the existing in-memory cache untouched** rather than wiping a good Map mid-load. (Today the version-mismatch branch replaces with an empty Map — preserve that outcome, but do it as an explicit reset, not as a side effect of the incremental writes.)
- **Faster transport (best-effort)** — change `feature-cache-chunk` ([main.js:498](../../../main.js#L498)) to return vectors as **binary typed-array buffers** instead of `Array<number>`:
  - At `feature-cache-open` time, after the stream-parse, pack each chunk's `vector` / `clipVector` into contiguous `Float32Array`s alongside parallel `names[]` / `sizes[]` / `mtimes[]`. Structured-clone of a `Float32Array` over `invoke` is a compact buffer copy, not 576 per-element serializations.
  - Renderer takes `.subarray()` views straight into the caches — no `new Float32Array(entry.vector)` rebuild.
  - Keep the existing `Array<number>` response shape available as a fallback branch (older preload / open-failure path already falls through to a legacy read — [media-viewer.js:6811](../../../media-viewer.js#L6811)).
- **Drop per-entry `await path.join`**: compute the base path + separator once and string-concat `fullPath` inline (removes ~24k awaits).

### 3. Progress-surface unification (D2)

While a prediction sort owns the operation, the extraction phase must render into the **sort card**, not the separate `#featureExtractionProgress` element. Approach: give `startBackgroundFeatureExtraction` (or its progress callback) an optional "report to the sort card" mode, or have `handleSortByPrediction` pass a progress sink so extraction updates `updateSortProgress` and skips `showBackgroundExtractionProgress`. Independent (non-sort) background extraction keeps its own bottom-left spinner unchanged.

### 4. Post-tournament-exit path (item 6)

The tournament-exit → AI-sort path calls the **same** `handleSortByPrediction`, so it is fixed by construction. No separate code change; it is a **smoke-checklist item** (verify the determinate card appears immediately and Cancel works after exiting a tournament).

---

## Data flow (AI sort, after G1)

```
click Sort-by-Predicted
  └─ handleSortByPrediction()
       ├─ sortAbortController = new AbortController(); sortRunId++
       ├─ updateSortProgress({phase:'Preparing…'})          ← card visible immediately
       ├─ (lazy ML/CLIP init if first use)
       ├─ Phase 1  await loadFeatureCache({signal,onProgress})
       │     └─ per chunk: this.featureCache.set(...) + onProgress(n,total)  ← incremental + determinate
       │        feature-cache-chunk → Float32Array buffers (cheap clone)      ← faster transport
       ├─ [abort? → bail, unsorted]
       ├─ Phase 2  (uncached>0) startBackgroundFeatureExtraction → sort card  ← unified surface
       ├─ [abort? → cancelBackgroundExtraction(), bail, unsorted]
       ├─ Phase 3  updateSortProgress({phase:'Sorting…'}); mlWorker.postMessage(getSortedOrder)
       └─ finally: null controller, clear flag, clear card, restore button
  └─ sortComplete (async): if sortRunId stale/aborted → ignore; else apply order
```

---

## Testing & verification

**Unit (Vitest, `extractMethod`/`extractAsyncMethod` pattern):**
- Restructured `handleSortByPrediction`: renders the card before the first await; bails leaving order **unsorted** when the signal aborts at each phase boundary (Phase 1 / Phase 2 / before worker post); `finally` nulls the controller + clears the flag.
- `sortComplete` generation guard: a `sortComplete` with a stale `sortRunId` (or after abort) does **not** mutate `mediaFiles` / set `isSortedByPrediction`.
- `loadFeatureCache` incremental + signal: entries land in `this.featureCache` progressively; `onProgress` is called with increasing counts; `signal.aborted` stops the chunk loop; a `notFound`/version-mismatch open leaves the existing in-memory cache untouched (or resets exactly as today). Mock `featureCacheOpen/Chunk/Close`.
- Transport: `feature-cache-chunk` returns typed-array buffers that the renderer maps to the correct per-file vectors (round-trip a small fixture); legacy `Array<number>` fallback still works.

**E2E (Playwright):** the 24k / ~40s behavior is **not fixturable** (fixtures top out at a handful of files). A light smoke may assert the card appears for a tiny folder, but the real gate is manual.

**User-side 24k smoke (the real gate — same pattern as CW-T):** G1 checkboxes stay unchecked until, on the user's real 24 000+ folder:
1. the ~40s silent wait is **gone/visible** — a determinate card appears immediately on click;
2. valid cached data is **served** (no redundant re-extraction on a fully-cached folder — the re-extract bug is closed);
3. **Cancel** actually aborts (load + extraction stop, CPU frees, list stays unsorted);
4. the **post-tournament-exit → AI-sort** path behaves identically;
5. (bonus, reported not gated) measured load time vs. before.

**Gates:** `npm test` + `npm run lint` green before commit (pre-commit hook enforces unit tests). Any `preload.js` change (adding the options-arg surface is renderer-only, but the transport touches `main.js` IPC) gets a security-conscious review.

---

## Acceptance criteria

- [ ] `handleSortByPrediction` creates/owns a `sortAbortController`, renders `updateSortProgress` before its first await, and cleans up in `finally`.
- [ ] One unified determinate card shows `Loading cached features… → Extracting features (N/M)… → Sorting…`; the bottom-left extraction spinner is suppressed while the sort owns the operation.
- [ ] Cancel aborts the cache-load loop + background extraction + drops the pending sort; a stale/aborted `sortComplete` is ignored; the list is left unsorted.
- [ ] `loadFeatureCache` populates `this.featureCache` incrementally, accepts `{ signal, onProgress }`, and leaves a good in-memory cache untouched on a failed/notFound open.
- [ ] `feature-cache-chunk` transports vectors as binary typed-array buffers (with the legacy `Array<number>` fallback intact); per-entry `await path.join` removed.
- [ ] Re-extract-despite-cache bug: reproduced, root-caused, and fixed (or confirmed subsumed) — documented in the plan.
- [ ] Unit tests cover the abort-bail, generation guard, and incremental-load invariants; `npm test` + lint green.
- [ ] User-side 24k smoke passes all five checks above (the checkoff gate).
- [ ] 🔴 TODO "Speed up AI / similarity sorting" left OPEN (PR2 remains); scope guardrails honored.
