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
import { cp, mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

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

// G4 recently opened folders (2026-10-16, spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md
// § 9.3): the same scenario on both runs — three folders opened one after another, then a restart (a page
// reload; main keeps its grants) — so the before/after drop-zone pair differs only by the feature. Opt-in, like
// the blocks above. Paths are redacted before each shot: the temp root lives inside the Windows profile, so it
// is replaced by D:\Photos in the path text (text only; layout unchanged). Capture:
// G4_EVIDENCE_STAGE=before|after npx playwright test tests/e2e/visual-evidence.test.js -g "recent folders"
const G4_STAGE = process.env.G4_EVIDENCE_STAGE;
const G4_FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test.describe('G4 recent folders visual evidence', () => {
    test.skip(!G4_STAGE, 'Opt-in only — set G4_EVIDENCE_STAGE=before|after to (re)capture');

    let electronApp, page, root;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (root) {
            await rm(root, { recursive: true, force: true });
            root = null;
        }
    });

    async function redactPaths(prefix) {
        await page.evaluate((p) => {
            for (const el of document.querySelectorAll('.recent-folder-path')) {
                if (el.textContent.startsWith(p)) {
                    el.textContent = 'D:\\Photos' + el.textContent.slice(p.length);
                }
            }
        }, prefix);
    }

    test('recent folders: the drop zone after a restart, and the header menu', async () => {
        root = await mkdtemp(join(tmpdir(), 'mv-e2e-g4ev-'));
        ({ electronApp, page } = await launchApp());
        for (const name of ['Wallpapers', 'Liked_2', 'Liked_3']) {
            const dir = join(root, name);
            await mkdir(dir);
            await cp(join(G4_FIXTURES, 'normal-320x240.png'), join(dir, 'normal-320x240.png'));
            await loadFolder(page, dir);
            await waitForMedia(page);
        }
        await page.reload();
        await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined');
        await redactPaths(root);
        await page.waitForTimeout(300);
        await captureScreenshot(page, `g4-drop-zone-${G4_STAGE}`);

        if (G4_STAGE === 'after') {
            await loadFolder(page, join(root, 'Liked_3'));
            await waitForMedia(page);
            await page.evaluate(() => document.querySelector('.header').classList.add('show'));
            await page.locator('#recentFoldersBtn').click();
            await page.locator('#recentFoldersMenu').waitFor();
            await redactPaths(root);
            await page.waitForTimeout(300);
            await captureScreenshot(page, 'g4-header-menu-after');
            await page.keyboard.press('Escape');
        }
    });
});

// G3 ZoomManager extraction (2026-10-26, spec docs/superpowers/specs/2026-10-26-g3-zoom-manager-extraction-design.md):
// a refactor, so the acceptance is NO visual change — the same scenario on both runs, the popover open and the media
// zoomed through its slider, in single and in compare mode. The compare shot is also the clipping check the held-back
// 🟤 [2026-03-22] "Verify zoom popover not clipped by `overflow: hidden` on `.media-wrapper`" needs. Opt-in, like the
// blocks above. Capture:
// G3_EVIDENCE_STAGE=before|after npx playwright test tests/e2e/visual-evidence.test.js -g "zoom popover"
const G3_STAGE = process.env.G3_EVIDENCE_STAGE;
const sharp = createRequire(import.meta.url)('sharp');

// A grid with coloured shapes: the committed fixtures are one solid colour, where a zoom cannot show, and a
// flat-shaded pattern keeps the committed PNGs small (photo-like noise made them ~2 MB each).
function zoomEvidenceImage(hue) {
    const lines = [];
    for (let x = 0; x <= 640; x += 40) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="480"/>`);
    for (let y = 0; y <= 480; y += 40) lines.push(`<line x1="0" y1="${y}" x2="640" y2="${y}"/>`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
        <rect width="640" height="480" fill="hsl(${hue},35%,88%)"/>
        <g stroke="#556" stroke-width="2">${lines.join('')}</g>
        <circle cx="200" cy="180" r="90" fill="hsl(${hue},70%,50%)"/>
        <rect x="380" y="240" width="160" height="120" fill="hsl(${(hue + 120) % 360},70%,45%)"/>
        <polygon points="320,60 380,160 260,160" fill="hsl(${(hue + 240) % 360},70%,50%)"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png();
}

test.describe('G3 zoom visual evidence', () => {
    test.skip(!G3_STAGE, 'Opt-in only — set G3_EVIDENCE_STAGE=before|after to (re)capture');

    let electronApp, page, root;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (root) {
            await rm(root, { recursive: true, force: true });
            root = null;
        }
    });

    // Slider 50 is scale 8^0.5 (283%): far enough from 100% that a lost transform shows.
    async function openPopoverAndZoom(toggle, popover) {
        await toggle.hover({ force: true });
        await toggle.click({ force: true });
        await expect(popover).toHaveClass(/\bshow\b/);
        await popover.locator('.zoom-slider').fill('50');
        await popover.locator('.zoom-slider').dispatchEvent('input');
        await expect(popover.locator('.zoom-value')).toHaveText('283%');
        await toggle.hover({ force: true });
        await page.waitForTimeout(300);
    }

    test('zoom popover open and zoomed, single and compare mode', async () => {
        root = await mkdtemp(join(tmpdir(), 'mv-e2e-g3ev-'));
        const dir = join(root, 'Photos');
        for (const sub of ['Photos', 'Liked', 'Disliked']) {
            await mkdir(join(root, sub));
        }
        await zoomEvidenceImage(210).toFile(join(dir, 'a-640x480.png'));
        await zoomEvidenceImage(30).toFile(join(dir, 'b-640x480.png'));
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: join(root, 'Liked'),
            customDislikeFolder: join(root, 'Disliked'),
        });
        await loadFolder(page, dir);
        await waitForMedia(page);

        await openPopoverAndZoom(page.locator('#zoomToggleBtn'), page.locator('#zoomBtnWrapper .zoom-popover'));
        await expect(page.locator('.controls')).toHaveClass(/\bshow\b/);
        await captureScreenshot(page, `g3-zoom-single-${G3_STAGE}`);

        await page.evaluate(() => window.mediaViewer.switchMode('compare'));
        await page.waitForFunction(() => window.mediaViewer.isCompareMode && !window.mediaViewer.isLoading);
        const leftSlot = page.locator('.overlay-bar-slot[data-side="left"]');
        await openPopoverAndZoom(leftSlot.locator('.overlay-zoom-btn'), leftSlot.locator('.zoom-popover'));
        await captureScreenshot(page, `g3-zoom-compare-${G3_STAGE}`);
    });
});
