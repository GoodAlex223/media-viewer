const fs = require('fs');
const path = require('path');

// Session log: one file per app launch, named by its local start time
// (media-viewer-YYYY-MM-DD_HH-MM-SS.log). init() keeps the newest SESSION_LOGS_KEPT; cleanup()
// writes a clean-quit footer and closes the file WITHOUT deleting it, so a kept log with no
// footer is a crash or a kill. Until G2 (2026-10-05) the log was truncated on launch and deleted
// on quit, on the TASK-025 assumption that errors mean crashes — a session that broke the app
// without crashing it lost its evidence that way.
const SESSION_LOGS_KEPT = 10;
const SESSION_LOG_PATTERN = /^media-viewer-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-(\d+))?\.log$/;
const MAX_SAME_SECOND_SESSIONS = 100;

let logPath = null;
let logFd = null;
// Persistent perf/diagnostics log. Unlike the session logs (one per launch, pruned to the newest
// SESSION_LOGS_KEPT), this is append-mode, never pruned, and accumulates across sessions so
// real-run timings can be reviewed after the app closes. Opened lazily on first logPerf() call.
let perfFd = null;
let perfLogDir = null;

function pad(value, width = 2) {
    return String(value).padStart(width, '0');
}

// Local calendar date. (toISOString() is UTC: paired with the local time it stamped yesterday's
// date on every line written between local midnight and the UTC offset.)
function formatLocalDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sessionLogName(date, sequence) {
    const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    const suffix = sequence > 1 ? `-${sequence}` : '';
    return `media-viewer-${formatLocalDate(date)}_${time}${suffix}.log`;
}

// 'wx' never reuses a file: a second session started in the same second gets -2, -3, …
function openSessionLog(logDir, date) {
    for (let sequence = 1; sequence <= MAX_SAME_SECOND_SESSIONS; sequence++) {
        const candidate = path.join(logDir, sessionLogName(date, sequence));
        try {
            return { fd: fs.openSync(candidate, 'wx'), filePath: candidate };
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    }
    throw new Error(`logger: no free session-log name for ${sessionLogName(date, 1)}`);
}

// Delete all but the newest `keep` session logs, the current one included. Only names matching
// SESSION_LOG_PATTERN are candidates, so media-viewer-perf.log and a legacy media-viewer.log are
// never touched. The current session's file is never a candidate, and the rest are ordered by
// modification time (the name's local-time stamp only breaks ties): a clock set back, a move to a
// zone further west or a DST fall-back leaves names stamped "after now", and ordering by name let
// those evict the previous session — or, before the exemption, the new log itself (PR #73 review).
// Best effort and never throws: a file held open elsewhere stays and is retried on the next launch.
function pruneSessionLogs(logDir, keep, currentName) {
    let names;
    try {
        names = fs.readdirSync(logDir);
    } catch (_e) {
        return;
    }
    const sessions = names
        .filter((name) => name !== currentName)
        .map((name) => {
            const match = SESSION_LOG_PATTERN.exec(name);
            if (!match) {
                return null;
            }
            let mtimeMs = 0;
            try {
                mtimeMs = fs.statSync(path.join(logDir, name)).mtimeMs;
            } catch (_e) {
                // Vanished since readdir — sorts oldest; its unlink below is a no-op.
            }
            return { name, mtimeMs, stamp: match[1], sequence: match[2] ? Number(match[2]) : 1 };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.mtimeMs !== b.mtimeMs) {
                return b.mtimeMs - a.mtimeMs;
            }
            if (a.stamp !== b.stamp) {
                return a.stamp < b.stamp ? 1 : -1;
            }
            return b.sequence - a.sequence;
        });
    for (const old of sessions.slice(Math.max(keep - 1, 0))) {
        try {
            fs.unlinkSync(path.join(logDir, old.name));
        } catch (_e) {
            // Held open or already gone — retried on the next launch.
        }
    }
}

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
    const session = openSessionLog(logDir, new Date());
    logFd = session.fd;
    logPath = session.filePath;
    writeEntry('INFO', 'logger', `Session started (pid ${process.pid})`);
    pruneSessionLogs(logDir, SESSION_LOGS_KEPT, path.basename(logPath));
}

function formatTimestamp() {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    return `${formatLocalDate(now)} ${time}.${pad(now.getMilliseconds(), 3)}`;
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
// (never unlinked, never pruned) and accumulates across sessions (append-mode) so real-run
// behavior can be reviewed after the fact. No-op before init().
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

// Clean quit: footer, then close. The session log is KEPT (pruned only by a later init()).
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
    try {
        writeEntry('INFO', 'logger', 'Session ended (clean quit)');
    } catch (_e) {
        // A failed footer must not stop the close below.
    }
    try {
        fs.closeSync(logFd);
    } catch (_e) {
        // File descriptor may already be invalid
    }
    logFd = null;
    logPath = null;
}

function getLogPath() {
    return logPath;
}

module.exports = { init, log, warn, error, logPerf, cleanup, getLogPath };
