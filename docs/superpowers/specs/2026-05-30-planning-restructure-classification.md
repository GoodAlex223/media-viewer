# BACKLOG.md Pass 1 Classification Table

**Spec:** [2026-05-30-planning-restructure-design.md](./2026-05-30-planning-restructure-design.md)
**Status:** Awaiting user audit before BACKLOG.md rewrite (Task 4)
**Generated:** 2026-05-30
**Source file:** `docs/planning/BACKLOG.md` at branch `feature/planning-restructure` HEAD

## Purpose

One row per existing section in BACKLOG.md, classified into the 3 source sections defined in the spec. **The user must audit this table before the Task 4 rewrite begins.** Push back on misclassifications, request splits, flag dups.

## Rules

- 🔵 User-Flagged — user mentioned it: manual-testing intake, feature proposals, bug reports, UX changes
- 🟡 Operational — periodic maintenance, audits, dep/version watches; NOT feature work
- 🟤 Auto-Generated — Claude/automation surfaced: PR post-merge review, code-review pass, CLAUDE.md staleness, doc-hygiene sweeps

## Verification Counts (Pre-Migration)

- Total `### ` sections: 77
- Total checkboxes (`- [ ]` + `- [x]`): 251
- Live `- [ ]` checkboxes (all, bolded + unbolded): 176
- Baseline "live-bolded" per `/tmp/backlog-baseline/live-bolded-checkboxes.txt`: 187
- **Reconciliation note:** The 11-item gap between 187 and 176 is explained by how the baseline script was generated. Our direct `grep -c '- \[ \]'` count of 176 matches 251 total − 75 done = 176 live exactly. The "187" figure in the spec likely counted markdown-table live entries (4) + some items in the `## Spawned Improvements` area that were mis-detected as bolded. For migration purposes we use **176 live checkboxes + 4 markdown-table entries = 180 trackable items**. Strikethrough `[x]` items (75) are dropped.
- Live markdown-table entries (non-strikethrough in Feature Ideas / Enhancements / Tech Debt / Research): 4
- Live unbolded Spawned-Improvements checkboxes: 30
- Live bolded checkboxes (date-grouped + Spawned): 146
- Top-level `## ` headers: 32 — collapses to 6 in new file

## Classification Table (date-grouped sections)

| # | Current header (line range) | Live items | Proposed source | Proposed new header | Notes / splits / dups |
|---|---|---|---|---|---|
| 1 | `### [2026-05-30] From: manual testing` (L16–26) | 5 | 🔵 User | `### [2026-05-30] Manual testing intake` | Both Good/Bad buttons, jump-to-N, lossless compression, compare variants, extraction timing — all user-initiated |
| 2 | `### [2026-05-28] From: PR #38 multi-agent review (post-merge)` (L29–38) | 4 | 🟤 Auto | `### [2026-05-28] PR #38 post-merge review follow-ups (4 sub-threshold items)` | Local-capture pattern, showCompareMedia guard, main-process single-flight, _persistState visibility |
| 3 | `### [2026-05-26] From: tournament-mode polish + large-folder cache crash fixes` (L41–50) | 4 | 🟤 Auto | `### [2026-05-26] Tournament polish + feature-cache streaming follow-ups` | E2E tests deferred, incremental cache serving, extraction dedup, AI-seeding validation — all Claude-surfaced during implementation |
| 4 | `### [2026-05-25] From: tournament-mode v1 manual testing` (L53–64) | 2 | 🔵 User | `### [2026-05-25] Tournament mode smoke-test intake` | UI architecture overhaul + responsive design pass — both surfaced from user smoke-testing (architecture pain points visible to user) |
| 5 | `### [2026-05-25] From: PR #36 multi-agent review (pre-merge)` (L67–74) | 2 | 🟤 Auto | `### [2026-05-25] PR #36 multi-agent review follow-ups` | Abort error string inconsistency, stale spec test count — both Claude code-review findings |
| 6 | `### [2026-05-24] From: PR #36 design + final cross-implementation review` (L77–83) | 2 | 🟤 Auto | `### [2026-05-24] PR #36 design review follow-ups` | Event-loop yielding, extractAsyncMethod extraction trigger — both Claude-surfaced during review |
| 7 | `### [2026-05-16] From: PR #35 multi-agent review (post-merge)` (L86–93) | 2 | 🟤 Auto | `### [2026-05-16] PR #35 post-merge review follow-ups` | JSDoc parity, compareMode fixture tag — both code-review hygiene items |
| 8 | `### [2026-05-14] From: PR #35 final review` (L96–102) | 2 | 🟤 Auto | `### [2026-05-14] PR #35 final review follow-ups` | handleCancel Branch 3 test gap, moveToSpecialFolder cold-cache fallback — both reviewer-flagged |
| 9 | `### [2026-05-10] From: PR #34 review-spawned + filtered-but-noted findings` (L105–113) | 3 | 🟤 Auto | `### [2026-05-10] PR #34 review follow-ups` | Duplicate progress listener, clipCache not cleared in loadFolder, design spec not indexed — all code-review outputs; note: clipCache bug is pre-existing but Claude-surfaced |
| 10 | `### [2026-05-07] From: Group A manual repro session` (L116–123) | 2 | 🔵 User | `### [2026-05-07] Manual repro session intake (Group A)` | Compare→folder-switch stale wrappers: user observed + screenshotted; hash+AI sort not mutually exclusive: user reported (and re-reported 2026-05-30) |
| 11 | `### [2026-05-05] From: manual testing` (L126–136) | 5 | 🔵 User | `### [2026-05-05] Manual testing intake` | 3-media batch mode, ML retrain UX, overlay 3-stage hover bug, rotation buttons, move-to-arbitrary-folder — all user UX observations |
| 12 | `### [2026-05-05] From: PR #33 sub-threshold findings` (L139–148) | 0 | 🟤 Auto | `### [2026-05-05] PR #33 sub-threshold findings` (skip — all items resolved) | All 4 items are `[x]` resolved; entire section can be dropped in migration |
| 13 | `### [2026-05-03] From: manual smoke test of branch` (L151–159) | 2 | 🔵 User | `### [2026-05-03] Manual smoke test intake (clip-sort-followups)` | Extraction-starting notification (UX feedback): user discovered silent no-fire; toggle-on kickoff: user UX expectation; the resolved item is `[x]` dropped |
| 14 | `### [2026-04-30] From: PR #32 post-merge review process observations` (L162–169) | 2 | 🟡 Operational | `### [2026-04-30] Process observations (PR #32 post-merge)` | E2E DONE.md reporting standardization + pre-archive checklist — both are recurring process/workflow improvements, not feature work |
| 15 | `### [2026-04-29] From: Group F closeout (PR pending)` (L172–182) | 5 | 🟡 Operational | `### [2026-04-29] Group F follow-ups (build/DX)` | regression-checker audit (🟡 maintenance), Lucide CDN migration (🟡 dep/ops), regression-checker dispatch recheck (🟡 ops), .gitignore dup line (🟡 trivial ops), regression-checker line-count drift (🟡 recurring maintenance) — all ops/maintenance |
| 16 | `### [2026-04-21] From: Group E final code review (PR #31)` (L185–191) | 3 | 🟤 Auto | `### [2026-04-21] Group E (PR #31) code-review follow-ups` | CLIP_UNLOAD_DELAY_MS constant, clipModelError reset policy, verbose comment trim — all code-reviewer Minor items |
| 17 | `### [2026-04-28] From: PR #31 post-merge code review (additional candidates)` (L192–200) | 3 | 🟤 Auto | `### [2026-04-28] PR #31 post-merge review follow-ups` | enableClipFeatures fire-time check, unloadClipModel fire-and-forget, vi.spyOn cleanup — all code-review findings |
| 18 | `### [2026-04-18] From: Group D implementation + final code review` (L203–211) | 2 | 🟤 Auto | `### [2026-04-18] Group D (CLIP sorting) follow-ups` | Extract shared MST helper, correct .sort_cache_clip.json docs — both Claude-surfaced during implementation; 3 `[x]` items dropped |
| 19 | `### [2026-04-20] From: PR #30 code review` (L212–220) | 3 | 🟤 Auto | `### [2026-04-20] PR #30 code-review follow-ups` | CLIP count notification bug, K_NEIGHBORS naming, empty-array cosine edge case — all code-review findings |
| 20 | `### [2026-04-08] From: manual testing` (L223–235) | 7 | 🔵 User | `### [2026-04-08] Manual testing intake` | Add-on system design, sort add-ons, platform integrations, link-based media, embedded players, progressive loading, window size + Ctrl+/- zoom — all user feature ideas |
| 21 | `### [2026-04-11] From: Group C implementation observations` (L238–246) | 3 | 🟤 Auto | `### [2026-04-11] Group C (test quality) follow-ups` | afterEach standardization, waitForTimeout magic numbers, page.evaluate guard — all Claude E2E test-hygiene observations |
| 22 | `### [2026-04-05] From: TASK-028 implementation + manual testing` (L249–251) | 0 | — | (empty section — header only) | Section has no checkboxes; serves as origin label. Merged into PR #26 section below in migration, or dropped. |
| 23 | `### [2026-04-08] From: PR #26 code review` (L252–269) | 4 | 🟤 Auto | `### [2026-04-08] PR #26 (TASK-028) code-review follow-ups` | CLIP text-search, CLIP similarity sorting, unload CLIP after extraction, GPU acceleration — 4 live items; 10 `[x]` items dropped; note: CLIP text-search + sorting are feature ideas but were Claude-surfaced during code review (not user-originated) — flagged with `?` |
| 24 | `### [2026-04-09] From: CLIP/ML Pipeline Cleanup` (L270–275) | 2 | 🟤 Auto | `### [2026-04-09] CLIP/ML Pipeline Cleanup follow-ups` | DRY CLIP embedding averaging, audit ipcRenderer.on() accumulation — both implementation-observation items |
| 25 | `### [2026-04-10] From: PR #27 code review` (L276–284) | 3 | 🟤 Auto | `### [2026-04-10] PR #27 code-review follow-ups` | Rename deleteMlModelCache, add deleteFile IPC, null guard in enqueueFeatureExtraction — all code-review findings |
| 26 | `### [2026-04-03] From: PR #25 code review` (L287–297) | 0 | 🟤 Auto | (skip — all items resolved) | All 5 items `[x]`; section can be dropped in migration |
| 27 | `### [2026-03-27] From: TASK-026 implementation` (L300–306) | 3 | 🟤 Auto | `### [2026-03-27] TASK-026 (keyboard shortcuts) implementation follow-ups` | Extract ShortcutManager module, modifier key display prettify, E2E userData isolation — all implementation-surfaced observations |
| 28 | `### [2026-03-28] From: PR #24 code review` (L307–320) | 3 | 🟤 Auto | `### [2026-03-28] PR #24 code-review follow-ups` | docs/README.md not updated, archived plan unchecked boxes, compare right-pane assertion removed — 3 live, 5 `[x]` dropped |
| 29 | `### [2026-03-26] From: TASK-025 implementation + code review` (L323–331) | 3 | 🟤 Auto | `### [2026-03-26] TASK-025 (logging) implementation follow-ups` | Double-init logger, console interception scope, unhandled rejection message clarity — all Claude-surfaced implementation observations |
| 30 | `### [2026-03-27] From: PR #23 code review (TASK-025)` (L334–345) | 5 | 🟤 Auto | `### [2026-03-27] PR #23 code-review follow-ups` | IPC crash on malformed payload, archived plan status, unchecked checkboxes, deviation not documented, DONE.md wrong path — 5 live, 3 `[x]` dropped; all code-review / doc-hygiene items |
| 31 | `### [2026-03-24] From: PR #21 code review (TASK-023)` (L346–353) | 4 | 🟤 Auto | `### [2026-03-24] PR #21 code-review follow-ups` | Duplicate Git Insights entries, explanatory comments, Plan: field in DONE.md, "3 calls" wording — all doc/code-review hygiene |
| 32 | `### [2026-03-25] From: PR #22 code review (TASK-024)` (L354–366) | 9 | 🟤 Auto | `### [2026-03-25] PR #22 code-review follow-ups` | CLAUDE.md cache docs, test assertion name, reuse fileInfo, clear extractionStartTime, _extractionCachedCount, misleading comment, guard loadFeatureCache, index spec, add "Status: Complete" — all code-review findings |
| 33 | `### [2026-03-25] From: TASK-024 (Per-folder feature cache fix)` (L369–374) | 2 | 🟤 Auto | `### [2026-03-25] TASK-024 follow-ups` | Replace mediaFiles.find() with Map, unit tests for loadFeatureCache validation — both implementation follow-ups |
| 34 | `### [2026-03-23] From: TASK-023 (Fix video pause/play icon synchronization)` (L375–380) | 2 | 🟡 Operational | `### [2026-03-23] TASK-023 follow-ups` | Pin Lucide CDN (🟡 dep/ops — ongoing maintenance), add regression test for play/pause (🟤? implementation gap) — mixed; Lucide pin is ops, test is auto? Mark as 🟡 Operational overall since both are maintenance |
| 35 | `### [2026-03-22] From: TASK-022 (Fix compare mode last-pair error cascade)` (L381–386) | 2 | 🟤 Auto | `### [2026-03-22] TASK-022 follow-ups` | DRY toggleViewMode, handle partial failure in compare-pair undo — both implementation follow-ups |
| 36 | `### [2026-03-21] From: TASK-019 (Extract fullscreen module from media-viewer.js)` (L387–395) | 5 | 🟤 Auto | `### [2026-03-21] TASK-019 (FullscreenManager) follow-ups` | Rename abortController(), isWrapperZoomed, unit tests for FullscreenManager, clear wasPlaying, ESLint block 2c label — implementation-surfaced |
| 37 | `### [2026-03-21] From: TASK-020 — ML sorting pair ordering investigation` (L396–404) | 5 | 🟤 Auto | `### [2026-03-21] TASK-020 (ML sorting) follow-ups` | Content-understanding features, auto re-sort, diagnostics panel, margin-based pairing, score confidence — all from ML investigation, Claude-surfaced; note: some are substantial feature ideas (auto re-sort, diagnostics) — flagged with `?` for possible reclassification to 🔵 |
| 38 | `### [2026-03-21] From: code-review-pr-18 (Post-merge review findings)` (L405–415) | 7 | 🟤 Auto | `### [2026-03-21] PR #18 code-review follow-ups` | Dead _extractMethod, pendingCompareRefresh cleanup, dead bypass code, signalUserActivity order, user feedback during pending, mark items done, previousScores edge case — all code-review |
| 39 | `### [2026-03-21] From: TASK-021 (Fix compare mode overlay controls UX)` (L416–420) | 1 | 🟤 Auto | `### [2026-03-21] TASK-021 follow-ups` | Smart overlay positioning — implementation follow-up |
| 40 | `### [2026-03-22] From: code-review-pr-19 (TASK-021 overlay controls UX)` (L421–429) | 5 | 🟤 Auto | `### [2026-03-22] PR #19 code-review follow-ups` | transition-delay fullscreen rule (already fixed, kept as reference), :active animation on overlay-btn, documentation claim fix, zoom popover overflow verify, archived plan checkboxes — all code-review; note: `Add transition-delay: 0s` says "Fixed in 74cf251 — keeping for reference" so effectively a historical note |
| 41 | `### [2026-03-21] From: code-review-pr-17 (Post-merge review findings)` (L430–436) | 1 | 🟤 Auto | `### [2026-03-21] PR #17 code-review follow-ups` | Update regression-checker.md for FullscreenManager — 1 live (2 `[x]` dropped); doc maintenance item |
| 42 | `### [2026-03-20] From: TASK-018 (UI polish: button press effects and fullscreen guard)` (L437–442) | 2 | 🟤 Auto | `### [2026-03-20] TASK-018 follow-ups` | :hover on nav buttons, consolidate :hover rules — implementation follow-ups |
| 43 | `### [2026-03-20] From: code-review-pr-16` (L443–448) | 0 | 🟤 Auto | (skip — all items resolved) | All 2 items `[x]`; section can be dropped in migration |
| 44 | `### [2026-03-20] From: TASK-017 (ESLint config and documentation alignment)` (L449–454) | 2 | 🟤 Auto | `### [2026-03-20] TASK-017 follow-ups` | Add globals.browser to ESLint block 3b, audit CLAUDE.md Git Insights for stale references — both implementation follow-ups / ops |
| 45 | `### [2026-03-20] From: code-review-pr-15` (L455–460) | 1 | 🟤 Auto | `### [2026-03-20] PR #15 code-review follow-ups` | Document waitForNotification() retention decision — 1 live (1 `[x]` dropped) |
| 46 | `### [2026-03-20] From: TASK-016 (E2E test reliability improvements)` (L461–465) | 2 | 🟤 Auto | `### [2026-03-20] TASK-016 follow-ups` | Vitest transient failures, use waitForNotification() in future E2E — implementation follow-ups |
| 47 | `### [2026-03-20] From: TASK-015 (Fix zoom and extraction bugs)` (L466–470) | 2 | 🟤 Auto | `### [2026-03-20] TASK-015 follow-ups` | Rename closeAllZoomPopovers(), unit test for AbortController cleanup — implementation follow-ups |
| 48 | `### [2026-03-20] From: code-review-pr-14` (L471–477) | 3 | 🟤 Auto | `### [2026-03-20] PR #14 code-review follow-ups` | Extraction cleanup ordering, CLAUDE.md signalUserActivity docs, removeZoomPopover single mode — all code-review findings |
| 49 | `### [2026-03-12] From: TASK-013 (Unit test infrastructure)` (L478–482) | 1 | 🟤 Auto | `### [2026-03-12] TASK-013 follow-ups` | Deduplicate MinHeap/VPTree — 1 live (1 `[x]` dropped) |
| 50 | `### [2026-03-11] From: TASK-012 (Pre-commit hooks)` (L483–487) | 2 | 🟤 Auto | `### [2026-03-11] TASK-012 follow-ups` | Promote no-shadow to error, add ESLint no-console rule — implementation follow-ups |
| 51 | `### [2026-03-12] From: code-review-pr-11` (L488–495) | 0 | 🟤 Auto | (skip — all items resolved) | All 3 items `[x]`; section can be dropped |
| 52 | `### Sorting & ML` (L498–507) | 0 | 🔵 User? | (empty subsection inside `## Feature Ideas` markdown table) | No checkboxes; this is the subsection header inside the Enhancements markdown table. In the new structure it becomes part of the Feature Ideas prose rows. |
| 53 | `### 2025-12-27 From: sorting-cache` (L555–560) | 0 | 🟤 Auto | (skip — all items resolved) | All `[x]` promoted to TODO. Entire section dropped. |
| 54 | `### 2025-12-28 From: background-feature-extraction` (L561–567) | 0 | 🟤 Auto | (skip — all items resolved) | All `[x]` promoted to TODO. Entire section dropped. |
| 55 | `### 2025-12-29 From: video-fullscreen-toggle` (L568–573) | 0 | 🟤 Auto | (skip — all items resolved) | All `[x]` promoted to TODO. Entire section dropped. |
| 56 | `### 2026-01-02 From: compare-mode-ai-sort-bug` (L574–579) | 0 | 🟤 Auto | (skip — all items resolved) | All `[x]` promoted to TODO. Entire section dropped. |
| 57 | `### 2026-02-05 From: visual-scale-controls` (L580–587) | 2 | 🔵 User | `### [2026-02-05] visual-scale-controls follow-ups` | Zoom level persistence, slider width responsive — plan-spawned improvements; zoom level persistence was originally user-driven (part of the visual-scale-controls plan) |
| 58 | `### 2026-02-05 From: code-review-pr-1` (L588–593) | 1 | 🟤 Auto | `### [2026-02-05] PR #1 code-review follow-up` | Document fullscreen zoom decision reversal — 1 live (1 `[x]` dropped); doc-hygiene follow-up |
| 59 | `### 2026-02-06 From: centralized-remove-file` (L594–600) | 2 | 🟤 Auto | `### [2026-02-06] centralized-remove-file follow-ups` | Batch removal support, event-based cache invalidation — implementation follow-ups; 1 `[x]` dropped |
| 60 | `### 2026-02-06 From: code-review-pr-2` (L601–605) | 1 | 🟤 Auto | `### [2026-02-06] PR #2 code-review follow-up` | Index strategy parameter for removeFileFromList — code-review finding |
| 61 | `### 2026-02-06 From: compare-file-validation` (L606–611) | 2 | 🟤 Auto | `### [2026-02-06] compare-file-validation follow-ups` | Add same validation to showSingleMedia, batch file validation on folder refresh — implementation follow-ups |
| 62 | `### 2026-02-24 From: fullscreen-exithandler-leak-guard` (L612–617) | 0 | 🟤 Auto | (skip — all items resolved) | All `[x]`. Section dropped. |
| 63 | `### 2026-02-24 From: task-006-unified-fullscreen-cleanup` (L618–622) | 0 | 🟤 Auto | (skip — all items resolved) | All `[x]` (superseded by TASK-019). Section dropped. |
| 64 | `### 2026-02-25 From: task-007-force-resort-option` (L623–628) | 1 | 🟤 Auto | `### [2026-02-25] TASK-007 follow-ups` | Force re-sort for ML prediction sort — 1 live (1 `[x]` dropped) |
| 65 | `### 2026-03-05 From: task-009-worker-count-setting` (L629–635) | 3 | 🟤 Auto | `### [2026-03-05] TASK-009 follow-ups` | Auto-detect hardwareConcurrency, show active worker count, reinitialize pool on change — all implementation follow-ups |
| 66 | `### 2026-03-05 From: task-008-cache-age-display` (L636–642) | 3 | 🟤 Auto | `### [2026-03-05] TASK-008 follow-ups` | Reuse formatTimeAgo(), month-level granularity, fix stale timestamp after cache merge — implementation follow-ups |
| 67 | `### 2026-03-05 From: task-011-pause-extraction` (L643–648) | 2 | 🟤 Auto | `### [2026-03-05] TASK-011 follow-ups` | Move loadMediaAsImageData off main thread, per-file extraction gate — implementation follow-ups |
| 68 | `### 2026-03-11 From: code-review-pr-10` (L649–655) | 1 | 🟤 Auto | `### [2026-03-11] PR #10 code-review follow-up` | Remove dangling abort listener in awaitExtractionGate — 1 live (2 `[x]` dropped) |
| 69 | `### 2026-03-05 From: task-010-extraction-eta` (L656–662) | 3 | 🟤 Auto | `### [2026-03-05] TASK-010 follow-ups` | Show extraction rate, reuse formatElapsed(), generation counter for sort cancellation — implementation follow-ups |
| 70 | `### 2026-03-12 From: code-review-pr-12` (L663–669) | 2 | 🟤 Auto | `### [2026-03-12] PR #12 code-review follow-ups` | Move sorting-worker.js to ESLint block, add globalThis.self teardown — 2 live (1 `[x]` dropped) |
| 71 | `### [2026-03-13] From: TASK-014 (Playwright E2E tests)` (L670–675) | 2 | 🟤 Auto | `### [2026-03-13] TASK-014 follow-ups` | Test E2E on Unix/macOS, auto-detect loader.js path — 2 live (1 `[x]` dropped); CI/infra items |
| 72 | `### [2026-03-18] From: code-review-pr-13` (L676–683) | 0 | 🟤 Auto | (skip — all items resolved) | All 4 `[x]`. Section dropped. |
| 73 | `### [2026-03-19] From: Manual testing session` (L684–696) | 0 | 🔵 User | (skip — all items resolved) | All 9 `[x]` promoted to TODO (TASK-020 through TASK-028). Section dropped. |
| 74 | `### 2026-04-03 From: TASK-027 (undo empty state fix)` (L697–702) | 2 | 🟤 Auto | `### [2026-04-03] TASK-027 follow-ups` | Centralized insertFileIntoList(), allow F1 in empty state — implementation follow-ups |
| 75 | `### 2026-02-06 From: code-review-pr-3` (L703–707) | 0 | 🟤 Auto | (skip — all items resolved) | All 1 `[x]`. Section dropped. |
| 76 | `### 2026-04-10 From: compare-mode-fix` (L708–713) | 2 | 🟤 Auto | `### [2026-04-10] compare-mode-fix follow-ups` | Make hideDropZone() mode-aware, try/finally cleanup in compare E2E — implementation follow-ups |
| 77 | `### [2026-04-11] From: PR #28 code review` (L714–722) | 3 | 🟤 Auto | `### [2026-04-11] PR #28 code-review follow-ups` | Redundant calls in switchToSingleModeUI, double isCompareMode=false, standardize E2E waitForTimeout — code-review findings |

---

## Classification Table (markdown-table live entries — table-row→checkbox conversions)

These 4 entries are live (non-strikethrough) rows in `## Enhancements` and `## Technical Debt`. They will be converted to `- [ ]` checkboxes in the new file.

| # | Source table | Current row text | Proposed source | Proposed checkbox shape | Synthesized intake date |
|---|---|---|---|---|---|
| 1 | `## Enhancements` | `Anonymize author field in package.json if privacy desired` | 🟡 Operational | `- [ ] **Anonymize author field in package.json** — Security audit follow-up (2026-02-05). Check if author email/name in package.json should be anonymized for privacy. Low effort.` | 2026-02-05 |
| 2 | `## Enhancements` | `Zoom level persistence across navigation` | 🔵 User | `- [ ] **Zoom level persistence across navigation** — Remember zoom level when navigating between media of similar size. Plan: 2026-02-05_visual-scale-controls. Effort: M.` | 2026-02-05 (already in Spawned row 57 — possible dup, see Notes) |
| 3 | `## Enhancements` | `Document fullscreen zoom reversal from TASK-001` | 🟤 Auto | `- [ ] **Document fullscreen zoom reversal from TASK-001** — TASK-002 re-enabled wheel zoom/pan in fullscreen reversing TASK-001 decision (d3b08bb). Add rationale to PROJECT_CONTEXT.md. Low effort.` | 2026-02-05 (also in Spawned row 58 — definite dup, see Notes) |
| 4 | `## Technical Debt` | `Verify no secrets in git history` | 🟡 Operational | `- [ ] **Verify no secrets in git history** — Run \`git log -p --all -S <pattern>\` to confirm no credentials were accidentally committed. High impact, low effort. Added 2026-02-05.` | 2026-02-05 |

**Notes on dups:**
- Row 2 (`Zoom level persistence`) is a dup of Spawned section `2026-02-05 From: visual-scale-controls` → `Zoom level persistence` (row 57 above, L585). During migration, keep only one copy — preferably in the Spawned section since it has more context.
- Row 3 (`Document fullscreen zoom reversal`) is a dup of Spawned section `2026-02-05 From: code-review-pr-1` → `Document fullscreen zoom decision reversal` (row 58 above, L592). During migration, keep only one copy — preferably in the Spawned section.

---

## Classification Table (Spawned Improvements live checkboxes)

All live `- [ ]` items in `## Spawned Improvements`. Closed `[x]` items are dropped.

| # | Source sub-section | Current item text (truncated) | Proposed source | Notes |
|---|---|---|---|---|
| 1 | `### 2026-02-05 From: visual-scale-controls` (L580) | `Zoom level persistence — Remember zoom level when navigating between media of similar size` | 🔵 User | Dup of Enhancements markdown table row 2 above — keep this version, drop the table row |
| 2 | `### 2026-02-05 From: visual-scale-controls` (L586) | `Slider width responsive to popover space — Wider slider on larger screens for finer control` | 🟤 Auto | Surfaced from visual-scale-controls plan implementation |
| 3 | `### 2026-02-05 From: code-review-pr-1` (L592) | `Document fullscreen zoom decision reversal — TASK-002 re-enabled wheel zoom and pan in fullscreen, reversing TASK-001 decision` | 🟤 Auto | Dup of Enhancements markdown table row 3 above — keep this version, drop the table row |
| 4 | `### 2026-02-06 From: centralized-remove-file` (L597) | `Batch removal support — removeFilesFromList(filePaths[]) for removing multiple files in one operation` | 🟤 Auto | Implementation follow-up |
| 5 | `### 2026-02-06 From: centralized-remove-file` (L599) | `Event-based cache invalidation — Emit 'file-removed' event so new caches auto-subscribe` | 🟤 Auto | Implementation follow-up |
| 6 | `### 2026-02-06 From: code-review-pr-2` (L604) | `Index strategy parameter for removeFileFromList() — Add optional indexStrategy param` | 🟤 Auto | Code-review finding |
| 7 | `### 2026-02-06 From: compare-file-validation` (L609) | `Add same validation to showSingleMedia() — Same file-existence vulnerability in single view mode` | 🟤 Auto | Implementation follow-up |
| 8 | `### 2026-02-06 From: compare-file-validation` (L610) | `Batch file validation on folder refresh — Validate all files in mediaFiles[] at once, removing stale entries` | 🟤 Auto | Implementation follow-up |
| 9 | `### 2026-02-25 From: task-007-force-resort-option` (L627) | `Force re-sort for ML prediction sort — Apply Shift+click force re-sort pattern to handleSortByPrediction()` | 🟤 Auto | Implementation follow-up |
| 10 | `### 2026-03-05 From: task-009-worker-count-setting` (L632) | `Auto-detect optimal worker count via navigator.hardwareConcurrency` | 🟤 Auto | Implementation follow-up |
| 11 | `### 2026-03-05 From: task-009-worker-count-setting` (L633) | `Show active worker count in background extraction progress` | 🟤 Auto | Implementation follow-up |
| 12 | `### 2026-03-05 From: task-009-worker-count-setting` (L634) | `Reinitialize worker pool on setting change or show restart hint` | 🟤 Auto | Implementation follow-up |
| 13 | `### 2026-03-05 From: task-008-cache-age-display` (L639) | `Reuse formatTimeAgo() for other timestamps` | 🟤 Auto | Implementation follow-up |
| 14 | `### 2026-03-05 From: task-008-cache-age-display` (L640) | `Add month-level granularity to formatTimeAgo()` | 🟤 Auto | Implementation follow-up |
| 15 | `### 2026-03-05 From: task-008-cache-age-display` (L641) | `Fix stale timestamp display when new files merged into cache` | 🟤 Auto | Implementation follow-up |
| 16 | `### 2026-03-05 From: task-011-pause-extraction` (L646) | `Move loadMediaAsImageData off main thread — Use OffscreenCanvas in workers` | 🟤 Auto | Implementation follow-up |
| 17 | `### 2026-03-05 From: task-011-pause-extraction` (L647) | `Per-file extraction gate instead of per-batch` | 🟤 Auto | Implementation follow-up |
| 18 | `### 2026-03-11 From: code-review-pr-10` (L654) | `Remove dangling abort listener in awaitExtractionGate` | 🟤 Auto | Code-review finding |
| 19 | `### 2026-03-05 From: task-010-extraction-eta` (L659) | `Show extraction rate in progress pill` | 🟤 Auto | Implementation follow-up |
| 20 | `### 2026-03-05 From: task-010-extraction-eta` (L660) | `Reuse formatElapsed() for other timed operations` | 🟤 Auto | Implementation follow-up |
| 21 | `### 2026-03-05 From: task-010-extraction-eta` (L661) | `Apply generation counter pattern to sort cancellation` | 🟤 Auto | Implementation follow-up |
| 22 | `### 2026-03-12 From: code-review-pr-12` (L666) | `Move sorting-worker.js to ESLint block 3b or create separate block` | 🟤 Auto | Code-review finding |
| 23 | `### 2026-03-12 From: code-review-pr-12` (L668) | `Add globalThis.self teardown in sorting-worker.test.js` | 🟤 Auto | Code-review finding |
| 24 | `### [2026-03-13] From: TASK-014 (Playwright E2E tests)` (L672) | `Test E2E suite on Unix/macOS` | 🟤 Auto | Infrastructure gap surfaced during implementation |
| 25 | `### [2026-03-13] From: TASK-014 (Playwright E2E tests)` (L673) | `Auto-detect playwright-core loader.js path in rdp-preload.cjs` | 🟤 Auto | Implementation follow-up |
| 26 | `### 2026-04-03 From: TASK-027 (undo empty state fix)` (L700) | `Centralized insertFileIntoList() method — Extract reusable file insertion logic from 4 undo branches` | 🟤 Auto | Implementation follow-up |
| 27 | `### 2026-04-03 From: TASK-027 (undo empty state fix)` (L701) | `Allow F1 (help) through keydown guard in empty state` | 🟤 Auto | Implementation follow-up; could be 🔵 User if the user raised this during testing — flagged `?` |
| 28 | `### 2026-04-10 From: compare-mode-fix` (L711) | `Make hideDropZone() mode-aware — Currently unconditionally shows .controls` | 🟤 Auto | Implementation follow-up |
| 29 | `### 2026-04-10 From: compare-mode-fix` (L712) | `Add try/finally cleanup to pre-existing twoFileTmp in compare-mode E2E` | 🟤 Auto | Implementation follow-up |
| 30 | `### [2026-04-11] From: PR #28 code review` (L717) | `Redundant calls in switchToSingleModeUI() via toggleViewMode()` | 🟤 Auto | Code-review finding |
| 31 | `### [2026-04-11] From: PR #28 code review` (L718) | `Double isCompareMode = false in toggleViewMode()` | 🟤 Auto | Code-review finding |
| 32 | `### [2026-04-11] From: PR #28 code review` (L719) | `Standardize E2E waitForTimeout durations — Compare-mode tests use 200ms/300ms/500ms/1000ms` | 🟤 Auto | Code-review finding; also appears in `## Group C` (row #21 above, `### [2026-04-11] From: Group C implementation observations` L243) — flagged `?` possible dup |

**Note:** The `## Spawned Improvements` unbolded items (rows 1–32 above) are NOT currently tracked in the date-grouped table; they live in old-format sub-sections. In the new BACKLOG.md they should be merged into the appropriate source section by their intake date and source type.

---

## Items per Section Counts

### Date-grouped sections — live items by source

| Source | Sections | Live items |
|--------|----------|------------|
| 🔵 User-Flagged | Rows 1, 4, 10, 11, 13, 20, 57, 73 (zero-live but user-origin) | 5+2+2+5+2+7+2+0 = **25** |
| 🟡 Operational | Rows 14, 15, 34 | 2+5+2 = **9** |
| 🟤 Auto-Generated | Rows 2, 3, 5–9, 12, 16–19, 21–33, 35–56, 58–72, 74–77 (all remaining) | sum = **142** |
| Resolved (all [x]) | Rows 12, 26, 43, 51, 53–56, 62–63, 72, 73, 75 | 0 items (dropped) |

**Date-grouped live total: 25 + 9 + 142 = 176**

### Markdown-table conversions — live items by source

| Source | Count |
|--------|-------|
| 🔵 User-Flagged | 1 (Zoom level persistence — but is a dup, likely dropped) |
| 🟡 Operational | 2 (Anonymize author, Verify no secrets) |
| 🟤 Auto-Generated | 1 (Document fullscreen zoom reversal — but is a dup, likely dropped) |

**Markdown-table unique (after dedup): 2 items (rows 1, 4)**

### Spawned Improvements live items by source

| Source | Count |
|--------|-------|
| 🔵 User-Flagged | 1 (row 1: Zoom level persistence) |
| 🟤 Auto-Generated | 31 (rows 2–32) |
| `?` ambiguous | rows 27, 32 flagged |

**Spawned live total: 32 items**

### Reconciliation

```
Total live checkboxes in file:                        176
  + Markdown-table live entries (non-dup):              2
  (Markdown-table rows 2 & 3 are dups of Spawned rows 1 & 3 — deduplicated in migration)
  = Unique trackable live items:                       178

Baseline "live-bolded" per /tmp/backlog-baseline:     187
  Gap: 187 - 176 = 11 — explained by baseline script methodology
    (likely counted markdown table rows as checkboxes + slight counting difference
     in Spawned unbolded items; exact script not available to verify)

After migration (dedup the 2 dup items):
  Date-grouped live:                176
  Spawned (already counted in sections above):
    - Spawned items already captured in section-level counts: yes, 
      Spawned items ARE the unbolded live items in the section-line-range counts
      (they are counted in the respective section row's "live items" column)
  Markdown-table new unique items added:               2
  Grand total migrated trackable items:              178
```

**Conclusion:** After removing the 2 duplicate markdown-table entries (already represented in Spawned sections), the migrated BACKLOG.md will contain **178 unique live items** (176 from checkboxes + 2 genuinely new from markdown tables that don't appear as checkboxes).

---

## Ambiguous / Flagged Items

Items marked `?` that the user should review during Task 3 audit:

1. **Row 23, PR #26 code review** — CLIP text-search UI and CLIP similarity sorting: these are substantial feature ideas but were surfaced by Claude during code review (not user-initiated). Classified 🟤 Auto. **Question: should these be promoted to 🔵 User since they are meaningful user-facing features?**

2. **Row 37, TASK-020 ML sorting** — Auto re-sort after N ratings, model diagnostics panel: these are substantial features that go beyond implementation hygiene. Classified 🟤 Auto (Claude-surfaced investigation). **Question: reclassify to 🔵 User?**

3. **Row 34, TASK-023** — Mixed: "Pin Lucide CDN" is 🟡 Operational but "Add regression test for play/pause" is closer to 🟤 Auto. Classified 🟡 Operational overall. **Question: split into two rows?**

4. **Spawned row 27** — `Allow F1 (help) through keydown guard in empty state` — Could be user-raised during testing or Claude-surfaced during implementation. Classified 🟤 Auto. **Question: did the user raise this?**

5. **Spawned row 32** — `Standardize E2E waitForTimeout durations` — Appears to also be present in `## From Group C Test Quality` (row #21, L242). **Potential dup: verify before migration.**

---

## Bucket Summary

| Source | Date-grouped rows | Spawned rows | Markdown-table rows | Live item count |
|--------|---|---|---|---|
| 🔵 User-Flagged | 8 sections | 1 item | 1 (dup) | ~26 |
| 🟡 Operational | 3 sections | 0 | 1 | ~11 |
| 🟤 Auto-Generated | 54 sections | 31 items | 2 (1 dup) | ~141 |
| Resolved/dropped | 12 sections | — | — | 0 |
| **Total** | **77 sections** | **32 items** | **4 entries** | **~178** |

---

## Audit Sign-Off

- [x] User reviewed and approved the classification (date: 2026-05-30, approved as-is)
- [x] Any flagged misclassifications corrected — none requested; all 5 `?` ambiguous rows accepted at their proposed source
- [x] Dup markdown-table entries confirmed (rows 2 & 3 match spawned rows 1 & 3) — to be deduplicated during Task 4 rewrite
- [x] Sum of live items matches expected post-migration count (~178 unique items)
