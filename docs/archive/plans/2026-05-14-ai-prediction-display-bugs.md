# AI Prediction Display Bugs Implementation Plan

**Status: Complete** (2026-05-14, PR [#35](https://github.com/GoodAlex223/media-viewer/pull/35))

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix two prediction-display bugs: (1) the prediction badge disappears after undoing a rating, and (2) badge percentages misalign with files after the AI sort.

**Architecture:** Two surgical patches in `media-viewer.js`, plus a new helper method. (a) `sortComplete` handler propagates `message.scores` from the worker into `predictionScores` so badges stay aligned. (b) New `restoreFeatureCachesFromHistory(entry)` helper (inverse of `removeFileFromList`) re-populates `featureCache`/`clipCache`/`featureMetadata` from `moveHistory.mlFeatures` on undo. `moveToSpecialFolder` also captures `mlFeatures` so special-undo can restore the badge. The existing `reverseMlModelUpdate` → `reverseUpdateComplete` → debounced `requestPredictionScores` chain handles re-scoring for like/dislike undos; the special-undo branch adds an explicit `requestPredictionScores()` call since it has no model-reversal path.

**Tech Stack:** Vanilla JS (ES module renderer), Vitest unit tests via `extractMethod`/`extractAsyncMethod` source extraction (pattern already in `tests/media-viewer-utils.test.js`).

**Spec:** [docs/superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md](../specs/2026-05-14-ai-prediction-display-bugs-design.md)

**Branch:** `fix/ai-prediction-display-bugs` (already created from `main`, 2 doc commits ahead).

---

## File Structure

**Modified:**
- [media-viewer.js](../../../media-viewer.js)
  - New method `restoreFeatureCachesFromHistory(entry)` near `removeFileFromList` (~L999).
  - Patch `case 'sortComplete':` in `handleMlWorkerMessage` (~L5648) to write `message.scores` into `predictionScores`.
  - Patch `moveToSpecialFolder` (~L1257) to capture `mlFeatures` into the history entry.
  - Patch all 4 `handleCancel` branches (~L3353, L3411, L3485, L3546) to call the new helper before `showMedia()`.
  - Patch the special-move branch (L3353) to call `requestPredictionScores()` after restore if `isSortedByPrediction`.

- [tests/media-viewer-utils.test.js](../../../tests/media-viewer-utils.test.js)
  - 5 new tests in a `describe('restoreFeatureCachesFromHistory', …)` block.
  - 1 new test in a `describe('handleMlWorkerMessage sortComplete', …)` block.
  - 3 new tests in a `describe('handleCancel feature restore', …)` block.

**Updated at the end (post-implementation, mechanical):**
- [docs/planning/TODO.md](../../planning/TODO.md) — both bug entries → DONE.md.
- [docs/planning/DONE.md](../../planning/DONE.md) — new Group B entry.
- [docs/planning/WEEKLY.md](../../planning/WEEKLY.md) — mark Group B complete.

---

### Task 1: New helper `restoreFeatureCachesFromHistory`

**Files:**
- Modify: `media-viewer.js` (add method near `removeFileFromList` ~L999)
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write failing tests**

Open `tests/media-viewer-utils.test.js` and append at the bottom of the file (after the last existing `describe` block):

```js
describe('restoreFeatureCachesFromHistory', () => {
    const restoreFeatureCachesFromHistory = extractMethod('restoreFeatureCachesFromHistory');

    function makeCtx() {
        return {
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
        };
    }

    it('splits 576-dim mlFeatures into featureCache(64) + clipCache(512)', () => {
        const ctx = makeCtx();
        const mlFeatures = new Float32Array(576);
        for (let i = 0; i < 576; i++) mlFeatures[i] = i % 256;
        const entry = { originalPath: '/d/a.png', mlFeatures, fileSize: 1234 };

        restoreFeatureCachesFromHistory.call(ctx, entry);

        const f = ctx.featureCache.get('/d/a.png');
        const c = ctx.clipCache.get('/d/a.png');
        expect(f).toBeInstanceOf(Float32Array);
        expect(f.length).toBe(64);
        expect(c).toBeInstanceOf(Float32Array);
        expect(c.length).toBe(512);
        expect(f[0]).toBe(0);
        expect(f[63]).toBe(63);
        expect(c[0]).toBe(64);
        expect(c[511]).toBe((64 + 511) % 256);
    });

    it('restores only featureCache when mlFeatures is 64-dim', () => {
        const ctx = makeCtx();
        const mlFeatures = new Float32Array(64);
        for (let i = 0; i < 64; i++) mlFeatures[i] = i;
        const entry = { originalPath: '/d/b.png', mlFeatures, fileSize: 99 };

        restoreFeatureCachesFromHistory.call(ctx, entry);

        const f = ctx.featureCache.get('/d/b.png');
        expect(f).toBeInstanceOf(Float32Array);
        expect(f.length).toBe(64);
        expect(ctx.clipCache.has('/d/b.png')).toBe(false);
    });

    it('no-ops when mlFeatures is null or entry is null', () => {
        const ctx = makeCtx();
        restoreFeatureCachesFromHistory.call(ctx, { originalPath: '/x', mlFeatures: null, fileSize: 1 });
        restoreFeatureCachesFromHistory.call(ctx, null);
        expect(ctx.featureCache.size).toBe(0);
        expect(ctx.clipCache.size).toBe(0);
        expect(ctx.featureMetadata.size).toBe(0);
    });

    it('no-ops when mlFeatures has unexpected length', () => {
        const ctx = makeCtx();
        const entry = { originalPath: '/x', mlFeatures: new Float32Array(128), fileSize: 1 };
        restoreFeatureCachesFromHistory.call(ctx, entry);
        expect(ctx.featureCache.size).toBe(0);
        expect(ctx.clipCache.size).toBe(0);
        // featureMetadata is also not written because we returned early
        expect(ctx.featureMetadata.size).toBe(0);
    });

    it('restores featureMetadata with mtime:0 from entry.fileSize', () => {
        const ctx = makeCtx();
        const entry = { originalPath: '/d/c.png', mlFeatures: new Float32Array(64), fileSize: 5555 };
        restoreFeatureCachesFromHistory.call(ctx, entry);
        expect(ctx.featureMetadata.get('/d/c.png')).toEqual({ size: 5555, mtime: 0 });
    });
});
```

- [x] **Step 2: Run the new tests and confirm they fail**

```
npx vitest run tests/media-viewer-utils.test.js -t restoreFeatureCachesFromHistory
```

Expected: All tests fail with `Could not find method: restoreFeatureCachesFromHistory` (thrown from `extractMethod`).

- [x] **Step 3: Add the helper method to `media-viewer.js`**

Locate `removeFileFromList` (around line 999). Insert the new method immediately after `removeFileFromList`'s closing brace (before `removeFailedFile`):

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

- [x] **Step 4: Run tests, confirm they pass**

```
npx vitest run tests/media-viewer-utils.test.js -t restoreFeatureCachesFromHistory
```

Expected: 5 passed.

- [x] **Step 5: Run the full unit suite to confirm no regression**

```
npm test
```

Expected: 185/185 passed (180 prior + 5 new).

- [x] **Step 6: Commit**

```
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(media-viewer): add restoreFeatureCachesFromHistory helper

Inverse of removeFileFromList's cache cleanup. Splits 576-dim mlFeatures
back into featureCache (64) and clipCache (512), or restores only
featureCache when only 64-dim is present. Restores featureMetadata
with mtime:0 (session-only validity). No-ops on null/unexpected input."
```

---

### Task 2: Bug 2 — `sortComplete` populates `predictionScores`

**Files:**
- Modify: `media-viewer.js` (`handleMlWorkerMessage` case `'sortComplete'` around L5648)
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write the failing test**

Append at the bottom of `tests/media-viewer-utils.test.js`:

```js
describe('handleMlWorkerMessage sortComplete', () => {
    const handleMlWorkerMessage = extractMethod('handleMlWorkerMessage');

    it('populates predictionScores from message.scores before reordering mediaFiles', () => {
        const mediaFiles = [
            { name: 'a.png', path: '/d/a.png' },
            { name: 'b.png', path: '/d/b.png' },
            { name: 'c.png', path: '/d/c.png' },
        ];
        const ctx = {
            mediaFiles,
            predictionScores: new Map(),
            currentIndex: 2,
            isSortedByPrediction: false,
            clearProgressNotification: () => {},
            showMedia: () => {},
            updateSortPredictionButton: () => {},
            showNotification: () => {},
        };

        handleMlWorkerMessage.call(ctx, {
            type: 'sortComplete',
            sortedFilenames: ['b.png', 'a.png', 'c.png'],
            scores: { 'a.png': 0.30, 'b.png': 0.95, 'c.png': 0.10 },
        });

        expect(ctx.predictionScores.get('/d/a.png')).toBe(0.30);
        expect(ctx.predictionScores.get('/d/b.png')).toBe(0.95);
        expect(ctx.predictionScores.get('/d/c.png')).toBe(0.10);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b.png', 'a.png', 'c.png']);
        expect(ctx.isSortedByPrediction).toBe(true);
        expect(ctx.currentIndex).toBe(0);
    });

    it('does not crash when message.scores is absent (defensive)', () => {
        const ctx = {
            mediaFiles: [{ name: 'a.png', path: '/a' }],
            predictionScores: new Map(),
            currentIndex: 0,
            isSortedByPrediction: false,
            clearProgressNotification: () => {},
            showMedia: () => {},
            updateSortPredictionButton: () => {},
            showNotification: () => {},
        };

        expect(() => {
            handleMlWorkerMessage.call(ctx, {
                type: 'sortComplete',
                sortedFilenames: ['a.png'],
                // scores intentionally omitted
            });
        }).not.toThrow();
        expect(ctx.predictionScores.size).toBe(0);
        expect(ctx.isSortedByPrediction).toBe(true);
    });
});
```

- [x] **Step 2: Run the new test and confirm it fails**

```
npx vitest run tests/media-viewer-utils.test.js -t "sortComplete"
```

Expected: First test fails — `ctx.predictionScores.get('/d/a.png')` is `undefined`, expected `0.30`. Second test passes (current code already handles missing `scores` by ignoring the field).

- [x] **Step 3: Patch the `sortComplete` case in `media-viewer.js`**

Locate `case 'sortComplete':` inside `handleMlWorkerMessage` (around line 5648). Modify the `if (sorted.length > 0)` block to populate `predictionScores` from `message.scores` BEFORE reassigning `this.mediaFiles`:

```js
            case 'sortComplete':
                this.clearProgressNotification(); // Clear "Scoring" progress
                if (message.sortedFilenames) {
                    // Apply sort order
                    const filenameToFile = new Map(this.mediaFiles.map((f) => [f.name, f]));
                    const sorted = message.sortedFilenames.map((name) => filenameToFile.get(name)).filter((f) => f);

                    if (sorted.length > 0) {
                        // Sync prediction scores from worker so badges align with the re-ordered files.
                        // Without this, badges show stale per-path values from prior scoreComplete events.
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
                    // Sorting failed - show reason
                    this.showNotification(message.reason || 'Could not sort files', 'warning');
                }
                break;
```

- [x] **Step 4: Run tests, confirm they pass**

```
npx vitest run tests/media-viewer-utils.test.js -t "sortComplete"
```

Expected: 2 passed.

- [x] **Step 5: Run the full unit suite**

```
npm test
```

Expected: 187/187 passed.

- [x] **Step 6: Commit**

```
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(media-viewer): sortComplete propagates worker scores to predictionScores

The ml-worker returns {sortedFilenames, scores} from getSortedOrder, but
the renderer's sortComplete handler only consumed sortedFilenames. Per-path
predictionScores were left stale from earlier scoreComplete events, causing
the badge percentage on each media to mismatch the underlying file's actual
score (e.g., '99% / 56%' instead of '99% / 54%').

Iterate message.scores via the existing filenameToFile Map and set
predictionScores by path before applying the new mediaFiles ordering."
```

---

### Task 3: Bug 1 — capture `mlFeatures` on special moves

**Files:**
- Modify: `media-viewer.js` (`moveToSpecialFolder`, history entry construction around L1345)

No test of its own — covered by Task 4's special-move undo test.

- [x] **Step 1: Read context to locate the patch site**

Open `media-viewer.js` and locate `moveToSpecialFolder` (around L1257). The history entry is constructed around L1345-L1352:

```js
            // Store move in history for undo functionality
            const historyEntry = {
                fileName: fileToMove.name,
                originalPath: fileToMove.path,
                newPath: moveResult.targetPath,
                fileSize: fileToMove.size,
                fileType: fileToMove.type,
                actionType: 'special',
            };
```

- [x] **Step 2: Add `mlFeatures` capture BEFORE the move**

Look up the pattern in `moveCurrentFile` at L1158-L1182. Mirror it: insert an `mlFeatures` extraction block BEFORE the `try { ... await window.electronAPI.moveFile ... }` block in `moveToSpecialFolder` — so features are read while the file is still at its original path.

Insert this code right after `const targetFolderName = window.electronAPI.path.basename(targetFolderPath);` (around L1318) and before the `try {` block (around L1320):

```js
        // Extract ML features BEFORE moving file (while media is still accessible).
        // Captured into history so undo can restore feature caches that
        // removeFileFromList clears below.
        let mlFeatures = null;
        if (this.isMlEnabled && this.mlWorker) {
            const combined = this.getCombinedFeatures(fileToMove.path);
            const rawFeatures = this.featureCache.get(fileToMove.path);
            mlFeatures = combined || (rawFeatures ? Array.from(rawFeatures) : null);
        }
```

Then modify the `historyEntry` constructor at L1345 to include `mlFeatures`:

```js
            // Store move in history for undo functionality
            const historyEntry = {
                fileName: fileToMove.name,
                originalPath: fileToMove.path,
                newPath: moveResult.targetPath,
                fileSize: fileToMove.size,
                fileType: fileToMove.type,
                actionType: 'special',
                mlFeatures: mlFeatures ? Array.from(mlFeatures) : null,
            };
```

- [x] **Step 3: Run the full unit suite to confirm no regression**

```
npm test
```

Expected: 187/187 passed (no new tests yet — Task 4 will exercise this).

- [x] **Step 4: Commit**

```
git add media-viewer.js
git commit -m "feat(media-viewer): capture mlFeatures in moveToSpecialFolder history

Mirrors moveCurrentFile's pattern: read getCombinedFeatures (or featureCache
fallback) before the moveFile IPC and attach to historyEntry. Required so
the upcoming undo-restore path can re-populate featureCache/clipCache after
special-undo. Gated on isMlEnabled && mlWorker."
```

---

### Task 4: Bug 1 — `handleCancel` restores feature caches in all 4 branches

**Files:**
- Modify: `media-viewer.js` (`handleCancel`, four branches around L3353, L3411, L3485, L3546)
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write 3 failing tests**

Append at the bottom of `tests/media-viewer-utils.test.js`:

```js
describe('handleCancel feature restore', () => {
    const handleCancel = extractAsyncMethod('handleCancel');

    function make576() {
        const v = new Float32Array(576);
        for (let i = 0; i < 576; i++) v[i] = i % 256;
        return v;
    }
    function make64() {
        const v = new Float32Array(64);
        for (let i = 0; i < 64; i++) v[i] = i;
        return v;
    }

    function commonMocks(overrides = {}) {
        return {
            isLoading: false,
            isCompareMode: false,
            mediaFiles: [],
            moveHistory: [],
            currentIndex: 0,
            baseFolderPath: '/folder',
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            predictionScores: new Map(),
            isSortedByPrediction: false,
            isMlEnabled: true,
            mlWorker: { postMessage: vi.fn() },
            // Methods the handler calls
            signalUserActivity: () => {},
            showNotification: () => {},
            showError: () => {},
            updateFolderInfo: () => {},
            showMedia: vi.fn(async () => {}),
            requestPredictionScores: vi.fn(),
            // Helper under test — extracted as a real method so the handler can call it
            restoreFeatureCachesFromHistory: extractMethod('restoreFeatureCachesFromHistory'),
            reverseMlModelUpdate(features, actionType) {
                this.mlWorker.postMessage({
                    type: 'reverseUpdate',
                    data: { features: Array.from(features), label: actionType === 'like' ? 1 : 0 },
                });
            },
            ...overrides,
        };
    }

    function mockElectronAPI() {
        globalThis.window = {
            electronAPI: {
                moveFile: vi.fn(async ({ fileName }) => ({
                    success: true,
                    targetPath: `/folder/${fileName}`,
                })),
                path: { basename: async (p) => p.split('/').pop() },
            },
        };
    }

    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        mockElectronAPI();
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('single-mode like-undo restores featureCache, clipCache, and triggers reverseMlModelUpdate', async () => {
        const ctx = commonMocks({
            moveHistory: [{
                fileName: 'a.png',
                originalPath: '/folder/a.png',
                newPath: '/folder/like/a.png',
                fileSize: 100,
                fileType: 'image/png',
                actionType: 'like',
                mlFeatures: Array.from(make576()),
            }],
        });

        await handleCancel.call(ctx);

        expect(ctx.featureCache.has('/folder/a.png')).toBe(true);
        expect(ctx.featureCache.get('/folder/a.png').length).toBe(64);
        expect(ctx.clipCache.has('/folder/a.png')).toBe(true);
        expect(ctx.clipCache.get('/folder/a.png').length).toBe(512);
        expect(ctx.featureMetadata.get('/folder/a.png')).toEqual({ size: 100, mtime: 0 });
        // reverseMlModelUpdate posts via mlWorker.postMessage
        const reverseCall = ctx.mlWorker.postMessage.mock.calls.find(
            (c) => c[0].type === 'reverseUpdate'
        );
        expect(reverseCall).toBeDefined();
        expect(reverseCall[0].data.label).toBe(1); // like
        // requestPredictionScores is NOT explicitly called in like/dislike undo
        // (it's triggered downstream via reverseUpdateComplete debounce in the live app)
        expect(ctx.requestPredictionScores).not.toHaveBeenCalled();
    });

    it('compare-mode pair-undo restores caches for both files', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            moveHistory: [
                {
                    fileName: 'a.png',
                    originalPath: '/folder/a.png',
                    newPath: '/folder/like/a.png',
                    fileSize: 100,
                    fileType: 'image/png',
                    actionType: 'like',
                    mlFeatures: Array.from(make576()),
                },
                {
                    fileName: 'b.png',
                    originalPath: '/folder/b.png',
                    newPath: '/folder/dislike/b.png',
                    fileSize: 200,
                    fileType: 'image/png',
                    actionType: 'dislike',
                    mlFeatures: Array.from(make64()),
                },
            ],
        });

        await handleCancel.call(ctx);

        // Both files: featureCache populated
        expect(ctx.featureCache.has('/folder/a.png')).toBe(true);
        expect(ctx.featureCache.has('/folder/b.png')).toBe(true);
        // Only a.png had 576-dim → clipCache should be present for it but not for b.png (64-dim only)
        expect(ctx.clipCache.has('/folder/a.png')).toBe(true);
        expect(ctx.clipCache.has('/folder/b.png')).toBe(false);
        // Two reverseUpdate calls
        const reverseCalls = ctx.mlWorker.postMessage.mock.calls.filter(
            (c) => c[0].type === 'reverseUpdate'
        );
        expect(reverseCalls.length).toBe(2);
    });

    it('special-move undo (compare mode) restores featureCache and calls requestPredictionScores when sorted-by-prediction', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            isSortedByPrediction: true,
            // Special-move undo in compare mode (branch at L3353 — compareMode && special)
            mediaFiles: [
                { name: 'remaining.png', path: '/folder/remaining.png' },
            ],
            moveHistory: [{
                fileName: 'special.png',
                originalPath: '/folder/special.png',
                newPath: '/folder/special-folder/special.png',
                fileSize: 300,
                fileType: 'image/png',
                actionType: 'special',
                compareMode: true,
                remainingFile: { name: 'remaining.png', path: '/folder/remaining.png' },
                remainingFileOriginalIndex: 1,
                mlFeatures: Array.from(make64()),
            }],
        });

        await handleCancel.call(ctx);

        expect(ctx.featureCache.has('/folder/special.png')).toBe(true);
        // No reverseUpdate (special is unrated)
        const reverseCalls = ctx.mlWorker.postMessage.mock.calls.filter(
            (c) => c[0].type === 'reverseUpdate'
        );
        expect(reverseCalls.length).toBe(0);
        // Special branch needs explicit requestPredictionScores since no reverseUpdateComplete debounce
        expect(ctx.requestPredictionScores).toHaveBeenCalledTimes(1);
    });
});
```

- [x] **Step 2: Run the new tests and confirm they fail**

```
npx vitest run tests/media-viewer-utils.test.js -t "handleCancel feature restore"
```

Expected: All 3 tests fail. Failures will be assertion failures on `featureCache.has(...)` being `false`, since the helper isn't called yet.

- [x] **Step 3: Patch the 4 branches of `handleCancel` in `media-viewer.js`**

Locate `handleCancel` (~L3342). Make these edits:

**Branch 1 (special compare-mode, around L3353-L3410):** After `this.currentIndex = insertIndex;` and BEFORE `await this.showMedia();`, insert:

```js
                this.restoreFeatureCachesFromHistory(lastMove);
                if (this.isSortedByPrediction) this.requestPredictionScores();
```

**Branch 2 (compare-mode like/dislike pair, around L3411-L3484):** After the two `reverseMlModelUpdate` calls (around L3460) and BEFORE the existing `this.showNotification('✅ Restored ${firstMove.fileName}', 'success');` block, insert:

```js
                this.restoreFeatureCachesFromHistory(firstMove);
                this.restoreFeatureCachesFromHistory(secondMove);
```

**Branch 3 (single-mode compare-pair undo, around L3485-L3545):** After the two `reverseMlModelUpdate` calls (around L3532) and BEFORE the `this.showNotification('Restored ${firstMove.fileName}'…` calls, insert the same two lines:

```js
                this.restoreFeatureCachesFromHistory(firstMove);
                this.restoreFeatureCachesFromHistory(secondMove);
```

**Branch 4 (single-mode single-file undo, around L3546-L3584):** After `this.reverseMlModelUpdate(undoMove.mlFeatures, undoMove.actionType);` (around L3571) and BEFORE `this.showNotification('✅ Restored ${undoMove.fileName}', 'success');`, insert:

```js
                this.restoreFeatureCachesFromHistory(undoMove);
```

**Verify all four edits land OUTSIDE the `catch` blocks** — they must run only on the success paths. The `catch` blocks restore `moveHistory` via `push` on error and do NOT call `showMedia()`.

- [x] **Step 4: Run the new tests, confirm they pass**

```
npx vitest run tests/media-viewer-utils.test.js -t "handleCancel feature restore"
```

Expected: 3 passed.

- [x] **Step 5: Run the full unit suite**

```
npm test
```

Expected: 190/190 passed (187 + 3 new).

- [x] **Step 6: Commit**

```
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(media-viewer): restore feature caches on undo in handleCancel

removeFileFromList aggressively clears featureCache, clipCache,
featureMetadata, and predictionScores at rating time. After undo, the
file was restored to mediaFiles but its ML state stayed missing, so the
prediction badge never reappeared.

Call restoreFeatureCachesFromHistory(move) in all 4 handleCancel
branches before showMedia(). The like/dislike branches rely on the
existing reverseMlModelUpdate → reverseUpdateComplete → debounced
requestPredictionScores chain to re-score. The special-move branch
has no reverse-update path, so it explicitly calls
requestPredictionScores() when isSortedByPrediction is true."
```

---

### Task 5: Lint, format, full verification

**Files:** none modified beyond what's already committed.

- [x] **Step 1: Run lint**

```
npm run lint
```

Expected: zero errors. If new warnings appear about `no-unused-vars`, ensure any caught errors / unused destructures use `_`-prefix per project convention.

- [x] **Step 2: Run format check**

```
npm run format:check
```

Expected: no formatting drift.

- [x] **Step 3: Run full unit suite one more time**

```
npm test
```

Expected: 190/190 passed.

- [x] **Step 4: Smoke-test manually in the running app**

Run `npm start`. Verify each scenario by hand:

1. **Bug 2 fix** — open a folder, rate ≥3 files for likes + ≥3 for dislikes, click "Sort by Predicted". Verify each displayed file's badge percentage matches the descending-score order (e.g., the first file shows the highest %, second-highest %, etc., not a misalignment).
2. **Bug 1 fix — single mode** — with AI sort active, rate a file (like). It disappears, next file shows. Press undo. The previous file returns AND its prediction badge re-appears.
3. **Bug 1 fix — compare mode** — with AI sort active in compare mode, rate the pair. Both disappear. Undo. Both return with their badges.
4. **Bug 1 fix — special move** — with AI sort active, hit the special-folder rating. The file moves. Undo. File returns; badge re-appears.
5. **Regression sanity** — without AI sort, rate-then-undo should still work normally (no crash, no badge — by design).

- [x] **Step 5: No new commit if no edits**

Lint/format are no-ops if Task 1-4 commits already cleared them. If lint surfaces something, fix and commit `chore: lint fixes for Group B`.

---

### Task 6: Documentation updates

**Files:**
- Modify: `docs/planning/TODO.md`
- Modify: `docs/planning/DONE.md`
- Modify: `docs/planning/WEEKLY.md`

- [x] **Step 1: Move both bug entries from TODO.md to DONE.md**

In `docs/planning/TODO.md`, find the two entries:
- `#### Like-probability not displayed after undo` (L69)
- `#### Prediction percentages misaligned after similarity-sort cancel + AI sort` (L87)

Remove both sections from TODO.md.

In `docs/planning/DONE.md`, add a new entry following the existing format. Use this template:

```markdown
### Group B: AI Prediction Display Bugs (2026-05-14)

**PR:** TBD (filled after PR creation)
**Branch:** `fix/ai-prediction-display-bugs`
**Effort:** 5 SP

**Summary:** Fixed two bugs in the ML prediction badge display layer.

**Bug 1 — Like-probability missing after undo:** `removeFileFromList()` clears featureCache/clipCache/predictionScores at rating time. After undo, the file was restored to mediaFiles but its ML state stayed missing. Added new `restoreFeatureCachesFromHistory(entry)` helper (inverse of removeFileFromList's cleanup) called in all 4 handleCancel branches. Added `mlFeatures` capture to `moveToSpecialFolder` so special-undo also restores. Special branch (no reverseMlModelUpdate path) adds explicit `requestPredictionScores()` call.

**Bug 2 — Prediction percentages misaligned after AI sort:** `sortComplete` handler in `handleMlWorkerMessage` ignored `message.scores` from ml-worker, leaving `predictionScores` stale from prior `scoreComplete` events. Fixed by iterating `message.scores` and writing into `predictionScores` by path before applying `mediaFiles = sorted`.

**Tests:** 9 new Vitest unit tests in `tests/media-viewer-utils.test.js` (5 for helper, 2 for sortComplete, 3 for handleCancel). 180/180 → 190/190 unit tests. E2E: skipped (no E2E coverage for ML state transitions today; tracked as BACKLOG).

**Spec:** `docs/superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md`
```

Replace `TBD` with the actual PR number after PR creation.

- [x] **Step 2: Mark Group B complete in WEEKLY.md**

In `docs/planning/WEEKLY.md`:

Around L33-L41 (under "Group B: AI Prediction Display Bugs [batch]"), flip the two `- [x]` checkboxes to `- [x]`.

Around L102-L110 (under "Tuesday, May 12 — AI Prediction Display Bugs"), flip both `- [x]` checkboxes to `- [x]`.

Around L172 (in the weekly summary table), change `B: AI Prediction Display Bugs … | Planned` to `B: AI Prediction Display Bugs … | ✅ Complete (2026-05-14)`.

- [x] **Step 3: Commit doc updates**

```
git add docs/planning/TODO.md docs/planning/DONE.md docs/planning/WEEKLY.md
git commit -m "docs: move Group B entries TODO → DONE; mark WEEKLY complete

Both AI prediction display bugs fixed in this branch. PR # to be filled
in after creation."
```

---

### Task 7: PR creation

**Files:** none.

- [x] **Step 1: Push branch**

```
git push -u origin fix/ai-prediction-display-bugs
```

- [x] **Step 2: Create PR with `gh pr create`**

```
gh pr create --title "fix: AI prediction display bugs (Group B)" --body "$(cat <<'EOF'
## Summary

- Fix: prediction badge disappears after undoing a rating (`handleCancel` did not restore feature caches that `removeFileFromList` cleared at rating time).
- Fix: AI-sort prediction percentages misalign with media (`sortComplete` ignored `message.scores` from the ml-worker).
- New helper `restoreFeatureCachesFromHistory(entry)` (inverse of `removeFileFromList`'s cleanup); `moveToSpecialFolder` now captures `mlFeatures` so special-undo restores the badge too.

Spec: `docs/superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md`

## Test plan

- [x] 9 new Vitest unit tests (`tests/media-viewer-utils.test.js`): 5 for the helper, 2 for `sortComplete`, 3 for `handleCancel` branches. 180→190 unit tests, all passing.
- [x] Lint clean (`npm run lint`).
- [x] Manual: AI-sort → undo (single mode) → badge re-appears with correct %.
- [x] Manual: AI-sort → undo pair (compare mode) → both badges re-appear.
- [x] Manual: AI-sort → special-folder rating → undo → badge re-appears.
- [x] Manual: AI sort percentages now align with each displayed file's actual score (no '99% / 56%' misalignment).
- [x] Regression: rate-undo without AI sort works as before (no badge, by design).
EOF
)"
```

- [x] **Step 3: Backfill PR number in DONE.md**

After `gh pr create` prints the PR URL, edit `docs/planning/DONE.md` Group B entry — replace `**PR:** TBD` with `**PR:** #N` where N is the new PR number. Commit:

```
git add docs/planning/DONE.md
git commit -m "docs: backfill PR number in DONE.md Group B entry"
git push
```

---

## Self-Review

**Spec coverage check (against [docs/superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md](../specs/2026-05-14-ai-prediction-display-bugs-design.md)):**
- Bug 2 sortComplete patch → Task 2. ✓
- `restoreFeatureCachesFromHistory` helper, 4 dim-handling cases + featureMetadata → Task 1. ✓
- `moveToSpecialFolder` mlFeatures capture → Task 3. ✓
- All 4 `handleCancel` branches call the helper → Task 4. ✓
- Special branch explicit `requestPredictionScores` → Task 4. ✓
- Acceptance: 5 helper + 1 sortComplete + 3 handleCancel = 9 tests → spread across Tasks 1, 2, 4. ✓
- Test plan: unit only (E2E skipped per design decision) → covered. ✓
- Files-changed table: media-viewer.js + tests file + docs → Tasks 1-4 + Task 6. ✓
- Out-of-scope items (perceptualHashes restore, E2E for ML, deleteMlModelCache rename, clipUnloadTimer cleanup): NOT included; correct. ✓

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "fill in details" / "similar to Task N". Task 6 contains literal `TBD` for the PR number — this is intentional and is filled in Task 7 step 3.

**Type/method consistency:**
- Helper signature `restoreFeatureCachesFromHistory(entry)` consistent across Tasks 1, 4, and spec. ✓
- `mlFeatures` field name consistent across `moveCurrentFile` (existing), `moveToSpecialFolder` (Task 3), `handleCancel` (Task 4 spec). ✓
- `predictionScores`, `featureCache`, `clipCache`, `featureMetadata` Map names consistent with existing code. ✓
- `message.scores` shape `{filename: score}` consistent with ml-worker's `getSortedOrder` return. ✓
- `historyEntry.originalPath`, `.fileSize`, `.mlFeatures`, `.actionType` consistent with `moveCurrentFile` and `moveComparePair` patterns. ✓

Plan is internally consistent and complete.
