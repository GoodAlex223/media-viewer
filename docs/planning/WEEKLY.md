# Weekly Plan

**Week**: Monday June 22 – Friday June 26, 2026
**Created**: 2026-06-19
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md, BACKLOG.md (📌 Process Rules), TODO.md, git log (last 2 weeks), previous WEEKLY.md (June 15–19 Cleanup Week, archived below), REVIEW-QUEUE.md (created this week — first Weekly Reviews run)
**Type**: 🟢 **Normal week** — standard quotas resume (≥50% 🔵 User-Flagged, ≤25% 🟡 Ops, ≤25% AND ≤1 group 🟤 Auto). This is the deliberate counterpoint to the June 15–19 Cleanup Week, which inverted the quota.

**Context**: The first-ever Cleanup Week (June 15–19) shipped completely — all five groups CW-1…CW-5 merged (PRs #47–#52), `main` is clean, no carry-forward debt. This week pivots hard onto the freshest, strongest user signal: the 2026-06-18 manual-testing intake filed **four 🔴 large-folder (24k+) performance items** into TODO.md Planned with the explicit directive *"Сначала нам нужно постараться максимально ускорить эти функции"* ("first we need to speed these functions up as much as possible"). The week is a **performance push** — AI/similarity sort + tournament-mode internals — rounded out by the perf-adjacent feature-extraction-timing decision and a low-risk tournament-exit-UX batch that ships alongside the tournament perf work for cohesive dogfooding. Target **~19 SP** (quota-counted), held deliberately below the 24 SP cleanup-week number because this week is the *opposite* of mechanical: two design-risky algorithmic refactors lead it, and the velocity record (design-heavy work ≈ 17–20 SP effective per 5-day window) says don't overcommit.

---

## Parallel Work

- **User dogfooding / manual verification on a real 24k+ folder** (no SP; user-side). The whole point of this week's perf work is large-folder responsiveness, and synthetic E2E fixtures cannot represent 24 000 files realistically. Each perf group needs a manual smoke on the user's actual large folder before its BACKLOG/TODO entry is checked off — unit tests on the pairing/persist/neighbor-graph logic plus a hand-off for real-data verification.
- **Cleanup-Week PRs (#47–#52) — all merged and verified.** Nothing pending there. (The separate 🔵 "JXL animation smoothness / look-ahead decode" item surfaced during CW-5 dogfooding remains future work in BACKLOG, not active this week.)

---

## Task Groups

### Group P1: AI / similarity sort large-folder performance 🏆 🔵
**Domain**: JS logic (sort worker algorithms + progress/cancel UX)
**Source**: 🔵 User-Flagged
**Total SP**: 5 — solo (≥5 SP algorithmic work justifies its own run)

- [ ] **Speed up AI / similarity sorting on large folders (24k+ files)** — 5 SP, 🔴 IMPORTANT — ⏳ **PR1 of 3 MERGED 2026-06-20** (PR #54, merge `7b78a56`, branch deleted; manual 24k smoke PASSED 2026-06-19; `/code-review` "No issues found", +2 🟤 follow-ups). Box stays unchecked because PR2 (hash off-thread) + PR3 (cache-load) remain; broad-scope rescope is in DONE.md 2026-06-19.
  - TODO.md Planned 🔴 (origin: BACKLOG 🔵 [2026-06-18] manual-testing intake; "speed these up first"). AI-prediction and visual-similarity sorts run very slowly and opaquely on 24 000+ files: the neighbor-graph build is O(n·K) (K ≈ √n·10 neighbors/file) with an O(n²) MST/greedy fallback, and there is **no progress/cancel affordance**. Reduce complexity (cap neighbors, chunk + yield to the event loop, push more work into the worker) and add progress/cancel UX.
  - Affected: `sorting-worker.js:~596-752` (neighbor graph + MST), `media-viewer.js:~5992-6120` (sort invocation, progress/cancel surface).
  - In scope to check/consolidate: the related 🟤 perf items this TODO entry tags — "Event-loop yielding in `insertNewFilesInSortedOrder` for pathological cases" (BACKLOG 2026-05-24) and "Incremental feature-cache serving (~40s blocking load)" (BACKLOG 2026-05-26). Close whichever the fix subsumes.

### Group P2: Tournament large-folder performance [batch] 🔵
**Domain**: JS logic (tournament engine + manager + IPC persistence)
**Source**: 🔵 User-Flagged
**Total SP**: 8 — one branch, one PR, one review (scheduled across a contiguous Tue–Wed block)

> All three TODO 🔴 items share one root cause and one set of files: a **synchronous full-state write** to `.tournament_state.json` on every action + **O(n²) Swiss `_buildRoundPairings`** at init/resume + **dual O(n) `findIndex`** path→index lookup per pair. The shared fixes — async/debounced state persistence, memoized pairings, a prebuilt path→index `Map` — address all three at once, which is exactly why they batch. Closes the canonical BACKLOG 🔵 [2026-06-18] "Speed up tournament-mode pair changing" entry too.

- [ ] **Speed up tournament launch & resume/continuation (24k+)** — 3 SP, 🔴 IMPORTANT
  - TODO.md Planned 🔴. Full-state (de)serialization + O(n²) Swiss pairing at init/resume + dual O(n) `findIndex` per pair display. Stream/defer the pairing build, memoize pairings, replace path→index `findIndex` with a prebuilt Map.
  - Affected: `tournament-engine.js:~63-152`, `tournament.js:~120`, `media-viewer.js:~4426-4479`.
- [ ] **Speed up media rating (pick → next pair) in tournament mode** — 3 SP, 🔴 IMPORTANT
  - TODO.md Planned 🔴 (canonical BACKLOG entry [2026-06-18]). Every pick triggers a synchronous full-state disk write + O(n²) re-pairing + dual O(n) `findIndex` before the next pair renders; compare mode does none of that. Make persistence async/debounced; cache path→index lookups.
  - Affected: `media-viewer.js:~4684`, `tournament.js:~120`, `tournament-engine.js:~96-152`, `main.js:~238`.
- [ ] **Speed up "Save & leave"** — 2 SP, 🔴 IMPORTANT
  - TODO.md Planned 🔴. The Save handler re-serializes and writes the entire state before exiting — slow on large tournaments and largely redundant since state is already persisted on every pick. Reuse the already-persisted state, or write incrementally/async. (Naturally falls out of the debounced-persistence work above.)
  - Affected: `media-viewer.js:~4380-4422` (Save handler), `tournament.js:~120` (`_persistState`).

### Group P3: Feature-extraction timing 🔵
**Domain**: JS logic (extraction kickoff) + Settings UI
**Source**: 🔵 User-Flagged
**Total SP**: 3 — solo (3 SP; no cohesive small task shares its files)

- [ ] **Smarter timing for background feature extraction (don't always start on folder open)** — 3 SP, 🟠 IMPORTANT
  - TODO.md Planned 🟠 (promoted 2026-06-18; re-reported during manual testing). `kickoffBackgroundExtractionIfEnabled()` fires unconditionally on every `loadFolder()`, heavily loading the CPU on large folders even when the user never uses AI/similarity sort. Extraction produces the 64-dim + 512-dim CLIP vectors those sorts need, so it can't be removed — only deferred. Needs a short design pass (brainstorm → which option): (a) **lazy** — extract only on first click of an AI-dependent feature; (b) **threshold** — auto-extract on open only if N < `EXTRACTION_AUTO_LIMIT`; (c) **settings toggle** "Auto-extract on folder open" (default off for new users); (d) **idle-only** — start after a quiet period. User lean: "move it to where it's needed" (→ lazy/on-demand). Distinct from the [2026-05-03] extraction-starting-toast item (that surfaces *visibility*; this decides *when*).
  - Affected: `media-viewer.js` (`kickoffBackgroundExtractionIfEnabled`, `loadFolder` call site, new settings toggle), Settings panel F1 in `index.html` + `styles.css`.

### Group T1: Tournament exit affordances [batch] 🔵
**Domain**: UI/UX (tournament leave-prompt affordances) + main-process window lifecycle
**Source**: 🔵 User-Flagged
**Total SP**: 3 — one branch, one PR. Ships alongside the P2 tournament perf work for cohesive tournament-mode dogfooding.

> Both items are tournament-mode exit/leave affordances from the same BACKLOG 🔵 [2026-06-03] intake, and both reuse the existing `showTournamentLeavePrompt` / `switchMode('single')` machinery — so the leave-UX work batches cleanly.

- [ ] **Explicit pause/exit button in tournament mode** — 1 SP
  - BACKLOG 🔵 [2026-06-03]. Add a visible control in `#tournamentControls` (next to Undo / Both Win / Both Lose) wired to the same `switchMode('single')` → leave-prompt path. Today the only exits are Escape and the mode-selector — pure affordance; machinery already exists. (Re-adds a discoverable affordance after the original pause button was removed in `c6914ef`.)
  - Affected: `index.html` (`#tournamentControls` button), `media-viewer.js` (click → `switchMode('single')`), `styles.css`.
- [ ] **Confirm before app close when a tournament is in progress (Alt+F4 / window "X")** — 2 SP
  - BACKLOG 🔵 [2026-06-03]. Intercept `BrowserWindow` `'close'` with `event.preventDefault()` + an IPC round-trip asking the renderer whether a tournament is active (or a native `dialog.showMessageBox`), mirroring the in-app Save/Discard/Cancel leave prompt — so an accidental Alt+F4 doesn't silently abandon a session. Care: the in-app prompt is renderer-side DOM; window-close fires main-process-side.
  - Affected: `main.js` (window `close` handler + IPC), `preload.js` (IPC channel), `media-viewer.js` (respond with tournament-active state / reuse `showTournamentLeavePrompt`).

### Group WR: Weekly Reviews [batch] ⚪ Overhead
**Domain**: Research / process (exempt overhead — excluded from the source-quota denominator)
**Source**: ⚪ Overhead
**Total SP**: 4 — scheduled late (Thu/Fri), low-risk, must not displace front-loaded perf work

> First run of the recurring Weekly Reviews batch. Read REVIEW-QUEUE.md (created this week) first; append a verdict row per category; on an `adopt`, file a 🟤 Auto-Generated BACKLOG entry.

- [ ] **Plugins review (2 SP)** — two independent tops: best not-yet-reviewed plugin from the **official Claude plugin store**, and separately the best from the **wider internet**. Log each with its `source:`.
- [ ] **Claude best-practices (1 SP)** — top not-yet-reviewed practice/experience for Claude / Claude Code / Claude Design / Claude Cowork.
- [ ] **Non-Claude AI best-practices (1 SP)** — same, for AI models/tools other than Claude.

---

## Daily Schedule

### Monday, June 22 — 🏆 Sort Performance
> Front-load the week's single hardest standalone problem: the sort-worker algorithm rewrite. Solo run, design-risky, gets the freshest mind and the most absorption room if it overruns.

| Group | SP |
|-------|----|
| **Group P1: AI / similarity sort large-folder performance** 🏆 | 5 |

- [ ] Reduce neighbor-graph / MST complexity (cap neighbors, chunk + yield, push work to worker) + progress/cancel UX (5 SP)

**Daily total**: 5 SP

---

### Tuesday, June 23 — Tournament Performance (day 1)
> The week's biggest batch. Land the shared infrastructure first — async/debounced `_persistState`, memoized pairings, prebuilt path→index Map — which is what makes all three TODO items fast.

| Group | SP |
|-------|----|
| **Group P2: Tournament large-folder performance** [batch] (day 1 of 2) | (8) |

- [ ] Async/debounced state persistence in `_persistState` (foundation for rating + Save & leave)
- [ ] Memoize Swiss `_buildRoundPairings`; replace dual `findIndex` with a prebuilt `Map`

**Daily total**: ~4 SP (of the 8 SP batch)

---

### Wednesday, June 24 — Tournament Performance (day 2) + PR
> Finish the three tournament perf items on the shared foundation, verify on large N, open the PR.

| Group | SP |
|-------|----|
| **Group P2: Tournament large-folder performance** [batch] (day 2 of 2) | (8) |

- [ ] Launch & resume speedup (stream/defer pairing build)
- [ ] Rating pick→next speedup (consume debounced persist + Map lookup)
- [ ] "Save & leave" reuse-already-persisted-state; large-N verification + unit tests; PR

**Daily total**: ~4 SP (of the 8 SP batch)

---

### Thursday, June 25 — Extraction Timing + Reviews
> Moderate, perf-adjacent feature-extraction-timing decision (brainstorm → implement). Begin the low-risk Weekly Reviews late in the day.

| Group | SP |
|-------|----|
| **Group P3: Feature-extraction timing** | 3 |
| **Group WR: Weekly Reviews** [batch] (start) | (4) |

- [ ] Decide extraction-timing strategy (lazy / threshold / toggle / idle) + implement gate + settings toggle (3 SP)
- [ ] Weekly Reviews: Claude + non-Claude best-practices rows (start) (1–2 SP of the 4 SP overhead)

**Daily total**: 3 SP + reviews overhead

---

### Friday, June 26 — Tournament Exit UX + Reviews wrap + buffer
> Light, low-risk close: the tournament-exit affordance batch, finish Weekly Reviews, and absorb any P1/P2/P3 spillover. (Friday-light mirrors last week; the perf work carries real design risk, so the buffer is intentional.)

| Group | SP |
|-------|----|
| **Group T1: Tournament exit affordances** [batch] | 3 |
| **Group WR: Weekly Reviews** [batch] (finish) | (4) |

- [ ] Tournament pause/exit button (1 SP) + app-close tournament confirm (2 SP)
- [ ] Weekly Reviews: plugins ×2 (store + wider internet) (2 SP of the 4 SP overhead); file 🟤 entries on any `adopt`

**Daily total**: 3 SP + reviews overhead + perf spillover buffer

---

## Weekly Challenge 🏆

**AI / similarity sort large-folder performance** (Group P1, Mon, 5 SP).

**Why this one**: It is the user's explicit top priority for the week ("speed these functions up first"), the single hardest standalone problem on the board, and strategic — 24k-file folders are a real, currently-broken use case. The stretch is genuine: reduce an O(n·K) neighbor-graph build with an O(n²) MST/greedy fallback to something that stays responsive at 24 000 files, chunk-and-yield to keep the event loop alive, push work into the worker, *and* add the progress/cancel UX that doesn't exist today — without regressing sort quality. By default the challenge comes from 🔵 User-Flagged HIGH PRIORITY; this is the clearest such item.

---

## Summary Table

| Group | Domain | Source | Tasks | Total SP | Day | Status |
|-------|--------|--------|-------|----------|-----|--------|
| P1: AI / similarity sort perf 🏆 | JS logic (sort worker) | 🔵 User | 1 | 5 | Mon | Planned |
| P2: Tournament large-folder perf [batch] | JS logic (engine/manager/IPC) | 🔵 User | 3 | 8 | Tue–Wed | Planned |
| P3: Feature-extraction timing | JS logic + Settings UI | 🔵 User | 1 | 3 | Thu | Planned |
| T1: Tournament exit affordances [batch] | UI/UX + main lifecycle | 🔵 User | 2 | 3 | Fri | Planned |
| WR: Weekly Reviews [batch] | Research / process | ⚪ Overhead | 3 | 4 | Thu–Fri | Planned |
| **Total (quota-counted)** | | | **7** | **19** | | |
| **Total (incl. ⚪ overhead)** | | | **10** | **23** | | |

_Task counts count plan tasks; P1 may also consolidate 2 related 🟤 perf items, and P2 closes the canonical BACKLOG 🔵 [2026-06-18] tournament-pair-changing entry. At closeout, check off each constituent TODO/BACKLOG entry individually._

---

## Notes

- **Velocity & target (19 SP quota-counted, deliberately conservative)**: The June 15–19 Cleanup Week hit 24 SP because it was mechanical. This week is the inverse — two design-risky algorithmic refactors (P1 sort worker, P2 tournament engine) lead it, and the velocity record says design-heavy work runs ≈ 17–20 SP effective per 5-day window once PR review + closeout overhead is counted (June 1–5's 30 SP took 9 working days). 19 SP of perf/UX work + a light Friday buffer is the realistic target; do not pad it.
- **Quotas back to normal (this is NOT a Cleanup Week)**: Last week inverted the split (🟤 majority); normal quotas resume — ≥50% 🔵, ≤25% 🟡, ≤25% AND ≤1 group 🟤. This week lands at **100% 🔵**, well above the floor, which is correct: the user gave an explicit "speed these up first" directive and there is 16 SP of 🔴 perf work plus 3 SP of 🔵 UX queued. No 🟡 or 🟤 group is required (those are caps, not floors).
- **Why zero 🟤 this week**: We just burned ~16 SP of auto-generated debt in the Cleanup Week; the 🟤 tail (≈155 unchecked items, overwhelmingly XS) is real but not a normal-week priority, and the next Cleanup Week is due ~**early July 2026** (~3-week cadence) where it will be addressed in bulk. Folding stray 🟤 items into the perf batches would risk scope-creep on already-large refactors.
- **Overrun drop order**: drop **T1** (tournament exit UX — pure affordance) first, then **P3** (extraction timing — has a design decision that can wait). Never drop **P1** or **P2** — they are the user's explicit priority and the reason for the week.
- **Pull-in order if ahead** (Friday buffer): (1) **"Hash sort + AI sort mutual exclusion"** (🔵 [2026-05-07], twice-raised, M with an open design question — at minimum a "current sort will be replaced" prompt; same *sorting* domain as P1) — see deferral note below; (2) a tournament-related 🟤 follow-up already on the touched code, e.g. "narrow the tournament record try/catch" (🟤 [2026-06-14]); (3) the 🟤 [2026-06-13] CW-5 follow-ups (`frames.length`→`frameCount`, partial-JXL-cache eviction on worker crash).
- **Deferred 🔵 item — "Hash sort + AI sort mutual exclusion"**: The June 15–19 plan nominated this as a "lead candidate for the June 22 normal week." It is deprioritized (not dropped) under the stronger, fresher 2026-06-18 "speed these up first" directive, and because it is M-sized with an unresolved design question (sort-source axis vs unified dropdown) that wants its own brainstorm → spec. It is the **lead candidate for the following week** (June 29–July 3) if not pulled in as Friday buffer.
- **Roadmap refresh still needs a user conversation (carry-forward, non-SP)**: MILESTONES.md / ROADMAP.md / GOALS.md still date from 2026-02-05 and describe long-shipped v1.1 work (GOALS.md even claims "No automated tests" though the repo has 345 unit + a green E2E suite). Tournament mode, JXL, and CLIP all shipped *outside* the documented roadmap. This needs strategic input (is v1.1 closed? what is v2.0's real scope?) — raise it with the user this week; if the conversation happens, the doc edits can slot into Thursday. Not scheduled as SP.
- **Testing reality for the perf work**: 24 000-file folders cannot be E2E-fixtured. Verification = unit tests on the extracted logic (pairing memoization, debounced-persist semantics, path→index Map, neighbor-graph caps, progress/cancel state) + a **manual hand-off** for real-data smoke on the user's folder (see Parallel Work). Each perf group's BACKLOG/TODO entry stays unchecked until that manual smoke passes.
- **REVIEW-QUEUE.md created this week**: no prior file existed, so the Weekly Reviews batch starts from an empty Reviewed log; the skeleton is seeded with the three category sections.
- **Branch/PR shape**: 4 workflow runs for the quota-counted groups — P1 solo branch+PR, P2 one branch+PR (3 items), P3 solo branch+PR, T1 one branch+PR (2 items). Weekly Reviews is process overhead (no code PR; appends to REVIEW-QUEUE.md + any `adopt` files a 🟤 BACKLOG entry).

### Quota Check
- 🔵 **User-Flagged SP**: 19 / 19 (**100%**) — ✅ ≥50%
- 🟡 **Operational SP**: 0 / 19 (**0%**) — ✅ ≤25%
- 🟤 **Auto-Generated SP**: 0 / 19 (**0%**), 0 groups — ✅ ≤25% AND ≤1 group
- **Cleanup Week status**: **normal** (not due — last one was the week just ended)
- **Last Cleanup Week**: June 15–19, 2026 (the first ever). Next expected ~early July 2026 (~3-week cadence; 🟤 tail ≈155 items).
- **Compliance**: ✅ all quotas met. 100% user-flagged is the intended response to the user's explicit "speed these up first" directive and the deliberate counterpoint to last week's cleanup inversion.
- **Note**: denominator Y = total weekly SP (19) **minus** the exempt ⚪ Overhead Weekly Reviews batch (4) — i.e. percentages are over the 19 quota-counted SP; the 4 SP Weekly Reviews batch is excluded.

---

## Previous Week Summary

### Week: June 15 – June 19, 2026 — 🧹 Cleanup Week — ✅ Complete (shipped on time)

**Result**: The first-ever Cleanup Week. All five groups delivered at the 24 SP target, on schedule (no spill into the following week). Six PRs merged (#47–#52): #47 (CW-5 JXL progressive decode), #48 (CW-1 renderer correctness guards), #49 (CW-2 test backfill), #50 (CW-3 docs & backlog hygiene), #51 (CW-4 process & security guards), #52 (PR #51 review follow-ups). Unit tests 310 → **345**; E2E suite returned to green (42/43 → 48/48). The inverted quota (🟤 ≥50%) burned ~16 SP of accumulated auto-generated debt.

**Key deliveries**:
- CW-5 🏆 — Frame-0-first streaming animated-JXL decode (worker streams meta/frame/done; static frame-0 fallback on mid-stream error) — PR #47
- CW-1 — 7 defensive renderer guards consolidating 14 PR-review follow-ups (clipCache clear, tournament isLoading guards, <2-files exitTournamentMode, handleCancel compareMode guard, clipWorkerReady reset, feature-cache local-capture, JXL error-path trio) — PR #48
- CW-2 — E2E suite green (`#viewModeBtn`→`#modeSelector`) + first tournament-mode Playwright coverage (5 tests) — PR #49
- CW-3 — Docs & backlog hygiene: 7 git-verified stale-checkbox flips, doc-drift one-liners, repo-root cruft removal (kept the load-bearing `.gitignore` `nul` line) — PR #50
- CW-4 — Dependency-free pre-commit secret guard (`scripts/check-secrets.js`) + pre-archive checklist hardening — PR #51; review follow-ups (real `extractAddedLines` off-by-one bug + CLAUDE.md drift) — PR #52

**Velocity learning**: A mechanical, well-specified Cleanup Week delivered 24 SP cleanly in its window. The June 22–26 perf week targets a lower 19 SP because algorithmic/design-risk work does not move at mechanical-cleanup speed.

### Week: June 1 – June 5, 2026 — ✅ Complete (ran long: finished 2026-06-11)

**Result**: All 5 groups delivered (30 SP planned — raised from the 25 baseline at user direction). Groups 0/A landed inside the Mon–Fri window; Groups B, C, D spilled into June 8–11. Seven PRs merged: #40 (compare bulk-rate), #41 (tournament draw), #42 (JXL viewer), #43 + #44 (mode-switch bugs + review follow-ups), #45 (CLIP extraction UX), #46 (security audit). Unit tests 244 → 297.

**Key deliveries**:
- Group 0 — Re-rate / mode-correction: "Both good/Both bad" bulk-rate in AI-sorted compare (PR #40) + tournament "Both Win/Both Lose" mark-as-equal draws (PR #41)
- Group A 🏆 — JXL + animated-JXL viewer via vendored `jxl-oxide-wasm` module worker, CLIP-from-buffer IPC, LRU frame cache (PR #42)
- Group B — Mode-switch display bugs: compare→single lands on the on-screen file; stale compare-wrapper teardown (PRs #43/#44)
- Group C — CLIP extraction UX: starting-extraction toast + toggle-on kickoff (PR #45)
- Group D — Security & privacy audit: ✅ PASS, no secrets in history/tree; author already anonymized (PR #46)

**Velocity learning**: 30 SP nominally complete but consumed 9 working days end-to-end (review + closeout overhead per PR is real).

### Week: May 11 – May 15, 2026 — ✅ Complete

All 6 groups delivered (25 SP). Groups A, B, E, F within the window; C + D landed via PR #36 (2026-05-24). Tournament Mode (Groups E + F) shipped 2026-05-25 with a deterministic-UX + feature-cache-streaming polish pass 2026-05-26. (CLIP extraction silent-failure fix, AI prediction display bugs, PR #33 defensive follow-ups, integration test pattern, Tournament Mode spec + prototype.)

### Week: April 13 – April 17, 2026 — ✅ Complete

All 6 groups delivered, 25 SP. See `docs/archive/plans/` and `docs/planning/DONE.md`. (Compare-mode folder-switch fix, CLIP/ML pipeline cleanup, test-quality hardening, CLIP similarity sorting, resource management, build & DX.)
