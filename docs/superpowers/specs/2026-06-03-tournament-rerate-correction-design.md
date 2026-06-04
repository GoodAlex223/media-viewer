# Design: Tournament "Both win / Both lose" (mark-as-equal) — Group 0 part 2

**Date**: 2026-06-03
**Status**: Approved — ready for implementation plan
**Branch**: `feature/tournament-re-rate`
**Source**: 🔵 User-Flagged — [WEEKLY.md](../../planning/WEEKLY.md#L28) Group 0, part 2 (tournament), 2–3 SP; sibling of the shipped compare-correction half ([2026-05-31 spec](2026-05-31-rerate-compare-correction-design.md))
**Scope**: Tournament mode only. The compare half ("Both good / Both bad" ML correction) shipped in PR #40 and is out of scope here.

---

## 1. Summary

In tournament mode, add two buttons — **Both Win** and **Both Lose** — that let the user declare a matchup a **draw** instead of being forced to pick a winner. This is the tournament-mode sibling of the compare-mode "Both good / Both bad" feature, but it operates on the **Swiss bracket**, not the ML model (tournament mode never touches the prediction model):

- **Both Win** → both files receive +1 win and advance together (land in the same higher tier).
- **Both Lose** → neither file receives a win; both stay at their current tier.

A draw consumes the current pair exactly like a normal pick (shifts the round queue, bumps `gamesPlayed`, marks the pair as played), so round/tournament progress and completion are unaffected. Draws are recorded through the **same history + `strategyStateSnapshot` machinery** that picks use, so the existing `undo()` (Ctrl+A / "Undo last pick") reverses a draw with no new undo code.

## 2. Goals / Non-goals

**Goals**
- One-click "these two are equal" outcome in tournament mode, in both directions (both good → both win, both weak → both lose).
- Correct mis-tiering caused by being forced to pick a winner between equal files.
- Reversible via the existing tournament undo, with zero new undo logic.
- Persist automatically through the existing `.tournament_state.json` state file.

**Non-goals (explicitly out of scope)**
- ❌ **ML-model training** — tournament mode does not use the prediction model; draws only affect Swiss win-counts → tiers. (This is the key difference from compare part 1.)
- ❌ **A separate "override last pick" affordance** — the existing `undo()` already pops the last pick and restores the same pair so the user can re-pick it. No second mechanism is added.
- ❌ **Revisiting an arbitrary older pick** — in Swiss, every downstream pairing depends on prior results, so changing an old pick cannot preserve intervening picks; that collapses into multi-undo, which already exists.
- ❌ **Re-queue / rematch semantics for "Both Lose"** — both-lose leaves both files where they are; it does not re-pair them (avoids pairing-loop risk).
- ❌ New persistence files or IPC — the tournament state file already round-trips win-counts.

## 3. UX & shortcuts

### Buttons
- Two `.control-btn` buttons added to `#tournamentControls` ([index.html:255](../../index.html#L255)), adjacent to the existing `#tournamentUndoBtn`.
  - `#tournamentBothWinBtn` — icon `chevrons-up`, label "Both Win", `title="Both win — tie up (D)"`.
  - `#tournamentBothLoseBtn` — icon `chevrons-down`, label "Both Lose", `title="Both lose — tie down (F)"`.
- Label spans **must** use `<span class="btn-label">` (not a plain `<span>`) — the CSS rule `.tournament-controls .control-btn .btn-label { color: #fff; }` targets `.btn-label` specifically (gotcha from commit 9f74c64).
- **Visibility**: `#tournamentControls` lives inside `#tournamentOverlay`, which is shown only in tournament mode (`enterTournamentMode` / `_enterResumedTournamentUI` set `display:block`; exit hides it). No per-pair visibility logic is needed — the buttons appear exactly when the overlay does. The summary modal is a separate element, so the buttons are not shown on the completion screen.
- **Toast feedback**: on click, `showNotification('🤝 Both advance (tie)', 'success')` / `'👎 Both stay (tie)', 'info')`, matching the existing tournament rating UX (gated by `this.showRatingConfirmations` like the special-undo toast).

### Shortcuts
`DEFAULT_SHORTCUTS.tournament` ([media-viewer.js:4](../../media-viewer.js#L4)) gains:

| action | key | rationale |
|--------|-----|-----------|
| `bothWin` | `KeyD` | matches compare's `bothGood: 'KeyD'` muscle memory |
| `bothLose` | `KeyF` | matches compare's `bothBad: 'KeyF'` muscle memory |

Tournament's existing layout is unchanged: `leftLike: KeyQ`, `leftDislike: KeyW`, `rightLike: KeyE`, `rightDislike: KeyR`, `undo: Ctrl+KeyA`, `leftSpecial: Digit1`, `rightSpecial: Digit2`.

- `ACTION_LABELS` gains `bothWin: 'Both win (tie up)'` and `bothLose: 'Both lose (tie down)'`.
- `executeAction()` gains `bothWin: () => this.handleTournamentDraw('win')` and `bothLose: () => this.handleTournamentDraw('lose')`.
- `buildReverseMap()` already enumerates the `tournament` mode (commit c6914ef), so no mode-list change is needed; both defaults are customizable through the existing remap UI.
- **Action-name isolation**: the new action names (`bothWin`/`bothLose`) are distinct from compare's (`bothGood`/`bothBad`). `executeAction` is a single flat action→handler map, but dispatch is per-mode via `this.shortcutReverseMap[mode][keyStr]`, so pressing `D` in compare resolves to `bothGood`→`handleBothGood` (ML) and in tournament to `bothWin`→`handleTournamentDraw('win')` (Swiss). No collision.

## 4. Engine layer — `tournament-engine.js`

### `SwissStrategy.recordDraw(a, b, outcome)`
Sibling of `recordResult` ([tournament-engine.js:154](../../tournament-engine.js#L154)); `outcome ∈ {'win','lose'}`.

```javascript
recordDraw(a, b, outcome) {
    if (this.roundQueue.length === 0) {
        throw new Error('No active pair to record');
    }
    const [x, y] = this.roundQueue[0];
    const validPair = (a === x && b === y) || (a === y && b === x);
    if (!validPair) {
        throw new Error(
            `Invalid draw: expected the current pair [${x}, ${y}], got [${a}, ${b}]`
        );
    }
    this.roundQueue.shift();
    if (outcome === 'win') {
        this.winCounts.set(a, (this.winCounts.get(a) ?? 0) + 1);
        this.winCounts.set(b, (this.winCounts.get(b) ?? 0) + 1);
    }
    // outcome === 'lose' → no win-count change
    this.playedPairs.add(this._pairKey(x, y));
    this.gamesPlayed++;
}
```

Bookkeeping (`roundQueue.shift`, `playedPairs.add`, `gamesPlayed++`) is identical to `recordResult`, so `getProgress()` ("Game N/M"), `isComplete()`, `getNextPair()` round transitions, and byes all behave exactly as for a normal pick. `serialize`/`deserialize` are unchanged — `winCounts` already round-trips.

### `TournamentEngine.recordDraw(a, b, outcome)`
Mirrors `TournamentEngine.recordResult` ([tournament-engine.js:273](../../tournament-engine.js#L273)) — snapshot **before** mutation, push a history entry:

```javascript
recordDraw(a, b, outcome) {
    const snapshot = this.strategy.serialize();
    const progressBefore = this.strategy.getProgress();
    this.strategy.recordDraw(a, b, outcome);
    this.history.push({
        draw: true,
        outcome,
        a,
        b,
        round: progressBefore.round,
        gameIndex: progressBefore.gamesPlayed,
        timestamp: Date.now(),
        strategyStateSnapshot: snapshot,
        filesSnapshot: [...this.files],
    });
}
```

`undo()` is **unchanged**: it pops the last history entry and restores `strategyStateSnapshot` + `filesSnapshot`. Because the draw snapshot is captured before mutation (same as a pick), undo reverses a draw correctly with no new code. The serialized `history` carries the extra `draw`/`outcome`/`a`/`b` fields harmlessly (the spread in `serialize`/`deserialize` preserves unknown fields; nothing else reads them).

## 5. Manager layer — `tournament.js`

### `handlePairDraw(a, b, outcome)`
Mirrors `handlePairResult` ([tournament.js:32](../../tournament.js#L32)):

```javascript
async handlePairDraw(a, b, outcome) {
    if (!this.engine) return false;
    this.engine.recordDraw(a, b, outcome);
    await this._persistState(this.host.baseFolderPath);
    return true;
}
```

State persistence is automatic and identical to picks.

## 6. Renderer — `media-viewer.js`

### `handleTournamentDraw(outcome)`
Mirrors `handleTournamentPick` ([media-viewer.js:4202](../../media-viewer.js#L4202)):

```javascript
async handleTournamentDraw(outcome) {
    if (!this.isTournamentMode || !this.tournament.engine) return;
    this.signalUserActivity();
    const pair = this.tournament.engine.getCurrentPair();
    if (!pair) return;
    await this.tournament.handlePairDraw(pair.left, pair.right, outcome);
    if (this.showRatingConfirmations) {
        this.showNotification(
            outcome === 'win' ? '🤝 Both advance (tie)' : '👎 Both stay (tie)',
            outcome === 'win' ? 'success' : 'info'
        );
    }
    await this.showTournamentPair();
}
```

(Unlike `handleTournamentPick`, which shows no toast because the winning side is implicit in the click, a draw has no visible winner — the toast confirms which tie outcome was recorded. Gated on `showRatingConfirmations` like the special-undo toast.)

- **Undo**: no change. Draws are recorded only in `engine.history` (like picks), never in `moveHistory` (which holds special-folder moves). `handleTournamentUndo`'s default branch (`this.tournament.engine.undo()` + persist + `showTournamentPair`, [media-viewer.js:4256](../../media-viewer.js#L4256)) already reverses a draw. The special-move branch's `lastMove?.actionType === 'special'` guard does not match a draw, so it is correctly skipped.
- **DOM refs + listeners**: cache `this.tournamentBothWinBtn` / `this.tournamentBothLoseBtn`; attach `click` → `handleTournamentDraw('win')` / `('lose')`, alongside the existing `tournamentUndoBtn` listener ([media-viewer.js:1842](../../media-viewer.js#L1842)).
- **Shortcuts / labels / executeAction**: per §3.

## 7. Edge cases
- **Stale / double click**: `recordDraw` throws if `[a,b]` is not the current pair (same guard as `recordResult`); `handleTournamentDraw` re-reads `getCurrentPair()` immediately before the call, so the validated pair is always current.
- **Tier skew**: heavy "Both Win" fills upper tiers; heavy "Both Lose" fills lower tiers. This is the *intended* correction effect, not a bug — documented.
- **Draw on the last queued pair**: completes the round/tournament identically to a final pick → `showTournamentPair` detects `isComplete()` / null pair → summary modal.
- **File removed mid-tournament** (special move / missing file): unaffected — draws never touch files, `moveHistory`, or caches; `removeFile`/`handleResumeReconciled` paths are orthogonal.
- **Resume**: a serialized draw is just history + win-counts; `TournamentEngine.deserialize` reconstructs strategy from `strategyState` (win-counts include draw effects) and copies `history` verbatim, so a resumed tournament can still undo back through a draw.

## 8. Testing plan

**`tests/swiss-strategy.test.js`** (direct ESM import):
- `recordDraw('win')` gives both files +1 win.
- `recordDraw('lose')` changes no win-counts.
- Either outcome shifts `roundQueue`, marks `playedPairs`, increments `gamesPlayed`.
- `recordDraw` throws when `[a,b]` is not the current pair.

**`tests/tournament-engine.test.js`**:
- `recordDraw` pushes a history entry with `draw: true` and the `outcome`.
- `undo()` after a draw restores win-counts and the round queue (use a real `SwissStrategy`, or the existing `makeMockStrategy` extended with `recordDraw`/`serialize`).

**`tests/tournament-manager.test.js`**:
- `handlePairDraw` calls `engine.recordDraw(a, b, outcome)` and `writeTournamentState` (persist).
- Returns `false` with no engine.

**`tests/keyboard-shortcuts.test.js`**:
- `DEFAULT_SHORTCUTS.tournament.bothWin === 'KeyD'`, `bothLose === 'KeyF'`.
- Tournament mode has no duplicate key bindings (extend the existing no-dup invariant test to `tournament`).

**Manual smoke** (`npm start`): start a tournament on ≥4 files; press `D` (Both Win) and `F` (Both Lose); confirm progress advances, tiers update, and `Ctrl+A` undoes a draw and restores the pair.

*(E2E for tournament mode remains deferred per the existing project decision — tournament has no Playwright coverage yet; this feature follows that precedent and relies on the engine/manager unit tests + manual smoke.)*

## 9. Affected files

| File | Change |
|------|--------|
| [tournament-engine.js](../../tournament-engine.js) | `SwissStrategy.recordDraw`; `TournamentEngine.recordDraw` (undo reused, unchanged) |
| [tournament.js](../../tournament.js) | `handlePairDraw` |
| [media-viewer.js](../../media-viewer.js) | `handleTournamentDraw`; DOM refs + click listeners; `DEFAULT_SHORTCUTS.tournament` (`bothWin`/`bothLose`); `ACTION_LABELS`; `executeAction` wiring |
| [index.html](../../index.html) | Two buttons in `#tournamentControls` |
| [styles.css](../../styles.css) | Reuse `.tournament-controls .control-btn`; minor gap tweak if needed |
| [tests/swiss-strategy.test.js](../../tests/swiss-strategy.test.js) | `recordDraw` coverage |
| [tests/tournament-engine.test.js](../../tests/tournament-engine.test.js) | draw history + undo coverage |
| [tests/tournament-manager.test.js](../../tests/tournament-manager.test.js) | `handlePairDraw` coverage |
| [tests/keyboard-shortcuts.test.js](../../tests/keyboard-shortcuts.test.js) | tournament `bothWin`/`bothLose` defaults + no-dup invariant |

## 10. Alternatives considered

- **Override-last-pick affordance** — rejected; the existing `undo()` already restores the last pair for re-picking, so a second mechanism adds UI without new capability.
- **Revisit an arbitrary older pick** — rejected; Swiss downstream pairings depend on every prior result, so it cannot preserve intervening picks (collapses into multi-undo).
- **Single "tie" outcome** — rejected; loses the good/bad distinction the user wanted to mirror from compare part 1, and forces a fixed rule for what a tie does to tiers.
- **"Both Lose" re-queues the pair** — rejected; risks pairing loops and complicates round-progress math for no clear benefit; standing pat is simpler and matches WEEKLY's "neither" framing.
- **ML training in tournament** (mirror compare part 1 literally) — rejected; tournament mode is a separate Swiss-ranking mechanism that never consults the prediction model.

## 11. Open questions

None — direction (mark-as-equal, two outcomes), tier semantics (win=+1 both, lose=+0 both), shortcuts (D/F), and undo-reuse all resolved during brainstorming.
