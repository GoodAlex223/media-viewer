// feature-cache-ledger.js
// Main's second line of defence for .feature_cache.json (spec docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md
// § 7). The renderer's own guard runs first; this refuses a write main cannot account for: one that would replace a
// file main never read with a copy that does not cover the folder, or shrink a file it read past the renderer's own
// rule. It also tells read failures apart, retries brief lock errors, and parses with stream.pipeline so an error in
// any stage settles the read. Pure CommonJS with no Electron import, so Vitest can load it; main.js's four
// feature-cache handlers call it.

const fs = require('fs').promises;
const path = require('path');
const { pipeline, finished } = require('stream');

/**
 * What main last saw of each cache file this session, keyed by the file's path. A record is `{ seen: 'read', count,
 * version }`, `{ seen: 'absent' }`, `{ seen: 'corrupt' }` or `{ seen: 'unreadable' }`. Each file also has a
 * generation, the number of writes main made to it this session (review #5): the renderer's visit sends the one it
 * last read or wrote, and a write since then from anyone else (the training step, when the source folder is also a
 * like folder) makes its copy stale.
 */
function createFeatureCacheLedger() {
    const records = new Map();
    const generations = new Map();
    return {
        recordOpen(key, record) {
            // An unreadable open says nothing new about a file main read (review #8): the source folder is also a
            // like folder, and training's open fails after Phase 1's succeeded. Keeping the read record keeps the
            // visit's next save from a false `unseen` refusal.
            if (record.seen === 'unreadable' && records.get(key)?.seen === 'read') {
                return;
            }
            records.set(key, record);
        },
        /** Returns the file's new generation. */
        recordWrite(key, { count, version }) {
            records.set(key, { seen: 'read', count, version });
            const gen = (generations.get(key) || 0) + 1;
            generations.set(key, gen);
            return gen;
        },
        get(key) {
            return records.get(key) || null;
        },
        generation(key) {
            return generations.get(key) || 0;
        },
    };
}

/**
 * The write-open header, checked: `fileCount` is required, so a caller cannot skip the guard's third conjunct.
 * `basisGen` is optional: the generation the writer's copy is based on, or null for a writer that does not track it
 * (the training path, which reads and writes in one call).
 */
function validateWriteHeader(header) {
    if (!header || typeof header !== 'object') {
        return { ok: false, error: 'feature-cache write refused: no header' };
    }
    const { version, fileCount, basisGen = null } = header;
    if (!Number.isInteger(fileCount) || fileCount < 0) {
        return { ok: false, error: 'feature-cache write refused: fileCount must be a non-negative integer' };
    }
    if (basisGen !== null && (!Number.isInteger(basisGen) || basisGen < 0)) {
        return { ok: false, error: 'feature-cache write refused: basisGen must be a non-negative integer' };
    }
    return { ok: true, version: version ?? null, fileCount, basisGen };
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

// The top-level "version" from the file head: our writer always emits it first, in the first few dozen bytes. An I/O
// error rejects, so withReadRetries sees it (review #1): resolving null made a lock caught here, and gone by the
// parse's own open, read as "no version", which turned off both shrink guards.
function readCacheVersion(filePath, createReadStream) {
    return new Promise((resolve, reject) => {
        const s = createReadStream(filePath, { encoding: 'utf8', start: 0, end: 255 });
        let buf = '';
        s.on('data', (c) => {
            buf += c;
        });
        s.on('end', () => {
            const m = buf.match(/"version"\s*:\s*(\d+)/);
            resolve(m ? parseInt(m[1], 10) : null);
        });
        s.on('error', reject);
    });
}

/**
 * Reads a cache file for feature-cache-open: its version and its `[name, entry]` pairs. A brief lock is retried, as
 * write-close's rename is; any other failure rejects, for classifyReadError. A file whose head names no version is
 * unreadable, not a version change: every writer of this file puts the version first, so main cannot vouch for it.
 * @param {{access: Function, createReadStream: Function, json: object, sleep?: Function}} deps
 */
function readFeatureCacheFile(filePath, { access, createReadStream, json, sleep }) {
    return withReadRetries(
        async () => {
            await access(filePath);
            const version = await readCacheVersion(filePath, createReadStream);
            const entries = await parseFeatureCacheStream(createReadStream(filePath), json);
            if (version === null) {
                throw Object.assign(new Error('the cache file names no version'), { code: 'ENOVERSION' });
            }
            return { version, entries };
        },
        sleep ? { sleep } : {}
    );
}

// The write stream (review #3): every step settles when the stream fails. A temp file main cannot create (a read-only
// share, a full disk, the folder deleted in Explorer) used to be an uncaught error in main, and write-chunk then
// waited for a 'drain' that never came, so the renderer's IO lock stayed held for the rest of the session.

const streamFailure = (stream) => stream.errored || new Error('the cache write stream closed');

/** The temp file's stream for feature-cache-write-open, once it is open; rejects when it cannot be created. */
function openWriteStream(tmpPath, createWriteStream) {
    return new Promise((resolve, reject) => {
        const stream = createWriteStream(tmpPath, { encoding: 'utf8' });
        // Kept for the stream's life: a later error is read back from stream.errored by the next step.
        stream.on('error', () => {});
        stream.once('error', reject);
        stream.once('open', () => {
            stream.off('error', reject);
            resolve(stream);
        });
    });
}

/** One write-chunk's text, respecting backpressure so a slow disk can't balloon the write buffer. */
function writeWithBackpressure(stream, text) {
    return new Promise((resolve, reject) => {
        if (stream.destroyed || stream.errored) {
            reject(streamFailure(stream));
            return;
        }
        if (stream.write(text)) {
            resolve();
            return;
        }
        const settle = (err) => {
            stream.off('drain', onDrain);
            stream.off('error', onError);
            stream.off('close', onClose);
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        };
        const onDrain = () => settle(null);
        const onError = (err) => settle(err);
        const onClose = () => settle(streamFailure(stream));
        stream.on('drain', onDrain);
        stream.on('error', onError);
        stream.on('close', onClose);
    });
}

/** write-close's last text, then the OS flush ('finish'); rejects on a stream that failed or closed first. */
function endWriteStream(stream, text) {
    return new Promise((resolve, reject) => {
        if (stream.destroyed || stream.errored) {
            reject(streamFailure(stream));
            return;
        }
        finished(stream, (err) => (err ? reject(err) : resolve()));
        stream.end(text);
    });
}

/**
 * The folder's media files, by name: listMediaEntries' names.
 */
async function listMediaFiles(folderPath, isMediaFile) {
    return (await listMediaEntries(folderPath, isMediaFile)).map((e) => e.name);
}

/**
 * The listing itself, shared by load-folder and write-close's coverage check (review #7), so main never counts the
 * folder differently from the list the renderer holds: each name with a media extension whose stat (which follows
 * links) is a file, as `{ name, path, stats }`, in readdir order. A name whose stat fails is left out and passed to
 * `onSkip`.
 */
async function listMediaEntries(folderPath, isMediaFile, { onSkip } = {}) {
    const entries = [];
    for (const name of await fs.readdir(folderPath)) {
        if (!isMediaFile(path.extname(name).toLowerCase())) {
            continue;
        }
        const filePath = path.join(folderPath, name);
        let stats;
        try {
            stats = await fs.stat(filePath);
        } catch (err) {
            onSkip?.(name, err);
            continue;
        }
        if (stats.isFile()) {
            entries.push({ name, path: filePath, stats });
        }
    }
    return entries;
}

/**
 * The ledger's key for a folder's cache file: the folder's canonical path from path-grants (review #9), so every
 * spelling of one folder (a junction, the like folder saved under its drive-letter path) shares one record.
 * canonicalize falls back to the JS realpath where the native call throws on some volumes (deep review #4).
 */
async function featureCacheKey(folderPath, canonicalize, fileName = '.feature_cache.json') {
    return path.join((await canonicalize(folderPath)) ?? path.resolve(folderPath), fileName);
}

/**
 * Whether a cache file is at `filePath`, for write-close's check. Only "no such file" says no (review #13): any other
 * error (a one-shot SMB failure, EPERM) fails closed, so checkClose's rules still apply, as classifyReadError fails
 * closed on an unknown code.
 */
function cacheFileExists(filePath, access) {
    return access(filePath).then(
        () => true,
        (err) => err?.code !== 'ENOENT'
    );
}

/**
 * Whether write-close may rename the temp file over the cache (spec § 7.2). With no file at the destination,
 * anything goes. Otherwise:
 * - `stale`: the writer sent a basis, and main has written the file since (review #5). Checked first: the copy lacks
 *   that write's entries, whatever its count.
 * - `unseen`: main has no record for the file, or only `unreadable`, or `absent` from before the file appeared; the
 *   write must then cover every media file now in the folder, with a CLIP vector each whatever the CLIP setting: main
 *   cannot know what the file holds, and a copy without them would erase them (review #2). Only this case lists the
 *   folder.
 * - `shrink`: main read N entries with the header's version, and the write is under N × 0.5 while the folder holds
 *   over twice what is written: the renderer's own rule, so a real shrink still saves. A known version change skips
 *   it; an unknown version on either side does not.
 * A `corrupt` record allows the write: the file is being replaced on purpose.
 */
async function checkClose({
    record,
    destinationExists,
    header,
    written,
    writtenNames,
    clipNames,
    listFolderMedia,
    generation = 0,
}) {
    if (!destinationExists) {
        return { ok: true };
    }
    if (header.basisGen !== null && header.basisGen !== undefined && header.basisGen !== generation) {
        return { ok: false, refused: 'stale', seen: record?.seen === 'read' ? record.count : null, written };
    }
    if (!record || record.seen === 'unreadable' || record.seen === 'absent') {
        const media = await listFolderMedia();
        const covered = media.length > 0 && media.every((name) => writtenNames.has(name) && clipNames.has(name));
        return covered ? { ok: true } : { ok: false, refused: 'unseen', seen: null, written };
    }
    // Only a known version change skips the rule (review #1): an unknown version on either side keeps it.
    const versionChanged =
        Number.isInteger(record?.version) && Number.isInteger(header.version) && record.version !== header.version;
    if (
        record.seen === 'read' &&
        !versionChanged &&
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
    readFeatureCacheFile,
    openWriteStream,
    writeWithBackpressure,
    endWriteStream,
    listMediaFiles,
    listMediaEntries,
    cacheFileExists,
    featureCacheKey,
    checkClose,
};
