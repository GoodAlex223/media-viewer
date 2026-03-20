# TASK-018 — UI Polish: Button Press Effects and Fullscreen Guard

**Date**: 2026-03-20
**Status**: Approved
**Branch**: `feature/task-018-ui-polish`

## Summary

Two small UI improvements to finalize v1.1 polish:

1. Add `:hover` and `:active` CSS states to all `.control-btn` elements for visual interaction feedback
2. Add early-return guard in `cleanupFullscreen()` to prevent redundant operations on double-calls

## Part 1: Button Press Effects

### Problem

No `.control-btn` has any `:hover`, `:active`, or `:focus` state. Users get no visual feedback when interacting with control buttons (like, dislike, special, zoom, nav).

### Solution

Add two CSS pseudo-class rules to `styles.css`, after the existing `.control-btn:disabled` block (~line 621):

```css
.control-btn:hover {
    transform: scale(1.05);
    filter: brightness(1.15);
}

.control-btn:active {
    transform: scale(0.93);
    opacity: 0.85;
    transition-duration: 50ms;
}
```

### Design Decisions

- **Pure CSS approach** — no JS listeners needed. The existing `transition: all var(--transition-normal)` on `.control-btn` handles smooth animation.
- **`:hover`** — subtle scale-up (1.05) + brightness boost (1.15). Signals interactivity without being distracting.
- **`:active`** — scale-down (0.93) + opacity drop (0.85) with snappy 50ms transition override. Release animates back at normal speed for a satisfying press-and-release feel.
- **No `@media (hover: hover)`** — desktop-only Electron app, no need for touch device considerations.
- **Disabled buttons unaffected** — `.control-btn:disabled` already sets `opacity: 0.5` and `cursor: not-allowed`; disabled buttons don't fire `:active`.

### Files Changed

- `styles.css` — add `:hover` and `:active` rules after `.control-btn:disabled`

## Part 2: Fullscreen Early-Return Guard

### Problem

`cleanupFullscreen()` doesn't check if the wrapper is actually in fullscreen state. Double-calls (e.g., pressing ESC after Z key) trigger redundant `video.play()` calls and unnecessary DOM operations.

### Solution

Add a guard at the top of `cleanupFullscreen()` in `media-viewer.js` (~line 3740):

```js
cleanupFullscreen(wrapper) {
    if (!wrapper || !wrapper.classList.contains('fullscreen')) return;
    // ... rest unchanged
}
```

### Design Decisions

- **Null guard (`!wrapper`)** — defensive safety for edge cases where wrapper reference is stale.
- **Class check (`!wrapper.classList.contains('fullscreen')`)** — the `fullscreen` class is the source of truth for fullscreen state; if it's not present, there's nothing to clean up.
- **Safe to skip `abortFullscreenController()`** — if wrapper isn't fullscreen, there's no active controller to abort.

### Files Changed

- `media-viewer.js` — add guard to `cleanupFullscreen()` (~line 3740)

## Testing

- All existing E2E tests must pass (`npm run test:e2e`)
- All unit tests must pass (`npm test`)
- Manual verification: hover and click feedback visible on all control buttons in both single and compare mode
- Manual verification: double ESC / Z-then-ESC no longer triggers redundant video.play()
