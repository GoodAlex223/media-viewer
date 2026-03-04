# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- AUTO-MANAGED: project-description -->
## Overview

**Media Viewer** - Electron desktop application for browsing, rating, and managing media files (images and videos) with visual similarity sorting and ML-based prediction features.

Key capabilities:
- Browse media folders with image/video preview
- Rate files (like/dislike/special) with keyboard shortcuts
- Visual similarity sorting using perceptual hashing
- ML-based prediction for user preferences
- Face detection features

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: build-commands -->
## Build & Development Commands

```bash
# Install dependencies
npm install

# Run the application
npm start

# Run with Electron directly
npx electron .
```

No automated tests, linting, or type checking configured.

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: architecture -->
## Architecture

```
media_viewer/
├── main.js              # Electron main process, IPC handlers, file operations
├── preload.js           # Security bridge, context isolation
├── media-viewer.js      # Renderer process, all UI logic (~6300+ lines)
├── index.html           # Main HTML entry point
├── styles.css           # Application styling, design system
├── sorting-worker.js    # Web Worker for sorting algorithms (MST, similarity)
├── ml-worker.js         # Web Worker for ML prediction tasks
├── ml-model.js          # ML model definitions
├── feature-extractor.js # Image feature extraction
├── feature-worker.js    # Web Worker for feature extraction
├── face-detector.js     # Face detection using @vladmandic/face-api
└── docs/                # Project documentation
    ├── planning/        # Task management (TODO, DONE, BACKLOG, GOALS, MILESTONES, ROADMAP)
    ├── archive/         # Historical documentation
    ├── ARCHITECTURE.md  # System design and data flows
    └── PROJECT_CONTEXT.md # Decisions, patterns, lessons learned
```

**Data Flow**:
1. Main process handles file system operations (read, move, copy)
2. Preload exposes secure IPC bridge to renderer
3. Renderer (media-viewer.js) manages UI state and user interactions
4. CPU-intensive tasks delegated to Web Workers (sorting, ML, feature extraction)

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

**Naming**:
- Functions: camelCase, verb-first (`loadMedia`, `showNotification`, `createZoomPopover`, `removeFileFromList`)
- Classes: PascalCase (`MinHeap`, `VPTree`, `MediaViewer`)
- Constants: UPPER_SNAKE_CASE (`MAX_NOTIFICATIONS`)
- DOM IDs: kebab-case (`media-container`, `folder-info`, `zoom-toggle-btn`)
- CSS Classes: kebab-case (`file-info-panel`, `zoom-popover`, `overlay-zoom-btn`)

**Patterns**:
- Single-file renderer: All UI logic in `media-viewer.js` (class-based)
- IPC Communication: Main process handles file ops, renderer handles UI
- Event-driven: DOM events trigger state changes and UI updates
- Web Workers: CPU-intensive operations (sorting, ML) in separate threads
- Centralized cleanup: Reusable methods for common operations (file removal, cache cleanup)

**Imports**:
- CommonJS `require()` in main process and workers
- Browser globals in renderer (no module bundler)

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: patterns -->
## Detected Patterns

**Error Handling**:
- User-facing errors via notification system (bottom-right corner)
- Console logging for debugging
- Graceful degradation when features unavailable

**Data Structures**:
- MinHeap for priority queue operations
- VPTree (Vantage Point Tree) for nearest neighbor search
- Perceptual hashing for image similarity
- zoomControlsMap: Keyed by target ('single', 'left', 'right'), stores popover and toggleBtn refs

**State Management**:
- Class-based state in MediaViewer
- localStorage for user preferences (folders, settings)

**Index Management**:
- Wrap-to-start: moveCurrentFile() cycles to index 0 when rating last file (continuous workflow)
- Cap-to-end: removeFileFromList() caps to length-1 by default (safe fallback)
- Reset to 0: Folder loads, sort operations, mode switches reset currentIndex

**Cache Management**:
- Centralized cleanup via removeFileFromList(): Handles array splice, cache cleanup (predictionScores, featureCache, perceptualHashes), and currentIndex adjustment
- Used by: removeFailedFile(), moveCurrentFile(), moveToSpecialFolder(), moveComparePair()
- Ensures consistent state across all file removal scenarios
- Sort cache: deleteSortCache(algorithm) selectively removes one algorithm's entry from .sort_cache.json; called by force re-sort path (Shift+click on Sort by Similarity)

**UI Component Management**:
- Dynamic zoom controls: Created per media pane via createZoomPopover(target, wrapper, toggleBtn)
- Popover lifecycle: createZoomPopover() creates, removeZoomPopover(target) cleans up
- Popover architecture: Zoom controls positioned above buttons via .control-btn-wrapper
- Single mode: Static zoom button in HTML, initialized by setupZoomPopovers()
- Compare mode: Zoom buttons added dynamically to overlay controls (addMediaOverlayControls)
- User-controlled visibility: Popovers toggle on button click, close on outside click

**Event Listener Lifecycle**:
- AbortController for scoped cleanup: fullscreenAbortControllers Map<wrapper, AbortController> stores controllers per wrapper element
- cleanupFullscreen(wrapper): unified exit point for ALL paths (click, ESC, Z/X keys, mode switch, pair navigation) — calls abortFullscreenController() first
- abortFullscreenController(wrapper): helper that aborts and deletes the controller; called by cleanupFullscreen() and before wrapper.remove()
- Prevents listener accumulation: exitHandler attached via { signal } so abort() removes it without stored reference
- Also used for sort cancellation (sortAbortController) and background extraction (backgroundExtractionAbort)

**Compare Mode Validation**:
- showCompareMedia() validates both files exist via IPC checkFileExists before rendering
- Parallel validation: Promise.all([checkFileExists(left), checkFileExists(right)])
- Missing files removed via removeFileFromList(), warning shown, retry attempted
- Bounded retry: retryCount parameter prevents deep recursion (max 10 retries)
- Graceful fallback: switches to single mode or shows drop zone when fewer than 2 files remain
- failedIndex resolved via mediaFiles.findIndex(f => f.path === file.path) for accuracy in ML-sorted pairs

**Security**:
- Context isolation enabled
- Sandbox disabled (required for file operations)
- IPC bridge via preload.js

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

Recent development focus:
- Force re-sort (Shift+click): handleSortBySimilarity(forceResort) accepts Shift+click flag; deleteSortCache() removes cached order; originalMediaFiles snapshot preserved across force re-sorts so "Restore Order" always returns to disk order (TASK-007)
- Unified fullscreen cleanup: Renamed exitFullscreen() to cleanupFullscreen(); routed all 5 exit paths (click, ESC, Z/X keys, toggleViewMode, showCompareMedia) through it as single source of truth (TASK-006)
- Fullscreen exit handler leak guard: AbortController-based listener cleanup via fullscreenAbortControllers Map; abortFullscreenController() helper called before all wrapper.remove() sites (TASK-005)
- Compare file existence validation: showCompareMedia() validates files via IPC before display, bounded retry up to 10 (TASK-004)
- Index wrap behavior fix: Restore wrap-to-start in moveCurrentFile() for continuous rating
- File removal refactor: Centralized cleanup method replacing duplicate logic
- Zoom controls refactor: Per-pane dynamic generation with reusable methods
- Visual media scale controls with logarithmic zoom mapping (TASK-002)
- Compare mode overlay controls with zoom integration
- ML feature extraction with 64-dimension vectors and quality metrics
- ML online learning with lazy initialization

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: best-practices -->
## Best Practices

When modifying this codebase:
- Test file operations carefully (move/copy can cause data loss)
- Changes to preload.js require security review
- Worker changes may impact performance significantly
- The renderer file is large - consider searching before adding duplicates

<!-- END AUTO-MANAGED -->

<!-- MANUAL -->
## Custom Notes

Add project-specific notes here. This section is never auto-modified.

<!-- END MANUAL -->
