/**
 * Generates the awkward image fixtures the hash-route E2E needs (G2 PR 2 T7), at test time, into a folder the
 * test owns, so nothing new is committed. Ported from the spike generator: the same seeded photo-like content
 * (gradients, rings and noise, so downscale and rounding differences show up), written with the repo's sharp.
 *
 * The committed 1x1 PNGs are not usable here: their IDAT CRC is bad and their zlib stream is invalid, so
 * createImageBitmap rejects them and every such file would take the main-thread route instead of the worker.
 */

import { copyFile } from 'fs/promises';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));

// Names whose URL encoding differs from the raw path (Review Focus #1).
export const ENCODING_NAMES = ['100% #1 фото.jpg', 'a&b=c;d.png'];

function photo(w, h, channels = 3, seed = 1) {
    const buf = Buffer.alloc(w * h * channels);
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const clamp = (v) => Math.max(0, Math.min(255, v));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * channels;
            const cx = x / w;
            const cy = y / h;
            const ring = Math.sin(Math.hypot(cx - 0.4, cy - 0.6) * 40) * 60;
            buf[i] = clamp(255 * cx + ring + (rnd() - 0.5) * 50);
            buf[i + 1] = clamp(255 * cy - ring + (rnd() - 0.5) * 50);
            buf[i + 2] = clamp(128 + 100 * Math.sin(x / 37) * Math.cos(y / 23) + (rnd() - 0.5) * 50);
            if (channels === 4) {
                buf[i + 3] = clamp(255 * (1 - cx) + (rnd() - 0.5) * 40);
            }
        }
    }
    return sharp(buf, { raw: { width: w, height: h, channels } });
}

/**
 * Writes every fixture into `dir`. Returns the file names written, in a stable order.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function generateHashFixtures(dir) {
    const jobs = {
        'plain-1200x900.jpg': () => photo(1200, 900).jpeg({ quality: 90 }),
        'exif-rot6.jpg': () => photo(1200, 900).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }),
        'exif-rot3.jpg': () => photo(1200, 900, 3, 2).jpeg({ quality: 90 }).withMetadata({ orientation: 3 }),
        'exif-rot8.jpg': () => photo(1000, 1400, 3, 3).jpeg({ quality: 90 }).withMetadata({ orientation: 8 }),
        'icc-p3.jpg': () => photo(1200, 900, 3, 4).withIccProfile('p3').jpeg({ quality: 90 }),
        // The profile goes in withMetadata: on its own, withMetadata() resets it to sRGB (PR #87 review #6).
        'icc-p3-rot6.jpg': () => photo(1200, 900, 3, 5).withMetadata({ orientation: 6, icc: 'p3' }).jpeg(),
        'cmyk.jpg': () => photo(1200, 900, 3, 6).withIccProfile('cmyk').jpeg({ quality: 90 }),
        'progressive.jpg': () => photo(1600, 1200, 3, 7).jpeg({ quality: 85, progressive: true }),
        'chroma444.jpg': () => photo(1200, 900, 3, 8).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }),
        // b-w makes a 1-component JPEG; .grayscale() alone writes a 3-component YCbCr one (R-F5).
        'gray.jpg': () => photo(1200, 900, 3, 9).grayscale().toColourspace('b-w').jpeg(),
        'large-6000x4000.jpg': () => photo(6000, 4000, 3, 10).jpeg({ quality: 88 }),
        'pano-8000x2000.jpg': () => photo(8000, 2000, 3, 11).jpeg({ quality: 88 }),
        // Wider than a 16,384 px maximum texture, where one route could take a CPU path (R-F6).
        'pano-16500x1500.jpg': () => photo(16500, 1500, 3, 25).jpeg({ quality: 88 }),
        'odd-257x255.jpg': () => photo(257, 255, 3, 18).jpeg(),
        'large-4000x3000.png': () => photo(4000, 3000, 3, 12).png(),
        'alpha.png': () => photo(1200, 900, 4, 13).png(),
        'alpha-small.png': () => photo(300, 200, 4, 14).png(),
        'png16.png': () => photo(800, 600, 3, 15).toColourspace('rgb16').png(),
        'palette.png': () => photo(800, 600, 3, 16).png({ palette: true }),
        'tiny-40x30.png': () => photo(40, 30, 3, 17).png(),
        'lossy.webp': () => photo(1200, 900, 3, 19).webp({ quality: 80 }),
        'alpha.webp': () => photo(1200, 900, 4, 20).webp({ quality: 80 }),
        'still.gif': () => photo(600, 450, 3, 21).gif(),
        'alpha.gif': () => photo(600, 450, 4, 22).gif(),
        // The Review Focus #1 names: '%', '#', spaces, Cyrillic, '&', '=' and ';' all change under encoding.
        [ENCODING_NAMES[0]]: () => photo(640, 480, 3, 23).jpeg({ quality: 90 }),
        [ENCODING_NAMES[1]]: () => photo(640, 480, 3, 24).png(),
    };

    const written = [];
    for (const [name, make] of Object.entries(jobs)) {
        await make().toFile(join(dir, name));
        written.push(name);
    }

    // Animated GIF and WebP: three different frames joined (sharp >= 0.34 `join.animated`).
    const frames = await Promise.all([31, 32, 33].map((seed) => photo(500, 400, 3, seed).png().toBuffer()));
    await sharp(frames, { join: { animated: true } })
        .gif({ loop: 0, delay: [100, 100, 100] })
        .toFile(join(dir, 'animated.gif'));
    await sharp(frames, { join: { animated: true } })
        .webp({ loop: 0, delay: [100, 100, 100] })
        .toFile(join(dir, 'animated.webp'));
    written.push('animated.gif', 'animated.webp');

    // The lossy WebP's bytes under a .png name: the decoder must go by content, not by extension.
    await copyFile(join(dir, 'lossy.webp'), join(dir, 'misnamed-webp.png'));
    written.push('misnamed-webp.png');

    for (const name of ['static.jxl', 'animated-64x64.jxl']) {
        await copyFile(resolve(FIXTURES_DIR, name), join(dir, name));
        written.push(name);
    }
    return written;
}
