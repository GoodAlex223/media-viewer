# Goals

Project objectives and success metrics.

**Last Updated**: 2026-10-30 <!-- G2 pre-push gate: a status edit only (G-7 ratchet built; pre-push description). --> <!-- Weekly planning (Cleanup Week #5, Oct 26–30): a status edit only, not a refresh. v2's weekly 🔵 share is set to ~12 SP ("Most", user ruling 2026-10-28), so Objective 2's timeline moves to about May 2027. The 2-month clock still runs from 2026-10-27. --> <!-- G5 strategic-doc refresh (plan 2026-10-27_g5-strategic-doc-refresh.md): mission widened, Objective 1 achieved, Objective 2 re-baselined to v2 (spec § 11.1), by the user's rulings of 2026-10-27. The 2-month clock restarts here. Earlier: 2026-10-09 and 2026-10-17 were status flips only, not refreshes. -->
**Review Cycle**: Continuous — planning-session staleness check (see [README.md](README.md) § Strategic Review)

---

## Mission

Provide the most efficient desktop tool for collecting, reviewing, rating and keeping large media collections, with intelligent sorting.

---

## Current Objectives

### Objective 2: v2 — modules and redesign

**Description**: Build v2 inside the working app, one shippable phase at a time: a small core (open a folder, view, rate, compare, undo), first-party modules that can be switched on and off, a module host, and a redesigned shell ([v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) § 2). It absorbs the v2.0 modularization release (spec D1, re-baselined 2026-10-27). v2.0 had extracted FullscreenManager, TournamentManager with TournamentEngine, `MlTrainingManager` (MLManager's training half), `FeatureCacheStore` and ZoomManager (PR #90); its remaining managers became v2 phases.

**Key Results** (the spec's goals, § 3, and the phases that deliver them, § 14):
| Key Result | Target | Current | Status |
|------------|--------|---------|--------|
| G-1 Core identity: a written, enforced line between core and modules, so new features land in modules by default | § 5's split, enforced by rules M-1 and M-2 (§ 6.2: a test and a lint, each shown able to fail by a planted violation, P1a) | Designed (spec § 5); not built | 🔴 |
| G-2 Modules the user connects: each module toggles on and off from a Modules page | P1a | Not started | 🔴 |
| G-3 Existing features move out unchanged: `similarity` (P1b), `ai-sort` (P4b), `tournament` (P6b) | Suites keep their assertions and stay green | Not started | 🔴 |
| G-4 Fetch: links → an Inbox folder → rate | P3b | Not started; the downloader research is still to run | 🔴 |
| G-5 Compress: lossless JPEG XL in place, verified, revertible until Finalize | P5 | Not started | 🔴 |
| G-6 Redesign: the shell (P2), the control registry (P6a), the responsive pass (P7) | § 11.2 | Not started | 🔴 |
| G-7 The renderer shrinks | Net `wc -l media-viewer.js` ≤ 0 in every phase's PR, enforced by a blocking line ratchet (user ruling 2026-10-27); the renderer plus `core/*.js` below 11,945 lines (`308d43c`); `media-viewer.js` below 6,000 by the end of P7 (§ 11.1) | 11,529 lines at `e0b2a16` (2026-10-27); the ratchet is built (G2): `scripts/renderer-line-ceiling.txt`, 11,529 | 🔴 |
| G-8 Runs on Windows and Linux: both suites on both platforms at every phase exit | From P1a's Linux baseline | Windows only | 🔴 |

**Timeline**: P1a from the week of Nov 2–6, 2026 at the earliest; about May 2027 (soft). The date assumes v2 takes ~12 SP of each normal week's ~17 🔵 SP (user ruling 2026-10-28); a week that gives v2 less moves it later ([ROADMAP.md](ROADMAP.md) § Releases)
**Owner**: goodalex223

> **Why the re-baseline.** The August target, "< ~6,000 lines after the four extractions", needed ~5,400 lines out, while the renderer grew from 9,418 lines (2026-08-27) to 11,945 (2026-10-25). Four extractions of ZoomManager's size (−416 lines) could not reach it. v2's target moves whole clusters out (§ 11.1: about 5,050–5,550 lines by the end of P6) and forbids growth in any phase.

---

## Achieved Objectives

### Objective 1: 24k-Scale Responsiveness ✅ Achieved 2026-10-25

**Description**: Every core operation (open folder, sort, rate, tournament) stays responsive and honest — visible progress, working cancel — on the user's real 24,000+ file folder.

**Key Results**:
| Key Result | Target | Current | Status |
|------------|--------|---------|--------|
| Tournament mode smooth at 24k (pairing, persist, undo) | Done | Shipped (PRs #55/#59; real-24k smoke passed) | 🟢 |
| AI-sort startup: visible progress card, no silent ~40s wait | Done | Shipped (PR #64; 24k smoke passed 2026-07-20) | 🟢 |
| AI sort serves cached features (no redundant re-extraction) | Done | Shipped (PR #64) | 🟢 |
| AI sort cancelable mid-run | Done | Shipped (PR #64) | 🟢 |
| Hash/similarity sort off the renderer thread (PR2 slice) | Done | Shipped (PR #85 `f668611`, PR #87 `f5ddfa3`); the real-folder smoke passed 2026-10-25: a cold hash phase took 580 s in the background, against 1,262 s frozen before | 🟢 |

**Timeline**: Q3 2026 — met for the AI-sort scope (PR #64, 2026-07-20) and in full on 2026-10-25
**Owner**: goodalex223

> **Carried forward** (user ruling 2026-10-27): 24k speed stays a rule under v2, not an objective. A slower core at 24k is a v2 anti-goal (spec § 3), and the user runs a 24k smoke after P1b, P4b, P5 and P6b with recorded timings (§ 15). The similarity sort's graph-build phase, now the long part of a cold run, is a 🔵 BACKLOG entry ([2026-10-25] "The similarity sort's graph-build phase is now the long part of a cold run").

---

## Non-Goals

Things we explicitly are NOT trying to do:

- **Multi-user support** — Single-user desktop application
- **Cloud storage** — Local files only (for now)
- **Mobile support** — Desktop (Electron) only
- **Video editing** — View and rate only, no editing
- **Third-party modules or a module store** — v2's modules are first-party and ship in the repo (spec § 3)
- **Embedded players or streaming remote content** — Fetch downloads first, then the viewer shows local files (spec § 3, § 9)

_v2's full non-goals list is in the [v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) § 3._

---

## Constraints

| Constraint                         | Description                                                                                                                                          | Impact                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| No TypeScript                      | Plain JavaScript, with no type checking; the `typescript-lsp` trial was dropped on 2026-10-27 (REVIEW-QUEUE § 5)                                      | Type errors are caught by tests and review, not a compiler                    |
| No CI service                      | All gates are local Husky hooks: pre-commit (secret scan → docs-index guard → `CLAUDE.md` size warning (never blocks) → lint-staged → the full unit suite) + pre-push (the renderer line ratchet, then conditional E2E — skipped when a push changes only paths the app never loads) | A bypassed hook has no server-side backstop; verification discipline is local |
| Large renderer file                | `media-viewer.js` is 11,529 lines (2026-10-27, `e0b2a16`); v2 moves its code into `core/` and `modules/`                                             | Search before adding code; conflicts likely until v2's phases land            |
| Real-24k verification is user-side | Playwright fixtures top out at a handful of files; 24k-folder behavior cannot be E2E-fixtured                                                        | Performance work gates on manual user smokes (async, may trail the PR)        |
| Public repository                  | Anything committed is public; nothing from the user's folders (file or folder names, per-file scores, images) enters git (v2 spec § 15)              | Smokes and real-data checks record only counts, timings and overall metrics   |

---

_See [ROADMAP.md](ROADMAP.md) for the theme board and releases._
_See [MILESTONES.md](MILESTONES.md) for key dates._
_See [TODO.md](TODO.md) for tactical execution._
