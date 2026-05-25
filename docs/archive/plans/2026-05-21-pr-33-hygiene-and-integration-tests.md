# PR #33 Hygiene + Integration Tests Implementation Plan

**Status: Complete** — Implemented and merged in [PR #36](https://github.com/GoodAlex223/media-viewer/pull/36) (2026-05-24).
Test results: 195/195 unit tests, 39/39 E2E tests. Manual smoke verified by user.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close four PR #33 review follow-ups in one PR — three defensive code hardenings (CLIP toggle-off `clipUnloadTimer` clear, `try/catch` around `deleteSortCache('clip')`, per-file abort check in `insertNewFilesInSortedOrder`) plus one integration test pattern covering both branches of the cache-hit sort call graph.

**Architecture:** Three small edits in `media-viewer.js` (two adjacent edits in the CLIP toggle handler at L1748-1768, two symmetric edits at the outer loop of `insertNewFilesInSortedOrder` L5125 and L5174). One new file `tests/integration/cached-sort-path.test.js` with three integration tests that wire BOTH real `applyCachedSortOrder` and real `insertNewFilesInSortedOrder` together via `extractAsyncMethod` and assert algorithm strings thread end-to-end through the real call graph (the wiring class of bug PR #33 introduced).

**Tech Stack:** Electron renderer (vanilla JS, no bundler), Vitest unit tests (`tests/**/*.test.js` glob picks up `tests/integration/` automatically — no config change needed), Husky pre-commit (ESLint + Prettier + `vitest run`).

**Spec:** [docs/superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md](../../superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `media-viewer.js:1753-1767` | Modify | CLIP toggle-off handler — add `clearTimeout(this.clipUnloadTimer)` + wrap `deleteSortCache('clip')` in try/catch |
| `media-viewer.js:5125` | Modify | `insertNewFilesInSortedOrder` CLIP branch — add abort check at top of outer for-loop |
| `media-viewer.js:5174` | Modify | `insertNewFilesInSortedOrder` hash branch — add abort check at top of outer for-loop |
| `tests/integration/cached-sort-path.test.js` | Create | Three integration tests for the real `applyCachedSortOrder → insertNewFilesInSortedOrder` call graph |
| `CLAUDE.md` | Modify | Mark three "Active gotchas" entries as resolved |
| `docs/planning/BACKLOG.md` | Modify | Strike-through (or remove) four closed items |
| `docs/planning/DONE.md` | Modify | New entry for this work, with `193/193 unit, 39/39 E2E` line per convention |
| `docs/planning/WEEKLY.md` | Modify | Flip four `- [ ]` to `- [x]` under "Wednesday, May 13" |
| `docs/README.md` | Modify | Index this new plan and its spec |

---

## Pre-flight

- [x] **Step P1: Read the spec one more time**

Run: `cat docs/superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md` (or open it in editor).

Skim Sections 1-3 to confirm scope and the exact target code.

- [x] **Step P2: Confirm starting state is clean**

Run: `git status`
Expected: clean working tree on `main` (or a fresh feature branch already created).

If not clean, stop and resolve uncommitted changes first.

- [x] **Step P3: Create a feature branch**

Run: `git checkout -b feature/pr-33-hygiene-integration-tests`

Expected: switched to a new branch.

- [x] **Step P4: Baseline test run**

Run: `npm test`
Expected: `190 passed (190)` — same baseline the spec projects from.

If a different count, update the spec's projected 190→193 to match the new baseline before continuing.

---

## Task 1: CLIP Toggle-Off Hardening (Spec items 1 + 2)

**Files:**
- Modify: `media-viewer.js:1753-1767`

**Note:** The toggle handler is an inline `addEventListener` callback (anonymous arrow function), not a named class method, so `extractMethod`/`extractAsyncMethod` can't reach it. We do this change as a code edit + manual smoke test rather than TDD with a unit test. The diff is six lines and reviewable by inspection. Manual smoke at end of Task 9 covers the behavior.

- [x] **Step 1.1: Read the current toggle handler**

Run: `grep -n "clipFeaturesToggle" media-viewer.js` (use Grep tool — never invoke `grep` from Bash)

Open `media-viewer.js` to lines 1745-1770 and read the existing `clipToggle.addEventListener('change', async () => { ... });` body to confirm it matches the spec's "current code" snippet.

- [x] **Step 1.2: Edit the toggle-off block**

Replace this code in `media-viewer.js` (lines ~1753-1767):

```js
if (!clipToggle.checked) {
                    // Revert sortAlgorithm + dropdown synchronously first so the UI reflects
                    // the new state instantly (no transient where dropdown shows CLIP but
                    // CLIP is disabled). Then await the cache deletion IPC.
                    if (this.sortAlgorithm === 'clip') {
                        this.sortAlgorithm = 'vptree';
                        localStorage.setItem('sortAlgorithm', 'vptree');
                        if (this.sortAlgorithmSelect) {
                            this.sortAlgorithmSelect.value = 'vptree';
                        }
                    }
                    // Persisted 'clip' sort cache may now reference files without vectors
                    // or vectors from a model version that won't load again — drop it.
                    await this.deleteSortCache('clip');
                }
```

With:

```js
if (!clipToggle.checked) {
                    // Cancel any pending 30s CLIP unload — Group E pattern (d65bfdd)
                    // requires every code path that changes CLIP state to clear the timer.
                    if (this.clipUnloadTimer !== null) {
                        clearTimeout(this.clipUnloadTimer);
                        this.clipUnloadTimer = null;
                    }
                    // Revert sortAlgorithm + dropdown synchronously first so the UI reflects
                    // the new state instantly (no transient where dropdown shows CLIP but
                    // CLIP is disabled). Then await the cache deletion IPC.
                    if (this.sortAlgorithm === 'clip') {
                        this.sortAlgorithm = 'vptree';
                        localStorage.setItem('sortAlgorithm', 'vptree');
                        if (this.sortAlgorithmSelect) {
                            this.sortAlgorithmSelect.value = 'vptree';
                        }
                    }
                    // Persisted 'clip' sort cache may now reference files without vectors
                    // or vectors from a model version that won't load again — drop it.
                    try {
                        await this.deleteSortCache('clip');
                    } catch (_e) {
                        // Best-effort cleanup — deleteSortCache already shows a notification
                        // on failure. Explicit catch makes the contract obvious.
                    }
                }
```

Use the Edit tool with the full surrounding context (preserve all indentation — these lines are inside an arrow function inside a method, so they have ~20 leading spaces).

- [x] **Step 1.3: Run lint**

Run: `npm run lint`
Expected: no errors (Prettier may auto-fix indentation if invoked via `lint:fix`).

If errors: run `npm run lint:fix` and re-check.

- [x] **Step 1.4: Run full test suite**

Run: `npm test`
Expected: `190 passed (190)` — unchanged. We added no new tests yet; existing tests must still pass since this code path is not unit-tested.

- [x] **Step 1.5: Commit**

```bash
git add media-viewer.js
git commit -m "fix(clip): harden toggle-off handler

- Cancel pending clipUnloadTimer before cleanup to close the
  re-enable-during-pending-unload race (mitigated today by main.js
  loading-state guard, but should be closed at the renderer layer too).
- Wrap deleteSortCache('clip') in try/catch to make the best-effort
  contract explicit at the caller.

PR #33 sub-threshold review items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected: pre-commit hook passes (ESLint + Prettier + `vitest run`). Commit succeeds.

---

## Task 2: Abort Check in `insertNewFilesInSortedOrder` — CLIP Branch (TDD)

**Files:**
- Test: `tests/media-viewer-utils.test.js` (extend the existing `insertNewFilesInSortedOrder (algorithm-aware)` describe block at line ~295)
- Modify: `media-viewer.js:5125` (CLIP branch outer for-loop)

- [x] **Step 2.1: Write the failing test**

Open `tests/media-viewer-utils.test.js` and add the following two new tests inside the existing `describe('insertNewFilesInSortedOrder (algorithm-aware)', ...)` block (around line 385, right before its closing `});`). Test for hash branch goes in this task too so the describe block stays grouped — we'll add the hash-branch fix in Task 3, but the test is small enough to add now and watch it fail.

Actually — strict TDD: write only the CLIP-branch test here, save the hash-branch test for Task 3.

Add this single test inside the existing `describe`:

```js
    it('CLIP path: throws "Sort aborted" when sortAbortController.signal.aborted before first iteration', async () => {
        const a = { path: '/a.png' };
        const c = { path: '/c.png' };
        const b = { path: '/b.png' };
        const originalMediaFiles = [a, c];
        const ctx = makeCtx({
            mediaFiles: originalMediaFiles,
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/b.png', new Float32Array([0.99, 0.14, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
            ]),
            sortAbortController: { signal: { aborted: true } },
        });

        await expect(insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'clip')).rejects.toThrow(
            'Sort aborted'
        );

        // mediaFiles must remain untouched (assignment is post-loop on L5242)
        expect(ctx.mediaFiles).toBe(originalMediaFiles);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png']);
    });
```

- [x] **Step 2.2: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "CLIP path: throws"`
Expected: FAIL — the current code has no abort check, so the call resolves normally and mutates `mediaFiles` (test assertion that it throws will fail).

- [x] **Step 2.3: Add abort check to CLIP branch**

In `media-viewer.js`, locate the CLIP branch of `insertNewFilesInSortedOrder` at line ~5125. Insert the abort check as the first statement inside the outer for-loop body.

Replace:

```js
        if (algorithm === 'clip') {
            // CLIP path: score by cosine distance over clipCache vectors.
            // Files without CLIP vectors are end-appended (matches sortMediaBySimilarityClip's
            // first-time-sort fallback). No on-demand CLIP extraction here — the cache-hit
            // path is expected to be near-instant; firing main-process inference would
            // add ~100-200ms per missing file via IPC.
            for (let i = 0; i < newFiles.length; i++) {
                const newFile = newFiles[i];
                const newVec = this.clipCache.get(newFile.path);
```

With:

```js
        if (algorithm === 'clip') {
            // CLIP path: score by cosine distance over clipCache vectors.
            // Files without CLIP vectors are end-appended (matches sortMediaBySimilarityClip's
            // first-time-sort fallback). No on-demand CLIP extraction here — the cache-hit
            // path is expected to be near-instant; firing main-process inference would
            // add ~100-200ms per missing file via IPC.
            for (let i = 0; i < newFiles.length; i++) {
                if (this.sortAbortController?.signal.aborted) {
                    throw new Error('Sort aborted');
                }
                const newFile = newFiles[i];
                const newVec = this.clipCache.get(newFile.path);
```

- [x] **Step 2.4: Run the test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "CLIP path: throws"`
Expected: PASS.

- [x] **Step 2.5: Run full test suite to confirm no regression**

Run: `npm test`
Expected: `191 passed (191)` — one new test plus all existing 190.

- [x] **Step 2.6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(sort): per-file abort check in insertNewFilesInSortedOrder CLIP branch

Adds an abort check at the top of the outer for-loop in the CLIP branch
of insertNewFilesInSortedOrder so cancel during cache-hit insertion is
honored within one new-file iteration (typically <1ms latency).

Throwing mid-loop is safe: this.mediaFiles is only assigned after the
loop completes (L5242), so partial mutation is impossible.

PR #33 sub-threshold review item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Abort Check in `insertNewFilesInSortedOrder` — Hash Branch (TDD)

**Files:**
- Test: `tests/media-viewer-utils.test.js` (same `insertNewFilesInSortedOrder` describe block)
- Modify: `media-viewer.js:5174` (hash branch outer for-loop)

- [x] **Step 3.1: Write the failing test**

Add this test inside the same `describe('insertNewFilesInSortedOrder (algorithm-aware)', ...)` block in `tests/media-viewer-utils.test.js`, right after the CLIP abort test from Task 2:

```js
    it('hash path: throws "Sort aborted" when sortAbortController.signal.aborted before first iteration', async () => {
        const a = { path: '/a.png' };
        const c = { path: '/c.png' };
        const b = { path: '/b.png' };
        const originalMediaFiles = [a, c];
        const ctx = makeCtx({
            mediaFiles: originalMediaFiles,
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
            sortAbortController: { signal: { aborted: true } },
        });

        await expect(insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'vptree')).rejects.toThrow(
            'Sort aborted'
        );

        expect(ctx.mediaFiles).toBe(originalMediaFiles);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png']);
    });
```

- [x] **Step 3.2: Run the test to verify it fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "hash path: throws"`
Expected: FAIL — hash branch still has no abort check.

- [x] **Step 3.3: Add abort check to hash branch**

In `media-viewer.js`, locate the hash branch's outer for-loop at line ~5174. Insert the same abort check pattern.

Replace:

```js
        } else {
            // Hash path (vptree, mst, simple, or undefined): unchanged behavior.
            for (let i = 0; i < newFiles.length; i++) {
                const newFile = newFiles[i];

                if (!this.perceptualHashes.has(newFile.path)) {
```

With:

```js
        } else {
            // Hash path (vptree, mst, simple, or undefined): unchanged behavior.
            for (let i = 0; i < newFiles.length; i++) {
                if (this.sortAbortController?.signal.aborted) {
                    throw new Error('Sort aborted');
                }
                const newFile = newFiles[i];

                if (!this.perceptualHashes.has(newFile.path)) {
```

- [x] **Step 3.4: Run the test to verify it passes**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "hash path: throws"`
Expected: PASS.

- [x] **Step 3.5: Run full test suite**

Run: `npm test`
Expected: `192 passed (192)` — two new abort tests plus 190 existing.

- [x] **Step 3.6: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(sort): per-file abort check in insertNewFilesInSortedOrder hash branch

Mirror of Task 2 for the hash branch. Both branches now honor cancel
within one new-file iteration. Inner j-loop intentionally not checked
(hot path; outer is sufficient for user-perceptible cancel latency).

PR #33 sub-threshold review item.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create Integration Test File Skeleton + CLIP Routing Test

**Files:**
- Create: `tests/integration/cached-sort-path.test.js`

- [x] **Step 4.1: Create directory**

Run: `ls tests/` — confirm there is no existing `integration` subdirectory.

If not present, the Write tool will create the directory automatically when writing the file. No explicit mkdir needed.

- [x] **Step 4.2: Write the file with the first test (CLIP routing)**

Create `tests/integration/cached-sort-path.test.js` with this content:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Integration tests: exercise the REAL call graph between applyCachedSortOrder
// and insertNewFilesInSortedOrder. The PR #33 algorithm-threading bug slipped
// through 7 unit tests because each test stubbed the boundary between these
// two methods. These tests use BOTH real methods to catch wiring bugs that
// leaf-tested unit tests miss.

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media-viewer.js'), 'utf-8');

// Duplicated from tests/media-viewer-utils.test.js — Vitest test files in this
// codebase don't share helpers via import (each file defines its own utilities).
// If a third test file needs this, extract to tests/helpers/extract-method.js.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractAsyncMethod(methodName) {
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

const applyCachedSortOrder = extractAsyncMethod('applyCachedSortOrder');
const insertNewFilesInSortedOrder = extractAsyncMethod('insertNewFilesInSortedOrder');

describe('cache-hit sort path — algorithm threading (integration)', () => {
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                path: { basename: async (p) => p.split('/').pop() },
            },
        };
    });

    afterEach(() => {
        globalThis.window = origWindow;
    });

    function makeCtx(overrides = {}) {
        return {
            mediaFiles: [],
            clipCache: new Map(),
            perceptualHashes: new Map(),
            sortAbortController: null,
            // Real method bound onto ctx — applyCachedSortOrder calls
            // this.insertNewFilesInSortedOrder which dispatches here.
            insertNewFilesInSortedOrder,
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
            // computePerceptualHash should NOT be called when hash already cached
            // in tests below. A spy lets us assert that.
            computePerceptualHash: vi.fn(),
            updateProgressNotification: vi.fn(),
            ...overrides,
        };
    }

    it('CLIP cache entry routes through CLIP branch and uses cosine distance', async () => {
        // Setup: cached order [a, c] + 1 new file b; all three have CLIP vectors.
        // Expected: b inserted at index 0 (closest cosine to a).
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, b, c], // includes new file b
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/b.png', new Float32Array([0.99, 0.14, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
            ]),
        });

        const cachedData = {
            algorithm: 'clip',
            sortedPaths: ['a.png', 'c.png'], // b.png missing → treated as new
        };

        const stats = await applyCachedSortOrder.call(ctx, cachedData, 'clip');

        expect(stats).toEqual({ cached: 2, removed: 0, added: 1 });
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
        // Hash branch must NOT have been taken — no on-demand hash computation
        expect(ctx.computePerceptualHash).not.toHaveBeenCalled();
    });
});
```

- [x] **Step 4.3: Run the new test**

Run: `npx vitest run tests/integration/cached-sort-path.test.js`
Expected: `1 passed (1)`. The Vitest glob `tests/**/*.test.js` should pick up `tests/integration/cached-sort-path.test.js` automatically (the only exclusion is `tests/e2e/**`).

If the test is not collected: confirm the file path matches the glob and that `vitest.config.js` still reads `include: ['tests/**/*.test.js']` and `exclude: ['tests/e2e/**']`.

If the test fails: most likely cause is `extractAsyncMethod` source path — the `path.join(__dirname, '..', '..', 'media-viewer.js')` resolves from `tests/integration/` so two `..` segments are needed (vs. one in the existing `tests/*.test.js` files).

- [x] **Step 4.4: Run full test suite**

Run: `npm test`
Expected: `193 passed (193)` — one new integration test plus the 192 from Tasks 2-3.

- [x] **Step 4.5: Commit**

```bash
git add tests/integration/cached-sort-path.test.js
git commit -m "test(integration): add CLIP routing test for cached sort path

First of three integration tests covering the real applyCachedSortOrder
-> insertNewFilesInSortedOrder call graph. This is the wiring-bug class
that PR #33 introduced (cachedData.algorithm was undefined) and that
seven leaf-tested unit tests failed to catch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Add Hash Routing Integration Test

**Files:**
- Modify: `tests/integration/cached-sort-path.test.js`

- [x] **Step 5.1: Add the second test**

Inside the existing `describe('cache-hit sort path — algorithm threading (integration)', ...)` block in `tests/integration/cached-sort-path.test.js`, add this second test right after the CLIP test:

```js
    it('VPTree cache entry routes through hash branch and uses Hamming distance', async () => {
        // Setup: cached order [a, c] + 1 new file b; all three have perceptual hashes.
        // Expected: b inserted at index 0 (closest Hamming to a).
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, b, c],
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
            // clipCache deliberately empty — must not be consulted
        });

        const cachedData = {
            algorithm: 'vptree',
            sortedPaths: ['a.png', 'c.png'],
        };

        const stats = await applyCachedSortOrder.call(ctx, cachedData, 'vptree');

        expect(stats).toEqual({ cached: 2, removed: 0, added: 1 });
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
        // Hash already cached, no on-demand extraction expected
        expect(ctx.computePerceptualHash).not.toHaveBeenCalled();
    });
```

- [x] **Step 5.2: Run the test**

Run: `npx vitest run tests/integration/cached-sort-path.test.js -t "VPTree cache entry"`
Expected: PASS.

- [x] **Step 5.3: Run full integration suite**

Run: `npx vitest run tests/integration/cached-sort-path.test.js`
Expected: `2 passed (2)`.

- [x] **Step 5.4: Commit**

```bash
git add tests/integration/cached-sort-path.test.js
git commit -m "test(integration): add hash-branch routing test for cached sort path

Second of three integration tests. Mirrors the CLIP test but exercises
the vptree/Hamming branch of insertNewFilesInSortedOrder.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Add Missing-Algorithm Fallback Integration Test

**Files:**
- Modify: `tests/integration/cached-sort-path.test.js`

- [x] **Step 6.1: Add the third test**

Inside the same `describe(...)` block, add this third test right after the VPTree test:

```js
    it('old cache entry without algorithm field falls through to Hamming (pre-PR#33 format)', async () => {
        // Pre-PR#33 caches don't have an algorithm field. applyCachedSortOrder must
        // resolve algorithm = explicit-param ?? cachedData.algorithm and route safely.
        // Here we call with algorithm=undefined to force fallback to cachedData.algorithm,
        // which is ALSO undefined — must route to Hamming, not crash.
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, b, c],
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
        });

        const cachedData = {
            // No algorithm field — old format
            sortedPaths: ['a.png', 'c.png'],
        };

        const stats = await applyCachedSortOrder.call(ctx, cachedData, undefined);

        expect(stats).toEqual({ cached: 2, removed: 0, added: 1 });
        // Hash branch reached safely — b inserted at index 0 by Hamming distance
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
        expect(ctx.computePerceptualHash).not.toHaveBeenCalled();
    });
```

- [x] **Step 6.2: Run the test**

Run: `npx vitest run tests/integration/cached-sort-path.test.js -t "old cache entry"`
Expected: PASS.

- [x] **Step 6.3: Run full integration suite**

Run: `npx vitest run tests/integration/cached-sort-path.test.js`
Expected: `3 passed (3)`.

- [x] **Step 6.4: Run full test suite (final count check)**

Run: `npm test`
Expected: `193 passed (193)` total — 190 baseline + 2 abort-check tests (Tasks 2 & 3) + 3 integration tests = wait, that's 195. Let me recount.

Actually: 190 baseline + 2 abort tests (Tasks 2, 3) = 192 + 3 integration tests (Tasks 4, 5, 6) = **195 passed**. Update the spec's projected count from 193 to 195 in the doc updates of Task 8.

Expected: `195 passed (195)`.

- [x] **Step 6.5: Commit**

```bash
git add tests/integration/cached-sort-path.test.js
git commit -m "test(integration): add pre-PR#33 cache format fallback test

Third of three integration tests. Verifies that a cache entry without
the 'algorithm' field (legacy format) safely falls through to the
Hamming branch when applyCachedSortOrder is also called with no
explicit algorithm param.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Full Verification

**Files:** none (verification only)

- [x] **Step 7.1: Lint everything**

Run: `npm run lint`
Expected: no errors.

- [x] **Step 7.2: Full unit test suite**

Run: `npm test`
Expected: `195 passed (195)`.

- [x] **Step 7.3: Run E2E tests**

Run: `npm run test:e2e`
Expected: `39 passed` (the standing count per CLAUDE.md). All E2E tests pass with no regression from the renderer-side changes.

Note: this is the full E2E suite; depending on hardware it may take 5-15 minutes. Run it once before the documentation updates and once more if you make any further code changes after this point.

- [x] **Step 7.4: Format check**

Run: `npm run format:check`
Expected: no files needing formatting (Prettier should already be clean from pre-commit hooks).

If errors: run `npm run format` and commit any formatting changes separately with `style: prettier`.

---

## Task 8: Documentation Updates

**Files:**
- Modify: `docs/planning/BACKLOG.md`
- Modify: `docs/planning/DONE.md`
- Modify: `docs/planning/WEEKLY.md`
- Modify: `docs/README.md`
- Modify: `CLAUDE.md`

- [x] **Step 8.1: Mark BACKLOG items closed**

Open `docs/planning/BACKLOG.md` and locate the section "From PR #33 Code Review (2026-05-05)". Strike through or remove these four items (keep the section header; just mark items as closed by changing `- [ ]` to `- [x]` and adding a closure note `✅ 2026-05-21 (PR #XX)`):

1. "Clear `this.clipUnloadTimer` in CLIP toggle-off handler" (~50/100)
2. "Add try/catch around `await this.deleteSortCache('clip')` in toggle handler" (~25/100)
3. "Add per-file abort check to `insertNewFilesInSortedOrder` (both paths)" (~0/100, pre-existing)
4. "Process: end-to-end integration tests for cache-hit sort paths"

Pattern matches prior closures in the same file (e.g., the 2026-05-07 entry for the CLIP extraction silent failure).

- [x] **Step 8.2: Add DONE.md entry**

Open `docs/planning/DONE.md` and add a new entry at the top of the active log (above the most recent entry — the 2026-05-14 Group B entry). Use this template, mirroring the structure of existing entries:

```markdown
### 2026-05-21 — PR #33 Hygiene + Integration Tests (Groups C + D)

**Summary**: Closed four PR #33 review follow-ups in one PR. Three defensive
hardenings around CLIP toggle/sort paths and one fixture-driven integration
test pattern covering both branches of the cache-hit sort call graph.

**Changes**:
- `media-viewer.js` toggle-off handler: clear `clipUnloadTimer` before
  cleanup; wrap `deleteSortCache('clip')` in try/catch.
- `media-viewer.js` `insertNewFilesInSortedOrder`: per-file abort check
  at the top of the outer for-loop in both CLIP and hash branches.
- New file `tests/integration/cached-sort-path.test.js`: three tests
  wiring real `applyCachedSortOrder` → real `insertNewFilesInSortedOrder`
  to assert algorithm strings thread end-to-end (CLIP, VPTree, missing
  field fallback).

**Test results**: 195/195 unit tests pass, 39/39 E2E tests pass.

**Spec**: [docs/superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md](../superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md)
**Plan**: [docs/archive/plans/2026-05-21-pr-33-hygiene-and-integration-tests.md](../archive/plans/2026-05-21-pr-33-hygiene-and-integration-tests.md)
**PR**: #XX (fill in after creation)
```

- [x] **Step 8.3: Update WEEKLY.md**

Open `docs/planning/WEEKLY.md` and locate "Wednesday, May 13 — PR #33 Hygiene + Integration Tests" (line ~111). Flip all four `- [ ]` to `- [x]`:

- [x] Clear `this.clipUnloadTimer` in CLIP toggle-off (1 SP)
- [x] try/catch around `deleteSortCache('clip')` (1 SP)
- [x] Per-file abort check in `insertNewFilesInSortedOrder` (2 SP)
- [x] End-to-end integration test for cache-hit sort paths (3 SP)

- [x] **Step 8.4: Update docs/README.md**

Open `docs/README.md` and locate the "Design Specs" table. Add a row for this spec:

```markdown
| 2026-05-21 | [PR #33 Hygiene + Integration Tests](superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md) | Defensive cleanup of three CLIP toggle/sort code paths plus an integration test pattern catching wiring bugs |
```

Maintain table column order matching surrounding rows.

Also: the plan itself is archived in Task 9 (post-merge step), so do NOT add a row to the Archived Plans table here. That happens after merge.

- [x] **Step 8.5: Update CLAUDE.md "Active gotchas"**

Open `CLAUDE.md` and find these three lines in the "Active gotchas learned from past work" section (under the `<!-- AUTO-MANAGED: git-insights -->` block — the auto-memory agent already prefixed them with "design spec written" earlier; now flip to "now guarded"):

1. The `clipUnloadTimer` gotcha that begins "CLIP toggle-off handler missing `clearTimeout(this.clipUnloadTimer)`"
2. The `insertNewFilesInSortedOrder` abort-check gotcha
3. The integration test gap gotcha ("Integration test gap — unit-test-the-leaf misses call-graph bugs")

For each: change the parenthetical label from `(design spec written, Group C/D)` to `(resolved 2026-05-21)`. Replace any "fix: add ..." prescriptive text with a brief past-tense note describing the resolution.

Example for the `clipUnloadTimer` gotcha — change:
> `(design spec written, Group C)`: ... fix: add `clearTimeout(this.clipUnloadTimer); this.clipUnloadTimer = null;` at top of the toggle-off branch ...

To:
> `(resolved 2026-05-21)`: toggle-off handler now clears `clipUnloadTimer` and wraps `deleteSortCache('clip')` in try/catch; race is closed at the renderer layer (was previously mitigated by main.js loading-state guard alone).

Use parallel rephrasing for the other two entries. Keep the surrounding gotcha text otherwise unchanged so context for future readers is preserved.

- [x] **Step 8.6: Commit documentation updates**

```bash
git add docs/planning/BACKLOG.md docs/planning/DONE.md docs/planning/WEEKLY.md docs/README.md CLAUDE.md
git commit -m "docs: close four PR #33 review items; update gotchas and weekly log

- BACKLOG.md: mark 4 PR #33 sub-threshold items closed
- DONE.md: new entry for 2026-05-21 with 195/195 + 39/39 counts
- WEEKLY.md: flip 4 checkboxes under Wednesday May 13
- README.md: index the new spec under Design Specs
- CLAUDE.md: 3 gotchas now read 'resolved 2026-05-21'

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Manual Smoke Test + PR

**Files:** none (verification only — opens PR)

- [x] **Step 9.1: Launch the app**

Run: `npm start` (in a separate terminal — leave it running for the smoke test).

Expected: media-viewer Electron window appears.

- [x] **Step 9.2: Smoke scenario 1 — CLIP toggle-off cleanup**

1. Open a folder containing at least 10 image files.
2. Open Settings (F1). Confirm CLIP toggle is on.
3. Wait ~5-10s for background extraction to begin (watch logs/notifications).
4. Click "Sort by Similarity" with CLIP algorithm selected. Confirm success.
5. Open Settings again. Disable CLIP toggle.
6. Expected: dropdown reverts to VPTree synchronously (no transient where dropdown still says CLIP). No errors in DevTools console.
7. Inspect `.sort_cache.json` in the folder (use a separate file explorer): the `clip` key should not be present.

Manual verification only — no automation required.

- [x] **Step 9.3: Smoke scenario 2 — abort mid-sort**

1. In the same folder, re-enable CLIP toggle.
2. Wait for any pending extraction to finish (or add ~50 new files to the folder so the cache-hit insertion path has work to do).
3. Click Sort by Similarity → watch for the "🔄 Inserting N new files..." notification.
4. Click the Cancel button (or close the progress notification, whichever the UI provides) during the insertion phase.
5. Expected: sort aborts within ~1 second; no "frozen UI" sensation; current view returns to pre-sort state.

This validates the per-file abort check from Tasks 2-3.

- [x] **Step 9.4: Close the app**

Switch to the terminal running `npm start` and press Ctrl+C, or close the Electron window.

If any console errors appeared during smoke testing, stop and investigate before opening PR.

- [x] **Step 9.5: Push branch**

Run: `git push -u origin feature/pr-33-hygiene-integration-tests`

Expected: branch pushed to remote.

- [x] **Step 9.6: Open PR**

Run this `gh` command, replacing the placeholder once you know the next PR number from `gh pr list`:

```bash
gh pr create --title "Close 4 PR #33 review follow-ups (Groups C + D)" --body "$(cat <<'EOF'
## Summary

Closes four sub-threshold items from the PR #33 multi-agent review (2026-05-05):

- Clear `this.clipUnloadTimer` in CLIP toggle-off handler (Group C-1, ~50/100)
- Wrap `await this.deleteSortCache('clip')` in try/catch (Group C-2, ~25/100)
- Per-file abort check in `insertNewFilesInSortedOrder` (Group C-3, ~0/100 pre-existing both paths)
- Integration test pattern for cache-hit sort paths (Group D, process)

## Approach

Five small edits in `media-viewer.js` (two in the toggle-off block; one each in the CLIP and hash branches of `insertNewFilesInSortedOrder`). One new file `tests/integration/cached-sort-path.test.js` with three tests that wire BOTH real `applyCachedSortOrder` and real `insertNewFilesInSortedOrder` end-to-end via `extractAsyncMethod` — the wiring class of bug PR #33 introduced is exactly what the new tests are designed to catch.

## Test plan

- [x] `npm test` — 195/195 pass
- [x] `npm run test:e2e` — 39/39 pass
- [x] `npm run lint` — clean
- [x] Manual smoke: CLIP toggle-off → no stale timer, dropdown reverts synchronously, `.sort_cache.json` no `clip` key
- [x] Manual smoke: Cancel mid-sort during cache-hit insertion → aborts within 1s

## Spec

[docs/superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md](docs/superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened. Note the PR number.

- [x] **Step 9.7: Update DONE.md with PR number**

Open `docs/planning/DONE.md` — replace `#XX (fill in after creation)` with the actual PR number from Step 9.6.

```bash
git add docs/planning/DONE.md
git commit -m "docs(DONE): fill in PR #XX after creation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Self-Review

After writing the plan above, here are the checks I ran:

**1. Spec coverage:**
- Spec Item 1 (clear clipUnloadTimer): Task 1 — ✓
- Spec Item 2 (try/catch deleteSortCache): Task 1 — ✓
- Spec Item 3 (abort check, both branches): Tasks 2 + 3 — ✓
- Spec Item 4 (integration test, both branches + fallback): Tasks 4 + 5 + 6 — ✓
- Documentation updates listed in Spec Section 4: Task 8 — ✓
- Manual smoke checklist from Spec Section 4: Task 9 — ✓

**2. Placeholder scan:** No "TBD", no "implement later", no "similar to Task N", no "add appropriate error handling". All code blocks contain exact paste-ready content. The one `#XX` in PR title/DONE entry is intentional — it gets filled in at Step 9.7 after PR creation.

**3. Type consistency:**
- `extractAsyncMethod` signature consistent between Task 4 (new file) and existing `tests/media-viewer-utils.test.js`.
- `sortAbortController?.signal.aborted` pattern identical in Tasks 2 and 3 and matches `media-viewer.js:4223` precedent.
- `'Sort aborted'` error message identical across CLIP/hash branches and matches the existing `handleSortBySimilarity` pattern.
- Test count math corrected in Step 6.4 (190 baseline + 2 + 3 = 195, not 193 as the spec originally projected). DONE.md entry in Step 8.2 and PR body in Step 9.6 use the corrected 195.

One drift fixed: the spec said "190 → 193" but the actual delta is 190 → 195 (2 abort tests + 3 integration tests). The plan reflects the correct count, and the spec will be amended via the natural docs update — or you can fix the spec inline before starting Task 1 if you want them aligned.
