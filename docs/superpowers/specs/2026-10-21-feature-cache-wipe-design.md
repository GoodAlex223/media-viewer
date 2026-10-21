# Stop the feature cache being wiped on a folder switch

**Status**: Draft, 2026-10-21. Agreed in chat section by section, amended after the builder check (D2 and D4 amendments, my calls 11–14); awaiting the user's review of this document.
**Branch**: `fix-feature-cache-wipe`, cut from `main` at `5cb1cfb`.
**Scheduled**: next PR, ahead of G2 PR 2 (the user's ruling at the PR #85 review). Not in [WEEKLY.md](../../planning/WEEKLY.md); see § 12 for what slips.
**Origin**: [TODO.md](../../planning/TODO.md) 🔴 "Stop the feature cache being wiped on a folder switch (data loss)", from the PR #85 review: [#1](https://github.com/GoodAlex223/media-viewer/pull/85#issuecomment-6275478348), [#16](https://github.com/GoodAlex223/media-viewer/pull/85#issuecomment-6275671877) and the [close-out's second trigger](https://github.com/GoodAlex223/media-viewer/pull/85#issuecomment-6289951316). Also the [archived G2 PR 1 plan](../../archive/plans/2026-10-19_g2-hash-sort-pr1-end-of-sort-fixes.md) § Residuals, and BACKLOG 🟤 [2026-07-20] "Attribute feature metadata at extraction time…", whose "No longer destructive" claim this work disproves.

---

## 1. Intent

A source folder's `.feature_cache.json` holds the 64-dim and CLIP vectors the AI sort uses. Losing it costs no ratings and no files. The next AI sort, though, has to re-extract the whole folder, which is a long wait on a 24k-file folder. The July incident (23,559 entries → 32) was this class of bug.

Today six code paths can replace that file with a smaller one, or with another folder's entries (§ 3). They share one root (§ 4): **no load and no save knows which visit to which folder it belongs to.** This change ties every load, extraction result and save to a *folder visit*. Main also gains a second line of defence that refuses a write it cannot account for.

**Rated by what it can destroy, not by how narrow the trigger is** (memory: `feedback_defer_lifecycle_findings`). Every trigger below can destroy a folder's whole cache, and trigger 3 needs only an everyday sequence of actions. They are fixed together. A fix aimed only at trigger 1 would leave trigger 3 open.

**Success** is all of:
- each of the six triggers has a test that fails on `main` and passes on the branch (§ 9; T4's first part is tested at the state level, § 9.1);
- no save writes a folder's cache unless that visit read the file, or found it missing or corrupt, or its copy covers every media file now in the folder (D2 amendment);
- no save writes the live map: it writes a copy frozen when the save was requested;
- main refuses a write that would shrink a file it never saw, or shrink one it saw by more than the renderer's own rule allows (§ 7);
- `media-viewer.js` ends shorter than its 12,190 lines on `main` (§ 8);
- the unit and E2E suites pass, and the manual check on a copied folder and profile passes (§ 9.4).

## 2. Decisions

Rulings by the user (chat, 2026-10-21):

| #  | Question | Ruling |
| -- | -- | -- |
| D1 | Recovery of caches already damaged | **Out of scope.** The user has not used the app recently, so no recent session can have damaged a cache. |
| D2 | Features extracted while browsing a folder whose cache this visit has not read | **Keep them in memory, and save only after the cache has been read.** A later read in the same visit merges them in. If the user leaves first, they are dropped and get re-extracted later. Rejected: reading every folder's cache on open whenever the AI features have been used this session (a ~40 s background read per switch on a 24k folder). |
| D3 | A save already streaming when the folder changes | **It finishes,** writing the old folder's frozen copy into the old folder. This is how the requirement "every save re-checks its folder after each await" is met: after each await the save checks that it is still writing its own copy to its own folder, and it never touches the new visit's state. Rejected: aborting it, which would throw away up to 30 s of the old folder's extraction. |
| D2 amendment | A cache file that exists but cannot be read (side-agent note and builder check, 2026-10-21) | **Retry, then allow a full-coverage save, and say so when work is dropped.** Main's read retries brief lock errors. A visit that still could not read the file may save only a copy that covers every media file now in the folder, with a CLIP vector for each when CLIP is on; main verifies the coverage itself (§ 7.2). If an extraction ends and its work still cannot be saved, one warning per visit says so (§ 7.3). Browsing never covers a folder, so D2's effect is unchanged. Without this, an unreadable file made every AI sort re-extract the whole folder and save nothing, silently. The training folders get the same read-failure handling (§ 6). |
| D4 | When main refuses a save | **A warning on screen, once per folder visit** (an ordinary warning that fades, not a sticky one), **plus a session-log line.** The user asked for my recommendation and took it. A refusal means a renderer bug got past the renderer's own guard; the July loss surfaced only because a smoke failed. |
| D4 amendment | A refusal with an innocent explanation (builder check, 2026-10-21) | **Logged, not shown, when the renderer can explain it.** If main refuses a save from a visit that found no file or a corrupt one, the file changed after the visit looked. One way: the source folder is also a like/dislike folder, and the AI sort's training step wrote its cache. The visit adopts main's count as its baseline and stays able to save (§ 7.3). The warning and the stop on autosave stay for a refusal the renderer cannot explain: it believed it had read the file. |

My calls, presented in chat and not objected to (each is open to correction on review):

1. **Flush on leave.** Leaving a folder whose cache was read saves its unsaved entries first, in the background. The new folder does not wait for it.
2. **A read failure is not "no file".** A file that exists but cannot be read (an I/O error, such as another program holding it) leaves the visit at *not read yet*. Only "not found" and "corrupt" (it opened but would not parse) allow a fresh write. Today all three count as "nothing usable on disk".
3. **Merge on read.** A read keeps the in-memory entries this visit already extracted, instead of replacing the map. For a path present in both, the disk entry wins, since it was validated against the file's size and mtime.
4. **A read happens at most once per visit.** The AI sort's "skip the reload" check becomes "this visit has read the cache", not "every file is in memory". Otherwise a small folder browsed end to end would never be read, so under D2 it would never be saved.
5. **A new module, `feature-cache-store.js`,** owns the visit state, the read, the save, the frozen copy, the IO lock and the autosave timer (§ 8).
6. **The legacy single-read load fallback goes.** It runs only when the streaming load throws, and main cannot count what it read. A failed streaming load now leaves the visit at *not read yet*.
7. **Switching to an empty folder clears the maps** and starts a visit, like any other switch.
8. **After a refusal by main, autosave stops for that visit.** It resumes only after the visit reads the cache again. Without this the 30 s autosave would hit the same refusal every 30 s.
9. **Main's check lives in a small CommonJS module** (working name `feature-cache-ledger.js`), so it can be unit-tested. `main.js` handlers cannot be called in-process by the suite today: `tests/main-hardening.test.js` only reads the source.
10. **`preload.js` stays untouched.** The new header field and the new result fields pass through the existing calls. If the builder finds otherwise, the preload security review applies (CLAUDE.md § Best Practices).

Added after the builder check (2026-10-21), shown to the user with the two amendments above:

11. **Where a visit ends.** The everyday folder switch (the change-folder button and the header recent-folders menu, both through `switchToFolder` → `_switchToFolderNow`) empties `mediaFiles` and `baseFolderPath` *before* it calls `loadFolder` (`media-viewer.js:3625–3629` at `5cb1cfb`). A visit therefore ends, and its flush freezes its copy, at whichever comes first: `_switchToFolderNow`'s reset (just before `mediaFiles = []`), or `loadFolder`'s successful listing (the dialog, a drop, a recent folder opened from the drop zone). `_switchToFolderNow` also cancels the background extraction at that point; its late results would be dropped by the visit check anyway, so this only stops wasted work. The AI sort's abort stays in `loadFolder`, where PR #85 tuned it. After a failed listing on the switch path, no visit is current: the list and the folder are already gone, and nothing saves until the next successful load. On the other paths a failed listing leaves the old folder, and its visit, as they were.
12. **Main's read tells its failures apart and catches every stream error.** Today `feature-cache-open` reports any `fs.access` failure as `notFound`, and it builds its parse chain with `.pipe()`, listening for errors only on the last stage, so a read-stream error is probably never seen (read, not run; the plan checks it first and treats a hang as a finding). It must report ENOENT as "no file", a parse failure as corrupt, and anything else as unreadable, and it must use `stream.pipeline` (or listen on every stage).
13. **T4's first part is tested at the state level.** The baseline that T4a inherits matters only while the new visit is unread, and the design blocks saving in that state. So no disk-level test can fail on it alone. It gets a state-level test (a read that ended stale changes no baseline), while T4b and T4c keep their disk-level tests.
14. **A blocked visit counts as unread for reading,** so the next AI sort reads the file again. This settles the overlap between my calls 4 and 8.

## 3. The six triggers

"Probed" means the PR #85 reviewer reproduced it with the real methods on `main`. "Read" means I found it by reading the code. Phase 0 of the plan must reproduce each "read" trigger before anything is fixed, and treat any it cannot reproduce as a finding.

| # | Trigger | Status | What it can destroy |
|---|---|---|---|
| T1 | **A late extraction result.** A file from the old folder is still loading (`await loadMediaAsImageData`) or still in a worker when the folder changes. Its result lands in the map `loadFolder` just cleared, because `handleFeatureWorkerMessage`'s `result` branch writes `featureCache` with no check (`cancelPendingFeatureExtractions`' comment says in-flight tasks "will complete and be ignored"; they are not). The result has no metadata, so `buildEntry` skips it. But the map is no longer empty, so the save still opens, writes zero entries and closes. Main renames `{"features":{}}` over the new folder's file. The background run's CLIP `.then` has the same gap: `cancelBackgroundExtraction` does not bump `extractionRunId`. | Probed (review #1) | The new folder's whole cache |
| T2 | **A save cut short.** `_saveFeatureCacheLocked` checks its shrink guard once, then iterates the live `featureCache` across awaited chunk writes. A folder switch that clears the map mid-loop ends the iterator early, and the close renames the partial file over the old folder's own cache. | Probed (review #16): 2,500 → 1,000 | The old folder's cache, beyond the entries written so far |
| T3 | **A cache never read.** An AI sort or a CLIP kickoff starts the feature pool, and with it the 30 s autosave, for the rest of the session. `loadFolder` resets `_featureCacheDiskCount` to 0 and does not read the new folder's cache. Browsing extracts the viewed files (`prioritizeDisplayedFilesExtraction`) and marks the cache dirty. The next autosave saves with the shrink guard off, and main renames the result over the file with no count check (`main.js` `feature-cache-write-close`). | Probed (close-out): 2,000 → 3 | The new folder's whole cache. Everyday workflow: sort by AI, open another folder, browse for 30 s |
| T4 | **A read that crosses a folder switch.** `_loadFeatureCacheLocked` never re-checks the folder after its awaits. (a) It sets `_featureCacheDiskCount = opened.count` after main's parse returns, which can take ~40 s, so the new folder inherits the old folder's baseline. (b) A cancel during the last chunk is not seen (the abort check runs only at the top of each chunk), so `commitFresh` puts the old folder's entries into the new visit's map. Their metadata is valid, so a save writes them, guard satisfied, over the new folder's file. (c) The single-flight `_featureCacheLoadPromise` can hand the old folder's read to a caller in the new folder. | Read | The new folder's whole cache, replaced by entries whose names do not match its files |
| T5 | **A switch to an empty folder.** The empty-folder branch of `loadFolder` sets `baseFolderPath` but does not clear `featureCache`, `clipCache` or `featureMetadata`. A dirty flag left from the old folder makes the next autosave write the old folder's entries into the empty folder's cache file. | Read | Little: the folder holds no media. It is the same root, so it is fixed with the rest |
| T6 | **A dirty flag that lies.** The autosave and the extraction tail set `featureCacheDirty = false` after any save: one the guard skipped, one that failed, or one coalesced into a save already streaming with an older map. Entries extracted since then are never saved until something else marks the cache dirty. The flag also survives `loadFolder`. | Read | Unsaved work, not data already on disk |

## 4. The shared root

Three missing facts, in one picture:

- **"Not read" is stored as "0 entries".** `_featureCacheDiskCount = 0` means both "this visit never read the file" and "there is no file". The shrink guard needs a positive baseline, so a save in an unread folder runs unguarded (T1, T3).
- **Results and loads carry no owner.** Nothing ties an extraction result or a read to the folder it was started for (T1, T4, T5).
- **A save writes live state.** It reads `featureCache`, `featureMetadata` and `baseFolderPath` across its awaits (T2), and its dirty bookkeeping is not tied to what it wrote (T6).

Main has no view of any of this. It renames whatever arrives.

## 5. The design: a folder visit owns its cache

### 5.1 The visit

Every successful `loadFolder` starts a new **visit**: an opaque token (a generation number is enough) plus the folder path. That holds for an empty folder too (my call 7), and for reopening the folder already shown. The old visit ends where my call 11 says, which on the everyday switch path is before the listing. A failed listing starts no visit.

Each visit has one cache state:

| State | Meaning | Save allowed? | Shrink guard |
|---|---|---|---|
| `unread` | The visit has not read the file, or its read failed or was cancelled | **Only a full-coverage copy** (D2 and its amendment): every media file now in the folder has an entry, with a CLIP vector when CLIP is on | n/a; main checks the coverage (§ 7.2) |
| `read` (N) | The read committed; N entries were on disk | Yes | Yes, against N (today's three conjuncts) |
| `absent` | Main reported no file | Yes | No |
| `discard` | The file was corrupt, or had another cache version, and is being replaced on purpose | Yes | No |
| `blocked` | Main refused this visit's last save for a reason the renderer cannot explain (§ 7.3) | **No**, until the visit reads again (my calls 8 and 14) | n/a |

After a successful save, the visit's baseline becomes the count written, as today's re-baseline does. This only applies if the visit is still current; see § 5.4.

### 5.2 The read

- `ensureRead({ signal, onProgress })` reads the **current visit's** file, at most once per visit (my call 4). A second call after the visit has read returns at once. The single-flight promise is keyed to the visit, so a read started for folder A is never handed to a caller in folder B (T4c).
- After **every** await in the read, it checks that its visit is still current and that its signal is not aborted. If either fails, it commits nothing and changes no state. That includes the baseline: T4a sets it before the parse finishes, and the new design sets it only at commit. The check also runs after the last chunk, closing T4b.
- The commit **merges** (my call 3). The disk entries validated for this folder's files go in, and in-memory entries the visit already extracted fill the gaps. Today's prune of files no longer in the folder still applies to the disk entries. The clip map was already merged; it stays merged.
- `opened.notFound` → `absent`. A parse failure → `discard`. A cache-version mismatch → `discard`, keeping the in-memory entries (today it empties the maps). Any other failure (an I/O error that outlasted main's retries, a refused path, a throw mid-stream) → stays `unread` (my call 2), and is logged. Main's open must therefore say which failure it was (§ 7.1, my call 12).
- The legacy `readFolderCache(…, 'feature')` fallback is removed (my call 6). If nothing else uses it, `'feature'` comes off `read-folder-cache`'s `oneOf` list in `main.js`; the builder checks.

### 5.3 Extraction results

Every write into `featureCache`, `clipCache` or `featureMetadata` that can complete after an await carries the visit current when its work started. It is dropped if that visit is no longer current. The sites:

| Site | What carries the visit |
|---|---|
| `handleFeatureWorkerMessage` `result` (the worker pool; T1) | the task, from `enqueueFeatureExtraction` |
| `prioritizeDisplayedFilesExtraction`, both branches | captured on entry; re-checked after `extractFeaturesFromMediaElement` and after `loadMediaAsImageData`, before enqueueing |
| `startBackgroundFeatureExtraction`: the CLIP `.then`, and the hand-crafted result through the pool | captured at the run's start. `extractionRunId` alone does not cover a cancel, because `cancelBackgroundExtraction` does not bump it |
| the run's tail save | becomes a save request for the run's own visit, made only if that visit is still current. Otherwise the flush on leave (§ 5.4) already covered it |

The other write sites are listed in § 6 with the reason each needs no visit check.

### 5.4 The save

- **A save request freezes everything at once, synchronously:** the folder path, the visit, the state and baseline, the media-file count for the guard's third conjunct, and a copy of the entries. The copy is an array of `[path, vector, clip, size, mtime]`. Size and mtime are resolved from `featureMetadata`, or from a path→file map of `mediaFiles` built once, which avoids today's per-entry `mediaFiles.find`. Rounding and serializing can stay in the streaming loop. The copy holds references to the vectors. The builder confirms that no code mutates a cached `Float32Array` in place (every site found replaces it with `set`).
- **The decision is made from the frozen state.** `blocked` → no save. `unread` → a save only if the copy covers every media file in the frozen file list (each has an entry, and a CLIP vector when CLIP is on); otherwise no save. `read` → today's shrink guard against N. `absent` / `discard` → no guard. Nothing after the request reads the live maps or `baseFolderPath`. That closes T2 and keeps T1's and T3's data out of a save.
- **Dropped work is reported.** When an extraction run (the AI sort's Phase 2, or the CLIP kickoff) ends with its visit still `unread` and its copy short of full coverage, its work cannot be saved. One warning per visit says so (§ 7.3). Browsing alone never triggers it: only the end of an extraction run does.
- **The stream** takes the shared IO lock and writes the frozen copy. After each await it checks that it is still the writer it opened, and it carries on (D3). It never changes the current visit's state unless its own visit is still current.
- **Requests queue.** Today's `saveFeatureCache` single-flight returns the in-flight save to a later caller, so that caller's newer entries are never written (part of T6). A request made while another save streams waits behind it with its own copy. Requests for the same visit coalesce to the newest copy.
- **Dirty tracking** becomes a per-visit change counter. Extraction results bump it through the same visit check as § 5.3. A save records the counter in its copy, and clears "dirty" only if it succeeded *and* the counter has not moved since. A new visit starts clean. That closes T6.
- **Flush on leave** (my call 1). Where the visit ends (my call 11: `_switchToFolderNow`'s reset, or `loadFolder`'s successful listing), the old visit is asked to save if it is dirty and its state allows a save. The request freezes its copy synchronously, while `mediaFiles` still holds the old list, so the file count for the guard and the size/mtime fallback are the old folder's. Clearing the list and maps right after it is safe, and the new folder's load does not wait for the write.
- **The autosave timer** moves into the store, still 30 s, still started by `initializeFeaturePool` and stopped by `shutdownFeaturePool`. Each tick is just "save the current visit if it is dirty".

## 6. Every consumer, checked

What reads or writes the two fields named in the brief, and each feature-map write site, in `media-viewer.js` unless named. Line numbers are at `5cb1cfb`.

**`_featureCacheDiskCount`**: constructor (:282); `loadFolder`'s reset (:3205); the read (:9470, :9478, :9485, :9551, :9557); the save's guard (:9615–9621) and its re-baseline (:9688); tests `media-viewer-utils.test.js` :4916–4967 (`loadFolder`) and :5972–6056 (the save guards). All of them move into the visit state of § 5.1. `ml-training.js` keeps its own local `diskCount` per training folder and never reads the host's field.

**`featureCacheDirty`**: constructor (:281); the compare-pair move's fallback extraction (:6972, :6992); `prioritizeDisplayedFilesExtraction` (:10666); the worker result (:10993); the background run's CLIP result (:11390); the run's tail save, which clears it (:11445–11447); the autosave, which clears it (:11753–11755). All of them go through the per-visit counter of § 5.4.

**Write sites that need no visit check**, and why:
- `moveCurrentFile` (:1840) and `moveComparePair` (:6965–6998) extract from the media on screen inside the file-op guard. `_fileOpInFlight` is held from before their first await, and `loadFolder` refuses while it is held (`_refuseIfFileOpInFlight`), so no visit can end mid-extraction. They still write through the store's per-visit write so the counter stays honest.
- `restoreFeatureCachesFromHistory` runs only on undo, inside `handleCancel`'s file-op guard, and `moveHistory` is emptied by `loadFolder`.
- `removeFileFromList` only deletes, within the visit.
- `computeFeatures`' `useHostCache: true` branch has no caller today. Its only caller, `MlTrainingManager`'s injected callback (:216), passes `false`. It is not a live write site; the builder confirms there is no other caller and leaves it alone (a 🟤 to remove the dead branch is fine).

**The training-folder caches** (`ml-training.js`): their entries live in a `Map` local to each call, they share the host's IO lock, and `_collectFolderVectors` reads before it saves within one call. They are not open to T1–T6. They do go through main's writer, so § 7's check applies to them:
- `_saveVectorCache` must send the folder's file count (`scanCount`) in its header, and must report a refusal through the same path as the source folder (§ 7.3).
- `_loadVectorCache` (`ml-training.js:231`) treats every failed open as "no file" today. It takes the same three-way split as the source read (D2 amendment): no file, corrupt, or unreadable. On unreadable it still extracts, because training needs the vectors. Its save is then a full-coverage save, which main verifies; if a file failed extraction, main refuses it and the training folder's warning fires once per session.
- The injected `cacheIo.acquireLock` points at the store's lock.
- A training folder that is also the source folder shares one file with the source visit. The D4 amendment covers the save that follows a training write (§ 7.3).

## 7. Main's second line of defence

### 7.1 What main remembers

For the rest of the session, main records what it last saw of each cache file, keyed by the file path it computes (`path.join(folderPath, '.feature_cache.json')`):
- `feature-cache-open`: `{ seen: 'read', count, version }`, `{ seen: 'absent' }` (ENOENT only), `{ seen: 'corrupt' }` (the parse failed), or `{ seen: 'unreadable' }` (any other I/O error, or a refused path). Before settling on `unreadable`, the open retries brief lock errors (EBUSY, EPERM, EACCES) a few times, as the rename does (D2 amendment). The parse chain uses `stream.pipeline` or listens on every stage (my call 12). The open's reply to the renderer gains matching `corrupt: true` and `unreadable: true` flags, so the renderer can tell `discard` from `unread`.
- `feature-cache-write-close`, on a successful rename: `{ seen: 'read', count: written, version }`.
- `feature-cache-write-chunk` counts the entries it writes, and keeps the set of names written and the names whose entry has a CLIP vector (needed only for the coverage check below; 24k names is small).
- `feature-cache-write-open` takes a `clipRequired` boolean in its header, beside `fileCount`: true when CLIP is on.

This covers the source folder and the like/dislike training folders, since both use these channels.

### 7.2 What main refuses

`feature-cache-write-open` requires a valid non-negative integer `fileCount` in its header. Without one it refuses the open, so a future caller cannot skip the third conjunct.

At `feature-cache-write-close`, before the rename, if a file already exists at the destination, main refuses when any of these holds:
- **`unseen`**: main has no record for the file, or the record says `unreadable`, *and* the write does not cover the folder. "Covers" means main lists the folder's media files (`media-formats.js`'s `isMediaFile`) at close, and every one of them is among the names written, with a CLIP vector when `clipRequired` is set. Main lists the folder only in this case, which should be rare. This is T3 at main's level: a visit that read the file always leaves a record first, and a browsing visit never covers the folder.
- **`shrink`**: the record is `read` with count N > 0 and the same version as the header, the written count is under N × 0.5, *and* `fileCount` is over the written count × 2. This is the renderer's own rule, so a real shrink still saves (most files moved out). A version change skips this check, because the old version is being thrown away on purpose.

A `corrupt` or `absent` record allows the write. If `absent` was recorded but a file has since appeared, that counts as no record (the `unseen` rule).

On a refusal main deletes the `.tmp`, leaves the cache file untouched, and returns `{ success: false, refused: 'unseen' | 'shrink', seen, written }`. `seen` is N or null.

### 7.3 How the renderer reports it

Every refusal writes a session-log line through `logError`: the folder, the rule, `seen` and `written`. What else happens depends on whether the renderer can explain it (D4 amendment):

- **Explained:** the visit's frozen state was `absent` or `discard`, so the file changed after the visit looked. For example, the source folder is also a like/dislike folder, and the AI sort's training step wrote its cache. The visit adopts main's `seen` as its baseline (`read` with that count), or goes back to `unread` when `seen` is null (a file appeared that main never saw). Nothing is shown, and the visit can still save; its next save is guarded against the new baseline.
- **Unexplained:** the visit's frozen state was `read` or `unread`, and main still refused. A warning shows on screen, once per visit (D4). Something like "Feature cache not saved: it would have replaced 2,000 cached entries with 3. The cache on disk is unchanged." For `unseen`: "…: this folder's cache was never read in this session. The cache on disk is unchanged." For a training folder, once per folder per session. The source visit moves to `blocked` (my call 8).

**Dropped work** (D2 amendment, § 5.4) gets its own warning, once per visit, when an extraction run ends unable to save. Something like "Couldn't read this folder's feature cache, so the new features weren't saved." This is not a refusal by main: the renderer did not attempt the save.

The renderer's own guard runs first, so in a correct build main should never refuse without an explanation. An unexplained refusal is a bug report.

## 8. Module boundary and the renderer's size

`media-viewer.js` is 12,190 lines on `main`, and this week's theme is stopping its growth (WEEKLY). The fix therefore moves the feature-cache IO out of the renderer instead of adding to it:

- **`feature-cache-store.js`** (pure ESM, the v2.0 pattern: a class with injected host callbacks, imported by `media-viewer.js` like `ml-training.js`). It owns the visit token and state, `ensureRead`, the save request, queue and frozen copy, the per-visit change counter, the IO lock (`_acquireCacheIoLock`'s replacement, shared with `MlTrainingManager`) and the autosave timer. It reaches the electron calls and the renderer's maps through injected callbacks.
- **The maps stay on `MediaViewer`** (`featureCache`, `clipCache`, `featureMetadata`), because many readers use them (`getCombinedFeatures`, `removeFileFromList`, the bulk-rated context and others). The store reads and writes them through the host. Moving the maps is not part of this PR.
- **What leaves the renderer:** `_acquireCacheIoLock`, `loadFeatureCache` / `_loadFeatureCacheImpl` / `_loadFeatureCacheLocked`, `saveFeatureCache` / `_saveFeatureCacheImpl` / `_saveFeatureCacheLocked`, and the autosave start/stop, about 340 lines (:9377–9700, :11746–11768). The renderer keeps thin calls into the store, plus the visit checks at the write sites of § 5.3.
- **`feature-cache-ledger.js`** (CommonJS, required by `main.js`): main's record and the close check of § 7, as pure functions.
- **Report** `wc -l media-viewer.js` before (12,190) and after, in the PR and at closeout. The target is a net decrease. If the renderer grows, the PR says by how much and why.
- CLAUDE.md § Architecture gains both new files. § Cache Management's feature-cache bullets are updated to the visit model; each new rule is one sentence plus one "why" (CLAUDE.md § Maintenance).

## 9. Testing

### 9.1 Red first, on `main`

Each trigger T1–T6 gets a unit test that fails on `main` before any fix. The run is recorded in the plan log, with the failing assertion. "Fails" means the wrong bytes reach disk, not that an internal field has an unexpected value. The one exception is T4a, tested at the state level (my call 13); T4b and T4c are tested at the disk.

- **Assert at the disk.** Each test drives renderer entry points that survive the refactor (`loadFolder` / `switchToFolder`, the autosave callback or `saveFeatureCache`, `handleFeatureWorkerMessage`, `prioritizeDisplayedFilesExtraction`, `startBackgroundFeatureExtraction`, `handleSortByPrediction`'s read phase). They run against a fake main that keeps an in-memory disk per folder and records every `open` / `chunk` / `close` call. The assertion is on what that disk holds afterwards, which is the shape the review's probes used ("writer called `[open /B, chunk 3, close]`; 1,997 lost"). The refactor may change only the harness wiring, never an assertion.
- The review's probe set-ups are the starting point: 21 real methods for T1; the first chunk held open for T2; real `switchToFolder` → `loadFolder`, real `prioritizeDisplayedFilesExtraction`, the real autosave callback and the real streaming save for T3.
- **Each test names its mutation**: the one-line change that must make it fail again on the branch (memory: `feedback_test_must_fail_against_unfixed_code`). For example, T3 fails again if `unread` is allowed to save; T2 fails again if the save iterates the live map instead of the copy.
- **Controls.** Each test has a control that must stay green on both `main` and the branch: the same sequence with no folder switch, or with the baseline set the way a completed read sets it. If a test's control and its target give the same answer, suspect the probe first (memory: `session_2026-10-19-pr85-g2-review`).

### 9.2 Preserved behaviour

The existing `loadFeatureCache incremental + signal` and `saveFeatureCache data-loss guards` suites (`media-viewer-utils.test.js` :5586 onwards and :5912 onwards) move to a new `tests/feature-cache-store.test.js` against the store. Every case keeps its meaning, except where this design changes it on purpose: the version-mismatch case now keeps the in-memory entries (my call 3), and the `loadFolder` reset test (:4916–4967) checks for a new `unread` visit instead of `_featureCacheDiskCount === 0`. Those changes are listed in the plan.

### 9.3 Main and the training path

- `feature-cache-ledger.js` gets unit tests for every rule of § 7.2: refuse `unseen`; allow `unseen` with full coverage; refuse it when one media file is missing, or one CLIP vector is missing with `clipRequired`; refuse `shrink`; allow a real shrink; allow a version change; allow `corrupt` / `absent`; treat a file that appeared after `absent` as no record; and refuse an open with no `fileCount`.
- Main's open classification (my call 12) gets a test that a read-stream error settles the open as `unreadable` instead of hanging. If `main.js` cannot be driven in-process, the classification moves into the ledger module or the E2E covers it; the plan decides.
- `ml-training.test.js` asserts that `_saveVectorCache` sends `fileCount` and `clipRequired`, that a refused close is reported and returns `false`, and that `_loadVectorCache` tells no file, corrupt and unreadable apart.
- The renderer's handling of a refusal (§ 7.3) is tested both ways: an explained refusal adopts the baseline and shows nothing; an unexplained one warns once and blocks the visit.

### 9.4 End to end, and the manual check

- **One E2E for the everyday workflow (T3).** Run an AI sort in folder A, which starts the pool and the autosave. Open folder B, whose cache holds many entries, browse a few files, then trigger the autosave (call the store's tick). Assert that B's `.feature_cache.json` still holds every entry. It must fail on `main`. The E2E harness's existing mlWorker warm-up rules apply (CLAUDE.md § Testing (E2E)).
- **Manual check before merge** (the user, or Claude driving the app with the user's go-ahead): **only on a copy** of a real folder and its `.feature_cache.json`, and on a copy of the profile under `MV_USER_DATA_DIR`, **never the user's live folders**. Steps: run an AI sort in copy A; open copy B; browse for over 30 s; check that B's entry count is unchanged; switch back to A; check that A's count is unchanged or grew; quit; check the session log for any refusal line.

## 10. Non-goals and anti-goals

**Non-goals:**
- recovering caches that are already damaged (D1);
- changing when extraction runs (it stays lazy, Group P3);
- the hash and sort caches (G2 PR 2 carries the atomic `write-folder-cache`, PR #85 review #5);
- merging `ml-training.js`'s cache code with the store (§ 6 checks it against the new rules; a 🟤 for the duplication is fine);
- saving on app quit (no save runs at quit today; a 🟤 if wanted);
- moving the feature maps out of `MediaViewer`;
- removing `computeFeatures`' dead `useHostCache: true` branch.

**Anti-goals** (it fails even if every test passes):
- a cache that is never saved: a folder that reads its cache but cannot save it, so every AI sort re-extracts;
- a refusal warning that fires in normal use (it means a rule in § 7.2 is wrong);
- the renderer growing.

## 11. Constraints

- **`main.js`** changes in the feature-cache handlers only. These are not "file move handlers", so PROJECT.md's Tier 1 rule does not apply by its letter. The user's approval of this design covers them anyway.
- **`preload.js`** stays untouched (my call 10).
- The Windows rename retry in `feature-cache-write-close` stays as it is. The refusal check runs before it.
- On Windows, the IO lock still has to serialize reads and writes (`_acquireCacheIoLock`'s EPERM rationale). One lock is still shared by the source folder and the training folders.

## 12. Size, schedule and model

**~7.5 SP** (the TODO says M). The two amendments add about half a point. It may run to 8–9 if Phase 0 turns up something unexpected in a "read" trigger or in main's read errors. Rough split:

| Part | SP |
|---|---|
| Phase 0: the six trigger tests, red on `main`, with controls; probe main's read-stream error | 1.5 |
| `feature-cache-store.js`: the visit, the read, the save, the queue, the counter, coverage; port the existing suites | 2 |
| The visit checks at the write sites, the visit's end (`_switchToFolderNow` and `loadFolder`), the empty branch, the AI sort's read gate | 1 |
| `feature-cache-ledger.js`, the `main.js` handlers (read classification and retry, coverage, counts), the training reader and header, reporting both ways | 1.5 |
| E2E, docs (CLAUDE.md, BACKLOG corrections), manual check | 1.5 |

**Schedule impact** (today is Wednesday 2026-10-21): this takes Wednesday and Thursday, probably into Friday.
- **G2 PR 2** (~7 SP) and its Thursday 24k smoke move to next week. That week is Cleanup Week #5 (Oct 26–30), so PR 2 is either its 🔵 exception or waits a week.
- **G3 (ZoomManager)** leaves this week.
- **G5's** Friday refresh records G1, G2 PR 1 and this fix.
- **G4** (2 SP) may still fit on Friday.

**Model**: Opus · `high` for the plan, since this is a data-loss path → execute with Opus · `medium` → review in a separate chat at `max`.

## 13. Left to the builder

- Names: the store's methods, the ledger's functions, the visit token's shape.
- How the store reaches the maps: getters or callbacks.
- The exact refusal wording, within § 7.3.
- Whether the frozen copy rounds while freezing or while streaming (the latter keeps the synchronous part short at 24k entries).
- Whether the read's merge happens in place or by building a new map (other code holds the map by `this.featureCache`, never by a saved reference; confirm before choosing).
- How the E2E triggers the autosave tick.

## 14. At closeout

- BACKLOG 🟤 [2026-07-20] "Attribute feature metadata at extraction time…": record that the destructive triggers are closed here. Check the entry off only if the visit model also closes the entry's own source-level gap (live `mediaFiles` lookups for metadata). If it does not, leave it open with that note.
- TODO 🔴 "Stop the feature cache being wiped" → DONE.md.
- Update WEEKLY.md's order note: G2 PR 2 is next.
