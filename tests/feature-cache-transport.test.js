import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { packFeatureChunk } = require('../feature-cache-transport');

describe('packFeatureChunk', () => {
    it('packs vectors into an n*64 f32 buffer and clip into n*512 with a mask', () => {
        const entries = [
            ['a.png', { vector: new Array(64).fill(0.5), clipVector: new Array(512).fill(0.25), size: 1, mtime: 2 }],
            ['b.png', { vector: new Array(64).fill(0.75), clipVector: null, size: 3, mtime: 4 }],
        ];
        const out = packFeatureChunk(entries);
        expect(out.names).toEqual(['a.png', 'b.png']);
        expect(out.sizes).toEqual([1, 3]);
        expect(out.mtimes).toEqual([2, 4]);
        expect(out.hasClip).toEqual([1, 0]);
        const vecs = new Float32Array(out.vecBuf);
        expect(vecs.length).toBe(2 * 64);
        expect(vecs[0]).toBeCloseTo(0.5);
        expect(vecs[64]).toBeCloseTo(0.75);
        const clips = new Float32Array(out.clipBuf);
        expect(clips[0]).toBeCloseTo(0.25);
    });
});
