# Compare Mode Fix — Design Spec

**Date**: 2026-04-10
**Branch**: `feature/compare-mode-fix`
**Source**: TODO.md (HIGH), BACKLOG (TASK-022), WEEKLY.md Group A
**Total SP**: 4

---

## Problem

When switching folders while in Compare Mode, both Single Mode and Compare Mode buttons appear simultaneously.

### Root Cause Chain

1. User is in Compare Mode (`isCompareMode = true`)
2. User switches folders — calls `loadFolder()`
3. `loadFolder()` does **not** reset `isCompareMode` — it remains `true`
4. `loadFolder()` calls `hideDropZone()` (line 2248)
5. `hideDropZone()` unconditionally shows `.controls` (line 2266) — these are the Single Mode buttons
6. `loadFolder()` calls `showMedia()` (line 2249)
7. `showMedia()` checks `isCompareMode === true` and renders Compare Mode overlay buttons
8. **Result**: Both `.controls` (Single Mode) and Compare overlay buttons are visible

### Secondary Issue

The single-mode branch in `toggleViewMode()` (lines 3633-3649) duplicates UI state management that `switchToSingleModeUI()` (lines 3567-3584) already handles. The duplication is also incomplete — `toggleViewMode()` is missing `videoControls` hide (covered by compare-mode entry path but still a gap).

---

## Design Decision

**New folders always open in Single Mode**, regardless of prior mode state. Rationale:
- Compare Mode is contextual to files within a folder — switching folders invalidates the comparison context
- `loadFolder()` already resets all other state (index, history, caches, sorting) — compare mode should follow the same pattern
- Preserving mode across folders would add complexity (validate file count, handle edge cases) for no clear user benefit

---

## Changes

### 1. Bug Fix: Reset compare mode on folder switch

**File**: `media-viewer.js` — `loadFolder()` method (~line 2247)

Insert `this.switchToSingleModeUI()` before `this.hideDropZone()`:

```javascript
// existing: sort similarity button reset (line 2246-2247)
this.switchToSingleModeUI();  // NEW — reset compare mode state + UI
this.hideDropZone();          // existing line 2248
await this.showMedia();       // existing line 2249
```

`switchToSingleModeUI()` handles:
- Sets `isCompareMode = false`
- Shows `.controls`, hides `.compareControls`
- Removes `compare-mode` CSS class from media container
- Hides video controls
- Restores file info panel (hides left/right, shows main)
- Shows info toggle button
- Hides prediction badges
- Closes all zoom popovers

The redundant `.controls` show from both `switchToSingleModeUI()` and `hideDropZone()` is harmless.

### 2. DRY: Refactor `toggleViewMode()` single-mode branch

**File**: `media-viewer.js` — `toggleViewMode()` method (~lines 3633-3649)

Replace the entire else-branch with a single call to `switchToSingleModeUI()`:

**Before** (lines 3633-3649):
```javascript
} else {
    this.viewModeLabel.textContent = 'Single';
    this.controls.style.display = 'flex';
    if (this.infoToggleBtn) {
        this.infoToggleBtn.style.display = 'flex';
    }
    this.compareControls.style.display = 'none';
    this.mediaContainer.classList.remove('compare-mode');
    this.leftFileInfo.classList.remove('show');
    this.rightFileInfo.classList.remove('show');
    this.leftFileInfo.style.display = 'none';
    this.rightFileInfo.style.display = 'none';
    this.fileInfo.style.display = 'block';
}
```

**After**:
```javascript
} else {
    this.switchToSingleModeUI();
}
```

The `hidePredictionBadges()` and `closeAllZoomPopovers()` calls at the top of `toggleViewMode()` (lines 3589-3591) remain — they're redundant for the single-mode path but harmless, and removing them would change the compare-mode entry path for no benefit.

---

## Testing

### New E2E Test

**Scenario**: Folder switch resets compare mode

1. Launch app, load folder with 3+ files
2. Enter Compare Mode (click view mode toggle)
3. Verify Compare Mode is active (compare overlay visible, single controls hidden)
4. Load a different folder
5. **Assert**: Single Mode is active — `.controls` visible, no compare overlay buttons, `isCompareMode === false`

### Existing Tests to Verify

- `compare-mode.test.js` — existing compare mode E2E tests still pass
- `navigation.test.js` — folder loading tests still pass
- `app-launch.test.js` — basic launch still works

---

## Scope

**In scope**: The two changes above + one new E2E test.

**Out of scope**: Changes to `hideDropZone()` (wider blast radius, not needed), changes to `showMedia()`, any new mode-preservation features.
