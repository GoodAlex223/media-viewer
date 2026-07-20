# Group G2 — Tournament-Mode Bug Fixes: Design

**Date**: 2026-07-20
**Branch**: `fix/g2-tournament-bug-fixes`
**Source**: 🔵 User-Flagged — WEEKLY.md Group G2 (Wed–Thu, 6 SP). Three follow-ups from the [2026-07-11] manual-testing intake: 🔴 TODO "Tournament undo intermittently fails", 🟠 TODO "Mouse wheel still navigates pairs in tournament mode", 🔵 BACKLOG "Auto-hide tournament header bar + shared control buttons, reveal on hover".
**Status**: Approved (brainstorm) → ready for implementation plan.

---

## Problem

Three user-flagged defects in Tournament Mode, all on the same files, batched into one branch.

### 1. 🔴 Undo intermittently fails

Reported as *"sometimes a press has no effect"*. **Root cause confirmed by code-read and by the
user: `handleTournamentUndo` peeks the wrong stack.**

[`handleTournamentUndo`](../../../media-viewer.js#L4700) branches on
`this.moveHistory[this.moveHistory.length - 1]?.actionType === 'special'`. But:

- **Tournament picks never write to `moveHistory`.** `handlePairResult` / `handlePairDraw` push only
  to `engine.history` ([tournament.js:45-57](../../../tournament.js#L45-L57)). The only tournament-mode
  writer of `moveHistory` is `moveToSpecialFolder`
  ([media-viewer.js:1550](../../../media-viewer.js#L1550)).
- **`moveHistory` is folder-scoped, not tournament-scoped.** It is cleared only in `loadFolder`
  ([media-viewer.js:2526](../../../media-viewer.js#L2526),
  [:2537](../../../media-viewer.js#L2537)) and on the folder-picker path
  ([:1708](../../../media-viewer.js#L1708)) — never on tournament enter or exit.

So once *any* special-folder move exists in the history — including one made in **single or compare
mode**, before the tournament was ever entered — it permanently owns the top slot and hijacks every
subsequent tournament undo:

```
user does:  pick  pick  SPECIAL  pick  pick
            Ctrl+A  -> restores the SPECIAL file; the pick stands.
                       showTournamentPair() re-renders the SAME pair
                       => user sees "nothing happened"
            Ctrl+A  -> moveHistory now empty -> engine.undo() -> undoes pick #5
```

The user confirmed the reported sessions involved the `1`/`2` special-move keys, matching this
sequence exactly.

**Five further defects on the same method**, all real, found during the same code-read:

| # | Defect | Symptom |
|---|---|---|
| 2 | `TournamentEngine.deserialize` sets `history = []` ([tournament-engine.js:483](../../../tournament-engine.js#L483)); `undo()` returns silently when empty ([:399](../../../tournament-engine.js#L399)). Save & leave → re-enter drops the stack. | Undo dead after resume, no message |
| 3 | No `isLoading` guard — unlike `handleTournamentPick` ([:4667](../../../media-viewer.js#L4667)) and `handleTournamentDraw` ([:4678](../../../media-viewer.js#L4678)). Overlapping `showTournamentPair()` renders, last-writer-wins. | Rapid presses swallowed |
| 4 | The `-1` auto-prune pushes a `trackUndo` entry ([:4544](../../../media-viewer.js#L4544)); the next Ctrl+A pops *that*, not the user's pick. | A press "wasted", pair unchanged |
| 5 | `UNDO_HISTORY_CAP = 100` ([tournament-engine.js:10](../../../tournament-engine.js#L10)) — silent no-op past 100 picks back. | Rare |
| 6 | No feedback on a no-op, and `#tournamentUndoBtn` is never disabled — only the summary modal's undo button is ([:4796](../../../media-viewer.js#L4796)). | Cannot distinguish "nothing to undo" from "broken" |

**Adjacent correctness bug this exposes.** The current special-undo branch re-adds the restored file
to `engine.files` ([:4728-4730](../../../media-viewer.js#L4728-L4730)) but **not** to
`strategy.files`. `SwissStrategy.removeFile` ([tournament-engine.js:224](../../../tournament-engine.js#L224))
deleted the file's `winCounts`, `byes` and `playedPairs` entries, and nothing restores them. The
restored file therefore never re-pairs, and `getTier()` reports 0 — while
`getTierBreakdown()`/`handleApply()` (which read `engine.files`) count it. This is the
`engine.files` vs `strategy.files` divergence CLAUDE.md already documents as a gotcha.

### 2. 🟠 Mouse wheel navigates pairs

The document `wheel` handler ([media-viewer.js:2121-2161](../../../media-viewer.js#L2121-L2161))
falls through to `nextMedia()` / `previousMedia()` with no `isTournamentMode` guard. Scrolling over
empty space (letterbox gaps, the band between wrappers) advances `currentIndex`, desynchronising the
display from the engine's chosen pair.

**This is the only remaining leak.** Tournament mode binds no `next`/`previous` keys
(`DEFAULT_SHORTCUTS.tournament`, [media-viewer.js:23-35](../../../media-viewer.js#L23-L35)) and the
nav arrows are CSS-hidden in tournament mode ([styles.css:2346-2353](../../../styles.css#L2346-L2353)).

### 3. 🔵 Tournament chrome is always visible

`.tournament-header` (progress · pause · tiers) and `.tournament-controls` (Undo · Both Win · Both
Lose) are permanently on screen ([styles.css:2279](../../../styles.css#L2279),
[:2314](../../../styles.css#L2314)), consuming viewing area. The per-wrapper
`.media-overlay-controls` already hover-hide ([styles.css:1670-1688](../../../styles.css#L1670-L1688));
the shared chrome does not. The main `.header` already implements exactly the wanted pattern
([styles.css:194-218](../../../styles.css#L194-L218) + `setupHeaderVisibility`,
[media-viewer.js:2164](../../../media-viewer.js#L2164)).

---

## Decisions (from brainstorming)

- **D1 — Unified LIFO undo stack.** One chronological tournament-scoped stack holds **both** picks and
  tournament-mode special moves; Ctrl+A always reverses the single newest user action, whichever kind
  it was. (Chosen over "picks only", which would silently drop a capability that exists today, and
  over "specials first then picks", which stays non-chronological and therefore still surprising.)
- **D2 — `engine.history` *is* that stack.** No second renderer-side stack. The special-move site
  switches from `removeFile(path)` to `removeFile(path, {trackUndo: true, kind: 'special', meta})`,
  putting it in chronological order with the picks. This deliberately **reverses** the CW-T/PR #59
  choice to leave the special path `trackUndo: false` — that choice existed precisely to stop two
  stacks from desyncing, and a single stack dissolves the reason for it.
- **D3 — The engine stays dumb.** `meta` is an opaque payload (the renderer's `moveHistory` entry)
  that the engine stores and hands back but never inspects. Disk restoration, `mediaFiles` and
  feature-cache repair remain wholly renderer concerns, preserving the pure-ESM,
  unit-testable-in-isolation property of `tournament-engine.js`.
- **D4 — System prunes are transparent.** The `-1` auto-prune stays `trackUndo: true` (PR #59's fix
  for undo-past-a-removal corruption is still needed) but is **auto-consumed** as part of the
  following user undo, so it never costs the user a press.
- **D5 — Undo stays session-only.** A Save & leave → resume starts with an empty stack. Persisting
  history would reverse CW-T decision D1 (the history-free `version: 2` payload is what made 24k
  resume O(n)). A "Nothing to undo" notification addresses the confusion instead.
- **D6 — Auto-hide mirrors `.header` exactly** — edge-band reveal plus a 3s grace timer, not
  hide-on-leave. (Chosen over instant hide, which makes the bar vanish while the pointer travels
  toward the pause button, and over keeping the top bar pinned, which the user explicitly asked
  against.)
- **D7 — Reveal both on tournament entry, then let the timer hide them.** Otherwise entering the mode
  presents a blank screen and the pause/exit button — shipped by PR #58 *as* the discoverable exit
  affordance — never announces itself.

---

## Non-goals / scope guardrails

- **No change to Swiss pairing, tier assignment, `handleApply`, or the persisted state format.**
  `version: 2` is unchanged; `serialize()`/`deserialize` are untouched. Undo remains absent from disk.
- **No new undo capability outside tournament mode.** `handleCancel`'s single/compare undo branches
  ([media-viewer.js:3790-4052](../../../media-viewer.js#L3790-L4052)) are not restructured. A special
  move made outside tournament mode keeps working exactly as today — it simply can no longer reach
  the tournament undo path.
- **`UNDO_HISTORY_CAP` stays 100.** Defect #5 is bounded and rare; raising the cap trades RAM at 24k
  for a case the user has not hit. Covered by the "Nothing to undo" notification.
- **No redesign of `.media-overlay-controls`** — they already hover-hide correctly.
- **No new settings toggle** for auto-hide. If it proves annoying in dogfooding, that is a follow-up.

---

## Architecture

### 1. Engine: two new methods, one extended option (`tournament-engine.js`)

History entries gain a uniform `kind` discriminator. Existing entries are treated as `'pick'` when
`kind` is absent, so nothing in-flight breaks.

| `kind` | Pushed by | Reversal | Counts as a user action |
|---|---|---|---|
| `pick` | `recordResult` / `recordDraw` — inverse-delta or boundary snapshot, **unchanged** | `strategy.applyUndo(entry.undo)` | ✅ |
| `special` | `removeFile(path, {trackUndo: true, kind: 'special', meta})` from the tournament special-move site | snapshot restore **+** renderer disk work | ✅ |
| `prune` | `removeFile(path, {trackUndo: true})` from the `-1` auto-prune | snapshot restore | ❌ auto-consumed |

`kind` **defaults to `'prune'`** on a `trackUndo: true` removal — i.e. today's literal
`kind: 'removeFile'` ([tournament-engine.js:422](../../../tournament-engine.js#L422)) is renamed, and
only the special-move site passes an explicit `kind`. The `-1` auto-prune call site therefore needs
no change.

**`peekUndoKind()` → `'pick' | 'special' | null`** — scans back past trailing `prune` entries and
reports the kind of the newest *user* entry, without mutating. Returns `null` for an empty history or
one containing only prunes. Drives both the `handleTournamentUndo` dispatch and
`#tournamentUndoBtn.disabled`.

**`undoUserAction()` → entry | null** — pops and reverses trailing `prune` entries, then pops and
reverses exactly one user entry, returning it (so the renderer can read `meta`). Returns `null`
without mutating if there is no user entry. Existing `undo()` is kept as the single-entry primitive
that `undoUserAction()` is built from, so current callers and tests keep working.

Restoring a `prune` snapshot re-inserts a file that is genuinely missing from disk; the next
`showTournamentPair()` re-prunes it and pushes a fresh `prune` entry. This is self-healing and
already bounded by the existing `_pruneDepth` cap ([media-viewer.js:4549](../../../media-viewer.js#L4549)).
The alternative — discarding prune entries without reversing them — would leave the strategy missing
a file that the preceding pick's inverse-delta assumes present, which is the exact corruption PR #59
fixed.

### 2. Renderer: `handleTournamentUndo` becomes a dispatcher (`media-viewer.js`)

```
guard: isTournamentMode && !isLoading && tournament.engine        // NEW: isLoading
kind = engine.peekUndoKind()

kind === null      -> showNotification('Nothing to undo', 'info'); return
kind === 'special' -> restore file on disk (moveFile IPC) FIRST
                      on failure: showError; return with the stack UNTOUCHED
                      on success: engine.undoUserAction()          // reverses prunes + the removal
                                  push restored file to mediaFiles
                                  restoreFeatureCachesFromHistory(meta)
                                  remove meta's entry from moveHistory
                                  updateFolderInfo()
kind === 'pick'    -> engine.undoUserAction()

tournament._schedulePersist(baseFolderPath)
await showTournamentPair()
```

Doing the disk restore before touching the stack replaces today's
pop-then-push-back-on-error compensation ([:4710](../../../media-viewer.js#L4710) /
[:4742](../../../media-viewer.js#L4742)) with a plain guard — the stack is only advanced once the
irreversible step has succeeded.

The `special` branch no longer hand-patches `engine.files`: `undoUserAction()` restores the strategy
snapshot **and** `filesSnapshot`, which repairs `winCounts`, `byes`, `playedPairs` and `roundQueue`
too. That fixes the divergence described under Problem §1.

`moveHistory` is no longer read to decide the branch — only to remove the consumed entry. The
`meta` payload carries the entry itself, so removal is by identity, not by index or path search.

The existing `if (this.isSortedByPrediction) this.requestPredictionScores();` line
([:4732](../../../media-viewer.js#L4732)) is **dropped, not ported**: `enterTournamentMode` calls
`restoreOriginalOrderForTournament()`, which forces `isSortedByPrediction = false`
([:4154](../../../media-viewer.js#L4154)), and nothing can re-enable it in-mode because the sort
controls are hidden ([:4163](../../../media-viewer.js#L4163)). It is unreachable on this path.

### 3. `#tournamentUndoBtn` disabled state

Set from `peekUndoKind() !== null` in `showTournamentPair()` (which already runs after every pick,
draw, undo and prune) and on tournament entry. The summary modal's undo button
([:4796](../../../media-viewer.js#L4796)) switches from `engine.history.length === 0` to the same
predicate, so a prune-only history correctly disables it.

### 4. Wheel guard

One line at the top of the `wheel` handler, beside the existing help-overlay guard
([:2124](../../../media-viewer.js#L2124)):

```js
if (this.isTournamentMode) return;
```

Zoom-over-media is unaffected: the media elements' own wheel listeners are bound to the elements and
fire in the bubble phase *before* this document-level handler, which never calls `stopPropagation`.
Returning without `preventDefault` matches the help-overlay guard directly above it.

### 5. Auto-hide

**CSS** — `.tournament-header` and `.tournament-controls` become `opacity: 0; pointer-events: none`
at rest, with `:hover, .show { opacity: 1; pointer-events: auto; }` and the same
`transition: opacity var(--transition-slow)` as `.header`. Both rules currently carry an explicit
`pointer-events: auto` (because the parent `.tournament-overlay` is `pointer-events: none`) — that
declaration moves into the `.show` rule.

**JS** — the reveal logic is identical for all three elements (3s timer, `mouseenter` re-arms,
`mouseleave` hides, a `clientY` zone predicate). Extract the body of `setupHeaderVisibility` into one
private helper and call it three times rather than copy it twice. `.header`'s effective behaviour is
unchanged.

| Element | Reveal zone | Notes |
|---|---|---|
| `.header` | `clientY < 50` | unchanged |
| `.tournament-header` | `clientY < 110` | spans the main header band **and** the tournament bar at `margin-top: 56px`, so one upward motion reveals both |
| `.tournament-controls` | `clientY > innerHeight - 110` | |

The two tournament predicates short-circuit on `!this.isTournamentMode`. `enterTournamentMode` /
`_enterResumedTournamentUI` reveal both once (D7); `exitTournamentMode` clears the timers and drops
`.show`.

---

## Data flow — a mixed undo sequence, after G2

```
pick P1      engine.history: [P1]
pick P2                      [P1 P2]
special S    disk move + removeFileFromList + removeFile(trackUndo,'special',meta)
                             [P1 P2 S]        moveHistory: [... , meta]
pick P3                      [P1 P2 S P3]
file X vanishes from disk -> auto-prune
                             [P1 P2 S P3 R]   (R = prune)

Ctrl+A  peek -> 'pick'    undoUserAction(): reverse R, reverse P3   -> [P1 P2 S]
Ctrl+A  peek -> 'special' restore S on disk, then undoUserAction()  -> [P1 P2]
                          strategy fully restored from S's snapshot
                          mediaFiles + feature caches repaired, meta popped
Ctrl+A  peek -> 'pick'    reverse P2                                -> [P1]
Ctrl+A  peek -> 'pick'    reverse P1                                -> []
Ctrl+A  peek -> null      "Nothing to undo"; #tournamentUndoBtn disabled
```

---

## Error handling

- **Special-undo disk restore fails** — `showError`, stack untouched, tournament state unchanged. The
  user can retry; nothing is half-applied.
- **Empty / prune-only history** — `showNotification('Nothing to undo', 'info')`. Covers the
  post-resume case (D5), the `UNDO_HISTORY_CAP` case (defect #5), and a genuinely fresh tournament.
- **Undo during a pair render** — the new `isLoading` guard drops the press rather than racing
  `showTournamentPair()`.
- **Persist failure** — unchanged: `_schedulePersist` → `_drain` already swallows and logs
  ([tournament.js:177-180](../../../tournament.js#L177-L180)).

---

## Testing & verification

**Engine unit tests** (`tests/tournament-engine.test.js`)
- `peekUndoKind` across five stack shapes: empty → `null`; pick on top → `'pick'`; special on top →
  `'special'`; prune(s) on top of a pick → `'pick'` (sees through, does not mutate); prune-only →
  `null`.
- `undoUserAction` consumes trailing prunes and then exactly one user entry; returns the entry;
  returns `null` and mutates nothing on an empty/prune-only history.
- A `special` reversal restores `strategy.winCounts`, `strategy.files`, `byes` and `roundQueue` —
  not just `engine.files`. This is the regression test for the divergence bug.
- Entries written before this change (no `kind` field) are still treated as `'pick'`.

**Renderer unit tests** (`tests/media-viewer-utils.test.js`, via `extractAsyncMethod`)
- Dispatch: `'special'` → disk restore path; `'pick'` → `undoUserAction` only; `null` → notification
  and no engine mutation.
- The `isLoading` guard.
- Disk-restore failure leaves `engine.history` and `moveHistory` untouched.
- **A single regression test for the reported bug**: a `moveHistory` whose last entry is a
  `actionType: 'special'` from *outside* the tournament must not divert a pick undo.

**Two traps to apply deliberately** (both cost real data or real time on PR #64):
- **Mutation-verify every guard test** — delete the guard, confirm the test goes red. Four vacuous
  tests shipped on that branch, one whose text anchor had drifted ~6,000 lines.
- **Stub `globalThis.MediaViewer`** if an extracted body touches a class-static; `new AsyncFunction`
  resolves globals, so such a test passes vacuously otherwise.

**Stale test to update** — [tests/tournament-engine.test.js:458](../../../tests/tournament-engine.test.js#L458),
*"removeFile defaults to no undo tracking (special-move path handles its own undo)"*. Its stated
rationale is exactly what D2 reverses. The default-`false` behaviour still holds and stays covered;
the name and comment must stop asserting the special path relies on it.

**E2E** (`tests/e2e/tournament-mode.test.js`)
- Wheel over empty space in tournament mode leaves the displayed pair unchanged.
- Auto-hide: chrome hidden at rest, revealed by a mousemove into the band. Assert **computed**
  visibility, not class presence — a feature can pass a class assertion while being invisible.
- The existing tournament tests click controls that are now `pointer-events: none`; they get a
  synthetic mousemove into the band first, which doubles as coverage of the new behaviour.

**Manual smoke** (user-side, gating checkoff)
1. Single mode → special-move a file (`1`) → enter tournament → 3 picks → Ctrl+A ×4. Expect: picks
   reverse newest-first, then the special file is restored, in that order.
2. Ctrl+A on a fresh tournament → "Nothing to undo", button disabled.
3. Save & leave → re-enter → Ctrl+A → "Nothing to undo" (expected per D5, not a bug).
4. Scroll the wheel over empty space mid-tournament → pair does not change.
5. Chrome hidden at rest; top band reveals header + bar together; bottom band reveals the buttons;
   each hides ~3s after the pointer leaves.

---

## Documentation propagation

Two CLAUDE.md **Active gotchas** become false and must be *corrected in place*, not annotated:

1. *"`handleTournamentUndo` has **two paths** … `engine.removeFile` is NOT tracked by
   `engine.undo()`, so the special path manually restores the file …"* — the manual restore of
   `engine.files` and the push-back-on-error compensation both go away.
2. *"`engine.files` vs `strategy.files` **diverge after `removeFile()`** … The special-move removal is
   deliberately left `trackUndo:false` so the renderer special-undo stack and the `engine.undo()`
   stack don't desync."* — D2 reverses this; there is now one stack.

Before committing, grep the whole repo for `trackUndo`, `moveHistory`, `handleTournamentUndo` and
`peekUndoKind` across **tests and comments**, not just live callers — the unit-only pre-commit hook
does not catch a stale E2E assertion or a stale comment (root cause of the PR #56 follow-ups).

---

## Acceptance criteria

- [ ] A special move made in any mode never diverts a tournament pick undo.
- [ ] Ctrl+A reverses picks and tournament special moves in strict chronological (LIFO) order.
- [ ] A system auto-prune never consumes a user undo press.
- [ ] Undoing a special move restores the file into `strategy` state — it re-pairs and reports its
      real tier, not Tier-0.
- [ ] Undo with nothing to undo shows a notification; `#tournamentUndoBtn` is disabled in that state.
- [ ] `handleTournamentUndo` is guarded by `isLoading`, matching pick and draw.
- [ ] A failed disk restore leaves the undo stack and tournament state untouched.
- [ ] The mouse wheel does not change the pair in tournament mode; zoom-over-media still works.
- [ ] Tournament header and shared controls are hidden at rest, reveal on their edge band, and
      auto-hide 3s after the pointer leaves. Both reveal once on tournament entry.
- [ ] `npm test` green (new engine + renderer tests, every guard mutation-verified); `npm run lint`
      clean; E2E suite green.
- [ ] Both stale CLAUDE.md gotchas corrected; repo-wide grep sweep done.
- [ ] Persisted tournament state stays `version: 2`; no on-disk format change.
