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
