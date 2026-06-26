# TODO

Active tasks and backlog.

**Last Updated**: 2026-06-25 <!-- Group P3 (feature-extraction timing) IMPLEMENTED on branch feature/extraction-timing (lazy/on-demand; 4 tasks, reviews Approved, opus final "Ready to merge: Yes", 381 unit) — item annotated, kept OPEN pending manual 24k smoke + merge. Prior: 2026-06-20 Group P1 PR1 ("sort responsiveness core") MERGED via PR #54 (merge 7b78a56, branch deleted; manual 24k smoke PASSED; /code-review "No issues found"); P1 24k-sort item annotated as PR1-of-3 (PR2 hash-off-thread + PR3 cache-load remain), kept OPEN. Prior: 2026-06-18 Manual-testing intake +4 🔴 large-folder (24k) perf items + promoted 🟠 feature-extraction-timing into Planned -->


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

<!-- [2026-06-18] Manual-testing intake — large-folder (24k+) performance, split from one user report (origin: manual testing). User priority: "speed these up first." -->

<!-- [2026-06-19] Decomposed (brainstorm → spec → plan) into 3 staged PRs under a strict no-quality-change constraint (user: "quality must not change at all"):
       PR1 "sort responsiveness core" — ✅ MERGED 2026-06-20 via PR #54 (merge 7b78a56, branch deleted); manual 24k smoke PASSED 2026-06-19; /code-review "No issues found" (+2 🟤 follow-ups).
            Determinate cancelable progress card (Option C) + worker O(n²) MST-fallback → vpTree.findNearest (quality-locked) + insertNewFilesInSortedOrder event-loop yielding (closed BACKLOG 🟤 2026-05-24) + dead-code removal (631 lines). 345→357 unit. Final review (opus) "With fixes" (Minor fixed in d19d252).
            Spec: docs/superpowers/specs/2026-06-19-sort-responsiveness-core-design.md  Plan: docs/archive/plans/2026-06-19-sort-responsiveness-core.md
       PR2 "hash computation off the renderer main thread" — REMAINING (biggest cold-cache freeze; separate spec/plan).
       PR3 "incremental feature-cache load (~40s)" — REMAINING (closes BACKLOG 🟤 2026-05-26).
     NOTE: PR1 made the sort non-freezing/transparent/cancelable but, being quality-locked, did NOT reduce the core O(n·K) neighbor-graph build time — raw-speed wins are PR2/PR3 (+ deferred #7 parallel build). Item stays 🔴 OPEN until all 3 land (PR1 smoke passed 2026-06-19; PR1 MERGED 2026-06-20 via PR #54). -->

- [ ] 🔴 **Speed up AI / similarity sorting on large folders (24k+ files)** — *[PR1 of 3 MERGED 2026-06-20 (PR #54, merge 7b78a56, smoke PASSED 2026-06-19); PR2 (hash off-thread) + PR3 (cache-load) remain — see comment above]* — AI-prediction and visual-similarity sorts run very slowly and opaquely on 24000+ file folders: the neighbor-graph build is O(n·K) (K ≈ √n·10 neighbors per file) with an O(n²) MST/greedy fallback, and there is no progress/cancel affordance. Reduce complexity (cap neighbors, chunk + yield to the event loop, push more work into the worker) and add progress/cancel UX (русский оригинал: Очень медленно и не понятно работает с большими папками (24000+ файлов) ИИ сортировка. Сначала нам нужно постараться максимально ускорить эти функции.); affected: `sorting-worker.js:~596-752`, `media-viewer.js:~5992-6120` [possible-dup-of: Event-loop yielding in insertNewFilesInSortedOrder for pathological cases — BACKLOG 2026-05-24 (RESOLVED by PR1); Incremental feature-cache serving ~40s blocking load — BACKLOG 2026-05-26 (→ PR3)]
- [x] 🔴 **Speed up tournament launch & resume/continuation on large folders (24k+ files)** — ✅ **DONE 2026-06-24** (Group P2; MERGED 2026-06-25 via PR #55, merge `51366cb`; manual 24k smoke PASSED) — slim `version:2` history-free payload (O(n) read) + O(n) consumed-marker `_buildRoundPairings` + prebuilt path→index `Map`. See [DONE.md](DONE.md) 2026-06-24. _Original:_ Starting or continuing (resuming) a tournament over 24000+ files is very slow and confusing: full-state (de)serialization to `.tournament_state.json` plus O(n²) Swiss `_buildRoundPairings` at init/resume, and dual O(n) `findIndex` per pair display. Stream/defer the pairing build, memoize pairings, and replace path→index `findIndex` with a prebuilt Map (русский оригинал: Очень медленно и не понятно работает с большими папками (24000+ файлов) запуск Турнира (продолжение).); affected: `tournament-engine.js:~63-152`, `tournament.js:~120`, `media-viewer.js:~4426-4479` [possible-dup-of: Incremental feature-cache serving ~40s blocking load — BACKLOG 2026-05-26]
- [x] 🔴 **Speed up media rating (pick → next pair) in tournament mode** — ✅ **DONE 2026-06-24** (Group P2; MERGED 2026-06-25 via PR #55, merge `51366cb`; manual 24k smoke PASSED) — debounced single-flight persistence (next pair no longer waits on disk) + cached path→index `Map`. Closes the canonical BACKLOG 🔵 [2026-06-18] entry. See [DONE.md](DONE.md) 2026-06-24. _Original:_ Rating media in tournament mode is much slower than compare mode; every pick triggers a synchronous full-state disk write + O(n²) re-pairing + dual O(n) `findIndex` before the next pair renders, while compare mode does none of that. Make state persistence async/debounced and cache path→index lookups (русский оригинал: Также медленно работает оценка медиа в турнир моде (в compare mode работает намного быстрее).); affected: `media-viewer.js:~4684`, `tournament.js:~120`, `tournament-engine.js:~96-152`, `main.js:~238` [possible-dup-of: Speed up tournament-mode pair changing — BACKLOG 2026-06-18]
- [x] 🔴 **Speed up "Save & leave" in tournament mode** — ✅ **DONE 2026-06-24** (Group P2; MERGED 2026-06-25 via PR #55, merge `51366cb`; manual 24k smoke PASSED) — Save & leave now `flush()`es the already-coalesced debounced write (one small O(n) write, no growing full-history re-serialize). See [DONE.md](DONE.md) 2026-06-24. _Original:_ The "Save & leave" action re-serializes and writes the entire tournament state to disk before exiting, which is slow on large tournaments and largely redundant since state is already persisted on every pick. Reuse the already-persisted state, or write incrementally/async (русский оригинал: «Save & leave» опция работает медленно; "Сначала нам нужно постараться максимально ускорить эти функции".); affected: `media-viewer.js:~4380-4422` (Save handler), `tournament.js:~120` (`_persistState`)

<!-- [2026-06-18] Promoted from BACKLOG [2026-05-30] (re-reported during manual testing) -->

- [x] 🟠 **Smarter timing for background feature extraction (don't always start on folder open)** — ✅ **DONE 2026-06-26** (Group P3, branch `feature/extraction-timing`; 4-task subagent-driven run, every per-task review Approved + final whole-branch review opus "Ready to merge: Yes"; 381 unit; **manual 24k smoke PASSED 2026-06-26**). **Chosen strategy: pure lazy / on-demand** — removed both eager kickoffs (folder-open + CLIP toggle-on), CLIP semantic sort now self-extracts via the `clipVectorsNeedExtraction()` gate; ML "Sort by Prediction" was already lazy; hash sort needs no vectors. **MERGED 2026-06-26 via PR #56 (merge `9d65500`; branch deleted; pre-merge `/code-review` fix `cba5352` — stale E2E + 2 comments).** Spec [2026-06-25-extraction-timing-design.md](../superpowers/specs/2026-06-25-extraction-timing-design.md); plan [archived](../archive/plans/2026-06-25-extraction-timing.md); see [DONE.md](DONE.md) 2026-06-25. _Original:_ *Promoted to TODO 2026-06-18 (re-reported during manual testing; provenance in BACKLOG [2026-06-18]).* Feature extraction produces the 64-dim hand-crafted + 512-dim CLIP vectors used by AI-prediction sort and visual-similarity sort, so it can't be removed — only deferred. Today `kickoffBackgroundExtractionIfEnabled()` fires unconditionally on every `loadFolder()`, heavily loading the CPU on large folders even when the user never uses AI sort. Distinct from the [2026-05-03] "extraction-starting notification" item (that surfaces visibility; this decides *when* to extract). Options: (a) lazy — extract only on first click of an AI-dependent feature (Sort by Prediction, CLIP sort); (b) threshold — auto-extract on folder open only if N < `EXTRACTION_AUTO_LIMIT` (e.g. 500), else wait for explicit trigger; (c) settings toggle "Auto-extract on folder open" (default off for new users); (d) idle-only — start only after a quiet period (e.g. 60s idle). Trade-off: lazy means AI sort is slow the first time it's clicked on a big folder, but the app stays responsive (русский оригинал: Экстракшн фьючерс в каких случаях лучше запускать? Потому что он запускается при открытии папки, что нагружает компьютер, если медиа много в папке. / Для чего нужно feature extraction? Он замедляет показ медиа при открытии медиа. Может лучше перенести feature extraction со старта приложения туда, где он нужен?); affected: `media-viewer.js` (`kickoffBackgroundExtractionIfEnabled`, `loadFolder` call site, new settings toggle), Settings panel F1 in `index.html` + `styles.css`

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

<!-- Group CW-4 Process & security guards completed 2026-06-17, moved to DONE.md.
     Two preventive guards (3 SP, 🟡 Operational); subagent-driven (5 tasks, controller commits).
     Guard 1: scripts/check-secrets.js — pure scanForSecrets (5 markers, full-shape) + extractAddedLines
     (git diff --cached parser) + CLI behind require.main; wired first into .husky/pre-commit; new
     scripts/**/*.js ESLint block; no new dependency; self-reference-safe (concatenated fixtures). 12+6 tests.
     Guard 2: hardened tracked archive READMEs (docs/archive/plans + docs/planning/plans) — flip checkboxes,
     Status: Complete, index plans AND specs, verify cited SHAs are ancestors of main. (Global TEMPLATES/
     plan.md left untouched — gitignored/outside-repo.)
     326→344 unit; lint 0-err; both hook paths exercised; full-tree scan = zero real secrets; scope = 8 paths,
     no .gitignore. Final review (opus) "Ready to merge: Yes".
     Plan archived: docs/archive/plans/2026-06-17-cw-4-process-security-guards.md
     Spec: docs/superpowers/specs/2026-06-17-cw-4-process-security-guards-design.md
     Branch cleanup/cw-4-process-security-guards; PR pending. -->

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
