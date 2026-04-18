# CLIP Similarity Sorting Implementation Plan

**Status**: Complete (2026-04-18)

**Completed commits** (on `feature/clip-similarity-sorting`):
- `9c7fefe` feat: add calculateCosineDistance for CLIP similarity sorting
- `e0d07dc` feat: add sortMediaBySimilarityClip MST algorithm for CLIP sorting
- `7757d40` feat: add CLIP (Semantic) option to sort algorithm dropdown
- `a538b22` feat: wire CLIP sorting into handleSortBySimilarity
- `e94ae70` fix: add pre-worker abort check to CLIP sort branch (addresses Task 4 review I1)

**Final verification**: 159/159 unit tests pass, lint clean, Prettier clean. Final code review: Approve with follow-ups (5 BACKLOG items captured, no blockers).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "CLIP (Semantic)" option to the existing sort algorithm dropdown that sorts files by CLIP cosine similarity using the MST algorithm.

**Architecture:** Reuse the existing VP-Tree + Prim's MST infrastructure in `sorting-worker.js` with a new cosine distance function. The renderer reads CLIP vectors from `this.clipCache` (already populated by background extraction) and passes them to the worker as plain arrays. Sort order caching piggybacks on the existing `saveSortCache/loadSortCache/deleteSortCache` infrastructure with `'clip'` as the algorithm key.

**Tech Stack:** Electron renderer + Web Worker (sorting-worker.js), Vitest unit tests.

**Spec:** [2026-04-16-clip-similarity-sorting-design.md](../specs/2026-04-16-clip-similarity-sorting-design.md)

---

## File Structure

### Files Created
- None

### Files Modified
- `sorting-worker.js` — Add `calculateCosineDistance()`, `sortMediaBySimilarityClip()`, `'clip'` case in message handler, update CJS export
- `media-viewer.js` — CLIP branch in `handleSortBySimilarity()` (skip hash computation, validate `enableClipFeatures`, collect CLIP vectors from `clipCache`, dispatch to worker), update `algorithmNames` map
- `index.html` — Add `<option value="clip">CLIP (Semantic)</option>` to `#sortAlgorithmSelect`
- `tests/sorting-worker.test.js` — Unit tests for `calculateCosineDistance` and CLIP sorting module export

---

## Task 1: Add calculateCosineDistance to sorting-worker.js

**Files:**
- Modify: `sorting-worker.js` (add function after `calculateHammingDistance`, update CJS export block)
- Test: `tests/sorting-worker.test.js` (add new `describe` block)

- [x] **Step 1: Update import in tests/sorting-worker.test.js**

Change line 8 to include `calculateCosineDistance`:

```js
const { MinHeap, VPTree, calculateHammingDistance, calculateCosineDistance } = require('../sorting-worker');
```

- [x] **Step 2: Write the failing tests**

Add this new `describe` block at the end of `tests/sorting-worker.test.js` (after the `calculateHammingDistance` describe block, before the closing of the file):

```js
describe('calculateCosineDistance', () => {
    it('returns 0 for identical unit-normalized vectors', () => {
        const vec = [1, 0, 0];
        expect(calculateCosineDistance(vec, vec)).toBe(0);
    });

    it('returns 1 for orthogonal unit vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [0, 1, 0];
        expect(calculateCosineDistance(vec1, vec2)).toBe(1);
    });

    it('returns 2 for opposite unit vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [-1, 0, 0];
        expect(calculateCosineDistance(vec1, vec2)).toBe(2);
    });

    it('computes 1 - dot product for unit-normalized vectors', () => {
        // Unit vectors at 60 degrees: dot = cos(60) = 0.5, distance = 0.5
        const vec1 = [1, 0];
        const vec2 = [0.5, Math.sqrt(3) / 2];
        const dist = calculateCosineDistance(vec1, vec2);
        expect(dist).toBeCloseTo(0.5, 5);
    });

    it('returns Infinity for null vec1', () => {
        expect(calculateCosineDistance(null, [1, 0, 0])).toBe(Infinity);
    });

    it('returns Infinity for null vec2', () => {
        expect(calculateCosineDistance([1, 0, 0], null)).toBe(Infinity);
    });

    it('returns Infinity for undefined vectors', () => {
        expect(calculateCosineDistance(undefined, undefined)).toBe(Infinity);
    });

    it('returns Infinity for mismatched lengths', () => {
        expect(calculateCosineDistance([1, 0, 0], [1, 0])).toBe(Infinity);
    });

    it('works with 512-dim vectors (CLIP shape)', () => {
        const vec1 = new Array(512).fill(0);
        vec1[0] = 1;
        const vec2 = new Array(512).fill(0);
        vec2[0] = 1;
        expect(calculateCosineDistance(vec1, vec2)).toBe(0);
    });
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/sorting-worker.test.js`
Expected: FAIL — cannot destructure `calculateCosineDistance` from module exports (all new tests fail).

- [x] **Step 4: Add calculateCosineDistance to sorting-worker.js**

Open `sorting-worker.js`. Find the `calculateHammingDistance` function (~line 260). Add this function directly after it:

```js
// Cosine distance for unit-normalized vectors (CLIP embeddings)
// Returns 1 - dot(a,b), range [0, 2]: 0 = identical, 1 = orthogonal, 2 = opposite
// Since CLIP vectors are unit-normalized by the extraction pipeline,
// the full cosine formula simplifies to 1 - dot(a,b).
function calculateCosineDistance(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
        return Infinity;
    }

    let dot = 0;
    for (let i = 0; i < vec1.length; i++) {
        dot += vec1[i] * vec2[i];
    }
    return 1 - dot;
}
```

- [x] **Step 5: Update the CJS export block**

Find the conditional CJS export at the bottom of `sorting-worker.js` (~line 579):

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MinHeap, VPTree, calculateHammingDistance };
}
```

Replace with:

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MinHeap, VPTree, calculateHammingDistance, calculateCosineDistance };
}
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/sorting-worker.test.js`
Expected: PASS — all 9 new `calculateCosineDistance` tests pass along with existing tests.

- [x] **Step 7: Commit**

```bash
git add sorting-worker.js tests/sorting-worker.test.js
git commit -m "feat: add calculateCosineDistance for CLIP similarity sorting

Adds cosine distance function for unit-normalized vectors (CLIP embeddings).
Returns 1 - dot(a,b), range [0, 2].

Includes 9 unit tests covering identical/orthogonal/opposite vectors,
null/undefined guards, mismatched lengths, and 512-dim CLIP shape."
```

---

## Task 2: Add sortMediaBySimilarityClip to sorting-worker.js

**Files:**
- Modify: `sorting-worker.js` (add function after `sortMediaBySimilarityMST`, add `'clip'` case in message handler)

- [x] **Step 1: Add sortMediaBySimilarityClip function**

Open `sorting-worker.js`. Find the end of `sortMediaBySimilarityMST` function (closing brace ~line 576). Add this new function directly after `sortMediaBySimilarityMST`, before the CJS export block:

```js
// MST-based sorting using CLIP cosine distance for semantic similarity
// Parallels sortMediaBySimilarityMST but uses cosine distance instead of Hamming
function sortMediaBySimilarityClip(mediaFiles, clipVectors, currentIndex) {
    const total = mediaFiles.length;

    updateProgress('🔄 Building VP-Tree index (CLIP)...', 0, total);

    const filesWithVectors = mediaFiles.filter((f) => clipVectors[f.path]);
    if (filesWithVectors.length < 2) {
        throw new Error(
            `Only ${filesWithVectors.length} files have CLIP embeddings. Need at least 2 to sort.`
        );
    }

    const distanceFunc = (file1, file2) => {
        return calculateCosineDistance(clipVectors[file1.path], clipVectors[file2.path]);
    };

    const vpTree = new VPTree(filesWithVectors, distanceFunc);

    updateProgress('🔄 Building similarity graph (CLIP)...', 0, total);

    // Dynamic K based on dataset size
    const N = filesWithVectors.length;
    const K_NEIGHBORS = Math.min(N - 1, Math.max(20, Math.floor(Math.sqrt(N) * 10)));

    const graph = new Map();

    for (let i = 0; i < filesWithVectors.length; i++) {
        if (abortFlag) {
            throw new Error('Sorting cancelled by user');
        }

        const file = filesWithVectors[i];
        const neighbors = vpTree.findKNearest(file, K_NEIGHBORS + 1, new Set([file]));

        graph.set(
            file,
            neighbors.map(({ item, distance }) => ({
                neighbor: item,
                distance,
            }))
        );

        if ((i + 1) % 100 === 0) {
            updateProgress(
                `🔄 Building graph: ${i + 1}/${filesWithVectors.length}`,
                i + 1,
                filesWithVectors.length
            );
        }
    }

    updateProgress('🔄 Computing MST (CLIP)...', 0, total);

    // Prim's algorithm for MST
    const mst = new Map();
    const visited = new Set();
    const pq = new MinHeap();

    // Start with currently viewed file
    let startFile = filesWithVectors[0];
    const currentFile = mediaFiles[currentIndex];
    if (currentFile && clipVectors[currentFile.path]) {
        const found = filesWithVectors.find((f) => f.path === currentFile.path);
        if (found) startFile = found;
    }
    visited.add(startFile);
    mst.set(startFile, []);

    const startNeighbors = graph.get(startFile) || [];
    for (const { neighbor, distance } of startNeighbors) {
        pq.push({ from: startFile, to: neighbor, distance });
    }

    while (visited.size < filesWithVectors.length && !pq.isEmpty()) {
        if (abortFlag) {
            throw new Error('Sorting cancelled by user');
        }

        const edge = pq.pop();

        if (!edge || visited.has(edge.to)) continue;

        visited.add(edge.to);
        if (!mst.has(edge.from)) mst.set(edge.from, []);
        if (!mst.has(edge.to)) mst.set(edge.to, []);
        mst.get(edge.from).push(edge.to);
        mst.get(edge.to).push(edge.from);

        const neighbors = graph.get(edge.to) || [];
        for (const { neighbor, distance } of neighbors) {
            if (!visited.has(neighbor)) {
                pq.push({ from: edge.to, to: neighbor, distance });
            }
        }

        if (visited.size % 100 === 0) {
            updateProgress(
                `🔄 MST progress: ${visited.size}/${filesWithVectors.length}`,
                visited.size,
                filesWithVectors.length
            );
        }
    }

    updateProgress('🔄 Traversing MST...', 0, total);

    // Greedy traversal of MST
    const sorted = [];
    const traversed = new Set();

    let current = startFile;
    traversed.add(current);
    sorted.push(current);

    while (sorted.length < filesWithVectors.length) {
        const neighbors = mst.get(current) || [];

        let nearestNeighbor = null;
        let minDistance = Infinity;

        for (const neighbor of neighbors) {
            if (!traversed.has(neighbor)) {
                const distance = distanceFunc(current, neighbor);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestNeighbor = neighbor;
                }
            }
        }

        if (nearestNeighbor) {
            traversed.add(nearestNeighbor);
            sorted.push(nearestNeighbor);
            current = nearestNeighbor;
        } else {
            let nearestNode = null;
            let minDist = Infinity;

            for (const file of filesWithVectors) {
                if (!traversed.has(file)) {
                    const dist = distanceFunc(current, file);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestNode = file;
                    }
                }
            }

            if (nearestNode) {
                traversed.add(nearestNode);
                sorted.push(nearestNode);
                current = nearestNode;
            } else {
                break;
            }
        }
    }

    // Add files without CLIP vectors at the end
    const filesWithoutVectors = mediaFiles.filter((f) => !clipVectors[f.path]);
    sorted.push(...filesWithoutVectors);

    return sorted.map((f) => f.path);
}
```

- [x] **Step 2: Add 'clip' case to message handler switch**

Find the message handler `switch (algorithm)` block (~line 599) in `sorting-worker.js`:

```js
switch (algorithm) {
    case 'vptree':
        sortedPaths = sortMediaBySimilarityVPTree(mediaFiles, hashes, currentIndex);
        break;
    case 'mst':
        sortedPaths = sortMediaBySimilarityMST(mediaFiles, hashes, currentIndex);
        break;
    case 'simple':
    default:
        sortedPaths = sortMediaBySimilarity(mediaFiles, hashes, currentIndex, maxComparisons);
        break;
}
```

Also find the destructure at the top of the `'startSort'` block (~line 594):

```js
const { algorithm, mediaFiles, hashes, currentIndex, maxComparisons } = data;
```

Replace the destructure with:

```js
const { algorithm, mediaFiles, hashes, clipVectors, currentIndex, maxComparisons } = data;
```

Replace the switch with:

```js
switch (algorithm) {
    case 'clip':
        sortedPaths = sortMediaBySimilarityClip(mediaFiles, clipVectors, currentIndex);
        break;
    case 'vptree':
        sortedPaths = sortMediaBySimilarityVPTree(mediaFiles, hashes, currentIndex);
        break;
    case 'mst':
        sortedPaths = sortMediaBySimilarityMST(mediaFiles, hashes, currentIndex);
        break;
    case 'simple':
    default:
        sortedPaths = sortMediaBySimilarity(mediaFiles, hashes, currentIndex, maxComparisons);
        break;
}
```

- [x] **Step 3: Run existing tests to verify no regression**

Run: `npx vitest run tests/sorting-worker.test.js`
Expected: PASS — all existing tests (including the 9 new `calculateCosineDistance` tests from Task 1) continue to pass. No new tests for `sortMediaBySimilarityClip` since it's not in the module export (it uses `self.postMessage` which can't run in Node.js).

- [x] **Step 4: Run lint to ensure clean formatting**

Run: `npm run lint`
Expected: PASS — no new lint errors.

- [x] **Step 5: Commit**

```bash
git add sorting-worker.js
git commit -m "feat: add sortMediaBySimilarityClip MST algorithm for CLIP sorting

Adds MST-based CLIP similarity sorting reusing VPTree + MinHeap + Prim's.
Uses cosine distance for semantic grouping instead of Hamming distance.

Worker message handler: new 'clip' case in switch, destructures
clipVectors from data alongside existing hashes field."
```

---

## Task 3: Add CLIP option to sort algorithm dropdown

**Files:**
- Modify: `index.html` (~line 48-49, add option)

- [x] **Step 1: Read the current dropdown**

Open `index.html`. Find the `<select id="sortAlgorithmSelect">` block (~line 42-51):

```html
<select
    class="sort-algorithm-select"
    id="sortAlgorithmSelect"
    title="Choose sorting algorithm"
    style="display: none"
>
    <option value="vptree">VP-Tree (Fastest)</option>
    <option value="mst">MST (Best Quality)</option>
    <option value="simple">Simple (Limited)</option>
</select>
```

- [x] **Step 2: Add the CLIP option**

Replace that block with:

```html
<select
    class="sort-algorithm-select"
    id="sortAlgorithmSelect"
    title="Choose sorting algorithm"
    style="display: none"
>
    <option value="vptree">VP-Tree (Fastest)</option>
    <option value="mst">MST (Best Quality)</option>
    <option value="simple">Simple (Limited)</option>
    <option value="clip">CLIP (Semantic)</option>
</select>
```

- [x] **Step 3: Verify format check passes**

Run: `npm run format:check`
Expected: PASS (or if it fails due to unrelated whitespace, run `npm run format` first then verify).

- [x] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add CLIP (Semantic) option to sort algorithm dropdown"
```

---

## Task 4: Add CLIP branch to handleSortBySimilarity in media-viewer.js

**Files:**
- Modify: `media-viewer.js` — `handleSortBySimilarity()` method (~line 4016-4267), `algorithmNames` object (~line 4075)

- [x] **Step 1: Locate the algorithmNames object**

Open `media-viewer.js`. Find the `algorithmNames` object inside `handleSortBySimilarity()` (~line 4075):

```js
const algorithmNames = {
    vptree: 'VP-Tree (fastest)',
    mst: 'MST (best quality)',
    simple: 'Simple (limited)',
};
```

Replace with:

```js
const algorithmNames = {
    vptree: 'VP-Tree (fastest)',
    mst: 'MST (best quality)',
    simple: 'Simple (limited)',
    clip: 'CLIP (semantic)',
};
```

- [x] **Step 2: Locate the "No cache - perform full sorting" branch**

In `handleSortBySimilarity()`, find the `else` branch that performs full sorting (~line 4129):

```js
} else {
    // No cache - perform full sorting
    // Load cached hashes
    const cachedCount = await this.loadHashCache();
```

The next block (approximately lines 4131-4210) is the hash-computation + sort dispatch path. We will branch on `this.sortAlgorithm === 'clip'` inside this `else` branch to skip the hash path entirely.

- [x] **Step 3: Add CLIP sorting branch**

Replace lines 4129-4210 of `media-viewer.js` (from the `} else {` line through the `const sortedPaths = await this.runSortingWorker({...});` block up to but NOT including the `// Reorder mediaFiles based on sorted paths` comment). The exact current content starts with `} else {` and ends with `});` closing the `runSortingWorker` call.

Replace with:

```js
} else {
    // No cache - perform full sorting
    let sortedPaths;

    if (this.sortAlgorithm === 'clip') {
        // CLIP semantic sorting — uses clipCache, no hash computation
        if (!this.enableClipFeatures) {
            throw new Error(
                'CLIP features are disabled. Enable in Settings (F1) to use semantic sorting.'
            );
        }

        // Collect CLIP vectors from clipCache (Float32Array → plain Array for postMessage serialization)
        const clipVectors = {};
        let vectorCount = 0;
        for (const file of this.mediaFiles) {
            const vec = this.clipCache.get(file.path);
            if (vec) {
                clipVectors[file.path] = Array.from(vec);
                vectorCount++;
            }
        }

        if (vectorCount < 2) {
            throw new Error(
                `Only ${vectorCount} files have CLIP embeddings. Wait for background extraction to complete, then retry.`
            );
        }

        this.showNotification(
            `🧠 Using CLIP embeddings for ${vectorCount} files (${this.mediaFiles.length - vectorCount} without vectors appended at end)`,
            'info'
        );

        this.updateProgressNotification(`🔄 Sorting with ${algorithmName}...`);

        sortedPaths = await this.runSortingWorker({
            algorithm: 'clip',
            mediaFiles: this.mediaFiles.map((f) => ({ path: f.path })),
            clipVectors,
            currentIndex: this.currentIndex,
        });
    } else {
        // Hash-based sorting (vptree, mst, simple)
        // Load cached hashes
        const cachedCount = await this.loadHashCache();

        // Show cache location (one notification)
        const cacheFile = await window.electronAPI.path.join(this.baseFolderPath, '.hash_cache.json');
        this.showNotification(`💾 Cache: ${cacheFile} (${cachedCount} hashes loaded)`, 'info');

        // Start progress notification
        this.updateProgressNotification('🔄 Starting hash computation...');

        let processed = 0;
        let newHashes = 0;
        let skipped = 0;
        const total = this.mediaFiles.length;

        for (const file of this.mediaFiles) {
            // Check for abort
            if (this.sortAbortController.signal.aborted) {
                throw new Error('Sorting cancelled by user');
            }

            processed++;

            if (!this.perceptualHashes.has(file.path)) {
                try {
                    const hash = await this.computePerceptualHash(file.path);
                    this.perceptualHashes.set(file.path, hash);
                    newHashes++;

                    // Update progress every 5 files or at end
                    if (processed % 5 === 0 || processed === total) {
                        this.updateProgressNotification(
                            `🔄 Processing: ${processed}/${total} (${newHashes} new, ${skipped} skipped)`
                        );
                    }
                } catch (error) {
                    console.error(`Failed to compute hash for ${file.path}:`, error);
                    skipped++;
                    // Update progress notification instead of showing separate warning
                    if (processed % 5 === 0 || processed === total) {
                        this.updateProgressNotification(
                            `🔄 Processing: ${processed}/${total} (${newHashes} new, ${skipped} skipped)`
                        );
                    }
                }
            }
        }

        // Check if we have enough hashes to sort
        const filesWithHashes = this.mediaFiles.filter((f) => this.perceptualHashes.has(f.path));
        if (filesWithHashes.length < 2) {
            throw new Error(`Only ${filesWithHashes.length} files have valid hashes. Need at least 2 to sort.`);
        }

        // Save hash cache
        await this.saveHashCache();

        // For Simple algorithm, show K value as separate notification
        if (this.sortAlgorithm === 'simple') {
            const savedK = localStorage.getItem('sortKValue');
            const kValue = savedK ? parseInt(savedK, 10) : 500;
            const maxK = filesWithHashes.length - 1;
            const actualK = Math.min(kValue, maxK);
            this.showNotification(`🔢 Using K=${actualK} neighbors per file (max: ${maxK})`, 'info');
        }

        this.updateProgressNotification(`🔄 Sorting with ${algorithmName}...`);

        // Get K value for simple algorithm
        const savedK = localStorage.getItem('sortKValue');
        const kValue = savedK ? parseInt(savedK, 10) : 500;

        // Delegate sorting to Web Worker to prevent UI freeze when minimized
        sortedPaths = await this.runSortingWorker({
            algorithm: this.sortAlgorithm,
            mediaFiles: this.mediaFiles.map((f) => ({ path: f.path })),
            hashes: Object.fromEntries(this.perceptualHashes),
            currentIndex: this.currentIndex,
            maxComparisons: kValue,
        });
    }
```

**Note:** The original code had `const sortedPaths = await this.runSortingWorker(...)` — we've hoisted `let sortedPaths` to above the `if/else` so both branches can assign to it. The code that follows the `runSortingWorker` call (reorder mediaFiles, save sort cache, show success notification) stays unchanged and will continue to execute for both branches.

- [x] **Step 4: Verify the code after the runSortingWorker call is unchanged**

The next lines after the replaced block (starting around the original line 4212) should remain:

```js
                // Reorder mediaFiles based on sorted paths
                const pathToFile = new Map(this.mediaFiles.map((f) => [f.path, f]));
                this.mediaFiles = sortedPaths.map((path) => pathToFile.get(path)).filter((f) => f);

                // Save sort cache for this algorithm
                const currentFile = this.mediaFiles[this.currentIndex];
                await this.saveSortCache(
                    this.sortAlgorithm,
                    this.mediaFiles.map((f) => f.path),
                    currentFile ? currentFile.path : null
                );
```

These lines use `sortedPaths` (now declared as `let` above the branch), so they work correctly for both CLIP and hash paths.

- [x] **Step 5: Run unit tests**

Run: `npm test`
Expected: PASS — 150 unit tests (9 new cosine distance tests from Task 1 + 141 existing).

- [x] **Step 6: Run lint**

Run: `npm run lint`
Expected: PASS — no new lint errors.

- [x] **Step 7: Manual smoke test the full sort flow**

Launch the app: `npm start`

Manual verification steps:
1. Open a folder with media files. If CLIP extraction hasn't run yet: wait for the background extraction progress pill to complete (shows "✅ Extraction complete" or stops). Verify `.feature_cache.json` exists in the folder and entries have `clipVector` fields (check with `cat` or an editor).
2. Change dropdown to "CLIP (Semantic)"
3. Click "Sort by Similarity"
4. Verify: progress notification shows "🧠 Using CLIP embeddings for N files"
5. Verify: progress notification shows "🔄 Sorting with CLIP (semantic)..."
6. Verify: sort completes with success notification "✅ Sorted N files with CLIP (semantic)!"
7. Verify: semantic grouping visible (e.g., photos of same subject cluster together)
8. Verify: `.sort_cache_clip.json` created in the folder
9. Click "Restore Order" — verify original order is restored
10. Click "Sort by Similarity" again (with CLIP still selected) — verify cached order loads quickly
11. Shift+click "Sort by Similarity" — verify force re-sort deletes cache and re-sorts

Edge case verification:
- Toggle OFF "Enable CLIP features" in Settings (F1), click Sort by Similarity with CLIP algorithm — verify error notification "CLIP features are disabled. Enable in Settings (F1) to use semantic sorting."
- Open a fresh folder where CLIP extraction hasn't run, immediately select CLIP and click Sort — verify error "Only 0 files have CLIP embeddings..."

If all pass, proceed to commit. If any fail, stop and debug before committing.

- [x] **Step 8: Commit**

```bash
git add media-viewer.js
git commit -m "feat: wire CLIP sorting into handleSortBySimilarity

When sortAlgorithm === 'clip':
- Skip hash computation and load entirely
- Validate enableClipFeatures toggle is ON
- Collect CLIP vectors from clipCache (Array.from for postMessage serialization)
- Require minimum 2 files with CLIP embeddings
- Dispatch to sorting worker with algorithm: 'clip'

Reuses existing sort cache infrastructure (saveSortCache/loadSortCache/
deleteSortCache with 'clip' key → .sort_cache_clip.json).

Hash-based algorithms (vptree/mst/simple) continue to use their existing
code path unchanged."
```

---

## Task 5: Update DONE.md and run full test suite

**Files:**
- Verify: Full unit test suite + lint + format pass on the complete change set

- [x] **Step 1: Run full unit test suite**

Run: `npm test`
Expected: PASS — 150 tests (9 new cosine distance + 141 existing).

- [x] **Step 2: Run full lint**

Run: `npm run lint`
Expected: PASS — no errors.

- [x] **Step 3: Run format check**

Run: `npm run format:check`
Expected: PASS. If it fails, run `npm run format` and then re-verify.

- [x] **Step 4: Verify no new ESLint warnings introduced**

Run: `npm run lint 2>&1 | grep -i warning` (bash)
Expected: Either no output (no warnings) or only pre-existing warnings (same count as before the feature branch).

- [x] **Step 5: Review the full diff**

Run: `git diff main...feature/clip-similarity-sorting --stat`
Expected: 4 files changed: `sorting-worker.js`, `media-viewer.js`, `index.html`, `tests/sorting-worker.test.js`. No other files.

Optionally: `git diff main...feature/clip-similarity-sorting` to visually review each change.

- [x] **Step 6: Verification complete**

At this point the implementation is complete. Task completion docs (EXTRACT → ARCHIVE → TRANSITION → COMMIT → MEMORY) happen post-PR-merge and are out of scope for this plan.

---

## Notes for the implementer

### Why MST and not the other algorithms

The spec locks in MST as the only CLIP algorithm to avoid a 6-combination UI (3 algorithms × 2 metrics). MST already produces the best quality output for hash-based sorting and that advantage is even more valuable for semantic grouping. If future iterations want VP-Tree + CLIP for faster sorting, that would be a new feature, not part of this scope.

### Why plain arrays instead of Float32Array for clipVectors

`postMessage` serializes data via the structured clone algorithm. Float32Array works with structured clone, but our existing hash transfer uses plain objects `{path: string}`, so we match that pattern with plain arrays for consistency. Performance impact is negligible for 512-dim vectors.

### Why no E2E tests

E2E tests would require either:
1. Running real CLIP inference (model download, slow, flaky in test environment)
2. Complex mocking of `clipCache` + CLIP-related IPC in Electron's test harness

Neither is justified for a sorting algorithm that's fundamentally the same MST + VP-Tree code as the existing MST algorithm, with only the distance function swapped. Unit tests for `calculateCosineDistance` + manual integration testing cover the new code adequately.

### CLAUDE.md already contains gotchas

The main gotchas for this implementation are already documented in CLAUDE.md (Git Insights → Active gotchas):
- CLIP sorting worker data shape (Array.from, not Float32Array)
- CLIP-disabled edge case check in renderer
- Sort cache key is `'clip'` → `.sort_cache_clip.json`

Consult these if anything is unclear during implementation.
