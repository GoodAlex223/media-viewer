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
├── logger.js            # File logger (init/log/warn/error/cleanup/getLogPath); writes to app.getPath('logs')/media-viewer.log
├── preload.js           # Security bridge (contextBridge → window.electronAPI); exposes file ops, logError (fire-and-forget IPC)
├── media-viewer.js      # Renderer process, all UI logic (~6300+ lines, MediaViewer class)
├── index.html           # Main HTML entry point
├── styles.css           # Application styling, design system
├── sorting-worker.js    # Web Worker: sorting algorithms (MST, similarity)
├── ml-worker.js         # Web Worker: ML prediction tasks
├── ml-model.js          # ML model definitions (OnlineLogisticRegression)
├── feature-extractor.js # Image feature extraction (64-dim vectors)
├── feature-worker.js    # Web Worker: feature extraction
├── fullscreen.js        # FullscreenManager ES module (v2.0 modularization pattern)
├── face-detector.js     # Face detection (@vladmandic/face-api)
├── vitest.config.js     # Unit test config
├── playwright.config.js # E2E test config
├── tests/               # Unit tests (Vitest) + E2E tests (Playwright)
│   ├── *.test.js        # Unit: sorting-worker, ml-model, feature-extractor, media-viewer-utils, ml-pair-selection, logger
│   └── e2e/             # E2E: app-launch, navigation, rating, compare-mode, fullscreen, zoom
│       ├── fixtures/    # Test media (1x1 PNGs, tiny.mp4)
│       └── helpers/     # electron-app.js, electron-wrapper.cjs/.cmd, rdp-preload.cjs
└── docs/                # planning/, archive/, ARCHITECTURE.md, PROJECT_CONTEXT.md
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
- Renderer entry: Core UI logic in `media-viewer.js` (MediaViewer class); v2.0 modularization extracts subsystems into dedicated modules (e.g., `fullscreen.js` → FullscreenManager)
- IPC Communication: Main process handles file ops, renderer handles UI
- Event-driven: DOM events trigger state changes and UI updates
- Web Workers: CPU-intensive operations (sorting, ML) in separate threads
- Centralized cleanup: Reusable methods for common operations (file removal, cache cleanup)
- v2.0 Modularization pattern: Stateful manager class + constructor-injected callbacks; extracted modules (e.g., FullscreenManager in fullscreen.js) receive host dependencies as constructor options (isZoomed, pauseOtherVideos); MediaViewer delegates via `this.fullscreen.toggle()`, `this.fullscreen.cleanup()`

**Imports**:
- CommonJS `require()` in main process and workers
- Browser globals in renderer (no module bundler)
- ES module `import` in media-viewer.js for extracted modules (e.g., `import { FullscreenManager } from './fullscreen.js'`)

**Unused variables**:
- Prefix with `_` (e.g., `_unused`, `_err`) to satisfy ESLint `no-unused-vars` rule (`varsIgnorePattern: '^_'`, `argsIgnorePattern: '^_'`, `caughtErrorsIgnorePattern: '^_'`)

**Formatting & Linting**:
- Prettier: tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, bracketSpacing=true, arrowParens=always, endOfLine="lf"
- `.gitattributes`: `* text=auto eol=lf` — enforces LF line endings for all files across platforms
- ESLint flat config (`eslint.config.mjs`): Ten file-group blocks (1: Node/main, 1b: preload, 2a: renderer module, 2b: renderer script, 2c: fullscreen.js, 3a: workers, 3b: shared libs, 4: unit tests, 5a: e2e CJS helpers, 5b: e2e JS tests); shared rules: eqeqeq, curly, prefer-const, no-var, no-shadow (warn), no-unused-vars (warn, `_`-prefix escape); `eslint-config-prettier` applied last
- Prettier ignores `docs/`, `*.md`, `package-lock.json`

**Testing (Unit — Vitest)**:
- Config: `vitest.config.js`; test files: `tests/**/*.test.js` excluding `tests/e2e/**`
- CJS modules in ESM tests: `createRequire(import.meta.url)` then `require('../module')`
- Web Worker modules: stub `globalThis.self = { onmessage: null, postMessage: () => {} }` before `require()`
- MediaViewer method testing: `extractMethod(name)` reads source, extracts body with brace-counting, returns `new Function`; call via `.call(mockCtx, ...args)`
- Algorithm replication pattern: for async methods with heavy DOM dependencies, replicate pure algorithm logic as standalone test helper (see ml-pair-selection.test.js)
- Time-dependent tests: `vi.useFakeTimers()` + `vi.setSystemTime()`; restore in `afterEach`

**Testing (E2E — Playwright)**:
- Config: `playwright.config.js`; workers: 1, fullyParallel: false (Electron can't parallelize)
- Electron 30+ workaround: `electron-wrapper.cjs` strips `--remote-debugging-port=0` (Playwright injects it; Electron rejects as CLI arg), re-applies via `app.commandLine.appendSwitch` in `rdp-preload.cjs` (see playwright#39008)
- ELECTRON_RUN_AS_NODE: must be unset before spawning Electron; handled in `electron-wrapper.cjs`
- Overlay interception: `.media-container` overlay blocks pointer events — use `{ force: true }` or `page.evaluate()`
- `seedLocalStorage(page, kvMap)`: syncs localStorage AND live MediaViewer properties; call after `launchApp()` before `loadFolder()`
- `mockFolderDialog(electronApp, path)`: replaces `ipcMain` handler for preset path
- `closeApp()`: races `electronApp.close()` against 5s timeout then SIGKILL; Windows uses `taskkill /F /T /PID` (kills process tree)
- Lucide CDN stub: `page.route('**/unpkg.com/**')` returns empty module
- Fixtures: 1x1 PNGs (red/green/blue) + tiny.mp4; `createTempFixtureDir()` copies to temp dir
- `rdp-preload.cjs` loads playwright-core internal `loader.js` by path — update if it breaks after upgrade

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

**Error Handling**:
- User-facing errors via notification system (bottom-right corner)
- Renderer errors forwarded to main-process file logger via `window.electronAPI.logError` (fire-and-forget, never blocks renderer)
- `showError()`, `window.onerror`, and `unhandledrejection` handler all forward to logger

**Data Structures**: MinHeap (priority queue), VPTree (nearest neighbor), perceptual hashing (image similarity), zoomControlsMap keyed by target ('single', 'left', 'right')

**State Management**:
- Class-based state in MediaViewer; localStorage for user preferences
- Settings panel (F1) with number inputs/checkboxes wired to localStorage; constructor validates/clamps saved values
- Empty state: `showEmptyStateWithUndo()` vs `showDropZone()` based on `moveHistory.length`
- Compare-pair undo: history entries tagged `compareMode: true`; `handleCancel()` detects paired entries and restores both files in one undo

**Index Management**:
- Wrap-to-start: `moveCurrentFile()` cycles to index 0 when rating last file
- Cap-to-end: `removeFileFromList()` caps to length-1 (safe fallback)
- Reset to 0: Folder loads, sort operations, mode switches

**Cache Management**:
- Centralized cleanup via `removeFileFromList()`: array splice + cache cleanup (predictionScores, featureCache, featureMetadata, perceptualHashes) + currentIndex adjustment
- Feature cache v3: on-disk `{vector, size, mtime}` per entry; `FEATURE_CACHE_VERSION` 2→3 auto-invalidates; in-memory `featureCache` stores `Float32Array` only
- `featureMetadata` Map decoupled from `this.mediaFiles` — survives files being rated/moved during extraction
- Stale-entry pruning on load: absent files skipped, size/mtime mismatch triggers re-extraction

**UI Components**:
- Zoom: `createZoomPopover(target, wrapper, toggleBtn)` / `removeZoomPopover(target)` — single mode static, compare mode dynamic
- Overlay controls (compare mode only): `position: absolute` (wrapper-relative), `bottom: 56px`, centered; 500ms transition-delay on hide, 0s on hover; fullscreen override sets `transition-delay: 0s`

**Event Listener Lifecycle**:
- AbortController pattern for scoped cleanup: FullscreenManager, sortAbortController, backgroundExtractionAbort
- `{ signal }` option on addEventListener prevents listener accumulation — abort() removes without stored reference

**Async Patterns**:
- Extraction pause/resume: `signalUserActivity()` on all nav/rating actions → 2s idle timer → `resumeExtraction()` resolves `awaitExtractionGate()` promise
- Generation counter (`extractionRunId`): async callbacks check for stale run ID and return early
- ML compare refresh: `pendingCompareRefresh`/`pendingCompareUpdates` defer `showMedia()` until re-scoring completes; 3s fallback timeout; `mediaNavigationInProgress` guard prevents double-fire

**Compare Mode Validation**:
- `showCompareMedia()` validates files via IPC `checkFileExists` before rendering (parallel Promise.all)
- Bounded retry (max 10); graceful fallback to single mode via `switchToSingleModeUI()`

**Security**: Context isolation enabled, sandbox disabled (required for file ops), IPC bridge via preload.js

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

Completed tasks: TASK-012 through TASK-025. See `docs/planning/DONE.md` for details, `docs/archive/plans/` for archived plans, and `git log` for commit history.

**Active gotchas learned from past work:**
- Lucide `createIcons()`: must use `{root: element}`, NOT `{nodes: [el]}` — `nodes` is silently ignored, causes full-document rescan and invalidates cached icon refs
- Compare mode exit: use `switchToSingleModeUI()` (non-toggling helper), NOT `toggleViewMode()` — the latter re-toggles isCompareMode causing infinite loops when <2 files remain
- Empty state: `showEmptyStateWithUndo()` (preserves undo toolbar) vs `showDropZone()` (genuine empty) — check `moveHistory.length` to decide
- `transition-delay` on CSS base rules: always verify fullscreen/hidden state overrides aren't inheriting the delay
- Feature cache: `loadFeatureCache()` must be called unconditionally before `startBackgroundFeatureExtraction()` — lazy-init guard previously caused cache to not reload on folder switch
- v2.0 modularization pattern: stateful manager class + constructor-injected callbacks (see FullscreenManager); planned: ZoomManager, CompareManager, SortingManager, MLManager

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
