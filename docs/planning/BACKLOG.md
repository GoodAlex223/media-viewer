# Backlog

Ideas and tasks not yet prioritized for active development.

**Last Updated**: 2026-02-05

**Purpose**: Holding area for unprioritized ideas and future work.
**Active tasks**: See [TODO.md](TODO.md)
**Completed work**: See [DONE.md](DONE.md)
**Strategic direction**: See [ROADMAP.md](ROADMAP.md)

---

## Feature Ideas

### Sorting & ML

| Idea | Description | Value | Effort | Source |
|------|-------------|-------|--------|--------|
| Force re-sort option | Allow user to discard cached sort and re-sort from scratch | Medium | Low | Plan: 2025-12-27_sorting-cache |
| Worker count setting | Let user configure number of extraction workers | Low | Low | Plan: 2025-12-28_background-feature-extraction |
| Estimated time remaining for extraction | Show ETA during feature extraction | Medium | Medium | Plan: 2025-12-28_background-feature-extraction |

---

## Enhancements

Improvements to existing functionality.

| Enhancement | Area | Value | Effort | Notes |
|-------------|------|-------|--------|-------|
| Cache age display in sorting notification | Sorting | Low | Low | Plan: 2025-12-27_sorting-cache |
| Pause extraction when user is navigating | ML/Perf | Medium | Medium | Plan: 2025-12-28_background-feature-extraction |
| Validation in showCompareMedia() for file existence | Compare | Medium | Low | Plan: 2026-01-02_compare-mode-ai-sort-bug |
| Anonymize author field in package.json if privacy desired | Config | Low | Low | Security audit: 2026-02-05 |
| Memory leak guard for exitHandler | Fullscreen | Medium | Low | Plan: 2025-12-29_video-fullscreen-toggle |
| Unified fullscreen exit cleanup method | Fullscreen | Medium | Low | Plan: 2025-12-29_video-fullscreen-toggle |
| Click/active effect for control buttons | UI | Medium | Low | Plan: 2026-02-05_visual-scale-controls |
| Keyboard shortcut for zoom toggle | UI | Low | Low | Plan: 2026-02-05_visual-scale-controls |
| Zoom level persistence across navigation | UI | Low | Medium | Plan: 2026-02-05_visual-scale-controls |
| Fix mouseup listener leak in createZoomPopover | Zoom | Medium | Low | Code review: PR #1 |
| Document fullscreen zoom reversal from TASK-001 | Zoom/UX | Low | Low | Code review: PR #1 |

---

## Technical Debt

Known issues that should be addressed eventually.

| Item | Impact | Effort | Added |
|------|--------|--------|-------|
| Centralized removeFile() method | Medium | Medium | 2026-01-02 |
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

- [ ] Force re-sort option — Allow discarding cached results
- [ ] Cache age display — Show when cache was created in sorting notification

### 2025-12-28 From: background-feature-extraction
**Origin**: [2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)

- [ ] Worker count setting — User-configurable extraction parallelism
- [ ] Estimated time remaining — Show ETA during feature extraction
- [ ] Pause extraction when navigating — Reduce CPU contention

### 2025-12-29 From: video-fullscreen-toggle
**Origin**: [2025-12-29_video-fullscreen-toggle.md](../archive/plans/2025-12-29_video-fullscreen-toggle.md)

- [ ] Memory leak guard for exitHandler — Clean up click handler when fullscreen exited via ESC/keyboard
- [ ] Unified fullscreen exit cleanup — Centralize indicator removal, handler cleanup, and playback restoration

### 2026-01-02 From: compare-mode-ai-sort-bug
**Origin**: [2026-01-02_compare-mode-ai-sort-bug.md](../archive/plans/2026-01-02_compare-mode-ai-sort-bug.md)

- [ ] Centralized removeFile() method — Consolidate file removal logic
- [ ] Validation in showCompareMedia() — Check file existence before display

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
