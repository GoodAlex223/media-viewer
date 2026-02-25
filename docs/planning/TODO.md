# TODO

Active tasks and backlog.

**Last Updated**: 2026-02-25 <!-- TASK-007 completed -->


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

### [TASK-012] Pre-commit hooks with linting and formatting
**Priority**: 🟡 Medium
**Status**: 📋 Planned
**Effort**: M

**Description**: Set up pre-commit hooks using Husky + lint-staged. Add ESLint for code quality and Prettier for formatting. Currently no linting or formatting is configured — all code quality is manual.

**Acceptance Criteria**:
- [ ] Husky installed and configured with pre-commit hook
- [ ] ESLint configured with rules appropriate for Electron/browser JS (no modules)
- [ ] Prettier configured for consistent formatting
- [ ] lint-staged runs ESLint + Prettier on staged files only
- [ ] npm scripts: `lint`, `lint:fix`, `format`
- [ ] Existing code passes lint (fix or suppress existing violations)
- [ ] Pre-commit hook blocks commits with lint errors

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
