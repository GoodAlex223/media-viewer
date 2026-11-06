'use strict';
// Near-duplicate set: six edited copies of the first N originals per category, made locally with sharp
// (crop, heavy JPEG, colour shift, mirror, small tilt, border + caption band). Copy-detection style edits,
// the kind a folder of saved or re-shared images accumulates.
//
// Usage: node make-variants.js <dataDir> [perCategory]   -> <dataDir>/variants/*.jpg + <dataDir>/variants.json

const fs = require('fs');
const path = require('path');
const { repoRequire, readJson, writeJson } = require('./common');

const sharp = repoRequire('sharp');

const TRANSFORMS = {
    async crop(img, { width, height }) {
        const w = Math.round(width * 0.8);
        const h = Math.round(height * 0.8);
        return img.extract({
            left: Math.round((width - w) / 2),
            top: Math.round((height - h) / 2),
            width: w,
            height: h,
        });
    },
    async jpeg(img, { width }) {
        return img.resize({ width: Math.round(width / 2) }).jpeg({ quality: 20 });
    },
    async color(img) {
        return img.modulate({ brightness: 1.2, saturation: 1.4, hue: 12 });
    },
    async flip(img) {
        return img.flop();
    },
    async tilt(img, { width, height }) {
        // Rotate 8 degrees, then keep the central 75% so no black corners remain.
        const rotated = await img.rotate(8, { background: '#000' }).toBuffer({ resolveWithObject: true });
        const w = Math.round(width * 0.75);
        const h = Math.round(height * 0.75);
        return sharp(rotated.data).extract({
            left: Math.round((rotated.info.width - w) / 2),
            top: Math.round((rotated.info.height - h) / 2),
            width: w,
            height: h,
        });
    },
    async overlay(img, { width, height }) {
        const pad = Math.round(Math.max(width, height) * 0.08);
        const band = Math.round(height * 0.12);
        const svg = Buffer.from(
            `<svg width="${width}" height="${band}"><rect width="100%" height="100%" fill="#fff" fill-opacity="0.85"/>` +
                `<text x="50%" y="62%" font-size="${Math.round(band * 0.5)}" text-anchor="middle" font-family="sans-serif" fill="#000">saved copy 2026</text></svg>`
        );
        const captioned = await img.composite([{ input: svg, left: 0, top: height - band }]).toBuffer();
        return sharp(captioned).extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#000' });
    },
};

async function main() {
    const dataDir = path.resolve(process.argv[2]);
    const perCategory = Number(process.argv[3] || 5);
    const manifest = readJson(path.join(dataDir, 'manifest.json'));
    const byCategory = new Map();
    for (const item of manifest.items) {
        if (!byCategory.has(item.category)) {
            byCategory.set(item.category, []);
        }
        byCategory.get(item.category).push(item);
    }
    const outDir = path.join(dataDir, 'variants');
    fs.mkdirSync(outDir, { recursive: true });
    const items = [];
    for (const [category, list] of byCategory) {
        for (const item of list.slice(0, perCategory)) {
            const src = path.join(dataDir, item.file);
            const { width, height } = await sharp(src).metadata();
            for (const [name, transform] of Object.entries(TRANSFORMS)) {
                const rel = `variants/${path.basename(item.file, '.jpg')}__${name}.jpg`;
                const out = await transform(sharp(src), { width, height });
                if (name === 'jpeg') {
                    await out.toFile(path.join(dataDir, rel));
                } else {
                    await out.jpeg({ quality: 90 }).toFile(path.join(dataDir, rel));
                }
                items.push({ file: rel, original: item.file, category, transform: name });
            }
        }
    }
    writeJson(path.join(dataDir, 'variants.json'), { transforms: Object.keys(TRANSFORMS), items });
    console.log(`${items.length} variants of ${items.length / Object.keys(TRANSFORMS).length} originals`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
