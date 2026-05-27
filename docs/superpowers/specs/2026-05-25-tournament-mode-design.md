# Tournament Mode — Design

**Date**: 2026-05-25
**Status**: Complete (Swiss-only v1 shipped; RoundRobin/Bracket remain future strategies)
**WEEKLY.md rows**: Thursday, May 14 (Group E — Spec, 3 SP) + Friday, May 15 (Group F — Prototype, 5 SP)
**Total**: ~8 SP (3 SP spec + 5 SP Swiss-only prototype)
**Origin**: TODO.md entry — "Tournament-style compare mode (winner advances, loser tagged with win count)", flagged !COOL during 2026-05-05 manual testing

---

## 1. Goals & Scope

### Goal

Add **Tournament Mode** — a third media-viewing mode (alongside Single and Compare) that ranks every file in the current folder by pairwise judgment and moves files into win-count tier folders on disk.

### Motivating use case

The user wants to bucket a whole folder by quality via repeated head-to-head comparisons. Output is folder placement: `<source-dir>/_Tier-0/` (lost every game) through `<source-dir>/_Tier-R/` (won every game). The mechanism is **orthogonal to existing like/dislike** — tournament results land in their own tier folders, not in the user-configured like/dislike/special destinations.

### In scope (this spec)

1. **Engine architecture** with a pluggable `PairingStrategy` interface — designed to support three variants (Swiss / Round-Robin / Bracket).
2. **`SwissStrategy` implementation only** — the prototype builds Swiss; RR and Bracket are documented in the spec for future implementation.
3. **UI**: 3-way mode selector (Single/Compare/Tournament), config modal, pair display with progress header, summary modal, resume/invalidation prompts.
4. **Persistence**: auto-saved `.tournament_state.json` after every game; strict resume validation against current folder contents.
5. **Apply commit**: single batch IPC moves files into `_Tier-{0..R}/` subfolders of the source directory.
6. **In-session file removal** via Special-L / Special-R (file leaves tournament, partner re-paired or bye'd).
7. **Undo** within current session (snapshot-based; not persisted across resumes).
8. **Tests**: ~26 unit + ~4 integration + ~7 E2E (E2E "fit-as-time-allows" for prototype day).

### Out of scope (documented future work)

- **`RoundRobinStrategy` and `BracketStrategy` implementations** — spec'd in §3.4, not built. Each lands as a single-file addition to the engine, no other code touched.
- **Loose resume validation** — purging played-but-removed files, auto-pairing newly-added files. v1 is strict (any file delta invalidates).
- **Custom tier-folder names or destinations** — v1 hardcodes `<source>/_Tier-N/`.
- **Tier preview** in the summary modal (showing one representative file per tier).
- **Tie-breaking refinement** (Buchholz / head-to-head) — v1 accepts ties on win count.
- **Export ranked list** as JSON / CSV.
- **Cross-folder tournaments**.
- **Migration logic for state files from future versions**.

---

## 2. Decisions Locked During Brainstorm

| Question | Decision | Rationale |
|----------|----------|-----------|
| Primary outcome | Sort everything into win-count tiers → folder placement on disk | User picked B in brainstorm Q1; rules out top-K filter, rating workflow, and metadata-only modes |
| Pairing algorithm | Swiss-style (RR + Bracket spec'd, not built) | Balanced tier population; every file plays equal rounds; fits "rank everything" goal better than King-of-the-Hill (most files collapse to Tier-0) |
| Scope this PR | Spec all 3 variants; build Swiss only | Fits 8 SP budget; engine designed for cheap future additions |
| Persistence model | Separate tier folders inside source dir: `<source>/_Tier-N/` | Self-contained per-session output; underscore prefix sorts to top; orthogonal to user-configured like/dislike |
| Number of rounds R | User picks per session from `{3, 4, 5}` | Live game-count/time estimate updates with R; sensible default of 3 |
| Pair-display UI | New simplified overlay with progress header, click-to-pick, button row (Undo / L-Special / R-Special) | Progress visibility is the killer feature for Swiss sessions; small new component reusing existing compare-mode media wrappers |
| Mode toggle | 3-way segmented control or `<select>` (replaces current binary toggle) | Cleaner than cycling through 3 modes with one button |
| Resume validation | Strict — any file delta invalidates and prompts | Simple contract ("don't edit folder mid-tournament"); avoids subtle re-pairing bugs |
| Undo persistence | Per-session only; not preserved across resumes | Snapshot semantics simple; consistent with existing compare-mode undo |
| Skip button | Dropped from v1 | Users with indecision pick arbitrarily (Swiss is statistical) or Undo; removed edge case |

---

## 3. Architecture

### 3.1 Two-layer split

- **`TournamentEngine`** — owns shared state across all strategies: file list, history, persistence, undo, progress reporting.
- **`PairingStrategy`** — interface; one implementation per algorithm. Engine swaps strategies via constructor argument.

```
┌─────────────────────────────────────────────────────────┐
│  TournamentManager  (tournament.js, ES module)          │
│  - Config modal, pair display, summary modal             │
│  - Resume prompt, invalidation prompt                    │
│  - IPC glue (read/write/delete state, apply results)     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  TournamentEngine  (tournament-engine.js, CJS)          │
│  - files[], history[], serialize/deserialize             │
│  - undo (snapshot-based)                                 │
│  - delegates pairing decisions to strategy               │
└──────────────────┬──────────────────────────────────────┘
                   │ strategy:
                   ▼
┌─────────────────────────────────────────────────────────┐
│  PairingStrategy interface                              │
│  ┌────────────────┐ ┌──────────────────┐ ┌────────────┐ │
│  │ SwissStrategy  │ │ RoundRobinStrat. │ │ BracketStr.│ │
│  │ (built v1)     │ │ (spec only)      │ │ (spec only)│ │
│  └────────────────┘ └──────────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 3.2 `TournamentEngine` API

```js
class TournamentEngine {
  constructor(files, strategy, options = {});

  getCurrentPair();              // → { left, right } | null
  recordResult(winnerPath, loserPath);   // delegates to strategy + appends history
  removeFile(filePath);          // in-session removal (Special); delegates to strategy
  undo();                        // pops history, restores strategy snapshot
  isComplete();                  // → boolean
  getTier(filePath);             // → integer 0..R (valid after isComplete)
  getTierBreakdown();            // → { 0: count, 1: count, ... R: count }
  getProgress();                 // → { round, totalRounds, gameInRound, gamesInRound, gamesPlayed, gamesTotal }
  serialize();                   // → JSON-safe object for .tournament_state.json
  static deserialize(json, files);   // → TournamentEngine
}
```

Internal state:
- `files: string[]` — paths of all participants
- `history: Array<{ winner, loser, round, gameIndex, timestamp, strategyStateSnapshot }>` — append-only
- `strategy: PairingStrategy` — owns the pairing math

### 3.3 `PairingStrategy` interface

```js
{
  init(files, options),
  getNextPair() → [fileA, fileB] | null,
  recordResult(winner, loser),
  removeFile(file),                  // for in-session Special removal
  isComplete() → boolean,
  getTier(file) → integer,
  getProgress() → { round, totalRounds, gameInRound, gamesInRound, gamesPlayed, gamesTotal },
  serialize() → object,
  static deserialize(json) → PairingStrategy,
}
```

### 3.4 Three implementations

#### `SwissStrategy` — **built in v1**

- **Options**: `{ rounds: 3 | 4 | 5 }`
- **State**: `{ winCounts: Map<path,int>, playedPairs: Set<"a|b">, byes: Set<path>, currentRound: int, roundQueue: Array<[a,b]> }`
- **Per-round pairing**: group files by current win count → shuffle within group → pair adjacent. If odd N, lowest-rank file in lowest-population group gets a **bye** (free win; each file can bye at most once across the whole tournament).
- **Repeat handling**: if a same-bucket pair was already played, the unmatched file pairs with the highest-win-count file from the next-lowest bucket that hasn't been played against. If every viable opponent has been played, the last resort is allowing a repeat (preferring the pair with the longest time since its prior play).
- **Tier**: final win count, range `[0, R]`. Ties accepted (multiple files share a tier).
- **Game count**: `≈ N×R/2` games (slight reduction for byes when N odd).

#### `RoundRobinStrategy` — **spec only**

- **Options**: none.
- **State**: `{ winCounts, playedPairs, queue: Array<[a,b]> }`.
- **Pairing**: enumerate all `N×(N−1)/2` unique pairs at init, shuffle for variety, dispatch in order.
- **Tier**: win count, range `[0, N−1]`.
- **Pause/resume**: critical for large N — same persistence shape as Swiss.
- **Not implemented in v1** — pause/resume needs and per-game UI cost don't justify the added scope.

#### `BracketStrategy` — **spec only**

- **Options**: `{ seeding: 'random' | 'alphabetical' }`.
- **State**: `{ bracket: tree, currentRoundLosers, currentRoundWinners, currentRoundIndex }`.
- **Pairing**: single-elimination bracket. Non-power-of-2 N → top seeds get round-1 byes.
- **Tier**: `roundLostIn` (round-1 loser = Tier-0, ..., final winner = Tier-`log₂(N)`).
- **Not implemented in v1** — user already does this workflow manually with folder switching; lowest urgency.

### 3.5 File layout

| File | Status | Purpose |
|------|--------|---------|
| `tournament-engine.js` | **NEW** | `TournamentEngine` + `SwissStrategy` (pure ES module — imported by both `tournament.js` and Vitest tests; unlike `sorting-worker.js`, this file is not loaded as a Web Worker so ESM is the simpler choice) |
| `tournament.js` | **NEW** | `TournamentManager` ES module (v2.0 pattern, mirrors `fullscreen.js`). Owns config/summary modals, pair-display rendering, state IPC glue, resume prompt. Receives MediaViewer deps via constructor. |
| `main.js` | MODIFIED | 4 new IPC handlers: `readTournamentState`, `writeTournamentState`, `deleteTournamentState`, `applyTournamentResults` |
| `preload.js` | MODIFIED | Expose 4 new IPC bindings on `window.electronAPI` |
| `media-viewer.js` | MODIFIED (~80 LoC) | 3-way mode selector wiring, instantiate `TournamentManager`, resume-prompt on `loadFolder` |
| `index.html` | MODIFIED | Replace binary `#viewModeBtn` with 3-way control; add modal/overlay containers |
| `styles.css` | MODIFIED | Tournament UI styles (progress header strip, tier breakdown chips, modal layout) |

---

## 4. Data Model & Persistence

### 4.1 Tier folder layout (on Apply)

```
<source-dir>/
├── (source files — gone after Apply, moved to tier subfolders)
├── _Tier-0/   (lost every game)
├── _Tier-1/
├── _Tier-2/
└── _Tier-3/   (R=3 → 4 tier folders; empty tiers not created on disk)
```

- Underscore prefix sorts tier folders to top of directory listing.
- If a tier folder already exists from a previous tournament, files are **merged in** (collision-rename pattern from existing `moveFile`: append `(1)`, `(2)`).

### 4.2 State file (`.tournament_state.json` in source dir)

Written after every game.

```json
{
  "version": 1,
  "strategy": "swiss",
  "options": { "rounds": 3 },
  "files": ["/abs/path/a.jpg", "/abs/path/b.jpg", "..."],
  "createdAt": 1716659999,
  "lastUpdatedAt": 1716660042,
  "history": [
    {
      "winner": "/abs/path/a.jpg",
      "loser": "/abs/path/b.jpg",
      "round": 1,
      "gameIndex": 0,
      "timestamp": 1716660001,
      "strategyStateSnapshot": { /* serialized strategy state BEFORE this result */ }
    }
  ],
  "strategyState": { /* current strategy state (after last result) */ }
}
```

### 4.3 Resume validation (strict, v1)

On `loadFolder()`, if `.tournament_state.json` exists:

1. Read state. If JSON parse fails or `version` is unknown → invalidation prompt with reason "state file unreadable" or "incompatible version".
2. List current folder media files. Compare to `state.files`.
3. **If identical** → Resume prompt: "Resume in-progress tournament? Round X of Y · N/M games. [Resume] [Discard]"
4. **If different** → Invalidation prompt: "Tournament state out of sync — K files removed, J added. [Keep state] [Discard and start fresh]"
   - Keep state: state file left untouched; user exits to Single mode and may manually restore files.
   - Discard: state file deleted; tournament can be started fresh.

### 4.4 Undo

- `recordResult` snapshots strategy via `serialize()` *before* mutating, pushes onto `history`.
- `undo()` pops the last entry, calls `strategy.deserialize(entry.strategyStateSnapshot)`.
- Memory: ~few KB per snapshot × ~N×R games ≈ ~1 MB for N=100, R=3. Cleared on Apply/Discard.
- **Per-session only**: closing tournament clears history; resume loads from state file as a fresh-history start (the in-flight pair is restored, but earlier games cannot be undone after resume).

### 4.5 Apply commit (`applyTournamentResults` IPC)

```js
// renderer → main
applyTournamentResults(folderPath, {
  "/abs/path/a.jpg": 3,   // → moves to <folderPath>/_Tier-3/a.jpg
  "/abs/path/b.jpg": 0,
}) → { success: true, moved: 87, failed: [{ path, error }, ...] }
```

Main process:
1. Compute set of needed tier folders from values in the assignments map.
2. `mkdir -p` each non-empty tier folder.
3. Per-file `fs.rename` (cross-device fallback: copy+unlink — same pattern as existing `moveFile`).
4. Delete `.tournament_state.json` only if all files moved successfully.
5. Return per-file status; renderer surfaces failures via existing notification system.

### 4.6 Discard commit (`deleteTournamentState` IPC)

- Main process unlinks `.tournament_state.json` if present.
- No file moves.
- Renderer returns to Single mode with source folder unchanged.

---

## 5. UI/UX

### 5.1 Mode entry — 3-way selector

Replace current `#viewModeBtn` (binary toggle) with a 3-way segmented control:

```
[ Single ] [ Compare ] [ Tournament ]
```

(or a tiny `<select>` if the segmented control feels too space-hungry — implementation detail).

- Clicking **Tournament** with no in-progress state → Config modal.
- Clicking **Tournament** with valid in-progress state → jumps straight into pair UI (skips config).
- Cancelling the Config modal reverts to the previously-selected mode.

### 5.2 Config modal

```
┌─────────────────────────────────────────────┐
│  Start Tournament                            │
│                                              │
│  Folder:  /Photos/2026/raw  (87 files)       │
│  Rounds:  [ 3 ▾ ]                            │
│  Output:  87 files → 4 tier folders          │
│           ~131 games  (~11 min at 5s/game)   │
│                                              │
│             [ Cancel ]   [ Start ]           │
└─────────────────────────────────────────────┘
```

- Game-count / time estimate updates live as R changes.
- **Start** disabled if N < 2; non-blocking warning if N < 4 ("only N files — tiers will be sparse").

### 5.3 Pair display

```
┌───────────────────────────────────────────────────────────┐
│ Round 2 of 3 · Game 14/24 · Tiers: 8·6·4·0             ⏸ │
├───────────────────────────────────────────────────────────┤
│   ┌────────────────────┐     ┌────────────────────┐       │
│   │   LEFT MEDIA       │     │   RIGHT MEDIA      │       │
│   │ (click to pick)    │     │ (click to pick)    │       │
│   └────────────────────┘     └────────────────────┘       │
├───────────────────────────────────────────────────────────┤
│      [ ↶ Undo ]   [ L-Special ]   [ R-Special ]           │
└───────────────────────────────────────────────────────────┘
```

- Reuses existing `leftMediaWrapper` / `rightMediaWrapper` (and their zoom/fullscreen/video infrastructure).
- Compare-mode's left/right Like/Dislike buttons **hidden** in tournament via a `.tournament-mode` class on the media container.
- Click anywhere on a media wrapper picks that side as winner.
- Pause icon (top-right) saves state and exits to Single mode (state file kept; can be resumed).
- No Skip button in v1.

### 5.4 Keyboard shortcuts (added to existing customizable shortcut system)

Tournament joins `single` and `compare` as a third entry in `DEFAULT_SHORTCUTS`:

| Action       | Default Key |
|--------------|-------------|
| Left wins    | `Q`         |
| Right wins   | `E`         |
| Undo         | `Ctrl+A`    |
| Left Special | `1`         |
| Right Special| `2`         |
| Pause/exit   | `Escape`    |

Keys are remappable via the existing F1 help overlay (auto-renders a tournament tab once the mode is registered in `shortcuts`).

### 5.5 Summary modal (on completion)

```
┌─────────────────────────────────────────────┐
│  Tournament Complete                         │
│                                              │
│  Tier-3 ████░░░░░░░░░░░░░░  9 files          │
│  Tier-2 ██████████░░░░░░░░ 24 files          │
│  Tier-1 ██████████████░░░░ 32 files          │
│  Tier-0 █████████████░░░░░ 22 files          │
│                                              │
│  → Files will move into _Tier-{0..3}/         │
│    inside /Photos/2026/raw                   │
│                                              │
│       [ Discard ]      [ Apply ]             │
└─────────────────────────────────────────────┘
```

- **Apply** → `applyTournamentResults` IPC → reload folder → return to Single mode showing the new structure.
- **Discard** → `deleteTournamentState` IPC → return to Single mode showing source unchanged.

### 5.6 Resume prompt

When `loadFolder()` finds a valid `.tournament_state.json`:

```
┌─────────────────────────────────────────────┐
│  Resume Tournament?                          │
│                                              │
│  Started:   2 hours ago                      │
│  Progress:  Round 2 of 3 · 14/24 games      │
│                                              │
│      [ Discard ]      [ Resume ]             │
└─────────────────────────────────────────────┘
```

### 5.7 Invalidation prompt

When state file exists but doesn't validate:

```
┌─────────────────────────────────────────────┐
│  Tournament state out of sync                │
│                                              │
│  3 files removed, 1 file added since         │
│  tournament was started.                     │
│                                              │
│  [ Keep state ]   [ Discard and start fresh ]│
└─────────────────────────────────────────────┘
```

### 5.8 Reused infrastructure (no changes)

- Zoom popovers, fullscreen, native video controls (via existing compare-mode wrappers).
- Notification system for non-modal feedback (file-move failures, "Tournament progress saved").
- Existing `signalUserActivity()` mechanism — tournament calls it on every pair decision, same as compare mode, so background CLIP/feature extraction pauses during interaction.

---

## 6. Edge Cases & Error Handling

### 6.1 Pre-tournament validation

| Condition | Behavior |
|-----------|----------|
| `N < 2` files | Config modal disables Start; message "Tournament needs at least 2 files." |
| `N < 4` (trivial but valid) | Non-blocking warning shown; Start enabled. |
| Source folder unreadable | Modal shows error; Start disabled. |
| Special folder unconfigured | Tournament starts normally. Pressing L/R-Special without `specialFolder` → existing compare-mode notification. |

### 6.2 Mid-tournament — file issues

| Condition | Behavior |
|-----------|----------|
| Pair shows externally-deleted file | Engine validates via `checkFileExists` IPC before render (same as `showCompareMedia`); missing → treat as Special-removal; partner re-paired or bye'd; notification: "1 file missing — removed from tournament." |
| File fails to decode | Display fallback placeholder + filename. User still picks a winner. |
| User presses L/R-Special | File moves via existing `moveFile` IPC; engine calls `strategy.removeFile()`; partner re-paired in same bucket if possible, otherwise bye (max one bye per file). |

### 6.3 State persistence failures

| Condition | Behavior |
|-----------|----------|
| State JSON unreadable | Invalidation prompt: "state file is corrupted"; only Discard available. |
| State `version` mismatch | Invalidation prompt: "state from incompatible app version"; Discard only. No migration in v1. |
| Write fails mid-tournament (disk full, permission lost) | Notification: "Failed to save progress: <reason>. Closing app will lose progress." In-memory tournament continues; retry on next save. |
| Same version, file list mismatch | Invalidation prompt with file delta (§5.7). |

### 6.4 Apply commit failures

| Condition | Behavior |
|-----------|----------|
| Tier folder creation fails | Abort apply; state kept; notification with reason. |
| Individual move fails | Other moves continue; `{ moved: K, failed: [...] }` returned; notification with count + first 3 names; state kept. |
| All moves fail | State kept; notification; remain in summary modal. |
| Filename collision in tier folder | Existing `moveFile` collision pattern — append `(1)`, `(2)`. |

### 6.5 System integration

| Concern | Behavior |
|---------|----------|
| Background CLIP/feature extraction | `signalUserActivity()` on every game decision (same as compare mode); no conflict. |
| Video playback | Existing compare-mode video controls (native browser controls). |
| Fullscreen on pair media | Reuses FullscreenManager; exit returns to pair display. |
| Mode/folder switch mid-tournament | State already on disk; switch proceeds with no prompt; resume on return. |
| App close mid-tournament | State on disk after last completed game; the unanswered pair is restored on resume. |
| Memory | ~1 MB undo snapshots for N=100, R=3; cleared on Apply/Discard. |

### 6.6 Engine internal invariants (asserted in code)

- After `recordResult`: `winCounts[winner] === prev + 1`; total wins = `gamesPlayed + byeCount`.
- `playedPairs.size === gamesPlayed`.
- After `isComplete()`: every file has `wins + losses + (1 if byed else 0) === R`.
- `getTier(file)` returns integer in `[0, R]` for every file ∈ `files`.
- `undo()` on empty history is a no-op (no throw).
- `getCurrentPair()` returns null iff `isComplete()` is true.

---

## 7. Testing Strategy

### 7.1 Unit tests — `SwissStrategy` (pure JS, no DOM)

File: `tests/swiss-strategy.test.js`. Uses `createRequire(import.meta.url)` + `require('../tournament-engine')`.

| Test | Asserts |
|------|---------|
| init even N, R=3 | Valid first pair; no byes scheduled |
| init odd N, R=3 | Exactly one bye per round; no file bye'd twice across tournament |
| Round 1 pairs anyone | First-round pairs from any bucket (all 0-win at start) |
| Round 2+ pairs within bucket | After round-1 results, round-2 pairs are within same win count |
| `recordResult` updates winCount | Winner +1; loser unchanged |
| `playedPairs` prevents repeat | Same pair not re-emitted unless no alternative exists |
| Fallback repeat when constrained | N=2, R=3 → same pair played 3 times (documented) |
| `isComplete` timing | True exactly when no more pairs possible |
| `getTier` returns winCount | Integer in `[0, R]` after completion |
| `serialize`/`deserialize` roundtrip | Two strategies with same state emit identical next pairs |
| Total-wins invariant | `Σ winCounts === gamesPlayed + byeCount` |
| `removeFile` mid-session | File removed from `winCounts`, `playedPairs`, `roundQueue`; partner re-paired |

### 7.2 Unit tests — `TournamentEngine` (with `MockStrategy`)

File: `tests/tournament-engine.test.js`.

| Test | Asserts |
|------|---------|
| `getCurrentPair` delegates | Returns `MockStrategy.getNextPair()` |
| `recordResult` pushes history | History grows by 1 with `{ winner, loser, round, snapshot }` |
| `undo` pops + restores snapshot | `Strategy.deserialize` called with popped snapshot |
| `undo` on empty history | No-op (no throw, no state change) |
| `serialize`/`deserialize` roundtrip | History + strategy state + options preserved |
| `getTierBreakdown` after completion | Counts sum to `files.length` |
| `getProgress` mid-tournament | Coherent `{ round, gamesPlayed, gamesTotal }` |

### 7.3 Unit tests — `TournamentManager` (`extractMethod` pattern)

File: `tests/tournament-manager.test.js`. Same pattern as `tests/media-viewer-utils.test.js`.

| Test | Asserts |
|------|---------|
| `handleStartClick` with N<2 | Notification shown; engine not initialized |
| `handleStartClick` with valid N | Engine created; state file written; pair UI rendered |
| `handlePairResult` | Calls `engine.recordResult`, writes state, advances |
| `handleApply` | `applyTournamentResults` IPC called with correct payload |
| `handleDiscard` | `deleteTournamentState` IPC called; returns to Single mode |
| `handleResumePrompt('resume')` | Engine deserialized; pair UI rendered |
| `handleResumePrompt('discard')` | State deleted; tournament start allowed |
| `validateStateFile` strict | Returns `valid: false` with delta details if folder changed |

### 7.4 Integration tests — engine + real strategy + mocked file ops

File: `tests/integration/tournament-flow.test.js`. Mirrors PR #36's `cached-sort-path.test.js`: both methods bound to a real context so wiring bugs surface end-to-end.

| Test | Asserts |
|------|---------|
| Full Swiss N=8, R=3 happy path | 12 games; tier counts sum to 8; each tier ∈ `[0,3]` |
| Full Swiss N=7 (odd), R=3 | Bye distributed; no file bye'd twice; 10–11 games |
| Mid-session Special-removal | After Special, file not in subsequent pairs; remaining tournament completes |
| Serialize → re-instantiate → continue | Snapshot mid-tournament, reload from JSON, complete remaining games — final tiers match the no-interruption run |

### 7.5 E2E tests (Playwright + Electron) — fit-as-time-allows for prototype day

File: `tests/e2e/tournament-mode.test.js`. Fixtures: 4 PNGs (red, green, blue, yellow).

| Test | Asserts |
|------|---------|
| Full happy path | Load → Tournament → Start (R=3) → click winners → Apply → `_Tier-N/` folders exist with expected counts |
| Resume flow | Start → play 2 → close app → reopen → resume prompt → Resume → finish → Apply |
| Discard at summary | Complete → Discard → no files moved; state file gone |
| Invalidation prompt | Start → externally delete fixture → reload → invalidation prompt → Discard and start fresh |
| Keyboard shortcuts | Q/E/Ctrl+A produce correct state changes |
| Mode switch mid-tournament | Tournament → Single → Tournament → in-flight pair restored |
| Special during tournament | L-Special → file in special folder; removed from tournament |

### 7.6 Test count impact

- ~12 SwissStrategy unit tests
- ~7 TournamentEngine unit tests
- ~8 TournamentManager unit tests
- ~4 integration tests
- ~7 E2E tests (E2E "fit-as-time-allows" for prototype Friday)

Total: **~38 new tests**. Baseline: 195 unit + 39 E2E. Post-implementation: ~222 unit + 4 integration + ~46 E2E.

### 7.7 Manual testing checklist (prototype day)

- [ ] R=3 with 8 fixture files: tier breakdown reasonable; folders created correctly
- [ ] R=5 with 16 files: ~40 games, summary shows 6 tiers
- [ ] Odd N (7 files): byes feel balanced, no file bye'd twice
- [ ] Close app mid-tournament, reopen: resume works, no game lost
- [ ] Externally delete a file mid-tournament: invalidation prompt with correct delta
- [ ] Special on mid-tournament file: file leaves cleanly, partner re-paired
- [ ] Undo a game: previous pair shown, win counts revert
- [ ] Apply: files move into tier folders; reload shows new structure

---

## 8. Implementation Phasing

Within the 8 SP budget for this week:

**Thursday (3 SP — Group E, Spec)**: this document; commit; review; transition to writing-plans.

**Friday (5 SP — Group F, Prototype, Swiss only)**:
1. `tournament-engine.js` with `TournamentEngine` + `SwissStrategy` (~1.5 SP)
2. `tournament.js` (`TournamentManager` ES module) (~1 SP)
3. IPC handlers in `main.js` + `preload.js` exposure (~0.5 SP)
4. `media-viewer.js` mode-selector wiring + manager instantiation (~0.5 SP)
5. `index.html` + `styles.css` UI scaffolding (~0.5 SP)
6. Unit tests — all SwissStrategy + Engine + Manager (~1 SP)
7. Integration tests — 2-4 cases (carryover if Friday tight)
8. E2E — happy path + resume (fit-as-time-allows)

**Follow-up BACKLOG items** (will be added on merge):
- Implement `RoundRobinStrategy` (~5 SP, includes pause/resume UX for long sessions)
- Implement `BracketStrategy` (~3 SP, lowest priority — user does this manually)
- Loose resume validation (~3 SP)
- Tier preview in summary modal (~2 SP)
- Custom tier-folder destinations / "Apply to Like folder" workflow (~3 SP)
- Export ranked list as JSON / CSV (~2 SP)
- Tie-breaking refinement (Buchholz) (~2 SP)

---

## 9. Open Questions Resolved During Brainstorm

All open questions from TODO.md entry are resolved:

| TODO Open Question | Resolution |
|--------------------|------------|
| Bracket vs. swiss-style vs. single-elimination | Swiss for v1; RR + Bracket designed but not built |
| Win-count attribute (sidecar JSON?) vs. folder-grouping on disk | Folder-grouping on disk in `<source>/_Tier-N/` |
| When does a tournament "end" — fixed rounds, single survivor, user-stops? | Fixed R rounds (user picks 3/4/5); engine emits null when complete; user-initiated pause via Escape or mode switch (state preserved) |
| Interaction with like/dislike (separate state vs. unified) | Separate — tournament results land in `_Tier-N` folders, orthogonal to user-configured like/dislike/special targets |

---

## Appendix A — File-Level Change Summary

| File | New / Modified | LoC estimate | Notes |
|------|---------------|--------------|-------|
| `tournament-engine.js` | NEW | ~400 LoC | `TournamentEngine` class + `SwissStrategy` class; pure ES module (ESM imports by tests + `tournament.js`) |
| `tournament.js` | NEW | ~300 LoC | `TournamentManager` ES module; mirrors `fullscreen.js` v2.0 pattern |
| `main.js` | MODIFIED | +~120 LoC | 4 IPC handlers (read/write/delete state + applyTournamentResults) |
| `preload.js` | MODIFIED | +~12 LoC | Expose 4 new IPC bindings |
| `media-viewer.js` | MODIFIED | +~80 LoC | Mode-selector wiring; TournamentManager instantiation; resume-prompt hook on `loadFolder` |
| `index.html` | MODIFIED | +~30 LoC | 3-way mode selector; modal/overlay containers |
| `styles.css` | MODIFIED | +~120 LoC | Tournament UI (progress header, tier chips, modal layout) |
| `tests/swiss-strategy.test.js` | NEW | ~250 LoC | 12 tests |
| `tests/tournament-engine.test.js` | NEW | ~180 LoC | 7 tests |
| `tests/tournament-manager.test.js` | NEW | ~250 LoC | 8 tests (extractMethod pattern) |
| `tests/integration/tournament-flow.test.js` | NEW | ~200 LoC | 4 tests |
| `tests/e2e/tournament-mode.test.js` | NEW | ~400 LoC | 7 tests (fit-as-time-allows) |

Total new: ~1,150 LoC production + ~1,280 LoC tests.

---

## Appendix B — Pre-Archive Checklist

Per the recurring drift pattern in PRs #19, #20, #27, #29, #32 (noted in CLAUDE.md "Active gotchas"):

- [ ] Flip every `- [ ]` checkbox in §7.7 to `- [x]` as items complete
- [ ] Add `**Status: Complete**` to header
- [ ] Update test counts in §7.6 to actual (`~38` → real number)
- [ ] Add this file to `docs/README.md` index
- [ ] Add line in CLAUDE.md "Git Insights" section
- [ ] Move `docs/planning/plans/2026-05-XX_tournament-mode.md` to `docs/archive/plans/` after merge

---

*End of design.*
