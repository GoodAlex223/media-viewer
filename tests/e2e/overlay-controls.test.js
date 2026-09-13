import { test, expect } from '@playwright/test';
import { access } from 'fs/promises';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

/** Bounding box of a selector, or null if it has none. */
function boxOf(page, selector) {
    return page.locator(selector).boundingBox();
}

/** True when `box` lies entirely inside the viewport. */
async function isInViewport(page, box) {
    const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    return (
        box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height
    );
}

/**
 * True when `selector`'s element is not clipped by any ancestor's overflow. A raw viewport
 * check (isInViewport) is insufficient on its own: getBoundingClientRect() reports an
 * element's laid-out geometry regardless of whether an ancestor's `overflow: hidden` paints
 * over it, so a badge positioned below a ~1px-tall clipped wrapper still lands inside the
 * window and passes isInViewport while being genuinely invisible. This walks up from the
 * element to the first ancestor that actually clips (overflow-x or overflow-y not
 * `visible`) and checks containment against THAT ancestor's box instead of the window.
 */
function isUnclipped(page, selector) {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        let node = el.parentElement;
        while (node) {
            const style = getComputedStyle(node);
            if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
                const clip = node.getBoundingClientRect();
                return (
                    rect.left >= clip.left &&
                    rect.top >= clip.top &&
                    rect.right <= clip.right &&
                    rect.bottom <= clip.bottom
                );
            }
            node = node.parentElement;
        }
        // No clipping ancestor found — the viewport is the only clip, already covered by isInViewport.
        return true;
    }, selector);
}

/** True when two boxes overlap on both axes. */
function intersects(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function enterCompare(page) {
    await page.evaluate(() => window.mediaViewer.switchMode('compare'));
    await page.waitForFunction(() => window.mediaViewer.isCompareMode && !window.mediaViewer.isLoading);
    await expect(page.locator('.left-media-wrapper')).toBeAttached();
}

test.describe('Overlay controls reachability (G2)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        // Two SHORT media: the bug's own condition. 64x4 is short enough to clip the
        // wrapper-hosted controls and tall enough to be legible in a screenshot.
        tmpFixtures = await createTempFixtureDir(['wide-short-64x4.png', 'red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
    });

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

    test('compare: both overlay control groups are inside the viewport on short media', async () => {
        await enterCompare(page);

        for (const side of ['left', 'right']) {
            const box = await boxOf(page, `.overlay-bar-slot[data-side="${side}"] .media-overlay-controls`);
            expect(box, `${side} group has no bounding box`).not.toBeNull();
            expect(await isInViewport(page, box), `${side} group is outside the viewport`).toBe(true);
        }
    });

    test('compare: the Like button actually rates the file on short media', async () => {
        await enterCompare(page);

        const leftFile = await page.evaluate(() => window.mediaViewer.compareLeftFile.name);

        // A real click — not force, not evaluate. The point of this group is that a human
        // with a mouse can hit this button.
        await page.click('.overlay-bar-slot[data-side="left"] .overlay-like-btn');

        await page.waitForFunction((name) => !window.mediaViewer.mediaFiles.some((f) => f.name === name), leftFile);
        await access(join(tmpFixtures.likeDir, leftFile));
    });

    test('compare: buttons are ghosted at rest and opaque on hover', async () => {
        await enterCompare(page);

        const selector = '.overlay-bar-slot[data-side="left"] .media-overlay-controls';
        const atRest = await page.evaluate(
            (sel) => Number(getComputedStyle(document.querySelector(sel)).opacity),
            selector
        );
        expect(atRest).toBeGreaterThan(0);
        expect(atRest).toBeLessThan(1);

        await page.hover(selector);
        await expect
            .poll(async () =>
                page.evaluate((sel) => Number(getComputedStyle(document.querySelector(sel)).opacity), selector)
            )
            .toBe(1);
    });

    test('compare: the prediction badge stays inside the viewport on short media', async () => {
        await enterCompare(page);

        // Force a badge without running a real sort: displayPredictionBadge only needs
        // mlStats.isReady to be truthy, and the badge's PLACEMENT is what is under test.
        await page.evaluate(() => {
            window.mediaViewer.mlStats = { isReady: true };
            window.mediaViewer.displayPredictionBadge(0.87, 'left');
            window.mediaViewer.displayPredictionBadge(0.42, 'right');
        });

        for (const side of ['left', 'right']) {
            const selector = `#prediction-badge-${side}`;
            const box = await boxOf(page, selector);
            expect(box, `${side} badge has no bounding box`).not.toBeNull();
            expect(await isInViewport(page, box), `${side} badge is outside the viewport`).toBe(true);
            expect(await isUnclipped(page, selector), `${side} badge is clipped by an ancestor`).toBe(true);
        }

        const events = await page.evaluate(
            () => getComputedStyle(document.getElementById('prediction-badge-left')).pointerEvents
        );
        expect(events).toBe('none');
    });

    // This guard passes both before and after the fix below it — it protects against a hazard
    // Task 5 introduces (a container-anchored badge that now outlives the mode switch), not the
    // wrapper-clipping bug. Its green here is not evidence the clipping bug is fixed; see the
    // isUnclipped assertion in the previous test for that.
    test('compare: leaving compare mode clears the side badges', async () => {
        await enterCompare(page);
        await page.evaluate(() => {
            window.mediaViewer.mlStats = { isReady: true };
            window.mediaViewer.displayPredictionBadge(0.87, 'left');
        });
        await expect(page.locator('#prediction-badge-left')).toBeVisible();

        await page.evaluate(() => window.mediaViewer.switchToSingleModeUI());
        await page.evaluate(() => window.mediaViewer.updatePredictionBadges());

        await expect(page.locator('#prediction-badge-left')).toBeHidden();
    });

    test('compare: a max-height media element does not overlap the overlay bar', async () => {
        await enterCompare(page);

        // Force each media element to its max-height ceiling regardless of the fixture's own
        // aspect ratio: with BOTH width and height set to explicit (non-auto) inline values,
        // CSS never derives one axis from the other via the intrinsic ratio, so each is
        // clamped independently by its own max-width / max-height — landing height exactly at
        // the stylesheet's max-height ceiling instead of wherever the aspect ratio happens to
        // put it. That ceiling is the geometry a native video-controls panel actually sees
        // (painted inside the video's own box, anchored to its bottom) — see the derivation
        // comment above `.media-wrapper .media-display` in styles.css.
        await page.evaluate(() => {
            for (const el of document.querySelectorAll('.media-wrapper .media-display')) {
                el.style.width = '10px';
                el.style.height = '5000px';
            }
        });

        for (const side of ['left', 'right']) {
            const mediaBox = await boxOf(page, `.${side}-media-wrapper .media-display`);
            const barBox = await boxOf(page, '.compare-overlay-bar');
            expect(mediaBox, `${side} media has no bounding box`).not.toBeNull();
            expect(barBox, 'overlay bar has no bounding box').not.toBeNull();

            // The property the fix guarantees: the media element's bottom edge sits at or
            // above the bar's top edge, so a video's native controls (painted inside its own
            // box) can never reach into the bar's band. Checked as real geometry, not CSS
            // text — and not on the control panel's own visibility, since the tiny.mp4
            // fixture is an ftyp box only and never renders a real one.
            expect(mediaBox.y + mediaBox.height, `${side} media overlaps the overlay bar`).toBeLessThanOrEqual(
                barBox.y
            );
        }
    });

    test('tournament: the overlay bar clears the tournament chrome', async () => {
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

        // Reveal the auto-hiding bottom chrome band so it has a real box to compare against.
        const size = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        await page.mouse.move(Math.round(size.width / 2), size.height - 30);
        await expect(page.locator('#tournamentControls')).toHaveClass(/\bshow\b/);

        const bar = await boxOf(page, '.compare-overlay-bar');
        const chrome = await boxOf(page, '#tournamentControls');
        expect(bar).not.toBeNull();
        expect(chrome).not.toBeNull();
        expect(intersects(bar, chrome), 'overlay bar overlaps the tournament controls').toBe(false);

        const leftBox = await boxOf(page, '.overlay-bar-slot[data-side="left"] .media-overlay-controls');
        expect(await isInViewport(page, leftBox)).toBe(true);
    });

    // Regression guard (G2 Task 7 fix round 2): #compareActionBar is display:none in tournament
    // mode, and a display:none grid item is skipped by auto-placement entirely — without explicit
    // grid-column on all three children, the right slot auto-places into the centre (auto) track
    // instead of the right (1fr) one, landing the right-hand group near the viewport's horizontal
    // MIDPOINT instead of centred in the right half. The chrome-clearance test above does not
    // catch this: it only asserts the bar avoids the tournament controls, never where within the
    // bar each group lands. Centre, not edges, because the group's own width could otherwise mask
    // a shift (an edge could stay put while the group grows/shrinks around a moved centre).
    //
    // The threshold is a 20%-wide dead zone (40%-60% of viewport width), not a bare midpoint
    // split: measured against the actual bug, the right group's centre landed at 50.02% of a
    // 1188px viewport (594.23px vs the exact midpoint of 594.00px) — a 0.23px margin past a bare
    // `> viewportWidth / 2` check, which passed when it should have failed. The fixed layout
    // measures 25.0% / 75.0% (left/right), so 40%/60% cuts cleanly and with a wide margin between
    // both observed states in both directions.
    test('tournament: the two overlay groups stay centred on their own halves', async () => {
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

        const viewportWidth = await page.evaluate(() => window.innerWidth);
        const leftBox = await boxOf(page, '.overlay-bar-slot[data-side="left"] .media-overlay-controls');
        const rightBox = await boxOf(page, '.overlay-bar-slot[data-side="right"] .media-overlay-controls');
        expect(leftBox, 'left group has no bounding box').not.toBeNull();
        expect(rightBox, 'right group has no bounding box').not.toBeNull();

        const leftCentre = leftBox.x + leftBox.width / 2;
        const rightCentre = rightBox.x + rightBox.width / 2;

        expect(leftCentre, 'left group centre should be well inside the left half').toBeLessThan(viewportWidth * 0.4);
        expect(rightCentre, 'right group centre should be well inside the right half').toBeGreaterThan(
            viewportWidth * 0.6
        );
    });

    test('tournament: the zoom button survives past the first pair', async () => {
        await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
        await expect(page.locator('#tournamentConfigModal')).toBeVisible();
        await page.locator('#tournamentRoundsSelect').fill('2');
        await page.locator('#tournamentConfigStart').click();
        await page.waitForFunction(
            () =>
                window.mediaViewer.isTournamentMode &&
                window.mediaViewer.tournament.engine &&
                !window.mediaViewer.isLoading
        );

        await expect(page.locator('.overlay-bar-slot[data-side="left"] .overlay-zoom-btn')).toBeAttached();

        // One pick re-renders the pair through showTournamentPairFast — the path that used to
        // delete the zoom button on every pair after the first (F4 / G2 Task 4), before its
        // fix (D6) had showTournamentPairFast rebuild both overlay groups after cleanup. This
        // test pins that fix.
        await page.evaluate(() => {
            const pair = window.mediaViewer.tournament.engine.getCurrentPair();
            return window.mediaViewer.handleTournamentPick(pair[0], pair[1]);
        });
        await page.waitForFunction(() => !window.mediaViewer.isLoading);

        await expect(page.locator('.overlay-bar-slot[data-side="left"] .overlay-zoom-btn')).toBeAttached();
    });
});
