# TODO

Active tasks and backlog.

**Last Updated**: 2026-03-20 <!-- TASK-018 completed -->


**Purpose**: Tracks PLANNED and IN-PROGRESS tasks only.
**Completed tasks**: Move to [DONE.md](DONE.md)
**Unprioritized ideas**: See [BACKLOG.md](BACKLOG.md)
**Task format reference**: [todo-task.md](../../../.claude/TEMPLATES/todo-task.md)

---

## 🔄 In Progress

<!-- Currently active tasks. Limit to 1-3 at a time. -->

<!-- TASK-001 completed 2026-02-05, moved to DONE.md -->

---

## 📋 Planned

<!-- Defined tasks ready to start. Ordered by priority: 🔴 → 🟠 → 🟡 → 🟢 -->

<!-- TASK-002 completed 2026-02-05, moved to DONE.md -->
<!-- TASK-003 completed 2026-02-06, moved to DONE.md -->
<!-- TASK-004 completed 2026-02-06, moved to DONE.md -->
<!-- TASK-005 completed 2026-02-24, moved to DONE.md -->
<!-- TASK-006 completed 2026-02-24, moved to DONE.md -->
<!-- TASK-007 completed 2026-02-25, moved to DONE.md -->
<!-- TASK-008 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-009 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-010 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-011 completed 2026-03-05, moved to DONE.md -->
<!-- TASK-012 completed 2026-03-11, moved to DONE.md -->
<!-- TASK-013 completed 2026-03-12, moved to DONE.md -->
<!-- TASK-014 completed 2026-03-13, moved to DONE.md -->
<!-- TASK-015 completed 2026-03-20, moved to DONE.md -->
<!-- TASK-016 completed 2026-03-20, moved to DONE.md -->
<!-- TASK-017 completed 2026-03-20, moved to DONE.md -->
<!-- TASK-018 completed 2026-03-20, moved to DONE.md -->

### TASK-019 — 🏆 Weekly Challenge: Extract fullscreen module from media-viewer.js 🟠
**Scheduled**: Friday 2026-03-27
**Priority**: 🟠 Medium — v2.0 Architecture kickoff
**Effort**: High (first modularization — sets the pattern for v2.0)

**Description**: Begin the v2.0 modularization effort by extracting fullscreen logic from media-viewer.js into a separate module. This is the **weekly challenge** — it's architecturally significant because it establishes the extraction pattern and import strategy that all future modularization will follow.

Scope:
- Extract `toggleFullscreen()`, `cleanupFullscreen()`, `setupFullscreen()` (if created in TASK-018), `abortFullscreenController()`, `isInFullscreen()`, and `fullscreenAbortControllers` Map into a new `fullscreen.js` module
- Define the module boundary: what the fullscreen module imports from MediaViewer (state refs, DOM helpers) vs. what it exports
- Choose import strategy compatible with the existing no-bundler, browser-global architecture (likely `<script>` tag + class mixin or utility object)
- Update ESLint config for the new module file
- All existing tests must continue passing

**Why this is a challenge**: media-viewer.js methods reach into class state (`this.mediaFiles`, `this.currentIndex`, DOM elements, etc.). Extracting a module requires designing how extracted code accesses shared state — the solution becomes the template for the entire v2.0 effort.

**Acceptance Criteria**:
- [ ] Fullscreen logic extracted to separate file
- [ ] MediaViewer delegates to the new module
- [ ] Import strategy documented in PROJECT_CONTEXT.md
- [ ] ESLint config updated for new file
- [ ] All unit tests pass (`npm test`)
- [ ] All E2E tests pass (`npm run test:e2e`)
- [ ] Pattern documented for future module extractions

---

### TASK-020 — 🔍 Investigate ML sorting pair ordering and online adaptation 🔴
**Priority**: 🔴 High — Research task, schedule ASAP
**Effort**: High (deep investigation of ML pipeline)
**Origin**: Manual testing 2026-03-19

**Description**: Multiple user-observed issues suggest ML sorting in compare mode may not be working as designed. Requires code investigation before any fixes.

**Reported Issues** (original Russian preserved for accuracy):
1. > Результаты работы сортировки нейронкой кажутся не точными. Часто возникает ситуация, когда показывается 2 медиа, которым хочется поставить лайк
2. > Нужно перепроверить, реально при МЛ сортировке, в пейринг моде, показываются слева наивысший процент, а справа - наинизший? Потому что я несколько раз наблюдал 99% слева и 97% справа, а также с продвижением вероятность не росла, а падала
3. > Есть ощущение, что ИИ сортировка пар(со сравнением лучших с худшими по мнению сортировки) не работает и лучшие показываются сначала(и слева, и справа). Это подкрепляет то, что — в сингл моде совсем другой порядок, хотя по логике, левые посты должны быть первыми в сингл моде
4. > Но, справедливости ради, сразу после и немного после нажатия на сортировку очень много левых постов появляется в начале сингл мода
5. > Есть ощущение, что адаптация сортировки к новым оценкам, которые были получены во время этой сессии, не работает
6. > Если пропускать оценки пар и оценивать другие, то порядок не меняется

**Investigation Areas**:
1. **Pair selection logic** (`showCompareMedia`, ~line 2391): Verify left=highest, right=lowest scoring files. Check if 99% vs 97% gap is expected (model not discriminating) or a bug.
2. **Online learning pipeline**: `updateMlModelWithFeatures()` sends updates to ml-worker, but does it trigger re-prediction of all files? Or are `predictionScores` stale after rating?
3. **Score re-computation**: After `mlWorker.postMessage({type:'update'})`, does anything re-run `predict` on remaining files? If not, this is the root cause of issues 5 and 6.
4. **Single vs compare mode ordering**: Single mode uses linear `currentIndex` through `mediaFiles[]`. Compare ML mode uses score-ranked `filesWithScores`. Verify that single mode after ML sort respects score order.
5. **Pair navigation progression**: `mlComparePairIndex` resets to 0 after each rating (~line 3608). As files are removed, do remaining pairs degrade (smaller score gaps)?

**Merges with BACKLOG**: "Add tests for showCompareMedia pair selection logic" (from TASK-013)

**Acceptance Criteria**:
- [ ] Root cause identified for each of the 6 reported issues
- [ ] Document whether online adaptation (re-prediction after rating) is implemented
- [ ] Document expected vs actual pair ordering behavior
- [ ] Document why single mode order differs from compare mode left-file order
- [ ] Create follow-up fix tasks if bugs confirmed
- [ ] Add unit tests for pair selection logic (promoted from BACKLOG)

---

### TASK-021 — Fix compare mode overlay controls UX 🔴
**Priority**: 🔴 High — Usability blocker, users cannot click buttons
**Effort**: Medium
**Origin**: Manual testing 2026-03-19

**Description**: Overlay controls in compare mode are nearly impossible to interact with. Two related issues:

**Reported Issues** (original Russian preserved):
1. > Показывается видео в компаре моде. Пользователь захотел отправить его в спец папку. Он наводится на видео, чтобы появились кнопки, пытается нажать на спец кнопку, а она сразу пропадает. Пользователь не успевает нажать на спец кнопку, как бы он не старался. Тоже самое происходит и с другим медиа.
2. > Также есть момент: кнопки, где лайк и дизлайк, могут перекрывать плеер, что делает невозможным управление видео

**Root Cause Analysis**:
- Overlay controls use `position: fixed` with `bottom: 100px` but visibility depends on `.media-wrapper:hover` (styles.css:1598)
- When user moves cursor from media to button area, cursor may leave `.media-wrapper` bounds → hover drops → `opacity: 0; pointer-events: none` → buttons vanish
- The `position: fixed` positioning can cause buttons to overlap native video player controls

**Possible Fixes**:
- Change `position: fixed` to `position: absolute` within wrapper so buttons are part of the hover area
- Add a hover delay (CSS `transition-delay` on hide, not on show) to give user time to reach buttons
- Ensure buttons are positioned above video controls area
- Consider click-to-toggle instead of hover-to-show for persistent access

**Acceptance Criteria**:
- [ ] Overlay buttons remain visible long enough for user to click them
- [ ] Overlay buttons do not overlap native video player controls
- [ ] Both single media types (image, video) work correctly
- [ ] Both left and right panes work correctly
- [ ] All E2E compare-mode tests pass (`npm run test:e2e`)

---

### TASK-022 — Fix compare mode last-pair error cascade 🔴
**Priority**: 🔴 High — Error spam blocks user interaction
**Effort**: Low-Medium
**Origin**: Manual testing 2026-03-19

**Description**: When the last pair is rated in compare mode and only 1 media file remains, continuous error notifications appear until the user manually switches to single mode.

**Reported Issue** (original Russian preserved):
> В компаре моде, когда была оценена последняя пара и остался 1 медиа, то множество ошибок начинает постоянно показываться (пока не перейду в сингл мод)

**Code Context**: `showCompareMedia()` (~line 2460) checks `mediaFiles.length < 2` and calls `toggleViewMode()`, but also shows error notification "Not enough files for compare mode". The error cascade suggests `showCompareMedia()` is being called repeatedly before the mode switch completes.

**Merges with BACKLOG**: "Remove unnecessary loading state resets before recursive retry in showCompareMedia()" (from code-review-pr-3)

**Acceptance Criteria**:
- [ ] Switching to single mode happens cleanly when <2 files remain
- [ ] No error spam — at most one notification
- [ ] State flags (isLoading, mediaNavigationInProgress) properly reset
- [ ] All E2E tests pass (`npm run test:e2e`)

---

### TASK-023 — Fix video pause/play icon synchronization 🟠
**Priority**: 🟠 Medium — Visual inconsistency
**Effort**: Low
**Origin**: Manual testing 2026-03-19

**Description**: The video pause icon does not change to play icon (and vice versa) when toggling playback.

**Reported Issue** (original Russian preserved):
> Символ паузы не меняется на символ воспроизведения вовремя паузы/воспроизведения

**Code Context**: `playIcon`/`pauseIcon` DOM elements are toggled via `onPlay`/`onPause` video event listeners (~lines 2815-2842). The listeners check `this.currentMedia.tagName === 'VIDEO'` and `!this.isBeingCleaned`. Investigate: Are events firing? Is `isBeingCleaned` stale? Do the DOM elements exist when events fire? Does this happen in both single and compare mode?

**Acceptance Criteria**:
- [ ] Play icon shown when video is paused
- [ ] Pause icon shown when video is playing
- [ ] Works in both single and compare modes
- [ ] Icon updates immediately on user click/keyboard toggle

---

### TASK-024 — Per-folder feature extraction caching 🟠
**Priority**: 🟠 Medium — Major workflow speedup
**Effort**: Medium-High
**Origin**: Manual testing 2026-03-19

**Description**: Feature extraction runs from scratch every time the user switches to a different source folder. For large folders this is very slow. Cache extracted features per folder.

**Reported Issue** (original Russian preserved):
> Каждый раз, если меняется исходная папка с файлами, экстрактинг фьючерз при сортировке с помощью МЛ происходит заново, что очень затягивает процесс. Можно ли сделать какое-то кеширование в самих папках?

**Design Considerations**:
- Store a `.feature_cache.json` file in each media folder (similar to `.sort_cache.json`)
- Cache key: file path + file size + mtime (detect changed files)
- Load cache on folder open, skip extraction for cached files
- Invalidation: re-extract if file modified since cache entry
- Size concern: 64-dim float vector per file — compact enough for JSON
- Privacy concern: cache files in user's own folders is consistent with existing `.sort_cache.json` pattern

**Merges with BACKLOG**: "Move loadMediaAsImageData off main thread" (related performance concern from TASK-011)

**Acceptance Criteria**:
- [ ] Feature cache saved per folder after extraction completes
- [ ] Cached features loaded on folder re-open, skipping extraction
- [ ] Changed/new files detected and re-extracted
- [ ] Deleted files pruned from cache
- [ ] Progress indicator reflects cache hits (e.g., "45 cached, extracting 5 new")
- [ ] All unit tests pass (`npm test`)

---

### TASK-025 — Application logging to file with auto-cleanup 🟡
**Priority**: 🟡 Normal
**Effort**: Low-Medium
**Origin**: Manual testing 2026-03-19

**Description**: Add file-based application logging for debugging. Clean up log files on each application exit.

**Reported Issue** (original Russian preserved):
> Записывать логи работы программы в файл. После каждого выхода удалять все логи (чтобы не мусорить)

**Design Considerations**:
- Write logs to a file in a temp or app-data directory
- Capture main process logs (console.log/warn/error) + renderer IPC errors
- On `app.on('before-quit')` or `app.on('will-quit')`, delete the log file
- Consider keeping the last log file for post-crash debugging (delete previous, keep current)
- Use Electron's `app.getPath('logs')` for platform-appropriate log directory

**Acceptance Criteria**:
- [ ] Application logs written to file during runtime
- [ ] Log file deleted on normal application exit
- [ ] Log location uses platform-appropriate directory
- [ ] No performance impact on normal operation

---

### TASK-026 — Keyboard shortcut customization 🟡
**Priority**: 🟡 Normal — v2.0 roadmap feature
**Effort**: High
**Origin**: Manual testing 2026-03-19 + ROADMAP.md v2.0

**Description**: Allow users to customize keyboard shortcuts. Make compare mode controls the default for both modes (user finds them more comfortable).

**Reported Issues** (original Russian preserved):
> - Дать пользователю возможность настроить управление
> - Сделать дефолтное управление для сингл и компар мода одним (компар мод более удобнее)
> - Дать возможность откатить к дефолтным настройкам

**Design Considerations**:
- Settings panel (F1) section for key bindings
- Store custom bindings in localStorage
- "Reset to defaults" button
- Unify single/compare mode shortcuts (use compare mode layout as new default)
- Conflict detection (warn if two actions share same key)
- Display current bindings in help overlay

**Merges with BACKLOG**:
- "Keyboard shortcut for zoom toggle" (from visual-scale-controls) — include in configurable shortcuts
- "Add Shift+click hint to help overlay keyboard shortcuts" (from TASK-007) — include in help overlay update
- ROADMAP.md v2.0: "Keyboard shortcut customization"

**Acceptance Criteria**:
- [ ] Users can remap keyboard shortcuts via Settings panel
- [ ] Default shortcuts unified for single/compare mode (compare mode layout)
- [ ] "Reset to defaults" button works
- [ ] Bindings persisted to localStorage
- [ ] Help overlay (F1) reflects current bindings
- [ ] No key conflicts allowed

---

### TASK-027 — Fix undo when no media remains in folder 🟡
**Priority**: 🟡 Normal
**Effort**: Low
**Origin**: Manual testing 2026-03-19

**Description**: Undo previous action (Ctrl+Z) does not work when no media files remain in the folder.

**Reported Issue** (original Russian preserved):
> Не работает отмена предыдущего действия, если в папке не осталось медиа

**Merges with BACKLOG**: "Centralized insertFileIntoList() counterpart" (from centralized-remove-file) — undo restoration path

**Acceptance Criteria**:
- [ ] Undo works even when mediaFiles[] is empty
- [ ] File restored to list and displayed after undo
- [ ] Drop zone hidden, media view restored
- [ ] Works in both single and compare mode

---

### TASK-028 — 🔍 Research: open source media content understanding tools 🟡
**Priority**: 🟡 Normal — Research task
**Effort**: Low (research only)
**Origin**: Manual testing 2026-03-19

**Description**: Investigate whether open source tools exist for understanding what is depicted in media (photos, videos). Evaluate if these could improve ML prediction quality.

**Reported Issue** (original Russian preserved):
> Ответить на вопрос: Есть ли в опен сорсе инструменты для определения что изображено, что происходит в медиа (фото, видео и др)? Можно ли это использовать при оценке вероятности того или иного медиа?

**Investigation Areas**:
- Image classification models (CLIP, ViT, ResNet) — can run locally?
- Video understanding (scene classification, action recognition)
- Electron/Node.js compatibility (ONNX Runtime, TensorFlow.js)
- Integration with existing 64-dim feature vector pipeline
- Performance: can these run on consumer hardware without GPU?
- Privacy: all processing must be local (no cloud APIs)

**Acceptance Criteria**:
- [ ] Survey of available open source tools with pros/cons
- [ ] Feasibility assessment for Electron desktop app integration
- [ ] Performance estimates for typical media collections
- [ ] Recommendation: worth pursuing or not, and why
- [ ] Document findings in docs/planning/ for future reference

---

## ⏸️ Blocked

<!-- Tasks waiting on external dependencies or decisions -->

---

## 🔀 Spawned

<!-- Tasks generated from completed work. Include origin for traceability. -->

---

## Notes

- Tasks grouped by status, sorted by priority within each group
- When a task reaches ✅ Done: remove from here, add to [DONE.md](DONE.md)
- Significant tasks should have a plan in `docs/planning/plans/`
- New ideas without clear priority go to [BACKLOG.md](BACKLOG.md)
