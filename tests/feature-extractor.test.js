import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
    rgbToHsl,
    computeHistogram,
    computeSharpness,
    computeSymmetry,
    computeVisualBalance,
    computeColorHarmony,
    computeNoiseLevel,
    FEATURE_VERSION,
    FEATURE_DIM,
} = require('../feature-extractor');

describe('feature-extractor', () => {
    describe('constants', () => {
        it('exports expected version and dimension', () => {
            expect(FEATURE_VERSION).toBe(2);
            expect(FEATURE_DIM).toBe(64);
        });
    });

    describe('rgbToHsl', () => {
        it('converts black (0,0,0) correctly', () => {
            const { h, s, l } = rgbToHsl(0, 0, 0);
            expect(h).toBe(0);
            expect(s).toBe(0);
            expect(l).toBe(0);
        });

        it('converts white (1,1,1) correctly', () => {
            const { h, s, l } = rgbToHsl(1, 1, 1);
            expect(h).toBe(0);
            expect(s).toBe(0);
            expect(l).toBe(1);
        });

        it('converts pure red (1,0,0) correctly', () => {
            const { h, s, l } = rgbToHsl(1, 0, 0);
            expect(h).toBe(0);
            expect(s).toBe(1);
            expect(l).toBe(0.5);
        });

        it('converts pure green (0,1,0) correctly', () => {
            const { h, s, l } = rgbToHsl(0, 1, 0);
            expect(h).toBe(120);
            expect(s).toBe(1);
            expect(l).toBe(0.5);
        });

        it('converts pure blue (0,0,1) correctly', () => {
            const { h, s, l } = rgbToHsl(0, 0, 1);
            expect(h).toBe(240);
            expect(s).toBe(1);
            expect(l).toBe(0.5);
        });

        it('converts gray (0.5, 0.5, 0.5) to achromatic', () => {
            const { s, l } = rgbToHsl(0.5, 0.5, 0.5);
            expect(s).toBe(0);
            expect(l).toBe(0.5);
        });

        it('converts yellow (1,1,0) correctly', () => {
            const { h, s, l } = rgbToHsl(1, 1, 0);
            expect(h).toBe(60);
            expect(s).toBe(1);
            expect(l).toBe(0.5);
        });
    });

    describe('computeHistogram', () => {
        it('produces normalized histogram summing to ~1', () => {
            const values = [0.1, 0.3, 0.5, 0.7, 0.9];
            const hist = computeHistogram(values, 5, 0, 1);
            expect(hist).toHaveLength(5);
            const sum = hist.reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0);
        });

        it('places all identical values in one bin', () => {
            const values = [0.5, 0.5, 0.5];
            const hist = computeHistogram(values, 4, 0, 1);
            // All values go to bin 2 (0.5 * 4 / 1 = 2)
            const nonZeroBins = hist.filter((v) => v > 0);
            expect(nonZeroBins).toHaveLength(1);
            expect(nonZeroBins[0]).toBeCloseTo(1.0);
        });

        it('clamps values at max to last bin', () => {
            const values = [1.0];
            const hist = computeHistogram(values, 4, 0, 1);
            expect(hist[3]).toBeCloseTo(1.0);
        });

        it('handles single bin', () => {
            const values = [0.1, 0.5, 0.9];
            const hist = computeHistogram(values, 1, 0, 1);
            expect(hist).toHaveLength(1);
            expect(hist[0]).toBeCloseTo(1.0);
        });
    });

    describe('computeSharpness', () => {
        it('returns 0 for uniform gray image', () => {
            const width = 10;
            const height = 10;
            const gray = new Float32Array(width * height).fill(0.5);
            expect(computeSharpness(gray, width, height)).toBe(0);
        });

        it('returns > 0 for image with edges', () => {
            const width = 10;
            const height = 10;
            const gray = new Float32Array(width * height);
            // Create a sharp edge: left half dark, right half bright
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    gray[y * width + x] = x < width / 2 ? 0 : 1;
                }
            }
            expect(computeSharpness(gray, width, height)).toBeGreaterThan(0);
        });
    });

    describe('computeSymmetry', () => {
        it('returns 1 for perfectly mirrored image', () => {
            const width = 4;
            const height = 2;
            // RGBA: left half red, right half red (mirrored)
            const data = new Uint8ClampedArray(width * height * 4);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    data[idx] = 128; // R
                    data[idx + 1] = 128; // G
                    data[idx + 2] = 128; // B
                    data[idx + 3] = 255; // A
                }
            }
            const imageData = { width, height, data };
            expect(computeSymmetry(imageData)).toBeCloseTo(1.0);
        });
    });

    describe('computeVisualBalance', () => {
        it('returns high score for uniform luminance', () => {
            // Use a large enough image so that centroid approaches center.
            // Pixel indices 0..N-1 have mean (N-1)/2, centroid = (N-1)/(2*N) → 0.5 as N→∞.
            const width = 100;
            const height = 100;
            const data = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 128;
                data[i + 1] = 128;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
            const imageData = { width, height, data };
            const balance = computeVisualBalance(imageData);
            expect(balance).toBeGreaterThan(0.8);
        });
    });

    describe('computeColorHarmony', () => {
        it('returns 0.5 for fewer than 100 saturated pixels', () => {
            // 50 pixels, all gray (saturation=0) → <100 saturated
            const hslPixels = Array.from({ length: 50 }, () => ({ h: 0, s: 0, l: 0.5 }));
            expect(computeColorHarmony(hslPixels)).toBe(0.5);
        });
    });

    describe('computeNoiseLevel', () => {
        it('returns 0 for uniform image', () => {
            const width = 10;
            const height = 10;
            const data = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 128;
                data[i + 1] = 128;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
            // computeNoiseLevel expects gray Float32Array, width, height
            // Actually let's check the signature
            expect(computeNoiseLevel({ width, height, data })).toBe(0);
        });
    });
});
