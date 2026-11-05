'use strict';
// Scores every signal the prototype computed against the labelled public-domain set.
//   A. Subject neighbours: precision@k and mAP of same-subject images, originals only.
//   B. The app's own similarity sort (sorting-worker.js, unchanged): share of adjacent pairs with the same subject.
//   C. Near-duplicates: each edited copy queries everything else; its original and sibling copies are the hits.
//   D. Few-shot like model: synthetic tastes (liked subjects), n likes + n dislikes, ranking quality on the rest,
//      with the app's OnlineLogisticRegression (ml-model.js, unchanged) and three alternative learners.
//   E. Like-or-skip simulation: does training on skipped files help?
//   F. Speed and size, from the embedder's own records.
//
// Usage: node bench.js <dataDir> <resultsDir> [trials] [modelsDir]   (modelsDir: for the LAION aesthetic head)

const fs = require('fs');
const path = require('path');
const C = require('./common');

const { OnlineLogisticRegression } = require(path.join(C.REPO, 'ml-model.js'));
const { loadAestheticHead, aestheticScore } = require('./aesthetic');

// ---------------------------------------------------------------- signals

function loadSignals(dataDir, resultsDir) {
    const items = C.listImages(dataDir);
    const base = C.readJson(path.join(resultsDir, 'baseline.json'));
    const hashes = items.map((it) => base.hashes[it.id]);
    const signals = [{ name: 'phash', kind: 'hash', hashes }];
    const vectorSets = {
        f64: items.map((it) => C.decodeVector(base.features[it.id])),
    };
    const runs = [];
    const embDir = path.join(resultsDir, 'emb');
    for (const file of fs.readdirSync(embDir).sort()) {
        if (!file.endsWith('.json')) {
            continue;
        }
        const run = C.readJson(path.join(embDir, file));
        const { vectors, ...summary } = run;
        runs.push(summary);
        if (run.device !== 'cpu' || run.n !== items.length || run.host.runtime.startsWith('electron')) {
            continue; // GPU, Electron and partial runs are timing records only
        }
        const vecs = items.map((it) => C.decodeVector(vectors[it.id]));
        vectorSets[run.key] = vecs;
        signals.push({ name: run.key, kind: 'vec', vecs });
    }
    // Dedicated timing runs (a fixed subset, one encoder at a time): speed records only.
    const timingDir = path.join(resultsDir, 'timing', 'emb');
    const timing = [];
    if (fs.existsSync(timingDir)) {
        for (const file of fs.readdirSync(timingDir).sort()) {
            if (file.endsWith('.json')) {
                const { vectors: _v, ...summary } = C.readJson(path.join(timingDir, file));
                timing.push(summary);
            }
        }
    }
    return { items, signals, vectorSets, runs, timing };
}

function similarityMatrix(signal) {
    const n = signal.kind === 'hash' ? signal.hashes.length : signal.vecs.length;
    const S = Array.from({ length: n }, () => new Float64Array(n));
    if (signal.kind === 'hash') {
        const bits = signal.hashes.map((h) => Uint8Array.from(h, (c) => (c === '1' ? 1 : 0)));
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                let d = 0;
                const a = bits[i];
                const b = bits[j];
                for (let k = 0; k < a.length; k++) {
                    d += a[k] ^ b[k];
                }
                S[i][j] = S[j][i] = -d;
            }
        }
    } else {
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                S[i][j] = S[j][i] = C.dot(signal.vecs[i], signal.vecs[j]);
            }
        }
    }
    return S;
}

// Candidates in a seeded random order, then stably sorted by similarity: ties (frequent with Hamming
// distances) are broken at random rather than by file order.
function rankFor(S, q, candidates, random) {
    const order = C.shuffle(candidates, random);
    order.sort((a, b) => S[q][b] - S[q][a]);
    return order;
}

// ---------------------------------------------------------------- A, B, C

function neighbourMetrics(S, items, originals) {
    const random = C.mulberry32(11);
    const p1 = [];
    const p5 = [];
    const p10 = [];
    const ap = [];
    for (const q of originals) {
        const ranked = rankFor(
            S,
            q,
            originals.filter((j) => j !== q),
            random
        );
        const rel = ranked.map((j) => (items[j].category === items[q].category ? 1 : 0));
        const total = rel.reduce((a, b) => a + b, 0);
        p1.push(rel[0]);
        p5.push(C.mean(rel.slice(0, 5)));
        p10.push(C.mean(rel.slice(0, 10)));
        ap.push(C.averagePrecision(rel, total));
    }
    return { p1: C.mean(p1), p5: C.mean(p5), p10: C.mean(p10), map: C.mean(ap) };
}

function sortMetrics(signal, items, originals, worker) {
    // The folder's file order is unrelated to subject: shuffle with a fixed seed, start at index 0 as the app does.
    const order = C.shuffle(originals, C.mulberry32(5));
    const mediaFiles = order.map((i) => ({
        path: items[i].id,
        name: items[i].id,
    }));
    const byId = new Map(order.map((i) => [items[i].id, i]));
    const runs = {};
    if (signal.kind === 'hash') {
        const hashes = Object.fromEntries(order.map((i) => [items[i].id, signal.hashes[i]]));
        runs['hash vptree (app default)'] = worker.run({
            algorithm: 'vptree',
            mediaFiles,
            hashes,
            currentIndex: 0,
        });
        runs['hash mst'] = worker.run({
            algorithm: 'mst',
            mediaFiles,
            hashes,
            currentIndex: 0,
        });
    } else {
        const clipVectors = Object.fromEntries(order.map((i) => [items[i].id, signal.vecs[i]]));
        runs['clip sort (app)'] = worker.run({
            algorithm: 'clip',
            mediaFiles,
            clipVectors,
            currentIndex: 0,
        });
    }
    const out = {};
    for (const [name, sorted] of Object.entries(runs)) {
        let same = 0;
        for (let k = 1; k < sorted.length; k++) {
            if (items[byId.get(sorted[k])].category === items[byId.get(sorted[k - 1])].category) {
                same++;
            }
        }
        out[name] = same / (sorted.length - 1);
    }
    return out;
}

function nearDupMetrics(S, items) {
    const random = C.mulberry32(13);
    const all = items.map((_, i) => i).filter((i) => items[i].set === 'main' || items[i].set === 'variant');
    const variants = all.filter((i) => items[i].set === 'variant');
    const r1 = [];
    const ap = [];
    const byTransform = {};
    const pos = [];
    const neg = [];
    for (const q of variants) {
        const ranked = rankFor(
            S,
            q,
            all.filter((j) => j !== q),
            random
        );
        const rel = ranked.map((j) => (items[j].original === items[q].original ? 1 : 0));
        r1.push(rel[0]);
        ap.push(
            C.averagePrecision(
                rel,
                rel.reduce((a, b) => a + b, 0)
            )
        );
        (byTransform[items[q].transform] ||= []).push(rel[0]);
        for (const j of all) {
            if (j === q) {
                continue;
            }
            if (items[j].id === items[q].original) {
                pos.push(S[q][j]);
            } else if (items[j].original !== items[q].original) {
                neg.push(S[q][j]);
            }
        }
    }
    // One global threshold: how many copy-original pairs clear the level that only 1 in 1,000 unrelated pairs clears.
    const threshold = C.quantile(neg, 0.999);
    const tprAtFpr = pos.filter((s) => s > threshold).length / pos.length;
    const labels = [...pos.map(() => 1), ...neg.map(() => 0)];
    return {
        r1: C.mean(r1),
        map: C.mean(ap),
        pairAuc: C.rocAuc([...pos, ...neg], labels),
        tprAtFpr001: tprAtFpr,
        r1ByTransform: Object.fromEntries(Object.entries(byTransform).map(([t, xs]) => [t, C.mean(xs)])),
    };
}

function sortingWorker() {
    let result = null;
    let error = null;
    globalThis.self = {
        onmessage: null,
        postMessage(message) {
            if (message.type === 'complete') {
                result = message.sortedPaths;
            } else if (message.type === 'error') {
                error = message.message;
            }
        },
    };
    require(path.join(C.REPO, 'sorting-worker.js'));
    const handler = globalThis.self.onmessage;
    return {
        run(data) {
            result = null;
            error = null;
            handler({ data: { type: 'startSort', data } });
            if (error) {
                throw new Error(error);
            }
            return result;
        },
    };
}

// ---------------------------------------------------------------- D, E: learners

function standardiser(vectors) {
    const d = vectors[0].length;
    const mu = new Float64Array(d);
    const sd = new Float64Array(d);
    for (const v of vectors) {
        for (let k = 0; k < d; k++) {
            mu[k] += v[k];
        }
    }
    for (let k = 0; k < d; k++) {
        mu[k] /= vectors.length;
    }
    for (const v of vectors) {
        for (let k = 0; k < d; k++) {
            sd[k] += (v[k] - mu[k]) ** 2;
        }
    }
    for (let k = 0; k < d; k++) {
        sd[k] = Math.sqrt(sd[k] / vectors.length);
        if (sd[k] < 1e-8) {
            sd[k] = 1;
        }
    }
    return (v) => {
        const out = new Float32Array(d);
        for (let k = 0; k < d; k++) {
            out[k] = (v[k] - mu[k]) / sd[k];
        }
        return out;
    };
}

function cholesky(A) {
    const n = A.length;
    const L = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let s = A[i][j];
            for (let k = 0; k < j; k++) {
                s -= L[i][k] * L[j][k];
            }
            if (i === j) {
                L[i][i] = Math.sqrt(Math.max(s, 1e-12));
            } else {
                L[i][j] = s / L[j][j];
            }
        }
    }
    return L;
}

function choleskySolve(L, b) {
    const n = L.length;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let s = b[i];
        for (let k = 0; k < i; k++) {
            s -= L[i][k] * y[k];
        }
        y[i] = s / L[i][i];
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
        let s = y[i];
        for (let k = i + 1; k < n; k++) {
            s -= L[k][i] * x[k];
        }
        x[i] = s / L[i][i];
    }
    return x;
}

// Weighted kernel ridge regression to +1/-1 targets with a linear kernel, lambda picked by exact
// leave-one-out error over a grid. Returns the primal weight vector.
function ridgeFit(X, y, w) {
    const n = X.length;
    const d = X[0].length;
    const K = Array.from({ length: n }, (_, i) => Float64Array.from(X, (xj) => C.dot(X[i], xj)));
    let best = null;
    for (const scale of [1e-3, 1e-2, 1e-1, 1, 10]) {
        const lambda = scale * d;
        const M = K.map((row, i) => {
            const r = Float64Array.from(row);
            r[i] += lambda / w[i];
            return r;
        });
        const L = cholesky(M);
        const alpha = choleskySolve(L, y);
        let loo = 0;
        for (let i = 0; i < n; i++) {
            // h_ii = (K M^-1)_ii; M^-1 e_i by one solve per i (n <= 70, cheap).
            const e = new Float64Array(n);
            e[i] = 1;
            const col = choleskySolve(L, e);
            let hii = 0;
            let fi = 0;
            for (let j = 0; j < n; j++) {
                hii += K[i][j] * col[j];
                fi += K[i][j] * alpha[j];
            }
            const r = (y[i] - fi) / Math.max(1 - hii, 1e-9);
            loo += w[i] * r * r;
        }
        if (!best || loo < best.loo) {
            best = { loo, alpha };
        }
    }
    const coef = new Float64Array(d);
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < d; k++) {
            coef[k] += best.alpha[i] * X[i][k];
        }
    }
    return (x) => C.dot(coef, x);
}

function gaussSolve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) {
            if (Math.abs(M[r][c]) > Math.abs(M[p][c])) {
                p = r;
            }
        }
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = c + 1; r < n; r++) {
            const f = M[r][c] / M[c][c];
            for (let k = c; k <= n; k++) {
                M[r][k] -= f * M[c][k];
            }
        }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) {
        let s = M[r][n];
        for (let k = r + 1; k < n; k++) {
            s -= M[r][k] * x[k];
        }
        x[r] = s / M[r][r];
    }
    return x;
}

// L2 logistic regression on standardised features, objective 0.5|w|^2 + C * sum(log-loss) (scikit-learn's form,
// C = 1 as cReg, bias regularised as a constant feature), solved exactly: by the representer theorem w = sum(a_i x_i),
// so Newton's method runs in the n-dim dual, (I + C W K) delta = a + C g. Sample weights scale each loss term.
function logisticFit(X, y, w, cReg = 1) {
    const n = X.length;
    const K = Array.from({ length: n }, (_, i) => Float64Array.from(X, (xj) => C.dot(X[i], xj) + 1));
    let a = new Float64Array(n);
    for (let iter = 0; iter < 25; iter++) {
        const f = K.map((row) => row.reduce((s, kij, j) => s + kij * a[j], 0));
        const g = f.map((fi, i) => -y[i] * w[i] * sigmoid(-y[i] * fi));
        const W = f.map((fi, i) => {
            const p = sigmoid(fi);
            return w[i] * p * (1 - p);
        });
        const A = K.map((row, i) => Float64Array.from(row, (kij, j) => (i === j ? 1 : 0) + cReg * W[i] * kij));
        const rhs = Float64Array.from(a, (ai, i) => ai + cReg * g[i]);
        const delta = gaussSolve(A, rhs);
        let change = 0;
        a = Float64Array.from(a, (ai, i) => {
            change = Math.max(change, Math.abs(delta[i]));
            return ai - delta[i];
        });
        if (change < 1e-6) {
            break;
        }
    }
    const d = X[0].length;
    const coef = new Float64Array(d);
    let bias = 0;
    for (let i = 0; i < n; i++) {
        bias += a[i];
        for (let k = 0; k < d; k++) {
            coef[k] += a[i] * X[i][k];
        }
    }
    return (x) => C.dot(coef, x) + bias;
}

function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
}

// The app's learner exactly as ml-worker.js trainFromHistorical drives it: fresh model, likes then dislikes,
// epochs = clamp(floor(50 / n), 3, 10), deterministic shuffle seed 1. Raw (unstandardised) features.
function appLogisticFit(X, y) {
    const model = new OnlineLogisticRegression(X[0].length);
    const labels = y.map((v) => (v > 0 ? 1 : 0));
    const epochs = Math.min(10, Math.max(3, Math.floor(50 / X.length)));
    model.trainBatch(X, labels, epochs, 1);
    return (x) => model.predict(x);
}

function trainStandardisedFit(X, y) {
    const z = standardiser(X);
    const score = appLogisticFit(
        X.map((x) => z(x)),
        y
    );
    return (x) => score(z(x));
}

function unit(v) {
    return C.l2normalize(v);
}

function centroidFit(X, y) {
    const d = X[0].length;
    const pos = new Float64Array(d);
    const neg = new Float64Array(d);
    X.forEach((x, i) => {
        const u = unit(x);
        const target = y[i] > 0 ? pos : neg;
        for (let k = 0; k < d; k++) {
            target[k] += u[k];
        }
    });
    const p = unit(pos);
    const q = unit(neg);
    return (x) => {
        const u = unit(x);
        return C.dot(u, p) - C.dot(u, q);
    };
}

function knnFit(X, y, k = 3) {
    const units = X.map(unit);
    return (x) => {
        const u = unit(x);
        const sims = { pos: [], neg: [] };
        units.forEach((v, i) => (y[i] > 0 ? sims.pos : sims.neg).push(C.dot(u, v)));
        const top = (xs) => C.mean(xs.sort((a, b) => b - a).slice(0, k));
        return top(sims.pos) - top(sims.neg);
    };
}

const LEARNERS = {
    'app logistic (raw)': { fit: (X, y) => appLogisticFit(X, y), raw: true },
    // The same SGD learner, fed folder-standardised features: separates input scaling from the learner itself.
    'app logistic (standardised)': { fit: (X, y) => appLogisticFit(X, y) },
    // ...and z-scored with the training rows' own statistics, which ml-worker.js can compute without the folder.
    'app logistic (train-standardised)': { fit: (X, y) => trainStandardisedFit(X, y), raw: true },
    'ridge (standardised, LOO lambda)': { fit: (X, y, w) => ridgeFit(X, y, w) },
    'logistic (standardised, C=1)': { fit: (X, y, w) => logisticFit(X, y, w) },
    centroid: { fit: (X, y) => centroidFit(X, y) },
    'kNN-3': { fit: (X, y) => knnFit(X, y) },
};

function concat(a, b) {
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

// Feature sets for the like model: each embedding alone, and each embedding after the 64 hand-crafted
// features (the app today = f64 + clip-b32-q8).
function zscores(values) {
    const m = C.mean(values);
    const sd = Math.sqrt(C.mean(values.map((v) => (v - m) ** 2))) || 1;
    return values.map((v) => (v - m) / sd);
}

// Quality taste: liked = a Commons Quality Image, disliked = an ordinary photo of the same subjects (both CC0).
// With `aesthetic` (item index -> LAION v1 score), two extra rows: the score alone with no labels, and ridge on
// CLIP B/32 plus the score as a prior (sum of the two z-scored over the files being ranked).
function qualityExperiment(items, quality, sets, trials, aesthetic) {
    const out = [];
    const label = (i) => (items[i].qualityImage ? 1 : 0);
    const ridge = LEARNERS['ridge (standardised, LOO lambda)'];
    for (const n of [5, 10, 20]) {
        const configs = [];
        for (let t = 0; t < trials; t++) {
            const random = C.mulberry32(5000 + 100 * n + t);
            const pos = C.shuffle(
                quality.filter((i) => label(i) === 1),
                random
            ).slice(0, n);
            const neg = C.shuffle(
                quality.filter((i) => label(i) === 0),
                random
            ).slice(0, n);
            const train = new Set([...pos, ...neg]);
            const test = quality.filter((i) => !train.has(i));
            configs.push({ pos, neg, test, testLabels: test.map(label) });
        }
        for (const [setName, set] of Object.entries(sets)) {
            for (const [learnerName, learner] of Object.entries(LEARNERS)) {
                const aucs = [];
                const p10s = [];
                for (const cfg of configs) {
                    const view = learner.raw ? set.raw : set.std;
                    const X = [...cfg.pos, ...cfg.neg].map((i) => view[i]);
                    const y = [...cfg.pos.map(() => 1), ...cfg.neg.map(() => -1)];
                    const score = learner.fit(
                        X,
                        y,
                        y.map(() => 1)
                    );
                    const s = cfg.test.map((i) => score(view[i]));
                    aucs.push(C.rocAuc(s, cfg.testLabels));
                    p10s.push(precisionAt(s, cfg.testLabels, 10));
                }
                out.push({
                    n,
                    features: setName,
                    learner: learnerName,
                    auc: aucs,
                    p10: p10s,
                });
            }
        }
        if (aesthetic && sets['clip-b32-q8']) {
            const view = sets['clip-b32-q8'].std;
            const zeroShot = { auc: [], p10: [] };
            const prior = { auc: [], p10: [] };
            for (const cfg of configs) {
                const aes = cfg.test.map((i) => aesthetic.get(i));
                zeroShot.auc.push(C.rocAuc(aes, cfg.testLabels));
                zeroShot.p10.push(precisionAt(aes, cfg.testLabels, 10));
                const X = [...cfg.pos, ...cfg.neg].map((i) => view[i]);
                const y = [...cfg.pos.map(() => 1), ...cfg.neg.map(() => -1)];
                const score = ridge.fit(
                    X,
                    y,
                    y.map(() => 1)
                );
                const learned = zscores(cfg.test.map((i) => score(view[i])));
                const prior2 = zscores(aes);
                const s = learned.map((v, k) => v + prior2[k]);
                prior.auc.push(C.rocAuc(s, cfg.testLabels));
                prior.p10.push(precisionAt(s, cfg.testLabels, 10));
            }
            out.push({
                n,
                features: 'clip-b32-q8',
                learner: 'LAION aesthetic v1 head, no labels',
                ...zeroShot,
            });
            out.push({
                n,
                features: 'clip-b32-q8',
                learner: 'ridge + aesthetic prior',
                ...prior,
            });
        }
    }
    return out;
}

function featureSets(vectorSets, originals) {
    const sets = {};
    for (const [name, vecs] of Object.entries(vectorSets)) {
        sets[name] = vecs;
        if (name !== 'f64') {
            sets[`f64+${name}`] = vecs.map((v, i) => concat(vectorSets.f64[i], v));
        }
    }
    const prepared = {};
    for (const [name, vecs] of Object.entries(sets)) {
        const z = standardiser(originals.map((i) => vecs[i])); // the open folder's own statistics
        prepared[name] = { raw: vecs, std: vecs.map((v) => z(v)) };
    }
    return prepared;
}

function precisionAt(scores, labels, k) {
    const order = scores.map((s, i) => [s, labels[i]]).sort((a, b) => b[0] - a[0]);
    return C.mean(order.slice(0, k).map((p) => p[1]));
}

function preferenceExperiment(items, originals, sets, trials) {
    const categories = [...new Set(originals.map((i) => items[i].category))].sort();
    const out = [];
    for (const liked of [2, 5]) {
        for (const n of [3, 10, 30]) {
            const configs = [];
            for (let t = 0; t < trials; t++) {
                const random = C.mulberry32(1000 * liked + 100 * n + t);
                const likedSet = new Set(C.shuffle(categories, random).slice(0, liked));
                const label = (i) => (likedSet.has(items[i].category) ? 1 : 0);
                const pos = C.shuffle(
                    originals.filter((i) => label(i) === 1),
                    random
                ).slice(0, n);
                const neg = C.shuffle(
                    originals.filter((i) => label(i) === 0),
                    random
                ).slice(0, n);
                const train = new Set([...pos, ...neg]);
                const test = originals.filter((i) => !train.has(i));
                configs.push({ pos, neg, test, testLabels: test.map(label) });
            }
            for (const [setName, set] of Object.entries(sets)) {
                for (const [learnerName, learner] of Object.entries(LEARNERS)) {
                    const aucs = [];
                    const p10s = [];
                    for (const cfg of configs) {
                        const view = learner.raw ? set.raw : set.std;
                        const trainIdx = [...cfg.pos, ...cfg.neg];
                        const X = trainIdx.map((i) => view[i]);
                        const y = [...cfg.pos.map(() => 1), ...cfg.neg.map(() => -1)];
                        const score = learner.fit(
                            X,
                            y,
                            y.map(() => 1)
                        );
                        const s = cfg.test.map((i) => score(view[i]));
                        aucs.push(C.rocAuc(s, cfg.testLabels));
                        p10s.push(precisionAt(s, cfg.testLabels, 10));
                    }
                    out.push({
                        liked,
                        n,
                        features: setName,
                        learner: learnerName,
                        auc: aucs,
                        p10: p10s,
                    });
                }
            }
        }
    }
    return out;
}

function skipExperiment(items, originals, sets, trials, featureNames) {
    const categories = [...new Set(originals.map((i) => items[i].category))].sort();
    const strategies = [
        { name: 'ignore skips (app today)', weight: 0 },
        { name: 'skips as dislikes', weight: 1 },
        { name: 'skips as weak dislikes (0.3)', weight: 0.3 },
    ];
    const out = [];
    for (const setName of featureNames) {
        const set = sets[setName];
        for (const learnerName of [
            'app logistic (raw)',
            'ridge (standardised, LOO lambda)',
            'logistic (standardised, C=1)',
        ]) {
            const learner = LEARNERS[learnerName];
            const view = learner.raw ? set.raw : set.std;
            for (const strategy of strategies) {
                // missRate: the share of liked files the user passes anyway (they then count as skips).
                for (const missRate of [0, 0.2]) {
                    if (learner.raw && strategy.weight > 0 && strategy.weight < 1) {
                        continue; // the app's learner takes no sample weights
                    }
                    const found = [];
                    const aucs = [];
                    for (let t = 0; t < trials; t++) {
                        const random = C.mulberry32(77 + t);
                        // Whether the user passes a liked file is fixed per (trial, file), so every strategy,
                        // learner and feature set meets the same user.
                        const passes = (i) => C.mulberry32(9000 + 100003 * t + i)() < missRate;
                        const likedSet = new Set(C.shuffle(categories, random).slice(0, 3));
                        const label = (i) => (likedSet.has(items[i].category) ? 1 : 0);
                        const shuffled = C.shuffle(originals, random);
                        const test = shuffled.slice(0, Math.round(shuffled.length * 0.3));
                        let folder = shuffled.slice(test.length);
                        const seedPos = folder.filter((i) => label(i) === 1).slice(0, 5);
                        const seedNeg = folder.filter((i) => label(i) === 0).slice(0, 5);
                        const train = [...seedPos.map((i) => [i, 1, 1]), ...seedNeg.map((i) => [i, -1, 1])];
                        const seen = new Set([...seedPos, ...seedNeg]);
                        folder = folder.filter((i) => !seen.has(i));
                        let likes = 0;
                        let score = null;
                        for (let round = 0; round < 6; round++) {
                            score = learner.fit(
                                train.map(([i]) => view[i]),
                                train.map(([, yy]) => yy),
                                train.map(([, , ww]) => ww)
                            );
                            const ranked = folder.map((i) => [i, score(view[i])]).sort((a, b) => b[1] - a[1]);
                            const shown = ranked.slice(0, 10).map(([i]) => i);
                            for (const i of shown) {
                                if (label(i) === 1 && !passes(i)) {
                                    likes++;
                                    train.push([i, 1, 1]);
                                } else if (strategy.weight > 0) {
                                    train.push([i, -1, strategy.weight]);
                                }
                            }
                            const shownSet = new Set(shown);
                            folder = folder.filter((i) => !shownSet.has(i));
                        }
                        score = learner.fit(
                            train.map(([i]) => view[i]),
                            train.map(([, yy]) => yy),
                            train.map(([, , ww]) => ww)
                        );
                        found.push(likes);
                        aucs.push(
                            C.rocAuc(
                                test.map((i) => score(view[i])),
                                test.map(label)
                            )
                        );
                    }
                    out.push({
                        features: setName,
                        learner: learnerName,
                        strategy: strategy.name,
                        missRate,
                        likesIn60Shown: found,
                        heldOutAuc: aucs,
                    });
                }
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------- report

function ci95(xs) {
    const m = C.mean(xs);
    const sd = Math.sqrt(C.mean(xs.map((x) => (x - m) ** 2)) * (xs.length / Math.max(1, xs.length - 1)));
    return { mean: m, half: (1.96 * sd) / Math.sqrt(xs.length) };
}

function fmt(x, digits = 3) {
    return Number.isFinite(x) ? x.toFixed(digits) : 'n/a';
}

function main() {
    const [dataDir, resultsDir, trialsArg, modelsDir] = process.argv
        .slice(2)
        .map((a, i) => (i === 2 ? a : path.resolve(a)));
    const trials = Number(trialsArg || 40);
    const t0 = performance.now();
    const { items, signals, vectorSets, runs, timing } = loadSignals(dataDir, resultsDir);
    const originals = items.map((_, i) => i).filter((i) => items[i].set === 'main');
    const quality = items.map((_, i) => i).filter((i) => items[i].set === 'quality');
    const worker = sortingWorker();

    const similarity = {};
    for (const signal of signals) {
        const S = similarityMatrix(signal);
        similarity[signal.name] = {
            neighbours: neighbourMetrics(S, items, originals),
            sort: sortMetrics(signal, items, originals, worker),
            nearDup: nearDupMetrics(S, items),
        };
        console.log(`similarity: ${signal.name} done`);
    }

    // The few-shot experiments are the slow part: BENCH_SETS (comma-separated encoder keys) limits them to a subset;
    // the similarity sections always use every encoder.
    const only = process.env.BENCH_SETS ? new Set(process.env.BENCH_SETS.split(',')) : null;
    const learnSets = Object.fromEntries(
        Object.entries(vectorSets).filter(([k]) => k === 'f64' || !only || only.has(k))
    );
    const sets = featureSets(learnSets, originals);
    const preference = preferenceExperiment(items, originals, sets, trials);
    console.log('preference done');
    const skipSets = Object.keys(sets).filter((s) => s === 'f64+clip-b32-q8' || (!s.startsWith('f64') && s !== 'f64'));
    const skips = skipExperiment(items, originals, sets, trials, skipSets);
    console.log('skips done');
    // LAION aesthetic v1 over the app's own CLIP B/32 vectors, when the head was extracted under <modelsDir>.
    let aesthetic = null;
    const headDir = modelsDir && path.join(modelsDir, 'laion-aesthetic', 'extracted');
    if (headDir && fs.existsSync(headDir) && vectorSets['clip-b32-q8']) {
        const head = loadAestheticHead(headDir);
        aesthetic = new Map(quality.map((i) => [i, aestheticScore(head, vectorSets['clip-b32-q8'][i])]));
    }
    const qualityTaste = quality.length
        ? qualityExperiment(items, quality, featureSets(learnSets, quality), trials, aesthetic)
        : [];
    console.log('quality taste done');

    const metrics = {
        generatedBy: 'prototypes/ai-sorting/bench.js',
        images: {
            originals: originals.length,
            variants: items.filter((it) => it.set === 'variant').length,
            quality: quality.length,
            categories: new Set(originals.map((i) => items[i].category)).size,
        },
        trials,
        similarity,
        preference: preference.map((r) => ({
            ...r,
            aucCI: ci95(r.auc),
            p10CI: ci95(r.p10),
            auc: undefined,
            p10: undefined,
            aucPerTrial: r.auc,
        })),
        skips: skips.map((r) => ({
            ...r,
            likesCI: ci95(r.likesIn60Shown),
            aucCI: ci95(r.heldOutAuc),
        })),
        qualityTaste: qualityTaste.map((r) => ({
            ...r,
            aucCI: ci95(r.auc),
            p10CI: ci95(r.p10),
            auc: undefined,
            p10: undefined,
            aucPerTrial: r.auc,
        })),
        qualityImages: {
            qualityImages: quality.filter((i) => items[i].qualityImage).length,
            ordinary: quality.filter((i) => !items[i].qualityImage).length,
        },
        runs,
        timing,
        benchSeconds: +((performance.now() - t0) / 1000).toFixed(1),
    };
    C.writeJson(path.join(resultsDir, 'metrics.json'), metrics);

    // Markdown summary
    const lines = [];
    lines.push(
        `# Prototype metrics\n\n${metrics.images.originals} originals in ${metrics.images.categories} subjects, ${metrics.images.variants} edited copies, ${trials} trials per few-shot setting.\n`
    );
    lines.push('## A-C. Similarity\n');
    lines.push(
        '| signal | P@1 | P@10 | mAP (subject) | adjacent same-subject in app sort | near-dup R@1 | near-dup mAP | copy-pair AUC | copies found at 0.1% false pairs |'
    );
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const [name, m] of Object.entries(similarity)) {
        const sortCell = Object.entries(m.sort)
            .map(([k, v]) => `${fmt(v)} (${k})`)
            .join('; ');
        lines.push(
            `| ${name} | ${fmt(m.neighbours.p1)} | ${fmt(m.neighbours.p10)} | ${fmt(m.neighbours.map)} | ${sortCell} | ${fmt(m.nearDup.r1)} | ${fmt(m.nearDup.map)} | ${fmt(m.nearDup.pairAuc)} | ${fmt(m.nearDup.tprAtFpr001)} |`
        );
    }
    lines.push('\n### Near-duplicate R@1 by edit\n');
    const transforms = Object.keys(Object.values(similarity)[0].nearDup.r1ByTransform);
    lines.push(`| signal | ${transforms.join(' | ')} |`);
    lines.push(`|---|${transforms.map(() => '---').join('|')}|`);
    for (const [name, m] of Object.entries(similarity)) {
        lines.push(`| ${name} | ${transforms.map((t) => fmt(m.nearDup.r1ByTransform[t])).join(' | ')} |`);
    }
    lines.push('\n## D. Few-shot like model (ROC AUC on held-out originals, mean +/- 95% CI)\n');
    for (const liked of [2, 5]) {
        for (const n of [3, 10, 30]) {
            lines.push(`\n### ${liked} liked subjects of 16, ${n} likes + ${n} dislikes\n`);
            lines.push(`| features | ${Object.keys(LEARNERS).join(' | ')} |`);
            lines.push(
                `|---|${Object.keys(LEARNERS)
                    .map(() => '---')
                    .join('|')}|`
            );
            for (const setName of Object.keys(sets)) {
                const cells = Object.keys(LEARNERS).map((l) => {
                    const r = metrics.preference.find(
                        (p) => p.liked === liked && p.n === n && p.features === setName && p.learner === l
                    );
                    return `${fmt(r.aucCI.mean)} +/- ${fmt(r.aucCI.half)} (P@10 ${fmt(r.p10CI.mean, 2)})`;
                });
                lines.push(`| ${setName} | ${cells.join(' | ')} |`);
            }
        }
    }
    lines.push('\n## E. Like-or-skip simulation (3 liked subjects; 5+5 seed ratings; 6 rounds of 10 shown)\n');
    lines.push('| features | learner | skips | liked files passed | likes in 60 shown | held-out AUC |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of metrics.skips) {
        lines.push(
            `| ${r.features} | ${r.learner} | ${r.strategy} | ${r.missRate * 100}% | ${fmt(r.likesCI.mean, 1)} +/- ${fmt(r.likesCI.half, 1)} | ${fmt(r.aucCI.mean)} +/- ${fmt(r.aucCI.half)} |`
        );
    }
    if (metrics.qualityTaste.length) {
        const q = metrics.qualityImages;
        lines.push(
            `\n## E2. Quality taste (liked = Commons Quality Image; ${q.qualityImages} QI vs ${q.ordinary} ordinary, same subjects)\n`
        );
        for (const n of [5, 10, 20]) {
            lines.push(`\n### ${n} Quality Images + ${n} ordinary photos as training\n`);
            lines.push(`| features | ${Object.keys(LEARNERS).join(' | ')} |`);
            lines.push(
                `|---|${Object.keys(LEARNERS)
                    .map(() => '---')
                    .join('|')}|`
            );
            for (const setName of Object.keys(sets)) {
                const cells = Object.keys(LEARNERS).map((l) => {
                    const r = metrics.qualityTaste.find((p) => p.n === n && p.features === setName && p.learner === l);
                    return r ? `${fmt(r.aucCI.mean)} +/- ${fmt(r.aucCI.half)}` : 'n/a';
                });
                lines.push(`| ${setName} | ${cells.join(' | ')} |`);
            }
            for (const extra of ['LAION aesthetic v1 head, no labels', 'ridge + aesthetic prior']) {
                const r = metrics.qualityTaste.find((p) => p.n === n && p.learner === extra);
                if (r) {
                    lines.push(
                        `| ${extra} (clip-b32-q8) | ${fmt(r.aucCI.mean)} +/- ${fmt(r.aucCI.half)} (P@10 ${fmt(r.p10CI.mean, 2)}) |${Object.keys(
                            LEARNERS
                        )
                            .slice(1)
                            .map(() => ' |')
                            .join('')}`
                    );
                }
            }
        }
    }
    lines.push('\n## F. Speed and size\n');
    lines.push(
        'Dedicated timing runs first (one encoder at a time, fixed subset); full metric runs after (may have run in parallel, so noisier).\n'
    );
    lines.push(
        '| run | model | device | dtype | dim | images | model MB | load ms | infer median ms | infer p90 ms | decode+prep+infer median ms | peak RSS MB | JS-thread stall p99 / max ms |'
    );
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [kind, list] of [
        ['timing', timing],
        ['metric', runs],
    ]) {
        for (const r of list) {
            lines.push(
                `| ${kind} | ${r.key} | ${r.device} (${r.host.runtime}) | ${r.dtype} | ${r.dim} | ${r.n} | ${r.modelMB} | ${r.loadMs} | ${r.timing.inferMedianMs} | ${r.timing.inferP90Ms} | ${r.timing.totalMedianMs} | ${r.rssPeakMB} | ${r.eventLoopDelayMs ? `${r.eventLoopDelayMs.p99} / ${r.eventLoopDelayMs.max}` : 'n/a'} |`
            );
        }
    }
    fs.writeFileSync(path.join(resultsDir, 'metrics.md'), lines.join('\n') + '\n');
    console.log(`wrote metrics.json and metrics.md in ${metrics.benchSeconds}s`);
}

if (require.main === module) {
    main();
}

module.exports = { logisticFit, ridgeFit, appLogisticFit, centroidFit, knnFit };
