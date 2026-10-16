# G3 Source-Folder CLIP Reuse on a Training-Cache Miss — Design Spec

**Task Reference**: WEEKLY.md Oct 12–16 § G3 (🔵, 3 SP → **~4 SP**, see § 11) ← BACKLOG 🔵 [2026-10-04] "Explain and trim the retrain that runs after files are moved into the like folder outside the app", item **(3)** only. Items (1) (both training caches re-read in full on every rebuild) and (2) (the source folder scored twice per rebuild) are the 🟤 entries tagged on it and stay out.
**Created**: 2026-10-13
**Status**: Approved by the user 2026-10-13, brainstormed section by section (decisions D1–D6, § 3). Written spec approved 2026-10-13. **Redirected** the same day (note below); only § 7 shipped.
**Branch**: `g3-source-vector-reuse` (from `main` @ `c2673c4`, after G2's closeout)
**Trial vehicle**: none — the group already carries a user dependency (§ 8).

> **Redirected (2026-10-13).** The measure-first before run (§ 8) found that CLIP on the moved files costs at most 1.2 s of a 119.8 s sort. It also found that every sort retrains, because every training-folder video fails `computeFeatures` and a failed file blocks the model cache. The user re-scoped G3 to that cause: see [2026-10-13-g3-training-video-extraction-design.md](2026-10-13-g3-training-video-extraction-design.md). Under this spec, only § 7's instrumentation shipped (`713af35`). Task 2's `departedClips` + `_lookupSourceClip` is parked, unmerged and unreviewed, on the local branch `g3-departed-clips-parked` @ `e11b36e`. Task 3 was dropped. F1 carries over to the new spec as R5; F2 and F3 travel with the parked branch (R6).
>
> **Post-implementation note (2026-10-16, PR #80, merge `bf6fcad`).** The successor spec shipped, and acceptance was met. Of this spec, only § 7's perf log is on `main`, and G3 amended its format to add `failed=N noClip=N`. Both plans are archived: [this one](../../archive/plans/2026-10-13_g3-source-clip-reuse.md) and [its successor](../../archive/plans/2026-10-13_g3-training-video-extraction.md). The parked Task 2 is BACKLOG 🟤 [2026-10-16] "Decide the parked source-CLIP reuse branch". Revisit it only if a measurement shows CLIP on moved or rated files matters.

---

## 1. Goal

When a file whose vectors the source folder already holds turns up in a training folder — moved there in Explorer, or rated in the app — the next AI-sort rebuild should not run CLIP on it again. Measure first: time each rebuild phase into the perf log, have the user run the sort on their real `Liked_2` → `Liked_3` folders before and after the change, and accept on those two log lines.

The user's report (BACKLOG, 2026-09-15): after moving a couple of files from `Liked_2` to `Liked_3` in Explorer, the next sort's like/dislike processing ran "10× faster or more, but still took some time." The rebuild is correct — the like folder's file list is in the training-set fingerprint — and part of its remaining cost is that each moved file is extracted from scratch although `Liked_2`'s own `.feature_cache.json` held its vectors. The same cost hits every in-app rating: each rated file is a training-cache miss on the next sort, which in G2's like-or-skip loop means every re-sort.

## 2. Findings that shaped the design

### 2.1 An Explorer move preserves `mtime` (the WEEKLY's "first check")

Probed 2026-10-13 through Explorer's own move engine (`Shell.Application.Namespace(dst).MoveHere(file)`, same volume): `fs.statSync` reported `mtimeMs 1709626272345.679, size 200` before and after — identical, sub-millisecond part included. In-app moves are `fs.rename` only (`main.js` `move-file`; no cross-device fallback), which preserves `mtime` by definition. This machine has a single volume (`C:`), so a cross-volume Explorer move is unprobed; the user's real run (§ 8) is the final check, and the near-miss log line (§ 7) would show a mismatch directly.

### 2.2 The source folder's 64-dim vectors are not what a training rebuild computes

The BACKLOG entry's premise — "fill a training-cache miss from the source folder's vector" — assumes the source vector equals what extraction would produce. For the 576-dim row's **64-dim half it does not**:

- The manager extracts through the host's `computeFeatures` (`media-viewer.js:8575`), which builds full file metadata — size, video flag, format, real width/height, ffprobe video info, face detection — and passes it to `extractFeatures`.
- Every **source-folder** vector skips that metadata. The worker pool is posted pixels only (`media-viewer.js:9911-9919` → `feature-worker.js:59`, `extractFeatures(imageData, metadata || {})`), and the displayed-media path calls `extractFeatures(imageData)` bare (`media-viewer.js:9401`). `computeFeatures` has exactly one caller: the manager's injected callback (`media-viewer.js:205`).
- So dims 42–47 (aspect ratio, resolution bucket, file size, is-video, is-PNG, is-animated) and 54–61 (faces, video duration/fps/audio/bitrate/motion) are constants in source vectors and real values in training vectors (`feature-extractor.js:114-190`).

The **512-dim CLIP half is equivalent** on both sides: background extraction and the manager both call the same `extractClipEmbedding(path)` (videos via `extractClipFromVideo`, JXL via `decodeJxl`; the `_imageData` argument is ignored).

Consequence: reusing the full source vector would make a training row depend on the file's history, and a from-scratch rebuild would produce a different model than a reuse-assisted one under the **same fingerprint** — breaking the determinism claim of the ML pipeline design (`2026-09-10-ml-training-pipeline-design.md` § 5.4).

The same mismatch is a **pre-existing train/score skew**: the model trains on metadata-rich vectors and scores metadata-less ones. Verified as a mechanism; its effect on prediction quality is not measured. Not G3's to fix — filed as follow-up F1 (§ 10).

### 2.3 Where a moved file's CLIP vector survives

| After… | In-memory source maps | Source `.feature_cache.json` on disk | Training cache |
| --- | --- | --- | --- |
| an Explorer move between sessions | gone — the load's `ingest` prunes entries whose file is not in the folder (`media-viewer.js:8297`) | **still there** until the next save; moves never set `featureCacheDirty`, only extraction does | miss |
| an Explorer move while the app is open | **still there** — the folder is not rescanned | still there | miss |
| an in-app move (like/dislike/special/pair/G2 batch) | purged by `removeFileFromList` (`media-viewer.js:1429-1432`) | still there until an extraction-triggered save | miss |

The disk copy is the only one that survives a restart, and the host already streams every entry of it on load — then discards the departed ones. Capturing them at that point costs nothing extra to read.

## 3. Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | **Reuse the CLIP half only.** The 64-dim half is always computed with `computeFeatures`. | § 2.2: the CLIP half is equivalent, the 64-dim half is not. The training row stays exactly what a rebuild would produce (modulo the 6-decimal rounding every cached vector already gets). CLIP is the expensive half — a video costs 20 ffmpeg keyframes plus 20 CLIP passes. Rejected: B (reuse both — bakes the skew into training rows, breaks § 5.4); C (fix the skew first — invalidates every source cache, a full re-extraction of a 24k folder, well beyond 3 SP; recorded as F1). |
| D2 | **A session-only host map of departed CLIP vectors**, fed at source-cache load and by `removeFileFromList`, plus a lookup of the live `clipCache`; read by the manager through one new callback. | Rejected: walking `moveHistory[].mlFeatures` + re-streaming the source cache on a miss (a full re-read costs ~40 s at 24k, more than extracting a few files; history has 3+ entry shapes and records no `mtime`; the disk entry is gone after the next save). Rejected: stop pruning departed entries from the source cache file (changes the save path and the shrink guard's baseline — the code that lost 126 MB in PR #64 — and needs an expiry the v4 format cannot express without a version bump). |
| D3 | **Timings go to the perf log** (`media-viewer-perf.log`, `logPerf`), not the session log, and **stay permanently** (one line per sort, one per `ensureTrainedModel` call). | WEEKLY wrote "session log", but the renderer reaches the session log only at `warn`/`error` level (`logger.js:232`), and the perf log is where real-run timings already go (`_logSlowPhase`). Agreed with the user 2026-10-13. |
| D4 | **Cap the map at 5,000 entries** (~10 MB), oldest evicted, one perf-log line the first time the cap is hit. | The map holds only files that left the folder since the last save — normally a handful. The cap bounds the pathological case (most of a large folder deleted externally) at no cost to the common one. |
| D5 | **Cleared on folder change**, in `loadFolder` beside `featureCache`/`clipCache`/`featureMetadata`. | Every other per-folder cache is folder-scoped; keeping it across folders would be correct (the match is content identity) but is a second lifecycle to reason about for a rare gain. |
| D6 | **The lookup is consulted only when CLIP is on.** | With CLIP off, a training row's CLIP half is zeros today (`extractClipEmbedding` returns `null`); reusing a real CLIP vector into a CLIP-off model would make it differ from a rebuild. |

## 4. Components

### 4.1 Host: `this.departedClips` (`media-viewer.js`)

`Map<filename, { clip: Float32Array(512), size, mtimeMs }>` — CLIP vectors whose file has left the source folder this session. Declared in the constructor beside `clipCache`. Never written by the manager; never persisted; never read by the source cache's save path, so it cannot reach `.feature_cache.json` or inflate `_saveFeatureCacheLocked`'s shrink-guard denominator (`featureCache.size`).

All additions go through one helper, `_rememberDepartedClip(name, entry)`: validates (`clip.length === 512`, `size > 0`, `mtimeMs > 0` — a zero stat never matches a real one, the same rule as the cache writers), re-inserts the name at the end (delete-then-set, so the newest is last), evicts the oldest while over `DEPARTED_CLIP_LIMIT = 5000`, and logs the first eviction of the session.

**Feed 1 — source-cache load (`_loadFeatureCacheLocked`).** In `ingest`, an entry whose file is not in the folder — today `if (!currentFile) return;` — is staged into a local `freshDeparted` map when it carries a 512-dim CLIP vector and a non-zero stat. `commitFresh()` merges `freshDeparted` into `departedClips` through the helper, alongside the existing commit of the other maps. A cancelled load returns before `commitFresh` and stages nothing (the same rule that protects the other caches); the version-mismatch path discards the file and captures nothing; the legacy single-read fallback clears `freshDeparted` with the other staging maps before rebuilding. Both the streaming path and the fallback go through `ingest`, so both feed it. Entries pruned for **staleness** (file present, stat changed) are not captured.

**Feed 2 — `removeFileFromList(filePath)`.** Before the `clipCache`/`featureMetadata` deletes, if `clipCache` holds a vector for the path and `featureMetadata` holds its `{ size, mtime }`, remember it under the file's name with that stat — exactly the entry the source cache's own save would have written for it, so an in-app move is equivalent to "saved, then moved in Explorer." No metadata or no CLIP vector → nothing is remembered. One site covers every removal: likes, dislikes, special moves, compare-pair moves and G2's batch dislike (also missing-file and tournament removals, which are harmless — the entry is only ever matched by name + size + mtime).

**Undo** leaves the entry in place: it still describes the same bytes, and a second move overwrites it.

### 4.2 Host: `_lookupSourceClip(file)` (`media-viewer.js`)

Pure read. For a training-folder file `{ name, size, mtimeMs }`:

1. `departedClips.get(name)` — a match needs `size === file.size && mtimeMs === file.mtimeMs`.
2. Else, when a source folder is open (`baseFolderPath` set), the live maps at the **source** path for that name (`baseFolderPath` + separator + `name`, built as `_loadFeatureCacheLocked`'s `makePath` does): `clipCache.get(path)` with `featureMetadata.get(path)` matching `size`/`mtime`. Covers a file moved in Explorer while the app is open, a copy, and the source folder being a training folder itself.
3. The first candidate whose stat matches wins; its CLIP vector is returned as a **copy** (`Float32Array.from`), so the manager never holds a host array. No match → `null`. When no candidate matched but at least one existed by name, one near-miss line goes to the perf log with both stats (§ 7); a name with no candidate at all logs nothing (the per-call `noSourceCopy` count covers it).

Injected into the manager as `lookupSourceClip: (file) => this._lookupSourceClip(file)`.

### 4.3 Manager: `ml-training.js`

- **New optional constructor callbacks**: `lookupSourceClip(file) → Float32Array(512) | null`, `logPerf(line)` and `now()` (default `() => performance.now()`, injectable so tests get deterministic times). Absent `lookupSourceClip` = today's behavior exactly.
- **`_collectFolderVectors`**: at the one site that today always calls `extractClipEmbedding` (the `!hadHit || needsClip` branch), first — when `enableClipFeatures` — ask `lookupSourceClip(file)`; a result that passes `hasClip` is used and counted as `clipReused`, otherwise `extractClipEmbedding` runs as today. The 64-dim half is unchanged: `hadHit ? hit.feature : computeFeatures(...)`. The existing counters keep their meaning: a miss filled by reuse is `!hadHit`, so `extracted++` and the training cache is saved; a CLIP-less hit healed by reuse is `gainedClip`, likewise. The reused entry is stored and saved like any extracted one. **Unchanged**: the descriptor and fingerprint, the shrink guard, `cacheable`, the CLIP-coverage gate (a reused vector is a real CLIP half, so it correctly lowers `clipMissing`).

Out of scope here: `_collectBulkRatedVectors` (bulk-rated files are source-folder files; it already reads the source maps).

## 5. Data flow — the user's scenario

1. Day 1: `Liked_2` is open and AI-sorted; its cache on disk holds `a.jpg`'s vectors. App closed.
2. Explorer: `a.jpg` → `Liked_3`. `mtime`/`size` preserved (§ 2.1).
3. Day 2: open `Liked_2`. The feature-cache load finds `a.jpg` in the file but not in the folder → `departedClips.set('a.jpg', {clip, size, mtime})`.
4. AI sort → `ensureTrainedModel`: the fingerprint changed (`Liked_3`'s file list) → rebuild → `_collectFolderVectors(Liked_3)`: `a.jpg` misses `Liked_3`'s training cache → `computeFeatures` (64-dim, with metadata) + `lookupSourceClip` hit → **no CLIP run** → row saved into `Liked_3`'s training cache.
5. In-app variant: Like `b.jpg` → `removeFileFromList` remembers its CLIP → the "↻ Re-sort" rebuild finds it the same way.

## 6. Error handling

Reuse can only remove work: every failure falls back to today's extraction.

| Case | Behavior |
| --- | --- |
| `lookupSourceClip` throws | Caught in the manager, logged via `logError`, treated as a miss → extracted; the rebuild stays cacheable. |
| Lookup returns a wrong-length vector | `hasClip` rejects it → extracted. |
| `logPerf` or `now` throws | Swallowed (one try/catch in the manager's line writer); diagnostics never fail a rebuild. |
| Source-cache load cancelled or fails mid-stream | `freshDeparted` discarded; `departedClips` unchanged. |
| Rebuild cancelled mid-collection | As today: `_collectFolderVectors` returns `aborted` before its save; reused entries are not persisted. |
| CLIP off | Lookup never consulted (D6). |
| CLIP on but the model not loaded | A reused vector still counts — it came from the same model earlier. |
| Same name, different file | Rejected by the size + mtime match (the same identity rule every feature cache uses). |
| In-app move that suffixed ` (n)` | Name differs → miss → extracted, as today (follow-up F3). |

## 7. Instrumentation (perf log)

**Per `ensureTrainedModel` call** — one line, written from a `finally` so every return path (skipped, session, model-cache, trained, aborted) logs exactly once. `ensureTrainedModel` becomes a thin wrapper that creates a timing record, runs the existing body (`_ensureTrainedModelImpl`) with it, and writes the line:

```
ML training: source=trained total=…ms | scan=…ms | likes: load=…ms (disk N) misses=N clipReused=N noSourceCopy=N features=…ms clip=…ms save=…ms | dislikes: … | bulk=…ms | train=…ms | modelCacheWrite=…ms
```

- `features` / `clip` time the two extraction halves separately, so the run shows what the 64-dim half D1 keeps still costs.
- `noSourceCopy` counts files where the lookup was consulted and returned nothing usable — it measures the cross-session gap (follow-up F2).
- `load=` is item (1)'s cost, recorded for information only.
- The before-run build (§ 8, commit 1) predates the lookup, so its line omits `clipReused`/`noSourceCopy`.

**Per AI sort** — one line from `handleSortByPrediction`'s existing `finally`:

```
AI sort: outcome=done total=…ms | clipLoad=…ms | sourceCacheLoad=…ms | training=…ms (trained) | extract=…ms | sort=…ms | files=N
```

`outcome` is `done`, `cancelled`, `failed`, or `stopped` (an early return such as "Need more ratings"). Phases that did not run are omitted.

**Per near miss** — from `_lookupSourceClip`, when a name matched but the stat did not:

```
Source CLIP not reused for a.jpg: source size/mtime 123456/1709626272345.679 vs training 123456/1709626280000.12
```

## 8. Measurement protocol (user in the loop)

The branch's first code commit is the instrumentation alone; the reuse lands after.

1. **Before run** (instrumentation-only build): close the app; in Explorer move ~5 files `Liked_2` → `Liked_3` — include a video if `Liked_2` has one — choosing files that were in `Liked_2` during an earlier AI sort, so `Liked_2`'s cache holds their CLIP vectors. `npm start`, open `Liked_2` with the usual folders, run the AI sort once, and paste the new lines from `%APPDATA%\media_viewer\logs\media-viewer-perf.log`.
2. **After run** (reuse build): the same, with ~5 **different** files — the first batch is now in `Liked_3`'s training cache and would hit. Optional, same session: Like 2–3 files in the app, then the "↻ Re-sort" chip, to exercise the in-app path.

**Acceptance**: the after line shows `clipReused` equal to the number of moved files and `noSourceCopy=0` for likes, the likes' `clip` time ≈ 0, and both runs' lines are recorded in the plan. A large drop in the **total** is not promised: items (1) and (2) are untouched, and the lines will show how much of the total they are.

## 9. Testing

Every new test must fail against the unfixed code first (the RED step is recorded in the plan).

**Unit — `tests/ml-training.test.js`** (manager with mocked callbacks):

1. Training-cache miss + matching source copy: `computeFeatures` called, `extractClipEmbedding` **not** called; the row is the computed 64-dim + the reused CLIP; the training cache is saved with that entry; `clipReused` 1.
2. Training-cache hit **without** CLIP + matching source copy: no extraction at all; saved.
3. Lookup returns `null` → extracted as today.
4. CLIP off → lookup never called.
5. Lookup throws / returns a wrong-length vector → extracted, error logged, result still cacheable.
6. No `lookupSourceClip` injected → behavior identical to today.
7. One `ML training:` line per call on each return path, with the right counts; times via the injected `now()`.

**Host methods — new `tests/source-clip-reuse.test.js`** (the repo's `extractMethod`/`extractAsyncMethod` harness):

1. `_loadFeatureCacheLocked`, binary and legacy chunk shapes: a departed entry is captured; a stale-by-stat entry of a present file is not; a CLIP-less departed entry is not; an aborted load leaves `departedClips` unchanged.
2. `removeFileFromList` remembers the vector under its `featureMetadata` stat, and nothing when the metadata or the CLIP vector is absent. Existing tests that build a `removeFileFromList` mock ctx (`tests/like-or-skip-glue.test.js`, `tests/media-viewer-utils.test.js`) gain `departedClips`.
3. Cap: the 5,001st entry evicts the oldest and logs once.
4. `_lookupSourceClip`: departed hit; live `clipCache` hit at the source path; stat mismatch → `null` plus a near-miss line; the result is a copy (`!==` the stored array).
5. **Composition** (the lesson recorded in `2026-09-10-ml-training-pipeline-design.md` § 13 on § 9.1: an isolation property is a property of a composition, so the test must bind the real host collaborator): a real `MlTrainingManager` wired to the real `_lookupSourceClip` over a mock ctx runs a rebuild — `extractClipEmbedding` is never called for the reused file; `featureCache`, `clipCache`, `featureMetadata` and `departedClips` are unchanged, compared field by field; the training-cache write carries the reused values.
6. `loadFolder` clears `departedClips` — a source-reading check, as `tests/like-or-skip-glue.test.js` does for `_onOrderChanged`.

**No new E2E**: CLIP cannot run in the E2E suite, so the user's real-folder run (§ 8) is the end-to-end check.

## 10. Follow-ups (to BACKLOG 🟤 at closeout; carried in the plan's Improvements now)

- **F1 — Train/score feature skew.** Source-folder vectors are extracted without file metadata (worker and displayed-media paths), training vectors with it (`computeFeatures`); dims 42–47 and 54–61 differ (§ 2.2). Fix the source paths to pass metadata (a `FEATURE_VERSION` bump → re-extraction of every folder), which would also make the 64-dim half reusable. Measure the effect on predictions first.
- **F2 — Rated in the app, sorted in a later session.** The vector is lost when an extraction-triggered save rewrote the source cache between the move and the next load. `noSourceCopy` measures how often.
- **F3 — (low)** An in-app move that suffixed ` (n)` to the name cannot be matched by name.

## 11. Scope, model and effort

Re-estimated at design: **~4 SP** (instrumentation ~1, departed map + lookup + manager change ~1.5, tests ~1, user runs and docs ~0.5) against the WEEKLY's 3 — inside the 2× abort threshold. Execution per the WEEKLY row: **Sonnet · `high`** — the change reads across the training-cache isolation boundary, so verification matters more than reasoning depth; review standard (`high`). The plan confirms or revises this.

## 12. Documentation to update at closeout

- `CLAUDE.md` § Cache Management: the training-vector cache paragraph (CLIP reuse via `lookupSourceClip`, the read-only direction), the `removeFileFromList` cleanup list (`departedClips`), and the perf-log lines.
- `docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md`: a dated note pointing here (the manager gained a source-folder read; the isolation rule's direction is unchanged).
- `docs/README.md`: this spec's index row (added with this file) and the plan's.
