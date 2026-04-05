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
├── clip-worker.js       # Web Worker: CLIP semantic embedding extraction (planned — TASK-028)
├── fullscreen.js        # FullscreenManager ES module (v2.0 modularization pattern)
├── face-detector.js     # Face detection (@vladmandic/face-api)
├── vitest.config.js     # Unit test config
├── playwright.config.js # E2E test config
├── tests/               # Unit tests (Vitest) + E2E tests (Playwright)
│   ├── *.test.js        # Unit: sorting-worker, ml-model, feature-extractor, media-viewer-utils, ml-pair-selection, logger, keyboard-shortcuts, clip-worker (planned)
│   └── e2e/             # E2E: app-launch, navigation, rating, compare-mode, fullscreen, zoom, keyboard-shortcuts, undo-empty-state, clip-graceful-degradation (planned)
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
- Module worker: `new Worker('clip-worker.js', { type: 'module' })` — required for workers that use dynamic `import()` of ESM packages (e.g., `@huggingface/transformers`); supported in Electron 30+ (Chromium 124+)

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
- Browser global mocking: patch `globalThis.localStorage` in `beforeEach`/`afterEach` (save/restore `origLocalStorage`) for methods that call global `localStorage` directly (e.g., shortcut methods)

**Testing (E2E — Playwright)**:
- Config: `playwright.config.js`; workers: 1, fullyParallel: false (Electron can't parallelize)
- Electron 30+ workaround: `electron-wrapper.cjs` strips `--remote-debugging-port=0` (Playwright injects it; Electron rejects as CLI arg), re-applies via `app.commandLine.appendSwitch` in `rdp-preload.cjs` (see playwright#39008)
- ELECTRON_RUN_AS_NODE: must be unset before spawning Electron; handled in `electron-wrapper.cjs`
- Overlay interception: `.media-container` overlay blocks pointer events — use `{ force: true }` or `page.evaluate()`
- `seedLocalStorage(page, kvMap)`: syncs localStorage AND live MediaViewer properties; call after `launchApp()` before `loadFolder()`
- `mockFolderDialog(electronApp, path)`: replaces `ipcMain` handler for preset path
- `closeApp()`: races `electronApp.close()` against 5s timeout then SIGKILL; Windows uses `taskkill /F /T /PID` (kills process tree)
- Lucide CDN stub: `page.route('**/unpkg.com/**')` returns empty module
- Fixtures: 1x1 PNGs (red/green/blue) + tiny.mp4; `createTempFixtureDir(fixtureNames?)` copies named fixtures to temp dir (default: all 3 PNGs); pass array to select subset (e.g., `['red-1x1.png']` for single-file tests)
- `rdp-preload.cjs` loads playwright-core internal `loader.js` by path — update if it breaks after upgrade
- Shortcut remap E2E pattern: `page.evaluate()` to call `saveShortcut()`/`renderShortcutRows()`/`attachShortcutKeyListeners()` directly on `window.mediaViewer`; or click `.shortcut-key[data-action][data-mode]` to enter listening state then `page.keyboard.press(key)`

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
- Empty state keydown guard: when `mediaFiles.length === 0`, keydown handler blocks all input EXCEPT undo — undo passes through when `moveHistory.length > 0` (TASK-027 fix)
- Compare-pair undo: history entries tagged `compareMode: true`; `handleCancel()` detects paired entries and restores both files in one undo

**Index Management**:
- Wrap-to-start: `moveCurrentFile()` cycles to index 0 when rating last file
- Cap-to-end: `removeFileFromList()` caps to length-1 (safe fallback)
- Reset to 0: Folder loads, sort operations, mode switches

**Cache Management**:
- Centralized cleanup via `removeFileFromList()`: array splice + cache cleanup (predictionScores, featureCache, featureMetadata, perceptualHashes) + currentIndex adjustment
- Feature cache v3: on-disk `{vector, size, mtime}` per entry; `FEATURE_CACHE_VERSION` 2→3 auto-invalidates; in-memory `featureCache` stores `Float32Array` only
- Feature cache v4 (TASK-028, planned): adds `clipVector: Float32Array(512) | null`; bump `FEATURE_CACHE_VERSION` 3→4 auto-invalidates v3 caches; files without CLIP yet store `null`, ML model uses zero-padded 512-dim for those
- `featureMetadata` Map decoupled from `this.mediaFiles` — survives files being rated/moved during extraction
- Stale-entry pruning on load: absent files skipped, size/mtime mismatch triggers re-extraction

**UI Components**:
- Zoom: `createZoomPopover(target, wrapper, toggleBtn)` / `removeZoomPopover(target)` — single mode static, compare mode dynamic
- Overlay controls (compare mode only): `position: absolute` (wrapper-relative), `bottom: 56px`, centered; 500ms transition-delay on hide, 0s on hover; fullscreen override sets `transition-delay: 0s`
- Empty-state undo prompt: `div.empty-state-undo` dynamically created in `showEmptyStateWithUndo()` — centered in media container (flexbox); children: `div.empty-state-undo-text` ("No media files remaining") + `button.empty-state-undo-btn` ("Undo last move", calls `handleCancel()`); removed at start of `showMedia()` before rendering new content

**Event Listener Lifecycle**:
- AbortController pattern for scoped cleanup: FullscreenManager, sortAbortController, backgroundExtractionAbort
- `{ signal }` option on addEventListener prevents listener accumulation — abort() removes without stored reference

**Async Patterns**:
- Extraction pause/resume: `signalUserActivity()` on all nav/rating actions → 2s idle timer → `resumeExtraction()` resolves `awaitExtractionGate()` promise
- Generation counter (`extractionRunId`): async callbacks check for stale run ID and return early
- ML compare refresh: `pendingCompareRefresh`/`pendingCompareUpdates` defer `showMedia()` until re-scoring completes; 3s fallback timeout; `mediaNavigationInProgress` guard prevents double-fire
- CLIP extraction (TASK-028, planned): runs as second parallel worker call per file in background loop; `awaitExtractionGate()` and `extractionRunId` apply unchanged; graceful degradation — CLIP unavailable means 64-dim only, no crash; ML model dim: 64→576 (64 hand-crafted + 512 CLIP); `OnlineLogisticRegression` auto-resets on dim mismatch via `fromJSON` version/dim check

**Compare Mode Validation**:
- `showCompareMedia()` validates files via IPC `checkFileExists` before rendering (parallel Promise.all)
- Bounded retry (max 10); graceful fallback to single mode via `switchToSingleModeUI()`

**Key Dependencies** (beyond Electron/Vitest/Playwright):
- `ffprobe-static`: bundled ffprobe binary for video metadata extraction (main process)
- `ffmpeg-static`: bundled ffmpeg binary for video keyframe extraction (main process, added TASK-028)
- `@huggingface/transformers`: CLIP model inference via ONNX Runtime Web (clip-worker.js, added TASK-028)
- `@vladmandic/face-api`: face detection in renderer

**Security**: Context isolation enabled, sandbox disabled (required for file ops), IPC bridge via preload.js

**Keyboard Shortcuts**:
- `DEFAULT_SHORTCUTS` top-level constant defines default key bindings for `single` and `compare` modes (QWER+AD layout)
- `loadShortcuts()` merges sparse `customShortcuts` object from global `localStorage` over defaults via `Object.assign`
- `buildKeyString(e)` normalizes a KeyboardEvent → `"Ctrl+Shift+KeyA"` string for consistent key identity
- `buildReverseMap()` inverts `this.shortcuts[mode]` → `{ keyString: actionName }` for O(1) dispatch in keydown handlers
- `executeAction(action)` dispatches action name strings to handler methods via a local map with optional chaining (`?.()`)
- `checkShortcutConflict(mode, currentAction, newKey)` returns conflicting action name or null; checks only within same mode
- `saveShortcut(mode, action, newKey)` updates `this.shortcuts[mode][action]`, rebuilds reverse map, persists full shortcuts to `customShortcuts` in global `localStorage`
- `resetShortcuts()` restores inline defaults, rebuilds reverse map, removes `customShortcuts` from global `localStorage`; avoids referencing top-level `DEFAULT_SHORTCUTS` so `extractMethod` tests work in Node.js
- `renderShortcutRows()` re-renders shortcut key labels in the help overlay after save/reset
- `attachShortcutKeyListeners()` re-attaches click-to-remap listeners on `.shortcut-key` elements after re-render
- Constructor initializes `this.shortcuts = this.loadShortcuts()` and `this.shortcutReverseMap = this.buildReverseMap()` alongside other localStorage settings
- Keydown handler: fixed utilities (Escape, F1, Space/I in single mode, Z/X in compare mode) handled before the reverse map lookup; all customizable actions dispatched via `this.shortcutReverseMap[mode][keyStr]` → `executeAction(action)`
- UI elements: `.shortcut-key[data-action][data-mode]` (clickable key labels in help overlay), `.listening` class (active key-capture state), `.shortcut-conflict-warning` (shows conflicting action name inline), `#resetShortcutsBtn` (reset button)
- Remap flow: click `.shortcut-key` → element gets `.listening` → press new key → `checkShortcutConflict` → if conflict show `.shortcut-conflict-warning` and stay in listening state; if clear call `saveShortcut()` → rebuild reverse map

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

Completed tasks: TASK-012 through TASK-027 (TASK-027: fix undo shortcut in empty folder state — keydown guard exception + `showEmptyStateWithUndo()` UI + E2E coverage). See `docs/planning/DONE.md` for details, `docs/archive/plans/` for archived plans, and `git log` for commit history.

**In progress:**
- TASK-028: Add CLIP semantic features to ML prediction pipeline (spec: `docs/superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md`; implementation plan: `docs/superpowers/plans/2026-04-05-clip-semantic-features.md`)

**Next planned:**
- (none)

**Active gotchas learned from past work:**
- Lucide `createIcons()`: must use `{root: element}`, NOT `{nodes: [el]}` — `nodes` is silently ignored, causes full-document rescan and invalidates cached icon refs
- Compare mode exit: use `switchToSingleModeUI()` (non-toggling helper), NOT `toggleViewMode()` — the latter re-toggles isCompareMode causing infinite loops when <2 files remain
- Empty state: `showEmptyStateWithUndo()` (preserves undo toolbar) vs `showDropZone()` (genuine empty) — check `moveHistory.length` to decide; keydown guard at line ~1729 blocks all keys when `mediaFiles.length === 0` except undo — undo passes through when `moveHistory.length > 0` (implemented in TASK-027)
- `transition-delay` on CSS base rules: always verify fullscreen/hidden state overrides aren't inheriting the delay
- Feature cache: `loadFeatureCache()` must be called unconditionally before `startBackgroundFeatureExtraction()` — lazy-init guard previously caused cache to not reload on folder switch
- v2.0 modularization pattern: stateful manager class + constructor-injected callbacks (see FullscreenManager); planned: ZoomManager, CompareManager, SortingManager, MLManager
- Shortcut localStorage: `loadShortcuts()`, `saveShortcut()`, `resetShortcuts()` use global `localStorage` directly — NOT `this.localStorage`; unit tests mock via `globalThis.localStorage` (not ctx property injection)

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
