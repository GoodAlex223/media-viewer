# TODO

Active tasks and backlog.

**Last Updated**: 2026-05-05 <!-- 3 issues from manual testing added to Planned -->


**Purpose**: Tracks PLANNED and IN-PROGRESS tasks only.
**Completed tasks**: Move to [DONE.md](DONE.md)
**Unprioritized ideas**: See [BACKLOG.md](BACKLOG.md)
**Task format reference**: [todo-task.md](../../../.claude/TEMPLATES/todo-task.md)

---

## 🔄 In Progress

<!-- Currently active tasks. Limit to 1-3 at a time. -->

<!-- TASK-020 completed 2026-03-21, moved to DONE.md -->
<!-- TASK-001 completed 2026-02-05, moved to DONE.md -->

---

## 📋 Planned

<!-- Defined tasks ready to start. Ordered by priority: 🔴 → 🟠 → 🟡 → 🟢 -->

<!-- Compare Mode Fix completed 2026-04-10, moved to DONE.md -->

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
<!-- TASK-013 completed 2026-03-12, moved to DONE.md -->
<!-- TASK-014 completed 2026-03-13, moved to DONE.md -->
<!-- TASK-015 completed 2026-03-20, moved to DONE.md -->
<!-- TASK-016 completed 2026-03-20, moved to DONE.md -->
<!-- TASK-017 completed 2026-03-20, moved to DONE.md -->
<!-- TASK-018 completed 2026-03-20, moved to DONE.md -->
<!-- TASK-019 completed 2026-03-21, moved to DONE.md -->


<!-- TASK-020 moved to In Progress -->
<!-- TASK-021 completed 2026-03-22, moved to DONE.md -->

<!-- TASK-022 completed 2026-03-22, moved to DONE.md -->

<!-- TASK-023 completed 2026-03-23, moved to DONE.md -->

<!-- TASK-024 completed 2026-03-25, moved to DONE.md -->

<!-- TASK-025 completed 2026-03-26, moved to DONE.md -->

<!-- TASK-026 completed 2026-03-27, moved to DONE.md -->

<!-- TASK-027 completed 2026-04-03, moved to DONE.md -->

<!-- TASK-028 completed 2026-04-07, moved to DONE.md -->

<!-- Group D CLIP Similarity Sorting completed 2026-04-18, moved to DONE.md -->

#### Like-probability not displayed after undo
**Priority**: 🟠 High
**Status**: 📋 Planned
**Effort**: S
**Origin**: manual testing (2026-05-05)

**Description**: After undoing the last ratings via `handleCancel()`, the prediction percentage badge no longer displays for the restored media. The undo path restores the file entry to `mediaFiles` but does not re-trigger `requestPredictionScores()`, so the badge stays missing until a manual sort or folder reload.

(Russian original: "После отмены последних оценок процент(вероятность) лайка не показывается")

**Acceptance Criteria**:
- [ ] After undo, the restored file shows its prediction percentage in single mode
- [ ] After compare-pair undo, both restored files show their percentages
- [ ] No regression in normal nav/rating prediction display

**Context**:
- **Files Affected**: [media-viewer.js:3340](media-viewer.js#L3340) (`handleCancel`), [media-viewer.js:6135](media-viewer.js#L6135) (`requestPredictionScores`)

#### Prediction percentages misaligned after similarity-sort cancel + AI sort
**Priority**: 🟠 High
**Status**: 📋 Planned
**Effort**: M
**Origin**: manual testing (2026-05-05)

**Description**: After canceling Sort-by-Similarity then enabling AI sort order, percentages display in descending value but mismatched with the underlying media (e.g., displayed "99% / 56%, 98% / 55%, 97% / 54%" rather than the correct alignment "99% / 54%, 98% / 55%, 97% / 56%"). Suggests the sort-cancel restore branch in `handleSortByPrediction()` does not actually re-apply the prediction order to media positions, or the badge mapping is stale relative to `mediaFiles[]`.

(Russian original: "Не сбрасывается индикатор(процент) или сам порядок(т.е. показывается в убывающем порядке напр. \"99%\"\"56%\", \"98%\"\"55%\", \"97%\"\"54%\", хотя должно быть \"99%\"\"54%\", \"98%\"\"55%\", \"97%\"\"56%\" в соответсвии с медиа), если отменяется сортировка по схожести и включается порядок ИИ сортировки. По ощущениям, не сбрасывается порядок")

**Acceptance Criteria**:
- [ ] Reproduce: cancel similarity sort, click AI sort → prediction percentage on each media matches the underlying file's actual score
- [ ] Add unit test (or fixture-driven check) covering cancel-similarity → AI-sort transition
- [ ] Verify no double-sorting or score-stale state remains

**Context**:
- **Files Affected**: [media-viewer.js:6271-6291](media-viewer.js#L6271-L6291) (`handleSortByPrediction` restore branch — filters `originalMediaFiles` but does not re-trigger `requestPredictionScores()` or rebuild badge mapping); similarity-sort cancel path interaction

#### Tournament-style compare mode (winner advances, loser tagged with win count)
**Priority**: 🟡 Medium
**Status**: 📋 Planned
**Effort**: L
**Origin**: manual testing (2026-05-05) — user-flagged "implement as soon as possible"

**Description**: New compare mode where the user picks one media (left or right); the winner advances to the next pairing, and the loser is either (a) recorded with a "won-against count" attribute, or (b) moved to a destination folder grouped with other losers of the same win count. Tournament-style elimination ranking — orthogonal to existing like/dislike rating.

(Russian original: "ПРИКОЛЬНО РЕАЛИЗОВАТЬ КАК МОЖНО РАНЬШЕ Режим, где если пользователь выбрал одно медиа(левое или правое), то оно переходит в следующее сравнение, а то что не выграло, либо записывается со значением \"сколько медиа оно победило\" или переносится в соответсвующую папку(к другим проигравшим, но с таким же количеством побед в сравнениях)")

**Acceptance Criteria**:
- [ ] Spec written and approved before implementation (tournament bracket vs. swiss-style vs. single-elimination — pick approach)
- [ ] Mode toggle in UI alongside single/compare
- [ ] Winner-advances pair selection logic distinct from `mlComparePairIndex`
- [ ] Per-file `winCount` tracked and persisted (or grouped-folder placement on disk)
- [ ] Undo restores both files and decrements win count
- [ ] E2E test for full tournament flow

**Context**:
- **Files Affected**: [media-viewer.js](media-viewer.js) (new compare-pair selection alongside `showCompareMedia` ~L2451+, `handleLeftLike`/`handleRightLike` family), possibly [main.js](main.js) (folder grouping IPC), [index.html](index.html), [styles.css](styles.css)
- **Open Questions**: Win-count attribute (sidecar JSON?) vs. folder-grouping on disk? When does a tournament "end" — fixed rounds, until one survivor, or user-stops? Interaction with like/dislike (separate state vs. unified)?

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
