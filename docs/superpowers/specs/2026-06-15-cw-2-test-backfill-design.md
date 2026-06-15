# Group CW-2: Test Backfill — Design Spec

**Date**: 2026-06-15
**Branch**: `cleanup/cw-2-test-backfill`
**Source**: WEEKLY.md (June 15–19 Cleanup Week), Group CW-2 — 🟤 Auto-Generated, 4 SP
**Status**: Approved

## Goal

Return the E2E suite to green and close the largest coverage hole (tournament mode has zero
Playwright coverage). Two work items plus an XS unit-assertion rider, shipped on one branch / one PR.

This is a **test-only** change: no production code in `media-viewer.js`, `tournament.js`,
`tournament-engine.js`, `index.html`, etc. is modified. If a test reveals a real product bug,
stop and surface it rather than changing product code under a backfill task.

## Constituent BACKLOG entries consumed

- 🟤 2026-06-07 (~70/100): `app-launch.test.js` asserts the hidden legacy `#viewModeBtn`.
- 🟤 2026-04-11 (XS): standardize `afterEach` to the `if (electronApp)` guard pattern.
- 🟤 2026-06-03: No E2E coverage for tournament mode incl. draw buttons.
- 🟤 2026-05-26: Phase H — E2E tests for tournament mode (deferred from the original tournament plan).
- 🟤 2026-06-03 (XS): strengthen `TournamentEngine.recordDraw` history-shape assertions.

Check off each individually at closeout.

---

## Part 1 — Fix red E2E in `app-launch.test.js` (1 SP)

The suite has been 1-red since the 3-way `#modeSelector` segmented control replaced the
binary `#viewModeBtn` (commit `acfc3b6`). `#viewModeBtn` is now permanently `display:none`
(kept only for backward-compat code refs). Two assertions still target it:

- **`loads folder and hides drop zone` test** — `expect('#viewModeBtn').toBeVisible()` is **the
  actual failure**. Re-point to `#modeSelector`. *(Confirmed: `showMedia()` sets
  `#modeSelector.style.display = 'inline-flex'`.)*
- **`shows drop zone on initial launch` test** — `expect('#viewModeBtn').toBeHidden()` currently
  passes vacuously. Re-point to `#modeSelector` so it exercises the live control. *(Confirmed:
  `index.html` declares `#modeSelector` with inline `style="display: none"`.)*

**Rider (BACKLOG 2026-04-11):** wrap the unconditional `await closeApp(electronApp)` in the
`afterEach` with `if (electronApp)`, matching the guard pattern used by every other E2E file
(prevents a `TypeError` masking the real failure if `beforeEach` throws mid-setup).

**Acceptance:** the full E2E suite passes with no known-red case; both `app-launch` assertions
now reference `#modeSelector`.

---

## Part 2 — New `tests/e2e/tournament-mode.test.js` (3 SP)

Authored via the project's `new-e2e-test` skill. **Driving style: hybrid** (user-chosen) —
real config-modal entry, real keyboard for shortcut-dispatch, real button clicks for draw
buttons, real disk assertions for Apply, real IPC round-trip for resume; `page.evaluate` only
for state setup and reads. This mirrors `compare-mode.test.js`, where the media-container
overlay forces `page.evaluate` for controls behind it but modal/overlay buttons are clickable.

### Shared helper

```
enterAndStartTournament(page, { rounds })
```
1. `page.evaluate(() => window.mediaViewer.switchMode('tournament'))` — with no saved disk
   state this opens `#tournamentConfigModal`.
2. Fill `#tournamentRoundsSelect` with `rounds`.
3. Click `#tournamentConfigStart` (modal button, on top of the overlay → clickable).
4. Wait for the first pair: `page.waitForFunction(() => window.mediaViewer.isTournamentMode
   && !window.mediaViewer.isLoading)` and `.left-media-wrapper` visible.

Folders are created with `createTempFixtureDir([...])`; `seedLocalStorage` is used where a test
needs it. Tournament Q/W/E/R picks are reinterpreted as winner-picks (they do **not** move files
to like/dislike folders), so no like/dislike seeding is required for picks. Temp-dir cleanup
(`rm` recursive) handles the new `_Tier-N/` subdirs created by Apply.

### Tests (5)

1. **Happy path → Apply moves files into `_Tier-N/`** (2 files, `rounds=1`)
   - `enterAndStartTournament({ rounds: 1 })`; assert `isTournamentMode`, `#tournamentOverlay`
     visible, progress text present.
   - Capture the current pair (`engine.getCurrentPair()` left/right basenames).
   - Press real keyboard `q` (left-like → left wins) → tournament completes (1 game) →
     `#tournamentSummaryModal` visible.
   - Click `#tournamentSummaryApply`; wait for folder reload + single mode
     (`!isTournamentMode`, `#modeSelector` visible).
   - Assert on disk: winner (left) is in `<dir>/_Tier-1/`, loser (right) is in `<dir>/_Tier-0/`.
     *(Exact-dir assertion per approved design: winCount→tier mapping with `rounds=1` puts the
     1-win file in tier 1 and the 0-win file in tier 0.)*
   - **Integration value:** keyboard reverse-map dispatch + `applyTournamentResults` IPC +
     real file moves end-to-end.

2. **Both Win draw button records a draw** (2 files, `rounds=1`)
   - `enterAndStartTournament({ rounds: 1 })`; click `#tournamentBothWinBtn`.
   - Assert `engine.history[0]` is `{ draw: true, outcome: 'win' }` and both files'
     `winCounts === 1`.

3. **Both Lose via keyboard `f` records a draw** (2 files, `rounds=1`)
   - `enterAndStartTournament({ rounds: 1 })`; press real keyboard `f`.
   - Assert `engine.history[0]` is `{ draw: true, outcome: 'lose' }` and both files'
     `winCounts === 0`.
   - *(Tests 2 + 3 together cover both the button-click and keyboard-dispatch draw paths.)*

4. **Ctrl+A undo restores the pair** (4 files, `rounds=2`)
   - `enterAndStartTournament({ rounds: 2 })`; capture the current pair.
   - Press `q` to pick a winner → `engine.history.length === 1`, pair advances.
   - Press `Control+a` (undo) → `engine.history.length === 0` and `engine.getCurrentPair()`
     equals the originally-captured pair (compare as a sorted left/right set); still
     `isTournamentMode === true`.

5. **Leave-prompt Save & re-enter Continue** (4 files, `rounds=2`)
   - `enterAndStartTournament({ rounds: 2 })`; press `q` once so there is progress.
   - `page.evaluate(() => window.mediaViewer.switchMode('single'))` → incomplete tournament
     active → `#tournamentResumeModal` shown with title "Leave tournament?".
   - Click `#tournamentResumeAccept` ("Save & leave"); assert
     `readTournamentState(baseFolderPath)` is non-null and `isTournamentMode === false`.
   - `page.evaluate(() => window.mediaViewer.switchMode('tournament'))` → disk state exists →
     Continue prompt (`#tournamentResumeModal`) shown.
   - Click `#tournamentResumeAccept` ("Continue"); assert `isTournamentMode === true`,
     `tournament.engine` non-null, and `engine.history.length` preserved (=== 1).
   - **Integration value:** the `writeTournamentState` → `readTournamentState` IPC round-trip
     and reconciled resume.

### Robustness notes

- Assert engine/persistence **state**, never toasts — the draw confirmation toast is gated on
  the `showRatingConfirmations` setting and would couple tests to it.
- Use `page.waitForFunction(() => !window.mediaViewer.isLoading)` before actions that depend on
  a prior `showCompareMedia()`/`showTournamentPair()` having settled (established pattern in
  `compare-mode.test.js`).
- `afterEach` guards: `if (electronApp)` and `if (tmpFixtures)` per the project convention.

---

## Part 3 — Strengthen `recordDraw` unit assertions (XS rider)

In `tests/tournament-engine.test.js`, `describe('TournamentEngine.recordDraw')`:

- **History-shape test** ("pushes a draw history entry…"): add
  `expect(eng.history[0].filesSnapshot).toBeTruthy()`. *(Confirmed: `TournamentEngine.recordDraw`
  pushes `filesSnapshot: [...this.files]`, mirroring `recordResult`; undo relies on it.)*
- **Undo test** ("undo() after a draw restores win counts…"): add
  `expect(eng.strategy.winCounts.get(pair.right)).toBe(1)` **before** the `undo()` call, making
  the pre-undo assertion symmetric with the existing `pair.left` check (currently only `pair.left`
  is asserted pre-undo; both are already asserted `=== 0` post-undo).

No new unit test cases — two added assertions to existing cases.

---

## Verification

- `npm test` (Vitest): **326 → 326 unit** counts unchanged at the case level (2 assertions added
  to existing cases, not new `it()` blocks).
- `npm run test:e2e` (Playwright): **+5 new tournament E2E**; full suite returns to **green**
  (the previously-known `#viewModeBtn` red is fixed in Part 1).
- ESLint clean (`npm run lint`).

## Out of scope

- No production-code changes. A genuine product bug surfaced by a new test is escalated to the
  user, not patched here.
- The JXL error-path test backfill (`372ea10` hardening) is a separate BACKLOG item and a
  Friday pull-in candidate, not part of CW-2.
- Tournament E2E for AI-seeding, odd-N byes, or multi-round tier convergence beyond what the
  4 planned scenarios require — deferred (cover the cited scenarios only).
