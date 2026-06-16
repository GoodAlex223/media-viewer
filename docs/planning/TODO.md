# TODO

Active tasks and backlog.

**Last Updated**: 2026-06-16 <!-- Group CW-3: Docs & backlog hygiene complete -->


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

<!-- Group B Mode-switch display bugs (AI-sort→single first-media desync + compare-mode
     folder-switch stale wrappers) completed 2026-06-09, moved to DONE.md.
     Plan archived: docs/archive/plans/2026-06-08-mode-switch-display-bugs.md
     Spec: docs/superpowers/specs/2026-06-08-mode-switch-display-bugs-design.md
     Resolution: chose fix path (a) — compare→single resolves currentIndex from the
     on-screen compareLeftFile at switch time (Open Question answered: "first" = the file
     the user was looking at). 294/294 unit tests; E2E 41/42 (1 known pre-existing fail). -->

<!-- Group C CLIP extraction UX (starting-extraction toast + CLIP toggle-on kickoff)
     completed 2026-06-10, moved to DONE.md.
     Plan archived: docs/archive/plans/2026-06-10-clip-extraction-ux.md
     Spec: docs/superpowers/specs/2026-06-10-clip-extraction-ux-design.md
     296/296 unit tests; E2E 42/43 (1 known pre-existing #viewModeBtn fail). -->

<!-- Group D Security & privacy audit (verify no secrets in git history + anonymize
     package.json author) completed 2026-06-11, moved to DONE.md.
     Result: ✅ PASS — no secrets; author already anonymized (no change).
     Report: docs/security/2026-06-11-security-privacy-audit.md
     Plan archived: docs/archive/plans/2026-06-11-security-privacy-audit.md
     Spec: docs/superpowers/specs/2026-06-11-security-privacy-audit-design.md
     297/297 unit tests; E2E skipped (no JS changes). -->

<!-- Group CW-5 Progressive animated-JXL decode (frame-0-first) completed 2026-06-12,
     moved to DONE.md. Worker streams meta/frame/done; decodeJxl resolves at frame 0;
     startJxlAnimation loops once whenComplete buffers; static frame-0 fallback on
     mid-stream error. Plan archived: docs/archive/plans/2026-06-12-jxl-progressive-decode.md
     Spec: docs/superpowers/specs/2026-06-12-jxl-progressive-decode-design.md
     297→310 unit tests; JXL E2E smoke pass; full E2E 42/43 (known #viewModeBtn fail). -->

<!-- Group CW-1 Renderer correctness guards (batch of 7 defensive fixes from PR reviews
     #34/#38/#40/#41/#42/#45 + Group A/B impl-review + Group E) completed 2026-06-14,
     moved to DONE.md. clipCache clear, tournament isLoading guards, <2-files
     exitTournamentMode (both sites), handleCancel compareMode guard + null media refs,
     clipWorkerReady reset (_handleClipUnloadTimer + CLIP_UNLOAD_DELAY_MS),
     feature-cache-write-chunk local-capture, JXL error-path trio (decode timeout +
     init-error + bail toast). 14 constituent BACKLOG entries checked off.
     Plan archived: docs/archive/plans/2026-06-13-cw-1-renderer-correctness-guards.md
     Spec: docs/superpowers/specs/2026-06-13-cw-1-renderer-correctness-guards-design.md
     310→326 unit tests; lint clean; E2E 42/43 (known #viewModeBtn fail, owned by CW-2). -->

<!-- Group CW-2 Test backfill (E2E suite green + first tournament-mode coverage)
     completed 2026-06-15, moved to DONE.md. Test-only: no production code changed.
     Part 1: app-launch.test.js #viewModeBtn→#modeSelector (fixes the 1 known-red) +
     afterEach guard. Part 2: new tests/e2e/tournament-mode.test.js (5 hybrid-driven
     tests: happy-path Apply→_Tier-N, Both Win, Both Lose, Ctrl+A undo, leave-Save/
     Continue-resume). Part 3: recordDraw filesSnapshot + pre-undo pair.right assertions.
     Plan archived: docs/archive/plans/2026-06-15-cw-2-test-backfill.md
     Spec: docs/superpowers/specs/2026-06-15-cw-2-test-backfill-design.md
     326 unit (unchanged case count); E2E 42/43→48/48 (suite green). 5 BACKLOG entries
     checked off; 3 follow-ups filed (🟤 [2026-06-15]). -->

<!-- Group CW-3 Docs & backlog hygiene completed 2026-06-16, moved to DONE.md.
     Docs-and-config-only: no JS changed; 326/326 unit unchanged; E2E skipped (no JS).
     Task 1: BACKLOG stale-checkbox sweep — 7 git-verified flips (CLIP-extraction-UX PR #45,
     Pin Lucide CDN Group F, CLIP similarity sort Group D, CLIP unload + logger double-init
     Group E, regression-checker FullscreenManager Group F) + corrected the PR #37 stale-SHA
     trap (853e1ee→52f2cbc); recount 153 unchecked 🟤. Task 2: doc bundle — tournament hash
     6c73f9f→acfc3b6, kickoff 8→11 cases, 2 README orphan-ref rows, waitForTimeout dup tag,
     Group D spec sort_cache_clip fix (several spec-listed items already done — no-ops).
     Task 3: cruft — git rm 4 docker files + duplicate !.claude/agents/; ⚠️ .gitignore nul
     line KEPT (load-bearing — suppresses Windows NUL-device phantom; documented, user-approved).
     8 BACKLOG entries checked off; CW-4 .gitignore boundary recorded.
     Plan archived: docs/archive/plans/2026-06-16-cw-3-docs-backlog-hygiene.md
     Spec: docs/superpowers/specs/2026-06-16-cw-3-docs-backlog-hygiene-design.md
     Branch cleanup/cw-3-docs-backlog-hygiene; PR pending (docs-only → manual review). -->

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
