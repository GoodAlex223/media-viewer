# Group G6 — Weekly Reviews (2026-10-27 run): Run-card

**Date**: 2026-10-27 (Tuesday). This is the Oct 19–23 week's G6, four days past its Friday slot (WEEKLY.md Spillover
line). Verdict rows are dated `2026-10-27`.
**Branch**: `g6-weekly-reviews`, cut from `main` at `0712e04` (G5 closeout; `main` equal to `origin/main` after a
fetch).
**Source**: ⚪ Overhead — WEEKLY.md Group G6 (5 SP, exempt from the source-quota denominator).
**Methodology reference**: [`2026-06-26-weekly-reviews-first-run-design.md`](2026-06-26-weekly-reviews-first-run-design.md)
§ _Methodology (canonical — current practice)_.
Previous run-card: [`2026-10-17-weekly-reviews-run.md`](2026-10-17-weekly-reviews-run.md).

---

## Why a run-card (not a full spec)

Methodology rule **#6**. This run differs in one way: the user skipped the brainstorm questions. So the measurements
came first, and the rulings came from a single checkpoint (four questions, recorded in D3, D5, D6 and the Outcome).
This card is therefore written after the measurements, not before them (deviation 1).

## What is different about this run

Every figure names its probe; none is carried forward from an earlier run.

1. **Window: ~9.5 days**, from the 10-17 run's commit (`637e523`, 2026-10-18 01:06 +0300). Merged inside it
   (`git log --merges --since=…`): PR #83 (that run, `1954109`), #84 G1 I1 `4548269`, #85 G2 PR 1 `f668611`, #86
   feature-cache wipe fix `654fb3e`, #87 G2 PR 2 `f5ddfa3`, #88 v2 spec `e1c4e03`, #89 G4 `7f75013`, #90 G3
   `082e3b2` and #91 G5 `7fb9978`.
2. **Both outstanding trials have a vehicle that ran**, and their evidence rows are already in REVIEW-QUEUE § 5:
   `onFailure: "block"` (2026-10-19, G1) and `typescript-lsp` (2026-10-26, G3, its last vehicle). Outstanding
   trials: **2**.
3. **The host, named as the 🟤 `[2026-10-18]` convention asks**: this session runs the terminal CLI
   (`CLAUDE_CODE_ENTRYPOINT=cli`), which reports **2.1.303** (`claude --version`). The VS Code extension's binary
   (`anthropic.claude-code-2.1.310-win32-x64/resources/native-binary/claude.exe --version`) reports **2.1.310**. The
   upstream `CHANGELOG.md` (via `gh`) tops out at 2.1.311.
4. **Neither catalog grew.** The official catalog's last commit on `marketplace.json` is `a29a80b` (2026-10-27
   00:16 UTC, a `security-guidance` bump). A name diff against the `ea10b21` baseline gives **315 → 315**, with no
   addition, removal or rename. The files do differ (from character 21,604), so the two fetches were distinct
   versions: they differ in version bumps only. The community marketplace's last commit on the file is still the
   baseline `06ec7b6`, and the HEAD fetch is byte-identical to it (`cmp`): **2,283**.
5. **§4 inbound: one new row.** `git show 227a337:docs/planning/TODO.md | grep -c -i "media.viewer"` gives **36**
   (35 at `ae2c2a4`). The sibling's local `main` equals its remote `main` (`gh api …/commits/main`). Its checkout
   is on `g7-post-deploy-24h-stage` with an uncommitted `home-claude/settings.json`, probably a parallel session,
   so the committed `main` is cited. The new row: _"Record G1's gitignored local-settings edits in media_viewer and
   Дипломи"_ (spawned 2026-10-18, status `pending`).
6. **The 10-17 hand-off note left no trace at the origin.** At `227a337`, the 14 rows that note returned all still
   read `handed-over (2026-10-16) — in media_viewer's 2026-10-16 catch-up list; not applied yet`. Its items 1 and 2
   are still absent: live `~/.claude/CLAUDE.md:101` still reads "whenever one crosses ~200 lines" (`size trigger`
   0), and the sibling's `docs/prompts/claude-md-audit.md` gives 0 for `rule-loss`, `rule loss` and `positive
   control` (control `audit` 9).
7. **69** per-project memory files changed since `637e523` (`find … -newer`; 43 of them `feedback_*` or
   `reference_*`).

## Decisions

**D1 — Run order.** § 5 read-outs → §§1–3 → § 4 sweep → checkpoint → docs → commit → PR. The recurring plugin
context-cost read-out is **not due here**: it belongs to Cleanup Week #5's own Weekly Reviews run (my call). That run
should know the enabled set changed materially since the 10-08 read-out (D7).

**D2 — § 5 `onFailure: "block"` → `keep`, closed** (approved at the checkpoint). Both halves of the trial question
are met by the 2026-10-19 evidence row: the forced-failure probe blocked, and there were zero spurious blocks over
the ~870 main-thread and 52 subagent shell calls that followed. The field is live in `.claude/settings.json` (the
`PreToolUse` guard entry only; the formatter hook stays fail-open). Its 🟤 `[2026-10-17]` § 2 adopt entry is checked
off.

**D3 — § 5 `typescript-lsp` → `drop`; the removal ships in this PR** (user ruling at the checkpoint).
- **Why `drop`, although the literal question was met**: the question asked whether it surfaced a diagnostic or
  answered a navigation question the session would otherwise have grepped for. It did both, but its navigation
  answers matched grep exactly (`zoomState` 16, `zoomControlsMap` 10, `ZoomManager` 3). The one acted-on diagnostic
  (TS 6133, an unused `createRequire`) is one ESLint's `no-unused-vars` also reports. The decisive "no call names a
  removed method" check came from `tsc --checkJs`, not the plugin. A question that grep-equal answers satisfy cannot
  tell a useful tool from a redundant one. Meanwhile each idle session held ~0.6 GB committed (1,286 MB for two
  stacks) on a host where E2E launches fail with `0xC0000142` under low memory.
- **Done in this PR, per the 2026-10-17 stop rule**: `typescript-lsp@claude-plugins-official` set to `false` in
  `.claude/settings.json`, and the `typescript` devDependency removed (`npm uninstall --save-dev typescript`:
  `package.json` −1 line, `package-lock.json` −15). The PR is therefore not docs-only, and the pre-push E2E runs.
- **Kept, my call**: the user-level global installs, `typescript` 7.0.2 and `typescript-language-server` 5.3.0
  (`npm` global). The global `tsc` 7.0.2 still runs a whole-file `--checkJs` sweep (the 10-17 card measured
  `checkJs` on 7.0.2), so the sweep loses nothing. Uninstalling them is the user's call; they cost nothing while the
  plugin is off.
- `serena` stays parked, now with a reason: this trial's navigation gave no gain over grep here.
- **Queue after D2 and D3: 0 outstanding.**

**D4 — §1a sourcing and the baseline.** Note 4 leaves no catalog addition, so §1a widens to the catalog's
development, testing, security and productivity categories, minus every reviewed or in-use name. The strongest
unreviewed entry is **`session-report`** (Anthropic): it measures token use, which three § 5 caveats left
unmeasured. The baseline line in REVIEW-QUEUE §1 gets this run's values: official `a29a80b` (315), community
`06ec7b6` (2,283, unchanged since the 10-17 baseline).

**D5 — §1b: the parked `eslint-plugin-sonarjs`, measured by a probe** (user ruling at the checkpoint).
- §1b's fresh check was thin: a web search for October 2026 plugins named none (row Notes). OpenAI's
  `codex-plugin-cc` was surfaced and parked instead (Next-up). So §1b took its parked item with an open question:
  "the noise a new rule set adds".
- **The probe**: ESLint 9.39.4 (the repo's version) and `eslint-plugin-sonarjs` 4.2.2, installed in the scratchpad,
  never in the repo. A scratch config imports the repo's own `eslint.config.mjs` for its file groups and parser
  options, strips every repo rule and plugin, then adds sonarjs's `recommended` set alone. It runs from the repo
  root with JSON output to the scratchpad, and `git status --short` is checked unchanged before and after.
- **The classifier refused the first attempt** (server-side, no reason given). Per the standing rule, there was no
  retry of a variant. The user authorized the probe once at the checkpoint.

**D6 — § 4 outbound: a hand-off note only, no out-of-repo write** (user ruling at the checkpoint, over my
recommendation to apply two edits live-first). Appendix A carries the two G5 items again, the 14-row status
correction again, one new candidate, and closing notes on two sibling rows.

**D7 — § 4 inbound: the new row is ruled `noted`.** Measured here:
- `.claude/settings.local.json` (mtime 2026-10-18 00:36) has `"disabledMcpjsonServers": ["context7"]` and the
  plugin copies of `context7` and `hookify` off.
- `.mcp.json`'s `context7` entry has an empty `--api-key` argument (0 characters, read with the value masked).
- At user scope, `~/.claude/settings.json` now enables only `security-guidance`, `superpowers`,
  `claude-md-management` and the built-in *You should know* mod. `frontend-design`, `context7`, `code-review`,
  `hookify`, `playwright`, `playground`, `claude-code-setup` and the eight synced plugins are off. The sibling's
  commit `c64e5b4` (2026-10-17, "rung 1 - Claude surfaces and their MCP servers") touched `home-claude/settings.json`.

So REVIEW-QUEUE §1's "Already in use here" line is stale in six names. It is corrected to the measured enabled set,
and a reference memory records the local edit.

**D8 — Ride-alongs (both 🟤 `[2026-10-18]`, effort XS, REVIEW-QUEUE only), done and checked off:** a host-naming
convention line in §2, and a matched-scope line in § 4 Conventions.

**D9 — No `CLAUDE.md` edit.** Two docs change as D3's consequence. GOALS.md's "No TypeScript" row says
`typescript-lsp` "provides code navigation", which stops being true with this PR. The v2 spec's paragraph
"The typedefs are documentation, not a control" said `tsc --noEmit` "needs `typescript@6`" and "can follow if
the `typescript-lsp` trial earns its place"; it gets a dated correction (added in PR #92's review, finding 1).

**D10 — One branch and a PR.** No longer docs-only (D3): methodology rule #3's docs-only skip does not apply, and
the pre-push E2E gate runs. Push and PR only on explicit approval.

## Scope guards (YAGNI)

- **Exactly four** verdict rows in §§1–3 (1a, 1b, 2, 3). In § 4: one outbound row, three outcome-log rows and one
  inbound row.
- **At most one** new trial `adopt`, naming its vehicle at filing. Reviews install nothing in the repo; the D5 probe
  installs into the scratchpad only.
- **Web**: lightweight inline research. No deep-research harness, no parallel fan-out. § 4 is local only.
- **Out-of-repo writes: none** (D6). No sibling-repo edits and no `~/.claude` edits.
- **Frozen Reviewed-log and Trial-log rows are never rewritten**; corrections and addenda are appended and dated.
- A category with nothing worth adopting gets a `pass`, never a forced `adopt`.

## Verification

Docs plus two config files. Verification means **evidence for each written claim**, plus the commit hooks.

- Every figure names its probe; every sweep carries a positive control.
- Claims about a plugin are verified against its source or its own output, never its README. Claims about the
  sibling are verified at `227a337`.
- Before shipping, grep this run's prose for self-attestations and prove each one.
- Column-count check over every Markdown table touched, counting every unescaped pipe, code spans included.
- The pre-commit hook must pass; the pre-push E2E must pass (D10).

---

## Outcome (2026-10-27 run)

Run in D1 order, with one checkpoint (four questions). Web: **5 calls** (2 `WebSearch`, 3 `WebFetch`). The
catalogs, the upstream changelog, `openai/codex#54619` and `openai/codex-plugin-cc` came through `gh`.

| § | Item | Verdict | Deciding evidence |
| --- | --- | --- | --- |
| 5 | `onFailure: "block"` | **keep**, closed | The probe blocked; 0 spurious blocks over ~920 later shell calls (2026-10-19 evidence row). |
| 5 | `typescript-lsp` | **drop**, closed | User ruling. Navigation equal to grep, one diagnostic ESLint also reports, ~0.6 GB per idle session. Disabled and its devDependency removed in this PR. |
| 1a | `session-report` (Anthropic) | **adopt**, ordinary work, not a trial | Its analyzer ran read-only on this host and gives the usage-side figures § 5's caveats lacked. Done in-run: one step in § 5's recurring read-out. |
| 1b | `eslint-plugin-sonarjs` 4.2.2 | pass | The probe: 361 errors over 132 tracked files, which would block every commit; one real defect among them (filed 🟤). |
| 2 | `/auto-mode-setup` (changelog 2.1.304) | pass | 4 auto-mode denials in 30 days of this project's transcripts; none is the missing-infrastructure class the command fixes. |
| 3 | Codex: bind plugin hook approval to plugin contents | pass | Every hook-bearing plugin enabled here is Anthropic's own or SHA-pinned in Anthropic's catalog. |
| 4 out | 9 merges and 69 memory files | 1 propagate, by hand-off (user ruling D6) | Matched scope: 57 files, content-identical on both sides; controls 10/10, 28/28, 17/17, 8/8, 3/3. |
| 4 in | 1 new row | noted | Context7 off in this repo's local settings; the §1 in-use line corrected. |

**Checkpoint rulings (user)**: D3 → drop, with the removal in this PR. D5 → authorize the probe once. D6 → a
hand-off note only. Everything else approved as presented: D2's `keep`, §1a's adopt as ordinary work, the §2 and §3
passes, D7's correction and memory note, and D8's ride-alongs. §1b's verdict follows from the probe the user
authorized, after the checkpoint.

### §1a — `session-report`, measured

- **Source read** in the local catalog clone (`plugins/session-report/skills/session-report/`): `SKILL.md`, and
  `analyze-sessions.mjs` (875 lines). It imports only `fs`, `os`, `path` and `readline`, and writes nothing (no
  `writeFile` in the file). The skill copies an HTML template and embeds the JSON.
- **Run read-only from the clone**, no install: `node analyze-sessions.mjs --json --since 30d`, 73 s, output to the
  scratchpad (473,534 bytes). The transcripts it found span 2026-09-27 → 2026-10-27, and an all-time run saw 581
  sessions against 576 for 30 days, so little older history is kept on disk.
- **This project** (its transcript folder): 118 sessions; **6.34B** input tokens, 97.7% cached;
  **21.1M** output; 585 subagent calls for **3.15B** tokens.
- **`claude-security`'s agents** (all projects, 30 days): researchers 46 calls / 35.6M tokens, verifiers 30 /
  13.1M, patch-generator 8 / 15.7M, patch-verifier 8 / 14.1M. This is the per-scan cost the 2026-09-24 row left
  unmeasured.
- **Not visible to it**: model calls made inside hooks (`security-guidance`'s review layers), and the *You should
  know* side agent (no subagent type in its output names it).
- **Done in-run**: § 5's recurring read-out gains the step. The 🟤 entry is filed already checked.

### §1b — `eslint-plugin-sonarjs`, measured

- **The authorized run's first attempt failed before linting**: my scratch config imported `cjs/index.js`, while the
  package's `main` is `./cjs/plugin.js`. Fixed in the config and re-run: 41 s, exit 1 (findings), `git status
  --short` unchanged.
- **146 files linted, 132 of them git-tracked.** The other 14 are untracked scratch copies under `.superpowers/`,
  dropped from every count below. 0 parse failures.
- **Tracked: 361 errors** (the recommended set reports at severity 2).
  - App code: **88** across 10 rules. `cognitive-complexity` 54 (24 functions at 30 or more, 8 at 50 or more, the
    highest 125 at `media-viewer.js:7159`), `no-nested-conditional` 13, `no-ignored-exceptions` 8,
    `no-identical-functions` 4, and 9 more across 6 rules. `media-viewer.js` alone has 46.
  - Tests: **260** across 21 rules, mostly test style: `no-fixed-wait-in-tests` 92, `prefer-specific-assertions` 75.
  - Tooling 11, vendor 2.
- **8 of the 21 app findings outside the two complexity rules were read**:
  - **one real defect**: `feature-extractor.js:29` allocates `rgbPixels`, writes one `{ r, g, b }` object per pixel
    into it (line 37), and never reads it. It sits in `extractFeatures`, which runs once per image. ESLint's own
    `no-unused-vars` cannot see it, because `rgbPixels[i] = …` reads the variable to write its element. Filed 🟤.
  - `like-or-skip.js` `recordSkip`/`restore` are identical on purpose: two documented operations.
  - Both unused-variable hits are `_`-prefixed names, this repo's own convention for an intended unused name.
  - The "super-linear" regex is the thousands-grouping one, on a number's digits.
  - The two `pseudo-random` hits are a partial Fisher–Yates sample (`sorting-worker.js:338`) and the tournament
    shuffle (`tournament-engine.js:152`), not security uses.
  - `main.js:511`'s "ignored exception" returns `false`, a deliberate fallback.
- **Verdict `pass`**: adopting the recommended set would add 361 errors to the lint step and the pre-commit hook. A
  curated subset is not justified by one defect in 38 app files. The complexity ranking is recorded in Next-up as a
  re-runnable input for v2's module split.

### §2 — `/auto-mode-setup`, measured

- **The command, per the docs** (`code.claude.com/docs/en/auto-mode-config`, fetched 2026-10-27, through the fetch
  tool's summariser): it drafts `autoMode.environment` entries, and sometimes rule entries, from the project and
  recent sessions. On acceptance it writes them to `~/.claude/settings.json`. The classifier does not read `autoMode`
  from project settings, so any adoption would be user-level.
- **The denials** in this project's transcripts (118 sessions, 2026-10-04 → 10-27), counted as distinct minute and
  reason, matching `denied by the Claude Code auto mode classifier. Reason: [...]`:
  - `[External System Writes]` 10-09;
  - `[Irreversible Local Destruction]` 10-11, in a subagent;
  - `[Self-Modification]` 10-18, the `onFailure` probe's rename, which was this probe's positive control
    (`feedback_classifier_refuses_guard_disable.md`);
  - `[Merge Without Review]` 10-22.
  - Plus one in this run: the D5 probe, server-side, no reason.
- None is a destination missing from the environment, which is the class environment entries fix. So: pass.

### §3 — plugin hook approval bound to contents, measured

- **The practice**: OpenAI Codex CLI 0.164.0 (2026-10-23, `learn.chatgpt.com/docs/changelog`). Read at its primary
  source, `openai/codex#54619` (merged 2026-10-16): "A plugin's scripts can change without changing its hook
  declaration. Declaration-only approval therefore lets changed plugin code run under an existing hook approval".
  The fix fingerprints the plugin's contents and asks for approval again when they change.
- **Measured here**: three hook-bearing plugins are enabled for this repo.
  - `security-guidance` (user scope; hooks on every edit). Its cache holds 2.0.9 (10-03), 2.0.10 (10-06), 2.0.11
    (10-16) and 2.0.14 (10-18), and the catalog lists 2.0.17 today: four content changes in 15 days to code that
    runs on every edit.
  - `claude-security` (project scope).
  - `superpowers`, whose `SessionStart` hook injects a skill into every session.
- **Pass**: the two Anthropic plugins are in-catalog sources (`./plugins/…`), and the one third-party plugin is
  pinned by SHA in the catalog (`obra/superpowers` at `bb92a77`). So every hook-code change arrives through
  Anthropic's catalog, and none tracks a third party's branch. Revisit if a hook-bearing plugin with a moving
  third-party ref is ever enabled.

### §4 outbound sweep

- **Scope**: live `~/.claude` (`CLAUDE.md`, `WORKFLOW.md`, `POLICIES/`, `rules/`, `TEMPLATES/`, `LANGUAGES/`)
  against `home-claude/` at sibling `227a337`. The same **57** files on both sides, all content-identical
  (`diff --strip-trailing-cr`), so the sync is current and live and sibling counts are equal by construction.
  Controls: `Hotfix` 10/10, `Extract` 28/28, `subagent` 17/17, `Windows` 8/8, `realness` 3/3.
- **The six parked candidates are all still absent**: `pre-push` 0; `stated mechanism` 0 (`hypothesis` 1, the
  bug-report template's field); `over-broad`, `exclusion rationale` and `partial guard` 0; `Extract reads` and `out
  of scope` 0; `backslash` 0; `git rev-parse HEAD` 0. `recorded, not fixed` 2 is the verdict's own definition
  (`POLICIES/code-review.md:146` and `:270`).
- **New candidates**: the 43 changed `feedback_*`/`reference_*` files were classified. 7 are general and already
  covered, 2 more partly covered, 2 project-specific, and the rest general and absent at the target.
  - The strongest is **a reviewer's proposed fix is traced through every state it reads before it is posted**: 7
    reviewer-side incidents, from PR #72 to #91. `proposed fix` 0. Target: `POLICIES/code-review.md:366`, reviewer
    item 5, "Suggest specific fixes".
  - It goes out by hand-off (Appendix A, item 4), and the next four are parked with today's counts.

### Out-of-repo change log

- **The repo's own writes**: `.claude/settings.json`, `package.json` and `package-lock.json` (D3), plus the docs.
- **Outside the repo**: only scratchpad installs (ESLint and sonarjs). The `~/.claude` tree and the sibling were
  not edited.
- **One stray file**: the sweep subagent's `grep -F` crashed in Git Bash and wrote `~/.claude/grep.exe.stackdump`
  (08:02). It was left in place, for the user to delete. The repo root's untracked `grep.exe.stackdump` predates
  this session.

### Key discoveries

1. **A trial question that redundant answers satisfy cannot fail usefully.** `typescript-lsp` met its question
   literally, with navigation that matched grep, so the read-out turned on gain over the existing tool rather than
   on the question's words. A future trial question should name the incumbent it must beat.
2. **The hand-off channel stalled.** Ten days after the 10-17 note, none of the 14 rows it returned has moved at the origin, and its two G5 items
   are still absent.
   Appendix A item 1 says so, and asks whether the note arrived.
3. **This repo's tool set changed from outside it** (D7). The sibling's G1 turned Context7 off in this repo's local
   settings, and at user scope seven plugins are off, Playwright among them (by the row's own account; D7 lists
   all seven). REVIEW-QUEUE's
   in-use line had gone stale in six names with no change in this repo.
4. **ESLint's `no-unused-vars` misses a write-only array**; sonarjs's `no-unused-collection` caught one on a
   per-image path.

### Deviations from this run-card

1. **Written after the measurements**: the user skipped the brainstorm questions, so the checkpoint carried the
   rulings.
2. **§1a's adopt was implemented in-run**, not filed open: it is one step in § 5's recurring read-out, and filing it
   open would repeat "filed, never applied".
3. **D5's authorized run needed a second invocation**, because my config's import path was wrong. The first never
   reached the lint step, so the user's one-run authorization was used once on the target.
4. **Appendix A carries a new candidate** (item 4), beyond the "refreshed note" the ruling named. It is text the user
   passes on, so it changes nothing outside the repo.
5. **A § 5 policy line added after the commit, approved by the user** (the second commit). A *You should know*
   note pointed out that Claude Code deletes local transcripts after 30 days by default. The data-usage docs
   confirm it ("for 30 days by default … Adjust the period with `cleanupPeriodDays`"), and none of the three settings
   files sets the key. Transcripts take 5.2 GB across all projects for the 30 days kept, 1.2 GB of it this repo. The
   new line says an evidence row quotes what it relies on when its vehicle runs. Raising `cleanupPeriodDays` is a
   user-level setting, so it stays the user's call (not in Appendix A).

### PR #92 review, round 1 (2026-10-27)

Six findings and two nits, at head `7e61741`. Each was checked at its source before fixing:

1. **Fixed.** The v2 spec's typedefs paragraph said `tsc --noEmit` "needs `typescript@6`" and "can follow if the
   `typescript-lsp` trial earns its place". It now has a dated correction in place, quoting the old wording, and D9
   names both docs.
2. **Fixed.** §1a named this repo's transcript folder by its encoded name, which contains the user name. It now
   names the folder by property. The BACKLOG profile-path entry gains a second pattern for that encoded form: live
   0 after the fix; frozen 2 archived plans, both already counted by the entry's first grep.
3. **Fixed differently.** The row's wording was wrong, but not the conclusion that the host can run the command. The
   doc puts the 2.1.304 floor only on sessions where feature-flag fetching is off ("Telemetry off, third-party
   provider, or Claude apps gateway"). This session is first-party, and none of the four
   variables that turn fetching off is set (evidence corrected in round 2, below). Its gate is therefore v2.1.233 (native Windows, Pro,
   Max or Team) or v2.1.283 (Enterprise or a Console API key), and the terminal's 2.1.303 clears both. The row now
   names that gate and both hosts. The command was not run, and the `pass` stands.
4. **Fixed.** "16 rows" now reads 14 rows returned, plus the two G5 items still absent.
5. **Fixed**, as suggested.
6. **Fixed.** The in-use correction and the inbound row now list all seven plugins off at user scope, and key
   discovery 3 says seven. **Found while fixing it**: the § 5 stocktake said five plugins went off after the 2026-10-08
   table, but that table already shows `playground` and `claude-code-setup` disabled at user scope. It now names
   only what changed: `code-review` and `playwright`, plus Context7's server and `typescript-lsp`.

**Nits, both fixed.**
- An `_Original entry:_` label now precedes each old body after a closing note. That covers four entries, including
  the `typescript-lsp` one, which had the same defect.
- Appendix A item 1 now says the 10-17 note's formatter re-time has shipped (G4, PR #89). The user holds the note
  until this PR merges.

**Held back items**: agreed, no change.

### PR #92 review, round 2 (2026-10-27)

At head `74abd8a`, no issue. All six findings and both nits were confirmed first-hand, and the pushback on finding 3
was accepted. The reviewer reproduced `--checkJs` on the global `tsc` 7.0.2 with a control, and checked the
2026-10-08 table behind the extra stocktake correction.

One optional nit, **fixed**: the evidence for feature-flag fetching named the wrong variable.
`CLAUDE_CODE_ENABLE_TELEMETRY` turns on OpenTelemetry export (env-vars doc). Fetching is off when any of
`DISABLE_GROWTHBOOK`, `DISABLE_TELEMETRY`, `DO_NOT_TRACK` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set, and none of the four is set here, so the conclusions hold.
- **Fixed in place**: the `/auto-mode-setup` row and round 1's item 3 above, both new in this PR.
- **Older lines, corrected without rewriting**: the frozen §2 row of 2026-10-09 and the § 5 row of 2026-10-12 make
  the same attribution about *You should know*. They get a dated correction in REVIEW-QUEUE §2 Next-up, which
  quotes the interactive-mode doc: the mod needs feature-flag fetching. The closed BACKLOG entry gets a
  parenthetical pointing to that correction.

---

## Appendix A — hand-off note for `claude-code-universal-config`

> From media_viewer's Weekly Reviews, 2026-10-27. For issue-intake. Measured at your `main` `227a337`.
>
> 1. **The 2026-10-17 note has left no trace here yet.** Measured at `227a337`, the 14 rows it returned still read
>    `handed-over (2026-10-16) — in media_viewer's 2026-10-16 catch-up list; not applied yet`, and its items 1 and 2
>    are still absent (items 2 and 3 below). If it never reached intake, this note replaces it. Its items 3–5 stand
>    as written (media_viewer `docs/superpowers/specs/2026-10-17-weekly-reviews-run.md`, Appendix A): the status
>    correction for the 14 rows, the `typescript-lsp` TypeScript-6 procedure, and the formatter-hook re-time. The
>    re-time's follow-up has since shipped here (G4, PR #89, merge `7f75013`), so that row can close as done.
> 2. **The global `CLAUDE.md` audit trigger needs an exception for a project with a byte trigger** (re-sent; item 1
>    of 10-17). Live `~/.claude/CLAUDE.md:101` still reads "whenever one crosses ~200 lines", with no size-trigger
>    clause (`size trigger` 0). media_viewer's `CLAUDE.md` § Maintenance says "Lines are not the trigger here" and
>    warns in bytes (`scripts/check-claude-md-size.js`). Suggested shape: "…whenever one crosses ~200 lines — or,
>    where the project's own `CLAUDE.md` sets a size trigger, when that trigger fires".
> 3. **Add a rule-loss check with a positive control to `docs/prompts/claude-md-audit.md`** (re-sent; item 2 of
>    10-17). At `227a337`: `rule-loss`, `rule loss` and `positive control` 0, control `audit` 9. Method: a fresh agent
>    compares the old and the trimmed file, reading only those two. One rule is deleted from its copy beforehand, so
>    its findings count only if it reports that one.
> 4. **New: a reviewer traces a proposed fix through every state it reads before posting it.** Seven reviewer-side
>    incidents in media_viewer, PR #72 to #91; in one (PR #78) the suggested fix would have moved the wrong file.
>    Absent: `proposed fix` 0 in live `~/.claude` and at `227a337`, over the same 57 files on both sides (`CLAUDE.md`,
>    `WORKFLOW.md`, `POLICIES/`, `rules/`, `TEMPLATES/`, `LANGUAGES/`, content-identical); control `Extract` 28/28.
>    The author's side is covered (`POLICIES/code-review.md:382`, "Evaluate feedback technically"). Target:
>    `POLICIES/code-review.md:366`, reviewer item 5, "Suggest specific fixes".
> 5. **Your row "Record G1's gitignored local-settings edits in media_viewer and Дипломи" (spawned 2026-10-18) can
>    close for media_viewer: noted on 2026-10-27.** Confirmed: `.claude/settings.local.json` has
>    `"disabledMcpjsonServers": ["context7"]`, and `.mcp.json`'s `--api-key` argument is empty. media_viewer's
>    REVIEW-QUEUE now lists its enabled plugins as measured, and a memory note records the local edit.
> 6. **`typescript-lsp` is closed at media_viewer: `drop`** (2026-10-27). Its last vehicle (G3, PR #90) started the
>    server with `typescript@6`, and navigation was correct, but it found nothing grep did not. Its one acted-on
>    diagnostic is one ESLint also reports. It held ~0.6 GB committed per idle session. The plugin is disabled at
>    project scope and the devDependency removed. Your `typescript-lsp` row's media_viewer part can close as
>    `dropped`; goodalex223's part is yours to rule.
