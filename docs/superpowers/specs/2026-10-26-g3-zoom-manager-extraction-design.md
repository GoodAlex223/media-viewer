# G3 ZoomManager Extraction — Design Spec

**Task Reference**: WEEKLY.md Oct 19–23 § G3 (🔵, 5 SP → **~6 SP**, § 10) ← BACKLOG 🔵 [2026-10-18] "Extract ZoomManager from the renderer (v2.0 modularization, the third manager)"
**Created**: 2026-10-26
**Status**: Approved by the user 2026-10-26 ("Looks good"), with § 11's calls as written. **The user skipped the question round**, so § 11 lists every call Claude made.
**Branch**: `g3-zoom-manager-extraction` (from `main` @ `5230b69`; one PR)
**Baseline**: `3509bca` — the before screenshots and `typescript@6`, with `media-viewer.js` unchanged at **11,945** lines.
**Trial vehicle**: `typescript-lsp` (REVIEW-QUEUE § 5; its last vehicle, stop rule) — § 8.

---

## 1. Intent

`media-viewer.js` keeps growing. It was 9,989 lines on 2026-10-10, 11,451 on 10-18 and 11,945 on 10-25. The week's theme is "stop the renderer's growth". ZoomManager is the first v2.0 extraction since `MlTrainingManager` (2026-09-10). It is small, self-contained and well understood, so it re-starts the extraction run at low risk. The approved v2 spec (§ 11.1) classes it as a **core-internal split**, not a module.

The user should notice nothing. Zoom and pan behave exactly as today, and the popover looks exactly as today. What changes is where the code lives.

## 2. Goals, non-goals, anti-goals

**Goals**
- Move all zoom state and behaviour into a `ZoomManager` class in a new `zoom.js`, on the v2.0 pattern: stateful, constructor-injected callbacks, **no back-reference to the host** (v2 spec § 11.1; `TournamentManager(this)` is the counter-example).
- Measure the renderer's net line drop (expected about −420, § 3.1).
- **Tests move with the code** (v2 spec § 11.1): the zoom tests in `tests/media-viewer-utils.test.js` become direct imports of `zoom.js`.
- Give the moved transform, pan and wheel layer E2E coverage that can fail. Today it has none (§ 3.4).

**Non-goals**
- Zoom-level persistence (BACKLOG [2026-02-05]), Ctrl +/− UI zoom (v2 P7), or any new zoom feature.
- The `core/` folder layout. That is P1a's decision (§ 4.1).
- CSS or markup changes. The popover's DOM and classes stay byte-for-byte the same.
- `fullscreen.js`. Its `isZoomed(wrapper)` callback keeps its shape (§ 4.6).
- The open 🟤 zoom entries the extraction does not close by construction (§ 7). One exception, § 7 row 6.

**Anti-goals** (a failure even if the suites pass)
- Any visible difference in the after screenshots (§ 6.3).
- Any change to which handler sees a wheel, mouse or click event: who calls `preventDefault`/`stopPropagation`, and whether a wheel over media still never navigates.
- A refactor whose suites cannot fail for the code it moved (§ 3.4, § 6.1).

## 3. Today (measured at `3509bca`)

### 3.1 What moves

| Where (`media-viewer.js`) | Lines | What |
| --- | --- | --- |
| L391–403 | 13 | Constructor: `zoomState` (single/left/right `{scale, translateX, translateY}`), `zoomSteps [1,2,4]`, `minZoom 1`, `maxZoom 8`, `zoomFactor 1.15`, `isPanning`, `panStart`, `panStartTranslate` |
| L530–532 | 3 | `initializeElements`: `zoomControlsMap = {}`, `setupZoomPopovers()` |
| L2763–2770 | 8 | `setupEventListeners`: document `mousemove` → `handlePanMove`, `mouseup` → `handlePanEnd` |
| L2977–3137 | 161 | Popover: `sliderToScale`, `scaleToSlider`, `setupZoomPopovers` (single-mode popover + document `click` → hide all), `createZoomPopover`, `removeZoomPopover`, `closeAllZoomPopovers` |
| L8846–9084 | 239 | Transform layer: `getZoomTarget`, `getMediaElement`, `setZoom`, `resetZoom`, `zoomAtPoint`, `cycleZoomStep`, `handleWheelZoom`, `handlePanStart`/`Move`/`End`, `updateZoomIndicator`, `isZoomed`, `setupZoomEvents` |
| L373–380 | 8 → 1 | `FullscreenManager`'s `isZoomed` callback body (wrapper class → target → `scale > 1`) |

That totals about 430 lines out, against about 12 lines of glue in: the import, the construction and the callback.

### 3.2 Who calls it from outside (grep, cross-checked with LSP `findReferences` on `zoomState` and `zoomControlsMap`, which agree)

| Call | Sites |
| --- | --- |
| `resetZoom('all')` | Escape handler L2694, behind `if (this.isZoomed())` L2693 |
| `resetZoom('single')` | `showSingleMedia` L3926 |
| `resetZoom('left')`/`('right')` | `showCompareMedia` L4112–4113, `showTournamentPairFast` L6449–6450 |
| `closeAllZoomPopovers()` | `showSingleMedia` L3998, `showCompareMedia` L4363, compare exit L5729, `toggleViewMode` L6889 |
| `removeZoomPopover(side)` | `addMediaOverlayControls` L4454, `cleanupCompareMedia` L7250 |
| `createZoomPopover(side, zoomWrapper, zoomBtn)` | `addMediaOverlayControls` L4455 |
| `setupZoomEvents(el, target)` | compare image L4472, compare video L4527, single image L4578, JXL canvas L4625, single video L4643 |
| `zoomState` | only the `FullscreenManager` callback L379 |

**Dead:** `getZoomTarget` has no caller anywhere in the live tree (only stale copies under `.superpowers/sdd/`). **Zoom-only:** `getMediaElement` is called only from zoom code.

### 3.3 Invariants the moved code carries (each must survive verbatim)

1. `removeZoomPopover` aborts the entry's listeners, removes the popover and forgets the entry. It **never** touches the toggle button or its parent (CLAUDE.md § UI Components; the G2 tournament fix).
2. `handleWheelZoom` calls `preventDefault()` and then `stopPropagation()`, so the document wheel handler never sees a wheel over media. That handler would return anyway: its own `isOverMedia` check (L2800: `.media-display` or inside `.media-wrapper`) comes before any navigation. The two guards overlap, and both stay. The only other wheel listener is the recent-folders menu's (L2302). The media `wheel` listener is registered `{ passive: false }`. The recent-folders comment (L2780–2783) names `handleWheelZoom` and gets the new name.
3. Double-click cycles 1 → 2 → 4 → 1, and does nothing inside `.fullscreen`, where a click exits.
4. A pan starts only on the left button and only when `scale > 1`. While zoomed, `mousedown` calls `preventDefault()`.
5. Slider drag: `isSliderDragging` stops `updateZoomIndicator` writing the slider back mid-drag. It is cleared by a per-popover document `mouseup` that the popover's `AbortController` owns.
6. Popover `mousedown`/`click` stop propagation, so the document `click` → hide-all handler does not close the popover it is in. The toggle button's click stops propagation, hides all popovers, then opens its own unless it was open.
7. Lucide icons are created with `{ root: popover }`, never `{ nodes }` (CLAUDE.md § Active gotchas).
8. Escape: when `isZoomed()`, reset all and **return**. Tournament's Escape-to-pause is not reached.
9. Every file change resets the side it renders before rendering it. The host calls stay where they are.

### 3.4 Coverage today

- E2E `tests/e2e/zoom.test.js` (3 tests) drives only the popover UI: open/close, a slider move, and Escape resets. `overlay-controls.test.js` checks that the tournament zoom button survives.
- Unit: `removeZoomPopover` (3 tests, via `extractMethod`), and two mock contexts that stub `closeAllZoomPopovers` / `removeZoomPopover` / `createZoomPopover`.
- **No test fires a real wheel over media, double-clicks, drags to pan, or clicks a zoomed fullscreen pane.** About half the moved code (the transform, pan and wheel layer, and the fullscreen callback) could break with every suite green. This is the 🟤 entry "No E2E fires a real `WheelEvent` over a media element…" (§ 7 row 6).

## 4. Design

### 4.1 Placement: root `zoom.js`

The file goes at the repo root, beside `fullscreen.js`.
- The app scheme already serves any top-level `.js` file (`app-protocol.js` `TOP_LEVEL_FILE`), whereas a `core/` subfolder would need an allowlist change.
- The WEEKLY/BACKLOG acceptance names `zoom.js`.
- The v2 spec gives the `core/*.js` layout to P1a, which can move the file with a one-line import change.

### 4.2 Constructor

```js
new ZoomManager({
    getMediaElement: (target) => /* 'left' → this.leftMedia, 'right' → this.rightMedia, else this.currentMedia */,
    isCompareMode: () => this.isCompareMode,
    createIcons: (root) => { if (typeof lucide !== 'undefined') lucide.createIcons({ root }); },
});
```

- `getMediaElement` keeps today's mapping exactly. The host method is deleted, and its body becomes the callback.
- `createIcons` keeps `zoom.js` free of the `lucide` global. Block 2c's `no-undef` would reject that global, the module becomes testable without a Lucide stub, and the `{ root }` gotcha stays in one place.
- The construction goes where `zoomState` is built today (after `FullscreenManager`, before `initializeElements`). The fullscreen callback reads `this.zoom` lazily, so the order between the two is free.

### 4.3 State the manager owns

`state` (was `zoomState`), `popovers` (was `zoomControlsMap`), `zoomSteps`, `minZoom`, `maxZoom`, `zoomFactor`, `isPanning`, `currentPanTarget`, `panStart`, `panStartTranslate`. The values are identical. `popovers` exists from construction, so `updateIndicator`'s `this.zoomControlsMap &&` guard (which covered calls before `initializeElements`) becomes a plain lookup.

### 4.4 API: old → new

Every call site changes from `this.x()` to `this.zoom.y()` anyway, so the names drop the redundant "Zoom". Bodies move unchanged apart from three edits. `this.getMediaElement(target)` now resolves to the stored callback, with the same name. `this.isCompareMode` becomes `this.isCompareMode()`. The Lucide call becomes `this.createIcons(popover)`.

| MediaViewer today | ZoomManager | Called by the host? |
| --- | --- | --- |
| `setupZoomPopovers()` + the pan document listeners (L2763–2770) | `init()` | yes, at today's `setupZoomPopovers()` site (L532) |
| `createZoomPopover(target, wrapper, toggleBtn)` | `createPopover(target, wrapper, toggleBtn)` | yes |
| `removeZoomPopover(target)` | `removePopover(target)` | yes |
| `closeAllZoomPopovers()` | `hideAllPopovers()` — the honest name: it hides and keeps each entry (§ 7 row 3) | yes |
| `resetZoom(target \| 'all')` | `reset(target \| 'all')` | yes |
| `isZoomed()` | `isZoomed()` | yes (Escape) |
| (the fullscreen callback body) | `isWrapperZoomed(wrapper)` | yes, via the callback |
| `setupZoomEvents(element, target)` | `attachToMedia(element, target)` | yes |
| `sliderToScale` / `scaleToSlider` | same names | no |
| `setZoom` / `zoomAtPoint` | same names | no |
| `cycleZoomStep` | `cycleStep` | no |
| `handleWheelZoom` | `handleWheel` | no |
| `handlePanStart` / `Move` / `End` | same names | no (the document listeners are the manager's now) |
| `updateZoomIndicator` | `updateIndicator` | no |
| `getZoomTarget` | **deleted** (dead, § 3.2) | — |
| `getMediaElement` | the `getMediaElement` callback | — |

"No" means internal. The methods stay public on the class so unit tests can drive them, as with `FullscreenManager`.

### 4.5 Document listeners move into `init()`

`init()` installs the single-mode popover (`#zoomBtnWrapper`/`#zoomToggleBtn`) and three document listeners: `click` → `hideAllPopovers()`, `mousemove` → `handlePanMove(e)`, `mouseup` → `handlePanEnd()`.

The `mousemove`/`mouseup` pair now registers earlier than today: in `initializeElements`, not in `setupEventListeners`. That reorders them among the other document `mousemove`/`mouseup` listeners. The change cannot be observed:
- No `mousemove`/`mouseup` listener in the renderer calls `stopImmediatePropagation`. The only two calls are capture-phase `keydown`/`keyup` swallows, L3554 and L5098.
- No other listener reads pan state, which is zoom-only (grep `isPanning`/`currentPanTarget`).
- Element-level listeners (wheel, dblclick, mousedown) are unaffected, because `attachToMedia` registers them per element exactly as today.

### 4.6 `FullscreenManager`

The callback keeps its shape `(wrapper) => boolean`, and its body becomes `(wrapper) => this.zoom.isWrapperZoomed(wrapper)`. `isWrapperZoomed` is today's body verbatim: the `left-media-wrapper` / `right-media-wrapper` class → `'left'`/`'right'`, else `'single'`, then `state[target] && state[target].scale > 1`. `fullscreen.js` is not touched.

### 4.7 Lists a new renderer module must join (no check enforces these)

> **Correction (execution, 2026-10-26).** One of these lists does have a check. `tests/media-url.test.js` "the list names every app file the page loads" walks `index.html`'s scripts, imports and workers, and fails for a loaded module missing from its `RENDERER_FILES`. Block 2c and `lint-guard.test.js`'s list have no check (plan Improvement 1).

- `eslint.config.mjs` block 2c `files`, plus its header comment (L11). This brings `htmlSinkGuard` and `no-undef` with it.
- `tests/lint-guard.test.js` `RENDERER_FILES`, which proves the sink guard fires there.
- `tests/media-url.test.js` `RENDERER_FILES`, the no-`file:`-URL control.
- `CLAUDE.md`:
  - § Architecture gets a `zoom.js` line.
  - § Patterns adds ZoomManager to the v2.0 list.
  - § Imports lists the extracted ES modules; add it there.
  - § UI Components and the recent-folders bullet carry `createZoomPopover`/`removeZoomPopover`/`handleWheelZoom` by name; rename them.
- `.claude/agents/regression-checker.md` § 6 (zoom lifecycle names) and its v2.0 paragraph ("Extracted today: `FullscreenManager`"). This is a protected-path write.
- `docs/ARCHITECTURE.md`: its State block's zoom lines (`zoomLevel`, `panX`, `panY`) never matched the code. Replace them with a pointer to `zoom.js`. The rest of that block's staleness is BACKLOG 🟤 "`docs/ARCHITECTURE.md` names two things…" and "…file tree omits every extracted module". Add `zoom.js` to the latter's list rather than fixing it here.
- `docs/README.md`: link this spec (the docs-index hook requires it) and the plan.

## 5. Order of work (the plan refines it)

1. **Characterization E2E first, on the unchanged renderer** (§ 6.1). It must pass, and each case must be shown able to fail (§ 6.1 mutation list).
2. Unit tests for `ZoomManager`, RED (the module does not exist yet).
3. Create `zoom.js` (GREEN), then switch the host over and delete the old code in one task, so the renderer never holds two copies.
4. Registration lists (§ 4.7), the old-name sweep (§ 6.4) and the doc updates.
5. After screenshots, pixel diff, line count, full suites.

## 6. Verification

### 6.1 Characterization E2E (new, `tests/e2e/zoom.test.js`)

These pass before and after the move. They cover, through real input events:

| # | Case | Can it fail? Mutation that must turn it red (run once, revert, log) |
| --- | --- | --- |
| A | A real mouse wheel over the single-mode media zooms in. `.zoom-value` and the element's `transform` show 115%, and with two files the shown file does not change after the wheel debounce. | Invert the wheel's delta sign: it zooms out and clamps at 100%. (Dropping `stopPropagation` cannot turn A red, because the document handler's `isOverMedia` check also stops navigation, § 3.3 item 2. The unit test pins the call instead.) |
| B | A double-click cycles 100 → 200 → 400 → 100%. | Change `zoomSteps` |
| C | Zoomed, a left-button drag pans: translate follows the drag, and a drag past the edge stops at `±W·(scale−1)/2`, W being the layout width (`offsetWidth`). *Corrected in review round 1 (§ 12): this row first said `rect·(scale−1)/2`, but `getBoundingClientRect()` already includes the scale, so that bound was s times too loose, and case C pinned it.* At the mousedown the cursor is `grabbing` (the first move's `setZoom` writes `grab` back; 🟤 "From: PR #90 review" #10). At 100%, after a mousedown with no movement, the cursor is not `grabbing`. A held-button move at 100% would start the browser's native image drag, because that mousedown is not prevented. (Translate cannot show the 100% case: the clamp is 0 there, so it stays 0 even without the early return.) | Drop the clamp in `handlePanMove` (edge case); remove the `scale <= 1` early return (100% cursor) |
| D | Compare: a wheel over the left media zooms left only, and the right stays 100%. | Hard-code `'single'` as the target |
| E | Compare fullscreen (`Z`): zoomed, a click on the wrapper does **not** exit. At 100% it exits. | Make `isWrapperZoomed` return `false` |
| F | Moving to the next file resets zoom to 100%. | Drop `reset('single')` in `showSingleMedia` |

**The assertions read the DOM only**: `.zoom-value` text, the media element's `style.transform` and `style.cursor`, the wrapper's `fullscreen` class, plus `currentIndex`, which is not zoom state. Then the same file runs unchanged before and after the move. A test that read `zoomState` would have to be rewritten mid-refactor, and so would not be a before/after check.

The existing 3 popover tests and the overlay tournament test stay. Fixtures: the two generated grid images from the evidence block (§ 6.3); a solid-colour fixture cannot show a pan. The helper can go in `tests/e2e/fixtures/` if both files use it.

### 6.2 Unit (`tests/zoom-manager.test.js`, direct import)

- Port the three `removeZoomPopover` tests to `removePopover`, keeping the "never the toggle's parent" contract.
- Add tests for:
  - the slider mapping round trip (0 → 1, 100 → 8, monotonic);
  - `reset('all')`;
  - `isWrapperZoomed` for each wrapper class and a detached wrapper;
  - `isZoomed` by mode;
  - `hideAllPopovers` hides and keeps each entry;
  - `handleWheel` calls `preventDefault` and `stopPropagation`;
  - `attachToMedia` registers `wheel` with `{ passive: false }`.
- Update the two mock contexts in `media-viewer-utils.test.js` (`closeAllZoomPopovers` → `zoom: { hideAllPopovers }`; `removeZoomPopover`/`createZoomPopover` → `zoom: { removePopover, createPopover }`).
- Vitest runs in node, so DOM-building tests stub `document` the way the `addMediaOverlayControls` test does (builder's call how).

### 6.3 Visual

`G3_EVIDENCE_STAGE=after` re-runs the committed scenario from `3509bca`: the popover open at 283% in single and compare mode. Pass means the after images match the before images:
- by eye, the same popover, controls and zoomed content;
- by a **pixel diff** (sharp raw buffers; report the count of differing pixels). Expected 0 on the same machine; anything else is explained before merge.

The compare before shot already settles the held-back clipping entry (§ 7 row 1).

### 6.4 Old-name sweep and diagnostics

After the move, grep the whole repo (excluding `docs/archive/` and `.superpowers/`) for every old name in § 4.4 (`zoomState`, `zoomControlsMap`, `setupZoomPopovers`, `createZoomPopover`, `removeZoomPopover`, `closeAllZoomPopovers`, `resetZoom`, `cycleZoomStep`, `handleWheelZoom`, `updateZoomIndicator`, `setupZoomEvents`, `getZoomTarget`, `getMediaElement`). The only remaining hits should be dated history (DONE, older specs, BACKLOG bodies). Re-read every comment attached to changed code (CLAUDE.md § Best Practices). As a second check, the LSP's diagnostics on `media-viewer.js` must show no new "Property '…' does not exist" (2339/2551/2568) for a removed name.

### 6.5 Acceptance

- `npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check` green.
- A–F shown able to fail.
- After screenshots committed, pixel diff reported.
- `wc -l media-viewer.js` before (11,945) and after, net reported. Expected about −420, and in any case ≤ −400.
- § 4.7 lists done. BACKLOG entries per § 7.
- The user runs MANUAL_TESTING.md lines 26–29 and 38 (wheel, double-click, pan, Escape, per-image zoom) on the branch.

## 7. Open 🟤 zoom entries

| # | Entry | Outcome |
| --- | --- | --- |
| 1 | 🟤 [2026-03-22] PR #19 "Verify zoom popover not clipped by `overflow: hidden` on `.media-wrapper`" (held back from the 10-18 reap) | **Closed by evidence**: `g3-zoom-compare-before.png` shows the popover entirely above the left group, inside the window. It lives in `#compareOverlayBar`, not the wrapper. |
| 2 | 🟤 TASK-019 "Add wrapper-aware `isZoomed(wrapper)` helper to MediaViewer" | **Closed by construction**: `ZoomManager.isWrapperZoomed`, beside the state it reads. The duplicate mapping (`getZoomTarget`) is deleted. |
| 3 | 🟤 TASK-015 "Rename closeAllZoomPopovers() or add destroyAllZoomPopovers()" | **Closed by construction**: `hideAllPopovers()`. |
| 4 | 🟤 PR #14 "Add unit test for zoom popover AbortController cleanup" | Stays open. The ported test asserts `abort()` in `removePopover`, but the entry asks for it through `cleanupCompareMedia()`, which this task does not test. |
| 5 | 🟤 PR #14 "Add removeZoomPopover('single') to cleanupCurrentMedia() or mode switch" | Stays open (behaviour, not structure). Its text gets the new name. |
| 6 | 🟤 "No E2E fires a real `WheelEvent` over a media element to assert zoom still works" | **Taken on** (§ 11 call 1): § 6.1 A is it. |

## 8. `typescript-lsp` trial

- **Precondition met at `3509bca`.** With `typescript@6.0.3` in the workspace, `documentSymbol` on `fullscreen.js` returned the class tree.
- **So far.** `findReferences` on `zoomState` (16 hits) and `zoomControlsMap` (10) matched grep exactly, and it found nothing outside `media-viewer.js` (as expected: the tests reach the renderer through source text, not imports). The first edit session produced a `diagnostics` attachment on `media-viewer.js`: 10 suggestion-level items, such as `pause` on an `HTMLImageElement | HTMLVideoElement` union and `'await' has no effect`, none zoom-related.
- **For the read-out, the plan's log records:**
  - each navigation question the LSP answered, and whether grep would have found the same;
  - each diagnostic, and whether it led to anything;
  - whether § 6.4's diagnostics check caught a leftover old name.
- G6 reads it out (stop rule: no third vehicle).

## 9. Left to the builder

- How DOM-building unit tests stub `document` (§ 6.2).
- How E2E A–F reach coordinates: `boundingBox()` plus `page.mouse`. The assertions stay DOM-only (§ 6.1).
- Whether the four constants become class fields or `static` (values unchanged).
- The JSDoc header of `zoom.js`, on `fullscreen.js`'s model.

## 10. Size, model, risks

- **~6 SP** (planned 5): the extraction ~4, plus the characterization E2E and mutation runs ~1, plus the lists and docs ~1.
- Model per WEEKLY: spec and plan on Opus `high`; execution on Sonnet `high`, because for a refactor the verification is the acceptance; review `high`.
- **Risks**
  - A missed call site throws a `TypeError` at runtime that unit tests do not reach. § 6.4's sweep and diagnostics, plus E2E A–F, cover it.
  - Renames touch CLAUDE.md prose. The sweep covers that too.

## 11. Calls Claude made (the user skipped the questions)

1. **E2E A–F are in scope**, and they close 🟤 row 6, although the BACKLOG entry says "not taken on otherwise". Without them, half the moved code has no test that could fail, and WEEKLY's model line already says the verification is the whole acceptance. About +1 SP.
2. **Methods are renamed** (§ 4.4), because every call site changes anyway. This closes 🟤 row 3 by construction, and the sweep (§ 6.4) is the control.
3. **The manager owns its document listeners** (`init()`), and the reorder is shown unobservable (§ 4.5).
4. **`getZoomTarget` is deleted** as dead code, and `getMediaElement` becomes a callback.
5. **`createIcons` is a callback**, not the `lucide` global.
6. **Root `zoom.js`**, not `core/zoom.js` (§ 4.1).
7. **The evidence images are generated SVG grids** (`3509bca`): the committed fixtures are solid colour, and the first photo-like attempt made 2 MB PNGs, so it was amended before any push.
8. **A pixel diff** is added to the eyeball check (§ 6.3).
9. **`docs/ARCHITECTURE.md`**: only its zoom lines are fixed; the rest stays with its two 🟤 entries.

## 12. Review round 1 (PR #90)

The pre-merge review (PR #90, comment 6415665685) found 15 issues. Most predate G3 and were moved verbatim.

- **The user's ruling.** Fix the PR's own items in this PR. Also fix three confirmed older bugs (#3, #4, #7): each is small, and #3 and #4 led to a file change the user did not ask for. File the rest in BACKLOG 🟤 [2026-10-26] "From: PR #90 review".
- **Deliberate behaviour changes**, the exceptions to § 2's goal of no behaviour change. Each has a unit test that failed first:
  - **#2:** the pan and wheel clamps use the layout box (`offsetWidth`/`offsetHeight`), not `getBoundingClientRect()`, which includes the element's own scale. At 2× an image could be dragged until its edge reached the box centre, and at 4× off-screen.
  - **#3:** a wheel step is clamped to [1, 8] before `zoomAtPoint`, so a notch past a cap is a no-op. Before, at 8× each further notch slid the image until one missed it, and the document handler changed the file (a skip on the AI order).
  - **#4:** `setZoom` snaps a scale within 1e-9 of 100% to exactly 100%, centred. Before, 4+ wheel notches or '+' presses in and out left `1.0000000000000002`, which read 100% while `isZoomed()` said true.
  - **#7:** `handleWheel` ignores `deltaY === 0`, which comes from a horizontal wheel or a sideways swipe. It still calls `preventDefault`/`stopPropagation`, so the event routing in § 3.3 item 2 is unchanged.
- **The after screenshots stay valid.** The slider scenario zooms about the centre, where none of the four changes applies.
- **Case C (§ 6.1)** now pins the corrected bound and reads only settled values: `offsetWidth` and the inline transform. The old bound read a box in mid-transition, the review's #5. Against the pre-fix clamp it read 419 px where the settled box is 640.
