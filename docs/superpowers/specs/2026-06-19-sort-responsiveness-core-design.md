# Sort Responsiveness Core (Large-Folder Perf, PR1 of 3) — Design Spec

**Date**: 2026-06-19
**Status**: Approved
**Source**: WEEKLY.md Group P1 (🏆 🔵, nominally 5 SP) ← TODO.md Planned 🔴 ← BACKLOG 🔵 [2026-06-18] manual-testing intake ("speed these up first"). Also closes BACKLOG 🟤 [2026-05-24] (`insertNewFilesInSortedOrder` event-loop yielding).
**Branch**: `feature/sort-responsiveness-core`

---

## Context & decomposition

Group P1 asked to speed up AI / visual-similarity sorting on 24 000+ file folders. During
brainstorming the scope was widened (user choice) to **all three slowness sources**, under a
hard constraint: **sort quality must not change**. That combination is a multi-day, multi-PR
effort (~13–21 SP), so it was decomposed into three independently-shippable sub-projects
(Approach A — staged, no neighbor-graph parallelization):

| PR | Sub-project | Status |
|----|-------------|--------|
| **PR1 (this spec)** | **Sort responsiveness core** — progress/cancel UX + O(n²) MST-fallback fix + `insertNewFilesInSortedOrder` yielding + dead-code removal | active |
| PR2 | Hash computation off the renderer main thread (worker + bounded concurrency) | future spec |
| PR3 | Incremental feature-cache load (~40s blocking → streamed batches); closes BACKLOG 🟤 [2026-05-26] | future spec |

PR2 and PR3 are **out of scope here** (see §8). The progress component built in PR1 is the
shared surface that PR2/PR3 later feed their phases into.

## Problem

On a 24 000-file folder, visual-similarity sorting (and, indirectly, AI-prediction sorting)
is slow **and opaque**. Mapping where the time and the *freezes* actually come from:

| Source | Where | In PR1? |
|--------|-------|---------|
| Neighbor-graph build, `K = min(N−1, max(20, ⌊√N·10⌋))` ≈ **1,550 @ 24k** | `sorting-worker.js` (worker thread) | **No** — quality-locked floor; runs off-main-thread so it doesn't freeze, just takes time |
| **O(n²) greedy-traversal fallback** — "scan *all* files for nearest unvisited" when the MST walk gets stuck | `sorting-worker.js` (worker thread) | **Yes** — §2 |
| Cold-cache **hash computation** decodes + `blockhash` on the **renderer main thread**, awaited sequentially per file | `media-viewer.js` `computePerceptualHash` + loop | No — **PR2** (biggest freeze for hash sorts) |
| Feature-cache load blocks ~40s before AI/CLIP sort can begin | `main.js` / `media-viewer.js` | No — **PR3** |
| `insertNewFilesInSortedOrder` O(M·N) on the renderer main thread (cache-hit re-sort) | `media-viewer.js` | **Yes** — §3 |
| Progress is a **text-only toast**; no determinate bar; no progress during cache-load | `media-viewer.js` `updateProgressNotification` | **Yes** — §1 |
| ~330 lines of **dead** renderer sort methods (superseded by the worker) | `media-viewer.js` 5834–6167 | **Yes** — §4 |

The user-reported pain (from the clarifying questions): **app fully freezes**, **progress is
text-only / unclear**, and **no progress during cache-load**. Cancel itself works — it just
can't register while the main thread is blocked.

## Decisions (user-approved)

1. **Broadest scope, staged (Approach A), decomposed into 3 PRs.** This spec is PR1.
2. **Sort quality must not change** — no neighbor cap (no K-cap), same neighbor graph, same
   MST. The **only** permitted output deviation is tie-break order among **exactly-equal-distance**
   files in the rare global-jump fallback (a consequence of Decision 4); this is not a
   similarity-quality change.
3. **Progress UI = Option C** — grow the *existing* bottom-right progress notification into a
   **determinate** card (phase label + bar + counts/% + Cancel). Chosen over a centered modal
   (A) and a bottom-docked bar (B) for consistency with where sort progress already appears.
4. **MST-fallback fix = `vpTree.findNearest(current, traversed)`** — replace the O(n²) linear
   scan with the existing exact-NN query; accept the rare tie-break difference on the hash path.

## 1. Progress component — determinate, cancelable (Option C)

The existing `updateProgressNotification(message)` ([media-viewer.js:1435](../../media-viewer.js#L1435))
already creates a **reusable** `.notification info` glass card (primary-blue left border,
bottom-right container) holding a single `.progress-message` span, torn down by
`clearProgressNotification()`. PR1 **extends this same component** — no new top-level element.

**New API (renderer):**

```js
updateSortProgress({ phase, current, total })   // phase: string; current/total: numbers or null
```

- Reuses `this.progressNotification` (same element/lifecycle as the text path).
- Renders, inside the card: the **phase** text, a **`.progress-track` > `.progress-fill`** bar,
  a **counts/%** line (`"12,400 / 24,000 · 52%"`), and a **Cancel** button (styled like
  `.notification-action`).
- **Determinate** when `total > 0` (fill width = `current/total`); **indeterminate** (animated
  stripe, no %) when `total` is null/0 (e.g. cache-load before counts are known).
- Cancel button → `this.sortAbortController?.abort()` (same abort path as today's relabeled
  Sort button; the relabel is retained, the new button is the discoverable affordance).
- `clearProgressNotification()` already nulls + removes the element on complete/error/abort —
  unchanged. The plain text `updateProgressNotification(message)` stays for non-sort callers.

**Feeding it:**

- `runSortingWorker`'s `'progress'` handler ([media-viewer.js:5797](../../media-viewer.js#L5797))
  currently discards `current`/`total` from the worker message — route them into
  `updateSortProgress`. The worker **already** posts `{type:'progress', message, current, total}`
  (`sorting-worker.js` `updateProgress`), so no worker-protocol change is required for the
  worker phases.
- Renderer-side phases call `updateSortProgress` directly: hashing already has `processed/total`
  ([media-viewer.js:5492](../../media-viewer.js#L5492)); cache-load uses indeterminate mode for now.

**CSS (`styles.css`):** add `.notification-progress`, `.progress-track`, `.progress-fill`
(primary gradient `#0078d4→#3399ff`, subtle glow + indeterminate-shimmer keyframe), reusing
existing design tokens. The Cancel button reuses `.notification-action` styling.

**Honest limitation (documented, not hidden):** during the **cold-cache hashing** phase the
renderer main thread is still blocked (decode + `blockhash` per file), so the bar will not
animate and the Cancel click will not register *until that phase yields* — that phase moves
off-thread in **PR2**. In PR1 the bar + cancel are responsive during the **worker** phases
(graph/MST/traversal) and the now-yielding `insertNewFilesInSortedOrder` loop.

## 2. Worker O(n²) MST-fallback fix (quality-preserving)

Both worker sorts — `sortMediaBySimilarityMST` (hash, [sorting-worker.js:435](../../sorting-worker.js#L435))
and `sortMediaBySimilarityClip` (CLIP, [sorting-worker.js:596](../../sorting-worker.js#L596)) —
end with a greedy MST traversal. When the walk gets **stuck** (current node's MST-neighbors are
all visited), it finds the global nearest **unvisited** node via a **full O(n) linear scan of
all files** ([sorting-worker.js:725-737](../../sorting-worker.js#L725-L737) and the hash twin at
[564-575](../../sorting-worker.js#L564-L575)). This fires up to O(n) times → **O(n²)**.

**Change:** replace each linear scan with the already-present, already-tested
`vpTree.findNearest(current, traversed)` (the VP-tree is built earlier in the same function;
its `excludeSet` semantics are unit-tested at [tests/sorting-worker.test.js:109-123](../../tests/sorting-worker.test.js#L109-L123)).

**Why output is identical (with one caveat):** `findNearest` is an *exact* nearest-neighbor
structure using the *same* `distanceFunc` and excluding the *same* `traversed` set. When the
nearest unvisited node is **unique**, the returned node is identical to the linear scan.

**Caveat — ties:** the linear scan breaks distance ties by array order (first strict-min wins);
`findNearest` breaks them by tree-traversal order. So when ≥2 unvisited files sit at the
**exactly equal** minimum distance, the chosen file may differ.
- **CLIP** (float cosine): ties essentially never occur → effectively bit-identical.
- **Hash** (integer Hamming): ties do occur → the byte-exact order *within the rare fallback*
  may differ, but every candidate is *equally similar*, so similarity quality is unchanged.
This is the only deviation permitted under Decision 2/4.

**Do NOT** convert Prim's loop into a spanning forest (restarting from an unvisited node when
the PQ empties). That *would* change which nodes are reachable via neighbor-walk vs. global-jump
and therefore change the ordering — a real quality change. Left as-is.

**Worst-case note:** near the end of a traversal, `findNearest` with a large exclude set can
still approach O(n) for that call; the *typical* stuck-count and exclude-set sizes make this far
better than the linear scan in practice. Bounding the theoretical worst case (e.g. a shrinking
candidate structure) is out of scope — the goal here is the typical-case win with identical
output, not a new asymptotic guarantee.

## 3. `insertNewFilesInSortedOrder` event-loop yielding (closes BACKLOG 🟤 2026-05-24)

The cache-hit re-sort path ([media-viewer.js:6365](../../media-viewer.js#L6365)) scores each new
file against every sorted position (O(M·N)) on the renderer main thread, with abort checks only
on the **outer** loop. For large batches this freezes the UI (and blocks the new Cancel button).

**Change:** in **both** branches (CLIP and hash), add a yield every ~25 outer iterations:
`if ((i + 1) % 25 === 0) await new Promise((r) => setTimeout(r, 0));`. Pure scheduling change —
**output is byte-identical** (insertion math untouched). Lets the progress card paint and the
Cancel click register. The existing per-outer-iteration abort check is retained.

## 4. Delete dead renderer sort methods (~330 lines)

`sortMediaBySimilarity` ([5834](../../media-viewer.js#L5834)), `sortMediaBySimilarityVPTree`
([5917](../../media-viewer.js#L5917)), and `sortMediaBySimilarityMST` ([5992](../../media-viewer.js#L5992))
are **never called** — the worker path (`runSortingWorker` → `sorting-worker.js`) superseded
them, and grep confirms zero `this.sortMediaBySimilarity*(` call sites and **zero test
references** (only `insertNewFilesInSortedOrder` and the *worker's* `sortMediaBySimilarityClip`
are tested). Delete the contiguous block 5834–6167.

**Keep:** `calculateHammingDistance`, `calculateCosineDistance` (still used by
`insertNewFilesInSortedOrder` and elsewhere), `runSortingWorker`, `handleSortBySimilarity`,
`loadHashCache` (immediately after the deleted block).

## 5. Testing

24 000-file folders cannot be E2E-fixtured (see WEEKLY "Testing reality"). Verification:

- **§2 fallback (unit, the quality guard):** characterization test running a small fixture
  through `sortMediaBySimilarityMST` / `sortMediaBySimilarityClip` and asserting the
  VP-tree-fallback output **equals the prior linear-scan output** on a **tie-free** fixture
  (proves identical); a second test documenting/asserting the tie behavior on a deliberately
  tied Hamming fixture. Add `sortMediaBySimilarityMST` worker coverage (today only Clip is tested).
- **§3 yielding (unit):** existing `insertNewFilesInSortedOrder` tests stay green; add an
  assertion that output is unchanged with yielding (and abort still throws).
- **§1 progress (unit/DOM):** test `updateSortProgress` builds the bar/counts/cancel and toggles
  determinate vs. indeterminate; Cancel invokes `sortAbortController.abort`. Optional E2E on the
  tiny fixture: trigger a sort → progress card appears → completes → card removed; Cancel aborts.
- **§4 deletion:** full `npm test` + `npm run lint` stay green after removal.
- **Manual hand-off (required before checking off the TODO/WEEKLY item):** smoke on the user's
  real 24k folder — no freeze during worker phases, bar advances, Cancel is prompt on worker
  phases, and spot-checked ordering matches pre-change.

## 6. Error handling & edge cases

- Progress card is removed via `clearProgressNotification()` on every exit path (cache-hit
  success, fresh-sort success, and the error/abort catch) of `handleSortBySimilarity`; worker
  `onerror` and `{type:'error'}` paths still surface the existing bottom-right error toast.
- `< 2` files, abort mid-phase, and worker crash behave as today (the abort throw message stays
  `'Sorting cancelled by user'` — consistent with the rest of the file).
- Indeterminate→determinate transition: if `total` becomes known mid-operation, the next
  `updateSortProgress` call switches the bar to determinate.

## 7. Files affected

| File | Change |
|------|--------|
| `media-viewer.js` | Add `updateSortProgress`; route worker `current`/`total` + renderer phases into it; wire Cancel; §3 yields in both `insertNewFilesInSortedOrder` branches; delete dead methods 5834–6167 |
| `sorting-worker.js` | §2 fallback: linear scan → `vpTree.findNearest(current, traversed)` in both MST + CLIP sorts |
| `styles.css` | `.notification-progress` / `.progress-track` / `.progress-fill` + indeterminate-shimmer keyframe; Cancel-button styling |
| `tests/sorting-worker.test.js` | §2 characterization + tie tests; MST coverage |
| `tests/media-viewer-utils.test.js` | §3 yielding/no-output-change assertion |
| (optional) `tests/e2e/*.test.js` | progress-card appear/cancel/clear smoke on tiny fixture |

## 8. Out of scope (future PRs)

- **PR2** — move `computePerceptualHash` decode + `blockhash` off the renderer main thread
  (worker via `createImageBitmap`/OffscreenCanvas) with bounded concurrency + cancel, feeding
  the §1 progress component. This is what makes the **hashing** phase non-freezing/cancelable.
- **PR3** — incremental `.feature_cache.json` serving (stream batches main→renderer) so AI/CLIP
  sorts start as batches arrive; feeds the §1 progress component with a determinate cache-load
  phase. Closes BACKLOG 🟤 [2026-05-26].
- **Workstream #7** — parallelize the neighbor-graph build across a worker pool (the only
  raw-speed lever under the no-quality-change rule). Deferred pending measurement after PR1–PR3.
- **Any K-cap** / neighbor-count change — explicitly excluded by Decision 2.

## 9. Risks

- **Hash tie-break deviation (§2):** mitigated by the characterization tests + explicit user
  approval (Decision 4). CLIP unaffected.
- **Dead-code deletion misses a dynamic reference (§4):** mitigated by grep + green test suite +
  manual smoke (no dynamic dispatch exists in this codebase for these names).
- **Progress-card layout/interaction:** it lives in the existing `notificationContainer`
  (`pointer-events` already handled per-notification); verify the Cancel button is clickable and
  the card doesn't crowd the stack — covered by the §1 DOM test + manual smoke.

## 10. Verification checklist

- [ ] `npm test` green (incl. new §2/§3 tests)
- [ ] `npm run lint` + `npm run format:check` clean
- [ ] §2: characterization test proves identical output on tie-free fixture; tie test documents hash behavior
- [ ] §1: progress card shows phase + determinate bar + counts/% + working Cancel; indeterminate mode works
- [ ] §3: `insertNewFilesInSortedOrder` output byte-identical with yielding; abort still throws
- [ ] §4: dead methods removed; no remaining references
- [ ] Manual: 24k-folder smoke — no freeze on worker phases, bar advances, Cancel prompt, ordering matches pre-change
