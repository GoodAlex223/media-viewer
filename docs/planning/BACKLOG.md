# Backlog

Ideas and tasks not yet prioritized for active development.

**Last Updated**: 2026-02-06

**Purpose**: Holding area for unprioritized ideas and future work.
**Active tasks**: See [TODO.md](TODO.md)
**Completed work**: See [DONE.md](DONE.md)
**Strategic direction**: See [ROADMAP.md](ROADMAP.md)

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
