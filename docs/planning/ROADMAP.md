# Roadmap

Long-term vision, active themes, and releases.

**Last Updated**: 2026-10-28 <!-- Weekly planning (Cleanup Week #5, Oct 26–30): a status edit only, not a refresh. v2's weekly 🔵 share is set to ~12 SP ("Most", user ruling 2026-10-28), so the v2 date moves to about May 2027. The 2-month clock still runs from 2026-10-27. --> <!-- G5 strategic-doc refresh (plan 2026-10-27_g5-strategic-doc-refresh.md): v2 replaces the v2.0 release (v2 spec D1), the board follows the spec's § 14 build order, and two drained notes are added, by the user's rulings of 2026-10-27. The 2-month clock restarts here. Earlier: 2026-10-09 was a status flip only, not a refresh. -->

---

## Vision

Make Media Viewer the most efficient tool for collecting, reviewing, rating and keeping large media collections, with intelligent sorting and prediction capabilities.

---

## Current Phase

**Phase**: v2 — modules and redesign ([v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md))
**Focus**: Build v2 inside the working app, one shippable phase at a time (no rewrite), with the renderer shrinking in every phase and the 24k-folder gains held
**Timeline**: Nov 2026 – about May 2027 (soft). The date assumes v2 takes ~12 SP of each normal week's 🔵 share (user ruling 2026-10-28; § Releases, the v2 Target note)

---

## Theme Board

Work flows each planning session from [BACKLOG.md](BACKLOG.md) → [WEEKLY.md](WEEKLY.md); this board is the strategic map of where the themes sit, not a duplicate task list. The v2 phase IDs (P1a, P1b, …) are the spec's § 14 rows.

### Now

- **v2 P1a — the module host and a Linux baseline**: the manifest, registry and loader; failure isolation; the Modules tab; checks M-1 and M-2; and first, today's app and suites running on Linux. In the week of Nov 2–6 at the earliest, after Cleanup Week #5. Then **P1b, the `similarity` module**, the pilot, which absorbs the planned SortingManager extraction.
- **Small tasks, any week, before or beside P1a**:
  - the AI research harness on the user's own like/dislike folders, with only overall numbers committed;
  - then **A1**, the like-model learner fix (spec § 12.3);
  - the LICENSE file;
  - the blocking renderer line ratchet (user ruling 2026-10-27, spec D23), in place before P1a's PR merges so P1a is its first measured phase.

### Next

- **v2 P2 — shell part 1**: the side panel, the jobs tray (the progress card moves into it), and F1 tabs.
- **v2 P3a/P3b — the job runner, then `fetch`**: links → an Inbox folder → rate. Its plan waits for the downloader research (BACKLOG 🟤 [2026-10-25]).
- **v2 P4a–P4d — `features`, `ai-sort`, Group copies and the JPEG XL decode pool**: CLIP in a utility process with fp32, then the AI sort as a module, which absorbs MLManager's sort half. P3 and P4 may swap if the AI work becomes more urgent (spec § 14).

### Later

- **v2 P5 — `compression`**: lossless JPEG XL in place, revertible until Finalize. It ports the user's `media_compression` idea, re-implemented in the app.
- **v2 P6a/P6b — the control registry, then `tournament`**: the [2026-05-25] UI-architecture overhaul (mode-aware controls, the z-index scale) lands here, then tournament mode moves out.
- **v2 P7 — finish**: the responsive pass, UI zoom, the CompareManager core split, and installing renderer-only modules from a file. `media-viewer.js` ends below 6,000 lines.
- **v2 P8 — packaging (optional)**: installers for Windows and Linux.
- **Progressive loading** — thumbnail / lowest-quality-first display while full media loads. BACKLOG [2026-04-08]. Not part of v2.

> **Moved into v2 on 2026-10-27**: the _add-on / extension system_ (Later) was designed as v2 (PR #88, merge `e1c4e03`), and its steps are v2's phases above. Platform integrations and link-based rating became `fetch` (P3b), and the compression port became `compression` (P5). The _UI architecture overhaul_ (Next) became P2, P6a and P7.

> **Drained on 2026-10-27**: the _24k-folder performance_ theme. The AI-sort half shipped in PR #64 (2026-07-20), and the similarity sort moved off the renderer in PR #85 and PR #87 (2026-10-25), closing GOALS Objective 1. Speed at 24k is now a v2 rule, checked by the user's smokes (spec § 15). The graph-build phase is BACKLOG 🔵 [2026-10-25].

> **Drained on 2026-10-27**: the work that shipped outside the board, Oct 12–23. The sorting-session workflow: like-or-skip (PR #79), the retrain fix (PR #80) and recently opened folders (PR #81). The security findings fix (PR #78) and page-load confinement (PR #84). The feature-cache wipe fix (PR #86). None holds a board slot. Their follow-ups (keeping the hash and AI sorts from running together, a Delete action, file-size weighting) stay in BACKLOG and come in as weekly picks beside v2 (user ruling 2026-10-27). The Sep 2 – Oct 9 work (rating and tournament UX, ML integrity) came in through BACKLOG intake, as the 2026-08-27 note below expected.

> **Drained on 2026-08-27**: the _rating & tournament UX polish_ theme is no longer a standing Now item — tournament undo reliability, the mouse-wheel guard, header auto-hide (PR #65) and bulk-rate re-pair avoidance (PR #66) all shipped. Further items of this kind re-enter through normal BACKLOG intake from 24k dogfooding rather than holding a board slot.

---

## Releases

### v1.1 — Polish Release ✅ Shipped

**Theme**: Core stability and UX refinement
**Status**: ✅ Complete (retro-declared 2026-08-27; scope long since exceeded)

Named features:

| Feature                 | Status             | Notes                                               |
| ----------------------- | ------------------ | --------------------------------------------------- |
| Video fullscreen toggle | ✅ Shipped 2026-02 | Later extracted into FullscreenManager              |
| Visual scale controls   | ✅ Shipped         | Zoom slider + popover; E2E-covered (`zoom.test.js`) |

Shipped far beyond the v1.1 scope (Feb–Aug 2026): Tournament mode (Swiss engine, persistence, session undo), JXL + animated-JXL viewer, CLIP semantic sorting + 576-dim ML pipeline, bulk-rate corrective training, an automated unit + E2E test suite (`npm test` / `npm run test:e2e` give the current counts), keyboard-shortcut customization, local quality gates (pre-commit secret scan/lint/unit; conditional pre-push E2E).

### v2 — Modules and Redesign 🔄 In Progress

**Theme**: A small core with first-party modules that can be switched on and off, a module host, and a redesigned shell, built incrementally inside the working app ([v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) § 2)
**Status**: 🔄 In Progress — P0 (the prerequisites) done 2026-10-27; P1a not started
**Done when**: P1a–P7 meet their exit criteria (spec § 14; P8 is optional), with `media-viewer.js` below 6,000 lines and the unit and E2E suites green on Windows and Linux at every phase exit.

| Phase | Scope | Status |
| ----- | ----- | ------ |
| P0 Prerequisites | G2 PR 2 merged (PR #87); the spec approved (2026-10-22, merged in PR #88); the board change and the § 19 BACKLOG entries (G5) | ✅ Done 2026-10-27 |
| P1a | Module host + Linux baseline | ⬜ Planned |
| P1b | `similarity` (the pilot) | ⬜ Planned |
| P2 | Shell part 1: side panel, jobs tray, F1 tabs | ⬜ Planned |
| P3a / P3b | Job runner and tools / `fetch` | ⬜ Planned |
| A1 | The like-model learner fix (any time, outside the phases) | ⬜ Planned |
| P4a–P4d | `features` / `ai-sort` / Group copies / JPEG XL decode pool | ⬜ Planned |
| P5 | `compression` | ⬜ Planned |
| P6a / P6b | Control registry / `tournament` | ⬜ Planned |
| P7 | Finish: responsive pass, UI zoom, CompareManager, install from a file | ⬜ Planned |
| P8 | Packaging (optional) | ⬜ Optional |

**Every phase** shows net `wc -l media-viewer.js` ≤ 0 in its PR (spec § 11.1), enforced by the blocking line ratchet once built. `media-viewer.js` was 11,529 lines at `e0b2a16` (2026-10-27).

**Target**: about May 2027 (soft) — about 131–136 SP nominal, with estimates historically ~1.9× low (spec § 14, whose end-of-Q1 date assumed the whole 🔵 share)

> **The date assumes v2 takes ~12 SP of each normal week's ~17 user-flagged SP** (user ruling 2026-10-28, at Cleanup Week #5's planning: the "Most" option). The other ~5 SP stay for 🔵 picks outside v2, the drained follow-ups above included (the G5 ruling). The spec's end-of-Q1 date assumed the whole share (spec § 14: "At ~17 user-flagged SP per normal week, that is about 8 normal weeks"); at ~12 SP, the spec's own method (the ~1.9× slip, Cleanup Weeks included) gives about May 2027. A normal week that gives v2 less moves it later.

### v2.0 — Modularization ↪ Absorbed into v2 (2026-10-27)

**Theme**: Carve the monolithic renderer into manager modules (v2.0 pattern: stateful manager class + constructor-injected host callbacks)
**Status**: ↪ Absorbed into v2 on 2026-10-27 (v2 spec D1). The v2.0 pattern still applies inside v2's core (spec § 11.1).

| Module                                                                          | Outcome |
| ------------------------------------------------------------------------------- | ------- |
| FullscreenManager (`fullscreen.js`)                                             | ✅ Extracted |
| TournamentManager (`tournament.js`) + TournamentEngine (`tournament-engine.js`) | ✅ Extracted; the whole of tournament mode becomes the `tournament` module in P6b |
| MLManager                                                                       | 🟡 Training half extracted (`ml-training.js`, PR #68); the sort half becomes `ai-sort` in P4b |
| `FeatureCacheStore` (`feature-cache-store.js`)                                  | ✅ Extracted (PR #86, not in the original plan) |
| ZoomManager (`zoom.js`)                                                         | ✅ Extracted (PR #90, `082e3b2`), before v2 began; P7 keeps only the CompareManager split |
| SortingManager                                                                  | ↪ Becomes the `similarity` module (P1b) |
| CompareManager                                                                  | ↪ A core split in P7 |

Originally-planned v2.0 features delivered early: automated testing (Vitest + Playwright, hook-enforced), keyboard-shortcut customization.

> **Why it was absorbed.** `media-viewer.js` went from ~7,900 lines (2026-07-12) to 9,418 (2026-08-27) and 11,945 (2026-10-25), while only `MlTrainingManager` and `FeatureCacheStore` moved out in that window. Extracting one manager at a time lost ground to feature work. v2 gives features a module boundary to land behind, and forbids renderer growth in any phase.

---

## Completed Milestones

### v1.0 — Core Features ✅

- [x] Media browsing with keyboard navigation
- [x] Rating system (like/dislike/special)
- [x] Compare mode for side-by-side viewing
- [x] Visual similarity sorting (VP-Tree, MST)
- [x] ML-based prediction sorting
- [x] Image zoom and pan
- [x] Face detection
- [x] Sorting result caching
- [x] Background feature extraction

---

## Ongoing

- Keep documentation current with codebase (planning-session staleness check — see [README.md](README.md) § Strategic Review)
- Performance monitoring for large media collections
- Security review of file operations

---

## Principles

1. **Efficiency first**: Operations should feel instant for the user
2. **No data loss**: File operations must be safe and reversible (undo)
3. **Progressive enhancement**: Advanced features (ML, similarity) enhance but don't block core workflow
4. **The core stays small**: new features land in modules by default, behind an enforced boundary (v2 spec G-1; the user's April note: don't clutter the core "with functionality the user may not even need")

---

_See [WEEKLY.md](WEEKLY.md) for the current week's plan._
_See [MILESTONES.md](MILESTONES.md) for key dates._
_See [BACKLOG.md](BACKLOG.md) for the full idea/task pool._
