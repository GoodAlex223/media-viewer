# Weekly Plan

**Week**: Monday November 16 – Friday November 20, 2026
**Created**: 2026-11-11
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md (all `Last Updated` 2026-10-30, status edits after G5's refresh of 2026-10-27, so inside the 2-month clock; this pass adds a status edit for P1a's date, see Notes → Strategic docs), BACKLOG.md (📌 Process Rules; the 🔵 pool with the 2026-11-10 and 11-11 manual-testing intakes; 🟡, the `CLAUDE.md` audit first; the 🟤 sections filed since Cleanup Week #5, [2026-10-30] → [2026-11-11]; after this pass's reaps 54 🔵, 6 🟡 and 423 🟤 entries are open), TODO.md (the 🟠 compare special-move queue item; § Spawned Tasks, three rows handed over 2026-11-06), git log (last 2 weeks: the merges `4894a13`, `a80cc37`, `b9c76c0`, `59218f3`, `9a8ffb9`, `1cfbcd4`, `d326ed1` and their closeouts through `5a45a15`; intake `d0a6c40`, `6f6b09b`), previous WEEKLY.md (Oct 26–30, Cleanup Week #5, spilled to 2026-11-06, archived below), the [v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) § 14 (P1a's row and the BACKLOG entries it closes), REVIEW-QUEUE.md (§§1–5; last run 2026-11-06). Live-config drift check: N/A — this repo keeps no live-config sync. OWNER-QUEUE.md: absent.
**Cleanup Week?**: **No — 🟢 Normal week.** Cleanup Week #6 falls due this week by cadence (three weeks after #5's header week, Oct 26–30), and the 🟤-size trigger fires too (423 open). By the user's ruling of 2026-11-11 it is **deferred one week, to Nov 23–27**, so that v2 P1a, two weeks past its earliest slot, starts now: deferred by ruling, not skipped (Notes → Cleanup Week #6).
**Context**: Roadmap phase _v2 — modules and redesign_; next milestone _v2 pilot (P1a + P1b)_, early January 2027 (soft). This week's agreed theme is **"start the v2 pilot"**: P1a, the module host, leads and is the challenge (🏆 G1); the compare special-move fix from the latest manual testing, with the undo side swap in the same index math, runs beside it and merges first (G2); Weekly Reviews close the week (G3). **Sized to the recent pace** (user ruling): 12 quota-counted SP, ~17 with overhead (14 and ~19 before Linux was dropped from v2, Notes → Linux dropped). **Written Wednesday 2026-11-11 for next week**; Thu–Fri Nov 12–13 go to P1a's plan, which is prep, not delivery.

---

## Parallel Work

- **Auto-deploy: no** (Electron desktop app; a single `main` trunk with no production branch; no `.github/` directory and no deploy step — GOALS § Constraints "No CI service"). No Deploy Window group.
- **G2 beside G1**: G2 runs Mon–Tue in its own worktree and session while G1 starts on the host's core, and merges first. G1's branch then merges `main` before its next push, so the line ratchet measures both. Both edit `media-viewer.js`; G2's change sits in `moveToSpecialFolder` and its undo, which P1a's § 14 row does not move. A fresh worktree needs `npm ci` before its first commit, or every hook is skipped.
- **Pre-week prep (Thu–Fri Nov 12–13)**: P1a's plan, written from the spec (Opus · `xhigh`). Nothing merges before the header Monday.
- **User-in-the-loop steps** (part of their groups; listed here so they are visible in one place):
  - **G2 (Mon)**: the TODO item's two **To decide** points, asked before G2's plan: whether the partner stays in place (the next pair is the partner and the following file) or still goes to the end; and whether the AI-sorted compare keeps resetting its extremes pairing after a special move.
  - **G1 (review, Fri)**: the Codex CLI install and `codex login` with your own free ChatGPT account, in the review session (the 🟤 trial entry's setup). The `preload.js` edits prompt you, as enforced.
  - **G3 (Thu–Fri)**: the run's rulings, as every week.
- **Housekeeping, on your word** (not scheduled, no SP): the local branch `g4-ai-research-loose-ends` and the remote branches `origin/g5-claude-md-byte-trigger` and `origin/g6-weekly-reviews` (all three merged into `main`), and the detached worktree `.claude/worktrees/g6-closeout` at `5a45a15`. Remove the worktree without `--force` across a junction.
- **User-side 24k smokes (optional, not gates)**: PR #66 re-smoke round 2, still never run.
- **Next week (Nov 23–27)**: Cleanup Week #6, deferred here, with the 🟡 `CLAUDE.md` audit and the 🟤 line-ceiling extension to `core/` already ruled into it. If P1a has not merged by Sunday Nov 22, its tail runs beside it, and that planning pass decides the order.

---

## Task Groups

### G1. v2 P1a: the module host `[batch]` 🔵 🏆 — v2 modules — 9 SP

> **Mon–Fri.** The [v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) § 14 row: the manifest schema, registry, `modules.json` and loader; failure isolation and cascade; the Modules tab (list, toggle, restart); the app-scheme allowlist for `core/**` and `modules/*`; lint rules M-1 and M-2, each shown able to fail by a planted violation; the bridge-surface test; glob-based sink and `file:` checks; the `folder-file-*` channels with tagged reads and delete; per-launch E2E isolation. **Exit**: an empty module loads, fails safely, cascades and toggles, and all suites are green on Windows. **No Linux baseline**: Linux was dropped from v2 by your ruling of 2026-11-11 (Notes → Linux dropped), so the plan re-estimates the row's ~11 SP; ~9 is my estimate, since the spec's change log (§ 21) puts the Linux baseline at ~2. **Net `wc -l media-viewer.js` ≤ 0** under the blocking line ratchet (ceiling 11,597), and the phase moves the `CLAUDE.md` rules for the code it moves into `.claude/rules/`. One branch, one PR; the plan is written Thu–Fri Nov 12–13 (prep). **`preload.js` changes** (the bridge for the folder-file channels): security review required. At the closeout, flip P1a's rows on ROADMAP's v2 table and GOALS G-1 and G-2 by hand (🟤 "Let each v2 phase's closeout flip its own row…" is not built yet).
> **Model:** start Opus · `high` (the 8+ SP row; edge cases likely across main, the bridge, the loader and the E2E harness); `xhigh` to write the plan → execute Opus · `medium`, Sonnet · `medium` for the steps the plan spells out; review deep (`max`), in a separate session, asked first — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **v2 P1a — the module host** — per the v2 spec § 14 (P1a, exit criteria above) and its sections on the manifest, host and bridge; v2's ~12-SP weekly 🔵 share (user ruling 2026-10-28). New `core/`, `modules/`, `main/folder-files.js`; `main.js`, `preload.js`, `app-protocol.js`, `eslint.config.mjs`, `tests/`, `tests/e2e/helpers/`, `CLAUDE.md` → `.claude/rules/` (9) — 🔵 v2 spec (approved 2026-10-22) ← 🔵 "Design add-on/extension system for the media viewer"
- [ ] **Closed by P1a (spec § 14)** — 🟤 "`docs/ARCHITECTURE.md`'s file tree omits every extracted module" (P1a rewrites the tree) and 🟤 "Extract `extractAsyncMethod` helper to `tests/helpers/extract-method.js` on third use" (P1a's first rewiring needs the shared helper). `docs/ARCHITECTURE.md`, `tests/helpers/` (inside the 11; XS each)
- [ ] **P1a's plan carries the G5 note** — per 🟤 [2026-11-06] "Note at v2 P1a's planning that the v2 spec's 'v2's rules cannot land there' rested on the old 69,000 trigger": one line in P1a's plan, or a dated note on spec § 19 step 4. The audit that line names, 🟡 [2026-11-06] "Audit `CLAUDE.md`…", moved to Cleanup Week #6, so the plan records it as still owed. (XS, inside the plan)
- [ ] **Codex CLI review trial on P1a's PR** — per 🟤 [2026-11-06] "Trial: a Codex CLI review beside `/code-review` on the next code PR". **Incumbent**: the posted `/code-review` round at the level the PR uses (record it), plus the reviewer's first-hand check of each candidate. **Question**: did Codex report a defect, confirmed first-hand, that the posted review of the same commit did not? Record the model, `/status`, whether the free allowance ran out, and the wall time. G2 may merge first but is not the vehicle: the entry names P1a, and a 3-SP fix gives the trial little to find (my call). (rides the review)

### G2. Compare special move keeps its place `[batch]` 🔵 🟤 — compare mode — 3 SP

> **Mon–Tue**, in its own worktree, merging before P1a's PR. One branch, one PR. **Phase 0**: show both on `main` before the fix, each as a RED test — the queue reset (compare mode, no sort, a special move of one file of a pair mid-queue) and the side swap (a special move of the later file of a plain sequential pair, then undo). Both entries name a mechanism from a code reading: `moveToSpecialFolder`'s compare branch sets `currentIndex = 0`, and the undo inserts at the partner's index. **The two To decide points** in the TODO item are yours, asked before the plan. **Line ratchet** (my call): `media-viewer.js` must not grow (ceiling 11,597), so the new index plan goes in a small pure module on the `like-or-skip.js` pattern, imported as a namespace; failing that, the PR raises the ceiling by an explicit edit and says why. File moves are involved, so the tests cover where each file is on disk after the move and after the undo, not only the cursor.
> **Model:** start Sonnet · `medium` (the bug row, 3 SP) → Opus · `high` if the index math proves hard (the bug row's step-up); review standard (`high`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Keep the place in the queue when compare mode sends one file of a pair to the special folder** — per TODO 🟠 (← the user's manual testing, 2026-11-11): after a special move of one file of a pair, the queue goes on from that pair's place instead of pair 1; the partner's place and the AI-sorted extremes pairing as you decide. `media-viewer.js` (`moveToSpecialFolder`, its undo in `handleCancel`), `tests/media-viewer-utils.test.js`, `tests/keyboard-shortcuts.test.js` (2) — TODO 🟠 [2026-11-11] ← 🔵 manual testing
- [ ] **Undoing a compare-mode special move of the later file of the pair puts it back before its partner** — per 🟤 [2026-11-11]: when the moved file came after its partner, the undo puts it back ahead of it and on the left; restore the pair in its original order and sides, re-checked against whatever order the first fix keeps. `media-viewer.js` (the compare branch of `moveToSpecialFolder`, `handleCancel`, `_restoredPairFiles`), `tests/media-viewer-utils.test.js` (1) — 🟤 [2026-11-11] manual-testing intake

### G3. Weekly Reviews `[batch]` ⚪ Overhead — research / process — 5 SP

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. **Window ≈ 2 weeks** (last run 2026-11-06, for the Oct 26–30 week). **Order**: § 5's queue first. The Codex CLI trial reads out on G1's PR: if G1's review has run by then, its read-out is this run's first item; otherwise it stays queued. Then §§1–4; §1 diffs plugin names from the baselines the 2026-11-06 run recorded. Through a PR, as the last runs were.
> **Model:** Opus · `medium`, named directly because ⚪ overhead fits no row of the § 1.0 table: research and verdicts, with each claim checked against its primary source; Sonnet · `medium` is enough for the routine sourcing searches.

- [ ] **Plugins (2 SP)** — two independent tops: official catalog + wider internet, each with `source:`.
- [ ] **Claude best-practices (1 SP)** — a fresh check against the parked list.
- [ ] **Non-Claude AI best-practices (1 SP)** — the same, for AI models and tools other than Claude.
- [ ] **Cross-project propagation (1 SP)** — outbound: this week's shipped work (G1, G2) and the memory files changed since 2026-11-06, at the high bar; inbound: new sibling rows naming this repo; and the status of the three TODO § Spawned Tasks rows handed over on 2026-11-06.

---

## Daily Schedule

### Before the week: Thursday–Friday, November 12–13 — P1a's plan (prep, not delivery)

- **[G1](#g1-v2-p1a-the-module-host-batch----v2-modules--9-sp)** 🔵 🏆 — P1a's plan from spec § 14, without its Linux baseline, carrying the G5 note.

### Monday, November 16 — The host's core; the queue fix starts

> G2 beside G1, in its own worktree.

- **[G1](#g1-v2-p1a-the-module-host-batch----v2-modules--9-sp)** 🔵 🏆 — the manifest schema, registry, `modules.json` and loader (part 1 of 5).
- **[G2](#g2-compare-special-move-keeps-its-place-batch----compare-mode--3-sp)** 🔵 🟤 — your two To decide points; Phase 0, both RED tests; the plan (part 1 of 2).

**Daily total**: ~4 SP

### Tuesday, November 17 — Failure isolation and the Modules tab; the queue fix lands

- **[G1](#g1-v2-p1a-the-module-host-batch----v2-modules--9-sp)** 🔵 🏆 — failure isolation and cascade; the Modules tab (part 2 of 5).
- **[G2](#g2-compare-special-move-keeps-its-place-batch----compare-mode--3-sp)** 🔵 🟤 — the fix; review; merge (part 2 of 2).

**Daily total**: ~3.5 SP

### Wednesday, November 18 — The allowlist and the bridge

> After G2 merges, G1's branch merges `main` before its next push.

- **[G1](#g1-v2-p1a-the-module-host-batch----v2-modules--9-sp)** 🔵 🏆 — the app-scheme allowlist; the `folder-file-*` channels and their `preload.js` bridge (part 3 of 5).

**Daily total**: ~2.5 SP

### Thursday, November 19 — The checks that make it hold; reviews start

- **[G1](#g1-v2-p1a-the-module-host-batch----v2-modules--9-sp)** 🔵 🏆 — M-1 and M-2 with planted violations; the bridge-surface test; per-launch E2E isolation; the rules move; both suites green (part 4 of 5).
- **[G3](#g3-weekly-reviews-batch--overhead--research--process--5-sp)** ⚪ — § 5, then §1 plugins (part 1 of 2).

**Daily total**: ~1.5 SP + ~2 overhead

### Friday, November 20 — P1a's review; reviews

- **[G1](#g1-v2-p1a-the-module-host-batch----v2-modules--9-sp)** 🔵 🏆 — the deep review in a separate session, with the Codex trial beside it; merge (part 5 of 5; review rounds may run past Friday).
- **[G3](#g3-weekly-reviews-batch--overhead--research--process--5-sp)** ⚪ — §§2–4; the PR (part 2 of 2).
- Buffer for review rounds. Closeout per group, **after its merge**: Summary-Table Status → `✅ PR #N`, the group's Daily-Schedule rows, and every BACKLOG/TODO entry it closed — in the closeout commit.

**Daily total**: ~0.5 SP + ~3 overhead + buffer

---

## Summary Table

| ID  | Group                                                 | Domain             | Source               | Tasks  | Total SP | Day     | Status |
| --- | ----------------------------------------------------- | ------------------ | -------------------- | ------ | -------- | ------- | ------ |
| G1  | v2 P1a: the module host `[batch]` 🏆                  | v2 modules         | 🔵 User              | 4      | 9        | Mon–Fri | ⬜     |
| G2  | Compare special move keeps its place `[batch]`        | Compare mode       | 🔵 User 2 · 🟤 Auto 1 | 2      | 3        | Mon–Tue | ⬜     |
| G3  | Weekly Reviews `[batch]`                              | Research / process | ⚪ Overhead          | 4      | 5        | Thu–Fri | ⬜     |
|     | **Total (quota-counted)**                             |                    |                      | **6**  | **12**   |         |        |
|     | **Total (incl. ⚪ overhead)**                         |                    |                      | **10** | **17**   |         |        |

_Source legend: 🔵 User · 🟡 Ops · 🟤 Auto · ⚪ Overhead (exempt from the quota denominator)._
_Status cell on completion: `✅ PR #N` where a PR was opened (every group since 2026-09-10 has been), else `✅ <merge-SHA>` — never a bare `✅`. Flip it in the closeout commit, which runs after the merge, together with the group's Daily-Schedule rows and every BACKLOG/TODO entry the group closed._

---

## Notes

- **Theme.** The user chose A, "start the v2 pilot", over B, Cleanup Week #6 on time (G3's quit-path and tournament-prompt follow-ups and the `CLAUDE.md` audit; P1a would have slipped a third week), and C, the latest manual-testing wins (the queue reset, the wheel over the empty area, E2E windows on screen, sorts by size and name, drag-and-drop; no v2 work).
- **Dates (user ruling, 2026-11-11).** The header is next week, Nov 16–20, written Wednesday 2026-11-11. Not chosen: a header of this week (Nov 9–13), as on 2026-10-28, which would have spilled from its first day, since P1a cannot finish in two days. Thu–Fri Nov 12–13 go to P1a's plan: prep, so nothing is delivered before the header Monday.
- **Sizing (user ruling, 2026-11-11): to the recent pace.** 12 quota-counted SP + 5 overhead, ~3–4 SP a day (14 before Linux was dropped; the ~2 SP it freed stay as buffer, my call, given the pace). The last two normal weeks ran 1.6× and 1.9× over their estimates (archive below); each of the last five normal weeks finished after its Friday, four beyond the close-out gate's 2-day grace; and the Oct 26–30 plan's 24 SP took eight working days (Oct 28 – Nov 6). Not chosen: the full ~23 SP (adding the `CLAUDE.md` audit and the line-ceiling extension) with a drop order. v2 takes 9 of this week's 11 🔵 SP, near the ~12-SP share of 2026-10-28.
- **Cleanup Week #6 (user ruling, 2026-11-11): deferred one week, to Nov 23–27.** It carries the 🟡 `CLAUDE.md` audit (the other slot its entry names) and the 🟤 line-ceiling extension to `core/` (it needs P1a's `core/`), each with a dated note on its entry. The wider sweep of the 423 open 🟤 entries is its job too.
- **Overrun rule.** If G1 has not merged by Sunday Nov 22, the end of the close-out gate's grace, add the `**Spillover**` line then, not later (the Jul 13–17 lesson). G2 and G3 do not wait on G1. **Never drop** G2's Phase 0: a fix without its RED tests is not accepted.
- **Dependencies.** G2 merges before G1 (both edit `media-viewer.js`), and G1's branch merges `main` before its next push. G1's Codex trial needs your setup in the review session. G3 last; its propagation reads what G1 and G2 shipped.
- **Risks.** (1) P1a at ~9 SP may fill more than the week at the measured pace; the overrun rule above applies. (2) `preload.js` changes need the security review.
- **Linux dropped (user ruling, 2026-11-11, after this plan's first commit `55edcde`).** You will not use the app on Linux in the near future, and G-8 added work to every v2 phase (both suites on Linux at each exit, per-platform code in later modules), so v2 is Windows only. GOALS drops G-8 and lists Linux under Non-Goals for v2; MILESTONES drops the pilot's Linux criterion and risk; ROADMAP renames P1a; the spec gets a § 21 row and markers at G-8, the P1a row, § 15 and D21. The spec's Linux design is parked as 🔵 [2026-11-11] "Linux support: parked until wanted" rather than deleted (my call), since "not in the near future" is not never. Measured before the ruling, for that entry: WSL2 with Ubuntu 24.04 and WSLg present, no Linux Node.
- **Branch / PR shape.** Two code branches (G1, G2), each through a PR, as every group since 2026-09-10 has been. G3 through a PR as well.
- **Strategic docs.** MILESTONES, ROADMAP and GOALS get a status edit in this planning pass (P1a scheduled for Nov 16–20, two weeks after its earliest slot; the pilot's early-January date kept, with the slip named in MILESTONES' Risks), not a refresh. The 2-month clock runs from 2026-10-27.
- **Reaps — nominated in the brainstorm, user-approved and executed 2026-11-11** (entry bodies deleted, tombstone rows in Rejected Ideas). Each premise was checked first-hand:
    1. 🟡 [2026-07-10] CW-P closeout _"Re-evaluate pre-push E2E-gate friction after real-world use"_ — answered: the user ruled the cost too high on 2026-10-26 and filed 🔵 [2026-10-26] "Cut the pre-push E2E gate's cost…", which holds the measurements and options 2–4 (G1 shipped option 1, PR #93). Its one line not already there, the flakiness watch, moved into the 🔵 entry. Its section, "(1 item)", went with it.
    2. 🟤 [2026-10-25] v2 spec closeout _"Run or recover the downloader research before P3b's plan"_ — superseded by 🔵 [2026-11-10] "Run the downloader research for the Fetch module: the 2026-10-22 session never ran", which answers its first step and carries its gate, effort and spec amendment. The 🔵 Fetch-module entry's gate now points there.
- **Considered, not reaped**: 🟡 "Add a pre-commit secret guard (or gitleaks)…" — its gitleaks tier still covers a real gap (fine-grained `github_pat_…` tokens and AWS secret access keys); 🟡 "Full audit of `regression-checker.md`…" and "Update `regression-checker.md` line-count…" — the agent file still reads "~11,500 lines", and v2 will move that number.
- **Not scheduled**: 🔵 [2026-11-10] the downloader research — its gate is P3b's plan, months out; it can run as a background session whenever you choose, once its prepared text gets the refresh its entry lists.
- _Brainstorm sanity-checks (user-in-the-loop, 2026-11-11): week dates set by user ruling to Mon Nov 16 – Fri Nov 20, 2026, written Wednesday 11-11 (git: last commit `6f6b09b` today; no DONE entry after 2026-11-06); the previous plan (Oct 26–30, Cleanup Week #5) **spilled to 2026-11-06**, six days past its Friday, as its `**Spillover**` line records; the week of Nov 2–6 carried that spillover, and **Nov 9–13 went unplanned** (two intake commits only); nothing was delivered before its header Monday (G1 built from Wed 10-28, merged 10-30); one follow-up PR ran beside it (#96, G3's reload roles, 11-05); velocity 19 planned + 5 overhead over eight working days (~3 SP a day) → 14 + 5 planned, agreed; Cleanup Week #6 **due** by cadence and **deferred one week** by user ruling; quotas satisfiable in the normal form; two reap nominations put in-dialogue, both approved and executed; owner queue N/A (no OWNER-QUEUE.md); after the first commit (`55edcde`), Linux dropped from v2 by user ruling, G1 11 → ~9 SP, the freed ~2 SP kept as buffer._

### Quota Check

- 🔵 **User-Flagged SP**: 11 / 12 (**92%**) — ✅ ≥50%. G1, 9 SP (v2's weekly share); G2's queue fix, 2 SP, a TODO 🟠 carry-forward counted against its origin section (🔵, the user's manual testing of 2026-11-11).
- 🟡 **Operational SP**: 0 / 12 (**0%**) — ✅ ≤25%. The one due 🟡 item, the `CLAUDE.md` audit, moved to Cleanup Week #6 (user ruling).
- 🟤 **Auto-Generated SP**: 1 / 12 (**8%**), **1 group** (G2's side-swap task) — ✅ ≤1 group and ≤25%. G1's two 🟤 closers (spec § 14) and its two 🟤 riders (the G5 note, the Codex trial) sit inside P1a's estimate and are not counted apart.
- **Minimum group size**: ✅ every group is ≥2 SP (G2 at 3).
- **Daily capacity**: ~3–4 SP a day, below the nominal 5–8 by the velocity adjustment (Notes → Sizing).
- **Cleanup Week status**: not active — #6 falls due by cadence this week and is **deferred to Nov 23–27** by user ruling.
- **Last Cleanup Week**: October 26–30, 2026 (the 5th; delivered through 2026-11-06). Next: November 23–27, 2026 (the 6th).
- **Compliance**: ✅ normal-week quotas met.
- _Denominator note_: Y = total quota-counted SP (12) — the exempt ⚪ Overhead Weekly Reviews batch (G3, 5 SP) is excluded; 17 incl. overhead. No Deploy Window (auto-deploy: no).

---

## Weekly Challenge 🏆

**v2 P1a: the module host** (Group G1, Mon–Fri).

**Why this one**: it is the first v2 phase and the gate on every phase after it, and the default 🔵 pick. The stretch is the proof, not the size: an empty module that loads, fails safely, cascades and toggles; M-1 and M-2 each shown able to fail by a planted violation; both suites green; and a renderer no longer than it started, under the ratchet.

---

## Previous Week Summary

### Week: October 26 – October 30, 2026 — 🧹 Cleanup Week (5th, overdue) — ✅ Complete, but **spilled to 2026-11-06** (all six groups merged)

**Spillover**: through 2026-11-06, six days past the Friday. The plan was written on Wednesday 10-28 and ran two days late by design (Wed Oct 28 – Sun Nov 1); its `**Spillover**` line was recorded on 2026-11-02 by G3's plan. G1 and G2 merged on 2026-10-30, G3 on 11-03, and G4, G5 and G6 on 11-06. A follow-up PR beside G3 removed the menu's reload roles (PR #96 `59218f3`, 11-05). The week of Nov 2–6 carried this spillover, so P1a, slated for it at the earliest, did not start. **Not planned**: Nov 9–13 — no plan; only two manual-testing intake commits (`d0a6c40` on 11-10, `6f6b09b` on 11-11) and the 2026-11-11 planning pass. Cleanup Week #6, due Nov 16–20, was deferred one week by user ruling. Archived under its **true** header week.

**Result**: 19 SP quota-counted planned + 5 overhead, all six groups merged. **G1** repo chores (PR #93 `4894a13`): a push that changes only paths the app never loads skips the E2E run, Context7 retired, an MIT LICENSE. **G2** pre-push gate (PR #94 `a80cc37`, ~4.25 SP): the blocking renderer line ratchet (`scripts/check-line-ratchet.js`, measured on a `git merge-tree` merge with `origin/main`), and the flaky tournament E2E fixed. **G3 🏆** rating data that can't go wrong (PR #95 `b9c76c0`): seven fixes, each behind a reproduction — undo returns a file to the folder it came from, bulk-rated saves coalesce, undo restores the bulk label and score, the AI sort's apply keeps every file, resume reconciles at the press, the quit saves, and main logs a crash. **G4** AI research loose ends (PR #97 `9a8ffb9`): the research merged; the harness on two real tastes read _wait_, the train/score metadata gap being the larger loss; the parked branch deleted. **G5** `CLAUDE.md` byte trigger (PR #98 `1cfbcd4`): `BYTE_TRIGGER` 85,000; the file had already passed 69,000, so the owed audit is filed 🟡. **G6** Weekly Reviews (PR #99 `d326ed1`): the context-cost read-out, a Codex CLI review trial adopted, three propagations handed over. Test deltas in [DONE.md](DONE.md), not restated here.

**Velocity learning**: 24 SP over eight working days (Oct 28 – Nov 6), about 3 SP a day. Cleanup Weeks #3 and #4 finished inside their header weeks; this one spilled a full week, its tail again review rounds (G1, G2, G4 and G6 three each) behind an 8-SP data-safety batch. Process learning: a Cleanup Week that runs late pushes the next normal week's lead (P1a) out by as much, and the week after it went unplanned until a planning pass ran; the G3 closeout alone filed 32 BACKLOG entries.

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
