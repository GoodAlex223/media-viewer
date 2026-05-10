# Weekly Plan

**Week**: Monday May 11 – Friday May 15, 2026
**Created**: 2026-05-05
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md, BACKLOG.md, TODO.md, git log (last 2 weeks), previous WEEKLY.md (April 13-17, archived below)

**Context**: PR #33 (CLIP sort follow-ups) merged today (2026-05-05); branch fully closed out. No previous-week carry-forward. Manual testing during PR #33 surfaced one 🔴 HIGH-priority blocker (CLIP background extraction silently does not fire on folder load) plus two 🟠 prediction-display bugs. Three weeks of unplanned execution (Groups D/E/F + CLIP Sort Follow-ups, April 18 – May 5) all delivered successfully — velocity remains ~25 SP/week.

---

## Parallel Work

_(No ongoing background tasks this week.)_

---

## Task Groups

### Group A: CLIP Extraction Silent Failure ✅ Complete (2026-05-07)
**Domain**: JS logic (CLIP/extraction pipeline)
**Total SP**: 5

- [x] **Investigate + fix CLIP background extraction silently not firing on folder load** — 5 SP, 🔴 IMPORTANT (BLOCKER)
  - Repro confirmed by user 2026-05-03: enable CLIP, open fresh folder, wait 60+s. No `.feature_cache.json`, no progress notification, no console errors. CLIP sort throws `"Only 0 files have CLIP embeddings"`. Hash sorts work fine on the same folder.
  - Investigation entry point: trace `loadFolder` → `startBackgroundFeatureExtraction` → CLIP queue path. Add diagnostic logging at each guard.
  - Affected: [media-viewer.js](media-viewer.js) (extraction orchestration), possibly [main.js](main.js) (CLIP IPC).
  - Source: BACKLOG (2026-05-03 manual testing — top priority per CLAUDE.md "Next planned")

### Group B: AI Prediction Display Bugs [batch]
**Domain**: JS logic (ML prediction display)
**Total SP**: 5

- [ ] **Fix like-probability not displayed after undo** — 2 SP, 🟠 IMPORTANT
  - `handleCancel()` restores file to `mediaFiles` but does not re-trigger `requestPredictionScores()`; badge stays missing.
  - Affected: [media-viewer.js:3340](media-viewer.js#L3340) (`handleCancel`), [media-viewer.js:6135](media-viewer.js#L6135) (`requestPredictionScores`).
  - Source: TODO.md (added 2026-05-05 from manual testing)
- [ ] **Fix prediction percentages misaligned after similarity-sort cancel + AI sort** — 3 SP, 🟠 IMPORTANT
  - User repro: after canceling Sort-by-Similarity then enabling AI sort, percentages display sorted descending but mismatched with media (e.g., "99% / 56%, 98% / 55%, 97% / 54%" instead of "99% / 54%, 98% / 55%, 97% / 56%").
  - Restore branch in `handleSortByPrediction()` filters `originalMediaFiles` but doesn't re-apply order/badge mapping.
  - Affected: [media-viewer.js:6271-6291](media-viewer.js#L6271-L6291).
  - Source: TODO.md (added 2026-05-05 from manual testing)

### Group C: PR #33 Defensive Follow-ups [batch]
**Domain**: JS logic (CLIP/sort hygiene)
**Total SP**: 4

- [ ] **Clear `this.clipUnloadTimer` in CLIP toggle-off handler** — 1 SP, NICE TO HAVE
  - Race scenario: extraction completes → 30s timer set → user disables CLIP → handler runs cleanup but stale timer remains → re-enable CLIP + `initClipModel()` begins → stale timer fires `unloadClipModel` IPC mid-load. Mitigated by main.js `{success:false, reason:'loading'}`, so no user-facing defect today; pure hygiene.
  - Source: BACKLOG (PR #33 sub-threshold, ~50/100)
- [ ] **Add try/catch around `await this.deleteSortCache('clip')` in toggle handler** — 1 SP, NICE TO HAVE
  - Caller-side try/catch makes the "best-effort cleanup" contract explicit; removes implicit dependency on callee's internal error handling.
  - Source: BACKLOG (PR #33 sub-threshold, ~25/100)
- [ ] **Add per-file abort check to `insertNewFilesInSortedOrder` (both paths)** — 2 SP, NICE TO HAVE
  - Both hash and CLIP branches iterate O(N*M) on the main thread with no `sortAbortController.signal.aborted` check inside the inner loop. Pathological case: 100+ new files in a 1000-file cache freezes UI.
  - Fix: `if (this.sortAbortController?.signal.aborted) throw new Error('Sort aborted');` once per outer iteration.
  - Source: BACKLOG (PR #33 sub-threshold, pre-existing)

### Group D: Integration Test Pattern
**Domain**: Testing
**Total SP**: 3

- [ ] **End-to-end integration test for cache-hit sort paths** — 3 SP, NICE TO HAVE
  - PR #33's primary fix slipped through 7 unit tests because they bypassed the `applyCachedSortOrder → cachedData.algorithm` plumbing. Pattern: unit-test-the-leaf vs. integration-test-the-call-graph.
  - Add one fixture-driven integration test per major code path (load fixture cache → invoke real `applyCachedSortOrder` → assert algorithm flows end-to-end).
  - Source: BACKLOG (PR #33 process improvement)

### Group E: Tournament Mode — Spec
**Domain**: Design / specification
**Total SP**: 3

- [ ] **Write spec for tournament-style compare mode** — 3 SP, IMPORTANT (user-flagged !COOL)
  - Resolve open design questions: bracket vs. swiss-style vs. single-elimination; win-count attribute (sidecar JSON?) vs. folder-grouping on disk; tournament termination (fixed rounds, single survivor, user-stops); interaction with like/dislike (separate state vs. unified).
  - Output: `docs/superpowers/specs/2026-05-14-tournament-compare-mode-design.md` + `docs/planning/plans/2026-05-14_tournament-compare-mode.md`.
  - Source: TODO.md (added 2026-05-05 from manual testing)

### Group F: Tournament Mode — Prototype
**Domain**: JS logic (compare mode extension)
**Total SP**: 5

- [ ] **Build minimal tournament mode prototype** — 5 SP, IMPORTANT (Weekly Challenge)
  - Following spec from Group E: implement winner-advances pair selection + per-file `winCount` state in memory. Skip persistence and folder-grouping for prototype. Wire to existing compare mode UI as a toggle.
  - Goal: get user feedback on the interaction model before locking in persistence/folder design.
  - Source: TODO.md (tournament-style compare mode)

---

## Daily Schedule

### Monday, May 11 — Critical Bug Investigation
> Front-load the HIGH-priority CLIP extraction blocker. Until this is fixed, no CLIP-dependent features are testable end-to-end.

| Group | SP |
|-------|----|
| **Group A: CLIP Extraction Silent Failure** | 5 |

- [x] Investigate + fix CLIP background extraction silent failure (5 SP) — completed 2026-05-07

**Daily total**: 5 SP

---

### Tuesday, May 12 — AI Prediction Display Bugs
> Both bugs touch the ML prediction display layer; batch into one branch/PR.

| Group | SP |
|-------|----|
| **Group B: AI Prediction Display Bugs** [batch] | 5 |

- [ ] Fix like-probability not displayed after undo (2 SP)
- [ ] Fix prediction percentages misaligned after similarity-sort cancel + AI sort (3 SP)

**Daily total**: 5 SP

---

### Wednesday, May 13 — PR #33 Hygiene + Integration Tests
> All three Group C items are quick CLIP/sort hygiene fixes from PR #33 review. Group D is the process-level integration test that would have caught PR #33's main bug — natural to land alongside the hygiene fixes since they share the same code paths.

| Group | SP |
|-------|----|
| **Group C: PR #33 Defensive Follow-ups** [batch] | 4 |
| **Group D: Integration Test Pattern** | 3 |

- [ ] Clear `this.clipUnloadTimer` in CLIP toggle-off (1 SP)
- [ ] try/catch around `deleteSortCache('clip')` (1 SP)
- [ ] Per-file abort check in `insertNewFilesInSortedOrder` (2 SP)
- [ ] End-to-end integration test for cache-hit sort paths (3 SP)

**Daily total**: 7 SP

---

### Thursday, May 14 — Tournament Mode Design 🏆
> Weekly Challenge: end-to-end design + prototype for the user-flagged !COOL feature. Today: spec only.

| Group | SP |
|-------|----|
| **Group E: Tournament Mode — Spec** | 3 |

- [ ] Write tournament-style compare mode spec (3 SP)

**Daily total**: 3 SP | 🏆 Weekly Challenge (part 1/2)

---

### Friday, May 15 — Tournament Mode Prototype 🏆
> Weekly Challenge continued: minimal interaction prototype. Skip persistence/folder grouping; goal is user-feedback iteration on the model.

| Group | SP |
|-------|----|
| **Group F: Tournament Mode — Prototype** | 5 |

- [ ] Build minimal tournament mode prototype (5 SP)

**Daily total**: 5 SP | 🏆 Weekly Challenge (part 2/2)

---

## Weekly Challenge 🏆

**Tournament-style compare mode — design + prototype** (Groups E + F, Thu+Fri, 8 SP total) — Hard backlog item.

**Why this one**: The user explicitly flagged this feature as "implement as soon as possible" / !COOL during the 2026-05-05 manual testing session. It's the most user-energizing item on the board. It's also the right scope for a 2-day stretch: too large for a single-day batch (8 SP), but breaks cleanly into "spec Thu, prototype Fri" — if Thursday's spec runs long, Friday absorbs the carry-forward without disrupting the rest of the week. The prototype-first approach lets the user react to the interaction model before locking in persistence/folder-grouping design, which the spec flags as the highest-uncertainty axis.

---

## Summary Table

| Group | Domain | Tasks | Total SP | Day | Status |
|-------|--------|-------|----------|-----|--------|
| A: CLIP Extraction Silent Failure | JS logic (CLIP) | 1 | 5 | Mon | ✅ Complete (2026-05-07) |
| B: AI Prediction Display Bugs | JS logic (ML display) | 2 | 5 | Tue | Planned |
| C: PR #33 Defensive Follow-ups | JS logic (CLIP/sort hygiene) | 3 | 4 | Wed | Planned |
| D: Integration Test Pattern | Testing | 1 | 3 | Wed | Planned |
| E: Tournament Mode — Spec | Design | 1 | 3 | Thu | Planned |
| F: Tournament Mode — Prototype | JS logic (compare) | 1 | 5 | Fri | Planned |
| **Total** | | **9** | **25** | | |

---

## Notes

- **Velocity baseline**: Last formal weekly plan (April 13-17) hit 25 SP and completed all groups. Three weeks of unplanned execution since then averaged ~7-8 SP per delivery cycle (Group D CLIP Sort, Group E Resource Mgmt, Group F Build & DX, CLIP Sort Follow-ups). This week targets the same 25 SP.
- **Front-loading rationale**: Group A (Mon) is the 🔴 blocker — investigating it first means CLIP-dependent fixes downstream (Groups C/D Wed) land in a known-working extraction pipeline.
- **Group B reasoning**: Both prediction display bugs share the ML scoring/badge pipeline; batching avoids two separate `requestPredictionScores` audit passes.
- **Wed double-load (7 SP)**: Group C is mostly trivial (1+1+2 SP); Group D is the real integration-test addition. They share CLIP/sort code, so one branch/PR is cleaner than two.
- **Risk: Group A scope creep**: If the silent-failure root cause turns out to be in `main.js` IPC (vs. the renderer extraction queue), the fix could push to 8 SP. If so, drop Group D from Wed (defer to next week) — the integration-test pattern is process improvement, not blocking.
- **No carry-forward**: Previous WEEKLY.md (April 13-17) is fully complete; no leftover items.
- **Open BACKLOG candidates if Friday finishes early**: ML model retrain UX (BACKLOG 2026-05-05), rotation buttons for media (BACKLOG 2026-05-05), or PR #28 redundant-call cleanup (BACKLOG, ~3 SP).

---

## Previous Week Summary

### Week: April 13 – April 17, 2026 — ✅ Complete

**Result**: All 6 groups delivered (Groups A through F), 25 SP planned and completed within the original Mon-Fri window. See `docs/archive/plans/` and `docs/planning/DONE.md` for full closure records.

**Key deliveries**:
- Group A — Compare Mode folder-switch fix (PR #28, merged 2026-04-10)
- Group B — CLIP/ML Pipeline Cleanup (4 tasks, 2026-04-09)
- Group C — Test Quality (afterEach null guards across 7 E2E files, 2026-04-11)
- Group D — CLIP Similarity Sorting (PR #29 + #30, 2026-04-18 / 2026-04-20)
- Group E — Resource Management (PR #31, 2026-04-21 + 2026-04-28)
- Group F — Build & DX (PR #32, 2026-04-29 / 2026-04-30)

**Post-week unplanned execution (April 18 – May 5)**:
- CLIP Sort Follow-ups (PR #33, merged 2026-05-05) — algorithm-aware `insertNewFilesInSortedOrder`, async CLIP toggle-off handler, 7 new unit tests, defensive PR #33 fix (`saveSortCache` algorithm field + `applyCachedSortOrder` explicit param).

**Velocity learning**: 25 SP/week is the validated cadence. First-week conservative estimate from April 13-17 plan held; carry forward to May 11-15.
