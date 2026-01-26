# Project Context

Project decisions, patterns, and historical context for Media Viewer.

---

## Project Overview

**Media Viewer** is an Electron-based desktop application for efficiently browsing, rating, and managing media files (images and videos). The primary use case is reviewing large collections of media and organizing them through a rating system.

### Core Value Proposition

- Fast navigation through large media collections
- Visual similarity-based sorting to group similar images
- Quick rating workflow with automatic file organization
- Side-by-side comparison mode for decision making

---

## Key Decisions

### Architecture Decisions

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Framework | Electron | Cross-platform desktop app with web technologies | Initial |
| Context Isolation | Enabled | Security best practice for Electron apps | Initial |
| Sandbox | Disabled | Required for file system operations | Initial |
| Sorting Worker | Web Worker | Prevents UI blocking, avoids Chromium throttling when minimized | 2025-12 |

### Algorithm Decisions

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Image Hashing | blockhash-js | Fast perceptual hashing, good balance of speed/accuracy | Initial |
| Similarity Search | VP-Tree | O(log n) nearest neighbor search vs O(n) brute force | Initial |
| Sorting Algorithm | MST-based | Produces optimal path through similarity graph | Initial |
| Hash Storage | IndexedDB | Persistent cache, survives app restarts | 2025-12 |

### UI/UX Decisions

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Notifications | Bottom-right corner | Less intrusive, doesn't cover media | 2025-12 |
| Media Info | Click-to-show | Hover was too intrusive during fast navigation | 2025-12 |
| Zoom Controls | Mouse wheel + double-click | Intuitive, matches common image viewers | 2025-12 |
| View Modes | Single + Compare | Single for browsing, compare for decisions | Initial |

---

## Patterns & Conventions

### Code Organization

- **Single-file renderer**: All UI logic in `media-viewer.js` (class-based)
- **IPC Communication**: Main process handles file operations, renderer handles UI
- **Event-driven**: DOM events trigger state changes and UI updates

### Naming Conventions

- **Functions**: camelCase, verb-first (`loadMedia`, `showNotification`)
- **Classes**: PascalCase (`MinHeap`, `VPTree`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **DOM IDs**: kebab-case (`media-container`, `folder-info`)

### State Management

- Application state stored in class properties
- No external state management library
- Settings persisted via `localStorage`

### Error Handling

- User-facing errors shown via notification system
- Console logging for debugging
- Graceful degradation when features unavailable

---

## Technical Debt

| Item | Description | Priority |
|------|-------------|----------|
| Large renderer file | `media-viewer.js` contains all UI logic (~2000+ lines) | Low |
| No TypeScript | Plain JavaScript, no type checking | Low |
| No automated tests | Manual testing only | Medium |

---

## Lessons Learned

### 2025-12: Web Worker for Sorting

**Problem**: Sorting algorithm stopped working when window was minimized.

**Root Cause**: Chromium throttles `setTimeout` to ~1s intervals for background tabs/minimized windows.

**Solution**: Moved sorting algorithms to Web Worker (separate thread not affected by throttling).

**Lesson**: CPU-intensive operations should always use Web Workers in Electron apps.

### 2025-12: Notification Placement

**Problem**: Notifications covered media content, especially on smaller screens.

**Solution**: Moved to bottom-right corner, added option to disable rating confirmations.

**Lesson**: UI elements should never obstruct primary content. Make intrusive features optional.

---

## Future Considerations

- Consider modularizing `media-viewer.js` into separate files
- TypeScript migration would improve maintainability
- Test framework setup (Jest or similar)
- Keyboard shortcut customization

---

*Last Updated: 2026-01-26*
