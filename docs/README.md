# Documentation Index

Central index for all project documentation.

## Active Documents

| Document                                 | Purpose                                      |
|------------------------------------------|----------------------------------------------|
| [TODO.md](planning/TODO.md)              | Active tasks and planned features            |
| [DONE.md](planning/DONE.md)              | Completed tasks archive                      |
| [BACKLOG.md](planning/BACKLOG.md)        | Unprioritized ideas and improvements         |
| [ROADMAP.md](planning/ROADMAP.md)        | Long-term vision and releases                |
| [GOALS.md](planning/GOALS.md)            | Objectives and success metrics               |
| [MILESTONES.md](planning/MILESTONES.md)  | Key targets with dates                       |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Project decisions, patterns, history         |
| [ARCHITECTURE.md](ARCHITECTURE.md)       | System architecture, component relationships |
| [MANUAL_TESTING.md](MANUAL_TESTING.md)   | Manual testing scenarios and checklists      |
| [WEEKLY.md](planning/WEEKLY.md)          | Weekly task schedule and daily breakdown      |
| [REVIEW-QUEUE.md](planning/REVIEW-QUEUE.md) | Cross-week state for the recurring Weekly Reviews batch |

## Planning Index

| Document                                           | Purpose                        |
|----------------------------------------------------|--------------------------------|
| [planning/README.md](planning/README.md)           | Planning workflow and overview  |
| [planning/plans/README.md](planning/plans/README.md) | Active implementation plans |

## Active Plans

| Document                    | Purpose                               |
|-----------------------------|---------------------------------------|
| [Video Fullscreen Toggle][] | Exit fullscreen on second video click |

[Video Fullscreen Toggle]: planning/plans/2025-12-29_video-fullscreen-toggle.md
[G4 Strategic-Doc Refresh Plan]: archive/plans/2026-07-12_g4-strategic-docs-refresh.md
[G1 Bulk-Rate Follow-ups Plan]: archive/plans/2026-08-29_g1-bulk-rate-followups.md

## Archived Plans

| Document                          | Purpose                                     |
|-----------------------------------|---------------------------------------------|
| [Notifications & Media Info][]    | Less intrusive notifications and media info |
| [Sorting Cache][]                 | Cache sorting algorithm results             |
| [Background Feature Extraction][] | Worker pool for parallel feature extraction |
| [Compare Mode AI Sort Bug][]      | Fix file mismatch in AI sorting mode        |
| [CLIP/ML Pipeline Cleanup Plan][] | CLIP/ML pipeline cleanup implementation     |
| [Compare Mode Fix Plan][]        | Compare mode folder-switch fix + DRY refactor |
| [Test Quality Plan][]            | E2E afterEach null guards + describe label rename |
| [CLIP Similarity Sorting Plan][] | CLIP cosine similarity MST-based sort algorithm |
| [Resource Management Plan][]    | CLIP model unload after extraction + logger double-init guard |
| [Group F Build & DX Plan][]     | Pin Lucide CDN with SRI + update regression-checker agent for FullscreenManager |
| [CLIP Sort Follow-ups Plan][]   | Algorithm-aware new-file insertion + CLIP toggle-off cache cleanup + sortMediaBySimilarityClip tests |
| [CLIP Extraction Silent Failure Plan][] | Wire `startBackgroundFeatureExtraction()` into `loadFolder()` via `kickoffBackgroundExtractionIfEnabled()` helper |
| [AI Prediction Display Bugs Plan][]    | Restore feature caches on undo + sortComplete propagates worker scores into predictionScores |
| [PR #33 Hygiene + Integration Tests Plan][] | Three defensive CLIP toggle/sort fixes + 3-test integration suite catching call-graph wiring bugs |
| [Tournament Mode Plan][]                     | Swiss-style tournament engine + TournamentManager + 3-way mode selector (Groups E + F) |
| [Planning Restructure Plan][]                | BACKLOG.md source-split (🔵 user / 🟡 ops / 🟤 auto) + pinned 📌 Process Rules + Vitest structural test + CLAUDE.md intake rules |
| [Re-rate Compare Correction Plan][]          | "Both good / Both bad" corrective-training buttons in AI-sorted compare + per-folder `.bulk_rated.json` (Group 0 part 1) |
| [Tournament Re-rate Plan][]                  | "Both Win / Both Lose" mark-as-equal draw buttons in tournament mode via `recordDraw` (reuses engine undo) (Group 0 part 2) |
| [JXL Viewer Support Plan][]                  | JXL + animated-JXL viewing via `jxl-oxide-wasm` module worker → decode/render/animation/feature-extraction/CLIP (Group A) |
| [Mode-Switch Display Bugs Plan][]            | compare→single lands on the on-screen compare-left file + `switchToSingleModeUI` tears down stale compare wrappers (Group B) |
| [CLIP Extraction UX Plan][]                  | "Starting feature extraction…" kickoff toast + CLIP toggle-on extraction kickoff + empty-folder no-op guard (Group C) |
| [Security & Privacy Audit Plan][]            | One-time secrets scan (history + working tree) + identity/PII assessment → dated audit report (Group D) |
| [JXL Progressive Decode Plan][]              | Frame-0-first streaming JXL decode (worker `meta`/`frame`/`done` protocol; `decodeJxl` resolves at frame 0; `whenComplete` gates animation) (Group CW-5) |
| [Renderer Correctness Guards Plan][]         | Batch of 7 defensive renderer fixes from PR reviews #34–#45 (clipCache clear, tournament `isLoading` guards, `<2-files` exitTournamentMode, `handleCancel` guard, `clipWorkerReady` reset, feature-cache local-capture, JXL error-path trio) (Group CW-1) |
| [Test Backfill Plan][]                       | E2E suite returned to green (`#viewModeBtn`→`#modeSelector`) + first tournament-mode Playwright coverage (5 hybrid-driven tests) + `recordDraw` assertion strengthening (Group CW-2) |
| [CW-3 Docs & Backlog Hygiene Plan][]         | git-verified BACKLOG stale-checkbox sweep (7 flips) + doc-drift one-liners + repo-root cruft removal; docs-only (Group CW-3) |
| [Process & Security Guards Plan][]           | Dependency-free pre-commit secret guard (`scanForSecrets` detector + diff parser + CLI in `.husky/pre-commit`) + pre-archive checklist hardening in the tracked archive READMEs (Group CW-4) |
| [Sort Responsiveness Core Plan][]            | Large-folder sort UX: determinate cancelable progress card (Option C) + O(n²) MST-fallback → VP-tree `findNearest` (quality-locked) + `insertNewFilesInSortedOrder` yielding + dead-code removal; PR1 of 3 (Group P1) |
| [Tournament Large-Folder Perf Plan][]        | Tournament 24k+ responsiveness: debounced single-flight `.tournament_state.json` persistence + O(n) `_buildRoundPairings` (consumed-markers) + cached path→index `Map` + slim `version:2` history-free payload (session-only undo, cap 100) + atomic write (Group P2) |
| [Extraction Timing Plan][]                   | Lazy / on-demand feature extraction: remove the folder-open + CLIP-toggle kickoffs; add a conditional on-demand CLIP-sort trigger gated by `clipVectorsNeedExtraction` (ML sort already lazy; hash sort needs no vectors) (Group P3) |
| [Weekly Reviews First Run Plan][]            | First run of the recurring Weekly Reviews batch: 4 deep-research/inline category reviews → verdict rows in REVIEW-QUEUE.md + 🟤 BACKLOG adopt; ⚪ overhead, no code PR (Group WR) |
| [Tournament Exit Affordances Plan][]         | Two tournament exit affordances: re-add the in-header exit button (→ `switchMode('single')`) + confirm-before-app-close during an incomplete tournament (main `close` interception → reuse `showTournamentLeavePrompt(onAfterLeave)`) (Group T1) |
| [CW-T Tournament Correctness & Hardening Plan][] | Tournament correctness, persistence & hardening: O(1) inverse-delta undo + `showTournamentPairFast` wrapper-reuse render + `reconcileWithFiles`-on-every-entry (live-engine gap) + hardened `-1` divergence capture + 6 debt items; MERGED via PR #59 (Group CW-T) |
| [Docs & CLAUDE.md Hygiene Plan][]            | Docs-only consolidation clearing 5 deferred `revise-claude-md`/doc-drift items: 3 tournament gotchas + debounced-persistence/`v2` note + MinHeap/VPTree worker-only note into CLAUDE.md; PR2/PR3 per-phase framing into DONE/TODO; manual-only maintenance decision D1; PR #60 (Group CW-D) |
| [Test & Tooling Backfill Plan][]             | Test-only backfill: comment-aware `methodSource` brace guard + `src` seam; `extractAddedLines` real-git-diff fixtures; sort-progress card E2E (observer-capture + cancel wiring); play/pause icon toggle E2E via synthetic events (Group CW-V) |
| [CW-P Process & DX Guardrails Plan][]         | Automated pre-push E2E gate (code-aware skip; pure `parsePushRefs`/`classifyPaths` + fail-safe git-wrapper CLI + Husky v9 hook) + Weekly-Reviews methodology consolidation (6 fixes) + CLAUDE.md ref-sweep bullet (Group CW-P) |
| [G1 AI-Sort Startup UX Plan][]                 | Phased/cancelable `handleSortByPrediction` + awaitable `runMlSort` (`sortRunId` stale-guard) + atomic incremental `loadFeatureCache` (staged-local, commit-on-complete) + binary `Float32Array` transport for `feature-cache-chunk` + unified sort-card progress; PR3 slice of the 🔴 sort-perf TODO (PR2 hash-off-thread remains); user-side 24k smoke PASSED 2026-07-20; MERGED via PR #64 (`b6ff4ac`) (Group G1) |
| [G2 Tournament Bug Fixes Plan][]               | `engine.history` unified chronological undo stack (`kind` pick/special/prune + `peekUndoEntry`/`undoUserAction`) replacing the `moveHistory`-peek that let any special move hijack tournament undo + identity re-check for the advisory `isLoading` mutex + mouse-wheel `isTournamentMode` guard + auto-hide `.tournament-header`/`.tournament-controls` (`_setupAutoHide`); MERGED via PR #65 (`937084c`); **user-side 6-point manual smoke PASSED 2026-07-21** (all 6 checks) (Group G2) |

| [G4 Strategic-Doc Refresh Plan][] | Strategic docs refreshed to August-2026 reality (v1.1 retro-closed, v2.0 = modularization arc, Now/Next/Later theme board) + CLAUDE.md/PROJECT.md sync + planning-session staleness rule (Group G4) |
| [G1 Bulk-Rate Follow-ups Plan][] | Real-worker E2E for the PR #66 deferred re-render (D2/D4) + `loadFolder` deferred-window cancel, `prunedPairKeys` restore on undo, counter/undo-arithmetic coverage; review-round log (Group G1, Cleanup Week #3) |

[Notifications & Media Info]: archive/plans/2025-12-25_notifications-media-info-less-intrusive.md
[Sorting Cache]: archive/plans/2025-12-27_sorting-cache.md
[Background Feature Extraction]: archive/plans/2025-12-28_background-feature-extraction.md
[Compare Mode AI Sort Bug]: archive/plans/2026-01-02_compare-mode-ai-sort-bug.md
[CLIP/ML Pipeline Cleanup Plan]: archive/plans/2026-04-09-clip-ml-cleanup.md
[Compare Mode Fix Plan]: archive/plans/2026-04-10-compare-mode-fix.md
[Test Quality Plan]: archive/plans/2026-04-11-test-quality.md
[CLIP Similarity Sorting Plan]: archive/plans/2026-04-16-clip-similarity-sorting.md
[Resource Management Plan]: archive/plans/2026-04-20-group-e-resource-management.md
[Group F Build & DX Plan]: archive/plans/2026-04-29-group-f-build-dx.md
[CLIP Sort Follow-ups Plan]: archive/plans/2026-05-02-clip-sort-followups.md
[CLIP Extraction Silent Failure Plan]: archive/plans/2026-05-06-clip-extraction-silent-failure.md
[AI Prediction Display Bugs Plan]: archive/plans/2026-05-14-ai-prediction-display-bugs.md
[PR #33 Hygiene + Integration Tests Plan]: archive/plans/2026-05-21-pr-33-hygiene-and-integration-tests.md
[Tournament Mode Plan]: archive/plans/2026-05-25-tournament-mode.md
[Planning Restructure Plan]: archive/plans/2026-05-30-planning-restructure.md
[Re-rate Compare Correction Plan]: archive/plans/2026-05-31-rerate-compare-correction.md
[Tournament Re-rate Plan]: archive/plans/2026-06-03-tournament-rerate-correction.md
[JXL Viewer Support Plan]: archive/plans/2026-06-04-jxl-viewer-support.md
[Mode-Switch Display Bugs Plan]: archive/plans/2026-06-08-mode-switch-display-bugs.md
[CLIP Extraction UX Plan]: archive/plans/2026-06-10-clip-extraction-ux.md
[Security & Privacy Audit Plan]: archive/plans/2026-06-11-security-privacy-audit.md
[JXL Progressive Decode Plan]: archive/plans/2026-06-12-jxl-progressive-decode.md
[Renderer Correctness Guards Plan]: archive/plans/2026-06-13-cw-1-renderer-correctness-guards.md
[Test Backfill Plan]: archive/plans/2026-06-15-cw-2-test-backfill.md
[CW-3 Docs & Backlog Hygiene Plan]: archive/plans/2026-06-16-cw-3-docs-backlog-hygiene.md
[Process & Security Guards Plan]: archive/plans/2026-06-17-cw-4-process-security-guards.md
[Sort Responsiveness Core Plan]: archive/plans/2026-06-19-sort-responsiveness-core.md
[Tournament Large-Folder Perf Plan]: archive/plans/2026-06-24-tournament-large-folder-perf.md
[Extraction Timing Plan]: archive/plans/2026-06-25-extraction-timing.md
[Weekly Reviews First Run Plan]: archive/plans/2026-06-26-weekly-reviews-first-run.md
[Tournament Exit Affordances Plan]: archive/plans/2026-06-30-tournament-exit-affordances.md
[CW-T Tournament Correctness & Hardening Plan]: archive/plans/2026-07-01-cw-t-tournament-correctness-hardening.md
[Docs & CLAUDE.md Hygiene Plan]: archive/plans/2026-07-03-cw-d-docs-claude-md-hygiene.md
[Test & Tooling Backfill Plan]: archive/plans/2026-07-04-cw-v-test-tooling-backfill.md
[CW-P Process & DX Guardrails Plan]: archive/plans/2026-07-10-cw-p-process-dx-guardrails.md
[G1 AI-Sort Startup UX Plan]: archive/plans/2026-07-13-ai-sort-startup-ux.md
[G2 Tournament Bug Fixes Plan]: archive/plans/2026-07-20_g2-tournament-bug-fixes.md

## Design Specs

| Document | Purpose |
|----------|---------|
| [TASK-019 Extract Fullscreen Module][] | Fullscreen module extraction design |
| [TASK-020 ML Sorting Investigation][] | ML sorting race condition fix design |
| [TASK-021 Overlay Controls UX][] | Overlay controls positioning fix design |
| [TASK-022 Compare Last-Pair Fix][] | Compare mode last-pair error cascade fix |
| [TASK-024 Per-Folder Feature Cache][] | Per-folder feature extraction caching |
| [TASK-025 Application Logging][] | File-based application logging design |
| [TASK-026 Keyboard Shortcuts][] | Keyboard shortcut customization design |
| [TASK-027 Undo Empty State][] | Undo fix when no media remains in folder |
| [TASK-028 CLIP Semantic Features][] | CLIP semantic embedding extraction via main-process IPC; 64→576-dim ML model |
| [CLIP/ML Pipeline Cleanup][] | CLIP/ML pipeline cleanup (IPC listener, image decode, model cache, dead code) |
| [Compare Mode Fix][] | Compare mode folder-switch fix + DRY toggleViewMode refactor |
| [Test Quality][] | E2E afterEach null guards + misleading describe label rename |
| [CLIP Similarity Sorting][] | CLIP cosine-distance MST-based semantic sort algorithm |
| [Resource Management][]     | CLIP model unload after extraction + logger.js double-init guard |
| [Group F Build & DX][]      | Pin Lucide CDN with SRI hash + regression-checker agent update for FullscreenManager |
| [CLIP Sort Follow-ups][]    | Algorithm-aware new-file insertion (cosine for CLIP cache hits) + toggle-off cache+state cleanup |
| [CLIP Extraction Silent Failure][] | `kickoffBackgroundExtractionIfEnabled()` helper wired into `loadFolder()` so fresh CLIP folders extract |
| [PR #33 Hygiene + Integration Tests][] | Defensive cleanup of three CLIP toggle/sort code paths plus an integration test pattern catching wiring bugs |
| [AI Prediction Display Bugs][]     | Restore feature caches on undo + propagate worker scores into predictionScores after AI sort |
| [Planning Restructure][]           | BACKLOG.md source-split design (🔵 / 🟡 / 🟤) + pinned 📌 Process Rules + weekly quota enforcement |
| [Planning Restructure Classification][] | Pass-1 classification artifact (user-audited): one row per existing BACKLOG section mapped to 🔵 / 🟡 / 🟤 |
| [Re-rate Compare Correction][] | "Both good / Both bad" corrective-training buttons in AI-sorted compare + per-folder `.bulk_rated.json` persistence (Group 0 part 1) |
| [Tournament Re-rate][] | "Both Win / Both Lose" mark-as-equal draw outcomes in tournament mode via `recordDraw` (reuses engine undo); no ML, no new IPC (Group 0 part 2) |
| [JXL Viewer Support][] | JXL + animated-JXL viewing via `jxl-oxide-wasm` decode worker → Canvas; format audit + WASM eval + decode/render/feature-extraction design (Group A) |
| [Mode-Switch Display Bugs][] | compare→single lands on the on-screen compare-left file (resolve index at switch time) + `switchToSingleModeUI` tears down stale compare wrappers (Group B) |
| [CLIP Extraction UX][] | "Starting feature extraction…" toast on kickoff + CLIP toggle-on extraction kickoff; empty-folder no-op guard (Group C) |
| [Security & Privacy Audit][] | One-time non-destructive secrets + identity/PII audit; methodology + report artifact (Group D) |
| [JXL Progressive Decode][] | Frame-0-first streaming animated-JXL decode; worker `meta`/`frame`/`done` protocol + mutable cache entry with `whenComplete`; static frame-0 fallback on mid-stream error (Group CW-5) |
| [Renderer Correctness Guards][] | Batch of 7 defensive renderer fixes from PR reviews #34–#45: clipCache clear, tournament `isLoading` guards, `<2-files` exitTournamentMode, `handleCancel` entry-type guard, `clipWorkerReady` reset, feature-cache local-capture, JXL error-path trio (Group CW-1) |
| [Test Backfill][] | Return E2E suite to green + first tournament-mode Playwright coverage (hybrid driving) + `recordDraw` history-shape assertion strengthening (Group CW-2) |
| [CW-3 Docs & Backlog Hygiene][] | git-truth-verified BACKLOG stale-checkbox sweep + doc-drift one-liners + repo-root cruft; targeted-not-exhaustive scope (Group CW-3) |
| [Process & Security Guards][] | Dependency-free pre-commit regex secret guard (full-shape patterns, self-reference-safe via concatenated fixtures) + pre-archive checklist hardening (flip checkboxes, `Status: Complete`, index plans+specs, SHA-ancestor check) (Group CW-4) |
| [Sort Responsiveness Core][] | Large-folder sort UX: determinate cancelable progress notification (Option C) + O(n²) MST-fallback → VP-tree `findNearest` (quality-preserving, accept tie diff) + `insertNewFilesInSortedOrder` event-loop yielding + dead renderer-sort-method removal; quality-locked, PR1 of 3 (Group P1) |
| [Tournament Large-Folder Perf][] | Tournament 24k+ performance: session-only undo + slim `version:2` history-free payload (undo cap 100), debounced single-flight persistence (`_schedulePersist`/`_drain`/`flush`/`cancelPending`), O(n) consumed-marker `_buildRoundPairings`, cached path→index `Map`, atomic state write (Group P2) |
| [Extraction Timing][] | Lazy / on-demand feature extraction (D1–D4): remove the unconditional `loadFolder` kickoff + the CLIP enable-toggle kickoff; add a conditional on-demand CLIP-sort trigger gated by `clipVectorsNeedExtraction` (skips the ~40s cache reload on repeat sorts); ML "Sort by Prediction" already lazy, hash sort needs no vectors (Group P3) |
| [Weekly Reviews First Run][] | Reusable Weekly Reviews methodology + first run (D1–D4: hybrid relevance lens, deep-research-per-category, recency, hands-off adopt); includes a First-run retro correcting the default to lightweight inline research after the harness hit rate/session limits (Group WR) |
| [Tournament Exit Affordances][] | Two tournament exit affordances (in-header exit button + confirm-before-app-close via main `close` interception reusing the `onAfterLeave` leave prompt); reuse-the-DOM-modal-via-IPC over a native dialog, rejected a cached `tournamentActive` flag (Group T1) |
| [CW-T Tournament Correctness & Hardening][] | Tournament correctness/persistence/hardening design: O(1) inverse-delta undo, `showTournamentPairFast` fast-path render, `reconcileWithFiles`-on-every-entry, `-1` divergence capture, persistent perf log, 6 debt items (Group CW-T) |
| [Docs & CLAUDE.md Hygiene][] | Docs-only consolidation design — verify-then-edit the 5 deferred `revise-claude-md`/doc-drift items; decisions D1 manual-only maintenance (no markers), D2 no historical line-ref sweep (Group CW-D) |
| [CW-P Process & DX Guardrails][] | Process/DX guardrails design: pre-push E2E gate (conservative code-aware classify, fail-safe CLI, dogfood-on-own-PR) + Weekly-Reviews methodology consolidation (6 fixes) + ref-sweep convention; decisions pre-push-code-aware-skip / consolidate-in-existing-spec / CLAUDE.md-home (Group CW-P) |
| [G1 AI-Sort Startup UX][] | AI-sort startup UX & incremental cache-load design: D1 visible+cancelable+incremental+best-effort-faster, D2 one unified progress card, D3 cancel stops everything, D4 mirror `handleSortBySimilarity`, D5 diagnose-before-fix (re-extract bug), D6 no on-disk format change (Group G1) |
| [Weekly Reviews 2026-07-05 Run][] | Run-card for the 2nd Weekly Reviews run (not a design spec): candidate picks + scope guards + appended Outcome/retro; 4 verdicts, 2 adopt (`typescript-lsp`; autonomous e2e/visual verification) (Group WR) |
| [Weekly Reviews 2026-08-27 Run][] | Run-card for the 3rd (catch-up) Weekly Reviews run: decisions D1 bidirectional cross-project propagation / D2 confirmed target scope / D3 candidate placement, scope guards, and appended Outcome with 5 verdicts, 3 adopt + 1 propagate and 6 recorded deviations (Group G5) |
| [G4 Strategic-Doc Refresh Design][] | Strategic-doc refresh + CLAUDE.md pre-push-gate sync: D1 hybrid release model (v1.1 retro-closed, v2.0 the one forward version, rest → Now/Next/Later themes), D2 v2.0 = modularization arc only, D3 theme-board placement, D4 weekly-planning staleness check replaces the quarterly note, D5 spec embeds near-final content; § 9 records the 2026-08-27 re-verification (D6 onward), including D10, which supersedes D4's "weekly" wording as cadence-neutral (Group G4) |
| [G1 Bulk-Rate Follow-ups Design][] | Bulk-rate follow-ups design: D1 the E2E runs the real `ml-worker.js` (lazy init was the cause, not the harness — no stub/flag), D2 `_cancelDeferredCompareRefresh` with the `wasPending` rule (§ 2 amended: `loadFolder` cancels twice), D3 `prunedPairKeys` captured on the history entry and restored before the `mlFeatures` guard, D4 mutation-verified tests, D5 two design-time findings deliberately deferred to BACKLOG (Group G1) |
| [G2 Tournament Undo Hardening][] | Undo-stack lifecycle hardening design: DEC-1 dedicated `_tournamentRenderBusy` re-entrancy flag (the specified `isLoading` fix cannot hold — the compare handlers clear it at first paint), DEC-2 drop a `special` entry after 2 consecutive restore failures (`dropEntry` + `moveHistory` twin), DEC-3 `reconcileWithFiles` drops the session-only history in O(1) and notifies (per-file `trackUndo` would undo the PR #55 24k win); plus the empty-state keydown `canUndo` guard and the `exitTournamentMode` invariant comment (Group G2, Aug 31–Sep 4) |
| [G2 Tournament Bug Fixes][] | Tournament-mode bug fixes design: D1 unified LIFO undo stack, D2 `engine.history` IS that stack (reverses PR #59 `trackUndo:false`), D3 engine stays dumb (`meta` opaque), D4 system prunes auto-consumed, D5 undo stays session-only, D6 auto-hide mirrors `.header` (edge band + 3s), D7 reveal chrome on entry (Group G2) |

[TASK-019 Extract Fullscreen Module]: superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md
[TASK-020 ML Sorting Investigation]: superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md
[TASK-021 Overlay Controls UX]: superpowers/specs/2026-03-21-task-021-fix-compare-overlay-ux-design.md
[TASK-022 Compare Last-Pair Fix]: superpowers/specs/2026-03-22-task-022-fix-compare-last-pair-design.md
[TASK-024 Per-Folder Feature Cache]: superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md
[TASK-025 Application Logging]: superpowers/specs/2026-03-26-task-025-application-logging-design.md
[TASK-026 Keyboard Shortcuts]: superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md
[TASK-027 Undo Empty State]: superpowers/specs/2026-03-28-task-027-fix-undo-empty-folder-design.md
[TASK-028 CLIP Semantic Features]: superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md
[CLIP/ML Pipeline Cleanup]: superpowers/specs/2026-04-09-clip-ml-cleanup-design.md
[Compare Mode Fix]: superpowers/specs/2026-04-10-compare-mode-fix-design.md
[Test Quality]: superpowers/specs/2026-04-11-test-quality-design.md
[CLIP Similarity Sorting]: superpowers/specs/2026-04-16-clip-similarity-sorting-design.md
[Resource Management]: superpowers/specs/2026-04-20-group-e-resource-management-design.md
[Group F Build & DX]: superpowers/specs/2026-04-29-group-f-build-dx-design.md
[CLIP Sort Follow-ups]: superpowers/specs/2026-05-02-clip-sort-followups-design.md
[CLIP Extraction Silent Failure]: superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md
[PR #33 Hygiene + Integration Tests]: superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md
[AI Prediction Display Bugs]: superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md
[Planning Restructure]: superpowers/specs/2026-05-30-planning-restructure-design.md
[Planning Restructure Classification]: superpowers/specs/2026-05-30-planning-restructure-classification.md
[Tournament Re-rate]: superpowers/specs/2026-06-03-tournament-rerate-correction-design.md
[Re-rate Compare Correction]: superpowers/specs/2026-05-31-rerate-compare-correction-design.md
[JXL Viewer Support]: superpowers/specs/2026-06-04-jxl-viewer-support-design.md
[Mode-Switch Display Bugs]: superpowers/specs/2026-06-08-mode-switch-display-bugs-design.md
[CLIP Extraction UX]: superpowers/specs/2026-06-10-clip-extraction-ux-design.md
[Security & Privacy Audit]: superpowers/specs/2026-06-11-security-privacy-audit-design.md
[JXL Progressive Decode]: superpowers/specs/2026-06-12-jxl-progressive-decode-design.md
[Renderer Correctness Guards]: superpowers/specs/2026-06-13-cw-1-renderer-correctness-guards-design.md
[Test Backfill]: superpowers/specs/2026-06-15-cw-2-test-backfill-design.md
[CW-3 Docs & Backlog Hygiene]: superpowers/specs/2026-06-16-cw-3-docs-backlog-hygiene-design.md
[Process & Security Guards]: superpowers/specs/2026-06-17-cw-4-process-security-guards-design.md
[Sort Responsiveness Core]: superpowers/specs/2026-06-19-sort-responsiveness-core-design.md
[Tournament Large-Folder Perf]: superpowers/specs/2026-06-24-tournament-large-folder-perf-design.md
[Extraction Timing]: superpowers/specs/2026-06-25-extraction-timing-design.md
[Weekly Reviews First Run]: superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md
[Tournament Exit Affordances]: superpowers/specs/2026-06-30-tournament-exit-affordances-design.md
[CW-T Tournament Correctness & Hardening]: superpowers/specs/2026-07-01-cw-t-tournament-correctness-hardening-design.md
[Docs & CLAUDE.md Hygiene]: superpowers/specs/2026-07-03-cw-d-docs-claude-md-hygiene-design.md
[CW-P Process & DX Guardrails]: superpowers/specs/2026-07-10-cw-p-process-dx-guardrails-design.md
[G1 AI-Sort Startup UX]: superpowers/specs/2026-07-13-ai-sort-startup-ux-design.md
[Weekly Reviews 2026-07-05 Run]: superpowers/specs/2026-07-05-weekly-reviews-run.md
[Weekly Reviews 2026-08-27 Run]: superpowers/specs/2026-08-27-weekly-reviews-run.md
[G2 Tournament Bug Fixes]: superpowers/specs/2026-07-20-g2-tournament-bug-fixes-design.md
[G4 Strategic-Doc Refresh Design]: superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md
[G1 Bulk-Rate Follow-ups Design]: superpowers/specs/2026-08-29-g1-bulk-rate-followups-design.md
[G2 Tournament Undo Hardening]: superpowers/specs/2026-08-30-g2-tournament-undo-hardening-design.md

## Security Audits

| Document | Purpose |
|----------|---------|
| [Security & Privacy Audit (2026-06-11)](security/2026-06-11-security-privacy-audit.md) | One-time secrets scan (history + working tree) + identity/PII assessment; result: ✅ PASS (Group D) |

## Archives

| Document                               | Purpose                      |
|----------------------------------------|------------------------------|
| [archive/README.md](archive/README.md) | Archive index and guidelines |

---

*Last Updated: 2026-08-29*
