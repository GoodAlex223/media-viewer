# G3 Deferred Re-Score + Stable Pair Counter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two defects from the PR #66 manual smoke — a "Pair X of Y" counter that decrements then jumps, and bulk ratings that render from stale prediction scores so pairs never re-mix.

**Architecture:** Split the pair-building helper so the *unfiltered* pair count has a name, and drive the navigation counter from it (stable denominator + true position). Then make `applyBulkRating` and the `handleCancel` bulk-undo branch use the existing `pendingCompareRefresh` deferred-refresh protocol that single-file rating (`moveComparePair`) already uses, counting **messages actually posted** to the ML worker so the counter can always reach zero.

**Tech Stack:** Vanilla JS (no bundler), Electron renderer, Vitest (unit), Playwright (E2E).

**Spec:** [docs/superpowers/specs/2026-07-25-g3-rescore-and-counter-fixes-design.md](../specs/2026-07-25-g3-rescore-and-counter-fixes-design.md)

## Global Constraints

- Branch: `feat/g3-bulk-rate-repair-avoidance` (folds into PR #66). Do **not** open a new branch.
- Prettier: tabWidth=4, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always, LF.
- All new/changed methods live in the `MediaViewer` class in `media-viewer.js` at **4-space indent** — the test helper `extractMethod` matches `^\s{4}<name>\(` and will not find a method at any other indent.
- Unit tests must pass before every commit (Husky pre-commit runs `npx vitest run`). Baseline: **500 passing**.
- No `.bulk_rated.json` schema change. `bulkRatedPairs` stays session-only.
- Do not touch tournament code. This is compare-mode only.
- Mutation-verify every new guard test: temporarily break the implementation, confirm the test fails, restore. A test that passes with its guard removed is vacuous (PR #64 lesson).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `media-viewer.js` | All renderer logic | Modify: split pair helpers, counter, deferred-refresh helper + 2 call sites, 2 methods return booleans |
| `tests/ml-pair-selection.test.js` | Pure pair-selection core | Modify: ctx gains `computeAllComparePairs`; new describe block |
| `tests/media-viewer-utils.test.js` | Extracted-method behavior | Modify: counter tests rewritten; new deferred-refresh tests; 1 existing undo test updated |
| `docs/planning/BACKLOG.md` | Backlog | Modify: retire the now-reachable dead-code entry |
| `CLAUDE.md` | Durable rules | Modify: one line — deferred refresh now covers bulk rating + undo |

---

### Task 1: Split `computeAllComparePairs` / `computeValidComparePairs`

**Files:**
- Modify: `media-viewer.js:2948-2968`
- Test: `tests/ml-pair-selection.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `computeAllComparePairs(): Array<{leftFile: File, rightFile: File}>` — full extremes list, `floor(n/2)` entries, ignores suppression. Pure.
  - `computeValidComparePairs(): Array<{leftFile, rightFile}>` — unchanged public behavior; now delegates to `computeAllComparePairs()`. **Callers must provide `computeAllComparePairs` on `this`.**

- [ ] **Step 1: Update the shared test ctx so the split is visible**

In `tests/ml-pair-selection.test.js`, replace lines 30-38 with:

```js
// The REAL implementations under test (no replica — extracted from media-viewer.js source).
const bulkPairKey = extractMethod('bulkPairKey');
const computeAllComparePairs = extractMethod('computeAllComparePairs');
const computeValidComparePairs = extractMethod('computeValidComparePairs');

// Invoke computeValidComparePairs with a minimal `this`. bulkPairKey and computeAllComparePairs are
// provided on the ctx because the method calls both through `this`.
function callCompute(mediaFiles, predictionScores, bulkRatedPairs = new Set()) {
    const ctx = { mediaFiles, predictionScores, bulkRatedPairs, bulkPairKey, computeAllComparePairs };
    return computeValidComparePairs.call(ctx);
}

// Invoke computeAllComparePairs directly — it needs no suppression state.
function callComputeAll(mediaFiles, predictionScores) {
    return computeAllComparePairs.call({ mediaFiles, predictionScores });
}
```

- [ ] **Step 2: Add the failing test for the new method**

Append to `tests/ml-pair-selection.test.js`:

```js
describe('computeAllComparePairs — unfiltered pair count', () => {
    const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
    const scores = scoreMap([
        [files[0], 0.9],
        [files[1], 0.7],
        [files[2], 0.3],
        [files[3], 0.1],
    ]);

    it('returns floor(n/2) pairs in extremes order', () => {
        const pairs = callComputeAll(files, scores);
        expect(pairs).toHaveLength(2);
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
        expect(pairs[1].leftFile).toBe(files[1]);
        expect(pairs[1].rightFile).toBe(files[2]);
    });

    it('ignores suppression entirely — the count stays stable while the valid list shrinks', () => {
        const suppressed = new Set([bulkPairKey('a', 'd')]);
        expect(callCompute(files, scores, suppressed)).toHaveLength(1); // valid list shrank
        expect(callComputeAll(files, scores)).toHaveLength(2); // full count did not
    });

    it('returns an empty list for fewer than 2 files', () => {
        expect(callComputeAll([files[0]], scores)).toHaveLength(0);
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/ml-pair-selection.test.js`
Expected: FAIL — `Could not find method: computeAllComparePairs`.

- [ ] **Step 4: Implement the split**

In `media-viewer.js`, replace the whole `computeValidComparePairs` method (lines 2948-2968, including its leading comment block) with:

```js
    // Full "extremes" candidate list for AI-sorted compare (i-th highest vs i-th lowest), with no
    // suppression applied. This is the real, stable pair count — the navigation counter reads it so
    // the total never shrinks as pairs are rated nor jumps when fall-through re-admits them.
    // Pure — reads only mediaFiles / predictionScores.
    computeAllComparePairs() {
        const filesWithScores = this.mediaFiles
            .map((f) => ({ file: f, score: this.predictionScores.get(f.path) ?? 0.5 }))
            .sort((a, b) => b.score - a.score);
        const n = filesWithScores.length;
        const candidates = [];
        for (let i = 0; i < Math.floor(n / 2); i++) {
            candidates.push({
                leftFile: filesWithScores[i].file,
                rightFile: filesWithScores[n - 1 - i].file,
            });
        }
        return candidates;
    }

    // computeAllComparePairs() minus any exact two-file combo already in bulkRatedPairs. Falls
    // through to the full list when every pair is suppressed, so the user can always re-rate.
    // Pure; safe to recompute each render.
    computeValidComparePairs() {
        const candidates = this.computeAllComparePairs();
        const valid = candidates.filter(
            (p) => !this.bulkRatedPairs.has(this.bulkPairKey(p.leftFile.name, p.rightFile.name))
        );
        return valid.length ? valid : candidates;
    }
```

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS, 503 tests (500 baseline + 3 new). If `ml-pair-selection.test.js` fails with
`this.computeAllComparePairs is not a function`, Step 1 was skipped.

- [ ] **Step 6: Mutation-verify the stability test**

Temporarily change `computeAllComparePairs` to `return candidates.filter(...)` (copy the filter from
`computeValidComparePairs`). Run `npx vitest run tests/ml-pair-selection.test.js` — the "ignores
suppression entirely" test MUST fail. Restore the correct implementation and re-run.

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js tests/ml-pair-selection.test.js
git commit -m "refactor(g3): split computeAllComparePairs out of computeValidComparePairs

Gives the unfiltered pair count a name so the navigation counter can use a
stable denominator. computeValidComparePairs behavior is unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Stable positional "Pair X of Y" counter

**Files:**
- Modify: `media-viewer.js:3797-3809` (`updateNavigationInfo`)
- Test: `tests/media-viewer-utils.test.js:1875-1897` (replace the existing counter test)

**Interfaces:**
- Consumes: `computeAllComparePairs()` and `computeValidComparePairs()` from Task 1; `bulkPairKey(a, b)`.
- Produces: no new API. `updateNavigationInfo` now renders `Pair <pos> of <allPairs.length>`.

- [ ] **Step 1: Replace the existing counter test with the failing one**

In `tests/media-viewer-utils.test.js`, replace the whole `it('updateNavigationInfo shows the
valid-pairs count as the denominator', ...)` block (lines 1876-1897) with:

```js
    it('updateNavigationInfo uses the FULL pair count as the denominator (no shrink, no jump)', () => {
        const updateNavigationInfo = extractMethod('updateNavigationInfo');
        const bulkPairKey = extractMethod('bulkPairKey');
        const mediaIndex = { textContent: '' };
        const a = { name: 'a', path: '/f/a' };
        const b = { name: 'b', path: '/f/b' };
        const c = { name: 'c', path: '/f/c' };
        const d = { name: 'd', path: '/f/d' };
        const all = [
            { leftFile: a, rightFile: d },
            { leftFile: b, rightFile: c },
        ];
        const ctx = {
            isCompareMode: true,
            isSortedByPrediction: true,
            predictionScores: new Map([
                ['/f/a', 0.9],
                ['/f/b', 0.7],
                ['/f/c', 0.3],
                ['/f/d', 0.1],
            ]),
            mediaFiles: [a, b, c, d],
            mlComparePairIndex: 0,
            mediaIndex,
            bulkPairKey,
            computeAllComparePairs: () => all,
            // (a,d) was bulk-rated, so only the second pair is valid — the pre-fix code showed
            // "Pair 1 of 1" here (denominator shrank to the valid count).
            computeValidComparePairs: () => [all[1]],
        };
        updateNavigationInfo.call(ctx);
        // Denominator stays at the real pair count, and the displayed pair reports its TRUE position.
        expect(mediaIndex.textContent).toBe('Pair 2 of 2');
    });

    it('updateNavigationInfo reports position 1 with nothing suppressed', () => {
        const updateNavigationInfo = extractMethod('updateNavigationInfo');
        const bulkPairKey = extractMethod('bulkPairKey');
        const mediaIndex = { textContent: '' };
        const a = { name: 'a', path: '/f/a' };
        const b = { name: 'b', path: '/f/b' };
        const c = { name: 'c', path: '/f/c' };
        const d = { name: 'd', path: '/f/d' };
        const all = [
            { leftFile: a, rightFile: d },
            { leftFile: b, rightFile: c },
        ];
        const ctx = {
            isCompareMode: true,
            isSortedByPrediction: true,
            predictionScores: new Map([
                ['/f/a', 0.9],
                ['/f/b', 0.7],
                ['/f/c', 0.3],
                ['/f/d', 0.1],
            ]),
            mediaFiles: [a, b, c, d],
            mlComparePairIndex: 0,
            mediaIndex,
            bulkPairKey,
            computeAllComparePairs: () => all,
            computeValidComparePairs: () => all,
        };
        updateNavigationInfo.call(ctx);
        expect(mediaIndex.textContent).toBe('Pair 1 of 2');
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "FULL pair count"`
Expected: FAIL — receives `'Pair 1 of 1'`, expected `'Pair 2 of 2'`.

- [ ] **Step 3: Implement the counter**

In `media-viewer.js`, replace the ML-sorted branch inside `updateNavigationInfo` (lines 3799-3802):

```js
            // In ML sorted mode, show pair index instead of file indices
            if (this.isSortedByPrediction && this.predictionScores.size >= 2) {
                const allPairs = this.computeAllComparePairs();
                const validPairs = this.computeValidComparePairs();
                const idx = Math.min(this.mlComparePairIndex, Math.max(0, validPairs.length - 1));
                const current = validPairs[idx];
                // Report the displayed pair's position in the FULL list, so neither the numerator
                // nor the denominator moves when suppression shrinks the valid list or fall-through
                // re-admits it. Falls back to the cursor if the pair is somehow not found.
                let pos = -1;
                if (current) {
                    const key = this.bulkPairKey(current.leftFile.name, current.rightFile.name);
                    pos = allPairs.findIndex(
                        (p) => this.bulkPairKey(p.leftFile.name, p.rightFile.name) === key
                    );
                }
                this.mediaIndex.textContent = `Pair ${pos >= 0 ? pos + 1 : idx + 1} of ${allPairs.length}`;
            } else {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS.

- [ ] **Step 5: Mutation-verify**

Temporarily change the denominator back to `validPairs.length`. Run
`npx vitest run tests/media-viewer-utils.test.js -t "FULL pair count"` — it MUST fail. Restore.

- [ ] **Step 6: Run the full suite and commit**

```bash
npx vitest run
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(g3): stable Pair X of Y counter (no decrement, no jump)

The denominator was the un-rated pair count, so it shrank as pairs were
rated and sprang back on fall-through. It now reads the full extremes
count, and the numerator is the displayed pair's true position in that
list — which also retires the N>M failure mode structurally.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Defer the re-render in `applyBulkRating`

**Files:**
- Modify: `media-viewer.js:7943-7965` (`updateMlModelWithFeatures`), `media-viewer.js:7967-8017` (`applyBulkRating`), and add `_beginDeferredCompareRefresh` next to `applyBulkRating`
- Test: `tests/media-viewer-utils.test.js` (append near the existing `applyBulkRating` test at line 1557)

**Interfaces:**
- Consumes: `computeValidComparePairs()` (Task 1).
- Produces:
  - `updateMlModelWithFeatures(features, actionType): boolean` — `true` only when a message was posted to the worker.
  - `_beginDeferredCompareRefresh(expectedUpdates: number): void` — arms `pendingCompareRefresh` / `pendingCompareUpdates` / `mediaNavigationInProgress` + the 3 s fallback. Task 4 reuses this.

- [ ] **Step 1: Write the failing tests**

Append inside the same `describe` block that holds the existing `applyBulkRating` test in
`tests/media-viewer-utils.test.js`:

```js
    it('applyBulkRating defers the re-render until the model re-scores', async () => {
        vi.useFakeTimers();
        try {
            const applyBulkRating = extractAsyncMethod('applyBulkRating');
            const bulkPairKey = extractMethod('bulkPairKey');
            const showMedia = vi.fn();
            const ctx = {
                isSortedByPrediction: true,
                isCompareMode: true,
                compareLeftFile: { name: 'a.jpg', path: '/f/a.jpg' },
                compareRightFile: { name: 'z.jpg', path: '/f/z.jpg' },
                getCombinedFeatures: () => [1, 2, 3],
                updateMlModelWithFeatures: vi.fn(() => true), // both posts succeed
                bulkRated: new Map(),
                bulkRatedPairs: new Set(),
                bulkPairKey,
                saveBulkRatedFile: async () => {},
                moveHistory: [],
                mlComparePairIndex: 0,
                computeValidComparePairs: () => [{}, {}],
                showNotification: () => {},
                showMedia,
                _beginDeferredCompareRefresh: extractMethod('_beginDeferredCompareRefresh'),
            };
            await applyBulkRating.call(ctx, 'bad');

            expect(ctx.pendingCompareRefresh).toBe(true);
            expect(ctx.pendingCompareUpdates).toBe(2); // one per posted update
            expect(ctx.mediaNavigationInProgress).toBe(true);
            expect(showMedia).not.toHaveBeenCalled(); // scoreComplete renders, not us
        } finally {
            vi.useRealTimers();
        }
    });

    it('applyBulkRating renders immediately when no model update was posted', async () => {
        const applyBulkRating = extractAsyncMethod('applyBulkRating');
        const bulkPairKey = extractMethod('bulkPairKey');
        const showMedia = vi.fn();
        const ctx = {
            isSortedByPrediction: true,
            isCompareMode: true,
            compareLeftFile: { name: 'a.jpg', path: '/f/a.jpg' },
            compareRightFile: { name: 'z.jpg', path: '/f/z.jpg' },
            getCombinedFeatures: () => [1, 2, 3],
            updateMlModelWithFeatures: vi.fn(() => false), // ML off / no worker
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            bulkPairKey,
            saveBulkRatedFile: async () => {},
            moveHistory: [],
            mlComparePairIndex: 0,
            computeValidComparePairs: () => [{}, {}],
            showNotification: () => {},
            showMedia,
            _beginDeferredCompareRefresh: extractMethod('_beginDeferredCompareRefresh'),
        };
        await applyBulkRating.call(ctx, 'bad');

        // Nothing will come back from the worker — rendering must not be deferred.
        expect(ctx.pendingCompareRefresh).toBeFalsy();
        expect(showMedia).toHaveBeenCalledTimes(1);
    });

    it('the deferred-refresh fallback renders with stale scores after 3s', async () => {
        vi.useFakeTimers();
        try {
            const beginDeferred = extractMethod('_beginDeferredCompareRefresh');
            const showMedia = vi.fn();
            const ctx = { showMedia };
            beginDeferred.call(ctx, 2);
            expect(showMedia).not.toHaveBeenCalled();

            vi.advanceTimersByTime(3000);

            expect(showMedia).toHaveBeenCalledTimes(1);
            expect(ctx.pendingCompareRefresh).toBe(false);
            expect(ctx.pendingCompareUpdates).toBe(0);
            expect(ctx.mediaNavigationInProgress).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "defers the re-render"`
Expected: FAIL — `Could not find method: _beginDeferredCompareRefresh`.

- [ ] **Step 3: Make `updateMlModelWithFeatures` report whether it posted**

In `media-viewer.js`, apply three edits inside `updateMlModelWithFeatures` (lines 7943-7965):

Replace `return;` at line 7946 with `return false;`
Replace `return;` at line 7950 with `return false;`
Add `return true;` as the last statement of the method, immediately after the `this.mlWorker.postMessage({...});` call.

Also update the JSDoc line above it to note the return:

```js
    /**
     * Update ML model with pre-extracted features (used when file will be moved).
     * Returns true only when a message was actually posted to the worker — callers that await a
     * matching updateComplete must count real posts, not assume one per file.
     */
```

- [ ] **Step 4: Add the deferred-refresh helper**

In `media-viewer.js`, insert this method immediately **before** `async applyBulkRating(bucket) {`:

```js
    // Hold the compare re-render until the ML worker finishes re-scoring, then let scoreComplete
    // render from fresh scores (mirrors moveComparePair). The pairing is derived from
    // predictionScores, so rendering now would re-pair from pre-update scores and the pairs would
    // never re-mix. `expectedUpdates` MUST be the number of worker messages actually posted, or the
    // counter never reaches 0 and the view waits out the fallback.
    _beginDeferredCompareRefresh(expectedUpdates) {
        if (this.pendingCompareTimeout) {
            clearTimeout(this.pendingCompareTimeout);
            this.pendingCompareTimeout = null;
        }
        this.pendingCompareRefresh = true;
        this.pendingCompareUpdates = expectedUpdates;
        // Block spurious showMedia() calls while we wait; scoreComplete clears it.
        this.mediaNavigationInProgress = true;
        this.pendingCompareTimeout = setTimeout(() => {
            if (this.pendingCompareRefresh) {
                console.warn('[ML Debug] Compare re-score timeout — showing pair with stale scores');
                this.pendingCompareRefresh = false;
                this.pendingCompareUpdates = 0;
                this.pendingCompareTimeout = null;
                this.mediaNavigationInProgress = false;
                this.showMedia();
            }
        }, 3000);
    }
```

- [ ] **Step 5: Count posts and defer in `applyBulkRating`**

In `media-viewer.js`, replace the feature loop (lines 7974-7982):

```js
        const bulkFiles = [];
        let postedUpdates = 0;
        for (const f of [left, right]) {
            const features = this.getCombinedFeatures(f.path);
            if (features && this.updateMlModelWithFeatures(features, actionType)) {
                postedUpdates++;
            }
            bulkFiles.push({ name: f.name, features });
            this.bulkRated.set(f.name, bucket);
        }
```

Then replace the trailing render (lines 8014-8016) with:

```js
        // Defer the re-render until the model re-scores — otherwise the next pair is derived from
        // PRE-rating scores and the extremes never re-mix (the rated pair just drops out and its
        // neighbour slides in). scoreComplete calls showMedia() with fresh scores.
        if (postedUpdates > 0) {
            this._beginDeferredCompareRefresh(postedUpdates);
        } else {
            // No worker message was posted, so no scoreComplete is coming — render now.
            this.showMedia();
        }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS. The pre-existing test `applyBulkRating records the exact pair key and re-renders in
place (no advance)` still passes unchanged — it stubs `getCombinedFeatures: () => null`, so
`postedUpdates` is 0 and it takes the immediate-render path.

- [ ] **Step 7: Mutation-verify**

Temporarily change `this._beginDeferredCompareRefresh(postedUpdates)` to
`this._beginDeferredCompareRefresh(2)` and set the test's `updateMlModelWithFeatures` to
`vi.fn(() => false)` — the "renders immediately" test MUST fail. Restore both.

- [ ] **Step 8: Run the full suite and commit**

```bash
npx vitest run
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(g3): defer bulk-rating re-render until the model re-scores

applyBulkRating rendered synchronously from pre-rating predictionScores,
so the extremes never re-mixed and rated files kept re-pairing with the
same partner. It now uses the pendingCompareRefresh protocol that
moveComparePair already uses, counting messages actually posted so the
counter can always reach zero.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Defer the re-render on bulk-rating undo

**Files:**
- Modify: `media-viewer.js:8032-8042` (`reverseMlModelUpdate`), `media-viewer.js:3840-3850` (`undoBulkRating`), `media-viewer.js:3864-3877` (`handleCancel` bulk branch)
- Test: `tests/media-viewer-utils.test.js:1532-1555` (update existing) + one new test

**Interfaces:**
- Consumes: `_beginDeferredCompareRefresh(expectedUpdates)` from Task 3.
- Produces:
  - `reverseMlModelUpdate(features, actionType): boolean` — `true` only when posted.
  - `undoBulkRating(lastMove): Promise<number>` — resolves to the number of reverse-update messages posted (0-2).

- [ ] **Step 1: Update the existing undo test and add the new one**

In `tests/media-viewer-utils.test.js`, replace the two assertions at lines 1553-1554 of the
`bulk-rating undo reverses ML, returns to the rated pair, and refreshes the UI` test with:

```js
        // undoBulkRating is stubbed to return 0 posts, so this takes the immediate-render path.
        expect(ctx.requestPredictionScores).toHaveBeenCalledOnce(); // badges re-scored after ML revert
        expect(ctx.showMedia).toHaveBeenCalledOnce(); // re-render (refreshes the floating Undo button)
```

and change that test's stub at line 1537 to be explicit about the count:

```js
            undoBulkRating: vi.fn(async () => 0), // no worker posts -> render immediately
```

Then append a new test in the same `describe`:

```js
    it('bulk-rating undo defers the re-render when reverse updates were posted', async () => {
        vi.useFakeTimers();
        try {
            const ctx = commonMocks({
                isCompareMode: true,
                isSortedByPrediction: true,
                mlComparePairIndex: 5,
                undoBulkRating: vi.fn(async () => 2), // two reverseUpdate messages posted
                _beginDeferredCompareRefresh: extractMethod('_beginDeferredCompareRefresh'),
                moveHistory: [
                    {
                        bothGood: true,
                        bothBad: false,
                        bulkFiles: [{ name: 'a.jpg', features: [1, 2, 3] }],
                        prevPairIndex: 3,
                    },
                ],
            });

            await handleCancel.call(ctx);

            expect(ctx.mlComparePairIndex).toBe(3); // still restored before deferring
            expect(ctx.pendingCompareRefresh).toBe(true);
            expect(ctx.pendingCompareUpdates).toBe(2);
            // reverseUpdateComplete drives the re-score; handleCancel must not do either itself.
            expect(ctx.requestPredictionScores).not.toHaveBeenCalled();
            expect(ctx.showMedia).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "defers the re-render when reverse"`
Expected: FAIL — `pendingCompareRefresh` is `undefined` (handleCancel still renders eagerly).

- [ ] **Step 3: Make `reverseMlModelUpdate` report whether it posted**

In `media-viewer.js`, replace the guard and add a return in `reverseMlModelUpdate` (lines 8032-8042):

```js
    reverseMlModelUpdate(features, actionType) {
        if (!this.isMlEnabled || !this.mlWorker || !features) return false;

        this.mlWorker.postMessage({
            type: 'reverseUpdate',
            data: {
                features: Array.from(features),
                label: actionType === 'like' ? 1 : 0,
            },
        });
        return true;
    }
```

- [ ] **Step 4: Return the post count from `undoBulkRating`**

In `media-viewer.js`, replace the loop and add a return in `undoBulkRating` (lines 3840-3850):

```js
    // Returns the number of reverseUpdate messages actually posted, so handleCancel knows whether
    // to wait for a re-score or render immediately.
    async undoBulkRating(lastMove) {
        const actionType = lastMove.bothGood ? 'like' : 'dislike';
        let postedUpdates = 0;
        for (const f of lastMove.bulkFiles) {
            if (f.features && this.reverseMlModelUpdate(f.features, actionType)) {
                postedUpdates++;
            }
            this.bulkRated.delete(f.name);
        }
        await this.saveBulkRatedFile();
        // Re-admit the exact combo so it can reappear at its natural extreme position on re-render.
        this.bulkRatedPairs.delete(this.bulkPairKey(lastMove.bulkFiles[0].name, lastMove.bulkFiles[1].name));
        this.showNotification('↩️ Bulk rating undone', 'info');
        return postedUpdates;
    }
```

- [ ] **Step 5: Defer in the `handleCancel` bulk branch**

In `media-viewer.js`, replace the bulk branch body (lines 3868-3877):

```js
        if (lastMove.bothGood || lastMove.bothBad) {
            this.moveHistory.pop();
            const postedUpdates = await this.undoBulkRating(lastMove);
            if (typeof lastMove.prevPairIndex === 'number') {
                this.mlComparePairIndex = lastMove.prevPairIndex;
            }
            // Same deferred protocol as applyBulkRating: rendering now would pair from the
            // POST-rating scores we are in the middle of reverting, so the pair we restore could be
            // the wrong one. reverseUpdateComplete drives requestPredictionScores from here.
            if (this.isSortedByPrediction && postedUpdates > 0) {
                this._beginDeferredCompareRefresh(postedUpdates);
            } else {
                if (this.isSortedByPrediction) this.requestPredictionScores();
                await this.showMedia();
            }
            return;
        }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS.

- [ ] **Step 7: Mutation-verify**

Temporarily change the condition to `if (false && this.isSortedByPrediction && postedUpdates > 0)` —
the new deferred test MUST fail. Restore.

- [ ] **Step 8: Run the full suite and commit**

```bash
npx vitest run
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(g3): defer bulk-undo re-render until the model reverts

handleCancel rendered from the post-rating scores it was reverting, so
the restored pair could differ from the one that was rated. It now uses
the same deferred protocol, which also activates the reverseUpdateComplete
bypass that had been unreachable.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Full verification and doc reconciliation

**Files:**
- Modify: `CLAUDE.md` (one bullet), `docs/planning/BACKLOG.md` (retire one entry)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Lint and format**

Run: `npm run lint && npm run format:check`
Expected: 0 errors. One pre-existing `no-shadow` warning in `tests/media-viewer-utils.test.js` is
expected and present on `main` — do not "fix" it here.

- [ ] **Step 2: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: 55/55 passing. If a compare-mode test times out waiting for a pair to render, the deferred
protocol is not being cleared — check that the stubbed ML worker in that test posts `updateComplete`,
and fall back to asserting after the 3 s timeout rather than weakening the implementation.

- [ ] **Step 3: Update the CLAUDE.md deferred-refresh bullet**

In `CLAUDE.md`, find the bullet beginning `- ML compare refresh:` and replace it with:

```markdown
- ML compare refresh: `pendingCompareRefresh`/`pendingCompareUpdates` defer `showMedia()` until re-scoring completes (3s fallback); `mediaNavigationInProgress` prevents double-fire. Armed via `_beginDeferredCompareRefresh(n)` from `moveComparePair` (single rating), `applyBulkRating` (bulk) and `handleCancel`'s bulk-undo branch — `n` MUST be the count of worker messages actually posted (`updateMlModelWithFeatures`/`reverseMlModelUpdate` return `false` when ML is off or features are missing), or the counter never reaches 0.
```

- [ ] **Step 4: Retire the now-false BACKLOG entry**

In `docs/planning/BACKLOG.md`, find the entry titled **"Remove or document dead
`pendingCompareRefresh` bypass in `reverseUpdateComplete` handler"** and delete it, since Task 4
makes that branch reachable. If the surrounding section becomes empty, leave the section heading.

- [ ] **Step 5: Commit the docs**

```bash
git add CLAUDE.md docs/planning/BACKLOG.md
git commit -m "docs(g3): reconcile deferred-refresh docs with bulk rating + undo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Push and hand back for the manual smoke**

```bash
git push
```

Then report to the user that PR #66 needs the 6-check manual smoke **re-run on ~15-20 files** (a
4-file folder yields only 2 extremes pairs, which is degenerate for checks #1 and #2), plus one new
check: **the "Pair X of Y" total must not change as pairs are rated**.

---

## Self-Review

**Spec coverage:**
- §1 Split the pairing helper → Task 1 ✅
- §2 Stable positional counter → Task 2 ✅
- §3 Deferred re-score in `applyBulkRating` (+ boolean return, posted-count) → Task 3 ✅
- §4 Deferred re-score on undo (+ boolean return, count return) → Task 4 ✅
- §Testing unit/E2E/mutation-verify → Tasks 1-4 steps + Task 5 ✅
- D5 (no `previousScores` snapshot) → honored: no task adds one ✅
- Out-of-scope items (memoization, single-move-undo key restore, `scoreComplete`-without-scores) →
  no task touches them ✅

**Placeholder scan:** no TBD/TODO; every code step carries real code.

**Type consistency:** `computeAllComparePairs()` (Task 1) is the same name used in Tasks 2/3 ctx
stubs. `_beginDeferredCompareRefresh(expectedUpdates)` defined in Task 3 Step 4, consumed in Task 4
Step 5 with the same arity. `undoBulkRating` returns `number` (Task 4 Step 4) and is consumed as
`postedUpdates` (Task 4 Step 5); the Task 4 Step 1 stubs return `0` and `2` to match.
