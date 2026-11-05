'use strict';
// How far does a quantised export move the embedding? Cosine between two runs' vectors for the same images
// (e.g. a q8 run against an fp32 run of the same model).
//
// Usage: node compare-runs.js <embJsonA> <embJsonB>

const C = require('./common');

const [fileA, fileB] = process.argv.slice(2);
const a = C.readJson(fileA);
const b = C.readJson(fileB);
const ids = Object.keys(b.vectors).filter((id) => a.vectors[id]);
const sims = ids.map((id) => C.dot(C.decodeVector(a.vectors[id]), C.decodeVector(b.vectors[id])));
console.log(
    JSON.stringify({
        a: `${a.key} (${a.dtype}, ${a.device})`,
        b: `${b.key} (${b.dtype}, ${b.device})`,
        images: ids.length,
        cosMedian: +C.median(sims).toFixed(4),
        cosP10: +C.quantile(sims, 0.1).toFixed(4),
        cosMin: +Math.min(...sims).toFixed(4),
    })
);
