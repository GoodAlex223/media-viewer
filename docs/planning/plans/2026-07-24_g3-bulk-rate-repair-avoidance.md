# Group G3 — Bulk-Rate Re-Pair Avoidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In AI-sorted compare mode, stop re-showing the exact two-file pair a user already rated "Both good"/"Both bad", while still letting a rated file pair with fresh files and falling through when no un-rated pair remains.

**Architecture:** A new pure method `computeValidComparePairs()` becomes the single source of truth for the AI-sorted "extremes" pairing — it builds the candidate pairs, drops any exact combo present in a new session-only `bulkRatedPairs` Set (falling through to the full list when all are suppressed), and returns an ordered array. `showCompareMedia`, `nextMedia`/`previousMedia`, `updateNavigationInfo`, and undo all read from this one list. `applyBulkRating` records the rated pair's key and re-renders **in place** (instead of advancing the index) so the peeled-away pair does not skip the next one.

**Tech Stack:** Electron 30 renderer (no bundler, browser globals), Vitest (unit), Playwright + Electron (E2E), Prettier + ESLint flat config.

**Spec:** [docs/superpowers/specs/2026-07-24-g3-bulk-rate-repair-avoidance-design.md](../../superpowers/specs/2026-07-24-g3-bulk-rate-repair-avoidance-design.md) (commit `f4f4261`)
**Branch:** `feat/g3-bulk-rate-repair-avoidance`

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `bracketSpacing`, `arrowParens=always`, `endOfLine="lf"`. Run `npm run format` before each commit.
- **No `.bulk_rated.json` schema change.** `bulkRatedPairs` is **in-memory, session-only** (spec D2): initialized empty in the constructor, reset empty on each folder load, never persisted.
- **Suppression is exact-pair** (spec D1): only the specific two-file combo rated together is suppressed. A rated file must still be pairable with any other file.
- **Renderer file has no module system for its own code** — `computeValidComparePairs` and `bulkPairKey` are methods on the `MediaViewer` class (browser globals; no `import`/`export`).
- **Unused variables** must be `_`-prefixed to satisfy ESLint `no-unused-vars`.
- **Pre-commit hook** runs `node scripts/check-secrets.js` → lint-staged (ESLint --fix + Prettier) → `npx vitest run`. All unit tests must pass on every commit. **E2E is NOT run by the hook** — run it manually per the Verification section.
- **Pre-push hook** (`check-e2e-needed.js`) will require the E2E suite to have run because `media-viewer.js` (a runtime file) changes — see Verification.
- **Baseline before starting:** 492 unit tests passing (17 files); E2E 55/55 (per G2 baseline, not re-run — this plan adds no new E2E).
- **Commit style:** `type(g3): subject`, body wrapped ~80 chars, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Tasks |
|---|---|---|
| `media-viewer.js` | New `bulkRatedPairs` state + `bulkPairKey` helper + `computeValidComparePairs`; `showCompareMedia` AI branch reads the list; `applyBulkRating` records key + re-renders in place; `undoBulkRating` deletes key; `nextMedia`/`previousMedia` bounds; `updateNavigationInfo` denominator; `removeFileFromList` prune; `loadBulkRatedFile` reset. | 1, 2, 3 |
| `tests/ml-pair-selection.test.js` | Rewritten to test the **real** `computeValidComparePairs` / `bulkPairKey` (retires the copied `selectMlPair` replica): extremes, suppression, fall-through, boundary, key canonicalization. | 1 |
| `tests/media-viewer-utils.test.js` | New unit tests: `applyBulkRating` records the pair key + re-renders in place; `undoBulkRating` deletes the key; `removeFileFromList` prunes `bulkRatedPairs`; `updateNavigationInfo` denominator. Existing bulk-rating undo/hydration tests must stay green. | 2, 3 |

---

## Task 1: Pure selection core — `bulkPairKey`, `bulkRatedPairs`, `computeValidComparePairs`

**Files:**
- Modify: `media-viewer.js` — constructor `~130`; add two methods near `showCompareMedia` (`~2929`).
- Test: `tests/ml-pair-selection.test.js` (full rewrite).

**Interfaces:**
- Produces:
  - `bulkPairKey(nameA: string, nameB: string): string` — canonical, order-independent key (`[a,b].sort().join('\u0000')`).
  - `computeValidComparePairs(): Array<{leftFile: FileObj, rightFile: FileObj}>` — reads `this.mediaFiles`, `this.predictionScores`, `this.bulkRatedPairs`; returns the ordered extremes-pair list with exact-rated combos removed, or the full candidate list when all are suppressed. `FileObj` = `{name, path, ...}` (existing `mediaFiles` element).
  - `this.bulkRatedPairs: Set<string>` — session-only set of `bulkPairKey` values.

- [ ] **Step 1: Rewrite the test file to target the real methods (failing)**

Replace the entire contents of `tests/ml-pair-selection.test.js` with:

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// Extract a MediaViewer method body by brace-counting and return a callable Function.
function extractMethod(methodName) {
    const regex = new RegExp(`^\\s{4}${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) throw new Error(`Could not find method: ${methodName}`);
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
    return new Function(match[1], source.substring(searchStart + 1, methodEnd - 1));
}

// The REAL implementations under test (no replica — extracted from media-viewer.js source).
const bulkPairKey = extractMethod('bulkPairKey');
const computeValidComparePairs = extractMethod('computeValidComparePairs');

// Invoke computeValidComparePairs with a minimal `this`. bulkPairKey is provided on the ctx so the
// real key logic is exercised (it does not use `this`, so a bare function reference is fine).
function callCompute(mediaFiles, predictionScores, bulkRatedPairs = new Set()) {
    const ctx = { mediaFiles, predictionScores, bulkRatedPairs, bulkPairKey };
    return computeValidComparePairs.call(ctx);
}

function mockFile(name) {
    return { name, path: `/mock/${name}` };
}
// Build a score Map keyed by path for the given [file, score] pairs.
function scoreMap(entries) {
    return new Map(entries.map(([f, s]) => [f.path, s]));
}

describe('bulkPairKey', () => {
    it('is order-independent', () => {
        expect(bulkPairKey('a.jpg', 'z.jpg')).toBe(bulkPairKey('z.jpg', 'a.jpg'));
    });
    it('separates with NUL (distinct pairs never collide)', () => {
        expect(bulkPairKey('a', 'b')).not.toBe(bulkPairKey('a', 'c'));
        expect(bulkPairKey('a.jpg', 'z.jpg')).toContain('\u0000');
    });
});

describe('computeValidComparePairs — extremes pairing (no suppression)', () => {
    const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
    const scores = scoreMap([
        [files[0], 0.9],
        [files[1], 0.7],
        [files[2], 0.3],
        [files[3], 0.1],
    ]);

    it('pair 0 = highest vs lowest, pair 1 = 2nd highest vs 2nd lowest', () => {
        const pairs = callCompute(files, scores);
        expect(pairs).toHaveLength(2);
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
        expect(pairs[1].leftFile).toBe(files[1]);
        expect(pairs[1].rightFile).toBe(files[2]);
    });

    it('defaults missing scores to 0.5', () => {
        const partial = scoreMap([
            [files[0], 0.9],
            // files[1], files[2] missing -> 0.5
            [files[3], 0.1],
        ]);
        const pairs = callCompute(files, partial);
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
    });

    it('2-file boundary yields a single pair', () => {
        const two = [mockFile('x'), mockFile('y')];
        const pairs = callCompute(two, scoreMap([[two[0], 0.8], [two[1], 0.2]]));
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(two[0]);
        expect(pairs[0].rightFile).toBe(two[1]);
    });

    it('odd file count leaves the middle file unpaired', () => {
        const three = [mockFile('h'), mockFile('m'), mockFile('l')];
        const pairs = callCompute(three, scoreMap([[three[0], 0.9], [three[1], 0.5], [three[2], 0.1]]));
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(three[0]);
        expect(pairs[0].rightFile).toBe(three[2]);
    });
});

describe('computeValidComparePairs — exact-pair suppression', () => {
    const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
    const scores = scoreMap([
        [files[0], 0.9],
        [files[1], 0.7],
        [files[2], 0.3],
        [files[3], 0.1],
    ]);

    it('skips the exact rated combo, surfacing the next pair at index 0', () => {
        const rated = new Set([bulkPairKey('a', 'd')]); // the highest-vs-lowest pair
        const pairs = callCompute(files, scores, rated);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(files[1]);
        expect(pairs[0].rightFile).toBe(files[2]);
    });

    it('a rated file still pairs with a fresh file (only the exact combo is suppressed)', () => {
        // Rate (a,d). Six files: a,b,c,d,e,f. `a` should still appear paired with the new lowest.
        const six = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d'), mockFile('e'), mockFile('f')];
        const s = scoreMap([
            [six[0], 0.9],
            [six[1], 0.8],
            [six[2], 0.6],
            [six[3], 0.4],
            [six[4], 0.2],
            [six[5], 0.05],
        ]);
        // Extremes: (a,f),(b,e),(c,d). Rate (a,f).
        const rated = new Set([bulkPairKey('a', 'f')]);
        const pairs = callCompute(six, s, rated);
        expect(pairs).toHaveLength(2);
        expect(pairs.map((p) => [p.leftFile.name, p.rightFile.name])).toEqual([
            ['b', 'e'],
            ['c', 'd'],
        ]);
        // `a` is no longer paired — it is the middle-ish extreme; the point is (a,f) never recurs.
        expect(pairs.some((p) => p.leftFile.name === 'a' && p.rightFile.name === 'f')).toBe(false);
    });

    it('falls through to the full list when every pair is suppressed', () => {
        const rated = new Set([bulkPairKey('a', 'd'), bulkPairKey('b', 'c')]);
        const pairs = callCompute(files, scores, rated);
        expect(pairs).toHaveLength(2); // full candidate list, not empty
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
    });

    it('2-file fall-through: a rated single pair is re-shown', () => {
        const two = [mockFile('x'), mockFile('y')];
        const rated = new Set([bulkPairKey('x', 'y')]);
        const pairs = callCompute(two, scoreMap([[two[0], 0.8], [two[1], 0.2]]), rated);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(two[0]);
        expect(pairs[0].rightFile).toBe(two[1]);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ml-pair-selection.test.js`
Expected: FAIL — `Could not find method: bulkPairKey` (methods not yet defined).

- [ ] **Step 3: Add `bulkRatedPairs` to the constructor**

In `media-viewer.js`, immediately after line 130 (`this.bulkRated = new Map();`), add:

```javascript
        // Exact two-file combos already bulk-rated together, keyed by bulkPairKey(). Session-only
        // (spec G3 D2): reset empty on each folder load, never persisted. Suppresses re-showing the
        // same pair in AI-sorted compare.
        this.bulkRatedPairs = new Set();
```

- [ ] **Step 4: Add `bulkPairKey` and `computeValidComparePairs` methods**

In `media-viewer.js`, directly above `async showCompareMedia(retryCount = 0) {` (line ~2930), add:

```javascript
    // Canonical, order-independent key for a bulk-rated pair. The NUL separator ('\u0000') is
    // illegal in filenames on every OS, so distinct pairs can never collide. Keyed by filename to
    // match bulkRated / .bulk_rated.json (filenames are unique within a folder).
    bulkPairKey(nameA, nameB) {
        return [nameA, nameB].sort().join('\u0000');
    }

    // Ordered "extremes" candidate pairs for AI-sorted compare (i-th highest vs i-th lowest),
    // dropping any exact two-file combo already in bulkRatedPairs. Falls through to the full
    // candidate list when every pair is suppressed, so the user can always re-rate. Pure — reads
    // only mediaFiles / predictionScores / bulkRatedPairs; safe to recompute each render.
    computeValidComparePairs() {
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
        const valid = candidates.filter(
            (p) => !this.bulkRatedPairs.has(this.bulkPairKey(p.leftFile.name, p.rightFile.name))
        );
        return valid.length ? valid : candidates;
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/ml-pair-selection.test.js`
Expected: PASS (all `bulkPairKey` + `computeValidComparePairs` tests green).

- [ ] **Step 6: Format, lint, full unit run**

Run: `npm run format && npm run lint && npx vitest run`
Expected: Prettier clean, ESLint 0 errors, all unit tests pass (492 + new).

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js tests/ml-pair-selection.test.js
git commit -m "$(cat <<'EOF'
feat(g3): add bulkPairKey + computeValidComparePairs pure selection core

New session-only bulkRatedPairs Set + a pure computeValidComparePairs()
that drops exact rated combos with full-list fall-through. Rewrites
ml-pair-selection.test.js to exercise the real methods (retires the
copied selectMlPair replica).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire selection into render + rating + undo

**Files:**
- Modify: `media-viewer.js` — `showCompareMedia` AI branch (`~2997-3021`); `applyBulkRating` (`~7935-7970`); `undoBulkRating` (`~3812-3820`).
- Test: `tests/media-viewer-utils.test.js` (add two tests).

**Interfaces:**
- Consumes: `computeValidComparePairs()`, `bulkPairKey()`, `this.bulkRatedPairs` (Task 1).
- Produces: `applyBulkRating` adds the rated pair's key and calls `this.showMedia()` (not `this.nextMedia()`); `undoBulkRating` deletes the rated pair's key.

- [ ] **Step 1: Write the failing tests**

In `tests/media-viewer-utils.test.js`, find the existing bulk-rating test block (search for `bulk-rating undo reverses ML`) and add these two tests alongside it. They use the file's existing `extractAsyncMethod` helper (search the file for `function extractAsyncMethod`) and the real `bulkPairKey` via `extractMethod`:

```javascript
    it('applyBulkRating records the exact pair key and re-renders in place (no advance)', async () => {
        const applyBulkRating = extractAsyncMethod('applyBulkRating');
        const bulkPairKey = extractMethod('bulkPairKey');
        const showMedia = vi.fn();
        const nextMedia = vi.fn();
        const ctx = {
            isSortedByPrediction: true,
            isCompareMode: true,
            compareLeftFile: { name: 'a.jpg', path: '/f/a.jpg' },
            compareRightFile: { name: 'z.jpg', path: '/f/z.jpg' },
            getCombinedFeatures: () => null, // skips updateMlModelWithFeatures
            updateMlModelWithFeatures: vi.fn(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            bulkPairKey,
            saveBulkRatedFile: async () => {},
            moveHistory: [],
            mlComparePairIndex: 3,
            showNotification: () => {},
            showMedia,
            nextMedia,
        };
        await applyBulkRating.call(ctx, 'bad');

        expect(ctx.bulkRatedPairs.has(bulkPairKey('a.jpg', 'z.jpg'))).toBe(true);
        expect(showMedia).toHaveBeenCalledTimes(1);
        expect(nextMedia).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.moveHistory[0].prevPairIndex).toBe(3);
        expect(ctx.moveHistory[0].bothBad).toBe(true);
    });

    it('undoBulkRating deletes the exact pair key', async () => {
        const undoBulkRating = extractAsyncMethod('undoBulkRating');
        const bulkPairKey = extractMethod('bulkPairKey');
        const key = bulkPairKey('a.jpg', 'z.jpg');
        const ctx = {
            reverseMlModelUpdate: vi.fn(),
            bulkRated: new Map([['a.jpg', 'bad'], ['z.jpg', 'bad']]),
            bulkRatedPairs: new Set([key]),
            bulkPairKey,
            saveBulkRatedFile: async () => {},
            showNotification: () => {},
        };
        const lastMove = {
            bothBad: true,
            bulkFiles: [
                { name: 'a.jpg', features: null },
                { name: 'z.jpg', features: null },
            ],
        };
        await undoBulkRating.call(ctx, lastMove);

        expect(ctx.bulkRatedPairs.has(key)).toBe(false);
        expect(ctx.bulkRated.has('a.jpg')).toBe(false);
        expect(ctx.bulkRated.has('z.jpg')).toBe(false);
    });
```

**Note:** if `extractMethod` (sync, non-async) is not already defined in this test file, add it next to `extractAsyncMethod` using the same brace-count body but returning `new Function(...)` instead of an async function (mirror the helper in `tests/ml-pair-selection.test.js` from Task 1). Check first — search the file for `function extractMethod`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "applyBulkRating records" && npx vitest run tests/media-viewer-utils.test.js -t "undoBulkRating deletes"`
Expected: FAIL — `applyBulkRating` still calls `nextMedia` and does not add the key; `undoBulkRating` does not delete the key.

- [ ] **Step 3: Update `showCompareMedia` AI-sorted branch**

In `media-viewer.js`, replace the AI-sorted selection block (lines ~2997-3021, the `else if (this.isSortedByPrediction && this.predictionScores.size >= 2) { ... }` body) with:

```javascript
        // If sorted by prediction, select from the valid-pairs list (exact rated combos removed,
        // full-list fall-through). computeValidComparePairs is the single source of truth shared
        // with navigation, the position count, and undo.
        else if (this.isSortedByPrediction && this.predictionScores.size >= 2) {
            const pairs = this.computeValidComparePairs();
            const idx = Math.min(this.mlComparePairIndex, pairs.length - 1);
            leftFile = pairs[idx].leftFile;
            rightFile = pairs[idx].rightFile;

            const leftScore = this.predictionScores.get(leftFile.path) ?? 0.5;
            const rightScore = this.predictionScores.get(rightFile.path) ?? 0.5;
            console.log(
                `ML Compare [${idx}/${pairs.length}]: ${leftFile.name} (${(leftScore * 100).toFixed(1)}%) vs ${rightFile.name} (${(rightScore * 100).toFixed(1)}%)`
            );
        }
```

- [ ] **Step 4: Update `applyBulkRating` — record key, re-render in place**

In `media-viewer.js` `applyBulkRating` (~7935): after `await this.saveBulkRatedFile();` (line ~7952) and before the `this.moveHistory.push({...})`, add:

```javascript
        // Suppress re-showing this exact combo (spec G3 D1). Session-only.
        this.bulkRatedPairs.add(this.bulkPairKey(left.name, right.name));
```

Then replace the final `this.nextMedia();` (line ~7969) with:

```javascript
        // Re-render in place, NOT nextMedia(): removing the rated pair from the valid list makes the
        // next pair slide into the current index automatically. An extra index++ would skip one.
        this.showMedia();
```

- [ ] **Step 5: Update `undoBulkRating` — delete the pair key**

In `media-viewer.js` `undoBulkRating` (~3812): after the `for (const f of lastMove.bulkFiles) { ... }` loop and after `await this.saveBulkRatedFile();` (line ~3818), add:

```javascript
        // Re-admit the exact combo so it can reappear at its natural extreme position on re-render.
        this.bulkRatedPairs.delete(this.bulkPairKey(lastMove.bulkFiles[0].name, lastMove.bulkFiles[1].name));
```

- [ ] **Step 5b: Update the EXISTING `applyBulkRating` tests (they break otherwise)**

The existing `describe('applyBulkRating', …)` block (search for it, ~line 1629) breaks with the render change: its `makeCtx` provides `nextMedia` but no `showMedia`/`bulkRatedPairs`/`bulkPairKey`, and one test asserts `nextMedia` was called. Apply these three edits:

1. In that block's `makeCtx` (the object literal it returns), add `showMedia`, `bulkRatedPairs`, and the real `bulkPairKey` alongside the existing `nextMedia`:

```javascript
            nextMedia: vi.fn(),
            showMedia: vi.fn(),
            bulkRatedPairs: new Set(),
            bulkPairKey: extractMethod('bulkPairKey'),
```

2. In the test titled `trains both files as like and records them as good, then advances`, replace the final assertion:

```javascript
        expect(ctx.showMedia).toHaveBeenCalledOnce();
```

(was `expect(ctx.nextMedia).toHaveBeenCalledOnce();` — rename the test title's "then advances" to "then re-renders" too.)

3. Fix the now-stale comment in the `bulk-rating undo reverses ML, returns to the rated pair` test (search for `advanced past the rated pair by applyBulkRating's nextMedia()`, ~line 1535):

```javascript
            mlComparePairIndex: 5, // set high; handleCancel restores prevPairIndex on undo
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS — new tests green; the updated existing `applyBulkRating` tests green; the `bulk-rating undo reverses ML, returns to the rated pair` and hydration tests still green.

- [ ] **Step 7: Format, lint, full unit run**

Run: `npm run format && npm run lint && npx vitest run`
Expected: clean; all unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "$(cat <<'EOF'
feat(g3): wire pair suppression into render, rating, and undo

showCompareMedia reads computeValidComparePairs; applyBulkRating records
the exact pair key and re-renders in place (removing the pair auto-advances
the view, so nextMedia would skip one); undoBulkRating re-admits the key.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Navigation bounds, position count, and lifecycle cleanup

**Files:**
- Modify: `media-viewer.js` — `nextMedia` (`~1271-1273`); `previousMedia` (`~1294-1295`); `updateNavigationInfo` (`~3772-3774`); `removeFileFromList` (after `~1087`); `loadBulkRatedFile` (`~7540`).
- Test: `tests/media-viewer-utils.test.js` (add two tests).

**Interfaces:**
- Consumes: `computeValidComparePairs()`, `bulkPairKey()`, `this.bulkRatedPairs` (Tasks 1-2).
- Produces: navigation and the "Pair X of Y" count are bounded by the valid-pairs length; `removeFileFromList` prunes stale pair keys; `loadBulkRatedFile` resets the set per folder.

- [ ] **Step 1: Write the failing tests**

In `tests/media-viewer-utils.test.js`, add:

```javascript
    it('updateNavigationInfo shows the valid-pairs count as the denominator', () => {
        const updateNavigationInfo = extractMethod('updateNavigationInfo');
        const mediaIndex = { textContent: '' };
        const ctx = {
            isCompareMode: true,
            isSortedByPrediction: true,
            predictionScores: new Map([['/f/a', 0.9], ['/f/b', 0.1]]),
            mediaFiles: [{ name: 'a', path: '/f/a' }, { name: 'b', path: '/f/b' }],
            mlComparePairIndex: 0,
            mediaIndex,
            // 3 valid pairs regardless of the 2-file mediaFiles (stubbed to isolate the denominator)
            computeValidComparePairs: () => [{}, {}, {}],
        };
        updateNavigationInfo.call(ctx);
        expect(mediaIndex.textContent).toBe('Pair 1 of 3');
    });

    it('removeFileFromList prunes bulkRatedPairs keys that reference the removed file', () => {
        const removeFileFromList = extractMethod('removeFileFromList');
        const bulkPairKey = extractMethod('bulkPairKey');
        const gone = { name: 'gone.jpg', path: '/f/gone.jpg' };
        const keep = { name: 'keep.jpg', path: '/f/keep.jpg' };
        const other = { name: 'other.jpg', path: '/f/other.jpg' };
        const ctx = {
            mediaFiles: [gone, keep, other],
            currentIndex: 0,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set([bulkPairKey('gone.jpg', 'keep.jpg'), bulkPairKey('keep.jpg', 'other.jpg')]),
            bulkPairKey,
            saveBulkRatedFile: () => {},
        };
        removeFileFromList.call(ctx, '/f/gone.jpg');
        expect(ctx.bulkRatedPairs.has(bulkPairKey('gone.jpg', 'keep.jpg'))).toBe(false);
        expect(ctx.bulkRatedPairs.has(bulkPairKey('keep.jpg', 'other.jpg'))).toBe(true);
    });
```

**Note:** `removeFileFromList` may reference `this.*` fields beyond those above (per CLAUDE.md it also touches `bulkRated`/`saveBulkRatedFile`). If the call throws on a missing field, add that field to `ctx` as an empty `Map`/no-op until the method runs — do not change the method to suit the test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "valid-pairs count" && npx vitest run tests/media-viewer-utils.test.js -t "prunes bulkRatedPairs"`
Expected: FAIL — denominator still `floor(len/2)` = 1 (not 3); prune not implemented.

- [ ] **Step 3: Update `nextMedia` / `previousMedia` bounds**

In `media-viewer.js` `nextMedia`, replace the `isSortedByPrediction` branch (lines ~1271-1273):

```javascript
            if (this.isSortedByPrediction) {
                const maxPairIndex = Math.max(0, this.computeValidComparePairs().length - 1);
                this.mlComparePairIndex = Math.min(this.mlComparePairIndex + 1, maxPairIndex);
            } else {
```

`previousMedia`'s branch (lines ~1294-1295) keeps its lower bound of 0 — no change needed there (`Math.max(this.mlComparePairIndex - 1, 0)` is already correct). Leave `previousMedia` as-is.

- [ ] **Step 4: Update `updateNavigationInfo` denominator**

In `media-viewer.js` `updateNavigationInfo`, replace lines ~3772-3774:

```javascript
            if (this.isSortedByPrediction && this.predictionScores.size >= 2) {
                const totalPairs = this.computeValidComparePairs().length;
                this.mediaIndex.textContent = `Pair ${this.mlComparePairIndex + 1} of ${totalPairs}`;
            } else {
```

- [ ] **Step 5: Prune `bulkRatedPairs` in `removeFileFromList`**

In `media-viewer.js` `removeFileFromList`, directly after the existing `bulkRated` cleanup (lines ~1085-1087, the `if (this.bulkRated.delete(removedName)) { this.saveBulkRatedFile(); }` block), add:

```javascript
        // A removed/moved file can never re-pair — drop any rated-pair key that references it.
        for (const key of this.bulkRatedPairs) {
            const [a, b] = key.split('\u0000');
            if (a === removedName || b === removedName) this.bulkRatedPairs.delete(key);
        }
```

- [ ] **Step 6: Reset `bulkRatedPairs` per folder in `loadBulkRatedFile`**

In `media-viewer.js` `loadBulkRatedFile` (~7539), directly after `this.bulkRated = new Map();` (line ~7540), add:

```javascript
        this.bulkRatedPairs = new Set(); // session-only; starts empty on each folder load
```

- [ ] **Step 6b: Add `bulkRatedPairs` to the EXISTING `removeFileFromList` test contexts (they break otherwise)**

The prune loop iterates `this.bulkRatedPairs`, so any existing `removeFileFromList` test whose ctx omits it now throws `undefined is not iterable`. Two ctx factories need one line each:

1. `describe('removeFileFromList', …)` → its `createContext` (search for `function createContext`, ~line 306): add after `bulkRated: new Map(),`:

```javascript
            bulkRatedPairs: new Set(),
```

2. `describe('removeFileFromList bulk-rated purge', …)` → its `makeCtx` (~line 1746): add the same line after `bulkRated: new Map([['a.jpg', 'good']]),`:

```javascript
            bulkRatedPairs: new Set(),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS — both new tests green; the two updated `removeFileFromList` blocks green; all prior tests still green.

- [ ] **Step 8: Format, lint, full unit run**

Run: `npm run format && npm run lint && npx vitest run`
Expected: clean; all unit tests pass.

- [ ] **Step 9: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "$(cat <<'EOF'
feat(g3): bound navigation/position count by valid pairs; prune + reset

nextMedia and the "Pair X of Y" count use computeValidComparePairs().length;
removeFileFromList prunes rated-pair keys referencing a removed file;
loadBulkRatedFile resets bulkRatedPairs empty per folder (session-only).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Verification (before opening the PR)

- [ ] **Full unit suite:** `npx vitest run` — all pass (492 baseline + 8-10 new). Record the new count.
- [ ] **Lint + format:** `npm run lint` (0 errors) and `npm run format:check` (clean).
- [ ] **E2E suite (pre-push gate requires it — `media-viewer.js` changed):** `npm run test:e2e` — 55/55 green. No new E2E is added by this plan; the existing compare-mode suite must still pass.
- [ ] **Manual smoke** (`npm start`, AI-sorted compare, ≥6 files with a trained model):
  - [ ] Rate a pair "Both bad" → that exact pair does **not** recur while navigating forward/back.
  - [ ] A file from a rated pair **still appears** paired with a different, un-rated file.
  - [ ] The "Pair X of Y" total **decrements** by one after each bulk-rating.
  - [ ] Rate down until only rated pairs remain → **fall-through** re-shows a pair (re-rating works, no dead end).
  - [ ] `Ctrl+Z`/`Ctrl+A` after a bulk-rating **restores the rated pair** (it reappears; total increments back).
  - [ ] Switch to another folder and back → suppression is **reset** (rated pairs from the prior session no longer suppressed).

---

## Self-Review

**Spec coverage:**
- D1 exact-pair suppression → Task 1 (`computeValidComparePairs` filter), Task 2 (`applyBulkRating` add key). ✓
- D2 session-only → Task 1 (constructor init), Task 3 (`loadBulkRatedFile` reset); no `.bulk_rated.json` change. ✓
- §2 selection helper + fall-through → Task 1. ✓
- §2 `showCompareMedia` reads list → Task 2 Step 3. ✓
- §3 re-render-in-place → Task 2 Step 4. ✓
- §4 navigation bounds → Task 3 Step 3. ✓
- §5 position display → Task 3 Step 4. ✓
- §6 undo deletes key → Task 2 Step 5. ✓
- §7 `removeFileFromList` prune → Task 3 Step 5. ✓
- §8 test plan (retire replica, real-method tests) → Task 1 (full rewrite) + Tasks 2-3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows exact code. The two "Note:" callouts are conditional-guidance for pre-existing test helpers, not deferred work. ✓

**Type consistency:** `bulkPairKey(nameA, nameB): string`, `computeValidComparePairs(): Array<{leftFile, rightFile}>`, `this.bulkRatedPairs: Set<string>` used identically across Tasks 1-3. `pairs[idx].leftFile/.rightFile` matches the object shape produced in Task 1. ✓
