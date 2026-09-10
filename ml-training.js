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
     * Transport: feature-cache-chunk (main.js) returns packFeatureChunk's output --
     * { names, sizes, mtimes, hasClip, vecBuf, clipBuf } -- with NO `success` field, or the
     * legacy { entries: [[filename, entry]] } shape for a pre-binary on-disk cache. Mirrors
     * media-viewer.js _loadFeatureCacheLocked's `if (chunk.vecBuf) { ... } else { ... }` branch.
     */
    async _loadVectorCache(folderPath, files, signal) {
        const entries = new Map();
        if (!folderPath || !files || files.length === 0) return { entries, diskCount: 0 };

        const current = new Map(files.map((f) => [f.name, f]));
        const expectedVersion = this.getConfig?.().versions?.featureCacheVersion;

        const release = await this.cacheIo.acquireLock();
        let diskCount = 0;
        try {
            const opened = await this.cacheIo.open(this._cachePath(folderPath));
            if (!opened?.success) return { entries, diskCount: 0 };
            if (expectedVersion !== undefined && opened.version !== expectedVersion) {
                await this.cacheIo.close();
                return { entries, diskCount: 0 };
            }
            diskCount = opened.count || 0;

            for (let offset = 0; offset < diskCount; offset += CHUNK_SIZE) {
                if (signal?.aborted) break;
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
        return { entries, diskCount };
    }

    /**
     * Persist one training folder's vectors. Returns false when the shrink guard refused.
     * @param {number} diskCount entries last seen on disk FOR THIS FOLDER — the guard is
     *   per-cache, so a legitimately small like folder cannot be blocked by a large dislike one.
     *
     * Transport: feature-cache-write-chunk (main.js) destructures each element as a
     * [key, value] pair (`for (const [key, value] of entries)`) -- a flat {name, ...} object is
     * not iterable and throws. Mirrors media-viewer.js _saveFeatureCacheLocked's
     * `batch.push([filename, entry])`.
     */
    async _saveVectorCache(folderPath, entries, diskCount) {
        if (!folderPath || !entries || entries.size === 0) return false;

        // DATA-LOSS GUARD: never replace a substantially populated on-disk cache with a
        // drastically smaller in-memory one. Mirrors _saveFeatureCacheLocked; a real incident
        // overwrote a 23,559-entry cache with 32 entries.
        if (diskCount > 0 && entries.size < diskCount * 0.5) {
            this.logError(
                `Training-cache save SKIPPED (shrink guard) for ${folderPath}: ` +
                    `in-memory ${entries.size} entries vs ${diskCount} on disk.`
            );
            return false;
        }

        const release = await this.cacheIo.acquireLock();
        try {
            const version = this.getConfig?.().versions?.featureCacheVersion;
            const opened = await this.cacheIo.writeOpen(this._cachePath(folderPath), {
                version,
                featureDim: FEATURE_DIM,
                clipDim: CLIP_DIM,
            });
            if (!opened?.success) return false;

            let batch = [];
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
                if (batch.length >= CHUNK_SIZE) {
                    await this.cacheIo.writeChunk(batch);
                    batch = [];
                }
            }
            if (batch.length > 0) await this.cacheIo.writeChunk(batch);
            await this.cacheIo.writeClose();
            return true;
        } catch (err) {
            this.logError(`Training vector cache save failed for ${folderPath}: ${err.message}`);
            await this.cacheIo.writeClose().catch(() => {});
            return false;
        } finally {
            release();
        }
    }
}
