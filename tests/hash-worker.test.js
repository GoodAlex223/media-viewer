import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sniffImageType, isYuvFormat, hasIccProfile, hashBytes } from '../hash-worker.js';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'hash-worker.js'), 'utf-8');

const base = () => sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 40, b: 90 } } });
const bytesOf = async (pipeline) => new Uint8Array(await pipeline.toBuffer());

// The body of one top-level function, from its signature to the closing brace in column 0.
function bodyOf(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start === -1) {
        throw new Error(`no function ${name} in hash-worker.js`);
    }
    return source.slice(start, source.indexOf('\n}\n', start) + 2);
}

describe('hash-worker.js', () => {
    it('sniffs by the bytes, not the name', async () => {
        expect(sniffImageType(await bytesOf(base().jpeg()))).toBe('jpeg');
        expect(sniffImageType(await bytesOf(base().png()))).toBe('png');
        expect(sniffImageType(await bytesOf(base().gif()))).toBe('gif');
        expect(sniffImageType(await bytesOf(base().webp()))).toBe('webp');
        const riffWave = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
        expect(sniffImageType(riffWave)).toBe(null);
        expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff]).subarray(0, 1))).toBe(null);
        expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBe(null);
    });

    it('the YUV test is the measured one', () => {
        for (const f of ['I420', 'I422', 'I444', 'NV12']) {
            expect(isYuvFormat(f)).toBe(true);
        }
        for (const f of ['BGRA', 'BGRX', 'RGBA', null]) {
            expect(isYuvFormat(f)).toBe(false);
        }
    });

    it('detects an embedded ICC profile', async () => {
        for (const fmt of ['jpeg', 'png', 'webp']) {
            const withIcc = await bytesOf(base().withIccProfile('p3')[fmt]());
            const without = await bytesOf(base()[fmt]());
            expect(hasIccProfile(withIcc, fmt), `${fmt} with profile`).toBe(true);
            expect(hasIccProfile(without, fmt), `${fmt} without profile`).toBe(false);
        }
        expect(hasIccProfile(await bytesOf(base().gif()), 'gif')).toBe(false);
    });

    it('importing the module installs no handler outside a worker', () => {
        expect(globalThis.onmessage ?? null).toBe(null);
        expect(typeof globalThis.WorkerGlobalScope).toBe('undefined');
    });

    it('hashBytes draws on a fresh default-options 256x256 canvas', () => {
        const body = bodyOf('hashBytes');
        expect(body).toMatch(/new OffscreenCanvas\((?:256|HASH_CANVAS_SIZE), (?:256|HASH_CANVAS_SIZE)\)/);
        expect(body).toContain("getContext('2d')");
        expect(body).toContain('Unrecognised image bytes');
    });

    it('never uses the options the measurement ruled out', () => {
        expect(source).not.toContain('willReadFrequently');
        expect(source).not.toContain('resizeWidth');
        expect(source).not.toContain('desiredWidth');
    });
});

// hashBytes's resource order, with the browser's decode and canvas classes recorded (Node has none of them).
describe('hashBytes frees what it no longer needs', () => {
    const saved = {};
    afterEach(() => {
        for (const [k, v] of Object.entries(saved)) {
            globalThis[k] = v;
        }
    });

    function recordBrowser(format) {
        const events = [];
        for (const k of ['OffscreenCanvas', 'ImageDecoder', 'createImageBitmap']) {
            saved[k] = globalThis[k];
        }
        globalThis.OffscreenCanvas = class {
            getContext() {
                return {
                    drawImage: (src) => events.push(`draw ${src.kind}`),
                    getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
                };
            }
        };
        globalThis.ImageDecoder = class {
            async decode() {
                return { image: { kind: 'frame', format, close: () => events.push('frame closed') } };
            }
            close() {
                events.push('decoder closed');
            }
        };
        globalThis.createImageBitmap = async () => {
            events.push('createImageBitmap');
            return { kind: 'bitmap', close: () => events.push('bitmap closed') };
        };
        return events;
    }

    // PR #87 review #4: a CMYK JPEG or an alpha, lossless or animated WebP decodes to no YUV frame. Its full-size frame
    // (~96 MB at 6000x4000) and the decoder's copy of the bytes stayed open through createImageBitmap's own copy.
    it('closes a non-YUV frame and its decoder before createImageBitmap', async () => {
        const events = recordBrowser('BGRA');
        const jpeg = await bytesOf(base().jpeg());
        const r = await hashBytes(jpeg.buffer);
        expect(events).toEqual(['frame closed', 'decoder closed', 'createImageBitmap', 'draw bitmap', 'bitmap closed']);
        expect(r.info).toEqual({ type: 'jpeg', format: 'BGRA', icc: false });
    });

    it('draws a YUV frame itself, and closes it and the decoder after', async () => {
        const events = recordBrowser('I420');
        const jpeg = await bytesOf(base().jpeg());
        const r = await hashBytes(jpeg.buffer);
        expect(events).toEqual(['draw frame', 'frame closed', 'decoder closed']);
        expect(r.info.format).toBe('I420');
    });
});
