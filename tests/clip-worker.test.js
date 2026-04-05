import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Stub Web Worker globals before requiring
const origSelf = globalThis.self;
globalThis.self = { onmessage: null, postMessage: () => {} };

const { averageEmbeddings, CLIP_EMBEDDING_DIM, CLIP_MODEL_ID } = require('../clip-worker');

describe('clip-worker', () => {
    afterEach(() => {
        globalThis.self = origSelf;
    });

    describe('constants', () => {
        it('CLIP_EMBEDDING_DIM is 512', () => {
            expect(CLIP_EMBEDDING_DIM).toBe(512);
        });

        it('CLIP_MODEL_ID is Xenova/clip-vit-base-patch32', () => {
            expect(CLIP_MODEL_ID).toBe('Xenova/clip-vit-base-patch32');
        });
    });

    describe('averageEmbeddings', () => {
        it('returns null for empty array', () => {
            expect(averageEmbeddings([])).toBeNull();
        });

        it('returns the single embedding unchanged for single-element array', () => {
            const emb = new Float32Array(512);
            emb[0] = 0.5;
            emb[1] = 0.8;
            const result = averageEmbeddings([emb]);
            expect(result).toBe(emb); // Same reference
        });

        it('averages two embeddings and normalizes', () => {
            const emb1 = new Float32Array(512).fill(0);
            const emb2 = new Float32Array(512).fill(0);
            emb1[0] = 1.0;
            emb2[0] = 0.0;
            emb2[1] = 1.0;

            const result = averageEmbeddings([emb1, emb2]);

            expect(result[0]).toBeCloseTo(0.707, 2);
            expect(result[1]).toBeCloseTo(0.707, 2);
            expect(result[2]).toBeCloseTo(0, 5);
        });

        it('produces unit-length vector', () => {
            const emb1 = new Float32Array(512);
            const emb2 = new Float32Array(512);
            emb1[0] = 0.3;
            emb1[10] = 0.9;
            emb2[0] = 0.7;
            emb2[5] = 0.4;

            const result = averageEmbeddings([emb1, emb2]);

            let norm = 0;
            for (let i = 0; i < 512; i++) {
                norm += result[i] * result[i];
            }
            expect(Math.sqrt(norm)).toBeCloseTo(1.0, 4);
        });

        it('handles three embeddings', () => {
            const embs = [new Float32Array(512).fill(0), new Float32Array(512).fill(0), new Float32Array(512).fill(0)];
            embs[0][0] = 1.0;
            embs[1][0] = 1.0;
            embs[2][0] = 1.0;

            const result = averageEmbeddings(embs);

            expect(result[0]).toBeCloseTo(1.0, 4);
        });

        it('returns Float32Array of correct dimension', () => {
            const emb1 = new Float32Array(512).fill(0);
            const emb2 = new Float32Array(512).fill(0);
            emb1[0] = 1;
            emb2[0] = 1;

            const result = averageEmbeddings([emb1, emb2]);
            expect(result).toBeInstanceOf(Float32Array);
            expect(result.length).toBe(512);
        });
    });
});
