# Re-rate / Mode-Correction (Compare) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "👍 Both good / 👎 Both bad" corrective-training buttons to AI-sorted compare mode that feed both displayed files into the ML model without moving them, persisting corrections to a per-folder `.bulk_rated.json` so they survive model rebuilds.

**Architecture:** Renderer-side `MediaViewer` gains a `this.bulkRated` Map (filename→`'good'|'bad'`), persisted via two new Electron IPC handlers that mirror the existing tournament-state handlers. Bulk-rating trains both compare files (`updateMlModelWithFeatures`), records an undo entry, and advances to the next pair. Corrections re-inject into `trainFromHistoricalRatings()` so model rebuilds don't lose them. No suppression, no badge, no live re-sort — bulk-rated files are treated as regular files.

**Tech Stack:** Electron (main + preload IPC), vanilla JS renderer (no bundler), Vitest unit tests (`extractMethod`/`extractAsyncMethod` source-extraction pattern), Playwright E2E.

**Spec:** [docs/superpowers/specs/2026-05-31-rerate-compare-correction-design.md](2026-05-31-rerate-compare-correction-design.md)

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `main.js` | `readBulkRatedFile` / `writeBulkRatedFile` IPC handlers (per-folder `.bulk_rated.json`) | Modify (add 2 handlers near `readTournamentState`, ~L243) |
| `preload.js` | Expose the two IPC channels on `window.electronAPI` | Modify (~L50) |
| `media-viewer.js` | All renderer logic: state, persistence helpers, bulk-rate action + undo, retrain re-inject, cleanup purge, shortcuts, UI wiring | Modify (multiple sites) |
| `index.html` | Two buttons in `.compare-controls` | Modify (~L222) |
| `styles.css` | `.bulk-rate-controls` layout | Modify (append) |
| `tests/media-viewer-utils.test.js` | Unit coverage for the new MediaViewer methods | Modify (append describe blocks) |
| `tests/keyboard-shortcuts.test.js` | Updated default-shortcut assertions | Modify (~L42-64 + 1 new test) |
| `tests/e2e/compare-mode.test.js` | End-to-end click → toast → persist → undo | Modify (append test) |

---

## Task 1: IPC handlers for `.bulk_rated.json`

**Files:**
- Modify: `main.js` (after the `deleteTournamentState` handler, ~L279)
- Modify: `preload.js` (after the tournament IPC exposures, ~L50)

No unit test (main-process IPC handlers are not unit-tested in this project; verified via E2E in Task 10 and lint here).

- [ ] **Step 1: Add the two IPC handlers in `main.js`**

Insert immediately after the `deleteTournamentState` handler block (which ends at `});` near L279), mirroring the tournament-state pattern:

```javascript
    ipcMain.handle('readBulkRatedFile', async (_event, folderPath) => {
        try {
            const filePath = path.join(folderPath, '.bulk_rated.json');
            const text = await fs.readFile(filePath, 'utf-8');
            const json = JSON.parse(text);
            return { success: true, data: json };
        } catch (err) {
            if (err.code === 'ENOENT') {
                return { success: true, data: null };
            }
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('writeBulkRatedFile', async (_event, folderPath, data) => {
        try {
            const filePath = path.join(folderPath, '.bulk_rated.json');
            const text = JSON.stringify(data, null, 2);
            await fs.writeFile(filePath, text, 'utf-8');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
```

- [ ] **Step 2: Expose both channels in `preload.js`**

Insert after the `deleteTournamentState` exposure (~L50):

```javascript
    readBulkRatedFile: (folderPath) => ipcRenderer.invoke('readBulkRatedFile', folderPath),
    writeBulkRatedFile: (folderPath, data) => ipcRenderer.invoke('writeBulkRatedFile', folderPath, data),
```

- [ ] **Step 3: Lint to verify no syntax errors**

Run: `npm run lint`
Expected: PASS (no errors in `main.js` / `preload.js`).

- [ ] **Step 4: Commit**

```bash
git add main.js preload.js
git commit -m "feat(ipc): add readBulkRatedFile/writeBulkRatedFile handlers for .bulk_rated.json"
```

---

## Task 2: Bulk-rated state + persistence helpers

**Files:**
- Modify: `media-viewer.js` constructor (~L396, after `this.previousScores = null;`)
- Modify: `media-viewer.js` (add `loadBulkRatedFile` / `saveBulkRatedFile` methods, e.g. next to `getCombinedFeatures`)
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/media-viewer-utils.test.js` (the file already defines `extractAsyncMethod`):

```javascript
describe('bulk-rated persistence', () => {
    const loadBulkRatedFile = extractAsyncMethod('loadBulkRatedFile');
    const saveBulkRatedFile = extractAsyncMethod('saveBulkRatedFile');
    let origWindow;
    let written;

    beforeEach(() => {
        origWindow = globalThis.window;
        written = null;
        globalThis.window = {
            electronAPI: {
                readBulkRatedFile: async () => ({
                    success: true,
                    data: { version: 1, good: ['a.jpg', 'gone.jpg'], bad: ['b.jpg'] },
                }),
                writeBulkRatedFile: async (_folder, data) => {
                    written = data;
                    return { success: true };
                },
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('hydrates the bulkRated map and prunes filenames absent from mediaFiles', async () => {
        const ctx = {
            baseFolderPath: '/folder',
            mediaFiles: [
                { name: 'a.jpg', path: '/folder/a.jpg' },
                { name: 'b.jpg', path: '/folder/b.jpg' },
            ],
            bulkRated: new Map(),
        };
        ctx.saveBulkRatedFile = saveBulkRatedFile.bind(ctx);
        await loadBulkRatedFile.call(ctx);
        expect(ctx.bulkRated.get('a.jpg')).toBe('good');
        expect(ctx.bulkRated.get('b.jpg')).toBe('bad');
        expect(ctx.bulkRated.has('gone.jpg')).toBe(false);
        // stale 'gone.jpg' pruned -> file re-saved without it
        expect(written).toEqual({ version: 1, good: ['a.jpg'], bad: ['b.jpg'] });
    });

    it('serializes the bulkRated map back to {version, good, bad}', async () => {
        const ctx = {
            baseFolderPath: '/folder',
            bulkRated: new Map([
                ['x.png', 'good'],
                ['y.png', 'bad'],
            ]),
        };
        await saveBulkRatedFile.call(ctx);
        expect(written).toEqual({ version: 1, good: ['x.png'], bad: ['y.png'] });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "bulk-rated persistence"`
Expected: FAIL with "Could not find method: loadBulkRatedFile".

- [ ] **Step 3: Add the constructor state**

In `media-viewer.js`, after `this.previousScores = null;` (~L396) add:

```javascript
        // Corrective training: filename -> 'good' | 'bad' (mirrors per-folder .bulk_rated.json)
        this.bulkRated = new Map();
```

- [ ] **Step 4: Add the two helper methods**

In `media-viewer.js`, add these methods to the `MediaViewer` class (place them right after `getCombinedFeatures(filePath) { ... }`):

```javascript
    async loadBulkRatedFile() {
        this.bulkRated = new Map();
        if (!this.baseFolderPath) return;
        try {
            const result = await window.electronAPI.readBulkRatedFile(this.baseFolderPath);
            if (!result.success || !result.data) return;
            const validNames = new Set(this.mediaFiles.map((f) => f.name));
            let pruned = false;
            for (const name of result.data.good || []) {
                if (validNames.has(name)) this.bulkRated.set(name, 'good');
                else pruned = true;
            }
            for (const name of result.data.bad || []) {
                if (validNames.has(name)) this.bulkRated.set(name, 'bad');
                else pruned = true;
            }
            if (pruned) await this.saveBulkRatedFile();
        } catch (err) {
            console.warn('Failed to load .bulk_rated.json:', err.message);
        }
    }

    async saveBulkRatedFile() {
        if (!this.baseFolderPath) return;
        const data = { version: 1, good: [], bad: [] };
        for (const [name, bucket] of this.bulkRated) {
            if (bucket === 'good') data.good.push(name);
            else if (bucket === 'bad') data.bad.push(name);
        }
        try {
            await window.electronAPI.writeBulkRatedFile(this.baseFolderPath, data);
        } catch (err) {
            console.warn('Failed to save .bulk_rated.json:', err.message);
        }
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "bulk-rated persistence"`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(ml): add bulkRated state + .bulk_rated.json load/save helpers"
```

---

## Task 3: Hydrate `.bulk_rated.json` on folder load

**Files:**
- Modify: `media-viewer.js` `loadFolder()` (~L2379, after `this.cancelBackgroundExtraction();`)

Verified by the full suite still passing + E2E (Task 10). `loadFolder` is not unit-tested directly.

- [ ] **Step 1: Add the hydration call**

In `loadFolder()`, immediately after `this.cancelBackgroundExtraction();` (~L2379) add:

```javascript
            // Hydrate corrective-training records for this folder (prunes stale filenames)
            await this.loadBulkRatedFile();
```

(`this.mediaFiles` is already assigned above at `this.mediaFiles = result.files;`, so the stale-prune has the current file set.)

- [ ] **Step 2: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (all existing tests still green).

- [ ] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat(ml): hydrate .bulk_rated.json in loadFolder"
```

---

## Task 4: Bulk-rate action — `applyBulkRating` + handlers + dispatch

**Files:**
- Modify: `media-viewer.js` (add `applyBulkRating` / `handleBothGood` / `handleBothBad` methods)
- Modify: `media-viewer.js` `executeAction()` (~L8262, before the closing `};`)
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/media-viewer-utils.test.js`:

```javascript
describe('applyBulkRating', () => {
    const applyBulkRating = extractAsyncMethod('applyBulkRating');

    function makeCtx(overrides = {}) {
        return {
            isSortedByPrediction: true,
            isCompareMode: true,
            compareLeftFile: { name: 'a.jpg', path: '/f/a.jpg' },
            compareRightFile: { name: 'b.jpg', path: '/f/b.jpg' },
            bulkRated: new Map(),
            moveHistory: [],
            getCombinedFeatures: () => [1, 2, 3],
            updateMlModelWithFeatures: vi.fn(),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
            nextMedia: vi.fn(),
            ...overrides,
        };
    }

    it('trains both files as like and records them as good, then advances', async () => {
        const ctx = makeCtx();
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).toHaveBeenCalledTimes(2);
        expect(ctx.updateMlModelWithFeatures).toHaveBeenCalledWith([1, 2, 3], 'like');
        expect(ctx.bulkRated.get('a.jpg')).toBe('good');
        expect(ctx.bulkRated.get('b.jpg')).toBe('good');
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.moveHistory[0].bothGood).toBe(true);
        expect(ctx.moveHistory[0].bulkFiles).toHaveLength(2);
        expect(ctx.nextMedia).toHaveBeenCalledOnce();
    });

    it('trains both files as dislike for the bad bucket', async () => {
        const ctx = makeCtx();
        await applyBulkRating.call(ctx, 'bad');
        expect(ctx.updateMlModelWithFeatures).toHaveBeenCalledWith([1, 2, 3], 'dislike');
        expect(ctx.bulkRated.get('a.jpg')).toBe('bad');
        expect(ctx.moveHistory[0].bothBad).toBe(true);
    });

    it('no-ops outside AI-sorted compare mode', async () => {
        const ctx = makeCtx({ isSortedByPrediction: false });
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toHaveLength(0);
        expect(ctx.nextMedia).not.toHaveBeenCalled();
    });

    it('no-ops when a compare file is missing', async () => {
        const ctx = makeCtx({ compareRightFile: null });
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).not.toHaveBeenCalled();
    });

    it('stores null features (no training) when the cache misses', async () => {
        const ctx = makeCtx({ getCombinedFeatures: () => null });
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).not.toHaveBeenCalled();
        expect(ctx.bulkRated.get('a.jpg')).toBe('good');
        expect(ctx.moveHistory[0].bulkFiles[0].features).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "applyBulkRating"`
Expected: FAIL with "Could not find method: applyBulkRating".

- [ ] **Step 3: Add the three methods**

In `media-viewer.js`, add to the `MediaViewer` class (place near `updateMlModelAfterRating`):

```javascript
    async applyBulkRating(bucket) {
        if (!this.isSortedByPrediction || !this.isCompareMode) return;
        const left = this.compareLeftFile;
        const right = this.compareRightFile;
        if (!left || !right) return;

        const actionType = bucket === 'good' ? 'like' : 'dislike';
        const bulkFiles = [];
        for (const f of [left, right]) {
            const features = this.getCombinedFeatures(f.path);
            if (features) {
                this.updateMlModelWithFeatures(features, actionType);
            }
            bulkFiles.push({ name: f.name, features });
            this.bulkRated.set(f.name, bucket);
        }

        await this.saveBulkRatedFile();

        this.moveHistory.push({
            bothGood: bucket === 'good',
            bothBad: bucket === 'bad',
            bulkFiles,
        });

        this.showNotification(
            bucket === 'good'
                ? '👍 Both files marked good (model updated)'
                : '👎 Both files marked bad (model updated)',
            'success'
        );

        this.nextMedia();
    }

    handleBothGood() {
        this.applyBulkRating('good');
    }

    handleBothBad() {
        this.applyBulkRating('bad');
    }
```

- [ ] **Step 4: Wire the actions into `executeAction`**

In `executeAction()` (~L8262), add two entries to the `actions` map (after `rightDislike: () => this.handleRightDislike(),`):

```javascript
            bothGood: () => this.handleBothGood(),
            bothBad: () => this.handleBothBad(),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "applyBulkRating"`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(ml): add applyBulkRating + handleBothGood/handleBothBad + executeAction wiring"
```

---

## Task 5: Undo a bulk rating in `handleCancel`

**Files:**
- Modify: `media-viewer.js` (add `undoBulkRating` method)
- Modify: `media-viewer.js` `handleCancel()` (~L3486, right after `const lastMove = ...`)
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/media-viewer-utils.test.js`:

```javascript
describe('undoBulkRating', () => {
    const undoBulkRating = extractAsyncMethod('undoBulkRating');

    it('reverses both updates and clears both files from bulkRated', async () => {
        const ctx = {
            bulkRated: new Map([
                ['a.jpg', 'good'],
                ['b.jpg', 'good'],
            ]),
            reverseMlModelUpdate: vi.fn(),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
        };
        const lastMove = {
            bothGood: true,
            bothBad: false,
            bulkFiles: [
                { name: 'a.jpg', features: [1, 2, 3] },
                { name: 'b.jpg', features: [4, 5, 6] },
            ],
        };
        await undoBulkRating.call(ctx, lastMove);
        expect(ctx.reverseMlModelUpdate).toHaveBeenCalledTimes(2);
        expect(ctx.reverseMlModelUpdate).toHaveBeenCalledWith([1, 2, 3], 'like');
        expect(ctx.bulkRated.size).toBe(0);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('skips ML reversal for files stored with null features', async () => {
        const ctx = {
            bulkRated: new Map([['a.jpg', 'bad']]),
            reverseMlModelUpdate: vi.fn(),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
        };
        const lastMove = {
            bothGood: false,
            bothBad: true,
            bulkFiles: [{ name: 'a.jpg', features: null }],
        };
        await undoBulkRating.call(ctx, lastMove);
        expect(ctx.reverseMlModelUpdate).not.toHaveBeenCalled();
        expect(ctx.bulkRated.has('a.jpg')).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "undoBulkRating"`
Expected: FAIL with "Could not find method: undoBulkRating".

- [ ] **Step 3: Add the `undoBulkRating` method**

In `media-viewer.js`, add to the `MediaViewer` class (place right before `handleCancel`):

```javascript
    async undoBulkRating(lastMove) {
        const actionType = lastMove.bothGood ? 'like' : 'dislike';
        for (const f of lastMove.bulkFiles) {
            if (f.features) this.reverseMlModelUpdate(f.features, actionType);
            this.bulkRated.delete(f.name);
        }
        await this.saveBulkRatedFile();
        this.showNotification('↩️ Bulk rating undone', 'info');
    }
```

- [ ] **Step 4: Add the intercept branch in `handleCancel`**

In `handleCancel()`, immediately after `const lastMove = this.moveHistory[this.moveHistory.length - 1];` (~L3486) and before the `if (this.isCompareMode && lastMove.compareMode && ...)` branch, add:

```javascript
        // Bulk rating (Both good / Both bad): no file move to reverse — just undo the ML updates.
        if (lastMove.bothGood || lastMove.bothBad) {
            this.moveHistory.pop();
            await this.undoBulkRating(lastMove);
            return;
        }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "undoBulkRating"`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(ml): undo Both good/Both bad via handleCancel bulk-rating branch"
```

---

## Task 6: Purge bulk-rated entry on real file move

**Files:**
- Modify: `media-viewer.js` `removeFileFromList()` (~L1027-1033)
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/media-viewer-utils.test.js`:

```javascript
describe('removeFileFromList bulk-rated purge', () => {
    const removeFileFromList = extractMethod('removeFileFromList');

    function makeCtx() {
        return {
            mediaFiles: [
                { name: 'a.jpg', path: '/f/a.jpg' },
                { name: 'b.jpg', path: '/f/b.jpg' },
            ],
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map([['a.jpg', 'good']]),
            currentIndex: 0,
            saveBulkRatedFile: vi.fn(),
        };
    }

    it('purges a removed file from bulkRated and re-saves', () => {
        const ctx = makeCtx();
        removeFileFromList.call(ctx, '/f/a.jpg');
        expect(ctx.bulkRated.has('a.jpg')).toBe(false);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('does not re-save when the removed file was not bulk-rated', () => {
        const ctx = makeCtx();
        removeFileFromList.call(ctx, '/f/b.jpg');
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "removeFileFromList bulk-rated purge"`
Expected: FAIL (`ctx.bulkRated` still contains `a.jpg`; `saveBulkRatedFile` not called).

- [ ] **Step 3: Capture the filename and purge**

In `removeFileFromList()`, change the top of the method so the filename is captured before the splice, and add the purge after the existing cache deletes. The method becomes:

```javascript
    removeFileFromList(filePath) {
        const index = this.mediaFiles.findIndex((f) => f.path === filePath);
        if (index === -1) return -1;

        const removedName = this.mediaFiles[index].name;
        this.mediaFiles.splice(index, 1);

        this.predictionScores.delete(filePath);
        this.featureCache.delete(filePath);
        this.clipCache.delete(filePath);
        this.featureMetadata.delete(filePath);
        this.perceptualHashes.delete(filePath);
        if (this.bulkRated.delete(removedName)) {
            this.saveBulkRatedFile();
        }

        if (this.currentIndex >= this.mediaFiles.length) {
            this.currentIndex = Math.max(0, this.mediaFiles.length - 1);
        }

        return index;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "removeFileFromList bulk-rated purge"`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite (removeFileFromList is widely used)**

Run: `npm test`
Expected: PASS (all green — the existing `removeFileFromList` tests already include the cache Maps; `bulkRated` defaults must exist in their ctx. If any pre-existing `removeFileFromList` test fails with "bulkRated is undefined", add `bulkRated: new Map()` to that test's mock context.)

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(ml): purge bulk-rated entry when a file is moved out of the list"
```

---

## Task 7: Re-inject corrections on model rebuild

**Files:**
- Modify: `media-viewer.js` (add `collectBulkRatedTrainingExamples` method)
- Modify: `media-viewer.js` `trainFromHistoricalRatings()` (~L6940, before the `if (likedFeatures.length > 0 || dislikedFeatures.length > 0)` post)
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/media-viewer-utils.test.js`:

```javascript
describe('collectBulkRatedTrainingExamples', () => {
    const collect = extractAsyncMethod('collectBulkRatedTrainingExamples');

    it('splits cached combined features into liked/disliked by bucket', async () => {
        const ctx = {
            bulkRated: new Map([
                ['a.jpg', 'good'],
                ['b.jpg', 'bad'],
            ]),
            mediaFiles: [
                { name: 'a.jpg', path: '/f/a.jpg' },
                { name: 'b.jpg', path: '/f/b.jpg' },
            ],
            getCombinedFeatures: (p) => (p === '/f/a.jpg' ? [1, 1] : [2, 2]),
        };
        const result = await collect.call(ctx);
        expect(result.liked).toEqual([[1, 1]]);
        expect(result.disliked).toEqual([[2, 2]]);
    });

    it('skips bulk-rated names no longer present in mediaFiles', async () => {
        const ctx = {
            bulkRated: new Map([['gone.jpg', 'good']]),
            mediaFiles: [{ name: 'a.jpg', path: '/f/a.jpg' }],
            getCombinedFeatures: () => [9, 9],
        };
        const result = await collect.call(ctx);
        expect(result.liked).toEqual([]);
        expect(result.disliked).toEqual([]);
    });

    it('computes 576-dim features when the cache misses', async () => {
        const ctx = {
            bulkRated: new Map([['a.jpg', 'good']]),
            mediaFiles: [{ name: 'a.jpg', path: '/f/a.jpg' }],
            getCombinedFeatures: () => null,
            computeFeatures: async () => new Float32Array(64).fill(0.5),
            extractClipEmbedding: async () => new Float32Array(512).fill(0.1),
        };
        const result = await collect.call(ctx);
        expect(result.liked).toHaveLength(1);
        expect(result.liked[0]).toHaveLength(576);
        expect(result.disliked).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "collectBulkRatedTrainingExamples"`
Expected: FAIL with "Could not find method: collectBulkRatedTrainingExamples".

- [ ] **Step 3: Add the `collectBulkRatedTrainingExamples` method**

In `media-viewer.js`, add to the `MediaViewer` class (place right before `trainFromHistoricalRatings`):

```javascript
    async collectBulkRatedTrainingExamples() {
        const liked = [];
        const disliked = [];
        for (const [name, bucket] of this.bulkRated) {
            const file = this.mediaFiles.find((f) => f.name === name);
            if (!file) continue;
            let combined = this.getCombinedFeatures(file.path);
            if (!combined) {
                try {
                    const features = await this.computeFeatures(file.path);
                    const clipVector = await this.extractClipEmbedding(file.path);
                    const merged = new Float32Array(576);
                    merged.set(features, 0);
                    if (clipVector) merged.set(clipVector, 64);
                    combined = Array.from(merged);
                } catch (err) {
                    console.warn(`Skipping bulk-rated ${name}:`, err.message);
                    continue;
                }
            }
            (bucket === 'good' ? liked : disliked).push(combined);
        }
        return { liked, disliked };
    }
```

- [ ] **Step 4: Call it from `trainFromHistoricalRatings`**

In `trainFromHistoricalRatings()`, immediately before the `if (likedFeatures.length > 0 || dislikedFeatures.length > 0) {` block (~L6940) add:

```javascript
            // Re-apply corrective bulk ratings (these files stay in the source folder and are
            // never in the like/dislike folders, so a from-scratch rebuild can't recover them).
            const bulkExamples = await this.collectBulkRatedTrainingExamples();
            likedFeatures.push(...bulkExamples.liked);
            dislikedFeatures.push(...bulkExamples.disliked);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "collectBulkRatedTrainingExamples"`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "feat(ml): re-inject bulk-rated corrections in trainFromHistoricalRatings"
```

---

## Task 8: Shortcut remap (A/S/D/F cluster)

**Files:**
- Modify: `media-viewer.js` `DEFAULT_SHORTCUTS` (~L4-32) and `ACTION_LABELS` (~L34-46)
- Test: `tests/keyboard-shortcuts.test.js` (~L42-64)

- [ ] **Step 1: Update the failing assertions**

In `tests/keyboard-shortcuts.test.js`, replace the `single` assertion (L44-50) with:

```javascript
        expect(shortcuts.single).toEqual({
            like: 'KeyQ',
            dislike: 'KeyW',
            next: 'KeyS',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
        });
```

Replace the `compare` assertion (L55-63) with:

```javascript
        expect(shortcuts.compare).toEqual({
            leftLike: 'KeyQ',
            leftDislike: 'KeyW',
            rightLike: 'KeyE',
            rightDislike: 'KeyR',
            next: 'KeyS',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
            bothGood: 'KeyD',
            bothBad: 'KeyF',
        });
```

Add a new test inside the `describe('DEFAULT_SHORTCUTS', ...)` block:

```javascript
    it('compare mode has no duplicate key bindings', () => {
        const shortcuts = extractDefaultShortcuts();
        const keys = Object.values(shortcuts.compare);
        expect(new Set(keys).size).toBe(keys.length);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/keyboard-shortcuts.test.js -t "DEFAULT_SHORTCUTS"`
Expected: FAIL (current defaults still have `next: 'KeyD'` and no `bothGood`/`bothBad`).

- [ ] **Step 3: Update `DEFAULT_SHORTCUTS`**

In `media-viewer.js`, change the `single` and `compare` blocks (`tournament` is unchanged):

```javascript
const DEFAULT_SHORTCUTS = {
    single: {
        like: 'KeyQ',
        dislike: 'KeyW',
        next: 'KeyS',
        previous: 'KeyA',
        undo: 'Ctrl+KeyA',
    },
    compare: {
        leftLike: 'KeyQ',
        leftDislike: 'KeyW',
        rightLike: 'KeyE',
        rightDislike: 'KeyR',
        next: 'KeyS',
        previous: 'KeyA',
        undo: 'Ctrl+KeyA',
        bothGood: 'KeyD',
        bothBad: 'KeyF',
    },
    tournament: {
        // Like/dislike handlers are tournament-aware (see _tournamentPickFromSide)
        // so reuse the same Q/W/E/R layout as Compare Mode for muscle memory.
        leftLike: 'KeyQ',
        leftDislike: 'KeyW',
        rightLike: 'KeyE',
        rightDislike: 'KeyR',
        undo: 'Ctrl+KeyA',
        leftSpecial: 'Digit1',
        rightSpecial: 'Digit2',
    },
};
```

- [ ] **Step 4: Add the action labels**

In `ACTION_LABELS` (~L34), add two entries (after `rightSpecial: 'Right to special folder',`):

```javascript
    bothGood: 'Both media good',
    bothBad: 'Both media bad',
```

- [ ] **Step 5: Run the full suite to verify pass + no regressions**

Run: `npm test`
Expected: PASS (the updated `DEFAULT_SHORTCUTS` tests pass; nothing else asserts `next: 'KeyD'`).

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js
git commit -m "feat(shortcuts): A/S/D/F compare cluster — next->S, bothGood=D, bothBad=F"
```

---

## Task 9: UI — buttons, wiring, visibility

**Files:**
- Modify: `index.html` (~L222, inside `#compareControls`)
- Modify: `media-viewer.js` DOM refs (~L553), listeners (~L1846), new `updateBulkRateButtonsVisibility` method, `showCompareMedia` hook (~L2756)
- Modify: `styles.css` (append)

No unit test (DOM wiring); verified by E2E (Task 10) + manual smoke.

- [ ] **Step 1: Add the buttons in `index.html`**

Inside `#compareControls`, between the closing `</div>` of `.left-media-controls` (L222) and the opening `<div class="right-media-controls">` (L223), insert:

```html
                <div class="bulk-rate-controls" id="bulkRateControls" style="display: none">
                    <button class="control-btn like-btn" id="bothGoodBtn" title="Both good (D)">
                        <span class="btn-icon"><i data-lucide="thumbs-up"></i></span>
                        <span class="btn-label">Both Good</span>
                    </button>
                    <button class="control-btn dislike-btn" id="bothBadBtn" title="Both bad (F)">
                        <span class="btn-icon"><i data-lucide="thumbs-down"></i></span>
                        <span class="btn-label">Both Bad</span>
                    </button>
                </div>
```

- [ ] **Step 2: Cache the DOM refs**

In `media-viewer.js`, after `this.cancelBtnCompare = document.getElementById('cancelBtnCompare');` (~L553) add:

```javascript
        this.bothGoodBtn = document.getElementById('bothGoodBtn');
        this.bothBadBtn = document.getElementById('bothBadBtn');
```

- [ ] **Step 3: Attach click listeners**

In `media-viewer.js`, after the `if (this.leftLikeBtn) { this.leftLikeBtn.addEventListener('click', () => this.handleLeftLike()); }` block (~L1846), add:

```javascript
        if (this.bothGoodBtn) {
            this.bothGoodBtn.addEventListener('click', () => this.handleBothGood());
        }
        if (this.bothBadBtn) {
            this.bothBadBtn.addEventListener('click', () => this.handleBothBad());
        }
```

- [ ] **Step 4: Add the visibility helper**

In `media-viewer.js`, add to the `MediaViewer` class (place near `updateBulkRateButtonsVisibility`'s callers, e.g. after `updatePredictionBadges`):

```javascript
    updateBulkRateButtonsVisibility() {
        const el = document.getElementById('bulkRateControls');
        if (!el) return;
        el.style.display = this.isCompareMode && this.isSortedByPrediction ? 'flex' : 'none';
    }
```

- [ ] **Step 5: Call the helper from `showCompareMedia`**

In `showCompareMedia()`, immediately after `this.compareRightFile = rightFile;` (~L2756) add:

```javascript
        this.updateBulkRateButtonsVisibility();
```

- [ ] **Step 6: Add the container style**

Append to `styles.css`:

```css
.bulk-rate-controls {
    display: flex;
    gap: 8px;
    align-items: center;
}
```

- [ ] **Step 7: Lint + full suite**

Run: `npm run lint && npm test`
Expected: PASS (lint clean; all unit tests green).

- [ ] **Step 8: Manual smoke test**

Run: `npm start`. Load a folder with ≥4 media, click **Sort by Predicted**, switch to **Compare** mode. Verify:
- The Both Good / Both Bad buttons appear only in AI-sorted compare (hidden in single mode and in non-AI compare).
- Clicking **Both Good** shows the toast and advances to the next pair; no files move.
- Pressing `D` / `F` triggers the same actions; `S` goes to the next pair, `A` to the previous.
- `Ctrl+A` shows "Bulk rating undone".

- [ ] **Step 9: Commit**

```bash
git add index.html media-viewer.js styles.css
git commit -m "feat(ui): Both good/Both bad compare buttons + visibility + listeners"
```

---

## Task 10: E2E coverage

**Files:**
- Modify: `tests/e2e/compare-mode.test.js` (append a test)

- [ ] **Step 1: Check the E2E nav-key default**

Search `tests/e2e/keyboard-shortcuts.test.js` and `tests/e2e/navigation.test.js` for `KeyD` used as the next/forward navigation key. If any test presses `KeyD` to advance, update it to `KeyS` (the new default). Run `npm run test:e2e` after to confirm green.

Run: `npx playwright test tests/e2e/keyboard-shortcuts.test.js`
Expected: PASS (after any `KeyD`→`KeyS` nav updates).

- [ ] **Step 2: Write the E2E test**

Append to `tests/e2e/compare-mode.test.js` (follow the file's existing `launchApp`/`seedLocalStorage`/`loadFolder` helpers; use `{ force: true }` clicks per the overlay-interception convention). The test drives the bulk-rate path directly via `page.evaluate` on `window.mediaViewer` to avoid depending on ML training in the harness:

```javascript
test('Both good records a bulk rating, persists it, and undo clears it', async () => {
    await seedLocalStorage(page, { mlPredictionEnabled: 'true' });
    await loadFolder(page, tmpFixtures.dir);

    // Force AI-sorted compare state and a known pair, then bulk-rate.
    const result = await page.evaluate(async () => {
        const mv = window.mediaViewer;
        mv.isCompareMode = true;
        mv.isSortedByPrediction = true;
        mv.compareLeftFile = mv.mediaFiles[0];
        mv.compareRightFile = mv.mediaFiles[1];
        mv.getCombinedFeatures = () => [0.1, 0.2, 0.3];
        await mv.applyBulkRating('good');
        const inMemory = [...mv.bulkRated.entries()];
        const onDisk = await window.electronAPI.readBulkRatedFile(mv.baseFolderPath);
        return { inMemory, onDisk, historyLen: mv.moveHistory.length };
    });

    expect(result.inMemory).toHaveLength(2);
    expect(result.inMemory.every(([, bucket]) => bucket === 'good')).toBe(true);
    expect(result.onDisk.data.good).toHaveLength(2);
    expect(result.historyLen).toBe(1);

    // Undo clears the buckets and the on-disk record.
    const afterUndo = await page.evaluate(async () => {
        const mv = window.mediaViewer;
        await mv.handleCancel();
        const onDisk = await window.electronAPI.readBulkRatedFile(mv.baseFolderPath);
        return { size: mv.bulkRated.size, good: onDisk.data ? onDisk.data.good.length : 0 };
    });

    expect(afterUndo.size).toBe(0);
    expect(afterUndo.good).toBe(0);
});
```

- [ ] **Step 3: Run the E2E test**

Run: `npx playwright test tests/e2e/compare-mode.test.js`
Expected: PASS (new test green; existing compare-mode tests still pass).

- [ ] **Step 4: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS (all E2E green).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/compare-mode.test.js tests/e2e/keyboard-shortcuts.test.js tests/e2e/navigation.test.js
git commit -m "test(e2e): bulk-rate compare correction (record, persist, undo) + nav key update"
```

---

## Self-Review

**1. Spec coverage**
- §3 buttons + visibility → Task 9. ✓
- §3 shortcut layout (A/S/D/F, both modes `next`→`S`) → Task 8. ✓
- §4 in-memory `bulkRated` + `.bulk_rated.json` + IPC → Tasks 1, 2. ✓
- §4 hydration + stale-prune in `loadFolder` → Tasks 2, 3. ✓
- §5 action flow (train both, persist, history entry, toast, advance) → Task 4. ✓
- §6 undo → Task 5; cleanup purge → Task 6; rebuild survival → Task 7. ✓
- §7 no suppression → nothing added to pair-selection (deliberate); buttons treat files as regular. ✓
- §8 edge cases: null features (Task 4 test), missing compare file (Task 4 test), stale prune (Tasks 2, 7 tests). ✓
- §9 testing → unit Tasks 2,4,5,6,7,8 + E2E Task 10. ✓

**2. Placeholder scan:** No `TBD`/`TODO`/"add error handling"/"write tests for the above" — every code and test step contains complete code. ✓

**3. Type/name consistency:**
- History entry shape `{ bothGood, bothBad, bulkFiles: [{name, features}] }` — produced in Task 4, consumed identically in Task 5 (`undoBulkRating`). ✓
- `this.bulkRated` Map (filename→`'good'|'bad'`) — used consistently in Tasks 2,4,5,6,7. ✓
- Method names: `applyBulkRating`, `handleBothGood`, `handleBothBad`, `undoBulkRating`, `loadBulkRatedFile`, `saveBulkRatedFile`, `collectBulkRatedTrainingExamples`, `updateBulkRateButtonsVisibility` — referenced consistently across tasks and `executeAction`. ✓
- `updateMlModelWithFeatures(features, actionType)` and `reverseMlModelUpdate(features, actionType)` — both already exist in `media-viewer.js` with these signatures. ✓
- DOM ids `bulkRateControls` / `bothGoodBtn` / `bothBadBtn` — consistent between `index.html` (Task 9 Step 1) and the JS refs/visibility (Task 9 Steps 2,4). ✓

**Cross-cutting note:** Existing `removeFileFromList` unit tests already pass a mock ctx with the cache Maps; Task 6 Step 5 covers adding `bulkRated: new Map()` to any that lack it.

---

## Notes

- **Commit hygiene:** every commit runs the pre-commit hook (ESLint + Prettier on staged JS, then `npx vitest run`). Each task ends green, so commits pass the hook.
- **No live re-sort:** `applyBulkRating` calls `updateMlModelWithFeatures` (fire-and-forget worker update) and then `nextMedia()` — it does not re-score or re-sort the current list, by design (spec §2).
- **Visibility single-hook rationale:** `#bulkRateControls` lives inside `#compareControls`, which `switchToSingleModeUI()` hides wholesale; the only in-compare condition to toggle is `isSortedByPrediction`, handled by the `showCompareMedia` hook (which also re-runs when AI sort is toggled off via `showMedia`).
