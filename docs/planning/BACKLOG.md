# Backlog

Ideas and tasks not yet prioritized for active development.

**Last Updated**: 2026-03-13

**Purpose**: Holding area for unprioritized ideas and future work.
**Active tasks**: See [TODO.md](TODO.md)
**Completed work**: See [DONE.md](DONE.md)
**Strategic direction**: See [ROADMAP.md](ROADMAP.md)

---

## From Completed Tasks

### [2026-03-12] From: TASK-013 (Unit test infrastructure)

- [ ] **Deduplicate MinHeap/VPTree across sorting-worker.js and media-viewer.js** — Both files contain identical implementations. Extract to a shared `data-structures.js` with the conditional CJS export pattern, then importScripts() in worker and import in renderer.
- [ ] **Add tests for showCompareMedia pair selection logic** — The acceptance criteria mentioned testing showCompareMedia edge cases. The pair selection logic (regular mode index math, ML-sorted pair selection) could be extracted into a pure function and tested without DOM mocking.

### [2026-03-11] From: TASK-012 (Pre-commit hooks)

- [ ] **Promote `no-shadow` from warn → error** — After the codebase has been cleaned up, harden the rule to block commits with shadowed variables rather than just warning. Two known shadow sites remain in `handleCancel()` and the wheel handler.
- [ ] **Add ESLint rule for no-console in production builds** — Currently `no-console` is off (console.log is intentional for Electron logging). Consider adding a build-time strip or lint warning in a future CI step.

### [2026-03-12] From: code-review-pr-11

- [ ] **Document `_`-prefix convention for unused variables in CLAUDE.md** — ESLint config introduces `varsIgnorePattern: '^_'` and `caughtErrorsIgnorePattern: '^_'` but the naming conventions in CLAUDE.md don't mention this pattern. Add to Code Conventions section for consistency.
- [ ] **Fix eslint.config.mjs header comment environment count** — Header says "Four JS environments" but the config actually defines 7 distinct file-group blocks (1, 1b, 2a, 2b, 3a, 3b, 4-tests). Update comment and corresponding CLAUDE.md section to reflect accurate count.
- [ ] **Correct "worker-loaded" classification for feature-extractor.js** — eslint.config.mjs comment classifies feature-extractor.js as "Shared libs (worker-loaded)" but it is also loaded as a browser `<script>` tag in index.html. Update comment to reflect dual-loading context.

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
| Click/active effect for control buttons | UI | Medium | Low | Plan: 2026-02-05_visual-scale-controls |
| Keyboard shortcut for zoom toggle | UI | Low | Low | Plan: 2026-02-05_visual-scale-controls |
| Zoom level persistence across navigation | UI | Low | Medium | Plan: 2026-02-05_visual-scale-controls |
| Fix mouseup listener leak in createZoomPopover | Zoom | Medium | Low | Code review: PR #1 |
| Document fullscreen zoom reversal from TASK-001 | Zoom/UX | Low | Low | Code review: PR #1 |
| Remove spinner state churn in showCompareMedia() retry | Compare | Low | Low | Code review: PR #3 |
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
| *None yet* | | | |

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

- [ ] Click/active effect for control buttons — No visual feedback on click/press for any control button (like, dislike, special, zoom). Add `:active` state with press animation.
- [ ] Keyboard shortcut for zoom toggle — Add key binding (e.g., `Z` in single mode) to toggle zoom popover without clicking
- [ ] Zoom level persistence — Remember zoom level when navigating between media of similar size
- [ ] Slider width responsive to popover space — Wider slider on larger screens for finer control

### 2026-02-05 From: code-review-pr-1
**Origin**: Code review of PR #1

- [ ] Fix mouseup listener leak in createZoomPopover — `document.addEventListener('mouseup', ...)` is never removed in `removeZoomPopover()`, causing listeners to accumulate in compare mode navigation. Use AbortController or stored handler reference for cleanup.
- [ ] Document fullscreen zoom decision reversal — TASK-002 re-enabled wheel zoom and pan in fullscreen, reversing TASK-001's explicit decision (commit d3b08bb). Add rationale to PROJECT_CONTEXT.md.

### 2026-02-06 From: centralized-remove-file
**Origin**: [2026-02-06_centralized-remove-file.md](../archive/plans/2026-02-06_centralized-remove-file.md)

- [ ] Batch removal support — `removeFilesFromList(filePaths[])` for removing multiple files in one operation
- [ ] Centralized insertFileIntoList() counterpart — Standardize undo restoration across single/compare modes
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
- [ ] Add early return guard in cleanupFullscreen() for non-fullscreen wrappers — cleanupFullscreen() doesn't check if wrapper is actually in fullscreen, so double-calls (e.g., ESC after Z) trigger redundant video.play(). Add `if (!wrapper.classList.contains('fullscreen')) return;` at top.

### 2026-02-24 From: task-006-unified-fullscreen-cleanup
**Origin**: docs/archive/plans/2026-02-24_task-006-unified-fullscreen-cleanup.md

- [ ] Extract setupFullscreen(wrapper) from toggleFullscreen() enter branch — The enter branch is 55 lines. Extracting to a symmetric `setupFullscreen(wrapper)` alongside `cleanupFullscreen(wrapper)` would improve readability and make the enter/exit symmetry explicit.

### 2026-02-25 From: task-007-force-resort-option
**Origin**: TASK-007 implementation

- [ ] Add Shift+click hint to help overlay keyboard shortcuts — The force re-sort feature is only discoverable via button tooltip. Adding it to the help overlay (F1) keyboard shortcuts section would improve discoverability.
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

- [ ] Add signalUserActivity() to compare-mode rating handlers — `handleLeftLike`, `handleLeftDislike`, `handleRightLike`, `handleRightDislike` don't call `signalUserActivity()`, so extraction is not paused during compare-mode rating. Scored 75/100 confidence.
- [ ] Clean up pause state on natural extraction end — When the extraction loop finishes normally (not via cancel), `extractionPaused`, `extractionIdleTimer`, and `extractionResumeResolve` are not reset. A late `signalUserActivity()` call could show stale progress. Scored 75/100 confidence.
- [ ] Remove dangling abort listener in awaitExtractionGate — `signal.addEventListener('abort', resolve, {once:true})` is not removed on normal resume path. Each pause/resume cycle accumulates one listener until the AbortController is GC'd at run end. Scored 72/100 confidence.

### 2026-03-05 From: task-010-extraction-eta
**Origin**: docs/archive/plans/2026-03-05_task-010-extraction-eta.md

- [ ] Show extraction rate in progress pill — Display files/sec alongside ETA (e.g., "45/200 (22%) — ~3m 12s (2.3 files/s)") for throughput visibility
- [ ] Reuse formatElapsed() for other timed operations — Sort-by-similarity, ML training, and other long operations could show elapsed time on completion
- [ ] Apply generation counter pattern to sort cancellation — sortAbortController has the same cancel-then-restart race potential as extraction; extractionRunId pattern could prevent stale sort callbacks from corrupting state

### 2026-03-12 From: code-review-pr-12
**Origin**: Code review of PR #12 (TASK-013 unit test infrastructure)

- [ ] **Move sorting-worker.js to ESLint block 3b or create separate block** — sorting-worker.js now has the conditional CJS export pattern (`typeof module !== 'undefined' && module.exports`) but remains in block 3a. Adding `module: 'readonly'` to 3a also applies it to ml-worker.js and feature-worker.js which don't use `module`, silently permitting accidental CJS code in those pure workers. Scored 75/100 confidence.
- [ ] **Update BACKLOG item for ESLint header comment count** — BACKLOG line 29 says "6 distinct file-group blocks" but after TASK-013 the config has 7 blocks (test files block added). The tracking item itself is stale. Scored 50/100 confidence.
- [ ] **Add globalThis.self teardown in sorting-worker.test.js** — `globalThis.self` is set at module top-level without afterAll cleanup. While Vitest isolates each file in its own worker, adding teardown is defensive best practice. Scored 25/100 confidence.

### [2026-03-13] From: TASK-014 (Playwright E2E tests)

- [ ] **Test E2E suite on Unix/macOS** — `getElectronWrapperPath()` and `getLaunchArgs()` have Unix branches (using node + CJS wrapper) but were only tested on Windows. Needs CI matrix or manual Mac/Linux validation.
- [ ] **Auto-detect playwright-core loader.js path in rdp-preload.cjs** — Currently hardcoded to `node_modules/playwright-core/lib/server/electron/loader.js`. A playwright-core upgrade that moves this file will break silently. Could use `require.resolve()` or glob.
- [ ] **Update ESLint header comment to reflect 9 file-group blocks** — Header says "Four JS environments" but the config now has 9 blocks after TASK-012, TASK-013, and TASK-014 additions. Also update corresponding CLAUDE.md section.

### [2026-03-18] From: code-review-pr-13
**Origin**: Code review of PR #13 (TASK-014 Playwright E2E tests)

- [ ] **Clear setTimeout in closeApp() on successful close** — `Promise.race` between `electronApp.close()` and a 5s timeout never clears the timer when close wins. Leaves Node event loop alive for 5 extra seconds per test teardown. Store timer ID and call `clearTimeout()` on success. Scored 75/100 confidence.
- [ ] **Register page.route() CDN stub before firstWindow() loads** — `page.route('**/unpkg.com/**', ...)` is registered after `firstWindow()` returns, but the synchronous `<script src>` in `<head>` has already dispatched the fetch. The stub is dead code. Move route registration earlier or use `electronApp.on('window', ...)` to intercept before load. Scored 75/100 confidence.
- [ ] **Remove or use waitForNotification() export** — `waitForNotification()` in `electron-app.js` is exported but never imported by any test file. Either remove it or add tests that use it. Scored 75/100 confidence.
- [ ] **Fix stale filename in electron-wrapper.cjs JSDoc** — Line 4 comment says `rdp-preload.js` but the actual file is `rdp-preload.cjs`. Scored 50/100 confidence.

### 2026-02-06 From: code-review-pr-3
**Origin**: Code review of PR #3

- [ ] Remove unnecessary loading state resets before recursive retry in showCompareMedia() — The validation retry path resets isLoading/mediaNavigationInProgress and hides spinner before recursive call, but the recursive call immediately re-enables them. This causes state churn and potential spinner flicker. Keep flags set during retries, only reset on final exit.

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
