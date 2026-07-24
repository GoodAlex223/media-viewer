# Group G3 — Bulk-Rate Re-Pair Avoidance: Design

**Date**: 2026-07-24
**Branch**: `feat/g3-bulk-rate-repair-avoidance`
**Source**: 🔵 User-Flagged — WEEKLY.md Group G3 (solo, 3 SP). TODO 🟠 "Don't pair two already-bulk-rated files together (with fall-through)" (promoted from BACKLOG 🔵 [2026-06-02]; re-reported as BACKLOG 🔵 [2026-07-01] "'Both good/Both bad' reappear"). Re-confirmed during 24k dogfooding.
**Status**: Approved (brainstorm) → ready for implementation plan.

---

## Problem

In AI-sorted compare mode, the "Both good" / "Both bad" bulk-rate buttons let the user correct
mispaired items by rating both files of a pair at once. After a bulk-rating, the two files are added
to `this.bulkRated` (a filename→`'good'|'bad'` Map, used for training re-injection and persisted to
`.bulk_rated.json`) — **but the pair-selection logic never consults it**, so the same two files can
be shown paired together again a pair or two later.

### How pairing works today

[`showCompareMedia`](../../../media-viewer.js#L2996-L3021) re-derives the sorted order on **every
render**: it maps `mediaFiles` → `predictionScores`, sorts descending into `filesWithScores`, then
selects an **"extremes" pair** by `mlComparePairIndex`:

```
pairIndex = min(mlComparePairIndex, floor(n/2) - 1)
leftFile  = filesWithScores[pairIndex]          // i-th highest
rightFile = filesWithScores[n - 1 - pairIndex]  // i-th lowest
```

`mlComparePairIndex = 0` → highest vs lowest, `1` → 2nd-highest vs 2nd-lowest, etc.
[`nextMedia`/`previousMedia`](../../../media-viewer.js#L1269-L1306) just increment / decrement
`mlComparePairIndex` (bounded by `floor(mediaFiles.length / 2) - 1`).

### Why the same pair reappears

Because `filesWithScores` is re-sorted every render, once the model update from a bulk-rating shifts
scores, two just-rated files can drift back to the extremes and re-pair at some index. The fix must
be robust to this reordering — a membership test on the **actual pair being shown**, not a
one-time skip.

### Root cause

`applyBulkRating` ([media-viewer.js:7935](../../../media-viewer.js#L7935)) records the rating and
advances the pair index, but no code excludes an already-rated combination from future selection.
The pair-selection branch has no notion of "already rated together".

---

## Decisions (from brainstorm)

| # | Question | Decision |
|---|----------|----------|
| D1 | **Suppression rule** — both-files-rated, either-file-rated, or exact-same-pair? | **Exact same pair.** Track the specific two-file *combinations* rated together and skip re-showing that exact combo. A rated file may still pair with any other file. (Narrower than the older 2026-05-30 "prefer pairs where neither is rated" idea; matches the reported symptom "*those two files* shown paired again".) |
| D2 | **Persistence** — survive folder reload / restart? | **Session-only, in-memory.** Starts empty on each folder load, survives re-sorts within the same folder session, discarded on folder change / app restart. No `.bulk_rated.json` schema change. The reported symptom is same-session, and after a fresh sort exact pairs rarely recur anyway. |

Because the rule is *exact-pair* and `bulkRated` is *per-file*, a **new piece of state** is required:
a set of rated-pair keys.

---

## Approach

**Chosen — filtered valid-pairs list, cursor indexes into it.** Extract pair generation into a pure
method that builds the extreme-pair candidates, drops any whose exact combo has been rated, falls
through to the full list when all are suppressed, and returns an ordered array. `showCompareMedia`,
navigation, the position count, and undo all read from this one list — a single source of truth,
pure and unit-testable against the *real* code (retires the copied replica in
[ml-pair-selection.test.js](../../../tests/ml-pair-selection.test.js)).

**Rejected alternatives:**
- **Skip-forward from the raw index** — keep `mlComparePairIndex` raw and scan past suppressed pairs
  in the selector. The displayed pair diverges from the raw index, "Pair X of Y" breaks, and the
  skip logic must be duplicated in `nextMedia`/`previousMedia` *and* the selector. Scattered, hard
  to test.
- **Remove rated files from the pool** — conflates suppression with the actual file list; wrong
  semantics (a rated file must stay pairable with fresh files).

---

## Design

### 1. New state — `bulkRatedPairs`

- `this.bulkRatedPairs = new Set()` in the constructor (near `this.bulkRated`,
  [media-viewer.js:130](../../../media-viewer.js#L130)).
- **Key** — canonical, order-independent: `[a.name, b.name].sort().join(String.fromCharCode(0))` (the NUL
  character (code 0) is illegal in filenames on every OS, so it is a collision-free separator).
  Keying on `.name` matches `bulkRated` and `.bulk_rated.json` (filenames are unique within one
  folder).
- A small helper `bulkPairKey(nameA, nameB)` produces the key so callers cannot forget to sort.
- **Reset** — cleared (`this.bulkRatedPairs = new Set()`) in `loadFolder()` alongside the `bulkRated`
  re-hydration ([media-viewer.js:7540](../../../media-viewer.js#L7540) region). Not persisted.

### 2. Selection helper — `computeValidComparePairs()`

Pure, no DOM. Reads `this.mediaFiles`, `this.predictionScores`, `this.bulkRatedPairs`.

```
filesWithScores = mediaFiles.map(f => ({file, score: predictionScores.get(f.path) ?? 0.5}))
                            .sort(desc by score)
candidates = for i in 0 .. floor(n/2)-1:
                 { leftFile: filesWithScores[i].file,
                   rightFile: filesWithScores[n-1-i].file }
valid = candidates.filter(p => !bulkRatedPairs.has(bulkPairKey(p.leftFile.name, p.rightFile.name)))
return valid.length ? valid : candidates          // fall-through when all suppressed
```

The `i < floor(n/2)` bound naturally avoids the `leftIndex >= rightIndex` overlap the current code
guards against, so that safety net is no longer needed inside the selector.

`showCompareMedia`'s AI-sorted branch replaces the inline formula with:

```
const pairs = this.computeValidComparePairs();
const idx = Math.min(this.mlComparePairIndex, pairs.length - 1);
leftFile = pairs[idx].leftFile;
rightFile = pairs[idx].rightFile;
```

(The existing `_restoredPairFiles` undo-restoration path above it is unchanged — it bypasses
selection entirely.)

### 3. `applyBulkRating` — record the pair, re-render without advancing

[media-viewer.js:7935](../../../media-viewer.js#L7935). After the existing per-file `bulkRated.set`
loop and `saveBulkRatedFile()`:

- Add the pair: `this.bulkRatedPairs.add(this.bulkPairKey(left.name, right.name))`.
- Keep the history entry (`bothGood`/`bothBad`, `bulkFiles`, `prevPairIndex: this.mlComparePairIndex`).
- **Replace `this.nextMedia()` with a same-index re-render** (`this.showMedia()`), *not* an
  index-advance.

**Why not `nextMedia()`.** Removing the just-rated pair from the valid list makes the next pair slide
into the current cursor automatically: with stable scores, `validPairs_new[c] === validPairs_old[c+1]`.
An additional `index++` would land on `validPairs_old[c+2]` and **skip** a pair. So the cursor stays
put while rated pairs peel away; the user still sees "the next pair" exactly as before. (Arrow
navigation still advances normally — it removes no pair.)

Edge: if the rated pair was the last valid pair, the shrunk list clamps the cursor back one; if the
list becomes empty, fall-through re-shows the full list (see §6).

### 4. Navigation bounds — `nextMedia` / `previousMedia`

[media-viewer.js:1271-1273](../../../media-viewer.js#L1271-L1273) and
[:1294-1295](../../../media-viewer.js#L1294-L1295). Replace the
`maxPairIndex = floor(mediaFiles.length / 2) - 1` bound with the valid-pairs count:

```
const maxPairIndex = Math.max(0, this.computeValidComparePairs().length - 1);
this.mlComparePairIndex = Math.min(this.mlComparePairIndex + 1, maxPairIndex);  // nextMedia
this.mlComparePairIndex = Math.max(this.mlComparePairIndex - 1, 0);             // previousMedia
```

`previousMedia`'s lower bound is unchanged (0). Recomputing in the navigation handlers is cheap
relative to the per-render sort already performed and keeps a single source of truth; a cached count
is an available optimization but not required.

### 5. Position display — `updateNavigationInfo`

[media-viewer.js:3772-3774](../../../media-viewer.js#L3772-L3774). Change the denominator from
`floor(mediaFiles.length / 2)` to the valid-pairs count:

```
const totalPairs = this.computeValidComparePairs().length;
this.mediaIndex.textContent = `Pair ${this.mlComparePairIndex + 1} of ${totalPairs}`;
```

The total decrements as pairs are rated (reads as "N pairs left to consider"). Because the cursor
stays put on a rating (§3), the leading number holds steady while the total shrinks — acceptable and
arguably clearer than the old counter, which silently re-showed pairs.

### 6. Undo — re-include the pair

[`undoBulkRating`](../../../media-viewer.js#L3812) already reverses the ML updates and deletes both
filenames from `bulkRated`. Add: **delete the pair key from `bulkRatedPairs`**
(`this.bulkRatedPairs.delete(this.bulkPairKey(f0.name, f1.name))` using the two `bulkFiles` names).

`handleCancel`'s bulk branch ([media-viewer.js:3838-3846](../../../media-viewer.js#L3838-L3846))
already restores `mlComparePairIndex = lastMove.prevPairIndex` and re-renders. With the key removed,
the pair re-enters the valid list at its natural extreme position (scores are reverted first via
`requestPredictionScores()`), so restoring the cursor lands on it again — matching the existing
"returns to the rated pair" undo test.

### 7. Cleanup on file removal — `removeFileFromList`

[media-viewer.js:1085-1087](../../../media-viewer.js#L1085-L1087). After the existing
`bulkRated.delete(removedName)`, prune any `bulkRatedPairs` key that contains `removedName`:

```
for (const key of this.bulkRatedPairs) {
    const [a, b] = key.split(String.fromCharCode(0));
    if (a === removedName || b === removedName) this.bulkRatedPairs.delete(key);
}
```

Hygiene: a moved/removed file can never re-pair, so this only bounds the set and avoids a
resurrected-name edge. `removeFileFromList` is the centralized cleanup, so like/dislike/special moves
in compare mode are all covered.

---

## Testing

Extend [ml-pair-selection.test.js](../../../tests/ml-pair-selection.test.js), biasing toward exercising
the **real** `computeValidComparePairs` via the brace-count `extractMethod` harness (mock ctx supplies
`mediaFiles`, `predictionScores`, `bulkRatedPairs`, `bulkPairKey`) rather than a copied replica:

- Rated exact combo is skipped; the next valid pair is selected instead.
- A rated file still pairs with a fresh file (only the exact combo is suppressed).
- **Fall-through**: when every candidate pair is suppressed, the full unfiltered list is returned.
- 2-file boundary: single candidate; if rated, fall-through re-shows it.
- Odd file count: middle file unpaired; bounds hold.
- Undo re-includes the pair (delete key → pair reappears in the valid list).
- `bulkPairKey` is order-independent (`(a,b)` === `(b,a)`).

Bulk-rating undo / persistence / hydration tests in
[media-viewer-utils.test.js](../../../tests/media-viewer-utils.test.js) must stay green (the
`prevPairIndex`-restore and `.bulk_rated.json` round-trip are unchanged).

Manual smoke (AI-sorted compare, ≥6 files): rate a pair "Both bad" → confirm that exact pair does not
recur while navigating; confirm a rated file still appears against fresh files; rate down to
fall-through and confirm re-rating is possible; Ctrl+A restores the rated pair.

---

## Out of scope

- Cross-session persistence of rated pairs (D2 — session-only).
- The stricter "either-file-rated → suppress" rule (D1 — exact-pair).
- `.bulk_rated.json` schema / version change.
- Tournament, single, and similarity-sorted modes — bulk-rate exists only in AI-sorted compare
  (`isCompareMode && isSortedByPrediction && !isTournamentMode`, per
  [updateBulkRateButtonsVisibility](../../../media-viewer.js#L7677)).
- ML-model / convergence behavior (tracked separately in BACKLOG [2026-06-02] "Both bad convergence
  plateau").

---

## Affected files

- [media-viewer.js](../../../media-viewer.js) — `bulkRatedPairs` state + `bulkPairKey` helper;
  `computeValidComparePairs()`; `showCompareMedia` AI branch; `applyBulkRating` (re-render, add key);
  `nextMedia`/`previousMedia` bounds; `updateNavigationInfo` denominator; `undoBulkRating` (delete
  key); `removeFileFromList` (prune); `loadFolder` (reset).
- [tests/ml-pair-selection.test.js](../../../tests/ml-pair-selection.test.js) — suppression,
  fall-through, boundary, undo, key-canonicalization coverage.
