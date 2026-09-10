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
            written.push(...entries);
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
});
