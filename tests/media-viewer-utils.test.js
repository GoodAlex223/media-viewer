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

// Guard for methodSource's naive brace counter (below). The counter is corrupted
// only by an *unbalanced* brace inside a string/template literal (e.g. `"{"`, a bare
// `}` in template text). A balanced literal (`${x}`, `"{}"`) nets to zero and is safe.
// Line/block comment CONTENTS are skipped entirely — apostrophes AND braces inside a
// comment are ignored (loadFolder has a `folder's` line comment). Because comment braces
// are skipped by the guard but still counted by methodSource's naive OUTER counter, an
// unbalanced brace inside a comment is an accepted residual alongside regex literals
// (and, obscurely, an escaped `\{` in a string) — these residuals can still corrupt the
// outer count; no product caller hits any of them, and the
// doc-warning covers them. Throws if any string/template span's brace balance is nonzero,
// or a string/template span is left unterminated. It can also FALSE-throw (loud, never a
// silent mis-slice) on constructs it doesn't model — a nested template `${`…`}` or a regex
// char-class holding a quote (`/['"]/`) — which is acceptable: no product caller hits them,
// and a loud throw prompts extending the guard rather than silently slicing wrong.
function assertLiteralBracesBalanced(methodName, body) {
    let state = 'CODE'; // CODE | SQ | DQ | TMPL | LINE_CMT | BLOCK_CMT
    let escaped = false;
    let spanBalance = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        const next = body[i + 1];
        if (state === 'CODE') {
            if (c === "'") {
                state = 'SQ';
                spanBalance = 0;
            } else if (c === '"') {
                state = 'DQ';
                spanBalance = 0;
            } else if (c === '`') {
                state = 'TMPL';
                spanBalance = 0;
            } else if (c === '/' && next === '/') {
                state = 'LINE_CMT';
                i++; // consume the second '/'
            } else if (c === '/' && next === '*') {
                state = 'BLOCK_CMT';
                i++; // consume the '*'
            }
            // A lone `/` (division or a regex literal) stays in CODE — regex spans are
            // the documented residual; a brace inside one would be miscounted.
            continue;
        }
        if (state === 'LINE_CMT') {
            if (c === '\n') state = 'CODE';
            continue;
        }
        if (state === 'BLOCK_CMT') {
            if (c === '*' && next === '/') {
                state = 'CODE';
                i++; // consume the '/'
            }
            continue;
        }
        // Inside a string/template span (SQ | DQ | TMPL).
        if (escaped) {
            escaped = false;
            continue;
        }
        if (c === '\\') {
            escaped = true;
            continue;
        }
        const closer = state === 'SQ' ? "'" : state === 'DQ' ? '"' : '`';
        if (c === closer) {
            if (spanBalance !== 0) {
                throw new Error(
                    `methodSource(${methodName}): unbalanced brace inside a string/template literal — ` +
                        `naive brace-counting is unsafe for this method; extend the extractor.`
                );
            }
            state = 'CODE';
        } else if (c === '{') {
            spanBalance++;
        } else if (c === '}') {
            spanBalance--;
        }
    }
    if (state === 'SQ' || state === 'DQ' || state === 'TMPL') {
        throw new Error(
            `methodSource(${methodName}): body ends inside an unterminated string/template literal — ` +
                `naive brace-counting truncated the method; extend the extractor.`
        );
    }
}

// Returns the raw source text of a top-level MediaViewer method body (for regression
// assertions that a call was added/removed). Handles both `name(` and `async name(`.
//
// WARNING: brace-counting is NAIVE — it counts every `{`/`}` regardless of context.
// It is only correct for method bodies whose literals contain no *unbalanced* brace.
// `assertLiteralBracesBalanced` (which skips comments and checks string/template spans)
// throws on a violating body rather than returning a silently-wrong slice; unguarded
// residuals include an unbalanced brace inside a comment or a regex literal. Only caller
// today: `loadFolder`.
// The `src` override lets the guard be unit-tested against synthetic source.
function methodSource(methodName, src = source) {
    const regex = new RegExp(`^\\s{4}(?:async\\s+)?${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = src.match(regex);
    if (!match) {
        throw new Error(`Could not find method: ${methodName}`);
    }
    const searchStart = match.index + match[0].length - 1; // position of opening {
    let braceCount = 0;
    for (let i = searchStart; i < src.length; i++) {
        if (src[i] === '{') braceCount++;
        if (src[i] === '}') braceCount--;
        if (braceCount === 0) {
            const body = src.substring(searchStart + 1, i);
            assertLiteralBracesBalanced(methodName, body);
            return body;
        }
    }
    throw new Error(`Unbalanced braces for method: ${methodName}`);
}

const buildKeyString = extractMethod('buildKeyString');
const formatElapsed = extractMethod('formatElapsed');
const formatEta = extractMethod('formatEta');
const formatTimeAgo = extractMethod('formatTimeAgo');
const removeFileFromList = extractMethod('removeFileFromList');
const getMediaIndex = extractMethod('getMediaIndex');
const areFoldersConfigured = extractMethod('areFoldersConfigured');
const computeSortProgressView = extractMethod('computeSortProgressView');
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
            bulkRatedPairs: new Set(),
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
            updateSortProgress() {},
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

    it('CLIP path: throws "Sorting cancelled by user" when sortAbortController.signal.aborted before first iteration', async () => {
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

        await expect(insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'clip')).rejects.toThrow(
            'Sorting cancelled by user'
        );

        // mediaFiles must remain untouched (insertNewFilesInSortedOrder only assigns
        // this.mediaFiles after the loop completes, so throwing mid-loop preserves the original)
        expect(ctx.mediaFiles).toBe(originalMediaFiles);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png']);
    });

    it('hash path: throws "Sorting cancelled by user" when sortAbortController.signal.aborted before first iteration', async () => {
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

        await expect(insertNewFilesInSortedOrder.call(ctx, [a, c], [b], 'vptree')).rejects.toThrow(
            'Sorting cancelled by user'
        );

        expect(ctx.mediaFiles).toBe(originalMediaFiles);
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/a.png', '/c.png']);
    });

    it('hash path: yields without changing output for a batch larger than the yield interval', async () => {
        // 30 new files (> the 25-iteration yield boundary) inserted into a 2-file cached order.
        // Pure scheduling change must not alter the result: all files present exactly once,
        // cached anchors retained, and every new file placed.
        const anchorA = { path: '/a.png' };
        const anchorZ = { path: '/z.png' };
        const hashes = new Map([
            ['/a.png', '0000'],
            ['/z.png', '1111'],
        ]);
        const newFiles = [];
        for (let i = 0; i < 30; i++) {
            const p = `/n${i}.png`;
            newFiles.push({ path: p });
            // Distinct-ish 4-bit hashes so each has a defined Hamming distance.
            hashes.set(p, ((i % 16) + 16).toString(2).slice(1));
        }
        const ctx = makeCtx({ mediaFiles: [anchorA, anchorZ], perceptualHashes: hashes });

        await insertNewFilesInSortedOrder.call(ctx, [anchorA, anchorZ], newFiles, 'vptree');

        const paths = ctx.mediaFiles.map((f) => f.path);
        expect(paths).toHaveLength(32);
        expect(new Set(paths).size).toBe(32); // no duplicates
        expect(paths).toContain('/a.png');
        expect(paths).toContain('/z.png');
        for (let i = 0; i < 30; i++) expect(paths).toContain(`/n${i}.png`);
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
            updateSortProgress() {},
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

describe('applyPredictionSortResult', () => {
    const applyPredictionSortResult = extractMethod('applyPredictionSortResult');

    function baseCtx() {
        return {
            mediaFiles: [
                { name: 'a.png', path: '/d/a.png' },
                { name: 'b.png', path: '/d/b.png' },
                { name: 'c.png', path: '/d/c.png' },
            ],
            predictionScores: new Map(),
            currentIndex: 2,
            isSortedByPrediction: false,
            showMedia: () => {},
            updateSortPredictionButton: () => {},
            showNotification: () => {},
        };
    }

    it('reorders mediaFiles and syncs predictionScores from scores', () => {
        const ctx = baseCtx();
        const applied = applyPredictionSortResult.call(ctx, {
            sortedFilenames: ['b.png', 'a.png', 'c.png'],
            scores: { 'a.png': 0.3, 'b.png': 0.95, 'c.png': 0.1 },
        });
        expect(applied).toBe(true);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b.png', 'a.png', 'c.png']);
        expect(ctx.predictionScores.get('/d/b.png')).toBe(0.95);
        expect(ctx.isSortedByPrediction).toBe(true);
        expect(ctx.currentIndex).toBe(0);
    });

    it('does not throw when scores is absent', () => {
        const ctx = baseCtx();
        expect(() =>
            applyPredictionSortResult.call(ctx, { sortedFilenames: ['a.png', 'b.png', 'c.png'] })
        ).not.toThrow();
        expect(ctx.isSortedByPrediction).toBe(true);
    });

    it('returns false and leaves state unsorted when sortedFilenames is null', () => {
        const ctx = baseCtx();
        const applied = applyPredictionSortResult.call(ctx, { sortedFilenames: null, reason: 'not enough ratings' });
        expect(applied).toBe(false);
        expect(ctx.isSortedByPrediction).toBe(false);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a.png', 'b.png', 'c.png']);
    });
});

describe('sortComplete stale-guard + runMlSort resolution', () => {
    const handleMlWorkerMessage = extractMethod('handleMlWorkerMessage');

    it('ignores a sortComplete whose sortRunId does not match the current run', () => {
        let resolved = null;
        const ctx = {
            sortRunId: 5,
            _mlSortResolve: (v) => (resolved = v),
            _mlSortReject: null,
            clearProgressNotification: () => {},
        };
        handleMlWorkerMessage.call(ctx, {
            type: 'sortComplete',
            sortRunId: 4, // stale
            sortedFilenames: ['a.png'],
        });
        expect(resolved).toBeNull(); // resolver NOT called
    });

    it('resolves the pending promise when sortRunId matches', () => {
        let resolved = null;
        const ctx = {
            sortRunId: 5,
            _mlSortResolve: (v) => (resolved = v),
            _mlSortReject: null,
            clearProgressNotification: () => {},
        };
        handleMlWorkerMessage.call(ctx, {
            type: 'sortComplete',
            sortRunId: 5,
            sortedFilenames: ['b.png', 'a.png'],
            scores: { 'a.png': 0.1, 'b.png': 0.9 },
        });
        expect(resolved).toEqual({
            sortedFilenames: ['b.png', 'a.png'],
            scores: { 'a.png': 0.1, 'b.png': 0.9 },
            reason: undefined,
        });
        expect(ctx._mlSortResolve).toBeNull(); // cleared after resolving
    });

    it('treats a sortComplete with no sortRunId (legacy) as matching', () => {
        let resolved = null;
        const ctx = {
            sortRunId: 0,
            _mlSortResolve: (v) => (resolved = v),
            _mlSortReject: null,
            clearProgressNotification: () => {},
        };
        handleMlWorkerMessage.call(ctx, { type: 'sortComplete', sortedFilenames: ['a.png'] });
        expect(resolved).not.toBeNull();
    });

    it('resolves with {sortedFilenames:null, reason} on the worker-failure path (matching sortRunId)', () => {
        let resolved = null;
        const ctx = {
            sortRunId: 3,
            _mlSortResolve: (v) => (resolved = v),
            _mlSortReject: null,
            clearProgressNotification: () => {},
        };
        handleMlWorkerMessage.call(ctx, {
            type: 'sortComplete',
            sortRunId: 3,
            sortedFilenames: null,
            reason: 'Sorting failed: boom',
        });
        expect(resolved).toEqual({
            sortedFilenames: null,
            scores: undefined,
            reason: 'Sorting failed: boom',
        });
    });
});

describe('runMlSort', () => {
    const runMlSort = extractMethod('runMlSort');

    it('posts getSortedOrder and stores the pending resolvers', () => {
        const posted = [];
        const ctx = {
            mlWorker: { postMessage: (m) => posted.push(m) },
            _mlSortResolve: null,
            _mlSortReject: null,
        };
        const p = runMlSort.call(ctx, { 'a.png': [1, 2] }, 7);
        p.catch(() => {}); // never settles in this test; avoid a dangling rejection
        expect(posted).toEqual([{ type: 'getSortedOrder', data: { allFeatures: { 'a.png': [1, 2] }, sortRunId: 7 } }]);
        expect(typeof ctx._mlSortResolve).toBe('function');
        expect(typeof ctx._mlSortReject).toBe('function');
    });

    it('rejects with "ML worker not available" when this.mlWorker is null', async () => {
        const ctx = { mlWorker: null, _mlSortResolve: null, _mlSortReject: null };
        await expect(runMlSort.call(ctx, {}, 1)).rejects.toThrow('ML worker not available');
    });

    it('rejects a superseded prior sort when called again', async () => {
        const ctx = { mlWorker: { postMessage: () => {} }, _mlSortResolve: null, _mlSortReject: null };
        const first = runMlSort.call(ctx, {}, 1);
        const second = runMlSort.call(ctx, {}, 2);
        second.catch(() => {}); // still pending; avoid a dangling rejection
        await expect(first).rejects.toThrow('superseded');
    });
});

describe('_abortInFlightPredictionSort', () => {
    const _abortInFlightPredictionSort = extractMethod('_abortInFlightPredictionSort');

    it('bumps sortRunId, aborts the controller, and settles the pending ML sort promise', () => {
        const controller = new AbortController();
        const rejectSpy = vi.fn();
        const ctx = {
            sortRunId: 5,
            sortAbortController: controller,
            _mlSortResolve: () => {},
            _mlSortReject: rejectSpy,
        };
        _abortInFlightPredictionSort.call(ctx);
        expect(ctx.sortRunId).toBe(6);
        expect(controller.signal.aborted).toBe(true);
        expect(ctx._mlSortResolve).toBeNull();
        expect(ctx._mlSortReject).toBeNull();
        expect(rejectSpy).toHaveBeenCalledTimes(1);
        const rejectedWith = rejectSpy.mock.calls[0][0];
        expect(rejectedWith).toBeInstanceOf(Error);
        expect(rejectedWith.message).toBe('folder changed');
    });

    it('does not throw when there is no pending ML sort promise', () => {
        const controller = new AbortController();
        const ctx = {
            sortRunId: 0,
            sortAbortController: controller,
            _mlSortResolve: null,
            _mlSortReject: null,
        };
        expect(() => _abortInFlightPredictionSort.call(ctx)).not.toThrow();
        expect(ctx.sortRunId).toBe(1);
        expect(controller.signal.aborted).toBe(true);
        expect(ctx._mlSortResolve).toBeNull();
        expect(ctx._mlSortReject).toBeNull();
    });
});

describe('handleSortByPrediction lifecycle', () => {
    const handleSortByPrediction = extractAsyncMethod('handleSortByPrediction');

    function makeCtx(overrides = {}) {
        const phases = [];
        const ctx = {
            isTournamentMode: false,
            isMlEnabled: true,
            isSortedByPrediction: false,
            mlWorker: {},
            featureWorkers: [{}],
            mlStats: { isReady: true },
            mediaFiles: [
                { name: 'a.png', path: '/d/a.png' },
                { name: 'b.png', path: '/d/b.png' },
            ],
            originalMediaFiles: [],
            featureCache: new Map([
                ['/d/a.png', new Float32Array(64)],
                ['/d/b.png', new Float32Array(64)],
            ]),
            sortAbortController: null,
            sortRunId: 0,
            isPredictionSorting: false,
            isComputingHashes: false,
            extractionProgressSink: null,
            enableClipFeatures: false,
            // spies / stubs:
            showNotification: () => {},
            updateSortPredictionButton: () => {},
            updateSortProgress: (p) => phases.push(p.phase),
            clearProgressNotification: () => {},
            loadFeatureCache: () => Promise.resolve(),
            startBackgroundFeatureExtraction: () => Promise.resolve(),
            cancelBackgroundExtraction: () => {},
            getCombinedFeatures: (_p) => new Float32Array(576),
            trainFromHistoricalRatingsAndWait: () => Promise.resolve(),
            loadMlModel: () => Promise.resolve(),
            initializeMlWorker: () => {},
            initializeFeaturePool: () => {},
            initClipModel: () => {},
            runMlSort: () => Promise.resolve({ sortedFilenames: ['b.png', 'a.png'], scores: {} }),
            applyPredictionSortResult: function (r) {
                this.mediaFiles = r.sortedFilenames.map((n) => this.mediaFiles.find((f) => f.name === n));
                this.isSortedByPrediction = true;
                return true;
            },
            showMedia: () => {},
            ...overrides,
        };
        ctx._phases = phases;
        return ctx;
    }

    it('renders a progress card before the first await and applies the sort', async () => {
        const ctx = makeCtx();
        await handleSortByPrediction.call(ctx);
        expect(ctx._phases[0]).toMatch(/Preparing|Loading/);
        expect(ctx.isSortedByPrediction).toBe(true);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b.png', 'a.png']);
        expect(ctx.sortAbortController).toBeNull(); // finally cleaned up
        expect(ctx.isPredictionSorting).toBe(false);
    });

    it('bails unsorted when aborted during the load phase', async () => {
        const ctx = makeCtx({
            // Cold cache so the warm-cache gate actually calls loadFeatureCache (where the
            // abort fires) — a warm cache would skip the load and never reach the abort.
            featureCache: new Map(),
            loadFeatureCache: function () {
                this.sortAbortController.abort(); // user cancels mid-load
                return Promise.resolve();
            },
            runMlSort: () => {
                throw new Error('runMlSort must not be reached after cancel');
            },
        });
        await handleSortByPrediction.call(ctx);
        expect(ctx.isSortedByPrediction).toBe(false);
        expect(ctx.sortAbortController).toBeNull();
        expect(ctx.isPredictionSorting).toBe(false);
    });

    it('bails unsorted when cancelled during the training phase', async () => {
        const startBackgroundFeatureExtraction = vi.fn(() => Promise.resolve());
        const runMlSort = vi.fn(() => Promise.resolve({ sortedFilenames: ['b.png', 'a.png'], scores: {} }));
        const ctx = makeCtx({
            // Not ready yet, so the training branch actually runs.
            mlStats: { isReady: false, positiveCount: 0, negativeCount: 0 },
            // Cold cache (b.png missing, loadFeatureCache resolves without populating it) so
            // Phase 2 would call startBackgroundFeatureExtraction if execution got that far.
            // That's the proof point: Phase 2's OWN post-await abort check would otherwise
            // independently catch this same aborted signal and mask a missing training-phase
            // check — asserting only runMlSort/isSortedByPrediction/finally-cleanup would still
            // pass even with the training-phase guard deleted, since Phase 2's check downstream
            // throws 'cancelled' anyway once mlStats looks ready. Pinning on
            // startBackgroundFeatureExtraction never being called is what actually isolates the
            // training-phase guard.
            featureCache: new Map([['/d/a.png', new Float32Array(64)]]),
            loadFeatureCache: () => Promise.resolve(), // resolves without populating the cache
            trainFromHistoricalRatingsAndWait: function () {
                this.sortAbortController.abort(); // user cancels mid-training
                this.mlStats = { isReady: true }; // training would have made the model ready
                return Promise.resolve();
            },
            startBackgroundFeatureExtraction,
            runMlSort,
        });
        await handleSortByPrediction.call(ctx);
        expect(startBackgroundFeatureExtraction).not.toHaveBeenCalled();
        expect(runMlSort).not.toHaveBeenCalled();
        expect(ctx.isSortedByPrediction).toBe(false);
        expect(ctx.sortAbortController).toBeNull();
        expect(ctx.isPredictionSorting).toBe(false);
    });

    it('bails unsorted when aborted during the extraction phase', async () => {
        const runMlSort = vi.fn(() => Promise.resolve({ sortedFilenames: ['b.png', 'a.png'], scores: {} }));
        const ctx = makeCtx({
            // One file missing from the cache so the Phase-1 gate fires AND uncachedFiles
            // stays non-empty after the (no-op) load — Phase 2 actually gets a chance to run.
            featureCache: new Map([['/d/a.png', new Float32Array(64)]]),
            loadFeatureCache: () => Promise.resolve(), // resolves without populating the cache
            startBackgroundFeatureExtraction: function () {
                this.sortAbortController.abort(); // user cancels mid-extraction
                return Promise.resolve();
            },
            runMlSort,
        });
        await handleSortByPrediction.call(ctx);
        // Phase 3 has its own (separate) abort guard, so asserting only on the final flags
        // would still pass even if the Phase-2 guard were deleted (the pipeline would just
        // run one phase further before bailing). Asserting runMlSort was never invoked pins
        // down THIS guard specifically.
        expect(runMlSort).not.toHaveBeenCalled();
        expect(ctx.isSortedByPrediction).toBe(false);
        expect(ctx.sortAbortController).toBeNull();
        expect(ctx.isPredictionSorting).toBe(false);
    });

    it('bails unsorted when aborted during the sort phase', async () => {
        // Fully warm cache (makeCtx's default has both mediaFiles present) → the load and
        // extraction phases are both skipped, so this reaches Phase 3 where the abort fires.
        const ctx = makeCtx({
            runMlSort: function () {
                this.sortAbortController.abort(); // user cancels mid-sort
                return Promise.resolve({ sortedFilenames: ['b.png', 'a.png'], scores: {} });
            },
        });
        await handleSortByPrediction.call(ctx);
        // applyPredictionSortResult (the default mock) is what flips isSortedByPrediction to
        // true — if the post-runMlSort abort check were removed, it WOULD run and this would
        // flip true, so this assertion genuinely exercises that guard.
        expect(ctx.isSortedByPrediction).toBe(false);
        expect(ctx.sortAbortController).toBeNull();
        expect(ctx.isPredictionSorting).toBe(false);
    });

    it('skips the on-disk reload when the in-memory cache is already warm', async () => {
        // Warm cache (makeCtx's default has both mediaFiles present) → the Phase-1 gate must
        // NOT replay the ~40s load, yet the sort still applies from the in-memory features.
        const loadFeatureCache = vi.fn(() => Promise.resolve());
        const ctx = makeCtx({ loadFeatureCache });
        await handleSortByPrediction.call(ctx);
        expect(loadFeatureCache).not.toHaveBeenCalled();
        expect(ctx.isSortedByPrediction).toBe(true);
    });

    it('reloads from disk when the in-memory cache is missing a current file', async () => {
        // Cold/partial cache (only one of two mediaFiles present) → the gate must call the load.
        const loadFeatureCache = vi.fn(() => Promise.resolve());
        const ctx = makeCtx({
            featureCache: new Map([['/d/a.png', new Float32Array(64)]]),
            loadFeatureCache,
        });
        await handleSortByPrediction.call(ctx);
        expect(loadFeatureCache).toHaveBeenCalledTimes(1);
    });

    it('is a no-op re-entrant call while a sort is already running', async () => {
        const ctx = makeCtx({ isPredictionSorting: true });
        await handleSortByPrediction.call(ctx);
        expect(ctx._phases.length).toBe(0); // returned immediately
    });

    it('is mutually exclusive with an in-progress similarity sort', async () => {
        // Both handlers share this.sortAbortController — if handleSortByPrediction started
        // here, it would clobber the similarity sort's controller and defeat its Cancel button.
        const ctx = makeCtx({ isComputingHashes: true });
        await handleSortByPrediction.call(ctx);
        expect(ctx._phases.length).toBe(0); // returned immediately, no progress card rendered
        expect(ctx.sortAbortController).toBeNull(); // never created — similarity sort's is untouched
        expect(ctx.isPredictionSorting).toBe(false);
        expect(ctx.isSortedByPrediction).toBe(false); // sort never applied
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
                    compareMode: true,
                    mlFeatures: Array.from(make576()),
                },
                {
                    fileName: 'b.png',
                    originalPath: '/folder/b.png',
                    newPath: '/folder/dislike/b.png',
                    fileSize: 200,
                    fileType: 'image/png',
                    actionType: 'dislike',
                    compareMode: true,
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

    it('does NOT take the compare-pair branch when the last move lacks compareMode (leftover single move)', async () => {
        const ctx = commonMocks({
            isCompareMode: true,
            moveHistory: [
                // An older compare-pair entry (compareMode set)…
                {
                    fileName: 'old.png',
                    originalPath: '/folder/old.png',
                    newPath: '/folder/like/old.png',
                    fileSize: 50,
                    fileType: 'image/png',
                    actionType: 'like',
                    compareMode: true,
                    mlFeatures: Array.from(make64()),
                },
                // …and a leftover SINGLE-mode move on top (no compareMode flag).
                {
                    fileName: 'single.png',
                    originalPath: '/folder/single.png',
                    newPath: '/folder/dislike/single.png',
                    fileSize: 60,
                    fileType: 'image/png',
                    actionType: 'dislike',
                    mlFeatures: Array.from(make64()),
                },
            ],
        });

        await handleCancel.call(ctx);

        // The single-move (non-compare) branch pops exactly ONE entry, leaving the
        // older compare-pair entry intact. The pre-fix two-entry pop would have
        // drained the history to length 0 and restored 'old.png'.
        expect(ctx.moveHistory.length).toBe(1);
        expect(ctx.moveHistory[0].fileName).toBe('old.png');
        expect(ctx.featureCache.has('/folder/old.png')).toBe(false);
        expect(ctx.featureCache.has('/folder/single.png')).toBe(true);
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
            mlComparePairIndex: 5, // set high; handleCancel restores prevPairIndex on undo
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

    it('applyBulkRating records the exact pair key and re-renders in place (no advance)', async () => {
        const applyBulkRating = extractAsyncMethod('applyBulkRating');
        const bulkPairKey = extractMethod('bulkPairKey');
        const showMedia = vi.fn();
        const nextMedia = vi.fn();
        const ctx = {
            isSortedByPrediction: true,
            isCompareMode: true,
            compareLeftFile: { name: 'a.jpg', path: '/f/a.jpg' },
            compareRightFile: { name: 'z.jpg', path: '/f/z.jpg' },
            getCombinedFeatures: () => null, // skips updateMlModelWithFeatures
            updateMlModelWithFeatures: vi.fn(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            bulkPairKey,
            saveBulkRatedFile: async () => {},
            moveHistory: [],
            mlComparePairIndex: 3,
            computeValidComparePairs: () => [{}, {}, {}, {}],
            showNotification: () => {},
            showMedia,
            nextMedia,
        };
        await applyBulkRating.call(ctx, 'bad');

        expect(ctx.bulkRatedPairs.has(bulkPairKey('a.jpg', 'z.jpg'))).toBe(true);
        expect(showMedia).toHaveBeenCalledTimes(1);
        expect(nextMedia).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.moveHistory[0].prevPairIndex).toBe(3);
        expect(ctx.moveHistory[0].bothBad).toBe(true);
    });

    it('undoBulkRating deletes the exact pair key', async () => {
        const undoBulkRating = extractAsyncMethod('undoBulkRating');
        const bulkPairKey = extractMethod('bulkPairKey');
        const key = bulkPairKey('a.jpg', 'z.jpg');
        const ctx = {
            reverseMlModelUpdate: vi.fn(),
            bulkRated: new Map([
                ['a.jpg', 'bad'],
                ['z.jpg', 'bad'],
            ]),
            bulkRatedPairs: new Set([key]),
            bulkPairKey,
            saveBulkRatedFile: async () => {},
            showNotification: () => {},
        };
        const lastMove = {
            bothBad: true,
            bulkFiles: [
                { name: 'a.jpg', features: null },
                { name: 'z.jpg', features: null },
            ],
        };
        await undoBulkRating.call(ctx, lastMove);

        expect(ctx.bulkRatedPairs.has(key)).toBe(false);
        expect(ctx.bulkRated.has('a.jpg')).toBe(false);
        expect(ctx.bulkRated.has('z.jpg')).toBe(false);
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
            showMedia: vi.fn(),
            bulkRatedPairs: new Set(),
            bulkPairKey: extractMethod('bulkPairKey'),
            mlComparePairIndex: 0,
            computeValidComparePairs: () => [{ leftFile: {}, rightFile: {} }],
            ...overrides,
        };
    }

    it('trains both files as like and records them as good, then re-renders', async () => {
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
        expect(ctx.showMedia).toHaveBeenCalledOnce();
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

    it('clamps mlComparePairIndex into the shrunk valid list (keeps the count coherent), preserving prevPairIndex', async () => {
        // Rating the last valid pair: cursor 2, but only 2 valid pairs remain afterward.
        const ctx = makeCtx({
            mlComparePairIndex: 2,
            computeValidComparePairs: () => [
                { leftFile: {}, rightFile: {} },
                { leftFile: {}, rightFile: {} },
            ],
        });
        await applyBulkRating.call(ctx, 'bad');
        expect(ctx.moveHistory[0].prevPairIndex).toBe(2); // original index recorded for undo
        expect(ctx.mlComparePairIndex).toBe(1); // clamped to valid max (length - 1)
    });
});

describe('undoBulkRating', () => {
    const undoBulkRating = extractAsyncMethod('undoBulkRating');
    const bulkPairKey = extractMethod('bulkPairKey');

    it('reverses both updates and clears both files from bulkRated', async () => {
        const ctx = {
            bulkRated: new Map([
                ['a.jpg', 'good'],
                ['b.jpg', 'good'],
            ]),
            bulkRatedPairs: new Set([bulkPairKey('a.jpg', 'b.jpg')]),
            bulkPairKey,
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
        expect(ctx.bulkRatedPairs.has(bulkPairKey('a.jpg', 'b.jpg'))).toBe(false);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('skips ML reversal for files stored with null features', async () => {
        const ctx = {
            bulkRated: new Map([
                ['a.jpg', 'bad'],
                ['b.jpg', 'bad'],
            ]),
            bulkRatedPairs: new Set([bulkPairKey('a.jpg', 'b.jpg')]),
            bulkPairKey,
            reverseMlModelUpdate: vi.fn(),
            saveBulkRatedFile: vi.fn().mockResolvedValue(undefined),
            showNotification: vi.fn(),
        };
        const lastMove = {
            bothGood: false,
            bothBad: true,
            bulkFiles: [
                { name: 'a.jpg', features: null },
                { name: 'b.jpg', features: null },
            ],
        };
        await undoBulkRating.call(ctx, lastMove);
        expect(ctx.reverseMlModelUpdate).not.toHaveBeenCalled();
        expect(ctx.bulkRated.has('a.jpg')).toBe(false);
        expect(ctx.bulkRated.has('b.jpg')).toBe(false);
        expect(ctx.bulkRatedPairs.has(bulkPairKey('a.jpg', 'b.jpg'))).toBe(false);
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
            bulkRatedPairs: new Set(),
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

describe('valid-pairs bounds (G3 Task 3)', () => {
    it('updateNavigationInfo shows the valid-pairs count as the denominator', () => {
        const updateNavigationInfo = extractMethod('updateNavigationInfo');
        const mediaIndex = { textContent: '' };
        const ctx = {
            isCompareMode: true,
            isSortedByPrediction: true,
            predictionScores: new Map([
                ['/f/a', 0.9],
                ['/f/b', 0.1],
            ]),
            mediaFiles: [
                { name: 'a', path: '/f/a' },
                { name: 'b', path: '/f/b' },
            ],
            mlComparePairIndex: 0,
            mediaIndex,
            // 3 valid pairs regardless of the 2-file mediaFiles (stubbed to isolate the denominator)
            computeValidComparePairs: () => [{}, {}, {}],
        };
        updateNavigationInfo.call(ctx);
        expect(mediaIndex.textContent).toBe('Pair 1 of 3');
    });

    it('removeFileFromList prunes bulkRatedPairs keys that reference the removed file', () => {
        const bulkPairKey = extractMethod('bulkPairKey');
        const gone = { name: 'gone.jpg', path: '/f/gone.jpg' };
        const keep = { name: 'keep.jpg', path: '/f/keep.jpg' };
        const other = { name: 'other.jpg', path: '/f/other.jpg' };
        const ctx = {
            mediaFiles: [gone, keep, other],
            currentIndex: 0,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set([bulkPairKey('gone.jpg', 'keep.jpg'), bulkPairKey('keep.jpg', 'other.jpg')]),
            bulkPairKey,
            saveBulkRatedFile: () => {},
        };
        removeFileFromList.call(ctx, '/f/gone.jpg');
        expect(ctx.bulkRatedPairs.has(bulkPairKey('gone.jpg', 'keep.jpg'))).toBe(false);
        expect(ctx.bulkRatedPairs.has(bulkPairKey('keep.jpg', 'other.jpg'))).toBe(true);
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

describe('trainFromHistoricalRatings (signal-aware bail)', () => {
    const trainFromHistoricalRatings = extractAsyncMethod('trainFromHistoricalRatings');
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                loadFolder: vi.fn(async () => ({ success: true, files: [] })),
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('bails before loading historical folders when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const ctx = {
            isMlEnabled: true,
            mlWorker: { postMessage: vi.fn() },
            customLikeFolder: '/liked',
            customDislikeFolder: '/disliked',
            updateProgressNotification: vi.fn(),
            clearProgressNotification: vi.fn(),
        };
        await trainFromHistoricalRatings.call(ctx, controller.signal);
        // Not just "returns early" in the abstract — proves the expensive per-file work (which
        // starts with loading the like/dislike folders) never starts, and no partial-training
        // message reaches the ML worker.
        expect(globalThis.window.electronAPI.loadFolder).not.toHaveBeenCalled();
        expect(ctx.mlWorker.postMessage).not.toHaveBeenCalled();
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

    // Mock worker that streams the new protocol for a 1-frame static image: meta -> frame -> done.
    function makeEchoWorker() {
        const listeners = {};
        const fire = (data) => (listeners.message || []).forEach((f) => f({ data }));
        return {
            addEventListener: (ev, fn) => {
                (listeners[ev] = listeners[ev] || []).push(fn);
            },
            postMessage: vi.fn((m) => {
                queueMicrotask(() => {
                    fire({ type: 'meta', id: m.id, width: 4, height: 4, animated: false, numLoops: 0, frameCount: 1 });
                    fire({ type: 'frame', id: m.id, index: 0, pngBytes: new Uint8Array([1]), duration: 0 });
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

    it('rejects after 15s and deletes the pending entry if frame 0 never arrives', async () => {
        vi.useFakeTimers();
        try {
            // Worker that accepts the decode message but never streams a reply.
            const silentWorker = { addEventListener: () => {}, postMessage: vi.fn() };
            const ctx = makeJxlCtx(silentWorker);
            const p = decodeJxl.call(ctx, 'hang.jxl');
            const assertion = expect(p).rejects.toThrow('JXL decode timeout');
            // Flush the pre-timer awaits (ensureJxlWorker + readFileBuffer), then trip the timeout.
            await vi.advanceTimersByTimeAsync(15000);
            await assertion;
            expect(ctx._jxlPending.size).toBe(0);
        } finally {
            vi.useRealTimers();
        }
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

    it('init-error rejects the _jxlReady init promise and nulls the resolver refs', () => {
        const rejectReady = vi.fn();
        const ctx = {
            _jxlPending: new Map(),
            _rejectJxlPending: rejectPending,
            _jxlResolveReady: vi.fn(),
            _jxlRejectReady: rejectReady,
        };
        handle.call(ctx, { type: 'init-error', message: 'wasm load failed' });
        expect(rejectReady).toHaveBeenCalledTimes(1);
        expect(rejectReady.mock.calls[0][0].message).toBe('wasm load failed');
        expect(ctx._jxlRejectReady).toBe(null);
        expect(ctx._jxlResolveReady).toBe(null);
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
            showNotification: vi.fn(),
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

    it('does not start the loop when superseded (navigation) during buffering', async () => {
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
        ctx._jxlAnimToken = null; // stopJxlAnimation() during the buffering wait
        decoded.frames.push(frame(1), frame(2));
        decoded.complete = true;
        releaseBuffer(decoded);
        await new Promise((r) => setTimeout(r, 10)); // give a superseded loop time to (wrongly) start
        expect(drawCtx.drawImage).toHaveBeenCalledTimes(1); // no further draws
        expect(ctx._jxlAnimTimer).toBeFalsy();
    });

    it('toasts once when the entire animation is undecodable', async () => {
        const ctx = makeCtx();
        // Every frame fails to decode -> consecutiveFailures reaches frames.length -> bail.
        globalThis.createImageBitmap = vi.fn(async () => {
            throw new Error('decode fail');
        });
        const decoded = {
            frames: [frame(0), frame(1)],
            width: 4,
            height: 4,
            animated: true,
            numLoops: 0,
            frameCount: 2,
            complete: true,
        };
        // Set after construction (the literal can't self-reference `decoded`); resolved so
        // runWhenBuffered passes the buffering gate and the drawNext loop starts.
        decoded.whenComplete = Promise.resolve(decoded);
        await startJxlAnimation.call(ctx, decoded);
        await vi.waitFor(() => expect(ctx.showNotification).toHaveBeenCalledTimes(1));
        expect(ctx.showNotification.mock.calls[0][0]).toMatch(/first frame/i);
        expect(ctx.showNotification.mock.calls[0][1]).toBe('warning');
        ctx._jxlAnimToken = null; // teardown
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

describe('tournament isLoading guards (Fix 2)', () => {
    const handleTournamentDraw = extractAsyncMethod('handleTournamentDraw');
    const handleTournamentPick = extractAsyncMethod('handleTournamentPick');

    function makeCtx(overrides = {}) {
        return {
            isTournamentMode: true,
            isLoading: false,
            showRatingConfirmations: false,
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            showTournamentPair: vi.fn(async () => {}),
            tournament: {
                engine: { getCurrentPair: () => ({ left: 'L', right: 'R' }) },
                handlePairDraw: vi.fn(async () => {}),
                handlePairResult: vi.fn(async () => {}),
            },
            ...overrides,
        };
    }

    it('handleTournamentDraw no-ops while isLoading', async () => {
        const ctx = makeCtx({ isLoading: true });
        await handleTournamentDraw.call(ctx, 'win');
        expect(ctx.tournament.handlePairDraw).not.toHaveBeenCalled();
        expect(ctx.signalUserActivity).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled(); // guard runs BEFORE any UI advance
    });

    it('handleTournamentDraw records the draw when not loading', async () => {
        const ctx = makeCtx();
        await handleTournamentDraw.call(ctx, 'win');
        expect(ctx.tournament.handlePairDraw).toHaveBeenCalledWith('L', 'R', 'win');
        expect(ctx.showTournamentPair).toHaveBeenCalledTimes(1);
    });

    it('handleTournamentDraw still advances (showTournamentPair) when the record call throws, with NO false success toast', async () => {
        // The central guarantee of the try/catch: a stale-pair throw is logged, not
        // left unhandled, and the UI still advances. (BACKLOG PR #41 root cause.)
        // PR #48 review: the success toast must NOT fire on a thrown record — that
        // would be a false confirmation. showRatingConfirmations is on here to prove
        // the toast is suppressed precisely when the draw failed.
        const ctx = makeCtx({ showRatingConfirmations: true });
        ctx.tournament.handlePairDraw = vi.fn(async () => {
            throw new Error('No active pair to record');
        });
        const origWindow = globalThis.window;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
        try {
            await handleTournamentDraw.call(ctx, 'win');
            expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith(
                expect.stringContaining('Tournament draw failed')
            );
            expect(ctx.showNotification).not.toHaveBeenCalled(); // no false "recorded" toast
            expect(ctx.showTournamentPair).toHaveBeenCalledTimes(1);
        } finally {
            globalThis.window = origWindow;
        }
    });

    it('handleTournamentPick no-ops while isLoading', async () => {
        const ctx = makeCtx({ isLoading: true });
        await handleTournamentPick.call(ctx, 'L', 'R');
        expect(ctx.tournament.handlePairResult).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });
});

describe('loadFolder cache reset (Fix 1)', () => {
    it('clears clipCache alongside the other per-folder caches', () => {
        // Slice the loadFolder reset block. Anchor the start INSIDE loadFolder — a
        // folder-watch callback earlier in the file also calls perceptualHashes.clear(),
        // and a bare indexOf would match that first and slice an ~820-line window.
        // End anchor is loadBulkRatedFile() (unique in the file, immediately after the reset
        // block) rather than cancelBackgroundExtraction() — that call was hoisted to run
        // BEFORE the empty/non-empty branch split (see 'loadFolder empty-folder teardown'
        // below), so it now sits before this block, not after. Anchoring on it here would
        // silently forward-match a distant, unrelated cancelBackgroundExtraction() call site
        // instead and slice thousands of lines — still "containing" every string below, but
        // no longer proving anything about this specific block.
        const start = source.indexOf('this.perceptualHashes.clear();', source.indexOf('async loadFolder('));
        const end = source.indexOf('await this.loadBulkRatedFile();', start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const block = source.slice(start, end);
        for (const cache of [
            'this.perceptualHashes.clear();',
            'this.featureCache.clear();',
            'this.featureMetadata.clear();',
            'this.predictionScores.clear();',
            'this.clipCache.clear();',
        ]) {
            expect(block).toContain(cache);
        }
    });
});

describe('loadFolder empty-folder teardown (Fix B follow-up)', () => {
    const loadFolder = extractAsyncMethod('loadFolder');
    // _abortInFlightPredictionSort is a plain sync method with no DOM/electronAPI deps of its
    // own — wrap the REAL implementation in a vi.fn() spy so the test proves both that
    // loadFolder's empty-folder branch calls it AND that its real side effects (controller
    // aborted, pending promise rejected, fields nulled) actually happen, not just that some
    // stand-in was invoked.
    const abortInFlightPredictionSortImpl = extractMethod('_abortInFlightPredictionSort');
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {
            electronAPI: {
                loadFolder: vi.fn(async () => ({ success: true, files: [] })),
                path: { basename: (p) => p.split(/[\\/]/).pop() },
            },
        };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function makeCtx() {
        return {
            isTournamentMode: false,
            tournament: { engine: 'stale-engine' },
            mediaFiles: [{ name: 'stale.png', path: '/old/stale.png' }],
            baseFolderPath: '/old',
            currentFolderPath: 'old',
            currentIndex: 3,
            moveHistory: [{ some: 'entry' }],
            sortRunId: 5,
            sortAbortController: new AbortController(),
            _mlSortResolve: () => {},
            _mlSortReject: vi.fn(),
            _featureCacheDiskCount: 99,
            showLoadingSpinner: vi.fn(),
            hideLoadingSpinner: vi.fn(),
            showDropZone: vi.fn(),
            showError: vi.fn(),
            exitTournamentMode: vi.fn(),
            cancelBackgroundExtraction: vi.fn(),
            _abortInFlightPredictionSort: vi.fn(abortInFlightPredictionSortImpl),
        };
    }

    it('tears down an in-flight sort even when the new folder is empty', async () => {
        const ctx = makeCtx();
        const rejectSpy = ctx._mlSortReject; // capture before _abortInFlightPredictionSort nulls ctx._mlSortReject
        await loadFolder.call(ctx, '/new/empty-folder');

        // The cleanup trio must fire on the empty-folder early-return path, not just the
        // non-empty path — this is the gap Fix B originally missed.
        expect(ctx.cancelBackgroundExtraction).toHaveBeenCalledTimes(1);
        expect(ctx._abortInFlightPredictionSort).toHaveBeenCalledTimes(1);
        expect(ctx._featureCacheDiskCount).toBe(0);

        // Real _abortInFlightPredictionSort side effects (not just "was called"): the pending
        // runMlSort promise is actually settled, so isPredictionSorting won't be stuck true and
        // wedge both sort paths via the shared sortAbortController mutual-exclusion guard.
        expect(ctx.sortRunId).toBe(6);
        expect(ctx.sortAbortController.signal.aborted).toBe(true);
        expect(rejectSpy).toHaveBeenCalledTimes(1);
        expect(rejectSpy.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(rejectSpy.mock.calls[0][0].message).toBe('folder changed');
        expect(ctx._mlSortResolve).toBeNull();
        expect(ctx._mlSortReject).toBeNull();

        // Sanity check we actually took the empty-folder branch.
        expect(ctx.mediaFiles).toEqual([]);
        expect(ctx.showError).toHaveBeenCalledWith('No media files found in the selected folder');
    });
});

describe('<2-files fallback exits tournament mode (Fix 3)', () => {
    const retryCompareAfterRemoval = extractAsyncMethod('_retryCompareAfterRemoval');
    const showCompareMedia = extractAsyncMethod('showCompareMedia');

    function baseCtx(overrides = {}) {
        return {
            isTournamentMode: true,
            mediaFiles: [{ path: '/a.png' }], // length 1 -> triggers the <2 branch
            moveHistory: [],
            leftMedia: null,
            rightMedia: null,
            currentIndex: 0,
            exitTournamentMode: vi.fn(),
            switchToSingleModeUI: vi.fn(),
            showNotification: vi.fn(),
            showMedia: vi.fn(async () => {}),
            showEmptyStateWithUndo: vi.fn(),
            showDropZone: vi.fn(),
            cleanupCompareMedia: vi.fn(async () => {}),
            ...overrides,
        };
    }

    it('_retryCompareAfterRemoval exits tournament before switching to single', async () => {
        const ctx = baseCtx();
        await retryCompareAfterRemoval.call(ctx, 0);
        expect(ctx.exitTournamentMode).toHaveBeenCalledTimes(1);
        expect(ctx.switchToSingleModeUI).toHaveBeenCalledTimes(1);
        // Order matters: tournament state must be torn down before the UI switches.
        expect(ctx.exitTournamentMode.mock.invocationCallOrder[0]).toBeLessThan(
            ctx.switchToSingleModeUI.mock.invocationCallOrder[0]
        );
    });

    it('showCompareMedia <2 branch exits tournament before switching to single', async () => {
        const ctx = baseCtx();
        await showCompareMedia.call(ctx, 0);
        expect(ctx.exitTournamentMode).toHaveBeenCalledTimes(1);
        expect(ctx.switchToSingleModeUI).toHaveBeenCalledTimes(1);
        expect(ctx.exitTournamentMode.mock.invocationCallOrder[0]).toBeLessThan(
            ctx.switchToSingleModeUI.mock.invocationCallOrder[0]
        );
    });

    it('does not call exitTournamentMode when not in tournament mode', async () => {
        const ctx = baseCtx({ isTournamentMode: false });
        await retryCompareAfterRemoval.call(ctx, 0);
        expect(ctx.exitTournamentMode).not.toHaveBeenCalled();
        expect(ctx.switchToSingleModeUI).toHaveBeenCalledTimes(1);
    });
});

describe('CLIP unload timer callback (Fix 5)', () => {
    const handleClipUnloadTimer = extractAsyncMethod('_handleClipUnloadTimer');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function makeCtx(overrides = {}) {
        return {
            enableClipFeatures: true,
            clipWorkerReady: true,
            clipUnloadTimer: 123,
            ...overrides,
        };
    }

    it('resets clipWorkerReady on a successful unload', async () => {
        globalThis.window = {
            electronAPI: { unloadClipModel: vi.fn(async () => ({ success: true })), logError: vi.fn() },
        };
        const ctx = makeCtx();
        await handleClipUnloadTimer.call(ctx);
        expect(globalThis.window.electronAPI.unloadClipModel).toHaveBeenCalledTimes(1);
        expect(ctx.clipWorkerReady).toBe(false);
        expect(ctx.clipUnloadTimer).toBe(null);
    });

    it('keeps clipWorkerReady true when the IPC reports loading', async () => {
        globalThis.window = {
            electronAPI: {
                unloadClipModel: vi.fn(async () => ({ success: false, reason: 'loading' })),
                logError: vi.fn(),
            },
        };
        const ctx = makeCtx();
        await handleClipUnloadTimer.call(ctx);
        expect(ctx.clipWorkerReady).toBe(true);
    });

    it('skips the unload when CLIP was disabled during the grace window', async () => {
        globalThis.window = { electronAPI: { unloadClipModel: vi.fn(), logError: vi.fn() } };
        const ctx = makeCtx({ enableClipFeatures: false });
        await handleClipUnloadTimer.call(ctx);
        expect(globalThis.window.electronAPI.unloadClipModel).not.toHaveBeenCalled();
        expect(ctx.clipUnloadTimer).toBe(null);
    });

    it('logs and does not throw when the unload IPC rejects', async () => {
        globalThis.window = {
            electronAPI: {
                unloadClipModel: vi.fn(async () => {
                    throw new Error('ipc boom');
                }),
                logError: vi.fn(),
            },
        };
        const ctx = makeCtx();
        await handleClipUnloadTimer.call(ctx);
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalled();
        expect(ctx.clipWorkerReady).toBe(true); // not reset on failure
    });
});

describe('computeSortProgressView', () => {
    it('determinate: phase, clamped percent, comma-grouped counts', () => {
        const v = computeSortProgressView({ phase: 'Building graph', current: 12400, total: 24000 });
        expect(v).toEqual({
            phase: 'Building graph',
            determinate: true,
            percent: 52,
            countsText: '12,400 / 24,000',
        });
    });

    it('indeterminate when total is missing or zero', () => {
        const a = computeSortProgressView({ phase: 'Loading…', current: null, total: null });
        expect(a.determinate).toBe(false);
        expect(a.percent).toBeNull();
        expect(a.countsText).toBe('');
        const b = computeSortProgressView({ phase: 'Loading…', current: 0, total: 0 });
        expect(b.determinate).toBe(false);
    });

    it('clamps percent to 100 when current exceeds total', () => {
        expect(computeSortProgressView({ phase: 'x', current: 30, total: 24 }).percent).toBe(100);
    });
});

describe('getMediaIndex (cached path→index map)', () => {
    function ctx(paths) {
        return {
            mediaFiles: paths.map((p) => ({ path: p })),
            _mediaPathIndex: null,
            _mediaPathIndexSource: null,
        };
    }

    it('returns the index of a present path and -1 for an absent one', () => {
        const c = ctx(['a.jpg', 'b.jpg', 'c.jpg']);
        expect(getMediaIndex.call(c, 'b.jpg')).toBe(1);
        expect(getMediaIndex.call(c, 'missing.jpg')).toBe(-1);
    });

    it('rebuilds when mediaFiles is reassigned (reference change)', () => {
        const c = ctx(['a.jpg', 'b.jpg']);
        expect(getMediaIndex.call(c, 'a.jpg')).toBe(0);
        c.mediaFiles = [{ path: 'x.jpg' }, { path: 'a.jpg' }]; // new array (e.g. after a sort)
        expect(getMediaIndex.call(c, 'a.jpg')).toBe(1);
    });

    it('rebuilds when the array length changes (in-place splice)', () => {
        const c = ctx(['a.jpg', 'b.jpg', 'c.jpg']);
        expect(getMediaIndex.call(c, 'c.jpg')).toBe(2);
        c.mediaFiles.splice(0, 1); // remove a.jpg in place — same array reference
        expect(getMediaIndex.call(c, 'c.jpg')).toBe(1);
    });
});

describe('clipVectorsNeedExtraction', () => {
    const clipVectorsNeedExtraction = extractMethod('clipVectorsNeedExtraction');

    it('returns false when CLIP is disabled (even with uncached files)', () => {
        const ctx = {
            enableClipFeatures: false,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map(),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(false);
    });

    it('returns true when CLIP enabled and clipCache is empty', () => {
        const ctx = {
            enableClipFeatures: true,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map(),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(true);
    });

    it('returns true when at least one current file lacks a clip vector', () => {
        const ctx = {
            enableClipFeatures: true,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map([['a', new Float32Array(512)]]),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(true);
    });

    it('returns false when every current file already has a clip vector in memory', () => {
        const ctx = {
            enableClipFeatures: true,
            mediaFiles: [{ path: 'a' }, { path: 'b' }],
            clipCache: new Map([
                ['a', new Float32Array(512)],
                ['b', new Float32Array(512)],
            ]),
        };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(false);
    });

    it('returns false for an empty folder (nothing to extract)', () => {
        const ctx = { enableClipFeatures: true, mediaFiles: [], clipCache: new Map() };
        expect(clipVectorsNeedExtraction.call(ctx)).toBe(false);
    });
});

describe('lazy extraction wiring (Group P3)', () => {
    it('loadFolder no longer kicks off background extraction on folder open', () => {
        expect(methodSource('loadFolder')).not.toContain('kickoffBackgroundExtractionIfEnabled');
    });

    it('CLIP enable-toggle handler no longer kicks off extraction', () => {
        // The only kickoff call inside setupEventListeners was the toggle-on branch (Group C);
        // under lazy semantics toggling CLIP on just enables the capability. Extract only the
        // handler body so the assertion does not depend on the whole 500-line method.
        const anchor = "clipToggle.addEventListener('change'";
        const start = source.indexOf(anchor);
        expect(start).toBeGreaterThan(-1);
        const open = source.indexOf('{', start);
        let depth = 0;
        let end = -1;
        for (let i = open; i < source.length; i++) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        const handlerBody = source.slice(open, end);
        expect(handlerBody).not.toContain('kickoffBackgroundExtractionIfEnabled');
    });
});

describe('methodSource — literal-brace guard', () => {
    // Wrap body lines into a minimal 4-space-indented class method so the
    // class-method regex (`^\s{4}(?:async\s+)?name\(`) matches, then feed it
    // through methodSource via the `src` override — no media-viewer.js edit needed.
    const wrap = (bodyLines) =>
        ['class X {', '    sample() {', ...bodyLines.map((l) => '        ' + l), '    }', '}'].join('\n');

    it('extracts the real loadFolder body without throwing (guard passes on live code)', () => {
        expect(() => methodSource('loadFolder')).not.toThrow();
        expect(methodSource('loadFolder')).not.toContain('kickoffBackgroundExtractionIfEnabled');
    });

    it('does not throw on a balanced template interpolation (`${x}` nets to zero)', () => {
        const src = wrap(['const s = `value ${x} end`;', 'return s;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });

    it('does not throw on a balanced brace pair inside a string ("{}" nets to zero)', () => {
        const src = wrap(['const s = "{}";', 'return s;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });

    it('throws on an unbalanced open brace inside a string ("{")', () => {
        const src = wrap(['const s = "oops {";', 'return s;']);
        expect(() => methodSource('sample', src)).toThrow('unbalanced brace inside a string/template literal');
    });

    it('throws on an unbalanced close brace in template text (`}`)', () => {
        const src = wrap(['const s = `oops }`;', 'return s;']);
        // The naive extractor stops at the `}` inside the template, truncating the body
        // mid-template → the guard throws the "unterminated" (not the "unbalanced-span") path.
        expect(() => methodSource('sample', src)).toThrow('body ends inside an unterminated string/template literal');
    });

    it('does not throw on an apostrophe inside a line comment (the loadFolder failure mode)', () => {
        // Without comment-skipping, the apostrophe in `folder's` would open a phantom
        // single-quote span that swallows code and false-throws. Comment is skipped now.
        const src = wrap(["// refresh the folder's view", 'const s = `${x}`;', 'return s;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });

    it('does not throw on a block comment (contents skipped like line comments)', () => {
        const src = wrap(["/* reset the folder's state */", 'const s = `${x}`;', 'return s;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });

    it('ACCEPTED RESIDUAL: an unbalanced brace inside a comment is not detected', () => {
        // By the approved design the guard skips comment CONTENTS, so a lone brace in a
        // comment is invisible to it even though methodSource's naive outer counter
        // miscounts it. Documented, not fixed — a comment brace is among the guard's
        // accepted residuals (see its doc-comment above). This pins current behavior so a
        // future fix (or regression) is visible.
        const src = wrap(['// legacy config { was removed', 'const x = 1;', 'return x;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });
});

describe('showTournamentLeavePrompt continuation', () => {
    const showTournamentLeavePrompt = extractMethod('showTournamentLeavePrompt');

    const makeEl = () => ({ textContent: '', innerHTML: '', style: {}, onclick: null });
    let elements;

    beforeEach(() => {
        elements = {
            tournamentResumeModal: makeEl(),
            tournamentResumeTitle: makeEl(),
            tournamentResumeBody: makeEl(),
            tournamentResumeAccept: makeEl(),
            tournamentResumeDiscard: makeEl(),
            tournamentResumeCancel: makeEl(),
        };
        globalThis.document = { getElementById: (id) => elements[id] };
    });
    afterEach(() => {
        delete globalThis.document;
    });

    const makeCtx = () => ({
        tournament: {
            engine: { getProgress: () => ({ gamesPlayed: 1, gamesTotal: 3 }) },
            flush: vi.fn().mockResolvedValue(undefined),
            handleDiscard: vi.fn().mockResolvedValue(undefined),
        },
    });

    it('runs the continuation after Save & leave (flush + engine nulled)', async () => {
        const ctx = makeCtx();
        const onAfterLeave = vi.fn().mockResolvedValue(undefined);
        showTournamentLeavePrompt.call(ctx, onAfterLeave);
        await elements.tournamentResumeAccept.onclick();
        expect(ctx.tournament.flush).toHaveBeenCalledTimes(1);
        expect(ctx.tournament.engine).toBeNull();
        expect(onAfterLeave).toHaveBeenCalledTimes(1);
    });

    it('runs the continuation after Discard', async () => {
        const ctx = makeCtx();
        const onAfterLeave = vi.fn().mockResolvedValue(undefined);
        showTournamentLeavePrompt.call(ctx, onAfterLeave);
        await elements.tournamentResumeDiscard.onclick();
        expect(ctx.tournament.handleDiscard).toHaveBeenCalledTimes(1);
        expect(onAfterLeave).toHaveBeenCalledTimes(1);
    });

    it('does NOT run the continuation on Cancel and hides the modal', () => {
        const ctx = makeCtx();
        const onAfterLeave = vi.fn();
        showTournamentLeavePrompt.call(ctx, onAfterLeave);
        elements.tournamentResumeCancel.onclick();
        expect(onAfterLeave).not.toHaveBeenCalled();
        expect(elements.tournamentResumeModal.style.display).toBe('none');
    });

    it('still runs the continuation + hides the modal if Discard rejects (fail-safe)', async () => {
        const ctx = makeCtx();
        ctx.tournament.handleDiscard = vi.fn().mockRejectedValue(new Error('disk fail'));
        const logError = vi.fn();
        globalThis.window = { electronAPI: { logError } };
        const onAfterLeave = vi.fn().mockResolvedValue(undefined);
        try {
            showTournamentLeavePrompt.call(ctx, onAfterLeave);
            await elements.tournamentResumeDiscard.onclick();
            expect(ctx.tournament.handleDiscard).toHaveBeenCalledTimes(1);
            expect(logError).toHaveBeenCalled();
            expect(onAfterLeave).toHaveBeenCalledTimes(1);
            expect(elements.tournamentResumeModal.style.display).toBe('none');
        } finally {
            delete globalThis.window;
        }
    });
});

describe('handleAppCloseRequest', () => {
    const handleAppCloseRequest = extractMethod('handleAppCloseRequest');
    let allowAppClose, logError;

    beforeEach(() => {
        allowAppClose = vi.fn();
        logError = vi.fn();
        globalThis.window = { electronAPI: { allowAppClose, logError } };
        // Re-entrancy guard reads the leave/resume modal's display state; default it absent
        // (no open modal) so pre-existing tests exercise the non-guarded path unchanged.
        globalThis.document = { getElementById: () => null };
    });
    afterEach(() => {
        delete globalThis.window;
        delete globalThis.document;
    });

    it('allows close immediately when not in tournament mode', () => {
        const ctx = { isTournamentMode: false, tournament: {}, showTournamentLeavePrompt: vi.fn() };
        handleAppCloseRequest.call(ctx);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        expect(ctx.showTournamentLeavePrompt).not.toHaveBeenCalled();
    });

    it('allows close immediately when the tournament is complete', () => {
        const ctx = {
            isTournamentMode: true,
            tournament: { engine: { isComplete: () => true } },
            showTournamentLeavePrompt: vi.fn(),
        };
        handleAppCloseRequest.call(ctx);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
        expect(ctx.showTournamentLeavePrompt).not.toHaveBeenCalled();
    });

    it('shows the leave prompt for an incomplete tournament; its continuation allows close', () => {
        const ctx = {
            isTournamentMode: true,
            tournament: { engine: { isComplete: () => false } },
            showTournamentLeavePrompt: vi.fn(),
        };
        handleAppCloseRequest.call(ctx);
        expect(ctx.showTournamentLeavePrompt).toHaveBeenCalledTimes(1);
        expect(allowAppClose).not.toHaveBeenCalled();
        const continuation = ctx.showTournamentLeavePrompt.mock.calls[0][0];
        continuation();
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('re-entrancy guard: no-ops when the LEAVE prompt is already open', () => {
        globalThis.document = {
            getElementById: (id) => {
                if (id === 'tournamentResumeModal') return { style: { display: 'flex' } };
                if (id === 'tournamentResumeTitle') return { textContent: 'Leave tournament?' };
                return null;
            },
        };
        const ctx = {
            isTournamentMode: true,
            tournament: { engine: { isComplete: () => false } },
            showTournamentLeavePrompt: vi.fn(),
        };
        handleAppCloseRequest.call(ctx);
        expect(ctx.showTournamentLeavePrompt).not.toHaveBeenCalled();
        expect(allowAppClose).not.toHaveBeenCalled();
    });

    it('does NOT guard when the RESUME prompt is open — window stays closable (allows close)', () => {
        // The 'Resume tournament?' prompt reuses the SAME modal but shows while isTournamentMode
        // is still false (before entering); clicking X during it must fall through to
        // allowAppClose(), not be swallowed by the leave-prompt re-entrancy guard.
        globalThis.document = {
            getElementById: (id) => {
                if (id === 'tournamentResumeModal') return { style: { display: 'flex' } };
                if (id === 'tournamentResumeTitle') return { textContent: 'Resume tournament?' };
                return null;
            },
        };
        const ctx = { isTournamentMode: false, tournament: {}, showTournamentLeavePrompt: vi.fn() };
        handleAppCloseRequest.call(ctx);
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });

    it('still allows close if the handler throws (fail-safe)', () => {
        const ctx = {
            get isTournamentMode() {
                throw new Error('boom');
            },
            tournament: {},
            showTournamentLeavePrompt: vi.fn(),
        };
        handleAppCloseRequest.call(ctx);
        expect(logError).toHaveBeenCalled();
        expect(allowAppClose).toHaveBeenCalledTimes(1);
    });
});

describe('loadFeatureCache incremental + signal', () => {
    const loadFeatureCacheLocked = extractAsyncMethod('_loadFeatureCacheLocked');

    const savedWindow = globalThis.window;
    const savedMediaViewer = globalThis.MediaViewer;
    beforeEach(() => {
        // The extracted method body references the static class field
        // `MediaViewer.FEATURE_CACHE_VERSION` directly (not `this.constructor...`); `new Function`
        // resolves free identifiers against the global object, so the real class (never
        // imported here — this file drives extracted method bodies, not the live class) must be
        // stood in for with a stub carrying the same value.
        // NOTE: keep in sync with MediaViewer.FEATURE_CACHE_VERSION in media-viewer.js.
        globalThis.MediaViewer = { FEATURE_CACHE_VERSION: 4 };
    });
    afterEach(() => {
        globalThis.window = savedWindow;
        globalThis.MediaViewer = savedMediaViewer;
    });

    function mkFile(name, size, mtime) {
        return { name, path: '/d/' + name, size, mtimeMs: mtime };
    }
    function mkEntry(size, mtime) {
        return { vector: Array.from({ length: 64 }, () => 0.1), clipVector: null, size, mtime };
    }

    function installApi(chunks, { version = 4, count } = {}) {
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () =>
                    Promise.resolve({ success: true, version, count: count ?? chunks.flat().length }),
                featureCacheChunk: (offset, limit) =>
                    Promise.resolve({ entries: chunks.flat().slice(offset, offset + limit) }),
                featureCacheClose: () => Promise.resolve({ success: true }),
            },
        };
    }

    it('populates this.featureCache incrementally and reports progress', async () => {
        const files = [mkFile('a.png', 10, 100), mkFile('b.png', 20, 200)];
        installApi([
            [
                ['a.png', mkEntry(10, 100)],
                ['b.png', mkEntry(20, 200)],
            ],
        ]);
        const seen = [];
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, { onProgress: (c, t) => seen.push([c, t]) });
        expect(ctx.featureCache.size).toBe(2);
        expect(seen[seen.length - 1][0]).toBe(2); // final progress reached total
    });

    it('stops on signal.aborted without loading everything', async () => {
        const files = Array.from({ length: 5 }, (_, i) => mkFile(`f${i}.png`, i, i));
        installApi([files.map((f) => [f.name, mkEntry(f.size, f.mtimeMs)])], { count: 5 });
        const controller = new AbortController();
        controller.abort(); // aborted before the first chunk
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, { signal: controller.signal });
        expect(ctx.featureCache.size).toBe(0);
    });

    it('leaves an existing cache untouched when the file is not found', async () => {
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: false, notFound: true }),
                featureCacheClose: () => Promise.resolve({ success: true }),
                readFile: () => Promise.resolve(null),
            },
        };
        const existing = new Map([['/d/a.png', new Float32Array(64)]]);
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: [mkFile('a.png', 10, 100)],
            featureCache: existing,
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, {});
        expect(ctx.featureCache).toBe(existing); // same reference, not replaced
    });

    it('a cancelled mid-load leaves the existing cache untouched (no truncation)', async () => {
        // DATA-LOSS REGRESSION LOCK. Staging is local; a mid-stream cancel must NOT truncate a
        // warm cache. If a partial live map survived a cancel, the 30s auto-save would later
        // atomically overwrite the full on-disk .feature_cache.json with the truncated map,
        // permanently destroying the un-loaded vectors.
        // 1500 files → the CHUNK=1000 loop iterates twice (offset 0, offset 1000). Abort AFTER
        // the first chunk's onProgress fires; the loop's top-of-iteration signal check breaks
        // before committing. The prior cache (keys NOT in the reload set) must be preserved
        // untouched — same reference, same entries, and none of the staged reload keys leaked in.
        const files = Array.from({ length: 1500 }, (_, i) => mkFile(`f${i}.png`, i, i));
        installApi([files.map((f) => [f.name, mkEntry(f.size, f.mtimeMs)])], { count: 1500 });
        const controller = new AbortController();
        const prior = new Map([
            ['/d/old1.png', new Float32Array(64)],
            ['/d/old2.png', new Float32Array(64)],
        ]);
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: prior,
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, {
            signal: controller.signal,
            onProgress: (loaded) => {
                if (loaded >= 1) controller.abort();
            },
        });
        expect(ctx.featureCache).toBe(prior); // same reference — never replaced
        expect(ctx.featureCache.size).toBe(2); // prior entries intact, not truncated
        expect(ctx.featureCache.has('/d/old1.png')).toBe(true);
        expect(ctx.featureCache.has('/d/f0.png')).toBe(false); // no staged reload key leaked in
    });

    it('falls through to the legacy read when a chunk fetch throws mid-stream', async () => {
        // Staging is local, so a mid-stream chunk throw commits NOTHING into this.* — the
        // existing cache is intact and the streaming failure safely falls through to the legacy
        // single-read path, which rebuilds from scratch. readFile returns a full valid cache;
        // the assertions prove the legacy path ran AND produced the complete 1500-entry cache
        // (the partial staged chunk 1 was cleared, never clobbering the on-disk cache mid-way).
        const files = Array.from({ length: 1500 }, (_, i) => mkFile(`f${i}.png`, i, i));
        const all = files.map((f) => [f.name, mkEntry(f.size, f.mtimeMs)]);
        let readFileCalled = false;
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: true, version: 4, count: 1500 }),
                featureCacheChunk: (offset) => {
                    if (offset === 0) return Promise.resolve({ entries: all.slice(0, 1000) });
                    return Promise.reject(new Error('IPC hiccup on chunk 2'));
                },
                featureCacheClose: () => Promise.resolve({ success: true }),
                readFile: () => {
                    readFileCalled = true;
                    return Promise.resolve(JSON.stringify({ version: 4, features: Object.fromEntries(all) }));
                },
            },
        };
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        const size = await loadFeatureCacheLocked.call(ctx, {});
        expect(readFileCalled).toBe(true); // streaming failure fell through to legacy
        expect(size).toBe(1500); // full legacy contents, not the partial chunk 1
        expect(ctx.featureCache.size).toBe(1500);
    });

    it('consumes the binary chunk shape (vecBuf/clipBuf) into the caches', async () => {
        const files = [mkFile('a.png', 10, 100)];
        const vecs = new Float32Array(64).fill(0.5);
        const clips = new Float32Array(512).fill(0.25);
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: true, version: 4, count: 1 }),
                featureCacheChunk: () =>
                    Promise.resolve({
                        names: ['a.png'],
                        sizes: [10],
                        mtimes: [100],
                        hasClip: [1],
                        vecBuf: vecs.buffer,
                        clipBuf: clips.buffer,
                    }),
                featureCacheClose: () => Promise.resolve({ success: true }),
            },
        };
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, {});
        expect(ctx.featureCache.get('/d/a.png')[0]).toBeCloseTo(0.5);
        expect(ctx.clipCache.get('/d/a.png')[0]).toBeCloseTo(0.25);
    });

    it('does NOT cache a clip vector for a binary entry with hasClip=0 (garbage clipBuf ignored)', async () => {
        // The clipBuf carries a full-width 512 slot for EVERY entry; a no-clip entry's slot may
        // hold arbitrary bytes. The hasClip mask — not the buffer contents — must gate caching,
        // else zeroed/garbage clips silently leak in and corrupt CLIP sort.
        const files = [mkFile('a.png', 10, 100)];
        const vecs = new Float32Array(64).fill(0.5);
        const clips = new Float32Array(512).fill(0.9); // deliberate non-zero garbage in the unused slot
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: true, version: 4, count: 1 }),
                featureCacheChunk: () =>
                    Promise.resolve({
                        names: ['a.png'],
                        sizes: [10],
                        mtimes: [100],
                        hasClip: [0],
                        vecBuf: vecs.buffer,
                        clipBuf: clips.buffer,
                    }),
                featureCacheClose: () => Promise.resolve({ success: true }),
            },
        };
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, {});
        expect(ctx.featureCache.get('/d/a.png')[0]).toBeCloseTo(0.5); // 64-dim vector still lands
        expect(ctx.clipCache.has('/d/a.png')).toBe(false); // no garbage clip leaked in
    });

    it('round-trips distinct vectors for a multi-entry binary chunk (i*64 / i*512 offset math)', async () => {
        // Two entries in one buffer: proves the per-entry offset arithmetic is correct for i>0.
        // A silent off-by-64/off-by-512 regression would swap or corrupt entry 1's vectors with
        // no other failing test.
        const files = [mkFile('a.png', 10, 100), mkFile('b.png', 20, 200)];
        const vecs = new Float32Array(2 * 64);
        vecs.fill(0.25, 0, 64); // entry 0
        vecs.fill(0.75, 64, 128); // entry 1
        const clips = new Float32Array(2 * 512);
        clips.fill(0.1, 0, 512); // entry 0
        clips.fill(0.2, 512, 1024); // entry 1
        globalThis.window = {
            electronAPI: {
                path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
                featureCacheOpen: () => Promise.resolve({ success: true, version: 4, count: 2 }),
                featureCacheChunk: () =>
                    Promise.resolve({
                        names: ['a.png', 'b.png'],
                        sizes: [10, 20],
                        mtimes: [100, 200],
                        hasClip: [1, 1],
                        vecBuf: vecs.buffer,
                        clipBuf: clips.buffer,
                    }),
                featureCacheClose: () => Promise.resolve({ success: true }),
            },
        };
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, {});
        expect(ctx.featureCache.get('/d/a.png')[0]).toBeCloseTo(0.25);
        expect(ctx.featureCache.get('/d/b.png')[0]).toBeCloseTo(0.75);
        expect(ctx.clipCache.get('/d/a.png')[0]).toBeCloseTo(0.1);
        expect(ctx.clipCache.get('/d/b.png')[0]).toBeCloseTo(0.2);
    });

    it('ingests an entry whose size/mtime EXACTLY match the current file as a cache HIT', async () => {
        // G1 Task-7 defensive regression guard. The staleness gate in `ingest` compares
        // size/mtime with strict `!==`, and BOTH sides derive from the same fs.stat() values:
        // the on-disk entry (written full-precision — round6 touches only the vectors) and the
        // live mediaFiles entry (main.js load-folder → stats.size / stats.mtimeMs). A realistic
        // large size + sub-ms fractional mtimeMs must round-trip through JSON/IPC to an exact
        // match and be INGESTED, not dropped as stale. Any future drift (float truncation,
        // ms-vs-s, a Float32 downcast of size/mtime, string-vs-number) would fail this.
        const size = 5368709123; // > 2^32 and past Float32 exact-integer range (2^24)
        const mtime = 1673456789012.345; // sub-ms fractional mtimeMs
        const files = [mkFile('a.png', size, mtime)];
        installApi([[['a.png', mkEntry(size, mtime)]]]);
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: files,
            featureCache: new Map(),
            featureMetadata: new Map(),
            clipCache: new Map(),
        };
        await loadFeatureCacheLocked.call(ctx, {});
        expect(ctx.featureCache.size).toBe(1); // HIT — not dropped as stale
        expect(ctx.featureCache.has('/d/a.png')).toBe(true);
        expect(ctx.featureMetadata.get('/d/a.png')).toEqual({ size, mtime });
    });
});

describe('extraction progress sink', () => {
    const showBackgroundExtractionProgress = extractMethod('showBackgroundExtractionProgress');

    it('routes to the sink and skips the DOM element when a sink is set', () => {
        const calls = [];
        const ctx = {
            extractionProgressSink: (c, t) => calls.push([c, t]),
            _extractionCachedCount: 0,
        };
        // document is available in the vitest jsdom-free env only if configured; guard:
        // (globalThis.document, not bare `document`, to satisfy no-undef under the node-only test globals)
        const before =
            typeof globalThis.document !== 'undefined'
                ? globalThis.document.getElementById('featureExtractionProgress')
                : null;
        showBackgroundExtractionProgress.call(ctx, 8, 24);
        expect(calls).toEqual([[8, 24]]);
        expect(before).toBeNull();
    });
});

describe('saveFeatureCache data-loss guards', () => {
    // DATA-LOSS REGRESSION LOCKS. A real user lost a 23,559-entry / 126MB .feature_cache.json:
    // extraction skipped featureMetadata for files whose mediaFiles lookup failed, buildEntry
    // serialized those as size:0/mtime:0, the next load rejected all of them as stale (0 never
    // matches a real stat), and the resulting 32-entry in-memory map was auto-saved over the
    // full on-disk cache. Two independent guards below; both must stay armed.
    const saveFeatureCacheLocked = extractAsyncMethod('_saveFeatureCacheLocked');

    const savedWindow = globalThis.window;
    const savedMediaViewer = globalThis.MediaViewer;
    let api;
    let written;
    let warnSpy;

    beforeEach(() => {
        // The extracted method body references the static class field
        // `MediaViewer.FEATURE_CACHE_VERSION` as a free identifier; `new AsyncFunction` resolves
        // free identifiers against the global object, so the real class (never imported here)
        // must be stood in for with a stub carrying the same value.
        // NOTE: keep in sync with MediaViewer.FEATURE_CACHE_VERSION in media-viewer.js.
        globalThis.MediaViewer = { FEATURE_CACHE_VERSION: 4 };
        written = [];
        api = {
            path: { join: (...a) => a.join('/'), basename: (p) => p.split('/').pop() },
            featureCacheWriteOpen: vi.fn(() => Promise.resolve({ success: true })),
            featureCacheWriteChunk: vi.fn((batch) => {
                written.push(...batch);
                return Promise.resolve({ success: true });
            }),
            featureCacheWriteClose: vi.fn(() => Promise.resolve({ success: true })),
            writeFile: vi.fn(() => Promise.resolve({ success: true })),
            logError: vi.fn(),
        };
        globalThis.window = { electronAPI: api };
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warnSpy.mockRestore();
        globalThis.window = savedWindow;
        globalThis.MediaViewer = savedMediaViewer;
    });

    function mkCtx({ diskCount, cacheSize, fileCount }) {
        const featureCache = new Map();
        const featureMetadata = new Map();
        for (let i = 0; i < cacheSize; i++) {
            const p = `/d/f${i}.png`;
            featureCache.set(p, new Float32Array(64).fill(0.5));
            featureMetadata.set(p, { size: 100 + i, mtime: 1000 + i });
        }
        return {
            baseFolderPath: '/d',
            mediaFiles: Array.from({ length: fileCount }, (_, i) => ({
                path: `/d/f${i}.png`,
                size: 100 + i,
                mtimeMs: 1000 + i,
            })),
            featureCache,
            featureMetadata,
            clipCache: new Map(),
            _featureCacheDiskCount: diskCount,
        };
    }

    it('blocks the catastrophe: 32 in-memory entries never replace a 23,559-entry disk cache', async () => {
        const ctx = mkCtx({ diskCount: 23559, cacheSize: 32, fileCount: 20929 });
        await saveFeatureCacheLocked.call(ctx);
        // No write IPC of ANY kind may fire — not even the streaming open, which truncates the
        // temp file and commits on close.
        expect(api.featureCacheWriteOpen).not.toHaveBeenCalled();
        expect(api.featureCacheWriteChunk).not.toHaveBeenCalled();
        expect(api.featureCacheWriteClose).not.toHaveBeenCalled();
        expect(api.writeFile).not.toHaveBeenCalled();
        expect(api.logError).toHaveBeenCalledWith(expect.stringContaining('shrink guard'));
        expect(ctx._featureCacheDiskCount).toBe(23559); // baseline untouched by the skipped save
    });

    it('allows a legitimate prune: the folder really shrank, so the smaller map must persist', async () => {
        const ctx = mkCtx({ diskCount: 23559, cacheSize: 5000, fileCount: 5000 });
        await saveFeatureCacheLocked.call(ctx);
        expect(api.featureCacheWriteOpen).toHaveBeenCalledTimes(1);
        expect(api.featureCacheWriteClose).toHaveBeenCalledTimes(1);
        expect(written).toHaveLength(5000);
        expect(ctx._featureCacheDiskCount).toBe(5000); // re-baselined to what was actually written
    });

    it('allows a fresh build-up when no on-disk cache is known (diskCount 0 → guard inactive)', async () => {
        const ctx = mkCtx({ diskCount: 0, cacheSize: 500, fileCount: 20929 });
        await saveFeatureCacheLocked.call(ctx);
        expect(api.featureCacheWriteOpen).toHaveBeenCalledTimes(1);
        expect(written).toHaveLength(500);
        expect(ctx._featureCacheDiskCount).toBe(500);
    });

    it('skips unresolvable entries rather than poisoning them with size:0/mtime:0', async () => {
        const ctx = {
            baseFolderPath: '/d',
            // `live.png` has no featureMetadata but IS in mediaFiles → resolvable from live stats.
            // `orphan.png` has neither → unresolvable, must be skipped entirely.
            mediaFiles: [{ path: '/d/live.png', size: 222, mtimeMs: 2222 }],
            featureCache: new Map([
                ['/d/meta.png', new Float32Array(64).fill(0.1)],
                ['/d/live.png', new Float32Array(64).fill(0.2)],
                ['/d/orphan.png', new Float32Array(64).fill(0.3)],
            ]),
            featureMetadata: new Map([['/d/meta.png', { size: 111, mtime: 1111 }]]),
            clipCache: new Map(),
            _featureCacheDiskCount: 0,
        };
        await saveFeatureCacheLocked.call(ctx);
        const names = written.map(([name]) => name);
        expect(names).toEqual(['meta.png', 'live.png']);
        expect(names).not.toContain('orphan.png');
        const byName = Object.fromEntries(written);
        expect(byName['meta.png']).toMatchObject({ size: 111, mtime: 1111 });
        expect(byName['live.png']).toMatchObject({ size: 222, mtime: 2222 });
        // No entry may carry the poison stats that made the cache unloadable forever.
        for (const [, entry] of written) {
            expect(entry.size).not.toBe(0);
            expect(entry.mtime).not.toBe(0);
        }
        expect(ctx._featureCacheDiskCount).toBe(2); // counts what was written, not map size (3)
    });

    it('skips unresolvable entries on the legacy single-write path too', async () => {
        delete api.featureCacheWriteOpen; // force the legacy fallback
        const ctx = {
            baseFolderPath: '/d',
            mediaFiles: [],
            featureCache: new Map([
                ['/d/meta.png', new Float32Array(64).fill(0.1)],
                ['/d/orphan.png', new Float32Array(64).fill(0.3)],
            ]),
            featureMetadata: new Map([['/d/meta.png', { size: 111, mtime: 1111 }]]),
            clipCache: new Map(),
            _featureCacheDiskCount: 0,
        };
        await saveFeatureCacheLocked.call(ctx);
        expect(api.writeFile).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(api.writeFile.mock.calls[0][1]);
        expect(Object.keys(payload.features)).toEqual(['meta.png']);
        expect(ctx._featureCacheDiskCount).toBe(1);
    });
});

describe('handleTournamentUndo (unified undo stack)', () => {
    const handleTournamentUndo = extractAsyncMethod('handleTournamentUndo');

    function makeCtx(pending, overrides = {}) {
        const engine = {
            peekUndoEntry: vi.fn(() => pending),
            undoUserAction: vi.fn(() => pending),
        };
        return {
            isTournamentMode: true,
            isLoading: false,
            baseFolderPath: '/src',
            showRatingConfirmations: false,
            mediaFiles: [],
            moveHistory: [],
            tournament: { engine, _schedulePersist: vi.fn() },
            showNotification: vi.fn(),
            showError: vi.fn(),
            restoreFeatureCachesFromHistory: vi.fn(),
            updateFolderInfo: vi.fn(),
            showTournamentPair: vi.fn(async () => {}),
            ...overrides,
        };
    }

    const SPECIAL_META = {
        fileName: 'c.jpg',
        originalPath: '/src/c.jpg',
        newPath: '/special/c.jpg',
        fileSize: 9,
        fileType: 'image',
        actionType: 'special',
    };

    beforeEach(() => {
        globalThis.window = {
            electronAPI: {
                moveFile: vi.fn(async () => ({ success: true })),
                // Reached only by the stack-changed rollback path; real dirname so the target
                // folder assertion is faithful rather than tautological.
                path: { dirname: (p) => path.dirname(p) },
                logError: vi.fn(),
            },
        };
    });

    afterEach(() => {
        delete globalThis.window;
    });

    it('notifies and leaves the engine alone when there is nothing to undo', async () => {
        const ctx = makeCtx(null);
        await handleTournamentUndo.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledWith('Nothing to undo', 'info');
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });

    it('undoes a pick without touching the disk', async () => {
        const ctx = makeCtx({ kind: 'pick' });
        await handleTournamentUndo.call(ctx);
        expect(ctx.tournament.engine.undoUserAction).toHaveBeenCalledTimes(1);
        expect(globalThis.window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx.tournament._schedulePersist).toHaveBeenCalledWith('/src');
        expect(ctx.showTournamentPair).toHaveBeenCalled();
    });

    it('bails while isLoading (mirrors handleTournamentPick/handleTournamentDraw)', async () => {
        const ctx = makeCtx({ kind: 'pick' }, { isLoading: true });
        await handleTournamentUndo.call(ctx);
        expect(ctx.tournament.engine.peekUndoEntry).not.toHaveBeenCalled();
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
    });

    it('restores the file on disk, then advances the stack, for a special entry', async () => {
        const ctx = makeCtx({ kind: 'special', meta: SPECIAL_META }, { moveHistory: [SPECIAL_META] });
        await handleTournamentUndo.call(ctx);
        expect(globalThis.window.electronAPI.moveFile).toHaveBeenCalledWith({
            sourcePath: '/special/c.jpg',
            targetFolder: '/src',
            fileName: 'c.jpg',
        });
        expect(ctx.tournament.engine.undoUserAction).toHaveBeenCalledTimes(1);
        expect(ctx.mediaFiles).toEqual([{ name: 'c.jpg', path: '/src/c.jpg', size: 9, type: 'image' }]);
        expect(ctx.restoreFeatureCachesFromHistory).toHaveBeenCalledWith(SPECIAL_META);
        expect(ctx.moveHistory).toEqual([]); // the consumed entry is removed by identity
        expect(ctx.showTournamentPair).toHaveBeenCalled();
    });

    it('leaves the stack, moveHistory and mediaFiles untouched when the disk restore fails', async () => {
        const ctx = makeCtx({ kind: 'special', meta: SPECIAL_META }, { moveHistory: [SPECIAL_META] });
        globalThis.window.electronAPI.moveFile = vi.fn(async () => ({ success: false, error: 'EPERM' }));
        await handleTournamentUndo.call(ctx);
        expect(ctx.showError).toHaveBeenCalled();
        expect(ctx.tournament.engine.peekUndoEntry).toHaveBeenCalledTimes(1);
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([SPECIAL_META]);
        expect(ctx.mediaFiles).toEqual([]);
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });

    it('holds isLoading as a mutex while the disk restore is in flight, clearing it on success', async () => {
        const ctx = makeCtx({ kind: 'special', meta: SPECIAL_META }, { moveHistory: [SPECIAL_META] });
        let resolveMoveFile;
        globalThis.window.electronAPI.moveFile = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveMoveFile = resolve;
                })
        );
        const pending = handleTournamentUndo.call(ctx);
        // handleTournamentPick/handleTournamentDraw/moveToSpecialFolder all guard on isLoading — while
        // the restore is in flight it must read true, or a concurrent pick could divert the undo.
        expect(ctx.isLoading).toBe(true);
        resolveMoveFile({ success: true });
        await pending;
        expect(ctx.isLoading).toBe(false);
    });

    it('clears isLoading in finally when the disk restore fails mid-flight', async () => {
        const ctx = makeCtx({ kind: 'special', meta: SPECIAL_META }, { moveHistory: [SPECIAL_META] });
        let resolveMoveFile;
        globalThis.window.electronAPI.moveFile = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveMoveFile = resolve;
                })
        );
        const pending = handleTournamentUndo.call(ctx);
        expect(ctx.isLoading).toBe(true);
        resolveMoveFile({ success: false, error: 'EPERM' });
        await pending;
        expect(ctx.isLoading).toBe(false);
        expect(ctx.showError).toHaveBeenCalled();
    });

    it('a special move made outside the tournament cannot divert a pick undo', async () => {
        // THE REPORTED BUG. moveHistory holds a special move made in single mode; the newest
        // engine entry is a pick. Pre-G2 this peeked moveHistory and took the special branch,
        // restoring an unrelated file while the pick stood — "undo did nothing".
        const stray = { ...SPECIAL_META, fileName: 's.jpg', newPath: '/special/s.jpg' };
        const ctx = makeCtx({ kind: 'pick' }, { moveHistory: [stray] });
        await handleTournamentUndo.call(ctx);
        expect(globalThis.window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([stray]);
        expect(ctx.tournament.engine.undoUserAction).toHaveBeenCalledTimes(1);
    });

    // The isLoading mutex is advisory, not owned: showTournamentPairFast never SETS isLoading, but the
    // setupCompare*Handlers it attaches CLEAR it on bothLoaded/onError. So a pair render still in flight
    // when undo starts (special-move → immediate Ctrl+A) drops the flag mid-restore and lets a pick land.
    // These two pin the identity re-check that makes correctness independent of the flag.
    it('does not reverse a different entry when the stack changes during the disk restore', async () => {
        const pending = { kind: 'special', meta: SPECIAL_META };
        const intruder = { kind: 'pick' };
        const ctx = makeCtx(pending, { moveHistory: [SPECIAL_META] });
        let peeks = 0;
        ctx.tournament.engine.peekUndoEntry = vi.fn(() => (peeks++ === 0 ? pending : intruder));

        await handleTournamentUndo.call(ctx);

        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
        expect(ctx.showError).toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
        // Nothing half-applied: the renderer-side state is exactly as it was.
        expect(ctx.moveHistory).toEqual([SPECIAL_META]);
        expect(ctx.mediaFiles).toEqual([]);
        expect(ctx.restoreFeatureCachesFromHistory).not.toHaveBeenCalled();
        // ...and the disk move is rolled back, so the whole undo is a no-op the user can retry.
        expect(globalThis.window.electronAPI.moveFile).toHaveBeenCalledTimes(2);
        expect(globalThis.window.electronAPI.moveFile).toHaveBeenLastCalledWith({
            sourcePath: '/src/c.jpg',
            targetFolder: path.dirname('/special/c.jpg'),
            fileName: 'c.jpg',
        });
    });

    it('logs when the interrupted-undo rollback itself fails', async () => {
        const pending = { kind: 'special', meta: SPECIAL_META };
        const ctx = makeCtx(pending, { moveHistory: [SPECIAL_META] });
        let peeks = 0;
        ctx.tournament.engine.peekUndoEntry = vi.fn(() => (peeks++ === 0 ? pending : { kind: 'pick' }));
        globalThis.window.electronAPI.moveFile = vi
            .fn()
            .mockResolvedValueOnce({ success: true })
            .mockResolvedValueOnce({ success: false, error: 'EBUSY' });

        await handleTournamentUndo.call(ctx);

        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith(expect.stringContaining('EBUSY'));
        expect(ctx.tournament.engine.undoUserAction).not.toHaveBeenCalled();
        expect(ctx.showError).toHaveBeenCalled();
    });
});
