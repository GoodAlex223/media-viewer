const fs = require('fs');
const path = require('path');

let logPath = null;
let logFd = null;

function init(logDir) {
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

function cleanup() {
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

module.exports = { init, log, warn, error, cleanup, getLogPath };
