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

const formatElapsed = extractMethod('formatElapsed');
const formatEta = extractMethod('formatEta');
const formatTimeAgo = extractMethod('formatTimeAgo');
const removeFileFromList = extractMethod('removeFileFromList');
const areFoldersConfigured = extractMethod('areFoldersConfigured');

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
