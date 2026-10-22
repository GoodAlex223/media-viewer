'use strict';
// The app's two non-neural signals for every benchmark image, computed with the app's own code:
//   - the perceptual hash: perceptual-hash.js blockhash(imageData, 16) over a 256x256 stretch;
//   - the 64-dim hand-crafted vector: feature-extractor.js extractFeatures over a 256x256 stretch.
// The app draws on a canvas; here sharp does the 256x256 stretch (lanczos3), so a hash can differ from the
// app's by a few bits. Face dims stay 0 (the app fills them only with face detection on).
//
// Usage: node baseline-features.js <dataDir> <outDir>

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { REPO, repoRequire, listImages, encodeVector, writeJson } = require('./common');

const sharp = repoRequire('sharp');
const { extractFeatures } = require(path.join(REPO, 'feature-extractor.js'));

async function main() {
    const [dataDir, outDir] = process.argv.slice(2).map((p) => path.resolve(p));
    const { blockhash, HASH_BITS, HASH_CANVAS_SIZE } = await import(
        pathToFileURL(path.join(REPO, 'perceptual-hash.js')).href
    );
    const hashes = {};
    const features = {};
    const ms = [];
    for (const img of listImages(dataDir)) {
        const t0 = performance.now();
        const { data, info } = await sharp(img.file)
            .resize(HASH_CANVAS_SIZE, HASH_CANVAS_SIZE, { fit: 'fill' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const imageData = {
            data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
            width: info.width,
            height: info.height,
        };
        hashes[img.id] = blockhash(imageData, HASH_BITS);
        const meta = await sharp(img.file).metadata();
        features[img.id] = encodeVector(
            extractFeatures(imageData, {
                width: meta.width,
                height: meta.height,
                fileSize: fs.statSync(img.file).size,
                isVideo: false,
                format: 'jpg',
            })
        );
        ms.push(performance.now() - t0);
    }
    writeJson(path.join(outDir, 'baseline.json'), { hashBits: HASH_BITS * HASH_BITS, hashes, features });
    console.log(
        `${Object.keys(hashes).length} images, ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)} ms/image mean`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
