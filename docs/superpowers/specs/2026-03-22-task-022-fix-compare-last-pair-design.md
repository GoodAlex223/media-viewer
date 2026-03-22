# TASK-022: Fix Compare Mode Last-Pair Error Cascade

**Date**: 2026-03-22
**Status**: Approved
**Approach**: A — Fix at moveComparePair + defense-in-depth at showCompareMedia

## Problem

When the last pair is rated in compare mode and <2 media files remain, continuous error notifications appear until the user manually switches to single mode. Two interleaving bugs:

1. **Infinite loop**: `showCompareMedia()` sets `isCompareMode = false` then calls `toggleViewMode()` which *toggles* `!this.isCompareMode`, flipping it back to `true` — creating an infinite loop of error notifications.
2. **Drop zone on 0 files**: `showMedia()` shows the drop zone when `mediaFiles.length === 0`, but undo history (moveHistory) is still available. User should be able to undo instead.

## Design

### 1. `moveComparePair()` — Early mode switch after file removal

After `removeFileFromList()` for both files (lines 3637-3638), before any `showMedia()` call or ML-deferred path:

- Check `this.mediaFiles.length < 2`
- Clear pending ML state (pendingCompareTimeout, pendingCompareRefresh, pendingCompareUpdates, previousScores, mediaNavigationInProgress)
- Call `switchToSingleModeUI()` (new helper)
- If 1 file remains: notify "Last pair rated - switched to single view", set `currentIndex = 0`, call `showMedia()`
- If 0 files remain: notify "All files rated - press Ctrl+Z to undo", call `showEmptyStateWithUndo()`
- Return early — skip normal showMedia()/ML-deferred path

### 2. `showEmptyStateWithUndo()` — New empty state preserving undo

Lightweight method when 0 files remain but undo history exists:

- Clean up any displayed media (`cleanupCurrentMedia()`)
- Hide loading spinner
- Update folder info (shows "0 files") and navigation info (clears counter)
- Does NOT clear `moveHistory`
- Does NOT call `showDropZone()`
- Container stays empty — existing toolbar with undo (Ctrl+Z) remains functional

When the user presses Ctrl+Z, `handleCancel()` in single mode restores 1 file and calls `showMedia()` which renders it normally.

### 3. `showCompareMedia()` — Defense-in-depth fix

Fix the existing guard at lines 2374-2378 to use `switchToSingleModeUI()` instead of `toggleViewMode()`:

- Remove the `this.isCompareMode = false` + `this.toggleViewMode()` pattern (the toggle bug)
- Replace with `switchToSingleModeUI()`
- Apply same 1-file / 0-file branching as Section 1
- This guard should rarely be reached from normal flow (Section 1 catches it first), but protects against other call paths

### 4. `switchToSingleModeUI()` — Shared helper

Extracted from `toggleViewMode()` lines 3403-3418. Sets UI to single mode without toggling:

```
switchToSingleModeUI() {
    this.isCompareMode = false;
    this.viewModeLabel.textContent = 'Single';
    this.controls.style.display = 'flex';
    this.compareControls.style.display = 'none';
    this.mediaContainer.classList.remove('compare-mode');
    this.leftFileInfo.classList.remove('show');
    this.leftFileInfo.style.display = 'none';
    this.rightFileInfo.classList.remove('show');
    this.rightFileInfo.style.display = 'none';
    this.fileInfo.style.display = 'block';
    if (this.infoToggleBtn) {
        this.infoToggleBtn.style.display = 'flex';
    }
    this.hidePredictionBadges();
    this.closeAllZoomPopovers();
}
```

No media cleanup — caller is responsible (moveComparePair already cleaned up, showCompareMedia hasn't created media yet).

### 5. `showMedia()` — Conditional drop zone

Change the `mediaFiles.length === 0` guard:

- If `moveHistory.length > 0`: call `showEmptyStateWithUndo()` (undo available)
- If `moveHistory.length === 0`: call `showDropZone()` (genuine empty state — initial launch, empty folder)

### 6. ML-deferred path

The <2 files check in Section 1 goes before the `if (mlSortedCompare && ...)` branch, so it catches both the normal and ML-deferred paths. Pending ML state is cleared in the early exit to prevent stale `updateComplete` handlers from calling `showMedia()` in a broken state.

## Edge Cases

1. **0 files, undo restores to compare**: `handleCancel()` single-mode branch restores 1 file and calls `showMedia()` in single mode — correct behavior
2. **0 files, undo restores 2 files**: After undo restores 1 file in single mode, user could undo again to get another file, then manually toggle to compare mode
3. **ML-sorted compare, last pair**: pendingCompareRefresh/pendingCompareUpdates cleared before mode switch, no stale callbacks
4. **Missing files during last pair**: `showCompareMedia()` defense guard catches this if files are removed during validation, applies same clean switch
5. **Rapid double-click on last pair**: `mediaNavigationInProgress` guard in rating handlers prevents second call

## Acceptance Criteria

- [ ] Switching to single mode happens cleanly when <2 files remain
- [ ] No error spam — at most one notification
- [ ] State flags (isLoading, mediaNavigationInProgress) properly reset
- [ ] When 0 files remain, undo (Ctrl+Z) restores last file and displays it in single mode
- [ ] Drop zone only shown when no undo history exists
- [ ] All E2E tests pass (`npm run test:e2e`)
- [ ] All unit tests pass (`npm test`)
