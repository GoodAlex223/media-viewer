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
- Zoom and pan: delegated to `ZoomManager` (`zoom.js`, `this.zoom`); MediaViewer resets a side's zoom on each render and attaches each new media element
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

  // Zoom and pan: ZoomManager (zoom.js), this.zoom
  zoom: ZoomManager,

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

Every tracked file outside `tests/`, `docs/`, `scripts/`, `vendor/` and `.claude/`, by process. `CLAUDE.md`'s Architecture tree says what each one holds.

```
media_viewer/
├── Main process (Node, CommonJS)
│   ├── main.js                # App lifecycle, every IPC handler (through ipc-guard), file operations
│   ├── main/                  # v2: main-process code in folders
│   │   ├── module-registry.js #   Module discovery, manifest validation, dependency resolution, modules.json
│   │   ├── folder-files.js    #   A module's per-folder files: tagged read, atomic write, delete
│   │   └── module-ipc.js      #   The module channels (list, toggle, folder-file read/write/delete)
│   ├── app-menu.js            # Application menu (no Reload: a reload skips the save at quit)
│   ├── app-protocol.js        # The app scheme: app files, core/ and module files, granted media
│   ├── atomic-write.js        # Folder-file writer: unique tmp, fsync, rename
│   ├── clip-image.js          # CLIP image decode (strict, then lenient)
│   ├── feature-cache-ledger.js # Feature-cache read classification and write checks
│   ├── ipc-guard.js           # IPC registration: sender check and argument kinds
│   ├── logger.js              # Session and perf logs
│   ├── path-grants.js         # Folder grants and containment
│   └── storage-migration.js   # One-time localStorage move to the app origin (with migrate.html)
├── Bridge
│   └── preload.js             # contextBridge → window.electronAPI (Tier 1)
├── Renderer (ES modules)
│   ├── index.html, styles.css
│   ├── media-viewer.js        # MediaViewer: the UI
│   ├── core/                  # v2: core renderer code
│   │   ├── module-host.js     #   Loads modules, gives each a host, runs folder visits
│   │   ├── host-api.js        #   The host API's types (the one core file a module may import)
│   │   ├── modules-panel.js   #   F1's Modules section
│   │   └── notifications.js   #   The notification system
│   ├── fullscreen.js, zoom.js, tournament.js, tournament-engine.js, ml-training.js
│   ├── feature-cache-store.js, coalescing-saver.js, like-or-skip.js, recent-folders.js
│   ├── similarity-sort.js, media-url.js, perceptual-hash.js, main-thread-hash.js
│   ├── hash-pool.js, hash-parity.js
│   └── face-detector.js       # Classic script
├── Workers
│   ├── sorting-worker.js, ml-worker.js, feature-worker.js   # Classic workers
│   └── hash-worker.js, jxl-decode-worker.js                  # Module workers
├── Shared (worker and page)
│   └── feature-extractor.js, ml-model.js, media-formats.js, feature-cache-transport.js
├── modules/                   # v2: first-party modules (none yet in P1a; P1b adds similarity)
├── vendor/                    # jxl-oxide-wasm, lucide
├── scripts/                   # Maintenance and hook scripts (Node)
├── tests/                     # Vitest units; tests/e2e/ Playwright (fixtures/modules/: the E2E test modules)
├── docs/                      # This documentation (planning/, archive/, superpowers/specs/)
└── .claude/                   # Committed agents, hooks, rules, skills, settings
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

## Modules (v2)

The app is growing into a core plus modules. P1a built the host; P1b moves the first feature (similarity) onto it. Design: [v2 modules spec](superpowers/specs/2026-10-22-v2-modules-design.md).

- **Roots.** Main reads `modules/<id>/module.json` in the app folder as data. An E2E launch adds `tests/e2e/fixtures/modules/` as a second root, only when both `MV_E2E_STATE_DIR` and `MV_E2E_MODULE_ROOT` are set.
- **Registry** (`main/module-registry.js`). Validates each manifest strictly: unknown keys are refused, and keys for later phases must be empty. It resolves `requires`/`optional` in dependency order. A cycle, a duplicate id or a folder file two modules declare makes every module involved invalid. The toggles live in `userData/modules.json` and take effect on restart. The names of today's per-folder files are reserved for core.
- **Host** (`core/module-host.js`). Imports each enabled module and calls `activate(host)`, within 5 s for the import and activation together. A module that throws or hangs fails alone, and its dependents are blocked. Each module gets a frozen host: `module`, `log`, `settings`, `ui`, `folder`, `files`, `store`.
- **Folder files.** `host.store.folderFile(name)` reaches only names the module declared, through `folder-file-*` channels that check the owner and the name in main. A read is `ok`, `absent` or `unreadable`, and a failed read is never `absent`. Each call is checked against its folder visit at the call: a save asked for while the visit is live (including in `onVisitEnd`) reaches that folder, and a later one is refused.
- **Boundaries.**
  - Rule M-1: main never `require`s a module's code. Lint bans a computed `require()`/`import()` in main code, and `tests/module-boundary.test.js` scans the literal ones.
  - Rule M-2: module code reaches the app only through `host`. Lint bans the renderer's globals and document-wide lookups, and `mv/module-imports` keeps a module's imports inside its own folder.
  - The app scheme serves `core/` and a module's `module.json`, `ui/` and `workers/`, never `main/` code.
- **Restart.** F1's Modules section saves a toggle at once. "Restart now" runs the app's close flow (the tournament leave prompt, the saves, the modules' deactivation) and then relaunches.

### Adding a new module

1. Create `modules/<id>/module.json` (the P1a manifest: `id`, `name`, `version`, `apiVersion: 1`, `entry: "ui/index.js"`, `defaultEnabled`, and optionally `description`, `requires`, `optional`, `folderFiles`) and `modules/<id>/ui/index.js` exporting `activate(host)`.
2. Reach the app only through `host` (types: `core/host-api.js`).
3. Add its unit tests under `tests/`, and an E2E case through a fixture module if it needs the real host.

---

*Last Updated: 2026-11-12*
