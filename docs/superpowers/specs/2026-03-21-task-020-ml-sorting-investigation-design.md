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

In compare mode with ML sorting active, after rating a pair:
1. `moveComparePair()` removes rated files → calls `showCompareMedia()`
2. `updateMlModelWithFeatures()` sends `update` to ML worker
3. Worker returns `updateComplete` → 100ms debounce → `requestPredictionScores()` → `scoreAll`
4. `scoreComplete` updates `predictionScores` map

Step 1 fires BEFORE step 4 completes. The next pair renders with stale scores.

### Solution

In compare mode with ML sort active, chain the flow: update → score → then show next pair.

```
Rating in compare mode (ML sort active):
  1. moveComparePair() removes files, does NOT call showCompareMedia()
  2. updateMlModelWithFeatures() sends 'update' to worker
  3. On 'updateComplete': skip 100ms debounce, immediately send 'scoreAll'
  4. On 'scoreComplete': update predictionScores, THEN call showCompareMedia()
```

### Design Decisions

- **100ms debounce preserved for single mode** — single mode only updates badges, no ordering impact
- **Compare mode + ML sort active bypasses debounce** — chains update → score → show next pair
- **Loading indicator** — brief loading state while waiting for re-score (reuse existing indicator)
- **Fallback timeout (3 seconds)** — if re-score hasn't returned, show next pair with stale scores rather than blocking forever

### State Changes

- `pendingCompareRefresh: boolean` — new state flag, `true` when awaiting re-score before showing next compare pair
- `moveComparePair()` — add conditional: if ML-sorted, set `pendingCompareRefresh = true` and skip `showCompareMedia()` call
- `updateComplete` handler — detect `pendingCompareRefresh`, skip debounce, send immediate `scoreAll`
- `scoreComplete` handler — if `pendingCompareRefresh`, call `showCompareMedia()` after updating scores, reset flag

### Files Modified

- `media-viewer.js`: `moveComparePair()`, `updateComplete` handler, `scoreComplete` handler, constructor (new state)

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

1. Before sending `scoreAll` after a rating, snapshot current `predictionScores` into `previousScores` (temporary Map)
2. On `scoreComplete`, diff old vs new scores, count files with |delta| > 0.05
3. Show notification via existing `showNotification()` (short duration, ~2s)
4. Use a `scoreTriggeredByRating: boolean` flag to distinguish rating-triggered re-scores from other triggers

### Files Modified

- `media-viewer.js`: `requestPredictionScores()` (snapshot), `scoreComplete` handler (diff + notification), constructor (new state)

---

## 4. Unit Tests for Pair Selection Logic

### Approach

Extract the pair selection algorithm from `showCompareMedia()` and test with mock data using the existing `extractMethod()` pattern.

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
