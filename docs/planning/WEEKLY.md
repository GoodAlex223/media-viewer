# Weekly Plan

**Week**: Monday August 31 – Friday September 4, 2026
**Created**: 2026-08-29
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md (all refreshed 2026-08-27 — nothing shipped since contradicts them), BACKLOG.md (📌 Process Rules + 🟤 Auto-Generated post-July slice + 🔵 [2026-08-28] intake + 🟡), TODO.md (🟡 "make the next week a Cleanup Week" + § Spawned Tasks), git log (last 2 weeks: G3 `0b00275`, G5 `4f1e65a`, G4 `a843d36`, intake `8f43177`), previous WEEKLY.md (July 13–17 — spilled to Aug 27, archived below), REVIEW-QUEUE.md (§1–§4; last run 2026-08-27)
**Cleanup Week?**: **Yes — 🧹 CLEANUP WEEK (3rd ever), OVERDUE.** The quota **inverts**: 🟤 Auto-Generated is the majority and the normal ≥50% 🔵 floor is suspended. Last Cleanup Week was July 6–10; the ~3-week cadence put the next one at ~July 27–31, which fell **inside the previous plan's 6-week spillover** — overdue, not skipped, so it is scheduled now rather than resetting the cadence clock. Both repo triggers have fired: **36 🟤 items** landed since July 10 (PR #65 ×9, PR #66 ×6, G4 closeout ×4, G5 closeout ×2, Weekly Reviews ×3, plus the CW-P/CW-V/PR #60/CW-D residue), far past the ~20 SP trigger, and TODO.md's own 🟡 carry-forward says "make it a Cleanup Week". One small 🔵 exception is retained (precedent: July 6–10).

**Context**: Roadmap phase _Scale & Modularize_; active milestone _v2.0 modularization_ (2/6, 🔴 renderer at 9,418 lines). This week's throughline is **"make the shipped work honest"**: burn the freshest 🟤 slice — the PR #66 bulk-rate follow-ups (🏆: stub `mlWorker` under Playwright so the compare-mode bulk-rating E2E actually exercises the D2 deferred-refresh fix it currently passes _around_), the PR #65 tournament-undo hardening, and the G4/G5 closeout guardrails that automate two chronic manual misses (the `docs/README.md` index — **22 files unindexed today**, measured — and the editor's Markdown format-on-save corruption). A trial batch finally _consumes_ the Weekly-Reviews adopt queue and settles its cadence (🟡), and a 3-SP 🔵 exception (AI-sort training-phase progress polish, same code path as July's G1) keeps the 24k dogfooding theme moving. The 🟠 ML-retrain design pass (TODO + 3 companions) is the **next normal week's lead**, not this week's.

---

## Parallel Work

- **User-side re-smoke round 2 of PR #66 (optional, 24k folder)** — never run before the user-directed merge on 2026-08-24 (round 1 found 2 real defects the suites missed). G1's real-worker E2E (merged `66b16af`, 2026-08-29 — no stub: `mlWorker` was lazy-init, not a harness limit) gives the D2 deferred-refresh path _automated_ coverage regardless, so this is a belt-and-braces check, not a gate. If run, record the result in [DONE.md](DONE.md) 2026-08-24.
- **REVIEW-QUEUE §4 inbound items** (`/wayfinder`, Jenkins-for-the-no-CI-gap, the design-video sub-batch) — parked until `claude-code-universal-config`'s own verdicts land; re-check during G6, do not action earlier.
- **TODO § Spawned Tasks** — propagate the code-review _realness_ rating axis to `~/.claude` (two-trees edit, user-maintained, not verifiable from this tree). Independent of this week's groups.

---

## Task Groups

### G1. Bulk-rate follow-ups [batch] 🏆 🟤

**Domain**: JS logic (compare-mode bulk rating in `media-viewer.js`) + E2E harness (`tests/e2e/`)
**Source**: 🟤 Auto-Generated — `### [2026-08-24] PR #66 … smoke round-1 + review follow-ups`
**Total SP**: 6 — one branch, one PR, one review (front-loaded Mon–Tue; the harness change is the design risk)

> The week's 🏆 (a Cleanup Week may take an auto-generated **correctness** item as its challenge). The PR #66 deferred-re-render fix (D2) — the main correctness property of that branch — has **zero** automated coverage: `mlWorker` is null under Playwright, so `postedUpdates` is always 0, `_beginDeferredCompareRefresh` is never reached, and the compare-mode bulk-rating E2E passes for the wrong reason. Stub the worker so the test can fail. The three lifecycle fixes ride the same branch because they touch the same `bulkRatedPairs` / `pendingCompareRefresh` state.

- [x] **Stub `mlWorker` under Playwright → real E2E coverage of the deferred-refresh protocol** — ✅ shipped 2026-08-29 as the **real** worker (lazy init was the cause, not the harness; no stub/flag). _Original:_ a test worker (or harness flag) that answers `update`/`reverseUpdate`/`score` so `postedUpdates > 0` and `_beginDeferredCompareRefresh` → `mediaNavigationInProgress` → deferred `showMedia()` is actually exercised; assert the re-render happens _after_ re-scoring (the D2 property). `tests/e2e/compare-mode.test.js`, `tests/e2e/helpers/` (3) — 🟤 [2026-08-24]
- [x] **`loadFolder` clears `pendingCompareRefresh` / `pendingCompareTimeout`** — ✅ 2026-08-29 (cancelled twice: pre-scan + pre-split — review round). a stray 3 s deferred-refresh timer can fire `showMedia()` against the NEW folder (bulk-rate → immediately switch folders); reuse the cleanup idiom already at the `moveComparePair` site. `media-viewer.js` (`loadFolder`) (1) — 🟤 [2026-08-24]
- [x] **Undo of a single-file move reinstates the pruned `bulkRatedPairs` key** — ✅ 2026-08-29. `removeFileFromList` prunes keys referencing the removed file; the like/dislike/special undo paths restore the file (`_restoredPairFiles` + `restoreFeatureCachesFromHistory`) without the key, so `(a,f)` can re-pair after `rate-pair → single-rate a → undo`. Capture referencing keys on the move-history entry; restore alongside the feature caches. `media-viewer.js` (`removeFileFromList`, `handleCancel` restore branches) (1) — 🟤 [2026-08-24]
- [x] **Close the counter + undo-arithmetic coverage gaps** — ✅ 2026-08-29. `updateNavigationInfo`'s duplicated fall-through branch (a mutation removing it survives all 513 tests) and `undoBulkRating`'s posted-count arithmetic (every `reverseMlModelUpdate` mock returns `undefined`). `tests/media-viewer-utils.test.js` (1) — 🟤 [2026-08-24]

_Deferred from the same section (not this week)_: per-render memoization of the compare-pair lists (perf, no defect — folds with the existing memoization item); "two existing entries are now more reachable" (folds into its own canonical 🟤 entries).

### G2. Tournament undo hardening [batch] 🟤

**Domain**: JS logic (tournament) — `media-viewer.js` (`handleTournamentUndo`, `exitTournamentMode`, keydown guard), `tournament.js` (`reconcileWithFiles`), `tournament-engine.js` + a CLAUDE.md gotcha update
**Source**: 🟤 Auto-Generated — `### [2026-07-21] PR #65 review follow-ups` (the correctness subset of 9)
**Total SP**: 5 — one branch, one PR (Tue–Wed)

> ⚠️ **`dead-rules-audit` trial precondition — this group is the vehicle (G4).** The plugin's `PostToolUse` matcher is `Edit|MultiEdit|Write`, so **file changes made through Bash are invisible to it** — and **auto mode routes edits through Bash by default** (the G4 session itself edited entirely via Bash and would have scored zero). Make this group's file changes with the **Edit/Write tools**, or Friday's scorecard reads "compliant" having observed nothing, and the read-out cannot tell that apart from a pass.

> The five items that can strand or wedge the **unified undo stack** G2 introduced in July. The `reconcileWithFiles` item is the one CLAUDE.md line ~191 already documents as an open gap — fixing it also lets that 958-char bullet (the file's longest) be rewritten shorter, which closes the "line 191" 🟤 in the same PR. **Design constraint carried from the entry**: the naive fix (`{trackUndo:true}` on the reconcile prune) is WRONG — a bulk reconcile can prune hundreds of files, each pushing an O(n) `strategy.serialize()` snapshot, undoing the PR #55/CW-T 24k win. Drop the session-only `engine.history` when a reconcile prunes anything (O(1), honest: `peekUndoKind()` → null → button disabled → "Nothing to undo").

- [x] **`reconcileWithFiles` prune → drop the session-only `engine.history`** — ✅ shipped 2026-08-30 (`cf7a30d` engine `clearHistory()`/`dropEntry()`, `74d3961` the manager call + toast). O(1) drop, not per-file `{trackUndo:true}` — the design constraint held. CLAUDE.md's 964-char bullet split into three (the "longest bullet" 🟤 closes with it). _Original:_ instead of an untracked `removeFile()` — closes the Tier-0-strand-on-undo-past gap; update the CLAUDE.md gotcha (line ~191) to match and **split the bullet** while there. `tournament.js`, `tournament-engine.js`, `CLAUDE.md` (2) — 🟤 [2026-07-21] ×2 (reconcile + "line 191 longest bullet")
- [x] **A failed special-restore must not wedge the undo stack** — ✅ shipped 2026-08-30 (`b7a964b`, `5a09376`; `762714a` + `e33d7c8` from the review round). Drops the entry after 2 **cumulative** failures (per-entry `WeakMap`, nothing resets it but the entry leaving the stack) and clears the rest of the stack too — entries beneath it hold pre-removal `filesSnapshot`s that would resurrect a phantom into `engine.files`. The review added the identity re-check the drop path was missing. _Original:_ a `special` entry whose `moveFile` restore fails (disk/permission) currently stays on top forever (every later Ctrl+A retries the absent path); add a defensive drop-or-demote on repeated restore failure, with a toast. `media-viewer.js` (`handleTournamentUndo` special branch) (1) — 🟤 [2026-07-21]
- [ ] **Guard the trailing `await showTournamentPair()`** across `handleTournamentPick` / `handleTournamentDraw` / `handleTournamentUndo` so two rapid triggers can't render concurrently. **NOT SHIPPED — reverted 2026-08-31, blocked.** Two corrections, in order. (1) The entry's proposed "existing `isLoading` mutex" CANNOT hold: `showTournamentPairFast` attaches `setupCompareImageHandlers`/`setupCompareVideoHandlers`, which clear `isLoading` on `bothLoaded` and on error, so an `isLoading`-based guard dissolves at first paint. (2) The `_tournamentRenderBusy` flag that replaced it (spec DEC-1) is unsound too, and this one was measured, not reasoned: `_buildTournamentSide` re-enters the render from a DOM error callback that never passes through a handler, so a lock over the handler family either misses that path and silently swallows keypresses (what shipped) or covers it and wedges. Tournament E2E: 4/4 green with the lock neutralized, ~2/3 runs failing with it. Blocked on the un-awaited re-entrant renders — re-filed as 🟤 [2026-08-31]. `media-viewer.js` (1) — 🟤 [2026-07-21]
- [x] **Empty-state keydown undo guard consults `engine.history`** — ✅ shipped 2026-08-30 (`19e6762`, `3eff3eb`). `canUndo = moveHistory.length > 0 || (isTournamentMode && engine?.peekUndoKind() != null)`; the `isTournamentMode` conjunct is load-bearing (without it a stale engine lets a single-mode Ctrl+A call `handleCancel` against an empty `moveHistory`). Invariant comment added at `exitTournamentMode`, with a KNOWN HOLE paragraph; the review found the caller list still missed two paths (`_retryCompareAfterRemoval`, `showCompareMedia` `<2`), now named. _Original:_ (not only `moveHistory.length`) so a tournament emptied purely by the `-1` auto-prune doesn't swallow Ctrl+A while `#tournamentUndoBtn` reads enabled **+ document the "`exitTournamentMode` must be paired with nulling `tournament.engine`" invariant** as a comment at `exitTournamentMode`. `media-viewer.js` (1) — 🟤 [2026-07-21] ×2

_Deferred from the same section_: keyboard-focus a11y of auto-hidden chrome (must also touch `.header` — a design change, not a cleanup item); a real `WheelEvent` zoom E2E; the Playwright load-flake hardening (M — deflake method recorded in the entry; pair it with the next E2E-heavy week).

### G3. Docs & process guardrails [batch] 🟤 (+1 🟡 folded)

**Domain**: scripts / tooling / docs — `scripts/`, `.husky/pre-commit`, `.vscode/`, `docs/README.md`, `docs/planning/plans/README.md`, `docs/planning/README.md`, `vitest.config.js`
**Source**: 🟤 Auto-Generated — `### [2026-08-27] From: G5 closeout` ×2, `### [2026-08-27] From: G4 closeout` ×4 (one out-of-tree, see note), `### [2026-07-04] PR #60` ×1, `### [2026-07-11] PR #63` ×1, plus the three one-off index backfills it closes **+** 🟡 `[2026-07-02] Vitest v4 full-suite worker flake`
**Total SP**: 6 — one branch, one PR (Wed–Thu). Mostly mechanical; the index script follows the `check-secrets.js` / `check-e2e-needed.js` house pattern (dependency-free Node, pure function + CLI, unit-tested).

> ⚠️ **`dead-rules-audit` trial precondition — this group is the vehicle (G4).** The plugin's `PostToolUse` matcher is `Edit|MultiEdit|Write`, so **file changes made through Bash are invisible to it** — and **auto mode routes edits through Bash by default** (the G4 session itself edited entirely via Bash and would have scored zero). Make this group's file changes with the **Edit/Write tools**, or Friday's scorecard reads "compliant" having observed nothing, and the read-out cannot tell that apart from a pass.

> Two chronic **manual-checklist failures** get automated instead of re-filed: the `docs/README.md` index (7 recorded misses; **22 files unindexed as of 2026-08-29** — including both G3 specs and plans from Aug 24 — so the backfill is bigger than the entry assumed) and the editor's Markdown format-on-save, which corrupted code spans in two sessions (G4 `900a6ea` revert; the 2026-08-28 `media*viewer` corruption in REVIEW-QUEUE.md). The 🟡 vitest flake folds in as the one tooling item that costs a retry on every local verification.

- [ ] **`scripts/check-docs-index.js` + pre-commit wiring + backfill** — fail when a file under `docs/superpowers/specs/` or `docs/archive/plans/` has no link in `docs/README.md`; wire into `.husky/pre-commit` (cheap, no network); backfill the 22 unindexed files; **drop** the hand-maintained "Last Updated" footer of `docs/README.md` (git records last-touched — resolves the 🟤 [2026-07-04] footer item by removal). Closes 🟤 [2026-05-06] / [2026-03-27] / [2026-03-24] backfill entries. `scripts/`, `.husky/pre-commit`, `tests/`, `docs/README.md`, `CLAUDE.md` (scripts bullet + hook prose — the doc-drift class that recurs on every script/hook addition) (3) — 🟤 [2026-08-27] G5 closeout
- [ ] **Repo-level `.vscode/settings.json` — `editor.formatOnSave: false` for `[markdown]`** (optionally a pre-commit guard rejecting staged `.md` hunks that are pure whitespace/escape churn — only if cheap). `.vscode/settings.json` (new) (1) — 🟤 [2026-08-27] G4 closeout
- [ ] **Two dead `2025-12-29_video-fullscreen-toggle` index rows** → move to the Archived/Completed tables (the `docs/README.md` one is a broken link today). `docs/README.md:34`, `docs/planning/plans/README.md:52` (XS) — 🟤 [2026-08-27] G4 closeout
- [ ] **Explicit `maxBuffer` on the `git diff --name-only` read in `check-e2e-needed.js`** — parity with `check-secrets.js`. `scripts/check-e2e-needed.js` (XS) — 🟤 [2026-07-11] PR #63
- [ ] **Repo-side closeout conventions** (the in-tree half of three template items): add a **Closeout artifacts** block (BACKLOG · TODO · DONE · WEEKLY · `docs/README.md` · `docs/archive/plans/` — each done or N/A-with-reason) and a **live-surface preflight** line ("list every live surface asserting the claims this task corrects, diff against the spec's file list") to `docs/planning/plans/README.md`, and a "**don't restate a derived count/range**" convention line to `docs/planning/README.md`. ⚠️ The `.claude/TEMPLATES/` half is **out of tree** (global, gitignored) → record it as a TODO § Spawned Tasks row for `claude-code-universal-config` rather than editing here. (1) — 🟤 [2026-08-27] G5 closeout + G4 closeout ×2
- [ ] 🟡 **Stabilize `npx vitest run` under vitest v4 parallel workers** — try `pool: 'forks'` / `fileParallelism: false` (or `poolOptions`) in `vitest.config.js`; confirm 5 consecutive full-suite runs are deterministic. `vitest.config.js` (1) — 🟡 [2026-07-02]

### G4. Adopt-queue trial batch + cadence decision [batch] 🟤 (+1 🟡 folded)

**Domain**: Claude Code tooling / process — **user-in-the-loop** (plugin installs happen in the user's Claude Code; Claude prepares, measures and records)
**Source**: 🟤 Auto-Generated — `### [2026-08-27] From: Weekly Reviews` (dead-rules-audit), `### [2026-06-26] From: Weekly Reviews` (pr-review-toolkit) **+** 🟡 `[2026-08-27] Weekly-Reviews adopt queue — burn-down & cadence`
**Total SP**: 3 — no code PR; results land in REVIEW-QUEUE.md / BACKLOG.md (docs-only, may share G6's branch)

> The 🟡 entry's own diagnosis: 5 `adopt` verdicts across 3 runs with **zero burn-down** — "a review process whose output is never tried produces verdicts, not value." A Cleanup Week is the slot the entry itself proposes (option b). Trial the two with the best-measured fit, trial one _on this week's own PR_, and settle the policy so the queue stops growing unconsumed.

- [ ] **Trial `dead-rules-audit`** — ⏳ _2026-08-30: installed (marketplace `karanb192/claude-code-hooks` added, enabled at project scope); **vehicle = the G2 + G3 sessions (Sep 1–3)**, scorecard read out at G6 on Fri Sep 4. Deliberately not trialled on G4's own docs-only session — that would measure its floor, not its fit._ (`karanb192/claude-code-hooks`; Node ≥18, no deps; parser **re-measured first-hand 2026-08-30: 38 rules / 12 prohibition-shaped / 11 judgeable** on this repo's CLAUDE.md — not the 36 / 10 reported upstream) — install, run through the G2 + G3 sessions, read the scorecard; record what it flags `⚠ promote→hook` and whether it earns its per-edit hook cost. (1) — 🟤 [2026-08-27]
- [x] **Trial `pr-review-toolkit` on the G1 PR** — ✅ 2026-08-30, **outcome: keep**. Retargeted: with no G1 PR and G2 not yet started, it ran on **G1's pre-review-round diff `29636fd..9aa27d1`** in a worktree — the exact revision `/code-review` reviewed — with four agents **blind** to the baseline, which is a stronger control than a fresh PR would have been. Matched the baseline, extended one of its findings, and produced **8 verified items beyond it** (🟤 [2026-08-30]), four of them live lifecycle defects on `main`. (its test-reviewer + silent-failure-hunter agents are the stated fit) — _(original note, now resolved: G1 merged locally with NO PR on 2026-08-29 (`66b16af`), so the vehicle needed retargeting — answered above by using G1's own pre-fix revision rather than waiting for G2.)_ compare its findings against the `/code-review` pass on the same PR; log signal-beyond-baseline. (1) — 🟤 [2026-06-26]
- [x] 🟡 **Decide the adopt-consumption policy (a / b / c) and the Weekly-Reviews cadence** — ✅ 2026-08-30: **option b+** (periodic trial batches + an `adopt` must name its trial vehicle at filing time, else it is filed `defer`; cap of 3 outstanding) and **cadence stays weekly as written** (user decision; the 06-26 → 07-05 → 08-27 slippage kept as a watch). Recorded in REVIEW-QUEUE.md § 5 Adopt trials + BACKLOG 📌 Process Rules. `security-guidance` prerequisite **measured**: Python 3.13.5 on `PATH`, venv present — and the plugin was already installed + enabled on 2026-08-24, so that entry closes as `keep` rather than merely annotated. (observed 2026-06-26 → 07-05 → 08-27: a ~monthly batch whose scan window already says "since the last run") — record in [REVIEW-QUEUE.md](REVIEW-QUEUE.md) § Conventions + BACKLOG 📌 Process Rules; while there, check the `security-guidance` prerequisite (Python 3.10+ on `PATH`) and note it on that 🟤 entry. (1) — 🟡 [2026-08-27]

_Deferred_: `typescript-lsp` and `security-guidance` trials (next Cleanup Week, or sooner if the policy decision says "gate new adopts on trialling old ones"); the "autonomous visual-verification" checklist line (G1's stub is the concrete instance).

### G5. AI-sort training-phase progress polish [batch] 🔵

**Domain**: JS logic — sort-progress card + `trainFromHistoricalRatings` in `media-viewer.js`
**Source**: 🔵 User-Flagged — `### [2026-08-28] From: manual testing` (batches 2 + 4)
**Total SP**: 3 — one branch, one PR (Thu)

> The Cleanup Week's sanctioned 🔵 exception (precedent: July 6–10). Both are residuals of PR #64's cancel work on the **same code path** (`updateProgressNotification` demotes the cancelable card to plain text for exactly the longest phase), small, user-visible, and dup-tagged to each other in BACKLOG ("same fix vehicle"). The abort machinery already covers the phase — this is UI only.

- [ ] **Keep the cancelable sort-progress card through the historical-ratings phase** — route the likes/dislikes loop's progress through `updateSortProgress` instead of `updateProgressNotification`, so Cancel stays clickable while "Processing likes: i/n" runs. `media-viewer.js:~1201-1219`, `~7505-7543`, `~1235-1253` (2) — 🔵 [2026-08-28]
- [ ] **Indeterminate progress from CLIP-model load until the first determinate update; report from file 1** — render CLIP load + the historical phase in the card's existing `indeterminate` mode (no dead window between the "CLIP model loaded" toast and the first "Processing likes" line), and report per file rather than every 10th. `media-viewer.js:~8302-8338`, `~7904`, `~7522-7544`, `~1259-1267` (1) — 🔵 [2026-08-28]

### G6. Weekly Reviews [batch] ⚪ Overhead

**Domain**: Research / process (exempt overhead — excluded from the source-quota denominator)
**Source**: ⚪ Overhead
**Total SP**: 5 — Friday, low-risk, must not displace G1–G3

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. Codified methodology (CW-P, PR #63): **hybrid sourcing** (fresh `WebSearch` AND the parked Next-up item, review the strongest), **lightweight inline research** (a few `WebSearch` + 2–3 `WebFetch`; never the deep-research harness), a **run-card** not a full spec+plan, docs-only PR handling. ⚠️ **Tiny window**: the previous run was **2026-08-27**, four days before this week starts, so the scan window for §4 is a few closeout commits — expect `pass (no new candidate)` rows to be legitimate, and the two parked _outbound_ Next-up items (the pre-push E2E gate as a no-CI pattern; "a reviewer's negative finding must cite its evidence") are the natural §4 picks. ✅ **G4's cadence decision landed 2026-08-30: weekly, as written** — so this batch runs Friday as planned, not deferred. The 06-26 → 07-05 → 08-27 slippage is recorded as a watch in REVIEW-QUEUE.md § 5; re-open the cadence question with evidence if a fourth long gap opens. This run also owes § 5 two read-outs: the `dead-rules-audit` scorecard (vehicle: the G2 + G3 sessions) and, if G5 ships, the visual-verification practice.

- [ ] **Read out the `dead-rules-audit` scorecard (0 SP — carried from G4)** — the trial's terminal step, due today. Record in [REVIEW-QUEUE.md](REVIEW-QUEUE.md) § 5: which rules it flagged `⚠ promote→hook`, how many of the 38 parsed rules (11 judgeable) were ever scored across G2 + G3, and whether the `PostToolUse` cost was noticeable stacked on the existing prettier and `security-guidance` hooks. **Verdict rule**: a scorecard reporting **zero scored edits is `inconclusive`, never `keep`** — that means the sessions edited via Bash and the vehicle produced no data, so the trial re-runs on a vehicle that uses the Edit/Write tools. Then flip the 🟤 BACKLOG entry and the G4 WEEKLY bullet.
- [ ] **Plugins (2 SP)** — two independent tops: best not-yet-reviewed from the **official store** and from the **wider internet** (excluding the Reviewed log + the already-in-use set). Log each with `source:`; `adopt` → 🟤 BACKLOG entry.
- [ ] **Claude best-practices (1 SP)** — top not-yet-reviewed practice (parked: "expertise findings — the human should own ~70% of planning decisions"; "`/clear` between unrelated tasks").
- [ ] **Non-Claude AI best-practices (1 SP)** — top not-yet-reviewed (parked: harness _observability_ — revisit only if `dead-rules-audit` (G4) earns its keep; Spec Kit — already practiced).
- [ ] **Cross-project propagation (1 SP)** — outbound scan of what shipped since 2026-08-27 (G4/G5 closeouts, the 2026-08-28 intake, this week's PRs once merged) + promote one of the two parked outbound items; inbound: re-check whether the origin repo's verdicts on `/wayfinder` / Jenkins / the design videos have landed. `propagate` → TODO § Spawned Tasks row.

---

## Daily Schedule

### Monday, August 31 — 🏆 Honest E2E coverage (G1 day 1)

> Front-load the one item with design risk: the `mlWorker` stub/harness flag under Playwright. Decide stub-vs-flag first (a stub worker file loaded by the harness vs. an env-gated test double inside `ml-worker.js`), then make the D2 property fail before it passes.

| Group                                                                                                          | SP  |
| -------------------------------------------------------------------------------------------------------------- | --- |
| ✅ [**G1. Bulk-rate follow-ups**](#g1-bulk-rate-follow-ups-batch--) [batch] 🏆 🟤 (day 1 of 2 — real worker + D2 assertion; shipped 2026-08-29, merge `66b16af`) | (6) |

**Daily total**: ~4 SP (of the 6 SP batch)

---

### Tuesday, September 1 — G1 finish + PR → G2 start

> Land the three lifecycle fixes + coverage gaps, open the G1 PR; **G4 trials `pr-review-toolkit` on that PR** the same day. Begin G2 with the `reconcileWithFiles` drop-history fix (the one with a design constraint).

| Group                                                                                                                                                                                              | SP  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| ✅ [**G1. Bulk-rate follow-ups**](#g1-bulk-rate-follow-ups-batch--) [batch] 🏆 🟤 (day 2 — lifecycle fixes; merged locally, no PR)                                                                                          | (6) |
| [**G4. Adopt-queue trial batch**](#g4-adopt-queue-trial-batch--cadence-decision-batch--1--folded) [batch] 🟤 (`pr-review-toolkit` on the G1 PR; `dead-rules-audit` installed for the rest of the week) | (3) |
| 🔄 [**G2. Tournament undo hardening**](#g2-tournament-undo-hardening-batch-) [batch] 🟤 (start — reconcile → drop history + CLAUDE.md bullet; ran early, 2026-08-30)                                     | (5) |

**Daily total**: ~5 SP

---

### Wednesday, September 2 — G2 finish + PR → G3 start

> Finish the wedge/guard/keydown items, open the G2 PR. Start G3 with the index script (pure function + CLI + tests) and the 22-file backfill.

| Group                                                                                                                       | SP  |
| --------------------------------------------------------------------------------------------------------------------------- | --- |
| 🔄 [**G2. Tournament undo hardening**](#g2-tournament-undo-hardening-batch-) [batch] 🟤 (finish — 3/4 shipped on branch `a4bf666`, no PR, **unmerged**; Task 4 reverted 2026-08-31) | 5   |
| [**G3. Docs & process guardrails**](#g3-docs--process-guardrails-batch--1--folded) [batch] 🟤 (start — `check-docs-index.js` + backfill) | (6) |

**Daily total**: ~6 SP

---

### Thursday, September 3 — G3 finish + 🔵 polish

> Land the remaining G3 nits (`.vscode`, dead rows, `maxBuffer`, conventions, vitest flake) and open its PR (code + docs → normal `/code-review`). Then the 🔵 exception, G5 — a tight same-code-path pair.

| Group                                                                                                             | SP  |
| ----------------------------------------------------------------------------------------------------------------- | --- |
| [**G3. Docs & process guardrails**](#g3-docs--process-guardrails-batch--1--folded) [batch] 🟤 (finish, PR)           | 6   |
| [**G5. AI-sort training-phase progress polish**](#g5-ai-sort-training-phase-progress-polish-batch-) [batch] 🔵       | 3   |

**Daily total**: ~6 SP

---

### Friday, September 4 — Decisions + Reviews + buffer

> G4's policy + cadence decision (docs-only; it can share G6's branch), then Weekly Reviews, then absorb any G1–G3 review spillover. Closeout: check off shipped groups here (`✅ PR #N`) and each constituent BACKLOG/TODO entry.

| Group                                                                                                                                       | SP  |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| [**G4. Adopt-queue trial batch**](#g4-adopt-queue-trial-batch--cadence-decision-batch--1--folded) [batch] 🟤 (finish — scorecard read-out + 🟡 decision) | 3   |
| [**G6. Weekly Reviews**](#g6-weekly-reviews-batch--overhead) [batch] ⚪                                                                       | (5) |

**Daily total**: ~2 SP + reviews overhead + G1–G3 buffer

---

## Summary Table

| ID  | Group                                             | Domain                                    | Source                  | Tasks                | Total SP | Day       | Status     |
| --- | ------------------------------------------------- | ----------------------------------------- | ----------------------- | -------------------- | -------- | --------- | ---------- |
| G1  | Bulk-rate follow-ups [batch] 🏆                   | JS logic (compare bulk-rate) + E2E harness | 🟤 Auto                 | 4                    | 6        | Mon–Tue   | ✅ merged `66b16af` (no PR, 2026-08-29) |
| G2  | Tournament undo hardening [batch]                 | JS logic (tournament) + CLAUDE.md          | 🟤 Auto                 | 4 (closes 5 entries) | 5        | Tue–Wed   | 🔄 3/4 on branch `a4bf666` (no PR, **unmerged**, 2026-08-31) — Task 4 reverted as unsound, re-filed 🟤 [2026-08-31] |
| G3  | Docs & process guardrails [batch]                 | scripts / tooling / docs                   | 🟤 Auto (+1 🟡 folded)  | 6 (closes 10 entries) | 6       | Wed–Thu   | ☐ Planned  |
| G4  | Adopt-queue trial batch + cadence decision [batch] | Claude Code tooling / process             | 🟤 Auto (+1 🟡 folded)  | 3                    | 3        | Tue + Fri | 🔄 2/3 merged `bf58c01` (no PR) — `dead-rules-audit` read-out at G6 Fri |
| G5  | AI-sort training-phase progress polish [batch]    | JS logic (sort-progress / training)        | 🔵 User                 | 2                    | 3        | Thu       | ☐ Planned  |
| G6  | Weekly Reviews [batch]                            | Research / process                         | ⚪ Overhead             | 4                    | 5        | Fri       | ☐ Planned  |
|     | **Total (quota-counted)**                         |                                           |                         | **19**               | **23**   |           |            |
|     | **Total (incl. ⚪ overhead)**                     |                                           |                         | **23**               | **28**   |           |            |

_Source legend: 🔵 User · 🟡 Ops · 🟤 Auto · ⚪ Overhead (exempt from the quota denominator)._
_At closeout, check off each constituent BACKLOG/TODO entry individually (G2 and G3 each close more entries than they have members — the folds are named in the group bodies). Status cell: `✅ PR #N`, never a bare `✅`._

---

## Notes

- **Why a Cleanup Week, and why "overdue" not "skipped".** Cadence (~3 weeks from July 6–10 → ~July 27–31) fell inside the previous plan's spillover; the 🟤 trigger (~20 SP pending) is exceeded several times over by the post-July slice alone (36 items). Per the planning rule, a Cleanup Week that falls due during a spillover is scheduled now; the cadence clock is **not** reset.
- **Velocity basis**: the two prior Cleanup Weeks delivered **24** (June 15–19) and **21** (July 6–10) quota-counted SP on time — mechanical 🟤 runs at cleanup speed, design-heavy work runs ~14 SP/week (July 13–21). This plan targets **23 quota-counted + 5 ⚪**, with G1's harness change as the only design-risk item, hence front-loaded.
- **What defers again (explicitly, so it is not lost)**: the 🟠 TODO **"Don't re-train likes/dislikes model when only the source folder changed"** + its three 🔵 [2026-08-28] companions (per-folder granularity; `feature_cache.json` vector reuse; the "drop online updates, retrain per sort" discussion) + tier-outcomes-as-ordinal-labels — one design pass, **the next normal week's lead** (8 SP, needs a brainstorm first — consider holding the brainstorm before that week, the 2026-07-12 precedent). Also deferred: 🔴 PR2 hash-off-thread (design-heavy, unchanged since June); the **path-scoped `.claude/rules/` migration** (🟤 [2026-08-27], 3 SP — candidate for the next normal week's single 🟤 slot; ⚠️ `.gitignore` ignores `.claude/*` except `!.claude/agents/`, so shared rules need a `!.claude/rules/` exception, else they stay machine-local — decide before implementing); the remaining PR #65 items (a11y, WheelEvent E2E, Playwright load flake); `typescript-lsp` / `security-guidance` trials.
- **Overrun drop order**: trim **G4** first (keep only the 🟡 decision — the trials are the least time-critical), then **G5** (its two items stay adjacent in BACKLOG and re-enter any week), then G3's conventions member. **Never drop G1** — it is the reason the week exists — and keep G2's `reconcileWithFiles` item even if the rest of G2 slips.
- **Branch/PR shape**: 4 code PRs — G1 (compare bulk-rate + E2E), G2 (tournament), G3 (scripts/tooling/docs — code, so a normal `/code-review`), G5 (sort-progress). G4 + G6 are docs-only (REVIEW-QUEUE / BACKLOG / TODO) and may share one docs-only branch — recognize it as docs-only before any `/code-review` fan-out and merge or dated-defer in-session ([2026-06-29] convention).
- **Out-of-tree surfaces this week touches** (route, don't edit here): the plan/run-card **template** items (`.claude/TEMPLATES/` is global and gitignored) → a TODO § Spawned Tasks row for `claude-code-universal-config`; the repo-side equivalents (`docs/planning/plans/README.md`, `docs/planning/README.md`) are G3's.
- **Reaps — nominated unattended 2026-08-29, user-approved and EXECUTED the same day** (BACKLOG bodies deleted, tombstone rows in Rejected Ideas; the three `toggleViewMode` items replaced by one 🟤 [2026-08-29] "retire the legacy path" entry; a **Reaping** convention added to BACKLOG 📌 Intake rules since none existed):
    1. 🟤 [2026-04-10] _Redundant calls in `switchToSingleModeUI()` via `toggleViewMode()`_ · 🟤 [2026-04-10] _Double `isCompareMode = false` in `toggleViewMode()`_ · 🟤 [2026-03-22] _DRY `toggleViewMode()` single-mode branch_ — three polish items on a path CLAUDE.md declares **legacy** (`#viewModeBtn` is `display:none`; "never `toggleViewMode()`"); one internal caller remains (`media-viewer.js:4268`). Suggest replacing all three with one "retire `toggleViewMode` / `#viewModeBtn`" entry.
    2. 🟤 [2026-05-26] _Dedupe concurrent background extraction (kickoff + Sort-by-AI)_ — its premise was the **folder-load** kickoff overlapping a Sort-by-AI click; PR #56 (P3) removed the folder-load kickoff, and the only remaining `kickoffBackgroundExtractionIfEnabled()` call sits inside the CLIP-sort branch (`media-viewer.js:5603`), which the sort mutual-exclusion guard keeps apart from the AI sort.
    3. 🟡 [2026-04-29] _Defensive recheck: dispatch regression-checker on `43db8af` "after quota reset"_ — the window lapsed four months ago; fully subsumed by its sibling "Full audit of `regression-checker.md`".
    4. 🟤 [2026-07-03] _Pre-June 🟤 doc-drift tail remains uncleared (tracking)_ — tracking-only (Effort "(tracking)"); the planning prompt's standing 🟤-size / Cleanup-cadence check now performs its function every session.
    5. **Flip, not reap** — 🟤 [2026-04-20] _Correct `.sort_cache_clip.json` references in spec + CLAUDE.md_: `grep sort_cache_clip` returns **0 hits** in both `CLAUDE.md` and the Group D spec today (CW-3 fixed the spec; the durable-rules audit rewrote the CLAUDE.md line) → already delivered; check it off with that evidence during G3.
- **Docs-index measurement (2026-08-29)**: 22 files under `docs/superpowers/specs/` + `docs/archive/plans/` have no link in `docs/README.md` — including `2026-07-24-g3-…` and `2026-07-25-g3-…` (spec + plan each, from Aug 24), `2026-05-25-tournament-mode-design.md`, `2026-07-04-cw-v-…-design.md`, and a March/April tail. G3's script must be run against this list before it is wired in, or the hook blocks the very PR that adds it.
- **Strategic-docs staleness check**: ROADMAP / GOALS / MILESTONES `Last Updated` 2026-08-27 (2 days); nothing shipped since contradicts them → no 🟡 refresh entry filed. Next planning session re-checks against this week's merges (G2's CLAUDE.md gotcha edit and G3's `scripts/` bullet are the likely touch points, both in `CLAUDE.md`, not the strategic trio).
- _Brainstorm sanity-checks (self-conducted — unattended run): week dates confirmed Mon Aug 31 – Fri Sep 4, 2026 vs. today 2026-08-29 and vs. git/DONE (previous plan = July 13–17, all 5 groups shipped but delivery spilled to 2026-08-27 — archived under its true header below); velocity ~21–24 SP at cleanup speed vs. ~14 SP design-heavy; Cleanup Week **OVERDUE** (fell due ~July 27–31 inside the spillover; 36 🟤 pending since July 10); inverted quotas satisfiable (🟤 majority from the post-July slice alone); reap nominations listed unattended, then user-approved and executed 2026-08-29._

### Quota Check

- 🔵 **User-Flagged SP**: 3 / 23 (**13%**) — ⚠️ **below the normal ≥50% floor BY DESIGN** — inverted-quota Cleanup Week; the 3 SP is the sanctioned 🔵 exception (G5), mirroring the July 6–10 precedent.
- 🟡 **Operational SP**: 2 / 23 (**9%**) — ✅ ≤25% (vitest flake folded into G3; adopt-queue policy/cadence decision folded into G4)
- 🟤 **Auto-Generated SP**: 18 / 23 (**78%**), **4 groups** (G1, G2, G3, G4) — **inverted**: multiple 🟤 groups are expected in a Cleanup Week (the ≤1-group / ≤25% caps are suspended). 🟤 is the majority of scheduled work.
- **Cleanup Week status**: **ACTIVE** (3rd ever; overdue — fell due ~July 27–31 inside the previous plan's spillover)
- **Last Cleanup Week**: July 6–10, 2026 (the 2nd ever). Next expected ~3 weeks after this one (~late September 2026), cadence clock **not** reset by the overdue slot.
- **Compliance**: ✅ Cleanup-Week quotas met — 🟤 is the majority of quota-counted work, 🟡 ≤25%, 🔵 limited to the sanctioned exception. ⚠️ Deviation from _normal-week_ quotas (🔵 < 50%) is the intended, rule-defined shape of a Cleanup Week, not a violation.
- _Denominator note_: Y = total quota-counted SP (23) **minus** the exempt ⚪ Overhead Weekly Reviews batch (5) — i.e. 28 incl. overhead; percentages are over the 23 quota-counted SP.

---

## Weekly Challenge 🏆

**Bulk-rate follow-ups — honest E2E coverage of the deferred-refresh protocol** (Group G1, Mon–Tue).

**Why this one**: In a Cleanup Week an auto-generated **correctness** item may be the challenge, and this is the most consequential one on the board. PR #66's main correctness property — re-rendering the compare pair only _after_ the model has re-scored (the D2 fix, found by a user smoke that the 500-unit / 55-E2E suite missed) — has **no automated coverage at all**: `mlWorker` is null under Playwright, so the bulk-rating E2E never reaches `_beginDeferredCompareRefresh` and passes for the wrong reason. It is the third recorded instance of "the E2E passed for the wrong reason" in this repo, and the user-side re-smoke that would have caught a regression was never run. The stretch is real: a worker stub or harness flag that makes a deferred, timing-dependent path fail-able under Playwright, without changing production behaviour — which is exactly why it is front-loaded Monday with a Friday buffer.

---

## Previous Week Summary

### Week: July 13 – July 17, 2026 — 🟢 Normal week (24k AI-sort UX lead) — ✅ Complete, but **spilled to 2026-08-27** (all 5 groups shipped)

**Spillover**: through 2026-08-27 — G1 and G2 landed 2–4 days late (PR #64 Jul 20, PR #65 Jul 21), then a ~5-week availability gap, then G3 (PR #66, Aug 24 — merged on user direction, re-smoke round 2 not run), G4 (`a843d36`, Aug 27, no PR) and G5 (`4f1e65a`, Aug 27, no PR, a catch-up run) closed the plan 6 weeks after its Friday. No `**Spillover**` line was recorded at the time; archived here under its **true** header week. **The Cleanup Week that fell due (~July 27–31) during this spillover is the reason the August 31 week is one.**

**Result**: 21 SP quota-counted + 5 overhead, all delivered. **G1 🏆** AI-sort startup UX & incremental cache-load (PR #64 `b6ff4ac`) — determinate progress card, cached features served, real cancel; **real-24k smoke PASSED 2026-07-20** on a 20,929-file folder after a smoke-triggered **data-loss incident** (a 126 MB feature cache overwritten with 32 entries; restored from the user's `.bak`) was root-caused and fixed pre-merge (`2777bdf`, `c947081`). **G2** tournament-mode bug fixes (PR #65 `937084c`) — the intermittent undo failure was `handleTournamentUndo` peeking `moveHistory` instead of `engine.history` (now the single chronological undo stack); mouse-wheel guard; header auto-hide; 6-point user smoke PASSED. **G3** bulk-rate re-pair avoidance (PR #66 `0b00275`) — exact-pair suppression + fall-through; round-1 smoke found 2 real defects both fixed; ⚠️ merged on user direction without round 2 and the D2 fix has no automated coverage (→ this week's 🏆). **G4** strategic-doc refresh (`a843d36`) — GOALS/ROADMAP/MILESTONES unfrozen from Feb 2026 with 7 late amendments after a re-verify; **G5** Weekly Reviews catch-up (`4f1e65a`) — 3 adopt / 1 pass / 1 propagate, REVIEW-QUEUE §4 created. Unit tests 434 → **513**; E2E 52 → **55**. Closed the _24k AI-sort smooth_ milestone (2026-07-20); v2.0 modularization promoted to the roadmap's Now column because the renderer grew 7,864 → 9,418 lines with zero extractions.

**Velocity learning**: 14 SP (G1+G2, design-heavy + real-24k smokes) in ~7 working days; the tail was availability, not effort. A plan whose delivery outruns its header by weeks silently skips the cadence-driven work that fell due in between — record the `**Spillover**` line as soon as the slip is known.

### Week: July 6 – July 10, 2026 — 🧹 Cleanup Week (2nd ever) — ✅ Complete (all 5 groups merged)

**Result**: The 2nd Cleanup Week (inverted quota; 21 SP quota-counted + 4 overhead). All five groups shipped, merging across PRs #59–#63. **CW-T** tournament correctness & hardening — the 2 HIGH-severity 🔵 blockers (24k freeze / Both-Win hang → O(1) inverse-delta undo + `showTournamentPairFast`; cannot-enter-after-add-media+AI-sort → `reconcileWithFiles` on every entry) + 6 🟤; **real-24k smoke PASSED**; PR #59 (`ae9588d`), post-merge review found 2 real bugs both fixed pre-merge (`f4b7807`). **CW-D** docs & CLAUDE.md hygiene (5 items; PR #60 `dba3ecf`). **CW-V** test & tooling backfill (4 test-only items; PR #61 `85f1f29`). **CW-P** process & DX guardrails — automated pre-push E2E gate + Weekly-Reviews methodology consolidation + ref-sweep bullet (PR #63 `f6c2c46`). **WR** Weekly Reviews 2nd run (2 adopt: `typescript-lsp`, autonomous verification; 2 pass; PR #62 `291879c`). Unit tests 411 → **434**; E2E 52/52 green. The freshest 🟤 slice (PR #54–#58 follow-ups) burned down; the older April–May 🟤 tail remains for a future Cleanup Week.

**Velocity learning**: the ~8 SP non-mechanical tournament core (design + PR-review + real-24k smoke) ran below its nominal, while the ~13 SP mechanical 🟤 (docs/tests/process) moved at cleanup speed.

### Week: June 22 – June 26, 2026 — 🟢 Normal perf week — ✅ Mostly complete (spilled to June 30)

**Result**: A 19 SP (quota-counted) performance push. Four of five groups shipped, spilling ~4 days past Friday: **P2** tournament large-folder perf (PR #55, June 25), **P3** feature-extraction timing → pure-lazy (PR #56, June 26), **WR** Weekly Reviews first run (PR #57, June 29), **T1** tournament exit affordances (PR #58, June 30). Unit tests 381 → **389**; E2E green. **Group P1 (sort-perf PR2 hash-off-thread + PR3 cache-load) did NOT ship** — only its PR1 had merged (June 20, PR #54); its PR3 slice shipped in the July 13–17 week (PR #64), PR2 remains open.

**Velocity learning**: ~14 SP quota-counted actually shipped in-window (P2 8 + P3 3 + T1 3), with P1 (5 SP) carried — design-heavy work runs below the nominal once diagnosis + PR-review + real-folder-smoke overhead is counted.

### Week: June 15 – June 19, 2026 — 🧹 Cleanup Week (1st ever) — ✅ Complete (shipped on time)

**Result**: The first-ever Cleanup Week. All five groups (CW-1…CW-5) delivered at the 24 SP target, on schedule. Six PRs merged (#47–#52). Unit 310 → **345**; E2E returned to green (42/43 → 48/48). Key: CW-5 🏆 frame-0-first streaming animated-JXL decode (PR #47); CW-1 7 defensive renderer guards consolidating 14 PR-review follow-ups (PR #48); CW-2 E2E green + first tournament Playwright coverage (PR #49); CW-3 docs & backlog hygiene (PR #50); CW-4 dependency-free pre-commit secret guard + pre-archive checklist (PR #51/#52).

### Week: June 1 – June 5, 2026 — ✅ Complete (ran long: finished 2026-06-11)

All 5 groups delivered (30 SP planned; consumed 9 working days). Seven PRs merged (#40–#46). Unit 244 → 297. Group 0 re-rate/mode-correction (PR #40/#41), Group A 🏆 JXL viewer (PR #42), Group B mode-switch bugs (PR #43/#44), Group C CLIP extraction UX (PR #45), Group D security audit ✅ PASS (PR #46).

### Week: May 11 – May 15, 2026 — ✅ Complete

All 6 groups delivered (25 SP). Tournament Mode (Groups E + F) shipped 2026-05-25 with a deterministic-UX + feature-cache-streaming polish pass 2026-05-26.

### Week: April 13 – April 17, 2026 — ✅ Complete

All 6 groups delivered, 25 SP. See `docs/archive/plans/` and `docs/planning/DONE.md`.
