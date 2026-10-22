// G2 PR 2 T2: the one blockhash. The known vectors were captured from MediaViewer.blockhash at bf5ec84 (before it
// moved) with a one-off extraction script on three fixed 256x256 inputs.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { blockhash, HASH_BITS, HASH_CANVAS_SIZE } from '../perceptual-hash.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const W = HASH_CANVAS_SIZE;
function makeImage(pixel) {
    const data = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
            const [r, g, b] = pixel(x, y);
            const i = (y * W + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
        }
    }
    return { width: W, height: W, data };
}

const GRADIENT =
    '0000000001111111000000000111111100000000011111110000000001111111000000000111111100000000011111110000000001111111000000000111111100000000011111110000000001111111000000000111111100000000011111110000000001111111000000000111111100000000011111110000000001111111';
// An 8-px checkerboard averages equal in every 16-px block, so every block ties the median: all zeros.
const CHECKER = '0'.repeat(256);
const NOISE =
    '1011100001001101010000110101001011111000100000101110000100111110011001111000100111100110110100100011000010111001111011100100110110010011101010100111100000000100011001010010111101001010100110011110010010011110001111101011100110001010011011100101001010110010';

describe('blockhash', () => {
    it("matches the renderer's on the known vectors", () => {
        expect(HASH_BITS).toBe(16);
        expect(
            blockhash(
                makeImage((x) => [x, x, x]),
                HASH_BITS
            )
        ).toBe(GRADIENT);
        expect(
            blockhash(
                makeImage((x, y) => (((x >> 3) + (y >> 3)) & 1 ? [255, 255, 255] : [0, 0, 0])),
                HASH_BITS
            )
        ).toBe(CHECKER);
        let s = 12345;
        const lcg = () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s;
        };
        expect(
            blockhash(
                makeImage(() => [lcg() & 255, lcg() & 255, lcg() & 255]),
                HASH_BITS
            )
        ).toBe(NOISE);
    });

    it('is defined in exactly one file', () => {
        const files = fs.readdirSync(root).filter((f) => f.endsWith('.js'));
        const hits = files.filter((f) => {
            const text = fs.readFileSync(path.join(root, f), 'utf-8');
            return /function\s+blockhash\s*\(/.test(text) || /^\s*blockhash\s*\([^)]*\)\s*\{/m.test(text);
        });
        expect(hits).toEqual(['perceptual-hash.js']);
    });

    it('both routes import the one blockhash', () => {
        const main = fs.readFileSync(path.join(root, 'main-thread-hash.js'), 'utf-8');
        expect(main).toContain("from './perceptual-hash.js'");
        const renderer = fs.readFileSync(path.join(root, 'media-viewer.js'), 'utf-8');
        expect(renderer).not.toContain('blockhash(');
    });

    // T3 Step 2 makes this real: hash-worker.js must contain "from './perceptual-hash.js'" too.
    it.todo('hash-worker.js imports the one blockhash');

    it('package.json has no blockhash dependency', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
        expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('blockhash');
    });
});
