# G4 Cleanup Week Trial Batch — Plan & Execution Log

**Task Reference**: [WEEKLY.md](../WEEKLY.md) Oct 5–9 § G4 (🟤, 3 SP) ← BACKLOG 🟤 `### [2026-09-24] From: Weekly Reviews` ("Trial `claude-security`…") + [REVIEW-QUEUE.md](../REVIEW-QUEUE.md) § 5 Recurring read-out
**Created**: 2026-10-08
**Status**: Execution complete 2026-10-08 — awaiting user approval of the T6 dispositions, PR and merge; decision rule pre-registered below
**Last Updated**: 2026-10-08
**Branch**: `g4-cleanup-week-trial-batch` (from `main` `e590b52`); G5 may share it (WEEKLY G4 header)

This is an execution log, not a spec: the brief is WEEKLY G4's, and the design was approved in chat. It
exists because the trial spans a user-in-the-loop pause (scan Thursday, re-derivation Friday), and because
Extract reads this file's Improvements / Residuals lines.

---

## 1. Task Overview

**Goal**: read out the `claude-security` adopt trial (`keep` / `drop` / `inconclusive`) in REVIEW-QUEUE § 5
against its narrowed question — _do the findings that survive its verifiers also survive our own
re-derivation from source?_ — and run the recurring plugin context-cost & disuse read-out, this time with the
`/plugin` tab's **Not used recently** column filled.

**Success criteria**:

- [x] Plugin installed; always-on cost measured with `claude plugin details` before the scan (~778 tokens)
- [x] One whole-repository scan run by the user, on a clean committed tree (`b7b10ab`, `verified`)
- [x] Every surviving finding re-derived from source, with a verdict and its evidence
- [x] § 5 trial row read out under the pre-registered rule (§ 2 below), not a rule chosen after the results
- [x] Each confirmed finding filed per the disclosure rule (§ 2)
- [x] Leg 2's trigger named, or recorded as best-effort
- [ ] Recurring read-out table in § 5, every disposition user-approved — table written; dispositions are **proposals** and the `/plugin` Not-used-recently reading arrived after the first push (one plugin flagged)

---

## 2. Analysis

### Decisions made at design time (user, 2026-10-08)

1. **Disclosure — severity-gated.** The repo is **public** (`GoodAlex223/media-viewer`, `gh repo view`
   2026-10-08). Low/Medium confirmed findings get a full 🟤 BACKLOG entry. High/Critical ones get a public
   **stub** (component, vulnerability class, severity — no exploit path) plus a 🔴 TODO fix item; full
   detail goes public only once fixed. The `CLAUDE-SECURITY-<ts>/` report stays local (it self-`.gitignore`s).
   The § 5 read-out judges the verifier in aggregate and carries no exploit recipes.
2. **Scan model — Opus 5.5, in this session.** The plugin's `scan-researcher`, `scan-verifier`,
   `patch-generator` and `patch-verifier` agents are `model: inherit` at `effort: xhigh` (only
   `scan-inventory`, `scan-loader`, `scan-redactor` and `explore` pin Sonnet), so the session model **is** the
   scan model. Running it on Opus tests the plugin as it would actually be used: a `drop` is then not
   attributable to a weaker model, and a `keep` transfers. Our check is stronger **by method** — first-hand
   from source, reachability included, probes where cheap — not by model tier.
3. **Scope / effort — whole repository at `medium`.** 257 tracked files is "small" by the plugin's own size
   gauge (`jobs/scan-codebase.md`: "a few hundred files or fewer"), for which it recommends the whole
   repository at `medium` with `focus: null`. Unscoped is also what turns on its completeness check
   (`coverage.completenessCheckOutcome`), which the keep-on-clean criterion relies on.

### Pre-registered decision rule (fixed before the scan — this commit precedes it)

Each surviving finding gets exactly one verdict from our re-derivation:

- **confirmed** — the defect is real and the stated path to exploitation exists;
- **confirmed, mechanism corrected** — the defect is real, but part of the stated path is wrong (counts as
  holding — the pr-review-toolkit lesson is to record the correction, not to discard the defect);
- **overturned** — no real path to exploitation (a false positive the panel let through).

| Outcome          | When                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **keep**         | ≥ 80% of surviving findings hold **and** no High/Critical finding is overturned; **or** the scan is clean **and** its Coverage section accounts for `main.js`, `preload.js` and the IPC handlers |
| **drop**         | otherwise — including a clean scan whose Coverage leaves any of those three unaccounted for                                                                                                       |
| **inconclusive** | the renderer stamps `unverified`, or researchers did not return (`researchersReturned < researchersDispatched`) — the plugin did not run as designed; re-run once before reading out              |

Severity is ours, not the report's. Disagreements on severity are recorded as a **secondary** measure (the
plugin claims severity never exceeds what verification earned — `coverage.severityLowered`), never as a
criterion. Out of the question by design: recall (what the scan missed).

### Assumptions

- The Workflow tool is available in the scan session (it is in this one).
- `python3` resolves on `PATH` (3.13.5 measured 2026-08-30; the plugin needs 3.9+).
- The plugin version in the local catalog clone (`0.12.0`, dated 2026-10-07) is what installs. The
  2026-09-24 source verification read an **earlier** copy, so its claims are re-checked only where a
  finding's verdict depends on them.

### Edge cases

- **G2's preload guard fires inside the scan**: any scan agent's Bash command naming `preload.js` hits the
  `Bash(*preload.js*)` ask rule + `guard-preload-bash.js` — the user approves read-only ones, denies writes.
  Count the prompts: it is also the first evidence of the guard firing inside workflow subagents.
- **Dirty stamp**: the install edits committed `.claude/settings.json` — commit it before the scan.
- **A finding in `vendor/`** (third-party `jxl-oxide-wasm`) — re-derive reachability from our call sites; a
  fix would be an upstream/version matter.
- **A finding in `tests/` or `scripts/`** — not shipped code; judge reachability honestly (likely low).
- **A finding whose precondition is renderer compromise** — a chain; verdict depends on whether the first
  link is real, and the note says which link carries it.
- **Scan fails / Workflow refused / no report** — recorded; `inconclusive`, re-run once.
- **More than ~6 surviving findings** — re-derivation is ~0.25–0.5 SP each; stop and re-scope with the user
  (global abort condition: scope over 2×).

### Risks

- Per-scan token cost is unmeasured in advance (Opus at `xhigh` per researcher/verifier). Recorded after.
- Nondeterminism: one scan is one sample. The read-out says so.

---

## 3. Implementation Plan

### Files Affected

- `.claude/settings.json` — `enabledPlugins` gains `claude-security@claude-plugins-official` (project scope)
- `docs/planning/plans/2026-10-08_g4-cleanup-week-trial-batch.md` — this log
- `docs/planning/REVIEW-QUEUE.md` — § 5 trial row read-out, stocktake update, new recurring read-out table
- `docs/planning/BACKLOG.md` — the trial entry (leg 1 result, leg 2 pending), one entry per confirmed finding
- `docs/planning/TODO.md` — a 🔴 fix item per High/Critical finding (if any)
- `docs/planning/WEEKLY.md` — G4 items (closeout, after merge)
- Not committed: `CLAUDE-SECURITY-<ts>/` (self-ignored report directory)

### Model and Effort

Scan: Opus 5.5 (inherited by the plugin's agents at `xhigh`). Re-derivation: Opus · `high`. Read-outs and
filing: this session. **Corrects WEEKLY's first guess** ("start Sonnet · `medium` — the scan runs under the
plugin's own agents"), whose premise is half-false (see Decision 2). SP re-estimate: 3 holds up to ~6
surviving findings.

### Implementation Steps

- [x] **T1 — Install & measure.** `claude plugin install claude-security@claude-plugins-official --scope
      project` from a lowercase `c:` cwd (the 2026-09-24 drive-casing split); `claude plugin details` →
      always-on figure. **Threshold**: disable between scans if > ~500 always-on tokens (the 2026-09-24 table's
      line: ~2,033 unused → disabled; ~838 used daily → kept). Commit the settings change + this log **before**
      the scan. User runs `/reload-plugins`.
- [x] **T2 — Scan (user).** In this session, Opus 5.5, auto mode, clean tree:
      `/claude-security scan the whole repository at medium effort — I understand it may take a while and use a lot of tokens`.
      Record: wall-clock, any token figure the harness reports, guard prompts, the stamp filename,
      `verification.status`, the Coverage fields.
- [x] **T3 — Re-derive (Opus · `high`).** Per surviving finding: read the cited code at the scanned commit;
      trace source → sink; who can supply the input (renderer via the preload bridge, a crafted media file, a
      folder/file name); check its preconditions against the real Electron config (`contextIsolation`,
      `sandbox:false`); probe where cheap, with a sentinel. Verdict + evidence. Then audit Coverage:
      `completenessCheckOutcome`, `skippedComponents`, whether `main.js` / `preload.js` / the IPC handlers
      were read.
- [x] **T4 — Read-out & filing.** § 5 trial row under the rule above; stocktake update; findings filed per
      Decision 1.
- [x] **T5 — Leg 2 trigger.** Planning-time vehicle: the BACKLOG trial entry stays open as "leg 2 pending",
      and the first weekly plan that schedules a group touching `main.js` or `preload.js` puts
      "`/claude-security` Scan changes before merge" in that group's acceptance. Record that the plugin's own
      push/PR tip disables itself once the menu has opened (`hooks.py` `TipState.spent`). A file-specific
      `gh pr create` hook only if the trial reads `keep` — filed as a 🟤 candidate conditional on that.
- [~] **T6 — Recurring read-out** _(table written; two user inputs outstanding)_.** After T1, so `claude-security` is in the table: `claude plugin list
      --json` + `claude plugin details` per plugin loading in a media_viewer session; check for plugins a
      claude.ai sync added since 2026-09-24; the user reads `/plugin` → Installed → **Not used recently**
      (terminal session). New dated table in § 5; dispositions user-approved.

---

## 4. Implementation Log

### [2026-10-08] — PHASE: Planning

- Brainstorm (bounded path) → design approved in chat. Measured at planning: plugin not installed at any
  scope (`claude plugin list --json`); catalog copy `0.12.0`; repo public; 257 tracked files (150 under
  `docs/`, 53 `tests/`, 32 root); the plugin's push/PR tip is spent once the menu opens or after 5 tips
  (`hooks.py`: `spent = opened or len(shown) >= MAX_TIPS`; `banner()` sets `opened`), unless
  `CLAUDE_SECURITY_SCAN_TIP=always` — rejected as noise (fires on every push, docs-only included).

### [2026-10-08] — PHASE: T1 install & measure

- Installed `claude-security@claude-plugins-official` **0.12.0**, project scope, from a lowercase `c:` cwd
  (`cmd //c "cd /d c:\… && claude plugin install …"`); `claude plugin list --json` records
  `projectPath: c:\Users\alexm\Projects\media_viewer`, enabled, installed `2026-10-08T08:05:33Z`.
- **Always-on cost: ~778 tokens** (`claude plugin details`, Claude Code 2.1.289): the skill ~150 plus nine
  agent descriptions ~50–140 each. Four hooks (`UserPromptExpansion`, `PostToolUse`, `PostToolUseFailure`,
  `PermissionRequest`) are labelled "harness-only — no model context cost" — a floor, per the 2026-09-24
  finding that the estimator undercounts hooks. On-invoke: ~990–2.8k per component.
- **Above the ~500 threshold → disable between scans.** Not disabled yet: it stays enabled through the
  read-out in case an `inconclusive` result needs the one re-run; disabled at the end of T4, and leg 2's
  vehicle text then has to say "enable, then scan".
- The CLI rewrote the committed `.claude/settings.json` with 2-space indentation (the repo's Prettier is
  4-space); lint-staged restores it on commit. Every `claude plugin` CLI write to that file will do the same.
- Settings change + this log committed **before** the scan, so the stamp names a clean commit and the
  decision rule above provably predates the results.

### [2026-10-08] — PHASE: T2 scan

- **Entry-point slip (usability)**: the user's first attempt ran `/claude-security:scan` — the plugin's
  internal **workflow**, which autocomplete offers beside the skill — with the request as free text. The
  workflow takes structured args (`scanRoot`, `runDir`, …) that the skill's scan job prepares, and its own
  description says a typed command must not call it; nothing was started. The second attempt used
  `/claude-security:claude-security …` and went straight to the scan (job, shape, effort and cost all named,
  so no sub-menu and no confirmation).
- Scan: report dir `CLAUDE-SECURITY-20261008-084826/` (self-ignored; `git status` clean after delivery).
  Revision stamp `CLAUDE-SECURITY-REVISION-b7b10abe01c6.json` — **commit `b7b10ab`, `dirty: false`**;
  `verification.status: verified`.
- **Cost**: 53 agents (0 errors, 1 empty result), **3,630,496 subagent tokens**, 675 tool uses,
  **1,277 s (~21 min)** wall-clock — from the Workflow completion notice. Plus the redactor (71,698 tokens).
- **Coverage**: `completenessCheckOutcome: checked` (8/8 top-level dirs scanned or skipped); 5 components
  (main-process = `main.js`, `logger.js`, `media-formats.js`, `preload.js`; renderer-ui; workers-ml;
  vendored-jxl-decoder; build-scripts-hooks); skipped `tests/`, `docs/`, `.superpowers/` with reasons;
  17/17 researchers returned (16 component × category + 1 breadth sweep); research tree check 41 files in
  components, 37 read, 4 declared not-reached, **0 unaccounted**; 1 verification run; no lost candidates,
  no adversarial casualties, **no severity lowered**. `memory-and-unsafe` lens pruned for 4 components
  (managed-language decision), kept for the vendored decoder.
- **Results**: 7 findings, all **3/3** panel votes — 4 High, 1 Medium, 2 Low. **5 distinct issues reported as 7**:
  two pairs are same-sink duplicates the pipeline did not merge. All cited lines checked against `b7b10ab` —
  each lands on its quoted snippet. Per-finding detail lives only in the local, self-ignored report
  (Decision 1: nothing committed about the High findings beyond a stub).
- **G2 guard did not gate the scan's agents** (side finding): a transcript scan of the 55 subagent
  transcripts (sentinel printed; 197 `Bash` calls) found **18 `Bash` commands naming `preload.js`, all
  executed with real output** (`is_error: false`) — and the user saw **no** prompt. All 18 were read-only
  (`grep`, `cat`, `sed`, `wc`, `git log`). So neither the `Bash(*preload.js*)` ask rule nor
  `guard-preload-bash.js` gated Workflow-tool subagents. Not discriminated: whether the hook ran and its
  `ask` was auto-resolved, or never ran. → BACKLOG 🟤 + a correction to CLAUDE.md's "Not covered" list.

### [2026-10-08] — PHASE: T3 status + session handoff

- **T3 re-derivation by reading: done for all five distinct issues** (F1/F3, F2, F4, F5, F6/F7) against
  `b7b10ab` — each source-to-sink path was traced in the code, with no check between them. Verdict wording and
  the § 5 read-out are **not yet written**. The planned runtime probe was **dropped**: this session tripped
  the model's cyber safeguard during re-derivation, and again on later turns, including one that carried
  no security content. Deviation from "probe where cheap" — the decision rule judges by re-derivation from
  source, so the probe was optional. **Trial observation for the read-out**: acting on the plugin's output
  inside an Opus 5.5 session can trip the safeguard and stall the session.
- **Continue in a fresh session** on this branch (working tree uncommitted on purpose — see Decision 1:
  public text about High findings stays at stub level). The local report `CLAUDE-SECURITY-20261008-084826/`
  holds the detail.

### [2026-10-08] — PHASE: T3 verdicts + T4 read-out (stub level — Decision 1)

Re-derivation was **by reading, against `b7b10ab`**, in two passes (the first session, then this one re-reading
every cited sink and the code path into it before writing a verdict). The runtime probe was dropped (above).
Each verdict names only component, class and severity.

| Scan ID(s)  | Component                    | Class                          | Report sev. | Our sev. | Verdict                                                                                            |
| ----------- | ---------------------------- | ------------------------------ | ----------- | -------- | -------------------------------------------------------------------------------------------------- |
| F1 + F3     | renderer — UI modal          | HTML injection (CWE-79)        | High        | High     | **confirmed** — one sink reported twice                                                            |
| F2          | main process — file IPC      | missing authorization (CWE-862) | High        | High     | **confirmed** — an amplifier: reachable only after a renderer foothold, which F1/F3/F4/F5 supply   |
| F4          | renderer — UI modal          | HTML injection (CWE-79)        | High        | High     | **confirmed** — the stated path to the sink is longer than F1's; each hop was traced in source      |
| F5          | renderer — UI modal          | HTML injection (CWE-79)        | Medium      | Medium   | **confirmed**                                                                                      |
| F6 + F7     | main process — tier moves    | path traversal (CWE-22)        | Low         | Low      | **confirmed** — one sink reported twice; impact limited to media-extension files on the same volume |

- **Surviving findings: 7 reported, 5 distinct. 5/5 distinct issues hold (7/7 as reported); 0 overturned; 0
  mechanism-corrected.** Severity agrees on every row — the secondary measure shows no inflation.
- **Common root, stated once at stub level**: untrusted input is not validated or encoded at the
  boundaries the findings name, and the main process does not authorize what the renderer asks of it. Checked
  first-hand in source — properties of the code, not of the scan. Specifics stay in the local report.
- **Coverage audit**: `completenessCheckOutcome: checked`; 17/17 researchers returned; `main.js`, `preload.js`
  and the IPC handlers sit in the `main-process` component, which was read; no `unverified` stamp.
- **Pre-registered rule applied**: ≥ 80% hold (100%) **and** no High overturned (0 of 3 distinct) → **`keep`**.
  Not `inconclusive`: stamp `verified`, 17/17 returned.
- **What the verdict does not say**: one sample, one model (Opus 5.5), precision only — recall is out of the
  question by design, and our own check is by reading, not by probe. Precision gap worth carrying: the
  pipeline's dedup missed two same-sink pairs, so its "7 findings" overstates distinct issues by 40%.
  Cost: ~3.6M subagent tokens (+71.7k redactor), ~21 min, 53 agents — about one Cleanup Week's token budget
  for a first scan of a 257-file repo; a diff scan will be far cheaper.

**Filing (Decision 1)**: High → public **stubs** + 🔴 TODO fix item (two stubs: the renderer injection sinks F1/F3/F4, and
the main-process file-IPC authorization F2; one 🔴 TODO item covers both); Medium/Low → 🟤 BACKLOG entries at component/class/fix level, no
payload shapes — F5 shares its class with the unfixed High findings, so its entry is held to the same stub rule
until the group fix lands. The local report `CLAUDE-SECURITY-20261008-084826/` keeps the full text.

### [2026-10-08] — PHASE: T6 measurements (partial — the `/plugin` tab reading is still the user's)

Plugins loading in a media_viewer session (`claude plugin list --json`, `claude plugin details`, Claude Code
2.1.289; last use from `~/.claude.json` `skillUsage`):

| Plugin | Scope | State here | Always-on | Last skill use |
| ------ | ----- | ---------- | --------- | -------------- |
| `superpowers` | user + project | enabled | ~840 | 2026-10-08 |
| `claude-security` | project | enabled (new, 2026-10-08) | ~778 | 2026-10-08 |
| `claude-md-management` | user | enabled | ~177 | 2026-06-17 |
| `code-review` | user | enabled | ~22 | 2026-10-07 |
| `playwright` | user | enabled | ~0 (MCP) | — (MCP) |
| `security-guidance` | user | enabled | ~0 (hooks) | — (hooks) |
| `pr-review-toolkit` | project | disabled (09-24) | ~2,035 | — |
| `hookify` | user | disabled here (local, 09-24) | ~294 | never |
| `claude-code-setup` | user | **disabled at user scope — changed since 09-24** (was keep) | ~141 | 2026-08-27 |
| `playground` | user | **disabled at user scope — changed since 09-24** (was keep) | ~93 | 2026-03-21 |
| `context7` (plugin) | user | disabled here (local, 09-24) | ~0 | — |

- Enabled always-on total ≈ **1,817** (09-24 "after": ≈ 1,501) — `claude-security` added +778, while
  `claude-code-setup`, `playground` and `feature-dev` stopped loading.
- **`feature-dev` is no longer installed at user scope** (09-24: keep, ~238; last skill use 2026-09-12) —
  removed outside this repo's audit. Same for the two user-scope disables above: three changes to the
  09-24 dispositions that nothing here recorded.
- **Synced plugins: none arrive now.** The sync bucket's `manifest.json` lists `"plugins": []` (updated
  2026-10-08), so no claude.ai sync has added plugins since 09-24 — and the eight `"<name>@synced": false`
  entries in `~/.claude/settings.json` now point at plugins the sync no longer delivers (dangling).
- `skillUsage` counts `claude-security:scan` once — the entry-point slip (T2) registers as a use.
- **Still needed from the user**: `/plugin` → Installed → **Not used recently** (a terminal session).

---

### [2026-10-08] — PHASE: T5 leg-2 trigger, T6 table, filing

- **Leg 2's trigger is named, and stronger than the planning-time vehicle**: the 🔴 TODO fix group for these
  findings changes `main.js` (and `preload.js` if the bridge is narrowed) by construction, so its acceptance
  already carries "`/claude-security` Scan changes on the fix diff". The general norm (first plan scheduling a
  `main.js`/`preload.js` group adds the line) stays in the BACKLOG trial entry for later groups. The
  file-specific `gh pr create` hook is filed as a 🟤 candidate (the trial read `keep`), to be built only if the
  norm slips once.
- Filed: 7 BACKLOG 🟤 entries under `[2026-10-08] From: G4 trial batch` (three High/Medium stubs, one Low, the
  guard gap, the conditional hook, upstream-feedback note), 1 🔴 TODO item, REVIEW-QUEUE § 5 trial row + stocktake +
  2026-10-08 plugin table, CLAUDE.md "Not covered" correction (Workflow subagents).
- **T6 dispositions are proposals**: the plugin table's last column says so. Not applied: no plugin was
  disabled, including `claude-security` (the plan said disable at end of T4 — held for the user's approval since
  it edits committed `.claude/settings.json` and leg 2 needs it enabled).

---

## 5. Key Discoveries

- **The plugin's scan model is the session's model.** `model: inherit` on the four agents that do the
  research, verification and patching — WEEKLY's "start Sonnet" premise did not hold.
- **The plugin's own leg-2 nudge cannot serve as a trigger as shipped**: the push/PR tip is designed as
  onboarding and goes quiet the first time `/claude-security` is opened.

---

## 6. Future Improvements

- 🟤 Fix the confirmed findings — the TODO 🔴 group (also leg 2's vehicle).
- 🟤 Decide whether the `preload.js` guard gap is "hook never ran" or "ask auto-resolved" (probe in a throwaway
  Workflow) — BACKLOG entry carries the method.
- 🟤 Build the file-specific `gh pr create` leg-2 hook only if the norm slips once.
- 🟤 A runtime-probe step for the next re-derivation, done in a session that will not trip the cyber safeguard
  (e.g. a Sonnet session with the finding text already redacted to a sink location) — the probe was dropped here.

## Residuals for Extract

- Plugin dispositions (T6) await the user's approval and the `/plugin` Not-used-recently reading; until then
  the 2026-10-08 table is proposals. Extract carries no `[x]` for the recurring read-out's "every disposition
  user-approved" box until then.
- `claude-security` is still enabled in `.claude/settings.json` (proposed: disable between scans).
- WEEKLY.md G4 items and BACKLOG trial-entry closure: closeout, on `main`, after the merge. The trial entry
  stays `[ ]` (leg 2 pending) on purpose.

---

## 9. Closeout (after the merge, on `main`)

Extract → Archive → Transition → Commit → Capture learnings (global close-out rule).
