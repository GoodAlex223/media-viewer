/**
 * Generates minimal binary fixture files for E2E tests.
 * Run: node tests/e2e/fixtures/generate.js
 * Idempotent — skips files that already exist.
 */

import { writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal valid 1x1 PNG (red pixel: #FF0000)
// PNG spec: signature + IHDR + IDAT (raw deflate of filter+pixel) + IEND
const RED_PNG = Buffer.from(
    '89504e470d0a1a0a' + // PNG signature
        '0000000d49484452' + // IHDR chunk length + type
        '00000001' + // width: 1
        '00000001' + // height: 1
        '0802' + // bit depth: 8, color type: 2 (RGB)
        '000000' + // compression, filter, interlace
        '907753de' + // IHDR CRC
        '0000000c4944415478' + // IDAT chunk length + type + zlib header
        '9c6260f8cf0000000201' + // compressed data
        '01e221bc33' + // IDAT CRC
        '0000000049454e44ae426082', // IEND
    'hex'
);

// Minimal valid 1x1 PNG (green pixel: #00FF00)
const GREEN_PNG = Buffer.from(
    '89504e470d0a1a0a' +
        '0000000d49484452' +
        '00000001' +
        '00000001' +
        '0802' +
        '000000' +
        '907753de' +
        '0000000c4944415478' +
        '9c6260fa0f0000000201' +
        '01d5a063d9' +
        '0000000049454e44ae426082',
    'hex'
);

// Minimal valid 1x1 PNG (blue pixel: #0000FF)
const BLUE_PNG = Buffer.from(
    '89504e470d0a1a0a' +
        '0000000d49484452' +
        '00000001' +
        '00000001' +
        '0802' +
        '000000' +
        '907753de' +
        '0000000c4944415478' +
        '9c626060f80f0000000301' +
        '0200183b7057' +
        '0000000049454e44ae426082',
    'hex'
);

// Minimal valid MP4 (ftyp box only — enough for extension detection, not playable)
const TINY_MP4 = Buffer.from(
    '00000018' + // box size: 24
        '66747970' + // box type: ftyp
        '69736f6d' + // major brand: isom
        '00000200' + // minor version
        '69736f6d' + // compatible brand: isom
        '6d703431' + // compatible brand: mp41
        '00000008' + // box size: 8
        '6d646174', // box type: mdat (empty)
    'hex'
);

const fixtures = [
    { name: 'red-1x1.png', data: RED_PNG },
    { name: 'green-1x1.png', data: GREEN_PNG },
    { name: 'blue-1x1.png', data: BLUE_PNG },
    { name: 'tiny.mp4', data: TINY_MP4 },
];

let created = 0;
let skipped = 0;

for (const { name, data } of fixtures) {
    const filePath = join(__dirname, name);
    try {
        await access(filePath);
        skipped++;
    } catch {
        await writeFile(filePath, data);
        created++;
    }
}

console.log(`Fixtures: ${created} created, ${skipped} skipped (already exist)`);
