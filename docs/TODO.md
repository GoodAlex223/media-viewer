# TODO

## Active Tasks

### UI/UX Improvements

- [x] **Image zoom capability** — Add ability to zoom/magnify images (like using a magnifying glass)
  - Mouse wheel zoom centered on cursor
  - Double-click to cycle 1x → 2x → 4x → 1x
  - Drag to pan when zoomed
  - Zoom indicator showing percentage
  - Works in both single and compare modes (independent per image)
  - ESC resets zoom, zoom resets on file navigation

- [x] **Text overflow in boxes** — Filename or error text extends beyond its container boundaries
  - Added max-height + scroll for notifications
  - Fixed folder-info with min-width: 0
  - Created header-controls class with flex-wrap for button overflow

- [x] **Notifications and media info are intrusive** — They often cover half or all of the media when quickly rating and the window is half-screen size
  - Moved notifications to bottom-right corner (less intrusive)
  - Added setting to disable rating confirmation notifications (F1 → Settings)
  - Changed media info from hover to click-to-show (ℹ button or I key)

- [ ] **Video fullscreen toggle on second click** — Clicking on a video a second time when it is open in fullscreen mode should close fullscreen, not zoom in

- [ ] **Visual media scale controls** — Add a visual interface for manipulating media scale (zoom) in both fullscreen and normal modes. Should work in both single mode and compare mode

- [x] **Unused skip button in media player** — The "skip to next" button in media player is redundant since there are already prev/next media navigation buttons
  - Replaced single skip button with two buttons: ⏪ (10s backward) and ⏩ (10s forward)
  - Added `skipVideo(seconds)` method for video time navigation

### File Management

- [x] **Custom folders for likes/dislikes** — Allow user to specify custom folders for liked and disliked files
  - Added folder settings UI in Help overlay (F1 → Settings → Rating Folders)
  - Browse buttons for selecting folders via system dialog
  - Clear buttons to reset folder configuration
  - Rating buttons disabled until both folders are configured
  - Works in both single and compare modes

- [x] **Move file to special folder** — Add ability to move file to a special folder. Intended for deleting or highlighting files, but user can define their own purpose by setting a custom folder. No keyboard shortcut needed for this button
  - Added 📁 Special button in single view (before Undo button)
  - Added Left/Right Special buttons in compare view
  - Special folder configuration in Settings (F1 → Special Folder)
  - Button disabled until folder is configured

- [x] **Remove failed files from list** — If a file fails to load (shows error), offer user the option to remove it from the list to prevent repeated errors on subsequent views
  - Added "Remove" button in error notifications
  - Works in both single and compare modes
  - Automatically navigates to next file after removal

### Settings & Configuration

- [x] **Disable auto-close for error messages** — In app settings, allow user to disable auto-closing of error notifications. Default behavior should be auto-close
  - Added "Auto-close error notifications (8s)" checkbox in Settings (F1)
  - Default: errors stay visible until dismissed
  - When enabled: errors auto-close after 8 seconds
  - [x] Additionally: Define max number of simultaneous notifications and clear old ones when limit is exceeded
  - Limited to 5 simultaneous notifications, oldest removed when exceeded

### Navigation & Controls

- [x] **Alt+F4 not working** — Alt+F4 keyboard shortcut doesn't work for closing the application
  - Registered Alt+F4 as globalShortcut in main process
  - Closes focused window when pressed
  - Properly unregisters shortcuts on app quit

- [x] **A/D keys for pair navigation** — A and D keys should show previous/next pairs without moving (hotkeys for preview)
  - Added A (previous) and D (next) keyboard shortcuts in compare mode
  - Works same as arrow navigation buttons
  - Documented in help overlay (F1)

### Bug Fixes

- [x] **Similarity sorting not working in single mode** — Investigate why similarity sorting doesn't work for single mode
  - Issue: Sorting always started from first file, not currently viewed file
  - Fixed all 3 algorithms (Simple, VP-Tree, MST) to start from current file
  - Now sorting starts from whichever image you're viewing

- [x] **Sorting stops when window minimized** — Sorting process stops when application window is minimized
  - Root cause: Chromium throttles setTimeout to ~1s intervals when window is minimized
  - Solution: Moved sorting algorithms to Web Worker (separate thread not affected by throttling)
  - Created sorting-worker.js with MinHeap, VPTree, and all 3 sorting algorithms
  - Worker receives hashes and returns sorted paths via postMessage
  - Progress updates shown in real-time
  - Abort/cancel still works via worker message

- [x] **Media skipping in single mode** — When rating a post (like/dislike) in single mode, media skips by 2 instead of 1. Example: after rating media 1, it shows media 3 instead of media 2 (which was second before rating). Should show sequentially without skipping
  - Root cause: `moveCurrentFile()` called `nextMedia()` after splice, but splice already shifts the array so `currentIndex` points to the next file
  - Fixed by replacing `nextMedia()` with `showMedia()` in line 1008
  - Also fixed undo: restored file was pushed to end of array, now inserted at `currentIndex` to maintain order

---

*Last Updated: 2025-12-26*
