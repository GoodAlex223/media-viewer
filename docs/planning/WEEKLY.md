# Weekly Plan

**Week**: Monday September 7 – Friday September 11, 2026
**Created**: 2026-09-03
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md (all `Last Updated` 2026-08-27 — nothing shipped since contradicts them; the renderer's "losing ground" note is _more_ true, not less), BACKLOG.md (📌 Process Rules + 🔵 [2026-08-28] intake + the post-Aug-29 🟤 slice + 🟡), TODO.md (🟠 ML-retrain item + § Spawned Tasks), git log (last 2 weeks: G1 `66b16af`, G4 `bf58c01`, G2 `6305a7a`, G3 `45a0d9b`, G5 `0d3fed5`, G6 PR #67 `de4bdac`), previous WEEKLY.md (Aug 31–Sep 4 Cleanup Week #3 — complete, on time, archived below), REVIEW-QUEUE.md (§§1–5; last run 2026-09-02)
**Cleanup Week?**: **No.** Cleanup Week #3 ended 2026-09-04 (all groups merged by Sep 3); the ~3-week cadence puts #4 at ~September 21–25. ⚠️ The **🟤-size trigger has already re-fired**: measured 2026-09-03, **47 unchecked 🟤 items** sit in sections dated since July 10 (five of them a closeout miss, see Notes), and Cleanup Week #3 _filed_ more 🟤 than it _closed_. Surfaced per the rule; recommendation is to hold the cadence rather than run two Cleanup Weeks back-to-back, since the 🔵 [2026-08-28] intake has waited since August and the ≥50% floor is a hard rule. Confirmed by the user 2026-09-03 (Notes → rulings).
**Context**: Roadmap phase _Scale & Modularize_; active milestone _v2.0 modularization_ (2/6 managers, renderer at 9,642 lines — +224 during the cleanup week, still zero extractions). This week's throughline is **"train on the truth, once"**: the promoted 🟠 ML-retrain item and its four 🔵 companions become one design pass (🏆 G1) whose spec rules on the training-set identity, the vector cache, the fate of the online-update protocol, and the MLManager boundary — with the two remaining zero-CLIP doors and a worker test harness as the week's single 🟤 slot (G4). The secondary theme is **"reachable controls"**: window-anchored overlay buttons (G2, closes the low-height clipping and badge reports by construction) and compare-mode special hotkeys + tooltips (G3) — and G2 is the first UI change this repo requires to ship with **committed visual evidence**. Weekly Reviews (G5) run Friday and carry the § 5 context-cost read-out.

---

## Parallel Work

- **TODO § Spawned Tasks — three rows, zero applied (user-side, two-trees edits).** The `realness` rating axis (2026-08-27), the negative-finding evidence rule (2026-09-02), and the plan-template closeout block (2026-09-02) all target `~/.claude` + `claude-code-universal-config` and cannot be applied from this tree. G5's §4 records their applied/unapplied state; the burn-down question REVIEW-QUEUE.md § 4 put to "the next planning conversation" is an open question below.
- **User-side 24k smokes (optional, not gates)**: PR #66 re-smoke round 2 (never run; G1's real-worker E2E covers the D2 path automatically since `66b16af`); and a first look at G5's progress card on the real folder — the visual-verification practice that § 5 measured as never performed.
- **REVIEW-QUEUE §4 inbound** (`/wayfinder`, Jenkins, the design-video sub-batch) — third consecutive check at G5; per the 2026-09-02 note, if still unchanged upstream, **ask the origin repo directly** instead of re-checking a fourth time.
- **Parked branch `g2-serialization-wip` (`b155374`, on `origin`)** — untouched until 🟤 [2026-08-31] item 1 (the un-awaited re-entrant `showTournamentPair()`) is scheduled; a Cleanup Week #4 candidate, not this week's.

---

## Task Groups

### G1. ML training pipeline — design pass + retrain skip [solo] 🔵 🏆

**Domain**: JS logic (ML training / feature cache) — `media-viewer.js` (`trainFromHistoricalRatings`, `resetMlModel`, `collectBulkRatedTrainingExamples`, `computeFeatures`, `loadFeatureCache`), `ml-worker.js`, a **new ES module** for the new logic, `CLAUDE.md`
**Source**: 🔵 User-Flagged — TODO 🟠 _"Don't re-train likes/dislikes model when only the source folder changed"_ (promoted 2026-08-28) + BACKLOG 🔵 `### [2026-08-28]` companions: per-folder change granularity; `feature_cache.json` vector reuse for training; _"Discuss: drop online per-rating updates, retrain per AI-sort request"_; tournament tiers as ordinal labels and file-size weighting (**decision-only** — recorded in the spec, not implemented)
**Total SP**: 8 — brainstorm (user-in-the-loop) → spec → plan → implement + tests → review → merge (Mon–Wed)

> The week's 🏆 and its reason to exist. The five items pull in opposite directions — the TODO wants _fewer_ retrains, the discussion item wants _one per sort_ — and the entry's own note says the reconciling mechanism is a persistent training-vector cache. That cache does not exist: `.feature_cache.json` is per-**source**-folder (`media-viewer.js:~7135`, `baseFolderPath`) and never covers the like/dislike folders, and `computeFeatures()` consults only the in-memory cache that `loadFolder()` clears. Verified at planning: `resetMlModel()` runs on every folder change (five call sites, `~461–504`, `~1979`), which is what re-arms `trainFromHistoricalRatings()` (`~7651`). ⚠️ **Design point the entries miss**: `collectBulkRatedTrainingExamples()` re-injects the _source_ folder's `.bulk_rated.json` on every rebuild, so a source switch _does_ change the training set even when the like/dislike folders are untouched — the spec must say whether the cached model is "historical base + per-source bulk deltas" or is simply rebuilt from cached vectors (cheap once vectors are cached). **Two constraints**: (1) the spec must **rule on the online-update / re-score protocol** — on _drop_, the deferred-compare-refresh 🟤 cluster (the `[2026-08-29]` G1-closeout and `[2026-08-30]` entries about `pendingCompareUpdates`, `_cancelDeferredCompareRefresh`, `scoreComplete`) is reaped at closeout with that decision as evidence; on _keep_, that cluster is the next week's 🟤 slot; (2) **new logic lands in a new ES module** (v2.0 pattern: manager/helper + constructor-injected host callbacks — the seed of MLManager), not in `media-viewer.js`, which grew 224 lines during a Cleanup Week.

- [ ] **Brainstorm + spec** (user-in-the-loop, Mon) — cover: training-set identity (a fingerprint of the like/dislike folders — names + sizes + mtimes, the same staleness rule the feature cache uses); where cached training vectors live (a per-training-folder cache vs. extending the per-source file); per-folder granularity (only changed folder re-extracted); the online-update protocol's fate; tiers-as-ordinal-labels and file-size weighting as recorded decisions (the intake already recommends the composite key _outside_ the model). Spec to `docs/superpowers/specs/2026-09-07-ml-training-pipeline-design.md`. (3) — TODO 🟠 + 🔵 [2026-08-28] ×5
- [ ] **Implement the retrain skip + training-vector cache** in the new module — `resetMlModel()` on a source-only switch keeps the trained model when the like/dislike fingerprint is unchanged; a changed folder re-extracts only its own files; cached vectors are reused across sessions; abort + progress ride the existing sort card (`updateSortProgress`, the single-owner `finally` in `handleSortByPrediction`); unit tests for the fingerprint, the cache hit/miss/stale paths, and the bulk-rated re-injection decision; E2E: a source-folder switch after a warm model does **not** re-enter the historical phase. (4) — TODO 🟠 + 🔵 [2026-08-28] ×3
- [ ] **Docs + closeout rulings** — CLAUDE.md § State Management `resetMlModel()` bullet and the module line in § Architecture; PROJECT.md if the module list is asserted there; the deferred-refresh cluster ruling recorded on each affected 🟤 entry (reap or "next 🟤 slot"), and the two decision-only 🔵 items annotated with the spec's decision. (1)

### G2. Reachable overlay controls [batch] 🔵

**Domain**: CSS layout + renderer DOM — `styles.css` (`.media-container` `align-items:center` → content-sized wrappers; `.media-wrapper` `overflow:hidden`; `.media-overlay-controls` `position:absolute; bottom:56px` — all three verified at planning), `media-viewer.js` (`addMediaOverlayControls` ~3245–3294, `displayPredictionBadge` ~7784–7817), `index.html` (button order), `tests/e2e/compare-mode.test.js`, fixtures
**Source**: 🔵 User-Flagged — `### [2026-08-28]` batches 3 + 5: window-anchored per-media buttons; low-height clipping (blocks rating outright); badge clipping; Like-left / Dislike-right everywhere. **Folds** 🟤 `[2026-03-21] TASK-021` _"Smart overlay positioning"_ (same root cause; its "rare / low priority" note is contradicted by the user report — close it with this group)
**Total SP**: 5 — one branch, one review (Thu)

> One geometry fix closes three reports: anchoring the per-media buttons to the window/column (level with the shared `#compareActionBar`, revealed by hovering the **buttons**, not the wrapper) removes the wrapper-height dependency that clips both the buttons and the badge on short media. Tournament mode reuses the same wrappers (`showTournamentPairFast`), so it is fixed by the same change — verify the `.media-overlay-controls` visibility rules at `styles.css:~2364–2380` still hold there. ⚠️ **Acceptance includes visual evidence — a control, not a norm.** REVIEW-QUEUE § 5 measured that G5 shipped a progress-card change with zero visual evidence past five reviewers. This group is not done until **before/after screenshots** captured through the existing E2E harness (`launchApp()` + `page.screenshot()` — the capability §1b established is already in `tests/e2e/helpers/`) for a normal fixture **and a low-height fixture** are committed (e.g. `docs/superpowers/specs/assets/`), and a computed-visibility E2E asserts the short-media buttons are inside the viewport and clickable. The deterministic _gate_ (🟤 [2026-09-02]) is not built this week — see Notes; this group performs the practice under a plan-level check instead.

- [ ] **Window-anchored per-media overlay buttons** in compare + tournament, reveal on hovering the buttons, level with the shared controls — fixes the low-height clipping by construction; add a wide-and-short PNG fixture (e.g. 64×4) to `tests/e2e/fixtures/`; screenshots before/after on both fixtures. `styles.css`, `media-viewer.js` (`addMediaOverlayControls`), `tests/e2e/` (3) — 🔵 [2026-08-28] ×2 + folds 🟤 [2026-03-21]
- [ ] **Prediction badge out of the wrapper** — anchor `.prediction-badge` to the column/window with the buttons so it stays in view on short media; keep `pointer-events:none`. `styles.css:~964–1010`, `media-viewer.js` (`displayPredictionBadge`) (1) — 🔵 [2026-08-28]
- [ ] **Like on the left, Dislike on the right on all four surfaces** — single bottom bar, compare left/right static controls, the dynamic overlay's append order (zoom → special → like → dislike); the action bar already models it. `index.html:~185–232`, `media-viewer.js:~3290–3293` (1) — 🔵 [2026-08-28]

### G3. Compare-mode special hotkeys + tooltips [batch] 🔵

**Domain**: keyboard shortcuts + tooltips — `media-viewer.js` (`DEFAULT_SHORTCUTS.compare`, `executeAction`, `checkShortcutConflict`, `ACTION_LABELS`, F1 help overlay, `addMediaOverlayControls` title), `index.html` (`#specialBtn` / `#leftSpecialBtn` / `#rightSpecialBtn` titles), `tests/media-viewer-utils.test.js`, `CLAUDE.md` L185
**Source**: 🔵 User-Flagged — `### [2026-08-28]` batches 2 + 3: compare `1`/`2` special hotkeys; special-folder hotkey in button tooltips
**Total SP**: 3 — one branch, one review (Thu–Fri); branch **after G2 merges** (both touch `index.html` and `addMediaOverlayControls`)

> ⚠️ **Premise corrected at planning — cheaper than filed.** Both the BACKLOG entry and CLAUDE.md L185 say this "requires the versioned shortcut-localStorage migration in `loadShortcuts()`". That migration **already exists** (`media-viewer.js:~9386`, v1 → v2), and its own comment states the rule that makes it unnecessary here: keys that were never stored "simply fall through to defaults" through `Object.assign({}, DEFAULT_SHORTCUTS.compare, custom.compare)`. Adding `leftSpecial`/`rightSpecial` is **additive** — no version bump. Bump only when an existing default _changes_. Verified `DEFAULT_SHORTCUTS.compare` has no special bindings today and that `Digit1`/`Digit2` are unbound in compare mode.

- [ ] **Compare-mode `Digit1` / `Digit2` → `moveToSpecialFolder('left' | 'right')`** — `DEFAULT_SHORTCUTS.compare` + the mode-keyed reverse map (dispatch isolation comes from `buildReverseMap()`, per CLAUDE.md), `executeAction` compare branch, conflict check, F1 help overlay rows; unit tests for dispatch + no-conflict; no migration (see above). `media-viewer.js` (2) — 🔵 [2026-08-28]
- [ ] **Tooltips carry the special hotkey where one is bound** — tournament (`1`/`2`) and compare (after the item above); single mode has **no** special binding, so its tooltip stays bare unless the group decides a binding is trivial (out of scope otherwise — say so in the plan). Static titles in `index.html`, the dynamic title in `addMediaOverlayControls`. (1) — 🔵 [2026-08-28]
- _Doc ride-along (0 SP)_: rephrase CLAUDE.md L185 — the migration exists at v2; bump for changed defaults only, never for additive keys.

### G4. ML pipeline integrity [batch] 🟤

**Domain**: JS logic (CLIP lifecycle) + test infrastructure — `media-viewer.js` (`initClipModel`, `_handleClipUnloadTimer`, `startBackgroundFeatureExtraction`, `handleSortByPrediction` Phase 1), `ml-worker.js`, new `tests/ml-worker.test.js`
**Source**: 🟤 Auto-Generated — `### [2026-09-02] From: G5 closeout` ×3 (the week's **single** 🟤 group)
**Total SP**: 5 — one branch, one review (Mon–Tue, **before** G1's implementation touches the worker)

> Chosen for the 🟤 slot over the deferred-refresh cluster (gated on G1's protocol decision — fixing it first could be wasted work) and over the visual-verification gate (see Notes). Same corruption class G5 closed — zero-CLIP training halves — reached by other doors, plus the harness that pins the worker contract G1 is about to change. **Premises measured at planning, one of two held**: (a) the **unload-timer door is confirmed** — `clipUnloadTimer` is armed at the end of extraction (`~9121`) and cleared only by the settings toggle (`~1984`) and `startBackgroundFeatureExtraction`'s head (`~8972`), **never** by `initClipModel()` (`~8523`); `handleSortByPrediction` skips Phase 1 when `clipWorkerReady` is already true, so an extraction that finished <30 s earlier leaves a live timer across the whole training loop, and `_handleClipUnloadTimer` flips `clipWorkerReady=false` mid-loop; (b) the **"un-awaited caller" premise did not reproduce** — both `startBackgroundFeatureExtraction()` callers await `initClipModel()` first (`~8100` and `~8953`, the latter with a comment describing exactly this bug); the residual door is a load that returns `success:false` (or CLIP toggled off) while extraction proceeds and caches 64-dim entries. Treat (b) as a decision, not a fix.

- [ ] _0 SP housekeeping — closeout miss found at planning_: **check off the five PR #65 entries G2 shipped** (BACKLOG `### [2026-07-21]`: `reconcileWithFiles` untracked prune; failed special-restore wedge; document the `exitTournamentMode` invariant; empty-state keydown guard; CLAUDE.md line-191 split) with `6305a7a` + the G2 commits as evidence — all five read `- [ ]` today although WEEKLY, DONE and the archived plan record them shipped. Do it in this branch's first commit so the evidence is one `git log` away.
- [ ] **Close the remaining zero-CLIP doors** — (a) clear `clipUnloadTimer` wherever the model is _demanded_, not only where extraction starts: in `initClipModel()` and in `handleSortByPrediction`'s Phase 1 even when `clipWorkerReady` is already true; unit test: a pending timer cannot flip `clipWorkerReady` during a sort (arm → sort → advance fake timers → assert ready). (b) decide the `success:false` door: either refuse to cache CLIP-less entries while `enableClipFeatures` is on (extraction stops, user told), or record on the entry that the self-healing `!hasClip` re-extract filter is the accepted answer and the "un-awaited caller" mechanism was not reproduced. `media-viewer.js` (2) — 🟤 [2026-09-02] G5 closeout ×2
- [ ] **`ml-worker.js` unit harness** — `importScripts` shim + `globalThis.self` stub (the `sorting-worker.js` house pattern, adapted); pin the four `updateProgress` sites, the abort-flag protocol, and the `trainHistorical` / `scoreComplete` / `sortComplete` reply shapes; drive via `self.onmessage`. Lands before G1 changes `trainHistorical`. `tests/ml-worker.test.js` (new), `ml-worker.js` (conditional CJS export only if unavoidable) (3) — 🟤 [2026-09-02] G5 closeout

### G5. Weekly Reviews [batch] ⚪ Overhead

**Domain**: Research / process (exempt overhead — excluded from the source-quota denominator)
**Source**: ⚪ Overhead
**Total SP**: 5 — Friday, low-risk, must not displace G1–G4

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. Codified methodology: hybrid sourcing, lightweight inline research, a **run-card** (not a spec+plan), docs-only handling (merge or dated-defer in-session). **Window ≈ 9 days** (last run 2026-09-02) — `pass (no new candidate)` rows stay legitimate for §1. **Run order is load-bearing (D4 precedent)**: read out § 5 first — the context-cost audit's vehicle is _this run_ — which drops the outstanding-trial count to 2 (`typescript-lsp`, the evidence-gating gate, both vehicled to Cleanup Week #4) and lifts the cap before §§1–3 source anything. The audit's tab readings live in the user's Claude Code UI, so this item is **user-in-the-loop** like G4's trials were; if the user is not available, record `pending — needs the Installed-tab readings` rather than inventing a token figure from file sizes.

- [ ] **§ 5 read-out — installed-plugin context-cost & disuse audit** (0 SP, carried from the 2026-09-02 `adopt`): record every installed plugin's `Context cost` / `Last used` / **Not used recently** as a table in § 5; disable or uninstall anything both expensive and unused; **revisit `dead-rules-audit`'s keep-installed disposition on the spot** if its cost is real. — 🟤 [2026-09-02] Weekly Reviews item 1
- [ ] **Plugins (2 SP)** — official store + wider internet, each with `source:`; roundups are leads to check against the primary roster, never a source for a verdict (two consecutive runs asserted nonexistent official plugins).
- [ ] **Claude best-practices (1 SP)** — hybrid: fresh check vs. the parked list (third consecutive run the fresh check won; if a fourth, drop non-candidates from Next-up).
- [ ] **Non-Claude AI best-practices (1 SP)**
- [ ] **Cross-project propagation (1 SP)** — outbound: scan this week's merges (G1–G4) with the high bar; likely candidates are the two _planning-time_ lessons this plan produced (a BACKLOG entry's mechanism is a hypothesis to re-measure; a closeout must flip the entries it closes) only if absent globally — grep the target, never assume. Inbound: third check; if unchanged, **ask the origin repo directly**. Record the applied/unapplied state of the three § Spawned Tasks rows and the user's ruling on the `propagate` burn-down question (open question below); if the ruling is "extend § 5", add the outcome-row convention to § 4 Conventions in this run.

---

## Daily Schedule

### Monday, September 7 — 🏆 Design the training pipeline; pin the worker

> Front-load the one user-dependent step: the G1 brainstorm (Monday morning if the user is available; otherwise G4 leads the day and G1 shifts to Tue–Thu). G4 starts with the worker harness so it lands before G1's implementation touches `ml-worker.js`.

- **[G1](#g1-ml-training-pipeline--design-pass--retrain-skip-solo--)** 🔵 🏆 — brainstorm + spec (part 1 of 3)
- **[G4](#g4-ml-pipeline-integrity-batch-)** 🟤 — housekeeping flip + worker harness (part 1 of 2)

**Daily total**: ~6 SP

### Tuesday, September 8 — G1 plan → implement; G4 lands

- **[G1](#g1-ml-training-pipeline--design-pass--retrain-skip-solo--)** 🔵 🏆 — plan + implementation start (part 2 of 3)
- **[G4](#g4-ml-pipeline-integrity-batch-)** 🟤 — zero-CLIP doors; review; merge (part 2 of 2)

**Daily total**: ~6 SP

### Wednesday, September 9 — G1 finish

- **[G1](#g1-ml-training-pipeline--design-pass--retrain-skip-solo--)** 🔵 🏆 — tests, review, merge, closeout rulings on the deferred-refresh cluster (part 3 of 3)

**Daily total**: ~4 SP (+ review)

### Thursday, September 10 — Reachable controls

> G2 first (it owns the shared `index.html` / `addMediaOverlayControls` touch points); G3 branches from `main` after G2 merges. G2's screenshots are captured before the review, not after.

- **[G2](#g2-reachable-overlay-controls-batch-)** 🔵 — all three items + visual evidence
- **[G3](#g3-compare-mode-special-hotkeys--tooltips-batch-)** 🔵 — start (hotkeys)

**Daily total**: ~6 SP

### Friday, September 11 — Finish + Reviews + buffer

- **[G3](#g3-compare-mode-special-hotkeys--tooltips-batch-)** 🔵 — tooltips, CLAUDE.md L185, merge
- **[G5](#g5-weekly-reviews-batch--overhead)** ⚪ — § 5 read-out first, then §§1–4
- Buffer for G1/G2 review spillover; closeout: Summary-Table statuses (`✅ <merge-SHA>`), constituent BACKLOG/TODO entries checked off **in the same commit as the closeout**, DONE entries.

**Daily total**: ~3 SP + reviews overhead + buffer

---

## Summary Table

| ID  | Group                                                  | Domain                                        | Source      | Tasks | Total SP | Day     | Status     |
| --- | ------------------------------------------------------ | --------------------------------------------- | ----------- | ----- | -------- | ------- | ---------- |
| G1  | ML training pipeline — design pass + retrain skip [solo] 🏆 | JS logic (ML training / feature cache) + new module | 🔵 User     | 3     | 8        | Mon–Wed | ☐ Planned  |
| G2  | Reachable overlay controls [batch]                     | CSS layout + renderer DOM + E2E evidence      | 🔵 User     | 3 (closes 4 🔵 + 1 🟤) | 5 | Thu | ☐ Planned  |
| G3  | Compare-mode special hotkeys + tooltips [batch]        | Shortcuts + tooltips                          | 🔵 User     | 2     | 3        | Thu–Fri | ☐ Planned  |
| G4  | ML pipeline integrity [batch]                          | JS logic (CLIP lifecycle) + test infra        | 🟤 Auto     | 3 (+1 housekeeping) | 5 | Mon–Tue | ☐ Planned  |
| G5  | Weekly Reviews [batch]                                 | Research / process                            | ⚪ Overhead | 5     | 5        | Fri     | ☐ Planned  |
|     | **Total (quota-counted)**                              |                                               |             | **11** | **21**  |         |            |
|     | **Total (incl. ⚪ overhead)**                          |                                               |             | **16** | **26**  |         |            |

_Source legend: 🔵 User · 🟡 Ops · 🟤 Auto · ⚪ Overhead (exempt from the quota denominator)._
_Status cell on completion: `✅ <merge-SHA>` (this project merges locally with no PR by default — four of four groups last week; `✅ PR #N` only where a PR was actually opened). Never a bare `✅`. Check off each constituent BACKLOG/TODO entry in the same commit — the miss G4 item 0 corrects came from doing it in a separate step._

---

## Notes

- **Why 21 SP and not 14.** Normal weeks historically shipped ~14 SP in-window (June 22–26, July 13–17 — both design-heavy, both spilled), but Cleanup Week #3 shipped 23 quota-counted + 5 overhead in four working days. This plan sits between the two on purpose: one design-heavy solo (G1) and three mechanical-to-moderate batches. **Overrun drop order**: trim **G3** first (its two items re-enter any week), then **G4's harness** (keeps the 🟤 share at 2/18 = 11% if G3 is also gone — dropping G3 alone would push 🟤 to 5/18 = 28%, over the cap, so the two drops go together), then G2's Like/Dislike order item. **Never drop G1**; if the Monday brainstorm cannot happen, G1 shifts to Tue–Thu and G2 moves to Monday.
- **Cleanup cadence — surfaced, not acted on.** Measured 2026-09-03: **207 unchecked 🟤 items in total, 47 in sections dated since July 10** (the last Cleanup Week's end), five of which are the PR #65 closeout miss. Cleanup Week #3 filed 32 🟤 items across its own closeouts and reviews while closing 24 — the inflow is the review/closeout process itself, and it outpaces cleanup weeks. Both project triggers (cadence ~3 weeks; ~20 SP pending) point at **Cleanup Week #4 on September 21–25** with the 🟤 trigger already fired. Recommendation: hold that date rather than run back-to-back; at that planning session, run a **reap pass over the April–May tail** (it has now survived three Cleanup Weeks) before scheduling anything from it. Its natural contents: the deferred-refresh cluster (if G1 keeps the protocol), the un-awaited re-entrant tournament render (🟤 [2026-08-31] item 1 → unblocks the guard and the parked branch), the visual-verification **gate** with `typescript-lsp` as the trial batch, the derived-count pre-commit check, the `SKIP=<check>` hook bypass, and the pre-push-friction 🟡 measurement.
- **Why the 🟤 slot is G4 and not the visual-verification gate.** The gate (🟤 [2026-09-02], M) named "the next group with a user-visible UI change" as its trial vehicle — that is G2. It is not built this week because the single 🟤 slot went to a corruption class (zero-CLIP training halves) over a process gate, and because policy b+ batches trials in Cleanup Weeks by default. So G2 performs the practice under a **plan-level acceptance check** (committed screenshots + a computed-visibility E2E, reviewer-verified), and the gate's deterministic trial is **re-vehicled once** to the first UI group after Cleanup Week #4 builds it. Stated plainly because the gate entry says a re-vehicle without evidence is the signal to drop the practice: G2's artifacts are that evidence, or their absence is. **Open question 1** lets the user swap the slot.
- **Deferred-refresh cluster is gated on G1, deliberately.** The `[2026-08-29]` G1-closeout and `[2026-08-30]` pr-review-toolkit / G4-closeout entries about `pendingCompareUpdates`, `_applyModeSwitch`, `mlWorker.onerror`, `scoreComplete: null`, the scoring run-id and the per-window token are all lifecycle defects in the **online-update / re-score protocol** — the very thing the 🔵 discussion item proposes to remove. Fixing them before the decision could be wasted; leaving them unranked would violate the standing rule to rate lifecycle findings by what they corrupt. The most consequential (`_applyModeSwitch` → a wrong-pair render under tournament chrome) is named in G1's ruling so it is fixed first if the protocol stays.
- **Premises corrected at planning** (measure before scheduling): (1) G3 needs **no** shortcut migration — it exists at v2 and additive keys fall through to defaults; CLAUDE.md L185 rides along. (2) G4's "un-awaited caller" mechanism did not reproduce; the unload-timer door did. (3) `regression-checker.md` still says "~7400 line" against 9,642 — the 🟡 [2026-04-29] option (a) "drop the number" is XS and can ride with any CLAUDE.md-touching group; not scheduled as its own item.
- **Closeout miss found at planning**: BACKLOG `### [2026-07-21] PR #65 review follow-ups` still shows all nine entries unchecked, although G2 shipped five of them (`6305a7a`; WEEKLY G2 row, DONE 2026-08-31 and the archived plan all record it). The G2 closeout commit (`1d8868c`) filed two new entries and did not flip the five it closed. Scheduled as G4 item 0 rather than fixed silently here (unattended run; BACKLOG edits beyond the plan are user-gated). The general fix is the "closeout is written before the merge" 🟤 [2026-08-31] item 2 — this is its fifth instance.
- **Modularization is not scheduled and the renderer grew again.** Roadmap Now column: v2.0 extractions; reality: 0 of 4 started, `media-viewer.js` 9,418 → 9,642 during a Cleanup Week. G1's "new logic in a new module" constraint stops this week's growth at the source and seeds MLManager; the first real extraction (or PR2 hash-off-thread, TODO 🔴, unscheduled since June) is proposed as the **Sep 14–18 lead** — open question 4.
- **Branch/PR shape**: four code branches (G1, G2, G3, G4), each reviewed locally and merged `--no-ff` with no PR unless the user asks; G5 docs-only, merged or dated-deferred in-session. G3 branches after G2 merges (shared `index.html` / `addMediaOverlayControls`). G4 lands before G1's implementation (shared `ml-worker.js`).
- **Strategic-docs staleness check**: ROADMAP / GOALS / MILESTONES `Last Updated` 2026-08-27 (7 days); nothing shipped contradicts them → no 🟡 refresh entry. Their renderer figure ("~9,400") is a restated derived value the [2026-09-02] sweep item already owns — not refreshed here.
- **Reaps — nominated unattended 2026-09-03, user-approved and EXECUTED the same day** (BACKLOG bodies deleted, tombstone rows in Rejected Ideas; the three touched section headers lost their `(N items)` count per the derived-count convention rather than having it refreshed):
    1. 🟤 `[2026-07-21] PR #65` _"Trailing `await showTournamentPair()` is uncovered by any `isLoading` guard"_ — **superseded**: re-filed 2026-08-31 as _"Re-entrancy guard for the tournament handler family — BLOCKED on item 1"_ with its proposed `isLoading` remedy measured wrong; the original is now a duplicate carrying a known-bad fix. ✅ reaped.
    2. 🟤 `[2026-08-24] PR #66` _"Two existing BACKLOG entries are now more reachable"_ — **tracking-only**: it names no action of its own; its two actions are the canonical 🟤 `[2026-03-21] TASK-020` entries (ML re-score feedback; `signalUserActivity()` before the guard). Annotate those two with the reachability note and tombstone this one — the same class as the reaped [2026-07-03] tail entry. ✅ reaped; both TASK-020 entries annotated.
    3. 🟤 `[2026-08-30] From: G4 closeout` _"Browser/MCP tooling writes artifacts into the repo root"_ — **watch with its decision already taken**: user chose "remove, don't ignore" on 2026-08-30; `.playwright-mcp/` is absent today; no action exists unless it recurs. ✅ reaped.
    4. **Flip, not reap** — 🟤 `[2026-08-31] From: G2 merge` _"A documented commit pointer can live on exactly one machine"_ — its cheapest option ("push the branch") is **already done**: `git branch -r --contains b155374` → `origin/g2-serialization-wip`. Check off the decide-half with that evidence; keep the guard idea only if the user wants it as a Cleanup Week #4 script. ✅ flipped with that evidence.
    5. **Fold, not reap** — 🟤 `[2026-03-21] TASK-021` _"Smart overlay positioning"_ closes with G2 (same root cause; the 🔵 low-height report contradicts its "rare" note). ✅ annotated on the entry; closes at G2's merge.
- **Open questions — user rulings 2026-09-03** ("Agree with assumptions"; the bold assumptions below are now decisions):
    1. 🟤 slot: **G4 ML pipeline integrity** (chosen) vs. building the visual-verification gate (3 SP) with G2 as its vehicle? ✅ **G4 confirmed.**
    2. Monday brainstorm for G1 — available? **Assumed yes** — ✅ confirmed; the fallback swaps G2 to Monday.
    3. `propagate` burn-down (REVIEW-QUEUE § 4 asked this conversation): extend § 5's outcome-row discipline to `propagate` verdicts, or accept § Spawned Tasks as user-maintained and stop counting "filed" as done? **Assumed: extend § 5** — ✅ confirmed: G5 adds the outcome-row convention to REVIEW-QUEUE § 4 Conventions in its run. Related, still open: whether the three spawned two-trees edits get applied this week (user-side).
    4. Sep 14–18 lead: PR2 hash-off-thread (TODO 🔴) or the first v2.0 extraction (ZoomManager is the smallest; MLManager is what G1 seeds)? ⏳ **Still open** — no assumption was made; decide before the Sep 14–18 planning session.
    5. Cleanup Week #4 on Sep 21–25 as recommended, despite the 🟤 trigger having already fired? ✅ confirmed.
    6. The five reap/flip/fold rulings above. ✅ all approved and executed (see Reaps).
- _Brainstorm sanity-checks (self-conducted — unattended run): week dates confirmed Mon Sep 7 – Fri Sep 11, 2026 vs. today 2026-09-03 and vs. git/DONE (previous plan Aug 31–Sep 4 landed **inside** its header week — last merge `de4bdac` Sep 3, no spillover); velocity ~23 SP at cleanup speed vs. ~14 SP design-heavy → 21 planned with a drop order; Cleanup Week not due by cadence (#4 ≈ Sep 21–25) but the 🟤 trigger has re-fired (47 open since Jul 10) — surfaced, cadence held; quotas satisfiable (49 unchecked 🔵 entries, measured 2026-09-03); reap nominations listed unattended, then user-approved and executed 2026-09-03._

### Quota Check

- 🔵 **User-Flagged SP**: 16 / 21 (**76%**) — ✅ ≥50% (G1 8 + G2 5 + G3 3)
- 🟡 **Operational SP**: 0 / 21 (**0%**) — ✅ ≤25% (the pre-push friction watch is a 1-SP measurement with no domain-mate → deferred to Cleanup Week #4 rather than scheduled below the 2-SP floor)
- 🟤 **Auto-Generated SP**: 5 / 21 (**24%**), **1 group** (G4) — ✅ ≤25% AND ≤1 group. ⚠️ Falls to 28% if G3 alone is dropped — the drop order pairs G3 with G4's harness.
- **Cleanup Week status**: normal — #4 due ~September 21–25 (cadence); 🟤-size trigger **already fired** (surfaced above, cadence held)
- **Last Cleanup Week**: August 31 – September 4, 2026 (the 3rd)
- **Compliance**: ✅ all quotas met
- _Denominator note_: Y = total quota-counted SP (21) — the exempt ⚪ Overhead Weekly Reviews batch (5) is excluded; 26 incl. overhead.

---

## Weekly Challenge 🏆

**ML training pipeline — design pass + retrain skip** (Group G1, Mon–Wed).

**Why this one**: it is the only promoted item in TODO (🟠, re-confirmed by the user twice), it carries five user-raised companions from the August 28 intake, and its design decision has the largest blast radius on the board — it settles whether the online-update / re-score protocol survives (and with it a whole 🟤 cluster), where a training-vector cache lives, and where MLManager's boundary falls. The stretch is real: reconcile "retrain less" with "retrain per sort" through a persistent, fingerprint-keyed vector cache, without regressing the bulk-rated re-injection that today rides every rebuild — and land the new logic outside a renderer that grew 224 lines during a Cleanup Week.

---

## Previous Week Summary

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
