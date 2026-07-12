# AI-Sort Startup UX & Incremental Cache-Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sort-by-Prediction on a 24k-file folder show an immediate determinate progress card, serve cached features incrementally, never redundantly re-extract, and cancel cleanly — by giving `handleSortByPrediction` the same lifecycle `handleSortBySimilarity` already has.

**Architecture:** `handleSortByPrediction` is restructured around a `sortAbortController` + a per-run `sortRunId` generation token. The fire-and-forget ML sort becomes an awaitable `runMlSort()` promise resolved by the `sortComplete` message handler (stale-guarded by `sortRunId`). `loadFeatureCache` gains `{signal, onProgress}` and populates `this.featureCache` incrementally. The main-process `feature-cache-chunk` IPC ships vectors as binary `Float32Array` buffers instead of JSON number-arrays. One unified progress card drives load → extract → sort; Cancel stops the load loop, the background extraction, and the pending sort.

**Tech Stack:** Electron (main + preload + renderer), Web Workers (`ml-worker.js`), Vitest (`extractMethod`/`extractAsyncMethod` source-extraction pattern), `stream-json` (main-process cache parse). No bundler in the renderer (browser globals); CommonJS in main/workers.

## Global Constraints

- **On-disk feature-cache format is UNCHANGED** — `FEATURE_CACHE_VERSION` stays `4`; JSON on disk. Optimize transport only (D6).
- **No `preload.js` change** is required (the `featureCacheChunk` bridge forwards whatever main returns). If that turns out false, the change needs a security-conscious review (context isolation / IPC bridge).
- **PR2 (hash off-thread) and the O(n·K) similarity graph build are OUT of scope**; the 🔴 TODO "Speed up AI / similarity sorting" stays OPEN.
- **`handleSortBySimilarity` control flow is NOT restructured** (it already has the pattern).
- **Extracted-method unit tests**: any method touched must stay extractable by the test harness's brace-counter — keep string/template literal braces balanced (see `assertLiteralBracesBalanced` guard in the test file).
- **Prettier**: tabWidth=4, singleQuote, semi, printWidth=120, trailingComma=es5, arrowParens=always. **ESLint**: eqeqeq, curly, prefer-const, no-var; prefix intentionally-unused vars with `_`.
- **Run `npm test` + `npm run lint` before every commit** (pre-commit hook runs `check-secrets` → lint-staged → `vitest run`). E2E is NOT run by the hook.
- **The real acceptance gate is a user-side manual smoke on the real 24k folder** — not E2E-fixturable. Unit tests cover logic; the smoke covers behavior.

---

## File Structure

- **`media-viewer.js`** (renderer, MediaViewer class) — the bulk of the work:
  - constructor: new state fields.
  - `handleMlWorkerMessage` `sortComplete` case → resolve `runMlSort`'s promise (stale-guarded).
  - new `runMlSort(allFeatures, runId)`, new `applyPredictionSortResult(result)`.
  - `handleSortByPrediction` → phased/cancelable restructure.
  - `loadFeatureCache` / `_loadFeatureCacheLocked` → `{signal, onProgress}` + incremental + binary-consume.
  - `showBackgroundExtractionProgress` + extraction loop → progress sink + abort hardening.
- **`feature-cache-transport.js`** (NEW, shared CJS — mirrors `media-formats.js`) — pure `packFeatureChunk(entries)` helper; required by both `main.js` and its Vitest test (`main.js` itself can't be `require()`d in tests — it imports `electron` and has no exports).
- **`main.js`** (main process) — requires `feature-cache-transport.js`; `feature-cache-chunk` returns the packed buffers.
- **`ml-worker.js`** — `getSortedOrder` echoes `sortRunId`.
- **`tests/media-viewer-utils.test.js`** — all new/relocated unit tests.

---

## Task 1: Extract `applyPredictionSortResult` (pure refactor, keeps suite green)

Isolate the "apply a completed ML sort" logic into its own testable method so later tasks can call it after `await runMlSort(...)`. Behavior is unchanged in this task — `sortComplete` still calls it.

**Files:**
- Modify: `media-viewer.js` (`handleMlWorkerMessage` `sortComplete` case, ~6595-6625; add `applyPredictionSortResult`)
- Test: `tests/media-viewer-utils.test.js` (relocate the two `handleMlWorkerMessage` sortComplete tests, ~932-984)

**Interfaces:**
- Produces: `applyPredictionSortResult(result)` where `result = { sortedFilenames: string[]|null, scores?: {[filename]: number}, reason?: string }`. Returns `true` if an order was applied, `false` otherwise. Mutates `this.mediaFiles`, `this.currentIndex`, `this.isSortedByPrediction`, `this.predictionScores`; calls `this.showMedia()`, `this.updateSortPredictionButton()`, `this.showNotification()`.

- [ ] **Step 1: Write failing tests for the new method**

Replace the two existing `handleMlWorkerMessage` sortComplete tests (~932-984) with tests targeting the extracted method. Add near the other `extractMethod` consts: `const applyPredictionSortResult = extractMethod('applyPredictionSortResult');`

```javascript
describe('applyPredictionSortResult', () => {
    const applyPredictionSortResult = extractMethod('applyPredictionSortResult');

    function baseCtx() {
        return {
            mediaFiles: [
                { name: 'a.png', path: '/d/a.png' },
                { name: 'b.png', path: '/d/b.png' },
                { name: 'c.png', path: '/d/c.png' },
            ],
            predictionScores: new Map(),
            currentIndex: 2,
            isSortedByPrediction: false,
            showMedia: () => {},
            updateSortPredictionButton: () => {},
            showNotification: () => {},
        };
    }

    it('reorders mediaFiles and syncs predictionScores from scores', () => {
        const ctx = baseCtx();
        const applied = applyPredictionSortResult.call(ctx, {
            sortedFilenames: ['b.png', 'a.png', 'c.png'],
            scores: { 'a.png': 0.3, 'b.png': 0.95, 'c.png': 0.1 },
        });
        expect(applied).toBe(true);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b.png', 'a.png', 'c.png']);
        expect(ctx.predictionScores.get('/d/b.png')).toBe(0.95);
        expect(ctx.isSortedByPrediction).toBe(true);
        expect(ctx.currentIndex).toBe(0);
    });

    it('does not throw when scores is absent', () => {
        const ctx = baseCtx();
        expect(() => applyPredictionSortResult.call(ctx, { sortedFilenames: ['a.png', 'b.png', 'c.png'] })).not.toThrow();
        expect(ctx.isSortedByPrediction).toBe(true);
    });

    it('returns false and leaves state unsorted when sortedFilenames is null', () => {
        const ctx = baseCtx();
        const applied = applyPredictionSortResult.call(ctx, { sortedFilenames: null, reason: 'not enough ratings' });
        expect(applied).toBe(false);
        expect(ctx.isSortedByPrediction).toBe(false);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a.png', 'b.png', 'c.png']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t applyPredictionSortResult`
Expected: FAIL — `Could not find method: applyPredictionSortResult`.

- [ ] **Step 3: Add the method and delegate from `sortComplete`**

Add the method next to `handleMlWorkerMessage` (e.g. just after it). Note: it does NOT call `clearProgressNotification` — the caller owns the card now.

```javascript
    // Apply a completed ML sort result to the file list. Returns true if an order was applied.
    applyPredictionSortResult(result) {
        if (!result || !result.sortedFilenames) {
            this.showNotification(result?.reason || 'Could not sort files', 'warning');
            return false;
        }
        const filenameToFile = new Map(this.mediaFiles.map((f) => [f.name, f]));
        const sorted = result.sortedFilenames.map((name) => filenameToFile.get(name)).filter((f) => f);
        if (sorted.length === 0) {
            this.showNotification('No files to sort', 'warning');
            return false;
        }
        // Sync prediction scores so badges align with the re-ordered files.
        if (result.scores) {
            for (const [filename, score] of Object.entries(result.scores)) {
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
        return true;
    }
```

Replace the body of the `sortComplete` case (~6595-6625) with a delegation that preserves current behavior:

```javascript
            case 'sortComplete':
                this.clearProgressNotification(); // Clear "Scoring" progress
                this.applyPredictionSortResult({
                    sortedFilenames: message.sortedFilenames,
                    scores: message.scores,
                    reason: message.reason,
                });
                break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t applyPredictionSortResult`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + lint + commit**

```bash
npx vitest run && npm run lint
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "refactor(g1): extract applyPredictionSortResult from sortComplete handler"
```
Expected: 434 tests → still all green (case count net-neutral: −2 old, +3 new).

---

## Task 2: Awaitable `runMlSort` + `sortRunId` stale-guard + worker echo

Make the ML sort awaitable and cancel-safe. `sortComplete` stops applying the order directly and instead resolves a pending promise, guarded so a stale/cancelled completion is ignored.

**Files:**
- Modify: `media-viewer.js` (constructor state; `handleMlWorkerMessage` `sortComplete` case; add `runMlSort`)
- Modify: `ml-worker.js` (`getSortedOrder` echoes `sortRunId`; its `case 'getSortedOrder'` passes it through)
- Test: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `applyPredictionSortResult` (Task 1) — no longer called from `sortComplete`; the awaiting caller (Task 3) calls it.
- Produces:
  - state `this.sortRunId` (number, init 0), `this._mlSortResolve` / `this._mlSortReject` (init null).
  - `runMlSort(allFeatures, runId)` → `Promise<{ sortedFilenames, scores, reason }>`. Posts `{type:'getSortedOrder', data:{allFeatures, sortRunId: runId}}`; resolves when a matching `sortComplete` arrives.
  - `sortComplete` message shape now includes `sortRunId` (echoed by the worker).

- [ ] **Step 1: Add constructor state**

Find the constructor block near `this.extractionRunId = 0;` (~150) and add:

```javascript
        this.sortRunId = 0; // Generation counter — ignores a stale/cancelled ML sortComplete.
        this._mlSortResolve = null;
        this._mlSortReject = null;
        this.isPredictionSorting = false; // re-entrancy guard for handleSortByPrediction
        this.extractionProgressSink = null; // when set, extraction reports here instead of its own indicator
```

- [ ] **Step 2: Write failing tests for the stale-guard**

```javascript
describe('sortComplete stale-guard + runMlSort resolution', () => {
    const handleMlWorkerMessage = extractMethod('handleMlWorkerMessage');

    it('ignores a sortComplete whose sortRunId does not match the current run', () => {
        let resolved = null;
        const ctx = {
            sortRunId: 5,
            _mlSortResolve: (v) => (resolved = v),
            _mlSortReject: null,
            clearProgressNotification: () => {},
        };
        handleMlWorkerMessage.call(ctx, {
            type: 'sortComplete',
            sortRunId: 4, // stale
            sortedFilenames: ['a.png'],
        });
        expect(resolved).toBeNull(); // resolver NOT called
    });

    it('resolves the pending promise when sortRunId matches', () => {
        let resolved = null;
        const ctx = {
            sortRunId: 5,
            _mlSortResolve: (v) => (resolved = v),
            _mlSortReject: null,
            clearProgressNotification: () => {},
        };
        handleMlWorkerMessage.call(ctx, {
            type: 'sortComplete',
            sortRunId: 5,
            sortedFilenames: ['b.png', 'a.png'],
            scores: { 'a.png': 0.1, 'b.png': 0.9 },
        });
        expect(resolved).toEqual({
            sortedFilenames: ['b.png', 'a.png'],
            scores: { 'a.png': 0.1, 'b.png': 0.9 },
            reason: undefined,
        });
        expect(ctx._mlSortResolve).toBeNull(); // cleared after resolving
    });

    it('treats a sortComplete with no sortRunId (legacy) as matching', () => {
        let resolved = null;
        const ctx = { sortRunId: 0, _mlSortResolve: (v) => (resolved = v), _mlSortReject: null, clearProgressNotification: () => {} };
        handleMlWorkerMessage.call(ctx, { type: 'sortComplete', sortedFilenames: ['a.png'] });
        expect(resolved).not.toBeNull();
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "stale-guard"`
Expected: FAIL — current `sortComplete` calls `applyPredictionSortResult`, not the resolver.

- [ ] **Step 4: Rewrite the `sortComplete` case to resolve the promise**

```javascript
            case 'sortComplete': {
                // Ignore a completion from a superseded or cancelled run (guarded by the
                // generation token). A legacy worker that doesn't echo sortRunId is treated
                // as matching (undefined !== a number would wrongly drop it).
                if (message.sortRunId !== undefined && message.sortRunId !== this.sortRunId) {
                    break;
                }
                this.clearProgressNotification(); // Clear "Scoring" progress
                const resolve = this._mlSortResolve;
                this._mlSortResolve = null;
                this._mlSortReject = null;
                if (resolve) {
                    resolve({
                        sortedFilenames: message.sortedFilenames,
                        scores: message.scores,
                        reason: message.reason,
                    });
                }
                break;
            }
```

- [ ] **Step 5: Add `runMlSort`**

Add near `requestPredictionScores` (~7325):

```javascript
    // Await one ML sort round-trip. Resolves when a sortComplete with a matching
    // sortRunId arrives (see handleMlWorkerMessage). The persistent mlWorker means we
    // can't use runSortingWorker's fresh-worker pattern — a pending resolver bridges it.
    runMlSort(allFeatures, runId) {
        return new Promise((resolve, reject) => {
            this._mlSortResolve = resolve;
            this._mlSortReject = reject;
            this.mlWorker.postMessage({
                type: 'getSortedOrder',
                data: { allFeatures, sortRunId: runId },
            });
        });
    }
```

- [ ] **Step 6: Echo `sortRunId` from the worker**

In `ml-worker.js`, change `getSortedOrder` (~205) to accept and echo the id:

```javascript
function getSortedOrder(allFeatures, sortRunId) {
    const scoreResult = scoreFiles(allFeatures);
    if (!scoreResult.scores) {
        return { type: 'sortComplete', sortedFilenames: null, reason: scoreResult.reason, sortRunId };
    }
    const sortedFilenames = Object.keys(scoreResult.scores).sort((a, b) => scoreResult.scores[b] - scoreResult.scores[a]);
    return { type: 'sortComplete', sortedFilenames, scores: scoreResult.scores, stats: model.getStats(), sortRunId };
}
```

And its `case 'getSortedOrder'` (~321-325):

```javascript
        case 'getSortedOrder':
            try {
                const sortResult = getSortedOrder(data.allFeatures || {}, data.sortRunId);
                self.postMessage(sortResult);
```

- [ ] **Step 7: Run tests + lint + commit**

```bash
npx vitest run tests/media-viewer-utils.test.js -t "stale-guard" && npx vitest run && npm run lint
git add media-viewer.js ml-worker.js tests/media-viewer-utils.test.js
git commit -m "feat(g1): awaitable runMlSort with sortRunId stale-guard"
```
Expected: new tests PASS; full suite green.

---

## Task 3: Restructure `handleSortByPrediction` — phased, cancelable lifecycle

Rebuild the AI-sort control flow to mirror `handleSortBySimilarity`: create the abort controller, render the card immediately, run phased progress, check the signal at every boundary, await `runMlSort`, apply via `applyPredictionSortResult`, and clean up in `finally`.

**Files:**
- Modify: `media-viewer.js` (`handleSortByPrediction`, ~7477-7573)
- Test: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `runMlSort(allFeatures, runId)` (Task 2), `applyPredictionSortResult(result)` (Task 1), `loadFeatureCache({signal, onProgress})` (Task 4 — until Task 4 lands, `loadFeatureCache` ignores the options arg, which is harmless), `startBackgroundFeatureExtraction()` + `cancelBackgroundExtraction()` (existing), `updateSortProgress`, `clearProgressNotification`, `sortAbortController`.
- Produces: the restructured method. On cancel/error, leaves the list unsorted.

- [ ] **Step 1: Write failing tests**

These extract `handleSortByPrediction` and drive it with a fully-mocked ctx. Because the method is long, the mock supplies every `this.*` it touches. Add:

```javascript
describe('handleSortByPrediction lifecycle', () => {
    const handleSortByPrediction = extractAsyncMethod('handleSortByPrediction');

    function makeCtx(overrides = {}) {
        const phases = [];
        const ctx = {
            isTournamentMode: false,
            isMlEnabled: true,
            isSortedByPrediction: false,
            mlWorker: {},
            featureWorkers: [{}],
            mlStats: { isReady: true },
            mediaFiles: [
                { name: 'a.png', path: '/d/a.png' },
                { name: 'b.png', path: '/d/b.png' },
            ],
            originalMediaFiles: [],
            featureCache: new Map([
                ['/d/a.png', new Float32Array(64)],
                ['/d/b.png', new Float32Array(64)],
            ]),
            sortAbortController: null,
            sortRunId: 0,
            isPredictionSorting: false,
            extractionProgressSink: null,
            enableClipFeatures: false,
            // spies / stubs:
            showNotification: () => {},
            updateSortPredictionButton: () => {},
            updateSortProgress: (p) => phases.push(p.phase),
            clearProgressNotification: () => {},
            loadFeatureCache: () => Promise.resolve(),
            startBackgroundFeatureExtraction: () => Promise.resolve(),
            cancelBackgroundExtraction: () => {},
            getCombinedFeatures: (p) => new Float32Array(576),
            trainFromHistoricalRatingsAndWait: () => Promise.resolve(),
            loadMlModel: () => Promise.resolve(),
            initializeMlWorker: () => {},
            initializeFeaturePool: () => {},
            initClipModel: () => {},
            runMlSort: () => Promise.resolve({ sortedFilenames: ['b.png', 'a.png'], scores: {} }),
            applyPredictionSortResult: function (r) {
                this.mediaFiles = r.sortedFilenames.map((n) => this.mediaFiles.find((f) => f.name === n));
                this.isSortedByPrediction = true;
                return true;
            },
            showMedia: () => {},
            ...overrides,
        };
        ctx._phases = phases;
        return ctx;
    }

    it('renders a progress card before the first await and applies the sort', async () => {
        const ctx = makeCtx();
        await handleSortByPrediction.call(ctx);
        expect(ctx._phases[0]).toMatch(/Preparing|Loading/);
        expect(ctx.isSortedByPrediction).toBe(true);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b.png', 'a.png']);
        expect(ctx.sortAbortController).toBeNull(); // finally cleaned up
        expect(ctx.isPredictionSorting).toBe(false);
    });

    it('bails unsorted when aborted during the load phase', async () => {
        const ctx = makeCtx({
            loadFeatureCache: function () {
                this.sortAbortController.abort(); // user cancels mid-load
                return Promise.resolve();
            },
            runMlSort: () => {
                throw new Error('runMlSort must not be reached after cancel');
            },
        });
        await handleSortByPrediction.call(ctx);
        expect(ctx.isSortedByPrediction).toBe(false);
        expect(ctx.sortAbortController).toBeNull();
        expect(ctx.isPredictionSorting).toBe(false);
    });

    it('is a no-op re-entrant call while a sort is already running', async () => {
        const ctx = makeCtx({ isPredictionSorting: true });
        await handleSortByPrediction.call(ctx);
        expect(ctx._phases.length).toBe(0); // returned immediately
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "handleSortByPrediction lifecycle"`
Expected: FAIL (current method has no controller/phases/finally; `_phases[0]` undefined, etc.).

- [ ] **Step 3: Rewrite `handleSortByPrediction`**

Replace the whole method (~7477-7573) with:

```javascript
    async handleSortByPrediction() {
        if (this.isTournamentMode) return;
        if (this.isPredictionSorting) return; // re-entrancy guard; Cancel is the abort affordance
        if (!this.isMlEnabled) {
            this.showNotification('ML prediction is disabled', 'warning');
            return;
        }

        // Toggle off — restore original order (unchanged behavior).
        if (this.isSortedByPrediction) {
            if (this.originalMediaFiles.length > 0) {
                const currentPaths = new Set(this.mediaFiles.map((f) => f.path));
                this.mediaFiles = this.originalMediaFiles.filter((f) => currentPaths.has(f.path));
            }
            this.isSortedByPrediction = false;
            this.mlComparePairIndex = 0;
            this.currentIndex = 0;
            await this.showMedia();
            this.updateSortPredictionButton();
            this.showNotification('Restored original order', 'info');
            return;
        }

        this.isPredictionSorting = true;
        this.sortAbortController = new AbortController();
        const runId = ++this.sortRunId;
        const signal = this.sortAbortController.signal;
        // Cancel must also stop an in-progress background extraction (frees CPU).
        signal.addEventListener('abort', () => this.cancelBackgroundExtraction(), { once: true });
        this.updateSortProgress({ phase: 'Preparing…' }); // card visible before any await

        try {
            // Lazy ML init on first use.
            if (!this.mlWorker || this.featureWorkers.length === 0) {
                this.initializeMlWorker();
                this.initializeFeaturePool();
                if (this.enableClipFeatures) this.initClipModel();
                await new Promise((resolve) => setTimeout(resolve, 100));
                await this.loadMlModel();
            }

            // Phase 1 — load cached features (incremental + determinate + cancelable).
            await this.loadFeatureCache({
                signal,
                onProgress: (current, total) =>
                    this.updateSortProgress({ phase: 'Loading cached features…', current, total }),
            });
            if (signal.aborted) throw new Error('cancelled');

            // Train from historical ratings if needed.
            if (!this.mlStats?.isReady) {
                this.updateSortProgress({ phase: 'Training model…' });
                await this.trainFromHistoricalRatingsAndWait();
                this.updateSortPredictionButton();
            }
            if (!this.mlStats?.isReady) {
                this.showNotification(
                    `Need more ratings (${this.mlStats?.positiveCount || 0} likes, ${this.mlStats?.negativeCount || 0} dislikes)`,
                    'warning'
                );
                return;
            }

            this.originalMediaFiles = [...this.mediaFiles];

            // Phase 2 — extract any missing features (drives the SAME card via the sink).
            const uncachedFiles = this.mediaFiles.filter((f) => !this.featureCache.has(f.path));
            if (uncachedFiles.length > 0) {
                this.extractionProgressSink = (current, total) =>
                    this.updateSortProgress({ phase: 'Extracting features…', current, total });
                try {
                    await this.startBackgroundFeatureExtraction();
                } finally {
                    this.extractionProgressSink = null;
                }
            }
            if (signal.aborted) throw new Error('cancelled');

            // Collect features.
            const allFeatures = {};
            for (const file of this.mediaFiles) {
                const combined = this.getCombinedFeatures(file.path);
                if (combined) allFeatures[file.name] = combined;
            }
            if (Object.keys(allFeatures).length === 0) {
                this.showNotification('Could not extract features from any files', 'error');
                return;
            }

            // Phase 3 — sort (awaitable, stale-guarded).
            this.updateSortProgress({ phase: 'Sorting…' });
            const result = await this.runMlSort(allFeatures, runId);
            if (signal.aborted || runId !== this.sortRunId) throw new Error('cancelled');
            this.applyPredictionSortResult(result);
        } catch (err) {
            if (signal.aborted || err.message === 'cancelled') {
                this.showNotification('Sorting cancelled', 'info');
            } else {
                console.error('Error sorting by prediction:', err);
                this.showNotification(`Could not sort: ${err.message}`, 'warning');
            }
        } finally {
            this.clearProgressNotification();
            this.sortAbortController = null;
            this.isPredictionSorting = false;
            this.extractionProgressSink = null;
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "handleSortByPrediction lifecycle"`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + lint + commit**

```bash
npx vitest run && npm run lint
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(g1): phased cancelable lifecycle for handleSortByPrediction"
```

---

## Task 4: `loadFeatureCache` — `{signal, onProgress}` + incremental populate

Give the cache load a cancel signal and progress callback, populate `this.featureCache` per chunk, and drop the per-entry `await path.join`. Keep invalidation-safety: a `notFound`/version-mismatch must not silently wipe a good in-memory cache except via the explicit reset that already exists.

**Files:**
- Modify: `media-viewer.js` (`loadFeatureCache` ~6715, `_loadFeatureCacheImpl` ~6731, `_loadFeatureCacheLocked` ~6741)
- Test: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `window.electronAPI.featureCacheOpen/Chunk/Close` (existing shape until Task 5).
- Produces: `loadFeatureCache({ signal, onProgress } = {})` — threads options through to `_loadFeatureCacheLocked`. `onProgress(loaded, total)` called after each chunk; `signal.aborted` stops the loop. `this.featureCache` populated incrementally.

- [ ] **Step 1: Write failing tests**

`_loadFeatureCacheLocked` is the async worker; extract and drive it with a mocked `window.electronAPI`. Patch `globalThis.window` in `beforeEach`/`afterEach` (existing pattern in this file).

```javascript
describe('loadFeatureCache incremental + signal', () => {
    const loadFeatureCacheLocked = extractAsyncMethod('_loadFeatureCacheLocked');

    const savedWindow = globalThis.window;
    afterEach(() => {
        globalThis.window = savedWindow;
    });

    function mkFile(name, size, mtime) {
        return { name, path: '/d/' + name, size, mtimeMs: mtime };
    }
    function mkEntry(size, mtime) {
        return { vector: Array.from({ length: 64 }, () => 0.1), clipVector: null, size, mtime };
    }

    function installApi(chunks, { version = 4, count } = {}) {
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: true, version, count: count ?? chunks.flat().length }),
                featureCacheChunk: (offset, limit) =>
                    Promise.resolve({ entries: chunks.flat().slice(offset, offset + limit) }),
                featureCacheClose: () => Promise.resolve({ success: true }),
            },
        };
    }

    it('populates this.featureCache incrementally and reports progress', async () => {
        const files = [mkFile('a.png', 10, 100), mkFile('b.png', 20, 200)];
        installApi([[['a.png', mkEntry(10, 100)], ['b.png', mkEntry(20, 200)]]]);
        const seen = [];
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, { onProgress: (c, t) => seen.push([c, t]) });
        expect(ctx.featureCache.size).toBe(2);
        expect(seen[seen.length - 1][0]).toBe(2); // final progress reached total
    });

    it('stops on signal.aborted without loading everything', async () => {
        const files = Array.from({ length: 5 }, (_, i) => mkFile(`f${i}.png`, i, i));
        installApi([files.map((f) => [f.name, mkEntry(f.size, f.mtimeMs)])], { count: 5 });
        const controller = new AbortController();
        controller.abort(); // aborted before the first chunk
        const ctx = { baseFolderPath: '/d', mediaFiles: files, featureCache: new Map(), featureMetadata: new Map(), clipCache: new Map() };
        await loadFeatureCacheLocked.call(ctx, { signal: controller.signal });
        expect(ctx.featureCache.size).toBe(0);
    });

    it('leaves an existing cache untouched when the file is not found', async () => {
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: false, notFound: true }),
                featureCacheClose: () => Promise.resolve({ success: true }),
                readFile: () => Promise.resolve(null),
            },
        };
        const existing = new Map([['/d/a.png', new Float32Array(64)]]);
        const ctx = { baseFolderPath: '/d', mediaFiles: [mkFile('a.png', 10, 100)], featureCache: existing, featureMetadata: new Map(), clipCache: new Map() };
        await loadFeatureCacheLocked.call(ctx, {});
        expect(ctx.featureCache).toBe(existing); // same reference, not replaced
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "loadFeatureCache incremental"`
Expected: FAIL — current signature ignores options; `onProgress` never called; abort not honored.

- [ ] **Step 3: Thread options through the three methods**

```javascript
    async loadFeatureCache(options = {}) {
        if (this._featureCacheLoadPromise) {
            return this._featureCacheLoadPromise;
        }
        this._featureCacheLoadPromise = this._loadFeatureCacheImpl(options);
        try {
            return await this._featureCacheLoadPromise;
        } finally {
            this._featureCacheLoadPromise = null;
        }
    }

    async _loadFeatureCacheImpl(options = {}) {
        if (!this.baseFolderPath) return 0;
        const releaseIoLock = await this._acquireCacheIoLock();
        try {
            return await this._loadFeatureCacheLocked(options);
        } finally {
            releaseIoLock();
        }
    }
```

- [ ] **Step 4: Rewrite the streaming path in `_loadFeatureCacheLocked` for incremental + signal + no per-entry await**

Change the method signature to `async _loadFeatureCacheLocked({ signal, onProgress } = {}) {`. Replace the `processEntry` closure and the streaming `if (window.electronAPI.featureCacheOpen)` block (~6755-6809) with:

```javascript
        // Precompute the path prefix ONCE (path.join is sync in preload, but ~24k awaits in
        // the hot loop is needless churn — string-concat instead).
        const sep = this.baseFolderPath.includes('\\') ? '\\' : '/';
        const makePath = (filename) => this.baseFolderPath + sep + filename;

        // Validate + ingest one entry directly into the live caches. `vector` is a Float32Array.
        const ingest = (filename, vector, clipVector, size, mtime) => {
            const currentFile = currentFiles.get(filename);
            if (!currentFile) return; // pruned — file no longer in folder
            if (vector.length !== expectedDim) return; // wrong dimension
            if (size !== currentFile.size || mtime !== currentFile.mtimeMs) return; // stale
            const fullPath = makePath(filename);
            this.featureCache.set(fullPath, vector);
            this.featureMetadata.set(fullPath, { size, mtime });
            if (clipVector && clipVector.length === 512) {
                this.clipCache.set(fullPath, clipVector);
            }
        };

        if (window.electronAPI.featureCacheOpen) {
            try {
                const opened = await window.electronAPI.featureCacheOpen(cacheFile);
                if (!opened.success) {
                    return 0; // notFound/parse error — leave existing cache untouched
                }
                if (opened.version !== MediaViewer.FEATURE_CACHE_VERSION) {
                    console.warn(
                        `Feature cache version mismatch: found=${opened.version}, expected=${MediaViewer.FEATURE_CACHE_VERSION}. Cache will be invalidated.`
                    );
                    await window.electronAPI.featureCacheClose();
                    this.featureCache = new Map();
                    this.featureMetadata = new Map();
                    return 0;
                }
                // Confirmed valid — adopt a fresh cache and populate it incrementally.
                this.featureCache = new Map();
                this.featureMetadata = new Map();
                const total = opened.count;
                const CHUNK = 1000;
                let loaded = 0;
                for (let offset = 0; offset < total; offset += CHUNK) {
                    if (signal?.aborted) break;
                    const { entries } = await window.electronAPI.featureCacheChunk(offset, CHUNK);
                    for (const [filename, entry] of entries) {
                        ingest(
                            filename,
                            new Float32Array(entry.vector),
                            entry.clipVector ? new Float32Array(entry.clipVector) : null,
                            entry.size,
                            entry.mtime
                        );
                    }
                    loaded += entries.length;
                    if (onProgress) onProgress(loaded, total);
                }
                await window.electronAPI.featureCacheClose();
                return this.featureCache.size;
            } catch (error) {
                console.log('Feature cache streaming load failed, falling back to direct read:', error.message);
                try {
                    await window.electronAPI.featureCacheClose();
                } catch (_e) {
                    // ignore
                }
                // fall through to legacy path
            }
        }
```

Then update the legacy fallback block (~6811-6835) to use `ingest` instead of the deleted `processEntry`, and to populate `this.featureCache` directly (it may already have been reset above):

```javascript
        try {
            const data = await window.electronAPI.readFile(cacheFile);
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.version !== MediaViewer.FEATURE_CACHE_VERSION) {
                    console.warn(
                        `Feature cache version mismatch: found=${parsed.version}, expected=${MediaViewer.FEATURE_CACHE_VERSION}. Cache will be invalidated.`
                    );
                    this.featureCache = new Map();
                    this.featureMetadata = new Map();
                    return 0;
                }
                this.featureCache = new Map();
                this.featureMetadata = new Map();
                for (const [filename, entry] of Object.entries(parsed.features || {})) {
                    ingest(
                        filename,
                        new Float32Array(entry.vector),
                        entry.clipVector ? new Float32Array(entry.clipVector) : null,
                        entry.size,
                        entry.mtime
                    );
                }
                return this.featureCache.size;
            }
        } catch (error) {
            console.log('No feature cache found or error loading:', error.message);
        }
        return 0;
```

Note: the `expectedDim`, `currentFiles`, `freshFeatureCache`/`freshFeatureMetadata` locals at the top (~6747-6753) — keep `expectedDim` and `currentFiles`; **delete** the now-unused `freshFeatureCache` / `freshFeatureMetadata` locals.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "loadFeatureCache incremental"`
Expected: PASS (3 tests).

- [ ] **Step 6: Full suite + lint + commit**

```bash
npx vitest run && npm run lint
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(g1): incremental cancelable loadFeatureCache with progress"
```

---

## Task 5: Binary transport for `feature-cache-chunk`

Ship vectors as `Float32Array` buffers rather than JSON number-arrays, and consume them zero-rebuild in the renderer, with the JSON `entries` shape kept as a fallback.

**Files:**
- Create: `feature-cache-transport.js` (shared CJS — pure `packFeatureChunk`)
- Modify: `main.js` (require the new module; `feature-cache-chunk` ~498 returns the packed shape)
- Modify: `media-viewer.js` (`_loadFeatureCacheLocked` streaming loop — consume the binary shape; keep the JSON-`entries` branch as fallback)
- Modify: `eslint.config.mjs` (add `feature-cache-transport.js` to the shared-libs file-group glob alongside `media-formats.js`)
- Test: `tests/feature-cache-transport.test.js` (pure packing) + `tests/media-viewer-utils.test.js` (renderer consume of the binary shape)

**Interfaces:**
- Produces: `feature-cache-chunk` returns `{ names: string[], sizes: number[], mtimes: number[], vecBuf: ArrayBuffer, clipBuf: ArrayBuffer|null, hasClip: number[] }` where `vecBuf` is `n*64` little-endian f32, `clipBuf` is `n*512` f32 (full-width; entries without clip have `hasClip[i]===0` and their clip slot is ignored). The old `{ entries }` shape is still returned when `featureDim` is unknown (fallback). Renderer detects binary by presence of `vecBuf`.

- [ ] **Step 1: Write a failing test for the pure packing helper**

`main.js` can't be `require()`d in Vitest (it imports `electron` and has no exports), so the pure packer lives in a shared CJS module `feature-cache-transport.js` (same pattern as `media-formats.js`). Add the test in `tests/feature-cache-transport.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { packFeatureChunk } = require('../feature-cache-transport');

describe('packFeatureChunk', () => {
    it('packs vectors into an n*64 f32 buffer and clip into n*512 with a mask', () => {
        const entries = [
            ['a.png', { vector: new Array(64).fill(0.5), clipVector: new Array(512).fill(0.25), size: 1, mtime: 2 }],
            ['b.png', { vector: new Array(64).fill(0.75), clipVector: null, size: 3, mtime: 4 }],
        ];
        const out = packFeatureChunk(entries);
        expect(out.names).toEqual(['a.png', 'b.png']);
        expect(out.sizes).toEqual([1, 3]);
        expect(out.mtimes).toEqual([2, 4]);
        expect(out.hasClip).toEqual([1, 0]);
        const vecs = new Float32Array(out.vecBuf);
        expect(vecs.length).toBe(2 * 64);
        expect(vecs[0]).toBeCloseTo(0.5);
        expect(vecs[64]).toBeCloseTo(0.75);
        const clips = new Float32Array(out.clipBuf);
        expect(clips[0]).toBeCloseTo(0.25);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/feature-cache-transport.test.js`
Expected: FAIL — `packFeatureChunk` is not exported.

- [ ] **Step 3: Create `feature-cache-transport.js` with `packFeatureChunk`, and require it in `main.js`**

Create `feature-cache-transport.js` at the repo root:

```javascript
// Pack a slice of [filename, entry] pairs into transferable typed-array buffers.
// vecBuf = n*64 f32, clipBuf = n*512 f32 (full-width; hasClip[i]===0 means ignore slot i).
function packFeatureChunk(entries) {
    const n = entries.length;
    const names = new Array(n);
    const sizes = new Array(n);
    const mtimes = new Array(n);
    const hasClip = new Array(n);
    const vecs = new Float32Array(n * 64);
    const clips = new Float32Array(n * 512);
    for (let i = 0; i < n; i++) {
        const [filename, entry] = entries[i];
        names[i] = filename;
        sizes[i] = entry.size;
        mtimes[i] = entry.mtime;
        const v = entry.vector || [];
        for (let j = 0; j < 64 && j < v.length; j++) vecs[i * 64 + j] = v[j];
        if (entry.clipVector && entry.clipVector.length === 512) {
            hasClip[i] = 1;
            const c = entry.clipVector;
            for (let j = 0; j < 512; j++) clips[i * 512 + j] = c[j];
        } else {
            hasClip[i] = 0;
        }
    }
    return { names, sizes, mtimes, hasClip, vecBuf: vecs.buffer, clipBuf: clips.buffer };
}

module.exports = { packFeatureChunk };
```

In `main.js`, require it near the other shared-CJS import (`const { isMediaFile, getMimeType } = require('./media-formats');` at the top):

```javascript
const { packFeatureChunk } = require('./feature-cache-transport');
```

Add `feature-cache-transport.js` to the shared-libs block glob in `eslint.config.mjs` (the block that already lists `media-formats.js`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/feature-cache-transport.test.js`
Expected: PASS.

- [ ] **Step 5: Wire `feature-cache-chunk` to return the binary shape**

```javascript
    ipcMain.handle('feature-cache-chunk', async (_event, offset, limit) => {
        if (!featureCacheSession) return { entries: [] };
        const slice = featureCacheSession.slice(offset, offset + limit);
        return packFeatureChunk(slice);
    });
```

- [ ] **Step 6: Write a failing renderer-consume test**

Add to the `loadFeatureCache incremental` describe a case where the chunk API returns the binary shape:

```javascript
    it('consumes the binary chunk shape (vecBuf/clipBuf) into the caches', async () => {
        const files = [mkFile('a.png', 10, 100)];
        const vecs = new Float32Array(64).fill(0.5);
        const clips = new Float32Array(512).fill(0.25);
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: true, version: 4, count: 1 }),
                featureCacheChunk: () =>
                    Promise.resolve({
                        names: ['a.png'],
                        sizes: [10],
                        mtimes: [100],
                        hasClip: [1],
                        vecBuf: vecs.buffer,
                        clipBuf: clips.buffer,
                    }),
                featureCacheClose: () => Promise.resolve({ success: true }),
            },
        };
        const ctx = { baseFolderPath: '/d', mediaFiles: files, featureCache: new Map(), featureMetadata: new Map(), clipCache: new Map() };
        await loadFeatureCacheLocked.call(ctx, {});
        expect(ctx.featureCache.get('/d/a.png')[0]).toBeCloseTo(0.5);
        expect(ctx.clipCache.get('/d/a.png')[0]).toBeCloseTo(0.25);
    });
```

- [ ] **Step 7: Run to verify it fails, then update the renderer loop to detect binary**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "binary chunk shape"` → FAIL (current loop reads `entries`).

Replace the chunk loop body (from Task 4) with a shape-detecting version:

```javascript
                for (let offset = 0; offset < total; offset += CHUNK) {
                    if (signal?.aborted) break;
                    const chunk = await window.electronAPI.featureCacheChunk(offset, CHUNK);
                    if (chunk.vecBuf) {
                        // Binary shape: subarray views straight into the caches (no rebuild).
                        const vecs = new Float32Array(chunk.vecBuf);
                        const clips = chunk.clipBuf ? new Float32Array(chunk.clipBuf) : null;
                        for (let i = 0; i < chunk.names.length; i++) {
                            const vector = vecs.slice(i * 64, i * 64 + 64);
                            const clipVector = clips && chunk.hasClip[i] ? clips.slice(i * 512, i * 512 + 512) : null;
                            ingest(chunk.names[i], vector, clipVector, chunk.sizes[i], chunk.mtimes[i]);
                        }
                        loaded += chunk.names.length;
                    } else {
                        // Legacy JSON shape.
                        for (const [filename, entry] of chunk.entries) {
                            ingest(
                                filename,
                                new Float32Array(entry.vector),
                                entry.clipVector ? new Float32Array(entry.clipVector) : null,
                                entry.size,
                                entry.mtime
                            );
                        }
                        loaded += chunk.entries.length;
                    }
                    if (onProgress) onProgress(loaded, total);
                }
```

Note: use `.slice` (copy) not `.subarray` (view) so each cached vector owns its own buffer — a shared 64k-wide backing buffer would be pinned in memory and a `subarray` view of the wrong length could leak neighbors. `.slice` on a Float32Array returns a compact copy.

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "binary chunk shape"`
Expected: PASS.

- [ ] **Step 9: Full suite + lint + commit**

```bash
npx vitest run && npm run lint
git add feature-cache-transport.js main.js media-viewer.js eslint.config.mjs tests/feature-cache-transport.test.js tests/media-viewer-utils.test.js
git commit -m "perf(g1): binary Float32Array transport for feature-cache-chunk"
```

---

## Task 6: Unify progress surface + wire sort-cancel into extraction

Route background-extraction progress into the sort card when the prediction sort owns the operation, suppress the bottom-left spinner in that mode, and make the extraction loop terminate cleanly when cancelled via the sink/abort path.

**Files:**
- Modify: `media-viewer.js` (`showBackgroundExtractionProgress` ~8556; the extraction loop abort checks ~8308-8320)
- Test: `tests/media-viewer-utils.test.js`

**Interfaces:**
- Consumes: `this.extractionProgressSink` (set/cleared by `handleSortByPrediction`, Task 3).
- Produces: when `extractionProgressSink` is set, `showBackgroundExtractionProgress` calls it and does NOT create/update the `#featureExtractionProgress` element.

- [ ] **Step 1: Write a failing test**

```javascript
describe('extraction progress sink', () => {
    const showBackgroundExtractionProgress = extractMethod('showBackgroundExtractionProgress');

    it('routes to the sink and skips the DOM element when a sink is set', () => {
        const calls = [];
        const ctx = {
            extractionProgressSink: (c, t) => calls.push([c, t]),
            _extractionCachedCount: 0,
        };
        // document is available in the vitest jsdom-free env only if configured; guard:
        const before = typeof document !== 'undefined' ? document.getElementById('featureExtractionProgress') : null;
        showBackgroundExtractionProgress.call(ctx, 8, 24);
        expect(calls).toEqual([[8, 24]]);
        expect(before).toBeNull();
    });
});
```

If `document` is undefined in the unit env, the sink early-return means the method never touches `document` — the test asserts the sink was called and nothing threw.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "extraction progress sink"`
Expected: FAIL — method touches `document` before any sink check (ReferenceError or no sink call).

- [ ] **Step 3: Add the sink early-return at the top of `showBackgroundExtractionProgress`**

Insert immediately after the `displayCurrent`/`displayTotal`/`displayCached` computation (before `let indicator = document.getElementById(...)`):

```javascript
        // When a prediction sort owns the operation, report into its unified card instead of
        // the standalone bottom-left indicator.
        if (this.extractionProgressSink) {
            this.extractionProgressSink(displayCurrent, displayTotal);
            return;
        }
```

- [ ] **Step 4: Harden the extraction loop's abort checks**

In `startBackgroundFeatureExtraction`, treat a nulled `backgroundExtractionAbort` (set by `cancelBackgroundExtraction`) as aborted so a mid-run cancel terminates gracefully instead of throwing on `null.signal`. Change the three checks (~8308, 8314, 8320) from `if (this.backgroundExtractionAbort?.signal.aborted)` to:

```javascript
            if (!this.backgroundExtractionAbort || this.backgroundExtractionAbort.signal.aborted) {
                break;
            }
```

and guard the gate call (~8313):

```javascript
            if (!this.backgroundExtractionAbort) break;
            await this.awaitExtractionGate(this.backgroundExtractionAbort.signal);
            if (!this.backgroundExtractionAbort || this.backgroundExtractionAbort.signal.aborted) break;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "extraction progress sink"`
Expected: PASS.

- [ ] **Step 6: Full suite + lint + commit**

```bash
npx vitest run && npm run lint
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(g1): unified sort-card progress + graceful extraction cancel"
```

---

## Task 7: Diagnose & fix the re-extract-despite-cache bug

This is diagnose-first (spec D5) — the exact fix depends on the repro, so this task documents the procedure and the two candidate fixes; the implementer picks the one the repro proves.

**Files:**
- Modify: `media-viewer.js` (likely the uncached gate in `handleSortByPrediction` and/or the staleness comparison in `_loadFeatureCacheLocked`) — exact lines determined by the repro.
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Reproduce with instrumentation**

On the real 24k folder (user-side, or a synthetic 200-file cache), after Tasks 1–6, add a temporary log at the uncached computation in `handleSortByPrediction`:

```javascript
            const uncachedFiles = this.mediaFiles.filter((f) => !this.featureCache.has(f.path));
            console.log('[G1 repro] uncached=%d of %d; clipMissing=%d', uncachedFiles.length, this.mediaFiles.length,
                this.mediaFiles.filter((f) => this.enableClipFeatures && !this.clipCache.has(f.path)).length);
```

Run a sort on a folder whose `.feature_cache.json` is known-complete-and-valid. Record whether `uncached` > 0 (64-dim staleness) or `clipMissing` > 0 (CLIP absence) or both.

- [ ] **Step 2: Classify and choose the fix**

- **If `uncached` > 0 on a valid cache** → staleness false-negative. Inspect `size`/`mtime` round-trip: `_loadFeatureCacheLocked` compares `mtime !== currentFile.mtimeMs`; confirm the writer stores `mtimeMs` (float) and the loader compares against the same field with no rounding drift. Fix: compare with a tolerance or normalize both to integers at write+read. Add a unit test that a cache entry written with `mtimeMs = 123.456` re-loads as a cache **hit**.
- **If `clipMissing` > 0 but `uncached` === 0** → the cache legitimately lacks CLIP vectors (built before CLIP was ready). This is not redundant — extraction *should* run for the missing CLIP. The real bug would be re-extracting the 64-dim it already has: verify `startBackgroundFeatureExtraction`'s per-file `needsHandCrafted = !this.featureCache.has(file.path)` (line ~8325) correctly skips the hand-crafted `loadMediaAsImageData` for cache-hit files. Add a unit test around the filter at ~8280-8286 asserting a file with features-but-no-clip is included but its `needsHandCrafted` is false.
- **If neither reproduces** → the incremental-populate of Task 4 already closed it (the pre-Task-4 code's local-map-assigned-at-end could interact with a concurrent `kickoffBackgroundExtractionIfEnabled` load). Document this in the commit and the plan's Outcome; no code change beyond Tasks 1–6.

- [ ] **Step 3: Write the failing unit test for the chosen fix** (staleness-tolerance example)

```javascript
it('re-loads an entry whose mtime has sub-ms float drift as a cache HIT', async () => {
    // installApi with entry.mtime = 100.0 but currentFile.mtimeMs = 100.0000001
    // assert featureCache.size === 1 (hit), not 0 (miss)
});
```
(Fill in with the concrete `installApi` shape from Task 4 once the repro pins the exact drift.)

- [ ] **Step 4: Implement the minimal fix, run the test, remove the temp logging**

- [ ] **Step 5: Full suite + lint + commit**

```bash
npx vitest run && npm run lint
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(g1): stop redundant feature re-extraction on a valid cache"
```
(If Step 2 concluded "already fixed", commit only the plan/spec Outcome note instead.)

---

## Task 8: Verification, cross-ref sweep, and manual-smoke handoff

**Files:**
- Modify: none (or doc updates only)

- [ ] **Step 1: Grep for stale references to relocated logic**

Per CLAUDE.md's ref-sweep rule, grep the whole repo (tests + comments) for symbols this branch moved:

```bash
git grep -n "sortComplete" -- '*.js'
git grep -n "processEntry" -- '*.js'
git grep -n "getSortedOrder" -- '*.js'
```
Expected: no test or comment asserts the OLD `sortComplete`-applies-directly behavior; `processEntry` has no remaining callers (renamed to `ingest`).

- [ ] **Step 2: Full unit suite + lint**

Run: `npx vitest run && npm run lint`
Expected: all green; new case count reported.

- [ ] **Step 3: Run the E2E smoke (does not gate, but must not regress)**

Run: `npm run test:e2e`
Expected: no new failures vs. the pre-branch baseline (52/52 or the known state).

- [ ] **Step 4: Write the user-side 24k smoke checklist into the PR body**

The PR description must list the manual gate (unchecked until the user confirms on the real folder):
1. Determinate card appears immediately on Sort-by-Predicted click (no silent wait).
2. On a fully-cached folder, no redundant extraction runs (watch the phase label / CPU).
3. Cancel aborts load + extraction + sort; list stays unsorted; CPU frees.
4. Post-tournament-exit → Sort-by-Predicted behaves identically.
5. (Report) measured load time before vs. after.

- [ ] **Step 5: Commit any doc updates and open the PR**

```bash
git add -A
git commit -m "docs(g1): PR smoke checklist + cross-ref sweep notes"
```
Leave the WEEKLY/TODO G1 checkboxes UNCHECKED until the user-side 24k smoke passes (per WEEKLY Parallel Work + spec acceptance criteria).

---

## Self-Review

**Spec coverage:**
- Item 1 (progress card) → Task 3. Item 2 (incremental populate) → Task 4. Item 3 (cancel) → Tasks 3 + 6. Item 4 (faster) → Task 5 (+ per-entry await removed in Task 4). Item 5 (re-extract bug) → Task 7. Item 6 (tournament-exit path) → covered by construction (same method), verified in Task 8 checklist.
- D1 visible+cancelable+faster → Tasks 3/4/5/6. D2 one card → Task 6. D3 stop-everything → Task 3 abort listener + Task 6 hardening. D4 mirror similarity → Task 3. D5 diagnose-first → Task 7. D6 no format change → Global Constraints + Task 5 keeps JSON on disk.
- Non-goals honored: no PR2/graph work; `handleSortBySimilarity` control flow untouched; no preload change.

**Placeholder scan:** Task 7 Step 3's test is intentionally a template (the repro pins the exact drift value) — this is the one honest exception the spec's diagnose-first decision requires; every other step has complete code. No "TBD"/"add error handling"/"similar to" placeholders elsewhere.

**Type consistency:** `applyPredictionSortResult(result)` (Task 1) ← resolved value of `runMlSort` (Task 2) ← `{sortedFilenames, scores, reason}` echoed by the worker (Task 2 Step 6) — consistent. `ingest(filename, vectorF32, clipF32OrNull, size, mtime)` used identically in the streaming, binary, and legacy paths (Tasks 4 & 5). `extractionProgressSink(current, total)` set in Task 3, consumed in Task 6 — consistent. `feature-cache-chunk` binary keys (`names/sizes/mtimes/hasClip/vecBuf/clipBuf`) produced in Task 5 Step 3 and consumed in Task 5 Step 7 — consistent.
