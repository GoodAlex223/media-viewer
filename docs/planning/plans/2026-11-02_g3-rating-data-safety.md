# G3 Rating data that can't go wrong - Implementation Plan

**Task Reference**: [WEEKLY.md](../WEEKLY.md) G3 (Cleanup Week #5, 🏆)
**Created**: 2026-11-02
**Status**: Implementation: the user approved the spec and plan on 2026-11-02 ("Looks right, go"). PR #95 open; review round 2 answered. The manual smoke is owed during review, by the user's call on 2026-11-02
**Last Updated**: 2026-11-02
**Design**: [spec](../../superpowers/specs/2026-11-02-g3-rating-data-safety-design.md), which holds the analysis, the Phase 0 table and my ten calls. This plan does not restate them.

---

## 1. Task Overview

**Goal**: land the seven members behind reproductions that failed on `main`.

**Context**: ROADMAP principle 2, "No data loss". Ratings exist nowhere else.

**Success Criteria**: spec § 1.

---

## 2. Analysis

See spec §§ 2–4. Edge cases per member are in spec § 3; each is a named test in spec § 5.

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| A guard swallows a press the user meant | Med | The flag releases as `showMedia()` hands over to `isLoading`; the E2E suite's rating tests run on every push |
| Helpers break the many `handleCancel` mocks (44 call references in two test files) | Low | Bind the extracted helpers into those mock contexts; never weaken an assertion |
| A quit hangs | High | A cap, a `finally`, a second close quits at once, and the fake-timer tests in spec § 5 |
| The ratchet refuses a push | Low | Set the ceiling to the exact final count (spec § 3.8) |
| `tests/e2e/` changes always run E2E | Low | Expected: 11–12 min per push |

---

## 3. Implementation Plan

### Files Affected

| File | Action | Purpose |
|------|--------|---------|
| `coalescing-saver.js` | Create | Member 2's writer |
| `media-viewer.js` | Modify | Members 1–6 |
| `tournament.js` | Modify | `flushPending`, and review fixes |
| `eslint.config.mjs`, `tests/media-url.test.js` | Modify | The new module joins the renderer lists |
| `tests/recent-folders-glue.test.js`, `tests/feature-cache-harness.js`, `tests/tournament-manager.test.js` | Modify | Mock contexts and new cases |
| `docs/planning/WEEKLY.md`, `docs/planning/GOALS.md` | Modify | Spillover line; line count |
| `like-or-skip.js` | Modify | `trainingWeight`, call 8 |
| `feature-cache-store.js` | Modify | `flush()` |
| `logger.js`, `main.js` | Modify | Member 7. `main.js` gains one line at the top, outside the file-move handlers |
| `tests/coalescing-saver.test.js`, `tests/rating-data-safety-glue.test.js` | Create | Spec § 5 |
| `tests/e2e/rating-data-safety.test.js` | Exists, uncommitted | The RED reproductions, plus the quit test |
| `tests/feature-cache-store.test.js`, `tests/logger.test.js`, `tests/like-or-skip.test.js`, `tests/media-viewer-utils.test.js`, `tests/like-or-skip-glue.test.js` | Modify | New cases and bound helpers |
| `scripts/renderer-line-ceiling.txt` | Modify | Equal to the final count |
| `CLAUDE.md`, `PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/MANUAL_TESTING.md`, `docs/README.md` | Modify | See below |

**Live-surface preflight:** every live surface asserting a claim this changes.
- `CLAUDE.md`: Architecture tree (new module); § Async Patterns "File-op guard" (the folder-load direction); § Cache Management `removeFileFromList` / `restoreFeatureCachesFromHistory` / bulk-rated bullets; § Error Handling (the crash log); the "Recently opened folders" guard list.
- `PROJECT.md`: Known Limitations line count.
- `docs/ARCHITECTURE.md`: grep for the bulk-rated writer and the close handshake.
- A comment sweep over every method touched, per CLAUDE.md § Best Practices, including the prose at `removeFileFromList`'s `deferBulkSave` and `_switchToFolderNow`.

### Dependencies

- `main` at `65d8b71`, with the G2 hooks already in this branch's history, so no merge is owed first.
- No user step before the PR beyond approving this plan and the push.

### Model and Effort

| | Choice | Why |
|---|---|---|
| SP | 8 → ~9 | Member 3 gained a site and call 8; member 7 shrank; member 1's guard list grew. By recent weeks' ~1.6–1.9× the real figure including review may be 14–17 |
| Execution | Opus · `medium` | The plan's first guess for this row. The design is settled, so `xhigh` no longer has a reason. Sonnet would do for the mock updates, but one session on one file is simpler and cheaper than a switch |
| Switch | `/effort medium` now (Opus 5.5 keeps the cache), and `/compact` first (context is past 150K) | Natural break: the plan is written |
| Final review | `/code-review max` in a **separate chat** (ask first), Opus | The 8+ SP row, and it touches file moves and undo. About $120 a run; `xhigh` is the user's call if the week is tight |

### Phases

Stop for the user's go-ahead at the end of Phase 0 (this plan) and before the push. Each phase ends with its tests green and a log entry here.

#### Phase 0: reproductions and design ✅ (uncommitted)
- [x] RED for every member on `main` (spec § 2), each failing for the predicted reason
- [x] The Electron crash-listener probe
- [x] Spec and plan

#### Phase 1: the saver and the quit (members 2, 6)
Commit together: spec § 6.
- [x] `tests/coalescing-saver.test.js` first, then `coalescing-saver.js`
- [x] `saveBulkRatedFile` → saver; `_writeBulkRated` is the write callback; `loadBulkRatedFile` waits on its own folder
- [x] `FeatureCacheStore.flush()`, test first
- [x] `_saveThenAllowClose` and `handleAppCloseRequest`, fake-timer tests first
- [x] Member 6's E2E turns green; add the two-coalesced-saves E2E and prove it by removing the flush

#### Phase 2: capture and restore (member 3, call 8)
- [x] `_captureUndoFields` at all five sites; restore inside `restoreFeatureCachesFromHistory`; delete the batch's two lines
- [x] `trainingWeight`, test first, both ways
- [x] Member 3's three E2Es turn green

#### Phase 3: the folder-load guard and the undo target (member 1)
- [x] The guard table, test first
- [x] `_moveBackFromHistory` at the six `handleCancel` sites and the batch; the tournament's `targetFolder`; the source-level control
- [x] Both E2Es turn green. Add a guard row per method only where a real interleaving is not already covered

#### Phase 4: the small ones (members 4, 5, 7)
- [x] `applyPredictionSortResult` through `alignToLive`
- [x] Continue reads the live list and refuses during a file action or a load
- [x] `installCrashLogging`, called at the top of `main.js`

#### Phase 5: verify and document
- [x] Measure the renderer; apply `_fileFromHistory` if over; set the ceiling to the exact count
- [x] Full unit suite, lint, `format:check`; full E2E (it runs at pre-push anyway)
- [x] Mutation checks from spec § 5; re-run each member's E2E with its fix reverted if any looks suspect
- [x] Live-surface edits from the preflight; `docs/MANUAL_TESTING.md` scenarios; comment sweep
- [ ] Manual smoke on the running app: rate, undo, Both good then undo, quit during extraction, reopen. Ask the user to confirm before the push

#### Phase 6: PR and close-out (after approval)
- [ ] Push, verify the PR's commit list (a shared checkout can add commits), open the PR
- [ ] Review in a separate chat; after merge, the closeout on `main`

---

## 4. Implementation Log

### 2026-11-02 — PHASE: Planning

- The user chose the brainstorm's skip option, so the design decisions are my calls, listed in spec § 4.
- Session: Opus 5.5 · `xhigh`, which matches the 8+ SP row for writing the spec and plan.
- Branch `g3-rating-data-safety` cut from `65d8b71`.
- **Discoveries**:
  - Member 1's scene is narrower than its entry and its worst case is an unseen file of the new folder (spec § 2).
  - Member 3 has a third site.
  - Member 2's inversion is real: 29 of 300 rounds on the real main.
  - Member 7's rejection half was already logged. My first draft would have added a redundant listener, and a test passing on unfixed code is what exposed it.
  - A plain `uncaughtException` listener would have removed Electron's error box.
  - `cleanupCurrentMedia` is synchronous. That retired a planned change to hold the load flag across `_switchToFolderNow`, which I had reasoned out before reading the method.
- **Schedule**: the week's Sunday Nov 1 grace has passed with G3–G6 open, so WEEKLY's header now carries a `**Spillover**` line. Next week's plan, and P1a, wait on this group's drop order.

### 2026-11-02 — PHASE: Implementation

- **Phase 1 done** (members 2, 6). Session: Opus 5.5.
- **Deviations from the spec, both recorded there**:
  - The saver queues per folder, not globally. Simpler, and a hung drive cannot hold another folder's ratings back.
  - The quit calls a new `tournament.flushPending()`, not `flush()`. `flush()` forces a write to `_persistFolder`, which a resumed tournament has not set until its first pick.
- Also needed: `coalescing-saver.js` joined the renderer lists in `eslint.config.mjs` and `tests/media-url.test.js`.
- Three more leave-alone items went to spec § 7.
- Renderer now 11,595 lines (+66, against the ceiling of 11,529). Phases 2–3 are where the helpers remove lines; Phase 5 judges the total.
- **Phase 2 done** (member 3, call 8). Deviation, in the spec: a batch undo passes `{ deferBulkSave: true }` and saves once, so the existing one-save test stays as written instead of relying on coalescing.
- **Phase 3 done** (member 1). Traced every internal caller of the newly guarded methods: `loadFolder` calls none of them while the flag is held, and Apply's `switchMode` runs after it drops. Existing undo tests reach the new helpers through a `withUndoHelpers` wrapper that fills in only what a context leaves out; no assertion was loosened.
- **Phase 4 done** (members 4, 5, 7). `main.js` gained one line at the top, outside the file-move handlers.
- **Phase 5**: `_fileFromHistory` at seven sites brought the renderer to 11,527, under the 11,529 it started at, so no raise; the ceiling moves down to the count. Two source-level tests now check the helpers instead of the repeated literals, and each still fails if the property goes.

### 2026-11-02 — Review round 1 (PR #95)

- 21 entries and 29 held-back candidates, checked first-hand. Fixed: 1–7, 9–11, 16–21, each test first where a test can show it. Recorded in spec § 7: 8, 12, 13, 15, and 14's pairing effect.
- `_bulkRatedUnread` follows the feature cache's rule: "never read" is not "no ratings".
- **Renderer ceiling raised**: 11,527 → 11,572 (+43 net over the 11,529 G3 started at), for the review's data-safety fixes. WEEKLY allows G3 an explicit raise; the PR body states it.
- `CLAUDE.md` crossed its byte trigger (70,918 against 69,000). Recorded, not trimmed here: WEEKLY's "Measure `CLAUDE.md`'s growth under the authoring rule" re-sets it.

### 2026-11-02 — Review round 2 (PR #95)

- 7 issues and 8 held-back candidates, checked first-hand. All 7 fixed, test first. Three were side effects of round 1's own fixes: the `handleDiscard` wait redirected its delete, the leave prompt's let-through skipped the quit's saves, and the failed-read warning was a 5 s toast with advice that did not work.
- **Renderer ceiling**: 11,572 → 11,597, +68 net over the 11,529 G3 started at.
- `handleResume` is deleted with its test: it had no production caller, so round 1's line in it covered dead code.

---

## 5. Key Discoveries

To fill at completion.

---

## 6. Future Improvements

Spec § 7 lists what I noticed and did not act on. Those eighteen items are this section until completion, and each goes to BACKLOG 🟤 at close-out unless the work closes it.

---

From PR #95 review round 1, each going to BACKLOG 🟤 at close-out (ruled "recorded, not fixed" in the review response):

- Merge the two pair-undo branches of `handleCancel`, and the file-to-entry and batch list-entry literals (cleanup that would also lower the ceiling).
- Apply and tournament undo hold neither the file-op nor the load flag.
- The write inversion's root is main's guard order: other callers of main's atomic writer keep it, only `.bulk_rated.json` is closed.
- `withUndoHelpers`, `extract` and `waitForIdle` are copied between test files.
- The second quit E2E does not clear `localStorage`; `flushPending() waits…` leaves a real 500 ms timer armed.
- `closeApp`'s 5 s limit is under the 15 s quit cap, and its callers are not traced for disk assertions after close.
- A bulk-rated warning's folder name is empty for a drive root.
- A label stays on `a (1).jpg` after a suffixed restore and a bulk undo.
- A refused toast Remove still closes the toast; a refused config-modal Cancel leaves the mode button stale.
- The Resume prompt's Cancel can start a render during a file action.

## 7. Testing

Plan: spec § 5. Results: to fill during Phases 1–5.

### Test Results

| Test | Result | Notes |
|------|--------|-------|
| `tests/e2e/rating-data-safety.test.js` on `main` at `65d8b71` | 10 failed, 1 passed (the rejection contract) | Expected, spec § 2: member 1 ×2, member 3 ×3, member 4 ×2, members 5, 6 and 7's throw ×1 each |
| Phase 1: unit suite | 2567 passed, 1 skipped | After the saver, flush, flushPending and close tests |
| Phase 1: member 6's two E2Es | 2 passed | With `whenIdle` removed from the quit, the coalesced test failed on its poll, so it can fail |
| Phase 5: unit suite | 2599 passed, 1 skipped | At `233a672` |
| Phase 5: full E2E | 248 passed, 7 skipped | 10.6 min at `233a672`. This file's 12 all pass, and none of its tests is skipped |
| Phase 5: saver mutations | Each fails | One queue for all folders: 2 tests fail. Overlapping writes: 4 tests fail |
| Phase 5: lint | 0 errors, 2 no-shadow warnings | In test code this branch did not write |
| Phase 5: `format:check` | 10 files flagged | All in the ignored local `CLAUDE-SECURITY-*` scan output; none is tracked by this branch |
| Phase 5: line ratchet, dry run | At the ceiling | 11,527 lines, ceiling 11,527 |
| Review round 1: unit suite | 2625 passed, 1 skipped | At `7e452f1` |
| Review round 1: full E2E | 251 passed, 7 skipped | Pre-push at `7e452f1` |
| Review round 1: mutants, in a throwaway copy | 10 of 10 fail | The review's 6 survivors plus 4 for this round's fixes; baseline 664 passed |
| Review round 1: E2Es with the fix reverted | 4 of 4 fail | Prompt gate, prompt closing, `dirname` rule, second file's capture |
| Manual smoke | Not run | `docs/MANUAL_TESTING.md` § Rating Data Safety. The user approved the push without it on 2026-11-02; owed during review |

---

## 8. Review

- [ ] Self-review complete
- [ ] Separate-chat review
- [ ] Review comments addressed

---

## 9. Closeout Artifacts

Derived from `~/.claude/rules/planning-closeout.md`. To mark at close-out.

| Artifact | Done / N/A + reason |
|----------|---------------------|
| `BACKLOG.md` — improvements extracted, routed by source | |
| `TODO.md` — actionable items, plus § Spawned Tasks rows | |
| `docs/archive/plans/` — plan moved here, original deleted | |
| `DONE.md` — entry with plan link, summary, key changes | |
| `WEEKLY.md` — Summary-Table Status `✅ PR #N`; Daily-Schedule rows | |
| `BACKLOG.md` / `TODO.md` — the ten entries closed checked off | |
| Deploy record | N/A: auto-deploy no, no Deploy Window |
| Live docs — every late finding corrected | |
| `docs/README.md` — plan and spec indexed | |
| Memory — durable decisions and patterns captured | |
