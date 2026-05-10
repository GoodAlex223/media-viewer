# Documentation Index

Central index for all project documentation.

## Active Documents

| Document                                 | Purpose                                      |
|------------------------------------------|----------------------------------------------|
| [TODO.md](planning/TODO.md)              | Active tasks and planned features            |
| [DONE.md](planning/DONE.md)              | Completed tasks archive                      |
| [BACKLOG.md](planning/BACKLOG.md)        | Unprioritized ideas and improvements         |
| [ROADMAP.md](planning/ROADMAP.md)        | Long-term vision and releases                |
| [GOALS.md](planning/GOALS.md)            | Objectives and success metrics               |
| [MILESTONES.md](planning/MILESTONES.md)  | Key targets with dates                       |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Project decisions, patterns, history         |
| [ARCHITECTURE.md](ARCHITECTURE.md)       | System architecture, component relationships |
| [MANUAL_TESTING.md](MANUAL_TESTING.md)   | Manual testing scenarios and checklists      |
| [WEEKLY.md](planning/WEEKLY.md)          | Weekly task schedule and daily breakdown      |

## Planning Index

| Document                                           | Purpose                        |
|----------------------------------------------------|--------------------------------|
| [planning/README.md](planning/README.md)           | Planning workflow and overview  |
| [planning/plans/README.md](planning/plans/README.md) | Active implementation plans |

## Active Plans

| Document                    | Purpose                               |
|-----------------------------|---------------------------------------|
| [Video Fullscreen Toggle][] | Exit fullscreen on second video click |

[Video Fullscreen Toggle]: planning/plans/2025-12-29_video-fullscreen-toggle.md

## Archived Plans

| Document                          | Purpose                                     |
|-----------------------------------|---------------------------------------------|
| [Notifications & Media Info][]    | Less intrusive notifications and media info |
| [Sorting Cache][]                 | Cache sorting algorithm results             |
| [Background Feature Extraction][] | Worker pool for parallel feature extraction |
| [Compare Mode AI Sort Bug][]      | Fix file mismatch in AI sorting mode        |
| [CLIP/ML Pipeline Cleanup Plan][] | CLIP/ML pipeline cleanup implementation     |
| [Compare Mode Fix Plan][]        | Compare mode folder-switch fix + DRY refactor |
| [Test Quality Plan][]            | E2E afterEach null guards + describe label rename |
| [CLIP Similarity Sorting Plan][] | CLIP cosine similarity MST-based sort algorithm |
| [Resource Management Plan][]    | CLIP model unload after extraction + logger double-init guard |
| [Group F Build & DX Plan][]     | Pin Lucide CDN with SRI + update regression-checker agent for FullscreenManager |
| [CLIP Sort Follow-ups Plan][]   | Algorithm-aware new-file insertion + CLIP toggle-off cache cleanup + sortMediaBySimilarityClip tests |
| [CLIP Extraction Silent Failure Plan][] | Wire `startBackgroundFeatureExtraction()` into `loadFolder()` via `kickoffBackgroundExtractionIfEnabled()` helper |

[Notifications & Media Info]: archive/plans/2025-12-25_notifications-media-info-less-intrusive.md
[Sorting Cache]: archive/plans/2025-12-27_sorting-cache.md
[Background Feature Extraction]: archive/plans/2025-12-28_background-feature-extraction.md
[Compare Mode AI Sort Bug]: archive/plans/2026-01-02_compare-mode-ai-sort-bug.md
[CLIP/ML Pipeline Cleanup Plan]: archive/plans/2026-04-09-clip-ml-cleanup.md
[Compare Mode Fix Plan]: archive/plans/2026-04-10-compare-mode-fix.md
[Test Quality Plan]: archive/plans/2026-04-11-test-quality.md
[CLIP Similarity Sorting Plan]: archive/plans/2026-04-16-clip-similarity-sorting.md
[Resource Management Plan]: archive/plans/2026-04-20-group-e-resource-management.md
[Group F Build & DX Plan]: archive/plans/2026-04-29-group-f-build-dx.md
[CLIP Sort Follow-ups Plan]: archive/plans/2026-05-02-clip-sort-followups.md
[CLIP Extraction Silent Failure Plan]: archive/plans/2026-05-06-clip-extraction-silent-failure.md

## Design Specs

| Document | Purpose |
|----------|---------|
| [TASK-019 Extract Fullscreen Module][] | Fullscreen module extraction design |
| [TASK-020 ML Sorting Investigation][] | ML sorting race condition fix design |
| [TASK-021 Overlay Controls UX][] | Overlay controls positioning fix design |
| [TASK-022 Compare Last-Pair Fix][] | Compare mode last-pair error cascade fix |
| [TASK-024 Per-Folder Feature Cache][] | Per-folder feature extraction caching |
| [TASK-025 Application Logging][] | File-based application logging design |
| [TASK-026 Keyboard Shortcuts][] | Keyboard shortcut customization design |
| [TASK-027 Undo Empty State][] | Undo fix when no media remains in folder |
| [CLIP/ML Pipeline Cleanup][] | CLIP/ML pipeline cleanup (IPC listener, image decode, model cache, dead code) |
| [Compare Mode Fix][] | Compare mode folder-switch fix + DRY toggleViewMode refactor |
| [Test Quality][] | E2E afterEach null guards + misleading describe label rename |
| [CLIP Similarity Sorting][] | CLIP cosine-distance MST-based semantic sort algorithm |
| [Resource Management][]     | CLIP model unload after extraction + logger.js double-init guard |
| [Group F Build & DX][]      | Pin Lucide CDN with SRI hash + regression-checker agent update for FullscreenManager |
| [CLIP Sort Follow-ups][]    | Algorithm-aware new-file insertion (cosine for CLIP cache hits) + toggle-off cache+state cleanup |

[TASK-019 Extract Fullscreen Module]: superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md
[TASK-020 ML Sorting Investigation]: superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md
[TASK-021 Overlay Controls UX]: superpowers/specs/2026-03-21-task-021-fix-compare-overlay-ux-design.md
[TASK-022 Compare Last-Pair Fix]: superpowers/specs/2026-03-22-task-022-fix-compare-last-pair-design.md
[TASK-024 Per-Folder Feature Cache]: superpowers/specs/2026-03-24-task-024-per-folder-feature-cache-design.md
[TASK-025 Application Logging]: superpowers/specs/2026-03-26-task-025-application-logging-design.md
[TASK-026 Keyboard Shortcuts]: superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md
[TASK-027 Undo Empty State]: superpowers/specs/2026-03-28-task-027-fix-undo-empty-folder-design.md
[TASK-028 CLIP Semantic Features]: superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md
[CLIP/ML Pipeline Cleanup]: superpowers/specs/2026-04-09-clip-ml-cleanup-design.md
[Compare Mode Fix]: superpowers/specs/2026-04-10-compare-mode-fix-design.md
[Test Quality]: superpowers/specs/2026-04-11-test-quality-design.md
[CLIP Similarity Sorting]: superpowers/specs/2026-04-16-clip-similarity-sorting-design.md
[Resource Management]: superpowers/specs/2026-04-20-group-e-resource-management-design.md
[Group F Build & DX]: superpowers/specs/2026-04-29-group-f-build-dx-design.md
[CLIP Sort Follow-ups]: superpowers/specs/2026-05-02-clip-sort-followups-design.md

## Archives

| Document                               | Purpose                      |
|----------------------------------------|------------------------------|
| [archive/README.md](archive/README.md) | Archive index and guidelines |

---

*Last Updated: 2026-04-30*
