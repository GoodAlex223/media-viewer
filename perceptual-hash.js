// perceptual-hash.js
// The one blockhash (G2 PR 2): the block-mean perceptual hash both hash routes import — the main-thread route
// (main-thread-hash.js) and the pool's worker (hash-worker.js). A hash is the 256-character 0/1 string
// blockhash(imageData, 16) returns, so a second copy that drifted would split the cache in two.
export const HASH_CANVAS_SIZE = 256;
export const HASH_BITS = 16;

// The positions where `a` and `b` differ, for hash strings and pixel arrays alike; a length mismatch counts every
// missing position as differing. The pool's canary and the parity report share it (PR #87 review #13).
export function countDifferences(a, b) {
    const n = Math.max(a.length, b.length);
    let count = 0;
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) {
            count++;
        }
    }
    return count;
}

export function blockhash(imageData, bits) {
    // Simple blockhash implementation
    const blockWidth = Math.floor(imageData.width / bits);
    const blockHeight = Math.floor(imageData.height / bits);
    const result = [];

    for (let y = 0; y < bits; y++) {
        for (let x = 0; x < bits; x++) {
            let total = 0;
            let count = 0;

            for (let by = 0; by < blockHeight; by++) {
                for (let bx = 0; bx < blockWidth; bx++) {
                    const px = x * blockWidth + bx;
                    const py = y * blockHeight + by;
                    const idx = (py * imageData.width + px) * 4;

                    // Convert to grayscale
                    const gray =
                        imageData.data[idx] * 0.299 + imageData.data[idx + 1] * 0.587 + imageData.data[idx + 2] * 0.114;
                    total += gray;
                    count++;
                }
            }

            result.push(total / count);
        }
    }

    // Convert to binary hash based on median
    const median = result.slice().sort((a, b) => a - b)[Math.floor(result.length / 2)];
    return result.map((val) => (val > median ? '1' : '0')).join('');
}
