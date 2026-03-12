import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// sorting-worker.js references `self` (Web Worker global) at module level.
// Provide a minimal stub so require() succeeds.
globalThis.self = { onmessage: null, postMessage: () => {} };
const { MinHeap, VPTree, calculateHammingDistance } = require('../sorting-worker');

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
