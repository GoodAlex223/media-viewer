// feature-cache-ledger.js
// Main's second line of defence for .feature_cache.json (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md
// § 7). The renderer's own guard runs first; this refuses a write main cannot account for: one that would replace a
// file main never read with a copy that does not cover the folder, or shrink a file it read past the renderer's own
// rule. It also tells read failures apart, retries brief lock errors, and parses with stream.pipeline so an error in
// any stage settles the read. Pure CommonJS with no Electron import, so Vitest can load it; main.js's four
// feature-cache handlers call it.

const fs = require('fs').promises;
const path = require('path');
const { pipeline } = require('stream');

/**
 * What main last saw of each cache file this session, keyed by the file's path. A record is `{ seen: 'read', count,
 * version }`, `{ seen: 'absent' }`, `{ seen: 'corrupt' }` or `{ seen: 'unreadable' }`.
 */
function createFeatureCacheLedger() {
    const records = new Map();
    return {
        recordOpen(key, record) {
            records.set(key, record);
        },
        recordWrite(key, { count, version }) {
            records.set(key, { seen: 'read', count, version });
        },
        get(key) {
            return records.get(key) || null;
        },
    };
}

/** The write-open header, checked: `fileCount` is required, so a caller cannot skip the guard's third conjunct. */
function validateWriteHeader(header) {
    if (!header || typeof header !== 'object') {
        return { ok: false, error: 'feature-cache write refused: no header' };
    }
    const { version, fileCount, clipRequired } = header;
    if (!Number.isInteger(fileCount) || fileCount < 0) {
        return { ok: false, error: 'feature-cache write refused: fileCount must be a non-negative integer' };
    }
    if (typeof clipRequired !== 'boolean') {
        return { ok: false, error: 'feature-cache write refused: clipRequired must be a boolean' };
    }
    return { ok: true, version: version ?? null, fileCount, clipRequired };
}

/**
 * A failed read, by kind: no file (`absent`), a brief lock that may clear (`retry`: Windows antivirus, the
 * thumbnailer, a lingering handle), a parse failure (`corrupt`, the parser's errors carry no code), or any other I/O
 * error (`unreadable`). Only `absent` and `corrupt` let the renderer write a fresh file (spec my call 2).
 */
function classifyReadError(err) {
    const code = err && err.code;
    if (code === 'ENOENT') {
        return 'absent';
    }
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        return 'retry';
    }
    if (!code) {
        return 'corrupt';
    }
    return 'unreadable';
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `fn`, retrying while it fails with a lock error, as write-close's rename does; rethrows the last error. */
async function withReadRetries(fn, { attempts = 5, delayMs = 150, sleep = defaultSleep } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (classifyReadError(err) !== 'retry' || attempt === attempts - 1) {
                throw err;
            }
            await sleep(delayMs);
        }
    }
    throw lastErr;
}

/**
 * Parses a cache file's `features` object into `[name, entry]` pairs. stream.pipeline, not .pipe(): an error in any
 * stage, the source read included, rejects. The old chain heard only its last stage, so a read-stream error was
 * unhandled and the open never answered (the 2026-10-21 probe).
 * @param {import('stream').Readable} readable
 * @param {{parser: Function, pick: Function, streamObject: Function}} json stream-json's three factories
 */
function parseFeatureCacheStream(readable, { parser, pick, streamObject }) {
    return new Promise((resolve, reject) => {
        const entries = [];
        const objects = streamObject();
        objects.on('data', ({ key, value }) => {
            entries.push([key, value]);
        });
        pipeline(readable, parser(), pick({ filter: 'features' }), objects, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(entries);
            }
        });
    });
}

/**
 * The folder's media files, by name, the way load-folder lists them: a file (or a link to one) with a media
 * extension. A stat that fails leaves the entry out, as there.
 */
async function listMediaFiles(folderPath, isMediaFile) {
    const names = [];
    for (const entry of await fs.readdir(folderPath, { withFileTypes: true })) {
        if (!isMediaFile(path.extname(entry.name).toLowerCase())) {
            continue;
        }
        if (entry.isFile()) {
            names.push(entry.name);
        } else if (entry.isSymbolicLink()) {
            try {
                if ((await fs.stat(path.join(folderPath, entry.name))).isFile()) {
                    names.push(entry.name);
                }
            } catch (_err) {
                // a broken link is no media file
            }
        }
    }
    return names;
}

/**
 * Whether write-close may rename the temp file over the cache (spec § 7.2). With no file at the destination,
 * anything goes. Otherwise:
 * - `unseen`: main has no record for the file, or only `unreadable`, or `absent` from before the file appeared; the
 *   write must then cover every media file now in the folder, with a CLIP vector each when `clipRequired`. Only this
 *   case lists the folder.
 * - `shrink`: main read N entries with the header's version, and the write is under N × 0.5 while the folder holds
 *   over twice what is written: the renderer's own rule, so a real shrink still saves. A version change skips it.
 * A `corrupt` record allows the write: the file is being replaced on purpose.
 */
async function checkClose({ record, destinationExists, header, written, writtenNames, clipNames, listFolderMedia }) {
    if (!destinationExists) {
        return { ok: true };
    }
    if (!record || record.seen === 'unreadable' || record.seen === 'absent') {
        const media = await listFolderMedia();
        const covered =
            media.length > 0 &&
            media.every((name) => writtenNames.has(name) && (!header.clipRequired || clipNames.has(name)));
        return covered ? { ok: true } : { ok: false, refused: 'unseen', seen: null, written };
    }
    if (
        record.seen === 'read' &&
        record.version === header.version &&
        record.count > 0 &&
        written < record.count * 0.5 &&
        header.fileCount > written * 2
    ) {
        return { ok: false, refused: 'shrink', seen: record.count, written };
    }
    return { ok: true };
}

module.exports = {
    createFeatureCacheLedger,
    validateWriteHeader,
    classifyReadError,
    withReadRetries,
    parseFeatureCacheStream,
    listMediaFiles,
    checkClose,
};
