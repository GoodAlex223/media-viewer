// G3 training-folder video extraction (spec docs/superpowers/specs/2026-10-13-g3-training-video-extraction-design.md
// § 6): computeFeatures and computePerceptualHash let go of a <video> through _releaseVideo, never by emptying its
// src. Run against a fake element that follows the two HTML rules the fix rests on.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as MediaUrl from '../media-url.js';
// The extracted methods reach the namespace import through globalThis (like LikeOrSkip).
globalThis.MediaUrl = MediaUrl;

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable, sync or async (the technique of like-or-skip-glue.test.js). */
function extract(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(([^)]*)\\)\\s*\\{`, 'm'));
    if (!match) {
        throw new Error(`Could not find method: ${name}`);
    }
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            const Ctor = match[1] ? AsyncFunction : Function;
            return new Ctor(match[2], source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

const ERROR_CAP = 50;

/**
 * A fake <video> that follows the two HTML rules G3 rests on (spec § 2.2, D2): setting `src` to '' is a load
 * failure that fires `error`; with NO src attribute, `load()` just empties the element. It stops firing `error`
 * at ERROR_CAP, so the old endless loop shows up as a count instead of hanging the test.
 *   loadable: false — every load fails (a corrupt file);  stall: true — the file never answers (the timeout);
 *   errorOnRelease: true — a release fires `error` too. Not what the spec says; used only to pin that
 *   computeFeatures detaches its handler before it releases.
 */
class FakeVideo extends EventTarget {
    constructor({ loadable = true, stall = false, errorOnRelease = false } = {}) {
        super();
        Object.assign(this, { loadable, stall, errorOnRelease });
        this.errors = 0;
        this.srcAttr = null; // null: no src attribute
        this.videoWidth = 64;
        this.videoHeight = 48;
        this.error = null;
    }
    get src() {
        return this.srcAttr ?? '';
    }
    set src(value) {
        this.srcAttr = String(value);
        if (this.srcAttr === '' || !this.loadable) {
            this._fail();
        } else if (!this.stall) {
            this._fire('loadeddata');
        }
    }
    getAttribute(name) {
        return name === 'src' ? this.srcAttr : null;
    }
    removeAttribute(name) {
        if (name === 'src') this.srcAttr = null;
    }
    load() {
        if (this.srcAttr !== null) return;
        this._fire('emptied');
        if (this.errorOnRelease) this._fail();
    }
    set currentTime(_t) {
        this._fire('seeked');
    }
    _fire(type) {
        setTimeout(() => this.dispatchEvent(new Event(type)), 0);
    }
    _fail() {
        if (this.errors >= ERROR_CAP) return;
        this.errors++;
        this.error = { code: 4, message: 'MEDIA_ELEMENT_ERROR: Empty src attribute' };
        this._fire('error');
    }
}

// Long enough for the old loop to fire many times (one setTimeout(0) per error: 13-16 in 150 ms on Windows' timer
// granularity, measured); ERROR_CAP only bounds it.
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const saved = { window: globalThis.window, document: globalThis.document, extractFeatures: globalThis.extractFeatures };
let videos;
let videoOptions;
beforeEach(() => {
    videos = [];
    videoOptions = {};
    globalThis.document = {
        createElement: (tag) => {
            if (tag === 'video') {
                const v = new FakeVideo(videoOptions);
                videos.push(v);
                return v;
            }
            return {
                width: 0,
                height: 0,
                getContext: () => ({
                    drawImage() {},
                    putImageData() {},
                    getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
                }),
            };
        },
    };
    globalThis.window = {
        electronAPI: { probeVideo: vi.fn(async () => ({ success: false })) },
        // Async on purpose: this await is what let the old `error` settle the promise first.
        FaceDetector: {
            detect: vi.fn(async () => {
                await new Promise((r) => setTimeout(r, 5));
                return { hasFace: false, count: 0, areaRatio: 0 };
            }),
        },
    };
    globalThis.extractFeatures = vi.fn(() => new Float32Array(64).fill(0.5));
});
afterEach(() => {
    vi.useRealTimers();
    globalThis.window = saved.window;
    globalThis.document = saved.document;
    globalThis.extractFeatures = saved.extractFeatures;
});

describe('_releaseVideo (G3)', () => {
    it('drops the src attribute and fires no error', async () => {
        const release = extract('_releaseVideo');
        const v = new FakeVideo();
        v.src = '/t/clip.mp4';
        release.call({}, v);
        await settle(20);
        expect(v.getAttribute('src')).toBeNull();
        expect(v.errors).toBe(0);
    });
});

describe('computeFeatures — video (G3)', () => {
    const computeFeatures = extract('computeFeatures');
    const ctxFor = (overrides = {}) => ({
        featureCache: new Map(),
        featureMetadata: new Map(),
        mediaFiles: [],
        enableFaceDetection: true,
        _releaseVideo: extract('_releaseVideo'),
        ...overrides,
    });
    const run = (ctx, file = '/t/clip.mp4') => computeFeatures.call(ctx, file, { size: 1 }, { useHostCache: false });

    it('resolves with face detection on, and its element fires no error afterwards', async () => {
        const features = await run(ctxFor());
        expect(features).toHaveLength(64);
        await settle();
        expect(videos[0].errors).toBe(0);
        expect(videos[0].getAttribute('src')).toBeNull();
    });

    it('with face detection off it resolves too, and still fires no error afterwards (Review Focus 3)', async () => {
        const features = await run(ctxFor({ enableFaceDetection: false }));
        expect(features).toHaveLength(64);
        await settle();
        expect(videos[0].errors).toBe(0);
    });

    it('a video that cannot load rejects once, and nothing empties its src afterwards', async () => {
        videoOptions = { loadable: false };
        await expect(run(ctxFor())).rejects.toThrow('Video load error');
        await settle();
        expect(videos[0].errors).toBe(1);
    });

    it('a stalled video times out and is released', async () => {
        vi.useFakeTimers();
        videoOptions = { stall: true };
        const assertion = expect(run(ctxFor())).rejects.toThrow('Timeout');
        await vi.advanceTimersByTimeAsync(30000);
        await assertion;
        expect(videos[0].getAttribute('src')).toBeNull();
    });

    it('two videos in a row both resolve, and neither element fires an error (Review Focus 2)', async () => {
        const ctx = ctxFor();
        expect(await run(ctx, '/t/a.mp4')).toHaveLength(64);
        expect(await run(ctx, '/t/b.webm')).toHaveLength(64);
        await settle();
        expect(videos.map((v) => v.errors)).toEqual([0, 0]);
    });

    it('still resolves if releasing fires an error — the handler is detached first (Review Focus 5)', async () => {
        // Models an engine that deviates from the spec. Mutation-check: delete the
        // `video.removeEventListener('error', onError)` line in computeFeatures' seeked handler → this rejects.
        videoOptions = { errorOnRelease: true };
        expect(await run(ctxFor())).toHaveLength(64);
    });
});

describe('computePerceptualHash — video (G3)', () => {
    const computePerceptualHash = extract('computePerceptualHash');
    const ctxFor = () => ({ blockhash: vi.fn(() => 'hash-1'), _releaseVideo: extract('_releaseVideo') });

    it('returns the hash, and its element fires no error afterwards', async () => {
        // The hash part passed before G3 as well (it resolved before the queued error); the error count is the RED.
        expect(await computePerceptualHash.call(ctxFor(), '/t/clip.mp4')).toBe('hash-1');
        await settle();
        expect(videos[0].errors).toBe(0);
        expect(videos[0].getAttribute('src')).toBeNull();
    });

    it('a video that cannot load rejects once, and nothing empties its src afterwards', async () => {
        videoOptions = { loadable: false };
        await expect(computePerceptualHash.call(ctxFor(), '/t/clip.mp4')).rejects.toThrow(
            'Video load error: Unknown error'
        );
        await settle();
        expect(videos[0].errors).toBe(1);
    });

    it('a hash that throws rejects, and nothing empties its src afterwards', async () => {
        const ctx = {
            ...ctxFor(),
            blockhash: vi.fn(() => {
                throw new Error('hash failed');
            }),
        };
        await expect(computePerceptualHash.call(ctx, '/t/clip.mp4')).rejects.toThrow('hash failed');
        await settle();
        expect(videos[0].errors).toBe(0);
        expect(videos[0].getAttribute('src')).toBeNull();
    });
});
