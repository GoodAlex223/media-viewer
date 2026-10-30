# Weekly Plan

**Week**: Monday October 26 – Friday October 30, 2026
**Created**: 2026-10-28
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md (all `Last Updated` 2026-10-27 by G5's refresh, one day old; this pass adds a status edit for the v2-share ruling, see Notes → v2's weekly share), BACKLOG.md (📌 Process Rules; the open 🔵 pool; the 🟤 sections filed since Cleanup Week #4, [2026-10-11] → [2026-10-27]; 🟡 [2026-10-17]; the last plan's unverified reap list, re-checked first-hand), TODO.md (🔴 I1 real-profile check, both 🟠 items, § Spawned Tasks), git log (last 2 weeks: the Oct 19–27 merges `4548269`, `f668611`, `654fb3e`, `f5ddfa3`, `e1c4e03`, `7f75013`, `082e3b2`, `7fb9978`, `c5ac35f` and their closeouts through `fab2bf6`; intake `d639e1c`), previous WEEKLY.md (Oct 19–23, spilled to 2026-10-27, archived below), REVIEW-QUEUE.md (§§1–5; last run 2026-10-27; § 5 queue at 0). Live-config drift check: N/A — this repo keeps no live-config sync. OWNER-QUEUE.md: absent.
**Cleanup Week?**: **Yes — 🧹 CLEANUP WEEK #5, OVERDUE.** The quota **inverts**: 🟤 Auto-Generated is the majority, the ≤1-group and ≤25% 🟤 caps are suspended, 🟡 stays ≤25%, and 🔵 is limited to one sanctioned exception (G1, 3 SP, my call, delegated by the user). #5 fell due this very week, Oct 26–30, while the Oct 19–23 plan's spillover ran through Tuesday the 27th: overdue, not skipped, so it runs now. The 🟤-size trigger fires too: 174 open 🟤 entries sit in sections dated 2026-10-11 → 2026-10-27, and 390 are open in all (measured 2026-10-28, before this pass's reaps).
**Context**: Roadmap phase _v2 — modules and redesign_; next milestone _v2 pilot (P1a + P1b)_, whose P1a can start the week of Nov 2–6. This week's agreed theme is **"clear the runway for v2, then make the rating data safe"**: cheaper pushes and two repo chores first (G1, the 🔵 exception); the blocking line ratchet P1a must merge under, with the flaky test that blocks pushes (G2); then the open defects that can leave a file or a rating in the wrong state (🏆 G3); the AI research's PR and the real-data check A1 waits on (G4); the `CLAUDE.md` byte-trigger re-set this week owes (G5); and Weekly Reviews with the overdue plugin context-cost read-out (G6). **Planned as of Sunday 2026-10-25 by the user's ruling and written Wednesday 2026-10-28; each header day runs two days later (Monday's work on Wed Oct 28, through Friday's on Sun Nov 1).**

---

## Parallel Work

- **Auto-deploy: no** (Electron desktop app; a single `main` trunk with no production branch; no `.github/` directory and no deploy step — GOALS § Constraints "No CI service"). No Deploy Window group.
- **User-in-the-loop steps** (part of their groups; listed here so they are visible in one place):
  - **G1 (Wed)**: the LICENSE copyright line, whose year and holder name are yours to choose (the BACKLOG entry); and the delete of the untracked local `.mcp.json`, which is your file, so it is confirmed before it goes. ✅ Both settled 2026-10-28: `Copyright (c) 2025 GoodAlex223`, and the delete was approved, then done after a masked re-read showed the file unchanged.
  - **G4 (Sat)**: name the like and dislike folders for the harness run, and rule on deleting the parked local branch `g3-departed-clips-parked`.
  - **G6 (Sun)**: the run's rulings, as every week.
  - **Any time**: TODO 🔴 "G1 I1 post-merge check (user)". The first `npm start` on `main` moves your settings to the app origin once; check them, then delete the pre-merge profile copy. If it is already done, tell the G1 session, which checks it off.
- **User-side 24k smokes (optional, not gates)**: PR #66 re-smoke round 2, still never run.
- **Next week (Nov 2–6)**: its planning pass schedules **v2 P1a** (~11 SP, spec § 14) under the new share (Notes → v2's weekly share), with G2's ratchet in place. Still owed before P3b's plan, not this week: 🟤 [2026-10-25] "Run or recover the downloader research before P3b's plan", whose first step is to ask you whether that session ran and where its output went.

---

## Task Groups

### G1. Repo chores `[batch]` 🔵 — repo tooling — 3 SP

> **First, on Wednesday**: once G1 merges, a push that changes only `.claude/`, unit tests, `scripts/`, `.husky/` or the lint, format and test configs skips the 10–12 min E2E run, so G2's and G5's pushes get cheaper. The week's 🔵 exception, sized 3 SP (my call, delegated by the user at planning; Cleanup Week #3's was 3, #4's 7). One branch, one PR. The gate edit is the only part that can let an untested push through, so every path class is unit-tested both ways and every unlisted path stays RUN (fail-safe). The plan decides whether `prototypes/` (G4's research tree, which the app never loads) joins the SKIP list.
> **Model:** start Opus · `medium` (stepped up from the 3–4 SP row's Sonnet: a pre-push gate is a commit hook, which § 1.0 escalates regardless of size) → execute Sonnet · `high` (verification is the acceptance: each path class tested both ways); review `max` (the row's `high`, one level up for the hook) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [x] **Skip the pre-push E2E run when a push changes only paths the app never loads** — per TODO 🟠 (option 1 of 🔵 [2026-10-26] "Cut the pre-push E2E gate's cost: 10–12 min on every push that touches a non-docs file"): add an explicit SKIP list to `classifyPaths` — `.claude/`, unit tests (`tests/*.test.js`, `tests/integration/`, never `tests/e2e/`), `scripts/`, `.husky/`, and the lint, format and test configs; every other path stays RUN. Unit-test each class both ways, and update `CLAUDE.md`'s pre-push description. At the closeout, annotate 🟡 [2026-07-10] "Re-evaluate pre-push E2E-gate friction after real-world use" (option 1 shipped; options 2–4 stay in the 🔵 entry). `scripts/check-e2e-needed.js`, `tests/check-e2e-needed.test.js`, `CLAUDE.md` (2) — TODO 🟠 [2026-10-26] ← 🔵 [2026-10-26] G4 session
- [x] **Retire the unused Context7 MCP server** — per 🔵 [2026-10-28] "Retire the unused Context7 MCP server from `.mcp.json` and `.mcp.json.example`": delete the untracked local `.mcp.json` (asked first) and delete `.mcp.json.example` or empty its `mcpServers`; drop the then-inert `disabledMcpjsonServers` line from `.claude/settings.local.json`; keep `.gitignore:1`; correct REVIEW-QUEUE.md § 1's "Already in use here" line. `.mcp.json.example`, `.mcp.json` (untracked), `.claude/settings.local.json` (gitignored), `docs/planning/REVIEW-QUEUE.md` (0.5) — 🔵 [2026-10-28] sibling G1 RAM session (user-relayed)
- [x] **Add a LICENSE file** — per 🔵 [2026-10-22] "Add a LICENSE file (MIT, as `package.json` already declares)": the standard MIT text with a copyright line whose year and holder you choose; `README.md`'s "License: MIT" section points at it; the vendored libraries keep their own notices. New `LICENSE`, `README.md` (0.5) — 🔵 [2026-10-22] v2 modules brainstorm

### G2. Pre-push gate `[batch]` 🟤 — hooks and tests — 4 SP

> **After G1 merges**: both edit `.husky/pre-push` and `CLAUDE.md`'s pre-push line. **This is the gate P1a waits on**: the ratchet must be in place before P1a's PR merges (the user's ruling at G5, 2026-10-27), so that P1a is its first measured phase. The merge rule is the hard part. PR #91's review took two rounds on it, and the entry's five planted cases exist to tell the candidate rules apart, so the plan writes them first. The flaky test rides here because it is the other thing that blocks a push: it has failed the pre-push gate twice and passed every repeat.
> **Model:** start Opus · `medium` (stepped up from the 3–4 SP row's Sonnet: a blocking pre-push check is a commit hook); `high` to write the plan (edge cases likely: the count and ceiling rules across a merge base are where PR #91 went wrong twice) → execute Sonnet · `high` (verification is the acceptance: the five planted cases); review `max` (the row's `high`, one level up for the hook) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [x] **Build the blocking renderer line ratchet** — per 🟤 [2026-10-27] "Build the blocking renderer line ratchet: a pre-push check that fails when `media-viewer.js` is over a committed ceiling": a committed ceiling file; the check runs at pre-push on the pushed tip, before the E2E decision, with a `SKIP` token; it fetches `origin/main` and measures what the merge would carry (the count is `origin/main`'s plus the branch's net renderer change since the merge base; the ceiling is the branch's if the branch changed the ceiling file since the merge base, else `origin/main`'s; both sides changed it → refuse with "merge `origin/main` first"). **Acceptance**: the entry's five planted cases, each shown able to fail; the starting ceiling is the count on `main` when it lands (11,529 at `e0b2a16`, unless G3 merges first). New `scripts/` check and ceiling file, `.husky/pre-push`, `tests/`, `CLAUDE.md`, `docs/planning/GOALS.md` (3) — 🟤 [2026-10-27] G5 strategic-doc refresh (v2 spec § 19), the user's ruling on D23
  - ↳ **2026-10-30, a side agent's note relayed by the user, then measured: this check will break G1's hook test unless the plan updates its stub.**
    - `tests/check-e2e-needed.test.js`'s pre-push hook test puts a stub `node` first on PATH. The stub answers *every* `node` call with the gate's canned token, and its first call reads all of git's ref lines from stdin.
    - Measured with a copy of today's hook plus `node scripts/check-line-ratchet.js || exit 1` before the gate line. The stub answered that call and used up the ref lines. The gate call then printed `STDIN-LOST`, the hook ran E2E, and the SKIP control failed. Today's hook passes.
    - **In the plan:** make the stub answer only `scripts/check-e2e-needed.js`, and hand any other script to the real `node` (for example `exec "$(PATH=${PATH#*:} command -v node)" "$@"`). Do not weaken the test.
    - Keep the SKIP control's `STUB-GATE` marker and the `beforeAll` resolution check. Add a hook-test row for the ratchet's own pass and fail.
- [x] **Fix the flaky tournament E2E "Ctrl+A undo restores the previous pair after a pick"** — per TODO 🟠 (← 🟤 [2026-10-11]): `tiny.mp4`'s decode-failure skip lands after the test captured "before"; drop `tiny.mp4` from this test's fixtures, or wait for the skip to settle. **Acceptance**: the flake is reproduced on demand before the fix (the skip forced to land late), then the test passes on repeat. `tests/e2e/tournament-mode.test.js` (1) — TODO 🟠 [2026-10-19] ← 🟤 [2026-10-11] G1 closeout

### G3. Rating data that can't go wrong `[batch]` 🟤 🏆 — file and rating safety — 8 SP

> **Tuesday to Thursday (run Thu–Sat)**, independent of G1 and G2 except for the ratchet: if G2 has merged first, G3's PR raises the ceiling by an explicit edit of the ceiling file, which the ruling allows (v2's "net ≤ 0" binds v2 phases), and it is the first use of that raise path. The throughline is ROADMAP principle 2, "No data loss": every member can leave a file in the wrong folder, or a rating, a label or a cache entry lost, and each was filed as pre-existing. **Phase 0 per member**: reproduce on `main`, or show its RED test failing, before the fix; most entries name a mechanism from a code reading, and only the first names a probe. The file-move handlers in `main.js` are Tier 1 (PROJECT.md), so a change there needs the user's explicit approval; none is expected, since the quit save and the crash handler sit outside them.
> **Model:** start Opus · `high` (the 8+ SP row: edge cases likely across the renderer's moves, undo, the quit path and main); `xhigh` to write the spec and plan (deeper reasoning) → execute Opus · `medium`, Sonnet · `medium` for steps the plan spells out; review deep (`max`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)
> ↳ **2026-10-30 (G2 closeout, PR #94 merged `a80cc37`): merge `main` into any branch cut before it, before G3's next push, so the line ratchet runs.** Git runs the pre-push hook from the files of the branch that is checked out, so an older branch skips the ratchet until it has `main`'s hook; the push to `main` is the backstop, and it refuses a renderer over the ceiling.

- [ ] **Undo can return a file to the wrong folder** — per 🟤 [2026-10-22] (feature-cache wipe fix closeout; file safety, flagged there as possibly above 🟤): file actions and undo refuse while `_folderLoadInFlight` (quietly for ratings), and undo restores to the directory of the entry's `originalPath`; check `moveToSpecialFolder`, `moveComparePair`, the batch and the drop-zone path the same way, since only the single-mode Like was probed. `media-viewer.js` (`moveCurrentFile`, `handleCancel`, `moveToSpecialFolder`, `moveComparePair`, `dislikeSkippedFiles`) (2)
- [ ] **Bulk-rated saves can still land out of order** — per 🟤 [2026-10-25] (G2 PR 2 closeout; the ratings exist nowhere else): a coalescing single-flight `saveBulkRatedFile` in the renderer. It also closes 🟤 [2026-10-12] "`.bulk_rated.json` writes are not atomic, and saves overlap", whose atomic half PR #87 delivered. `media-viewer.js` (`saveBulkRatedFile`, `removeFileFromList`) (1.5)
- [ ] **Single-move and special undo drop the file's bulk-rated membership and prediction score** — per 🟤 [2026-10-12] (G2 closeout): record `bulkBucket` and `score` on those history entries and restore them on undo, as the like-or-skip batch does. `media-viewer.js` (`moveCurrentFile`, `moveToSpecialFolder`, `handleCancel`) (1)
- [ ] **The AI sort's apply drops files from the list** — one fix for two entries: 🟤 [2026-10-12] "`applyPredictionSortResult` silently drops listed files the sort result omits" (files with no features) and 🟤 [2026-10-21] "`applyPredictionSortResult` drops live files missing from the AI result" (files added during the sort). Apply through `SimilaritySort.alignToLive`, as the similarity sort does, so that both kinds stay listed. `media-viewer.js` (`applyPredictionSortResult`) (1)
- [ ] **Tournament resume reconciles against a stale file list** — per 🟤 [2026-10-21] (G2 PR 1 closeout): Continue reconciles against the file list when it is pressed, not when the prompt opened. `media-viewer.js` (the resume prompt, `handleResumeReconciled`) (0.5)
- [ ] **No save at app quit** — per 🟤 [2026-10-22] (feature-cache wipe fix closeout; spec § 10's residual): a visit's last ≤ 30 s of extraction is lost on quit. `media-viewer.js`, `main.js` (1.5)
- [ ] **Main installs no `uncaughtException` handler** — per 🟤 [2026-10-22] (feature-cache wipe fix closeout): a process-level handler that logs through `logger.js`. `main.js`, `logger.js` (0.5)

### G4. AI research loose ends `[batch]` 🟤 — AI sorting research — 3 SP

> **Thursday (run Saturday)**, with you in the loop: you name the like and dislike folders, and the harness runs locally. **This repository is public**: only overall numbers (AUC values, label counts, timings) enter git, while file lists, per-file scores, embeddings and manifests made from your folders stay in the session scratchpad or `userData` (GOALS § Constraints; spec § 15). The research branch (43 files, +17,189 lines against `main`, measured 2026-10-28) is checked for personal data before its PR opens. A1 itself (~3 SP, 🟤 [2026-10-27]) is not in this group: it is gated on this check's numbers and goes to a later week.
> **Model:** start Opus · `medium` (stepped up from the 3–4 SP row's Sonnet: a personal-data check before a public push is safety-critical) → execute Sonnet · `medium`; review standard (`high`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)
> ↳ **2026-10-30 (G2 closeout, PR #94 merged `a80cc37`): merge `main` into any branch cut before it, before the group's next push, so the line ratchet runs.** Git runs the pre-push hook from the files of the branch that is checked out, so an older branch skips the ratchet until it has `main`'s hook; the push to `main` is the backstop, and it refuses a renderer over the ceiling.

- [ ] **Open the AI-sorting research's own PR** — per 🟤 [2026-10-25] "Open the AI-sorting research's own PR (`research/local-ai-sorting`, commit `96d9b22`)": check the report and the prototype for personal data, rebase onto `main`, and add the `docs/README.md` row by hand (the entry's steps). `docs/research/2026-10-22-ai-sorting.md`, `prototypes/ai-sorting/`, `docs/README.md` (1.5) — 🟤 [2026-10-25] v2 modules spec closeout
- [ ] **Run the research harness on your own like/dislike folders** — per 🟤 [2026-10-27] "Run the AI-sorting research harness on the user's own like/dislike folders, committing only overall numbers": cross-validated locally, nothing uploaded; it needs the previous item's tree. A summary of overall numbers only (1.25) — 🟤 [2026-10-27] G5 strategic-doc refresh (v2 spec § 19)
- [ ] **Decide the parked source-CLIP reuse branch** — per 🟤 [2026-10-16] "Decide the parked source-CLIP reuse branch": its before run measured CLIP for moved files at ≤ 1.2 s, about 1% of a sort, so the proposal is to delete the local branch `g3-departed-clips-parked` (`e11b36e`), asked before the delete. Nothing in git beyond the branch (0.25) — 🟤 [2026-10-16] G3 closeout

### G5. `CLAUDE.md` byte-trigger re-set `[solo]` 🟡 — pre-commit size warning — 1 SP

> **Friday (run Sunday)**, after G1, so that its push skips E2E, and last of the code groups, so that it measures the week's own `CLAUDE.md` edits (G1 and G2 both change it). A solo 1-SP group under the 2-SP floor's deadline-bound escape (Notes): the entry and the size-audit spec § 6.2 tie it to Cleanup Week #5, and no 🟡 domain-mate is selected. `CLAUDE.md` is 66,944 bytes against `BYTE_TRIGGER` = 69,000 (measured 2026-10-28).
> **Model:** start Sonnet · `medium` → same session, no switch (the 1–2 SP row); review light (`medium`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Measure `CLAUDE.md`'s growth under the authoring rule, and re-set `BYTE_TRIGGER`** — per 🟡 [2026-10-17] "Measure `CLAUDE.md`'s growth under the authoring rule at Cleanup Week #5, and re-set `BYTE_TRIGGER` there": take the per-commit byte deltas since the G5 merge (`git log -p 3fb797e.. -- CLAUDE.md`), then set the trigger to the size at this measurement plus about one Cleanup-Week cycle of measured growth, rounded up to the next 1,000. `scripts/check-claude-md-size.js` (`BYTE_TRIGGER` and its comment) (1) — 🟡 [2026-10-17] G5 closeout (PR #82)

### G6. Weekly Reviews `[batch]` ⚪ Overhead — research / process — 5 SP

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. **Window ≈ 5 days** (last run 2026-10-27). **Order**: § 5's queue is at 0, so there is no trial read-out. The **recurring plugin context-cost read-out** runs first: it belongs to this Cleanup Week's run (§ 5 stocktake 2026-10-27), with the `session-report` usage step added on 2026-10-27 and the enabled-set changes that stocktake lists. Then §§1–4. §1 diffs plugin names from the pinned baselines (official `a29a80b`, community `06ec7b6`). Through a PR, as the last two runs were.
> **Model:** Opus · `medium`, named directly because ⚪ overhead fits no row of the § 1.0 table: research and verdicts, with each claim checked against its primary source; Sonnet · `medium` is enough for the routine sourcing searches.

- [ ] **Plugins (2 SP)** — two independent tops: official catalog + wider internet, each with `source:`.
- [ ] **Claude best-practices (1 SP)** — a fresh check against the parked list.
- [ ] **Non-Claude AI best-practices (1 SP)** — the same, for AI models and tools other than Claude.
- [ ] **Cross-project propagation (1 SP)** — outbound: this week's shipped work (G1–G5) and the memory files changed since 2026-10-27, at the high bar; inbound: new sibling rows naming this repo; and the status of the three TODO § Spawned Tasks rows still handed over (two from 2026-10-17, re-handed 2026-10-27, and one from 2026-10-27).

---

## Daily Schedule

### Monday, October 26 (run Wednesday, October 28) — Cheaper pushes first

> G1 first: its merge is what lets G2's and G5's pushes skip E2E.

- **[G1](#g1-repo-chores-batch---repo-tooling--3-sp)** 🔵 — the SKIP list with both-ways tests, Context7, the LICENSE; review; merge. ✅ PR #93 (merge `4894a13`, 2026-10-30, after three review rounds).
- **[G2](#g2-pre-push-gate-batch---hooks-and-tests--4-sp)** 🟤 — the ratchet's plan, with the five planted cases written first (part 1 of 2). ✅ PR #94 (merge `a80cc37`, 2026-10-30, after three review rounds).

**Daily total**: ~4 SP

### Tuesday, October 27 (run Thursday, October 29) — The gate P1a waits on

- **[G2](#g2-pre-push-gate-batch---hooks-and-tests--4-sp)** 🟤 — build the ratchet; the flaky test; review; merge (part 2 of 2). ✅ PR #94 (merge `a80cc37`, 2026-10-30, after three review rounds).
- **[G3](#g3-rating-data-that-cant-go-wrong-batch----file-and-rating-safety--8-sp)** 🟤 🏆 — Phase 0 reproductions; spec and plan (part 1 of 3).

**Daily total**: ~5 SP

### Wednesday, October 28 (run Friday, October 30) — Rating data, build

- **[G3](#g3-rating-data-that-cant-go-wrong-batch----file-and-rating-safety--8-sp)** 🟤 🏆 — implement, each fix after its RED test (part 2 of 3).

**Daily total**: ~4 SP

### Thursday, October 29 (run Saturday, October 31) — Rating data lands; the research

- **[G3](#g3-rating-data-that-cant-go-wrong-batch----file-and-rating-safety--8-sp)** 🟤 🏆 — review; merge (part 3 of 3).
- **[G4](#g4-ai-research-loose-ends-batch---ai-sorting-research--3-sp)** 🟤 — the research PR; your real-data run; the parked branch.

**Daily total**: ~5 SP

### Friday, October 30 (run Sunday, November 1) — The trigger; reviews

- **[G5](#g5-claudemd-byte-trigger-re-set-solo---pre-commit-size-warning--1-sp)** 🟡 — measure; re-set; review; merge.
- **[G6](#g6-weekly-reviews-batch--overhead--research--process--5-sp)** ⚪ — the context-cost read-out, then §§1–4.
- Buffer for review rounds. Closeout per group, **after its merge**: Summary-Table Status → `✅ PR #N`, the group's Daily-Schedule rows, and every BACKLOG/TODO entry it closed — in the closeout commit.

**Daily total**: ~1 SP + 5 overhead + buffer

---

## Summary Table

| ID  | Group                                         | Domain                  | Source      | Tasks  | Total SP | Day     | Status     |
| --- | --------------------------------------------- | ----------------------- | ----------- | ------ | -------- | ------- | ---------- |
| G1  | Repo chores `[batch]`                         | Repo tooling            | 🔵 User     | 3      | 3        | Mon     | ✅ PR #93  |
| G2  | Pre-push gate `[batch]`                       | Hooks and tests         | 🟤 Auto     | 2      | 4        | Mon–Tue | ✅ PR #94  |
| G3  | Rating data that can't go wrong `[batch]` 🏆 | File and rating safety  | 🟤 Auto     | 7      | 8        | Tue–Thu | ☐ Planned  |
| G4  | AI research loose ends `[batch]`              | AI sorting research     | 🟤 Auto     | 3      | 3        | Thu     | ☐ Planned  |
| G5  | `CLAUDE.md` byte-trigger re-set `[solo]`      | Pre-commit size warning | 🟡 Ops      | 1      | 1        | Fri     | ☐ Planned  |
| G6  | Weekly Reviews `[batch]`                      | Research / process      | ⚪ Overhead | 4      | 5        | Fri     | ☐ Planned  |
|     | **Total (quota-counted)**                     |                         |             | **16** | **19**   |         |            |
|     | **Total (incl. ⚪ overhead)**                 |                         |             | **20** | **24**   |         |            |

_Source legend: 🔵 User · 🟡 Ops · 🟤 Auto · ⚪ Overhead (exempt from the quota denominator)._
_Status cell on completion: `✅ PR #N` where a PR was opened (every group since 2026-09-10 has been), else `✅ <merge-SHA>` — never a bare `✅`. Flip it in the closeout commit, which runs after the merge, together with the group's Daily-Schedule rows and every BACKLOG/TODO entry the group closed. Day = the header day; each runs two days later (Context)._

---

## Notes

- **Theme.** The user chose the recommended blend of A ("clear the runway for v2": the gate P1a waits on and cheaper pushes) and B ("rating data that can't go wrong") over C, public-repo hygiene (the profile-path and folder-name sweep with its check, the LICENSE, the README's Windows steps, Context7, ARCHITECTURE's file tree). C's two 🔵 XS items ride G1. **First pull-in if the week runs fast**: 🟤 [2026-10-27] "Remove the user's local profile paths and real folder names from the live docs, and add a check that stops new ones" (S + S).
- **Dates (user ruling, 2026-10-28).** The plan is written as of Sunday 2026-10-25, so the header is this week, Oct 26–30, at a full week's capacity, and it executes Wed Oct 28 – Sun Nov 1. Monday and Tuesday of the header week carried the Oct 19–23 plan's spillover (its G3–G6, archived below), so none of this plan ran on them. Sunday Nov 1 is two days past the Friday, inside the close-out gate's grace: no `**Spillover**` line is needed unless delivery runs past it.
- **v2's weekly share — decided (user ruling, 2026-10-28): "Most".** v2 takes ~12 of a normal week's ~17 🔵 SP, and ~5 SP stay for other 🔵 picks (the sorting-session follow-ups, by the G5 ruling). Not chosen: the whole share (~17 SP; the end-of-Q1 date would have held while the follow-ups waited) and half (~9 SP; about July 2027). By the spec's own method (131–136 SP, ~1.9× slip, Cleanup Weeks included), v2 complete moves from end of Q1 to **about May 2027 (soft)**. The pilot (P1a + P1b), scaled the same way, moves from mid-December to **early January 2027 (soft)**, which is my call. ROADMAP, MILESTONES and GOALS are updated in this planning commit, as a status edit and not a refresh. The share does not touch this week: a Cleanup Week schedules no v2 phase.
- **Sizing and drop order.** 19 quota-counted SP. Velocity reference: Oct 19–23 planned 23 and delivered ~36.5 SP of actual scope (+5 overhead) over Oct 18–27, ~1.6× low; Cleanup Week #4 ran 28 SP in five days on scoped fixes. **Overrun drop order**: G4 first (to Nov 2–6, beside P1a; it gates A1, not P1a), then G3's tail spills with a `**Spillover**` line. **Never drop** G1 or G2: P1a waits on G2, and G2's pushes on G1. G5 is due this week by its entry; it moves only with a recorded reason.
- **Dependencies.** G1 → G2 (both edit `.husky/pre-push` and `CLAUDE.md`'s pre-push line). G3 is independent of both, but raises the ceiling explicitly if G2 merged first. G4's harness run needs its PR's tree. G5 after G1 and after the other code groups. G6 last.
- **Cleanup Week shape.** 🟤 is the majority (15 / 19), across three groups (G2, G3, G4), as the inverted quota expects. The 🔵 exception is G1 at 3 SP, my call, delegated by the user ("size as you think fits better"): the TODO 🟠 gate fix the user ruled "next" on 2026-10-26, plus the two 🔵 XS items that fit its one-PR repo-chores shape. The standing risk is the 🟤 inflow: Cleanup Week #4's own closeouts and reviews filed 38 new 🟤 entries (measured 2026-10-10), so this week's closeouts will file theirs under their own dates, as usual.
- **Solo 1-SP exception.** G5 sits under the 2-SP floor (Task Grouping rule 7) and is scheduled by its deadline-bound escape: the 🟡 entry and the size-audit spec § 6.2 tie the re-set to Cleanup Week #5. No other 🟡 item shares its domain. The 🟡 [2026-07-10] E2E-gate friction watch is closed by G1's closeout annotation rather than scheduled.
- **Branch / PR shape.** Five code branches (G1–G5), each through a PR, as every group since 2026-09-10 has been. G6 through a PR as well, as the last two runs were.
- **Public repository.** G4 handles your own folders, so only overall numbers enter git. G3 is a correctness batch, not a security fix, so no stub-level disclosure applies.
- **Reaps — nominated in the brainstorm, user-approved and executed 2026-10-28** (entry bodies deleted, tombstone rows in Rejected Ideas; no touched header carried a count). Each premise was checked first-hand against `main`:
    1. 🟤 [2026-03-22] PR #19 _"Add `transition-delay: 0s` to fullscreen overlay rule"_ — a "fixed, keeping for reference" note: fixed in `74cf251` (on `main`), and `styles.css` has 0 `transition-delay` hits.
    2. 🟤 [2026-03-21] PR #18 _"Mark code-review-pr-17 BACKLOG items as done when fixing them"_ — its own body says "Fixed in post-merge cleanup"; the closeout rule now checks off every entry a task closed.
    3. 🟤 [2026-03-21] TASK-020 _"Content-understanding features"_ — delivered: the model takes 576 inputs, 64 hand-crafted plus 512 CLIP (`ml-model.js:6`).
    4. 🟤 [2026-03-20] TASK-017 _"Audit remaining CLAUDE.md Git Insights for stale references"_ — no per-task Git Insights entries remain to audit, and the whole file is audited quarterly (§ Maintenance; last by G5, PR #82).
    5. 🔵 [2026-05-05] _"Overlay buttons have 3-stage 'jumping' hover/leave transition"_ — user-raised, reaped by the user's ruling: the cause it named is gone (`.media-overlay-controls` has one 0.3 s opacity fade; the controls were rebuilt in PR #70).
- **Considered, not reaped**: 🟤 [2026-03-20] TASK-016 _"Investigate transient Vitest 'No test suite found' failures"_ — it recurred on 2026-10-24 in another form (`Tests  no tests` under a lowercase `c:` working directory), root cause still unproven; 🟤 [2026-10-12] _"`.bulk_rated.json` writes are not atomic, and saves overlap"_ — half delivered by PR #87, and the rest closes with G3, so it is checked off there.
- **Looking ahead (the Nov 2–6 planning pass)**: v2 P1a under the ~12-SP share, its plan written when it is scheduled; A1 once G4's real-data numbers are in; the downloader research question before P3b.
- _Brainstorm sanity-checks (user-in-the-loop, 2026-10-28): week dates set by user ruling to Mon Oct 26 – Fri Oct 30, 2026, planned as of Sunday 10-25 and written Wednesday 10-28 (git: last commit `d639e1c` today; no DONE entry for this week's groups); the previous plan (Oct 19–23) **spilled to 2026-10-27**, four days past its Friday, as its `**Spillover**` line records, and Cleanup Week #5 fell due inside that spillover (overdue, run now); nothing was delivered before its header Monday (G1 was built on Sunday 10-18 and merged on Monday 10-19); two off-plan PRs ran in it (#86, put in G2's order by user ruling, and #88, the v2 spec); no week went unplanned; velocity 23 planned → ~36.5 actual + 5 overhead over ~9 days (~1.6×) → ~19 planned for five execution days, agreed; Cleanup Week **due and overdue**; quotas satisfiable in the inverted form; five reap nominations put in-dialogue, all approved and executed; owner queue N/A (no OWNER-QUEUE.md); v2's weekly share decided in-dialogue ("Most")._

### Quota Check

- 🔵 **User-Flagged SP**: 3 / 19 (**16%**) — ⚠️ **below the normal ≥50% floor BY DESIGN** — inverted-quota Cleanup Week; G1 is the sanctioned 🔵 exception, sized at 3 SP (my call, delegated by the user on 2026-10-28; Cleanup Week #3's was 3, #4's 7). G1's gate task is a TODO 🟠 carry-forward and counts against its origin section (🔵, the G4 session's report of 2026-10-26).
- 🟡 **Operational SP**: 1 / 19 (**5%**) — ✅ ≤25% (G5).
- 🟤 **Auto-Generated SP**: 15 / 19 (**79%**), **3 groups** (G2, G3, G4) — **inverted**: multiple 🟤 groups are expected in a Cleanup Week (the ≤1-group / ≤25% caps are suspended); 🟤 is the majority of scheduled work. G2's flaky-test task is a TODO 🟠 carry-forward and counts against its origin section (🟤, the G1 closeout of 2026-10-11).
- **Cleanup Week status**: **ACTIVE** (5th; overdue — fell due October 26–30, inside the previous plan's spillover through 2026-10-27)
- **Last Cleanup Week**: October 5–9, 2026 (the 4th). Next expected ~3 weeks after this one (~November 16–20, 2026).
- **Compliance**: ✅ Cleanup-Week quotas met — 🟤 is the majority of quota-counted work, 🟡 ≤25%, 🔵 limited to the sanctioned exception. ⚠️ The deviation from _normal-week_ quotas (🔵 < 50%) is the rule-defined shape of a Cleanup Week, not a violation.
- _Denominator note_: Y = total quota-counted SP (19) — the exempt ⚪ Overhead Weekly Reviews batch (G6, 5 SP) is excluded; 24 incl. overhead. No Deploy Window (auto-deploy: no).

---

## Weekly Challenge 🏆

**Rating data that can't go wrong** (Group G3, Tue–Thu; run Thu–Sat).

**Why this one**: a Cleanup Week may take an auto-generated correctness item as its challenge, and this one protects what the app exists to keep: where your files live and how you rated them, ratings that exist nowhere else (ROADMAP principle 2, "No data loss"). The stretch is the proof: each of the seven fixes lands behind a reproduction that fails on `main` first, and the undo-to-the-wrong-folder case needs a timing probe around a live folder load, the kind of race the recent closeouts found hardest to pin.

---

## Previous Week Summary

### Week: October 19 – October 23, 2026 — 🟢 Normal week ("stop the renderer's growth") — ✅ Complete, but **spilled to 2026-10-27** (all six groups merged)

**Spillover**: through 2026-10-27, four days past the Friday, recorded in the plan's header on 2026-10-25. G1 merged on its Monday (2026-10-19) after a Sunday build, G2 PR 1 on 10-20, G2 PR 2 on 10-25, G4 and G3 on 10-26, and G5 and G6 on 10-27. Two off-plan PRs ran inside it: the feature-cache wipe fix (PR #86 `654fb3e`, 10-22, put in G2's order by user ruling) and the v2 modules spec (PR #88 `e1c4e03`, 10-25). Cleanup Week #5 (Oct 26–30) fell due inside the spillover, so it was planned late, on 2026-10-28, and runs in its own header week. No week went unplanned. Archived under its **true** header week.

**Result**: 23 SP quota-counted planned + 5 overhead; about 36.5 SP of actual scope after the re-estimates, all six groups merged. **G1** page-load confinement (PR #84 `4548269`, ~7 SP): the window is served from `app://media-viewer/`, page-side media loads go through main's read rule, and the CSP became a response header. **G2 🏆** hash and similarity sort off the renderer thread (PR #85 `f668611` and PR #87 `f5ddfa3`, ~14.5 SP): the end-of-sort fixes, then a per-run pool of hash workers behind a pixel-exact canary; on the user's real folder a cold hash phase took 580 s in the background against 1,262 s frozen, which closed TODO 🔴 "Speed up AI / similarity sorting…" and GOALS Objective 1. **G3** ZoomManager extraction (PR #90 `082e3b2`, ~8 SP): `zoom.js`, −416 renderer lines, pixel-identical screenshots, and four older zoom bugs fixed. **G4** formatter hook per-edit cost (PR #89 `7f75013`, ~2 SP): medians 1,384 → 65 ms and 229 → 83 ms. **G5** strategic-doc refresh (PR #91 `7fb9978`, ~5 SP): v2 on the board, Objective 1 achieved, and the blocking line-ratchet ruling. **G6** Weekly Reviews (PR #92 `c5ac35f`): `onFailure` keep, `typescript-lsp` drop; 1 adopt / 3 pass. Test deltas in [DONE.md](DONE.md), not restated here.

**Velocity learning**: planned SP ran ~1.6× low (23 → ~36.5), and the tail was review rounds again (G2 PR 2 five, G3 four, G5 three). The theme held only in part: the renderer went 11,451 → 11,945 (after PR #85–#87) → 11,529 lines, +78 net over the week, which is why v2 forbids growth in any phase and G5 ruled a blocking ratchet. Process learning: 174 🟤 entries are open in sections dated 2026-10-11 → 2026-10-27 (measured 2026-10-28).

### Week: October 12 – October 16, 2026 — 🟢 Normal week ("make the real sorting session work") — ✅ Complete; finished 2026-10-18, two days past its Friday

**Early and late**: G1 merged on 2026-10-11, the Sunday **before** the header Monday. G5 merged on 2026-10-17 and G6 on 2026-10-18, inside the close-out gate's 2-day grace, so no `**Spillover**` line was needed. No week went unplanned (Oct 5–9, Oct 12–16, Oct 19–23). Archived under its **true** header week.

**Result**: 22 SP quota-counted planned + 5 overhead, all six groups merged; about 41.5 SP of actual scope after the re-estimates. **G1** High security findings fix (PR #78 `e5cd3a8`, ~13.5 SP): every privileged IPC channel registers through `ipc-guard.js`, file paths must lie inside user-picked folders (`path-grants.js`), the renderer sinks build DOM nodes, saved tournament state is validated, and a CSP plus a navigation lock add depth; one residual, I1, went to TODO 🔴. **G2 🏆** like-or-skip flow (PR #79 `96467f7`, ~13 SP): skips tracked on the AI order, "Dislike N skipped" as one guarded batch with one undo, and the "↻ Re-sort · N new" chip. **G3** stop the retrain on every AI sort (PR #80 `bf6fcad`, ~5 SP, re-scoped after the before run disproved its premise): `_releaseVideo` and a bounded lenient CLIP decode made the model cacheable — a repeat sort went from 119.8 s to 5.9 s. **G4** recently opened folders (PR #81 `51af1ab`, ~5 SP): a drop-zone list and a header ▾ menu, and `loadFolder` single-flight after the review found a cross-folder ratings write. **G5** `CLAUDE.md` size audit (PR #82 `3fb797e`, ~5 SP): 64,203 → 58,582 bytes with no rule lost, and a never-blocking byte-trigger warning. **G6** Weekly Reviews (PR #83 `1954109`): 1 adopt / 3 pass; *You should know* → `keep`; `typescript-lsp` re-vehicled once. Test deltas in [DONE.md](DONE.md), not restated here.

**Velocity learning**: planned SP ran ~1.9× low (22 → ~41.5) — G1 grew 2.7× and G2 1.6×, mostly in their deep reviews — yet every group shipped within two days of the Friday. Process learning: the week's closeouts filed **66** new 🟤 entries (measured 2026-10-18), and the renderer grew 9,989 → 11,451 lines, which made the next week an extraction week.

### Week: October 5 – October 9, 2026 — 🧹 Cleanup Week (4th, overdue) — ✅ Complete, on time (all five groups merged inside the header week)

**Not planned**: Sep 28 – Oct 2 — no plan and no commits (2026-09-25 → 2026-10-03); the Sep 7–11 plan's spillover ended 2026-09-24 and the Oct 5 planning pass did not record the gap. Recorded here, at the next planning pass.

**Result**: 23 SP quota-counted + 5 overhead, each group merged in a single day — four of the five a day ahead of the schedule. **G2** hooks and logs that actually fire (PR #73 `83c6df0`, Mon): `.claude/settings.json` versioned, the dead `preload.js`/`.env` guard replaced by `permissions.ask` rules plus a shell hook, the Prettier hook formats only the edited file, a `SKIP=<check>` bypass, and session logs kept across a clean quit (newest 10). **G1 🏆** single-mode rating safety (PR #74 `0bdcdb3`, Tue): Phase 0 reproduced the held-Like freeze (a stale `forceVideoCleanup` nulled the next render's media); fixed with a repeat filter, the `_fileOpInFlight` guard over all five file-acting methods and the narrowed cleanup, plus the single-mode `1` hotkey, derived tooltips and a text-field shortcut guard. **G3** tournament render re-entry (PR #75 `482a3c8`, Wed): one render owner and one failure path; the five-run acceptance bar passed on unfixed `main`, so acceptance moved to RED-first E2E. **G4** `claude-security` trial (PR #76 `44c282b`, Thu): leg 1 read out `keep`; five distinct findings re-derived, the Highs filed as public stubs plus a TODO 🔴. **G5** Weekly Reviews (PR #77 `0e298b4`, Fri). Test deltas in [DONE.md](DONE.md), not restated here.

**Velocity learning**: 28 SP inside five days — scoped fixes with ready repros run fast. Process learning: the Cleanup Week's own closeouts and reviews filed **38** new 🟤 entries (measured 2026-10-10), the inflow pattern Cleanup Week #3 recorded; and an acceptance bar written at planning (G3's five-run bar) had to be re-founded at execution, because it passed on unfixed code.

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
