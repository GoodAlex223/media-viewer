const fs = require('fs');
const path = require('path');

let logPath = null;
let logFd = null;
// Persistent perf/diagnostics log. Unlike the main log (truncated on init, deleted on quit),
// this is append-mode and survives across sessions so real-run timings can be reviewed after
// the app closes. Opened lazily on first logPerf() call.
let perfFd = null;
let perfLogDir = null;

function init(logDir) {
    if (logFd !== null) {
        try {
            fs.closeSync(logFd);
        } catch (_e) {
            // fd already invalid — proceed with re-init
        }
        logFd = null;
    }
    // Reset the perf fd so it lazily reopens under the (possibly new) logDir; do NOT truncate
    // the perf log (append-mode, persists across sessions).
    if (perfFd !== null) {
        try {
            fs.closeSync(perfFd);
        } catch (_e) {
            // fd already invalid
        }
        perfFd = null;
    }
    perfLogDir = logDir;
    fs.mkdirSync(logDir, { recursive: true });
    logPath = path.join(logDir, 'media-viewer.log');
    logFd = fs.openSync(logPath, 'w');
}

function formatTimestamp() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8);
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${date} ${time}.${ms}`;
}

function writeEntry(level, source, message) {
    if (logFd === null) {
        return;
    }
    const line = `[${formatTimestamp()}] [${level}] [${source}] ${message}\n`;
    fs.writeSync(logFd, line);
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

// Append a diagnostics line to the persistent perf log (media-viewer-perf.log). Survives quit
// (never unlinked) and accumulates across sessions (append-mode) so real-run behavior can be
// reviewed after the fact. No-op before init().
function logPerf(message) {
    if (perfLogDir === null) {
        return;
    }
    try {
        if (perfFd === null) {
            perfFd = fs.openSync(path.join(perfLogDir, 'media-viewer-perf.log'), 'a');
        }
        fs.writeSync(perfFd, `[${formatTimestamp()}] [PERF] ${message}\n`);
    } catch (_e) {
        // Best-effort diagnostics — never let a logging failure surface to the app.
    }
}

function cleanup() {
    // Close (but never delete) the persistent perf log first — it must survive quit.
    if (perfFd !== null) {
        try {
            fs.closeSync(perfFd);
        } catch (_e) {
            // fd already invalid
        }
        perfFd = null;
    }
    if (logFd === null) {
        return;
    }
    const pathToDelete = logPath;
    try {
        fs.closeSync(logFd);
    } catch (_e) {
        // File descriptor may already be invalid
    }
    logFd = null;
    logPath = null;
    try {
        fs.unlinkSync(pathToDelete);
    } catch (_e) {
        // File may already be deleted
    }
}

function getLogPath() {
    return logPath;
}

module.exports = { init, log, warn, error, logPerf, cleanup, getLogPath };
