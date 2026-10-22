// G2 PR 2 T2: main-thread-hash.js — today's hash route, moved out of the renderer. Run against a fake document and
// Image. The route is the measured one (spec § 5.2, F4): a fresh 256x256 canvas per file, a default 2D context.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as MediaUrl from '../media-url.js';
import { hashFile, hashImageUrl, makeCanaryImages, MAIN_ROUTE_TIMEOUT_MS } from '../main-thread-hash.js';

let canvases;
let images;
let realDocument;
let realImage;

function fakeContext(canvas) {
    return {
        calls: [],
        drawImage: vi.fn(function (...args) {
            this.calls.push(['drawImage', args]);
        }),
        getImageData: vi.fn((x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(7) })),
        // paintCanary surface
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        canvas,
    };
}

class FakeImage {
    constructor() {
        this.listeners = {};
        this.failWith = null;
        images.push(this);
    }
    addEventListener(type, fn) {
        (this.listeners[type] ||= []).push(fn);
    }
    set src(value) {
        this._src = value;
        queueMicrotask(() => {
            const type = this.failWith ? 'error' : 'load';
            for (const fn of this.listeners[type] || []) {
                fn(this.failWith || {});
            }
        });
    }
    get src() {
        return this._src;
    }
}

beforeEach(() => {
    canvases = [];
    images = [];
    realDocument = globalThis.document;
    realImage = globalThis.Image;
    globalThis.document = {
        createElement: (tag) => {
            if (tag !== 'canvas') {
                throw new Error(`unexpected element ${tag}`);
            }
            const canvas = { width: 300, height: 150, getContext: vi.fn(), toBlob: null };
            const ctx = fakeContext(canvas);
            canvas.getContext.mockImplementation(() => ctx);
            canvas.ctx = ctx;
            canvas.toBlob = (cb, type, quality) => cb({ fakeBlob: true, type, quality, size: canvas.width });
            canvases.push(canvas);
            return canvas;
        },
    };
    globalThis.Image = FakeImage;
});

afterEach(() => {
    globalThis.document = realDocument;
    globalThis.Image = realImage;
    vi.restoreAllMocks();
});

describe('hashImageUrl', () => {
    it('draws every file on a fresh 256x256 canvas with a default 2D context', async () => {
        await hashImageUrl('app://x/1');
        await hashImageUrl('app://x/2');
        expect(canvases).toHaveLength(2);
        expect(canvases[0]).not.toBe(canvases[1]);
        for (const canvas of canvases) {
            expect(canvas.width).toBe(256);
            expect(canvas.height).toBe(256);
            expect(canvas.getContext.mock.calls).toEqual([['2d']]);
            expect(canvas.ctx.drawImage).toHaveBeenCalledTimes(1);
            const [img, ...rest] = canvas.ctx.drawImage.mock.calls[0];
            expect(images).toContain(img);
            expect(rest).toEqual([0, 0, 256, 256]);
            expect(canvas.ctx.getImageData.mock.calls).toEqual([[0, 0, 256, 256]]);
        }
    });

    it('resolves a 256-character hash, and the read-back only when asked', async () => {
        const plain = await hashImageUrl('app://x/1');
        expect(plain.hash).toMatch(/^[01]{256}$/);
        expect(plain.pixels).toBeUndefined();
        const withPixels = await hashImageUrl('app://x/1', { wantPixels: true });
        expect(withPixels.pixels).toBe(canvases[1].ctx.getImageData.mock.results[0].value.data);
        expect(withPixels.pixels).toHaveLength(256 * 256 * 4);
    });

    it('rejects an image that cannot load', async () => {
        const p = hashImageUrl('app://x/bad');
        images[0].failWith = { message: 'boom' };
        // src is assigned synchronously inside the promise executor, so the flag is set before the microtask fires
        await expect(p).rejects.toThrow('Image load error: boom');
    });
});

describe('hashFile', () => {
    const host = (over = {}) => ({
        isJxl: () => false,
        decodeJxl: vi.fn(),
        releaseVideo: vi.fn(),
        ...over,
    });

    it('an image goes through its media URL', async () => {
        const path = 'C:\\pics\\100% #1 фото.jpg';
        const hash = await hashFile(path, host());
        expect(hash).toMatch(/^[01]{256}$/);
        expect(images[0].src).toBe(MediaUrl.toMediaUrl(path));
    });

    it('a JXL goes through a frame-0 PNG blob URL, revoked after load', async () => {
        const create = vi.fn(() => 'blob:frame0');
        const revoke = vi.fn();
        vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
        const decodeJxl = vi.fn(async () => ({ frames: [{ pngBytes: new Uint8Array([1, 2, 3]) }] }));
        const hash = await hashFile('/t/a.jxl', host({ isJxl: () => true, decodeJxl }));
        vi.unstubAllGlobals();
        expect(hash).toMatch(/^[01]{256}$/);
        expect(decodeJxl).toHaveBeenCalledWith('/t/a.jxl');
        expect(create).toHaveBeenCalledTimes(1);
        const blob = create.mock.calls[0][0];
        expect(blob.type).toBe('image/png');
        expect(images[0].src).toBe('blob:frame0');
        expect(revoke).toHaveBeenCalledWith('blob:frame0');
    });

    it('a JXL with no frames rejects, and a failed decode says so', async () => {
        await expect(
            hashFile('/t/a.jxl', host({ isJxl: () => true, decodeJxl: async () => ({ frames: [] }) }))
        ).rejects.toThrow('JXL decoded with no frames');
        await expect(
            hashFile(
                '/t/a.jxl',
                host({
                    isJxl: () => true,
                    decodeJxl: async () => {
                        throw new Error('nope');
                    },
                })
            )
        ).rejects.toThrow('JXL decode failed: nope');
    });

    it('keeps the 30 s timeout', () => {
        expect(MAIN_ROUTE_TIMEOUT_MS).toBe(30_000);
    });
});

describe('makeCanaryImages', () => {
    it('makes a 320x240 JPEG at 0.92 and a 320x240 PNG', async () => {
        const result = await makeCanaryImages();
        expect(result.map((r) => r.name)).toEqual(['canary-jpeg', 'canary-png']);
        expect(canvases.map((c) => [c.width, c.height])).toEqual([
            [320, 240],
            [320, 240],
        ]);
        expect(result[0].blob).toMatchObject({ type: 'image/jpeg', quality: 0.92 });
        expect(result[1].blob).toMatchObject({ type: 'image/png' });
    });
});
