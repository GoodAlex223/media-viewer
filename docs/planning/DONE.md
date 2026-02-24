# DONE

Completed tasks with implementation details and learnings.

**Last Updated**: 2026-02-24

**Purpose**: Historical record of completed work.
**Active tasks**: See [TODO.md](TODO.md)
**Project context**: See [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)

---

<!-- Organize by month, newest first. -->

## 2026-02 (February)

### [2026-02-24] Memory leak guard for fullscreen exitHandler

**Summary**: Fixed memory leak where the click-to-exit handler in `toggleFullscreen()` accumulated on wrapper elements when fullscreen was exited via ESC key or Z/X keyboard shortcuts. Used AbortController with a class-instance Map (`fullscreenAbortControllers`) to ensure `exitFullscreen()` removes the handler regardless of exit path.
**Key Changes**:
- Added `this.fullscreenAbortControllers = new Map()` to constructor
- `toggleFullscreen()`: Create AbortController, store in Map, pass signal to addEventListener
- `exitFullscreen()`: Abort controller via helper at method entry
- Added `abortFullscreenController(wrapper)` helper, used by `exitFullscreen()`, `showCompareMedia()`, and `toggleViewMode()`
- Defensive guard: abort existing controller before creating new one in enter path
- Removed self-removal pattern from exitHandler closure
**Spawned Tasks**: 1 item added to BACKLOG.md (early return guard in exitFullscreen)

### [2026-02-06] Validation in showCompareMedia() for file existence

**Plan**: [2026-02-06_compare-file-validation.md](../archive/plans/2026-02-06_compare-file-validation.md)
**Summary**: Added proactive file existence validation in `showCompareMedia()` to detect and remove externally deleted files before display. Also fixed a bug where compare-mode error handlers assumed sequential pairing (broken for ML-sorted pairs).
**Key Changes**:
- Added `check-file-exists` IPC handler and `checkFileExists` preload bridge
- Parallel file existence validation with automatic retry (bounded, max 10)
- Warning notification for skipped missing files, graceful fallback when <2 files remain
- Fixed `failedIndex` calculation in `setupCompareImageHandlers` and `setupCompareVideoHandlers` to use path-based lookup
**Spawned Tasks**: 2 items added to BACKLOG.md (single-mode validation, batch validation)

### [2026-02-06] Centralized removeFile() method

**Plan**: [2026-02-06_centralized-remove-file.md](../archive/plans/2026-02-06_centralized-remove-file.md)
**Summary**: Consolidated duplicated file removal logic from 4 locations into a single `removeFileFromList(filePath)` method. Fixed cache leak in `removeFailedFile()` and added missing `perceptualHashes` cleanup across all removal paths.
**Key Changes**:
- Added `removeFileFromList(filePath)` handling splice, cache cleanup, and index adjustment
- Refactored `moveCurrentFile()`, `moveToSpecialFolder()`, `moveComparePair()`, `removeFailedFile()`
- Fixed bug: `removeFailedFile()` never cleaned predictionScores/featureCache/perceptualHashes
- Fixed bug: `perceptualHashes` never cleaned in any removal path
- Standardized index adjustment strategy across all removal paths
**Spawned Tasks**: 3 items added to BACKLOG.md (batch removal, insertFileIntoList, event-based cache)

### [2026-02-05] Visual media scale controls

**Plan**: [2026-02-05_visual-scale-controls.md](../archive/plans/2026-02-05_visual-scale-controls.md)
**Summary**: Added button-integrated zoom popovers with logarithmic slider for single and compare modes. Zoom button in control bar opens horizontal popover with `[-] slider [+] 100%` display.
**Key Changes**:
- Added zoom button wrapper to single-mode controls in HTML
- Added `createZoomPopover()`, `removeZoomPopover()`, `setupZoomPopovers()`, `closeAllZoomPopovers()` methods
- Integrated zoom into `addMediaOverlayControls()` for compare mode overlay buttons
- Logarithmic slider mapping (`sliderToScale`/`scaleToSlider`) for smooth zoom UX
- Glassmorphism popover styling matching existing design system
- Enabled zoom in fullscreen (wheel + pan)
**Spawned Tasks**: 4 items added to BACKLOG.md (click effect, keyboard shortcut, persistence, responsive slider)

### [2026-02-05] Video fullscreen toggle on second click

**Plan**: [2025-12-29_video-fullscreen-toggle.md](../archive/plans/2025-12-29_video-fullscreen-toggle.md)
**Summary**: Clicking on a video in fullscreen now exits fullscreen instead of zooming. Zoom operations (double-click, wheel, pan) are disabled in fullscreen mode.
**Key Changes**:
- Removed video click restriction in `toggleFullscreen()` exitHandler
- Added `isInFullscreen()` guard in `setupZoomEvents()` to disable zoom in fullscreen
- Overlay button clicks (like/dislike/special) preserved via `.closest()` checks
**Spawned Tasks**: 2 items added to BACKLOG.md (exitHandler cleanup, unified exit method)

---

## 2026-01 (January)

### [2026-01-02] Compare mode AI sort file mismatch

**Plan**: [2026-01-02_compare-mode-ai-sort-bug.md](../archive/plans/2026-01-02_compare-mode-ai-sort-bug.md)
**Summary**: Fixed media info showing wrong files when sorted by AI in compare mode.
**Key Changes**:
- Fixed onLoad handlers to use compareLeftFile/compareRightFile references
- Fixed copy filename to use correct file in AI-sorted mode
- Added cache cleanup when files are removed
**Spawned Tasks**: 1 item added to BACKLOG.md (centralized removeFile method)

---

## 2025-12 (December)

### [2025-12-28] Background feature extraction

**Plan**: [2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)
**Summary**: Implemented background feature extraction with worker pool and sorting results caching.
**Key Changes**:
- Background feature extraction with worker pool
- Sorting results caching in IndexedDB
- Progress indicator during sorting
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2025-12-27] Sorting algorithm cache

**Plan**: [2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)
**Summary**: Cached sorting results to restore order without re-sorting.
**Key Changes**:
- Per-algorithm caching (VP-Tree, MST, Simple)
- New files inserted at optimal positions based on similarity
- Removed files automatically skipped
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2025-12-25] Notifications and media info less intrusive

**Plan**: [2025-12-25_notifications-media-info-less-intrusive.md](../archive/plans/2025-12-25_notifications-media-info-less-intrusive.md)
**Summary**: Moved notifications to bottom-right corner and changed media info from hover to click-to-show.
**Key Changes**:
- Notifications moved to bottom-right corner
- Setting to disable rating confirmation notifications
- Media info changed from hover to click-to-show (i button or I key)
**Spawned Tasks**: 0

---

### [2025-12] Sorting stops when window minimized

**Summary**: Moved sorting algorithms to Web Worker to avoid Chromium timer throttling.
**Key Changes**:
- Created sorting-worker.js with MinHeap, VPTree, and all 3 sorting algorithms
- Worker communicates via postMessage with real-time progress updates
- Abort/cancel still works via worker message

---

### [2025-12] Similarity sorting not working in single mode

**Summary**: Fixed all 3 algorithms to start from currently viewed file instead of first file.
**Key Changes**:
- Fixed Simple, VP-Tree, MST algorithms to start from current file

---

### [2025-12] Media skipping in single mode

**Summary**: Fixed rating a file skipping 2 instead of 1 in single mode.
**Key Changes**:
- Replaced `nextMedia()` with `showMedia()` after splice
- Fixed undo to insert file at `currentIndex` instead of array end

---

### [2025-12] Image zoom capability

**Summary**: Added mouse wheel zoom, double-click cycle, and drag-to-pan for images.
**Key Changes**:
- Mouse wheel zoom centered on cursor
- Double-click to cycle 1x -> 2x -> 4x -> 1x
- Drag to pan when zoomed
- Works in both single and compare modes (independent per image)

---

### [2025-12] Text overflow in boxes

**Summary**: Fixed filename and error text extending beyond container boundaries.
**Key Changes**:
- Added max-height + scroll for notifications
- Fixed folder-info with min-width: 0
- Created header-controls class with flex-wrap

---

### [2025-12] Unused skip button in media player

**Summary**: Replaced single skip button with 10s backward/forward buttons.
**Key Changes**:
- Added << (10s backward) and >> (10s forward) buttons
- Added `skipVideo(seconds)` method

---

### [2025-12] Custom folders for likes/dislikes

**Summary**: Added folder settings UI for liked and disliked file destinations.
**Key Changes**:
- Folder settings UI in Help overlay (F1 -> Settings -> Rating Folders)
- Browse and clear buttons for folder selection
- Rating buttons disabled until both folders configured

---

### [2025-12] Move file to special folder

**Summary**: Added ability to move files to a user-defined special folder.
**Key Changes**:
- Special button in single view and Left/Right Special buttons in compare view
- Special folder configuration in Settings

---

### [2025-12] Remove failed files from list

**Summary**: Added Remove button in error notifications to remove unloadable files.
**Key Changes**:
- Remove button in error notifications
- Works in both single and compare modes
- Auto-navigates to next file after removal

---

### [2025-12] Disable auto-close for error messages

**Summary**: Added setting to control error notification auto-close behavior.
**Key Changes**:
- Auto-close error notifications checkbox in Settings (F1)
- Limited to 5 simultaneous notifications

---

### [2025-12] Alt+F4 not working

**Summary**: Registered Alt+F4 as globalShortcut in main process.
**Key Changes**:
- Alt+F4 registered as globalShortcut
- Properly unregisters on app quit

---

### [2025-12] A/D keys for pair navigation

**Summary**: Added A and D keyboard shortcuts for compare mode navigation.
**Key Changes**:
- A (previous) and D (next) shortcuts in compare mode
- Documented in help overlay

---

## Notes

- Entries organized by month, newest first
- Every entry must reference its plan document (if one exists)
- Use standard format for routine tasks, detailed format for significant work
- Spawned tasks should already be in [TODO.md](TODO.md) or [BACKLOG.md](BACKLOG.md)
