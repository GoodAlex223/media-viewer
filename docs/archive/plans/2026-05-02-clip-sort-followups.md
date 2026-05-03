# CLIP Sort Follow-ups Implementation Plan

**Status: Complete** — shipped on `feature/clip-sort-followups` 2026-05-03 (13 commits 779f630..ba7f2bc + closeout). 167/167 unit tests pass, 39/39 E2E pass, final code review approved with 3 sub-threshold minors (M1+M3 polish landed inline as commit 80ac67d; M2 left as cosmetic).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land three CLIP-similarity-sorting follow-ups from Group D's BACKLOG: (1) make `insertNewFilesInSortedOrder` algorithm-aware so CLIP-cached sorts use cosine distance for new-file placement; (2) clean up stale `'clip'` sort cache and revert `sortAlgorithm` when the user disables CLIP in Settings (F1); (3) add unit tests for `sortMediaBySimilarityClip` plus regression coverage for the algorithm-aware insertion.

**Architecture:** Two surgical changes in `media-viewer.js` (CLIP toggle handler at line ~1715, `insertNewFilesInSortedOrder` at line ~5045) plus one helper method (`calculateCosineDistance`). Tests follow existing patterns: characterization tests for the shipped `sortMediaBySimilarityClip` in `tests/sorting-worker.test.js`, and `extractMethod`-pattern tests for `insertNewFilesInSortedOrder` in `tests/media-viewer-utils.test.js` (with a small extension to support async methods).

**Tech Stack:** Electron 30+, Vitest 4, ESLint flat config, CommonJS workers, browser globals in renderer (no bundler).

**Spec:** `docs/superpowers/specs/2026-05-02-clip-sort-followups-design.md`

**Branch:** `feature/clip-sort-followups` (already created, currently checked out)

**Baseline:** 160/160 unit tests pass on main (verified via pre-commit hook on commit `779f630`).

---

## File Structure

| File | Role | Change type |
|---|---|---|
| `sorting-worker.js` | Web Worker; sorting algorithms incl. `sortMediaBySimilarityClip` | Modify (one line: extend `module.exports`) |
| `media-viewer.js` | Renderer; `MediaViewer` class | Modify (4 surgical edits: new method, caller, function body, toggle handler) |
| `tests/sorting-worker.test.js` | Vitest unit tests for the worker | Modify (extend import + new `describe` block) |
| `tests/media-viewer-utils.test.js` | Vitest unit tests for MediaViewer methods | Modify (add `extractAsyncMethod` helper + new `describe` block) |

**Untouched**: `main.js`, `preload.js`, `index.html`, `styles.css`, all other workers, all E2E tests.

---

## Task 1: Extend `sorting-worker.js` exports

**Files:**
- Modify: `sorting-worker.js:756-758`

**Why first**: this is a one-line prerequisite. Without it, Task 2's test cannot import `sortMediaBySimilarityClip`. Standalone change, easy commit.

- [x] **Step 1: Read current exports**

Read `sorting-worker.js:755-758`. Current line 757:

```js
module.exports = { MinHeap, VPTree, calculateHammingDistance, calculateCosineDistance };
```

- [x] **Step 2: Extend the export list**

Replace line 757 with:

```js
module.exports = {
    MinHeap,
    VPTree,
    calculateHammingDistance,
    calculateCosineDistance,
    sortMediaBySimilarityClip,
    sortMediaBySimilarityMST,
};
```

(Adding `sortMediaBySimilarityMST` is a freebie — costs nothing and unblocks future MST tests. We do not write MST tests in this PR.)

- [x] **Step 3: Run tests to confirm no regression**

Run: `npm test`
Expected: `7 passed (160)` — same as baseline. The added exports don't change runtime behavior; the worker's own `onmessage` handler still calls these functions by their bare names.

- [x] **Step 4: Commit**

```bash
git add sorting-worker.js
git commit -m "test(sorting-worker): export sortMediaBySimilarityClip + MST for unit tests"
```

---

## Task 2: Add `sortMediaBySimilarityClip` characterization tests

**Files:**
- Modify: `tests/sorting-worker.test.js` (extend import on line 8, add new `describe` block at end)

These are characterization tests: the function already ships in main and behaves correctly. The tests document its current behavior and serve as a regression guard for the future MST DRY refactor (which will share code between `sortMediaBySimilarityMST` and `sortMediaBySimilarityClip`).

- [x] **Step 1: Extend the destructured import (line 8)**

Replace the existing line:

```js
const { MinHeap, VPTree, calculateHammingDistance, calculateCosineDistance } = require('../sorting-worker');
```

with:

```js
const {
    MinHeap,
    VPTree,
    calculateHammingDistance,
    calculateCosineDistance,
    sortMediaBySimilarityClip,
} = require('../sorting-worker');
```

- [x] **Step 2: Append new `describe` block at the end of the file**

After the closing brace of the last existing `describe` block, add:

```js
describe('sortMediaBySimilarityClip', () => {
    // Reset abortFlag between tests by sending a startSort-equivalent message.
    // self.onmessage is assigned by sorting-worker.js during require().
    // Direct flag access isn't possible (module-private), so we toggle via the message handler.
    function resetAbort() {
        // A noop-shaped startSort message resets abortFlag to false then errors out
        // before the actual sort runs. We intercept by catching.
        try {
            globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
        } catch (_e) {
            // expected — switch falls through to default and throws or returns;
            // either way abortFlag has been reset by the case-prefix code at line 770.
        }
    }

    it('orders 3 files by cosine similarity (MST chain)', () => {
        resetAbort();
        const files = [
            { path: '/a.png' }, // close to b
            { path: '/b.png' }, // close to a, far from c
            { path: '/c.png' }, // orthogonal to a/b
        ];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            '/b.png': [0.99, 0.14, 0, 0], // cosine distance ~0.01 to a
            '/c.png': [0, 1, 0, 0], // cosine distance ~1.0 to a, ~1.0 to b
        };
        const result = sortMediaBySimilarityClip(files, clipVectors, 0);
        // Result is array of paths. Start file (currentIndex=0 -> /a.png) is first.
        // MST connects a-b (closest), then attaches c via b (or a; both ~1.0).
        expect(result[0]).toBe('/a.png');
        expect(result).toContain('/b.png');
        expect(result).toContain('/c.png');
        expect(result).toHaveLength(3);
        // a's neighbor in MST is b (cheapest edge), so b should appear before c
        const idxB = result.indexOf('/b.png');
        const idxC = result.indexOf('/c.png');
        expect(idxB).toBeLessThan(idxC);
    });

    it('appends files without CLIP vectors at the end', () => {
        resetAbort();
        const files = [{ path: '/a.png' }, { path: '/b.png' }, { path: '/no-vec.png' }];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            '/b.png': [0.99, 0.14, 0, 0],
            // /no-vec.png deliberately absent
        };
        const result = sortMediaBySimilarityClip(files, clipVectors, 0);
        expect(result).toHaveLength(3);
        expect(result[result.length - 1]).toBe('/no-vec.png');
    });

    it('throws "Sorting cancelled by user" when abort flag is set', () => {
        // Set abort flag via the worker's onmessage handler
        globalThis.self.onmessage({ data: { type: 'abort' } });
        const files = [
            { path: '/a.png' },
            { path: '/b.png' },
            { path: '/c.png' },
            { path: '/d.png' },
        ];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            '/b.png': [0.99, 0.14, 0, 0],
            '/c.png': [0.98, 0.2, 0, 0],
            '/d.png': [0, 1, 0, 0],
        };
        expect(() => sortMediaBySimilarityClip(files, clipVectors, 0)).toThrow('Sorting cancelled by user');
    });

    it('throws when fewer than 2 files have CLIP vectors', () => {
        resetAbort();
        const files = [{ path: '/a.png' }, { path: '/b.png' }];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            // /b.png absent → only 1 file with vector
        };
        expect(() => sortMediaBySimilarityClip(files, clipVectors, 0)).toThrow(
            /Only 1 files have CLIP embeddings/
        );
    });
});
```

- [x] **Step 3: Run only the new tests to verify they pass**

Run: `npx vitest run tests/sorting-worker.test.js -t sortMediaBySimilarityClip`
Expected: `4 passed`

If the abort test fails because abortFlag persists between tests, adjust `resetAbort()` to use a different reset strategy (e.g., re-`require` the module — though `require.cache` may make that tricky in ESM-via-createRequire context). Document what worked.

- [x] **Step 4: Run full unit test suite**

Run: `npm test`
Expected: `7 passed (164)` — was 160, now 164 with 4 new tests added. **All previously-passing tests must still pass.**

- [x] **Step 5: Commit**

```bash
git add tests/sorting-worker.test.js
git commit -m "test(sorting-worker): add sortMediaBySimilarityClip characterization tests"
```

---

## Task 3: Add `calculateCosineDistance` method to MediaViewer

**Files:**
- Modify: `media-viewer.js` (insert new method after `calculateHammingDistance` at line ~4458, the line after the closing `}` of `calculateHammingDistance`)

This is a trivial mirror of the worker version (`sorting-worker.js:278`). It is duplicated by design — the codebase already duplicates `calculateHammingDistance` between worker and renderer. Shared-utility extraction is tracked in BACKLOG.

No dedicated unit test: trivial wrapper of an algorithm that's already tested. The new method is exercised indirectly by Task 5's CLIP-path tests via the mock `ctx`.

- [x] **Step 1: Locate the insertion point**

Read `media-viewer.js:4446-4465`. Find the closing brace of `calculateHammingDistance(hash1, hash2) {...}` (around line 4458, ends with `}` then a blank line).

- [x] **Step 2: Insert the new method**

Add the following method immediately after the closing `}` of `calculateHammingDistance`:

```js

    calculateCosineDistance(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 1;
        let dot = 0;
        for (let i = 0; i < vec1.length; i++) dot += vec1[i] * vec2[i];
        return 1 - dot;
    }
```

(Leading blank line + 4-space indent matches surrounding style.)

- [x] **Step 3: Verify lint and format are clean**

Run: `npm run lint`
Expected: no errors.

Run: `npm run format:check`
Expected: no errors.

- [x] **Step 4: Run unit tests to confirm no regression**

Run: `npm test`
Expected: `7 passed (164)`. The new method is unused so far; tests must remain green.

- [x] **Step 5: Commit**

```bash
git add media-viewer.js
git commit -m "feat(media-viewer): add calculateCosineDistance method for renderer-side scoring"
```

---

## Task 4: Add `extractAsyncMethod` helper for testing async MediaViewer methods

**Files:**
- Modify: `tests/media-viewer-utils.test.js` (extend `extractMethod` helper area, lines ~14-47)

`insertNewFilesInSortedOrder` is `async`. The existing `extractMethod()` uses `new Function(params, body)` which produces a regular (non-async) function — calling `await` inside its body is a syntax error. We need an async-aware extractor.

- [x] **Step 1: Add `extractAsyncMethod` next to `extractMethod`**

After the existing `extractMethod` function (closing brace around line 47), add:

```js
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractAsyncMethod(methodName) {
    // Match "async methodName(params) {" pattern for async class methods
    const regex = new RegExp(`^\\s{4}async\\s+${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) {
        throw new Error(`Could not find async method: ${methodName}`);
    }

    const startIndex = match.index;
    let braceCount = 0;
    let methodEnd = -1;
    const searchStart = startIndex + match[0].length - 1;

    for (let i = searchStart; i < source.length; i++) {
        if (source[i] === '{') braceCount++;
        if (source[i] === '}') braceCount--;
        if (braceCount === 0) {
            methodEnd = i + 1;
            break;
        }
    }

    const methodBody = source.substring(searchStart + 1, methodEnd - 1);
    const params = match[1];

    return new AsyncFunction(params, methodBody);
}
```

- [x] **Step 2: Run the existing test suite to verify no regression**

Run: `npm test`
Expected: `7 passed (164)`. The new helper is defined but unused; existing tests must still pass.

- [x] **Step 3: Commit**

```bash
git add tests/media-viewer-utils.test.js
git commit -m "test(media-viewer-utils): add extractAsyncMethod helper for async methods"
```

---

## Task 5: Write failing tests for `insertNewFilesInSortedOrder` CLIP path

**Files:**
- Modify: `tests/media-viewer-utils.test.js` (add new method extraction + new `describe` block at end)

These tests will FAIL initially because `insertNewFilesInSortedOrder` does not yet take an `algorithm` parameter and uses Hamming logic regardless of algorithm. They go green in Task 6.

- [x] **Step 1: Extract the method**

Locate the line after the existing `extractMethod` calls (currently `tests/media-viewer-utils.test.js:54`). Add:

```js
const insertNewFilesInSortedOrder = extractAsyncMethod('insertNewFilesInSortedOrder');
```

- [x] **Step 2: Append new `describe` block at the end of the file**

After the closing brace of the last existing `describe` block, add:

```js
describe('insertNewFilesInSortedOrder (algorithm-aware)', () => {
    function makeCtx(overrides = {}) {
        return {
            mediaFiles: [],
            clipCache: new Map(),
            perceptualHashes: new Map(),
            calculateHammingDistance(h1, h2) {
                if (!h1 || !h2 || h1.length !== h2.length) return Infinity;
                let d = 0;
                for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) d++;
                return d;
            },
            calculateCosineDistance(v1, v2) {
                if (!v1 || !v2 || v1.length !== v2.length) return 1;
                let dot = 0;
                for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
                return 1 - dot;
            },
            async computePerceptualHash(_path) {
                throw new Error('computePerceptualHash should not be called in CLIP path');
            },
            updateProgressNotification() {},
            ...overrides,
        };
    }

    it('CLIP path: inserts new file at cosine-nearest position when vector exists', async () => {
        // Cached order: [a, c] where a~[1,0,0,0], c~[0,1,0,0]
        // New file b with vector [0.99, 0.14, 0, 0] — very close to a, far from c
        // Expected: b inserted at index 1 (between a and c, adjacent to a)
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, c],
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/b.png', new Float32Array([0.99, 0.14, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
            ]),
        });

        await insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'clip');

        // Expect b between a and c, at index 1 (adjacent to its nearest neighbor a)
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/b.png', '/c.png']);
    });

    it('CLIP path: appends new file at end when no CLIP vector', async () => {
        const a = { path: '/a.png' };
        const c = { path: '/c.png' };
        const noVec = { path: '/no-vec.png' };
        const ctx = makeCtx({
            mediaFiles: [a, c],
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
                // /no-vec.png deliberately absent
            ]),
        });

        await insertNewFilesInSortedOrder.call(ctx, [a, c], [noVec], 'clip');

        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png', '/no-vec.png']);
    });

    it('hash path: regression guard — algorithm !== "clip" still uses Hamming', async () => {
        // Cached order: [a, c] with hashes — a="0000", c="1111"
        // New file b with hash "0001" — Hamming 1 from a, Hamming 3 from c
        // Expected: b inserted at index 1 (adjacent to a)
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, c],
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
            // computePerceptualHash should not be called when hash already cached
        });

        await insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'vptree');

        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/b.png', '/c.png']);
    });
});
```

- [x] **Step 3: Run new tests to verify they FAIL with the expected reason**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "algorithm-aware"`
Expected: tests fail. Specifically:
- The first two CLIP tests fail because `insertNewFilesInSortedOrder` ignores the `algorithm` param and uses Hamming on `perceptualHashes` (which is empty for these tests, so all new files get `Infinity` and end up at end).
- The third "hash path" test may PASS coincidentally because passing `'vptree'` doesn't trigger any new branch (the function uses Hamming today). That's expected — it serves as the regression guard for Task 6.

Confirm at least the first two tests fail with assertion errors (not syntax errors).

- [x] **Step 4: Commit the failing tests**

```bash
git add tests/media-viewer-utils.test.js
git commit -m "test(insertNewFiles): add CLIP-path tests (red — algorithm-aware unimplemented)"
```

(Committing red tests is intentional TDD — gives a clean rollback boundary if Task 6 needs rework.)

---

## Task 6: Make `insertNewFilesInSortedOrder` algorithm-aware

**Files:**
- Modify: `media-viewer.js:5045-5123` (function body, signature, body branching)

- [x] **Step 1: Read the current function**

Read `media-viewer.js:5045-5123`. Confirm signature is currently `async insertNewFilesInSortedOrder(sortedFiles, newFiles)`.

- [x] **Step 2: Replace the function with algorithm-aware version**

Replace the entire function body (from line 5045 up to and including the closing `}` on line ~5123) with:

```js
    async insertNewFilesInSortedOrder(sortedFiles, newFiles, algorithm) {
        const insertions = [];

        if (algorithm === 'clip') {
            // CLIP path: score by cosine distance over clipCache vectors.
            // Files without CLIP vectors are end-appended (matches sortMediaBySimilarityClip's
            // first-time-sort fallback). No on-demand CLIP extraction here — the cache-hit
            // path is expected to be near-instant; firing main-process inference would
            // add ~100-200ms per missing file via IPC.
            for (let i = 0; i < newFiles.length; i++) {
                const newFile = newFiles[i];
                const newVec = this.clipCache.get(newFile.path);

                if (!newVec) {
                    insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                    continue;
                }

                let bestIndex = sortedFiles.length;
                let bestScore = Infinity;

                for (let j = 0; j <= sortedFiles.length; j++) {
                    let score = 0;
                    let count = 0;

                    if (j > 0) {
                        const prevVec = this.clipCache.get(sortedFiles[j - 1].path);
                        if (prevVec) {
                            score += this.calculateCosineDistance(newVec, prevVec);
                            count++;
                        }
                    }

                    if (j < sortedFiles.length) {
                        const nextVec = this.clipCache.get(sortedFiles[j].path);
                        if (nextVec) {
                            score += this.calculateCosineDistance(newVec, nextVec);
                            count++;
                        }
                    }

                    if (count > 0) {
                        score = score / count;
                        if (score < bestScore) {
                            bestScore = score;
                            bestIndex = j;
                        }
                    }
                }

                insertions.push({ file: newFile, index: bestIndex, distance: bestScore });

                if ((i + 1) % 10 === 0 || i === newFiles.length - 1) {
                    this.updateProgressNotification(`🔄 Processing new files: ${i + 1}/${newFiles.length}`);
                }
            }
        } else {
            // Hash path (vptree, mst, simple, or undefined): unchanged behavior.
            for (let i = 0; i < newFiles.length; i++) {
                const newFile = newFiles[i];

                if (!this.perceptualHashes.has(newFile.path)) {
                    try {
                        const hash = await this.computePerceptualHash(newFile.path);
                        this.perceptualHashes.set(newFile.path, hash);
                    } catch (error) {
                        console.warn(`Failed to compute hash for ${newFile.path}:`, error);
                        insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                        continue;
                    }
                }

                const newHash = this.perceptualHashes.get(newFile.path);
                if (!newHash) {
                    insertions.push({ file: newFile, index: sortedFiles.length, distance: Infinity });
                    continue;
                }

                let bestIndex = sortedFiles.length;
                let bestScore = Infinity;

                for (let j = 0; j <= sortedFiles.length; j++) {
                    let score = 0;
                    let count = 0;

                    if (j > 0) {
                        const prevHash = this.perceptualHashes.get(sortedFiles[j - 1].path);
                        if (prevHash) {
                            score += this.calculateHammingDistance(newHash, prevHash);
                            count++;
                        }
                    }

                    if (j < sortedFiles.length) {
                        const nextHash = this.perceptualHashes.get(sortedFiles[j].path);
                        if (nextHash) {
                            score += this.calculateHammingDistance(newHash, nextHash);
                            count++;
                        }
                    }

                    if (count > 0) {
                        score = score / count;
                        if (score < bestScore) {
                            bestScore = score;
                            bestIndex = j;
                        }
                    }
                }

                insertions.push({ file: newFile, index: bestIndex, distance: bestScore });

                if ((i + 1) % 10 === 0 || i === newFiles.length - 1) {
                    this.updateProgressNotification(`🔄 Processing new files: ${i + 1}/${newFiles.length}`);
                }
            }
        }

        // Sort insertions by index descending so we can insert without affecting indices
        insertions.sort((a, b) => b.index - a.index);

        const result = [...sortedFiles];
        for (const { file, index } of insertions) {
            result.splice(index, 0, file);
        }

        this.mediaFiles = result;
    }
```

The hash branch's body is **byte-identical** to the pre-change function (line 5046-5122), just wrapped in an `else`. Diff-review must confirm this.

- [x] **Step 3: Run only the CLIP-path tests to verify they now pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "algorithm-aware"`
Expected: all 3 tests pass (CLIP path tests now correctly route through cosine; hash regression guard still passes).

- [x] **Step 4: Run the full unit suite**

Run: `npm test`
Expected: `7 passed (167)` — was 164, now 167 with 3 new CLIP-path tests passing.

- [x] **Step 5: Run lint and format**

Run: `npm run lint`
Expected: no errors.

Run: `npm run format:check`
Expected: no errors.

- [x] **Step 6: Commit**

Tests were already committed red in Task 5; this commit ships only the implementation:

```bash
git add media-viewer.js
git commit -m "fix(insertNewFiles): branch on algorithm — use cosine for CLIP, Hamming otherwise"
```

---

## Task 7: Update `applyCachedSortOrder` to pass algorithm down

**Files:**
- Modify: `media-viewer.js:5032`

- [x] **Step 1: Locate the call site**

Read `media-viewer.js:5028-5035`. Find the line:

```js
            await this.insertNewFilesInSortedOrder(cachedOrder, newFiles);
```

- [x] **Step 2: Pass `cachedData.algorithm`**

Replace the line with:

```js
            await this.insertNewFilesInSortedOrder(cachedOrder, newFiles, cachedData.algorithm);
```

- [x] **Step 3: Verify lint and format**

Run: `npm run lint`
Expected: no errors.

Run: `npm run format:check`
Expected: no errors.

- [x] **Step 4: Run unit tests**

Run: `npm test`
Expected: `7 passed (167)`.

- [x] **Step 5: Commit**

```bash
git add media-viewer.js
git commit -m "fix(applyCachedSortOrder): pass cached algorithm to new-file insertion"
```

---

## Task 8: CLIP toggle-off — clean up cache and revert sortAlgorithm

**Files:**
- Modify: `media-viewer.js:1715-1723` (CLIP toggle handler)

- [x] **Step 1: Read the current handler**

Read `media-viewer.js:1714-1724`. Current handler:

```js
        const clipToggle = document.getElementById('clipFeaturesToggle');
        if (clipToggle) {
            clipToggle.checked = this.enableClipFeatures;
            clipToggle.addEventListener('change', () => {
                this.enableClipFeatures = clipToggle.checked;
                localStorage.setItem('enableClipFeatures', String(clipToggle.checked));
                this.resetMlModel();
            });
        }
```

- [x] **Step 2: Replace with async cleanup version**

Replace lines 1714-1723 with:

```js
        const clipToggle = document.getElementById('clipFeaturesToggle');
        if (clipToggle) {
            clipToggle.checked = this.enableClipFeatures;
            clipToggle.addEventListener('change', async () => {
                this.enableClipFeatures = clipToggle.checked;
                localStorage.setItem('enableClipFeatures', String(clipToggle.checked));
                this.resetMlModel();

                if (!clipToggle.checked) {
                    // CLIP disabled: persisted 'clip' sort cache may now reference files
                    // without vectors or vectors from a model version that won't load again.
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
        }
```

- [x] **Step 3: Verify lint and format**

Run: `npm run lint`
Expected: no errors. ESLint may flag `async` listener if a rule disallows it — none currently configured per `eslint.config.mjs`, so should be clean.

Run: `npm run format:check`
Expected: no errors.

- [x] **Step 4: Run unit tests**

Run: `npm test`
Expected: `7 passed (167)`. No tests cover the toggle handler directly (manual test scenarios verify it).

- [x] **Step 5: Commit**

```bash
git add media-viewer.js
git commit -m "fix(clip-toggle): clean up sort cache + revert sortAlgorithm on disable"
```

---

## Task 9: Final verification

**Files:** none modified.

- [x] **Step 1: Run full unit suite from a clean state**

Run: `npm test`
Expected: `7 passed (167)`. Specifically:
- `tests/sorting-worker.test.js` — 34 tests (was 30, +4 from Task 2)
- `tests/media-viewer-utils.test.js` — 33 tests (was 30, +3 from Task 5)
- All other test files unchanged

- [x] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors, no warnings on touched files.

- [x] **Step 3: Run format check**

Run: `npm run format:check`
Expected: clean.

- [x] **Step 4: Run E2E suite to confirm no regression**

Run: `npm run test:e2e`
Expected: `39 passed` (matches main baseline). No new E2E tests added; this is a regression check only.

If E2E hangs or fails on Windows, see CLAUDE.md "Testing (E2E — Playwright)" section for known-issue handling. A clean baseline run takes ~3-5 minutes.

- [x] **Step 5: Manual test scenarios (per spec section "Manual test scenarios")**

Run the application: `npm start`

Run scenarios 1-6 from the spec. Document any deviation. Each scenario must pass:

1. **Algorithm-aware insertion (happy path)**: Open folder → wait for CLIP extraction → CLIP-sort → add 2 new files externally → re-open folder → new files placed near semantically similar neighbors, **not at end**.
2. **Algorithm-aware insertion (no-vector fallback)**: Same but new files added BEFORE extraction completes → they appear at end with info notification.
3. **Hash-sort regression guard (manual)**: Switch to MST → sort → add new files → re-open → new files placed by Hamming neighbors (visual similarity), not at end.
4. **CLIP toggle-off, no active CLIP sort**: User on `'mst'`, toggle CLIP off → `sortAlgorithm` still `'mst'`, dropdown unchanged. Inspect `.sort_cache.json` → `'clip'` key gone, `'mst'` key intact.
5. **CLIP toggle-off, active CLIP sort**: User on `'clip'`, toggle CLIP off → dropdown reverts to "VPTree", `localStorage.sortAlgorithm === 'vptree'`, `.sort_cache.json` `'clip'` key gone.
6. **CLIP re-enable after toggle-off**: After scenario 5, toggle back on → wait for extraction → manually pick CLIP from dropdown → sort → cache rebuilds fresh.

`.sort_cache.json` location: per-folder, alongside the rated media (same dir as `.feature_cache.json`). Inspect via OS file manager or `Get-Content`.

- [x] **Step 6: Final commit (if any cleanup needed)**

If manual scenarios surface bugs, fix them inline (do not skip — go back to the relevant Task and re-run). If all pass cleanly, no extra commit needed.

- [x] **Step 7: Push branch and open PR**

```bash
git push -u origin feature/clip-sort-followups
gh pr create --title "fix(clip-sort): algorithm-aware insertion + toggle-off cleanup" --body "$(cat <<'EOF'
## Summary

Three follow-ups from Group D's BACKLOG (lines 60-71):

- Fix `insertNewFilesInSortedOrder` to use cosine distance (not Hamming) when inserting new files into a CLIP-cached sort order. Previously, semantic ordering was silently corrupted for files added to a CLIP-sorted folder.
- Clean up persisted `'clip'` sort cache and revert `sortAlgorithm` to `'vptree'` when the user disables CLIP in Settings (F1). Previously, re-enabling CLIP loaded stale cache; the dropdown displayed CLIP while clicking Sort threw a confusing error.
- Add 7 new unit tests: 4 characterization tests for `sortMediaBySimilarityClip` (160 → 164) + 3 algorithm-aware tests for `insertNewFilesInSortedOrder` including a hash-path regression guard (164 → 167).

Spec: `docs/superpowers/specs/2026-05-02-clip-sort-followups-design.md`

## Test plan

- [x] `npm test` → 167/167 unit tests pass
- [x] `npm run lint` clean
- [x] `npm run format:check` clean
- [x] `npm run test:e2e` → 39/39 (unchanged from main)
- [x] Manual scenarios 1-6 pass (per spec)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run before final push)

- [x] **Spec coverage**: every numbered item in spec sections "Task 1", "Task 2", "Task 3", "Manual test scenarios", and "Verification plan" maps to a numbered Task above
- [x] **No placeholders**: grep the plan for `TBD|TODO|FIXME|placeholder|XXX` — should be zero matches
- [x] **Type consistency**: `algorithm` parameter name used consistently across Tasks 6, 7, and tests
- [x] **File paths**: all line references match current code (anchors checked: `media-viewer.js:1715`, `:4446`, `:5032`, `:5045`; `sorting-worker.js:757`)
- [x] **Commit boundaries**: 7-8 commits total (one per Task), each independently reviewable
- [x] **Test counts**: 160 baseline → 164 after Task 2 → 167 after Task 6, consistent throughout

---

## Post-merge follow-ups (BACKLOG, not in this plan)

These remain in `docs/planning/BACKLOG.md` for separate work:

- DRY MST extraction between `sortMediaBySimilarityMST` and `sortMediaBySimilarityClip` (line 62)
- CLIP success-toast wrong file count (line 69)
- `K_NEIGHBORS` casing (line 70)
- `calculateCosineDistance([], [])` empty-array guard (line 71)
- `.sort_cache_clip.json` doc references in spec/CLAUDE.md (line 63)
- E2E test for CLIP toggle-off behavior (out-of-scope per spec)
