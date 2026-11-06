'use strict';
// Shared helpers for the AI sorting prototype (throwaway, 2026-10-22).

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

// The app checkout whose node_modules and source files the prototype reuses. Defaults to two levels up
// (prototypes/ai-sorting/ -> repo root); MV_REPO overrides it when the scripts run from elsewhere.
const REPO = process.env.MV_REPO || path.resolve(__dirname, '..', '..');
const repoRequire = createRequire(path.join(REPO, 'package.json'));

const UA = 'Mozilla/5.0 (compatible; research-bot/1.0)';

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 1));
}

// Every image the benchmark embeds: the Commons originals, the near-duplicate variants, then the quality set.
// Returns [{ id, file (absolute), set: 'main'|'variant'|'quality', category, original, transform, qualityImage }].
function listImages(dataDir) {
    const manifest = readJson(path.join(dataDir, 'manifest.json'));
    const items = manifest.items.map((it) => ({
        id: it.file,
        file: path.join(dataDir, it.file),
        set: 'main',
        category: it.category,
        original: it.file,
        transform: 'original',
    }));
    const variantsFile = path.join(dataDir, 'variants.json');
    if (fs.existsSync(variantsFile)) {
        for (const v of readJson(variantsFile).items) {
            items.push({
                id: v.file,
                file: path.join(dataDir, v.file),
                set: 'variant',
                category: v.category,
                original: v.original,
                transform: v.transform,
            });
        }
    }
    const qualityFile = path.join(dataDir, 'quality.json');
    if (fs.existsSync(qualityFile)) {
        for (const q of readJson(qualityFile).items) {
            items.push({
                id: q.file,
                file: path.join(dataDir, q.file),
                set: 'quality',
                category: q.subject,
                original: q.file,
                transform: 'quality',
                qualityImage: q.qualityImage,
            });
        }
    }
    return items;
}

function l2normalize(vec) {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
        norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    const out = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
        out[i] = norm > 0 ? vec[i] / norm : 0;
    }
    return out;
}

function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
        s += a[i] * b[i];
    }
    return s;
}

function encodeVector(vec) {
    return Buffer.from(new Float32Array(vec).buffer).toString('base64');
}

function decodeVector(b64) {
    const buf = Buffer.from(b64, 'base64');
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
}

// Deterministic PRNG, the same mulberry32 ml-model.js uses.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(array, random) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function median(values) {
    const s = values.slice().sort((x, y) => x - y);
    if (s.length === 0) {
        return NaN;
    }
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(values, q) {
    const s = values.slice().sort((x, y) => x - y);
    if (s.length === 0) {
        return NaN;
    }
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function mean(values) {
    return values.length ? values.reduce((x, y) => x + y, 0) / values.length : NaN;
}

// ROC AUC by the rank-sum (Mann-Whitney) formula, ties counted half.
function rocAuc(scores, labels) {
    const pairs = scores.map((s, i) => [s, labels[i]]).sort((x, y) => x[0] - y[0]);
    let rankSum = 0;
    let positives = 0;
    let i = 0;
    while (i < pairs.length) {
        let j = i;
        while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[i][0]) {
            j++;
        }
        const avgRank = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) {
            if (pairs[k][1] === 1) {
                rankSum += avgRank;
                positives++;
            }
        }
        i = j + 1;
    }
    const negatives = pairs.length - positives;
    if (positives === 0 || negatives === 0) {
        return NaN;
    }
    return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

// Average precision of a ranked relevance list (1 = relevant).
function averagePrecision(rankedRelevance, totalRelevant) {
    let hits = 0;
    let sum = 0;
    for (let i = 0; i < rankedRelevance.length; i++) {
        if (rankedRelevance[i]) {
            hits++;
            sum += hits / (i + 1);
        }
    }
    return totalRelevant > 0 ? sum / totalRelevant : NaN;
}

module.exports = {
    REPO,
    repoRequire,
    UA,
    readJson,
    writeJson,
    listImages,
    l2normalize,
    dot,
    encodeVector,
    decodeVector,
    mulberry32,
    shuffle,
    median,
    quantile,
    mean,
    rocAuc,
    averagePrecision,
};
