// Sorting Worker - runs sorting algorithms in a separate thread
// to prevent Chromium background throttling when window is minimized

// MinHeap (Priority Queue) for efficient MST construction
class MinHeap {
    constructor(compareFunc = (a, b) => a.distance - b.distance) {
        this.heap = [];
        this.compareFunc = compareFunc;
    }

    size() {
        return this.heap.length;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    push(item) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.isEmpty()) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.bubbleDown(0);
        return min;
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compareFunc(this.heap[index], this.heap[parentIndex]) >= 0) break;

            [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
            index = parentIndex;
        }
    }

    bubbleDown(index) {
        while (true) {
            let minIndex = index;
            const leftChild = 2 * index + 1;
            const rightChild = 2 * index + 2;

            if (leftChild < this.heap.length &&
                this.compareFunc(this.heap[leftChild], this.heap[minIndex]) < 0) {
                minIndex = leftChild;
            }

            if (rightChild < this.heap.length &&
                this.compareFunc(this.heap[rightChild], this.heap[minIndex]) < 0) {
                minIndex = rightChild;
            }

            if (minIndex === index) break;

            [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
            index = minIndex;
        }
    }
}

// VP-Tree (Vantage Point Tree) for fast nearest neighbor search
class VPTree {
    constructor(items, distanceFunc) {
        this.distanceFunc = distanceFunc;
        this.root = this.buildTree(items);
    }

    buildTree(items) {
        if (!items || items.length === 0) return null;

        const vantagePoint = items[0];

        if (items.length === 1) {
            return { vantagePoint, left: null, right: null, radius: 0 };
        }

        const distances = items.slice(1).map(item => ({
            item,
            distance: this.distanceFunc(vantagePoint, item)
        }));

        const medianIndex = Math.floor(distances.length / 2);
        const median = this.quickSelect(distances, medianIndex);
        const radius = median.distance;

        const inside = [];
        const outside = [];
        for (const d of distances) {
            if (d.distance < radius) {
                inside.push(d.item);
            } else if (d.distance > radius) {
                outside.push(d.item);
            } else {
                if (inside.length <= outside.length) {
                    inside.push(d.item);
                } else {
                    outside.push(d.item);
                }
            }
        }

        return {
            vantagePoint,
            radius,
            left: this.buildTree(inside),
            right: this.buildTree(outside)
        };
    }

    partition(arr, left, right, pivotIndex, compareFunc) {
        const pivotValue = arr[pivotIndex];
        [arr[pivotIndex], arr[right]] = [arr[right], arr[pivotIndex]];
        let storeIndex = left;

        for (let i = left; i < right; i++) {
            if (compareFunc(arr[i], pivotValue) < 0) {
                [arr[storeIndex], arr[i]] = [arr[i], arr[storeIndex]];
                storeIndex++;
            }
        }

        [arr[right], arr[storeIndex]] = [arr[storeIndex], arr[right]];
        return storeIndex;
    }

    quickSelect(arr, k, compareFunc = (a, b) => a.distance - b.distance) {
        if (arr.length === 0) return null;
        if (arr.length === 1) return arr[0];

        let left = 0;
        let right = arr.length - 1;

        while (left <= right) {
            const pivotIndex = Math.floor((left + right) / 2);
            const newPivot = this.partition(arr, left, right, pivotIndex, compareFunc);

            if (newPivot === k) {
                return arr[k];
            } else if (k < newPivot) {
                right = newPivot - 1;
            } else {
                left = newPivot + 1;
            }
        }

        return arr[k];
    }

    findNearest(target, excludeSet = new Set()) {
        if (!this.root) return null;

        let best = { item: null, distance: Infinity };

        const search = (node) => {
            if (!node) return;

            const vp = node.vantagePoint;

            if (excludeSet.has(vp)) {
                if (best.distance === Infinity) {
                    search(node.left);
                    search(node.right);
                } else {
                    const targetDistance = this.distanceFunc(target, vp);
                    if (targetDistance < node.radius) {
                        search(node.left);
                        if (targetDistance + best.distance >= node.radius) {
                            search(node.right);
                        }
                    } else {
                        search(node.right);
                        if (targetDistance - best.distance <= node.radius) {
                            search(node.left);
                        }
                    }
                }
                return;
            }

            const targetDistance = this.distanceFunc(target, vp);

            if (targetDistance < best.distance) {
                best = { item: vp, distance: targetDistance };
            }

            if (targetDistance < node.radius) {
                search(node.left);
                if (targetDistance + best.distance >= node.radius) {
                    search(node.right);
                }
            } else {
                search(node.right);
                if (targetDistance - best.distance <= node.radius) {
                    search(node.left);
                }
            }
        };

        search(this.root);
        return best.item;
    }

    findKNearest(target, k, excludeSet = new Set()) {
        if (!this.root) return [];

        const results = [];
        let worstDistance = Infinity;

        const search = (node) => {
            if (!node) return;

            const vp = node.vantagePoint;

            if (excludeSet.has(vp)) {
                search(node.left);
                search(node.right);
                return;
            }

            const targetDistance = this.distanceFunc(target, vp);

            if (results.length < k || targetDistance < worstDistance) {
                if (results.length < k) {
                    results.push({ item: vp, distance: targetDistance });
                    results.sort((a, b) => b.distance - a.distance);
                } else {
                    if (targetDistance < results[0].distance) {
                        results[0] = { item: vp, distance: targetDistance };
                        results.sort((a, b) => b.distance - a.distance);
                    }
                }

                worstDistance = results.length > 0 ? results[0].distance : Infinity;
            }

            if (targetDistance < node.radius) {
                search(node.left);
                if (results.length < k || targetDistance + worstDistance >= node.radius) {
                    search(node.right);
                }
            } else {
                search(node.right);
                if (results.length < k || targetDistance - worstDistance <= node.radius) {
                    search(node.left);
                }
            }
        };

        search(this.root);
        return results.reverse();
    }
}

// Helper function
function calculateHammingDistance(hash1, hash2) {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) {
        return Infinity;
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) {
            distance++;
        }
    }
    return distance;
}

// Abort flag - set by main thread via message
let abortFlag = false;

// Send progress update to main thread
function updateProgress(message, current, total) {
    self.postMessage({ type: 'progress', message, current, total });
}

// Simple greedy nearest-neighbor algorithm
function sortMediaBySimilarity(mediaFiles, hashes, currentIndex, maxComparisons) {
    const sorted = [];
    const remaining = [...mediaFiles];
    const total = remaining.length;
    let processed = 0;

    // Start with currently viewed file if it has a hash
    const currentFile = mediaFiles[currentIndex];
    let current;
    if (currentFile && hashes[currentFile.path]) {
        current = remaining.find(file => file.path === currentFile.path);
    }
    if (!current) {
        current = remaining.find(file => hashes[file.path]);
    }
    if (!current) {
        throw new Error('No files with valid hashes');
    }

    sorted.push(current);
    remaining.splice(remaining.indexOf(current), 1);
    processed++;

    while (remaining.length > 0) {
        if (abortFlag) {
            throw new Error('Sorting cancelled by user');
        }

        const currentHash = hashes[current.path];
        let minDistance = Infinity;
        let nearestIndex = -1;

        const numToCheck = Math.min(remaining.length, maxComparisons);

        // Random sampling for large datasets
        if (numToCheck < remaining.length) {
            for (let i = 0; i < numToCheck; i++) {
                const j = i + Math.floor(Math.random() * (remaining.length - i));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
            }
        }

        for (let i = 0; i < numToCheck; i++) {
            const file = remaining[i];
            const hash = hashes[file.path];

            if (hash) {
                const distance = calculateHammingDistance(currentHash, hash);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestIndex = i;
                }
            }
        }

        if (nearestIndex >= 0) {
            current = remaining[nearestIndex];
            sorted.push(current);
            remaining.splice(nearestIndex, 1);
            processed++;

            if (processed % 50 === 0) {
                updateProgress(`🔄 Sorting: ${processed}/${total}`, processed, total);
            }
        } else {
            sorted.push(...remaining);
            break;
        }
    }

    return sorted.map(f => f.path);
}

// VP-Tree optimized greedy nearest-neighbor
function sortMediaBySimilarityVPTree(mediaFiles, hashes, currentIndex) {
    const total = mediaFiles.length;
    let processed = 0;

    updateProgress('🔄 Building VP-Tree index...', 0, total);

    const filesWithHashes = mediaFiles.filter(f => hashes[f.path]);
    if (filesWithHashes.length < 2) {
        throw new Error(`Only ${filesWithHashes.length} files have valid hashes. Need at least 2 to sort.`);
    }

    const distanceFunc = (file1, file2) => {
        return calculateHammingDistance(hashes[file1.path], hashes[file2.path]);
    };

    const vpTree = new VPTree(filesWithHashes, distanceFunc);

    updateProgress('🔄 Sorting with VP-Tree...', 0, total);

    const sorted = [];
    const excluded = new Set();

    // Start with currently viewed file
    const currentFile = mediaFiles[currentIndex];
    let current = filesWithHashes[0];
    if (currentFile && hashes[currentFile.path]) {
        const found = filesWithHashes.find(f => f.path === currentFile.path);
        if (found) current = found;
    }
    sorted.push(current);
    excluded.add(current);
    processed++;

    while (sorted.length < filesWithHashes.length) {
        if (abortFlag) {
            throw new Error('Sorting cancelled by user');
        }

        const nearest = vpTree.findNearest(current, excluded);

        if (nearest) {
            sorted.push(nearest);
            excluded.add(nearest);
            current = nearest;
            processed++;

            if (processed % 50 === 0) {
                updateProgress(`🔄 Sorting: ${processed}/${total}`, processed, total);
            }
        } else {
            break;
        }
    }

    // Add files without hashes at the end
    const filesWithoutHashes = mediaFiles.filter(f => !hashes[f.path]);
    sorted.push(...filesWithoutHashes);

    return sorted.map(f => f.path);
}

// MST-based sorting algorithm
function sortMediaBySimilarityMST(mediaFiles, hashes, currentIndex) {
    const total = mediaFiles.length;

    updateProgress('🔄 Building VP-Tree index...', 0, total);

    const filesWithHashes = mediaFiles.filter(f => hashes[f.path]);
    if (filesWithHashes.length < 2) {
        throw new Error(`Only ${filesWithHashes.length} files have valid hashes. Need at least 2 to sort.`);
    }

    const distanceFunc = (file1, file2) => {
        return calculateHammingDistance(hashes[file1.path], hashes[file2.path]);
    };

    const vpTree = new VPTree(filesWithHashes, distanceFunc);

    updateProgress('🔄 Building similarity graph with VP-Tree...', 0, total);

    // Dynamic K based on dataset size
    const N = filesWithHashes.length;
    const K_NEIGHBORS = Math.min(N - 1, Math.max(20, Math.floor(Math.sqrt(N) * 10)));

    const graph = new Map();

    for (let i = 0; i < filesWithHashes.length; i++) {
        if (abortFlag) {
            throw new Error('Sorting cancelled by user');
        }

        const file = filesWithHashes[i];
        const neighbors = vpTree.findKNearest(file, K_NEIGHBORS + 1, new Set([file]));

        graph.set(file, neighbors.map(({ item, distance }) => ({
            neighbor: item,
            distance
        })));

        if ((i + 1) % 100 === 0) {
            updateProgress(`🔄 Building graph: ${i + 1}/${filesWithHashes.length}`, i + 1, filesWithHashes.length);
        }
    }

    updateProgress('🔄 Computing MST...', 0, total);

    // Prim's algorithm for MST
    const mst = new Map();
    const visited = new Set();
    const pq = new MinHeap();

    // Start with currently viewed file
    let startFile = filesWithHashes[0];
    const currentFile = mediaFiles[currentIndex];
    if (currentFile && hashes[currentFile.path]) {
        const found = filesWithHashes.find(f => f.path === currentFile.path);
        if (found) startFile = found;
    }
    visited.add(startFile);
    mst.set(startFile, []);

    const startNeighbors = graph.get(startFile) || [];
    for (const { neighbor, distance } of startNeighbors) {
        pq.push({ from: startFile, to: neighbor, distance });
    }

    while (visited.size < filesWithHashes.length && !pq.isEmpty()) {
        if (abortFlag) {
            throw new Error('Sorting cancelled by user');
        }

        const edge = pq.pop();

        if (!edge || visited.has(edge.to)) continue;

        visited.add(edge.to);
        if (!mst.has(edge.from)) mst.set(edge.from, []);
        if (!mst.has(edge.to)) mst.set(edge.to, []);
        mst.get(edge.from).push(edge.to);
        mst.get(edge.to).push(edge.from);

        const neighbors = graph.get(edge.to) || [];
        for (const { neighbor, distance } of neighbors) {
            if (!visited.has(neighbor)) {
                pq.push({ from: edge.to, to: neighbor, distance });
            }
        }

        if (visited.size % 100 === 0) {
            updateProgress(`🔄 MST progress: ${visited.size}/${filesWithHashes.length}`, visited.size, filesWithHashes.length);
        }
    }

    updateProgress('🔄 Traversing MST...', 0, total);

    // Greedy traversal of MST
    const sorted = [];
    const traversed = new Set();

    let current = startFile;
    traversed.add(current);
    sorted.push(current);

    while (sorted.length < filesWithHashes.length) {
        const neighbors = mst.get(current) || [];

        let nearestNeighbor = null;
        let minDistance = Infinity;

        for (const neighbor of neighbors) {
            if (!traversed.has(neighbor)) {
                const distance = distanceFunc(current, neighbor);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestNeighbor = neighbor;
                }
            }
        }

        if (nearestNeighbor) {
            traversed.add(nearestNeighbor);
            sorted.push(nearestNeighbor);
            current = nearestNeighbor;
        } else {
            let nearestNode = null;
            let minDist = Infinity;

            for (const file of filesWithHashes) {
                if (!traversed.has(file)) {
                    const dist = distanceFunc(current, file);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestNode = file;
                    }
                }
            }

            if (nearestNode) {
                traversed.add(nearestNode);
                sorted.push(nearestNode);
                current = nearestNode;
            } else {
                break;
            }
        }
    }

    // Add files without hashes at the end
    const filesWithoutHashes = mediaFiles.filter(f => !hashes[f.path]);
    sorted.push(...filesWithoutHashes);

    return sorted.map(f => f.path);
}

// Message handler
self.onmessage = function(e) {
    const { type, data } = e.data;

    if (type === 'abort') {
        abortFlag = true;
        return;
    }

    if (type === 'startSort') {
        abortFlag = false;
        const { algorithm, mediaFiles, hashes, currentIndex, maxComparisons } = data;

        try {
            let sortedPaths;

            switch (algorithm) {
                case 'vptree':
                    sortedPaths = sortMediaBySimilarityVPTree(mediaFiles, hashes, currentIndex);
                    break;
                case 'mst':
                    sortedPaths = sortMediaBySimilarityMST(mediaFiles, hashes, currentIndex);
                    break;
                case 'simple':
                default:
                    sortedPaths = sortMediaBySimilarity(mediaFiles, hashes, currentIndex, maxComparisons);
                    break;
            }

            self.postMessage({ type: 'complete', sortedPaths });
        } catch (error) {
            self.postMessage({ type: 'error', message: error.message });
        }
    }
};
