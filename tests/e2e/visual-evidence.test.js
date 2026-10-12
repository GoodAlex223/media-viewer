import { test, expect } from '@playwright/test';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
    captureScreenshot,
} from './helpers/electron-app.js';

// Capture-only: no assertions. These produce the committed visual evidence WEEKLY G2 requires.
// The stem is passed in so the same file can run on `main` (before) and on the branch (after).
const STAGE = process.env.G2_EVIDENCE_STAGE || 'after';

test.describe('G2 visual evidence', () => {
    // Opt-in only. STAGE's `|| 'after'` fallback above means a plain `npm run test:e2e` (and
    // therefore the pre-push hook) would otherwise capture on every run and silently overwrite
    // the committed *-after.png files with whatever window size happened to render last — which
    // is exactly what defeats committed visual evidence as a reviewed gate rather than noise no
    // one looks at. Run explicitly to (re)capture: G2_EVIDENCE_STAGE=before|after npx playwright
    // test tests/e2e/visual-evidence.test.js
    test.skip(
        !process.env.G2_EVIDENCE_STAGE,
        'Opt-in only — set G2_EVIDENCE_STAGE=before|after to (re)capture visual evidence'
    );

    let electronApp, page, tmpFixtures;

    test.afterEach(async () => {
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

    for (const [label, fixture] of [
        ['short', 'wide-short-64x4.png'],
        ['normal', 'normal-320x240.png'],
    ]) {
        test(`compare mode on ${label} media`, async () => {
            tmpFixtures = await createTempFixtureDir([fixture, 'red-1x1.png']);
            ({ electronApp, page } = await launchApp());
            await seedLocalStorage(page, {
                customLikeFolder: tmpFixtures.likeDir,
                customDislikeFolder: tmpFixtures.dislikeDir,
            });
            await loadFolder(page, tmpFixtures.dir);
            await waitForMedia(page);

            await page.evaluate(() => window.mediaViewer.switchMode('compare'));
            await page.waitForFunction(() => window.mediaViewer.isCompareMode && !window.mediaViewer.isLoading);

            await captureScreenshot(page, `g2-compare-${label}-${STAGE}`);
        });
    }

    // After-only (Ruling 7): the badge and the center action bar did not exist in their current
    // form on `main`, so there is no comparable "before" to capture — only the plan's two
    // for-loop tests above are true before/after pairs.
    test('compare mode with the prediction badge and center action bar visible', async () => {
        tmpFixtures = await createTempFixtureDir(['normal-320x240.png', 'red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await page.evaluate(() => window.mediaViewer.switchMode('compare'));
        await page.waitForFunction(() => window.mediaViewer.isCompareMode && !window.mediaViewer.isLoading);

        // Force the badge and the center action bar without running a real sort or rating a
        // file. The badge and the Good/Bad buttons both gate on isSortedByPrediction
        // (updatePredictionBadges / updateBulkRateButtonsVisibility); additionally
        // displayPredictionBadge hides itself when predictionScores has no entry for the file
        // (an undefined score, not just isSortedByPrediction, controls its visibility), so a
        // real score is seeded per side rather than relying on the flag alone. Undo needs
        // non-empty moveHistory — updateCompareUndoButton only reads .length, so a minimal
        // synthetic entry is enough to reveal it without actually rating a file (which would
        // remove one of the two panes this shot needs).
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            mv.mlStats = { isReady: true };
            mv.isSortedByPrediction = true;
            if (mv.compareLeftFile) mv.predictionScores.set(mv.compareLeftFile.path, 0.87);
            if (mv.compareRightFile) mv.predictionScores.set(mv.compareRightFile.path, 0.42);
            mv.updatePredictionBadges();
            mv.updateBulkRateButtonsVisibility();
            mv.moveHistory.push({ synthetic: true });
            mv.updateCompareUndoButton();
        });

        await captureScreenshot(page, 'g2-compare-badge-after');
    });

    test('tournament mode after a pair renders', async () => {
        tmpFixtures = await createTempFixtureDir(['wide-short-64x4.png', 'red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
        await expect(page.locator('#tournamentConfigModal')).toBeVisible();
        await page.locator('#tournamentRoundsSelect').fill('1');
        await page.locator('#tournamentConfigStart').click();
        await page.waitForFunction(
            () =>
                window.mediaViewer.isTournamentMode &&
                window.mediaViewer.tournament.engine &&
                !window.mediaViewer.isLoading
        );
        await expect(page.locator('.left-media-wrapper')).toBeAttached();
        await page.evaluate(() => document.activeElement && document.activeElement.blur());

        // Reveal the auto-hiding bottom chrome band so the shot shows the real collision risk
        // for the derived `bottom: 96px` offset, not an auto-hidden bar that trivially cannot
        // overlap anything.
        const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        await page.mouse.move(Math.round(size.width / 2), size.height - 30);
        await expect(page.locator('#tournamentControls')).toHaveClass(/\bshow\b/);

        await captureScreenshot(page, 'g2-tournament-after');
    });
});

// G2 like-or-skip (2026-10-12, spec docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md):
// the same scenario on both runs — AI order, three skips, one Like — so the before/after pair differs
// only by the feature. Opt-in, like the block above: a plain E2E run must never overwrite the
// committed PNGs. Capture: LIKE_OR_SKIP_EVIDENCE_STAGE=before|after npx playwright test
// tests/e2e/visual-evidence.test.js -g "like-or-skip"
const LOS_STAGE = process.env.LIKE_OR_SKIP_EVIDENCE_STAGE;

test.describe('G2 like-or-skip visual evidence', () => {
    test.skip(!LOS_STAGE, 'Opt-in only — set LIKE_OR_SKIP_EVIDENCE_STAGE=before|after to (re)capture');

    let electronApp, page, tmpFixtures;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    const idle = () =>
        page.waitForFunction(
            () =>
                !window.mediaViewer.isLoading &&
                !window.mediaViewer.mediaNavigationInProgress &&
                !window.mediaViewer._fileOpInFlight
        );

    test('like-or-skip: single mode on the AI order after three skips and one Like', async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
        ]);
        await tmpFixtures.addFile('red-copy.png');
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await idle();

        const order = ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'red-copy.png', 'normal-320x240.png'];
        await page.evaluate((names) => {
            const scores = Object.fromEntries(names.map((n, i) => [n, 0.9 - i * 0.1]));
            window.mediaViewer.applyPredictionSortResult({ sortedFilenames: names, scores });
        }, order);
        await page.waitForFunction(() => window.mediaViewer.currentMedia !== null);
        await idle();

        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('s');
            await idle();
        }
        await page.keyboard.press('q'); // Like red-copy.png — the training set changes, so the chip has a count
        await idle();

        // The header and the controls bar fade to opacity 0 at rest; reveal both for the shot.
        await page.evaluate(() => {
            document.querySelector('.header').classList.add('show');
            document.getElementById('controls').classList.add('show');
        });
        await page.waitForTimeout(500);
        await captureScreenshot(page, `g2-like-or-skip-single-${LOS_STAGE}`);

        if (LOS_STAGE === 'after') {
            await page.keyboard.press('f');
            await page.locator('.bulk-dislike-modal').waitFor();
            await page.waitForTimeout(300);
            await captureScreenshot(page, 'g2-like-or-skip-dialog-after');
            await page.keyboard.press('Escape');
        }
    });
});
