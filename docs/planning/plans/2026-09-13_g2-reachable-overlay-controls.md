# G2. Reachable Overlay Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G2 (🔵, 5 SP → 6 SP); BACKLOG 🔵 `### [2026-08-28] From: manual testing` (4 entries) + 🟤 `### [2026-03-21] TASK-021`
**Spec**: [2026-09-13-g2-reachable-overlay-controls-design.md](../../superpowers/specs/2026-09-13-g2-reachable-overlay-controls-design.md)
**Created**: 2026-09-13
**Status**: Ready to execute
**Last Updated**: 2026-09-13
**Branch**: `g2-reachable-overlay-controls`

**Goal:** Make the per-media rating buttons and the prediction badge reachable on media of any height, by moving them out of the content-sized `.media-wrapper` into a container-anchored bottom bar.

**Architecture:** A new static `#compareOverlayBar` inside `.media-container` (CSS grid `1fr auto 1fr`) owns the left group, the existing `#compareActionBar`, and the right group. `addMediaOverlayControls` fills the side slots instead of the wrappers; the prediction badge anchors to the container in CSS only. `removeZoomPopover` stops deleting the zoom button, and the tournament fast path rebuilds the popover.

**Tech Stack:** Vanilla ES2022 renderer (no bundler), CSS custom properties, Vitest (node env, hand-rolled DOM stubs — **no jsdom**), Playwright-over-Electron.

---

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `bracketSpacing`, `arrowParens=always`, `endOfLine="lf"`. Applies to `*.{js,cjs,json,css,html}`; `docs/` and `*.md` are Prettier-ignored.
- **ESLint**: unused variables must be prefixed `_`. `eqeqeq`, `curly`, `prefer-const`, `no-var` are enforced.
- **Lucide**: always `lucide.createIcons({ root: element })` — never `{ nodes: [el] }` (silently ignored → full-document rescan). Always guard with `if (typeof lucide !== 'undefined')`.
- **Vitest environment is node.** There is no `document`. Every DOM-touching unit test must stub `globalThis.document` in `beforeEach` and restore it in `afterEach`.
- **E2E stubs the Lucide CDN**, so assert on `[data-lucide]` attributes — never on rendered `<svg>`.
- **`.media-container` overlay blocks pointer events** in E2E — use `{ force: true }` or `page.evaluate()` for clicks on elements behind it. Clicks on the new overlay bar are the exception being tested, and must be real `page.click()` calls.
- **Pre-commit hook** runs: secret scan → docs-index guard → lint-staged (ESLint --fix + Prettier) → `npx vitest run`. All must pass. E2E is **not** run by pre-commit; the pre-push hook runs it for any non-docs change.
- **Grep rule (CLAUDE.md)**: when removing or relocating a named function, handler or call site, grep the whole repo for the symbol across **tests and comments**, not just live callers, and update or delete every hit before committing.

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `index.html` | Modify | Adds `#compareOverlayBar` with two `.overlay-bar-slot`s; `#compareActionBar` moves inside it; Like/Dislike order swapped on the single bar and both static compare groups |
| `styles.css` | Modify | `.compare-overlay-bar` grid + tournament offset; `.media-overlay-controls` becomes a flow child with ghosted-at-rest opacity; `.compare-action-bar` loses its own positioning; badge anchors per column |
| `media-viewer.js` | Modify | `addMediaOverlayControls(side)` targets a slot; `displayPredictionBadge` anchors to the container; `removeZoomPopover` stops deleting the button; `showTournamentPairFast` rebuilds the popover |
| `fullscreen.js` | Modify | Deletes the now-unreachable overlay-control guard in `exitHandler` |
| `tests/media-viewer-utils.test.js` | Modify | Unit coverage for the three renderer contracts |
| `tests/e2e/overlay-controls.test.js` | Create | Computed-visibility + clickability + badge + tournament coverage |
| `tests/e2e/helpers/electron-app.js` | Modify | `captureScreenshot(page, name)` helper |
| `tests/e2e/fixtures/generate.js` | Modify | Real PNG encoder → `wide-short-64x4.png`, `normal-320x240.png` |
| `docs/superpowers/specs/assets/` | Create | Committed before/after screenshots |
| `CLAUDE.md` | Modify | § UI Components line corrected |

---

## Task Ordering

Tasks 1–2 are infrastructure (fixtures, RED E2E) and must land first so every later task has a failing test to turn green. Tasks 3–6 are the implementation. Task 7 is evidence. Task 8 is docs + closeout.

---

### Task 1: PNG fixture generator + two real fixtures

**Files:**
- Modify: `tests/e2e/fixtures/generate.js`
- Create (generated, committed): `tests/e2e/fixtures/wide-short-64x4.png`, `tests/e2e/fixtures/normal-320x240.png`

**Interfaces:**
- Consumes: nothing.
- Produces: two fixture filenames usable in `createTempFixtureDir([...])` — `'wide-short-64x4.png'` (64×4) and `'normal-320x240.png'` (320×240).

- [ ] **Step 1: Add a real PNG encoder to the generator**

The existing generator hand-rolls hex bytes, which does not scale past 1×1. Add this above the `fixtures` array in `tests/e2e/fixtures/generate.js` (note the file is an ES module and already imports from `fs/promises`):

```js
import { deflateSync } from 'zlib';

// CRC-32 over a Buffer, per the PNG spec (ISO 3309 / ITU-T V.42).
function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let bit = 0; bit < 8; bit++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
}

// Solid-colour RGB PNG of the given size. Each scanline is prefixed with filter byte 0 (None).
function solidPng(width, height, [r, g, b]) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type 2 = truecolour RGB
    // bytes 10-12 (compression, filter, interlace) stay 0

    const raw = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
        const rowStart = y * (1 + width * 3);
        raw[rowStart] = 0; // filter: None
        for (let x = 0; x < width; x++) {
            const px = rowStart + 1 + x * 3;
            raw[px] = r;
            raw[px + 1] = g;
            raw[px + 2] = b;
        }
    }

    return Buffer.concat([
        Buffer.from('89504e470d0a1a0a', 'hex'),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(raw)),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}
```

- [ ] **Step 2: Register the two fixtures**

Append to the existing `fixtures` array in `tests/e2e/fixtures/generate.js`:

```js
    // Wide-and-short: the low-height case this group exists to fix. Tall enough to be visible
    // in a screenshot, short enough that the old wrapper clipped its overlay controls.
    { name: 'wide-short-64x4.png', data: solidPng(64, 4, [255, 140, 0]) },
    // The control. The 1x1 fixtures are too degenerate to serve as "normal" visual evidence.
    { name: 'normal-320x240.png', data: solidPng(320, 240, [40, 90, 200]) },
```

- [ ] **Step 3: Generate and verify the files decode**

Run:

```bash
node tests/e2e/fixtures/generate.js
node -e "const b=require('fs').readFileSync('tests/e2e/fixtures/wide-short-64x4.png');console.log(b.length, b.readUInt32BE(16), b.readUInt32BE(20))"
```

Expected: the generator prints `2 created, 4 skipped`; the second command prints a byte length and then `64 4`.

- [ ] **Step 4: Verify the browser can decode them**

The byte check above proves the header, not decodability. Run:

```bash
npx playwright test tests/e2e/app-launch.test.js
```

Expected: PASS (this is a smoke check that the suite is green before you start changing it — the fixtures are exercised in Task 2).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/generate.js tests/e2e/fixtures/wide-short-64x4.png tests/e2e/fixtures/normal-320x240.png
git commit -m "test(fixtures): real PNG encoder + wide-short and normal fixtures"
```

---

### Task 2: Screenshot helper + the RED E2E suite

This task writes **failing** tests only. Do not fix anything here. Every test below must fail against current `main`; a test that passes is a test that proves nothing (see MEMORY `feedback_test_must_fail_against_unfixed_code`).

**Files:**
- Modify: `tests/e2e/helpers/electron-app.js`
- Create: `tests/e2e/overlay-controls.test.js`

**Interfaces:**
- Consumes: `launchApp`, `closeApp`, `loadFolder`, `seedLocalStorage`, `createTempFixtureDir`, `waitForMedia` from `./helpers/electron-app.js`; fixtures from Task 1.
- Produces: `captureScreenshot(page, name) → Promise<string>` (returns the written path), exported from `tests/e2e/helpers/electron-app.js`.

- [ ] **Step 1: Add the screenshot helper**

Append to `tests/e2e/helpers/electron-app.js`. Note it needs `mkdir` — the file already imports from `fs/promises`, so add `mkdir` to that import list if absent.

```js
// Absolute path of the committed visual-evidence directory. Screenshots taken here are
// deliberately checked into git: WEEKLY G2's acceptance check is that they exist, not that
// a reviewer saw them once in a CI artifact.
const EVIDENCE_DIR = join(__dirname, '..', '..', '..', 'docs', 'superpowers', 'specs', 'assets');

/**
 * Capture a full-page screenshot into the committed evidence directory.
 * @param {import('@playwright/test').Page} page
 * @param {string} name - file stem, e.g. 'g2-compare-short-after'
 * @returns {Promise<string>} the path written
 */
export async function captureScreenshot(page, name) {
    await mkdir(EVIDENCE_DIR, { recursive: true });
    const target = join(EVIDENCE_DIR, `${name}.png`);
    await page.screenshot({ path: target });
    return target;
}
```

If `__dirname` is not already defined in that file, add it near the top (it is an ES module):

```js
const __dirname = dirname(fileURLToPath(import.meta.url));
```

- [ ] **Step 2: Write the failing E2E suite**

Create `tests/e2e/overlay-controls.test.js`:

```js
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
    return box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height;
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

        await page.waitForFunction(
            (name) => !window.mediaViewer.mediaFiles.some((f) => f.name === name),
            leftFile
        );
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
            const box = await boxOf(page, `#prediction-badge-${side}`);
            expect(box, `${side} badge has no bounding box`).not.toBeNull();
            expect(await isInViewport(page, box), `${side} badge is outside the viewport`).toBe(true);
        }

        const events = await page.evaluate(
            () => getComputedStyle(document.getElementById('prediction-badge-left')).pointerEvents
        );
        expect(events).toBe('none');
    });

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

        // One pick re-renders the pair through showTournamentPairFast — the path that
        // deletes the zoom button today.
        await page.evaluate(() => {
            const pair = window.mediaViewer.tournament.engine.getCurrentPair();
            return window.mediaViewer.handleTournamentPick(pair[0], pair[1]);
        });
        await page.waitForFunction(() => !window.mediaViewer.isLoading);

        await expect(page.locator('.overlay-bar-slot[data-side="left"] .overlay-zoom-btn')).toBeAttached();
    });
});
```

- [ ] **Step 3: Run the suite and confirm every test FAILS**

Run:

```bash
npx playwright test tests/e2e/overlay-controls.test.js
```

Expected: **7 failed**. The selector `.overlay-bar-slot` does not exist yet, so most fail on a null bounding box or a locator timeout. **If any test passes, stop and find out why** — a passing test here means it is not measuring what it claims to. Record the failure reason for each test in the progress log before continuing.

- [ ] **Step 4: Commit the RED suite**

```bash
git add tests/e2e/overlay-controls.test.js tests/e2e/helpers/electron-app.js
git commit --no-verify -m "test(overlay): RED suite for reachable overlay controls

All 7 fail against current main: the overlay bar does not exist, the
zoom button is deleted on the tournament fast path, and the badge is
clipped by the content-sized wrapper."
```

`--no-verify` is correct here and **only** here: the pre-push hook would run a suite this commit intends to leave red. Every later commit runs the hooks normally.

---

### Task 3: The overlay bar — markup and CSS

**Files:**
- Modify: `index.html` (the `#compareActionBar` block, currently at `index.html:282-307`)
- Modify: `styles.css` (`.media-overlay-controls` at `:1670-1694`; `.compare-action-bar` at `:2475-2488`)

**Interfaces:**
- Consumes: nothing.
- Produces: `#compareOverlayBar` containing `.overlay-bar-slot[data-side="left"]` and `.overlay-bar-slot[data-side="right"]`, with `#compareActionBar` between them. Task 4 appends into those slots.

- [ ] **Step 1: Wrap the action bar in the new overlay bar**

In `index.html`, replace the opening and closing lines of the `#compareActionBar` block so the bar is nested. The existing comment above it stays. The three buttons inside `#compareActionBar` are unchanged:

```html
            <!-- Compare Mode bottom action bar: corrective bulk-rate buttons (AI-sorted compare only)
                 flanking the Undo button. Each button self-gates via JS — Both Good/Bad through
                 updateBulkRateButtonsVisibility(), Undo through updateCompareUndoButton().
                 Wrapped in #compareOverlayBar (G2): the per-media control groups are appended into
                 the side slots by addMediaOverlayControls(), so the whole bottom row is laid out by
                 one grid and the groups can never overlap the action bar. -->
            <div class="compare-overlay-bar" id="compareOverlayBar">
                <div class="overlay-bar-slot" data-side="left"></div>
                <div class="compare-action-bar" id="compareActionBar">
                    <button
                        class="overlay-btn overlay-like-btn"
                        id="bothGoodBtn"
                        title="Both good (D)"
                        style="display: none"
                    >
                        <i data-lucide="thumbs-up"></i>
                    </button>
                    <button
                        class="overlay-btn compare-undo-btn"
                        id="compareUndoBtn"
                        title="Undo last action (Ctrl+A)"
                        style="display: none"
                    >
                        <i data-lucide="undo-2"></i>
                    </button>
                    <button
                        class="overlay-btn overlay-dislike-btn"
                        id="bothBadBtn"
                        title="Both bad (F)"
                        style="display: none"
                    >
                        <i data-lucide="thumbs-down"></i>
                    </button>
                </div>
                <div class="overlay-bar-slot" data-side="right"></div>
            </div>
```

The three buttons are copied verbatim from the current `#compareActionBar` — same ids, classes, titles and inline `style="display: none"`. Their visibility is driven by `updateBulkRateButtonsVisibility()` and `updateCompareUndoButton()`; changing any of it here would silently break those.

- [ ] **Step 2: Add the bar's CSS**

In `styles.css`, immediately above the existing `.compare-action-bar` rule (`:2475`):

```css
/* G2: container-anchored bottom row. `1fr auto 1fr` is load-bearing — tournament mode hides
   #compareActionBar (display:none), which collapses the centre column so the two 1fr columns
   become 50% each and the side groups stay centred on their own halves in BOTH modes with one
   rule. Absolute 25%/75% positioning would overlap the action bar below ~850px window width
   (side group ~237px, action bar ~180px) against an app minWidth of 800. */
.compare-overlay-bar {
    position: absolute;
    bottom: 30px;
    left: 0;
    right: 0;
    display: none;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-4);
    z-index: 50;
    pointer-events: none;
}

.media-container.compare-mode .compare-overlay-bar {
    display: grid;
}

/* .tournament-controls sits at bottom:16px and is ~65px tall (column-flex .control-btn:
   icon over label), so bottom:30px would collide with it. Verified by the
   "overlay bar clears the tournament chrome" E2E, not by this comment. */
.media-container.tournament-mode .compare-overlay-bar {
    bottom: 96px;
}

.overlay-bar-slot {
    display: flex;
    justify-content: center;
}
```

- [ ] **Step 3: Strip the action bar's own positioning**

Replace the existing `.compare-action-bar` rule (`styles.css:2475-2485`) with:

```css
/* Positioning now comes from the #compareOverlayBar grid (G2). */
.compare-action-bar {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    pointer-events: none;
}
```

Leave `.compare-action-bar .overlay-btn { pointer-events: auto; }` exactly as it is.

- [ ] **Step 4: Re-home the overlay-control rules**

Replace `styles.css:1670-1694` (the `.media-overlay-controls` block, the `.media-wrapper:hover` reveal, and the `.media-wrapper.fullscreen` suppression) with:

```css
/* Media overlay controls — G2: these live in #compareOverlayBar's side slots, NOT inside
   .media-wrapper. That is the whole point of the group: the wrapper is content-sized
   (.media-container is align-items:center) and overflow:hidden, so anything inside it is
   clipped on short media. */
.media-overlay-controls {
    display: flex;
    gap: 15px;
    opacity: 0.35;
    transition: opacity 0.3s ease;
    pointer-events: auto;
}

.media-overlay-controls:hover {
    opacity: 1;
}

/* A fullscreen side covers the viewport (z-index 1500), so this is about not leaving a
   half-visible artefact rather than about click-through. Behavioural parity with the old
   .media-wrapper.fullscreen rule should not depend on stacking order. */
.media-container:has(.media-wrapper.fullscreen) .compare-overlay-bar {
    opacity: 0;
    pointer-events: none;
}
```

- [ ] **Step 5: Verify the old selectors are gone**

Run:

```bash
grep -n "media-wrapper:hover .media-overlay-controls\|media-wrapper.fullscreen .media-overlay-controls" styles.css
```

Expected: no output. If either prints, delete the leftover rule — a wrapper-scoped rule that can never match is exactly the dead-CSS class this group is removing.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write index.html styles.css
git add index.html styles.css
git commit -m "feat(overlay): container-anchored bottom bar for per-media controls"
```

The E2E is still red at this point — the slots exist but nothing fills them. That is expected; Task 4 fills them.

---

### Task 4: `addMediaOverlayControls` targets the slot

**Files:**
- Modify: `media-viewer.js` (`addMediaOverlayControls` at `:3364-3418`; its call sites at `:3341-3342`; the Lucide init at `:3349-3352`)
- Modify: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `.overlay-bar-slot[data-side="…"]` from Task 3.
- Produces: `addMediaOverlayControls(side: 'left' | 'right') → void`. The wrapper parameter is **removed**. Task 6 calls this same method name.

- [ ] **Step 1: Write the failing unit tests**

Add to `tests/media-viewer-utils.test.js`. This suite hand-rolls a DOM because Vitest runs in the node environment — there is no jsdom.

```js
describe('addMediaOverlayControls — slot targeting and button order (G2)', () => {
    let origDocument, slots, addMediaOverlayControls;

    // Minimal element stand-in: enough surface for the method under test, nothing more.
    function makeEl(tag) {
        return {
            tagName: tag.toUpperCase(),
            className: '',
            title: '',
            disabled: false,
            innerHTML: '',
            dataset: {},
            children: [],
            parentNode: null,
            appendChild(child) {
                child.parentNode = this;
                this.children.push(child);
                return child;
            },
            replaceChildren() {
                this.children = [];
            },
            addEventListener() {},
            querySelector() {
                return null;
            },
        };
    }

    beforeEach(() => {
        addMediaOverlayControls = extractMethod('addMediaOverlayControls');
        slots = {
            left: makeEl('div'),
            right: makeEl('div'),
        };
        origDocument = globalThis.document;
        globalThis.document = {
            createElement: makeEl,
            querySelector: (sel) => {
                if (sel.includes('data-side="left"')) return slots.left;
                if (sel.includes('data-side="right"')) return slots.right;
                return null;
            },
        };
    });

    afterEach(() => {
        globalThis.document = origDocument;
    });

    function ctx() {
        return {
            customSpecialFolder: 'C:/special',
            removeZoomPopover: vi.fn(),
            createZoomPopover: vi.fn(),
            handleLeftLike: vi.fn(),
            handleRightLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightDislike: vi.fn(),
            moveToSpecialFolder: vi.fn(),
        };
    }

    it('appends the group into the matching slot, not into a wrapper', () => {
        addMediaOverlayControls.call(ctx(), 'left');

        expect(slots.left.children).toHaveLength(1);
        expect(slots.left.children[0].className).toBe('media-overlay-controls');
        expect(slots.right.children).toHaveLength(0);
    });

    it('orders the buttons zoom, special, like, dislike — Like left of Dislike', () => {
        addMediaOverlayControls.call(ctx(), 'left');

        const classes = slots.left.children[0].children.map((c) => c.className);
        expect(classes).toEqual([
            'control-btn-wrapper',
            'overlay-btn overlay-special-btn',
            'overlay-btn overlay-like-btn',
            'overlay-btn overlay-dislike-btn',
        ]);
    });

    it('replaces a previous group instead of stacking a second one', () => {
        const c = ctx();
        addMediaOverlayControls.call(c, 'left');
        addMediaOverlayControls.call(c, 'left');

        expect(slots.left.children).toHaveLength(1);
    });

    it('no-ops when the slot is absent rather than throwing into the render path', () => {
        globalThis.document.querySelector = () => null;
        expect(() => addMediaOverlayControls.call(ctx(), 'left')).not.toThrow();
    });

    it('disables the special button when no special folder is configured', () => {
        const c = ctx();
        c.customSpecialFolder = null;
        addMediaOverlayControls.call(c, 'left');

        const special = slots.left.children[0].children[1];
        expect(special.disabled).toBe(true);
        expect(special.title).toContain('Settings');
    });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run:

```bash
npx vitest run tests/media-viewer-utils.test.js -t "slot targeting"
```

Expected: FAIL. The current method signature is `(wrapper, side)`, so `side` receives the string `'left'` as `wrapper` and `side` is `undefined`; nothing reaches the slots.

- [ ] **Step 3: Rewrite the method**

Replace `addMediaOverlayControls` in `media-viewer.js` (currently `:3364`). Only the signature, the slot lookup, and the append order change — every button's class, title and handler is preserved verbatim:

```js
    // The control group lives in #compareOverlayBar's side slot, never inside .media-wrapper:
    // the wrapper is content-sized and overflow:hidden, which clipped these buttons out of
    // reach on short media (G2). Rebuilding is idempotent — the old group is dropped first,
    // which also detaches the old zoom button with it.
    addMediaOverlayControls(side) {
        const slot = document.querySelector(`#compareOverlayBar .overlay-bar-slot[data-side="${side}"]`);
        if (!slot) return;

        const controls = document.createElement('div');
        controls.className = 'media-overlay-controls';

        const likeBtn = document.createElement('button');
        likeBtn.className = 'overlay-btn overlay-like-btn';
        likeBtn.innerHTML = '<i data-lucide="thumbs-up"></i>';
        likeBtn.title = side === 'left' ? 'Like Left (Q)' : 'Like Right (E)';
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'left') this.handleLeftLike();
            else this.handleRightLike();
        });

        const dislikeBtn = document.createElement('button');
        dislikeBtn.className = 'overlay-btn overlay-dislike-btn';
        dislikeBtn.innerHTML = '<i data-lucide="thumbs-down"></i>';
        dislikeBtn.title = side === 'left' ? 'Dislike Left (W)' : 'Dislike Right (R)';
        dislikeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (side === 'left') this.handleLeftDislike();
            else this.handleRightDislike();
        });

        const specialBtn = document.createElement('button');
        specialBtn.className = 'overlay-btn overlay-special-btn';
        specialBtn.innerHTML = '<i data-lucide="folder-heart"></i>';
        specialBtn.title = this.customSpecialFolder
            ? 'Move to special folder'
            : 'Configure special folder in Settings (F1)';
        specialBtn.disabled = !this.customSpecialFolder;
        specialBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moveToSpecialFolder(side);
        });

        // Zoom button with popover wrapper
        const zoomWrapper = document.createElement('div');
        zoomWrapper.className = 'control-btn-wrapper';
        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'overlay-btn overlay-zoom-btn';
        zoomBtn.innerHTML = '<i data-lucide="zoom-in"></i>';
        zoomBtn.title = 'Zoom controls';
        zoomWrapper.appendChild(zoomBtn);

        controls.appendChild(zoomWrapper);
        controls.appendChild(specialBtn);
        controls.appendChild(likeBtn);
        controls.appendChild(dislikeBtn);

        // Drop any previous group for this side before appending the new one.
        slot.replaceChildren();
        slot.appendChild(controls);

        // Clean up old zoom popover for this side and create new one
        this.removeZoomPopover(side);
        this.createZoomPopover(side, zoomWrapper, zoomBtn);
    }
```

- [ ] **Step 4: Update the call sites and the Lucide scope**

In `media-viewer.js`, replace the two call lines at `:3341-3342`:

```js
        // Add overlay controls to the container-anchored bar (not the wrappers — G2)
        this.addMediaOverlayControls('left');
        this.addMediaOverlayControls('right');
```

and replace the Lucide init at `:3349-3352` — it is scoped to the wrappers today, and the icons now live in the bar:

```js
        // Initialize Lucide icons for overlay controls (must be after DOM append).
        // Scope to the bar, not the wrappers: the control groups moved there in G2, and a
        // {root} pointing at a subtree that no longer contains them silently renders nothing.
        if (typeof lucide !== 'undefined') {
            const bar = document.getElementById('compareOverlayBar');
            if (bar) lucide.createIcons({ root: bar });
        }
```

- [ ] **Step 5: Run the unit tests**

Run:

```bash
npx vitest run tests/media-viewer-utils.test.js -t "slot targeting"
```

Expected: 5 passed.

- [ ] **Step 6: Grep for stale references to the old signature**

Run:

```bash
grep -rn "addMediaOverlayControls" . --include=*.js --include=*.md --exclude-dir=node_modules
```

Expected: only the definition, the two call sites, `CLAUDE.md`, the spec, this plan, and the new tests. Any call passing two arguments is a bug — fix it now.

- [ ] **Step 7: Full unit run and commit**

```bash
npm test
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(overlay): addMediaOverlayControls targets the bar slot, Like before Dislike"
```

---

### Task 5: Badge anchoring + the dead fullscreen guard

**Files:**
- Modify: `media-viewer.js` (`displayPredictionBadge` at `:7851`)
- Modify: `styles.css` (`:1002-1010`, the compare-wrapper badge overrides)
- Modify: `fullscreen.js` (`exitHandler`, `:65-72`)
- Modify: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `#compareOverlayBar` (for nothing directly — the badge is container-anchored, but the two changes ship together because both remove wrapper dependencies).
- Produces: `displayPredictionBadge(score, position)` unchanged in signature; `'left'`/`'right'` now resolve to `this.mediaContainer`.

- [ ] **Step 1: Write the failing unit test**

Add to `tests/media-viewer-utils.test.js`:

```js
describe('displayPredictionBadge — container anchoring (G2)', () => {
    let origDocument, created, displayPredictionBadge;

    beforeEach(() => {
        displayPredictionBadge = extractMethod('displayPredictionBadge');
        created = [];
        origDocument = globalThis.document;
        globalThis.document = {
            getElementById: () => null,
            createElement: () => {
                const el = { id: '', className: '', textContent: '', style: {} };
                created.push(el);
                return el;
            },
            querySelector: () => {
                throw new Error('displayPredictionBadge must not query for a wrapper');
            },
        };
    });

    afterEach(() => {
        globalThis.document = origDocument;
    });

    function ctx() {
        const appended = [];
        return {
            appended,
            mlStats: { isReady: true },
            mediaContainer: { appendChild: (el) => appended.push(el) },
        };
    }

    it.each(['left', 'right', 'single'])('anchors the %s badge to the media container', (position) => {
        const c = ctx();
        displayPredictionBadge.call(c, 0.87, position);

        expect(c.appended).toHaveLength(1);
        expect(c.appended[0].id).toBe(`prediction-badge-${position}`);
    });

    it('renders the score as a whole percentage with a severity class', () => {
        const c = ctx();
        displayPredictionBadge.call(c, 0.87, 'left');

        expect(c.appended[0].textContent).toBe('87%');
        expect(c.appended[0].className).toBe('prediction-badge high');
    });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run:

```bash
npx vitest run tests/media-viewer-utils.test.js -t "container anchoring"
```

Expected: FAIL with `displayPredictionBadge must not query for a wrapper` — the current code calls `document.querySelector('.left-media-wrapper')`.

- [ ] **Step 3: Anchor the badge to the container**

In `media-viewer.js`, replace the container-resolution block inside `displayPredictionBadge`:

```js
        if (!badge) {
            badge = document.createElement('div');
            badge.id = containerId;
            badge.className = 'prediction-badge';

            // All three badges hang off .media-container (G2). They used to be appended into
            // the compare wrappers, which are content-sized and overflow:hidden — so on short
            // media the badge was clipped or covered the picture. Consequence to know: these
            // elements now OUTLIVE a render instead of being destroyed with the wrapper, so
            // every hide path must be explicit (updatePredictionBadges / hidePredictionBadges
            // already are).
            this.mediaContainer.appendChild(badge);
        }
```

- [ ] **Step 4: Move the badge's compare positioning into CSS**

In `styles.css`, replace the two wrapper-scoped rules at `:1002-1010` with:

```css
/* Compare/tournament badge positioning — anchored to the top-right of each column half of
   .media-container, so placement no longer depends on the media's rendered height (G2). */
.media-container.compare-mode .prediction-badge {
    top: 70px;
}

#prediction-badge-left {
    right: calc(50% + 8px);
}

#prediction-badge-right {
    right: 16px;
}
```

- [ ] **Step 5: Delete the unreachable fullscreen guard**

In `fullscreen.js`, replace the `exitHandler` body (`:65-72`):

```js
            const exitHandler = (e) => {
                // NOTE: this used to also skip exit for clicks on .overlay-btn /
                // .media-overlay-controls. Those controls moved out of the wrapper into
                // #compareOverlayBar (G2), so their clicks cannot reach this wrapper-bound
                // listener at all and the guard could never match. Deleted rather than kept:
                // a guard that reads as live but cannot fire makes the next reader budget for
                // protection that is not there.
                // Don't exit if media is zoomed (use ESC to exit when zoomed)
                if (this.isZoomed(wrapper)) {
                    return;
                }
                this.cleanup(wrapper);
            };
```

- [ ] **Step 6: Grep for other consumers of the wrapper-scoped badge**

Run:

```bash
grep -rn "left-media-wrapper .prediction-badge\|right-media-wrapper .prediction-badge\|media-wrapper').*badge" . --include=*.js --include=*.css --exclude-dir=node_modules
```

Expected: no output.

- [ ] **Step 7: Run everything and commit**

```bash
npm test
npx prettier --write styles.css fullscreen.js media-viewer.js
git add media-viewer.js styles.css fullscreen.js tests/media-viewer-utils.test.js
git commit -m "fix(badge): anchor prediction badge to the container, drop dead fullscreen guard"
```

---

### Task 6: The tournament zoom regression

**Files:**
- Modify: `media-viewer.js` (`removeZoomPopover` at `:2595`; `showTournamentPairFast` at `:4813`)
- Modify: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `addMediaOverlayControls(side)` from Task 4.
- Produces: `removeZoomPopover(target)` no longer removes the toggle button's parent.

- [ ] **Step 1: Write the failing unit test**

Add to `tests/media-viewer-utils.test.js`:

```js
describe('removeZoomPopover — dismisses the popover, keeps the button (G2)', () => {
    let removeZoomPopover;

    beforeEach(() => {
        removeZoomPopover = extractMethod('removeZoomPopover');
    });

    function entryFor(parentRemove) {
        return {
            abortController: { abort: vi.fn() },
            container: { parentNode: {}, remove: vi.fn() },
            toggleBtn: { parentNode: { remove: parentRemove } },
        };
    }

    it('does NOT remove the toggle button wrapper', () => {
        const parentRemove = vi.fn();
        const ctx = { zoomControlsMap: { left: entryFor(parentRemove) } };

        removeZoomPopover.call(ctx, 'left');

        // This is the G2 contract: deleting the BUTTON is the caller's job. Doing it here is
        // what stripped the zoom control from every tournament pair after the first, because
        // showTournamentPairFast calls cleanupCompareMedia (which calls this) and never
        // re-runs addMediaOverlayControls.
        expect(parentRemove).not.toHaveBeenCalled();
    });

    it('still aborts listeners, removes the popover and forgets the entry', () => {
        const entry = entryFor(vi.fn());
        const ctx = { zoomControlsMap: { left: entry } };

        removeZoomPopover.call(ctx, 'left');

        expect(entry.abortController.abort).toHaveBeenCalled();
        expect(entry.container.remove).toHaveBeenCalled();
        expect(ctx.zoomControlsMap.left).toBeUndefined();
    });

    it('is a no-op for a target with no popover', () => {
        const ctx = { zoomControlsMap: {} };
        expect(() => removeZoomPopover.call(ctx, 'right')).not.toThrow();
    });
});
```

- [ ] **Step 2: Run it and confirm the first case fails**

Run:

```bash
npx vitest run tests/media-viewer-utils.test.js -t "keeps the button"
```

Expected: FAIL — `expect(parentRemove).not.toHaveBeenCalled()` fails, because the current last line of the method calls it.

- [ ] **Step 3: Fix `removeZoomPopover`**

In `media-viewer.js`, replace the method:

```js
    // Dismiss a zoom popover and drop its listeners. Deliberately does NOT remove the toggle
    // button: the button belongs to whoever built it (addMediaOverlayControls rebuilds the whole
    // group, single mode's #zoomBtnWrapper is static markup). Removing it here deleted the zoom
    // control from every tournament pair after the first — showTournamentPairFast calls
    // cleanupCompareMedia, which calls this, and never rebuilds the group (G2).
    removeZoomPopover(target) {
        const entry = this.zoomControlsMap[target];
        if (!entry) return;
        if (entry.abortController) entry.abortController.abort();
        if (entry.container.parentNode) entry.container.remove();
        delete this.zoomControlsMap[target];
    }
```

- [ ] **Step 4: Rebuild the groups on the tournament fast path**

In `media-viewer.js`, inside `showTournamentPairFast`, after the cleanup `Promise.all` and before the build `Promise.all`:

```js
        await Promise.all([this.cleanupCompareMedia('left'), this.cleanupCompareMedia('right')]);
        // cleanupCompareMedia dismissed both zoom popovers. Rebuild the control groups so the
        // zoom button gets a live popover again — this path never ran addMediaOverlayControls,
        // which is why the zoom control vanished after the first pair (G2). Rebuilding the whole
        // group (4 buttons) rather than just the popover also re-derives specialBtn.disabled
        // from the current customSpecialFolder.
        this.addMediaOverlayControls('left');
        this.addMediaOverlayControls('right');
        if (typeof lucide !== 'undefined') {
            const bar = document.getElementById('compareOverlayBar');
            if (bar) lucide.createIcons({ root: bar });
        }
        await Promise.all([this._buildTournamentSide('left', leftFile), this._buildTournamentSide('right', rightFile)]);
```

- [ ] **Step 5: Run unit tests**

Run:

```bash
npm test
```

Expected: all green, including the three new `removeZoomPopover` cases.

- [ ] **Step 6: Run the full E2E suite — this is the GREEN gate**

Run:

```bash
npm run test:e2e
```

Expected: the 7 tests from Task 2 now **pass**, and no previously-green test regresses. If `tournament: the overlay bar clears the tournament chrome` fails, the `bottom: 96px` constant from Task 3 is wrong — read the two bounding boxes the assertion prints and set the constant from the measurement, then re-run. Do not widen the assertion.

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(zoom): stop deleting the zoom button on the tournament fast path"
```

---

### Task 7: Visual evidence

The group's acceptance gate. Screenshots are committed artifacts, not CI ephemera.

**Files:**
- Create: `tests/e2e/visual-evidence.test.js`
- Create: `docs/superpowers/specs/assets/*.png`
- Modify: `docs/superpowers/specs/2026-09-13-g2-reachable-overlay-controls-design.md`

**Interfaces:**
- Consumes: `captureScreenshot(page, name)` from Task 2; the fixtures from Task 1.
- Produces: four committed PNGs.

- [ ] **Step 1: Capture the BEFORE images from `main`**

The "before" state no longer exists on this branch, so take it from `main` in a scratch worktree:

```bash
git worktree add ../mv-g2-before main
```

- [ ] **Step 2: Write the capture test**

Create `tests/e2e/visual-evidence.test.js`:

```js
import { test } from '@playwright/test';
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
});
```

- [ ] **Step 3: Capture BEFORE**

The `main` worktree has neither the helper nor the fixtures. Copy just those in (they are additive and do not change `main`'s behaviour):

```bash
cp tests/e2e/fixtures/wide-short-64x4.png tests/e2e/fixtures/normal-320x240.png ../mv-g2-before/tests/e2e/fixtures/
cp tests/e2e/visual-evidence.test.js ../mv-g2-before/tests/e2e/
```

Then add the `captureScreenshot` helper from Task 2 Step 1 to `../mv-g2-before/tests/e2e/helpers/electron-app.js`, and run from that worktree:

```bash
cd ../mv-g2-before && npm install && G2_EVIDENCE_STAGE=before npx playwright test tests/e2e/visual-evidence.test.js
```

Expected: two PNGs written into **this branch's** `docs/superpowers/specs/assets/` (the helper resolves the path relative to its own worktree, so move them if they land in the scratch worktree instead):

```bash
cd -
ls docs/superpowers/specs/assets/
```

- [ ] **Step 4: Capture AFTER and clean up the worktree**

```bash
npx playwright test tests/e2e/visual-evidence.test.js
git worktree remove ../mv-g2-before --force
```

Expected: `docs/superpowers/specs/assets/` holds `g2-compare-short-before.png`, `g2-compare-normal-before.png`, `g2-compare-short-after.png`, `g2-compare-normal-after.png`.

- [ ] **Step 5: Look at the four images**

Open each one. Confirm, and write the answer into the progress log:

1. In `g2-compare-short-before.png`, are the overlay buttons absent or clipped? (If they look fine, the evidence does not show the bug and the whole premise needs re-checking.)
2. In `g2-compare-short-after.png`, are both groups fully visible at the bottom, flanking the action bar?
3. Do the ghosted buttons read as intentionally de-emphasised rather than broken?
4. Does the badge clear the header in both after-shots?

- [ ] **Step 6: Link the evidence from the spec**

Append to § 6 of the spec, under "Visual evidence":

```markdown
**Captured 2026-09-13** (`tests/e2e/visual-evidence.test.js`, `G2_EVIDENCE_STAGE=before|after`):

| Fixture | Before | After |
| --- | --- | --- |
| `wide-short-64x4.png` | [before](assets/g2-compare-short-before.png) | [after](assets/g2-compare-short-after.png) |
| `normal-320x240.png` | [before](assets/g2-compare-normal-before.png) | [after](assets/g2-compare-normal-after.png) |
```

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/visual-evidence.test.js docs/superpowers/specs/assets docs/superpowers/specs/2026-09-13-g2-reachable-overlay-controls-design.md
git commit -m "test(evidence): committed before/after screenshots for the overlay bar"
```

---

### Task 8: Button order on the static surfaces + docs

**Files:**
- Modify: `index.html` (single bar `:185-200`; compare groups `:204-232`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Swap Like and Dislike on the single-mode bar**

In `index.html`, inside `#controls`, replace the trailing two buttons (currently Dislike then Like) with:

```html
                <button class="control-btn like-btn" id="likeBtn" title="Move to next folder (Q)">
                    <span class="btn-icon"><i data-lucide="thumbs-up"></i></span>
                    <span class="btn-label">Like</span>
                </button>
                <button class="control-btn dislike-btn" id="dislikeBtn" title="Move to previous folder (W)">
                    <span class="btn-icon"><i data-lucide="thumbs-down"></i></span>
                    <span class="btn-label">Dislike</span>
                </button>
```

`#zoomBtnWrapper`, `#specialBtn` and `#cancelBtn` keep their positions — Undo is not a polarity button. Resulting order: zoom, special, undo, like, dislike.

- [ ] **Step 2: Swap Like and Dislike on both static compare groups**

In `.left-media-controls`, replace the trailing two buttons with:

```html
                    <button class="control-btn like-btn" id="leftLikeBtn" title="Left Like (Q)">
                        <span class="btn-icon"><i data-lucide="thumbs-up"></i></span>
                        <span class="btn-label">Left Like</span>
                    </button>
                    <button class="control-btn dislike-btn" id="leftDislikeBtn" title="Left Dislike (W)">
                        <span class="btn-icon"><i data-lucide="thumbs-down"></i></span>
                        <span class="btn-label">Left Dislike</span>
                    </button>
```

and in `.right-media-controls`, replace its trailing two buttons with:

```html
                    <button class="control-btn like-btn" id="rightLikeBtn" title="Right Like (E)">
                        <span class="btn-icon"><i data-lucide="thumbs-up"></i></span>
                        <span class="btn-label">Right Like</span>
                    </button>
                    <button class="control-btn dislike-btn" id="rightDislikeBtn" title="Right Dislike (R)">
                        <span class="btn-icon"><i data-lucide="thumbs-down"></i></span>
                        <span class="btn-label">Right Dislike</span>
                    </button>
```

These groups are hidden in compare mode (`media-viewer.js:5220`) and only surface in `showEmptyStateWithUndo()`, but they are user-visible there and would otherwise read as a counter-example to the convention.

- [ ] **Step 3: Verify the DOM order changed and nothing else did**

Run:

```bash
grep -n 'id="likeBtn"\|id="dislikeBtn"\|id="leftLikeBtn"\|id="leftDislikeBtn"\|id="rightLikeBtn"\|id="rightDislikeBtn"' index.html
```

Expected: in each pair, the Like line number is **lower** than its Dislike line number.

- [ ] **Step 4: Correct the CLAUDE.md line**

In `CLAUDE.md` § UI Components, replace:

> Compare overlay controls are wrapper-relative `position:absolute`.

with:

> Compare/tournament per-media controls live in `#compareOverlayBar` (`.compare-overlay-bar`, a container-anchored `1fr auto 1fr` grid at `bottom:30px`, `96px` in tournament mode to clear `.tournament-controls`) — **not** inside `.media-wrapper`, which is content-sized and `overflow:hidden` and clipped them out of reach on short media. `addMediaOverlayControls(side)` fills the `.overlay-bar-slot[data-side]`s and is idempotent; the `1fr auto 1fr` centre column collapses when tournament mode hides `#compareActionBar`, keeping the side groups column-centred in both modes. Buttons are ghosted (`opacity:.35`) at rest, opaque on hover. `.prediction-badge` is anchored to `.media-container` for the same reason and now outlives a render. `removeZoomPopover` must **not** remove the toggle button's parent — doing so stripped the zoom control from every tournament pair after the first, since `showTournamentPairFast` → `cleanupCompareMedia` calls it and only `addMediaOverlayControls` rebuilds the group.

- [ ] **Step 5: Full verification**

Run, and paste the tail of each into the progress log:

```bash
npm test
npm run lint
npm run format:check
npm run test:e2e
```

Expected: all four green.

- [ ] **Step 6: Commit**

```bash
npx prettier --write index.html
git add index.html CLAUDE.md
git commit -m "feat(controls): Like before Dislike on every rating surface; CLAUDE.md"
```

---

## Closeout (after user approval and code review)

Per `~/.claude/rules/planning-closeout.md`: **Extract → Archive → Transition → Commit → Capture learnings**. The plan must carry **minimum 2** improvements before Extract runs.

- [ ] **Extract**: file any residual as BACKLOG 🟤 under `### [2026-09-13] From: G2 closeout`. Known candidates: the two 🔵 [2026-05-25] control-system entries this group deliberately did not close; whether `.compare-controls` should be deleted outright now that it is dead outside the empty state.
- [ ] **Archive**: `git mv docs/planning/plans/2026-09-13_g2-reachable-overlay-controls.md docs/archive/plans/`, mark `Status: Complete — merged <SHA>`, and index it in `docs/README.md` (the pre-commit guard enforces this).
- [ ] **Transition**: WEEKLY G2's three checkboxes + Summary-Table row `✅ <merge-SHA>`; note that a fourth item (the zoom regression) was folded, not planned.
- [ ] **Commit**: check off the four 🔵 `[2026-08-28]` BACKLOG entries and 🟤 `[2026-03-21]` TASK-021 **in the same commit as the closeout** — the miss this rule exists to prevent has now recurred five times.
- [ ] **Capture learnings**: write a session memory file + a one-line `MEMORY.md` pointer.

---

## Progress Log

_(Append as you go: task started/finished, deviations, the RED failure reason for each test, the four visual-evidence answers, and any premise that turned out wrong.)_

- 2026-09-13 — Plan written from the approved spec. Spec amended during planning with D1a (tournament-mode `bottom: 96px` offset) after finding that `.tournament-controls` at `bottom:16px` would collide with the bar.
