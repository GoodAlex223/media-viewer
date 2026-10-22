'use strict';
// Re-creates a run's exact image set from the committed manifests: downloads each thumbnail by its recorded URL
// (one at a time, generic User-Agent), checks its SHA-256, and writes the manifest the other scripts read.
// fetch-commons.js / fetch-quality.js would draw a new random sample instead.
//
// Usage: node restore-data.js <manifest.json> <dataDir> [quality.json]
//   then: node make-variants.js <dataDir> 5   (the edited copies are regenerated, deterministically)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UA, readJson, writeJson } = require('./common');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function restore(manifestFile, dataDir, outName) {
    const manifest = readJson(manifestFile);
    let identical = 0;
    let differing = 0;
    for (const item of manifest.items) {
        const dest = path.join(dataDir, item.file);
        if (!fs.existsSync(dest)) {
            await sleep(1200);
            const res = await fetch(item.thumbUrl, { headers: { 'User-Agent': UA } });
            if (!res.ok) {
                console.log(`HTTP ${res.status}: ${item.title}`);
                continue;
            }
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        }
        const sha = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
        if (sha === item.sha256) {
            identical++;
        } else {
            differing++;
            console.log(`SHA-256 differs (the thumbnail was re-rendered?): ${item.title}`);
        }
    }
    writeJson(path.join(dataDir, outName), manifest);
    console.log(
        `${outName}: ${identical}/${manifest.items.length} identical to the report's run, ${differing} differing, ` +
            `${manifest.items.length - identical - differing} missing`
    );
}

async function main() {
    const [manifestFile, dataDir, qualityFile] = process.argv.slice(2).map((p) => p && path.resolve(p));
    await restore(manifestFile, dataDir, 'manifest.json');
    if (qualityFile) {
        await restore(qualityFile, dataDir, 'quality.json');
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
