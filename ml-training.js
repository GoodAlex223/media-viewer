// ml-training.js
// MlTrainingManager — owns the ML training set: which files train the model, the fingerprint
// that identifies that set, the per-training-folder vector caches, and the fingerprint-keyed
// model cache. Follows the v2.0 modularization pattern (see fullscreen.js): constructor-injected
// callbacks for host dependencies, so the module is testable with no MediaViewer instance.
//
// Design: docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md

/**
 * Everything the trained model is a function of. Training reads the descriptor and nothing
 * else, so an input that is not declared here cannot influence the model — which is what
 * makes a fingerprint miss structurally impossible rather than merely discouraged.
 */
export const DESCRIPTOR_KEYS = Object.freeze([
    'likeFolder',
    'likeFiles',
    'dislikeFolder',
    'dislikeFiles',
    'bulkRated',
    'enableClipFeatures',
    'mlModelVersion',
    'featureCacheVersion',
    'featureVersion',
    'trainingConfigVersion',
]);

// Only these fields of a file entry affect training. `path` is excluded deliberately: the
// folder is already a descriptor key, and including absolute paths would make the fingerprint
// machine-specific for no gain.
const fileTriple = (f) => [String(f.name), Number(f.size) || 0, Number(f.mtimeMs) || 0];
const byName = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

export function buildDescriptor({
    likeFolder,
    likeFiles,
    dislikeFolder,
    dislikeFiles,
    bulkRated,
    enableClipFeatures,
    versions,
}) {
    return {
        likeFolder: likeFolder || '',
        likeFiles: (likeFiles || []).map(fileTriple).sort(byName),
        dislikeFolder: dislikeFolder || '',
        dislikeFiles: (dislikeFiles || []).map(fileTriple).sort(byName),
        bulkRated: (bulkRated || [])
            .map((f) => [String(f.name), String(f.bucket), Number(f.size) || 0, Number(f.mtimeMs) || 0])
            .sort(byName),
        enableClipFeatures: Boolean(enableClipFeatures),
        mlModelVersion: Number(versions?.mlModelVersion) || 0,
        featureCacheVersion: Number(versions?.featureCacheVersion) || 0,
        featureVersion: Number(versions?.featureVersion) || 0,
        trainingConfigVersion: Number(versions?.trainingConfigVersion) || 0,
    };
}

// FNV-1a over a canonical serialization. Four independent basis values give 128 bits, because
// a collision here is not a slow cache but a silently wrong model.
function fnv1a(str, offset) {
    let h = offset >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

const OFFSETS = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];

/** Serialize in DESCRIPTOR_KEYS order — never object key order, which is insertion-dependent. */
function canonicalize(descriptor) {
    return JSON.stringify(DESCRIPTOR_KEYS.map((k) => descriptor[k]));
}

export function fingerprintDescriptor(descriptor) {
    const text = canonicalize(descriptor);
    return OFFSETS.map((o) => fnv1a(text, o).toString(16).padStart(8, '0')).join('');
}

export function seedFromFingerprint(fingerprint) {
    return parseInt(String(fingerprint).slice(0, 8), 16) >>> 0;
}

const FEATURE_DIM = 64;
const CLIP_DIM = 512;
export const TRAINING_VECTOR_DIM = FEATURE_DIM + CLIP_DIM; // 576

// A CLIP half only counts as present when it is exactly CLIP_DIM long -- a truthy but wrong-
// length array (e.g. a zero-length or corrupt Float32Array) must not silently pass every `!clip`
// truthiness check used to decide coverage (review round 1, Minor 2).
const hasClip = (clip) => !!clip && clip.length === CLIP_DIM;

const CHUNK_SIZE = 500;

// Round before serializing: full-precision floats stringify to ~17 chars each, and 6 decimals
// is well below the noise floor for unit-normalized cosine similarity. Mirrors the source
// folder's cache writer (media-viewer.js _saveFeatureCacheLocked).
const round6 = (arr) => {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        out[i] = Math.round(arr[i] * 1e6) / 1e6;
    }
    return out;
};

export class MlTrainingManager {
    static CACHE_FILENAME = '.feature_cache.json';

    /**
     * @param {Object} o
     * @param {(path: string) => Promise<{success: boolean, files?: Array}>} o.loadFolder
     * @param {(path: string, fileInfo: Object) => Promise<Float32Array>} o.computeFeatures
     * @param {(path: string) => Promise<Float32Array|null>} o.extractClipEmbedding
     * @param {(liked: Array, disliked: Array, seed: number) => Promise<{stats: Object, modelState: Object}>} o.trainModel
     * @param {(modelState: Object) => Promise<{stats: Object}>} o.loadModelState
     * @param {() => Object} o.getConfig
     * @param {() => Object} o.getBulkRatedContext
     * @param {Object} o.cacheIo    Streaming feature-cache IO, all calls serialized by acquireLock
     * @param {Object} o.modelCache `{ read(), write(store) }`
     * @param {(p: Object) => void} o.onProgress
     * @param {(msg: string) => void} o.logError
     * @param {(msg: string, level: string) => void} o.notify
     */
    constructor(o) {
        this.loadFolder = o.loadFolder;
        this.computeFeatures = o.computeFeatures;
        this.extractClipEmbedding = o.extractClipEmbedding;
        this.trainModel = o.trainModel;
        this.loadModelState = o.loadModelState;
        this.getConfig = o.getConfig;
        this.getBulkRatedContext = o.getBulkRatedContext;
        this.cacheIo = o.cacheIo;
        this.modelCache = o.modelCache;
        this.onProgress = o.onProgress || (() => {});
        this.logError = o.logError || (() => {});
        this.notify = o.notify || (() => {});

        // Fingerprint the live worker was last trained on. Null until the first train or a
        // model-cache hit. This is what makes a repeat sort in one session free.
        this.sessionFingerprint = null;
        this.sessionStats = null;
    }

    _cachePath(folderPath) {
        const sep = folderPath.includes('\\') ? '\\' : '/';
        return folderPath.replace(/[\\/]+$/, '') + sep + MlTrainingManager.CACHE_FILENAME;
    }

    /**
     * Load one training folder's vector cache. Entries are validated against the folder scan
     * and returned in a map OWNED BY THIS MODULE — they are never merged into the host's
     * featureCache/clipCache/featureMetadata, which belong to the source folder and are
     * persisted by its own 30 s auto-save.
     *
     * Returns `{ entries, diskCount, aborted }`. `aborted` is true only when the load loop
     * broke because `signal` was already tripped by the time it reached its next iteration --
     * in that case `entries` is PARTIAL (whatever was ingested before the abort was noticed)
     * while `diskCount` is still the FULL on-disk count, not the partial amount actually read.
     * Callers must check `aborted` before treating a partial load as complete.
     *
     * Transport: feature-cache-chunk (main.js) returns packFeatureChunk's output --
     * { names, sizes, mtimes, hasClip, vecBuf, clipBuf } -- with NO `success` field, or the
     * legacy { entries: [[filename, entry]] } shape for a pre-binary on-disk cache. Mirrors
     * media-viewer.js _loadFeatureCacheLocked's `if (chunk.vecBuf) { ... } else { ... }` branch.
     */
    async _loadVectorCache(folderPath, files, signal) {
        const entries = new Map();
        if (!folderPath || !files || files.length === 0) return { entries, diskCount: 0, aborted: false };

        const current = new Map(files.map((f) => [f.name, f]));
        // `?.()?.` (not just `?.()`): a call through an optional-chaining `?.` only short-circuits
        // when the FUNCTION reference is nullish, not when calling it returns undefined -- and
        // getConfig existing but returning undefined is exactly the harness's own bare-vi.fn()
        // failure mode. This sits before acquireLock(), so an unguarded `.versions` here would
        // escape as an unhandled rejection rather than degrade like the save path's (which is at
        // least inside its try).
        const expectedVersion = this.getConfig?.()?.versions?.featureCacheVersion;

        const release = await this.cacheIo.acquireLock();
        let diskCount = 0;
        let aborted = false;
        try {
            const opened = await this.cacheIo.open(this._cachePath(folderPath));
            if (!opened?.success) return { entries, diskCount: 0, aborted: false };
            if (expectedVersion !== undefined && opened.version !== expectedVersion) {
                await this.cacheIo.close();
                return { entries, diskCount: 0, aborted: false };
            }
            diskCount = opened.count || 0;

            for (let offset = 0; offset < diskCount; offset += CHUNK_SIZE) {
                if (signal?.aborted) {
                    aborted = true;
                    break;
                }
                const chunk = await this.cacheIo.chunk(offset, CHUNK_SIZE);
                if (chunk.vecBuf) {
                    // Binary shape: .slice() gives each entry its own compact 64/512 copy --
                    // NOT .subarray() (a view would pin the whole n*64 / n*512 chunk buffer).
                    const vecs = new Float32Array(chunk.vecBuf);
                    const clips = chunk.clipBuf ? new Float32Array(chunk.clipBuf) : null;
                    for (let i = 0; i < chunk.names.length; i++) {
                        const name = chunk.names[i];
                        const file = current.get(name);
                        if (!file) continue; // pruned — no longer in the folder
                        const size = chunk.sizes[i];
                        const mtime = chunk.mtimes[i];
                        if (!size || !mtime) continue; // poisoned entry
                        if (size !== file.size || mtime !== file.mtimeMs) continue; // stale
                        entries.set(name, {
                            feature: vecs.slice(i * FEATURE_DIM, i * FEATURE_DIM + FEATURE_DIM),
                            clip: clips && chunk.hasClip[i] ? clips.slice(i * CLIP_DIM, i * CLIP_DIM + CLIP_DIM) : null,
                            size,
                            mtimeMs: mtime,
                        });
                    }
                } else {
                    // Legacy JSON shape: { entries: [[filename, entry]] }.
                    for (const [name, raw] of chunk.entries || []) {
                        const file = current.get(name);
                        if (!file) continue; // pruned — no longer in the folder
                        if (!raw.size || !raw.mtime) continue; // poisoned entry
                        if (raw.size !== file.size || raw.mtime !== file.mtimeMs) continue; // stale
                        if (!raw.vector || raw.vector.length !== FEATURE_DIM) continue;
                        entries.set(name, {
                            feature: Float32Array.from(raw.vector),
                            clip:
                                raw.clipVector && raw.clipVector.length === CLIP_DIM
                                    ? Float32Array.from(raw.clipVector)
                                    : null,
                            size: raw.size,
                            mtimeMs: raw.mtime,
                        });
                    }
                }
            }
            await this.cacheIo.close();
        } catch (err) {
            this.logError(`Training vector cache load failed for ${folderPath}: ${err.message}`);
            await this.cacheIo.close().catch(() => {});
        } finally {
            release();
        }
        return { entries, diskCount, aborted };
    }

    /**
     * Persist one training folder's vectors. Returns false when the shrink guard refused.
     * @param {number} diskCount entries last seen on disk FOR THIS FOLDER — the guard is
     *   per-cache, so a legitimately small like folder cannot be blocked by a large dislike one.
     * @param {number} [scanCount=Infinity] file count from the live folder scan this save
     *   follows. Mirrors _saveFeatureCacheLocked's third guard conjunct
     *   (`this.mediaFiles.length > this.featureCache.size * 2`) -- this module holds no folder
     *   state of its own, so the caller passes the count instead of it being read off `this`.
     *   The Infinity default always satisfies the conjunct (the conservative direction: the
     *   guard still fires on the first two alone), so a caller that omits it keeps the
     *   two-conjunct behavior rather than silently bypassing the guard. Task 5 passes
     *   `files.length`.
     *
     * Transport: feature-cache-write-chunk (main.js) destructures each element as a
     * [key, value] pair (`for (const [key, value] of entries)`) -- a flat {name, ...} object is
     * not iterable and throws. Mirrors media-viewer.js _saveFeatureCacheLocked's
     * `batch.push([filename, entry])`.
     */
    async _saveVectorCache(folderPath, entries, diskCount, scanCount = Infinity) {
        if (!folderPath || !entries || entries.size === 0) return false;

        // DATA-LOSS GUARD: never replace a substantially populated on-disk cache with a
        // drastically smaller in-memory one -- UNLESS the live folder scan is ALSO small, which
        // is what tells a genuine shrink (few entries, few files) apart from a partial/rejected
        // load (few entries, but the folder still has many files). Three conjuncts, mirroring
        // _saveFeatureCacheLocked's guard exactly (real incident: a 23,559-entry cache was
        // overwritten by 32 entries) -- that guard reads `this.mediaFiles.length` directly; this
        // module holds no folder state, so `scanCount` arrives as a parameter instead.
        if (diskCount > 0 && entries.size < diskCount * 0.5 && scanCount > entries.size * 2) {
            this.logError(
                `Training-cache save SKIPPED (shrink guard) for ${folderPath}: ` +
                    `in-memory ${entries.size} entries vs ${diskCount} on disk.`
            );
            return false;
        }

        const release = await this.cacheIo.acquireLock();
        try {
            // See _loadVectorCache's matching comment: `?.()?.`, not `?.().` -- getConfig can
            // exist but return undefined (the harness's bare-vi.fn() failure mode), and only the
            // second `?.` guards that.
            const version = this.getConfig?.()?.versions?.featureCacheVersion;
            const opened = await this.cacheIo.writeOpen(this._cachePath(folderPath), {
                version,
                featureDim: FEATURE_DIM,
                clipDim: CLIP_DIM,
            });
            if (!opened?.success) return false;

            let batch = [];
            // Mirrors _saveFeatureCacheLocked's `flush`: both writeChunk and writeClose report
            // failure by RETURNING {success:false}, not by throwing (write-close does this even
            // after exhausting its own EPERM/EACCES/EBUSY rename retries, at which point nothing
            // was persisted at all) -- an unchecked result silently reports success on a save
            // that did nothing.
            const flush = async () => {
                if (batch.length === 0) return;
                const res = await this.cacheIo.writeChunk(batch);
                if (!res?.success) throw new Error(res?.error || 'write-chunk failed');
                batch = [];
            };
            for (const [name, value] of entries) {
                // Skip rather than poison: size 0 / mtime 0 never matches a real stat, so such
                // an entry would be rejected as stale forever.
                if (!value.size || !value.mtimeMs) continue;
                batch.push([
                    name,
                    {
                        vector: round6(value.feature),
                        clipVector: value.clip ? round6(value.clip) : null,
                        size: value.size,
                        mtime: value.mtimeMs,
                    },
                ]);
                if (batch.length >= CHUNK_SIZE) await flush();
            }
            await flush();
            const closed = await this.cacheIo.writeClose();
            if (!closed?.success) throw new Error(closed?.error || 'write-close failed');
            return true;
        } catch (err) {
            // Do NOT call writeClose() here -- it is not an abort. feature-cache-write-close
            // writes the closing brace, flushes the stream, and ATOMICALLY RENAMES the (possibly
            // truncated) temp file over the live cache: calling it after a mid-write failure
            // would commit a truncated cache over a good one, and the well-formed-but-partial
            // result would pass the next load's parse and re-baseline the next save's shrink
            // guard off the truncated count -- silent, permanent, undetectable data loss.
            // Logging only and leaving the writer dangling is correct and matches
            // _saveFeatureCacheLocked's own catch: the next write-open destroys any leftover
            // writer, so a stray .tmp file is the only cost.
            this.logError(`Training vector cache save failed for ${folderPath}: ${err.message}`);
            return false;
        } finally {
            release();
        }
    }

    static MODEL_CACHE_VERSION = 1;
    static MODEL_CACHE_LIMIT = 5;

    async _readCachedModel(fingerprint) {
        try {
            const res = await this.modelCache.read();
            const store = res?.store;
            if (!store || store.version !== MlTrainingManager.MODEL_CACHE_VERSION) return null;
            return (store.entries || []).find((e) => e.fingerprint === fingerprint) || null;
        } catch (err) {
            this.logError(`ML model cache read failed: ${err.message}`);
            return null;
        }
    }

    async _writeCachedModel(fingerprint, modelState, stats, descriptorSummary) {
        try {
            const res = await this.modelCache.read();
            const existing =
                res?.store?.version === MlTrainingManager.MODEL_CACHE_VERSION ? res.store.entries || [] : [];
            const kept = existing.filter((e) => e.fingerprint !== fingerprint);
            const entries = [{ fingerprint, modelState, stats, descriptorSummary, savedAt: Date.now() }, ...kept].slice(
                0,
                MlTrainingManager.MODEL_CACHE_LIMIT
            );
            const write = await this.modelCache.write({
                version: MlTrainingManager.MODEL_CACHE_VERSION,
                entries,
            });
            if (!write?.success) {
                this.logError(`ML model cache write failed: ${write?.error || 'unknown error'}`);
            }
        } catch (err) {
            this.logError(`ML model cache write failed: ${err.message}`);
        }
    }

    /** Merge a 64-dim feature half and an optional 512-dim CLIP half into one 576-dim row. */
    _combine(feature, clip) {
        const merged = new Float32Array(TRAINING_VECTOR_DIM);
        merged.set(feature, 0);
        if (hasClip(clip)) merged.set(clip, FEATURE_DIM);
        return Array.from(merged);
    }

    /**
     * Load one training folder's cached vectors, extract whatever is missing or stale, persist
     * the result, and return the 576-dim rows. Only files absent from the cache cost CLIP
     * inference — which is the whole retrain-skip win.
     *
     * `enableClipFeatures` is passed in from the ONE `getConfig()` read `ensureTrainedModel`
     * already did, rather than re-read per file — a mid-run config change (e.g. CLIP toggled while
     * a sort is in flight) must not desync this loop's `needsClip` from the caller's own gate
     * decision (review round 1, Minor 1).
     *
     * `_loadVectorCache`'s own `aborted` flag is checked immediately: a load cancelled mid-stream
     * hands back a PARTIAL entries map paired with the FULL on-disk diskCount, so it must be
     * treated as a hard bail here, identically to `signal?.aborted` — never fed into extraction or
     * `_saveVectorCache`.
     */
    async _collectFolderVectors(folderPath, files, phase, enableClipFeatures, signal) {
        const { entries, diskCount, aborted } = await this._loadVectorCache(folderPath, files, signal);
        const rows = [];
        let clipMissing = 0;
        let failed = 0;
        let extracted = 0;
        if (aborted) return { rows, clipMissing, failed, aborted: true };

        for (let i = 0; i < files.length; i++) {
            if (signal?.aborted) return { rows, clipMissing, failed, aborted: true };
            const file = files[i];
            let hit = entries.get(file.name);
            const hadHit = !!hit;

            // Re-extract when absent, or when the CLIP half is missing while CLIP is on —
            // the self-healing filter that keeps a degraded run from becoming permanent.
            const needsClip = enableClipFeatures && hadHit && !hasClip(hit.clip);
            if (!hadHit || needsClip) {
                try {
                    const feature = hadHit ? hit.feature : await this.computeFeatures(file.path, file);
                    const clip = await this.extractClipEmbedding(file.path);
                    const gainedClip = needsClip && hasClip(clip);
                    hit = { feature, clip: hasClip(clip) ? clip : null, size: file.size, mtimeMs: file.mtimeMs };
                    entries.set(file.name, hit);
                    // Only count as progress when something genuinely NEW was produced -- a
                    // re-extract that still comes back CLIP-less must not force a byte-identical
                    // cache rewrite on every single sort while CLIP stays unavailable (Minor 4).
                    if (!hadHit || gainedClip) extracted++;
                } catch (err) {
                    failed++;
                    // review round 1, Important 6: this is the only diagnostic for a file the
                    // fingerprint still counts but the trained model never saw (Important 2) --
                    // console output is not persisted, so this MUST go through the injected
                    // logError, matching every other diagnostic in this module.
                    this.logError(`Skipping ${file.name} in ${folderPath}: ${err.message}`);
                    continue;
                }
            }

            if (!hasClip(hit.clip)) clipMissing++;
            rows.push(this._combine(hit.feature, hit.clip));
            this.onProgress({ phase, current: i + 1, total: files.length });
        }

        // scanCount = files.length: the third shrink-guard conjunct that tells a genuine folder
        // shrink apart from a partial/rejected load (`_saveVectorCache`'s own doc comment). diskCount
        // is passed through UNCHANGED from `_loadVectorCache` -- never re-baselined from
        // entries.size, which undercounts (entries whose stat could not be resolved are skipped on
        // save, so entries.size is only an upper bound on what was actually written).
        if (extracted > 0 && !signal?.aborted) {
            await this._saveVectorCache(folderPath, entries, diskCount, files.length);
        }
        return { rows, clipMissing, failed, aborted: false };
    }

    /**
     * Resolve which bulk-rated names still have a file in the source folder — pure, synchronous
     * metadata only (no feature/CLIP extraction), so it is cheap enough to run unconditionally
     * before the fingerprint is even computed. The descriptor's `bulkRated` input is a projection
     * of this. Split out from the (expensive) vector-extraction phase in review round 1, Important
     * 4: the vector half must never run before the session/model-cache checks, or the "free
     * repeat sort" tiers stop being free.
     */
    _resolveBulkRatedFiles() {
        const { bulkRated, mediaFiles } = this.getBulkRatedContext();
        const mediaByName = new Map((mediaFiles || []).map((f) => [f.name, f]));
        const resolved = [];
        for (const [name, bucket] of bulkRated || []) {
            const file = mediaByName.get(name);
            if (file) resolved.push({ name, bucket, file });
        }
        return resolved;
    }

    /**
     * Corrective bulk ratings stay in the SOURCE folder and are never in the like/dislike
     * folders, so a from-scratch rebuild cannot recover them from disk. Their vectors come from
     * the source folder's own caches — reading those is correct; writing to them is not.
     *
     * Takes `resolved` from `_resolveBulkRatedFiles` and runs ONLY on the rebuild path (after both
     * the session and model-cache checks have missed) — this is the expensive half, and running it
     * unconditionally is exactly what made the two cheap tiers not actually cheap (Important 4).
     *
     * Mirrors `_collectFolderVectors`'s self-healing re-extract (review round 1, Important 3): a
     * file whose feature is warm but whose CLIP half is absent from `clipCache` is retried, not
     * left permanently degraded until the host's own background extraction happens to fill it in.
     *
     * Tracks `clipMissing` the same way `_collectFolderVectors` does: design doc § 7.1 defines
     * CLIP coverage over "the fraction of training vectors carrying a real CLIP half," which
     * includes this bulk-rated contribution.
     */
    async _collectBulkRatedVectors(resolved, enableClipFeatures, signal) {
        const { featureCache, clipCache } = this.getBulkRatedContext();
        const liked = [];
        const disliked = [];
        let clipMissing = 0;
        let failed = 0;
        const total = resolved.length;
        let processed = 0;

        for (const { name, bucket, file } of resolved) {
            if (signal?.aborted) return { liked, disliked, clipMissing, failed, aborted: true };
            this.onProgress({ phase: 'Processing corrective ratings', current: ++processed, total });

            let feature = featureCache?.get(file.path);
            let clip = clipCache?.get(file.path) || null;
            if (!feature || (enableClipFeatures && !hasClip(clip))) {
                try {
                    feature = feature || (await this.computeFeatures(file.path, file));
                    clip = await this.extractClipEmbedding(file.path);
                } catch (err) {
                    failed++;
                    // review round 2, item 1: this is what makes the failure diagnosable AND what
                    // now gates caching (see `rowsFailed` in ensureTrainedModel) -- before this,
                    // the file was silently dropped from the rows while _resolveBulkRatedFiles had
                    // already counted it into the fingerprint (the Important-4 split introduced
                    // this gap: membership and vector extraction used to share one try/continue).
                    this.logError(`Skipping bulk-rated ${name}: ${err.message}`);
                    continue;
                }
            }
            if (!hasClip(clip)) clipMissing++;
            (bucket === 'good' ? liked : disliked).push(this._combine(feature, clip));
        }
        return { liked, disliked, clipMissing, failed, aborted: false };
    }

    /**
     * `_readCachedModel` validates the STORE's version but not an individual cached entry's
     * internal shape. A rejecting or malformed `loadModelState` result must be treated as a model-
     * cache miss (design doc § 7.2: "Model-cache read failure or malformed entry | Treated as a
     * miss"), never as an escaped exception out of `ensureTrainedModel`.
     */
    async _safeLoadModelState(modelState, fingerprint) {
        let loaded;
        try {
            loaded = await this.loadModelState(modelState);
        } catch (err) {
            this.logError(`Cached model load failed for ${fingerprint}: ${err.message}; rebuilding.`);
            return null;
        }
        if (!loaded?.stats) {
            this.logError(`Cached model for ${fingerprint} produced no usable stats; rebuilding.`);
            return null;
        }
        return loaded;
    }

    /**
     * Ensure the ML worker holds a model trained on the CURRENT training set, doing the least
     * work that guarantees it. Resolution order: live session → persisted model cache → rebuild.
     *
     * `sessionFingerprint`/`sessionStats` and the model cache are committed ONLY when `cacheable`
     * (review round 1, CRITICAL): committing them unconditionally, before the coverage gate ran,
     * meant a degraded model (incomplete CLIP coverage, a file that failed extraction, or an
     * unreadable folder) got served as `source: 'session'` on the very next call — no rebuild, no
     * notification, indistinguishable from a healthy hit, even though the coverage-gate message
     * promises a rebuild "next sort." Not committing means a genuinely degraded environment
     * retrains every call; that is the accepted, honest cost (matches what the message says).
     */
    async ensureTrainedModel({ signal } = {}) {
        const miss = { source: 'skipped', stats: null, fingerprint: null, descriptor: null };
        const config = this.getConfig();
        if (!config.customLikeFolder || !config.customDislikeFolder) return miss;
        if (signal?.aborted) return miss;

        this.onProgress({ phase: 'Checking training set…' });
        const [likedResult, dislikedResult] = await Promise.all([
            this.loadFolder(config.customLikeFolder),
            this.loadFolder(config.customDislikeFolder),
        ]);
        if (signal?.aborted) return miss;

        // Important 5: a failed scan must never read as a silent "this folder is empty" -- that
        // honestly-recorded emptiness is exactly what let a one-class model train and get CACHED
        // under a fingerprint that lies about why the folder had no files. Logged/notified here,
        // BEFORE the empty-set early return below, so even a full skip is explained to the user.
        let scanFailed = false;
        if (!likedResult?.success) {
            scanFailed = true;
            this.logError(
                `Like-folder scan failed for ${config.customLikeFolder}: ${likedResult?.error || 'unknown error'}`
            );
            this.notify(`Could not read the like folder — training on partial data.`, 'warning');
        }
        if (!dislikedResult?.success) {
            scanFailed = true;
            this.logError(
                `Dislike-folder scan failed for ${config.customDislikeFolder}: ${dislikedResult?.error || 'unknown error'}`
            );
            this.notify(`Could not read the dislike folder — training on partial data.`, 'warning');
        }

        const likeFiles = likedResult?.success ? likedResult.files : [];
        const dislikeFiles = dislikedResult?.success ? dislikedResult.files : [];
        if (likeFiles.length === 0 && dislikeFiles.length === 0) return miss;

        // Cheap, synchronous metadata only -- a descriptor input, so it must be resolved before
        // the fingerprint. The expensive vector half (_collectBulkRatedVectors) is deferred past
        // both cache checks below (Important 4).
        const resolvedBulk = this._resolveBulkRatedFiles();
        const bulkPresent = resolvedBulk.map((r) => ({
            name: r.name,
            bucket: r.bucket,
            size: r.file.size,
            mtimeMs: r.file.mtimeMs,
        }));

        const descriptor = buildDescriptor({
            likeFolder: config.customLikeFolder,
            likeFiles,
            dislikeFolder: config.customDislikeFolder,
            dislikeFiles,
            bulkRated: bulkPresent,
            enableClipFeatures: config.enableClipFeatures,
            versions: config.versions,
        });
        const fingerprint = fingerprintDescriptor(descriptor);

        // Task 9 review, Important 1: mlModelVersion/featureVersion/trainingConfigVersion start
        // at 0 in media-viewer.js until their respective worker handshakes reply (initComplete /
        // the feature-worker version probe), and those replies are fire-and-forget -- so a sort
        // that runs before either lands computes a descriptor with some of these pinned to 0.
        // OnlineLogisticRegression.isCompatible (ml-model.js) validates only `version` and
        // `featureDim`; it does NOT check FEATURE_VERSION or TRAINING_CONFIG_VERSION, which makes
        // these two descriptor fields their SOLE invalidation mechanism. Treating an unsettled
        // {0,0,0} as a real value would let two sessions with genuinely different feature/
        // training-config versions collide on the same fingerprint (both pinned to 0) and
        // silently serve one's model against the other's inputs -- a stale model served as valid,
        // the exact failure class this cache exists to prevent, and not merely a wasted retrain.
        // All three real constants are >= 1 (ML_MODEL_VERSION=3, FEATURE_VERSION=2,
        // TRAINING_CONFIG_VERSION=1), so 0 is unambiguously "not yet reported," never a
        // legitimate value. Below, this gates the session hit, the cache READ (closing the read
        // side is what neutralises a sentinel-keyed entry already on disk -- waiting for the
        // handshake alone would not), and `cacheable` (so an unsettled session never WRITES a
        // sentinel-keyed entry either). The cost is one extra retrain in the racy case, the same
        // honest cost already accepted elsewhere here for incomplete CLIP coverage.
        const versionsKnown =
            descriptor.mlModelVersion > 0 && descriptor.featureVersion > 0 && descriptor.trainingConfigVersion > 0;

        if (versionsKnown && this.sessionFingerprint === fingerprint) {
            return { source: 'session', stats: this.sessionStats || null, fingerprint, descriptor };
        }

        if (versionsKnown) {
            const cached = await this._readCachedModel(fingerprint);
            if (cached && !signal?.aborted) {
                this.onProgress({ phase: 'Loading cached model…' });
                const loaded = await this._safeLoadModelState(cached.modelState, fingerprint);
                if (loaded) {
                    this.sessionFingerprint = fingerprint;
                    this.sessionStats = loaded.stats;
                    return { source: 'model-cache', stats: loaded.stats, fingerprint, descriptor };
                }
                // Malformed entry -- fall through to a rebuild instead of serving nothing.
            }
        }
        if (signal?.aborted) return miss;

        const likes = await this._collectFolderVectors(
            config.customLikeFolder,
            likeFiles,
            'Processing likes',
            config.enableClipFeatures,
            signal
        );
        if (likes.aborted || signal?.aborted) return miss;
        const dislikes = await this._collectFolderVectors(
            config.customDislikeFolder,
            dislikeFiles,
            'Processing dislikes',
            config.enableClipFeatures,
            signal
        );
        if (dislikes.aborted || signal?.aborted) return miss;

        // Only reached once both cache checks have missed -- the expensive half of the bulk-rated
        // contribution (Important 4).
        const bulk = await this._collectBulkRatedVectors(resolvedBulk, config.enableClipFeatures, signal);
        if (bulk.aborted || signal?.aborted) return miss;

        const likedFeatures = [...likes.rows, ...bulk.liked];
        const dislikedFeatures = [...dislikes.rows, ...bulk.disliked];
        if (likedFeatures.length === 0 && dislikedFeatures.length === 0) return miss;

        this.onProgress({ phase: 'Training model…' });
        const seed = seedFromFingerprint(fingerprint);
        const { stats, modelState } = await this.trainModel(likedFeatures, dislikedFeatures, seed);

        // A model trained with a zero CLIP half while CLIP is ON is a degraded model wearing a
        // CLIP-enabled fingerprint. Degraded operation stays supported; caching it does not, or
        // the next session serves it as if it were the real thing. All three sources of training
        // rows count toward coverage (design doc § 7.1). A caught extraction failure (Important 2)
        // and an unreadable folder (Important 5) are the same class of lie -- the fingerprint
        // still counts a file/folder the trained model never actually saw -- so they gate caching
        // exactly like incomplete CLIP coverage does.
        const clipMissing = likes.clipMissing + dislikes.clipMissing + bulk.clipMissing;
        const rowsFailed = likes.failed + dislikes.failed + bulk.failed;
        // versionsKnown: see the comment where it's computed above -- caching under an unsettled
        // {0,0,0}-pinned fingerprint would let a later, correctly-versioned session collide with
        // and load this one's stale weights.
        const cacheable =
            versionsKnown && !scanFailed && rowsFailed === 0 && !(config.enableClipFeatures && clipMissing > 0);

        if (cacheable) {
            this.sessionFingerprint = fingerprint;
            this.sessionStats = stats;
            await this._writeCachedModel(fingerprint, modelState, stats, {
                likeFolder: config.customLikeFolder,
                likeCount: likeFiles.length,
                dislikeFolder: config.customDislikeFolder,
                dislikeCount: dislikeFiles.length,
                bulkRatedCount: bulkPresent.length,
                enableClipFeatures: config.enableClipFeatures,
                versions: config.versions,
            });
        } else {
            if (config.enableClipFeatures && clipMissing > 0) {
                this.notify(
                    `Model trained without CLIP for ${clipMissing} file(s) — not cached; it will rebuild next sort.`,
                    'warning'
                );
            }
            if (rowsFailed > 0) {
                this.notify(
                    `Model trained but ${rowsFailed} file(s) failed to process — not cached; it will rebuild next sort.`,
                    'warning'
                );
            }
            // A failed folder scan was already logged/notified above, at detection time.
            // Task 9 review round 2 (folded-in minor): this is the one non-cacheable reason with
            // no user-facing notify -- by design, a single unsettled sort is transient and not
            // worth a toast. But it is ALSO the branch a permanently-degraded session falls into
            // forever (e.g. a feature-worker version probe that crashes and never recovers a real
            // version -- see media-viewer.js initializeFeaturePool), in which case EVERY sort
            // retrains and nothing is ever cached, silently. A log line is the only trace of that
            // condition existing at all.
            if (!versionsKnown) {
                this.logError(
                    `Model trained but not cached: worker-reported versions still unsettled ` +
                        `(mlModelVersion=${descriptor.mlModelVersion}, featureVersion=${descriptor.featureVersion}, ` +
                        `trainingConfigVersion=${descriptor.trainingConfigVersion}) — will retrain every sort until settled.`
                );
            }
        }

        return { source: 'trained', stats, fingerprint, descriptor };
    }

    /**
     * Escape hatch behind the Settings "Rebuild model" control.
     *
     * Returns `true` only when the on-disk store was actually replaced with an empty one --
     * `false` on a write failure. Task 9 review, Important 2: the caller (media-viewer.js) tells
     * the user "it will rebuild on the next AI sort," which is false whenever the disk clear
     * failed (the stale entry survives, and the next ensureTrainedModel call still hits it via
     * `_readCachedModel`, serving `'model-cache'` again with no rebuild) -- exactly when this
     * last-resort control matters most, since a user who was told it worked has no reason to
     * retry. A caller that ignores the return value keeps today's behavior; media-viewer.js's
     * handler uses it to show a warning instead of a false success.
     */
    async invalidateModelCache() {
        // Nulled unconditionally, before the write is even attempted: this is the session's
        // record of "what the live model was trained on," held only in memory, so forgetting it
        // can never itself fail. Forgetting it here -- even if the disk clear below fails -- means
        // the next lookup re-checks the fingerprint rather than trusting the in-memory model
        // forever; it does not, by itself, guarantee a stale disk entry stops being served (that
        // still depends on the write below actually succeeding), but leaving it set would also
        // suppress this method's *only* other effect on a failed write, compounding one silent
        // no-op into two.
        this.sessionFingerprint = null;
        try {
            const write = await this.modelCache.write({
                version: MlTrainingManager.MODEL_CACHE_VERSION,
                entries: [],
            });
            if (!write?.success) {
                this.logError(`ML model cache clear failed: ${write?.error || 'unknown error'}`);
                return false;
            }
            return true;
        } catch (err) {
            this.logError(`ML model cache clear failed: ${err.message}`);
            return false;
        }
    }
}
