# Backlog

Ideas and tasks not yet prioritized for active development.

**Last Updated**: 2026-04-11 <!-- PR #28 code review findings -->

**Purpose**: Holding area for unprioritized ideas and future work.
**Active tasks**: See [TODO.md](TODO.md)
**Completed work**: See [DONE.md](DONE.md)
**Strategic direction**: See [ROADMAP.md](ROADMAP.md)

---

## From Manual Testing (2026-04-08)

### [2026-04-08] From: manual testing
**Origin**: User feature ideas and UX observations

- [ ] **Design add-on/extension system for the media viewer** — Define core app identity and core functions; build plugin architecture allowing users to install/uninstall add-ons that extend functionality without cluttering the main app (Основной медиа вьюер уже есть и он неплохой. Я не хочу его захламлять различным функционалом, который возможно и не нужен пользователю, поэтому я думаю о том, чтобы добавить фичу по установке дополнений внутри приложения, которая позволит пользователям устанавливать различные дополнения, которые не включены в основное приложение по той или иной причине. Но тогда нужно определить, что это за приложение, какие его основные функции, и что следует вынести в дополнения); affected: new architecture (no existing code)
- [ ] **Move all sorting options to add-ons** — All sorting functionality (similarity, prediction, etc.) should be extractable as add-ons rather than core features; blocked by add-on system design (Все варианты сортировки можно перенести в дополнения); affected: media-viewer.js (sorting logic), sorting-worker.js, ml-worker.js
- [ ] **Add platform integration add-ons (YouTube, TikTok, Twitter, Instagram, Civitai.com)** — Separate add-ons for each platform; ability to request new integrations/plugins via email; consider embedded players (e.g., built-in YouTube player) vs full parsers; consider existing tools like gallery-dl or develop from scratch if necessary; blocked by add-on system design (Добавить следующие как отдельные дополнения: парсинг существующих медиа по ссылкам, интеграцию YouTube, TikTok, Twitter, Instagram, Civitai.com и возможность запросить добавление интеграции или плагина по почте. Лучше добавить возможность интегрировать контент с площадок, а не полноценный парсер. Рассмотреть реализацию с помощью существующих инструментов, таких как gallery-dl); affected: new code
- [ ] **Add ability to rate media from links in text files** — User selects a folder that may contain a plain text file with URLs; linked media is loaded alongside local media for rating; if a link cannot be retrieved/displayed, handle gracefully — consider best course of action (Пользователь может выбрать папку с медиа или без, в которой может быть текстовый документ с ссылками. Вместе с медиа в папке, медиа которое можно получить по ссылке тоже используется в программе для оценки пользователем. Если нельзя получить и показать медиа по ссылке — нужно продумать наилучший вариант действий); affected: media-viewer.js:~L2203 (loadFolder), main.js (IPC file ops)
- [ ] **Display platform content without downloading (embedded players/streams)** — Show posts from TikTok, Twitter, YouTube, etc. without downloading them if possible; consider embedded players vs parsing; related to platform integration add-ons but distinct scope (display without download vs full integration) (Реализовать отображение постов с различных платформ без скачивания, если это возможно); affected: new code
- [ ] **Show thumbnail or low-quality media while loading (progressive loading)** — Display the lowest-quality version or thumbnail first instead of "Loading" placeholder, then progressively load better quality; "stream" the media to users so they can evaluate even from silhouettes or rough images (Можем ли мы отображать миниатюру или самую низкокачественную версию медиа вместо плейсхолдера «Loading», чтобы пользователи могли оценить медиа даже по силуэтам или грубым изображениям. Показывать как медиа загружается онлайн — сначала самое низкое качество, затем постепенно лучше, то есть «стримить» медиа); affected: media-viewer.js (showMedia, showSingleMedia, showCompareMedia), main.js (thumbnail generation IPC)
- [ ] **Configure interface for different window sizes + Ctrl+/- UI zoom** — Make the interface adapt to different main window sizes (currently only one CSS breakpoint at 768px, no resize handlers); allow users to zoom the entire UI in/out using Ctrl + +/- via `webFrame.setZoomFactor` (Настроить интерфейс для разных размеров основного окна. Разрешить масштабирование интерфейса с помощью Ctrl + +/-); affected: styles.css:~L2094 (@media query), media-viewer.js (no resize handler), preload.js (needs webFrame API exposure)

---

## From TASK-028 (CLIP Semantic Features)

### [2026-04-05] From: TASK-028 implementation + manual testing
**Origin**: Architecture decisions and performance observations during 30K-file extraction

### [2026-04-08] From: PR #26 code review
**Origin**: 5 parallel agents + confidence scoring; 10 issues found, 5 scored 75/100, none above 80 threshold; 5 fixed in 3fa3a9a; remaining items below threshold

- [x] **ML model not retrained when like/dislike folders change** — Fixed in f4772a9: `resetMlModel()` called from 4 folder change listeners
- [x] **event.sender.isDestroyed() guard in CLIP progress callback** — Fixed in 3fa3a9a: prevents main process crash if renderer closes during model download
- [x] **CLIP toggle doesn't reset ML model** — Fixed in 3fa3a9a: `resetMlModel()` now called when enableClipFeatures toggle changes
- [x] **Stale mlModelState on version/dim mismatch** — Fixed in 3fa3a9a: `initComplete` handler now clears `mlModelState`/`predictionScores` when `modelWasReset` is true
- [x] **TASK-028 spec not indexed in docs/README.md** — Fixed in 3fa3a9a
- [x] **ESLint header stale (Ten → Eleven blocks)** — Fixed in 3fa3a9a
- [x] **IPC listener accumulation for clip-download-progress** — Fixed in feature/clip-ml-cleanup: `onClipDownloadProgress` returns cleanup function; `initClipModel()` calls it in `finally` block
- [x] **Redundant loadMediaAsImageData for CLIP-only extractions** — Fixed in feature/clip-ml-cleanup: `featureCache.has()` guard skips image decode when only CLIP extraction needed
- [x] **Stale .ml_model.json persisted on disk after version upgrade** — Fixed in feature/clip-ml-cleanup: removed outer `version:1` wrapper from `saveMlModel()`; added `deleteMlModelCache()` called on `modelWasReset`
- [x] **Dead worker code in clip-worker.js** — Fixed in feature/clip-ml-cleanup: entire file deleted (was never instantiated as Worker); `tests/clip-worker.test.js` deleted; ESLint block 3c removed
- [ ] **CLIP text-based search UI** — CLIP embeddings enable text-image matching ("find photos of dogs"); requires search input UI + text encoder + cosine similarity; embeddings already stored in clipCache
- [ ] **CLIP-based similarity sorting** — Replace or augment blockhash with CLIP cosine similarity for semantic grouping; embeddings available in clipCache
- [ ] **Unload CLIP model after extraction completes** — CLIP ONNX model consumes ~200-400 MB in main process; stays loaded indefinitely after extraction finishes; add logic to unload (`clipProcessor = null; clipVisionModel = null`) after background extraction completes + force GC; re-load lazily if user opens new folder
- [ ] **GPU acceleration for CLIP inference (DirectML/CUDA)** — Current CPU inference ~100-200ms/image (~8h for 30K files); DirectML (Windows, any GPU) could reduce to ~10-30ms/image; CUDA (Linux, NVIDIA) ~5-15ms/image; implementation: pass `{ device: 'gpu' }` to `from_pretrained()` in main.js, fallback to CPU if unavailable; add settings toggle for GPU preference

### [2026-04-09] From: CLIP/ML Pipeline Cleanup
**Origin**: Implementation observations during cleanup of TASK-028 debt

- [ ] **DRY CLIP embedding averaging in main.js** — `main.js:515-530` has inline averaging + normalization logic identical to the deleted `averageEmbeddings()` from `clip-worker.js`; if more CLIP consumers appear (e.g., CLIP text search, CLIP similarity sorting), extract to a shared `clip-utils.js` module
- [ ] **Audit all preload.js `ipcRenderer.on()` for listener accumulation** — The `clip-download-progress` listener was leaking because `ipcRenderer.on()` was used without cleanup; audit remaining `ipcRenderer.on()` registrations in preload.js (currently only `logError` uses `.send()` which is fine); establish pattern: all `.on()` listeners must return cleanup functions

### [2026-04-10] From: PR #27 code review
**Origin**: 5 parallel agents + confidence scoring; 7 issues found, 3 scored >=80 (all doc issues, fixed in ce9dd798); code-level observations below threshold but worth tracking

- [ ] **Rename `deleteMlModelCache()` → `clearMlModelCache()`** — Method writes empty string to `.ml_model.json` rather than deleting it (no `deleteFile` IPC exists); name "delete" is misleading; `clearMlModelCache()` or `invalidateMlModelCache()` better reflects the write-empty-string behavior; affected: `media-viewer.js` (~L5598), CLAUDE.md
- [ ] **Add `deleteFile` IPC to preload.js** — Currently no file deletion capability in the IPC bridge; `deleteMlModelCache()` works around this by writing empty string; a proper `deleteFile` handler would enable clean cache invalidation and potentially other file cleanup operations; affected: `main.js` (new IPC handler), `preload.js` (new bridge method)
- [ ] **Add null guard in `enqueueFeatureExtraction` for imageData** — When file needs CLIP-only extraction (has hand-crafted features), `imageData` is passed as `null`; safe today because `featureCache.has()` early-return fires first, but invariant is implicit and fragile (concurrent cache eviction could cause `task.imageData.data` TypeError crash); add defensive `if (!imageData) return null` before queuing task; affected: `media-viewer.js` (~L6654, `enqueueFeatureExtraction`)

---

## From TASK-027 (Fix Undo Empty Folder)

### [2026-04-03] From: PR #25 code review
**Origin**: 5 parallel agents (2 hit rate limits) + confidence scoring; 9 issues found, 4 scored 75/100, none above 80 threshold; 3 fixed in c0f1c3ca; remaining items below threshold or pre-existing patterns

- [ ] **E2E afterEach null safety on tmpFixtures** (75/100) — `tests/e2e/undo-empty-state.test.js` `afterEach` calls `tmpFixtures.cleanup()` without null guard; will crash if `createTempFixtureDir()` throws before assignment; pre-existing pattern across most E2E test files (only `app-launch.test.js` guards)
- [ ] **Misleading describe label in unit tests** (50/100) — `tests/media-viewer-utils.test.js` describe block "keydown guard — undo in empty state" only tests `buildKeyString()`, not the guard itself; guard covered by E2E tests
- [x] **DOM leak: .empty-state-undo in showDropZone()** (75/100) — Fixed in c0f1c3ca
- [x] **Stale .spec.js filename in spec doc** (75/100) — Fixed in c0f1c3ca
- [x] **docs/README.md not updated for TASK-027 spec** (75/100) — Fixed in c0f1c3ca

---

## From TASK-026 (Keyboard Shortcut Customization)

### [2026-03-27] From: TASK-026 implementation
**Origin**: Implementation findings + E2E debugging

- [ ] **Extract ShortcutManager module** — keyboard shortcut logic (DEFAULT_SHORTCUTS, loadShortcuts, saveShortcut, resetShortcuts, buildKeyString, buildReverseMap, executeAction, checkShortcutConflict, listening mode, renderShortcutRows) is a natural candidate for v2.0 modularization (same pattern as FullscreenManager)
- [ ] **Modifier key display in help overlay** — `keyDisplayName()` strips `Key`/`Digit` prefixes but doesn't prettify modifier combos (e.g., `Ctrl+A` displays as `Ctrl+A` which is fine, but `Ctrl+Shift+Q` could be cleaner)
- [ ] **E2E test userData isolation** — custom shortcuts in localStorage persist across E2E test runs because Electron reuses the same userData directory; consider `app.setPath('userData', tmpDir)` in test setup for full isolation

### [2026-03-28] From: PR #24 code review
**Origin**: 5 parallel agents + confidence scoring; 10 issues found at 75/100, none above 80 threshold; 5 fixed in d4fde97; remaining items below threshold or author declined with rationale

- [ ] **docs/README.md not updated for TASK-026 spec/plan files** (75/100) — `docs/superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md` and `docs/superpowers/plans/2026-03-27-keyboard-shortcut-customization.md` not indexed; recurring since PR #19
- [ ] **Archived plan has 60 unchecked checkboxes** (75/100) — `docs/archive/plans/2026-03-27-task-026-keyboard-shortcut-customization.md` archived in pre-execution state; repeat pattern from PR #20
- [ ] **Compare test right-pane assertion removed** (75/100) — `tests/e2e/compare-mode.test.js` no longer asserts right-pane visibility after navigation; author says intentional (old test passed by accident)
- [x] **Stale cancelBtn tooltips** (75/100) — Fixed in 43e89e6
- [x] **Reserved key remap not blocked** (75/100) — Fixed in d4fde97
- [x] **Detached kbdElement crash in resetShortcuts** (75/100) — Fixed in d4fde97
- [x] **Dead ArrowLeft/ArrowRight loading guard** (75/100) — Fixed in d4fde97
- [x] **DEFAULT_SHORTCUTS triplicated** (75/100) — Fixed in d4fde97

---

## From TASK-025 (Application Logging)

### [2026-03-26] From: TASK-025 implementation + code review
**Origin**: Implementation review + code quality review findings

- [ ] **Double-init protection for logger.js** — `init()` should close any existing file descriptor before opening a new one to prevent fd leaks if called twice without cleanup
- [ ] **Console interception scope** — ffprobe errors at module load (before `app.whenReady()`) are not captured in log file; consider moving interception to module scope after `require('./logger')`
- [ ] **Unhandled rejection message clarity** — `event.reason` may be an Error object producing `[object Object]` in log; use `String(event.reason)` or `event.reason?.message || event.reason` for clearer output

---

## From Code Reviews

### [2026-03-27] From: PR #23 code review (TASK-025)
**Origin**: 5 parallel agents + confidence scoring; 2 above 80/100 threshold (both fixed in 8fd9934); remaining items below threshold

- [ ] **IPC handler crash on malformed payload** (75/100) — `ipcMain.on('log-renderer-error')` destructures second arg `{ level, message, source }` without null guard; malformed renderer call could throw TypeError in main process; other IPC handlers use try/catch
- [ ] **Archived plan Status not set to "Complete"** (75/100) — `docs/archive/plans/2026-03-26-task-025-application-logging.md` has `Status: Design approved` instead of `Complete`; CLAUDE.md Task Completion Step 2 requires it; repeat pattern from PR #19/#20
- [ ] **Archived plan has unchecked checkboxes** (75/100) — TDD step-by-step checkboxes never marked done; CLAUDE.md requires "All sections filled" before archival; repeat pattern from PR #20
- [ ] **Archived plan deviation not documented** (75/100) — Plan describes `createWriteStream` implementation but code uses `fs.openSync`/`fs.writeSync`; no Execution Log or Key Discoveries section documents this deviation
- [ ] **DONE.md spec link uses wrong relative path** (50/100) — `../../superpowers/specs/` should be `../superpowers/specs/` (one level up from `docs/planning/`, not two)
- [x] **Consolidate Git Insights entries** (75/100) — 6 separate TASK-025 bullets instead of one consolidated entry (fixed in conflict resolution during merge)
- [x] **Stack trace loss in `args.join(' ')`** (85/100) — Fixed in 8fd9934 via `formatArgs()` helper
- [x] **Spec file not indexed in docs/README.md** (100/100) — Fixed in 8fd9934

### [2026-03-24] From: PR #21 code review (TASK-023)
**Origin**: 5 parallel agents + confidence scoring; all items below 80/100 threshold

- [ ] **Consolidate duplicate Git Insights entries** (75/100) — TASK-023 has two separate bullets in CLAUDE.md Git Insights instead of one consolidated entry like TASK-021/TASK-022. Second entry is also out of chronological order.
- [ ] **Add explanatory comment to all 3 `lucide.createIcons({ root })` call sites** (60/100) — PR added `// Use root param to scope icon creation` comment only at the compare-pane site (line ~2650), not at modal (line ~719) or zoom popover (line ~2102).
- [ ] **Add `Plan:` field to TASK-023 DONE.md entry** (50/100) — All prior entries (TASK-020/021/022) include a `**Plan**:` link; TASK-023 omits it. Process consistency issue.
- [ ] **Clarify DONE.md "3 calls" wording** (50/100) — Third call site was split from 1 call into 2 separate calls (4 total); DONE.md says "Changed 3 calls" without noting the split.

### [2026-03-25] From: PR #22 code review (TASK-024)
**Origin**: 5 parallel agents + confidence scoring; 1 issue above 80/100 threshold (fixed in 962414e); remaining items below threshold

- [ ] **Update CLAUDE.md Cache Management docs to include `featureMetadata` in `removeFileFromList()`** (75/100) — Docs list 3 caches (predictionScores, featureCache, perceptualHashes) but code now cleans 4. Same omission in JSDoc comment on the method.
- [ ] **Update `removeFileFromList` test to assert `featureMetadata` cleanup** (75/100) — Test named "cleans up all three caches" doesn't assert `featureMetadata.delete()` and name is now factually wrong (four caches).
- [ ] **Reuse `fileInfo` param in `computeFeatures()` instead of redundant `mediaFiles.find()`** (75/100) — New `computeFileInfo` lookup duplicates the already-resolved `fileInfo` parameter. CLAUDE.md Best Practices: "consider searching before adding duplicates".
- [ ] **Clear `extractionStartTime` in all-cached early-return path** (75/100) — `startBackgroundFeatureExtraction()` sets `extractionStartTime` then returns early when all files cached, leaving stale state. Self-heals on next run but observable.
- [ ] **Fix `_extractionCachedCount` stale after all-cached early-return** (75/100) — Not reset when `filesToProcess.length === 0` early-return bypasses `cancelBackgroundExtraction()`. Stale count could display for next folder.
- [ ] **Update misleading `FEATURE_CACHE_VERSION` comment** (75/100) — Comment says "must match FEATURE_VERSION in feature-extractor.js" but they now diverge (3 vs 2). Constants serve different purposes (cache schema vs feature vector format).
- [ ] **Guard `loadFeatureCache()` against clearing in-memory Maps mid-extraction** (75/100) — Unconditional `new Map()` at start could discard up to 30s of unsaved extraction work if user re-clicks "Sort by Prediction" during extraction.
- [ ] **Index TASK-024 spec in docs/README.md** (75/100) — `docs/superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md` not indexed. Same issue flagged and fixed in PR #19.
- [ ] **Add "Status: Complete" to archived TASK-024 plan** (75/100) — Archived plan has unchecked checkboxes and no Status field. Recurring issue from PR #19 and PR #20 reviews.

## From Completed Tasks

### [2026-03-25] From: TASK-024 (Per-folder feature cache fix)
**Origin**: TASK-024 implementation

- [ ] **Replace `mediaFiles.find()` with Map lookup at featureMetadata population sites** — 6 `featureCache.set()` sites use `this.mediaFiles.find(f => f.path === filePath)` for O(n) linear scan per file. For 1000+ file folders, this adds up during extraction. Build a `Map<path, fileInfo>` once per extraction run and use O(1) lookup instead.
- [ ] **Add unit tests for loadFeatureCache/saveFeatureCache validation logic** — v3 schema has complex validation (version check, size/mtime comparison, dimension check, deleted file pruning) but no automated tests. Mock `window.electronAPI` IPC calls and test: v2→v3 invalidation, stale entry skip, deleted file pruning, dimension mismatch skip, round-trip save→load consistency.

### [2026-03-23] From: TASK-023 (Fix video pause/play icon synchronization)
**Origin**: TASK-023 implementation

- [ ] **Pin Lucide CDN to a specific version** — `index.html` loads `lucide@latest` which can break at any time. Pin to `lucide@1.0.1` (or whichever current) for reproducible builds. The `nodes` → `root` param rename between versions caused this bug silently.
- [ ] **Add regression test for play/pause icon toggle** — No E2E or unit test verifies that the play/pause icon actually changes state when toggling video playback. Would catch Lucide API drift or similar DOM reference bugs.

### [2026-03-22] From: TASK-022 (Fix compare mode last-pair error cascade)
**Origin**: TASK-022 implementation

- [ ] **DRY `toggleViewMode()` single-mode branch with `switchToSingleModeUI()`** — The single-mode UI setup in `toggleViewMode()` (lines ~3430-3445) duplicates `switchToSingleModeUI()`. The else branch could call `switchToSingleModeUI()` instead, keeping all single-mode UI logic in one place. Trivial refactor.
- [ ] **Handle partial failure in compare-pair undo** — If first file restores but second fails, first file is moved back on disk but both entries are pushed back to history. Pre-existing pattern from compare-mode undo (line ~3311), now also in single-mode compare-pair undo. Low priority — requires transactional file move or rollback logic.

### [2026-03-21] From: TASK-019 (Extract fullscreen module from media-viewer.js)
**Origin**: TASK-019 code reviews (Task 1, Task 2, and final review)

- [ ] **Rename `abortController()` method in FullscreenManager** — Method name reads as a noun (property access) rather than a verb (action). Confusing because `AbortController` is a well-known browser API class. Consider `releaseController(wrapper)` or `removeController(wrapper)`. No external callers (only used internally by `cleanup()`), so rename is trivial.
- [ ] **Add wrapper-aware `isZoomed(wrapper)` helper to MediaViewer** — The `isZoomed` callback injected into FullscreenManager duplicates the wrapper-to-target mapping logic (`left-media-wrapper` → `'left'`, etc.). Consider adding a `isWrapperZoomed(wrapper)` method on MediaViewer so the callback can delegate instead of reimplementing. Prevents divergence if zoom state shape changes.
- [ ] **Add unit tests for FullscreenManager** — Class is independently testable (DOM APIs can be mocked). E2E tests cover behavior end-to-end, but focused unit tests would catch regressions faster and serve as documentation for the manager's contract.
- [ ] **Clear `wrapper.dataset.wasPlaying` after restore in `cleanup()`** — Pre-existing bug carried over from original code. After restoring video playback state, `wasPlaying` remains on the element. If the same wrapper is reused for different media, stale attribute could cause unintended `video.play()` on next `cleanup()`.
- [ ] **Fix ESLint header label style inconsistency for block 2c** — Header listing uses em-dash suffix format; block comment uses parenthetical format. Inconsistent with blocks 2a/2b which use parenthetical in the label. Cosmetic only.

### [2026-03-21] From: TASK-020 — ML sorting pair ordering investigation
**Origin**: docs/superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md

- [ ] Content-understanding features — Current 64-dim vector captures color/texture only; integrating CLIP embeddings or similar would improve score discrimination. Ties into TASK-028 research.
- [ ] Auto re-sort after N ratings — Currently user must manually click "Sort by Prediction" to reorder files; consider auto-re-sorting after every N ratings (configurable, e.g., every 5 or 10) to keep ordering fresh.
- [ ] Model diagnostics panel — Show weight distribution, feature importance, training sample counts, and prediction confidence histogram in Settings panel; helps users understand model behavior.
- [ ] Wider score gaps via margin-based pairing — Require minimum score gap (e.g., 0.2) for pairs; skip pairs with tiny gaps (99% vs 97%) that feel like coin flips to the user.
- [ ] Score confidence indicator — Distinguish high-confidence predictions (many similar training samples) from low-confidence ones (novel features).

### [2026-03-21] From: code-review-pr-18 (Post-merge review findings)
**Origin**: PR #18 code review — 5 parallel agents, confidence scoring (7 issues at 75/100, none above 80 threshold)

- [ ] **Remove dead `_extractMethod` function from ml-pair-selection.test.js** — Defined but never called; duplicates `extractMethod` from media-viewer-utils.test.js. `_` prefix used to suppress lint warning on dead code rather than genuinely unused param. Either delete or extract to shared test helper. (confidence 75/100)
- [ ] **Clear `pendingCompareRefresh` in `scoreComplete` even when `message.scores` is falsy** — Cleanup of `pendingCompareRefresh`, `pendingCompareTimeout`, and `mediaNavigationInProgress` is nested inside `if (message.scores)`. If ML worker sends `scoreComplete` without scores (error path), flags remain stuck until 3s fallback. Move cleanup outside the scores guard. (confidence 75/100)
- [ ] **Remove or document dead `pendingCompareRefresh` bypass in `reverseUpdateComplete` handler** — Undo path never sets `pendingCompareRefresh=true`, so the bypass branch is unreachable. Spec says "pendingCompareUpdates=1 for undo path" but this was not implemented. Dead code could mislead future developers. (confidence 75/100)
- [ ] **Move `signalUserActivity()` before `mediaNavigationInProgress` guard in compare rating handlers** — Guard causes early return before `signalUserActivity()` fires, partially reverting TASK-015 fix. During 3s pending window, repeated key presses won't pause background extraction. (confidence 75/100)
- [ ] **Add user-visible feedback during ML re-score pending window** — `mediaNavigationInProgress` held `true` for up to 3 seconds blocks all navigation with no visible UI feedback (only console.warn). Consider showing a brief "Updating scores..." indicator. (confidence 75/100)
- [ ] **Mark code-review-pr-17 BACKLOG items as done when fixing them** — PR #18 fixed two items (Single-file renderer pattern, stale Git Insights) but didn't mark them `[x]`. Fixed in post-merge cleanup. (confidence 75/100)
- [ ] **Set `previousScores` even when `predictionScores.size === 0`** — First-pair rating skips delta notification because the size guard prevents snapshot. Minor edge case but inconsistent with documented "always show notification" behavior. (confidence 75/100)

### [2026-03-21] From: TASK-021 (Fix compare mode overlay controls UX)
**Origin**: TASK-021 manual testing feedback

- [ ] **Smart overlay positioning: place buttons below media when space available** — When media has small height, overlay buttons at `bottom: 56px` overlap the media content. Ideal behavior: detect rendered media height (via `object-fit: contain` actual bounds), position buttons just below the media edge when space exists, fall back to current `bottom: 56px` (inside media, above video controls) when media fills the full wrapper height. Requires JS measurement on load/resize. Low priority — affects only small-height media which is rare.

### [2026-03-22] From: code-review-pr-19 (TASK-021 overlay controls UX)
**Origin**: PR #19 code review — 5 parallel agents, confidence scoring (9 issues found, 2 above 80 threshold fixed in 74cf251)

- [ ] **Add `transition-delay: 0s` to fullscreen overlay rule** — Fixed in 74cf251 (scored 85/100). Keeping for reference: when adding `transition-delay` to base rules, always check fullscreen/hidden state overrides.
- [ ] **Add `:active` press animation to `.overlay-btn`** — `.control-btn` has `:active` state (TASK-018) but `.overlay-btn` does not. Now that overlay buttons are reliably clickable, the missing press feedback is a UX inconsistency. Pre-existing; not introduced by this PR. (scored 25/100)
- [ ] **Fix "applies to both compare and single mode" documentation claim** — CLAUDE.md Git Insights and DONE.md say the overlay fix applies to single mode, but `.media-overlay-controls` is only created in compare mode via `addMediaOverlayControls()`. Single mode uses static HTML buttons. Misleading to future developers. (scored 75/100)
- [ ] **Verify zoom popover not clipped by `overflow: hidden` on `.media-wrapper`** — With `position: absolute` on `.media-overlay-controls`, the upward-expanding `.zoom-popover` is now inside the `overflow: hidden` boundary of `.media-wrapper`. May clip the popover in compare mode. Needs manual verification. (scored 75/100)
- [ ] **Check archived plan checkboxes before archival** — Plan file archived with 24 unchecked `- [ ]` items and no explicit "Status: Complete" field, violating global CLAUDE.md Step 2 archive requirements. Procedural issue — actual work was completed. (scored 75/100)

### [2026-03-21] From: code-review-pr-17 (Post-merge review findings)
**Origin**: PR #17 code review — 5 parallel agents, confidence scoring

- [x] **Update "Single-file renderer" pattern in CLAUDE.md** — Fixed in PR #18 (TASK-020): updated to "Renderer entry: Core UI logic in `media-viewer.js`; v2.0 modularization..."
- [ ] **Update `.claude/agents/regression-checker.md` for FullscreenManager** — References `fullscreenAbortControllers`, `cleanupFullscreen()`, and `abortFullscreenController()` which were extracted to `FullscreenManager` in `fullscreen.js`. Agent will give stale guidance on future reviews.
- [x] **Update stale CLAUDE.md Git Insights entries for TASK-005/TASK-006** — Fixed in PR #18 (TASK-020): added "(pre-extraction)" and "later extracted into FullscreenManager" annotations

### [2026-03-20] From: TASK-018 (UI polish: button press effects and fullscreen guard)
**Origin**: TASK-018 spec review and implementation

- [ ] **Add `:hover` state to nav buttons (prev/next)** — TASK-018 revealed that all `.control-btn` elements have per-button `:hover` rules, but navigation arrows are not `.control-btn` and have no hover feedback at all. Consider adding hover effects for consistency.
- [ ] **Consolidate per-button `:hover` rules into shared base** — Six separate `:hover:not(:disabled)` rules (like, dislike, cancel, special, zoom-toggle, overlay-zoom) all share `transform: translateY(-3px) scale(1.05)`. The transform could be moved to a shared `.control-btn:hover:not(:disabled)` rule, with per-button rules only setting `background`, `border-color`, and `box-shadow`. Reduces duplication.

### [2026-03-20] From: code-review-pr-16
**Origin**: Code review of PR #16 (TASK-018 UI polish: button press effects and fullscreen guard)

- [x] **Update CLAUDE.md "Detected Patterns > Event Listener Lifecycle" for cleanupFullscreen() guard** — Fixed in commit c0cfdde
- [x] **Update inline comment on cleanupFullscreen() to reflect early-return behavior** — Fixed in commit c0cfdde

### [2026-03-20] From: TASK-017 (ESLint config and documentation alignment)
**Origin**: TASK-017 implementation

- [ ] **Add `globals.browser` to ESLint block 3b for feature-extractor.js** — Block 3b only declares `globals.worker` but `feature-extractor.js` is also loaded as a browser `<script>` tag (index.html:354). Currently no browser-only globals are used so no lint errors, but the config doesn't reflect the dual-environment nature. Adding `globals.browser` would future-proof against browser API usage.
- [ ] **Audit remaining CLAUDE.md Git Insights for stale references** — TASK-017 fixed 3 stale "known discrepancy" references. Other Git Insights entries may similarly reference outdated state (e.g., block counts, old patterns). A sweep would catch remaining drift.

### [2026-03-20] From: code-review-pr-15
**Origin**: Code review of PR #15 (TASK-016 E2E test reliability improvements)

- [x] **Use `electronApp.once('window')` instead of `.on('window')` in launchApp()** — Applied directly on main (post-merge fix)
- [ ] **Document waitForNotification() retention decision** — TASK-016 acceptance criterion #3 ("remove or use waitForNotification()") was deferred rather than completed. The reasoning (keep for TASK-022 and future notification tests) exists only in the PR body, not in committed documentation. Scored 75/100 confidence.

### [2026-03-20] From: TASK-016 (E2E test reliability improvements)

- [ ] **Investigate transient Vitest "No test suite found" failures** — During TASK-016, `npm test` returned "No test suite found in file" for all 4 test files, but the same tests passed moments later via the pre-commit hook. May indicate Vitest version instability or file-system timing issue on Windows. Monitor for recurrence.
- [ ] **Use waitForNotification() in future E2E tests** — Helper exists in electron-app.js but is unused. Natural candidates: TASK-022 (error cascade notification test), rating notification verification, extraction completion notification test.

### [2026-03-20] From: TASK-015 (Fix zoom and extraction bugs)

- [ ] **Rename closeAllZoomPopovers() or add destroyAllZoomPopovers()** — `closeAllZoomPopovers()` only hides popovers visually (removes `.show` class) but does not call `removeZoomPopover()`. Future code paths relying on it for full cleanup would leak listeners. Consider renaming to `hideAllZoomPopovers()` for clarity, or adding a `destroyAllZoomPopovers()` that iterates and calls `removeZoomPopover()`.
- [ ] **Add unit test for zoom popover AbortController cleanup** — The listener leak was caught by code review, not automated tests. A test verifying `AbortController.abort()` is called during `cleanupCompareMedia()` would prevent regressions.

### [2026-03-20] From: code-review-pr-14
**Origin**: Code review of PR #14 (TASK-015 fix zoom and extraction bugs)

- [ ] **Align extraction completion cleanup ordering with cancelBackgroundExtraction()** — Natural completion path sets `isBackgroundExtracting = false` before clearing pause state (`extractionResumeTimer`, `extractionPaused`, `extractionResumeResolve`), while `cancelBackgroundExtraction()` does the opposite. No functional bug (loop has exited), but inconsistent ordering between the two exit paths. Scored 25/100 confidence.
- [ ] **Update CLAUDE.md signalUserActivity() caller list** — Detected Patterns section lists only single-mode callers; four compare-mode handlers (`handleLeftLike`, `handleLeftDislike`, `handleRightLike`, `handleRightDislike`) now also call it but aren't documented. Scored 25/100 confidence.
- [ ] **Add removeZoomPopover('single') to cleanupCurrentMedia() or mode switch** — Compare-mode popovers are now properly aborted via AbortController in `cleanupCompareMedia()`, but single-mode popover AbortController is never aborted during mode transitions. No actual leak (singleton, created once), but asymmetric pattern. Scored 25/100 confidence.

### [2026-03-12] From: TASK-013 (Unit test infrastructure)

- [ ] **Deduplicate MinHeap/VPTree across sorting-worker.js and media-viewer.js** — Both files contain identical implementations. Extract to a shared `data-structures.js` with the conditional CJS export pattern, then importScripts() in worker and import in renderer.
- [x] **Add tests for showCompareMedia pair selection logic** — Promoted to TODO: TASK-020 (merged into ML investigation)

### [2026-03-11] From: TASK-012 (Pre-commit hooks)

- [ ] **Promote `no-shadow` from warn → error** — After the codebase has been cleaned up, harden the rule to block commits with shadowed variables rather than just warning. Two known shadow sites remain in `handleCancel()` and the wheel handler.
- [ ] **Add ESLint rule for no-console in production builds** — Currently `no-console` is off (console.log is intentional for Electron logging). Consider adding a build-time strip or lint warning in a future CI step.

### [2026-03-12] From: code-review-pr-11

- [x] **Document `_`-prefix convention for unused variables in CLAUDE.md** — Promoted to TODO: TASK-017
- [x] **Fix eslint.config.mjs header comment environment count** — Promoted to TODO: TASK-017
- [x] **Correct "worker-loaded" classification for feature-extractor.js** — Promoted to TODO: TASK-017

---

## Feature Ideas

### Sorting & ML

| Idea | Description | Value | Effort | Source |
|------|-------------|-------|--------|--------|
| ~~Force re-sort option~~ | ~~Allow user to discard cached sort and re-sort from scratch~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-007 |
| ~~Worker count setting~~ | ~~Let user configure number of extraction workers~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-009 |
| ~~Estimated time remaining for extraction~~ | ~~Show ETA during feature extraction~~ | ~~Medium~~ | ~~Medium~~ | Promoted to TODO: TASK-010 |

---

## Enhancements

Improvements to existing functionality.

| Enhancement | Area | Value | Effort | Notes |
|-------------|------|-------|--------|-------|
| ~~Cache age display in sorting notification~~ | ~~Sorting~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-008 |
| ~~Pause extraction when user is navigating~~ | ~~ML/Perf~~ | ~~Medium~~ | ~~Medium~~ | Promoted to TODO: TASK-011 |
| ~~Validation in showCompareMedia() for file existence~~ | ~~Compare~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-004 |
| Anonymize author field in package.json if privacy desired | Config | Low | Low | Security audit: 2026-02-05 |
| ~~Memory leak guard for exitHandler~~ | ~~Fullscreen~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-005 |
| ~~Unified fullscreen exit cleanup method~~ | ~~Fullscreen~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-006 |
| ~~Click/active effect for control buttons~~ | ~~UI~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-018 |
| ~~Keyboard shortcut for zoom toggle~~ | ~~UI~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-026 (merged into keyboard customization) |
| Zoom level persistence across navigation | UI | Low | Medium | Plan: 2026-02-05_visual-scale-controls |
| ~~Fix mouseup listener leak in createZoomPopover~~ | ~~Zoom~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-015 |
| Document fullscreen zoom reversal from TASK-001 | Zoom/UX | Low | Low | Code review: PR #1 |
| ~~Remove spinner state churn in showCompareMedia() retry~~ | ~~Compare~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-022 (merged into last-pair error fix) |
| ~~Abort fullscreenAbortController before wrapper.remove()~~ | ~~Fullscreen~~ | ~~Low~~ | ~~Low~~ | Fixed in TASK-005 PR review |

---

## Technical Debt

Known issues that should be addressed eventually.

| Item | Impact | Effort | Added |
|------|--------|--------|-------|
| ~~Centralized removeFile() method~~ | ~~Medium~~ | ~~Medium~~ | Promoted to TODO: TASK-003 |
| Verify no secrets in git history (`git log -p --all -S`) | High | Low | 2026-02-05 |

---

## Research Topics

Areas requiring investigation before implementation.

| Topic | Question | Why Important | Added |
|-------|----------|---------------|-------|
| ~~Media content understanding~~ | ~~Open source tools for identifying what's depicted in media?~~ | ~~Could improve ML prediction quality~~ | Promoted to TODO: TASK-028 |

---

## Spawned Improvements

<!-- Items generated from completed task reviews. Keep origin for traceability. -->

### 2025-12-27 From: sorting-cache
**Origin**: [2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)

- [x] Force re-sort option — Promoted to TODO: TASK-007
- [x] Cache age display — Promoted to TODO: TASK-008

### 2025-12-28 From: background-feature-extraction
**Origin**: [2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)

- [x] Worker count setting — Promoted to TODO: TASK-009
- [x] Estimated time remaining — Promoted to TODO: TASK-010
- [x] Pause extraction when navigating — Promoted to TODO: TASK-011

### 2025-12-29 From: video-fullscreen-toggle
**Origin**: [2025-12-29_video-fullscreen-toggle.md](../archive/plans/2025-12-29_video-fullscreen-toggle.md)

- [x] Memory leak guard for exitHandler — Promoted to TODO: TASK-005
- [x] Unified fullscreen exit cleanup — Promoted to TODO: TASK-006

### 2026-01-02 From: compare-mode-ai-sort-bug
**Origin**: [2026-01-02_compare-mode-ai-sort-bug.md](../archive/plans/2026-01-02_compare-mode-ai-sort-bug.md)

- [x] Centralized removeFile() method — Promoted to TODO: TASK-003
- [x] Validation in showCompareMedia() — Promoted to TODO: TASK-004

### 2026-02-05 From: visual-scale-controls
**Origin**: [2026-02-05_visual-scale-controls.md](../archive/plans/2026-02-05_visual-scale-controls.md)

- [x] Click/active effect for control buttons — Promoted to TODO: TASK-018
- [x] Keyboard shortcut for zoom toggle — Promoted to TODO: TASK-026 (merged into keyboard customization)
- [ ] Zoom level persistence — Remember zoom level when navigating between media of similar size
- [ ] Slider width responsive to popover space — Wider slider on larger screens for finer control

### 2026-02-05 From: code-review-pr-1
**Origin**: Code review of PR #1

- [x] Fix mouseup listener leak in createZoomPopover — Promoted to TODO: TASK-015
- [ ] Document fullscreen zoom decision reversal — TASK-002 re-enabled wheel zoom and pan in fullscreen, reversing TASK-001's explicit decision (commit d3b08bb). Add rationale to PROJECT_CONTEXT.md.

### 2026-02-06 From: centralized-remove-file
**Origin**: [2026-02-06_centralized-remove-file.md](../archive/plans/2026-02-06_centralized-remove-file.md)

- [ ] Batch removal support — `removeFilesFromList(filePaths[])` for removing multiple files in one operation
- [x] Centralized insertFileIntoList() counterpart — Promoted to TODO: TASK-027 (merged into undo fix)
- [ ] Event-based cache invalidation — Emit 'file-removed' event so new caches auto-subscribe without modifying removeFileFromList

### 2026-02-06 From: code-review-pr-2
**Origin**: Code review of PR #2

- [ ] Index strategy parameter for removeFileFromList() — Add optional `indexStrategy` param ('cap'|'wrap') instead of post-call override in moveCurrentFile(). Keeps all index logic in one place rather than split across caller and method.

### 2026-02-06 From: compare-file-validation
**Origin**: [2026-02-06_compare-file-validation.md](../archive/plans/2026-02-06_compare-file-validation.md)

- [ ] Add same validation to showSingleMedia() — Same vulnerability exists in single view mode. Files deleted externally trigger browser error events instead of being proactively caught.
- [ ] Batch file validation on folder refresh — Validate all files in mediaFiles[] at once, removing stale entries. Useful for long-running sessions where folder contents change.

### 2026-02-24 From: fullscreen-exithandler-leak-guard
**Origin**: TASK-005 code review

- [x] Abort fullscreenAbortController before wrapper.remove() — Fixed in PR review: added `abortFullscreenController()` helper, called before `wrapper.remove()` in `showCompareMedia()` and `toggleViewMode()`
- [x] Add early return guard in cleanupFullscreen() for non-fullscreen wrappers — Promoted to TODO: TASK-018

### 2026-02-24 From: task-006-unified-fullscreen-cleanup
**Origin**: docs/archive/plans/2026-02-24_task-006-unified-fullscreen-cleanup.md

- [x] ~~Extract setupFullscreen(wrapper) from toggleFullscreen() enter branch~~ — Superseded by TASK-019: fullscreen logic extracted to `FullscreenManager` class in `fullscreen.js`. The enter branch is now `FullscreenManager.toggle()`. A symmetric `setup()`/`cleanup()` split within the manager is still possible but lower priority.

### 2026-02-25 From: task-007-force-resort-option
**Origin**: TASK-007 implementation

- [x] Add Shift+click hint to help overlay keyboard shortcuts — Promoted to TODO: TASK-026 (merged into keyboard customization)
- [ ] Force re-sort for ML prediction sort — Apply the same Shift+click force re-sort pattern to `handleSortByPrediction()` for consistency across both sort modes.

### 2026-03-05 From: task-009-worker-count-setting
**Origin**: TASK-009 implementation

- [ ] Auto-detect optimal worker count via `navigator.hardwareConcurrency` — Use CPU core count as suggested default instead of hardcoded 4. Show detected cores in UI label (e.g., "Feature extraction workers (8 cores detected)").
- [ ] Show active worker count in background extraction progress — Display "Extracting features (4 workers)..." in the progress indicator so users understand the current parallelism level.
- [ ] Reinitialize worker pool on setting change or show restart hint — Changing worker count at runtime doesn't affect an already-running pool (guarded by `featureWorkers.length === 0`). Either call `shutdownFeaturePool()` + `initializeFeaturePool()` on change, or add "(takes effect on restart)" label next to the input.

### 2026-03-05 From: task-008-cache-age-display
**Origin**: docs/archive/plans/2026-03-05_task-008-cache-age-display.md

- [ ] Reuse formatTimeAgo() for other timestamps — Could display ML model age, hash cache age, or other cached data freshness
- [ ] Add month-level granularity to formatTimeAgo() — Currently stops at weeks; very old caches show "52 weeks ago" instead of "12 months ago"
- [ ] Fix stale timestamp display when new files merged into cache — When `stats.added > 0`, `saveSortCache()` overwrites disk with `Date.now()` but notification still reads old `cachedSortData.timestamp`. Should update timestamp after re-save or show "just now" for merged caches.

### 2026-03-05 From: task-011-pause-extraction
**Origin**: TASK-011 implementation

- [ ] Move loadMediaAsImageData off main thread — Use OffscreenCanvas in workers to avoid main-thread image decoding jank entirely. Would eliminate the root cause of UI contention during extraction, making the pause feature a nice-to-have rather than essential.
- [ ] Per-file extraction gate instead of per-batch — Currently awaitExtractionGate() is checked once per batch (10 files). Moving the gate inside the inner loop (before each loadMediaAsImageData call) would provide more granular pausing with faster response to user activity.

### 2026-03-11 From: code-review-pr-10
**Origin**: Code review of PR #10 (TASK-011 pause extraction)

- [x] Add signalUserActivity() to compare-mode rating handlers — Promoted to TODO: TASK-015
- [x] Clean up pause state on natural extraction end — Promoted to TODO: TASK-015
- [ ] Remove dangling abort listener in awaitExtractionGate — `signal.addEventListener('abort', resolve, {once:true})` is not removed on normal resume path. Each pause/resume cycle accumulates one listener until the AbortController is GC'd at run end. Scored 72/100 confidence.

### 2026-03-05 From: task-010-extraction-eta
**Origin**: docs/archive/plans/2026-03-05_task-010-extraction-eta.md

- [ ] Show extraction rate in progress pill — Display files/sec alongside ETA (e.g., "45/200 (22%) — ~3m 12s (2.3 files/s)") for throughput visibility
- [ ] Reuse formatElapsed() for other timed operations — Sort-by-similarity, ML training, and other long operations could show elapsed time on completion
- [ ] Apply generation counter pattern to sort cancellation — sortAbortController has the same cancel-then-restart race potential as extraction; extractionRunId pattern could prevent stale sort callbacks from corrupting state

### 2026-03-12 From: code-review-pr-12
**Origin**: Code review of PR #12 (TASK-013 unit test infrastructure)

- [ ] **Move sorting-worker.js to ESLint block 3b or create separate block** — sorting-worker.js now has the conditional CJS export pattern (`typeof module !== 'undefined' && module.exports`) but remains in block 3a. Adding `module: 'readonly'` to 3a also applies it to ml-worker.js and feature-worker.js which don't use `module`, silently permitting accidental CJS code in those pure workers. Scored 75/100 confidence.
- [x] **Update BACKLOG item for ESLint header comment count** — Resolved by TASK-017 (header updated to "Nine file-group blocks")
- [ ] **Add globalThis.self teardown in sorting-worker.test.js** — `globalThis.self` is set at module top-level without afterAll cleanup. While Vitest isolates each file in its own worker, adding teardown is defensive best practice. Scored 25/100 confidence.

### [2026-03-13] From: TASK-014 (Playwright E2E tests)

- [ ] **Test E2E suite on Unix/macOS** — `getElectronWrapperPath()` and `getLaunchArgs()` have Unix branches (using node + CJS wrapper) but were only tested on Windows. Needs CI matrix or manual Mac/Linux validation.
- [ ] **Auto-detect playwright-core loader.js path in rdp-preload.cjs** — Currently hardcoded to `node_modules/playwright-core/lib/server/electron/loader.js`. A playwright-core upgrade that moves this file will break silently. Could use `require.resolve()` or glob.
- [x] **Update ESLint header comment to reflect 9 file-group blocks** — Promoted to TODO: TASK-017

### [2026-03-18] From: code-review-pr-13
**Origin**: Code review of PR #13 (TASK-014 Playwright E2E tests)

- [x] **Clear setTimeout in closeApp() on successful close** — Promoted to TODO: TASK-016
- [x] **Register page.route() CDN stub before firstWindow() loads** — Promoted to TODO: TASK-016
- [x] **Remove or use waitForNotification() export** — Promoted to TODO: TASK-016
- [x] **Fix stale filename in electron-wrapper.cjs JSDoc** — Promoted to TODO: TASK-017

### [2026-03-19] From: Manual testing session
**Origin**: User manual testing — 11 issues reported, 9 promoted to TODO

- [x] ML sorting pair ordering investigation — Promoted to TODO: TASK-020
- [x] Compare mode overlay controls UX — Promoted to TODO: TASK-021
- [x] Compare mode last-pair error cascade — Promoted to TODO: TASK-022
- [x] Video pause/play icon sync — Promoted to TODO: TASK-023
- [x] Per-folder feature extraction caching — Promoted to TODO: TASK-024
- [x] Application logging to file — Promoted to TODO: TASK-025
- [x] Keyboard shortcut customization — Promoted to TODO: TASK-026
- [x] Undo when no media remains — Promoted to TODO: TASK-027
- [x] Research: media content understanding tools — Promoted to TODO: TASK-028

### 2026-04-03 From: TASK-027 (undo empty state fix)
**Origin**: TASK-027 implementation

- [ ] Centralized `insertFileIntoList()` method — Extract reusable file insertion logic from the 4 undo branches in `handleCancel()` (single, compare, special, compare-tagged-in-single). Each branch duplicates file reconstruction + splice/push + ML reversal. A shared method would reduce ~150 lines of duplication.
- [ ] Allow F1 (help) through keydown guard in empty state — Currently `showEmptyStateWithUndo()` blocks F1 along with all other non-undo shortcuts. Users may want to check keyboard shortcuts while in the empty state.

### 2026-02-06 From: code-review-pr-3
**Origin**: Code review of PR #3

- [x] Remove unnecessary loading state resets before recursive retry in showCompareMedia() — Promoted to TODO: TASK-022 (merged into last-pair error fix)

### 2026-04-10 From: compare-mode-fix
**Origin**: [2026-04-10-compare-mode-fix.md](../archive/plans/2026-04-10-compare-mode-fix.md)

- [ ] Make `hideDropZone()` mode-aware — Currently unconditionally shows `.controls` regardless of `isCompareMode`. Works now because `loadFolder()` resets first, but `hideDropZone()` is called from other paths; a mode-aware version would be more robust.
- [ ] Add try/finally cleanup to pre-existing `twoFileTmp` in compare-mode E2E — The "switches to single mode when last pair is rated" test (lines 113-161) has the same inline-cleanup pattern that was fixed for `secondFolder`; should use try/finally too.

### [2026-04-11] From: PR #28 code review
**Origin**: 5 parallel agents + confidence scoring; 4 issues found, 2 scored >=80 (both doc issues, fixed in 54e6246); code-level observations below threshold but worth tracking

- [ ] **Redundant calls in `switchToSingleModeUI()` via `toggleViewMode()`** — When `toggleViewMode()` calls `switchToSingleModeUI()`, `hidePredictionBadges()` and `closeAllZoomPopovers()` run twice (once at top of `toggleViewMode()`, once inside `switchToSingleModeUI()`). Harmless but wasteful; consider splitting `switchToSingleModeUI()` into a core UI-reset (for `toggleViewMode()`) and a full reset (for `loadFolder()` and other callers); affected: `media-viewer.js` (~L3567 `switchToSingleModeUI`, ~L3589 `toggleViewMode`)
- [ ] **Double `isCompareMode = false` in `toggleViewMode()`** — Line ~3619 toggles `isCompareMode` to `false`, then `switchToSingleModeUI()` sets it `false` again. Correct but confusing for future readers; add a comment clarifying the toggle precedes the helper call; affected: `media-viewer.js` (~L3619, ~L3634)
- [ ] **Standardize E2E `waitForTimeout` durations** — Compare-mode tests use 200ms, 300ms, 500ms, 1000ms for similar DOM-settling waits with no clear rationale for which value; consider extracting named constants (e.g., `MODE_SWITCH_SETTLE = 300`) or replacing with state-based waits (`waitForFunction`); affected: `tests/e2e/compare-mode.test.js`, `tests/e2e/navigation.test.js`, `tests/e2e/fullscreen.test.js`

---

## Rejected Ideas

Ideas considered but decided against. Keep reasoning for future reference.

| Idea | Reason for Rejection | Date |
|------|---------------------|------|
| *None yet* | | |

---

## Promotion Criteria

Move items to [TODO.md](TODO.md) when:
- Aligns with current [ROADMAP.md](ROADMAP.md) phase
- Value clearly exceeds effort
- Dependencies are resolved
- Capacity exists to complete
