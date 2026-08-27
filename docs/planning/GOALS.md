# Goals

Project objectives and success metrics.

**Last Updated**: 2026-08-27
**Review Cycle**: Continuous — weekly-planning staleness check (see [README.md](README.md) § Strategic Review)

---

## Mission

Provide the most efficient desktop tool for reviewing, rating, and organizing large media collections with intelligent sorting capabilities.

---

## Current Objectives

### Objective 1: 24k-Scale Responsiveness

**Description**: Every core operation (open folder, sort, rate, tournament) stays responsive and honest — visible progress, working cancel — on the user's real 24,000+ file folder.

**Key Results**:
| Key Result | Target | Current | Status |
|------------|--------|---------|--------|
| Tournament mode smooth at 24k (pairing, persist, undo) | Done | Shipped (PRs #55/#59; real-24k smoke passed) | 🟢 |
| AI-sort startup: visible progress card, no silent ~40s wait | Done | Shipped (PR #64; 24k smoke passed 2026-07-20) | 🟢 |
| AI sort serves cached features (no redundant re-extraction) | Done | Shipped (PR #64) | 🟢 |
| AI sort cancelable mid-run | Done | Shipped (PR #64) | 🟢 |
| Hash/similarity sort off the renderer thread (PR2 slice) | Done | Open, unscheduled | 🔴 |

**Timeline**: Q3 2026 — met for the AI-sort scope (PR #64, 2026-07-20); the PR2 remainder is unscheduled
**Owner**: goodalex223

---

### Objective 2: Maintainable Architecture (v2.0)

**Description**: Complete the v2.0 modularization pattern — extract stateful subsystems out of the monolithic renderer into dedicated ES modules (manager class + constructor-injected host callbacks).

**Key Results**:
| Key Result | Target | Current | Status |
|------------|--------|---------|--------|
| FullscreenManager extracted | Done | Shipped | 🟢 |
| TournamentManager + pure TournamentEngine extracted | Done | Shipped | 🟢 |
| ZoomManager extracted | Done | Not started | 🔴 |
| CompareManager extracted | Done | Not started | 🔴 |
| SortingManager extracted | Done | Not started | 🔴 |
| MLManager extracted | Done | Not started | 🔴 |
| Renderer line count reduced by the four extractions | < ~6,000 after the four extractions (soft) | ~9,400 (up from ~7,900 in July) | 🔴 |

**Timeline**: Q4 2026 (soft)
**Owner**: goodalex223

> The renderer grew ~1,550 lines between July and August 2026 while extraction was paused. Modularization is currently losing ground to feature work — which is why it sits in the roadmap's **Now** column rather than Next.

---

## Non-Goals

Things we explicitly are NOT trying to do:

- **Multi-user support** — Single-user desktop application
- **Cloud storage** — Local files only (for now)
- **Mobile support** — Desktop (Electron) only
- **Video editing** — View and rate only, no editing

---

## Constraints

| Constraint                         | Description                                                                                                                                          | Impact                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| No TypeScript                      | Plain JavaScript; `typescript-lsp` provides code navigation, but no type checking                                                                    | Type errors are caught by tests and review, not a compiler                    |
| No CI service                      | All gates are local Husky hooks: pre-commit (secret scan → lint-staged → 513 unit tests) + pre-push (conditional E2E — skipped for docs-only pushes) | A bypassed hook has no server-side backstop; verification discipline is local |
| Large renderer file                | ~9,400-line `media-viewer.js`, being modularized under v2.0                                                                                          | Search before adding code; conflicts likely until extraction completes        |
| Real-24k verification is user-side | Playwright fixtures top out at a handful of files; 24k-folder behavior cannot be E2E-fixtured                                                        | Performance work gates on manual user smokes (async, may trail the PR)        |

---

_See [ROADMAP.md](ROADMAP.md) for the theme board and releases._
_See [MILESTONES.md](MILESTONES.md) for key dates._
_See [TODO.md](TODO.md) for tactical execution._
