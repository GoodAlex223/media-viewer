# G3 Training-Folder Video Extraction — Design Spec

**Task Reference**: WEEKLY.md Oct 12–16 § G3 (🔵), **re-scoped 2026-10-13** by the user after the measure-first before run. Its first spec, [2026-10-13-g3-source-clip-reuse-design.md](2026-10-13-g3-source-clip-reuse-design.md), is redirected here (§ 2.1). Origin: BACKLOG 🔵 [2026-10-04] "Explain and trim the retrain that runs after files are moved into the like folder outside the app".
**Created**: 2026-10-13
**Status**: Approved by the user 2026-10-13 in brainstorming: approach "fix the loaders" (§ 3), design sections 1 and 2. Awaiting the user's review of this written spec.
**Branch**: `g3-source-vector-reuse` (kept; from `main` @ `c2673c4`). It already carries the instrumentation, `713af35` (§ 2.1).

---

## 1. Goal

The AI sort should not retrain when nothing has changed. Today **every** AI sort retrains, because **every** video in a training folder fails 64-dim feature extraction, and a failed file makes the trained model non-cacheable. Fix the two video loaders that cause it, and make the perf-log line show failures and their time. Accept on the user's after run on their real folders (§ 7): the first sort saves the model, a second sort in the same session takes the session tier, and a sort after a restart takes the model-cache tier.

## 2. Findings that shaped the design

### 2.1 The before run (measure first)

The previous spec's Task 1 shipped on this branch (`713af35`): one `ML training: …` line per `ensureTrainedModel` call and one `AI sort: …` line per sort, both in `media-viewer-perf.log`. The user's before run (2026-10-13: 5 files moved `Liked_2` → `Liked_3` in Explorer, a mix of 1 mp4, 1 gif, 2 jpg and 1 png) produced:

```
ML training: source=trained total=90722ms | scan=3703ms | likes: load=31236ms (disk 15855) misses=12 features=5663ms clip=1202ms save=4065ms | dislikes: load=27675ms (disk 12979) misses=72 features=0ms clip=247ms save=0ms | bulk=2ms | train=2633ms
AI sort: outcome=done total=119804ms | mlInit=54ms | clipLoad=1803ms | sourceCacheLoad=25052ms | training=90723ms (trained) | extract=667ms | sort=1031ms | files=16208
```

- **CLIP on the moved files — what the first spec removed — cost at most 1.2 s of 119.8 s.** The user re-scoped. The first spec's Task 2 (`departedClips` + `_lookupSourceClip`) is parked, unmerged and unreviewed, on the local branch `g3-departed-clips-parked` @ `e11b36e`. Its Task 3 was dropped.
- **The line has no `modelCacheWrite=` segment, so the model was not cached** (`ml-training.js` `cacheable`). The session log holds 71 lines `Skipping <file> in <folder>: Video load error`, from `_collectFolderVectors`' catch (`failed++`): 66 in `Liked_1` and 5 in `Liked_3`, which is **every** video in the two training folders. `rowsFailed > 0` blocks both the session tier and the model-cache tier, so every sort pays the whole rebuild, moves or not.
- `dislikes: features=0ms` hid 66 failed `computeFeatures` calls. Task 1 adds a call's time only after its `await` returns, so a throwing call's time is dropped. That accounts for about 14 s of the 90.7 s.

### 2.2 Root cause (throwaway probes in the real app, 2026-10-13)

1. **Not the files.** `ffprobe` shows common codecs: h264 ×60, vp8 ×8, vp9 ×2 and HEVC ×1. A plain `<video>` element loads and seeks the failing files from the raw Windows path and from `pathToFileURL`, with an image as the control. A correct loader (no `src` clearing, `{ once: true }` handlers) loads and seeks **all 71**, the HEVC one included.
2. **`computeFeatures` itself** (`media-viewer.js`, video branch). On the same file, the real call rejects with `Video load error`; that is the probe's sentinel. The events recorded on the element it creates: `loadeddata, seeked, abort, emptied, error(code=4, "MEDIA_ELEMENT_ERROR: Empty src attribute")`, then `emptied, error` with no end.
   - The `seeked` handler sets `video.src = ''` **before** calling the async `processImageData`.
   - An empty `src` attribute is a load failure by the HTML spec, so it fires `error`.
   - With face detection on (the default, `enableFaceDetection !== false`), `processImageData` awaits `FaceDetector.detect`, so the `error` handler's `reject` settles the promise first.
   - With face detection off, the same call resolves with 64 dims.
3. **An endless error loop.** The `error` handler itself sets `video.src = ''`, which fires `error` again. Measured on one element: 31k events in the first second, then 74k and 111k over the next two, about 37k per second, never stopping. This happens to every video `computeFeatures` touches, success or failure, so the user's session had about 71 of these loops running.
   - `computePerceptualHash` (`media-viewer.js`, video branch; similarity-sort hashing) has the same re-clearing `error` handler. Its hash is correct, because it resolves synchronously before the queued `error`, but it leaves the same loop.
   - `loadMediaAsImageData` (the source-folder worker path) clears `src` after it finishes and does not re-clear in its handler: one stray `error` per video, no loop.
4. The rule that a failed file blocks caching (`rowsFailed === 0` in `cacheable`) arrived in `356f15c` (2026-09-10) and was merged in PR #68 (2026-09-12). Since then, with face detection on, a training folder that holds any video has not been able to produce a cacheable model.

## 3. Decisions

- **D1 — fix the loaders only.** The user chose this over also remembering failures (it changes the 2026-09-10 rule that a failed file blocks caching, and a one-off failure would hide a good file) and over an ffmpeg frame fallback (none of the user's files need it). Both are follow-ups (§ 8).
- **D2 — release a video by removing its `src` attribute, never by emptying it.** A new `_releaseVideo(video)` does `video.removeAttribute('src'); video.load();`. With no `src` attribute (and no `<source>` children) the media element load algorithm empties the element without a failure, so no `error` fires. An empty attribute fails with `MEDIA_ERR_SRC_NOT_SUPPORTED`.
- **D3 — no `error` handler touches `src`.** The handlers are registered `{ once: true }` and only settle the promise.
- **D4 — the timing line counts failures.** A failed call's elapsed time goes into `features=`/`clip=`, and each folder segment gains `failed=N`.
- **D5 — Task 1 stays as shipped**, apart from D4. The `ML training:` and `AI sort:` lines keep the before run and the after run comparable.

## 4. Components

### 4.1 `_releaseVideo(video)` — `media-viewer.js`

```js
_releaseVideo(video) {
    video.removeAttribute('src');
    video.load();
}
```

It sits beside `computeFeatures`, with a comment giving D2's reason. It is the only way the two loaders below let go of an element.

### 4.2 `computeFeatures`, video branch

- `error`: one named handler, `{ once: true }`. It clears the timeout and rejects with `Video load error`, the message unchanged so the existing `Skipping …: Video load error` log stays recognisable. It does not touch `src`.
- `seeked`: draws the frame and reads `imageData` (`getImageData` copies the pixels), records `videoWidth`/`videoHeight`, then **removes the `error` handler** and calls `_releaseVideo(video)`, and only then calls `processImageData`.
  - Removing the handler is load-bearing, not tidiness: the release happens before the async processing settles the promise, so any `error` that still reached the handler would win again.
- The 30 s timeout also releases the element after rejecting, so a stalled video does not keep its decoder.
- Images, JXL and the metadata / face / feature logic are unchanged.

### 4.3 `computePerceptualHash`, video branch

It has four `video.src = ''` sites. Three of them become `_releaseVideo(video)`:
- the `loadeddata` catch;
- the `seeked` success path, before `resolve(hash)`;
- the `seeked` catch.

The fourth, in the `error` handler, is removed. That handler is now registered `{ once: true }` and only clears the timeout and rejects (D3). Nothing loaded, so there is nothing to release. Its message is unchanged.

### 4.4 The training perf line — `ml-training.js`

In `_collectFolderVectors`, the `computeFeatures` and `extractClipEmbedding` timings move into `finally` blocks, so a throwing call's time is counted. `features=` still counts only computed (not cached) 64-dim halves. `stats.failed` mirrors the existing `failed` counter.

`formatTrainingPerfLine`'s folder segment becomes:

```
<label>: load=Nms (disk N) misses=N failed=N features=Nms clip=Nms save=Nms
```

Everything else in both lines is unchanged.

`loadMediaAsImageData` is not changed (§ 2.2 item 3; follow-up R7).

## 5. Error handling

- **A video the app genuinely cannot decode still rejects once with `Video load error`.** It counts as `failed` and the model is still not cached: the 2026-09-10 rule is unchanged. The new `failed=N` segment shows it in the perf line, and the existing toast ("Model trained but N file(s) failed to process — not cached") still fires.
- `_releaseVideo` cannot throw on a live element. Calling it twice is harmless.
- No new user-facing message.

## 6. Testing

Every new test must fail against today's code before its fix lands. A test that passes by construction is labelled, with the mutation that makes it fail.

**Unit (Vitest, the extract-method harness), in a new file `tests/video-release.test.js`.**

The fake `<video>`: an `EventTarget` that models the two spec rules that matter, plus the events the loaders wait on.

| Action on the fake | What it fires |
| --- | --- |
| `src` set to a path | `loadeddata` |
| `currentTime` set | `seeked` |
| `src` set to `''` | `error` (code 4), asynchronously |
| `removeAttribute('src')` + `load()` | `emptied` only |

It caps its own `error` count at 50, so a loop shows up as a count rather than a hung test. `document.createElement` (video and canvas), the canvas context, `window.FaceDetector.detect` (async) and `extractFeatures` are stubbed.

- **`computeFeatures`, face detection on, valid video:**
  - it resolves with 64 dims (today: rejects with `Video load error`);
  - after it settles, no `error` fires (today: the cap is reached).
- **`computeFeatures`, load error** (the fake fails the path): it rejects once with `Video load error`, and `src` is not cleared afterwards (today: the cap is reached).
- **`computeFeatures`, timeout** (fake timers, the fake never fires `loadeddata`): it rejects with `Timeout` and the element is released.
- **`computePerceptualHash`, valid video:**
  - after it settles, no `error` fires (today: the cap is reached);
  - it returns the hash, which already passes today and is labelled.

**Manager (`tests/ml-training.test.js`):**
- a throwing `computeFeatures` with an advancing fake clock counts its time (today: `features=0ms`);
- `failed=N` appears per folder.
- Task 1's exact expected strings change to the new format.

**E2E (Playwright), a new file `tests/e2e/video-feature-extraction.test.js`.** The real app; `tiny.mp4` (`tests/e2e/fixtures`) in a temp fixture folder, granted; face detection on.
- `window.mediaViewer.computeFeatures(path, {}, { useHostCache: false })` resolves with 64 dims.
- The element it created (counted by wrapping `document.createElement`) fires 0 `error` events over the next second.
- Before the fix, the RED run must record the event order and show `seeked` followed by `error(code=4 … Empty src attribute)`. That proves the fixture fails for this reason and not one of its own (memory: a probe must discriminate).

## 7. Measurement — the user's after run (acceptance)

On the fix build:
1. Close the app (the old session's loops die with it).
2. `npm start`. Open `Liked_2` with the usual folders and run the AI sort once.
   - **Expect:** `failed=0` in both folder segments; `dislikes: misses` ≈ 66 plus anything new; real `features=`/`clip=` times; a `modelCacheWrite=` segment.
3. Run the AI sort again in the same session.
   - **Expect:** `ML training: source=session`, `training=` about the scan time (~4 s), and `sourceCacheLoad` absent.
4. Close the app, `npm start`, run the AI sort.
   - **Expect:** `source=model-cache`.
5. Paste: `Get-Content "$env:APPDATA\media_viewer\logs\media-viewer-perf.log" -Tail 6`.

Baseline: the before run, § 2.1 (a 119.8 s sort, 90.7 s of it training).

## 8. Follow-ups (BACKLOG 🟤 at closeout, with the before-run numbers)

- **R1 — Remember a stable failure** (`name` + `size` + `mtime`), so a genuinely undecodable file stops being retried and stops blocking the model cache. This changes the 2026-09-10 rule. Trigger: `failed=N > 0` in a real run.
- **R2 — An ffmpeg frame fallback for videos Chromium cannot decode**, as the CLIP path already does with `extractKeyframes`.
- **R3 — Annotate the BACKLOG item (1) entry** ("every rebuild re-streams both training folders' `.feature_cache.json` in full") with the measurement: `load=` 31.2 s + 27.7 s = 58.9 s of a 90.7 s rebuild. This is now the dominant cost of any rebuild.
- **R4 — The source-folder cache load takes 25.1 s** (`sourceCacheLoad`) on the first sort of each session, for 16,213 entries.
- **R5 — F1 from the redirected spec, still true:** source-folder 64-dim vectors are extracted without file metadata, so training and scoring see different features in dims 42–47 and 54–61.
- **R6 — The parked source-CLIP reuse**, branch `g3-departed-clips-parked` @ `e11b36e` (the redirected spec's F2/F3 travel with it). Revisit only if a measurement shows CLIP on moved or rated files matters, e.g. a long like-or-skip session's re-sorts.
- **R7 — `loadMediaAsImageData` still sets `src = ''`**: one stray `error` per video, no loop. Move it to `_releaseVideo` for consistency.

## 9. Estimate and execution

- **~2 SP:** two loaders and a helper, a perf-line change, unit and E2E tests, docs.
- **Execute** subagent-driven, Sonnet · `high`, with the controller committing.
- **Review** standard (`high`), after the PR (memory: ask before an in-chat code review).

## 10. Docs

- `CLAUDE.md` § Active gotchas: release a `<video>` with `removeAttribute('src')` + `load()`, never `src = ''`. An empty `src` fires `error`, and an `error` handler that re-clears loops forever.
- The redirected spec gets a dated "Redirected" note pointing here, and its `docs/README.md` row says so.
- This spec gets its own `docs/README.md` row.
- A new plan file. The first plan (`2026-10-13_g3-source-clip-reuse.md`) is marked superseded and archived with this one at closeout.

## 11. Addendum (2026-10-14): the CLIP blocker

**Approved by the user 2026-10-14** (option "Lenient fallback", chosen after the after run).

### 11.1 Finding

The after run (build `341026c`; lines in the plan's § After run) shows the video fix works: `failed=0` in both folders, and all 71 videos were extracted. But no run has a `modelCacheWrite=` segment, and runs 2 and 3 are `source=trained`. Acceptance (§ 7) was not met.

- **A second rule blocks the cache.** `cacheable` (`ml-training.js:941-942`) also requires `!(enableClipFeatures && clipMissing > 0)`. § 2.2 missed it.
- **Nine training files have `clipVector: null`:** 3 in `Liked_3` and 6 in `Liked_1`, all still images. Each rebuild retries their CLIP, which is the `misses=3`/`misses=6` with `features=0ms`. Every retry fails again.
- **Main's `RawImage.read` throws for all 9.** It decodes through sharp with its defaults (`failOn: 'warning'`, a 268-megapixel input limit). Chromium displays all 9. The errors:
  - 4 × `Corrupt JPEG data: premature end of data segment`;
  - 2 × `Invalid SOS parameters for sequential JPEG`;
  - 1 × `Input image exceeds pixel limit` (14031×19933);
  - 1 × `libspng read error`;
  - 1 × `unsupported number of channels: 4`.

  A file from the same folder that has a CLIP vector decodes fine (the control).
- **A lenient decode reads all 9.** It is sharp with `failOn: 'none'` and `limitInputPixels: false`, shrunk on load to fit 1024 px, then forced to 3-channel sRGB.
- **The failure was invisible.** The renderer only `console.warn`s a CLIP failure, the perf line's `misses` folds CLIP-only retries in with real misses, and the "Model trained without CLIP for N file(s)" toast names no file.
- **This blocker predates G3.** The before run's `dislikes: misses=72` is the 66 failing videos plus these 6.

### 11.2 Decisions

- **D6 — a lenient fallback, after the strict read only.**
  - New main-process module `clip-image.js` with `readClipImage(imagePath, { RawImage, sharp, warn })`.
  - It tries `RawImage.read(imagePath)` first, so every embedding the strict path can produce is byte-identical to today's.
  - Only on a throw does it decode with sharp: `{ failOn: 'none', limitInputPixels: false }`, then `.rotate()` (as `RawImage.read` does), `.resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })`, `.removeAlpha()`, `.toColourspace('srgb')`, `.raw()`. It wraps the result in a 3-channel `RawImage`.
  - If the lenient decode also throws, the strict error is rethrown, so the IPC reply's `error` is unchanged.
- **D6 amended (Task 2b review, 2026-10-14):** the lenient decode is bounded.
  - It uses `limitInputPixels: 2 ** 29` (536,870,912 px), not `false`. That is about 2× sharp's default, with 1.9× headroom over the user's 279.7-megapixel JPEG.
  - It adds `.timeout({ seconds: 30 })`.
  - Why: with no limit, a tiny crafted file with huge declared dimensions decoded unbounded in the main process. A 74-byte PNG declaring 10 GP took 3.6 s and 557 MB; a 100 GP one ran past 20 s. The strict path refuses anything over 268 MP, so the new ceiling stays the same order as today's.
  - What a file over the bound gets: the strict error, rethrown.
  - On garbage in: `failOn: 'none'` fills missing rows, so a header-only file decodes to a blank image. A training row only reaches CLIP after Chromium's `computeFeatures` succeeds, though, so a file Chromium cannot show still fails as `failed=1`, before any CLIP.
- **D7 — scope.** Only main's `extractClipEmbedding` (path) handler uses it.
  - `extractClipEmbeddingBatch` reads ffmpeg-made keyframes, and `extractClipEmbeddingFromBuffer` reads jxl-oxide PNGs. Both inputs are clean, so both handlers stay unchanged.
  - The source folder benefits too: its background CLIP extraction uses the same handler.
  - `sharp` becomes a direct dependency at the version already installed through `@huggingface/transformers` (`^0.34.5`).
- **D8 — name what blocks the cache.**
  - Main logs one `warn` per fallback (`CLIP: <name> needed the lenient decoder (<strict error>)`) and per double failure (`CLIP: cannot decode <name>: <strict> (lenient: <lenient>)`).
  - `_collectFolderVectors` logs each training row left without a CLIP vector while CLIP is on: `No CLIP vector for <name> in <folder> — the model will not be cached`. It uses the injected `logError`, like the `Skipping …` line.
  - The perf folder segment gains `noClip=N`, counting those rows. **D8 amended (same review):** the per-row line is capped at 20 names per folder per call, then one `No CLIP vector for K more file(s) in <folder> — the model will not be cached` line. With CLIP enabled but unavailable (offline first run, a failed model load), every one of ~28k training rows would otherwise log a line, and a main-thread write, per sort. `noClip=N` still carries the full count. **D4 is amended to:** `<label>: load=Nms (disk N) misses=N failed=N noClip=N features=Nms clip=Nms save=Nms`.
- **D1 still holds.** `cacheable` is unchanged; this fixes a loader.

### 11.3 Testing

- **Unit, `tests/clip-image.test.js`.** It uses the real `RawImage` from `@huggingface/transformers` and the real sharp, on fixtures generated at test time: a valid JPEG, a truncated JPEG, a grey+alpha PNG and a non-image.
  - A valid file returns exactly what `RawImage.read` returns, and the fallback is never called.
  - A file the strict read rejects (asserted first, so the fixture discriminates) decodes to 3 channels within 1024 px, with one `warn`.
  - A non-image rethrows the strict error.
  - The lenient options pin the pixel-limit case, which no small fixture can reach.
- **Unit, `tests/ml-training.test.js`.**
  - The perf strings gain `noClip=N`.
  - A new test: one dislike whose CLIP is `null` → `noClip=1`, the `No CLIP vector …` log line, and no `modelCacheWrite=`.
- **No E2E.** It would need the ~87 MB CLIP model inside the E2E profile. The wiring in `main.js` is checked by review and by the user's second after run.

### 11.4 Acceptance

§ 7, re-run on the new build, plus `noClip=0` in both folder segments of run 1. If a file still shows `noClip`, the session log's `CLIP: cannot decode …` line names it, and it is follow-up material (R1).

### 11.5 Estimate

**+~1.5 SP** (Task 2b). The total is now ~3.5 SP. Same execution: subagent-driven, Sonnet · `high`, the controller commits.
