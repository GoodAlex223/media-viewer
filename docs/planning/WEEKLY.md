# Weekly Plan

**Week**: Monday July 13 – Friday July 17, 2026
**Created**: 2026-07-12
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md, BACKLOG.md (📌 Process Rules + 🔵 User-Flagged + 🟡 Operational + 🟤 tail), TODO.md, git log (last 2 weeks), previous WEEKLY.md (July 6–10 Cleanup Week, archived below), REVIEW-QUEUE.md
**Cleanup Week?**: **No** — normal week; the ≥50% 🔵 User-Flagged floor resumes. (Last Cleanup Week was July 6–10, the 2nd ever; next expected ~early August, ~3-week cadence.)

**Context**: The user-flagged work deferred out of the July 6–10 Cleanup Week is now the lead. The throughline is **"fix the 24k AI-sort experience"** — the most-repeated dogfooding pain (Sort-by-Predicted shows nothing for a long time on a 24 000-file folder, re-extracts despite a valid cache, and can't be cancelled). That cluster (PR3 incremental cache-load + the [2026-07-01] AI-sort-startup UX items + "can't cancel AI sort") is front-loaded Mon–Wed as the 🏆. Paired with a **tournament-mode bug batch** (🔴 undo intermittently fails, 🟠 mouse-wheel still navigates pairs, 🔵 auto-hide header on hover), the **bulk-rate re-pair-avoidance** 🟠 fix, and — new this week — a **strategic-doc refresh** (🟡, gated on a short brainstorm; twice-deferred) that also folds in one 🟤 CLAUDE.md doc-sync. Weekly Reviews run late as exempt overhead.

---

## Parallel Work

- ✅ **SMOKE PASSED (2026-07-20) — gating dependency for G1 satisfied.** All 5 checks passed on the user's real 20,929-file folder: the ~40s silent load is gone/visible (determinate card appears immediately), cached data is served with no redundant re-extraction, Cancel actually aborts (load + extraction + sort all stop, list stays unsorted), and the post-tournament-exit path behaves identically. Two post-review incidents surfaced and were fixed in-branch — an external `/code-review` data-loss regression (`b8b5636`) and a worse cache-corruption route the smoke itself triggered (`2777bdf`, `c947081`) — see [DONE.md](DONE.md) 2026-07-20 for detail. G1 shipped as **PR #64**, **MERGED** into `main` in `b6ff4ac` (branch `feature/g1-ai-sort-startup-ux` deleted remote + local). Original gate description follows for context: — The AI-sort startup UX + incremental cache-load work targets real-24k-folder behavior that cannot be E2E-fixtured (Playwright fixtures top out at a handful of files). Same verification shape as the CW-T tournament work.
- ✅ **DONE EARLY (Sat 2026-07-12) — Strategic-doc brainstorm with the user (gates G4's 🟡 refresh).** The gate is SATISFIED: brainstorm held Jul 12; decisions D1–D5 + user-approved spec (`41d9233`) + mechanical 8-task plan (`a02c256`) live on branch `docs/g4-strategic-docs-refresh`. **Friday = execute `docs/archive/plans/2026-07-12_g4-strategic-docs-refresh.md`** (sized for a cheaper model; inline executing-plans is fine). Do NOT drop the 🟡 refresh as "brainstorm didn't happen". Original gate description follows for context: — MILESTONES.md / ROADMAP.md / GOALS.md are frozen at **2026-02-05** and factually wrong (GOALS still says "No automated tests / Manual testing only" and "~6100-line" renderer vs. **434 unit tests + green E2E** and an ~8400-line renderer; Tournament/JXL/CLIP + v2.0 modularization all shipped outside the documented roadmap). The doc edits are ~S but **blocked on a ~15-min decision**: (a) is v1.1 closed/shipped? (b) what is v2.0's real scope now (modularization in progress; ZoomManager/CompareManager/SortingManager/MLManager planned)? (c) where do the big BACKLOG themes (24k-folder perf, add-on system) sit? If the brainstorm doesn't happen, G4's 🟡 refresh drops (the 🟤 CLAUDE.md doc-sync still ships).

---

## Task Groups

### G1. AI-sort startup UX & incremental cache-load [batch] 🏆 🔵

**Domain**: JS logic — `handleSortByPrediction` / `loadFeatureCache` / feature-extraction + sort-progress UX
**Source**: 🔵 User-Flagged
**Total SP**: 8 — one branch, one PR, one review (front-loaded Mon–Wed; design-heavy perf/UX, gates on a real-24k smoke)

> The week's lead and 🏆. All items share the `handleSortByPrediction` → `loadFeatureCache` → extraction → sort critical path on a large folder, so they batch into one branch. This is the **PR3 slice** of the 🔴 TODO "Speed up AI / similarity sorting on large folders (24k+ files)" item plus the [2026-07-01] AI-sort-startup UX cluster it causes — PR3 (incremental/non-blocking cache-load) removes the ~40s silent wait, and the same fix subsumes the "re-extracts despite cache" bug (the in-memory `featureCache` Map is assigned only at the _end_ of the streaming load, so the uncached-file check runs against an empty Map during the load window). The 🔴 sort-perf TODO item stays **OPEN** after this ships — PR2 (hash off the renderer thread) remains, but PR2 addresses _hash/similarity_ sorts, not the reported AI-sort pain, so it stays deferred.

- [x] 🔴 **Incremental / non-blocking feature-cache load (PR3)** — serve `.feature_cache.json` incrementally instead of a ~40s silent blocking streaming load before the sort. Closes BACKLOG 🟤 [2026-05-26]. Root fix for 4 of the [2026-07-01] reports. `media-viewer.js:~6562-6683` (`loadFeatureCache` streaming load), `media-viewer.js:~7324/~7370` (`handleSortByPrediction`).
- [x] 🔵 **AI sort re-runs extraction despite valid cached data (bug)** — 🔵 [2026-07-01]. `featureCache` is assigned only at the END of the streaming load, so `!featureCache.has(path)` gates extraction against an empty/partial Map during the ~40s window → redundant re-extraction. Likely subsumed by PR3 (populate the Map incrementally). `media-viewer.js:~6644/~6675`, `~7370/~7392`.
- [x] 🔵 **AI sort gives zero feedback — add a determinate progress card** — 🔵 [2026-07-01]. `handleSortByPrediction` shows only transient toasts and no `updateSortProgress` card during load/extract/sort, unlike `handleSortBySimilarity` (which renders the card immediately). Render the card immediately. `media-viewer.js:~7324`, ref `~5191` (`handleSortBySimilarity`), `~1217` (`updateSortProgress`).
- [x] 🔵 **Long opaque wait after "loading CLIP model" before extraction/sort begins** — 🔵 [2026-07-01]. The ~40s silent `loadFeatureCache()` runs after the CLIP-load messages with no progress UI; the extraction bar appears only after it completes. Surface progress during the load (folds into PR3 + the progress-card item). `media-viewer.js:~7370`, `~8071` (2s toast then silence).
- [x] 🔵 **Exit tournament → click AI sort → long delay before anything happens** — 🔵 [2026-07-01]. Same lazy-extraction + silent-cache-load root as above; verify the fix covers the post-tournament entry path. `media-viewer.js:~7324-7420`.
- [x] 🟠 **Can't cancel the AI sort** — 🟠 TODO [2026-07-11]. The sort-progress card's cancel affordance calls `sortAbortController.abort()` but the AI-prediction path doesn't stop. Verify the cancel button is wired/visible for the AI-prediction path and every long-running stage checks `sortAbortController.signal.aborted` and bails. `media-viewer.js:~1214-1240`, `~5270-5567`.

### G2. Tournament-mode bug fixes [batch] 🔵

**Domain**: JS logic — tournament methods in `media-viewer.js` / `tournament-engine.js` + `styles.css`
**Source**: 🔵 User-Flagged
**Total SP**: 6 — one branch, one PR

> Three user-flagged tournament follow-ups on the same files. The 🔴 undo bug leads (needs a reliable repro first); the mouse-wheel guard and header auto-hide are scoped and mechanical.

- [x] 🔴 **Tournament undo intermittently fails** — ✅ **DONE via PR #65** (merge `937084c`, smoke PASSED). Root cause was NOT the hypothesized "two divergent paths" but `handleTournamentUndo` peeking `moveHistory` (which picks never write, and which clears only on folder change) → any special move even from single mode hijacked every tournament undo; fixed by making `engine.history` the single chronological undo stack. See [DONE.md](DONE.md) 2026-07-21.
- [x] 🟠 **Mouse wheel still navigates pairs in tournament mode** — ✅ **DONE via PR #65** (merge `937084c`). `if (this.isTournamentMode) return;` atop the document `wheel` handler.
- [x] 🔵 **Auto-hide tournament header bar + shared control buttons, reveal on hover** — ✅ **DONE via PR #65** (merge `937084c`). `.tournament-header`/`.tournament-controls` mirror `.header` via an extracted `_setupAutoHide` helper (edge-band reveal + 3s hide).

### G3. Bulk-rate re-pair avoidance [solo] 🔵

**Domain**: JS logic — compare-mode ML pair selection in `media-viewer.js`
**Source**: 🔵 User-Flagged
**Total SP**: 3 — one branch, one PR

> **Solo 3-SP group (rule-4 judgment)**: kept standalone because it has no clean domain-mate among the selected work (G1 is the sort/cache path, G2 is tournament, this is compare-mode ML pairing) and it needs its own short design pass. Re-confirmed by 24k dogfooding.

- [x] 🟠 **Don't pair two already-bulk-rated files together (with fall-through)** — ✅ **shipped 2026-08-24 via PR #66** (merged to `main`; see [DONE.md](DONE.md) 2026-08-24). Exact-pair suppression + full-list fall-through; session-only `bulkRatedPairs`. ⚠️ **User-side re-smoke round 2 NOT run** — shipped on user direction + review + automated suites (500→513 unit / 55 E2E); the deferred-re-render fix (D2) has no automated coverage (mlWorker null under Playwright). _Original:_ In AI-sorted compare, once both files of a pair are rated "Both good"/"Both bad", don't show them paired again; when no un-bulk-rated pair remains, disable the rule and fall back so the user can still re-rate. Short design pass on pair selection (`showCompareMedia` AI-sorted branch + `mlComparePairIndex`), membership test against `this.bulkRated`, and the fall-through condition. `media-viewer.js` (compare pair-selection), `tests/media-viewer-utils.test.js`.

### G4. Strategic-doc refresh & CLAUDE.md hygiene [batch] 🟡 (+1 🟤 folded)

**Domain**: docs (planning strategic docs + CLAUDE.md)
**Source**: 🟡 Operational (strategic-doc refresh) **+** 🟤 Auto-Generated (1 CLAUDE.md doc-sync, folded)
**Total SP**: 4 — one branch, one PR (docs-only → manual review, no `/code-review` fan-out per the [2026-06-29] convention). ~~The 🟡 refresh is **gated on the Thursday brainstorm**~~ → **gate SATISFIED early (Sat 2026-07-12)**: spec `41d9233` + plan `a02c256` committed on branch `docs/g4-strategic-docs-refresh`; the 🟤 doc-sync is folded into that same plan (Task 5).

> Mixed-source docs group (mirrors CW-P's "🟡 + 1 🟤 folded" shape). Scheduled Friday. **Friday's job is now purely mechanical: execute `docs/archive/plans/2026-07-12_g4-strategic-docs-refresh.md` (cheaper model OK) → docs-only PR → manual review.**

- [x] 🟡 **Refresh MILESTONES.md / ROADMAP.md / GOALS.md** — 🟡 [2026-07-01]. All three frozen at 2026-02-05 and factually wrong (GOALS "no automated tests" vs. 434 unit; "~6100-line" vs. ~8400-line renderer; v1.1 "On Track Q1 2026"; v2.0 "Not Started" though modularization is underway). After the brainstorm sets direction (v1.1 closed? v2.0 real scope? where do 24k-perf / add-on themes sit?), rewrite all three + bump each `Last Updated`. Effort: S (edits) after a ~M discussion.
- [x] 🟤 **Sync CLAUDE.md to the new pre-push E2E gate** — 🟤 [2026-07-11] PR #63 post-merge. The Architecture-tree `scripts/` bullet lists only `check-secrets.js` and the "Build & Development Commands" hook prose omits the new conditional pre-push E2E gate (`scripts/check-e2e-needed.js` + `.husky/pre-push`) + its `--no-verify` bypass. **Recurrence** of the [2026-06-18] PR #51 doc-drift class fixed in PR #52 — the same 2 lines drift on every script/hook addition. `CLAUDE.md` (Architecture tree; hook prose).

### G5. Weekly Reviews [batch] ⚪ Overhead

**Domain**: Research / process (exempt overhead — excluded from the source-quota denominator)
**Source**: ⚪ Overhead
**Total SP**: 5 — scheduled late (Thu/Fri), low-risk, must not displace G1

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. Per the codified methodology (CW-P, PR #63): **hybrid sourcing** (fresh-check the live landscape AND the parked Next-up item, review whichever is strongest) using **lightweight inline `WebSearch` + a few `WebFetch`** — never the deep-research harness. Append a verdict row per category; on an `adopt`, file a 🟤 BACKLOG entry; on a `propagate` (category 4), file a TODO § Spawned Tasks row.

> ✅ **RUN HELD 2026-08-27, not in this plan's week** — a **catch-up run** (~7.5 weeks after the 2026-07-05 run), so its scan window is _since 2026-07-05_ (PRs #63–#66), not "this week". Branch `chore/g5-weekly-reviews`, run-card [`2026-08-27-weekly-reviews-run.md`](../superpowers/specs/2026-08-27-weekly-reviews-run.md). **5 verdicts / 3 adopt** (`security-guidance`, `dead-rules-audit`, path-scoped-rules migration → 🟤 [2026-08-27]) **+ 1 pass** (harness engineering) **+ 1 propagate** (review rating axis → TODO § Spawned Tasks). 10 web calls, no harness. **Shipped without a PR on user direction** — reviewed locally on the whole branch, then **MERGED into `main` 2026-08-27** (`4f1e65a`, `--no-ff`; branch deleted remote + local); see [DONE.md](DONE.md) 2026-08-27.

- [x] **Plugins (2 SP)** — ✅ 2 verdicts. Store: **`security-guidance`** → **adopt** (reverses its own [2026-07-05] "low fit" parking — it occupies the _in-session_ stage neither ESLint nor the secret guard covers, and no-CI argues _for_ it). Wider internet: **`dead-rules-audit`** → **adopt** (arrived via the new inbound propagation channel, pre-measured against this repo's CLAUDE.md at 36 rules / 10 judgeable).
- [x] **Claude best-practices (1 SP)** — ✅ **adopt**, scoped to one half: route path-conditional CLAUDE.md content to **path-scoped rules** (`.claude/rules/`). Measured: CLAUDE.md is **205 lines** (over the 200 bar) and `.claude/rules/` does not exist. The hook-promotion and skills halves are already practiced here.
- [x] **Non-Claude AI best-practices (1 SP)** — ✅ **pass**: **harness engineering** (the provider-neutral 2026 theme). Its guides/sensors taxonomy maps onto machinery this repo already runs (ESLint, the pre-commit chain, the pre-push E2E gate, `/code-review`), and Fowler concedes there is no quantitative evidence. Observability parked as the one unpracticed layer.
- [x] **Cross-project propagation (1 SP)** — ✅ **propagate**, and the category was **defined**: REVIEW-QUEUE.md §4 now exists, importing `claude-code-universal-config`'s four-run-deep convention rather than inventing one. ⚠️ **Made bidirectional** (a deliberate widening of this line's outbound-only wording — see run-card D1): the sibling repo already held **four unactioned rows addressed to media_viewer**, which a one-way channel would have dropped permanently.

---

## Daily Schedule

### Monday, July 13 — 🏆 AI-sort UX (day 1)

> Front-load the highest-value user pain. Start with the incremental cache-load core (PR3) + the "re-extracts despite cache" bug it subsumes — the root of the ~40s silent wait.

| Group                                                                                                                                             | SP  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| ✅ [**G1. AI-sort startup UX & incremental cache-load**](#g1-ai-sort-startup-ux--incremental-cache-load-batch--) [batch] 🏆 (day 1 of 3) — PR #64 | (8) |

**Daily total**: ~4 SP (of the 8 SP batch)

---

### Tuesday, July 14 — 🏆 AI-sort UX (day 2)

> The feedback + control layer: determinate progress card in `handleSortByPrediction`, cancel wiring for the AI-prediction path, and the long-opaque-wait / post-tournament-entry paths. Hand off for a real-24k smoke.

| Group                                                                                                                                             | SP  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| ✅ [**G1. AI-sort startup UX & incremental cache-load**](#g1-ai-sort-startup-ux--incremental-cache-load-batch--) [batch] 🏆 (day 2 of 3) — PR #64 | (8) |

**Daily total**: ~4 SP (of the 8 SP batch)

---

### Wednesday, July 15 — G1 PR → begin Tournament bugs

> Land G1 unit tests, open the G1 PR (checkoff gates on the user-side 24k smoke). Then begin G2 with the 🔴 undo bug — reproduce first, then fix.

| Group                                                                                                                    | SP  |
| ------------------------------------------------------------------------------------------------------------------------ | --- |
| ✅ [**G1**](#g1-ai-sort-startup-ux--incremental-cache-load-batch--) [batch] 🏆 (day 3 — PR) — PR #64                     | (8) |
| ✅ [**G2. Tournament-mode bug fixes**](#g2-tournament-mode-bug-fixes-batch-) [batch] (start — undo repro + fix) — PR #65 | (6) |

**Daily total**: ~3 SP

---

### Thursday, July 16 — Tournament bugs finish + Bulk-rate + Reviews start

> Finish G2 (mouse-wheel guard, header auto-hide), do G3 (bulk-rate re-pair). ~~Hold the strategic-doc brainstorm~~ ✅ already held Sat Jul 12 (see Parallel Work) — Thursday freed up. Begin Weekly Reviews late.

| Group                                                                                                                         | SP  |
| ----------------------------------------------------------------------------------------------------------------------------- | --- |
| ✅ [**G2. Tournament-mode bug fixes**](#g2-tournament-mode-bug-fixes-batch-) [batch] (finish) — PR #65                        | 6   |
| ✅ [**G3. Bulk-rate re-pair avoidance**](#g3-bulk-rate-re-pair-avoidance-solo-) [solo] — PR #66 (⚠️ re-smoke round 2 not run) | 3   |
| ✅ [**G5. Weekly Reviews**](#g5-weekly-reviews-batch--overhead) [batch] (start) — held 2026-08-27                             | (5) |

**Daily total**: ~9 SP + reviews overhead (strategic brainstorm ✅ done Jul 12, off Thursday's plate)

---

### Friday, July 17 — Docs refresh + Reviews wrap + buffer

> Light close: **execute the ready-made G4 plan** (`docs/archive/plans/2026-07-12_g4-strategic-docs-refresh.md` — brainstorm already held Sat Jul 12, spec+plan on branch `docs/g4-strategic-docs-refresh`; cheaper model OK), finish Weekly Reviews, absorb G1/G2 spillover and the user-side 24k smoke follow-up.

| Group                                                                                                                                           | SP  |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| ✅ [**G4. Strategic-doc refresh & CLAUDE.md hygiene**](#g4-strategic-doc-refresh--claudemd-hygiene-batch--1--folded) [batch] — merged `a843d36` | 4   |
| ✅ [**G5. Weekly Reviews**](#g5-weekly-reviews-batch--overhead) [batch] (finish) — held 2026-08-27                                              | (5) |

**Daily total**: 4 SP + reviews overhead + G1/G2 buffer

---

## Weekly Challenge 🏆

**AI-sort startup UX & incremental cache-load** (Group G1, Mon–Wed).

**Why this one**: It is the highest-value 🔵 user-flagged work on the board — the single most-repeated dogfooding complaint. On the user's real 24 000-file folder, Sort-by-Predicted is opaque and broken-feeling: nothing happens for ~40s (a silent streaming cache load), it re-extracts features it already has cached, there's no progress indicator, and it can't be cancelled. The stretch is genuine and design-risky: make the ~40s cache load incremental/non-blocking (PR3), fix the "assigned only at end of load" Map bug so cached data is actually served, add a determinate progress card to a code path that has none, and wire real cancellation — all verified against a large folder that cannot be E2E-fixtured. That risk is why it is front-loaded Mon–Wed with a Friday buffer and a user-side smoke handoff.

---

## Summary Table

| ID                            | Group                                                  | Domain                                        | Source                | Tasks                  | Total SP | Day     | Status                                             |
| ----------------------------- | ------------------------------------------------------ | --------------------------------------------- | --------------------- | ---------------------- | -------- | ------- | -------------------------------------------------- |
| G1                            | AI-sort startup UX & incremental cache-load [batch] 🏆 | JS logic (sort / feature-cache / progress UX) | 🔵 User               | 6 (1 🔴 + 4 🔵 + 1 🟠) | 8        | Mon–Wed | ✅ PR #64                                          |
| G2                            | Tournament-mode bug fixes [batch]                      | JS logic (tournament) + CSS                   | 🔵 User               | 3 (1 🔴 + 1 🟠 + 1 🔵) | 6        | Wed–Thu | ✅ PR #65                                          |
| G3                            | Bulk-rate re-pair avoidance [solo]                     | JS logic (compare-mode ML pairing)            | 🔵 User               | 1 🟠                   | 3        | Thu     | ✅ PR #66 ⚠️ (see DONE — re-smoke round 2 NOT run) |
| G4                            | Strategic-doc refresh & CLAUDE.md hygiene [batch]      | docs (strategic + CLAUDE.md)                  | 🟡 Ops (+1 🟤 folded) | 2                      | 4        | Fri     | ✅ 2026-08-27 (no PR — merged `a843d36`)           |
| G5                            | Weekly Reviews [batch]                                 | Research / process                            | ⚪ Overhead           | 4                      | 5        | Thu–Fri | ✅ 2026-08-27 (no PR — merged `4f1e65a`)           |
| **Total (quota-counted)**     |                                                        |                                               |                       | **12**                 | **21**   |         |                                                    |
| **Total (incl. ⚪ overhead)** |                                                        |                                               |                       | **16**                 | **26**   |         |                                                    |

_At closeout, check off each constituent BACKLOG/TODO entry individually. G1 largely closes the reported AI-sort pain but the 🔴 "Speed up AI / similarity sorting" TODO stays OPEN (PR2 hash-off-thread remains)._

---

## Notes

- **Why a normal week (not cleanup).** The last Cleanup Week (July 6–10, 2nd ever) just shipped; cadence puts the next ~early August. The ≥50% 🔵 floor resumes, and last week's plan explicitly earmarked the deferred user work (AI-sort UX cluster, bulk-rate re-pair) as this week's lead.
- **G1 is the risk.** ~8 SP of design-heavy perf/UX that can only be truly verified on the user's real 24k folder (not E2E-fixturable). Its checkoff may legitimately slip past Friday even if the code lands — the smoke is user-side/async (same pattern as CW-T). **Never drop G1** — it is the whole point of the week.
- **What defers again.** **PR2 (hash computation off the renderer thread)** — the other half of the 🔴 sort-perf item — stays deferred: it speeds _hash/similarity_ sorts, not the reported AI-sort pain, so it is lowest-priority. The 🔴 TODO item stays OPEN after G1. Also parked: image panning feature, single-mode media picker, recently-opened-folders, JXL animation smoothness, fullscreen-exit-regardless-of-zoom, ML retrain-on-source-folder-change investigation.
- **G4's 🟡 refresh gate is SATISFIED (updated 2026-07-12).** The brainstorm was held early on Sat Jul 12 (not Thursday): decisions D1–D5 approved, spec (`41d9233`) + mechanical plan (`a02c256`) committed on branch `docs/g4-strategic-docs-refresh`. G4 no longer depends on any discussion — Friday just executes the plan. Do NOT defer the 🟡 refresh a 3rd time.
- **Overrun drop order** (updated 2026-07-12 — G4 is no longer discussion-gated, it's cheap mechanical execution): trim **G2** to the two highest-value items first (🔴 undo + 🟠 mouse-wheel; defer the header auto-hide), then **G3**, then G4 slips to the following Monday at worst. Never drop G1.
- **Docs-only PR handling**: G4 is docs-only — per the [2026-06-29] convention, recognize it before any `/code-review` fan-out and merge/defer in-session.
- **Dependency ordering**: G1 merges before its docs would change; G2's 🔴 undo needs a repro before a fix; G4's 🟡 refresh follows the strategic brainstorm (✅ held early, Sat Jul 12 — see Parallel Work); Weekly Reviews run late and must not displace G1.
- **Branch/PR shape**: 4 workflow runs for the quota-counted groups — G1 (sort/cache), G2 (tournament), G3 (bulk-rate), G4 (docs). Weekly Reviews is process overhead (no code PR; appends to REVIEW-QUEUE.md + any `adopt` files a 🟤 entry, any `propagate` a TODO § Spawned Tasks row).
- _Brainstorm sanity-checks: week dates confirmed Mon Jul 13 – Fri Jul 17 vs. today 2026-07-12 and vs. git/DONE (prev plan = July 6–10, all merged); velocity design-heavy ~14–16 SP (target 21 quota-counted is ambitious → G1 risk noted + overrun drop order set); Cleanup Week NOT due (last July 6–10); 🔵 quota abundantly satisfiable._

### Quota Check

- 🔵 **User-Flagged SP**: 17 / 21 (**81%**) — ✅ ≥50% (G1 8 + G2 6 + G3 3)
- 🟡 **Operational SP**: 3 / 21 (**14%**) — ✅ ≤25% (G4 strategic-doc refresh)
- 🟤 **Auto-Generated SP**: 1 / 21 (**5%**), 1 group (folded into G4) — ✅ ≤25% AND ≤1 group
- **Cleanup Week status**: normal
- **Last Cleanup Week**: July 6–10, 2026 (the 2nd ever). Next expected ~early August 2026 (~3-week cadence).
- **Compliance**: ✅ all quotas met — 🔵 well above the 50% floor, 🟡 ≤25%, 🟤 ≤25% and a single folded group.
- **Note**: denominator Y = total quota-counted SP (21) **minus** the exempt ⚪ Overhead Weekly Reviews batch (5) — i.e. the total incl. overhead is 26; percentages are over the 21 quota-counted SP.

---

## Previous Week Summary

### Week: July 6 – July 10, 2026 — 🧹 Cleanup Week (2nd ever) — ✅ Complete (all 5 groups merged)

**Result**: The 2nd Cleanup Week (inverted quota; 21 SP quota-counted + 4 overhead). All five groups shipped, merging across PRs #59–#63. **CW-T** tournament correctness & hardening — the 2 HIGH-severity 🔵 blockers (24k freeze / Both-Win hang → O(1) inverse-delta undo + `showTournamentPairFast`; cannot-enter-after-add-media+AI-sort → `reconcileWithFiles` on every entry) + 6 🟤; **real-24k smoke PASSED**; PR #59 (`ae9588d`), post-merge review found 2 real bugs both fixed pre-merge (`f4b7807`). **CW-D** docs & CLAUDE.md hygiene (5 items; PR #60 `dba3ecf`). **CW-V** test & tooling backfill (4 test-only items; PR #61 `85f1f29`). **CW-P** process & DX guardrails — automated pre-push E2E gate + Weekly-Reviews methodology consolidation + ref-sweep bullet (PR #63 `f6c2c46`). **WR** Weekly Reviews 2nd run (2 adopt: `typescript-lsp`, autonomous verification; 2 pass; PR #62 `291879c`). Unit tests 411 → **434**; E2E 52/52 green. The freshest 🟤 slice (PR #54–#58 follow-ups) burned down; the older April–May 🟤 tail remains for a future Cleanup Week.

**Velocity learning**: the ~8 SP non-mechanical tournament core (design + PR-review + real-24k smoke) ran below its nominal, while the ~13 SP mechanical 🟤 (docs/tests/process) moved at cleanup speed — informs this week's caution on the design-heavy G1 target.

### Week: June 22 – June 26, 2026 — 🟢 Normal perf week — ✅ Mostly complete (spilled to June 30)

**Result**: A 19 SP (quota-counted) performance push. Four of five groups shipped, spilling ~4 days past Friday: **P2** tournament large-folder perf (PR #55, June 25), **P3** feature-extraction timing → pure-lazy (PR #56, June 26), **WR** Weekly Reviews first run (PR #57, June 29), **T1** tournament exit affordances (PR #58, June 30). Unit tests 381 → **389**; E2E green. **Group P1 (sort-perf PR2 hash-off-thread + PR3 cache-load) did NOT ship** — only its PR1 had merged (June 20, PR #54) — so the 🔴 "Speed up AI/similarity sorting" item stays OPEN; its PR3 slice + the AI-sort UX cluster are this week's (July 13–17) lead.

**Velocity learning**: ~14 SP quota-counted actually shipped in-window (P2 8 + P3 3 + T1 3), with P1 (5 SP) carried — design-heavy work runs below the nominal once diagnosis + PR-review + real-folder-smoke overhead is counted.

### Week: June 15 – June 19, 2026 — 🧹 Cleanup Week (1st ever) — ✅ Complete (shipped on time)

**Result**: The first-ever Cleanup Week. All five groups (CW-1…CW-5) delivered at the 24 SP target, on schedule. Six PRs merged (#47–#52). Unit 310 → **345**; E2E returned to green (42/43 → 48/48). Key: CW-5 🏆 frame-0-first streaming animated-JXL decode (PR #47); CW-1 7 defensive renderer guards consolidating 14 PR-review follow-ups (PR #48); CW-2 E2E green + first tournament Playwright coverage (PR #49); CW-3 docs & backlog hygiene (PR #50); CW-4 dependency-free pre-commit secret guard + pre-archive checklist (PR #51/#52).

### Week: June 1 – June 5, 2026 — ✅ Complete (ran long: finished 2026-06-11)

All 5 groups delivered (30 SP planned; consumed 9 working days). Seven PRs merged (#40–#46). Unit 244 → 297. Group 0 re-rate/mode-correction (PR #40/#41), Group A 🏆 JXL viewer (PR #42), Group B mode-switch bugs (PR #43/#44), Group C CLIP extraction UX (PR #45), Group D security audit ✅ PASS (PR #46).

### Week: May 11 – May 15, 2026 — ✅ Complete

All 6 groups delivered (25 SP). Tournament Mode (Groups E + F) shipped 2026-05-25 with a deterministic-UX + feature-cache-streaming polish pass 2026-05-26.

### Week: April 13 – April 17, 2026 — ✅ Complete

All 6 groups delivered, 25 SP. See `docs/archive/plans/` and `docs/planning/DONE.md`.
