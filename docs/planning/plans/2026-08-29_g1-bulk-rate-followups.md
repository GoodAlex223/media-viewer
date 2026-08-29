# G1 Bulk-Rate Follow-ups — Implementation Plan

**Task Reference**: WEEKLY.md Aug 31–Sep 4 § G1 (🏆, 6 SP) ← BACKLOG 🟤 `[2026-08-24] PR #66 … smoke round-1 + review follow-ups`
**Created**: 2026-08-29
**Status**: In Progress
**Last Updated**: 2026-08-29

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. (This run: executed inline by the planning session — full context already loaded.)

**Goal:** Give the PR #66 deferred-re-render fix (D2) real E2E coverage under the real ML worker, and close the three lifecycle gaps + two unit-coverage gaps deferred from that review.

**Architecture:** No production stub or flag — the E2E brings up the real `ml-worker.js` through the public `initializeMlWorker()` (lazy in production) and warms the model so `scoreAll` returns real scores. Two small renderer helpers (`_cancelDeferredCompareRefresh`, `_bulkPairKeysReferencing`) centralize the deferred-window teardown and the pair-key prune so `loadFolder` and the undo paths can reuse them.

**Tech Stack:** Vanilla JS (no bundler), Electron renderer, Vitest (unit, `extractMethod` pattern), Playwright (E2E).

**Spec:** [docs/superpowers/specs/2026-08-29-g1-bulk-rate-followups-design.md](../../superpowers/specs/2026-08-29-g1-bulk-rate-followups-design.md)

## Global Constraints

- Branch: `g1-bulk-rate-followups`. **No PR** — push only (`git push -u origin g1-bulk-rate-followups`).
- Prettier: tabWidth=4, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always, LF.
- New `MediaViewer` methods at **4-space indent** (`extractMethod` matches `^\s{4}<name>\(`).
- Unit baseline: **513 passing** (`npx vitest run`, enforced by the pre-commit hook). E2E: `npx playwright test tests/e2e/compare-mode.test.js`.
- Stage docs by explicit path (editor format-on-save rewrites Markdown).
- Mutation-verify every new guard test (temporarily break the implementation, see the test fail, restore).
- Out of scope (spec D5): the `scores: null` deferred-window stall; late `scoreComplete` after a folder switch. File both to BACKLOG 🟤 at closeout.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `tests/e2e/compare-mode.test.js` | Compare-mode E2E | Add one test: deferred protocol (rating + undo) under the real worker |
| `media-viewer.js` | Renderer | `_cancelDeferredCompareRefresh` (+2 call sites), `_bulkPairKeysReferencing` (+`removeFileFromList` uses it), capture at 3 move sites, restore in `restoreFeatureCachesFromHistory` |
| `tests/media-viewer-utils.test.js` | Extracted-method tests | Tasks 2–4 tests; 3 existing `removeFileFromList` ctxs + 1 `loadFolder` ctx gain the new helpers |
| `CLAUDE.md` | Durable rules | 4 line-level edits (Task 5) |

---

### Task 1: E2E — deferred-refresh protocol under the real ML worker (🏆)

**Files:**
- Modify: `tests/e2e/compare-mode.test.js` (append after the `'Both good records a bulk rating…'` test, ~line 210)

**Interfaces:**
- Consumes (existing renderer API): `initializeMlWorker()`, `updateMlModelWithFeatures(features, actionType)`, `applyBulkRating(bucket)`, `handleCancel()`, `handleMlWorkerMessage(message)`, `showMedia()`, fields `mlStats`, `predictionScores`, `pendingCompareRefresh`, `pendingCompareUpdates`, `pendingCompareTimeout`, `mediaNavigationInProgress`, `isLoading`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the test**

```js
    test('bulk rating and its undo defer the re-render until the REAL ML worker re-scores (D2/D4)', async () => {
        // mlWorker is lazy in production (first AI sort / settings toggle) — bring the real
        // ml-worker.js up explicitly. No stub: the point is that the worker's own replies drive
        // the deferred-refresh protocol.
        await seedLocalStorage(page, { mlPredictionEnabled: 'true' });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        await page.evaluate(() => {
            const mv = window.mediaViewer;
            mv.isMlEnabled = true;
            // Deterministic 576-dim vector per path (the model is 64 + 512 dims; a short vector
            // would score NaN).
            mv.getCombinedFeatures = (p) => {
                let h = 0;
                for (const ch of String(p)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
                const v = new Float32Array(576);
                for (let i = 0; i < 576; i++) {
                    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
                    v[i] = (h % 1000) / 1000;
                }
                return v;
            };
            mv.initializeMlWorker();
        });
        await page.waitForFunction(() => window.mediaViewer.mlStats != null); // initComplete

        // scoreAll replies scores:null until the model has >=3 likes and >=3 dislikes — warm it up,
        // then wait for the debounced re-score so no warm-up reply leaks into the assertions.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            for (let i = 0; i < 3; i++) {
                mv.updateMlModelWithFeatures(mv.getCombinedFeatures(`warm-like-${i}`), 'like');
                mv.updateMlModelWithFeatures(mv.getCombinedFeatures(`warm-dislike-${i}`), 'dislike');
            }
        });
        await page.waitForFunction(() => window.mediaViewer.mlStats?.isReady === true);
        await page.waitForFunction(() => window.mediaViewer.predictionScores.size >= 2);

        // Instrument AFTER warm-up: record worker replies + every showMedia() call, in order.
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            window.__mlEvents = [];
            const origHandle = mv.handleMlWorkerMessage.bind(mv);
            mv.handleMlWorkerMessage = (m) => {
                if (m.type !== 'progress') {
                    window.__mlEvents.push(m.type === 'scoreComplete' ? `scoreComplete:${m.scores ? 'scores' : 'null'}` : m.type);
                }
                return origHandle(m);
            };
            const origShow = mv.showMedia.bind(mv);
            mv.showMedia = (...args) => {
                window.__mlEvents.push('showMedia');
                return origShow(...args);
            };
            // Same forced AI-sorted compare state the persistence test uses.
            mv.isCompareMode = true;
            mv.isSortedByPrediction = true;
            mv.compareLeftFile = mv.mediaFiles[0];
            mv.compareRightFile = mv.mediaFiles[1];
        });

        // --- Rating (D2): the window is armed and NOTHING has rendered yet.
        const armed = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            await mv.applyBulkRating('good');
            return {
                pending: mv.pendingCompareRefresh,
                updates: mv.pendingCompareUpdates,
                nav: mv.mediaNavigationInProgress,
                events: [...window.__mlEvents],
            };
        });
        expect(armed.pending).toBe(true);
        expect(armed.updates).toBe(2);
        expect(armed.nav).toBe(true);
        expect(armed.events).not.toContain('showMedia');

        await page.waitForFunction(
            () => !window.mediaViewer.mediaNavigationInProgress && !window.mediaViewer.isLoading
        );
        const settled = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return {
                events: [...window.__mlEvents],
                pending: mv.pendingCompareRefresh,
                updates: mv.pendingCompareUpdates,
                timeout: mv.pendingCompareTimeout,
            };
        });
        // One render, AFTER a scoreComplete that carried real scores — settled by the reply,
        // not by the 3 s fallback (which would leave pendingCompareTimeout non-null until it fired).
        expect(settled.events).toEqual(['updateComplete', 'updateComplete', 'scoreComplete:scores', 'showMedia']);
        expect(settled.pending).toBe(false);
        expect(settled.updates).toBe(0);
        expect(settled.timeout).toBeNull();

        // --- Undo (D4): same protocol, driven by reverseUpdateComplete.
        const undoArmed = await page.evaluate(async () => {
            const mv = window.mediaViewer;
            window.__mlEvents.length = 0;
            await mv.handleCancel();
            return {
                pending: mv.pendingCompareRefresh,
                updates: mv.pendingCompareUpdates,
                nav: mv.mediaNavigationInProgress,
                events: [...window.__mlEvents],
            };
        });
        expect(undoArmed.pending).toBe(true);
        expect(undoArmed.updates).toBe(2);
        expect(undoArmed.nav).toBe(true);
        expect(undoArmed.events).not.toContain('showMedia');

        await page.waitForFunction(
            () => !window.mediaViewer.mediaNavigationInProgress && !window.mediaViewer.isLoading
        );
        const undoSettled = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return { events: [...window.__mlEvents], pending: mv.pendingCompareRefresh, timeout: mv.pendingCompareTimeout };
        });
        expect(undoSettled.events).toEqual([
            'reverseUpdateComplete',
            'reverseUpdateComplete',
            'scoreComplete:scores',
            'showMedia',
        ]);
        expect(undoSettled.pending).toBe(false);
        expect(undoSettled.timeout).toBeNull();
    });
```

- [ ] **Step 2: Run it — expected PASS against current `main` code** (the D2 fix is already shipped; this task adds the coverage)

Run: `npx playwright test tests/e2e/compare-mode.test.js -g "REAL ML worker"`
Expected: 1 passed.

- [ ] **Step 3: Fail-first mutation check** — in `media-viewer.js` `applyBulkRating`, temporarily replace

```js
        if (postedUpdates > 0) {
            this._beginDeferredCompareRefresh(postedUpdates);
        } else {
```
with
```js
        if (false) {
            this._beginDeferredCompareRefresh(postedUpdates);
        } else {
```
Run the same command. Expected: FAIL at `expect(armed.pending).toBe(true)` (or the `not.toContain('showMedia')` line). **Restore the original** (`git checkout -- media-viewer.js`), re-run, expected PASS.

- [ ] **Step 4: Run the whole compare-mode E2E file**

Run: `npx playwright test tests/e2e/compare-mode.test.js`
Expected: all passed (was 6 tests; now 7).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/compare-mode.test.js
git commit -m "test(e2e): cover the deferred compare re-render under the real ML worker (G1 T1)"
```

---

### Task 2: `_cancelDeferredCompareRefresh()` — `loadFolder` drops an open window

**Files:**
- Modify: `media-viewer.js` — new method after `_beginDeferredCompareRefresh` (~line 8061); call in `loadFolder` after `this._featureCacheDiskCount = 0;` (~line 2566); replace the inline block in `moveComparePair` (~lines 5347-5354)
- Test: `tests/media-viewer-utils.test.js` — new describe; `loadFolder empty-folder teardown` ctx gains the helper

**Interfaces:**
- Produces: `_cancelDeferredCompareRefresh(): void` — clears `pendingCompareTimeout`, `pendingCompareRefresh=false`, `pendingCompareUpdates=0`, `previousScores=null`; sets `mediaNavigationInProgress=false` **only if** `pendingCompareRefresh` was true on entry.

- [ ] **Step 1: Write the failing tests** (append before `describe('collectBulkRatedTrainingExamples'`)

```js
describe('_cancelDeferredCompareRefresh', () => {
    const cancel = extractMethod('_cancelDeferredCompareRefresh');

    it('clears an open window (timer, flags, snapshot) and releases mediaNavigationInProgress', () => {
        vi.useFakeTimers();
        try {
            const fallback = vi.fn();
            const ctx = {
                pendingCompareRefresh: true,
                pendingCompareUpdates: 2,
                pendingCompareTimeout: setTimeout(fallback, 3000),
                previousScores: new Map([['/f/a', 0.5]]),
                mediaNavigationInProgress: true,
            };
            cancel.call(ctx);
            expect(ctx.pendingCompareRefresh).toBe(false);
            expect(ctx.pendingCompareUpdates).toBe(0);
            expect(ctx.pendingCompareTimeout).toBeNull();
            expect(ctx.previousScores).toBeNull();
            expect(ctx.mediaNavigationInProgress).toBe(false);
            vi.advanceTimersByTime(3500);
            expect(fallback).not.toHaveBeenCalled(); // the 3 s fallback can no longer fire showMedia()
        } finally {
            vi.useRealTimers();
        }
    });

    it('leaves mediaNavigationInProgress alone when no window was open', () => {
        // The flag is also held by ordinary in-flight navigation — a no-op cancel must not release it.
        const ctx = {
            pendingCompareRefresh: false,
            pendingCompareUpdates: 0,
            pendingCompareTimeout: null,
            previousScores: null,
            mediaNavigationInProgress: true,
        };
        cancel.call(ctx);
        expect(ctx.mediaNavigationInProgress).toBe(true);
        expect(ctx.pendingCompareRefresh).toBe(false);
    });
});

describe('loadFolder drops an open deferred compare refresh (G1 T2)', () => {
    const loadFolder = extractAsyncMethod('loadFolder');
    const cancelImpl = extractMethod('_cancelDeferredCompareRefresh');
    const abortImpl = extractMethod('_abortInFlightPredictionSort');
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                loadFolder: vi.fn(async () => ({ success: true, files: [] })),
                path: { basename: (p) => p.split(/[\\/]/).pop() },
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('cancels the window on the empty-folder branch (before the branches diverge)', async () => {
        vi.useFakeTimers();
        try {
            const fallback = vi.fn();
            const ctx = {
                isTournamentMode: false,
                tournament: { engine: null },
                mediaFiles: [{ name: 'stale.png', path: '/old/stale.png' }],
                baseFolderPath: '/old',
                currentFolderPath: 'old',
                currentIndex: 0,
                moveHistory: [],
                sortRunId: 0,
                sortAbortController: null,
                _mlSortResolve: null,
                _mlSortReject: null,
                _featureCacheDiskCount: 0,
                // An open deferred window from a bulk rating in the OLD folder:
                pendingCompareRefresh: true,
                pendingCompareUpdates: 2,
                pendingCompareTimeout: setTimeout(fallback, 3000),
                previousScores: null,
                mediaNavigationInProgress: true,
                showLoadingSpinner: vi.fn(),
                hideLoadingSpinner: vi.fn(),
                showDropZone: vi.fn(),
                showError: vi.fn(),
                exitTournamentMode: vi.fn(),
                cancelBackgroundExtraction: vi.fn(),
                _abortInFlightPredictionSort: vi.fn(abortImpl),
                _cancelDeferredCompareRefresh: vi.fn(cancelImpl),
            };
            await loadFolder.call(ctx, '/new/empty-folder');
            expect(ctx._cancelDeferredCompareRefresh).toHaveBeenCalledTimes(1);
            expect(ctx.pendingCompareRefresh).toBe(false);
            expect(ctx.pendingCompareTimeout).toBeNull();
            expect(ctx.mediaNavigationInProgress).toBe(false);
            vi.advanceTimersByTime(3500);
            expect(fallback).not.toHaveBeenCalled(); // no showMedia() against the new folder
            expect(ctx.mediaFiles).toEqual([]); // sanity: the empty branch was taken
        } finally {
            vi.useRealTimers();
        }
    });

    it('is called before the empty/non-empty split, so the non-empty branch is covered too', () => {
        const body = methodSource('loadFolder');
        const cancel = body.indexOf('this._cancelDeferredCompareRefresh();');
        const split = body.indexOf('if (result.files.length === 0)');
        const abort = body.indexOf('this._abortInFlightPredictionSort();');
        expect(cancel).toBeGreaterThan(abort);
        expect(cancel).toBeLessThan(split);
    });
});
```

Also update the existing `loadFolder empty-folder teardown (Fix B follow-up)` `makeCtx()` — add `_cancelDeferredCompareRefresh: vi.fn(),` after `_abortInFlightPredictionSort: …` (it will otherwise throw `not a function` once `loadFolder` calls the helper).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run media-viewer-utils -t "_cancelDeferredCompareRefresh|drops an open deferred"`
Expected: FAIL — `Could not find method: _cancelDeferredCompareRefresh`.

- [ ] **Step 3: Implement**

In `media-viewer.js`, directly after `_beginDeferredCompareRefresh`:

```js
    // Drop an open deferred compare refresh (armed by applyBulkRating, handleCancel's bulk-undo
    // branch and moveComparePair). Releases mediaNavigationInProgress ONLY when a window was
    // actually open — that flag is also held by ordinary in-flight navigation, which this must
    // not clobber.
    _cancelDeferredCompareRefresh() {
        const wasPending = this.pendingCompareRefresh;
        if (this.pendingCompareTimeout) {
            clearTimeout(this.pendingCompareTimeout);
            this.pendingCompareTimeout = null;
        }
        this.pendingCompareRefresh = false;
        this.pendingCompareUpdates = 0;
        this.previousScores = null;
        if (wasPending) this.mediaNavigationInProgress = false;
    }
```

In `loadFolder`, after `this._featureCacheDiskCount = 0;`:

```js
            // A deferred compare refresh armed in the OLD folder (bulk rating / undo / pair rating)
            // would otherwise fire showMedia() against the NEW folder when its 3 s fallback lands.
            this._cancelDeferredCompareRefresh();
```

In `moveComparePair`'s `< 2 files` block, replace

```js
                // Clear pending ML state
                if (this.pendingCompareTimeout) {
                    clearTimeout(this.pendingCompareTimeout);
                    this.pendingCompareTimeout = null;
                }
                this.pendingCompareRefresh = false;
                this.pendingCompareUpdates = 0;
                this.previousScores = null;
```
with
```js
                // Clear pending ML state
                this._cancelDeferredCompareRefresh();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run media-viewer-utils`
Expected: all pass (213 → 216).

- [ ] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(compare): loadFolder drops an open deferred compare refresh (G1 T2)"
```

---

### Task 3: Undo reinstates pruned `bulkRatedPairs` keys

**Files:**
- Modify: `media-viewer.js` — `removeFileFromList` (~1094-1098), `restoreFeatureCachesFromHistory` (~1120), `moveCurrentFile` (~1402), `moveToSpecialFolder` (~1550-1561), `moveComparePair` (~5255, ~5291); new `_bulkPairKeysReferencing` after `bulkPairKey` (~2944)
- Test: `tests/media-viewer-utils.test.js` — 3 `removeFileFromList` ctxs gain `_bulkPairKeysReferencing`; new tests

**Interfaces:**
- Produces: `_bulkPairKeysReferencing(fileName: string): string[]` — every `bulkRatedPairs` key naming `fileName` on either side (keys are `bulkPairKey(a, b)` = sorted names joined by `'\u0000'`).
- History-entry field: `prunedPairKeys?: string[]` — present only when non-empty; consumed by `restoreFeatureCachesFromHistory(entry)`.

- [ ] **Step 1: Write the failing tests** (append before `describe('collectBulkRatedTrainingExamples'`)

```js
describe('bulkRatedPairs key capture + restore across undo (G1 T3)', () => {
    const bulkPairKey = extractMethod('bulkPairKey');
    const keysReferencing = extractMethod('_bulkPairKeysReferencing');
    const removeFileFromList = extractMethod('removeFileFromList');
    const restore = extractMethod('restoreFeatureCachesFromHistory');

    function cacheCtx(files, pairs) {
        return {
            mediaFiles: files,
            currentIndex: 0,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(pairs),
            bulkPairKey,
            _bulkPairKeysReferencing: keysReferencing,
            saveBulkRatedFile: () => {},
        };
    }

    it('_bulkPairKeysReferencing returns every key naming the file on either side, nothing else', () => {
        const ctx = cacheCtx([], [bulkPairKey('a', 'f'), bulkPairKey('f', 'z'), bulkPairKey('b', 'c')]);
        expect(keysReferencing.call(ctx, 'f').sort()).toEqual([bulkPairKey('a', 'f'), bulkPairKey('f', 'z')].sort());
        expect(keysReferencing.call(ctx, 'b')).toEqual([bulkPairKey('b', 'c')]);
        expect(keysReferencing.call(ctx, 'nope')).toEqual([]);
        expect(ctx.bulkRatedPairs.size).toBe(3); // read-only
    });

    it('restoreFeatureCachesFromHistory re-adds prunedPairKeys even when the entry has no mlFeatures', () => {
        const ctx = { featureCache: new Map(), clipCache: new Map(), featureMetadata: new Map(), bulkRatedPairs: new Set() };
        const key = bulkPairKey('a', 'f');
        restore.call(ctx, { originalPath: '/f/a', mlFeatures: null, prunedPairKeys: [key] });
        expect(ctx.bulkRatedPairs.has(key)).toBe(true);
        expect(ctx.featureCache.size).toBe(0);
    });

    it('tolerates entries without prunedPairKeys (legacy / nothing pruned)', () => {
        const ctx = { featureCache: new Map(), clipCache: new Map(), featureMetadata: new Map(), bulkRatedPairs: new Set() };
        restore.call(ctx, { originalPath: '/f/a', mlFeatures: null });
        expect(ctx.bulkRatedPairs.size).toBe(0);
    });

    it('LIFO: rate-pair (a,f) -> move a -> move f -> undo f -> undo a restores the key exactly once, on a', () => {
        const a = { name: 'a', path: '/f/a' };
        const f = { name: 'f', path: '/f/f' };
        const key = bulkPairKey('a', 'f');
        const ctx = cacheCtx([a, f], [key]);

        // move a — capture BEFORE the prune (what the move sites do), then prune
        const entryA = { originalPath: a.path, mlFeatures: null };
        const prunedA = keysReferencing.call(ctx, a.name);
        if (prunedA.length > 0) entryA.prunedPairKeys = prunedA;
        removeFileFromList.call(ctx, a.path);
        expect(ctx.bulkRatedPairs.has(key)).toBe(false);
        expect(entryA.prunedPairKeys).toEqual([key]);

        // move f — nothing left to capture
        const entryF = { originalPath: f.path, mlFeatures: null };
        const prunedF = keysReferencing.call(ctx, f.name);
        if (prunedF.length > 0) entryF.prunedPairKeys = prunedF;
        removeFileFromList.call(ctx, f.path);
        expect(entryF.prunedPairKeys).toBeUndefined();

        // undo f, then undo a
        restore.call(ctx, entryF);
        expect(ctx.bulkRatedPairs.size).toBe(0);
        restore.call(ctx, entryA);
        expect([...ctx.bulkRatedPairs]).toEqual([key]);
    });

    it('moveCurrentFile captures the pruned keys onto its history entry (single-mode like)', async () => {
        const moveCurrentFile = extractAsyncMethod('moveCurrentFile');
        const a = { name: 'a.jpg', path: '/f/a.jpg', size: 10, type: 'image/jpeg' };
        const f = { name: 'f.jpg', path: '/f/f.jpg', size: 10, type: 'image/jpeg' };
        const key = bulkPairKey('a.jpg', 'f.jpg');
        const origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                checkFolderExists: vi.fn(async () => true),
                moveFile: vi.fn(async ({ fileName }) => ({ success: true, targetPath: `/liked/${fileName}` })),
            },
        };
        try {
            const ctx = {
                ...cacheCtx([a, f], [key]),
                isLoading: false,
                isMlEnabled: false, // skips feature extraction — not what this test is about
                mlWorker: null,
                currentMedia: null,
                customLikeFolder: '/liked',
                customDislikeFolder: '/disliked',
                moveHistory: [],
                showRatingConfirmations: false,
                areFoldersConfigured: () => true,
                getCombinedFeatures: () => null,
                removeFileFromList,
                updateMlModelWithFeatures: vi.fn(),
                updateFolderInfo: vi.fn(),
                showMedia: vi.fn(),
                showNotification: vi.fn(),
                showError: vi.fn(),
            };
            await moveCurrentFile.call(ctx, 'like');
            expect(ctx.moveHistory).toHaveLength(1);
            expect(ctx.moveHistory[0].prunedPairKeys).toEqual([key]);
            expect(ctx.bulkRatedPairs.has(key)).toBe(false); // pruned after capture
            expect(ctx.mediaFiles).toEqual([f]);
        } finally {
            globalThis.window = origWindow;
        }
    });

    it('moveCurrentFile omits prunedPairKeys when nothing referenced the file', async () => {
        const moveCurrentFile = extractAsyncMethod('moveCurrentFile');
        const a = { name: 'a.jpg', path: '/f/a.jpg', size: 10, type: 'image/jpeg' };
        const origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                checkFolderExists: vi.fn(async () => true),
                moveFile: vi.fn(async ({ fileName }) => ({ success: true, targetPath: `/liked/${fileName}` })),
            },
        };
        try {
            const ctx = {
                ...cacheCtx([a], [bulkPairKey('x', 'y')]),
                isLoading: false,
                isMlEnabled: false,
                mlWorker: null,
                currentMedia: null,
                customLikeFolder: '/liked',
                customDislikeFolder: '/disliked',
                moveHistory: [],
                showRatingConfirmations: false,
                areFoldersConfigured: () => true,
                getCombinedFeatures: () => null,
                removeFileFromList,
                updateMlModelWithFeatures: vi.fn(),
                updateFolderInfo: vi.fn(),
                showMedia: vi.fn(),
                showNotification: vi.fn(),
                showError: vi.fn(),
            };
            await moveCurrentFile.call(ctx, 'like');
            expect(ctx.moveHistory[0]).not.toHaveProperty('prunedPairKeys');
        } finally {
            globalThis.window = origWindow;
        }
    });

    it('moveToSpecialFolder and moveComparePair capture before they prune (source order)', () => {
        // These two are DOM/dialog-heavy; assert the ordering invariant on the source instead:
        // every _bulkPairKeysReferencing( capture precedes the first removeFileFromList( call,
        // and the captured keys land on the history entry as prunedPairKeys.
        for (const [name, captures] of [
            ['moveToSpecialFolder', 1],
            ['moveComparePair', 2],
        ]) {
            const body = methodSource(name);
            const prune = body.indexOf('this.removeFileFromList(');
            expect(prune, name).toBeGreaterThan(-1);
            const hits = [...body.matchAll(/this\._bulkPairKeysReferencing\(/g)].map((m) => m.index);
            expect(hits, name).toHaveLength(captures);
            for (const idx of hits) expect(idx, name).toBeLessThan(prune);
            expect(body, name).toContain('prunedPairKeys');
        }
    });
});

describe('handleCancel reinstates bulkRatedPairs keys (G1 T3)', () => {
    const handleCancel = extractAsyncMethod('handleCancel');
    const bulkPairKey = extractMethod('bulkPairKey');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                moveFile: vi.fn(async ({ fileName }) => ({ success: true, targetPath: `/folder/${fileName}` })),
                path: { basename: async (p) => p.split('/').pop() },
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('single-mode undo of a like restores the key pruned when the file was moved', async () => {
        const key = bulkPairKey('a.png', 'f.png');
        const ctx = {
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: false,
            isTournamentMode: false,
            mediaFiles: [{ name: 'f.png', path: '/folder/f.png' }],
            moveHistory: [
                {
                    fileName: 'a.png',
                    originalPath: '/folder/a.png',
                    newPath: '/folder/like/a.png',
                    fileSize: 100,
                    fileType: 'image/png',
                    actionType: 'like',
                    mlFeatures: null,
                    prunedPairKeys: [key],
                },
            ],
            currentIndex: 0,
            baseFolderPath: '/folder',
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            predictionScores: new Map(),
            bulkRatedPairs: new Set(),
            isSortedByPrediction: false,
            isMlEnabled: false,
            mlWorker: null,
            signalUserActivity: () => {},
            showNotification: () => {},
            showError: () => {},
            updateFolderInfo: () => {},
            showMedia: vi.fn(async () => {}),
            requestPredictionScores: vi.fn(),
            restoreFeatureCachesFromHistory: extractMethod('restoreFeatureCachesFromHistory'),
            reverseMlModelUpdate: vi.fn(),
        };
        await handleCancel.call(ctx);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a.png', 'f.png']);
        expect(ctx.bulkRatedPairs.has(key)).toBe(true);
    });
});
```

Also update the three existing `removeFileFromList` contexts so the real prune still runs:
- `describe('removeFileFromList')` `createContext` (~line 306): add `_bulkPairKeysReferencing: extractMethod('_bulkPairKeysReferencing'),`
- `describe('removeFileFromList bulk-rated purge')` `makeCtx` (~2159): same line
- `it('removeFileFromList prunes bulkRatedPairs keys …')` ctx (~2269): same line

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run media-viewer-utils -t "G1 T3"`
Expected: FAIL — `Could not find method: _bulkPairKeysReferencing`.

- [ ] **Step 3: Implement**

`media-viewer.js`, after `bulkPairKey`:

```js
    // Every rated-pair key that names `fileName` on either side. removeFileFromList prunes these;
    // the move sites capture them onto the history entry FIRST so undo can reinstate them
    // (restoreFeatureCachesFromHistory) — otherwise a pair rated before a single-file move could
    // re-pair after that move is undone.
    _bulkPairKeysReferencing(fileName) {
        const keys = [];
        for (const key of this.bulkRatedPairs) {
            const [a, b] = key.split('\u0000');
            if (a === fileName || b === fileName) keys.push(key);
        }
        return keys;
    }
```

`removeFileFromList` — replace the prune loop:

```js
        // A removed/moved file can never re-pair — drop any rated-pair key that references it.
        for (const key of this._bulkPairKeysReferencing(removedName)) this.bulkRatedPairs.delete(key);
```

`restoreFeatureCachesFromHistory` — new head:

```js
    restoreFeatureCachesFromHistory(entry) {
        if (!entry) return;
        // Re-admit the rated-pair keys removeFileFromList pruned for this file (captured by the move
        // sites as prunedPairKeys). Before the features guard: a file with no features still owns them.
        if (entry.prunedPairKeys) {
            for (const key of entry.prunedPairKeys) this.bulkRatedPairs.add(key);
        }
        if (!entry.mlFeatures) return;
        const features = entry.mlFeatures;
        …unchanged…
```

`moveCurrentFile` — replace the `this.moveHistory.push({ … })` with:

```js
            // Store move in history for undo functionality (include ML features for reversal)
            const historyEntry = {
                fileName: currentFile.name,
                originalPath: currentFile.path,
                newPath: moveResult.targetPath,
                fileSize: currentFile.size,
                fileType: currentFile.type,
                actionType: actionType,
                mlFeatures: mlFeatures ? Array.from(mlFeatures) : null,
            };
            // Capture the rated-pair keys removeFileFromList is about to prune, so undo can reinstate them.
            const prunedPairKeys = this._bulkPairKeysReferencing(currentFile.name);
            if (prunedPairKeys.length > 0) historyEntry.prunedPairKeys = prunedPairKeys;
            this.moveHistory.push(historyEntry);
```

`moveToSpecialFolder` — after the `historyEntry = { … }` literal (before the `if (side === 'left' …)` block):

```js
            // Capture the rated-pair keys removeFileFromList is about to prune, so undo can reinstate them.
            const prunedPairKeys = this._bulkPairKeysReferencing(fileToMove.name);
            if (prunedPairKeys.length > 0) historyEntry.prunedPairKeys = prunedPairKeys;
```

`moveComparePair` — both pushes become named entries:

```js
            const primaryEntry = {
                fileName: primaryFile.name,
                … (same fields as today) …
                compareMode: true,
            };
            const primaryPrunedKeys = this._bulkPairKeysReferencing(primaryFile.name);
            if (primaryPrunedKeys.length > 0) primaryEntry.prunedPairKeys = primaryPrunedKeys;
            this.moveHistory.push(primaryEntry);
```
and the same for `secondaryEntry` / `secondaryPrunedKeys` / `secondaryFile.name`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run media-viewer-utils`
Expected: all pass (216 → 224).

- [ ] **Step 5: Mutation check** — comment out the `if (entry.prunedPairKeys)` block in `restoreFeatureCachesFromHistory`; expected: the three restore/LIFO/handleCancel tests FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(compare): undo of a single-file move reinstates pruned bulkRatedPairs keys (G1 T3)"
```

---

### Task 4: Close the counter + undo-arithmetic coverage gaps

**Files:**
- Test: `tests/media-viewer-utils.test.js` — append to `describe('valid-pairs bounds (G3 Task 3)')` and `describe('undoBulkRating')`

- [ ] **Step 1: Write the tests**

In `describe('valid-pairs bounds (G3 Task 3)')`:

```js
    it('updateNavigationInfo falls through to the FULL list when every pair is suppressed (index 1)', () => {
        // With mlComparePairIndex 0 a deleted fall-through would still print "Pair 1 of 2" (empty
        // validIndexed -> idx clamps to 0 -> cursor fallback) — index 1 is what makes the mutation visible.
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
            mlComparePairIndex: 1,
            mediaIndex,
            bulkPairKey,
            computeAllComparePairs: () => all,
            bulkRatedPairs: new Set([bulkPairKey('a', 'd'), bulkPairKey('b', 'c')]),
        };
        updateNavigationInfo.call(ctx);
        expect(mediaIndex.textContent).toBe('Pair 2 of 2');
    });
```

In `describe('undoBulkRating')`:

```js
    it('returns the number of reverse updates actually posted (true/true -> 2, true/false -> 1)', async () => {
        const make = (replies) => ({
            bulkRated: new Map([
                ['a.jpg', 'good'],
                ['b.jpg', 'good'],
            ]),
            bulkRatedPairs: new Set([bulkPairKey('a.jpg', 'b.jpg')]),
            bulkPairKey,
            reverseMlModelUpdate: vi.fn().mockReturnValueOnce(replies[0]).mockReturnValueOnce(replies[1]),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
        });
        const lastMove = {
            bothGood: true,
            bothBad: false,
            bulkFiles: [
                { name: 'a.jpg', features: [1, 2, 3] },
                { name: 'b.jpg', features: [4, 5, 6] },
            ],
        };
        await expect(undoBulkRating.call(make([true, true]), lastMove)).resolves.toBe(2);
        await expect(undoBulkRating.call(make([true, false]), lastMove)).resolves.toBe(1);
        await expect(undoBulkRating.call(make([false, false]), lastMove)).resolves.toBe(0);
    });

    it('returns 0 when both files have null features (nothing posted)', async () => {
        const ctx = {
            bulkRated: new Map([
                ['a.jpg', 'bad'],
                ['b.jpg', 'bad'],
            ]),
            bulkRatedPairs: new Set([bulkPairKey('a.jpg', 'b.jpg')]),
            bulkPairKey,
            reverseMlModelUpdate: vi.fn(() => true),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
        };
        const lastMove = {
            bothGood: false,
            bothBad: true,
            bulkFiles: [
                { name: 'a.jpg', features: null },
                { name: 'b.jpg', features: null },
            ],
        };
        await expect(undoBulkRating.call(ctx, lastMove)).resolves.toBe(0);
        expect(ctx.reverseMlModelUpdate).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run — expected PASS** (these cover shipped code)

Run: `npx vitest run media-viewer-utils -t "falls through to the FULL list|actually posted|null features \(nothing posted\)"`

- [ ] **Step 3: Mutation checks**
  - Delete the `if (validIndexed.length === 0) { validIndexed = allPairs.map(…) }` block in `updateNavigationInfo` → the fall-through test must FAIL (`Pair 1 of 2`). Restore.
  - Change `postedUpdates++` to nothing in `undoBulkRating` → the arithmetic test must FAIL. Restore.

- [ ] **Step 4: Commit**

```bash
git add tests/media-viewer-utils.test.js
git commit -m "test: cover updateNavigationInfo fall-through and undoBulkRating posted-count (G1 T4)"
```

---

### Task 5: Full verification, CLAUDE.md, push

- [ ] **Step 1: Full suites**

Run: `npx vitest run` → expected 513 + 12 = **525** passing. Run: `npm run lint` → 0 errors. Run: `npx playwright test tests/e2e/compare-mode.test.js` → all pass.

- [ ] **Step 2: CLAUDE.md** (4 edits)
  - Line ~141 (`removeFileFromList()` bullet): "+ prune of `bulkRatedPairs` keys referencing the removed filename" → "+ prune of `bulkRatedPairs` keys referencing the removed filename (via `_bulkPairKeysReferencing(name)`)".
  - Line ~143 (`restoreFeatureCachesFromHistory(entry)` bullet): append "Also re-adds `entry.prunedPairKeys` (the keys the move sites capture via `_bulkPairKeysReferencing` right before `removeFileFromList` prunes) — this runs before the `mlFeatures` guard, so a file with no features still gets its keys back."
  - Line ~156 (ML compare refresh bullet): append "`_cancelDeferredCompareRefresh()` drops an open window (`loadFolder`, before its empty/non-empty split; `moveComparePair`'s <2-files exit) and releases `mediaNavigationInProgress` only if a window was actually open."
  - Line ~96 (E2E bullets): add "- `mlWorker` is **lazy** (`initializeMlWorker()` runs on the first AI sort / settings toggle) — an E2E that needs real scoring must call it, override `getCombinedFeatures` with **576-dim** vectors, and warm the model (≥3 likes + ≥3 dislikes) or `scoreAll` replies `scores: null` and the deferred window waits out its 3 s fallback."

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md docs/planning/plans/2026-08-29_g1-bulk-rate-followups.md
git commit -m "docs(g1): CLAUDE.md — pair-key restore, deferred-refresh cancel, lazy mlWorker E2E gotcha"
git push -u origin g1-bulk-rate-followups
```

---

## Self-Review

- **Spec coverage**: §1 → T1; §2 → T2; §3 → T3; §4 → T4; Files table (CLAUDE.md) → T5; D5 BACKLOG entries → closeout (not this plan).
- **Placeholders**: none; every code step is complete.
- **Type consistency**: `_cancelDeferredCompareRefresh()` (T2 impl/tests/T5 docs), `_bulkPairKeysReferencing(fileName)` (T3 impl/tests/T5 docs), history field `prunedPairKeys: string[]` (T3 impl/tests).

---

## 4. Implementation Log

### [2026-08-29 10:20] — PHASE: Planning
- Brainstorm approved (user). Spec committed `023830c`. Key finding: `mlWorker` is null in E2E because `initializeMlWorker()` is lazy — not a harness limit → real worker, no stub (D1).

## 5. Key Discoveries

_(filled at closeout)_

## 6. Future Improvements

- `scoreComplete` with `scores: null` does not clear the deferred window (waits out the 3 s fallback) — BACKLOG 🟤 at closeout (spec D5).
- Late `scoreComplete` after a folder switch can write old scores onto same-named files (filename-keyed reply, path-keyed map) — BACKLOG 🟤 at closeout (spec D5).

## 7. Testing

_(results appended at closeout)_
