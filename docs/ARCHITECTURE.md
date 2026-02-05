# Architecture

System architecture and component relationships for Media Viewer.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Electron App                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    IPC Bridge    ┌───────────────────────────────┐ │
│  │ Main Process │◄────────────────►│       Renderer Process        │ │
│  │  (main.js)   │                  │      (media-viewer.js)        │ │
│  └──────┬───────┘                  └──────────────┬────────────────┘ │
│         │                                         │                  │
│         ▼                                         ▼                  │
│  ┌──────────────┐                  ┌───────────────────────────────┐ │
│  │ File System  │                  │         Web Workers           │ │
│  │ Operations   │                  │  ┌─────────────────────────┐  │ │
│  └──────────────┘                  │  │ sorting-worker.js       │  │ │
│                                    │  │ (similarity sorting)    │  │ │
│                                    │  ├─────────────────────────┤  │ │
│                                    │  │ ml-worker.js            │  │ │
│                                    │  │ (ML prediction)         │  │ │
│                                    │  ├─────────────────────────┤  │ │
│                                    │  │ feature-worker.js       │  │ │
│                                    │  │ (feature extraction)    │  │ │
│                                    │  └─────────────────────────┘  │ │
│                                    └───────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Overview

### Main Process (`main.js`)

**Responsibility**: Node.js runtime, system access, window management.

| Function | Purpose |
|----------|---------|
| Window Management | Create/manage BrowserWindow |
| File Operations | Read directories, move/copy files |
| Dialog Handling | System folder picker dialogs |
| Global Shortcuts | Alt+F4 and other system shortcuts |

**IPC Handlers**:
- `open-folder-dialog` — Open system folder picker
- `load-folder` — List media files in directory
- `get-file-data` — Read file as base64 for display
- `move-file` — Move file to rating folder
- `get-file-hash` — Calculate file hash (for caching)

### Preload Script (`preload.js`)

**Responsibility**: Security bridge between main and renderer.

Exposes limited API via `contextBridge`:
- `window.electronAPI.openFolderDialog()`
- `window.electronAPI.loadFolder(path)`
- `window.electronAPI.getFileData(path)`
- `window.electronAPI.moveFile(source, dest)`
- `window.electronAPI.getFileHash(path)`

### Renderer Process (`media-viewer.js`)

**Responsibility**: All UI logic, user interactions, algorithms.

**Key Classes**:

| Class | Purpose |
|-------|---------|
| `MinHeap` | Priority queue for MST algorithm |
| `VPTree` | Vantage-point tree for similarity search |
| `MediaViewer` | Main application class |

**MediaViewer Responsibilities**:
- DOM manipulation and event handling
- View mode management (single/compare)
- Media display (images and videos)
- Zoom and pan functionality
- Rating workflow
- Similarity sorting orchestration
- Settings management
- Notification system

### Web Worker (`sorting-worker.js`)

**Responsibility**: CPU-intensive sorting algorithms (runs in separate thread).

**Why Worker**: Chromium throttles timers in background/minimized windows. Worker thread is not affected.

**Algorithms**:
- Simple nearest-neighbor sorting
- VP-Tree accelerated sorting
- MST-based optimal path sorting

**Communication**: `postMessage` for commands/results, supports abort via message.

---

## Data Flow

### Media Loading Flow

```
User clicks "Select Folder"
         │
         ▼
┌─────────────────────┐
│ Renderer: trigger   │
│ folder dialog       │
└──────────┬──────────┘
           │ IPC: open-folder-dialog
           ▼
┌─────────────────────┐
│ Main: show system   │
│ folder picker       │
└──────────┬──────────┘
           │ IPC: load-folder
           ▼
┌─────────────────────┐
│ Main: read dir,     │
│ filter media files  │
└──────────┬──────────┘
           │ Return file list
           ▼
┌─────────────────────┐
│ Renderer: store     │
│ files, show first   │
└─────────────────────┘
```

### Similarity Sorting Flow

```
User clicks "Sort by Similarity"
         │
         ▼
┌─────────────────────┐
│ Renderer: compute   │
│ hashes for all      │
│ images (or load     │
│ from IndexedDB)     │
└──────────┬──────────┘
           │ postMessage(hashes)
           ▼
┌─────────────────────┐
│ Worker: build       │
│ VP-Tree, run MST    │
│ algorithm           │
└──────────┬──────────┘
           │ postMessage(sorted paths)
           ▼
┌─────────────────────┐
│ Renderer: reorder   │
│ file list, refresh  │
│ display             │
└─────────────────────┘
```

### Rating Flow

```
User clicks Like/Dislike
         │
         ▼
┌─────────────────────┐
│ Renderer: determine │
│ target folder       │
└──────────┬──────────┘
           │ IPC: move-file
           ▼
┌─────────────────────┐
│ Main: fs.rename()   │
│ (move file)         │
└──────────┬──────────┘
           │ Success/error
           ▼
┌─────────────────────┐
│ Renderer: remove    │
│ from list, show     │
│ next, save undo     │
└─────────────────────┘
```

---

## State Management

### Application State (MediaViewer class)

```javascript
{
  // File management
  mediaFiles: [],           // Array of {name, path, size, type}
  currentIndex: 0,          // Current position in file list
  currentFolder: null,      // Selected folder path

  // View state
  viewMode: 'single',       // 'single' | 'compare'
  compareIndex: 1,          // Second image index in compare mode

  // Zoom state (per image)
  zoomLevel: 1,
  panX: 0,
  panY: 0,

  // Sorting state
  isSorting: false,
  sortingWorker: null,
  imageHashes: Map,         // path -> hash

  // Undo stack
  undoStack: [],            // Recent moves for undo

  // Settings (persisted in localStorage)
  likeFolder: null,
  dislikeFolder: null,
  specialFolder: null,
  autoCloseErrors: false,
  showRatingNotifications: true
}
```

### Persistence

| Data | Storage | Purpose |
|------|---------|---------|
| Settings | localStorage | User preferences |
| Image Hashes | IndexedDB | Sorting cache, survives restarts |

---

## File Structure

```
media_viewer/
├── main.js              # Electron main process
├── preload.js           # Context bridge (security)
├── media-viewer.js      # Renderer process (UI logic)
├── sorting-worker.js    # Web Worker (sorting algorithms)
├── ml-worker.js         # Web Worker (ML predictions)
├── ml-model.js          # ML model definitions
├── feature-extractor.js # Image feature extraction
├── feature-worker.js    # Web Worker (feature extraction)
├── face-detector.js     # Face detection features
├── index.html           # Main HTML template
├── styles.css           # UI styles
├── package.json         # Dependencies and scripts
├── docs/                # Documentation
│   ├── README.md        # Documentation index
│   ├── ARCHITECTURE.md  # This file
│   ├── PROJECT_CONTEXT.md # Decisions, patterns
│   ├── MANUAL_TESTING.md  # Manual test scenarios
│   ├── planning/        # Planning documents
│   │   ├── TODO.md      # Active tasks
│   │   ├── DONE.md      # Completed tasks
│   │   ├── BACKLOG.md   # Unprioritized ideas
│   │   ├── ROADMAP.md   # Long-term vision
│   │   └── plans/       # Implementation plans
│   └── archive/         # Archived documentation
└── .claude/             # Claude Code configuration
```

---

## Security Model

### Electron Security

- **Context Isolation**: Enabled (renderer cannot access Node.js)
- **Node Integration**: Disabled
- **Sandbox**: Disabled (required for file operations)
- **Preload Script**: Only exposes necessary APIs

### File Access

- Read-only access to selected folder
- Write access limited to configured rating folders
- No network access required
- No external API calls

---

## Extension Points

### Adding New Sorting Algorithm

1. Implement algorithm in `sorting-worker.js`
2. Add message handler for new algorithm type
3. Add UI option in renderer

### Adding New File Format

1. Add extension to `isMediaFile()` in `main.js`
2. Add MIME type to `getMimeType()` in `main.js`
3. Handle display in renderer if special handling needed

### Adding New View Mode

1. Add mode constant and state
2. Implement `show[Mode]View()` method
3. Add UI toggle button
4. Handle keyboard shortcuts

---

*Last Updated: 2026-02-05*
