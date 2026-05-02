# CLIP Sort Follow-ups — Design

**Date**: 2026-05-02
**Source**: `docs/planning/BACKLOG.md` lines 60-71 (Group D CLIP Similarity Sorting follow-ups, 2026-04-18)
**Branch**: `feature/clip-sort-followups`
**Estimate**: ~½ day (3 items, ~120-180 LoC + 7 new unit tests)

---

## Goal

Land three follow-ups from Group D's BACKLOG that share a single test surface and address two correctness bugs in the CLIP-similarity sorting pipeline:

1. **Bug fix — algorithm-aware new-file insertion**: `insertNewFilesInSortedOrder` currently uses Hamming distance over perceptual hashes regardless of which algorithm produced the cached sort. When a CLIP-cached sort gets a cache hit and the folder has new files, those new files are placed by visual-hash neighbors instead of semantic neighbors, silently corrupting the semantic ordering.
2. **Bug fix — CLIP toggle-off leaves stale cache and inconsistent UI state**: when the user disables CLIP via Settings (F1), the persisted `'clip'` entry in `.sort_cache.json` is left intact and `this.sortAlgorithm === 'clip'` is preserved. Re-enabling CLIP later loads stale cache; clicking Sort while CLIP is off throws a confusing error.
3. **Test coverage gap**: `sortMediaBySimilarityClip` (90 LoC, shipped in Group D) has no direct test coverage. The algorithm-aware insertion fix in #1 also needs coverage including a regression guard for the unchanged hash path.

---

## Scope

**In scope:**

- `media-viewer.js` — new `calculateCosineDistance()` method; `applyCachedSortOrder` passes algorithm down; `insertNewFilesInSortedOrder` branches on algorithm; CLIP toggle handler does cache + state cleanup
- `sorting-worker.js` — extend `module.exports` to include `sortMediaBySimilarityClip` and `sortMediaBySimilarityMST`
- `tests/sorting-worker.test.js` — new `describe('sortMediaBySimilarityClip', ...)` block (4 tests)
- `tests/media-viewer-utils.test.js` — new `describe('insertNewFilesInSortedOrder (CLIP path)', ...)` block (3 tests)

**Out of scope** (kept in BACKLOG for separate work):

- DRY MST extraction between `sortMediaBySimilarityMST` and `sortMediaBySimilarityClip` (BACKLOG line 62 — explicitly deferred by Group D for scope manageability; the new tests will pay back when this is finally done)
- CLIP success-toast wrong file count (BACKLOG line 69 — cosmetic)
- `K_NEIGHBORS` UPPER_SNAKE_CASE casing (BACKLOG line 70 — cosmetic)
- `calculateCosineDistance([], [])` empty-array guard (BACKLOG line 71 — defensive, no current caller)
- `.sort_cache_clip.json` doc references in spec/CLAUDE.md (BACKLOG line 63 — may bundle if zero-risk on review, otherwise leave)
- E2E tests for the toggle-off behavior — section 3 changes are localStorage + DOM; covered by manual test scenarios 4-6 below
- `sortMediaBySimilarityMST` direct unit tests — out of scope (still untested, exporting it is a freebie that unblocks future work)
- A separate `MediaViewer.calculateCosineDistance()` unit test — trivial mirror of the worker version that's already covered

---

## Background

Group D (PR #29, merged 2026-04-18) shipped the core CLIP similarity sorting feature: `calculateCosineDistance` and `sortMediaBySimilarityClip` in `sorting-worker.js`, the `'clip'` branch in `handleSortBySimilarity`, and the `<option value="clip">` UI hook. The 5 commits passed 159/159 tests.

The final code reviewer flagged 5 follow-ups (BACKLOG lines 60-64) plus 3 from PR #30 review (lines 69-71). All 8 are out-of-scope for this PR except the 3 captured above.

The two correctness bugs share a root: Group D's CLIP path was added in places that lived alongside hash-based logic (`handleSortBySimilarity`, `enableClipFeatures` toggle), but two adjacent state-management surfaces (`insertNewFilesInSortedOrder`, the toggle handler) were not updated to be algorithm-aware. This PR closes those two gaps.

---

## Task 1 — Algorithm-aware new-file insertion

### Current state

`media-viewer.js:5045` `insertNewFilesInSortedOrder(sortedFiles, newFiles)`:

- Computes a perceptual hash for each new file (or reuses cached hash from `this.perceptualHashes`)
- Scores each candidate insertion position by averaging Hamming distances to the file's neighbors in the cached sort
- Inserts at minimum-score position
- Files without a hash are appended at the end with `Infinity` score

This logic is correct for hash-based sorts (`'vptree'`, `'mst'`, `'simple'`) but is invoked unconditionally for `'clip'` cache hits via `applyCachedSortOrder` at line 5032.

### Target state

**New method** (after `calculateHammingDistance` at line 4446):

```js
calculateCosineDistance(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 1;
    let dot = 0;
    for (let i = 0; i < vec1.length; i++) dot += vec1[i] * vec2[i];
    return 1 - dot;
}
```

Mirrors `sorting-worker.js:278`. Inputs are unit-normalized 512-dim `Float32Array`s from `clipCache`. Duplicated-by-design (matches the existing duplication of `calculateHammingDistance` between worker and renderer); shared-utility extraction is tracked in BACKLOG.

**Pass algorithm through** at `media-viewer.js:5032`:

```js
await this.insertNewFilesInSortedOrder(cachedOrder, newFiles, cachedData.algorithm);
```

`cachedData.algorithm` is the source of truth — already written to the cache at line 4256.

**Branch on algorithm** in `insertNewFilesInSortedOrder(sortedFiles, newFiles, algorithm)`:

- **If `algorithm === 'clip'`**: replace the hash-computation + Hamming-scoring loops with cosine-over-`clipCache` logic. For each new file:
  - Look up `this.clipCache.get(file.path)`. If missing → push `{ index: sortedFiles.length, distance: Infinity }` (end-append).
  - Otherwise, scan candidate positions; score each by averaging cosine distance to neighbors' CLIP vectors (`this.clipCache.get(...)`); pick minimum.
  - No on-demand CLIP extraction inside this function — would block the cache-hit path on IPC + main-process model load (~100-200ms × N files). End-append is the consistent fallback.
  - If at least one new file ends up at `Infinity`, show an info notification noting the count (matches `sortMediaBySimilarityClip`'s own first-time-sort behavior).
- **Else** (`'vptree'`, `'mst'`, `'simple'`, or undefined for safety): existing Hamming logic, byte-identical to current code.

The final splice-and-assign loop is shared.

### Why no on-demand CLIP extraction for missing-vector new files

The cache-hit path is expected to be near-instant (the user's mental model: "I already sorted this, just give me the order"). Firing CLIP inference here would:

- Add ~100-200ms per missing file (CPU inference)
- Require IPC roundtrip + possible main-process model reload if it was unloaded by the 30s timer
- Provide marginal benefit: the user can Shift+click for force-resort once background extraction has caught the new files, getting correct placement for everything

End-append matches `sortMediaBySimilarityClip`'s own first-time-sort behavior (file without vector → end), so users see consistent rules.

### Edge cases

- **All new files lack CLIP vectors**: all appended at end, info notification shows "N new files added at end (no CLIP vectors yet)"
- **Cache from before this fix shipped, missing `algorithm` field**: `else` branch's defensive `undefined` handling falls through to Hamming — same as current behavior, no regression
- **`clipCache` is empty** (CLIP toggled off mid-session): same as "all new files lack vectors"; but this case is largely prevented by Task 2's toggle-off cache invalidation

---

## Task 2 — CLIP toggle-off cache & state cleanup

### Current state

`media-viewer.js:1715-1723` (Settings F1 → Enable CLIP features toggle handler):

```js
clipToggle.addEventListener('change', () => {
    this.enableClipFeatures = clipToggle.checked;
    localStorage.setItem('enableClipFeatures', String(clipToggle.checked));
    this.resetMlModel();
});
```

When the user disables CLIP, only the in-memory ML model is reset. The persisted `'clip'` entry in `.sort_cache.json` survives, and `this.sortAlgorithm === 'clip'` is preserved. Two consequences:

1. Re-enabling CLIP later and clicking Sort hits the stale cache (potentially referencing files that no longer have vectors, or vectors from a model version that won't run again on retry).
2. With CLIP off and `sortAlgorithm === 'clip'`, the dropdown still shows "CLIP" and the next sort click throws "CLIP features are disabled. Enable in Settings (F1) to use semantic sorting." — confusing UX.

### Target state

```js
clipToggle.addEventListener('change', async () => {
    this.enableClipFeatures = clipToggle.checked;
    localStorage.setItem('enableClipFeatures', String(clipToggle.checked));
    this.resetMlModel();

    if (!clipToggle.checked) {
        // CLIP disabled: persisted 'clip' sort cache may now reference files
        // without vectors or vectors from a model version that won't load again.
        // Drop the cache entry; revert sortAlgorithm if user was actively on CLIP.
        await this.deleteSortCache('clip');
        if (this.sortAlgorithm === 'clip') {
            this.sortAlgorithm = 'vptree';
            localStorage.setItem('sortAlgorithm', 'vptree');
            if (this.sortAlgorithmSelect) {
                this.sortAlgorithmSelect.value = 'vptree';
            }
        }
    }
});
```

### Decisions

- **Why `'vptree'` specifically as the revert target**: it's the localStorage default in the constructor (`media-viewer.js:361`). Any of the three hash-based options would be safe; consistency with the default is least-surprising.
- **Why `await` on `deleteSortCache`**: an immediately-following sort click sees the deletion already settled. IPC roundtrip is ~5-15ms — imperceptible.
- **No action on toggle-on**: existing path works; first sort recomputes a fresh `'clip'` cache entry from the live `clipCache`.
- **No action when user is on a non-CLIP sort**: only the stale `'clip'` cache key is cleaned up; the user's active `sortAlgorithm` (e.g., `'mst'`) is left alone.

### Why this lives in the toggle handler, not lazy invalidation at sort-time

Lazy invalidation in the cache-hit path would catch broader stale-cache cases (model version drift, file deletion) but: (a) it adds branching to a hot path, (b) it doesn't fix the dropdown-shows-CLIP-after-disable UX, and (c) it doesn't clean up the `.sort_cache.json` file. Lazy invalidation is a separate generalization tracked in BACKLOG if desired.

### Edge cases

- **Rapid toggle off → on**: `change` events fire as separate microtasks; deletes execute serially. Toggle-on doesn't restore anything (no inverse op needed). No race.
- **`deleteSortCache` IPC fails**: best-effort cleanup; if the file write fails, the next call to `loadSortCache('clip')` on re-enable would still load the stale cache. Acceptable — the worst case is the pre-fix behavior. Logged via existing IPC error handling.

---

## Task 3 — Test coverage

### 3.1 — `sortMediaBySimilarityClip` tests

**Prerequisite**: extend `module.exports` at `sorting-worker.js:757`:

```js
module.exports = {
    MinHeap, VPTree,
    calculateHammingDistance, calculateCosineDistance,
    sortMediaBySimilarityClip, sortMediaBySimilarityMST,
};
```

(Adding `sortMediaBySimilarityMST` is a freebie — costs nothing and unblocks the same-section MST test that's also missing per BACKLOG. We do not add MST tests in this PR.)

**Function signature** (verified against `sorting-worker.js:596`):

```js
sortMediaBySimilarityClip(mediaFiles, clipVectors, currentIndex)
```

Three positional args: `mediaFiles` (array of `{path, ...}`), `clipVectors` (`{[path]: number[]}` map), `currentIndex` (start file for MST). Abort is via the module-level `abortFlag` set by the worker's `onmessage` handler (`{ type: 'abort' }`); the function throws `'Sorting cancelled by user'` (not returns partial). The too-few-vectors error message is `"Only ${N} files have CLIP embeddings. Need at least 2 to sort."`

**New `describe` block** in `tests/sorting-worker.test.js`:

```js
describe('sortMediaBySimilarityClip', () => {
    it('orders files by cosine similarity (3-file MST)', /* ... */);
    it('appends files without CLIP vectors at the end', /* ... */);
    it('throws "Sorting cancelled by user" when abort flag is set', /* ... */);
    it('throws when fewer than 2 files have CLIP vectors', /* ... */);
});
```

**Fixtures**: hand-built unit vectors with predictable cosine distances. The algorithm doesn't care about dimensionality — 4-dim vectors are fine and make distance values readable in assertions:

- `[1, 0, 0, 0]` and `[0.99, 0.14, 0, 0]` → cosine distance ~0.01 (very close)
- `[1, 0, 0, 0]` and `[0, 1, 0, 0]` → cosine distance ~1.0 (orthogonal)

The MST should connect the two nearby vectors first, then attach the orthogonal one.

**Abort test**: after `require('../sorting-worker')`, dispatch `self.onmessage({ data: { type: 'abort' } })` to flip `abortFlag = true`, then call `sortMediaBySimilarityClip` and assert it throws `'Sorting cancelled by user'`. (`self` is already stubbed at top of file per existing pattern; `self.onmessage` is assigned by the worker module at line 761 during `require`.) Reset abort state between tests via `self.onmessage({ data: { type: 'sort', ... } })` or by re-`require`-ing — confirmed during implementation.

**Single-file error test**: pass `mediaFiles` with 1 file present in `clipVectors`; assert it throws with message containing `'Only 1 files have CLIP embeddings. Need at least 2 to sort.'`

### 3.2 — `insertNewFilesInSortedOrder` CLIP-path tests

**New `describe` block** in `tests/media-viewer-utils.test.js`, using the existing `extractMethod()` brace-counting helper:

```js
describe('insertNewFilesInSortedOrder (CLIP path)', () => {
    it('inserts new file at cosine-nearest position when CLIP vector exists', /* ... */);
    it('appends new file at end when no CLIP vector available', /* ... */);
    it('preserves Hamming behavior when algorithm !== "clip"', /* regression guard */);
});
```

**Mock context**:

```js
const ctx = {
    mediaFiles: [/* sorted files */],
    clipCache: new Map(),                    // populated for CLIP tests
    perceptualHashes: new Map(),             // populated for the regression guard
    calculateHammingDistance: function (h1, h2) { /* simple impl */ },
    calculateCosineDistance: function (v1, v2) { /* simple impl */ },
    computePerceptualHash: async () => null, // stub (only used in hash path)
    updateProgressNotification: () => {},    // stub
};
```

**Test 1**: 3-file cached order with known CLIP vectors; insert one new file whose vector is closest to position 1; assert it ends up at index 1 in the result.

**Test 2**: cached order has CLIP vectors; new file has none; assert it ends up at index `sortedFiles.length` (end).

**Test 3 (regression guard)**: pass `algorithm = 'vptree'`, populate `perceptualHashes`, leave `clipCache` empty. Assert insertion happens via Hamming logic exactly as before (compare against expected positions). This guards against the algorithm-branch change accidentally affecting the hash path.

### 3.3 — Out-of-scope test surfaces

- **CLIP toggle-off behavior** (Task 2): exercises localStorage + DOM, not pure logic. Covered by manual scenarios 4-6 below. If we later want regression coverage, an E2E test in `tests/e2e/` is the right shape — out of scope here.
- **`MediaViewer.calculateCosineDistance` method**: trivial mirror of the worker version that's already tested. Skipped per "test the algorithm, not the trivial wrapper".
- **`sortMediaBySimilarityMST`**: still untested; exporting it is a freebie. Tracked in BACKLOG.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Hash-path regression in `insertNewFilesInSortedOrder` | High (broad blast: every cache-hit sort) | Test 3.2 #3 regression guard; diff-review must confirm hash branch is byte-equivalent to current code |
| New `calculateCosineDistance` method conflicts with future shared-utility refactor | Low | Documented as duplicated-by-design; tracked in BACKLOG alongside MST DRY |
| `await deleteSortCache('clip')` in toggle handler slows toggle response perceptibly | Negligible | IPC roundtrip ~5-15ms; no UI blocking |
| `cachedData.algorithm` field missing from older cache files | Negligible | Existing cache writes already include `algorithm` (line 4256); `else` branch defaults to Hamming |
| Reverting `sortAlgorithm` from `'clip'` to `'vptree'` confuses user | Low | Dropdown reflects change immediately; without the revert, next sort click throws — current state is already worse |

---

## Manual test scenarios

Run after implementation, before opening PR:

1. **Algorithm-aware insertion (happy path)**: Open folder → wait for CLIP extraction → CLIP-sort → add 2 new files to folder externally → re-open folder (cache hit) → verify new files placed near semantically similar neighbors, not at end.
2. **Algorithm-aware insertion (no-vector fallback)**: Same as above but add the new files BEFORE extraction completes → verify they appear at end with info notification.
3. **Hash-sort regression guard (manual)**: Switch sort algorithm to MST → sort folder → add new files → re-open → verify Hamming-based insertion still works (new files placed by visual similarity, not end).
4. **CLIP toggle-off, no active CLIP sort**: User on `'mst'` sort, toggle CLIP off → verify `sortAlgorithm` still `'mst'`, dropdown unchanged. Inspect `.sort_cache.json` → `'clip'` key gone, `'mst'` key intact.
5. **CLIP toggle-off, active CLIP sort**: User on `'clip'` sort, toggle CLIP off → verify dropdown reverts to "VPTree", `localStorage.sortAlgorithm === 'vptree'`, `.sort_cache.json` `'clip'` key gone.
6. **CLIP re-enable after toggle-off**: After scenario 5, toggle CLIP back on → wait for extraction → manually pick CLIP from dropdown → sort → verify cache rebuilds fresh.

---

## Verification plan

- `npm run lint` clean
- `npm run format:check` clean
- `npm test` → 167/167 (was 160/160 baseline + 7 new)
- `npm run test:e2e` → unchanged from main (39/39 — no E2E added)
- Pre-commit hook runs all of the above on staged files
- Manual scenarios 1-6 pass before PR open

---

## Implementation order

1. Add `calculateCosineDistance()` method on `MediaViewer` (smallest unit; isolated)
2. Extend `sorting-worker.js` `module.exports` (one-line change; unblocks tests)
3. Write `sortMediaBySimilarityClip` tests (Task 3.1) — verify they pass against shipped Group D code as-is
4. Modify `insertNewFilesInSortedOrder` to take `algorithm` parameter and branch (Task 1)
5. Update caller `applyCachedSortOrder` to pass `cachedData.algorithm` (Task 1)
6. Write `insertNewFilesInSortedOrder` CLIP-path tests + regression guard (Task 3.2)
7. Update CLIP toggle handler (Task 2)
8. Run `npm test`, `npm run lint`, `npm run format:check`; fix any issues
9. Manual test scenarios 1-6
10. Commit (one or more commits — each sub-step above is a clean commit boundary)

---

## File-by-file summary

| File | LoC delta (est) | Change |
|---|---|---|
| `media-viewer.js` | +50 / -10 | `calculateCosineDistance()`, `applyCachedSortOrder` arg, `insertNewFilesInSortedOrder` algorithm branch, CLIP toggle cleanup |
| `sorting-worker.js` | +2 / -1 | Extend `module.exports` |
| `tests/sorting-worker.test.js` | +60 | `describe('sortMediaBySimilarityClip', ...)` (4 tests) |
| `tests/media-viewer-utils.test.js` | +80 | `describe('insertNewFilesInSortedOrder (CLIP path)', ...)` (3 tests) |

**Untouched**: `main.js`, `preload.js`, `index.html`, `styles.css`, workers other than sorting-worker, ML pipeline, CLIP IPC handlers.

---

## BACKLOG follow-ups (after merge)

The 5 deferred items from BACKLOG remain valid follow-ups for future PRs:

- MST DRY refactor — `_sortMediaBySimilarityGeneric` shared helper between MST and CLIP variants (BACKLOG line 62)
- CLIP success-toast file count — `sortedCount = sortedPaths.length` instead of `vectorCount` (BACKLOG line 69)
- `K_NEIGHBORS` → `kNeighbors` casing fix in `sortMediaBySimilarityClip` (BACKLOG line 70)
- `calculateCosineDistance([], [])` empty-array defensive guard (BACKLOG line 71)
- `.sort_cache_clip.json` doc references — fix in spec + CLAUDE.md (BACKLOG line 63)
