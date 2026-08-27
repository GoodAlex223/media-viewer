# G4: Strategic-Doc Refresh & CLAUDE.md Pre-Push Gate Sync — Design

**Date**: 2026-07-12 (brainstorm held early — replaces the Thursday Jul 16 strategic-doc brainstorm that gated G4's 🟡 refresh)
**Branch**: `docs/g4-strategic-docs-refresh`
**Status**: Approved by user (all 5 decisions + full design, 2026-07-12)
**WEEKLY group**: G4 (🟡 strategic refresh + 🟤 CLAUDE.md doc-sync, folded)
**Execution model**: This spec embeds **near-final target content** so a cheaper model can execute it mechanically (scheduled Friday Jul 17). The executor's job is: re-verify facts → apply content → bump dates → commit → PR. No strategic judgment required or permitted.

---

## 1. Problem

`docs/planning/GOALS.md`, `ROADMAP.md`, and `MILESTONES.md` are frozen at **2026-02-05** and factually wrong:

- GOALS claims "No automated tests / Manual testing only" — reality: **434 unit tests + 52 E2E**, enforced by pre-commit and pre-push hooks.
- GOALS claims a "~6100-line" renderer — reality: **7,864 lines** (and CLAUDE.md's "~8400" is also stale, post-PR #54 dead-code cut).
- v1.1 is "🟡 On Track Q1 2026" — its two named features shipped in February; five months of major work (Tournament mode, JXL, CLIP, test suite, 24k-perf) shipped entirely outside the documented roadmap.
- v2.0 is "⬜ Not Started" — its modularization is underway (FullscreenManager, TournamentManager extracted) and two of its three original features (automated testing, shortcut customization) already shipped.

Separately (🟤 [2026-07-11], PR #63 post-merge): CLAUDE.md omits the new pre-push E2E gate — the Architecture-tree `scripts/` bullet lists only `check-secrets.js`, and the hook prose describes only pre-commit. This is a recurrence of the PR #51 doc-drift class.

Root cause of the freeze: "Review Cycle: Quarterly" had no enforcing mechanism. This refresh also fixes the process.

## 2. Decisions (user-approved 2026-07-12)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Release model | **Hybrid**: retro-close v1.1 as ✅ shipped; keep ONE forward version (v2.0 = modularization arc); everything else becomes **themes** (Now/Next/Later), not numbered releases |
| D2 | v2.0 definition of done | **Modularization arc only**: ZoomManager, CompareManager, SortingManager, MLManager extracted, tests green. Testing + shortcut-customization goals marked already-delivered |
| D3 | Theme board placement | **Now**: 24k-folder perf & responsiveness; rating & tournament UX polish. **Next**: v2.0 modularization completion; UI architecture overhaul. **Later**: add-on system (design → sorting-as-add-ons → compression port → platform integrations); progressive loading |
| D4 | Staleness prevention | **Weekly-planning staleness check**: concrete rule in planning README § Strategic Review + one line in the user's local weekly-planning prompt; GOALS "Review Cycle" points at it |
| D5 | Handoff depth | **Spec embeds near-final content** + verified-facts table with re-verification commands; executor applies mechanically |

Milestone targets approved as proposed: *24k AI-sort smooth end-to-end* — July 2026; *v2.0 modularization complete* — Q4 2026 (explicitly soft).

## 3. Verified-Facts Table

The executor MUST re-run every command at execution time and use the fresh value. **Small numeric drift** (test count, line count changed) → use the new number everywhere the fact appears. **Structural contradiction** (e.g. a new manager was extracted, a G1 item already shipped/checked off, pre-push hook changed) → STOP and report to the user before writing.

| Fact | Value verified 2026-07-12 | Re-verify command (PowerShell) |
|------|---------------------------|-------------------------------|
| Unit tests | **434 passed, 16 files** | `npx vitest run --no-file-parallelism 2>&1 \| Select-String 'Test Files\|Tests '` |
| E2E tests | **52 tests, 13 files** | `npx playwright test --list 2>$null \| Select-Object -Last 1` |
| Renderer size | **7,864 lines** (write as "~7,900") | `(Get-Content media-viewer.js \| Measure-Object -Line).Lines` |
| Managers extracted | FullscreenManager (`fullscreen.js`), TournamentManager (`tournament.js`) + pure TournamentEngine (`tournament-engine.js`) | `Test-Path fullscreen.js, tournament.js, tournament-engine.js` → all True |
| Managers still planned | ZoomManager, CompareManager, SortingManager, MLManager | CLAUDE.md § Code Conventions → Patterns ("Planned next:") |
| v1.1 feature 1: video fullscreen toggle | ✅ shipped 2026-02-05 | `Select-String 'Video fullscreen toggle' docs/planning/DONE.md` |
| v1.1 feature 2: visual scale controls | ✅ shipped (zoom slider + popover, E2E-covered) | `npx playwright test --list 2>$null \| Select-String 'zoom'` → zoom.test.js entries |
| Pre-push gate behavior | `node scripts/check-e2e-needed.js` prints RUN/SKIP; SKIP only when EVERY changed path is `*.md` or under `docs/`; fail-safe → RUN; on RUN the hook runs `npx playwright test`; bypass = `git push --no-verify` | Read `.husky/pre-push` (5 lines) + header comment of `scripts/check-e2e-needed.js` |
| G1 status (AI-sort UX week lead) | ⬜ Planned for Jul 13–17, not yet shipped | `docs/planning/WEEKLY.md` Summary Table G1 row — if ✅ by execution time, flip the three G1-dependent KRs in § 4.1 to 🟢/shipped wording |

## 4. Target Content Per File

Conventions for all five files: `<DATE>` = execution date (`YYYY-MM-DD`). Keep LF line endings. Prettier ignores `docs/` and `*.md`, so no formatting-hook concerns. Minor wording smoothing is allowed; **new claims are not**.

### 4.1 `docs/planning/GOALS.md` — full replacement

```markdown
# Goals

Project objectives and success metrics.

**Last Updated**: <DATE>
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
| AI-sort startup: visible progress card, no silent ~40s wait | Done | In progress (G1, week of Jul 13) | 🟡 |
| AI sort serves cached features (no redundant re-extraction) | Done | In progress (G1) | 🟡 |
| AI sort cancelable mid-run | Done | In progress (G1) | 🟡 |
| Hash/similarity sort off the renderer thread (PR2 slice) | Done | Open, deferred | 🔴 |

**Timeline**: Q3 2026
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
| Renderer line count trending down | < ~6,000 after the four extractions (soft) | ~7,900 | 🟡 |

**Timeline**: Q4 2026 (soft)
**Owner**: goodalex223

---

## Non-Goals

Things we explicitly are NOT trying to do:

- **Multi-user support** — Single-user desktop application
- **Cloud storage** — Local files only (for now)
- **Mobile support** — Desktop (Electron) only
- **Video editing** — View and rate only, no editing

---

## Constraints

| Constraint | Description | Impact |
|------------|-------------|--------|
| No TypeScript | Plain JavaScript; `typescript-lsp` provides code navigation, but no type checking | Type errors are caught by tests and review, not a compiler |
| No CI service | All gates are local Husky hooks: pre-commit (secret scan → lint-staged → 434 unit tests) + pre-push (conditional E2E — skipped for docs-only pushes) | A bypassed hook has no server-side backstop; verification discipline is local |
| Large renderer file | ~7,900-line `media-viewer.js`, being modularized under v2.0 | Search before adding code; conflicts likely until extraction completes |
| Real-24k verification is user-side | Playwright fixtures top out at a handful of files; 24k-folder behavior cannot be E2E-fixtured | Performance work gates on manual user smokes (async, may trail the PR) |

---

*See [ROADMAP.md](ROADMAP.md) for the theme board and releases.*
*See [MILESTONES.md](MILESTONES.md) for key dates.*
*See [TODO.md](TODO.md) for tactical execution.*
```

### 4.2 `docs/planning/ROADMAP.md` — full replacement

Note: the old "Future (v3.0+)" bullet list is deliberately dropped. Its "plugin system" item lives on as the Later *add-on system* theme; the other bullets (TypeScript migration, cloud sync, batch operations, advanced ML) are intentionally removed — anything still wanted re-enters through BACKLOG intake, not through an aspirational roadmap list.

```markdown
# Roadmap

Long-term vision, active themes, and releases.

**Last Updated**: <DATE>

---

## Vision

Make Media Viewer the most efficient tool for reviewing and organizing large media collections with intelligent sorting and prediction capabilities.

---

## Current Phase

**Phase**: Scale & Modularize
**Focus**: Make the 24k-folder experience smooth end-to-end while carving the renderer into modules
**Timeline**: H2 2026

---

## Theme Board

Work flows weekly from [BACKLOG.md](BACKLOG.md) → [WEEKLY.md](WEEKLY.md); this board is the strategic map of where the themes sit, not a duplicate task list.

### Now

- **24k-folder performance & responsiveness** — AI-sort startup UX + incremental feature-cache load (G1, week of Jul 13), sort cancelability, hash-off-renderer-thread (PR2 slice, open). Driver: the most-repeated dogfooding pain on the real 24k folder. Tracked as TODO 🔴 "Speed up AI / similarity sorting on large folders (24k+)".
- **Rating & tournament UX polish** — tournament undo reliability, mouse-wheel guard, header auto-hide, bulk-rate re-pair avoidance, sort mutual-exclusion. Driver: continuous manual-testing intake from 24k dogfooding.

### Next

- **v2.0 modularization completion** — see the v2.0 release below.
- **UI architecture overhaul** — mode-aware control registry, centralized z-index scale (CSS custom properties), responsive pass for window sizes / large counts. BACKLOG [2026-05-25]; explicitly a prerequisite before any 4th mode ships.

### Later

- **Add-on / extension system** — design first (define core-app identity: what is core, what is an add-on), then in dependency order: sorting-as-add-ons, lossless-compression port (`media_compression` project), platform integrations (YouTube/TikTok/Twitter/Instagram/Civitai), link-based rating. BACKLOG [2026-04-08] cluster + [2026-05-30] compression entry.
- **Progressive loading** — thumbnail / lowest-quality-first display while full media loads. BACKLOG [2026-04-08].

---

## Releases

### v1.1 — Polish Release ✅ Shipped

**Theme**: Core stability and UX refinement
**Status**: ✅ Complete (retro-declared <DATE>; scope long since exceeded)

Named features:

| Feature | Status | Notes |
|---------|--------|-------|
| Video fullscreen toggle | ✅ Shipped 2026-02 | Later extracted into FullscreenManager |
| Visual scale controls | ✅ Shipped | Zoom slider + popover; E2E-covered (`zoom.test.js`) |

Shipped far beyond the v1.1 scope (Feb–Jul 2026): Tournament mode (Swiss engine, persistence, session undo), JXL + animated-JXL viewer, CLIP semantic sorting + 576-dim ML pipeline, bulk-rate corrective training, automated test suite (434 unit + 52 E2E), keyboard-shortcut customization, local quality gates (pre-commit secret scan/lint/unit; conditional pre-push E2E).

### v2.0 — Modularization 🔄 In Progress

**Theme**: Carve the monolithic renderer into manager modules (v2.0 pattern: stateful manager class + constructor-injected host callbacks)
**Status**: 🔄 In Progress — 2 of 6 managers extracted
**Done when**: ZoomManager, CompareManager, SortingManager, and MLManager are extracted with unit + E2E suites green.

| Module | Status |
|--------|--------|
| FullscreenManager (`fullscreen.js`) | ✅ Extracted |
| TournamentManager (`tournament.js`) + TournamentEngine (`tournament-engine.js`) | ✅ Extracted |
| ZoomManager | ⬜ Planned |
| CompareManager | ⬜ Planned |
| SortingManager | ⬜ Planned |
| MLManager | ⬜ Planned |

Originally-planned v2.0 features delivered early: automated testing (Vitest + Playwright, hook-enforced), keyboard-shortcut customization.

**Target**: Q4 2026 (soft — modularization proceeds opportunistically alongside Now themes)

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

- Keep documentation current with codebase (weekly-planning staleness check — see [README.md](README.md) § Strategic Review)
- Performance monitoring for large media collections
- Security review of file operations

---

## Principles

1. **Efficiency first**: Operations should feel instant for the user
2. **No data loss**: File operations must be safe and reversible (undo)
3. **Progressive enhancement**: Advanced features (ML, similarity) enhance but don't block core workflow

---

*See [WEEKLY.md](WEEKLY.md) for the current week's plan.*
*See [MILESTONES.md](MILESTONES.md) for key dates.*
*See [BACKLOG.md](BACKLOG.md) for the full idea/task pool.*
```

### 4.3 `docs/planning/MILESTONES.md` — full replacement

````markdown
# Milestones

Key targets with dates.

**Last Updated**: <DATE>

---

## Overview

Milestones are significant checkpoints. They should be:
- **Specific** — Clear definition of "done"
- **Measurable** — Objectively verifiable
- **Time-bound** — Has a target date

---

## Upcoming Milestones

### 🎯 24k AI-sort smooth end-to-end

**Target Date**: July 2026
**Status**: 🟡 In Progress (G1, week of Jul 13–17 + PR2 remainder)

**Definition of Done**:
- [ ] Sort-by-Predicted shows a determinate progress card immediately (no silent ~40s wait)
- [ ] Cached features are served — no redundant re-extraction on a warm cache
- [ ] Cancel aborts the AI-sort path mid-run
- [ ] Verified by a manual smoke on the real 24,000+ file folder

**Dependencies**: user-side 24k smoke (cannot be E2E-fixtured)

**Risks**:
- Verification is user-side/async — checkoff may trail the code landing (same pattern as the tournament 24k work)

---

### 🎯 v2.0 modularization complete

**Target Date**: Q4 2026 (soft)
**Status**: 🟡 In Progress — 2 of 6 managers extracted

**Definition of Done**:
- [ ] ZoomManager extracted
- [ ] CompareManager extracted
- [ ] SortingManager extracted
- [ ] MLManager extracted
- [ ] Unit + E2E suites green after each extraction
- [ ] CLAUDE.md architecture section updated per extraction

**Dependencies**: none hard; proceeds opportunistically alongside Now themes

**Risks**:
- Extractions compete for weekly capacity with user-flagged work (the ≥50% 🔵 quota floor)

---

## Milestone Timeline

```
2026
Q3                          Q4
 │                           │
 ▼                           ▼
[24k AI-sort smooth]        [v2.0 modularization]
G1 + PR2                    4 manager extractions
```

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| 24k AI-sort smooth end-to-end | July 2026 | 🟡 In Progress |
| v2.0 modularization complete | Q4 2026 (soft) | 🟡 In Progress (2/6) |

---

## Completed Milestones

### ✅ v1.1 Polish Release

**Completed**: retro-declared <DATE> (named features shipped 2026-02)
**Result**: Scope exceeded many times over

**What was delivered** (against the original Definition of Done):
- [x] Video fullscreen toggle — shipped 2026-02-05, later extracted into FullscreenManager
- [x] Visual scale controls — zoom slider + popover, E2E-covered (`zoom.test.js`)
- [x] "Manual testing checklist passed" — superseded: 434 unit + 52 E2E tests, hook-enforced, plus per-PR manual smokes
- [x] "All documentation up to date" — satisfied by the <DATE> strategic-doc refresh

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

## Health Summary

| Status | Count | Milestones |
|--------|-------|------------|
| ✅ Complete | 2 | v1.0 Core Features, v1.1 Polish |
| 🟡 In Progress | 2 | 24k AI-sort smooth, v2.0 modularization |

---

*See [ROADMAP.md](ROADMAP.md) for release context and the theme board.*
*See [TODO.md](TODO.md) for tactical tasks toward milestones.*
````

### 4.4 `CLAUDE.md` — three surgical edits (NOT a rewrite)

**Edit 1 — Architecture tree, `scripts/` line.** Current:

```
├── scripts/             # Maintenance scripts (Node CJS): check-secrets.js (pre-commit secret guard — scanForSecrets + extractAddedLines + CLI)
```

Replace with:

```
├── scripts/             # Maintenance scripts (Node CJS): check-secrets.js (pre-commit secret guard — scanForSecrets + extractAddedLines + CLI); check-e2e-needed.js (pre-push E2E gate decision — parsePushRefs/classifyPaths + fail-safe RUN/SKIP CLI)
```

**Edit 2 — Build & Development Commands, hook prose.** Current paragraph ends: `E2E is NOT run by the hook.` Replace that final sentence with:

```
E2E is NOT run by the pre-commit hook. Pre-push hook: `node scripts/check-e2e-needed.js` prints RUN/SKIP for the outgoing range (SKIP only when EVERY changed path is `*.md` or under `docs/`; any git/parse failure fails safe to RUN); on RUN the hook runs the full Playwright E2E suite. Bypass a WIP push with `git push --no-verify`.
```

**Edit 3 — renderer line count.** In the Architecture tree, `media-viewer.js` line: change `(~8400 lines, MediaViewer class)` to `(~7,900 lines, MediaViewer class)` (re-verify the count first per § 3; also grep CLAUDE.md for any other `8400` occurrence and update it the same way).

### 4.5 `docs/planning/README.md` — two edits

**Edit 1 — replace the entire `### Strategic Review` section** (currently four vague "periodically review" checkboxes) with:

```markdown
### Strategic Review (staleness check)

Run as part of every weekly planning session (ROADMAP/GOALS/MILESTONES are already
listed planning Sources):

- If work shipped since the last plan **contradicts** the strategic docs (a feature
  landed outside the theme board, a Key Result was met or made obsolete, a milestone
  passed), **or** any of the three has `Last Updated` **older than 2 months** → file a
  🟡 Operational BACKLOG entry ("strategic-doc refresh", citing the specific drift).
- Small factual fixes (a number, a status flip) may instead ride along in that week's
  docs group — no dedicated refresh entry needed.
```

**Edit 2 — document tables**: add the two missing rows.

In the "Task Management (Tactical)" table add:

```markdown
| [WEEKLY.md](WEEKLY.md) | Current week's plan: task groups, daily schedule, source quotas |
| [REVIEW-QUEUE.md](REVIEW-QUEUE.md) | Weekly Reviews queue: parked candidates + verdict log |
```

Also update the Overview table's Tactical row from `TODO.md, BACKLOG.md` to `WEEKLY.md, TODO.md, BACKLOG.md, REVIEW-QUEUE.md`.

## 5. User-Side Action (out of repo — cannot be done by the executor)

Add one line to the local weekly-planning prompt (the one verified against the 2026-05-30 planning-restructure spec checklist):

> Strategic-docs staleness check: compare ROADMAP/GOALS/MILESTONES against what shipped since the last plan; if contradicted or `Last Updated` > 2 months, file a 🟡 "strategic-doc refresh" BACKLOG entry.

## 6. Execution Rules for the Cheaper Model

1. **Facts first**: re-run every § 3 command; on structural contradiction, STOP and report (do not improvise around it).
2. **No new claims**: content comes from § 4; wording may be smoothed, facts may not be invented. Replace every `<DATE>` with the execution date.
3. **Order**: § 4.1 → 4.2 → 4.3 → 4.4 → 4.5 (strategic docs first, then the mechanical syncs).
4. **Verify**: after edits, grep the three strategic docs for leftovers: `6100`, `No automated tests`, `Q1 2026`, `Not Started` (v2.0 context), `<DATE>` — all must be gone; check every intra-doc link target exists.
5. **Commit** (docs-only): suggested `docs(planning): refresh strategic docs to July 2026 reality (G4)` + `docs(claude-md): sync pre-push E2E gate + renderer line count (G4)` — one or two commits, executor's choice.
6. **Push**: expect the pre-push gate to print the docs-only SKIP message — if it runs the full E2E suite instead, a non-docs file snuck into the diff; investigate before pushing further.
7. **PR**: docs-only → manual user review, NO `/code-review` fan-out (per the [2026-06-29] convention, restated in WEEKLY Notes).
8. **Closeout** (after user approval, per CLAUDE.md Task Completion): check off both G4 boxes in WEEKLY (Summary-Table Status → `✅ PR #N` + Daily-Schedule Friday entry), the 🟡 [2026-07-01] BACKLOG entry and the 🟤 [2026-07-11] entry, DONE.md entry, archive the plan, extract ≥2 improvements to BACKLOG.

## 7. Out of Scope

- Editing WEEKLY.md's own "~8400-line" or "434 unit" mentions — WEEKLY is a dated plan document; its numbers were true at write time.
- Any code change. Any BACKLOG entry restructuring.
- The add-on system design itself (Later theme; separate future brainstorm).
- Automating the CLAUDE.md-vs-`scripts/`+`.husky/` drift guard (already a candidate 🟤 from the PR #63 session — file/refresh it at closeout if not already present, do not build it here).

## 8. Design Alternatives Considered

- **Release model**: keep versioned trains (rejected — went stale once; nothing cuts releases) vs. pure theme board (rejected — loses the v2.0 label CLAUDE.md/BACKLOG reference) → hybrid chosen.
- **Staleness fix**: keep quarterly note (rejected — the mechanism that already failed) vs. nothing (rejected) → weekly-planning check chosen (the one cadence that provably runs).
- **Handoff depth**: directives-only spec (rejected — a small model drafting strategic prose risks re-introducing exactly the aspirational fiction being purged) → near-final content embedded.

---

## 9. Amendment — 2026-08-27 Re-Verification (execution-time)

**Context**: execution slipped from the scheduled Fri 2026-07-17 to **2026-08-27** (~6.5 weeks). In that window G1 (PR #64), G2 (PR #65), G3 (PR #66) and G5 (merge `4f1e65a`) all landed. Per § 3, the executor re-ran every fact command; the results triggered the spec's own **"structural contradiction → STOP and report"** rule. This section records the re-verified facts and the four resulting user decisions. **§ 1–§ 8 remain approved and in force**; where § 4 target content conflicts with this section, **this section wins**.

Branch note: the original `docs/g4-strategic-docs-refresh` was cut on 2026-07-12 and had fallen ~6 weeks behind `main`. It was preserved as `stale/g4-strategic-docs-refresh-2026-07-12`; the branch of the same name was re-cut from `main` (`a8df78c`) and the spec + plan commits cherry-picked across. The stale branch's third commit (a scratch WEEKLY note, `0148897`) was deliberately dropped.

### 9.1 Re-verified fact table

| Fact | § 3 value (2026-07-12) | Verified 2026-08-27 | Kind |
|------|------------------------|---------------------|------|
| Unit tests | 434 passed, 16 files | **513 passed, 17 files** | numeric drift |
| E2E tests | 52 tests, 13 files | **55 tests, 13 files** | numeric drift |
| Renderer size | 7,864 lines (write "~7,900") | **9,418 lines** (write "~9,400") | ⚠️ **structural** |
| Managers extracted | FullscreenManager, TournamentManager + TournamentEngine | unchanged — still 2 of 6 | holds |
| Managers still planned | Zoom, Compare, Sorting, ML | unchanged | holds |
| v1.1 features 1 & 2 | ✅ shipped | unchanged | holds |
| Pre-push gate behavior | RUN/SKIP, fail-safe RUN | unchanged | holds |
| G1 status | ⬜ Planned Jul 13–17 | ✅ **PR #64**, merged `b6ff4ac` 2026-07-20; user-side 24k smoke **PASSED** (20,929-file folder, all 5 checks) | anticipated by § 3 |
| G2 status | (not in spec) | ✅ **PR #65**, merged `937084c` 2026-07-21; 6-point smoke PASSED | ⚠️ **structural** |
| G3 status | (not in spec) | ✅ **PR #66** work merged `0b00275` 2026-08-24 (⚠️ re-smoke round 2 not run) | ⚠️ **structural** |
| G5 status | (not in spec) | ✅ merged `4f1e65a` 2026-08-27; added REVIEW-QUEUE § 4 | ⚠️ **structural** |
| CLAUDE.md size | (not tracked) | **205 lines**; 🟤 [2026-08-27] proposes migrating path-conditional content to `.claude/rules/` | noted, not acted on |

### 9.2 Decisions (user-approved 2026-08-27)

| # | Contradiction | Decision |
|---|---------------|----------|
| **D6** | Renderer grew 7,864 → 9,418 (+1,554, +20%) with **zero** extractions, so § 4.1's KR *"Renderer line count trending down … ~7,900 … 🟡"* asserts the opposite of the measurement | **Report honestly**: reword the KR to *"Renderer line count reduced by the four extractions"*, status **🔴**, Current = `~9,400 (up from ~7,900 in July)`. Add a growth note to the ROADMAP v2.0 section. Rationale: these docs went stale last time by describing intent as status — restating that here would reproduce the exact defect the refresh exists to remove |
| **D7** | The *24k AI-sort smooth end-to-end* milestone's target (July 2026) has **passed** and all four DoD boxes are met, but § 4.3 pre-wrote it 🟡 In Progress | **Mark ✅ Complete, 2026-07-20** (PR #64 + the gating user smoke). Its DoD as written is AI-sort-specific and fully satisfied. The open PR2 (hash/similarity sort off the renderer thread) stays a separate **🔴 KR** under GOALS Objective 1 — it is *not* retro-added to a milestone that never scoped it. Health Summary → 3 complete / 1 in progress |
| **D8** | Both § 4.2 **Now** themes have drained — 24k perf (G1 ✅, only the PR2 slice open) and rating/tournament UX polish (undo, wheel guard, auto-hide, bulk-rate re-pair — all ✅ via #65/#66) | **Promote v2.0 modularization from Next to Now.** Now = *24k perf remainder (PR2 hash-off-thread)* + *v2.0 modularization*. Next = *UI architecture overhaul*. Later unchanged. Rationale: directly answers D6 — the renderer is growing faster than extraction is removing, so modularization is where effort should go, and the board should say where effort **should** go, not where it went |
| **D9** | The G4 spec and plan are **not indexed** in `docs/README.md` — the 8th recurrence of a class already filed for automation (BACKLOG 🟤, "the manual checklist has now failed 7 times") | **Fold the index fix into this branch** (2 link definitions). Rationale: leaving it means the hygiene branch reproduces the defect it exists to correct. Does **not** pre-empt the automation entry, which stays open |

### 9.3 Scope explicitly held out

- **`.claude/rules/` migration** (🟤 [2026-08-27]) — touches `CLAUDE.md` like § 4.4 does, but is a separate M-sized item with its own trial-eval criteria. Folding it in would smuggle unreviewed scope into a docs refresh.
- **§ 7 Out of Scope stands unchanged** — WEEKLY.md's own `~8400` / `434 unit` mentions are not edited; it is a dated plan document, true at write time.
- **§ 5 user-side action still outstanding** — the weekly-planning-prompt line cannot be applied from the repo.

### 9.4 Numeric substitutions for § 4

Every occurrence in § 4 target content is superseded as follows: `434 unit` → **513 unit**; `52 E2E` → **55 E2E**; `~7,900` → **~9,400** (except where D6 requires the "up from ~7,900 in July" comparative); `<DATE>` → **2026-08-27**.
