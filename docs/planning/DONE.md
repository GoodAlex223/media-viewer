# DONE

Completed tasks with implementation details and learnings.

**Last Updated**: 2026-03-21 <!-- TASK-020 -->

**Purpose**: Historical record of completed work.
**Active tasks**: See [TODO.md](TODO.md)
**Project context**: See [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)

---

<!-- Organize by month, newest first. -->

## 2026-03 (March)

### [2026-03-21] Investigate ML sorting pair ordering and online adaptation (TASK-020)

**Plan**: [docs/archive/plans/2026-03-21-task-020-ml-sorting-fix.md](../../archive/plans/2026-03-21-task-020-ml-sorting-fix.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md](../../superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md)
**Summary**: Fixed race condition where compare mode rendered next pair before ML re-scoring completed. Added score delta notification so users can see online adaptation working. Added 7 unit tests for pair selection algorithm.
**Key Changes**:
- `media-viewer.js` — Added `pendingCompareRefresh`/`pendingCompareUpdates` state; deferred `showMedia()` in `moveComparePair()` when ML-sorted; bypassed 100ms debounce in `updateComplete`/`reverseUpdateComplete`; added score delta notification in `scoreComplete`; added `mediaNavigationInProgress` guard to all 4 compare rating handlers; orphan timeout cleanup
- `tests/ml-pair-selection.test.js` — 7 unit tests: basic pairing, second pair, 2-file boundary, equal scores, missing scores, pairIndex clamping, odd file count boundaries
- `docs/planning/BACKLOG.md` — 5 future work items: content-understanding features, auto re-sort, model diagnostics, margin-based pairing, score confidence indicator
**Spawned Tasks**: 5 items added to BACKLOG.md

---

### [2026-03-21] Extract fullscreen module from media-viewer.js (TASK-019)

**Plan**: [docs/archive/plans/2026-03-21-extract-fullscreen-module.md](../../archive/plans/2026-03-21-extract-fullscreen-module.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md](../../superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md)
**Summary**: Extracted fullscreen logic from media-viewer.js into a standalone `FullscreenManager` class in `fullscreen.js`, establishing the v2.0 modularization pattern (stateful manager + constructor-injected callbacks).
**Key Changes**:
- `fullscreen.js` — New ES module with `FullscreenManager` class (toggle, cleanup, abortController methods)
- `media-viewer.js` — Import + instantiate FullscreenManager, rename 10 call sites, delete 3 old methods (~70 lines net reduction)
- `eslint.config.mjs` — Added block 2c for browser renderer modules (Ten file-group blocks)
- `docs/PROJECT_CONTEXT.md` — Architecture decision: stateful manager + callbacks pattern
**Spawned Tasks**: 5 items added to BACKLOG.md (method rename, isZoomed helper, unit tests, wasPlaying cleanup, ESLint label style)

---

### [2026-03-20] UI polish: button press effects and fullscreen guard (TASK-018)

**Plan**: [docs/archive/plans/2026-03-20-task-018-ui-polish.md](../../archive/plans/2026-03-20-task-018-ui-polish.md)
**Summary**: Added `:active` press animation to all `.control-btn` elements (scale-down 0.93 + opacity 0.85 with 50ms transition) and added early-return guard in `cleanupFullscreen()` to prevent redundant operations on double-calls.
**Key Changes**:
- `styles.css` — Added `.control-btn:active:not(:disabled)` rule after all per-button `:hover` rules for correct source-order specificity
- `media-viewer.js` — Added `if (!wrapper.classList.contains('fullscreen')) return;` guard at top of `cleanupFullscreen()`
**Spawned Tasks**: 2 items added to BACKLOG.md (nav button hover states, consolidate per-button hover rules)

---

### [2026-03-20] ESLint config and documentation alignment (TASK-017)

**Plan**: N/A (low-effort documentation task)
**Summary**: Aligned ESLint config comments and CLAUDE.md with actual codebase state. Updated header from "Four JS environments" to "Nine file-group blocks", fixed stale JSDoc filename in electron-wrapper.cjs, corrected feature-extractor.js classification from "worker-loaded" to "worker+browser".
**Key Changes**:
- `eslint.config.mjs` — Header lists all 9 blocks; block 3b comment reflects browser+worker dual loading
- `tests/e2e/helpers/electron-wrapper.cjs` — JSDoc: `rdp-preload.js` → `rdp-preload.cjs`
- `CLAUDE.md` — Removed 3 stale "known discrepancy" references, updated block count
**Spawned Tasks**: 2 items added to BACKLOG.md (add `globals.browser` to block 3b, audit Git Insights for stale refs)

---

### [2026-03-20] E2E test reliability improvements (TASK-016)

**Plan**: N/A (small fixes from code review)
**Summary**: Fixed two reliability issues in E2E test helpers: closeApp() timer leak (clearTimeout on successful close) and CDN stub timing (register route via `electronApp.on('window')` before `firstWindow()` so synchronous `<script src>` is intercepted). Kept `waitForNotification()` helper for future test use.
**Key Changes**:
- `tests/e2e/helpers/electron-app.js` — closeApp() stores timer ID and clears on success; launchApp() registers CDN stub before firstWindow() via window event
**Spawned Tasks**: 2 items added to BACKLOG.md (investigate transient Vitest failures, use waitForNotification in future tests)

---

### [2026-03-20] Fix zoom and extraction bugs (TASK-015)

**Plan**: N/A (small bug fix, brainstorming + feature-dev inline)
**Summary**: Fixed three bugs discovered during code reviews: zoom popover mouseup listener leak via AbortController cleanup, missing signalUserActivity() in compare-mode rating handlers, and extraction pause state not reset on natural completion. Key fix was adding `removeZoomPopover(side)` to `cleanupCompareMedia()` for centralized cleanup across all 4 wrapper destruction paths.
**Key Changes**:
- `media-viewer.js` — Added AbortController to createZoomPopover, abort() in removeZoomPopover, removeZoomPopover(side) in cleanupCompareMedia(), signalUserActivity() in 4 compare-mode handlers, extraction pause state cleanup on natural completion
**Spawned Tasks**: 2 items added to BACKLOG.md (rename closeAllZoomPopovers, add unit test for AbortController cleanup)

---

### [2026-03-13] Playwright E2E test suite for Electron app (TASK-014)

**Plan**: N/A (implemented via feature-dev skill)
**Summary**: Added Playwright E2E test suite with 28 tests across 6 files covering all critical user workflows. Includes Electron 30+ workaround via wrapper pattern (strips `--remote-debugging-port=0` CLI flag, sets it via `app.commandLine.appendSwitch`). Handles `ELECTRON_RUN_AS_NODE` env contamination from VS Code/Claude Code terminals.
**Key Changes**:
- `playwright.config.js` — Playwright config (workers=1, fullyParallel=false)
- `tests/e2e/helpers/electron-wrapper.cjs` + `.cmd` — Electron 30+ CLI flag workaround
- `tests/e2e/helpers/rdp-preload.cjs` — Sets remote-debugging-port via app API
- `tests/e2e/helpers/electron-app.js` — Shared helpers (launchApp, seedLocalStorage, mockFolderDialog, etc.)
- `tests/e2e/app-launch.test.js` — 5 tests (drop zone, title, electronAPI, folder load, dialog mock)
- `tests/e2e/navigation.test.js` — 7 tests (file count, index, arrow keys, buttons, wrap-around)
- `tests/e2e/rating.test.js` — 6 tests (like/dislike/undo via keyboard+button, Settings panel config)
- `tests/e2e/compare-mode.test.js` — 4 tests (toggle, dual panes, D key nav, Q key rating)
- `tests/e2e/fullscreen.test.js` — 3 tests (Z key, Escape exit, X key)
- `tests/e2e/zoom.test.js` — 3 tests (popover toggle, slider, Escape reset)
- `tests/e2e/fixtures/` — Minimal PNG/MP4 binary fixtures + generator script
- `eslint.config.mjs` — 2 new blocks (5a: CJS helpers, 5b: E2E JS tests)
- `vitest.config.js` — Exclude `tests/e2e/**` from unit test discovery
- `package.json` — `@playwright/test ^1.58.2`, `test:e2e` script
**Spawned Tasks**: 3 items added to BACKLOG.md

---

### [2026-03-12] Unit test infrastructure and initial tests (TASK-013)

**Plan**: N/A (implemented via feature-dev skill)
**Summary**: Set up Vitest test framework with 103 tests across 4 suites covering core algorithmic logic. Zero tests to full coverage of pure functions and data structures.
**Key Changes**:
- `vitest.config.js` — Vitest configuration (tests/**/*.test.js)
- `tests/ml-model.test.js` — 36 tests for OnlineLogisticRegression
- `tests/sorting-worker.test.js` — 21 tests for MinHeap, VPTree, calculateHammingDistance
- `tests/feature-extractor.test.js` — 18 tests for rgbToHsl, computeHistogram, sharpness, symmetry, balance
- `tests/media-viewer-utils.test.js` — 28 tests for formatElapsed, formatTimeAgo, removeFileFromList, areFoldersConfigured
- `sorting-worker.js` — conditional CJS exports added for testability
- `eslint.config.mjs` — test file ESLint block added (block 7)
- `.husky/pre-commit` — tests run after lint-staged
- `package.json` — `"test": "vitest run"`, vitest devDependency
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2026-03-11] Pre-commit hooks with linting and formatting (TASK-012)

**Plan**: N/A (implemented directly via feature-dev skill)
**Summary**: Added ESLint (flat config), Prettier, and Husky pre-commit hooks. ESLint covers 4 JS environments (Node/main, preload hybrid, renderer ES module, Web Workers). Existing codebase fixed to 0 errors/0 warnings. Prettier formatting applied as a separate baseline commit.
**Key Changes**:
- `eslint.config.mjs` — flat config with per-environment globals
- `.prettierrc.json` — tabWidth=4, singleQuote, printWidth=120
- `.husky/pre-commit` — lint-staged on every commit
- `package.json` — lint/format scripts, lint-staged config, prepare hook
- ESLint fixes: unused catch params prefixed `_`, shadow var renames
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2026-03-05] Pause extraction when user is navigating

**Plan**: N/A (implemented directly via feature-dev skill)
**Summary**: Added pause/resume mechanism for background feature extraction. When the user navigates or rates files, extraction pauses automatically and resumes after 2 seconds of inactivity. Uses a Promise-based async gate pattern in the extraction loop.
**Key Changes**:
- `signalUserActivity()` — called from 6 input handlers (nextMedia, previousMedia, handleLike, handleDislike, handleCancel, moveToSpecialFolder)
- `awaitExtractionGate(signal)` — Promise-based async gate that blocks extraction loop while paused
- `resumeExtraction()` — unblocks gate after 2s idle timer, resets progress indicator
- Progress indicator shows pause icon with "Paused" text during pause
- `cancelBackgroundExtraction()` clears pause state and resolves gate on abort
- `showBackgroundExtractionProgress()` extended with `paused` parameter and last-count caching
**Spawned Tasks**: 2 items added to BACKLOG.md (OffscreenCanvas for main-thread relief, per-file gate granularity)

---

### [2026-03-05] Estimated time remaining for feature extraction

**Plan**: [2026-03-05_task-010-extraction-eta.md](../archive/plans/2026-03-05_task-010-extraction-eta.md)
**Summary**: Added ETA display to the background feature extraction progress pill using rolling average rate calculation. Shows estimated time remaining after 5+ files completed, and a completion notification with total elapsed time.
**Key Changes**:
- `formatElapsed()`/`formatEta()` time formatting utilities (seconds to human-readable)
- `recordExtractionCompletion()` — rolling window (last 20) rate calculation with ETA computation
- Progress pill extended: `"Extracting features: 45/200 (22%) — ~3m 12s"`
- Completion notification: `"Feature extraction complete — 200 files in 2m 34s"`
- Ghost pill prevention via `isBackgroundExtracting` guard after cancel
**Spawned Tasks**: 2 items added to BACKLOG.md (show rate in pill, reuse formatElapsed)

---

### [2026-03-05] Worker count setting for feature extraction

**Plan**: N/A (small effort, no separate plan)
**Summary**: Added configurable worker count (1-8) for feature extraction in Settings panel. Reads from localStorage with default of 4, takes effect on next pool initialization.
**Key Changes**:
- Constructor reads `featureWorkerCount` from localStorage with validation/clamping
- Number input in Settings panel (Help Overlay) with change handler
- CSS styling for number input inside `.setting-item`
**Spawned Tasks**: 2 items added to BACKLOG.md (auto-detect CPU cores, show worker count in progress)

---

### [2026-03-05] Cache age display in sorting notification

**Plan**: [2026-03-05_task-008-cache-age-display.md](../archive/plans/2026-03-05_task-008-cache-age-display.md)
**Summary**: Added human-readable cache age to the sort cache restore notification. New `formatTimeAgo()` utility converts stored timestamp to relative time (e.g., "cached 2 hours ago").
**Key Changes**:
- `formatTimeAgo(timestamp)` method with singular/plural handling (just now → minutes → hours → days → weeks)
- Cache restore notification appends `— cached {timeAgo}` after stats
- `typeof === 'number'` guard for backwards compatibility with old caches
**Spawned Tasks**: 2 items added to BACKLOG.md (reuse formatTimeAgo, month granularity)

---

## 2026-02 (February)

### [2026-02-25] Force re-sort option for similarity sorting

**Summary**: Added Shift+click on the sort button to bypass cached sort results and perform a fresh similarity sort. Works directly from both unsorted and already-sorted states.
**Key Changes**:
- `handleSortBySimilarity(forceResort)` accepts boolean parameter via `e.shiftKey`
- New `deleteSortCache(algorithm)` removes current algorithm's cache entry only
- `originalMediaFiles` snapshot preserved across force re-sorts (Restore Order returns to true disk order)
- Catch block guarded with `wasAlreadySorted` to prevent file list wipe on failed force re-sort
- Sort button tooltip updated with Shift+click hint
**Spawned Tasks**: 2 items added to BACKLOG.md (help overlay hint, ML sort force re-sort)

### [2026-02-24] Unified fullscreen exit cleanup method

**Plan**: [2026-02-24_task-006-unified-fullscreen-cleanup.md](../archive/plans/2026-02-24_task-006-unified-fullscreen-cleanup.md)
**Summary**: Renamed `exitFullscreen()` to `cleanupFullscreen()` and routed all 5 exit paths through it — including the two destructive paths (`toggleViewMode`, `showCompareMedia`) that previously called `abortFullscreenController()` directly. Single source of truth for all fullscreen cleanup.
**Key Changes**:
- Renamed `exitFullscreen` → `cleanupFullscreen` (definition + 7 call sites)
- `toggleViewMode()` and `showCompareMedia()` now call `cleanupFullscreen()` before `wrapper.remove()`
- Updated stale references in CLAUDE.md and BACKLOG.md
**Spawned Tasks**: 1 item added to BACKLOG.md (extract setupFullscreen from toggleFullscreen enter branch)

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
