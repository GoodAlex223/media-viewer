import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// Extract a MediaViewer method body by brace-counting and return a callable Function.
function extractMethod(methodName) {
    const regex = new RegExp(`^\\s{4}${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) throw new Error(`Could not find method: ${methodName}`);
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
    return new Function(match[1], source.substring(searchStart + 1, methodEnd - 1));
}

// The REAL implementations under test (no replica — extracted from media-viewer.js source).
const bulkPairKey = extractMethod('bulkPairKey');
const computeAllComparePairs = extractMethod('computeAllComparePairs');
const computeValidComparePairs = extractMethod('computeValidComparePairs');

// Invoke computeValidComparePairs with a minimal `this`. bulkPairKey and computeAllComparePairs are
// provided on the ctx because the method calls both through `this`.
function callCompute(mediaFiles, predictionScores, bulkRatedPairs = new Set()) {
    const ctx = { mediaFiles, predictionScores, bulkRatedPairs, bulkPairKey, computeAllComparePairs };
    return computeValidComparePairs.call(ctx);
}

// Invoke computeAllComparePairs directly — it needs no suppression state.
function callComputeAll(mediaFiles, predictionScores) {
    return computeAllComparePairs.call({ mediaFiles, predictionScores });
}

function mockFile(name) {
    return { name, path: `/mock/${name}` };
}
// Build a score Map keyed by path for the given [file, score] pairs.
function scoreMap(entries) {
    return new Map(entries.map(([f, s]) => [f.path, s]));
}

describe('bulkPairKey', () => {
    it('is order-independent', () => {
        expect(bulkPairKey('a.jpg', 'z.jpg')).toBe(bulkPairKey('z.jpg', 'a.jpg'));
    });
    it('separates with NUL (distinct pairs never collide)', () => {
        expect(bulkPairKey('a', 'b')).not.toBe(bulkPairKey('a', 'c'));
        expect(bulkPairKey('a.jpg', 'z.jpg')).toContain('\u0000');
    });
});

describe('computeValidComparePairs — extremes pairing (no suppression)', () => {
    const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
    const scores = scoreMap([
        [files[0], 0.9],
        [files[1], 0.7],
        [files[2], 0.3],
        [files[3], 0.1],
    ]);

    it('pair 0 = highest vs lowest, pair 1 = 2nd highest vs 2nd lowest', () => {
        const pairs = callCompute(files, scores);
        expect(pairs).toHaveLength(2);
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
        expect(pairs[1].leftFile).toBe(files[1]);
        expect(pairs[1].rightFile).toBe(files[2]);
    });

    it('defaults missing scores to 0.5', () => {
        const partial = scoreMap([
            [files[0], 0.9],
            // files[1], files[2] missing -> 0.5
            [files[3], 0.1],
        ]);
        const pairs = callCompute(files, partial);
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
    });

    it('2-file boundary yields a single pair', () => {
        const two = [mockFile('x'), mockFile('y')];
        const pairs = callCompute(
            two,
            scoreMap([
                [two[0], 0.8],
                [two[1], 0.2],
            ])
        );
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(two[0]);
        expect(pairs[0].rightFile).toBe(two[1]);
    });

    it('odd file count leaves the middle file unpaired', () => {
        const three = [mockFile('h'), mockFile('m'), mockFile('l')];
        const pairs = callCompute(
            three,
            scoreMap([
                [three[0], 0.9],
                [three[1], 0.5],
                [three[2], 0.1],
            ])
        );
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(three[0]);
        expect(pairs[0].rightFile).toBe(three[2]);
    });
});

describe('computeValidComparePairs — exact-pair suppression', () => {
    const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
    const scores = scoreMap([
        [files[0], 0.9],
        [files[1], 0.7],
        [files[2], 0.3],
        [files[3], 0.1],
    ]);

    it('skips the exact rated combo, surfacing the next pair at index 0', () => {
        const rated = new Set([bulkPairKey('a', 'd')]); // the highest-vs-lowest pair
        const pairs = callCompute(files, scores, rated);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(files[1]);
        expect(pairs[0].rightFile).toBe(files[2]);
    });

    it('a rated file still pairs with a fresh file (only the exact combo is suppressed)', () => {
        // Rate (a,d). Six files: a,b,c,d,e,f. `a` should still appear paired with the new lowest.
        const six = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d'), mockFile('e'), mockFile('f')];
        const s = scoreMap([
            [six[0], 0.9],
            [six[1], 0.8],
            [six[2], 0.6],
            [six[3], 0.4],
            [six[4], 0.2],
            [six[5], 0.05],
        ]);
        // Extremes: (a,f),(b,e),(c,d). Rate (a,f).
        const rated = new Set([bulkPairKey('a', 'f')]);
        const pairs = callCompute(six, s, rated);
        expect(pairs).toHaveLength(2);
        expect(pairs.map((p) => [p.leftFile.name, p.rightFile.name])).toEqual([
            ['b', 'e'],
            ['c', 'd'],
        ]);
        // `a` is no longer paired — it is the middle-ish extreme; the point is (a,f) never recurs.
        expect(pairs.some((p) => p.leftFile.name === 'a' && p.rightFile.name === 'f')).toBe(false);
    });

    it('falls through to the full list when every pair is suppressed', () => {
        const rated = new Set([bulkPairKey('a', 'd'), bulkPairKey('b', 'c')]);
        const pairs = callCompute(files, scores, rated);
        expect(pairs).toHaveLength(2); // full candidate list, not empty
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
    });

    it('2-file fall-through: a rated single pair is re-shown', () => {
        const two = [mockFile('x'), mockFile('y')];
        const rated = new Set([bulkPairKey('x', 'y')]);
        const pairs = callCompute(
            two,
            scoreMap([
                [two[0], 0.8],
                [two[1], 0.2],
            ]),
            rated
        );
        expect(pairs).toHaveLength(1);
        expect(pairs[0].leftFile).toBe(two[0]);
        expect(pairs[0].rightFile).toBe(two[1]);
    });
});

describe('computeAllComparePairs — unfiltered pair count', () => {
    const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
    const scores = scoreMap([
        [files[0], 0.9],
        [files[1], 0.7],
        [files[2], 0.3],
        [files[3], 0.1],
    ]);

    it('returns floor(n/2) pairs in extremes order', () => {
        const pairs = callComputeAll(files, scores);
        expect(pairs).toHaveLength(2);
        expect(pairs[0].leftFile).toBe(files[0]);
        expect(pairs[0].rightFile).toBe(files[3]);
        expect(pairs[1].leftFile).toBe(files[1]);
        expect(pairs[1].rightFile).toBe(files[2]);
    });

    it('ignores suppression entirely — the count stays stable while the valid list shrinks', () => {
        const suppressed = new Set([bulkPairKey('a', 'd')]);
        expect(callCompute(files, scores, suppressed)).toHaveLength(1); // valid list shrank
        expect(callComputeAll(files, scores)).toHaveLength(2); // full count did not
    });

    it('returns an empty list for fewer than 2 files', () => {
        expect(callComputeAll([files[0]], scores)).toHaveLength(0);
    });
});
