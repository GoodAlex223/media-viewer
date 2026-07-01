# Group CW-T: Tournament Correctness, Persistence & Hardening — Design

**Status:** Draft (brainstormed 2026-07-01) — awaiting user spec review, then `writing-plans`.
**Branch:** `fix/cw-t-tournament-hardening`
**Scope:** One branch, one PR. 2 HIGH-severity 🔵 bugs (front-loaded) + 6 🟤 adjacent debt items on the same tournament code paths.
**Sources:** [WEEKLY.md](../../planning/WEEKLY.md) Group CW-T (lines 21-38), [BACKLOG.md](../../planning/BACKLOG.md) `### [2026-07-01]` intake + PR #54–#58 🟤 follow-ups, prior [2026-06-24 tournament-large-folder-perf plan](../../archive/plans/2026-06-24-tournament-large-folder-perf.md) (PR #55, the fix these bugs are residual to).

---

## Goal

Make tournament mode **correct** (no "cannot enter" after adding media + AI sort) and **usable at 24 000+ files** (no freeze on Continue; picks and "Both Win" respond instantly and do not degrade as games accumulate), and sweep the adjacent mechanical tournament debt on the same branch.

Both HIGH bugs target real-24k-folder behavior that **cannot be E2E-fixtured** (Playwright fixtures top out at a handful of files). Verification is: unit tests on the reconciliation / undo / render logic **plus a manual smoke on the user's real 24 000+ file folder** (the acceptance gate).

---

## Diagnosis (grounded in current post-PR-#55 code)

### Bug #1 — "Cannot enter tournament after adding new media + AI sort"

The BACKLOG hypothesis (*"AI sort reorders `mediaFiles` → `getMediaIndex` returns −1"*) **does not survive a code read** of the current build:

- [`enterTournamentMode`](../../media-viewer.js) (~4145) calls `restoreOriginalOrderForTournament()` **first**, which reverts any active sort back to `originalMediaFiles` order before any resume UI renders. So the sort reorder is already undone by pair-render time.
- [`handleResumeReconciled`](../../tournament.js) (~104) deserializes then **prunes** `engine.files` to `∩ currentFiles`, guaranteeing `engine.files ⊆ mediaFiles`. So on the from-disk resume path, `getMediaIndex(pair.left/right)` cannot return −1.

PR #55 (with this reconciliation) merged 2026-06-25; the dogfooding that filed this bug was 2026-07-01 — so reconciliation **was** in the build. The remaining ways the `-1` "file missing" branch at [`showTournamentPair`](../../media-viewer.js) (~4465) can fire:

1. The **live-engine fast-path** at `enterTournamentMode` (~4149): `if (this.tournament.engine) { await this._enterResumedTournamentUI(); return; }` — this **skips reconciliation entirely**, so a live engine whose `files` diverged from `mediaFiles` renders `-1`.
2. "Cannot enter" is plausibly **bug #2's 24k freeze** during Continue (deserialize + first-pair DOM churn), perceived as "can't enter."

**Approach (user-chosen): defensive-harden + capture, verify by smoke.** Rather than chase one unconfirmed trigger, make every entry path robust to `engine.files ↔ mediaFiles` divergence and add a diagnostic capture so the real trigger (if any remains) is logged during the 24k smoke.

### Bug #2 — "Tournament unusable / freezes on 24k after AI sort (Continue stuck, Both Win hangs)"

Two **confirmed** per-pick offenders (not just the DOM teardown the planner named):

1. **O(n)-per-pick undo snapshot.** [`recordResult`/`recordDraw`](../../tournament-engine.js) (~325/344) call `this.strategy.serialize()` on **every** pick. [`SwissStrategy.serialize()`](../../tournament-engine.js) (~283) deep-copies `files` (O(n)), `winCounts` (O(n)), `playedPairs` (O(games)), and `roundQueue` (up to O(n/2)). At 24k that is ~60k+ element copies **per pick**, and up to `UNDO_HISTORY_CAP=100` retained (100×O(n) RAM growth).
2. **Per-pair DOM churn.** [`showCompareMedia`](../../media-viewer.js) (~2876) per pair: tears down + `.remove()`s both wrappers → **awaits a fixed 50ms** (`setTimeout`) → **2× `checkFileExists` IPC** → rebuilds both wrappers + media + overlay controls → **2× `lucide.createIcons()`**.

Resume ("Continue stuck") is mostly **one-time O(n)** (deserialize + `JSON.parse` of a multi-MB state file + `validateStateFile` + `restoreOriginalOrderForTournament`); `roundQueue` **is** persisted, so resume does not rebuild pairings.

**Approach (user-chosen): full fix** — attack both per-pick offenders + instrument.

---

## Global constraints

- **No change** to Swiss pairing *quality*, tier assignment, apply/move logic, or the resume/continue/leave UX flows — only *how* undo is captured and *how fast* pairs render.
- **Undo semantics for a streak of picks must remain identical** to today (session-only, capped at 100; undo restores the exact prior pair/state). The inverse-delta path must be byte-for-byte equivalent to the snapshot path for consecutive picks with no intervening mid-tournament file removal — the 99% hot path. The one deliberate refinement is the rare `removeFile`-then-undo-earlier-pick edge case (see C2 "removeFile interaction"), which is documented, tested, and arguably more correct than today.
- **Render fast-path is tournament-scoped.** Do not alter compare mode's `showCompareMedia` behavior for non-tournament use (compare mode is heavily used; regression risk).
- **Backward compatibility:** `deserialize` still accepts v1 + v2 state files; undo-record format is in-memory only (never persisted — v2 payload has no history).
- **Vitest v4 single-file gotcha:** run a single file by *substring* (`npx vitest run tournament-engine`).
- **Renderer extract-method tests:** methods unit-tested via `extractMethod`/`extractAsyncMethod`; mock `this` must supply every `this.*` touched; assert `globalThis.window.electronAPI`, never bare `window`.
- **Pre-commit hook** runs secret-scan → lint-staged → `npx vitest run`; keep the suite green at every commit. E2E is not run by the hook.
- **Commit convention:** conventional-commit subjects; end each body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Component design

### C1 — Bug #1: authoritative reconciliation on all entry paths (`media-viewer.js`, `tournament.js`)

1. **Reconcile on the live-engine fast-path.** Before `_enterResumedTournamentUI()` in the `enterTournamentMode` (~4149) fast-path, reconcile the live engine's `files` against current `mediaFiles` (prune `engine.files` to the intersection), matching what `handleResumeReconciled` does for the disk path. Factor the pruning into a small reusable helper (e.g. `TournamentManager.reconcileWithFiles(currentFiles)`) so both paths share one implementation.
2. **Harden the `-1` branch** in `showTournamentPair` (~4465):
   - Bound the recursive retry (guard against an unbounded loop if the engine keeps producing absent pairs).
   - When no engine pair can resolve to a present file (engine effectively empty relative to `mediaFiles`), fall through to `showTournamentSummaryModal()` / graceful exit rather than looping.
3. **Divergence capture.** When `getMediaIndex` returns `-1` in `showTournamentPair`, `window.electronAPI.logError(...)` (fire-and-forget) a structured line: count of `engine.files` absent from `mediaFiles`, `engine.files.length`, `mediaFiles.length`, active sort flag (`isSortedByPrediction`/`isSortedBySimilarity`), and one sample missing path. Lands in `media-viewer.log` for the 24k smoke.

**Subsumes** 🟤 [2026-06-25] `handleResumeReconciled` + `showTournamentPair`-missing-file durability items (same path).

### C2 — Bug #2 Part A: O(1) inverse-delta undo (`tournament-engine.js`)

Replace the unconditional per-pick `strategy.serialize()` snapshot with a **hybrid** undo record captured in `recordResult`/`recordDraw`:

- **Boundary pick** — the pick empties the round (`strategy.roundQueue.length <= 1` *before* the shift): capture a full `strategy.serialize()` snapshot (rare: ~1 per `floor(n/2)` picks). Undo = `SwissStrategy.deserialize(snapshot)` (today's behavior).
- **Non-boundary pick** — capture an O(1) inverse delta: the pair `[a,b]` (= `roundQueue[0]` pre-shift), the outcome (`winner` for a result; `{outcome, a, b}` for a draw), and the `pairKey`. Undo applies the inverse:
  - `roundQueue.unshift([a,b])`
  - decrement `winCounts` — winner (result); both `a` and `b` (draw `win`); neither (draw `lose`)
  - `playedPairs.delete(pairKey)`
  - `gamesPlayed--`

**Correctness invariant:** the delta path is only valid when no round rebuild can have intervened between the pick and the undo. A non-boundary pick leaves `roundQueue` non-empty, so the next `getCurrentPair()` returns `roundQueue[0]` **without** calling `_buildRoundPairings()` — no intervening non-deterministic shuffle. Boundary picks (which *do* trigger a subsequent rebuild) use snapshots, which discard that rebuild on restore — exactly matching today's semantics.

- Engine `history` entries carry **either** `strategyStateSnapshot` (boundary) **or** `strategyDelta` (non-boundary); `engine.undo()` dispatches on which is present.
- `UNDO_HISTORY_CAP = 100` cap unchanged; deltas are tiny so the 100-entry window is now dominated by the few boundary snapshots.

**`removeFile` interaction (the key correctness constraint).** Today, `engine.undo()` ([tournament-engine.js:364](../../tournament-engine.js)) restores the full `strategyStateSnapshot` **and** a per-pick `filesSnapshot`, so undoing a pick recorded *before* a mid-tournament `removeFile` resurrects the removed file's entire strategy state. A delta cannot do this (it only knows `{pair, winner, pairKey}`). This is unavoidable without making `removeFile` independently history-tracked — and it currently is **not** (per the [handleTournamentUndo:4539](../../media-viewer.js) comment, special-folder moves are recovered by a **separate renderer branch** keyed on `moveHistory.actionType==='special'`, not by `engine.undo()`).

Design decision — **do not resurrect a mid-tournament-removed file via pick-undo**:
- Delta entries carry **no `filesSnapshot`** (a pick never changes `engine.files`; only `removeFile` does). Boundary snapshot entries keep the existing `filesSnapshot` for full back-compat.
- Consequence: the two removal paths are already covered elsewhere and stay correct:
  - **Special-folder move** → recovered by the existing renderer special branch ([handleTournamentUndo](../../media-viewer.js) `actionType==='special'`), which restores the file on disk + re-adds to `engine.files` — independent of `engine.undo()`.
  - **Missing-file removal** (external deletion via the `-1` branch) → the file is gone from disk; **not** resurrecting it on pick-undo is *more* correct than today (today it could zombie-resurrect a file that no longer exists).
- **Must-verify during implementation** (highest-risk area): confirm the special-move undo branch fully recovers strategy/pairing state on its own (it re-adds to `engine.files`; check whether the strategy's `winCounts`/`roundQueue` are also restored, or whether a residual zombie already exists today). Pin with tests: (a) undo a streak of N picks ≡ snapshot behavior; (b) special-move → undo recovers via the special branch (unchanged); (c) missing-file removal → undo an earlier pick is graceful (no crash, no zombie pair).

### C3 — Bug #2 Part B: tournament fast-path render (`media-viewer.js`)

New `showTournamentPairFast(leftFile, rightFile)` (or a `fast` flag on the tournament render path), invoked by `showTournamentPair` when the compare wrappers already exist:

- **Reuse** the existing `.left-media-wrapper` / `.right-media-wrapper` and their overlay controls — do **not** `.remove()` them.
- Swap only the inner media element: revoke prior JXL object URLs, pause/detach the old `<img>`/`<video>`, create the new media node, set `src` (JXL → `decodeJxl` frame 0), append into the existing wrapper. **Re-render both sides atomically** (preserves the shared-`_jxlObjectURLs` invariant per the CLAUDE.md gotcha).
- **Drop** the fixed 50ms grace (no teardown to settle).
- **Skip** per-pair `checkFileExists` IPC — engine files were validated at reconcile time; a mid-session external deletion is caught by the media element's `error` handler → `removeFile` + retry (mirrors the existing missing-file path).
- **Skip** `lucide.createIcons()` — overlay-control icons already exist in the reused wrapper.
- **First pair** of a session (no wrappers yet) still builds once via the full `showCompareMedia`; subsequent pairs use the fast-path.
- Preserve zoom reset, fullscreen state, `updateCompareFileInfo`, `updateNavigationInfo`, `updateBulkRateButtonsVisibility` semantics.

### C4 — Bug #2 Part C: instrumentation (`media-viewer.js`)

Lightweight `performance.now()` deltas around: resume phases (`readTournamentState` + parse, `deserialize`, `validateStateFile`, first pair render) and per-pick (record + render). Emit via `logError` **only when a phase exceeds a threshold** (e.g. >100ms) to avoid log spam. Kept gated/removable after the smoke confirms.

### C5 — The 6 🟤 debt items (same branch)

| # | Item | Fix | Files |
|---|------|-----|-------|
| 1 | `moveToSpecialFolder` durable persist + stale comment | Fix the misleading "persist before navigation" comment to match the intentional debounced `_schedulePersist` (a crash before the debounced write is self-healing: the moved file is gone from disk → reconciled out on resume). *(Alt: `await flush()` for strict durability — heavier; not chosen.)* | `media-viewer.js` (~1555) |
| 2 | Discard can orphan `.tournament_state.json` | `handleDiscard` retries `deleteTournamentState` once on failure + logs (satisfies "retry on failed-delete"). | `tournament.js` (~75) |
| 3 | `onAppCloseRequested` unsubscribe discarded | Store the returned `removeListener` in a field (`this._removeAppCloseListener`), per the CLAUDE.md IPC-listener gotcha. | `media-viewer.js` (~1976) |
| 4 | Close-confirm re-entrancy | Add an `isLeavePromptOpen` guard in `handleAppCloseRequest`; a 2nd close request while the prompt is open is ignored (no re-bind). | `media-viewer.js` (~4228) |
| 5 | Stale E2E + precondition + aria-label | `tournament-mode.test.js:248` → expect `historyLen === 0` (session-only v2); assert `isTournamentMode===true` before the exit click; add `aria-label="Pause / leave tournament"` to `#tournamentExitBtn`. | `tests/e2e/tournament-mode.test.js`, `index.html` |
| 6 | `getMediaIndex` micro-opt + test pins | `const idx = this._mediaPathIndex.get(path); return idx === undefined ? -1 : idx;` (single lookup). Add: at-cap-boundary undo, `recordDraw`-cap, SwissStrategy cross-bucket carry-over + don't-double-bye pins (synergize with C2's undo tests). | `media-viewer.js` (~1090), `tests/tournament-engine.test.js`, `tests/swiss-strategy.test.js` |

---

## Data flow (per pick, post-fix at 24k)

```
user picks (Q/E) or Both-Win/Both-Lose (D/F)
  → handleTournamentPick / handleTournamentDraw
    → tournament.handlePairResult/handlePairDraw
      → engine.recordResult/recordDraw
          • capture O(1) delta (or snapshot at round boundary)   ← was O(n) snapshot every pick
          • strategy mutate (shift/winCounts/playedPairs)
      → _schedulePersist (debounced, non-blocking; unchanged)
    → showTournamentPair
        • getCurrentPair (O(1); rebuild only at round boundary)
        • getMediaIndex ×2 (O(1) cached Map; single get())
        • showTournamentPairFast: reuse wrappers, swap media,      ← was teardown + 50ms + 2 IPC + rebuild + 2 lucide
          no grace, no per-pair IPC, no lucide rebuild
```

---

## Error handling

- **Divergence / `-1`:** logged (C1.3) + graceful (remove + bounded retry → summary), never a hard failure or infinite loop.
- **Mid-session external deletion in the fast-path:** caught by the media `error` handler → `removeFile` + retry (no per-pair `checkFileExists` needed).
- **Undo of a corrupt/missing record:** if a history entry lacks both snapshot and delta (should never happen), `undo()` no-ops safely.
- **Discard delete failure:** retried once, then logged; a persistent disk failure re-prompts resume (user can "Start over" again) — acceptable, rare.

---

## Testing strategy

**Unit (Vitest):**
- `tournament-engine.test.js` — inverse-delta undo (non-boundary result), boundary-snapshot undo, draw-`win` undo (both decrement), draw-`lose` undo (neither), undo at the 100-cap boundary, `recordDraw` cap; **undo a streak of N picks ≡ the old full-snapshot behavior** (equivalence pin); **`removeFile` interaction** — (a) special-move → undo recovers via the special branch, (b) missing-file removal → undo an earlier pick is graceful (no crash/zombie pair); existing undo/serialize invariants stay green.
- `swiss-strategy.test.js` — cross-bucket carry-over + don't-double-bye pins.
- `media-viewer-utils.test.js` — `getMediaIndex` single-lookup (present/absent/rebuild), reconciliation helper prunes `engine.files` on the live-engine path, `showTournamentPair` `-1` branch (remove + bounded retry + log + graceful terminal).
- `tournament-manager.test.js` — `handleDiscard` retries delete on failure; `reconcileWithFiles` helper.

**E2E (Playwright):** fix the stale "Continue resumes" assertion; add the exit-button `isTournamentMode` precondition; the fast-path is exercised by the existing pick→next-pair flow. Fixtures cannot represent 24k → per-pair perf is **not** asserted here.

**Manual 24k smoke (user — acceptance gate):**
- Resume a saved tournament on the 24k folder: Continue must not freeze.
- Streak of picks + "Both Win": each must feel instant and **not** slow down as games accumulate.
- Add media + AI sort, then enter tournament: must render a pair (not "file missing"); check `media-viewer.log` for any divergence capture + phase timings.
- Save & leave → resume; Apply.

---

## Acceptance criteria

1. Entering/resuming tournament after adding media + AI sort renders a pair (no spurious "file missing"); any real divergence is captured in the log.
2. Pick → next-pair render time is independent of games played (no growth across a session) at 24k.
3. Resume on 24k completes without a multi-second freeze.
4. Undo behavior is identical to pre-change (session-only, capped, restores the exact prior pair) across delta and snapshot paths.
5. All 6 🟤 items closed; the stale E2E assertion is green; new unit pins pass.
6. Full unit suite + lint + format green; existing tournament E2E green.
7. No regression in non-tournament compare mode (fast-path is tournament-scoped).

---

## Commit sequencing (one branch)

1. Bug #1 — reconcile-on-all-paths + hardened `-1` + divergence log (+ tests).
2. Bug #2 Part A — inverse-delta undo (+ engine tests, including the 🟤 #6 undo/draw/cap pins).
3. Bug #2 Part B — tournament fast-path render (+ Part C instrumentation).
4. 🟤 sweep — items 1–5 (moveToSpecialFolder comment, discard retry, unsubscribe field, re-entrancy guard, E2E/aria fixes, `getMediaIndex` micro-opt) + swiss-strategy pins.
5. Final: full suite + lint + format green → open PR → hand off for the 24k smoke.
