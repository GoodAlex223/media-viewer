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
| _None currently active_     | —                                      |

[G4 Strategic-Doc Refresh Plan]: archive/plans/2026-07-12_g4-strategic-docs-refresh.md
[G1 Bulk-Rate Follow-ups Plan]: archive/plans/2026-08-29_g1-bulk-rate-followups.md
[G2 Tournament Undo Hardening Plan]: archive/plans/2026-08-30_g2-tournament-undo-hardening.md

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
| [G2 Tournament Undo Hardening Plan][] | Engine `clearHistory`/`dropEntry` primitives + `reconcileWithFiles` drops the session-only stack in O(1) + a failed special-restore drops its own entry instead of wedging + empty-state keydown `canUndo` consults `engine.history`; **4 of 5 tasks shipped** — Task 4's `_tournamentRenderBusy` lock was implemented, measured against the tournament E2E, and reverted as unsound (the render re-enters itself from DOM callbacks behind the handlers) (Group G2, Cleanup Week #3) |
| [Video Fullscreen Toggle Plan][] | Exit fullscreen on a second video click |
| [TASK-002 Visual Scale Controls Plan][] | Visual media scale controls |
| [TASK-003 Centralized removeFile Plan][] | Centralized `removeFile()` cleanup method |
| [TASK-004 Compare File Validation Plan][] | File-existence validation in `showCompareMedia()` |
| [TASK-006 Unified Fullscreen Cleanup Plan][] | Unified fullscreen-exit cleanup method |
| [TASK-008 Cache Age Display Plan][] | Cache age shown in the sorting notification |
| [TASK-010 Extraction ETA Plan][] | Estimated time remaining for feature extraction |
| [TASK-018 UI Polish Plan][] | `:active` press animation on `.control-btn` + `cleanupFullscreen()` early-return guard |
| [TASK-019 Extract Fullscreen Module Plan][] | Extract `FullscreenManager` from `media-viewer.js` — establishes the v2.0 modularization pattern |
| [TASK-020 ML Sorting Fix Plan][] | Compare-mode re-scoring race + score-delta feedback + pair-selection unit tests |
| [TASK-021 Compare Overlay UX Plan][] | Overlay control buttons reachable and clickable without overlapping video controls |
| [TASK-022 Compare Last-Pair Plan][] | Last-pair infinite error loop fixed; undo preserved instead of a drop zone |
| [TASK-024 Per-Folder Feature Cache Plan][] | Feature cache reloads on folder switch, with file-change detection |
| [TASK-025 Application Logging Plan][] | File-based logging of main-process output and renderer errors |
| [TASK-026 Keyboard Shortcuts Plan][] | Customizable rating/navigation shortcuts (unified QWER+AD defaults) |
| [TASK-027 Undo Empty Folder Plan][] | Undo works when no media remains, restoring files and the correct view mode |
| [TASK-028 CLIP Semantic Features Plan][] | 512-dim CLIP embeddings concatenated with the 64-dim hand-crafted features |
| [G3 Bulk-Rate Re-Pair Avoidance Plan][] | Stop re-showing a pair already rated "Both good"/"Both bad" in AI-sorted compare (Group G3) |
| [G3 Re-Score & Counter Fixes Plan][] | Deferred re-score + stable "Pair X of Y" counter — the two PR #66 manual-smoke defects (Group G3) |
| [G3 Docs & Process Guardrails Plan][] | Docs-index pre-commit guard (index-sourced, both directions) + 24-row backfill + closeout conventions + `pool: 'threads'`; 5-reviewer round fixed 2 blocking defects in the guard itself (Group G3, Cleanup Week #3) |
| [G1 ML Training Pipeline Plan][] | 10-task subagent-driven plan: training-set fingerprint + per-training-folder vector caches + fingerprint-keyed model cache in `ml-training.js`; drops the online per-rating update protocol; corrects the recorded root cause (Group G1, Sep 7–11) |
| [G4 ML Pipeline Integrity Plan][] | CLIP unload lease (the filed one-line remedy closed only one of two arming orders); deletes `ml-worker.js`'s unreachable abort protocol rather than pinning it; harness 8 → 24 cases. Three of its four premises had expired between scoping and execution (Group G4, Sep 7–11) |
| [G2 Reachable Overlay Controls Plan][] | Container-anchored `#compareOverlayBar` (`1fr auto 1fr` grid, explicit `grid-column` pins) replaces wrapper-relative per-media controls and the prediction badge, fixing low-height clipping by construction; Like-left/Dislike-right on every rating surface; `removeZoomPopover` no longer deletes the tournament zoom button's parent (found defect, folded in); committed before/after visual evidence caught a real layout bug no automated check saw (Group G2, Sep 7–11) |
| [G3 Compare-Mode Special Hotkeys + Tooltips Plan][] | Compare-mode `1`/`2` bound to `moveToSpecialFolder('left'\|'right')` mirroring tournament, and special-button tooltips **derived** from the live binding (`_specialShortcutSuffix`) instead of hardcoded; review found the new defaults could shadow a pre-existing user remap and silently move a file, fixed structurally by `_mergeModeShortcuts()` making a later default yield to a stored binding rather than by a one-shot migration bump (Group G3, Sep 7–11) |
| [G2 Hooks and Logs That Fire Plan][] | Five tasks, one commit each, every protection probed must-fire / must-not-fire: `.claude/` allow-listed and `settings.json` versioned; the dead preload/.env hook replaced by `permissions.ask` rules **plus** a `PreToolUse` shell hook (`guard-preload-bash.js`) after the live probe showed the `Bash(*preload.js*)` rule misses `cd <project dir> && …`; the Prettier hook rebuilt to format only the edited in-repo file (`format-edited-file.js`); `SKIP=<check>` per-check Husky bypass (`.husky/skip.sh`, `check_failed` keeps exit 127); dated session logs, newest 10, never pruning the current file, future mtimes oldest; the `new-e2e-test` skill committed. PR #73, 3 review rounds + close-out (Group G2, Oct 5–9 Cleanup Week #4) |
| [G1 Security Findings Fix Plan][] | Stub-level plan, kept public throughout, for the `claude-security` scan's F1–F7. Status: complete. Tasks A, B, 1–10, every finding test RED first. Holds the execution rulings and the deferred minors, published after the merge. Path: folder grants and an IPC guard; DOM-built sinks plus a lint guard that is proven to fire; saved-state validation; apply confinement; a measured CSP; a navigation lock; a re-pick flow. Then a whole-branch review fix pass and the deep review's 15 findings, all fixed. PR #78: two review rounds and a close-out with no issues (Group G1, Oct 12–16) |
| [G2 Like-or-Skip Flow Plan][] | Seven tasks, RED first, subagent-driven, each with a task review. The pure `like-or-skip.js`; the `_onOrderChanged` hook plus a source-scan control; the guarded "Dislike N skipped" batch, dialog, button and `F`; the one-Ctrl+A undo; the out-of-date chip and re-sort; before/after screenshots. The visual evidence caught a 50vw width cap on the bar. The regression check found header actions unguarded during a long batch. The in-chat `/code-review max` found 15 confirmed findings; 12 of them, plus a regression from the executor's own fix, were fixed in one wave. Holds the RED→GREEN log, the rulings and the Key Discoveries. PR #79, close-out with no issues (Group G2, Oct 12–16) |
| [G3 Source CLIP Reuse Plan][] | **Superseded 2026-10-13** by [G3 Training Video Extraction Plan][], after the before run measured CLIP for moved files at about 1% of the sort. Only its Task 1, the perf log (`713af35`), shipped. Task 2 (`departedClips`) is parked on the local branch `g3-departed-clips-parked`, and Tasks 3–4 were dropped. Holds the before run and the original design's rulings (Group G3, Oct 12–16) |
| [G3 Training Video Extraction Plan][] | Tasks 1, 2, 2b and 3, subagent-driven with a task review each. Task 1: `_releaseVideo`, with a playable H.264 fixture and an E2E against the real engine. Task 2: `failed=N` on the perf line. Task 2b: the lenient CLIP decode, `clip-image.js`. Task 3: the docs. The first after run met `failed=0` but cached nothing, which exposed a second blocker: 9 CLIP-less images. Spec § 11 and Task 2b were added for it. The final review found and measured a GIF/WebP `EBUSY` from sharp's path input. Holds the before run, both after runs, the mutation log and the Key Discoveries. PR #80, review with no open items (Group G3, Oct 12–16) |
| [G4 Recently Opened Folders Plan][] | Five tasks, RED first, subagent-driven, with a task review each: the pure `recent-folders.js` plus a before screenshot; record, persist and list on the drop zone; the header ▾ menu, which owns the keyboard and pins the header while open; the click-time open flow and `switchToFolder`, which asks Save/Discard first in an unfinished tournament (D3); after screenshots. Two plan tests were vacuous as written and were fixed by implementers. The final review found a stale click-time check replacing a folder opened since (`_folderIntentGen`). The PR review found overlapping loads saving into another folder's `.bulk_rated.json` (`loadFolder` made single-flight). Holds Rulings 1–8, the RED→GREEN and mutation log and the `typescript-lsp` trial result. PR #81: a review round, then a re-review with no issues (Group G4, Oct 12–16) |
| [G5 CLAUDE.md Size Audit Plan][] | Native execution: read-only passes (`/claude-api prompt-audit`, the `claude-md-improver` report, a stale-reference probe, a concept-vocabulary sweep); a trim in place with a disposition table per section, plus a logged second pass on Detected Patterns; the never-blocking byte-based pre-commit warning (`scripts/check-claude-md-size.js`, RED first, three mutations); a rule-loss check with a planted control, which restored 15 rules; and the rulings from the two-round PR #82 review. 236 → 216 lines, 64,203 → 58,582 bytes (Group G5, Oct 12–16) |
| [G1 Page-Load Confinement Plan][] | Stub-level plan for G1's residual I1, public throughout; the spec and the detailed plan stayed local until the merge. Status: complete, PR #84 (merge `4548269`). Ten tasks, Native execution, every confined load class RED on `main` first: the app scheme (`app-protocol.js`), the shared media-read rule, the response-header CSP, renderer egress controls, vendored Lucide, the one-time settings move, and mutation-checked behaviour tests. Then a final-review fix pass, simulation tests for the checks the user couldn't run by hand, and one PR review round. Holds the execution rulings and the deferred minors, published after the merge. |
| [G2 PR 1 End-of-Sort Fixes Plan][] | PR 1 of G2 (spec D7). The similarity sort works on a snapshot with captured settings, saves its hashes as it goes, restores nothing on Cancel, writes nothing once stale, and ends through one apply function, or a sticky "Show" message if the user acted. Seven tasks, subagent-driven: the five planned, plus two the user approved (Restore Order waits for render idle; the AI sort never applies under a loading file). A final review and a fix wave followed, then a 24-finding PR review with three fix waves. Status: complete, PR #85 (merge `f668611`); G2 stays open for PR 2. Holds the rulings, the deferred findings and the Key Discoveries. |
| [Feature Cache Wipe Fix Plan][] | Stop a folder's `.feature_cache.json` being replaced by a smaller copy or another folder's entries (TODO 🔴, PR #86, merge `654fb3e`). One folder visit owns the cache, and main refuses a write it cannot account for. Six tasks, the six triggers red on `main` first, native execution, then a 15-finding review fix pass and three close-out rounds |
| [G2 PR 2 Background Hashing Plan][] | PR 2 of G2 (spec D7, § 17 B1–B15). The similarity sort hashes in a per-run pool of 3 workers on the measured F4 route, behind a pixel-exact canary, with the main-thread route as the fallback. Also: the `MV_HASH_PARITY=1` diagnostic, whose D4 class is measured on the pixels (B15, the smoke's ruling), and atomic writes for `.hash_cache.json`, `.sort_cache.json` and `.bulk_rated.json`. Eight tasks, subagent-driven, then a final review with one fix wave, five PR review rounds, the user's `Liked_2` smoke (passed on the re-run) and a real-JXL measurement (its long-stream stall goes to a follow-up). Status: complete, PR #87 (merge `f5ddfa3`); G2 is complete. Holds the rulings, the triaged minors and the Key Discoveries. |
| [G4 Formatter Hook Cost Plan][] | A short plan, no spec (2 SP). The `PostToolUse` formatter hook skips, before Prettier starts, every path Prettier ignores (its own check: `.gitignore` + `.prettierignore`, `ignore` 7.0.5 as Prettier bundles it) and the root `media-viewer.js`, left to lint-staged at commit. Interleaved re-time: the renderer 1,384 → 65 ms, an ignored doc 229 → 83 ms. Holds the rejected `async` and `Stop` options, the parity and no-spawn tests, 10 mutations and three PR review rounds. Status: complete, PR #89 (merge `7f75013`). |
| [G4 Cleanup Week Trial Batch Plan][] | Execution log, not a spec: the `claude-security` adopt trial's leg 1 under a decision rule committed before the scan — 7 findings reported / 5 distinct, 5/5 held under our re-derivation → `keep`; High findings filed as public stubs only (the repo is public). Cost, the Workflow-subagent guard gap, and the recurring plugin read-out. |
| [G3 Tournament Render Re-entry Plan][] | Four tasks, every new test proven RED first (E2E committed under `test.fail` until its fix): Phase 0 measured the WEEKLY's five-run bar passing on unfixed code, then E1–E3 failed for their named reasons; `logger.normalizeRendererLogEntry` (54 string diagnostics logged as `undefined`); `showTournamentPair()` a single-flight, coalescing owner; `_skipFailedTournamentFile` the one failure path, first pair included; Review Focus E4–E7. The final review's undo-past-a-skip Apply hole re-graded Important and fixed (`_pruneUnlistedEngineFiles`). PR #75, pre-PR final review + 1 review round + close-out (Group G3, Oct 5–9 Cleanup Week #4) |
| [G1 Single-Mode Rating Safety Plan][] | Seven tasks, every new test proven RED first: Phase 0 reproduced the held-Like freeze with runtime-only instrumentation (a stale `forceVideoCleanup` timer nulled the next render's `currentMedia`); `forceVideoCleanup` narrowed; `e.repeat` filtered for all but next/previous; the `_fileOpInFlight` guard over five file-acting methods (undo refused with a notice); single-mode `1` special hotkey; like/dislike tooltips via `_shortcutSuffix`. The final review's Critical (typing `1` in a form field moved a file) fixed by `_isTextEntryTarget`, selects excluded after PR review. PR #74, pre-PR final review + 2 review rounds + close-out (Group G1, Oct 5–9 Cleanup Week #4) |

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
[Video Fullscreen Toggle Plan]: archive/plans/2025-12-29_video-fullscreen-toggle.md
[TASK-002 Visual Scale Controls Plan]: archive/plans/2026-02-05_visual-scale-controls.md
[TASK-003 Centralized removeFile Plan]: archive/plans/2026-02-06_centralized-remove-file.md
[TASK-004 Compare File Validation Plan]: archive/plans/2026-02-06_compare-file-validation.md
[TASK-006 Unified Fullscreen Cleanup Plan]: archive/plans/2026-02-24_task-006-unified-fullscreen-cleanup.md
[TASK-008 Cache Age Display Plan]: archive/plans/2026-03-05_task-008-cache-age-display.md
[TASK-010 Extraction ETA Plan]: archive/plans/2026-03-05_task-010-extraction-eta.md
[TASK-018 UI Polish Plan]: archive/plans/2026-03-20-task-018-ui-polish.md
[TASK-019 Extract Fullscreen Module Plan]: archive/plans/2026-03-21-extract-fullscreen-module.md
[TASK-020 ML Sorting Fix Plan]: archive/plans/2026-03-21-task-020-ml-sorting-fix.md
[TASK-021 Compare Overlay UX Plan]: archive/plans/2026-03-21-task-021-fix-compare-overlay-ux.md
[TASK-022 Compare Last-Pair Plan]: archive/plans/2026-03-22-task-022-fix-compare-last-pair.md
[TASK-024 Per-Folder Feature Cache Plan]: archive/plans/2026-03-24-task-024-per-folder-feature-cache.md
[TASK-025 Application Logging Plan]: archive/plans/2026-03-26-task-025-application-logging.md
[TASK-026 Keyboard Shortcuts Plan]: archive/plans/2026-03-27-task-026-keyboard-shortcut-customization.md
[TASK-027 Undo Empty Folder Plan]: archive/plans/2026-03-28-task-027-fix-undo-empty-folder.md
[TASK-028 CLIP Semantic Features Plan]: archive/plans/2026-04-05-task-028-clip-semantic-features.md
[G3 Bulk-Rate Re-Pair Avoidance Plan]: archive/plans/2026-07-24_g3-bulk-rate-repair-avoidance.md
[G3 Re-Score & Counter Fixes Plan]: archive/plans/2026-07-25_g3-rescore-and-counter-fixes.md
[G3 Docs & Process Guardrails Plan]: archive/plans/2026-09-02_g3-docs-process-guardrails.md
[G1 ML Training Pipeline Plan]: archive/plans/2026-09-10_ml-training-pipeline.md
[G4 ML Pipeline Integrity Plan]: archive/plans/2026-09-12_g4-ml-pipeline-integrity.md
[G2 Reachable Overlay Controls Plan]: archive/plans/2026-09-13_g2-reachable-overlay-controls.md
[G3 Compare-Mode Special Hotkeys + Tooltips Plan]: archive/plans/2026-09-21_g3-compare-special-hotkeys.md
[G2 Hooks and Logs That Fire Plan]: archive/plans/2026-10-05_g2-hooks-and-logs-that-fire.md
[G1 Security Findings Fix Plan]: archive/plans/2026-10-10_g1-security-findings-fix.md
[G2 Like-or-Skip Flow Plan]: archive/plans/2026-10-12_g2-like-or-skip-flow.md
[G3 Source CLIP Reuse Plan]: archive/plans/2026-10-13_g3-source-clip-reuse.md
[G3 Training Video Extraction Plan]: archive/plans/2026-10-13_g3-training-video-extraction.md
[G4 Recently Opened Folders Plan]: archive/plans/2026-10-16_g4-recently-opened-folders.md
[G5 CLAUDE.md Size Audit Plan]: archive/plans/2026-10-17_g5-claude-md-size-audit.md
[G1 Page-Load Confinement Plan]: archive/plans/2026-10-18_g1-confine-page-file-loads.md
[G2 PR 1 End-of-Sort Fixes Plan]: archive/plans/2026-10-19_g2-hash-sort-pr1-end-of-sort-fixes.md
[Feature Cache Wipe Fix Plan]: archive/plans/2026-10-21_feature-cache-wipe-fix.md
[G2 PR 2 Background Hashing Plan]: archive/plans/2026-10-22_g2-hash-sort-pr2-background-hashing.md
[G4 Formatter Hook Cost Plan]: archive/plans/2026-10-26_g4-formatter-hook-cost.md
[G4 Cleanup Week Trial Batch Plan]: archive/plans/2026-10-08_g4-cleanup-week-trial-batch.md
[G3 Tournament Render Re-entry Plan]: archive/plans/2026-10-07_g3-tournament-render-reentry.md
[G1 Single-Mode Rating Safety Plan]: archive/plans/2026-10-06_g1-single-mode-rating-safety.md

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
| [Weekly Reviews 2026-09-02 Run][] | Run-card for the 4th Weekly Reviews run: decisions D1 `dead-rules-audit` drop-as-compliance-tool (its judge scores compliant edits as violations) / D2 single §4 propagation / D3 one branch + docs-only PR / D4 §5 read-outs run first so the queue cap lifts; scope guards and appended Outcome (Group G6, carries G4's terminal read-out) |
| [Weekly Reviews 2026-10-09 Run][] | Run-card for the 6th Weekly Reviews run (Cleanup Week #4): D2 propagate the Windows-junction `git worktree remove --force` hazard live-first / D3 inbound `typescript-lsp` row re-vehicles the pending § 5 trial (no install) / D4 `/claude-api prompt-audit` folded into the quarterly `CLAUDE.md` audit / D6 GOALS + MILESTONES + ROADMAP MLManager half-extracted status flip (ROADMAP added in PR #77's review). |
| [Weekly Reviews 2026-10-17 Run][] | Run-card for the 7th Weekly Reviews run (Oct 12–16 plan): D2 *You should know* trial reads out `keep` / D3 `typescript-lsp` `inconclusive`, re-vehicled once with a workspace `typescript@6` devDependency (7.x ships no `tsserver.js`; corrected in PR #83's review) and a drop stop rule / D4 the catalog baseline becomes a name diff between pinned SHAs (ride-along) / D5 the new inbound formatter-hook row is timed in-run (1.10 s per `media-viewer.js` edit → 🔵 filed) / D6 the two G5 outbound rows go to the sibling as a hand-off note, with no out-of-repo write. Outcome: 1 adopt / 3 pass; §2 trials `onFailure: "block"` on the guard hook, after the run found the VS Code host at 2.1.301, not 2.1.289 (Group G6) |
| [Weekly Reviews 2026-09-24 Run][] | Run-card for the 5th Weekly Reviews run: decisions D1 §5 plugin context-cost audit first (the eight claude.ai-synced plugins disabled user-wide) / D2 §1 correction — the "nonexistent official plugin" claims were false, so §1a is sourced from the catalog / D3 apply the three pending propagations plus one new, live-first / D4 all 11 inbound rows, per-item rulings / D5 spillover / D6 one docs-only PR; scope guards, user checkpoints, and the appended Outcome with its out-of-repo change log (Group G5, Sep 7–11 plan) |
| [G4 Strategic-Doc Refresh Design][] | Strategic-doc refresh + CLAUDE.md pre-push-gate sync: D1 hybrid release model (v1.1 retro-closed, v2.0 the one forward version, rest → Now/Next/Later themes), D2 v2.0 = modularization arc only, D3 theme-board placement, D4 weekly-planning staleness check replaces the quarterly note, D5 spec embeds near-final content; § 9 records the 2026-08-27 re-verification (D6 onward), including D10, which supersedes D4's "weekly" wording as cadence-neutral (Group G4) |
| [G1 Bulk-Rate Follow-ups Design][] | Bulk-rate follow-ups design: D1 the E2E runs the real `ml-worker.js` (lazy init was the cause, not the harness — no stub/flag), D2 `_cancelDeferredCompareRefresh` with the `wasPending` rule (§ 2 amended: `loadFolder` cancels twice), D3 `prunedPairKeys` captured on the history entry and restored before the `mlFeatures` guard, D4 mutation-verified tests, D5 two design-time findings deliberately deferred to BACKLOG (Group G1) |
| [G2 Tournament Undo Hardening][] | Undo-stack lifecycle hardening design: DEC-1 **reverted, not shipped** — a dedicated `_tournamentRenderBusy` flag replaced the specified `isLoading` mutex (which cannot hold: the compare handlers clear it at first paint), but E2E measurement showed the flag silently drops user input, because `_buildTournamentSide` re-enters the render from a DOM error callback that bypasses every handler; the guard is blocked on that and re-filed to BACKLOG [2026-08-31]. DEC-2 drop a `special` entry after 2 **cumulative** restore failures — counted per entry for its whole lifetime, with nothing resetting the count except the entry leaving the stack (`dropEntry` + `moveHistory` twin + `clearHistory` for the entries beneath it), DEC-3 `reconcileWithFiles` drops the session-only history in O(1) and notifies (per-file `trackUndo` would undo the PR #55 24k win); plus the empty-state keydown `canUndo` guard and the `exitTournamentMode` invariant comment (Group G2, Aug 31–Sep 4) |
| [G2 Tournament Bug Fixes][] | Tournament-mode bug fixes design: D1 unified LIFO undo stack, D2 `engine.history` IS that stack (reverses PR #59 `trackUndo:false`), D3 engine stays dumb (`meta` opaque), D4 system prunes auto-consumed, D5 undo stays session-only, D6 auto-hide mirrors `.header` (edge band + 3s), D7 reveal chrome on entry (Group G2) |
| [G1 ML Training Pipeline][] | ML training-pipeline design: corrects the recorded root cause (`resetMlModel()` never fires on a source-folder change — the model is cached per source folder while trained from globally-configured like/dislike folders), plus the inverse defect that an already-sorted folder never retrains at all. D1 drop the online per-rating updates, D2 cache training vectors per training folder, D3 cache the model behind a training-set fingerprint in app data, D4 no bulk-deltas layer, D5 new `ml-training.js` module, D6 keep `showMlLearningIndicator` repurposed per-sort, D7 reset before training + seeded shuffle (Group G1, Sep 7–11) |
| [G2 Reachable Overlay Controls][] | Overlay-control geometry: the per-media buttons and the prediction badge leave the content-sized `.media-wrapper` for a container-anchored `#compareOverlayBar` (`1fr auto 1fr` grid, each child pinned to an explicit `grid-column` track — a `display:none` grid item is skipped by auto-placement entirely, not collapsed, so the pins are what keeps the side groups column-centred once tournament mode hides the action bar), fixing the low-height clipping by construction. D3 ghosted-at-rest buttons + `:has()` fullscreen rule + a deliberate dead-guard deletion in `fullscreen.js`, D4 badge anchored per column in CSS only, D5 Like-left/Dislike-right on every surface, D6 folds in a found defect — `removeZoomPopover` deletes the zoom button and the tournament fast path never rebuilds it (Group G2, Sep 7–11) |
| [G2 Hooks and Logs That Fire][] | Protections that demonstrably fire: D1 the dead `preload.js` / `.env` `PreToolUse` hook replaced by `permissions.ask` rules (`Edit(/preload.js)`, `.env` patterns, `Bash(*preload.js*)` — prompts in every mode, auto included; Bash gaps named), D2 the Prettier `PostToolUse` hook rebuilt as `.claude/hooks/format-edited-file.js` (edited file only, repo-root cwd, skips paths outside the repo), D3 `.claude/` un-ignore list settled once (`agents/`, `hooks/`, `rules/`, `settings.json`, `skills/`), D4 `SKIP=<check>` per-check bypass for the Husky hooks via a sourced `.husky/skip.sh`, D5 session logs kept as dated files (newest 10, header + clean-quit footer), D6 the UTC-date/local-time log timestamp fixed; acceptance by must-fire / must-not-fire probes (Group G2, Oct 5–9 Cleanup Week #4) |
| [G1 Single-Mode Rating Safety][] | Held-key and overlapping-file-op safety: Phase 0 reproduces the held-Like blank-view / dead-controls end state first (leading hypothesis: a stale `forceVideoCleanup` timer nulls the next render's `currentMedia`, so its `load` handler is ignored and `isLoading` sticks); D1 an undo during an in-flight op is refused with a notice, D2 key auto-repeat honoured only for next/previous, D3–D4 one exclusive `_fileOpInFlight` flag (refuse, not queue) over `moveCurrentFile` / `moveToSpecialFolder` / `moveComparePair` / `applyBulkRating` / `handleCancel`, D5 `forceVideoCleanup` nulls only its own video, D6 single-mode special hotkey `1`, D7 all eight like/dislike tooltips derived via `_shortcutSuffix` (Group G1, Oct 5–9 Cleanup Week #4) |
| [G3 Tournament Render Re-entry][] | One way for a tournament render to restart itself: D2 `showTournamentPair()` becomes a single-flight, coalescing owner (inside a render, request — never await); D3 every tournament media failure, including the first pair `showCompareMedia` renders, auto-skips through `_skipFailedTournamentFile` (tracked prune, engine pair re-rendered); Phase 0 RED tests because the five-green-runs bar already passed on `main`; D6 `logError` string payloads normalised at the receiver (54 diagnostics logged as `undefined`); item 2 (handler guard) left unblocked, not built (Group G3, Oct 5–9 Cleanup Week #4) |
| [G1 Security Findings Fix][] | Fixes the main-process file IPC (F2) and renderer HTML encoding (F1/F3–F5). D1: local until merge, published at closeout. D2: persisted folder grants (`path-grants.js`) behind an IPC guard (`ipc-guard.js`, sender frame plus argument kinds). D3: a one-time re-pick of saved folders. D4: CSP, navigation lock, sender check and a lint guard. §12 amendments cover the measured CSP, the hash-cache value check, exact containment and the deep-review changes. Residual I1, page-side loads, closed by PR #84 (merge `4548269`; see [G1 I1 Page-Load Confinement][]). |
| [G2 Like-or-Skip Flow][] | Approved 2026-10-12, amended at planning; implemented in PR #79 (merge `96467f7`), with a post-implementation note covering six review-time departures. Single-mode like-or-skip on the AI order: D1 skips are tracked only while the AI order is on screen; D2/D3 a re-sort keeps them parked behind the cursor and lands on the new best unjudged file; D4 a separate "Re-sort · N new" chip; D5 a "Dislike N skipped" button plus single-mode `F`, behind a confirmation; D6 a pure `like-or-skip.js` module plus glue. One `_fileOpInFlight` hold and one `moveHistory` entry for the whole batch, undone by one Ctrl+A (Group G2, Oct 12–16) |
| [G3 Source CLIP Reuse][] | **Redirected 2026-10-13** to [G3 Training Video Extraction][] after the before run (only its instrumentation shipped; Task 2 parked on branch `g3-departed-clips-parked`). Approved 2026-10-13. A training-cache miss takes its CLIP half from the source folder's vectors when name, size and mtime match, so a file moved into a training folder (Explorer or in-app) is not re-run through CLIP. D1 CLIP half only — source 64-dim vectors lack file metadata (a pre-existing train/score skew, follow-up F1); D2 a session-only `departedClips` map fed at source-cache load and by `removeFileFromList`, read through one injected `lookupSourceClip`; D3 rebuild and sort timings in the perf log; measured by a user before/after run on real folders (Group G3, Oct 12–16) |
| [G3 Training Video Extraction][] | Approved 2026-10-13 (G3 re-scoped after the measure-first before run); § 11 added 2026-10-14 for the CLIP blocker. Implemented in PR #80 (merge `bf6fcad`), with a post-implementation note. Every training-folder video failed `computeFeatures` because its `seeked` handler cleared `video.src` before the async face-detection step and its `error` handler re-cleared it (an endless error loop, also in `computePerceptualHash`), so a failed file blocked the model cache and every AI sort retrained. Fix: release videos with `removeAttribute('src')` + `load()`; the perf line counts failed calls (`failed=N`); measured by a user after run. § 11: 9 still images had no CLIP vector, because main's strict sharp decode rejected them, and while CLIP is on that also blocks the cache. D6 adds a bounded lenient fallback (`clip-image.js`), and `noClip=N` names the files in the log (Group G3, Oct 12–16) |
| [G4 Recently Opened Folders][] | Approved 2026-10-16. Implemented in PR #81 (merge `51af1ab`), with § 6 amendments from the PR review (one folder load at a time; a ✕ cancels a pending check; the reworded unreachable notice) and a post-implementation note. Reopen a recent folder without the picker, which since Electron 32 is the only way in. D0 G4 before I1 (no new IPC, no page-side load); D1 the list on the drop zone plus a ▾ header menu beside change-folder; D2 a pure `recent-folders.js` module plus glue. Validated on click only (grant status → exists → open; missing → removed; unreachable → kept; ungranted → the dialog at its path), and change-folder's handler becomes `switchToFolder`. D3 (added after approval): a header folder switch during an unfinished tournament asks Save & leave / Discard / Cancel first, because `loadFolder` left it without asking and a pick's 500 ms-debounced write skipped itself once the engine was gone (Group G4, Oct 12–16) |
| [G5 CLAUDE.md Size Audit][] | Approved 2026-10-17; amended while writing (bytes-only triggers). Implemented in PR #82 (merge `3fb797e`), with § 6.2 amendments (the 69,000-byte trigger, by user ruling; three from the PR review) and a post-implementation note (the landing against the estimate). Bring `CLAUDE.md` back to durable rules only and keep it there. D1 delete history, keep one "why", reduce feature walk-throughs to contract plus spec pointer; D2 an authoring rule plus a non-blocking pre-commit size warning in bytes (`scripts/check-claude-md-size.js`), and the audit trigger moves from ~200 lines to its byte trigger, because one-line bullets grew bytes 30% in a week while lines rose 9%; D3 trim in place, one commit per section, with a disposition table and a rule-loss check that has a positive control; D4 Backlog Intake Rules becomes a pointer to BACKLOG 📌; D5 the path-scoped-rules migration stays out of scope, recommended only (Group G5, Oct 12–16) |
| [G1 I1 Page-Load Confinement][] | Approved 2026-10-18; local until the merge, published at the closeout. Implemented in PR #84 (merge `4548269`), with § 6 amendments (the flush before the marker, from the final review; the merge mark, from the PR review), a § 11 residual added at review, and a post-implementation note (§ 15). Closes G1's residual I1: confine the page's own loads to the app's files and the granted folders. D1 a custom scheme (`app://media-viewer/`; `protocol.handle('file')` and a `webRequest` gate both miss dedicated workers); D3 an allowlist; D5 same-origin media under `/@fs/`; D7 a one-time `localStorage` move; D8 the CSP as a response header; D9–D11 egress (WebRTC policy, a dead proxy, cancelled requests); D10 vendored Lucide; D12 one media-read rule for IPC and the page; D13 a pre-merge session on a profile copy. |
| [G2 Hash Sort Off the Renderer][] | Approved 2026-10-19. **PR 1 implemented: PR #85, merge `f668611`, 2026-10-20**; § 15 holds the planning amendments, and § 16 the execution notes and the user's scope rulings. PR 2 (the background route) is pending. Move the similarity sort's perceptual hashing off the renderer's main thread (today a stall of up to ~1 s per un-hashed image), so the app stays usable during a cold-cache sort of a large folder. A spike in Electron measured today's route and found a worker route that matches its hashes: WebCodecs `ImageDecoder` → YUV frame → a fresh `OffscreenCanvas`, with `createImageBitmap` for the rest (F2–F7). D1 the similarity sort only; D2 the app stays usable during a run; D3 a sticky "Similarity order ready — Show" message, nothing moves on its own; D4 the parity bar (zero differences from today's route in the same build, except a JPEG/lossy-WebP difference measured as ±1-pixel rounding, B15); D5 an in-app parity diagnostic; D6 the worker route, falling back to today's route on any failure (videos stay there); D7 two PRs — PR 1 the end-of-sort fixes on today's route, PR 2 the background route, parity mode and the user smoke (Group G2, Oct 19–23) |
| [Feature Cache Wipe Fix][] | Approved 2026-10-21. Six ways a folder's `.feature_cache.json` can be replaced by a smaller or wrong one (three probe-confirmed in the PR #85 review, three found by reading), all from one root: no load or save knows which folder visit it belongs to. Every folder visit gets a cache state (`unread` / `read` N / `absent` / `discard` / `blocked`); results and reads carry their visit; a save writes a copy frozen when requested; main refuses a write to a file it never saw or one that shrinks it past the renderer's own rule. D1 no recovery; D2 browse-time extractions in an unread folder are kept in memory, and an unread visit saves only a copy covering every file (amended after the builder check, for a cache file that cannot be read); D3 a save in flight finishes into its own folder; D4 an unexplained refusal shows a warning once per visit (amended: one explained by another writer is only logged). New `feature-cache-store.js` and `feature-cache-ledger.js`; the renderer must shrink (TODO 🔴, next PR before G2 PR 2) |
| [v2 Modules and Redesign][] | Approved 2026-10-22; the AI-sorting research was folded in after approval (§ 21: inference in a utility process, CLIP fp32, the learner fix as task A1, Group copies on DINOv2). The user skipped the question round, so § 17 lists every call Claude made. media_viewer v2: a small core (folder lifecycle, viewer, rating, compare, undo, shell) plus first-party modules the user switches on and off: `similarity`, `features`, `ai-sort`, `tournament`, and two new ones, `fetch` (gallery-dl/yt-dlp into an Inbox folder) and `compression` (lossless JPEG XL in place, originals held until finalized). A module is a folder with a manifest, a renderer ES module handed a host API that encodes today's rules, and optional main-side adapters that main requires by name, never by discovery. Main gains a folder-file service, tool grants and a supervised job runner. The shell redesign adds a mode-driven action bar, a side panel, a jobs tray and a Modules tab. Windows and Linux, both tested at every phase exit (G-8). Absorbs the v2.0 modularization release; build order P0–P8 plus task A1, similarity sort first. Revised over five PR #88 review rounds (§ 21's last five rows); **merged 2026-10-25, merge `e1c4e03`** |
| [G3 ZoomManager Extraction][] | Approved 2026-10-26; the user skipped the question round, so § 11 lists Claude's calls. Move the renderer's zoom code (~430 lines: popover, transform, pan, wheel) into a `ZoomManager` in `zoom.js` on the v2.0 pattern (injected callbacks, no back-reference), with no visible change. Characterization E2E for the wheel, double-click, pan and fullscreen paths first, each shown able to fail; before/after screenshots with a pixel diff; the old-name sweep; the `typescript-lsp` trial's last vehicle (Group G3, Oct 19–23) |
| [TASK-018 UI Polish][] | Button press effects + `cleanupFullscreen()` guard design |
| [Tournament Mode][] | Swiss-style tournament engine + `TournamentManager` + 3-way mode selector (Groups E + F) |
| [CW-V Test & Tooling Backfill][] | Test-only backfill design: comment-aware `methodSource` brace guard + `src` seam; `extractAddedLines` real-git-diff coverage (Group CW-V) |
| [G3 Bulk-Rate Re-Pair Avoidance][] | Avoid re-showing an already bulk-rated pair while still letting a rated file pair with fresh files (Group G3) |
| [G3 Re-Score & Counter Fixes][] | Deferred re-score before render + a pair counter that no longer decrements then jumps (Group G3) |

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
[Weekly Reviews 2026-09-02 Run]: superpowers/specs/2026-09-02-weekly-reviews-run.md
[Weekly Reviews 2026-10-09 Run]: superpowers/specs/2026-10-09-weekly-reviews-run.md
[Weekly Reviews 2026-10-17 Run]: superpowers/specs/2026-10-17-weekly-reviews-run.md
[Weekly Reviews 2026-09-24 Run]: superpowers/specs/2026-09-24-weekly-reviews-run.md
[G2 Tournament Bug Fixes]: superpowers/specs/2026-07-20-g2-tournament-bug-fixes-design.md
[G4 Strategic-Doc Refresh Design]: superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md
[G1 Bulk-Rate Follow-ups Design]: superpowers/specs/2026-08-29-g1-bulk-rate-followups-design.md
[G2 Tournament Undo Hardening]: superpowers/specs/2026-08-30-g2-tournament-undo-hardening-design.md
[G1 ML Training Pipeline]: superpowers/specs/2026-09-10-ml-training-pipeline-design.md
[G2 Reachable Overlay Controls]: superpowers/specs/2026-09-13-g2-reachable-overlay-controls-design.md
[G2 Hooks and Logs That Fire]: superpowers/specs/2026-10-05-g2-hooks-and-logs-that-fire-design.md
[G1 Single-Mode Rating Safety]: superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md
[G3 Tournament Render Re-entry]: superpowers/specs/2026-10-07-g3-tournament-render-reentry-design.md
[G1 Security Findings Fix]: superpowers/specs/2026-10-10-g1-security-findings-fix-design.md
[G2 Like-or-Skip Flow]: superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md
[G3 Source CLIP Reuse]: superpowers/specs/2026-10-13-g3-source-clip-reuse-design.md
[G3 Training Video Extraction]: superpowers/specs/2026-10-13-g3-training-video-extraction-design.md
[G4 Recently Opened Folders]: superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md
[G5 CLAUDE.md Size Audit]: superpowers/specs/2026-10-17-g5-claude-md-size-audit-design.md
[G1 I1 Page-Load Confinement]: superpowers/specs/2026-10-18-g1-i1-page-load-confinement-design.md
[G2 Hash Sort Off the Renderer]: superpowers/specs/2026-10-19-g2-hash-sort-off-renderer-design.md
[Feature Cache Wipe Fix]: superpowers/specs/2026-10-21-feature-cache-wipe-design.md
[v2 Modules and Redesign]: superpowers/specs/2026-10-22-v2-modules-design.md
[G3 ZoomManager Extraction]: superpowers/specs/2026-10-26-g3-zoom-manager-extraction-design.md
[TASK-018 UI Polish]: superpowers/specs/2026-03-20-task-018-ui-polish-design.md
[Tournament Mode]: superpowers/specs/2026-05-25-tournament-mode-design.md
[CW-V Test & Tooling Backfill]: superpowers/specs/2026-07-04-cw-v-test-tooling-backfill-design.md
[G3 Bulk-Rate Re-Pair Avoidance]: superpowers/specs/2026-07-24-g3-bulk-rate-repair-avoidance-design.md
[G3 Re-Score & Counter Fixes]: superpowers/specs/2026-07-25-g3-rescore-and-counter-fixes-design.md

## Security Audits

| Document | Purpose |
|----------|---------|
| [Security & Privacy Audit (2026-06-11)](security/2026-06-11-security-privacy-audit.md) | One-time secrets scan (history + working tree) + identity/PII assessment; result: ✅ PASS (Group D) |

## Archives

| Document                               | Purpose                      |
|----------------------------------------|------------------------------|
| [archive/README.md](archive/README.md) | Archive index and guidelines |

---

This index is enforced by `scripts/check-docs-index.js` (pre-commit): every file under
`docs/archive/plans/` and `docs/superpowers/specs/` must be linked here, and every link must
resolve. There is deliberately no "Last Updated" line — git records when this file last changed.
