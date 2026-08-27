# Group G5 — Weekly Reviews (2026-08-27 catch-up run): Run-card

**Date**: 2026-08-27 (catch-up run — the WEEKLY.md slot it closes is the stale **July 13–17** plan's Group G5)
**Branch**: `chore/g5-weekly-reviews`
**Source**: ⚪ Overhead — WEEKLY.md Group G5 (5 SP, exempt from the source-quota denominator).
**Status**: in progress.
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md)
§ *Methodology (canonical — current practice)* — the reusable "how we run Weekly Reviews" spec.
Previous run-card: [`2026-07-05-weekly-reviews-run.md`](2026-07-05-weekly-reviews-run.md).

---

## Why a run-card (not a full spec)

Methodology rule **#6**: a codified-repeat ⚪-overhead task needs only brainstorm → a short run-card →
execute, and the brainstorming design-gate is satisfied by approving the run-card. The reusable
methodology is already written; this note records only what is *specific to this run*.

## What is different about this run

1. **It is a catch-up, not a week.** The last run was **2026-07-05**; today is **2026-08-27** — a
   ~7.5-week gap spanning **four merged PRs (#63, #64, #65, #66)**. Rows are dated `2026-08-27` and
   the category-4 scan window is *since 2026-07-05*, not "this week". No attempt is made to backfill
   the missed weeks as separate runs.
2. **Hybrid sourcing leans fresh.** Every parked *Next-up* item is ≥7 weeks old and three of the four
   were pre-flagged weak when parked (`commit-commands` "marginal", `security-guidance` "low fit",
   Spec Kit "already practiced"). Per methodology rule #5 the fresh check is run anyway and the
   strongest candidate wins; this run expects that to be the fresh one more often than not.
3. **Category 4 is new here — and is imported, not invented.** See below.
4. **WEEKLY.md is 6 weeks stale.** Its G5 boxes are checked off by this run with a dated note that
   the run was actually held 2026-08-27. Its other unshipped group (G4) is **deliberately untouched**
   — out of G5's scope.

## Category 4 — Cross-project propagation

WEEKLY.md introduces a 4th category with one line of definition and no REVIEW-QUEUE.md section,
rubric, or log. It does **not** need designing from scratch: the sibling repo
`claude-code-universal-config` has run an equivalent section **four times** (rows 2026-07-03,
-07-16, -07-21, -07-27) with a settled convention. This run **mirrors that convention with the
direction flipped**, rather than inventing a second dialect of the same idea.

Imported verbatim in shape:

- Verdict vocab `propagate | pass | defer` (not `adopt`), because the candidates are *this repo's own
  shipped learnings*, not external web hits.
- Row format `YYYY-MM-DD — <learning/origin> — verdict: … — note`.
- `propagate` routes to **`TODO.md` § Spawned Tasks** — the outbound analog of `adopt` → 🟤 BACKLOG.
  `pass`/`defer` stay in REVIEW-QUEUE.md.
- **Verify against the target, do not assume.** The sibling repo's standing rule is to grep the
  specific strings in the destination rather than diff trees; the same applies outward from here.

**Decision D1 — the section is bidirectional** (a deliberate widening of WEEKLY.md's outbound-only
wording, recorded here as a deviation). The **outbound** half asks what shipped here since the last
run that belongs elsewhere. The **inbound** half exists because the discovery that prompted it is
concrete: `claude-code-universal-config/docs/planning/TODO.md` § Spawned Tasks already carries
**four rows addressed to media_viewer** that have never reached this repo's planning docs —
`dead-rules-audit`, `/wayfinder`, Jenkins (aimed squarely at this repo's known **no-CI** gap), and a
design-video sub-batch. A one-way channel drops those silently and forever.

**Decision D2 — target scope.** `~/.claude` via `claude-code-universal-config` is the one **confirmed**
standing propagation target. Other projects (`wallpaper_sorter`, `media_compression`, `media_parser`)
are **TBD** — recorded in the section header so future runs need not re-litigate it.

**Decision D3 — `dead-rules-audit` is reviewed as the Plugins / wider-internet pick.** It is a plugin,
and it arrives pre-measured against *this* repo's `CLAUDE.md`. Logging it in the Plugins Reviewed log
keeps the not-yet-reviewed filter honest so no future fresh check re-reviews it; its inbound origin is
noted in the row.

## Categories & starting points

Exclude anything already in a Reviewed log, and tools already in use here (Superpowers, Code Review,
feature-dev, Context7, Playwright MCP).

| # | Category | Parked *Next-up* (stale) | Fresh-check |
|---|----------|--------------------------|-------------|
| 1a | Plugins — official store | `commit-commands` (marginal) · `security-guidance` (low fit) | Best current official-marketplace plugin for this stack |
| 1b | Plugins — wider internet | `playwright-cli-agents` (Electron gap) · Dev Browser (Electron gap) | `dead-rules-audit` in hand (D3); fresh-check for anything stronger |
| 2 | Claude best-practice | `/clear` between tasks (largely practiced) | Top current Anthropic / Claude-Code practice |
| 3 | Non-Claude AI best-practice | GitHub Spec Kit (already practiced) | Top current cross-tool AI-coding practice |
| 4 | Cross-project propagation | — (new section) | Local scan only — **no web** |

**5 verdict rows total** (Plugins yields 2; + 1 Claude-bp + 1 non-Claude-bp + 1 propagation).

## Housekeeping folded into this run

- **`TODO.md` heading alignment** — the heading is `## 🔀 Spawned`, but WEEKLY.md and the imported
  convention both reference **§ Spawned Tasks**. Renamed so the reference resolves.
- **Adopt-hygiene observation (record only, no action).** All three prior `adopt`s are still unchecked
  in BACKLOG: `pr-review-toolkit` (2026-06-26), `typescript-lsp` (2026-07-05), autonomous/visual
  verification (2026-07-05). Adopts are accumulating untried at ~1.5/run with zero burn-down. This is
  logged as an observation because **D4 keeps `adopt` hands-off**; whether to gate new adopts on
  trialling old ones is a planning decision, not this run's call.

## Scope guards (YAGNI)

- Exactly **5 verdict rows** — no more.
- **No installs, no plugin adds, no automation, no project-behavior changes.** An `adopt` files a 🟤
  BACKLOG trial entry and nothing else (D4, unchanged).
- One lightweight research pass per category — **no deep-research harness, no parallel fan-out**
  (methodology rules #1 and #2). Budget ~8–12 web calls total.
- Category 4 is a **local scan** — reading this repo's git log/docs and the sibling repo's planning
  docs. No web calls, and **no edits to the sibling repo** from this branch.
- If a category surfaces nothing worth adopting, record a `pass` with a "no strong candidate" note
  rather than forcing an adopt.
- WEEKLY.md's **G4** (still unshipped) is out of scope and stays untouched.

## Outputs (docs-only, one branch, no PR)

- **REVIEW-QUEUE.md** — new `## 4. Cross-project propagation` section (conventions + inbound/outbound
  logs + Next-up); 5 verdict rows dated `2026-08-27`; each category's *Next-up* refreshed (add
  runners-up, drop anything promoted into a Reviewed log).
- **BACKLOG.md** — one 🟤 Auto-Generated entry per `adopt`, under
  `### [2026-08-27] From: Weekly Reviews (catch-up run)`, in the intake format.
- **TODO.md** — `§ Spawned Tasks` rows for any `propagate`, plus the inbound items surfaced by D1.
- **WEEKLY.md** — check off G5's four boxes, the Thu/Fri schedule lines, and flip the Summary-Table G5
  status, with a dated note that the run was held 2026-08-27.
- **Commit** the doc edits; **push** the branch. **No PR** (per the task brief).

## Verification

Docs/process change — verification is **review of the written rows**, not a test run:

- REVIEW-QUEUE.md: 5 rows present (2 Plugins + 1 + 1 + 1), each dated `2026-08-27`, each with a
  `source:` (categories 1–3) or an origin (category 4), a verdict from the category's vocab, and a
  one-line note. Section 4 exists with its conventions block.
- BACKLOG.md: every `adopt` has a matching 🟤 entry under the dated heading; every non-adopt has
  **no** stray entry.
- TODO.md: `§ Spawned Tasks` renamed and populated; every row names its origin.
- WEEKLY.md: G5 boxes + Thu/Fri lines checked, Summary-Table status flipped, dated note present.
- Claims about the sibling repo are **verified by grep against its files**, not asserted.
- `npm test` / lint unaffected (no code touched); the pre-commit hook runs the unit suite on the docs
  commit regardless and must pass.

---

## Outcome

_(filled in at the end of the run)_
