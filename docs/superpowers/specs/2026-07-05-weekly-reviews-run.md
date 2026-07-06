# Group WR — Weekly Reviews (2026-07-05 run): Run-card

**Date**: 2026-07-05 (run ahead of the WEEKLY.md Thu/Fri slot for the week of July 6–10)
**Branch**: `chore/wr-weekly-reviews`
**Source**: ⚪ Overhead — WEEKLY.md Group WR (4 SP, exempt from the source-quota denominator).
**Status**: Approved (brainstorm) → executing.
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md) — the reusable "how we run Weekly Reviews" spec. This run-card is a lightweight per-week execution note, not a re-derivation of the methodology.

---

## Why a run-card (not a full spec)

The first run (2026-06-26) had a dual payoff: execute the reviews **and** codify the reusable
methodology. The codification is done — it lives in the reference spec above. This week is **pure
execution of a codified process**, so the design surface is thin and this note stays short.

## Fixed parameters (from the methodology reference)

- **Method** — lightweight inline research: ~1–3 `WebSearch` + up to ~2–3 `WebFetch` on primary
  sources per category, in the main thread. **No deep-research harness** (the first run burned ~8M
  tokens and never completed adversarial verification — superseded by the methodology correction).
- **Relevance lens** — hybrid (D1): source the genuinely-best current candidates broadly, but score
  by *"does this help THIS project's solo-dev + Claude-Code + Electron (JS, no bundler, Vitest +
  Playwright) workflow?"*
- **Verdict rubric** — `adopt` (useful now → file a 🟤 BACKLOG trial entry) · `defer`
  (project-relevant but blocked → park under *Next-up* with the blocker) · `pass` (not a fit / not
  better than current → still logged so it is not re-surfaced).
- **`adopt` is hands-off (D4)** — files a BACKLOG trial item; does **not** install anything or change
  project behavior on this branch.

## This week's decisions (brainstorm)

- **Candidate sourcing = hybrid "fresh-check + best pick".** For each category, do a quick fresh
  `WebSearch` **and** consider the parked *Next-up* item, then review whichever is the strongest
  *not-yet-reviewed* candidate. Rationale: the parked plugin picks are pre-flagged weak
  (`commit-commands` "marginal, already done by hand"; `playwright-cli-agents` "Electron-support
  gap"), and it has been ~6 weeks since the queue was seeded, so a rote parked-first pass would
  likely surface nothing adoptable.
- **Process weight = lightweight run-card + execute** (this doc), not a full spec + writing-plans.

## Categories & starting points

Exclude items already in a Reviewed log, and tools already in use here (Superpowers, Code Review,
feature-dev, Context7).

| # | Category | Parked *Next-up* | Fresh-check |
|---|----------|------------------|-------------|
| 1a | Plugins — official store | `commit-commands` (marginal) | Best current official-marketplace Claude Code plugin for this stack |
| 1b | Plugins — wider internet | `playwright-cli-agents` (Electron gap) | Best community plugin, weighting desktop/Electron fit |
| 2 | Claude best-practice | `/clear` between tasks · autonomous e2e verification | Top current Anthropic / Claude-Code practice |
| 3 | Non-Claude AI best-practice | Addy Osmani incremental LLM workflow | Top current cross-tool AI-coding practice |

**4 verdict rows total** (Plugins yields 2; + 1 Claude-bp + 1 non-Claude-bp).

## Outputs (docs-only, one branch, one commit)

- **REVIEW-QUEUE.md** — append 4 verdict rows dated `2026-07-05` with `source:`, verdict, one-line
  note (Plugins gets two: store + wider). Refresh each category's *Next-up* (add reviewed items'
  runners-up; drop any item promoted into the Reviewed log).
- **BACKLOG.md** — one 🟤 Auto-Generated entry per `adopt`, grouped under
  `### [2026-07-05] From: Weekly Reviews (week of July 6)`, following the intake format
  (`- [ ] **Short title** — body with context, source link`).
- **WEEKLY.md** — check off the Group WR boxes (Plugins / Claude-bp / non-Claude-bp), the Thu + Fri
  schedule lines, and flip the Summary-Table WR status `Planned → ✅`.
- **Commit** the doc edits.

---

## Outcome (2026-07-05 run)

**Executed** 2026-07-05 on branch `chore/wr-weekly-reviews` (commits `db09ffd` run-card, `ab74f1c`
verdicts, + closeout). Lightweight inline research — **9 web calls total** (4 `WebSearch` + 5
`WebFetch`), no harness, no rate-limit issues — validating the [2026-06-26] methodology correction
(the first run's harness burned ~8M tokens and never completed verification). 4 verdict rows appended
to REVIEW-QUEUE.md:

| Category | Pick | Verdict |
|----------|------|---------|
| Plugins / official store | `typescript-lsp` (code-intelligence LSP, TS **and** JS) | **adopt** → 🟤 |
| Plugins / wider internet | Electron Developer Agent (rohitg00 persona file) | pass |
| Claude best-practice | autonomous e2e / visual verification before "done" | **adopt** → 🟤 |
| Non-Claude best-practice | Addy Osmani incremental LLM workflow | pass |

**Future improvements (extracted → BACKLOG 🟤 [2026-07-05]):** both adopts are hands-off trial entries
(D4) — the `typescript-lsp` trial (untyped-JS + large-project-memory eval points); the
autonomous/visual verification discipline (possible-dup-of CW-P's E2E-gate item — mechanism vs
discipline).

**Key discoveries:**
- **Hybrid sourcing paid off.** Both parked plugin picks (`commit-commands`, `playwright-cli-agents`)
  were pre-flagged weak; a rote parked-first pass would have surfaced nothing adoptable. Fresh search
  found the two genuinely-useful adopts.
- **`typescript-lsp` covers untyped JS too** (same `typescript-language-server` engine VS Code uses)
  — symbol navigation is fully available; only full type-checking is reduced. So it's a real adopt
  for the ~8400-line renderer, with the untyped/memory caveats as trial-eval notes, not blockers.
- **The "give Claude a check it can run / verify UI visually" best-practice maps directly onto this
  repo's recurring "passes tests but invisible/broken" pain** (the test-actual-visibility incident;
  the "green hook ≠ green E2E" Continue-resume regression) — which is what tipped it to `adopt`.
- **Lightweight inline research is the right tool** for a 4-SP overhead review: ~9 calls, minutes, no
  rate limit. The [2026-06-26] correction holds; a codified-repeat process needs only a run-card, not
  a fresh spec + implementation plan.

## Scope guards (YAGNI)

- Exactly **4 verdict rows** this week — no more.
- **No installs, no automation, no plugin adds, no project-behavior changes.** Adopts become BACKLOG
  trial items (D4).
- One lightweight research pass per category — **no deep-research harness, no parallel fan-out.**
- If a category surfaces nothing worth a verdict, record a `pass` with a "no strong candidate this
  week" note rather than forcing an adopt.

## Verification

Docs/process change — verification is **review of the written rows**, not a test run:

- REVIEW-QUEUE.md: 4 rows present (2 Plugins + 1 + 1), each dated `2026-07-05` with a `source:`, a
  verdict in `{adopt, pass, defer}`, and a one-line note; runners-up parked under *Next-up*.
- BACKLOG.md: every `adopt` has a matching 🟤 entry under the dated heading; every non-adopt has
  **no** stray entry.
- WEEKLY.md: Group WR + Thu/Fri boxes checked, Summary-Table status flipped.
- `npm test` / lint unaffected (no code touched); pre-commit hook runs clean on the docs commit.
