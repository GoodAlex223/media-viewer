# Group CW-1: Renderer Correctness Guards — Implementation Plan

**Status: Complete** — shipped 2026-06-14 on branch `cleanup/cw-1-renderer-correctness-guards`; all 7 fixes implemented via subagent-driven development (10 tasks), 310 → **326 unit tests**, lint clean, E2E 42/43 (known pre-existing `#viewModeBtn` failure owned by Group CW-2). Final whole-branch review: "Ready to merge: Yes". See [DONE.md](../../planning/DONE.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land seven independent defensive renderer fixes (accumulated from PR reviews #34–#45) as one branch / one PR.

**Architecture:** Each fix is a small, isolated change to `media-viewer.js`, `main.js`, or `jxl-decode-worker.js`. Most are unit-tested via the project's `extractMethod`/`extractAsyncMethod` source-extraction harness in `tests/media-viewer-utils.test.js`. Two items (the main-process IPC handler and the worker init branch) live outside the unit harness and are verified by lint + a reasoned trace plus a renderer-side routing test.

**Tech Stack:** Electron renderer (vanilla ES module class), Vitest unit tests, ESLint/Prettier, Husky pre-commit (ESLint --fix + Prettier + `vitest run`).

**Spec:** `docs/superpowers/specs/2026-06-13-cw-1-renderer-correctness-guards-design.md`

**Baseline:** 310 unit tests green on `main` (`4eca99a`). Branch already created: `cleanup/cw-1-renderer-correctness-guards`.

**Conventions:**
- Run a single test file with: `npx vitest run tests/media-viewer-utils.test.js`
- Run one describe/test by name: `npx vitest run tests/media-viewer-utils.test.js -t "name fragment"`
- Full unit suite: `npm test`
- Lint: `npm run lint`
- All new tests go in `tests/media-viewer-utils.test.js` unless stated otherwise.
- Commit messages: conventional-commit style; end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

## Task 1: Fix 1 — clear `clipCache` in `loadFolder()`

`loadFolder()` is a large coupled async method not runnable in the unit harness, so this fix uses a **source-structure regression test**: it asserts that `clipCache.clear()` lives in the same cache-reset block as the other four caches. This locks in the specific regression (clipCache being omitted) without needing to execute `loadFolder`.

**Files:**
- Modify: `media-viewer.js:2706-2709` (cache-reset block in `loadFolder`)
- Test: `tests/media-viewer-utils.test.js` (new describe near the other source-structure tests)

- [x] **Step 1: Write the failing test**

Add this describe block to `tests/media-viewer-utils.test.js` (the `source` constant is already defined at the top of the file):

```javascript
describe('loadFolder cache reset (Fix 1)', () => {
    it('clears clipCache alongside the other per-folder caches', () => {
        // Slice the loadFolder reset block. Anchor the start INSIDE loadFolder — a
        // folder-watch callback earlier in the file also calls perceptualHashes.clear(),
        // and a bare indexOf would match that first and slice an ~820-line window.
        const start = source.indexOf('this.perceptualHashes.clear();', source.indexOf('async loadFolder('));
        const end = source.indexOf('this.cancelBackgroundExtraction();', start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const block = source.slice(start, end);
        for (const cache of [
            'this.perceptualHashes.clear();',
            'this.featureCache.clear();',
            'this.featureMetadata.clear();',
            'this.predictionScores.clear();',
            'this.clipCache.clear();',
        ]) {
            expect(block).toContain(cache);
        }
    });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "clears clipCache alongside"`
Expected: FAIL — `block` does not contain `this.clipCache.clear();`.

- [x] **Step 3: Add the clear call**

In `media-viewer.js`, change the block at lines 2706-2709 from:

```javascript
            this.perceptualHashes.clear();
            this.featureCache.clear();
            this.featureMetadata.clear();
            this.predictionScores.clear();
```

to:

```javascript
            this.perceptualHashes.clear();
            this.featureCache.clear();
            this.clipCache.clear();
            this.featureMetadata.clear();
            this.predictionScores.clear();
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "clears clipCache alongside"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(renderer): clear clipCache on folder switch

loadFolder() reset block omitted clipCache, leaking stale 512-dim CLIP
vectors across folders that share path-identical filenames. BACKLOG PR #34
(2026-05-10).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Fix 2 — `isLoading` guard on `handleTournamentDraw` + `handleTournamentPick`

**Files:**
- Modify: `media-viewer.js:4649-4654` (`handleTournamentPick`), `media-viewer.js:4656-4669` (`handleTournamentDraw`)
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write the failing tests**

Add to `tests/media-viewer-utils.test.js`:

```javascript
describe('tournament isLoading guards (Fix 2)', () => {
    const handleTournamentDraw = extractAsyncMethod('handleTournamentDraw');
    const handleTournamentPick = extractAsyncMethod('handleTournamentPick');

    function makeCtx(overrides = {}) {
        return {
            isTournamentMode: true,
            isLoading: false,
            showRatingConfirmations: false,
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            showTournamentPair: vi.fn(async () => {}),
            tournament: {
                engine: { getCurrentPair: () => ({ left: 'L', right: 'R' }) },
                handlePairDraw: vi.fn(async () => {}),
                handlePairResult: vi.fn(async () => {}),
            },
            ...overrides,
        };
    }

    it('handleTournamentDraw no-ops while isLoading', async () => {
        const ctx = makeCtx({ isLoading: true });
        await handleTournamentDraw.call(ctx, 'win');
        expect(ctx.tournament.handlePairDraw).not.toHaveBeenCalled();
        expect(ctx.signalUserActivity).not.toHaveBeenCalled();
    });

    it('handleTournamentDraw records the draw when not loading', async () => {
        const ctx = makeCtx();
        await handleTournamentDraw.call(ctx, 'win');
        expect(ctx.tournament.handlePairDraw).toHaveBeenCalledWith('L', 'R', 'win');
        expect(ctx.showTournamentPair).toHaveBeenCalledTimes(1);
    });

    it('handleTournamentPick no-ops while isLoading', async () => {
        const ctx = makeCtx({ isLoading: true });
        await handleTournamentPick.call(ctx, 'L', 'R');
        expect(ctx.tournament.handlePairResult).not.toHaveBeenCalled();
    });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "tournament isLoading guards"`
Expected: FAIL — the two "no-ops while isLoading" tests fail because `handlePairDraw`/`handlePairResult` are still called.

- [x] **Step 3: Add the guards**

In `media-viewer.js`, change `handleTournamentPick` (starts line 4649) from:

```javascript
    async handleTournamentPick(winner, loser) {
        if (!this.isTournamentMode) return;
        this.signalUserActivity();
        await this.tournament.handlePairResult(winner, loser);
        await this.showTournamentPair();
    }
```

to:

```javascript
    async handleTournamentPick(winner, loser) {
        if (!this.isTournamentMode || this.isLoading) return;
        this.signalUserActivity();
        try {
            await this.tournament.handlePairResult(winner, loser);
        } catch (err) {
            window.electronAPI.logError('Tournament pick failed: ' + (err && err.message ? err.message : err));
        }
        await this.showTournamentPair();
    }
```

Change `handleTournamentDraw` (starts line 4656) from:

```javascript
    async handleTournamentDraw(outcome) {
        if (!this.isTournamentMode || !this.tournament.engine) return;
        this.signalUserActivity();
        const pair = this.tournament.engine.getCurrentPair();
        if (!pair) return;
        await this.tournament.handlePairDraw(pair.left, pair.right, outcome);
```

to:

```javascript
    async handleTournamentDraw(outcome) {
        if (!this.isTournamentMode || this.isLoading || !this.tournament.engine) return;
        this.signalUserActivity();
        const pair = this.tournament.engine.getCurrentPair();
        if (!pair) return;
        try {
            await this.tournament.handlePairDraw(pair.left, pair.right, outcome);
        } catch (err) {
            window.electronAPI.logError('Tournament draw failed: ' + (err && err.message ? err.message : err));
        }
```

(The rest of `handleTournamentDraw` — the notification + `showTournamentPair()` — is unchanged.)

> Note: the try/catch references `window.electronAPI.logError`. The Fix 2 tests do not set `globalThis.window`, but they never enter the catch (the happy-path test's `handlePairDraw` resolves), so no window access occurs. Do not add a window mock here.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "tournament isLoading guards"`
Expected: PASS (3 tests)

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(tournament): guard draw/pick handlers on isLoading

Button double-click mid-showTournamentPair() fired a second
recordDraw/recordResult after roundQueue shifted -> unhandled
'No active pair to record'. Add isLoading guard + try/catch on both
button-reachable handlers (keyboard path was already gated). BACKLOG
PR #41 (2026-06-04).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Fix 3 — `<2 files` fallback exits tournament mode (both sites)

**Files:**
- Modify: `media-viewer.js:3034-3035` (`_retryCompareAfterRemoval`), `media-viewer.js:3064-3065` (`showCompareMedia`)
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write the failing tests**

Add to `tests/media-viewer-utils.test.js`:

```javascript
describe('<2-files fallback exits tournament mode (Fix 3)', () => {
    const retryCompareAfterRemoval = extractAsyncMethod('_retryCompareAfterRemoval');
    const showCompareMedia = extractAsyncMethod('showCompareMedia');

    function baseCtx(overrides = {}) {
        return {
            isTournamentMode: true,
            mediaFiles: [{ path: '/a.png' }], // length 1 -> triggers the <2 branch
            moveHistory: [],
            leftMedia: null,
            rightMedia: null,
            currentIndex: 0,
            exitTournamentMode: vi.fn(),
            switchToSingleModeUI: vi.fn(),
            showNotification: vi.fn(),
            showMedia: vi.fn(async () => {}),
            showEmptyStateWithUndo: vi.fn(),
            showDropZone: vi.fn(),
            cleanupCompareMedia: vi.fn(async () => {}),
            ...overrides,
        };
    }

    it('_retryCompareAfterRemoval exits tournament before switching to single', async () => {
        const ctx = baseCtx();
        await retryCompareAfterRemoval.call(ctx, 0);
        expect(ctx.exitTournamentMode).toHaveBeenCalledTimes(1);
        expect(ctx.switchToSingleModeUI).toHaveBeenCalledTimes(1);
    });

    it('showCompareMedia <2 branch exits tournament before switching to single', async () => {
        const ctx = baseCtx();
        await showCompareMedia.call(ctx, 0);
        expect(ctx.exitTournamentMode).toHaveBeenCalledTimes(1);
        expect(ctx.switchToSingleModeUI).toHaveBeenCalledTimes(1);
    });

    it('does not call exitTournamentMode when not in tournament mode', async () => {
        const ctx = baseCtx({ isTournamentMode: false });
        await retryCompareAfterRemoval.call(ctx, 0);
        expect(ctx.exitTournamentMode).not.toHaveBeenCalled();
        expect(ctx.switchToSingleModeUI).toHaveBeenCalledTimes(1);
    });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "fallback exits tournament mode"`
Expected: FAIL — the two "exits tournament" tests fail (`exitTournamentMode` not called).

- [x] **Step 3: Add the guard at both sites**

In `media-viewer.js`, in `_retryCompareAfterRemoval`, change:

```javascript
        if (this.mediaFiles.length < 2) {
            this.switchToSingleModeUI();
```

to:

```javascript
        if (this.mediaFiles.length < 2) {
            if (this.isTournamentMode) this.exitTournamentMode();
            this.switchToSingleModeUI();
```

In `showCompareMedia`, change (the block around line 3064):

```javascript
            // switchToSingleModeUI() tears down the stale compare wrappers.
            this.switchToSingleModeUI();
```

to:

```javascript
            // switchToSingleModeUI() tears down the stale compare wrappers.
            if (this.isTournamentMode) this.exitTournamentMode();
            this.switchToSingleModeUI();
```

> There are two `switchToSingleModeUI()` calls inside `showCompareMedia`'s `<2` block region; the one to edit is the one immediately preceded by the `// switchToSingleModeUI() tears down the stale compare wrappers.` comment (line 3064). Use that comment to disambiguate.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "fallback exits tournament mode"`
Expected: PASS (3 tests)

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(tournament): exit tournament mode on <2-files compare fallback

Both showCompareMedia and _retryCompareAfterRemoval dropped to single-mode
UI via switchToSingleModeUI() but left isTournamentMode=true, so the
tournament keymap + overlay stayed live over single-mode UI. BACKLOG PR #38
(2026-05-28).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Fix 4 — `handleCancel` entry-type guard + null media refs + fixture retag

**Files:**
- Modify: `media-viewer.js:4023` (compare-pair branch condition), `media-viewer.js:4222-4229` (`switchToSingleModeUI` teardown loop)
- Test: `tests/media-viewer-utils.test.js` — retag existing fixtures (lines ~938-957) + add a new regression test

- [x] **Step 1: Retag the existing compare-pair fixture + add the failing regression test**

First, in `tests/media-viewer-utils.test.js`, in the existing test `'compare-mode pair-undo restores caches for both files'` (~line 935), add `compareMode: true` to **both** history entries so they still reach the (now guarded) compare-pair branch. Change the two entries in its `moveHistory` from objects ending with `mlFeatures: Array.from(make576()),` / `mlFeatures: Array.from(make64()),` to include the flag:

```javascript
                {
                    fileName: 'a.png',
                    originalPath: '/folder/a.png',
                    newPath: '/folder/like/a.png',
                    fileSize: 100,
                    fileType: 'image/png',
                    actionType: 'like',
                    compareMode: true,
                    mlFeatures: Array.from(make576()),
                },
                {
                    fileName: 'b.png',
                    originalPath: '/folder/b.png',
                    newPath: '/folder/dislike/b.png',
                    fileSize: 200,
                    fileType: 'image/png',
                    actionType: 'dislike',
                    compareMode: true,
                    mlFeatures: Array.from(make64()),
                },
```

Then add a new regression test inside the same `describe('handleCancel feature restore', ...)` block (it reuses that block's `commonMocks`/`mockElectronAPI` and `handleCancel`):

```javascript
    it('does NOT take the compare-pair branch when the last move lacks compareMode (leftover single move)', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            moveHistory: [
                // An older compare-pair entry (compareMode set)…
                {
                    fileName: 'old.png',
                    originalPath: '/folder/old.png',
                    newPath: '/folder/like/old.png',
                    fileSize: 50,
                    fileType: 'image/png',
                    actionType: 'like',
                    compareMode: true,
                    mlFeatures: Array.from(make64()),
                },
                // …and a leftover SINGLE-mode move on top (no compareMode flag).
                {
                    fileName: 'single.png',
                    originalPath: '/folder/single.png',
                    newPath: '/folder/dislike/single.png',
                    fileSize: 60,
                    fileType: 'image/png',
                    actionType: 'dislike',
                    mlFeatures: Array.from(make64()),
                },
            ],
        });

        await handleCancel.call(ctx);

        // The single-move (non-compare) branch pops exactly ONE entry, leaving the
        // older compare-pair entry intact. The pre-fix two-entry pop would have
        // drained the history to length 0 and restored 'old.png'.
        expect(ctx.moveHistory.length).toBe(1);
        expect(ctx.moveHistory[0].fileName).toBe('old.png');
        expect(ctx.featureCache.has('/folder/old.png')).toBe(false);
        expect(ctx.featureCache.has('/folder/single.png')).toBe(true);
    });
```

> The new test relies on the single-move undo branch (`handleCancel`'s final `else`) restoring exactly one file. If that branch's exact restore assertions differ in the current source, keep the two structural assertions that matter: `ctx.moveHistory.length === 1` and `ctx.moveHistory[0].fileName === 'old.png'`.

- [x] **Step 2: Run tests to verify the new one fails (and retagged one still passes)**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "handleCancel feature restore"`
Expected: the retagged `'compare-mode pair-undo…'` test PASSES (still hits the branch — flag present); the new `'does NOT take the compare-pair branch…'` test FAILS (pre-fix, the `isCompareMode && moveHistory.length >= 2` branch pops two entries → `moveHistory.length === 0`).

- [x] **Step 3: Add the guard + null the media refs**

In `media-viewer.js`, change the compare-pair branch condition at line 4023 from:

```javascript
        } else if (this.isCompareMode && this.moveHistory.length >= 2) {
```

to:

```javascript
        } else if (this.isCompareMode && lastMove.compareMode && this.moveHistory.length >= 2) {
```

In `switchToSingleModeUI`, change the teardown loop (lines 4222-4229) from:

```javascript
        for (const key of ['leftMediaWrapper', 'rightMediaWrapper']) {
            const wrapper = this[key];
            if (wrapper) {
                this.fullscreen.cleanup(wrapper);
                wrapper.remove();
                this[key] = null;
            }
        }
```

to:

```javascript
        for (const key of ['leftMediaWrapper', 'rightMediaWrapper']) {
            const wrapper = this[key];
            if (wrapper) {
                this.fullscreen.cleanup(wrapper);
                wrapper.remove();
                this[key] = null;
            }
        }
        // The media element refs are owned by the (now-removed) wrappers; null them
        // too so stale compare elements can't be reused after exit-to-single.
        this.leftMedia = null;
        this.rightMedia = null;
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "handleCancel feature restore"`
Expected: PASS (all tests in the block, including the new regression test)

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(compare): guard pair-undo branch on lastMove.compareMode + null media refs

handleCancel's compare-pair branch fired for any isCompareMode &&
moveHistory>=2, popping two unrelated entries when the last move was a
leftover single-mode move. Gate on lastMove.compareMode (moveComparePair
sets it; moveCurrentFile does not). Also null leftMedia/rightMedia in
switchToSingleModeUI teardown. Retag the existing compare-pair fixtures
with compareMode:true. BACKLOG PR #40 (2026-06-02) + Group B impl-review
(2026-06-09) + PR #35 (2026-05-16).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Fix 5 — `clipWorkerReady` reset on unload + await/error-handle + riders

Extract the timer callback into a named `_handleClipUnloadTimer()` method so it is unit-testable; hoist a `CLIP_UNLOAD_DELAY_MS` constant (referenced only at the call site, never inside the extracted method, so `extractAsyncMethod` stays clean).

**Files:**
- Modify: `media-viewer.js` — add top-level `const CLIP_UNLOAD_DELAY_MS = 30000;` (after `ACTION_LABELS`, ~line 38), add `_handleClipUnloadTimer()` method, rewrite the `setTimeout` block at `media-viewer.js:8701-8706`
- Test: `tests/media-viewer-utils.test.js`

- [x] **Step 1: Write the failing tests**

Add to `tests/media-viewer-utils.test.js`:

```javascript
describe('CLIP unload timer callback (Fix 5)', () => {
    const handleClipUnloadTimer = extractAsyncMethod('_handleClipUnloadTimer');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function makeCtx(overrides = {}) {
        return {
            enableClipFeatures: true,
            clipWorkerReady: true,
            clipUnloadTimer: 123,
            ...overrides,
        };
    }

    it('resets clipWorkerReady on a successful unload', async () => {
        globalThis.window = { electronAPI: { unloadClipModel: vi.fn(async () => ({ success: true })), logError: vi.fn() } };
        const ctx = makeCtx();
        await handleClipUnloadTimer.call(ctx);
        expect(window.electronAPI.unloadClipModel).toHaveBeenCalledTimes(1);
        expect(ctx.clipWorkerReady).toBe(false);
        expect(ctx.clipUnloadTimer).toBe(null);
    });

    it('keeps clipWorkerReady true when the IPC reports loading', async () => {
        globalThis.window = {
            electronAPI: { unloadClipModel: vi.fn(async () => ({ success: false, reason: 'loading' })), logError: vi.fn() },
        };
        const ctx = makeCtx();
        await handleClipUnloadTimer.call(ctx);
        expect(ctx.clipWorkerReady).toBe(true);
    });

    it('skips the unload when CLIP was disabled during the grace window', async () => {
        globalThis.window = { electronAPI: { unloadClipModel: vi.fn(), logError: vi.fn() } };
        const ctx = makeCtx({ enableClipFeatures: false });
        await handleClipUnloadTimer.call(ctx);
        expect(window.electronAPI.unloadClipModel).not.toHaveBeenCalled();
        expect(ctx.clipUnloadTimer).toBe(null);
    });

    it('logs and does not throw when the unload IPC rejects', async () => {
        globalThis.window = {
            electronAPI: { unloadClipModel: vi.fn(async () => { throw new Error('ipc boom'); }), logError: vi.fn() },
        };
        const ctx = makeCtx();
        await handleClipUnloadTimer.call(ctx);
        expect(window.electronAPI.logError).toHaveBeenCalled();
        expect(ctx.clipWorkerReady).toBe(true); // not reset on failure
    });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "CLIP unload timer callback"`
Expected: FAIL — `extractAsyncMethod('_handleClipUnloadTimer')` throws `Could not find async method: _handleClipUnloadTimer` (method does not exist yet).

- [x] **Step 3: Add the constant + method, rewrite the timer block**

In `media-viewer.js`, after the `ACTION_LABELS` const block (around line 38, before `class MediaViewer`), add:

```javascript
const CLIP_UNLOAD_DELAY_MS = 30000; // grace period before unloading the CLIP model after extraction
```

Add the new method (place it directly after `startBackgroundFeatureExtraction`, near line 8707, i.e. after that method's closing brace):

```javascript
    // Timer callback: unload the CLIP model after the idle grace window. Re-checks
    // enableClipFeatures at fire time (toggle-off during the window cancels the unload),
    // awaits the IPC + handles errors, and only resets clipWorkerReady on a SUCCESSFUL
    // unload — the IPC returns { success:false, reason:'loading' } when a load is in
    // flight, in which case the model stays resident and the flag must stay true.
    async _handleClipUnloadTimer() {
        this.clipUnloadTimer = null;
        if (!this.enableClipFeatures) return;
        try {
            const result = await window.electronAPI.unloadClipModel();
            if (result && result.success) {
                this.clipWorkerReady = false;
            }
        } catch (err) {
            window.electronAPI.logError('CLIP model unload failed: ' + (err && err.message ? err.message : err));
        }
    }
```

Rewrite the `setTimeout` block at lines 8701-8706 from:

```javascript
        if (this.enableClipFeatures) {
            this.clipUnloadTimer = setTimeout(() => {
                window.electronAPI.unloadClipModel();
                this.clipUnloadTimer = null;
            }, 30000);
        }
```

to:

```javascript
        if (this.enableClipFeatures) {
            this.clipUnloadTimer = setTimeout(() => this._handleClipUnloadTimer(), CLIP_UNLOAD_DELAY_MS);
        }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "CLIP unload timer callback"`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(clip): reset clipWorkerReady on unload + await/error-handle timer

Extract the CLIP-unload timer callback into _handleClipUnloadTimer():
await the IPC, log on failure, re-check enableClipFeatures at fire time,
and reset clipWorkerReady only on a successful unload (stale-true flag made
toggle-on-after-unload skip the eager initClipModel). Hoist
CLIP_UNLOAD_DELAY_MS constant. Closes BACKLOG PR #45 (2026-06-10),
PR #31 (2026-04-28), PR #21 (2026-04-21).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Fix 6 — local-capture pattern in `feature-cache-write-chunk` IPC handler

Main-process IPC handlers are outside the Vitest harness; this fix is verified by lint + a reasoned trace against the established `feature-cache-write-close` pattern (which already captures a local `const writer`).

**Files:**
- Modify: `main.js:506-525`

- [x] **Step 1: Apply the local-capture rewrite**

In `main.js`, change the handler (lines 506-525) from:

```javascript
    ipcMain.handle('feature-cache-write-chunk', async (_event, entries) => {
        if (!featureCacheWriter) return { success: false, error: 'no open writer' };
        try {
            let buf = '';
            for (const [key, value] of entries) {
                buf += (featureCacheWriter.first ? '' : ',') + JSON.stringify(key) + ':' + JSON.stringify(value);
                featureCacheWriter.first = false;
            }
            if (buf) {
                // Respect backpressure so a slow disk can't balloon the write buffer.
                const ok = featureCacheWriter.stream.write(buf);
                if (!ok) {
                    await new Promise((resolve) => featureCacheWriter.stream.once('drain', resolve));
                }
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
```

to:

```javascript
    ipcMain.handle('feature-cache-write-chunk', async (_event, entries) => {
        // Capture the module-level writer into a local so a concurrent
        // feature-cache-write-open swapping/destroying it during the 'drain'
        // await cannot make us operate on stale state (documented required
        // pattern for long-running IPC handlers; mirrors the close handler).
        const writer = featureCacheWriter;
        if (!writer) return { success: false, error: 'no open writer' };
        try {
            let buf = '';
            for (const [key, value] of entries) {
                buf += (writer.first ? '' : ',') + JSON.stringify(key) + ':' + JSON.stringify(value);
                writer.first = false;
            }
            if (buf) {
                // Respect backpressure so a slow disk can't balloon the write buffer.
                const ok = writer.stream.write(buf);
                if (!ok) {
                    await new Promise((resolve) => writer.stream.once('drain', resolve));
                }
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
```

- [x] **Step 2: Lint + verify the trace**

Run: `npm run lint`
Expected: clean (no errors). Confirm by reading the diff that every former `featureCacheWriter.*` reference inside the handler now reads `writer.*`, and the close handler at `main.js:528` is unchanged (it already used this pattern).

- [x] **Step 3: Commit**

```bash
git add main.js
git commit -m "fix(main): local-capture writer in feature-cache-write-chunk

Captured featureCacheWriter into a local const before the 'drain' await so
a concurrent write-open swapping/destroying it cannot make the handler
operate on stale module-level state. Matches the close handler + the
documented CLIP-IPC local-capture pattern. BACKLOG PR #38 (2026-05-28).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Fix 7a — `decodeJxl` per-request frame-0 timeout

Wrap the resolve/reject passed into the `_jxlPending` record so they `clearTimeout`; the timer rejects + deletes the pending entry if frame 0 never arrives. `_handleJxlWorkerMessage` is unchanged.

**Files:**
- Modify: `media-viewer.js:1015-1024` (the frame-0 `await new Promise(...)` in `decodeJxl`)
- Test: `tests/media-viewer-utils.test.js` — add a test to the existing `describe('decodeJxl', ...)` block

- [x] **Step 1: Write the failing test**

Add this test inside the existing `describe('decodeJxl', ...)` block in `tests/media-viewer-utils.test.js` (it reuses that block's `decodeJxl`, `makeJxlCtx`, and `window.electronAPI.readFileBuffer` mock from `beforeEach`):

```javascript
    it('rejects after 15s and deletes the pending entry if frame 0 never arrives', async () => {
        vi.useFakeTimers();
        try {
            // Worker that accepts the decode message but never streams a reply.
            const silentWorker = { addEventListener: () => {}, postMessage: vi.fn() };
            const ctx = makeJxlCtx(silentWorker);
            const p = decodeJxl.call(ctx, 'hang.jxl');
            const assertion = expect(p).rejects.toThrow('JXL decode timeout');
            // Flush the pre-timer awaits (ensureJxlWorker + readFileBuffer), then trip the timeout.
            await vi.advanceTimersByTimeAsync(15000);
            await assertion;
            expect(ctx._jxlPending.size).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "rejects after 15s"`
Expected: FAIL — without a timeout the promise never settles; the test times out / does not reject with `'JXL decode timeout'`.

- [x] **Step 3: Add the timeout**

In `media-viewer.js`, change the `decodeJxl` frame-0 promise (lines 1015-1024) from:

```javascript
        const entry = await new Promise((resolve, reject) => {
            this._jxlPending.set(id, {
                entry: null,
                resolveFirst: resolve,
                rejectFirst: reject,
                resolveComplete: null,
                rejectComplete: null,
            });
            this.jxlWorker.postMessage({ type: 'decode', id, buffer }, [buffer]);
        });
```

to:

```javascript
        const entry = await new Promise((resolve, reject) => {
            // Guard the frame-0 wait: if the worker never streams a first frame (hang),
            // reject + drop the pending entry rather than wait forever. Mirrors
            // loadMediaAsImageData's 15s pattern. whenComplete (later frames) stays
            // unbounded — a stall there merely leaves frame 0 displayed static.
            const timer = setTimeout(() => {
                this._jxlPending.delete(id);
                reject(new Error('JXL decode timeout'));
            }, 15000);
            this._jxlPending.set(id, {
                entry: null,
                resolveFirst: (val) => {
                    clearTimeout(timer);
                    resolve(val);
                },
                rejectFirst: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
                resolveComplete: null,
                rejectComplete: null,
            });
            this.jxlWorker.postMessage({ type: 'decode', id, buffer }, [buffer]);
        });
```

- [x] **Step 4: Run test to verify it passes (and the whole decodeJxl block stays green)**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "decodeJxl"`
Expected: PASS (all decodeJxl tests, including the new timeout test and the existing streaming tests — the wrapped resolve/reject must not break them).

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(jxl): 15s frame-0 timeout in decodeJxl

The frame-0 await had no timeout — a worker that never streams frame 0 hung
decodeJxl forever. Wrap resolveFirst/rejectFirst to clear a 15s timer that
rejects + deletes the pending entry on hang (mirrors loadMediaAsImageData).
BACKLOG Group A impl-review + PR #42 (2026-06-07).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Fix 7b — worker `{type:'init'}` try/catch → `{type:'init-error'}` + renderer routing

**Files:**
- Modify: `jxl-decode-worker.js:14-21` (init branch)
- Modify: `media-viewer.js:933-939` (`_handleJxlWorkerMessage` — handle `init-error`)
- Test: `tests/media-viewer-utils.test.js` — add a test to the existing `describe('_handleJxlWorkerMessage', ...)` block (renderer side; the worker change is verified by the JXL E2E smoke + reasoned trace)

- [x] **Step 1: Write the failing test (renderer routing)**

Add this test inside the existing `describe('_handleJxlWorkerMessage', ...)` block in `tests/media-viewer-utils.test.js`:

```javascript
    it('init-error rejects the _jxlReady init promise and nulls the resolver refs', () => {
        const rejectReady = vi.fn();
        const ctx = {
            _jxlPending: new Map(),
            _rejectJxlPending: rejectPending,
            _jxlResolveReady: vi.fn(),
            _jxlRejectReady: rejectReady,
        };
        handle.call(ctx, { type: 'init-error', message: 'wasm load failed' });
        expect(rejectReady).toHaveBeenCalledTimes(1);
        expect(rejectReady.mock.calls[0][0].message).toBe('wasm load failed');
        expect(ctx._jxlRejectReady).toBe(null);
        expect(ctx._jxlResolveReady).toBe(null);
    });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "init-error rejects"`
Expected: FAIL — `_handleJxlWorkerMessage` does not handle `init-error`; `_jxlRejectReady` is never called and the refs stay as the original mocks.

- [x] **Step 3: Handle `init-error` in the renderer router**

In `media-viewer.js`, in `_handleJxlWorkerMessage`, immediately after the `if (m.type === 'ready') { ... }` block (after line 939, before `const pending = this._jxlPending.get(m.id);`), add:

```javascript
        if (m.type === 'init-error') {
            if (this._jxlRejectReady) this._jxlRejectReady(new Error(m.message));
            this._jxlResolveReady = null; // init settled (failed) — drop the resolver refs
            this._jxlRejectReady = null;
            return;
        }
```

- [x] **Step 4: Wrap the worker init branch**

In `jxl-decode-worker.js`, change the init branch (lines 16-21) from:

```javascript
    if (msg.type === 'init') {
        ready = init({ module_or_path: new Uint8Array(msg.wasmBytes) });
        await ready;
        self.postMessage({ type: 'ready' });
        return;
    }
```

to:

```javascript
    if (msg.type === 'init') {
        try {
            ready = init({ module_or_path: new Uint8Array(msg.wasmBytes) });
            await ready;
            self.postMessage({ type: 'ready' });
        } catch (err) {
            ready = null; // allow a later re-init attempt
            self.postMessage({ type: 'init-error', message: String(err && err.message ? err.message : err) });
        }
        return;
    }
```

- [x] **Step 5: Run test + lint to verify**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "_handleJxlWorkerMessage"`
Expected: PASS (all `_handleJxlWorkerMessage` tests including the new one).

Run: `npm run lint`
Expected: clean (the worker file is in ESLint block `3a-jxl`).

- [x] **Step 6: Commit**

```bash
git add media-viewer.js jxl-decode-worker.js tests/media-viewer-utils.test.js
git commit -m "fix(jxl): structured init-error so bad wasm doesn't hang ensureJxlWorker

Wrap the worker {type:'init'} branch in try/catch and post
{type:'init-error', message} on failure; route it in _handleJxlWorkerMessage
to reject _jxlReady (was: uncaught async rejection -> renderer waits forever
for a 'ready' that never comes). BACKLOG Group A impl-review + PR #42
(2026-06-07).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Fix 7c — whole-animation-undecodable bail toast

**Files:**
- Modify: `media-viewer.js:1127` (the `consecutiveFailures >= decoded.frames.length` bail in `drawNext`)
- Test: `tests/media-viewer-utils.test.js` — add `showNotification` to the `startJxlAnimation` describe's `makeCtx` + a new test

- [x] **Step 1: Add `showNotification` to the describe's makeCtx + write the failing test**

In `tests/media-viewer-utils.test.js`, in `describe('startJxlAnimation frame-0-first', ...)`, add `showNotification: vi.fn()` to the `makeCtx()` return object (alongside `computeJxlFrameSchedule`):

```javascript
    function makeCtx() {
        return {
            _jxlAnimToken: null,
            _jxlAnimTimer: null,
            currentMedia: null,
            showNotification: vi.fn(),
            computeJxlFrameSchedule: (frames) => frames.map(() => 20),
        };
    }
```

Then add this test inside the same describe block:

```javascript
    it('toasts once when the entire animation is undecodable', async () => {
        const ctx = makeCtx();
        // Every frame fails to decode -> consecutiveFailures reaches frames.length -> bail.
        globalThis.createImageBitmap = vi.fn(async () => {
            throw new Error('decode fail');
        });
        const decoded = {
            frames: [frame(0), frame(1)],
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 2,
            complete: true,
            whenComplete: Promise.resolve(),
        };
        decoded.whenComplete = Promise.resolve(decoded);
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(ctx.showNotification).toHaveBeenCalledTimes(1));
        expect(ctx.showNotification.mock.calls[0][0]).toMatch(/first frame/i);
        ctx._jxlAnimToken = null; // teardown
    });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "toasts once when the entire animation"`
Expected: FAIL — the bail currently returns silently; `showNotification` is never called.

- [x] **Step 3: Add the toast at the bail**

In `media-viewer.js`, change the bail in `drawNext` (line 1127) from:

```javascript
                    consecutiveFailures++;
                    if (consecutiveFailures >= decoded.frames.length) return; // whole animation undecodable
```

to:

```javascript
                    consecutiveFailures++;
                    if (consecutiveFailures >= decoded.frames.length) {
                        // Whole animation undecodable — surface it instead of freezing silently.
                        // drawNext is not re-scheduled after this return, so it fires at most once.
                        this.showNotification('Could not play animation — showing first frame', 'warning');
                        return;
                    }
```

- [x] **Step 4: Run test to verify it passes (and the startJxlAnimation block stays green)**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "startJxlAnimation frame-0-first"`
Expected: PASS (all tests in the block, including the new bail-toast test).

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(jxl): toast when an entire animation is undecodable

The drawNext bail (consecutiveFailures >= frames.length) returned silently,
leaving a frozen frame 0 with no explanation. Fire a one-time warning toast.
BACKLOG Group A impl-review + PR #42 (2026-06-07).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Full verification + spec/docs indexing

**Files:**
- Modify: `docs/README.md` (index the design spec under Design Specs)

- [x] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS. Baseline was 310; this plan adds ~14 tests (Task 1: 1, Task 2: 3, Task 3: 3, Task 4: 1 new, Task 5: 4, Task 7a: 1, Task 7b: 1, Task 7c: 1). Expected ~324 passing, 0 failing.

- [x] **Step 2: Run lint**

Run: `npm run lint`
Expected: clean.

- [x] **Step 3: Index the design spec in docs/README.md**

Open `docs/README.md`, find the Design Specs section/table, and add a row for `docs/superpowers/specs/2026-06-13-cw-1-renderer-correctness-guards-design.md` (match the existing row format used by the most recent spec entry). If the exact column layout is unclear, mirror the previous spec row verbatim and substitute the CW-1 title/date/path.

- [x] **Step 4: Commit**

```bash
git add docs/README.md
git commit -m "docs(readme): index CW-1 renderer correctness guards design spec

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [x] **Step 5: (Closeout, performed by the controller after all tasks)**

Leave the branch ready for the `superpowers:finishing-a-development-branch` flow: push, open PR, then the project closeout (EXTRACT improvements → BACKLOG, check off the seven constituent BACKLOG entries cited in the spec, archive this plan + flip checkboxes + add `Status: Complete`, transition WEEKLY Group CW-1, update memory). E2E is unaffected by these changes; the suite remains at its known 42/43 state (the `#viewModeBtn` red belongs to CW-2, not CW-1).

---

## Self-Review

**Spec coverage:**
- Fix 1 (clipCache clear) → Task 1 ✅
- Fix 2 (tournament isLoading guards) → Task 2 ✅
- Fix 3 (<2-files exitTournamentMode, both sites) → Task 3 ✅
- Fix 4 (handleCancel guard + null refs + fixture retag) → Task 4 ✅
- Fix 5 (clipWorkerReady reset + await + riders: constant + enableClipFeatures re-check) → Task 5 ✅
- Fix 6 (feature-cache-write-chunk local capture) → Task 6 ✅
- Fix 7a (decodeJxl timeout) → Task 7 ✅
- Fix 7b (worker init-error + renderer routing) → Task 8 ✅
- Fix 7c (bail toast) → Task 9 ✅
- Out-of-scope items (no fallback refactor, no whenComplete timeout, no 372ea10 test backfill) honored — none added.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full code.

**Type/name consistency:** `_handleClipUnloadTimer` (Task 5) and `CLIP_UNLOAD_DELAY_MS` (Task 5) named identically in impl + test. `_handleJxlWorkerMessage` `init-error` handling (Task 8) uses `_jxlRejectReady`/`_jxlResolveReady`/`_jxlPending` matching the existing source. `compareMode` flag (Task 4) matches the production `moveComparePair` field. Test helper names (`makeJxlCtx`, `commonMocks`, `makeCtx`) reference the exact existing blocks they extend.
