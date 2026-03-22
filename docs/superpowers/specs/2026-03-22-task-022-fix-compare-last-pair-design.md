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
- Reset state flags: `isLoading = false`, `mediaNavigationInProgress = false`
- Clear pending ML state (pendingCompareTimeout, pendingCompareRefresh, pendingCompareUpdates, previousScores)
- Hide loading spinner
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

When the user presses Ctrl+Z, `handleCancel()` detects the last move came from compare mode (via a `compareMode: true` tag on history entries) and restores both files in a single undo. See Section 7.

### 3. `showCompareMedia()` — Defense-in-depth fix

Fix **both** toggle bug instances in `showCompareMedia()`:

1. **Top guard** (lines 2374-2378): Replace `this.isCompareMode = false` + `this.toggleViewMode()` with `switchToSingleModeUI()` + same 1-file / 0-file branching as Section 1.
2. **Missing-file retry path** (lines 2498-2499): Same fix — replace the `isCompareMode = false` + `toggleViewMode()` pattern with `switchToSingleModeUI()`.

Both guards should also clean up any existing compare media (leftMedia/rightMedia, leftMediaWrapper/rightMediaWrapper with fullscreen cleanup) before calling `switchToSingleModeUI()`, since these guards may fire when stale media references exist from a prior successful render.

These guards should rarely be reached from normal flow (Section 1 catches it first), but protect against other call paths.

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

No media cleanup — caller is responsible. `moveComparePair()` already cleaned up media before file moves. `showCompareMedia()` defense guards must clean up stale media before calling this helper (see Section 3).

### 5. `showMedia()` — Conditional drop zone

Change the `mediaFiles.length === 0` guard:

- If `moveHistory.length > 0`: call `showEmptyStateWithUndo()` (undo available)
- If `moveHistory.length === 0`: call `showDropZone()` (genuine empty state — initial launch, empty folder)

This affects all modes (not just post-compare transition). In single mode, rating the last file will also show the empty state with undo instead of the drop zone. This is better UX — undo is available in all cases where the user just rated something.

### 6. ML-deferred path

The <2 files check in Section 1 goes before the `if (mlSortedCompare && ...)` branch, so it catches both the normal and ML-deferred paths. Pending ML state is cleared in the early exit to prevent stale `updateComplete` handlers from calling `showMedia()` in a broken state.

### 7. `handleCancel()` — Compare-pair undo from single mode

When the last compare pair is rated and the app switches to single mode, undo must restore both files (not just one). Solution: tag compare-mode history entries so `handleCancel()` can detect them.

In `moveComparePair()`, add `compareMode: true` to both history push calls (lines 3564 and 3599).

In `handleCancel()`, when `isCompareMode === false` but the last 2 history entries both have `compareMode: true`, restore both files in one undo (same logic as the existing compare-mode undo branch at line 3241). After restoring both files, if `mediaFiles.length >= 2`, the user is in single mode with 2+ files and can manually toggle to compare mode if desired.

This avoids the awkward "undo twice to restore a pair" behavior.

## Edge Cases

1. **0 files, undo restores pair**: `handleCancel()` detects `compareMode: true` tag on last 2 history entries, restores both files in one undo, displays first file in single mode
2. **1 file, undo restores pair**: Same as above — restores both files, now 3 files in single mode
3. **ML-sorted compare, last pair**: pendingCompareRefresh/pendingCompareUpdates cleared before mode switch, no stale callbacks
4. **Missing files during last pair**: `showCompareMedia()` defense guard catches this if files are removed during validation, cleans up stale media, applies same clean switch
5. **Rapid double-click on last pair**: `mediaNavigationInProgress` guard in rating handlers prevents second call
6. **Single mode, last file rated**: `showMedia()` change (Section 5) shows empty state with undo instead of drop zone — single-mode undo restores the file normally
7. **Second toggle bug at line 2498-2499**: Fixed by Section 3 covering both instances

## Acceptance Criteria

- [ ] Switching to single mode happens cleanly when <2 files remain
- [ ] `isCompareMode === false` after transition
- [ ] No error spam — at most one notification
- [ ] State flags (isLoading, mediaNavigationInProgress) properly reset
- [ ] When 0 files remain after compare rating, undo (Ctrl+Z) restores both files in a single action
- [ ] When 0 files remain after single rating, undo (Ctrl+Z) restores the file
- [ ] Drop zone only shown when no undo history exists
- [ ] `showMedia()` empty-state change applies to both single and compare mode transitions
- [ ] All E2E tests pass (`npm run test:e2e`)
- [ ] All unit tests pass (`npm test`)
