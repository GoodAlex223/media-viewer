# Milestones

Key targets with dates.

**Last Updated**: 2026-10-28 <!-- Weekly planning (Cleanup Week #5, Oct 26–30): a status edit only, not a refresh. v2's weekly 🔵 share is set to ~12 SP ("Most", user ruling 2026-10-28): v2 complete moves to about May 2027, and the pilot, scaled the same way, to early January 2027 (the planner's call). The 2-month clock still runs from 2026-10-27. --> <!-- G5 strategic-doc refresh (plan 2026-10-27_g5-strategic-doc-refresh.md): the v2 pilot and v2-complete milestones replace "v2.0 modularization complete", which is retired as absorbed into v2 (spec D1); the 24k scope note closed; the Health Summary's Count column dropped (derived counts). The 2-month clock restarts here. Earlier: 2026-10-09 was a status flip only, not a refresh. -->

---

## Overview

Milestones are significant checkpoints. They should be:

- **Specific** — Clear definition of "done"
- **Measurable** — Objectively verifiable
- **Time-bound** — Has a target date

---

## Upcoming Milestones

### 🎯 v2 pilot: the module host and the `similarity` module (P1a + P1b)

**Target Date**: early January 2027 (soft)
**Status**: ⬜ Not started — P1a's earliest week is Nov 2–6, after Cleanup Week #5

**Definition of Done** ([v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) § 14 exit criteria):

- [ ] An empty module loads, fails safely, cascades and toggles from the Modules tab (P1a)
- [ ] Today's app and both suites run on Linux as well as Windows (P1a)
- [ ] The similarity sort runs as the `similarity` module with no change in behaviour, its tests keeping their assertions (P1b, § 12.1)
- [ ] The user's 24k smoke after P1b, with startup, navigation and sort timings recorded against today's (§ 15)
- [ ] Net `wc -l media-viewer.js` ≤ 0 in each phase's PR, under the blocking line ratchet

**Dependencies**: Cleanup Week #5 first; the blocking line ratchet in place before P1a's PR merges

**Risks**:

- P1a's Linux baseline is an unknown: WSL2 is a candidate for the Electron runs, not yet tried (spec § 15)
- Estimates have run ~1.9× low; P1a (~11 SP) and P1b (~10 SP) can each fill more than a week
- The date assumes P1a and P1b get ~12 SP of their weeks' 🔵 share (user ruling 2026-10-28, "Most"). It was mid-December at the whole share (~17 SP); scaled by 17/12, that is early January (the planner's call, 2026-10-28). A week that gives them less pushes it later

### 🎯 v2 complete

**Target Date**: about May 2027 (soft); the spec's end of Q1 assumed the whole 🔵 share (spec § 14)
**Status**: 🟡 In Progress — P0 done 2026-10-27

**Definition of Done**:

- [ ] P1a–P7 meet their exit criteria (spec § 14); P8 packaging is optional
- [ ] `media-viewer.js` below 6,000 lines by the end of P7, and the renderer plus `core/*.js` below 11,945 lines (§ 11.1)
- [ ] Unit and E2E suites green on Windows and Linux at every phase exit (G-8)
- [ ] `CLAUDE.md` rules for moved code live in path-scoped `.claude/rules/` files (§ 14, D24)

**Dependencies**: the downloader research before P3b's plan (BACKLOG 🟤 [2026-10-25])

**Risks**:

- The date assumes v2 takes ~12 SP of each normal week's ~17 🔵 SP (user ruling 2026-10-28, "Most"), leaving ~5 SP for picks outside v2, such as the sorting-session follow-ups kept in BACKLOG. A normal week that gives v2 less moves the date later
- About 131–136 SP nominal; at the historical slip, about 20 calendar weeks at the whole share (spec § 14), and about 28 at ~12 SP a week, with Cleanup Weeks included

---

## Milestone Timeline

```
2026                                  2027
Q3                 Q4 / Q1            Q2
 │                  │                  │
 ▼                  ▼                  ▼
[24k AI-sort] ✅   [v2 pilot]         [v2 complete]
2026-07-20         early Jan 2027     ~May 2027 (soft)
                   P1a + P1b          P1a–P7
```

| Milestone                     | Target Date                | Status                   |
| ----------------------------- | -------------------------- | ------------------------ |
| 24k AI-sort smooth end-to-end | July 2026                  | ✅ Complete (2026-07-20) |
| v2 pilot (P1a + P1b)          | early January 2027 (soft)  | ⬜ Not started           |
| v2 complete                   | about May 2027 (soft)      | 🟡 In Progress           |
| v2.0 modularization complete  | Q4 2026 (soft)             | ↪ Retired 2026-10-27     |

---

## Completed Milestones

### ✅ 24k AI-sort smooth end-to-end

**Completed**: 2026-07-20 (target was July 2026 — met)
**Result**: On Time

**What was delivered** (against the original Definition of Done):

- [x] Sort-by-Predicted shows a determinate progress card immediately (no silent ~40s wait)
- [x] Cached features are served — no redundant re-extraction on a warm cache
- [x] Cancel aborts the AI-sort path mid-run
- [x] Verified by a manual smoke on the real 24,000+ file folder — all 5 checks passed on a **20,929-file** folder

Shipped via PR #64 (merge `b6ff4ac`). Two defects were found and fixed **before** merge rather than deferred: an external-review data-loss regression (`b8b5636`) and a smoke-triggered cache-corruption route (`2777bdf` + `c947081`).

> **Scope note**: this milestone covered the _AI-sort_ path only. The separate PR2 slice — hash/similarity sort off the renderer thread — shipped on 2026-10-25 (PR #85 and PR #87) and closed [GOALS.md](GOALS.md) Objective 1; it was a Key Result there, never part of this milestone.

### ✅ v1.1 Polish Release

**Completed**: retro-declared 2026-08-27 (named features shipped 2026-02)
**Result**: Scope exceeded many times over

**What was delivered** (against the original Definition of Done):

- [x] Video fullscreen toggle — shipped 2026-02-05, later extracted into FullscreenManager
- [x] Visual scale controls — zoom slider + popover, E2E-covered (`zoom.test.js`)
- [x] "Manual testing checklist passed" — superseded: hook-enforced unit + E2E suites (`npm test` / `npm run test:e2e` give the current counts), plus per-PR manual smokes
- [x] "All documentation up to date" — satisfied by the 2026-08-27 strategic-doc refresh

Beyond scope: Tournament mode, JXL viewer, CLIP semantic sorting, bulk-rate training, automated test suite, shortcut customization, local quality gates.

### ✅ v1.0 Core Features

**Completed**: 2025-12
**Result**: On Time

**What was delivered**:

- Media browsing with keyboard navigation
- Rating system (like/dislike/special)
- Compare mode for side-by-side viewing
- Visual similarity sorting (VP-Tree, MST)
- ML-based prediction sorting
- Image zoom and pan
- Face detection
- Sorting result caching
- Background feature extraction

---

## Retired Milestones

### ↪ v2.0 modularization complete

**Retired**: 2026-10-27 — absorbed into v2 ([v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) D1; see [ROADMAP.md](ROADMAP.md) § Releases for what it extracted)
**Original target**: Q4 2026 (soft)

Its Definition of Done named four extractions. ZoomManager shipped (PR #90, 2026-10-26). SortingManager becomes the `similarity` module (P1b), MLManager's sort half becomes `ai-sort` (P4b), and CompareManager becomes a core split (P7). Its line target, "< ~6,000 after the four extractions", was re-baselined to v2's (GOALS Objective 2, G-7).

---

## Health Summary

| Status         | Milestones                                                  |
| -------------- | ----------------------------------------------------------- |
| ✅ Complete    | v1.0 Core Features, v1.1 Polish, 24k AI-sort smooth         |
| 🟡 In Progress | v2 complete                                                 |
| ⬜ Not started | v2 pilot (P1a + P1b)                                        |
| ↪ Retired      | v2.0 modularization complete                                |

---

_See [ROADMAP.md](ROADMAP.md) for release context and the theme board._
_See [TODO.md](TODO.md) for tactical tasks toward milestones._
