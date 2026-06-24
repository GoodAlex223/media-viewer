# Group P2 — Tournament Large-Folder Performance: Design

**Date**: 2026-06-24
**Branch**: `feature/tournament-large-folder-perf`
**Source**: 🔵 User-Flagged — WEEKLY.md Group P2 (Tue–Wed, 8 SP); closes the canonical BACKLOG 🔵 [2026-06-18] "Speed up tournament-mode pair changing" entry plus the three 🔴 IMPORTANT TODO items (launch/resume, rating pick→next, Save & leave).
**Status**: Approved (brainstorm) → ready for implementation plan.

---

## Problem

Tournament mode is unusably slow on large (24 000+ file) folders, while compare mode stays fast. Four root causes, all in the tournament engine / manager / IPC-persistence path:

1. **Per-pick full-state snapshot in history.** Every `recordResult` / `recordDraw`
   ([tournament-engine.js:292-327](../../../tournament-engine.js#L292-L327)) stores a complete
   `strategy.serialize()` snapshot (`winCounts` of *n*, `files` of *n*, `playedPairs`, `roundQueue`)
   **plus** `filesSnapshot: [...this.files]`. After *g* games, `history` holds *g* full O(*n*)
   snapshots → **O(n·g) memory**.

2. **The disk write re-serializes all of that, synchronously, on every pick, and blocks the next
   pair.** `_persistState` → `engine.serialize()` (which does `history.map(e => ({...e}))`, re-copying
   every snapshot) → IPC → `JSON.stringify(state, null, 2)` → `fs.writeFile`. The cost **grows** as the
   tournament progresses (by game 1000 it writes 1000 snapshots of all 24k files), and
   `handleTournamentPick` `await`s it before rendering the next pair
   ([tournament.js:120-124](../../../tournament.js#L120-L124),
   [media-viewer.js:4457-4461](../../../media-viewer.js#L4457-L4461)). Compare mode does none of this.

3. **`_buildRoundPairings` is O(n²)** even in round 1: the `bucket.splice()` per pair is O(*n*),
   done *n/2* times over a single giant bucket
   ([tournament-engine.js:93-116](../../../tournament-engine.js#L93-L116)). Runs at init and at every
   round boundary.

4. **Dual O(*n*) `findIndex`** per pair display maps `pair.left`/`pair.right` paths → `mediaFiles`
   indices on every pick ([media-viewer.js:4416-4417](../../../media-viewer.js#L4416-L4417)).

## Decisions (from brainstorming)

- **D1 — Undo is session-only.** In-memory undo history is no longer persisted to disk. After
  *Save & leave* → resume, picks made before the save are not undoable. This is what lets the
  on-disk payload drop from O(*picks × files*) to O(*files*) — the core fix.
- **D2 — In-memory undo is capped at the last 100 picks.** Keep the existing snapshot-based undo
  (low risk, well-tested) but retain only the most recent `UNDO_HISTORY_CAP = 100` history entries,
  bounding RAM to ~100 × O(*n*) regardless of session length. Undo past 100 picks back is a no-op.
- **D3 — Persistence mechanism is trailing-edge debounce + single-flight write** (latest-wins),
  chosen over per-pick fire-and-forget (which races on out-of-order write completion).

## Non-goals / scope guardrails

- No change to Swiss pairing **quality**, tier assignment, the apply/move logic, or the
  resume / continue / leave **UX flows** — purely *how* state is stored and *how fast* pairs resolve.
- Window-close (Alt+F4 / "X") flush belongs to **Group T1** (Friday). Within this PR a hard
  window-close can lose `< DEBOUNCE_MS` of picks; documented, not fixed here.
- No delta-based undo rewrite (explicitly opted away from in D1/D2).

---

## Changes (7, across 4 files)

### 1. Slim, versioned persisted payload — `tournament-engine.js`

- `TournamentEngine.serialize()`: **omit `history`** from the output; bump `version: 2`; add a
  top-level `gamesPlayed: this.strategy.getProgress().gamesPlayed` so the resume prompt can still
  show progress without parsing `strategyState`. Keep `files`, `options`, `createdAt`,
  `lastUpdatedAt`, `strategyState` (which already carries `winCounts` / `playedPairs` / `byes` /
  `currentRound` / `roundQueue` / `gamesPlayed`).
- `TournamentEngine.deserialize(json, files)`: accept **`version === 1` OR `version === 2`**
  (old saved tournaments still resume — v1 files carry all the O(*n*) state needed); always set
  `eng.history = []` (session-only undo; any v1 `history` is ignored).
- `showTournamentContinuePrompt` ([media-viewer.js:4206](../../../media-viewer.js#L4206)):
  replace `const progress = state.history.length` with
  `const progress = state.gamesPlayed ?? state.strategyState?.gamesPlayed ?? 0`.

**Result:** per-write payload is O(*n*) **constant**; launch/resume read+parse drops from
O(*n·g*) to O(*n*).

### 2. Cap in-memory undo history — `tournament-engine.js`

After each `this.history.push(...)` in `recordResult` and `recordDraw`:
`if (this.history.length > UNDO_HISTORY_CAP) this.history.shift();`
(`UNDO_HISTORY_CAP = 100`, module constant). The snapshot mechanism is otherwise unchanged, so
`undo()` keeps working as-is; once `history` empties, `undo()` is the existing no-op.

### 3. Debounced single-flight persistence — `tournament.js`

`TournamentManager` gains private persistence state + three methods:

```
// state: _persistTimer, _persistPending, _persistFolder, _writeInFlight
// const DEBOUNCE_MS = 500

_schedulePersist(folderPath)   // mark pending + folder; start timer if none running
async flush()                  // force-write the current engine state now and await it; clears any
                               //   pending timer. No-op only if there is no engine.
cancelPending()                // clear timer + pending flag; do NOT write
```

`flush()` is unconditional (it always writes the live engine state when an engine exists), so
`handleStartClick` can call `await this.flush()` directly to establish the file. `_schedulePersist`
is for the non-blocking pick path; `flush()` is for the must-be-durable-now exit/start paths.

`_schedulePersist` sets `_persistPending = true`, records `_persistFolder`, and starts a single
`setTimeout(DEBOUNCE_MS)` if one isn't already pending. The timer callback (and `flush()`) run the
actual write through a single-flight guard: if `_writeInFlight`, leave `_persistPending` set and
re-arm on completion; otherwise serialize the **current** engine state and `await` the IPC write,
then if another pick arrived mid-write, re-schedule. This coalesces bursts into one write of the
latest state and guarantees no overlapping writes (latest-wins, no ordering race).

Call-site changes (all in `tournament.js` unless noted):
- `handlePairResult` / `handlePairDraw`: mutate engine → `this._schedulePersist(folder)` →
  **return without awaiting**. `handleTournamentPick` / `handleTournamentDraw` then render the next
  pair immediately.
- `handleStartClick`: create engine → `await this.flush()` once (establish the file immediately).
- `handleResumeReconciled` and the in-`showTournamentPair` `removeFile` branch
  ([media-viewer.js:4422-4424](../../../media-viewer.js#L4422-L4424)): `_schedulePersist` (was
  `await _persistState`).
- `handleDiscard`: `this.cancelPending()` **before** deleting the state file + nulling the engine
  (so a queued write can't recreate the file after delete).
- `handleApply`: `this.cancelPending()` before apply + `engine = null` (state is now irrelevant).
- **Save & leave** ([media-viewer.js:4173-4180](../../../media-viewer.js#L4173-L4180)):
  `await this.tournament.flush()` then `engine = null` — reuses the already-persisted state instead
  of a fresh full re-serialize. **This is the entire "Save & leave" speedup (item 3).**

`_persistState(folderPath)` is retained as the low-level write used by `flush()`; external callers
move to `_schedulePersist` / `flush`.

### 4. O(*n*) `_buildRoundPairings` — `tournament-engine.js`

Replace the per-pair `bucket.splice()` (O(*n*) removal) with **consumed-markers + a forward
pointer** within each win-count bucket, so round 1 (one giant bucket) is O(*n*) instead of O(*n²*).
Preserve exactly: the un-played-pair preference (scan forward for the first un-consumed partner
that forms a pair not in `playedPairs`, else take the next un-consumed), the cross-bucket carry-over
of an unmatched file, and the leftover/bye logic (including the "don't double-bye" swap at
[tournament-engine.js:118-128](../../../tournament-engine.js#L118-L128)). No memoization — the build
runs once per round and resume restores `roundQueue` from disk.

> Note on the worst case: the un-played-partner scan is still O(*bucket²*) in late rounds where many
> pairs have already been played, but those buckets are small (files split by win count) and that
> path is rare. Round 1 — the actual 24k-file bottleneck — becomes linear.

### 5. Prebuilt path→index Map — `media-viewer.js`

Add a lazily-cached `Map<path, index>` over `mediaFiles`:
- Built on first use; cache the source array reference and size alongside it.
- Rebuilt when stale — `cachedRef !== this.mediaFiles` (sorts reassign the array) **or**
  `map.size !== this.mediaFiles.length` (in-place splices change length).
- Explicitly invalidated (set to `null`) in `removeFileFromList` (the centralized cleanup) for
  safety.

`showTournamentPair` uses two O(1) lookups instead of the dual `findIndex`. Helper, e.g.
`getMediaIndex(path)` / `_ensurePathIndexMap()`. Lookup miss still yields the existing
"file missing → removeFile" path.

### 6. Atomic state write — `main.js`

`writeTournamentState` ([main.js:238-247](../../../main.js#L238-L247)): write to
`<path>.tmp` then `fs.rename` over `.tournament_state.json`, so a crash mid-write can't corrupt a
resumable tournament (matches the feature-cache atomic-write pattern). On error, best-effort unlink
the temp file.

### 7. Tests

**Engine unit (`tests/tournament-engine.test.js`):**
- `serialize()` output is `version: 2`, has no `history` key, and exposes `gamesPlayed`.
- `deserialize` of a **v1** payload (with `history`) and a **v2** payload (without) both restore
  strategy state and yield `engine.history === []`.
- Undo cap: record 101 results → `history.length === 100`; undo 100 times succeeds and reverses
  state correctly; the 101st undo is a no-op (does not throw, leaves state at the oldest retained).
- `_buildRoundPairings` correctness preserved at large *N* (e.g. N = 2000–5000): every file appears
  in exactly one pair or the bye; odd *N* awards exactly one bye; round 1 produces no rematches
  (trivially true) and the function returns `floor(N/2)` pairs.
- Existing snapshot/undo/serialize tests updated for the v2 shape (the count-based assertions at
  [tests/tournament-engine.test.js:70,176,203](../../../tests/tournament-engine.test.js#L70)).

**Manager unit (`tests/tournament-manager.test.js`):**
- Multiple `_schedulePersist` calls within `DEBOUNCE_MS` produce exactly **one** `writeTournamentState`
  (use fake timers).
- `flush()` writes immediately and the returned promise awaits the IPC write.
- `cancelPending()` after a schedule prevents any write (discard path: delete is not followed by a
  resurrecting write).
- Single-flight: a schedule arriving during an in-flight write results in a second write of the
  later state, never two concurrent writes.

**E2E (`tests/e2e/tournament-mode.test.js`):** existing flows stay green — pick→Apply tier moves,
Both Win / Both Lose draws, Ctrl+A undo, leave-Save → Continue-resume. No new E2E required (synthetic
fixtures can't represent 24k); large-folder verification is manual.

**Manual (parallel, user-side):** 24k-folder smoke — launch, a run of picks (pick→next must feel
instant and not slow down as games accumulate), Save & leave, resume, Apply. This is the real
acceptance gate.

---

## Acceptance criteria

- Pick → next-pair render time is **independent of games played** (no growth across a session).
- Launch and resume on 24k files complete without a multi-second freeze (O(*n*), not O(*n·g*) or
  O(*n²*)).
- `.tournament_state.json` size is O(*n*) and does not grow with games played.
- *Save & leave* is near-instant (one coalesced write, no fresh full re-serialize).
- In-memory RAM during a long session is bounded (~100 × O(*n*) for undo history).
- Old (v1) saved tournaments still resume.
- All existing unit + E2E tests pass (adjusted for the v2 payload shape); new unit tests above pass.

## Risks

- **Pairing rewrite (Change 4)** is the highest-risk piece — it must preserve byes/carry-over/
  rematch-avoidance exactly. Mitigation: characterize current behavior with tests first, keep the
  outer bucket/carry-over structure, change only the removal mechanism.
- **Debounce correctness on exit paths** — a missed flush/cancel could lose or resurrect state.
  Mitigation: explicit `flush()` on Save & leave + start; explicit `cancelPending()` on discard +
  apply; manager unit tests cover all four.
- **Path→index Map staleness** — a missed invalidation would mis-map a pair. Mitigation: dual
  staleness check (reference + size) plus explicit invalidation in the one centralized mutation
  point; the existing missing-file fallback catches a bad lookup safely.
