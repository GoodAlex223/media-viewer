# Weekly Plan

**Week**: Monday June 1 – Friday June 5, 2026
**Created**: 2026-05-31
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md, BACKLOG.md (📌 Process Rules), TODO.md, git log (last 2 weeks), previous WEEKLY.md (May 11–15, archived below)
**Type**: 🟢 Normal week (user-priority). A Cleanup Week is **due** but deferred — see Quota Check.

**Context**: User-priority week led by two 🔴 Critical user-flagged items. The week leads off with a **re-rate / mode-correction** feature (compare + tournament) — pulled ahead of everything else at the user's request so the correction UX can be dogfooded as early as possible (compare correction testable EOD Mon, tournament correction Tue). **JXL + extended-format viewer support** follows immediately as the 🏆 Weekly Challenge (user flagged it urgent — it blocks opening files the user already has). Total raised to **30 SP** (above the 25 baseline) at the user's explicit direction so nothing is truncated; daily load stays within the 5–8 SP band. No formal carry-forward (May 11–15 fully closed; Groups C/D landed via PR #36 on 2026-05-24).

---

## Parallel Work

_(No ongoing background tasks this week.)_

---

## Task Groups

### Group 0: Re-rate / mode-correction (compare + tournament) 🔵
**Domain**: JS logic (rating correction + ML training)
**Source**: 🔵 User-Flagged
**Total SP**: 8 — solo (large, multi-mode)

- [x] **"Both good / Both bad" corrective-training buttons in AI-sorted compare** — 5 SP, 🟠 IMPORTANT — ✅ **shipped 2026-06-02** (branch `feature/re-rate-mode-correction`; see [DONE.md](DONE.md)). Deviations: suppression dropped (regular-post treatment), shortcuts KeyD/KeyF, buttons in `#compareActionBar`. Manual-testing fixes in `b32b718`.
  - Per [BACKLOG.md:60](BACKLOG.md#L60) (2026-05-30). Two buttons grouped with `#cancelBtnCompare`; visible only when `isSortedByPrediction === true && isCompareMode === true`. Each click calls `updateMlModelAfterRating(file, ±1)` for **both** files at full strength; files **stay in the source folder** (no move). Persisted to per-folder `.bulk_rated.json` via new `readBulkRatedFile`/`writeBulkRatedFile` IPC; pair-selection soft-suppresses bulk-rated pairs with fall-through; undo (Ctrl+A) reverses both updates and removes both from `bulkRatedSet`; shortcuts `bothGood: 'KeyS'`, `bothBad: 'KeyD'`; integrated into `trainFromHistoricalRatingsAndWait()` so corrections survive model reset.
  - Affected: [media-viewer.js](../../media-viewer.js), [index.html](../../index.html), [styles.css](../../styles.css), [main.js](../../main.js) + [preload.js](../../preload.js) (IPC), [tests/media-viewer-utils.test.js](../../tests/media-viewer-utils.test.js), [tests/e2e/compare-mode.test.js](../../tests/e2e/compare-mode.test.js).
- [x] **Re-rate / mark-as-equal in tournament mode** — 3 SP, 🟠 IMPORTANT — ✅ **shipped 2026-06-03** (branch `feature/tournament-re-rate`; see [DONE.md](DONE.md)). Design decision: **mark-as-equal** (not re-pick — undo already re-shows the last pair). Two draw buttons **Both Win** (both +1) / **Both Lose** (both +0) via `SwissStrategy.recordDraw` + `TournamentEngine.recordDraw` (reuses existing `undo()` + `strategyStateSnapshot`, zero new undo code); shortcuts `bothWin: 'KeyD'` / `bothLose: 'KeyF'`. No ML, no new IPC, no persistence-format change. 264→275 unit tests.
  - Tournament picks only affect tier assignment (files move to `_Tier-N` at Apply), so "wrongly rated by mode" means a pick that mis-tiered a file. Add an affordance to redo/override the current or a recent pick (extends the existing "Undo last pick"); short design pass required since the BACKLOG entry explicitly scoped the correction buttons to compare-only. Decide: re-pick last pair vs. mark-as-equal (both advance / neither). Reuse the engine's existing `undo()` + `strategyStateSnapshot` machinery where possible.
  - Affected: [tournament.js](../../tournament.js) (TournamentManager + engine interaction), [tournament-engine.js](../../tournament-engine.js) (override/re-pick path), [media-viewer.js](../../media-viewer.js) (tournament overlay control), [index.html](../../index.html)/[styles.css](../../styles.css) (button), [tests/tournament-manager.test.js](../../tests/tournament-manager.test.js).

### Group A: JXL + extended-format viewer support 🏆 🔵
**Domain**: JS logic (decode pipeline)
**Source**: 🔵 User-Flagged
**Total SP**: 8 — solo (🔴 Critical, urgent)

- [x] **Add JXL + extended-format viewing (full commit)** — 8 SP, 🔴 IMPORTANT (URGENT, user-flagged) — ✅ **shipped 2026-06-07** (branch `feature/jxl-viewer-support`; see [DONE.md](DONE.md)). Scope narrowed to JXL-only (static + animated); 289 unit tests + 1 E2E smoke; plan archived. 5 BACKLOG follow-ups spawned.
  - Per TODO.md "JXL + extended format viewer support" (🔴 Critical). User produces JXL (+ other formats from the sibling `media_compression` project) the viewer can't currently open. Chromium dropped native JPEG XL in 2022 → an in-app WASM decoder is required (`jxl-oxide-wasm` or official `libjxl` WASM build).
  - Acceptance: audit `media_compression` extensions (which render natively vs need a decoder); WASM lib evaluation (licence / bundle size / perf / animated-JXL); expand `SUPPORTED_EXTENSIONS` / file-type detection in [main.js](../../main.js); decode→Canvas→blob branch in `showSingleMedia`/`showCompareMedia` (native vs WASM); feature-extraction (hand-crafted + CLIP) on decoded JXL via the existing ImageData path; loading state during decode; graceful fallback on decode failure; unit test (format detection) + E2E smoke (fixture JXL).
  - Affected: [main.js](../../main.js), [media-viewer.js](../../media-viewer.js), [preload.js](../../preload.js), [package.json](../../package.json), [index.html](../../index.html).

### Group B: Mode-switch display bugs [batch] 🔵
**Domain**: JS logic (mode/compare UI state)
**Source**: 🔵 User-Flagged
**Total SP**: 7

- [ ] **AI-sort + mode-switch shows different first media (single vs compare)** — 5 SP, 🔴 IMPORTANT
  - TODO.md BUG (🔴 Critical). After Sort-by-Prediction + rating pairs in compare, switching to single shows a different first file than the leftmost compare file. Two indexing schemes (`mediaFiles` vs `filesWithScores` via `mlComparePairIndex`) are never reconciled before `_applyModeSwitch()` sets `currentIndex = 0`. Likely fix path (b): keep both arrays in sync as ratings happen.
  - Affected: [media-viewer.js](../../media-viewer.js) (`_applyModeSwitch` ~L3779, `moveComparePair` ~L4614, `showCompareMedia` ML branch ~L2720-2744).
- [ ] **Compare-mode → folder-switch leaves stale media wrappers visible** — 2 SP, 🟠 IMPORTANT
  - BACKLOG.md (2026-05-07). New folder loads in single mode but the old `.compare-wrapper` / `.media-wrapper-left/right` nodes remain shifted/shrunk on the left. Fix: `switchToSingleModeUI()` should `.remove()`/hide the compare wrappers before the new media renders.
  - Affected: [media-viewer.js](../../media-viewer.js) (`switchToSingleModeUI`), [styles.css](../../styles.css); extend `compare-mode.test.js` "resets to single mode when switching folders".
  - **Same domain as the desync bug** (both touch `switchToSingleModeUI` / `_applyModeSwitch`) → one branch, one PR, one review.

### Group C: CLIP extraction UX [batch] 🔵
**Domain**: JS logic (extraction UX)
**Source**: 🔵 User-Flagged
**Total SP**: 4

- [ ] **Add UX-visible "extraction starting" notification** — 2 SP, 🟢 NICE TO HAVE
  - BACKLOG.md (2026-05-03). A "Starting feature extraction…" toast immediately on folder load (before per-file progress) surfaces failure modes faster and improves perceived responsiveness.
- [ ] **Toggle-on kickoff for CLIP** — 2 SP, 🟢 NICE TO HAVE
  - BACKLOG.md (2026-05-03, deferred from Group A spec). Toggling CLIP **on** while a folder is loaded should trigger the same `kickoffBackgroundExtractionIfEnabled()` path as folder load. Affected: `#clipFeaturesToggle` change handler in [media-viewer.js](../../media-viewer.js).

### Group D: Security & privacy audit [batch] 🟡
**Domain**: Ops / security
**Source**: 🟡 Operational
**Total SP**: 3

- [ ] **Verify no secrets in git history** — 2 SP, 🟢 NICE TO HAVE (high impact, low effort)
  - BACKLOG.md (periodic). Run `git log -p --all -S <pattern>` to confirm no credentials were ever committed.
- [ ] **Anonymize author field in package.json** — 1 SP, 🟢 NICE TO HAVE
  - BACKLOG.md (periodic). Check whether the author email/name in `package.json` should be anonymized for privacy.

---

## Daily Schedule

### Monday, June 1 — Re-rate: Compare Correction
> Lead off with the user's top ask so the compare correction UX is testable by end of day. Highest-uncertainty piece of the re-rate work (new ML-corrective + persistence path) lands first.

| Group | SP |
|-------|----|
| **Group 0: Re-rate / mode-correction** (part 1 — compare) | 6 |

- [x] "Both good / Both bad" corrective buttons in AI-sorted compare (5 SP) — ✅ shipped 2026-06-02 (+ manual-testing fixes). Tournament override (part 2) deferred to its own branch.

**Daily total**: 6 SP

---

### Tuesday, June 2 — Re-rate: Tournament Correction → JXL Kickoff
> Finish the tournament re-rate path (tournament correction testable today), then pivot to JXL with the highest-risk decision first: the WASM decoder evaluation.

| Group | SP |
|-------|----|
| **Group 0: Re-rate / mode-correction** (part 2 — tournament) | 2 |
| **Group A: JXL viewer support** (part 1 — audit + WASM eval) | 4 |

- [x] Tournament re-rate / mark-as-equal (2 SP) — Group 0 completes — ✅ shipped 2026-06-03
- [x] JXL: format audit of `media_compression` + WASM libjxl evaluation + extension-filter wiring (4 SP) — ✅ shipped 2026-06-07 (chose `jxl-oxide-wasm`; media-formats.js + isJxl + read-file-buffer/read-jxl-wasm IPC)

**Daily total**: 6 SP

---

### Wednesday, June 3 — JXL: Decode + Render + Tests
> Complete JXL end-to-end. Lighter SP day by design — it is the overrun buffer for the urgent, library-risk JXL work.

| Group | SP |
|-------|----|
| **Group A: JXL viewer support** (part 2 — decode/render/integration/tests) | 4 |

- [x] JXL: decode→Canvas branch, render in `showSingleMedia`/`showCompareMedia`, feature-extraction integration, loading state, graceful fallback, unit + E2E smoke (4 SP) — Group A completes — ✅ shipped 2026-06-07 (+ animated-JXL canvas playback)

**Daily total**: 4 SP | 🏆 Weekly Challenge complete

---

### Thursday, June 4 — Mode-Switch Display Bugs
> Both bugs share the mode-switch display path; batch into one branch/PR.

| Group | SP |
|-------|----|
| **Group B: Mode-switch display bugs** [batch] | 7 |

- [ ] AI-sort + mode-switch first-media desync (5 SP)
- [ ] Compare-mode → folder-switch stale wrappers (2 SP)

**Daily total**: 7 SP

---

### Friday, June 5 — Extraction UX + Security
> Two small batches: user-facing CLIP extraction UX, then the periodic security/privacy audit.

| Group | SP |
|-------|----|
| **Group C: CLIP extraction UX** [batch] | 4 |
| **Group D: Security & privacy audit** [batch] | 3 |

- [ ] "Extraction starting" notification (2 SP)
- [ ] CLIP toggle-on kickoff (2 SP)
- [ ] Verify no secrets in git history (2 SP)
- [ ] Anonymize package.json author field (1 SP)

**Daily total**: 7 SP

---

## Weekly Challenge 🏆

**JXL + extended-format viewer support** (Group A, Tue–Wed, 8 SP) — the hardest, highest-value strategic item on the board.

**Why this one**: The user flagged it as urgent ("необходимо срочно… чтобы я уже мог открывать их") — it blocks opening files they already produce. It is also the most technically demanding pick this week: it requires evaluating and integrating a WASM `libjxl` decoder, branching the render path by format, and threading decoded output through the existing feature-extraction pipeline — genuinely stretch scope. The re-rate work (Group 0) is the week's lead-off priority for early dogfooding, but JXL is the stretch challenge: bigger, riskier, and the one that unblocks a class of files entirely.

---

## Summary Table

| Group | Domain | Source | Tasks | Total SP | Day | Status |
|-------|--------|--------|-------|----------|-----|--------|
| 0: Re-rate / mode-correction | JS logic (rating/ML) | 🔵 User | 2 | 8 | Mon–Tue | part 1 ✅ (2026-06-02) · part 2 (tournament) pending |
| A: JXL viewer support 🏆 | JS logic (decode) | 🔵 User | 1 | 8 | Tue–Wed | Planned |
| B: Mode-switch display bugs [batch] | JS logic (mode UI) | 🔵 User | 2 | 7 | Thu | Planned |
| C: CLIP extraction UX [batch] | JS logic (extraction UX) | 🔵 User | 2 | 4 | Fri | Planned |
| D: Security & privacy audit [batch] | Ops / security | 🟡 Ops | 2 | 3 | Fri | Planned |
| **Total** | | | **9** | **30** | | |

---

## Notes

- **Lead-off rationale (Group 0 before JXL)**: User explicitly asked to pull the re-rate / mode-correction work ahead of JXL to dogfood the correction UX as early as possible. Compare correction is testable EOD Mon; tournament correction EOD Tue.
- **JXL risk buffer**: Group A carries an 8-SP tag but its load is exploratory (WASM decoder evaluation is the unknown). It gets the Tue-PM → Wed block with a deliberately light Wednesday (4 SP) so an overrun has room without bumping Thursday's critical bug work.
- **Overrun bump order** (if any group slips): drop **Group D** (🟡, NICE) first, then **Group C** (🟢, NICE). Never bump **Group B** (🔴/🟠 critical user bugs) or **Group 0** (lead-off priority).
- **Tournament re-rate is new design**: BACKLOG.md:60 scoped the correction buttons to compare-only. The tournament half of Group 0 needs a short design decision (re-pick last pair vs. mark-as-equal) — handle inline Mon/Tue; if it balloons, split the tournament half into a follow-up and ship compare correction this week.
- **Roadmap drift flag**: MILESTONES.md / ROADMAP.md / GOALS.md were last updated 2026-02-05 and still list v1.1 tasks (video fullscreen toggle, visual scale controls) that have long since shipped. The actual work has diverged well past the documented roadmap. JXL is net-new, user-urgent format support and proceeds regardless — but a roadmap/milestones refresh is overdue and worth a planning conversation soon (candidate for the deferred Cleanup Week).
- **No carry-forward**: Previous WEEKLY (May 11–15) fully complete; Groups C/D landed via PR #36 (2026-05-24).

### Quota Check
- 🔵 **User-Flagged SP**: 27 / 30 (**90%**) — ✅ must be ≥50%
- 🟡 **Operational SP**: 3 / 30 (**10%**) — ✅ must be ≤25%
- 🟤 **Auto-Generated SP**: 0 / 30 (**0%**) — ✅ must be ≤25% AND ≤1 group (zero this week — see below)
- **Cleanup Week status**: **due** (both triggers met) → **deferred to June 8–12**
- **Last Cleanup Week**: never recorded
- **Compliance**: ✅ all quotas met. ⚠️ **Deviation noted**: A Cleanup Week is overdue — the 🟤 Auto-Generated Tech Debt section holds well over 20 SP of pending PR-review follow-ups (PRs #39, #38, #36, #35, #34, #30, #28, #27, #24, #23, #22, #21, #19, #18 …) and no prior Cleanup Week is on record, so both cadence triggers ("every ~3 weeks" and ">20 SP pending") are satisfied. It is deferred this week — and zero auto-generated work is pulled in — because two 🔴 Critical user-flagged items (urgent JXL viewer, mode-switch bug) plus the user's explicitly-requested re-rate feature take precedence. Concentrating all auto-debt into a dedicated Cleanup Week (target **June 8–12**) is cleaner than dribbling it across this user-priority week. **Action**: declare June 8–12 a Cleanup Week (inverted quota) in next week's plan.

---

## Previous Week Summary

### Week: May 11 – May 15, 2026 — ✅ Complete

**Result**: All 6 groups delivered (25 SP planned). Groups A, B, E, F completed within the original Mon–Fri window; Groups C + D (PR #33 hygiene + integration tests) landed slightly later via PR #36 (merged 2026-05-24). Tournament Mode (Groups E + F) shipped 2026-05-25 with a deterministic-UX + feature-cache-streaming polish pass on 2026-05-26.

**Key deliveries**:
- Group A — CLIP extraction silent-failure fix (`kickoffBackgroundExtractionIfEnabled`, PR #34, 2026-05-07)
- Group B — AI prediction display bugs (`restoreFeatureCachesFromHistory` + `sortComplete` scores propagation, PR #35, 2026-05-14)
- Group C — PR #33 defensive follow-ups (clipUnloadTimer clear, deleteSortCache try/catch, per-file abort checks) — PR #36, 2026-05-24
- Group D — Integration test pattern (`tests/integration/cached-sort-path.test.js`) — PR #36, 2026-05-24
- Group E — Tournament Mode spec (`docs/superpowers/specs/2026-05-25-tournament-mode-design.md`)
- Group F — Tournament Mode prototype (Swiss strategy + engine + TournamentManager + UI integration; 241/241 unit tests)

**Velocity learning**: 25 SP/week remained the validated cadence; this week (June 1–5) intentionally raises the target to 30 SP at user direction to absorb the added re-rate feature without truncating planned work.

### Week: April 13 – April 17, 2026 — ✅ Complete

All 6 groups delivered, 25 SP. See `docs/archive/plans/` and `docs/planning/DONE.md` for closure records. (Compare-mode folder-switch fix, CLIP/ML pipeline cleanup, test-quality hardening, CLIP similarity sorting, resource management, build & DX.)
