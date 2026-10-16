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
const zlib = require('zlib');
const { readClipImage, LENIENT_MAX_SIDE } = require('../clip-image');

let RawImage;
let dir;
const files = {};

// A PNG that is only its header: signature, an IHDR declaring width x height (8-bit greyscale, no interlace), an
// IDAT holding one row of zeros (an empty stream is rejected as 'IDAT stream too short'), and IEND. Well under a
// kilobyte that claims an enormous frame, like a crafted file.
function headerOnlyPng(width, height) {
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const out = Buffer.alloc(body.length + 8);
        out.writeUInt32BE(data.length, 0);
        body.copy(out, 4);
        out.writeUInt32BE(zlib.crc32(body), body.length + 4);
        return out;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 0; // colour type 0: greyscale
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(Buffer.alloc(width + 1))),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

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
    // Noise again: without it the GIF compresses to almost nothing and a cut leaves it whole.
    const gif = await sharp({
        create: {
            width: 400,
            height: 300,
            channels: 3,
            background: '#808080',
            noise: { type: 'gaussian', mean: 128, sigma: 40 },
        },
    })
        .gif()
        .toBuffer();
    files.truncatedGif = path.join(dir, 'truncated.gif');
    fs.writeFileSync(files.truncatedGif, gif.subarray(0, Math.floor(gif.length * 0.6)));
    files.greyAlpha = path.join(dir, 'grey-alpha.png');
    await sharp({ create: { width: 64, height: 32, channels: 4, background: { r: 90, g: 90, b: 90, alpha: 0.5 } } })
        .toColourspace('b-w')
        .png()
        .toFile(files.greyAlpha);
    files.notImage = path.join(dir, 'not-an-image.jpg');
    fs.writeFileSync(files.notImage, Buffer.from('this is not an image'));
    files.userSize = path.join(dir, 'header-14031x19933.png'); // the user's 279.7-megapixel JPEG, as a header
    fs.writeFileSync(files.userSize, headerOnlyPng(14031, 19933));
    files.overBound = path.join(dir, 'header-24000x24000.png'); // 576 MP, over the lenient bound of 2 ** 29
    fs.writeFileSync(files.overBound, headerOnlyPng(24000, 24000));
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

    it('does not keep the file open: it can be renamed right after a lenient decode (Windows EBUSY)', async () => {
        // A path input lets libvips' operation cache hold a GIF/WebP handle open, and on Windows a move of that file
        // then fails with EBUSY. The cache-count assertion is the portable one; the rename assertion is RED only on
        // Windows and passes by construction elsewhere.
        await expect(RawImage.read(files.truncatedGif)).rejects.toThrow(); // the fixture discriminates
        const before = sharp.cache().files.current;
        const warn = vi.fn();
        const image = await readClipImage(files.truncatedGif, { RawImage, sharp, warn });
        expect(image.channels).toBe(3);
        expect(sharp.cache().files.current).toBe(before);
        const moved = files.truncatedGif + '.moved';
        try {
            expect(() => fs.renameSync(files.truncatedGif, moved)).not.toThrow();
        } finally {
            if (fs.existsSync(moved)) fs.renameSync(moved, files.truncatedGif);
        }
    });

    it('decodes a grey+alpha PNG to 3 channels', async () => {
        await expect(RawImage.read(files.greyAlpha)).rejects.toThrow(); // the fixture discriminates
        const warn = vi.fn();
        const image = await readClipImage(files.greyAlpha, { RawImage, sharp, warn });
        expect(image.channels).toBe(3);
        expect([image.width, image.height]).toEqual([64, 32]);
        expect(warn).toHaveBeenCalledTimes(1);
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

    it('decodes a 279.7-megapixel file that the strict read refuses, shrunk to LENIENT_MAX_SIDE', async () => {
        // The user's 14031x19933 JPEG is over sharp's 268-megapixel default and under the lenient bound.
        await expect(RawImage.read(files.userSize)).rejects.toThrow(); // the fixture discriminates
        const warn = vi.fn();
        const image = await readClipImage(files.userSize, { RawImage, sharp, warn });
        expect(image.channels).toBe(3);
        expect(Math.max(image.width, image.height)).toBe(LENIENT_MAX_SIDE);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('refuses a 576-megapixel header with the strict error, not an unbounded decode', async () => {
        // Over 2 ** 29 pixels: the lenient decode refuses it too, so the strict message comes back.
        // Mutation-check: set the bound to `false` in clip-image.js → this fails (the decode runs, seconds long).
        const strictMessage = await RawImage.read(files.overBound).then(
            () => 'resolved',
            (err) => err.message
        );
        expect(strictMessage).not.toBe('resolved');
        const warn = vi.fn();
        await expect(readClipImage(files.overBound, { RawImage, sharp, warn })).rejects.toThrow(strictMessage);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/^CLIP: cannot decode header-24000x24000\.png: /);
    });
});
