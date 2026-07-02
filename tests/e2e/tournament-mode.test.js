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

        // The exit affordance is visible in the tournament header.
        await expect(page.locator('#tournamentExitBtn')).toBeVisible();

        // Clicking it routes through switchMode('single') → the incomplete-tournament
        // leave prompt (Save & leave / Discard / Cancel). force: the tournament overlay
        // can intercept pointer events.
        await page.locator('#tournamentExitBtn').click({ force: true });
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
});
