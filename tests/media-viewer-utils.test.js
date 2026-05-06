import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// MediaViewer methods are instance methods on an ES module class.
// We test them by extracting the method source and calling with mock `this` context.
// This avoids needing DOM, Electron, or the full class constructor.

// Read the source file and extract methods for testing
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// Extract method bodies using regex and create callable functions
function extractMethod(methodName) {
    // Match "methodName(params) {" pattern for class methods
    const regex = new RegExp(`^\\s{4}${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) {
        throw new Error(`Could not find method: ${methodName}`);
    }

    const startIndex = match.index;
    // Find matching closing brace by counting braces
    let braceCount = 0;
    let methodEnd = -1;
    const searchStart = startIndex + match[0].length - 1; // position of opening {

    for (let i = searchStart; i < source.length; i++) {
        if (source[i] === '{') {
            braceCount++;
        }
        if (source[i] === '}') {
            braceCount--;
        }
        if (braceCount === 0) {
            methodEnd = i + 1;
            break;
        }
    }

    const methodBody = source.substring(searchStart + 1, methodEnd - 1);
    const params = match[1];

    // Create a function with 'this' binding support
    return new Function(params, methodBody);
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractAsyncMethod(methodName) {
    // Match "async methodName(params) {" pattern for async class methods
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

const buildKeyString = extractMethod('buildKeyString');
const formatElapsed = extractMethod('formatElapsed');
const formatEta = extractMethod('formatEta');
const formatTimeAgo = extractMethod('formatTimeAgo');
const removeFileFromList = extractMethod('removeFileFromList');
const areFoldersConfigured = extractMethod('areFoldersConfigured');
const insertNewFilesInSortedOrder = extractAsyncMethod('insertNewFilesInSortedOrder');
const applyCachedSortOrder = extractAsyncMethod('applyCachedSortOrder');

describe('formatElapsed', () => {
    it('returns "?" for NaN', () => {
        expect(formatElapsed.call({}, NaN)).toBe('?');
    });

    it('returns "?" for Infinity', () => {
        expect(formatElapsed.call({}, Infinity)).toBe('?');
    });

    it('returns "?" for negative values', () => {
        expect(formatElapsed.call({}, -1)).toBe('?');
    });

    it('formats 0 seconds', () => {
        expect(formatElapsed.call({}, 0)).toBe('0s');
    });

    it('formats seconds only', () => {
        expect(formatElapsed.call({}, 30)).toBe('30s');
        expect(formatElapsed.call({}, 59)).toBe('59s');
    });

    it('formats exact minutes', () => {
        expect(formatElapsed.call({}, 60)).toBe('1m');
        expect(formatElapsed.call({}, 120)).toBe('2m');
    });

    it('formats minutes and seconds', () => {
        expect(formatElapsed.call({}, 61)).toBe('1m 1s');
        expect(formatElapsed.call({}, 90)).toBe('1m 30s');
    });

    it('formats exact hours', () => {
        expect(formatElapsed.call({}, 3600)).toBe('1h');
    });

    it('formats hours and minutes', () => {
        expect(formatElapsed.call({}, 3661)).toBe('1h 1m');
    });

    it('rounds 59.6 to 60 → "1m"', () => {
        expect(formatElapsed.call({}, 59.6)).toBe('1m');
    });
});

describe('formatEta', () => {
    it('prefixes with ~', () => {
        // formatEta calls this.formatElapsed, so we need both methods on the context
        const ctx = { formatElapsed };
        expect(formatEta.call(ctx, 30)).toBe('~30s');
        expect(formatEta.call(ctx, 90)).toBe('~1m 30s');
    });
});

describe('formatTimeAgo', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-12T12:00:00Z'));
    });

    it('returns "just now" for < 60 seconds', () => {
        const timestamp = Date.now() - 30 * 1000;
        expect(formatTimeAgo.call({}, timestamp)).toBe('just now');
    });

    it('returns singular minute', () => {
        const timestamp = Date.now() - 60 * 1000;
        expect(formatTimeAgo.call({}, timestamp)).toBe('1 minute ago');
    });

    it('returns plural minutes', () => {
        const timestamp = Date.now() - 5 * 60 * 1000;
        expect(formatTimeAgo.call({}, timestamp)).toBe('5 minutes ago');
    });

    it('returns singular hour', () => {
        const timestamp = Date.now() - 60 * 60 * 1000;
        expect(formatTimeAgo.call({}, timestamp)).toBe('1 hour ago');
    });

    it('returns plural hours', () => {
        const timestamp = Date.now() - 3 * 60 * 60 * 1000;
        expect(formatTimeAgo.call({}, timestamp)).toBe('3 hours ago');
    });

    it('returns singular day', () => {
        const timestamp = Date.now() - 24 * 60 * 60 * 1000;
        expect(formatTimeAgo.call({}, timestamp)).toBe('1 day ago');
    });

    it('returns weeks', () => {
        const timestamp = Date.now() - 14 * 24 * 60 * 60 * 1000;
        expect(formatTimeAgo.call({}, timestamp)).toBe('2 weeks ago');
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});

describe('removeFileFromList', () => {
    function createContext(files, currentIndex) {
        return {
            mediaFiles: files.map((p) => ({ path: p })),
            currentIndex,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
        };
    }

    it('returns -1 for path not in list', () => {
        const ctx = createContext(['/a.jpg', '/b.jpg'], 0);
        expect(removeFileFromList.call(ctx, '/c.jpg')).toBe(-1);
        expect(ctx.mediaFiles).toHaveLength(2);
    });

    it('removes file and returns its previous index', () => {
        const ctx = createContext(['/a.jpg', '/b.jpg', '/c.jpg'], 0);
        expect(removeFileFromList.call(ctx, '/b.jpg')).toBe(1);
        expect(ctx.mediaFiles).toHaveLength(2);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.jpg', '/c.jpg']);
    });

    it('cleans up all three caches', () => {
        const ctx = createContext(['/a.jpg'], 0);
        ctx.predictionScores.set('/a.jpg', 0.8);
        ctx.featureCache.set('/a.jpg', [1, 2, 3]);
        ctx.perceptualHashes.set('/a.jpg', 'abc');

        removeFileFromList.call(ctx, '/a.jpg');
        expect(ctx.predictionScores.has('/a.jpg')).toBe(false);
        expect(ctx.featureCache.has('/a.jpg')).toBe(false);
        expect(ctx.perceptualHashes.has('/a.jpg')).toBe(false);
    });

    it('caps currentIndex when removing last file while at end', () => {
        const ctx = createContext(['/a.jpg', '/b.jpg', '/c.jpg'], 2);
        removeFileFromList.call(ctx, '/c.jpg');
        expect(ctx.currentIndex).toBe(1); // capped to length - 1
    });

    it('clamps to 0 when removing the only file', () => {
        const ctx = createContext(['/a.jpg'], 0);
        removeFileFromList.call(ctx, '/a.jpg');
        expect(ctx.mediaFiles).toHaveLength(0);
        expect(ctx.currentIndex).toBe(0); // Math.max(0, -1)
    });

    it('does not adjust currentIndex when removing file before it (within bounds)', () => {
        const ctx = createContext(['/a.jpg', '/b.jpg', '/c.jpg'], 1);
        removeFileFromList.call(ctx, '/a.jpg');
        // currentIndex stays 1, which is still < length (2), so no adjustment
        expect(ctx.currentIndex).toBe(1);
    });
});

describe('areFoldersConfigured', () => {
    it('returns truthy when both folders are set', () => {
        const ctx = { customLikeFolder: '/likes', customDislikeFolder: '/dislikes' };
        expect(areFoldersConfigured.call(ctx)).toBeTruthy();
    });

    it('returns falsy when like folder is empty', () => {
        const ctx = { customLikeFolder: '', customDislikeFolder: '/dislikes' };
        expect(areFoldersConfigured.call(ctx)).toBeFalsy();
    });

    it('returns falsy when both folders are empty', () => {
        const ctx = { customLikeFolder: '', customDislikeFolder: '' };
        expect(areFoldersConfigured.call(ctx)).toBeFalsy();
    });

    it('returns falsy when folders are null', () => {
        const ctx = { customLikeFolder: null, customDislikeFolder: null };
        expect(areFoldersConfigured.call(ctx)).toBeFalsy();
    });
});

describe('buildKeyString — key string construction', () => {
    it('buildKeyString produces correct string for Ctrl+KeyA', () => {
        const mockEvent = {
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            code: 'KeyA',
        };
        const result = buildKeyString.call({}, mockEvent);
        expect(result).toBe('Ctrl+KeyA');
    });

    it('buildKeyString produces correct string for plain key', () => {
        const mockEvent = {
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            code: 'KeyQ',
        };
        const result = buildKeyString.call({}, mockEvent);
        expect(result).toBe('KeyQ');
    });
});

describe('insertNewFilesInSortedOrder (algorithm-aware)', () => {
    function makeCtx(overrides = {}) {
        return {
            mediaFiles: [],
            clipCache: new Map(),
            perceptualHashes: new Map(),
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
            async computePerceptualHash(_path) {
                throw new Error('computePerceptualHash should not be called in CLIP path');
            },
            updateProgressNotification() {},
            ...overrides,
        };
    }

    it('CLIP path: inserts new file at cosine-nearest position when vector exists', async () => {
        // Cached order: [a, c] where a~[1,0,0,0], c~[0,1,0,0]
        // New file b with vector [0.99, 0.14, 0, 0] — very close to a (cosine 0.01), far from c (0.86)
        // The algorithm picks the j with minimum score (avg distance to neighbors).
        // j=0: prev=null, next=a, score=0.01 (1 neighbor); j=1: prev=a, next=c, score=0.435; j=2: prev=c, next=null, score=0.86.
        // j=0 wins → b prepended → [b, a, c]
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, c],
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/b.png', new Float32Array([0.99, 0.14, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
            ]),
        });

        await insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'clip');

        // b ends up at index 0 (adjacent to a, prepended)
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
    });

    it('CLIP path: appends new file at end when no CLIP vector', async () => {
        const a = { path: '/a.png' };
        const c = { path: '/c.png' };
        const noVec = { path: '/no-vec.png' };
        const ctx = makeCtx({
            mediaFiles: [a, c],
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
                // /no-vec.png deliberately absent
            ]),
        });

        await insertNewFilesInSortedOrder.call(ctx, [a, c], [noVec], 'clip');

        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png', '/no-vec.png']);
    });

    it('hash path: regression guard — algorithm !== "clip" still uses Hamming', async () => {
        // Cached order: [a, c] with hashes — a="0000", c="1111"
        // New file b with hash "0001" — Hamming 1 from a, Hamming 3 from c.
        // Same min-score logic: j=0 score=1, j=1 score=2, j=2 score=3. j=0 wins → [b, a, c].
        // This test passes against the CURRENT algorithm and serves as a regression guard
        // for Task 6 — the hash branch must remain unchanged.
        const a = { path: '/a.png' };
        const b = { path: '/b.png' };
        const c = { path: '/c.png' };
        const ctx = makeCtx({
            mediaFiles: [a, c],
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
            // computePerceptualHash should not be called when hash already cached
        });

        await insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'vptree');

        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/b.png', '/a.png', '/c.png']);
    });
});

describe('applyCachedSortOrder (algorithm threading)', () => {
    // Regression guard for PR #33 review finding: cachedData.algorithm was undefined
    // because saveSortCache wasn't writing the field. This test verifies that the
    // algorithm threads correctly through applyCachedSortOrder → insertNewFilesInSortedOrder
    // for both code paths (explicit param + cache-entry field) so the CLIP branch is
    // reachable from the cache-hit path.

    function makeCtx(captured) {
        return {
            mediaFiles: [{ path: '/a.png' }, { path: '/b.png' }],
            // Stub electronAPI.path.basename — uses last path segment
            // (real impl is async; just mirror the contract)
            updateProgressNotification() {},
            async insertNewFilesInSortedOrder(_sortedFiles, _newFiles, algorithm) {
                captured.algorithm = algorithm;
            },
        };
    }

    // Patch globalThis.window.electronAPI.path.basename for tests since the method calls it.
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                path: {
                    basename: async (p) => p.split('/').pop(),
                },
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('threads explicit algorithm parameter through to insertNewFilesInSortedOrder', async () => {
        const captured = {};
        const ctx = makeCtx(captured);
        // mediaFiles has /a.png and /b.png; cachedData has only /a.png so /b.png is "new"
        const cachedData = { sortedPaths: ['a.png'] };

        await applyCachedSortOrder.call(ctx, cachedData, 'clip');

        expect(captured.algorithm).toBe('clip');
    });

    it('falls back to cachedData.algorithm when caller passes no explicit algorithm', async () => {
        const captured = {};
        const ctx = makeCtx(captured);
        const cachedData = { sortedPaths: ['a.png'], algorithm: 'mst' };

        await applyCachedSortOrder.call(ctx, cachedData, undefined);

        expect(captured.algorithm).toBe('mst');
    });

    it('explicit algorithm wins over cache-entry algorithm (caller takes precedence)', async () => {
        const captured = {};
        const ctx = makeCtx(captured);
        // Cache entry says 'mst', but caller is now on 'clip' — caller wins
        const cachedData = { sortedPaths: ['a.png'], algorithm: 'mst' };

        await applyCachedSortOrder.call(ctx, cachedData, 'clip');

        expect(captured.algorithm).toBe('clip');
    });

    it('passes undefined when neither source has algorithm (legacy cache + no caller arg)', async () => {
        const captured = { algorithm: 'unset' };
        const ctx = makeCtx(captured);
        // Old cache file with no algorithm field, caller also passes nothing
        const cachedData = { sortedPaths: ['a.png'] };

        await applyCachedSortOrder.call(ctx, cachedData, undefined);

        // undefined → routes through Hamming else-branch in insertNewFilesInSortedOrder (safe default)
        expect(captured.algorithm).toBeUndefined();
    });
});

describe('kickoffBackgroundExtractionIfEnabled', () => {
    let originalWindow;

    beforeEach(() => {
        originalWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                logError: vi.fn(),
            },
        };
    });

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    function makeCtx(overrides = {}) {
        return {
            enableClipFeatures: true,
            featureWorkers: [],
            clipWorkerReady: false,
            clipModelDownloading: false,
            initializeFeaturePool: vi.fn(),
            initClipModel: vi.fn(),
            startBackgroundFeatureExtraction: vi.fn(() => Promise.resolve()),
            ...overrides,
        };
    }

    it('does nothing when CLIP is disabled', () => {
        const fn = extractMethod('kickoffBackgroundExtractionIfEnabled');
        const ctx = makeCtx({ enableClipFeatures: false });
        fn.call(ctx);
        expect(ctx.initializeFeaturePool).not.toHaveBeenCalled();
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).not.toHaveBeenCalled();
    });
});
