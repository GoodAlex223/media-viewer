// feature-cache-store.js
// FeatureCacheStore — owns the source folder's .feature_cache.json for one folder *visit* at a time: the visit's
// cache state, the read, the save queue, the change counter, the IO lock and the autosave timer. Follows the v2.0
// modularization pattern (see ml-training.js): host dependencies arrive as constructor callbacks, so the module is
// testable with no MediaViewer instance. The three maps stay on the host; the store mutates them in place.
//
// Why a visit: no load, extraction result or save used to know which folder it belonged to, and "never read" was
// stored as "0 entries", which turned the shrink guard off. Six paths could then replace a folder's cache with a
// smaller one or with another folder's entries.
// Design: docs/superpowers/specs/2026-10-21-feature-cache-wipe-design.md

export const FEATURE_DIM = 64;
export const CLIP_DIM = 512;
export const READ_CHUNK = 1000;
export const WRITE_BATCH = 1000;
export const AUTOSAVE_MS = 30000;
// Automatic re-reads after explained refusals, in a row with no successful write between, before the next refusal
// counts as unexplained: a bound on a main that keeps refusing, not a limit normal use reaches.
export const MAX_AUTO_REREADS = 3;

export const DROPPED_WORK_MESSAGE = "Couldn't read this folder's feature cache, so the new features weren't saved.";

/** The dropped-work warning for a visit that ended before its run's save answered: another folder is on screen. */
export const droppedWorkMessage = (name) =>
    `Couldn't read the feature cache for "${name}", so the new features weren't saved.`;

const count = (n) => Number(n).toLocaleString('en-US');

/** The on-screen text for a refusal by main that the renderer cannot explain (spec § 7.3). */
export function refusalMessage({ refused, seen, written, label = 'Feature cache' }) {
    if (refused === 'shrink') {
        return (
            `${label} not saved: it would have replaced ${count(seen)} cached entries with ${count(written)}. ` +
            'The cache on disk is unchanged.'
        );
    }
    if (refused === 'stale') {
        return `${label} not saved: the cache file kept changing while this folder was open. The cache on disk is unchanged.`;
    }
    return `${label} not saved: this folder's cache was never read in this session. The cache on disk is unchanged.`;
}

/**
 * Whether a frozen copy's entries (`[name, vector, clip, size, mtime]`) cover every file in the folder, each with a
 * CLIP vector. With CLIP off too (review #2): the file was never read, so it may hold CLIP vectors, and a copy
 * without them would erase them. An empty folder is never covered: there is nothing to vouch for.
 */
export function coversFolder(fileNames, entries) {
    const hasClip = new Map();
    for (const [name, , clip] of entries) {
        hasClip.set(name, !!clip);
    }
    let any = false;
    for (const name of fileNames) {
        any = true;
        if (!hasClip.get(name)) {
            return false;
        }
    }
    return any;
}

/**
 * Whether a frozen copy may be written, from its frozen state alone (spec § 5.4). `unread` writes only after a read
 * failed (D2: a visit that has not tried to read never saves; review #2), only a copy that covers the folder, and
 * not again once main has refused one as not covering it, until the visit reads again (review #7). `read` keeps the
 * original three-conjunct shrink guard against the visit's baseline.
 */
export function decideSave(frozen) {
    if (frozen.state === 'blocked') {
        return { write: false, reason: 'blocked' };
    }
    const n = frozen.entries.length;
    if (n === 0) {
        return { write: false, reason: 'empty' };
    }
    if (frozen.state === 'unread') {
        return frozen.readFailed && !frozen.coverageRefused && frozen.covers
            ? { write: true }
            : { write: false, reason: 'unread' };
    }
    if (frozen.state === 'read' && frozen.baseline > 0 && n < frozen.baseline * 0.5 && frozen.fileCount > n * 2) {
        return { write: false, reason: 'shrink-guard' };
    }
    return { write: true };
}

// Rounded to 6 decimals before serializing: full-precision floats stringify to ~17 characters each, and 6 decimals
// is well below the noise floor for unit-normalized cosine similarity (a 24k-file cache went from 259 MB to ~130 MB).
const round6 = (arr) => {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        out[i] = Math.round(arr[i] * 1e6) / 1e6;
    }
    return out;
};

export class FeatureCacheStore {
    /**
     * @param {object} deps
     * @param {object} deps.io main's six feature-cache calls: open, chunk, close, writeOpen, writeChunk, writeClose.
     * @param {() => {featureCache: Map, clipCache: Map, featureMetadata: Map}} deps.getMaps the host's live maps.
     * @param {() => Array<{name, path, size, mtimeMs}>} deps.getMediaFiles the folder's files.
     * @param {() => {featureCacheVersion: number}} deps.getConfig
     * @param {(path: string) => string} deps.basename synchronous.
     * @param {object} [deps.timers] read at call time, so a test can replace the global setInterval.
     */
    constructor({ io, getMaps, getMediaFiles, getConfig, basename, logError, notify, timers = globalThis }) {
        this.io = io;
        this.getMaps = getMaps;
        this.getMediaFiles = getMediaFiles;
        this.getConfig = getConfig;
        this.basename = basename;
        this.logError = logError || (() => {});
        this.notify = notify || (() => {});
        this.timers = timers;

        this._visitSeq = 0;
        this._cur = null; // the current visit's record, or null between visits
        this._readFlight = null; // { visit, promise }: the current visit's read, joined by a second caller
        this._lockTail = Promise.resolve();
        this._saveChain = Promise.resolve();
        this._queued = new Map(); // visit id → the request queued for it, not yet started
        this._autoSaveTimer = null;
    }

    // ==================== VISITS ====================

    get visit() {
        return this._cur ? this._cur.visit : null;
    }

    isCurrent(visit) {
        return !!visit && !!this._cur && this._cur.visit === visit;
    }

    /** Starts a visit to `folder`: its cache unread, nothing to save. */
    beginVisit(folder) {
        const visit = Object.freeze({ id: ++this._visitSeq, folder });
        this._cur = {
            visit,
            state: 'unread',
            baseline: null,
            changes: 0, // bumped by every write into the maps for this visit
            savedChanges: 0, // the counter a successful save had frozen
            gen: null, // the file's generation (main's write count) when this visit last read or wrote it (review #5)
            readSeq: 0, // bumped by every read that merges the file in: a copy frozen before one is out of date
            autoRereads: 0, // re-reads after explained refusals since the last successful write
            readFailed: false, // the last read failed (not cancelled): dropped work is reported
            readFailureLogged: false,
            coverageRefused: false, // main refused an unread copy as not covering the folder; reset by a read
            refusalWarned: false,
            droppedWarned: false,
        };
        return visit;
    }

    /**
     * Ends the current visit, flushing it first when it is dirty (spec my call 1). The copy is frozen before this
     * returns, so the host may clear its list and maps straight after. Callers do not await it.
     */
    endVisit() {
        const rec = this._cur;
        if (!rec) {
            return null;
        }
        const flush = this._isDirty(rec) ? this.requestSave() : null;
        this._cur = null;
        return flush;
    }

    getState() {
        const rec = this._cur;
        if (!rec) {
            return { state: 'none', baseline: null, dirty: false };
        }
        return { state: rec.state, baseline: rec.baseline, dirty: this._isDirty(rec) };
    }

    /** True while the visit has not read its cache: `unread`, or `blocked` after a refusal (spec my call 14). */
    needsRead() {
        const rec = this._cur;
        return !!rec && (rec.state === 'unread' || rec.state === 'blocked');
    }

    _isDirty(rec) {
        return rec.changes > rec.savedChanges;
    }

    // ==================== WRITES INTO THE MAPS ====================

    /** An extraction result, for the visit its work started in. Dropped when that visit is over. */
    putFeature(visit, path, vector) {
        if (!this.isCurrent(visit)) {
            return false;
        }
        const { featureCache, featureMetadata } = this.getMaps();
        featureCache.set(path, vector);
        const file = this.getMediaFiles().find((f) => f.path === path);
        if (file) {
            featureMetadata.set(path, { size: file.size, mtime: file.mtimeMs || 0 });
        }
        this._cur.changes++;
        return true;
    }

    putClip(visit, path, clipVector) {
        if (!this.isCurrent(visit)) {
            return false;
        }
        this.getMaps().clipCache.set(path, clipVector);
        this._cur.changes++;
        return true;
    }

    // ==================== READ ====================

    /**
     * Reads the current visit's cache file, at most once per visit (spec my call 4). A second caller in the same
     * visit joins the read in flight; a caller in a later visit never does (T4c). Resolves to the map's size.
     */
    ensureRead({ signal, onProgress } = {}) {
        const rec = this._cur;
        if (!rec || !this.needsRead()) {
            return Promise.resolve(this.getMaps().featureCache.size);
        }
        if (this._readFlight && this._readFlight.visit === rec.visit) {
            return this._readFlight.promise;
        }
        const promise = this._read(rec, { signal, onProgress }).finally(() => {
            if (this._readFlight?.promise === promise) {
                this._readFlight = null;
            }
        });
        this._readFlight = { visit: rec.visit, promise };
        return promise;
    }

    async _read(rec, { signal, onProgress }) {
        const { visit } = rec;
        const maps = this.getMaps();
        // After every await: a read whose visit ended, or whose caller cancelled, commits nothing and changes no
        // state (T4a, T4b). The baseline is set only at the commit.
        const live = () => this.isCurrent(visit) && !signal?.aborted;
        const release = await this.acquireLock();
        try {
            if (!live()) {
                return maps.featureCache.size;
            }
            const byName = new Map(this.getMediaFiles().map((f) => [f.name, f]));
            const staged = [];
            const ingest = (name, vector, clip, size, mtime) => {
                const file = byName.get(name);
                if (!file) {
                    return; // pruned — no longer in the folder
                }
                if (vector.length !== FEATURE_DIM) {
                    return;
                }
                if (size !== file.size || mtime !== file.mtimeMs) {
                    return; // stale
                }
                staged.push([file.path, vector, clip && clip.length === CLIP_DIM ? clip : null, size, mtime]);
            };
            try {
                const opened = await this.io.open(visit.folder);
                if (!live()) {
                    return maps.featureCache.size;
                }
                rec.coverageRefused = false; // the folder may have changed: an unread copy may try once more
                if (!opened?.success) {
                    rec.gen = opened?.gen ?? null;
                    if (opened?.notFound) {
                        rec.state = 'absent';
                    } else if (opened?.corrupt) {
                        rec.state = 'discard';
                    } else {
                        // Unreadable (an I/O error that outlasted main's retries, a refused path): not "no file"
                        // (spec my call 2). The visit stays unread, so it can still save a full-coverage copy.
                        this._readFailed(rec, opened?.error || 'open failed');
                    }
                    return maps.featureCache.size;
                }
                if (opened.version !== this.getConfig().featureCacheVersion) {
                    // Replaced on purpose; this visit's own extractions are kept (spec § 5.2).
                    rec.gen = opened.gen ?? null;
                    rec.state = 'discard';
                    return maps.featureCache.size;
                }
                const total = opened.count;
                let loaded = 0;
                for (let offset = 0; offset < total; offset += READ_CHUNK) {
                    if (!live()) {
                        return maps.featureCache.size;
                    }
                    const chunk = await this.io.chunk(offset, READ_CHUNK);
                    if (!live()) {
                        return maps.featureCache.size;
                    }
                    if (!chunk?.vecBuf) {
                        // main answers packFeatureChunk's shape (feature-cache-transport.js); `{ entries: [] }` is its
                        // reply with no session, and the IPC guard's refusal value. Read as "no entries", it
                        // committed `read` with the full count as baseline (review #12).
                        throw new Error('a chunk came back without its entries');
                    }
                    // .slice() gives each entry its own compact copy, NOT .subarray() (a view would pin the whole
                    // n*64 / n*512 chunk buffer).
                    const vecs = new Float32Array(chunk.vecBuf);
                    const clips = chunk.clipBuf ? new Float32Array(chunk.clipBuf) : null;
                    for (let i = 0; i < chunk.names.length; i++) {
                        const vector = vecs.slice(i * FEATURE_DIM, (i + 1) * FEATURE_DIM);
                        const clip = clips && chunk.hasClip[i] ? clips.slice(i * CLIP_DIM, (i + 1) * CLIP_DIM) : null;
                        ingest(chunk.names[i], vector, clip, chunk.sizes[i], chunk.mtimes[i]);
                    }
                    loaded += chunk.names.length;
                    onProgress?.(loaded, total);
                }
                // Merge (spec my call 3): the disk entries go in, validated against this folder's files, and win on
                // a shared path; this visit's own extractions fill the gaps. In place: the host owns the maps.
                for (const [path, vector, clip, size, mtime] of staged) {
                    maps.featureCache.set(path, vector);
                    maps.featureMetadata.set(path, { size, mtime });
                    if (clip) {
                        maps.clipCache.set(path, clip);
                    }
                }
                rec.state = 'read';
                rec.baseline = total;
                rec.readFailed = false;
                rec.gen = opened.gen ?? null;
                rec.readSeq++;
                return maps.featureCache.size;
            } catch (err) {
                if (this.isCurrent(visit)) {
                    this._readFailed(rec, err?.message ?? String(err));
                }
                return maps.featureCache.size;
            } finally {
                try {
                    await this.io.close();
                } catch (_e) {
                    // the session is gone either way
                }
            }
        } finally {
            release();
        }
    }

    _readFailed(rec, error) {
        rec.readFailed = true;
        if (!rec.readFailureLogged) {
            rec.readFailureLogged = true;
            this.logError(`Feature-cache read failed for ${rec.visit.folder}: ${error}`);
        }
    }

    // ==================== SAVE ====================

    /**
     * Saves the current visit. Everything the save needs is frozen here, synchronously: nothing after this call reads
     * the live maps, the file list or the folder (T2). A request made while another save streams waits behind it
     * with its own copy; requests for the same visit that are still queued coalesce to the newest copy (T6).
     * Never rejects.
     */
    requestSave() {
        const rec = this._cur;
        if (!rec) {
            return Promise.resolve({ outcome: 'skipped', reason: 'no-visit' });
        }
        const frozen = this._freeze(rec);
        const queued = this._queued.get(rec.visit.id);
        if (queued) {
            queued.frozen = frozen;
            return queued.promise;
        }
        const request = { frozen, promise: null };
        this._queued.set(rec.visit.id, request);
        request.promise = this._saveChain.then(async () => {
            this._queued.delete(rec.visit.id); // started: a newer request queues behind this one
            try {
                return await this._save(request.frozen, rec);
            } catch (err) {
                console.warn('Feature cache not saved:', err);
                return { outcome: 'failed', reason: err?.message ?? String(err) };
            }
        });
        this._saveChain = request.promise;
        return request.promise;
    }

    /** The autosave's tick: a save only when this visit has unsaved entries. */
    saveIfDirty() {
        const rec = this._cur;
        if (!rec || !this._isDirty(rec)) {
            return Promise.resolve(null);
        }
        if (rec.state === 'blocked') {
            return Promise.resolve({ outcome: 'skipped', reason: 'blocked' }); // until the visit reads again
        }
        return this.requestSave();
    }

    /**
     * The tail of an extraction run (the AI sort's Phase 2, the CLIP kickoff) for the visit it ran in. Nothing when
     * that visit is over: its flush on leave saved what it could (for a visit whose read failed, only a covering
     * copy). When the visit could not read its cache and its work cannot be saved, one warning per visit says so
     * (spec D2 amendment), naming the folder if the visit ended while the save waited (review #15).
     */
    async finishExtractionRun(visit) {
        if (!this.isCurrent(visit)) {
            return null;
        }
        const rec = this._cur;
        const result = await this.saveIfDirty();
        const dropped = result?.reason === 'unread' || result?.reason === 'unseen';
        if (dropped && rec.readFailed && !rec.droppedWarned) {
            rec.droppedWarned = true;
            this.notify(
                this.isCurrent(visit) ? DROPPED_WORK_MESSAGE : droppedWorkMessage(this._folderName(visit.folder)),
                'warning'
            );
        }
        return result;
    }

    _freeze(rec) {
        const { featureCache, clipCache, featureMetadata } = this.getMaps();
        const files = this.getMediaFiles();
        const byPath = new Map(files.map((f) => [f.path, f]));
        const { featureCacheVersion } = this.getConfig();
        const entries = [];
        for (const [path, vector] of featureCache) {
            const meta = featureMetadata.get(path);
            const file = meta ? null : byPath.get(path);
            const size = meta ? meta.size : file?.size;
            const mtime = meta ? meta.mtime : file?.mtimeMs;
            if (!size || !mtime) {
                continue; // unresolvable: size 0 / mtime 0 never matches a real stat, so it would poison the cache
            }
            entries.push([this.basename(path), vector, clipCache.get(path) || null, size, mtime]);
        }
        return {
            visit: rec.visit,
            folder: rec.visit.folder,
            state: rec.state,
            baseline: rec.baseline,
            changeCount: rec.changes,
            readSeq: rec.readSeq,
            savedAtFreeze: rec.savedChanges,
            readFailed: rec.readFailed,
            coverageRefused: rec.coverageRefused,
            fileCount: files.length,
            covers: coversFolder(
                files.map((f) => f.name),
                entries
            ),
            version: featureCacheVersion,
            entries,
        };
    }

    async _save(frozen, rec) {
        const decision = decideSave(frozen);
        if (!decision.write) {
            if (decision.reason === 'shrink-guard') {
                this.logError(
                    `Feature-cache save SKIPPED (shrink guard): in-memory ${frozen.entries.length} entries vs ` +
                        `${frozen.baseline} on disk for ${frozen.fileCount} files.`
                );
            }
            return { outcome: 'skipped', reason: decision.reason };
        }
        // The stream writes the frozen copy to the frozen folder, and nothing else (spec D3): a folder change
        // during it neither stops it nor redirects it. Only the reply's effect on the visit checks it is current.
        const release = await this.acquireLock();
        try {
            if (frozen.readSeq !== rec.readSeq) {
                // A re-read merged the file in after this copy froze (an explained refusal's): the copy lacks what it
                // read. The save that follows the re-read carries both.
                return { outcome: 'skipped', reason: 'superseded' };
            }
            if (frozen.changeCount > frozen.savedAtFreeze && rec.savedChanges >= frozen.changeCount) {
                // A save that streamed while this one waited already wrote every change this copy has (close-out
                // cut 1): savedChanges moves only when a write ends, so the visit still looked dirty at the request.
                return { outcome: 'skipped', reason: 'unchanged' };
            }
            // The basis is read now, not frozen: a save of this visit that finished while this one waited moved it,
            // and this copy holds everything that one did. main refuses the copy as stale if anyone else wrote the
            // file since (review #5, #14).
            const opened = await this.io.writeOpen(frozen.folder, {
                version: frozen.version,
                featureDim: FEATURE_DIM,
                clipDim: CLIP_DIM,
                fileCount: frozen.fileCount,
                basisGen: rec.gen,
            });
            if (!opened?.success) {
                // Nothing is written this time, and the baseline stays, so the next save is still guarded.
                console.warn('Feature cache not saved:', opened?.error || 'write-open failed');
                return { outcome: 'failed', reason: opened?.error || 'write-open failed' };
            }
            let batch = [];
            for (const [name, vector, clip, size, mtime] of frozen.entries) {
                batch.push([name, { vector: round6(vector), clipVector: clip ? round6(clip) : null, size, mtime }]);
                if (batch.length >= WRITE_BATCH) {
                    await this._writeBatch(batch);
                    batch = [];
                }
            }
            await this._writeBatch(batch);
            // A failed chunk throws before this line on purpose: write-close is not an abort. It renames the temp
            // file over the cache, so closing after a failed chunk would commit a truncated file.
            const closed = await this.io.writeClose();
            if (closed?.refused) {
                return this._refused(frozen, rec, closed);
            }
            if (!closed?.success) {
                throw new Error(closed?.error || 'write-close failed');
            }
            const written = frozen.entries.length;
            if (Number.isInteger(closed.gen)) {
                rec.gen = closed.gen; // even for a visit that has ended: its flush may still be queued
            }
            rec.autoRereads = 0;
            if (this.isCurrent(frozen.visit)) {
                rec.state = 'read';
                rec.baseline = written;
                rec.savedChanges = Math.max(rec.savedChanges, frozen.changeCount);
            }
            return { outcome: 'written', written };
        } finally {
            release();
        }
    }

    async _writeBatch(batch) {
        if (batch.length === 0) {
            return;
        }
        const res = await this.io.writeChunk(batch);
        if (!res?.success) {
            throw new Error(res?.error || 'write-chunk failed');
        }
    }

    /**
     * Main refused the close (spec § 7.3). Explained when the file changed behind the visit: main says it was written
     * since the visit's basis (`stale`: the training step wrote it, the source folder being a like folder), or the
     * visit had found no file or a corrupt one. The visit then reads the file again, merging it in, and saves what it
     * read with its own work (review #4: adopting main's count without the entries let a later save shrink the file).
     * Unexplained otherwise: one warning per visit, and the visit is blocked until it reads again. Always logged. For
     * a visit that has ended (its flush on leave), the warning names its folder, since another one is on screen by
     * then, and no state changes.
     */
    _refused(frozen, rec, closed) {
        if (frozen.state === 'unread' && closed.refused === 'unseen') {
            // main lists a file this visit's list lacks (a download after the listing, a file taken off the list):
            // the copy the renderer believed covering does not cover. Not a bug report (review #7): no warning, no
            // block; the visit stays unread and does not try the copy again until it reads again.
            this.logError(
                `Feature-cache save refused by main (unseen) for ${frozen.folder}: seen ${closed.seen}, ` +
                    `written ${closed.written} — the folder has files its list lacks`
            );
            if (this.isCurrent(frozen.visit)) {
                rec.coverageRefused = true;
            }
            return { outcome: 'refused', reason: closed.refused, written: closed.written };
        }
        const changedBehind = closed.refused === 'stale' || frozen.state === 'absent' || frozen.state === 'discard';
        const explained = changedBehind && rec.autoRereads < MAX_AUTO_REREADS;
        this.logError(
            `Feature-cache save refused by main (${closed.refused}) for ${frozen.folder}: ` +
                `seen ${closed.seen}, written ${closed.written}` +
                (explained ? ' — explained, the file changed after this visit looked' : '')
        );
        if (this.isCurrent(frozen.visit)) {
            if (explained) {
                this._rereadThenSave(rec);
            } else {
                rec.state = 'blocked';
                if (!rec.refusalWarned) {
                    rec.refusalWarned = true;
                    this.notify(refusalMessage(closed), 'warning');
                }
            }
        } else if (!explained && !rec.refusalWarned) {
            rec.refusalWarned = true;
            const label = `Feature cache for "${this._folderName(frozen.folder)}"`;
            this.notify(refusalMessage({ ...closed, label }), 'warning');
        }
        return { outcome: 'refused', reason: closed.refused, written: closed.written };
    }

    // A folder's name in a warning: its basename, or its path for a drive root, whose basename is empty.
    _folderName(folder) {
        return this.basename(folder) || folder;
    }

    // Called while the refused save still holds the lock, so the read queues on it now, ahead of any copy already
    // waiting in the save chain; that copy is then skipped as superseded.
    _rereadThenSave(rec) {
        rec.autoRereads++;
        // Every copy frozen before this refusal is out of date, whatever the read does (close-out R1): a failed
        // open still takes main's current generation, so without this a queued copy got past the stale check.
        rec.readSeq++;
        rec.state = 'unread';
        rec.baseline = null;
        const { visit } = rec;
        this.ensureRead().then(() => (this.isCurrent(visit) ? this.saveIfDirty() : null));
    }

    // ==================== LOCK AND AUTOSAVE ====================

    /**
     * Serializes every feature-cache read and write, the training folders' included (MlTrainingManager takes it
     * through its injected cacheIo). On Windows the rename of the temp file fails with EPERM while a streaming read
     * holds the destination open. Resolves to a release function.
     */
    acquireLock() {
        const prev = this._lockTail;
        let release;
        this._lockTail = new Promise((resolve) => {
            release = resolve;
        });
        return prev.then(() => release);
    }

    startAutoSave() {
        this.stopAutoSave();
        this._autoSaveTimer = this.timers.setInterval(() => this.saveIfDirty(), AUTOSAVE_MS);
    }

    stopAutoSave() {
        if (this._autoSaveTimer) {
            this.timers.clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
    }
}
