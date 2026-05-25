import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Integration tests: exercise the REAL call graph between applyCachedSortOrder
// and insertNewFilesInSortedOrder. The PR #33 algorithm-threading bug slipped
// through 7 unit tests because each test stubbed the boundary between these
// two methods. These tests use BOTH real methods to catch wiring bugs that
// leaf-tested unit tests miss.

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media-viewer.js'), 'utf-8');

// Duplicated from tests/media-viewer-utils.test.js — Vitest test files in this
// codebase don't share helpers via import (each file defines its own utilities).
// If a third test file needs this, extract to tests/helpers/extract-method.js.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractAsyncMethod(methodName) {
    const regex = new RegExp(`^\\s{4}async\\s+${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) {
        throw new Error(`Could not find async method: ${methodName}`);
    }

    const startIndex = match.index;
    let braceCount = 0;
    let methodEnd = -1;
    const searchStart = startIndex + match[0].length - 1;

    for (let i = searchStart; i < source.length; i++) {
        if (source[i] === '{') braceCount++;
        if (source[i] === '}') braceCount--;
        if (braceCount === 0) {
            methodEnd = i + 1;
            break;
        }
    }

    const methodBody = source.substring(searchStart + 1, methodEnd - 1);
    const params = match[1];
    return new AsyncFunction(params, methodBody);
}

const applyCachedSortOrder = extractAsyncMethod('applyCachedSortOrder');
const insertNewFilesInSortedOrder = extractAsyncMethod('insertNewFilesInSortedOrder');

describe('cache-hit sort path — algorithm threading (integration)', () => {
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                path: { basename: async (p) => p.split('/').pop() },
            },
        };
    });

    afterEach(() => {
        globalThis.window = origWindow;
    });

    function makeCtx(overrides = {}) {
        return {
            mediaFiles: [],
            clipCache: new Map(),
            perceptualHashes: new Map(),
            sortAbortController: null,
            // Real method bound onto ctx — applyCachedSortOrder calls
            // this.insertNewFilesInSortedOrder which dispatches here.
            insertNewFilesInSortedOrder,
            calculateHammingDistance(h1, h2) {
                if (!h1 || !h2 || h1.length !== h2.length) return Infinity;
                let d = 0;
                for (let i = 0; i < h1.length; i++) if (h1[i] !== h2[i]) d++;
                return d;
            },
            calculateCosineDistance(v1, v2) {
                if (!v1 || !v2 || v1.length !== v2.length) return 1;
                let dot = 0;
                for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
                return 1 - dot;
            },
            // computePerceptualHash should NOT be called when hash already cached
            // in tests below. A spy lets us assert that.
            computePerceptualHash: vi.fn(),
            updateProgressNotification: vi.fn(),
            ...overrides,
        };
    }

    it('CLIP cache entry routes through CLIP branch and uses cosine distance', async () => {
        // Setup: cached order [a, c] + 1 new file b; all three have CLIP vectors.
        // Expected: b inserted at index 0 (closest cosine to a).
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, b, c], // includes new file b
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/b.png', new Float32Array([0.99, 0.14, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
            ]),
        });

        const cachedData = {
            algorithm: 'clip',
            sortedPaths: ['a.png', 'c.png'], // b.png missing → treated as new
        };

        const stats = await applyCachedSortOrder.call(ctx, cachedData, 'clip');

        expect(stats).toEqual({ cached: 2, removed: 0, added: 1 });
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
        // Hash branch must NOT have been taken — no on-demand hash computation
        expect(ctx.computePerceptualHash).not.toHaveBeenCalled();
    });

    it('VPTree cache entry routes through hash branch and uses Hamming distance', async () => {
        // Setup: cached order [a, c] + 1 new file b; all three have perceptual hashes.
        // Expected: b inserted at index 0 (closest Hamming to a).
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, b, c],
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
            // clipCache deliberately empty — must not be consulted
        });

        const cachedData = {
            algorithm: 'vptree',
            sortedPaths: ['a.png', 'c.png'],
        };

        const stats = await applyCachedSortOrder.call(ctx, cachedData, 'vptree');

        expect(stats).toEqual({ cached: 2, removed: 0, added: 1 });
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
        // Hash already cached, no on-demand extraction expected
        expect(ctx.computePerceptualHash).not.toHaveBeenCalled();
    });

    it('old cache entry without algorithm field falls through to Hamming (pre-PR#33 format)', async () => {
        // Pre-PR#33 caches don't have an algorithm field. applyCachedSortOrder must
        // resolve algorithm = explicit-param ?? cachedData.algorithm and route safely.
        // Here we call with algorithm=undefined to force fallback to cachedData.algorithm,
        // which is ALSO undefined — must route to Hamming, not crash.
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, b, c],
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
        });

        const cachedData = {
            // No algorithm field — old format
            sortedPaths: ['a.png', 'c.png'],
        };

        const stats = await applyCachedSortOrder.call(ctx, cachedData, undefined);

        expect(stats).toEqual({ cached: 2, removed: 0, added: 1 });
        // Hash branch reached safely — b inserted at index 0 by Hamming distance
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
        expect(ctx.computePerceptualHash).not.toHaveBeenCalled();
    });
});
