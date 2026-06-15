# Group CW-2: Test Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return the E2E suite to green (fix the stale `#viewModeBtn` assertion) and add the first Playwright coverage for tournament mode, plus strengthen two `recordDraw` unit assertions.

**Architecture:** Test-only change. No production code in `media-viewer.js`, `tournament.js`, `tournament-engine.js`, `index.html`, etc. is modified. The new tournament E2E file uses **hybrid driving**: real config-modal entry, real keyboard for shortcut dispatch (Q pick, F draw, Ctrl+A undo), real button clicks for draw/apply, real disk assertions for Apply, real IPC round-trip for resume; `page.evaluate` only for state setup and reads. Mirrors `tests/e2e/compare-mode.test.js`.

**Tech Stack:** Vitest (unit), Playwright + Electron (E2E), existing helpers in `tests/e2e/helpers/electron-app.js`.

**Hard rule:** If any new E2E test fails for a *product* reason (not a test-authoring mistake), STOP and surface the bug — do not patch product code under this backfill.

**Spec:** `docs/superpowers/specs/2026-06-15-cw-2-test-backfill-design.md`

---

## File Structure

- **Modify** `tests/tournament-engine.test.js` — strengthen 2 existing `recordDraw` assertions (Task 1).
- **Modify** `tests/e2e/app-launch.test.js` — re-point 2 `#viewModeBtn` assertions to `#modeSelector` + `afterEach` guard (Task 2).
- **Create** `tests/e2e/tournament-mode.test.js` — 5 hybrid-driven tournament E2E tests + a local `enterAndStartTournament` helper (Tasks 3–6).

Verified facts the test code relies on (do not re-derive):
- `engine.files` and `getCurrentPair()` use **full paths** (`mediaFiles.map(f => f.path)`); basenames via `p.split(/[\\/]/).pop()`.
- `getTier(file) = winCounts.get(file) ?? 0`; `rounds=1` → winner (1 win) lands in `_Tier-1/`, loser (0 wins) in `_Tier-0/`.
- `window.electronAPI.readTournamentState(folder)` returns `{ success, state }` (state non-null when a tournament is saved).
- Keyboard: `q` = left-like = left wins; `f` = Both Lose draw; `Control+a` = tournament undo. The document keydown handler has **no input-target guard** (works regardless of focus), but the helper blurs focus defensively.
- `#modeSelector` starts `display:none` and `showMedia()` sets it to `inline-flex`.
- Leave prompt and Continue prompt reuse `#tournamentResumeModal` / `#tournamentResumeAccept`; titles are `'Leave tournament?'` and `'Resume tournament?'`.

---

## Task 1: Strengthen `recordDraw` unit assertions

**Files:**
- Modify: `tests/tournament-engine.test.js` (inside `describe('TournamentEngine.recordDraw')`, ~lines 202–245)

- [ ] **Step 1: Add `filesSnapshot` assertion to the history-shape test**

In the test `it('pushes a draw history entry with outcome and a snapshot', …)`, find this line:

```js
        expect(eng.history[0].strategyStateSnapshot).toBeTruthy();
```

Add immediately after it:

```js
        expect(eng.history[0].filesSnapshot).toBeTruthy();
```

- [ ] **Step 2: Add symmetric pre-undo `pair.right` win-count assertion**

In the test `it('undo() after a draw restores win counts and the round queue', …)`, find these two lines:

```js
        eng.recordDraw(pair.left, pair.right, 'win');
        expect(eng.strategy.winCounts.get(pair.left)).toBe(1);
```

Add a third line directly after them (making the pre-undo check symmetric for both files):

```js
        expect(eng.strategy.winCounts.get(pair.right)).toBe(1);
```

- [ ] **Step 3: Run the unit file to verify it passes**

Run: `npx vitest run tests/tournament-engine.test.js`
Expected: PASS — `17 tests` (assertions added to existing cases; no new `it()` blocks).

- [ ] **Step 4: Run the full unit suite to confirm no regression**

Run: `npm test`
Expected: PASS — `326 passed (326)`.

- [ ] **Step 5: Commit**

```bash
git add tests/tournament-engine.test.js
git commit -m "test(tournament-engine): strengthen recordDraw history-shape assertions"
```

---

## Task 2: Fix red E2E in `app-launch.test.js`

**Files:**
- Modify: `tests/e2e/app-launch.test.js`

- [ ] **Step 1: Guard the `afterEach` close call**

Replace this block:

```js
    test.afterEach(async () => {
        await closeApp(electronApp);
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });
```

with:

```js
    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });
```

- [ ] **Step 2: Re-point the initial-launch assertion to `#modeSelector`**

In the test `'shows drop zone on initial launch'`, replace:

```js
        await expect(page.locator('#viewModeBtn')).toBeHidden();
```

with:

```js
        await expect(page.locator('#modeSelector')).toBeHidden();
```

- [ ] **Step 3: Re-point the loaded-folder assertion to `#modeSelector`**

In the test `'loads folder and hides drop zone'`, replace:

```js
        await expect(page.locator('#viewModeBtn')).toBeVisible();
```

with:

```js
        await expect(page.locator('#modeSelector')).toBeVisible();
```

- [ ] **Step 4: Run the file to verify all its tests pass**

Run: `npx playwright test app-launch.test.js`
Expected: PASS — all 5 tests in the file green (previously 1 was red on the `#viewModeBtn` visible assertion).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/app-launch.test.js
git commit -m "test(e2e): re-point app-launch assertions from legacy #viewModeBtn to #modeSelector"
```

---

## Task 3: Scaffold `tournament-mode.test.js` + happy-path Apply test

**Files:**
- Create: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Write the file with imports, suite scaffold, helper, and Test 1**

Create `tests/e2e/tournament-mode.test.js` with exactly this content:

```js
import { test, expect } from '@playwright/test';
import { access } from 'fs/promises';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';

/**
 * Enter tournament mode through the real config modal and start a tournament.
 * Hybrid driving: switchMode + modal interaction are real; waits are state-based.
 */
async function enterAndStartTournament(page, { rounds }) {
    // No saved state for a fresh temp folder → the config modal (not the continue prompt).
    await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
    await expect(page.locator('#tournamentConfigModal')).toBeVisible();

    await page.locator('#tournamentRoundsSelect').fill(String(rounds));
    await page.locator('#tournamentConfigStart').click();

    // Wait until the first pair is rendered and the app is idle.
    await page.waitForFunction(
        () =>
            window.mediaViewer.isTournamentMode &&
            window.mediaViewer.tournament.engine &&
            !window.mediaViewer.isLoading
    );
    await expect(page.locator('.left-media-wrapper')).toBeVisible();

    // The config modal focused #tournamentRoundsSelect; drop focus so subsequent
    // page.keyboard presses are not absorbed by the (now hidden) number input.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
}

test.describe('Tournament Mode', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        ({ electronApp, page } = await launchApp());
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    test('completes a 2-file tournament and Apply moves files into _Tier-N folders', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 1 });
        await expect(page.locator('#tournamentOverlay')).toBeVisible();

        // Capture the current pair. 'q' (left-like) makes the LEFT file the winner.
        const { winnerName, loserName } = await page.evaluate(() => {
            const pair = window.mediaViewer.tournament.engine.getCurrentPair();
            const base = (p) => p.split(/[\\/]/).pop();
            return { winnerName: base(pair.left), loserName: base(pair.right) };
        });

        // One pick completes a rounds=1, 2-file tournament → summary modal.
        await page.keyboard.press('q');
        await expect(page.locator('#tournamentSummaryModal')).toBeVisible();

        // Apply moves files into tier folders, then reloads + returns to single mode.
        await page.locator('#tournamentSummaryApply').click();
        await page.waitForFunction(() => !window.mediaViewer.isTournamentMode);

        // Winner (1 win) → _Tier-1; loser (0 wins) → _Tier-0.
        await expect(access(join(tmpFixtures.dir, '_Tier-1', winnerName))).resolves.toBeUndefined();
        await expect(access(join(tmpFixtures.dir, '_Tier-0', loserName))).resolves.toBeUndefined();
    });
});
```

- [ ] **Step 2: Run the new test to verify it passes**

Run: `npx playwright test tournament-mode.test.js`
Expected: PASS — 1 test. (If it fails on a selector/timing issue, fix the test. If it fails because files did NOT move to `_Tier-N/`, that is a product bug — STOP and surface it.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(e2e): add tournament happy-path Apply -> _Tier-N coverage"
```

---

## Task 4: Draw-button tests (Both Win click + Both Lose keyboard)

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Add both draw tests inside the `describe` block**

Insert these two tests after the happy-path test (before the closing `});` of the `describe`):

```js
    test('Both Win button records a win-win draw', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 1 });

        const pair = await page.evaluate(() => {
            const p = window.mediaViewer.tournament.engine.getCurrentPair();
            return { left: p.left, right: p.right };
        });

        await page.locator('#tournamentBothWinBtn').click();
        await page.waitForFunction(() => window.mediaViewer.tournament.engine?.history.length > 0);

        const draw = await page.evaluate((pr) => {
            const eng = window.mediaViewer.tournament.engine;
            return {
                isDraw: eng.history[0].draw,
                outcome: eng.history[0].outcome,
                leftWins: eng.strategy.winCounts.get(pr.left) ?? 0,
                rightWins: eng.strategy.winCounts.get(pr.right) ?? 0,
            };
        }, pair);

        expect(draw.isDraw).toBe(true);
        expect(draw.outcome).toBe('win');
        expect(draw.leftWins).toBe(1);
        expect(draw.rightWins).toBe(1);
    });

    test('Both Lose via keyboard records a lose-lose draw', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 1 });

        const pair = await page.evaluate(() => {
            const p = window.mediaViewer.tournament.engine.getCurrentPair();
            return { left: p.left, right: p.right };
        });

        await page.keyboard.press('f');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine?.history.length > 0);

        const draw = await page.evaluate((pr) => {
            const eng = window.mediaViewer.tournament.engine;
            return {
                isDraw: eng.history[0].draw,
                outcome: eng.history[0].outcome,
                leftWins: eng.strategy.winCounts.get(pr.left) ?? 0,
                rightWins: eng.strategy.winCounts.get(pr.right) ?? 0,
            };
        }, pair);

        expect(draw.isDraw).toBe(true);
        expect(draw.outcome).toBe('lose');
        expect(draw.leftWins).toBe(0);
        expect(draw.rightWins).toBe(0);
    });
```

- [ ] **Step 2: Run the file to verify the new tests pass**

Run: `npx playwright test tournament-mode.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(e2e): cover tournament Both Win / Both Lose draw buttons"
```

---

## Task 5: Ctrl+A undo restores the pair

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Add the undo test inside the `describe` block**

Insert after the draw tests:

```js
    test('Ctrl+A undo restores the previous pair after a pick', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        const before = await page.evaluate(() => {
            const p = window.mediaViewer.tournament.engine.getCurrentPair();
            return [p.left, p.right].sort();
        });

        // Pick left winner → records one result and advances to the next pair.
        await page.keyboard.press('q');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 1);
        await page.waitForFunction(() => !window.mediaViewer.isLoading);

        // Undo → history empties and the original pair is current again.
        await page.keyboard.press('Control+a');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 0);

        const after = await page.evaluate(() => {
            const p = window.mediaViewer.tournament.engine.getCurrentPair();
            return [p.left, p.right].sort();
        });
        expect(after).toEqual(before);

        const stillTournament = await page.evaluate(() => window.mediaViewer.isTournamentMode);
        expect(stillTournament).toBe(true);
    });
```

- [ ] **Step 2: Run the file to verify the new test passes**

Run: `npx playwright test tournament-mode.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(e2e): cover tournament Ctrl+A undo restores the pair"
```

---

## Task 6: Leave-prompt Save + re-enter Continue resume

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js`

- [ ] **Step 1: Add the leave/resume test inside the `describe` block**

Insert after the undo test:

```js
    test('leave-prompt Save persists state; re-enter Continue resumes', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        // Make one pick so there is progress worth saving.
        await page.keyboard.press('q');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 1);
        await page.waitForFunction(() => !window.mediaViewer.isLoading);

        // Switching to single while incomplete shows the leave prompt.
        await page.evaluate(() => window.mediaViewer.switchMode('single'));
        await expect(page.locator('#tournamentResumeModal')).toBeVisible();
        expect(await page.locator('#tournamentResumeTitle').textContent()).toBe('Leave tournament?');

        // Save & leave persists state to disk and exits tournament mode.
        await page.locator('#tournamentResumeAccept').click();
        await page.waitForFunction(() => !window.mediaViewer.isTournamentMode);

        const saved = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            const res = await window.electronAPI.readTournamentState(mv.baseFolderPath);
            return { success: res.success, hasState: !!res.state, engineNull: mv.tournament.engine === null };
        });
        expect(saved.success).toBe(true);
        expect(saved.hasState).toBe(true);
        expect(saved.engineNull).toBe(true);

        // Re-entering finds the saved state → Continue prompt.
        await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
        await expect(page.locator('#tournamentResumeModal')).toBeVisible();
        expect(await page.locator('#tournamentResumeTitle').textContent()).toBe('Resume tournament?');

        // Continue rebuilds the engine with history preserved.
        await page.locator('#tournamentResumeAccept').click();
        await page.waitForFunction(
            () => window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine !== null
        );
        const historyLen = await page.evaluate(() => window.mediaViewer.tournament.engine.history.length);
        expect(historyLen).toBe(1);
    });
```

- [ ] **Step 2: Run the file to verify all 5 tests pass**

Run: `npx playwright test tournament-mode.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/tournament-mode.test.js
git commit -m "test(e2e): cover tournament leave-prompt Save + Continue resume"
```

---

## Task 7: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — `326 passed (326)`.

- [ ] **Step 2: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS — entire suite green. The previously-known `#viewModeBtn` red (`app-launch.test.js`) is fixed and the 5 new `tournament-mode.test.js` tests pass. No remaining known failures.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (no errors). Reminder: in test code, reference `globalThis.window`/`window.electronAPI` as the project convention dictates inside `page.evaluate` callbacks — note these run in the browser context where `window` is defined, so no `no-undef` issue arises (unlike `extractMethod` unit tests).

- [ ] **Step 4: Confirm no production files changed**

Run: `git diff --stat main -- ':!tests' ':!docs'`
Expected: empty output (only files under `tests/` and `docs/` changed).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 (app-launch fix + afterEach guard) → Task 2. ✓
- Part 2 (5 tournament E2E: happy/Apply, Both Win, Both Lose, undo, leave/resume) → Tasks 3–6. ✓
- Part 3 (recordDraw `filesSnapshot` + pre-undo `pair.right`) → Task 1. ✓
- Verification (unit 326, E2E green, lint, test-only) → Task 7. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has concrete code and an exact command. ✓

**Type/selector consistency:** All selectors (`#modeSelector`, `#tournamentConfigModal`, `#tournamentRoundsSelect`, `#tournamentConfigStart`, `#tournamentOverlay`, `#tournamentSummaryModal`, `#tournamentSummaryApply`, `#tournamentBothWinBtn`, `#tournamentResumeModal`, `#tournamentResumeAccept`, `#tournamentResumeTitle`) verified against `index.html`/`media-viewer.js`. API shapes (`engine.getCurrentPair()`, `engine.history`, `engine.strategy.winCounts`, `readTournamentState → {success,state}`) verified against `tournament.js`/`tournament-engine.js`. ✓
