'use strict';
// Writes the committed copy of a run's results: the markdown tables, and JSON without embedding vectors or
// per-trial arrays (bench.js regenerates those exactly: every seed is fixed).
//
// Usage: node export-results.js <resultsDir> <outDir>

const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./common');

const round = (x) => (typeof x === 'number' ? +x.toFixed(4) : x);

function strip(value) {
    if (Array.isArray(value)) {
        return value.map(strip);
    }
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k === 'vectors' || k === 'aucPerTrial' || k === 'likesIn60Shown' || k === 'heldOutAuc') {
                continue;
            }
            out[k] = strip(v);
        }
        return out;
    }
    return round(value);
}

function main() {
    const [resultsDir, outDir] = process.argv.slice(2).map((p) => path.resolve(p));
    fs.mkdirSync(outDir, { recursive: true });
    for (const name of ['metrics.md', 'paired.md', 'fidelity.jsonl']) {
        if (fs.existsSync(path.join(resultsDir, name))) {
            fs.copyFileSync(path.join(resultsDir, name), path.join(outDir, name));
        }
    }
    writeJson(path.join(outDir, 'metrics-summary.json'), strip(readJson(path.join(resultsDir, 'metrics.json'))));
    const subs = [
        'zeroshot',
        'utility',
        path.join('run2', 'utility'),
        path.join('timing', 'emb'),
        path.join('timing2', 'emb'),
        path.join('adapter0', 'emb'),
        path.join('adapter1', 'emb'),
    ];
    for (const sub of subs) {
        const dir = path.join(resultsDir, sub);
        if (!fs.existsSync(dir)) {
            continue;
        }
        const records = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .sort()
            .map((f) => ({ file: f, ...strip(readJson(path.join(dir, f))) }));
        writeJson(path.join(outDir, `${sub.split(path.sep).join('-')}.json`), records);
    }
    console.log(fs.readdirSync(outDir).join(', '));
}

main();
