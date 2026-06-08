# Mode-Switch Display Bugs (Group B) — Design Spec

**Date**: 2026-06-08
**Branch**: `feature/mode-switch-display-bugs`
**Source**: WEEKLY.md Group B (7 SP) · TODO.md BUG (🔴 Critical) + BACKLOG.md (2026-05-07)
**Status**: Approved (design)

## Problem

Two related defects in the compare ⇆ single mode-switch / folder-switch UI state.

### Bug 1 — AI-sort + mode-switch shows a different first media (5 SP, 🔴 Critical)

After **Sort by Prediction**, then rating/navigating pairs in compare mode, switching to
single view shows a *different* file than the one currently on the left of the compare pair.

Root cause: two indexing schemes are never reconciled.

- `sortComplete` reorders `this.mediaFiles` by score-descending and sets `currentIndex = 0`
  (`media-viewer.js:6808`).
- `showCompareMedia` re-derives `filesWithScores` (same descending order) and renders the pair
  at `this.mlComparePairIndex` — left = `filesWithScores[mlComparePairIndex]`, right = the mirror
  from the bottom (`media-viewer.js:3027-3044`). Navigating pairs (A/S) advances
  `mlComparePairIndex` past 0.
- Switching to single, `_applyModeSwitch`'s `single` branch hard-sets `currentIndex = 0`
  (`media-viewer.js:4160-4162`), landing on the *highest-scored* file rather than the file the
  user was actually viewing (`filesWithScores[mlComparePairIndex]`).

### Bug 2 — Compare→folder-switch leaves stale media wrappers (2 SP, 🟠 Important)

Loading a new folder switches to single mode, but the old `.leftMediaWrapper` /
`.rightMediaWrapper` DOM nodes remain (shifted/shrunk on the left). `switchToSingleModeUI()`
(`media-viewer.js:4110`) toggles classes/visibility but never **removes** the wrapper nodes.
The `<2 files remain` branch of `moveComparePair` (`media-viewer.js:5029-5039`) already does this
removal manually — proving the fix belongs in `switchToSingleModeUI()` so every exit-to-single
path (including `loadFolder`) benefits.

## Decisions (from brainstorming)

- **Compare→single target**: land on the compare pair's **left file** (the file on screen).
  "Continue where I was," not "restart from the top."
- **Single→compare (reverse)**: **out of scope** — keep resetting `mlComparePairIndex` to 0
  (highest-vs-lowest). Current behavior, unchanged.
- **Bug 1 strategy**: resolve the index **at switch time** from `this.compareLeftFile` (Approach A),
  not continuous dual-array syncing (the BACKLOG's "path b"). The desync is a read-time question
  ("which file is on screen?") that `compareLeftFile` already answers, so this is the smallest,
  lowest-regression change.
- **Bug 2 strategy**: fold the existing inline wrapper teardown into `switchToSingleModeUI()`;
  delete the now-redundant inline block in `moveComparePair`.

## Design

### Change 1 — `_applyModeSwitch()` `single` branch (`media-viewer.js:4157-4163`)

Replace the unconditional `this.currentIndex = 0` with a lookup of the on-screen compare-left file,
captured **before** `switchToSingleModeUI()` runs (so nothing clears it):

```js
if (mode === 'single') {
    if (this.isTournamentMode) this.exitTournamentMode();
    const target = this.compareLeftFile; // file currently rendered on the left, if any
    if (this.isCompareMode) this.switchToSingleModeUI();
    if (this.mediaFiles.length > 0) {
        const idx = target ? this.mediaFiles.findIndex((f) => f.path === target.path) : -1;
        this.currentIndex = idx >= 0 ? idx : 0;
        this.showMedia();
    }
}
```

`compareLeftFile` is maintained by `showCompareMedia` for **both** the AI-sorted branch
(`filesWithScores[mlComparePairIndex]`) and the regular branch (`mediaFiles[currentIndex]`), so the
lookup is correct whether or not AI sort is active. Only the `single` branch changes; `compare` and
`tournament` branches are untouched.

### Change 2 — `switchToSingleModeUI()` (`media-viewer.js:4110`)

After the existing class/visibility resets, add wrapper teardown (guarded, idempotent):

```js
for (const key of ['leftMediaWrapper', 'rightMediaWrapper']) {
    const wrapper = this[key];
    if (wrapper) {
        this.fullscreen.cleanup(wrapper);
        wrapper.remove();
        this[key] = null;
    }
}
```

Then **delete** the redundant inline block at `media-viewer.js:5029-5039` in `moveComparePair`
(the `<2 files remain` branch already calls `switchToSingleModeUI()` immediately after).

## Edge cases

- `compareLeftFile` is null (just-rated window — `moveComparePair` nulls it) or the file was removed
  from `mediaFiles` → `findIndex` returns `-1` → land on `0` (preserves prior behavior).
- Non-AI compare → `compareLeftFile === mediaFiles[currentIndex]` → lookup keeps the same file
  (no regression).
- Wrappers already null (switch arrived from single mode / `loadFolder`) → `if (wrapper)` guard makes
  the teardown a no-op. Safe to call on every exit-to-single path.
- Wrappers are recreated by `showCompareMedia` on the next compare entry, so unconditional removal is
  safe.

## Testing

### Unit (`tests/media-viewer-utils.test.js`)

- `switchToSingleModeUI`: extract via `extractMethod`; mock ctx with `leftMediaWrapper` /
  `rightMediaWrapper` stub nodes (objects exposing `.remove` spy + class/style stubs) and
  `fullscreen.cleanup` spy. Assert both wrappers get `fullscreen.cleanup` + `.remove()` called and
  the properties are nulled. Second test: wrappers already `null` → no throw, no `.remove` calls
  (idempotent).
- Change-1 index resolution: a focused test of the lookup logic — `compareLeftFile` present →
  `currentIndex` resolves to its index in `mediaFiles`; `compareLeftFile` null or absent from
  `mediaFiles` → `currentIndex` falls back to `0`.

Mock-context note: `switchToSingleModeUI` touches many DOM refs (`controls`, `compareControls`,
`mediaContainer`, `videoControls`, `leftFileInfo`, `rightFileInfo`, `fileInfo`, `infoToggleBtn`) plus
`hidePredictionBadges()` / `closeAllZoomPopovers()` — supply stubs for all, mirroring existing
extract-method test patterns.

### E2E (`tests/e2e/compare-mode.test.js`)

- Extend "resets to single mode when switching folders": after the folder switch, assert **no**
  `.compare-wrapper` / `.media-wrapper-left` / `.media-wrapper-right` nodes remain in the DOM.
- New case: AI-sort → enter compare → navigate one pair (A/S) → switch to single → assert the single
  `.media-display` shows the former compare-left file (compare the displayed `src`/filename to the
  captured `compareLeftFile`).

## Affected files

- `media-viewer.js` — `_applyModeSwitch` (Change 1), `switchToSingleModeUI` (Change 2), delete
  redundant block in `moveComparePair`.
- `styles.css` — only if a residual CSS rule needs adjustment after wrapper removal (likely none).
- `tests/media-viewer-utils.test.js`, `tests/e2e/compare-mode.test.js` — coverage above.

## Out of scope

- Single→compare symmetric landing (reverse direction) — stays at pair 0.
- Continuous dual-array sync (BACKLOG "path b") — superseded by resolve-at-switch.
- Tournament mode interactions — unchanged.

## Acceptance criteria

1. AI-sort, enter compare, navigate to pair N>0, switch to single → single view shows the same file
   that was on the compare left.
2. Compare mode, load a new folder → no stale compare wrapper nodes remain; new media renders cleanly
   in single mode.
3. Non-AI compare → single switch keeps the user on the same (left) file.
4. All existing unit + E2E tests pass; new tests above pass.
