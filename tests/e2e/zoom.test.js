import { test, expect } from '@playwright/test';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, createTempFixtureDir, waitForMedia } from './helpers/electron-app.js';
import { writeGridImage } from './fixtures/grid-image.js';

test.describe('Zoom Controls', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('zoom popover opens and closes on button click', async () => {
        const popover = page.locator('.zoom-popover').first();

        // Popover should initially be hidden (no .show class)
        await expect(popover).not.toHaveClass(/show/);

        // Click zoom toggle button
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        // Popover should now be visible
        await expect(popover).toHaveClass(/show/);

        // Click zoom toggle again to close
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        await expect(popover).not.toHaveClass(/show/);
    });

    test('zoom slider adjusts scale value', async () => {
        // Open zoom popover
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        const slider = page.locator('.zoom-slider').first();
        const zoomValue = page.locator('.zoom-value').first();

        // Default should show 100%
        const initialValue = await zoomValue.textContent();
        expect(initialValue).toContain('100%');

        // Set slider to a higher value (right side = zoom in)
        await slider.fill('75');
        await slider.dispatchEvent('input');
        await page.waitForTimeout(200);

        // Zoom value should have changed from 100%
        const newValue = await zoomValue.textContent();
        expect(newValue).not.toBe('100%');
    });

    test('escape key resets zoom', async () => {
        // Open zoom popover and zoom in
        await page.locator('#zoomToggleBtn').click({ force: true });
        await page.waitForTimeout(200);

        const slider = page.locator('.zoom-slider').first();
        await slider.fill('75');
        await slider.dispatchEvent('input');
        await page.waitForTimeout(200);

        // Press Escape to reset zoom
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Zoom value label should be back to 100%
        const zoomValue = page.locator('.zoom-value').first();
        const resetValue = await zoomValue.textContent();
        expect(resetValue).toContain('100%');
    });
});

// G3 characterization (spec 2026-10-26-g3-zoom-manager-extraction-design.md § 6.1): real input events through the
// transform, pan and wheel layer, asserted on the DOM only, so the same cases ran before and after the ZoomManager
// extraction (the file was byte-identical through it). A–F were each shown able to fail by a planted mutation (plan
// Task 1, Progress Log). PR #90 review round 1 corrected case C's edge bound (spec § 12).
test.describe('Zoom input (G3 characterization)', () => {
    let electronApp, page, tmp;

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
        if (tmp) {
            await tmp.cleanup();
            tmp = null;
        }
    });

    // Grid images: a solid-colour fixture cannot show a pan.
    async function openFolder({ grids = 2, fixtures = [] } = {}) {
        tmp = await createTempFixtureDir(fixtures);
        for (let i = 0; i < grids; i++) {
            await writeGridImage(join(tmp.dir, `grid-${i}.png`), 210 + i * 60);
        }
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmp.dir);
        await waitForMedia(page);
    }

    async function enterCompare() {
        await page.evaluate(() => window.mediaViewer.switchMode('compare'));
        await page.waitForFunction(() => window.mediaViewer.isCompareMode && !window.mediaViewer.isLoading);
        await expect(sideMedia('left')).toBeVisible();
    }

    const singleMedia = () => page.locator('.media-container .media-display').first();
    const singleValue = () => page.locator('#zoomBtnWrapper .zoom-value');
    const sideMedia = (side) => page.locator(`.${side}-media-wrapper .media-display`);
    const sideValue = (side) => page.locator(`.overlay-bar-slot[data-side="${side}"] .zoom-value`);

    async function centerOf(locator) {
        const b = await locator.boundingBox();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }

    async function transformOf(locator) {
        const t = await locator.evaluate((el) => el.style.transform);
        const m = /translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\) scale\(([\d.e+-]+)\)/.exec(t);
        return m ? { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) } : { x: 0, y: 0, scale: 1 };
    }

    async function wheelOver(locator, deltaY) {
        const c = await centerOf(locator);
        await page.mouse.move(c.x, c.y);
        await page.mouse.wheel(0, deltaY);
    }

    test('A: a wheel over the media zooms in and leaves the file on screen', async () => {
        await openFolder({ grids: 2 });
        await wheelOver(singleMedia(), -100);
        await expect(singleValue()).toHaveText('115%');
        expect((await transformOf(singleMedia())).scale).toBeCloseTo(1.15, 5);
        // A bounded wait before asserting a non-event: the document handler would navigate at once (its 300 ms is a
        // lockout, not a delay), but page.mouse.wheel does not wait for the page's handlers to run.
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).toBe(0);
    });

    test('B: a double-click cycles 100 → 200 → 400 → 100%', async () => {
        await openFolder({ grids: 1 });
        const c = await centerOf(singleMedia());
        for (const expected of ['200%', '400%', '100%']) {
            await page.mouse.dblclick(c.x, c.y);
            await expect(singleValue()).toHaveText(expected);
        }
    });

    test('C: a drag pans when zoomed and stops at the edge; at 100% it never grabs', async () => {
        await openFolder({ grids: 1 });
        const media = singleMedia();
        const c = await centerOf(media);

        // No movement at 100%: the mousedown is not prevented there, so a held-button move would start the
        // browser's native image drag. A pan start would set 'grabbing' on the mousedown itself.
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        expect(await media.evaluate((el) => el.style.cursor)).not.toBe('grabbing');
        await page.mouse.up();

        await page.mouse.dblclick(c.x, c.y);
        await expect(singleValue()).toHaveText('200%');
        const start = await transformOf(media);
        await page.mouse.move(c.x + 10, c.y);
        await page.mouse.down();
        // Read on the mousedown: the first move's setZoom writes 'grab' back (today's behaviour, kept as is).
        expect(await media.evaluate((el) => el.style.cursor)).toBe('grabbing');
        await page.mouse.move(c.x + 110, c.y, { steps: 5 });
        await page.mouse.up();
        expect((await transformOf(media)).x - start.x).toBeCloseTo(100, 0);

        // Two more strokes run past the edge; the clamp holds translate at the layout width × (scale − 1) / 2, where
        // the zoomed image's edge meets the box's. offsetWidth is the layout width: no scale and no running transition
        // changes it, unlike getBoundingClientRect() (PR #90 review #2 and #5). Both sides are settled values.
        for (let i = 0; i < 2; i++) {
            await page.mouse.move(c.x + 10, c.y);
            await page.mouse.down();
            await page.mouse.move(c.x + 610, c.y, { steps: 10 });
            await page.mouse.up();
        }
        const bound = await media.evaluate((el) => (el.offsetWidth * (2 - 1)) / 2);
        expect((await transformOf(media)).x).toBeCloseTo(bound, 0);
    });

    test('D: in compare mode a wheel over the left media zooms the left only', async () => {
        await openFolder({ grids: 2 });
        await enterCompare();
        await wheelOver(sideMedia('left'), -100);
        await expect(sideValue('left')).toHaveText('115%');
        await expect(sideValue('right')).toHaveText('100%');
        expect((await transformOf(sideMedia('right'))).scale).toBe(1);
    });

    test('E: in compare fullscreen a click exits at 100% but not while zoomed', async () => {
        await openFolder({ grids: 2 });
        await enterCompare();
        const wrapper = page.locator('.left-media-wrapper');

        await page.keyboard.press('z');
        await expect(wrapper).toHaveClass(/\bfullscreen\b/);
        let c = await centerOf(sideMedia('left'));
        await page.mouse.click(c.x, c.y);
        await expect(wrapper).not.toHaveClass(/\bfullscreen\b/);

        await page.keyboard.press('z');
        await expect(wrapper).toHaveClass(/\bfullscreen\b/);
        await wheelOver(sideMedia('left'), -100);
        await expect(sideValue('left')).toHaveText('115%');
        c = await centerOf(sideMedia('left'));
        await page.mouse.click(c.x, c.y);
        await page.waitForTimeout(200); // a non-event: give a wrong exit time to happen before asserting it did not
        await expect(wrapper).toHaveClass(/\bfullscreen\b/);
    });

    test('F: moving to the next file resets zoom and closes the popover', async () => {
        await openFolder({ grids: 2 });
        const popover = page.locator('#zoomBtnWrapper .zoom-popover');
        await page.locator('#zoomToggleBtn').click({ force: true });
        await expect(popover).toHaveClass(/\bshow\b/);
        await wheelOver(singleMedia(), -100);
        await expect(singleValue()).toHaveText('115%');
        await page.evaluate(() => window.mediaViewer.nextMedia());
        await page.waitForFunction(() => window.mediaViewer.currentIndex === 1 && !window.mediaViewer.isLoading);
        await expect(singleValue()).toHaveText('100%');
        await expect(popover).not.toHaveClass(/\bshow\b/);
    });

    test('G: a wheel over a video zooms it (Review Focus 1)', async () => {
        await openFolder({ grids: 0, fixtures: ['playable-64x64.mp4'] });
        await wheelOver(singleMedia(), -100);
        await expect(singleValue()).toHaveText('115%');
    });

    test('H: a wheel over an animated JPEG XL canvas zooms it (Review Focus 2)', async () => {
        await openFolder({ grids: 0, fixtures: ['animated-64x64.jxl'] });
        expect(await singleMedia().evaluate((el) => el.tagName)).toBe('CANVAS');
        await wheelOver(singleMedia(), -100);
        await expect(singleValue()).toHaveText('115%');
    });

    test('I: in tournament mode a wheel zooms the second pair (Review Focus 3)', async () => {
        await openFolder({ grids: 4 });
        const idle = () =>
            page.waitForFunction(
                () =>
                    window.mediaViewer.isTournamentMode &&
                    window.mediaViewer.tournament.engine &&
                    !window.mediaViewer._tournamentRenderLoop &&
                    !window.mediaViewer.isLoading
            );
        await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
        await expect(page.locator('#tournamentConfigModal')).toBeVisible();
        await page.locator('#tournamentRoundsSelect').fill('2');
        await page.locator('#tournamentConfigStart').click();
        await idle();
        const firstLeft = await sideMedia('left').getAttribute('src');
        await page.evaluate(() => window.mediaViewer._tournamentPickFromSide('left'));
        await idle();
        await page.waitForFunction(
            (src) => document.querySelector('.left-media-wrapper .media-display')?.getAttribute('src') !== src,
            firstLeft
        );
        await expect(sideMedia('left')).toBeVisible();
        await wheelOver(sideMedia('left'), -100);
        await expect(sideValue('left')).toHaveText('115%');
    });

    test('J: after compare and back, the single-mode popover and wheel still work (Review Focus 5)', async () => {
        await openFolder({ grids: 2 });
        await enterCompare();
        await page.evaluate(() => window.mediaViewer.switchMode('single'));
        await page.waitForFunction(() => !window.mediaViewer.isCompareMode && !window.mediaViewer.isLoading);
        await waitForMedia(page);
        await page.locator('#zoomToggleBtn').click({ force: true });
        await expect(page.locator('#zoomBtnWrapper .zoom-popover')).toHaveClass(/\bshow\b/);
        await wheelOver(singleMedia(), -100);
        await expect(singleValue()).toHaveText('115%');
    });

    // PR #90 review round 2: fitMediaToScreen gives media larger than the window a 100vw × 100vh box with
    // object-fit: contain, so the box is the window and the picture is letterboxed inside it. The pan bound must
    // follow the picture shown, or at 400% a drag uncovers half the screen. Grids A–J are smaller than the window.
    test('K: a photo larger than the window pans only as far as its own edges, not the letterbox', async () => {
        tmp = await createTempFixtureDir([]);
        await writeGridImage(join(tmp.dir, 'large-grid.png'), 210, { scale: 5 }); // 3200 × 2400 (4:3)
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmp.dir);
        await waitForMedia(page);
        const media = singleMedia();

        // Prove the letterbox branch ran: a window-sized box, wider than the 4:3 picture it holds.
        await expect.poll(() => media.evaluate((el) => el.style.width)).toBe('100vw');
        const { pictureWidth, boxWidth } = await media.evaluate((el) => {
            const fit = Math.min(el.offsetWidth / el.naturalWidth, el.offsetHeight / el.naturalHeight);
            return { pictureWidth: el.naturalWidth * fit, boxWidth: el.offsetWidth };
        });
        expect(boxWidth - pictureWidth).toBeGreaterThan(50);

        const c = await centerOf(media);
        await page.mouse.dblclick(c.x, c.y);
        await page.mouse.dblclick(c.x, c.y);
        await expect(singleValue()).toHaveText('400%');
        for (let i = 0; i < 5; i++) {
            await page.mouse.move(c.x - 300, c.y);
            await page.mouse.down();
            await page.mouse.move(c.x + 300, c.y, { steps: 10 });
            await page.mouse.up();
        }
        // The picture's edge meets its unzoomed edge: picture width × (4 − 1) / 2. The box would allow
        // boxWidth × 3 / 2, about 250 px more.
        expect((await transformOf(media)).x).toBeCloseTo((pictureWidth * (4 - 1)) / 2, 0);
    });
});
