# Weekly Plan

**Week**: Monday October 5 – Friday October 9, 2026
**Created**: 2026-10-05
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md (all `Last Updated` 2026-08-27 — 39 days, under the 2-month bar; one drift found, see Notes → strategic docs), BACKLOG.md (📌 Process Rules + 🔵 [2026-10-04] intake + the 🟤 slice filed since 2026-09-03 + 🟡), TODO.md (🔴 held-Like item, 🔴 24k-sort PR2 remainder, § Spawned Tasks — all four rows applied), git log (last 2 weeks: G3 `4b650aa` PR #71, G5 `7342473` PR #72, closeout `57b37ad`, intake `a1f2b03`), previous WEEKLY.md (Sep 7–11 — spilled to 2026-09-24, archived below), REVIEW-QUEUE.md (§§1–5; last run 2026-09-24). Live-config drift check: N/A — this repo keeps no live-config sync. OWNER-QUEUE.md: absent.
**Cleanup Week?**: **Yes — 🧹 CLEANUP WEEK #4, OVERDUE.** The quota **inverts**: 🟤 Auto-Generated is the majority, the ≤1-group and ≤25% 🟤 caps are suspended, 🟡 stays ≤25%, and 🔵 is limited to one sanctioned exception. #4 fell due ~September 21–25, **inside the Sep 7–11 plan's 13-day spillover** — overdue, not skipped, so it runs now. The 🟤-size trigger has fired again: 43 open 🟤 items sit in sections dated 2026-09-03 or later (measured 2026-10-05), and three adopt trials are vehicled to "Cleanup Week #4" by name. The 🔵 exception is sized at 7 SP by user decision (Cleanup Week #3's was 3), plus a 2-SP 🔵 log-retention item the user added the same day, folded into G2.
**Context**: Roadmap phase _Scale & Modularize_; active milestone _v2.0 modularization_ (renderer `media-viewer.js` at 9,718 lines, measured 2026-10-05; G1's `MlTrainingManager` took the training half of MLManager, and nothing else has been extracted since TournamentManager). This week's agreed theme is **"protections that don't actually work"**: a single-mode move path with no in-flight guard, so a held Like key moves files at key-repeat rate (🔵 exception, 🏆 G1); a `preload.js` security hook that never fires, a Prettier hook that formats the whole working directory, and a session log deleted on every clean quit (G2); a tournament render that restarts itself behind its own handlers (G3); and the first whole-repository security scan this repo has had (G4). Weekly Reviews (G5) run Friday.

---

## Parallel Work

- **Auto-deploy: no** (Electron desktop app; a single `main` trunk with no production branch; no `.github/workflows/` and no deploy step — GOALS § Constraints "No CI service"). No Deploy Window group.
- **Parked branch `g2-serialization-wip` (`b155374`, on `origin`)** — G3 is the item it was parked for; G3's closeout decides its fate (land, rebase, or delete with its three doc pointers struck).
- **User-side 24k smokes (optional, not gates)**: PR #66 re-smoke round 2, still never run (its 🔵 re-report was checked off this session with that caveat kept); a first look at G2's overlay bar and the G1 fixes on the real folder.
- **Next normal week's lead — still open** (carried from the Sep 7–11 plan's question 4, never answered): PR2 hash-off-thread (TODO 🔴, unscheduled since June) or the first v2.0 extraction. The 🔵 [2026-10-04] single-mode follow-ons — bulk "dislike the skipped files" (builds on G1's guard), the AI-order staleness hint, source-folder vector reuse on a training-cache miss (measure first) — and the "both good" fatigue design question are the obvious companions.

---

## Task Groups

### G1. Single-mode rating safety `[batch]` 🔵 🏆 — single-mode move path + shortcuts — 7 SP

> The 🔵 exception and the week's 🏆. All three items touch the single-mode rating code, and the hotkey's own entry says it must land "with or after" the guard, so they share one branch. **G3 branches after G1 merges** — both change `moveToSpecialFolder`. The BACKLOG/TODO line numbers are as filed on 2026-10-04; re-locate before editing.
> **Model:** start Opus · `high` (a file-moving bug whose end state is still unexplained — edge cases likely, and `high` is the 5–7 SP row's level for writing the plan) → execute Opus · `medium` for the guard, Sonnet · `medium` for the hotkey and tooltip steps the plan spells out; review thorough (`high`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Stop a held Like key from firing overlapping file moves** — reproduce it first — the reported session's log is gone (`logger.cleanup()` deletes `media-viewer.log` on a clean quit; measured 2026-10-05), so the mechanism has to be confirmed by repro, run with G2's log retention in place; then ignore `e.repeat` for file-moving actions only (like / dislike / special / bulk — never next / previous), and give the single-mode move path (`moveCurrentFile`, `moveToSpecialFolder`) a real in-flight guard. ⚠️ Read 🟤 [2026-08-31] "Re-entrancy guard for the tournament handler family" before choosing it: an `isLoading` mutex was _measured_ insufficient there, and a flag that drops the second action silently lost a quick Ctrl+A. Explain the blank-view / dead-controls end state, or bound it and say what is still unexplained. E2E: repeated `keydown` with `repeat: true` → exactly one file moved. `media-viewer.js` (keydown dispatch, `handleLike`/`handleDislike`, `moveCurrentFile`, `moveToSpecialFolder`), `tests/e2e/` (4) — TODO 🔴 [2026-10-04]
- [ ] **Single-mode special-folder hotkey** — `special: 'Digit1'` in `DEFAULT_SHORTCUTS.single`, an `ACTION_LABELS` row, an `executeAction` case calling `moveToSpecialFolder()` on the guarded path above; flip the four tests G3 pinned single mode's bare state in (`tests/keyboard-shortcuts.test.js` ×3, `tests/media-viewer-utils.test.js` ×1). An additive default needs no `loadShortcuts` version bump — `_mergeModeShortcuts` leaves it unbound if the user already holds `Digit1`. (2) — 🔵 [2026-10-04]
- [ ] **Like/Dislike tooltips derived from the live binding** — generalise `_specialShortcutSuffix` to any action and apply it to **all eight** hardcoded like/dislike titles (`updateRatingButtonsState`'s two single-mode and four compare titles, `addMediaOverlayControls`' two), refreshed from `saveShortcut`/`resetShortcuts`. Fixes `Like (Arrow Up)` / `Dislike (Arrow Down)`, which are wrong with default bindings, and closes the remap gap G3 declined as out of scope. (1) — 🔵 [2026-10-04]

### G2. Hooks and logs that actually fire `[batch]` 🟤 (+1 🔵 folded) — Claude Code hooks, commit hook, session log — 8 SP

> **Front-loaded to Monday**, because the Prettier hook's defect taxes every edit of every other group this week: until it is fixed, keep the shell's cwd at the repo root. The first three items are one change — the two hook fixes land in the commit that brings `.claude/settings.json` under review, so the fixes are the first thing that review sees. **Acceptance is proof that each hook can fire**, not a green suite (a probe that cannot fail looks exactly like one that passes): a scratch `.env` write is blocked or prompts, and an edit made from a `docs/planning` cwd leaves the other planning docs byte-identical. The **log-retention item** (🔵, added by the user on 2026-10-05 after G1's log turned out to be deleted) lands on Monday too, so every later debugging session this week keeps its log; its acceptance is a log that survives a clean quit and a relaunch.
> **Model:** start Opus · `high` — **stepped up one row** from 5–7 SP because the group is safety-critical (the repo's only deterministic `preload.js` guard, plus the pre-commit hook); `xhigh` to write the plan (the ask-vs-block choice under auto mode needs checking against the hooks reference) → execute Opus · `medium`, Sonnet · `medium` for the `.gitignore` / `CLAUDE.md` steps and the logger rotation; review deep (`max`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Put `.claude/settings.json` under version control** — `!.claude/settings.json` in `.gitignore` (`settings.local.json` stays ignored), checked for machine-specific paths before committing; rewrite `CLAUDE.md`'s `.claude/*` rule to name what _is_ committed; settle the un-ignore list once, since the path-scoped-rules migration would put `.claude/rules/*.md` behind the same rule. `.gitignore`, `.claude/settings.json`, `CLAUDE.md` (2) — 🟤 [2026-09-24] Weekly Reviews §2 adopt
- [ ] **Make the `preload.js` / `.env` `PreToolUse` guard fire** — read `tool_input.file_path` from the stdin JSON (no `CLAUDE_FILE_PATH` variable exists); choose between a hard block (`exit 2`, message on stderr) and `permissionDecision: "ask"` — check first how `ask` behaves under auto mode, which this repo uses. `.claude/settings.json` (1) — 🟤 [2026-09-24]
- [ ] **Make the Prettier `PostToolUse` hook format only the edited file** — path from the stdin JSON, skip when empty, and resolve the root `.prettierignore` wherever the session's cwd is (`--ignore-path`, or `cd "$CLAUDE_PROJECT_DIR"` first). Retires the "keep the cwd at the repo root" workaround in memory. `.claude/settings.json` (1) — 🟤 [2026-09-24]
- [ ] **A per-check bypass for `.husky/pre-commit`** — a `SKIP=<check>` convention so one false positive no longer forces `--no-verify` past `check-secrets.js`; each script's remedy text names its own skip token instead of `--no-verify`. `.husky/pre-commit`, `scripts/check-secrets.js`, `scripts/check-docs-index.js`, `scripts/check-e2e-needed.js`, `CLAUDE.md` hook prose, `PROJECT.md` (2) — 🟤 [2026-09-02] G3 closeout
- [ ] **Keep session logs after a clean quit** — `logger.js` truncates `media-viewer.log` on launch and deletes it on `will-quit`, built on the TASK-025 assumption that errors mean crashes; the held-Like session broke the app without crashing it, so its evidence was deleted. Recommended shape: rotate on launch and keep the last N session logs (e.g. N = 5), and stop deleting on a clean quit; the alternatives (keep only sessions that logged a warning or error, or keep only in dev runs) are recorded on the entry. Note where the logs live — **corrected 2026-10-05 by G2's probe**: dev runs via `npm start` write to `%APPDATA%\media_viewer\logs\`; E2E runs (which launch `main.js` directly, so the app is named "Electron") write to `%APPDATA%\Electron\logs\`. `logger.js`, `main.js`, `tests/logger.test.js`, `CLAUDE.md` (`logger.js` line) (2) — 🔵 [2026-10-05]

### G3. Tournament render re-entry `[solo]` 🟤 — tournament render lifecycle — 5 SP

> Kept this week despite the 2026-10-04 decision to move tournament mode into a plugin: that move is blocked on an add-on system that does not exist yet, and this defect fires today on any file that fails to decode. It is also the precondition the tournament handler guard has been **BLOCKED** on since the G2 Task 4 revert (2026-08-31). Branch from `main` **after G1 merges**.
> **Model:** start Opus · `high` — **stepped up one row** from 5–7 SP because the design is unclear (both mechanisms proposed so far were measured wrong); `xhigh` to write the plan → execute Opus · `medium`; review deep (`max`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Stop the tournament render from re-entering itself** — one decision about how a render restarts itself, applied at three sites: `_buildTournamentSide`'s media `error` listener and its JXL decode-failure path both call `removeFileFromList()` plus an **un-awaited** `showTournamentPair()` from inside the render they belong to, and `moveToSpecialFolder`'s un-awaited render is the third. Ready repro: `tiny.mp4` fails to load in the Playwright fixtures on every run. Acceptance: the tournament E2E file green over **at least five consecutive runs**, the measurement shape of the 2026-08-31 table (one green run proved nothing there). Then re-read the BLOCKED guard entry and decide the fate of `g2-serialization-wip`. `media-viewer.js` (`_buildTournamentSide`, `moveToSpecialFolder`), `tests/e2e/tournament-mode.test.js` (5) — 🟤 [2026-08-31] G2 Task 4 revert, item 1

### G4. Cleanup Week trial batch `[batch]` 🟤 — adopt trials + recurring read-out — 3 SP

> **User-in-the-loop on Thursday**: the plugin sets `disable-model-invocation: true`, so only the user can start `/claude-security`; the `/plugin` tab reading is also the user's. If the user is not available, record `pending — needs the user to start the scan` rather than substituting a model-run review. Results are docs-only (REVIEW-QUEUE § 5, BACKLOG) and may share G5's branch. `typescript-lsp` stays parked by user decision (it would confound this trial); the evidence-gating gate is not built this week (see Notes).
> **Model:** start Sonnet · `medium` (the scan runs under the plugin's own agents) → re-derive each surviving finding on Opus · `high` (verification matters: the trial judges the plugin's verifier, so our check has to be the stronger one); review standard (`high`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **`claude-security` whole-repository scan** — install; measure its always-on cost with `claude plugin details claude-security@claude-plugins-official` straight away (disable between scans if material); the user runs the scan; re-derive every surviving finding from source; read out `keep` / `drop` in REVIEW-QUEUE § 5 against the trial question — keep if the survivors survive our re-derivation, or if a clean result's Coverage section demonstrably accounts for `main.js`, `preload.js` and the IPC handlers; drop if they fail it. Each confirmed finding becomes its own BACKLOG entry. Name the second leg's trigger (`Scan changes` on the first PR touching `main.js` or `preload.js` — none of this week's groups does) or record it as best-effort. (3) — 🟤 [2026-09-24] Weekly Reviews §1a adopt
- [ ] **Plugin context-cost & disuse read-out (recurring)** — `claude plugin list --json` + `claude plugin details` per plugin, plus the user's `/plugin` Installed-tab **Not used recently** reading — the column the first read-out left unread; table in REVIEW-QUEUE § 5. A kept practice, not a trial (adds nothing to the queue count). (0) — REVIEW-QUEUE § 5 Recurring read-out

### G5. Weekly Reviews `[batch]` ⚪ Overhead — research / process — 5 SP

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. **Window ≈ 15 days** (last run 2026-09-24). **Run order is load-bearing (D4 precedent)**: G4's `claude-security` read-out lands first, so §§1–3 meet the cap as it stands after it — at 3 outstanding trials (`typescript-lsp`, evidence-gating, `claude-security`) a new trial `adopt` parks in Next-up; a read-out of `claude-security` drops the count to 2. §1a sources from the catalog (`marketplace.json`), not the docs page. Docs-only: merge or dated-defer in-session.
> **Model:** Opus · `medium`, named directly because ⚪ overhead fits no row of the § 1.0 table: research and verdicts, with each claim checked against its primary source (every correction the 2026-09-24 run took came from that check); Sonnet · `medium` is enough for the routine sourcing searches.

- [ ] **Plugins (2 SP)** — two independent tops: official catalog + wider internet, each with `source:`.
- [ ] **Claude best-practices (1 SP)** — hybrid: fresh check vs. the parked list.
- [ ] **Non-Claude AI best-practices (1 SP)**.
- [ ] **Cross-project propagation (1 SP)** — outbound: this window's shipped work (PR #72's close-out, the 2026-10-04 intake, this week's G1–G4) and memory files changed since 2026-09-24, at the high bar; the parked "a BACKLOG entry's stated mechanism is a hypothesis" has fresh evidence (two of the 2026-10-04 intake notes predated the merges that changed what they describe). Inbound: any new sibling rows naming this repo.
- _Ride-along (0 SP)_: the strategic-doc status flip found at planning (see Notes) — GOALS.md's "MLManager extracted" KR and MILESTONES.md's v2.0 status line, per [README.md](README.md) § Strategic Review ("small factual fixes may ride along in that week's docs group").

---

## Daily Schedule

### Monday, October 5 — Plan; make the hooks fire

> Planning takes part of the day. G2 starts with the Prettier hook, so every later edit this week runs on a fixed hook, and with log retention, so G1's reproduction keeps its log.

- **[G2](#g2-hooks-and-logs-that-actually-fire-batch--1--folded--claude-code-hooks-commit-hook-session-log--8-sp)** 🟤 🔵 — log retention, Prettier hook, `preload.js` guard, `settings.json` under git (part 1 of 2)

**Daily total**: ~5 SP (+ planning)

### Tuesday, October 6 — Finish the hooks; reproduce held-Like

- **[G2](#g2-hooks-and-logs-that-actually-fire-batch--1--folded--claude-code-hooks-commit-hook-session-log--8-sp)** 🟤 — finish the `settings.json` change; the `SKIP=<check>` bypass; review; merge (part 2 of 2)
- **[G1](#g1-single-mode-rating-safety-batch----single-mode-move-path--shortcuts--7-sp)** 🔵 🏆 — reproduce; key-repeat filter + in-flight guard + E2E (part 1 of 2)

**Daily total**: ~6 SP

### Wednesday, October 7 — Single-mode safety lands; tournament starts

- **[G1](#g1-single-mode-rating-safety-batch----single-mode-move-path--shortcuts--7-sp)** 🔵 🏆 — special-folder hotkey + tooltips; review; merge (part 2 of 2)
- **[G3](#g3-tournament-render-re-entry-solo---tournament-render-lifecycle--5-sp)** 🟤 — branch after G1 merges; design the restart decision (part 1 of 2)

**Daily total**: ~5 SP

### Thursday, October 8 — Tournament lands; security scan

- **[G3](#g3-tournament-render-re-entry-solo---tournament-render-lifecycle--5-sp)** 🟤 — implement; five-run E2E measurement; review; merge (part 2 of 2)
- **[G4](#g4-cleanup-week-trial-batch-batch---adopt-trials--recurring-read-out--3-sp)** 🟤 — user starts `/claude-security`; cost measured on install (part 1 of 2)

**Daily total**: ~5 SP

### Friday, October 9 — Read-outs + Reviews + buffer

- **[G4](#g4-cleanup-week-trial-batch-batch---adopt-trials--recurring-read-out--3-sp)** 🟤 — re-derive surviving findings; § 5 read-out; plugin read-out (part 2 of 2)
- **[G5](#g5-weekly-reviews-batch--overhead--research--process--5-sp)** ⚪ — after G4's read-out, then §§1–4 + the strategic-doc ride-along
- Buffer for G1/G3 review rounds. Closeout per group: Summary-Table Status → `✅ PR #N` (or `✅ <merge-SHA>` where no PR was opened), the group's Daily-Schedule rows, and every BACKLOG/TODO entry it closed — **in the closeout commit, after the merge**.

**Daily total**: ~2 SP + 5 overhead + buffer

---

## Summary Table

| ID  | Group                                       | Domain                                   | Source      | Tasks | Total SP | Day     | Status     |
| --- | ------------------------------------------- | ---------------------------------------- | ----------- | ----- | -------- | ------- | ---------- |
| G1  | Single-mode rating safety `[batch]` 🏆      | Single-mode move path + shortcuts        | 🔵 User     | 3     | 7        | Tue–Wed | ☐ Planned |
| G2  | Hooks and logs that actually fire `[batch]` | Claude Code hooks + commit hook + session log | 🟤 Auto (+1 🔵) | 5 | 8 | Mon–Tue | ☐ Planned |
| G3  | Tournament render re-entry `[solo]`         | Tournament render lifecycle              | 🟤 Auto     | 1     | 5        | Wed–Thu | ☐ Planned |
| G4  | Cleanup Week trial batch `[batch]`          | Adopt trials + recurring read-out        | 🟤 Auto     | 2     | 3        | Thu–Fri | ☐ Planned |
| G5  | Weekly Reviews `[batch]`                    | Research / process                       | ⚪ Overhead | 5     | 5        | Fri     | ☐ Planned |
|     | **Total (quota-counted)**                   |                                          |             | **11** | **23**  |         |            |
|     | **Total (incl. ⚪ overhead)**               |                                          |             | **16** | **28**  |         |            |

_Source legend: 🔵 User · 🟡 Ops · 🟤 Auto · ⚪ Overhead (exempt from the quota denominator)._
_Status cell on completion: `✅ PR #N` where a PR was opened (every group since 2026-09-10 has been), else `✅ <merge-SHA>` — never a bare `✅`. Flip it in the closeout commit, which runs after the merge (global close-out rule), together with the group's Daily-Schedule rows and every BACKLOG/TODO entry the group closed._

---

## Notes

- **Why a Cleanup Week now.** The Sep 7–11 plan delivered through 2026-09-24, and #4 fell due inside that slip, so under the rule it is overdue rather than skipped. The 🟤 inflow has not slowed: 43 open 🟤 items in sections dated 2026-09-03 or later, measured 2026-10-05 — G1's execution review alone filed 18. This week closes five (G2 ×4, G3 ×1), runs one trial, and reaped four more at planning; the inflow is still the review and closeout process itself, as Cleanup Week #3 found.
- **Sizing and drop order.** Planned at 23 quota-counted SP against the agreed ~18–20: the user sized the 🔵 exception at 7 SP knowing it took the week to ~21, then added the 2-SP log-retention item after approval. Velocity reference: the Sep 7–11 plan shipped about 19 SP by the weekend after its Friday (G1, G4, G2) and the rest 8–13 days later; Cleanup Week #3 did 23 + 5 in four days; design-heavy normal weeks shipped ~14 in-window. **Overrun drop order**: G2's `SKIP=` item first, then G1's tooltip item, then G3 moves to next week whole. **Never drop** G1's held-Like fix, G2's two hook fixes, or G2's log-retention item (G1's reproduction depends on it).
- **Dependencies.** G2 first (the Prettier hazard, and log retention before G1's reproduction). G1 before G3 (both change `moveToSpecialFolder`). G4's scan needs the user on Thursday. G5 after G4's read-out (D4 order). The overdue 🟡 `CLAUDE.md` size audit (212 lines; the quarterly clock ran out mid-September) is **not** scheduled: theme A had no room for it, and G2 already changes `CLAUDE.md` — auditing it the same week would bury G2's diff, the reason G3 kept it out on 2026-09-21. It is the natural 🟡 slot of the next normal week.
- **Evidence-gating gate not built.** The Sep 7–11 plan expected Cleanup Week #4 to build the deterministic visual-evidence gate (🟤 [2026-09-02]). The user chose the tournament fix over it at planning, and no group this week changes layout, so the gate has no vehicle this week either. Its trial row stays `pending`, carrying G2's positive interim signal (2026-09-13).
- **Strategic docs — one drift found.** G1 (merge `bfcc881`, 2026-09-10) shipped `MlTrainingManager` (`ml-training.js`), the training half of MLManager, but GOALS.md still reads "MLManager extracted — Not started" and MILESTONES.md "2 of 6 managers extracted". That is a status flip, so it rides along in G5 rather than becoming a 🟡 refresh entry (README § Strategic Review). The "~9,400 lines" figure in all three is a restated derived value the 🟤 [2026-09-02] sweep item already owns — not refreshed here. `Last Updated` 2026-08-27 is under the 2-month bar.
- **Branch / PR shape.** Three code branches (G1, G2, G3), each through a PR, as every group since 2026-09-10 has been; G4 + G5 docs-only, on one branch, merged or dated-deferred in-session.
- **Reaps — nominated in the brainstorm, user-approved and executed 2026-10-05** (BACKLOG bodies deleted, tombstone rows in Rejected Ideas; the two touched headers that carried a count lost it, per [README.md](README.md) § Document Conventions):
    1. 🟤 [2026-06-20] PR #54 _"Progress-card DOM teardown / flicker when `updateProgressNotification` interleaves with `updateSortProgress`"_ — **obsolete**: of its two named interleavers, `trainFromHistoricalRatings` was deleted by G1 and ML-worker progress has been owner-routed since G5 (`0d3fed5`); `updateProgressNotification` has one caller left, inside the guarded branch. ✅ reaped.
    2. 🟤 [2026-08-31] _"Closeout is written before the merge, and the merge falsifies it"_ and 🟤 [2026-09-12] _"The closeout convention requires a flip that a GitHub PR merge makes impossible"_ — **superseded** by the global close-out rule, which runs the closeout after the merge on the trunk; the in-merge-commit rule lived only in the footnote archived below. Residual accepted: the rule's clause names PR flows, and every group since 2026-09-10 merged through one. ✅ both reaped.
    3. 🟤 [2026-09-12] G4 closeout _"A CLIP lease acquired during an in-flight unload gets a model that is already gone"_ — **tracking-only** ("folded into item 1"); its mechanism was carried into item 1's text before deletion. ✅ reaped.
    4. **Check off, not reap** — five 🔵 [2026-07-01] entries already delivered and still unchecked: four AI-sort-startup items (PR #64, whose DONE entry names the cluster as closed and whose 24k smoke covered each) and the "Both good/Both bad reappear" re-report (PR #66, round-2 re-smoke caveat kept). ✅ checked off with evidence.
- _Brainstorm sanity-checks (user-in-the-loop, 2026-10-05): week dates confirmed Mon Oct 5 – Fri Oct 9, 2026 vs. today (Monday Oct 5) and git/DONE (no commit or DONE entry yet dated this week); the previous plan (Sep 7–11) did **not** land inside its header week — delivered through 2026-09-24, 13 days late, with Cleanup Week #4 falling due inside the slip → overdue, scheduled now; velocity ~19 SP by the weekend after Friday (Sep 7–11) / 23 + 5 in four days (Cleanup Week #3) → ~18–20 agreed, 21 planned by user sizing, 23 after the user added log retention post-approval; Cleanup Week **due and run** (cadence + 43 open 🟤 since Sep 3); quotas satisfiable (223 open 🟤, the overdue 🟡 audit, the 🔵 exception); five reap/check-off nominations put in-dialogue, all approved and executed._

### Quota Check

- 🔵 **User-Flagged SP**: 9 / 23 (**39%**) — ⚠️ **below the normal ≥50% floor BY DESIGN** — inverted-quota Cleanup Week; G1 is the sanctioned 🔵 exception (7 SP, sized by the user on 2026-10-05; Cleanup Week #3's was 3), plus G2's folded log-retention item (2 SP, added by the user the same day).
- 🟡 **Operational SP**: 0 / 23 (**0%**) — ✅ ≤25% (the overdue `CLAUDE.md` size audit is deferred to the next normal week; see Notes).
- 🟤 **Auto-Generated SP**: 14 / 23 (**61%**), **3 groups** (G2's 🟤 members, G3, G4) — **inverted**: multiple 🟤 groups are expected in a Cleanup Week (the ≤1-group / ≤25% caps are suspended); 🟤 is the majority of scheduled work.
- **Cleanup Week status**: **ACTIVE** (4th; overdue — fell due ~September 21–25, inside the previous plan's spillover)
- **Last Cleanup Week**: August 31 – September 4, 2026 (the 3rd). Next expected ~3 weeks after this one (~October 26–30, 2026).
- **Compliance**: ✅ Cleanup-Week quotas met — 🟤 is the majority of quota-counted work, 🟡 ≤25%, 🔵 limited to the sanctioned exception. ⚠️ The deviation from _normal-week_ quotas (🔵 < 50%) is the rule-defined shape of a Cleanup Week, not a violation.
- _Denominator note_: Y = total quota-counted SP (23) — the exempt ⚪ Overhead Weekly Reviews batch (G5, 5 SP) is excluded; 28 incl. overhead. No Deploy Window (auto-deploy: no).

---

## Weekly Challenge 🏆

**Single-mode rating safety** (Group G1, Tue–Wed).

**Why this one**: it is the week's only 🔴 user-flagged bug, it moves files, and half of it is still unexplained. Stopping key auto-repeat is the easy part. The stretch is a guard on the single-mode move path that is actually sound — the tournament work measured an `isLoading` mutex as insufficient and a drop-the-second-action flag as silently losing a Ctrl+A — and an honest account of the blank-view / dead-controls end state the code reading did not explain. It also carries two user requests that build on the guard, so the next normal week's single-mode work (bulk dislike of skipped files) starts on safe ground.

---

## Previous Week Summary

### Week: September 7 – September 11, 2026 — 🟢 Normal week (ML training pipeline lead) — ✅ Complete, but **spilled to 2026-09-24** (all 5 groups shipped)

**Spillover**: through 2026-09-24 — G1 and G4 merged 2026-09-12 and G2 2026-09-13, one to two days past the Friday; G3 followed 2026-09-21 and Weekly Reviews 2026-09-24. The `**Spillover**` line was added only on 2026-09-24, though the slip was plain by 09-12. Cleanup Week #4 (~Sep 21–25) fell due inside it, which is why the Oct 5–9 week is one. Archived under its **true** header week.

**Result**: 22 SP quota-counted (21 planned; G2 grew 5 → 6 when the F4 zoom regression was found during scoping and folded in) + 5 overhead, all delivered. **G1 🏆** ML training pipeline (PR #68 `bfcc881`): the model is keyed on a training-set fingerprint in the new `MlTrainingManager` (`ml-training.js`), with per-training-folder vector caches and a model cache in app data; online per-rating updates were dropped, and the deferred-compare-refresh protocol was deleted with them. **G4** ML pipeline integrity (PR #69 `7df03b8`): a CLIP **lease** closes the unload-timer door, the worker's dead abort protocol was deleted rather than pinned, and the worker harness was extended. **G2** reachable overlay controls (PR #70 `f874f93`): the per-media buttons and the badge moved out of the content-sized wrapper into a container-anchored `#compareOverlayBar`, and Like sits left of Dislike everywhere — the first UI change shipped with committed visual evidence, which caught a grid defect no automated check saw. **G3** compare special hotkeys (PR #71 `4b650aa`): compare `1`/`2` plus derived tooltips; round 1 of review found the new defaults shadowing a pre-existing user remap and **moving a file**, fixed structurally with `_mergeModeShortcuts`. **G5** Weekly Reviews (PR #72 `7342473`): the context-cost audit kept as a practice (eight synced plugins disabled, `dead-rules-audit` uninstalled), `claude-security` and `settings.json` versioning adopted, both project hooks found dead, and four propagations applied live. Test deltas in [DONE.md](DONE.md), not restated here.

**Velocity learning**: ~19 SP merged by the weekend after the Friday; the tail was review rounds (G3 three, G5 three plus a close-out ruling), not implementation. Process learning: three of the week's four code groups found their BACKLOG premise had moved before they started (G3's migration, G4's harness and "un-awaited caller", G1's root cause) — measure the entry's mechanism at planning, and again at execution.

### Week: August 31 – September 4, 2026 — 🧹 Cleanup Week (3rd ever, overdue) — ✅ Complete, on time (all six groups merged by Sep 3)

**Result**: 23 SP quota-counted + 5 overhead, all delivered inside the header week — no spillover line needed. **G1 🏆** bulk-rate follow-ups (`66b16af`, Aug 29 — a day _early_): the deferred-refresh protocol got real E2E coverage with the **real** `ml-worker.js` (lazy init was the cause, not a harness limit), `loadFolder` cancels the window twice, single-move undo restores pruned pair keys. **G2** tournament undo hardening (`6305a7a`, 3 of 4): reconcile drops the session undo stack O(1), a failed special-restore no longer wedges the stack, the empty-state guard consults `engine.history`; Task 4's re-entrancy lock **reverted as unsound** (`_buildTournamentSide` re-enters the render from DOM callbacks) and re-filed. **G3** docs & process guardrails (`45a0d9b`): `scripts/check-docs-index.js` pre-commit guard (both directions, reads the git index) + 24-row backfill, `.vscode` Markdown format-on-save off, closeout conventions, `pool:'threads'` after the flake failed to reproduce. **G4** adopt-queue trial batch (`bf58c01` + read-out via PR #67): policy **b+**, cadence weekly; `pr-review-toolkit` → keep (8 items beyond baseline, 4 with wrong reachability stories); `dead-rules-audit` → **drop** (its judge scores compliant edits as violations). **G5** AI-sort training-phase progress polish (`0d3fed5`, the 🔵 exception): the card survives every phase, and a **real correctness bug** surfaced behind the UI item — the un-awaited `initClipModel()` trained on all-zero CLIP halves. **G6** Weekly Reviews (PR #67 → `de4bdac`, Sep 3): 2 pass / 2 adopt / 1 propagate, both § 5 trials read out as failures, three review rounds all on stale counts in live docs. Unit tests 513 → **613**; E2E 55 → **56**. Renderer 9,418 → 9,642.

**Velocity learning**: mechanical 🟤 work ran at 23 SP in four days; the week's two "beyond the brief" fixes (G5) and one revert (G2) all came from measuring an entry's stated mechanism against the code. Process learning: the Cleanup Week **filed 32 🟤 items while closing 24** — closeouts and reviews are the inflow, and a written convention (derived counts) was broken four times by the branch after it was written.

### Week: July 13 – July 17, 2026 — 🟢 Normal week (24k AI-sort UX lead) — ✅ Complete, but **spilled to 2026-08-27** (all 5 groups shipped)

**Spillover**: through 2026-08-27 — G1 and G2 landed 2–4 days late (PR #64 Jul 20, PR #65 Jul 21), then a ~5-week availability gap, then G3 (PR #66, Aug 24 — merged on user direction, re-smoke round 2 not run), G4 (`a843d36`, Aug 27, no PR) and G5 (`4f1e65a`, Aug 27, no PR, a catch-up run) closed the plan 6 weeks after its Friday. No `**Spillover**` line was recorded at the time; archived here under its **true** header week. The Cleanup Week that fell due (~July 27–31) during this spillover is the reason the August 31 week was one.

**Result**: 21 SP quota-counted + 5 overhead, all delivered. **G1 🏆** AI-sort startup UX & incremental cache-load (PR #64 `b6ff4ac`) — determinate progress card, cached features served, real cancel; **real-24k smoke PASSED 2026-07-20** on a 20,929-file folder after a smoke-triggered **data-loss incident** (a 126 MB feature cache overwritten with 32 entries; restored from the user's `.bak`) was root-caused and fixed pre-merge (`2777bdf`, `c947081`). **G2** tournament-mode bug fixes (PR #65 `937084c`) — the intermittent undo failure was `handleTournamentUndo` peeking `moveHistory` instead of `engine.history`; mouse-wheel guard; header auto-hide; 6-point user smoke PASSED. **G3** bulk-rate re-pair avoidance (PR #66 `0b00275`) — exact-pair suppression + fall-through; round-1 smoke found 2 real defects both fixed. **G4** strategic-doc refresh (`a843d36`). **G5** Weekly Reviews catch-up (`4f1e65a`) — 3 adopt / 1 pass / 1 propagate, REVIEW-QUEUE §4 created. Unit tests 434 → **513**; E2E 52 → **55**. Closed the _24k AI-sort smooth_ milestone (2026-07-20); v2.0 modularization promoted to the roadmap's Now column.

**Velocity learning**: 14 SP (G1+G2, design-heavy + real-24k smokes) in ~7 working days; the tail was availability, not effort. A plan whose delivery outruns its header by weeks silently skips the cadence-driven work that fell due in between — record the `**Spillover**` line as soon as the slip is known.

### Week: July 6 – July 10, 2026 — 🧹 Cleanup Week (2nd ever) — ✅ Complete (all 5 groups merged)

**Result**: The 2nd Cleanup Week (inverted quota; 21 SP quota-counted + 4 overhead). All five groups shipped, merging across PRs #59–#63. **CW-T** tournament correctness & hardening (PR #59 `ae9588d`; real-24k smoke PASSED). **CW-D** docs & CLAUDE.md hygiene (PR #60 `dba3ecf`). **CW-V** test & tooling backfill (PR #61 `85f1f29`). **CW-P** process & DX guardrails — automated pre-push E2E gate + Weekly-Reviews methodology (PR #63 `f6c2c46`). **WR** Weekly Reviews 2nd run (PR #62 `291879c`). Unit tests 411 → **434**; E2E 52/52 green.

**Velocity learning**: the ~8 SP non-mechanical tournament core ran below its nominal, while the ~13 SP mechanical 🟤 moved at cleanup speed.

### Week: June 22 – June 26, 2026 — 🟢 Normal perf week — ✅ Mostly complete (spilled to June 30)

**Result**: A 19 SP (quota-counted) performance push. Four of five groups shipped, spilling ~4 days past Friday: **P2** tournament large-folder perf (PR #55, June 25), **P3** feature-extraction timing → pure-lazy (PR #56, June 26), **WR** Weekly Reviews first run (PR #57, June 29), **T1** tournament exit affordances (PR #58, June 30). Unit tests 381 → **389**. **Group P1 (sort-perf PR2 + PR3) did NOT ship** — PR3 shipped in July (PR #64), PR2 remains open.

**Velocity learning**: ~14 SP quota-counted actually shipped in-window; design-heavy work runs below the nominal once diagnosis + review + real-folder-smoke overhead is counted.

### Week: June 15 – June 19, 2026 — 🧹 Cleanup Week (1st ever) — ✅ Complete (shipped on time)

**Result**: All five groups (CW-1…CW-5) delivered at the 24 SP target, on schedule. Six PRs merged (#47–#52). Unit 310 → **345**; E2E returned to green (42/43 → 48/48).

### Week: June 1 – June 5, 2026 — ✅ Complete (ran long: finished 2026-06-11)

All 5 groups delivered (30 SP planned; consumed 9 working days). Seven PRs merged (#40–#46). Unit 244 → 297.

### Week: May 11 – May 15, 2026 — ✅ Complete

All 6 groups delivered (25 SP). Tournament Mode (Groups E + F) shipped 2026-05-25 with a polish pass 2026-05-26.

### Week: April 13 – April 17, 2026 — ✅ Complete

All 6 groups delivered, 25 SP. See `docs/archive/plans/` and `docs/planning/DONE.md`.
