# Design: "Both good / Both bad" corrective-training buttons (AI-sorted compare)

**Date**: 2026-05-31
**Status**: Approved — ready for implementation plan
**Branch**: `feature/re-rate-mode-correction`
**Source**: 🔵 User-Flagged — [BACKLOG.md](../../planning/BACKLOG.md#L60) (2026-05-30 manual-testing intake); [WEEKLY.md](../../planning/WEEKLY.md#L20) Group 0, part 1 (compare), 5 SP
**Scope**: Compare mode only. The tournament-override half of Group 0 ("part 2") is a separate design/branch and is explicitly **out of scope** here.

---

## 1. Summary

In AI-sorted compare mode, add two buttons — **👍 Both good** and **👎 Both bad** — that let the user correct cases where the AI paired two files of similar quality (the "extremes" pairing assumes best-vs-worst, but sometimes both are good or both are bad). Each click feeds **both** currently displayed files into the ML model as full-strength training examples (good → two `like` updates, bad → two `dislike` updates) **without moving any files**. Corrections are recorded in a durable per-folder `.bulk_rated.json` so they survive the model rebuilds that happen on CLIP toggle / folder-config change / model version bump. Bulk-rated files are otherwise treated exactly like ordinary files — no marker, no badge, no special pair-selection logic.

## 2. Goals / Non-goals

**Goals**
- One-click corrective training on the current compare pair, in either direction.
- Corrections that **persist** across sessions and survive ML model rebuilds.
- Reversible via the existing undo (Ctrl+A).
- Zero special treatment of bulk-rated files in the viewing/pairing experience.

**Non-goals (explicitly dropped or deferred)**
- ❌ **Pair-selection suppression** of already-rated pairs — dropped (see §7). Treat bulk-rated files as regular files.
- ❌ **Live re-sort / re-rank on click** — the model update influences *future* predictions; the current sorted order does not reshuffle under the user.
- ❌ **Visual marker / badge** on bulk-rated files.
- ❌ **Tournament-mode correction** — that is Group 0 part 2, separate branch.
- ❌ Visibility in single mode, tournament mode, or Similarity-sorted compare.

## 3. UX & shortcuts

### Buttons
- Two buttons added to `.compare-controls` ([index.html:204](../../index.html#L204)), grouped adjacent to `#cancelBtnCompare` ([index.html:210](../../index.html#L210)), reusing the existing `.control-btn` styling.
- **Visibility**: shown only when `this.isSortedByPrediction === true && this.isCompareMode === true`. A single helper `updateBulkRateButtonsVisibility()` centralizes show/hide and is invoked from `showCompareMedia()` and from mode/sort transitions (entering/exiting compare, applying/clearing AI sort, `switchToSingleModeUI`).
- **Toast feedback**: on click, `showNotification('👍 Both files marked good (model updated)', 'success')` / `'👎 Both files marked bad (model updated)'` — type-driven duration (~2 s), matching existing rating UX.

### Shortcut layout (final)
The new buttons require freeing a key, so the compare home-row cluster becomes **A / S / D / F = prev / next / good / bad**. For cross-mode consistency, `next` moves `D`→`S` in **single mode too**, so `D` never means "next" anywhere.

`DEFAULT_SHORTCUTS` ([media-viewer.js:4](../../media-viewer.js#L4)) final state:

| Mode | previous | next | like / dislike | bothGood | bothBad | other |
|------|----------|------|----------------|----------|---------|-------|
| single | `KeyA` | `KeyS` *(was KeyD)* | `KeyQ` / `KeyW` | — | — | undo `Ctrl+KeyA` |
| compare | `KeyA` | `KeyS` *(was KeyD)* | Q/W/E/R | `KeyD` | `KeyF` | undo `Ctrl+KeyA` |
| tournament | — | — | Q/W/E/R | — | — | unchanged |

- New `ACTION_LABELS` entries for `bothGood` / `bothBad` (help-overlay + remap UI render from these).
- `executeAction()` gains `bothGood: () => this.handleBothGood()` and `bothBad: () => this.handleBothBad()`.
- `buildReverseMap()` already enumerates `compare` and `single`, so no mode-list change is needed; defaults are customizable through the existing remap UI.

## 4. State & persistence

### In-memory
- `this.bulkRated = new Map()` — `filename → 'good' | 'bad'`. A file is in **at most one** bucket; re-rating the other direction overwrites (`Map.set`). Initialized in the constructor next to the other ML state ([media-viewer.js:~392](../../media-viewer.js#L392)).

### On disk — `.bulk_rated.json` (per source folder)
```json
{ "version": 1, "good": ["a.jpg", "b.png"], "bad": ["c.gif"] }
```
- **Filenames, not absolute paths** (folder-relative, portable; stale-pruning is by membership in the current `mediaFiles`).
- **Source of truth**: the persisted bucket is authoritative. Live model updates are best-effort immediate feedback; every model rebuild reconciles the model back to this record (§6).

### IPC (new) — mirrors the tournament-state handlers
- [main.js](../../main.js): `readBulkRatedFile(folderPath)` and `writeBulkRatedFile(folderPath, data)`, copied structurally from `readTournamentState` / `writeTournamentState` ([main.js:243-266](../../main.js#L243-L266)). `readBulkRatedFile` returns `{ success: true, data: null }` on `ENOENT`.
- [preload.js](../../preload.js): expose both on `window.electronAPI`, mirroring [preload.js:48-49](../../preload.js#L48-L49).

### Hydration
- In `loadFolder()`, after the cache-clear block (`featureCache.clear()` etc.), reset `this.bulkRated = new Map()`, then `readBulkRatedFile(baseFolderPath)` and rebuild the Map, **silently pruning** any filename no longer present in `mediaFiles`. If pruning changed the set, write back the pruned file.

## 5. Bulk-rate action flow — `handleBothGood()` / `handleBothBad()`

Both call a shared `applyBulkRating(bucket)` where `bucket ∈ {'good','bad'}`:

1. **Guard**: return early unless `isSortedByPrediction && isCompareMode` and both `this.compareLeftFile` and `this.compareRightFile` are set.
2. **Train**: for each of the two displayed files, `await this.updateMlModelAfterRating(file.path, bucket === 'good' ? 'like' : 'dislike')`. (No-ops safely if a file's features aren't cached — but when AI sort is active they are, since scoring required them.)
3. **Record**: `this.bulkRated.set(name, bucket)` for both files; `await this.writeBulkRatedFile(baseFolderPath, serialized)`.
4. **Undo entry**: push **one** `moveHistory` entry tagged `bothGood: true` / `bothBad: true`, carrying both files as `{ name, features }` (combined 576-dim via `getCombinedFeatures`), mirroring the existing `mlFeatures` / `compareMode` history pattern.
5. **Toast**: success notification (§3).
6. **Advance**: move to the next pair via the existing next-pair path (`mlComparePairIndex + 1`, the same logic `next` uses). Files are **not** moved, so the inward sweep simply steps one pair deeper.

## 6. Undo, cleanup & model-rebuild survival

### Undo (Ctrl+A)
`handleCancel()` ([media-viewer.js:~3476](../../media-viewer.js#L3476)) gains a new branch **at the top**: if the popped entry is tagged `bothGood` / `bothBad`, then for both stored files call `reverseMlModelUpdate(features, actionType)`, delete both names from `this.bulkRated`, re-save `.bulk_rated.json`, toast, and **return** — there is no file move to reverse (this is what distinguishes it from the existing move-based undo branches).

### Cleanup on real move
`removeFileFromList()` ([media-viewer.js:~1023](../../media-viewer.js#L1023)) gains `this.bulkRated.delete(name)` alongside the other cache deletes, plus a re-save. So an explicit like/dislike/special move of a previously bulk-rated file purges its now-redundant correction. (Stale-pruning on next load is the backstop for external moves.)

### Model-rebuild survival — the reason `.bulk_rated.json` exists
The model cache `.ml_model.json` is **per-folder** ([media-viewer.js:6413](../../media-viewer.js#L6413)) and rating updates are debounce-saved to it ([media-viewer.js:6253](../../media-viewer.js#L6253)), so corrections survive a plain folder reopen (retraining is skipped when the loaded model is already "ready", [media-viewer.js:7187](../../media-viewer.js#L7187)). **But** the model is rebuilt from scratch on CLIP toggle, like/dislike-folder change (`resetMlModel`), and dim/version bump (`deleteMlModelCache`, [media-viewer.js:6212](../../media-viewer.js#L6212)). A rebuild runs `trainFromHistoricalRatings()`, which trains **only** from the like/dislike folder contents ([media-viewer.js:6881-6945](../../media-viewer.js#L6881-L6945)) — and bulk-rated files never enter those folders. Storing the record inside `.ml_model.json` would not help, because that file is wiped exactly when a rebuild begins. Therefore the record must be an independent file.

**Integration**: `trainFromHistoricalRatings()` gains a third pass after the like/dislike walk and before the `trainHistorical` post: for each `name → bucket` in `this.bulkRated`, resolve the current-folder file, build its combined 576-dim features (`getCombinedFeatures`, or compute on miss as the folder walk does), and append to `likedFeatures` / `dislikedFeatures`. Corrections thus re-apply on every rebuild.

## 7. Why no pair-selection suppression (design rationale)

The AI-compare pairing is **extremes**: pair `i` = `(filesWithScores[i], filesWithScores[N-1-i])` for `i` in `0 … floor(N/2)-1` ([media-viewer.js:~2719-2744](../../media-viewer.js#L2719)). These pairs are **disjoint** — within one inward sweep, each file appears in exactly one pair. Because bulk-rating does **not** remove files, advancing the pair index never re-shows a bulk-rated file within the same sweep. The soft-suppression-with-fall-through the BACKLOG floated would add real complexity (it perturbs the `leftIndex`/`rightIndex` math) to solve a problem the disjoint pairing already avoids. It is dropped; bulk-rated files are treated as ordinary files. (User-confirmed: "treat these medias like regular posts, without any special markings and relations.")

## 8. Edge cases

- **Features not yet extracted**: the immediate `updateMlModelAfterRating` no-ops, but the `.bulk_rated.json` entry persists and is applied at the next rebuild. Practically rare — the buttons are visible only when AI sort is active, which implies scores (hence features) exist.
- **Re-rating the same pair** (same direction): additive training — strengthens the signal (matches BACKLOG "iterative correction").
- **Toggling a file good→bad**: live updates accumulate (both fed); the persisted bucket records the latest direction; the next rebuild reconciles the model to the latest bucket. Documented, accepted.
- **Re-rate then undo**: undo reverses the latest click and removes the file from its bucket; it does **not** restore a previously overwritten bucket. Rare; self-consistent ("undo removes my correction"). Possible future refinement: store prior bucket in the history entry.
- **Odd file count / single file in pair**: guard on both `compareLeftFile` and `compareRightFile` being set; no-op otherwise.
- **Stale entries on load**: filenames absent from current `mediaFiles` are pruned silently (and written back if changed).

## 9. Testing plan

**Unit** ([tests/media-viewer-utils.test.js](../../tests/media-viewer-utils.test.js)) — use `extractAsyncMethod`/`extractMethod` per existing conventions:
- `applyBulkRating` records both files in the correct bucket and posts two ML updates.
- Bucket move good↔bad overwrites (one bucket only).
- Undo branch reverses both updates and clears both buckets.
- `removeFileFromList` purges a bulk-rated file from the Map.
- Persistence round-trip: serialize → `writeBulkRatedFile`; hydrate via `readBulkRatedFile` with stale-prune of a removed filename.
- `trainFromHistoricalRatings` re-injects bulk-rated examples into the liked/disliked arrays.
- Shortcut defaults: `single.next === 'KeyS'`, `compare.next === 'KeyS'`, `compare.bothGood === 'KeyD'`, `compare.bothBad === 'KeyF'`; no key collisions within a mode.

**E2E** ([tests/e2e/compare-mode.test.js](../../tests/e2e/compare-mode.test.js)):
- AI-sort → enter compare → click **Both good** → toast appears + advances to next pair → buttons hidden after switching to single mode.
- Reload folder → `.bulk_rated.json` re-applied (entry present).
- Press `Ctrl+A` → correction undone (file removed from record).

**Keyboard-shortcuts** ([tests/keyboard-shortcuts.test.js](../../tests/keyboard-shortcuts.test.js)): update assertions for the remapped `next` default and the two new actions.

## 10. Affected files

| File | Change |
|------|--------|
| [media-viewer.js](../../media-viewer.js) | `this.bulkRated` state; `applyBulkRating`/`handleBothGood`/`handleBothBad`; `updateBulkRateButtonsVisibility`; `loadBulkRatedFile`/`saveBulkRatedFile` helpers; hydrate in `loadFolder`; undo branch in `handleCancel`; purge in `removeFileFromList`; re-inject pass in `trainFromHistoricalRatings`; `DEFAULT_SHORTCUTS` (single+compare `next`, compare `bothGood`/`bothBad`); `ACTION_LABELS`; `executeAction` wiring |
| [index.html](../../index.html) | Two buttons in `.compare-controls` near `#cancelBtnCompare` |
| [styles.css](../../styles.css) | Reuse `.control-btn`; minimal grouping if needed |
| [main.js](../../main.js) | `readBulkRatedFile` / `writeBulkRatedFile` IPC handlers |
| [preload.js](../../preload.js) | Expose both IPC channels |
| [tests/media-viewer-utils.test.js](../../tests/media-viewer-utils.test.js) | Unit coverage (§9) |
| [tests/e2e/compare-mode.test.js](../../tests/e2e/compare-mode.test.js) | E2E coverage (§9) |
| [tests/keyboard-shortcuts.test.js](../../tests/keyboard-shortcuts.test.js) | Updated shortcut defaults |

## 11. Alternatives considered

- **Soft-suppression with fall-through** (BACKLOG original) — rejected; disjoint extremes pairs make it unnecessary and it adds index-math risk (§7).
- **Model-cache-only persistence** (no `.bulk_rated.json`) — rejected; corrections silently vanish on the first model rebuild because rebuilds train only from like/dislike folder contents, which never include bulk-rated files (§6).
- **Storing bulk-rated list inside `.ml_model.json`** — rejected; that file is cleared on reset, exactly when the record is needed for re-injection.
- **Keep `D = next`, put good/bad elsewhere** — rejected by user in favor of the A/S/D/F cluster with `D = Both good`.

## 12. Open questions

None — all resolved during brainstorming (suppression dropped, persistence kept, shortcut layout finalized, advance-after-rate confirmed).
