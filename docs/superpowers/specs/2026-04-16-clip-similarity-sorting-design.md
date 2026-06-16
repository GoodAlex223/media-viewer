# CLIP Similarity Sorting — Design Spec

**Date**: 2026-04-16
**Task**: Group D: CLIP Similarity Sorting (5 SP)
**Status**: Approved
**Branch**: `feature/clip-similarity-sorting`

---

## Problem

The existing "Sort by Similarity" feature uses perceptual hashing (blockhash) with Hamming distance. This groups files by visual appearance (color, texture, structure) but misses semantic similarity — photos of the same subject in different lighting or angles may sort far apart, while visually similar but semantically unrelated images may cluster together.

TASK-028 added CLIP ViT-B/32 embeddings (512-dim, unit-normalized `Float32Array`) stored in `clipCache`. These embeddings capture semantic meaning but aren't yet used for sorting.

## Solution

Add a "CLIP (Semantic)" option to the existing sort algorithm dropdown. When selected, sorts files by CLIP cosine similarity using the MST algorithm, grouping semantically similar images together.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UI integration | New dropdown option (not separate button) | Fits existing UI pattern; explicit user control |
| Internal algorithm | Always MST | Avoids 6-way combinatorial UI (3 algo x 2 metric); MST quality matters more for semantic grouping |
| Partial extraction | Sort with-vectors, append rest at end | Matches existing blockhash pattern; predictable behavior |
| Caching | Reuse feature cache for vectors; new sort order cache key | CLIP vectors already persist in `.feature_cache.json`; only need a new `'clip'` key in the unified `.sort_cache.json` for sort order |
| Distance metric | Cosine distance: `1 - dot(a,b)` | Standard for normalized embeddings; simplifies since CLIP vectors are unit-normalized |

## Architecture

### Data Flow

```
User selects "CLIP (Semantic)" → clicks "Sort by Similarity"
    ↓
handleSortBySimilarity() detects sortAlgorithm === 'clip'
    ↓
Skip hash computation phase entirely
    ↓
Read CLIP vectors from this.clipCache (already in memory)
    ↓
Serialize as { path: [number, number, ...] } → send to sorting worker
    ↓
Worker: cosine distance + VPTree + Prim's MST + greedy traversal
    ↓
Worker returns sorted paths → renderer reorders mediaFiles
    ↓
Sort order cached under 'clip' key in unified .sort_cache.json
```

### Worker Changes (sorting-worker.js)

**New function: `calculateCosineDistance(vec1, vec2)`**
- Input: two arrays of equal length (512-dim CLIP vectors)
- Output: `1 - dot(a,b)` (range 0-2; 0 = identical, 1 = orthogonal, 2 = opposite)
- Since CLIP vectors are unit-normalized by TASK-028 extraction, `|a| = |b| = 1`, so full cosine formula simplifies to `1 - dot(a,b)`
- Guard: if either vector is null/undefined or lengths differ, return `Infinity`

**New function: `sortMediaBySimilarityClip(mediaFiles, clipVectors, currentIndex)`**
- Reuses existing `VPTree`, `MinHeap`, and Prim's MST algorithm from `sortMediaBySimilarityMST()`
- Only difference: distance function uses `calculateCosineDistance` instead of `calculateHammingDistance`
- Same pattern: filter files with vectors → build VP-Tree → build K-neighbor graph → Prim's MST → greedy traversal → append files without vectors
- Progress updates follow same pattern as MST

**Message handler update:**
- New `case 'clip'` in `startSort` switch: calls `sortMediaBySimilarityClip()` with `data.clipVectors` instead of `data.hashes`
- Worker message `data` shape for CLIP: `{ algorithm: 'clip', mediaFiles: [{path}], clipVectors: {path: number[]}, currentIndex: number }`
- Existing algorithms continue to use `data.hashes`; `clipVectors` field is only present for `algorithm: 'clip'`

### Renderer Changes (media-viewer.js)

**`handleSortBySimilarity()` modifications:**
- When `this.sortAlgorithm === 'clip'`:
  - Skip the entire hash computation loop (lines ~4146-4177)
  - Validate CLIP is enabled: if `!this.enableClipFeatures`, show notification "CLIP features are disabled. Enable in Settings (F1)." and return
  - Collect CLIP vectors: `const clipVectors = {}; for (const file of this.mediaFiles) { const vec = this.clipCache.get(file.path); if (vec) clipVectors[file.path] = Array.from(vec); }`
  - Validate minimum 2 files with CLIP vectors
  - Pass to worker: `{ algorithm: 'clip', mediaFiles, clipVectors, currentIndex }`
  - All other flow (sort cache check/save, originalMediaFiles snapshot, toggle logic, force re-sort) remains unchanged

**Algorithm name mapping:**
- Add `clip: 'CLIP (Semantic)'` to `algorithmNames` object

### UI Changes (index.html)

- Add `<option value="clip">CLIP (Semantic)</option>` to `#sortAlgorithmSelect` dropdown
- No other UI changes needed

### Caching

- CLIP vectors: already cached in `.feature_cache.json` via feature cache v4 format (`clipVector` field per entry); loaded into `clipCache` Map on folder load
- Sort order: new `'clip'` key in the unified `.sort_cache.json` created by existing `saveSortCache('clip', sortedPaths, startFile)` / `loadSortCache('clip')` infrastructure
- Force re-sort (Shift+click): deletes the `'clip'` key from `.sort_cache.json` via existing `deleteSortCache('clip')`

## Edge Cases

1. **CLIP not enabled** — `enableClipFeatures` toggle is off → show notification directing user to Settings (F1); do not attempt sort
2. **No CLIP vectors extracted** — `clipCache` empty or <2 files have vectors → show error notification
3. **Partial extraction** — Some files have vectors, others don't → sort files with vectors via MST, append files without vectors at end (consistent with blockhash pattern for files without hashes)
4. **Force re-sort** — Shift+click works identically to other algorithms: delete sort cache, re-sort from current `clipCache` contents
5. **CLIP vectors unit-normalized** — Guaranteed by TASK-028 extraction pipeline; cosine distance simplifies to `1 - dot(a,b)`
6. **Large datasets** — MST algorithm is O(N * K * log N) where K = sqrt(N)*10; same as existing MST. VP-Tree with cosine distance has same complexity as with Hamming distance.
7. **Sort algorithm dropdown with CLIP selected but switching folders** — `sortAlgorithm` persists in localStorage; CLIP sort on new folder uses that folder's `clipCache`. If new folder has no CLIP vectors, error case #2 handles it.

## What We're NOT Doing

- No hybrid metric mixing (CLIP + blockhash combined distance)
- No new UI elements beyond the dropdown option
- No CLIP text-based search (separate backlog item)
- No changes to CLIP extraction pipeline
- No GPU acceleration for distance computation

## Testing

### Unit Tests (sorting-worker.test.js)

- `calculateCosineDistance`: identical vectors → 0, orthogonal vectors → 1, opposite vectors → 2, mismatched lengths → Infinity, null/undefined input → Infinity
- `sortMediaBySimilarityClip`: basic 3-file ordering with known vectors, files without vectors appended at end, abort flag respected, single-file error case

### Manual Testing

- Select "CLIP (Semantic)" from dropdown → click Sort → verify semantic grouping (photos of same subject cluster together)
- Verify sort cache creates the `'clip'` key in `.sort_cache.json`
- Verify force re-sort (Shift+click) works
- Verify restore original order works
- Verify CLIP-disabled error notification
- Verify partial extraction (some files without CLIP vectors appended at end)

### E2E Tests

Not practical for this feature — would require real CLIP model inference or complex embedding mocking in the Electron test environment. Manual testing covers the integration path.

## Module Exports

The conditional CJS export in `sorting-worker.js` must be updated to include `calculateCosineDistance`:
```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MinHeap, VPTree, calculateHammingDistance, calculateCosineDistance };
}
```

## Files Changed

| File | Change |
|------|--------|
| `sorting-worker.js` | Add `calculateCosineDistance()`, `sortMediaBySimilarityClip()`, `case 'clip'` in message handler |
| `media-viewer.js` | CLIP branch in `handleSortBySimilarity()`, algorithm name mapping |
| `index.html` | New dropdown option |
| `tests/sorting-worker.test.js` | Unit tests for cosine distance and CLIP sorting |
