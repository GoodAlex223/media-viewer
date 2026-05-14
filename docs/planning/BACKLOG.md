# Backlog

Ideas and tasks not yet prioritized for active development.

**Last Updated**: 2026-05-14 <!-- 2 items from PR #35 final code review added -->

**Purpose**: Holding area for unprioritized ideas and future work.
**Active tasks**: See [TODO.md](TODO.md)
**Completed work**: See [DONE.md](DONE.md)
**Strategic direction**: See [ROADMAP.md](ROADMAP.md)

---

## From PR #35 Final Code Review (2026-05-14)

### [2026-05-14] From: PR #35 final review

- [ ] **`handleCancel` Branch 3 (single-mode compare-pair undo) has no dedicated unit test** — The three new `handleCancel` tests in PR #35 cover Branches 1, 2, and 4 of the 4 success paths. Branch 3 (single mode, last two history entries both tagged `compareMode: true`, restoring two files in one undo action — [media-viewer.js:3519-3581](../../media-viewer.js#L3519-L3581)) is functionally identical to Branch 2 (the `restoreFeatureCachesFromHistory` calls at L3568-3569 mirror L3494-3495) but takes a different control path. Risk of an undetected bug here is low but real; the spec explicitly identified "Forgotten branch in `handleCancel`" as a risk and four-branch coverage was the mitigation. Effort: XS (~30 LoC test mirroring the compare-pair test with `isCompareMode: false`). Affected: [tests/media-viewer-utils.test.js](../../tests/media-viewer-utils.test.js) `handleCancel feature restore` describe block.
- [ ] **`moveToSpecialFolder` lacks `extractFeaturesFromDisplayedMedia` fallback for cold-cache special-undo** — Repro: in AI-sorted mode, hit special-folder rating for a file whose features were never extracted (no background extraction completed yet, cold `featureCache`/`clipCache`). `moveToSpecialFolder` reads `getCombinedFeatures` (returns null) and `featureCache.get` (returns undefined), so `mlFeatures = null` in the history entry. After special-undo, `restoreFeatureCachesFromHistory` no-ops; the file is back in `mediaFiles` but `predictionScores` stays empty for it, so the badge does not re-appear — even though the ML model is trained. Asymmetric with `moveCurrentFile` (like/dislike) which already calls `extractFeaturesFromDisplayedMedia()` as a fallback when the cache is cold (L1181-1196). Fix: mirror `moveCurrentFile`'s `extractFeaturesFromDisplayedMedia()` fallback in `moveToSpecialFolder` before capturing `mlFeatures`. Spec explicitly documents this gap as acceptable trade-off but reviewer flagged it as worth tracking. Effort: S (~10-15 LoC + 1 test). Affected: [media-viewer.js:~1342-1347](../../media-viewer.js#L1342-L1347) (`moveToSpecialFolder`), [media-viewer.js:~1181-1196](../../media-viewer.js#L1181-L1196) (reference pattern in `moveCurrentFile`).

---

## From PR #34 Code Review (2026-05-10)

### [2026-05-10] From: PR #34 review-spawned + filtered-but-noted findings
**Origin**: Multi-agent code review of `fix/clip-extraction-silent-failure` (PR #34). Two issues scored ≥80/100 were fixed in `4ea65c3` before merge (`loadFeatureCache` ordering + `await initClipModel` race). These three remaining items were either explicitly acknowledged by the author as deferred trade-offs or were sub-threshold (filtered from inline review) but worth tracking.

- [ ] **Duplicate `onClipDownloadProgress` listener risk after dropping `clipModelDownloading` guard** (acknowledged by PR author) — `kickoffBackgroundExtractionIfEnabled()` no longer guards `initClipModel()` behind `!this.clipModelDownloading`; concurrent calls dedupe at the IPC layer but each call re-registers a renderer-side `window.electronAPI.onClipDownloadProgress(...)` listener via `initClipModel`. The listeners are torn down in the `finally` block of each `initClipModel` invocation, so the stack drains as IPC calls resolve — but during overlapping calls (e.g., rapid folder switching mid-download) the user may briefly see duplicate "Downloading CLIP model... N%" toasts. Cosmetic; not a correctness issue. Fix options: (a) re-introduce a renderer-side single-flight guard that returns the in-flight promise, (b) move the progress-listener registration into a shared init sentinel that any concurrent call awaits. Author's response: "cosmetic duplicate progress listener may register; not a correctness issue." Affected: [media-viewer.js:6566-6602](../../media-viewer.js#L6566-L6602) (`initClipModel`), [media-viewer.js:6928-6946](../../media-viewer.js#L6928-L6946) (`kickoffBackgroundExtractionIfEnabled`).
- [ ] **Pre-existing: `clipCache` is never cleared in `loadFolder()`** (filtered as pre-existing in PR #34 review, ~0/100) — `loadFolder()` clears `featureCache`, `featureMetadata`, `perceptualHashes`, and `predictionScores` on every folder switch but NOT `clipCache`. Introduced when CLIP was added (commit `6b90226`); `clipCache.clear()` has never been added. With the new kickoff path now hitting these caches on every folder load, the existing path-keyed match (`this.clipCache.has(file.path)`) could silently return stale vectors when two folders share path-identical filenames (renames, duplicates across drives). Real bug under specific scenarios; not introduced or worsened by PR #34. Fix: add `this.clipCache.clear();` alongside the other clears at the top of `loadFolder()`. Affected: [media-viewer.js:~L2255-L2260](../../media-viewer.js#L2255-L2260) (cache-clearing block).
- [ ] **Index `2026-05-06-clip-extraction-silent-failure-design.md` in docs/README.md Design Specs table** (filtered, ~75/100) — PR #34 added the spec under `docs/superpowers/specs/` and indexed the archived plan in `docs/README.md` Archived Plans, but did not add a row to the Design Specs table for the spec itself. Recurring docs-hygiene pattern (PRs #19, #23, #27, #28, #29). Cosmetic; the Pre-archive checklist BACKLOG item (2026-04-30 entry) covers archived-plan drift but not Design Specs index drift — extend that checklist to cover both tables, or fix in-place.

---

## From PR #34 Manual Testing (2026-05-07)

### [2026-05-07] From: Group A manual repro session
**Origin**: User executed the 8-step manual repro for `fix/clip-extraction-silent-failure` (PR #34) and confirmed the CLIP extraction fix works end-to-end. Two unrelated UI bugs surfaced during the session.

- [ ] **Compare-mode → folder-switch leaves stale media wrappers visible** — Repro: enter Compare Mode (2 media files side-by-side), then select a different folder via the change-folder button. Observed: new folder loads in single-file mode (correct — `loadFolder()` calls `switchToSingleModeUI()` before `hideDropZone()` per the existing CLAUDE.md gotcha), BUT the two previous compare-mode media wrappers remain visible, shifted to the left of the viewport and shrunk to small dimensions while the new single-mode media renders to their right. See screenshot in PR #34 thread (vertical red-shirt image right-side, faint shifted/shrunk wrappers left). Suggests `switchToSingleModeUI()` reverts the mode flag and overlay controls but does not remove/hide the leftover `.compare-wrapper` / `.media-wrapper-left` / `.media-wrapper-right` DOM nodes. Likely fix: `switchToSingleModeUI()` should `.remove()` the compare wrappers from `mediaContainer` (or hide them) before the new media renders. Affected: `media-viewer.js` (`switchToSingleModeUI` ~near `loadFolder`/`toggleViewMode` call sites), `styles.css` (compare-wrapper layout). E2E coverage: extend existing `compare-mode.test.js` "resets to single mode when switching folders" to also assert `.compare-wrapper` is not in the DOM after the switch.
- [ ] **Hash sort + AI sort are not mutually exclusive — separate undo for each is confusing** — Repro: load a folder, click Sort-by-Similarity (any algorithm — VPTree/MST/CLIP), then click Sort-by-Prediction (AI). Observed: both sorts apply in sequence and the user can undo each independently (two separate "Restore Order" affordances). Today they're independent buttons with independent state (`isSortedBySimilarity` + `isSortedByPrediction`) so the undo paths don't interlock. User-suggested fix: unify both into a single Sort menu/dropdown where the algorithm options become `[Similarity (Hamming MST/VPTree/CLIP), AI (Prediction)]` — selecting one displaces the other, and a single "Restore Original Order" button affects whichever sort is active. Alternative: keep the two buttons but make the "active sort" state mutually exclusive — clicking AI-sort while similarity-sorted first restores similarity then applies AI, with a single undo. Affected: `media-viewer.js` (`handleSortBySimilarity` ~L4140+, `handleSortByPrediction` ~L6271+, `originalMediaFiles`/`mediaFiles` swap logic, the two `.btn-label` toggles for "Sort by …"/"Restore Order"), `index.html` (sort-related buttons + algorithm dropdown), possibly `styles.css`. Open design question: does the AI sort go into the existing algorithm `<select>` (`vptree | mst | simple | clip | prediction`), or does the menu get a separate "sort source" axis (similarity vs prediction)?

---

## From Manual Testing (2026-05-05)

### [2026-05-05] From: manual testing
**Origin**: User feature ideas and UX observations during manual session

- [ ] **Add 3-media batch rating mode** — New mode where the user rates 3 media simultaneously: explicitly chooses one for like, one for dislike, leaves the third unrated (stays in folder, not moved). Differs from current compare mode (with 2 media) where rating one auto-rates the other; here the user must assign two ratings explicitly. Could speed up sorting throughput. Optional follow-on: a sort variant that treats the "stays" choice as a third label, but unseen files cannot count as "unrated stays" (Новый режим: оценка 3х медиа сразу. Пользователь выбирает: кому ставится лайк, кому дизлайк, а кто остается не оценен и не перемещается. По сути, очень похоже на режим с 2мя оценками, только теперь пользователь должен определять 2 оценки, а не одну (потому что в режиме с 2мя можно определить одну оценку, а вторая поставится автоматически). Я предполагаю, что такой режим может позволит, как минимум, быстрее сортировать. Можно также добавить сортировку для такого режима, которая будет учитывать те медиа, которые остаются в папке (третья оценка; но при этом те, которые еще не были показаны, не могут считаться таковыми)); affected: `media-viewer.js` (new mode alongside `isCompareMode`/single, ~L345/L1094 mode state, `showCompareMedia` ~L2451+, rating handlers), `index.html` (3-pane layout), `styles.css` (3-pane CSS)
- [ ] **Allow ML model retrain (not just restore order)** — Today the user can only restore the original pre-prediction order; no UI affordance to force a model retrain from accumulated ratings. Open design question: does the model retrain incrementally during ratings (current behavior of `updateMlModelAfterRating`), or also on folder open after enough new ratings accumulate across sessions? After each rating session the like/dislike folders gain content from prior decisions and the main folder shrinks — that drift may warrant explicit "retrain from scratch" UX (Возможность переобучить модель (а не только восстановить старый порядок). Модель дообучается во время оценок или во время открытия папки? Т.е. происходит переобучение, если открывать одну и ту же папку, но после какого-то количества оценок (лайк и дизлайк фолдеры дополняются медиа из прошлых оценок той папки, которая выбирается)? То есть после каждой сессии оценок меняется наполнение основной папки, наполнение папок лайков и дизлайков); affected: `media-viewer.js:~L5730` (`resetMlModel`), `~L6271` (`handleSortByPrediction`), `trainFromHistoricalRatingsAndWait`, Settings panel (F1)
- [ ] **Overlay buttons have 3-stage "jumping" hover/leave transition** — On hover-in then hover-out, the `.media-overlay-controls` buttons cycle through 3 visually distinct states: transparent-bg buttons appear → glass effect (backdrop-filter) kicks in → glass holds while hovered → on mouse-leave glass disappears first, transparent buttons remain briefly, then buttons fade out. The staged transition reads as broken/attention-grabbing. Likely cause: `transition-delay: 500ms` on `.media-overlay-controls` opacity combines with separate `backdrop-filter` transition on `.overlay-btn` and per-button `:hover` background swaps — three transitions on different timelines. Fix: unify into one coordinated transition or remove the staggered delay on hide (Кнопки управления медиа имеют 3 состаяния, которые "прыгают": При навидении показываются кнопки с прозрачным фоном, потом быстро появляется эффект стекла и держится, пока медиа в фокусе (мышка наведена), после переноса мышки с медиа эффект стекла пропадает, появляется прозрачный фон и уже после кнопки пропадают. Проблема: Это выглядит как-будто так не должно быть, ощущения "прыгающих кнопок" очень привлекающих к себе внимание); affected: [styles.css:1623-1716](styles.css#L1623-L1716) (`.media-overlay-controls` `transition-delay: 500ms`, `.overlay-btn` `transition: all`, per-btn `:hover` background swaps)
- [ ] **Add rotation buttons for media** — Some media files (static images, animated images, videos) display rotated incorrectly. Add manual rotation controls (e.g., 90° CW/CCW buttons) so the user can correct orientation per-file for comfortable viewing/rating. Persistence question: ephemeral (per-session) or saved per-file? (Некоторые медиа (статические или анимированные, в том числе видео) иногда перевернуты. Можно добавить кнопки поворота медиа для комфорта); affected: `media-viewer.js` (`showSingleMedia`/`showCompareMedia`, new rotation state per file or per-mediaFiles entry), `index.html` (rotate buttons — possibly in overlay controls), `styles.css` (CSS `transform: rotate()` on media element + interaction with existing zoom transforms)
- [ ] **Move media to arbitrary folder via special button** — Add a button to move the current media to any folder the user picks (beyond the fixed like/dislike/special destinations). Folder picker via existing IPC dialog (or a new "recent destinations" picker for speed). History entry needed for undo (Дать возможность переместить медиа в любую папку по спец кнопке); affected: `media-viewer.js` (new handler + folder-picker IPC call + `moveHistory` entry), `main.js` (likely reusable existing file-move IPC; possibly new "browse for folder" IPC if not exposed), `index.html` (button placement — overlay controls or main controls bar), `preload.js`

---

## From PR #33 Code Review (2026-05-05)

### [2026-05-05] From: PR #33 sub-threshold findings
**Origin**: Multi-agent code review of `feature/clip-sort-followups`. The critical issue (cachedData.algorithm undefined → CLIP branch unreachable) was scored 100/100 and fixed in `e1b5fad` before merge. These three remaining items scored below the 80-threshold but are worth tracking as defensive/hygiene improvements.

- [ ] **Clear `this.clipUnloadTimer` in CLIP toggle-off handler** (~50/100) — The Group E pattern (commit `d65bfdd`) requires every code path that changes CLIP state to cancel any pending unload first; `startBackgroundFeatureExtraction()` does this. The new toggle-off handler does not. Race scenario: extraction completes → 30s timer set → user disables CLIP → handler runs cleanup but stale timer remains → user re-enables CLIP and `initClipModel()` begins → stale timer fires `unloadClipModel` IPC mid-load. Mitigated by `main.js` returning `{success:false, reason:'loading'}` (e7d84d0), so no user-facing defect today. Fix: add `clearTimeout(this.clipUnloadTimer); this.clipUnloadTimer = null;` at the top of the `if (!clipToggle.checked)` block in `media-viewer.js`.
- [ ] **Add try/catch around `await this.deleteSortCache('clip')` in toggle handler** (~25/100) — The async event listener relies on `deleteSortCache`'s internal try/catch to swallow errors, which works today (the method catches all paths and shows a notification). Hygiene-only: explicit caller-side `try/catch (_e) { /* best-effort cleanup */ }` makes the contract obvious to future maintainers and removes the implicit dependency on the callee's error handling. Not a real bug; consider when next touching the file.
- [ ] **Add per-file abort check to `insertNewFilesInSortedOrder` (both paths)** (~0/100, pre-existing) — Both the hash and CLIP branches iterate `O(N*M)` cosine/Hamming computations on the renderer's main thread with no `sortAbortController.signal.aborted` check inside the inner loop. Cancel during cache-hit insertion is silently ignored. Typical use case (1-50 new files) is fine; pathological case (100+ new files in a 1000-file cache = 100k iterations) freezes UI. Pre-existing — the hash path always lacked the guard; the new CLIP path inherits the gap. Fix: add `if (this.sortAbortController?.signal.aborted) throw new Error('Sort aborted');` once per outer iteration in both branches. Architectural note: also consider yielding to the event loop (`await new Promise(r => setTimeout(r, 0))`) every N files for very large folders.
- [ ] **Process: end-to-end integration tests for cache-hit sort paths** — PR #33's primary fix slipped through 7 unit tests because they called `insertNewFilesInSortedOrder` directly with explicit `'clip'`, bypassing the broken `applyCachedSortOrder → cachedData.algorithm` plumbing. The fix in `e1b5fad` added `applyCachedSortOrder (algorithm threading)` regression tests with stubbed callees, but a higher-level integration test (load fixture cache file → invoke real cache-hit code path → assert algorithm flows end-to-end) would have caught the bug pre-merge. Pattern recurs: unit-test-the-leaf vs integration-test-the-call-graph. Consider adding a single E2E or fixture-driven integration test per major code path.

---

## From feature/clip-sort-followups manual testing (2026-05-03)

### [2026-05-03] From: manual smoke test of branch
**Origin**: User attempted Scenario 1 of the spec's manual test plan on a 63-file image folder (`Act2_Warm`) and discovered CLIP extraction is not firing on folder load. The branch's actual scope (cache-hit insertion + toggle-off cleanup) is verified by 167/167 unit tests + 39/39 E2E + final code review, but downstream manual scenarios (1-3, 5-6) are blocked by this pre-existing issue.

- [x] ~~🔴 **CLIP background extraction silently does not fire on folder load**~~ — ✅ Resolved 2026-05-07 by Group A (`fix/clip-extraction-silent-failure`). Root cause: `startBackgroundFeatureExtraction()` had no call site in `loadFolder()`. Fix: new `kickoffBackgroundExtractionIfEnabled()` method called after `updateFolderInfo()`. See [DONE.md](DONE.md#2026-05-07-group-a-clip-extraction-silent-failure) and [archived plan](../archive/plans/2026-05-06-clip-extraction-silent-failure.md).
- [ ] **Add UX-visible "extraction starting" notification** — Even if extraction is firing, the absence of any visible "Loading CLIP model..." or "Extracting features: 0/63" feedback for the first ~1-30 seconds creates a "did anything happen?" moment that prompted the bug above to be reported. Adding a "Starting feature extraction..." toast immediately on folder load (before any per-file progress) would surface failure modes faster and improve perceived responsiveness. Cosmetic but high UX value (now unblocked since 2026-05-07 Group A merged).
- [ ] **Toggle-on kickoff for CLIP** (deferred from Group A spec) — When the user toggles CLIP **on** in Settings while a folder is already loaded, today's behavior is implicit: nothing happens until they switch folders or click a CLIP-dependent sort. Add a kickoff so toggle-on triggers the same `kickoffBackgroundExtractionIfEnabled()` path as folder load. Affected: `media-viewer.js` (`#clipFeaturesToggle` change handler — currently `async` with revert-before-await cleanup on toggle-off; add inverse op).

---

## From PR #32 Code Review (2026-04-30)

### [2026-04-30] From: PR #32 post-merge review process observations
**Origin**: Sub-threshold (scored 75/100) findings from the multi-agent code review of `feature/group-f-build-dx`. Three direct findings were fixed in commit `dcbbc26` before merge; these two remaining items are process-level patterns worth automating to prevent recurrence.

- [ ] **Standardize E2E test result reporting in DONE.md entries** — Past groups (C, D, E) consistently include `"39/39 E2E tests pass"` in their DONE.md test-results blurb; Group F's entry lists only unit tests (`"160/160 unit tests pass (no test changes needed — both fixes are static-file edits)"`) without an E2E count. The omission is defensible (no JS code changed) but creates inconsistency across the log. Either (a) require an E2E line on every DONE entry — pass count, "skipped (no JS changes)", or "deferred to manual smoke", or (b) drop the unit-test count too and only report when meaningful. Cosmetic; aids future reviewers spotting test-coverage gaps.
- [ ] **Pre-archive checklist to prevent recurring archived-plan drift** — Recurring pattern across PRs #19, #20, #27, #29, #32: archived plans land with (a) checkboxes still `- [ ]`, (b) no `Status: Complete` header, (c) the new file not indexed in `docs/README.md`. Each recurrence is caught in code review and fixed in a follow-up commit. Mitigations: (i) add a checklist block at the top of the plan template (TEMPLATES/) that explicitly says "before archive: flip checkboxes, add Status, update docs/README.md", (ii) write a small `scripts/archive-plan.js` helper that flips boxes + adds status + appends to docs/README.md, or (iii) a pre-commit/agent check that flags any new file under `docs/archive/plans/` not yet referenced by `docs/README.md`. (i) is lowest-effort.

---

## From Group F Build & DX (2026-04-29)

### [2026-04-29] From: Group F closeout (PR pending)
**Origin**: Spec follow-ups + deferred verification + observed cleanup opportunities from `feature/group-f-build-dx`

- [ ] **Full audit of `regression-checker.md` against current `media-viewer.js`** — Group F only fixed Section 2 (FullscreenManager extraction) demonstrably stale. Remaining sections (1, 3-7) were assumed current but never re-verified. Drift candidates: Section 3 (cache cleanup) doesn't mention `clipCache` / `featureMetadata` — both now part of `removeFileFromList()`; Section 4 (extraction pause/resume) might miss `extractionRunId` generation counter; Section 5 wording. Cosmetic-but-misleading; not blocking.
- [ ] **Migrate Lucide from CDN to bundled npm dependency** — Pinning + SRI is a stopgap. Bundling eliminates the unpkg dependency entirely (offline use, no SRI maintenance, faster cold load). Larger scope: requires build step or manual UMD copy + asset path updates. Tracked since spec; not in v1.1 polish milestone.
- [ ] **Defensive recheck: dispatch regression-checker on a real fullscreen-touching commit (e.g., `43db8af`)** — Plan Step 2.5 was deferred due to subagent quota exhaustion during execution. Run after quota reset to confirm the agent now references `this.fullscreen.cleanup()` (not the legacy `cleanupFullscreen`) in actual output. Low risk (the symbol replacement was verified by inspection), but a real-output check completes the spec's verification criterion.
- [ ] **Clean up duplicate `!.claude/agents/` line in `.gitignore`** — `.gitignore` lines 138-139 both read `!.claude/agents/` (intended one to be `!.claude/agents/**`). Functionally harmless under `.claude/*` (which only matches one level), but visually wrong. Trivial fix.
- [ ] **Update `regression-checker.md` line-count after every major media-viewer.js change** — The agent file's `~7400` reference will drift again as `media-viewer.js` grows or as managers are extracted. Either (a) reword to "growing single-file" and drop the number, (b) regenerate via a pre-commit hook, or (c) accept periodic drift and fix during planned audits. (a) is lowest-effort.

---

## From Group E Resource Management (2026-04-21)

### [2026-04-21] From: Group E final code review (PR #31)
**Origin**: Final code reviewer findings on `feature/resource-management` (5 implementation commits, 160/160 unit + 39/39 E2E pass, approved for merge)

- [ ] **Extract `CLIP_UNLOAD_DELAY_MS = 30000` named constant** (Minor M1) — `media-viewer.js:7007` hard-codes the 30-second unload delay. Per CLAUDE.md naming convention (`MAX_NOTIFICATIONS`-style for module-level constants), extract to a top-level constant alongside other constants. Aids future tuning and testability. Cosmetic; not blocking.
- [ ] **Reconsider `clipModelError` reset behavior on persistent failures** (Minor M2) — `main.js:446` always nulls `clipModelError` on unload. For transient errors (network blip) this enables clean retry. For persistent errors (HF hub unreachable, model files corrupt) the user pays a ~1-2s failed load attempt on every folder-switch cycle. Spec explicitly accepted this tradeoff; revisit only if it becomes noisy in practice. Possible mitigation: track error age and only clear if older than a threshold.
- [ ] **Trim verbose comment on CLIP unload timer schedule** (Minor M4) — `media-viewer.js:6999-7002` has a 4-line comment explaining cancel-on-restart and transparent-reload semantics. Per CLAUDE.md "default to writing no comments" guidance, could trim to one line. Counter-argument: behavior crosses IPC boundaries with non-obvious timing, so the comment earns its keep. Judgment call, not blocking.

### [2026-04-28] From: PR #31 post-merge code review (additional candidates)
**Origin**: Final-review confidence scoring on `feature/resource-management` evaluated 5 candidates; 3 below 80-threshold worth tracking as low-priority defensive improvements

- [ ] **`enableClipFeatures` checked at schedule-time only, not at fire-time** (~15/100) — `media-viewer.js:7000` gates `setTimeout(unloadClipModel, 30000)` on `this.enableClipFeatures` at scheduling. If the user toggles CLIP off during the 30s grace window, the timer still fires the unload IPC. In practice this is harmless (the model would also be unloaded if CLIP were never re-enabled) and arguably correct behavior, but a defensive re-check inside the timer callback would be more robust if the unload call ever gains side-effects beyond nulling refs. Not blocking.
- [ ] **`unloadClipModel` IPC fired without await or error handling in timer callback** (~50/100) — `media-viewer.js:7001-7004` calls `window.electronAPI.unloadClipModel()` fire-and-forget. The IPC returns `{ success: false, reason: 'loading' }` if a load is in flight, but the renderer ignores the result. Acceptable for a best-effort cleanup, but a `.catch()` or `.then((r) => !r.success && logger.warn(...))` would surface unexpected failures during debugging. Not blocking.
- [ ] **`vi.spyOn(fs, 'closeSync')` in logger test relies on inline `mockRestore()` only** — `tests/logger.test.js:46-53` calls `closeSyncSpy.mockRestore()` at the end of the test body. If the assertion fails, restore is skipped and the spy can leak into the next test in the same file. `vi.spyOn` calls through by default so subsequent tests aren't broken in practice, but moving restore into a `try { ... } finally { closeSyncSpy.mockRestore(); }` block (or to `afterEach`) is more defensive. Test hygiene improvement only; matches the `tmpFixtures` cleanup pattern used in E2E tests.

---

## From Group D CLIP Similarity Sorting (2026-04-18)

### [2026-04-18] From: Group D implementation + final code review
**Origin**: Final code reviewer findings + per-task review of `feature/clip-similarity-sorting` (5 commits, 159/159 tests pass, merged PR TBD)

- [x] **Cache-hit `insertNewFilesInSortedOrder` uses Hamming distance regardless of algorithm** — Resolved by `feature/clip-sort-followups` (2026-05-03, commits 2252d32 + 0eaf7ca): function takes new `algorithm` parameter; CLIP path scores by cosine distance over `clipCache`; hash path byte-equivalent to pre-change behavior; `applyCachedSortOrder` passes `cachedData.algorithm`. Regression-guard test added.
- [x] **Add unit tests for `sortMediaBySimilarityClip`** — Resolved by `feature/clip-sort-followups` (2026-05-03, commits bb1052d + 30486df): 4 characterization tests added covering MST chain ordering, end-append fallback for missing vectors, abort flag throw, insufficient-vectors guard. `sortMediaBySimilarityMST` exported as a freebie for future tests.
- [ ] **Extract shared MST helper between `sortMediaBySimilarityMST` and `sortMediaBySimilarityClip`** — ~90 lines of duplicated logic in `sorting-worker.js` (lines 499-588 for Hamming, 594-756 for cosine). Only differences: distance function, eligibility check, error message noun, progress label suffix. Candidate: `_sortMediaBySimilarityGeneric(mediaFiles, distanceFunc, eligibilityCheck, currentIndex, algoLabel)`. Public wrappers become ~8 lines each. Plan explicitly deferred this refactor to keep scope manageable. Low-risk since MST code is already proven and both callers use identical control flow.
- [ ] **Correct `.sort_cache_clip.json` references in spec + CLAUDE.md** — Spec `docs/superpowers/specs/2026-04-16-clip-similarity-sorting-design.md` (lines 49, 93, 94) and CLAUDE.md git-insights line 255 both claim CLIP sort creates `.sort_cache_clip.json`. Actual implementation uses the unified `.sort_cache.json` file with `'clip'` as a top-level key (pre-existing pattern, `media-viewer.js:4900/4920/4965`). Implementation is correct; docs need updating to say "CLIP sort cache key `'clip'` adds entry under that key in the unified `.sort_cache.json`".
- [x] **CLIP toggle-off should invalidate any persisted `'clip'` entry in sort cache** — Resolved by `feature/clip-sort-followups` (2026-05-03, commits 0ce9cec + 80ac67d M3 polish): handler is now `async`; on disable it synchronously reverts `sortAlgorithm` to `'vptree'` and updates the dropdown (revert-before-await for instant UI), then `await deleteSortCache('clip')` clears the persisted entry. Both fix branches were taken.

### [2026-04-20] From: PR #30 code review
**Origin**: 5 parallel agents + confidence scoring; 1 issue scored 85/100 (CLAUDE.md gotcha factual error, fixed in 24ef763); items below threshold worth tracking

- [ ] **CLIP success notification shows wrong file count** (75/100) — In the CLIP branch of `handleSortBySimilarity()`, `sortedCount = vectorCount` is used in the success toast (`✅ Sorted N files with CLIP (semantic)!`), but `sortMediaBySimilarityClip` returns ALL files: MST-sorted files-with-vectors plus files-without-vectors appended at the end. For a folder with 100 files where 70 have CLIP embeddings, the toast says "Sorted 70" even though all 100 were reordered. Fix: `sortedCount = sortedPaths.length` (or `this.mediaFiles.length`). Cosmetic; affected: `media-viewer.js` CLIP branch.
- [ ] **`K_NEIGHBORS` local variable uses UPPER_SNAKE_CASE inconsistent with sibling function** (75/100) — In `sortMediaBySimilarityClip`, the local k-neighbors constant is named `K_NEIGHBORS` (UPPER_SNAKE_CASE), but the sibling `sortMediaBySimilarityMST` and other locals nearby (`nearestNeighbor`, `minDistance`, `nearestNode`, `minDist`) use camelCase. CLAUDE.md naming guidance shows `MAX_NOTIFICATIONS`-style for module-level constants; in-function locals follow camelCase. Rename to `kNeighbors` for consistency. Cosmetic; affected: `sorting-worker.js` `sortMediaBySimilarityClip`.
- [ ] **`calculateCosineDistance([], [])` returns 1 instead of 0 for two empty arrays** (50/100) — Length-mismatch guard passes when both lengths are 0; the dot-product loop never executes; function returns `1 - 0 = 1` (orthogonal) rather than `0` (identical). In practice CLIP always returns 512-dim vectors, so this never triggers — but if a future caller produces empty arrays (e.g., extraction failure mode that returns zero-length arrays instead of null), the result is silently wrong. Defensive: add `if (vec1.length === 0) return 0;` early-return, or assert non-zero length.

---

## From Manual Testing (2026-04-08)

### [2026-04-08] From: manual testing
**Origin**: User feature ideas and UX observations

- [ ] **Design add-on/extension system for the media viewer** — Define core app identity and core functions; build plugin architecture allowing users to install/uninstall add-ons that extend functionality without cluttering the main app (Основной медиа вьюер уже есть и он неплохой. Я не хочу его захламлять различным функционалом, который возможно и не нужен пользователю, поэтому я думаю о том, чтобы добавить фичу по установке дополнений внутри приложения, которая позволит пользователям устанавливать различные дополнения, которые не включены в основное приложение по той или иной причине. Но тогда нужно определить, что это за приложение, какие его основные функции, и что следует вынести в дополнения); affected: new architecture (no existing code)
- [ ] **Move all sorting options to add-ons** — All sorting functionality (similarity, prediction, etc.) should be extractable as add-ons rather than core features; blocked by add-on system design (Все варианты сортировки можно перенести в дополнения); affected: media-viewer.js (sorting logic), sorting-worker.js, ml-worker.js
- [ ] **Add platform integration add-ons (YouTube, TikTok, Twitter, Instagram, Civitai.com)** — Separate add-ons for each platform; ability to request new integrations/plugins via email; consider embedded players (e.g., built-in YouTube player) vs full parsers; consider existing tools like gallery-dl or develop from scratch if necessary; blocked by add-on system design (Добавить следующие как отдельные дополнения: парсинг существующих медиа по ссылкам, интеграцию YouTube, TikTok, Twitter, Instagram, Civitai.com и возможность запросить добавление интеграции или плагина по почте. Лучше добавить возможность интегрировать контент с площадок, а не полноценный парсер. Рассмотреть реализацию с помощью существующих инструментов, таких как gallery-dl); affected: new code
- [ ] **Add ability to rate media from links in text files** — User selects a folder that may contain a plain text file with URLs; linked media is loaded alongside local media for rating; if a link cannot be retrieved/displayed, handle gracefully — consider best course of action (Пользователь может выбрать папку с медиа или без, в которой может быть текстовый документ с ссылками. Вместе с медиа в папке, медиа которое можно получить по ссылке тоже используется в программе для оценки пользователем. Если нельзя получить и показать медиа по ссылке — нужно продумать наилучший вариант действий); affected: media-viewer.js:~L2203 (loadFolder), main.js (IPC file ops)
- [ ] **Display platform content without downloading (embedded players/streams)** — Show posts from TikTok, Twitter, YouTube, etc. without downloading them if possible; consider embedded players vs parsing; related to platform integration add-ons but distinct scope (display without download vs full integration) (Реализовать отображение постов с различных платформ без скачивания, если это возможно); affected: new code
- [ ] **Show thumbnail or low-quality media while loading (progressive loading)** — Display the lowest-quality version or thumbnail first instead of "Loading" placeholder, then progressively load better quality; "stream" the media to users so they can evaluate even from silhouettes or rough images (Можем ли мы отображать миниатюру или самую низкокачественную версию медиа вместо плейсхолдера «Loading», чтобы пользователи могли оценить медиа даже по силуэтам или грубым изображениям. Показывать как медиа загружается онлайн — сначала самое низкое качество, затем постепенно лучше, то есть «стримить» медиа); affected: media-viewer.js (showMedia, showSingleMedia, showCompareMedia), main.js (thumbnail generation IPC)
- [ ] **Configure interface for different window sizes + Ctrl+/- UI zoom** — Make the interface adapt to different main window sizes (currently only one CSS breakpoint at 768px, no resize handlers); allow users to zoom the entire UI in/out using Ctrl + +/- via `webFrame.setZoomFactor` (Настроить интерфейс для разных размеров основного окна. Разрешить масштабирование интерфейса с помощью Ctrl + +/-); affected: styles.css:~L2094 (@media query), media-viewer.js (no resize handler), preload.js (needs webFrame API exposure)

---

## From Group C Test Quality (2026-04-11)

### [2026-04-11] From: Group C implementation observations
**Origin**: Patterns noticed while hardening E2E test teardown across 9 files

- [ ] **Standardize `app-launch.test.js` afterEach to match project pattern** — `app-launch.test.js` guards `tmpFixtures` but not `electronApp` (calls `closeApp(electronApp)` unconditionally); safe because its `beforeEach` always assigns `electronApp`, but inconsistent with the `if (electronApp)` pattern now established in all other 8 E2E files; low priority, cosmetic consistency
- [ ] **Replace E2E `waitForTimeout` magic numbers with named constants or `waitForFunction`** — Durations (200ms/300ms/500ms/1000ms) across compare-mode/navigation/fullscreen tests have no documented rationale; extract to named constants in `helpers/electron-app.js` or switch to `waitForFunction` with explicit conditions for reliability; already tracked in WEEKLY.md notes but not yet a BACKLOG item
- [ ] **Guard `page.evaluate()` in keyboard-shortcuts.test.js afterEach** — `await page.evaluate(...).catch(() => {})` throws synchronous TypeError when `page` is undefined (beforeEach failure); `.catch()` only handles promise rejections, not synchronous throws from `undefined.evaluate()`; fix: wrap with `if (page)` for consistency with `if (electronApp)` / `if (tmpFixtures)` guards in the same block; affects only `keyboard-shortcuts.test.js` (the only E2E file with pre-cleanup `page.evaluate`)

---

## From TASK-028 (CLIP Semantic Features)

### [2026-04-05] From: TASK-028 implementation + manual testing
**Origin**: Architecture decisions and performance observations during 30K-file extraction

### [2026-04-08] From: PR #26 code review
**Origin**: 5 parallel agents + confidence scoring; 10 issues found, 5 scored 75/100, none above 80 threshold; 5 fixed in 3fa3a9a; remaining items below threshold

- [x] **ML model not retrained when like/dislike folders change** — Fixed in f4772a9: `resetMlModel()` called from 4 folder change listeners
- [x] **event.sender.isDestroyed() guard in CLIP progress callback** — Fixed in 3fa3a9a: prevents main process crash if renderer closes during model download
- [x] **CLIP toggle doesn't reset ML model** — Fixed in 3fa3a9a: `resetMlModel()` now called when enableClipFeatures toggle changes
- [x] **Stale mlModelState on version/dim mismatch** — Fixed in 3fa3a9a: `initComplete` handler now clears `mlModelState`/`predictionScores` when `modelWasReset` is true
- [x] **TASK-028 spec not indexed in docs/README.md** — Fixed in 3fa3a9a
- [x] **ESLint header stale (Ten → Eleven blocks)** — Fixed in 3fa3a9a
- [x] **IPC listener accumulation for clip-download-progress** — Fixed in feature/clip-ml-cleanup: `onClipDownloadProgress` returns cleanup function; `initClipModel()` calls it in `finally` block
- [x] **Redundant loadMediaAsImageData for CLIP-only extractions** — Fixed in feature/clip-ml-cleanup: `featureCache.has()` guard skips image decode when only CLIP extraction needed
- [x] **Stale .ml_model.json persisted on disk after version upgrade** — Fixed in feature/clip-ml-cleanup: removed outer `version:1` wrapper from `saveMlModel()`; added `deleteMlModelCache()` called on `modelWasReset`
- [x] **Dead worker code in clip-worker.js** — Fixed in feature/clip-ml-cleanup: entire file deleted (was never instantiated as Worker); `tests/clip-worker.test.js` deleted; ESLint block 3c removed
- [ ] **CLIP text-based search UI** — CLIP embeddings enable text-image matching ("find photos of dogs"); requires search input UI + text encoder + cosine similarity; embeddings already stored in clipCache
- [ ] **CLIP-based similarity sorting** — Replace or augment blockhash with CLIP cosine similarity for semantic grouping; embeddings available in clipCache
- [ ] **Unload CLIP model after extraction completes** — CLIP ONNX model consumes ~200-400 MB in main process; stays loaded indefinitely after extraction finishes; add logic to unload (`clipProcessor = null; clipVisionModel = null`) after background extraction completes + force GC; re-load lazily if user opens new folder
- [ ] **GPU acceleration for CLIP inference (DirectML/CUDA)** — Current CPU inference ~100-200ms/image (~8h for 30K files); DirectML (Windows, any GPU) could reduce to ~10-30ms/image; CUDA (Linux, NVIDIA) ~5-15ms/image; implementation: pass `{ device: 'gpu' }` to `from_pretrained()` in main.js, fallback to CPU if unavailable; add settings toggle for GPU preference

### [2026-04-09] From: CLIP/ML Pipeline Cleanup
**Origin**: Implementation observations during cleanup of TASK-028 debt

- [ ] **DRY CLIP embedding averaging in main.js** — `main.js:515-530` has inline averaging + normalization logic identical to the deleted `averageEmbeddings()` from `clip-worker.js`; if more CLIP consumers appear (e.g., CLIP text search, CLIP similarity sorting), extract to a shared `clip-utils.js` module
- [ ] **Audit all preload.js `ipcRenderer.on()` for listener accumulation** — The `clip-download-progress` listener was leaking because `ipcRenderer.on()` was used without cleanup; audit remaining `ipcRenderer.on()` registrations in preload.js (currently only `logError` uses `.send()` which is fine); establish pattern: all `.on()` listeners must return cleanup functions

### [2026-04-10] From: PR #27 code review
**Origin**: 5 parallel agents + confidence scoring; 7 issues found, 3 scored >=80 (all doc issues, fixed in ce9dd798); code-level observations below threshold but worth tracking

- [ ] **Rename `deleteMlModelCache()` → `clearMlModelCache()`** — Method writes empty string to `.ml_model.json` rather than deleting it (no `deleteFile` IPC exists); name "delete" is misleading; `clearMlModelCache()` or `invalidateMlModelCache()` better reflects the write-empty-string behavior; affected: `media-viewer.js` (~L5598), CLAUDE.md
- [ ] **Add `deleteFile` IPC to preload.js** — Currently no file deletion capability in the IPC bridge; `deleteMlModelCache()` works around this by writing empty string; a proper `deleteFile` handler would enable clean cache invalidation and potentially other file cleanup operations; affected: `main.js` (new IPC handler), `preload.js` (new bridge method)
- [ ] **Add null guard in `enqueueFeatureExtraction` for imageData** — When file needs CLIP-only extraction (has hand-crafted features), `imageData` is passed as `null`; safe today because `featureCache.has()` early-return fires first, but invariant is implicit and fragile (concurrent cache eviction could cause `task.imageData.data` TypeError crash); add defensive `if (!imageData) return null` before queuing task; affected: `media-viewer.js` (~L6654, `enqueueFeatureExtraction`)

---

## From TASK-027 (Fix Undo Empty Folder)

### [2026-04-03] From: PR #25 code review
**Origin**: 5 parallel agents (2 hit rate limits) + confidence scoring; 9 issues found, 4 scored 75/100, none above 80 threshold; 3 fixed in c0f1c3ca; remaining items below threshold or pre-existing patterns

- [x] **E2E afterEach null safety on tmpFixtures** (75/100) — Fixed in Group C Test Quality (5e29a56, c8364b8, 25bf2d3); all 7 unguarded E2E files now have `if (electronApp)` / `if (tmpFixtures)` guards
- [x] **Misleading describe label in unit tests** (50/100) — Fixed in Group C Test Quality (c1b43df); renamed to "buildKeyString — key string construction"
- [x] **DOM leak: .empty-state-undo in showDropZone()** (75/100) — Fixed in c0f1c3ca
- [x] **Stale .spec.js filename in spec doc** (75/100) — Fixed in c0f1c3ca
- [x] **docs/README.md not updated for TASK-027 spec** (75/100) — Fixed in c0f1c3ca

---

## From TASK-026 (Keyboard Shortcut Customization)

### [2026-03-27] From: TASK-026 implementation
**Origin**: Implementation findings + E2E debugging

- [ ] **Extract ShortcutManager module** — keyboard shortcut logic (DEFAULT_SHORTCUTS, loadShortcuts, saveShortcut, resetShortcuts, buildKeyString, buildReverseMap, executeAction, checkShortcutConflict, listening mode, renderShortcutRows) is a natural candidate for v2.0 modularization (same pattern as FullscreenManager)
- [ ] **Modifier key display in help overlay** — `keyDisplayName()` strips `Key`/`Digit` prefixes but doesn't prettify modifier combos (e.g., `Ctrl+A` displays as `Ctrl+A` which is fine, but `Ctrl+Shift+Q` could be cleaner)
- [ ] **E2E test userData isolation** — custom shortcuts in localStorage persist across E2E test runs because Electron reuses the same userData directory; consider `app.setPath('userData', tmpDir)` in test setup for full isolation

### [2026-03-28] From: PR #24 code review
**Origin**: 5 parallel agents + confidence scoring; 10 issues found at 75/100, none above 80 threshold; 5 fixed in d4fde97; remaining items below threshold or author declined with rationale

- [ ] **docs/README.md not updated for TASK-026 spec/plan files** (75/100) — `docs/superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md` and `docs/superpowers/plans/2026-03-27-keyboard-shortcut-customization.md` not indexed; recurring since PR #19
- [ ] **Archived plan has 60 unchecked checkboxes** (75/100) — `docs/archive/plans/2026-03-27-task-026-keyboard-shortcut-customization.md` archived in pre-execution state; repeat pattern from PR #20
- [ ] **Compare test right-pane assertion removed** (75/100) — `tests/e2e/compare-mode.test.js` no longer asserts right-pane visibility after navigation; author says intentional (old test passed by accident)
- [x] **Stale cancelBtn tooltips** (75/100) — Fixed in 43e89e6
- [x] **Reserved key remap not blocked** (75/100) — Fixed in d4fde97
- [x] **Detached kbdElement crash in resetShortcuts** (75/100) — Fixed in d4fde97
- [x] **Dead ArrowLeft/ArrowRight loading guard** (75/100) — Fixed in d4fde97
- [x] **DEFAULT_SHORTCUTS triplicated** (75/100) — Fixed in d4fde97

---

## From TASK-025 (Application Logging)

### [2026-03-26] From: TASK-025 implementation + code review
**Origin**: Implementation review + code quality review findings

- [ ] **Double-init protection for logger.js** — `init()` should close any existing file descriptor before opening a new one to prevent fd leaks if called twice without cleanup
- [ ] **Console interception scope** — ffprobe errors at module load (before `app.whenReady()`) are not captured in log file; consider moving interception to module scope after `require('./logger')`
- [ ] **Unhandled rejection message clarity** — `event.reason` may be an Error object producing `[object Object]` in log; use `String(event.reason)` or `event.reason?.message || event.reason` for clearer output

---

## From Code Reviews

### [2026-03-27] From: PR #23 code review (TASK-025)
**Origin**: 5 parallel agents + confidence scoring; 2 above 80/100 threshold (both fixed in 8fd9934); remaining items below threshold

- [ ] **IPC handler crash on malformed payload** (75/100) — `ipcMain.on('log-renderer-error')` destructures second arg `{ level, message, source }` without null guard; malformed renderer call could throw TypeError in main process; other IPC handlers use try/catch
- [ ] **Archived plan Status not set to "Complete"** (75/100) — `docs/archive/plans/2026-03-26-task-025-application-logging.md` has `Status: Design approved` instead of `Complete`; CLAUDE.md Task Completion Step 2 requires it; repeat pattern from PR #19/#20
- [ ] **Archived plan has unchecked checkboxes** (75/100) — TDD step-by-step checkboxes never marked done; CLAUDE.md requires "All sections filled" before archival; repeat pattern from PR #20
- [ ] **Archived plan deviation not documented** (75/100) — Plan describes `createWriteStream` implementation but code uses `fs.openSync`/`fs.writeSync`; no Execution Log or Key Discoveries section documents this deviation
- [ ] **DONE.md spec link uses wrong relative path** (50/100) — `../../superpowers/specs/` should be `../superpowers/specs/` (one level up from `docs/planning/`, not two)
- [x] **Consolidate Git Insights entries** (75/100) — 6 separate TASK-025 bullets instead of one consolidated entry (fixed in conflict resolution during merge)
- [x] **Stack trace loss in `args.join(' ')`** (85/100) — Fixed in 8fd9934 via `formatArgs()` helper
- [x] **Spec file not indexed in docs/README.md** (100/100) — Fixed in 8fd9934

### [2026-03-24] From: PR #21 code review (TASK-023)
**Origin**: 5 parallel agents + confidence scoring; all items below 80/100 threshold

- [ ] **Consolidate duplicate Git Insights entries** (75/100) — TASK-023 has two separate bullets in CLAUDE.md Git Insights instead of one consolidated entry like TASK-021/TASK-022. Second entry is also out of chronological order.
- [ ] **Add explanatory comment to all 3 `lucide.createIcons({ root })` call sites** (60/100) — PR added `// Use root param to scope icon creation` comment only at the compare-pane site (line ~2650), not at modal (line ~719) or zoom popover (line ~2102).
- [ ] **Add `Plan:` field to TASK-023 DONE.md entry** (50/100) — All prior entries (TASK-020/021/022) include a `**Plan**:` link; TASK-023 omits it. Process consistency issue.
- [ ] **Clarify DONE.md "3 calls" wording** (50/100) — Third call site was split from 1 call into 2 separate calls (4 total); DONE.md says "Changed 3 calls" without noting the split.

### [2026-03-25] From: PR #22 code review (TASK-024)
**Origin**: 5 parallel agents + confidence scoring; 1 issue above 80/100 threshold (fixed in 962414e); remaining items below threshold

- [ ] **Update CLAUDE.md Cache Management docs to include `featureMetadata` in `removeFileFromList()`** (75/100) — Docs list 3 caches (predictionScores, featureCache, perceptualHashes) but code now cleans 4. Same omission in JSDoc comment on the method.
- [ ] **Update `removeFileFromList` test to assert `featureMetadata` cleanup** (75/100) — Test named "cleans up all three caches" doesn't assert `featureMetadata.delete()` and name is now factually wrong (four caches).
- [ ] **Reuse `fileInfo` param in `computeFeatures()` instead of redundant `mediaFiles.find()`** (75/100) — New `computeFileInfo` lookup duplicates the already-resolved `fileInfo` parameter. CLAUDE.md Best Practices: "consider searching before adding duplicates".
- [ ] **Clear `extractionStartTime` in all-cached early-return path** (75/100) — `startBackgroundFeatureExtraction()` sets `extractionStartTime` then returns early when all files cached, leaving stale state. Self-heals on next run but observable.
- [ ] **Fix `_extractionCachedCount` stale after all-cached early-return** (75/100) — Not reset when `filesToProcess.length === 0` early-return bypasses `cancelBackgroundExtraction()`. Stale count could display for next folder.
- [ ] **Update misleading `FEATURE_CACHE_VERSION` comment** (75/100) — Comment says "must match FEATURE_VERSION in feature-extractor.js" but they now diverge (3 vs 2). Constants serve different purposes (cache schema vs feature vector format).
- [ ] **Guard `loadFeatureCache()` against clearing in-memory Maps mid-extraction** (75/100) — Unconditional `new Map()` at start could discard up to 30s of unsaved extraction work if user re-clicks "Sort by Prediction" during extraction.
- [ ] **Index TASK-024 spec in docs/README.md** (75/100) — `docs/superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md` not indexed. Same issue flagged and fixed in PR #19.
- [ ] **Add "Status: Complete" to archived TASK-024 plan** (75/100) — Archived plan has unchecked checkboxes and no Status field. Recurring issue from PR #19 and PR #20 reviews.

## From Completed Tasks

### [2026-03-25] From: TASK-024 (Per-folder feature cache fix)
**Origin**: TASK-024 implementation

- [ ] **Replace `mediaFiles.find()` with Map lookup at featureMetadata population sites** — 6 `featureCache.set()` sites use `this.mediaFiles.find(f => f.path === filePath)` for O(n) linear scan per file. For 1000+ file folders, this adds up during extraction. Build a `Map<path, fileInfo>` once per extraction run and use O(1) lookup instead.
- [ ] **Add unit tests for loadFeatureCache/saveFeatureCache validation logic** — v3 schema has complex validation (version check, size/mtime comparison, dimension check, deleted file pruning) but no automated tests. Mock `window.electronAPI` IPC calls and test: v2→v3 invalidation, stale entry skip, deleted file pruning, dimension mismatch skip, round-trip save→load consistency.

### [2026-03-23] From: TASK-023 (Fix video pause/play icon synchronization)
**Origin**: TASK-023 implementation

- [ ] **Pin Lucide CDN to a specific version** — `index.html` loads `lucide@latest` which can break at any time. Pin to `lucide@1.0.1` (or whichever current) for reproducible builds. The `nodes` → `root` param rename between versions caused this bug silently.
- [ ] **Add regression test for play/pause icon toggle** — No E2E or unit test verifies that the play/pause icon actually changes state when toggling video playback. Would catch Lucide API drift or similar DOM reference bugs.

### [2026-03-22] From: TASK-022 (Fix compare mode last-pair error cascade)
**Origin**: TASK-022 implementation

- [ ] **DRY `toggleViewMode()` single-mode branch with `switchToSingleModeUI()`** — The single-mode UI setup in `toggleViewMode()` (lines ~3430-3445) duplicates `switchToSingleModeUI()`. The else branch could call `switchToSingleModeUI()` instead, keeping all single-mode UI logic in one place. Trivial refactor.
- [ ] **Handle partial failure in compare-pair undo** — If first file restores but second fails, first file is moved back on disk but both entries are pushed back to history. Pre-existing pattern from compare-mode undo (line ~3311), now also in single-mode compare-pair undo. Low priority — requires transactional file move or rollback logic.

### [2026-03-21] From: TASK-019 (Extract fullscreen module from media-viewer.js)
**Origin**: TASK-019 code reviews (Task 1, Task 2, and final review)

- [ ] **Rename `abortController()` method in FullscreenManager** — Method name reads as a noun (property access) rather than a verb (action). Confusing because `AbortController` is a well-known browser API class. Consider `releaseController(wrapper)` or `removeController(wrapper)`. No external callers (only used internally by `cleanup()`), so rename is trivial.
- [ ] **Add wrapper-aware `isZoomed(wrapper)` helper to MediaViewer** — The `isZoomed` callback injected into FullscreenManager duplicates the wrapper-to-target mapping logic (`left-media-wrapper` → `'left'`, etc.). Consider adding a `isWrapperZoomed(wrapper)` method on MediaViewer so the callback can delegate instead of reimplementing. Prevents divergence if zoom state shape changes.
- [ ] **Add unit tests for FullscreenManager** — Class is independently testable (DOM APIs can be mocked). E2E tests cover behavior end-to-end, but focused unit tests would catch regressions faster and serve as documentation for the manager's contract.
- [ ] **Clear `wrapper.dataset.wasPlaying` after restore in `cleanup()`** — Pre-existing bug carried over from original code. After restoring video playback state, `wasPlaying` remains on the element. If the same wrapper is reused for different media, stale attribute could cause unintended `video.play()` on next `cleanup()`.
- [ ] **Fix ESLint header label style inconsistency for block 2c** — Header listing uses em-dash suffix format; block comment uses parenthetical format. Inconsistent with blocks 2a/2b which use parenthetical in the label. Cosmetic only.

### [2026-03-21] From: TASK-020 — ML sorting pair ordering investigation
**Origin**: docs/superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md

- [ ] Content-understanding features — Current 64-dim vector captures color/texture only; integrating CLIP embeddings or similar would improve score discrimination. Ties into TASK-028 research.
- [ ] Auto re-sort after N ratings — Currently user must manually click "Sort by Prediction" to reorder files; consider auto-re-sorting after every N ratings (configurable, e.g., every 5 or 10) to keep ordering fresh.
- [ ] Model diagnostics panel — Show weight distribution, feature importance, training sample counts, and prediction confidence histogram in Settings panel; helps users understand model behavior.
- [ ] Wider score gaps via margin-based pairing — Require minimum score gap (e.g., 0.2) for pairs; skip pairs with tiny gaps (99% vs 97%) that feel like coin flips to the user.
- [ ] Score confidence indicator — Distinguish high-confidence predictions (many similar training samples) from low-confidence ones (novel features).

### [2026-03-21] From: code-review-pr-18 (Post-merge review findings)
**Origin**: PR #18 code review — 5 parallel agents, confidence scoring (7 issues at 75/100, none above 80 threshold)

- [ ] **Remove dead `_extractMethod` function from ml-pair-selection.test.js** — Defined but never called; duplicates `extractMethod` from media-viewer-utils.test.js. `_` prefix used to suppress lint warning on dead code rather than genuinely unused param. Either delete or extract to shared test helper. (confidence 75/100)
- [ ] **Clear `pendingCompareRefresh` in `scoreComplete` even when `message.scores` is falsy** — Cleanup of `pendingCompareRefresh`, `pendingCompareTimeout`, and `mediaNavigationInProgress` is nested inside `if (message.scores)`. If ML worker sends `scoreComplete` without scores (error path), flags remain stuck until 3s fallback. Move cleanup outside the scores guard. (confidence 75/100)
- [ ] **Remove or document dead `pendingCompareRefresh` bypass in `reverseUpdateComplete` handler** — Undo path never sets `pendingCompareRefresh=true`, so the bypass branch is unreachable. Spec says "pendingCompareUpdates=1 for undo path" but this was not implemented. Dead code could mislead future developers. (confidence 75/100)
- [ ] **Move `signalUserActivity()` before `mediaNavigationInProgress` guard in compare rating handlers** — Guard causes early return before `signalUserActivity()` fires, partially reverting TASK-015 fix. During 3s pending window, repeated key presses won't pause background extraction. (confidence 75/100)
- [ ] **Add user-visible feedback during ML re-score pending window** — `mediaNavigationInProgress` held `true` for up to 3 seconds blocks all navigation with no visible UI feedback (only console.warn). Consider showing a brief "Updating scores..." indicator. (confidence 75/100)
- [ ] **Mark code-review-pr-17 BACKLOG items as done when fixing them** — PR #18 fixed two items (Single-file renderer pattern, stale Git Insights) but didn't mark them `[x]`. Fixed in post-merge cleanup. (confidence 75/100)
- [ ] **Set `previousScores` even when `predictionScores.size === 0`** — First-pair rating skips delta notification because the size guard prevents snapshot. Minor edge case but inconsistent with documented "always show notification" behavior. (confidence 75/100)

### [2026-03-21] From: TASK-021 (Fix compare mode overlay controls UX)
**Origin**: TASK-021 manual testing feedback

- [ ] **Smart overlay positioning: place buttons below media when space available** — When media has small height, overlay buttons at `bottom: 56px` overlap the media content. Ideal behavior: detect rendered media height (via `object-fit: contain` actual bounds), position buttons just below the media edge when space exists, fall back to current `bottom: 56px` (inside media, above video controls) when media fills the full wrapper height. Requires JS measurement on load/resize. Low priority — affects only small-height media which is rare.

### [2026-03-22] From: code-review-pr-19 (TASK-021 overlay controls UX)
**Origin**: PR #19 code review — 5 parallel agents, confidence scoring (9 issues found, 2 above 80 threshold fixed in 74cf251)

- [ ] **Add `transition-delay: 0s` to fullscreen overlay rule** — Fixed in 74cf251 (scored 85/100). Keeping for reference: when adding `transition-delay` to base rules, always check fullscreen/hidden state overrides.
- [ ] **Add `:active` press animation to `.overlay-btn`** — `.control-btn` has `:active` state (TASK-018) but `.overlay-btn` does not. Now that overlay buttons are reliably clickable, the missing press feedback is a UX inconsistency. Pre-existing; not introduced by this PR. (scored 25/100)
- [ ] **Fix "applies to both compare and single mode" documentation claim** — CLAUDE.md Git Insights and DONE.md say the overlay fix applies to single mode, but `.media-overlay-controls` is only created in compare mode via `addMediaOverlayControls()`. Single mode uses static HTML buttons. Misleading to future developers. (scored 75/100)
- [ ] **Verify zoom popover not clipped by `overflow: hidden` on `.media-wrapper`** — With `position: absolute` on `.media-overlay-controls`, the upward-expanding `.zoom-popover` is now inside the `overflow: hidden` boundary of `.media-wrapper`. May clip the popover in compare mode. Needs manual verification. (scored 75/100)
- [ ] **Check archived plan checkboxes before archival** — Plan file archived with 24 unchecked `- [ ]` items and no explicit "Status: Complete" field, violating global CLAUDE.md Step 2 archive requirements. Procedural issue — actual work was completed. (scored 75/100)

### [2026-03-21] From: code-review-pr-17 (Post-merge review findings)
**Origin**: PR #17 code review — 5 parallel agents, confidence scoring

- [x] **Update "Single-file renderer" pattern in CLAUDE.md** — Fixed in PR #18 (TASK-020): updated to "Renderer entry: Core UI logic in `media-viewer.js`; v2.0 modularization..."
- [ ] **Update `.claude/agents/regression-checker.md` for FullscreenManager** — References `fullscreenAbortControllers`, `cleanupFullscreen()`, and `abortFullscreenController()` which were extracted to `FullscreenManager` in `fullscreen.js`. Agent will give stale guidance on future reviews.
- [x] **Update stale CLAUDE.md Git Insights entries for TASK-005/TASK-006** — Fixed in PR #18 (TASK-020): added "(pre-extraction)" and "later extracted into FullscreenManager" annotations

### [2026-03-20] From: TASK-018 (UI polish: button press effects and fullscreen guard)
**Origin**: TASK-018 spec review and implementation

- [ ] **Add `:hover` state to nav buttons (prev/next)** — TASK-018 revealed that all `.control-btn` elements have per-button `:hover` rules, but navigation arrows are not `.control-btn` and have no hover feedback at all. Consider adding hover effects for consistency.
- [ ] **Consolidate per-button `:hover` rules into shared base** — Six separate `:hover:not(:disabled)` rules (like, dislike, cancel, special, zoom-toggle, overlay-zoom) all share `transform: translateY(-3px) scale(1.05)`. The transform could be moved to a shared `.control-btn:hover:not(:disabled)` rule, with per-button rules only setting `background`, `border-color`, and `box-shadow`. Reduces duplication.

### [2026-03-20] From: code-review-pr-16
**Origin**: Code review of PR #16 (TASK-018 UI polish: button press effects and fullscreen guard)

- [x] **Update CLAUDE.md "Detected Patterns > Event Listener Lifecycle" for cleanupFullscreen() guard** — Fixed in commit c0cfdde
- [x] **Update inline comment on cleanupFullscreen() to reflect early-return behavior** — Fixed in commit c0cfdde

### [2026-03-20] From: TASK-017 (ESLint config and documentation alignment)
**Origin**: TASK-017 implementation

- [ ] **Add `globals.browser` to ESLint block 3b for feature-extractor.js** — Block 3b only declares `globals.worker` but `feature-extractor.js` is also loaded as a browser `<script>` tag (index.html:354). Currently no browser-only globals are used so no lint errors, but the config doesn't reflect the dual-environment nature. Adding `globals.browser` would future-proof against browser API usage.
- [ ] **Audit remaining CLAUDE.md Git Insights for stale references** — TASK-017 fixed 3 stale "known discrepancy" references. Other Git Insights entries may similarly reference outdated state (e.g., block counts, old patterns). A sweep would catch remaining drift.

### [2026-03-20] From: code-review-pr-15
**Origin**: Code review of PR #15 (TASK-016 E2E test reliability improvements)

- [x] **Use `electronApp.once('window')` instead of `.on('window')` in launchApp()** — Applied directly on main (post-merge fix)
- [ ] **Document waitForNotification() retention decision** — TASK-016 acceptance criterion #3 ("remove or use waitForNotification()") was deferred rather than completed. The reasoning (keep for TASK-022 and future notification tests) exists only in the PR body, not in committed documentation. Scored 75/100 confidence.

### [2026-03-20] From: TASK-016 (E2E test reliability improvements)

- [ ] **Investigate transient Vitest "No test suite found" failures** — During TASK-016, `npm test` returned "No test suite found in file" for all 4 test files, but the same tests passed moments later via the pre-commit hook. May indicate Vitest version instability or file-system timing issue on Windows. Monitor for recurrence.
- [ ] **Use waitForNotification() in future E2E tests** — Helper exists in electron-app.js but is unused. Natural candidates: TASK-022 (error cascade notification test), rating notification verification, extraction completion notification test.

### [2026-03-20] From: TASK-015 (Fix zoom and extraction bugs)

- [ ] **Rename closeAllZoomPopovers() or add destroyAllZoomPopovers()** — `closeAllZoomPopovers()` only hides popovers visually (removes `.show` class) but does not call `removeZoomPopover()`. Future code paths relying on it for full cleanup would leak listeners. Consider renaming to `hideAllZoomPopovers()` for clarity, or adding a `destroyAllZoomPopovers()` that iterates and calls `removeZoomPopover()`.
- [ ] **Add unit test for zoom popover AbortController cleanup** — The listener leak was caught by code review, not automated tests. A test verifying `AbortController.abort()` is called during `cleanupCompareMedia()` would prevent regressions.

### [2026-03-20] From: code-review-pr-14
**Origin**: Code review of PR #14 (TASK-015 fix zoom and extraction bugs)

- [ ] **Align extraction completion cleanup ordering with cancelBackgroundExtraction()** — Natural completion path sets `isBackgroundExtracting = false` before clearing pause state (`extractionResumeTimer`, `extractionPaused`, `extractionResumeResolve`), while `cancelBackgroundExtraction()` does the opposite. No functional bug (loop has exited), but inconsistent ordering between the two exit paths. Scored 25/100 confidence.
- [ ] **Update CLAUDE.md signalUserActivity() caller list** — Detected Patterns section lists only single-mode callers; four compare-mode handlers (`handleLeftLike`, `handleLeftDislike`, `handleRightLike`, `handleRightDislike`) now also call it but aren't documented. Scored 25/100 confidence.
- [ ] **Add removeZoomPopover('single') to cleanupCurrentMedia() or mode switch** — Compare-mode popovers are now properly aborted via AbortController in `cleanupCompareMedia()`, but single-mode popover AbortController is never aborted during mode transitions. No actual leak (singleton, created once), but asymmetric pattern. Scored 25/100 confidence.

### [2026-03-12] From: TASK-013 (Unit test infrastructure)

- [ ] **Deduplicate MinHeap/VPTree across sorting-worker.js and media-viewer.js** — Both files contain identical implementations. Extract to a shared `data-structures.js` with the conditional CJS export pattern, then importScripts() in worker and import in renderer.
- [x] **Add tests for showCompareMedia pair selection logic** — Promoted to TODO: TASK-020 (merged into ML investigation)

### [2026-03-11] From: TASK-012 (Pre-commit hooks)

- [ ] **Promote `no-shadow` from warn → error** — After the codebase has been cleaned up, harden the rule to block commits with shadowed variables rather than just warning. Two known shadow sites remain in `handleCancel()` and the wheel handler.
- [ ] **Add ESLint rule for no-console in production builds** — Currently `no-console` is off (console.log is intentional for Electron logging). Consider adding a build-time strip or lint warning in a future CI step.

### [2026-03-12] From: code-review-pr-11

- [x] **Document `_`-prefix convention for unused variables in CLAUDE.md** — Promoted to TODO: TASK-017
- [x] **Fix eslint.config.mjs header comment environment count** — Promoted to TODO: TASK-017
- [x] **Correct "worker-loaded" classification for feature-extractor.js** — Promoted to TODO: TASK-017

---

## Feature Ideas

### Sorting & ML

| Idea | Description | Value | Effort | Source |
|------|-------------|-------|--------|--------|
| ~~Force re-sort option~~ | ~~Allow user to discard cached sort and re-sort from scratch~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-007 |
| ~~Worker count setting~~ | ~~Let user configure number of extraction workers~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-009 |
| ~~Estimated time remaining for extraction~~ | ~~Show ETA during feature extraction~~ | ~~Medium~~ | ~~Medium~~ | Promoted to TODO: TASK-010 |

---

## Enhancements

Improvements to existing functionality.

| Enhancement | Area | Value | Effort | Notes |
|-------------|------|-------|--------|-------|
| ~~Cache age display in sorting notification~~ | ~~Sorting~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-008 |
| ~~Pause extraction when user is navigating~~ | ~~ML/Perf~~ | ~~Medium~~ | ~~Medium~~ | Promoted to TODO: TASK-011 |
| ~~Validation in showCompareMedia() for file existence~~ | ~~Compare~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-004 |
| Anonymize author field in package.json if privacy desired | Config | Low | Low | Security audit: 2026-02-05 |
| ~~Memory leak guard for exitHandler~~ | ~~Fullscreen~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-005 |
| ~~Unified fullscreen exit cleanup method~~ | ~~Fullscreen~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-006 |
| ~~Click/active effect for control buttons~~ | ~~UI~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-018 |
| ~~Keyboard shortcut for zoom toggle~~ | ~~UI~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-026 (merged into keyboard customization) |
| Zoom level persistence across navigation | UI | Low | Medium | Plan: 2026-02-05_visual-scale-controls |
| ~~Fix mouseup listener leak in createZoomPopover~~ | ~~Zoom~~ | ~~Medium~~ | ~~Low~~ | Promoted to TODO: TASK-015 |
| Document fullscreen zoom reversal from TASK-001 | Zoom/UX | Low | Low | Code review: PR #1 |
| ~~Remove spinner state churn in showCompareMedia() retry~~ | ~~Compare~~ | ~~Low~~ | ~~Low~~ | Promoted to TODO: TASK-022 (merged into last-pair error fix) |
| ~~Abort fullscreenAbortController before wrapper.remove()~~ | ~~Fullscreen~~ | ~~Low~~ | ~~Low~~ | Fixed in TASK-005 PR review |

---

## Technical Debt

Known issues that should be addressed eventually.

| Item | Impact | Effort | Added |
|------|--------|--------|-------|
| ~~Centralized removeFile() method~~ | ~~Medium~~ | ~~Medium~~ | Promoted to TODO: TASK-003 |
| Verify no secrets in git history (`git log -p --all -S`) | High | Low | 2026-02-05 |

---

## Research Topics

Areas requiring investigation before implementation.

| Topic | Question | Why Important | Added |
|-------|----------|---------------|-------|
| ~~Media content understanding~~ | ~~Open source tools for identifying what's depicted in media?~~ | ~~Could improve ML prediction quality~~ | Promoted to TODO: TASK-028 |

---

## Spawned Improvements

<!-- Items generated from completed task reviews. Keep origin for traceability. -->

### 2025-12-27 From: sorting-cache
**Origin**: [2025-12-27_sorting-cache.md](../archive/plans/2025-12-27_sorting-cache.md)

- [x] Force re-sort option — Promoted to TODO: TASK-007
- [x] Cache age display — Promoted to TODO: TASK-008

### 2025-12-28 From: background-feature-extraction
**Origin**: [2025-12-28_background-feature-extraction.md](../archive/plans/2025-12-28_background-feature-extraction.md)

- [x] Worker count setting — Promoted to TODO: TASK-009
- [x] Estimated time remaining — Promoted to TODO: TASK-010
- [x] Pause extraction when navigating — Promoted to TODO: TASK-011

### 2025-12-29 From: video-fullscreen-toggle
**Origin**: [2025-12-29_video-fullscreen-toggle.md](../archive/plans/2025-12-29_video-fullscreen-toggle.md)

- [x] Memory leak guard for exitHandler — Promoted to TODO: TASK-005
- [x] Unified fullscreen exit cleanup — Promoted to TODO: TASK-006

### 2026-01-02 From: compare-mode-ai-sort-bug
**Origin**: [2026-01-02_compare-mode-ai-sort-bug.md](../archive/plans/2026-01-02_compare-mode-ai-sort-bug.md)

- [x] Centralized removeFile() method — Promoted to TODO: TASK-003
- [x] Validation in showCompareMedia() — Promoted to TODO: TASK-004

### 2026-02-05 From: visual-scale-controls
**Origin**: [2026-02-05_visual-scale-controls.md](../archive/plans/2026-02-05_visual-scale-controls.md)

- [x] Click/active effect for control buttons — Promoted to TODO: TASK-018
- [x] Keyboard shortcut for zoom toggle — Promoted to TODO: TASK-026 (merged into keyboard customization)
- [ ] Zoom level persistence — Remember zoom level when navigating between media of similar size
- [ ] Slider width responsive to popover space — Wider slider on larger screens for finer control

### 2026-02-05 From: code-review-pr-1
**Origin**: Code review of PR #1

- [x] Fix mouseup listener leak in createZoomPopover — Promoted to TODO: TASK-015
- [ ] Document fullscreen zoom decision reversal — TASK-002 re-enabled wheel zoom and pan in fullscreen, reversing TASK-001's explicit decision (commit d3b08bb). Add rationale to PROJECT_CONTEXT.md.

### 2026-02-06 From: centralized-remove-file
**Origin**: [2026-02-06_centralized-remove-file.md](../archive/plans/2026-02-06_centralized-remove-file.md)

- [ ] Batch removal support — `removeFilesFromList(filePaths[])` for removing multiple files in one operation
- [x] Centralized insertFileIntoList() counterpart — Promoted to TODO: TASK-027 (merged into undo fix)
- [ ] Event-based cache invalidation — Emit 'file-removed' event so new caches auto-subscribe without modifying removeFileFromList

### 2026-02-06 From: code-review-pr-2
**Origin**: Code review of PR #2

- [ ] Index strategy parameter for removeFileFromList() — Add optional `indexStrategy` param ('cap'|'wrap') instead of post-call override in moveCurrentFile(). Keeps all index logic in one place rather than split across caller and method.

### 2026-02-06 From: compare-file-validation
**Origin**: [2026-02-06_compare-file-validation.md](../archive/plans/2026-02-06_compare-file-validation.md)

- [ ] Add same validation to showSingleMedia() — Same vulnerability exists in single view mode. Files deleted externally trigger browser error events instead of being proactively caught.
- [ ] Batch file validation on folder refresh — Validate all files in mediaFiles[] at once, removing stale entries. Useful for long-running sessions where folder contents change.

### 2026-02-24 From: fullscreen-exithandler-leak-guard
**Origin**: TASK-005 code review

- [x] Abort fullscreenAbortController before wrapper.remove() — Fixed in PR review: added `abortFullscreenController()` helper, called before `wrapper.remove()` in `showCompareMedia()` and `toggleViewMode()`
- [x] Add early return guard in cleanupFullscreen() for non-fullscreen wrappers — Promoted to TODO: TASK-018

### 2026-02-24 From: task-006-unified-fullscreen-cleanup
**Origin**: docs/archive/plans/2026-02-24_task-006-unified-fullscreen-cleanup.md

- [x] ~~Extract setupFullscreen(wrapper) from toggleFullscreen() enter branch~~ — Superseded by TASK-019: fullscreen logic extracted to `FullscreenManager` class in `fullscreen.js`. The enter branch is now `FullscreenManager.toggle()`. A symmetric `setup()`/`cleanup()` split within the manager is still possible but lower priority.

### 2026-02-25 From: task-007-force-resort-option
**Origin**: TASK-007 implementation

- [x] Add Shift+click hint to help overlay keyboard shortcuts — Promoted to TODO: TASK-026 (merged into keyboard customization)
- [ ] Force re-sort for ML prediction sort — Apply the same Shift+click force re-sort pattern to `handleSortByPrediction()` for consistency across both sort modes.

### 2026-03-05 From: task-009-worker-count-setting
**Origin**: TASK-009 implementation

- [ ] Auto-detect optimal worker count via `navigator.hardwareConcurrency` — Use CPU core count as suggested default instead of hardcoded 4. Show detected cores in UI label (e.g., "Feature extraction workers (8 cores detected)").
- [ ] Show active worker count in background extraction progress — Display "Extracting features (4 workers)..." in the progress indicator so users understand the current parallelism level.
- [ ] Reinitialize worker pool on setting change or show restart hint — Changing worker count at runtime doesn't affect an already-running pool (guarded by `featureWorkers.length === 0`). Either call `shutdownFeaturePool()` + `initializeFeaturePool()` on change, or add "(takes effect on restart)" label next to the input.

### 2026-03-05 From: task-008-cache-age-display
**Origin**: docs/archive/plans/2026-03-05_task-008-cache-age-display.md

- [ ] Reuse formatTimeAgo() for other timestamps — Could display ML model age, hash cache age, or other cached data freshness
- [ ] Add month-level granularity to formatTimeAgo() — Currently stops at weeks; very old caches show "52 weeks ago" instead of "12 months ago"
- [ ] Fix stale timestamp display when new files merged into cache — When `stats.added > 0`, `saveSortCache()` overwrites disk with `Date.now()` but notification still reads old `cachedSortData.timestamp`. Should update timestamp after re-save or show "just now" for merged caches.

### 2026-03-05 From: task-011-pause-extraction
**Origin**: TASK-011 implementation

- [ ] Move loadMediaAsImageData off main thread — Use OffscreenCanvas in workers to avoid main-thread image decoding jank entirely. Would eliminate the root cause of UI contention during extraction, making the pause feature a nice-to-have rather than essential.
- [ ] Per-file extraction gate instead of per-batch — Currently awaitExtractionGate() is checked once per batch (10 files). Moving the gate inside the inner loop (before each loadMediaAsImageData call) would provide more granular pausing with faster response to user activity.

### 2026-03-11 From: code-review-pr-10
**Origin**: Code review of PR #10 (TASK-011 pause extraction)

- [x] Add signalUserActivity() to compare-mode rating handlers — Promoted to TODO: TASK-015
- [x] Clean up pause state on natural extraction end — Promoted to TODO: TASK-015
- [ ] Remove dangling abort listener in awaitExtractionGate — `signal.addEventListener('abort', resolve, {once:true})` is not removed on normal resume path. Each pause/resume cycle accumulates one listener until the AbortController is GC'd at run end. Scored 72/100 confidence.

### 2026-03-05 From: task-010-extraction-eta
**Origin**: docs/archive/plans/2026-03-05_task-010-extraction-eta.md

- [ ] Show extraction rate in progress pill — Display files/sec alongside ETA (e.g., "45/200 (22%) — ~3m 12s (2.3 files/s)") for throughput visibility
- [ ] Reuse formatElapsed() for other timed operations — Sort-by-similarity, ML training, and other long operations could show elapsed time on completion
- [ ] Apply generation counter pattern to sort cancellation — sortAbortController has the same cancel-then-restart race potential as extraction; extractionRunId pattern could prevent stale sort callbacks from corrupting state

### 2026-03-12 From: code-review-pr-12
**Origin**: Code review of PR #12 (TASK-013 unit test infrastructure)

- [ ] **Move sorting-worker.js to ESLint block 3b or create separate block** — sorting-worker.js now has the conditional CJS export pattern (`typeof module !== 'undefined' && module.exports`) but remains in block 3a. Adding `module: 'readonly'` to 3a also applies it to ml-worker.js and feature-worker.js which don't use `module`, silently permitting accidental CJS code in those pure workers. Scored 75/100 confidence.
- [x] **Update BACKLOG item for ESLint header comment count** — Resolved by TASK-017 (header updated to "Nine file-group blocks")
- [ ] **Add globalThis.self teardown in sorting-worker.test.js** — `globalThis.self` is set at module top-level without afterAll cleanup. While Vitest isolates each file in its own worker, adding teardown is defensive best practice. Scored 25/100 confidence.

### [2026-03-13] From: TASK-014 (Playwright E2E tests)

- [ ] **Test E2E suite on Unix/macOS** — `getElectronWrapperPath()` and `getLaunchArgs()` have Unix branches (using node + CJS wrapper) but were only tested on Windows. Needs CI matrix or manual Mac/Linux validation.
- [ ] **Auto-detect playwright-core loader.js path in rdp-preload.cjs** — Currently hardcoded to `node_modules/playwright-core/lib/server/electron/loader.js`. A playwright-core upgrade that moves this file will break silently. Could use `require.resolve()` or glob.
- [x] **Update ESLint header comment to reflect 9 file-group blocks** — Promoted to TODO: TASK-017

### [2026-03-18] From: code-review-pr-13
**Origin**: Code review of PR #13 (TASK-014 Playwright E2E tests)

- [x] **Clear setTimeout in closeApp() on successful close** — Promoted to TODO: TASK-016
- [x] **Register page.route() CDN stub before firstWindow() loads** — Promoted to TODO: TASK-016
- [x] **Remove or use waitForNotification() export** — Promoted to TODO: TASK-016
- [x] **Fix stale filename in electron-wrapper.cjs JSDoc** — Promoted to TODO: TASK-017

### [2026-03-19] From: Manual testing session
**Origin**: User manual testing — 11 issues reported, 9 promoted to TODO

- [x] ML sorting pair ordering investigation — Promoted to TODO: TASK-020
- [x] Compare mode overlay controls UX — Promoted to TODO: TASK-021
- [x] Compare mode last-pair error cascade — Promoted to TODO: TASK-022
- [x] Video pause/play icon sync — Promoted to TODO: TASK-023
- [x] Per-folder feature extraction caching — Promoted to TODO: TASK-024
- [x] Application logging to file — Promoted to TODO: TASK-025
- [x] Keyboard shortcut customization — Promoted to TODO: TASK-026
- [x] Undo when no media remains — Promoted to TODO: TASK-027
- [x] Research: media content understanding tools — Promoted to TODO: TASK-028

### 2026-04-03 From: TASK-027 (undo empty state fix)
**Origin**: TASK-027 implementation

- [ ] Centralized `insertFileIntoList()` method — Extract reusable file insertion logic from the 4 undo branches in `handleCancel()` (single, compare, special, compare-tagged-in-single). Each branch duplicates file reconstruction + splice/push + ML reversal. A shared method would reduce ~150 lines of duplication.
- [ ] Allow F1 (help) through keydown guard in empty state — Currently `showEmptyStateWithUndo()` blocks F1 along with all other non-undo shortcuts. Users may want to check keyboard shortcuts while in the empty state.

### 2026-02-06 From: code-review-pr-3
**Origin**: Code review of PR #3

- [x] Remove unnecessary loading state resets before recursive retry in showCompareMedia() — Promoted to TODO: TASK-022 (merged into last-pair error fix)

### 2026-04-10 From: compare-mode-fix
**Origin**: [2026-04-10-compare-mode-fix.md](../archive/plans/2026-04-10-compare-mode-fix.md)

- [ ] Make `hideDropZone()` mode-aware — Currently unconditionally shows `.controls` regardless of `isCompareMode`. Works now because `loadFolder()` resets first, but `hideDropZone()` is called from other paths; a mode-aware version would be more robust.
- [ ] Add try/finally cleanup to pre-existing `twoFileTmp` in compare-mode E2E — The "switches to single mode when last pair is rated" test (lines 113-161) has the same inline-cleanup pattern that was fixed for `secondFolder`; should use try/finally too.

### [2026-04-11] From: PR #28 code review
**Origin**: 5 parallel agents + confidence scoring; 4 issues found, 2 scored >=80 (both doc issues, fixed in 54e6246); code-level observations below threshold but worth tracking

- [ ] **Redundant calls in `switchToSingleModeUI()` via `toggleViewMode()`** — When `toggleViewMode()` calls `switchToSingleModeUI()`, `hidePredictionBadges()` and `closeAllZoomPopovers()` run twice (once at top of `toggleViewMode()`, once inside `switchToSingleModeUI()`). Harmless but wasteful; consider splitting `switchToSingleModeUI()` into a core UI-reset (for `toggleViewMode()`) and a full reset (for `loadFolder()` and other callers); affected: `media-viewer.js` (~L3567 `switchToSingleModeUI`, ~L3589 `toggleViewMode`)
- [ ] **Double `isCompareMode = false` in `toggleViewMode()`** — Line ~3619 toggles `isCompareMode` to `false`, then `switchToSingleModeUI()` sets it `false` again. Correct but confusing for future readers; add a comment clarifying the toggle precedes the helper call; affected: `media-viewer.js` (~L3619, ~L3634)
- [ ] **Standardize E2E `waitForTimeout` durations** — Compare-mode tests use 200ms, 300ms, 500ms, 1000ms for similar DOM-settling waits with no clear rationale for which value; consider extracting named constants (e.g., `MODE_SWITCH_SETTLE = 300`) or replacing with state-based waits (`waitForFunction`); affected: `tests/e2e/compare-mode.test.js`, `tests/e2e/navigation.test.js`, `tests/e2e/fullscreen.test.js`

---

## Rejected Ideas

Ideas considered but decided against. Keep reasoning for future reference.

| Idea | Reason for Rejection | Date |
|------|---------------------|------|
| *None yet* | | |

---

## Promotion Criteria

Move items to [TODO.md](TODO.md) when:
- Aligns with current [ROADMAP.md](ROADMAP.md) phase
- Value clearly exceeds effort
- Dependencies are resolved
- Capacity exists to complete
