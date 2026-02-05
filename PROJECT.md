# PROJECT.md

Project-specific configuration. Universal rules are in [CLAUDE.md](CLAUDE.md).

**Last Updated**: 2026-02-05

---

## Project Overview

**Media Viewer** is an Electron-based desktop application for browsing, rating, and managing media files (images and videos) with visual similarity sorting and ML-based prediction features.

### Tech Stack

| Component | Technology |
|-----------|------------|
| Language | JavaScript (ES6+) |
| Framework | Electron 39.x |
| UI | HTML/CSS (no framework) |
| Testing | Manual (no automated tests) |
| CI/CD | None |

---

## Project Structure

| Component | Location | Purpose |
|-----------|----------|---------|
| Entry Point | `main.js` | Electron main process |
| Security Bridge | `preload.js` | IPC context bridge |
| Core UI | `media-viewer.js` | Renderer process, all UI logic |
| Sorting | `sorting-worker.js` | Web Worker for sorting algorithms |
| ML Features | `ml-worker.js`, `ml-model.js` | ML prediction |
| Feature Extraction | `feature-worker.js`, `feature-extractor.js` | Image feature extraction |
| Face Detection | `face-detector.js` | Face detection features |
| Config | `package.json` | Dependencies and scripts |

---

## Commands

### Development

```bash
# Install dependencies
npm install

# Run application
npm start

# Run tests (not configured)
npm test
```

### Code Quality

```bash
# No linting configured
# No type checking (plain JavaScript)
# No pre-commit hooks configured
```

---

## Critical Systems (Tier Classification)

| Tier | Description | Examples | Modification Rules |
|------|-------------|----------|-------------------|
| 1 | Critical | `preload.js` (security bridge), file move handlers in `main.js` | Requires explicit user approval |
| 2 | Important | `ml-worker.js`, `sorting-worker.js` (performance-critical) | Requires plan review |
| 3 | Standard | `media-viewer.js` (UI logic) | Standard workflow |
| 4 | Low-risk | Documentation, styles.css | Proceed with normal care |

---

## Project-Specific Conventions

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Functions | camelCase, verb-first | `loadMedia`, `showNotification` |
| Classes | PascalCase | `MinHeap`, `VPTree`, `MediaViewer` |
| Constants | UPPER_SNAKE_CASE | `MAX_NOTIFICATIONS` |
| DOM IDs | kebab-case | `media-container`, `folder-info` |
| CSS Classes | kebab-case | `file-info-panel`, `zoom-indicator` |

### Code Patterns

- **Single-file renderer**: All UI logic in `media-viewer.js` (class-based)
- **IPC Communication**: Main process handles file operations, renderer handles UI
- **Event-driven**: DOM events trigger state changes and UI updates
- **Web Workers**: CPU-intensive operations (sorting, ML) run in workers

### Error Handling

- User-facing errors shown via notification system (bottom-right corner)
- Console logging for debugging
- Graceful degradation when features unavailable
- Error notifications can be configured to auto-close or persist

---

## External Dependencies

### APIs

| Service | Purpose | Docs Location |
|---------|---------|---------------|
| Electron | Desktop app framework | [electronjs.org](https://electronjs.org) |
| blockhash | Perceptual image hashing | npm package |
| @vladmandic/face-api | Face detection | npm package |
| ffprobe-static | Video metadata | npm package |

### Configuration

| Variable | Purpose | Location |
|----------|---------|----------|
| likeFolder | Destination for liked files | localStorage |
| dislikeFolder | Destination for disliked files | localStorage |
| specialFolder | Destination for special files | localStorage |
| showRatingNotifications | Toggle rating confirmations | localStorage |
| autoCloseErrors | Toggle error auto-close | localStorage |

---

## Domain-Specific Documentation

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, data flows |
| [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) | Decisions, patterns, lessons learned |
| [docs/planning/TODO.md](docs/planning/TODO.md) | Active tasks |
| [docs/planning/DONE.md](docs/planning/DONE.md) | Completed tasks |
| [docs/planning/BACKLOG.md](docs/planning/BACKLOG.md) | Unprioritized ideas |

---

## Known Limitations

1. **Large renderer file**: `media-viewer.js` contains all UI logic (~6100+ lines) - consider modularizing
2. **No TypeScript**: Plain JavaScript with no type checking
3. **No automated tests**: Manual testing only
4. **Sandbox disabled**: Required for file operations but reduces security

---

## Contact / Ownership

| Role | Contact |
|------|---------|
| Maintainer | goodalex223 |

---

*For universal Claude Code rules, see [CLAUDE.md](CLAUDE.md).*
*For documentation index, see [docs/README.md](docs/README.md).*
