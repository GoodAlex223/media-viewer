// storage-migration.js
// One-time move of the renderer's localStorage from the old file:// origin to the app scheme's
// origin (G1 I1, spec § 6). A new origin starts with an empty store, so without this every setting
// (folders, shortcuts, recent folders) would seem to vanish. main.js drives it in the main window
// before the app page loads: a static page under the old origin is read, the same page under the
// new origin is written (only keys still absent, so it never overwrites a newer value and a re-run
// adds nothing), then a marker records completion. Any failure is logged and retried next launch;
// it never blocks startup. The old store is left as it is. Pure CommonJS, no Electron import.

const path = require('path');

const MIGRATION_VERSION = 1;
const MAX_KEYS = 200;
const MAX_TOTAL_CHARS = 5 * 1024 * 1024; // UTF-16 code units, Chromium's per-origin quota scale

// Enumerates through the Storage interface itself (length and key(i)), not the object's own keys.
const READ_SCRIPT =
    'JSON.stringify(Array.from({ length: localStorage.length }, (_v, i) => localStorage.key(i))' +
    '.map((k) => [k, localStorage.getItem(k)]))';

// The old store's dump, validated: an array of [string, string] pairs within the caps, else null.
// Everything in that store is renderer-written and untrusted; G1's kinds still check every path in it.
function parseStoreDump(text) {
    if (typeof text !== 'string') {
        return null;
    }
    let pairs;
    try {
        pairs = JSON.parse(text);
    } catch (_err) {
        return null;
    }
    if (!Array.isArray(pairs) || pairs.length > MAX_KEYS) {
        return null;
    }
    let total = 0;
    for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') {
            return null;
        }
        total += pair[0].length + pair[1].length;
        if (total > MAX_TOTAL_CHARS) {
            return null;
        }
    }
    return pairs;
}

// A script that writes each pair whose key is absent and returns how many it wrote. The pairs go
// in as a JSON literal (valid JavaScript); U+2028/U+2029 are escaped for any older parser.
function buildWriteScript(pairs) {
    const literal = JSON.stringify(pairs)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    return (
        `(() => { let n = 0; for (const [k, v] of ${literal}) {` +
        ' if (localStorage.getItem(k) === null) { localStorage.setItem(k, v); n += 1; } } return n; })()'
    );
}

async function migrateStorage({
    markerPath,
    fs,
    loadOldOrigin,
    loadNewOrigin,
    executeJavaScript,
    logger,
    now = Date.now,
}) {
    try {
        await fs.access(markerPath);
        return { ran: false, reason: 'marker present' };
    } catch (_err) {
        // no marker yet: migrate
    }
    try {
        await loadOldOrigin();
        const pairs = parseStoreDump(await executeJavaScript(READ_SCRIPT));
        if (pairs === null) {
            throw new Error('the old store did not validate');
        }
        await loadNewOrigin();
        const written = pairs.length > 0 ? await executeJavaScript(buildWriteScript(pairs)) : 0;
        await fs.mkdir(path.dirname(markerPath), { recursive: true });
        const marker = {
            version: MIGRATION_VERSION,
            migratedAt: new Date(now()).toISOString(),
            keys: pairs.length,
            written,
        };
        await fs.writeFile(markerPath, JSON.stringify(marker), 'utf-8');
        return { ran: true, keys: pairs.length, written };
    } catch (err) {
        logger.warn('storage-migration', `localStorage migration failed (will retry next launch): ${err.message}`);
        return { ran: false, reason: err.message };
    }
}

module.exports = {
    parseStoreDump,
    buildWriteScript,
    migrateStorage,
    READ_SCRIPT,
    MAX_KEYS,
    MAX_TOTAL_CHARS,
    MIGRATION_VERSION,
};
