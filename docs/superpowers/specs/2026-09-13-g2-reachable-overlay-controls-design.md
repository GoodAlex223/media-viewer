# G2 Reachable Overlay Controls — Design Spec

**Task Reference**: WEEKLY.md Sep 7–11 § G2 (🔵, 5 SP → **6 SP**, see § 7) ← BACKLOG 🔵 `### [2026-08-28] From: manual testing` batches 3 + 5 (4 entries) + 🟤 `### [2026-03-21] TASK-021` (folded)
**Created**: 2026-09-13
**Status**: Draft — awaiting user review
**Branch**: `g2-reachable-overlay-controls` (no PR unless requested, per the week's branch/PR shape)

---

## 1. Goal

Make the per-media rating controls and the prediction badge reachable **regardless of media height**, in
compare and tournament mode, by removing the geometric coupling between the controls and the media
wrapper that contains them.

| #   | Item                                                            | Files                                                     | Source                                        |
| --- | --------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| 1   | Window-anchored per-media overlay buttons (compare + tournament) | `index.html`, `styles.css`, `media-viewer.js`, `fullscreen.js` | 🔵 [2026-08-28] ×2, folds 🟤 [2026-03-21] TASK-021 |
| 2   | Prediction badge out of the wrapper                              | `styles.css`, `media-viewer.js`                            | 🔵 [2026-08-28]                                |
| 3   | Like left / Dislike right on every rating surface                | `index.html`, `media-viewer.js`                            | 🔵 [2026-08-28]                                |
| 4   | **Folded in**: tournament zoom button disappears after pair 1    | `media-viewer.js`                                          | found during this design pass (§ 2 F4)        |
| 5   | Visual evidence + computed-visibility E2E                        | `tests/e2e/`, `docs/superpowers/specs/assets/`             | WEEKLY G2 acceptance check                    |

**Non-goals.** No change to rating semantics, tournament pairing, the ML sort, or the zoom interaction
model. No responsive / mode-aware control-system overhaul (BACKLOG 🔵 [2026-05-25] stays open — this spec
touches only the geometry that clips the buttons).

---

## 2. Findings that changed the design

Five claims in the tracking docs or in the plan text did not survive a read of the current code.

### F1 — The static compare bottom bars are effectively dead UI (scopes item 3)

WEEKLY item 3 says "all four surfaces", naming "compare left/right static controls" among them.
`#compareControls` (`index.html:204`) is hidden the moment compare mode is entered —
`media-viewer.js:5220`, with the comment _"Hide old bottom controls (now using overlay controls)"_ — and
again on the tournament entry path (`media-viewer.js:4792`). Its only display site is
`showEmptyStateWithUndo()` (`media-viewer.js:2859`), i.e. after the last file in a compare session is
rated away.

So the live rating surfaces are: the **single-mode bar** (`#controls`), the **dynamic overlay groups**,
and `#compareActionBar` (already Like-left). The static compare groups are reordered too — they are one
`git grep` away from looking like a counter-example to the convention, and they _are_ user-visible in the
empty state — but they are not the surface the report is about.

### F2 — The existing E2E fixtures already reproduce the bug (changes the test plan)

`tests/e2e/fixtures/` holds `red-1x1.png`, `green-1x1.png`, `blue-1x1.png` — and
`createTempFixtureDir()` defaults to exactly those three. Every compare and tournament E2E in the suite
therefore already runs against 1×1 media, which is the bug's own condition: wrapper height 1px, controls
at `bottom: 56px` inside an `overflow: hidden` box.

**Consequence:** the RED test needs no new fixture. A computed-visibility assertion against today's code
on the existing fixtures must fail. The new fixtures (§ 6) exist for _legible screenshots_, not for the
repro — and that distinction is what keeps the evidence honest: a screenshot of a 1×1 image proves
nothing to a human reader.

### F3 — `tests/e2e/helpers/` has no screenshot helper (corrects the WEEKLY text)

WEEKLY G2 says the screenshot capability "is already in `tests/e2e/helpers/`". What REVIEW-QUEUE § 1b
(2026-09-02) actually established is narrower and still sufficient: `rdp-preload.cjs` +
`electron-wrapper.cjs` make **Playwright-over-Electron** work here, so `page.screenshot()` is available on
any page the harness launches. There is no screenshot helper, and `playwright.config.js:11` only sets
`screenshot: 'only-on-failure'`. A small helper is written as part of this group (§ 6).

### F4 — The tournament zoom button is already broken (new defect, folded in)

`removeZoomPopover(target)` (`media-viewer.js:2595`) ends with:

```js
if (entry.toggleBtn && entry.toggleBtn.parentNode) entry.toggleBtn.parentNode.remove();
```

`entry.toggleBtn.parentNode` is the `.control-btn-wrapper` **that holds the zoom button itself** — so the
call does not merely dismiss a popover, it deletes the button. That is intentional for the compare path:
`cleanupCompareMedia(side)` (`media-viewer.js:5535`) calls it, and `showCompareMedia` then rebuilds the
whole wrapper and re-runs `addMediaOverlayControls`, which re-creates button and popover together
(`media-viewer.js:3416-3417`).

The **tournament fast path does not**. `showTournamentPairFast` (`media-viewer.js:4813`) calls
`cleanupCompareMedia` on both sides and then `_buildTournamentSide` (`media-viewer.js:4841`), whose own
comment claims it is "keeping the wrapper + overlay controls". It keeps the wrapper; the zoom button is
gone, and nothing re-creates it. **From the second tournament pair onward there is no zoom button.**

`removeZoomPopover('single')` is never called — the single-mode zoom button is static markup
(`#zoomBtnWrapper`, wired once in `setupZoomPopovers`, `media-viewer.js:2465-2471`) — so this line has no
single-mode consumer to protect. Verified: the only call sites are `media-viewer.js:3416` and `:5535`,
both `'left'` / `'right'`.

### F5 — "Window-anchored" is already available without new positioning machinery

`.media-container` (`styles.css:252`) is `position: relative`, `width: 100vw; height: 100vh`, and — checked
explicitly — sets **no** `overflow`. `#compareActionBar` (`styles.css:2475`) is already
`position: absolute; bottom: 30px; left: 50%` against it and has never had a clipping report. So
"anchored to the window" and "anchored to `.media-container`" are the same thing here, and the proven
pattern is one element away.

TASK-021's proposed remedy — _"detect rendered media height via `object-fit` actual bounds … requires JS
measurement on load/resize"_ — is **not** taken: it keeps the coupling and adds a measurement path.
Removing the containment is strictly simpler than measuring around it.

---

## 3. Design

### D1 — A single bottom row owns every per-side control

New static element in `index.html`, inside `.media-container` (which is at `index.html:97`):

```html
<div class="compare-overlay-bar" id="compareOverlayBar">
    <div class="overlay-bar-slot" data-side="left"></div>
    <div class="compare-action-bar" id="compareActionBar">…</div>
    <!-- MOVED here, id/class unchanged -->
    <div class="overlay-bar-slot" data-side="right"></div>
</div>
```

```css
.compare-overlay-bar {
    position: absolute;
    bottom: 30px;
    left: 0;
    right: 0;
    display: none; /* .compare-mode turns it on */
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-4);
    z-index: 50;
    pointer-events: none; /* children opt back in */
}
.media-container.compare-mode .compare-overlay-bar {
    display: grid;
}
.overlay-bar-slot {
    display: flex;
    justify-content: center;
}
```

**Why a grid and not two absolutely-positioned groups.** Tournament mode hides `#compareActionBar`
(`styles.css:2372-2378`, `display: none !important`). Under `1fr auto 1fr` the centre **column collapses**
and the two `1fr` columns become 50% each, so the side groups stay centred on their own halves in both
modes with one rule. Under `space-between` they would fly to the window edges when the centre vanished;
under absolute 25% / 75% positioning they would _overlap_ the action bar on a narrow window — the left
group is 4 buttons (≈237px) and the bar 3 (≈180px), which collide below ~850px against an app
`minWidth: 800` (`main.js:104`). The grid's min content is ≈700px, so **overlap is unreachable at any
permitted window size**. This is the load-bearing reason for the layout choice; a later change that
replaces the grid must preserve it or re-derive the numbers.

`#compareActionBar` keeps its id, its class and every JS reference (`updateBulkRateButtonsVisibility`,
`updateCompareUndoButton`, the tournament hide rule). Only its positioning properties are dropped — it
becomes a grid cell instead of an absolutely-positioned child.

**D1a — tournament-mode vertical offset (found while planning, 2026-09-13).** `bottom: 30px` is free in
compare mode but **not** in tournament mode: `.tournament-controls` is `position: absolute; bottom: 16px;
left: 50%` (`styles.css:2315-2326`) holding `.control-btn`s, which are column-flex (icon over label) and
so ~65px tall — occupying roughly 16–81px from the bottom edge, centred. The new bar at `bottom: 30px`
would overlap it both vertically and, at 1200px width, horizontally (the side groups span ≈181–419 and
≈781–1019; the tournament band is centred and wider than the gap between them). The band auto-hides, so
the collision is intermittent — which is worse than constant, not better.

```css
.media-container.tournament-mode .compare-overlay-bar {
    bottom: 96px;
}
```

`96px` is a derived value, not a measured one, so it is **not trusted**: § 6 adds an E2E that reveals the
tournament chrome and asserts the two bounding boxes do not intersect. If the constant is wrong the test
says so, rather than a screenshot reviewer having to notice it.

**Persistence.** The bar is static markup and survives every render: `.media-container` is never cleared
with `innerHTML`; wrappers are removed individually via `.remove()` (`media-viewer.js:2813`, `3147`,
`5200`). Verified rather than assumed — a re-render that wiped the bar would delete the controls silently.

### D2 — `addMediaOverlayControls` targets the slot, not the wrapper

```js
addMediaOverlayControls(side); // was: (wrapper, side)
```

The method builds the same four buttons, then:

1. removes any existing `.media-overlay-controls` in that side's slot (which detaches the old
   `.control-btn-wrapper` with it — so a rebuild is idempotent and leaks no zoom button), and
2. appends the new group into `#compareOverlayBar > .overlay-bar-slot[data-side="…"]`.

Call sites `media-viewer.js:3341-3342` drop the wrapper argument. Lucide init moves with it: the
`createIcons({ root })` calls at `media-viewer.js:3349-3352` are scoped to the wrappers today and must be
re-scoped to the slots, or the new icons silently never render (CLAUDE.md's `{root: element}` gotcha
applies unchanged — `{nodes: […]}` is still wrong).

### D3 — Visibility rules

| Concern    | Today                                                           | After                                                                    |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Resting    | `opacity: 0`, `pointer-events: none`                             | `opacity: .35`, `pointer-events: auto`                                    |
| Reveal     | `.media-wrapper:hover .media-overlay-controls` (`styles.css:1684`) | `.media-overlay-controls:hover` → `opacity: 1`                            |
| Fullscreen | `.media-wrapper.fullscreen .media-overlay-controls` (`styles.css:1690`) | `.media-container:has(.media-wrapper.fullscreen) .compare-overlay-bar` |

The resting state is a **ruling on the original request**, recorded here so it is not re-litigated: the
report asked to "show them when hovering over them", which taken literally means `opacity: 0` with
`pointer-events: auto` — invisible controls that accept clicks, next to Like/Dislike actions that **move
files on disk**. Ghosted-at-rest (≈35%) keeps the "recedes until you reach for it" intent, keeps the
buttons discoverable, and makes a stray click a visible target rather than an invisible one. Confirmed
with the user 2026-09-13.

`:has()` is safe: Electron `^39.1.2` (`package.json`) → Chromium ~136. The fullscreen wrapper is
`position: fixed; z-index: 1500` (`styles.css:1766`) and already covers the bar (`z-index: 50`), so this
rule prevents a half-visible artefact rather than a click-through — but it is kept because behavioural
parity with today (fullscreen suppresses the per-media controls) should not depend on stacking order.

**Deliberate deletion.** `fullscreen.js:68` guards its click-to-exit handler with
`e.target.closest('.overlay-btn') || e.target.closest('.media-overlay-controls')`. That listener is bound
to the **wrapper**; once the controls are not wrapper descendants, clicks on them cannot reach it and the
guard is unreachable. It is deleted with a comment naming why, per CLAUDE.md's rule on relocating a named
thing — dead defence-in-depth that still _reads_ as live is worse than none, because the next reader
budgets for protection that is not there.

### D4 — Prediction badge

`displayPredictionBadge(score, position)` (`media-viewer.js:7851`) resolves `left` / `right` to
`document.querySelector('.left-media-wrapper')` / `.right-media-wrapper`. Both become `this.mediaContainer`
— the same container the `'single'` branch already uses. Anchoring is then pure CSS, with no new DOM:

```css
.media-container.compare-mode .prediction-badge {
    top: 70px;
}
#prediction-badge-left {
    right: calc(50% + 8px);
} /* top-right of the left column  */
#prediction-badge-right {
    right: 16px;
} /* top-right of the right column */
```

The wrapper-scoped overrides at `styles.css:1002-1010` are deleted. `pointer-events: none` is inherited
from `.prediction-badge` (`styles.css:964`) and is unchanged.

One behavioural consequence to state plainly: the badge elements **now outlive a render**, where before
they were destroyed with the wrapper and re-created by the `if (!badge)` branch. Every existing path
already tolerates this — `updatePredictionBadges` sets `display` explicitly on both branches, and
`hidePredictionBadges()` hides all three by id — but the E2E must assert a _stale_ badge is cleared when
the mode changes, not only that a fresh one appears.

Tournament mode sets no badge suppression of its own (`updatePredictionBadges` gates on
`showPredictionBadges && isSortedByPrediction` only; the `!isTournamentMode` conjunct belongs to
`updateBulkRateButtonsVisibility`), so a badge can render under the `.tournament-header`
(`margin-top: 56px`). Whether `top: 70px` clears it is a **named check in the visual evidence**, not an
assumption.

### D5 — Button order

`zoom → special → like → dislike`, **the same order in both side groups** — not mirrored. Mirroring would
put Like on the right of the right-hand group, which contradicts the convention the report asked for;
"Like is left of Dislike" must read true in every group, which is also what `#compareActionBar` already
models (`#bothGoodBtn` before `#bothBadBtn`).

Surfaces changed: single-mode bar (`index.html:193-199`), both static compare groups
(`index.html:206-232`), and the dynamic append order (`media-viewer.js:3409-3412`, currently
zoom → special → **dislike → like**).

### D6 — Zoom regression (F4)

1. `removeZoomPopover` drops its `entry.toggleBtn.parentNode.remove()` line and becomes what its name
   says: dismiss the popover, abort its listeners, forget the map entry. Destroying the _button_ becomes
   the caller's business, and D2's slot-clearing already does it.
2. `showTournamentPairFast` re-creates the popover for each side against the surviving zoom button after
   `cleanupCompareMedia` has run — mirroring what `showCompareMedia` gets for free from
   `addMediaOverlayControls`.

---

## 4. Data flow

```
showCompareMedia()                     showTournamentPairFast()
  ├ build wrappers                       ├ cleanupCompareMedia(left|right)
  ├ addMediaOverlayControls('left')      │    └ removeZoomPopover(side)   [popover only, after D6]
  │    └ slot[left] ← group + popover    ├ _buildTournamentSide(side)  → media into wrapper
  ├ addMediaOverlayControls('right')     └ re-create zoom popover per side  [D6]
  └ wrappers → .media-container
                                        #compareOverlayBar persists across both paths
```

Wrapper height is no longer an input to anything the user must click.

---

## 5. Error handling

No new failure modes. Two existing ones are preserved explicitly:

- **`customSpecialFolder` unset** — the special button stays `disabled` with the "Configure special
  folder in Settings (F1)" title. Because groups are now rebuilt per render rather than per wrapper, this
  state is re-derived on every render, which is strictly more correct than today.
- **Missing slot** — `addMediaOverlayControls` no-ops if `#compareOverlayBar` is absent rather than
  throwing into the render path. This cannot happen with static markup; the guard exists so a future
  templating change degrades to "no overlay buttons" instead of "no media".

---

## 6. Testing

**TDD order: every test below must be RED against `main` before its fix lands.** F2 is what makes this
cheap — the default fixtures are already 1×1.

### Unit (Vitest, `extractMethod` pattern)

- `addMediaOverlayControls` appends in order `zoom, special, like, dislike` and targets the slot for its
  side, not a wrapper.
- `displayPredictionBadge` resolves `left` / `right` / `single` to the media container.
- `removeZoomPopover` aborts listeners and deletes the map entry **without** removing the toggle button's
  parent (the D6 contract, pinned so a future revert is loud).

### E2E (Playwright, new `tests/e2e/overlay-controls.test.js`)

| Test                            | Asserts                                                    | RED today because                        |
| ------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| compare: controls in viewport   | each group's bounding box is fully inside the viewport      | clipped above a 1px wrapper              |
| compare: controls are clickable | `page.click()` on Like actually rates the file              | the group is not hittable                |
| tournament: controls in viewport | same, via `showTournamentPairFast`                         | same wrapper geometry                    |
| tournament: zoom survives pair 2 | the zoom button exists after one pick                      | F4 — deleted by `removeZoomPopover`      |
| badge in viewport on short media | badge box inside the viewport, `pointer-events: none`      | clipped by `overflow: hidden`            |
| badge clears on mode switch     | no stale left/right badge after leaving compare             | new risk from D4's persistence           |
| tournament: bar clears the chrome | `.compare-overlay-bar` and `#tournamentControls` bounding boxes do not intersect, chrome revealed | D1a — verifies the derived `bottom: 96px` |

Per CLAUDE.md: E2E stubs the Lucide CDN, so assert on `[data-lucide]` attributes, not rendered `<svg>`.

### Fixtures

Added to `tests/e2e/fixtures/generate.js` (idempotent; generated with `zlib.deflateSync` + a computed CRC
rather than hand-rolled hex, which does not scale past 1×1):

- `wide-short-64x4.png` — the low-height case, legible in a screenshot.
- `normal-320x240.png` — the control. 1×1 is too degenerate to serve as "normal" evidence.

### Visual evidence (the group's acceptance gate)

A `captureScreenshot(page, name)` helper in `tests/e2e/helpers/` (F3 — none exists). Before/after pairs on
both fixtures, in compare **and** tournament, committed to `docs/superpowers/specs/assets/` and linked
from this spec. Per WEEKLY, **the group is not done until they are committed** — this is the re-vehicled
trial of the visual-verification practice, and their absence is the signal to drop the practice rather
than a detail to wave through.

---

## 7. Scope & story points

| Item                                                  | SP              |
| ----------------------------------------------------- | --------------- |
| 1 — window-anchored controls (D1–D3, D5 dynamic half) | 3               |
| 2 — badge (D4)                                        | 1               |
| 3 — button order, static surfaces (D5)                | 1               |
| 4 — zoom regression (D6, folded per § 2 F4)           | 1               |
| 5 — fixtures, E2E, screenshots, helper (§ 6)          | included above  |
| **Total**                                             | **6** (planned 5) |

The +1 is a deliberate scope change, approved 2026-09-13: the fix lands in the same two methods this
group already rewrites, and shipping a freshly-rewritten control group with a known-dead button in it
would file a 🟤 against code written this week.

---

## 8. Docs & closeout

- `CLAUDE.md` § UI Components: the compare overlay bar replaces _"Compare overlay controls are
  wrapper-relative `position: absolute`"_, which this spec makes false.
- BACKLOG: check off the four 🔵 `[2026-08-28]` entries and 🟤 `[2026-03-21]` TASK-021 **in the closeout
  commit**, per the WEEKLY Summary-Table rule.
- WEEKLY: G2's three checkboxes + the Summary-Table row (`✅ <merge-SHA>`), and a note that the fourth
  shipped item was folded, not planned.
- `docs/README.md`: index this spec (the pre-commit `check-docs-index.js` guard enforces it).
