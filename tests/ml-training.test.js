import { describe, it, expect } from 'vitest';
import { DESCRIPTOR_KEYS, buildDescriptor, fingerprintDescriptor, seedFromFingerprint } from '../ml-training.js';

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
