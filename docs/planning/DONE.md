# Done

Completed tasks archive. Tasks are moved here from TODO.md upon completion.

---

## Completed Tasks

### UI/UX Improvements

- [x] **Image zoom capability** — Add ability to zoom/magnify images (like using a magnifying glass)
  - Mouse wheel zoom centered on cursor
  - Double-click to cycle 1x -> 2x -> 4x -> 1x
  - Drag to pan when zoomed
  - Zoom indicator showing percentage
  - Works in both single and compare modes (independent per image)
  - ESC resets zoom, zoom resets on file navigation
  - *Completed: 2025-12*

- [x] **Text overflow in boxes** — Filename or error text extends beyond its container boundaries
  - Added max-height + scroll for notifications
  - Fixed folder-info with min-width: 0
  - Created header-controls class with flex-wrap for button overflow
  - *Completed: 2025-12*

- [x] **Notifications and media info are intrusive** — They often cover half or all of the media when quickly rating and the window is half-screen size
  - Moved notifications to bottom-right corner (less intrusive)
  - Added setting to disable rating confirmation notifications (F1 -> Settings)
  - Changed media info from hover to click-to-show (i button or I key)
  - *Completed: 2025-12*

- [x] **Unused skip button in media player** — The "skip to next" button in media player is redundant since there are already prev/next media navigation buttons
  - Replaced single skip button with two buttons: << (10s backward) and >> (10s forward)
  - Added `skipVideo(seconds)` method for video time navigation
  - *Completed: 2025-12*

### File Management

- [x] **Custom folders for likes/dislikes** — Allow user to specify custom folders for liked and disliked files
  - Added folder settings UI in Help overlay (F1 -> Settings -> Rating Folders)
  - Browse buttons for selecting folders via system dialog
  - Clear buttons to reset folder configuration
  - Rating buttons disabled until both folders are configured
  - Works in both single and compare modes
  - *Completed: 2025-12*

- [x] **Move file to special folder** — Add ability to move file to a special folder. Intended for deleting or highlighting files, but user can define their own purpose by setting a custom folder. No keyboard shortcut needed for this button
  - Added Special button in single view (before Undo button)
  - Added Left/Right Special buttons in compare view
  - Special folder configuration in Settings (F1 -> Special Folder)
  - Button disabled until folder is configured
  - *Completed: 2025-12*

- [x] **Remove failed files from list** — If a file fails to load (shows error), offer user the option to remove it from the list to prevent repeated errors on subsequent views
  - Added "Remove" button in error notifications
  - Works in both single and compare modes
  - Automatically navigates to next file after removal
  - *Completed: 2025-12*

### Settings & Configuration

- [x] **Disable auto-close for error messages** — In app settings, allow user to disable auto-closing of error notifications. Default behavior should be auto-close
  - Added "Auto-close error notifications (8s)" checkbox in Settings (F1)
  - Default: errors stay visible until dismissed
  - When enabled: errors auto-close after 8 seconds
  - Limited to 5 simultaneous notifications, oldest removed when exceeded
  - *Completed: 2025-12*

### Navigation & Controls

- [x] **Alt+F4 not working** — Alt+F4 keyboard shortcut doesn't work for closing the application
  - Registered Alt+F4 as globalShortcut in main process
  - Closes focused window when pressed
  - Properly unregisters shortcuts on app quit
  - *Completed: 2025-12*

- [x] **A/D keys for pair navigation** — A and D keys should show previous/next pairs without moving (hotkeys for preview)
  - Added A (previous) and D (next) keyboard shortcuts in compare mode
  - Works same as arrow navigation buttons
  - Documented in help overlay (F1)
  - *Completed: 2025-12*

### Bug Fixes

- [x] **Similarity sorting not working in single mode** — Investigate why similarity sorting doesn't work for single mode
  - Issue: Sorting always started from first file, not currently viewed file
  - Fixed all 3 algorithms (Simple, VP-Tree, MST) to start from current file
  - Now sorting starts from whichever image you're viewing
  - *Completed: 2025-12*

- [x] **Sorting stops when window minimized** — Sorting process stops when application window is minimized
  - Root cause: Chromium throttles setTimeout to ~1s intervals when window is minimized
  - Solution: Moved sorting algorithms to Web Worker (separate thread not affected by throttling)
  - Created sorting-worker.js with MinHeap, VPTree, and all 3 sorting algorithms
  - Worker receives hashes and returns sorted paths via postMessage
  - Progress updates shown in real-time
  - Abort/cancel still works via worker message
  - *Completed: 2025-12*

- [x] **Media skipping in single mode** — When rating a post (like/dislike) in single mode, media skips by 2 instead of 1
  - Root cause: `moveCurrentFile()` called `nextMedia()` after splice, but splice already shifts the array
  - Fixed by replacing `nextMedia()` with `showMedia()` in line 1008
  - Also fixed undo: restored file was pushed to end of array, now inserted at `currentIndex`
  - *Completed: 2025-12*

### Performance

- [x] **ML-based prediction sorting and background feature extraction**
  - Implemented background feature extraction with worker pool
  - Added sorting results caching in IndexedDB
  - Progress indicator during sorting
  - *Completed: 2025-12*

- [x] **Sorting algorithm cache** — Cache sorting results to restore order without re-sorting
  - Per-algorithm caching (VP-Tree, MST, Simple)
  - New files inserted at optimal positions based on similarity
  - Removed files automatically skipped
  - Plan: [2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)
  - *Completed: 2025-12*

### Bug Fixes (continued)

- [x] **Compare mode AI sort file mismatch** — Media info showed wrong files when sorted by AI
  - Fixed onLoad handlers to use compareLeftFile/compareRightFile references
  - Fixed copy filename to use correct file in AI-sorted mode
  - Added cache cleanup when files are removed
  - Plan: [2026-01-02_compare-mode-ai-sort-bug.md](../archive/plans/2026-01-02_compare-mode-ai-sort-bug.md)
  - *Completed: 2026-01*

---

*Last Updated: 2026-01-10*
