# PR #33 Hygiene + Integration Tests — Design

**Date**: 2026-05-21
**Status**: Draft (pre-implementation)
**WEEKLY.md row**: Wednesday, May 13 (caught up)
**Groups**: C (PR #33 Defensive Follow-ups, 4 SP) + D (Integration Test Pattern, 3 SP)
**Total**: ~7 SP

---

## 1. Goals & Scope

### Goal
Land four PR #33 review follow-ups in a single PR — three defensive code hardenings around the CLIP toggle/sort paths, and one process-level integration test pattern.

### Why this PR exists
PR #33 shipped with a critical algorithm-threading bug (`cachedData.algorithm` was always `undefined`, making the CLIP cache-hit branch unreachable). The fix landed in commit `e1b5fad`, but the multi-agent code review surfaced four follow-up items worth closing now. Three are defensive hygiene fixes that protect adjacent code paths from analogous bugs; one is a process-level integration test pattern designed to catch the *next* wiring bug between leaf-tested methods.

### In scope (~7 SP)
1. **Clear `this.clipUnloadTimer` in CLIP toggle-off handler** (1 SP)
2. **Explicit `try/catch` around `await this.deleteSortCache('clip')`** in toggle handler (1 SP)
3. **Per-file abort check in both branches of `insertNewFilesInSortedOrder`** (2 SP, outer-loop only)
4. **Fixture-driven Vitest integration test** covering both cache-hit sort branches (3 SP)

### Out of scope (deferred)
- **Event-loop yielding** inside `insertNewFilesInSortedOrder` (BACKLOG architectural note — wait for observed UI freeze)
- **Inner-loop abort check** (only outer per-file iteration; inner is hot path)
- **True Playwright E2E** for cache-hit sort path (fixture-driven Vitest sufficient for algorithm-threading bug class)
- **Renaming `deleteMlModelCache` / adding `deleteFile` IPC** (separate BACKLOG item)

---

## 2. Architecture & Touch Points

### Modified files

| File | Lines (approx) | What changes |
|------|----------------|--------------|
| `media-viewer.js:1748-1768` | +~10 LoC | Toggle-off handler: clear `clipUnloadTimer` before cleanup; wrap `deleteSortCache('clip')` in try/catch |
| `media-viewer.js:5125, 5174` | +~6 LoC | Abort check at top of outer for-loop in both CLIP and hash branches of `insertNewFilesInSortedOrder` |

### New files

| File | Purpose |
|------|---------|
| `tests/integration/cached-sort-path.test.js` | Fixture-driven integration test wiring real `applyCachedSortOrder` → real `insertNewFilesInSortedOrder` call graph |

### No changes to
- `main.js`, `preload.js` — no new IPC
- `index.html`, `styles.css` — no UI changes
- `sorting-worker.js` — cache-hit path bypasses the worker entirely
- E2E tests — Vitest integration coverage is sufficient for algorithm-threading
- `vitest.config.js` — assumes default `tests/**/*.test.js` glob picks up `tests/integration/*.test.js` (verify in implementation; add explicit include if needed)

### Dependency / ordering invariant
- Items 1 & 2 share the same `if (!clipToggle.checked)` block — one code edit window.
- Item 3 is independent.
- Item 4 lands after items 1-3 so the test exercises the post-fix call graph.

---

## 3. Implementation Details

### Item 1 & 2 — CLIP toggle-off handler hardening

**Current code** (`media-viewer.js:1753-1767`):

```js
if (!clipToggle.checked) {
    if (this.sortAlgorithm === 'clip') {
        this.sortAlgorithm = 'vptree';
        localStorage.setItem('sortAlgorithm', 'vptree');
        if (this.sortAlgorithmSelect) {
            this.sortAlgorithmSelect.value = 'vptree';
        }
    }
    await this.deleteSortCache('clip');
}
```

**Target code**:

```js
if (!clipToggle.checked) {
    // Cancel any pending 30s CLIP unload — Group E pattern (d65bfdd) requires
    // every code path that changes CLIP state to clear the timer first.
    if (this.clipUnloadTimer !== null) {
        clearTimeout(this.clipUnloadTimer);
        this.clipUnloadTimer = null;
    }

    if (this.sortAlgorithm === 'clip') {
        this.sortAlgorithm = 'vptree';
        localStorage.setItem('sortAlgorithm', 'vptree');
        if (this.sortAlgorithmSelect) {
            this.sortAlgorithmSelect.value = 'vptree';
        }
    }
    try {
        await this.deleteSortCache('clip');
    } catch (_e) {
        // Best-effort cleanup — deleteSortCache already shows a notification
        // on failure. Explicit catch makes the contract obvious to maintainers.
    }
}
```

**Why `clearTimeout` first**: keeps consistency with `startBackgroundFeatureExtraction` (`media-viewer.js:7009-7011`) which clears the timer at its start. Synchronous-cleanup-before-await ordering matches the rest of the handler.

**Race scenario closed**: extraction completes → 30s unload timer set → user disables CLIP → handler runs cleanup → stale timer remains → user re-enables CLIP and `initClipModel()` begins → stale timer fires `unloadClipModel` IPC mid-load. Today mitigated by `main.js` returning `{success:false, reason:'loading'}` (commit `e7d84d0`); this fix removes the race entirely at the renderer layer.

### Item 3 — Per-file abort check in `insertNewFilesInSortedOrder`

Two insertions, one per branch, both inside the outer `for` loop.

**CLIP branch** — at the start of the outer loop body (`media-viewer.js:5125`):

```js
for (let i = 0; i < newFiles.length; i++) {
    if (this.sortAbortController?.signal.aborted) {
        throw new Error('Sort aborted');
    }
    const newFile = newFiles[i];
    // ...existing body
}
```

**Hash branch** — same insertion at the outer loop at `media-viewer.js:5174`.

**Why outer-only**: matches the BACKLOG prescription. The inner `j` loop is the O(N·M) hot path; checking the abort flag there would add ~N·M property reads per sort. Outer-only delivers sub-millisecond cancel latency for typical batches (1-50 new files) without instrumenting the hot path.

**Why optional chaining**: `sortAbortController` is `null` between sorts (`media-viewer.js:4358`). `this.sortAbortController?.signal.aborted` correctly short-circuits to `undefined` (falsy) when no sort is active, so the check is safe to leave in place outside `handleSortBySimilarity` context.

**Error message**: `'Sort aborted'` matches the existing pattern at `media-viewer.js:4223` and `4254` in `handleSortBySimilarity` — keeps catch-block log/notification handling consistent.

**Invariant preserved**: `insertNewFilesInSortedOrder` only assigns `this.mediaFiles = result` AFTER the loop completes (`media-viewer.js:5242`). Throwing mid-loop leaves the original array untouched, so partial mutation is impossible.

### Item 4 — Integration test (`tests/integration/cached-sort-path.test.js`)

**Test philosophy**: exercise the *real* call graph between `applyCachedSortOrder` and `insertNewFilesInSortedOrder`. The PR #33 bug was a wiring bug — `cachedData.algorithm` was undefined at the boundary between these two methods — and unit tests of either method in isolation missed it because they stubbed the boundary. An integration test that uses BOTH real methods catches this class of bug.

**Pattern**: use the existing `extractAsyncMethod` helper from `tests/media-viewer-utils.test.js` to extract both methods; mock only the outermost boundary (`window.electronAPI.path.basename`); bind the extracted `insertNewFilesInSortedOrder` onto the ctx so `applyCachedSortOrder`'s `this.insertNewFilesInSortedOrder(...)` dispatches to the real implementation.

**Three test cases**:

```js
describe('cache-hit sort path — algorithm threading (integration)', () => {
    let applyCachedSortOrder;
    let insertNewFilesInSortedOrder;

    beforeEach(() => {
        applyCachedSortOrder = extractAsyncMethod('applyCachedSortOrder');
        insertNewFilesInSortedOrder = extractAsyncMethod('insertNewFilesInSortedOrder');
        globalThis.window = {
            electronAPI: {
                path: { basename: async (p) => p.split('/').pop() },
            },
        };
    });

    afterEach(() => {
        delete globalThis.window;
    });

    function makeCtx({ mediaFiles, clipCache = new Map(), perceptualHashes = new Map() }) {
        return {
            mediaFiles,
            clipCache,
            perceptualHashes,
            sortAbortController: null,
            insertNewFilesInSortedOrder,
            calculateCosineDistance(a, b) { /* inline impl — see note below */ },
            calculateHammingDistance(a, b) { /* inline impl */ },
            computePerceptualHash: vi.fn(),
            updateProgressNotification: vi.fn(),
        };
    }

    it('CLIP cache entry routes through CLIP branch and uses cosine distance', async () => {
        // mediaFiles: 2 cached + 1 new; clipCache populated for all 3
        // assert: result order reflects cosine-distance-based insertion (new file inserted between most-similar neighbors)
        // assert: ctx.computePerceptualHash NOT called (hash branch not taken)
    });

    it('VPTree cache entry routes through hash branch and uses Hamming distance', async () => {
        // mediaFiles: 2 cached + 1 new; perceptualHashes populated; clipCache empty
        // assert: result order reflects Hamming-based insertion
        // assert: ctx.computePerceptualHash NOT called (hash already cached for new file)
        //         — confirms hash branch taken without re-extraction
    });

    it('Old cache entry without algorithm field falls through to Hamming', async () => {
        // cachedData = { sortedPaths: [...] }  (no algorithm field — pre-PR#33 format)
        // applyCachedSortOrder called with algorithm=undefined
        // assert: hash branch taken, NOT crash; safe fallback for pre-existing user caches
    });
});
```

**Inline distance implementations**: `makeCtx` provides `calculateCosineDistance` and `calculateHammingDistance` inline because the real methods are class methods on MediaViewer and aren't independently importable. Use the same implementations already inlined in other tests (e.g., the existing `insertNewFilesInSortedOrder (algorithm-aware)` describe block in `media-viewer-utils.test.js`).

**`extractAsyncMethod` helper**: duplicate the helper definition into the new integration test file with a comment pointing to its source in `tests/media-viewer-utils.test.js`. Rationale: this codebase doesn't have a shared test-helper module (each `.test.js` defines its own utilities at top of file), and importing across `.test.js` files is non-idiomatic. The helper is ~15 LoC; duplication is the lower-friction choice and matches existing conventions. If the integration test pattern expands to more files later, extract to `tests/helpers/extract-method.js` then.

**Fixture vector design**: use orthogonal vs. parallel unit vectors (e.g., `[1, 0, 0]` vs. `[0, 1, 0]` vs. `[0.9, 0.1, 0]` after normalization) so cosine-distance ordering is deterministic with clear separation — no floating-point tie-breaking ambiguity. Vector dimensions in fixtures can be smaller than the real 512 to keep the test compact; the algorithm logic doesn't depend on dimensionality.

---

## 4. Testing & Verification

### Unit tests
- 2 new tests in `tests/media-viewer-utils.test.js` (abort check, one per branch of `insertNewFilesInSortedOrder`)
- 3 new tests in `tests/integration/cached-sort-path.test.js` (CLIP routing, hash routing, missing-algorithm fallback)
- 190 → 195 total unit tests

### Existing tests touched
- Zero. The 3 toggle-handler edits and 2 abort-check edits don't break any existing assertions.
- The existing `applyCachedSortOrder (algorithm threading)` and `insertNewFilesInSortedOrder (algorithm-aware)` describe blocks in `tests/media-viewer-utils.test.js` continue passing unchanged — they stub their downstream calls and don't exercise the wiring under test in the new integration block.

### E2E tests
- Not modified. The toggle-off and abort behaviors are exercised by existing flows; no new E2E coverage warranted.
- Per CLAUDE.md DONE.md convention, E2E line in changelog will read: `"39/39 E2E tests pass (no new E2E — fixes covered by integration tests)"`.

### Verification checklist before PR
1. `npm test` — 193/193 pass
2. `npm run test:e2e` — 39/39 pass (no regression from abort-check edits in renderer hot path)
3. `npm run lint` — clean
4. Confirm `vitest.config.js` includes `tests/integration/**/*.test.js` (add explicit include if default glob misses it)

### Manual smoke test (~5 min)
1. Load folder; enable CLIP in Settings (F1); wait for extraction
2. Click Sort by Similarity (CLIP algorithm) → success
3. Open Settings, disable CLIP toggle → no console errors; dropdown reverts to VPTree synchronously; `.sort_cache.json` shows no `clip` key
4. Re-enable CLIP; start a similarity sort with new files present; click Cancel mid-sort → sort aborts within one new-file iteration (visible if folder has 50+ new files vs. 1000-file cache)

### Risk assessment

| Risk | Mitigation |
|------|------------|
| Aborting mid-insertion leaves `this.mediaFiles` partially mutated | None needed — `mediaFiles` assignment is post-loop (L5242). Throwing from inside the loop preserves the original array. |
| `clearTimeout(null)` if timer never set | Guarded by `if (this.clipUnloadTimer !== null)` — same pattern as existing call site at L7009. |
| Integration test brittle to method renames | Acceptable — `extractAsyncMethod` is regex-based; a rename in `media-viewer.js` requires updating the test argument string. This is the trade-off for testing real call graphs in a codebase without a module system in the renderer. |
| Fixture cosine distance produces non-deterministic order due to floating-point ties | Use orthogonal/parallel unit vectors with clear distance separation — no tie ambiguity. |
| `try/catch` around `deleteSortCache` swallows a real bug | `deleteSortCache` already has its own try/catch (`media-viewer.js:5037-5066`) that logs and notifies. Outer catch is hygiene; inner already handles correctness. |

### Documentation updates after merge
- `CLAUDE.md`: update existing "Active gotchas" entries — `clipUnloadTimer` toggle-off gap and `insertNewFilesInSortedOrder` no-abort-check gap — change wording from "missing" / "BACKLOG" to "now guarded".
- `docs/planning/DONE.md`: new entry with unit/E2E test counts per the convention (195/195 unit, 39/39 E2E).
- `docs/planning/BACKLOG.md`: mark 4 items closed:
  - 3 PR #33 sub-threshold findings (2026-05-05 section)
  - 1 "Process: end-to-end integration tests for cache-hit sort paths" item
- `docs/README.md`: index this new spec under the Design Specs table.
- `docs/planning/WEEKLY.md`: flip the four `- [ ]` to `- [x]` under "Wednesday, May 13".
- Archive this plan to `docs/archive/plans/` after merge (apply pre-archive checklist: flip all checkboxes, add `Status: Complete`, append to `docs/README.md` Archived Plans table).

---

## 5. Open Questions

None — all decisions resolved during brainstorm.

---

## 6. References
- PR #33: `feature/clip-sort-followups` (merged 2026-05-05, commit `e1b5fad` for the algorithm-threading fix)
- BACKLOG items being closed: see `docs/planning/BACKLOG.md` 2026-05-05 section (PR #33 Code Review)
- Related gotcha docs in `CLAUDE.md`: `clipUnloadTimer`, `insertNewFilesInSortedOrder`, Group E resource management pattern (commit `d65bfdd`)
