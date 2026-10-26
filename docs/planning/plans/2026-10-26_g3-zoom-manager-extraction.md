# G3. ZoomManager Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) Oct 19–23 § G3 (🔵, 5 SP → ~6 SP); BACKLOG 🔵 [2026-10-18] "Extract ZoomManager from the renderer (v2.0 modularization, the third manager)"
**Spec**: [2026-10-26-g3-zoom-manager-extraction-design.md](../../superpowers/specs/2026-10-26-g3-zoom-manager-extraction-design.md). The user skipped the question round; spec § 11 lists Claude's calls.
**Created**: 2026-10-26
**Status**: Approved by the user 2026-10-26. Execution runs after a `/compact`. Recommended: native (superpowers:executing-plans) on Sonnet · `high`, then one whole-branch review on the most capable model. Task 1 is next.
**Last Updated**: 2026-10-26
**Branch**: `g3-zoom-manager-extraction` (from `main` @ `5230b69`). Baseline `3509bca`: before screenshots and `typescript@6`, with `media-viewer.js` unchanged at **11,945** lines.
**Trial vehicle**: `typescript-lsp` (REVIEW-QUEUE § 5; last vehicle). Log every LSP answer and diagnostic in the Progress Log (spec § 8).

**Goal:** Move the renderer's zoom code into a `ZoomManager` in `zoom.js`, with no visible or behavioural change, and with E2E coverage of the transform, pan and wheel layer that can fail.

**Architecture:** `zoom.js` exports `ZoomManager`: a stateful class built with three injected callbacks (`getMediaElement`, `isCompareMode`, `createIcons`), and no reference to `MediaViewer`. It owns the zoom/pan state, the popovers, the per-media listeners (`attachToMedia`) and its three document listeners (`init`). `MediaViewer` builds it as `this.zoom` and calls eight methods (spec § 4.4). `FullscreenManager`'s `isZoomed` callback delegates to `this.zoom.isWrapperZoomed`. Method bodies move verbatim, apart from the three edits in spec § 4.4.

**Tech Stack:** Electron 39 renderer (ES modules, no bundler), Vitest 4 (node environment), Playwright + Electron E2E, ESLint 9 flat config, Prettier 3, `sharp` (fixtures and pixel diff).

## Global Constraints

- **No behaviour or visual change.** Listener types, options (`{ passive: false }`), `preventDefault`/`stopPropagation` calls, CSS classes, popover DOM, numbers (`zoomSteps [1, 2, 4]`, `minZoom 1`, `maxZoom 8`, `zoomFactor 1.15`, the log slider map) all stay as they are (spec § 3.3, items 1–9).
- **No back-reference**: `ZoomManager` never receives `MediaViewer`; it receives only the three callbacks.
- **Names** (spec § 4.4): `init`, `createPopover`, `removePopover`, `hideAllPopovers`, `reset`, `isZoomed`, `isWrapperZoomed`, `attachToMedia`, `sliderToScale`, `scaleToSlider`, `setZoom`, `zoomAtPoint`, `cycleStep`, `handleWheel`, `handlePanStart`, `handlePanMove`, `handlePanEnd`, `updateIndicator`; state `state`, `popovers`, `zoomSteps`, `minZoom`, `maxZoom`, `zoomFactor`, `isPanning`, `currentPanTarget`, `panStart`, `panStartTranslate`. The host property is `this.zoom`.
- **Prettier**: `tabWidth=4`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, LF. The `PostToolUse` hook formats every edited file except `media-viewer.js` (lint-staged formats that at commit).
- **ESLint**: `curly: ['error', 'all']`, `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (`_` prefix). In block 2c, `no-undef` is an error, which is why Lucide arrives as a callback. The renderer's `htmlSinkGuard` allows `innerHTML` only from a static string (`'<i data-lucide="minus"></i>'` passes).
- **E2E assertions read the DOM only** (`.zoom-value` text, `style.transform`, `style.cursor`, the wrapper's `fullscreen` class, `currentIndex`), never zoom state, so `tests/e2e/zoom.test.js` runs unchanged before and after the move (spec § 6.1).
- **Vitest runs in node**: no DOM. `zoom.js` tests stub `document`; `media-viewer-utils` tests call extracted methods with a mock `this`.
- **TDD**: every new unit test fails before its code lands (log the message). The E2E characterization tests pass on the unchanged renderer by design; their RED is the planted mutation runs in Task 1, logged per case.
- **Grep rule** (CLAUDE.md § Best Practices): for every renamed or removed symbol, grep code, tests **and comments**, and re-read every comment attached to changed code.
- **Hooks**: pre-commit = secret scan → docs-index → CLAUDE.md size warning → lint-staged → `npx vitest run`. Pre-push runs the full E2E suite. Never `--no-verify`. After a refused commit, check `git diff --cached` before the next one (memory `feedback_refused_commit_leaves_files_staged`).
- **Commits**: one per task. In subagent-driven mode the controller commits. End each message with the executing session's attribution lines.
- **No push and no PR** without the user's go-ahead. Ask before running `/code-review` in this chat.

## Review Focus

1. **Zoom on a video** (single mode): `attachToMedia` is wired in `setupVideoHandlers`' `loadedmetadata`, not the image path. Expected: a wheel zooms it. Pinned in Task 1 (E2E `G`).
2. **Zoom on an animated JPEG XL canvas**: a separate wiring site (`finishJxlCanvasDisplay`). Expected: a wheel zooms it. Pinned in Task 1 (E2E `H`).
3. **The second tournament pair**: `showTournamentPairFast` resets, rebuilds the controls and builds fresh elements. Expected: a wheel over the new left media zooms it. Pinned in Task 1 (E2E `I`).
4. **The popover open across a file change**: expected to close, with zoom back at 100%. Pinned in Task 1 (E2E `F`, both halves).
5. **Single → compare → single**: the static single-mode popover must still open, and the wheel still zoom. Pinned in Task 1 (E2E `J`).

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `zoom.js` | Create (T2) | `ZoomManager`: zoom/pan state, popovers, per-media and document listeners |
| `tests/zoom-manager.test.js` | Create (T2) | Direct-import unit tests; the ported `removeZoomPopover` tests; the no-second-copy source scan (T3) |
| `tests/e2e/fixtures/grid-image.js` | Create (T1) | `writeGridImage(path, hue)`, shared by the evidence block and the characterization E2E |
| `tests/e2e/zoom.test.js` | Modify (T1) | + `Zoom input (G3 characterization)`: cases A–J |
| `tests/e2e/visual-evidence.test.js` | Modify (T1) | Its G3 block imports `writeGridImage` (inline generator removed) |
| `media-viewer.js` | Modify (T3) | Imports and builds `this.zoom`; call sites delegate; both zoom blocks, `getZoomTarget`, `getMediaElement`, the constructor state and the pan document listeners deleted |
| `eslint.config.mjs` | Modify (T2) | `zoom.js` in block 2c + the L11 header comment |
| `tests/lint-guard.test.js`, `tests/media-url.test.js` | Modify (T2) | `zoom.js` in both `RENDERER_FILES` |
| `tests/media-viewer-utils.test.js` | Modify (T3) | Two mock contexts → `zoom: {…}` with call assertions; the `removeZoomPopover` describe removed (ported) |
| `CLAUDE.md`, `.claude/agents/regression-checker.md`, `docs/ARCHITECTURE.md` | Modify (T4) | Names and the module list (spec § 4.7) |
| `docs/superpowers/specs/assets/g3-zoom-*-after.png` | Create (T5) | After evidence |

---

### Task 1: Characterization E2E on the unchanged renderer

**Files:**
- Create: `tests/e2e/fixtures/grid-image.js`
- Modify: `tests/e2e/visual-evidence.test.js` (G3 block: drop `createRequire`/`sharp`/`zoomEvidenceImage`, import `writeGridImage`)
- Modify: `tests/e2e/zoom.test.js`

**Interfaces:**
- Produces: `writeGridImage(path: string, hue: number): Promise<void>`. It writes a 640×480 PNG: an `hsl(hue,35%,88%)` background, a 40 px grid in `#556`, a circle, a rectangle and a triangle. The body moves verbatim from `zoomEvidenceImage` in `visual-evidence.test.js`, ending in `.toFile(path)`.

- [x] **Step 1: Move the generator.** Create `grid-image.js` (`createRequire(import.meta.url)('sharp')`, as `hash-fixtures.js` does). Point the G3 evidence block at it: `await writeGridImage(join(dir, 'a-640x480.png'), 210)` and `(…'b-640x480.png'), 30)`. Run `npx eslint tests/e2e/fixtures/grid-image.js tests/e2e/visual-evidence.test.js`. Expected: clean.

- [x] **Step 2: Determinism control for the pixel diff.** Still on the unchanged renderer, capture into a throwaway stage and diff it against the committed before images. This shows that a re-capture reproduces them pixel for pixel, which Task 5's after-diff relies on. Save as `pixel-diff.cjs` in your scratchpad directory (not committed):

```js
const sharp = require('sharp');
(async () => {
    const [a, b] = await Promise.all(
        process.argv.slice(2).map((p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true }))
    );
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
        console.log('size differs');
        process.exit(2);
    }
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
            n++;
        }
    }
    console.log(`differing pixels: ${n} of ${a.info.width * a.info.height}`);
    process.exit(n ? 1 : 0);
})();
```

Run (PowerShell): `$env:G3_EVIDENCE_STAGE='control'; npx playwright test tests/e2e/visual-evidence.test.js -g "zoom popover"; $env:G3_EVIDENCE_STAGE=$null`. Then, for `single` and `compare`: `node <scratchpad>/pixel-diff.cjs docs/superpowers/specs/assets/g3-zoom-<mode>-before.png docs/superpowers/specs/assets/g3-zoom-<mode>-control.png`.
Expected: `differing pixels: 0` for both. Planted control: `single-before` vs `compare-before` must report a large count (measured at planning: 1,318,209 of 1,494,592). Delete the two `*-control.png` files. If the control is not 0, stop: the after-diff cannot be used as written, so record the count and ask the user.

- [x] **Step 3: Write the characterization cases.** Add to `tests/e2e/zoom.test.js` (new imports: `cp, mkdtemp, rm` from `fs/promises`, `tmpdir`, `dirname, join, resolve`, `fileURLToPath`, `writeGridImage`):

```js
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// G3 characterization (spec 2026-10-26-g3-zoom-manager-extraction-design.md § 6.1): real input events through the
// transform, pan and wheel layer, asserted on the DOM only, so this file runs unchanged before and after the
// ZoomManager extraction. A–F were each shown able to fail by a planted mutation (plan Task 1, Progress Log).
test.describe('Zoom input (G3 characterization)', () => {
    let electronApp, page, root;

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
        if (root) {
            await rm(root, { recursive: true, force: true });
            root = null;
        }
    });

    // Grid images: a solid-colour fixture cannot show a pan.
    async function openFolder({ grids = 2, fixtures = [] } = {}) {
        root = await mkdtemp(join(tmpdir(), 'mv-e2e-zoom-'));
        for (let i = 0; i < grids; i++) {
            await writeGridImage(join(root, `grid-${i}.png`), 210 + i * 60);
        }
        for (const name of fixtures) {
            await cp(join(FIXTURES, name), join(root, name));
        }
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, root);
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
        await page.waitForTimeout(400); // past the document handler's 300 ms wheel debounce
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
        await page.mouse.move(c.x + 110, c.y, { steps: 5 });
        expect(await media.evaluate((el) => el.style.cursor)).toBe('grabbing');
        await page.mouse.up();
        expect((await transformOf(media)).x - start.x).toBeCloseTo(100, 0);

        // Two more strokes run past the edge; the clamp holds translate at rect.width × (scale − 1) / 2.
        for (let i = 0; i < 2; i++) {
            await page.mouse.move(c.x + 10, c.y);
            await page.mouse.down();
            await page.mouse.move(c.x + 610, c.y, { steps: 10 });
            await page.mouse.up();
        }
        const bound = await media.evaluate((el) => el.getBoundingClientRect().width / 2); // scale 2
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
        await page.waitForTimeout(200);
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
});
```

If a selector or wait does not match the app (for example `.media-container .media-display`, or the tournament idle flags), fix the test, not the app: the renderer is unchanged in this task. Log each such fix.

- [x] **Step 4: Run on the unchanged renderer.**
Run: `npx playwright test tests/e2e/zoom.test.js`
Expected: 3 existing + 10 new passed. These pass by construction (characterization); their RED is Step 5.

- [x] **Step 5: Prove A–F can fail.** For each row: apply the one edit to `media-viewer.js` (line numbers at `3509bca`), run `npx playwright test tests/e2e/zoom.test.js -g "<letter>:"`, and confirm it **fails at the named assertion**. Then `git checkout -- media-viewer.js` and `git diff --quiet media-viewer.js` (exit 0). Log each failure message.

| Case | Edit | Must fail at |
| --- | --- | --- |
| A | L8958 `e.deltaY > 0 ? -1 : 1` → `e.deltaY > 0 ? 1 : -1` | `toHaveText('115%')` |
| B | L397 `[1, 2, 4]` → `[1, 3, 4]` | `'200%'` → got `'300%'` |
| C (edge) | L9000–9001: delete both `Math.max(-max…, Math.min(max…, …))` lines | the `bound` assertion |
| C (100%) | L8966: delete `if (state.scale <= 1) return false;` | cursor `not.toBe('grabbing')` |
| D | L9070 `this.handleWheelZoom(e, target)` → `this.handleWheelZoom(e, 'single')` | left `'115%'` |
| E | L379 → `return false;` | the last `toHaveClass(/fullscreen/)` |
| F (reset) | L3926: delete `this.resetZoom('single');` | `toHaveText('100%')` |
| F (popover) | L3998: delete `this.closeAllZoomPopovers();` | `not.toHaveClass(/show/)` |

A mutation that leaves its case green means the case does not test what it claims. Find out why (memory `feedback_test_must_fail_against_unfixed_code`), fix the test, and re-run its mutation.

- [x] **Step 6: Commit.**

```bash
git add tests/e2e/fixtures/grid-image.js tests/e2e/visual-evidence.test.js tests/e2e/zoom.test.js
git commit -m "test(zoom): characterization E2E for wheel, double-click, pan and fullscreen (G3 T1)"
```

---

### Task 2: `ZoomManager` with direct unit tests

**Files:**
- Create: `zoom.js`, `tests/zoom-manager.test.js`
- Modify: `eslint.config.mjs` (block 2c `files` + L11 comment), `tests/lint-guard.test.js` and `tests/media-url.test.js` (`RENDERER_FILES` + `'zoom.js'`)

**Interfaces:**
- Produces:
  - `export class ZoomManager`; `constructor({ getMediaElement: (target: 'single'|'left'|'right') => HTMLElement|null, isCompareMode: () => boolean, createIcons: (root: HTMLElement) => void })`.
  - `init(): void`, `createPopover(target, wrapper, toggleBtn): void`, `removePopover(target): void`, `hideAllPopovers(): void`, `reset(target | 'all'): void`, `isZoomed(): boolean`, `isWrapperZoomed(wrapper): boolean`, `attachToMedia(element, target): void`.
  - Internal but public: `sliderToScale(value): number`, `scaleToSlider(scale): number`, `setZoom(target, scale, tx, ty)`, `zoomAtPoint(target, newScale, clientX, clientY)`, `cycleStep(target, clientX, clientY)`, `handleWheel(e, target)`, `handlePanStart(e, target): boolean`, `handlePanMove(e)`, `handlePanEnd()`, `updateIndicator(target)`.
  - State: `state` `{single,left,right}` → `{scale, translateX, translateY}`, and `popovers` (keyed by target; entry `{container, slider, zoomInBtn, zoomOutBtn, valueDisplay, toggleBtn, isSliderDragging, abortController}`).

- [ ] **Step 1: Write the failing tests** in `tests/zoom-manager.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZoomManager } from '../zoom.js';

function fakeMedia({ width = 200, height = 100 } = {}) {
    return {
        style: {},
        listeners: {},
        addEventListener(type, fn, opts) {
            this.listeners[type] = { fn, opts };
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
        closest: () => null,
    };
}

function fakeEl(tag) {
    const classes = new Set();
    return {
        tagName: tag.toUpperCase(),
        children: [],
        listeners: {},
        style: {},
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
        appendChild(child) {
            this.children.push(child);
            child.parentNode = this;
            return child;
        },
        addEventListener(type, fn) {
            (this.listeners[type] ??= []).push(fn);
        },
        remove: vi.fn(),
    };
}

function makeManager({ compare = false } = {}) {
    const media = { single: fakeMedia(), left: fakeMedia(), right: fakeMedia() };
    const createIcons = vi.fn();
    const zm = new ZoomManager({ getMediaElement: (t) => media[t], isCompareMode: () => compare, createIcons });
    return { zm, media, createIcons };
}

const wheel = (deltaY) => ({ deltaY, clientX: 100, clientY: 50, preventDefault: vi.fn(), stopPropagation: vi.fn() });
```

| Test (`describe('ZoomManager')`) | Assertions |
| --- | --- |
| `maps the slider logarithmically between 1 and 8` | `sliderToScale(0)` ≈ 1, `sliderToScale(100)` ≈ 8, `sliderToScale(50)` ≈ `Math.sqrt(8)`; `scaleToSlider(sliderToScale(37))` ≈ 37; `scaleToSlider(0.5)` = 0; `scaleToSlider(20)` ≈ 100 |
| `setZoom clamps to [1, 8] and writes the transform and cursor` | `setZoom('single', 20, 5, 6)` → `state.single.scale` 8, `media.single.style.transform` = `'translate(5px, 6px) scale(8)'`, `cursor` `'grab'`; `setZoom('single', 0.2, 0, 0)` → scale 1, cursor `'default'` |
| `reset('all') resets every side` | after `setZoom` on all three, `reset('all')` → each `state[t]` deep-equals `{ scale: 1, translateX: 0, translateY: 0 }` |
| `handleWheel prevents default, stops propagation and steps by 1.15` | `e = wheel(-100)`: `handleWheel(e, 'single')` → both spies called once, scale ≈ 1.15; then `handleWheel(wheel(100), 'single')` → scale ≈ 1 |
| `cycleStep goes 1 → 2 → 4 → 1` | three `cycleStep('single', 100, 50)` calls → scales 2, 4, 1 |
| `isZoomed reads single in single mode and either side in compare mode` | single manager: `setZoom('left', 2, 0, 0)` → `false`; `setZoom('single', 2, 0, 0)` → `true`. Compare manager: `setZoom('right', 2, 0, 0)` → `true` |
| `isWrapperZoomed maps the wrapper class to its side` | wrappers `{ classList: { contains: (c) => c === 'left-media-wrapper' } }` and the right one; a wrapper with no class → `'single'`. Zoom only `left` → `true`/`false`/`false` |
| `handlePanStart refuses at 100% and grabs when zoomed` | at scale 1 → returns `false`, `isPanning` false; after `setZoom('single', 2, 0, 0)` → `true`, `isPanning` true, cursor `'grabbing'` |
| `handlePanMove clamps translate to rect.width × (scale − 1) / 2` | `fakeMedia({ width: 400, height: 200 })` at scale 2; `handlePanStart({clientX:0,clientY:0}, 'single')`; `handlePanMove({clientX:1000,clientY:0})` → `translateX` = 200; `handlePanEnd()` → `isPanning` false, cursor `'grab'` |
| `attachToMedia wires dblclick, a non-passive wheel and mousedown` | `listeners.wheel.opts` deep-equals `{ passive: false }`; `dblclick`, `mousedown` present; calling the wheel `fn` with `wheel(-100)` zooms `'left'` when attached as `'left'` |
| `createPopover builds [-] [slider] [+] [value] and registers the entry` | (document stub below) `children.map((c) => c.className)` = `['zoom-pop-btn', 'zoom-slider', 'zoom-pop-btn', 'zoom-value']`; `createIcons` called with the popover; `popovers.left.toggleBtn` is the button |
| `the toggle opens and closes its popover` | invoke `toggleBtn.listeners.click[0]({ stopPropagation: vi.fn() })` → `container.classList.contains('show')` true; again → false |
| `hideAllPopovers hides every popover and keeps the entries` | two popovers shown → both lose `show`; `Object.keys(popovers)` unchanged |
| `removePopover does NOT remove the toggle button wrapper` | ported verbatim from `media-viewer-utils.test.js` L7146–7160 (`zoomControlsMap` → `popovers`), with its G2 comment |
| `removePopover still aborts listeners, removes the popover and forgets the entry` | ported, L7162–7170 |
| `removePopover is a no-op for a target with no popover` | ported, L7172–7175 |
| `init builds the single popover and installs the three document listeners` | `document.getElementById` returns a wrapper and button for `zoomBtnWrapper`/`zoomToggleBtn`; after `init()`, `popovers.single` exists; the stub's `addEventListener` saw `'click'`, `'mousemove'` and `'mouseup'` |

Document stub for the popover tests (`beforeEach`/`afterEach` restore the original): `globalThis.document = { createElement: fakeEl, addEventListener: vi.fn(), getElementById: (id) => ids[id] ?? null }`.

- [ ] **Step 2: Run to verify they fail.**
Run: `npx vitest run tests/zoom-manager.test.js`
Expected: FAIL. The file cannot import `../zoom.js` ("Failed to load url" / "Cannot find module"). Log the message.

- [ ] **Step 3: Create `zoom.js`.** Header JSDoc on `fullscreen.js`'s model (v2.0 pattern, the three callbacks, "no reference to MediaViewer"). The constructor stores the callbacks and initialises the state from spec § 4.3, with the same values as `media-viewer.js` L392–403 plus `currentPanTarget = null` and `popovers = {}`. Method bodies move verbatim from `media-viewer.js` (L2978–3137 and L8866–9084, skipping `getZoomTarget`/`getMediaElement`), renamed per the Interfaces, with spec § 4.4's three edits. Two bodies are new composition:

```js
    init() {
        // Only the single-mode zoom is static markup; compare-mode buttons come from addMediaOverlayControls.
        const wrapper = document.getElementById('zoomBtnWrapper');
        const toggleBtn = document.getElementById('zoomToggleBtn');
        if (wrapper && toggleBtn) {
            this.createPopover('single', wrapper, toggleBtn);
        }
        document.addEventListener('click', () => this.hideAllPopovers());
        document.addEventListener('mousemove', (e) => this.handlePanMove(e));
        document.addEventListener('mouseup', () => this.handlePanEnd());
    }

    isWrapperZoomed(wrapper) {
        const target = wrapper.classList.contains('left-media-wrapper')
            ? 'left'
            : wrapper.classList.contains('right-media-wrapper')
              ? 'right'
              : 'single';
        return this.state[target] && this.state[target].scale > 1;
    }
```

Keep `removePopover`'s G2 comment (why it never touches the toggle button), updated to the new names. `updateIndicator` drops its `this.zoomControlsMap &&` guard (spec § 4.3).

- [ ] **Step 4: Register the module.** Add `'zoom.js'` to `eslint.config.mjs` block 2c `files` and the L11 header list; add it to `RENDERER_FILES` in `tests/lint-guard.test.js` and `tests/media-url.test.js`.

- [ ] **Step 5: Run to verify they pass.**
Run: `npx vitest run tests/zoom-manager.test.js tests/lint-guard.test.js tests/media-url.test.js && npx eslint zoom.js`
Expected: all pass; ESLint clean. Then `npx vitest run`. Expected: 2333 + the new count passed, 1 skipped.

- [ ] **Step 6: LSP check (trial).** Run `documentSymbol` on `zoom.js` and log the symbol list. Run `findReferences` on `ZoomManager` and log whether it reaches the test file.

- [ ] **Step 7: Commit.**

```bash
git add zoom.js tests/zoom-manager.test.js eslint.config.mjs tests/lint-guard.test.js tests/media-url.test.js
git commit -m "feat(zoom): ZoomManager module with direct unit tests (G3 T2)"
```

---

### Task 3: Switch the renderer to `this.zoom` and delete the old code

**Files:**
- Modify: `media-viewer.js`, `tests/media-viewer-utils.test.js`, `tests/zoom-manager.test.js`

**Interfaces:**
- Consumes: Task 2's `ZoomManager` API.
- Produces: `MediaViewer#zoom` (a `ZoomManager`); no zoom state or methods left on `MediaViewer`.

- [ ] **Step 1: Write the failing tests.**
  - In `tests/media-viewer-utils.test.js` `switchToSingleModeUI wrapper teardown` (L5073): the ctx line `closeAllZoomPopovers: vi.fn()` → `zoom: { hideAllPopovers: vi.fn() }`. Add `expect(ctx.zoom.hideAllPopovers).toHaveBeenCalled()` to its first test.
  - In `addMediaOverlayControls — slot targeting and button order (G2)` (L6969): `removeZoomPopover`/`createZoomPopover` → `zoom: { removePopover: vi.fn(), createPopover: vi.fn() }`. Add a test `'drops the side's old popover before creating the new one'`: after `addMediaOverlayControls.call(c, 'left')`, `removePopover` was called with `'left'`, `createPopover` with `('left', expect.anything(), expect.anything())`, and `removePopover.mock.invocationCallOrder[0] < createPopover.mock.invocationCallOrder[0]`.
  - In `tests/zoom-manager.test.js`, add `'media-viewer.js keeps no copy of the zoom code'`. It reads `media-viewer.js` and expects no match for `/^\s{4}(sliderToScale|scaleToSlider|setupZoomPopovers|createZoomPopover|removeZoomPopover|closeAllZoomPopovers|getZoomTarget|getMediaElement|setZoom|resetZoom|zoomAtPoint|cycleZoomStep|handleWheelZoom|handlePanStart|handlePanMove|handlePanEnd|updateZoomIndicator|isZoomed|setupZoomEvents)\(/m` and none for `/this\.(zoomState|zoomControlsMap)\b/`.

- [ ] **Step 2: Run to verify they fail.**
Run: `npx vitest run tests/media-viewer-utils.test.js tests/zoom-manager.test.js`
Expected: FAIL. The two context tests fail with `this.closeAllZoomPopovers is not a function` / `this.removeZoomPopover is not a function`, and the scan reports the first old definition. Log the messages.

- [ ] **Step 3: Edit `media-viewer.js`** (delete the later block first, so the earlier line numbers hold):
  1. Delete L8846–9085: the `// ==================== ZOOM METHODS ====================` header through `setupZoomEvents` and its trailing blank line. `getZoomTarget` and `getMediaElement` go with it.
  2. Delete L2977–3138: `sliderToScale` through `closeAllZoomPopovers` and the trailing blank line.
  3. L2763–2770: delete the `// Global pan event listeners for zoom` comment and both document listeners. In the wheel handler comment (L2783), the sentence becomes: `A wheel over media still zooms: the media element's own listener (ZoomManager.handleWheel) runs first and stops propagation.` Re-read L2788–2793 too: it describes the bubble order and needs no name change.
  4. L2693–2694: `this.zoom.isZoomed()` / `this.zoom.reset('all')`.
  5. L530–532: `// Zoom popover controls` + `this.zoom.init();`.
  6. L391–403 → build `this.zoom = new ZoomManager({…})` with `getMediaElement` (`'left'` → `this.leftMedia`, `'right'` → `this.rightMedia`, else `this.currentMedia`), `isCompareMode: () => this.isCompareMode`, and `createIcons: (root) => { if (typeof lucide !== 'undefined') { lucide.createIcons({ root }); } }`, under the comment `// Zoom manager (v2.0 module pattern — stateful manager with callbacks)`.
  7. L373–380 → `isZoomed: (wrapper) => this.zoom.isWrapperZoomed(wrapper),`.
  8. Import: `import { ZoomManager } from './zoom.js';` after the `FullscreenManager` import.
  9. Call sites, per spec § 3.2. `resetZoom(` → `zoom.reset(` (L3926, L4112–4113, L6449–6450). `closeAllZoomPopovers()` → `zoom.hideAllPopovers()` (L3998, L4363, L5729, L6889). `removeZoomPopover(side)` → `zoom.removePopover(side)` (L4454, L7250). `createZoomPopover(` → `zoom.createPopover(` (L4455). `setupZoomEvents(` → `zoom.attachToMedia(` (L4472, L4527, L4578, L4625, L4643).
  10. Re-read every comment next to the call sites above, for example L7249 "Clean up zoom popover and its document-level listeners".

- [ ] **Step 4: Remove the ported tests.** Delete the `describe('removeZoomPopover — dismisses the popover, keeps the button (G2)'…)` block from `tests/media-viewer-utils.test.js` (L7132–7176). Its three tests live in `tests/zoom-manager.test.js` now.

- [ ] **Step 5: Run to verify they pass.**
Run: `npx vitest run` → all pass. Expected count: Task 2's total + 2 new − 3 ported. Then `npx eslint media-viewer.js zoom.js` → clean. Then `npx playwright test tests/e2e/zoom.test.js tests/e2e/overlay-controls.test.js tests/e2e/fullscreen.test.js tests/e2e/compare-mode.test.js tests/e2e/recent-folders.test.js tests/e2e/tournament-mode.test.js` → all pass, A–J included, **with `tests/e2e/zoom.test.js` byte-identical to Task 1's commit** (`git diff HEAD~1 -- tests/e2e/zoom.test.js` is empty).

- [ ] **Step 6: Measure.** `wc -l media-viewer.js`. Log before (11,945) and after, plus the net. Expected about −420; anything above −400 is explained before moving on. Log every LSP diagnostic the harness shows for `media-viewer.js` after these edits, and whether any names a removed method (spec § 6.4).

- [ ] **Step 7: Commit.**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js tests/zoom-manager.test.js
git commit -m "refactor(zoom): MediaViewer delegates to ZoomManager; old zoom code removed (G3 T3)"
```

---

### Task 4: Old-name sweep and documentation

**Files:**
- Modify: `CLAUDE.md`, `.claude/agents/regression-checker.md` (protected path), `docs/ARCHITECTURE.md`, and any live comment the sweep finds.

**Interfaces:**
- Consumes: the names from Task 2.

- [ ] **Step 1: Sweep.**
Run: `git grep -n -E "zoomState|zoomControlsMap|setupZoomPopovers|createZoomPopover|removeZoomPopover|closeAllZoomPopovers|resetZoom|cycleZoomStep|handleWheelZoom|updateZoomIndicator|setupZoomEvents|getZoomTarget|getMediaElement"`
Expected after Steps 2–4: hits only in dated history. That means `docs/archive/`, `docs/planning/DONE.md`, `docs/planning/BACKLOG.md` entry bodies (renamed at closeout where open, spec § 7 row 5), `docs/planning/WEEKLY.md`, specs dated before 2026-10-26, this spec and this plan, plus the regex inside `tests/zoom-manager.test.js`. Every other hit gets fixed.

- [ ] **Step 2: `CLAUDE.md`.**
  - § Architecture: a line after `fullscreen.js`: `├── zoom.js              # ZoomManager ES module (v2.0 pattern): zoom/pan state, the zoom popovers, each media element's wheel/dblclick/pan listeners; host callbacks getMediaElement, isCompareMode, createIcons`.
  - § Code Conventions → Patterns: add `ZoomManager` to the v2.0 list.
  - Imports: add `zoom.js` to the extracted-modules list.
  - § UI Components: `Zoom via this.zoom (ZoomManager, zoom.js): createPopover(target,...)/removePopover(target)`. `removePopover` must not remove the toggle button's parent. In the recent-folders menu sentence, `handleWheelZoom` → `ZoomManager.handleWheel`.
  - The pre-commit size warning may report growth: it warns and never blocks. Log what it prints.

- [ ] **Step 3: `.claude/agents/regression-checker.md`.** § 6 Zoom Controls Lifecycle uses the new names (`this.zoom.popovers`, `createPopover`/`removePopover`, `init()`). The v2.0 paragraph changes to "Extracted today: `FullscreenManager` (`fullscreen.js`), `ZoomManager` (`zoom.js`)…", and `ZoomManager` comes off the "Planned" list.

- [ ] **Step 4: `docs/ARCHITECTURE.md`.** In § State Management, replace the three zoom lines (`zoomLevel`, `panX`, `panY`) with `// Zoom and pan: ZoomManager (zoom.js), this.zoom` and `zoom: ZoomManager,`. Nothing else in that block changes (spec § 4.7).

- [ ] **Step 5: Verify.** Re-run Step 1's grep (expected: history only). `npm run lint` and `npm run format:check` → clean. `node scripts/check-docs-index.js` → exit 0.

- [ ] **Step 6: Commit.**

```bash
git add CLAUDE.md .claude/agents/regression-checker.md docs/ARCHITECTURE.md
git commit -m "docs(zoom): CLAUDE.md, the regression checker and ARCHITECTURE name ZoomManager (G3 T4)"
```

---

### Task 5: After evidence, full suites, hand-off

**Files:**
- Create: `docs/superpowers/specs/assets/g3-zoom-single-after.png`, `g3-zoom-compare-after.png`
- Modify: this plan (Progress Log), `docs/README.md` (spec row status)

- [ ] **Step 1: Capture.** `$env:G3_EVIDENCE_STAGE='after'; npx playwright test tests/e2e/visual-evidence.test.js -g "zoom popover"; $env:G3_EVIDENCE_STAGE=$null`. Read both images: same popover, controls and zoomed grid as the before pair.

- [ ] **Step 2: Pixel diff.** `node <scratchpad>/pixel-diff.cjs …-before.png …-after.png` for `single` and `compare`.
Expected: `differing pixels: 0` for both (Task 1 Step 2 showed a re-capture is exact). Any other count is explained before the PR. Log both counts.

- [ ] **Step 3: Full verification.** `npm test`, `npm run lint`, `npm run format:check`, then `npm run test:e2e`. Log the counts: unit passed/skipped, E2E passed/skipped.

- [ ] **Step 4: Commit.**

```bash
git add docs/superpowers/specs/assets/g3-zoom-single-after.png docs/superpowers/specs/assets/g3-zoom-compare-after.png docs/planning/plans/2026-10-26_g3-zoom-manager-extraction.md docs/README.md
git commit -m "docs(zoom): after screenshots, pixel diff and verification log (G3 T5)"
```

- [ ] **Step 5: Hand-off to the user.** This step ends the task: no push, no PR, no review without the user's go-ahead. Report:
  - the line count;
  - the pixel diff;
  - the suite counts;
  - the A–F mutation results;
  - the `typescript-lsp` log.

  Then ask the user for two things:
  - the manual run of MANUAL_TESTING.md L26–29, L38, L87 and L90 on the branch (`npm start`): wheel, double-click, pan, Escape, per-image zoom and the fullscreen cases;
  - a go-ahead to push and open the PR. The PR body carries the spec and plan links, spec § 11's calls, both screenshot pairs inline, the counts and the trial notes.

---

## Closeout (after merge; `~/.claude/rules/planning-closeout.md`)

- [ ] BACKLOG:
  - Check off 🔵 [2026-10-18] "Extract ZoomManager…" and the 🟤 entries in spec § 7 rows 1 (with the screenshot as evidence), 2, 3 and 6.
  - Rename `removeZoomPopover` in row 5's text, and `zoomState`-era names in row 4's.
  - Add `zoom.js` to 🟤 "`docs/ARCHITECTURE.md`'s file tree omits every extracted module".
  - File the Improvements below.
- [ ] WEEKLY: G3 → `✅ PR #N`, its two Daily Schedule rows, and the Summary Table status. DONE.md entry, with the line count and test deltas.
- [ ] REVIEW-QUEUE § 5: hand the `typescript-lsp` log to G6's read-out (no verdict here).
- [ ] Archive this plan to `docs/archive/plans/`, `git rm` the original, and link it from `docs/README.md`.

## Improvements (to BACKLOG 🟤 at closeout)

1. **No control makes a new renderer module join its three lists.** Block 2c, `lint-guard.test.js` `RENDERER_FILES` and `media-url.test.js` `RENDERER_FILES` are kept by hand (spec § 4.7). A test could read `media-viewer.js`'s `import … from './x.js'` lines and assert each module appears in all three (memory `feedback_convention_is_not_a_control`). `tests/`, `eslint.config.mjs`.
2. **The wheel-over-media path has two overlapping guards** (spec § 3.3 item 2): `handleWheel`'s `stopPropagation` and the document handler's `isOverMedia` check. Either alone stops navigation, and the comments at `media-viewer.js` ~L2780–2793 describe them separately. Decide whether both stay, and say so in one comment. Low. `media-viewer.js`, `zoom.js`.
3. **The `grabbing` cursor is lost on the first pan move** (found by T1 case C, run 1). `handlePanStart` sets `cursor: grabbing`, but every `handlePanMove` calls `setZoom`, which writes `grab` whenever `scale > 1`, so mid-drag the cursor reads `grab`. Kept as is here (no behaviour change); case C reads the cursor on the mousedown and its comment says why. A fix would let `setZoom` leave the cursor alone while `isPanning`, and move case C's check after the move. Low (cosmetic). `zoom.js`, `tests/e2e/zoom.test.js`.

## Residuals

- 🟤 rows 4 and 5 (spec § 7) stay open, renamed only.

## Progress Log

- **2026-10-26 (planning session, Opus).**
  - Branch created from `main` @ `5230b69`. `typescript@^6` (6.0.3) installed as a devDependency.
  - The `typescript-lsp` server started: `documentSymbol` on `fullscreen.js` returned the class tree. `findReferences` on `zoomState` (16) and `zoomControlsMap` (10) matched grep exactly.
  - The first diagnostics attachment arrived on `media-viewer.js`: 10 suggestion-level items (`pause` on an image/video union ×6, `'await' has no effect` ×2, `may be converted to an async function`, `electronAPI` on `Window`), none zoom-related, none acted on.
  - Before screenshots committed in `3509bca`. The first capture used photo-like noise (2 MB PNGs) and was amended to generated SVG grids (65–100 KB) before any push.
  - Spec written. Planning found three things:
    1. `getZoomTarget` is dead.
    2. The pan document listeners can move without an observable reorder (no `mousemove`/`mouseup` `stopImmediatePropagation`).
    3. Two of the first-draft mutations could not fail their tests: dropping `stopPropagation` is masked by `isOverMedia`, and the 100% pan is clamped to 0. Both were replaced, spec § 6.1.
  - **A side-agent note at hand-off** warned that only the slider is tested, so wheel, double-click and pan could break with every check green, and that the task says not to take that entry on. It described the state before this plan. Task 1's cases A–J are exactly those paths, each A–F shown able to fail (spec § 11 call 1 takes the entry on). The note is still a reason to run the manual wheel/pan pass in Task 5 Step 5.
  - The user approved the spec and plan ("Looks good"); execution follows a `/compact`.
- **2026-10-26 (execution session, native, Opus 5.5).** The user chose native execution ("go native"). Ledger: `.superpowers/sdd/2026-10-26_g3-zoom-manager-extraction/progress.md` (git-ignored).
  - **Task 1 Step 1.** `writeGridImage` moved to `tests/e2e/fixtures/grid-image.js`; the evidence block imports it. ESLint and Prettier clean.
  - **Step 2, determinism control.** The `control` capture against the committed before images: `single` 0 of 1,494,592 differing pixels, `compare` 0 (the PNGs are byte-identical too, so the moved generator writes the same image). Planted control (`single-before` vs `compare-before`): 1,318,209 of 1,494,592, as measured at planning. The control PNGs were deleted.
  - **Step 4.** Run 1: 12 passed, 1 failed. Case C's mid-drag `toBe('grabbing')` received `"grab"`: every `handlePanMove` calls `setZoom`, which writes `grab` when `scale > 1`, so `grabbing` holds only from the mousedown to the first move. The test was wrong about the app, so the test changed: the check now runs right after the mousedown (comment in the test). The flip is today's behaviour, kept, and filed as Improvement 3. Run 3: **13 passed** (3 existing + 10 new).
  - **Step 5, mutations** (one at a time, each reverted, `git diff --quiet media-viewer.js` clean after each). Every case failed at its named assertion:

    | Case | Edit | Failed at | Message |
    | --- | --- | --- | --- |
    | A | L8958 delta signs swapped | L163 `toHaveText('115%')` | received `"100%"` |
    | B | L397 `[1, 3, 4]` | L174 first `toHaveText` | expected `"200%"`, received `"300%"` |
    | C (edge) | L9000–9001 clamps deleted | L209 the `bound` assertion | expected 412.5, received 1300.23 |
    | C (100%) | L8966 early return deleted | L187 `not.toBe('grabbing')` | received `"grabbing"` |
    | D | L9070 target `'single'` | L216 left `toHaveText('115%')` | received `"100%"` |
    | E | L379 `return false;` | L239 the last `toHaveClass(/fullscreen/)` | received `"media-wrapper left-media-wrapper"` |
    | F (reset) | L3926 deleted | L251 `toHaveText('100%')` | received `"115%"` |
    | F (popover) | L3998 deleted | L252 `not.toHaveClass(/show/)` | received `"zoom-popover show"` |
  - **LSP (trial).**
    - Diagnostics attachment on `tests/e2e/visual-evidence.test.js`: 6133 "`createRequire` is declared but its value is never read", right after the generator moved out. Acted on: the import was replaced with the `writeGridImage` import. ESLint's `no-unused-vars` (warn) covers the same case.
    - On `tests/e2e/zoom.test.js`: 6192/6133 on the new imports. These were transient, between the import edit and the appended cases, and cleared once the uses landed. Not acted on.
    - `media-viewer.js` (not edited in this task) kept receiving suggestion batches of 10: `electronAPI` on `Window` (2568) and `pause` on an image/video/canvas union (2568). These are the planning session's kinds, none zoom-related, and none were acted on.
