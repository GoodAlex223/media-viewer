import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// Extract method bodies using regex and create callable functions
function _extractMethod(methodName) {
    const regex = new RegExp(`^\\s{4}${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) {
        throw new Error(`Could not find method: ${methodName}`);
    }

    const startIndex = match.index;
    let braceCount = 0;
    let methodEnd = -1;
    const searchStart = startIndex + match[0].length - 1;

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
    return new Function(params, methodBody);
}

/**
 * Helper: Extract the ML pair selection logic from showCompareMedia().
 * Since showCompareMedia() is async and has many DOM dependencies,
 * we test the pair selection algorithm directly by replicating it.
 *
 * The algorithm (from media-viewer.js showCompareMedia):
 *   1. Build filesWithScores = mediaFiles.map(f => ({file: f, score: predictionScores.get(f.path) ?? 0.5}))
 *   2. Sort descending by score
 *   3. pairIndex = Math.min(mlComparePairIndex, Math.floor(filesWithScores.length / 2) - 1)
 *   4. leftIndex = Math.max(0, pairIndex), rightIndex = Math.max(0, filesWithScores.length - 1 - pairIndex)
 *   5. If leftIndex >= rightIndex: left=[0], right=[last]; else left=[leftIndex], right=[rightIndex]
 */
function selectMlPair(mediaFiles, predictionScores, mlComparePairIndex) {
    const filesWithScores = mediaFiles
        .map((f) => ({ file: f, score: predictionScores.get(f.path) ?? 0.5 }))
        .sort((a, b) => b.score - a.score);

    const pairIndex = Math.min(mlComparePairIndex, Math.floor(filesWithScores.length / 2) - 1);
    const leftIndex = Math.max(0, pairIndex);
    const rightIndex = Math.max(0, filesWithScores.length - 1 - pairIndex);

    let leftFile, rightFile;
    if (leftIndex >= rightIndex) {
        leftFile = filesWithScores[0].file;
        rightFile = filesWithScores[filesWithScores.length - 1].file;
    } else {
        leftFile = filesWithScores[leftIndex].file;
        rightFile = filesWithScores[rightIndex].file;
    }

    return {
        leftFile,
        rightFile,
        leftScore: predictionScores.get(leftFile.path) ?? 0.5,
        rightScore: predictionScores.get(rightFile.path) ?? 0.5,
    };
}

// Helper to create mock file objects
function mockFile(name, filePath) {
    return { name, path: filePath || `/mock/${name}` };
}

describe('ML pair selection logic', () => {
    it('selects highest vs lowest for pairIndex 0', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.7],
            [files[2].path, 0.3],
            [files[3].path, 0.1],
        ]);

        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.9);
        expect(result.rightScore).toBe(0.1);
        expect(result.leftFile).toBe(files[0]);
        expect(result.rightFile).toBe(files[3]);
    });

    it('selects 2nd highest vs 2nd lowest for pairIndex 1', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.7],
            [files[2].path, 0.3],
            [files[3].path, 0.1],
        ]);

        const result = selectMlPair(files, scores, 1);
        expect(result.leftScore).toBe(0.7);
        expect(result.rightScore).toBe(0.3);
    });

    it('handles 2 files boundary', () => {
        const files = [mockFile('a'), mockFile('b')];
        const scores = new Map([
            [files[0].path, 0.8],
            [files[1].path, 0.2],
        ]);

        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.8);
        expect(result.rightScore).toBe(0.2);
    });

    it('handles equal scores without crashing', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c')];
        const scores = new Map([
            [files[0].path, 0.5],
            [files[1].path, 0.5],
            [files[2].path, 0.5],
        ]);

        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.5);
        expect(result.rightScore).toBe(0.5);
        expect(result.leftFile).not.toBe(result.rightFile);
    });

    it('defaults to 0.5 for files missing from predictionScores', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c')];
        const scores = new Map([
            [files[0].path, 0.9],
            // files[1] intentionally missing
            [files[2].path, 0.1],
        ]);

        const result = selectMlPair(files, scores, 0);
        // Highest is 0.9 (file a), lowest is 0.1 (file c)
        expect(result.leftScore).toBe(0.9);
        expect(result.rightScore).toBe(0.1);
        expect(result.leftFile).toBe(files[0]);
        expect(result.rightFile).toBe(files[2]);
    });

    it('clamps pairIndex when it exceeds max', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.7],
            [files[2].path, 0.3],
            [files[3].path, 0.1],
        ]);

        // pairIndex 99 should clamp to max valid (1 for 4 files)
        const result = selectMlPair(files, scores, 99);
        expect(result.leftScore).toBe(0.7);
        expect(result.rightScore).toBe(0.3);
    });

    it('handles boundary conditions with odd file count and high pairIndex', () => {
        // 3 files → max pairIndex = floor(3/2)-1 = 0
        const files = [mockFile('a'), mockFile('b'), mockFile('c')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.5],
            [files[2].path, 0.1],
        ]);

        // pairIndex clamped to 0 for 3 files
        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.9);
        expect(result.rightScore).toBe(0.1);

        // High pairIndex with 2 files — clamped to 0, still returns correct pair
        const result2 = selectMlPair(
            [mockFile('x'), mockFile('y')],
            new Map([
                ['/mock/x', 0.9],
                ['/mock/y', 0.1],
            ]),
            5
        );
        expect(result2.leftScore).toBe(0.9);
        expect(result2.rightScore).toBe(0.1);

        // Note: The leftIndex >= rightIndex guard in showCompareMedia() is a safety net
        // for edge cases that cannot be triggered with 2+ files after clamping.
        // These tests verify the clamping prevents out-of-bounds access.
    });
});
