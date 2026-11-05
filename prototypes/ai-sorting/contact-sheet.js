'use strict';
// Contact sheet for a label sanity check: N thumbnails per subject, one row per subject.
// Usage: node contact-sheet.js <dataDir> <out.jpg> [perRow] [set]
const { repoRequire, listImages } = require('./common');
const sharp = repoRequire('sharp');
async function main() {
    const [dataDir, out, perRowArg, setArg] = process.argv.slice(2);
    const perRow = Number(perRowArg || 8);
    const set = setArg || 'main';
    const cell = 96;
    const items = listImages(dataDir).filter((it) => it.set === set);
    const subjects = [...new Set(items.map((it) => it.category))];
    const composites = [];
    for (const [row, subject] of subjects.entries()) {
        const list = items.filter((it) => it.category === subject).slice(0, perRow);
        for (const [col, it] of list.entries()) {
            const input = await sharp(it.file).resize(cell, cell, { fit: 'cover' }).toBuffer();
            composites.push({ input, left: col * cell, top: row * cell });
        }
    }
    await sharp({ create: { width: perRow * cell, height: subjects.length * cell, channels: 3, background: '#fff' } })
        .composite(composites)
        .jpeg({ quality: 80 })
        .toFile(out);
    console.log(subjects.join(', '));
}
main();
