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

Measured first-hand against this repo's `CLAUDE.md` — **32,957 bytes / 210 lines** by `wc -c` / `wc -l`,
which is deliberately spelled out because a naive probe disagrees: `readFileSync(f, 'utf8').length`
returns **32,585** (UTF-16 code units, not bytes — the file is multi-byte UTF-8) and
`split('\n').length` returns **211** on a 210-line file ending in a newline. An earlier draft of this
run-card carried those two probe outputs mislabelled as bytes and lines; every other figure below came
from the plugin's own functions and was unaffected. Using the plugin's `parseRules` and `judge` exports: `judge()` marks a rule violated when **any** backticked token from
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
  figure of 38 / 12 / 11 — `CLAUDE.md` grew from **206 to 210** lines during G2 + G3. The 206 baseline
  is sound (`git show bf58c01:CLAUDE.md | wc -l` = 206); only the endpoint was wrong, per the unit note above.
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
- **BACKLOG.md** — one 🟤 entry per `adopt` under `### [2026-09-02] From: Weekly Reviews`, **plus any
  defect the run itself surfaces** (the BACKLOG groups by intake _event_, and this run is one), in the
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

**Executed** on branch `g6-weekly-reviews`. **8 web calls** (4 `WebSearch` + 4 `WebFetch`), no harness,
no parallel fan-out — within the 8–12 budget and consistent with the prior runs' 9 and 10. Five verdict
rows and two § 5 trial read-outs, exactly as scoped.

| Category                        | Pick                                                            | Verdict                          |
| ------------------------------- | --------------------------------------------------------------- | -------------------------------- |
| Plugins / official store        | `github` + the whole External-integrations category               | pass                             |
| Plugins / wider internet        | `fracalo/electron-playwright-mcp`                                 | pass                             |
| Claude best-practice            | installed-plugin context-cost & disuse audit                      | **adopt** → 🟤                   |
| Non-Claude best-practice        | loop engineering / evidence-gating (gate half only)               | **adopt** → 🟤                   |
| Cross-project propagation       | "a reviewer's negative finding must cite its evidence"            | **propagate** → § Spawned Tasks  |
| § 5 read-out (G4's terminal)    | `dead-rules-audit`                                                | **drop** (compliance tool)       |
| § 5 read-out                    | autonomous / visual verification                                  | **inconclusive** → re-trial      |

### Key discoveries

- **A trial can produce abundant data and still be worthless.** The read-out rule this run inherited
  guarded one failure — a vehicle that scores nothing. The vehicle scored 2,134 times. What nobody had
  checked was whether the *judge* measures compliance, and it does not: it flags a rule whenever any of
  its backticked tokens appears in added code, prescriptions included. The evidence was in the tool's
  own output the whole time — the rules it nominated for promotion were the ones G2 had just shipped
  and enforced. `dead-rules-audit` was adopted on a **parser** measurement and never a **judge** one.
- **The order of the checklist changed the outcome.** D4 was written as bookkeeping and turned out to
  be load-bearing: § 5's cap had exactly 3 outstanding trials, so running the read-outs first is what
  let §§2–3 file adopts at all. Reversed, two legitimate adopts would have parked behind a cap that
  lifted minutes later.
- **Both adopts came out of the failures, not the web.** The six-day window produced no plugin adopt,
  as predicted. What it produced instead was two picks traceable to what the read-outs measured —
  plugin cost, because this run chose to keep a dud installed on a timing figure rather than a token
  figure; evidence-gating, because a practice with no gate was measurably never performed.
- **The strongest §1b candidate in the section's history was still a `pass`, and the reason mattered.**
  `electron-playwright-mcp` is the first pick ever to clear the standing Electron gap. Checking it
  properly (1★, 15 commits, ISC) against what the repo already owns established that the
  visual-verification failure was **never a tooling problem** — which is what makes §3's adopt a *gate*
  rather than another tool. The negative result did more work than an adopt would have.
- **`propagate` had the same disease as `adopt`, one section over.** Verifying the target for this
  run's propagation also revealed that 2026-08-27's was never applied (`realness`: 0 hits). § 5 exists
  precisely to stop that, and covers adopts only. Recorded on the row, surfaced for planning, not
  fixed unilaterally.
- **Every claim in this run was measured or grepped.** The plugin verdicts come from running its own
  exported `parseRules`/`judge`, not its README. The official roster was re-read first-hand. The
  propagation's absence is 0 hits across two 382-line files, both confirmed to exist so the zero is a
  real absence. The inbound items were re-checked against the sibling repo at `7dbfd15`, not against
  last run's note. G5's lack of visual evidence is `git log --name-only` plus a DONE.md grep.
- **A roundup asserted a nonexistent official plugin for the second consecutive run** ("Frontend
  Design" again, now joined by Semgrep and Chrome DevTools). Promoted from a per-run observation to a
  standing note in §1 Next-up.

### Deviations from the plan, recorded rather than buried

1. **Dated 2026-09-02, not 2026-09-04.** The brainstorm named the run-card `2026-09-04`; it is dated by
   the day it actually ran, following the precedent that a run-card is dated by its run and never by
   its slot. WEEKLY.md's Friday rows are checked with an explicit "held two days early" note.
2. **A pre-existing table defect was fixed in passing.** § 5's `dead-rules-audit` row contained
   `` `Edit|MultiEdit|Write` `` written unescaped into a Markdown cell on 2026-08-30, splitting the row
   into 7 columns so its Note rendered truncated at "MultiEdit". Caught by a column-count check over
   every table in the touched docs, not by reading. Fixed to `` `Edit` / `MultiEdit` / `Write` ``; all
   tables in all six files now validate.
3. **The visual-verification re-trial is filed once and referenced twice.** §3's adopt and § 5's
   re-trial are the same work, so they share a single 🟤 entry rather than double-filing — consistent
   with how the 2026-08-27 run handled `dead-rules-audit` across §1 and §4.
4. **G6's Summary-Table task count was wrong and is corrected 4 → 5** (with the overhead-inclusive
   total 23 → 24). The scorecard read-out was added to G6's checklist after the table was written —
   the exact failure already filed as 🟤 "a WEEKLY cross-reference does not create a line item".
5. **No `pass` row was forced for the parked §2/§3 runners-up.** Both were weighed per rule #5 and lost
   on actionability; they stay parked with a dated note rather than being logged as reviewed, since
   neither was reviewed on its own merits.
6. **A third BACKLOG entry was filed that this run did not plan for**, and this Outcome initially
   failed to say so — the same late-sweep failure the PR review caught in DONE.md, present here too and
   not flagged by it. The closeout's own relative-link check found **broken links in DONE.md's pre-June
   2026 entries**, most of them off by one directory level. Filed rather than fixed (out of scope for an
   overhead batch), which took the section from 2 items to 3; the Outputs list above now states the rule
   — adopts _plus_ whatever the run itself surfaces — rather than assuming adopts are the only source.
7. **Round 1 of the PR review: every finding was a stale-or-unverifiable claim in a live doc**, plus
   the sub-threshold note (counts omitted — the review rounds continued past this entry). Detailed in the PR's consolidated response comment. The one worth carrying: the
   `CLAUDE.md` size in D1 was wrong because the probe's **labels** were wrong, not its arithmetic —
   `readFileSync(f,'utf8').length` is UTF-16 code units, not bytes, and `split` on newlines overcounts a
   trailing-newline file by one. Every figure that came from the plugin's own functions verified exactly.
8. **A second review round caught one follow-on that the first round's fix missed — and the miss was in
   the _verification_, not the edit.** The `206 → 211` growth figure was corrected in this run-card but
   not in REVIEW-QUEUE.md, and the sweep that was supposed to catch that searched the prose spelling
   `206 to 211` while the surviving occurrence used a Unicode arrow, `206 → 211`. The grep returned 0
   against text it could never have matched, which is indistinguishable from a clean sweep. This is the
   `critical-thinking.md` Phase-4 failure in its purest form — **a check that cannot fail looks exactly
   like one that passes** — and it is the second time this session that a zero was mistaken for
   evidence. The replacement sweep searches the **numbers** (`/206\s*(?:→|->|to|–|—)\s*211/`, `211` near
   a unit word, `32,585` near "bytes") across all 131 markdown files under `docs/`, and carries a
   **positive control** — a second, deliberately different pattern
   (`/yields 211|returns \*\*211\*\*|endpoint as 211/`) matched over the same scope, asserted to return
   **greater than zero** — so a dead sweep reports itself instead of reporting success. The control
   asserts a **property, not a count**: an expected-count is calibrated against prose that any later
   edit changes, so it fails on a correct tree and becomes one more dead check of the kind this
   deviation exists to retire. For reproduction, the two figures at `8858339` were: the control pattern
   **3** (`REVIEW-QUEUE.md` ×2, this file ×1) and the `206…211` sweep pattern **5** (`DONE.md` ×2, this
   file ×3) — different patterns over the same tree, which is why an earlier draft of this paragraph
   read "three" immediately after naming the other pattern and invited exactly the units confusion the
   § 5 cell three sections up now exists to document.
9. **Round 3 found the derived-count failure a fourth time — inside the entry the round-1 fix filed —
   and the number was wrong.** The broken-links BACKLOG entry claimed **27** links across "March–May
   2026" entries, "every one off by exactly one directory level". Re-measured with a resolver:
   **26** broken, of which **25** are fixed by `../../` → `../` and **one is not** — `DONE.md:1299`
   targets `../superpowers/plans/…`, a directory that does not exist (the file lives under
   `archive/plans/`), so no change of _level_ fixes it. Provenance of the 27: the original sweep
   reported 29 hits across three files — `BACKLOG.md` 2 (false positives matched inside prose),
   `TODO.md` 1 (an intentional out-of-tree reference), `DONE.md` 26 — and subtracting only the two
   false positives gave 27, silently absorbing TODO.md's one into DONE.md's total. **One correction to
   the review**, verified: it placed the odd link in the `2026-05-21` entry and concluded that the
   body's narrower range made "every one" hold. `DONE.md:1299` actually sits inside
   `[2026-05-14] Group B` (heading at 1296, next heading at 1314), which the body's range explicitly
   includes — so "every one" was false under **both** readings, and the body's count is 26, not 25.
   The entry now carries **no count and no date range**, names the odd link explicitly, and warns that
   a blanket `sed` followed by a `../../` re-check yields a false clean. That trap, not the arithmetic,
   is the finding that mattered: it would have closed the item with a broken link still in the file
   and nothing tracking it.
