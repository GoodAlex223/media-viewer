# TODO

Active tasks and backlog.

**Last Updated**: 2026-03-27 <!-- TASK-026 completed -->


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

---

### TASK-027 — Fix undo when no media remains in folder 🟡
**Priority**: 🟡 Normal
**Effort**: Low
**Origin**: Manual testing 2026-03-19

**Description**: Undo previous action (Ctrl+Z) does not work when no media files remain in the folder.

**Reported Issue** (original Russian preserved):
> Не работает отмена предыдущего действия, если в папке не осталось медиа

**Merges with BACKLOG**: "Centralized insertFileIntoList() counterpart" (from centralized-remove-file) — undo restoration path

**Acceptance Criteria**:
- [ ] Undo works even when mediaFiles[] is empty
- [ ] File restored to list and displayed after undo
- [ ] Drop zone hidden, media view restored
- [ ] Works in both single and compare mode

---

### TASK-028 — 🔍 Research: open source media content understanding tools 🟡
**Priority**: 🟡 Normal — Research task
**Effort**: Low (research only)
**Origin**: Manual testing 2026-03-19

**Description**: Investigate whether open source tools exist for understanding what is depicted in media (photos, videos). Evaluate if these could improve ML prediction quality.

**Reported Issue** (original Russian preserved):
> Ответить на вопрос: Есть ли в опен сорсе инструменты для определения что изображено, что происходит в медиа (фото, видео и др)? Можно ли это использовать при оценке вероятности того или иного медиа?

**Investigation Areas**:
- Image classification models (CLIP, ViT, ResNet) — can run locally?
- Video understanding (scene classification, action recognition)
- Electron/Node.js compatibility (ONNX Runtime, TensorFlow.js)
- Integration with existing 64-dim feature vector pipeline
- Performance: can these run on consumer hardware without GPU?
- Privacy: all processing must be local (no cloud APIs)

**Acceptance Criteria**:
- [ ] Survey of available open source tools with pros/cons
- [ ] Feasibility assessment for Electron desktop app integration
- [ ] Performance estimates for typical media collections
- [ ] Recommendation: worth pursuing or not, and why
- [ ] Document findings in docs/planning/ for future reference

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
