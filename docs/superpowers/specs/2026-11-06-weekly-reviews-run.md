# Group G6 — Weekly Reviews (2026-11-06 run): Run-card

**Date**: 2026-11-06 (Friday). The Oct 26–30 week's G6 (Cleanup Week #5), six days past its Sunday Nov 1 slot
(WEEKLY.md Spillover line). Verdict rows are dated `2026-11-06`.
**Branch**: `g6-weekly-reviews`, cut from `main` at `e1f017c` (G5 closeout; equal to `origin/main` after a fetch),
in the worktree `.claude/worktrees/g6-weekly-reviews`.
**Source**: ⚪ Overhead — WEEKLY.md Group G6 (5 SP, exempt from the source-quota denominator).
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md)
§ _Methodology (canonical — current practice)_.
Previous run-card: [`2026-10-27-weekly-reviews-run.md`](2026-10-27-weekly-reviews-run.md).

---

## Why a run-card (not a full spec)

Methodology rule **#6**: the method is codified, so this run is brainstorm → this card → execute, and approving the
card opens the run. There is no separate `writing-plans` cycle. Unlike the last run, the user took the brainstorm
questions, so this card is written **before** the measurements and its decisions are the user's approved answers.

## What is different about this run

Every figure names its probe; none is carried forward from an earlier run.

1. **Window: ~10 days**, from PR #92's merge (`c5ac35f`, 2026-10-27 09:57 +0200). WEEKLY G6's "≈ 5 days" assumed a
   Nov 1 run. Merged inside it (`git log --merges --first-parent main --since=2026-10-27T12:00`): PR #93 G1
   `4894a13`, #94 G2 `a80cc37`, #95 G3 `b9c76c0`, #96 `fix/remove-reload-roles` `59218f3` (no WEEKLY group), #97 G4
   `9a8ffb9`, #98 G5 `1cfbcd4`.
2. **The host**, named as REVIEW-QUEUE §2's convention asks: this session runs the terminal CLI
   (`CLAUDE_CODE_ENTRYPOINT=cli`), which reports **2.1.316** (`claude --version`). The VS Code extension's binary
   (`anthropic.claude-code-2.1.318-win32-x64/resources/native-binary/claude.exe --version`) reports **2.1.318**.
3. **No trial is outstanding** (§ 5 stocktake 2026-10-27: 2 → 0), so there is no trial read-out. The cap (3) leaves
   room for a new trial `adopt`.
4. **The hand-off channel works; the 10-27 card measured the wrong thing.** That card's key discovery 2 called the
   channel "stalled" because the fixes were still absent from live `~/.claude`. The user confirmed (brainstorm,
   2026-11-06) that the sibling files each item into its own TODO or BACKLOG as future work. At sibling `main`
   `59ffd0d` (2026-11-02), all three re-sent items are open 🟠 rows in its `docs/planning/TODO.md`: the size-trigger
   exception (`:258`, re-send noted `:275`), the rule-loss check (`:277`, re-send noted `:289`) and the proposed-fix
   rule (`:337`). Its Context7 row reads media_viewer `applied-out-of-tree (2026-10-27)` (`:1066`). _These line
   numbers came from a Grep of the sibling's checkout (on `main`), which may be dirty; the run re-reads them from
   the committed file (D5a) before any is cited._
5. **§ 4 inbound has new material**: `grep -c -i "media.viewer"` over the sibling's `TODO.md` at `main` gives **48**
   (`59ffd0d`), against 36 at `227a337` in the 10-27 card. These are lines, not rows. The run re-measures both
   counts from the committed files (D5a) and sorts the new lines.
6. **52** per-project memory files changed since `c5ac35f` (`LastWriteTimeUtc` against a true-UTC cutoff), **34** of
   them `feedback_*` or `reference_*`. They include this session's own note
   (`reference_sibling_handoffs_land_in_its_todo.md`) and `MEMORY.md`. _Corrected during the run_: this line first
   said 49 and 33, because `[datetime]'2026-10-27T07:57:22Z'` converts to local time and the comparison with
   `LastWriteTimeUtc` ignores the kind, which moved the cutoff two hours later (deviation 1).

## Decisions

All approved by the user in the 2026-11-06 brainstorm, except where marked _my call_.

**D1 — Run order.** Context-cost read-out → §1 → §2 → §3 → § 4 → ride-alongs → **one checkpoint** → docs → commit →
PR. The read-out goes first: it belongs to this Cleanup Week's run (§ 5 stocktake 2026-10-27).

**D2 — The plugin context-cost read-out** (§ 5 _Recurring read-out_). It is a kept practice, not a trial, so it adds
nothing to the queue count.
- **Method and table**: the 2026-09-24 method, in the 2026-10-08 read-out's table format: `claude plugin list --json`
  and `claude plugin details <id>`.
- **The enabled set is re-measured, not copied**: `~/.claude/settings.json`, `.claude/settings.json` and
  `.claude/settings.local.json` (there is no `.mcp.json` any more). Known changes since the 10-08 table: `code-review`
  and `playwright` off at user scope, Context7's `.mcp.json` server **retired** in G1 on 2026-10-28 (REVIEW-QUEUE §1,
  the dated correction; the plugin copy stays off), `typescript-lsp` off at project scope.
- **Usage side**: `analyze-sessions.mjs --json --since 30d`, run read-only from the catalog clone with no install,
  output to the job scratchpad. Copy this project's totals and its `by_subagent_type` and `by_skill` rows for the
  plugins in the table. Model calls inside hooks and the *You should know* side agent are invisible to it; the table
  says so in those cells. The run records the oldest transcript still on disk (30-day retention). _My call_: "this
  project's totals" means the main transcript folder, comparable with the 10-27 figure (118 sessions); the
  worktree sessions' folders are summed on a separate line.
- **The user's reading**: the `/plugin` → Installed tab's **Not used recently** group, which the CLI cannot give.
  Asked at the checkpoint (D8).
- **Dispositions are ruled at the checkpoint and then applied** (_my call_, from the builder check; both earlier
  read-outs applied the disables the user approved). A **project-scope** disable the user approves ships in this
  PR as an edit of `.claude/settings.json` (a pre-push `SKIP` path; precedent 10-27 D3). A **user-scope** change
  is not written by the run: it is listed at the checkpoint as an action the user takes in `/plugin`. One likely
  item, to be measured rather than assumed: `claude-security` is still on at project scope, and the 2026-10-08
  override of the "disable between scans" rule rested on a trial leg that closed on 2026-10-11.

**D3 — §1 sourcing.** §1a and §1b diff plugin **names** in `.claude-plugin/marketplace.json` against the pinned
baselines, official `a29a80b` (315) and community `06ec7b6` (2,283), each fetched through `gh`. Additions are the
fresh candidates; the parked Next-up items (`openai/codex-plugin-cc`, `serena`) compete with them. If a catalog did
not grow, its section widens as the 10-27 D4 did, minus every reviewed or in-use name. The baseline line gets this
run's values.
- **`openai/codex-plugin-cc` is conditional on a free plan** (user, 2026-11-06: no OpenAI plan, not sure it is needed,
  willing to try it on a free tier). Before §1b spends research on it, the run checks **OpenAI's own docs or pricing
  page**, not recall or a third-party post, for whether a free ChatGPT plan can run the Codex CLI the plugin drives,
  and with what limits. An API key is pay-as-you-go, so it does not count as free.
  - **If a free plan can run it**: it competes for §1b. If it wins, its probe goes to the checkpoint for
    authorization (D7.3, D8). The probe installs the Codex CLI and the plugin into the scratchpad; the user signs in
    with their own free account; nothing is installed in the repo. The checkpoint notes that the probe sends this
    public repo's code to OpenAI.
  - **If not**: it drops out of §1b and stays parked, with its Next-up note updated to the measured plan requirement
    and the user's stance ("revisit if the user takes a paid OpenAI plan").

**D4 — §2 and §3 sourcing.** Standard hybrid sourcing: a fresh web check plus each section's parked Next-up. The user
named no tool or habit they missed over G1–G5, so no candidate comes from the user.

**D5a — How the sibling is read.** The harness refuses `git` on the sibling from this worktree, and its checkout can
be dirty (§ 4 Conventions: cite the committed state). So every sibling read in §§ 4 and 5 goes through
`gh api repos/GoodAlex223/claude-code-universal-config/contents/<path>?ref=<sha>`, at **`227a337`** (the 10-27
measurement point) and **`59ffd0d`**. Measured 2026-11-06: `gh api …/commits/main` gives `59ffd0d`, and the `TODO.md`
read at `227a337` returns 155,141 bytes. This reads the user's own repository and is not web research, which the
10-27 run also did. Line numbers are cited only from these reads.

**D5 — § 4 outbound.**
- **The three handed-off rows close on this side** (D5 is the user's ruling; the rows' status is user-maintained under
  the TODO § Spawned Tasks convention): the size-trigger exception and the rule-loss check (both handed 2026-10-17,
  re-handed 2026-10-27) and the proposed-fix rule (handed 2026-10-27). Each gets a dated line, "filed at the sibling:
  TODO 🟠 _title_ (`59ffd0d:<line>`)", and is checked off here. Applying them is the sibling's job, and they are not
  re-measured or re-sent.
- **A new outcome-log status, `filed at origin`**, in REVIEW-QUEUE § 4's outbound outcome log, distinct from
  `unapplied`. The three rows get an appended, dated status line; the frozen rows are not rewritten. § 4 Conventions
  gains one line defining it.
- **A dated correction to the 10-27 card's key discovery 2** ("the hand-off channel stalled"), appended in that
  card, not rewritten. Its wording depends on a fact D5a reads first: whether the three rows were already filed at
  `227a337` (the 10-27 sweep missed them) or arrived after it (the sweep was right then, and only the "stalled"
  reading was wrong).
- **New candidates only**: this window's shipped work (PRs #93–#98) and the memory files changed since `c5ac35f`, at
  the high bar, with matched scopes and a positive control per sweep (§ 4 Conventions). _My call_, since REVIEW-QUEUE
  never defines "high bar": the bar the 10-27 sweep applied. A candidate is general (not project-specific), absent
  at the target by a grep with a positive control, and backed by more than one incident. The hand-off note
  (Appendix A) carries only these.
- **No out-of-repo writes**, as in the last two runs.

**D6 — § 4 inbound.** Sort the sibling lines naming media_viewer that are new since `227a337`. Each gets a row in the
inbound Reviewed log or a note that it is covered, with the sibling line cited at `59ffd0d`.

**D7 — Ride-alongs: the three XS 🟤 `[2026-10-27] From: G6 closeout` lines**, each done in this PR and checked off in
BACKLOG:
1. REVIEW-QUEUE § 5 Policy: a trial question names the incumbent it must beat (grep, ESLint, an existing hook);
   evidence that only equals the incumbent reads `drop`.
2. REVIEW-QUEUE §1: the "Already in use here" list is re-measured from the settings files each run (D2 does it).
3. The canonical methodology: a probe that installs and runs a downloaded package, even in the scratchpad, is named
   at the checkpoint as an action the user authorizes.

**D8 — One checkpoint**, after every measurement and before any doc is written. It carries: the read-out's table and
the user's **Not used recently** reading; the four §§1–3 draft verdicts; § 4's new candidates and the inbound sort;
an authorization request for any package probe, named before it runs (D7.3), including a Codex probe if §1b picks it
(D3); and the read-out's dispositions to rule on, with any user-scope change listed as the user's own action (D2). A
probe that needs no download is not asked about.

**D9 — Delivery.** Docs: the card, REVIEW-QUEUE, BACKLOG, TODO, WEEKLY (the G6 box and its Daily-Schedule row),
the canonical methodology (D7.3) and the 10-27 card (D5), plus the `docs/README.md` index link this card needs
(pre-commit `check-docs-index.js`). The one possible non-doc file is `.claude/settings.json`, and only if the user
approves a project-scope disable at the checkpoint (D2). `npm ci` runs in the worktree before the first commit, since a fresh worktree has
no hooks. The pre-push gate should print `SKIP` for a docs-only range. One branch, one PR, **pushed only on the user's
approval**. Review runs in a separate session; asked before any in-chat review.

## Left to the run (_my call_)

Which candidates win each section, the draft verdicts, the read-out's cell wording, and whether a trial `adopt` is
filed at all. All of these come to the checkpoint.

## Scope guards (YAGNI)

- **Exactly four** verdict rows in §§1–3 (1a, 1b, 2, 3).
- **At most one** new trial `adopt`, naming its vehicle and its incumbent at filing (D7.1). Reviews install nothing in
  the repo; a package probe installs into the scratchpad only, and only after the checkpoint authorizes it.
- **Web**: lightweight inline research (a few `WebSearch` + 2–3 `WebFetch` per category). No deep-research harness,
  no parallel fan-out. § 4 is local only.
- **Out-of-repo writes: none.** No sibling-repo edits, no `~/.claude` edits beyond this repo's own memory files.
- **Frozen Reviewed-log, Trial-log and outcome-log rows are never rewritten**; corrections are appended and dated.
- A category with nothing worth adopting gets a `pass`, never a forced `adopt`.

## Verification

Docs only. Verification means **evidence for each written claim**, plus the commit hooks.

- Every figure names its probe; every sweep carries a positive control; live-versus-sibling counts use matched scopes.
- Claims about a plugin are verified against its source or its own output, never its README. Claims about the sibling
  cite `59ffd0d`.
- Before shipping, grep this run's prose for self-attestations and prove each one.
- Column-count check over every Markdown table touched, counting every unescaped pipe, code spans included.
- The pre-commit hook passes (after `npm ci`); the pre-push gate prints `SKIP`, or the E2E run passes.

---

## Outcome (2026-11-06 run)

Run in D1 order, with one checkpoint (six rulings and one reading). Web: **7 calls** (3 `WebSearch`, 4 `WebFetch`: one
returned 403, one a redirect that the next call followed). The catalogs, the sibling's files, the Claude Code changelog, `GoogleChrome/modern-web-guidance`
and `openai/codex-plugin-cc` came through `gh`. The § 4 outbound sweep ran in one read-only subagent; every figure
from it below keeps its qualifiers.

| § | Item | Verdict | Deciding evidence |
| --- | --- | --- | --- |
| 5 | Plugin context-cost read-out | ran; `claude-security` **disabled between scans** (user ruling) | ~778 always-on tokens, above the ~500 threshold; its 10-08 exception rested on trial leg 2, closed 10-11. Enabled total ~1,803 → ~1,025. *Not used recently* (user's reading): `claude-md-management` only. |
| 1a | `modern-web-guidance` (Google Chrome) | pass; its guides parked | Every use runs `npx -y modern-web-guidance@latest`, outside the catalog's SHA pin, and it makes itself mandatory on every HTML/CSS/JS task. The catalog grew 315 → 317 with two non-fits. |
| 1b | Codex as a second-opinion reviewer (`openai/codex-plugin-cc`) | **adopt**, a trial through the CLI; the plugin `defer` | Free plan per OpenAI's own README and pricing page (allowance unstated). The plugin is hook-bearing and would track OpenAI's `main`. Incumbent: the posted review of the same commit, at its recorded `/code-review` level, plus first-hand checks; Codex runs in a fresh worktree outside the main checkout (both from PR #99's review). |
| 2 | Idle compaction vs the keep-warm timer | defer | Both parked premises moved (VS Code has it since 2.1.314; the user skipped keep-warm on 11-06). What a summary loses is unmeasured. |
| 3 | Codex routes subagents' state-changing calls through review | pass | Already tracked: 🟤 "A `Bash(*preload.js*)` ask rule and `guard-preload-bash.js` did not gate Workflow-tool subagents", with its probe. |
| 4 out | 6 merges, 34 memory files | 3 propagate by hand-off; 3 rows closed `filed at origin` | Same 50 Markdown files on both sides, content-identical; each promoted item absent with a control and backed by more than one incident (the guard item by seven, the checkout item by nine, the escapes item by two, plus one that fits either cause; corrected in PR #99's review from "four or more"). |
| 4 in | 37 new sibling lines | noted, plus 2 rows ruled | The sibling applied what media_viewer sent. Guard timeouts: 4, all before fail-closed, 0 after 10-17 → noted. "Minimum 2" lines → fixed in this PR. |

**Checkpoint rulings (user)**: all six as recommended. `claude-security` disabled at project scope; the Codex CLI
review is the run's one trial; the top three outbound items and two additions go by hand-off; the five README lines
are fixed here; the timeout row is noted with the 10 s limit kept. The *Not used recently* reading came from the
user's screenshot of `/plugin` → Installed.

### What changed in the repo

- `.claude/settings.json`: `claude-security@claude-plugins-official` → `false` (a pre-push `SKIP` path).
- REVIEW-QUEUE: §1 baselines (`a1ecfbc`, 317; `06ec7b6`, 2,283), the in-use convention (D7.2) and its re-measure, two
  verdict rows, two Next-up changes; §2 and §3 one row each; § 4 the `filed at origin` convention, an outbound row,
  six outcome rows, an inbound row, four parked bullets promoted and three runners-up parked; § 5 the incumbent rule
  (D7.1), a stocktake update, the Codex trial row and the read-out table.
- The methodology's rule #7 (D7.3); a dated correction to the 10-27 card's key discovery 2.
- BACKLOG: one 🟤 trial entry; the three `[2026-10-27]` G6-closeout lines checked off. TODO: three rows closed, three
  rows added. WEEKLY: G6's boxes, its Daily-Schedule line and Status `◐`. `docs/README.md`: this card indexed.
- The five "minimum 2" lines: `docs/planning/plans/README.md:38` and `:57`, `docs/archive/README.md:44`,
  `docs/archive/plans/README.md:14` and `:44`.

### Out-of-repo change log

- **Written outside the repo**: one per-project memory note (`reference_sibling_handoffs_land_in_its_todo.md`) and
  its `MEMORY.md` line; scratch files in the job's `tmp/`. No `~/.claude` config edit, no sibling edit, no install.
- **Run, read-only**: `claude plugin list/details`, `session-report`'s analyzer from the catalog clone, and
  `gh api` reads of public repositories and the user's own.

### Key discoveries

1. **A hand-off note lands in the sibling's intake, in a batch, before it lands in live `~/.claude`.** The 10-27
   "stalled" reading measured application. Both notes were filed on 10-28, the day after. The new `filed at origin`
   outcome closes such a row here instead of re-sending it every run.
2. **A catalog's SHA pin covers a plugin's repository, not what its skills download at run time.**
   `modern-web-guidance` is pinned at `b31dc0a`, yet every use runs the newest npm release. A review that reads only
   the manifest and the hooks would miss it.
3. **A vendor's own plugin can sit in no Anthropic catalog**, and then the only install tracks a moving branch. The
   capability (a Codex review) can be trialled through the vendor's CLI without the plugin's hooks.
4. **`[datetime]'…Z'` in PowerShell gives local time**, and comparing it with `LastWriteTimeUtc` ignores the kind. The
   card's first memory-file count was two hours off, and the sweep subagent caught it (deviation 1).
5. **Built-in plugins do not appear in `claude plugin list`**, and `claude plugin details` prices four of the five the
   tab lists (~0 each) and reports the fifth "not found".

### Deviations from this run-card

1. **"What is different" #6 counted 49 and 33 memory files**, a time-zone slip in the filter. The UTC re-count is 52
   and 34, corrected in place with a note.
2. **#4 cited `:337` for the proposed-fix row.** At `59ffd0d` that line falls inside a merged row whose title is at
   `:319`, from another project's run. The § 4 rows cite it by title.
3. **D6 said the inbound rows would be sorted.** The checkpoint went further: the "minimum 2" fix was applied in this
   PR (five README lines, user-approved), so D9's file list grows by three READMEs.
4. **§2's `defer` is partly the scope guard's work**: at most one new trial, and the user's free-plan condition put
   Codex first.
5. **The analyzer took 170 s** (73 s on 10-27); the window it read starts on 2026-10-07.
6. **The Codex trial row was tightened after the commit**, from a *Heads up* side-agent note the user relayed: a
   free-plan run may undersell Codex (a lighter model, an unpublished allowance). The row and its BACKLOG entry now
   record the model that ran and whether the allowance ran out, and a `drop` reads `drop (free tier)`. Checked
   against this run's own sources before applying: the pricing page names a lighter model for Free, and no OpenAI
   page states the Free allowance.

### PR #99 review, round 1 (2026-11-06)

Eight findings at head `91fdd04`, plus one remark from the reviewer's session (its own backslash test narrows a
mechanism this card called "never pinned down"). Each was checked first-hand before it was fixed; none was refuted.

1. **Fixed.** The Codex trial now runs in a fresh worktree outside the main checkout, which holds five git-ignored
   `CLAUDE-SECURITY-*` folders, `.claude/settings.local.json` and a brainstorm token (listed by name here, not
   opened). The disclosure says Codex sends whatever it reads, under a free-tier account, not only the diff.
2. **Fixed.** "A quoted heredoc" is out of the backslash remedy (TODO row, outbound row, Appendix A item 4).
   Reproduced here: two backslashes in a `<<'EOF'` heredoc came out as one (`od -c`), and a lone one survived; a
   `String.fromCharCode(92, 92)` control kept both.
3. **Fixed.** The trial's incumbent is the posted review at its recorded `/code-review` level plus its first-hand
   checks, and Codex's candidates get the same check.
4. **Fixed.** G2's backtick incident is dropped, G6's is marked as fitting either cause, and "four or more incidents"
   now reads more than one, per item (7, 9 and 2 plus one).
5. **Fixed differently.** The 50 is right for Markdown files, the filter every count used, but the row never said
   so. It now does, and records the 53 files of any kind and `Windows` 10 over all of them. The third non-Markdown
   file the reviewer could not name is `TEMPLATES/mcp.json.example`.
6. **Fixed.** "Five built-in plugins the settings files do not name" now reads four.
7. **Fixed.** The three TODO closure lines carry `59ffd0d:<line>`, as D5 asks.
8. **Fixed.** The blank line under BACKLOG's **Last Updated** is back; the header hunk against `main` is now the one
   changed line.
- **Transcript remark, fixed**: "the mechanism was never pinned down" is replaced, wherever it stood, by the measured
  collapse (two backslashes become one before bash parses the command).

### PR #99 review, round 2 (2026-11-06)

At head `ad1d81a`, the reviewer confirmed all eight round-1 fixes and accepted #5's "fixed differently". It found one
new issue, present since `91fdd04`.

1. **Fixed.** The escapes rule pointed the sibling at `LANGUAGES/powershell.md`, but the PowerShell tool keeps both
   backslashes. Reproduced: the same single-quoted string gave character codes 65, 92, 92, 66 in the PowerShell tool
   and 65, 92, 66 in the Bash tool. The rule's title now names the Bash tool (and the editor tool for the escape
   case), and its target is a tool-use note in `WORKFLOW.md`, with the PowerShell measurement given as the reason.
   The same change went into the TODO row, the outbound row, the outcome log and Appendix A item 4. The user's saved
   note needs item 4 swapped a second time.
- **Held back, candidate 1 (the Codex worktree has no removal step), fixed anyway**: the trial row and its BACKLOG
  entry now end with `git worktree remove <folder>`. It costs one clause, and the fresh worktree holds no junction, so
  the removal cannot reach the main checkout.
- **Held back, candidate 2 ("a tool-call command" reads wider than the Bash tool), fixed with #1**: the sentence now
  says "a Bash-tool command".

### PR #99 review, round 3, and the merge (2026-11-06)

At head `d3f4a6f`: **no issues found**. The reviewer confirmed all three round-2 replies against the files, and
re-ran the gates itself: the cell counts, the docs index, and the unit suite under Git Bash, 2,636 passed and 1
skipped. It dropped three candidates. (1) The second swap of item 4 in the user's saved note has one carrier, this
card's round-2 section: the user was told directly in the session. (2) Item 4's fourth line runs 155 characters, past
the card's 120-column wrap: it renders the same, left as is. (3) The title is shorter than the measured fact: the
body states it exactly.

**Merged `d326ed1` on 2026-11-06** with `--merge`, at the user's request, pinned to the full head SHA
(`gh pr merge --match-head-commit`). The branch was deleted on the remote and locally. Closeout: this section, the
Improvements pointer below, DONE, WEEKLY `✅ PR #99`, TODO's stamp and the BACKLOG extract, in one commit on `main`.

## Improvements (extracted at closeout)

Extracted 2026-11-06 to BACKLOG 🟤 `[2026-11-06] From: G6 closeout (PR #99, merge d326ed1 — Weekly Reviews 2026-11-06 run)`.

1. **A §1 review reads a candidate's skills and hooks for run-time downloads.** Add a line to REVIEW-QUEUE §1: a
   catalog's SHA pin covers the plugin's repository, not what it fetches when it runs (`npx … @latest`, `pip install`,
   `curl | sh`), so a review searches its `SKILL.md` files and hook scripts for these and names any it finds.
   Evidence: §1a, key discovery 2. 🟤, effort XS. Affected: `docs/planning/REVIEW-QUEUE.md` §1.
2. **The recurring read-out covers built-in plugins.** Add a line to § 5's recurring read-out: the `/plugin` tab lists
   built-in plugins that `claude plugin list` omits; price each with `claude plugin details <name>@builtin` where it
   answers, and record "not found" where it does not. Evidence: key discovery 5. 🟤, effort XS. Affected:
   `docs/planning/REVIEW-QUEUE.md` § 5 Policy.

---

## Appendix A — hand-off note for `claude-code-universal-config`

> From media_viewer's Weekly Reviews, 2026-11-06. For issue-intake. Measured at your `main` `59ffd0d`, read through
> the GitHub API (your committed files, not a checkout).
>
> 1. **The 10-17 and 10-27 notes are filed with you** (BACKLOG `[2026-10-28] From: manual testing`). media_viewer
>    closes its three rows as `filed at origin` and stops re-sending them. Two additions:
>    - _"Let a project's own `CLAUDE.md` size trigger stand in for the ~200-line audit trigger"_: the same trigger
>      also sits at `POLICIES/context-management.md:22` and `:163` (live `~/.claude`, content-identical to your
>      `home-claude/` over the 50 Markdown files of `CLAUDE.md`, `WORKFLOW.md`, `POLICIES/`, `rules/`, `TEMPLATES/`
>      and `LANGUAGES/`). The hand-back never named those two. Live `CLAUDE.md` has the trigger at `:104` now.
>    - _"Check a reviewer's suggested fix the way the finding was checked"_: one more media_viewer incident, PR #97.
> 2. **New: a guard can be partial or over-broad.** Check a guard after every `await`; name the hazard its rationale
>    leaves out; run its exclusion rationale over every class it covers. Incidents in media_viewer: PR #68 (two), its
>    G4 of 2026-09-12, PR #74, #81, #94 and #95. Absent: `over-broad`, `exclusion rationale`, `partial guard`, `after
>    every await` and `own rationale` 0 (control `guard` 8). Target: `POLICIES/code-review.md` (§ The Fix Wave, or
>    § Deciding What to Report), or a new rule in `critical-thinking.md` Phase 4.
> 3. **New: in a checkout another session shares, check the head SHA and local HEAD before a verdict, and run probes,
>    gates and mutants in a frozen copy.** After a reviewer subagent returns, compare `git rev-parse HEAD` and
>    `git status -sb` with the start; run mutants in a copy (`git archive` or a scratch worktree), restore, and re-read
>    the last baseline. Incidents: PR #78, #85, #87, #89, #90, #92, #93, #95 and #97. media_viewer's sessions run in
>    worktrees since PR #97, which removes most of the shared-branch cause; the copy-and-baseline half still applies.
>    Absent: `shared checkout`, `same checkout`, `parallel session`, `local HEAD`, `git rev-parse HEAD` and `mutant` 0
>    (control `worktree` 5). Target: a new § in `POLICIES/git.md` after § Throwaway Worktrees, plus a clause at
>    `critical-thinking.md:155`.
> 4. **New: on this Windows host, the Bash tool collapses backslashes and an editor tool can unescape a typed
>    escape.** Build backslashes and escapes from character codes (`chr(92)`, `String.fromCharCode(92)`), then
>    check the bytes after writing (`od -c`, or a `grep -c` of the literal character). No shell quoting is a remedy:
>    two consecutive backslashes in a Bash-tool command reach bash as one, inside a quoted heredoc (`<<'EOF'`) or single quotes too, while a lone backslash
>    survives (`od -c`, measured twice on 2026-11-06). The collapse happens before bash parses the text. The Write
>    tool alone is not the remedy either: an editor tool once wrote a typed escape as the literal character.
>    Incidents: media_viewer's G1 (2026-10-11) and PR #94, plus G6 (10-18), which fits either cause. Absent:
>    `backslash`, `heredoc`, `chr(92)`, `BOM`, `U+FEFF` and `fromCharCode` 0 (control `Windows` 8 occurrences over
>    the 50 Markdown files). Target: a tool-use note in `WORKFLOW.md`, where within it yours to choose. Not
>    `LANGUAGES/powershell.md`: the PowerShell tool keeps both backslashes (character codes 65, 92, 92, 66 against
>    the Bash tool's 65, 92, 66 for the same single-quoted string, measured 2026-11-06).
>
> _Item 4 was corrected in PR #99's review, after the user had saved this note: the first version listed "a quoted
> heredoc" among the remedies, counted G2's 2026-10-30 backticks (ordinary command substitution) as an incident, and
> said the mechanism was never pinned down. Round 2 corrected it again: its title now names the Bash tool, and its
> target moved from `LANGUAGES/powershell.md` to `WORKFLOW.md`, because the PowerShell tool keeps both backslashes._
> 5. **Your row "Hand media_viewer its `guard-preload-bash.js` timeouts" can close: noted.** In media_viewer's
>    transcripts still on disk (main folder, subagents and worktree folders): 4 guard timeouts (2026-10-07, 10-09,
>    10-16 and 10-17), all before `onFailure: "block"` took effect on 2026-10-19, and none after 10-17. The 10 s limit
>    stays. Your fifth, from 10-05 or 10-06, is past the 30-day retention.
> 6. **Your row "Drop the 'minimum 2' count from media_viewer's plan READMEs" is applied** in media_viewer's G6 PR of
>    2026-11-06: the five lines you named now say that Future Improvements lists every item noticed outside the task's
>    scope, or says "None found". Frozen archived plans keep their wording.
> 7. **Seen, nothing to do**: the 14-row status correction and the `typescript-lsp`, formatter re-time and Context7
>    rows read as media_viewer reported them. `mattpocock/skills` and the design-video batch stay event-driven here
>    (0 hits in your `REVIEW-QUEUE.md`, control `dead-end-registry` 3).
