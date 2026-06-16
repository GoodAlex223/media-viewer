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
npm install            # Install dependencies
npm start              # Run the application (also: npx electron .)
npm test               # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright + Electron)
npm run lint           # Lint all JS (lint:fix to auto-fix)
npm run format         # Prettier (format:check to verify only)
```

Pre-commit hook (Husky + lint-staged + vitest): ESLint --fix + Prettier on staged `*.{js,cjs}`, Prettier on staged `*.{json,css,html}`, then `npx vitest run` (unit tests must pass). E2E is NOT run by the hook.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

```
media_viewer/
├── main.js              # Electron main process: IPC handlers, file ops, JXL/CLIP/tournament/bulk-rated/feature-cache IPC
├── logger.js            # File logger (init/log/warn/error/cleanup/getLogPath) → app.getPath('logs')/media-viewer.log
├── preload.js           # Security bridge (contextBridge → window.electronAPI): file ops, CLIP IPC, tournament IPC, bulk-rated IPC, logError
├── media-viewer.js      # Renderer: all UI logic (~8400 lines, MediaViewer class); imports FullscreenManager + TournamentManager
├── index.html           # Main HTML entry point
├── styles.css           # Application styling, design system
├── sorting-worker.js    # Web Worker: sorting (MST, similarity, CLIP cosine); exports MinHeap, VPTree, calculateHammingDistance, calculateCosineDistance, sortMediaBySimilarityClip/Mst
├── ml-worker.js         # Web Worker: ML prediction tasks
├── ml-model.js          # ML model (OnlineLogisticRegression); v3: 576-dim input (64 hand-crafted + 512 CLIP)
├── feature-extractor.js # Image feature extraction (64-dim vectors)
├── feature-worker.js    # Web Worker: feature extraction
├── fullscreen.js        # FullscreenManager ES module (v2.0 modularization pattern)
├── tournament-engine.js # TournamentEngine + SwissStrategy (pure ESM; imported by tournament.js and Vitest tests directly)
├── tournament.js        # TournamentManager ES module (v2.0 pattern); IPC glue for tournament state persistence + apply
├── media-formats.js     # Shared CJS: isMediaFile(ext), getMimeType(ext); .jxl → image/jxl (ESLint block 3b)
├── jxl-decode-worker.js # Module Web Worker (type:'module'): decodes JXL via jxl-oxide-wasm; streaming meta/frame/done protocol over transferable ArrayBuffers
├── face-detector.js     # Face detection (@vladmandic/face-api)
├── vitest.config.js     # Unit test config
├── playwright.config.js # E2E test config
├── tests/               # Unit (Vitest, tests/*.test.js) + E2E (Playwright, tests/e2e/)
│   └── e2e/             # fixtures/ (1x1 PNGs, tiny.mp4, static.jxl) + helpers/ (electron-app.js, electron-wrapper.cjs/.cmd, rdp-preload.cjs)
├── .claude/agents/      # Shared agent definitions tracked in git (other .claude/* gitignored)
└── docs/                # planning/, archive/, ARCHITECTURE.md, PROJECT_CONTEXT.md
```

**Data Flow**:
1. Main process: file system ops, JXL decode support (`read-file-buffer`, `read-jxl-wasm`), CLIP model inference (main-process IPC, not a Worker), tournament state (`.tournament_state.json`), bulk-rated cache (`.bulk_rated.json`), feature-cache streaming (stream-json parse + batched atomic writes)
2. Preload exposes a secure IPC bridge to the renderer (`onClipDownloadProgress` returns a cleanup function)
3. Renderer (media-viewer.js) manages UI state; calls CLIP via `window.electronAPI`; TournamentManager delegates IPC
4. CPU-intensive work → Web Workers (sorting, ML, feature extraction); CLIP is main-process IPC (npm packages can't resolve in Electron Web Workers)

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

**Naming**: Functions camelCase verb-first (`loadMedia`); Classes PascalCase (`MediaViewer`); Constants UPPER_SNAKE_CASE; DOM IDs kebab-case; CSS classes kebab-case.

**Patterns**:
- Core UI logic in `media-viewer.js` (MediaViewer class). v2.0 modularization extracts subsystems into dedicated modules (FullscreenManager, TournamentManager): stateful manager class + constructor-injected host callbacks; MediaViewer delegates via `this.fullscreen.toggle()` etc. Planned next: ZoomManager, CompareManager, SortingManager, MLManager.
- IPC: main process does file ops, renderer does UI. Event-driven. CPU-heavy work in Web Workers. Centralized cleanup methods (file removal, cache cleanup).

**Imports**: CommonJS `require()` in main process and workers; browser globals in renderer (no bundler); ES module `import` in media-viewer.js for extracted modules (`fullscreen.js`, `tournament.js`).

**Unused variables**: prefix with `_` to satisfy ESLint `no-unused-vars` (`varsIgnorePattern`/`argsIgnorePattern`/`caughtErrorsIgnorePattern: '^_'`).

**Formatting & Linting**:
- Prettier: tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, bracketSpacing, arrowParens=always, endOfLine="lf". `.gitattributes` enforces LF.
- ESLint flat config (`eslint.config.mjs`): eleven file-group blocks (main, preload, renderer module/script, fullscreen+tournament, workers, jxl module worker, shared libs, unit tests, e2e helpers/tests); shared rules eqeqeq/curly/prefer-const/no-var/no-shadow(warn)/no-unused-vars(warn); `eslint-config-prettier` last.
- Prettier ignores `docs/`, `*.md`, `package-lock.json`.

**Testing (Unit — Vitest)**:
- Config `vitest.config.js`; tests in `tests/**/*.test.js` excluding `tests/e2e/**`.
- CJS modules in ESM tests: `createRequire(import.meta.url)` then `require('../module')`. Pure-ESM modules (`tournament-engine.js`) import directly. Web Worker modules: stub `globalThis.self = { onmessage: null, postMessage: () => {} }` before `require()`.
- MediaViewer method testing: `extractMethod(name)` / `extractAsyncMethod(name)` read source, extract the method body by brace-counting, and return a `Function`/`AsyncFunction` invoked via `.call(mockCtx, ...)`. The mock ctx must supply every `this.*` the method touches (e.g. `removeFileFromList` needs `clipCache`/`jxlFrameCache`/`bulkRated` Maps + `saveBulkRatedFile`). Replicate heavy-DOM algorithm logic as standalone helpers (see `ml-pair-selection.test.js`).
- Globals/time: patch `globalThis.localStorage`/`globalThis.window` in `beforeEach`/`afterEach`; `vi.useFakeTimers()`+`vi.setSystemTime()` for time.
- Worker abort flag is not directly accessible — set via `self.onmessage({data:{type:'abort'}})`, reset via a `resetAbort()` helper sending an unknown-algorithm `startSort` (handler resets the flag before the switch). Prefer exact `.toThrow('message')` over regex to catch message drift.
- `TournamentEngine.undo()` test mocks must set `Object.setPrototypeOf(mock, {constructor: StrategyClass})` and `StrategyClass.deserialize = vi.fn()` (undo calls `StrategyCtor.deserialize`).

**Testing (E2E — Playwright)**:
- Config `playwright.config.js`; workers:1, fullyParallel:false (Electron can't parallelize).
- Electron 30+ workaround: `electron-wrapper.cjs` strips `--remote-debugging-port=0`, re-applied via `rdp-preload.cjs` (playwright#39008); unset `ELECTRON_RUN_AS_NODE` before spawn. `rdp-preload.cjs` loads playwright-core `loader.js` by path — update if it breaks after upgrade.
- `.media-container` overlay blocks pointer events — use `{force:true}` or `page.evaluate()`.
- Helpers: `seedLocalStorage(page, kv)` (call after `launchApp()`, before `loadFolder()`); `mockFolderDialog(app, path)`; `closeApp()` (races close vs 5s then SIGKILL; Windows `taskkill /F /T`); Lucide CDN stub via `page.route('**/unpkg.com/**')`; `createTempFixtureDir(names?)`.
- `afterEach` null guards: guard `if (electronApp)`/`if (tmpFixtures)`/`if (page)` before cleanup (`.catch()` only handles rejections, not a sync TypeError on undefined).
- Before a method that guards on `isLoading` (e.g. `handleCancel` after `applyBulkRating`), `await page.waitForFunction(() => !window.mediaViewer.isLoading)`.

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Backlog Intake Rules

BACKLOG.md is split into three source sections. Authoritative rules live in
`docs/planning/BACKLOG.md` 📌 Process Rules section — read it first. Summary:

### Where new entries go
- User mentioned it (in conversation, manual testing, idea sharing) → 🔵 User-Flagged
- Claude/automation surfaced it (PR post-merge review, /code-review pass,
  CLAUDE.md staleness, docs/README.md drift, archived-plan checklist) → 🟤 Auto-Generated
- Periodic maintenance, audits, dep/version watches (regression-checker audit, Lucide
  CDN→bundled migration tracking, electron/Husky upgrade watches) → 🟡 Operational
- Unsure → ask before adding; default-to-🔵 if user-raised, default-to-🟤 if Claude-surfaced.

### Intake format
- Group by intake date: `### [YYYY-MM-DD] <event description>`
- One entry per concrete actionable item; never silently merge similar entries on intake —
  tag `[possible-dup-of: <other-entry-title>]` instead
- Required entry shape: `- [ ] **Short title** — body with context, cross-refs,
  affected files`

### Rate limit on 🟤 Auto-Generated
- PR post-merge review follow-ups accumulate in a single `### [YYYY-MM-DD] PR #N
  post-merge review` section per PR — they do NOT spread into the weekly plan unless
  this week is a Cleanup Week (declared in WEEKLY.md header)
- When 🟤 grows beyond ~20 SP of pending items, surface this in the next planning
  conversation as a Cleanup Week trigger

<!-- END MANUAL -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

**Error Handling**: user-facing errors via the notification system (bottom-right); renderer errors forwarded to the main-process file logger via `window.electronAPI.logError` (fire-and-forget); `showError()`, `window.onerror`, `unhandledrejection` all forward.

**Data Structures**: MinHeap (priority queue), VPTree (nearest neighbor), perceptual hashing (image similarity), cosine distance for CLIP (`1 - dot(a,b)` on unit-normalized 512-dim). `calculateCosineDistance` exists in both `sorting-worker.js` and the `MediaViewer` class — the renderer copy returns `1` (not `Infinity`) on null/mismatched input (cosine is bounded [0,2]; 1 = "no signal"). Shared-utility extraction tracked in BACKLOG.

**State Management**:
- Class-based state in MediaViewer; localStorage for prefs (constructor validates/clamps). Settings panel (F1); `enableClipFeatures` (default true) toggles CLIP (~87 MB model on first use). On CLIP disable: revert `sortAlgorithm`→`'vptree'` + sync dropdown SYNCHRONOUSLY, THEN `await deleteSortCache('clip')` (also `clearTimeout(clipUnloadTimer)`) — order matters to avoid a stale-state transient.
- Empty state: `showEmptyStateWithUndo()` (preserves undo toolbar) vs `showDropZone()` (genuine empty) by `moveHistory.length`; empty-state keydown guard blocks all keys except undo (when `moveHistory.length > 0`).
- Compare-pair undo: history entries tagged `compareMode:true`; `handleCancel()` checks bulk-rating undo FIRST (`lastMove.bothGood || lastMove.bothBad` → `undoBulkRating`), then compare-pair.
- `resetMlModel()` on folder change / CLIP toggle nulls model state, resets `predictionScores`, posts `{type:'reset'}` to mlWorker — so stale training (or 576-vs-64-dim mismatch) doesn't persist. `initComplete` with `modelWasReset` clears the renderer cache + `deleteMlModelCache()`.
- `predictionScores` sync: the `sortComplete` handler writes `message.scores` (filename→score) into `predictionScores` before reassigning `mediaFiles`, so badges match the sorted order (guarded `if (message.scores)`).

**Index Management**: `moveCurrentFile()` wraps to 0 on the last file; `removeFileFromList()` caps to length-1; folder loads / sorts / mode switches reset to 0.

**Cache Management**:
- `removeFileFromList()` is the centralized cleanup: array splice + purge of predictionScores/featureCache/clipCache/jxlFrameCache/featureMetadata/perceptualHashes (+ `bulkRated`, with conditional `saveBulkRatedFile()`) + currentIndex adjustment.
- Feature cache v4: on-disk `{vector,size,mtime,clipVector?}`; in-memory `featureCache` holds `Float32Array(64)`, `clipCache` holds `Float32Array(512)` separately; `getCombinedFeatures(path)` merges → 576-dim. `featureMetadata` Map is decoupled from `mediaFiles` so it survives moves. Stale entries pruned on load (size/mtime mismatch → re-extract).
- `restoreFeatureCachesFromHistory(entry)` (inverse of `removeFileFromList`): 576-dim `mlFeatures` → split into featureCache(0..64)+clipCache(64..576); 64-dim → featureCache only; `mtime:0` forces re-extraction next reload. Called in all `handleCancel` branches before `showMedia()`.
- ML model cache: `saveMlModel()` writes `{modelState,timestamp}` to `.ml_model.json`; `deleteMlModelCache()` is misnamed — it writes `''` (no `deleteFile` IPC exists). Rename tracked in BACKLOG.
- Sort cache: `saveSortCache` writes `cache[algorithm] = {algorithm, sortedPaths, timestamp, startFile}`; `applyCachedSortOrder(data, algorithm)` resolves the metric via `algorithm ?? data.algorithm` (caller wins; old caches fall through to Hamming). CLIP sort uses key `'clip'` in the unified `.sort_cache.json`. `insertNewFilesInSortedOrder` is algorithm-aware (`'clip'` → cosine over `clipCache`, else Hamming; missing-vector files end-appended) and aborts its outer loop on `sortAbortController?.signal.aborted`.
- Bulk-rated cache: `.bulk_rated.json` per source folder `{version:1, good:[names], bad:[names]}`; in-memory `bulkRated` Map (filename→'good'|'bad'); hydrated in `loadFolder()` with stale-prune; `trainFromHistoricalRatings()` re-injects via `collectBulkRatedTrainingExamples()` on every model rebuild. Buttons gate: `isCompareMode && isSortedByPrediction && !isTournamentMode`.
- JXL frame cache (`jxlFrameCache`): bounded LRU, `JXL_CACHE_MAX=8` (animated entries ~77 MB); cache-hit does `delete`+`set` (move-to-end), oldest evicted over cap. Entries are MUTABLE streaming objects (`{frames (grow in place), width, height, animated, numLoops, frameCount, complete, whenComplete}`): `decodeJxl` resolves at frame-0 time; `whenComplete` settles when the stream finishes. Gate animation on `frameCount`, not `frames.length`. Worker-message routing in `_handleJxlWorkerMessage`/`_rejectJxlPending`.

**UI Components**: Zoom via `createZoomPopover(target,...)`/`removeZoomPopover(target)`. Compare overlay controls are wrapper-relative `position:absolute`. Compare action bar `#compareActionBar`: three square icon-only overlay buttons (`#bothGoodBtn` green, `#compareUndoBtn` neutral, `#bothBadBtn` red); hidden in tournament mode. Tournament `.tournament-header` uses `margin-top:56px` to clear the fixed `.header`; `.tournament-controls .control-btn` + `.btn-label` override base styles for white-on-glass legibility.

**Event Listener Lifecycle**: AbortController for scoped cleanup (FullscreenManager, sortAbortController, backgroundExtractionAbort); `{signal}` on addEventListener removes listeners without a stored reference.

**Async Patterns**:
- Extraction pause/resume: `signalUserActivity()` on nav/rating → 2s idle → `resumeExtraction()` resolves the gate promise. Generation counter `extractionRunId` — stale async callbacks return early.
- ML compare refresh: `pendingCompareRefresh`/`pendingCompareUpdates` defer `showMedia()` until re-scoring completes (3s fallback); `mediaNavigationInProgress` prevents double-fire.
- CLIP extraction: `@huggingface/transformers` runs in the MAIN process (npm packages can't resolve in Electron Web Workers). Chain: `initClipModel()` → `loadClipModel()` IPC (lazy, concurrent-safe, emits `clip-download-progress`) → image `extractClipEmbedding(path)` / video `extractKeyframes`+`extractClipEmbeddingBatch`; produces 512-dim unit-normalized vectors. Graceful degradation: CLIP unavailable = 64-dim only, no crash. `unloadClipModel` nulls model refs after a 30s idle grace.

**Compare Mode Validation**: `showCompareMedia()` validates files via `checkFileExists` IPC before render (parallel); bounded retry (max 10) → fallback to single mode via `switchToSingleModeUI()`.

**Key Dependencies** (beyond Electron/Vitest/Playwright): `ffprobe-static`/`ffmpeg-static` (video metadata + keyframes, main process); `@huggingface/transformers` (CLIP via ONNX, main-process IPC); `@vladmandic/face-api` (face detection); `stream-json` (streaming `.feature_cache.json` parse — avoids ~1.5GB peak RSS on large caches); `jxl-oxide-wasm` (vendored pure-Rust JXL decoder, `vendor/jxl-oxide-wasm/`, loaded via `read-jxl-wasm` IPC).

**Security**: context isolation enabled, sandbox disabled (required for file ops), IPC bridge via preload.js.

**Keyboard Shortcuts**:
- `DEFAULT_SHORTCUTS` defines `single`/`compare`/`tournament` bindings. Per-mode dispatch: `mode = isTournamentMode ? 'tournament' : isCompareMode ? 'compare' : 'single'`; `D`/`F` resolve to different handlers per mode (compare `bothGood`/`bothBad` = ML training; tournament `bothWin`/`bothLose` = `handleTournamentDraw`, no ML) — isolation comes from the mode-keyed reverse map, not action-name uniqueness.
- `loadShortcuts()` merges sparse `customShortcuts` from global `localStorage` over defaults; `buildKeyString(e)` normalizes events; `buildReverseMap()` inverts `shortcuts[mode]` for O(1) dispatch; `executeAction(action)` dispatches to handlers; `checkShortcutConflict` checks within-mode; `saveShortcut`/`resetShortcuts` persist/clear the full object. Shortcut methods use global `localStorage` directly (tests mock `globalThis.localStorage`).

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

Completed-task history, per-PR review notes, test-count deltas, and the forward roadmap live in `docs/planning/DONE.md`, `docs/planning/WEEKLY.md`, `docs/planning/BACKLOG.md`, archived plans under `docs/archive/plans/`, and `git log` — not here.

**Active gotchas** (still-true, must-know before acting):
- Lucide `createIcons()`: use `{root: element}`, NOT `{nodes:[el]}` (silently ignored → full-document rescan). CDN pinned `@1.14.0` with SHA-384 SRI in `index.html`; wrong hash → icons vanish silently (the `if (typeof lucide !== 'undefined')` guard prevents a crash). Bump: `curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
- Compare mode exit: use `switchToSingleModeUI()` (non-toggling), NOT `toggleViewMode()` (re-toggles → infinite loop when <2 files). `loadFolder()` calls it before `hideDropZone()` — folders always open in single mode (compare context is folder-scoped).
- `#viewModeBtn` is hidden legacy — show/hide `#modeSelector` and enter modes via `switchMode(mode)`, never `toggleViewMode()`.
- `loadFeatureCache()` must run before `startBackgroundFeatureExtraction()` — `loadFolder()` clears in-memory caches, so `kickoffBackgroundExtractionIfEnabled()` `await`s it first or every file re-extracts on every folder switch.
- `@huggingface/transformers` (and any npm package) cannot resolve in Electron Web Workers — run CLIP inference in the main process via IPC.
- IPC progress callbacks: guard `!event.sender.isDestroyed()` before `event.sender.send()` (renderer may close mid-download). `ipcRenderer.on()` listeners accumulate — use `.once()` or return a `removeListener` cleanup for multi-fire events.
- CLIP IPC handlers capture `const processor = clipProcessor; const model = clipVisionModel` locally right after `loadClipModel()` resolves (mid-await race: `unloadClipModel` may null the module refs) and null-guard the captured refs. `extractClipEmbeddingFromBuffer` uses `RawImage.fromBlob` (path-based `RawImage.read` can't decode JXL).
- `buildReverseMap()` must enumerate every mode string — a missing mode key makes all of that mode's keydowns silently no-op.
- Shortcut localStorage versioning: `saveShortcut()` persists the FULL object, so a default-binding change won't reach existing users — needs a versioned migration in `loadShortcuts()` (`(custom.version||1) < CURRENT` → delete stale keys, bump, re-persist); guard `typeof localStorage.setItem === 'function'` for read-only test mocks.
- `baseFolderPath` (full resolved path; used by all tournament IPC + move targets) vs `currentFolderPath` (basename, display only).
- `deleteMlModelCache()` writes `''`; it does not delete (no `deleteFile` IPC). Rename tracked in BACKLOG.
- `.claude/*` is gitignored except `!.claude/agents/` — put shared agents under `.claude/agents/`; never commit other `.claude/` contents.
- Tournament Escape + mode-selector clicks both route through `switchMode('single')` → `showTournamentLeavePrompt` (Save/Discard/Cancel) for an incomplete tournament; resume is offered on mode-enter (Continue/Start-over), not folder-open. `.media-overlay-controls` must stay hidden in tournament mode (their `stopPropagation` eats pick clicks).
- JXL rendering: `object-fit` is silently ignored on `<canvas>` — `finishJxlCanvasDisplay` computes explicit aspect-preserving CSS px (scale ≤1). `computeJxlFrameSchedule` floors 0/short frames to `MIN_MS=20` (else a zero-delay setTimeout pegs the loop). `stopJxlAnimation()` runs first in `cleanupCurrentMedia()` (before the `!currentMedia` return) or a timer draws on a detached canvas. `ensureJxlWorker()` rejects via the stored `_jxlRejectReady` — never replace `_jxlReady` with a fresh `Promise.reject` (awaiters hold the old reference). `_jxlObjectURLs` is shared across single + both compare sides (safe only because compare re-renders both sides atomically). For JXL feature extraction, `new Image()` can't load `.jxl` — decode via `decodeJxl()` + a local object URL revoked `{once:true}` after load (do NOT reuse `jxlFrameToObjectURL()` URLs — revoked on `cleanupCurrentMedia()`).
- `jxl-oxide-wasm` constraints: only `encodeToPng()` exposes pixels (PNG→ImageBitmap round-trip); it is TERMINAL (read `r.duration` BEFORE it, call once, don't `r.free()` after); init with explicit `wasmBytes` (`read-jxl-wasm` IPC, avoids `fetch(file://)`); spawn the worker with `{type:'module'}`.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: best-practices -->
## Best Practices

When modifying this codebase:
- Test file operations carefully (move/copy can cause data loss)
- Changes to preload.js require security review
- Worker changes may impact performance significantly
- The renderer file is large — search before adding duplicates
- Run `npm test` before committing (pre-commit hook enforces this); worker exports require the conditional CJS pattern so tests can import them

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Custom Notes

Add project-specific notes here. This section is never auto-modified.

<!-- END MANUAL -->
