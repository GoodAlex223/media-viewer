import { describe, it, expect, vi } from 'vitest';
import {
    DESCRIPTOR_KEYS,
    buildDescriptor,
    fingerprintDescriptor,
    seedFromFingerprint,
    MlTrainingManager,
} from '../ml-training.js';
import { createRequire } from 'module';

// feature-cache-transport.js is CommonJS (shared with main.js); createRequire lets this ESM
// test module load it directly instead of hand-rolling the transport shape it produces.
const require = createRequire(import.meta.url);
const { packFeatureChunk } = require('../feature-cache-transport.js');

// ---------------------------------------------------------------------------------------------
// Real-MediaViewer harness (house pattern — same shape as tests/media-viewer-utils.test.js and
// tests/ml-pair-selection.test.js: read the source, extract a method body by brace-counting, and
// invoke it against a mock `this`). Needed here for the ISOLATION test only: § 4.1's rule is a
// property of MANAGER + HOST COLLABORATOR, and asserting it against a `vi.fn()` computeFeatures
// is structurally incapable of failing — which is exactly how the real violation shipped green.
const nodeFs = require('fs');
const nodePath = require('path');
const viewerSource = nodeFs.readFileSync(nodePath.join(__dirname, '..', 'media-viewer.js'), 'utf-8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractAsyncMethod(methodName) {
    const regex = new RegExp(`^\\s{4}async\\s+${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = viewerSource.match(regex);
    if (!match) throw new Error(`Could not find async method: ${methodName}`);
    const searchStart = match.index + match[0].length - 1; // position of the opening {
    let braceCount = 0;
    let methodEnd = -1;
    for (let i = searchStart; i < viewerSource.length; i++) {
        if (viewerSource[i] === '{') braceCount++;
        if (viewerSource[i] === '}') braceCount--;
        if (braceCount === 0) {
            methodEnd = i + 1;
            break;
        }
    }
    return new AsyncFunction(match[1], viewerSource.substring(searchStart + 1, methodEnd - 1));
}

/**
 * The `computeFeatures:` callback MediaViewer's constructor injects into MlTrainingManager, read
 * from media-viewer.js rather than re-typed here — so if a future edit drops the isolation flag
 * from that one line, the isolation test below fails instead of silently re-passing against a
 * re-typed copy of what the test author wished the line said.
 *
 * The arrow captures `this` lexically from the wrapper, so `.call(host)` binds it to the host ctx
 * exactly as `new MediaViewer()` would.
 */
function injectedComputeFeaturesCallback(host) {
    const m = viewerSource.match(/^\s+computeFeatures: (\(.*\) =>.*),$/m);
    if (!m) throw new Error("Could not find the constructor's injected computeFeatures callback");
    return new Function(`return ${m[1]};`).call(host);
}

/**
 * Minimal renderer globals for the REAL `computeFeatures` image path: a `window` (its
 * `FaceDetector` probe runs for every image), a `document` whose canvas hands back a 256x256
 * ImageData stand-in, an `Image` whose `src` setter fires `load`, and the `extractFeatures`
 * global that feature-extractor.js provides via a script tag in the renderer.
 *
 * Returns `{ restore, calls }`. `calls` is the sentinel: the isolation assertion below is a
 * "nothing was written" shape, which a computeFeatures that silently failed to run would also
 * satisfy, so the test asserts the real extraction body was reached the expected number of times.
 */
function installRendererGlobals() {
    const saved = {
        window: globalThis.window,
        document: globalThis.document,
        Image: globalThis.Image,
        extractFeatures: globalThis.extractFeatures,
    };
    const calls = [];
    globalThis.window = { electronAPI: {} }; // no FaceDetector, no probeVideo
    globalThis.document = {
        createElement: () => ({
            width: 0,
            height: 0,
            getContext: () => ({
                drawImage: () => {},
                putImageData: () => {},
                getImageData: () => ({ width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) }),
            }),
        }),
    };
    globalThis.Image = class FakeImage {
        constructor() {
            this._listeners = {};
            this.naturalWidth = 256;
            this.naturalHeight = 256;
        }
        addEventListener(type, fn) {
            (this._listeners[type] ||= []).push(fn);
        }
        set src(value) {
            this._src = value;
            queueMicrotask(() => (this._listeners.load || []).forEach((fn) => fn()));
        }
        get src() {
            return this._src;
        }
    };
    globalThis.extractFeatures = (imageData, metadata) => {
        calls.push({ imageData, metadata });
        return new Float32Array(64).fill(0.7);
    };
    return {
        calls,
        restore: () => {
            for (const [k, v] of Object.entries(saved)) {
                if (v === undefined) delete globalThis[k];
                else globalThis[k] = v;
            }
        },
    };
}

const baseInput = () => ({
    likeFolder: '/likes',
    likeFiles: [
        { name: 'a.jpg', size: 100, mtimeMs: 1000 },
        { name: 'b.jpg', size: 200, mtimeMs: 2000 },
    ],
    dislikeFolder: '/dislikes',
    dislikeFiles: [{ name: 'c.jpg', size: 300, mtimeMs: 3000 }],
    bulkRated: [{ name: 'd.jpg', bucket: 'good', size: 400, mtimeMs: 4000 }],
    enableClipFeatures: true,
    versions: { mlModelVersion: 3, featureCacheVersion: 4, featureVersion: 2, trainingConfigVersion: 1 },
});

// One case per declared input. A new descriptor key without a row here fails the
// completeness test below -- the control that stops an unfingerprinted input reaching
// training and silently serving a stale model.
const MUTATIONS = {
    likeFolder: (i) => (i.likeFolder = '/other-likes'),
    likeFiles: (i) => (i.likeFiles[0].size = 101),
    dislikeFolder: (i) => (i.dislikeFolder = '/other-dislikes'),
    dislikeFiles: (i) => (i.dislikeFiles[0].mtimeMs = 3001),
    bulkRated: (i) => (i.bulkRated[0].bucket = 'bad'),
    enableClipFeatures: (i) => (i.enableClipFeatures = false),
    mlModelVersion: (i) => (i.versions.mlModelVersion = 4),
    featureCacheVersion: (i) => (i.versions.featureCacheVersion = 5),
    featureVersion: (i) => (i.versions.featureVersion = 3),
    trainingConfigVersion: (i) => (i.versions.trainingConfigVersion = 2),
};

describe('training-set descriptor', () => {
    it('declares exactly the keys the mutation table covers', () => {
        expect([...DESCRIPTOR_KEYS].sort()).toEqual(Object.keys(MUTATIONS).sort());
    });

    it('produces only declared keys', () => {
        const d = buildDescriptor(baseInput());
        expect(Object.keys(d).sort()).toEqual([...DESCRIPTOR_KEYS].sort());
    });

    it('is insensitive to file ordering', () => {
        const a = baseInput();
        const b = baseInput();
        b.likeFiles.reverse();
        expect(fingerprintDescriptor(buildDescriptor(a))).toBe(fingerprintDescriptor(buildDescriptor(b)));
    });

    it('ignores fields that do not affect training', () => {
        const a = baseInput();
        const b = baseInput();
        b.likeFiles[0].path = '/somewhere/else/a.jpg';
        b.likeFiles[0].type = 'image/png';
        expect(fingerprintDescriptor(buildDescriptor(a))).toBe(fingerprintDescriptor(buildDescriptor(b)));
    });
});

describe('fingerprint', () => {
    it('is stable for identical input', () => {
        expect(fingerprintDescriptor(buildDescriptor(baseInput()))).toBe(
            fingerprintDescriptor(buildDescriptor(baseInput()))
        );
    });

    it('is 32 lowercase hex characters', () => {
        expect(fingerprintDescriptor(buildDescriptor(baseInput()))).toMatch(/^[0-9a-f]{32}$/);
    });

    for (const [key, mutate] of Object.entries(MUTATIONS)) {
        it(`changes when ${key} changes`, () => {
            const before = fingerprintDescriptor(buildDescriptor(baseInput()));
            const mutated = baseInput();
            mutate(mutated);
            expect(fingerprintDescriptor(buildDescriptor(mutated))).not.toBe(before);
        });
    }

    it('distinguishes an added file from a removed one', () => {
        const withExtra = baseInput();
        withExtra.likeFiles.push({ name: 'z.jpg', size: 500, mtimeMs: 5000 });
        expect(fingerprintDescriptor(buildDescriptor(withExtra))).not.toBe(
            fingerprintDescriptor(buildDescriptor(baseInput()))
        );
    });
});

describe('seedFromFingerprint', () => {
    it('is a stable uint32 for a given fingerprint', () => {
        const fp = fingerprintDescriptor(buildDescriptor(baseInput()));
        const seed = seedFromFingerprint(fp);
        expect(Number.isInteger(seed)).toBe(true);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(0xffffffff);
        expect(seedFromFingerprint(fp)).toBe(seed);
    });
});

// makeCacheIo mocks the main-process streaming feature-cache transport (main.js:467-590,
// preload.js:18-25). Its `chunk` reply is built by calling the REAL packFeatureChunk (see
// feature-cache-transport.js) over `pairs`, not by hand-rolling the packed shape -- that makes
// the mock structurally incapable of drifting from main.js: if the transport shape ever changes,
// these tests fail instead of silently agreeing with a stale assumption. `pairs` are
// [filename, { vector, clipVector, size, mtime }], matching what feature-cache-write-chunk
// destructures and what feature-cache-chunk packs. There is no `success` field on a chunk reply.
// `writeChunk` mirrors the real handler's own destructuring (main.js:547
// `for (const [key, value] of entries)`) rather than a lenient spread, so a flat-object batch
// throws "is not iterable" here exactly as it would in production, instead of only being
// caught incidentally by a later shape assertion on `written`.
function makeCacheIo(pairs = [], version = 4) {
    const written = [];
    return {
        written,
        acquireLock: vi.fn().mockResolvedValue(() => {}),
        open: vi.fn().mockResolvedValue({ success: true, version, count: pairs.length }),
        chunk: vi
            .fn()
            .mockImplementation(async (offset, limit) => packFeatureChunk(pairs.slice(offset, offset + limit))),
        close: vi.fn().mockResolvedValue({ success: true }),
        writeOpen: vi.fn().mockResolvedValue({ success: true }),
        writeChunk: vi.fn().mockImplementation(async (entries) => {
            for (const [key, value] of entries) written.push([key, value]);
            return { success: true };
        }),
        writeClose: vi.fn().mockResolvedValue({ success: true }),
    };
}

const managerWith = (overrides = {}) =>
    new MlTrainingManager({
        loadFolder: vi.fn(),
        computeFeatures: vi.fn(),
        extractClipEmbedding: vi.fn(),
        trainModel: vi.fn(),
        loadModelState: vi.fn(),
        // Must return a real config: _loadVectorCache reads .versions.featureCacheVersion off it
        // to decide the version-mismatch gate, and a bare vi.fn() (which returns undefined) skips
        // that gate rather than exercising it.
        getConfig: vi.fn(() => ({ enableClipFeatures: true, versions: { featureCacheVersion: 4 } })),
        getBulkRatedContext: vi.fn(),
        cacheIo: makeCacheIo(),
        modelCache: { read: vi.fn(), write: vi.fn() },
        onProgress: vi.fn(),
        logError: vi.fn(),
        notify: vi.fn(),
        ...overrides,
    });

// One on-disk-shaped [filename, entry] pair -- the same shape main.js's writer/reader use.
const entry = (name, size, mtimeMs) => [
    name,
    {
        vector: Array.from({ length: 64 }, () => 0.5),
        clipVector: Array.from({ length: 512 }, () => 0.25),
        size,
        mtime: mtimeMs,
    },
];

describe('training-vector cache', () => {
    it('loads entries whose size and mtime still match the folder scan', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries, diskCount } = await m._loadVectorCache('/likes', [
            { name: 'a.jpg', size: 100, mtimeMs: 1000 },
        ]);
        expect(entries.size).toBe(1);
        expect(entries.get('a.jpg').feature.length).toBe(64);
        expect(entries.get('a.jpg').clip.length).toBe(512);
        expect(diskCount).toBe(1);
    });

    it('rejects an entry whose size changed', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 999, mtimeMs: 1000 }]);
        expect(entries.size).toBe(0);
    });

    it('rejects an entry whose mtime changed', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 9999 }]);
        expect(entries.size).toBe(0);
    });

    it('prunes an entry whose file is no longer in the folder', async () => {
        const io = makeCacheIo([entry('gone.jpg', 100, 1000)]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 1000 }]);
        expect(entries.size).toBe(0);
    });

    it('invalidates the whole cache on a version mismatch', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)], 3);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 1000 }]);
        expect(entries.size).toBe(0);
    });

    it('keeps a CLIP-less entry loadable but marks it for re-extraction', async () => {
        const e = entry('a.jpg', 100, 1000);
        e[1].clipVector = null;
        const io = makeCacheIo([e]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [{ name: 'a.jpg', size: 100, mtimeMs: 1000 }]);
        expect(entries.get('a.jpg').clip).toBeNull();
    });

    // Real on-disk caches predate the binary transport and can still surface via this shape
    // (main.js's feature-cache-chunk falls back to it when there is no active streaming session).
    it('loads entries from the legacy { entries: [[filename, entry]] } chunk shape', async () => {
        const io = makeCacheIo([entry('a.jpg', 100, 1000)]);
        io.chunk = vi.fn().mockResolvedValue({
            entries: [
                [
                    'a.jpg',
                    {
                        vector: Array.from({ length: 64 }, () => 0.5),
                        clipVector: Array.from({ length: 512 }, () => 0.25),
                        size: 100,
                        mtime: 1000,
                    },
                ],
            ],
        });
        const m = managerWith({ cacheIo: io });
        const { entries, diskCount } = await m._loadVectorCache('/likes', [
            { name: 'a.jpg', size: 100, mtimeMs: 1000 },
        ]);
        expect(entries.size).toBe(1);
        expect(entries.get('a.jpg').feature.length).toBe(64);
        expect(entries.get('a.jpg').clip.length).toBe(512);
        expect(diskCount).toBe(1);
    });

    // With n=1 (every test above), slice(i*64, ...) is indistinguishable from slice(0, ...) and
    // hasClip[i] from hasClip[0] -- the exact stride arithmetic this task exists to get right is
    // never exercised at i > 0. A 2-entry chunk with distinct per-entry values (and one entry
    // WITHOUT clip) makes a stride/mask bug fail loudly instead of agreeing with a single-entry test.
    it('preserves per-entry stride and the CLIP mask across a multi-entry chunk', async () => {
        const a = entry('a.jpg', 100, 1000); // feature 0.5, clip present (from the shared helper)
        const b = entry('b.jpg', 200, 2000);
        b[1].vector = Array.from({ length: 64 }, () => 0.75);
        b[1].clipVector = null;
        const io = makeCacheIo([a, b]);
        const m = managerWith({ cacheIo: io });
        const { entries } = await m._loadVectorCache('/likes', [
            { name: 'a.jpg', size: 100, mtimeMs: 1000 },
            { name: 'b.jpg', size: 200, mtimeMs: 2000 },
        ]);
        expect(entries.get('a.jpg').feature[0]).toBeCloseTo(0.5);
        expect(entries.get('b.jpg').feature[0]).toBeCloseTo(0.75);
        expect(entries.get('a.jpg').clip).not.toBeNull();
        expect(entries.get('a.jpg').clip.length).toBe(512);
        expect(entries.get('b.jpg').clip).toBeNull();
    });

    it('reports aborted:true for a cancelled load, keeping diskCount at the full on-disk count', async () => {
        // .length is all `open` reads off this; `chunk` is overridden below, so its contents
        // (or lack thereof) don't matter. A count > CHUNK_SIZE forces a second loop iteration,
        // which is where the `signal?.aborted` check actually gets a chance to fire.
        const io = makeCacheIo(new Array(600).fill(null));
        const controller = new AbortController();
        io.chunk = vi.fn().mockImplementation(async () => {
            controller.abort(); // takes effect on the loop's NEXT iteration check, not this one
            return packFeatureChunk([entry('a.jpg', 100, 1000)]);
        });
        const m = managerWith({ cacheIo: io });
        const { entries, diskCount, aborted } = await m._loadVectorCache(
            '/likes',
            [{ name: 'a.jpg', size: 100, mtimeMs: 1000 }],
            controller.signal
        );
        expect(aborted).toBe(true);
        expect(diskCount).toBe(600);
        // The chunk already in flight when the abort landed was still ingested -- `entries` is
        // PARTIAL, which is exactly why callers must check `aborted` rather than infer it.
        expect(entries.size).toBe(1);
    });
});

describe('training-vector cache save', () => {
    const built = (name, size, mtimeMs) => [
        name,
        {
            feature: new Float32Array(64).fill(0.5),
            clip: new Float32Array(512).fill(0.25),
            size,
            mtimeMs,
        },
    ];

    it('writes entries through the streaming writer', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        const ok = await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 0);
        expect(ok).toBe(true);
        expect(io.written).toHaveLength(1);
        // feature-cache-write-chunk destructures each element as a [key, value] pair
        // (main.js:547) -- a flat {name, ...} object would throw "is not iterable".
        expect(io.written[0][0]).toBe('a.jpg');
        expect(io.written[0][1].size).toBe(100);
    });

    it('never writes an entry with an unresolvable size or mtime', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        await m._saveVectorCache('/likes', new Map([built('a.jpg', 0, 1000), built('b.jpg', 100, 1000)]), 0);
        expect(io.written.map((e) => e[0])).toEqual(['b.jpg']);
    });

    it('writes clipVector: null rather than zeros when CLIP was unavailable', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        const [name, value] = built('a.jpg', 100, 1000);
        value.clip = null;
        await m._saveVectorCache('/likes', new Map([[name, value]]), 0);
        expect(io.written[0][1].clipVector).toBeNull();
    });

    it('refuses to overwrite a populated cache with a drastically smaller one', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        const ok = await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 1000);
        expect(ok).toBe(false);
        expect(io.written).toHaveLength(0);
    });

    it('keeps each folder shrink guard independent', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        // /likes legitimately shrank to 1 from a baseline of 1; /dislikes has a 1000 baseline.
        expect(await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 1)).toBe(true);
        expect(await m._saveVectorCache('/dislikes', new Map([built('b.jpg', 100, 1000)]), 1000)).toBe(false);
    });

    const buildMany = (n, size = 100, mtimeMs = 1000) =>
        new Map(Array.from({ length: n }, (_, i) => built(`f${i}.jpg`, size, mtimeMs)));

    it('allows a genuine shrink when the live folder scan is also small', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        // 100 entries vs a 1000-entry disk baseline looks like a rejected/partial load in
        // isolation -- but a live scan of only 100 files means nothing was actually rejected;
        // the folder itself shrank. The third guard conjunct must let this one through.
        const ok = await m._saveVectorCache('/likes', buildMany(100), 1000, 100);
        expect(ok).toBe(true);
    });

    it('still refuses when the live folder scan is large (partial/rejected load, not a real shrink)', async () => {
        const io = makeCacheIo();
        const m = managerWith({ cacheIo: io });
        const ok = await m._saveVectorCache('/likes', buildMany(100), 1000, 5000);
        expect(ok).toBe(false);
    });

    it('returns false and logs, without closing the writer, when a write-chunk reply reports failure', async () => {
        const io = makeCacheIo();
        io.writeChunk = vi.fn().mockResolvedValue({ success: false, error: 'disk full' });
        const m = managerWith({ cacheIo: io });
        const ok = await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 0);
        expect(ok).toBe(false);
        expect(m.logError).toHaveBeenCalled();
        // writeClose() is NOT an abort: feature-cache-write-close atomically renames the
        // (truncated) temp file over the live cache. The catch must log and stop -- calling it
        // here would commit a truncated cache over a good one.
        expect(io.writeClose).not.toHaveBeenCalled();
    });

    it('returns false and logs when the write-close reply reports failure', async () => {
        const io = makeCacheIo();
        io.writeClose = vi.fn().mockResolvedValue({ success: false, error: 'rename failed' });
        const m = managerWith({ cacheIo: io });
        const ok = await m._saveVectorCache('/likes', new Map([built('a.jpg', 100, 1000)]), 0);
        expect(ok).toBe(false);
        expect(m.logError).toHaveBeenCalled();
    });
});

describe('model cache', () => {
    const makeModelCache = (initial = null) => {
        let store = initial;
        return {
            read: vi.fn(async () => ({ success: true, store })),
            write: vi.fn(async (s) => {
                store = s;
                return { success: true };
            }),
            get current() {
                return store;
            },
        };
    };

    it('returns null on an empty cache', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        expect(await m._readCachedModel('abc')).toBeNull();
    });

    it('returns the entry whose fingerprint matches', async () => {
        const mc = makeModelCache({
            version: 1,
            entries: [{ fingerprint: 'abc', modelState: { weights: [1] }, stats: { isReady: true }, savedAt: 1 }],
        });
        const m = managerWith({ modelCache: mc });
        const hit = await m._readCachedModel('abc');
        expect(hit.modelState.weights).toEqual([1]);
    });

    it('returns null for a non-matching fingerprint', async () => {
        const mc = makeModelCache({
            version: 1,
            entries: [{ fingerprint: 'abc', modelState: { weights: [1] }, stats: {}, savedAt: 1 }],
        });
        const m = managerWith({ modelCache: mc });
        expect(await m._readCachedModel('zzz')).toBeNull();
    });

    it('ignores a store written by a future version', async () => {
        const mc = makeModelCache({ version: 99, entries: [{ fingerprint: 'abc', modelState: {}, stats: {} }] });
        const m = managerWith({ modelCache: mc });
        expect(await m._readCachedModel('abc')).toBeNull();
    });

    it('writes newest first and evicts past the limit', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        for (let i = 0; i < MlTrainingManager.MODEL_CACHE_LIMIT + 2; i++) {
            await m._writeCachedModel(`fp${i}`, { weights: [i] }, { isReady: true }, { likeFiles: i });
        }
        expect(mc.current.entries).toHaveLength(MlTrainingManager.MODEL_CACHE_LIMIT);
        expect(mc.current.entries[0].fingerprint).toBe(`fp${MlTrainingManager.MODEL_CACHE_LIMIT + 1}`);
        expect(mc.current.entries.some((e) => e.fingerprint === 'fp0')).toBe(false);
    });

    it('replaces an existing fingerprint rather than duplicating it', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        await m._writeCachedModel('same', { weights: [1] }, {}, {});
        await m._writeCachedModel('same', { weights: [2] }, {}, {});
        expect(mc.current.entries).toHaveLength(1);
        expect(mc.current.entries[0].modelState.weights).toEqual([2]);
    });

    it('persists the descriptor summary so a wrong hit is diagnosable', async () => {
        const mc = makeModelCache();
        const m = managerWith({ modelCache: mc });
        await m._writeCachedModel('fp', { weights: [1] }, {}, { likeFolder: '/likes', likeCount: 12 });
        expect(mc.current.entries[0].descriptorSummary).toEqual({ likeFolder: '/likes', likeCount: 12 });
    });

    it('a write failure is logged, not thrown', async () => {
        const logError = vi.fn();
        const mc = {
            read: vi.fn(async () => ({ success: true, store: null })),
            write: vi.fn(async () => ({ success: false, error: 'EACCES' })),
        };
        const m = managerWith({ modelCache: mc, logError });
        await expect(m._writeCachedModel('fp', {}, {}, {})).resolves.toBeUndefined();
        expect(logError).toHaveBeenCalled();
    });

    it('invalidateModelCache empties the store and the session fingerprint', async () => {
        const mc = makeModelCache({ version: 1, entries: [{ fingerprint: 'abc', modelState: {}, stats: {} }] });
        const m = managerWith({ modelCache: mc });
        m.sessionFingerprint = 'abc';
        await m.invalidateModelCache();
        expect(mc.current.entries).toEqual([]);
        expect(m.sessionFingerprint).toBeNull();
    });

    it('logs when invalidateModelCache resolves a graceful write failure, rather than swallowing it', async () => {
        const logError = vi.fn();
        const mc = {
            read: vi.fn(async () => ({ success: true, store: null })),
            write: vi.fn(async () => ({ success: false, error: 'EACCES' })),
        };
        const m = managerWith({ modelCache: mc, logError });
        await m.invalidateModelCache();
        expect(logError).toHaveBeenCalled();
    });

    // Task 9 review, Important 2: the caller (media-viewer.js's Settings "Rebuild model" handler)
    // tells the user "it will rebuild on the next AI sort" -- which is false whenever the disk
    // clear failed, since the stale entry then survives and the next ensureTrainedModel call
    // still serves it as 'model-cache'. The return value is what lets the caller distinguish the
    // two cases instead of announcing success unconditionally.
    it('invalidateModelCache resolves true on a successful write', async () => {
        const mc = makeModelCache({ version: 1, entries: [{ fingerprint: 'abc', modelState: {}, stats: {} }] });
        const m = managerWith({ modelCache: mc });
        await expect(m.invalidateModelCache()).resolves.toBe(true);
    });

    it('invalidateModelCache resolves false when the write reports failure', async () => {
        const mc = {
            read: vi.fn(async () => ({ success: true, store: null })),
            write: vi.fn(async () => ({ success: false, error: 'EACCES' })),
        };
        const m = managerWith({ modelCache: mc });
        await expect(m.invalidateModelCache()).resolves.toBe(false);
    });

    it('invalidateModelCache resolves false when the write throws', async () => {
        const mc = {
            read: vi.fn(async () => ({ success: true, store: null })),
            write: vi.fn(async () => {
                throw new Error('disk full');
            }),
        };
        const m = managerWith({ modelCache: mc });
        await expect(m.invalidateModelCache()).resolves.toBe(false);
    });
});

// Direct, low-level tests for the bulk-rated vector-extraction phase, mirroring how
// _loadVectorCache/_saveVectorCache are tested directly above. Needed because, at the
// ensureTrainedModel level, the outer `if (bulk.aborted || signal?.aborted) return miss;` check
// masks whether `_collectBulkRatedVectors`'s OWN `aborted` flag is set correctly -- a black-box
// call through ensureTrainedModel cannot discriminate that on its own.
describe('_collectBulkRatedVectors (direct)', () => {
    const resolvedOf = (file = { path: '/src/b1.jpg', size: 1, mtimeMs: 1 }) => [
        { name: 'b1.jpg', bucket: 'good', file },
    ];

    // Important 3 (review round 1): the folder collector re-extracts on `needsClip`, which is what
    // makes a degraded run temporary. This collector's only trigger was `if (!feature)` -- a
    // bulk-rated file whose 64-dim feature is warm but whose CLIP half is absent from clipCache
    // took clip=null, counted as missing, and was NEVER retried. The gate then fired on every
    // single sort until the host's background extraction happened to fill clipCache on its own.
    it('re-extracts when the feature is cached but the CLIP half is missing, with CLIP on', async () => {
        const warmFeature = new Float32Array(64).fill(0.5);
        const computeFeatures = vi.fn(async () => new Float32Array(64).fill(0.9));
        const extractClipEmbedding = vi.fn(async () => new Float32Array(512).fill(0.25));
        const m = managerWith({
            computeFeatures,
            extractClipEmbedding,
            getBulkRatedContext: vi.fn(() => ({
                featureCache: new Map([['/src/b1.jpg', warmFeature]]),
                clipCache: new Map(), // feature is warm; CLIP half was never filled in
            })),
        });
        const result = await m._collectBulkRatedVectors(resolvedOf(), true, undefined);
        expect(extractClipEmbedding).toHaveBeenCalledWith('/src/b1.jpg');
        expect(computeFeatures).not.toHaveBeenCalled(); // the warm feature must be reused, not redone
        expect(result.clipMissing).toBe(0);
        expect(result.liked).toHaveLength(1);
    });

    it('does not re-extract when the feature and CLIP half are both already cached', async () => {
        const computeFeatures = vi.fn();
        const extractClipEmbedding = vi.fn();
        const m = managerWith({
            computeFeatures,
            extractClipEmbedding,
            getBulkRatedContext: vi.fn(() => ({
                featureCache: new Map([['/src/b1.jpg', new Float32Array(64).fill(0.5)]]),
                clipCache: new Map([['/src/b1.jpg', new Float32Array(512).fill(0.25)]]),
            })),
        });
        const result = await m._collectBulkRatedVectors(resolvedOf(), true, undefined);
        expect(computeFeatures).not.toHaveBeenCalled();
        expect(extractClipEmbedding).not.toHaveBeenCalled();
        expect(result.liked).toHaveLength(1);
    });

    it('does not re-extract a missing CLIP half when CLIP features are off', async () => {
        const computeFeatures = vi.fn();
        const extractClipEmbedding = vi.fn();
        const m = managerWith({
            computeFeatures,
            extractClipEmbedding,
            getBulkRatedContext: vi.fn(() => ({
                featureCache: new Map([['/src/b1.jpg', new Float32Array(64).fill(0.5)]]),
                clipCache: new Map(),
            })),
        });
        const result = await m._collectBulkRatedVectors(resolvedOf(), false, undefined);
        expect(computeFeatures).not.toHaveBeenCalled();
        expect(extractClipEmbedding).not.toHaveBeenCalled();
        expect(result.liked).toHaveLength(1);
    });

    // Minor 3 (review round 1): no `aborted` flag was returned at all, unlike the folder collector
    // -- safe only because ensureTrainedModel separately re-checks signal?.aborted. Returning it
    // directly is tested here, not through ensureTrainedModel, because the outer check would mask
    // whether this flag is actually set.
    it('reports aborted:true when the signal trips mid-loop', async () => {
        const controller = new AbortController();
        let calls = 0;
        const m = managerWith({
            computeFeatures: vi.fn(async () => new Float32Array(64)),
            extractClipEmbedding: vi.fn(async () => {
                calls++;
                if (calls === 1) controller.abort();
                return new Float32Array(512);
            }),
            getBulkRatedContext: vi.fn(() => ({ featureCache: new Map(), clipCache: new Map() })),
        });
        const twoResolved = [
            { name: 'b1.jpg', bucket: 'good', file: { path: '/src/b1.jpg', size: 1, mtimeMs: 1 } },
            { name: 'b2.jpg', bucket: 'good', file: { path: '/src/b2.jpg', size: 2, mtimeMs: 2 } },
        ];
        const result = await m._collectBulkRatedVectors(twoResolved, true, controller.signal);
        expect(result.aborted).toBe(true);
        expect(result.liked).toHaveLength(1); // the loop stopped before the second entry
    });

    // Review round 2, item 1: mirrors _collectFolderVectors's `failed` tracking, added at the
    // same call site the Important-4 split broke (see the ensureTrainedModel-level test).
    it('reports failed and excludes the row when extraction throws', async () => {
        const m = managerWith({
            computeFeatures: vi.fn(async () => {
                throw new Error('decode failed');
            }),
            getBulkRatedContext: vi.fn(() => ({ featureCache: new Map(), clipCache: new Map() })),
        });
        const result = await m._collectBulkRatedVectors(resolvedOf(), true, undefined);
        expect(result.failed).toBe(1);
        expect(result.liked).toHaveLength(0);
    });

    // Relocated from the deleted renderer method collectBulkRatedTrainingExamples's test suite
    // (G1 task 6): "splits cached combined features into liked/disliked by bucket" — the direct
    // tests above only ever exercise a 'good' bucket entry, so none of them actually prove a 'bad'
    // one lands in `disliked` rather than `liked`.
    it('splits resolved entries into liked/disliked by bucket', async () => {
        const m = managerWith({
            getBulkRatedContext: vi.fn(() => ({
                featureCache: new Map([
                    ['/src/b1.jpg', new Float32Array(64).fill(0.5)],
                    ['/src/b2.jpg', new Float32Array(64).fill(0.6)],
                ]),
                clipCache: new Map([
                    ['/src/b1.jpg', new Float32Array(512).fill(0.1)],
                    ['/src/b2.jpg', new Float32Array(512).fill(0.2)],
                ]),
            })),
        });
        const resolved = [
            { name: 'b1.jpg', bucket: 'good', file: { path: '/src/b1.jpg', size: 1, mtimeMs: 1 } },
            { name: 'b2.jpg', bucket: 'bad', file: { path: '/src/b2.jpg', size: 2, mtimeMs: 2 } },
        ];
        const result = await m._collectBulkRatedVectors(resolved, true, undefined);
        // Content-identifying, not just a length check (G1 task 6 review round 1, Important 3):
        // b1 (bucket 'good', feature filled 0.5) and b2 (bucket 'bad', feature filled 0.6) are
        // distinguishable fixtures specifically so this can prove which row landed in which
        // array. Two toHaveLength(1) checks pass identically even if the
        // `bucket === 'good' ? liked : disliked` ternary were inverted — nothing else in this
        // file exercises a 'bad' bucket entry through the actual routing (the only other 'bad'
        // usage is a fingerprint mutation-table entry, which proves the descriptor changes, not
        // where the row lands).
        expect(result.liked).toHaveLength(1);
        expect(result.disliked).toHaveLength(1);
        expect(result.liked[0][0]).toBeCloseTo(0.5);
        expect(result.disliked[0][0]).toBeCloseTo(0.6);
    });

    // Relocated: collectBulkRatedTrainingExamples's "computes 576-dim features when the cache
    // misses". The direct tests above only cover a PARTIAL miss (feature warm, CLIP absent); none
    // exercise a file absent from both featureCache and clipCache, which is what actually proves
    // _combine produces a full 576-dim row from computeFeatures + extractClipEmbedding.
    it('computes a full 576-dim row via computeFeatures + extractClipEmbedding on a total cache miss', async () => {
        const m = managerWith({
            computeFeatures: vi.fn(async () => new Float32Array(64).fill(0.5)),
            extractClipEmbedding: vi.fn(async () => new Float32Array(512).fill(0.1)),
            getBulkRatedContext: vi.fn(() => ({ featureCache: new Map(), clipCache: new Map() })),
        });
        const result = await m._collectBulkRatedVectors(resolvedOf(), true, undefined);
        expect(result.liked).toHaveLength(1);
        expect(result.liked[0]).toHaveLength(576);
    });

    // Relocated: collectBulkRatedTrainingExamples's "reports corrective ratings through the sort
    // card so the phase is not silent". ensureTrainedModel's own progress test only checks
    // `.toContain` for the likes/dislikes/training phases with an EMPTY bulkRated, so it never
    // actually exercises this phase string or its per-entry current/total sequence.
    it('reports progress through onProgress for each resolved entry', async () => {
        const m = managerWith({
            getBulkRatedContext: vi.fn(() => ({
                featureCache: new Map([
                    ['/src/b1.jpg', new Float32Array(64)],
                    ['/src/b2.jpg', new Float32Array(64)],
                ]),
                clipCache: new Map([
                    ['/src/b1.jpg', new Float32Array(512)],
                    ['/src/b2.jpg', new Float32Array(512)],
                ]),
            })),
        });
        const resolved = [
            { name: 'b1.jpg', bucket: 'good', file: { path: '/src/b1.jpg', size: 1, mtimeMs: 1 } },
            { name: 'b2.jpg', bucket: 'bad', file: { path: '/src/b2.jpg', size: 2, mtimeMs: 2 } },
        ];
        await m._collectBulkRatedVectors(resolved, true, undefined);
        expect(m.onProgress.mock.calls.map(([a]) => a)).toEqual([
            { phase: 'Processing corrective ratings', current: 1, total: 2 },
            { phase: 'Processing corrective ratings', current: 2, total: 2 },
        ]);
    });
});

// Relocated from the deleted renderer method trainFromHistoricalRatings's test suite (G1 task 6):
// "reports every liked/disliked file through the cancelable sort card, starting at file 1".
// ensureTrainedModel's own progress test only checks `.toContain('Processing likes')` /
// `.toContain('Processing dislikes')`, which would still pass even if only every 10th file were
// reported — the exact per-file sequence is what actually proves that property. _collectFolderVectors
// is phase-agnostic (the phase string is a parameter), so one direct test covers both callers;
// ensureTrainedModel's `.toContain` test already proves the CALLER passes the right phase name.
describe('_collectFolderVectors (direct)', () => {
    it('reports every file through onProgress, starting at 1 (not just every Nth)', async () => {
        const m = managerWith({
            computeFeatures: vi.fn(async () => new Float32Array(64)),
            extractClipEmbedding: vi.fn(async () => new Float32Array(512)),
        });
        const files = [
            { name: 'a.png', path: '/l/a.png', size: 1, mtimeMs: 1 },
            { name: 'b.png', path: '/l/b.png', size: 2, mtimeMs: 2 },
            { name: 'c.png', path: '/l/c.png', size: 3, mtimeMs: 3 },
        ];
        // Full 6-arg shape. `loadPhase` was inserted BETWEEN `phase` and `enableClipFeatures`
        // when the vector-load progress phase landed, and this call was not updated with it --
        // it bound `loadPhase = true` and `enableClipFeatures = undefined`, and stayed green only
        // because makeCacheIo()'s default reports count:0 (so the load reporter is never built)
        // and this scenario has no cache hits (so the `needsClip` branch it silently disabled was
        // unreachable here anyway). The toEqual below doubles as the control for that first half:
        // with a real label passed, an unguarded load-phase emission would break it.
        await m._collectFolderVectors('/l', files, 'Processing likes', 'Loading cached likes', true, undefined);
        expect(m.onProgress.mock.calls.map(([a]) => a)).toEqual([
            { phase: 'Processing likes', current: 1, total: 3 },
            { phase: 'Processing likes', current: 2, total: 3 },
            { phase: 'Processing likes', current: 3, total: 3 },
        ]);
    });
});

describe('ensureTrainedModel', () => {
    const versions = { mlModelVersion: 3, featureCacheVersion: 4, featureVersion: 2, trainingConfigVersion: 1 };

    const scenario = (over = {}) => {
        const likeFiles = over.likeFiles || [
            { name: 'l1.jpg', path: '/likes/l1.jpg', size: 10, mtimeMs: 1 },
            { name: 'l2.jpg', path: '/likes/l2.jpg', size: 11, mtimeMs: 2 },
            { name: 'l3.jpg', path: '/likes/l3.jpg', size: 12, mtimeMs: 3 },
        ];
        const dislikeFiles = over.dislikeFiles || [
            { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
            { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
            { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
        ];
        const modelCacheStore = { value: over.store ?? null };
        const m = managerWith({
            loadFolder: vi.fn(async (p) => ({
                success: true,
                files: p === '/likes' ? likeFiles : dislikeFiles,
            })),
            computeFeatures: vi.fn(async () => new Float32Array(64).fill(0.5)),
            extractClipEmbedding: over.extractClipEmbedding || vi.fn(async () => new Float32Array(512).fill(0.25)),
            trainModel: vi.fn(async () => ({
                stats: { isReady: true, positiveCount: 3, negativeCount: 3 },
                modelState: { weights: [1] },
            })),
            loadModelState: vi.fn(async () => ({ stats: { isReady: true, positiveCount: 3, negativeCount: 3 } })),
            getConfig: vi.fn(() => ({
                customLikeFolder: '/likes',
                customDislikeFolder: '/dislikes',
                enableClipFeatures: over.enableClipFeatures ?? true,
                versions,
            })),
            getBulkRatedContext: vi.fn(() => ({
                bulkRated: over.bulkRated || new Map(),
                mediaFiles: over.mediaFiles || [],
                featureCache: new Map(),
                clipCache: new Map(),
            })),
            cacheIo: over.cacheIo || makeCacheIo(),
            modelCache: {
                read: vi.fn(async () => ({ success: true, store: modelCacheStore.value })),
                write: vi.fn(async (s) => {
                    modelCacheStore.value = s;
                    return { success: true };
                }),
            },
            ...(over.managerOverrides || {}),
        });
        return { m, modelCacheStore };
    };

    it('trains when nothing is cached', async () => {
        const { m } = scenario();
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(res.stats.isReady).toBe(true);
        expect(m.trainModel).toHaveBeenCalledTimes(1);
    });

    it('returns source "session" on a repeat call with an unchanged training set', async () => {
        // bulkRated is non-empty so this test can actually discriminate Important-4's fix: with an
        // EMPTY bulk set (the scenario default), the buggy pre-fix code's unconditional bulk-vector
        // pass is a no-op loop either way and this assertion would pass against broken code too.
        const { m } = scenario({
            bulkRated: new Map([['b1.jpg', 'good']]),
            mediaFiles: [{ name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 }],
        });
        await m.ensureTrainedModel({});
        m.computeFeatures.mockClear();
        m.extractClipEmbedding.mockClear();
        m.cacheIo.open.mockClear();
        const second = await m.ensureTrainedModel({});
        expect(second.source).toBe('session');
        expect(m.trainModel).toHaveBeenCalledTimes(1);
        // The "free repeat sort" claim: a session hit must do NO vector work at all, folder or
        // bulk-rated -- not even a cache-file open.
        expect(m.computeFeatures).not.toHaveBeenCalled();
        expect(m.extractClipEmbedding).not.toHaveBeenCalled();
        expect(m.cacheIo.open).not.toHaveBeenCalled();
    });

    it('retrains when the like folder changes', async () => {
        const { m } = scenario();
        await m.ensureTrainedModel({});
        m.getConfig.mockReturnValue({
            customLikeFolder: '/likes',
            customDislikeFolder: '/dislikes',
            enableClipFeatures: true,
            versions,
        });
        m.loadFolder.mockImplementation(async (p) => ({
            success: true,
            files:
                p === '/likes'
                    ? [
                          { name: 'l1.jpg', path: '/likes/l1.jpg', size: 10, mtimeMs: 1 },
                          { name: 'l2.jpg', path: '/likes/l2.jpg', size: 11, mtimeMs: 2 },
                          { name: 'l3.jpg', path: '/likes/l3.jpg', size: 12, mtimeMs: 3 },
                          { name: 'NEW.jpg', path: '/likes/NEW.jpg', size: 99, mtimeMs: 99 },
                      ]
                    : [
                          { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
                          { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
                          { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
                      ],
        }));
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(m.trainModel).toHaveBeenCalledTimes(2);
    });

    it('loads from the model cache in a fresh session instead of training', async () => {
        // Non-empty bulkRated for the same reason as the session-hit test above: it is the only
        // way this test can discriminate the pre-Important-4 bug, where bulk vector extraction ran
        // unconditionally before the model-cache check even looked at the fingerprint.
        const bulkOverrides = {
            bulkRated: new Map([['b1.jpg', 'good']]),
            mediaFiles: [{ name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 }],
        };
        const { m: first, modelCacheStore } = scenario(bulkOverrides);
        await first.ensureTrainedModel({});

        const { m: second } = scenario({ ...bulkOverrides, store: modelCacheStore.value });
        const res = await second.ensureTrainedModel({});
        expect(res.source).toBe('model-cache');
        expect(second.trainModel).not.toHaveBeenCalled();
        expect(second.loadModelState).toHaveBeenCalledTimes(1);
        // A model-cache hit is the other "cheap tier" -- it must never touch a vector, folder or
        // bulk-rated, or open a folder's cache file.
        expect(second.computeFeatures).not.toHaveBeenCalled();
        expect(second.extractClipEmbedding).not.toHaveBeenCalled();
        expect(second.cacheIo.open).not.toHaveBeenCalled();
    });

    // Task 9 review, Important 1: mlModelVersion/featureVersion/trainingConfigVersion start at 0
    // in media-viewer.js until their respective worker handshakes reply (initComplete / the
    // feature-worker version probe), and those replies are fire-and-forget -- so a sort that runs
    // before either lands computes a descriptor with some of these pinned to 0.
    // OnlineLogisticRegression.isCompatible (ml-model.js) validates only `version` and
    // `featureDim`; it does NOT check FEATURE_VERSION or TRAINING_CONFIG_VERSION, which makes
    // featureVersion/trainingConfigVersion those two fields' SOLE invalidation mechanism. Treating
    // an unsettled {0,0,0} as a real value would let two sessions with genuinely different
    // feature/training-config versions collide on the same fingerprint and silently serve one's
    // model against the other's inputs -- a stale model served as valid, not merely a wasted
    // retrain.
    describe('version gate (unsettled worker-reported versions)', () => {
        const zeroVersions = { mlModelVersion: 0, featureCacheVersion: 4, featureVersion: 0, trainingConfigVersion: 0 };
        const zeroVersionsConfig = () => ({
            customLikeFolder: '/likes',
            customDislikeFolder: '/dislikes',
            enableClipFeatures: true,
            versions: zeroVersions,
        });

        it('does not report "session" on a repeat call while a version is still unsettled', async () => {
            const { m } = scenario({ managerOverrides: { getConfig: vi.fn(zeroVersionsConfig) } });
            const first = await m.ensureTrainedModel({});
            const second = await m.ensureTrainedModel({});
            expect(first.source).toBe('trained');
            // NOT 'session' -- an unsettled session must retrain every call, not just the first.
            expect(second.source).toBe('trained');
            expect(m.trainModel).toHaveBeenCalledTimes(2);
        });

        it('does not cache a "trained" result while a version is still unsettled', async () => {
            const { m, modelCacheStore } = scenario({ managerOverrides: { getConfig: vi.fn(zeroVersionsConfig) } });
            await m.ensureTrainedModel({});
            expect(m.modelCache.write).not.toHaveBeenCalled();
            expect(modelCacheStore.value).toBeNull();
        });

        // Task 9 review round 2 (folded-in minor): this is the ONE non-cacheable reason with no
        // user-facing notify (a single unsettled sort is transient, not worth a toast) -- but it
        // is also the branch a permanently-degraded session (e.g. a feature-worker version probe
        // that crashes and never recovers) falls into FOREVER, retraining on every sort with
        // nothing ever cached. A logError call is the only trace that condition leaves anywhere.
        it('logs when a "trained" result goes uncached because a version is still unsettled', async () => {
            const logError = vi.fn();
            const { m } = scenario({ managerOverrides: { getConfig: vi.fn(zeroVersionsConfig), logError } });
            await m.ensureTrainedModel({});
            expect(logError).toHaveBeenCalledWith(expect.stringMatching(/unsettled/i));
        });

        // Simulates an entry already sitting on a user's disk under a fingerprint whose worker-
        // reported versions were all 0 when it was written (e.g. from before this gate existed,
        // or -- pre-fix -- from a prior racy 'trained' call that cached itself). This is what
        // makes the READ-side gate necessary on its own: awaiting the handshake before the NEXT
        // call does not retroactively invalidate an entry a PAST call already wrote.
        it('does not serve a pre-existing entry cached under an unsettled-versions fingerprint', async () => {
            const staleDescriptor = buildDescriptor({
                likeFolder: '/likes',
                likeFiles: [
                    { name: 'l1.jpg', size: 10, mtimeMs: 1 },
                    { name: 'l2.jpg', size: 11, mtimeMs: 2 },
                    { name: 'l3.jpg', size: 12, mtimeMs: 3 },
                ],
                dislikeFolder: '/dislikes',
                dislikeFiles: [
                    { name: 'd1.jpg', size: 20, mtimeMs: 4 },
                    { name: 'd2.jpg', size: 21, mtimeMs: 5 },
                    { name: 'd3.jpg', size: 22, mtimeMs: 6 },
                ],
                bulkRated: [],
                enableClipFeatures: true,
                versions: zeroVersions,
            });
            const staleStore = {
                version: 1,
                entries: [
                    {
                        fingerprint: fingerprintDescriptor(staleDescriptor),
                        modelState: { weights: ['stale'] },
                        stats: { isReady: true, positiveCount: 99, negativeCount: 99 },
                    },
                ],
            };
            const loadModelState = vi.fn(async () => ({
                stats: { isReady: true, positiveCount: 99, negativeCount: 99 },
            }));
            const { m } = scenario({
                store: staleStore,
                managerOverrides: { getConfig: vi.fn(zeroVersionsConfig), loadModelState },
            });

            const res = await m.ensureTrainedModel({});

            expect(res.source).toBe('trained'); // NOT 'model-cache' -- the stale entry is ignored
            expect(loadModelState).not.toHaveBeenCalled();
            expect(m.trainModel).toHaveBeenCalledTimes(1);
        });
    });

    // Correction 4: _readCachedModel validates the STORE's version but not an individual entry's
    // internal shape. A rejecting loadModelState (corrupt/incompatible modelState) must fall
    // through to a rebuild rather than escaping ensureTrainedModel as an unhandled rejection.
    // Design doc § 7.2: "Model-cache read failure or malformed entry | Treated as a miss."
    it('falls through to a rebuild when the cached model load rejects', async () => {
        const { m: first, modelCacheStore } = scenario();
        await first.ensureTrainedModel({});

        const { m: second } = scenario({
            store: modelCacheStore.value,
            managerOverrides: {
                loadModelState: vi.fn(async () => {
                    throw new Error('corrupt modelState');
                }),
            },
        });
        const res = await second.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(second.trainModel).toHaveBeenCalledTimes(1);
    });

    // Same rule, the other malformed shape: loadModelState resolves normally but with no usable
    // stats (e.g. a future/foreign modelState shape it silently no-ops on).
    it('falls through to a rebuild when the cached model load resolves without usable stats', async () => {
        const { m: first, modelCacheStore } = scenario();
        await first.ensureTrainedModel({});

        const { m: second } = scenario({
            store: modelCacheStore.value,
            managerOverrides: {
                loadModelState: vi.fn(async () => ({})),
            },
        });
        const res = await second.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(second.trainModel).toHaveBeenCalledTimes(1);
    });

    // Final whole-branch review, IMPORTANT 2. ml-worker.js's `initializeModel` falls through to
    // `new OnlineLogisticRegression(DEFAULT_FEATURE_DIM)` whenever the saved model is unusable and
    // STILL replies `initComplete` with valid-shaped stats, flagging `modelWasReset: true`. Before
    // this, `_runWorkerInit` dropped that flag and `_safeLoadModelState`'s only malformation check
    // was `!loaded?.stats` — an empty model's stats object is truthy — so the manager committed
    // sessionFingerprint/sessionStats and returned `source: 'model-cache'` for a model that was
    // never loaded, wedging the session exactly like Critical 1.
    it('treats a worker-reported reset (modelWasReset) as a model-cache miss', async () => {
        const { m: first, modelCacheStore } = scenario();
        await first.ensureTrainedModel({});

        const { m: second } = scenario({
            store: modelCacheStore.value,
            managerOverrides: {
                loadModelState: vi.fn(async () => ({
                    // Valid-SHAPED stats from a freshly constructed, empty model.
                    stats: { isReady: false, positiveCount: 0, negativeCount: 0, totalSamples: 0 },
                    modelWasReset: true,
                })),
            },
        });
        const res = await second.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(second.trainModel).toHaveBeenCalledTimes(1);
        expect(second.sessionFingerprint).toBe(res.fingerprint); // rebuilt, not the phantom load
        expect(second.logError).toHaveBeenCalledWith(expect.stringMatching(/reset|rebuild/i));
    });

    // The gap `modelWasReset` alone does NOT close, measured against ml-worker.js: when
    // `savedModel` is truthy but `savedModel.weights` is absent, `initializeModel` never enters
    // the compatibility branch at all, so `modelWasReset` stays FALSE while a fresh empty model is
    // still created and replied with. The persisted `cached.stats` (written by _writeCachedModel
    // and, before this, read by nothing) is what catches it.
    it('treats stats that disagree with the persisted cache entry as a model-cache miss', async () => {
        const { m: first, modelCacheStore } = scenario();
        await first.ensureTrainedModel({});
        expect(modelCacheStore.value.entries[0].stats).toMatchObject({ positiveCount: 3, negativeCount: 3 });

        const { m: second } = scenario({
            store: modelCacheStore.value,
            managerOverrides: {
                loadModelState: vi.fn(async () => ({
                    stats: { isReady: false, positiveCount: 0, negativeCount: 0, totalSamples: 0 },
                    modelWasReset: false, // the worker genuinely did not consider this a "reset"
                })),
            },
        });
        const res = await second.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(second.trainModel).toHaveBeenCalledTimes(1);
    });

    // The guard must not fire on a legitimate hit. Explicitly includes a NOT-ready 2-like /
    // 5-dislike model: gating the verification on `stats.isReady` instead of on agreement with
    // the persisted entry would make that model rebuild forever.
    it('still serves a legitimate hit, including a cached model that is not yet isReady', async () => {
        const notReady = { isReady: false, positiveCount: 2, negativeCount: 5, totalSamples: 7 };
        const { m: first, modelCacheStore } = scenario({
            managerOverrides: {
                trainModel: vi.fn(async () => ({ stats: notReady, modelState: { weights: [1] } })),
            },
        });
        await first.ensureTrainedModel({});

        const { m: second } = scenario({
            store: modelCacheStore.value,
            managerOverrides: {
                loadModelState: vi.fn(async () => ({ stats: { ...notReady }, modelWasReset: false })),
            },
        });
        const res = await second.ensureTrainedModel({});
        expect(res.source).toBe('model-cache');
        expect(second.trainModel).not.toHaveBeenCalled();
    });

    // Final whole-branch review, the deferred BACKLOG item. The guard used `&&` on the two folder
    // file lists, so a one-sided training set ran a FULL scan + extraction pass and then cached a
    // model that can never satisfy isReady (positiveCount >= 3 && negativeCount >= 3), burning a
    // slot in the 5-entry cache on every sort until the empty folder is populated.
    //
    // The BACKLOG entry proposed changing `&&` to `||`. That is WRONG and the pair of tests below
    // is what pins it: the guard runs BEFORE _resolveBulkRatedFiles, so an empty dislike FOLDER
    // whose 'bad' class is supplied by bulk-rated corrections in the source folder is a
    // legitimate, currently-working configuration that `||` would silently disable. The guard has
    // to be over the CLASS's sources, not over one of its two sources.
    describe('one-sided training set', () => {
        it('skips before any extraction when a class has no source at all', async () => {
            const { m, modelCacheStore } = scenario({ dislikeFiles: [] });
            const res = await m.ensureTrainedModel({});
            expect(res.source).toBe('skipped');
            expect(m.trainModel).not.toHaveBeenCalled();
            expect(m.computeFeatures).not.toHaveBeenCalled(); // the whole extraction pass, avoided
            expect(m.cacheIo.open).not.toHaveBeenCalled();
            expect(modelCacheStore.value).toBeNull(); // no dead-end model in the 5-slot cache
        });

        it('skips when the LIKE side is the empty one', async () => {
            const { m } = scenario({ likeFiles: [] });
            const res = await m.ensureTrainedModel({});
            expect(res.source).toBe('skipped');
            expect(m.trainModel).not.toHaveBeenCalled();
        });

        // The configuration `||` would have broken. Bulk-rated 'bad' corrections live in the
        // SOURCE folder, never in the dislike folder, so they are the class's only source here.
        it('still trains with an empty dislike FOLDER when bulk-rated corrections supply that class', async () => {
            const { m } = scenario({
                dislikeFiles: [],
                bulkRated: new Map([
                    ['b1.jpg', 'bad'],
                    ['b2.jpg', 'bad'],
                ]),
                mediaFiles: [
                    { name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 },
                    { name: 'b2.jpg', path: '/src/b2.jpg', size: 31, mtimeMs: 8 },
                ],
            });
            const res = await m.ensureTrainedModel({});
            expect(res.source).toBe('trained');
            const [liked, disliked] = m.trainModel.mock.calls[0];
            expect(liked).toHaveLength(3);
            expect(disliked).toHaveLength(2);
        });

        // The guard is suppressed by a FAILED scan, deliberately: design doc § 7.2 rules that a
        // folder that will not scan is "Report; train on whatever is available", and a failed scan
        // is not evidence the class is empty. `cacheable` already excludes a failed scan, so the
        // dead-end-model-in-the-cache harm this guard exists to prevent cannot occur there anyway.
        it('does not suppress the § 7.2 partial-data path — a FAILED scan still trains', async () => {
            const { m, modelCacheStore } = scenario({
                managerOverrides: {
                    loadFolder: vi.fn(async (p) =>
                        p === '/likes'
                            ? { success: false, error: 'ENOENT' }
                            : {
                                  success: true,
                                  files: [{ name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 }],
                              }
                    ),
                },
            });
            const res = await m.ensureTrainedModel({});
            expect(res.source).toBe('trained');
            expect(modelCacheStore.value?.entries || []).toHaveLength(0); // reported, never cached
        });

        it('still trains with an empty LIKE folder when bulk-rated corrections supply that class', async () => {
            const { m } = scenario({
                likeFiles: [],
                bulkRated: new Map([['b1.jpg', 'good']]),
                mediaFiles: [{ name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 }],
            });
            const res = await m.ensureTrainedModel({});
            expect(res.source).toBe('trained');
            const [liked, disliked] = m.trainModel.mock.calls[0];
            expect(liked).toHaveLength(1);
            expect(disliked).toHaveLength(3);
        });
    });

    // Final whole-branch review, minor: `main.js`'s load-folder returns raw `fs.readdir` order,
    // `_collectFolderVectors` preserved it, and `trainBatch` shuffles an index array DERIVED from
    // that order — so the fingerprint seed alone did not make weights reproducible, and two runs
    // over an identical descriptor could produce different weights. That is a real hole in § 5.4's
    // "a cache hit is verifiable" claim (the cached model is supposed to be the model a rebuild
    // would produce). The descriptor already sorts; the rows now sort too.
    it('feeds training rows in a stable name order regardless of the scan order', async () => {
        const perName = (name) =>
            ({
                l1: 0.1,
                l2: 0.2,
                l3: 0.3,
                d1: 0.4,
                d2: 0.5,
                d3: 0.6,
                b1: 0.7,
                b2: 0.8,
            })[name.replace('.jpg', '')];
        const run = async (reverse) => {
            const like = [
                { name: 'l1.jpg', path: '/likes/l1.jpg', size: 10, mtimeMs: 1 },
                { name: 'l2.jpg', path: '/likes/l2.jpg', size: 11, mtimeMs: 2 },
                { name: 'l3.jpg', path: '/likes/l3.jpg', size: 12, mtimeMs: 3 },
            ];
            const dislike = [
                { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
                { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
                { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
            ];
            const bulkEntries = [
                ['b1.jpg', 'good'],
                ['b2.jpg', 'bad'],
            ];
            const { m } = scenario({
                likeFiles: reverse ? [...like].reverse() : like,
                dislikeFiles: reverse ? [...dislike].reverse() : dislike,
                bulkRated: new Map(reverse ? [...bulkEntries].reverse() : bulkEntries),
                mediaFiles: [
                    { name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 },
                    { name: 'b2.jpg', path: '/src/b2.jpg', size: 31, mtimeMs: 8 },
                ],
                managerOverrides: {
                    // A per-file marker so the row ORDER is observable in what trainModel receives.
                    computeFeatures: vi.fn(async (p) => new Float32Array(64).fill(perName(p.split('/').pop()))),
                },
            });
            const res = await m.ensureTrainedModel({});
            const [liked, disliked] = m.trainModel.mock.calls[0];
            return {
                fingerprint: res.fingerprint,
                liked: liked.map((r) => Math.round(r[0] * 10) / 10),
                disliked: disliked.map((r) => Math.round(r[0] * 10) / 10),
            };
        };

        const forward = await run(false);
        const backward = await run(true);
        expect(backward.fingerprint).toBe(forward.fingerprint); // same training set, by definition
        expect(backward.liked).toEqual(forward.liked);
        expect(backward.disliked).toEqual(forward.disliked);
        expect(forward.liked).toEqual([0.1, 0.2, 0.3, 0.7]); // folder rows sorted, then bulk-rated
        expect(forward.disliked).toEqual([0.4, 0.5, 0.6, 0.8]);
    });

    it('skips when a training folder is unset', async () => {
        const { m } = scenario();
        m.getConfig.mockReturnValue({
            customLikeFolder: '',
            customDislikeFolder: '/dislikes',
            enableClipFeatures: true,
            versions,
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('skipped');
        expect(m.trainModel).not.toHaveBeenCalled();
    });

    // Relocated from the deleted renderer method trainFromHistoricalRatings's test suite (G1 task
    // 6): "bails before loading historical folders when the signal is already aborted". Distinct
    // from the mid-extraction abort test below — this proves the PRE-flight `signal?.aborted`
    // check (before the folder scan even starts) actually short-circuits, not just that some
    // later check catches it.
    it('bails before loading folders when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const { m } = scenario();
        const res = await m.ensureTrainedModel({ signal: controller.signal });
        expect(res.source).toBe('skipped');
        expect(m.loadFolder).not.toHaveBeenCalled();
        expect(m.trainModel).not.toHaveBeenCalled();
    });

    it('does not send a training message when aborted mid-extraction', async () => {
        const controller = new AbortController();
        const { m } = scenario({
            extractClipEmbedding: vi.fn(async () => {
                controller.abort();
                return new Float32Array(512).fill(0.25);
            }),
        });
        const res = await m.ensureTrainedModel({ signal: controller.signal });
        expect(m.trainModel).not.toHaveBeenCalled();
        expect(res.source).toBe('skipped');
    });

    it('trains but does not cache when CLIP is on and coverage is incomplete', async () => {
        const { m, modelCacheStore } = scenario({ extractClipEmbedding: vi.fn(async () => null) });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(m.trainModel).toHaveBeenCalledTimes(1);
        expect(modelCacheStore.value?.entries || []).toHaveLength(0);
        expect(m.notify).toHaveBeenCalled();
    });

    // CRITICAL (review round 1): the CLIP gate protected the DISK cache but not the SESSION
    // cache. sessionFingerprint/sessionStats were committed unconditionally before the gate ran,
    // so a second call took the session branch and served the degraded model with source
    // 'session' -- no rebuild, no notification, indistinguishable from a healthy hit, even though
    // the user-facing message promises "it will rebuild next sort." A cold CLIP model makes every
    // file clipMissing, so this fires on literally the first sort of a session.
    it('retrains every call while CLIP coverage stays incomplete, never serving a degraded model from session', async () => {
        const { m } = scenario({ extractClipEmbedding: vi.fn(async () => null) });
        const first = await m.ensureTrainedModel({});
        const second = await m.ensureTrainedModel({});
        expect(first.source).toBe('trained');
        expect(second.source).toBe('trained'); // never 'session'
        expect(m.trainModel).toHaveBeenCalledTimes(2);
    });

    // Important 2 (review round 1): a file whose extraction THROWS drops no row and increments no
    // counter (the catch's `continue` skips both) -- so the fingerprint (built from the full folder
    // scan) still counts the file while the model that gets cached under it never saw the file's
    // vector. Next run, if the file extracts fine, the fingerprint is UNCHANGED (same name/size/
    // mtime) and the cache serves the model that never saw it. Permanently, until the folder
    // changes. Treating a caught failure like a CLIP-coverage gap (train, don't cache) closes it.
    it('trains but does not cache when a file throws during extraction', async () => {
        const { m, modelCacheStore } = scenario({
            managerOverrides: {
                computeFeatures: vi.fn(async (path) => {
                    if (path === '/likes/l2.jpg') throw new Error('decode failed');
                    return new Float32Array(64).fill(0.5);
                }),
            },
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(modelCacheStore.value?.entries || []).toHaveLength(0);
        expect(m.notify).toHaveBeenCalled();
        expect(m.logError).toHaveBeenCalled();
    });

    // Review round 2, item 1: the Important-4 split introduced this. Before the split, a bulk-
    // rated file's row push and its `present` entry sat in the SAME try block -- a throw skipped
    // both, so no mismatch was possible. After the split, _resolveBulkRatedFiles() resolves
    // membership from metadata alone (feeding the descriptor) BEFORE the vector pass runs, so a
    // file whose extraction throws is still counted in the fingerprint while its row is silently
    // dropped -- and `bulk.failed` didn't exist, so `rowsFailed` never saw it. The existing
    // folder-side throw fixture (targeting /likes/l2.jpg with an empty bulk set) cannot cover this.
    it('trains but does not cache when a bulk-rated file throws during extraction', async () => {
        const { m, modelCacheStore } = scenario({
            bulkRated: new Map([['b1.jpg', 'good']]),
            mediaFiles: [{ name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 }],
            managerOverrides: {
                computeFeatures: vi.fn(async (path) => {
                    if (path === '/src/b1.jpg') throw new Error('decode failed');
                    return new Float32Array(64).fill(0.5);
                }),
            },
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(modelCacheStore.value?.entries || []).toHaveLength(0);
        expect(m.notify).toHaveBeenCalled();
        expect(m.logError).toHaveBeenCalled();
    });

    // Spec gap A residual (review round 2): the warm-cache tests below all end with extracted===0,
    // so _saveVectorCache is never reached through the collector in the guard-relevant state
    // (diskCount>0, entries.size < diskCount*0.5) -- the granularity test's one save has
    // entries.size=4 against diskCount=6, where the second conjunct is already false. This is the
    // only scenario where scanCount (files.length) actually decides the outcome: a large diskCount
    // whose entries don't match any live file (so entries.size ends up small after a full re-
    // extract), while the live scan is ALSO small -- a genuine shrink, which the guard must let
    // through. Verified by mutation: fails if `files.length` is dropped from the call site inside
    // _collectFolderVectors (see fix report for the exact mutation and result).
    it('persists a genuine shrink reached through the collector, not refused by the guard', async () => {
        // 100 disk entries that match NONE of the live like/dislike files -- every one is pruned
        // on load, so entries.size starts at 0 and ends at each folder's own (small) file count
        // after a full re-extract, while diskCount stays 100.
        const ghostPairs = Array.from({ length: 100 }, (_, i) => entry(`ghost${i}.jpg`, 1, 1));
        const io = makeCacheIo(ghostPairs);
        const { m } = scenario({ cacheIo: io });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(io.writeOpen).toHaveBeenCalled();
        expect(io.written.length).toBeGreaterThan(0);
    });

    // Minor 2 (review round 1): a clip that is truthy but the WRONG length (e.g. a corrupt or
    // partially-written vector) must not silently pass every `!clip` truthiness check. Only a
    // real, CLIP_DIM-length vector counts as "has CLIP."
    it('treats a wrong-length CLIP vector as missing, not present', async () => {
        const { m, modelCacheStore } = scenario({
            extractClipEmbedding: vi.fn(async () => new Float32Array(10)), // truthy, wrong length
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(modelCacheStore.value?.entries || []).toHaveLength(0);
        expect(m.notify).toHaveBeenCalled();
    });

    // Minor 4 (review round 1): a re-extract attempt that STILL comes back without CLIP must not
    // count as "extracted" -- otherwise a persistently CLIP-less folder rewrites its entire vector
    // cache, byte-identical, on every single sort.
    it('does not rewrite the vector cache when a re-extract still comes back without CLIP', async () => {
        const seeded = [
            entry('l1.jpg', 10, 1),
            entry('l2.jpg', 11, 2),
            entry('l3.jpg', 12, 3),
            entry('d1.jpg', 20, 4),
            entry('d2.jpg', 21, 5),
            entry('d3.jpg', 22, 6),
        ];
        for (const [, value] of seeded) value.clipVector = null; // CLIP was unavailable when cached
        const io = makeCacheIo(seeded);
        const { m } = scenario({ cacheIo: io, extractClipEmbedding: vi.fn(async () => null) });
        await m.ensureTrainedModel({});
        expect(io.writeOpen).not.toHaveBeenCalled();
    });

    // Important 5 (review round 1): a failed folder scan reads as an EMPTY folder
    // (`success ? files : []`), so the descriptor honestly records "this folder is empty" and a
    // one-class model trains and gets CACHED under that fingerprint -- every later session with
    // the folder still unreachable (e.g. a disconnected drive) gets a cache hit on it. Design doc
    // § 7.2 requires "Report" for this row; nothing was logged or notified before this fix.
    it('trains but does not cache when a folder scan fails, and reports it', async () => {
        const { m, modelCacheStore } = scenario({
            managerOverrides: {
                loadFolder: vi.fn(async (p) =>
                    p === '/likes'
                        ? { success: false, error: 'ENOENT' }
                        : {
                              success: true,
                              files: [
                                  { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
                                  { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
                                  { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
                              ],
                          }
                ),
            },
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(modelCacheStore.value?.entries || []).toHaveLength(0);
        expect(m.notify).toHaveBeenCalled();
        expect(m.logError).toHaveBeenCalled();
    });

    it('logs and notifies for each folder scan failure even when the result is a skip', async () => {
        const { m } = scenario({
            managerOverrides: {
                loadFolder: vi.fn(async () => ({ success: false, error: 'ENOENT' })),
            },
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('skipped');
        expect(m.notify).toHaveBeenCalledTimes(2); // once per folder
        expect(m.logError).toHaveBeenCalledTimes(2);
    });

    // Spec gap A (review round 1): every scenario above uses an EMPTY vector cache (makeCacheIo()
    // default), so corrections 1-3's plumbing (files.length as scanCount, the aborted flag,
    // diskCount pass-through) and the feature's own headline retrain-skip claim are all invisible
    // to the suite. A WARM cache is required to exercise any of it.
    it('does not call computeFeatures or extractClipEmbedding for files already warm in the vector cache', async () => {
        const io = makeCacheIo([
            entry('l1.jpg', 10, 1),
            entry('l2.jpg', 11, 2),
            entry('l3.jpg', 12, 3),
            entry('d1.jpg', 20, 4),
            entry('d2.jpg', 21, 5),
            entry('d3.jpg', 22, 6),
        ]);
        const { m } = scenario({ cacheIo: io });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(m.computeFeatures).not.toHaveBeenCalled();
        expect(m.extractClipEmbedding).not.toHaveBeenCalled();
        expect(io.writeOpen).not.toHaveBeenCalled(); // nothing new to persist
    });

    it('never opens the vector-cache writer when the load itself was aborted', async () => {
        const io = makeCacheIo(new Array(600).fill(null));
        const controller = new AbortController();
        io.chunk = vi.fn().mockImplementation(async () => {
            controller.abort(); // takes effect on the loop's NEXT iteration check
            return packFeatureChunk([entry('l1.jpg', 10, 1)]);
        });
        const { m } = scenario({ cacheIo: io });
        const res = await m.ensureTrainedModel({ signal: controller.signal });
        expect(res.source).toBe('skipped');
        expect(io.writeOpen).not.toHaveBeenCalled();
        expect(m.trainModel).not.toHaveBeenCalled();
    });

    // Spec gap B (review round 1): design doc § 9.1 prescribes these two properties explicitly;
    // neither existed.
    // Design doc § 4.1, and the final whole-branch review's IMPORTANT 1. This test used to run
    // against a `vi.fn()` computeFeatures, which made it structurally incapable of failing: the
    // violation is entirely inside the HOST's real `computeFeatures`
    // (`this.featureCache.set(filePath, features)` with a like/dislike-folder path), so a mock
    // collaborator meant the suite was green while production wrote training-folder entries into
    // the source folder's map on every rebuild. It is re-pointed at the real method here, wired
    // through the same injected callback media-viewer.js's constructor actually installs.
    it('never writes a training-folder path into the host featureCache/clipCache/featureMetadata (isolation, real computeFeatures)', async () => {
        const globals = installRendererGlobals();
        try {
            // Pre-populate with an EXISTING source-folder entry so the assertion is a real
            // isolation check, not just "an empty Map stayed empty because nothing touched it."
            const hostFeatureCache = new Map([['/src/existing.jpg', new Float32Array(64)]]);
            const hostClipCache = new Map([['/src/existing.jpg', new Float32Array(512)]]);
            const hostFeatureMetadata = new Map([['/src/existing.jpg', { size: 1, mtime: 1 }]]);
            const host = {
                featureCache: hostFeatureCache,
                clipCache: hostClipCache,
                featureMetadata: hostFeatureMetadata,
                mediaFiles: [],
                isJxl: (p) => /\.jxl$/i.test(p),
            };
            host.computeFeatures = extractAsyncMethod('computeFeatures');

            const { m } = scenario({
                managerOverrides: {
                    computeFeatures: injectedComputeFeaturesCallback(host),
                    getBulkRatedContext: vi.fn(() => ({
                        bulkRated: new Map(),
                        mediaFiles: [],
                        featureCache: hostFeatureCache,
                        clipCache: hostClipCache,
                    })),
                },
            });
            const res = await m.ensureTrainedModel({});

            expect(res.source).toBe('trained');
            // Sentinel FIRST: prove the real extraction body actually ran for all six training
            // files. Without this, a computeFeatures that threw or short-circuited would produce
            // the same "nothing was written" pass this assertion is looking for.
            expect(globals.calls).toHaveLength(6);
            expect(m.trainModel).toHaveBeenCalledTimes(1);
            const [liked, disliked] = m.trainModel.mock.calls[0];
            expect(liked).toHaveLength(3);
            expect(disliked).toHaveLength(3);
            expect(liked[0].slice(0, 64)).toEqual(new Array(64).fill(0.699999988079071)); // real 0.7 f32 row

            // The property itself: not one training-folder path reached the source folder's maps.
            expect([...hostFeatureCache.keys()]).toEqual(['/src/existing.jpg']);
            expect([...hostClipCache.keys()]).toEqual(['/src/existing.jpg']);
            // featureMetadata has a second, independent guard (it is only written for a path
            // found in `mediaFiles`, which a training-folder path never is), so this assertion
            // is belt-and-braces rather than the load-bearing one.
            expect([...hostFeatureMetadata.keys()]).toEqual(['/src/existing.jpg']);
        } finally {
            globals.restore();
        }
    });

    // The other half of § 4.1's isolation rule, and the second cost the review traced: with the
    // host cache in play, `computeFeatures` short-circuits on `featureCache.has(filePath)` and
    // hands back a PRE-MODIFICATION vector for a training file the manager's own `size`/`mtime`
    // check just correctly rejected as stale — which is then stored under the NEW size/mtime,
    // persisted, and trained into a model cached under the new fingerprint. A durable stale-model
    // path, arriving through ambient state outside DESCRIPTOR_KEYS.
    it('re-extracts a stale training file instead of returning the host cache’s pre-modification vector', async () => {
        const globals = installRendererGlobals();
        try {
            const STALE = new Float32Array(64).fill(0.11);
            // The host cache is warm for a like-folder file whose size/mtime have since changed.
            const hostFeatureCache = new Map([['/likes/l1.jpg', STALE]]);
            const host = {
                featureCache: hostFeatureCache,
                clipCache: new Map(),
                featureMetadata: new Map(),
                mediaFiles: [],
                isJxl: () => false,
            };
            host.computeFeatures = extractAsyncMethod('computeFeatures');

            const { m } = scenario({
                managerOverrides: { computeFeatures: injectedComputeFeaturesCallback(host) },
            });
            await m.ensureTrainedModel({});

            const [liked] = m.trainModel.mock.calls[0];
            const l1 = liked.find((row) => Math.abs(row[0] - 0.11) < 1e-6);
            expect(l1, 'a stale host-cache vector reached the training rows').toBeUndefined();
            expect(globals.calls).toHaveLength(6); // every file genuinely extracted
        } finally {
            globals.restore();
        }
    });

    it('leaves every likes-folder entry a cache hit when only the dislikes folder changes (per-folder granularity)', async () => {
        const io = makeCacheIo([
            entry('l1.jpg', 10, 1),
            entry('l2.jpg', 11, 2),
            entry('l3.jpg', 12, 3),
            entry('d1.jpg', 20, 4),
            entry('d2.jpg', 21, 5),
            entry('d3.jpg', 22, 6),
        ]);
        const { m } = scenario({ cacheIo: io });
        await m.ensureTrainedModel({});
        expect(m.computeFeatures).not.toHaveBeenCalled(); // baseline: everything already warm

        m.loadFolder.mockImplementation(async (p) => ({
            success: true,
            files:
                p === '/likes'
                    ? [
                          { name: 'l1.jpg', path: '/likes/l1.jpg', size: 10, mtimeMs: 1 },
                          { name: 'l2.jpg', path: '/likes/l2.jpg', size: 11, mtimeMs: 2 },
                          { name: 'l3.jpg', path: '/likes/l3.jpg', size: 12, mtimeMs: 3 },
                      ]
                    : [
                          { name: 'd1.jpg', path: '/dislikes/d1.jpg', size: 20, mtimeMs: 4 },
                          { name: 'd2.jpg', path: '/dislikes/d2.jpg', size: 21, mtimeMs: 5 },
                          { name: 'd3.jpg', path: '/dislikes/d3.jpg', size: 22, mtimeMs: 6 },
                          { name: 'NEW.jpg', path: '/dislikes/NEW.jpg', size: 99, mtimeMs: 99 },
                      ],
        }));
        await m.ensureTrainedModel({});

        const extractedPaths = m.computeFeatures.mock.calls.map((c) => c[0]);
        expect(extractedPaths).toEqual(['/dislikes/NEW.jpg']);
    });

    it('caches normally when CLIP is off, since zero halves are then expected', async () => {
        const { m, modelCacheStore } = scenario({
            enableClipFeatures: false,
            extractClipEmbedding: vi.fn(async () => null),
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(modelCacheStore.value.entries).toHaveLength(1);
    });

    // Design doc § 7.1: clipCoverage is "the fraction of TRAINING VECTORS carrying a real CLIP
    // half" -- that includes the bulk-rated contribution, not just the two folder scans. Only the
    // bulk-rated file is missing its CLIP half here (the folder files all get a real vector), so
    // this fails unless the bulk collector's own coverage is counted toward the gate.
    it('does not cache when only a bulk-rated file is missing its CLIP half while CLIP is on', async () => {
        const { m, modelCacheStore } = scenario({
            bulkRated: new Map([['b1.jpg', 'good']]),
            mediaFiles: [{ name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 }],
            extractClipEmbedding: vi.fn(async (path) =>
                path === '/src/b1.jpg' ? null : new Float32Array(512).fill(0.25)
            ),
        });
        const res = await m.ensureTrainedModel({});
        expect(res.source).toBe('trained');
        expect(modelCacheStore.value?.entries || []).toHaveLength(0);
        expect(m.notify).toHaveBeenCalled();
    });

    it('reports progress through the injected sink', async () => {
        const { m } = scenario();
        await m.ensureTrainedModel({});
        const phases = m.onProgress.mock.calls.map((c) => c[0].phase);
        expect(phases).toContain('Processing likes');
        expect(phases).toContain('Processing dislikes');
        expect(phases).toContain('Training model…');
    });

    // Final whole-branch review, IMPORTANT 4 (reporting half). MlTrainingManager keeps no vectors
    // across calls, so every rebuild re-streams both training folders' .feature_cache.json in
    // full — and in the rate→sort workflow every sort IS a rebuild, because rating a file moves it
    // into a training folder and changes the descriptor. CLAUDE.md documents a comparable load as
    // ~40s for a 24k-entry cache, during which the card previously sat frozen on 'Checking
    // training set…' with no phase of its own (spec § 13 records the omission). Only the reporting
    // is fixed here; cross-call vector retention needs measurement first and is filed in BACKLOG.
    it('reports a determinate per-folder phase while streaming each training folder’s vector cache', async () => {
        const io = makeCacheIo([
            entry('l1.jpg', 10, 1),
            entry('l2.jpg', 11, 2),
            entry('l3.jpg', 12, 3),
            entry('d1.jpg', 20, 4),
            entry('d2.jpg', 21, 5),
            entry('d3.jpg', 22, 6),
        ]);
        const { m } = scenario({ cacheIo: io });
        await m.ensureTrainedModel({});

        const calls = m.onProgress.mock.calls.map(([a]) => a);
        const likeLoad = calls.filter((c) => c.phase === 'Loading cached likes');
        const dislikeLoad = calls.filter((c) => c.phase === 'Loading cached dislikes');
        expect(likeLoad.length).toBeGreaterThan(0);
        expect(dislikeLoad.length).toBeGreaterThan(0);
        // Determinate: computeSortProgressView needs a numeric current AND total > 0 to draw a bar.
        expect(likeLoad.every((c) => typeof c.current === 'number' && c.total === 6)).toBe(true);
        // And it must be reported BEFORE the per-file processing phase for that folder, which is
        // the whole point — the silent window is the load, not the loop after it.
        expect(calls.findIndex((c) => c.phase === 'Loading cached likes')).toBeLessThan(
            calls.findIndex((c) => c.phase === 'Processing likes')
        );
    });

    it('reports no vector-load phase when the folder has no on-disk cache to stream', async () => {
        const { m } = scenario(); // makeCacheIo() default: count 0
        await m.ensureTrainedModel({});
        const phases = m.onProgress.mock.calls.map(([a]) => a.phase);
        expect(phases).not.toContain('Loading cached likes');
    });

    // Relocated from the deleted renderer method trainFromHistoricalRatings's test suite (G1 task
    // 6): "announces the folder-load wait as an indeterminate card phase, not plain text" — the
    // phase string changed ('Loading historical ratings…' -> 'Checking training set…') but the
    // no-current/total indeterminate-mode property survives unchanged.
    it('announces the training-set check as an indeterminate progress call', async () => {
        const { m } = scenario();
        await m.ensureTrainedModel({});
        expect(m.onProgress.mock.calls.map(([a]) => a)).toContainEqual({ phase: 'Checking training set…' });
    });

    it('includes bulk-rated files still present in the source folder', async () => {
        const { m } = scenario({
            bulkRated: new Map([['b1.jpg', 'good']]),
            mediaFiles: [{ name: 'b1.jpg', path: '/src/b1.jpg', size: 30, mtimeMs: 7 }],
        });
        await m.ensureTrainedModel({});
        const [liked] = m.trainModel.mock.calls[0];
        expect(liked).toHaveLength(4); // 3 likes + 1 bulk-rated good
    });

    it('ignores a bulk-rated name whose file has left the source folder', async () => {
        const { m } = scenario({ bulkRated: new Map([['gone.jpg', 'good']]), mediaFiles: [] });
        await m.ensureTrainedModel({});
        const [liked] = m.trainModel.mock.calls[0];
        expect(liked).toHaveLength(3);
    });

    it('passes a fingerprint-derived seed so the rebuild is reproducible', async () => {
        const { m } = scenario();
        const res = await m.ensureTrainedModel({});
        const [, , seed] = m.trainModel.mock.calls[0];
        expect(seed).toBe(seedFromFingerprint(res.fingerprint));
    });
});
