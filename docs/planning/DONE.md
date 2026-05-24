# DONE

Completed tasks with implementation details and learnings.

**Last Updated**: 2026-05-14 <!-- Group B: AI Prediction Display Bugs -->

**Purpose**: Historical record of completed work.
**Active tasks**: See [TODO.md](TODO.md)
**Project context**: See [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)

---

<!-- Organize by month, newest first. -->

## 2026-05 (May)

### 2026-05-21 — PR #33 Hygiene + Integration Tests (Groups C + D)

**Summary**: Closed four PR #33 review follow-ups in one PR. Three defensive
hardenings around CLIP toggle/sort paths and one fixture-driven integration
test pattern covering both branches of the cache-hit sort call graph.

**Changes**:
- `media-viewer.js` toggle-off handler: clear `clipUnloadTimer` before
  cleanup; wrap `deleteSortCache('clip')` in try/catch.
- `media-viewer.js` `insertNewFilesInSortedOrder`: per-file abort check
  at the top of the outer for-loop in both CLIP and hash branches.
- New file `tests/integration/cached-sort-path.test.js`: three tests
  wiring real `applyCachedSortOrder` → real `insertNewFilesInSortedOrder`
  to assert algorithm strings thread end-to-end (CLIP, VPTree, missing
  field fallback).

**Test results**: 195/195 unit tests pass, 39/39 E2E tests pass.

**Spec**: [docs/superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md](../superpowers/specs/2026-05-21-pr-33-hygiene-and-integration-tests-design.md)
**Plan**: [docs/superpowers/plans/2026-05-21-pr-33-hygiene-and-integration-tests.md](../superpowers/plans/2026-05-21-pr-33-hygiene-and-integration-tests.md)
**PR**: [#36](https://github.com/GoodAlex223/media-viewer/pull/36)

---

### [2026-05-14] Group B: AI Prediction Display Bugs

**Spec**: [docs/superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md](../superpowers/specs/2026-05-14-ai-prediction-display-bugs-design.md)
**Plan**: [docs/superpowers/plans/2026-05-14-ai-prediction-display-bugs.md](../superpowers/plans/2026-05-14-ai-prediction-display-bugs.md) (to be archived after PR merge)
**Summary**: Fixed two related ML prediction display bugs sharing the root theme "prediction state is not re-synchronized with `mediaFiles` when the file list changes." (1) After undoing a rating via `handleCancel()`, the prediction percentage badge disappeared for the restored file: `removeFileFromList()` aggressively cleared `featureCache`/`clipCache`/`predictionScores`/`featureMetadata` at rating time, so the restored file had no ML state. Fixed by adding `restoreFeatureCachesFromHistory(entry)` helper (inverse of `removeFileFromList`) called in all 4 `handleCancel` branches before `showMedia()`. Special-move branch (no `reverseMlModelUpdate` path) explicitly calls `requestPredictionScores()` when `isSortedByPrediction` is true. (2) AI-sort prediction percentages didn't match underlying files (e.g., "99% / 56%" instead of "99% / 54%"): `sortComplete` handler in `handleMlWorkerMessage` ignored `message.scores` from the ml-worker, leaving `predictionScores` stale from prior `scoreComplete` events. Fixed by iterating `message.scores` and writing into `predictionScores` by path before applying `mediaFiles = sorted`. Also captured `mlFeatures` in `moveToSpecialFolder`'s history entry so special-undo can also restore the badge (was previously omitted).
**Key Changes**:
- `media-viewer.js` — New `restoreFeatureCachesFromHistory(entry)` method placed immediately after `removeFileFromList` (~L1018); splits 576-dim into `featureCache`(64) + `clipCache`(512), or restores only `featureCache` for 64-dim, no-ops on null/unexpected; restores `featureMetadata` with `mtime: 0`. `handleMlWorkerMessage` `case 'sortComplete'` now iterates `message.scores` to populate `predictionScores` before reordering. `moveToSpecialFolder` captures `mlFeatures` via `getCombinedFeatures` (or `featureCache` fallback) before the move IPC and attaches to historyEntry. All 4 `handleCancel` branches call the new helper before `showMedia()`; special branch additionally calls `requestPredictionScores()` when AI-sorted. Doc-comment on `removeFileFromList` corrected to list all 5 caches it clears.
- `tests/media-viewer-utils.test.js` — 3 new `describe` blocks: `restoreFeatureCachesFromHistory` (5 tests covering 576-dim split, 64-dim only, null/null-features no-op, unexpected-length no-op, featureMetadata restoration), `handleMlWorkerMessage sortComplete` (2 tests: score propagation, defensive missing-scores), `handleCancel feature restore` (3 tests: single-mode like-undo with 576-dim, compare-mode pair-undo with mixed 576+64-dim, special-move undo in AI-sorted mode).
**Commits**: 5 on `fix/ai-prediction-display-bugs` (69f861b helper + tests, 2b2f1dc doc-comment fix, 40c8fe6 sortComplete score propagation + tests, 9efdff4 moveSpecial mlFeatures capture, 0b43a13 handleCancel restore branches + tests) + 3 doc commits prior (bc0379a plan, 7a78e48 CLAUDE.md Next-planned sync, 8956ea5 spec)
**Test results**: 190/190 unit tests pass (was 180 baseline; +10 new: 5 helper + 2 sortComplete + 3 handleCancel); E2E: skipped (no E2E coverage for ML state transitions today; would require heavy setup — rate ≥3 files for training, kick extraction, sort, undo — tracked as separate BACKLOG item if needed). `npm run lint` and `npm run format:check` clean.
**Code review**: Pending (PR review).
**Manual scenarios**: Pending user smoke test (interactive Electron app — cannot be run from CLI). Scenarios to verify before merge: (1) AI sort percentages now align with each file's score; (2) AI-sort → undo single rating → badge re-appears with correct %; (3) AI-sort → undo compare pair → both badges re-appear; (4) AI-sort → special-folder rating → undo → badge re-appears; (5) Regression: rate-undo without AI sort works as before (no badge, by design).
**Spawned BACKLOG items**: (none yet — will surface during PR review or manual smoke).
**PR**: [#35](https://github.com/GoodAlex223/media-viewer/pull/35)

---

### [2026-05-07] Group A: CLIP Extraction Silent Failure

**Spec**: [docs/superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md](../superpowers/specs/2026-05-06-clip-extraction-silent-failure-design.md)
**Plan**: [docs/archive/plans/2026-05-06-clip-extraction-silent-failure.md](../archive/plans/2026-05-06-clip-extraction-silent-failure.md)
**Summary**: Wired `startBackgroundFeatureExtraction()` into `loadFolder()` via a new `kickoffBackgroundExtractionIfEnabled()` helper. Resolves the 🔴 blocker where CLIP-enabled fresh-folder loads silently produced no `.feature_cache.json` and CLIP sort then threw `"Only 0 files have CLIP embeddings"`. Root cause confirmed during brainstorming: `startBackgroundFeatureExtraction()` had no call site in `loadFolder()` at all — the only caller was inside `handleSortByPrediction()`'s lazy ML-init block, so a fresh CLIP-enabled folder load left `featureWorkers.length === 0` and `clipWorkerReady === false` and no extraction ran. Hash sorts kept working because `handleSortBySimilarity` computes perceptual hashes inline (independent pipeline). Fix is strictly scoped: gated on `enableClipFeatures` (CLIP-off path unchanged), idempotent guards on `featureWorkers`/`clipWorkerReady`/`clipModelDownloading`, fire-and-forget extraction with `.catch(err => logError(...))`, called after `updateFolderInfo()` so the first frame renders before kickoff. Six unit tests cover each branch.
**Key Changes**:
- `media-viewer.js` — New `kickoffBackgroundExtractionIfEnabled()` method on `MediaViewer` placed immediately before `async startBackgroundFeatureExtraction()`; guards (in order): `!enableClipFeatures` early-return → `featureWorkers.length === 0` ⇒ `initializeFeaturePool()` → `!clipWorkerReady && !clipModelDownloading` ⇒ `initClipModel()` → fire-and-forget `startBackgroundFeatureExtraction().catch(err => window.electronAPI?.logError(...))`. Called from `loadFolder()` after `this.updateFolderInfo()` and before the `console.log('Successfully loaded ...')`.
- `tests/media-viewer-utils.test.js` — New `describe('kickoffBackgroundExtractionIfEnabled', ...)` block with 6 tests. `beforeEach`/`afterEach` save/restore `globalThis.window` (mocks `electronAPI.logError`); `makeCtx({ ... })` factory provides spy stubs for `initializeFeaturePool` / `initClipModel` / `startBackgroundFeatureExtraction` with overridable defaults. Tests: (1) CLIP-off no-op, (2) fresh-state full happy path, (3) skip `initializeFeaturePool` when workers exist, (4) skip `initClipModel` when ready, (5) skip `initClipModel` during download, (6) reject promise → `logError` called with error message.
**Commits**: 7 on `fix/clip-extraction-silent-failure` (TDD walk: 77e5594 disabled no-op test+stub, 091fa55 fresh-state happy path, be50953 featureWorkers guard, 6cc5d5d clipWorkerReady guard, bf1a6d2 clipModelDownloading guard, 95af64a `.catch`/`logError`, 8cae645 wire into `loadFolder`) + 2 doc commits (c1379b7 spec, 170bc0c plan)
**Test results**: 177/177 unit tests pass (was 171 baseline; +6 new); E2E: skipped (E2E for full kickoff → progress notification → `.feature_cache.json` written → CLIP sort succeeds chain would require either real 87 MB CLIP model download or extensive transformers.js mocking; unit tests prove kickoff wiring; existing `clip-graceful-degradation.test.js` covers CLIP-unavailable path)
**Code review**: Approve for merge. 0 Critical, 0 Important, 5 Minor (M1 hypothetical sync-throw if `startBackgroundFeatureExtraction` ever drops `async` — accepted; M2 `originalWindow` save/restore would set `undefined` rather than `delete` if previously absent — matches file convention; M3 microtask-drain pattern in rejection test is fragile but vitest-idiomatic — accepted; M4 spec mentions "167 currently" but actual baseline was 171 — cosmetic spec drift, doesn't affect impl; M5 method name verbosity acceptable per single-source-of-truth rationale)
**Manual scenarios**: User executed the 8-step manual repro on 2026-05-07 — passed. CLIP-enabled fresh-folder load now triggers progress bar within ~5s, writes `.feature_cache.json`, and CLIP sort works without the "Only 0 files have CLIP embeddings" error. Two unrelated UI bugs surfaced during the session (see Spawned BACKLOG items below).
**Spawned BACKLOG items** (3): (1) Toggle-on kickoff (deferred from spec) — when user toggles CLIP **on** in Settings while a folder is already loaded, should we kick off extraction for the current folder? Today only the toggle-off path is handled. (2) Compare-mode → folder-switch leaves stale media wrappers visible (PR #34 manual test) — `switchToSingleModeUI()` reverts mode flag but doesn't remove leftover `.compare-wrapper` DOM nodes; new folder media renders alongside shrunk previous wrappers. (3) Hash sort + AI sort not mutually exclusive (PR #34 manual test) — both can apply in sequence with independent undo affordances; user-suggested unification into a single Sort menu.
**PR**: [#34](https://github.com/GoodAlex223/media-viewer/pull/34)

---

### [2026-05-03] CLIP Sort Follow-ups

**Spec**: [docs/superpowers/specs/2026-05-02-clip-sort-followups-design.md](../superpowers/specs/2026-05-02-clip-sort-followups-design.md)
**Plan**: [docs/archive/plans/2026-05-02-clip-sort-followups.md](../archive/plans/2026-05-02-clip-sort-followups.md)
**Summary**: Three Group D BACKLOG follow-ups shipped together. (1) `insertNewFilesInSortedOrder` is now algorithm-aware: takes a third `algorithm` parameter from `cachedData.algorithm`; CLIP path scores by cosine distance over `clipCache`; hash path is byte-equivalent to pre-change behavior. Files without CLIP vectors are end-appended (matches `sortMediaBySimilarityClip` first-time-sort fallback). Fixes silent semantic-ordering corruption when adding new files to a CLIP-cached folder. (2) CLIP toggle-off in Settings (F1) now cleans up: synchronously reverts `sortAlgorithm` to `'vptree'` (constructor default) and updates the dropdown if the user was on CLIP, then `await deleteSortCache('clip')` clears the persisted entry. Revert-before-await ordering eliminates the transient "CLIP shown but disabled" UI state. (3) Added 7 new unit tests: 4 characterization tests for `sortMediaBySimilarityClip` (worker side, including MST chain ordering, missing-vector fallback, abort-flag throw, insufficient-vectors guard) + 3 algorithm-aware tests for `insertNewFilesInSortedOrder` (renderer side, including a regression guard for the unchanged hash path). Test count 160 → 167.
**Key Changes**:
- `media-viewer.js` — New `calculateCosineDistance()` method (~10 LoC, mirrors `sorting-worker.js`); `applyCachedSortOrder` passes `cachedData.algorithm` to insertion; `insertNewFilesInSortedOrder` branches on algorithm with byte-equivalent hash else-branch; CLIP toggle handler is now `async` with revert-before-await cleanup
- `sorting-worker.js` — Extended `module.exports` to include `sortMediaBySimilarityClip` + `sortMediaBySimilarityMST` (freebie for future MST tests); discoverability comment near `abortFlag = false` flagging test contract
- `tests/sorting-worker.test.js` — New `describe('sortMediaBySimilarityClip', ...)` block with 4 tests; `resetAbort()` helper exploits worker's outer try/catch to reset abort flag without depending on test's own try/catch
- `tests/media-viewer-utils.test.js` — New `extractAsyncMethod` helper using `Object.getPrototypeOf(async function(){}).constructor`; new `describe('insertNewFilesInSortedOrder (algorithm-aware)', ...)` block with 3 tests using `extractMethod` pattern
**Commits**: 13 on `feature/clip-sort-followups` (779f630 spec, e427049 plan, 91f87e6 export extension, bb1052d tests, 30486df review fixes, cdf631e cosine method, ae1f241 extractAsyncMethod, 2252d32 algorithm-aware insertion + tests, 0eaf7ca caller update, 0ce9cec toggle-off cleanup, 80ac67d M1+M3 polish, c538bc0 + ba7f2bc CLAUDE.md syncs, 1a9b1bc BACKLOG bug entry)
**Test results**: 167/167 unit tests pass (was 160 baseline; +7 new), 39/39 E2E tests pass (unchanged; no E2E added — toggle-off behavior covered by manual scenarios)
**Code review**: Approve for merge. 0 Critical, 0 Important, 3 Minor (M1 cosine null-return divergence between renderer/worker — fixed in 80ac67d with explanatory comment; M2 inline comments lost during else-branch extraction — left as cosmetic; M3 toggle-off revert-after-await ordering — fixed in 80ac67d with reorder)
**Manual scenarios**: Scenario 1 attempted on `Act2_Warm` folder; revealed pre-existing CLIP background-extraction bug (separate from this branch's scope) — extraction silently does not fire on folder load, so no CLIP vectors exist for the cache-hit insertion path to be exercised end-to-end. Bug filed in BACKLOG. Remaining scenarios skipped pending extraction-bug fix.
**Spawned BACKLOG items** (2): CLIP background extraction silently does not fire on folder load (high priority, blocks all CLIP features end-to-end); UX-visible "extraction starting" notification to surface failure modes faster
**PR**: TBD (pending push)

---

## 2026-04 (April)

### [2026-04-29] Group F: Build & DX

**Spec**: [docs/superpowers/specs/2026-04-29-group-f-build-dx-design.md](../superpowers/specs/2026-04-29-group-f-build-dx-design.md)
**Plan**: [docs/archive/plans/2026-04-29-group-f-build-dx.md](../archive/plans/2026-04-29-group-f-build-dx.md)
**Summary**: Two independent tooling fixes shipped together. (1) Lucide icon CDN pinned from `lucide@latest` to `lucide@1.14.0` with SHA-384 SRI integrity hash and `crossorigin="anonymous"`; SRI mismatch causes browser to refuse load (icons silently disappear via existing `if (typeof lucide !== 'undefined')` guard at `media-viewer.js:356` — loud-failure mode by design). (2) `regression-checker` agent updated for the FullscreenManager extraction (TASK-019, March): Section 2 rewritten from "AbortController Cleanup" (stale `cleanupFullscreen`/`fullscreenAbortControllers` symbols) to "Fullscreen Lifecycle (FullscreenManager)" referencing `this.fullscreen.cleanup()` / `.toggle()` / internal `abortController()`; line-count updated `6600+` → `~7400`; new Section 8 "v2.0 Modular Subsystems" codifies the audit pattern for future manager extractions (ZoomManager, CompareManager, SortingManager, MLManager planned). Side effect: added narrow `.gitignore` exception (`.claude/*` + `!.claude/agents/`) so the regression-checker.md ships via PR instead of staying per-developer.
**Key Changes**:
- `index.html` — Lucide `<script>` tag pinned to `@1.14.0` with `integrity="sha384-jB6ZXxyEV94yzTxgLMvrwwNbn/pTTqwrMDI+v8FV5o5FnId/yn3DJwSdrDujU9A7"` and `crossorigin="anonymous"`; inline 3-line comment documents the bump procedure (curl|openssl one-liner)
- `.claude/agents/regression-checker.md` — Section 2 rewrite, line-count fix, new Section 8 (now tracked in git for the first time since `90bae8e` removed `.claude/`)
- `.gitignore` — `.claude/*` pattern with `!.claude/agents/` exception; `.superpowers/brainstorm/` added (transient brainstorming session artifacts)
- `CLAUDE.md` — auto-managed sync: `.claude/agents/` added to architecture tree; new gitignore-pattern gotcha; line-count corrected `~6300+` → `~7400` (actual `wc -l` 7468); In-progress block reflects Group F shipping
**Commits**: 4 implementation commits on `feature/group-f-build-dx` (2a5597a Lucide pin, 009420c comment self-contained per code review, b6ef9d7 track .claude/agents/, 1efbdc1 regression-checker update) + 3 housekeeping (11f4317 brainstorm-ignore + auto-memory, a50ed41 .claude/agents/ doc, plus this closeout) + 2 doc commits (86509ea spec, 042cedc plan)
**Test results**: 160/160 unit tests pass (no test changes needed — both fixes are static-file edits)
**Code review**: 1 Important finding addressed (comment "see PR for procedure" → self-contained inline curl|openssl); 0 Critical, 0 remaining Important. Spec compliance review passed for both tasks.
**Pending verification**:
- Manual smoke test: user runs `npm start` and confirms icons render across toolbar/dropzone/overlay/playback/settings — required before merge
- Agent dispatch verification: Step 2.5 deferred due to subagent quota exhaustion; tracked in BACKLOG to run post-quota-reset against commit `43db8af`
**Spawned BACKLOG items** (5): full regression-checker audit; migrate Lucide to bundled npm; deferred agent dispatch verification; cleanup duplicate `!.claude/agents/` line in .gitignore; auto-update or remove line-count reference in agent file

---

### [2026-04-21] Group E: Resource Management

**Spec**: [docs/superpowers/specs/2026-04-20-group-e-resource-management-design.md](../superpowers/specs/2026-04-20-group-e-resource-management-design.md)
**Plan**: [docs/archive/plans/2026-04-20-group-e-resource-management.md](../archive/plans/2026-04-20-group-e-resource-management.md)
**Summary**: Two backend lifecycle fixes shipped together. (1) CLIP model now unloads 30 seconds after background extraction completes, reclaiming ~200-400 MB of main-process memory; re-loads transparently from transformers.js disk cache on next CLIP IPC. Renderer-side timer is cleared at the start of `startBackgroundFeatureExtraction()` so folder-switch within the grace window keeps the model loaded. (2) `logger.init()` now closes any existing fd before opening a new one, preventing fd leaks on hypothetical double-init. Local-capture pattern in `extractClipEmbedding`/`extractClipEmbeddingBatch` ensures mid-await safety against concurrent `unloadClipModel` IPC.
**Key Changes**:
- `main.js` — New `ipcMain.handle('unloadClipModel')` nulls `clipProcessor`/`clipVisionModel`/`clipModelError` (returns `{success: false, reason: 'loading'}` if `clipModelLoading`); `extractClipEmbedding` and `extractClipEmbeddingBatch` capture `processor`/`model` into local consts after `loadClipModel()` resolves with null-guard returning `{success: false, error: 'CLIP unavailable'}`
- `preload.js` — `unloadClipModel: () => ipcRenderer.invoke('unloadClipModel')` exposed on `electronAPI`
- `media-viewer.js` — `this.clipUnloadTimer = null` field added to constructor; `clearTimeout` at start of `startBackgroundFeatureExtraction()`; `setTimeout(window.electronAPI.unloadClipModel, 30000)` at end (gated on `this.enableClipFeatures`)
- `logger.js` — `init(logDir)` closes existing `logFd` (try/catch around invalid-fd) and resets `logFd = null` before opening new fd
- `tests/logger.test.js` — New unit test asserts `fs.closeSync` is called once on second `init()` via `vi.spyOn` delta assertion
**Commits**: 5 implementation commits on `feature/resource-management` (b9f3b7e logger guard, a26fba8 vi import cleanup per code review, e7d84d0 unloadClipModel IPC, 782b61a local-capture race mitigation, d65bfdd renderer timer wiring) + 2 doc commits (6c8bb68 spec, ade533e plan)
**Test results**: 160/160 unit tests pass (13 logger tests including new); 39/39 E2E tests pass (including `clip-graceful-degradation.test.js`)
**Code review**: Approve for merge. 0 Critical, 0 Important, 4 Minor (M1 named constant for 30000, M2 clipModelError reset behavior on persistent failures, M3 setTimeout/clear race noted as accepted tradeoff, M4 verbose timer comment) — 3 actionable items added to BACKLOG.md
**PR**: [#31](https://github.com/GoodAlex223/media-viewer/pull/31)

---

### [2026-04-18] Group D: CLIP Similarity Sorting

**Spec**: [docs/superpowers/specs/2026-04-16-clip-similarity-sorting-design.md](../superpowers/specs/2026-04-16-clip-similarity-sorting-design.md)
**Plan**: [docs/archive/plans/2026-04-16-clip-similarity-sorting.md](../archive/plans/2026-04-16-clip-similarity-sorting.md)
**Summary**: Added "CLIP (Semantic)" option to the sort algorithm dropdown. Sorts files by CLIP embedding cosine similarity using the MST algorithm, producing semantic grouping (e.g., photos of same subject cluster together) instead of pixel-similarity grouping from blockhash. Reuses `clipCache` vectors already populated by background extraction (TASK-028); sort order cached via existing `saveSortCache('clip', ...)` infrastructure.
**Key Changes**:
- `sorting-worker.js` — New `calculateCosineDistance(vec1, vec2)` (`1 - dot(a,b)` for unit-normalized vectors, `Infinity` on null/mismatched lengths); new `sortMediaBySimilarityClip(mediaFiles, clipVectors, currentIndex)` (MST algorithm reusing VPTree + MinHeap + Prim's); new `case 'clip'` in worker message handler `switch`; `calculateCosineDistance` added to CJS export
- `media-viewer.js` — `handleSortBySimilarity()` CLIP branch: `enableClipFeatures` guard (throws directing user to Settings F1), vector collection from `clipCache` via `Array.from(vec)`, `vectorCount < 2` guard, pre-worker abort check, worker dispatch with `{ algorithm: 'clip', mediaFiles, clipVectors, currentIndex }`; `sortedCount` variable introduced for shared success notification; `algorithmNames.clip = 'CLIP (semantic)'`
- `index.html` — New `<option value="clip">CLIP (Semantic)</option>` in `#sortAlgorithmSelect`
- `tests/sorting-worker.test.js` — 9 unit tests for `calculateCosineDistance` (identical/orthogonal/opposite unit vectors, 60-degree dot product, null/undefined/mismatched-length guards, 512-dim CLIP shape)
**Commits**: 5 implementation commits on `feature/clip-similarity-sorting` (9c7fefe, e0d07dc, 7757d40, a538b22, e94ae70) + 2 doc commits (2e52767 spec, 17c46c5 plan)
**Test results**: 159/159 unit tests pass (30 in sorting-worker.test.js including 9 new)
**Code review**: Approve with follow-ups. 5 spawned BACKLOG items (latent correctness bug in `insertNewFilesInSortedOrder` for CLIP cache hits, MST DRY extraction, unit tests for `sortMediaBySimilarityClip`, doc corrections re: `.sort_cache_clip.json` vs unified `.sort_cache.json`, CLIP toggle-off should invalidate sort cache)

---

### [2026-04-11] Group C: Test Quality

**Spec**: [docs/superpowers/specs/2026-04-11-test-quality-design.md](../../superpowers/specs/2026-04-11-test-quality-design.md)
**Plan**: [docs/archive/plans/2026-04-11-test-quality.md](../../archive/plans/2026-04-11-test-quality.md)
**Summary**: Hardened E2E test teardown with null guards and fixed misleading unit test describe label. Two BACKLOG items from TASK-027 PR #25 code review.
**Key Changes**:
- `tests/e2e/` (7 files) — Added `if (electronApp)` / `if (tmpFixtures)` guards to `afterEach` blocks, preventing `TypeError` when `beforeEach` throws mid-setup
- `tests/media-viewer-utils.test.js` — Renamed describe label from "keydown guard — undo in empty state" to "buildKeyString — key string construction"
**Commits**: 4 commits (5e29a56..c1b43df)
**Spawned Tasks**: 2 items added to BACKLOG.md (standardize `app-launch.test.js` afterEach pattern, replace `waitForTimeout` magic numbers)

---

### [2026-04-10] Compare Mode Fix + DRY Refactor

**Spec**: [docs/superpowers/specs/2026-04-10-compare-mode-fix-design.md](../../superpowers/specs/2026-04-10-compare-mode-fix-design.md)
**Plan**: [docs/archive/plans/2026-04-10-compare-mode-fix.md](../../archive/plans/2026-04-10-compare-mode-fix.md)
**Summary**: Fixed bug where switching folders while in Compare Mode caused both Single Mode and Compare Mode buttons to appear simultaneously. Also DRYed `toggleViewMode()` single-mode branch by replacing 17-line inline UI setup with `switchToSingleModeUI()` call.
**Key Changes**:
- `media-viewer.js` — `loadFolder()` now calls `switchToSingleModeUI()` before `hideDropZone()` (~L2248); `toggleViewMode()` else-branch replaced with single `switchToSingleModeUI()` call
- `tests/e2e/compare-mode.test.js` — New E2E test "resets to single mode when switching folders in compare mode" with try/finally cleanup and dual assertion (controls visible + compare-controls hidden)
**Commits**: 4 commits (6976fd4..11e417f)
**Spawned Tasks**: 2 items added to BACKLOG.md (mode-aware `hideDropZone()`, try/finally for pre-existing `twoFileTmp`)

---

### [2026-04-09] CLIP/ML Pipeline Cleanup

**Spec**: [docs/superpowers/specs/2026-04-09-clip-ml-cleanup-design.md](../../superpowers/specs/2026-04-09-clip-ml-cleanup-design.md)
**Plan**: [docs/archive/plans/2026-04-09-clip-ml-cleanup.md](../../archive/plans/2026-04-09-clip-ml-cleanup.md)
**Summary**: Four cleanup tasks addressing TASK-028 technical debt: fixed IPC listener accumulation for CLIP download progress, eliminated wasted image decodes during CLIP-only extraction passes, corrected broken ML model persistence (stale `.ml_model.json`), and deleted dead `clip-worker.js` (225 lines) with its tests and ESLint config.
**Key Changes**:
- `preload.js` — `onClipDownloadProgress` returns cleanup function (`ipcRenderer.removeListener`)
- `media-viewer.js` — `initClipModel()` uses `finally` block for listener cleanup; `startBackgroundFeatureExtraction()` guards `loadMediaAsImageData()` with `featureCache.has()` check; `saveMlModel()` removes redundant outer `version:1` wrapper; new `deleteMlModelCache()` method called on `modelWasReset`
- `clip-worker.js` — **Deleted** (never instantiated as Worker since d21e213)
- `tests/clip-worker.test.js` — **Deleted** (8 tests for dead code)
- `eslint.config.mjs` — Removed block 3c, updated header (Eleven → Ten blocks)
- `CLAUDE.md` — Updated architecture, conventions, git insights
**Commits**: 4 implementation commits (053a42c..be4f8ee)
**Spawned Tasks**: 2 items added to BACKLOG.md (DRY CLIP averaging in main.js, audit preload.js `ipcRenderer.on()` listeners)

---

### [2026-04-07] CLIP semantic features for ML prediction (TASK-028)

**Spec**: [docs/superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md](../../superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md)
**Plan**: [docs/archive/plans/2026-04-05-task-028-clip-semantic-features.md](../../archive/plans/2026-04-05-task-028-clip-semantic-features.md)
**Summary**: Added CLIP ViT-B/32 (512-dim) semantic embeddings to ML prediction pipeline, concatenated with existing 64-dim hand-crafted features (576-dim total). CLIP inference runs in main process via IPC (npm packages can't resolve in Electron Web Workers). Video support via ffmpeg scene-change keyframe extraction + averaged embeddings. Also fixed pre-existing bug where ML model wasn't retrained when like/dislike folders change.
**Key Changes**:
- `main.js` — ffmpeg-static require, keyframe extraction IPC (`extractKeyframes`, `cleanupKeyframes`), CLIP model loading/inference IPC (`loadClipModel`, `extractClipEmbedding`, `extractClipEmbeddingBatch`)
- `preload.js` — IPC bridge for all new handlers + `onClipDownloadProgress` listener
- `media-viewer.js` — Cache v4 format (`clipVector`), `clipCache` Map, `initClipModel()`, `extractClipEmbedding()`, `extractClipFromVideo()`, `getCombinedFeatures()` (64+512=576-dim), `resetMlModel()` on folder changes, settings toggle `enableClipFeatures`
- `clip-worker.js` — CLIP embedding helpers (`averageEmbeddings`, constants); no longer used as Web Worker at runtime (CLIP moved to main process IPC), kept for unit tests
- `ml-model.js` — `DEFAULT_FEATURE_DIM` 64→576, `ML_MODEL_VERSION` 2→3
- `index.html` — CLIP features toggle in settings panel
- `eslint.config.mjs` — Block 3c for clip-worker.js
- `tests/clip-worker.test.js` — 8 unit tests for averageEmbeddings
- `tests/e2e/clip-graceful-degradation.test.js` — 2 E2E tests for disabled/default CLIP behavior
**Commits**: 11 commits (7ad4dcb..f4772a9)

---

## 2026-03 (March)

### [2026-04-03] Fix undo when no media remains in folder (TASK-027)

**Spec**: [docs/superpowers/specs/2026-03-28-task-027-fix-undo-empty-folder-design.md](../../superpowers/specs/2026-03-28-task-027-fix-undo-empty-folder-design.md)
**Plan**: [docs/archive/plans/2026-03-28-task-027-fix-undo-empty-folder.md](../../archive/plans/2026-03-28-task-027-fix-undo-empty-folder.md)
**Summary**: Fixed undo (keyboard shortcut + button click) not working when all media files have been rated/moved out of a folder. Two targeted fixes: keydown guard exception for undo action, and enhanced empty-state UI with visible undo prompt.
**Key Changes**:
- `media-viewer.js` — Keydown guard at line ~1729 now allows undo shortcut through when `mediaFiles.length === 0 && moveHistory.length > 0`; `showEmptyStateWithUndo()` enhanced to create visible `div.empty-state-undo` with "No media files remaining" text and Undo button; `showMedia()` cleanup removes empty-state element before rendering restored files
- `styles.css` — `.empty-state-undo`, `.empty-state-undo-text`, `.empty-state-undo-btn` CSS rules
- `tests/media-viewer-utils.test.js` — 2 unit tests for `buildKeyString()` method
- `tests/e2e/undo-empty-state.test.js` — 3 E2E tests (single-mode keyboard undo, button click undo, compare-mode pair undo)
**Design Note**: When the last compare pair is rated, `switchToSingleModeUI()` switches to single mode before empty state. Undo from this state uses the compare-tagged-history branch in `handleCancel()`, restoring both files in single mode.
**Spawned Tasks**: 2 items added to BACKLOG.md (centralized `insertFileIntoList()`, F1 through keydown guard)

### [2026-03-27] Keyboard shortcut customization (TASK-026)

**Spec**: [docs/superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md](../../superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md)
**Plan**: [docs/archive/plans/2026-03-27-task-026-keyboard-shortcut-customization.md](../../archive/plans/2026-03-27-task-026-keyboard-shortcut-customization.md)
**Summary**: Customizable keyboard shortcuts with unified QWER+AD defaults for both single and compare modes. Data-driven shortcut map with reverse lookup replaces hardcoded switch/case. Help overlay shortcuts are dynamically rendered and editable via click-to-remap with conflict detection and "Reset to Defaults" button.
**Key Changes**:
- `media-viewer.js` — `DEFAULT_SHORTCUTS` + `ACTION_LABELS` constants, `loadShortcuts()`, `saveShortcut()`, `resetShortcuts()`, `buildKeyString()`, `buildReverseMap()`, `executeAction()`, `checkShortcutConflict()`, `renderShortcutRows()`, `keyDisplayName()`, `startListeningMode()`, `stopListeningMode()`, `attachShortcutKeyListeners()`. Keydown handler refactored from 125-line switch/case to 73-line reverse map lookup.
- `index.html` — Static shortcut sections replaced with dynamic containers (`#shortcutSingleGrid`, `#shortcutCompareGrid`), Reset button added, General section updated with Z/X entries
- `styles.css` — `.shortcut-key` editable styles, `.listening` animation, `.shortcut-conflict-warning`
- `tests/keyboard-shortcuts.test.js` — 25 unit tests for all shortcut methods
- `tests/e2e/keyboard-shortcuts.test.js` — 4 E2E tests (remap, conflict, reset, persistence)
- `tests/e2e/rating.test.js`, `navigation.test.js`, `compare-mode.test.js` — Updated for new QWER+AD defaults
**Spawned Tasks**: 3 items added to BACKLOG.md (ShortcutManager module extraction, modifier key display, E2E userData isolation)

### [2026-03-26] Application logging to file with auto-cleanup (TASK-025)

**Spec**: [docs/superpowers/specs/2026-03-26-task-025-application-logging-design.md](../../superpowers/specs/2026-03-26-task-025-application-logging-design.md)
**Plan**: [docs/archive/plans/2026-03-26-task-025-application-logging.md](../../archive/plans/2026-03-26-task-025-application-logging.md)
**Summary**: Added file-based logging for debugging. New `logger.js` module writes timestamped entries to `app.getPath('logs')/media-viewer.log`. Main process intercepts `console.log/warn/error` to mirror output to log file. Renderer errors forwarded via fire-and-forget IPC (`logError` channel). Log deleted on clean exit (`will-quit`); crash logs survive naturally.
**Key Changes**:
- `logger.js` — New CommonJS module: `init/log/warn/error/cleanup/getLogPath`, synchronous `fs.writeSync`
- `tests/logger.test.js` — 12 unit tests covering all exports, edge cases, cleanup safety
- `main.js` — Logger init, console interception, `ipcMain.on('log-renderer-error')` handler, cleanup on `will-quit`
- `preload.js` — `logError: (data) => ipcRenderer.send('log-renderer-error', data)` (fire-and-forget)
- `media-viewer.js` — `showError()` forwards to logger, `window.onerror` + `unhandledrejection` global handlers
- `eslint.config.mjs` — `logger.js` added to block 1 (Node/main process)
**Spawned Tasks**: 3 items added to BACKLOG.md (double-init protection, console interception scope, rejection message clarity)

---

### [2026-03-25] Per-folder feature extraction caching (TASK-024)

**Plan**: [docs/archive/plans/2026-03-24-task-024-per-folder-feature-cache.md](../../archive/plans/2026-03-24-task-024-per-folder-feature-cache.md)
**Spec**: [docs/superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md](../../superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md)
**Summary**: Fixed feature extraction cache not reloading on folder switch. Root cause: `loadFeatureCache()` was inside the lazy-init guard — workers survive folder switches, so the guard was skipped on 2nd+ folder, and `featureCache` (cleared by `loadFolder()`) was never reloaded from disk. Also bumped cache schema to v3 with per-entry `{vector, size, mtime}` for file change detection and deleted file pruning.
**Key Changes**:
- `main.js` — Added `mtimeMs` to `load-folder` IPC response (1 line)
- `media-viewer.js` — Moved `loadFeatureCache()` out of lazy-init guard (core bug fix)
- `media-viewer.js` — Cache schema v3: per-entry `{vector, size, mtime}`, `FEATURE_CACHE_VERSION` 2→3
- `media-viewer.js` — Added `featureMetadata` Map populated at all 6 `featureCache.set()` sites
- `media-viewer.js` — Progress indicators show cache hits: "All N loaded from cache", "X/Y — N cached", completion breakdown
**Spawned Tasks**: 2 items added to BACKLOG.md (Map lookup for featureMetadata, unit tests for cache validation)

---

### [2026-03-23] Fix video pause/play icon synchronization (TASK-023)

**Summary**: Fixed play/pause icon never updating when toggling video playback. Root cause: `lucide.createIcons({nodes: [el]})` used a non-existent `nodes` param — Lucide silently ignored it and re-scanned the entire document on every call, replacing all `[data-lucide]` SVGs and invalidating cached `playIcon`/`pauseIcon` refs. Fixed by using the correct `root` param to scope icon creation to the target subtree.
**Key Changes**:
- `media-viewer.js` — Changed 3 `lucide.createIcons()` calls from `{nodes: [...]}` to `{root: element}` (lines 719, 2102, 2651)
**Spawned Tasks**: 2 items added to BACKLOG.md (pin Lucide version, add icon toggle regression test)

---

### [2026-03-22] Fix compare mode last-pair error cascade (TASK-022)

**Plan**: [docs/archive/plans/2026-03-22-task-022-fix-compare-last-pair.md](../../archive/plans/2026-03-22-task-022-fix-compare-last-pair.md)
**Spec**: [docs/superpowers/specs/2026-03-22-task-022-fix-compare-last-pair-design.md](../../superpowers/specs/2026-03-22-task-022-fix-compare-last-pair-design.md)
**Summary**: Fixed infinite error notification loop when last compare pair is rated. Added clean mode switch, empty state with undo, and compare-pair undo from single mode.
**Key Changes**:
- `media-viewer.js` — Added `switchToSingleModeUI()` helper (non-toggling mode switch), `showEmptyStateWithUndo()` (empty state preserving undo history), early exit in `moveComparePair()` when <2 files remain, defense-in-depth fixes in `showCompareMedia()` guards, conditional drop zone in `showMedia()`, compare-pair undo in `handleCancel()` via `compareMode: true` history tag
- `tests/e2e/compare-mode.test.js` — Added E2E test for last-pair clean switch and undo
**Spawned Tasks**: 2 items added to BACKLOG.md (DRY toggleViewMode, partial undo failure)

---

### [2026-03-22] Fix compare mode overlay controls UX (TASK-021)

**Plan**: [docs/archive/plans/2026-03-21-task-021-fix-compare-overlay-ux.md](../../archive/plans/2026-03-21-task-021-fix-compare-overlay-ux.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-021-fix-compare-overlay-ux-design.md](../../superpowers/specs/2026-03-21-task-021-fix-compare-overlay-ux-design.md)
**Summary**: Fixed overlay controls positioning and hover behavior in both compare and single mode. Buttons were unreachable due to `position: fixed` breaking hover area containment, and overlapped native video player controls.
**Key Changes**:
- `styles.css` — Changed `position: fixed` to `absolute`; `bottom: 100px` to `56px` (clears video controls); added `left: 50%; transform: translateX(-50%)` centering; added `transition-delay: 500ms` on hide / `0s` on show; removed `.media-overlay-controls-left`/`-right` rules
- `media-viewer.js` — Removed side-specific CSS class assignment in `addMediaOverlayControls()`
**Spawned Tasks**: 1 item added to BACKLOG.md (smart overlay positioning for small-height media)

---

### [2026-03-21] Investigate ML sorting pair ordering and online adaptation (TASK-020)

**Plan**: [docs/archive/plans/2026-03-21-task-020-ml-sorting-fix.md](../../archive/plans/2026-03-21-task-020-ml-sorting-fix.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md](../../superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md)
**Summary**: Fixed race condition where compare mode rendered next pair before ML re-scoring completed. Added score delta notification so users can see online adaptation working. Added 7 unit tests for pair selection algorithm.
**Key Changes**:
- `media-viewer.js` — Added `pendingCompareRefresh`/`pendingCompareUpdates` state; deferred `showMedia()` in `moveComparePair()` when ML-sorted; bypassed 100ms debounce in `updateComplete`/`reverseUpdateComplete`; added score delta notification in `scoreComplete`; added `mediaNavigationInProgress` guard to all 4 compare rating handlers; orphan timeout cleanup
- `tests/ml-pair-selection.test.js` — 7 unit tests: basic pairing, second pair, 2-file boundary, equal scores, missing scores, pairIndex clamping, odd file count boundaries
- `docs/planning/BACKLOG.md` — 5 future work items: content-understanding features, auto re-sort, model diagnostics, margin-based pairing, score confidence indicator
**Spawned Tasks**: 5 items added to BACKLOG.md

---

### [2026-03-21] Extract fullscreen module from media-viewer.js (TASK-019)

**Plan**: [docs/archive/plans/2026-03-21-extract-fullscreen-module.md](../../archive/plans/2026-03-21-extract-fullscreen-module.md)
**Spec**: [docs/superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md](../../superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md)
**Summary**: Extracted fullscreen logic from media-viewer.js into a standalone `FullscreenManager` class in `fullscreen.js`, establishing the v2.0 modularization pattern (stateful manager + constructor-injected callbacks).
**Key Changes**:
- `fullscreen.js` — New ES module with `FullscreenManager` class (toggle, cleanup, abortController methods)
- `media-viewer.js` — Import + instantiate FullscreenManager, rename 10 call sites, delete 3 old methods (~70 lines net reduction)
- `eslint.config.mjs` — Added block 2c for browser renderer modules (Ten file-group blocks)
- `docs/PROJECT_CONTEXT.md` — Architecture decision: stateful manager + callbacks pattern
**Spawned Tasks**: 5 items added to BACKLOG.md (method rename, isZoomed helper, unit tests, wasPlaying cleanup, ESLint label style)

---

### [2026-03-20] UI polish: button press effects and fullscreen guard (TASK-018)

**Plan**: [docs/archive/plans/2026-03-20-task-018-ui-polish.md](../../archive/plans/2026-03-20-task-018-ui-polish.md)
**Summary**: Added `:active` press animation to all `.control-btn` elements (scale-down 0.93 + opacity 0.85 with 50ms transition) and added early-return guard in `cleanupFullscreen()` to prevent redundant operations on double-calls.
**Key Changes**:
- `styles.css` — Added `.control-btn:active:not(:disabled)` rule after all per-button `:hover` rules for correct source-order specificity
- `media-viewer.js` — Added `if (!wrapper.classList.contains('fullscreen')) return;` guard at top of `cleanupFullscreen()`
**Spawned Tasks**: 2 items added to BACKLOG.md (nav button hover states, consolidate per-button hover rules)

---

### [2026-03-20] ESLint config and documentation alignment (TASK-017)

**Plan**: N/A (low-effort documentation task)
**Summary**: Aligned ESLint config comments and CLAUDE.md with actual codebase state. Updated header from "Four JS environments" to "Nine file-group blocks", fixed stale JSDoc filename in electron-wrapper.cjs, corrected feature-extractor.js classification from "worker-loaded" to "worker+browser".
**Key Changes**:
- `eslint.config.mjs` — Header lists all 9 blocks; block 3b comment reflects browser+worker dual loading
- `tests/e2e/helpers/electron-wrapper.cjs` — JSDoc: `rdp-preload.js` → `rdp-preload.cjs`
- `CLAUDE.md` — Removed 3 stale "known discrepancy" references, updated block count
**Spawned Tasks**: 2 items added to BACKLOG.md (add `globals.browser` to block 3b, audit Git Insights for stale refs)

---

### [2026-03-20] E2E test reliability improvements (TASK-016)

**Plan**: N/A (small fixes from code review)
**Summary**: Fixed two reliability issues in E2E test helpers: closeApp() timer leak (clearTimeout on successful close) and CDN stub timing (register route via `electronApp.on('window')` before `firstWindow()` so synchronous `<script src>` is intercepted). Kept `waitForNotification()` helper for future test use.
**Key Changes**:
- `tests/e2e/helpers/electron-app.js` — closeApp() stores timer ID and clears on success; launchApp() registers CDN stub before firstWindow() via window event
**Spawned Tasks**: 2 items added to BACKLOG.md (investigate transient Vitest failures, use waitForNotification in future tests)

---

### [2026-03-20] Fix zoom and extraction bugs (TASK-015)

**Plan**: N/A (small bug fix, brainstorming + feature-dev inline)
**Summary**: Fixed three bugs discovered during code reviews: zoom popover mouseup listener leak via AbortController cleanup, missing signalUserActivity() in compare-mode rating handlers, and extraction pause state not reset on natural completion. Key fix was adding `removeZoomPopover(side)` to `cleanupCompareMedia()` for centralized cleanup across all 4 wrapper destruction paths.
**Key Changes**:
- `media-viewer.js` — Added AbortController to createZoomPopover, abort() in removeZoomPopover, removeZoomPopover(side) in cleanupCompareMedia(), signalUserActivity() in 4 compare-mode handlers, extraction pause state cleanup on natural completion
**Spawned Tasks**: 2 items added to BACKLOG.md (rename closeAllZoomPopovers, add unit test for AbortController cleanup)

---

### [2026-03-13] Playwright E2E test suite for Electron app (TASK-014)

**Plan**: N/A (implemented via feature-dev skill)
**Summary**: Added Playwright E2E test suite with 28 tests across 6 files covering all critical user workflows. Includes Electron 30+ workaround via wrapper pattern (strips `--remote-debugging-port=0` CLI flag, sets it via `app.commandLine.appendSwitch`). Handles `ELECTRON_RUN_AS_NODE` env contamination from VS Code/Claude Code terminals.
**Key Changes**:
- `playwright.config.js` — Playwright config (workers=1, fullyParallel=false)
- `tests/e2e/helpers/electron-wrapper.cjs` + `.cmd` — Electron 30+ CLI flag workaround
- `tests/e2e/helpers/rdp-preload.cjs` — Sets remote-debugging-port via app API
- `tests/e2e/helpers/electron-app.js` — Shared helpers (launchApp, seedLocalStorage, mockFolderDialog, etc.)
- `tests/e2e/app-launch.test.js` — 5 tests (drop zone, title, electronAPI, folder load, dialog mock)
- `tests/e2e/navigation.test.js` — 7 tests (file count, index, arrow keys, buttons, wrap-around)
- `tests/e2e/rating.test.js` — 6 tests (like/dislike/undo via keyboard+button, Settings panel config)
- `tests/e2e/compare-mode.test.js` — 4 tests (toggle, dual panes, D key nav, Q key rating)
- `tests/e2e/fullscreen.test.js` — 3 tests (Z key, Escape exit, X key)
- `tests/e2e/zoom.test.js` — 3 tests (popover toggle, slider, Escape reset)
- `tests/e2e/fixtures/` — Minimal PNG/MP4 binary fixtures + generator script
- `eslint.config.mjs` — 2 new blocks (5a: CJS helpers, 5b: E2E JS tests)
- `vitest.config.js` — Exclude `tests/e2e/**` from unit test discovery
- `package.json` — `@playwright/test ^1.58.2`, `test:e2e` script
**Spawned Tasks**: 3 items added to BACKLOG.md

---

### [2026-03-12] Unit test infrastructure and initial tests (TASK-013)

**Plan**: N/A (implemented via feature-dev skill)
**Summary**: Set up Vitest test framework with 103 tests across 4 suites covering core algorithmic logic. Zero tests to full coverage of pure functions and data structures.
**Key Changes**:
- `vitest.config.js` — Vitest configuration (tests/**/*.test.js)
- `tests/ml-model.test.js` — 36 tests for OnlineLogisticRegression
- `tests/sorting-worker.test.js` — 21 tests for MinHeap, VPTree, calculateHammingDistance
- `tests/feature-extractor.test.js` — 18 tests for rgbToHsl, computeHistogram, sharpness, symmetry, balance
- `tests/media-viewer-utils.test.js` — 28 tests for formatElapsed, formatTimeAgo, removeFileFromList, areFoldersConfigured
- `sorting-worker.js` — conditional CJS exports added for testability
- `eslint.config.mjs` — test file ESLint block added (block 7)
- `.husky/pre-commit` — tests run after lint-staged
- `package.json` — `"test": "vitest run"`, vitest devDependency
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2026-03-11] Pre-commit hooks with linting and formatting (TASK-012)

**Plan**: N/A (implemented directly via feature-dev skill)
**Summary**: Added ESLint (flat config), Prettier, and Husky pre-commit hooks. ESLint covers 4 JS environments (Node/main, preload hybrid, renderer ES module, Web Workers). Existing codebase fixed to 0 errors/0 warnings. Prettier formatting applied as a separate baseline commit.
**Key Changes**:
- `eslint.config.mjs` — flat config with per-environment globals
- `.prettierrc.json` — tabWidth=4, singleQuote, printWidth=120
- `.husky/pre-commit` — lint-staged on every commit
- `package.json` — lint/format scripts, lint-staged config, prepare hook
- ESLint fixes: unused catch params prefixed `_`, shadow var renames
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2026-03-05] Pause extraction when user is navigating

**Plan**: N/A (implemented directly via feature-dev skill)
**Summary**: Added pause/resume mechanism for background feature extraction. When the user navigates or rates files, extraction pauses automatically and resumes after 2 seconds of inactivity. Uses a Promise-based async gate pattern in the extraction loop.
**Key Changes**:
- `signalUserActivity()` — called from 6 input handlers (nextMedia, previousMedia, handleLike, handleDislike, handleCancel, moveToSpecialFolder)
- `awaitExtractionGate(signal)` — Promise-based async gate that blocks extraction loop while paused
- `resumeExtraction()` — unblocks gate after 2s idle timer, resets progress indicator
- Progress indicator shows pause icon with "Paused" text during pause
- `cancelBackgroundExtraction()` clears pause state and resolves gate on abort
- `showBackgroundExtractionProgress()` extended with `paused` parameter and last-count caching
**Spawned Tasks**: 2 items added to BACKLOG.md (OffscreenCanvas for main-thread relief, per-file gate granularity)

---

### [2026-03-05] Estimated time remaining for feature extraction

**Plan**: [2026-03-05_task-010-extraction-eta.md](../archive/plans/2026-03-05_task-010-extraction-eta.md)
**Summary**: Added ETA display to the background feature extraction progress pill using rolling average rate calculation. Shows estimated time remaining after 5+ files completed, and a completion notification with total elapsed time.
**Key Changes**:
- `formatElapsed()`/`formatEta()` time formatting utilities (seconds to human-readable)
- `recordExtractionCompletion()` — rolling window (last 20) rate calculation with ETA computation
- Progress pill extended: `"Extracting features: 45/200 (22%) — ~3m 12s"`
- Completion notification: `"Feature extraction complete — 200 files in 2m 34s"`
- Ghost pill prevention via `isBackgroundExtracting` guard after cancel
**Spawned Tasks**: 2 items added to BACKLOG.md (show rate in pill, reuse formatElapsed)

---

### [2026-03-05] Worker count setting for feature extraction

**Plan**: N/A (small effort, no separate plan)
**Summary**: Added configurable worker count (1-8) for feature extraction in Settings panel. Reads from localStorage with default of 4, takes effect on next pool initialization.
**Key Changes**:
- Constructor reads `featureWorkerCount` from localStorage with validation/clamping
- Number input in Settings panel (Help Overlay) with change handler
- CSS styling for number input inside `.setting-item`
**Spawned Tasks**: 2 items added to BACKLOG.md (auto-detect CPU cores, show worker count in progress)

---

### [2026-03-05] Cache age display in sorting notification

**Plan**: [2026-03-05_task-008-cache-age-display.md](../archive/plans/2026-03-05_task-008-cache-age-display.md)
**Summary**: Added human-readable cache age to the sort cache restore notification. New `formatTimeAgo()` utility converts stored timestamp to relative time (e.g., "cached 2 hours ago").
**Key Changes**:
- `formatTimeAgo(timestamp)` method with singular/plural handling (just now → minutes → hours → days → weeks)
- Cache restore notification appends `— cached {timeAgo}` after stats
- `typeof === 'number'` guard for backwards compatibility with old caches
**Spawned Tasks**: 2 items added to BACKLOG.md (reuse formatTimeAgo, month granularity)

---

## 2026-02 (February)

### [2026-02-25] Force re-sort option for similarity sorting

**Summary**: Added Shift+click on the sort button to bypass cached sort results and perform a fresh similarity sort. Works directly from both unsorted and already-sorted states.
**Key Changes**:
- `handleSortBySimilarity(forceResort)` accepts boolean parameter via `e.shiftKey`
- New `deleteSortCache(algorithm)` removes current algorithm's cache entry only
- `originalMediaFiles` snapshot preserved across force re-sorts (Restore Order returns to true disk order)
- Catch block guarded with `wasAlreadySorted` to prevent file list wipe on failed force re-sort
- Sort button tooltip updated with Shift+click hint
**Spawned Tasks**: 2 items added to BACKLOG.md (help overlay hint, ML sort force re-sort)

### [2026-02-24] Unified fullscreen exit cleanup method

**Plan**: [2026-02-24_task-006-unified-fullscreen-cleanup.md](../archive/plans/2026-02-24_task-006-unified-fullscreen-cleanup.md)
**Summary**: Renamed `exitFullscreen()` to `cleanupFullscreen()` and routed all 5 exit paths through it — including the two destructive paths (`toggleViewMode`, `showCompareMedia`) that previously called `abortFullscreenController()` directly. Single source of truth for all fullscreen cleanup.
**Key Changes**:
- Renamed `exitFullscreen` → `cleanupFullscreen` (definition + 7 call sites)
- `toggleViewMode()` and `showCompareMedia()` now call `cleanupFullscreen()` before `wrapper.remove()`
- Updated stale references in CLAUDE.md and BACKLOG.md
**Spawned Tasks**: 1 item added to BACKLOG.md (extract setupFullscreen from toggleFullscreen enter branch)

### [2026-02-24] Memory leak guard for fullscreen exitHandler

**Summary**: Fixed memory leak where the click-to-exit handler in `toggleFullscreen()` accumulated on wrapper elements when fullscreen was exited via ESC key or Z/X keyboard shortcuts. Used AbortController with a class-instance Map (`fullscreenAbortControllers`) to ensure `exitFullscreen()` removes the handler regardless of exit path.
**Key Changes**:
- Added `this.fullscreenAbortControllers = new Map()` to constructor
- `toggleFullscreen()`: Create AbortController, store in Map, pass signal to addEventListener
- `exitFullscreen()`: Abort controller via helper at method entry
- Added `abortFullscreenController(wrapper)` helper, used by `exitFullscreen()`, `showCompareMedia()`, and `toggleViewMode()`
- Defensive guard: abort existing controller before creating new one in enter path
- Removed self-removal pattern from exitHandler closure
**Spawned Tasks**: 1 item added to BACKLOG.md (early return guard in exitFullscreen)

### [2026-02-06] Validation in showCompareMedia() for file existence

**Plan**: [2026-02-06_compare-file-validation.md](../archive/plans/2026-02-06_compare-file-validation.md)
**Summary**: Added proactive file existence validation in `showCompareMedia()` to detect and remove externally deleted files before display. Also fixed a bug where compare-mode error handlers assumed sequential pairing (broken for ML-sorted pairs).
**Key Changes**:
- Added `check-file-exists` IPC handler and `checkFileExists` preload bridge
- Parallel file existence validation with automatic retry (bounded, max 10)
- Warning notification for skipped missing files, graceful fallback when <2 files remain
- Fixed `failedIndex` calculation in `setupCompareImageHandlers` and `setupCompareVideoHandlers` to use path-based lookup
**Spawned Tasks**: 2 items added to BACKLOG.md (single-mode validation, batch validation)

### [2026-02-06] Centralized removeFile() method

**Plan**: [2026-02-06_centralized-remove-file.md](../archive/plans/2026-02-06_centralized-remove-file.md)
**Summary**: Consolidated duplicated file removal logic from 4 locations into a single `removeFileFromList(filePath)` method. Fixed cache leak in `removeFailedFile()` and added missing `perceptualHashes` cleanup across all removal paths.
**Key Changes**:
- Added `removeFileFromList(filePath)` handling splice, cache cleanup, and index adjustment
- Refactored `moveCurrentFile()`, `moveToSpecialFolder()`, `moveComparePair()`, `removeFailedFile()`
- Fixed bug: `removeFailedFile()` never cleaned predictionScores/featureCache/perceptualHashes
- Fixed bug: `perceptualHashes` never cleaned in any removal path
- Standardized index adjustment strategy across all removal paths
**Spawned Tasks**: 3 items added to BACKLOG.md (batch removal, insertFileIntoList, event-based cache)

### [2026-02-05] Visual media scale controls

**Plan**: [2026-02-05_visual-scale-controls.md](../archive/plans/2026-02-05_visual-scale-controls.md)
**Summary**: Added button-integrated zoom popovers with logarithmic slider for single and compare modes. Zoom button in control bar opens horizontal popover with `[-] slider [+] 100%` display.
**Key Changes**:
- Added zoom button wrapper to single-mode controls in HTML
- Added `createZoomPopover()`, `removeZoomPopover()`, `setupZoomPopovers()`, `closeAllZoomPopovers()` methods
- Integrated zoom into `addMediaOverlayControls()` for compare mode overlay buttons
- Logarithmic slider mapping (`sliderToScale`/`scaleToSlider`) for smooth zoom UX
- Glassmorphism popover styling matching existing design system
- Enabled zoom in fullscreen (wheel + pan)
**Spawned Tasks**: 4 items added to BACKLOG.md (click effect, keyboard shortcut, persistence, responsive slider)

### [2026-02-05] Video fullscreen toggle on second click

**Plan**: [2025-12-29_video-fullscreen-toggle.md](../archive/plans/2025-12-29_video-fullscreen-toggle.md)
**Summary**: Clicking on a video in fullscreen now exits fullscreen instead of zooming. Zoom operations (double-click, wheel, pan) are disabled in fullscreen mode.
**Key Changes**:
- Removed video click restriction in `toggleFullscreen()` exitHandler
- Added `isInFullscreen()` guard in `setupZoomEvents()` to disable zoom in fullscreen
- Overlay button clicks (like/dislike/special) preserved via `.closest()` checks
**Spawned Tasks**: 2 items added to BACKLOG.md (exitHandler cleanup, unified exit method)

---

## 2026-01 (January)

### [2026-01-02] Compare mode AI sort file mismatch

**Plan**: [2026-01-02_compare-mode-ai-sort-bug.md](../archive/plans/2026-01-02_compare-mode-ai-sort-bug.md)
**Summary**: Fixed media info showing wrong files when sorted by AI in compare mode.
**Key Changes**:
- Fixed onLoad handlers to use compareLeftFile/compareRightFile references
- Fixed copy filename to use correct file in AI-sorted mode
- Added cache cleanup when files are removed
**Spawned Tasks**: 1 item added to BACKLOG.md (centralized removeFile method)

---

## 2025-12 (December)

### [2025-12-28] Background feature extraction

**Plan**: [2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)
**Summary**: Implemented background feature extraction with worker pool and sorting results caching.
**Key Changes**:
- Background feature extraction with worker pool
- Sorting results caching in IndexedDB
- Progress indicator during sorting
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2025-12-27] Sorting algorithm cache

**Plan**: [2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)
**Summary**: Cached sorting results to restore order without re-sorting.
**Key Changes**:
- Per-algorithm caching (VP-Tree, MST, Simple)
- New files inserted at optimal positions based on similarity
- Removed files automatically skipped
**Spawned Tasks**: 2 items added to BACKLOG.md

---

### [2025-12-25] Notifications and media info less intrusive

**Plan**: [2025-12-25_notifications-media-info-less-intrusive.md](../archive/plans/2025-12-25_notifications-media-info-less-intrusive.md)
**Summary**: Moved notifications to bottom-right corner and changed media info from hover to click-to-show.
**Key Changes**:
- Notifications moved to bottom-right corner
- Setting to disable rating confirmation notifications
- Media info changed from hover to click-to-show (i button or I key)
**Spawned Tasks**: 0

---

### [2025-12] Sorting stops when window minimized

**Summary**: Moved sorting algorithms to Web Worker to avoid Chromium timer throttling.
**Key Changes**:
- Created sorting-worker.js with MinHeap, VPTree, and all 3 sorting algorithms
- Worker communicates via postMessage with real-time progress updates
- Abort/cancel still works via worker message

---

### [2025-12] Similarity sorting not working in single mode

**Summary**: Fixed all 3 algorithms to start from currently viewed file instead of first file.
**Key Changes**:
- Fixed Simple, VP-Tree, MST algorithms to start from current file

---

### [2025-12] Media skipping in single mode

**Summary**: Fixed rating a file skipping 2 instead of 1 in single mode.
**Key Changes**:
- Replaced `nextMedia()` with `showMedia()` after splice
- Fixed undo to insert file at `currentIndex` instead of array end

---

### [2025-12] Image zoom capability

**Summary**: Added mouse wheel zoom, double-click cycle, and drag-to-pan for images.
**Key Changes**:
- Mouse wheel zoom centered on cursor
- Double-click to cycle 1x -> 2x -> 4x -> 1x
- Drag to pan when zoomed
- Works in both single and compare modes (independent per image)

---

### [2025-12] Text overflow in boxes

**Summary**: Fixed filename and error text extending beyond container boundaries.
**Key Changes**:
- Added max-height + scroll for notifications
- Fixed folder-info with min-width: 0
- Created header-controls class with flex-wrap

---

### [2025-12] Unused skip button in media player

**Summary**: Replaced single skip button with 10s backward/forward buttons.
**Key Changes**:
- Added << (10s backward) and >> (10s forward) buttons
- Added `skipVideo(seconds)` method

---

### [2025-12] Custom folders for likes/dislikes

**Summary**: Added folder settings UI for liked and disliked file destinations.
**Key Changes**:
- Folder settings UI in Help overlay (F1 -> Settings -> Rating Folders)
- Browse and clear buttons for folder selection
- Rating buttons disabled until both folders configured

---

### [2025-12] Move file to special folder

**Summary**: Added ability to move files to a user-defined special folder.
**Key Changes**:
- Special button in single view and Left/Right Special buttons in compare view
- Special folder configuration in Settings

---

### [2025-12] Remove failed files from list

**Summary**: Added Remove button in error notifications to remove unloadable files.
**Key Changes**:
- Remove button in error notifications
- Works in both single and compare modes
- Auto-navigates to next file after removal

---

### [2025-12] Disable auto-close for error messages

**Summary**: Added setting to control error notification auto-close behavior.
**Key Changes**:
- Auto-close error notifications checkbox in Settings (F1)
- Limited to 5 simultaneous notifications

---

### [2025-12] Alt+F4 not working

**Summary**: Registered Alt+F4 as globalShortcut in main process.
**Key Changes**:
- Alt+F4 registered as globalShortcut
- Properly unregisters on app quit

---

### [2025-12] A/D keys for pair navigation

**Summary**: Added A and D keyboard shortcuts for compare mode navigation.
**Key Changes**:
- A (previous) and D (next) shortcuts in compare mode
- Documented in help overlay

---

## Notes

- Entries organized by month, newest first
- Every entry must reference its plan document (if one exists)
- Use standard format for routine tasks, detailed format for significant work
- Spawned tasks should already be in [TODO.md](TODO.md) or [BACKLOG.md](BACKLOG.md)
