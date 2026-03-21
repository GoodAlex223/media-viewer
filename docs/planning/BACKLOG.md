# Backlog

Ideas and tasks not yet prioritized for active development.

**Last Updated**: 2026-03-20 <!-- code-review-pr-16 -->

**Purpose**: Holding area for unprioritized ideas and future work.
**Active tasks**: See [TODO.md](TODO.md)
**Completed work**: See [DONE.md](DONE.md)
**Strategic direction**: See [ROADMAP.md](ROADMAP.md)

---

## From Completed Tasks

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

- [ ] Extract setupFullscreen(wrapper) from toggleFullscreen() enter branch — The enter branch is 55 lines. Extracting to a symmetric `setupFullscreen(wrapper)` alongside `cleanupFullscreen(wrapper)` would improve readability and make the enter/exit symmetry explicit.

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

### 2026-02-06 From: code-review-pr-3
**Origin**: Code review of PR #3

- [x] Remove unnecessary loading state resets before recursive retry in showCompareMedia() — Promoted to TODO: TASK-022 (merged into last-pair error fix)

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
