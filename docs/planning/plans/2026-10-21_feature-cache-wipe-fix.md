# Stop the Feature Cache Being Wiped — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [TODO.md](../TODO.md) 🔴 "Stop the feature cache being wiped on a folder switch (data loss)". Not in WEEKLY.md; it goes ahead of G2 PR 2 by the user's ruling at the PR #85 review.
**Spec**: [2026-10-21-feature-cache-wipe-design.md](../../superpowers/specs/2026-10-21-feature-cache-wipe-design.md). Approved by the user 2026-10-21 (`c4398d9`). The plan argues from it, and executors read both.
**Created**: 2026-10-21
**Status**: In progress
**Last Updated**: 2026-10-21
**Branch**: `fix-feature-cache-wipe` (from `main` @ `5cb1cfb`)

**Goal:** No load, extraction result or save can replace a folder's `.feature_cache.json` with a smaller copy or with another folder's entries. Main refuses a write it cannot account for.

**Architecture:**
- **`feature-cache-store.js`** (new, pure ESM) owns each folder *visit*, with its cache state (`unread` / `read` N / `absent` / `discard` / `blocked`). It also owns the read, the save queue with copies frozen at request time, the change counter, the IO lock and the autosave timer.
- **`media-viewer.js`** keeps the three maps. It routes every extraction write through the store with the visit the work started in, and ends or begins a visit on each folder change.
- **`feature-cache-ledger.js`** (new, CommonJS) holds main's rules: the per-file record, the read-error classification and retry, the stream parse, and the close check with full coverage. `main.js`'s four feature-cache handlers call it.

**Tech Stack:** Electron 39 (main: CommonJS; renderer: ES modules, no bundler), `stream-json`, Vitest 4 (node environment, extract-method tests), Playwright + Electron E2E, Prettier 3, ESLint 9 flat config.

## Global Constraints

- **Prettier** `tabWidth=4`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. **ESLint** `curly: all`, `eqeqeq`, `prefer-const`, `no-var`; prefix unused names with `_`. The `PostToolUse` hook and lint-staged format edited and staged files.
- **`preload.js` is not edited** (spec my call 10). Every new field rides the existing calls: `featureCacheOpen`, `featureCacheChunk`, `featureCacheClose`, `featureCacheWriteOpen(folder, header)`, `featureCacheWriteChunk`, `featureCacheWriteClose`. If a task finds it needs a preload edit, it stops and reports. The preload security review applies (CLAUDE.md § Best Practices).
- **`main.js`**: only the `feature-cache-open`, `feature-cache-write-open`, `feature-cache-write-chunk` and `feature-cache-write-close` handlers change, plus one `require` and one ledger instance. If nothing else uses it, `'feature'` also leaves `read-folder-cache`'s `oneOf`.
- **The renderer reaches the store only as `this.featureCacheStore`.** Extracted-method tests give the mock context a real store or `stubFeatureCacheStore()` (T3).
- **Values pinned by the spec:**
  - shrink guard: refuse when `baseline > 0 && entries < baseline * 0.5 && fileCount > entries * 2`, identical in the store and in main;
  - read chunk 1,000 and write batch 1,000 entries;
  - autosave every 30,000 ms;
  - main's read retries: 5 attempts, 150 ms apart, on `EBUSY`, `EPERM` or `EACCES`;
  - cache version: `MediaViewer.FEATURE_CACHE_VERSION` (4);
  - write-open header: `{ version, featureDim: 64, clipDim: 512, fileCount, clipRequired }`. `fileCount` is a non-negative integer, required, or main refuses the open. `clipRequired` is a boolean (`enableClipFeatures`).
- **Main's replies:**
  - open: `{ success: true, version, count }` | `{ success: false, notFound: true }` | `{ success: false, corrupt: true, error }` | `{ success: false, unreadable: true, error }`;
  - write-close: `{ success: true, written }` | `{ success: false, refused: 'unseen' | 'shrink', seen: number | null, written }` | `{ success: false, error }`.
- **Exact copy** (warnings through `notify(message, 'warning')`; counts formatted with `toLocaleString('en-US')`):
  - unexplained shrink refusal: `` `Feature cache not saved: it would have replaced ${seen} cached entries with ${written}. The cache on disk is unchanged.` ``
  - unexplained unseen refusal: `Feature cache not saved: this folder's cache was never read in this session. The cache on disk is unchanged.`
  - dropped work: `Couldn't read this folder's feature cache, so the new features weren't saved.`
  - a training folder: the same two refusal texts, with `Feature cache` replaced by `` `Training cache for "${name}"` `` (`name` = the folder's basename).
  - session-log lines via `logError`: `` `Feature-cache save refused by main (${refused}) for ${folder}: seen ${seen}, written ${written}${explained ? ' — explained, the file changed after this visit looked' : ''}` ``, and `` `Feature-cache read failed for ${folder}: ${error}` ``.
- **Red first.** Every trigger test (T1) is committed as `it.fails` / `test.fail` on `main`'s code, and flips to `it` / `test` in the task that fixes it. Before flipping, run it as plain `it` on the unfixed code and check that the failure is the test's own disk assertion, not a `TypeError` from the harness. Every other new test must fail before its step lands. Record each failing message in the Progress Log. A red test that passes is zero coverage: find out why.
- **The harness may change; assertions may not.** Between Task 1 and Task 3, `tests/feature-cache-harness.js`'s wiring changes. The trigger tests' assertion lines stay byte-identical (check with `git diff` at the flip).
- **Grep rule** (CLAUDE.md § Best Practices): grep code, tests and comments for every moved or renamed symbol (`_featureCacheDiskCount`, `featureCacheDirty`, `_saveFeatureCacheLocked`, `_loadFeatureCacheLocked`, `_acquireCacheIoLock`, `startFeatureCacheAutoSave`, `stopFeatureCacheAutoSave`, `featureCacheAutoSaveInterval`), and re-read every comment attached to changed code. Known stale comments: `cancelPendingFeatureExtractions`' "they will complete and be ignored"; `ml-training.js:106, 204, 305, 315, 325, 350, 388, 402`; `computeFeatures`' doc comment (point (1) names `_saveFeatureCacheLocked`).
- **The renderer must end shorter**: `media-viewer.js` is 12,190 lines at `5cb1cfb`. Target: a net decrease of at least 250 lines. Report `wc -l` at the end of T3 and T6.
- **Manual check only on copies**: never a live folder or the live profile (spec § 9.4).
- **Commits**: one per task, made by the controller in subagent-driven mode. Trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, or the executing model's own line. Never `--no-verify`. Pre-push runs the full E2E suite.

## Review Focus

1. **Folder switch, then an AI sort, while the old folder's flush is still streaming.** The new folder's read waits behind the old save on the IO lock. Expected: the old file gets the old folder's whole copy, and the read then reads the new folder. Pinned in T2: `a read queued behind another folder's save reads its own folder`.
2. **Reopening the folder already shown** (A → A). The flush writes A's copy, and the new visit is `unread`. Expected: the next read includes the flushed entries, and nothing is lost. Pinned in T3 Step 2: `reopening the same folder keeps what the flush wrote`.
3. **Three quick switches, A → B → C, before A's flush finishes.** Expected: only A's file is written. B's visit had nothing to save; C's visit is `unread`. Pinned in T2: `rapid switches write only the folder that had work`.
4. **A cache that was unreadable becomes readable later in the visit** (antivirus let go). Expected: the next `ensureRead` reads it and merges. The dropped-work warning appears at most once. Pinned in T2: `a visit whose read failed reads again next time`.
5. **The source folder is also the like folder**, and training writes its cache mid-visit (spec D4 amendment). Expected: the source visit's refused autosave is logged, not shown. The visit adopts main's count, and the run's tail save then passes the guard. Pinned in T2: `an explained refusal adopts main's count and shows nothing`.

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `feature-cache-store.js` | Create (T2) | `FeatureCacheStore`: visits, cache state, `ensureRead`, the frozen-copy save queue, the change counter, refusal handling, dropped-work warning, the IO lock, autosave. Pure functions `decideSave`, `coversFolder` |
| `feature-cache-ledger.js` | Create (T5) | Main's rules: `createFeatureCacheLedger`, `validateWriteHeader`, `classifyReadError`, `withReadRetries`, `parseFeatureCacheStream`, `checkClose` |
| `media-viewer.js` | Modify (T3) | Constructs the store; the visit's end and start in `loadFolder` / `_switchToFolderNow`; the write sites go through `putFeature` / `putClip`; the AI sort's read gate. Loses about 340 lines of IO |
| `ml-training.js` | Modify (T4) | The three-way read split; `fileCount` + `clipRequired` in the save header; refusal reporting; comments renamed |
| `main.js` | Modify (T5) | The four feature-cache handlers call the ledger |
| `tests/feature-cache-harness.js` | Create (T1) | Not a test file: `FakeMain` (an in-memory disk with hold points), `makeHost`, `stubFeatureCacheStore`, fixtures |
| `tests/feature-cache-wipe.test.js` | Create (T1) | The six trigger tests and their controls |
| `tests/feature-cache-store.test.js` | Create (T2) | The store's unit tests, including the ported load and save suites |
| `tests/feature-cache-ledger.test.js` | Create (T5) | The ledger's unit tests |
| `tests/e2e/feature-cache-wipe.test.js` | Create (T1, T6) | T3's everyday workflow end to end, plus main's refusals |
| `tests/media-viewer-utils.test.js` | Modify (T3) | Remove the two suites T2 ported; stub the store in the affected contexts; the named deliberate changes |
| `tests/like-or-skip-glue.test.js`, `tests/recent-folders-glue.test.js`, `tests/similarity-sort-glue.test.js` | Modify (T3) | Add `featureCacheStore` stubs where `loadFolder` / `_switchToFolderNow` / `handleSortByPrediction` run |
| `tests/ml-training.test.js` | Modify (T4) | Header, split, refusal |
| `CLAUDE.md`, `docs/README.md` | Modify (T6) | Architecture lines for both modules; § Cache Management and the `loadFeatureCache()` gotcha updated to the visit model |

**Live-surface preflight:** these live surfaces state the claims this plan changes:
- `CLAUDE.md:138` (the feature-cache bullet: shrink guard, staleness);
- `CLAUDE.md:140` (the training cache: "shrink-guard baseline (`diskCount`)", "the same `_acquireCacheIoLock`");
- `CLAUDE.md:193` (the `loadFeatureCache()` gotcha);
- `ml-training.js`'s comments listed above;
- `computeFeatures`' doc comment;
- BACKLOG 🟤 [2026-07-20] and TODO 🔴, updated at closeout.

All of them are in the table above or in the Closeout. `docs/ARCHITECTURE.md` names none of the moved symbols (grepped at `c4398d9`).

## Existing tests these changes reach (measured at `c4398d9`)

- `media-viewer-utils.test.js` § "loadFeatureCache incremental + signal" (:5586, 9 cases) and § "saveFeatureCache data-loss guards" (:5912, 5 cases). T2 ports them and T3 deletes them. Two change meaning on purpose:
  - "falls through to the legacy read when a chunk fetch throws" becomes "a mid-stream throw leaves the visit unread and the maps untouched";
  - "allows a fresh build-up when no on-disk cache is known (diskCount 0)" becomes "allows a fresh build-up when the visit found no file (`absent`)", plus a new "refuses one when the visit is `unread`".
- `media-viewer-utils.test.js` `loadFolder` reset (:4880–4967), whose case expects `_featureCacheDiskCount` to be 0. It becomes: `endVisit` runs before the maps are cleared, and `beginVisit(folderPath)` runs after.
- `media-viewer-utils.test.js` `handleSortByPrediction` warm-cache gate (:1738–1856). The gate becomes `featureCacheStore.needsRead()`. The cases that set up a warm `featureCache` to skip the load now set `needsRead: () => false`. That is a deliberate change (spec my call 4).
- Extract-method contexts that run `loadFolder`, `_switchToFolderNow`, `moveCurrentFile`, `moveComparePair`, `handleSortByPrediction` or `initializeFeaturePool`: `media-viewer-utils.test.js` (:878, :1600, :3408–3433, :3744, :4880, :8122, :8313, :8777–8779), `like-or-skip-glue.test.js` (:1129, :1231), `recent-folders-glue.test.js` (:134, :611), `similarity-sort-glue.test.js` (:120, :571, :1481, :2304). Each gains a `featureCacheStore` stub. No assertion changes except the ones named above.

## Task Ordering

T1 → T2 → T3 → T4 → T5 → T6.
- **T1** is red on `main` and touches no product code.
- **T2** builds the store in isolation.
- **T3** wires the renderer, which flips the trigger tests.
- **T4** (the training path) and **T5** (main) come after T3. Until T5, main ignores the new header fields, and the store treats a failed open with no flag as `unread`, which is the safe default. Requiring `fileCount` in T5 therefore breaks no commit: T3 and T4 already send it.
- **T6** flips the E2E, adds main's E2E and the docs, and reports the line count.

---

## Task 1: Reproduce the six triggers on `main` (red first)

**Files:**
- Create: `tests/feature-cache-harness.js`, `tests/feature-cache-wipe.test.js`, `tests/e2e/feature-cache-wipe.test.js`

**Interfaces:**
- Produces, from `tests/feature-cache-harness.js`:
  - `extract(name)`: the same regex and brace counting as `tests/similarity-sort-glue.test.js:20–35`, over `media-viewer.js`.
  - `deferred()` → `{ promise, resolve, reject }`.
  - `settle(ms = 30)`.
  - `makeFiles(folder, prefix, n)` → `[{ name: `${prefix}${i}.jpg`, path: `${folder}/${name}`, size: 1000 + i, mtimeMs: 5000 + i }]`.
  - `class FakeMain`:
    - `seed(folder, files)` writes a valid v4 entry for each file, with a 64-length vector, its size and mtime, and no clip.
    - `entriesOf(folder)` → `Map<name, entry> | undefined` (`undefined` = no file).
    - `writesTo(folder)` → the write-opens made for that folder.
    - `hold(method, nth = 1)` → a `release()` function that holds the nth call of `featureCacheOpen`, `featureCacheChunk`, `featureCacheWriteChunk` or `featureCacheWriteClose`.
    - `api` → the six `featureCache*` functions plus `path.basename`, `path.join`, `loadFolder(folder)` (a held or immediate listing), `logError` and `logPerf`.
    - It behaves like today's main: no checks. A close replaces the folder's entries with exactly what was written. Chunks use the legacy JSON shape `{ entries: [[name, entry]] }`.
  - `makeHost(main, { mediaFiles, folder })` → a mock `this` with the real extracted methods listed in Step 1, `isMlEnabled: true`, `featureWorkers: [fakeWorker]`, and a stub for every other `this.*` those methods touch. `probe-browse-wipe2.mjs`'s `ctx` is a complete list at `5cb1cfb`.
  - `startAutosave(host)` and `autosaveTick()`: the harness captures the interval callback by overriding `globalThis.setInterval` and `globalThis.clearInterval` (restored in `afterEach`), so the same helpers work before and after T3.
- Starting material (temporary, read now): the PR #85 reviewer's probes in `C:\Users\alexm\AppData\Local\Temp\claude\c--Users-alexm-Projects-media-viewer\e1d3241a-6fc7-480c-b58c-4fbed459c55c\scratchpad\pr85\closeout2\probes\`: `probe-browse-wipe2.mjs` (T3; it has the full `ctx` list for `switchToFolder` → `loadFolder` → `prioritizeDisplayedFilesExtraction` → autosave) and `probe-v1-save-spans-clear.mjs` (T2). Copy what helps; the plan does not depend on them surviving.

- [ ] **Step 1: Write the harness.** `makeHost` extracts these real methods: `switchToFolder`, `_switchToFolderNow`, `loadFolder`, `_abortInFlightPredictionSort`, `_invalidateSimilarityRun`, `_isStaleSimilarityRun`, `prioritizeDisplayedFilesExtraction`, `startBackgroundFeatureExtraction`, `cancelBackgroundExtraction`, `cancelPendingFeatureExtractions`, `enqueueFeatureExtraction`, `dispatchNextFeatureTask`, `handleFeatureWorkerMessage`, `awaitExtractionGate`, `calculateFeaturePriority`, `loadFeatureCache`, `_loadFeatureCacheImpl`, `_loadFeatureCacheLocked`, `saveFeatureCache`, `_saveFeatureCacheImpl`, `_saveFeatureCacheLocked`, `_acquireCacheIoLock`, `startFeatureCacheAutoSave`, `stopFeatureCacheAutoSave`. A method that does not exist (after T3) is skipped, not an error. `extractFeaturesFromMediaElement` is stubbed to resolve a `Float32Array(64)`. The worker is a fake `{ busy, posted, postMessage }`, and the test replies through `host.handleFeatureWorkerMessage(0, { type: 'result', id, features })`.

- [ ] **Step 2: Write the trigger tests in `tests/feature-cache-wipe.test.js`.** Folders are `/A`, `/B` and `/E` (empty). Each `it.fails` has a plain-`it` control that must pass on `main` and on the branch.

| Test (`it.fails` on `main`) | Set-up | Assertion |
|---|---|---|
| `T1: a late extraction result from the old folder does not replace the new folder's cache` | A open with 3 files. `main.seed('/B', makeFiles('/B','b',2000))`. `startBackgroundFeatureExtraction()` on A, with `loadMediaAsImageData` held for `a0`. `switchToFolder('/B')` and the listing resolves. Then release the image load and reply to its worker task, and let the run's tail save settle. | `expect(main.entriesOf('/B').size).toBe(2000)` |
| control: `T1 control: with no switch, the run saves its new entry` | the same, with no switch | `expect(main.entriesOf('/A').has('a0.jpg')).toBe(true)` |
| `T2: a save that is streaming when the folder changes writes the old folder's whole cache` | A: 2,500 files, all in memory and seeded on disk, read via `loadFeatureCache()`. Hold the first `featureCacheWriteChunk`. `saveFeatureCache()`, then `loadFolder('/B')` resolves, then release. | `expect(main.entriesOf('/A').size).toBe(2500)` |
| control | the same, with no `loadFolder` | `expect(main.entriesOf('/A').size).toBe(2500)` |
| `T3: browsing a folder whose cache was never read does not replace it` | A read; `startAutosave(host)`; `switchToFolder('/B')` (B seeded with 2,000, never read); view `b0`–`b2` with `currentMedia = { complete: true }` and `prioritizeDisplayedFilesExtraction()`; `autosaveTick()` | `expect(main.entriesOf('/B').size).toBe(2000)` |
| control: `T3 control: after B's cache is read, browsing adds to it` | the same, plus `await host.loadFeatureCache()` right after the switch | `expect(main.entriesOf('/B').size).toBe(2000)` (the three viewed files are among the 2,000) |
| `T4b: a read of the old folder that ends after a switch puts nothing in the new folder's file` | A seeded with 1,500 (two chunks). `loadFeatureCache({ signal })`, with the second `featureCacheChunk` held. Override `host._abortInFlightPredictionSort` (after `makeHost`) to abort that signal. `switchToFolder('/B')` resolves. Release the chunk. View `b0`; `autosaveTick()`. | `expect([...main.entriesOf('/B').keys()].every((n) => n.startsWith('b'))).toBe(true)` and `expect(main.entriesOf('/B').size).toBe(2000)` |
| control | the same, with no switch | A's 1,500 entries are in `host.featureCache` |
| `T4c: a read asked for in the new folder reads the new folder, even while the old folder's read is in flight` | A's `loadFeatureCache({ signal })`, with its `featureCacheOpen` held. `switchToFolder('/B')` resolves. `const pB = host.loadFeatureCache()`. Release A's open. `await pB`. | `expect(host.featureCache.has('/B/b0.jpg')).toBe(true)` |
| `T5: switching to an empty folder writes nothing into its cache file` | A lists `a0`–`a3`, with `a0`–`a2` on disk and read. View `a3`, so it is extracted and dirty the same way before and after T3. `startAutosave`; `loadFolder('/E')` (listing `{ success: true, files: [] }`); `autosaveTick()` | `expect(main.entriesOf('/E')).toBeUndefined()` |
| `T6: an entry added while a save is closing is saved by the next autosave` | A lists `a0`–`a6`, with `a0`–`a4` on disk and read. View `a5` (dirty). Hold the first `featureCacheWriteClose`. Tick 1 starts. While it is held, view `a6` through `prioritizeDisplayedFilesExtraction()`, and tick 2. Release. Settle; tick 3. | `expect(main.entriesOf('/A').has('a6.jpg')).toBe(true)` |
| control | the same, with `a6` viewed before tick 1 | `a6.jpg` is on disk |

- [ ] **Step 3: Run the tests, each as plain `it` first.** Run `npx vitest run tests/feature-cache-wipe.test.js`. Expected: every trigger test fails on its own assertion, and every control passes. Expected values from the probes:
  - T1: `B` 2000 → 0;
  - T2: `A` 2500 → 1000;
  - T3: `B` 2000 → 3;
  - T4b: `B` gets A's names;
  - T4c: no B entry;
  - T5: `/E` gets A's entries;
  - T6: `a6` missing.

  Log each message. A trigger that does not reproduce is a finding: log it, keep the test, and tell the controller. Do not "fix" the scenario until it fails. Then mark the six trigger tests `it.fails` and re-run. Expected: all pass.

- [ ] **Step 4: T4a, state-level, logged only** (spec my call 13). In a scratch test on `main` (not committed): A's open is held and `switchToFolder('/B')` resolves, then A's open is released with `count: 1500`. Log that `host._featureCacheDiskCount` is 1500, B's baseline inherited from A. T2's store test `a read that ended stale changes no state` is its branch-side pin.

- [ ] **Step 5: Write `tests/e2e/feature-cache-wipe.test.js` with one `test.fail`:** `browsing another folder after an AI sort leaves that folder's cache whole`.
  - Set-up: `seedTrainingState` as in `tests/e2e/ml-retrain-skip.test.js:57–68` (CLIP off; ≥3 likes and ≥3 dislikes, as that file's fixtures provide). Source A: `createTempFixtureDir()`. Source B: `createTempFixtureDir()` with at least 5 media files.
  - Before launch, write B's `.feature_cache.json` from Node. Each of B's files gets `{ vector: Array(64).fill(0.1), clipVector: null, size, mtime }` with its real `fs.statSync` size and `mtimeMs`, under `{"version":4,"featureDim":64,"clipDim":512,"features":{…}}`.
  - Steps: `loadFolder(page, A)`; one `handleSortByPrediction()` that completes (the training probe of that file). Then `loadFolder(page, B)`; `waitForMedia`; one Next and a 500 ms wait (the priority extraction runs 200 ms after a render); then `await page.evaluate(() => window.mediaViewer.saveFeatureCache())`.
  - Assertion (Node side): B's file still has every one of its entries, by name.
  - Run it once on `main`'s code and log the failure, then commit it as `test.fail`.

- [ ] **Step 6: Commit.** Run `npx vitest run` (all green, the trigger tests passing as `it.fails`).
```bash
git add tests/feature-cache-harness.js tests/feature-cache-wipe.test.js tests/e2e/feature-cache-wipe.test.js
git commit -m "test: reproduce the six feature-cache wipe triggers on main (it.fails until fixed)"
```

---

## Task 2: `feature-cache-store.js`

**Files:**
- Create: `feature-cache-store.js`, `tests/feature-cache-store.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces, as named exports:
  - constants: `FEATURE_DIM = 64`, `CLIP_DIM = 512`, `READ_CHUNK = 1000`, `WRITE_BATCH = 1000`, `AUTOSAVE_MS = 30000`;
  - the message strings: `DROPPED_WORK_MESSAGE`, `refusalMessage({ refused, seen, written, label = 'Feature cache' })`;
  - `decideSave(frozen)` and `coversFolder(...)`;
  - `class FeatureCacheStore`.
- **Constructor**: `new FeatureCacheStore({ io, getMaps, getMediaFiles, getConfig, basename, logError, notify, timers = globalThis })`.
  - `io = { open(folder), chunk(offset, limit), close(), writeOpen(folder, header), writeChunk(entries), writeClose() }`, each returning main's reply (Global Constraints).
  - `getMaps()` → `{ featureCache, clipCache, featureMetadata }`, the host's live `Map`s. The store mutates them in place and never reassigns them.
  - `getMediaFiles()` → `[{ name, path, size, mtimeMs }]`.
  - `getConfig()` → `{ featureCacheVersion, enableClipFeatures }`.
  - `basename(path)` is synchronous.
  - `timers` is read at call time (`this.timers.setInterval(...)`), so a test that overrides `globalThis.setInterval` captures the tick.
- **Visits:**
  - `visit` (getter) → `Visit | null`, where `Visit = Object.freeze({ id: number, folder: string })`.
  - `isCurrent(visit)` → `boolean`, by identity.
  - `beginVisit(folder)` → `Visit`. State `unread`, clean, no warnings issued yet.
  - `endVisit()` → `Promise<SaveResult> | null`. It flushes with `requestSave()` if the visit is dirty, and the copy is frozen before it returns. Then no visit is current. Callers do not await it.
  - `getState()` → `{ state: 'none' | 'unread' | 'read' | 'absent' | 'discard' | 'blocked', baseline: number | null, dirty: boolean }`.
  - `needsRead()` → `boolean`: true for `unread` and `blocked`.
- **Writes:** `putFeature(visit, path, vector)` → `boolean` and `putClip(visit, path, clipVector)` → `boolean`.
  - Both return false, and change nothing, when `visit` is not current.
  - `putFeature` sets `featureCache` and, when the path is in `getMediaFiles()`, `featureMetadata` to `{ size, mtime: mtimeMs || 0 }`.
  - Both bump the visit's change counter.
- **Reads:** `ensureRead({ signal, onProgress } = {})` → `Promise<number>` (`featureCache.size` afterwards).
- **Saves:**
  - `requestSave()` → `Promise<SaveResult>`. It is synchronous up to the freeze.
  - `saveIfDirty()` → `Promise<SaveResult | null>`.
  - `finishExtractionRun(visit)` → `Promise<SaveResult | null>`.
  - `startAutoSave()` / `stopAutoSave()`.
  - `acquireLock()` → `Promise<() => void>`.
  - `SaveResult = { outcome: 'written' | 'skipped' | 'refused' | 'failed', reason?: string, written?: number }`. Skip reasons: `'no-visit'`, `'empty'`, `'blocked'`, `'unread'`, `'shrink-guard'`.

- [ ] **Step 1: Write the failing tests** in `tests/feature-cache-store.test.js`, using a small in-file fake `io` (or `FakeMain` from T1's harness):
  - **`decideSave` matrix** (pure), one `it` per row:
    - `blocked` → `{ write: false, reason: 'blocked' }`;
    - 0 entries → `'empty'`;
    - `unread`, not covering → `'unread'`;
    - `unread`, covering → write;
    - `read` 23,559, 32 entries, 20,929 files → `'shrink-guard'`;
    - `read` 5,000, 500 entries, 500 files → write (a real shrink);
    - `absent` → write;
    - `discard` → write.
  - **`coversFolder`**: true when every file has an entry, and a clip vector when `clipRequired`. False on one missing entry, or one missing clip with `clipRequired`. True for a missing clip without `clipRequired`. False for an empty folder.
  - **The ported read suite**, the nine cases listed under "Existing tests…", each against `ensureRead`. The changed one: `a mid-stream throw leaves the visit unread and the maps untouched`.
  - **The ported save suite**, five cases. The changed ones: `allows a fresh build-up when the visit found no file (absent)` and `writes nothing when the visit is unread and the copy does not cover the folder`.
  - **The visit's read:**
    - `a read that ended stale changes no state`: the visit ended during the open, so the state is `none` for the old visit and the new visit stays `unread`, with baseline `null`.
    - `a cancel seen after the last chunk commits nothing`.
    - `a read requested by the current visit never joins an older visit's read`.
    - `the merge keeps this visit's extractions and lets the disk entry win on a shared path`.
    - `a version mismatch is discard and keeps the in-memory entries`.
    - `corrupt is discard; unreadable stays unread and logs once`.
    - `a second ensureRead in a read visit does not open the file`.
  - **The save:**
    - `the copy is frozen at the request`: entries added and the map cleared after `requestSave()` returns do not change what is written.
    - `a request while a save streams queues behind it with its own copy`.
    - `two queued requests for one visit coalesce to the newer copy`.
    - `a success re-baselines the current visit to the count written`.
    - `a success for a visit that already ended leaves the current visit alone`.
    - `dirty stays set when an entry arrived during the save`.
  - **Refusals** (§ 7.3):
    - `an explained refusal adopts main's count and shows nothing`: frozen `absent`, reply `{ refused: 'shrink', seen: 40 }`; the state becomes `read` 40, nothing goes to `notify`, and one line goes to `logError`.
    - `an explained unseen with seen null returns the visit to unread`.
    - `an unexplained refusal warns once per visit and blocks`: frozen `read`; two refusals; `notify` is called once with `refusalMessage(...)`; the state is `blocked`.
  - **Dropped work:**
    - `finishExtractionRun warns once when the read failed and the copy does not cover the folder`.
    - `…does not warn after a cancelled read` (the read was aborted, not failed).
  - **Review Focus:**
    - `a read queued behind another folder's save reads its own folder` (RF1);
    - `rapid switches write only the folder that had work` (RF3);
    - `a visit whose read failed reads again next time` (RF4);
    - the explained-refusal test above (RF5).
  - **Autosave:** `startAutoSave arms one 30 s interval that calls saveIfDirty; stopAutoSave clears it`.
  - **Reading again:** `needsRead is true for unread and blocked only` (spec my call 14).

- [ ] **Step 2: Run the tests.** Run `npx vitest run tests/feature-cache-store.test.js`. Expected: FAIL. The file fails to import `../feature-cache-store.js`.

- [ ] **Step 3: Implement `feature-cache-store.js`.**
  - **Port the read loop from `media-viewer.js:9417–9538`**: the binary and legacy chunk shapes, `ingest`'s staleness rule and the `.slice()` copies. Add these changes:
    - after every await, check `this.isCurrent(visit) && !signal?.aborted`, and abandon without committing when the check fails;
    - `io.close()` goes in a `finally`;
    - the commit sets the staged entries into the live maps in place, so the disk entry wins;
    - classify the reply as spec § 5.2 says, and set `readFailed` on unreadable and on a throw;
    - drop the legacy `readFolderCache` fallback.
  - **The single-flight**: keep `{ visit, promise }`, and reuse it only when `visit` is the current one.
  - **`_freeze()`** builds the copy from the live maps and a path→file `Map` of `getMediaFiles()`. It contains: `[name, vector, clip | null, size, mtime]` for each resolvable entry, with `name` from `basename(path)`; plus `fileCount`, `covers`, `state`, `baseline`, `changeCount`, `clipRequired`, `visit`, `folder` and `version`.
  - **The queue**: a promise chain, plus one "queued, not started" slot per visit that a newer request for the same visit replaces.
  - **`_write(frozen)`** runs under `acquireLock()`. It sends the header, the batches of `WRITE_BATCH` (rounded to 6 decimals, as `media-viewer.js:9631–9637`) and the close. It applies the reply as spec § 7.3 says, and only to the current visit.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/feature-cache-store.test.js`. Expected: PASS. Then run the mutation checks, each of which must fail at least one named test:
  - allow `unread` to write, which fails the `decideSave` row and `writes nothing when the visit is unread…`;
  - freeze lazily, inside `_write`, which fails `the copy is frozen at the request`;
  - drop the `isCurrent` check after the last chunk, which fails `a cancel seen after the last chunk commits nothing`.

  Log all three runs.

- [ ] **Step 5: Commit.**
```bash
git add feature-cache-store.js tests/feature-cache-store.test.js
git commit -m "feat: FeatureCacheStore — per-visit cache state, frozen-copy saves, explained refusals"
```

---

## Task 3: Wire the renderer to the store

**Files:**
- Modify: `media-viewer.js`, `tests/feature-cache-harness.js`, `tests/feature-cache-wipe.test.js`, `tests/media-viewer-utils.test.js`, `tests/like-or-skip-glue.test.js`, `tests/recent-folders-glue.test.js`, `tests/similarity-sort-glue.test.js`

**Interfaces:**
- Consumes: T2's `FeatureCacheStore`, all of it.
- Produces:
  - the MediaViewer field `featureCacheStore`;
  - `enqueueFeatureExtraction(filePath, imageData, priority, visit = this.featureCacheStore.visit)`, whose task gains `visit`;
  - `loadFeatureCache(options = {})` → `this.featureCacheStore.ensureRead(options)`;
  - `saveFeatureCache()` → `this.featureCacheStore.requestSave()`;
  - and, from the harness, `stubFeatureCacheStore(host)` → an object with `visit` set to a frozen `{ id: 1, folder: host.baseFolderPath }`, `isCurrent: () => true`, `beginVisit`, `endVisit` and `needsRead: () => true` as `vi.fn`s, and `putFeature` / `putClip` writing straight into `host`'s maps and returning `true`.

- [ ] **Step 1: Re-point the harness.** `makeHost` builds `host.featureCacheStore = new FeatureCacheStore({ io, getMaps, getMediaFiles, getConfig, basename, logError, notify })` over `FakeMain`. It drops the moved methods from the extract list, and `startAutosave` calls `host.featureCacheStore.startAutoSave()` when `startFeatureCacheAutoSave` is gone. Every T1 control must still pass. The trigger tests stay `it.fails` for now.

- [ ] **Step 2: Write the new wiring tests** in `tests/feature-cache-wipe.test.js`, as plain `it`. They must fail before Step 3:
  - `a failed listing on the switch path leaves no visit, and the autosave writes nothing` (spec my call 11): A is read and dirty; `switchToFolder('/B')` with the listing `{ success: false, error: 'x' }`; `autosaveTick()`. Expect `host.featureCacheStore.visit` to be `null` and no write-open for any folder after the switch.
  - `a failed listing from the dialog keeps the old visit`: the same, but through `loadFolder('/B')` directly. Expect `host.featureCacheStore.visit.folder` to be `'/A'`, and the tick writes A.
  - `reopening the same folder keeps what the flush wrote` (Review Focus 2): A is read, with `a3` viewed (dirty); `loadFolder('/A')`; settle; `await host.loadFeatureCache()`. Expect `main.entriesOf('/A').has('a3.jpg')` and `host.featureCache.has('/A/a3.jpg')`.

  Run `npx vitest run tests/feature-cache-wipe.test.js`. Expected: these three FAIL (there is no `endVisit` / `beginVisit` wiring yet). Log the messages.

- [ ] **Step 3: Wire `media-viewer.js`.** Each item names its location at `5cb1cfb`.
  - **Import and construct.** Add `import { FeatureCacheStore } from './feature-cache-store.js';` (:1–7). Construct the store before `this.mlTraining` (:206), with `getConfig: () => ({ featureCacheVersion: MediaViewer.FEATURE_CACHE_VERSION, enableClipFeatures: this.enableClipFeatures })` and `basename: (p) => window.electronAPI.path.basename(p)`.
  - **Remove the old fields.** Drop `featureCacheDirty`, `_featureCacheDiskCount` and `featureCacheAutoSaveInterval` (:281–283). `mlTraining`'s `cacheIo.acquireLock` becomes `() => this.featureCacheStore.acquireLock()` (:238).
  - **`loadFolder`**: replace `this._featureCacheDiskCount = 0;` (:3205) with `this.featureCacheStore.endVisit();`. In the empty branch, clear `featureCache`, `clipCache` and `featureMetadata`, then call `this.featureCacheStore.beginVisit(folderPath)` before `showDropZone()`. In the non-empty branch, call `beginVisit(folderPath)` right after the three clears (:3237–3239). Rewrite the comment block above it (:3191–3201), whose last sentence describes the removed reset.
  - **`_switchToFolderNow`**: just before `this.mediaFiles = [];` (:3625), call `this.cancelBackgroundExtraction(); this.featureCacheStore.endVisit();`, with a one-line comment citing spec my call 11.
  - **Delete the old IO** (about 340 lines): `_acquireCacheIoLock`, `loadFeatureCache` / `_loadFeatureCacheImpl` / `_loadFeatureCacheLocked`, `saveFeatureCache` / `_saveFeatureCacheImpl` / `_saveFeatureCacheLocked` (:9377–9700), and `startFeatureCacheAutoSave` / `stopFeatureCacheAutoSave` (:11746–11768). Add the two thin delegations, each with a one-line comment. Keep `static FEATURE_CACHE_VERSION = 4;` and fix its false comment ("must match FEATURE_VERSION": CLAUDE.md § Active gotchas says it does not).
  - **The pool's autosave**: `initializeFeaturePool` (:10764) calls `this.featureCacheStore.startAutoSave()`, and `shutdownFeaturePool` (:10956) calls `stopAutoSave()`.
  - **The write sites**:
    - `handleFeatureWorkerMessage` `result` (:10988–11001) becomes `this.featureCacheStore.putFeature(task.visit, task.filePath, features)`. Still `resolve` the task.
    - `prioritizeDisplayedFilesExtraction` (:10631) captures `const visit = this.featureCacheStore.visit;` on entry. The direct branch becomes `putFeature(visit, …)`. The queued branch returns if `!this.featureCacheStore.isCurrent(visit)` after `await this.loadMediaAsImageData(…)`, then enqueues with `visit`.
    - `startBackgroundFeatureExtraction` (:11305) captures `visit` at its start. It enqueues with it, and the CLIP `.then` calls `this.featureCacheStore.putClip(visit, file.path, clipVector)`. The tail (:11444–11448) becomes `await this.featureCacheStore.finishExtractionRun(visit);`.
    - `moveComparePair`'s fallbacks (:6965–6998) and `moveCurrentFile`'s (:1840–1848) become `putFeature(this.featureCacheStore.visit, …)`. These run under the file-op guard (spec § 6).
  - **The AI sort's Phase 1 gate** (:10392): `if (this.featureCacheStore.needsRead())`. Rewrite its comment.
  - **`cancelPendingFeatureExtractions`' comment** (:11155): in-flight tasks complete, and their results are dropped by the visit check.

- [ ] **Step 4: Fix the reached tests.**
  - Run `npx vitest run`.
  - For every failure of the form `Cannot read properties of undefined (reading '<store method>')`, add `featureCacheStore: stubFeatureCacheStore(ctx)` to that context.
  - Delete the two ported suites from `media-viewer-utils.test.js`.
  - Make the deliberate changes listed under "Existing tests…": the `loadFolder` reset case and the warm-gate cases.
  - Any other assertion change is a finding: stop and report it.

- [ ] **Step 5: Flip the trigger tests.**
  - Change the six `it.fails` to `it` in `tests/feature-cache-wipe.test.js`.
  - Run `npx vitest run tests/feature-cache-wipe.test.js`. Expected: all pass, Step 2's three included.
  - Run `git diff <T1's commit> -- tests/feature-cache-wipe.test.js`, with the SHA from the Progress Log. Apart from Step 2's added tests, it must show only `it.fails` → `it`.
  - Mutation checks, each of which must fail its named trigger:
    - drop the `isCurrent` check in `handleFeatureWorkerMessage`'s path (T1);
    - drop `endVisit` from `_switchToFolderNow` (T3, with the switch path);
    - drop the empty branch's `beginVisit` (T5).

    Log all three runs.

- [ ] **Step 6: Run everything and measure.**
  - `npx vitest run`: all pass.
  - `npm run lint`: no new warnings.
  - `wc -l media-viewer.js`: log the count; it must be ≤ 11,940.
  - Grep the symbols in Global Constraints across `*.js` and `*.md` outside `docs/archive`. The only hits left are in `CLAUDE.md` (T6) and `ml-training.js` (T4).

- [ ] **Step 7: Commit.**
```bash
git add media-viewer.js tests/
git commit -m "fix: tie every feature-cache read, write and save to its folder visit (T1-T6)"
```

---

## Task 4: The training path

**Files:**
- Modify: `ml-training.js`, `tests/ml-training.test.js`

**Interfaces:**
- Consumes: main's reply shapes (Global Constraints) and `refusalMessage` from T2.
- Produces:
  - `_loadVectorCache(...)` returns `{ entries, diskCount, aborted, unreadable }`;
  - `_saveVectorCache(folderPath, entries, diskCount, scanCount, { clipRequired = false } = {})` → `boolean`.

- [ ] **Step 1: Write the failing tests:**
  - `_saveVectorCache sends fileCount and clipRequired in the header`;
  - `a refused close is logged, warns once per folder per session, and returns false`, with the `Training cache for "<name>"` copy;
  - `_loadVectorCache reports unreadable apart from no file and corrupt`:
    - `{ success: false, notFound: true }` → `unreadable: false`, `diskCount: 0`;
    - `{ corrupt: true }` → `unreadable: false`, `diskCount: 0`;
    - `{ unreadable: true }` → `unreadable: true`, `diskCount: 0`;
  - `an unreadable training cache still extracts and attempts the save`.

- [ ] **Step 2: Run the tests.** Run `npx vitest run tests/ml-training.test.js`. Expected: the four new tests FAIL.

- [ ] **Step 3: Implement.**
  - The header gets `fileCount: scanCount` and `clipRequired`. `_collectFolderVectors` passes `{ clipRequired: enableClipFeatures }`.
  - Check `closed.refused`:
    - log the session line;
    - call `notify(refusalMessage({ ..., label: \`Training cache for "${name}"\` }), 'warning')`, once per folder path per manager instance, tracked in a `Set`;
    - return `false`.
  - `_loadVectorCache` sets `unreadable` from `opened.unreadable`. Nothing else changes in the flow: an unreadable folder still extracts everything, and main decides the save by coverage.
  - Rename the stale comments (Global Constraints).

- [ ] **Step 4: Run the tests.** Run `npx vitest run`. Expected: all pass.

- [ ] **Step 5: Commit.**
```bash
git add ml-training.js tests/ml-training.test.js
git commit -m "fix: training caches send fileCount/clipRequired and report main's refusals"
```

---

## Task 5: Main's ledger and handlers

**Files:**
- Create: `feature-cache-ledger.js`, `tests/feature-cache-ledger.test.js`
- Modify: `main.js:870–1015` (the four handlers), `main.js:9` (`require`)

**Interfaces:**
- Consumes: nothing.
- Produces, as CommonJS exports:
  - `createFeatureCacheLedger()` → `{ recordOpen(key, record), recordWrite(key, { count, version }), get(key) }`. A record is `{ seen: 'read', count, version } | { seen: 'absent' } | { seen: 'corrupt' } | { seen: 'unreadable' }`.
  - `validateWriteHeader(header)` → `{ ok: true, version, fileCount, clipRequired } | { ok: false, error }`.
  - `classifyReadError(err)` → `'absent' | 'retry' | 'corrupt' | 'unreadable'`: `ENOENT` → `'absent'`; `EBUSY` / `EPERM` / `EACCES` → `'retry'`; no `code` → `'corrupt'`; any other code → `'unreadable'`.
  - `withReadRetries(fn, { attempts = 5, delayMs = 150, sleep })` retries `fn` while `classifyReadError(err) === 'retry'`, then rethrows the last error.
  - `parseFeatureCacheStream(readable, { parser, pick, streamObject })` → `Promise<Array<[string, object]>>`. It uses `stream.pipeline` and rejects with the first error from any stage.
  - `checkClose({ record, destinationExists, header, written, writtenNames, clipNames, listFolderMedia })` → `Promise<{ ok: true } | { ok: false, refused: 'unseen' | 'shrink', seen: number | null, written }>`.

- [ ] **Step 1: Write the failing tests** (CommonJS through `createRequire`, as `tests/feature-cache-transport.test.js` does):
  - **`checkClose` refuses or allows:**
    - refuses `unseen` (no record, file exists, partial write);
    - allows `unseen` with full coverage;
    - refuses it with one media file missing;
    - refuses it with one clip missing when `clipRequired`;
    - treats an `unreadable` record as no record;
    - refuses `shrink` (read 2,000, written 3, fileCount 2,000);
    - allows a real shrink (read 2,000, written 500, fileCount 500);
    - allows a version change (read v3, header v4);
    - allows `corrupt` and `absent`;
    - treats `absent` with an existing destination as no record;
    - allows anything when the destination does not exist.
  - **`checkClose` lists the folder only when needed**: `listFolderMedia` is called only for the coverage case (assert with a `vi.fn`).
  - **`validateWriteHeader`** refuses a missing, negative or non-integer `fileCount`.
  - **`classifyReadError`**: one case per class.
  - **`withReadRetries`** retries `EBUSY` 4 times and succeeds on the 5th; it stops at once on `ENOENT`.
  - **`parseFeatureCacheStream`:**
    - `settles with an error when the source stream errors (EISDIR)`: a `Readable` that emits `error`, which today's `.pipe()` chain leaves unhandled (Progress Log, 2026-10-21 probe);
    - parses a small v4 file;
    - rejects a truncated one with an error that has no `code`.

- [ ] **Step 2: Run the tests.** Run `npx vitest run tests/feature-cache-ledger.test.js`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement `feature-cache-ledger.js`, then the handlers in `main.js`.**
  - **The ledger key**: `path.join(await fs.realpath(folderPath).catch(() => folderPath), FOLDER_CACHE_FILES.feature)`.
  - **`feature-cache-open`**:
    - a refused `assertFixedPath` → record `unreadable` and reply `{ success: false, unreadable: true, error }`;
    - the access and the parse run under `withReadRetries`, and the parse goes through `parseFeatureCacheStream`;
    - classify any failure, record it, and reply as Global Constraints says;
    - on success, record `{ seen: 'read', count, version }`.
  - **`feature-cache-write-open`**: refuse when `validateWriteHeader` fails. The writer gains `{ header, count: 0, names: new Set(), clipNames: new Set() }`.
  - **`feature-cache-write-chunk`**: for each entry, `count++` and add the name, plus the clip name when `value.clipVector` is set.
  - **`feature-cache-write-close`**, after the stream finishes:
    - work out `destinationExists`;
    - run `checkClose`, with `listFolderMedia = async () => (await fs.readdir(folder, { withFileTypes: true })).filter((d) => d.isFile() && isMediaFile(path.extname(d.name).toLowerCase())).map((d) => d.name)`;
    - on a refusal, `fs.unlink(tmpPath)` (ignore errors) and return the refusal;
    - otherwise rename (the existing retry loop), call `recordWrite`, and return `{ success: true, written: count }`.
  - **`read-folder-cache`**: if `'feature'` has no remaining caller, remove it from the `oneOf`.

- [ ] **Step 4: Run the tests.** Run `npx vitest run`. Expected: all pass. Then run the mutation check: the old `.pipe()` chain inside `parseFeatureCacheStream` must fail `settles with an error when the source stream errors` (it hangs, or throws unhandled). Log it.

- [ ] **Step 5: Commit.**
```bash
git add feature-cache-ledger.js tests/feature-cache-ledger.test.js main.js
git commit -m "fix(main): refuse feature-cache writes main cannot account for; classify read errors"
```

---

## Task 6: End to end, docs, and the line count

**Files:**
- Modify: `tests/e2e/feature-cache-wipe.test.js`, `CLAUDE.md`, `docs/README.md`, this plan

- [ ] **Step 1: Flip the E2E.** Change `test.fail` to `test`, then run `npx playwright test tests/e2e/feature-cache-wipe.test.js`. Expected: PASS.

- [ ] **Step 2: Add main's E2E tests** to the same file. Each grants a temp folder with 5 media files through `loadFolder`, and seeds its `.feature_cache.json` from Node as in T1 Step 5.
  - `main refuses a partial write to a cache it never saw`: through `window.electronAPI`, write-open with `{ version: 4, featureDim: 64, clipDim: 512, fileCount: 5, clipRequired: false }`, one entry, then close. Expect `refused: 'unseen'`, the file unchanged, and no `.tmp` left.
  - `main allows a write that covers every file without a read`.
  - `main refuses a shrink after a read`: `featureCacheOpen` then `featureCacheClose` first; then write 1 entry with `fileCount: 5`. Expect `refused: 'shrink'`, `seen: 5`.
  - `a corrupt cache file opens as corrupt and may be replaced`.
  - `a write-open without fileCount is refused`.

  Run the file. Expected: all pass.

- [ ] **Step 3: Docs.**
  - `CLAUDE.md` § Architecture: one line each for `feature-cache-store.js` and `feature-cache-ledger.js`.
  - `CLAUDE.md:138`: the feature-cache bullet's guard text becomes the visit model, in one sentence plus one "why".
  - `CLAUDE.md:140`: `_acquireCacheIoLock` → the store's lock.
  - `CLAUDE.md:193`: the `loadFeatureCache()` gotcha now reads: a visit reads at most once, and never saves unread.
  - Keep the growth under 500 bytes if possible. `scripts/check-claude-md-size.js` warns at commit.

- [ ] **Step 4: Full verification.**
  - `npx vitest run` and `npm run lint`.
  - `npx playwright test`: the full suite. If the known tournament flake (TODO 🟠) fails, re-run that file once and log it.
  - `wc -l media-viewer.js`: log it, with the net change against 12,190.

- [ ] **Step 5: Commit.**
```bash
git add tests/e2e/feature-cache-wipe.test.js CLAUDE.md docs/
git commit -m "test(e2e): browse-after-AI-sort keeps the cache; main's refusals; docs"
```

---

## Finish (after Task 6)

- [ ] **The manual check, on copies only** (spec § 9.4). It needs the user's go-ahead before Claude drives the app.
  - Set-up: copy a real folder and its `.feature_cache.json` to a scratch location, twice (A' and B'). Copy the profile, and run with `MV_USER_DATA_DIR` pointing at the profile copy.
  - Steps: an AI sort in A'; open B'; browse for more than 30 s; check that B's entry count is unchanged; switch back to A' and check its count is unchanged or larger; quit; check the session log for any `refused by main` line.
  - Log the counts.
- [ ] **Final review.** Ask the user before running `/code-review` in this chat. The default is a separate chat at `max` (memory `feedback_ask_before_in_chat_code_review`).
- [ ] **PR.** Link the spec and the plan. Cover:
  - the six triggers and their red→green runs;
  - the mutation runs;
  - the line count;
  - the refusal copy;
  - the schedule impact (G2 PR 2 next).

  Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

- **Remove `computeFeatures`' dead `useHostCache: true` branch.** Its only caller passes `false` (spec § 6). → BACKLOG 🟤.
- **One streaming read/write implementation.** `ml-training.js`'s `_loadVectorCache` / `_saveVectorCache` duplicate the store's chunk loop and batch writer. Both now follow the same main rules, so the store's IO could serve both. → BACKLOG 🟤.
- **Main installs no `uncaughtException` handler.** Today's unhandled `error` event on the read stream would surface as Electron's error dialog. A process-level handler that logs through `logger.js` would catch the next one. → BACKLOG 🟤.

## Residuals for Extract

- **T4a is pinned at the state level only** (spec my call 13). Recorded here; no BACKLOG entry.
- **No save at app quit** (spec § 10). A visit's last ≤ 30 s of extraction is lost on quit, as today. → BACKLOG 🟤.

## Closeout (after the merge, on `main`)

- [ ] Extract the Improvements and Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] From: feature-cache wipe fix closeout`.
- [ ] BACKLOG 🟤 [2026-07-20] "Attribute feature metadata at extraction time…": record that its destructive triggers closed here. Check it off only if the visit model closes its own source-level gap; otherwise leave it open with that note (spec § 14).
- [ ] TODO 🔴 "Stop the feature cache being wiped" → DONE.md. Update WEEKLY.md's order note: G2 PR 2 is next.
- [ ] Archive this plan to `docs/archive/plans/` (`git rm` the original), and link it from `docs/README.md`.
- [ ] Propagation check: re-read `CLAUDE.md:138/140/193` and the spec against what shipped.

## Model and Effort

| | Choice | Why |
|---|---|---|
| SP | M → ~7.5 | The spec's split (§ 12); the two amendments added ~0.5 |
| Execution | Opus · `medium` | The plan carries the design; this is a data-loss path, so no step below Opus |
| Switch | none for the plan; execution can stay in this session or a new one | the cache is warm |
| Final review | `max`, separate chat | the data-loss path, plus a main-process change |

## Progress Log

### 2026-10-21 — PHASE: Planning
- Spec approved (`c4398d9`). This plan is written from it.
- **Probe (plain Node, not Electron)**: main's `feature-cache-open` chain, `createReadStream(…).pipe(jsonParser()).pipe(jsonPick(…)).pipe(jsonStreamObject())` with `error` heard on the last stage only.
  - A read-stream error (EISDIR) was **not caught**: Node threw `Unhandled 'error' event`, and the open's promise never settled.
  - `main.js` installs no `uncaughtException` handler.
  - In the app, the renderer's open would never answer, and the renderer would hold its cache lock for the rest of the session.
  - Probe: `C:\Users\alexm\AppData\Local\Temp\claude\c--Users-alexm-Projects-media-viewer\0894eb63-25ad-4f3f-bbff-8e80c92a7a97\scratchpad\probes\pipe-error.cjs`.
  - It strengthens spec my call 12 ("probably never seen"), and T5's `parseFeatureCacheStream` test pins it.

### 2026-10-21 — PHASE: Implementation (native execution, Opus 5.5; ledger `.superpowers/sdd/2026-10-21_feature-cache-wipe-fix/progress.md`)
- **Status → In progress.** The user approved the plan and chose native (inline) execution.
- **T1, red on `main`** (`tests/feature-cache-wipe.test.js`, each trigger run as plain `it` first). Every trigger failed on its own disk assertion, with the probes' values; every control passed:
  - T1: `expected +0 to be 2000` (B's file replaced by `{}`);
  - T2: `expected 1000 to be 2500`;
  - T3: `expected 3 to be 2000`;
  - T4b: `expected false to be true` on "every name in B's file starts with b" (A's names written into B);
  - T4c: `expected false to be true` (`/B/b0.jpg` absent: B's caller got A's aborted read);
  - T5: `expected Map{ 'a0.jpg' => …, …(3) } to be undefined` (A's 4 entries written into `/E`);
  - T6: `expected false to be true` (`a6.jpg` never saved).
  - Then marked `it.fails`: 14/14 pass. Both forms are Prettier-stable, so the T3 flip diff is `it.fails` → `it` only.
- **T4a, state level** (scratch test, deleted): A's open held, switch to B, release. `_featureCacheDiskCount` went 0 → 1500 (A's count) while `baseFolderPath` was `/B`, and A's 1,500 entries (`/A/…` paths) were committed into B's map.
- **E2E on `main`** (`tests/e2e/feature-cache-wipe.test.js`, run once as plain `test`): B's 5 cached names became 2 (`b4.png`, `b5.png`, the two files viewed). Committed as `test.fail` (passes as expected-fail).
- Harness deviations from the plan's wording are ledgered as rulings (makeHost's options, the sort signal in T4b/T4c, T3's 2,003-file listing, T2's extra write assertion, the added T4c/T5 controls, two shortened titles).
- **T2, `feature-cache-store.js`**: `tests/feature-cache-store.test.js` first failed on the import (`Cannot find module '../feature-cache-store.js'`), then 64/64 passed. Mutation runs, each restored afterwards:
  - `unread` may write → 4 fail: `decideSave > unread, not covering`, `writes nothing when the visit is unread and the copy does not cover the folder`, `finishExtractionRun warns once…`, `a visit whose read failed reads again next time`;
  - freeze lazily inside the save → 2 fail: `the copy is frozen at the request`, `rapid switches write only the folder that had work`;
  - no live check after the chunk await → 1 fails: `a cancel seen after the last chunk commits nothing`.
  - Full suite: 1,975 passed, 1 skipped.
