# G1 Bulk-Rate Follow-ups — Design

**Date**: 2026-08-29
**Status**: Approved (user, 2026-08-29) — bounded path; spec kept for the project's plan-file convention
**Branch**: `g1-bulk-rate-followups` (no PR — push only, per user direction)
**Source**: WEEKLY.md Aug 31–Sep 4 § G1 (🏆, 6 SP) ← BACKLOG 🟤 `### [2026-08-24] PR #66 … smoke round-1 + review follow-ups`
**Predecessors**: [2026-07-24-g3-bulk-rate-repair-avoidance-design.md](2026-07-24-g3-bulk-rate-repair-avoidance-design.md), [2026-07-25-g3-rescore-and-counter-fixes-design.md](2026-07-25-g3-rescore-and-counter-fixes-design.md) (D2 = "wait for the re-score, then render"; D4 = undo gets the same protocol)

## Problem

PR #66 shipped the D2 deferred-re-render fix — the branch's main correctness property — with **zero automated
coverage**: the compare-mode bulk-rating E2E passes because `mlWorker` is null, so `postedUpdates` is 0 and
`applyBulkRating` takes the immediate-render branch. Three lifecycle defects around the same
`pendingCompareRefresh` / `bulkRatedPairs` state were deferred from the same review, plus two unit-coverage gaps.

## Findings that change the WEEKLY framing

1. **`mlWorker` is null under Playwright because `initializeMlWorker()` is lazy**, not because the harness can't
   run workers. It is called only from `handleSortByPrediction` (first AI sort, `media-viewer.js` ~7901) and the
   ML settings toggle. The E2E sets `isSortedByPrediction = true` by hand and never reaches either. A plain
   `new Worker('ml-worker.js')` + `importScripts('ml-model.js')` works in the Electron renderer (production does
   exactly this). No E2E runs the ML worker today.
2. **Warm-up requirement for a real-worker chain**: `scoreFiles` replies `scores: null` until the model has
   ≥3 likes and ≥3 dislikes (`ml-model.js` `hasEnoughSamples`), and the deferred-window clear in the
   `scoreComplete` handler sits **inside** `if (message.scores)` — a null-scores reply leaves the window to the
   3 s fallback. Latent, low severity in production (AI-sort implies enough samples). **Out of scope** — filed
   to BACKLOG 🟤 at closeout.
3. The existing E2E's `getCombinedFeatures = () => [0.1, 0.2, 0.3]` would feed 3-dim vectors to a 576-dim model
   → `NaN` scores with the real worker. The new test uses deterministic 576-dim vectors.

## Decisions

- **D1 — real worker, no stub, no production flag.** The "stub `mlWorker`" premise was false (finding 1). Run the
  real `ml-worker.js` in the E2E via the public `initializeMlWorker()`; it is the only option that proves the
  *worker's* replies satisfy the renderer's protocol and adds zero test hooks to production code.
  Rejected: (B) canned-reply stub in `tests/e2e/helpers/` — proves only the renderer's handler chain, and another
  mock is what made the test hollow; (C) env flag in `ml-worker.js` — test logic in production code.
- **D2 — a single `_cancelDeferredCompareRefresh()` helper** replaces the inline block at the `moveComparePair`
  <2-files site and is called from `loadFolder` before the empty/non-empty branches diverge (same reasoning as
  the `cancelBackgroundExtraction()` hoist). It resets `mediaNavigationInProgress` **only if a window was
  open**, so it never clobbers an unrelated in-flight navigation.
- **D3 — capture pruned pair keys on the history entry, restore in `restoreFeatureCachesFromHistory`.** Capture
  at the three move sites (single, special, compare pair) *before* `removeFileFromList` prunes; restore before
  the method's `mlFeatures` early-return so a file with no features still gets its keys back. The method is
  already documented as "the inverse of `removeFileFromList`", so this extends its documented role; keep the
  name (a rename would touch 6 call sites + tests for no behavior gain) and update the CLAUDE.md line.
- **D4 — mutation-verified tests.** The D2 E2E must fail against a locally reverted D2 (render immediately)
  before it counts. The `updateNavigationInfo` fall-through test uses `mlComparePairIndex = 1` because with
  index 0 the mutation is undetectable (`Pair 1 of 2` either way).
- **D5 — two findings deliberately not fixed here** (scope discipline, user-confirmed): the `scores: null`
  stall (finding 2) and a late `scoreComplete` after a folder switch writing old scores onto same-named files in
  the new folder (`predictionScores` is path-keyed but the reply is filename-keyed). Both → BACKLOG 🟤.

## Design

### 1 · E2E: deferred-refresh protocol under the real worker (🏆)

New test in `tests/e2e/compare-mode.test.js` (the existing persistence test is unchanged). Setup, all via
existing public methods inside `page.evaluate`:

1. `seedLocalStorage({ mlPredictionEnabled: 'true' })`; `mv.initializeMlWorker()`; wait for `mv.mlModelState`
   (set by the `initComplete` reply).
2. Override `mv.getCombinedFeatures` with a deterministic 576-dim vector per path (hash of the path seeds the
   fill, so scores differ per file).
3. Warm up: 3× `updateMlModelWithFeatures(v, 'like')` + 3× `'dislike'`; wait for
   `mv.mlStats.positiveCount >= 3 && mv.mlStats.negativeCount >= 3`.
4. Instrument: wrap `mv.handleMlWorkerMessage` and `mv.showMedia` to push `{type}` / `'showMedia'` into an
   `events` array on `window`.
5. Enter the same forced AI-sorted compare state the existing test uses.

Assertions — **rating (D2)**:
- Immediately after `await mv.applyBulkRating('good')`: `pendingCompareRefresh === true`,
  `pendingCompareUpdates === 2`, `mediaNavigationInProgress === true`, no `showMedia` event yet.
- After `waitForFunction(!mediaNavigationInProgress)`: event order is
  `updateComplete, updateComplete, scoreComplete, showMedia` — exactly one `showMedia`, after a
  `scoreComplete` whose `scores` is non-null; `pendingCompareTimeout === null` and `pendingCompareRefresh ===
  false` (settled by the reply, not the fallback).

Assertions — **undo (D4 of the G3 spec)**: reset `events`, `await mv.handleCancel()` →
`reverseUpdateComplete, reverseUpdateComplete, scoreComplete, showMedia`, same settle checks.

Fail-first: temporarily replace the `if (postedUpdates > 0)` branch in `applyBulkRating` with an immediate
`this.showMedia()`; the test must fail on "no `showMedia` yet"; restore.

### 2 · `loadFolder` clears the deferred-refresh window

```js
// Drop an open deferred compare refresh (applyBulkRating / undoBulkRating / moveComparePair arm it).
// Resets mediaNavigationInProgress ONLY when a window was open — that flag is also held by ordinary
// in-flight navigation, which this must not release.
_cancelDeferredCompareRefresh() {
    const wasPending = this.pendingCompareRefresh;
    if (this.pendingCompareTimeout) { clearTimeout(this.pendingCompareTimeout); this.pendingCompareTimeout = null; }
    this.pendingCompareRefresh = false;
    this.pendingCompareUpdates = 0;
    this.previousScores = null;
    if (wasPending) this.mediaNavigationInProgress = false;
}
```

Call sites: `loadFolder` (next to `cancelBackgroundExtraction()`, before the branches diverge) and the
`moveComparePair` <2-files block (replaces the inline clear; that block already sets
`mediaNavigationInProgress = false` unconditionally just above, so behavior there is unchanged).

Tests (`tests/media-viewer-utils.test.js`): helper — both branches of the `wasPending` rule; `loadFolder`
extract-method test in the style of "empty-folder teardown" asserting the helper runs on the empty **and**
non-empty branch.

### 3 · Undo reinstates pruned `bulkRatedPairs` keys

- `_bulkPairKeysReferencing(name)` → `string[]` of keys where `name` is either partner (split on the `'NUL'` separator `bulkPairKey` uses).
  `removeFileFromList` uses it for its prune (identical behavior).
- Capture `entry.prunedPairKeys = this._bulkPairKeysReferencing(file.name)` at the three move sites, on the
  history entry, before the corresponding `removeFileFromList` call — only when non-empty (keeps history entries
  small; undo tolerates the field's absence).
- `restoreFeatureCachesFromHistory(entry)`: at the top, `for (const k of entry?.prunedPairKeys ?? [])
  this.bulkRatedPairs.add(k)`, then the existing `mlFeatures` guard.
- Correctness across LIFO: `rate-pair (a,f) → single-rate a (captures key on a's entry) → single-rate f
  (nothing to capture) → undo f (no key) → undo a (key restored)`. A restored key that names a file still
  absent is inert (it can never match a displayed pair) and is re-pruned if that file is removed again.

Tests: capture at each of the three sites (via `extractAsyncMethod` of the move methods where feasible; otherwise
a source-slice assertion that the capture precedes the prune); restore via the existing `handleCancel feature
restore` fixture (`rate-pair → single-rate → undo` ⇒ key present); the LIFO case above (key restored exactly
once, on the right undo); `restoreFeatureCachesFromHistory` restores keys even when `mlFeatures` is null.

### 4 · Coverage gaps

- `updateNavigationInfo` fall-through: every pair suppressed, `mlComparePairIndex = 1` → `Pair 2 of 2`
  (mutation deleting the fall-through yields `Pair 1 of 2`).
- `undoBulkRating` return value: mocks `true/true` → 2, `true/false` → 1, null features → 0 (existing tests'
  `vi.fn()` mocks return `undefined`, so the arithmetic is untested today).

## Files

| File | Change |
|------|--------|
| `media-viewer.js` | `_cancelDeferredCompareRefresh`, `_bulkPairKeysReferencing`, 3 capture sites, `restoreFeatureCachesFromHistory` key restore, `loadFolder` call, `moveComparePair` block → helper |
| `tests/e2e/compare-mode.test.js` | New deferred-protocol test (rating + undo) under the real worker |
| `tests/media-viewer-utils.test.js` | Items 2–4 tests |
| `CLAUDE.md` | `restoreFeatureCachesFromHistory` line (+ `prunedPairKeys`); `loadFolder` cleanup note; E2E gotcha: ML worker is lazy — `initializeMlWorker()` + warm-up needed for any scoring E2E |
| `docs/planning/BACKLOG.md` | Closeout: D5's two findings → 🟤 |

## Verification

`npm test` (pre-commit), `npx playwright test tests/e2e/compare-mode.test.js`, the fail-first mutation check
(D4), `npm run lint`. One commit per item; `git push -u origin g1-bulk-rate-followups`; **no PR**.
