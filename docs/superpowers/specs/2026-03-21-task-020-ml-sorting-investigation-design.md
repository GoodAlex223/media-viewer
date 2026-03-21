# TASK-020: ML Sorting Pair Ordering & Online Adaptation — Design Spec

**Date**: 2026-03-21
**Task**: TASK-020
**Approach**: B — Fix race condition + improve UX feedback + unit tests + future work items
**Branch**: `feature/task-020-ml-sorting-investigation`

---

## 1. Root Cause Analysis

Six user-reported issues investigated against the ML sorting pipeline.

### Issue 1 — "Results seem inaccurate, both files likeable"
**Verdict**: Working as designed. The 64-dim color/texture feature vector cannot capture semantic content ("what's in the image"). Visually different but equally appealing images naturally receive similar scores. This is a model capability limitation, not a bug.
**Action**: Document as future work (content-understanding features, ties into TASK-028).

### Issue 2 — "99% left vs 97% right, scores decrease over time"
**Verdict**: Bug (race condition). After rating a pair, `moveComparePair()` calls `showCompareMedia()` synchronously, but `updateMlModelWithFeatures()` triggers a debounced 100ms re-score. The next pair renders with stale scores from old model weights. As pairs progress, stale scores become increasingly inaccurate.
**Action**: Fix — await re-score before rendering next pair.

### Issue 3 — "Best shown first on both sides"
**Verdict**: Same root cause as Issue 2. With stale scores, the "lowest" file may actually have a high score — the model updated but `predictionScores` hasn't reflected it yet.
**Action**: Fixed by Issue 2 fix.

### Issue 4 — "Left posts appear at start of single mode after sort"
**Verdict**: Working as designed. Single mode sorts `mediaFiles[]` descending by score (best first). Compare mode pairs best-vs-worst. The "left" files in compare mode ARE the first files in single mode. This is correct behavior.
**Action**: None needed.

### Issue 5 — "Adaptation doesn't seem to work"
**Verdict**: Partially bug (race from Issue 2), partially UX gap. Adaptation IS happening (model weights update, scores recompute after 100ms debounce), but the user has no visible feedback that scores changed. Prediction badges update but are small and not attention-grabbing.
**Action**: Fix race condition (Issue 2) + add score delta UX feedback.

### Issue 6 — "Skipping pairs doesn't change order"
**Verdict**: Working as designed. Navigating without rating doesn't call `updateMlModelWithFeatures()`, so no model update, no score change. The model only learns from explicit likes/dislikes.
**Action**: None needed (behavior is correct).

---

## 2. Race Condition Fix

### Problem

In compare mode with ML sorting active, after rating a pair, the actual code flow in `moveComparePair()` is:
1. `updateMlModelWithFeatures()` called for primary file (label from action)
2. `updateMlModelWithFeatures()` called for secondary file (opposite label)
3. `removeFileFromList()` for both files
4. `this.showMedia()` called (dispatches to `showCompareMedia()` when `isCompareMode` is true)

Each `updateMlModelWithFeatures()` sends a separate `update` message to the ML worker. The worker returns `updateComplete` for each → 100ms debounce → `requestPredictionScores()` → `scoreAll` → `scoreComplete` updates `predictionScores` map.

Step 4 (`showMedia()`) fires BEFORE either `scoreComplete` arrives. The next pair renders with stale scores.

### Solution

In compare mode with ML sort active, chain the flow: wait for both updates → score → then show next pair.

```
Rating in compare mode (ML sort active):
  1. moveComparePair() calls updateMlModelWithFeatures() twice, removes files
  2. moveComparePair() does NOT call this.showMedia(); sets pendingCompareRefresh = true
  3. pendingCompareUpdates counter set to 2 (expecting 2 updateComplete messages)
  4. On each 'updateComplete': decrement counter; when counter reaches 0, skip debounce,
     immediately send 'scoreAll'
  5. On 'scoreComplete': update predictionScores, THEN call this.showMedia()
```

### Design Decisions

- **100ms debounce preserved for single mode** — single mode only updates badges, no ordering impact
- **Compare mode + ML sort active bypasses debounce** — chains update → score → show next pair
- **Two-update batching** — `pendingCompareUpdates` counter tracks both `updateComplete` messages; `scoreAll` fires only after both arrive, ensuring the model reflects both ratings
- **Loading indicator** — brief loading state while waiting for re-score (reuse existing indicator)
- **Fallback timeout (3 seconds)** — if re-score hasn't returned, show next pair with stale scores; timeout clears `pendingCompareRefresh` flag and `pendingCompareUpdates` counter to prevent stale `scoreComplete` from triggering an unintended `showMedia()` later
- **Guard interaction** — during the pending refresh window, `mediaNavigationInProgress` stays `true` (set by `moveComparePair()`) to block spurious `showMedia()` calls from key events or resize; it is cleared after the deferred `showMedia()` completes or on fallback timeout
- **Undo in compare mode** — `reverseUpdateComplete` handler has the same 100ms debounce pattern; if `pendingCompareRefresh` is active during an undo, the same bypass logic applies. However, undo in compare mode is rare and only sends one `reverseUpdate`, so the counter is set to 1 in that path.

### State Changes

- `pendingCompareRefresh: boolean` — new state flag, `true` when awaiting re-score before showing next compare pair
- `pendingCompareUpdates: number` — counter for expected `updateComplete` messages (2 for rating, 1 for undo)
- `moveComparePair()` — add conditional: if ML-sorted and `isSortedByPrediction`, set `pendingCompareRefresh = true`, `pendingCompareUpdates = 2`, skip `this.showMedia()` call
- `updateComplete` handler — if `pendingCompareRefresh`, decrement `pendingCompareUpdates`; when 0, skip debounce, send immediate `scoreAll`
- `reverseUpdateComplete` handler — same bypass logic as `updateComplete` when `pendingCompareRefresh` is active
- `scoreComplete` handler — if `pendingCompareRefresh`, call `this.showMedia()` after updating scores, reset `pendingCompareRefresh` and clear fallback timeout
- Fallback timeout — on fire: clear `pendingCompareRefresh`, `pendingCompareUpdates`, `mediaNavigationInProgress`, then call `this.showMedia()` with stale scores

### Files Modified

- `media-viewer.js`: `moveComparePair()`, `updateComplete` handler, `reverseUpdateComplete` handler, `scoreComplete` handler, constructor (new state)

---

## 3. Score Delta UX Feedback

### Purpose

Make online adaptation visible so users can see the model IS learning from their ratings.

### When Shown

After `scoreComplete` arrives following a **rating-triggered** re-score (not on initial sort, manual re-sort, or app startup).

### What to Show

Compare old vs new `predictionScores`. Count files whose score moved by more than 0.05 (5%).

Example notifications:
- `"ML updated: 12 files rescored (8↑ 4↓)"` — some scored higher, some lower
- `"ML updated: scores stable"` — model didn't change much

### Implementation

1. Snapshot `predictionScores` into `previousScores` (temporary Map) at the point where `pendingCompareRefresh` is set — this captures pre-rating scores before either model update
2. The snapshot is taken once per rating action (before either `updateMlModelWithFeatures()` call), not per `scoreAll` request, ensuring the diff reflects the combined impact of both updates
3. On `scoreComplete`, diff old vs new scores, count files with |delta| > 0.05
4. Show notification via existing `showNotification()` (short duration, ~2s)
5. Use the `pendingCompareRefresh` flag (or a separate `scoreTriggeredByRating: boolean`) to distinguish rating-triggered re-scores from other triggers

### Files Modified

- `media-viewer.js`: `moveComparePair()` (snapshot), `scoreComplete` handler (diff + notification), constructor (new state)

---

## 4. Unit Tests for Pair Selection Logic

### Approach

Extract the pair selection algorithm from `showCompareMedia()` and test with mock data using the existing `extractMethod()` pattern. The mock context must provide a `predictionScores` Map (not a plain object) since the code accesses scores via `.get(f.path) ?? 0.5`.

### Test File

`tests/ml-pair-selection.test.js` (new file)

### Test Cases

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | Basic pairing | 4 files, scores [0.9, 0.7, 0.3, 0.1], pairIndex=0 | left=0.9, right=0.1 |
| 2 | Second pair | Same 4 files, pairIndex=1 | left=0.7, right=0.3 |
| 3 | Two files boundary | 2 files, pairIndex=0 | left=highest, right=lowest |
| 4 | Equal scores | Files with score 0.5 each | No crash, deterministic selection |
| 5 | Missing scores | File not in predictionScores | Defaults to 0.5 |
| 6 | pairIndex clamping | pairIndex > floor(length/2)-1 | Clamped, no out-of-bounds |
| 7 | leftIndex >= rightIndex guard | Odd file count, pairIndex at max | Falls back to [0] vs [last] |

### What We're NOT Testing

- Full `showCompareMedia()` method (too many DOM dependencies)
- ML worker scoring internals
- Feature extraction pipeline

---

## 5. Future Work (BACKLOG Items)

To be added to `docs/planning/BACKLOG.md` under TASK-020 origin:

1. **Content-understanding features** — Current 64-dim vector captures color/texture only. Integrating CLIP embeddings or similar would dramatically improve score discrimination. Ties into TASK-028 research.

2. **Auto re-sort after N ratings** — Currently the user must manually click "Sort by Prediction" to reorder files. Consider auto-re-sorting after every N ratings (configurable, e.g., every 5 or 10) to keep ordering fresh.

3. **Model diagnostics panel** — Show weight distribution, feature importance, training sample counts, and prediction confidence histogram in Settings panel. Helps users understand model behavior.

4. **Wider score gaps via margin-based pairing** — Require a minimum score gap (e.g., 0.2) for pairs. Skip pairs with tiny gaps (99% vs 97%) that feel like coin flips.

5. **Score confidence indicator** — Distinguish high-confidence predictions (many similar training samples) from low-confidence ones (novel features).

---

## 6. Scope Summary

### In Scope
- Fix race condition in compare mode ML pair rendering
- Add score delta notification after rating-triggered re-scores
- Unit tests for pair selection logic (7 test cases)
- Document all 6 issues with verdicts
- Add 5 future work items to BACKLOG.md

### Out of Scope
- Model architecture changes
- Feature vector improvements
- Auto re-sort
- Content understanding integration
- Changes to single mode behavior
