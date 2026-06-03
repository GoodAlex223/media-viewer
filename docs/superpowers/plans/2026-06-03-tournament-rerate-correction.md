# Tournament Re-rate (Mark-as-Equal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Both Win / Both Lose" draw buttons to tournament mode so the user can declare a matchup a tie instead of being forced to pick a winner.

**Architecture:** A new `recordDraw(a, b, outcome)` on `SwissStrategy` (win=+1 both, lose=+0 both) and a matching `TournamentEngine.recordDraw` that takes the same pre-mutation `strategyStateSnapshot` a pick takes — so the existing `undo()` reverses a draw with no new code. `TournamentManager.handlePairDraw` persists via the existing `.tournament_state.json` path. The renderer adds `handleTournamentDraw(outcome)`, two buttons in the tournament overlay, and `D`/`F` shortcuts. No ML, no new IPC, no persistence-format changes.

**Tech Stack:** Pure ESM `tournament-engine.js` / `tournament.js` (direct Vitest `import`); vanilla-JS renderer `media-viewer.js` (no bundler); Vitest unit tests; Electron overlay UI.

**Spec:** [docs/superpowers/specs/2026-06-03-tournament-rerate-correction-design.md](../specs/2026-06-03-tournament-rerate-correction-design.md)

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `tournament-engine.js` | `SwissStrategy.recordDraw` (win-count effect) + `TournamentEngine.recordDraw` (history + snapshot) | Modify (2 methods) |
| `tournament.js` | `TournamentManager.handlePairDraw` (record + persist) | Modify (1 method) |
| `media-viewer.js` | `handleTournamentDraw`; `DEFAULT_SHORTCUTS.tournament` + `ACTION_LABELS` + `executeAction` entries; DOM refs + click listeners | Modify (multiple sites) |
| `index.html` | Two buttons in `#tournamentControls` | Modify (~L259) |
| `styles.css` | Optional gap tweak (reuses `.tournament-controls .control-btn`) | Modify (append, only if needed) |
| `tests/swiss-strategy.test.js` | `recordDraw` unit coverage | Modify (append describe) |
| `tests/tournament-engine.test.js` | draw history + undo-after-draw coverage | Modify (append describe) |
| `tests/tournament-manager.test.js` | `handlePairDraw` coverage | Modify (append describe) |
| `tests/keyboard-shortcuts.test.js` | tournament `bothWin`/`bothLose` defaults + no-dup invariant | Modify (append tests) |

---

## Task 1: `SwissStrategy.recordDraw`

**Files:**
- Modify: `tournament-engine.js` (after `recordResult`, which ends at L169)
- Test: `tests/swiss-strategy.test.js`

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `tests/swiss-strategy.test.js`:

```javascript
describe('SwissStrategy.recordDraw', () => {
    it("'win' gives both files +1 win and consumes the pair", () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });
        const [a, b] = s.getNextPair();

        s.recordDraw(a, b, 'win');

        expect(s.winCounts.get(a)).toBe(1);
        expect(s.winCounts.get(b)).toBe(1);
        expect(s.gamesPlayed).toBe(1);
        expect(s.playedPairs.has(s._pairKey(a, b))).toBe(true);
        // pair consumed → next pair excludes a and b
        const [c, d] = s.getNextPair();
        expect([a, b]).not.toContain(c);
        expect([a, b]).not.toContain(d);
    });

    it("'lose' changes no win counts but still consumes the pair", () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], { rounds: 3 });
        const [a, b] = s.getNextPair();

        s.recordDraw(a, b, 'lose');

        expect(s.winCounts.get(a)).toBe(0);
        expect(s.winCounts.get(b)).toBe(0);
        expect(s.gamesPlayed).toBe(1);
        expect(s.playedPairs.has(s._pairKey(a, b))).toBe(true);
    });

    it('throws when the pair is not the current pair', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg'], { rounds: 1 });
        const [a, b] = s.getNextPair();
        expect(() => s.recordDraw(a, a, 'win')).toThrow();
        expect(() => s.recordDraw('not-in-pair.jpg', b, 'win')).toThrow();
    });

    it('throws when there is no active pair', () => {
        const s = new SwissStrategy();
        s.init(['a.jpg', 'b.jpg'], { rounds: 1 });
        s.recordResult(...s.getNextPair());
        // round 1 exhausted, rounds=1 → no next pair
        expect(() => s.recordDraw('a.jpg', 'b.jpg', 'win')).toThrow('No active pair to record');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/swiss-strategy.test.js -t "recordDraw"`
Expected: FAIL with `s.recordDraw is not a function`.

- [ ] **Step 3: Add the `recordDraw` method**

In `tournament-engine.js`, insert immediately after the `recordResult` method (after its closing `}` at L169, before `removeFile`):

```javascript
    recordDraw(a, b, outcome) {
        if (this.roundQueue.length === 0) {
            throw new Error('No active pair to record');
        }
        const [x, y] = this.roundQueue[0];
        const validPair = (a === x && b === y) || (a === y && b === x);
        if (!validPair) {
            throw new Error(`Invalid draw: expected the current pair [${x}, ${y}], got [${a}, ${b}]`);
        }
        this.roundQueue.shift();
        if (outcome === 'win') {
            this.winCounts.set(a, (this.winCounts.get(a) ?? 0) + 1);
            this.winCounts.set(b, (this.winCounts.get(b) ?? 0) + 1);
        }
        // outcome === 'lose' → neither file gains a win
        this.playedPairs.add(this._pairKey(x, y));
        this.gamesPlayed++;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/swiss-strategy.test.js -t "recordDraw"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament-engine.js tests/swiss-strategy.test.js
git commit -m "feat(tournament): SwissStrategy.recordDraw (win=+1 both, lose=+0 both)"
```

---

## Task 2: `TournamentEngine.recordDraw` + undo reuse

**Files:**
- Modify: `tournament-engine.js` (after `TournamentEngine.recordResult`, which ends at L289, before `undo()` at L291)
- Test: `tests/tournament-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `tests/tournament-engine.test.js` (uses the real `SwissStrategy`, already imported at the top of the file):

```javascript
describe('TournamentEngine.recordDraw', () => {
    it('pushes a draw history entry with outcome and a snapshot', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), { rounds: 1 });
        const pair = eng.getCurrentPair();
        eng.recordDraw(pair.left, pair.right, 'win');

        expect(eng.history.length).toBe(1);
        expect(eng.history[0].draw).toBe(true);
        expect(eng.history[0].outcome).toBe('win');
        expect(eng.history[0].a).toBe(pair.left);
        expect(eng.history[0].b).toBe(pair.right);
        expect(eng.history[0].strategyStateSnapshot).toBeTruthy();
        expect(eng.strategy.winCounts.get(pair.left)).toBe(1);
        expect(eng.strategy.winCounts.get(pair.right)).toBe(1);
    });

    it('undo() after a draw restores win counts and the round queue', () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'], new SwissStrategy(), { rounds: 3 });
        const pair = eng.getCurrentPair();
        eng.recordDraw(pair.left, pair.right, 'win');
        expect(eng.strategy.winCounts.get(pair.left)).toBe(1);
        expect(eng.strategy.gamesPlayed).toBe(1);

        eng.undo();

        expect(eng.history.length).toBe(0);
        expect(eng.strategy.winCounts.get(pair.left)).toBe(0);
        expect(eng.strategy.winCounts.get(pair.right)).toBe(0);
        expect(eng.strategy.gamesPlayed).toBe(0);
        // the same pair is current again
        const again = eng.getCurrentPair();
        expect([again.left, again.right].sort()).toEqual([pair.left, pair.right].sort());
    });

    it("'lose' draw then undo leaves all win counts at zero throughout", () => {
        const eng = new TournamentEngine(['a.jpg', 'b.jpg'], new SwissStrategy(), { rounds: 1 });
        const pair = eng.getCurrentPair();
        eng.recordDraw(pair.left, pair.right, 'lose');
        expect(eng.strategy.winCounts.get(pair.left)).toBe(0);
        eng.undo();
        expect(eng.strategy.winCounts.get(pair.left)).toBe(0);
        expect(eng.history.length).toBe(0);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tournament-engine.test.js -t "recordDraw"`
Expected: FAIL with `eng.recordDraw is not a function`.

- [ ] **Step 3: Add the `recordDraw` method**

In `tournament-engine.js`, insert immediately after `TournamentEngine.recordResult` (after its closing `}` at L289, before `undo()` at L291). Note: `undo()` itself needs **no change** — it restores `strategyStateSnapshot` + `filesSnapshot`, which a draw provides exactly like a pick.

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
            // Mirror recordResult: capture engine.files so undo() can rewind a removeFile()
            // that happened between picks.
            filesSnapshot: [...this.files],
        });
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tournament-engine.test.js -t "recordDraw"`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the engine suites to confirm no regression**

Run: `npx vitest run tests/tournament-engine.test.js tests/swiss-strategy.test.js tests/integration/tournament-flow.test.js`
Expected: PASS (all green).

- [ ] **Step 6: Commit**

```bash
git add tournament-engine.js tests/tournament-engine.test.js
git commit -m "feat(tournament): TournamentEngine.recordDraw with snapshot (undo reused)"
```

---

## Task 3: `TournamentManager.handlePairDraw`

**Files:**
- Modify: `tournament.js` (after `handlePairResult`, which ends at L37)
- Test: `tests/tournament-manager.test.js`

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `tests/tournament-manager.test.js` (the file's `makeHost` helper and `window.electronAPI` mock in `beforeEach` already provide `writeTournamentState`):

```javascript
describe('TournamentManager.handlePairDraw', () => {
    it('records the draw and persists state', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        await tm.handleStartClick('/test/folder', 1);

        const pair = tm.engine.getCurrentPair();
        const ok = await tm.handlePairDraw(pair.left, pair.right, 'win');

        expect(ok).toBe(true);
        expect(tm.engine.history.length).toBe(1);
        expect(tm.engine.history[0].draw).toBe(true);
        expect(tm.engine.history[0].outcome).toBe('win');
        // once on start, once on the draw
        expect(globalThis.window.electronAPI.writeTournamentState).toHaveBeenCalledTimes(2);
    });

    it('returns false when there is no engine', async () => {
        const host = makeHost(['a.jpg', 'b.jpg']);
        const tm = new TournamentManager(host);
        const ok = await tm.handlePairDraw('a.jpg', 'b.jpg', 'lose');
        expect(ok).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tournament-manager.test.js -t "handlePairDraw"`
Expected: FAIL with `tm.handlePairDraw is not a function`.

- [ ] **Step 3: Add the `handlePairDraw` method**

In `tournament.js`, insert immediately after `handlePairResult` (after its closing `}` at L37, before `handleApply`):

```javascript
    async handlePairDraw(a, b, outcome) {
        if (!this.engine) return false;
        this.engine.recordDraw(a, b, outcome);
        await this._persistState(this.host.baseFolderPath);
        return true;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/tournament-manager.test.js -t "handlePairDraw"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tournament.js tests/tournament-manager.test.js
git commit -m "feat(tournament): TournamentManager.handlePairDraw (record + persist)"
```

---

## Task 4: Shortcuts, labels, dispatch + `handleTournamentDraw`

**Files:**
- Modify: `media-viewer.js` `DEFAULT_SHORTCUTS.tournament` (~L23-33), `ACTION_LABELS` (~L36-50), `executeAction` (~L8426-8450), and add `handleTournamentDraw` near `handleTournamentPick` (~L4207)
- Test: `tests/keyboard-shortcuts.test.js`

- [ ] **Step 1: Write the failing tests**

Append two tests inside the existing `describe('DEFAULT_SHORTCUTS', ...)` block in `tests/keyboard-shortcuts.test.js` (after the "compare mode has no duplicate key bindings" test at L72):

```javascript
    it('tournament mode includes bothWin=D and bothLose=F', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.tournament.bothWin).toBe('KeyD');
        expect(shortcuts.tournament.bothLose).toBe('KeyF');
    });

    it('tournament mode has no duplicate key bindings', () => {
        const shortcuts = extractDefaultShortcuts();
        const keys = Object.values(shortcuts.tournament);
        expect(new Set(keys).size).toBe(keys.length);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/keyboard-shortcuts.test.js -t "DEFAULT_SHORTCUTS"`
Expected: FAIL (`shortcuts.tournament.bothWin` is `undefined`).

- [ ] **Step 3: Add the two tournament shortcut defaults**

In `media-viewer.js`, in the `DEFAULT_SHORTCUTS.tournament` block, add two entries after `rightDislike: 'KeyR',` (L29):

```javascript
        rightDislike: 'KeyR',
        bothWin: 'KeyD',
        bothLose: 'KeyF',
```

(Resulting tournament keys: Q, W, E, R, D, F, Ctrl+A, Digit1, Digit2 — all unique.)

- [ ] **Step 4: Add the action labels**

In `ACTION_LABELS` (~L36), add two entries after `bothBad: 'Both media bad',` (L49):

```javascript
    bothWin: 'Both win (tie up)',
    bothLose: 'Both lose (tie down)',
```

- [ ] **Step 5: Wire dispatch in `executeAction`**

In `executeAction()`, add two entries to the `actions` map after `bothBad: () => this.handleBothBad(),` (L8443):

```javascript
            bothWin: () => this.handleTournamentDraw('win'),
            bothLose: () => this.handleTournamentDraw('lose'),
```

(Dispatch is per-mode via `this.shortcutReverseMap[mode][keyStr]`, so `D` resolves to `bothGood`→`handleBothGood` in compare and `bothWin`→`handleTournamentDraw('win')` in tournament — no collision.)

- [ ] **Step 6: Add the `handleTournamentDraw` method**

In `media-viewer.js`, insert immediately after `handleTournamentPick` (after its closing `}` at ~L4207, before `handleTournamentUndo` at ~L4209):

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

- [ ] **Step 7: Run the tests + lint**

Run: `npx vitest run tests/keyboard-shortcuts.test.js && npm run lint`
Expected: PASS (new shortcut tests green; lint clean — `handleTournamentDraw` has no unused vars).

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js
git commit -m "feat(tournament): bothWin/bothLose shortcuts + handleTournamentDraw dispatch"
```

---

## Task 5: Buttons, DOM refs, listeners, manual smoke

**Files:**
- Modify: `index.html` (`#tournamentControls`, ~L259)
- Modify: `media-viewer.js` (tournament button listener block, ~L1842-1845)
- Modify: `styles.css` (only if a gap tweak is needed)

No unit test (DOM wiring + an overlay-only method, consistent with the untested `handleTournamentPick`/`handleTournamentUndo`); verified by lint, the full suite, and manual smoke. Engine/manager behavior is already covered by Tasks 1-3.

- [ ] **Step 1: Add the two buttons in `index.html`**

Inside `#tournamentControls`, immediately after the `#tournamentUndoBtn` button's closing `</button>` (L259) and before the `</div>` that closes `#tournamentControls` (L260), insert:

```html
                    <button class="control-btn" id="tournamentBothWinBtn" title="Both win — tie up (D)">
                        <span class="btn-icon"><i data-lucide="chevrons-up"></i></span>
                        <span class="btn-label">Both Win</span>
                    </button>
                    <button class="control-btn" id="tournamentBothLoseBtn" title="Both lose — tie down (F)">
                        <span class="btn-icon"><i data-lucide="chevrons-down"></i></span>
                        <span class="btn-label">Both Lose</span>
                    </button>
```

(Label spans MUST be `<span class="btn-label">` — the rule `.tournament-controls .control-btn .btn-label { color: #fff; }` targets `.btn-label`; a plain `<span>` renders unreadably dark.)

- [ ] **Step 2: Attach click listeners**

In `media-viewer.js`, immediately after the existing `tournamentUndoBtn` listener block (which ends with its closing `}` at ~L1845), add:

```javascript
        const tournamentBothWinBtn = document.getElementById('tournamentBothWinBtn');
        if (tournamentBothWinBtn) {
            tournamentBothWinBtn.addEventListener('click', () => this.handleTournamentDraw('win'));
        }
        const tournamentBothLoseBtn = document.getElementById('tournamentBothLoseBtn');
        if (tournamentBothLoseBtn) {
            tournamentBothLoseBtn.addEventListener('click', () => this.handleTournamentDraw('lose'));
        }
```

- [ ] **Step 3: Lint + full unit suite**

Run: `npm run lint && npm test`
Expected: PASS (lint clean; all unit tests green — total rises by the 11 tests added in Tasks 1-4, i.e. 264 → 275).

- [ ] **Step 4: Manual smoke test**

Run: `npm start`. Load a folder with ≥4 media, switch to **Tournament** mode (`#modeBtnTournament`), start a tournament. Verify:
- **Both Win** and **Both Lose** buttons appear in the tournament overlay controls (white labels, readable) next to Undo.
- Clicking **Both Win** advances to the next pair and shows the "🤝 Both advance (tie)" toast (if rating confirmations are on); progress "Game N/M" increments; tier breakdown reflects both files moving up.
- Clicking **Both Lose** advances with the "👎 Both stay (tie)" toast; tiers unchanged for that pair.
- Pressing `D` / `F` triggers Both Win / Both Lose; `Ctrl+A` (Undo) reverses the last draw and re-shows the same pair.
- Buttons are absent in single and compare modes (overlay hidden).

- [ ] **Step 5: Commit**

```bash
git add index.html media-viewer.js styles.css
git commit -m "feat(tournament): Both Win/Both Lose overlay buttons + listeners"
```

---

## Self-Review

**1. Spec coverage**
- §4 `SwissStrategy.recordDraw` (win/lose semantics, pair guard) → Task 1. ✓
- §4 `TournamentEngine.recordDraw` (snapshot + history; undo reused) → Task 2. ✓
- §5 `TournamentManager.handlePairDraw` (record + persist) → Task 3. ✓
- §3 shortcuts (`bothWin`/`bothLose` = D/F), `ACTION_LABELS`, `executeAction` → Task 4. ✓
- §6 `handleTournamentDraw` (guard, toast, advance) + undo-no-change note → Task 4 (method) + Task 5 (verified in smoke). ✓
- §3 buttons in `#tournamentControls` + `.btn-label` contract + visibility-via-overlay → Task 5. ✓
- §8 testing plan (swiss/engine/manager/keyboard units + manual smoke; E2E deferred) → Tasks 1-5. ✓

**2. Placeholder scan:** No `TBD`/`TODO`/"add error handling"/"write tests for the above" — every code and test step contains complete code. ✓

**3. Type / name consistency:**
- `recordDraw(a, b, outcome)` signature identical across `SwissStrategy` (Task 1), `TournamentEngine` (Task 2). ✓
- `handlePairDraw(a, b, outcome)` (Task 3) → called by `handleTournamentDraw` (Task 4) with `(pair.left, pair.right, outcome)`. ✓
- `outcome` values `'win'`/`'lose'` consistent: engine win-count branch (Task 1), shortcut/executeAction dispatch (Task 4 `('win')`/`('lose')`), button listeners (Task 5). ✓
- Action names `bothWin`/`bothLose` consistent across `DEFAULT_SHORTCUTS.tournament`, `ACTION_LABELS`, `executeAction` (Task 4). ✓
- DOM ids `tournamentBothWinBtn`/`tournamentBothLoseBtn` consistent between `index.html` (Task 5 Step 1) and listeners (Task 5 Step 2). ✓
- `this.showRatingConfirmations`, `this.signalUserActivity`, `this.showTournamentPair`, `this.tournament.engine.getCurrentPair` — all pre-existing on `MediaViewer` / engine. ✓

**Known pre-existing limitation (out of scope):** `saveShortcut()` persists only `single` + `compare` modes, so tournament remaps (including these new defaults) aren't saved across sessions. This is an existing BACKLOG item ("store only shortcut deltas + persist tournament mode") and is not addressed here — the `D`/`F` defaults always apply regardless.

---

## Notes

- **Commit hygiene:** every commit runs the pre-commit hook (ESLint + Prettier on staged JS, then `npx vitest run`). Each task ends green.
- **Undo is free:** draws are recorded only in `engine.history` (never `moveHistory`), so `handleTournamentUndo`'s default branch (`engine.undo()`) reverses them; the `lastMove?.actionType === 'special'` guard correctly skips draws.
- **No persistence change:** a serialized draw is just `history` + `winCounts`, both already round-tripped by `serialize`/`deserialize`; resumed tournaments can undo back through a draw.
```
