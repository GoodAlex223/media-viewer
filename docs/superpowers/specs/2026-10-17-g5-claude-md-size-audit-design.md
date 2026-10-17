# G5 `CLAUDE.md` Size Audit — Design Spec

**Task Reference**: WEEKLY.md Oct 12–16 § G5 (🟡, 3 SP → **~4.5 SP**, see § 10) ← BACKLOG 🟡 [2026-09-21] "`CLAUDE.md` is at 212 lines, past the ~200 threshold…" and its 🟤 twin [2026-07-03] "CLAUDE.md is over its own ~200-line soft cap"
**Created**: 2026-10-17
**Status**: Approved by the user, brainstormed section by section 2026-10-16–17 (decisions D1–D6, § 3). **Amended while writing, by user ruling, before the user's review of this file**: the warning measures bytes only, its large-commit threshold is 500 bytes, and § Maintenance's audit trigger moves from "~200 lines" to the byte trigger (D2, § 2.8, § 6). Measuring the spec's own claim showed most growth came in commits under 1 KB, and a trim landing above 200 lines would have made a line trigger fire on every growing commit. **Written spec reviewed and approved by the user 2026-10-17. Amended at plan review, by user ruling the same day**: `BYTE_TRIGGER` headroom 10% → 25% (§ 6.2), after a side-agent note that ~4 KB of room would be crossed within days; plan [2026-10-17_g5-claude-md-size-audit.md](../../planning/plans/2026-10-17_g5-claude-md-size-audit.md).
**Branch**: `g5-claude-md-size-audit` (from `main` @ `506e041`; one PR)
**Runbook**: `docs/prompts/claude-md-audit.md` in `claude-code-universal-config` (its policy: `docs/prompts/claude-md-content-policy.md` there)

---

## 1. Goal

Bring the project `CLAUDE.md` back to its own standard: durable rules only, every line something an agent must see before acting. Then stop it from growing back.

**Success**:
- every sentence left in `CLAUDE.md` is a rule or the one reason that makes a rule followable;
- no rule is lost: each removed sentence is recorded as deleted history, replaced by a pointer, merged into its one home, or readable from the code, and an independent check with a positive control confirms nothing else went missing;
- a commit that grows `CLAUDE.md` noticeably gets a warning at commit time;
- size is reported in lines **and** bytes against the baseline below. There is no target number: the content policy states the size as a condition, not a figure.

---

## 2. Findings that shaped the design

All measured 2026-10-16 on `main` @ `506e041` (`wc -lc`, and `awk` per `##` section, which counted bytes including newlines in this locale; the sections plus the 117-byte preamble sum to the `wc -c` total).

1. **The file grew 30% in bytes in one week, and the line count hid it.** 236 lines / 64,203 bytes, against the 216 lines / 49,544 bytes recorded on the 🟡 entry on 2026-10-09. G1–G4 each added rules at closeout.
2. **The bulk sits in two sections.**

   | Section | Lines | Bytes |
   |---|---:|---:|
   | Overview | 11 | 472 |
   | Build & Development Commands | 13 | 1,521 |
   | Architecture | 42 | 5,460 |
   | Code Conventions | 35 | 7,250 |
   | Backlog Intake Rules | 27 | 1,466 |
   | **Detected Patterns** | 60 | **29,691** |
   | **Git Insights** (the Active gotchas list) | 31 | **15,723** |
   | Best Practices | 10 | 2,164 |
   | Maintenance | 3 | 339 |

   The ten longest lines run 1.2–3.3 KB each (UI Components, the file-op guard, tournament persistence, Recently opened folders, the training-vector cache, shortcut versioning, the CLIP-lease gotcha, `resetMlModel()`, the preload security bullet, Like-or-skip). About 16k tokens load on every turn (bytes ÷ 4, an estimate).
3. **Most of that bulk is not rules.** It is provenance (which PR or review round found something, measurement dates, "shipped violated for most of the branch") and feature walk-throughs (UI detail the code states, such as a row label or a `max-height` value).
4. **`docs/ARCHITECTURE.md` is not a landing place.** Its footer reads *Last Updated: 2026-02-05*, and BACKLOG already records its file tree as stale. Moving text there would mix fresh text into a stale file.
5. **Path-scoped rules would save less here than in the sibling repo.** Almost every pattern concerns `media-viewer.js`, which nearly every code session reads, and a rule attaches only on a Read of a matching file. The saving would land mainly in docs and planning sessions. `.claude/rules/` does not exist yet.
6. **Backlog Intake Rules duplicates BACKLOG's 📌 Process Rules**, except for the required entry shape (`- [ ] **Short title** — body…`), which appears nowhere else. The user's global `~/.claude/rules/planning-closeout.md` already loads with any planning doc read through the Read tool and points at 📌 as the authority. Only an entry added by a shell command without reading BACKLOG would miss both.
7. **`.mcp.json`** holds only the `context7` server and is untracked. Its key stays, per the user's 2026-06-16 ruling (memory: do not re-flag it).
8. **Most of the growth came in small commits.** 17 commits touched `CLAUDE.md` from 2026-10-09 to `506e041` (byte size of each commit's `CLAUDE.md` minus its parent's). Three added more than 1 KB: G1's closeout (+3,918), G3's docs commit (+2,441) and G2's fix wave (+1,174). The other 14 added 132–848 bytes each; G4 alone made seven of them, about 4.2 KB in all. Ten of the 17 added more than 500 bytes. Lines rose 9% over the week while bytes rose 30% (§ 2.1), because each rule is one line that grows.

---

## 3. Decisions

- **D1 — Non-rule text: mixed.** Delete pure history; git, DONE.md, the specs and the archived plans already hold it. Keep one "why" clause where it makes a rule followable. Reduce a feature walk-through to its contract plus a pointer to the feature's spec.
- **D2 — Regrowth: an authoring rule plus a non-blocking warning, measured in bytes.** A written trigger did not hold (§ 2.1), and a line count cannot see one-line bullets growing (§ 2.8). The warning therefore uses bytes only (§ 6), and § Maintenance's audit trigger moves from "~200 lines" to the warning's byte trigger. That departs locally from the sibling content policy's ~200-line trigger, for the reason in § 2.8; G6's outbound propagation reports it there (§ 10).
- **D3 — Approach A: trim in place, one commit per `##` section**, with a disposition table per section in the plan and an independent rule-loss check at the end. Rejected: B, a rewrite from a rule inventory (a whole-file diff and the highest risk of losing a rule silently); C, regrouping by path for the migration (the largest diff, partly the out-of-scope work, and the blocks do not map cleanly onto globs, § 2.5).
- **D4 — Backlog Intake Rules becomes a three-line pointer**: read 📌 Process Rules before filing; route user-raised → 🔵, Claude-surfaced → 🟤, periodic → 🟡; the entry shape. The entry-shape rule is copied into 📌, so the authoritative section is complete. It was user-authored (a former `<!-- MANUAL -->` section); the user approved the cut.
- **D5 — The path-scoped-rules migration stays out of scope** (WEEKLY G5). G5 produces the recommendation: which blocks would move, under which `paths:` globs, and the caveat in § 2.5.
- **D6 — Model.** The trim runs on Opus · `medium`, not the WEEKLY's Sonnet: deciding "why" versus history sentence by sentence is where a rule gets lost. The warning script and its tests can go to a Sonnet · `medium` implementer, since the plan will hold their complete code.

---

## 4. The passes, in order

Each maps to a runbook step.

1. **Stop-gate and baseline** (runbook 0–1). The file fails the gate, so the audit proceeds. Record lines, bytes, bytes per section and the ten longest lines (§ 2 is that record).
2. **`/claude-api prompt-audit`, read-only, first** (the WEEKLY's extra pass). Try it through the bundled `claude-api` skill. If the subcommand is not reachable from the session, the user runs `/doctor prompt-audit`. Its findings (wording written for older models) are applied during the per-section trims, so no section is edited twice.
3. **`/claude-md-improver`, report only** (runbook 5 names it the shrink engine). Its quality report is one more input. Its own rewrite is not used, because that would be approach B.
4. **Stale references and renamed concepts** (runbook 3).
   - Every path and backticked symbol in `CLAUDE.md` is checked against `git ls-files` and the code. A name of deleted code that survives only as history is removed under § 5.
   - Concept-vocabulary sweep: list the conventions renamed or retired since the 2026-06-16 audit, starting from the AUTO-MANAGED markers, the old "never commit `.claude/`" rule (now an allow-list), the deferred compare refresh and the `update`/`reverseUpdate` worker messages, then completed from `git log` and DONE.md. Sweep each, in every phrasing family including the anti-pattern's, across `CLAUDE.md`, `PROJECT.md`, `README.md`, `docs/README.md`, `docs/PROJECT_CONTEXT.md` and `docs/planning/{GOALS,ROADMAP,MILESTONES}.md`. Report the vocabulary with the result.
   - A wrong statement in a live doc is corrected. A stale derived number stays with 🟤 [2026-09-02] "Sweep the repo's existing restated derived counts" (e.g. `PROJECT.md`'s "~9,400 lines"); it is listed, not fixed. `docs/ARCHITECTURE.md` is not in the sweep (§ 2.4).
5. **`.mcp.json`** (runbook 4). Confirm there is no `server-memory` server. Leave the key (§ 2.7).
6. **Trim** (§ 5), **regrowth guard** (§ 6), **verification** (§ 7).

---

## 5. Trim rules

Every sentence gets one label.

| Label | Action |
|---|---|
| **Rule** | Keep; tighten the wording. |
| **Why** | Keep one clause where it makes the rule followable. Drop further reasons. |
| **History** | Delete: PR and review-round names, measurement dates, "found by…", "until G3 this made…". **Exceptions**: keep a release name the rule depends on (e.g. "folders saved before G1 are re-confirmed once"); keep a caveat about how far a claim was verified when it changes what an agent would do (e.g. the docs not saying how a hook's `ask` behaves in `dontAsk`). |
| **Walk-through** | Reduce to the contract (must / must not) plus `Design: [spec](…)`. Drop UI detail the code states. |
| **Duplicate** | One home; elsewhere at most "see § X". |
| **Readable from the code** | Drop constants and file-list detail the code makes obvious, mainly in the Architecture tree's per-file blurbs. |

**Constraints**:
- **No heading renames.** BACKLOG and plans cite "CLAUDE.md § Cache Management", "§ Async Patterns" and "§ Active gotchas"; those references must keep resolving. "Git Insights" keeps its name and its one-line pointer.
- **One commit per `##` section, in file order.** Each commit's disposition table is logged in the plan before the commit.
- **No line splitting or merging to move the line count.** Each bullet is one line; merges happen only for duplicates.
- **Expected landing (estimate)**: about 38–44 KB; lines probably still about 210–225, because each bullet is one line. That is why the warning and the audit trigger use bytes (D2, § 6).

---

## 6. Regrowth guard

### 6.1 Authoring rule

§ Maintenance gains one sentence: a new rule is one sentence plus at most one "why"; history goes to DONE.md or the spec; extend an existing bullet rather than add a near-duplicate.

Its audit trigger changes from "quarterly or whenever it crosses ~200 lines / its tooling materially changes" to: quarterly, when the pre-commit size warning reports the byte trigger crossed, or when its tooling materially changes. One clause says why lines are not the trigger here (each rule is one line, so lines barely move while bytes grow). § Maintenance names `scripts/check-claude-md-size.js` as the owner of the figures and states none itself, so no figure is maintained in two places.

### 6.2 `scripts/check-claude-md-size.js`

Modelled on `scripts/check-docs-index.js`: pure, unit-tested functions plus a CLI block under `require.main === module`, no runtime dependencies.

- **Runs only when `CLAUDE.md` is staged** (`git diff --cached --name-only`). It compares the staged blob (`git show :CLAUDE.md`) with HEAD's (`git show HEAD:CLAUDE.md`), so it judges what the commit will contain. A missing HEAD copy counts as empty. A staged deletion is silent. **Amended at review (PR #82, #3 and #4)**: the pathspec is root-relative (`:/CLAUDE.md`), so a run from a subdirectory measures the same file; growth is per commit, against HEAD, so growth spread over `--amend`s (HEAD is then the commit being amended) or over several small commits is never summed, and the trigger is the backstop for both.
- **Measures** bytes as UTF-8 length (`Buffer.byteLength`) and lines as `wc -l` counts them (newline characters).
- **Warns** (stderr) in either case. Both triggers are in bytes; lines are reported, never judged (D2).
  1. **A large commit**: staged bytes − HEAD bytes > `GROWTH_WARN_BYTES` (500 — more than one rule plus its reason, the § 6.1 authoring rule's shape; 10 of § 2.8's 17 commits would have warned, against 3 at 1,000).
  2. **Creep past the trigger**: the staged file is past `BYTE_TRIGGER` **and** the commit grows it at all. A commit that shrinks the file never warns. `BYTE_TRIGGER` is fixed in the plan once the trim lands: the trimmed size plus 25%, rounded up to the next 1,000 bytes. 25%, not 10% (amended at plan review): at a ~40 KB landing, 10% leaves ~4 KB, which even a third of the 2026-10-09 → 10-16 pace (14.7 KB in a week, in the old style) would use up in under a week, after which every growing commit would warn. 25% leaves about one Cleanup-Week cycle of growth at that guessed rate, so the audit it calls for can ride the next Cleanup Week. The real rate under the § 6.1 authoring rule is unmeasured; close-out files a 🟤 entry to measure it at Cleanup Week #5 and re-set the trigger at that audit. **Amended after implementation (user ruling 2026-10-17)**: the trim landed at 58,582 bytes (final, after the PR #82 review), not ~40 KB, so 25% would have given ~15 KB of room and a 74,000-byte trigger above the 64 KB file that started this audit. The trigger keeps the room the 25% was sized for instead: the landing plus ~10 KB, rounded up — **69,000 bytes**.
- **The message** gives the change in bytes and lines, the new totals, the trigger crossed and the authoring rule; on case 2 it adds that the file is due for an audit (§ 6.1). **Amended at review (PR #82, #9)**: it points to the authoring rule in § Maintenance instead of restating it, so the rule keeps one home and no copy can drift.
- **Never blocks.** The CLI body is wrapped so it always exits 0. A git failure prints `could not measure CLAUDE.md` to stderr, because silence would look the same as a pass. The hook line also ends in `|| true`, so not even a crash can fail the commit. No `SKIP` token: there is nothing to waive.
- **Wiring**: `.husky/pre-commit`, after `docs-index`, before `lint-staged`. Writes under `.husky/` are protected-path writes and will prompt.

### 6.3 Tests — `tests/check-claude-md-size.test.js`

Written first, and seen failing before the script exists. They cover `measure` (multi-byte characters, a missing trailing newline), each warning trigger at its boundary (500 bytes warns at 501, not at 500; `BYTE_TRIGGER` likewise), no growth → no warning, a shrink past the trigger → no warning, a line-count rise with no byte trigger crossed → no warning, and a missing HEAD copy.

### 6.4 Docs that describe the pre-commit chain

Every place that lists the chain gets the new step. Found by sweeping for the chain's **content** (the other checks' names in sequence), not one phrasing; known so far: `CLAUDE.md` § Build & Development Commands, its `scripts/` row in the Architecture tree, and `PROJECT.md` § Code Quality.

---

## 7. Verification

- **Rule-loss check, with a positive control.** A fresh agent, at the session's tier (verification never runs on a cheaper tier), gets the old `CLAUDE.md` from `main` and a scratch copy of the new one with one more rule quietly deleted. It lists every rule in the old file as present, reworded or missing. If it does not flag the planted deletion, the check cannot fail, and it is redone before its result is trusted. Every other "missing" must match a row in the plan's disposition tables, or the rule is restored.
- **References.** The § 4 step 4 symbol and path check is re-run on the final file.
- **Size.** Final lines, bytes and bytes per section against § 2, recorded in the plan and the PR.
- **Warning.** The § 6.3 tests, then two live runs: a staged 1.5 KB addition must print the warning, and the staged trimmed file must print nothing. The staged state is saved first and restored after.
- **Hooks.** `npm test` and `npm run lint` pass. The pre-push gate runs E2E, because `scripts/` changed.

---

## 8. Deliverables and affected files

- **New**: this spec; `docs/planning/plans/2026-10-17_g5-claude-md-size-audit.md` (with the disposition tables and the pass results); `scripts/check-claude-md-size.js`; `tests/check-claude-md-size.test.js`.
- **Edited**: `CLAUDE.md` (the trim, D4's pointer, the § 6.1 rule, the chain update); `.husky/pre-commit`; `PROJECT.md` (the chain line, plus any wrong statement the sweep finds); `docs/README.md` (the spec row); `docs/planning/BACKLOG.md` (D4's entry-shape line in 📌; the migration recommendation as an annotation on 🟤 [2026-08-27] "Migrate path-conditional CLAUDE.md content to path-scoped rules", which stays open).
- **Untouched by design**: `docs/ARCHITECTURE.md`, `.mcp.json`, `.claude/`.

---

## 9. Out of scope

- The path-scoped-rules migration itself (D5).
- Refreshing `docs/ARCHITECTURE.md`.
- Stale derived numbers in other docs (🟤 [2026-09-02] sweep).
- The Context7 key in the untracked `.mcp.json`.

---

## 10. Estimate, review and close-out

- **Estimate**: ~4.5 SP against 3 planned: +1 for the warning, +0.5 because the file grew 30% after planning. Under the 2× stop line.
- **Review**: its own PR; the review runs in a separate chat at standard (`high`).
- **Close-out, after the merge**: check off the 🟡 [2026-09-21] entry and the 🟤 [2026-07-03] twin; WEEKLY G5 status → `✅ PR #N`, with its Daily-Schedule row.
- **Propagation (G6)**: G6's outbound cross-project pass carries D2 to `claude-code-universal-config` — this repo's audit trigger is bytes, not ~200 lines, and why (§ 2.8) — for that repo's own decision on its content policy. G5 does not edit the sibling repo.
