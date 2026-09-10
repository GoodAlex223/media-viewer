# ML Training Pipeline — Design Pass + Retrain Skip

**Status**: Approved (design) — implementation not started
**Date**: 2026-09-10
**Group**: G1 (Weekly plan Sep 7–11, 2026) 🏆
**Branch**: `g1-ml-training-pipeline`
**Sources**: TODO.md 🟠 _"Don't re-train likes/dislikes model when only the source folder changed"_ (promoted 2026-08-28); BACKLOG 🔵 `### [2026-08-28]` — change-detection re-report, per-folder granularity, `feature_cache.json` vector reuse, _"Discuss: drop online per-rating updates, retrain per AI-sort request"_, tournament tiers as ordinal labels, file-size weighting.

---

## 1. Problem — measured, not inherited

The root cause recorded in TODO.md and in the WEEKLY.md group note is **wrong**, and the correction changes the design. Both assert that `resetMlModel()` runs on every folder change and is what re-arms `trainFromHistoricalRatings()`.

Measured against `media-viewer.js` at `357800d`:

| Asserted | Measured |
| --- | --- |
| `resetMlModel()` runs on every folder change (5 call sites) | Its five call sites are like-folder browse (`:461`), dislike-folder browse (`:477`), like-folder clear (`:491`), dislike-folder clear (`:504`) and the CLIP toggle (`:1979`). **None is a source-folder change.** |
| `loadFolder()` clears ML state | `loadFolder()` (`:2578`) clears `perceptualHashes`, `featureCache`, `clipCache`, `featureMetadata` and `predictionScores` (`:2652–2656`) and resets `isSortedByPrediction`. It leaves `mlStats` and `mlModelState` intact and posts no `reset` to the worker. |

### 1.1 The actual mechanism — a scope mismatch

- The retrain gate is `if (!this.mlStats?.isReady)` (`media-viewer.js:8124`).
- `isReady` is `positiveCount >= 3 && negativeCount >= 3` (`ml-model.js:195`).
- The trained model is persisted to `.ml_model.json` **inside `baseFolderPath` — the source folder** (`loadMlModel` `:7028`, `saveMlModel` `:7052`).
- Its training data comes from `customLikeFolder` / `customDislikeFolder`, which are **global `localStorage` settings**, plus the current source folder's bulk-rated files.

So a model trained from globally-configured folders is cached per source folder. Opening a source folder that has never been AI-sorted finds no `.ml_model.json`, starts a fresh worker model, `isReady` is false, and the app re-extracts and retrains a **byte-identical training set**.

`loadMlModel()` runs only in the lazy-init branch (`:8082–8086`), so within one session a source switch does *not* retrain — it silently carries folder A's model into folder B and then writes that copy into `B/.ml_model.json`, so the per-folder copies diverge.

### 1.2 The inverse defect, found during this design pass

Once a folder's `.ml_model.json` exists with ≥3/≥3, `mlStats.isReady` is true on load and `trainFromHistoricalRatings()` is **never called in that folder again** — no matter how many files are added to the like or dislike folders. Today the only channel by which new historical ratings reach the model in an already-sorted folder is the online per-rating update.

This is why the fingerprint below is not merely an optimisation: it is what makes dropping the online updates safe. It fixes staleness in both directions — retrain exactly when the training set changed, skip entirely when it did not.

### 1.3 Cost asymmetry that shapes the whole design

Per training file, extraction is an image decode + optional `ffprobe` + optional face detection + a CLIP ONNX inference — tens of milliseconds, so a 1,000-file like folder costs minutes. Training on already-extracted vectors is 576 dims × 3–10 epochs × N samples of multiply-add — well under a second at N = 1,000.

**The expensive thing is extraction, not training.** Cache vectors; treat training as cheap.

### 1.4 Model defects that block a correct cache

- `trainFromHistorical` (`ml-worker.js:68`) never calls `model.reset()`. It runs `trainBatch` **on top of existing weights**, so a file removed from the like folder can never be unlearned.
- `trainBatch` (`ml-model.js:171`) calls `update()` once per sample **per epoch**, and `update()` increments `positiveCount`/`negativeCount` (`:77`). So `positiveCount` is likes × epochs, not likes. The "ML trained: N likes, M dislikes" toast and the "Need more ratings" message both report inflated numbers, and `isReady` trips at 3/epochs real files.
- `adaptiveLR = 0.1 / (1 + totalSamples * 0.0001)` (`ml-model.js:103`) with `totalSamples` never reset across retrains, so a long-lived model file slowly degrades "retrain" into "barely learn".
- `trainBatch` shuffles with `Math.random()`, so training is not reproducible.

---

## 2. Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| **D1** | **Drop the online per-rating model updates.** The model is rebuilt from cached vectors on each AI-sort request. | Makes the model a pure, reproducible function of its training set. Nothing durable is lost: rated files move into the like/dislike folders and bulk-rated files are re-injected, so both are recovered by the next rebuild — which § 1.2's fingerprint now guarantees happens. Reaps five open lifecycle defects by construction. |
| **D2** | **Cache training vectors per training folder** in `.feature_cache.json`, reusing the existing v4 format, staleness rule, streaming IO and atomic write. | Extraction is the cost (§ 1.3). The machinery already works on hundreds of MB. Per-folder granularity falls out as per-file cache hits, so the "skip the likes folder when only dislikes changed" request needs no separate mechanism. |
| **D3** | **Cache the trained model keyed by a training-set fingerprint**, in app data — not per source folder. | A repeat sort across sessions then skips the vector load too. The model's identity follows its training set, which is the correction § 1.1 demands. |
| **D4** | **The cached model is rebuilt from cached vectors — there is no "historical base + per-source bulk deltas" layer.** The bulk-rated set is a fingerprint input. | Answers the WEEKLY open question. A deltas layer would reintroduce the warm-start problem of § 1.4: state that accumulates and cannot be unlearned. |
| **D5** | **New logic lands in a new ES module**, `ml-training.js`, following the v2.0 pattern. | Plan-level constraint. `media-viewer.js` grew 224 lines during a Cleanup Week; this moves ~150 out and seeds MLManager. |
| **D6** | **Keep `showMlLearningIndicator`, repurposed**: fire once per sort reporting what the model was trained on, instead of once per rating. | User decision, 2026-09-10. The counts become truthful for the first time once D7 lands. |
| **D7** | **Fix `trainFromHistorical` to reset before training, and seed the shuffle from the fingerprint.** | The cache's correctness depends on training being a pure function of its inputs. Also fixes the inflated counts and the never-resetting LR decay of § 1.4. |

---

## 3. Architecture

### 3.1 Module boundary

New pure-ESM `ml-training.js` exporting **`MlTrainingManager`** — stateful manager class with constructor-injected host callbacks, matching `FullscreenManager` / `TournamentManager`.

**Owns**: training-set assembly (scanning the like/dislike folders, resolving bulk-rated examples), the training-set descriptor and fingerprint, the training-vector caches, and the model-cache hit/miss decision.

**Does not own**: sort orchestration or the progress card — `handleSortByPrediction` and `updateSortProgress` stay in the renderer, preserving the single-owner `finally` that CLAUDE.md documents; worker plumbing; the extraction primitives.

Injected callbacks:

| Callback | Purpose |
| --- | --- |
| `loadFolder(path)` | Directory scan IPC; supplies `name`, `size`, `mtimeMs` |
| `computeFeatures(path, fileInfo)` | 64-dim hand-crafted extraction |
| `extractClipEmbedding(path)` | 512-dim CLIP embedding, or `null` |
| `trainModel(liked, disliked)` | Posts `trainHistorical`, resolves on `trainComplete` → `{ modelState, stats }` |
| `loadModelState(modelState)` | Posts `init` with a cached model, resolves on `initComplete` |
| `onProgress({ phase, current, total })` | Routed to `updateSortProgress` by the caller |
| `getConfig()` | `{ customLikeFolder, customDislikeFolder, enableClipFeatures }` |
| `getBulkRatedContext()` | `{ bulkRated, mediaFiles, featureCache, clipCache }` for the source-folder half |

The `featureCache` / `clipCache` handed to `getBulkRatedContext()` are the **source folder's** maps, and reading them here is correct and is not a violation of § 4.1: bulk-rated files *are* source-folder files, so their vectors legitimately live there. § 4.1 forbids the opposite direction — writing *training-folder* vectors into those maps.

### 3.2 Public interface

```js
await mlTraining.ensureTrainedModel({ signal, onProgress })
// → { source: 'session' | 'model-cache' | 'trained', stats, descriptor }
```

This replaces the `!this.mlStats?.isReady` gate at `media-viewer.js:8124`. Resolution order:

1. **`session`** — the in-memory fingerprint matches what the live worker was last trained on. No IO, no training.
2. **`model-cache`** — the fingerprint matches a persisted model. Load the weights; no vector load, no training.
3. **`trained`** — load cached vectors, extract only files that miss or are stale, train from scratch, persist.

Moved out of `media-viewer.js`: `trainFromHistoricalRatings`, `trainFromHistoricalRatingsAndWait`, `collectBulkRatedTrainingExamples`.

---

## 4. Training-vector cache

Each training folder gets its own `.feature_cache.json` — same v4 format, same `size`/`mtime` staleness rule, same streaming reader/writer, same atomic rename. The main-process IPC (`feature-cache-open` / `-chunk` / `-close` / `-write-open` / `-write-chunk`, `main.js:467–540`) already takes an arbitrary `filePath`; only the renderer methods hardcode `baseFolderPath`. Parameterising them is the refactor, and it belongs to the new module.

### 4.1 Isolation — the data-loss constraint

Training vectors live in the manager's **own** Maps. They must never be written into `this.featureCache` / `this.clipCache` / `this.featureMetadata`.

Sharing those maps would make the source folder's 30 s auto-save persist like-folder entries into the source folder's `.feature_cache.json`, while the load-time prune (which drops any entry not in `mediaFiles`) deletes them again on the next load — churn on a file that reached 259 MB before rounding.

Consequences:

- Each cache carries its own shrink-guard baseline, the per-cache equivalent of `_featureCacheDiskCount` (`media-viewer.js:7331`). This is the guard that caught the real 23,559-entry → 32-entry overwrite; it is per-cache or it is nothing.
- Each cache resolves its own `size`/`mtime`. An entry whose stat cannot be resolved is **skipped, not written** — `size: 0` / `mtime: 0` never matches a real stat, so writing it poisons the entry permanently (`buildEntry`, `media-viewer.js:7357`).
- The main-process streaming reader keeps a **single global handle**. Every load — source folder and training folders alike — goes through the existing `_acquireCacheIoLock` (`media-viewer.js:7096`).

### 4.2 Per-folder granularity

Automatic. Changing only the dislikes folder leaves every likes-folder file a per-file cache hit, so only the changed folder's new or modified files are extracted. No independent change-tracking is needed.

---

## 5. Fingerprint and model cache

### 5.1 The descriptor

The fingerprint is computed from a single declared `TrainingSetDescriptor`. Nothing outside the descriptor may reach training — that is what makes an unfingerprinted input structurally impossible rather than merely discouraged.

| # | Input | Why |
| --- | --- | --- |
| 1 | Like folder path + per-file `(name, size, mtime)` | The training set itself |
| 2 | Dislike folder path + per-file `(name, size, mtime)` | The training set itself |
| 3 | Bulk-rated examples actually used: `(name, bucket, size, mtime)` for entries present in the current source folder | `collectBulkRatedTrainingExamples` filters to files still in `mediaFiles`; only those enter training |
| 4 | `enableClipFeatures` | With CLIP off, vectors are 576-dim with a zero top half — a different model |
| 5 | `ML_MODEL_VERSION` (`ml-model.js:5`), `FEATURE_CACHE_VERSION` (`media-viewer.js:7090`), `FEATURE_VERSION` (`feature-extractor.js:5`), `TRAINING_CONFIG_VERSION` | Model shape, cache format, extractor semantics, and hyperparameters/epoch schedule respectively. `TRAINING_CONFIG_VERSION` is **new**: declare it in `ml-model.js` beside `ML_MODEL_VERSION`, export it on the same object, and bump it whenever the learning rate, regularisation, epoch schedule or class-weight rule changes. |

**How the renderer obtains these four values** (refined while writing the plan, 2026-09-10). `ml-model.js` and `feature-extractor.js` are both `importScripts`-loaded into workers and cannot be imported by the renderer, so re-declaring their constants in `ml-training.js` would be a fourth copy governed only by convention. Instead each value is **reported by the code that owns it**:

- `ML_MODEL_VERSION` and `featureDim` — already carried by the worker's `initComplete` reply (`ml-worker.js:271`); the renderer's `initComplete` handler captures them.
- `TRAINING_CONFIG_VERSION` — declared in `ml-model.js` beside `ML_MODEL_VERSION` (where the hyperparameters live), exported, and echoed in `initComplete` alongside them.
- `FEATURE_VERSION` — `feature-worker.js` already answers `getVersion` with `{ version, dim }` (`:23`); the renderer probes once when the feature pool initialises and stores the result.
- `FEATURE_CACHE_VERSION` — read directly from the `MediaViewer.FEATURE_CACHE_VERSION` static.

No constant is duplicated, so none can drift.

**`FEATURE_VERSION` is listed separately on purpose.** The comment at `media-viewer.js:7089` asserts that `FEATURE_CACHE_VERSION` "must match `FEATURE_VERSION` in feature-extractor.js" — measured 2026-09-10, they are **4 and 2**. The documented invariant is false, so `FEATURE_CACHE_VERSION` cannot be trusted to move when the 64-dim extractor's semantics change; a changed extractor would otherwise leave both the cached vectors and the cached model valid-looking and silently stale. Fingerprinting both constants directly is the control; reconciling the two constants (or deleting the false comment) is filed separately and is **not** a prerequisite for this work.

### 5.2 Storage

App data, via a dedicated `read-ml-model-cache` / `write-ml-model-cache` IPC pair mirroring `writeTournamentState` (`main.js:272`): write `.tmp`, then `fs.rename`, so a crash mid-write cannot leave a torn file. LRU over the last 5 fingerprints; one entry is ~5 KB.

The descriptor summary is persisted beside the weights so that a wrong cache hit is diagnosable after the fact rather than only reproducible.

### 5.3 Controls against a silently stale model

This is approach B's one real risk: a fingerprint that misses an input serves a stale model and nothing complains. A written rule does not execute, so the controls are structural:

1. **Structural** — training reads the descriptor, not ambient state, so an input absent from the descriptor cannot influence the model at all.
2. **Tested** — a table-driven unit test with one case per declared input, asserting the fingerprint changes when that input changes. An input added without a case is visible as a missing row.
3. **Diagnosable** — the persisted descriptor summary (§ 5.2).
4. **Escapable** — a "Rebuild model" control in the Settings panel (F1) that drops the model cache and forces a rebuild on the next sort.

### 5.4 Determinism

`trainBatch` seeds its shuffle from the fingerprint (D7), so the same training set produces the same weights. This makes a cache hit verifiable — the cached model is the model a rebuild would produce — and makes the unit tests deterministic.

---

## 6. Deletions

| Deleted | Sites |
| --- | --- |
| `updateMlModelWithFeatures` | `:8218` + callers `:1461`, `:5473`, `:5476`, `:8320` |
| `reverseMlModelUpdate` | `:8380` + callers `:3962`, `:4114`, `:4117`, `:4188`, `:4191`, `:4233` |
| Deferred-refresh protocol | `_beginDeferredCompareRefresh` (`:8248`), `_cancelDeferredCompareRefresh`, `pendingCompareRefresh`, `pendingCompareUpdates`, `pendingCompareTimeout`, and the three arm sites (`:4001`, `:5534`, `:8357`) |
| Per-source-folder model file | `loadMlModel` (`:7028`), `saveMlModel` (`:7052`), `deleteMlModelCache` (`:7069`) and their call sites `:6792`, `:6803`, `:6834`, `:6870`, `:8086` |
| Worker/model update paths | `ml-worker.js` `update` (`:289`) and `reverseUpdate` (`:301`) cases, `reverseUpdateModel` (`:129`); `ml-model.js` `reverseUpdate` (`:127`) |

### 6.1 Must NOT be deleted

- **`mlFeatures` on `moveHistory` entries.** It looks like it exists only for model reversal, but `restoreFeatureCachesFromHistory` splits that same 576-dim vector back into `featureCache(0..64)` + `clipCache(64..576)` on every undo. Removing it silently breaks undo's cache restoration.
- **`ml-model.js` `update()`.** `trainBatch` is built on it.
- **`requestPredictionScores` / the `scoreComplete` handler.** Scoring still runs after training to produce `predictionScores` for badges and pair selection. Only `scoreComplete`'s deferred-window branch goes.
- **`mediaNavigationInProgress`.** It keeps its navigation-mutex role. This is why the per-window-token BACKLOG entry becomes *moot* rather than *fixed*.

### 6.2 Existing `.ml_model.json` files

Left in place. Nothing reads or writes them after this change. Deleting a user's files to tidy up is not worth the risk, and `deleteMlModelCache()` never deleted anything anyway — it wrote `''`, since no `deleteFile` IPC exists.

### 6.3 BACKLOG entries this closes

| Entry | Outcome |
| --- | --- |
| `scoreComplete` with `scores: null` never clears the window | Reaped — protocol deleted |
| `moveComparePair` arms `2` while discarding both post results | Reaped — protocol deleted |
| `pendingCompareUpdates` invariant documented but unenforced | Reaped — protocol deleted |
| `_applyModeSwitch` never cancels an open window (wrong-pair render under tournament chrome) | Reaped — protocol deleted |
| `mlWorker.onerror` does not cancel the window (guaranteed 3 s freeze) | Reaped — protocol deleted |
| `mediaNavigationInProgress` needs a per-window token | Moot — the flag regains a single owner |
| Late `scoreComplete` writes old scores onto a new folder's same-named files | Narrowed to sort-time scoring only; remains open, re-scoped |

---

## 7. Degraded modes and error handling

### 7.1 CLIP enabled but unavailable — the one that matters

`enableClipFeatures` in the fingerprint does **not** cover this: the setting is on, so the fingerprint says "CLIP model", while the vectors have a zero top half. That is the same corruption class G4 closes this week, reached through the cache. Two rules close it by construction:

- A vector extracted with no CLIP result is cached with `clipVector: null`, **never zeros**, so the existing `!hasClip` re-extract filter heals it on the next run.
- The descriptor records `clipCoverage` — the fraction of training vectors carrying a real CLIP half. If coverage is incomplete while `enableClipFeatures` is true, the model is **trained but not cached**, and the user is notified. Degraded operation stays supported; a degraded model never becomes a cache hit.

### 7.2 Everything else

| Condition | Behaviour |
| --- | --- |
| Like or dislike folder unset | Early return, as today (`media-viewer.js:7653`) |
| A training folder will not scan | Report; train on whatever is available |
| Cancel / abort mid-run | Signal-checked at every loop and phase boundary; no partial `trainHistorical` message is ever sent (unchanged) |
| Model-cache read failure or malformed entry | Treated as a miss |
| Model-cache write failure | Logged via `window.electronAPI.logError`; the sort continues |
| Vector-cache write failure | Logged; vectors stay in memory for the session |

---

## 8. UI changes

- **`showMlLearningIndicator` (D6)** fires once per sort rather than once per rating: `🧠 Trained on 412👍 380👎` after a rebuild, `🧠 Model reused — 412👍 380👎` on a cache hit. Auto-dismiss stays. The counts are truthful only because D7 resets before training.
- **Progress phases** become `Loading training vectors…` → `Processing likes: i/n` (only for files actually being extracted) → `Processing dislikes: i/n` → `Processing corrective ratings` → `Training model…`. All route through `updateSortProgress`, so the sort card and its Cancel survive every phase.
- **Settings panel (F1)** gains a "Rebuild model" control (§ 5.3).
- **Removed**: the per-rating learning indicator flash and the up-to-3 s navigation pause after rating in compare mode.

---

## 9. Testing

### 9.1 Unit — `ml-training.js`

- Fingerprint: table-driven, **one case per declared descriptor input** (§ 5.1), each asserting the fingerprint changes when that input changes.
- Descriptor completeness: assert the descriptor's key set equals the declared schema, so an input added without a fingerprint case fails.
- Cache resolution: `session` hit, `model-cache` hit, miss, stale-by-`mtime`, stale-by-`size`.
- Per-folder granularity: changing the dislikes folder leaves every likes-folder entry a hit.
- **Isolation**: after a training run, no training-folder path appears in `featureCache`, `clipCache` or `featureMetadata`.
- Per-cache shrink guard: a drastically smaller in-memory map does not overwrite a populated on-disk cache.
- `clipCoverage` gating: incomplete coverage with CLIP on trains but does not cache.

### 9.2 Unit — worker and model

Depends on G4's `tests/ml-worker.test.js` harness landing first, as the week's schedule already sequences.

- `trainHistorical` resets before training (a second train on the same set yields the same counts, not doubled).
- `positiveCount` / `negativeCount` equal the real sample counts, not likes × epochs.
- Seeded shuffle: the same training set produces identical weights across runs.

### 9.3 E2E

1. A source-folder switch after a warm model does **not** re-enter the training phase.
2. A **changed like folder does** re-enter it. This is the one that proves retraining was not simply disabled — per § 1.2 this path does not work today, so it is new behaviour rather than a regression guard.

Every RED test is verified to fail against unfixed code before it counts as coverage. A test that passes before the fix is zero coverage, not weak coverage.

---

## 10. Recorded decisions — not implemented here

- **Tournament tiers as ordinal training labels** — deferred. The descriptor design makes tier examples a fourth input later; a genuine ordinal head in `ml-model.js` (cumulative-link over the same 576-dim input) is its own project, not a rider on this one. The BACKLOG entry is annotated with this decision, not closed.
- **File-size weighting in the AI sort** — confirmed **outside the model**, as a post-hoc composite sort key over existing `scores`. A size feature inside the model cannot guarantee the "smaller is better" direction and cannot be toggled without retraining. The BACKLOG entry is annotated, not closed.

---

## 11. Documentation to update at closeout

- `CLAUDE.md` § State Management — the `resetMlModel()` bullet, which currently describes the online-update protocol and the deferred-compare-refresh contract.
- `CLAUDE.md` § Architecture — add `ml-training.js`; § Async Patterns — remove the deferred-compare-refresh paragraph; § Cache Management — add the training-vector caches and the model-cache key.
- `CLAUDE.md` L157's `pendingCompareUpdates` invariant — delete; the protocol it governs no longer exists.
- `PROJECT.md` if it asserts the module list.
- `docs/README.md` — index this spec.
- The seven BACKLOG entries of § 6.3 and the two of § 10, each annotated with its outcome in the closeout commit.

---

## 12. Re-verification commands

Every factual claim above was measured at `357800d`. To re-check before implementing:

```bash
# § 1: resetMlModel call sites — expect 461, 477, 491, 504, 1979 (none in loadFolder)
grep -n "resetMlModel()" media-viewer.js

# § 1.1: model cache is per source folder
grep -n "ml_model.json" media-viewer.js

# § 1.1: the retrain gate
sed -n '8124,8126p' media-viewer.js

# § 1.4: trainFromHistorical does not reset; trainBatch increments counts per epoch
sed -n '68,100p' ml-worker.js
sed -n '171,190p' ml-model.js

# § 4: the cache IPC already takes an arbitrary path
grep -n "feature-cache-open\|feature-cache-write-open" main.js

# § 6: the deletion surface
grep -n "updateMlModelWithFeatures\|reverseMlModelUpdate\|_beginDeferredCompareRefresh" media-viewer.js
```

---

## 13. Superseded during implementation (dated 2026-09-10, closeout of Task 10)

This is a frozen design doc — implementation is recorded here as corrections, not silent rewrites.
Four claims above diverged from what shipped. Three were caught and ruled on during per-task
review; the fourth (§ 5.2's "LRU") was caught during the Task 10 fix round. This section
propagates those rulings back into the spec text they correct.

**§ 7.1 — the descriptor does not record `clipCoverage`, by deliberate ruling, not omission.**
The text above says "The descriptor records `clipCoverage`." It does not, and the controller ruled
against adding it (Task 5 review): fingerprinting CLIP coverage would make every partial-CLIP
state key differently — a run with 99% of training files carrying a real CLIP half and a run with
100% coverage would never share a cache entry, and the 5-slot model cache would thrash between
near-identical fingerprints instead of ever settling on one. The shipped control is narrower and
more conservative: `enableClipFeatures` stays in the descriptor (input 4, unchanged), and coverage
is enforced procedurally instead — `cacheable` (`ml-training.js`'s `ensureTrainedModel`) is `false`
whenever CLIP is on and any training row lacks a real CLIP half, so the model is **trained but not
cached** rather than served as a false cache hit. A degraded run is therefore distinguishable only
by the gate firing (and its accompanying user-facing notify), never by a dedicated key — which is
sufficient, because the gate now covers all three row sources (like folder, dislike folder,
bulk-rated) plus the session tier, not only the disk cache the original text implied.

**§ 8 — the shipped progress phases do not match the text above in two respects.** "Loading
training vectors…" is never emitted; the first phase actually posted is `'Checking training
set…'` (`ensureTrainedModel`'s very first `onProgress` call), and a per-folder vector load has no
dedicated phase label of its own — it happens silently inside `_collectFolderVectors` before that
function starts reporting. Separately, `'Processing likes: i/n'` (and dislikes) is **not** "only
for files actually being extracted" as stated: `_collectFolderVectors` calls `onProgress` once per
file in the loop regardless of whether that file was a cache hit or needed re-extraction, so the
counter advances through every file in the folder, not only the ones costing CLIP inference. The
same is true of `'Processing corrective ratings'` in `_collectBulkRatedVectors`. The phases that
are genuinely emitted, in order, are: `'Checking training set…'` → (`'Loading cached model…'`, on
a model-cache hit only) → `'Processing likes'` (per-file, all files) → `'Processing dislikes'`
(per-file, all files) → `'Processing corrective ratings'` (per-file, all resolved bulk-rated
entries) → `'Training model…'`. All still route through `updateSortProgress`, so the sort card and
its Cancel button survive every phase exactly as designed — only the phase *labels and triggering
condition* differ from this section's original text.

**§ 7.2 — a vector-cache write failure does not leave vectors "in memory for the session."** The
table above says a vector-cache write failure is "Logged; vectors stay in memory for the session."
In the shipped implementation, the `entries` `Map` built and mutated inside `_collectFolderVectors`
(via `_loadVectorCache` and the per-file extraction loop) is a **local variable**, scoped to that
one call — `MlTrainingManager` keeps no persistent in-memory vector cache of its own across calls
(only `sessionFingerprint`/`sessionStats` persist on the instance). When `_saveVectorCache` fails
(shrink guard, a thrown IO error, or a failed `writeChunk`/`writeClose`), the freshly-extracted
vectors are logged and then discarded along with the rest of `entries` once `_collectFolderVectors`
returns — the next call re-extracts everything that was not already durably on disk before the
failed save. The "logged" half of the table row is accurate; the "stays in memory for the session"
half is not.

**§ 5.2 — the model cache is not true LRU.** The text above says "LRU over the last 5
fingerprints." The shipped `_readCachedModel` (`ml-training.js`) is a pure `.find()` over the
stored entries — a cache **hit** never reorders or touches the list. Only `_writeCachedModel`,
reached solely on a rebuild (both the session and model-cache tiers having missed), prepends the
new/rewritten entry and slices to `MODEL_CACHE_LIMIT`. Eviction is therefore by write-recency, not
access-recency: an entry served repeatedly from the session or model-cache tier but never
rewritten is not protected from eviction the way genuine LRU (which refreshes recency on every
hit) would protect it. Caught during the Task 10 fix round, not during implementation review;
inconsequential at five slots for a single-user desktop app, but the wording
asserted a mechanism the code does not have.
