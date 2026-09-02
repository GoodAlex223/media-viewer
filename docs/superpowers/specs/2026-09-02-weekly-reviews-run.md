# Group G6 — Weekly Reviews (2026-09-02 run): Run-card

**Date**: 2026-09-02 — held **two days ahead** of the WEEKLY.md Friday-Sep-4 slot, matching G3 and G5,
which also shipped early. Verdict rows are dated by the day they were actually written (`2026-09-02`),
per the precedent that a run-card is dated by its run, never by its slot.
**Branch**: `g6-weekly-reviews`, cut from `main` at `915134d`.
**Source**: ⚪ Overhead — WEEKLY.md Group G6 (5 SP, exempt from the source-quota denominator).
Carries **G4's terminal item** (the `dead-rules-audit` scorecard read-out) as well; WEEKLY.md's Friday
slot lists both and notes G4 is docs-only and may share this branch.
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md)
§ _Methodology (canonical — current practice)_.
Previous run-card: [`2026-08-27-weekly-reviews-run.md`](2026-08-27-weekly-reviews-run.md).

---

## Why a run-card (not a full spec)

Methodology rule **#6**: a codified-repeat ⚪-overhead task needs only brainstorm → a short run-card →
execute, and the brainstorming design-gate is satisfied by approving the run-card. This note records
only what is _specific to this run_.

## What is different about this run

1. **The scan window is six days, not seven weeks.** The previous run was **2026-08-27**. For §§1–3
   this means `pass (no new candidate)` is the _expected honest answer_ on a fresh check, not a
   failure of sourcing; for §4 the window is a handful of merges (G1 `66b16af`, G2 `6305a7a`,
   G3 `45a0d9b`, G5 `0d3fed5`, plus the G4 closeout `bf58c01`).
2. **The headline output is two § 5 trial read-outs, not the web reviews.** Both `pending` rows filed
   2026-08-30 came due this week: `dead-rules-audit` (vehicle: the G2 + G3 sessions) and
   autonomous/visual verification (vehicle: G5). This is the first run where § 5 has anything to close.
3. **The `dead-rules-audit` read-out has a measured answer, and it is neither of the two WEEKLY
   anticipated.** See D1 below.
4. **Order is load-bearing** — see D4. This is the first run to operate under § 5's queue cap.

## Decisions

**D1 — `dead-rules-audit` is `drop` as a compliance tool; keep it installed as a relevance heat-map.**

WEEKLY.md's verdict rule guards one failure mode: _"a scorecard reporting zero scored edits is
`inconclusive`, never `keep`"_ — the vehicle having produced no data. That is **not** what happened.
`~/.claude/dead-rules-audit/ledger.json` holds **13 sessions, 6,499 relevance hits, 2,134 judgements,
1,136 "violations"**. The vehicle worked. The _scoring_ does not.

Measured first-hand against this repo's `CLAUDE.md` (32,585 bytes / 211 lines) using the plugin's own
`parseRules` and `judge` exports: `judge()` marks a rule violated when **any** backticked token from
that rule appears in newly-added live code — and `ruleKeywords` does not separate _prescribed_ tokens
from _prohibited_ ones. Rule 36's token set is `loadfolder`, `exittournamentmode`, `tournament`,
`engine` — every one of which the rule instructs you to write. Two snippets that obey their rules
verbatim were both scored as breaches:

```
rule 36 compliant edit → {"relevant":true,"violated":true,"judged":true}
rule 37 compliant edit → {"relevant":true,"violated":true,"judged":true}
```

For prescriptive "do X, never Y" rules — which is how most of this CLAUDE.md's Active-gotchas are
written — the metric is close to **inverted**: complying requires typing the tokens it counts as
violations. That is what the 51–91% violation rates on rules this repo demonstrably follows actually
measure. The defect is in the scoring function, not the vehicle, so re-trialling on another vehicle
would reproduce the same invalid numbers — which is why the outcome is `drop` rather than
`inconclusive`.

Three secondary measurements, recorded because they are cheap and will not be re-derived:

- The parser now reads **42 rules / 13 prohibition-shaped / 12 judgeable**, against G4's 2026-08-30
  figure of 38 / 12 / 11 — `CLAUDE.md` grew from 206 to 211 lines during G2 + G3.
- The ledger holds **43** rules to the current 42: editing `CLAUDE.md` mid-trial orphans rules, because
  entries are keyed by a hash of the rule _text_. A rule's history resets whenever its wording changes.
- Two distinct rules both report `id=35`.

Disposition: leave it installed (Node ≥18, no dependencies, no measurable hook cost) and read **only**
the `relevant` column, as a heat-map of which documented rules the week's work actually touched. The
compliance percentage and the `⚠ promote→hook` flag are not to be used here. No re-trial is filed.

**D2 — the §4 propagation is "a reviewer's negative finding must cite its evidence."**

Both parked outbound items are verified absent at the target. This one goes because it fired again
during this window (the G5 closeout review), its target is global `POLICIES/code-review.md` — the same
file last run's rating-axis propagation reached, so it lands as a sibling clause — and its
prerequisite is narrower: it applies to any review, where the pre-push E2E gate presupposes a project
that has an E2E suite **and** no CI. The E2E gate stays parked in §4 Next-up with its grep evidence
intact. One propagation this run, holding the imported one-per-run cadence.

**D3 — one branch, both groups, and a PR.** `g6-weekly-reviews` carries G4's read-out and all of G6.
Unlike G1/G2/G3/G5 this week, this one opens a PR. Methodology rule **#3** applies at review time: the
branch is docs-only (Prettier already ignores `docs/`/`*.md`), so `/code-review`'s agent fan-out cannot
surface a code finding — pre-check `gh pr view <N> --json files` and post a docs-only acknowledgment
instead of the standard template. Rule **#4** applies at the end: merge it or leave a dated
"merge pending — <reason>" note in WEEKLY.md, in this session. Push happens only on explicit approval
(global CLAUDE.md, _Before Completion_).

**D4 — the § 5 read-outs run first.** § 5's queue cap parks a new `adopt` under its section's _Next-up_
while more than **3** trials are outstanding. Three are outstanding right now (`dead-rules-audit`,
visual verification, `typescript-lsp`). Closing the two due read-outs drops that to **1**, so §§1–3 can
file an `adopt` normally. Run in the other order, a legitimate adopt would be parked by a cap that was
about to lift.

## Categories & starting points

Exclude anything already in a Reviewed log, and tools already in use here (Superpowers, Code Review,
feature-dev, Context7, Playwright MCP, `pr-review-toolkit`, `security-guidance`, `dead-rules-audit`).

| #   | Category                    | Parked _Next-up_                                                                                                                                    | Fresh-check                                       |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1a  | Plugins — official store    | `commit-commands` (marginal) · `plugin-dev`/`agent-sdk-dev` (no need) · output-style plugins (presentation-only)                                     | Best current official-marketplace plugin          |
| 1b  | Plugins — wider internet    | `playwright-cli-agents` (Electron gap) · Dev Browser (Electron gap)                                                                                 | Best current community plugin, six-day window     |
| 2   | Claude best-practice        | `/clear` between tasks (largely practiced) · expertise findings, ~70% human-owned planning                                                           | Top current Anthropic / Claude-Code practice      |
| 3   | Non-Claude AI best-practice | harness **observability** — explicitly gated on `dead-rules-audit` earning its keep (D1 says it did not, in the form trialled) · Spec Kit (practiced) | Top current cross-tool AI-coding practice         |
| 4   | Cross-project propagation   | outbound: reviewer's-negative-finding (D2) · pre-push E2E gate (held) — inbound: `/wayfinder`, Jenkins, design-video sub-batch                       | Local scan only — **no web**                      |

**5 verdict rows total** (Plugins yields 2; + 1 Claude-bp + 1 non-Claude-bp + 1 propagation), plus
**2 § 5 trial-outcome rows**, which are read-outs of existing adopts and not new verdicts.

## Scope guards (YAGNI)

- Exactly **5 verdict rows** in §§1–4 and **2 outcome rows** in § 5 — no more.
- **No installs, no plugin adds, no automation, no project-behavior changes.** An `adopt` files a 🟤
  BACKLOG entry naming its trial vehicle, and nothing else (D4 of the 2026-08-27 run, unchanged).
- One lightweight research pass per category — **no deep-research harness, no parallel fan-out**
  (methodology rules #1 and #2). Budget **8–12 web calls** total.
- §4 is a **local scan** — this repo's git log/docs plus the sibling repo's planning docs at
  `C:\Users\alexm\Projects\claude-code-universal-config`. No web calls, and **no edits to the sibling
  repo** from this branch.
- If a category surfaces nothing worth adopting, record a `pass` with a "no strong candidate" note
  rather than forcing an adopt. With a six-day window this is the likely outcome, not a shortfall.
- Anything the run measures about the _plugin's own source_ stays in the read-out. Filing an upstream
  bug report is out of scope (considered and declined at brainstorm).

## Outputs

- **REVIEW-QUEUE.md** — 5 verdict rows dated `2026-09-02` across §§1–4; **2 outcome rows** in § 5's
  trial log (`dead-rules-audit` → `drop`, visual verification → per the evidence found); each
  category's _Next-up_ refreshed (add runners-up, remove anything promoted into a Reviewed log).
- **BACKLOG.md** — one 🟤 entry per `adopt` under `### [2026-09-02] From: Weekly Reviews`, in the
  intake format; **flip the `dead-rules-audit` trial entry** to its `drop` outcome.
- **TODO.md** — a `§ Spawned Tasks` row for the D2 `propagate`, naming its target file and its
  two-trees nature. Inbound §4 items are filed here **only** if their origin repo's review has landed;
  otherwise they stay parked in §4.
- **WEEKLY.md** — check off G6's five boxes **and G4's `dead-rules-audit` bullet**; check the Friday
  Sep 4 schedule rows; flip both Summary-Table statuses (G4 `2/3 → 3/3`, G6). Status cell names an
  identifier, never a bare `✅`.
- **DONE.md** — the Task-Completion transition entry (run summary, verdicts, run-card link, key
  changes) plus the `**Last Updated**` line, written in-branch at closeout as all three prior runs did.
- **docs/README.md** — index this run-card in the Design Specs table. Now **hook-enforced** by
  `scripts/check-docs-index.js` (shipped in G3, `4b5950b`), so the 2026-08-27 miss cannot recur silently.
- **Commit**; then **push + PR on explicit approval**.

## Verification

Docs/process change — verification is **review of the written rows**, not a test run:

- REVIEW-QUEUE.md: 5 verdict rows dated `2026-09-02` (2 Plugins + 1 + 1 + 1), each with a `source:`
  (§§1–3) or an origin (§4), a verdict from the category's vocab, and a one-line note. § 5 trial log
  carries 2 new outcome rows and **no remaining `pending` row for a vehicle that has already fired**.
- BACKLOG.md: every `adopt` has a matching 🟤 entry **naming its trial vehicle** (§ 5 policy b+);
  every non-adopt has no stray entry; the `dead-rules-audit` entry is flipped.
  `backlog-structure.test.js` green.
- TODO.md: one `§ Spawned Tasks` row for the propagation, naming its target.
- WEEKLY.md: G6's five boxes + G4's bullet + Friday rows checked; both Summary-Table statuses flipped.
- Claims about the sibling repo are **verified by grep against its files**, not asserted.
- Claims about the plugin are **verified by running its own exported functions**, not read off its README.
- `npm test` unaffected (no code touched); the pre-commit hook runs the unit suite on the docs commit
  regardless and must pass, alongside `check-secrets.js` and `check-docs-index.js`.

---

## Outcome (2026-09-02 run)

_Filled in at closeout._
