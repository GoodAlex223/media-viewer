import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isMediaFile, getMimeType } = require('../media-formats');

describe('isMediaFile', () => {
    it('accepts existing media extensions', () => {
        for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov']) {
            expect(isMediaFile(ext)).toBe(true);
        }
    });
    it('accepts .jxl', () => {
        expect(isMediaFile('.jxl')).toBe(true);
    });
    it('rejects non-media extensions', () => {
        expect(isMediaFile('.txt')).toBe(false);
        expect(isMediaFile('.json')).toBe(false);
    });
});

describe('getMimeType', () => {
    it('maps .jxl to image/jxl', () => {
        expect(getMimeType('.jxl')).toBe('image/jxl');
    });
    it('maps known types and falls back to octet-stream', () => {
        expect(getMimeType('.png')).toBe('image/png');
        expect(getMimeType('.mp4')).toBe('video/mp4');
        expect(getMimeType('.xyz')).toBe('application/octet-stream');
    });
});
