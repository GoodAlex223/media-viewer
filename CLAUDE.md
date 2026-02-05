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
├── media-viewer.js      # Renderer process, all UI logic (~6100+ lines)
├── index.html           # Main HTML entry point
├── sorting-worker.js    # Web Worker for sorting algorithms (MST, similarity)
├── ml-worker.js         # Web Worker for ML prediction tasks
├── ml-model.js          # ML model definitions
├── feature-extractor.js # Image feature extraction
├── feature-worker.js    # Web Worker for feature extraction
├── face-detector.js     # Face detection using @vladmandic/face-api
└── docs/                # Project documentation
```

**Data Flow**:
1. Main process handles file system operations (read, move, copy)
2. Preload exposes secure IPC bridge to renderer
3. Renderer (media-viewer.js) manages UI state and user interactions
4. CPU-intensive tasks delegated to Web Workers

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: conventions -->
## Code Conventions

**Naming**:
- Functions: camelCase, verb-first (`loadMedia`, `showNotification`)
- Classes: PascalCase (`MinHeap`, `VPTree`, `MediaViewer`)
- Constants: UPPER_SNAKE_CASE (`MAX_NOTIFICATIONS`)
- DOM IDs: kebab-case (`media-container`, `folder-info`)
- CSS Classes: kebab-case (`file-info-panel`, `zoom-indicator`)

**Patterns**:
- Single-file renderer: All UI logic in `media-viewer.js` (class-based)
- IPC Communication: Main process handles file ops, renderer handles UI
- Event-driven: DOM events trigger state changes and UI updates
- Web Workers: CPU-intensive operations (sorting, ML) in separate threads

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

**State Management**:
- Class-based state in MediaViewer
- localStorage for user preferences (folders, settings)

**Security**:
- Context isolation enabled
- Sandbox disabled (required for file operations)
- IPC bridge via preload.js

<!-- END AUTO-MANAGED -->

<!-- AUTO-MANAGED: git-insights -->
## Git Insights

Recent development focus:
- ML feature extraction with 64-dimension vectors
- Online learning for ML predictions
- Compare mode with special folder support
- Documentation reorganization

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
