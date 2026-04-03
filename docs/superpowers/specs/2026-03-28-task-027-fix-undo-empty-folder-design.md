# TASK-027: Fix Undo When No Media Remains in Folder

**Date**: 2026-03-28
**Priority**: Normal
**Effort**: Low
**Origin**: Manual testing 2026-03-19
**Approach**: B — Guard Fix + Empty State UI Improvement

## Problem

When all media files have been rated/moved out of a folder, `mediaFiles[]` becomes empty. In this state:

1. The keydown handler at `media-viewer.js:1729` has `if (this.mediaFiles.length === 0) return;` which blocks ALL keyboard input, including the undo shortcut
2. `showEmptyStateWithUndo()` is minimal — it cleans up media and updates info text but doesn't provide a visible undo prompt or button
3. The undo button in the controls bar may be hidden since the controls bar visibility depends on the view state

The user sees "All files rated — press Ctrl+Z to undo" notification but the shortcut is silently blocked.

## Design

### 1. Keydown Guard Fix

Change the early return at line 1729 to allow the undo action through when undo history exists:

```js
if (this.mediaFiles.length === 0) {
    const mode = this.isCompareMode ? 'compare' : 'single';
    const keyStr = this.buildKeyString(e);
    const action = this.shortcutReverseMap[mode][keyStr];
    if (action === 'undo' && this.moveHistory.length > 0) {
        e.preventDefault();
        this.executeAction('undo');
    }
    return;
}
```

All other shortcuts remain blocked in empty state. Only undo passes through when there's history.

### 2. Empty State UI Improvement

Enhance `showEmptyStateWithUndo()` to display a clear empty state with a visible undo button:

1. **Hide drop zone** if visible (drop zone = "no folder loaded"; this state = "folder loaded but empty")
2. **Clear the media container** content
3. **Show an empty-state message** in the media container: centered text "No media files remaining" with a visible "Undo" button
4. **Keep the controls bar visible** with the undo button enabled (keyboard AND click both work)
5. **Hide inapplicable controls** (nav arrows, rating buttons, sort buttons) — only undo should be actionable

The empty-state message is a dynamically created `div` (class `empty-state-undo`) centered in the media container with flexbox, styled consistently with the existing drop zone (same font, muted colors). It contains a text line and a styled button that calls `handleCancel()`. Created in `showEmptyStateWithUndo()`, removed at the start of `showSingleMedia()`/`showCompareMedia()` (or by checking for and removing `.empty-state-undo` at the top of `showMedia()`).

### 3. handleCancel() — No Structural Changes Needed

`handleCancel()` already handles all undo branches correctly:

- **Compare mode** (`isCompareMode` true + last 2 entries): restores both files, sets `_restoredPairFiles`, calls `showMedia()` → enters compare rendering
- **Single mode with compare-tagged history** (`isCompareMode` false + last 2 tagged `compareMode: true`): restores both files in single mode
- **Single mode**: restores one file at `currentIndex`, calls `showMedia()`

Key observations:
- `showEmptyStateWithUndo()` does NOT change `isCompareMode`, so the mode flag is preserved for correct branch selection on undo
- `splice(currentIndex, 0, file)` on an empty array inserts at position 0 regardless of stale `currentIndex` — correct behavior
- `showMedia()` → `showSingleMedia()`/`showCompareMedia()` re-shows all UI elements (controls bar, nav info, etc.)

The empty-state UI element is naturally replaced when `showMedia()` renders media content.

## Edge Cases

- **Multiple undos from empty state**: First undo restores file(s), `showMedia()` renders them. Subsequent undos work normally since `mediaFiles` is no longer empty.
- **Undo button click vs keyboard**: Both paths call `handleCancel()` — the button click path already works if the button is visible (Section 2 ensures it is).
- **Compare mode with only 1 history entry**: Falls through to single-file undo branch — correct, restores the one file.

## Acceptance Criteria

- [ ] Undo works even when `mediaFiles[]` is empty (keyboard shortcut)
- [ ] Undo works via button click in empty state
- [ ] File restored to list and displayed after undo
- [ ] Drop zone hidden, media view restored
- [ ] Works in both single and compare mode (restores to the mode that was active)

## Testing

### Unit Tests (Vitest)
- `showEmptyStateWithUndo()` creates empty-state message element and shows undo button
- Keydown guard: undo action passes through when `mediaFiles.length === 0` and `moveHistory.length > 0`

### E2E Tests (Playwright)
1. **Single mode undo from empty**: 1 file folder → rate → verify empty state with undo prompt → undo shortcut → verify file restored
2. **Compare mode undo from empty**: 2 file folder → compare mode → rate pair → verify empty state → undo shortcut → verify both files restored in compare mode
3. **Undo button click from empty**: Same as #1 but via button click

### Fixtures
Existing 1x1 PNG fixtures + `createTempFixtureDir()`. Use `seedLocalStorage` for shortcuts, `mockFolderDialog` for folder loading.

## Files Modified

- `media-viewer.js` — keydown guard fix (line ~1729), `showEmptyStateWithUndo()` enhancement (line ~2294)
- `styles.css` — styling for empty-state undo prompt (if needed)
- `tests/media-viewer-utils.test.js` — unit tests for guard and empty state
- `tests/e2e/undo-empty-state.test.js` — E2E tests (new file)
