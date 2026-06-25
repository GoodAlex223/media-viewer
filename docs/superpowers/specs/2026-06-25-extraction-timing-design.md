# Group P3 — Feature-Extraction Timing (Lazy / On-Demand): Design

**Date**: 2026-06-25
**Branch**: `feature/extraction-timing`
**Source**: 🔵 User-Flagged — WEEKLY.md Group P3 (Thu, 3 SP); TODO.md Planned 🟠 (promoted 2026-06-18; re-reported during manual testing). Origin BACKLOG 🔵 [2026-05-30] / [2026-06-18].
**Status**: Approved (brainstorm) → ready for implementation plan.

---

## Problem

`loadFolder()` calls `kickoffBackgroundExtractionIfEnabled()` **unconditionally on every folder open**
([media-viewer.js:2536](../../../media-viewer.js#L2536)). That kickoff:

1. inits the feature-worker pool,
2. runs `loadFeatureCache()` — the ~40s streaming parse of `.feature_cache.json` on a 24k folder,
3. loads the ~87 MB CLIP model (cold download on first ever use),
4. extracts 64-dim hand-crafted + 512-dim CLIP vectors for every uncached file.

All of that runs even when the user only wants to browse/rate and never touches an AI feature —
heavily loading the CPU on large folders. The vectors **can't be removed** (AI-prediction sort and
CLIP semantic sort need them) — only **deferred**.

User decision (from the TODO lean, confirmed in brainstorming): *"move it to where it's needed"* →
**pure lazy / on-demand**. No threshold, no settings toggle, no idle delay.

## Who consumes the vectors (the key finding)

| Feature | Vectors needed | Extraction trigger today |
|---|---|---|
| **Sort by Prediction (ML)** | 64-dim (+ 512 CLIP if enabled) | **Already lazy** — checks `uncachedFiles`, calls `startBackgroundFeatureExtraction()` + awaits ([media-viewer.js:7341-7348](../../../media-viewer.js#L7341-L7348)). Does **not** rely on the folder-open kickoff. |
| **CLIP semantic sort** | 512-dim CLIP | **Not lazy** — reads `clipCache`, throws *"wait for background extraction to complete"* if <2 vectors ([media-viewer.js:5221-5225](../../../media-viewer.js#L5221-L5225)). **Relies on the folder-open kickoff.** |
| **Hash similarity sort** (vptree/mst/simple) | none (perceptual hashes computed in its own loop) | Independent of feature extraction. |

So removing the folder-open kickoff is safe **except** that CLIP sort would start erroring. The real
work of this task is giving the CLIP-sort path its own on-demand trigger, mirroring what ML sort
already does. The "when to start" half is just deleting two call sites.

## Decisions (from brainstorming)

- **D1 — Pure lazy.** Remove the unconditional folder-open kickoff entirely. Extraction starts only
  when an AI-dependent feature is first used. (Chosen over threshold / settings-toggle / idle-only.)
- **D2 — CLIP toggle-on is lazy too.** Flipping "Enable CLIP semantic features" **on** in Settings
  just enables the capability; it no longer kicks off extraction. (Reverses the Group C eager-kickoff
  behavior at [media-viewer.js:1944](../../../media-viewer.js#L1944) for consistency with D1.)
- **D3 — The CLIP-sort trigger is conditional.** Because `loadFeatureCache()` re-reads the cache file
  on every fresh call (~40s on 24k — single-flight only coalesces *concurrent* calls, it does not
  cache across calls — [media-viewer.js:6521-6535](../../../media-viewer.js#L6521-L6535)), the trigger
  must fire only when the in-memory `clipCache` is actually missing vectors. Otherwise a repeat CLIP
  sort would needlessly reload the whole cache.
- **D4 — Keep `kickoffBackgroundExtractionIfEnabled` unchanged and reuse it.** Its body already does
  exactly the "ensure features extracted" sequence; only its callers change. Name kept (still
  accurate: "kick off extraction if enabled") to avoid churning its 11 passing unit tests
  ([media-viewer-utils.test.js:562](../../../tests/media-viewer-utils.test.js#L562)).

## Non-goals / scope guardrails

- **Sort by Prediction (ML)** path is left exactly as-is (already lazy).
- **Hash similarity sort** is untouched (needs no vectors).
- **CLIP "restore cached order"** path stays instant: it reorders by saved `sortedPaths` and
  end-appends new files that lack a vector (pre-existing behavior). No extraction trigger is added
  there — only a *full* CLIP re-sort triggers extraction.
- The existing `<2 vectors` error stays as the final safety net (CLIP unavailable / extraction
  failed / genuinely empty).
- No settings UI is added (pure lazy needs none).
- This is the *when-to-extract* decision; it is distinct from the [2026-05-03] extraction-starting
  *visibility* (toast) item, which already shipped.

---

## Changes (3, in 1 file: `media-viewer.js`)

### 1. Remove the folder-open kickoff
Delete the `this.kickoffBackgroundExtractionIfEnabled();` call at
[media-viewer.js:2536](../../../media-viewer.js#L2536) (inside `loadFolder`). Opening a folder now
does zero extraction work and skips the eager feature-cache load. `updateSortPredictionButton()` and
the rest of `loadFolder` are unaffected.

### 2. Make the CLIP toggle-on branch lazy
In the `clipFeaturesToggle` change handler ([media-viewer.js:1908-1946](../../../media-viewer.js#L1908-L1946)),
`this.enableClipFeatures` + its localStorage write already happen **above** the `if/else`. The toggle-**on**
branch (`else`) currently calls `this.kickoffBackgroundExtractionIfEnabled()` — that is the only thing in
the `else`, so **drop the entire `else` branch** (leaving just the toggle-**off** `if`, which reverts
`sortAlgorithm` + deletes the `'clip'` sort cache and is unchanged). No empty block, no lint issue.

### 3. Add a conditional on-demand trigger to the CLIP sort path
Two parts:

**3a. New tiny, pure predicate** (placed near the other feature-cache helpers):

```js
// True when CLIP is enabled and at least one current file lacks an in-memory CLIP vector.
// Gates the lazy extraction trigger so a repeat CLIP sort (vectors already in memory)
// does not needlessly reload the ~40s feature cache.
clipVectorsNeedExtraction() {
    if (!this.enableClipFeatures) return false;
    return this.mediaFiles.some((f) => !this.clipCache.has(f.path));
}
```

**3b. Call it before collecting `clipVectors`** in the CLIP branch of the sort handler
([media-viewer.js:5204-5219](../../../media-viewer.js#L5204-L5219)), right after the
`enableClipFeatures` guard and before the `clipVectors` collection loop:

```js
if (this.clipVectorsNeedExtraction()) {
    // Lazy: produce CLIP embeddings on first semantic sort instead of on folder open.
    // kickoff loads the cache + CLIP model and runs startBackgroundFeatureExtraction() to
    // completion (cancelable progress card; pauses on user activity), then we collect below.
    await this.kickoffBackgroundExtractionIfEnabled();
}
```

`kickoffBackgroundExtractionIfEnabled()` is `async` and internally `await`s
`startBackgroundFeatureExtraction()` (which `await Promise.all(promises)` per batch and resolves only
after all features are ready — [media-viewer.js:8163](../../../media-viewer.js#L8163)), so awaiting
the kickoff genuinely blocks until vectors exist. The existing `vectorCount < 2` check after
collection remains as the safety net for the failure case.

### Behavior of the gate across states (D3)
- **Fresh folder, empty `clipCache`** → `true` → extract (the lazy trigger).
- **Vectors on disk but not yet in memory** → `true` → kickoff `loadFeatureCache()` hydrates them,
  then `startBackgroundFeatureExtraction()` sees all-cached and returns fast.
- **Already fully in memory (repeat sort)** → `false` → skip, sort instantly, no reload.

---

## Testing

**Unit (Vitest):**
- New `clipVectorsNeedExtraction` block (extract-method harness) covering the four cases:
  CLIP disabled → `false`; empty `clipCache` → `true`; partial coverage (one missing) → `true`;
  full coverage → `false`.
- Assert `loadFolder` no longer invokes the kickoff: extend/adjust the existing `loadFolder`
  coverage so a spy on `kickoffBackgroundExtractionIfEnabled` is **not** called on folder load.
- The 11 existing `kickoffBackgroundExtractionIfEnabled` tests stay green unchanged (body untouched).

**Manual smoke (parallel-work hand-off, real 24k folder):**
1. Open the 24k folder → confirm **no** CPU spike, no extraction progress card, no CLIP download.
2. Click **Sort by Similarity** with algorithm = CLIP → extraction starts (toast + progress card),
   completes, folder sorts. Cancel mid-extraction works.
3. Click CLIP sort again → instant, no cache reload, no re-extraction.
4. **Sort by Prediction** still works (already-lazy path unchanged).
5. Hash sort (vptree) still works with zero extraction.
6. Toggle CLIP off→on in Settings → no extraction kicks off until a CLIP feature is used.

## Risks / trade-offs

- **First CLIP/AI sort on a big folder now waits for extraction.** Accepted — explicit cost of lazy;
  mitigated by the existing cancelable progress card and activity-pause gate.
- **No eager pre-warm** for the heavy user who sorts every folder. Accepted per D1; the escape hatch
  (a settings toggle) was explicitly declined.
- Low blast radius: one file, three localized edits, one new pure helper; ML and hash paths untouched.
