# Sort Responsiveness Core (Large-Folder Perf, PR1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visual-similarity sorting on large (24k+) folders non-freezing, transparent (determinate progress), and promptly cancelable, and remove O(n²)/dead-code waste — without changing sort quality.

**Architecture:** Four independent changes on the live worker sort path (`sorting-worker.js`) and the renderer sort surface (`media-viewer.js` + `styles.css`): (1) grow the existing bottom-right progress notification into a determinate, cancelable card; (2) replace the worker's O(n²) MST-fallback linear scan with the already-built VP-tree's exact `findNearest`; (3) add event-loop yielding to the renderer cache-hit insertion loop; (4) delete ~330 lines of dead renderer sort methods superseded by the worker.

**Tech Stack:** Electron renderer (browser globals, no bundler), Web Worker (CommonJS), Vitest (`node` env — no DOM), Playwright E2E. Design spec: [docs/superpowers/specs/2026-06-19-sort-responsiveness-core-design.md](../specs/2026-06-19-sort-responsiveness-core-design.md).

**Status:** Complete. Manual 24k-folder smoke **PASSED 2026-06-19** (user hand-off — verified the `updateSortProgress` DOM render + Cancel, which `node`-env unit tests can't cover). On **PR #54 (open)**, review/merge pending. Subagent-driven (controller commits per [[feedback_subagent_commits_vs_memory_hook]]); per-task reviews all Approved; final whole-branch review (opus) → "Ready to merge: With fixes" (the one Minor — CLIP-fallback test coverage — was fixed in `d19d252`). Branch `feature/sort-responsiveness-core`; 357/357 unit.

## Global Constraints

- **Sort quality must not change.** No neighbor cap (no K-cap); same neighbor graph; same MST. The ONLY permitted output deviation is tie-break order among **exactly-equal-distance** files in the rare global-jump fallback (Task 3, hash path only; CLIP effectively bit-identical).
- **Progress UI = Option C** — extend the existing reusable bottom-right progress notification (`updateProgressNotification` element); do NOT add a centered modal or a separate top-level overlay.
- **Pre-commit hook** runs `node scripts/check-secrets.js` → lint-staged (ESLint --fix + Prettier on staged `*.{js,cjs}`) → `npx vitest run` (all unit tests must pass). Every commit must pass these.
- **Prettier:** tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always, endOfLine=lf.
- **ESLint:** prefix intentionally-unused vars/args/catch-bindings with `_`. In extract-method unit tests, reference browser globals as `globalThis.window.electronAPI` (NOT bare `window`) — bare `window` fails `no-undef` and blocks the commit even when the test passes.
- **Worker exports** use the conditional CJS pattern already present at the bottom of `sorting-worker.js` (`if (typeof module !== 'undefined' && module.exports)`).
- **Module systems:** CommonJS `require()` in workers/main; browser globals in the renderer; ES module `import` only for the already-extracted modules. `media-viewer.js` methods are tested via the `extractMethod`/`extractAsyncMethod` source-extraction helpers (no class construction, no DOM).
- **`baseFolderPath`** = full resolved path; **`currentFolderPath`** = basename (display only). Not touched here but don't confuse them.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `sorting-worker.js` | Worker sort algorithms. Change: MST-fallback linear scan → `vpTree.findNearest(current, traversed)` in both `sortMediaBySimilarityMST` (hash) and `sortMediaBySimilarityClip` (CLIP). | 3 |
| `media-viewer.js` | Renderer UI. Changes: delete dead `sortMediaBySimilarity*` methods (Task 1); yield in `insertNewFilesInSortedOrder` (Task 2); add `computeSortProgressView` + `updateSortProgress` (Task 4); route all sort-phase progress through `updateSortProgress` + Cancel wiring (Task 5). | 1, 2, 4, 5 |
| `styles.css` | Progress-card styling: `.notification-progress` / `.progress-track` / `.progress-fill` + indeterminate keyframe. | 4 |
| `tests/sorting-worker.test.js` | Worker unit tests. Add `sortMediaBySimilarityMST` import + characterization (hash + CLIP fallback) + tie-documentation tests. | 3 |
| `tests/media-viewer-utils.test.js` | Renderer method unit tests. Add `computeSortProgressView` tests (Task 4) + a large-batch yielding regression test for `insertNewFilesInSortedOrder` (Task 2). | 2, 4 |
| `tests/e2e/*.test.js` (optional) | Progress-card appear/clear + cancel smoke on the tiny fixture. | 5 |

**Task order rationale:** Task 1 (deletion) first to shrink the file before touching nearby code; line numbers shift after it, so all later renderer tasks locate code **by method name** (`grep`/search), treating any line numbers below as approximate (pre-deletion).

---

### Task 1: Delete dead renderer sort methods

Three renderer methods — `sortMediaBySimilarity`, `sortMediaBySimilarityVPTree`, `sortMediaBySimilarityMST` — are never called (the `runSortingWorker` → `sorting-worker.js` path superseded them) and have zero test references. Delete them.

**Files:**
- Modify: `media-viewer.js` (delete the contiguous block from `async sortMediaBySimilarity(signal) {` through its sibling methods' closing brace, immediately before `async loadHashCache() {` — approx lines 5834–6167)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (pure removal). `calculateHammingDistance`, `calculateCosineDistance`, `runSortingWorker`, `handleSortBySimilarity`, `loadHashCache` remain untouched.

- [ ] **Step 1: Confirm zero references before deleting**

Run:
```bash
grep -n "this\.sortMediaBySimilarity" media-viewer.js
grep -rn "sortMediaBySimilarityVPTree\|sortMediaBySimilarityMST\b\|\.sortMediaBySimilarity\b" tests/
```
Expected: no `this.sortMediaBySimilarity*(` call sites in `media-viewer.js`; no test references to the **renderer** methods (the only `tests/` hits are the *worker's* `sortMediaBySimilarityClip`/`sortMediaBySimilarityMST`, which live in `sorting-worker.js` and are out of scope here). If any real call site exists, STOP and report.

- [ ] **Step 2: Delete the three methods**

In `media-viewer.js`, locate `async sortMediaBySimilarity(signal) {` (the first of the three, currently ~line 5834). Delete from that line through the closing `}` of `async sortMediaBySimilarityMST(signal)` — i.e. everything up to (but not including) `async loadHashCache() {`. The block contains exactly these three methods and the blank lines between them. Keep `calculateHammingDistance`/`calculateCosineDistance` (just above) and `runSortingWorker` (above those).

- [ ] **Step 3: Verify nothing else references them + suite green**

Run:
```bash
grep -n "sortMediaBySimilarity(" media-viewer.js
npm test
npm run lint
```
Expected: `grep` shows only `handleSortBySimilarity` and the `insertNewFilesInSortedOrder` comment mentioning `sortMediaBySimilarityClip` (a comment, fine) — no live renderer `sortMediaBySimilarity*` definitions or calls. `npm test` → 345 passed. `npm run lint` → clean.

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "$(cat <<'EOF'
refactor: remove dead renderer similarity-sort methods

sortMediaBySimilarity / VPTree / MST were superseded by the sorting-worker
path (runSortingWorker) and had zero call sites and zero test references.
~330 lines removed; no behavior change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Event-loop yielding in `insertNewFilesInSortedOrder`

The cache-hit re-sort scores each new file against every sorted position (O(M·N)) on the renderer main thread, freezing the UI for large batches. Add a yield every 25 outer iterations in both branches. Output is byte-identical (pure scheduling change); closes BACKLOG 🟤 [2026-05-24].

**Files:**
- Modify: `media-viewer.js` — `insertNewFilesInSortedOrder` (locate by name; both the `if (algorithm === 'clip')` branch and the `else` hash branch)
- Test: `tests/media-viewer-utils.test.js` (existing `describe('insertNewFilesInSortedOrder (algorithm-aware)')` block)

**Interfaces:**
- Consumes: `extractAsyncMethod('insertNewFilesInSortedOrder')` + the existing `makeCtx` helper (already in the test file).
- Produces: unchanged method signature `async insertNewFilesInSortedOrder(sortedFiles, newFiles, algorithm)`.

- [ ] **Step 1: Write the large-batch regression test**

Append inside the existing `describe('insertNewFilesInSortedOrder (algorithm-aware)', ...)` block in `tests/media-viewer-utils.test.js`:

```js
it('hash path: yields without changing output for a batch larger than the yield interval', async () => {
    // 30 new files (> the 25-iteration yield boundary) inserted into a 2-file cached order.
    // Pure scheduling change must not alter the result: all files present exactly once,
    // cached anchors retained, and every new file placed.
    const anchorA = { path: '/a.png' };
    const anchorZ = { path: '/z.png' };
    const hashes = new Map([
        ['/a.png', '0000'],
        ['/z.png', '1111'],
    ]);
    const newFiles = [];
    for (let i = 0; i < 30; i++) {
        const p = `/n${i}.png`;
        newFiles.push({ path: p });
        // Distinct-ish 4-bit hashes so each has a defined Hamming distance.
        hashes.set(p, ((i % 16) + 16).toString(2).slice(1));
    }
    const ctx = makeCtx({ mediaFiles: [anchorA, anchorZ], perceptualHashes: hashes });

    await insertNewFilesInSortedOrder.call(ctx, [anchorA, anchorZ], newFiles, 'vptree');

    const paths = ctx.mediaFiles.map((f) => f.path);
    expect(paths).toHaveLength(32);
    expect(new Set(paths).size).toBe(32); // no duplicates
    expect(paths).toContain('/a.png');
    expect(paths).toContain('/z.png');
    for (let i = 0; i < 30; i++) expect(paths).toContain(`/n${i}.png`);
});
```

- [ ] **Step 2: Run to verify it passes against current code (baseline)**

Run: `npx vitest run media-viewer-utils`
Expected: PASS (the current implementation already produces a correct permutation for ≤25 and >25 batches — this test pins that the upcoming yield doesn't regress it).

- [ ] **Step 3: Add the yield to the CLIP branch**

In `insertNewFilesInSortedOrder`, inside the `if (algorithm === 'clip')` branch's `for (let i = 0; i < newFiles.length; i++)` loop, immediately after the existing `if ((i + 1) % 10 === 0 || i === newFiles.length - 1) { this.updateProgressNotification(...) }` progress block, add:

```js
                if ((i + 1) % 25 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
```

- [ ] **Step 4: Add the yield to the hash branch**

In the `else` (hash) branch's `for (let i = 0; i < newFiles.length; i++)` loop, after its existing progress-notification block, add the identical yield:

```js
                if ((i + 1) % 25 === 0) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
```

- [ ] **Step 5: Run tests + lint**

Run: `npx vitest run media-viewer-utils && npm run lint`
Expected: all `insertNewFilesInSortedOrder` tests PASS (including the new large-batch test and the existing exact-order tests at the 3-file scale, which are unaffected); lint clean.

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "$(cat <<'EOF'
perf: yield to event loop in insertNewFilesInSortedOrder

Release the renderer main thread every 25 new files in both the CLIP and
hash insertion branches so large cache-hit re-sorts don't freeze the UI
(and the new sort-progress Cancel button can register). Output unchanged.

Closes BACKLOG [2026-05-24] event-loop-yielding item.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Worker O(n²) MST-fallback → VP-tree `findNearest`

Both worker sorts end with a greedy MST traversal whose "stuck" handler scans **all** files linearly to find the global nearest unvisited node (O(n) per stuck, up to O(n²) total). Replace each scan with the already-built `vpTree.findNearest(current, traversed)` — an exact NN query with the same `distanceFunc`, returning the identical node except for tie-breaks among exactly-equal-distance files (hash path only).

**Files:**
- Modify: `sorting-worker.js` — the `else` fallback block inside the traversal loop of `sortMediaBySimilarityMST` (hash, ~lines 564–575) and `sortMediaBySimilarityClip` (CLIP, ~lines 725–737)
- Test: `tests/sorting-worker.test.js`

**Interfaces:**
- Consumes: existing exported `sortMediaBySimilarityClip`; add `sortMediaBySimilarityMST` to the import (already exported from the worker). `VPTree.findNearest(target, excludeSet)` is already present and unit-tested.
- Produces: unchanged function signatures `sortMediaBySimilarityMST(mediaFiles, hashes, currentIndex)` and `sortMediaBySimilarityClip(mediaFiles, clipVectors, currentIndex)`.

- [ ] **Step 1: Import `sortMediaBySimilarityMST` and write a fallback-exercising characterization test (hash)**

In `tests/sorting-worker.test.js`, add `sortMediaBySimilarityMST` to the destructured `require('../sorting-worker')`. Then add a new describe block. Use a two-cluster fixture so the greedy traversal gets "stuck" at a cluster leaf and hits the fallback. Leave `EXPECTED` empty so the first run fails and prints the actual order to capture:

```js
describe('sortMediaBySimilarityMST (hash) — fallback characterization', () => {
    function resetAbort() {
        globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
    }

    // Two clusters around 0000 and 1111 force the greedy MST traversal to get
    // "stuck" at a cluster boundary and invoke the global nearest-unvisited fallback.
    const files = [
        { path: '/a' }, { path: '/b' }, { path: '/c' },
        { path: '/d' }, { path: '/e' }, { path: '/f' },
    ];
    const hashes = {
        '/a': '0000', '/b': '0001', '/c': '0010',
        '/d': '1111', '/e': '1110', '/f': '1101',
    };

    it('produces a stable, tie-free ordering (pins behavior across the fallback fix)', () => {
        resetAbort();
        const result = sortMediaBySimilarityMST(files, hashes, 0);
        // Capture baseline: run once, paste the printed array here, then re-run to lock.
        const EXPECTED = [];
        expect(result).toEqual(EXPECTED);
    });
});
```

- [ ] **Step 2: Capture the baseline**

Run: `npx vitest run sorting-worker`
Expected: the new test FAILS, printing the actual ordered array (e.g. `[ '/a', '/b', '/c', '/e', '/f', '/d' ]`). Copy that exact array into `EXPECTED`. Re-run: `npx vitest run sorting-worker` → PASS. This pins the **current** output before any change.

- [ ] **Step 3: Add a CLIP fallback characterization test**

Add a second describe block mirroring Step 1 for `sortMediaBySimilarityClip`, again with a two-cluster fixture and capture-baseline `EXPECTED`:

```js
describe('sortMediaBySimilarityClip — fallback characterization', () => {
    function resetAbort() {
        globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
    }
    const files = [
        { path: '/a' }, { path: '/b' }, { path: '/c' },
        { path: '/d' }, { path: '/e' }, { path: '/f' },
    ];
    const clipVectors = {
        '/a': [1, 0, 0, 0], '/b': [0.98, 0.2, 0, 0], '/c': [0.95, 0.31, 0, 0],
        '/d': [0, 1, 0, 0], '/e': [0.2, 0.98, 0, 0], '/f': [0.31, 0.95, 0, 0],
    };
    it('produces a stable ordering (pins behavior across the fallback fix)', () => {
        resetAbort();
        const result = sortMediaBySimilarityClip(files, clipVectors, 0);
        const EXPECTED = []; // capture baseline as in the hash test
        expect(result).toEqual(EXPECTED);
    });
});
```

Run `npx vitest run sorting-worker`, paste the printed CLIP order into its `EXPECTED`, re-run → PASS.

- [ ] **Step 4: Commit the pinning tests**

```bash
git add tests/sorting-worker.test.js
git commit -m "$(cat <<'EOF'
test: pin worker MST/CLIP sort output before fallback refactor

Characterization tests on two-cluster fixtures that exercise the greedy
traversal's global nearest-unvisited fallback, locking current output so
the upcoming O(n^2)->VP-tree change is proven behavior-preserving.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Replace the linear scan in `sortMediaBySimilarityMST` (hash)**

In `sorting-worker.js`, inside `sortMediaBySimilarityMST`'s traversal loop, the `else` block currently reads:

```js
        } else {
            let nearestNode = null;
            let minDist = Infinity;

            for (const file of filesWithHashes) {
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
```

Replace it with:

```js
        } else {
            // Quality-preserving speedup: find the global nearest UNVISITED node via the
            // already-built VP-tree (exact NN, same distanceFunc, excluding `traversed`)
            // instead of an O(n) linear scan. Identical node except tie-breaks among
            // exactly-equal-distance files (see design spec 2026-06-19 §2).
            const nearestNode = vpTree.findNearest(current, traversed);

            if (nearestNode) {
                traversed.add(nearestNode);
                sorted.push(nearestNode);
                current = nearestNode;
            } else {
                break;
            }
        }
```

- [ ] **Step 6: Replace the linear scan in `sortMediaBySimilarityClip` (CLIP)**

Apply the identical transformation in `sortMediaBySimilarityClip`'s traversal `else` block (it scans `filesWithVectors`; the same `vpTree` and `traversed` are in scope). Use the same `vpTree.findNearest(current, traversed)` replacement and the same comment.

- [ ] **Step 7: Verify identical output + add a tie-documentation test**

Run: `npx vitest run sorting-worker`
Expected: the two characterization tests (Steps 1–3) still PASS — proving the new VP-tree fallback yields **identical** output on these tie-free fixtures — and all pre-existing CLIP/VPTree/MinHeap tests still PASS.

Then add a tie-documentation test (hash path, deliberately tied distances) asserting a valid permutation rather than an exact order:

```js
describe('sortMediaBySimilarityMST (hash) — tie behavior is a valid permutation', () => {
    function resetAbort() {
        globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
    }
    it('returns every file exactly once with the start file first, even with distance ties', () => {
        resetAbort();
        // b, c, d are all Hamming-distance 1 from a (ties on the fallback choice).
        const files = [{ path: '/a' }, { path: '/b' }, { path: '/c' }, { path: '/d' }];
        const hashes = { '/a': '000', '/b': '100', '/c': '010', '/d': '001' };
        const result = sortMediaBySimilarityMST(files, hashes, 0);
        expect(result[0]).toBe('/a');
        expect(result).toHaveLength(4);
        expect(new Set(result).size).toBe(4);
        ['/a', '/b', '/c', '/d'].forEach((p) => expect(result).toContain(p));
    });
});
```

Run `npx vitest run sorting-worker && npm run lint` → PASS + clean.

- [ ] **Step 8: Commit**

```bash
git add sorting-worker.js tests/sorting-worker.test.js
git commit -m "$(cat <<'EOF'
perf: replace O(n^2) MST-traversal fallback with VP-tree findNearest

Both worker sorts found the global nearest-unvisited node via a full
linear scan when the greedy MST walk got stuck (up to O(n^2)). Use the
already-built VP-tree's exact findNearest(current, traversed) instead.
Output is identical except tie-break order among exactly-equal-distance
files on the hash path (CLIP effectively bit-identical), proven by the
characterization tests.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Progress component — `computeSortProgressView` + `updateSortProgress` + CSS

Build the determinate, cancelable progress card (Option C) as an enhancement of the existing reusable progress notification. The pure view-model is unit-tested; the DOM method and CSS are verified by manual smoke / optional E2E (Task 5).

**Files:**
- Modify: `media-viewer.js` — add `computeSortProgressView` and `updateSortProgress` methods (place them next to the existing `updateProgressNotification` / `clearProgressNotification`, ~line 1435)
- Modify: `styles.css` — add progress-card classes (near the existing `.notification` block, ~line 1390)
- Test: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: existing `this.progressNotification`, `this.notificationContainer`, `this.sortAbortController`, and the existing `.notification`/`.notification-action` CSS.
- Produces:
  - `computeSortProgressView({ phase, current, total }) → { phase: string, determinate: boolean, percent: number|null, countsText: string }`
  - `updateSortProgress({ phase, current, total }) → void` (renders/updates the card; calls `this.sortAbortController?.abort()` on Cancel)

- [ ] **Step 1: Write the view-model tests**

In `tests/media-viewer-utils.test.js`, add near the other `extractMethod` declarations (line ~85):

```js
const computeSortProgressView = extractMethod('computeSortProgressView');
```

Then add a describe block:

```js
describe('computeSortProgressView', () => {
    it('determinate: phase, clamped percent, comma-grouped counts', () => {
        const v = computeSortProgressView({ phase: 'Building graph', current: 12400, total: 24000 });
        expect(v).toEqual({
            phase: 'Building graph',
            determinate: true,
            percent: 52,
            countsText: '12,400 / 24,000',
        });
    });

    it('indeterminate when total is missing or zero', () => {
        const a = computeSortProgressView({ phase: 'Loading…', current: null, total: null });
        expect(a.determinate).toBe(false);
        expect(a.percent).toBeNull();
        expect(a.countsText).toBe('');
        const b = computeSortProgressView({ phase: 'Loading…', current: 0, total: 0 });
        expect(b.determinate).toBe(false);
    });

    it('clamps percent to 100 when current exceeds total', () => {
        expect(computeSortProgressView({ phase: 'x', current: 30, total: 24 }).percent).toBe(100);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run media-viewer-utils`
Expected: FAIL — `Could not find method: computeSortProgressView` (thrown by `extractMethod`).

- [ ] **Step 3: Implement `computeSortProgressView`**

In `media-viewer.js`, immediately above `updateProgressNotification(message) {`, add:

```js
    // Pure view-model for the sort progress card. Locale-independent thousands
    // grouping so the value is deterministic across environments (tests + CI).
    computeSortProgressView({ phase, current, total }) {
        const hasCount = typeof current === 'number' && typeof total === 'number' && total > 0;
        const groupThousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return {
            phase: phase || '',
            determinate: hasCount,
            percent: hasCount ? Math.min(100, Math.round((current / total) * 100)) : null,
            countsText: hasCount ? `${groupThousands(current)} / ${groupThousands(total)}` : '',
        };
    }
```

- [ ] **Step 4: Run to verify the view-model tests pass**

Run: `npx vitest run media-viewer-utils`
Expected: the three `computeSortProgressView` tests PASS.

- [ ] **Step 5: Implement `updateSortProgress` (DOM)**

In `media-viewer.js`, immediately below `clearProgressNotification()`, add:

```js
    // Determinate, cancelable sort-progress card (design spec 2026-06-19 §1, Option C).
    // Reuses the same reusable element as updateProgressNotification (glass, primary
    // left-border, bottom-right container) but renders a phase label, a determinate bar,
    // a counts/% line, and a Cancel button wired to the sort abort controller.
    updateSortProgress({ phase, current, total }) {
        const view = this.computeSortProgressView({ phase, current, total });

        if (!this.progressNotification || !this.progressNotification.parentNode) {
            this.progressNotification = document.createElement('div');
            this.notificationContainer.appendChild(this.progressNotification);
        }
        const el = this.progressNotification;
        el.className = 'notification info notification-progress';

        if (!el.querySelector('.progress-phase')) {
            el.innerHTML =
                '<div class="progress-phase"></div>' +
                '<div class="progress-track"><div class="progress-fill"></div></div>' +
                '<div class="progress-meta"><span class="progress-counts"></span>' +
                '<button type="button" class="notification-action progress-cancel">Cancel</button></div>';
            el.querySelector('.progress-cancel').addEventListener('click', () => {
                this.sortAbortController?.abort();
            });
        }

        el.querySelector('.progress-phase').textContent = view.phase;
        const fill = el.querySelector('.progress-fill');
        const counts = el.querySelector('.progress-counts');
        if (view.determinate) {
            el.classList.remove('indeterminate');
            fill.style.width = `${view.percent}%`;
            counts.textContent = `${view.countsText} · ${view.percent}%`;
        } else {
            el.classList.add('indeterminate');
            fill.style.width = '';
            counts.textContent = '';
        }
    }
```

- [ ] **Step 6: Add the CSS**

In `styles.css`, after the `.notification.info { ... }` rule (~line 1428), add:

```css
/* Determinate, cancelable sort-progress card (Option C) */
.notification-progress {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    min-width: 260px;
    max-width: 320px;
}
.notification-progress .progress-phase {
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
}
.notification-progress .progress-track {
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
}
.notification-progress .progress-fill {
    height: 100%;
    width: 0;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400));
    box-shadow: 0 0 14px rgba(0, 120, 212, 0.45);
    transition: width var(--transition-normal);
}
.notification-progress.indeterminate .progress-fill {
    width: 40%;
    animation: progress-indeterminate 1.2s ease-in-out infinite;
}
.notification-progress .progress-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
}
@keyframes progress-indeterminate {
    0% {
        transform: translateX(-120%);
    }
    100% {
        transform: translateX(280%);
    }
}
```

- [ ] **Step 7: Run tests + lint + format**

Run: `npm test && npm run lint && npm run format:check`
Expected: 345 + 3 new = 348 unit tests PASS; lint clean; format clean. (`updateSortProgress` itself is not unit-tested — `node` env has no DOM — it is exercised by Task 5's manual smoke / optional E2E.)

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js styles.css tests/media-viewer-utils.test.js
git commit -m "$(cat <<'EOF'
feat: determinate cancelable sort-progress card (component)

Add computeSortProgressView (pure, locale-independent view-model, unit
tested) and updateSortProgress (renders the existing bottom-right progress
notification as a phase + determinate bar + counts/% + Cancel card, Option
C) plus the .notification-progress styling. Wiring into the sort flow lands
in the next task.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire the progress card into the sort flow + Cancel + smoke

Route every sort-phase progress update through `updateSortProgress` (worker phases already send `current`/`total`; renderer phases pass their own counts), so the determinate card shows during real sorts and the Cancel button aborts.

**Files:**
- Modify: `media-viewer.js` — `runSortingWorker` `'progress'` handler; the renderer phases in `handleSortBySimilarity` (cache-load, hash-computation loop, "Sorting with…", insertion progress)
- Test (optional): `tests/e2e/` progress smoke

**Interfaces:**
- Consumes: `updateSortProgress({ phase, current, total })` and `clearProgressNotification()` from Task 4.
- Produces: no new exported surface; behavior change only.

- [ ] **Step 1: Pass worker `current`/`total` into the card**

In `media-viewer.js` `runSortingWorker`, the `onmessage` handler currently destructures `const { type, sortedPaths, message } = e.data;` and the `'progress'` case calls `this.updateProgressNotification(message)`. Change the destructure to include `current, total` and the case to:

```js
                    case 'progress':
                        this.updateSortProgress({ phase: message, current, total });
                        break;
```

(The worker's `updateProgress(message, current, total)` already posts all three — no worker change needed.)

- [ ] **Step 2: Route the hash-computation phase through the card**

In `handleSortBySimilarity`, the hash-computation loop updates progress via `this.updateProgressNotification(\`🔄 Processing: ${processed}/${total} ...\`)` (two call sites — the success and catch paths). Replace both with:

```js
                                    this.updateSortProgress({
                                        phase: `Computing hashes (${newHashes} new, ${skipped} skipped)`,
                                        current: processed,
                                        total,
                                    });
```

Also replace the `this.updateProgressNotification('🔄 Starting hash computation...')` and `this.updateProgressNotification(\`🔄 Sorting with ${algorithmName}...\`)` calls with indeterminate card updates:

```js
            this.updateSortProgress({ phase: 'Starting hash computation…' });
```
```js
                    this.updateSortProgress({ phase: `Sorting with ${algorithmName}…` });
```

- [ ] **Step 3: Route the cache-load + insertion phases through the card**

Replace the remaining sort-flow `updateProgressNotification` calls:
- `'🔄 Loading cached sort order...'` → `this.updateSortProgress({ phase: 'Loading cached sort order…' })` (indeterminate)
- In `insertNewFilesInSortedOrder`, both branches' `this.updateProgressNotification(\`🔄 Processing new files: ${i + 1}/${newFiles.length}\`)` → `this.updateSortProgress({ phase: 'Placing new files', current: i + 1, total: newFiles.length })`

Leave non-sort callers of `updateProgressNotification` (if any elsewhere) unchanged. Verify the sort flow no longer calls `updateProgressNotification`:
```bash
grep -n "updateProgressNotification" media-viewer.js
```
Expected: remaining hits are outside the sort path (or none). `clearProgressNotification()` in the `finally`/success/error paths of `handleSortBySimilarity` already tears down the card on every exit — confirm it is still present and unchanged.

- [ ] **Step 4: Manual smoke (required gate) + optional E2E**

Manual (hand to the user — 24k fixtures aren't E2E-able): open a large folder, run each similarity sort (VP-Tree, MST, CLIP), confirm the bottom-right card shows a phase + advancing determinate bar + counts/%, that Cancel aborts promptly during the worker phases, and that the resulting order matches the pre-change order on a spot-check.

Optional E2E (`tests/e2e/`, see the `new-e2e-test` skill): with the tiny fixture + ≥2 seeded files, trigger a sort, assert the `.notification-progress` card appears then is removed on completion, and that clicking `.progress-cancel` aborts. Use `toBeAttached()` + a `!isLoading` wait (per CLAUDE.md E2E notes), not `.toBeVisible()` on media wrappers.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run format:check`
Expected: all unit tests PASS; lint + format clean. (If the optional E2E was added: `npm run test:e2e` for that spec green.)

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js
# include tests/e2e/<file> if the optional smoke was added
git commit -m "$(cat <<'EOF'
feat: show determinate cancelable progress during similarity sorts

Route all sort-phase progress (worker graph/MST current/total, hash
computation, cache-load, new-file insertion) through updateSortProgress so
the bottom-right card shows a phase + determinate bar + counts/% with a
working Cancel. Replaces the text-only progress toast on the sort path.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- §1 progress component + protocol → Tasks 4 (component + view-model) & 5 (wiring + cancel + smoke). ✓
- §2 worker MST-fallback fix (both sorts, tie caveat, no Prim's-forest) → Task 3. ✓
- §3 `insertNewFilesInSortedOrder` yielding (both branches, every 25) → Task 2. ✓
- §4 dead-code removal → Task 1. ✓
- §5 testing (characterization + tie + view-model + yielding + manual hand-off + optional E2E) → Tasks 2,3,4,5. ✓
- §6 error handling (clear card on all exits) → Task 5 Step 3 confirms `clearProgressNotification` retained. ✓
- §8 out-of-scope (PR2 hash worker, PR3 cache streaming, #7 parallel build, K-cap) → not implemented, correct. ✓

**2. Placeholder scan:** No "TBD/TODO/handle edge cases". The `EXPECTED = []` arrays in Task 3 are an intentional capture-baseline step with explicit fill-in instructions (Step 2), not a placeholder. ✓

**3. Type consistency:** `computeSortProgressView` returns `{ phase, determinate, percent, countsText }` (Task 4 Step 3) and `updateSortProgress` consumes exactly those fields (Task 4 Step 5); both are `({ phase, current, total })`-shaped at the call sites in Task 5. `vpTree.findNearest(current, traversed)` matches the existing tested signature `findNearest(target, excludeSet)`. ✓

## Verification Checklist (from spec §10)

- [x] `npm test` green (incl. new §2/§3 tests) — **357/357 unit** (was 345)
- [x] `npm run lint` + `npm run format:check` clean
- [x] §2: characterization tests prove identical output on tie-free fixtures; tie test documents hash behavior; `findNearest`≡brute-force equivalence proven; CLIP fallback line exercised by a star-topology fixture (`d19d252`)
- [x] §1: `computeSortProgressView` view-model unit-tested (determinate/indeterminate/clamp); progress card + Cancel wired (DOM render verified by manual smoke, not unit tests — `node` env has no DOM)
- [x] §3: `insertNewFilesInSortedOrder` output unchanged with yielding (30-file regression test); abort still throws
- [x] §4: dead methods + orphaned `MinHeap`/`VPTree` removed; no remaining references
- [x] Manual: 24k-folder smoke — no freeze on worker phases, bar advances, Cancel prompt, ordering matches pre-change ✅ **PASSED 2026-06-19 (user hand-off)**

---

## Key Discoveries (closeout 2026-06-19)

- The renderer (`media-viewer.js`) carried its **own** dead `MinHeap`/`VPTree` classes plus the three `sortMediaBySimilarity*` methods — all superseded by `sorting-worker.js`'s live copies. Deleting the methods orphaned the classes; removing both cut **631 lines** (Task 1).
- The worker **already** posted `{current, total}` in its `progress` messages; `runSortingWorker` simply discarded them. The determinate bar needed no worker-protocol change — only the renderer side (Task 5).
- `updateProgressNotification` and the new `updateSortProgress` **share** `this.progressNotification`. Rebuilding that element in one renderer without a defensive null-check in the other is a latent TypeError if a non-sort progress call (ML scoring / historical-ratings) fires during an active sort card — caught in the Task 4 review, hardened in Task 5.
- Under the strict **quality-lock**, the O(n²) MST-fallback could only be replaced by `vpTree.findNearest(current, traversed)` (the existing exact-NN query). Proving "no quality change" needed three legs: capture-baseline pins **before** the swap (`723dc68`), the swap leaving those pins unchanged (`5159b0e`), and a direct `findNearest`≡brute-force equivalence test (`3d2968c`) — because a two-cluster fixture does not always *execute* the fallback line (the CLIP one didn't until a star fixture was added in `d19d252`).
- The big algorithmic cost (the O(n·K) neighbor-graph build, K≈1,550 @ 24k) is **untouched** by PR1 (quality-locked, no K-cap) — it runs off-main-thread so it doesn't freeze, but PR1 makes it transparent + cancelable rather than faster. Real raw-speed wins live in PR2 (hash off-thread) / PR3 (cache-load) / deferred #7 (parallel build).

## Future Improvements (→ BACKLOG 🟤 [2026-06-19])

1. **PR2 — hash computation off the renderer main thread** (the biggest cold-cache freeze; a separate spec/plan). Continuation of the P1 TODO item.
2. **PR3 — incremental feature-cache load** (~40s blocking → streamed batches; closes BACKLOG 🟤 [2026-05-26]). Continuation of the P1 TODO item.
3. **Optional E2E smoke for the progress card** (appear → complete → clear + Cancel aborts on the tiny fixture) — `updateSortProgress` DOM is currently only manually verified.
4. **Neighbor-graph build parallelization (workstream #7)** — the only raw-speed lever for the K-graph build under the no-quality-change rule; deferred pending measurement after PR1–PR3.
5. **CLAUDE.md / docs drift from Task 1** — "Data Structures" pattern + affected-line refs still imply the renderer owns `MinHeap`/`VPTree`; update on the next `revise-claude-md` pass.
