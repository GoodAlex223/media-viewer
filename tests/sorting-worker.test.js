import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// sorting-worker.js references `self` (Web Worker global) at module level.
// Provide a minimal stub so require() succeeds.
globalThis.self = { onmessage: null, postMessage: () => {} };
const {
    MinHeap,
    VPTree,
    calculateHammingDistance,
    calculateCosineDistance,
    sortMediaBySimilarityClip,
    sortMediaBySimilarityMST,
} = require('../sorting-worker');

describe('MinHeap', () => {
    it('starts empty', () => {
        const heap = new MinHeap();
        expect(heap.isEmpty()).toBe(true);
        expect(heap.size()).toBe(0);
    });

    it('pop on empty heap returns null', () => {
        const heap = new MinHeap();
        expect(heap.pop()).toBeNull();
    });

    it('push and pop single item', () => {
        const heap = new MinHeap();
        heap.push({ distance: 5 });
        expect(heap.size()).toBe(1);
        expect(heap.isEmpty()).toBe(false);
        const item = heap.pop();
        expect(item.distance).toBe(5);
        expect(heap.isEmpty()).toBe(true);
    });

    it('maintains min-heap property', () => {
        const heap = new MinHeap();
        heap.push({ distance: 5 });
        heap.push({ distance: 2 });
        heap.push({ distance: 8 });
        heap.push({ distance: 1 });
        heap.push({ distance: 4 });

        const sorted = [];
        while (!heap.isEmpty()) {
            sorted.push(heap.pop().distance);
        }
        expect(sorted).toEqual([1, 2, 4, 5, 8]);
    });

    it('handles duplicate distances', () => {
        const heap = new MinHeap();
        heap.push({ distance: 3 });
        heap.push({ distance: 3 });
        heap.push({ distance: 1 });
        expect(heap.pop().distance).toBe(1);
        expect(heap.pop().distance).toBe(3);
        expect(heap.pop().distance).toBe(3);
    });

    it('supports custom compare function (max-heap)', () => {
        const heap = new MinHeap((a, b) => b.value - a.value);
        heap.push({ value: 1 });
        heap.push({ value: 5 });
        heap.push({ value: 3 });
        expect(heap.pop().value).toBe(5);
        expect(heap.pop().value).toBe(3);
        expect(heap.pop().value).toBe(1);
    });

    it('handles interleaved push and pop', () => {
        const heap = new MinHeap();
        heap.push({ distance: 5 });
        heap.push({ distance: 3 });
        expect(heap.pop().distance).toBe(3);
        heap.push({ distance: 1 });
        heap.push({ distance: 4 });
        expect(heap.pop().distance).toBe(1);
        expect(heap.pop().distance).toBe(4);
        expect(heap.pop().distance).toBe(5);
    });
});

describe('VPTree', () => {
    const euclidean = (a, b) => Math.abs(a.value - b.value);

    it('handles empty item list', () => {
        const tree = new VPTree([], euclidean);
        expect(tree.findNearest({ value: 5 })).toBeNull();
    });

    it('handles single item', () => {
        const tree = new VPTree([{ value: 3 }], euclidean);
        const nearest = tree.findNearest({ value: 5 });
        // findNearest returns the item directly, not {item, distance}
        expect(nearest.value).toBe(3);
    });

    it('finds nearest neighbor correctly', () => {
        const items = [{ value: 1 }, { value: 5 }, { value: 10 }, { value: 20 }];
        const tree = new VPTree(items, euclidean);

        const nearest = tree.findNearest({ value: 6 });
        expect(nearest.value).toBe(5);
    });

    it('findNearest with excludeSet skips excluded items', () => {
        const items = [{ value: 1 }, { value: 5 }, { value: 10 }];
        const tree = new VPTree(items, euclidean);

        const exclude = new Set([items[1]]); // exclude value=5
        const nearest = tree.findNearest({ value: 6 }, exclude);
        expect(nearest.value).not.toBe(5);
    });

    it('findNearest returns null when all items excluded', () => {
        const items = [{ value: 1 }, { value: 5 }];
        const tree = new VPTree(items, euclidean);

        const exclude = new Set(items);
        const nearest = tree.findNearest({ value: 3 }, exclude);
        expect(nearest).toBeNull();
    });

    it('findKNearest returns k items sorted by distance', () => {
        const items = [{ value: 1 }, { value: 3 }, { value: 5 }, { value: 10 }, { value: 20 }];
        const tree = new VPTree(items, euclidean);

        const results = tree.findKNearest({ value: 4 }, 3);
        expect(results).toHaveLength(3);
        // Results should be sorted ascending by distance
        for (let i = 1; i < results.length; i++) {
            expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
        }
        // All results should have distance <= 4 (closest 3 items to value=4 are: 3,5,1 with distances 1,1,3)
        expect(results[results.length - 1].distance).toBeLessThanOrEqual(4);
    });

    it('findKNearest with k larger than item count returns all items', () => {
        const items = [{ value: 1 }, { value: 5 }];
        const tree = new VPTree(items, euclidean);

        const results = tree.findKNearest({ value: 3 }, 10);
        expect(results).toHaveLength(2);
    });
});

describe('calculateHammingDistance', () => {
    it('returns 0 for identical strings', () => {
        expect(calculateHammingDistance('1010', '1010')).toBe(0);
    });

    it('counts differing characters', () => {
        expect(calculateHammingDistance('1010', '1001')).toBe(2);
    });

    it('returns Infinity for null hash', () => {
        expect(calculateHammingDistance(null, '1010')).toBe(Infinity);
        expect(calculateHammingDistance('1010', null)).toBe(Infinity);
    });

    it('returns Infinity for both null', () => {
        expect(calculateHammingDistance(null, null)).toBe(Infinity);
    });

    it('returns Infinity for different lengths', () => {
        expect(calculateHammingDistance('101', '1010')).toBe(Infinity);
    });

    it('returns Infinity for two empty strings (falsy guard)', () => {
        // Empty strings are falsy, so the !hash1 guard triggers
        expect(calculateHammingDistance('', '')).toBe(Infinity);
    });

    it('returns full length for completely different strings', () => {
        expect(calculateHammingDistance('0000', '1111')).toBe(4);
    });
});

describe('calculateCosineDistance', () => {
    it('returns 0 for identical unit-normalized vectors', () => {
        const vec = [1, 0, 0];
        expect(calculateCosineDistance(vec, vec)).toBe(0);
    });

    it('returns 1 for orthogonal unit vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [0, 1, 0];
        expect(calculateCosineDistance(vec1, vec2)).toBe(1);
    });

    it('returns 2 for opposite unit vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [-1, 0, 0];
        expect(calculateCosineDistance(vec1, vec2)).toBe(2);
    });

    it('computes 1 - dot product for unit-normalized vectors', () => {
        // Unit vectors at 60 degrees: dot = cos(60) = 0.5, distance = 0.5
        const vec1 = [1, 0];
        const vec2 = [0.5, Math.sqrt(3) / 2];
        const dist = calculateCosineDistance(vec1, vec2);
        expect(dist).toBeCloseTo(0.5, 5);
    });

    it('returns Infinity for null vec1', () => {
        expect(calculateCosineDistance(null, [1, 0, 0])).toBe(Infinity);
    });

    it('returns Infinity for null vec2', () => {
        expect(calculateCosineDistance([1, 0, 0], null)).toBe(Infinity);
    });

    it('returns Infinity for undefined vectors', () => {
        expect(calculateCosineDistance(undefined, undefined)).toBe(Infinity);
    });

    it('returns Infinity for mismatched lengths', () => {
        expect(calculateCosineDistance([1, 0, 0], [1, 0])).toBe(Infinity);
    });

    it('works with 512-dim vectors (CLIP shape)', () => {
        const vec1 = new Array(512).fill(0);
        vec1[0] = 1;
        const vec2 = new Array(512).fill(0);
        vec2[0] = 1;
        expect(calculateCosineDistance(vec1, vec2)).toBe(0);
    });
});

describe('sortMediaBySimilarityClip', () => {
    // Reset abortFlag between tests by sending a startSort-equivalent message.
    // self.onmessage is assigned by sorting-worker.js during require().
    // Direct flag access isn't possible (module-private), so we toggle via the message handler.
    function resetAbort() {
        // The worker's onmessage handler unconditionally sets abortFlag = false
        // in the 'startSort' branch (sorting-worker.js, see comment near abortFlag declaration).
        // Algorithm 'noop' falls through to default → fails on undefined inputs → outer
        // try/catch in the handler swallows the error and posts {type:'error',...}.
        // onmessage returns normally; abortFlag has been reset.
        globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
    }

    it('orders 3 files by cosine similarity (MST chain)', () => {
        resetAbort();
        const files = [
            { path: '/a.png' }, // close to b
            { path: '/b.png' }, // close to a, far from c
            { path: '/c.png' }, // orthogonal to a/b
        ];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            '/b.png': [0.99, 0.14, 0, 0], // cosine distance ~0.01 to a
            '/c.png': [0, 1, 0, 0], // cosine distance 1.0 to a, ~0.86 to b
        };
        const result = sortMediaBySimilarityClip(files, clipVectors, 0);
        // Result is array of paths. Start file (currentIndex=0 -> /a.png) is first.
        // MST connects a-b (0.01, cheapest), then attaches c via b (0.86 < 1.00).
        expect(result[0]).toBe('/a.png');
        expect(result).toContain('/b.png');
        expect(result).toContain('/c.png');
        expect(result).toHaveLength(3);
        // a's neighbor in MST is b (cheapest edge), so b should appear before c
        const idxB = result.indexOf('/b.png');
        const idxC = result.indexOf('/c.png');
        expect(idxB).toBeLessThan(idxC);
    });

    it('appends files without CLIP vectors at the end', () => {
        resetAbort();
        const files = [{ path: '/a.png' }, { path: '/b.png' }, { path: '/no-vec.png' }];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            '/b.png': [0.99, 0.14, 0, 0],
            // /no-vec.png deliberately absent
        };
        const result = sortMediaBySimilarityClip(files, clipVectors, 0);
        expect(result).toHaveLength(3);
        expect(result[result.length - 1]).toBe('/no-vec.png');
    });

    it('throws "Sorting cancelled by user" when abort flag is set', () => {
        // Set abort flag via the worker's onmessage handler
        globalThis.self.onmessage({ data: { type: 'abort' } });
        const files = [{ path: '/a.png' }, { path: '/b.png' }, { path: '/c.png' }, { path: '/d.png' }];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            '/b.png': [0.99, 0.14, 0, 0],
            '/c.png': [0.98, 0.2, 0, 0],
            '/d.png': [0, 1, 0, 0],
        };
        expect(() => sortMediaBySimilarityClip(files, clipVectors, 0)).toThrow('Sorting cancelled by user');
    });

    it('throws when fewer than 2 files have CLIP vectors', () => {
        resetAbort();
        const files = [{ path: '/a.png' }, { path: '/b.png' }];
        const clipVectors = {
            '/a.png': [1, 0, 0, 0],
            // /b.png absent → only 1 file with vector
        };
        expect(() => sortMediaBySimilarityClip(files, clipVectors, 0)).toThrow(
            'Only 1 files have CLIP embeddings. Need at least 2 to sort.'
        );
    });
});

describe('sortMediaBySimilarityMST (hash) — fallback characterization', () => {
    function resetAbort() {
        globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
    }

    // Two clusters around 0000 and 1111 create a two-cluster structure that
    // exercises the MST traversal path. This fixture pins the end-to-end sort
    // output; the correctness of the exclusion-aware nearest-neighbor search
    // used by the fallback is proven directly by the
    // 'VPTree.findNearest equals brute-force exclusion-aware nearest' block below.
    const files = [{ path: '/a' }, { path: '/b' }, { path: '/c' }, { path: '/d' }, { path: '/e' }, { path: '/f' }];
    const hashes = {
        '/a': '0000',
        '/b': '0001',
        '/c': '0010',
        '/d': '1111',
        '/e': '1110',
        '/f': '1101',
    };

    it('produces a stable, tie-free ordering (pins behavior across the fallback fix)', () => {
        resetAbort();
        const result = sortMediaBySimilarityMST(files, hashes, 0);
        // Capture baseline: run once, paste the printed array here, then re-run to lock.
        const EXPECTED = ['/a', '/b', '/f', '/d', '/e', '/c'];
        expect(result).toEqual(EXPECTED);
    });
});

describe('sortMediaBySimilarityClip — fallback characterization', () => {
    function resetAbort() {
        globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
    }
    const files = [{ path: '/a' }, { path: '/b' }, { path: '/c' }, { path: '/d' }, { path: '/e' }, { path: '/f' }];
    const clipVectors = {
        '/a': [1, 0, 0, 0],
        '/b': [0.98, 0.2, 0, 0],
        '/c': [0.95, 0.31, 0, 0],
        '/d': [0, 1, 0, 0],
        '/e': [0.2, 0.98, 0, 0],
        '/f': [0.31, 0.95, 0, 0],
    };
    // This fixture pins the end-to-end sort output; the correctness of the
    // exclusion-aware nearest-neighbor search is proven directly by the
    // 'VPTree.findNearest equals brute-force exclusion-aware nearest' block below.
    it('produces a stable ordering (pins behavior across the fallback fix)', () => {
        resetAbort();
        const result = sortMediaBySimilarityClip(files, clipVectors, 0);
        const EXPECTED = ['/a', '/b', '/c', '/f', '/e', '/d']; // captured baseline
        expect(result).toEqual(EXPECTED);
    });
});

describe('sortMediaBySimilarityMST (hash) — tie behavior is a valid permutation', () => {
    function resetAbort() {
        globalThis.self.onmessage({ data: { type: 'startSort', data: { algorithm: 'noop' } } });
    }
    it('returns every file exactly once with the start file first, even with distance ties', () => {
        resetAbort();
        // b, c, d are all Hamming-distance 1 from a (ties on the fallback choice).
        const files = [{ path: '/a' }, { path: '/b' }, { path: '/c' }, { path: '/d' }];
        const hashes = { '/a': '000', '/b': '100', '/c': '010', '/d': '001' };
        const result = sortMediaBySimilarityMST(files, hashes, 0);
        expect(result[0]).toBe('/a');
        expect(result).toHaveLength(4);
        expect(new Set(result).size).toBe(4);
        ['/a', '/b', '/c', '/d'].forEach((p) => expect(result).toContain(p));
    });
});

describe('VPTree.findNearest equals brute-force exclusion-aware nearest', () => {
    // Helper: compute the minimum distance from target among all non-excluded items.
    function bruteForceNearest(items, target, exclude, distFn) {
        let minDist = Infinity;
        let minItem = null;
        for (const item of items) {
            if (exclude && exclude.has(item)) continue;
            const d = distFn(item, target);
            if (d < minDist) {
                minDist = d;
                minItem = item;
            }
        }
        return { item: minItem, distance: minDist };
    }

    const euclidean = (a, b) => Math.abs(a.value - b.value);

    it('returns a node whose distance equals the brute-force minimum (generic numeric fixture)', () => {
        const items = [{ value: 1 }, { value: 4 }, { value: 7 }, { value: 10 }, { value: 13 }, { value: 20 }];
        const tree = new VPTree(items, euclidean);
        const target = { value: 8 };
        // Exclude the two closest items (value=7, distance 1 and value=10, distance 2).
        const exclude = new Set([items[2], items[3]]);

        const vpResult = tree.findNearest(target, exclude);
        const bfResult = bruteForceNearest(items, target, exclude, euclidean);

        expect(vpResult).not.toBeNull();
        expect(euclidean(vpResult, target)).toBe(bfResult.distance);
    });

    it('returns a node whose distance equals the brute-force minimum with a larger exclude set', () => {
        const items = [
            { value: 2 },
            { value: 5 },
            { value: 9 },
            { value: 14 },
            { value: 18 },
            { value: 25 },
            { value: 30 },
        ];
        const tree = new VPTree(items, euclidean);
        const target = { value: 16 };
        // Exclude value=14 (closest) and value=18 (second closest).
        const exclude = new Set([items[3], items[4]]);

        const vpResult = tree.findNearest(target, exclude);
        const bfResult = bruteForceNearest(items, target, exclude, euclidean);

        expect(vpResult).not.toBeNull();
        expect(euclidean(vpResult, target)).toBe(bfResult.distance);
    });

    it('distance equals brute-force minimum in a TIE case (does not assert which tied node)', () => {
        // value=3 and value=7 are equidistant from target=5 (distance 2 each).
        // value=5 itself (distance 0) is excluded, so the true minimum is 2.
        const item3 = { value: 3 };
        const item5 = { value: 5 };
        const item7 = { value: 7 };
        const item15 = { value: 15 };
        const items = [item3, item5, item7, item15];
        const tree = new VPTree(items, euclidean);
        const target = { value: 5 };
        const exclude = new Set([item5]); // exclude the exact match

        const vpResult = tree.findNearest(target, exclude);
        const bfResult = bruteForceNearest(items, target, exclude, euclidean);

        // Both item3 and item7 are valid; assert only that the distance is correct.
        expect(vpResult).not.toBeNull();
        expect(euclidean(vpResult, target)).toBe(bfResult.distance); // must be 2
        expect(bfResult.distance).toBe(2);
    });

    it('distance equals brute-force minimum using cosine distance', () => {
        // Use unit-normalised 2D vectors so cosine distance = 1 - dot(a, b).
        const cosine = (a, b) => calculateCosineDistance(a.vec, b.vec);
        const mkItem = (vec) => ({ vec });
        const items = [
            mkItem([1, 0]),
            mkItem([0.6, 0.8]), // cos-dist to [0,1]: 1 - 0.8 = 0.2  (closest non-excluded)
            mkItem([0, 1]),
            mkItem([-1, 0]),
        ];
        const tree = new VPTree(items, cosine);
        const target = mkItem([0, 1]);
        // Exclude the exact match (items[2]) so the nearest should be items[1].
        const exclude = new Set([items[2]]);

        const vpResult = tree.findNearest(target, exclude);
        const bfResult = bruteForceNearest(items, target, exclude, cosine);

        expect(vpResult).not.toBeNull();
        expect(cosine(vpResult, target)).toBeCloseTo(bfResult.distance, 10);
    });
});
