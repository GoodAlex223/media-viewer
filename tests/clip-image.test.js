// G3 addendum (spec docs/superpowers/specs/2026-10-13-g3-training-video-extraction-design.md § 11): main's CLIP
// decode falls back to a lenient sharp decode only when the strict RawImage.read rejects a file. Runs against the
// real RawImage and the real sharp, on fixtures generated here.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { readClipImage, LENIENT_MAX_SIDE } = require('../clip-image');

let RawImage;
let dir;
const files = {};

beforeAll(async () => {
    ({ RawImage } = await import(
        pathToFileURL(path.join(__dirname, '..', 'node_modules/@huggingface/transformers/dist/transformers.node.mjs'))
            .href
    ));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-image-'));
    // Noise, so the entropy-coded data is large and cutting it leaves a truncated scan.
    const jpeg = await sharp({
        create: {
            width: 2000,
            height: 1000,
            channels: 3,
            background: '#808080',
            noise: { type: 'gaussian', mean: 128, sigma: 40 },
        },
    })
        .jpeg()
        .toBuffer();
    files.good = path.join(dir, 'good.jpg');
    fs.writeFileSync(files.good, jpeg);
    files.truncated = path.join(dir, 'truncated.jpg');
    fs.writeFileSync(files.truncated, jpeg.subarray(0, Math.floor(jpeg.length * 0.6)));
    files.greyAlpha = path.join(dir, 'grey-alpha.png');
    await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 90, g: 90, b: 90, alpha: 0.5 } } })
        .toColourspace('b-w')
        .png()
        .toFile(files.greyAlpha);
    files.notImage = path.join(dir, 'not-an-image.jpg');
    fs.writeFileSync(files.notImage, Buffer.from('this is not an image'));
});

afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readClipImage (G3 addendum)', () => {
    it('returns exactly what the strict read returns, and never calls the fallback', async () => {
        const spy = vi.fn(sharp);
        const warn = vi.fn();
        const image = await readClipImage(files.good, { RawImage, sharp: spy, warn });
        const strict = await RawImage.read(files.good);
        expect([image.width, image.height, image.channels]).toEqual([strict.width, strict.height, strict.channels]);
        expect(Buffer.from(image.data).equals(Buffer.from(strict.data))).toBe(true);
        expect(spy).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it('decodes a truncated JPEG that the strict read rejects, to 3 channels within LENIENT_MAX_SIDE', async () => {
        await expect(RawImage.read(files.truncated)).rejects.toThrow(); // the fixture discriminates
        const warn = vi.fn();
        const image = await readClipImage(files.truncated, { RawImage, sharp, warn });
        expect(image.channels).toBe(3);
        expect(Math.max(image.width, image.height)).toBe(LENIENT_MAX_SIDE);
        expect(image.data.length).toBe(image.width * image.height * 3);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/^CLIP: truncated\.jpg needed the lenient decoder \(.+\)$/);
    });

    it('decodes a grey+alpha PNG to 3 channels', async () => {
        const image = await readClipImage(files.greyAlpha, { RawImage, sharp, warn: vi.fn() });
        expect(image.channels).toBe(3);
        expect([image.width, image.height]).toEqual([64, 32]);
    });

    it('rethrows the strict error when neither decoder can read the file', async () => {
        const strictMessage = await RawImage.read(files.notImage).then(
            () => 'resolved',
            (err) => err.message
        );
        const warn = vi.fn();
        await expect(readClipImage(files.notImage, { RawImage, sharp, warn })).rejects.toThrow(strictMessage);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/^CLIP: cannot decode not-an-image\.jpg: /);
    });

    it('asks sharp for no failure threshold and no pixel limit (the 280-megapixel case)', async () => {
        // A mechanism pin: no small fixture exceeds sharp's 268-megapixel default. Mutation-check: drop
        // `limitInputPixels: false` from clip-image.js → this fails.
        const spy = vi.fn(sharp);
        await readClipImage(files.truncated, { RawImage, sharp: spy, warn: vi.fn() });
        expect(spy).toHaveBeenCalledWith(files.truncated, { failOn: 'none', limitInputPixels: false });
    });
});
