# Group G6 — Weekly Reviews (2026-10-17 run): Run-card

**Date**: 2026-10-17 (Saturday), one day after the WEEKLY.md slot (Oct 12–16 plan, a normal week, Friday). Verdict
rows are dated `2026-10-17`.
**Branch**: `g6-weekly-reviews`, cut from `main` at `e85abc5` (G5 closeout; `main` equal to `origin/main` after a
fetch).
**Source**: ⚪ Overhead — WEEKLY.md Group G6 (5 SP, exempt from the source-quota denominator).
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md)
§ _Methodology (canonical — current practice)_.
Previous run-card: [`2026-10-09-weekly-reviews-run.md`](2026-10-09-weekly-reviews-run.md).

---

## Why a run-card (not a full spec)

Methodology rule **#6**: a codified-repeat ⚪-overhead task needs only brainstorm → a short run-card → execute, and
approving the run-card satisfies the brainstorming design gate. The brainstorm was held with the user in-session on
2026-10-17 and produced two rulings, recorded in D3 and D6. This note records only what is _specific to this run_.

## What is different about this run

Every figure names its probe; none is carried forward from an earlier run.

1. **Window: 8 days** (2026-10-09 → 2026-10-17). Merged inside it (`git log --merges --since=2026-10-09 main`):
   G1 `e5cd3a8` (PR #78), G2 `96467f7` (PR #79), G3 `bf6fcad` (PR #80), G4 `51af1ab` (PR #81) and G5 `3fb797e`
   (PR #82), plus the weekly plan `d5fce61` and each group's closeout.
2. **Both pending trials have a vehicle that ran**, so this is the first run since 2026-09-02 to open with § 5
   read-outs (D4 order). Evidence rows are in REVIEW-QUEUE § 5: *You should know* (2026-10-12 and 2026-10-16) and
   `typescript-lsp` (2026-10-16). Outstanding trials: **2** before the read-outs.
3. **The catalog did not grow, and the 10-09 diff method no longer works.** A name diff of
   `.claude-plugin/marketplace.json` between the last upstream commit on or before 2026-10-09 (`b8e53f1`) and HEAD
   (`ea10b21`, 2026-10-16), each fetched with `gh api …/contents?ref=<sha>`, gives **315 → 315**. The only change is a
   rename: `data-agent-kit-starter-pack` → `data-agent-kit`, a Google Cloud data-engineering suite (category
   `development`). It has no surface here. The 10-09 run read the additions from commit messages. Since then the
   log is almost all version bumps: the 40 most recent commits on that path are all `bump(…)` commits or the merge
   of one. Only a diff of plugin names between two pinned SHAs finds additions now.
4. **§4 inbound: 35 sibling lines now name media_viewer (14 at the last run), but only one row is new.** Measured
   with `git show main:docs/planning/TODO.md | grep -c -i "media.viewer"` in `claude-code-universal-config`. That
   repo's `main` is at `ae2c2a4`. Its checkout is on `g1-ram-dev-container-ceiling` (`6e3ffae`) with an
   uncommitted `docs/prompts/workflow-evolution.md`, probably a parallel session, so the committed `main` is cited.
   The growth is status lines:
   - On 2026-10-16 the sibling marked **15** rows `handed-over — in media_viewer's 2026-10-16 catch-up list; not
     applied yet`. The user received that list in chat. **14** of those rows were already ruled here, on
     2026-09-24 and 2026-10-09 (REVIEW-QUEUE § 4 inbound rows).
   - The **one new row**: _"Re-time media_viewer's PostToolUse formatter hook after its 2026-10-05 rewrite"_
     (spawned 2026-10-16, `5c74a03`). It came from rating_bot's `/doctor` audit handover. The audit's figure ("8.0 s
     typically and 15.1 s at worst over 44 runs") mostly predates `a0008ad`, which replaced `npx prettier` with
     `node .claude/hooks/format-edited-file.js`.
   - Two more mentions are not addressed to this repo: the gitleaks-slug row, handed to rating_bot only (this repo
     has no gitleaks config), and the WEEKLY.md conventions row, `applied-out-of-tree` (this repo has a WEEKLY.md).
5. **Transcripts do not record a successful PostToolUse hook's duration.** Across the 5 most recent session
   transcripts in this project's directory, one of them with 292 `Edit`/`Write` mentions, `hookEvent` /
   `hookName` values occur only for `SessionStart` and `PreToolUse:Bash`, never for `PostToolUse`. Those
   occurrences are the positive control: the field is recorded, just not for this event. So D5 times the hook
   directly.
6. **§4 outbound: two rows are already routed here.** G5 (PR #82) filed two TODO § Spawned Tasks rows for G6:
   - the global audit trigger's byte-trigger exception. Live `~/.claude/CLAUDE.md` L98 reads "whenever one crosses
     ~200 lines". At sibling `main`, `grep -c -i "200.line\|200 lines\|~200"` gives `home-claude/CLAUDE.md` 1,
     `docs/prompts/claude-md-audit.md` 3 and `docs/prompts/claude-md-content-policy.md` 3.
   - the rule-loss check with a positive control, for the sibling's `claude-md-audit.md`.

   **35** topic files in the per-project memory directory changed since 2026-10-09 (`find … -name '*.md'
   -newermt 2026-10-09 ! -name MEMORY.md`; 21 are `feedback_*`). D6 re-measures the window from the 10-09 run's
   commit time (`6688eb0`), since `-newermt 2026-10-09` also counts that morning.
7. **Claude Code is still 2.1.289** (`claude --version`). The parked §2 `onFailure: "block"` item's revisit
   condition ("after upgrading past 2.1.295") is unmet.
   **Corrected during the run (Outcome, deviation 1):** `claude --version` reads the terminal CLI on `PATH`. These
   sessions run in the VS Code extension, whose own binary reports **2.1.301**, so the condition is met here.

## Decisions

**D1 — Run order.** § 5 read-outs → §§1–3 → § 4 sweep and the D5 hook timing → checkpoint → docs → commit → PR. The
recurring plugin context-cost read-out is **not due**: it runs in each Cleanup Week (#5 is ~Oct 26–30), and the sync
bucket has delivered no plugins since 2026-10-08.

**D2 — § 5 *You should know* → `keep`, trial closed** (proposed here; confirmed at the checkpoint). The trial question
was: did a note flag something that the session, its review or its closeout later had to correct or act on? In G4,
a *Heads up* note flagged the missing Save/Discard prompt on a header folder switch mid-tournament. That became user
ruling D3, with its prompt, two E2E tests and Task 4's growth. G4's second note arrived too late to change anything,
and G2's session saw no notes. G4 showed that notes do reach this host's chat, so G2's silence reads as the mod
staying quiet, not as notes being hidden. **Caveat, carried into the row**: its side-agent token cost was never
measurable from inside a session. The mod stays enabled at user scope (`~/.claude/settings.json`,
`"cc-plugin-you-should-know@builtin": true`). Its 🟤 `[2026-10-09]` BACKLOG entry is checked off with this outcome.

**D3 — § 5 `typescript-lsp` → `inconclusive`, re-vehicled once** (user ruling 2026-10-17).
- **Why not `keep` or `drop`**: the only run measured a setup gap, not the tool. The server never initialized ("Could
  not find a valid TypeScript installation"). The catalog entry's `lspServers.typescript` passes only `--stdio`, with
  no `initializationOptions`, so no `tsserver.path` can be set and the global `typescript` can never satisfy it.
  `typescript` must be in this repo's `node_modules`.
  *Corrected in PR #83's review (2026-10-18): the cause is the version, not the location. The server accepts a
  TypeScript only if it ships `lib/tsserver.js`, and 7.0.2 (npm's `latest`, and the global install's version) ships
  none. Measured with `initialize` against scratch workspaces: `typescript@7.0.2` in `node_modules` fails like G4,
  and `typescript@6.0.3` starts. So the devDependency is `typescript@6`. By the server's code a global 6.x would
  also have worked (read, not run). The ruling is unchanged.*
- **New vehicle**: the first group after this run that edits `media-viewer.js` or a `*-worker.js`. That group adds
  `typescript` as a devDependency **in its own session**, since a `package.json` and lockfile change does not belong
  in a docs-only run. Before the trial counts, it confirms that the server initializes: an `LSP documentSymbol`
  request on a `.js` file returns symbols, not the initialize error. Then it runs the trial under the 2026-10-09
  read-out question.
- **Stop rule**: if that run surfaces no diagnostic and answers no navigation question the session would otherwise
  have grepped for, it reads **`drop`**. There is no third vehicle; the plugin is then disabled at project scope and
  the devDependency removed.
- The plugin stays enabled meanwhile. `serena` stays parked behind it.
- Written as a new dated trial-log row; the frozen 2026-10-09 row is not rewritten. The 🟤 `typescript-lsp` BACKLOG
  entry gets the same re-vehicle note.
- **Queue after D2 and D3: 1 outstanding**, so one new trial `adopt` is allowed (scope guards).

**D4 — §1a sourcing and the catalog baseline (ride-along).** Note 3 leaves no catalog addition to review, so §1a takes
the strongest of its parked _Next-up_ items (`sonarqube`, unreviewed since 2026-10-09; `code-modernization`) and the
development / security / testing categories, on their merits. **Ride-along**: 🟤 `[2026-10-09]` _"Record a named
catalog baseline in each Weekly-Reviews run"_ (effort XS, REVIEW-QUEUE only) is done this run and checked off. Its
proposed method was "read the upstream commit log", and note 3 shows that no longer names additions. The convention
line in REVIEW-QUEUE §1 therefore records:
- the method: a name diff of `marketplace.json` between two pinned SHAs;
- this run's baseline for both rosters: the official catalog at `ea10b21` (315 plugins), and the community
  marketplace (`anthropics/claude-plugins-community`) at the SHA and plugin count measured at run time.

**D5 — § 4 inbound: rule the one new row by measuring it here.** Time the hook directly. Pipe
`{"tool_input":{"file_path":"<abs path>"}}` into `node .claude/hooks/format-edited-file.js` ten times on each of
two in-repo files, timing each run's wall clock:
- an already-formatted `.js` file, so Prettier rewrites nothing;
- a `.md` file under `docs/`, which `.prettierignore` covers.

Record the median and the maximum. `git status --short` must be unchanged before and after.
- If the median is **1 s or more** per edit: file a 🔵 BACKLOG entry (the source is the owner's own `/doctor` audit,
  so it routes as user-raised) naming the row's three options: async, a narrower matcher, or a Stop hook.
- Otherwise: rule the row **N/A — re-timed**, with the figures.
- This run changes no hook either way.
- **The 14 already-ruled rows** are re-checked only for a status change at the origin. Their new status
  (`handed-over … not applied yet`, 2026-10-16) is later than this repo's rulings on them (2026-09-24 and
  2026-10-09), which the origin has not read. So the rulings go into the hand-off note (D6) as a correction, and the
  rows are not re-ruled. `mattpocock/skills` and the design batch stay event-driven.

**D6 — § 4 outbound: a hand-off note, no out-of-repo write** (user ruling 2026-10-17).
- **The two G5 rows** go to the sibling as one hand-off note that the user passes to its issue-intake. The note is
  Appendix A, finalized at the checkpoint and also given in chat.
- Each gets an outbound outcome-log row reading **`unapplied — handed over 2026-10-17`**, with today's grep at live
  `~/.claude` and at sibling `main` as its evidence. Each TODO § Spawned Tasks row stays `- [ ]` and gains a dated
  status line.
- **No new propagation is promoted this run.** With no out-of-repo write, a new `propagate` could only be filed, and
  "filed, never applied" is the pattern § 4's outcome log was built to expose (the 2026-09-02 burn-down warning).
- **The sweep still runs**: the window's shipped work (note 1), and the memory files changed since the 10-09 run's
  commit time. The parked candidates are re-measured with positive controls: "a BACKLOG entry's stated mechanism is
  a hypothesis", guard scope, and the pre-push gate. So are the new candidates the window surfaces. Each lands in
  _Next-up_ with today's evidence, so the next run that may write live can promote one without re-deriving it.

**D7 — No strategic-doc edit.** Nothing merged in the window meets or obsoletes a Key Result or passes a milestone.
The 2-month `Last Updated` bar falls on 2026-10-27, inside Cleanup Week #5's window (WEEKLY.md Parallel Work).

**D8 — One docs-only branch and a PR**, as on 10-09. Methodology rules #3 and #4 apply. Push and PR only on explicit
approval.

## Categories & starting points

Excluded from every category: anything already in a Reviewed log, and everything the 2026-10-08 § 5 table shows as
installed here.

| #   | Category                    | Parked _Next-up_                                                                                   | Fresh-check                                                                             |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1a  | Plugins — official catalog  | `sonarqube` (unreviewed) · `code-modernization` · `commit-commands` · `serena` (behind `typescript-lsp`, D3) | No catalog additions (note 3) → the development / security / testing categories |
| 1b  | Plugins — wider internet    | `bugbash` · TestDino skill pack · `playwright-cli-agents` / Dev Browser (Electron gap)              | The community marketplace roster (`anthropics/claude-plugins-community`) and an 8-day web check |
| 2   | Claude best-practice        | `/skill-doctor` + `/plugin` Stats tab · `onFailure: "block"` (met: the host is 2.1.301, note 7 as corrected) | The changelog since 2.1.295 and current Anthropic / Claude Code guidance                |
| 3   | Non-Claude AI best-practice | `/sandbox` (Windows-gated) · harness observability (needs a validation proposal) · Spec Kit         | Top current cross-tool AI-coding practice                                               |
| 4   | Cross-project propagation   | outbound: D6 · inbound: D5                                                                           | Local only — **no web**                                                                  |

## Scope guards (YAGNI)

- **Exactly four** verdict rows in §§1–3 (1a, 1b, 2, 3). In § 4: one outbound row, two outcome-log rows and one
  inbound row.
- **At most one** new trial `adopt`, and it must name its vehicle at filing time. Reviews install nothing.
- **Web**: 8–12 calls of lightweight inline research. No deep-research harness, no parallel fan-out. § 4 is local
  only.
- **Out-of-repo writes: none** (D6). The hand-off note is text the user passes on. D5's timing runs the hook on
  in-repo files only and must leave `git status` unchanged. No sibling-repo edits, no `~/.claude` edits, no plugin
  configuration changes.
- **Frozen Reviewed-log and Trial-log rows are never rewritten**; corrections and addenda are appended and dated.
- A category with nothing worth adopting gets a `pass`, never a forced `adopt`.
- **`CLAUDE.md` is untouched.** It was audited yesterday (G5), and its byte trigger stands.

## Checkpoint (user-in-the-loop)

1. **After §§1–3, the § 4 sweep and the D5 timing**: the four verdicts, D2's `keep`, the D5 inbound ruling and the
   final text of Appendix A, all approved before any doc is written.

## Outputs

**In-repo**

- **REVIEW-QUEUE.md**:
  - §1: the baseline convention line and values (D4).
  - §§1–3: four verdict rows dated `2026-10-17`, with each Next-up refreshed.
  - § 4: one outbound row, two outcome-log rows (D6) and one inbound row (D5).
  - § 5: a stocktake update and two trial rows: the *You should know* read-out (D2) and the `typescript-lsp`
    re-vehicle (D3).
- **BACKLOG.md**:
  - A `### [2026-10-17] From: Weekly Reviews (2026-10-17 run)` section, with no `(N items)` count, holding the trial
    `adopt` (if any), D5's 🔵 entry (if filed) and any defect the run surfaces.
  - Checked off with their outcomes: the 🟤 *You should know* entry (D2) and the 🟤 catalog-baseline entry (D4).
  - A re-vehicle note on the 🟤 `typescript-lsp` entry (D3).
- **TODO.md** § Spawned Tasks: a dated `handed over` status line on each G5 row (D6).
- **WEEKLY.md**:
  - G6's boxes and its Friday schedule row.
  - The Summary-Table row reads `◐ Branch complete, unmerged` in-branch, and becomes `✅ PR #N` in the closeout
    commit on `main` after the merge.
- **DONE.md**: the transition entry, at closeout.
- **docs/README.md**: this run-card indexed (hook-enforced).
- **This run-card**: an appended **Outcome** section and the final Appendix A.

**Out-of-repo**: none. Appendix A goes to the user.

## Verification

Docs only. Verification means **evidence for each written claim**, not a test run.

- Every figure names its probe. Every grep sweep carries a **positive control**.
- Claims about a plugin are verified against Claude Code's CLI or the plugin's own source, never its README. Claims
  about the sibling repo are verified at a named commit of its `main`.
- Before shipping, grep this run's own prose for self-attestations ("verified", "confirmed", "as planned", "per the
  …") and prove each one (09-24 lesson, PR #72).
- Sweep for the **fact**, not the phrase, when correcting any count (`feedback_sweep_the_fact_not_the_phrase`).
- Column-count check over every Markdown table touched, counting **every** unescaped pipe, code spans included
  (`feedback_gfm_pipe_in_code_span`). The pre-commit hook must pass (`check-secrets.js`, `check-docs-index.js`, the
  unit suite).

---

## Outcome (2026-10-17 run)

Run in D1 order, with the checkpoint held once (rulings below). The session crossed midnight into 2026-10-18; rows
keep the run's date. Web: **8 calls** (4 `WebSearch`, 4 `WebFetch`), inside the 8–12 guard; one fetch returned
only a redirect (`developers.openai.com/codex/changelog` → `learn.chatgpt.com/docs/changelog`), which the next
fetch followed. Catalog snapshots, plugin sources and the upstream `CHANGELOG.md` came through `gh`.

| § | Item | Verdict | Deciding evidence |
| --- | --- | --- | --- |
| 5 | *You should know* | **keep**, closed | G4's *Heads up* note became user ruling D3; G2 saw none. Token cost unmeasured, carried as a caveat. |
| 5 | `typescript-lsp` | **inconclusive**, re-vehicled once | User ruling. The server needs a TypeScript that ships `lib/tsserver.js`, which 7.x does not, so the devDependency is `typescript@6` (corrected in PR #83's review; D3). Stop rule: no third vehicle. |
| 1a | `sonarqube` (official catalog) | pass | The catalog diff was 315 → 315 (rename only). At `5a9356d`, the plugin's one hook only reports; the analysis needs `sonarqube-cli` and a SonarQube Cloud or Server login, and the rest overlaps tools already here. |
| 1b | `bugbash` (community) | pass | The community roster had no additions (2,284 → 2,283; the removal is the method's control). At `085be49`: 0★, Markdown only, duplicating practice already here. |
| 2 | `"onFailure": "block"` on the guard hook | **adopt** (trial) | The extension host is 2.1.301, not 2.1.289. The hooks reference documents the field. `node` starts in 64 ms against a 10 s timeout. Precondition: the terminal CLI updated past 2.1.295. Queue 1 → 2. |
| 3 | "Rules are prompts; hooks enforce" (Cursor) | pass | Already practised here; all sources secondary. Codex's Oct 8–15 changelog had nothing applicable. |
| 4 out | the window's shipped work and 35 memory files | pass, none promoted | User ruling D6. Matched-scope sweep with controls 25/25, 9/9, 5/5, 9/9; three new candidates parked. The two G5 rows read `unapplied — handed over`. |
| 4 in | 15 handed-over rows | 1 ruled, 14 returned | The formatter re-time: `media-viewer.js` 1,104 ms median → 🔵 filed (user ruling). The 14 rulings go back in Appendix A item 3. |

**Checkpoint rulings (user, at the checkpoint)**: D5 → file the 🔵 entry. Everything else approved as presented:
the four verdicts, including §2's trial adopt and its precondition; D2's `keep`; no new propagation; Appendix A.

### Out-of-repo change log

None. No plugin was installed, enabled or disabled, and no file under `~/.claude` or in the sibling repo was
touched. D5's timing ran the hook on in-repo files only. Its one planted control file was created and deleted
inside a single command, and `git status --short` was empty before and after.

### Key discoveries

1. **A version gate must read the host that runs the session, not the CLI on `PATH`.** These sessions run in the VS
   Code extension (`CLAUDE_CODE_ENTRYPOINT=claude-vscode`), at 2.1.301 since 2026-10-16, while `claude --version`
   reads the terminal CLI at 2.1.289. Note 7 measured the wrong one. So did the 2026-10-09 parked note's
   "this machine runs 2.1.289", for at least the last two days of its life. Correcting it turned §2 from a
   parked item into this run's adopt.
2. **The catalog's commit log no longer names additions**, so the baseline is now a name diff between two pinned
   SHAs, for both rosters. The community roster's one removal matched its commit message, which gave the method
   a positive control for free.
3. **A successful `PostToolUse` hook leaves no duration in a transcript**, so the inbound row could only be ruled
   by timing the hook directly. The hook is far cheaper than the audit's figures, which mostly predate
   `a0008ad`. Two costs remain: the renderer still crosses 1 s per edit, and an ignored `.md` pays 214 ms for
   nothing.
4. **The inbound count growth (14 → 35 lines) was an echo, not new work.** The origin marked 15 rows
   handed over without having read this repo's rulings on 14 of them: a one-way channel cannot see the far end's
   verdicts. Appendix A item 3 returns them.
5. **The positive controls caught a probe of my own.** The first § 4 sweep grepped all of `home-claude/` on the
   sibling side against five paths live. `Extract` read 27 against 25, and the matched re-run reads 25/25.

### Deviations from this run-card

1. **Note 7 was wrong** (corrected inline above), so §2 reviewed the parked `onFailure` item rather than leaving
   it parked.
2. **D5 timed a third file**, `media-viewer.js`, beyond the two the card named. Only it crosses the 1 s bar, and
   the user ruled to file the 🔵 entry on that evidence.
3. **§3's Next-up is unchanged.** Nothing new was worth parking there, although the Outputs list says each
   Next-up is refreshed.
4. **BACKLOG got two sections, not one.** The Outputs name one `### [2026-10-17] From: Weekly Reviews` section,
   but the trial `adopt` routes 🟤 and D5's entry 🔵, so each route got its own. Their headings were identical
   until PR #83's review, which suffixed them `§ 4 inbound` and `§ 2 adopt`.

### PR #83 review, round 1 (2026-10-18)

Eight findings, all checked against the files and the hooks reference before fixing, and all fixed:

1. The `onFailure` probe's missing script blocks every shell call, the restoring rename included. The §5 row and
   the 🟤 entry now restore with Read and Write, which the `Bash|PowerShell` matcher does not cover.
2. The `onFailure` and `typescript-lsp` vehicles could fall in one session. Both now say they must not share one,
   and `onFailure` yields.
3. Without `checkJs`, TypeScript reports no type errors in a `.js` file (measured with `tsc` 6.0.3 and 7.0.2,
   with a syntax-error control). The trial now judges navigation plus syntax diagnostics.
4. A `Stop` hook's input carries no edited-file list, per the hooks reference. The 🔵 entry now prices it with a
   recorder (M), and weighs the narrower matcher (S).
5. The §2 starting-point cell still said "unmet: still 2.1.289". Corrected.
6. Two identical BACKLOG headings. Suffixed, and recorded as deviation 4.
7. Remedy (1) copied part of `.prettierignore`. It now reads the file.
8. "Now measured" covered a warm start only. The §2 row and the 🟤 entry now say so; a cold start is left to
   the trial.

Checking finding 3 turned up a defect the review had not raised. The `typescript-lsp` re-vehicle as written would
have failed like G4, since npm's `latest` TypeScript (7.0.2) ships no `lib/tsserver.js`. D3's note, the §5 row,
the BACKLOG entry and Appendix A item 4 now say `typescript@6`.

## Improvements (extracted at closeout)

1. **A version-gated check reads the session's host, not the `PATH` CLI.** Add a convention line to REVIEW-QUEUE
   §2, where changelog-gated items get parked: report `CLAUDE_CODE_ENTRYPOINT` and the running binary's
   `--version` (for the VS Code extension, `resources/native-binary/claude.exe` under its extension folder), and
   name which host a revisit condition refers to. Evidence: deviation 1 and discovery 1. 🟤, effort XS. Affected:
   `docs/planning/REVIEW-QUEUE.md`.
2. **§ 4 sweeps grep the same paths on both sides, and their controls must agree.** Add a line to REVIEW-QUEUE
   § 4's Conventions: a live-versus-sibling count compares only when the probe's scope is identical on both sides,
   and positive controls that differ between the trees mean the scopes differ, so re-run before reading any
   candidate's count. Evidence: discovery 5. 🟤, effort XS. Affected: `docs/planning/REVIEW-QUEUE.md`.

---

## Appendix A — hand-off note for `claude-code-universal-config` (final; approved at the checkpoint)

Item 4 was rewritten in PR #83's review (2026-10-18): its cause was wrong (round 1 above). Items 1–3 and 5 are as
approved.

> From media_viewer's Weekly Reviews, 2026-10-17. For issue-intake. Measured at your `main` `ae2c2a4`.
>
> 1. **The global `CLAUDE.md` audit trigger needs an exception for a project with a byte trigger** (media_viewer
>    G5, PR #82, D2 and review #6). Live `~/.claude/CLAUDE.md` § Document Maintenance says to audit a project
>    `CLAUDE.md` "whenever one crosses ~200 lines". media_viewer's own `CLAUDE.md` § Maintenance says "Lines are not
>    the trigger here" and warns in bytes instead (`scripts/check-claude-md-size.js`, trigger 69,000). The two rules
>    answer "is an audit due?" oppositely. Each rule there is one line, so lines barely move while bytes grow: the
>    week before G5, lines rose 9% and bytes 30%. Cutting to 200 lines would mean cutting rules. Same wording at
>    `home-claude/CLAUDE.md` (via your sync), `docs/prompts/claude-md-audit.md` (3 mentions) and
>    `docs/prompts/claude-md-content-policy.md` (3). Suggested shape: "…whenever one crosses ~200 lines — or, where
>    the project's own `CLAUDE.md` sets a size trigger, when that trigger fires".
> 2. **Add a rule-loss check with a positive control to `claude-md-audit.md`** (media_viewer G5, Improvement 3).
>    Step 6 verifies size and references, not that no rule was lost. In G5 this check found three wrong disposition
>    rows and restored 15 rules. Method: a fresh agent compares the old and the trimmed file, reading only those two.
>    One rule is deleted from its copy beforehand, so its findings count only if it reports that one.
> 3. **Status correction: 14 of the 15 rows you marked `handed-over` on 2026-10-16 had already been ruled here, and
>    two of them are done.** The rulings are in media_viewer's `docs/planning/REVIEW-QUEUE.md` § 4, inbound rows of
>    2026-09-24 and 2026-10-09:
>    - **Applied** (G5, PR #82, merge `3fb797e`, 2026-10-17): the quarterly per-project `CLAUDE.md` audit, run with
>      your runbook; and `/claude-api prompt-audit`, run as one pass of it.
>    - **Consumed**: `dead-rules-audit` (adopted 2026-08-27, trial `drop` 2026-09-02, uninstalled 2026-09-24);
>      `dead-end-registry` (§1b `pass`, 2026-09-24); the path-scoped rules pattern (folded into media_viewer's own
>      🟤 `[2026-08-27]` path-scoped-rules entry, still open); `typescript-lsp` (the § 5 trial; see item 4).
>    - **Dropped**: `/wayfinder` (folded into `mattpocock/skills`, its superset); Jenkins (a self-hosted CI server
>      for a solo, local, Windows Electron app whose E2E suite needs this machine's desktop session; the pre-push
>      E2E gate covers the no-CI gap); Firecrawl (no web-data need); indiehackers.com (no audience or monetization
>      track).
>    - **N/A**: the `github` MCP credential form (no `github` MCP server at any scope here).
>    - **Parked, event-driven**: `mattpocock/skills`, the design-video sub-batch and `mdiSnFLzQaI`. media_viewer
>      re-checks them only when your `REVIEW-QUEUE.md` logs a verdict on them (0 mentions at `ae2c2a4`).
>
>    `handed-over … not applied yet` reads as pending work at this end, and none of it is. A status meaning "ruled
>    at the target" would let your next sweep skip these 14.
> 4. **`typescript-lsp` procedure correction: pin TypeScript 6.** `typescript-language-server` (5.3.0 on this
>    host) accepts a TypeScript only if it ships `lib/tsserver.js`. It looks in the workspace's `node_modules`, then
>    falls back to the `typescript` its own install resolves (the global one). TypeScript 7.0.2, npm's `latest`,
>    ships no `lib/tsserver.js`, so a host or workspace install of plain `typescript` now fails with "Could not
>    find a valid TypeScript installation". The catalog entry passes only `--stdio`, so no `tsserver.path` can be
>    set. Measured 2026-10-18 by sending `initialize` to the server against scratch workspaces: no local
>    `typescript` and `typescript@7.0.2` both failed; `typescript@6.0.3` started and answered `documentSymbol`. Seen
>    first in media_viewer G4 (PR #81), which blamed the install location. Install `typescript@6`, and check
>    goodalex223's part of the row; dropshipping's part is parked. media_viewer re-vehicles the trial once, with
>    `typescript@6` as a devDependency, and drops it if that run shows nothing.
> 5. **Formatter hook re-time** (your row spawned 2026-10-16, `5c74a03`). Re-timed 2026-10-17 by piping hook input
>    into `node .claude/hooks/format-edited-file.js`, 10 runs per file, wall clock, median / max: `media-viewer.js`
>    (546 KB) 1,104 / 1,150 ms; `path-grants.js` (12.7 KB) 344 / 367 ms; a Prettier-ignored `docs/` `.md` file
>    214 / 239 ms; `node` alone 64 / 74 ms. A planted unformatted file came back formatted. That is well under the
>    audit's "8.0 s typically", most of which predates `a0008ad`, but the renderer still crosses 1 s per edit, and
>    an ignored `.md` pays 214 ms for nothing. Filed in media_viewer as 🔵 `[2026-10-17]`: skip ignored paths before
>    spawning Prettier, and move the renderer's cost to a `Stop` hook or `async`. Your row can close as "re-timed;
>    follow-up filed at the target".
