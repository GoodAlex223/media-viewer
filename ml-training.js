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
