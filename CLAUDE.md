# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- AUTO-MANAGED: project-description -->
## Overview

**Media Viewer** - Electron desktop application for browsing, rating, and managing media files (images and videos) with visual similarity sorting and ML-based prediction features.

Key capabilities:
- Browse media folders with image/video preview
- Rate files (like/dislike/special) with keyboard shortcuts
- Visual similarity sorting using perceptual hashing and CLIP semantic embeddings
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
├── media-viewer.js      # Renderer process, all UI logic (~7560 lines, MediaViewer class)
├── index.html           # Main HTML entry point
├── styles.css           # Application styling, design system
├── sorting-worker.js    # Web Worker: sorting algorithms (MST, similarity, CLIP cosine); exports MinHeap, VPTree, calculateHammingDistance, calculateCosineDistance, sortMediaBySimilarityClip, sortMediaBySimilarityMST
├── ml-worker.js         # Web Worker: ML prediction tasks
├── ml-model.js          # ML model definitions (OnlineLogisticRegression); v3: 576-dim input (64 hand-crafted + 512 CLIP)
├── feature-extractor.js # Image feature extraction (64-dim vectors)
├── feature-worker.js    # Web Worker: feature extraction
├── fullscreen.js        # FullscreenManager ES module (v2.0 modularization pattern)
├── face-detector.js     # Face detection (@vladmandic/face-api)
├── vitest.config.js     # Unit test config
├── playwright.config.js # E2E test config
├── tests/               # Unit tests (Vitest) + E2E tests (Playwright)
│   ├── *.test.js        # Unit: sorting-worker, ml-model, feature-extractor, media-viewer-utils, ml-pair-selection, logger, keyboard-shortcuts
│   └── e2e/             # E2E: app-launch, navigation, rating, compare-mode, fullscreen, zoom, keyboard-shortcuts, undo-empty-state, clip-graceful-degradation
│       ├── fixtures/    # Test media (1x1 PNGs, tiny.mp4)
│       └── helpers/     # electron-app.js, electron-wrapper.cjs/.cmd, rdp-preload.cjs
├── .claude/agents/      # Shared agent definitions tracked in git (per-developer settings/history gitignored via .claude/*)
│   └── regression-checker.md  # Project-specific regression audit agent (tracked since b6ef9d7)
└── docs/                # planning/, archive/, ARCHITECTURE.md, PROJECT_CONTEXT.md
```

**Data Flow**:
1. Main process handles file system operations (read, move, copy) and CLIP model inference (`loadClipModel`, `extractClipEmbedding`, `extractClipEmbeddingBatch`, `unloadClipModel` IPC handlers)
2. Preload exposes secure IPC bridge to renderer (including CLIP IPC + `onClipDownloadProgress` which returns a cleanup function)
3. Renderer (media-viewer.js) manages UI state and user interactions; calls CLIP via `window.electronAPI` (not a Worker)
4. CPU-intensive tasks delegated to Web Workers (sorting, ML, feature extraction); CLIP is main-process IPC (not a Worker — npm packages can't resolve in Electron Web Workers)

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
- MediaViewer method testing: `extractMethod(name)` reads source, extracts body with brace-counting, returns `new Function`; call via `.call(mockCtx, ...args)`; mock context for `removeFileFromList` must include `clipCache: new Map()` (method calls `this.clipCache.delete()`)
- `extractAsyncMethod(methodName)` helper: mirrors `extractMethod` but uses `Object.getPrototypeOf(async function(){}).constructor` (AsyncFunction) so `await` inside the method body is valid; regex matches `async methodName(params) {`; used in `tests/media-viewer-utils.test.js` for `insertNewFilesInSortedOrder` and `applyCachedSortOrder`
- Mock context for `insertNewFilesInSortedOrder` tests must include inline `calculateCosineDistance` and `calculateHammingDistance` implementations (method calls `this.calculateCosineDistance` / `this.calculateHammingDistance` by name)
- `applyCachedSortOrder` tests must patch `globalThis.window = { electronAPI: { path: { basename: async (p) => p.split('/').pop() } } }` in `beforeEach`/`afterEach` — method calls `window.electronAPI.path.basename`
- `kickoffBackgroundExtractionIfEnabled` tests (8 cases, all in `describe('kickoffBackgroundExtractionIfEnabled', …)`): uses `extractAsyncMethod()`; (1) CLIP-disabled no-op — `enableClipFeatures: false`, asserts none of `initializeFeaturePool`/`loadFeatureCache`/`initClipModel`/`startBackgroundFeatureExtraction` called; (2) fresh-state full-init — empty `featureWorkers: []`, asserts all four called once each; (3) workers-exist skip-pool — `featureWorkers: [{}]`, asserts `initializeFeaturePool` NOT called, `loadFeatureCache`/`initClipModel`/`startBackgroundFeatureExtraction` each called once; (4) CLIP-already-ready skip-initClipModel — `clipWorkerReady: true`, asserts `initClipModel` NOT called; (5) download-in-progress still-calls-initClipModel — `clipModelDownloading: true`, asserts `initClipModel` IS called (concurrent-safe IPC dedupes; old guard removed); (6) cache-reload ordering — asserts `loadFeatureCache` fires before `startBackgroundFeatureExtraction`; (7) cold-start CLIP ordering — `initClipModel` delayed 5ms, asserts it completes before `startBackgroundFeatureExtraction`; (8) cache-reject logging — `loadFeatureCache` rejects, asserts `logError` called, `startBackgroundFeatureExtraction` NOT called; `globalThis.window` patched in `beforeEach`/`afterEach` to `{ electronAPI: { logError: vi.fn() } }`; `makeCtx` defaults: `featureWorkers: [], clipWorkerReady: false, clipModelDownloading: false`
- Algorithm threading test pattern: use a spy-style `async insertNewFilesInSortedOrder(_sorted, _new, algorithm) { captured.algorithm = algorithm; }` stub on the mock context; assert explicit caller value wins over `cachedData.algorithm` (caller takes precedence), and that `undefined` from both sources routes to Hamming (safe default)
- Algorithm replication pattern: for async methods with heavy DOM dependencies, replicate pure algorithm logic as standalone test helper (see ml-pair-selection.test.js)
- Time-dependent tests: `vi.useFakeTimers()` + `vi.setSystemTime()`; restore in `afterEach`
- Browser global mocking: patch `globalThis.localStorage` in `beforeEach`/`afterEach` (save/restore `origLocalStorage`) for methods that call global `localStorage` directly (e.g., shortcut methods)
- Worker abort flag testing: module-private `abortFlag` in sorting-worker.js is not directly accessible from tests; set it via `globalThis.self.onmessage({ data: { type: 'abort' } })`; reset it via a `resetAbort()` helper that sends `{ type: 'startSort', data: { algorithm: 'noop' } }` — handler sets `abortFlag = false` unconditionally before the switch, then the unknown algorithm causes an error that the handler's outer try/catch swallows (posts `{type:'error',...}`), so `onmessage` returns normally with no local try/catch needed; the `abortFlag = false` line in sorting-worker.js carries `// abortFlag reset is also relied on by tests/sorting-worker.test.js resetAbort()` to flag this as a test contract; prefer exact string `.toThrow('message text')` over regex for worker error assertions to catch message drift early

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
- In-test fixture dirs: secondary `createTempFixtureDir()` calls inside a test body (not beforeEach) must use `try/finally` for cleanup — `afterEach` only cleans up `tmpFixtures` from `beforeEach`; use `let secondFolder; try { ... } finally { await secondFolder?.cleanup(); }`
- Mode-switch UI assertions: when verifying folder-switch or rating resets compare mode, assert BOTH `.controls` visible (`display === 'flex'`) AND `.compare-controls` hidden (`display !== 'flex'`) — checking only one side can miss cases where both button sets appear simultaneously
- `afterEach` null guards: always guard `if (electronApp)` and `if (tmpFixtures)` before calling `closeApp()`/`cleanup()` — prevents `TypeError` when `beforeEach` throws mid-setup; also guard `page.evaluate()` calls with `if (page)` — `.catch(() => {})` only handles promise rejections, not synchronous `TypeError` from `undefined.evaluate()` when `page` is unassigned; pattern established in all E2E files; `app-launch.test.js` guards `tmpFixtures` but calls `closeApp(electronApp)` unconditionally (safe there since `beforeEach` always assigns `electronApp`)

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

**Error Handling**:
- User-facing errors via notification system (bottom-right corner)
- Renderer errors forwarded to main-process file logger via `window.electronAPI.logError` (fire-and-forget, never blocks renderer)
- `showError()`, `window.onerror`, and `unhandledrejection` handler all forward to logger

**Data Structures**: MinHeap (priority queue), VPTree (nearest neighbor), perceptual hashing (image similarity), cosine distance for CLIP embeddings (`1 - dot(a,b)` on unit-normalized 512-dim vectors) — `calculateCosineDistance(vec1, vec2)` exists in both `sorting-worker.js` (worker path) and `MediaViewer` class in `media-viewer.js` (renderer path, used by `insertNewFilesInSortedOrder` CLIP branch); renderer version returns `1` on null/mismatched input (NOT `Infinity` like `calculateHammingDistance` and the worker version) — cosine distance is bounded [0,2] so 1 = orthogonal/"no signal" is the natural fallback; dead-code path in practice since callers gate every call behind `clipCache` truthy checks; duplication mirrors `calculateHammingDistance` pattern; shared-utility extraction tracked in BACKLOG, zoomControlsMap keyed by target ('single', 'left', 'right')

**State Management**:
- Class-based state in MediaViewer; localStorage for user preferences
- Settings panel (F1) with number inputs/checkboxes wired to localStorage; constructor validates/clamps saved values; `enableClipFeatures` key (default true) toggles CLIP semantic embedding extraction, wired to `#clipFeaturesToggle` checkbox (~87 MB model download on first use); on disable: handler reverts `sortAlgorithm` to `'vptree'` + syncs dropdown SYNCHRONOUSLY first (instant UI update, no transient where dropdown shows CLIP while CLIP is disabled), THEN `await deleteSortCache('clip')` (async IPC) — order matters; prevents stale cache + broken-sort-click UX
- Empty state: `showEmptyStateWithUndo()` vs `showDropZone()` based on `moveHistory.length`
- Empty state keydown guard: when `mediaFiles.length === 0`, keydown handler blocks all input EXCEPT undo — undo passes through when `moveHistory.length > 0` (TASK-027 fix)
- Compare-pair undo: history entries tagged `compareMode: true`; `handleCancel()` detects paired entries and restores both files in one undo
- ML model reset on folder change: `resetMlModel()` nulls `mlModelState`/`mlStats`, resets `predictionScores` Map, posts `{ type: 'reset' }` to mlWorker, calls `updateSortPredictionButton()`; called on like/dislike folder select or clear so stale training doesn't persist across folder configs (f4772a9); also called when `enableClipFeatures` toggle changes to prevent 576-dim vs 64-dim mismatch corrupting predictions
- ML model reset on dim/version mismatch: `initComplete` handler checks `message.modelWasReset`; if set, clears `this.mlModelState = null` and `this.predictionScores = new Map()` to purge stale renderer-side cache after worker auto-resets; also calls `deleteMlModelCache()` to remove the stale `.ml_model.json` from disk, preventing reset-on-every-restart

**Index Management**:
- Wrap-to-start: `moveCurrentFile()` cycles to index 0 when rating last file
- Cap-to-end: `removeFileFromList()` caps to length-1 (safe fallback)
- Reset to 0: Folder loads, sort operations, mode switches

**Cache Management**:
- Centralized cleanup via `removeFileFromList()`: array splice + cache cleanup (predictionScores, featureCache, clipCache, featureMetadata, perceptualHashes) + currentIndex adjustment
- Feature cache v4: on-disk `{vector, size, mtime, clipVector?}` per entry; `FEATURE_CACHE_VERSION` 3→4 auto-invalidates v3 caches; in-memory `featureCache` stores `Float32Array(64)` only; `clipCache` stores `Float32Array(512)` separately
- `getCombinedFeatures(filePath)` merges `featureCache` (64-dim) + `clipCache` (512-dim) → 576-dim `Float32Array`; used by ML pipeline and `requestPredictionScores()`
- `featureMetadata` Map decoupled from `this.mediaFiles` — survives files being rated/moved during extraction
- Stale-entry pruning on load: absent files skipped, size/mtime mismatch triggers re-extraction
- ML model cache: `saveMlModel()` writes `{modelState, timestamp}` to `.ml_model.json` (no outer version wrapper — version/dim live inside `modelState`); `deleteMlModelCache()` clears it by writing empty string (called on version/dim mismatch reset); NOTE: name is misleading — it writes `''` not a real delete, because no `deleteFile` IPC exists in preload.js; rename to `clearMlModelCache()` tracked in BACKLOG
- Sort cache: `saveSortCache(algorithm, fileNames, startFileName)` writes `cache[algorithm] = { algorithm, sortedPaths, timestamp, startFile }` — the `algorithm` field inside the entry was absent before PR #33 fix (caused `cachedData.algorithm` to always be `undefined`); `applyCachedSortOrder(cachedData, algorithm)` resolves which distance metric to use via `algorithm ?? cachedData.algorithm` (explicit caller param takes precedence; cache-entry field is fallback; old caches with neither safely fall through to Hamming)

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
- CLIP extraction (TASK-028, d21e213 arch fix): `@huggingface/transformers` runs in **main process** (not a Worker — npm packages can't resolve in Electron Web Workers); IPC chain: `initClipModel()` → `window.electronAPI.loadClipModel()` → main `loadClipModel(event)` (lazy, concurrent-safe, emits `clip-download-progress`); progress callbacks guard `!event.sender.isDestroyed()` to prevent crash if renderer closes during download; images: `extractClipEmbedding(filePath)` → `extractClipEmbedding` IPC → `RawImage.read` + `CLIPVisionModelWithProjection`; videos: `extractClipFromVideo()` → `extractKeyframes` IPC (ffmpeg scene-detect) → `extractClipEmbeddingBatch` IPC (average+normalize); produces 512-dim unit-normalized `Float32Array`; graceful degradation — CLIP unavailable means 64-dim only, no crash; ML model dim: 64→576 (64 hand-crafted + 512 CLIP); `OnlineLogisticRegression` auto-resets on dim mismatch via `fromJSON` version/dim check (version now 3); E2E coverage: `clip-graceful-degradation.test.js`; `unloadClipModel` IPC (e7d84d0): nulls `clipProcessor`/`clipVisionModel`/`clipModelError`, returns `{success:false, reason:'loading'}` if load is in progress — prevents race where unload fires during init; `extractClipEmbedding` and `extractClipEmbeddingBatch` capture local processor/model refs immediately after `loadClipModel()` resolves and null-guard them (`{success:false, error:'CLIP unavailable'}`) before proceeding

**Compare Mode Validation**:
- `showCompareMedia()` validates files via IPC `checkFileExists` before rendering (parallel Promise.all)
- Bounded retry (max 10); graceful fallback to single mode via `switchToSingleModeUI()`

**Key Dependencies** (beyond Electron/Vitest/Playwright):
- `ffprobe-static`: bundled ffprobe binary for video metadata extraction (main process)
- `ffmpeg-static`: bundled ffmpeg binary for video keyframe extraction (main process, added TASK-028)
- `@huggingface/transformers`: CLIP model inference via ONNX Runtime Web (main process IPC, added TASK-028)
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

Completed tasks: TASK-012 through TASK-028 + CLIP/ML Pipeline Cleanup (2026-04-09: fixed IPC listener accumulation, skipped redundant image decodes, added `deleteMlModelCache()`, deleted `clip-worker.js`) + Compare Mode folder-switch fix + DRY refactor (2026-04-10: `switchToSingleModeUI()` inserted in `loadFolder()` and `toggleViewMode()` single-mode branch, removes 14-line duplicate block, E2E coverage added) + Group C Test Quality (2026-04-11: `afterEach` null guards added to all 7 E2E files; `media-viewer-utils.test.js` `buildKeyString` describe label renamed from misleading "keydown guard — undo in empty state") + Group D CLIP Similarity Sorting (2026-04-18: `calculateCosineDistance` + `sortMediaBySimilarityClip` in `sorting-worker.js`, CLIP branch in `handleSortBySimilarity`, `<option value="clip">` in `index.html`; 5 BACKLOG items spawned from PR #29; PR #30 code review 2026-04-20: 1 issue fixed in 24ef763, 3 items added to BACKLOG) + Group E Resource Management complete (2026-04-21: `unloadClipModel` IPC handler in `main.js` + preload exposure, e7d84d0; local-capture null guards in `extractClipEmbedding`/`extractClipEmbeddingBatch`; `logger.js` double-init guard; renderer-side `this.clipUnloadTimer` in `media-viewer.js`, d65bfdd — schedules 30s unload after extraction, clears on restart; plan archived at `docs/archive/plans/2026-04-20-group-e-resource-management.md`; PR #31 approved — 3 minor BACKLOG items added: CLIP_UNLOAD_DELAY_MS named constant, clipModelError reset on persistent failures, verbose timer comment) + Group F Build & DX complete (2026-04-29: Lucide CDN pinned to `@1.14.0` with SHA-384 SRI in `index.html`; `.claude/agents/regression-checker.md` updated for FullscreenManager — Section 2 rewrite, line-count fix `~6300+`→`~7400`, new Section 8 v2.0 Modular Subsystems; `.gitignore` gains `.claude/*` + `!.claude/agents/` exception so shared agents ship via PR; plan archived at `docs/archive/plans/2026-04-29-group-f-build-dx.md`; PR #32 merged — 5 BACKLOG items spawned: regression-checker full audit, migrate Lucide to bundled npm, deferred dispatch verification, .gitignore duplicate line, line-count drift) + PR #32 post-merge code review (2026-04-30: 3 direct findings fixed in commit `dcbbc26` before merge; 2 process-level BACKLOG items added: standardize E2E test result reporting in DONE.md entries, pre-archive checklist to prevent recurring archived-plan drift) + CLIP Sort Follow-ups complete (2026-05-03: `insertNewFilesInSortedOrder` algorithm-aware with cosine distance for CLIP cache hits; CLIP toggle-off handler now `async` with revert-before-await cleanup — reverts `sortAlgorithm` to `'vptree'` + updates dropdown synchronously, then `await deleteSortCache('clip')`; `sortMediaBySimilarityClip` + `sortMediaBySimilarityMST` exported from `sorting-worker.js`; 7 new unit tests: 4 characterization tests for `sortMediaBySimilarityClip` + 3 algorithm-aware tests for `insertNewFilesInSortedOrder`; new `extractAsyncMethod` helper in `media-viewer-utils.test.js`; 160→167 unit tests; plan archived at `docs/archive/plans/2026-05-02-clip-sort-followups.md`; 2 BACKLOG items spawned: CLIP extraction silent failure (HIGH, blocks all CLIP features) + UX extraction-starting notification; PR pending) + CLIP Kickoff Fix (2026-05-07: `kickoffBackgroundExtractionIfEnabled` now lazily inits feature pool when `featureWorkers.length === 0`, guards `initClipModel()` behind `!clipWorkerReady && !clipModelDownloading`, always calls `startBackgroundFeatureExtraction()` with `.catch()` forwarding to `logError`; fixes HIGH-priority silent-no-fire bug; 6 new unit tests (77e5594–bf1a6d2: CLIP-disabled no-op, fresh-state full-init, workers-exist skip, CLIP-ready skip, download-in-progress skip, rejection-logging); 171→177 unit tests) + PR #34 Kickoff Follow-ups (2026-05-08: `kickoffBackgroundExtractionIfEnabled` made fully `async`; now `await this.loadFeatureCache()` before extraction — `loadFolder()` clears caches so rehydration on every folder switch is required; `clipModelDownloading` guard removed — `loadClipModel` IPC is concurrent-safe and dedupes; body wrapped in single try/catch replacing .catch chain; 2 new ordering tests + 1 updated test (download-in-progress now asserts initClipModel IS called); 177→180 unit tests). See `docs/planning/DONE.md` for details, `docs/archive/plans/` for archived plans, and `git log` for commit history.

**Next planned**: Group A (CLIP extraction silent failure) complete. Group B spec written (`docs/superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md`), branch `fix/ai-prediction-display-bugs` exists; implementation pending. Group B — AI Prediction Display Bugs: (1) like-probability not displayed after undo — `removeFileFromList()` clears caches at rating time; fix via new `restoreFeatureCachesFromHistory(entry)` helper called in all 4 `handleCancel` branches + `mlFeatures` capture added to `moveSpecial` history entry; (2) prediction percentages misaligned after AI sort — `sortComplete` handler ignores `message.scores` from ml-worker; fix: populate `predictionScores` from `message.scores` before applying `mediaFiles = sorted`. Group C — PR #33 Defensive Follow-ups (clear `clipUnloadTimer` in toggle-off handler, try/catch around `deleteSortCache('clip')`, per-file abort check in `insertNewFilesInSortedOrder`). See `docs/planning/WEEKLY.md` for current schedule.

**Active gotchas learned from past work:**
- Lucide `createIcons()`: must use `{root: element}`, NOT `{nodes: [el]}` — `nodes` is silently ignored, causes full-document rescan and invalidates cached icon refs
- Lucide CDN pinned to `@1.14.0` with SHA-384 SRI in `index.html` (Group F); bump procedure: `curl -sL https://unpkg.com/lucide@<ver>/dist/umd/lucide.min.js | openssl dgst -sha384 -binary | openssl base64 -A`; wrong hash → browser refuses load, icons disappear silently — existing `if (typeof lucide !== 'undefined')` guard at `media-viewer.js:356` prevents crash; E2E tests stub unpkg.com and do not exercise the real CDN
- Compare mode exit: use `switchToSingleModeUI()` (non-toggling helper), NOT `toggleViewMode()` — the latter re-toggles isCompareMode causing infinite loops when <2 files remain
- Folder switch in Compare Mode: `loadFolder()` now calls `switchToSingleModeUI()` before `hideDropZone()` (~L2248) — new folders always open in Single Mode (compare context is folder-scoped); E2E test covers this in `compare-mode.test.js` ("resets to single mode when switching folders")
- Empty state: `showEmptyStateWithUndo()` (preserves undo toolbar) vs `showDropZone()` (genuine empty) — check `moveHistory.length` to decide; keydown guard at line ~1729 blocks all keys when `mediaFiles.length === 0` except undo — undo passes through when `moveHistory.length > 0` (implemented in TASK-027)
- `transition-delay` on CSS base rules: always verify fullscreen/hidden state overrides aren't inheriting the delay
- Feature cache: `loadFeatureCache()` must be called unconditionally before `startBackgroundFeatureExtraction()` — `loadFolder()` clears all in-memory caches, so `kickoffBackgroundExtractionIfEnabled()` explicitly `await`s `loadFeatureCache()` first; skipping this causes every file to be re-extracted on every folder switch even when a valid `.feature_cache.json` exists on disk
- v2.0 modularization pattern: stateful manager class + constructor-injected callbacks (see FullscreenManager); planned: ZoomManager, CompareManager, SortingManager, MLManager
- Shortcut localStorage: `loadShortcuts()`, `saveShortcut()`, `resetShortcuts()` use global `localStorage` directly — NOT `this.localStorage`; unit tests mock via `globalThis.localStorage` (not ctx property injection)
- `@huggingface/transformers` in Electron Web Workers: bare specifier resolves to Node.js bundle — npm packages cannot resolve in Electron's worker context at all; solution is to run inference in the main process via IPC (d21e213), where dynamic `import('@huggingface/transformers')` works normally
- IPC progress callbacks with long-running async ops: always guard `event.sender.isDestroyed()` before calling `event.sender.send()` — renderer window may close while main process is still loading a model (e.g., CLIP download)
- IPC listener accumulation via `ipcRenderer.on()`: each call registers a new persistent listener — use `.once()` for single-fire events, or return a cleanup function (`() => ipcRenderer.removeListener(channel, handler)`) for multi-fire progress events and call it after the async op completes (success or failure)
- `deleteMlModelCache()` is misleadingly named — writes empty string to `.ml_model.json`, does not delete the file (no `deleteFile` IPC exists in preload.js/main.js); tracked in BACKLOG as rename to `clearMlModelCache()` + add proper `deleteFile` IPC
- `enqueueFeatureExtraction` imageData null invariant: when file has hand-crafted features but needs CLIP-only extraction, `imageData` is `null`; safe today because `featureCache.has()` early-return fires first, but fragile under concurrent cache eviction — missing defensive null guard tracked in BACKLOG
- CLIP sorting worker data shape: `clipVectors` is `{path: number[]}` (plain arrays, not Float32Array); `Array.from(vec)` conversion is for pattern consistency with the hash path (`hashes: {path: string}`) — Float32Array itself serializes fine over `postMessage` via structured clone; renderer calls `Array.from(vec)` when reading from `clipCache` before sending to worker
- CLIP sorting edge cases in `handleSortBySimilarity()` (no-cache branch only): (1) CLIP disabled — checks `this.enableClipFeatures` and throws `'CLIP features are disabled. Enable in Settings (F1) to use semantic sorting.'`; do NOT fall through to hash path; (2) insufficient vectors — after collecting `clipVectors` from `clipCache` via `Array.from(vec)`, throws if `vectorCount < 2` with `'Only N files have CLIP embeddings. Wait for background extraction to complete, then retry.'`; files without vectors are appended at end of sorted result (info notification shows count); (3) pre-worker abort check — `sortAbortController.signal.aborted` is tested immediately before `runSortingWorker` dispatch (between `updateProgressNotification` and the worker call), mirroring the per-file abort guard in the hash path; cancellations issued while the CLIP info notification is displayed are caught here
- CLIP sort cache key is the string `'clip'` → adds entry under key `'clip'` in the unified `.sort_cache.json` (NOT a separate `.sort_cache_clip.json` file); existing `saveSortCache/loadSortCache/deleteSortCache` infrastructure handles it with no new code
- CLIP model unload timer (`this.clipUnloadTimer`): `startBackgroundFeatureExtraction()` clears any pending timer at its start (folder switches cancel unload), then schedules `setTimeout(unloadClipModel, 30000)` at end (only when `enableClipFeatures`); renderer fires `window.electronAPI.unloadClipModel()` IPC; main process nulls `clipProcessor`/`clipVisionModel`/`clipModelError`; on-demand CLIP calls after unload transparently re-load from transformers.js disk cache (~1–2s)
- CLIP IPC local-capture pattern (mid-await race safety): `extractClipEmbedding` and `extractClipEmbeddingBatch` handlers capture `const processor = clipProcessor; const model = clipVisionModel` into local variables immediately after `loadClipModel()` resolves, before any subsequent `await`; add explicit null guard — if either captured ref is null, return `{ success: false, error: 'CLIP unavailable' }` immediately; use local refs for all subsequent awaits — guarantees in-flight extraction completes with stable refs even if `unloadClipModel` fires mid-await nulling the module-level variables
- `.claude/` gitignore pattern: `.claude/*` is ignored (per-developer settings, history, secrets); `!.claude/agents/` negation un-ignores the shared agents directory — add new shared agent files under `.claude/agents/` so they ship via PR; never commit other `.claude/` contents (settings.json, history, etc.)
- `logger.js` double-init guard: `init(logDir)` checks `if (logFd !== null)` and calls `fs.closeSync(logFd)` (wrapped in try/catch for already-invalid fd) before opening a new fd; `logFd = null` is set before reopening regardless of close outcome; unit test in `tests/logger.test.js` asserts `closeSync` is called once on second `init()` via `vi.spyOn(fs, 'closeSync')`; test is synchronous — `vi` is imported at the top of the file alongside other vitest helpers (not via `await import('vitest')` inside the test body)
- DONE.md test-result reporting convention: all group entries should include both unit AND E2E pass counts (e.g., `"160/160 unit tests pass, 39/39 E2E tests pass"`); if no JS changed, write `"E2E: skipped (no JS changes)"` — omitting the E2E line entirely creates inconsistency across the log (PR #32 BACKLOG)
- Pre-archive checklist (recurring drift pattern PRs #19, #20, #27, #29, #32): before archiving a plan, flip all `- [ ]` → `- [x]`, add `**Status: Complete**` header, and add the new file to `docs/README.md`; lowest-effort fix is a checklist block at top of plan template in `TEMPLATES/`
- `insertNewFilesInSortedOrder` is algorithm-aware: takes a third `algorithm` param; `'clip'` branch scores by cosine distance over `clipCache`, all other values (`'vptree'`, `'mst'`, `'simple'`, undefined) use Hamming; no on-demand CLIP extraction — missing-vector files are end-appended; omitting the `algorithm` arg silently falls through to Hamming regardless of cache type — this was the 0eaf7ca bug; root cause was `saveSortCache` not writing the `algorithm` field into the cache entry (PR #33 fix), so `cachedData.algorithm` was always `undefined`; now fixed: `saveSortCache` writes `algorithm` field AND `applyCachedSortOrder` accepts an explicit `algorithm` param (caller-supplied wins via `??`); call site in `handleSortBySimilarity` passes `this.sortAlgorithm` explicitly as belt-and-suspenders
- CLIP toggle-off cleanup (feature/clip-sort-followups): the `#clipFeaturesToggle` `change` handler is `async`; on disable it FIRST synchronously reverts `this.sortAlgorithm` to `'vptree'` and updates the dropdown (so UI reflects new state instantly), THEN `await this.deleteSortCache('clip')` (clears stale `'clip'` key from `.sort_cache.json`) — order matters: revert-before-await eliminates the ~5-15ms transient where dropdown showed CLIP while CLIP was disabled; prevents "CLIP disabled" error on next sort click; no inverse op on toggle-on (first sort rebuilds from live `clipCache`); revert target is always `'vptree'` (constructor default), not `'mst'` or `'simple'`
- `kickoffBackgroundExtractionIfEnabled()` (async, PR #34 fix): early return when `!this.enableClipFeatures`; skips `initializeFeaturePool()` when `featureWorkers.length > 0` (double-init causes duplicate workers); `await this.loadFeatureCache()` always runs before extraction — `loadFolder()` clears featureCache/clipCache/featureMetadata, so rehydration from disk is required on every folder switch or cached entries are silently re-extracted; `await this.initClipModel()` only when `!this.clipWorkerReady` — on cold start the IPC load is in-flight and all `extractClipEmbedding` calls return null until it resolves; `loadClipModel` IPC is concurrent-safe and dedupes calls, so `clipModelDownloading` guard was removed; whole body wrapped in try/catch, errors forwarded to `window.electronAPI.logError`; called from `loadFolder()`
- CLIP toggle-off handler missing `clearTimeout(this.clipUnloadTimer)` (BACKLOG, ~50/100): the `if (!clipToggle.checked)` block runs cleanup but does NOT cancel a pending 30s unload timer; race: extraction completes → timer set → user disables CLIP → stale timer remains → user re-enables CLIP + `initClipModel()` begins → stale timer fires `unloadClipModel` IPC mid-load; mitigated today by `main.js` returning `{success:false, reason:'loading'}` (e7d84d0); fix: add `clearTimeout(this.clipUnloadTimer); this.clipUnloadTimer = null;` at top of the toggle-off branch in `media-viewer.js`
- `insertNewFilesInSortedOrder` inner loop has no abort check (BACKLOG, pre-existing both paths): both hash and CLIP branches iterate O(N*M) Hamming/cosine computations with no `sortAbortController.signal.aborted` check inside the loop; cancel during cache-hit insertion is silently ignored; fine for typical 1–50 files, pathological for 100+ new files in a 1000-file cache; fix: add `if (this.sortAbortController?.signal.aborted) throw new Error('Sort aborted');` once per outer iteration in both branches; also consider `await new Promise(r => setTimeout(r, 0))` every N files for very large folders
- Integration test gap — unit-test-the-leaf misses call-graph bugs (BACKLOG): PR #33's primary fix slipped through existing unit tests because they called `insertNewFilesInSortedOrder` directly with an explicit `'clip'` arg, bypassing the broken `applyCachedSortOrder → cachedData.algorithm` plumbing; lesson: leaf-level unit tests don't catch wiring bugs; add one fixture-driven integration test per major code path that exercises the real call graph end-to-end (load fixture cache → real `applyCachedSortOrder` → assert algorithm flows through)
- `sortComplete` ml-worker message carries ignored `scores` field (Group B bug): `ml-worker.js` `getSortedOrder` returns `{type:'sortComplete', sortedFilenames, scores, stats}` — `scores` is a `{filename: score}` map; the renderer's `case 'sortComplete':` handler was reordering `mediaFiles` but never writing these scores into `predictionScores`, so badges showed stale values from prior `scoreComplete` events; fix: iterate `message.scores` via `filenameToFile` Map and call `this.predictionScores.set(file.path, score)` before applying `this.mediaFiles = sorted`
- `restoreFeatureCachesFromHistory(entry)` helper (Group B, near `removeFileFromList` ~L999): inverse of `removeFileFromList` cache cleanup; 576-dim `mlFeatures` → split `featureCache.set(path, slice(0,64))` + `clipCache.set(path, slice(64,576))`; 64-dim → `featureCache` only; other lengths / null `mlFeatures` → no-op; `featureMetadata` restored with `{size: entry.fileSize, mtime: 0}` — `mtime: 0` intentionally forces re-extraction on next folder reload (session-only validity); must be called in all 4 `handleCancel` branches after `moveFile` IPC success, before `showMedia()`
- `moveSpecial` history entry missing `mlFeatures` (Group B gap): unlike `moveCurrentFile`, the special-move branch (~L1345) did not capture `getCombinedFeatures()` into `historyEntry.mlFeatures`; add capture mirroring `moveCurrentFile` pattern, gated on `this.isMlEnabled && this.mlWorker`; without this, special-undo in AI-sorted mode leaves the restored file with no prediction badge
- `handleCancel` special branch has no `reverseMlModelUpdate` path (Group B): all other `handleCancel` branches call `reverseMlModelUpdate` which feeds `requestPredictionScores()` via the `reverseUpdateComplete` debounce path; the special-move branch does not — add explicit `if (this.isSortedByPrediction) this.requestPredictionScores();` after restoring caches in that branch

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
