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
            window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine && !window.mediaViewer.isLoading
    );
    // Confirm the compare layout rendered. Use toBeAttached (not toBeVisible): the
    // !isLoading wait above is the real readiness gate, and a wrapper hosting a still-
    // loading video side can be transiently visibility:hidden, which flakes toBeVisible.
    await expect(page.locator('.left-media-wrapper')).toBeAttached();

    // The config modal focused #tournamentRoundsSelect; drop focus so subsequent
    // page.keyboard presses are not absorbed by the (now hidden) number input.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
}

/**
 * Tournament chrome auto-hides (G2). Reveal a band by moving the real mouse into it and wait
 * for the `.show` class, so subsequent clicks pass Playwright's actionability checks. Hovering
 * the element itself re-arms its 3s timer, so the click that follows keeps it open.
 */
async function revealTournamentChrome(page, which) {
    const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const y = which === 'top' ? 30 : size.height - 30;
    await page.mouse.move(Math.round(size.width / 2), Math.round(y));
    const id = which === 'top' ? '#tournamentHeader' : '#tournamentControls';
    await expect(page.locator(id)).toHaveClass(/\bshow\b/);
}

/** Computed opacity of an element, as a number. Class presence alone is not visibility. */
function chromeOpacity(page, id) {
    return page.evaluate((sel) => Number(getComputedStyle(document.querySelector(sel)).opacity), id);
}

test.describe('Tournament Mode', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        ({ electronApp, page } = await launchApp());
    });

    test.afterEach(async () => {
        // Drop any in-progress tournament so the main-process close confirm (which traps an
        // incomplete tournament) doesn't hang graceful teardown → 5s timeout → SIGKILL.
        if (page) {
            await page
                .evaluate(() => {
                    if (window.mediaViewer && window.mediaViewer.tournament) {
                        window.mediaViewer.tournament.engine = null;
                    }
                })
                .catch(() => {});
        }
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

    test('Both Win button records a win-win draw', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 1 });

        const pair = await page.evaluate(() => {
            const p = window.mediaViewer.tournament.engine.getCurrentPair();
            return { left: p.left, right: p.right };
        });

        await revealTournamentChrome(page, 'bottom');
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

    test('exit button in the tournament header opens the leave prompt', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 1 });

        // Precondition: an incomplete tournament is active (the exit button only makes sense
        // mid-tournament — a rounds:1 2-file tournament is incomplete until the single pick).
        expect(await page.evaluate(() => window.mediaViewer.isTournamentMode)).toBe(true);

        // The fixed top-center pair-count banner is hidden in tournament mode so it doesn't
        // cover the centered exit button (the header already shows the games count).
        await expect(page.locator('#navInfo')).toBeHidden();

        // The exit affordance lives in the auto-hiding tournament header: reveal it, then assert
        // it is genuinely visible (computed opacity — Playwright's toBeVisible ignores opacity).
        await revealTournamentChrome(page, 'top');
        await expect(page.locator('#tournamentExitBtn')).toBeVisible();
        expect(await chromeOpacity(page, '#tournamentHeader')).toBe(1);

        // Clicking it routes through switchMode('single') → the incomplete-tournament
        // leave prompt (Save & leave / Discard / Cancel).
        await page.locator('#tournamentExitBtn').click();
        await expect(page.locator('#tournamentResumeModal')).toBeVisible();
        await expect(page.locator('#tournamentResumeTitle')).toHaveText('Leave tournament?');
    });

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

        // Continue rebuilds the engine; session-only undo means history starts empty.
        await page.locator('#tournamentResumeAccept').click();
        await page.waitForFunction(
            () =>
                window.mediaViewer.isTournamentMode &&
                window.mediaViewer.tournament.engine !== null &&
                !window.mediaViewer.isLoading
        );
        const historyLen = await page.evaluate(() => window.mediaViewer.tournament.engine.history.length);
        expect(historyLen).toBe(0); // session-only undo (v2): a resumed engine starts with empty history
    });

    test('undo button is disabled with an empty stack and enabled after a pick', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        // isDisabled() needs no visibility, so this holds once the chrome auto-hides.
        await expect(page.locator('#tournamentUndoBtn')).toBeDisabled();

        await page.keyboard.press('q');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 1);
        await page.waitForFunction(() => !window.mediaViewer.isLoading);
        await expect(page.locator('#tournamentUndoBtn')).toBeEnabled();

        await page.keyboard.press('Control+a');
        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 0);
        await expect(page.locator('#tournamentUndoBtn')).toBeDisabled();
    });

    test('mouse wheel does not navigate pairs in tournament mode', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        const before = await page.evaluate(() => ({
            index: window.mediaViewer.currentIndex,
            pair: (() => {
                const p = window.mediaViewer.tournament.engine.getCurrentPair();
                return [p.left, p.right].sort();
            })(),
        }));

        // Wheel over the tournament header — empty space, not a .media-wrapper, so the handler
        // would otherwise fall through to nextMedia()/previousMedia(). nextMedia mutates
        // currentIndex synchronously (compare branch: currentIndex += 2), so no wait is needed.
        await page.evaluate(() => {
            const el = document.getElementById('tournamentHeader');
            el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
        });

        const after = await page.evaluate(() => ({
            index: window.mediaViewer.currentIndex,
            pair: (() => {
                const p = window.mediaViewer.tournament.engine.getCurrentPair();
                return [p.left, p.right].sort();
            })(),
        }));

        expect(after).toEqual(before);
        expect(await page.evaluate(() => window.mediaViewer.isTournamentMode)).toBe(true);
    });

    test('tournament chrome hides at rest and reveals on its edge band', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await enterAndStartTournament(page, { rounds: 2 });

        // Park the pointer mid-screen so neither band is active, and let the entry reveal's
        // 3s timer expire (the chrome is shown once on entry so the exit button is findable).
        const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        await page.mouse.move(Math.round(size.width / 2), Math.round(size.height / 2));
        await expect(page.locator('#tournamentHeader')).not.toHaveClass(/\bshow\b/, { timeout: 6000 });

        // Computed opacity, not just the class.
        await expect.poll(() => chromeOpacity(page, '#tournamentHeader')).toBe(0);
        await expect.poll(() => chromeOpacity(page, '#tournamentControls')).toBe(0);

        await revealTournamentChrome(page, 'top');
        await expect.poll(() => chromeOpacity(page, '#tournamentHeader')).toBe(1);

        await revealTournamentChrome(page, 'bottom');
        await expect.poll(() => chromeOpacity(page, '#tournamentControls')).toBe(1);
    });
});
