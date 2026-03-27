# TASK-025: Application Logging to File — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file-based logging that captures main process console output and renderer errors, with automatic cleanup on normal exit.

**Architecture:** New `logger.js` CommonJS module provides `init/log/warn/error/cleanup/getLogPath`. Main process intercepts `console.*` and adds an IPC listener for renderer errors. Renderer forwards `showError()` calls and uncaught exceptions via fire-and-forget IPC. Log file is deleted on clean exit; crash logs survive.

**Tech Stack:** Node.js `fs` (createWriteStream), Electron IPC (`ipcMain.on` / `ipcRenderer.send`), Vitest for unit tests.

**Spec:** [2026-03-26-task-025-application-logging-design.md](../specs/2026-03-26-task-025-application-logging-design.md)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `logger.js` | **Create** | Logger module — write stream, formatting, cleanup |
| `tests/logger.test.js` | **Create** | Unit tests for logger module |
| `main.js` | **Modify** | Init logger, intercept console, add IPC handler, cleanup on quit |
| `preload.js` | **Modify** | Expose `logError` IPC channel |
| `media-viewer.js` | **Modify** | Forward errors via IPC, add global error handlers |
| `eslint.config.mjs` | **Modify** | Add `logger.js` to block 1 file list |

---

## Task 1: Create `logger.js` with TDD

**Files:**
- Create: `logger.js`
- Create: `tests/logger.test.js`

### Step 1.1: Write failing tests for `init()` and `getLogPath()`

- [ ] Create `tests/logger.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);

describe('logger', () => {
    let logger;
    let testLogDir;

    beforeEach(() => {
        testLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
        // Fresh require for each test to reset module state
        delete require.cache[require.resolve('../logger')];
        logger = require('../logger');
    });

    afterEach(() => {
        try {
            logger.cleanup();
        } catch (_e) {
            // ignore if already cleaned up
        }
        // Clean up temp directory
        fs.rmSync(testLogDir, { recursive: true, force: true });
    });

    describe('init()', () => {
        it('creates log file in the specified directory', () => {
            logger.init(testLogDir);
            const logPath = logger.getLogPath();
            expect(logPath).toBe(path.join(testLogDir, 'media-viewer.log'));
            expect(fs.existsSync(logPath)).toBe(true);
        });

        it('creates directory if it does not exist', () => {
            const nestedDir = path.join(testLogDir, 'nested', 'logs');
            logger.init(nestedDir);
            expect(fs.existsSync(nestedDir)).toBe(true);
            expect(fs.existsSync(path.join(nestedDir, 'media-viewer.log'))).toBe(true);
        });
    });

    describe('getLogPath()', () => {
        it('returns null before init', () => {
            expect(logger.getLogPath()).toBeNull();
        });

        it('returns log file path after init', () => {
            logger.init(testLogDir);
            expect(logger.getLogPath()).toBe(path.join(testLogDir, 'media-viewer.log'));
        });
    });
});
```

### Step 1.2: Run tests to verify they fail

- [ ] Run: `npx vitest run tests/logger.test.js`
- [ ] Expected: FAIL — `Cannot find module '../logger'`

### Step 1.3: Implement `init()` and `getLogPath()`

- [ ] Create `logger.js`:

```javascript
const fs = require('fs');
const path = require('path');

let logStream = null;
let logPath = null;

function init(logDir) {
    fs.mkdirSync(logDir, { recursive: true });
    logPath = path.join(logDir, 'media-viewer.log');
    logStream = fs.createWriteStream(logPath, { flags: 'w' });
}

function getLogPath() {
    return logPath;
}

module.exports = { init, getLogPath };
```

### Step 1.4: Run tests to verify they pass

- [ ] Run: `npx vitest run tests/logger.test.js`
- [ ] Expected: 3 tests PASS

### Step 1.5: Write failing tests for `log()`, `warn()`, `error()`

- [ ] Add to `tests/logger.test.js` inside the outer `describe('logger')` block, after the `getLogPath()` describe:

```javascript
    describe('log/warn/error()', () => {
        it('writes INFO line with correct format', () => {
            logger.init(testLogDir);
            logger.log('main', 'Application started');
            // Force flush by ending stream
            logger.cleanup();
            const content = fs.readFileSync(path.join(testLogDir, 'media-viewer.log'), 'utf8');
            // cleanup deletes the file, so we need a different approach — read before cleanup
        });
    });
```

Actually, since `cleanup()` deletes the file, we need to read the log content before cleanup. Let's write the tests properly:

- [ ] Replace the placeholder above. Add these tests inside the outer `describe('logger')` block, after the `getLogPath()` describe:

```javascript
    describe('log/warn/error()', () => {
        function readLog() {
            // Flush by closing the stream, read content, then remove file manually
            const logFile = logger.getLogPath();
            // Use fs.readFileSync on the path — stream writes are flushed synchronously for small writes
            return fs.readFileSync(logFile, 'utf8');
        }

        it('writes INFO line with timestamp, level, source, and message', () => {
            logger.init(testLogDir);
            logger.log('main', 'Application started');
            const content = readLog();
            expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] \[main\] Application started\n$/);
        });

        it('writes WARN line', () => {
            logger.init(testLogDir);
            logger.warn('main', 'Something unusual');
            const content = readLog();
            expect(content).toMatch(/\[WARN\] \[main\] Something unusual/);
        });

        it('writes ERROR line', () => {
            logger.init(testLogDir);
            logger.error('renderer', 'Uncaught TypeError');
            const content = readLog();
            expect(content).toMatch(/\[ERROR\] \[renderer\] Uncaught TypeError/);
        });

        it('appends multiple lines within a session', () => {
            logger.init(testLogDir);
            logger.log('main', 'First');
            logger.warn('main', 'Second');
            logger.error('renderer', 'Third');
            const content = readLog();
            const lines = content.trim().split('\n');
            expect(lines).toHaveLength(3);
            expect(lines[0]).toContain('[INFO]');
            expect(lines[1]).toContain('[WARN]');
            expect(lines[2]).toContain('[ERROR]');
        });
    });
```

### Step 1.6: Run tests to verify they fail

- [ ] Run: `npx vitest run tests/logger.test.js`
- [ ] Expected: FAIL — `logger.log is not a function`

### Step 1.7: Implement `log()`, `warn()`, `error()`

- [ ] Update `logger.js` — add the `writeEntry` helper and the three exported functions before `module.exports`:

```javascript
function formatTimestamp() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8);
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${date} ${time}.${ms}`;
}

function writeEntry(level, source, message) {
    if (!logStream) {
        return;
    }
    logStream.write(`[${formatTimestamp()}] [${level}] [${source}] ${message}\n`);
}

function log(source, message) {
    writeEntry('INFO', source, message);
}

function warn(source, message) {
    writeEntry('WARN', source, message);
}

function error(source, message) {
    writeEntry('ERROR', source, message);
}
```

- [ ] Update the `module.exports` line:

```javascript
module.exports = { init, log, warn, error, getLogPath };
```

### Step 1.8: Run tests to verify they pass

- [ ] Run: `npx vitest run tests/logger.test.js`
- [ ] Expected: 7 tests PASS

### Step 1.9: Write failing tests for `cleanup()`

- [ ] Add to `tests/logger.test.js` inside the outer `describe('logger')` block:

```javascript
    describe('cleanup()', () => {
        it('deletes the log file', (done) => {
            logger.init(testLogDir);
            const logFile = logger.getLogPath();
            expect(fs.existsSync(logFile)).toBe(true);
            logger.cleanup();
            // cleanup uses stream.end callback, so give it a tick
            setTimeout(() => {
                expect(fs.existsSync(logFile)).toBe(false);
                done();
            }, 50);
        });

        it('resets logPath to null', (done) => {
            logger.init(testLogDir);
            logger.cleanup();
            setTimeout(() => {
                expect(logger.getLogPath()).toBeNull();
                done();
            }, 50);
        });

        it('is safe to call before init', () => {
            expect(() => logger.cleanup()).not.toThrow();
        });

        it('is safe to call twice', (done) => {
            logger.init(testLogDir);
            logger.cleanup();
            setTimeout(() => {
                expect(() => logger.cleanup()).not.toThrow();
                done();
            }, 50);
        });
    });
```

### Step 1.10: Run tests to verify they fail

- [ ] Run: `npx vitest run tests/logger.test.js`
- [ ] Expected: FAIL — `logger.cleanup is not a function`

### Step 1.11: Implement `cleanup()`

- [ ] Add to `logger.js` before `module.exports`:

```javascript
function cleanup() {
    if (!logStream) {
        return;
    }
    const pathToDelete = logPath;
    logStream.end(() => {
        try {
            fs.unlinkSync(pathToDelete);
        } catch (_e) {
            // File may already be deleted
        }
    });
    logStream = null;
    logPath = null;
}
```

- [ ] Update `module.exports`:

```javascript
module.exports = { init, log, warn, error, cleanup, getLogPath };
```

### Step 1.12: Run tests to verify they pass

- [ ] Run: `npx vitest run tests/logger.test.js`
- [ ] Expected: 11 tests PASS

### Step 1.13: Run full test suite

- [ ] Run: `npx vitest run`
- [ ] Expected: All tests pass (110 existing + 11 new = 121)

### Step 1.14: Commit

- [ ] Run:
```bash
git add logger.js tests/logger.test.js
git commit -m "feat(TASK-025): add logger module with unit tests

File-based logger with init/log/warn/error/cleanup/getLogPath.
Writes timestamped lines to media-viewer.log in app logs directory.
Deletes log on clean exit; crash logs survive.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Integrate logger into main process (`main.js`)

**Files:**
- Modify: `main.js:1-2` (add require)
- Modify: `main.js:67-68` (init + console interception inside `whenReady`)
- Modify: `main.js:262-264` (cleanup in `will-quit`)
- Modify: `main.js` (add IPC handler)

### Step 2.1: Add logger require and init

- [ ] In `main.js`, add the require after the existing requires (after line 5):

```javascript
const logger = require('./logger');
```

- [ ] In `main.js`, inside `app.whenReady().then(() => {`, add logger init and console interception BEFORE `createWindow()` (after line 67, before `createWindow()`):

```javascript
    // Initialize file logger
    logger.init(app.getPath('logs'));

    // Intercept console methods to also write to log file
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = (...args) => {
        originalLog(...args);
        logger.log('main', args.join(' '));
    };
    console.warn = (...args) => {
        originalWarn(...args);
        logger.warn('main', args.join(' '));
    };
    console.error = (...args) => {
        originalError(...args);
        logger.error('main', args.join(' '));
    };

```

### Step 2.2: Add IPC handler for renderer errors

- [ ] In `main.js`, inside `app.whenReady().then(() => {`, add the IPC listener after the last `ipcMain.handle(...)` block (after the `probe-video` handler, before `app.on('activate', ...)`):

```javascript
    // Receive renderer errors for file logging (fire-and-forget)
    ipcMain.on('log-renderer-error', (_event, { level, message, source }) => {
        const fn = level === 'warn' ? logger.warn : logger.error;
        fn(source || 'renderer', message);
    });
```

### Step 2.3: Add cleanup to `will-quit` handler

- [ ] In `main.js`, modify the existing `will-quit` handler (lines 262-264) to add logger cleanup:

Replace:
```javascript
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
```

With:
```javascript
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    logger.cleanup();
});
```

### Step 2.4: Run full test suite

- [ ] Run: `npx vitest run`
- [ ] Expected: All 121 tests pass (main.js changes don't affect unit tests)

### Step 2.5: Commit

- [ ] Run:
```bash
git add main.js
git commit -m "feat(TASK-025): integrate logger into main process

Intercept console.log/warn/error to write to log file.
Add IPC handler for renderer error forwarding.
Clean up log on will-quit.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add preload bridge (`preload.js`)

**Files:**
- Modify: `preload.js:6-32` (add logError to electronAPI)

### Step 3.1: Add `logError` to the electronAPI object

- [ ] In `preload.js`, add `logError` inside the `contextBridge.exposeInMainWorld('electronAPI', { ... })` object, after the `probeVideo` line (line 20) and before the `invoke` line (line 23):

```javascript
    // Logging (fire-and-forget)
    logError: (data) => ipcRenderer.send('log-renderer-error', data),
```

### Step 3.2: Run full test suite

- [ ] Run: `npx vitest run`
- [ ] Expected: All 121 tests pass

### Step 3.3: Commit

- [ ] Run:
```bash
git add preload.js
git commit -m "feat(TASK-025): add logError IPC channel to preload bridge

Fire-and-forget channel for renderer error forwarding.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add renderer error forwarding (`media-viewer.js`)

**Files:**
- Modify: `media-viewer.js:887-890` (showError method)
- Modify: `media-viewer.js:423-426` (constructor, add global error handlers)

### Step 4.1: Add logError call to `showError()`

- [ ] In `media-viewer.js`, modify the `showError()` method (line 887-890).

Replace:
```javascript
    showError(message, options = {}) {
        console.error('Error:', message);
        this.showNotification(`❌ ${message}`, 'error', options);
    }
```

With:
```javascript
    showError(message, options = {}) {
        console.error('Error:', message);
        if (window.electronAPI && window.electronAPI.logError) {
            window.electronAPI.logError({ level: 'error', message, source: 'renderer' });
        }
        this.showNotification(`❌ ${message}`, 'error', options);
    }
```

### Step 4.2: Add global error handlers in constructor

- [ ] In `media-viewer.js`, add global error handlers at the end of the constructor, just before the closing `}` of `constructor()` (after the electronAPI availability check at lines 423-426):

```javascript
        // Global error handlers — forward uncaught errors to main process log
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

### Step 4.3: Run full test suite

- [ ] Run: `npx vitest run`
- [ ] Expected: All 121 tests pass

### Step 4.4: Commit

- [ ] Run:
```bash
git add media-viewer.js
git commit -m "feat(TASK-025): forward renderer errors to file logger

showError() sends errors via IPC logError channel.
Global handlers catch window.onerror and unhandledrejection.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Update ESLint config (`eslint.config.mjs`)

**Files:**
- Modify: `eslint.config.mjs:1-15` (header comment)
- Modify: `eslint.config.mjs:39` (block 1 files array)

### Step 5.1: Update block 1 to include `logger.js`

- [ ] In `eslint.config.mjs`, update block 1's `files` array (line 39).

Replace:
```javascript
        files: ['main.js'],
```

With:
```javascript
        files: ['main.js', 'logger.js'],
```

### Step 5.2: Run lint to verify

- [ ] Run: `npx eslint logger.js main.js`
- [ ] Expected: No errors

### Step 5.3: Run full test suite

- [ ] Run: `npx vitest run`
- [ ] Expected: All 121 tests pass

### Step 5.4: Commit

- [ ] Run:
```bash
git add eslint.config.mjs
git commit -m "chore(TASK-025): add logger.js to ESLint block 1

Same Node/CommonJS environment as main.js.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Final verification and E2E smoke test

### Step 6.1: Run full unit test suite

- [ ] Run: `npx vitest run`
- [ ] Expected: All 121 tests pass

### Step 6.2: Run full E2E test suite

- [ ] Run: `npm run test:e2e`
- [ ] Expected: All 29 E2E tests pass

### Step 6.3: Run lint on all changed files

- [ ] Run: `npx eslint logger.js main.js preload.js media-viewer.js eslint.config.mjs`
- [ ] Expected: No errors

### Step 6.4: Run prettier check

- [ ] Run: `npx prettier --check logger.js main.js preload.js media-viewer.js eslint.config.mjs`
- [ ] Expected: All files formatted correctly

### Step 6.5: Manual smoke test

- [ ] Start the app: `npm start`
- [ ] Open a folder, browse files, rate a file
- [ ] Check that log file exists at `app.getPath('logs')/media-viewer.log` (check console for path or use `logger.getLogPath()`)
- [ ] Close the app normally
- [ ] Verify the log file was deleted
