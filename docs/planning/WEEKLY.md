# Weekly Plan

**Week**: Monday July 6 – Friday July 10, 2026
**Created**: 2026-07-01
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md, BACKLOG.md (📌 Process Rules + 🟤 Auto-Generated tail), TODO.md, git log (last 2 weeks), previous WEEKLY.md (June 22–26 normal perf week, archived below), REVIEW-QUEUE.md
**Type**: 🧹 **CLEANUP WEEK (2nd ever)** — the quota **inverts**: 🟤 Auto-Generated Tech Debt is the majority and the normal ≥50% 🔵 User-Flagged floor is suspended. Per user direction, the **2 HIGH-severity tournament blockers** from the 2026-07-01 dogfooding intake are retained as the **mandatory 🔵 user exception** (and are this week's 🏆).

**Context**: A Cleanup Week is formally **due** — it has been ~3 weeks since the first one (June 15–19), and the 🟤 tail has grown to ≈155 unchecked items (well past the 20 SP trigger), overwhelmingly PR-post-merge review follow-ups, deferred `revise-claude-md` doc-drift, and test/process backfill from the June sprint (PRs #54–#58). The user chose to take the overdue cleanup now rather than defer it a third time. This week burns down the **freshest, highest-value slice** of that tail (the PR #54–#58 follow-ups, which sit on current code and are top-of-mind) while honoring the two HIGH-severity tournament bugs that cannot wait a week. The July-01 AI-sort-startup cluster (4 MEDIUM items), the bulk-rate re-pair fix (🟠 TODO), and the carry-forward 🔴 sort-perf PR2/PR3 all **defer to the July 13–17 normal week**, where the ≥50% 🔵 floor resumes and they become the lead work.

---

## Parallel Work

- **User dogfooding / manual 24k+ smoke (no SP; user-side).** The two HIGH-severity tournament fixes in **CW-T** target real-24k-folder behavior that cannot be E2E-fixtured (Playwright fixtures top out at a handful of files). Each needs a manual smoke on the user's actual 24 000+ file folder before its BACKLOG/TODO entry is checked off — unit tests on the reconciliation / persistence / pairing logic plus a hand-off for real-data verification. **This is the gating dependency for the tournament group.**
- **Roadmap refresh still needs a user conversation (carry-forward, non-SP — now 2 weeks overdue).** MILESTONES.md / ROADMAP.md / GOALS.md all still date from **2026-02-05** and describe long-shipped v1.1 work — GOALS.md even lists "No automated tests / Manual testing only" and a "~6100-line" renderer, though the repo now has **389 unit tests + a green E2E suite** and an ~8400-line renderer, and Tournament/JXL/CLIP all shipped *outside* the documented roadmap. This was flagged in the June 22–26 plan and not actioned. A Cleanup Week is the natural home for a strategic-doc refresh, but the edits need user input first (is v1.1 closed? what is v2.0's real scope now that modularization is underway?). Raise it this week; if the conversation happens, the doc edits can slot into Thursday's hygiene block. Not scheduled as SP until then.

---

## Task Groups

### Group CW-T: Tournament correctness, persistence & hardening [batch] 🏆 🔵+🟤
**Domain**: JS logic — tournament engine / manager / IPC + resume-reconciliation + leave-flow + tournament tests
**Source**: 🔵 User-Flagged (2 HIGH-severity bugs — the mandatory user exception) **+** 🟤 Auto-Generated (adjacent same-file debt, subsumed into one branch)
**Total SP**: 10 — one branch, one PR, one review (front-loaded Mon–Wed; the HIGH bugs are design-risky and gate on a real-24k smoke)

> Everything tournament lives on the same files (`media-viewer.js` tournament methods, `tournament.js`, `tournament-engine.js`) so it batches into one branch to avoid collisions. The 2 HIGH-severity 🔵 bugs are the risky core (🏆); the 🟤 items are mechanical debt cleaned on the same branch. **Several 🟤 items are the same code path as HIGH bug #2** — fixing the reconciliation/can't-enter bug naturally subsumes the [2026-06-25] persistence-durability trio, so they close as a side effect rather than as separate work.

**🔵 HIGH-severity (mandatory user exception — BACKLOG 🔵 [2026-07-01]):**
- [x] **Cannot enter tournament mode after adding new media + AI sort** — ✅ Done (Task 1; live-engine fast-path reconcile gap). 3 SP, 🔴 HIGH. AI sort reorders `mediaFiles` and newly-added files are absent from the engine's saved file-set, so resume reconciliation + path→index lookup mismatch → `showTournamentPair` resolves `getMediaIndex(pair.left/right)` to −1 and falls into the "file missing" branch instead of rendering a pair. **Subsumes** 🟤 [2026-06-25] `handleResumeReconciled` + `showTournamentPair`-missing-file durability items (same path). Affected: `media-viewer.js` (`enterTournamentMode` ~4145, `showTournamentPair`→`getMediaIndex` ~4448-4470, `getMediaIndex` ~1090), `tournament.js` (`handleResumeReconciled`).
- [x] **Tournament mode unusable / freezes on 24k+ after AI sort (Continue stuck, Both Win hangs)** — ✅ Done (Tasks 2-3; O(1) inverse-delta undo + fast-path render). 5 SP, 🔴 HIGH. Residual after Group P2/PR #55: `TournamentEngine.deserialize`/SwissStrategy reconstruction on resume + a full `showCompareMedia` DOM teardown/reflow per pair remain on the critical path. Reduce per-pair DOM teardown/reflow + defer/stream the deserialize cost. Affected: `media-viewer.js` (`enterTournamentMode` resume ~4145, `showTournamentPair`→`showCompareMedia` ~4448-4496, `handleTournamentDraw` ~4513, compare DOM teardown ~2910-2940), `tournament-engine.js` (`deserialize`/SwissStrategy rebuild). **Gates on a real-24k manual smoke.**

**🟤 Auto-Generated (adjacent tournament debt, same branch):**
- [x] **`moveToSpecialFolder` durable persist + stale comment** — ✅ Done (Task 4; comment corrected to the debounced design). 🟤 [2026-06-25] PR #55. Make the tournament special-move engine removal `await flush()` (or update the misleading "persist before navigation" comment). `media-viewer.js` (`moveToSpecialFolder` tournament branch).
- [x] **Best-effort discard can orphan `.tournament_state.json`** — ✅ Done (Task 4; retry-once-then-log). 🟤 [2026-06-30] PR #58. Reconcile/retry the orphaned-state delete on next failed-delete or startup so a discarded tournament doesn't re-prompt resume. `tournament.js` (`handleDiscard`), `media-viewer.js` (resume-prompt entry).
- [x] **`onAppCloseRequested` unsubscribe fn discarded in `setupEventListeners`** — ✅ Done (Task 4; stored in `this._removeAppCloseListener`). 🟤 [2026-06-30] PR #58. Store the returned `removeListener` cleanup (or document why it's unnecessary), per the CLAUDE.md IPC-listener gotcha. `media-viewer.js` (~1976).
- [x] **Close-confirm re-entrancy guard** — ✅ Done (Task 4; guard on `#tournamentResumeModal` display). 🟤 [2026-06-30] T1. A 2nd close request re-binds the leave-prompt continuation; add an `isLeavePromptOpen` guard in `handleAppCloseRequest`. `media-viewer.js`.
- [x] **Fix stale `tournament-mode.test.js` "Continue resumes" E2E + add exit-button incomplete-tournament precondition + `#tournamentExitBtn` aria-label** — ✅ Done (Task 6; E2E 6/6). 🟤 [2026-06-30] T1 (3 XS items). Update the history-free-v2 assertion (expect `0`), assert `isTournamentMode===true` before the exit click, add `aria-label="Pause / leave tournament"`. `tests/e2e/tournament-mode.test.js`, `index.html`.
- [x] **`getMediaIndex` double-lookup micro-opt + undo-cap / SwissStrategy test pins** — ✅ Done (Task 5). 🟤 [2026-06-24] P2. `has`+`get`→single `get`; add at-cap-boundary undo + `recordDraw`-cap tests + SwissStrategy cross-bucket-carry-over / don't-double-bye unit pins. `media-viewer.js`, `tests/tournament-engine.test.js`, `tests/swiss-strategy.test.js`.

### Group CW-D: Docs & CLAUDE.md hygiene [batch] 🟤
**Domain**: docs / CLAUDE.md (`revise-claude-md` consolidation pass)
**Source**: 🟤 Auto-Generated
**Total SP**: 4 — one branch, one PR (docs-only → manual review, no `/code-review` fan-out per the [2026-06-29] docs-only convention). Scheduled **after CW-T merges** so the tournament-persistence docs reflect post-fix behavior.

> A single consolidation pass clearing the large backlog of deferred `revise-claude-md` / doc-drift items accumulated across the June sprint. Mirrors CW-3 from the first Cleanup Week.

- [x] **Fold 3 still-accurate tournament gotchas into CLAUDE.md** — 🟤 [2026-06-25] branch-salvage (folder-scoped exit; two-path `handleTournamentUndo`; `engine.files` vs `strategy.files` divergence). Verify against current code first.
- [x] **Document tournament debounced single-flight persistence + session-only undo + v2 payload** — 🟤 [2026-06-24] P2. (`_schedulePersist`/`_drain`/`flush`/`cancelPending`, `version:2` history-free state, undo cap 100, atomic temp+rename write.)
- [x] **CLAUDE.md / docs drift from PR1 dead-code removal** — 🟤 [2026-06-19]. MinHeap/VPTree now worker-only; several affected-line refs shifted ~925 lines.
- [x] **Correct the "PR2/PR3 = raw-speed continuation" framing** — 🟤 [2026-06-21]. Tighten to the precise per-phase cost map (PR2/PR3 remove hashing + cache-load waits but NOT the O(n·K) graph build). `DONE.md`, `TODO.md`.
- [x] **Decide CLAUDE.md maintenance mode (markers stripped)** — 🟤 [2026-06-18] PR #52. Confirm manual-only maintenance vs re-introducing AUTO-MANAGED markers; document the decision.

### Group CW-V: Test & tooling backfill [batch] 🟤
**Domain**: tests (non-tournament) + test tooling
**Source**: 🟤 Auto-Generated
**Total SP**: 4 — one branch, one PR

> Non-tournament test/tooling backfill (tournament tests live in CW-T). Mirrors CW-2 from the first Cleanup Week.

- [ ] **E2E smoke for the sort-progress card** — 🟤 [2026-06-19] PR1 closeout. Trigger a sort → assert `.notification-progress` appears → completes → is removed; clicking `.progress-cancel` aborts. Use `toBeAttached()` + `!isLoading` wait.
- [ ] **Harden or document `methodSource()` test-helper brace-counting** — 🟤 [2026-06-25] P3. Skip string/template/regex spans, or add a doc-warning + guard that throws on an unsafe caller. `tests/media-viewer-utils.test.js`.
- [ ] **Generate `extractAddedLines` fixtures from real `git diff` output** — 🟤 [2026-06-18] PR #52. Drive actual git ops in a temp repo (no-trailing-newline, multi-file, binary-then-text) and assert on real `git diff --cached --unified=0`. `tests/check-secrets.test.js`.
- [ ] **Add regression test for play/pause icon toggle** — 🟤 [2026-03-23] TASK-023. Catches Lucide API drift / DOM-ref bugs (the oldest actionable 🟤 test-coverage item).

### Group CW-P: Process & DX guardrails [batch] 🟡
**Domain**: process / CI / DX (Husky, WORKFLOW/checklist conventions, Weekly-Reviews methodology)
**Source**: 🟡 Operational
**Total SP**: 3 — one branch, one PR. First drop if the week runs long (CW-T's HIGH bugs take precedence).

> The one non-🟤 cleanup group. Kept modest so 🟡 stays ≤25% even in an inverted week. Mirrors CW-4 from the first Cleanup Week.

- [ ] **Add an automated E2E gate** — 🟡 [2026-06-26]. Pick the lowest-viable tier: a Husky **pre-push** hook running the E2E suite (or changed E2E files), or — if that proves too slow (Electron launch, `workers:1`) — a pre-merge-checklist WORKFLOW rule. Closes the "silently-broken E2E can land" gap (repo has no CI; hook runs unit only). `.husky/` (new `pre-push`) or checklist docs.
- [ ] **Codify Weekly-Reviews methodology fixes** — 🟡 [2026-06-26] (2 items) + [2026-06-29] (2 items). Default to lightweight inline `WebSearch`/`WebFetch` (NOT the deep-research harness — it burned ~8M tokens / never verified); never fan out multiple harnesses in parallel; recognize docs-only PRs before the `/code-review` fan-out; merge/defer a docs-only Weekly-Reviews PR in-session. Update the methodology spec + REVIEW-QUEUE.md.
- [ ] **Adopt "sweep references when removing a named call site" convention** — 🟤 [2026-06-26]. Add to the `receiving-code-review` / `verification-before-completion` checklist (grep tests + comments, not just live callers). *(One 🟤 item folded into this otherwise-🟡 process group.)*

### Group WR: Weekly Reviews [batch] ⚪ Overhead
**Domain**: Research / process (exempt overhead — excluded from the source-quota denominator)
**Source**: ⚪ Overhead
**Total SP**: 4 — scheduled late (Thu/Fri), low-risk, must not displace CW-T

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. Per the [2026-06-26] methodology follow-up (which CW-P codifies this week), run **lightweight inline `WebSearch` + a few `WebFetch`** per category — do NOT invoke the deep-research harness. Append a verdict row per category; on an `adopt`, file a 🟤 BACKLOG entry.

- [ ] **Plugins (2 SP)** — two independent tops: official store (Next-up parked: **commit-commands**) + wider internet (Next-up parked: **playwright-cli-agents**, Electron gap noted) — else the live top hit.
- [ ] **Claude best-practices (1 SP)** — top not-yet-reviewed (Next-up parked: **`/clear` between unrelated tasks**, or **autonomous end-to-end verification**).
- [ ] **Non-Claude AI best-practices (1 SP)** — top not-yet-reviewed (Next-up parked: **Addy Osmani's incremental LLM workflow**).

---

## Daily Schedule

### Monday, July 6 — 🏆 Tournament Fixes (day 1)
> Front-load the week's hardest, highest-severity problem. Start with HIGH bug #2 (the correctness blocker — users literally cannot enter tournament mode) plus the subsumed persistence-durability trio on the same code path.

| Group | SP |
|-------|----|
| **Group CW-T: Tournament correctness, persistence & hardening** [batch] 🏆 (day 1 of 3) | (10) |

- [x] Diagnose + fix "cannot enter tournament after new media + AI sort" (reconciliation / path→index; subsumes [2026-06-25] persistence-durability trio) (3 SP) — ✅ live-engine fast-path reconcile gap; `reconcileWithFiles` on every entry

**Daily total**: ~3 SP (of the 10 SP batch)

---

### Tuesday, July 7 — 🏆 Tournament Fixes (day 2)
> The deep one: the 24k unusable/freeze residual. Reduce per-pair DOM teardown/reflow + defer the deserialize cost so Continue/Both-Win don't hang.

| Group | SP |
|-------|----|
| **Group CW-T: Tournament correctness, persistence & hardening** [batch] 🏆 (day 2 of 3) | (10) |

- [x] Reduce `showCompareMedia` per-pair DOM teardown/reflow + defer/stream `deserialize` on resume (5 SP) — ✅ `showTournamentPairFast` wrapper-reuse render + O(1) inverse-delta undo (the real per-pick O(n) cost was `strategy.serialize()`, not deserialize); **real-24k smoke PASSED**

**Daily total**: ~5 SP (of the 10 SP batch)

---

### Wednesday, July 8 — Tournament debt sweep + PR → begin Docs hygiene
> Clean the mechanical tournament 🟤 on the same branch, land unit tests, open the CW-T PR. Then begin CW-D (docs) — CLAUDE.md tournament-persistence docs must reflect the post-fix state, so docs follow the fix.

| Group | SP |
|-------|----|
| **Group CW-T** [batch] 🏆 (day 3 of 3 — debt sweep + PR) | (10) |
| **Group CW-D: Docs & CLAUDE.md hygiene** [batch] (start) | (4) |

- [x] Tournament leave-flow 🟤 (discard-orphan retry, `onAppCloseRequested` unsubscribe, re-entrancy guard, stale E2E fix + precondition + aria-label, `getMediaIndex` micro-opt, undo-cap / SwissStrategy test pins); unit tests — ✅ all 6 🟤 done (Tasks 4-6); **CW-T MERGED 2026-07-03 via PR #59 (`ae9588d`)**
- [x] Begin CLAUDE.md consolidation (fold 3 tournament gotchas + document post-fix debounced persistence / v2 payload) — ✅ done in the single CW-D pass (PR #60)

**Daily total**: ~2 SP CW-T + CW-D start

---

### Thursday, July 9 — Docs & Test hygiene + Reviews start
> Finish the docs consolidation and the non-tournament test backfill. Begin the low-risk Weekly Reviews late in the day. (Optional: the roadmap-refresh conversation slots here if it happens with the user.)

| Group | SP |
|-------|----|
| **Group CW-D: Docs & CLAUDE.md hygiene** [batch] (finish) | (4) |
| **Group CW-V: Test & tooling backfill** [batch] | 4 |
| **Group WR: Weekly Reviews** [batch] (start) | (4) |

- [x] Finish CW-D (PR2/PR3 raw-speed framing correction, dead-code doc drift, CLAUDE.md maintenance-mode decision); **CW-D PR #60** (docs-only → manual review) — ✅ all 5 items done; **MERGED 2026-07-04 via PR #60** (merge `dba3ecf`)
- [ ] CW-V: sort-progress E2E smoke, `methodSource` hardening, real-git-diff `extractAddedLines` fixtures, play/pause icon regression test (4 SP)
- [ ] Weekly Reviews: Claude + non-Claude best-practices rows (start)

**Daily total**: ~4 SP + CW-D finish + reviews overhead

---

### Friday, July 10 — Process guardrails + Reviews wrap + buffer
> Light, low-risk close: the process/DX guardrails, finish Weekly Reviews, absorb any CW-T spillover (the HIGH bugs carry real design risk + a user-side smoke dependency).

| Group | SP |
|-------|----|
| **Group CW-P: Process & DX guardrails** [batch] | 3 |
| **Group WR: Weekly Reviews** [batch] (finish) | (4) |

- [ ] CW-P: automated E2E gate (pre-push or checklist), Weekly-Reviews methodology fixes, call-site ref-sweep convention (3 SP)
- [ ] Weekly Reviews: plugins ×2 (store + wider); file 🟤 on any `adopt`
- [ ] Buffer: CW-T spillover / real-24k smoke follow-up

**Daily total**: 3 SP + reviews overhead + CW-T buffer

---

## Weekly Challenge 🏆

**Tournament correctness, persistence & hardening — the 2 HIGH-severity fixes** (Group CW-T, Mon–Wed).

**Why this one**: In a Cleanup Week the challenge may be a correctness item, and these are the sanctioned 🔵 user exception — the highest-severity, highest-value work on the board. A core feature is currently **unusable** on the user's real 24 000-file folder (tournament mode freezes after AI sort; users cannot even enter it after adding media). The stretch is genuine: diagnose a resume-reconciliation / path→index mismatch that only manifests after an AI-sort reorder + new files, AND cut the per-pair `showCompareMedia` DOM teardown/reflow so Continue/Both-Win stop hanging at 24k — all verified against a real large folder that cannot be E2E-fixtured. It is design-risky (unlike the mechanical rest of the week), which is exactly why it is front-loaded Mon–Wed with a Friday buffer.

---

## Summary Table

| Group | Domain | Source | Tasks | Total SP | Day | Status |
|-------|--------|--------|-------|----------|-----|--------|
| CW-T: Tournament correctness, persistence & hardening [batch] 🏆 | JS logic (tournament engine/manager/IPC + tests) | 🔵 User (2 HIGH bugs) + 🟤 Auto | 2 🔵 + 6 🟤 | 10 | Mon–Wed | ✅ **MERGED 2026-07-03 via PR #59** (merge `ae9588d`, branch deleted; real-24k smoke PASSED; post-merge `/code-review` 2 real findings both fixed pre-merge in `f4b7807`) |
| CW-D: Docs & CLAUDE.md hygiene [batch] | docs / CLAUDE.md | 🟤 Auto | 5 | 4 | Wed–Thu | ✅ **MERGED 2026-07-04 via PR #60** (merge `dba3ecf`, branch deleted; docs-only, manual review; post-merge `/code-review` 1 finding fixed pre-merge in `b8b31a4`, re-review clean) |
| CW-V: Test & tooling backfill [batch] | tests (non-tournament) + tooling | 🟤 Auto | 4 | 4 | Thu | Planned |
| CW-P: Process & DX guardrails [batch] | process / CI / DX | 🟡 Ops (+1 🟤 folded) | 3 | 3 | Fri | Planned |
| WR: Weekly Reviews [batch] | Research / process | ⚪ Overhead | 3 | 4 | Thu–Fri | Planned |
| **Total (quota-counted)** | | | **20** | **21** | | |
| **Total (incl. ⚪ overhead)** | | | **23** | **25** | | |

_At closeout, check off each constituent BACKLOG/TODO entry individually. CW-T subsumes several [2026-06-25] tournament-persistence 🟤 items (same code path); close them as the HIGH-bug fix lands._

---

## Notes

- **Why a Cleanup Week now (user decision).** The Cleanup Week was formally due by both triggers — ~3-week cadence since June 15–19, and a ≈155-item 🟤 tail well past the 20 SP threshold — and the June 22–26 plan had already flagged it as "due ~early July." Rather than defer a *third* time, the user opted to take it now, on condition that the 2 HIGH-severity tournament blockers ride in as the mandatory 🔵 exception. This week therefore inverts the normal quota (🟤 majority) while still shipping the can't-wait user bugs.
- **Cleanup target = the freshest debt, not the whole tail.** The ≈155-item 🟤 backlog reaches back to March; this week deliberately targets the **PR #54–#58 follow-ups** (June sprint) because they sit on current code, are top-of-mind, and cluster cleanly by domain (tournament / docs / tests / process). The older 🟤 tail (April–May PR follow-ups) remains for a future Cleanup Week — do not try to clear all 155 in one week.
- **Velocity & target (21 SP quota-counted).** The first Cleanup Week hit 24 SP because it was fully mechanical. This one carries ~8 SP of **non-mechanical** design-risky work (the 2 HIGH tournament bugs, which also gate on a user-side real-24k smoke), so the target is trimmed to 21 SP + 4 overhead. The ~14 SP of mechanical 🟤 (docs/tests/process) moves at cleanup speed; the tournament core does not.
- **What defers to July 13–17 (next, normal week).** The July-01 **AI-sort-startup cluster** (4 MEDIUM items — the ~40s silent `loadFeatureCache`, no progress UX, redundant-extraction-despite-cache bug, opaque waits), the **bulk-rate re-pair** fix (🟠 TODO), and the **carry-forward 🔴 sort-perf** PR2 (hash off-thread) + PR3 (incremental cache-load) all move to next week, where the ≥50% 🔵 floor resumes and they are the lead work. PR3 in particular is the real fix for 4 of the 8 July-01 reports; PR2 (hash cold-cache) addresses *hash* similarity sorts, not the reported AI-sort pain, so it stays lowest-priority.
- **Dependency ordering within the week.** CW-T merges before CW-D (the CLAUDE.md tournament-persistence docs must describe post-fix behavior). CW-P codifies the "lightweight inline research" Weekly-Reviews methodology that WR then uses. CW-V and CW-P are independent and can float.
- **Overrun drop order**: drop **CW-P** (process guardrails — pure convention, no user-facing effect) first, then trim **CW-V** to the two highest-value tests (sort-progress E2E + `methodSource` hardening). **Never drop CW-T** — the HIGH-severity bugs are the whole reason the user allowed the cleanup to proceed. CW-T's real-24k smoke is user-side/async, so its checkoff may legitimately slip past Friday even if the code lands.
- **Testing reality**: the tournament HIGH bugs cannot be E2E-fixtured at 24k. Verification = unit tests on the reconciliation / path→index / persistence logic + the **manual real-folder smoke hand-off** (see Parallel Work). The CW-T entries stay unchecked until that smoke passes.
- **Deferred decision (not this week)**: the [2026-06-21] "close the visual-similarity graph-build floor — #7 parallelization vs. relaxing the quality-lock (capped K)" is a **needs-user-decision** item that is explicitly *measure-first, post-PR3* — it does not belong in a Cleanup Week and is not scheduled.
- **Docs-only PR handling**: CW-D is docs-only and CW-P is largely process/docs — per the [2026-06-29] convention (which CW-P itself formalizes), recognize these before any `/code-review` fan-out and merge/defer them in-session rather than leaving stale branches.
- **Branch/PR shape**: 4 workflow runs for the quota-counted groups — CW-T (one branch, HIGH bugs + tournament 🟤), CW-D (docs-only), CW-V (tests), CW-P (process). Weekly Reviews is process overhead (no code PR; appends to REVIEW-QUEUE.md + any `adopt` files a 🟤 entry).

### Quota Check
- 🔵 **User-Flagged SP**: 8 / 21 (**38%**) — ⚠️ **below the normal ≥50% floor BY DESIGN** — this is an inverted-quota Cleanup Week; the 8 SP is the mandatory HIGH-severity tournament exception the user explicitly authorized.
- 🟡 **Operational SP**: 3 / 21 (**14%**) — ✅ ≤25%
- 🟤 **Auto-Generated SP**: 10 / 21 (**48%**), 4 groups (CW-D, CW-V, +6 items in CW-T, +1 item in CW-P) — **inverted**: multiple 🟤 groups are expected in a Cleanup Week (the ≤1-group / ≤25% caps are suspended). 🟤 is the plurality of scheduled work.
- **Cleanup Week status**: **ACTIVE** (2nd ever; inverts the quota).
- **Last Cleanup Week**: June 15–19, 2026 (the first ever). Next expected ~late July / early August 2026 (~3-week cadence).
- **Compliance**: ✅ Cleanup-Week quotas met — 🟤 is the majority of quota-counted work, 🟡 ≤25%, 🔵 limited to the sanctioned HIGH-severity exception. ⚠️ Deviation from *normal-week* quotas (🔵 < 50%) is the intended, user-approved definition of a Cleanup Week, not a violation.
- **Note**: denominator Y = total quota-counted SP (21) **minus** the exempt ⚪ Overhead Weekly Reviews batch (4) — i.e. the total incl. overhead is 25, percentages are over the 21 quota-counted SP.

---

## Previous Week Summary

### Week: June 22 – June 26, 2026 — 🟢 Normal perf week — ✅ Mostly complete (spilled to June 30)

**Result**: A 19 SP (quota-counted) performance push. Four of five groups shipped, spilling ~4 days past Friday: **P2** tournament large-folder perf (PR #55, June 25), **P3** feature-extraction timing → pure-lazy (PR #56, June 26), **WR** Weekly Reviews first run (PR #57, June 29), **T1** tournament exit affordances (PR #58, June 30). Unit tests 381 → **389**; E2E green. **Group P1 (sort-perf PR2 hash-off-thread + PR3 cache-load) did NOT ship** — only its PR1 had merged (June 20, PR #54) — so the 🔴 "Speed up AI/similarity sorting" item stays OPEN and is the carry-forward into the July 13–17 window (deferred from this Cleanup Week).

**Key deliveries**:
- P2 — Tournament 24k perf: slim v2 history-free state (O(n) read) + O(n) consumed-marker pairing + prebuilt path→index Map + debounced single-flight atomic persist — PR #55
- P3 — Feature extraction made pure lazy/on-demand (removed both eager kickoffs; CLIP sort self-extracts via `clipVectorsNeedExtraction` gate) — PR #56
- T1 🏆-adjacent — Tournament exit affordances: in-header `#tournamentExitBtn` + confirm-before-app-close (main-process `close` interception → reuse leave prompt); 5/5 manual close cases PASSED — PR #58
- WR — First Weekly Reviews run: 4 verdicts, 1 adopt (`pr-review-toolkit` → 🟤 BACKLOG); harness proved wildly over-budget (~8M tokens, verification never completed) → methodology fix filed (now CW-P this week) — PR #57

**Velocity learning**: ~14 SP quota-counted actually shipped in-window (P2 8 + P3 3 + T1 3), with P1 (5 SP) carried — design-heavy work runs below the 19 SP nominal once diagnosis + PR-review + real-folder-smoke overhead is counted. Directly informs this Cleanup Week's trimmed 21 SP target (the ~8 SP tournament-bug core is the same non-mechanical shape).

### Week: June 15 – June 19, 2026 — 🧹 Cleanup Week (1st ever) — ✅ Complete (shipped on time)

**Result**: The first-ever Cleanup Week. All five groups (CW-1…CW-5) delivered at the 24 SP target, on schedule. Six PRs merged (#47–#52). Unit 310 → **345**; E2E returned to green (42/43 → 48/48). The inverted quota (🟤 majority) burned ~16 SP of accumulated auto-generated debt. Key: CW-5 🏆 frame-0-first streaming animated-JXL decode (PR #47); CW-1 7 defensive renderer guards consolidating 14 PR-review follow-ups (PR #48); CW-2 E2E green + first tournament Playwright coverage (PR #49); CW-3 docs & backlog hygiene (PR #50); CW-4 dependency-free pre-commit secret guard + pre-archive checklist (PR #51/#52).

### Week: June 1 – June 5, 2026 — ✅ Complete (ran long: finished 2026-06-11)

All 5 groups delivered (30 SP planned; consumed 9 working days). Seven PRs merged (#40–#46). Unit 244 → 297. Group 0 re-rate/mode-correction (PR #40/#41), Group A 🏆 JXL viewer (PR #42), Group B mode-switch bugs (PR #43/#44), Group C CLIP extraction UX (PR #45), Group D security audit ✅ PASS (PR #46).

### Week: May 11 – May 15, 2026 — ✅ Complete

All 6 groups delivered (25 SP). Tournament Mode (Groups E + F) shipped 2026-05-25 with a deterministic-UX + feature-cache-streaming polish pass 2026-05-26. (CLIP extraction silent-failure fix, AI-prediction display bugs, PR #33 defensive follow-ups, integration-test pattern, Tournament Mode spec + prototype.)

### Week: April 13 – April 17, 2026 — ✅ Complete

All 6 groups delivered, 25 SP. See `docs/archive/plans/` and `docs/planning/DONE.md`. (Compare-mode folder-switch fix, CLIP/ML pipeline cleanup, test-quality hardening, CLIP similarity sorting, resource management, build & DX.)
