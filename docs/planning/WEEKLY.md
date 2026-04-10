# Weekly Plan

**Week**: Monday April 13 – Friday April 17, 2026
**Created**: 2026-04-09
**Sources**: MILESTONES.md, ROADMAP.md, GOALS.md, BACKLOG.md, TODO.md, git log (last 2 weeks)

**Context**: TASK-028 (CLIP semantic features) completed 2026-04-07 — left significant cleanup debt in the CLIP/ML pipeline. One HIGH bug in TODO (compare mode folder switch). v1.1 Polish Release milestone is overdue (targeted Q1 2026, now Q2). No previous WEEKLY.md exists; using conservative 5–6 SP/day estimate for first week.

---

## Parallel Work

_(No ongoing background tasks this week.)_

---

## Task Groups

### Group A: Compare Mode Fix [batch]
**Domain**: JS logic (mode switching)
**Total SP**: 4

- [ ] **Fix Single Mode buttons appearing alongside Compare Mode buttons on folder switch** — 3 SP, IMPORTANT
  - `loadFolder()` doesn't reset `isCompareMode`; `hideDropZone()` shows single mode controls unconditionally
  - Fix: call `switchToSingleModeUI()` before `showMedia()` in `loadFolder()`
  - Source: TODO.md (HIGH)
- [ ] **DRY `toggleViewMode()` single-mode branch with `switchToSingleModeUI()`** — 1 SP, NICE TO HAVE
  - Single-mode UI setup in `toggleViewMode()` (~L3430-3445) duplicates `switchToSingleModeUI()`; refactor to call the helper
  - Source: BACKLOG (TASK-022)

### Group B: CLIP/ML Pipeline Cleanup [batch]
**Domain**: JS logic (CLIP/ML subsystem)
**Total SP**: 7

- [ ] **Fix IPC listener accumulation for clip-download-progress** — 2 SP, IMPORTANT
  - `onClipDownloadProgress` in preload.js uses `ipcRenderer.on()` which accumulates; should use `.once()` or expose off-handler
  - Source: BACKLOG (TASK-028 PR #26, 75/100)
- [ ] **Skip redundant loadMediaAsImageData for CLIP-only extractions** — 2 SP, IMPORTANT
  - `startBackgroundFeatureExtraction()` calls `loadMediaAsImageData()` unconditionally; CLIP ignores it (uses file path via IPC)
  - Source: BACKLOG (TASK-028 PR #26, 75/100)
- [ ] **Handle stale .ml_model.json after version upgrade** — 2 SP, IMPORTANT
  - Worker resets on dim mismatch but stale v2/64-dim JSON persists on disk; every restart re-loads and re-resets
  - Source: BACKLOG (TASK-028 PR #26, 75/100)
- [ ] **Remove dead worker code in clip-worker.js** — 1 SP, IMPORTANT
  - `loadModel()`, `extractEmbedding()`, `self.onmessage` handler unused since CLIP moved to main process IPC; only `averageEmbeddings` and `CLIP_EMBEDDING_DIM` are used
  - Source: BACKLOG (TASK-028 PR #26, 75/100)

### Group C: Test Quality [batch]
**Domain**: Testing
**Total SP**: 2

- [ ] **Add E2E afterEach null safety on tmpFixtures** — 1 SP, NICE TO HAVE
  - `afterEach` calls `tmpFixtures.cleanup()` without null guard; crashes if `createTempFixtureDir()` throws
  - Source: BACKLOG (TASK-027 PR #25, 75/100)
- [ ] **Fix misleading describe label in unit tests** — 1 SP, NICE TO HAVE
  - `tests/media-viewer-utils.test.js` describe "keydown guard — undo in empty state" only tests `buildKeyString()`
  - Source: BACKLOG (TASK-027 PR #25, 50/100)

### Group D: CLIP Similarity Sorting
**Domain**: JS logic (sorting/ML feature)
**Total SP**: 5

- [ ] **Implement CLIP-based similarity sorting** — 5 SP, IMPORTANT
  - Replace or augment blockhash with CLIP cosine similarity for semantic grouping; embeddings already in `clipCache`
  - Requires changes to sorting-worker.js and media-viewer.js sorting integration
  - Source: BACKLOG (TASK-028)

### Group E: Resource Management [batch]
**Domain**: JS logic (memory/lifecycle)
**Total SP**: 5

- [ ] **Unload CLIP model after extraction completes** — 3 SP, IMPORTANT
  - CLIP ONNX model ~200–400 MB stays loaded indefinitely; null out `clipProcessor`/`clipVisionModel` after extraction; re-load lazily on next folder
  - Source: BACKLOG (TASK-028)
- [ ] **Add double-init protection for logger.js** — 2 SP, NICE TO HAVE
  - `init()` should close existing fd before opening new one to prevent fd leaks if called twice
  - Source: BACKLOG (TASK-025)

### Group F: Build & DX [batch]
**Domain**: Config / tooling
**Total SP**: 2

- [ ] **Pin Lucide CDN to specific version** — 1 SP, NICE TO HAVE
  - `index.html` loads `lucide@latest` — can break silently; pin to current known-good version
  - Source: BACKLOG (TASK-023)
- [ ] **Update regression-checker agent for FullscreenManager** — 1 SP, NICE TO HAVE
  - Agent references extracted methods (`fullscreenAbortControllers`, `cleanupFullscreen()`) — stale since TASK-019
  - Source: BACKLOG (PR #17)

---

## Daily Schedule

### Monday, April 14 — CLIP/ML Cleanup
> Front-load pipeline cleanup before building new features on top of CLIP code.

| Group | SP |
|-------|----|
| **Group B: CLIP/ML Pipeline Cleanup** [batch] | 7 |

- [x] Fix IPC listener accumulation for clip-download-progress (2 SP)
- [x] Skip redundant loadMediaAsImageData for CLIP-only extractions (2 SP)
- [x] Handle stale .ml_model.json after version upgrade (2 SP)
- [x] Remove dead worker code in clip-worker.js (1 SP)

**Daily total**: 7 SP

---

### Tuesday, April 15 — Bug Fix & Test Quality
> Fix the HIGH-priority compare mode bug + harden test infrastructure.

| Group | SP |
|-------|----|
| **Group A: Compare Mode Fix** [batch] | 4 |
| **Group C: Test Quality** [batch] | 2 |

- [x] Fix Single Mode buttons on folder switch (3 SP)
- [x] DRY `toggleViewMode()` with `switchToSingleModeUI()` (1 SP)
- [ ] Add E2E afterEach null safety (1 SP)
- [ ] Fix misleading describe label (1 SP)

**Daily total**: 6 SP

---

### Wednesday, April 16 — CLIP Sorting Feature
> Build semantic similarity sorting leveraging CLIP embeddings from TASK-028.

| Group | SP |
|-------|----|
| **Group D: CLIP Similarity Sorting** | 5 |

- [ ] Implement CLIP-based similarity sorting (5 SP)

**Daily total**: 5 SP | 🏆 Weekly Challenge

---

### Thursday, April 17 — Resource Management
> Optimize memory footprint and harden process lifecycle.

| Group | SP |
|-------|----|
| **Group E: Resource Management** [batch] | 5 |

- [ ] Unload CLIP model after extraction (3 SP)
- [ ] Add double-init protection for logger.js (2 SP)

**Daily total**: 5 SP

---

### Friday, April 18 — Build & DX + Buffer
> Light day for tooling fixes and buffer for overflow from earlier days.

| Group | SP |
|-------|----|
| **Group F: Build & DX** [batch] | 2 |

- [ ] Pin Lucide CDN to specific version (1 SP)
- [ ] Update regression-checker agent for FullscreenManager (1 SP)

**Daily total**: 2 SP (+ buffer capacity for carry-forward)

---

## Weekly Challenge 🏆

**CLIP-based similarity sorting** (Group D, Wednesday, 5 SP) — Technical deep-dive.

**Why this one**: TASK-028 just landed CLIP embeddings but they're only used for ML prediction. Wiring them into the sorting pipeline creates immediate user-visible value (semantic grouping: "photos of dogs" cluster together vs. just color/texture matching). It exercises the full data path (clipCache → sorting-worker → UI) and validates the CLIP integration end-to-end. High learning value for understanding how CLIP embeddings compare to blockhash in practice.

---

## Summary Table

| Group | Domain | Tasks | Total SP | Day | Status |
|-------|--------|-------|----------|-----|--------|
| B: CLIP/ML Cleanup | JS logic (CLIP/ML) | 4 | 7 | Mon | Planned |
| A: Compare Mode Fix | JS logic (mode switching) | 2 | 4 | Tue | Planned |
| C: Test Quality | Testing | 2 | 2 | Tue | Planned |
| D: CLIP Similarity Sorting | JS logic (sorting) | 1 | 5 | Wed | Planned |
| E: Resource Management | JS logic (memory) | 2 | 5 | Thu | Planned |
| F: Build & DX | Config/tooling | 2 | 2 | Fri | Planned |
| **Total** | | **13** | **25** | | |

---

## Notes

- **No velocity baseline**: First weekly plan — using conservative 5 SP/day. Adjust next week based on actuals.
- **v1.1 milestone overdue**: MILESTONES.md targets Q1 2026; we're in Q2. The compare mode bug fix (Group A) and ongoing polish work contribute to closing this out.
- **Monday front-loading rationale**: CLIP/ML cleanup (Group B) de-risks the rest of the week — Wednesday's CLIP sorting feature depends on clean pipeline code.
- **Friday buffer**: Intentionally light (2 SP) to absorb overflow. If all goes well, pull additional items from BACKLOG (candidates: progressive loading spec, UI zoom Ctrl+/-, CLIP text search UI design).
- **TODO.md note**: "Fix Single Mode buttons appearing alongside Compare Mode buttons on folder switch" remains in TODO.md per user instruction — do not remove it until the fix is completed and verified.
- **Dependency chain**: Group B (Mon) → Group D (Wed) — cleaning CLIP pipeline before building sorting on top of it.
