# TASK-018 — UI Polish: Button Press Effects and Fullscreen Guard

**Date**: 2026-03-20
**Status**: Approved
**Branch**: `feature/task-018-ui-polish`

## Summary

Two small UI improvements to finalize v1.1 polish:

1. Add `:active` CSS state to all `.control-btn` elements for visual press feedback
2. Add early-return guard in `cleanupFullscreen()` to prevent redundant operations on double-calls

## Part 1: Button Press Effects

### Problem

All `.control-btn` elements already have per-button `:hover` states (`.like-btn:hover:not(:disabled)`, `.dislike-btn:hover:not(:disabled)`, etc.) with `translateY(-3px) scale(1.05)`, color changes, and glow box-shadows. However, no button has an `:active` state — users get no visual feedback on the actual click/press moment.

### Existing Hover Rules (no changes needed)

- `.like-btn:hover:not(:disabled)` — green glow, translateY + scale (line 642)
- `.dislike-btn:hover:not(:disabled)` — red glow (line 655)
- `.cancel-btn:hover:not(:disabled)` — amber glow (line 668)
- `.special-btn:hover:not(:disabled)` — purple glow (line 681)
- `.zoom-toggle-btn:hover:not(:disabled)` — blue glow (line 1037)

### Solution

Add one CSS rule to `styles.css`, after the last per-button hover rule (`.zoom-toggle-btn:hover:not(:disabled)` at ~line 1041):

```css
.control-btn:active:not(:disabled) {
    transform: scale(0.93);
    opacity: 0.85;
    transition-duration: 50ms;
}
```

### Design Decisions

- **Pure CSS approach** — no JS listeners needed. The existing `transition: all var(--transition-normal)` (200ms ease) on `.control-btn` handles the release animation.
- **`:active` only** — all buttons already have rich `:hover` states with per-button colors and glows. A generic `.control-btn:hover` would stack unwanted effects (e.g., `filter: brightness()`) on top of these. The missing piece is press feedback only.
- **`:not(:disabled)` guard** — follows the existing pattern used by all per-button hover rules for consistency.
- **`transition-duration: 50ms` override** — overrides only the duration component of the inherited `transition: all var(--transition-normal)` shorthand. This makes the press-down instant (50ms) while release animates back at the normal 200ms speed. This is the first use of `transition-duration` as a standalone override in this codebase; it is intentional to achieve asymmetric press/release timing without duplicating the full `transition` shorthand.
- **No `@media (hover: hover)`** — desktop-only Electron app, no touch device considerations.
- **Source order for specificity tie-breaking** — `.control-btn:active:not(:disabled)` and `.like-btn:hover:not(:disabled)` have identical specificity (0, 3, 0). When a button is pressed, both `:hover` and `:active` match simultaneously. CSS resolves equal-specificity conflicts by source order (last rule wins). The `:active` rule must be placed **after** all per-button `:hover` rules in the file so the scale-down correctly overrides the hover scale-up during press.

### Files Changed

- `styles.css` — add `:active:not(:disabled)` rule after `.zoom-toggle-btn:hover:not(:disabled)` (~line 1042)

## Part 2: Fullscreen Early-Return Guard

### Problem

`cleanupFullscreen()` doesn't check if the wrapper is actually in fullscreen state. Double-calls (e.g., pressing ESC after Z key) trigger redundant `video.play()` calls and unnecessary DOM operations.

### Solution

Add a guard at the top of `cleanupFullscreen()` in `media-viewer.js` (~line 3740):

```js
cleanupFullscreen(wrapper) {
    if (!wrapper.classList.contains('fullscreen')) return;
    // ... rest unchanged
}
```

### Design Decisions

- **Class check only** — the `fullscreen` class is the source of truth for fullscreen state; if it's not present, there's nothing to clean up.
- **No null guard** — all call sites already guard `wrapper` against null before calling `cleanupFullscreen()` (e.g., `if (this.leftMediaWrapper) this.cleanupFullscreen(this.leftMediaWrapper)`). Adding `!wrapper` would be dead code.
- **Safe to skip `abortFullscreenController()`** — if wrapper isn't fullscreen, there's no active controller to abort.

### Files Changed

- `media-viewer.js` — add guard to `cleanupFullscreen()` (~line 3740)

## Testing

- All existing E2E tests must pass (`npm run test:e2e`)
- All unit tests must pass (`npm test`)
- Manual verification: click/press feedback visible on all control buttons in both single and compare mode
- Manual verification: existing hover effects unchanged (glow, translateY, scale-up)
- Manual verification: double ESC / Z-then-ESC no longer triggers redundant video.play()
