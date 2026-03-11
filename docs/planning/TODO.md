# TODO

Active tasks and backlog.

**Last Updated**: 2026-03-11 <!-- TASK-012 completed -->


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
<!-- TASK-006 completed 2026-02-24, moved to DONE.md -->
<!-- TASK-007 completed 2026-02-25, moved to DONE.md -->
<!-- TASK-008 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-009 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-010 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-011 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-012 completed 2026-03-11, moved to DONE.md -->

---

### [TASK-013] Unit test infrastructure and initial tests
**Priority**: 🟡 Medium
**Status**: 📋 Planned
**Effort**: L

**Description**: Set up unit test framework and write initial tests for core logic. Currently no tests exist (`npm test` is a no-op). Target testable pure functions first: sorting algorithms (sorting-worker.js), ML model (ml-model.js), feature extraction logic, and utility methods in MediaViewer (e.g., removeFileFromList, index management).

**Acceptance Criteria**:
- [ ] Test framework installed and configured (Vitest or Jest)
- [ ] npm `test` script runs test suite
- [ ] Tests for sorting-worker.js (MST algorithm, similarity comparisons)
- [ ] Tests for ml-model.js (prediction, training)
- [ ] Tests for MediaViewer utility methods (removeFileFromList, index wrap/cap behavior)
- [ ] Tests for file validation logic (showCompareMedia edge cases)
- [ ] Minimum 20 test cases covering core logic
- [ ] Pre-commit hook runs tests (depends on TASK-012)

---

### [TASK-014] Playwright E2E tests for Electron app
**Priority**: 🟢 Low
**Status**: 📋 Planned
**Effort**: L

**Description**: Set up Playwright with Electron support for end-to-end testing. Cover critical user workflows: folder loading, media navigation, rating/moving files, fullscreen toggle, compare mode, and zoom controls.

**Acceptance Criteria**:
- [ ] Playwright configured with Electron launcher
- [ ] npm script: `test:e2e`
- [ ] Test: App launches and shows drop zone / folder picker
- [ ] Test: Load folder and navigate media (arrow keys, click)
- [ ] Test: Rate file (like/dislike) and verify file moved
- [ ] Test: Toggle fullscreen and exit via ESC
- [ ] Test: Switch to compare mode and back
- [ ] Test: Zoom controls open/close and slider adjusts scale
- [ ] Tests use fixture folders with sample media files
- [ ] CI-compatible (headless mode)

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
