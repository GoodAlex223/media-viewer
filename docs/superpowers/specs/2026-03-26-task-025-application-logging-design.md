# TASK-025: Application Logging to File with Auto-Cleanup

**Date**: 2026-03-26
**Status**: Design approved
**Priority**: Normal
**Effort**: Low-Medium
**Origin**: Manual testing 2026-03-19

---

## Problem

The application has no file-based logging. All diagnostic output goes to `console.log/warn/error`, which is only visible when running from a terminal or with DevTools open. When the app crashes or misbehaves, there is no persistent record to debug from.

## Decisions

1. **Cleanup strategy**: Delete log on clean exit only. If the app crashes, `will-quit` never fires, so the log survives naturally for post-crash inspection. On next launch, the fresh log overwrites the previous one.
2. **Logging scope**: Main process console output + renderer-side errors forwarded via IPC. Worker thread output and routine renderer `console.log` calls are excluded (noisy, low debugging value).
3. **Log format**: Simple text lines, human-readable. Not JSON/structured.
4. **Architecture**: Separate `logger.js` module (Approach B). No third-party dependencies.

## Design

### 1. New File: `logger.js`

CommonJS module in the project root (same level as `main.js`).

**Exports:**

| Function | Purpose |
|----------|---------|
| `init(logDir)` | Creates/opens log file, starts write stream |
| `log(source, msg)` | Writes `[INFO]` level entry |
| `warn(source, msg)` | Writes `[WARN]` level entry |
| `error(source, msg)` | Writes `[ERROR]` level entry |
| `cleanup()` | Closes write stream, deletes log file |
| `getLogPath()` | Returns current log file path |

**Log file location:** `app.getPath('logs')` directory, filename `media-viewer.log`.

- Windows: `%APPDATA%/media-viewer/logs/media-viewer.log`
- macOS: `~/Library/Logs/media-viewer/media-viewer.log`
- Linux: `~/.config/media-viewer/logs/media-viewer.log`

**Line format:**

```
[2026-03-26 14:30:05.123] [WARN] [main] Could not process file: error.txt
[2026-03-26 14:30:06.456] [ERROR] [renderer] Uncaught TypeError: Cannot read property 'path' of undefined
```

**Implementation details:**

- Uses `fs.createWriteStream(path, { flags: 'w' })` — `'w'` mode overwrites any previous log file on startup (handles crash log cleanup implicitly).
- Each write call formats a timestamp + level + source + message line.
- No manual buffering — Node.js writable streams handle buffering internally.
- `cleanup()` calls `stream.end()` with a callback that runs `fs.unlinkSync(logPath)` after the stream finishes flushing — ensures all buffered data is written before deletion.
- `init()` creates the log directory if it doesn't exist (`fs.mkdirSync(dir, { recursive: true })`).

### 2. Main Process Integration (`main.js`)

**Startup** (inside `app.whenReady()`, before `createWindow()`):

```javascript
const logger = require('./logger');
logger.init(app.getPath('logs'));
```

**Console interception:** After `logger.init()`, override `console.log`, `console.warn`, `console.error`:

```javascript
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => { originalLog(...args); logger.log('main', args.join(' ')); };
console.warn = (...args) => { originalWarn(...args); logger.warn('main', args.join(' ')); };
console.error = (...args) => { originalError(...args); logger.error('main', args.join(' ')); };
```

This captures all 12 existing console calls in main.js without modifying them.

**New IPC handler** (fire-and-forget, uses `ipcMain.on` not `ipcMain.handle`):

```javascript
ipcMain.on('log-renderer-error', (_event, { level, message, source }) => {
    const fn = level === 'warn' ? logger.warn : logger.error;
    fn(source || 'renderer', message);
});
```

**Cleanup** (in existing `will-quit` handler):

```javascript
app.on('will-quit', () => {
    globalShortcut.unregisterAll();  // existing
    logger.cleanup();                // new
});
```

### 3. Renderer Integration (`media-viewer.js`)

**In `showError()` method** (~line 887): After the existing `console.error()` call, forward to main process:

```javascript
if (window.electronAPI && window.electronAPI.logError) {
    window.electronAPI.logError({ level: 'error', message, source: 'renderer' });
}
```

**Global error handlers** (added once, in constructor or early initialization):

```javascript
window.onerror = (msg, url, line, col, _err) => {
    const message = `${msg} at ${url}:${line}:${col}`;
    if (window.electronAPI && window.electronAPI.logError) {
        window.electronAPI.logError({ level: 'error', message, source: 'renderer' });
    }
};

window.addEventListener('unhandledrejection', (event) => {
    const message = `Unhandled promise rejection: ${event.reason}`;
    if (window.electronAPI && window.electronAPI.logError) {
        window.electronAPI.logError({ level: 'error', message, source: 'renderer' });
    }
});
```

### 4. Preload Bridge (`preload.js`)

Add one new channel to the `contextBridge.exposeInMainWorld('electronAPI', ...)` object:

```javascript
logError: (data) => ipcRenderer.send('log-renderer-error', data)
```

Uses `send` (fire-and-forget), not `invoke`. Logging must never block the renderer.

### 5. ESLint Configuration (`eslint.config.mjs`)

Add `logger.js` to ESLint block 1 (Node/main process files). Same environment as `main.js` — Node globals, CommonJS `require()`.

Update header comment from "Ten file-group blocks" to reflect logger.js inclusion (it joins block 1, no new block needed).

### 6. Testing

**Unit test** (`tests/logger.test.js`):
- `init()` creates log directory and file
- `log/warn/error()` write correctly formatted lines
- `cleanup()` closes stream and deletes file
- `getLogPath()` returns correct path
- Multiple calls append (not overwrite) within a session
- Graceful behavior when `cleanup()` called before `init()`

**Manual verification:**
- Start app, perform actions, check log file exists at expected path
- Close app normally, verify log file is deleted
- Force-kill app (Task Manager), verify log file survives
- Restart after force-kill, verify fresh log overwrites crash log

### 7. Out of Scope

- Worker thread logging (sorting-worker, ml-worker, feature-worker)
- Log rotation or size limits (single session file, deleted on exit)
- User-facing log viewer UI
- Configurable log levels or verbosity settings
- Renderer `console.log/warn` interception (only `showError()` + uncaught exceptions)
- Log file compression or archival

## File Changes Summary

| File | Change |
|------|--------|
| `logger.js` | **New** — Logger module (~80-100 lines) |
| `main.js` | Add logger init, console interception, IPC handler, cleanup |
| `media-viewer.js` | Add `logError` call in `showError()`, global error handlers |
| `preload.js` | Add `logError` IPC channel |
| `eslint.config.mjs` | Add `logger.js` to block 1 file list |
| `tests/logger.test.js` | **New** — Unit tests for logger module |

## Acceptance Criteria

- [x] Application logs written to file during runtime
- [x] Log file deleted on normal application exit
- [x] Log location uses platform-appropriate directory (`app.getPath('logs')`)
- [x] No performance impact on normal operation (fire-and-forget IPC, stream buffering)
- [x] Crash logs survive for post-crash debugging
- [x] Renderer errors forwarded to log file via IPC
