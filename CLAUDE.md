# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- AUTO-MANAGED: project-description -->
## Overview

**Media Viewer** - Electron desktop application for browsing, rating, and managing media files (images and videos) with visual similarity sorting and ML-based prediction features.

Key capabilities:
- Browse media folders with image/video preview
- Rate files (like/dislike/special) with keyboard shortcuts
- Visual similarity sorting using perceptual hashing
- ML-based prediction for user preferences
- Face detection features

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: build-commands -->
## Build & Development Commands

```bash
# Install dependencies
npm install

# Run the application
npm start

# Run with Electron directly
npx electron .

# Run unit tests (Vitest)
npm test

# Run E2E tests (Playwright + Electron)
npm run test:e2e

# Lint all JS files
npm run lint

# Lint and auto-fix
npm run lint:fix

# Format all files with Prettier
npm run format

# Check formatting without writing
npm run format:check
```

Pre-commit hook (Husky + lint-staged + vitest) runs automatically on `git commit`: ESLint --fix + Prettier on staged `*.{js,cjs}`; Prettier on staged `*.{json,css,html}`; then `npx vitest run` (unit tests must pass). E2E tests (`npm run test:e2e`) are NOT run by the pre-commit hook.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

```
media_viewer/
├── main.js              # Electron main process, IPC handlers, file operations
├── preload.js           # Security bridge, context isolation
├── media-viewer.js      # Renderer process, all UI logic (~6300+ lines)
├── index.html           # Main HTML entry point
├── styles.css           # Application styling, design system
├── sorting-worker.js    # Web Worker for sorting algorithms (MST, similarity)
├── ml-worker.js         # Web Worker for ML prediction tasks
├── ml-model.js          # ML model definitions
├── feature-extractor.js # Image feature extraction
├── feature-worker.js    # Web Worker for feature extraction
├── face-detector.js     # Face detection using @vladmandic/face-api
├── vitest.config.js     # Vitest config (include: tests/**/*.test.js, exclude: tests/e2e/**)
├── playwright.config.js # Playwright E2E config (testDir: tests/e2e, workers: 1)
├── tests/               # Automated tests
│   ├── sorting-worker.test.js      # MinHeap, VPTree, calculateHammingDistance  [Vitest]
│   ├── ml-model.test.js            # OnlineLogisticRegression  [Vitest]
│   ├── feature-extractor.test.js   # rgbToHsl, computeHistogram, etc.  [Vitest]
│   ├── media-viewer-utils.test.js  # formatElapsed, formatTimeAgo, removeFileFromList, etc.  [Vitest]
│   └── e2e/                        # Playwright E2E tests (Electron)
│       ├── app-launch.test.js      # Initial launch, drop zone, dialog mocking
│       ├── navigation.test.js      # Arrow keys, nav buttons, wrap-around
│       ├── rating.test.js          # Like/dislike/undo, Settings panel config
│       ├── compare-mode.test.js    # Toggle, dual panes, pair navigation, Q key
│       ├── fullscreen.test.js      # Z/X keys, Escape exit
│       ├── zoom.test.js            # Popover open/close, slider, Escape reset
│       ├── fixtures/               # Test images/video (red/green/blue 1x1 PNGs, tiny.mp4)
│       └── helpers/
│           ├── electron-app.js      # launchApp, closeApp, seedLocalStorage, mockFolderDialog, etc.
│           ├── electron-wrapper.cjs # Strips --remote-debugging-port=0 (Electron 30+ workaround)
│           ├── electron-wrapper.cmd # Windows CMD shim — executablePath on win32
│           └── rdp-preload.cjs      # Sets RDP via app.commandLine.appendSwitch
└── docs/                # Project documentation
    ├── planning/        # Task management (TODO, DONE, BACKLOG, GOALS, MILESTONES, ROADMAP)
    ├── archive/         # Historical documentation
    ├── ARCHITECTURE.md  # System design and data flows
    └── PROJECT_CONTEXT.md # Decisions, patterns, lessons learned
```

**Data Flow**:
1. Main process handles file system operations (read, move, copy)
2. Preload exposes secure IPC bridge to renderer
3. Renderer (media-viewer.js) manages UI state and user interactions
4. CPU-intensive tasks delegated to Web Workers (sorting, ML, feature extraction)

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

**Naming**:
- Functions: camelCase, verb-first (`loadMedia`, `showNotification`, `createZoomPopover`, `removeFileFromList`)
- Classes: PascalCase (`MinHeap`, `VPTree`, `MediaViewer`)
- Constants: UPPER_SNAKE_CASE (`MAX_NOTIFICATIONS`)
- DOM IDs: kebab-case (`media-container`, `folder-info`, `zoom-toggle-btn`)
- CSS Classes: kebab-case (`file-info-panel`, `zoom-popover`, `overlay-zoom-btn`)

**Patterns**:
- Single-file renderer: All UI logic in `media-viewer.js` (class-based)
- IPC Communication: Main process handles file ops, renderer handles UI
- Event-driven: DOM events trigger state changes and UI updates
- Web Workers: CPU-intensive operations (sorting, ML) in separate threads
- Centralized cleanup: Reusable methods for common operations (file removal, cache cleanup)

**Imports**:
- CommonJS `require()` in main process and workers
- Browser globals in renderer (no module bundler)

**Unused variables**:
- Prefix with `_` (e.g., `_unused`, `_err`) to satisfy ESLint `no-unused-vars` rule (`varsIgnorePattern: '^_'`, `argsIgnorePattern: '^_'`, `caughtErrorsIgnorePattern: '^_'`)

**Formatting & Linting**:
- Prettier: tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, bracketSpacing=true, arrowParens=always, endOfLine="lf"
- `.gitattributes`: `* text=auto eol=lf` — enforces LF line endings for all files across platforms
- ESLint flat config (`eslint.config.mjs`): 9 file-group blocks (Node/main, preload Node+browser, renderer module, renderer plain script, Web Workers, shared libs, unit tests/vitest, e2e CJS helpers, e2e JS tests + playwright.config.js); header comment says "Nine file-group blocks"; shared rules: eqeqeq, curly, prefer-const, no-var, no-shadow (warn), no-unused-vars (warn with `_`-prefix escape); unit test block adds `no-new-func: off`; unit test block explicitly ignores `tests/e2e/**`; e2e JS block adds browser globals for `page.evaluate()` callbacks
- `eslint-config-prettier` applied last to suppress rule conflicts with Prettier
- Prettier ignores `docs/`, `*.md`, `package-lock.json`

**Testing (Unit — Vitest)**:
- Framework: Vitest (`npm test` / `npx vitest run`); config in `vitest.config.js`
- Test files: `tests/**/*.test.js` excluding `tests/e2e/**` (ESM, sourceType: module, Node globals)
- CJS modules in ESM tests: use `createRequire(import.meta.url)` then `require('../module')`
- Web Worker modules: stub `globalThis.self = { onmessage: null, postMessage: () => {} }` before `require()` to satisfy top-level `self` reference
- MediaViewer method testing without DOM: `extractMethod(name)` reads source via `fs.readFileSync`, extracts method body with brace-counting, returns `new Function(params, body)`; call via `.call(mockCtx, ...args)`
- Time-dependent tests: `vi.useFakeTimers()` + `vi.setSystemTime()`; restore with `vi.useRealTimers()` in `afterEach`
- E2E framework: Playwright (`@playwright/test`) with `_electron` launcher; test files in `tests/e2e/*.spec.js`
- E2E launch helpers: `tests/e2e/helpers/electron-app.js` — `launchApp()`, `closeApp()`, `seedLocalStorage()`; waits for `window.mediaViewer` to be defined before tests run
- E2E electron-wrapper pattern: wrapper script (`electron-wrapper.cjs`/`.cmd`) strips `--remote-debugging-port=0` (Playwright injects it; Electron 30+ rejects it as CLI flag) and re-applies via `app.commandLine.appendSwitch` — workaround for playwright#39008
- E2E Windows process cleanup: `closeApp()` uses `taskkill /F /T /PID` on win32 instead of `proc.kill('SIGKILL')`; wrapper spawns a child electron.exe, so SIGKILL on the wrapper orphans it — `/T` kills the entire process tree

**Testing (E2E — Playwright)**:
- Framework: Playwright (`npm run test:e2e`); config in `playwright.config.js`; test files: `tests/e2e/**/*.test.js`
- workers: 1, fullyParallel: false — Electron tests cannot run in parallel
- Electron 30+ workaround: `--remote-debugging-port=0` rejected as CLI arg; `electron-wrapper.cjs` strips it and adds `-r rdp-preload.cjs`; `rdp-preload.cjs` sets it via `app.commandLine.appendSwitch` (see github.com/microsoft/playwright/issues/39008)
- ELECTRON_RUN_AS_NODE: Must be unset before spawning Electron (may be inherited from Claude Code/VS Code terminals); handled in `electron-wrapper.cjs`
- Overlay interception: `.media-container` overlay blocks pointer events on nav/rating buttons — use `{ force: true }` on clicks or call methods via `page.evaluate()`
- `seedLocalStorage(page, kvMap)`: Syncs both localStorage AND live MediaViewer instance properties (customLikeFolder, customDislikeFolder, customSpecialFolder); call after `launchApp()` but before `loadFolder()`
- `mockFolderDialog(electronApp, path)`: Replaces `ipcMain` handler to return preset path without showing native dialog
- `closeApp()`: Races `electronApp.close()` against 5s timeout then SIGKILL (Windows hang workaround)
- Lucide CDN stub: `page.route('**/unpkg.com/**')` returns empty module to avoid network dependency
- Fixtures: 1x1 PNG files (red, green, blue) + tiny.mp4 in `tests/e2e/fixtures/`; `createTempFixtureDir()` copies to temp dir with liked/disliked/special subdirs
- `rdp-preload.cjs` loads playwright-core internal `loader.js` by path — update path if it breaks after playwright-core upgrade

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

**Error Handling**:
- User-facing errors via notification system (bottom-right corner)
- Console logging for debugging
- Graceful degradation when features unavailable

**Data Structures**:
- MinHeap for priority queue operations
- VPTree (Vantage Point Tree) for nearest neighbor search
- Perceptual hashing for image similarity
- zoomControlsMap: Keyed by target ('single', 'left', 'right'), stores popover and toggleBtn refs

**State Management**:
- Class-based state in MediaViewer
- localStorage for user preferences (folders, settings, worker counts)
- Settings panel (F1/Help Overlay) uses number inputs and checkboxes wired to localStorage; constructor reads saved values with validation/clamping on load
- Extraction timing state: extractionStartTime (Date.now() at start) and extractionCompletionTimes (rolling window, max 20 entries) track per-file completion for ETA computation; both cleared on cancel and after completion notification

**Index Management**:
- Wrap-to-start: moveCurrentFile() cycles to index 0 when rating last file (continuous workflow)
- Cap-to-end: removeFileFromList() caps to length-1 by default (safe fallback)
- Reset to 0: Folder loads, sort operations, mode switches reset currentIndex

**Cache Management**:
- Centralized cleanup via removeFileFromList(): Handles array splice, cache cleanup (predictionScores, featureCache, perceptualHashes), and currentIndex adjustment
- Used by: removeFailedFile(), moveCurrentFile(), moveToSpecialFolder(), moveComparePair()
- Ensures consistent state across all file removal scenarios
- Sort cache: deleteSortCache(algorithm) selectively removes one algorithm's entry from .sort_cache.json; called by force re-sort path (Shift+click on Sort by Similarity)
- Sort cache entries include a `timestamp` field (ms epoch); formatTimeAgo(timestamp) converts it to human-readable age (seconds/minutes/hours/days/weeks) shown in the "loaded from cache" notification

**UI Component Management**:
- Dynamic zoom controls: Created per media pane via createZoomPopover(target, wrapper, toggleBtn)
- Popover lifecycle: createZoomPopover() creates, removeZoomPopover(target) cleans up
- Popover architecture: Zoom controls positioned above buttons via .control-btn-wrapper
- Single mode: Static zoom button in HTML, initialized by setupZoomPopovers()
- Compare mode: Zoom buttons added dynamically to overlay controls (addMediaOverlayControls)
- User-controlled visibility: Popovers toggle on button click, close on outside click

**Event Listener Lifecycle**:
- AbortController for scoped cleanup: fullscreenAbortControllers Map<wrapper, AbortController> stores controllers per wrapper element
- cleanupFullscreen(wrapper): unified exit point for ALL paths (click, ESC, Z/X keys, mode switch, pair navigation) — early-return guard skips cleanup when wrapper lacks `fullscreen` class; calls abortFullscreenController() first
- abortFullscreenController(wrapper): helper that aborts and deletes the controller; called by cleanupFullscreen() and before wrapper.remove()
- Prevents listener accumulation: exitHandler attached via { signal } so abort() removes it without stored reference
- Also used for sort cancellation (sortAbortController) and background extraction (backgroundExtractionAbort)

**Extraction Pause/Resume**:
- signalUserActivity(): called on nextMedia(), previousMedia(), handleLike(), handleDislike(), handleSpecial(), handleUndoMove() (single mode) and handleLeftLike(), handleLeftDislike(), handleRightLike(), handleRightDislike() (compare mode); sets extractionPaused=true immediately and shows "Paused" progress state; resets/restarts a 2-second idle timer
- resumeExtraction(): called by the idle timer after 2s of no activity; clears extractionPaused, resolves the awaitExtractionGate() promise, resets progress indicator to "Extracting"
- awaitExtractionGate(signal): async gate at the top of each extraction loop iteration; resolves immediately when not paused; blocks via new Promise (stored in extractionResumeResolve) until resumeExtraction() is called
- showBackgroundExtractionProgress(current, total, etaText, paused): paused=true renders "Paused — N/T (X%)"; _extractionLastCurrent/_extractionLastTotal cache last known counts for redisplay when current/total are null

**Async Run Isolation (Generation Counter)**:
- extractionRunId integer in constructor state; incremented at the start of each background extraction run via `const runId = ++this.extractionRunId`
- All async callbacks (then/catch) check `this.extractionRunId !== runId` and return early if stale — prevents cancelled run callbacks from mutating ETA window or firing completion notification of a new run
- Load-failure catch calls showBackgroundExtractionProgress() (not recordExtractionCompletion()) so near-instant failures don't skew the rolling ETA average
- formatElapsed(totalSeconds): isFinite + negative guard returns '?' for defensive safety against NaN/Infinity inputs

**Compare Mode Validation**:
- showCompareMedia() validates both files exist via IPC checkFileExists before rendering
- Parallel validation: Promise.all([checkFileExists(left), checkFileExists(right)])
- Missing files removed via removeFileFromList(), warning shown, retry attempted
- Bounded retry: retryCount parameter prevents deep recursion (max 10 retries)
- Graceful fallback: switches to single mode or shows drop zone when fewer than 2 files remain
- failedIndex resolved via mediaFiles.findIndex(f => f.path === file.path) for accuracy in ML-sorted pairs

**Security**:
- Context isolation enabled
- Sandbox disabled (required for file operations)
- IPC bridge via preload.js

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

Recent development focus:
- Line ending normalization (commit 5306bfd): `.gitattributes` added with `* text=auto eol=lf`; `.prettierrc.json` updated with `endOfLine: "lf"` — ensures consistent LF across all platforms and editors
- Planned tasks TASK-015 through TASK-028 added (commit 514f455): 14 active tasks covering bugs, E2E reliability, ESLint/docs alignment, UI polish, and v2.0 modularization
- TASK-015 completed (PR #14): Fixed three bugs — mouseup listener leak in createZoomPopover (AbortController cleanup), signalUserActivity() missing from compare-mode rating handlers (handleLeftLike/handleLeftDislike/handleRightLike/handleRightDislike), extraction pause state not reset on natural completion; code review added 3 low-confidence (25/100) BACKLOG items (commit 682f81b)
- TASK-018 completed: UI polish — added `:active` press animation to all `.control-btn` elements (scale-down + opacity with 50ms transition); added early-return guard in `cleanupFullscreen()` when wrapper is not in fullscreen
- TASK-019 🟠: Weekly challenge — extract fullscreen module from media-viewer.js (first v2.0 modularization step; establishes import strategy pattern for remaining extractions)
- Manual testing session spawned TASK-020 through TASK-028: ML sorting pair ordering investigation, compare mode overlay UX, compare mode last-pair error cascade, video pause/play icon sync, per-folder feature extraction caching, application logging to file, keyboard shortcut customization, undo when no media remains, research on media content understanding tools
- TASK-017 completed (commit d82c53f): Aligned ESLint config comments and CLAUDE.md with actual codebase state — updated eslint.config.mjs header from "Four JS environments" to "Nine file-group blocks" listing all 9 blocks (1, 1b, 2a, 2b, 3a, 3b, 4, 5a, 5b); corrected block 3b description to "shared libs (worker+browser)" reflecting dual load context; fixed stale JSDoc in electron-wrapper.cjs (rdp-preload.js → rdp-preload.cjs)
- E2E code review cleanup (TASK-016 PR #15, TASK-017 both completed 2026-03-20): TASK-016 — closeApp() clears setTimeout on success (timer leak fix), launchApp() registers CDN stub via `.once('window')` before firstWindow() so synchronous script tags are intercepted; TASK-017 — fixed stale JSDoc in electron-wrapper.cjs (rdp-preload.js → rdp-preload.cjs), updated eslint.config.mjs header to "Nine file-group blocks" listing all 9 blocks, corrected block 3b to reflect dual worker+browser loading of feature-extractor.js
- E2E test suite added (TASK-014): Playwright + @playwright/test; `npm run test:e2e`; 6 test files (app-launch, navigation, rating, compare-mode, fullscreen, zoom); electron-wrapper.cjs + rdp-preload.cjs work around Electron 30+ --remote-debugging-port CLI rejection; ESLint expanded to 9 blocks (5a: e2e CJS helpers, 5b: e2e JS tests + playwright.config.js); unit test block (4) now explicitly ignores tests/e2e/**; lint-staged updated to include *.cjs
- Unit test infrastructure code review (TASK-013): sorting-worker.js has conditional CJS export pattern but sits in ESLint block 3a alongside pure workers (ml-worker.js, feature-worker.js) — `module: 'readonly'` leaks to those files (open BACKLOG item); globalThis.self stub in sorting-worker.test.js lacks afterAll teardown (low-priority BACKLOG item); ESLint header comment discrepancy resolved by TASK-017
- Automated tests added (TASK-013): Vitest ^4.0.18 added; `npm test` = `vitest run`; pre-commit hook now runs lint-staged then full test suite; 4 test files cover sorting-worker (MinHeap/VPTree/Hamming), ml-model (OnlineLogisticRegression), feature-extractor (computeHistogram/sharpness/etc.), media-viewer utils (formatElapsed/formatTimeAgo/removeFileFromList); ESLint block 7 added for `tests/**/*.js`
- Pre-commit hooks (TASK-012): Husky v9 + lint-staged added; ESLint flat config (`eslint.config.mjs`) covers 9 file-group blocks; `_`-prefix convention for unused vars (varsIgnorePattern/argsIgnorePattern/caughtErrorsIgnorePattern); Prettier enforces consistent style on commit; `prepare` script uses "husky || true" to skip gracefully when .git is absent (Docker/CI/tarball)
- Extraction pause/resume on user activity: signalUserActivity() called from all navigation and rating actions; sets extractionPaused=true and shows "Paused" state immediately; 2-second idle timer calls resumeExtraction() which resolves awaitExtractionGate() promise in the extraction loop; _extractionLastCurrent/_extractionLastTotal cache last counts for paused redisplay
- Feature extraction ETA and elapsed time: recordExtractionCompletion() tracks rolling window (last 20) of per-file completion timestamps; computes live ETA when 5+ samples available (files/sec rate); formatElapsed()/formatEta() format seconds to "Xm Ys"/"~Xm Ys"; showBackgroundExtractionProgress() appends ETA suffix; completion notification shows "Feature extraction complete — N files in Xm Ys"
- Extraction run isolation: extractionRunId generation counter prevents stale async callbacks (from cancelled runs) from corrupting ETA window or firing wrong completion notification; load-failure catch skips recordExtractionCompletion() to avoid ETA skew; formatElapsed() guards against NaN/Infinity
- Configurable feature extraction worker count: featureWorkerCount settable 1-8 in Settings panel (F1), persisted to localStorage('featureWorkerCount'), constructor reads and clamps saved value, defaults to 4
- Cache age display in sort notification: formatTimeAgo(timestamp) utility added to MediaViewer; appends "— cached X hours ago" to cache-restore notifications; typeof guard for backwards compatibility with old caches (TASK-008)
- Force re-sort (Shift+click): handleSortBySimilarity(forceResort) accepts Shift+click flag; deleteSortCache() removes cached order; originalMediaFiles snapshot preserved across force re-sorts so "Restore Order" always returns to disk order (TASK-007)
- Unified fullscreen cleanup: Renamed exitFullscreen() to cleanupFullscreen(); routed all 5 exit paths (click, ESC, Z/X keys, toggleViewMode, showCompareMedia) through it as single source of truth (TASK-006)
- Fullscreen exit handler leak guard: AbortController-based listener cleanup via fullscreenAbortControllers Map; abortFullscreenController() helper called before all wrapper.remove() sites (TASK-005)
- Compare file existence validation: showCompareMedia() validates files via IPC before display, bounded retry up to 10 (TASK-004)
- Index wrap behavior fix: Restore wrap-to-start in moveCurrentFile() for continuous rating
- File removal refactor: Centralized cleanup method replacing duplicate logic
- Zoom controls refactor: Per-pane dynamic generation with reusable methods
- Visual media scale controls with logarithmic zoom mapping (TASK-002)
- Compare mode overlay controls with zoom integration
- ML feature extraction with 64-dimension vectors and quality metrics
- ML online learning with lazy initialization

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: best-practices -->
## Best Practices

When modifying this codebase:
- Test file operations carefully (move/copy can cause data loss)
- Changes to preload.js require security review
- Worker changes may impact performance significantly
- The renderer file is large - consider searching before adding duplicates
- Run `npm test` before committing (pre-commit hook enforces this); worker exports require the conditional CJS pattern so tests can import them

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Custom Notes

Add project-specific notes here. This section is never auto-modified.

<!-- END MANUAL -->
