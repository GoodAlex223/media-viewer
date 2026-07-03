# DONE

Completed tasks with implementation details and learnings.

**Last Updated**: 2026-07-03 <!-- Group CW-T: Tournament correctness, persistence & hardening — 2 HIGH bugs (cannot-enter-after-add-media+AI-sort → live-engine fast-path reconcile gap, fixed by reconcileWithFiles-on-every-entry + hardened -1; 24k freeze/Both-Win hang → O(1) inverse-delta undo replacing per-pick strategy.serialize() + showTournamentPairFast wrapper-reuse render) + 6 🟤 debt items; branch fix/cw-t-tournament-hardening MERGED 2026-07-03 via PR #59 (merge ae9588d, deleted remote + local); subagent-driven (8 commits), all per-task reviews Approved + final whole-branch review (opus) "Ready to merge: Yes" after catching 2 cross-cutting fast-path bugs (shared-JXL-URL revoke; duplicate error handler) both fixed in-branch; real-24k manual smoke PASSED; post-merge /code-review 2 real findings (delta-undo removeFile corruption reproduced by execution + close-guard resume-prompt) both fixed pre-merge in f4b7807 (+3 unit → 411), +2 🟤 [2026-07-03] residuals; 404→411 unit, lint 0, tournament E2E 6/6; persistent media-viewer-perf.log added post-smoke. Prior: Group T1: Tournament exit affordances (in-tournament exit button + confirm-before-app-close) — MERGED 2026-06-30 via PR #58 (merge 21668ac, branch deleted remote + local); subagent-driven (8 commits, controller commits), every per-task review Approved + final whole-branch review (opus) "Ready to merge: Yes" (1 Important + 1 Minor folded in: isDestroyed() guard, once-register ipcMain.on + isQuitting re-arm); post-merge /code-review "No issues found" — the scored-75 discard-path fail-safe gap folded in PRE-MERGE (3ad32bb, +1 test) + 2 🟤 [2026-06-30] PR #58 post-merge items (orphaned-state-on-failed-discard; discarded onAppCloseRequested unsubscribe, 25); 389 unit (+8), full E2E 48 pass / 1 pre-existing fail (PR #55 history-free v2 stale assertion, verified failing on main), lint 0; all 5 manual close-confirm cases PASSED; user-flagged #navInfo overlap fixed (cac3e79). Prior: Group WR: Weekly Reviews first run — MERGED 2026-06-29 via PR #57 (b42f5f5, branch chore/weekly-reviews-2026-06-26 deleted remote + local); docs-only so /code-review was a no-op "No issues found" (+2 🟡 [2026-06-29] post-merge process observations). 4 verdicts (1 adopt: pr-review-toolkit → 🟤 BACKLOG; 3 defer); deep-research harness hit rate/session limits (~8M tokens, verification never completed) → methodology corrected to lightweight inline research for future weeks. Prior: Group P3: Feature-extraction timing (lazy / on-demand) — removed folder-open + CLIP-toggle kickoffs; conditional on-demand CLIP-sort trigger gated by clipVectorsNeedExtraction; ML sort already lazy, hash sort needs no vectors. MERGED 2026-06-26 via PR #56 (merge 9d65500, branch deleted), manual 24k smoke PASSED, pre-merge /code-review fix cba5352 (stale E2E + 2 comments), re-review "no issues remaining", 381 unit. Prior: Group P2: Tournament large-folder performance (debounced single-flight persistence + O(n) consumed-marker pairing + cached path→index Map + slim v2 history-free payload + atomic write); branch feature/tournament-large-folder-perf MERGED 2026-06-25 via PR #55 (merge 51366cb), manual 24k smoke PASSED, re-review "No issues found". Prior: Group P1 PR1 MERGED via PR #54 (7b78a56). -->

**Purpose**: Historical record of completed work.
**Active tasks**: See [TODO.md](TODO.md)
**Project context**: See [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)

---

<!-- Organize by month, newest first. -->

## 2026-07 (July)

### 2026-07-02 — Group CW-T: Tournament correctness, persistence & hardening

**Summary**: Fixed the 2 HIGH-severity tournament bugs from the 2026-07-01 24k dogfooding + swept 6 adjacent 🟤 debt items (one branch, one review cycle). **Bug #1** (cannot enter after add-media + AI sort): diagnosis *corrected the BACKLOG hypothesis* — the disk-resume path already reconciled post-PR #55, but the **live-engine fast-path** in `enterTournamentMode` skipped reconciliation, so `getMediaIndex` returned −1 → "file missing". **Bug #2** (24k freeze / Continue-stuck / Both-Win-hang): the real per-pick O(n) cost was `recordResult`/`recordDraw` deep-`serialize()`ing the whole SwissStrategy for undo on **every** pick (winCounts + files + playedPairs + roundQueue copies, up to 100 retained), plus a full `showCompareMedia` teardown/rebuild per pair.

✅ **Status: MERGED 2026-07-03 via PR #59** (merge `ae9588d`, branch `fix/cw-t-tournament-hardening` deleted remote + local) — subagent-driven (8 commits, controller commits), every per-task review Approved + final whole-branch review (opus) "Ready to merge: Yes" **after catching 2 cross-cutting fast-path bugs** (shared-`_jxlObjectURLs` per-side revoke blanking a JXL side; duplicate error handler on the fast-path media) both **fixed in-branch** (`8a472d9`) + re-reviewed clean; **real-24k manual smoke PASSED** (resume no freeze, picks/Both-Win instant & non-degrading, add-media+AI-sort→enter renders a pair). Post-merge `/code-review` flagged **2 real issues** — both controller-verified real despite Haiku-75 scores (HIGH delta-undo-across-`removeFile` strategy corruption, **reproduced by direct execution**; close-guard-vs-"Resume tournament?"-prompt making the window unclosable) → both **fixed in-branch pre-merge in `f4b7807`** (`removeFile(file,{trackUndo:true})` snapshot at the auto-prune site; guard scoped to `title === 'Leave tournament?'`; +3 unit → 411), re-review "No issues remaining"; +2 🟤 [2026-07-03] PR #59 post-merge residuals (special-move undo-past `strategy.files` divergence; fast-path re-entrancy guard). 404→411 unit, lint 0, tournament E2E 6/6.

**Key changes**:
- **Bug #1 reconcile** ([tournament.js](../../tournament.js), [media-viewer.js](../../media-viewer.js)) — extracted `TournamentManager.reconcileWithFiles(currentFiles)` (prune `engine.files` to ∩ current, idempotent); called in `_enterResumedTournamentUI` so **every** entry (incl. the live-engine fast-path) reconciles; hardened the `-1` branch with a bounded retry + a structured divergence capture (now persisted to `media-viewer-perf.log`).
- **Bug #2A undo** ([tournament-engine.js](../../tournament-engine.js)) — `SwissStrategy.captureUndo()`/`applyUndo()`: O(1) inverse-delta for non-boundary picks (unshift pair, decrement winCounts, delete playedKey, gamesPlayed−−), full snapshot only when the pick empties the round. `filesSnapshot` kept on **every** history entry (cheap array-of-refs) to preserve the tested `engine.files`-rewind-across-`removeFile` contract.
- **Bug #2B/C render** ([media-viewer.js](../../media-viewer.js)) — `showTournamentPairFast`/`_buildTournamentSide` reuse the compare wrappers + overlay controls, swapping only the inner media (no 50ms grace, no per-pair `checkFileExists` IPC, no `lucide` rebuild); **phase-separated** cleanup vs build (`Promise.all(cleanup both)` then `Promise.all(build both)`) so the shared JXL-URL revoke can't blank a side; `_logSlowPhase` instrumentation.
- **6 🟤 debt** — `handleDiscard` retry-once; `moveToSpecialFolder` + `handleTournamentUndo` comment fixes; `onAppCloseRequested` unsubscribe stored; close-confirm re-entrancy guard; `getMediaIndex` single-lookup; stale E2E fix + exit precondition + `#tournamentExitBtn` aria-label; undo-cap + SwissStrategy carry-over/don't-double-bye test pins.
- **Persistent perf log** ([logger.js](../../logger.js), [main.js](../../main.js), [preload.js](../../preload.js)) — append-mode `media-viewer-perf.log` (survives quit; the main log is truncate-on-launch + delete-on-quit) so real-run `[perf]` timings are reviewable; `logPerf()` + a `log-perf` IPC channel + preload bridge (added post-smoke on user request).

**Key decisions / learnings**: ⭐ the spec's bug #1 hypothesis (sort-reorder → −1) did not survive a code read — reconciliation already guarded the disk path; the real gap was the live-engine fast-path (diagnose before implementing). ⭐ the inverse-delta cannot resurrect a mid-tournament-removed file's *strategy* state on its own, so `filesSnapshot` is kept every pick to hold the tested `engine.files`-rewind contract. **Post-PR `/code-review` fix:** what was framed as a "documented nuance" (undo past a `removeFile` restored `engine.files`/tier count but not the strategy) was actually *state corruption* (phantom byes, polluted win counts) — fixed by giving `engine.removeFile(file, { trackUndo:true })` a snapshot-based undo entry (reuses the existing snapshot-restore path, no new dispatch), opted-in at the reachable `-1` auto-prune site so undo fully restores the strategy; the special-move → undo-past case stays on the renderer's special undo branch, bounded by the pre-existing [2026-06-24] two-stack-interleaving item. ⭐ the final whole-branch review caught two fast-path × shared-code interaction bugs invisible to per-task review; the follow-up `/code-review` then caught two more (delta-undo × removeFile corruption; a close-guard keyed on the *shared* resume/leave modal that made the window unclosable during the "Resume tournament?" prompt — fixed to key on the leave-prompt title) — **the review layers compound**. ⭐ `npx vitest run` is flaky under vitest v4 parallel workers on this machine (`--no-file-parallelism` reliable) → filed 🟡.

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
Prediction"** path was *already* lazy (self-triggers extraction) and never depended on the folder-open kickoff,
and **hash** similarity sort needs no vectors at all — so the only consumer that relied on the kickoff was
**CLIP semantic sort**. The fix therefore is mostly *deletion* (two eager kickoff call sites) plus one new
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
- **D3 — the CLIP-sort trigger is conditional** because `loadFeatureCache()` re-reads the ~40s cache on every fresh call (single-flight only coalesces *concurrent* calls).
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
- **Scope guardrail held**: no change to Swiss pairing *quality*, tier assignment, or the resume/leave UX.
- **Out of scope**: the Alt+F4 window-close `< DEBOUNCE_MS` loss window → deferred to Group T1 (Fri).

**Lessons learned**:
- ⭐ **Three real bugs were latent in the plan's own code** — two caught by the adversarial per-task review
  (opus), the third by the post-PR `/code-review` (the null-folder start-write). All three passed the full
  suite because no existing test exercised the triggering shape (a ≥3-member bucket whose head has played
  everyone; a pick interleaving an in-flight write; a start before any pick + a mock that accepts any args).
  **A green suite ≠ correct when the tests predate the edge** — each fix shipped with a *deterministic*
  regression test that goes RED on the bug. The null-folder one underlines a refactor trap: moving from
  `_persistState(folder)` (explicit arg) to `flush()` (reads instance state) silently dropped the start
  path's folder, and an over-permissive mock hid it.
- ⭐ "Characterization passes on the current impl" pins only what the *existing* tests cover — it does **not**
  prove selection-equivalence for an algorithm rewrite. The pairing fix needed a *new* test built around the
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
non-freezing, transparent, and cancelable, and remove O(n²)/dead-code waste — *without* changing sort
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
- **Fallback proof needs 3 legs** — capture-baseline pins *before* the swap, the swap leaving them unchanged,
  and a direct `findNearest`≡brute-force equivalence test (a two-cluster fixture does not always *execute* the
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
   patterns match full token *shape* (prose prefixes don't match) and test fixtures concatenate so no
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
- Full token-*shape* patterns (not bare prefixes) → the guard never flags its own regex source or doc mentions.

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
  branch, **not `main`**. The real on-`main` fix is `52f2cbc`. The item *was* already correctly checked off
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
+ `_rejectJxlPending` routing; `decodeJxl` two-layer pending record `{entry, resolveFirst,
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
follow-ups spawned (🟤 [2026-06-13]): evict partial JXL cache entries on worker *crash* (vs decode
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
plan's Open Question ("what is the *first* file?") as "the file the user was viewing" (fix
path a), chosen over continuous dual-array syncing (path b) for minimal state and blast radius.
Bug 2 folds wrapper teardown (`fullscreen.cleanup` + `.remove()` + null) into
`switchToSingleModeUI()` so every exit-to-single path benefits; the redundant inline teardowns
in `moveComparePair`'s and `showCompareMedia`'s `<2-files` branches were deleted (DRY).
Single→compare reverse symmetry was explicitly deferred (BACKLOG 🟤 2026-06-09).

**Key changes** ([media-viewer.js](../../media-viewer.js)): `switchToSingleModeUI()` wrapper-teardown loop;
`_applyModeSwitch()` `single`-branch index resolution; deleted inline teardown in `moveComparePair`
+ `showCompareMedia`.

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

**Final-review fix**: `ensureJxlWorker` rejected a *new* `_jxlReady` promise on init failure, leaving concurrent awaiters of the *original* promise hung forever — fixed in `84bf62b` (reject the original via stored `_jxlRejectReady`; null `jxlWorker` for recovery).

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
  + conditionally re-saves; `collectBulkRatedTrainingExamples()` re-injected as a third pass in
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
- Streaming a huge JSON in the *main* process (separate heap, no UI) + batched IPC
  keeps the renderer from ever holding the giant string; a shared session global
  needs single-flight/mutex coordination since `loadFeatureCache` is called from
  multiple paths.
- Tournament seeding only makes sense for *preference* orderings (AI score →
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
- `vitest.config.js` — Vitest configuration (tests/**/*.test.js)
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
