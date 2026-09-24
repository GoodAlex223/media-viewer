# Group G5 — Weekly Reviews (2026-09-24 run): Run-card

**Date**: 2026-09-24 (Thursday) — held **13 days after** its WEEKLY.md Friday-Sep-11 slot, as the Sep 7–11
plan's last open group. Verdict rows are dated `2026-09-24`, per the precedent that a run-card is dated by
its run, never by its slot.
**Branch**: `g5-weekly-reviews`, cut from `main` at `794b146` (equal to `origin/main` at cut time).
**Source**: ⚪ Overhead — WEEKLY.md Group G5 (5 SP, exempt from the source-quota denominator).
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md)
§ _Methodology (canonical — current practice)_.
Previous run-card: [`2026-09-02-weekly-reviews-run.md`](2026-09-02-weekly-reviews-run.md).

---

## Why a run-card (not a full spec)

Methodology rule **#6**: a codified-repeat ⚪-overhead task needs only brainstorm → a short run-card →
execute, and the brainstorming design-gate is satisfied by approving the run-card. The brainstorm was
held with the user in-session on 2026-09-24 and produced three rulings, recorded in D1, D3 and D4. This
note records only what is _specific to this run_.

## What is different about this run

Every figure below names the probe that produced it; none is carried forward from an earlier run.

1. **The window is 22 days, not the "≈9" WEEKLY.md predicted.** The previous run was 2026-09-02. The
   Sep 7–11 plan delivered through 2026-09-21 — G1 `bfcc881` and G4 `7df03b8` on 09-12, G2 `f874f93` on
   09-13, G3 `4b650aa` on 09-21 (`git log -1 --format=%cs <sha>`). Today sits inside the Cleanup Week #4
   slot (Sep 21–25) that WEEKLY.md recommended and the user confirmed on 2026-09-03, and no plan for that
   week exists yet. For §§1–3 this means `pass (no new candidate)` is **no longer the presumptive honest
   answer** it was on the last run's six-day window.
2. **The § 5 audit's subject is far larger than its BACKLOG entry says.** The entry (filed 2026-09-02)
   names nine plugins. `claude plugin list --json` (Claude Code 2.1.263), run from this repo, shows that
   a media_viewer session now also loads **eight plugins synced from the user's claude.ai account**
   (marketplace `knowledge-work-plugins`, scope `synced`, all `enabled: true`): `sales`,
   `small-business`, `legal`, `finance`, `enterprise-search`, `desktop-commander`, `postiz`,
   `pdf-viewer`. `claude plugin details sales@synced` reports 36 skills plus 23 MCP servers and
   **~4,397 always-on tokens added to every session** — before its MCP tool schemas, which the tool
   states are "resolved at runtime; not counted". Claude Code's own per-skill usage record
   (`skillUsage` in `~/.claude.json`, global across projects) shows **zero invocations of any skill from
   any of the eight, ever**; it does not count MCP tool calls. The loaded set also includes three
   user-scope plugins the 09-02 list omitted (`claude-code-setup`, `claude-md-management`,
   `playground`) and two project-level enables that load nothing: `chrome-devtools-mcp` in
   `.claude/settings.json` (installed only for `rating_bot`; none of its tools is present in this
   session) and `auto-memory@severity1-marketplace` in `.claude/settings.local.json` (its marketplace is
   absent from `known_marketplaces.json`). The cost column needs no UI: `claude plugin details <name>`
   prints Claude Code's own "Projected token cost". The `/plugin` Installed tab remains the only source
   for plugin-level **Not used recently**, which also counts MCP and LSP use.
3. **Two recorded §1 claims are false.** REVIEW-QUEUE §1 states — in the 2026-08-27 sourcing note, and
   again in the 2026-09-02 `github` row and the standing sourcing note it promoted — that secondary
   roundups asserted **nonexistent** official plugins: "Frontend Design", then Semgrep and Chrome
   DevTools. All three are in the official catalog. The local copy of `anthropics/claude-plugins-official`
   (`~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`) lists
   `frontend-design` (author: Anthropic), `semgrep` and `chrome-devtools-mcp` — and so does the **Aug 29
   snapshot** of the same file (`claude-plugins-official.bak/`), which predates the 09-02 run.
   Independently, `~/.claude/plugins/installed_plugins.json` records `frontend-design` installed from
   `claude-plugins-official` on 2026-05-06 and `chrome-devtools-mcp` on 2026-05-27 — on this machine,
   months before either run called them nonexistent. Both runs checked the docs page
   (`code.claude.com/docs/en/discover-plugins`), which shows categories and examples, not the catalog, so
   absence from it was never evidence of absence. The catalog lists **311** plugins today against **291**
   in the Aug 29 snapshot: 20 added, none removed.
4. **§4 outbound stands at 3 filed / 0 applied — re-measured, not carried.** `grep -c` over both trees
   (live `~/.claude`, and `claude-code-universal-config/home-claude` at that repo's HEAD `af49962`: its
   `home-claude/` tree had no uncommitted changes, and `git show af49962:<file> | grep -c` gives the same
   zeros — HEAD and that evidence added in PR #72's review): `realness` 0 / 0 and the
   negative-finding phrases 0 / 0 in `POLICIES/code-review.md` (382 lines in each tree); `closeout
   artifacts` / `live-surface` 0 / 0 in `TEMPLATES/plan.md` (225 lines in each tree). Neither target file
   has been modified since the rows were filed. A first keyword pass over `CLAUDE.md`, `WORKFLOW.md`,
   `POLICIES/`, `rules/` and `TEMPLATES/` in both trees finds none of this window's candidate lessons;
   its only hits — `junction` in a database-docs template, `hypothesis` in the bug-report template — are
   false positives.
5. **§4 inbound: 11 sibling rows now address media_viewer, not 3.** `grep -n -i "media.viewer"` over
   the sibling's `docs/planning/TODO.md` at HEAD `af49962`, dated with `git blame`: 07-27 ×1
   (`dead-rules-audit`, consumed here 2026-08-27), 08-24 ×3 (the three parked here), 08-30 ×2
   (path-scoped rules; the `github` MCP credential form), 09-04 ×1 (`dead-end-registry`), 09-10 ×3
   (Firecrawl, `mattpocock/skills`, indiehackers.com), 09-12 ×1 (the quarterly `CLAUDE.md` audit,
   per-project half). **The 09-02 run missed both 08-30 rows**: its inbound row re-checked only the items
   this repo had parked, rather than sweeping the section. Four rows are past their origin's review
   (shipped there, or with a verdict logged there) and are actionable under the inbound rule; six still
   await it — the parked three, now on their third consecutive unchanged check, plus Firecrawl,
   `mattpocock/skills` (a declared superset of `/wayfinder`) and indiehackers.com.

## Decisions

**D1 — § 5 read-out first** (the D4 ordering precedent from 2026-09-02).

- **Inventory**: every plugin that loads in a media_viewer session — user scope, this repo's
  project/local scope, and claude.ai-synced. Plugins installed only for other projects are counted, not
  tabulated.
- **Columns**: always-on tokens (`claude plugin details`), last skill use (`skillUsage`), **Not used
  recently** (the `/plugin` Installed tab), disposition.
- **Positive control**: the user reads one plugin's Context cost in `/plugin` to confirm it matches the
  CLI figure. If that is not done, the table is labelled "CLI estimator, not cross-checked against the tab".
- **Dispositions**: the eight synced plugins are **disabled at user scope** — user ruling 2026-09-24,
  "claude.ai/Cowork only" — executed only after the docs confirm that a Claude Code disable does not reach
  claude.ai. Every other disposition, including the revisit of `dead-rules-audit`'s keep-installed call
  (owed by the 09-02 adopt if its cost is real) and the two dangling enables, is proposed per row and
  executed only on the user's per-row OK.
- **Queue effect**: closing this trial row takes outstanding trials from 3 to 2 (`typescript-lsp`;
  evidence-gating), so this run may file **at most one** new trial `adopt` — a second would take the
  queue past the cap of 3 and parks in its section's Next-up.

**D2 — § 1 correction; §1a sourced from the catalog.** The frozen 2026-08-27 and 2026-09-02 rows stay
untouched and get a dated correction appended beside them in Next-up. The standing sourcing note in §1
Next-up is a live list, so it is **rewritten**, not annotated. §1's instruction line gains the rule the
correction implies: the roster is the catalog (`marketplace.json`, or
`claude plugin list --json --available`), and the docs page is an index of examples. §1a is sourced from
the catalog diff — the 20 plugins added since the Aug 29 snapshot — before the rest of the catalog.

**D3 — § 4 outbound: apply the three pending rows and propagate one new lesson, live-first.** User ruling
2026-09-24.

- All four edits go to **live `~/.claude` only**. There are no sibling-repo edits from this branch; the
  sibling's one-way sync carries them, and its drift detector will report them as live-ahead until it
  does. The exact diffs are shown to the user **before any write**.
- **New propagation**: _a closeout checks off every BACKLOG/TODO entry the task closed, in the same
  commit_ → `~/.claude/rules/planning-closeout.md` § Task Completion step 3, which today checks off only
  the WEEKLY group. Evidence: the PR #65 closeout miss (G2 shipped four of the five `### [2026-07-21]`
  entries and its closeout flipped none — four, as G4's housekeeping item corrected the planning note; the
  fifth, the CLAUDE.md line-191 split, was never performed), and G1's three task boxes flipped by G4
  rather than by G1's own closeout. _(Corrected in PR #72's review: this line first said "five", copied
  from a WEEKLY Notes line that G4's correction had never been swept back to.)_ Absence is re-verified with a wider pattern set and a positive
  control before promotion.
- **Parked, with fresh grep evidence**: the Windows-junction / `git worktree remove --force` hazard
  (G2 — it deleted 1.3 GB of the real checkout); and "a BACKLOG entry's stated mechanism is a hypothesis
  to re-measure".
- **Convention**: the outcome-row rule enters § 4 Conventions (user ruling 2026-09-03, WEEKLY open
  question 3: "extend § 5"), backed by an **outbound outcome log** in § 4 — one row per propagation,
  outcome `applied | unapplied | dropped`, with the post-edit grep as its evidence — covering all four.

**D4 — § 4 inbound: all 11 rows.** User ruling 2026-09-24: rule per item.

- **The four past their origin's review are actioned.** Path-scoped rules → already covered by 🟤
  `[2026-08-27]`, which is annotated with the sibling's reference implementation rather than
  duplicated. The quarterly `CLAUDE.md` audit → already covered by 🟡 `[2026-09-21]`, annotated with the
  runbook pointer. The `github` MCP credential form → checked against `.mcp.json` by server **names** and
  credential **shape** only, never values; the Context7 key stays under the user's 2026-06-16 LEAVE
  ruling. `dead-end-registry` → considered as the §1b candidate, and because it shares an author and a
  marketplace with `dead-rules-audit` — whose _judge_ failed after its _parser_ had been validated — its
  judge is validated, not just its parser.
- **The six awaiting their origin** are assessed per item against media_viewer (local knowledge, no web),
  each with a recommendation of drop / keep parked / import as 🔵, and the user rules on each.
- **Method fix**, recorded in § 4 Conventions: the inbound sweep greps the sibling's whole § Spawned
  Tasks for `media.viewer`, not only the items parked here.

**D5 — Window and spillover.** WEEKLY.md gets a `**Spillover**` line (header week Sep 7–11, delivered
through 2026-09-24) and a one-line note that Cleanup Week #4 (Sep 21–25) is due and unplanned. Noted,
not planned — planning that week is its own session.

**D6 — One docs-only branch and a PR**, as G1–G4 and the previous run used. Methodology rules **#3**
(docs-only handling at review time) and **#4** (merge or dated defer, in-session) apply. Push and PR only
on explicit approval. The out-of-repo changes — plugin config and live `~/.claude` — are recorded in this
run-card's Outcome, because no diff in the PR can carry them.

## Run order

§ 5 → §§1–3 → § 4 (sweep, then the combined checkpoint) → docs → commit → PR. D1's ordering is
load-bearing: §§1–3 must meet the lifted cap, not a full one.

## Categories & starting points

Excluded from every category: anything already in a Reviewed log, and every plugin the § 5 table shows
as already installed here.

| #   | Category                    | Parked _Next-up_                                                                                          | Fresh-check                                                                                     |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1a  | Plugins — official catalog  | `commit-commands` (marginal) · `plugin-dev` / `agent-sdk-dev` (no need) · output-style plugins             | The 20 catalog additions since the Aug 29 snapshot, then the rest of the catalog                |
| 1b  | Plugins — wider internet    | `playwright-cli-agents` · Dev Browser (both the Electron gap) · TestDino skill pack                        | Inbound `dead-end-registry` (D4) against the live top hit of a 22-day window                    |
| 2   | Claude best-practice        | `/clear` between tasks (practiced) · ~70% human-owned planning (validation) · one feature at a time       | Top current Anthropic / Claude Code practice — if the fresh check wins a **4th** consecutive run, drop the non-candidates from Next-up |
| 3   | Non-Claude AI best-practice | harness observability (parked with a measured reason) · Spec Kit (practiced)                              | Top current cross-tool AI-coding practice                                                       |
| 4   | Cross-project propagation   | outbound: D3 · inbound: D4                                                                                | Local only — **no web**                                                                          |

## Scope guards (YAGNI)

- **Exactly** four verdict rows in §§1–3 (1a, 1b, 2, 3); one outbound row and one inbound row in § 4,
  plus the outbound outcome log; one § 5 read-out (the table and the trial row's outcome).
- **At most one** new trial `adopt` (D1). An `adopt` files a 🟤 entry naming its trial vehicle and
  installs nothing.
- **Web**: 8–12 calls, lightweight inline research, no deep-research harness, no parallel fan-out
  (methodology rules #1–#2). § 4 and § 5 are local only.
- **No installs.** The only configuration changes are the § 5 disables and removals and the four live
  `~/.claude` propagations, each approved before it runs. **No sibling-repo edits.**
- **Frozen Reviewed-log rows are never rewritten**; corrections are appended and dated.
- A category with nothing worth adopting gets a `pass` with a "no strong candidate" note, never a forced
  `adopt`.
- **`CLAUDE.md` is untouched** — its audit belongs to 🟡 `[2026-09-21]`, a Cleanup Week #4 item.
- **No token figure is derived from file sizes.** Every cost comes from `claude plugin details` or from
  the tab.

## Checkpoints (user-in-the-loop)

1. **After the § 5 table**: rulings on the non-synced rows, and the `/plugin` spot-check. The synced
   eight are already ruled; they are disabled once the docs check passes.
2. **After §§1–3 and the § 4 sweep**: rulings on the six inbound items, and approval of the four
   `~/.claude` diffs before any write.

## Outputs

**In-repo**

- **REVIEW-QUEUE.md** — § 5: the context-cost table, the audit trial row's outcome, and a stocktake update
  (outstanding trials 3 → 2). §§1–3: four verdict rows dated `2026-09-24`, each category's Next-up
  refreshed, the D2 correction appended, the §1 standing sourcing note rewritten, and §1's instruction
  line naming the catalog as the roster. § 4: one outbound row plus the outbound outcome log covering all
  four propagations; one inbound row with a per-item status for all 11; and two Conventions lines — the
  outcome-row rule and the whole-section inbound sweep.
- **BACKLOG.md** — check off the context-cost audit entry with the § 5 table as its evidence; a new
  `### [2026-09-24] From: Weekly Reviews (2026-09-24 run)` section, with **no** `(N items)` count per the
  derived-count convention, holding the trial `adopt` (if any) **plus any defect the run itself
  surfaces**; annotate 🟤 `[2026-08-27]` (path-scoped rules) and 🟡 `[2026-09-21]` (`CLAUDE.md` audit)
  with their inbound cross-references; a 🔵 entry for each inbound item the user rules "import".
- **TODO.md** § Spawned Tasks — the three rows checked off with post-edit grep evidence; the new
  propagation's row added, already checked.
- **WEEKLY.md** — G5's five boxes and its Friday schedule row; the Spillover line and the Cleanup Week #4
  note; the Summary-Table row reads `◐ Branch complete, unmerged` in-branch and becomes `✅ PR #N` in the
  first commit on `main` after the merge (the G1 precedent — a GitHub merge commit is created
  server-side, so no doc edit can be inside it).
- **DONE.md** — the transition entry and the `Last Updated` line.
- **docs/README.md** — this run-card indexed in the Design Specs table (hook-enforced by
  `scripts/check-docs-index.js`).
- **This run-card** — an appended **Outcome** section, including the out-of-repo change log.

**Out-of-repo** (each approved before it runs; all recorded in the Outcome)

- **Plugin configuration**: the eight synced plugins disabled at user scope (the exact mechanism verified
  at run time against the docs and `claude plugin disable`'s behaviour); the other § 5 dispositions per
  the user's rulings.
- **Live `~/.claude`**: `POLICIES/code-review.md` (the realness clause and the negative-finding clause),
  `TEMPLATES/plan.md` (the Closeout-artifacts block and the live-surface preflight step),
  `rules/planning-closeout.md` (the step-3 clause).

## Verification

Docs and configuration only — verification is **evidence for each written claim**, not a test run.

- Every figure in the table and the rows names its probe. Every grep sweep carries a **positive
  control** — a pattern asserted to match at least once over the same scope — because a sweep that cannot
  match returns a clean-looking 0 (2026-09-02 run-card, deviation 8).
- **§ 5**: `claude plugin list --json` after the disables shows `enabled: false` for each disabled
  plugin, and the settings file that changed is named.
- **§ 4**: post-edit `grep -c` in live `~/.claude` returns > 0 for each propagation's key phrase. The
  sibling tree's 0 is expected under live-first and is recorded as "applied live, sync pending".
- Claims about the sibling repo are verified by grep against its files at a named HEAD. Claims about a
  plugin are verified by Claude Code's own CLI output or by the plugin's own source, never its README.
- A **column-count check** over every Markdown table in each touched doc (the 2026-09-02 pipe-in-cell
  incidents).
- The pre-commit hook passes (`check-secrets.js`, `check-docs-index.js`, the unit suite), and
  `backlog-structure.test.js` passes.

---

## Outcome (2026-09-24 run)

**Executed** on branch `g5-weekly-reviews` the same day. **8 web calls** (5 `WebFetch`, 3 `WebSearch`) —
within the 8–12 budget, no harness, no fan-out. Both checkpoints ran — but checkpoint 1 never asked for
the `/plugin` reading it was planned to include (deviations 2 and 9).

| Category                          | Pick                                             | Verdict                             |
| --------------------------------- | ------------------------------------------------ | ----------------------------------- |
| § 5 read-out                      | installed-plugin context cost & disuse           | **keep** — acted on                 |
| Plugins / official catalog        | `claude-security` (Anthropic)                    | **adopt** (trial) → 🟤              |
| Plugins / wider internet          | `dead-end-registry` (arrived inbound)            | pass — measured                     |
| Claude best-practice              | version the project's `.claude/settings.json`    | **adopt** (known shape) → 🟤        |
| Non-Claude best-practice          | sandbox-by-default agent execution               | pass                                |
| Cross-project, outbound           | a closeout checks off every entry it closed      | **propagate** — applied live        |
| Cross-project, inbound            | every sibling row naming this repo               | ruled per item by the user          |

### Out-of-repo change log

Recorded here because no PR diff can carry these changes. Each was approved by the user before it ran, and
each file was backed up to the session scratchpad first (the backups are not committed). The sibling repo
was not edited.

| Approved at        | Where                                   | Change                                                                                              | Evidence                                                              |
| ------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Brainstorm ruling  | `~/.claude/settings.json`               | eight `"<name>@synced": false` entries                                                               | text diff: exactly those eight lines added; CLI shows 0 of 8 enabled  |
| Checkpoint 1       | `.claude/settings.json` (gitignored)    | `pr-review-toolkit` set false; the `chrome-devtools-mcp` enable removed                             | diff against the backup; valid JSON                                   |
| Checkpoint 1       | `.claude/settings.local.json` (ignored) | `hookify` and the `context7` plugin set false; the `auto-memory` enable, and `memory` + `github` in `enabledMcpjsonServers`, removed | diff against the backup; valid JSON                                   |
| Checkpoint 1       | plugin install records                  | `dead-rules-audit` uninstalled at project scope (from a lowercase-drive cwd)                        | CLI success; no longer listed; its `enabledPlugins` entry removed     |
| Checkpoint 2       | `~/.claude/POLICIES/code-review.md`     | *Deciding What to Report* subsection; *Claude's Role* item 8                                        | diff: insertions only                                                 |
| Checkpoint 2       | `~/.claude/TEMPLATES/plan.md`           | live-surface preflight; § 9 Closeout Artifacts; version 1.0 → 1.1                                   | diff: insertions plus the replaced version footer                     |
| Checkpoint 2       | `~/.claude/rules/planning-closeout.md`  | the step-3 clause                                                                                   | diff: one line changed                                                |
| Checkpoint 2       | `~/.claude/WORKFLOW.md`                 | § Phase 5 paragraph and a 5.2 checklist line                                                        | diff: insertions only                                                 |

### Key discoveries

- **The audit's real subject was invisible from inside the repo.** Plugins synced from claude.ai arrive
  with no install record in this tree or in `installed_plugins.json`; only `claude plugin list --json`
  showed them. They cost more per session than every other plugin combined, and nothing had ever used them.
- **The hardest defects to see were in the one config file nobody reviews.** Both hooks in the
  unversioned `.claude/settings.json` are broken, and the only enforcement of the preload review rule has
  never fired. That is §2's adopt, argued by measurement rather than by the tip that suggested it.
- **A negative finding rested on a source that could not contain the positive.** Two runs called real
  official plugins nonexistent because the page they checked lists examples, not the catalog — including
  the run that propagated "a negative finding must cite its evidence".
- **A probe that cannot discriminate confirmed the wrong mechanism.** At the repo root, "the hook formats
  this file" and "the hook formats the whole directory" look identical. The subdirectory incident exposed
  the difference, an isolated test confirmed it, and the conclusion was reversed before it reached a doc.
- **The zero-application problem was a decision problem, not a capacity one.** Once the user ruled
  "apply", the whole propagation backlog took minutes.

### Deviations from this run-card, recorded rather than buried

1. **A fourth `~/.claude` target.** D3 named three files; `WORKFLOW.md` § Phase 5 was added as the second
   live description of the same step 3, so the two would not diverge. Approved at checkpoint 2.
2. **The `/plugin` tab cross-check was not performed.** As D1 required, the table says so rather than
   implying a check that did not happen.
3. **`dead-end-registry` was measured over whole transcripts** — the union of what its Stop-time hook
   would mine across a session — so its counts are an upper bound. The row states it.
4. **An unplanned incident and a retracted hypothesis.** The project's Prettier hook reformatted seven
   planning docs mid-run while the shell's cwd was `docs/planning`; all seven were restored from `HEAD`
   — formatter output only, **reproduced exactly** in PR #72's review: re-running Prettier from
   `docs/planning` on the `89393be` versions of the six untouched files gives the identical diffstat
   (107 insertions, 105 deletions); the incident-time check had only sampled `git diff -w`. An intermediate conclusion — that the runtime sets
   `$CLAUDE_FILE_PATH` — was refuted by a discriminating test before any doc carried it; the corrected
   mechanism, and the refutation itself, are recorded in REVIEW-QUEUE §2 so it is not re-derived.
5. **The sibling repo was mid-edit** by a parallel session during the inbound sweep; the committed state at
   `af49962` is what is cited, and the rows naming this repo matched in both states — the same 11,
   compared on their first 120 characters, all `status: pending`.
6. **Two WEEKLY.md premises were corrected on the page**: the G5 header's "≈9 days" window and its
   dependence on the Installed tab, plus the Plugins box's parenthetical about "nonexistent" plugins.
7. **BACKLOG received more than the adopt entries**, as the Outputs list allowed ("plus any defect the run
   itself surfaces"): the two hook defects, the path-casing split and the connectors/skills audit extension.
8. **The `claude-security` adopt was first written from the plugin's README**, against this run-card's own
   Verification rule ("never its README"), even though the plugin's source sat in the same local clone.
   Caught in PR #72's review. Every claim was then re-verified against source — `agents/scan-verifier.md`,
   `scripts/lib/finding.py`, `workflows/scan.js`, `skills/claude-security/jobs/`,
   `scripts/render_report.py`, `scripts/patch_artifacts.py`, `hooks/hooks.py` — and every one held, so the verdict stands and only the
   citations changed (REVIEW-QUEUE §1a, BACKLOG).
9. **D1's "Not used recently" column was never captured, and the § 5 table first dropped it silently.** Only
   the `/plugin` Installed tab shows it; checkpoint 1 was planned to ask the user for that reading and did
   not. The table went out without the column, the WEEKLY § 5 box was checked for a table that
   records it, and the new Recurring read-out policy named that table as the format — so the omission would
   have propagated. Caught in PR #72's review and corrected in all three places: the table now carries the
   column (`not read` for the twelve non-synced rows, and `n/a` by design for the eight synced ones, which
   the docs say are never listed there), the WEEKLY box says what was not delivered, and the policy names the
   reading as the one step that needs the user.
