# Video Fullscreen Toggle on Second Click

**Created**: 2025-12-29
**Completed**: 2026-02-05
**Status**: Complete
**Task**: Clicking on a video a second time when in fullscreen mode should close fullscreen, not zoom in

---

## 1. Problem Statement

**Current Behavior**:

- In compare mode, clicking on media enters fullscreen
- Once in fullscreen, clicking on a video element does nothing (single click returns early at line 3217-3218)
- Double-clicking on video triggers zoom cycle instead of exiting fullscreen
- Users expect a second click to exit fullscreen, similar to how many video players work

**Expected Behavior**:

- First click on media → enters fullscreen
- Second click on video in fullscreen → exits fullscreen (not zoom)

**Affected Modes**: Compare mode (single mode doesn't have fullscreen)

---

## 2. Analysis Summary

### Root Cause

In `toggleFullscreen()` method ([media-viewer.js:3179](../../media-viewer.js#L3179)):

```javascript
// Click to exit (but not on video controls)
const exitHandler = (e) => {
    // Don't exit if clicking on video controls
    if (video && e.target === video) {
        return;  // <-- This prevents video clicks from exiting
    }
    this.exitFullscreen(wrapper);
    wrapper.removeEventListener('click', exitHandler);
};
```

The `exitHandler` intentionally ignores clicks on the video element to avoid interfering with native video controls. However, since we use custom controls (`video.controls = false`), this restriction is unnecessary.

Additionally, `setupZoomEvents()` ([media-viewer.js:4457](../../media-viewer.js#L4457)) adds a double-click handler that triggers zoom, which conflicts with the expected fullscreen exit behavior.

### Approaches Considered

| # | Approach | Pros | Cons |
|---|----------|------|------|
| 1 | **Remove video click check in exitHandler** | Simple, direct fix | May need to handle edge cases |
| 2 | **Disable zoom in fullscreen mode** | Prevents zoom conflict | Users may want zoom in fullscreen |
| 3 | **Use single click for exit, keep double-click for zoom** | Both features available | Adds complexity, may confuse users |
| 4 | **Toggle fullscreen only, no zoom when fullscreen** | Clear UX pattern | Consistent with video player conventions |

### Assumptions

- Users expect video fullscreen to behave like standard video players (click to exit)
- Zoom functionality in fullscreen mode is not a priority (can be done via keyboard or wheel)
- The custom video controls bar should remain clickable without triggering fullscreen exit

### Edge Cases

1. **Click on video controls bar** → Should NOT exit fullscreen (handled separately)
2. **Click on video element** → Should exit fullscreen
3. **Double-click on video** → Should exit fullscreen (not zoom)
4. **Click on fullscreen indicator text** → Should exit fullscreen (current behavior)
5. **Click outside media area (wrapper padding)** → Should exit fullscreen (current behavior)

### Recommended Approach

**Approach 4: Toggle fullscreen only, disable zoom when fullscreen**

Reasoning:

- Matches user expectations for video players
- Clear, predictable UX pattern
- Zoom is still available via mouse wheel or keyboard in normal mode
- Simple implementation with minimal side effects

---

## 3. Implementation Plan

### Phase 1: Fix exitHandler to allow video clicks

**File**: `media-viewer.js`

**Task 1.1**: Modify `toggleFullscreen()` method

- Remove the `if (video && e.target === video) return;` check
- Add check to ignore clicks on overlay controls (like/dislike/special buttons)

**Task 1.2**: Prevent zoom when in fullscreen mode

- Modify `setupZoomEvents()` to check if parent wrapper is in fullscreen
- Skip zoom operations (double-click, wheel) when in fullscreen mode

### Phase 2: Testing

**Task 2.1**: Manual testing checklist

- [ ] Compare mode: click image → enters fullscreen
- [ ] Compare mode: click image again → exits fullscreen
- [ ] Compare mode: click video → enters fullscreen
- [ ] Compare mode: click video again → exits fullscreen
- [ ] Compare mode: double-click video in fullscreen → exits fullscreen (no zoom)
- [ ] Compare mode: click overlay buttons in fullscreen → buttons work, no fullscreen exit
- [ ] Compare mode: ESC key → exits fullscreen
- [ ] Normal mode (not fullscreen): zoom still works (double-click, wheel)

---

## 4. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking overlay button clicks | High | Add specific check for `.overlay-btn` class |
| Users expecting zoom in fullscreen | Low | Wheel zoom could be preserved if needed |
| Regression in single mode zoom | Medium | Only modify behavior when wrapper has `.fullscreen` class |

---

## 5. Improvements Identified

1. **Memory leak guard for exitHandler** — If exitFullscreen() is called via ESC key or keyboard shortcut (Z/X), the click-based `exitHandler` remains attached to the wrapper. Consider removing it in `exitFullscreen()` or using an AbortController for cleanup.
2. **Unified fullscreen exit cleanup** — Multiple exit paths (click, ESC, Z/X keys) each handle cleanup independently. A single `cleanupFullscreen()` method could centralize indicator removal, handler cleanup, and playback restoration.

---

## Execution Log

### [2025-12-29] — PHASE: Planning

- Goal understood: Make video fullscreen exit on second click instead of zooming
- Root cause identified: `exitHandler` ignores video element clicks
- Approach chosen: Remove video click restriction, disable zoom in fullscreen mode
- Risks identified: Overlay button interference, potential zoom regression

### [2025-12-29] — PHASE: Implementation

- Modified `toggleFullscreen()` ([media-viewer.js:3214-3223](../../media-viewer.js#L3214-L3223)):
  - Removed check that prevented video clicks from exiting fullscreen
  - Added check to preserve overlay button functionality (`.overlay-btn`, `.media-overlay-controls`)
- Modified `setupZoomEvents()` ([media-viewer.js:4457-4486](../../media-viewer.js#L4457-L4486)):
  - Added `isInFullscreen()` helper function
  - Disabled double-click zoom when in fullscreen mode
  - Disabled wheel zoom when in fullscreen mode
  - Disabled pan start when in fullscreen mode

### [2025-12-29] — PHASE: Testing

- Awaiting manual testing

### [2026-02-05] — PHASE: Complete

- Final approach: Remove video click restriction in exitHandler, disable zoom in fullscreen via isInFullscreen() guard
- Tests passing: N/A (no automated tests)
- Manual testing: Skipped per user request
- User approval: Received
- Implementation verified present on main branch via code review

### [2026-02-05] — PHASE: Task Completion Documentation

- **Step 1 EXTRACT**: 2 improvements → BACKLOG.md
- **Step 2 ARCHIVE**: Plan moved to docs/archive/plans/
- **Step 3 TRANSITION**: Task moved TODO.md → DONE.md
- **Step 4 COMMIT**: Documentation commit (pending)

---

*Last Updated: 2026-02-05*
