# Weekly Plan

**Week**: Monday June 15 – Friday June 19, 2026
**Created**: 2026-06-11
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md, BACKLOG.md (📌 Process Rules), TODO.md, git log (last 2 weeks), previous WEEKLY.md (June 1–5, archived below)
**Type**: 🧹 **CLEANUP WEEK** (active) — quota inverted: ≥50% SP from 🟤 Auto-Generated; the ≤1-🟤-group/week cap is lifted for this week only.

**Context**: First-ever Cleanup Week. It was declared **due** in the June 1–5 plan (both triggers met: 🟤 section >20 SP pending, no Cleanup Week on record) and deferred to June 8–12 — but June 1–5's groups ran long (Groups B/C/D shipped June 9–11), so June 8–12 passed without one. This week concentrates the accumulated PR-review follow-ups, test backfill, and doc drift into focused batches, led off by the one fresh 🔵 user-flagged pain point (slow animated-JXL load) as the 🏆 challenge. Target lowered to **24 SP** based on observed velocity (the 30 SP June 1–5 plan took 9 working days including review/closeout cycles).

---

## Parallel Work

- **Pending user verification**: manual smoke of Group C (CLIP extraction UX, PR #45) — the starting-extraction toast + toggle-on kickoff shipped 2026-06-10 with unit/E2E green, but the manual smoke noted in the session log is still open. No SP; user-side check.

---

## Task Groups

### Group CW-5: Progressive animated-JXL decode (frame-0-first) 🏆 🔵
**Domain**: JS logic (decode worker protocol)
**Source**: 🔵 User-Flagged
**Total SP**: 5 — solo (worker-protocol redesign justifies its own run)

- [x] **Progressive / streaming decode for large animated JXL** — 5 SP, 🟠 IMPORTANT
  - Per BACKLOG 🔵 [2026-06-07] Group A manual-testing intake. A 270-frame, 27 MB `.gif.jxl` decodes ALL frames (~77 MB of PNGs) before `decodeJxl` resolves → several seconds of spinner before anything renders. Fix: worker posts frame 0 immediately (`{type:'frame', id, index, total, pngBytes, duration}` stream + terminal `{type:'decoded'}`), renderer displays frame 0 on arrival, accumulates the rest, starts the animation loop once buffered.
  - Affected: [jxl-decode-worker.js](../../jxl-decode-worker.js), [media-viewer.js](../../media-viewer.js) (`decodeJxl`, `startJxlAnimation`, `_jxlPending` protocol).

### Group CW-1: Renderer correctness guards [batch] 🟤
**Domain**: JS logic (defensive fixes + unit tests)
**Source**: 🟤 Auto-Generated
**Total SP**: 8 — one branch, one PR, one review

- [x] **Clear `clipCache` in `loadFolder()`** — 1 SP, 🟠 IMPORTANT (real bug under path-identical filenames across folders)
  - PR #34 follow-ups (BACKLOG 2026-05-10). `loadFolder()` clears featureCache/featureMetadata/perceptualHashes/predictionScores but never `clipCache` → stale 512-dim vectors can leak across folder switches. One-line fix + test.
- [x] **`isLoading` guard on `handleTournamentDraw` + `handleTournamentPick`** — 1 SP
  - PR #41 follow-ups (~75/100, BACKLOG 2026-06-04). Button double-click mid-`showTournamentPair()` fires a second `recordDraw` after `roundQueue` shifted → unhandled `'No active pair to record'` rejection. Add `if (this.isLoading) return;` to both, try/catch belt-and-suspenders.
- [x] **`showCompareMedia()` `<2 files` branch exits tournament mode** — 1 SP
  - PR #38 follow-ups (~62/100, BACKLOG 2026-05-28). Guard calls `switchToSingleModeUI()` but leaves `isTournamentMode = true` (tournament keymap + overlay live over single-mode UI). One-line `exitTournamentMode()` before the switch.
- [x] **`handleCancel` compare-pair entry-type guard + null `leftMedia`/`rightMedia` in `switchToSingleModeUI()`** — 1 SP
  - PR #40 follow-up (~25) + Group B impl-review follow-up (BACKLOG 2026-06-02 / 2026-06-09). Add `&& lastMove.compareMode` to the compare-pair undo condition; null the two media refs alongside the wrapper teardown. Rider (forced by the guard change): tag the `handleCancel` compare-pair test fixtures with `compareMode: true` (PR #35 follow-up, BACKLOG 2026-05-16 — those fixtures currently omit the flag the new guard consults).
- [x] **Reset `clipWorkerReady = false` when `unloadClipModel` fires** — 1 SP
  - PR #45 follow-up (BACKLOG 2026-06-10). Stale-true flag makes toggle-on-after-unload skip the eager `initClipModel()` (per-first-call ~1-2s reload latency instead). Reset after the `unloadClipModel()` IPC resolves — which also closes the PR #31 follow-up "`unloadClipModel` fired without await or error handling in timer callback" (BACKLOG 2026-04-28, same 3-line edit: await + `.catch()`/result check). Optional same-site riders if trivial: fire-time `enableClipFeatures` re-check (BACKLOG 2026-04-28) and `CLIP_UNLOAD_DELAY_MS` named constant (BACKLOG 2026-04-21).
- [x] **Local-capture pattern in `feature-cache-write-chunk` IPC handler** — 1 SP
  - PR #38 follow-up (~75/100, BACKLOG 2026-05-28). `const writer = featureCacheWriter` + null-guard before the `'drain'` await — the documented required pattern for long-running IPC handlers sharing module-level state.
- [x] **JXL error-path hardening trio** — 2 SP
  - Group A impl-review + PR #42 follow-ups (BACKLOG 2026-06-07). (a) `decodeJxl` per-request timeout (mirror `loadMediaAsImageData`'s 15s pattern; reject + delete `_jxlPending` entry); (b) try/catch around the worker `{type:'init'}` branch → structured `{type:'init-error'}`; (c) toast when an entire animation is undecodable (`consecutiveFailures >= frames.length` bail in `drawNext`).
  - Affected: [media-viewer.js](../../media-viewer.js), [jxl-decode-worker.js](../../jxl-decode-worker.js).

### Group CW-2: Test backfill [batch] 🟤
**Domain**: Testing (E2E + unit)
**Source**: 🟤 Auto-Generated
**Total SP**: 4

- [x] **Fix pre-existing red E2E: `app-launch.test.js` asserts hidden legacy `#viewModeBtn`** — 1 SP, 🟠 IMPORTANT (returns the E2E suite to green) — ✅ 2026-06-15: re-pointed both assertions to `#modeSelector` + `afterEach` guard; E2E 42/43→48/48
  - BACKLOG 2026-06-07 (~70/100). Assertion targets the element hidden since the 3-way `#modeSelector` landed (commit `acfc3b6`); suite has been 1-red ever since (40/41 → 42/43). Re-point at `#modeSelector` / `.mode-btn`. Same-file rider: standardize the `afterEach` to the `if (electronApp)` guard pattern used by all other E2E files (BACKLOG 2026-04-11, XS).
- [x] **Tournament-mode E2E backfill** — 3 SP, 🟠 IMPORTANT (zero Playwright coverage for an entire mode) — ✅ 2026-06-15: new `tests/e2e/tournament-mode.test.js` (5 hybrid-driven tests) + `recordDraw` shape assertions
  - Merges two BACKLOG entries: 🟤 2026-06-03 ("No E2E coverage for tournament mode incl. draw buttons") + 🟤 2026-05-26 ("Phase H: E2E tests for tournament mode", deferred from the original tournament plan). Cover: enter tournament → picks → complete → Apply moves files to `_Tier-N/`; Both Win / Both Lose draw buttons; Ctrl+A undo restores the pair; leave-prompt Save/resume Continue path. Use existing helpers (`seedLocalStorage`, `mockFolderDialog`, `createTempFixtureDir`). While in there: strengthen the `TournamentEngine.recordDraw` history-shape unit assertions (`filesSnapshot` truthy + `pair.right` win-count after undo — BACKLOG 2026-06-03, XS).
  - Affected: new `tests/e2e/tournament-mode.test.js`, [tests/tournament-engine.test.js](../../tests/tournament-engine.test.js).

### Group CW-3: Docs & backlog hygiene [batch] 🟤
**Domain**: Docs / planning data
**Source**: 🟤 Auto-Generated
**Total SP**: 4

- [ ] **BACKLOG stale-checkbox verification sweep (all three source sections)** — 2 SP, 🟠 IMPORTANT (planning-data correctness — the 🟤 pending-SP figure drives Cleanup cadence)
  - Filed as 🟤 BACKLOG intake [2026-06-11] (Cleanup Week planning). Entries across 🔵/🟡/🟤 are provably resolved but still unchecked; verify each against git history and flip with commit refs. Known candidates: PR #36 abort-string + spec-count items (fixed in `853e1ee` — confirmed via `git show`); the two 🔵 [2026-05-03] CLIP extraction-UX items shipped by PR #45 ("extraction starting" toast + toggle-on kickoff); "Pin Lucide CDN" (Group F pinned `@1.14.0`+SRI); "Double-init protection for logger.js" + "Unload CLIP model after extraction" (Group E); "CLIP-based similarity sorting" (Group D 2026-04-18); "Update regression-checker.md for FullscreenManager" (Group F). Recount 🟤 pending SP after the sweep and record it in Notes here.
- [ ] **Doc one-liners bundle** — 1 SP
  - PR #39: wrap CLAUDE.md `## Backlog Intake Rules` in `<!-- MANUAL -->` markers; add `backlog-structure` to the CLAUDE.md test inventory; retro `[possible-dup-of: ...]` tag on the kept `waitForTimeout` entry. PR #45: CLAUDE.md kickoff doc-drift (8→10 test cases, `makeCtx` defaults, empty-folder guard — the deferred `revise-claude-md` pass). docs/README.md Design Specs rows in one pass: CLIP silent-failure spec (PR #34), TASK-024 spec (PR #22 follow-up), TASK-026 spec/plan (PR #24 follow-up). Group D 2026-04-18: correct `.sort_cache_clip.json` → unified `.sort_cache.json` key `'clip'` in spec + CLAUDE.md. CLAUDE.md Git Insights tournament hash swap: UI integration is `acfc3b6` (not `6c73f9f`, which is the IPC/TournamentManager commit) — verified via `git show` 2026-06-11.
- [ ] **Repo-root cruft removal** — 1 SP
  - 🟤 2026-06-11 (Group D audit follow-ups): `git rm` the unused `docker init` scaffolding (`Dockerfile`, `compose.yaml`, `.dockerignore`) after a reference grep; delete the stray `nul` line at [.gitignore](../../.gitignore) line 2.

### Group CW-4: Process & security guards [batch] 🟡
**Domain**: Ops / build & process
**Source**: 🟡 Operational
**Total SP**: 3

- [ ] **Pre-commit secret guard (tier a — regex scan, no new dependency)** — 2 SP, 🟠 IMPORTANT
  - 🟡 [2026-06-11] Group D audit referral. Extend the Husky pre-commit hook with a staged-content regex scan for the audit's high-signal markers (`AKIA`, `ghp_`, `xox[baprs]-`, `AIza…`, `BEGIN …PRIVATE KEY`). Re-run the audit §1/§2 command blocks to validate. Gitleaks (tier b) stays in BACKLOG.
  - Affected: `.husky/pre-commit`, possibly [package.json](../../package.json) (lint-staged).
- [ ] **Pre-archive checklist block + `.gitignore` duplicate-line fix** — 1 SP
  - 🟡 2026-04-30: add the "before archive: flip checkboxes, add Status: Complete, index in docs/README.md (plans AND specs)" checklist block to the plan template in `TEMPLATES/` (option (i), lowest effort; extend to Design Specs per the PR #36 follow-up note). 🟡 2026-04-29: fix the duplicate `!.claude/agents/` line at `.gitignore` 138-139.

---

## Daily Schedule

### Monday, June 15 — 🏆 JXL Streaming Decode
> Front-load the week's only design-risky item: the worker-protocol change. If it overruns, the rest of the week is mechanical cleanup with absorption room.

| Group | SP |
|-------|----|
| **Group CW-5: Progressive animated-JXL decode** 🏆 | 5 |

- [x] Frame-0-first streaming worker protocol + incremental `decodeJxl`/`startJxlAnimation` consumption (5 SP)

**Daily total**: 5 SP

---

### Tuesday, June 16 — Correctness Guards
> The heart of the cleanup: ~10 small, well-specified defensive fixes accumulated from PR reviews #34–#45. One branch, one PR.

| Group | SP |
|-------|----|
| **Group CW-1: Renderer correctness guards** [batch] | 8 |

- [x] `clipCache` clear in `loadFolder()` (1 SP)
- [x] Tournament `isLoading` guards — draw + pick (1 SP)
- [x] `showCompareMedia` `<2 files` → `exitTournamentMode()` (1 SP) — fixed at both `showCompareMedia` AND `_retryCompareAfterRemoval`
- [x] `handleCancel` entry-type guard + `leftMedia`/`rightMedia` nulling (1 SP)
- [x] `clipWorkerReady` reset on unload (1 SP) — `_handleClipUnloadTimer` + `CLIP_UNLOAD_DELAY_MS`
- [x] `feature-cache-write-chunk` local-capture (1 SP)
- [x] JXL error-path hardening trio: decode timeout, init try/catch, whole-animation-bail toast (2 SP)

**Daily total**: 8 SP — ✅ **Complete 2026-06-14** (PR pending; 310→326 unit, 42/43 E2E)

---

### Wednesday, June 17 — Test Backfill
> Return the E2E suite to green, then close the largest coverage hole (tournament mode).

| Group | SP |
|-------|----|
| **Group CW-2: Test backfill** [batch] | 4 |

- [x] Fix `app-launch.test.js` `#viewModeBtn` assertion → suite green (1 SP)
- [x] Tournament-mode E2E backfill + `recordDraw` shape assertions (3 SP)

**Daily total**: 4 SP — ✅ **Complete 2026-06-15** (326 unit; E2E 42/43→48/48; 5 BACKLOG entries closed, 3 follow-ups filed)

---

### Thursday, June 18 — Docs & Backlog Hygiene
> Make the planning data trustworthy again: verify-and-flip stale BACKLOG entries, clear accumulated doc drift, drop repo-root cruft.

| Group | SP |
|-------|----|
| **Group CW-3: Docs & backlog hygiene** [batch] | 4 |

- [ ] BACKLOG stale-checkbox verification sweep + 🟤 pending-SP recount (2 SP)
- [ ] Doc one-liners bundle — CLAUDE.md markers/inventory/kickoff-drift, README spec indexing, sort-cache doc fix, dup tag (1 SP)
- [ ] Repo-root cruft: Docker scaffolding + `.gitignore` `nul` line (1 SP)

**Daily total**: 4 SP

---

### Friday, June 19 — Process & Security Guards
> Close the audit referral with a working secret guard; light day doubles as the week's overrun buffer.

| Group | SP |
|-------|----|
| **Group CW-4: Process & security guards** [batch] | 3 |

- [ ] Pre-commit secret guard, tier (a) regex scan (2 SP)
- [ ] Pre-archive checklist template block + `.gitignore` duplicate line (1 SP)

**Daily total**: 3 SP

---

## Weekly Challenge 🏆

**Progressive animated-JXL decode (frame-0-first)** (Group CW-5, Mon, 5 SP).

**Why this one**: Even in a Cleanup Week the default rule holds — the challenge comes from 🔵 User-Flagged, and this is the freshest user-reported pain ("take very long time to load" on a real 270-frame file). It is also the week's only genuinely hard problem: extending the worker message protocol to a frame stream, making `decodeJxl` resolve on frame 0 while frames keep arriving, and keeping `startJxlAnimation`'s identity-token teardown correct against a still-filling buffer. Everything else this week is deliberately mechanical; this is the stretch.

---

## Summary Table

| Group | Domain | Source | Tasks | Total SP | Day | Status |
|-------|--------|--------|-------|----------|-----|--------|
| CW-5: Progressive JXL decode 🏆 | JS logic (decode worker) | 🔵 User | 1 | 5 | Mon | ✅ Complete (PR #47) |
| CW-1: Renderer correctness guards [batch] | JS logic (defensive) | 🟤 Auto | 7 | 8 | Tue | ✅ Complete (2026-06-14) |
| CW-2: Test backfill [batch] | Testing | 🟤 Auto | 2 | 4 | Wed | ✅ Complete (2026-06-15) |
| CW-3: Docs & backlog hygiene [batch] | Docs / planning | 🟤 Auto | 3 | 4 | Thu | Planned |
| CW-4: Process & security guards [batch] | Ops / process | 🟡 Ops | 2 | 3 | Fri | Planned |
| **Total** | | | **15** | **24** | | |

_Tasks counts plan tasks; several bundle multiple BACKLOG entries (~20+ entries consumed in total). At closeout, check off each constituent BACKLOG entry individually — every bundle cites its entries._

---

## Notes

- **Velocity adjustment (30 → 24 SP)**: The June 1–5 plan (30 SP) was fully delivered but took **9 working days** (June 1–11) once PR review cycles, post-merge reviews, and closeouts are counted — effective throughput ≈ 17–20 SP per 5-day window. Cleanup items carry less design risk, so 24 SP with a light Friday is the realistic target, not a regression to 30. The daily 5–8 SP band is deliberately relaxed to ~3–8 SP this week: Wed/Thu/Fri run light so each batch's PR review/closeout overhead fits inside its day and Friday doubles as the overrun buffer.
- **Quota inversion (this week only)**: Cleanup Week inverts the normal-week split — 🟤 takes the ≥50% majority and the ≤1-🟤-group cap is lifted; 🔵 and 🟡 are held to ≤25% each. Normal quotas resume June 22.
- **Overrun drop order**: drop **CW-3** (docs hygiene) first, then **CW-4**. Never drop **CW-1** (real bug fixes — the point of the week) or **CW-5** (user-flagged lead item).
- **Pull-in order if ahead** (Friday buffer): (1) JXL error-path **test backfill** for the `372ea10` hardening (M — BACKLOG 2026-06-07 PR #42 follow-up; CW-1 ships the remaining code hardening, this adds its automated coverage), (2) bulk-rate buttons computed-visibility assertion (S — BACKLOG 2026-06-02), (3) `handleCancel` Branch 3 unit test (XS — BACKLOG 2026-05-14).
- **🔵 items considered and deferred** (quota headroom was 6 SP; JXL streaming took 5): the twice-raised **"Hash sort + AI sort mutual exclusion"** (🔵 2026-05-07, carries an explicit promote-priority note from 2026-05-30) was passed over because it is M-sized with an open design question (sort-source axis vs unified dropdown) — too big for the 1 SP of remaining 🔵 headroom and wrong-shaped for a cleanup week; it should be a **lead candidate for the June 22 normal week**, alongside the XS-S tournament pause/exit button (🔵 2026-06-03).
- **Roadmap refresh needs a user conversation**: MILESTONES.md / ROADMAP.md / GOALS.md still date from 2026-02-05 and describe long-shipped v1.1 work; the June 1–5 plan nominated a refresh for "the deferred Cleanup Week". It is **not scheduled as SP** because it needs strategic input (is v1.1 closed? what is v2.0's actual scope given tournament mode/JXL/CLIP all shipped outside the roadmap?) — raise it with the user during the week; if the conversation happens, slot the doc edit into Thursday alongside CW-3.
- **🟤 tail remains after this week**: CW batches burn ~16 SP of auto-generated debt, but the 🟤 section holds substantially more (plus older XS items from March–April). The stale-checkbox sweep (CW-3) will produce an accurate pending-SP recount; expect the next Cleanup Week around **early July 2026** (~3-week cadence) unless the recount says otherwise. **Post-CW-3 recount (2026-06-16):** **160 unchecked 🟤 checkbox items** remain after the sweep flipped 4 🟤 entries (CLIP similarity sorting, CLIP unload, logger double-init, regression-checker FullscreenManager). The tail is large → the ~3-week Cleanup cadence holds. (Count is checkbox lines in the 🟤 section, used as an SP proxy — the items are overwhelmingly XS.)
- **Branch/PR shape**: 5 workflow runs — one per group (CW-1/2/3/4 each one branch+PR; CW-5 solo branch+PR). CW-3 is docs-only → per the PR #46 learning, `/code-review` will be a no-op for it; ship with a manual check instead.

### Quota Check
- 🔵 **User-Flagged SP**: 5 / 24 (**20.8%**) — ✅ ≤25% under the **inverted** Cleanup-Week quota (normal-week ≥50% rule explicitly suspended; see 📌 Process Rules cleanup-cadence clause)
- 🟡 **Operational SP**: 3 / 24 (**12.5%**) — ✅ must be ≤25%
- 🟤 **Auto-Generated SP**: 16 / 24 (**66.7%**) — ✅ ≥50% per inversion; 3 🟤 groups scheduled — the ≤1-group cap is lifted for a declared Cleanup Week
- **Cleanup Week status**: **ACTIVE** (first ever; was due since June 1–5, deferred past June 8–12)
- **Last Cleanup Week**: never (this week becomes the baseline for the ~3-week cadence)
- **Compliance**: ✅ all quotas met under the declared inversion. The inversion itself is the rule-sanctioned response to both cadence triggers having fired (🟤 >20 SP pending; no Cleanup Week on record).

---

## Previous Week Summary

### Week: June 1 – June 5, 2026 — ✅ Complete (ran long: finished 2026-06-11)

**Result**: All 5 groups delivered (30 SP planned — raised from the 25 baseline at user direction). Groups 0/A landed inside the Mon–Fri window; Groups B, C, D spilled into June 8–11. Seven PRs merged: #40 (compare bulk-rate), #41 (tournament draw), #42 (JXL viewer), #43 + #44 (mode-switch bugs + review follow-ups), #45 (CLIP extraction UX), #46 (security audit). Unit tests 244 → 297.

**Key deliveries**:
- Group 0 — Re-rate / mode-correction: "Both good/Both bad" bulk-rate in AI-sorted compare (PR #40) + tournament "Both Win/Both Lose" mark-as-equal draws (PR #41)
- Group A 🏆 — JXL + animated-JXL viewer via vendored `jxl-oxide-wasm` module worker, CLIP-from-buffer IPC, LRU frame cache (PR #42)
- Group B — Mode-switch display bugs: compare→single lands on the on-screen file; stale compare-wrapper teardown (PRs #43/#44)
- Group C — CLIP extraction UX: starting-extraction toast + toggle-on kickoff (PR #45)
- Group D — Security & privacy audit: ✅ PASS, no secrets in history/tree; author already anonymized; report at `docs/security/2026-06-11-security-privacy-audit.md` (PR #46)

**Velocity learning**: 30 SP nominally complete but consumed 9 working days end-to-end (review + closeout overhead per PR is real). The June 15–19 Cleanup Week targets 24 SP accordingly.

### Week: May 11 – May 15, 2026 — ✅ Complete

**Result**: All 6 groups delivered (25 SP planned). Groups A, B, E, F completed within the original Mon–Fri window; Groups C + D (PR #33 hygiene + integration tests) landed slightly later via PR #36 (merged 2026-05-24). Tournament Mode (Groups E + F) shipped 2026-05-25 with a deterministic-UX + feature-cache-streaming polish pass on 2026-05-26.

**Key deliveries**:
- Group A — CLIP extraction silent-failure fix (`kickoffBackgroundExtractionIfEnabled`, PR #34, 2026-05-07)
- Group B — AI prediction display bugs (`restoreFeatureCachesFromHistory` + `sortComplete` scores propagation, PR #35, 2026-05-14)
- Group C — PR #33 defensive follow-ups (clipUnloadTimer clear, deleteSortCache try/catch, per-file abort checks) — PR #36, 2026-05-24
- Group D — Integration test pattern (`tests/integration/cached-sort-path.test.js`) — PR #36, 2026-05-24
- Group E — Tournament Mode spec (`docs/superpowers/specs/2026-05-25-tournament-mode-design.md`)
- Group F — Tournament Mode prototype (Swiss strategy + engine + TournamentManager + UI integration; 241/241 unit tests)

**Velocity learning**: 25 SP/week remained the validated cadence; June 1–5 intentionally raised the target to 30 SP at user direction to absorb the added re-rate feature without truncating planned work.

### Week: April 13 – April 17, 2026 — ✅ Complete

All 6 groups delivered, 25 SP. See `docs/archive/plans/` and `docs/planning/DONE.md` for closure records. (Compare-mode folder-switch fix, CLIP/ML pipeline cleanup, test-quality hardening, CLIP similarity sorting, resource management, build & DX.)
