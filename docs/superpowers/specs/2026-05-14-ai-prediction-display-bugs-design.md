# Design — AI Prediction Display Bugs (Group B)

**Date:** 2026-05-14
**Branch:** `fix/ai-prediction-display-bugs`
**Source:** [TODO.md L69-100](../../planning/TODO.md#L69-L100), [WEEKLY.md L29-L41](../../planning/WEEKLY.md#L29-L41)
**Effort:** 5 SP (2 SP undo bug + 3 SP misalignment bug)

## Problem

Two related bugs in the ML prediction display layer share the root cause "prediction state is not re-synchronized with `mediaFiles` when the file list changes":

### Bug 1 — Like-probability not displayed after undo

After undoing the last rating(s) via `handleCancel()`, the prediction percentage badge no longer displays for the restored media. The undo path restores the file entry to `mediaFiles`, but `removeFileFromList()` (called at rating time) already cleared `featureCache`, `clipCache`, `predictionScores`, `featureMetadata`, and `perceptualHashes` for that path. Without features, the ML worker cannot re-score the restored file; without a score in `predictionScores`, `updatePredictionBadges()` shows nothing.

Russian original (from the manual-test report): "После отмены последних оценок процент(вероятность) лайка не показывается."

### Bug 2 — Prediction percentages misaligned after AI sort

After clicking AI sort (regardless of any preceding "cancel similarity-sort" step), the badges sometimes display percentages that don't match the underlying file's actual score. Example user repro: `99% / 56%, 98% / 55%, 97% / 54%` instead of the expected `99% / 54%, 98% / 55%, 97% / 56%`.

**Root cause** (confirmed): The ml-worker's `getSortedOrder` returns `{type:'sortComplete', sortedFilenames, scores, stats}` ([ml-worker.js L221-L226](../../../ml-worker.js#L221-L226)) — note the **`scores` field**. The renderer's `sortComplete` handler at [media-viewer.js L5648](../../../media-viewer.js#L5648) reorders `this.mediaFiles` from `sortedFilenames` but **ignores `message.scores`**. So when `updatePredictionBadges()` runs, it reads stale per-path scores from previous `scoreComplete` events. The cancel-similarity prefix is incidental — Bug 2 reproduces on first AI-sort whenever `predictionScores` holds any prior values.

## Approach

Two surgical fixes plus one small symmetry addition.

### Bug 2 — `sortComplete` populates `predictionScores` from worker scores

In `handleMlWorkerMessage`'s `case 'sortComplete':` block, before applying `this.mediaFiles = sorted`, iterate `message.scores` and write each `(path, score)` pair into `this.predictionScores`. Path lookup uses the same `filenameToFile` Map already being built one line above.

### Bug 1 — Restore feature caches on undo

Add helper method `restoreFeatureCachesFromHistory(entry)` near `removeFileFromList` (~L999) — mirrors that method as its inverse. Behavior:

- Null/missing `mlFeatures` → no-op
- 576-dim `mlFeatures` → split into `featureCache.set(path, slice(0, 64))` + `clipCache.set(path, slice(64, 576))`
- 64-dim `mlFeatures` (CLIP unavailable at rating time) → restore only `featureCache`
- Unexpected length → no-op (defensive)
- Restore `featureMetadata` with `{ size: entry.fileSize, mtime: 0 }` — mtime: 0 makes the entry mismatch on next folder reload, forcing re-extraction; correct because session-only validity is enough for path-keyed in-memory lookup.

All four `handleCancel` branches ([L3353, L3411, L3485, L3546](../../../media-viewer.js#L3342)) call `this.restoreFeatureCachesFromHistory(move)` for each restored file after `moveFile` IPC success, before `showMedia()`.

For non-special branches, `reverseMlModelUpdate` already triggers `requestPredictionScores()` via the `reverseUpdateComplete` debounce path at [L5587-L5591](../../../media-viewer.js#L5587-L5591). No additional call needed.

For the special-move branch (which has no `reverseMlModelUpdate`), add an explicit `if (this.isSortedByPrediction) this.requestPredictionScores();` after restoring.

### Capture `mlFeatures` on special moves

The `historyEntry` in the special-move path at [L1345-L1352](../../../media-viewer.js#L1345-L1352) currently omits `mlFeatures`. Add capture mirroring the `moveCurrentFile` pattern (gated by `this.isMlEnabled && this.mlWorker`). Required so `restoreFeatureCachesFromHistory` has data to work with after special-undo; without this, special-undo in AI-sorted mode would leave the file in the list with no badge — an asymmetry users would notice.

## Code Sketch

### `restoreFeatureCachesFromHistory` (new method, near L999)

```js
restoreFeatureCachesFromHistory(entry) {
    if (!entry || !entry.mlFeatures) return;
    const features = entry.mlFeatures;
    const path = entry.originalPath;

    if (features.length === 576) {
        this.featureCache.set(path, new Float32Array(features.slice(0, 64)));
        this.clipCache.set(path, new Float32Array(features.slice(64, 576)));
    } else if (features.length === 64) {
        this.featureCache.set(path, new Float32Array(features));
    } else {
        return;
    }

    if (entry.fileSize !== undefined) {
        this.featureMetadata.set(path, { size: entry.fileSize, mtime: 0 });
    }
}
```

### `sortComplete` patch (L5648 area)

```js
case 'sortComplete':
    this.clearProgressNotification();
    if (message.sortedFilenames) {
        const filenameToFile = new Map(this.mediaFiles.map((f) => [f.name, f]));
        const sorted = message.sortedFilenames.map((name) => filenameToFile.get(name)).filter((f) => f);

        if (sorted.length > 0) {
            if (message.scores) {
                for (const [filename, score] of Object.entries(message.scores)) {
                    const file = filenameToFile.get(filename);
                    if (file) this.predictionScores.set(file.path, score);
                }
            }

            this.mediaFiles = sorted;
            this.currentIndex = 0;
            this.isSortedByPrediction = true;
            this.showMedia();
            this.updateSortPredictionButton();
            this.showNotification('Sorted by predicted preference', 'success');
        } else {
            this.showNotification('No files to sort', 'warning');
        }
    } else {
        this.showNotification(message.reason || 'Could not sort files', 'warning');
    }
    break;
```

### `handleCancel` per-branch call sites

After each successful `moveFile` IPC and `mediaFiles` restore, before `showMedia()`:

- Branch at L3353 (special, compare-mode): `this.restoreFeatureCachesFromHistory(lastMove);` then `if (this.isSortedByPrediction) this.requestPredictionScores();`
- Branch at L3411 (compare-mode like/dislike pair): `this.restoreFeatureCachesFromHistory(firstMove); this.restoreFeatureCachesFromHistory(secondMove);`
- Branch at L3485 (single-mode compare-pair undo): same as L3411.
- Branch at L3546 (single-mode single-file undo): `this.restoreFeatureCachesFromHistory(undoMove);`

### `moveSpecial` `mlFeatures` capture (L1345 area)

Mirror the pattern from `moveCurrentFile` (L1158-L1182): extract combined features before move, attach to `historyEntry`. Gated on `this.isMlEnabled && this.mlWorker`.

## Testing (Vitest, unit only)

E2E skipped per design discussion — both bugs are pure state-management, and ML extraction E2E setup is heavy. Add to `tests/media-viewer-utils.test.js`:

### Helper tests — `restoreFeatureCachesFromHistory` (5 cases)

1. **576-dim split** — entry with `mlFeatures: Float32Array(576)` containing `i % 256`; assert `featureCache.get(path)` length 64 matching first 64, `clipCache.get(path)` length 512 matching last 512.
2. **64-dim only** — assert `featureCache` populated, `clipCache` untouched.
3. **Null `mlFeatures`** — no-op; both caches empty.
4. **Unexpected length (128)** — no-op; both caches empty.
5. **`featureMetadata` restoration** — assert `featureMetadata.get(path)` equals `{ size: entry.fileSize, mtime: 0 }`.

### Bug 2 — `sortComplete` propagation (1 test)

Extract `handleMlWorkerMessage` via `extractMethod`, dispatch a mock `{type:'sortComplete', sortedFilenames:[...], scores:{...}}`, assert `predictionScores.get(path)` matches `scores[filename]` for each file. Mock context: `mediaFiles`, `predictionScores: new Map()`, no-op functions for `clearProgressNotification`/`showMedia`/`updateSortPredictionButton`/`showNotification`, `isSortedByPrediction: false`.

### Bug 1 — `handleCancel` integration (3 tests; `extractAsyncMethod`)

1. **Single-mode like-undo** — `moveHistory` has one entry with `mlFeatures: Float32Array(576)`; `window.electronAPI.moveFile` mocked to succeed; assert `featureCache.has(path)`, `clipCache.has(path)`, `mlWorker.postMessage` called with `type: 'reverseUpdate'`.
2. **Compare-mode pair-undo** — two entries, both restored; both caches populated.
3. **Special-move undo (AI-sorted)** — entry with `actionType: 'special'`, `mlFeatures: Float32Array(64)`, `isSortedByPrediction: true`; mock context provides `requestPredictionScores: vi.fn()`; assert `featureCache.has(path)` true, `mlWorker.postMessage` NOT called with `reverseUpdate`, `requestPredictionScores` spy called exactly once.

Total: ~9 new tests, 180 → ~189 unit tests.

## Edge Cases

- **`mlFeatures` null** (ML disabled at rating time): helper no-ops; undo still restores file to list; no badge appears (correct).
- **`mlFeatures` 64-dim only** (CLIP unavailable at rating time): only `featureCache` restored; `getCombinedFeatures` produces 576-dim with CLIP half = zeros; ML model handles this naturally.
- **Special move with ML disabled**: new capture is gated; entry without `mlFeatures` → helper no-ops.
- **Undo when not AI-sorted**: features restore correctly; `updatePredictionBadges` returns early due to `!this.isSortedByPrediction` gate; no badge appears (correct — only AI-sorted mode shows badges).
- **Worker not ready on special-undo `requestPredictionScores`**: existing guard at L6138 returns early; no crash.
- **Pre-existing `moveHistory` entries from sessions before this fix**: special-move entries lack `mlFeatures`; helper no-ops on those. No crash. New ratings made after this fix get full restore.

## Files Changed

| File | Change | Approx LOC |
|------|--------|------------|
| [media-viewer.js](../../../media-viewer.js) | New helper (~15 LOC); sortComplete patch (~6 LOC); 4 handleCancel branches (~4 LOC each); moveSpecial mlFeatures capture (~7 LOC) | +45 |
| [tests/media-viewer-utils.test.js](../../../tests/media-viewer-utils.test.js) | 5 helper tests + 1 sortComplete test + 3 handleCancel tests | +260 |
| [docs/planning/TODO.md](../../planning/TODO.md) | Move both entries to DONE.md on PR completion | mechanical |
| [docs/planning/WEEKLY.md](../../planning/WEEKLY.md) | Mark Group B complete | mechanical |

## Acceptance Criteria

From TODO.md:
- [x] After undo, restored file shows prediction percentage in single mode (when AI-sorted)
- [x] After compare-pair undo, both restored files show percentages
- [x] No regression in normal nav/rating prediction display
- [x] After AI sort: prediction percentage on each media matches the underlying file's actual score
- [x] Unit tests cover both bugs (mock worker dispatch + handleCancel branches)
- [x] All existing unit tests pass (180 → ~189)
- [x] No regression in `scoreComplete` path (still updates `predictionScores` correctly after rating events)

## Out of Scope

Tracked as BACKLOG candidates if discovered during implementation:

- Restoring `perceptualHashes` on undo — currently cleared by `removeFileFromList`. Affects similarity-sort cache warmth post-undo, not AI prediction.
- E2E coverage for ML-sort + undo flow — requires heavy setup (rate ≥3 files, kick training, await extraction); separate effort.
- Renaming `deleteMlModelCache()` (misleading name; existing BACKLOG entry).
- `clipUnloadTimer` cleanup in CLIP toggle-off handler (existing BACKLOG entry).

## Risks

- **Forgotten branch in `handleCancel`**: missing `restoreFeatureCachesFromHistory` call in any of 4 branches creates an asymmetric UX (badge restored in some undo paths but not others). Mitigation: all 4 covered explicitly in tests.
- **`Float32Array.slice()` semantics**: `slice` on a Float32Array returns a Float32Array. Wrapping `new Float32Array(slice(...))` is redundant but harmless. Verified — keeps the code parseable; can remove if reviewer requests.
- **Pre-fix `moveHistory` entries**: existing in-memory entries (rated before code change but undone after) lack new `mlFeatures` on special moves. Helper no-ops gracefully. Worst case: one undo with missing badge for files rated pre-fix.
