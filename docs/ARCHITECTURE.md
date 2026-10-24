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

**IPC Handlers**: every privileged channel is registered through `ipc-guard.js` (`guard.handle` / `guard.on`), never directly on `ipcMain`; a lint rule enforces this. Examples:
- `open-folder-dialog` — open the system folder picker; **the only place a folder is granted**
- `load-folder` — list media files in a granted folder
- `move-file` — move a media file into a granted folder, never replacing an existing one
- `read-folder-cache` / `write-folder-cache` — per-folder caches by fixed name (`hash`, `sort`)
- `feature-cache-open` / `-chunk` / `-close` and `feature-cache-write-open` / `-write-chunk` / `-write-close` — the feature cache, streamed both ways; `feature-cache-ledger.js` records what main read and refuses a write it cannot account for
- `get-grant-status` — which saved folders are granted (`true`), not granted (`false`) or `unreachable`
See `main.js` for the full list and each channel's argument kinds.

### Preload Script (`preload.js`)

**Responsibility**: Security bridge between main and renderer.

Exposes named, single-purpose calls via `contextBridge` (`window.electronAPI.*`). Since G1 (2026-10-11) there is no generic `invoke`, `readFile` or `writeFile` passthrough.
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
│ Hash workers (pool) │
│ hash the snapshot's │
│ images; videos and  │
│ failures fall back  │
│ to the main-thread  │
│ route (or load from │
│ .hash_cache.json)   │
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
│ Renderer: apply     │
│ now, or offer Show  │
│ if the user acted   │
│ (one apply function)│
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
| Image Hashes | `.hash_cache.json` in the media folder (filename → hash) | Sorting cache, survives restarts; written atomically (tmp + rename), or in place while another program holds the file open. The first save in a folder whose load did not parse the file merges the file's valid entries into memory, so later saves (which write memory) keep them |

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
├── app-protocol.js      # App scheme handler (app files + granted media)
├── media-url.js         # Media URLs for the renderer
├── storage-migration.js # One-time settings move to the app origin
├── migrate.html         # Static page the settings move loads
├── vendor/lucide/       # Vendored icon library
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
- **Preload Script**: named, folder-scoped calls only
- **IPC guard** (`ipc-guard.js`): each call must come from the app's own top-level page, exactly `app://media-viewer/index.html`, and each argument must pass its channel's declared kind. A refusal returns the channel's usual failure value and is logged.
- **Content-Security-Policy** (a response header on every app file, `APP_CSP` in `main.js`): no inline script; each directive was measured by an end-to-end walk; violations are logged to the session log.
- **Navigation lock**: the window cannot navigate away from the app page (another page on the app origin included) or open new windows.
- **App scheme** (`app-protocol.js`): the window is served from `app://media-viewer/`; app files come from an allowlist, and media from granted folders under `/@fs/`, through the same read rule as the IPC guard. Design: [I1 spec](superpowers/specs/2026-10-18-g1-i1-page-load-confinement-design.md).
- **Renderer HTML**: values are inserted as text, never parsed as HTML. An ESLint rule enforces this.

### File Access

- **Folder grants** (`path-grants.js`): the main process acts only on paths inside folders the user picked in its own dialog. Grants persist in `userData/folder-grants.json`.
  - Containment compares canonical (`realpath`) paths exactly.
  - Moves are authorized by the folder holding the entry; content reads accept media files only.
- **Saved data**: per-folder caches and saved tournament state are treated as untrusted folder content and validated before use. Tournament apply is confined to the folder.
- **Media tools**: `ffmpeg`/`ffprobe` are restricted to local files (`-protocol_whitelist file`).
- **Network**: none required; no external API calls; Lucide is vendored, and renderer network requests are cancelled (the main process's CLIP model download is unaffected).
- Design: [G1 security findings fix spec](superpowers/specs/2026-10-10-g1-security-findings-fix-design.md).

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
