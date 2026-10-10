# Weekly Plan

**Week**: Monday October 12 – Friday October 16, 2026
**Created**: 2026-10-10
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md (all `Last Updated` 2026-08-27 — 44 days, under the 2-month bar, which falls on 2026-10-27; no shipped work contradicts them, see Notes → strategic docs), BACKLOG.md (📌 Process Rules; 🔵 [2026-10-04] and [2026-07-01]; 🟡 [2026-09-21]; the 🟤 [2026-10-08] G4 stubs; an obsolescence sweep of every open 🟤 and 🟡 entry for the reap step), TODO.md (🔴 security findings, 🔴 24k-sort PR2 remainder), git log (last 2 weeks: Cleanup Week #4's five merges `83c6df0`, `0bdcdb3`, `482a3c8`, `44c282b`, `0e298b4` and their closeouts through `a733b95`; the 2026-10-04 intake `a1f2b03`), previous WEEKLY.md (Oct 5–9 — on time, archived below), REVIEW-QUEUE.md (§§1–5; last run 2026-10-09). Live-config drift check: N/A — this repo keeps no live-config sync. OWNER-QUEUE.md: absent.
**Cleanup Week?**: **No — normal week.** Cleanup Week #4 ran Oct 5–9 and finished inside its week; #5 is due ~October 26–30. The 🟤-size trigger technically fires (38 open 🟤 entries filed since 2026-10-05, measured 2026-10-10, nearly all by #4's own closeouts and reviews), but it has fired continuously since June (250 open 🟤 in total), so the cadence governs. A second Cleanup Week in a row would starve 🔵 work, which last led a week on Sep 7–11.
**Context**: Roadmap phase _Scale & Modularize_; active milestone _v2.0 modularization_ (renderer `media-viewer.js` at 9,989 lines, measured 2026-10-10 — +271 since Oct 5; no extraction is scheduled this week). This week's agreed theme is **"make the real sorting session work"**: the like-or-skip workflow the user found while splitting `Liked_2` into `Liked_3`/`Liked_1` — a bulk "dislike the skipped files" action and an out-of-date AI-order hint (🏆 G2), source-folder vector reuse on a training-cache miss (G3) and recently opened folders (G4) — behind a front-loaded fix for the three High security findings (G1), whose file-IPC authorization and HTML encoding the new features build on. The overdue `CLAUDE.md` audit (G5) and Weekly Reviews (G6) close the week.

---

## Parallel Work

- **Auto-deploy: no** (Electron desktop app; a single `main` trunk with no production branch; no `.github/workflows/` and no deploy step — GOALS § Constraints "No CI service"). No Deploy Window group.
- **User-in-the-loop steps** (part of their groups; listed here so they are visible in one place): **Tue** — start `/claude-security` _Scan changes_ on G1's fix diff (the plugin is `disable-model-invocation`, so only the user can); **Wed** — G3's before/after run on the real `Liked_2` → `Liked_3`/`Liked_1` folders (~10 min, confirmed by the user 2026-10-10); **G2's session** — enable the _You should know_ mod; **Fri** — possibly start `/doctor prompt-audit` for G5.
- **User-side 24k smokes (optional, not gates)**: PR #66 re-smoke round 2, still never run; a first real-folder look at Cleanup Week #4's single-mode file-op guard (PR #74) and tournament failure skip (PR #75).
- **Strategic-doc clock**: ROADMAP / GOALS / MILESTONES `Last Updated` 2026-08-27 crosses the 2-month bar on **2026-10-27**, inside Cleanup Week #5's window — that week's planning files the 🟡 refresh entry (README § Strategic Review) if nothing has refreshed them first.

---

## Task Groups

### G1. High security findings fix `[solo]` 🟤 — main-process file IPC + renderer HTML encoding — 5 SP

> **Front-loaded to Mon–Tue**: G2's bulk move and G4's reopen-by-path both go through the file IPC this group authorizes, and G2's confirmation and G4's folder list render text through the sinks it encodes — so **G2 and G4 branch after G1 merges**. **Disclosure**: this repo is public; the BACKLOG entries are stubs and the full report is local (`CLAUDE-SECURITY-20261008-084826/`, ask the owner). Keep the plan, commit messages and PR body at stub level until merge — full detail goes public in the PR only after it. `preload.js` edits prompt by design (the `permissions.ask` rules and `guard-preload-bash.js`). **Trial vehicle: `claude-security` leg 2** — the user starts _Scan changes_ on the fix diff before merge (REVIEW-QUEUE § 5; the leg's own trigger is the first PR touching `main.js` or `preload.js`).
> **Model:** start Opus · `high` — **stepped up one row** from 5–7 SP because the group is safety-critical (file-IPC authorization, possibly `preload.js`); `xhigh` to write the spec and plan (which paths the renderer may name is the design decision — deeper reasoning) → execute Opus · `medium`; review deep (`max`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Fix the High security findings from the `claude-security` scan** — per the TODO 🔴 item and the five 🟤 `[2026-10-08] From: G4 trial batch` stubs (three High; the Medium and the Low folded in): encode or validate at each named renderer boundary, make the main process authorize the paths its file IPC acts on, and confine the tournament-apply destinations to the folder. **Acceptance**: each confirmed finding has a test that fails on `main` first; _Scan changes_ on the fix diff comes back clean for these sites. Re-derive by probe where the session's cyber safeguard allows — 🟤 `[2026-10-08]` "Re-derive scan findings with a probe…" names a method. `main.js`, `media-viewer.js`, possibly `preload.js`, `tests/` (5) — TODO 🔴 [2026-10-08] ← 🟤 [2026-10-08] G4 trial batch

### G2. Like-or-skip flow `[batch]` 🔵 🏆 — single-mode AI-sort workflow — 8 SP

> The user's own way out of the "Both good" fatigue (🔵 [2026-10-04], first entry): on the AI order in single mode, like a file or skip it, then dislike the skipped ones in bulk — and see when the order has gone stale. Branch **after G1 merges**. **Trial vehicle: _You should know_** — enable it in this group's session (`/plugin enable cc-plugin-you-should-know@builtin`), measure its side-agent token cost, and read it out per REVIEW-QUEUE § 5. **Visual evidence (plan-level acceptance check)**: committed before/after screenshots of the bulk-dislike confirmation and the stale-order hint — the practice kept when evidence-gating read out `drop` (2026-10-10). The BACKLOG line numbers are as filed on 2026-10-04 — re-locate before editing.
> **Model:** start Opus · `high` (the 8+ SP row; edge cases likely — this becomes the largest file move the app makes in one action); `xhigh` to write the spec and plan → execute Opus · `medium`, Sonnet · `medium` for the hint steps the plan spells out; review deep (`max`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Bulk "dislike the skipped files" in single mode** — a skip-tracking set (files passed with Next and not rated; cleared on folder change and re-sort), one "Dislike N skipped" action behind a confirmation that shows the count, **one** batched `moveHistory` entry so a single Ctrl+A undoes the whole batch, per-file `removeFileFromList` cleanup, and `currentIndex` handling. Hold `_fileOpInFlight` for the **whole batch** (one `try/finally` around every rename) and do **not** call `moveCurrentFile` per file — a guarded method calling another is silently refused (the entry's 2026-10-06 annotation). `media-viewer.js` (`nextMedia`, `moveCurrentFile`, `removeFileFromList`, `handleCancel`), `index.html`, `styles.css`, `tests/` (5) — 🔵 [2026-10-04] manual testing
- [ ] **Show that the AI-sort order is out of date after ratings, with a one-click re-sort** — e.g. "N ratings since the last AI sort" on the sort button, and a re-sort that keeps the current file in view. Each re-sort is a full rebuild, because rating a file changes the training set (G3 makes that rebuild cheaper). `media-viewer.js` (`moveCurrentFile`, `handleSortByPrediction`, the `sortPredictionBtn` titles, `applyPredictionSortResult`), `tests/` (3) — 🔵 [2026-10-04] manual testing

### G3. Source-folder vector reuse on a training-cache miss `[solo]` 🔵 — ML training pipeline — 3 SP

> Item **(3)** of 🔵 [2026-10-04] "Explain and trim the retrain that runs after files are moved into the like folder outside the app" — its items (1) and (2) are the 🟤 entries tagged on it and stay out. A whole task, measure-first: instrument the rebuild phases into the retained session log, implement, accept on a before/after timing. **User-in-the-loop on Wednesday** (confirmed 2026-10-10): move a few files `Liked_2` → `Liked_3` in Explorer, run the AI sort on the instrumented build, then on the fix. First check: does an Explorer move preserve `mtime`? Constraints: the training-cache isolation rule (CLAUDE.md § Cache Management) allows **reading** source-folder maps, never writing training paths into them; and after an in-app move the only surviving copy of a vector is `moveHistory[].mlFeatures`. Carries no trial (it already has a user dependency). Branches after G1 only if G1 touches the feature-cache IPC; otherwise in parallel with G2.
> **Model:** start Opus · `medium` — **stepped up** from the 3–4 SP row's Sonnet because the training-cache isolation rule is load-bearing and this repo has already lost a 126 MB feature cache to a cache-write defect (PR #64) → execute Sonnet · `high` (verification matters: the change reads across the isolation boundary); review standard (`high`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Fill a training-cache miss from the source folder's vector when name, size and mtime match** — time each rebuild phase first; then, before `_collectFolderVectors` extracts a missed file from scratch, look it up in the source folder's in-memory or on-disk vectors. **Acceptance**: the user's before/after run shows the moved files no longer extracted, with both timings recorded. `ml-training.js` (`_collectFolderVectors`, `ensureTrainedModel`), `media-viewer.js` (the injected callbacks), `tests/ml-training.test.js` (3) — 🔵 [2026-10-04] manual testing

### G4. Recently opened folders `[solo]` 🔵 — folder open + empty state — 3 SP

> Added by the user at planning (2026-10-10), in place of a design-only session. Branch **after G1 merges**: reopening a folder without the dialog means the main process accepts a path the renderer supplies — exactly what G1's authorization decides — and the list renders folder names through the sinks G1 encodes. **Trial vehicle: `typescript-lsp`** (REVIEW-QUEUE § 5; the first group of the week to edit `media-viewer.js` that carries no other trial): install `typescript-language-server` and `typescript` on the host (ask first — a global install), enable `typescript-lsp@claude-plugins-official` at project scope, and confirm it ran from a `diagnostics` record in the session transcript. **Visual evidence**: committed screenshots of the drop zone with and without the list, as for G2.
> **Model:** start Sonnet · `medium` → execute Sonnet · `medium`; review standard (`high`) — the 3–4 SP row; the security design it depends on is G1's — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Add a "Recently opened folders" quick-access list** — record each successfully loaded folder (path, name, timestamp) in `localStorage` (the constructor-prefs pattern: validate, clamp), list a few in the drop zone / empty state, reopen without the folder picker, and drop entries whose folder no longer exists. `media-viewer.js` (`loadFolder`, the drop zone), `index.html`, `styles.css`, `main.js`/`preload.js` only if G1's authorization needs a reopen path, `tests/` (3) — 🔵 [2026-07-01] manual testing

### G5. `CLAUDE.md` size audit `[solo]` 🟡 — project instructions — 3 SP

> **Friday, after G1–G4 merge** — each of them may edit `CLAUDE.md`, and an audit diff on top of theirs would bury them (the reason it stayed out on 2026-09-21 and 2026-10-05). Baseline: 216 lines / 49,544 bytes (2026-10-09). Run it with the sibling repo's runbook (`docs/prompts/claude-md-audit.md` in `claude-code-universal-config`), and run `/claude-api prompt-audit` as one pass of it (reached through `/doctor prompt-audit`; the user may need to start it) — both inbound cross-references are on the 🟡 entry. **Out of scope**: the path-scoped-rules migration (🟤 `[2026-08-27]`), a natural Cleanup Week #5 item — G5 may recommend what moves, not move it.
> **Model:** start Opus · `medium` — **stepped up** from the 3–4 SP row's Sonnet: deciding what is a durable rule is judgment work → execute Sonnet · `medium` for the mechanical trims; review standard (`high`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Audit `CLAUDE.md` — past its own ~200-line trigger, and the quarterly clock has run out** — durable-rules-only, per its § Maintenance. Also closes its 🟤 twin "CLAUDE.md is over its own ~200-line soft cap" (🟤 [2026-07-03] CW-D closeout) — check both off at closeout. `CLAUDE.md` (3) — 🟡 [2026-09-21]

### G6. Weekly Reviews `[batch]` ⚪ Overhead — research / process — 5 SP

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. **Window ≈ 7 days** (last run 2026-10-09). **D4 order**: read out the trials whose vehicles have merged first — G2's _You should know_, G4's `typescript-lsp` — then source §§1–3. § 5 stands at **2** outstanding trials after the evidence-gating `drop` (2026-10-10), so one new trial `adopt` may be filed before the cap. §1a diffs the catalog from the upstream `marketplace.json` commit log since 2026-10-09 (the method 🟤 [2026-10-09] G5 closeout proposes; the local `.bak` snapshot is gone). Docs-only: merge or dated-defer in-session.
> **Model:** Opus · `medium`, named directly because ⚪ overhead fits no row of the § 1.0 table: research and verdicts, with each claim checked against its primary source; Sonnet · `medium` is enough for the routine sourcing searches.

- [ ] **Plugins (2 SP)** — two independent tops: official catalog + wider internet, each with `source:`.
- [ ] **Claude best-practices (1 SP)** — fresh check vs. the parked list.
- [ ] **Non-Claude AI best-practices (1 SP)**
- [ ] **Cross-project propagation (1 SP)** — outbound: this week's shipped work (G1–G5) and memory files changed since 2026-10-09, at the high bar; inbound: any new sibling rows naming this repo.

---

## Daily Schedule

### Monday, October 12 — Security fix: design and RED tests

> G1 goes first because G2 and G4 build on it.

- **[G1](#g1-high-security-findings-fix-solo---main-process-file-ipc--renderer-html-encoding--5-sp)** 🟤 — spec and plan at stub level; a test per finding that fails on `main`; start the fix (part 1 of 2)

**Daily total**: ~3 SP

### Tuesday, October 13 — Security fix lands; like-or-skip starts

- **[G1](#g1-high-security-findings-fix-solo---main-process-file-ipc--renderer-html-encoding--5-sp)** 🟤 — finish; the user starts _Scan changes_ (leg 2); review; merge (part 2 of 2)
- **[G2](#g2-like-or-skip-flow-batch----single-mode-ai-sort-workflow--8-sp)** 🔵 🏆 — branch after G1 merges; spec and plan (part 1 of 3)

**Daily total**: ~3 SP

### Wednesday, October 14 — Bulk dislike; the real-folder run

- **[G2](#g2-like-or-skip-flow-batch----single-mode-ai-sort-workflow--8-sp)** 🔵 🏆 — bulk "dislike the skipped files" (part 2 of 3)
- **[G3](#g3-source-folder-vector-reuse-on-a-training-cache-miss-solo---ml-training-pipeline--3-sp)** 🔵 — instrument; the user's before run; implement; the user's after run; review; merge

**Daily total**: ~7 SP

### Thursday, October 15 — Like-or-skip lands; recent folders

- **[G2](#g2-like-or-skip-flow-batch----single-mode-ai-sort-workflow--8-sp)** 🔵 🏆 — stale-order hint; screenshots; review; merge (part 3 of 3)
- **[G4](#g4-recently-opened-folders-solo---folder-open--empty-state--3-sp)** 🔵 — recent folders; screenshots; review; merge

**Daily total**: ~6 SP

### Friday, October 16 — Audit, Reviews, buffer

- **[G5](#g5-claudemd-size-audit-solo---project-instructions--3-sp)** 🟡 — after G1–G4 merge
- **[G6](#g6-weekly-reviews-batch--overhead--research--process--5-sp)** ⚪ — trial read-outs first, then §§1–4
- Buffer for review rounds. Closeout per group, **after its merge**: Summary-Table Status → `✅ PR #N`, the group's Daily-Schedule rows, and every BACKLOG/TODO entry it closed — in the closeout commit.

**Daily total**: ~3 SP + 5 overhead + buffer

---

## Summary Table

| ID  | Group                                        | Domain                                      | Source      | Tasks  | Total SP | Day     | Status     |
| --- | -------------------------------------------- | ------------------------------------------- | ----------- | ------ | -------- | ------- | ---------- |
| G1  | High security findings fix `[solo]`          | Main-process file IPC + renderer encoding   | 🟤 Auto     | 1      | 5        | Mon–Tue | ☐ Planned  |
| G2  | Like-or-skip flow `[batch]` 🏆               | Single-mode AI-sort workflow                | 🔵 User     | 2      | 8        | Tue–Thu | ☐ Planned  |
| G3  | Source-folder vector reuse `[solo]`          | ML training pipeline                        | 🔵 User     | 1      | 3        | Wed     | ☐ Planned  |
| G4  | Recently opened folders `[solo]`             | Folder open + empty state                   | 🔵 User     | 1      | 3        | Thu     | ☐ Planned  |
| G5  | `CLAUDE.md` size audit `[solo]`              | Project instructions                        | 🟡 Ops      | 1      | 3        | Fri     | ☐ Planned  |
| G6  | Weekly Reviews `[batch]`                     | Research / process                          | ⚪ Overhead | 4      | 5        | Fri     | ☐ Planned  |
|     | **Total (quota-counted)**                    |                                             |             | **6**  | **22**   |         |            |
|     | **Total (incl. ⚪ overhead)**                |                                             |             | **10** | **27**   |         |            |

_Source legend: 🔵 User · 🟡 Ops · 🟤 Auto · ⚪ Overhead (exempt from the quota denominator)._
_Status cell on completion: `✅ PR #N` where a PR was opened (every group since 2026-09-10 has been), else `✅ <merge-SHA>` — never a bare `✅`. Flip it in the closeout commit, which runs after the merge, together with the group's Daily-Schedule rows and every BACKLOG/TODO entry the group closed._

---

## Notes

- **Theme.** The user chose theme A ("make the real sorting session work") over finishing 24k (PR2, hash/similarity sort off the renderer thread — TODO 🔴, unscheduled since June) and starting v2.0 extraction. That answers the question the Sep 7–11 and Oct 5–9 plans carried forward ("next normal week's lead"); PR2 and the first extraction stay open for Cleanup Week #5's planning or the normal week after it. The renderer will grow again this week (G2 and G4 add to it), so the milestone's "losing ground" risk continues.
- **Sizing and drop order.** 22 quota-counted SP against the ~20–21 the sanity check pointed at: the 🟤 cap made 🔵 ≥ 12 a floor, and the user added G4 (3) rather than a design-only session. Velocity reference: Oct 5–9 did 23 + 5 inside its week (a Cleanup Week, mostly scoped fixes); the last normal week (Sep 7–11) did ~19 by the weekend after it and the rest 8–13 days late; design-heavy normal weeks ship ~14 in-window. **Overrun drop order**: G2's stale-order hint first, then G5 (to Cleanup Week #5), then G4. **Never drop** G1 or the bulk dislike. Any drop takes the _delivered_ 🟤 share past 25% (5 / 19 = 26% after the first) — accepted in advance; record it at closeout.
- **Dependencies.** G1 before G2 and G4 (file-IPC authorization and HTML encoding), and before G3 only if G1 touches the feature-cache IPC. G3 needs the user on Wednesday. G5 after G1–G4 merge. G6's trial read-outs after G2 and G4 merge.
- **Trials — one per group, so no two share a session.** `claude-security` leg 2 → G1 (its own trigger). _You should know_ → G2 (the lead group). `typescript-lsp` → G4, not G1: G1 is literally the first group of the week to edit `media-viewer.js`, but it already carries leg 2 and is a security fix. G3, G5 and G6 carry none. Recorded in REVIEW-QUEUE § 5's 2026-10-10 stocktake.
- **Evidence-gating — read out `drop` at planning (user ruling, 2026-10-10).** The gate (🟤 [2026-09-02]) was never built: Cleanup Week #4 chose the tournament fix, and this week's single 🟤 slot is the security fix — a third re-vehicle is what its own trial row ruled out. The **practice** stays, as a plan-level acceptance check on UI groups (committed before/after screenshots — the shape that worked on PR #70): G2 and G4 carry it. Recorded in REVIEW-QUEUE § 5 (trial-log row and stocktake) and on the BACKLOG entry, which is checked off; the practice entry 🟤 [2026-07-05] stays open. § 5 now stands at 2 outstanding trials.
- **Security disclosure.** Until G1 merges, everything committed about it stays at stub level (component, class, severity) — the plan, commit messages and the PR body included; memory `feedback_public_repo_security_stubs.md`.
- **Strategic docs — no drift found.** Nothing shipped Oct 5–9 met or obsoleted a Key Result or passed a milestone (v2.0 is still "2 of 6, a third partly"; Objective 1's PR2 KR is still 🔴). `Last Updated` 2026-08-27 is 44 days old — under the 2-month bar until 2026-10-27 (see Parallel Work). The restated "~9,400 lines" (actual 9,989) stays owned by the 🟤 [2026-09-02] derived-value sweep item.
- **Branch / PR shape.** Four code branches (G1–G4), each through a PR as every group since 2026-09-10 has been; G5 through its own PR (`CLAUDE.md` is reviewed like code); G6 docs-only, merged or dated-deferred in-session.
- **Reaps — nominated in the brainstorm, user-approved and executed 2026-10-10** (entry bodies deleted, tombstone rows in Rejected Ideas; the touched G4-trial header lost its count, per [README.md](README.md) § Document Conventions). Each premise was checked against `main` first-hand, beyond the sweep that surfaced it:
    1. 🟤 [2026-03-12] TASK-013 _"Deduplicate MinHeap/VPTree across sorting-worker.js and media-viewer.js"_ — the renderer copies were deleted in `e142c7d` (PR #54); both classes exist only in `sorting-worker.js`.
    2. 🟤 [2026-03-21] PR #18 _"Set `previousScores` even when `predictionScores.size === 0`"_ — `previousScores` went with the online per-rating updates (`4955f75`, PR #68); 0 hits in code.
    3. 🟤 [2026-08-30] G4 `pr-review-toolkit` trial _"CLAUDE.md L144 still overstates `restoreFeatureCachesFromHistory`'s call sites"_ — delivered by `1d072e3`.
    4. 🟤 [2026-03-27] PR #23 _"IPC handler crash on malformed payload"_ — delivered by `11f45aa` (`normalizeRendererLogEntry` handles null and non-object payloads).
    5. 🟤 [2026-03-25] PR #22 _"Update CLAUDE.md Cache Management docs to include `featureMetadata` in `removeFileFromList()`"_ — both CLAUDE.md and the method's JSDoc (`2b2f1dc`) list it.
- **Further reap candidates — not executed; for the next planning pass to nominate.** The 2026-10-10 sweep (all 250 open 🟤 scanned by title, ~60 checked against code; all 8 open 🟡 checked, none qualify) rated these obsolete. They are unverified first-hand — re-check each before nominating. HIGH: 🟤 [2026-03-22] PR #19 _"Verify zoom popover not clipped by `overflow: hidden` on `.media-wrapper`"_ (the controls left the wrapper in PR #70); 🟤 [2026-03-21] TASK-020 _"Content-understanding features"_ (576-dim CLIP input shipped); 🟤 [2026-06-13] PR #47 _"CLAUDE.md `decodeJxl ×4` test description…"_ and 🟤 [2026-06-15] PR #49 _"CLAUDE.md E2E note now stale: `app-launch.test.js`…"_ and 🟤 [2026-03-20] PR #14 _"Update CLAUDE.md signalUserActivity() caller list"_ (all three removed by the June durable-rules audit); 🟤 [2026-03-24] PR #21 _"Consolidate duplicate Git Insights entries"_; 🟤 [2026-03-22] PR #19 _"Add `transition-delay: 0s` to fullscreen overlay rule"_ (the entry says fixed; the rule was later deleted); 🟤 [2026-03-21] PR #18 _"Mark code-review-pr-17 BACKLOG items as done…"_; 🟤 [2026-03-20] TASK-016 _"Use waitForNotification() in future E2E tests"_ (now used). MEDIUM: 🟤 [2026-03-20] PR #15 _"Document waitForNotification() retention decision"_; 🟤 [2026-03-20] TASK-016 _"Investigate transient Vitest 'No test suite found' failures"_ (the 🟡 sibling closed with `pool: 'threads'`); 🟤 [2026-03-20] TASK-017 _"Audit remaining CLAUDE.md Git Insights for stale references"_; 🟤 [2026-04-09] _"Audit all preload.js `ipcRenderer.on()` for listener accumulation"_; 🟤 [2026-03-22] PR #19 _"Check archived plan checkboxes before archival"_ (not clean — the TASK-021 plan still has unchecked boxes). Two **unshipped duplicate pairs** (not reapable — merge-or-tag candidates): the `CLAUDE.md` line-cap pair (G5 closes both) and the two `FEATURE_CACHE_VERSION`-comment entries.
- _Brainstorm sanity-checks (user-in-the-loop, 2026-10-10): week dates confirmed Mon Oct 12 – Fri Oct 16, 2026 vs. today (Saturday Oct 10) and git/DONE (no commit after 2026-10-09, no DONE entry for that week); the previous plan (Oct 5–9) landed **inside** its header week (merges Oct 5, 6, 7, 8, 9; no group before its Monday); **Sep 28 – Oct 2 was never planned** (no commits between 2026-09-25 and 2026-10-03; the Oct 5 plan did not record it — noted in the archive below); velocity 23 + 5 (Oct 5–9, cleanup) vs. ~19 by the weekend after (Sep 7–11, normal) → ~20–21 agreed, 22 after the user added G4; Cleanup Week **not due** (#4 just ran; #5 ~Oct 26–30; the size trigger has fired continuously and the cadence governs); quotas satisfiable, with the 🟤 cap forcing 🔵 ≥ 12; five reap nominations put in-dialogue, all approved and executed; evidence-gating `drop` and the G3 user run decided in-dialogue._

### Quota Check

- 🔵 **User-Flagged SP**: 14 / 22 (**64%**) — ✅ ≥50% (G2 8, G3 3, G4 3).
- 🟡 **Operational SP**: 3 / 22 (**14%**) — ✅ ≤25% (G5).
- 🟤 **Auto-Generated SP**: 5 / 22 (**23%**), **1 group** (G1) — ✅ ≤25% and ≤1 group. G1 is a TODO 🔴 carry-forward; it counts against its origin section (🟤, the G4 scan).
- **Cleanup Week status**: normal (next due ~October 26–30, 2026).
- **Last Cleanup Week**: October 5–9, 2026 (the 4th).
- **Compliance**: ✅ all quotas met.
- _Denominator note_: Y = total quota-counted SP (22) — the exempt ⚪ Overhead Weekly Reviews batch (G6, 5 SP) is excluded; 27 incl. overhead. No Deploy Window (auto-deploy: no).

---

## Weekly Challenge 🏆

**Like-or-skip flow** (Group G2, Tue–Thu).

**Why this one**: it is the user's own answer to the problem that has ended several sorting sessions with nothing sorted — "Both good" for 15–20 pairs, then quitting — and it is the week's headline 🔵 work. The stretch is the bulk move: it becomes the largest file move the app makes in one action, so it has to hold the file-op guard across every rename without re-entering a guarded method, undo as **one** entry with one Ctrl+A, and leave `currentIndex` and every per-file cache consistent when the file on screen is in the batch — all on top of G1's newly authorized file IPC.

---

## Previous Week Summary

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
