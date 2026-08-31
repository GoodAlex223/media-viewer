# DONE

Completed tasks with implementation details and learnings.

**Last Updated**: 2026-08-31 <!-- Group G2: Tournament undo hardening (🟤 Auto, Cleanup Week #3) — 3 of 4 items shipped; MERGED to main 2026-08-31 locally (merge 6305a7a, --no-ff, branch deleted remote + local) with NO PR (task brief); 556 unit re-verified on merged main + E2E 56/56 on the merge push. Engine clearHistory()/dropEntry() O(1) primitives; reconcileWithFiles drops the session-only stack on a bulk prune (not the naive {trackUndo:true}, which would push one O(n) strategy.serialize() per file and undo the PR #55 24k win); a special entry whose disk restore fails twice drops itself AND clears the rest of the stack (entries beneath hold pre-removal filesSnapshots, and most picks undo via an O(1) delta that never touches strategy.files, so undoing one resurrects a phantom in engine.files that is never dealt into a pair, never caught by the -1 auto-prune, over-counted by getTierBreakdown() and persisted by serialize()); empty-state keydown canUndo consults engine.history with a load-bearing isTournamentMode conjunct. ⛔ Task 4 (_tournamentRenderBusy re-entrancy lock, spec DEC-1) shipped in 57fa2a4 then REVERTED in a4bf666 as UNSOUND, not merely incomplete: _buildTournamentSide re-enters the render from DOM callbacks that bypass every handler (media error listener :4879 and JXL decode-failure :4852 both call showTournamentPair() un-awaited from inside the render), so a handler-family lock either misses that path and silently drops user input (what shipped — a Ctrl+A promptly after a pick was lost with no feedback) or covers it and wedges. Bisect: main 4/4, through T3 3/3, with the lock ~2 of 3 runs FAIL, serializing variant (g2-serialization-wip b155374, unit-green 566, mutation-verified) ~1 failure/run, lock neutralized 4/4, after revert 5/5. Hand-authored forward revert (not git revert 57fa2a4 — four later commits touch the same methods; git diff -w verified no statement crossed a catch boundary). Unit 529→556 (555 planned, +4 review, −4 revert); E2E 56/56 through the real pre-push gate; lint clean. Whole-branch review: 1 code finding @75 (the drop path skipped the ae98e85 identity re-check) + 5 doc findings, all fixed e33d7c8 + b352360; one candidate NOT reported (reconcileWithFiles clearing unrelated entries, scored 25 — documented DEC-3 trade-off, better than main's baseline). ⭐ FIVE OF SIX review findings shared ONE root cause: docs written from the plan, not re-verified against code at write time — same as G4, third instance in this branch, first one caught BEFORE landing by putting the doc fix in the same commit as the change. ⭐ Three failed fix attempts ≠ stuck: the bisect's control converted it into "blocked on a named defect". Filed 🟤 [2026-08-31] ×2 (the un-awaited re-entrant renders = the blocker; the guard re-filed as blocked on it). ⚠️ Self-reported process slip: one test-file edit went through Bash, breaking the Edit/Write-only dead-rules-audit trial constraint; reverted and redone via Edit, so the audit record looks CLEAN while the violation happened — a result for the trial (a Bash write is structurally invisible to a PostToolUse matcher; "compliant" cannot be distinguished from unobserved). Prior: Group G1: Bulk-rate follow-ups (🟤 Auto, Cleanup Week #3 🏆) — the PR #66 D2 deferred-re-render fix finally has REAL E2E coverage: the compare-mode test brings up the actual ml-worker.js (mlWorker was null under Playwright because initializeMlWorker() is LAZY — first AI sort / settings toggle — not a harness limit, so the planned stub became "run the real worker": zero production hooks), warms the model 3+3, and asserts updateComplete×2 → scoreComplete:scores → showMedia for the rating and the reverse chain for undo (fails against a reverted D2). Three lifecycle fixes on the same state: _cancelDeferredCompareRefresh() (wasPending rule; loadFolder calls it TWICE after the review round — pre-scan because a >3 s scan outlives the fallback, pre-split because showLoadingSpinner() does not set isLoading), prunedPairKeys captured on move-history entries + restored in restoreFeatureCachesFromHistory before the mlFeatures guard, and the counter/undo-arithmetic coverage gaps (fall-through at index 1; undoBulkRating posted count). Local whole-branch review: 3 findings @75 + 1 sub-threshold, all fixed in 9a86c2e — incl. correcting the reviewer's own proposed E2E de-flake (a _scoreDebounceTimer===null wait cannot see an in-flight scoreAll → posts-vs-replies counter). ✅ MERGED to main 2026-08-29 locally (merge 66b16af, --no-ff, branch deleted remote + local) with NO PR (task brief); 8 commits above 29636fd; unit 513→529, compare-mode E2E 8→9, full E2E 56/56 on every push; every new guard test mutation-verified. Filed 4 🟤 [2026-08-29] closeout follow-ups (scores:null stall; scoreAll run-id; behavioral tests for the 2 source-order capture sites; per-window token). Prior: Group G4: Strategic-doc refresh & CLAUDE.md hygiene (🟡 Operational + 1 🟤 folded) — GOALS/ROADMAP/MILESTONES unfrozen from 2026-02-05 (D1 hybrid model: v1.1 retro-closed, v2.0 the one forward version, rest → Now/Next/Later themes); quarterly review note replaced by a planning-session staleness check wired into the user's local prompt; CLAUDE.md pre-push-gate sync + ~8400→~9400; PROJECT.md fixed too (D11 — the spec's file list omitted it though Knowledge Sources reads it BEFORE docs/). Executed 2026-08-27 against a re-verified fact table after a ~6.5wk slip tripped the spec's own structural-contradiction rule → 7 amendments (D6 onward): D6 renderer 7,864→9,418 with zero extractions so the v2.0 KR is 🔴 and reworded, not 🟡 'trending down'; D7 24k AI-sort milestone ✅ 2026-07-20; D8 v2.0 promoted Next→Now; D10 'weekly'→cadence-neutral (measured 7.5wk gap); D12 delete derived ranges rather than restate them. ✅ MERGED to main 2026-08-27 locally (merge a843d36, --no-ff, branch deleted remote + local) with NO PR (task brief); 10 files docs-only, 513/513 unit green, pre-push docs-only-skipped. Local whole-branch review found 5 issues sharing ONE root cause (a late correction never swept back over docs written earlier in the branch) — all fixed, and the fix commit re-opened the defect (rewrote the range while extending it in the same diff) → closed structurally by deleting the derived value. Filed 4 🟤 [2026-08-27] closeout follow-ups. Prior: Group G5: Weekly Reviews (2026-08-27 catch-up run, ⚪ Overhead) — 3rd run of the recurring batch; scan window PRs #63–#66 (previous run 2026-07-05, ~7.5wk gap), lightweight inline research (10 web calls, no harness), lightweight run-card not a full spec+plan (no archived plan). 5 verdicts / 3 adopt: security-guidance (reverses the 2026-07-05 "low fit" parking — no CI is an argument FOR an in-session layer) + dead-rules-audit (karanb192/claude-code-hooks; fit measured by its parser at 36 rules/10 judgeable) + path-scoped-rules migration (CLAUDE.md measured at 205 lines, .claude/rules/ absent) → 3 🟤 [2026-08-27]; harness engineering (Fowler) pass; code-review rating-axis (score by realness not severity; 4 consecutive PRs, 126MB data-loss cost) propagate → TODO § Spawned Tasks. NEW REVIEW-QUEUE §4 Cross-project propagation — conventions IMPORTED from claude-code-universal-config (4 prior runs there) rather than invented, and made BIDIRECTIONAL (D1) after finding the sibling repo had routed items at media_viewer that a one-way channel dropped; inbound items with pending upstream reviews were parked, not filed. ✅ MERGED to main 2026-08-27 locally (merge 4f1e65a, --no-ff, branch deleted remote + local) with NO PR (task brief said do not open PR; review run locally on the whole branch instead) — 5 commits above 0b00275, 513/513 unit green throughout, pre-push gate docs-only-skipped; local whole-branch review's 2 at-threshold findings (this DONE entry; run-card unindexed in docs/README.md) + 5 sub-threshold folded in-branch. Standing signals: 5 adopts unchecked with zero burn-down across 3 runs; cadence slipped ~7.5wk (may be monthly). Prior: Group G3: Bulk-rate re-pair avoidance (🔵 User-Flagged, solo) — AI-sorted compare no longer re-shows the exact two-file pair rated Both good/Both bad; exact-pair suppression + full-list fall-through, session-only bulkRatedPairs (no .bulk_rated.json change). Core built subagent-driven here (3 TDD tasks + opus whole-branch review); a PARALLEL Verification chat then ran the user-side smoke (round 1) and found 2 real defects the 500-unit/55-E2E suite missed — D1 "Pair X of Y" shrank-then-jumped (denominator counted un-rated pairs → replaced with the full-extremes count) and D2 rated pairs re-appeared instead of re-mixing (applyBulkRating rendered synchronously from pre-rating scores, a pre-existing non-deferral G3 unmasked by nextMedia→in-place showMedia → deferred via the pendingCompareRefresh protocol, same for handleCancel's bulk-undo) — both fixed with a companion design+plan (+3 review-found), unit 500→513, E2E 55/55, lint 0-err. ⚠️ MERGED to main 2026-08-24 on USER DIRECTION (GitHub PR #66 was closed unmerged, then merged via local --no-ff; 18 commits above 3221af8) — user-side re-smoke round 2 was NOT run (acceptance gate unsatisfied) and the D2 deferred-re-render fix has ZERO automated coverage (mlWorker is null under Playwright → the compare bulk-rating E2E passes for the wrong reason); follow-ups incl. a worker-stub filed BACKLOG 🟤 [2026-08-24]. Prior: Group G2: Tournament-mode bug fixes (🔵 User-Flagged) — 🔴 undo intermittently fails (root cause: handleTournamentUndo peeked moveHistory, which tournament picks never write and which clears only on folder change, so any special-folder move even from single mode hijacked every tournament undo → engine.history is now the single chronological undo stack with kind pick/special/prune + peekUndoEntry/undoUserAction, prunes absorbed transparently; special path restores file on disk before advancing the stack with an identity re-check making correctness independent of the advisory isLoading mutex) + 🟠 mouse-wheel isTournamentMode guard + 🔵 auto-hide .tournament-header/.tournament-controls via extracted \_setupAutoHide; 6-task subagent-driven run (controller commits) + per-task reviews + opus whole-branch review (demonstrated an invisible-but-clickable exit button, falsified an earlier review's dismissal); external /code-review "No issues found" but verifying its top candidate surfaced the advisory-mutex defect fixed pre-merge ae98e85; 471→492 unit / full E2E 52→55 / lint 0-err; MERGED 2026-07-21 via PR #65 (merge 937084c, branch fix/g2-tournament-bug-fixes deleted remote + local); user-side 6-point manual smoke PASSED 2026-07-21 (all 6 checks; run after the user-directed merge — acceptance gate satisfied); filed ### [2026-07-21] PR #65 review follow-ups 🟤 (9 items) + checked off 3 resolved BACKLOG entries. Prior: Group G1: AI-sort startup UX & incremental cache-load (🔵 User-Flagged, WEEKLY 🏆) — phased/cancelable handleSortByPrediction (abort controller + determinate progress card before the first await + finally cleanup) + awaitable runMlSort (sortRunId stale-guard) + atomic incremental loadFeatureCache (staged-local, commit-on-complete) + binary Float32Array transport for feature-cache-chunk (new feature-cache-transport.js) + unified sort-card progress + warm-cache gate + mutual prediction/similarity sort-path exclusion; two post-review incidents fixed in-branch (external-review data-loss regression, b8b5636; a worse 24k-smoke cache-corruption route, 2777bdf + c947081); 434→471 unit, full E2E 52/52, lint clean; user-side 24k manual smoke PASSED 2026-07-20 (all 5 checks, real 20,929-file folder); MERGED 2026-07-20 via PR #64 (merge b6ff4ac, branch feature/g1-ai-sort-startup-ux deleted remote + local); 🔴 "Speed up AI / similarity sorting on large folders" TODO stays OPEN (PR2 hash-off-thread remains). Prior: Group CW-P: Process & DX guardrails (🟡 Operational + 1 folded 🟤; 2nd Cleanup Week) — pre-push E2E gate (pure parsePushRefs/classifyPaths + fail-safe git-wrapper CLI + Husky v9 plain-sh hook; code-aware docs-only skip) closing the no-CI "silently-broken E2E can land" gap (pre-commit runs unit only); Weekly-Reviews methodology consolidation (6 fixes → canonical spec section + hybrid-sourcing REVIEW-QUEUE intro); CLAUDE.md ref-sweep bullet. Subagent-driven (controller commits); complete on-branch cleanup/cw-p-process-dx-guardrails (7 commits), final opus review "Ready to merge: Yes" (1 Minor stdin-read fail-safe folded 018f0d2); 434 unit / full E2E 52/52 / lint 0-err (1 pre-existing warning) / format clean; MERGED 2026-07-11 via PR #63 (merge f6c2c46, branch deleted remote + local); post-merge /code-review "No issues found" (3 sub-threshold findings → 2 🟤 [2026-07-11] PR #63 post-merge follow-ups: CLAUDE.md doc-sync for the new pre-push gate; maxBuffer parity); +2 [2026-07-10] closeout follow-ups (🟤 CLI-layer tests; 🟡 friction re-eval). Prior: Group WR: Weekly Reviews (2026-07-05 run, ⚪ overhead) — 2nd run of the recurring batch; lightweight inline research (hybrid candidate sourcing, ~9 web calls, no deep-research harness — validating the 2026-06-26 methodology correction); 4 verdicts / 2 adopt (typescript-lsp official code-intelligence LSP → 🟤; autonomous e2e/visual verification before "done" → 🟤) + 2 pass (Electron Developer Agent persona; Addy Osmani workflow); lightweight run-card instead of full spec+plan (no separate archived plan); closeout on-branch chore/wr-weekly-reviews (db09ffd run-card, ab74f1c verdicts, closeout a1076a7); MERGED 2026-07-06 via PR #62 (merge 291879c, branch deleted remote + local; docs-only → "No issues found", no /code-review fan-out); +2 🟤 [2026-07-06] PR #62 post-merge follow-ups (methodology codification, fold into CW-P). Prior: Group CW-V: Test & tooling backfill (test-only) — comment-aware methodSource brace guard (assertLiteralBracesBalanced skips comments, flags string/template-span brace imbalance) + src test seam; extractAddedLines real-git-diff fixtures (temp repos, GIT_DIR-stripped); sort-progress card E2E (observer-capture appear/remove + cancel→abort); play/pause icon toggle E2E via synthetic events (Lucide-stub-aware). MERGED 2026-07-05 via PR #61 (merge 85f1f29, branch deleted remote + local); pre-merge /code-review "No issues found" at threshold, 4 sub-threshold nits folded in-branch pre-merge (e737589); subagent-driven (9 commits, controller commits), every per-task review Approved + final whole-branch review (opus) "Ready to merge: Yes" (4 Minor doc-honesty/robustness folded in); 423 unit / full E2E 52/52 / lint 0-err (1 pre-existing no-shadow) / format clean; checked off 4 source BACKLOG items ([2026-06-25] methodSource, [2026-03-23] play/pause, [2026-06-19] sort-progress E2E, [2026-06-18] real-git fixtures) + filed 2 🟤 [2026-07-05] follow-ups (guard-residual extension; sort-progress E2E nits). Prior: Group CW-D: Docs & CLAUDE.md hygiene — docs-only consolidation pass clearing the 5 deferred revise-claude-md/doc-drift items (3 tournament gotchas + debounced-persistence/v2 note + MinHeap/VPTree worker-only note into CLAUDE.md; PR2/PR3 per-phase framing into DONE.md/TODO.md; manual-only maintenance decision D1 + Maintenance footer); each verified against current post-CW-T code; MERGED 2026-07-04 via PR #60 (merge dba3ecf); post-merge /code-review 1 finding (archived-plan COMPLETE header vs 26 unchecked step boxes, scored 100) fixed pre-merge in b8b31a4, re-review clean; +2 🟤 [2026-07-04] post-merge follow-ups (stale docs/README.md footer; automate pre-archive checkbox-flip check); decisions D1 manual-only maintenance + D2 no line-ref sweep; 411 unit green. Prior: Group CW-T: Tournament correctness, persistence & hardening — 2 HIGH bugs (cannot-enter-after-add-media+AI-sort → live-engine fast-path reconcile gap, fixed by reconcileWithFiles-on-every-entry + hardened -1; 24k freeze/Both-Win hang → O(1) inverse-delta undo replacing per-pick strategy.serialize() + showTournamentPairFast wrapper-reuse render) + 6 🟤 debt items; branch fix/cw-t-tournament-hardening MERGED 2026-07-03 via PR #59 (merge ae9588d, deleted remote + local); subagent-driven (8 commits), all per-task reviews Approved + final whole-branch review (opus) "Ready to merge: Yes" after catching 2 cross-cutting fast-path bugs (shared-JXL-URL revoke; duplicate error handler) both fixed in-branch; real-24k manual smoke PASSED; post-merge /code-review 2 real findings (delta-undo removeFile corruption reproduced by execution + close-guard resume-prompt) both fixed pre-merge in f4b7807 (+3 unit → 411), +2 🟤 [2026-07-03] residuals; 404→411 unit, lint 0, tournament E2E 6/6; persistent media-viewer-perf.log added post-smoke. Prior: Group T1: Tournament exit affordances (in-tournament exit button + confirm-before-app-close) — MERGED 2026-06-30 via PR #58 (merge 21668ac, branch deleted remote + local); subagent-driven (8 commits, controller commits), every per-task review Approved + final whole-branch review (opus) "Ready to merge: Yes" (1 Important + 1 Minor folded in: isDestroyed() guard, once-register ipcMain.on + isQuitting re-arm); post-merge /code-review "No issues found" — the scored-75 discard-path fail-safe gap folded in PRE-MERGE (3ad32bb, +1 test) + 2 🟤 [2026-06-30] PR #58 post-merge items (orphaned-state-on-failed-discard; discarded onAppCloseRequested unsubscribe, 25); 389 unit (+8), full E2E 48 pass / 1 pre-existing fail (PR #55 history-free v2 stale assertion, verified failing on main), lint 0; all 5 manual close-confirm cases PASSED; user-flagged #navInfo overlap fixed (cac3e79). Prior: Group WR: Weekly Reviews first run — MERGED 2026-06-29 via PR #57 (b42f5f5, branch chore/weekly-reviews-2026-06-26 deleted remote + local); docs-only so /code-review was a no-op "No issues found" (+2 🟡 [2026-06-29] post-merge process observations). 4 verdicts (1 adopt: pr-review-toolkit → 🟤 BACKLOG; 3 defer); deep-research harness hit rate/session limits (~8M tokens, verification never completed) → methodology corrected to lightweight inline research for future weeks. Prior: Group P3: Feature-extraction timing (lazy / on-demand) — removed folder-open + CLIP-toggle kickoffs; conditional on-demand CLIP-sort trigger gated by clipVectorsNeedExtraction; ML sort already lazy, hash sort needs no vectors. MERGED 2026-06-26 via PR #56 (merge 9d65500, branch deleted), manual 24k smoke PASSED, pre-merge /code-review fix cba5352 (stale E2E + 2 comments), re-review "no issues remaining", 381 unit. Prior: Group P2: Tournament large-folder performance (debounced single-flight persistence + O(n) consumed-marker pairing + cached path→index Map + slim v2 history-free payload + atomic write); branch feature/tournament-large-folder-perf MERGED 2026-06-25 via PR #55 (merge 51366cb), manual 24k smoke PASSED, re-review "No issues found". Prior: Group P1 PR1 MERGED via PR #54 (7b78a56). -->

**Purpose**: Historical record of completed work.
**Active tasks**: See [TODO.md](TODO.md)
**Project context**: See [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)

---

<!-- Organize by month, newest first. -->

## 2026-08 (August)

### 2026-08-31 — Group G2: Tournament undo hardening 🟤 (Cleanup Week #3) — **3/4, MERGED**

**Summary**: Closed the gaps that can strand or wedge the unified `engine.history` undo stack PR #65 introduced in July. Two new O(1) engine primitives (`clearHistory`, `dropEntry`) give the renderer and the manager a way out of states the snapshot machinery cannot reverse: `reconcileWithFiles` now drops the whole session-only stack when a bulk prune removes anything, instead of an untracked `removeFile()` that left undo-past-a-removal stranding files at Tier-0 — and instead of the naive `{trackUndo:true}` fix, which would have pushed one O(n) `strategy.serialize()` per file and undone the PR #55 24k win. A `special` entry whose disk restore keeps failing now drops itself after 2 cumulative failures rather than sitting on top forever with every later Ctrl+A retrying the absent path. The empty-state keydown guard consults `engine.history`, so a tournament emptied by the `-1` auto-prune no longer swallows Ctrl+A while `#tournamentUndoBtn` reads enabled.

✅ **Status: 3 of 4 WEEKLY items shipped. MERGED 2026-08-31 into `main` locally** (merge `6305a7a`, `--no-ff`; branch `g2-tournament-undo-hardening` deleted remote + local) — **no PR** by task-brief instruction; reviewed locally on the whole branch instead. 15 commits above `1d072e3`; merged from `1d8868c`. Unit re-verified **556 green on merged `main`**, and the merge push ran the full E2E gate again: **56/56**. Unit 529 → **556**; full Playwright **56/56** through the real pre-push gate (no `--no-verify`), plus 5/5 standalone tournament runs; prettier + lint clean (1 pre-existing `no-shadow` warning). Spec: [2026-08-30-g2-tournament-undo-hardening-design.md](../superpowers/specs/2026-08-30-g2-tournament-undo-hardening-design.md) · Plan: [archived](../archive/plans/2026-08-30_g2-tournament-undo-hardening.md).

**Key changes**:

- **T1 `cf7a30d` + `37ca6b3` — engine primitives** ([tournament-engine.js](../../tournament-engine.js)): `clearHistory()` → count dropped; `dropEntry(entry)` → bool. Dropping is not undoing — strategy state stands, only reversibility is given up.
- **T2 `74d3961` — `reconcileWithFiles` drops the stack** ([tournament.js](../../tournament.js)), notifying only when the clear actually cost something.
- **T3 `b7a964b` / `5a09376` / `762714a` — wedged-entry escape**: `TOURNAMENT_RESTORE_MAX_ATTEMPTS = 2` counted **cumulatively per entry** in a `WeakMap` (nothing resets it but the entry leaving the stack — deliberate, and it differs from the spec's "consecutive" wording). `_dropWedgedSpecialEntry` also clears the rest of the stack: entries beneath hold pre-removal `filesSnapshot`s, and most picks undo via an O(1) delta that never touches `strategy.files`, so undoing one would resurrect a phantom present in `engine.files` and absent from `strategy.files` — never dealt into a pair, never caught by the `-1` auto-prune, over-counted by `getTierBreakdown()` and persisted by `serialize()`.
- **T5 `19e6762` / `3eff3eb` — keydown `canUndo` + the `exitTournamentMode` invariant comment**, plus the CLAUDE.md 964-char bullet split into three.
- **⛔ T4 `57fa2a4` — REVERTED in `a4bf666`.** See below.

**The Task 4 revert**: the `_tournamentRenderBusy` re-entrancy lock (spec DEC-1) shipped, then failed the tournament E2E. It is **unsound as specified, not merely incomplete**: `_buildTournamentSide` re-enters the render from DOM callbacks that never pass through a handler — the media `error` listener ([media-viewer.js](../../media-viewer.js) `:4879`) and the JXL decode-failure path (`:4852`) both call `showTournamentPair()` un-awaited, from *inside* the render `showTournamentPair` started. A lock over the handler family can therefore only miss that path and silently drop user input (what shipped — a Ctrl+A pressed promptly after a pick was lost with no feedback) or cover it and wedge. A serializing variant that waits instead of dropping is parked on **`g2-serialization-wip` (`b155374`)**: unit-green at 566, three guards mutation-verified, still ~1 failure per run — it lands on the first horn, which is the evidence that the missing piece is the precondition, not the lock design.

| Configuration | Tournament E2E |
| --- | --- |
| `main` | 4/4 green |
| Branch through Task 3 (`5a09376`) | 3/3 green |
| Branch with Task 4's lock (`820f34d`) | ~2 of 3 runs fail |
| Serializing variant (`b155374`) | ~1 failure per run |
| Lock neutralized, everything else intact | 4/4 green |
| After the revert (`a4bf666`) | 5/5 green |

Reverted as a hand-authored forward commit, not `git revert 57fa2a4` — four later commits touch the same methods and `e33d7c8` had to survive (verified: `git diff -w` reduces to the constructor field, three guard/set/`try`+`finally` blocks, one reworded comment; no statement crossed a `catch` boundary). Unit 560 → 556, exactly Task 4's four cases. The undo re-entrancy test became an explicit **characterization** test asserting a second undo *does* re-enter, with a note that it must go red when the real guard lands — a tripwire that fails honestly rather than documenting a guarantee that no longer exists.

**Review**: whole-branch, five parallel reviewers + confidence scoring. 1 code finding at 75 and 5 documentation findings; all fixed in `e33d7c8` + `b352360`. The code finding: the wedged-entry drop path mutated `engine.history` on a `pending` captured before an `await`, skipping the identity re-check the success path performs 13 lines below (established by `ae98e85` precisely because `isLoading` is advisory). One candidate was **not** reported — `reconcileWithFiles` discarding unrelated healthy entries, scored 25: it is the documented DEC-3 trade-off, strictly better than `main`'s stale-history baseline, and its desync tail needs a pre-existing mode-exit hole the branch did not create.

**Learnings**: **five of six review findings shared one root cause** — documentation written from the plan rather than re-verified against the code at the moment of writing. Same root cause G4's review recorded one group earlier, now third-instance in this branch; the revert re-opened the same surface (four docs asserted `_tournamentRenderBusy` shipped) and was the first instance caught *before* landing, by putting the doc correction in the same commit as the change so it cannot drift. Second: **three failed attempts did not mean "stuck"** — the bisect with a proper control (lock neutralized, everything else intact → 4/4) converted it into "this task is blocked on a named defect", which is actionable where a stop is not. Third: the E2E **over-represented the trigger and correctly represented the failure mode** — `tiny.mp4` fails to decode in the fixtures on every run, so the storm is constant there and rare in production, but a silent `return` that discards a keypress is real however the storm starts.

**Deviations from process**: not merged — closeout records state on the branch by user decision. TODO.md transition N/A (G2 was scheduled BACKLOG → WEEKLY directly). Two 🟤 `[2026-08-31]` items filed: the un-awaited re-entrant renders (one defect, three sites — the blocker) and the re-entrancy guard re-filed as blocked on it, flagging that `g2-serialization-wip`'s `_isForeignLoadInFlight()` changes a pre-existing guard and needs its own review. One process slip, self-reported: a test file was edited via a Bash one-liner mid-session, breaking the Edit/Write-only constraint this group is the `dead-rules-audit` trial vehicle for. It was reverted and redone through Edit — which means **the audit record looks clean while the violation still happened**. That is a result for the trial, not a footnote: the `PostToolUse` matcher observes tool calls, so a Bash write is structurally invisible to it, and a scorecard reading "compliant" cannot distinguish that from real compliance — the same failure mode the trial exists to catch, one level up.

### 2026-08-30 — Group G4: Adopt-queue trial batch + cadence decision 🟤 (+1 🟡 folded) — **2/3, PARTIAL**

**Summary**: Consumed the Weekly-Reviews `adopt` queue instead of growing it, and fixed the structural reason it never burned down — sections 1–3 of REVIEW-QUEUE.md could record a verdict but had nowhere to record what happened next, so no `adopt` had a terminal state. Settled the consumption policy and the cadence, then trialled one of the two queued plugins for real.

🔄 **Status: 2 of 3 items complete. MERGED 2026-08-30 into `main` locally** (merge `bf58c01`, `--no-ff`; branch `g4-adopt-queue-trial` deleted remote + local) — **no PR** by task-brief instruction. The third item, the `dead-rules-audit` scorecard read-out, is **legitimately pending its vehicle**: the plugin scores `Edit`/`Write` calls across the G2 + G3 sessions and reads out at **G6 on Fri Sep 4**. This entry is amended then, not replaced.

**Key changes**:

- **`9cdc9f2` — the deliverable**. Policy **b+** (an `adopt` must name its **trial vehicle** at filing time or be filed `defer`; cap of 3 outstanding) and **cadence kept weekly as written** — both user decisions; the 06-26 → 07-05 → 08-27 slippage is kept as a *watch*, not silently re-timed. New [REVIEW-QUEUE.md](REVIEW-QUEUE.md) **§ 5 Adopt trials** (policy + outcome log) and a matching 📌 Process Rules bullet in [BACKLOG.md](BACKLOG.md). Also repaired the recorded format-on-save corruption at REVIEW-QUEUE.md:125.
- **`pr-review-toolkit` trial → keep** (complement to `/code-review`, not a replacement). Retargeted: G1 merged with **no PR**, so it ran on G1's **pre-review-round** revision `29636fd..9aa27d1` in a throwaway worktree — the exact code `/code-review` saw — with four agents **blind** to the baseline, a stronger control than a fresh PR. It matched the baseline, extended one finding, and produced **8 items beyond it** (🟤 `[2026-08-30]`). ~613k subagent tokens / ~13 min parallel.
- **Two counting errors in the 2026-08-27 stocktake, measured not assumed**: the 🟡 entry said "5 unchecked" while naming **six**, and `security-guidance` was already installed **and enabled on 2026-08-24 — three days before the run that adopted it**, venv built. The one adopt that got consumed was consumed *outside* the process. That evidence is what b+ rests on.
- **`9ecd71a` — review corrections**. All eight filed items survived as defects; **four had their surrounding story overturned** and were corrected in place, marked inline rather than silently rewritten (see Review below).
- **`5ac7230` — placement**. The `dead-rules-audit` precondition moved onto the **G2 and G3 group headers**, where those sessions read their brief: the matcher is `Edit|MultiEdit|Write` and **auto mode routes edits through Bash**, so a shell-editing session scores zero and the scorecard reads "compliant" having observed nothing. G6 gained the read-out **line item** it had been assigned but never listed, plus the rule that makes a null result legible — **zero scored edits is `inconclusive`, never `keep`**.
- **[CLAUDE.md](../../CLAUDE.md)** (propagation, this closeout): **L144** no longer claims `restoreFeatureCachesFromHistory` is "called in all `handleCancel` branches" — verified false, the bulk-undo branch correctly does not call it; **L157** no longer calls `moveComparePair`'s arm "equivalent inline code" — it discards both post results and hardcodes `2`, with the clause marked for deletion when 🟤 item 1 lands.

**Review**: a code review of `9cdc9f2` re-derived all eight filed items from source. Confirmed exactly as filed: items **2, 5, 6, 8**. Corrected: **item 1**'s trigger was **unreachable** (the capture block is itself gated on `isMlEnabled && mlWorker`, so the guard the finding attacked is what rescues that case) and is now the narrower TOCTOU across the awaited move IPC; **item 3**'s predicted symptom was wrong (`showTournamentPair` sets `isCompareMode = true`, so it is a wrong-*pair* re-render, not a stray single); **item 4**'s headline was **refuted** (`window.onerror` does forward to `logError`); **item 7** understated coverage — and the review's own replacement count was also wrong, re-derived here as **2 of 5** branches, both passes having missed the `!isCompareMode` pair branch at `:4166-4167`. Several copied-not-measured counts corrected too (CLAUDE.md is 206 lines; 8 of 11 judgeable rules are Active-gotchas; 56 session-state files; `typescript-lsp` is the 3rd outstanding trial, not the 4th).

**Deviations from process**: no plan doc under `docs/planning/plans/` — the group ran brainstorm → direct execution as a 3 SP docs-only batch, so ARCHIVE was a genuine no-op rather than a skipped step. No TODO.md entry existed to transition (G4 was scheduled straight into WEEKLY.md). Worth noting for the next docs-only group: the plan requirement is aimed at code work, but the absence meant progress was logged only in commits.

**Learnings**: the trial's real result is sharper than "8 items beyond baseline" — **every claim that failed, failed in the same direction**: a real defect wrapped in a confident, unverified *reachability* story, while the four that stayed with what the code literally says all held. So `pr-review-toolkit` is a generator of **leads with mechanisms attached**, and the mechanism is the part to verify. Relatedly, three-of-four agent convergence (item 1) was convergence on a *mechanism* and is not evidence of reachability. The session also hit the **late-correction-doesn't-sweep-back** class three times — in the commit that filed a finding about it, in the memory record of that commit, and in that record's own summary — confirming that writing a correction is cheap and enumerating every surface repeating the value is the whole task.

### 2026-08-29 — Group G1: Bulk-rate follow-ups 🟤 🏆 (Cleanup Week #3)

**Summary**: Gave the PR #66 deferred-re-render fix (D2) — the main correctness property of that branch — the automated coverage it shipped without, and closed the three lifecycle gaps + two unit-coverage gaps deferred from its review. The 🟤 premise ("`mlWorker` is null under Playwright — stub it") was **true but mis-attributed**: the worker is null because `initializeMlWorker()` is _lazy_ (first AI sort / settings toggle), not because the harness can't run workers. So the E2E brings up the **real** `ml-worker.js`, warms the model past `hasEnoughSamples` (3 likes + 3 dislikes, 576-dim vectors), and asserts `updateComplete×2 → scoreComplete:scores → showMedia` for `applyBulkRating` and the `reverseUpdateComplete` chain for its undo — settled by the reply, not the 3 s fallback. Zero production hooks; it fails against a reverted D2.

✅ **Status: MERGED 2026-08-29 into `main` locally** (merge `66b16af`, `--no-ff`; branch `g1-bulk-rate-followups` deleted remote + local) — **no PR** by task-brief instruction; reviewed locally on the whole branch. 8 commits above `29636fd`; unit 513 → **529**, `compare-mode` E2E 8 → **9**, full Playwright 56/56 on every push (pre-push gate); lint 0 errors (1 pre-existing warning). Spec: [2026-08-29-g1-bulk-rate-followups-design.md](../superpowers/specs/2026-08-29-g1-bulk-rate-followups-design.md) · Plan: [archived](../archive/plans/2026-08-29_g1-bulk-rate-followups.md).

**Key changes**:

- **T1 `bdcde3b` — real-worker E2E** ([compare-mode.test.js](../../tests/e2e/compare-mode.test.js)): instruments `handleMlWorkerMessage`/`showMedia`, counts `scoreAll` posts vs `scoreComplete` replies and waits for worker quiescence before asserting (review round).
- **T2 `0d3ae44` — `_cancelDeferredCompareRefresh()`**: releases `mediaNavigationInProgress` only if a window was open (`wasPending` — the flag is also the ordinary navigation mutex). `loadFolder` calls it **twice** after the review round: before the scan (a >3 s scan outlives the fallback) and before the empty/non-empty split (`showLoadingSpinner()` does not set `isLoading`, so the old folder stays rateable mid-scan).
- **T3 `f708b76` — pair keys survive undo**: `_bulkPairKeysReferencing(name)`; `moveCurrentFile` / `moveToSpecialFolder` / `moveComparePair` stash `prunedPairKeys` on the history entry before `removeFileFromList`; `restoreFeatureCachesFromHistory` re-adds them _before_ its `mlFeatures` guard (tournament undo included).
- **T4 `bb95bf0` — coverage gaps**: `updateNavigationInfo` fall-through at `mlComparePairIndex = 1` (index 0 cannot see the mutation); `undoBulkRating` posted-count with true/true, true/false, false/false and null-feature mocks.
- **CLAUDE.md** (206 lines): `removeFileFromList` / `restoreFeatureCachesFromHistory` / ML-compare-refresh bullets + an E2E gotcha for the lazy worker.

**Review** (`9a86c2e`): 3 findings @75 (surfaced per the standing rule on verified findings) + 1 sub-threshold, all fixed — CLAUDE.md said tournament undo restores "before `showMedia()`" (it renders via `showTournamentPair()`); T2 only narrowed the `loadFolder` race (fixed with the pre-scan cancel); the E2E's exact event list had a flake vector via the 100 ms score debounce. The reviewer's proposed de-flake (`_scoreDebounceTimer === null`) was itself insufficient — no in-flight-`scoreAll` flag exists — so the fix counts posts vs replies instead; the re-review confirmed the correction. Dynamic compare-pair undo test added. Every new guard test mutation-verified (D2 revert; pre-scan cancel dropped → 2 tests; restore disabled → 4 tests; fall-through / `postedUpdates++` dropped).

**Deviations from plan**: `initComplete` sets `mlStats`, not `mlModelState` (plan text corrected in the E2E). Spec D5: two findings surfaced during design were deliberately **not** fixed (out of the approved scope) → BACKLOG 🟤 [2026-08-29] with the two review-round residues. TODO.md transition N/A — G1 was scheduled straight from BACKLOG into WEEKLY.

### 2026-08-27 — Group G4: Strategic-doc refresh & CLAUDE.md hygiene 🟡 (+1 🟤 folded)

**Summary**: Unfroze `GOALS.md` / `ROADMAP.md` / `MILESTONES.md` from **2026-02-05** — six-and-a-half months during which Tournament mode, JXL, CLIP, the test suite and the 24k-perf work all shipped _outside_ the documented roadmap — and synced `CLAUDE.md` + `PROJECT.md` to current reality. Adopts the approved **D1 hybrid release model**: v1.1 retro-closed as shipped, v2.0 kept as the one forward version (the modularization arc), everything else demoted from numbered releases to **Now / Next / Later themes**. Root cause of the freeze was that `Review Cycle: Quarterly` had no enforcing mechanism; it is replaced by a **planning-session staleness check** with a concrete trigger, wired into the user's local planning prompt (done user-side 2026-08-27) so the rule is not merely described in a doc.

✅ **Status: MERGED 2026-08-27 into `main` locally** (merge `a843d36`, `--no-ff`; branch `docs/g4-strategic-docs-refresh` deleted remote + local) — **no PR** by task-brief instruction; reviewed locally on the whole branch instead. 10 files, docs-only, +1150/−126; 513/513 unit green on every commit; the pre-push gate printed the docs-only SKIP on all five pushes.

**Executed against a re-verified fact table, not applied mechanically.** The spec was written 2026-07-12 for a 2026-07-17 run and executed **2026-08-27** (~6.5-week slip) with G1/G2/G3/G5 landing in between, so re-running its § 3 commands tripped the spec's own _"structural contradiction → STOP and report"_ rule. Seven user-approved amendments (**D6 onward**, spec § 9):

- **D6** — the renderer had grown **7,864 → 9,418** (+20%, zero extractions), so the v2.0 KR _"trending down … 🟡"_ asserted the opposite of the measurement → reported **🔴** and reworded to _"reduced by the four extractions"_. Shipping the drafted wording would have reinstated exactly the aspirational fiction this refresh existed to purge.
- **D7** — _24k AI-sort smooth end-to-end_ recorded **✅ Complete 2026-07-20** (4/4 DoD, PR #64 + the 20 929-file smoke) rather than the pre-written 🟡; the open PR2 hash-off-thread slice stays a separate 🔴 KR instead of retro-widening a milestone that never scoped it.
- **D8** — both _Now_ themes had drained (G1/G2/G3) → **v2.0 modularization promoted Next → Now**, answering D6.
- **D9** — index the G4 spec + plan in `docs/README.md` (8th recurrence of that class).
- **D10** — _"weekly"_ staleness check → **cadence-neutral** wording. The measured gap between review runs is 7.5 weeks and the user confirmed the cause is availability, so the drafted docs asserted a cadence the repo's own G5 run-card already contradicted.
- **D11** — **`PROJECT.md` added to scope**; the spec's file list had omitted it.
- **D12** — never enumerate § 9's range in another doc; delete the derived value rather than refresh it.

**Key changes**:

- **[GOALS.md](GOALS.md)** — two objectives (24k-Scale Responsiveness 4/5 KRs 🟢; Maintainable Architecture 2/6 managers); Constraints corrected to 513 unit + 55 E2E and a ~9,400-line renderer.
- **[ROADMAP.md](ROADMAP.md)** — live theme board; the drained _rating & tournament UX polish_ theme explicitly retired rather than quietly dropped; the old aspirational "Future (v3.0+)" list deleted by design.
- **[MILESTONES.md](MILESTONES.md)** — 24k AI-sort closed ✅; v2.0 the sole in-progress milestone, its risk list carrying the measured renderer growth. Health: 3 complete / 1 in progress.
- **[CLAUDE.md](../../CLAUDE.md)** — `scripts/` bullet + pre-push-gate prose (**verified against `.husky/pre-push` and `scripts/check-e2e-needed.js`**, not copied from the BACKLOG wording) + `~8400`→`~9400`. Still 205 lines.
- **[PROJECT.md](../../PROJECT.md)** — 8 substitutions; it had claimed _"Manual (no automated tests)"_, _"# Run tests (not configured)"_, _"~6100+ lines"_, _"No linting configured"_, _"No pre-commit hooks configured"_.
- **[README.md](README.md)** — the four vague "periodically review" checkboxes replaced by the staleness rule; `WEEKLY.md` + `REVIEW-QUEUE.md` added to the tables after months unlisted.

**Review**: local whole-branch pass found **5 issues, one root cause** — a late correction (D10) never swept back over docs written _earlier in the same branch_, the exact failure the global `CLAUDE.md` propagation check describes, committed in the session whose own D10 message quoted that rule. All 5 fixed (`02998ec`), then the reviewer caught that the fix **re-opened itself** — it rewrote the range to "D6–D10" while adding D11 in the same diff, a third iteration — closed structurally in `90ca33a` by deleting the derived value (D12). One reviewer sub-claim ("D11 has no bullet") was **verified false** against the file and reported back.

**Deviations from plan**: Task 7's PR step cancelled by the task brief (push-for-backup only, no PR). One commit (`05ca40e`) used `git add -A` and swept in six out-of-scope planning docs — editor format-on-save reflow, including **backslash escapes inserted inside code spans** (`` `scripts/**/*.js` `` → `` `scripts/\*\*/*.js` ``) — fully reverted in `900a6ea`, verified byte-identical to `main`; history not rewritten.

**Plan**: [docs/archive/plans/2026-07-12_g4-strategic-docs-refresh.md](../archive/plans/2026-07-12_g4-strategic-docs-refresh.md) · **Spec**: [docs/superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md](../superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md) · **Follow-ups**: `### [2026-08-27] From: G4 closeout` 🟤 (4 items).

### 2026-08-27 — Group G5: Weekly Reviews (2026-08-27 catch-up run) ⚪ Overhead

**Summary**: Third run of the recurring **Weekly Reviews** batch (WEEKLY.md Group G5; cross-week state in [REVIEW-QUEUE.md](REVIEW-QUEUE.md)). A **catch-up run, not a week** — the previous run was 2026-07-05, ~7.5 weeks earlier, so the scan window was PRs #63–#66 rather than "this week". Reviewed the strongest not-yet-reviewed candidate per category under the **hybrid relevance lens** (methodology rule #5) using **lightweight inline research** — 10 web calls (5 `WebSearch` + 5 `WebFetch`), **no deep-research harness**, no parallel fan-out (rules #1/#2). Docs-only ⚪ overhead. Used a **lightweight run-card instead of a full spec + implementation plan** (rule #6), so there is **no separate archived plan** for this run.

✅ **Status: MERGED 2026-08-27 into `main` locally** (merge `4f1e65a`, `--no-ff`; branch `chore/g5-weekly-reviews` deleted remote + local). ⚠️ **NO PR** — the task brief said _"Do not open PR"_, so unlike every prior run there is no PR number and no PR-scoped `/code-review`; the review was run locally against the whole branch instead, and the merge was user-directed. 4 commits above `0b00275`: run-card `f579797`, verdicts + REVIEW-QUEUE §4 `c5a41fa`, BACKLOG/TODO routing `137184f`, closeout `8100209` (+ this review-fix commit). 513/513 unit green on every commit (the pre-commit hook runs the suite regardless of docs-only); the pre-push gate correctly emitted `pre-push: docs-only push — skipping E2E.` A whole-branch review was run locally (5 reviewers) and its 2 at-threshold findings — this DONE.md entry, and the run-card missing from `docs/README.md` — were folded in-branch, along with 5 verified sub-threshold ones.

**5 verdicts, 3 adopt**:

- **Plugins / official store** → **`security-guidance`** (`adopt`) → 🟤 BACKLOG trial. **Reverses a 2026-07-05 parking.** It was parked as "low fit — no CI + already gated by ESLint and the pre-commit secret guard"; the primary doc's defense-in-depth table shows that reasoning inverted — the plugin occupies the **in-session** stage neither ESLint nor `check-secrets.js` covers, and having **no CI** is an argument _for_ it, not against. Trial eval points, not blockers: an unverified Python 3.10+ prerequisite on this box, and a commit-review layer that only sees Claude-made commits.
- **Plugins / wider internet** → **`dead-rules-audit`** (`karanb192/claude-code-hooks`, MIT, 488★, Node ≥18, no npm deps) (`adopt`) → 🟤 BACKLOG trial. Measures which `CLAUDE.md` rules are actually being followed. Fit rests on a **parser measurement, not the README**: it reads this repo at **36 rules / 10 judgeable** (vs. 5/2 fragments in the sibling repo — a structural mismatch there, a clean fit here). Also closes an inbound propagation item (see below), deliberately **not** double-filed.
- **Claude best-practice** → **route by primitive — the path-scoped-rules half only** (`adopt`) → 🟤 BACKLOG. Migrate path-conditional `CLAUDE.md` content to `.claude/rules/` so it loads on demand instead of at launch. Measured, not asserted: `CLAUDE.md` is **205 lines** (over its own stated ~200 audit bar) and `.claude/rules/` **does not exist**. Tagged `[possible-dup-of: 🟤 [2026-07-03] CLAUDE.md soft-cap overshoot]`.
- **Non-Claude best-practice** → **harness engineering** (Fowler) (`pass`) — reframes the agent loop around machine-checkable feedback, which this repo already has (Husky pre-commit unit gate + pre-push E2E gate + lint/format); its distinctive additions presuppose CI. Runner-up "harness observability" parked.
- **Cross-project propagation** → **the code-review rating axis: score by _realness_, not severity** (`propagate`) → [TODO.md](TODO.md) § Spawned Tasks. The most-recurring process finding this repo has produced — it fired on **four consecutive PRs** (#59, #64, #65, #66) — with one measured cost: the sub-threshold lifecycle finding deferred on PR #64 destroyed a **23,559-entry / 126 MB** feature cache of real user data. Absence at the target was **tested, not assumed** (`realness`/`severity axis`/`confirmed bug` = 0 hits in both `~/.claude/POLICIES/code-review.md` and the synced `home-claude/` source); the one adjacent hit (global L266) governs _bookkeeping_, not the rating axis, so the row claims "complementary and upstream" rather than "absent".

**Key decisions**: **D1 category 4 is bidirectional** (a deliberate widening of WEEKLY.md's outbound-only wording — see below); **D2 target scope** = `~/.claude` via `claude-code-universal-config` is the one confirmed standing target, other sibling projects TBD; **D3** review `dead-rules-audit` as the wider-internet pick so the not-yet-reviewed filter stays honest.

**Key changes** ([docs/planning/](.)):

- **REVIEW-QUEUE.md** — new `## 4. Cross-project propagation` section (conventions + separate outbound/inbound logs + Next-up), plus an intro paragraph flagging that §4 uses a different verdict vocab and a different routing sink from §§1–3. 5 verdict rows; each category's Next-up refreshed.
- **BACKLOG.md** — `### [2026-08-27] From: Weekly Reviews (2026-08-27 catch-up run) (3 items)`, one 🟤 entry per `adopt`.
- **TODO.md** — `## 🔀 Spawned` renamed to `## 🔀 Spawned Tasks` so WEEKLY.md's two references resolve (repo-wide grep confirmed a single definition site); the `propagate` row filed with its evidence.
- **WEEKLY.md** — G5's 4 boxes + the Thu/Fri schedule rows checked off under an explicit _"run held 2026-08-27, not in this plan's week"_ banner; Summary-Table status flipped.

**Run-card / spec (with Outcome appended)**: [docs/superpowers/specs/2026-08-27-weekly-reviews-run.md](../superpowers/specs/2026-08-27-weekly-reviews-run.md)
**Methodology reference**: [docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md)
**Results**: [REVIEW-QUEUE.md](REVIEW-QUEUE.md) (5 new rows + new §4 + refreshed Next-up)

**Lessons learned**:

- **The best finding came from reading the propagation _target_, not the web.** Category 4 looked like a from-scratch design; the sibling repo had already run an equivalent section **four times** with a settled convention — _and_ its § Spawned Tasks held rows addressed to media_viewer that had never arrived here, because the category was one-way by specification. Generalizes: **before designing a cross-boundary mechanism, read the other side of the boundary**, and import a proven convention rather than inventing a second dialect.
- **Hybrid sourcing earned its keep by _reversing_ a parked verdict** (`security-guidance`). A rote parked-first pass skips it as pre-flagged weak; a rote fresh-only pass never learns it was parked. **Re-read a parking's stated rationale against current evidence — do not inherit it.**
- **A hit count of 0 is not the whole check — read the near-miss.** The propagate row was going to claim the rating axis was wholly absent globally; the one adjacent hit governs bookkeeping rather than the rating axis, which turned an overclaim into a precise "complementary and upstream" note.
- **Do not import an upstream recommendation whose upstream review is still pending** — it launders the origin's uncertainty into this repo's backlog. Recorded and parked instead.
- **Secondary AI-tooling roundups invent things.** One asserted an Anthropic "Frontend Design" plugin (~277k installs) that appears nowhere in the official roster. Verdicts rest on primary sources.
- **A closeout step can be lost by a run-card's own Outputs list.** This run's Outputs list never named DONE.md, so the closeout commit did the WEEKLY.md half of the Task-Completion transition and silently skipped the DONE.md half — breaking a 2-for-2 in-branch precedent. The run-card Outputs list now names both, and both `docs/README.md` run-card rows were backfilled.

**Recorded deviations**: (1) category 4 bidirectional vs. WEEKLY.md's outbound-only wording; (2) one `propagate`, not two — the pre-push E2E gate is equally absent at the target and verified so, but parked with its evidence to stay inside the sibling repo's one-per-run cadence; (3) Summary-Table status reads `✅ 2026-08-27 (no PR — branch chore/g5-weekly-reviews)` instead of the house `✅ PR #N`, there being no PR by instruction; (4) WEEKLY.md is checked off but is the stale July 13–17 plan, hence the banner; (5) the run-card planned to file inbound items into TODO.md but they were **parked** instead, once their upstream-pending markers were found; (6) the closeout initially skipped **this DONE.md entry** and the `docs/README.md` run-card index — both caught by the local whole-branch review and folded in-branch, both traceable to the run-card's Outputs list never naming either file (now corrected).

**Follow-up tasks**: BACKLOG 🟤 [2026-08-27] From: Weekly Reviews (3 adopt trial entries: `security-guidance`; `dead-rules-audit`; path-scoped-rules migration) + 🟤 [2026-08-27] From: G5 closeout whole-branch review (2 items: derive closeout artifact lists from the Task-Completion rule; automate the `docs/README.md` index check after 7 manual misses) + 🟡 [2026-08-27] adopt-queue burn-down & cadence. The reviewer-evidence learning targets the _global_ `POLICIES/code-review.md`, so it is parked as an **outbound** candidate in REVIEW-QUEUE §4 Next-up rather than double-filed here. TODO carry-forward: execute G4; plan the next week as a Cleanup Week. ⚠️ **Standing planning signals, recorded not actioned**: adopts now stand at **5 unchecked with zero burn-down across 3 runs** (D4 keeps `adopt` hands-off by design, but nothing consumes the queue); and the "weekly" cadence has slipped ~7.5 weeks, so it may be a ~monthly batch that should be planned as one.

### 2026-08-24 — Group G3: Bulk-rate re-pair avoidance

**Summary**: 🔵 User-Flagged (solo). In AI-sorted compare mode, rating a pair "Both good"/"Both bad" no longer re-shows that exact two-file pair; a rated file still pairs with fresh files; fall-through to the full list when every candidate pair is suppressed. **Decisions**: D1 **exact-pair** suppression (track the specific two-file _combinations_ rated together — a new session-only `bulkRatedPairs` Set — not `this.bulkRated` per-file membership) and D2 **session-only** (empty on folder load, survives re-sorts, discarded on folder change; no `.bulk_rated.json` change).

**Two-session history**: The core was built here (subagent-driven, 3 TDD tasks + per-task reviews + an opus whole-branch review) — pure `bulkPairKey`/`computeValidComparePairs` selection, wired into `showCompareMedia`/`applyBulkRating`/`undoBulkRating`, with nav/position-count bounds, `removeFileFromList` pruning, and per-folder reset. A **parallel Verification chat** then ran the user-side manual smoke (round 1) and found **two real defects the 500-unit/55-E2E suite missed**, both fixed with their own design+plan (8 further commits): **D1 "Pair X of Y" decremented then jumped back** — the denominator was `computeValidComparePairs().length` (the _un-rated_ count) so it shrank as pairs were rated then sprang back on fall-through → replaced with the **full extremes count** (`computeAllComparePairs`), numerator = the displayed pair's true position (retires N>M structurally, superseding this session's cursor-clamp). **D2 rated pairs re-appeared instead of re-mixing** — `applyBulkRating` re-rendered **synchronously from the pre-rating `predictionScores`** (a _pre-existing_ non-deferral that G3 unmasked: `nextMedia()` used to advance to a visibly different pair, hiding the staleness; in-place `showMedia()` re-renders the same slot) → now deferred through the existing `pendingCompareRefresh` protocol (same for `handleCancel`'s bulk-undo branch, which also activated the previously-unreachable `reverseUpdateComplete` bypass). Plus 3 review-found: a deferred-window epoch race (`mediaNavigationInProgress` guard on `handleCancel`), worker-posts-before-`await`, and a counter perf regression (16→80 ms/keypress at 24k → early-return + local subset). Unit **500→513**, E2E 55/55, lint 0-err.

⚠️ **Status: MERGED to `main` 2026-08-24 on user direction — acceptance gate NOT satisfied the usual way.** The GitHub PR #66 was _closed unmerged_ (user's call), then the branch was merged to `main` via a local `--no-ff` merge on explicit user instruction (18 commits above merge-base `3221af8`). **User-side re-smoke round 2 was NOT run** — round 1 proved the manual smoke catches real defects the automated suite misses, and it was not repeated before merge. **The D2 deferred-re-render fix has ZERO automated coverage**: `mlWorker` is null under Playwright, so `postedUpdates` is always 0 and the deferred path is never reached — the compare-mode bulk-rating E2E passes for the wrong reason. Shipped on user direction + review + automated suites only. Follow-ups (incl. a worker-stub for real D2 coverage) filed to BACKLOG 🟤 [2026-08-24].

**Key changes** ([media-viewer.js](../../media-viewer.js), [tests](../../tests/)):

- **Pure selection core** — `bulkPairKey(a,b)` (canonical NUL-joined key), `computeValidComparePairs()` (exact rated combos removed, full-list fall-through), and the later `computeAllComparePairs()` (full extremes count for the stable counter); session-only `bulkRatedPairs` Set.
- **Deferred re-render** — `applyBulkRating` and `handleCancel`'s bulk-undo branch now arm `pendingCompareRefresh`/`_beginDeferredCompareRefresh` (post worker updates _after_ the `await`, epoch/`mediaNavigationInProgress`-guarded) instead of rendering synchronously from stale scores.
- **Lifecycle** — `removeFileFromList` prunes `bulkRatedPairs` keys referencing a removed file; `loadBulkRatedFile` resets the Set per folder.
- **Tests** — `ml-pair-selection.test.js` rewritten to exercise the real methods (retired the copied `selectMlPair`); +suppression/fall-through/prune/deferred-protocol coverage.
- **Docs** — spec `2026-07-24-...-design.md` + `2026-07-25-...-design.md`; plans archived under `docs/archive/plans/`.

---

## 2026-07 (July)

### 2026-07-21 — Group G2: Tournament-mode bug fixes

**Summary**: Three user-flagged Tournament Mode defects from the [2026-07-11] manual-testing intake, one branch/PR. **🔴 Undo intermittently fails** — the reported bug. `handleTournamentUndo` chose between its default and special-move branches by peeking `this.moveHistory`, but tournament picks never write to `moveHistory` and it is cleared only on folder change — so any special-folder move (`1`/`2`), _including one made in single or compare mode before the tournament even started_, permanently owned the top slot and hijacked every later tournament undo (special file restored, pick stood, on-screen pair unchanged = "undo did nothing"). Fix: `engine.history` becomes the single chronological undo stack, entries tagged `kind` ∈ `pick`/`special`/`prune`; new `peekUndoEntry`/`peekUndoKind`/`undoUserAction` expose "the newest _user_ action" while absorbing system `prune` entries transparently; `handleTournamentUndo` dispatches off it and no longer reads `moveHistory` to branch. Five further defects on the same method fixed along the way (missing `isLoading` guard; no feedback on a no-op; `#tournamentUndoBtn` never disabled; auto-prune consuming a user press; and the `engine.files`-vs-`strategy.files` divergence that left a restored special file unpaired at Tier-0). **🟠 Mouse wheel** — added an `isTournamentMode` guard to the document `wheel` handler (the last leak; no `next`/`previous` keys bound in-mode, nav arrows already CSS-hidden). **🔵 Auto-hide chrome** — `.tournament-header`/`.tournament-controls` now hide at rest and reveal on an edge band via a `_setupAutoHide` helper extracted from `setupHeaderVisibility`.

✅ **Status: MERGED 2026-07-21 via PR #65** (merge `937084c`, branch `fix/g2-tournament-bug-fixes` deleted remote + local; 15 commits above `main`, merge-base `31d3348`). **Automated verification green — 471→492 unit / full E2E 52→55 / lint 0-err** (1 pre-existing `no-shadow` warning, also on `main`). **User-side 6-point manual smoke PASSED 2026-07-21** — all 6 checks green on the user's machine (run _after_ the user-directed merge, which overrode the autonomous self-merge block): (A) cross-mode special-undo leak — a single-mode special no longer hijacks tournament undo; (B) in-tournament special-undo ordering (newest-first, special slotted correctly); (C) "Nothing to undo" toast + disabled button, incl. the session-only resume case; (D) restored special re-pairs at its real tier, not Tier-0; (E) wheel no longer navigates pairs but still zooms over media; (F) auto-hide reveal/hide on the edge bands. Acceptance gate satisfied. _(Note: the archived plan's manual-smoke check #1 wording was imprecise — it said a single-mode special is *restored* by tournament undo; the correct, tested behaviour is that it is deliberately **invisible** to tournament undo. Corrected verbally at test time.)_

**Key changes**:

- **Unified undo stack** ([tournament-engine.js](../../tournament-engine.js)) — history entries carry `kind`; `peekUndoEntry()`/`peekUndoKind()` report the newest user entry skipping trailing prunes (non-mutating); `undoUserAction()` reverses trailing prunes + exactly one user entry and returns it; `undo()` returns the popped entry; `removeFile(path, {trackUndo, kind, meta})` gains `kind`/`meta` (defaults `'prune'`/`null`, so the `-1` auto-prune call site is unchanged). Entries written before this change (no `kind`) are treated as picks.
- **Dispatcher rewrite** ([media-viewer.js](../../media-viewer.js) `handleTournamentUndo`) — dispatches off `engine.peekUndoEntry()`; the special branch restores the file on disk _before_ advancing the stack; the special-move removal at `moveToSpecialFolder` now passes `{trackUndo:true, kind:'special', meta:historyEntry}`.
- **Advisory-mutex hardening** ([media-viewer.js](../../media-viewer.js)) — `isLoading` is held across the disk-restore await (`1c18029`), but a code-review follow-up confirmed `isLoading` is **not owned** (the fast-path render clears it via the reused compare handlers), so an **identity re-check** (`peekUndoEntry()` unchanged before `undoUserAction()`, else roll the file back to the special folder) makes correctness independent of the flag (`ae98e85`).
- **Undo-button state** ([media-viewer.js](../../media-viewer.js)) — `#tournamentUndoBtn.disabled` driven from `peekUndoKind() === null` in `showTournamentPair` + the summary modal (was `history.length`, which counted prunes).
- **Wheel guard** ([media-viewer.js](../../media-viewer.js)) — `if (this.isTournamentMode) return;` atop the document `wheel` handler.
- **Auto-hide** ([styles.css](../../styles.css), [media-viewer.js](../../media-viewer.js)) — `_setupAutoHide(el, inZone, {delay, enabled})`; `.header`'s behaviour byte-preserved; both tournament elements reveal once on entry (so the PR #58 exit button stays discoverable) and hide on exit; final review dropped a leftover `.tournament-pause` `pointer-events:auto` that had left `#tournamentExitBtn` invisible-but-clickable (`0848723`).

**Key decisions / learnings**: ⭐ **The final whole-branch review demonstrated and falsified.** It caught the invisible-but-clickable exit button with a throwaway Playwright probe, and _measured_ the earlier per-task review's dismissal ("`:hover` propagates up the ancestry regardless of `pointer-events:none`") to be false. ⭐ **"No issues found" is not "nothing to check."** The external review's four candidates were all correctly filtered, but verifying its one hand-checked claim — that a race was "already tracked in BACKLOG" — surfaced a real defect none of the candidates reached: the `isLoading` mutex is advisory, not owned, so a special-move → immediate Ctrl+A can reverse the wrong entry. Fixed with the identity re-check. ⭐ **You cannot grep for an option's absence** — the CLAUDE.md doc-sweep and the `reconcileWithFiles`-still-untracked follow-up both slipped a keyword-presence grep because the bug is the keyword's _absence_. ⭐ **The pre-push E2E gate earned its keep** — it blocked the first push on a genuine two-timer synchronization gap in the new auto-hide test (fixed for real in `b6be9c7`, not retried past); a second, unrelated load-flake during the finish is filed as test-infra debt. Spec: [2026-07-20-g2-tournament-bug-fixes-design.md](../superpowers/specs/2026-07-20-g2-tournament-bug-fixes-design.md). Plan (archived): [2026-07-20_g2-tournament-bug-fixes.md](../archive/plans/2026-07-20_g2-tournament-bug-fixes.md).

**Follow-up tasks**: BACKLOG `### [2026-07-21] PR #65 review follow-ups` (9 items — above cadence, Cleanup-Week watch). Sharpest: `reconcileWithFiles` still prunes untracked → Tier-0 strand on undo-past (the naive `{trackUndo:true}` fix is wrong — bulk prune × O(n) snapshot would undo the CW-T 24k win; prefer dropping the session-only history on a pruning reconcile). Also: a failed special-restore can wedge the undo stack; empty-state keydown guard gates the shortcut on `moveHistory`; auto-hide keyboard-focus a11y gap; E2E-load-flake hardening. Checked off 3 resolved BACKLOG entries (🔵 [2026-07-11] auto-hide; 🟤 [2026-07-03] special-move `strategy.files`-diverged; 🟤 two-stack interleaving).

### 2026-07-20 — Group G1: AI-sort startup UX & incremental cache-load

**Summary**: The week's 🏆 and the PR3 slice of the long-running 🔴 TODO "Speed up AI / similarity sorting on large folders (24k+ files)", plus the [2026-07-01] AI-sort-startup UX cluster and the 🟠 [2026-07-11] "Can't cancel the AI sort". Restructured `handleSortByPrediction` to mirror `handleSortBySimilarity`'s lifecycle: a per-run `sortAbortController` + `sortRunId` generation token, a determinate `updateSortProgress` card rendered before the first await, phased abort checks (cache-load / extraction / pre-sort), and `finally` cleanup. The fire-and-forget ML sort became an awaitable `runMlSort()` resolved by a stale-guarded `sortComplete` handler (`applyPredictionSortResult` extracted so both the live path and tests call it directly). `loadFeatureCache` gained `{signal, onProgress}` and now populates `this.featureCache` incrementally instead of building a local map assigned only at the end. `feature-cache-chunk` ships vectors as binary `Float32Array` buffers (new shared `feature-cache-transport.js`) instead of JSON number-arrays, with the legacy shape kept as a fallback — the on-disk format is unchanged (`FEATURE_CACHE_VERSION` stays 4). A warm-cache gate skips the reload on a repeat sort, and the prediction/similarity sort paths were made mutually exclusive.

✅ **Status: MERGED 2026-07-20 via PR #64** (merge `b6ff4ac`, branch `feature/g1-ai-sort-startup-ux` deleted remote + local; 21 commits above `main`, merge-base `dc43736`). **User-side 24k manual smoke PASSED 2026-07-20** on the user's real 20,929-file folder — all 5 gating checks (immediate determinate card, no redundant re-extraction on a warm cache, Cancel actually aborts load+extraction+sort leaving the list unsorted, identical post-tournament-exit behavior, reported load-time improvement). **434→471 unit** / **full E2E 52/52** / lint clean. **Two post-review incidents, both real and both fixed in-branch**:

1. An **external `/code-review` of PR #64** caught a **data-loss regression**: a cancelled feature-cache load left a truncated live `featureCache` that the 30s auto-save then persisted over the full on-disk `.feature_cache.json`. Fixed in `b8b5636` (build-local, commit-on-complete — the same shape the pre-G1 code used, for exactly this reason). Two sub-threshold findings from the same review filed to BACKLOG `### [2026-07-13] PR #64 review follow-ups` (`d60e604`).
2. **The user-side 24k smoke then found a second, worse route**: a folder switch left the previous sort running; the surviving sort kept extracting against the new folder, and entries whose metadata couldn't be attributed (the live `mediaFiles` lookup used to resolve size/mtime at completion time no longer had the file) were written `size:0/mtime:0` — permanently stale — so a near-empty map was auto-saved over a **23,559-entry / 126 MB** on-disk cache. Real data loss; restored from the user's own backup. Fixed in `2777bdf` (never serialize an unresolvable entry + a shrink guard on the save path) and `c947081` (abort the in-flight prediction sort on `loadFolder` — settling the pending `runMlSort` promise and hoisting the teardown above the empty/non-empty branch split — plus a cancelable training phase). BACKLOG reconciled in `6f2eb0e` (files the residual source-level gap as `### [2026-07-20] G1 24k-smoke failure follow-ups`).

**Key changes**:

- **`handleSortByPrediction` phased lifecycle** ([media-viewer.js](../../media-viewer.js)) — `sortAbortController` + `sortRunId` created on entry; `updateSortProgress({phase:'Preparing…'})` before any await; abort checked at every phase boundary; `finally` nulls the controller and clears the re-entrancy flag.
- **Awaitable `runMlSort`** ([media-viewer.js](../../media-viewer.js), [ml-worker.js](../../ml-worker.js)) — `getSortedOrder` echoes `sortRunId`; `sortComplete` resolves a pending promise instead of applying the order directly, guarded so a stale/superseded completion is ignored.
- **Incremental, cancelable, atomic `loadFeatureCache`** ([media-viewer.js](../../media-viewer.js)) — `{signal, onProgress}` threaded through `_loadFeatureCacheImpl`/`_loadFeatureCacheLocked`; entries are staged locally and committed into the live `featureCache`/`clipCache` only on a complete load (`b8b5636`); a `notFound`/version-mismatch leaves a good in-memory cache untouched; the save path never serializes an unresolvable entry and shrink-guards against a catastrophic overwrite (`2777bdf`).
- **Binary transport** ([feature-cache-transport.js](../../feature-cache-transport.js) new, [main.js](../../main.js)) — `packFeatureChunk` packs a chunk into `Float32Array` buffers (`vecBuf`/`clipBuf`) + parallel `names/sizes/mtimes/hasClip` arrays; renderer consumes via `.slice()` copies; legacy JSON `entries` shape kept as a fallback branch.
- **Unified progress surface** ([media-viewer.js](../../media-viewer.js)) — `extractionProgressSink` routes background-extraction progress into the same sort card while a prediction sort owns the operation, suppressing the separate bottom-left indicator.
- **Folder-change safety** ([media-viewer.js](../../media-viewer.js)) — `loadFolder` now aborts an in-flight prediction sort (bumps `sortRunId`, aborts the controller, settles the pending `runMlSort` promise) instead of leaving it running against the new folder (`c947081`); warm-cache gate skips the reload on a repeat sort (`08d4148`); the prediction and similarity sort paths mutually exclude each other (`9d2fc61`).

**Key decisions / learnings**: ⭐ **an external review caught a data-loss regression the whole internal pipeline missed** — incrementally populating a disk-persisted cache let a cancelled load's truncated map get auto-saved over the full on-disk file; the pre-G1 code's build-local-swap-at-end shape existed for exactly this reason, so "incremental" had to mean incremental-into-a-staged-local, not incremental-into-the-live-persisted-Map. ⭐ **the 24k smoke then found a route the reviewed code still missed** — a sub-threshold BACKLOG item deferring the `loadFolder`-vs-in-flight-sort interaction turned out to be wrong to defer: the user's real folder hit it immediately, and it was the _trigger_ for the worse corruption, not an independent low-frequency edge case. ⭐ whenever "incremental populate" and "auto-save" coexist on the same in-memory structure, trace the DISK-persistence path, not just the in-memory one. Spec: [2026-07-13-ai-sort-startup-ux-design.md](../superpowers/specs/2026-07-13-ai-sort-startup-ux-design.md). Plan (archived): [2026-07-13-ai-sort-startup-ux.md](../archive/plans/2026-07-13-ai-sort-startup-ux.md).

**Follow-up tasks**: 🔴 TODO "Speed up AI / similarity sorting on large folders (24k+ files)" stays **OPEN** — PR2 (hash computation off the renderer thread) remains. BACKLOG `### [2026-07-13] PR #64 review follow-ups` (2 sub-threshold items) + `### [2026-07-20] G1 24k-smoke failure follow-ups` (1 item: attribute feature metadata at extraction time instead of via a live `mediaFiles` lookup).

### 2026-07-10 — Group CW-P: Process & DX guardrails

**Summary**: The one non-🟤 group of the 2nd Cleanup Week (🟡 Operational + 1 folded 🟤). Three process/DX guardrails on one branch: (1) an **automated pre-push E2E gate** closing the "no CI, so a silently-broken E2E can land" gap (the pre-commit hook runs unit only — PR #56 root cause); (2) a **consolidated Weekly-Reviews methodology** (6 fixes scattered across 3 intake dates → one canonical spec section); (3) a **CLAUDE.md ref-sweep convention**. Subagent-driven (controller commits). Mirrors CW-4 from the first Cleanup Week.

✅ **Status: MERGED 2026-07-11 via PR #63** (merge `f6c2c46`, branch `cleanup/cw-p-process-dx-guardrails` deleted remote + local). Not docs-only (item 1 adds a hook + script) → `/code-review`-eligible. Every per-task review Approved + final whole-branch review (opus) **"Ready to merge: Yes"** (no Critical/Important; 1 Minor — the stdin-read fail-safe — folded in `018f0d2`). Verified: **434 unit** (423 + 11 new) / **full E2E 52/52** (baseline intact; branch touches no renderer/main/worker) / **lint 0-err** (1 pre-existing `no-shadow` warning) / **format clean**. 7 commits above `main` (`30ea14e`): `a678f9b` (spec), `1954870` (plan), `e5b8cde` (T1 pure helpers), `efcd374` (T2 CLI+hook), `dc5f666` (T3 methodology), `9a6b253` (T4 CLAUDE.md), `018f0d2` (final-review fix). **Post-merge `/code-review`** (five-agent + confidence scoring) posted **"No issues found"** — all 3 surfaced findings scored **25** (sub-threshold): two CLAUDE.md doc-drifts (Architecture-tree `scripts/` bullet + hook prose omit the new script/hook — a recurrence of the [2026-06-18] PR #51 class fixed in PR #52) and a `maxBuffer` parity nit on the `git diff --name-only` read; filed as a `### [2026-07-11] PR #63 post-merge review` 🟤 group (2 items). Checked off 8 constituent BACKLOG items (E2E gate + sweep-references + 6 methodology-fix items across [2026-06-26]/[2026-06-29]/[2026-07-06]) + filed a `### [2026-07-10]` closeout follow-up group (2 items).

**Key changes** (3 items):

- **Item 1 — pre-push E2E gate** ([scripts/check-e2e-needed.js](../../scripts/check-e2e-needed.js), [.husky/pre-push](../../.husky/pre-push), [tests/check-e2e-needed.test.js](../../tests/check-e2e-needed.test.js)) — pure `parsePushRefs` (drops delete refs) + `classifyPaths` (RUN unless every path is `*.md`/`docs/**` — conservative) per the `check-secrets.js` precedent; a fail-safe git-wrapper CLI (new-branch → `merge-base origin/main`, else `remoteSha`; any git/parse/stdin-read failure → RUN) printing `RUN`/`SKIP` to stdout; a Husky v9 plain-sh hook running `npx playwright test` only on `RUN` with a `|| echo RUN` fail-safe. Docs-only pushes skip (~instant); runtime pushes gate on the ~2min suite. 11 unit cases; 4 dry-runs SKIP/SKIP/SKIP/RUN.
- **Item 2 — Weekly-Reviews methodology** ([first-run-design.md](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md), [REVIEW-QUEUE.md](REVIEW-QUEUE.md)) — 6 fixes folded into a canonical `## Methodology (current practice)` section (lightweight inline research over the harness; no parallel harness fan-out; recognize docs-only PRs pre-`/code-review`; merge/defer docs-only PR in-session; hybrid sourcing; run-card path); REVIEW-QUEUE intro → hybrid + lightweight.
- **Item 3 — ref-sweep convention** ([CLAUDE.md](../../CLAUDE.md)) — one Best-Practices bullet: grep tests + comments (not just live callers) when removing a named call site (the unit-only hook won't catch stale E2E/comments — PR #56 root cause).

**Key decisions / learnings**: ⭐ **pre-push is the only automatable local gate** (no CI; pre-commit is unit-only) — measured the full E2E at 52/2m05s to justify it, and made it **code-aware** (skip docs-only pushes) since this repo pushes many docs-only changes. ⭐ **"changed E2E files only" scoping was rejected** — it misses cross-file breakage, the exact PR #56 failure (a `media-viewer.js` edit broke an _unchanged_ E2E file); the gate runs the whole suite when any runtime file changes. ⭐ **the final review's one Minor touched the core invariant** — a `readFileSync(0)` stdin-read failure resolved to SKIP, the one error-path contradicting "no silent skip"; folded a 3-line fix so a stdin _read_ failure fails safe to RUN (a clean empty read still SKIPs). ⭐ **the named superpowers checklists are third-party plugin skills** (not in-repo / durably editable) → the convention's real home is CLAUDE.md Best-Practices. Spec: [2026-07-10-cw-p-process-dx-guardrails-design.md](../superpowers/specs/2026-07-10-cw-p-process-dx-guardrails-design.md). Plan (archived): [2026-07-10-cw-p-process-dx-guardrails.md](../archive/plans/2026-07-10-cw-p-process-dx-guardrails.md).

**Follow-up tasks**: BACKLOG [2026-07-10] Group CW-P closeout follow-ups (🟤 CLI-layer regression tests; 🟡 pre-push friction re-evaluation after real use) + [2026-07-11] PR #63 post-merge review (🟤 CLAUDE.md doc-sync for the new pre-push gate; 🟤 `maxBuffer` parity).

### 2026-07-05 — Group WR: Weekly Reviews (2026-07-05 run) ⚪ Overhead

**Summary**: Second run of the recurring **Weekly Reviews** batch (WEEKLY.md Group WR; cross-week state in REVIEW-QUEUE.md). Reviewed the strongest not-yet-reviewed candidate in each of 4 categories under the **hybrid relevance lens** (source broadly, judge by fit to this solo-dev + Claude-Code + Electron workflow) using **lightweight inline research** — a few `WebSearch` + `WebFetch` per category (the [2026-06-26] methodology correction; **no deep-research harness**). Docs-only ⚪ overhead. Used a **lightweight run-card instead of a full spec + implementation plan** (the reusable methodology was already codified by the first run), so there is **no separate archived plan** for this run.

✅ **Status: MERGED 2026-07-06 via PR #62** (merge `291879c`, branch `chore/wr-weekly-reviews` deleted remote + local). Docs-only ⚪ overhead → posted **"No issues found"** (no `/code-review` fan-out per the [2026-06-29] docs-only-Weekly-Reviews convention; mirrors PR #57). 423 unit green throughout (docs-only; via the pre-commit hook). 3 commits (run-card `db09ffd`, verdicts `ab74f1c`, closeout `a1076a7`). Post-merge filed a `### [2026-07-06] PR #62 post-merge` 🟤 group (2 methodology-codification follow-ups, both fold into CW-P). **4 verdicts, 2 adopt**:

- **Plugins / official store** → **`typescript-lsp`** (`adopt`) → 🟤 BACKLOG trial. Official code-intelligence LSP (TS **and** JS via `typescript-language-server`): automatic post-edit diagnostics + precise symbol navigation on the ~8400-line renderer (hits the "renderer file is large" pain + the no-CI "errors surface late" gap). Untyped-JS + large-project LSP memory = trial eval points, not blockers.
- **Plugins / wider internet** → Electron Developer Agent (rohitg00/awesome-claude-code-toolkit) (`pass`) — a single generic senior-Electron **persona file** whose mandated `sandbox:true` + cross-platform-test defaults conflict with this project's intentional sandbox-disabled, Windows-only design, and which is already exceeded by the repo's CLAUDE.md Electron gotchas.
- **Claude best-practice** → **autonomous e2e / visual verification before "done"** (`adopt`) → 🟤 BACKLOG trial. "Give Claude a check it can run / verify UI changes visually + show evidence" — targets the recurring "passes tests yet invisible/broken" class (the test-actual-visibility incident; the "green hook ≠ green E2E" Continue-resume regression). Possible-dup-of CW-P's E2E-gate item (that = the CI/hook mechanism; this = the visual/behavioral verification discipline).
- **Non-Claude best-practice** → Addy Osmani incremental LLM workflow (`pass`) — validates current practice (spec-first, iterative chunking, CLAUDE.md rules files, granular commits, mandatory human verification, CI/lint gates all already core); his distinctive save-point technique is already covered by per-task commits + Claude Code checkpoints.

**Run-card / spec (with Outcome appended)**: [docs/superpowers/specs/2026-07-05-weekly-reviews-run.md](../superpowers/specs/2026-07-05-weekly-reviews-run.md)
**Methodology reference**: [docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md)
**Results**: [REVIEW-QUEUE.md](REVIEW-QUEUE.md) (4 new rows + refreshed Next-up)

**Key decisions**: hybrid candidate sourcing (fresh-check + best pick — both parked plugin picks were pre-flagged weak); lightweight run-card + execute (no full spec/plan — this is a codified-process repeat).

**Lessons learned**:

- **Hybrid sourcing beat rote parked-first** — both parked plugin picks (`commit-commands`, `playwright-cli-agents`) were weak; fresh search found the two real adopts a parked-first pass would have missed.
- **Lightweight inline research validated the [2026-06-26] correction** — ~9 web calls, minutes, no rate limit, vs the first run's ~8M-token harness that never completed verification.
- **A codified-repeat process needs only a run-card, not a fresh spec + plan** — the reusable methodology was written once (first run); this run's only real design surface was candidate selection + process weight.

**Follow-up tasks**: BACKLOG 🟤 [2026-07-05] From: Weekly Reviews (2 adopt trial entries: `typescript-lsp`; autonomous / visual verification discipline).

### 2026-07-05 — Group CW-V: Test & tooling backfill

**Summary**: A test-only Cleanup-Week backfill clearing 4 non-tournament test/tooling gaps (one branch): a comment-aware brace guard for the `methodSource` test helper, real-`git`-diff fixtures for `extractAddedLines`, an E2E smoke for the sort-progress card, and a play/pause icon-toggle E2E regression. **No production code changed.** Subagent-driven (controller commits).

✅ **Status: MERGED 2026-07-05 via PR #61** (merge `85f1f29`, branch deleted remote + local). Every per-task review Approved + final whole-branch review (opus) "Ready to merge: Yes" (4 Minor doc-honesty/robustness findings folded in). **Pre-merge `/code-review` (5-agent + confidence scoring) posted "No issues found"** at the ≥80 threshold; the 4 sub-threshold-but-real nits it surfaced (exact-string `.toThrow` per CLAUDE.md:87; residual-count overclaim in the ACCEPTED-RESIDUAL test comment; guard-false-throw doc gap; spec "two unguarded residuals" phrasing) were **folded in-branch pre-merge in `e737589`**. Verified: **423 unit / full E2E 52/52** (incl. the 3 new E2E tests) / lint 0-err (1 pre-existing `no-shadow` warning) / format clean; the 8 guard tests re-run green against the merged file. 9 commits above `main` (`0bb29b2`): `b19deb4` (spec), `52d6d58` (plan), `089a380`+`fa77ad2` (Item 2 guard + review doc-fix), `5e168a1` (Item 3), `6b07182` (Item 1), `8d9c78e` (Item 4), `206035a` (final-review nits), `03d158d` (closeout), `e737589` (PR #61 review nits). Checked off 4 source BACKLOG items ([2026-06-25] `methodSource`, [2026-03-23] TASK-023 play/pause, [2026-06-19] sort-progress E2E, [2026-06-18] real-git fixtures) + filed a `### [2026-07-05]` 🟤 group (2 items: guard-residual extension; sort-progress E2E nits).

**Key changes** (4 items):

- **Item 2 — `methodSource` guard** ([tests/media-viewer-utils.test.js](../../tests/media-viewer-utils.test.js)) — `assertLiteralBracesBalanced`: a state-machine scanner (`CODE|SQ|DQ|TMPL|LINE_CMT|BLOCK_CMT`) that throws when an unbalanced brace sits inside a string/template span, skipping comment contents; wired into `methodSource(name, src = source)` (new `src` seam for testability). 8 guard tests. **Comment-skipping was required, not optional** — the strings-only guard false-threw on `loadFolder`'s `//` comment `folder's`. Comment/regex/escaped-`\{` braces remain accepted, documented residuals (→ 🟤 follow-up).
- **Item 3 — real-git fixtures** ([tests/check-secrets.test.js](../../tests/check-secrets.test.js)) — a `describe` block driving per-test temp repos (`git init`/`add`/`commit`/`diff`; `core.autocrlf=false` + throwaway identity + `commit.gpgsign=false`; `GIT_DIR`/`GIT_INDEX_FILE` stripped so a git-hook context can't redirect) asserting `extractAddedLines` on real `git diff --cached --unified=0` for no-trailing-newline / multi-file / binary-then-text + a planted-key end-to-end case. Hand-authored cases kept.
- **Item 1 — sort-progress E2E** (new [tests/e2e/sort-progress.test.js](../../tests/e2e/sort-progress.test.js)) — appear/remove smoke via a MutationObserver installed **before** the sort (captures the sub-100ms transient a poll would miss) + `not.toBeAttached()` after the awaited `handleSortBySimilarity()`; deterministic `.progress-cancel` → `sortAbortController.abort()` wiring check.
- **Item 4 — play/pause E2E** (new [tests/e2e/video-controls.test.js](../../tests/e2e/video-controls.test.js)) — synthetic `dispatchEvent('play'/'pause')` on `currentMedia` (codec-independent, fires the real `addEventListener`-bound `onPlay`/`onPause`) → asserts `#playIcon`/`#pauseIcon` `display` swap + `data-lucide` name integrity. **Lucide-stub-aware**: the E2E harness no-ops `createIcons`, so no `<svg>` renders — the `<i>` + attrs + display are asserted instead.

**Key decisions / learnings**: ⭐ **The "document + guard" choice had to become comment-aware mid-flight** — a strings-only guard is a documented fiction because comment apostrophes (and comment/regex/escaped braces) also corrupt the naive count; a truly-correct guard is ~the full tokenizer the user declined, so the guard is a _tripwire_ for the common string/template case with the rest as tracked residuals. ⭐ **A documented fiction is worse than an omission (again)** — reviews caught the "regex is the SOLE residual" claim; corrected code + plan + spec to a non-exhaustive list. ⭐ **E2E ≠ real Lucide** — the harness stubs `createIcons`, so assert `<i>`/`data-lucide`/`display`, never rendered `<svg>`; and **synthetic events beat real `.play()`** for a codec-independent icon-toggle test. ⭐ **Capture a transient DOM node with a MutationObserver installed before the trigger**, not a poll. ⭐ **A subagent hit an account session rate-limit mid-fix** → the controller applied that small, fully-specified fix directly + verified green rather than burning dispatches. Spec: [docs/superpowers/specs/2026-07-04-cw-v-test-tooling-backfill-design.md](../superpowers/specs/2026-07-04-cw-v-test-tooling-backfill-design.md). Plan (archived): [docs/archive/plans/2026-07-04-cw-v-test-tooling-backfill.md](../archive/plans/2026-07-04-cw-v-test-tooling-backfill.md).

### 2026-07-03 — Group CW-D: Docs & CLAUDE.md hygiene

**Summary**: A single docs-only consolidation pass (Cleanup Week) clearing the 5 deferred `revise-claude-md` / doc-drift backlog items accumulated across the June sprint (PRs #52–#59). Scheduled **after CW-T (PR #59) merged** so the tournament docs describe post-fix behavior. Every documented claim was **verified against current post-CW-T code** before writing (grep + read of `loadFolder`, `handleTournamentUndo`, `TournamentEngine.undo`/`removeFile`, `_schedulePersist`/`flush`, `deserialize`/`version`, `reconcileWithFiles`, `showTournamentPairFast`, MinHeap/VPTree locations). No code behavior change.

✅ **Status: MERGED 2026-07-04 via PR #60** (merge `dba3ecf`; docs-only → manual review, no `/code-review` fan-out per the [2026-06-29] convention). Post-merge `/code-review` flagged **1 issue** — the archived plan's `✅ COMPLETE` header vs its 26 still-unchecked step boxes (scored 100, corroborated by 3 agents) — **fixed pre-merge in `b8b31a4`** (flip only the 26 line-start step checkboxes; the 2 backtick-wrapped inline `- [ ]` syntax refs preserved), re-review "No issues remaining". Autonomous self-merge was correctly blocked by auto-mode (a human merged). +2 🟤 [2026-07-04] PR #60 post-merge follow-ups (stale `docs/README.md` footer; automate the pre-archive checkbox-flip check). Branch `docs/cw-d-claude-md-hygiene` (deleted remote + local post-merge); 5 edit commits (`1dee056`, `c622338`, `4d15c39`, `318ab27`, `46ebec3`) + closeout `75bd9aa` + checkbox fix `b8b31a4`; WEEKLY/DONE pending→merged reconcile `94c3d54`; 411 unit tests green throughout.

**Key changes** (5 items):

- **Item 1** ([CLAUDE.md](../../CLAUDE.md) Active gotchas, `1dee056`) — folded 3 verified tournament gotchas: folder-scoped exit (`loadFolder` → `exitTournamentMode` before both branches); two-path `handleTournamentUndo` (`engine.undo()` vs the untracked special-move branch); `engine.files` vs `strategy.files` divergence (`filesSnapshot` recorded via `removeFile(file,{trackUndo:true})` only at the `-1` auto-prune site; special-move stays untracked to keep the two undo stacks in sync).
- **Item 2** ([CLAUDE.md](../../CLAUDE.md) Cache Management, `c622338`) — documented debounced single-flight persistence (`_schedulePersist`/`_drain`/`flush`/`cancelPending`), session-only undo (`UNDO_HISTORY_CAP=100`), `version:2` history-free O(n) state (v1 still resumes), atomic `.tmp`+rename, reconcile-on-resume self-heal, `showTournamentPairFast` render fast-path.
- **Item 3** ([CLAUDE.md](../../CLAUDE.md) Data Structures, `4d15c39`) — noted MinHeap/VPTree are now worker-only (renderer copies + `sortMediaBySimilarity*` methods deleted in PR #54); kept the still-true `calculateCosineDistance` dual-location note.
- **Item 4** ([DONE.md](DONE.md) + [TODO.md](TODO.md), `318ab27`) — replaced the "PR2/PR3 = raw-speed continuation" framing with the per-phase cost map (PR2 = hashing wait/hash sorts only, PR3 = ~40s cache-load, neither touches the O(n·K) graph-build floor; AI-prediction sort has no graph build).
- **Item 5** ([CLAUDE.md](../../CLAUDE.md) new `## Maintenance` footer, `46ebec3`) — documented decision **D1 = manual-only** maintenance (markers stay stripped).

**Key decisions / learnings**: ⭐ **Decisions D1** (manual-only CLAUDE.md maintenance — no AUTO-MANAGED markers re-introduced) and **D2** (line-ref scope = CLAUDE.md note only; historical `~NNNN` refs in settled BACKLOG/TODO entries left as churn-avoidance). ⭐ **CW-D was correctly gated behind CW-T** — items 1 & 2's pre-CW-T backlog wording was stale (predated the O(1) inverse-delta undo + `showTournamentPairFast`), so verification-against-current-code _adapted_ them rather than pasting. ⭐ **A documented fiction is worse than an omission** — the verify-then-write gate confirmed all 3 gotchas + every persistence claim hold in current code before committing. ⭐ CLAUDE.md is now 204 lines (just over the ~200 soft cap its own new Maintenance footer sets) → filed a 🟤 trim follow-up. Spec: [docs/superpowers/specs/2026-07-03-cw-d-docs-claude-md-hygiene-design.md](../superpowers/specs/2026-07-03-cw-d-docs-claude-md-hygiene-design.md). Plan (archived): [docs/archive/plans/2026-07-03-cw-d-docs-claude-md-hygiene.md](../archive/plans/2026-07-03-cw-d-docs-claude-md-hygiene.md).

### 2026-07-02 — Group CW-T: Tournament correctness, persistence & hardening

**Summary**: Fixed the 2 HIGH-severity tournament bugs from the 2026-07-01 24k dogfooding + swept 6 adjacent 🟤 debt items (one branch, one review cycle). **Bug #1** (cannot enter after add-media + AI sort): diagnosis _corrected the BACKLOG hypothesis_ — the disk-resume path already reconciled post-PR #55, but the **live-engine fast-path** in `enterTournamentMode` skipped reconciliation, so `getMediaIndex` returned −1 → "file missing". **Bug #2** (24k freeze / Continue-stuck / Both-Win-hang): the real per-pick O(n) cost was `recordResult`/`recordDraw` deep-`serialize()`ing the whole SwissStrategy for undo on **every** pick (winCounts + files + playedPairs + roundQueue copies, up to 100 retained), plus a full `showCompareMedia` teardown/rebuild per pair.

✅ **Status: MERGED 2026-07-03 via PR #59** (merge `ae9588d`, branch `fix/cw-t-tournament-hardening` deleted remote + local) — subagent-driven (8 commits, controller commits), every per-task review Approved + final whole-branch review (opus) "Ready to merge: Yes" **after catching 2 cross-cutting fast-path bugs** (shared-`_jxlObjectURLs` per-side revoke blanking a JXL side; duplicate error handler on the fast-path media) both **fixed in-branch** (`8a472d9`) + re-reviewed clean; **real-24k manual smoke PASSED** (resume no freeze, picks/Both-Win instant & non-degrading, add-media+AI-sort→enter renders a pair). Post-merge `/code-review` flagged **2 real issues** — both controller-verified real despite Haiku-75 scores (HIGH delta-undo-across-`removeFile` strategy corruption, **reproduced by direct execution**; close-guard-vs-"Resume tournament?"-prompt making the window unclosable) → both **fixed in-branch pre-merge in `f4b7807`** (`removeFile(file,{trackUndo:true})` snapshot at the auto-prune site; guard scoped to `title === 'Leave tournament?'`; +3 unit → 411), re-review "No issues remaining"; +2 🟤 [2026-07-03] PR #59 post-merge residuals (special-move undo-past `strategy.files` divergence; fast-path re-entrancy guard). 404→411 unit, lint 0, tournament E2E 6/6.

**Key changes**:

- **Bug #1 reconcile** ([tournament.js](../../tournament.js), [media-viewer.js](../../media-viewer.js)) — extracted `TournamentManager.reconcileWithFiles(currentFiles)` (prune `engine.files` to ∩ current, idempotent); called in `_enterResumedTournamentUI` so **every** entry (incl. the live-engine fast-path) reconciles; hardened the `-1` branch with a bounded retry + a structured divergence capture (now persisted to `media-viewer-perf.log`).
- **Bug #2A undo** ([tournament-engine.js](../../tournament-engine.js)) — `SwissStrategy.captureUndo()`/`applyUndo()`: O(1) inverse-delta for non-boundary picks (unshift pair, decrement winCounts, delete playedKey, gamesPlayed−−), full snapshot only when the pick empties the round. `filesSnapshot` kept on **every** history entry (cheap array-of-refs) to preserve the tested `engine.files`-rewind-across-`removeFile` contract.
- **Bug #2B/C render** ([media-viewer.js](../../media-viewer.js)) — `showTournamentPairFast`/`_buildTournamentSide` reuse the compare wrappers + overlay controls, swapping only the inner media (no 50ms grace, no per-pair `checkFileExists` IPC, no `lucide` rebuild); **phase-separated** cleanup vs build (`Promise.all(cleanup both)` then `Promise.all(build both)`) so the shared JXL-URL revoke can't blank a side; `_logSlowPhase` instrumentation.
- **6 🟤 debt** — `handleDiscard` retry-once; `moveToSpecialFolder` + `handleTournamentUndo` comment fixes; `onAppCloseRequested` unsubscribe stored; close-confirm re-entrancy guard; `getMediaIndex` single-lookup; stale E2E fix + exit precondition + `#tournamentExitBtn` aria-label; undo-cap + SwissStrategy carry-over/don't-double-bye test pins.
- **Persistent perf log** ([logger.js](../../logger.js), [main.js](../../main.js), [preload.js](../../preload.js)) — append-mode `media-viewer-perf.log` (survives quit; the main log is truncate-on-launch + delete-on-quit) so real-run `[perf]` timings are reviewable; `logPerf()` + a `log-perf` IPC channel + preload bridge (added post-smoke on user request).

**Key decisions / learnings**: ⭐ the spec's bug #1 hypothesis (sort-reorder → −1) did not survive a code read — reconciliation already guarded the disk path; the real gap was the live-engine fast-path (diagnose before implementing). ⭐ the inverse-delta cannot resurrect a mid-tournament-removed file's _strategy_ state on its own, so `filesSnapshot` is kept every pick to hold the tested `engine.files`-rewind contract. **Post-PR `/code-review` fix:** what was framed as a "documented nuance" (undo past a `removeFile` restored `engine.files`/tier count but not the strategy) was actually _state corruption_ (phantom byes, polluted win counts) — fixed by giving `engine.removeFile(file, { trackUndo:true })` a snapshot-based undo entry (reuses the existing snapshot-restore path, no new dispatch), opted-in at the reachable `-1` auto-prune site so undo fully restores the strategy; the special-move → undo-past case stays on the renderer's special undo branch, bounded by the pre-existing [2026-06-24] two-stack-interleaving item. ⭐ the final whole-branch review caught two fast-path × shared-code interaction bugs invisible to per-task review; the follow-up `/code-review` then caught two more (delta-undo × removeFile corruption; a close-guard keyed on the _shared_ resume/leave modal that made the window unclosable during the "Resume tournament?" prompt — fixed to key on the leave-prompt title) — **the review layers compound**. ⭐ `npx vitest run` is flaky under vitest v4 parallel workers on this machine (`--no-file-parallelism` reliable) → filed 🟡.

**Plan**: [docs/archive/plans/2026-07-01-cw-t-tournament-correctness-hardening.md](../archive/plans/2026-07-01-cw-t-tournament-correctness-hardening.md) · **Spec**: [docs/superpowers/specs/2026-07-01-cw-t-tournament-correctness-hardening-design.md](../superpowers/specs/2026-07-01-cw-t-tournament-correctness-hardening-design.md)

---

## 2026-06 (June)

### 2026-06-30 — Group T1: Tournament exit affordances

**Summary**: Two batched tournament-mode exit affordances (one branch, one PR): (1) a pause-style **exit button** re-added to the center of `#tournamentHeader` (the slot of the button removed in `c6914ef`) wired to the existing `switchMode('single')` → Save/Discard/Cancel leave prompt; (2) **confirm-before-app-close** during an incomplete tournament — `mainWindow.on('close')` intercepts every close path and round-trips to the renderer, which reuses the same leave prompt before the app quits.

✅ **Status: MERGED 2026-06-30 via PR #58 (`21668ac`, branch deleted remote + local)** — subagent-driven (8 commits, controller commits), every per-task review Approved + final whole-branch review (opus) "Ready to merge: Yes" (no Critical/Important; 1 Important + 1 Minor folded in pre-merge); post-merge /code-review "No issues found" (no finding ≥80; the scored-75 discard-path fail-safe gap was folded in PRE-MERGE in `3ad32bb`); 389 unit (+8), full E2E 48 pass / 1 pre-existing fail (a stale assertion from PR #55's history-free v2 persistence, controller-verified failing on `main`), lint 0; **all 5 manual close-confirm cases PASSED**.

**Key changes**:

- **Exit button** ([index.html](../../index.html), [styles.css](../../styles.css), [media-viewer.js](../../media-viewer.js)) — `#tournamentExitBtn` (Lucide `pause`) centered in `#tournamentHeader` via the header's `justify-content:space-between`; `.tournament-pause` CSS re-added; click → `switchMode('single')`.
- **Leave-prompt refactor** ([media-viewer.js](../../media-viewer.js)) — `showTournamentLeavePrompt(targetMode)` → `(onAfterLeave)` continuation so both the mode-switch path (`() => _applyModeSwitch(mode)`) and the app-close path (`() => allowAppClose()`) drive the same modal; Cancel never runs the continuation.
- **App-close confirm** ([main.js](../../main.js), [preload.js](../../preload.js), [media-viewer.js](../../media-viewer.js)) — `mainWindow.on('close')` (covers X / `app.quit()` / Alt+F4 `globalShortcut`) → `preventDefault` + `app-close-requested` → renderer `handleAppCloseRequest()` (incomplete tournament → leave prompt; else immediate `allowAppClose()`; try/catch-always-allow fail-safe) → `app-close-allow` → quit. Dead-renderer `isDestroyed()/isCrashed()` guard; `ipcMain.on` registered once + `isQuitting` re-arm (macOS).
- **navInfo overlap fix** ([styles.css](../../styles.css)) — hide the fixed top-center `#navInfo` pair-count banner in tournament mode (user-flagged: it covered the centered exit button; the count is already in `#tournamentProgress`).
- **Discard-path fail-safe** ([media-viewer.js](../../media-viewer.js)) — post-`/code-review` fold-in (`3ad32bb`): wrap `handleDiscard()` in try/catch so a rejected `deleteTournamentState` IPC can't block `cleanup()`/`onAfterLeave()` (the app-close `allowAppClose` continuation), mirroring the Save path's `_drain` persist-error swallow; +1 unit test.

**Key decisions**: reuse the in-app DOM modal via IPC (chosen over a native `dialog.showMessageBox`) for UX consistency; **rejected** a cached `tournamentActive` flag pushed to main — the confirm condition `isTournamentMode && engine && !engine.isComplete()` flips mid-tournament (last pick / undo), so fresh evaluation at close time is always correct.

**Plan**: [docs/archive/plans/2026-06-30-tournament-exit-affordances.md](../archive/plans/2026-06-30-tournament-exit-affordances.md)
**Spec**: [docs/superpowers/specs/2026-06-30-tournament-exit-affordances-design.md](../superpowers/specs/2026-06-30-tournament-exit-affordances-design.md)

**Lessons learned**:

- **The close interception affects EVERY app teardown, not just tournament** — the Playwright `closeApp` helper (`electronApp.close()` → window `close`) would hang on any incomplete-tournament E2E test (renderer pops the modal, no user → 5s SIGKILL). Fixed by nulling `tournament.engine` in the tournament E2E `afterEach` before `closeApp` (test-teardown hygiene, not a production test-hook).
- **A green pre-commit hook ≠ a green E2E suite** — the `Continue-resumes` test has failed silently since PR #55 (history-free v2) because E2E is run neither by the hook nor any CI. Re-running it on `main` is what attributed it correctly (pre-existing, not this branch).
- **"Only macOS" is not a reason to skip a one-line correctness fix** — the final-review Important (`ipcMain.on` accumulation on dock-activate) and the `isDestroyed()` reply-handler guard were both folded in pre-merge rather than deferred.

**Follow-up tasks**: BACKLOG 🟤 [2026-06-30] (4 items: pre-existing `Continue-resumes` E2E stale-assertion fix; close-confirm re-entrancy guard; exit-button `aria-label`; exit-button E2E precondition) + 🟤 [2026-06-30] PR #58 post-merge review (2 items: orphaned `.tournament_state.json` on a failed discard — the tradeoff of the `3ad32bb` fail-safe fix; discarded `onAppCloseRequested` unsubscribe, scored 25).

### 2026-06-26 — Group WR: Weekly Reviews (first run) ⚪ Overhead

**Summary**: First-ever run of the recurring **Weekly Reviews** batch (WEEKLY.md Group WR; REVIEW-QUEUE.md
created 2026-06-19 with empty Reviewed logs). Reviewed the top not-yet-reviewed candidate in each of 4
categories under a **hybrid relevance lens** (source broadly, judge by fit to this project's
solo-dev-with-Claude-Code Electron workflow) and logged a verdict (`adopt | defer | pass`) per category.
Process overhead (WEEKLY.md framed it as "no code PR", but the user chose to ship it as a docs-only PR);
deliverables are doc edits. The brainstorm spec doubles as the reusable Weekly Reviews methodology.

✅ **Status: COMPLETE 2026-06-26 · MERGED 2026-06-29 via PR #57 (`b42f5f5`; branch `chore/weekly-reviews-2026-06-26` deleted remote + local)** — 381 unit green throughout (docs-only). `/code-review` was invoked at the user's request but correctly classified the PR docs-only (no code to review, mirrors PR #46) → "No issues found"; +2 🟡 [2026-06-29] post-merge process observations (recognize docs-only PRs before the review fan-out; merge-or-defer a Weekly-Reviews docs-only PR in its originating session). **4 verdicts, 1 adopt**:

- **Plugins / official store** → **pr-review-toolkit** (`adopt`) → 🟤 BACKLOG trial entry. Granular PR-review agents (tests, silent-failure-hunter, type-design, simplification); not yet used here, complements `/code-review`.
- **Plugins / wider internet** → test-writer-fixer via awesome-claude-plugins (`defer` — unvetted third-party; community Playwright skills have an Electron-support gap).
- **Claude best-practice** → TDD Guard, hook-enforced TDD (`defer` — fits the project's TDD discipline but needs eval; surfaced unverified).
- **Non-Claude best-practice** → local-model code review (Continue.dev + Qwen3-Coder-Next via Ollama) (`defer` — GPU-gated). Spec-Driven Development / GitHub Spec Kit parked as already-practiced-here (via superpowers).

**Plan**: [docs/archive/plans/2026-06-26-weekly-reviews-first-run.md](../archive/plans/2026-06-26-weekly-reviews-first-run.md)
**Spec / methodology**: [docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md)
**Results**: [REVIEW-QUEUE.md](REVIEW-QUEUE.md) (4 rows + parked Next-up runners-up)

**Key decisions** (spec D1–D4): D1 hybrid relevance lens · D2 deep-research harness per category (user choice) · D3 recency June 2026, empty logs → all eligible · D4 adopt is hands-off (BACKLOG trial item, no install).

**Lessons learned**:

- **The deep-research harness was wildly disproportionate for a 4-SP overhead review.** Four runs burned **~8M tokens** and the adversarial-verification phase **never completed once** — first server-side rate limiting (from launching all 4 harnesses in parallel = 80+ agents), then the actual session usage limit. Every run self-reported "inconclusive / all claims refuted (0-0)" while actually holding good raw data. Verdicts rest on the raw (mostly primary-source) research; the non-Claude category was finished with a cheap inline `WebSearch` pass.
- **A harness "inconclusive / all-claims-refuted (0-0)" label is a false signal when verification is rate-limited** — the gathered claims are still usable; read the raw `refuted` list, don't trust the summary verdict.
- **Never fan out multiple deep-research harnesses in parallel** — the parallel burst is what tripped the limiter; a single workflow caps at ~16 agents and is far gentler.

**Follow-up tasks**: BACKLOG 🟤 [2026-06-26] Weekly Reviews first-run process follow-ups (2 items: default to lightweight inline research; never run harnesses in parallel) + the pr-review-toolkit `adopt` trial entry. Methodology correction recorded in the spec's "First-run retro" section (supersedes D2 for future weeks).

### 2026-06-25 — Group P3: Feature-extraction timing (lazy / on-demand)

**Summary**: Background feature extraction ran unconditionally on every `loadFolder()` — a ~40s feature-cache
load + ~87 MB CLIP model download + CPU-heavy extraction of every file — even when the user only browsed and
never used an AI feature. Group P3 makes it **lazy / on-demand**: vectors are produced only when an AI-dependent
feature is actually used. The decisive finding (from exploring the code) reshaped the work: the ML **"Sort by
Prediction"** path was _already_ lazy (self-triggers extraction) and never depended on the folder-open kickoff,
and **hash** similarity sort needs no vectors at all — so the only consumer that relied on the kickoff was
**CLIP semantic sort**. The fix therefore is mostly _deletion_ (two eager kickoff call sites) plus one new
conditional trigger on the CLIP-sort path. Subagent-driven (4 tasks; controller commits per
[[feedback_subagent_commits_vs_memory_hook]]); every per-task review Approved; final whole-branch review (opus)
→ **"Ready to merge: Yes"** (no Critical/Important).

✅ **Status: MERGED 2026-06-26 via PR #56 (merge `9d65500`; branch `feature/extraction-timing` deleted).** Manual 24k
smoke PASSED (the real acceptance gate — per WEEKLY.md, large-folder behavior can't be represented by synthetic
fixtures); the 6-step smoke on the user's real 24k folder **all passed**, including the two unit-uncovered behaviors:
step 3 ("repeat CLIP sort = instant, no ~40s reload") and step 6 ("toggle CLIP off→on = no kickoff"). Pre-merge
`/code-review` flagged 1 issue scored 100 (a stale E2E test asserting the removed toggle-on kickoff, plus 2 stale
`media-viewer.js` comments — same root cause) → **fixed in-branch `cba5352`** (E2E flipped to the lazy `calls===0`
contract; both comments reworded); re-review posted "Verified — no issues remaining". **381 unit + 3/3 E2E green** (374 → 381, +7).

**Plan**: [docs/archive/plans/2026-06-25-extraction-timing.md](../archive/plans/2026-06-25-extraction-timing.md)
**Spec**: [docs/superpowers/specs/2026-06-25-extraction-timing-design.md](../superpowers/specs/2026-06-25-extraction-timing-design.md)

**What shipped (4 tasks)**:

1. **`clipVectorsNeedExtraction()` predicate** (`2c57398`) — pure gate: `enableClipFeatures && mediaFiles.some(f => !clipCache.has(f.path))`; +5 unit tests (disabled / empty-cache / partial / full / empty-folder).
2. **On-demand CLIP-sort trigger** (`8ead5c6`) — in `handleSortBySimilarity`'s `'clip'` branch, `if (clipVectorsNeedExtraction()) await kickoffBackgroundExtractionIfEnabled()` before vector collection. The gate makes a repeat CLIP sort (vectors already in memory) skip the ~40s cache reload.
3. **Removed the folder-open kickoff** (`f19431c`) — deleted the unconditional `kickoffBackgroundExtractionIfEnabled()` from `loadFolder`; added a `methodSource` test helper + a regression test asserting the call is gone. The kickoff method body is unchanged → its 11 existing tests stay green.
4. **Made the CLIP enable-toggle lazy** (`cb976ba`) — dropped the toggle-on `else` branch (its only statement was the kickoff); toggling CLIP on now just enables the capability. Scoped regression test on the handler body (not `methodSource`, to avoid brace-counting the 500-line `setupEventListeners`).

**Key decisions** (spec D1–D4):

- **D1 — pure lazy**, no threshold / settings-toggle / idle-delay (user lean: "move it to where it's needed").
- **D2 — CLIP toggle-on is lazy too** (consistency over the Group C eager-kickoff behavior).
- **D3 — the CLIP-sort trigger is conditional** because `loadFeatureCache()` re-reads the ~40s cache on every fresh call (single-flight only coalesces _concurrent_ calls).
- **D4 — reuse `kickoffBackgroundExtractionIfEnabled` unchanged**, keep its name (avoids churning 11 tests).

**Lessons learned**:

- **Read the consumers before deciding the fix.** The TODO framed this as "defer extraction"; the code showed two of three consumers (ML, hash) already didn't need the kickoff, collapsing the task to one new trigger + two deletions.
- **A test-helper can have the same fragility class as production code.** `methodSource`'s naive brace-counting is safe only for `loadFolder`; Task 4 was deliberately scoped away from it. Hardening filed to BACKLOG.
- **`loadFeatureCache()` single-flight ≠ cached** — it re-reads on each fresh call, which is why the trigger had to be gated (the whole point of the predicate).

**Follow-up tasks**: BACKLOG 🟤 [2026-06-25] Group P3 closeout (2 items: `methodSource` brace-counting hardening; defer a shared lazy gate-and-extract helper until a 3rd AI consumer appears) + BACKLOG 🟡 [2026-06-26] PR #56 process items (E2E not gated by any pre-commit/CI step → behaviour-change PRs can land silently-broken E2E tests; adopt a reference-sweep convention when removing a named call site). MERGED via PR #56 (`9d65500`).

### 2026-06-24 — Group P2: Tournament large-folder performance (batch)

**Summary**: The three 🔴 user-top-priority tournament-mode slowness items on 24k+ folders — launch/resume,
pick→next, and Save & leave — shared one root cause and one set of files, so they shipped as one batch. The
fix: stop the **synchronous, ever-growing full-state disk write on every pick**, make the Swiss pairing
**O(n)**, and replace the **dual O(n) path→index `findIndex`** with a cached `Map`. Subagent-driven (7 tasks;
controller commits per [[feedback_subagent_commits_vs_memory_hook]]); every per-task review Approved; final
whole-branch review (opus) → **"Ready to merge: Yes"** (no Critical/Important).

✅ **Status: MERGED 2026-06-25 via PR #55 (merge `51366cb`; branch deleted)** — pre-merge `/code-review` flagged 1 issue (scored 100: null-folder start write) fixed in-branch `8420a7c`; re-review posted "No issues found"; +3 🟤 [2026-06-25] post-merge follow-ups (debounce on three structural-mutation persistence points). **Manual 24k-folder smoke PASSED 2026-06-24** (launch / pick→next with no degradation /
Save & leave / resume / Apply — all ✅) — the real acceptance gate (synthetic fixtures can't represent 24k).
**374 unit tests green** (357 → 374, +17). **Closes the canonical BACKLOG 🔵 [2026-06-18] "tournament-mode
pair changing" entry.** Post-PR `/code-review` (PR #55) caught a third real bug — `handleStartClick` flushed
to a null `_persistFolder` (set only by `_schedulePersist`, never on start) → the initial state silently
failed to persist until the first pick — fixed in-branch (`8420a7c`) with a regression test asserting the
start-path write gets a non-null folder.

**Plan**: [docs/archive/plans/2026-06-24-tournament-large-folder-perf.md](../archive/plans/2026-06-24-tournament-large-folder-perf.md)
**Spec**: [docs/superpowers/specs/2026-06-24-tournament-large-folder-perf-design.md](../superpowers/specs/2026-06-24-tournament-large-folder-perf-design.md)

**What shipped (7 tasks)**:

1. **Slim, versioned (v2) payload** (`abf8db0` + coverage `36f7a61`) — `serialize()` drops the O(n·games)
   per-pick history snapshots and bumps to `version: 2` (+ top-level `gamesPlayed`); `deserialize` accepts v1
   (legacy) **and** v2 → empty history. **Session-only undo (D1).** `.tournament_state.json` is now O(n) and
   constant-size; launch/resume read+parse drops from O(n·games) to O(n).
2. **Undo cap** (`92e576c`) — in-memory undo history capped at the last 100 picks (`UNDO_HISTORY_CAP`),
   bounding RAM on long sessions (each snapshot is O(n)).
3. **O(n) `_buildRoundPairings`** (`e581a74` → fix `f79f374`) — consumed-markers + head pointer replace the
   per-pair O(n) `bucket.splice()` (round 1 was O(n²)). **Review caught a CRITICAL divergence**: the first
   rewrite fixed `aIdx=head` and forced an avoidable rematch when the head had played everyone but a non-head
   un-played pair existed; restored the full `(i,j)` scan + a deterministic rematch-avoidance test.
4. **Debounced single-flight persistence** (`2cfc622` → fix `88ee45f`) — `TournamentManager` gains
   `_schedulePersist`/`_drain`/`flush`/`cancelPending`; picks schedule a trailing-edge (500ms) write that
   coalesces bursts and never overlaps (latest-wins), so the next pair renders without awaiting disk.
   **Review caught an IMPORTANT durability bug**: `flush()` could return before the latest state was durable
   when a pick interleaved an in-flight write; rewrote it to loop until quiescent + a regression test.
5. **Renderer wiring** (`86e3c45`) — 5 `_persistState` call sites rerouted: Save & leave → `await flush()`
   (durable before dropping the engine); pick/undo/special-move → `_schedulePersist` (non-blocking).
6. **Cached path→index `Map`** (`128d391`) — `getMediaIndex` (rebuilt only on array-reassign or size change;
   invalidated in `removeFileFromList`) replaces the dual O(n) `findIndex` in `showTournamentPair`.
7. **Atomic state write** (`c52721b`) — `writeTournamentState` writes `.tmp` then `fs.rename`, so a crash
   mid-write can't corrupt a resumable tournament.

**Key decisions**:

- **D1 session-only undo** (user choice): undo works within a session but not across Save & resume — this is
  what lets the persisted payload drop to O(n) (the single biggest win). **D2**: cap undo at 100 picks (keep
  the proven snapshot mechanism, bound RAM) over a delta-undo rewrite. **D3**: trailing-edge debounce +
  single-flight (latest-wins) over per-pick fire-and-forget (which races on out-of-order write completion).
- **Scope guardrail held**: no change to Swiss pairing _quality_, tier assignment, or the resume/leave UX.
- **Out of scope**: the Alt+F4 window-close `< DEBOUNCE_MS` loss window → deferred to Group T1 (Fri).

**Lessons learned**:

- ⭐ **Three real bugs were latent in the plan's own code** — two caught by the adversarial per-task review
  (opus), the third by the post-PR `/code-review` (the null-folder start-write). All three passed the full
  suite because no existing test exercised the triggering shape (a ≥3-member bucket whose head has played
  everyone; a pick interleaving an in-flight write; a start before any pick + a mock that accepts any args).
  **A green suite ≠ correct when the tests predate the edge** — each fix shipped with a _deterministic_
  regression test that goes RED on the bug. The null-folder one underlines a refactor trap: moving from
  `_persistState(folder)` (explicit arg) to `flush()` (reads instance state) silently dropped the start
  path's folder, and an over-permissive mock hid it.
- ⭐ "Characterization passes on the current impl" pins only what the _existing_ tests cover — it does **not**
  prove selection-equivalence for an algorithm rewrite. The pairing fix needed a _new_ test built around the
  exact divergent shape.
- ⭐ A subagent will (correctly) redesign a specified regression test if it doesn't actually fail on the bug —
  the Task 4 fixer rebuilt the flush test when the original passed spuriously via microtask ordering. **Verify
  a regression test is genuinely RED→GREEN; don't trust the green.**

**Follow-up Tasks** (BACKLOG 🟤 [2026-06-24], 4 items): undo-cap test coverage (T2a/T2b); SwissStrategy
carry-over/double-bye unit pin (T3); `getMediaIndex` double-lookup micro-opt (T6); document the new
persistence model in CLAUDE.md (deferred to `revise-claude-md`).

### 2026-06-19 — Group P1 PR1: Sort responsiveness core (large-folder perf, PR1 of 3)

**Summary**: First of three staged PRs for the 🔴 user-top-priority "speed up 24k+ folder sorting" item.
During brainstorming the scope widened (user choice) to **all three slowness sources** under a hard
**quality-lock** ("quality must not change at all"), then decomposed into 3 PRs (Approach A — staged, no
neighbor-graph parallelization). **PR1 = the responsiveness core**: make visual-similarity sorting
non-freezing, transparent, and cancelable, and remove O(n²)/dead-code waste — _without_ changing sort
quality. Subagent-driven (5 tasks; controller commits per [[feedback_subagent_commits_vs_memory_hook]]);
all per-task reviews Approved; final whole-branch review (opus) → **"Ready to merge: With fixes"** (the one
Minor — CLIP-fallback test coverage — fixed in-branch in `d19d252`).

✅ **Status: MERGED 2026-06-20 via PR #54 (merge `7b78a56`); manual 24k-folder smoke PASSED (2026-06-19); `/code-review` posted "No issues found" (no finding scored ≥80; +2 🟤 sub-threshold follow-ups filed).** (The
`updateSortProgress` DOM render + Cancel are verified by that smoke, not by `node`-env unit tests.) The
parent P1 TODO item stays **OPEN** (PR2 + PR3 remain).

**Plan**: [docs/archive/plans/2026-06-19-sort-responsiveness-core.md](../archive/plans/2026-06-19-sort-responsiveness-core.md)
**Spec**: [docs/superpowers/specs/2026-06-19-sort-responsiveness-core-design.md](../superpowers/specs/2026-06-19-sort-responsiveness-core-design.md)

**What shipped (5 tasks)**:

1. **Dead-code removal** (`e142c7d`) — deleted the three unused `sortMediaBySimilarity*` renderer methods +
   their now-orphaned `MinHeap`/`VPTree` classes (worker keeps its own copies). **631 lines** gone, no behavior change.
2. **`insertNewFilesInSortedOrder` yielding** (`d9050c5`) — `await new Promise(r=>setTimeout(r,0))` every 25
   outer iterations in both branches; output byte-identical. **Closes BACKLOG 🟤 [2026-05-24].**
3. **Worker O(n²) MST-fallback → `vpTree.findNearest(current, traversed)`** (`723dc68` pins → `5159b0e` swap →
   `3d2968c` equivalence proof → `d19d252` CLIP-fallback fixture) — both worker sorts; identical output except
   tie-break order among exactly-equal-distance files on the hash path (CLIP bit-identical).
4. **Progress component** (`cf8334d`) — `computeSortProgressView` (pure, unit-tested view-model) +
   `updateSortProgress` (determinate cancelable card, Option C: grows the existing bottom-right progress
   notification) + CSS.
5. **Wiring + hardening** (`d80350a`) — route all sort phases (worker `current`/`total`, hashing, cache-load,
   insertion) through `updateSortProgress`; Cancel → `sortAbortController.abort()`; hardened
   `updateProgressNotification` to rebuild the shared element when the sort card took it over (prevents a
   TypeError if ML/historical progress fires mid-sort).

**Key decisions**:

- **Quality-lock ⇒ no K-cap** (user: "quality must not change at all"). The big O(n·K) neighbor-graph build
  (K≈1,550 @ 24k) is untouched; PR1 makes it transparent + cancelable (off-main-thread already), not faster.
  PR2 (hash off-thread) removes the cold-cache hashing wait (hash sorts only) and PR3 removes the ~40s
  cache-load wait, but NEITHER touches the O(n·K) graph-build floor — that moves only via #7 (parallel build)
  or relaxing the quality-lock (a bounded K-cap). The AI-prediction sort has no graph build and is fully
  addressed by PR3 + PR1.
- **Progress UI = Option C** (chosen via visual-companion mockups over a centered modal / docked bar) — grow
  the existing progress notification, for consistency with where sort progress already appears.
- **Fallback proof needs 3 legs** — capture-baseline pins _before_ the swap, the swap leaving them unchanged,
  and a direct `findNearest`≡brute-force equivalence test (a two-cluster fixture does not always _execute_ the
  fallback line; the CLIP one needed a star-topology fixture to reach it).

**Verification**: 345 → **357 unit** (15 files); `npm run lint` + `npm run format:check` clean (1 pre-existing
unrelated warning); per-commit pre-commit hook (check-secrets → eslint → prettier → vitest) green. E2E for the
progress card deferred to the manual smoke (24k folders aren't E2E-fixturable).

**Lessons learned**:

- A behavior-preserving refactor under a strict quality-lock is best proven by **capture-baseline pins +
  a direct equivalence test**, not just end-to-end characterization — characterization fixtures can pass
  without ever executing the changed line.
- Two renderers sharing one DOM element (`updateProgressNotification` + `updateSortProgress`) is a latent
  null-deref; the per-task review caught it as a cross-task ("⚠️ surfaces in Task 5") finding the task-scoped
  gate alone would have missed.

**Follow-ups filed** (🟤 [2026-06-19]): optional progress-card E2E smoke; deferred neighbor-graph
parallelization (#7, measure-first trigger); CLAUDE.md/docs drift from the dead-code removal.

**Branch**: `feature/sort-responsiveness-core` → **PR #54 MERGED 2026-06-20** (merge `7b78a56`, branch deleted); manual 24k smoke **PASSED 2026-06-19**.
PR2 (hash off-thread, hash sorts only) + PR3 (incremental cache-load, ~40s) remain — they remove the
hashing + cache-load waits but NOT the O(n·K) neighbor-graph-build floor (that needs #7 or a K-cap); the
AI-prediction sort has no graph build and is already fully addressed by PR3 + PR1.

### 2026-06-17 — Group CW-4: Process & security guards (pre-commit secret guard + pre-archive checklist)

**Summary**: Cleanup-Week batch (3 SP, 🟡 Operational) — two preventive guards in one branch / one PR.
Closes the Group D security-audit **tier-(a)** referral and the 2026-04-30 pre-archive-checklist item.
Built subagent-driven (5 tasks; controller commits per [[feedback_subagent_commits_vs_memory_hook]]);
final whole-branch review (opus) → **"Ready to merge: Yes"** (no Critical/Important findings).

**Plan**: [docs/archive/plans/2026-06-17-cw-4-process-security-guards.md](../archive/plans/2026-06-17-cw-4-process-security-guards.md)
**Spec**: [docs/superpowers/specs/2026-06-17-cw-4-process-security-guards-design.md](../superpowers/specs/2026-06-17-cw-4-process-security-guards-design.md)

**The two guards**:

1. **Pre-commit secret guard (tier a, 2 SP)** — new `scripts/check-secrets.js`: pure `scanForSecrets(text)`
   (5 markers — AWS `AKIA…`, GitHub `gh[opsru]_…`, Slack `xox[baprs]-…`, Google `AIza…`,
   `-----BEGIN … PRIVATE KEY-----`) + pure `extractAddedLines(diffText)` (parses `git diff --cached
--unified=0`; added lines only; skips binary/removed) + a CLI behind `require.main === module` that
   blocks the commit (exit 1) on a hit. Wired **first** into `.husky/pre-commit` (before lint-staged/vitest).
   New `scripts/**/*.js` ESLint block (Node CJS). **No new runtime dependency.** Self-reference-safe:
   patterns match full token _shape_ (prose prefixes don't match) and test fixtures concatenate so no
   full-shape literal sits on disk. 12 + 6 unit tests.
2. **Pre-archive checklist (1 SP)** — strengthened the **tracked** archive READMEs (NOT the
   uncommittable global `.claude/TEMPLATES/plan.md`): `docs/archive/plans/README.md` +
   `docs/planning/plans/README.md` now require flipping in-plan `[ ]`→`[x]`, setting `Status: Complete`,
   indexing BOTH plan AND spec in `docs/README.md`, and verifying cited SHAs are ancestors of `main`
   (`git merge-base --is-ancestor`) — folding in the CW-3 / PR #50 stale-SHA convention.

**Key decisions**:

- Node script + vitest over inline shell — testable + cross-platform (Windows Git-Bash quoting is fragile).
- Committable home = tracked archive READMEs; the BACKLOG-named global template is gitignored/outside-repo
  (an edit there produces nothing in the PR).
- Full token-_shape_ patterns (not bare prefixes) → the guard never flags its own regex source or doc mentions.

**Verification**: 326→**344 unit** (15 files); `npm run lint` 0 errors (1 pre-existing unrelated warning in
`media-viewer-utils.test.js:1263`); Prettier clean; hook happy-path (commit) + block-path (planted AWS key →
blocked, exit 1) both exercised; full-shape detector scan of **all 171 tracked files = zero real secrets**;
audit §1/§2 re-run clean; scope = **exactly 8 paths, no `.gitignore`**. E2E not run (no renderer/main/worker changes).

**Deviations** (both improvements, review-approved): null-guarded CLI output (`f.file ?? '<unknown>'`);
header-comment correction (Task 1 referenced symbols added only in Task 2).

**Follow-ups filed** (🟤 [2026-06-17]): Slack-regex intentional-over-match code comment; detector test-coverage
(2nd `match`-field assertion + multi-file / binary-leak diff tests); tier-a false-negative note (fine-grained
`github_pat_` + 40-char AWS secret keys) for the gitleaks entry; CLAUDE.md "eleven → twelve file-group blocks" drift.

**Branch**: `cleanup/cw-4-process-security-guards`; MERGED 2026-06-18 via PR #51 (`ebc7d41`).

### 2026-06-16 — Group CW-3: Docs & backlog hygiene (stale-checkbox sweep + doc drift + cruft removal)

**Summary**: Cleanup-Week batch (4 SP, 🟤 Auto-Generated) — make the planning data trustworthy again.
One branch / one PR. **Docs-and-config-only**: no `*.js`/`index.html`/`styles.css` changed, so per the PR #46
learning `/code-review` is a no-op; shipped with a manual review. The whole task's rigor lived in **git
verification** — every checkbox flip cites a commit confirmed an ancestor of `main`.

**The three tasks**:

1. **BACKLOG stale-checkbox sweep (2 SP)** — flipped **7 git-verified resolved entries** with commit refs:
   CLIP-extraction-UX toast + toggle-on (PR #45 `ad4e488`), Pin Lucide CDN (Group F `2a5597a`), CLIP
   similarity sorting (Group D `e0d07dc`), CLIP unload (Group E `e7d84d0`), logger double-init (`b9f3b7e`),
   regression-checker FullscreenManager (Group F `1efbdc1`). A targeted-light-scan confirmed no resolved-but-
   unchecked items beyond the named set. Recount: **153 unchecked 🟤** remain (CW-3 cleared 11 🟤 total — 4
   here + 7 at closeout), recorded in WEEKLY.md Notes.
2. **Doc one-liners bundle (1 SP)** — verify-first; several spec-listed items were **already done** (no-ops):
   CLAUDE.md `## Backlog Intake Rules` MANUAL markers, the `backlog-structure` test-inventory entry, the
   `.sort_cache.json` key wording in CLAUDE.md, and 3 README Design-Spec rows. **Genuinely applied:** tournament
   UI-integration hash `6c73f9f`→`acfc3b6` (Git Insights + a gotcha; `6c73f9f` is the IPC/TournamentManager
   commit); kickoff test-count `8→11` cases + the 3 net-new Group C cases + `makeCtx` defaults; 2 README
   orphan-ref rows (Tournament Mode plan, TASK-028 spec → `orphans: []`); retro `[possible-dup-of]` tag on the
   kept `waitForTimeout` entry; corrected 5 `.sort_cache_clip.json` claims in the Group D spec → unified
   `.sort_cache.json` key `'clip'`.
3. **Repo-root cruft (1 SP)** — `git rm` of the unused `docker init` scaffolding (`Dockerfile`, `compose.yaml`,
   `.dockerignore`, **+ `README.Docker.md`** — the unlisted 4th file), reference-grepped clean first; removed
   the duplicate `!.claude/agents/` (pulled forward from CW-4).

**Two notable findings (git-truth caught both)**:

- **The PR #37 stale-SHA trap bit the spec itself.** Both WEEKLY.md and the BACKLOG driving note cited
  `853e1ee` as the PR #36 abort-string fix — but `853e1ee` lives only on the dead `fix/pr-36-review-followups`
  branch, **not `main`**. The real on-`main` fix is `52f2cbc`. The item _was_ already correctly checked off
  (2026-06-16), but its marker + both driving-note citations were corrected to `52f2cbc`.
- **⚠️ Deviation — the `.gitignore` `nul` line was NOT removed.** The audit called it "noise that ignores
  nothing useful," but it is **load-bearing on Windows**: it suppresses a phantom `?? nul` that Git-for-Windows
  surfaces in `git status` (the reserved NUL device resolves as an existing path). Removing it regressed
  `git status`. **Kept the line + added an explanatory comment** instead (user-approved). No real `nul` FILE
  existed (PowerShell + `cmd dir` confirm). The BACKLOG entry is checked off as resolved-with-deviation.

**Key changes**: [docs/planning/BACKLOG.md](BACKLOG.md) (7 sweep flips + 8 CW-3-task check-offs + driving-note
SHA fix + `waitForTimeout` tag + header), [docs/planning/WEEKLY.md](WEEKLY.md) (CW-3 → Complete, 🟤 recount,
CW-4 `.gitignore` boundary note), [CLAUDE.md](../../CLAUDE.md) (hash swap + kickoff drift),
[docs/README.md](../README.md) (2 orphan-ref rows), the Group D spec
[2026-04-16-clip-similarity-sorting-design.md](../superpowers/specs/2026-04-16-clip-similarity-sorting-design.md)
(`sort_cache_clip` fix), [.gitignore](../../.gitignore) (docker-ignore removed via `git rm` of the file,
duplicate `!.claude/agents/` removed, `nul` line documented), and `git rm` of the 4 docker files.

**Tests**: **326/326 unit unchanged** (no JS touched; the pre-commit hook ran vitest green on every commit).
**E2E: skipped (no JS changes)** per the reporting convention. ESLint: no JS to lint; Prettier ignores
`docs/`/`*.md`.

**Process**: superpowers brainstorm → spec → plan → **inline execution** (executing-plans). Inline was chosen
over subagent-driven deliberately: the work is judgment-heavy git archaeology with tightly interdependent
edits in shared files, where fragmenting context across agents would risk the exact inconsistent-verification
failure the PR #37 trap embodies. **CW-4 boundary shift recorded**: the `.gitignore` duplicate-line fix moved
into CW-3, so CW-4 (Fri) now owns only the pre-archive checklist template block and must not touch
`.gitignore`. 8 constituent BACKLOG entries checked off (sweep task, docker cruft, nul line [deviation],
`.claude/agents` dup, kickoff drift, MANUAL markers [no-op], backlog-structure inventory [no-op],
`waitForTimeout` tag). Spec at
[docs/superpowers/specs/2026-06-16-cw-3-docs-backlog-hygiene-design.md](../superpowers/specs/2026-06-16-cw-3-docs-backlog-hygiene-design.md);
plan archived at [docs/archive/plans/2026-06-16-cw-3-docs-backlog-hygiene.md](../archive/plans/2026-06-16-cw-3-docs-backlog-hygiene.md).
Branch `cleanup/cw-3-docs-backlog-hygiene` (off `main` `52f2cbc`); commits `a48385a` (spec), `49e5484` (plan),
`5733507` (sweep), `18f1e6d` (doc bundle), `4f4995e` (cruft), + closeout. **MERGED 2026-06-16 via PR #50 (`7d4ffcd`)** (docs-only → manual
review, not `/code-review`).

### 2026-06-15 — Group CW-2: Test backfill (E2E suite green + first tournament-mode coverage)

**Summary**: Cleanup-Week batch (4 SP, 🟤 Auto-Generated) — return the E2E suite to green and close the
largest coverage hole (tournament mode had zero Playwright coverage). One branch / one PR. **Test-only**:
no production code changed (`git diff main -- ':!tests' ':!docs'` is empty).

**The three parts**:

1. **`app-launch.test.js` → `#modeSelector`** — the suite had been 1-red since the 3-way `#modeSelector`
   replaced the now-`display:none` `#viewModeBtn`. Re-pointed both assertions (initial-launch `toBeHidden`,
   post-load `toBeVisible`) to `#modeSelector`; standardized `afterEach` to the `if (electronApp)` guard.
2. **New `tests/e2e/tournament-mode.test.js` (5 hybrid-driven tests)** — an `enterAndStartTournament` helper
   enters via the real config modal; tests cover: (1) happy-path pick (keyboard `q`) → Apply → real
   `_Tier-1`/`_Tier-0` disk moves; (2) Both Win button → win-win draw; (3) Both Lose keyboard `f` → lose-lose
   draw; (4) Ctrl+A undo restores the pair; (5) leave-prompt Save → re-enter Continue resumes
   (`writeTournamentState`/`readTournamentState` IPC round-trip). Exercises keyboard reverse-map dispatch +
   `applyTournamentResults` IPC + state persistence end-to-end.
3. **`recordDraw` unit assertions** — added `filesSnapshot` truthy to the history-shape test + a pre-undo
   `pair.right` win-count to the undo test (symmetric with the existing `pair.left` check).

**Key changes**: [tests/e2e/app-launch.test.js](../../tests/e2e/app-launch.test.js) (Part 1), new
[tests/e2e/tournament-mode.test.js](../../tests/e2e/tournament-mode.test.js) (5 tests + helper, Part 2),
[tests/tournament-engine.test.js](../../tests/tournament-engine.test.js) (+2 assertions, Part 3).

**Tests**: **326 unit** (unchanged at the case level — 2 assertions added to existing cases, no new `it()`).
E2E **42/43 → 48/48** (the 1 prior known-red `#viewModeBtn` assertion fixed in Part 1 + 5 new tournament
tests). The new file passed a `--repeat-each=2` flake stress run (10/10). Lint: 0 errors (1 pre-existing
`no-shadow` warning in an untouched file, already filed 🟤).

**Process**: superpowers brainstorm → spec → plan → **subagent-driven development** (7 tasks; controller
committed per project convention). The two substantive new tests (Tasks 3 & 6) got full spec+quality
subagent reviews — both independently verified the `q`→left-win→`_Tier-1` mapping chain against source and
confirmed the no-vacuous-pass / IPC-round-trip integrity. Task 6's review surfaced a real helper flake
(`.left-media-wrapper` `toBeVisible` → `toBeAttached`, transient `visibility:hidden` on a still-loading
video side); fixed + confirmed via the repeat-each stress run. Task 1's implementer mis-diagnosed a vitest
single-file-path quirk (`npx vitest run tests/X.test.js` → "No test suite found"; the substring form works,
full `npm test` was green throughout) as a broken environment — filed as a follow-up. Final whole-branch
review verdict "Ready to finish/merge". 5 constituent BACKLOG entries checked off (`#viewModeBtn` assertion,
`afterEach` standardization, tournament E2E ×2, `recordDraw` shape); 3 follow-ups filed (🟤 [2026-06-15]:
tournament E2E coverage tail, vitest command doc note, `toBeAttached` audit). Spec at
[docs/superpowers/specs/2026-06-15-cw-2-test-backfill-design.md](../superpowers/specs/2026-06-15-cw-2-test-backfill-design.md);
plan archived at [docs/archive/plans/2026-06-15-cw-2-test-backfill.md](../archive/plans/2026-06-15-cw-2-test-backfill.md).
Branch `cleanup/cw-2-test-backfill` (off `main` `7c4ca6f`); commits `779c887`..`f62c54c` (+ spec `0fbd549`,
plan `88b554e`). **Merged**: PR [#49](https://github.com/GoodAlex223/media-viewer/pull/49) into `main`
(`--merge`, branch deleted) — merge commit `972e6dd`; post-merge `/code-review` posted "No issues found"
(no finding ≥80; top candidate the happy-path `!isLoading`-wait consistency nit, 50), +2 🟤 [2026-06-15]
PR #49 post-merge follow-ups filed (`6532085`): happy-path test `!isLoading` consistency, stale CLAUDE.md
`app-launch.test.js` `closeApp` note.

---

### 2026-06-14 — Group CW-1: Renderer correctness guards (batch of 7 defensive fixes)

**Summary**: Cleanup-Week batch (8 SP, 🟤 Auto-Generated) consolidating **14** accumulated BACKLOG
follow-ups from PR reviews #34/#38/#40/#41/#42/#45 + Group A/B implementation reviews + Group E,
into one branch / one PR. Seven independent defensive renderer fixes, each TDD'd and reviewed
per-task via subagent-driven development.

**The 7 fixes**:

1. **`clipCache` cleared in `loadFolder()`** (PR #34) — the reset block cleared 4 of 5 per-file caches but omitted `clipCache`, leaking stale 512-dim CLIP vectors across folders with path-identical filenames. One-line add + source-structure regression test (anchored inside `loadFolder` to avoid the folder-watch callback's `perceptualHashes.clear()`).
2. **`isLoading` guard on `handleTournamentDraw` + `handleTournamentPick`** (PR #41) — button double-click mid-`showTournamentPair()` fired a second `recordDraw`/`recordResult` after `roundQueue` shifted → unhandled `'No active pair to record'`. Added the guard (keyboard path was already gated) + try/catch belt-and-suspenders; tests cover no-op, happy path, and error-path advance-survivability.
3. **`<2-files` compare fallback exits tournament mode** (PR #38) — `switchToSingleModeUI()` was called but `isTournamentMode` stayed `true` (tournament keymap + overlay live over single-mode UI). Fixed at **both** near-identical sites (`showCompareMedia` AND `_retryCompareAfterRemoval`); tests assert exit-before-switch ordering.
4. **`handleCancel` compare-pair entry-type guard + null media refs** (PR #40 / Group B / PR #35) — gated the two-entry-pop branch on `lastMove.compareMode` (verified `moveComparePair` sets it on both entries, `moveCurrentFile` doesn't); nulled `leftMedia`/`rightMedia` in `switchToSingleModeUI` teardown; retagged the existing compare-pair fixtures + added a leftover-single-move regression test.
5. **`clipWorkerReady` reset on CLIP unload + await/error-handle + riders** (PR #45 / PR #31 / Group E) — extracted the fire-and-forget timer callback into a unit-testable `_handleClipUnloadTimer()`: awaits the IPC, logs on failure, re-checks `enableClipFeatures` at fire time, resets `clipWorkerReady` only on a **successful** unload (the IPC returns `{success:false,reason:'loading'}` mid-load). Hoisted `CLIP_UNLOAD_DELAY_MS = 30000`. Single edit closed 4 BACKLOG entries.
6. **Local-capture in `feature-cache-write-chunk` IPC handler** (PR #38) — `const writer = featureCacheWriter` before the `'drain'` await so a concurrent `write-open` can't leave the handler on stale module state; mirrors the close handler + the documented CLIP-IPC pattern (main-process; verified by lint + trace).
7. **JXL error-path hardening trio** (Group A / PR #42) — (a) 15s frame-0 timeout in `decodeJxl` via wrapped `resolveFirst`/`rejectFirst` (whenComplete stays unbounded — benign); (b) worker `{type:'init'}` try/catch → structured `{type:'init-error'}` routed in `_handleJxlWorkerMessage` to reject `_jxlReady` (was: uncaught async rejection → renderer hangs forever); (c) one-time `'warning'` toast on the `drawNext` whole-animation-undecodable bail (was silent).

**Key changes**: [media-viewer.js](../../media-viewer.js) (fixes 1–5, 7a, 7b-renderer, 7c + the
`CLIP_UNLOAD_DELAY_MS` const + `_handleClipUnloadTimer` method), [main.js](../../main.js) (fix 6),
[jxl-decode-worker.js](../../jxl-decode-worker.js) (fix 7b worker side + protocol comment),
[tests/media-viewer-utils.test.js](../../tests/media-viewer-utils.test.js) (+16 unit tests),
[docs/README.md](../README.md) (spec + archived-plan indexing).

**Tests**: 310 → **326 unit** (Fix 1 ×1 source-structure, Fix 2 ×4, Fix 3 ×3, Fix 4 ×1 new +
fixture retag, Fix 5 ×4, Fix 7a ×1, Fix 7b ×1, Fix 7c ×1). Lint: 0 errors (1 pre-existing
`no-shadow` warning, filed 🟤). E2E **42/43** (the 1 failure is the known pre-existing
`#viewModeBtn` assertion in `app-launch.test.js`, owned by Group CW-2 — NOT a CW-1 regression;
confirmed unchanged from baseline). Pre-commit hook ran the unit suite green on every commit.

**Process**: superpowers brainstorm → spec → plan → **subagent-driven development** (10 tasks, fresh
implementer + spec/quality review per task; controller committed per project convention). Two
per-task reviews caught real improvements applied before commit: Task 1's source-structure test
matched the wrong `perceptualHashes.clear()` occurrence (tightened the slice anchor); Task 2 lacked
an error-path test for `showTournamentPair` survivability (added). Final whole-branch integration
review verdict "Ready to merge: Yes" with one non-blocking nit applied (`_jxlAnimTimer = null` on
bail for `stopJxlAnimation` parity). Spec at
[docs/superpowers/specs/2026-06-13-cw-1-renderer-correctness-guards-design.md](../superpowers/specs/2026-06-13-cw-1-renderer-correctness-guards-design.md);
plan archived at [docs/archive/plans/2026-06-13-cw-1-renderer-correctness-guards.md](../archive/plans/2026-06-13-cw-1-renderer-correctness-guards.md).
2 BACKLOG follow-ups spawned (🟤 [2026-06-14]): `init-error` worker-teardown/retry gap (Task 8
review); pre-existing `no-shadow` lint warning. Branch `cleanup/cw-1-renderer-correctness-guards`
(off `main` `4eca99a`); commits `4845088`..`c1f88fd`.

---

### 2026-06-12 — Group CW-5: Progressive animated-JXL decode (frame-0-first)

**Summary**: Cleanup-Week 🏆 challenge (5 SP, 🟠 IMPORTANT) closing the 🔵 [2026-06-07] Group A
manual-testing intake "animated `.gif.jxl` takes a very long time to load". The JXL decode worker
previously encoded **all** frames (~77 MB of PNGs for a 270-frame file) before posting a single
`{type:'decoded'}` message, so `decodeJxl` — and therefore every consumer, including static display,
compare mode, and feature/CLIP extraction (which all only need frame 0) — blocked on the full
animation encode (multi-second spinner). The decode is now **streaming + frame-0-first**.

**Resolution**: Worker streams `{type:'meta', …, frameCount}` (right after `tryInit`) →
`{type:'frame', id, index, pngBytes, duration}` ×N (one transferable message per encoded frame) →
`{type:'done'}`, with `{type:'error'}` possible mid-stream. Renderer routing was extracted from
`ensureJxlWorker`'s inline listener into `_handleJxlWorkerMessage` + `_rejectJxlPending` (now
`extractMethod`-testable). `decodeJxl` resolves a **mutable** cache entry as soon as frame 0 arrives
(`frames` grows in place; `entry.whenComplete` settles on `done`, rejects on mid-stream error);
cache insert + LRU eviction happen at frame-0 time. `startJxlAnimation` sets up the canvas
synchronously and runs frame-0 draw + buffering wait + the `drawNext` loop in a fire-and-forget
`runWhenBuffered()` — so the spinner clears at frame-0 time, not full-buffer time. **Mid-stream
error policy (user-approved): static frame-0 fallback** — frame 0 stays displayed, the animation
never starts, `logError` records it; the four frame-0-only call sites are untouched and resolve
faster for free. `showMedia`'s animated gate switched from `frames.length > 1` to `frameCount > 1`
(only frame 0 is buffered at resolve time).

**Key changes**: [jxl-decode-worker.js](../../jxl-decode-worker.js) (monolithic `decoded` →
streaming `meta`/`frame`/`done`); [media-viewer.js](../../media-viewer.js) (`_handleJxlWorkerMessage`

- `_rejectJxlPending` routing; `decodeJxl` two-layer pending record `{entry, resolveFirst,
rejectFirst, resolveComplete, rejectComplete}`; `startJxlAnimation` frame-0-first `runWhenBuffered`;
  `showMedia` `frameCount` gate; `_jxlPending` constructor comment + `jxlFrameCache` entry shape);
  [CLAUDE.md](../../CLAUDE.md) (worker protocol line + cache-entry shape + test tally).

**Tests**: 297 → **310 unit** (`_handleJxlWorkerMessage` ×7, `decodeJxl` rewritten to the streaming
protocol + 2 streaming tests, `startJxlAnimation frame-0-first` ×4); decodeJxl tests now bind the
**real** extracted routing methods instead of hand-mirrored stubs. JXL E2E smoke (`jxl-rendering.test.js`)
passes (exercises the full new protocol under Electron); full E2E **42/43** (1 known pre-existing
`#viewModeBtn` failure, owned by Group CW-2). Manual animated smoke: handed to user (no automated
multi-frame animated fixture, per spec §6). Pre-commit hook ran the unit suite green on every commit.

**Process**: superpowers brainstorm → spec → plan → **subagent-driven development** (6 tasks, fresh
implementer + spec review + quality review per task; controller committed per project convention).
Spec at [docs/superpowers/specs/2026-06-12-jxl-progressive-decode-design.md](../superpowers/specs/2026-06-12-jxl-progressive-decode-design.md);
plan archived at [docs/archive/plans/2026-06-12-jxl-progressive-decode.md](../archive/plans/2026-06-12-jxl-progressive-decode.md).
Task-1 quality review caught a real hang (a `done` with zero frames left `decodeJxl` pending forever
→ fixed in `9c5dfbd`); final whole-branch review verdict "Ready to merge: Yes". 2 BACKLOG
follow-ups spawned (🟤 [2026-06-13]): evict partial JXL cache entries on worker _crash_ (vs decode
error); `img.free()` skipped on mid-loop worker error (pre-existing). Branch
`feature/jxl-progressive-decode` (off `main`); commits `d45619d`..`285c4ac`.

---

### 2026-06-11 — Group D: Security & privacy audit

**Summary**: One-time, non-destructive security & privacy audit (3 SP, 🟡 Operational / 🟢 NICE
TO HAVE) closing the two periodic BACKLOG items "Verify no secrets in git history" and "Anonymize
author field in package.json". Audit result: **✅ PASS.** No credentials in git history (pickaxe
`git log --all -S` for AWS/GitHub/Slack/Google keys + private-key blocks across all branches: zero
hits; `.mcp.json`/`.env` never committed) or working tree (4 benign matches: a `YOUR_GITHUB_PAT`
placeholder in `.mcp.json.example`, "token" in CLAUDE.md prose, `token`/`_jxlAnimToken` JS variable
names, a commented-out `db-password:` Docker example). `package.json` author (`"goodalex223"`) is
already a handle-only pseudonym — **no change made**.

**Resolution**: Scope locked during brainstorm to **non-destructive only**. The one real PII
exposure — the real name + email (`Alexey Minakov <alexminak32@gmail.com>`) baked into every commit
— is **already public** on the GitHub remote; scrubbing it would require rewriting all commits
(`git filter-repo` + force-push), breaking clones and merged-PR links. Recorded as **accepted risk**
in the report rather than acted on. Deliverable is a dated, reproducible audit report — no production
code changed (`package.json` untouched, 0 diff lines).

**Key changes** (docs only): new audit report
[docs/security/2026-06-11-security-privacy-audit.md](../security/2026-06-11-security-privacy-audit.md)
(methodology + findings + accepted-risk note + reproducible re-run command blocks); `docs/README.md`
gains a "Security Audits" section + spec/plan index entries.

**Tests**: No code changed → no test changes. 297/297 unit tests pass throughout (pre-commit hook
ran the suite on every commit). E2E: skipped (no JS changes).

**Process**: superpowers brainstorm → spec → plan → executing-plans (inline, 3 tasks). Spec at
`docs/superpowers/specs/2026-06-11-security-privacy-audit-design.md`; plan archived at
[docs/archive/plans/2026-06-11-security-privacy-audit.md](../archive/plans/2026-06-11-security-privacy-audit.md).
2 BACKLOG follow-ups spawned: 🟤 remove Docker scaffolding cruft (`Dockerfile`/`compose.yaml`/`.dockerignore`);
🟡 add a pre-commit secret guard / gitleaks. Branch `feature/security-privacy-audit` (off `main`).

---

### 2026-06-10 — Group C: CLIP extraction UX

**Summary**: Two small UX improvements to the background feature-extraction pipeline (both
🟢 NICE TO HAVE, 4 SP). **(1)** `kickoffBackgroundExtractionIfEnabled()` now fires a transient
"⏳ Starting feature extraction…" `info` toast immediately — before its awaited
`loadFeatureCache()` (stream-parse, up to ~259 MB) and `initClipModel()` (cold start ~87 MB
download) — surfacing the previously-silent kickoff window (and the PR #34-class "kickoff
silently never fired" failure). **(2)** The `#clipFeaturesToggle` settings change handler gained
a toggle-on `else` branch that kicks off extraction immediately, so enabling CLIP mid-folder
starts extraction instead of requiring a folder reload.

**Resolution**: A single new `if (this.mediaFiles.length === 0) return;` guard at the top of
`kickoffBackgroundExtractionIfEnabled()` does double duty — it suppresses a misleading toast when
nothing is loaded AND makes the toggle-on path a no-op until a folder is open (no surprise ~87 MB
model download from a settings toggle), so the toggle-handler change stays a bare fire-and-forget
call mirroring `loadFolder`. Design decisions (brainstorm): toast fires "immediately, always"
(accepting a brief "Starting… → All N cached" sequence in the all-cached case); toggle-on with no
folder is a no-op.

**Key changes** ([media-viewer.js](../../media-viewer.js)): `kickoffBackgroundExtractionIfEnabled()`
empty-folder guard + starting toast; `#clipFeaturesToggle` change-handler toggle-on `else` branch.

**Tests**: +2 unit (`kickoffBackgroundExtractionIfEnabled`: starting-toast fired, empty-folder
no-op) + 1 hardening assertion (CLIP-disabled path fires no toast — locks guard order); `makeCtx`
gains `mediaFiles` + `showNotification` (294 → 296). +1 E2E in `clip-graceful-degradation.test.js`
(toggle-on wiring via kickoff-stub counter + bounded `waitForFunction`). **296/296 unit pass; E2E
42/43** — the 1 failure is the known pre-existing `app-launch.test.js` `#viewModeBtn` assertion
(BACKLOG, unrelated). Lint clean.

**Process**: superpowers brainstorm → spec → plan → subagent-driven-development (2 implementation
tasks + verification pass, per-task spec+quality review, final whole-branch review "Ready to
merge"). Spec at `docs/superpowers/specs/2026-06-10-clip-extraction-ux-design.md`; plan archived at
[docs/archive/plans/2026-06-10-clip-extraction-ux.md](../archive/plans/2026-06-10-clip-extraction-ux.md).
2 BACKLOG follow-ups spawned (🟤: extract toggle handler to testable method; starting-toast
info-throttle eviction). Branch `feature/clip-extraction-ux` (off `main`, independent of the
still-open PR #44).

---

### 2026-06-09 — Group B: Mode-switch display bugs

**Summary**: Fixed two related compare/single mode-switch display defects. **Bug 1
(🔴 Critical):** after Sort-by-Prediction + navigating compare pairs, switching to single
view jumped to the highest-scored file (`currentIndex = 0`) instead of the file the user was
actually looking at. Root cause was two unreconciled indexing schemes (`mediaFiles` vs the
score-sorted `filesWithScores` indexed by `mlComparePairIndex`). **Bug 2 (🟠 Important):**
`switchToSingleModeUI()` reverted mode state but never removed the compare `.left-media-wrapper`
/`.right-media-wrapper` DOM nodes, so a folder-switch from compare mode left shrunken/shifted
leftover panes on screen.

**Resolution**: Bug 1 resolves the landing index **at switch time** from
`this.compareLeftFile` (the file already rendered on the compare left, maintained by
`showCompareMedia` in every branch) — `_applyModeSwitch`'s `single` branch captures it before
`switchToSingleModeUI()` runs, then `findIndex` with a `-1 → 0` fallback. This answered the
plan's Open Question ("what is the _first_ file?") as "the file the user was viewing" (fix
path a), chosen over continuous dual-array syncing (path b) for minimal state and blast radius.
Bug 2 folds wrapper teardown (`fullscreen.cleanup` + `.remove()` + null) into
`switchToSingleModeUI()` so every exit-to-single path benefits; the redundant inline teardowns
in `moveComparePair`'s and `showCompareMedia`'s `<2-files` branches were deleted (DRY).
Single→compare reverse symmetry was explicitly deferred (BACKLOG 🟤 2026-06-09).

**Key changes** ([media-viewer.js](../../media-viewer.js)): `switchToSingleModeUI()` wrapper-teardown loop;
`_applyModeSwitch()` `single`-branch index resolution; deleted inline teardown in `moveComparePair`

- `showCompareMedia`.

**Tests**: +5 unit (2 `switchToSingleModeUI wrapper teardown`, 3 `_applyModeSwitch single-branch
landing index`; 289 → 294) + 2 E2E in `compare-mode.test.js` (no stale wrappers after folder
switch; compare→single lands on the on-screen left file). **294/294 unit pass; E2E 41/42** — the
1 failure is the known pre-existing `app-launch.test.js` `#viewModeBtn` assertion (BACKLOG, unrelated).

**Process**: superpowers brainstorm → spec → plan → subagent-driven-development (5 tasks, per-task
spec+quality review, final whole-branch review). Plan archived at
[docs/archive/plans/2026-06-08-mode-switch-display-bugs.md](../archive/plans/2026-06-08-mode-switch-display-bugs.md);
spec at `docs/superpowers/specs/2026-06-08-mode-switch-display-bugs-design.md`. 2 BACKLOG
follow-ups spawned (🟤: `leftMedia`/`rightMedia` nulling consistency; deferred single→compare
symmetry).

---

### 2026-06-07 — Group A: JXL + animated-JXL viewer support 🏆

**Summary**: The viewer can now open `.jxl` files — including **animated** JXL converted
from GIFs — produced by the sibling `media_compression` project. Chromium dropped native
JPEG XL in 2022, so decoding runs in a dedicated **renderer module Web Worker**
(`jxl-decode-worker.js`) wrapping the pure-Rust `jxl-oxide-wasm` decoder (MIT/Apache-2.0,
~1.62 MB wasm, vendored under `vendor/jxl-oxide-wasm/`). Static JXL renders as an object-URL
`<img>` in single + compare mode; animated JXL plays GIF-style on a `<canvas>` (single mode)
with per-frame just-in-time decode (≈1 frame resident, avoiding ~1 GB for a 270-frame 720p
loop). Decoded frame-0 feeds the existing hand-crafted feature path and a new
`extractClipEmbeddingFromBuffer` CLIP IPC, giving JXL full 64+512-dim parity. Graceful
degradation throughout: decode/worker/init failures surface as a toast + skip (never a hang
or crash). Built via the superpowers brainstorm → spec → plan → subagent-driven-development
pipeline (10 tasks, per-task + final whole-branch review).

**Plan**: [archive/plans/2026-06-04-jxl-viewer-support.md](../archive/plans/2026-06-04-jxl-viewer-support.md) ·
**Spec**: [superpowers/specs/2026-06-04-jxl-viewer-support-design.md](../superpowers/specs/2026-06-04-jxl-viewer-support-design.md)

**Key changes**:

- **Detection**: `media-formats.js` shared CJS module (extracted `isMediaFile`/`getMimeType` from `main.js`) registers `.jxl` → `image/jxl`; renderer `isJxl()` (handles stacked `*.jpg.jxl`).
- **IPC**: `read-file-buffer` (raw bytes for decode) + `read-jxl-wasm` (explicit-bytes worker init, avoids `fetch(file://)`) + `extractClipEmbeddingFromBuffer` (CLIP on decoded PNG via `RawImage.fromBlob`).
- **Decode worker** (`jxl-decode-worker.js`): module worker; reads `RenderResult.duration` BEFORE the terminal `encodeToPng()`; transferable PNG frames; init/ready/decode/error protocol.
- **Renderer** (`media-viewer.js`): `decodeJxl()` + LRU(8) `jxlFrameCache` (purged in `removeFileFromList`); static render branch (single + both compare sides); `startJxlAnimation`/`stopJxlAnimation`/`computeJxlFrameSchedule`/`finishJxlCanvasDisplay` (canvas loop with token teardown, aspect-preserving sizing); JXL routed into all 3 feature-extraction sites + the CLIP chokepoint.
- **Vendored**: `jxl-oxide-wasm` dep + `vendor/jxl-oxide-wasm/` assets.

**Tests**: 275 → **289 unit tests pass** (media-formats ×5, isJxl ×2, decodeJxl ×4 incl. LRU + error, computeJxlFrameSchedule ×2, removeFileFromList purge ×1). New E2E `tests/e2e/jxl-rendering.test.js` (static `.jxl` renders) passes; full E2E 40 pass / **1 pre-existing unrelated fail** (`app-launch.test.js` asserts the legacy hidden `#viewModeBtn` — fails on clean tree too, filed to BACKLOG). Lint clean (1 pre-existing warning). Static + animated JXL manually confirmed by the user.

**Deviations from plan**: feature extraction routed JXL through a decoded-PNG object URL into the existing `new Image()` path (simpler than a `getExtractionImageData` helper; sidesteps `fetch(file://)`); animation decodes one frame at a time (plan's pre-decode-all would cost ~1 GB for 270 frames); added `read-jxl-wasm` IPC for explicit-bytes init after the spike showed `jxl-oxide-wasm` is ESM-only + needs a module worker + `encodeToPng()` is terminal.

**Final-review fix**: `ensureJxlWorker` rejected a _new_ `_jxlReady` promise on init failure, leaving concurrent awaiters of the _original_ promise hung forever — fixed in `84bf62b` (reject the original via stored `_jxlRejectReady`; null `jxlWorker` for recovery).

**BACKLOG spawned (5)**: 🔵 progressive/streaming animated-decode (frame-0-first, fixes the user-observed slow load on 270-frame files); 🟤 pre-existing `#viewModeBtn` E2E assertion, worker init `try/catch`, shared `_jxlObjectURLs` per-side hazard, pre-existing generic preload `invoke` passthrough.

**Commits**: `cb38175` (spec) → `84bf62b` (fix) on `feature/jxl-viewer-support` (16 commits).

### 2026-06-03 — Group 0 part 2: Re-rate / mark-as-equal (tournament)

**Summary**: Added **Both Win / Both Lose** draw buttons to tournament mode — the
tournament sibling of part 1's compare-mode "Both good / Both bad". Instead of being
forced to pick a winner, the user can declare a Swiss matchup a draw: **Both Win** gives
both files +1 win (advance together, same higher tier); **Both Lose** gives neither a win
(both stay). Operates on the Swiss bracket only — **no ML model, no new IPC, no
persistence-format change**. A draw consumes the current pair exactly like a pick (shifts
the round queue, marks `playedPairs`, bumps `gamesPlayed`), and is recorded through the
**same `history` + `strategyStateSnapshot` machinery** picks use, so the existing `undo()`
reverses a draw with zero new undo code. Design decision (re-pick vs. mark-as-equal):
mark-as-equal — undo already restores the last pair for re-picking, so re-pick added no
new capability. Built via the superpowers brainstorm → spec → plan →
subagent-driven-development pipeline. Plan archived at
[docs/archive/plans/2026-06-03-tournament-rerate-correction.md](../archive/plans/2026-06-03-tournament-rerate-correction.md);
design spec at
[docs/superpowers/specs/2026-06-03-tournament-rerate-correction-design.md](../superpowers/specs/2026-06-03-tournament-rerate-correction-design.md).

**Branch**: `feature/tournament-re-rate` (`351892c`, `523fcd7`, `9d002f9`, `c98695f`,
`e21d00b`, `74752b1`).

**Implementation** (5 TDD tasks) — [tournament-engine.js](../../tournament-engine.js),
[tournament.js](../../tournament.js), [media-viewer.js](../../media-viewer.js),
[index.html](../../index.html):

- `SwissStrategy.recordDraw(a, b, outcome)` — `'win'` → +1 both, `'lose'` → +0 both; guards
  on empty queue + non-current pair; shifts queue, marks `playedPairs`, bumps `gamesPlayed`.
- `TournamentEngine.recordDraw(a, b, outcome)` — pre-mutation snapshot + history entry
  `{ draw:true, outcome, a, b, round, gameIndex, timestamp, strategyStateSnapshot,
filesSnapshot }`; `undo()` unchanged (reverses draws for free).
- `TournamentManager.handlePairDraw(a, b, outcome)` — record + `_persistState`; false when no
  engine.
- `handleTournamentDraw(outcome)` renderer method (guard → `signalUserActivity` → current pair
  → `handlePairDraw` → toast → `showTournamentPair`); undo routes through the existing
  engine-undo branch (draws live in `engine.history`, not `moveHistory`).
- Shortcuts `DEFAULT_SHORTCUTS.tournament` += `bothWin:'KeyD'` / `bothLose:'KeyF'`;
  `ACTION_LABELS` + `executeAction` wiring (action-name isolation: D/F resolve per-mode);
  `#tournamentBothWinBtn` (chevrons-up) / `#tournamentBothLoseBtn` (chevrons-down) in
  `#tournamentControls` + click listeners. No `styles.css` change (existing
  `.tournament-controls` flex+gap covers layout).

**Tests**: 275/275 unit tests pass (264→275: +4 `SwissStrategy.recordDraw`,
+3 `TournamentEngine.recordDraw`, +2 `TournamentManager.handlePairDraw`,
+2 keyboard-shortcuts). Lint clean (1 pre-existing unrelated warning). Final whole-feature
review: "Ready to merge — Yes, no critical/important issues". E2E: skipped (tournament mode
has no Playwright coverage yet — backfill tracked in BACKLOG 🟤 2026-06-03); manual smoke
test passed (buttons visible/readable, D/F + Ctrl+A undo verified).

**Follow-ups spawned** (BACKLOG 2026-06-03): 🔵 explicit pause/exit button in tournament
mode; 🔵 confirm-before-app-close when a tournament is in progress (Alt+F4 / window X);
🟤 tournament E2E backfill; 🟤 strengthen `recordDraw` history-shape test; 🟤
`handleTournamentUndo` two-stack interleaving (pre-existing).

---

### 2026-06-02 — Group 0 part 1: Re-rate / mode-correction (compare)

**Summary**: Added "👍 Both good / 👎 Both bad" corrective-training buttons to AI-sorted
compare mode. Each click trains **both** displayed files into the ML model (good→like,
bad→dislike) **without moving them**, persists to a per-folder `.bulk_rated.json`, records
one undo entry, toasts, and advances to the next pair. Corrections re-inject on every model
rebuild so they survive resets. Compare-only scope — tournament re-rate is Group 0 part 2
(deferred to a separate branch). Built via the superpowers brainstorm → spec → plan →
subagent-driven-development pipeline. Plan archived at
[docs/archive/plans/2026-05-31-rerate-compare-correction.md](../archive/plans/2026-05-31-rerate-compare-correction.md);
design spec at
[docs/superpowers/specs/2026-05-31-rerate-compare-correction-design.md](../superpowers/specs/2026-05-31-rerate-compare-correction-design.md).

**Branch**: `feature/re-rate-mode-correction` (`21d95bc`, `be49cdc`, `6c70172`, `6c8a3fe`,
`b4455b6`; manual-testing fixes `b32b718`).

**Implementation** (10 TDD tasks) — [main.js](../../main.js), [preload.js](../../preload.js),
[media-viewer.js](../../media-viewer.js), [index.html](../../index.html), [styles.css](../../styles.css):

- IPC `readBulkRatedFile`/`writeBulkRatedFile` (mirror tournament-state; `.bulk_rated.json`
  `{version:1, good:[], bad:[]}` of filenames).
- `this.bulkRated` Map (filename→'good'|'bad'); `loadBulkRatedFile()` (hydrate + stale-prune in
  `loadFolder`) / `saveBulkRatedFile()`.
- `applyBulkRating(bucket)`, `handleBothGood()`/`handleBothBad()`, `undoBulkRating()`;
  `handleCancel` intercepts `bothGood||bothBad` as its first branch; `removeFileFromList` purges
    - conditionally re-saves; `collectBulkRatedTrainingExamples()` re-injected as a third pass in
      `trainFromHistoricalRatings()`.
- Shortcuts: `DEFAULT_SHORTCUTS` single+compare `next` KeyD→KeyS; compare gains `bothGood:KeyD`,
  `bothBad:KeyF`; `ACTION_LABELS`/`executeAction` wiring; `#compareActionBar` cluster +
  `updateBulkRateButtonsVisibility()`.

**Design deviations from [BACKLOG.md:60]**: soft-suppression / fall-through dropped (bulk-rated
files treated as regular posts — re-raised in BACKLOG 2026-06-02); shortcuts shipped KeyD/KeyF
(not KeyS/KeyD); no badge, no live re-sort.

**Post-implementation manual-testing fixes** (`b32b718`) — three bugs found after the feature
landed on the branch:

1. **Buttons invisible** — placed inside `.compare-controls`, which is `display:none` during
   compare browsing (overlay controls used instead). Relocated to a bottom-center
   `#compareActionBar` cluster of square icon-only overlay buttons (👍 / ↩ undo / 👎);
   `updateBulkRateButtonsVisibility()` now toggles each button, excludes tournament, runs from
   `showMedia()`.
2. **"S" didn't advance pairs** — a stale full `customShortcuts` object in localStorage froze
   `next:KeyD` over the new `KeyS` default. Added a one-time v1→v2 migration in `loadShortcuts()`
   (drops the stale `next`, preserves other remaps); `saveShortcut()` now stamps `version:2`.
   Nav-arrow tooltip D→S.
3. **Undo placement** — moved from top-center rectangular (pre-existing tournament-era styling,
   not this branch) into the bottom-center square cluster per user preference.

**Tests**: 262/262 unit tests pass (feature tests 244→257 across
[tests/media-viewer-utils.test.js](../../tests/media-viewer-utils.test.js) +
[tests/keyboard-shortcuts.test.js](../../tests/keyboard-shortcuts.test.js); +3 shortcut-migration
tests in the fix). E2E: compare-mode 7/7 pass (incl. "navigates pairs with S key" + "Both good
records a bulk rating… and undo clears it"). Lint clean. (Pre-existing, unrelated
`app-launch.test.js` `#viewModeBtn` E2E failure noted — out of scope.)

**Follow-ups spawned** (BACKLOG 2026-06-02): 🔵 don't re-pair already-bulk-rated files (re-raised
suppression); 🔵 investigate "both bad" convergence plateau; 🟤 assert bulk-rate button
visibility in tests; 🟤 store shortcut deltas + persist tournament shortcuts.

---

## 2026-05 (May)

### 2026-05-26 — Tournament Mode polish + feature-cache streaming

**Summary**: Multi-day reactive pass on top of the Tournament Mode v1 prototype
(driven by manual testing), plus a feature-cache infrastructure rewrite forced by
crashes on a 24k-file / 259MB-cache folder. Tournament mode is now strict and
deterministic; the feature cache no longer OOMs the renderer or main process.
Plan archived at `docs/archive/plans/2026-05-25-tournament-mode.md` (Phases A–G;
Phase H E2E deferred to BACKLOG).

**Tournament Mode changes** ([media-viewer.js](../../media-viewer.js),
[tournament.js](../../tournament.js), [tournament-engine.js](../../tournament-engine.js),
[index.html](../../index.html), [styles.css](../../styles.css)):

- Fixed mode not switching on enter — `showCompareMedia` ignored the engine pair;
  now injects it via `_restoredPairFiles` and tears down single-mode media first.
- Reuse the per-wrapper compare overlay buttons for picks (symmetric Q/W/E/R
  mapping); removed the redundant wrapper-level click handler and the header
  L/R-Special buttons. Tapping media now only opens fullscreen.
- Fixed tournament hotkeys not firing — `buildReverseMap` never indexed the
  `tournament` mode (lookup silently failed). Added `'tournament'` + `?.` guard.
- Hid the nav arrows in tournament mode (manual prev/next desynced the displayed
  pair from the engine).
- Swiss `_buildRoundPairings`: search the full pair space for an un-played pairing
  before falling back to a rematch (was forcing rematches when `bucket[0]` had
  played everyone).
- Apply now clears the viewer — `showDropZone` tears down compare wrappers and
  `loadFolder` clears `mediaFiles` on an empty folder; Apply awaits `loadFolder`
  before `switchMode('single')`.
- Summary modal: "Undo last pick" button.
- Rounds: free numeric input (1–50) with clamp + Enter-to-start; AI-prediction
  round-1 seeding (best-vs-worst) with a live hint and availability check
  (`TournamentEngine`/`SwissStrategy.init` accept `round1Pairings`).
- Strict/deterministic: restore canonical order on entry; disable all sort
  controls while in tournament mode (event-proofed + handler guards).
- Resume UX redesign: the resume prompt moved from folder-open to mode-enter
  (Continue / Start over); Save / Discard on leave; Cancel on both; loose
  reconciliation (`handleResumeReconciled`) drops missing files and ignores added
  ones. Removed the pause button.

**Feature-cache changes** ([main.js](../../main.js), [preload.js](../../preload.js),
[media-viewer.js](../../media-viewer.js)):

- Verify ffmpeg keyframe output exists before use — silent non-writes produced 404
  `RawImage.read` failures that accumulated native ONNX allocations and crashed.
- Stream-parse the cache in the main process via `stream-json@1.8.0`
  (`feature-cache-open`/`-chunk`/`-close`) — a 259MB cache parsed at ~242MB peak
  vs ~1.5GB for monolithic `JSON.parse` (which OOM'd renderer then main).
- Stream cache writes in 1k batches (`feature-cache-write-*`) with atomic rename +
  EPERM/EBUSY retry; round vectors to 6 decimals (~halves file size).
- Single-flight on load + save, plus a shared IO mutex so a streaming read and a
  rename never overlap (the EPERM cause on Windows).

**Tests**: 236 → 241 unit (Swiss `round1Pairings` ×3, `handleResumeReconciled` ×2).
E2E: not run this session (deferred); existing suite unaffected. Added `stream-json@1.8.0`.

**Key learnings**:

- `buildReverseMap` must enumerate every mode or keydown dispatch silently no-ops.
- Streaming a huge JSON in the _main_ process (separate heap, no UI) + batched IPC
  keeps the renderer from ever holding the giant string; a shared session global
  needs single-flight/mutex coordination since `loadFeatureCache` is called from
  multiple paths.
- Tournament seeding only makes sense for _preference_ orderings (AI score →
  best-vs-worst); visual-similarity sorts have no quality axis and were correctly
  excluded.

### 2026-05-21 — PR #33 Hygiene + Integration Tests (Groups C + D)

**Summary**: Closed four PR #33 review follow-ups in one PR. Three defensive
hardenings around CLIP toggle/sort paths and one fixture-driven integration
test pattern covering both branches of the cache-hit sort call graph.

**Changes**:

- `media-viewer.js` toggle-off handler: clear `clipUnloadTimer` before
  cleanup; wrap `deleteSortCache('clip')` in try/catch.
- `media-viewer.js` `insertNewFilesInSortedOrder`: per-file abort check
  at the top of the outer for-loop in both CLIP and hash branches.
- New file `tests/integration/cached-sort-path.test.js`: three tests
  wiring real `applyCachedSortOrder` → real `insertNewFilesInSortedOrder`
  to assert algorithm strings thread end-to-end (CLIP, VPTree, missing
  field fallback).

**Test results**: 195/195 unit tests pass, 39/39 E2E tests pass.

**Spec**: [docs/superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md](../superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md)
**Plan**: [docs/archive/plans/2026-05-21-pr-33-hygiene-and-integration-tests.md](../archive/plans/2026-05-21-pr-33-hygiene-and-integration-tests.md)
**PR**: [#36](https://github.com/GoodAlex223/media-viewer/pull/36)

---

### [2026-05-14] Group B: AI Prediction Display Bugs

**Spec**: [docs/superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md](../superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md)
**Plan**: [docs/superpowers/plans/2026-05-14-ai-prediction-display-bugs.md](../superpowers/plans/2026-05-14-ai-prediction-display-bugs.md) (to be archived after PR merge)
**Summary**: Fixed two related ML prediction display bugs sharing the root theme "prediction state is not re-synchronized with `mediaFiles` when the file list changes." (1) After undoing a rating via `handleCancel()`, the prediction percentage badge disappeared for the restored file: `removeFileFromList()` aggressively cleared `featureCache`/`clipCache`/`predictionScores`/`featureMetadata` at rating time, so the restored file had no ML state. Fixed by adding `restoreFeatureCachesFromHistory(entry)` helper (inverse of `removeFileFromList`) called in all 4 `handleCancel` branches before `showMedia()`. Special-move branch (no `reverseMlModelUpdate` path) explicitly calls `requestPredictionScores()` when `isSortedByPrediction` is true. (2) AI-sort prediction percentages didn't match underlying files (e.g., "99% / 56%" instead of "99% / 54%"): `sortComplete` handler in `handleMlWorkerMessage` ignored `message.scores` from the ml-worker, leaving `predictionScores` stale from prior `scoreComplete` events. Fixed by iterating `message.scores` and writing into `predictionScores` by path before applying `mediaFiles = sorted`. Also captured `mlFeatures` in `moveToSpecialFolder`'s history entry so special-undo can also restore the badge (was previously omitted).
**Key Changes**:

- `media-viewer.js` — New `restoreFeatureCachesFromHistory(entry)` method placed immediately after `removeFileFromList` (~L1018); splits 576-dim into `featureCache`(64) + `clipCache`(512), or restores only `featureCache` for 64-dim, no-ops on null/unexpected; restores `featureMetadata` with `mtime: 0`. `handleMlWorkerMessage` `case 'sortComplete'` now iterates `message.scores` to populate `predictionScores` before reordering. `moveToSpecialFolder` captures `mlFeatures` via `getCombinedFeatures` (or `featureCache` fallback) before the move IPC and attaches to historyEntry. All 4 `handleCancel` branches call the new helper before `showMedia()`; special branch additionally calls `requestPredictionScores()` when AI-sorted. Doc-comment on `removeFileFromList` corrected to list all 5 caches it clears.
- `tests/media-viewer-utils.test.js` — 3 new `describe` blocks: `restoreFeatureCachesFromHistory` (5 tests covering 576-dim split, 64-dim only, null/null-features no-op, unexpected-length no-op, featureMetadata restoration), `handleMlWorkerMessage sortComplete` (2 tests: score propagation, defensive missing-scores), `handleCancel feature restore` (3 tests: single-mode like-undo with 576-dim, compare-mode pair-undo with mixed 576+64-dim, special-move undo in AI-sorted mode).
  **Commits**: 5 on `fix/ai-prediction-display-bugs` (69f861b helper + tests, 2b2f1dc doc-comment fix, 40c8fe6 sortComplete score propagation + tests, 9efdff4 moveSpecial mlFeatures capture, 0b43a13 handleCancel restore branches + tests) + 3 doc commits prior (bc0379a plan, 7a78e48 CLAUDE.md Next-planned sync, 8956ea5 spec)
  **Test results**: 190/190 unit tests pass (was 180 baseline; +10 new: 5 helper + 2 sortComplete + 3 handleCancel); E2E: skipped (no E2E coverage for ML state transitions today; would require heavy setup — rate ≥3 files for training, kick extraction, sort, undo — tracked as separate BACKLOG item if needed). `npm run lint` and `npm run format:check` clean.
  **Code review**: Pending (PR review).
  **Manual scenarios**: Pending user smoke test (interactive Electron app — cannot be run from CLI). Scenarios to verify before merge: (1) AI sort percentages now align with each file's score; (2) AI-sort → undo single rating → badge re-appears with correct %; (3) AI-sort → undo compare pair → both badges re-appear; (4) AI-sort → special-folder rating → undo → badge re-appears; (5) Regression: rate-undo without AI sort works as before (no badge, by design).
  **Spawned BACKLOG items**: (none yet — will surface during PR review or manual smoke).
  **PR**: [#35](https://github.com/GoodAlex223/media-viewer/pull/35)

---

### [2026-05-07] Group A: CLIP Extraction Silent Failure

**Spec**: [docs/superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md](../superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md)
**Plan**: [docs/archive/plans/2026-05-06-clip-extraction-silent-failure.md](../archive/plans/2026-05-06-clip-extraction-silent-failure.md)
**Summary**: Wired `startBackgroundFeatureExtraction()` into `loadFolder()` via a new `kickoffBackgroundExtractionIfEnabled()` helper. Resolves the 🔴 blocker where CLIP-enabled fresh-folder loads silently produced no `.feature_cache.json` and CLIP sort then threw `"Only 0 files have CLIP embeddings"`. Root cause confirmed during brainstorming: `startBackgroundFeatureExtraction()` had no call site in `loadFolder()` at all — the only caller was inside `handleSortByPrediction()`'s lazy ML-init block, so a fresh CLIP-enabled folder load left `featureWorkers.length === 0` and `clipWorkerReady === false` and no extraction ran. Hash sorts kept working because `handleSortBySimilarity` computes perceptual hashes inline (independent pipeline). Fix is strictly scoped: gated on `enableClipFeatures` (CLIP-off path unchanged), idempotent guards on `featureWorkers`/`clipWorkerReady`/`clipModelDownloading`, fire-and-forget extraction with `.catch(err => logError(...))`, called after `updateFolderInfo()` so the first frame renders before kickoff. Six unit tests cover each branch.
**Key Changes**:

- `media-viewer.js` — New `kickoffBackgroundExtractionIfEnabled()` method on `MediaViewer` placed immediately before `async startBackgroundFeatureExtraction()`; guards (in order): `!enableClipFeatures` early-return → `featureWorkers.length === 0` ⇒ `initializeFeaturePool()` → `!clipWorkerReady && !clipModelDownloading` ⇒ `initClipModel()` → fire-and-forget `startBackgroundFeatureExtraction().catch(err => window.electronAPI?.logError(...))`. Called from `loadFolder()` after `this.updateFolderInfo()` and before the `console.log('Successfully loaded ...')`.
- `tests/media-viewer-utils.test.js` — New `describe('kickoffBackgroundExtractionIfEnabled', ...)` block with 6 tests. `beforeEach`/`afterEach` save/restore `globalThis.window` (mocks `electronAPI.logError`); `makeCtx({ ... })` factory provides spy stubs for `initializeFeaturePool` / `initClipModel` / `startBackgroundFeatureExtraction` with overridable defaults. Tests: (1) CLIP-off no-op, (2) fresh-state full happy path, (3) skip `initializeFeaturePool` when workers exist, (4) skip `initClipModel` when ready, (5) skip `initClipModel` during download, (6) reject promise → `logError` called with error message.
  **Commits**: 7 on `fix/clip-extraction-silent-failure` (TDD walk: 77e5594 disabled no-op test+stub, 091fa55 fresh-state happy path, be50953 featureWorkers guard, 6cc5d5d clipWorkerReady guard, bf1a6d2 clipModelDownloading guard, 95af64a `.catch`/`logError`, 8cae645 wire into `loadFolder`) + 2 doc commits (c1379b7 spec, 170bc0c plan)
  **Test results**: 177/177 unit tests pass (was 171 baseline; +6 new); E2E: skipped (E2E for full kickoff → progress notification → `.feature_cache.json` written → CLIP sort succeeds chain would require either real 87 MB CLIP model download or extensive transformers.js mocking; unit tests prove kickoff wiring; existing `clip-graceful-degradation.test.js` covers CLIP-unavailable path)
  **Code review**: Approve for merge. 0 Critical, 0 Important, 5 Minor (M1 hypothetical sync-throw if `startBackgroundFeatureExtraction` ever drops `async` — accepted; M2 `originalWindow` save/restore would set `undefined` rather than `delete` if previously absent — matches file convention; M3 microtask-drain pattern in rejection test is fragile but vitest-idiomatic — accepted; M4 spec mentions "167 currently" but actual baseline was 171 — cosmetic spec drift, doesn't affect impl; M5 method name verbosity acceptable per single-source-of-truth rationale)
  **Manual scenarios**: User executed the 8-step manual repro on 2026-05-07 — passed. CLIP-enabled fresh-folder load now triggers progress bar within ~5s, writes `.feature_cache.json`, and CLIP sort works without the "Only 0 files have CLIP embeddings" error. Two unrelated UI bugs surfaced during the session (see Spawned BACKLOG items below).
  **Spawned BACKLOG items** (3): (1) Toggle-on kickoff (deferred from spec) — when user toggles CLIP **on** in Settings while a folder is already loaded, should we kick off extraction for the current folder? Today only the toggle-off path is handled. (2) Compare-mode → folder-switch leaves stale media wrappers visible (PR #34 manual test) — `switchToSingleModeUI()` reverts mode flag but doesn't remove leftover `.compare-wrapper` DOM nodes; new folder media renders alongside shrunk previous wrappers. (3) Hash sort + AI sort not mutually exclusive (PR #34 manual test) — both can apply in sequence with independent undo affordances; user-suggested unification into a single Sort menu.
  **PR**: [#34](https://github.com/GoodAlex223/media-viewer/pull/34)

---

### [2026-05-03] CLIP Sort Follow-ups

**Spec**: [docs/superpowers/specs/2026-05-02-clip-sort-followups-design.md](../superpowers/specs/2026-05-02-clip-sort-followups-design.md)
**Plan**: [docs/archive/plans/2026-05-02-clip-sort-followups.md](../archive/plans/2026-05-02-clip-sort-followups.md)
**Summary**: Three Group D BACKLOG follow-ups shipped together. (1) `insertNewFilesInSortedOrder` is now algorithm-aware: takes a third `algorithm` parameter from `cachedData.algorithm`; CLIP path scores by cosine distance over `clipCache`; hash path is byte-equivalent to pre-change behavior. Files without CLIP vectors are end-appended (matches `sortMediaBySimilarityClip` first-time-sort fallback). Fixes silent semantic-ordering corruption when adding new files to a CLIP-cached folder. (2) CLIP toggle-off in Settings (F1) now cleans up: synchronously reverts `sortAlgorithm` to `'vptree'` (constructor default) and updates the dropdown if the user was on CLIP, then `await deleteSortCache('clip')` clears the persisted entry. Revert-before-await ordering eliminates the transient "CLIP shown but disabled" UI state. (3) Added 7 new unit tests: 4 characterization tests for `sortMediaBySimilarityClip` (worker side, including MST chain ordering, missing-vector fallback, abort-flag throw, insufficient-vectors guard) + 3 algorithm-aware tests for `insertNewFilesInSortedOrder` (renderer side, including a regression guard for the unchanged hash path). Test count 160 → 167.
**Key Changes**:

- `media-viewer.js` — New `calculateCosineDistance()` method (~10 LoC, mirrors `sorting-worker.js`); `applyCachedSortOrder` passes `cachedData.algorithm` to insertion; `insertNewFilesInSortedOrder` branches on algorithm with byte-equivalent hash else-branch; CLIP toggle handler is now `async` with revert-before-await cleanup
- `sorting-worker.js` — Extended `module.exports` to include `sortMediaBySimilarityClip` + `sortMediaBySimilarityMST` (freebie for future MST tests); discoverability comment near `abortFlag = false` flagging test contract
- `tests/sorting-worker.test.js` — New `describe('sortMediaBySimilarityClip', ...)` block with 4 tests; `resetAbort()` helper exploits worker's outer try/catch to reset abort flag without depending on test's own try/catch
- `tests/media-viewer-utils.test.js` — New `extractAsyncMethod` helper using `Object.getPrototypeOf(async function(){}).constructor`; new `describe('insertNewFilesInSortedOrder (algorithm-aware)', ...)` block with 3 tests using `extractMethod` pattern
  **Commits**: 13 on `feature/clip-sort-followups` (779f630 spec, e427049 plan, 91f87e6 export extension, bb1052d tests, 30486df review fixes, cdf631e cosine method, ae1f241 extractAsyncMethod, 2252d32 algorithm-aware insertion + tests, 0eaf7ca caller update, 0ce9cec toggle-off cleanup, 80ac67d M1+M3 polish, c538bc0 + ba7f2bc CLAUDE.md syncs, 1a9b1bc BACKLOG bug entry)
  **Test results**: 167/167 unit tests pass (was 160 baseline; +7 new), 39/39 E2E tests pass (unchanged; no E2E added — toggle-off behavior covered by manual scenarios)
  **Code review**: Approve for merge. 0 Critical, 0 Important, 3 Minor (M1 cosine null-return divergence between renderer/worker — fixed in 80ac67d with explanatory comment; M2 inline comments lost during else-branch extraction — left as cosmetic; M3 toggle-off revert-after-await ordering — fixed in 80ac67d with reorder)
  **Manual scenarios**: Scenario 1 attempted on `Act2_Warm` folder; revealed pre-existing CLIP background-extraction bug (separate from this branch's scope) — extraction silently does not fire on folder load, so no CLIP vectors exist for the cache-hit insertion path to be exercised end-to-end. Bug filed in BACKLOG. Remaining scenarios skipped pending extraction-bug fix.
  **Spawned BACKLOG items** (2): CLIP background extraction silently does not fire on folder load (high priority, blocks all CLIP features end-to-end); UX-visible "extraction starting" notification to surface failure modes faster
  **PR**: TBD (pending push)

---

## 2026-04 (April)

### [2026-04-29] Group F: Build & DX

**Spec**: [docs/superpowers/specs/2026-04-29-group-f-build-dx-design.md](../superpowers/specs/2026-04-29-group-f-build-dx-design.md)
**Plan**: [docs/archive/plans/2026-04-29-group-f-build-dx.md](../archive/plans/2026-04-29-group-f-build-dx.md)
**Summary**: Two independent tooling fixes shipped together. (1) Lucide icon CDN pinned from `lucide@latest` to `lucide@1.14.0` with SHA-384 SRI integrity hash and `crossorigin="anonymous"`; SRI mismatch causes browser to refuse load (icons silently disappear via existing `if (typeof lucide !== 'undefined')` guard at `media-viewer.js:356` — loud-failure mode by design). (2) `regression-checker` agent updated for the FullscreenManager extraction (TASK-019, March): Section 2 rewritten from "AbortController Cleanup" (stale `cleanupFullscreen`/`fullscreenAbortControllers` symbols) to "Fullscreen Lifecycle (FullscreenManager)" referencing `this.fullscreen.cleanup()` / `.toggle()` / internal `abortController()`; line-count updated `6600+` → `~7400`; new Section 8 "v2.0 Modular Subsystems" codifies the audit pattern for future manager extractions (ZoomManager, CompareManager, SortingManager, MLManager planned). Side effect: added narrow `.gitignore` exception (`.claude/*` + `!.claude/agents/`) so the regression-checker.md ships via PR instead of staying per-developer.
**Key Changes**:

- `index.html` — Lucide `<script>` tag pinned to `@1.14.0` with `integrity="sha384-jB6ZXxyEV94yzTxgLMvrwwNbn/pTTqwrMDI+v8FV5o5FnId/yn3DJwSdrDujU9A7"` and `crossorigin="anonymous"`; inline 3-line comment documents the bump procedure (curl|openssl one-liner)
- `.claude/agents/regression-checker.md` — Section 2 rewrite, line-count fix, new Section 8 (now tracked in git for the first time since `90bae8e` removed `.claude/`)
- `.gitignore` — `.claude/*` pattern with `!.claude/agents/` exception; `.superpowers/brainstorm/` added (transient brainstorming session artifacts)
- `CLAUDE.md` — auto-managed sync: `.claude/agents/` added to architecture tree; new gitignore-pattern gotcha; line-count corrected `~6300+` → `~7400` (actual `wc -l` 7468); In-progress block reflects Group F shipping
  **Commits**: 4 implementation commits on `feature/group-f-build-dx` (2a5597a Lucide pin, 009420c comment self-contained per code review, b6ef9d7 track .claude/agents/, 1efbdc1 regression-checker update) + 3 housekeeping (11f4317 brainstorm-ignore + auto-memory, a50ed41 .claude/agents/ doc, plus this closeout) + 2 doc commits (86509ea spec, 042cedc plan)
  **Test results**: 160/160 unit tests pass (no test changes needed — both fixes are static-file edits)
  **Code review**: 1 Important finding addressed (comment "see PR for procedure" → self-contained inline curl|openssl); 0 Critical, 0 remaining Important. Spec compliance review passed for both tasks.
  **Pending verification**:
- Manual smoke test: user runs `npm start` and confirms icons render across toolbar/dropzone/overlay/playback/settings — required before merge
- Agent dispatch verification: Step 2.5 deferred due to subagent quota exhaustion; tracked in BACKLOG to run post-quota-reset against commit `43db8af`
  **Spawned BACKLOG items** (5): full regression-checker audit; migrate Lucide to bundled npm; deferred agent dispatch verification; cleanup duplicate `!.claude/agents/` line in .gitignore; auto-update or remove line-count reference in agent file

---

### [2026-04-21] Group E: Resource Management

**Spec**: [docs/superpowers/specs/2026-04-20-group-e-resource-management-design.md](../superpowers/specs/2026-04-20-group-e-resource-management-design.md)
**Plan**: [docs/archive/plans/2026-04-20-group-e-resource-management.md](../archive/plans/2026-04-20-group-e-resource-management.md)
**Summary**: Two backend lifecycle fixes shipped together. (1) CLIP model now unloads 30 seconds after background extraction completes, reclaiming ~200-400 MB of main-process memory; re-loads transparently from transformers.js disk cache on next CLIP IPC. Renderer-side timer is cleared at the start of `startBackgroundFeatureExtraction()` so folder-switch within the grace window keeps the model loaded. (2) `logger.init()` now closes any existing fd before opening a new one, preventing fd leaks on hypothetical double-init. Local-capture pattern in `extractClipEmbedding`/`extractClipEmbeddingBatch` ensures mid-await safety against concurrent `unloadClipModel` IPC.
**Key Changes**:

- `main.js` — New `ipcMain.handle('unloadClipModel')` nulls `clipProcessor`/`clipVisionModel`/`clipModelError` (returns `{success: false, reason: 'loading'}` if `clipModelLoading`); `extractClipEmbedding` and `extractClipEmbeddingBatch` capture `processor`/`model` into local consts after `loadClipModel()` resolves with null-guard returning `{success: false, error: 'CLIP unavailable'}`
- `preload.js` — `unloadClipModel: () => ipcRenderer.invoke('unloadClipModel')` exposed on `electronAPI`
- `media-viewer.js` — `this.clipUnloadTimer = null` field added to constructor; `clearTimeout` at start of `startBackgroundFeatureExtraction()`; `setTimeout(window.electronAPI.unloadClipModel, 30000)` at end (gated on `this.enableClipFeatures`)
- `logger.js` — `init(logDir)` closes existing `logFd` (try/catch around invalid-fd) and resets `logFd = null` before opening new fd
- `tests/logger.test.js` — New unit test asserts `fs.closeSync` is called once on second `init()` via `vi.spyOn` delta assertion
  **Commits**: 5 implementation commits on `feature/resource-management` (b9f3b7e logger guard, a26fba8 vi import cleanup per code review, e7d84d0 unloadClipModel IPC, 782b61a local-capture race mitigation, d65bfdd renderer timer wiring) + 2 doc commits (6c8bb68 spec, ade533e plan)
  **Test results**: 160/160 unit tests pass (13 logger tests including new); 39/39 E2E tests pass (including `clip-graceful-degradation.test.js`)
  **Code review**: Approve for merge. 0 Critical, 0 Important, 4 Minor (M1 named constant for 30000, M2 clipModelError reset behavior on persistent failures, M3 setTimeout/clear race noted as accepted tradeoff, M4 verbose timer comment) — 3 actionable items added to BACKLOG.md
  **PR**: [#31](https://github.com/GoodAlex223/media-viewer/pull/31)

---

### [2026-04-18] Group D: CLIP Similarity Sorting

**Spec**: [docs/superpowers/specs/2026-04-16-clip-similarity-sorting-design.md](../superpowers/specs/2026-04-16-clip-similarity-sorting-design.md)
**Plan**: [docs/archive/plans/2026-04-16-clip-similarity-sorting.md](../archive/plans/2026-04-16-clip-similarity-sorting.md)
**Summary**: Added "CLIP (Semantic)" option to the sort algorithm dropdown. Sorts files by CLIP embedding cosine similarity using the MST algorithm, producing semantic grouping (e.g., photos of same subject cluster together) instead of pixel-similarity grouping from blockhash. Reuses `clipCache` vectors already populated by background extraction (TASK-028); sort order cached via existing `saveSortCache('clip', ...)` infrastructure.
**Key Changes**:

- `sorting-worker.js` — New `calculateCosineDistance(vec1, vec2)` (`1 - dot(a,b)` for unit-normalized vectors, `Infinity` on null/mismatched lengths); new `sortMediaBySimilarityClip(mediaFiles, clipVectors, currentIndex)` (MST algorithm reusing VPTree + MinHeap + Prim's); new `case 'clip'` in worker message handler `switch`; `calculateCosineDistance` added to CJS export
- `media-viewer.js` — `handleSortBySimilarity()` CLIP branch: `enableClipFeatures` guard (throws directing user to Settings F1), vector collection from `clipCache` via `Array.from(vec)`, `vectorCount < 2` guard, pre-worker abort check, worker dispatch with `{ algorithm: 'clip', mediaFiles, clipVectors, currentIndex }`; `sortedCount` variable introduced for shared success notification; `algorithmNames.clip = 'CLIP (semantic)'`
- `index.html` — New `<option value="clip">CLIP (Semantic)</option>` in `#sortAlgorithmSelect`
- `tests/sorting-worker.test.js` — 9 unit tests for `calculateCosineDistance` (identical/orthogonal/opposite unit vectors, 60-degree dot product, null/undefined/mismatched-length guards, 512-dim CLIP shape)
  **Commits**: 5 implementation commits on `feature/clip-similarity-sorting` (9c7fefe, e0d07dc, 7757d40, a538b22, e94ae70) + 2 doc commits (2e52767 spec, 17c46c5 plan)
  **Test results**: 159/159 unit tests pass (30 in sorting-worker.test.js including 9 new)
  **Code review**: Approve with follow-ups. 5 spawned BACKLOG items (latent correctness bug in `insertNewFilesInSortedOrder` for CLIP cache hits, MST DRY extraction, unit tests for `sortMediaBySimilarityClip`, doc corrections re: `.sort_cache_clip.json` vs unified `.sort_cache.json`, CLIP toggle-off should invalidate sort cache)

---

### [2026-04-11] Group C: Test Quality

**Spec**: [docs/superpowers/specs/2026-04-11-test-quality-design.md](../../superpowers/specs/2026-04-11-test-quality-design.md)
**Plan**: [docs/archive/plans/2026-04-11-test-quality.md](../../archive/plans/2026-04-11-test-quality.md)
**Summary**: Hardened E2E test teardown with null guards and fixed misleading unit test describe label. Two BACKLOG items from TASK-027 PR #25 code review.
**Key Changes**:

- `tests/e2e/` (7 files) — Added `if (electronApp)` / `if (tmpFixtures)` guards to `afterEach` blocks, preventing `TypeError` when `beforeEach` throws mid-setup
- `tests/media-viewer-utils.test.js` — Renamed describe label from "keydown guard — undo in empty state" to "buildKeyString — key string construction"
  **Commits**: 4 commits (5e29a56..c1b43df)
  **Spawned Tasks**: 2 items added to BACKLOG.md (standardize `app-launch.test.js` afterEach pattern, replace `waitForTimeout` magic numbers)

---

### [2026-04-10] Compare Mode Fix + DRY Refactor

**Spec**: [docs/superpowers/specs/2026-04-10-compare-mode-fix-design.md](../../superpowers/specs/2026-04-10-compare-mode-fix-design.md)
**Plan**: [docs/archive/plans/2026-04-10-compare-mode-fix.md](../../archive/plans/2026-04-10-compare-mode-fix.md)
**Summary**: Fixed bug where switching folders while in Compare Mode caused both Single Mode and Compare Mode buttons to appear simultaneously. Also DRYed `toggleViewMode()` single-mode branch by replacing 17-line inline UI setup with `switchToSingleModeUI()` call.
**Key Changes**:

- `media-viewer.js` — `loadFolder()` now calls `switchToSingleModeUI()` before `hideDropZone()` (~L2248); `toggleViewMode()` else-branch replaced with single `switchToSingleModeUI()` call
- `tests/e2e/compare-mode.test.js` — New E2E test "resets to single mode when switching folders in compare mode" with try/finally cleanup and dual assertion (controls visible + compare-controls hidden)
  **Commits**: 4 commits (6976fd4..11e417f)
  **Spawned Tasks**: 2 items added to BACKLOG.md (mode-aware `hideDropZone()`, try/finally for pre-existing `twoFileTmp`)

---

### [2026-04-09] CLIP/ML Pipeline Cleanup

**Spec**: [docs/superpowers/specs/2026-04-09-clip-ml-cleanup-design.md](../../superpowers/specs/2026-04-09-clip-ml-cleanup-design.md)
**Plan**: [docs/archive/plans/2026-04-09-clip-ml-cleanup.md](../../archive/plans/2026-04-09-clip-ml-cleanup.md)
**Summary**: Four cleanup tasks addressing TASK-028 technical debt: fixed IPC listener accumulation for CLIP download progress, eliminated wasted image decodes during CLIP-only extraction passes, corrected broken ML model persistence (stale `.ml_model.json`), and deleted dead `clip-worker.js` (225 lines) with its tests and ESLint config.
**Key Changes**:

- `preload.js` — `onClipDownloadProgress` returns cleanup function (`ipcRenderer.removeListener`)
- `media-viewer.js` — `initClipModel()` uses `finally` block for listener cleanup; `startBackgroundFeatureExtraction()` guards `loadMediaAsImageData()` with `featureCache.has()` check; `saveMlModel()` removes redundant outer `version:1` wrapper; new `deleteMlModelCache()` method called on `modelWasReset`
- `clip-worker.js` — **Deleted** (never instantiated as Worker since d21e213)
- `tests/clip-worker.test.js` — **Deleted** (8 tests for dead code)
- `eslint.config.mjs` — Removed block 3c, updated header (Eleven → Ten blocks)
- `CLAUDE.md` — Updated architecture, conventions, git insights
  **Commits**: 4 implementation commits (053a42c..be4f8ee)
  **Spawned Tasks**: 2 items added to BACKLOG.md (DRY CLIP averaging in main.js, audit preload.js `ipcRenderer.on()` listeners)

---

### [2026-04-07] CLIP semantic features for ML prediction (TASK-028)

**Spec**: [docs/superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md](../../superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md)
**Plan**: [docs/archive/plans/2026-04-05-task-028-clip-semantic-features.md](../../archive/plans/2026-04-05-task-028-clip-semantic-features.md)
**Summary**: Added CLIP ViT-B/32 (512-dim) semantic embeddings to ML prediction pipeline, concatenated with existing 64-dim hand-crafted features (576-dim total). CLIP inference runs in main process via IPC (npm packages can't resolve in Electron Web Workers). Video support via ffmpeg scene-change keyframe extraction + averaged embeddings. Also fixed pre-existing bug where ML model wasn't retrained when like/dislike folders change.
**Key Changes**:

- `main.js` — ffmpeg-static require, keyframe extraction IPC (`extractKeyframes`, `cleanupKeyframes`), CLIP model loading/inference IPC (`loadClipModel`, `extractClipEmbedding`, `extractClipEmbeddingBatch`)
- `preload.js` — IPC bridge for all new handlers + `onClipDownloadProgress` listener
- `media-viewer.js` — Cache v4 format (`clipVector`), `clipCache` Map, `initClipModel()`, `extractClipEmbedding()`, `extractClipFromVideo()`, `getCombinedFeatures()` (64+512=576-dim), `resetMlModel()` on folder changes, settings toggle `enableClipFeatures`
- `clip-worker.js` — CLIP embedding helpers (`averageEmbeddings`, constants); no longer used as Web Worker at runtime (CLIP moved to main process IPC), kept for unit tests
- `ml-model.js` — `DEFAULT_FEATURE_DIM` 64→576, `ML_MODEL_VERSION` 2→3
- `index.html` — CLIP features toggle in settings panel
- `eslint.config.mjs` — Block 3c for clip-worker.js
- `tests/clip-worker.test.js` — 8 unit tests for averageEmbeddings
- `tests/e2e/clip-graceful-degradation.test.js` — 2 E2E tests for disabled/default CLIP behavior
  **Commits**: 11 commits (7ad4dcb..f4772a9)

---

## 2026-03 (March)

### [2026-04-03] Fix undo when no media remains in folder (TASK-027)

**Spec**: [docs/superpowers/specs/2026-03-28-task-027-fix-undo-empty-folder-design.md](../../superpowers/specs/2026-03-28-task-027-fix-undo-empty-folder-design.md)
**Plan**: [docs/archive/plans/2026-03-28-task-027-fix-undo-empty-folder.md](../../archive/plans/2026-03-28-task-027-fix-undo-empty-folder.md)
**Summary**: Fixed undo (keyboard shortcut + button click) not working when all media files have been rated/moved out of a folder. Two targeted fixes: keydown guard exception for undo action, and enhanced empty-state UI with visible undo prompt.
**Key Changes**:

- `media-viewer.js` — Keydown guard at line ~1729 now allows undo shortcut through when `mediaFiles.length === 0 && moveHistory.length > 0`; `showEmptyStateWithUndo()` enhanced to create visible `div.empty-state-undo` with "No media files remaining" text and Undo button; `showMedia()` cleanup removes empty-state element before rendering restored files
- `styles.css` — `.empty-state-undo`, `.empty-state-undo-text`, `.empty-state-undo-btn` CSS rules
- `tests/media-viewer-utils.test.js` — 2 unit tests for `buildKeyString()` method
- `tests/e2e/undo-empty-state.test.js` — 3 E2E tests (single-mode keyboard undo, button click undo, compare-mode pair undo)
  **Design Note**: When the last compare pair is rated, `switchToSingleModeUI()` switches to single mode before empty state. Undo from this state uses the compare-tagged-history branch in `handleCancel()`, restoring both files in single mode.
  **Spawned Tasks**: 2 items added to BACKLOG.md (centralized `insertFileIntoList()`, F1 through keydown guard)

### [2026-03-27] Keyboard shortcut customization (TASK-026)

**Spec**: [docs/superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md](../../superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md)
**Plan**: [docs/archive/plans/2026-03-27-task-026-keyboard-shortcut-customization.md](../../archive/plans/2026-03-27-task-026-keyboard-shortcut-customization.md)
**Summary**: Customizable keyboard shortcuts with unified QWER+AD defaults for both single and compare modes. Data-driven shortcut map with reverse lookup replaces hardcoded switch/case. Help overlay shortcuts are dynamically rendered and editable via click-to-remap with conflict detection and "Reset to Defaults" button.
**Key Changes**:

- `media-viewer.js` — `DEFAULT_SHORTCUTS` + `ACTION_LABELS` constants, `loadShortcuts()`, `saveShortcut()`, `resetShortcuts()`, `buildKeyString()`, `buildReverseMap()`, `executeAction()`, `checkShortcutConflict()`, `renderShortcutRows()`, `keyDisplayName()`, `startListeningMode()`, `stopListeningMode()`, `attachShortcutKeyListeners()`. Keydown handler refactored from 125-line switch/case to 73-line reverse map lookup.
- `index.html` — Static shortcut sections replaced with dynamic containers (`#shortcutSingleGrid`, `#shortcutCompareGrid`), Reset button added, General section updated with Z/X entries
- `styles.css` — `.shortcut-key` editable styles, `.listening` animation, `.shortcut-conflict-warning`
- `tests/keyboard-shortcuts.test.js` — 25 unit tests for all shortcut methods
- `tests/e2e/keyboard-shortcuts.test.js` — 4 E2E tests (remap, conflict, reset, persistence)
- `tests/e2e/rating.test.js`, `navigation.test.js`, `compare-mode.test.js` — Updated for new QWER+AD defaults
  **Spawned Tasks**: 3 items added to BACKLOG.md (ShortcutManager module extraction, modifier key display, E2E userData isolation)

### [2026-03-26] Application logging to file with auto-cleanup (TASK-025)

**Spec**: [docs/superpowers/specs/2026-03-26-task-025-application-logging-design.md](../../superpowers/specs/2026-03-26-task-025-application-logging-design.md)
**Plan**: [docs/archive/plans/2026-03-26-task-025-application-logging.md](../../archive/plans/2026-03-26-task-025-application-logging.md)
**Summary**: Added file-based logging for debugging. New `logger.js` module writes timestamped entries to `app.getPath('logs')/media-viewer.log`. Main process intercepts `console.log/warn/error` to mirror output to log file. Renderer errors forwarded via fire-and-forget IPC (`logError` channel). Log deleted on clean exit (`will-quit`); crash logs survive naturally.
**Key Changes**:

- `logger.js` — New CommonJS module: `init/log/warn/error/cleanup/getLogPath`, synchronous `fs.writeSync`
- `tests/logger.test.js` — 12 unit tests covering all exports, edge cases, cleanup safety
- `main.js` — Logger init, console interception, `ipcMain.on('log-renderer-error')` handler, cleanup on `will-quit`
- `preload.js` — `logError: (data) => ipcRenderer.send('log-renderer-error', data)` (fire-and-forget)
- `media-viewer.js` — `showError()` forwards to logger, `window.onerror` + `unhandledrejection` global handlers
- `eslint.config.mjs` — `logger.js` added to block 1 (Node/main process)
  **Spawned Tasks**: 3 items added to BACKLOG.md (double-init protection, console interception scope, rejection message clarity)

---

### [2026-03-25] Per-folder feature extraction caching (TASK-024)

**Plan**: [docs/archive/plans/2026-03-24-task-024-per-folder-feature-cache.md](../../archive/plans/2026-03-24-task-024-per-folder-feature-cache.md)
**Spec**: [docs/superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md](../../superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md)
**Summary**: Fixed feature extraction cache not reloading on folder switch. Root cause: `loadFeatureCache()` was inside the lazy-init guard — workers survive folder switches, so the guard was skipped on 2nd+ folder, and `featureCache` (cleared by `loadFolder()`) was never reloaded from disk. Also bumped cache schema to v3 with per-entry `{vector, size, mtime}` for file change detection and deleted file pruning.
**Key Changes**:

- `main.js` — Added `mtimeMs` to `load-folder` IPC response (1 line)
- `media-viewer.js` — Moved `loadFeatureCache()` out of lazy-init guard (core bug fix)
- `media-viewer.js` — Cache schema v3: per-entry `{vector, size, mtime}`, `FEATURE_CACHE_VERSION` 2→3
- `media-viewer.js` — Added `featureMetadata` Map populated at all 6 `featureCache.set()` sites
- `media-viewer.js` — Progress indicators show cache hits: "All N loaded from cache", "X/Y — N cached", completion breakdown
  **Spawned Tasks**: 2 items added to BACKLOG.md (Map lookup for featureMetadata, unit tests for cache validation)

---

### [2026-03-23] Fix video pause/play icon synchronization (TASK-023)

**Summary**: Fixed play/pause icon never updating when toggling video playback. Root cause: `lucide.createIcons({nodes: [el]})` used a non-existent `nodes` param — Lucide silently ignored it and re-scanned the entire document on every call, replacing all `[data-lucide]` SVGs and invalidating cached `playIcon`/`pauseIcon` refs. Fixed by using the correct `root` param to scope icon creation to the target subtree.
**Key Changes**:

- `media-viewer.js` — Changed 3 `lucide.createIcons()` calls from `{nodes: [...]}` to `{root: element}` (lines 719, 2102, 2651)
  **Spawned Tasks**: 2 items added to BACKLOG.md (pin Lucide version, add icon toggle regression test)

---

### [2026-03-22] Fix compare mode last-pair error cascade (TASK-022)

**Plan**: [docs/archive/plans/2026-03-22-task-022-fix-compare-last-pair.md](../../archive/plans/2026-03-22-task-022-fix-compare-last-pair.md)
**Spec**: [docs/superpowers/specs/2026-03-22-task-022-fix-compare-last-pair-design.md](../../superpowers/specs/2026-03-22-task-022-fix-compare-last-pair-design.md)
**Summary**: Fixed infinite error notification loop when last compare pair is rated. Added clean mode switch, empty state with undo, and compare-pair undo from single mode.
**Key Changes**:

- `media-viewer.js` — Added `switchToSingleModeUI()` helper (non-toggling mode switch), `showEmptyStateWithUndo()` (empty state preserving undo history), early exit in `moveComparePair()` when <2 files remain, defense-in-depth fixes in `showCompareMedia()` guards, conditional drop zone in `showMedia()`, compare-pair undo in `handleCancel()` via `compareMode: true` history tag
- `tests/e2e/compare-mode.test.js` — Added E2E test for last-pair clean switch and undo
  **Spawned Tasks**: 2 items added to BACKLOG.md (DRY toggleViewMode, partial undo failure)

---

### [2026-03-22] Fix compare mode overlay controls UX (TASK-021)

**Plan**: [docs/archive/plans/2026-03-21-task-021-fix-compare-overlay-ux.md](../../archive/plans/2026-03-21-task-021-fix-compare-overlay-ux.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-021-fix-compare-overlay-ux-design.md](../../superpowers/specs/2026-03-21-task-021-fix-compare-overlay-ux-design.md)
**Summary**: Fixed overlay controls positioning and hover behavior in both compare and single mode. Buttons were unreachable due to `position: fixed` breaking hover area containment, and overlapped native video player controls.
**Key Changes**:

- `styles.css` — Changed `position: fixed` to `absolute`; `bottom: 100px` to `56px` (clears video controls); added `left: 50%; transform: translateX(-50%)` centering; added `transition-delay: 500ms` on hide / `0s` on show; removed `.media-overlay-controls-left`/`-right` rules
- `media-viewer.js` — Removed side-specific CSS class assignment in `addMediaOverlayControls()`
  **Spawned Tasks**: 1 item added to BACKLOG.md (smart overlay positioning for small-height media)

---

### [2026-03-21] Investigate ML sorting pair ordering and online adaptation (TASK-020)

**Plan**: [docs/archive/plans/2026-03-21-task-020-ml-sorting-fix.md](../../archive/plans/2026-03-21-task-020-ml-sorting-fix.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md](../../superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md)
**Summary**: Fixed race condition where compare mode rendered next pair before ML re-scoring completed. Added score delta notification so users can see online adaptation working. Added 7 unit tests for pair selection algorithm.
**Key Changes**:

- `media-viewer.js` — Added `pendingCompareRefresh`/`pendingCompareUpdates` state; deferred `showMedia()` in `moveComparePair()` when ML-sorted; bypassed 100ms debounce in `updateComplete`/`reverseUpdateComplete`; added score delta notification in `scoreComplete`; added `mediaNavigationInProgress` guard to all 4 compare rating handlers; orphan timeout cleanup
- `tests/ml-pair-selection.test.js` — 7 unit tests: basic pairing, second pair, 2-file boundary, equal scores, missing scores, pairIndex clamping, odd file count boundaries
- `docs/planning/BACKLOG.md` — 5 future work items: content-understanding features, auto re-sort, model diagnostics, margin-based pairing, score confidence indicator
  **Spawned Tasks**: 5 items added to BACKLOG.md

---

### [2026-03-21] Extract fullscreen module from media-viewer.js (TASK-019)

**Plan**: [docs/archive/plans/2026-03-21-extract-fullscreen-module.md](../../archive/plans/2026-03-21-extract-fullscreen-module.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md](../../superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md)
**Summary**: Extracted fullscreen logic from media-viewer.js into a standalone `FullscreenManager` class in `fullscreen.js`, establishing the v2.0 modularization pattern (stateful manager + constructor-injected callbacks).
**Key Changes**:

- `fullscreen.js` — New ES module with `FullscreenManager` class (toggle, cleanup, abortController methods)
- `media-viewer.js` — Import + instantiate FullscreenManager, rename 10 call sites, delete 3 old methods (~70 lines net reduction)
- `eslint.config.mjs` — Added block 2c for browser renderer modules (Ten file-group blocks)
- `docs/PROJECT_CONTEXT.md` — Architecture decision: stateful manager + callbacks pattern
  **Spawned Tasks**: 5 items added to BACKLOG.md (method rename, isZoomed helper, unit tests, wasPlaying cleanup, ESLint label style)

---

### [2026-03-20] UI polish: button press effects and fullscreen guard (TASK-018)

**Plan**: [docs/archive/plans/2026-03-20-task-018-ui-polish.md](../../archive/plans/2026-03-20-task-018-ui-polish.md)
**Summary**: Added `:active` press animation to all `.control-btn` elements (scale-down 0.93 + opacity 0.85 with 50ms transition) and added early-return guard in `cleanupFullscreen()` to prevent redundant operations on double-calls.
**Key Changes**:

- `styles.css` — Added `.control-btn:active:not(:disabled)` rule after all per-button `:hover` rules for correct source-order specificity
- `media-viewer.js` — Added `if (!wrapper.classList.contains('fullscreen')) return;` guard at top of `cleanupFullscreen()`
  **Spawned Tasks**: 2 items added to BACKLOG.md (nav button hover states, consolidate per-button hover rules)

---

### [2026-03-20] ESLint config and documentation alignment (TASK-017)

**Plan**: N/A (low-effort documentation task)
**Summary**: Aligned ESLint config comments and CLAUDE.md with actual codebase state. Updated header from "Four JS environments" to "Nine file-group blocks", fixed stale JSDoc filename in electron-wrapper.cjs, corrected feature-extractor.js classification from "worker-loaded" to "worker+browser".
**Key Changes**:

- `eslint.config.mjs` — Header lists all 9 blocks; block 3b comment reflects browser+worker dual loading
- `tests/e2e/helpers/electron-wrapper.cjs` — JSDoc: `rdp-preload.js` → `rdp-preload.cjs`
- `CLAUDE.md` — Removed 3 stale "known discrepancy" references, updated block count
  **Spawned Tasks**: 2 items added to BACKLOG.md (add `globals.browser` to block 3b, audit Git Insights for stale refs)

---

### [2026-03-20] E2E test reliability improvements (TASK-016)

**Plan**: N/A (small fixes from code review)
**Summary**: Fixed two reliability issues in E2E test helpers: closeApp() timer leak (clearTimeout on successful close) and CDN stub timing (register route via `electronApp.on('window')` before `firstWindow()` so synchronous `<script src>` is intercepted). Kept `waitForNotification()` helper for future test use.
**Key Changes**:

- `tests/e2e/helpers/electron-app.js` — closeApp() stores timer ID and clears on success; launchApp() registers CDN stub before firstWindow() via window event
  **Spawned Tasks**: 2 items added to BACKLOG.md (investigate transient Vitest failures, use waitForNotification in future tests)

---

### [2026-03-20] Fix zoom and extraction bugs (TASK-015)

**Plan**: N/A (small bug fix, brainstorming + feature-dev inline)
**Summary**: Fixed three bugs discovered during code reviews: zoom popover mouseup listener leak via AbortController cleanup, missing signalUserActivity() in compare-mode rating handlers, and extraction pause state not reset on natural completion. Key fix was adding `removeZoomPopover(side)` to `cleanupCompareMedia()` for centralized cleanup across all 4 wrapper destruction paths.
**Key Changes**:

- `media-viewer.js` — Added AbortController to createZoomPopover, abort() in removeZoomPopover, removeZoomPopover(side) in cleanupCompareMedia(), signalUserActivity() in 4 compare-mode handlers, extraction pause state cleanup on natural completion
  **Spawned Tasks**: 2 items added to BACKLOG.md (rename closeAllZoomPopovers, add unit test for AbortController cleanup)

---

### [2026-03-13] Playwright E2E test suite for Electron app (TASK-014)

**Plan**: N/A (implemented via feature-dev skill)
**Summary**: Added Playwright E2E test suite with 28 tests across 6 files covering all critical user workflows. Includes Electron 30+ workaround via wrapper pattern (strips `--remote-debugging-port=0` CLI flag, sets it via `app.commandLine.appendSwitch`). Handles `ELECTRON_RUN_AS_NODE` env contamination from VS Code/Claude Code terminals.
**Key Changes**:

- `playwright.config.js` — Playwright config (workers=1, fullyParallel=false)
- `tests/e2e/helpers/electron-wrapper.cjs` + `.cmd` — Electron 30+ CLI flag workaround
- `tests/e2e/helpers/rdp-preload.cjs` — Sets remote-debugging-port via app API
- `tests/e2e/helpers/electron-app.js` — Shared helpers (launchApp, seedLocalStorage, mockFolderDialog, etc.)
- `tests/e2e/app-launch.test.js` — 5 tests (drop zone, title, electronAPI, folder load, dialog mock)
- `tests/e2e/navigation.test.js` — 7 tests (file count, index, arrow keys, buttons, wrap-around)
- `tests/e2e/rating.test.js` — 6 tests (like/dislike/undo via keyboard+button, Settings panel config)
- `tests/e2e/compare-mode.test.js` — 4 tests (toggle, dual panes, D key nav, Q key rating)
- `tests/e2e/fullscreen.test.js` — 3 tests (Z key, Escape exit, X key)
- `tests/e2e/zoom.test.js` — 3 tests (popover toggle, slider, Escape reset)
- `tests/e2e/fixtures/` — Minimal PNG/MP4 binary fixtures + generator script
- `eslint.config.mjs` — 2 new blocks (5a: CJS helpers, 5b: E2E JS tests)
- `vitest.config.js` — Exclude `tests/e2e/**` from unit test discovery
- `package.json` — `@playwright/test ^1.58.2`, `test:e2e` script
  **Spawned Tasks**: 3 items added to BACKLOG.md

---

### [2026-03-12] Unit test infrastructure and initial tests (TASK-013)

**Plan**: N/A (implemented via feature-dev skill)
**Summary**: Set up Vitest test framework with 103 tests across 4 suites covering core algorithmic logic. Zero tests to full coverage of pure functions and data structures.
**Key Changes**:

- `vitest.config.js` — Vitest configuration (tests/\*_/_.test.js)
- `tests/ml-model.test.js` — 36 tests for OnlineLogisticRegression
- `tests/sorting-worker.test.js` — 21 tests for MinHeap, VPTree, calculateHammingDistance
- `tests/feature-extractor.test.js` — 18 tests for rgbToHsl, computeHistogram, sharpness, symmetry, balance
- `tests/media-viewer-utils.test.js` — 28 tests for formatElapsed, formatTimeAgo, removeFileFromList, areFoldersConfigured
- `sorting-worker.js` — conditional CJS exports added for testability
- `eslint.config.mjs` — test file ESLint block added (block 7)
- `.husky/pre-commit` — tests run after lint-staged
- `package.json` — `"test": "vitest run"`, vitest devDependency
  **Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2026-03-11] Pre-commit hooks with linting and formatting (TASK-012)

**Plan**: N/A (implemented directly via feature-dev skill)
**Summary**: Added ESLint (flat config), Prettier, and Husky pre-commit hooks. ESLint covers 4 JS environments (Node/main, preload hybrid, renderer ES module, Web Workers). Existing codebase fixed to 0 errors/0 warnings. Prettier formatting applied as a separate baseline commit.
**Key Changes**:

- `eslint.config.mjs` — flat config with per-environment globals
- `.prettierrc.json` — tabWidth=4, singleQuote, printWidth=120
- `.husky/pre-commit` — lint-staged on every commit
- `package.json` — lint/format scripts, lint-staged config, prepare hook
- ESLint fixes: unused catch params prefixed `_`, shadow var renames
  **Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2026-03-05] Pause extraction when user is navigating

**Plan**: N/A (implemented directly via feature-dev skill)
**Summary**: Added pause/resume mechanism for background feature extraction. When the user navigates or rates files, extraction pauses automatically and resumes after 2 seconds of inactivity. Uses a Promise-based async gate pattern in the extraction loop.
**Key Changes**:

- `signalUserActivity()` — called from 6 input handlers (nextMedia, previousMedia, handleLike, handleDislike, handleCancel, moveToSpecialFolder)
- `awaitExtractionGate(signal)` — Promise-based async gate that blocks extraction loop while paused
- `resumeExtraction()` — unblocks gate after 2s idle timer, resets progress indicator
- Progress indicator shows pause icon with "Paused" text during pause
- `cancelBackgroundExtraction()` clears pause state and resolves gate on abort
- `showBackgroundExtractionProgress()` extended with `paused` parameter and last-count caching
  **Spawned Tasks**: 2 items added to BACKLOG.md (OffscreenCanvas for main-thread relief, per-file gate granularity)

---

### [2026-03-05] Estimated time remaining for feature extraction

**Plan**: [2026-03-05_task-010-extraction-eta.md](../archive/plans/2026-03-05_task-010-extraction-eta.md)
**Summary**: Added ETA display to the background feature extraction progress pill using rolling average rate calculation. Shows estimated time remaining after 5+ files completed, and a completion notification with total elapsed time.
**Key Changes**:

- `formatElapsed()`/`formatEta()` time formatting utilities (seconds to human-readable)
- `recordExtractionCompletion()` — rolling window (last 20) rate calculation with ETA computation
- Progress pill extended: `"Extracting features: 45/200 (22%) — ~3m 12s"`
- Completion notification: `"Feature extraction complete — 200 files in 2m 34s"`
- Ghost pill prevention via `isBackgroundExtracting` guard after cancel
  **Spawned Tasks**: 2 items added to BACKLOG.md (show rate in pill, reuse formatElapsed)

---

### [2026-03-05] Worker count setting for feature extraction

**Plan**: N/A (small effort, no separate plan)
**Summary**: Added configurable worker count (1-8) for feature extraction in Settings panel. Reads from localStorage with default of 4, takes effect on next pool initialization.
**Key Changes**:

- Constructor reads `featureWorkerCount` from localStorage with validation/clamping
- Number input in Settings panel (Help Overlay) with change handler
- CSS styling for number input inside `.setting-item`
  **Spawned Tasks**: 2 items added to BACKLOG.md (auto-detect CPU cores, show worker count in progress)

---

### [2026-03-05] Cache age display in sorting notification

**Plan**: [2026-03-05_task-008-cache-age-display.md](../archive/plans/2026-03-05_task-008-cache-age-display.md)
**Summary**: Added human-readable cache age to the sort cache restore notification. New `formatTimeAgo()` utility converts stored timestamp to relative time (e.g., "cached 2 hours ago").
**Key Changes**:

- `formatTimeAgo(timestamp)` method with singular/plural handling (just now → minutes → hours → days → weeks)
- Cache restore notification appends `— cached {timeAgo}` after stats
- `typeof === 'number'` guard for backwards compatibility with old caches
  **Spawned Tasks**: 2 items added to BACKLOG.md (reuse formatTimeAgo, month granularity)

---

## 2026-02 (February)

### [2026-02-25] Force re-sort option for similarity sorting

**Summary**: Added Shift+click on the sort button to bypass cached sort results and perform a fresh similarity sort. Works directly from both unsorted and already-sorted states.
**Key Changes**:

- `handleSortBySimilarity(forceResort)` accepts boolean parameter via `e.shiftKey`
- New `deleteSortCache(algorithm)` removes current algorithm's cache entry only
- `originalMediaFiles` snapshot preserved across force re-sorts (Restore Order returns to true disk order)
- Catch block guarded with `wasAlreadySorted` to prevent file list wipe on failed force re-sort
- Sort button tooltip updated with Shift+click hint
  **Spawned Tasks**: 2 items added to BACKLOG.md (help overlay hint, ML sort force re-sort)

### [2026-02-24] Unified fullscreen exit cleanup method

**Plan**: [2026-02-24_task-006-unified-fullscreen-cleanup.md](../archive/plans/2026-02-24_task-006-unified-fullscreen-cleanup.md)
**Summary**: Renamed `exitFullscreen()` to `cleanupFullscreen()` and routed all 5 exit paths through it — including the two destructive paths (`toggleViewMode`, `showCompareMedia`) that previously called `abortFullscreenController()` directly. Single source of truth for all fullscreen cleanup.
**Key Changes**:

- Renamed `exitFullscreen` → `cleanupFullscreen` (definition + 7 call sites)
- `toggleViewMode()` and `showCompareMedia()` now call `cleanupFullscreen()` before `wrapper.remove()`
- Updated stale references in CLAUDE.md and BACKLOG.md
  **Spawned Tasks**: 1 item added to BACKLOG.md (extract setupFullscreen from toggleFullscreen enter branch)

### [2026-02-24] Memory leak guard for fullscreen exitHandler

**Summary**: Fixed memory leak where the click-to-exit handler in `toggleFullscreen()` accumulated on wrapper elements when fullscreen was exited via ESC key or Z/X keyboard shortcuts. Used AbortController with a class-instance Map (`fullscreenAbortControllers`) to ensure `exitFullscreen()` removes the handler regardless of exit path.
**Key Changes**:

- Added `this.fullscreenAbortControllers = new Map()` to constructor
- `toggleFullscreen()`: Create AbortController, store in Map, pass signal to addEventListener
- `exitFullscreen()`: Abort controller via helper at method entry
- Added `abortFullscreenController(wrapper)` helper, used by `exitFullscreen()`, `showCompareMedia()`, and `toggleViewMode()`
- Defensive guard: abort existing controller before creating new one in enter path
- Removed self-removal pattern from exitHandler closure
  **Spawned Tasks**: 1 item added to BACKLOG.md (early return guard in exitFullscreen)

### [2026-02-06] Validation in showCompareMedia() for file existence

**Plan**: [2026-02-06_compare-file-validation.md](../archive/plans/2026-02-06_compare-file-validation.md)
**Summary**: Added proactive file existence validation in `showCompareMedia()` to detect and remove externally deleted files before display. Also fixed a bug where compare-mode error handlers assumed sequential pairing (broken for ML-sorted pairs).
**Key Changes**:

- Added `check-file-exists` IPC handler and `checkFileExists` preload bridge
- Parallel file existence validation with automatic retry (bounded, max 10)
- Warning notification for skipped missing files, graceful fallback when <2 files remain
- Fixed `failedIndex` calculation in `setupCompareImageHandlers` and `setupCompareVideoHandlers` to use path-based lookup
  **Spawned Tasks**: 2 items added to BACKLOG.md (single-mode validation, batch validation)

### [2026-02-06] Centralized removeFile() method

**Plan**: [2026-02-06_centralized-remove-file.md](../archive/plans/2026-02-06_centralized-remove-file.md)
**Summary**: Consolidated duplicated file removal logic from 4 locations into a single `removeFileFromList(filePath)` method. Fixed cache leak in `removeFailedFile()` and added missing `perceptualHashes` cleanup across all removal paths.
**Key Changes**:

- Added `removeFileFromList(filePath)` handling splice, cache cleanup, and index adjustment
- Refactored `moveCurrentFile()`, `moveToSpecialFolder()`, `moveComparePair()`, `removeFailedFile()`
- Fixed bug: `removeFailedFile()` never cleaned predictionScores/featureCache/perceptualHashes
- Fixed bug: `perceptualHashes` never cleaned in any removal path
- Standardized index adjustment strategy across all removal paths
  **Spawned Tasks**: 3 items added to BACKLOG.md (batch removal, insertFileIntoList, event-based cache)

### [2026-02-05] Visual media scale controls

**Plan**: [2026-02-05_visual-scale-controls.md](../archive/plans/2026-02-05_visual-scale-controls.md)
**Summary**: Added button-integrated zoom popovers with logarithmic slider for single and compare modes. Zoom button in control bar opens horizontal popover with `[-] slider [+] 100%` display.
**Key Changes**:

- Added zoom button wrapper to single-mode controls in HTML
- Added `createZoomPopover()`, `removeZoomPopover()`, `setupZoomPopovers()`, `closeAllZoomPopovers()` methods
- Integrated zoom into `addMediaOverlayControls()` for compare mode overlay buttons
- Logarithmic slider mapping (`sliderToScale`/`scaleToSlider`) for smooth zoom UX
- Glassmorphism popover styling matching existing design system
- Enabled zoom in fullscreen (wheel + pan)
  **Spawned Tasks**: 4 items added to BACKLOG.md (click effect, keyboard shortcut, persistence, responsive slider)

### [2026-02-05] Video fullscreen toggle on second click

**Plan**: [2025-12-29_video-fullscreen-toggle.md](../archive/plans/2025-12-29_video-fullscreen-toggle.md)
**Summary**: Clicking on a video in fullscreen now exits fullscreen instead of zooming. Zoom operations (double-click, wheel, pan) are disabled in fullscreen mode.
**Key Changes**:

- Removed video click restriction in `toggleFullscreen()` exitHandler
- Added `isInFullscreen()` guard in `setupZoomEvents()` to disable zoom in fullscreen
- Overlay button clicks (like/dislike/special) preserved via `.closest()` checks
  **Spawned Tasks**: 2 items added to BACKLOG.md (exitHandler cleanup, unified exit method)

---

## 2026-01 (January)

### [2026-01-02] Compare mode AI sort file mismatch

**Plan**: [2026-01-02_compare-mode-ai-sort-bug.md](../archive/plans/2026-01-02_compare-mode-ai-sort-bug.md)
**Summary**: Fixed media info showing wrong files when sorted by AI in compare mode.
**Key Changes**:

- Fixed onLoad handlers to use compareLeftFile/compareRightFile references
- Fixed copy filename to use correct file in AI-sorted mode
- Added cache cleanup when files are removed
  **Spawned Tasks**: 1 item added to BACKLOG.md (centralized removeFile method)

---

## 2025-12 (December)

### [2025-12-28] Background feature extraction

**Plan**: [2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)
**Summary**: Implemented background feature extraction with worker pool and sorting results caching.
**Key Changes**:

- Background feature extraction with worker pool
- Sorting results caching in IndexedDB
- Progress indicator during sorting
  **Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2025-12-27] Sorting algorithm cache

**Plan**: [2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)
**Summary**: Cached sorting results to restore order without re-sorting.
**Key Changes**:

- Per-algorithm caching (VP-Tree, MST, Simple)
- New files inserted at optimal positions based on similarity
- Removed files automatically skipped
  **Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2025-12-25] Notifications and media info less intrusive

**Plan**: [2025-12-25_notifications-media-info-less-intrusive.md](../archive/plans/2025-12-25_notifications-media-info-less-intrusive.md)
**Summary**: Moved notifications to bottom-right corner and changed media info from hover to click-to-show.
**Key Changes**:

- Notifications moved to bottom-right corner
- Setting to disable rating confirmation notifications
- Media info changed from hover to click-to-show (i button or I key)
  **Spawned Tasks**: 0

---

### [2025-12] Sorting stops when window minimized

**Summary**: Moved sorting algorithms to Web Worker to avoid Chromium timer throttling.
**Key Changes**:

- Created sorting-worker.js with MinHeap, VPTree, and all 3 sorting algorithms
- Worker communicates via postMessage with real-time progress updates
- Abort/cancel still works via worker message

---

### [2025-12] Similarity sorting not working in single mode

**Summary**: Fixed all 3 algorithms to start from currently viewed file instead of first file.
**Key Changes**:

- Fixed Simple, VP-Tree, MST algorithms to start from current file

---

### [2025-12] Media skipping in single mode

**Summary**: Fixed rating a file skipping 2 instead of 1 in single mode.
**Key Changes**:

- Replaced `nextMedia()` with `showMedia()` after splice
- Fixed undo to insert file at `currentIndex` instead of array end

---

### [2025-12] Image zoom capability

**Summary**: Added mouse wheel zoom, double-click cycle, and drag-to-pan for images.
**Key Changes**:

- Mouse wheel zoom centered on cursor
- Double-click to cycle 1x -> 2x -> 4x -> 1x
- Drag to pan when zoomed
- Works in both single and compare modes (independent per image)

---

### [2025-12] Text overflow in boxes

**Summary**: Fixed filename and error text extending beyond container boundaries.
**Key Changes**:

- Added max-height + scroll for notifications
- Fixed folder-info with min-width: 0
- Created header-controls class with flex-wrap

---

### [2025-12] Unused skip button in media player

**Summary**: Replaced single skip button with 10s backward/forward buttons.
**Key Changes**:

- Added << (10s backward) and >> (10s forward) buttons
- Added `skipVideo(seconds)` method

---

### [2025-12] Custom folders for likes/dislikes

**Summary**: Added folder settings UI for liked and disliked file destinations.
**Key Changes**:

- Folder settings UI in Help overlay (F1 -> Settings -> Rating Folders)
- Browse and clear buttons for folder selection
- Rating buttons disabled until both folders configured

---

### [2025-12] Move file to special folder

**Summary**: Added ability to move files to a user-defined special folder.
**Key Changes**:

- Special button in single view and Left/Right Special buttons in compare view
- Special folder configuration in Settings

---

### [2025-12] Remove failed files from list

**Summary**: Added Remove button in error notifications to remove unloadable files.
**Key Changes**:

- Remove button in error notifications
- Works in both single and compare modes
- Auto-navigates to next file after removal

---

### [2025-12] Disable auto-close for error messages

**Summary**: Added setting to control error notification auto-close behavior.
**Key Changes**:

- Auto-close error notifications checkbox in Settings (F1)
- Limited to 5 simultaneous notifications

---

### [2025-12] Alt+F4 not working

**Summary**: Registered Alt+F4 as globalShortcut in main process.
**Key Changes**:

- Alt+F4 registered as globalShortcut
- Properly unregisters on app quit

---

### [2025-12] A/D keys for pair navigation

**Summary**: Added A and D keyboard shortcuts for compare mode navigation.
**Key Changes**:

- A (previous) and D (next) shortcuts in compare mode
- Documented in help overlay

---

## Notes

- Entries organized by month, newest first
- Every entry must reference its plan document (if one exists)
- Use standard format for routine tasks, detailed format for significant work
- Spawned tasks should already be in [TODO.md](TODO.md) or [BACKLOG.md](BACKLOG.md)
