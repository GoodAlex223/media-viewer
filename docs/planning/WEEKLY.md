# Weekly Plan

**Week**: Monday October 19 – Friday October 23, 2026
**Created**: 2026-10-18
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md (all `Last Updated` 2026-08-27, 52 days; the 2-month bar falls on 2026-10-27, and last week's theme shipped off the board, so the 🟡 refresh is filed and scheduled as G5, see Notes → strategic docs), BACKLOG.md (📌 Process Rules; 🔵 [2026-10-17] and the open 🔵 pool; the 🟤 [2026-10-11] → [2026-10-18] closeout sections; an obsolescence check of last week's unverified reap list), TODO.md (🔴 I1, 🔴 24k-sort PR2 remainder, § Spawned Tasks), git log (last 2 weeks: the six Oct 11–18 merges `e5cd3a8`, `96467f7`, `bf6fcad`, `51af1ab`, `3fb797e`, `1954109` and their closeouts through `73527a9`), previous WEEKLY.md (Oct 12–16 — finished two days past its Friday, archived below), REVIEW-QUEUE.md (§§1–5; last run 2026-10-17). Live-config drift check: N/A — this repo keeps no live-config sync. OWNER-QUEUE.md: absent.
**Cleanup Week?**: **No — normal week.** Cleanup Week #4 ran Oct 5–9; #5 is due **Oct 26–30**, next week. The 🟤-size trigger fires (66 new open 🟤 entries since 2026-10-11, 297 open in total, measured 2026-10-18), as it has continuously since June, so the cadence governs.
**Context**: Roadmap phase _Scale & Modularize_; active milestone _v2.0 modularization_. The renderer grew 15% in one week (`media-viewer.js` 9,989 → **11,451** lines, 2026-10-10 → 10-18), while the roadmap's **Now** column stood still: PR2 has been open since June, and no extraction has shipped since 2026-09-10. This week's agreed theme is **"stop the renderer's growth"**: the first v2.0 extraction since then, ZoomManager (G3), and the last 24k slice, the hash/similarity sort off the renderer thread (🏆 G2), behind a front-loaded fix for G1's security residual I1 (G1). A formatter-hook speed-up (G4), the strategic-doc refresh (G5) and Weekly Reviews (G6) close the week.
**Spillover** (recorded 2026-10-25): G2 PR 2 merged on 2026-10-25, two days past the Friday (PR #87, `f5ddfa3`). G3, G4, G5 and G6 had not run by then. The week's own drop order sends G4 to the next normal week and G5 to Cleanup Week #5. G3 is never dropped, and the Cleanup Week #5 planning pass places it and G6. **2026-10-26**: G4 ran before that pass after all (PR #89, `7f75013`), and its check-offs are done. G3 ran the same day (PR #90, `082e3b2`), and its check-offs are done too.

---

## Next Steps (recorded 2026-10-25, from the v2 modules session)

In order:

1. **Close out this week.** The Spillover is recorded above. The archive and the check-offs are done in the Cleanup Week #5 planning pass.
2. **Plan Cleanup Week #5** (Oct 26–30) in its own planning session. G5 lands there. G5 is where the v2 board change goes: v2 replaces the "v2.0 modularization" release ([v2 spec](../superpowers/specs/2026-10-22-v2-modules-design.md) § 2, D1). G5 also:
   - decides D23's recommended blocking check, which ratchets the renderer's line ceiling down after each phase (spec § 11.1);
   - files the spec's remaining § 19 entries, with `[possible-dup-of: …]` tags where entries exist:
     - 🔵 the Fetch module and the shell redesign;
     - 🔵 the update to "Lossless compression add-on (port from `media_compression` project)";
     - 🟤 face-detection removal;
     - 🟤 the AI research's four items;
     - the README setup steps for Windows and Linux (G-8).
3. ✅ **The v2 spec merged: PR #88** (merge `e1c4e03`, 2026-10-25, after five review rounds), carrying the approved spec, this list and the 🔵 [2026-10-22] LICENSE entry. Its closeout filed two 🟤 [2026-10-25] entries: the AI-sorting research's own PR, and the downloader research before P3b.
4. **Small tasks for any week:**
   - the real-data check: the AI research harness on the user's like/dislike folders, with only overall numbers in git (spec § 19);
   - then A1, the like-model learner fix (spec § 12.3);
   - then the LICENSE file.
5. **v2 P1a**, the module host plus a Linux baseline (spec § 14), in the week of Nov 2–6 at the earliest. Its plan is written when it is scheduled.
   - **The blocking renderer line ratchet must be in place before P1a's PR merges**, so P1a is its first measured phase (🟤 [2026-10-27] "Build the blocking renderer line ratchet…", the user's ruling at G5). It may ride P1a or ship alone.
   - **Decide v2's weekly share of the 🔵 SP before scheduling it** (the Cleanup Week #5 planning pass, or the Nov 2–6 one at the latest; added 2026-10-27 at G5 from a side-agent note). The roadmap's end-of-Q1 date assumes v2 takes the whole share, about 17 SP a week (spec § 14). The user also ruled at G5 that the sorting-session follow-ups stay weekly picks beside v2. So either the date moves out, or those picks wait. The ROADMAP, GOALS and MILESTONES dates carry that assumption until the share is set.

---

## Parallel Work

- **Auto-deploy: no** (Electron desktop app; a single `main` trunk with no production branch; no `.github/workflows/` and no deploy step — GOALS § Constraints "No CI service"). No Deploy Window group.
- **User-in-the-loop steps** (part of their groups; listed here so they are visible in one place): **before Monday** — update the terminal CLI past 2.1.295 (the `onFailure` trial's precondition; it reports 2.1.289); **Tue** — start `/claude-security` _Scan changes_ on G1's diff (the norm since leg 2 for a PR touching `main.js` or `preload.js`; the plugin is `disable-model-invocation`, so only the user can); **Thu** — G2's 24k smoke on the real folder, cold hash cache; **Fri** — G5's board decisions.
- **User-side 24k smokes (optional, not gates)**: PR #66 re-smoke round 2, still never run.
- **Cleanup Week #5** (Oct 26–30): its planning pass, ~Oct 24–25, plans from the docs G5 refreshes. Already waiting for it: the recurring plugin context-cost read-out (REVIEW-QUEUE § 5), the `CLAUDE.md` byte-trigger re-set (🟡 [2026-10-17]), and the parked `g3-departed-clips-parked` branch decision (🟤 [2026-10-16]).

---

## Task Groups

### G1. Confine page-side file loads to the granted folders (I1) `[solo]` 🟤 — main process + CSP — 5 SP

> **Front-loaded to Mon–Tue** (user ruling 2026-10-16: I1 next, after G4). **Disclosure**: this repo is public. The measured detail stays in the git-ignored local spec original (`CLAUDE-SECURITY-20261008-084826/`), and the plan, commit messages and PR body stay at stub level until the fix merges. `preload.js` edits prompt by design (the `permissions.ask` rules and `guard-preload-bash.js`). **Trial vehicle: `"onFailure": "block"`** — the forced-failure probe runs at the start of this session, before G1's own work (REVIEW-QUEUE § 5, 2026-10-18 ruling; restore the guard script with Read and Write, per the trial row). G2 branches after G1 merges only if its design loads files through the page.
> **Model:** start Opus · `high` — **stepped up one row** from 5–7 SP because the group is safety-critical (main-process file loads, the CSP, possibly a custom protocol); `xhigh` to write the spec and plan (which loads the page may make is the design decision — deeper reasoning) → execute Opus · `medium`; review deep (`max`), plus the user's _Scan changes_ — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [x] ✅ **MERGED 2026-10-19 via PR #84 (merge `4548269`)**, at ~7 SP against 5 planned; see [DONE.md](DONE.md). The window is served from `app://media-viewer/`: allowlisted app files, and granted media through main's read rule. The CSP is a response header that reaches workers, renderer network requests are cut off (WebRTC included), Lucide is vendored, and settings move once to the new origin. Every confined load class had a test that failed on `main` first; the CSP walk stayed green; video seeking works through the handler (a ~43 MB clip, mutation-checked); _Scan changes_ came back clean (not a clearance). One PR review round: 1 finding, fixed in `5b8393a`. Spec published: [I1 spec](../superpowers/specs/2026-10-18-g1-i1-page-load-confinement-design.md). Left for the user: the first launch on the real profile (TODO 🔴). _Original:_ **Confine page-side file loads to the granted folders (G1 residual I1)** — per the TODO 🔴 item: serve the app from a custom scheme, or `protocol.handle('file', …)`, limited to the app folder, the granted roots and main's tracked temp folders. In scope: video range requests through the handler, page-side loads kept consistent with G1's symlinked-media decision, and WebRTC and other egress the CSP doesn't govern. **Acceptance**: each confined load class has a test that fails on `main` first; the E2E CSP walk (`tests/e2e/security-csp-walk.test.js`) stays green; video seeking still works through the handler; _Scan changes_ comes back clean for these sites (a clean pass, not a clearance — § 5's `claude-security` caveat). Re-estimated from ~1.5–2.5 SP at planning. `main.js`, `index.html` (CSP), `media-viewer.js` if media URLs change, `tests/` (5) — TODO 🔴 [2026-10-11] ← 🟤 [2026-10-11] G1 closeout residual I1

### G2. Hash and similarity sort off the renderer thread (24k PR2) `[solo]` 🔵 🏆 — sorting pipeline — 8 SP

> The last slice of the 24k-sort decomposition (PR1 merged 2026-06-20, PR3 2026-07-20) and GOALS Objective 1's only 🔴 Key Result, open since June. **The 2026-06-19 constraint stands: "quality must not change at all"** — every hash must come out bit-identical, so the off-thread decode must match today's renderer decode. **User-in-the-loop on Thursday**: the 24k smoke on a cold hash cache. Its planning reads the 🟤 [2026-10-12] G2-closeout entries on the same handler (the stale-snapshot catch, a result landing under an in-flight render, Restore Order dropping a file) and checks off only what it fixes by construction. Carries no trial (it already has a user dependency).
> **Model:** start Opus · `high` (the 8+ SP row: edge cases likely across the renderer, a worker and the hash cache); `xhigh` to write the spec and plan → execute Opus · `medium`, Sonnet · `medium` for steps the plan spells out; review deep (`max`); `sorting-worker.js` is a Tier 2 file (PROJECT.md: plan review required) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)
> **Re-estimated at design, 2026-10-19: ~13 SP in two PRs** ([spec](../superpowers/specs/2026-10-19-g2-hash-sort-off-renderer-design.md) `47d870c`, D7, user ruling). **PR 1** (~6 SP; [plan](../archive/plans/2026-10-19_g2-hash-sort-pr1-end-of-sort-fixes.md), archived): the end-of-sort fixes on today's hashing route — snapshot, run token, saves, no-restore cancel, one apply function, the "Show" message — closing the three 🟤 [2026-10-12] entries. **PR 2** (~7 SP; a new branch after PR 1 merges): the background hashing route, the in-app parity mode, the canary and Thursday's smoke. The acceptance below is superseded where the spec differs: parity is checked by the in-app diagnostic on a same-day, same-build run (D4, D5; the December `.hash_cache.json` is not a valid reference, F6), and the "sorted order unchanged" check is dropped (my call 10). **G3 is expected to slip a day or two.** PR 1 leaves `sorting-worker.js` untouched, and PR 2's scope does not list it, so the Tier 2 plan review should not apply.
> **PR 1 ✅ MERGED 2026-10-20 via PR #85 (`f668611`)**: the end-of-sort fixes, plus two user-approved additions. Restore Order now waits for render idle, and the AI sort never applies its order under a loading file. PR 1 ran well past its ~6 SP: Tasks 6–7 were added, and the reviews took three fix waves. The user approved each step. **Order from here (the user's ruling at the PR #85 review):**
> 1. ✅ **Done: the data-loss fix**, TODO 🔴 "Stop the feature cache being wiped on a folder switch": MERGED 2026-10-22 via PR #86 (`654fb3e`); see DONE.md.
> 2. ✅ **Done: G2 PR 2, MERGED 2026-10-25 via PR #87 (merge `f5ddfa3`)**, two days past the Friday. The smoke ran on 2026-10-25: the first parity run failed on the bit-count rule, which led to the user's ruling B15 (D4 measured on the pixels), and the re-run and the normal run passed. Five PR review rounds, the last run in the implementation chat at the user's request. Before that, as planned: **G2 PR 2** (background hashing, the parity mode, the 24k smoke) on a new branch. Its plan must carry the atomic `write-folder-cache` (PR #85 review #5). **Plan written 2026-10-22** ([plan](../archive/plans/2026-10-22_g2-hash-sort-pr2-background-hashing.md), branch `g2-pr2-background-hashing`). It is re-estimated at ~9 SP, and the atomic writes now cover `.bulk_rated.json` too (spec § 17). Thursday's smoke could not run on Thursday, because PR 2 was not built yet. **The user moved it to Friday 2026-10-23** at plan approval. **PR #87** opened 2026-10-22. The smoke did not run on Friday: the perf log has no `Hash parity:` line through 2026-10-24. Review round 1's fixes landed 2026-10-24, and they change the hashing code, so the smoke runs on that head, on a date the user sets.
> 3. G3 is next: PR 2 has merged.
>
> Details: DONE.md.

- [x] ✅ **MERGED 2026-10-25 via PR #87 (merge `f5ddfa3`)**, at ~14–15 SP against ~9 re-estimated (G2 was planned at 8 SP for both PRs); see [DONE.md](DONE.md).
  - A similarity sort hashes in a per-run pool of 3 workers behind a pixel-exact canary, with the main-thread route as the fallback.
  - `MV_HASH_PARITY=1` checks both routes on every image; D4 is measured on the pixels (B15).
  - The three folder files are written atomically.
  - The `Liked_2` smoke passed on the re-run: 4 of 14,150 differed, all ±1-pixel rounding. A cold hash phase took 580 s in the background, against 1,262 s frozen.
  - The acceptance below is superseded where the spec differs: parity was checked in-app (D4, D5), not against December's cache.
  - `media-viewer.js` went 11,879 → 11,945 (+66, the parity glue and the pool orchestration); the hashing code lives in its own modules.
  - It closes TODO 🔴 "Speed up AI / similarity sorting…"; the sort phase's 38% went to BACKLOG 🔵 [2026-10-25].

  _Original:_ **Move perceptual-hash computation off the renderer main thread (PR2)** — the remaining slice of TODO 🔴 "Speed up AI / similarity sorting on large folders": the biggest cold-cache freeze on the 24k folder. Candidate design: a worker decoding bytes read through the existing guarded IPC with `createImageBitmap` + `OffscreenCanvas` (a `sharp` decode in main would change the hashes); videos stay on their current path unless an off-thread decode is shown bit-identical. Keep the determinate progress card and Cancel (`updateSortProgress` only — the shared-element gotcha). **Acceptance**: (a) an **E2E** parity test (both decode paths are Chromium's, so Vitest cannot run it) on new generated fixtures that exercise where the two decodes can differ — EXIF-rotated, ICC-profiled and progressive JPEGs, a PNG with alpha, an image large enough to be downscaled, an animated GIF's first frame (`sharp` can write them from `tests/e2e/fixtures/generate.js`); the existing fixtures cannot carry this check, since `tests/` holds no JPEG and its PNGs are 1×1, 64×4 and 320×240 (measured 2026-10-18); (b) during the user's 24k smoke, the new path hashes the folder into a **separate** cache file, diffed entry by entry against the folder's existing `.hash_cache.json` (written by today's renderer path) — zero differences, or each one explained (a stale entry, say); (c) the smoke shows the UI responsive during hashing and the sorted order unchanged; before/after timing in `media-viewer-perf.log`; the new hashing code lives in the worker or its own module, not in `media-viewer.js`, and the closeout reports the renderer's net line change (`wc -l` before and after — the week's theme is stopping its growth). It does not move the O(n·K) neighbor-graph floor (the TODO note). `media-viewer.js` (`computePerceptualHash`, `handleSortBySimilarity`), `sorting-worker.js` or a new hash worker, `tests/` (8) — TODO 🔴 [2026-06-18] ← 🔵 manual testing

### G3. ZoomManager extraction (v2.0) `[solo]` 🔵 — renderer modularization — 5 SP

> The first v2.0 extraction since `MlTrainingManager` (PR #68, 2026-09-10), and the third manager. Chosen by the user at planning and filed 🔵 by ruling (BACKLOG 🔵 [2026-10-18]). Branch after G2 merges, so the two never edit `media-viewer.js` at once. **Trial vehicle: `typescript-lsp`**, its last (stop rule): add `typescript@6` as a devDependency in this session, then confirm that the server starts — an `LSP documentSymbol` request on a `.js` file returns symbols — before the trial counts (REVIEW-QUEUE § 5, 2026-10-18 ruling). **Visual evidence**: committed before/after screenshots of the zoom popover open in single and compare mode — no visual change is the acceptance, and the compare shot is the clipping check the held-back 🟤 [2026-03-22] entry needs.
> **Model:** start Opus · `medium` (the 5–7 SP row); `high` to write the spec and plan (the manager's boundary and its host callbacks are the real design decision) → execute Sonnet · `high` (the plan carries the design; `high` because for a refactor verification is the whole acceptance); review thorough (`high`) — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [x] ✅ **MERGED 2026-10-26 via PR #90 (merge `082e3b2`)**, at ~8 SP against 5 planned (~6 re-estimated at design: +1 for the characterization E2E); see [DONE.md](DONE.md). `ZoomManager` (`zoom.js`) holds the zoom code, and `MediaViewer` delegates through `this.zoom`. `media-viewer.js` went 11,945 → 11,529 lines (−416), and the after screenshots are pixel-identical to the before ones. The characterization E2E (A–K) came first, with A–F each shown able to fail. Four review rounds then fixed four older zoom bugs by the user's ruling (spec § 12). It closes the 🔵 entry and four 🟤 zoom entries; the AbortController test and `removePopover('single')` stay open, renamed. `typescript-lsp` ran its last vehicle; the evidence is in REVIEW-QUEUE § 5 for G6. The original task follows.
- **Extract ZoomManager from the renderer** — per 🔵 [2026-10-18]: move the two zoom blocks (~440 lines — the popover methods ~L2919–3085 and the transform, pan and wheel layer ~L8061–8332) into a `zoom.js` manager on the v2.0 pattern, as `FullscreenManager` did. Keep `removeZoomPopover` off the toggle button's parent and `handleWheelZoom`'s stop-propagation (CLAUDE.md § UI Components). **Acceptance**: unit and E2E suites green; CLAUDE.md § Architecture gains a `zoom.js` line; the renderer's line count drops by the lines moved, measured; the open 🟤 zoom entries the entry lists are checked off where the extraction closes them, and not taken on otherwise. `media-viewer.js`, new `zoom.js`, `fullscreen.js` (only if its `isZoomed` callback changes shape), `package.json` (`typescript@6`), `tests/`, `CLAUDE.md` (5) — 🔵 [2026-10-18] weekly planning conversation

### G4. Formatter hook per-edit cost `[solo]` 🔵 — Claude Code hooks — 2 SP

> Independent of G1–G3; Wednesday, so the renderer edits in G3 already run on the faster hook. Writes under `.claude/` are protected-path writes. A solo 2-SP group by exception: no 🔵 domain-mate among this week's tasks (Notes).
> **Model:** start Sonnet · `medium` → same session, no switch (the 1–2 SP row); review light (`medium`), one level up to `high` if it touches `.claude/settings.json`, which carries the `permissions.ask` rules — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [x] ✅ **MERGED 2026-10-26 via PR #89 (merge `7f75013`)**, at ~2 SP as planned, three days past the Friday (Spillover); see [DONE.md](DONE.md). Both remedies shipped. The hook skips every path Prettier ignores before Prettier starts, using Prettier's own check (`.gitignore` too). It leaves the root `media-viewer.js` to lint-staged. Interleaved re-time, median: 1,384 → 65 ms and 229 → 83 ms. `async` was ruled out by mechanism, and `.claude/settings.json` is untouched. The original task follows.
- **Cut the formatter hook's per-edit cost** — per 🔵 [2026-10-17]: (1) skip every path `.prettierignore` matches before spawning Prettier, reading `.prettierignore` itself (the `ignore` package as a devDependency), ~150 ms per doc edit with no behaviour change; (2) for the renderer's 1.1 s, the narrower matcher (leave `media-viewer.js` to lint-staged at commit) unless a measurement favours the `Stop` hook or `async`. **Acceptance**: re-timed with the entry's own probe (10 runs per file, median and max) before and after, with its positive control (a planted unformatted file comes back formatted). `.claude/hooks/format-edited-file.js`, `tests/format-edited-file.test.js`, `package.json`, possibly `.claude/settings.json` (2) — 🔵 [2026-10-17] Weekly Reviews § 4 inbound

### G5. Strategic-doc refresh `[solo]` 🟡 — strategic docs — 3 SP

> **Friday, after G1–G3 merge**, so the docs record them. The user decides where the shipped themes sit on the board. Docs-only.
> **Model:** start Opus · `xhigh` (the Strategic planning row: where shipped themes sit on the board is strategic judgment — deeper reasoning) → execute Sonnet · `medium` for the mechanical fact edits; review standard (`high`): counts and dates — first guess; the plan confirms or revises it (WORKFLOW.md § 1.0)

- [ ] **Refresh MILESTONES.md / ROADMAP.md / GOALS.md** — per 🟡 [2026-10-18]: place the Oct 12–16 work on the board (or record it as a drained theme), update the v2.0 status after G3 and Objective 1's PR2 Key Result after G2, correct the renderer line count where the strategic text states it, and bump each `Last Updated`. **Re-baseline the "< ~6,000 lines" target** (GOALS Objective 2): it needs ~5,400 lines out, and four extractions of ZoomManager's size cannot reach that while the renderer grows. The user also decides whether new subsystems must land in their own modules; if yes, back the rule with a control, not prose alone — a never-blocking `media-viewer.js` line-count warning on the `scripts/check-claude-md-size.js` pattern, filed to BACKLOG (added at planning, 2026-10-18, from a side-agent note). The derived-count sweep stays with 🟤 [2026-09-02]. `MILESTONES.md`, `ROADMAP.md`, `GOALS.md`, `PROJECT.md` (3) — 🟡 [2026-10-18]

### G6. Weekly Reviews `[batch]` ⚪ Overhead — research / process — 5 SP

> Read [REVIEW-QUEUE.md](REVIEW-QUEUE.md) first. **Window ≈ 6 days** (last run 2026-10-17). **D4 order**: read out any trial whose vehicle ran first — G1's `onFailure`, G3's `typescript-lsp` (its last vehicle) — then §§1–3. § 5 stands at **2** outstanding trials, under the cap. §1 diffs plugin names from the pinned baselines (official `ea10b21`, community `06ec7b6`). Docs-only: merge or dated-defer in-session.
> **Model:** Opus · `medium`, named directly because ⚪ overhead fits no row of the § 1.0 table: research and verdicts, with each claim checked against its primary source; Sonnet · `medium` is enough for the routine sourcing searches.

- [ ] **Plugins (2 SP)** — two independent tops: official catalog + wider internet, each with `source:`.
- [ ] **Claude best-practices (1 SP)** — fresh check vs. the parked list; name the host any version gate reads (🟤 [2026-10-18]).
- [ ] **Non-Claude AI best-practices (1 SP)**
- [ ] **Cross-project propagation (1 SP)** — outbound: this week's shipped work (G1–G5) and memory files changed since 2026-10-17, at the high bar, with matched scopes on both sides of any count (🟤 [2026-10-18]); inbound: new sibling rows naming this repo; and the status of the two TODO § Spawned Tasks rows handed over on 2026-10-17.

---

## Daily Schedule

### Monday, October 19 — Security first

> G1 goes first by the user's ruling; its session opens with the `onFailure` probe.

- ✅ **[G1](#g1-confine-page-side-file-loads-to-the-granted-folders-i1-solo---main-process--csp--5-sp)** 🟤 — the `onFailure` probe; spec and plan at stub level; a test per load class that fails on `main` (part 1 of 2). Done ahead of the week, on Sunday 2026-10-18, with the build and verification.

**Daily total**: ~3 SP

### Tuesday, October 20 — Security lands; PR2 design

- ✅ **[G1](#g1-confine-page-side-file-loads-to-the-granted-folders-i1-solo---main-process--csp--5-sp)** 🟤 — finish; the user starts _Scan changes_; review; merge (part 2 of 2). Merged `4548269` (PR #84) on Monday 2026-10-19, a day early, after one review round; nothing dropped.
- ✅ **[G2](#g2-hash-and-similarity-sort-off-the-renderer-thread-24k-pr2-solo----sorting-pipeline--8-sp)** 🔵 🏆 — spec and plan: the quality lock and the parity test (part 1 of 3). Spec `47d870c` and the PR 1 plan written on Monday 2026-10-19, after a spike; G2 split into two PRs (D7).

**Daily total**: ~4 SP

### Wednesday, October 21 — PR2 build; hook cost

- ✅ **[G2](#g2-hash-and-similarity-sort-off-the-renderer-thread-24k-pr2-solo----sorting-pipeline--8-sp)** 🔵 🏆 — implement; parity tests; perf lines (part 2 of 3). Re-planned: PR 1 (end-of-sort fixes) implement, review, merge; then PR 2's plan. **PR 1 ✅ `f668611` (PR #85, merged 2026-10-20).** Its review ran into Wednesday; PR 2's plan has not started.
- ✅ **[G4](#g4-formatter-hook-per-edit-cost-solo---claude-code-hooks--2-sp)** 🔵 — both remedies; re-time; review; merge. Ran on Monday 2026-10-26, after the week: PR #89 merged `7f75013` after three review rounds and a close-out.

**Daily total**: ~6 SP

### Thursday, October 22 — PR2 smoke; the extraction starts

- ✅ **[G2](#g2-hash-and-similarity-sort-off-the-renderer-thread-24k-pr2-solo----sorting-pipeline--8-sp)** 🔵 🏆 — the user's 24k smoke; review; merge (part 3 of 3). Re-planned: PR 2 (background hashing, parity mode) implement; the user's smoke on `Liked_2`; review; merge. G3 starts after PR 2 merges. **2026-10-22**: the PR 2 plan was written and approved, and implementation started; the smoke moved to Friday.
- ✅ **[G3](#g3-zoommanager-extraction-v20-solo---renderer-modularization--5-sp)** 🔵 — `typescript@6` and the server check; before screenshots; spec and plan; extract (part 1 of 2). Ran on Monday 2026-10-26, after the week: spec, plan and the five tasks in one native session.

**Daily total**: ~5 SP

### Friday, October 23 — Extraction lands; refresh; reviews

- ✅ **[G2](#g2-hash-and-similarity-sort-off-the-renderer-thread-24k-pr2-solo----sorting-pipeline--8-sp)** 🔵 🏆: **the user's 24k smoke on `Liked_2`**, on the PR 2 branch, moved here from Thursday (the user's ruling, 2026-10-22). Then the review and the merge. The smoke ran on Sunday 2026-10-25 instead, and PR 2 merged the same day: `f5ddfa3` (PR #87).
- ✅ **[G3](#g3-zoommanager-extraction-v20-solo---renderer-modularization--5-sp)** 🔵 — suites green; after screenshots; review; merge (part 2 of 2). Merged `082e3b2` (PR #90) on Monday 2026-10-26, after four review rounds and a close-out in a separate chat, and two hand passes with the user.
- **[G5](#g5-strategic-doc-refresh-solo---strategic-docs--3-sp)** 🟡 — after G1–G3 merge; the user's board decisions
- **[G6](#g6-weekly-reviews-batch--overhead--research--process--5-sp)** ⚪ — trial read-outs first, then §§1–4
- Buffer for review rounds. Closeout per group, **after its merge**: Summary-Table Status → `✅ PR #N`, the group's Daily-Schedule rows, and every BACKLOG/TODO entry it closed — in the closeout commit.

**Daily total**: ~5 SP + 5 overhead + buffer

---

## Summary Table

| ID  | Group                                                        | Domain                     | Source      | Tasks | Total SP | Day     | Status     |
| --- | ------------------------------------------------------------ | -------------------------- | ----------- | ----- | -------- | ------- | ---------- |
| G1  | Confine page-side file loads (I1) `[solo]`                   | Main process + CSP         | 🟤 Auto     | 1     | 5        | Mon–Tue | ✅ `4548269` (PR #84) |
| G2  | Hash and similarity sort off the renderer thread `[solo]` 🏆 | Sorting pipeline           | 🔵 User     | 1     | 8        | Tue–Thu | ✅ `f5ddfa3` (PR #87); PR 1 `f668611` (PR #85) |
| G3  | ZoomManager extraction `[solo]`                              | Renderer modularization    | 🔵 User     | 1     | 5        | Thu–Fri | ✅ `082e3b2` (PR #90) |
| G4  | Formatter hook per-edit cost `[solo]`                        | Claude Code hooks          | 🔵 User     | 1     | 2        | Wed     | ✅ `7f75013` (PR #89) |
| G5  | Strategic-doc refresh `[solo]`                               | Strategic docs             | 🟡 Ops      | 1     | 3        | Fri     | ☐ Planned  |
| G6  | Weekly Reviews `[batch]`                                     | Research / process         | ⚪ Overhead | 4     | 5        | Fri     | ☐ Planned  |
|     | **Total (quota-counted)**                                    |                            |             | **5** | **23**   |         |            |
|     | **Total (incl. ⚪ overhead)**                                |                            |             | **9** | **28**   |         |            |

_Source legend: 🔵 User · 🟡 Ops · 🟤 Auto · ⚪ Overhead (exempt from the quota denominator)._
_Status cell on completion: `✅ PR #N` where a PR was opened (every group since 2026-09-10 has been), else `✅ <merge-SHA>` — never a bare `✅`. Flip it in the closeout commit, which runs after the merge, together with the group's Daily-Schedule rows and every BACKLOG/TODO entry the group closed._

---

## Notes

- **Theme.** The user chose theme A ("stop the renderer's growth") over B (sorting-session follow-through: hash/AI sort mutual exclusion, a Delete/bucket action, the file-size weighting toggle) and C (sorting only: PR2 plus the mutual exclusion, no extraction). It answers the question two plans carried forward: PR2 and the first extraction had stayed open since the Sep 7–11 and Oct 12–16 plans chose user features. ZoomManager moves about 440 lines, roughly 4% of the renderer and under a third of last week's +1,462: it starts the extraction run rather than reversing the growth. A side-agent note after approval raised the same point; the user kept ZoomManager and approved three follow-ups (2026-10-18): G2 keeps its new code out of the renderer and reports the net line change; G5 re-baselines the target and decides a modules rule with a line-count warning; and **SortingManager is the next extraction**, once PR2 has settled — not this week, because extracting the sort code while PR2 reworks it would put both groups' risk on the same lines. A second side-agent note found G2's parity test could not fail on the existing fixtures (no JPEG in `tests/`); the user approved edge-case fixtures plus a diff against the real folder's `.hash_cache.json` as G2's acceptance (2026-10-18).
- **Sizing and drop order.** 23 quota-counted SP at honest estimates. Velocity reference: Oct 12–16 planned 22 and delivered ~41.5 of actual scope (+5 overhead) in eight days, Oct 11–18 — estimates ran ~1.9× low, which is why I1 is re-estimated from ~1.5–2.5 to 5. **Overrun drop order**: G4 first (to the next normal week), then G5 (to Cleanup Week #5, where its 2-month bar falls anyway), then G2's tail spills into next week with a `**Spillover**` line. **Never drop** G1 or G3, the theme's centre. Each drop raises the _delivered_ 🟤 share past or near the cap — 5 / 21 = 24% after the first, 5 / 18 = 28% after the second — accepted in advance; record it at closeout.
- **Dependencies.** G1 first (user ruling). G2 after G1 only if G2's design loads files through the page; otherwise it may start in parallel. G3 after G2 merges (both edit `media-viewer.js`). G4 independent. G5 after G1–G3 merge. G6's trial read-outs after G1 and G3.
- **Trials — one per group, so no two share a session (user ruling at this planning, REVIEW-QUEUE § 5 stocktake 2026-10-18).** `"onFailure": "block"` → G1, probe first. `typescript-lsp` → G3, moved off its row's literal trigger ("the first group that edits `media-viewer.js` or a worker", likely G1): an extraction is mostly find-references and call-hierarchy work, which is the trial's question, and it keeps the `typescript@6` devDependency out of a security PR. Its stop rule stands: this is its last vehicle.
- **Security disclosure.** Until G1 merges, everything committed about I1 stays at stub level (component, class, severity) — the plan, commit messages and the PR body included; memory `feedback_public_repo_security_stubs.md`. **Lifted 2026-10-19:** G1 merged (`4548269`), and its closeout published the spec and the plan's rulings.
- **Strategic docs — drift found, refresh filed and scheduled (G5).** Last week's theme shipped outside the board's Now column, the renderer is 11,451 lines against the restated "~9,400", and all three `Last Updated` cross the 2-month bar on 2026-10-27. Filed as 🟡 [2026-10-18]; scheduled this week rather than in Cleanup Week #5 so that week's planning reads current docs.
- **Solo 2-SP exception.** G4 is a solo 2-SP group because no selected 🔵 task shares its domain (Claude Code hooks); the 🟤 hook entries cannot join a 🔵 group without mixing sources.
- **Branch / PR shape.** Four code branches (G1–G4), each through a PR, as every group since 2026-09-10 has been. G5 and G6 are docs-only: merged or dated-deferred in-session.
- **Reaps — nominated in the brainstorm, user-approved and executed 2026-10-18** (entry bodies deleted, tombstone rows in Rejected Ideas; the two touched headers that carried a count lost it, per [README.md](README.md) § Document Conventions). Each premise was checked first-hand against `main`, after a read-only sweep that rated it obsolete:
    1. 🟤 [2026-03-20] TASK-016 _"Use waitForNotification() in future E2E tests"_ — the helper is used: 5 call sites in `ml-retrain-skip.test.js` and `recent-folders.test.js`.
    2. 🟤 [2026-03-20] PR #15 _"Document waitForNotification() retention decision"_ — moot for the same reason.
    3. 🟤 [2026-06-13] PR #47 _"CLAUDE.md `decodeJxl ×4` test description…"_ — CLAUDE.md carries no per-test descriptions any more.
    4. 🟤 [2026-06-15] PR #49 _"CLAUDE.md E2E note now stale: `app-launch.test.js`…"_ — `app-launch` has 0 hits in CLAUDE.md.
    5. 🟤 [2026-03-20] PR #14 _"Update CLAUDE.md signalUserActivity() caller list"_ — CLAUDE.md keeps no caller list.
    6. 🟤 [2026-03-24] PR #21 _"Consolidate duplicate Git Insights entries"_ — no per-task Git Insights bullets remain; `TASK-023` 0 hits.
- **Held back from the reap**: 🟤 [2026-03-22] PR #19 _"Verify zoom popover not clipped by `overflow: hidden` on `.media-wrapper`"_ — almost certainly obsolete (PR #70 moved the controls out of the wrapper), but whether the overlay bar's own ancestors clip it is unchecked; G3's compare screenshot settles it.
- **Further reap candidates — not executed; for a later planning pass to nominate** (rated by the same sweep, weaker or unverified): 🟤 [2026-03-22] PR #19 _"Add `transition-delay: 0s` to fullscreen overlay rule"_ (0 `transition-delay` hits in `styles.css`; the entry is a "fixed, keeping for reference" note); 🟤 [2026-03-20] TASK-017 _"Audit remaining CLAUDE.md Git Insights for stale references"_ (the per-task entries it would audit are gone; the Active gotchas list was not audited); 🟤 [2026-03-21] TASK-020 _"Content-understanding features"_ (576-dim CLIP input shipped; runtime population not checked); 🟤 [2026-03-20] TASK-016 _"Investigate transient Vitest 'No test suite found' failures"_ (mitigated by `pool: 'threads'`, root cause unconfirmed); 🟤 [2026-03-21] PR #18 _"Mark code-review-pr-17 BACKLOG items as done…"_ (not checked). A 🔵 candidate, user-raised and unverified: [2026-05-05] _"Overlay buttons have 3-stage 'jumping' hover/leave transition"_ — the overlay controls were rebuilt in PR #70.
- _Brainstorm sanity-checks (user-in-the-loop, 2026-10-18): week dates confirmed Mon Oct 19 – Fri Oct 23, 2026 vs. today (Sunday Oct 18) and git/DONE (last commit `73527a9` today; no DONE entry for that week); the previous plan (Oct 12–16) finished **two days past its Friday** (G5 2026-10-17, G6 2026-10-18 — inside the close-out gate's 2-day grace, so no `Spillover` line was needed, and nothing fell due in those two days), and **G1 merged 2026-10-11, before its header Monday**; no week went unplanned; velocity 22 planned → ~41.5 actual scope + 5 overhead in eight days → ~23 at honest estimates agreed; Cleanup Week **not due** (#5 Oct 26–30; the size trigger has fired continuously and the cadence governs); quotas satisfiable once the ZoomManager extraction was filed 🔵 by user ruling (without it 🔵 = 10 / 23 = 43%); six reap nominations put in-dialogue, all approved and executed; the trial vehicles decided in-dialogue._

### Quota Check

- 🔵 **User-Flagged SP**: 15 / 23 (**65%**) — ✅ ≥50% (G2 8, G3 5, G4 2). G2 is a TODO 🔴 carry-forward and counts against its origin section (🔵, manual testing 2026-06-18); G3 was filed 🔵 by user ruling at this planning (BACKLOG 🔵 [2026-10-18]).
- 🟡 **Operational SP**: 3 / 23 (**13%**) — ✅ ≤25% (G5).
- 🟤 **Auto-Generated SP**: 5 / 23 (**22%**), **1 group** (G1) — ✅ ≤25% and ≤1 group. G1 is a TODO 🔴 carry-forward; it counts against its origin section (🟤, G1's closeout residual I1).
- **Cleanup Week status**: normal (next due October 26–30, 2026).
- **Last Cleanup Week**: October 5–9, 2026 (the 4th).
- **Compliance**: ✅ all quotas met.
- _Denominator note_: Y = total quota-counted SP (23) — the exempt ⚪ Overhead Weekly Reviews batch (G6, 5 SP) is excluded; 28 incl. overhead. No Deploy Window (auto-deploy: no).

---

## Weekly Challenge 🏆

**Hash and similarity sort off the renderer thread** (Group G2, Tue–Thu).

**Why this one**: it is the last open slice of the user's own top-priority report ("speed these up first", 2026-06-18), GOALS Objective 1's only 🔴 Key Result, and it has been passed over since June. The stretch is the quality lock: moving the decode off the main thread is the easy half, and proving every hash bit-identical — then confirming on the real 24k folder that the order did not change while the UI stayed responsive — is the hard one.

---

## Previous Week Summary

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
