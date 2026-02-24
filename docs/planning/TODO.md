# TODO

Active tasks and backlog.

**Last Updated**: 2026-02-24 <!-- TASK-005 -->


**Purpose**: Tracks PLANNED and IN-PROGRESS tasks only.
**Completed tasks**: Move to [DONE.md](DONE.md)
**Unprioritized ideas**: See [BACKLOG.md](BACKLOG.md)
**Task format reference**: [todo-task.md](../../../.claude/TEMPLATES/todo-task.md)

---

## 🔄 In Progress

<!-- Currently active tasks. Limit to 1-3 at a time. -->

<!-- TASK-001 completed 2026-02-05, moved to DONE.md -->

---

## 📋 Planned

<!-- Defined tasks ready to start. Ordered by priority: 🔴 → 🟠 → 🟡 → 🟢 -->

<!-- TASK-002 completed 2026-02-05, moved to DONE.md -->
<!-- TASK-003 completed 2026-02-06, moved to DONE.md -->
<!-- TASK-004 completed 2026-02-06, moved to DONE.md -->
<!-- TASK-005 completed 2026-02-24, moved to DONE.md -->

### [TASK-006] Unified fullscreen exit cleanup method
**Priority**: 🟡 Medium
**Status**: 📋 Planned
**Effort**: S
**Origin**: [docs/archive/plans/2025-12-29_video-fullscreen-toggle.md](../archive/plans/2025-12-29_video-fullscreen-toggle.md)

**Description**: Multiple exit paths (click, ESC, Z/X keys) each handle cleanup independently. A single `cleanupFullscreen()` method could centralize indicator removal, handler cleanup, and playback restoration.

**Acceptance Criteria**:
- [ ] Single `cleanupFullscreen()` method for all exit paths
- [ ] Indicator removal, handler cleanup, playback restoration centralized
- [ ] All exit methods (click, ESC, Z/X) use the unified cleanup

---

### [TASK-007] Force re-sort option for similarity sorting
**Priority**: 🟡 Medium
**Status**: 📋 Planned
**Effort**: S
**Origin**: [docs/archive/plans/2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)

**Description**: Allow user to discard cached sort results and re-sort from scratch. Useful when user wants fresh sort after significant changes to folder.

**Acceptance Criteria**:
- [ ] UI option (button or modifier key) to force re-sort
- [ ] Bypasses cache and performs full sort algorithm
- [ ] Clear notification that fresh sort is being performed

---

### [TASK-008] Cache age display in sorting notification
**Priority**: 🟢 Low
**Status**: 📋 Planned
**Effort**: S
**Origin**: [docs/archive/plans/2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)

**Description**: Show when sort cache was created in the sorting notification. Helps user decide if cache is fresh enough or needs re-sort.

**Acceptance Criteria**:
- [ ] Notification shows cache age (e.g., "Using cached order from 2 hours ago")
- [ ] Human-readable time format (minutes/hours/days ago)

---

### [TASK-009] Worker count setting for feature extraction
**Priority**: 🟢 Low
**Status**: 📋 Planned
**Effort**: S
**Origin**: [docs/archive/plans/2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)

**Description**: Let user configure number of feature extraction workers. Currently hardcoded to 4 workers.

**Acceptance Criteria**:
- [ ] Setting in UI to configure worker count (1-8)
- [ ] Setting persisted in localStorage
- [ ] Worker pool respects user setting on initialization

---

### [TASK-010] Estimated time remaining for feature extraction
**Priority**: 🟢 Low
**Status**: 📋 Planned
**Effort**: M
**Origin**: [docs/archive/plans/2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)

**Description**: Show ETA during background feature extraction. Improves user experience for large folders.

**Acceptance Criteria**:
- [ ] Calculate extraction rate (files per second)
- [ ] Display estimated time remaining in progress indicator
- [ ] Update estimate as extraction progresses

---

### [TASK-011] Pause extraction when user is navigating
**Priority**: 🟢 Low
**Status**: 📋 Planned
**Effort**: M
**Origin**: [docs/archive/plans/2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)

**Description**: Reduce CPU contention by pausing feature extraction when user is actively navigating media. Resume after navigation idle period.

**Acceptance Criteria**:
- [ ] Detect active navigation (keyboard/mouse input)
- [ ] Pause extraction during navigation
- [ ] Resume after ~2 second idle period
- [ ] No visible lag during navigation

---

## ⏸️ Blocked

<!-- Tasks waiting on external dependencies or decisions -->

---

## 🔀 Spawned

<!-- Tasks generated from completed work. Include origin for traceability. -->

---

## Notes

- Tasks grouped by status, sorted by priority within each group
- When a task reaches ✅ Done: remove from here, add to [DONE.md](DONE.md)
- Significant tasks should have a plan in `docs/planning/plans/`
- New ideas without clear priority go to [BACKLOG.md](BACKLOG.md)
