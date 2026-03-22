# TASK-021: Fix Compare Mode Overlay Controls UX

**Date**: 2026-03-21
**Status**: Design approved
**Origin**: Manual testing 2026-03-19

## Problem

Overlay controls in compare mode (and single mode) are nearly impossible to interact with due to two CSS issues:

1. **Buttons vanish on approach**: Overlay controls use `position: fixed` with visibility tied to `.media-wrapper:hover`. When the cursor moves from the media toward the buttons, it exits the `.media-wrapper` bounds — hover drops, `opacity: 0; pointer-events: none` applies instantly, and buttons disappear before the user can click them.

2. **Video controls overlap**: `position: fixed` with `bottom: 100px` positions buttons in viewport coordinates, which can overlap native video player controls (~40px tall bar at bottom of video element). This affects both the default Chromium player and any custom players.

## Solution: Pure CSS Fix (Approach A)

Change overlay positioning from `position: fixed` (viewport-relative) to `position: absolute` (wrapper-relative). This inherently fixes the hover dropout because buttons become part of the wrapper's coordinate space — the cursor never leaves the hover area when moving to buttons. Add a 500ms hide delay so buttons linger after the cursor leaves the wrapper.

### CSS Changes (`styles.css`)

#### `.media-overlay-controls` rule (~line 1585)

| Property | Before | After | Reason |
|----------|--------|-------|--------|
| `position` | `fixed` | `absolute` | Buttons inside wrapper's hover area |
| `bottom` | `100px` | `56px` | Clears native video controls (~40px + 16px gap) |
| `left` / `right` | (set per side class) | `left: 50%; transform: translateX(-50%)` | Center within wrapper |
| `transition` | `opacity 0.3s ease` | `opacity 0.3s ease` (unchanged) | — |
| `transition-delay` | (none) | `500ms` | 500ms linger on hide |

#### `.media-wrapper:hover .media-overlay-controls` rule (~line 1598)

| Property | Before | After | Reason |
|----------|--------|-------|--------|
| `transition-delay` | (none) | `0s` | Instant show (override default 500ms delay) |

#### Remove rules

- `.media-overlay-controls-left` (`left: 25%`) — no longer needed
- `.media-overlay-controls-right` (`right: 25%`) — no longer needed

Centering is now handled uniformly by `left: 50%; transform: translateX(-50%)` on the base rule.

#### Unchanged rules

- `.media-wrapper.fullscreen .media-overlay-controls` — `opacity: 0; pointer-events: none` still works (absolute positioning within fullscreen wrapper is fine)

### JS Changes (`media-viewer.js`)

#### `addMediaOverlayControls(wrapper, side)` (~line 2608)

- Remove the line that adds `media-overlay-controls-left` or `media-overlay-controls-right` CSS class to the controls container (these classes are being removed from CSS)

No other JS changes required.

### Resulting CSS (final state)

```css
.media-overlay-controls {
    position: absolute;
    bottom: 56px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 15px;
    opacity: 0;
    transition: opacity 0.3s ease;
    transition-delay: 500ms;
    pointer-events: none;
    z-index: 10;
}

.media-wrapper:hover .media-overlay-controls {
    opacity: 1;
    pointer-events: auto;
    transition-delay: 0s;
}

.media-wrapper.fullscreen .media-overlay-controls {
    opacity: 0;
    pointer-events: none;
}
```

## Scope

- **Compare mode**: Both left and right panes
- **Single mode**: Same rules apply — wrapper has `position: relative`, overlay buttons get consistent behavior
- **Fullscreen mode**: Unchanged (hidden via existing rule)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visibility mechanism | Hover-based with delay | Keeps UI clean; click-to-toggle adds state complexity |
| Hide delay | 500ms | Comfortable window to reach buttons without feeling sluggish |
| Show delay | 0s (instant) | Responsive feel on hover |
| Button position | `bottom: 56px` uniform | Clears video controls for all media types; avoids JS media-type detection |
| Positioning | `position: absolute` | Buttons inside wrapper = inside hover area; fixes root cause |
| Side-specific classes | Removed | Centering via `transform` is uniform; no left/right distinction needed |

## Testing

### Automated

- All E2E compare-mode tests should pass unchanged (they use `{ force: true }` or `page.evaluate()`, unaffected by CSS position changes)
- All unit tests unaffected (no CSS/DOM changes in tested code paths)

### Manual Verification

- [ ] Hover over media in compare mode — buttons appear instantly
- [ ] Move cursor away — buttons linger 500ms then fade
- [ ] Move cursor from media to button — button stays visible and clickable
- [ ] Click like/dislike/special/zoom buttons in both panes
- [ ] Video media: overlay buttons do not overlap native player controls
- [ ] Image media: overlay buttons positioned consistently
- [ ] Single mode: same hover/delay/positioning behavior
- [ ] Fullscreen mode: overlay buttons hidden
- [ ] Window resize: buttons remain centered within each pane

## Files Modified

| File | Change |
|------|--------|
| `styles.css` | Position, bottom, centering, transition-delay; remove side-specific rules |
| `media-viewer.js` | Remove side-specific class assignment in `addMediaOverlayControls()` |

## Risk Assessment

- **Low risk**: Pure CSS change + one-line JS cleanup
- **No functional logic changes**: Only positioning and visibility timing
- **Backward compatible**: No new state, no new event listeners, no API changes
