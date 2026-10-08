# G4 Cleanup Week Trial Batch — Plan & Execution Log

**Task Reference**: [WEEKLY.md](../WEEKLY.md) Oct 5–9 § G4 (🟤, 3 SP) ← BACKLOG 🟤 `### [2026-09-24] From: Weekly Reviews` ("Trial `claude-security`…") + [REVIEW-QUEUE.md](../REVIEW-QUEUE.md) § 5 Recurring read-out
**Created**: 2026-10-08
**Status**: In progress — design approved in-chat 2026-10-08 (bounded path: no spec); decision rule pre-registered below
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
- [ ] One whole-repository scan run by the user, on a clean committed tree
- [ ] Every surviving finding re-derived from source, with a verdict and its evidence
- [ ] § 5 trial row read out under the pre-registered rule (§ 2 below), not a rule chosen after the results
- [ ] Each confirmed finding filed per the disclosure rule (§ 2)
- [ ] Leg 2's trigger named, or recorded as best-effort
- [ ] Recurring read-out table in § 5, every disposition user-approved

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
- [ ] **T2 — Scan (user).** In this session, Opus 5.5, auto mode, clean tree:
      `/claude-security scan the whole repository at medium effort — I understand it may take a while and use a lot of tokens`.
      Record: wall-clock, any token figure the harness reports, guard prompts, the stamp filename,
      `verification.status`, the Coverage fields.
- [ ] **T3 — Re-derive (Opus · `high`).** Per surviving finding: read the cited code at the scanned commit;
      trace source → sink; who can supply the input (renderer via the preload bridge, a crafted media file, a
      folder/file name); check its preconditions against the real Electron config (`contextIsolation`,
      `sandbox:false`); probe where cheap, with a sentinel. Verdict + evidence. Then audit Coverage:
      `completenessCheckOutcome`, `skippedComponents`, whether `main.js` / `preload.js` / the IPC handlers
      were read.
- [ ] **T4 — Read-out & filing.** § 5 trial row under the rule above; stocktake update; findings filed per
      Decision 1.
- [ ] **T5 — Leg 2 trigger.** Planning-time vehicle: the BACKLOG trial entry stays open as "leg 2 pending",
      and the first weekly plan that schedules a group touching `main.js` or `preload.js` puts
      "`/claude-security` Scan changes before merge" in that group's acceptance. Record that the plugin's own
      push/PR tip disables itself once the menu has opened (`hooks.py` `TipState.spent`). A file-specific
      `gh pr create` hook only if the trial reads `keep` — filed as a 🟤 candidate conditional on that.
- [ ] **T6 — Recurring read-out.** After T1, so `claude-security` is in the table: `claude plugin list
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

---

## 5. Key Discoveries

- **The plugin's scan model is the session's model.** `model: inherit` on the four agents that do the
  research, verification and patching — WEEKLY's "start Sonnet" premise did not hold.
- **The plugin's own leg-2 nudge cannot serve as a trigger as shipped**: the push/PR tip is designed as
  onboarding and goes quiet the first time `/claude-security` is opened.

---

## 6. Future Improvements

_(minimum 2 before Extract — filled during execution)_

## Residuals for Extract

_(filled during execution)_

---

## 9. Closeout (after the merge, on `main`)

Extract → Archive → Transition → Commit → Capture learnings (global close-out rule).
