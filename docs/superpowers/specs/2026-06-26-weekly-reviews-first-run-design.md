# Group WR — Weekly Reviews (First Run + Reusable Methodology): Design

**Date**: 2026-06-26
**Branch**: `chore/weekly-reviews-2026-06-26`
**Source**: ⚪ Overhead — WEEKLY.md Group WR (Thu/Fri, 4 SP, exempt from the source-quota denominator). First-ever run of the recurring Weekly Reviews batch; REVIEW-QUEUE.md created this week (2026-06-19) with empty Reviewed logs.
**Status**: Approved (brainstorm) → ready for implementation plan.

---

## Problem / Goal

WEEKLY.md schedules a recurring **Weekly Reviews** batch and REVIEW-QUEUE.md holds its cross-week
state, but the batch has **never been run** — all three Reviewed logs are empty. This is the first
run. It has a dual payoff:

1. **Execute this week's reviews** — pick and review the top not-yet-reviewed candidate in each
   category, record verdicts, file follow-ups.
2. **Codify a reusable methodology** — because this is recurring, the spec itself becomes the
   "how we run Weekly Reviews" reference that every future week reuses (REVIEW-QUEUE.md gets a
   pointer to it).

Per WEEKLY.md this is **process overhead, no code PR** — the deliverables are doc edits
(REVIEW-QUEUE.md + any `adopt` → BACKLOG.md) on a branch, plus the Group WR / Thu-Fri checkboxes.

## Categories (from REVIEW-QUEUE.md / WEEKLY.md Group WR)

| # | Category | Scope | Rows this week |
|---|----------|-------|----------------|
| 1a | Plugins — official store | Best not-yet-reviewed Claude Code plugin in the **official** Claude Code plugin marketplace | 1 |
| 1b | Plugins — wider internet | Best not-yet-reviewed Claude Code plugin **outside** the official store (community marketplaces, awesome-lists, GitHub) | 1 |
| 2 | Claude best-practice | Top not-yet-reviewed practice/technique for Claude / Claude Code / Claude Design / Claude Cowork | 1 |
| 3 | Non-Claude AI best-practice | Same, for AI models/tools **other than** Claude | 1 |

**4 verdict rows total** (Plugins yields 2; + 1 Claude-bp + 1 non-Claude-bp). "Plugin" is locked to **Claude Code plugin** — this
project is developed with Claude Code, so that is the project-relevant reading (confirmed in
brainstorming).

## Decisions (from brainstorming)

- **D1 — Relevance lens: hybrid (general-sourced, project-judged).** Source the genuinely-best
  current candidates broadly, but score `adopt | pass | defer` by *"does this help THIS project's
  solo-dev-with-Claude-Code Electron workflow?"*. Matches REVIEW-QUEUE.md's own wording
  ("current live top hit via web search" sourcing + "on an `adopt`, file a 🟤 BACKLOG entry").
- **D2 — Depth: deep-research harness, run per category.** Invoke the `deep-research` skill once per
  category (4 runs) for fully-cited, adversarially-verified findings, rather than a lightweight skim
  or a single combined pass. (User chose maximum fidelity over the lighter options.)
- **D3 — Recency target: current as of June 2026.** Deep-research fetches live web; the assistant
  training cutoff is Jan 2026, so the live fetch is doing the real work. Every candidate is eligible
  because the Reviewed logs are empty (first run).
- **D4 — `adopt` is hands-off.** An `adopt` files a 🟤 Auto-Generated BACKLOG entry to *trial /
  integrate later* — it does **not** install a plugin or change project behavior in this branch
  (confirmed in brainstorming).

## Verdict rubric (the project-fit lens)

- **adopt** — directly useful to this workflow now → file a 🟤 Auto-Generated BACKLOG entry to
  trial/integrate it. (Hands-off per D4 — the entry is the deliverable, not an install.)
- **defer** — project-relevant but blocked (timing / dependency / needs more eval) → park under the
  category's *Next-up* with the blocker noted; do **not** file a BACKLOG entry yet.
- **pass** — not a fit, or not better than current practice → still logged in the Reviewed log so it
  is not re-surfaced next week.

## Research questions (one deep-research run each)

1. **Plugins / official store** — *"As of June 2026, what is the single best Claude Code plugin in
   the official Claude Code plugin marketplace for a solo developer building an Electron desktop app
   (JS, no bundler, Vitest + Playwright) with Claude Code? Rank the top candidates, recommend one,
   note 2–3 runners-up, cite sources."*
2. **Plugins / wider internet** — same question, scoped to Claude Code plugins hosted **outside** the
   official marketplace (community marketplaces, `awesome-claude-code`-style lists, GitHub).
3. **Claude best-practice** — *"As of June 2026, what is the most valuable practice/workflow technique
   for using Claude / Claude Code / Claude Design / Claude Cowork effectively, especially for solo
   software development? Recommend one, note runners-up, cite sources."*
4. **Non-Claude AI best-practice** — same, for AI models/tools **other than** Claude that would
   benefit a solo developer's workflow.

Each run returns: **top pick + 2–3 runners-up + draft verdict + explicit "fit to this project"
rationale + sources.** The verdict and routing are decided in the synthesis step (main thread), not
delegated to the research run.

## Outputs (all on `chore/weekly-reviews-2026-06-26`)

- **REVIEW-QUEUE.md** — append one verdict row per category to the relevant Reviewed log (date
  `2026-06-26`, with `source:`); Plugins gets **two** rows (store + wider). Park notable runners-up
  under each category's *Next-up*. Add a one-line pointer from the file header to this spec as the
  reusable methodology.
- **BACKLOG.md** — one 🟤 Auto-Generated entry per `adopt`, grouped under
  `### [2026-06-26] From: Weekly Reviews (week of June 22)`, following the project's intake format
  (`- [ ] **Short title** — body with context, source link`).
- **WEEKLY.md** — check off the Group WR boxes (lines ~78–80) and the Thu/Fri schedule lines
  (~137, ~152).
- **Commit** the doc edits on the branch.

## Scope guards (YAGNI)

- Exactly **4 deep-research runs / 4 verdict rows** this week — no more.
- **No tooling, no automation, no plugin installs, no project-behavior changes.** Adopts become
  BACKLOG trial-items (D4).
- The roadmap-refresh conversation (MILESTONES/ROADMAP/GOALS staleness, noted in WEEKLY.md) is
  **out of scope** here — it is a separate user conversation, not a Weekly Review.
- If a category surfaces **nothing** worth a verdict (genuinely no good not-yet-reviewed candidate),
  record a `pass` row with a one-line "no strong candidate this week" note rather than forcing an
  adopt.

## Verification

This is a docs/process change — verification is **review of the written rows**, not a test run:

- REVIEW-QUEUE.md: 4 rows present (2 Plugins + 1 + 1), each dated `2026-06-26` with a `source:`,
  a verdict in `{adopt, pass, defer}`, and a one-line note; runners-up parked under *Next-up*.
- BACKLOG.md: every `adopt` row has a matching 🟤 entry under the dated heading; every non-adopt
  has **no** stray BACKLOG entry.
- WEEKLY.md: Group WR + Thu/Fri boxes checked.
- `npm test` / lint are **not** affected (no code touched) but will run clean via the pre-commit
  hook on the docs commit.

## First-run retro (2026-06-26) — methodology correction for future weeks

D2 (deep-research harness per category) proved **wildly disproportionate** for a 4-SP overhead
review: the four runs burned **~8M tokens** and the adversarial-verification phase **never completed
once** (server-side rate limiting, then the actual session usage limit), so every run self-reported
"inconclusive / all claims refuted (0-0)" despite gathering good raw data. The verdicts ended up
resting on the raw (mostly primary-source) research, and the non-Claude category was finished with a
cheap inline `WebSearch` pass — which is what should have been used throughout.

**Correction for future Weekly Reviews (supersedes D2):** default to **lightweight inline research**
(a few targeted `WebSearch` + 2-3 `WebFetch` per category in the main thread); reserve the
deep-research harness for a rare, explicitly-requested deep dive on a single topic, and if used, run
**one workflow at a time — never fan out multiple harnesses in parallel** (the parallel 80+-agent
burst is what tripped the rate limiter). Tracked in BACKLOG 🟤 [2026-06-26] Weekly Reviews first-run
process follow-ups.
