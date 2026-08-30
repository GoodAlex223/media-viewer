# G2 Tournament Undo Hardening — Design Spec

**Task Reference**: WEEKLY.md Aug 31–Sep 4 § G2 (🟤, 5 SP) ← BACKLOG 🟤 `### [2026-07-21] PR #65 review follow-ups` (the correctness subset of 9)
**Created**: 2026-08-30
**Status**: Draft — awaiting user review
**Branch**: `g2-tournament-undo-hardening` (no PR, per task brief)

---

## 1. Goal

Close the five gaps that can **strand or wedge the unified undo stack** (`engine.history`) that Group G2
introduced in July (PR #65, merged `937084c`). Four WEEKLY checkboxes, six BACKLOG entries:

| # | Item | Files | BACKLOG entry |
|---|------|-------|---------------|
| 1 | `reconcileWithFiles` prune → drop the session-only `engine.history` | `tournament.js`, `tournament-engine.js` | reconcile-untracked → Tier-0 strand |
| 1b | Split + correct the CLAUDE.md gotcha bullet | `CLAUDE.md` | "line 191 is the longest bullet (958 chars)" |
| 2 | A failed special-restore must not wedge the undo stack | `media-viewer.js` | failed-special-restore wedge |
| 3 | Guard the trailing `await showTournamentPair()` | `media-viewer.js` | unguarded trailing await ×3 handlers |
| 4a | Empty-state keydown undo guard consults `engine.history` | `media-viewer.js` | keydown gates on `moveHistory.length` |
| 4b | Document the `exitTournamentMode` / null-engine invariant | `media-viewer.js` | undocumented accidental invariant |

**Non-goal:** no behavioural change to the tournament algorithm, pairing, tiering, persistence format, or
the Swiss strategy. This is undo-stack lifecycle hardening only.

---

## 2. Findings that changed the design

Three claims in the tracking docs did not survive a read of the current code. Each is corrected here and
must be carried into the plan.

### F1 — Item 3's *specified fix* cannot work (design-changing)

The BACKLOG/WEEKLY text says: _"guard the trailing `await showTournamentPair()` … with the existing
`isLoading` mutex."_ That mutex cannot span the render, and the codebase already says so.

`showTournamentPair` → `showTournamentPairFast` (`media-viewer.js:4749`) attaches
`setupCompareLeftHandlers`/`setupCompareRightHandlers`, and those handlers **clear** `isLoading`:

- `media-viewer.js:3355-3357` and `3411-3413` — `if (bothLoaded) { … this.isLoading = false; }`
- `media-viewer.js:3374`, `3430`, `3452`, `3471` — the `onError` paths do the same

So `isLoading = true; await showTournamentPair(); finally { isLoading = false }` is dissolved **by the
render itself** at first paint. A second trigger arriving after first paint passes the entry guard
(`if (… || this.isLoading) return`) and renders concurrently — the exact defect the item exists to fix.

This is not a new discovery so much as an unheeded one: `media-viewer.js:4896-4899` already documents it —
_"ADVISORY ONLY — isLoading is not exclusively owned … the setupCompare\*Handlers it attaches CLEAR it on
bothLoaded/onError"_ — and the same fact was the PR #65 pre-merge fix `ae98e85`.

**Consequence:** item 3 needs a lock the render does not touch. See D3.

### F2 — The CLAUDE.md bullet is line **192**, not 191

The entry says _"CLAUDE.md line 191 is now the file's longest bullet (958 chars)"_. As of `1d072e3`:

| Line | Chars | Content |
|------|-------|---------|
| 191 | 812 | `handleTournamentUndo` dispatches off `engine.history` … |
| **192** | **964** | `engine.files` vs `strategy.files` **diverge after an untracked `removeFile()`** … |

Line 192 is both the longest bullet **and** the one whose tail documents the `reconcileWithFiles` gap this
spec closes. The file grew by one line since the entry was filed. Intent is unambiguous; the plan targets
line 192.

### F3 — Item 4a's reachability is narrower than the entry implies

The entry says a tournament _"emptied purely via the `-1` auto-prune"_ swallows Ctrl+A. But the `-1` prune
fires **because** `getMediaIndex(f) === -1`, i.e. the file is already absent from `mediaFiles`
(`media-viewer.js:4700`). An empty `mediaFiles` is the **cause** of the prune, not its effect.

The real repro: a live engine with picks in `engine.history`, a folder whose files vanish externally (or
are consumed without writing `moveHistory`), `mediaFiles.length === 0`, `moveHistory.length === 0`. The
`#tournamentUndoBtn` reads *enabled* (it consults `peekUndoKind()`, `media-viewer.js:4695`) while the
keydown guard gates on `moveHistory.length` — button and shortcut disagree.

The fix is unchanged and still correct; only the repro narrative in the plan's test notes changes.

---

## 3. Decisions (user-approved 2026-08-30)

Decision IDs are `DEC-n`; design-section IDs in §4 are `D-n`. They are **not** parallel — the mapping is
given in the last column. (`D1` also names an unrelated PR #55 decision, "undo history is session-only",
referenced in §4 D-1.)

| ID | Question | Decision | Rejected alternatives | Implemented in |
|----|----------|----------|-----------------------|----------------|
| **DEC-1** | What guards the trailing `showTournamentPair()`? | **Dedicated re-entrancy flag** `_tournamentRenderBusy` | Generation counter (last-trigger-wins; tears down a half-rendered pair). Literal `isLoading` (F1 — partial guard only). | §4 **D-3** |
| **DEC-2** | Escape policy for a wedged `special` entry? | **Drop after 2 consecutive failures** on the same entry, with a toast | Drop on 1st failure (a transient AV/network lock costs an undo). Demote to `'prune'` (silently reclassifies a user action). | §4 **D-2** |
| **DEC-3** | Tell the user when a reconcile drops a non-empty history? | **Notify** — only when a prune actually drops a non-empty stack | Silent drop (BACKLOG's literal text; leaves "Nothing to undo" unexplained). | §4 **D-1** |

---

## 4. Design

### D-1. `reconcileWithFiles` drops the session-only history

**Constraint carried from the BACKLOG entry:** the naive fix is *wrong*. Passing `{trackUndo: true}` per
file makes a bulk reconcile push one O(n) `strategy.serialize()` snapshot **per pruned file** — hundreds on
a 24k folder — undoing the PR #55 / CW-T performance win. `reconcileWithFiles` keeps its untracked
`removeFile()` loop deliberately, and drops the whole stack once, in O(1).

**`tournament-engine.js` — two new methods:**

```js
// Discard the entire session-only undo stack in O(1). Used where a bulk mutation would
// otherwise need one O(n) strategy snapshot per file (reconcile prune). Honest outcome:
// peekUndoKind() -> null, the button disables, Ctrl+A says "Nothing to undo".
// Returns the number of entries dropped, so the caller can decide whether to notify.
clearHistory() {
    const dropped = this.history.length;
    this.history = [];
    return dropped;
}

// Remove ONE entry without reversing it. For a `special` entry whose disk restore is
// permanently failing: reversing is impossible (the file is not there) and leaving it on
// top wedges every later undo. Returns true if the entry was found and removed.
dropEntry(entry) {
    const i = this.history.lastIndexOf(entry);
    if (i === -1) return false;
    this.history.splice(i, 1);
    return true;
}
```

`dropEntry` is used by D-2, not D-1; both land in the same engine commit.

**`tournament.js` — `reconcileWithFiles`:**

```js
if (removed.length > 0) {
    const droppedUndo = this.engine.clearHistory();
    if (droppedUndo > 0) {
        this.host.showNotification(
            `${removed.length} file${removed.length === 1 ? '' : 's'} left the folder — ` +
                `tournament undo history cleared`,
            'info'
        );
    }
    this._schedulePersist(this.host.baseFolderPath);
}
return removed.length;
```

**Why the return shape does not change:** `reconcileWithFiles` returns `removed.length` and six existing
assertions in `tests/tournament-manager.test.js` (lines ~415–445) plus `handleResumeReconciled`'s
`removedCount` depend on it. `this.host.showNotification` is already part of the manager's host contract
(used at `tournament.js:29`), so notifying in place needs no new plumbing.

**Silent where it should be:** on the disk-resume path, `handleResumeReconciled` calls
`TournamentEngine.deserialize` first, which sets `eng.history = []` (`tournament-engine.js:525` — history is
deliberately session-only, D1 of PR #55). `clearHistory()` therefore returns 0 and no toast fires. Only the
live-engine re-entry path (`_enterResumedTournamentUI`, `media-viewer.js:5058`) can drop a non-empty stack —
which is exactly the reachability story the BACKLOG entry describes.

### D-2. A failed special-restore cannot wedge the stack

**State:** `this._tournamentRestoreFailures = new WeakMap()` on `MediaViewer`, keyed by the history entry
object. A `WeakMap` rather than a field on the entry: `meta` is documented as the only renderer-owned
field on an engine entry, and a `WeakMap` is collected automatically when the entry leaves the stack.

**Constant:** `TOURNAMENT_RESTORE_MAX_ATTEMPTS = 2` (module scope, UPPER_SNAKE_CASE per conventions).

**Control flow** — the existing `try/catch/finally` around the `moveFile` restore is restructured so the
drop and the re-render happen **after** `finally { this.isLoading = false }`, not inside the `catch`.
Otherwise `showTournamentPair()` would run with `isLoading` still true:

```js
let restoreFailed = false;
let droppedWedged = false;
this.isLoading = true;
try {
    const moveResult = await window.electronAPI.moveFile({ … });
    if (!moveResult.success) throw new Error(moveResult.error);
} catch (error) {
    restoreFailed = true;
    console.error('Error undoing tournament special:', error);
    const failures = (this._tournamentRestoreFailures.get(pending) ?? 0) + 1;
    this._tournamentRestoreFailures.set(pending, failures);
    if (failures >= TOURNAMENT_RESTORE_MAX_ATTEMPTS) {
        droppedWedged = true;
    } else {
        this.showError(`Failed to undo move: ${error.message}`);
    }
} finally {
    this.isLoading = false;
}
if (restoreFailed) {
    if (droppedWedged) {
        this._dropWedgedSpecialEntry(pending, move);
        this.showError(`Couldn't restore ${move.fileName} — skipping this undo`);
        await this.showTournamentPair(); // refresh the undo button's enabled state
    }
    return;
}
```

**`_dropWedgedSpecialEntry(entry, move)`** drops both halves of the pair:

- `this.tournament.engine.dropEntry(entry)` — the engine-side `special` entry
- the `moveHistory` twin, via the same `lastIndexOf` / `splice` idiom the success path already uses
  (`media-viewer.js:4951-4952`)

Dropping the twin matters: the BACKLOG entry notes `moveHistory` _"remains independently consumable by
`handleCancel` outside tournament mode"_, so a surviving twin would re-attempt the same failing restore
after a mode switch. A `moveHistory` entry we can no longer honour is not worth keeping.

**Why dropping is safe (self-healing, must be commented in-code):** a dropped `special` entry leaves the
file out of `engine.files`, while entries *beneath* it hold `filesSnapshot`s that still contain it. Undoing
past the drop restores a snapshot containing a file that is absent from `mediaFiles` — and the `-1`
auto-prune at `media-viewer.js:4700` removes it again, this time with `{trackUndo: true}`. The divergence
closes itself on the next render rather than persisting.

### D-3. Dedicated re-entrancy flag (supersedes the `isLoading` text — see F1)

`this._tournamentRenderBusy = false` initialized in the constructor beside `this.isLoading = false`
(`media-viewer.js:69`). Applied to the three handlers named in the item:

```js
async handleTournamentPick(winner, loser) {
    if (!this.isTournamentMode || this.isLoading) return;
    if (this._tournamentRenderBusy) return;
    this._tournamentRenderBusy = true;
    try {
        this.signalUserActivity();
        …
        await this.showTournamentPair();
    } finally {
        this._tournamentRenderBusy = false;
    }
}
```

- The existing `isLoading` entry guards **stay**. This adds a lock; it does not replace one.
- The `finally` spans the whole body including the trailing `await`, so no throw can wedge the flag.
- `showTournamentPair`'s internal `_pruneDepth` recursion is unaffected — the flag is held by *callers*,
  and `showTournamentPair` never sets or reads it.
- `handleTournamentUndo` keeps its inner `isLoading = true/false` around the `moveFile` await; the two
  flags are independent and both are wanted (`isLoading` blocks a concurrent pick/draw/special mid-restore).

**Deliberately out of scope:** `moveToSpecialFolder` fires `this.showTournamentPair()` **un-awaited** at
`media-viewer.js:4830`, and `_enterResumedTournamentUI` (`:5059`) / the resume paths (`:1628`, `:4650`) call
it unguarded. Same family, not among this group's four items. File to BACKLOG 🟤 at closeout rather than
widening the branch (see §7).

### D-4a. Empty-state keydown guard

`media-viewer.js:2075`, inside the `mediaFiles.length === 0` branch (the `const action = …` binding it
reads sits at `:2074`):

```js
// The undo shortcut must also fire for a tournament whose engine still holds an undoable
// entry. #tournamentUndoBtn already consults peekUndoKind(), so gating the SHORTCUT on
// moveHistory alone let the button read enabled while Ctrl+A silently no-opped.
const canUndo =
    this.moveHistory.length > 0 ||
    (this.isTournamentMode && this.tournament?.engine?.peekUndoKind() != null);
if (action === 'undo' && canUndo) {
```

**The `isTournamentMode` conjunct is load-bearing.** `executeAction('undo')` resolves through the
mode-keyed reverse map: mode `'tournament'` → `handleTournamentUndo`, mode `'single'` → `handleCancel`.
Without the conjunct, a non-empty `engine.history` left behind by an exit that did not null the engine
(precisely the D-4b invariant hole) would let a **single-mode** Ctrl+A invoke `handleCancel` against an
empty `moveHistory`.

`!= null` (not `!==`) so both `null` and `undefined` are covered; optional chaining matches the existing
idiom at `media-viewer.js:5008`.

### D-4b. `exitTournamentMode` invariant comment

Comment only, at `media-viewer.js:4517`, recording that:

- the unified undo stack's cross-mode safety rests on every exit that could leave `engine.history` behind
  **also nulling `tournament.engine`** — an accidental, previously undocumented invariant;
- `loadFolder` satisfies it explicitly (nulls the engine on both branches of its empty/non-empty split);
  `handleDiscard` nulls it at `tournament.js:77`; `handleApply` at `:70`;
- the known hole is `switchMode`'s `isComplete()` bypass, reachable via Escape-out-of-summary-modal → the
  modal's own Undo button (`media-viewer.js:5009-5012`), which calls `handleTournamentUndo` **without**
  `exitTournamentMode`;
- a future exit path that forgets to null the engine silently reintroduces a cross-mode undo hazard.

**Not enforced.** Making `exitTournamentMode` null the engine itself would be stronger, but it touches the
Save-and-leave path (`showTournamentLeavePrompt` must serialize a live engine after the exit) — a different
risk profile from a cleanup batch, and the BACKLOG entry scopes this at Effort: XS / "Add a comment".
D-4a's `isTournamentMode` conjunct already neutralizes the one consequence this batch cares about.

### D-5. CLAUDE.md

Split line **192** (964 chars, F2) into two bullets:

1. **Divergence + mechanism** — `engine.files` is authoritative for `getTierBreakdown()`/`handleApply()`;
   the `-1` auto-prune and the special-move removal pass `{trackUndo: true}`, recording a strategy snapshot
   + `filesSnapshot` so `undo()` restores `files`/`winCounts`/`byes`/`roundQueue` in full.
2. **The reconcile site** — now drops the whole session-only history in O(1) instead of leaving an
   untracked divergence, and *why* the per-file `{trackUndo:true}` fix is wrong (the O(n)-snapshot trap).

The current tail — _"a third `removeFile()` call site … stays untracked, so undo crossing it … can still
strand a file at Tier-0"_ — becomes **false** with this branch. It must be rewritten, not merely shortened:
a live doc gets corrected, never left to be inferred from a plan (per the CLAUDE.md propagation check).

Line 191 also gains a sentence on the D-2 escape (a permanently-failing special restore is dropped, not
retried forever) if it can be added without pushing 191 past ~900 chars; otherwise it goes in bullet 2.

---

## 5. Testing

TDD per project workflow — tests first; `npm test` before every commit (the pre-commit hook runs the full
unit suite and will block otherwise).

**Baseline: 529 passing / 17 files** (`npx vitest run --no-file-parallelism`, verified 2026-08-30).

| File | Cases |
|------|-------|
| `tests/tournament-engine.test.js` | `clearHistory()` returns the dropped count and empties the stack; `peekUndoKind()` → `null` afterwards. `dropEntry()` removes the entry **without** reversing it (strategy state untouched, `files` untouched); returns `false` for an entry not on the stack; removes only the given entry when several share a `kind`. |
| `tests/tournament-manager.test.js` | `reconcileWithFiles` drops history when it prunes; leaves history intact when it prunes nothing; notifies **only** when a non-empty stack was dropped (spy on `host.showNotification`); still returns the same removed count (the six existing assertions stay green). |
| `tests/media-viewer-utils.test.js` | `_tournamentRenderBusy` blocks a re-entrant call and is cleared on both the success and throw paths. 1st restore failure → retry preserved (entry still on the stack, count 1); 2nd → `dropEntry` + `moveHistory` twin removed + toast. `canUndo` expression: true on `moveHistory`, true on a tournament-mode engine entry, **false** on an engine entry in single mode. |

**Mutation-verify every new guard test** (temporarily break the implementation, watch the test fail,
restore) — the CW-1/G1 precedent: a guard test that cannot fail looks exactly like one that passes.

**E2E:** no changes. The pre-push hook will run the full Playwright suite anyway (these are not
docs-only paths).

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| `clearHistory()` on reconcile silently costs a real undo stack | Only reachable on live-engine re-entry after files actually vanished; DEC-3 notifies. The alternative (per-file snapshots) is a measured 24k perf regression. |
| `dropEntry` leaves `engine.files` inconsistent with lower `filesSnapshot`s | Self-healing via the `-1` auto-prune (D-2). Comment it in-code so the next reader does not re-derive it. |
| `_tournamentRenderBusy` wedges on a throw | `finally` spans the entire body, including the trailing `await`. Covered by a dedicated throw-path test. |
| Restructured `try/catch/finally` in `handleTournamentUndo` disturbs the `ae98e85` identity re-check | The re-check sits **after** the `finally` and is untouched; the restructure only moves the drop + re-render out of the `catch`. Re-read the whole method after editing. |
| CLAUDE.md edit lands but the plan/spec keep the stale claim | Spec §D-5 makes the rewrite explicit; closeout runs the propagation check across live docs. |

---

## 7. Out of scope → BACKLOG 🟤 at closeout

1. **`moveToSpecialFolder`'s un-awaited `showTournamentPair()`** (`media-viewer.js:4830`) and the unguarded
   render calls at `:1628`, `:4650`, `:5059` — same re-entrancy family as D-3, outside the item's three
   named handlers.
2. **Enforcing** the D-4b invariant (null `tournament.engine` inside `exitTournamentMode`) instead of
   documenting it — needs the Save-and-leave persistence path verified first.
3. Deferred by WEEKLY from the same BACKLOG section, explicitly **not** this group: keyboard-focus a11y of
   auto-hidden chrome (must also touch `.header`); a real `WheelEvent` zoom E2E; Playwright load-flake
   hardening.
4. **Dead row in `docs/planning/plans/README.md`** — the "Current Plans" table lists
   `2025-12-29_video-fullscreen-toggle.md`, which does not exist. Belongs to G3's "dead rows" item;
   noted here so it is not lost.

---

## 8. Sequencing

Five commits on `g2-tournament-undo-hardening`, each green under `npx vitest run`:

1. `clearHistory()` + `dropEntry()` + engine tests
2. `reconcileWithFiles` drop + notify + manager tests
3. Failed-special-restore escape (`_tournamentRestoreFailures`, `_dropWedgedSpecialEntry`) + tests
4. `_tournamentRenderBusy` across the three handlers + tests
5. Keydown `canUndo` guard + `exitTournamentMode` comment + CLAUDE.md split/correction

Push with `git push -u origin g2-tournament-undo-hardening`. **No PR** (task brief).

**Process precondition (WEEKLY G4 trial):** the `dead-rules-audit` plugin's `PostToolUse` matcher is
`Edit|MultiEdit|Write`, so file changes made through Bash are invisible to it. Every file change in this
branch must go through the **Edit/Write tools**, or Friday's scorecard reads "compliant" having observed
nothing — indistinguishable from a genuine pass.
