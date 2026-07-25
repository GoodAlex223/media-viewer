# Group G3 follow-up — Deferred Re-Score + Stable Pair Counter: Design

**Date**: 2026-07-25
**Branch**: `feat/g3-bulk-rate-repair-avoidance` (folded into PR #66)
**Source**: 🔵 User-Flagged — two defects found during the PR #66 user-side manual smoke gate (2026-07-25).
**Status**: Approved (brainstorm) → ready for implementation plan.

---

## Problem

The PR #66 smoke gate surfaced two defects on a 4-image folder in AI-sorted compare mode.

### Defect 1 — the pair counter decrements, then jumps back

Reported: *"the number of pairs decreases during bulk rating, even though the actual number of pairs
doesn't change... at the same time, the number of pairs resets and 'jumps'."*

[`updateNavigationInfo`](../../../media-viewer.js#L3797-L3809) renders the denominator as
`computeValidComparePairs().length` — the count of **un-rated** pairs, not the number of pairs. As
pairs are rated the list shrinks (decrement); when every pair is suppressed,
[the fall-through](../../../media-viewer.js#L2967) re-admits the full candidate list and the count
springs back to full (jump).

Observed on 4 files (ranked A,B,C,D → only two extremes pairs, `(A,D)` and `(B,C)`):

| Step | valid pairs | counter |
|------|-------------|---------|
| start | (A,D), (B,C) | `Pair 1 of 2` |
| rate (A,D) | (B,C) | `Pair 1 of 1` ← decremented |
| rate (B,C) | ∅ → fall-through → (A,D), (B,C) | `Pair 1 of 2` ← jumped back |

### Defect 2 — pairs never re-mix after a bulk rating

Reported: *"the 2nd pair of the other 2 media items appeared (which had already been rated; I
expected media from the first pair and the second pair to appear, not the same ones)."*

There are two sibling rating paths in ML-sorted compare mode and they behave differently:

- [`moveComparePair`](../../../media-viewer.js#L5310-L5339) (single-file like/dislike) sets
  `pendingCompareRefresh = true` / `pendingCompareUpdates = 2` and **defers `showMedia()`** until the
  model re-scores. `updateComplete` → `requestPredictionScores()` →
  [`scoreComplete`](../../../media-viewer.js#L6724-L6731) updates scores and *then* renders.
- [`applyBulkRating`](../../../media-viewer.js#L7967-L8017) posts its model updates and calls
  `showMedia()` **synchronously, with the pre-rating `predictionScores`**. It never sets
  `pendingCompareRefresh`, so `updateComplete` takes the
  [else branch](../../../media-viewer.js#L6635-L6645) — a background re-score that updates scores
  ~100 ms later but **never re-renders** (`scoreComplete` only re-renders when the flag is set).

So the pairing the user sees after a bulk rating is always derived from the **old** score order.
`computeValidComparePairs()` re-sorts by score on [every call](../../../media-viewer.js#L2953-L2955),
so fresh scores *would* re-mix the pairs — nothing is asking it to.

This is technically pre-existing (bulk rating never deferred), but G3 **unmasked** it: the old
`nextMedia()` advanced to a visibly different pair, hiding the staleness; the new in-place
`showMedia()` re-renders the same slot, so repeats are now obvious.

**It also means G3's own acceptance criterion #2** ("a rated file still appears paired with a
different, un-rated file") **cannot pass as implemented** — which is why this is fixed inside PR #66
rather than deferred.

### Defect 2b — the same staleness on undo (found while designing)

[`handleCancel`](../../../media-viewer.js#L3868-L3877)'s bulk branch calls
`requestPredictionScores()` then immediately `await showMedia()`, rendering from the **post-rating**
scores it is in the middle of reverting. The restored pair may therefore not be the pair that was
rated — a direct threat to smoke check #5.

---

## Decisions

- **D1 — fold both fixes into PR #66.** The counter is G3 code, and criterion #2 cannot pass without
  the re-score fix, so the smoke gate is blocked either way. Cost: PR #66 needs a re-review and a
  fresh smoke run.
- **D2 — wait for the re-score, then render** (mirroring `moveComparePair`) rather than rendering
  instantly and re-rendering when scores land. One render, never stale, consistent with the existing
  rating path. Rejected the "instant + flip" alternative: the pair visibly changing under the user
  mid-rating-loop risks rating the wrong pair.
- **D3 — stable positional counter.** Denominator = the full extremes pair count (`floor(n/2)`),
  numerator = the displayed pair's position in that full list.
  **A countdown of un-rated pairs was explicitly rejected**: once D2 lands, re-scoring re-mixes the
  extremes into combos that were never rated, so "un-rated remaining" is non-monotonic and would
  reintroduce the very jump being fixed.
- **D4 — undo gets the same deferred protocol** (D2b). Correctness, not symmetry.
- **D5 — no `previousScores` snapshot for bulk rating.** It would add a second "ML updated: N files
  rescored" toast on top of the existing "Both files marked good" toast. Undo likewise.

---

## Design

### 1. Split the pairing helper

`computeValidComparePairs()` currently builds candidates *and* filters them in one body. Split so the
unfiltered count has a name:

```js
// Full extremes candidate list (i-th highest vs i-th lowest), unfiltered.
// The real, stable pair count — independent of suppression. Pure.
computeAllComparePairs()

// = computeAllComparePairs() minus suppressed combos; falls through to the
// full list when every pair is suppressed. Pure. Behavior unchanged.
computeValidComparePairs()
```

Rendering and navigation keep using `computeValidComparePairs()` — no behavior change there.

### 2. Stable positional counter

`updateNavigationInfo` (ML-sorted compare branch only):

- `Y = computeAllComparePairs().length` — never shrinks, never jumps.
- `X` = the displayed pair's position within that full list, located by `bulkPairKey` match so it
  stays correct when suppression reorders the valid list.
- Falls back to the clamped cursor if the match fails (defensive; should not occur).

This retires the `N > M` failure mode **structurally** — the numerator is no longer a raw cursor.

### 3. Deferred re-score in `applyBulkRating`

- `updateMlModelWithFeatures` returns `true` when it actually posts to the worker. It silently
  no-ops when `!isMlEnabled || !mlWorker` or features are missing, so the caller must count **posted
  messages**, not assume 2 — otherwise `pendingCompareUpdates` never reaches 0 and the view hangs
  until the 3 s fallback.
- `applyBulkRating` counts posts (0/1/2):
  - **count > 0** → set `pendingCompareRefresh = true`, `pendingCompareUpdates = count`,
    `mediaNavigationInProgress = true`, arm the existing 3 s fallback timeout, and **do not render**.
    `scoreComplete` renders with fresh scores.
  - **count === 0** → render immediately; nothing is coming back.
- The existing `mlComparePairIndex` clamp stays (keeps the cursor in range for prev/next);
  `prevPairIndex` is still captured pre-clamp for exact undo.

### 4. Deferred re-score on undo

`handleCancel`'s bulk branch applies the same protocol. `reverseMlModelUpdate` has the identical
silent-no-op guard (`!isMlEnabled || !mlWorker || !features`), so it also returns `true` on a real
post, and [`undoBulkRating`](../../../media-viewer.js#L3840-L3850) returns the post count (0/1/2) for
`handleCancel` to branch on — same count > 0 / count === 0 rule as §3. This
activates the `reverseUpdateComplete` bypass at
[media-viewer.js:6663-6668](../../../media-viewer.js#L6663-L6668), written for exactly this case and
dead until now (BACKLOG records it as unreachable — that entry should be retired on merge).

### Data flow after the change

```
Both good/bad
  └─ applyBulkRating: record pair key, push history, clamp cursor,
     post N model updates, set pending flags, DO NOT render
        └─ updateComplete ×N → requestPredictionScores()
              └─ scoreComplete: write predictionScores, clear flags, showMedia()
                    └─ computeValidComparePairs() re-sorts by FRESH scores → re-mixed pair
  └─ (N === 0) → showMedia() immediately
  └─ (3 s fallback) → clear flags, render with stale scores
```

### Error handling

- Zero posted updates → immediate render (no hang).
- Worker slow/silent → existing 3 s fallback renders with stale scores and clears all pending state.
- `scoreComplete` without `scores` → known pre-existing gap (flags cleared only inside
  `if (message.scores)`); the 3 s fallback still covers it. Tracked in BACKLOG; **out of scope here.**

---

## Testing

**Unit (Vitest, `extractMethod`/`extractAsyncMethod`):**
- `computeAllComparePairs` returns `floor(n/2)` pairs and is unaffected by `bulkRatedPairs`.
- `computeValidComparePairs` behavior unchanged (existing suite must stay green).
- Counter: stable denominator across a rate cycle; correct position under suppression; the existing
  assertion at [media-viewer-utils.test.js:1896](../../../tests/media-viewer-utils.test.js#L1896)
  (`'Pair 1 of 3'`) is updated.
- `applyBulkRating`: sets the pending flags and does **not** call `showMedia` when updates posted;
  **does** call `showMedia` when zero posted; `pendingCompareUpdates` equals the posted count.
- `handleCancel` bulk branch: same flag assertions.
- Mutation-verify each new guard test (per the PR #64 lesson — a guard test that passes with its
  guard removed is vacuous).

**E2E:** full Playwright suite re-run (55/55 baseline).

**Manual smoke (user-side gate):** the PR #66 6-check list, re-run on **~15–20 files** — a 4-file
folder is degenerate (only 2 extremes pairs), which is what made both defects visible but also makes
checks #1/#2 unrepresentative.

---

## Risk

§3/§4 change ML timing — the subsystem behind the PR #59/#64/#65 regressions. The 3 s fallback bounds
the worst case and counting real posts closes the hang path, but this needs the manual smoke, not
just green tests.

## Out of scope

- Broadening pairing beyond fixed extremes (a rated file only re-pairs when re-scoring reorders).
- Memoizing `computeValidComparePairs` (🟤 BACKLOG follow-up from PR #66).
- The single-move-undo pair-key restore gap (🟤 BACKLOG follow-up #1 from PR #66).
