import { test, expect } from '@playwright/test';
import { access, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';

/** The skip toast G3's failure path shows for the tiny.mp4 fixture (a 32-byte stub that never decodes). */
const SKIP_TINY = "Skipping tiny.mp4 — couldn't be loaded";

/**
 * The tournament render is idle: no render loop (G3's owner — absent before G3, hence the falsy
 * test rather than `=== null`, so pre-G3 runs fail on their assertions instead of timing out), no
 * load in flight, and — when instrumentRender() ran — no showTournamentPairFast call executing.
 */
async function waitForTournamentIdle(page) {
    await page.waitForFunction(() => {
        const mv = window.mediaViewer;
        const fast = window.__fast;
        return !mv._tournamentRenderLoop && !mv.isLoading && (!fast || fast.inFlight === 0);
    });
}

/**
 * Runtime-only instrumentation (media-viewer.js is untouched): count concurrent
 * showTournamentPairFast executions, record every toast (showError routes through
 * showNotification), and flag the moment tiny.mp4's media element fails. Call before Start.
 */
async function instrumentRender(page) {
    await page.evaluate(() => {
        const mv = window.mediaViewer;
        window.__fast = { inFlight: 0, max: 0, calls: 0 };
        const fast = mv.showTournamentPairFast.bind(mv);
        mv.showTournamentPairFast = async (...args) => {
            const s = window.__fast;
            s.calls += 1;
            s.inFlight += 1;
            s.max = Math.max(s.max, s.inFlight);
            try {
                return await fast(...args);
            } finally {
                s.inFlight -= 1;
            }
        };
        window.__msgs = [];
        const notify = mv.showNotification.bind(mv);
        mv.showNotification = (message, ...rest) => {
            window.__msgs.push(String(message));
            return notify(message, ...rest);
        };
        window.__tinyFailed = false;
        document.addEventListener(
            'error',
            (e) => {
                if (String(e.target?.src ?? '').includes('tiny.mp4')) window.__tinyFailed = true;
            },
            true
        );
    });
}

/**
 * Give each fixture a prediction score so AI seeding (best vs worst) deals round 1
 * deterministically. Returns the round-1 pairs that seeding will produce (basenames), so the test
 * asserts the placement before relying on it. Call before entering tournament mode: the config
 * modal enables its AI option only when predictionScores holds 2+ entries.
 */
async function setSeedScores(page, scoresByName) {
    return page.evaluate((scores) => {
        const mv = window.mediaViewer;
        for (const f of mv.mediaFiles) {
            if (f.name in scores) mv.predictionScores.set(f.path, scores[f.name]);
        }
        const base = (p) => p.split(/[\\/]/).pop();
        return (mv.buildAiSeedingPairings() ?? []).map(([a, b]) => [base(a), base(b)]);
    }, scoresByName);
}

/** What the render chose, what is painted, and what the engine and the lists hold — as basenames. */
async function screenState(page) {
    return page.evaluate(() => {
        const mv = window.mediaViewer;
        const base = (p) => (p ? decodeURIComponent(String(p)).split(/[\\/]/).pop() : null);
        const pair = mv.tournament.engine?.getCurrentPair() ?? null;
        const painted = (side) => document.querySelector(`.${side}-media-wrapper .media-display`);
        return {
            shown: [base(mv.compareLeftFile?.path), base(mv.compareRightFile?.path)],
            srcs: [base(painted('left')?.getAttribute('src')), base(painted('right')?.getAttribute('src'))],
            engine: pair ? [base(pair.left), base(pair.right)] : null,
            leftCount: document.querySelectorAll('.left-media-wrapper .media-display').length,
            rightCount: document.querySelectorAll('.right-media-wrapper .media-display').length,
            engineFiles: (mv.tournament.engine?.files ?? []).map(base),
            mediaFiles: mv.mediaFiles.map((f) => f.name),
            fastMax: window.__fast?.max ?? null,
            msgs: window.__msgs ?? [],
        };
    });
}

/** The engine's pair is on screen, painted once: one media element per side. Soft, so every miss prints. */
function expectScreenMatchesEngine(s) {
    expect.soft(s.leftCount, 'left wrapper holds exactly one media element').toBe(1);
    expect.soft(s.rightCount, 'right wrapper holds exactly one media element').toBe(1);
    expect.soft(s.engine, 'the engine has a current pair').not.toBeNull();
    expect.soft(s.shown, 'the pair the render chose is the engine pair').toEqual(s.engine);
    expect.soft(s.srcs, 'the painted elements show the engine pair').toEqual(s.engine);
}

/** Every toast about a failed or removed file, in order — the whole list prints when an assertion misses. */
function failureMessages(s) {
    return s.msgs.filter((m) => /Skipp|Failed to load|File missing|undecodable/.test(m));
}

/** Wait until the undo stack holds `n` user entries — a skip's system 'prune' does not count (G3). */
async function waitForUserHistory(page, n) {
    await page.waitForFunction(
        (want) =>
            window.mediaViewer.tournament.engine.history.filter((e) => (e.kind ?? 'pick') !== 'prune').length === want,
        n
    );
}

/**
 * Enter tournament mode through the real config modal and start a tournament.
 * Hybrid driving: switchMode + modal interaction are real; waits are state-based.
 * `aiSeeding` picks the modal's AI option (best vs worst) — call setSeedScores() first, or the
 * option is disabled and the toHaveValue check fails instead of silently seeding at random.
 */
async function enterAndStartTournament(page, { rounds, aiSeeding = false }) {
    // No saved state for a fresh temp folder → the config modal (not the continue prompt).
    await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
    await expect(page.locator('#tournamentConfigModal')).toBeVisible();

    await page.locator('#tournamentRoundsSelect').fill(String(rounds));
    if (aiSeeding) {
        await page.locator('#tournamentSeedingSelect').selectOption('ai');
        await expect(page.locator('#tournamentSeedingSelect')).toHaveValue('ai');
    }
    await page.locator('#tournamentConfigStart').click();

    // Wait until the first pair is rendered and the render is idle (G3: the owner's loop has
    // finished and nothing is loading — a bare !isLoading wait passes at once on the fast path,
    // which never sets the flag).
    await page.waitForFunction(() => window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine);
    await waitForTournamentIdle(page);
    // Confirm the compare layout rendered. Use toBeAttached (not toBeVisible): the idle wait
    // above is the real readiness gate, and a wrapper hosting a still-loading video side can be
    // transiently visibility:hidden, which flakes toBeVisible.
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
        await waitForUserHistory(page, 1);
        await waitForTournamentIdle(page);

        // Undo → history empties and the original pair is current again.
        await page.keyboard.press('Control+a');
        await waitForUserHistory(page, 0);

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
        await waitForUserHistory(page, 1);
        await waitForTournamentIdle(page);

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
        await waitForUserHistory(page, 1);
        await waitForTournamentIdle(page);
        await expect(page.locator('#tournamentUndoBtn')).toBeEnabled();

        await page.keyboard.press('Control+a');
        await waitForUserHistory(page, 0);
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
        // Wait on BOTH elements: each owns an independent setTimeout, armed in the same tick but
        // fired by the event loop separately, so synchronising on only one of them races the other
        // under load (observed as a pre-push failure right after a full suite run).
        await expect(page.locator('#tournamentHeader')).not.toHaveClass(/\bshow\b/, { timeout: 6000 });
        await expect(page.locator('#tournamentControls')).not.toHaveClass(/\bshow\b/, { timeout: 6000 });

        // Computed opacity, not just the class. Explicit timeouts leave headroom for the CSS
        // opacity transition on a loaded machine (the default 5s is not always enough).
        await expect.poll(() => chromeOpacity(page, '#tournamentHeader'), { timeout: 6000 }).toBe(0);
        await expect.poll(() => chromeOpacity(page, '#tournamentControls'), { timeout: 6000 }).toBe(0);

        await revealTournamentChrome(page, 'top');
        await expect.poll(() => chromeOpacity(page, '#tournamentHeader'), { timeout: 6000 }).toBe(1);

        await revealTournamentChrome(page, 'bottom');
        await expect.poll(() => chromeOpacity(page, '#tournamentControls'), { timeout: 6000 }).toBe(1);
    });

    // ── G3: one way for a tournament render to restart itself (spec 2026-10-07) ──
    // Round 1 is dealt by the real AI seeding path (best vs worst over predictionScores), so each
    // test knows where tiny.mp4 — a 32-byte stub that never decodes — sits before relying on it.

    test('G3 E1: two overlapping render requests leave one media element per side', async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
        ]);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 2 });

        // Two requests at once — what a media-failure render plus a pick's render amounted to.
        await page.evaluate(async () => {
            window.__fast.max = 0;
            const mv = window.mediaViewer;
            await Promise.all([mv.showTournamentPair(), mv.showTournamentPair()]);
        });
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.fastMax, 'at most one pair render in flight').toBe(1);
        expectScreenMatchesEngine(s);
    });

    test('G3 E2: an unreadable file in the first pair is skipped and the engine pair renders', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'blue-1x1.png': 0.3,
            'tiny.mp4': 0.1,
        });
        expect(pairs, 'tiny.mp4 is dealt into the first pair').toEqual([
            ['red-1x1.png', 'tiny.mp4'],
            ['green-1x1.png', 'blue-1x1.png'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 2, aiSeeding: true });
        await page.waitForFunction(() => window.__tinyFailed);
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.mediaFiles, 'skipped from the list').not.toContain('tiny.mp4');
        expect.soft(s.engineFiles, 'skipped from the tournament').not.toContain('tiny.mp4');
        expect.soft(failureMessages(s), 'one skip toast, no Remove-button error').toEqual([SKIP_TINY]);
        expectScreenMatchesEngine(s);
    });

    test('G3 E3: a file that fails in a later pair while a draw renders leaves one render in flight', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'tiny.mp4': 0.3,
            'blue-1x1.png': 0.1,
        });
        expect(pairs, 'tiny.mp4 is dealt into the second pair').toEqual([
            ['red-1x1.png', 'blue-1x1.png'],
            ['green-1x1.png', 'tiny.mp4'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 3, aiSeeding: true });
        expect((await screenState(page)).engine).toEqual(['red-1x1.png', 'blue-1x1.png']);

        // When tiny.mp4 fails, issue a draw — a user action whose render overlaps the failure's own.
        await page.evaluate(() => {
            document.addEventListener(
                'error',
                (e) => {
                    if (window.__drawIssued || !String(e.target?.src ?? '').includes('tiny.mp4')) return;
                    window.__drawIssued = true;
                    window.__fast.max = 0;
                    // A task, not a microtask: microtasks run between this capture listener and the
                    // app's own listener on the element, so a draw issued here would tear the element
                    // down first and the failure would be (correctly) ignored as stale. On the next
                    // task the failure has been handled and its render is in flight.
                    setTimeout(() => {
                        window.__draw = window.mediaViewer.handleTournamentDraw('lose');
                    }, 0);
                },
                true
            );
        });
        await page.keyboard.press('q'); // red beats blue → (green, tiny) renders through the fast path
        await page.waitForFunction(() => window.__draw !== undefined);
        await page.evaluate(() => window.__draw);
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.fastMax, 'at most one pair render in flight').toBe(1);
        expect.soft(s.mediaFiles, 'skipped from the list').not.toContain('tiny.mp4');
        expect.soft(s.engineFiles, 'skipped from the tournament').not.toContain('tiny.mp4');
        // The whole list prints on a miss. Before G3, 'Skipping missing file' comes only from
        // _buildTournamentSide's own error listener — Phase 0's evidence that the real trigger fired.
        expect.soft(failureMessages(s), 'one skip toast; the -1 capture net not needed').toEqual([SKIP_TINY]);
        expectScreenMatchesEngine(s);
    });

    test('G3 E4: an undecodable JXL in a later pair is skipped inside the render (Review Focus 1)', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        // Garbage bytes under a .jxl name: listed as image/jxl, rejected by the decoder. Named to sort
        // last, so the file single mode shows on folder load is a PNG, not this one.
        await writeFile(join(tmpFixtures.dir, 'zz-bad.jxl'), 'not a jxl file');
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'zz-bad.jxl': 0.3,
            'blue-1x1.png': 0.1,
        });
        expect(pairs, 'zz-bad.jxl is dealt into the second pair').toEqual([
            ['red-1x1.png', 'blue-1x1.png'],
            ['green-1x1.png', 'zz-bad.jxl'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 3, aiSeeding: true });
        expect((await screenState(page)).engine).toEqual(['red-1x1.png', 'blue-1x1.png']);

        await page.evaluate(() => (window.__fast.max = 0));
        await page.keyboard.press('q'); // red beats blue → (green, zz-bad.jxl): its decode fails mid-render
        await page.waitForFunction(() => window.__msgs.some((m) => /zz-bad\.jxl|undecodable/.test(m)));
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.fastMax, 'the failure re-rendered through the owner, not nested').toBe(1);
        expect.soft(s.mediaFiles).not.toContain('zz-bad.jxl');
        expect.soft(s.engineFiles).not.toContain('zz-bad.jxl');
        expect.soft(failureMessages(s)).toEqual(["Skipping zz-bad.jxl — couldn't be loaded"]);
        expectScreenMatchesEngine(s);
    });

    test('G3 E5: both files of the first pair missing from disk are skipped (Review Focus 2)', async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
        ]);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'blue-1x1.png': 0.3,
            'normal-320x240.png': 0.1,
        });
        expect(pairs).toEqual([
            ['red-1x1.png', 'normal-320x240.png'],
            ['green-1x1.png', 'blue-1x1.png'],
        ]);
        // Gone from disk after the folder loaded: still listed, so the tournament deals them first.
        await rm(join(tmpFixtures.dir, 'red-1x1.png'));
        await rm(join(tmpFixtures.dir, 'normal-320x240.png'));
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 2, aiSeeding: true });
        await page.waitForFunction(() => window.__msgs.some((m) => /^Skipp/.test(m)));
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        for (const gone of ['red-1x1.png', 'normal-320x240.png']) {
            expect.soft(s.mediaFiles).not.toContain(gone);
            expect.soft(s.engineFiles).not.toContain(gone);
        }
        expect
            .soft(failureMessages(s))
            .toEqual(["Skipping red-1x1.png — couldn't be loaded", "Skipping normal-320x240.png — couldn't be loaded"]);
        expectScreenMatchesEngine(s);
    });

    test('G3 E6: skips that leave one file end at the summary, still in tournament mode (Review Focus 3)', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, { 'red-1x1.png': 0.9, 'tiny.mp4': 0.1 });
        expect(pairs).toEqual([['red-1x1.png', 'tiny.mp4']]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 1, aiSeeding: true });
        await page.waitForFunction(() => window.__tinyFailed);
        await waitForTournamentIdle(page);

        await expect(page.locator('#tournamentSummaryModal')).toBeVisible();
        const flags = await page.evaluate(() => ({
            tournament: window.mediaViewer.isTournamentMode,
            loading: window.mediaViewer.isLoading,
            nav: window.mediaViewer.mediaNavigationInProgress,
        }));
        expect(flags).toEqual({ tournament: true, loading: false, nav: false });
        const s = await screenState(page);
        expect(s.engineFiles).toEqual(['red-1x1.png']);
        expect(failureMessages(s)).toEqual([SKIP_TINY]);
    });

    test('G3 E7: undo right after a skip restores the pick; the skipped file is re-pruned when dealt (Review Focus 4)', async () => {
        // Pins spec § 5.2's undo semantics, which G3 must preserve — may pass on pre-G3 code by construction.
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'tiny.mp4': 0.3,
            'blue-1x1.png': 0.1,
        });
        expect(pairs).toEqual([
            ['red-1x1.png', 'blue-1x1.png'],
            ['green-1x1.png', 'tiny.mp4'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 3, aiSeeding: true });

        await page.keyboard.press('q'); // red beats blue → (green, tiny), which fails and is skipped
        await page.waitForFunction(() => window.__tinyFailed);
        await waitForTournamentIdle(page);
        let s = await screenState(page);
        expect(s.engineFiles).not.toContain('tiny.mp4');

        await page.keyboard.press('Control+a'); // the newest entry is the skip's prune; the pick lies below it
        await waitForUserHistory(page, 0);
        await waitForTournamentIdle(page);
        s = await screenState(page);
        expect(s.engine, 'the pick is undone').toEqual(['red-1x1.png', 'blue-1x1.png']);
        expect(s.engineFiles, 'undo absorbed the prune: back in the engine (spec § 5.2)').toContain('tiny.mp4');
        expect(s.mediaFiles, '…but not in the list').not.toContain('tiny.mp4');
        expectScreenMatchesEngine(s);

        await page.keyboard.press('q'); // red beats blue again → tiny is dealt while absent from the list
        await waitForUserHistory(page, 1);
        await waitForTournamentIdle(page);
        s = await screenState(page);
        expect(s.engineFiles, 'the -1 capture net re-pruned it').not.toContain('tiny.mp4');
        expectScreenMatchesEngine(s);
    });
});
