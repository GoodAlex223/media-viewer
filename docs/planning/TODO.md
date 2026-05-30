# TODO

Active tasks and backlog.

**Last Updated**: 2026-05-30 <!-- Manual testing batch: JXL viewer support (urgent) + AI-sort/single-mode first-media desync bug -->


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

<!-- Group B AI Prediction Display Bugs completed 2026-05-14, moved to DONE.md -->

<!-- Tournament Mode (Groups E + F) completed 2026-05-25; polish + feature-cache streaming
     pass completed 2026-05-26 (see DONE.md 2026-05-26). Plan archived:
     docs/archive/plans/2026-05-25-tournament-mode.md
     Spec: docs/superpowers/specs/2026-05-25-tournament-mode-design.md
     Acceptance criteria status:
       [x] Spec written and approved — Swiss-style chosen for v1; Bracket + RR documented as future strategies
       [x] Mode toggle in UI alongside single/compare — 3-way #modeSelector segmented control
       [x] Winner-advances pair selection — TournamentEngine + SwissStrategy in tournament-engine.js
       [x] Per-file winCount tracked + folder grouping — moves files to <source>/_Tier-{0..R}/
       [x] Undo restores both files (snapshot-based, per-session)
       [x] Strict/deterministic UX: canonical-order entry, sort disabled in-mode, mode-enter resume prompt
       [ ] E2E test for full tournament flow — DEFERRED to follow-up (BACKLOG 2026-05-26 / plan Phase H)
     Tests: 241/241 unit. -->

#### JXL + extended format viewer support
**Priority**: 🔴 Critical
**Status**: 📋 Planned
**Effort**: L

**Description**: The user produces files in JXL and other formats (defined in the sibling `C:\Users\alexm\Projects\media_compression` project — likely AVIF, WebP-lossless, HEIF, or similar) that the viewer currently cannot open. Marked urgent: blocks viewing files the user already has. JXL is the headline format — Chromium dropped native JPEG XL support in 2022, so an in-app decoder is required (WASM port of `libjxl`, e.g., `jxl-oxide-wasm` or the official `libjxl` WASM build). Other formats may already work via native Chromium decoders; needs an audit. (Необходимо срочно добавить поддержку jxl формата и других форматов, определенных в `C:\Users\alexm\Projects\media_compression`, чтобы я уже мог открывать их в приложении.)

**Acceptance Criteria**:
- [ ] Audit the format list in `media_compression`; enumerate which formats already render in Electron and which need a decoder
- [ ] Add JXL decoding path (WASM library evaluation: licence, bundle size, perf on large images, animated-JXL support)
- [ ] Update folder-scanning filter (`SUPPORTED_EXTENSIONS` / file-type detection in [main.js](../../main.js)) to include the new extensions
- [ ] Update preview rendering in [media-viewer.js](../../media-viewer.js) (`showSingleMedia` / `showCompareMedia`) — JXL goes through decode → Canvas → blob URL; native formats use the existing `<img>` path
- [ ] Feature extraction pipeline (hand-crafted features + CLIP embedding) must work on decoded JXL (likely via Canvas → ImageData path that already exists)
- [ ] Loading state during WASM decode (some JXL files are large; decode is non-trivial)
- [ ] Graceful fallback when decode fails (similar to CLIP graceful degradation)
- [ ] Tests: unit test for format detection; E2E smoke test with a fixture JXL file

**Context**:
- **Current**: Folder scan filters to a fixed list of natively-supported extensions; JXL and friends are silently excluded from `mediaFiles`
- **Proposed**: Extension list expanded; decode path branches by extension (native vs WASM); UI is format-agnostic
- **Files Affected**: [main.js](../../main.js) (extension filter, possibly file-type detection IPC), [media-viewer.js](../../media-viewer.js) (`showSingleMedia` / `showCompareMedia` decode branching, `loadMediaAsImageData` for feature extraction), [preload.js](../../preload.js) (potentially new IPC if WASM lives main-side), [package.json](../../package.json) (new dep), [index.html](../../index.html) (no expected changes unless preview chrome differs)
- **Open Questions**: Run WASM decoder in main process (IPC the decoded image back to renderer) or directly in renderer (bundle as inline WASM)? Animated JXL — out of scope for v1? Cross-reference with BACKLOG item "Lossless compression add-on" (same toolchain produces these files).

#### BUG: AI-sort + ratings + mode-switch shows different first media in single vs compare
**Priority**: 🔴 Critical
**Status**: 📋 Planned
**Effort**: M

**Description**: After Sort-by-Prediction, rating several pairs in compare mode, then switching to single mode, the first media displayed in single mode is a *different* file than the leftmost media that was being shown in compare mode just before the switch. The workaround — Restore Order, then re-apply Sort-by-Prediction — produces matching first media in both modes (as expected). (Я не понимаю почему после оценки нескольких пар после ИИ сортировки и при переключении в сингл мод первые в списке медиа в двух режимах отличаются. Если восстановить первый порядок (до ИИ сортировки), а потом снова использовать ИИ сортировку, то порядок в двух режимах становится одинаковым (как и ожидается).)

**Acceptance Criteria**:
- [ ] First media displayed after switching from AI-sorted compare → single mode matches the leftmost compare-mode file (or matches the user's expected definition of "first" — see Open Questions)
- [ ] Repro from the user's report no longer reproduces
- [ ] Unit or integration test covers the mode-switch path after compare-mode ratings in AI-sorted state
- [ ] No regression on Similarity-sorted or unsorted mode switches

**Context**:
- **Current**: Compare-mode pair selection in AI-sorted state uses `mlComparePairIndex` as an offset into the separate `filesWithScores` array (see [media-viewer.js:2720-2744](../../media-viewer.js#L2720-L2744)). After each rated pair, [`moveComparePair()` at media-viewer.js:4614](../../media-viewer.js#L4614) resets `mlComparePairIndex = 0` but only conditionally adjusts `currentIndex` (only when `currentIndex >= mediaFiles.length - 1`, see [media-viewer.js:4659-4661](../../media-viewer.js#L4659-L4661)). The mode-switch path `_applyModeSwitch()` then unconditionally sets `currentIndex = 0` at [media-viewer.js:3779](../../media-viewer.js#L3779) and displays `mediaFiles[0]`. Two indexing schemes operate on different array orderings: `mediaFiles` vs `filesWithScores`. Nothing reconciles them before single mode displays its "first" file.
- **Proposed**: Either (a) reconcile `currentIndex` to point at the file shown in the last compare pair when switching modes, or (b) keep both arrays in sync as ratings happen so `mediaFiles[0]` and `filesWithScores[mlComparePairIndex]` always agree, or (c) on entering single mode from AI-sorted compare, set `currentIndex` to the index of the last-displayed left file from `filesWithScores`. Decision depends on user intent — see Open Questions.
- **Files Affected**: [media-viewer.js](../../media-viewer.js) (`_applyModeSwitch` ~L3779, `moveComparePair` ~L4614, `showCompareMedia` ML-sorted branch ~L2720-2744, possibly `currentIndex` semantics across the codebase)
- **Open Questions**: When the user switches to single mode mid-rating, what should "first" mean — the file they were just looking at (left of last pair), the highest-predicted remaining file (`mediaFiles[0]` after AI sort), or the next-to-rate (the `filesWithScores[mlComparePairIndex]` they were headed toward)? The workaround behavior (restore + re-sort produces a consistent first) suggests the user expects mode-agnostic ordering — implies fix path (b) is closest to user intent.

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
