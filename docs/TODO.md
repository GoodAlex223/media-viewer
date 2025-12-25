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

- [x] **Unused skip button in media player** — The "skip to next" button in media player is redundant since there are already prev/next media navigation buttons
  - Replaced single skip button with two buttons: ⏪ (10s backward) and ⏩ (10s forward)
  - Added `skipVideo(seconds)` method for video time navigation

### File Management

- [ ] **Custom folders for likes/dislikes** — Allow user to specify custom folders for liked and disliked files

- [ ] **Move file to special folder** — Add ability to move file to a special folder. Intended for deleting or highlighting files, but user can define their own purpose by setting a custom folder. No keyboard shortcut needed for these buttons

- [ ] **Remove failed files from list** — If a file fails to load (shows error), offer user the option to remove it from the list to prevent repeated errors on subsequent views

### Settings & Configuration

- [ ] **User input for K parameter** — Allow user to enter K value using number input

- [ ] **Disable auto-close for error messages** — In app settings, allow user to disable auto-closing of error notifications. Default behavior should be auto-close
  - [ ] Additionally: Define max number of simultaneous notifications and clear old ones when limit is exceeded

### Navigation & Controls

- [ ] **Alt+F4 not working** — Alt+F4 keyboard shortcut doesn't work for closing the application

- [ ] **A/D keys for pair navigation** — A and D keys should show previous/next pairs without moving (hotkeys for preview)

### Bug Fixes

- [ ] **Similarity sorting not working in single mode** — Investigate why similarity sorting doesn't work for single mode

- [ ] **Sorting stops when window minimized** — Sorting process stops when application window is minimized

- [ ] **Media skipping in single mode** — When rating a post (like/dislike) in single mode, media skips by 2 instead of 1. Example: after rating media 1, it shows media 3 instead of media 2 (which was second before rating). Should show sequentially without skipping

---

*Last Updated: 2025-12-25*
