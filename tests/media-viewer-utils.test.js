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
            jxlFrameCache: new Map(),
            bulkRated: new Map(),
            saveBulkRatedFile: vi.fn(),
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

    it('purges the jxlFrameCache entry for the removed file', () => {
        const ctx = createContext(['/a.png.jxl', '/b.png.jxl'], 0);
        ctx.jxlFrameCache.set('/a.png.jxl', { frames: [] });
        ctx.jxlFrameCache.set('/b.png.jxl', { frames: [] });

        removeFileFromList.call(ctx, '/a.png.jxl');
        expect(ctx.jxlFrameCache.has('/a.png.jxl')).toBe(false);
        expect(ctx.jxlFrameCache.has('/b.png.jxl')).toBe(true); // untouched
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

    it('CLIP path: throws "Sort aborted" when sortAbortController.signal.aborted before first iteration', async () => {
        const a = { path: '/a.png' };
        const c = { path: '/c.png' };
        const b = { path: '/b.png' };
        const originalMediaFiles = [a, c];
        const ctx = makeCtx({
            mediaFiles: originalMediaFiles,
            clipCache: new Map([
                ['/a.png', new Float32Array([1, 0, 0, 0])],
                ['/b.png', new Float32Array([0.99, 0.14, 0, 0])],
                ['/c.png', new Float32Array([0, 1, 0, 0])],
            ]),
            sortAbortController: { signal: { aborted: true } },
        });

        await expect(insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'clip')).rejects.toThrow('Sort aborted');

        // mediaFiles must remain untouched (insertNewFilesInSortedOrder only assigns
        // this.mediaFiles after the loop completes, so throwing mid-loop preserves the original)
        expect(ctx.mediaFiles).toBe(originalMediaFiles);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png']);
    });

    it('hash path: throws "Sort aborted" when sortAbortController.signal.aborted before first iteration', async () => {
        const a = { path: '/a.png' };
        const c = { path: '/c.png' };
        const b = { path: '/b.png' };
        const originalMediaFiles = [a, c];
        const ctx = makeCtx({
            mediaFiles: originalMediaFiles,
            perceptualHashes: new Map([
                ['/a.png', '0000'],
                ['/b.png', '0001'],
                ['/c.png', '1111'],
            ]),
            sortAbortController: { signal: { aborted: true } },
        });

        await expect(insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'vptree')).rejects.toThrow('Sort aborted');

        expect(ctx.mediaFiles).toBe(originalMediaFiles);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png']);
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
    const kickoffBackgroundExtractionIfEnabled = extractAsyncMethod('kickoffBackgroundExtractionIfEnabled');
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
            mediaFiles: [{ path: 'a' }],
            featureWorkers: [],
            clipWorkerReady: false,
            clipModelDownloading: false,
            initializeFeaturePool: vi.fn(),
            initClipModel: vi.fn(() => Promise.resolve()),
            loadFeatureCache: vi.fn(() => Promise.resolve()),
            startBackgroundFeatureExtraction: vi.fn(() => Promise.resolve()),
            showNotification: vi.fn(),
            ...overrides,
        };
    }

    it('does nothing when CLIP is disabled', async () => {
        const ctx = makeCtx({ enableClipFeatures: false });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.initializeFeaturePool).not.toHaveBeenCalled();
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.loadFeatureCache).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).not.toHaveBeenCalled();
        // Locks in the guard order: the CLIP-disabled return must precede the toast.
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    it('initializes feature pool, reloads cache, awaits CLIP model, and starts extraction on fresh state', async () => {
        const ctx = makeCtx();
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.initializeFeaturePool).toHaveBeenCalledTimes(1);
        expect(ctx.loadFeatureCache).toHaveBeenCalledTimes(1);
        expect(ctx.initClipModel).toHaveBeenCalledTimes(1);
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });

    it('skips initializeFeaturePool when workers already exist', async () => {
        const ctx = makeCtx({ featureWorkers: [{}] });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.initializeFeaturePool).not.toHaveBeenCalled();
        expect(ctx.loadFeatureCache).toHaveBeenCalledTimes(1);
        expect(ctx.initClipModel).toHaveBeenCalledTimes(1);
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });

    it('skips initClipModel when CLIP is already ready', async () => {
        const ctx = makeCtx({ clipWorkerReady: true });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });

    it('still awaits initClipModel when a download is in progress (concurrent-safe IPC dedupes loads)', async () => {
        // Old behavior skipped initClipModel during download; that left clipWorkerReady=false
        // when extraction started, so all extractClipEmbedding calls returned null on cold start.
        // New behavior: always await initClipModel if not ready; underlying loadClipModel IPC is
        // concurrent-safe and resolves both calls on the same in-flight load.
        const ctx = makeCtx({ clipModelDownloading: true });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.initClipModel).toHaveBeenCalledTimes(1);
        expect(ctx.startBackgroundFeatureExtraction).toHaveBeenCalledTimes(1);
    });

    it('reloads feature cache before starting extraction', async () => {
        const order = [];
        const ctx = makeCtx({
            loadFeatureCache: vi.fn(() => {
                order.push('loadFeatureCache');
                return Promise.resolve();
            }),
            startBackgroundFeatureExtraction: vi.fn(() => {
                order.push('startBackgroundFeatureExtraction');
                return Promise.resolve();
            }),
        });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(order).toEqual(['loadFeatureCache', 'startBackgroundFeatureExtraction']);
    });

    it('awaits initClipModel before starting extraction (cold-start ordering)', async () => {
        const order = [];
        const ctx = makeCtx({
            initClipModel: vi.fn(
                () =>
                    new Promise((resolve) =>
                        setTimeout(() => {
                            order.push('initClipModel');
                            resolve();
                        }, 5)
                    )
            ),
            startBackgroundFeatureExtraction: vi.fn(() => {
                order.push('startBackgroundFeatureExtraction');
                return Promise.resolve();
            }),
        });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(order).toEqual(['initClipModel', 'startBackgroundFeatureExtraction']);
    });

    it('logs error via window.electronAPI.logError when extraction rejects', async () => {
        const ctx = makeCtx({
            startBackgroundFeatureExtraction: vi.fn(() => Promise.reject(new Error('boom'))),
        });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledTimes(1);
        const msg = globalThis.window.electronAPI.logError.mock.calls[0][0];
        expect(msg).toContain('boom');
    });

    it('logs error if loadFeatureCache rejects (try/catch covers all awaits)', async () => {
        const ctx = makeCtx({
            loadFeatureCache: vi.fn(() => Promise.reject(new Error('cache disk error'))),
        });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledTimes(1);
        expect(ctx.startBackgroundFeatureExtraction).not.toHaveBeenCalled();
    });

    it('shows a "starting" notification immediately when enabled with files loaded', async () => {
        const ctx = makeCtx();
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledTimes(1);
        expect(ctx.showNotification.mock.calls[0][0]).toContain('Starting feature extraction');
    });

    it('no-ops (no toast, no init) when no folder is loaded', async () => {
        const ctx = makeCtx({ mediaFiles: [] });
        await kickoffBackgroundExtractionIfEnabled.call(ctx);
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(ctx.initializeFeaturePool).not.toHaveBeenCalled();
        expect(ctx.loadFeatureCache).not.toHaveBeenCalled();
        expect(ctx.initClipModel).not.toHaveBeenCalled();
        expect(ctx.startBackgroundFeatureExtraction).not.toHaveBeenCalled();
    });
});

describe('restoreFeatureCachesFromHistory', () => {
    const restoreFeatureCachesFromHistory = extractMethod('restoreFeatureCachesFromHistory');

    function makeCtx() {
        return {
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
        };
    }

    it('splits 576-dim mlFeatures into featureCache(64) + clipCache(512)', () => {
        const ctx = makeCtx();
        const mlFeatures = new Float32Array(576);
        for (let i = 0; i < 576; i++) mlFeatures[i] = i % 256;
        const entry = { originalPath: '/d/a.png', mlFeatures, fileSize: 1234 };

        restoreFeatureCachesFromHistory.call(ctx, entry);

        const f = ctx.featureCache.get('/d/a.png');
        const c = ctx.clipCache.get('/d/a.png');
        expect(f).toBeInstanceOf(Float32Array);
        expect(f.length).toBe(64);
        expect(c).toBeInstanceOf(Float32Array);
        expect(c.length).toBe(512);
        expect(f[0]).toBe(0);
        expect(f[63]).toBe(63);
        expect(c[0]).toBe(64);
        expect(c[511]).toBe((64 + 511) % 256);
    });

    it('restores only featureCache when mlFeatures is 64-dim', () => {
        const ctx = makeCtx();
        const mlFeatures = new Float32Array(64);
        for (let i = 0; i < 64; i++) mlFeatures[i] = i;
        const entry = { originalPath: '/d/b.png', mlFeatures, fileSize: 99 };

        restoreFeatureCachesFromHistory.call(ctx, entry);

        const f = ctx.featureCache.get('/d/b.png');
        expect(f).toBeInstanceOf(Float32Array);
        expect(f.length).toBe(64);
        expect(ctx.clipCache.has('/d/b.png')).toBe(false);
    });

    it('no-ops when mlFeatures is null or entry is null', () => {
        const ctx = makeCtx();
        restoreFeatureCachesFromHistory.call(ctx, { originalPath: '/x', mlFeatures: null, fileSize: 1 });
        restoreFeatureCachesFromHistory.call(ctx, null);
        expect(ctx.featureCache.size).toBe(0);
        expect(ctx.clipCache.size).toBe(0);
        expect(ctx.featureMetadata.size).toBe(0);
    });

    it('no-ops when mlFeatures has unexpected length', () => {
        const ctx = makeCtx();
        const entry = { originalPath: '/x', mlFeatures: new Float32Array(128), fileSize: 1 };
        restoreFeatureCachesFromHistory.call(ctx, entry);
        expect(ctx.featureCache.size).toBe(0);
        expect(ctx.clipCache.size).toBe(0);
        expect(ctx.featureMetadata.size).toBe(0);
    });

    it('restores featureMetadata with mtime:0 from entry.fileSize', () => {
        const ctx = makeCtx();
        const entry = { originalPath: '/d/c.png', mlFeatures: new Float32Array(64), fileSize: 5555 };
        restoreFeatureCachesFromHistory.call(ctx, entry);
        expect(ctx.featureMetadata.get('/d/c.png')).toEqual({ size: 5555, mtime: 0 });
    });
});

describe('isJxl', () => {
    const isJxl = extractMethod('isJxl');
    it('matches .jxl including double/stacked extensions', () => {
        expect(isJxl.call({}, 'a.jxl')).toBe(true);
        expect(isJxl.call({}, 'photo.jpg.jxl')).toBe(true);
        expect(isJxl.call({}, 'loop.gif.jxl')).toBe(true);
        expect(isJxl.call({}, 'name.jpeg.jpg.jxl')).toBe(true);
        expect(isJxl.call({}, 'C:\\x\\b.png.JXL')).toBe(true); // case-insensitive
    });
    it('does not match non-jxl paths', () => {
        expect(isJxl.call({}, 'a.jpg')).toBe(false);
        expect(isJxl.call({}, 'a.jxl.png')).toBe(false);
        expect(isJxl.call({}, 'jxl')).toBe(false);
    });
});

describe('computeJxlFrameSchedule', () => {
    const fn = extractMethod('computeJxlFrameSchedule');
    it('passes through ms durations and floors zero/short frames to MIN_MS (20)', () => {
        // jxl-oxide RenderResult.duration is in MILLISECONDS already (e.g. 300, 400).
        expect(fn.call({}, [{ duration: 300 }, { duration: 400 }, { duration: 0 }])).toEqual([300, 400, 20]);
    });
    it('handles a single frame', () => {
        expect(fn.call({}, [{ duration: 0 }])).toEqual([20]);
    });
});

describe('handleMlWorkerMessage sortComplete', () => {
    const handleMlWorkerMessage = extractMethod('handleMlWorkerMessage');

    it('populates predictionScores from message.scores before reordering mediaFiles', () => {
        const mediaFiles = [
            { name: 'a.png', path: '/d/a.png' },
            { name: 'b.png', path: '/d/b.png' },
            { name: 'c.png', path: '/d/c.png' },
        ];
        const ctx = {
            mediaFiles,
            predictionScores: new Map(),
            currentIndex: 2,
            isSortedByPrediction: false,
            clearProgressNotification: () => {},
            showMedia: () => {},
            updateSortPredictionButton: () => {},
            showNotification: () => {},
        };

        handleMlWorkerMessage.call(ctx, {
            type: 'sortComplete',
            sortedFilenames: ['b.png', 'a.png', 'c.png'],
            scores: { 'a.png': 0.3, 'b.png': 0.95, 'c.png': 0.1 },
        });

        expect(ctx.predictionScores.get('/d/a.png')).toBe(0.3);
        expect(ctx.predictionScores.get('/d/b.png')).toBe(0.95);
        expect(ctx.predictionScores.get('/d/c.png')).toBe(0.1);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b.png', 'a.png', 'c.png']);
        expect(ctx.isSortedByPrediction).toBe(true);
        expect(ctx.currentIndex).toBe(0);
    });

    it('does not crash when message.scores is absent (defensive)', () => {
        const ctx = {
            mediaFiles: [{ name: 'a.png', path: '/a' }],
            predictionScores: new Map(),
            currentIndex: 0,
            isSortedByPrediction: false,
            clearProgressNotification: () => {},
            showMedia: () => {},
            updateSortPredictionButton: () => {},
            showNotification: () => {},
        };

        expect(() => {
            handleMlWorkerMessage.call(ctx, {
                type: 'sortComplete',
                sortedFilenames: ['a.png'],
                // scores intentionally omitted
            });
        }).not.toThrow();
        expect(ctx.predictionScores.size).toBe(0);
        expect(ctx.isSortedByPrediction).toBe(true);
    });
});

describe('handleCancel feature restore', () => {
    const handleCancel = extractAsyncMethod('handleCancel');

    function make576() {
        const v = new Float32Array(576);
        for (let i = 0; i < 576; i++) v[i] = i % 256;
        return v;
    }
    function make64() {
        const v = new Float32Array(64);
        for (let i = 0; i < 64; i++) v[i] = i;
        return v;
    }

    function commonMocks(overrides = {}) {
        return {
            isLoading: false,
            isCompareMode: false,
            mediaFiles: [],
            moveHistory: [],
            currentIndex: 0,
            baseFolderPath: '/folder',
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            predictionScores: new Map(),
            isSortedByPrediction: false,
            isMlEnabled: true,
            mlWorker: { postMessage: vi.fn() },
            // Methods the handler calls
            signalUserActivity: () => {},
            showNotification: () => {},
            showError: () => {},
            updateFolderInfo: () => {},
            showMedia: vi.fn(async () => {}),
            requestPredictionScores: vi.fn(),
            // Helper under test — extracted as a real method so the handler can call it
            restoreFeatureCachesFromHistory: extractMethod('restoreFeatureCachesFromHistory'),
            reverseMlModelUpdate(features, actionType) {
                this.mlWorker.postMessage({
                    type: 'reverseUpdate',
                    data: { features: Array.from(features), label: actionType === 'like' ? 1 : 0 },
                });
            },
            ...overrides,
        };
    }

    function mockElectronAPI() {
        globalThis.window = {
            electronAPI: {
                moveFile: vi.fn(async ({ fileName }) => ({
                    success: true,
                    targetPath: `/folder/${fileName}`,
                })),
                path: { basename: async (p) => p.split('/').pop() },
            },
        };
    }

    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        mockElectronAPI();
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('single-mode like-undo restores featureCache, clipCache, and triggers reverseMlModelUpdate', async () => {
        const ctx = commonMocks({
            moveHistory: [
                {
                    fileName: 'a.png',
                    originalPath: '/folder/a.png',
                    newPath: '/folder/like/a.png',
                    fileSize: 100,
                    fileType: 'image/png',
                    actionType: 'like',
                    mlFeatures: Array.from(make576()),
                },
            ],
        });

        await handleCancel.call(ctx);

        expect(ctx.featureCache.has('/folder/a.png')).toBe(true);
        expect(ctx.featureCache.get('/folder/a.png').length).toBe(64);
        expect(ctx.clipCache.has('/folder/a.png')).toBe(true);
        expect(ctx.clipCache.get('/folder/a.png').length).toBe(512);
        expect(ctx.featureMetadata.get('/folder/a.png')).toEqual({ size: 100, mtime: 0 });
        // reverseMlModelUpdate posts via mlWorker.postMessage
        const reverseCall = ctx.mlWorker.postMessage.mock.calls.find((c) => c[0].type === 'reverseUpdate');
        expect(reverseCall).toBeDefined();
        expect(reverseCall[0].data.label).toBe(1); // like
        // requestPredictionScores is NOT explicitly called in like/dislike undo
        // (it's triggered downstream via reverseUpdateComplete debounce in the live app)
        expect(ctx.requestPredictionScores).not.toHaveBeenCalled();
    });

    it('compare-mode pair-undo restores caches for both files', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            moveHistory: [
                {
                    fileName: 'a.png',
                    originalPath: '/folder/a.png',
                    newPath: '/folder/like/a.png',
                    fileSize: 100,
                    fileType: 'image/png',
                    actionType: 'like',
                    mlFeatures: Array.from(make576()),
                },
                {
                    fileName: 'b.png',
                    originalPath: '/folder/b.png',
                    newPath: '/folder/dislike/b.png',
                    fileSize: 200,
                    fileType: 'image/png',
                    actionType: 'dislike',
                    mlFeatures: Array.from(make64()),
                },
            ],
        });

        await handleCancel.call(ctx);

        // Both files: featureCache populated
        expect(ctx.featureCache.has('/folder/a.png')).toBe(true);
        expect(ctx.featureCache.has('/folder/b.png')).toBe(true);
        // Only a.png had 576-dim → clipCache should be present for it but not for b.png (64-dim only)
        expect(ctx.clipCache.has('/folder/a.png')).toBe(true);
        expect(ctx.clipCache.has('/folder/b.png')).toBe(false);
        // Two reverseUpdate calls
        const reverseCalls = ctx.mlWorker.postMessage.mock.calls.filter((c) => c[0].type === 'reverseUpdate');
        expect(reverseCalls.length).toBe(2);
    });

    it('special-move undo (compare mode) restores featureCache and calls requestPredictionScores when sorted-by-prediction', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            isSortedByPrediction: true,
            // Special-move undo in compare mode (branch at L3353 — compareMode && special)
            mediaFiles: [{ name: 'remaining.png', path: '/folder/remaining.png' }],
            moveHistory: [
                {
                    fileName: 'special.png',
                    originalPath: '/folder/special.png',
                    newPath: '/folder/special-folder/special.png',
                    fileSize: 300,
                    fileType: 'image/png',
                    actionType: 'special',
                    compareMode: true,
                    remainingFile: { name: 'remaining.png', path: '/folder/remaining.png' },
                    remainingFileOriginalIndex: 1,
                    mlFeatures: Array.from(make64()),
                },
            ],
        });

        await handleCancel.call(ctx);

        expect(ctx.featureCache.has('/folder/special.png')).toBe(true);
        // No reverseUpdate (special is unrated)
        const reverseCalls = ctx.mlWorker.postMessage.mock.calls.filter((c) => c[0].type === 'reverseUpdate');
        expect(reverseCalls.length).toBe(0);
        // Special branch needs explicit requestPredictionScores since no reverseUpdateComplete debounce
        expect(ctx.requestPredictionScores).toHaveBeenCalledTimes(1);
    });

    it('bulk-rating undo reverses ML, returns to the rated pair, and refreshes the UI', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            isSortedByPrediction: true,
            mlComparePairIndex: 5, // advanced past the rated pair by applyBulkRating's nextMedia()
            undoBulkRating: vi.fn(async () => {}),
            moveHistory: [
                {
                    bothGood: true,
                    bothBad: false,
                    bulkFiles: [{ name: 'a.jpg', features: [1, 2, 3] }],
                    prevPairIndex: 3,
                },
            ],
        });

        await handleCancel.call(ctx);

        expect(ctx.undoBulkRating).toHaveBeenCalledOnce();
        expect(ctx.moveHistory).toHaveLength(0); // entry popped
        expect(ctx.mlComparePairIndex).toBe(3); // returned to the bulk-rated pair
        expect(ctx.requestPredictionScores).toHaveBeenCalledOnce(); // badges re-scored after ML revert
        expect(ctx.showMedia).toHaveBeenCalledOnce(); // re-render (refreshes the floating Undo button)
    });

    it('bulk-rating undo tolerates a legacy entry without prevPairIndex (no jump, still refreshes)', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            isSortedByPrediction: true,
            mlComparePairIndex: 4,
            undoBulkRating: vi.fn(async () => {}),
            moveHistory: [{ bothBad: true, bulkFiles: [{ name: 'a.jpg', features: null }] }],
        });

        await handleCancel.call(ctx);

        expect(ctx.mlComparePairIndex).toBe(4); // unchanged when prevPairIndex is absent
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });
});

describe('bulk-rated persistence', () => {
    const loadBulkRatedFile = extractAsyncMethod('loadBulkRatedFile');
    const saveBulkRatedFile = extractAsyncMethod('saveBulkRatedFile');
    let origWindow;
    let written;

    beforeEach(() => {
        origWindow = globalThis.window;
        written = null;
        globalThis.window = {
            electronAPI: {
                readBulkRatedFile: async () => ({
                    success: true,
                    data: { version: 1, good: ['a.jpg', 'gone.jpg'], bad: ['b.jpg'] },
                }),
                writeBulkRatedFile: async (_folder, data) => {
                    written = data;
                    return { success: true };
                },
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('hydrates the bulkRated map and prunes filenames absent from mediaFiles', async () => {
        const ctx = {
            baseFolderPath: '/folder',
            mediaFiles: [
                { name: 'a.jpg', path: '/folder/a.jpg' },
                { name: 'b.jpg', path: '/folder/b.jpg' },
            ],
            bulkRated: new Map(),
        };
        ctx.saveBulkRatedFile = saveBulkRatedFile.bind(ctx);
        await loadBulkRatedFile.call(ctx);
        expect(ctx.bulkRated.get('a.jpg')).toBe('good');
        expect(ctx.bulkRated.get('b.jpg')).toBe('bad');
        expect(ctx.bulkRated.has('gone.jpg')).toBe(false);
        // stale 'gone.jpg' pruned -> file re-saved without it
        expect(written).toEqual({ version: 1, good: ['a.jpg'], bad: ['b.jpg'] });
    });

    it('serializes the bulkRated map back to {version, good, bad}', async () => {
        const ctx = {
            baseFolderPath: '/folder',
            bulkRated: new Map([
                ['x.png', 'good'],
                ['y.png', 'bad'],
            ]),
        };
        await saveBulkRatedFile.call(ctx);
        expect(written).toEqual({ version: 1, good: ['x.png'], bad: ['y.png'] });
    });
});

describe('applyBulkRating', () => {
    const applyBulkRating = extractAsyncMethod('applyBulkRating');

    function makeCtx(overrides = {}) {
        return {
            isSortedByPrediction: true,
            isCompareMode: true,
            compareLeftFile: { name: 'a.jpg', path: '/f/a.jpg' },
            compareRightFile: { name: 'b.jpg', path: '/f/b.jpg' },
            bulkRated: new Map(),
            moveHistory: [],
            getCombinedFeatures: () => [1, 2, 3],
            updateMlModelWithFeatures: vi.fn(),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
            nextMedia: vi.fn(),
            ...overrides,
        };
    }

    it('trains both files as like and records them as good, then advances', async () => {
        const ctx = makeCtx();
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).toHaveBeenCalledTimes(2);
        expect(ctx.updateMlModelWithFeatures).toHaveBeenCalledWith([1, 2, 3], 'like');
        expect(ctx.bulkRated.get('a.jpg')).toBe('good');
        expect(ctx.bulkRated.get('b.jpg')).toBe('good');
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.moveHistory[0].bothGood).toBe(true);
        expect(ctx.moveHistory[0].bulkFiles).toHaveLength(2);
        expect(ctx.nextMedia).toHaveBeenCalledOnce();
    });

    it('trains both files as dislike for the bad bucket', async () => {
        const ctx = makeCtx();
        await applyBulkRating.call(ctx, 'bad');
        expect(ctx.updateMlModelWithFeatures).toHaveBeenCalledWith([1, 2, 3], 'dislike');
        expect(ctx.bulkRated.get('a.jpg')).toBe('bad');
        expect(ctx.moveHistory[0].bothBad).toBe(true);
    });

    it('no-ops outside AI-sorted compare mode', async () => {
        const ctx = makeCtx({ isSortedByPrediction: false });
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toHaveLength(0);
        expect(ctx.nextMedia).not.toHaveBeenCalled();
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
    });

    it('no-ops when a compare file is missing', async () => {
        const ctx = makeCtx({ compareRightFile: null });
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).not.toHaveBeenCalled();
    });

    it('stores null features (no training) when the cache misses', async () => {
        const ctx = makeCtx({ getCombinedFeatures: () => null });
        await applyBulkRating.call(ctx, 'good');
        expect(ctx.updateMlModelWithFeatures).not.toHaveBeenCalled();
        expect(ctx.bulkRated.get('a.jpg')).toBe('good');
        expect(ctx.moveHistory[0].bulkFiles[0].features).toBeNull();
    });
});

describe('undoBulkRating', () => {
    const undoBulkRating = extractAsyncMethod('undoBulkRating');

    it('reverses both updates and clears both files from bulkRated', async () => {
        const ctx = {
            bulkRated: new Map([
                ['a.jpg', 'good'],
                ['b.jpg', 'good'],
            ]),
            reverseMlModelUpdate: vi.fn(),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
        };
        const lastMove = {
            bothGood: true,
            bothBad: false,
            bulkFiles: [
                { name: 'a.jpg', features: [1, 2, 3] },
                { name: 'b.jpg', features: [4, 5, 6] },
            ],
        };
        await undoBulkRating.call(ctx, lastMove);
        expect(ctx.reverseMlModelUpdate).toHaveBeenCalledTimes(2);
        expect(ctx.reverseMlModelUpdate).toHaveBeenCalledWith([1, 2, 3], 'like');
        expect(ctx.reverseMlModelUpdate).toHaveBeenNthCalledWith(2, [4, 5, 6], 'like');
        expect(ctx.showNotification).toHaveBeenCalledWith('↩️ Bulk rating undone', 'info');
        expect(ctx.bulkRated.size).toBe(0);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('skips ML reversal for files stored with null features', async () => {
        const ctx = {
            bulkRated: new Map([['a.jpg', 'bad']]),
            reverseMlModelUpdate: vi.fn(),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
        };
        const lastMove = {
            bothGood: false,
            bothBad: true,
            bulkFiles: [{ name: 'a.jpg', features: null }],
        };
        await undoBulkRating.call(ctx, lastMove);
        expect(ctx.reverseMlModelUpdate).not.toHaveBeenCalled();
        expect(ctx.bulkRated.has('a.jpg')).toBe(false);
    });
});

describe('removeFileFromList bulk-rated purge', () => {
    const removeFileFromList = extractMethod('removeFileFromList');

    function makeCtx() {
        return {
            mediaFiles: [
                { name: 'a.jpg', path: '/f/a.jpg' },
                { name: 'b.jpg', path: '/f/b.jpg' },
            ],
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            jxlFrameCache: new Map(),
            bulkRated: new Map([['a.jpg', 'good']]),
            currentIndex: 0,
            saveBulkRatedFile: vi.fn(),
        };
    }

    it('purges a removed file from bulkRated and re-saves', () => {
        const ctx = makeCtx();
        removeFileFromList.call(ctx, '/f/a.jpg');
        expect(ctx.bulkRated.has('a.jpg')).toBe(false);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('does not re-save when the removed file was not bulk-rated', () => {
        const ctx = makeCtx();
        removeFileFromList.call(ctx, '/f/b.jpg');
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
    });
});

describe('collectBulkRatedTrainingExamples', () => {
    const collect = extractAsyncMethod('collectBulkRatedTrainingExamples');

    it('splits cached combined features into liked/disliked by bucket', async () => {
        const ctx = {
            bulkRated: new Map([
                ['a.jpg', 'good'],
                ['b.jpg', 'bad'],
            ]),
            mediaFiles: [
                { name: 'a.jpg', path: '/f/a.jpg' },
                { name: 'b.jpg', path: '/f/b.jpg' },
            ],
            getCombinedFeatures: (p) => (p === '/f/a.jpg' ? [1, 1] : [2, 2]),
        };
        const result = await collect.call(ctx);
        expect(result.liked).toEqual([[1, 1]]);
        expect(result.disliked).toEqual([[2, 2]]);
    });

    it('skips bulk-rated names no longer present in mediaFiles', async () => {
        const ctx = {
            bulkRated: new Map([['gone.jpg', 'good']]),
            mediaFiles: [{ name: 'a.jpg', path: '/f/a.jpg' }],
            getCombinedFeatures: () => [9, 9],
        };
        const result = await collect.call(ctx);
        expect(result.liked).toEqual([]);
        expect(result.disliked).toEqual([]);
    });

    it('computes 576-dim features when the cache misses', async () => {
        const ctx = {
            bulkRated: new Map([['a.jpg', 'good']]),
            mediaFiles: [{ name: 'a.jpg', path: '/f/a.jpg' }],
            getCombinedFeatures: () => null,
            computeFeatures: async () => new Float32Array(64).fill(0.5),
            extractClipEmbedding: async () => new Float32Array(512).fill(0.1),
        };
        const result = await collect.call(ctx);
        expect(result.liked).toHaveLength(1);
        expect(result.liked[0]).toHaveLength(576);
        expect(result.disliked).toEqual([]);
    });
});

describe('decodeJxl', () => {
    const decodeJxl = extractAsyncMethod('decodeJxl');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { readFileBuffer: vi.fn(async () => new ArrayBuffer(8)) } };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    // Binds the real production routing (Task 1) onto the test ctx, so these tests
    // exercise actual message handling instead of a hand-mirrored stub.
    function makeJxlCtx(worker, cache = new Map()) {
        return {
            jxlFrameCache: cache,
            _jxlReqId: 0,
            _jxlPending: new Map(),
            jxlWorker: worker,
            _handleJxlWorkerMessage: extractMethod('_handleJxlWorkerMessage'),
            _rejectJxlPending: extractMethod('_rejectJxlPending'),
            ensureJxlWorker() {
                if (!this._attached) {
                    worker.addEventListener('message', (e) => this._handleJxlWorkerMessage(e.data));
                    this._attached = true;
                }
                return Promise.resolve();
            },
        };
    }

    // Mock worker that streams the new protocol: meta -> frame(s) -> done.
    function makeEchoWorker({ frameCount = 1, animated = false } = {}) {
        const listeners = {};
        const fire = (data) => (listeners.message || []).forEach((f) => f({ data }));
        return {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            _fire: fire,
            postMessage: vi.fn((m) => {
                queueMicrotask(() => {
                    fire({ type: 'meta', id: m.id, width: 4, height: 4, animated, numLoops: 0, frameCount });
                    for (let i = 0; i < frameCount; i++) {
                        fire({ type: 'frame', id: m.id, index: i, pngBytes: new Uint8Array([i + 1]), duration: 0 });
                    }
                    fire({ type: 'done', id: m.id });
                });
            }),
        };
    }

    it('returns a cached entry without reading the file again', async () => {
        const cached = { frames: [], width: 1, height: 1, animated: false, numLoops: 0 };
        const ctx = {
            jxlFrameCache: new Map([['a.png.jxl', cached]]),
            ensureJxlWorker: vi.fn(),
        };
        const result = await decodeJxl.call(ctx, 'a.png.jxl');
        expect(result).toBe(cached);
        expect(globalThis.window.electronAPI.readFileBuffer).not.toHaveBeenCalled();
        expect(ctx.ensureJxlWorker).not.toHaveBeenCalled();
    });

    it('reads bytes, posts to the worker, resolves + caches decoded frames', async () => {
        const worker = makeEchoWorker();
        const ctx = makeJxlCtx(worker);
        const result = await decodeJxl.call(ctx, 'a.png.jxl');
        expect(globalThis.window.electronAPI.readFileBuffer).toHaveBeenCalledWith('a.png.jxl');
        expect(result.animated).toBe(false);
        expect(result.frameCount).toBe(1);
        expect(result.frames).toHaveLength(1);
        expect(ctx.jxlFrameCache.get('a.png.jxl')).toBe(result); // cached after decode
    });

    it('evicts the oldest entry beyond the LRU cap of 8 and keeps recently-used entries', async () => {
        const worker = makeEchoWorker();
        const jxlFrameCache = new Map();
        for (let i = 0; i < 8; i++) {
            jxlFrameCache.set(`seed-${i}.jxl`, { frames: [], width: 1, height: 1, animated: false, numLoops: 0 });
        }
        const ctx = makeJxlCtx(worker, jxlFrameCache);

        // Cache-hit on the oldest seed should move it to most-recently-used so it survives eviction.
        const survivor = await decodeJxl.call(ctx, 'seed-0.jxl');
        expect(survivor).toBe(jxlFrameCache.get('seed-0.jxl'));

        // Decode a 9th distinct path -> size stays bounded at 8, oldest-remaining seed evicted.
        await decodeJxl.call(ctx, 'new.png.jxl');
        expect(ctx.jxlFrameCache.size).toBe(8);
        // seed-1 was the oldest after seed-0 was bumped to MRU, so it is evicted.
        expect(ctx.jxlFrameCache.has('seed-1.jxl')).toBe(false);
        // seed-0 (recently used) survived; the new entry is present.
        expect(ctx.jxlFrameCache.has('seed-0.jxl')).toBe(true);
        expect(ctx.jxlFrameCache.has('new.png.jxl')).toBe(true);
    });

    it('rejects when the worker replies with an error', async () => {
        const listeners = {};
        const worker = {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            postMessage: vi.fn((m) => {
                queueMicrotask(() =>
                    (listeners.message || []).forEach((f) =>
                        f({ data: { type: 'error', id: m.id, message: 'bad jxl' } })
                    )
                );
            }),
        };
        const ctx = makeJxlCtx(worker);
        await expect(decodeJxl.call(ctx, 'bad.png.jxl')).rejects.toThrow('bad jxl');
    });

    it('resolves at frame 0 while later frames stream in; whenComplete delivers all frames', async () => {
        let release;
        const released = new Promise((r) => (release = r));
        const listeners = {};
        const fire = (data) => (listeners.message || []).forEach((f) => f({ data }));
        const worker = {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            postMessage: vi.fn((m) => {
                queueMicrotask(() => {
                    fire({ type: 'meta', id: m.id, width: 4, height: 4, animated: true, numLoops: 0, frameCount: 3 });
                    fire({ type: 'frame', id: m.id, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
                    released.then(() => {
                        fire({ type: 'frame', id: m.id, index: 1, pngBytes: new Uint8Array([1]), duration: 100 });
                        fire({ type: 'frame', id: m.id, index: 2, pngBytes: new Uint8Array([2]), duration: 100 });
                        fire({ type: 'done', id: m.id });
                    });
                });
            }),
        };
        const ctx = makeJxlCtx(worker);
        const entry = await decodeJxl.call(ctx, 'anim.gif.jxl');
        // Early resolve: only frame 0 buffered, total known from meta, not complete yet.
        expect(entry.frames).toHaveLength(1);
        expect(entry.frameCount).toBe(3);
        expect(entry.complete).toBe(false);
        expect(ctx.jxlFrameCache.get('anim.gif.jxl')).toBe(entry); // cached at frame-0 time
        release();
        await expect(entry.whenComplete).resolves.toBe(entry);
        expect(entry.frames).toHaveLength(3);
        expect(entry.complete).toBe(true);
    });

    it('mid-stream error rejects whenComplete; the frame-0 entry stays cached and usable', async () => {
        let release;
        const released = new Promise((r) => (release = r));
        const listeners = {};
        const fire = (data) => (listeners.message || []).forEach((f) => f({ data }));
        const worker = {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            postMessage: vi.fn((m) => {
                queueMicrotask(() => {
                    fire({ type: 'meta', id: m.id, width: 4, height: 4, animated: true, numLoops: 0, frameCount: 3 });
                    fire({ type: 'frame', id: m.id, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
                    released.then(() => fire({ type: 'error', id: m.id, message: 'truncated stream' }));
                });
            }),
        };
        const ctx = makeJxlCtx(worker);
        const entry = await decodeJxl.call(ctx, 'anim.gif.jxl');
        expect(entry.frames).toHaveLength(1);
        release();
        await expect(entry.whenComplete).rejects.toThrow('truncated stream');
        expect(entry.complete).toBe(false);
        expect(entry.frames).toHaveLength(1); // frame 0 kept — static fallback material
        expect(ctx.jxlFrameCache.get('anim.gif.jxl')).toBe(entry); // entry NOT purged
    });
});

describe('_handleJxlWorkerMessage', () => {
    const handle = extractMethod('_handleJxlWorkerMessage');
    const rejectPending = extractMethod('_rejectJxlPending');

    function makePending() {
        return {
            entry: null,
            resolveFirst: vi.fn(),
            rejectFirst: vi.fn(),
            resolveComplete: null,
            rejectComplete: null,
        };
    }
    function makeCtx(pending) {
        return {
            _jxlPending: new Map([[1, pending]]),
            _rejectJxlPending: rejectPending,
        };
    }

    it('meta builds the streaming entry with whenComplete, frameCount, and empty frames', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 4, height: 2, animated: true, numLoops: 0, frameCount: 3 });
        expect(pending.entry).toMatchObject({
            width: 4,
            height: 2,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
        });
        expect(pending.entry.frames).toEqual([]);
        expect(pending.entry.whenComplete).toBeInstanceOf(Promise);
        expect(typeof pending.resolveComplete).toBe('function');
        expect(typeof pending.rejectComplete).toBe('function');
        expect(pending.resolveFirst).not.toHaveBeenCalled();
    });

    it('first frame resolves decodeJxl once; later frames only accumulate', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 2 });
        handle.call(ctx, { type: 'frame', id: 1, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
        expect(pending.resolveFirst).toHaveBeenCalledTimes(1);
        expect(pending.resolveFirst).toHaveBeenCalledWith(pending.entry);
        handle.call(ctx, { type: 'frame', id: 1, index: 1, pngBytes: new Uint8Array([1]), duration: 50 });
        expect(pending.resolveFirst).toHaveBeenCalledTimes(1); // not re-resolved
        expect(pending.entry.frames).toHaveLength(2);
        expect(pending.entry.frames[1]).toEqual({ pngBytes: new Uint8Array([1]), duration: 50 });
    });

    it('done marks complete, resolves whenComplete with the entry, deletes pending', async () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 1 });
        handle.call(ctx, { type: 'frame', id: 1, index: 0, pngBytes: new Uint8Array([0]), duration: 0 });
        handle.call(ctx, { type: 'done', id: 1 });
        expect(pending.entry.complete).toBe(true);
        expect(ctx._jxlPending.size).toBe(0);
        await expect(pending.entry.whenComplete).resolves.toBe(pending.entry);
    });

    it('error before any frame rejects the decodeJxl promise and deletes pending', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 3 });
        handle.call(ctx, { type: 'error', id: 1, message: 'boom' });
        expect(pending.rejectFirst).toHaveBeenCalledTimes(1);
        expect(pending.rejectFirst.mock.calls[0][0].message).toBe('boom');
        expect(ctx._jxlPending.size).toBe(0);
        return expect(pending.entry.whenComplete).rejects.toThrow('boom');
    });

    it('mid-stream error rejects whenComplete but not the already-resolved first promise', async () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 3 });
        handle.call(ctx, { type: 'frame', id: 1, index: 0, pngBytes: new Uint8Array([0]), duration: 100 });
        handle.call(ctx, { type: 'error', id: 1, message: 'truncated' });
        expect(pending.rejectFirst).not.toHaveBeenCalled();
        await expect(pending.entry.whenComplete).rejects.toThrow('truncated');
        expect(pending.entry.complete).toBe(false);
        expect(pending.entry.frames).toHaveLength(1); // frame 0 kept
        expect(ctx._jxlPending.size).toBe(0);
    });

    it('done without any frames rejects the decodeJxl promise instead of hanging', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'meta', id: 1, width: 1, height: 1, animated: true, numLoops: 0, frameCount: 3 });
        handle.call(ctx, { type: 'done', id: 1 });
        expect(pending.rejectFirst).toHaveBeenCalledTimes(1);
        expect(pending.rejectFirst.mock.calls[0][0].message).toBe('JXL decode finished without producing frames');
        expect(ctx._jxlPending.size).toBe(0);
        // whenComplete settles too (rejected) — guard against a forever-pending promise
        return expect(pending.entry.whenComplete).rejects.toThrow('JXL decode finished without producing frames');
    });

    it('unknown message types are ignored and leave the pending record in place', () => {
        const pending = makePending();
        const ctx = makeCtx(pending);
        handle.call(ctx, { type: 'decoded', id: 1, frames: [] }); // legacy pre-streaming type
        expect(pending.resolveFirst).not.toHaveBeenCalled();
        expect(pending.rejectFirst).not.toHaveBeenCalled();
        expect(ctx._jxlPending.size).toBe(1);
    });
});

describe('startJxlAnimation frame-0-first', () => {
    const startJxlAnimation = extractAsyncMethod('startJxlAnimation');
    let origWindow, origDocument, origCreateImageBitmap;
    let drawCtx, canvas;

    beforeEach(() => {
        drawCtx = { clearRect: vi.fn(), drawImage: vi.fn() };
        canvas = { className: '', width: 0, height: 0, style: {}, getContext: () => drawCtx };
        origDocument = globalThis.document;
        globalThis.document = { createElement: () => canvas };
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
        origCreateImageBitmap = globalThis.createImageBitmap;
        globalThis.createImageBitmap = vi.fn(async () => ({ close: vi.fn() }));
    });
    afterEach(() => {
        globalThis.document = origDocument;
        globalThis.window = origWindow;
        globalThis.createImageBitmap = origCreateImageBitmap;
    });

    function makeCtx() {
        return {
            _jxlAnimToken: null,
            _jxlAnimTimer: null,
            currentMedia: null,
            computeJxlFrameSchedule: (frames) => frames.map(() => 20),
        };
    }
    const frame = (n) => ({ pngBytes: new Uint8Array([n]), duration: 100 });

    it('draws frame 0 immediately and does not start the loop while frames are still buffering', async () => {
        const ctx = makeCtx();
        const decoded = {
            frames: [frame(0)], // only frame 0 buffered so far
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
            whenComplete: new Promise(() => {}), // never settles
        };
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(drawCtx.drawImage).toHaveBeenCalledTimes(1));
        expect(ctx.currentMedia).toBe(canvas);
        expect(ctx._jxlAnimTimer).toBeFalsy(); // loop not scheduled — still buffering
    });

    it('starts the drawNext loop once whenComplete resolves', async () => {
        const ctx = makeCtx();
        let releaseBuffer;
        const decoded = {
            frames: [frame(0)],
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
            whenComplete: new Promise((r) => (releaseBuffer = r)),
        };
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(drawCtx.drawImage).toHaveBeenCalledTimes(1)); // frame 0
        decoded.frames.push(frame(1), frame(2));
        decoded.complete = true;
        releaseBuffer(decoded);
        // Loop's first drawNext re-draws frame 0 (visual no-op) — a second drawImage
        // call proves the loop started. Use >= 2: the 20ms frame timer may already have
        // fired again by the first waitFor poll (exact-count would flake).
        await vi.waitFor(() => expect(drawCtx.drawImage.mock.calls.length).toBeGreaterThanOrEqual(2));
        ctx._jxlAnimToken = null; // teardown: stop further scheduling
    });

    it('whenComplete rejection logs and leaves frame 0 as a static image', async () => {
        const ctx = makeCtx();
        const decoded = {
            frames: [frame(0)],
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 3,
            complete: false,
            whenComplete: Promise.reject(new Error('truncated stream')),
        };
        decoded.whenComplete.catch(() => {}); // mirror production's no-op guard
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(globalThis.window.electronAPI.logError).toHaveBeenCalled());
        expect(drawCtx.drawImage).toHaveBeenCalledTimes(1); // frame 0 only, loop never ran
        expect(ctx._jxlAnimTimer).toBeFalsy();
    });
});

describe('_applyModeSwitch single-branch landing index', () => {
    const _applyModeSwitch = extractAsyncMethod('_applyModeSwitch');
    let origDocument;

    beforeEach(() => {
        origDocument = globalThis.document;
        globalThis.document = { querySelectorAll: () => [] };
    });
    afterEach(() => {
        globalThis.document = origDocument;
    });

    function makeCtx(mediaFilePaths, compareLeftFile) {
        return {
            isTournamentMode: false,
            isCompareMode: true,
            mediaFiles: mediaFilePaths.map((p) => ({ path: p })),
            compareLeftFile,
            currentIndex: 0,
            exitTournamentMode: vi.fn(),
            switchToSingleModeUI: vi.fn(),
            toggleViewMode: vi.fn(),
            enterTournamentMode: vi.fn(),
            updateCompareUndoButton: vi.fn(),
            showMedia: vi.fn(),
        };
    }

    it('lands on the compare-left file index', async () => {
        const files = ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg'];
        const ctx = makeCtx(files, { path: '/c.jpg' });
        await _applyModeSwitch.call(ctx, 'single');
        expect(ctx.currentIndex).toBe(2);
        expect(ctx.showMedia).toHaveBeenCalledTimes(1);
    });

    it('falls back to 0 when compareLeftFile is null', async () => {
        const ctx = makeCtx(['/a.jpg', '/b.jpg'], null);
        await _applyModeSwitch.call(ctx, 'single');
        expect(ctx.currentIndex).toBe(0);
    });

    it('falls back to 0 when compareLeftFile is absent from mediaFiles', async () => {
        const ctx = makeCtx(['/a.jpg', '/b.jpg'], { path: '/gone.jpg' });
        await _applyModeSwitch.call(ctx, 'single');
        expect(ctx.currentIndex).toBe(0);
    });

    it('ignores a stale compareLeftFile when not in compare mode (lands on 0)', async () => {
        // Re-invoking single mode (e.g. clicking the already-active Single button, or
        // tournament→single after an earlier compare session) must not jump to a stale
        // compareLeftFile left over from a prior compare session.
        const ctx = makeCtx(['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg'], { path: '/c.jpg' });
        ctx.isCompareMode = false;
        ctx.currentIndex = 1;
        await _applyModeSwitch.call(ctx, 'single');
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.switchToSingleModeUI).not.toHaveBeenCalled();
    });
});

describe('switchToSingleModeUI wrapper teardown', () => {
    const switchToSingleModeUI = extractMethod('switchToSingleModeUI');

    function makeCtx({ withWrappers }) {
        const styleStub = () => ({ display: '' });
        const classListStub = () => ({ remove: vi.fn(), add: vi.fn() });
        const ctx = {
            isCompareMode: true,
            viewModeLabel: { textContent: '' },
            controls: { style: styleStub() },
            compareControls: { style: styleStub() },
            mediaContainer: { classList: classListStub() },
            videoControls: { style: styleStub() },
            leftFileInfo: { classList: classListStub(), style: styleStub() },
            rightFileInfo: { classList: classListStub(), style: styleStub() },
            fileInfo: { style: styleStub() },
            infoToggleBtn: { style: styleStub() },
            hidePredictionBadges: vi.fn(),
            closeAllZoomPopovers: vi.fn(),
            fullscreen: { cleanup: vi.fn() },
            leftMediaWrapper: null,
            rightMediaWrapper: null,
        };
        if (withWrappers) {
            ctx.leftMediaWrapper = { remove: vi.fn() };
            ctx.rightMediaWrapper = { remove: vi.fn() };
        }
        return ctx;
    }

    it('removes and nulls both compare wrappers, cleaning up fullscreen', () => {
        const ctx = makeCtx({ withWrappers: true });
        const left = ctx.leftMediaWrapper;
        const right = ctx.rightMediaWrapper;

        switchToSingleModeUI.call(ctx);

        expect(ctx.fullscreen.cleanup).toHaveBeenCalledWith(left);
        expect(ctx.fullscreen.cleanup).toHaveBeenCalledWith(right);
        expect(left.remove).toHaveBeenCalledTimes(1);
        expect(right.remove).toHaveBeenCalledTimes(1);
        expect(ctx.leftMediaWrapper).toBeNull();
        expect(ctx.rightMediaWrapper).toBeNull();
    });

    it('is a no-op for wrapper teardown when wrappers are already null', () => {
        const ctx = makeCtx({ withWrappers: false });
        expect(() => switchToSingleModeUI.call(ctx)).not.toThrow();
        expect(ctx.fullscreen.cleanup).not.toHaveBeenCalled();
        expect(ctx.leftMediaWrapper).toBeNull();
        expect(ctx.rightMediaWrapper).toBeNull();
    });
});
