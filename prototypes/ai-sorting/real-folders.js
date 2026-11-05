'use strict';
// The real-data check of the like-model learner (v2 spec § 12.3, the gate on A1): does the learner fix the report
// measured on synthetic tastes also rank better on the user's own like and dislike folders?
//
//   node prototypes/ai-sorting/real-folders.js --pairs <pairs.json> --out <dir> [--folds 5] [--repeats 2] [--trials 8]
//
// <pairs.json> is [{ "like": "<folder>", "dislike": "<folder>" }, ...], one entry per context: the user chooses like
// and dislike folders per main folder, so each pair is its own taste and pairs are never pooled.
//
// PRIVACY. This repository is public, and nothing from the user's folders may enter it (spec § 15, § 19). So:
//   - this script writes and prints numbers and context letters only, never a file or folder name; an error is
//     reported by its code alone, because a Node error message carries the path;
//   - it refuses an output folder or pairs file inside any git repository;
//   - it only reads the folders.
//
// WHAT IT MEASURES, AND WHY THIS WAY.
//   - The vectors are each folder's own .feature_cache.json: what the app actually trains on, videos and JXL included.
//   - Training vectors hold real file metadata (computeFeatures); the vectors scored at sort time do not (background
//     extraction posts none). A plain cross-validation would let held-out files use signals a sort never has, so
//     held-out files get the scoring values in METADATA_DIMS. The as-trained score stays beside it as the control.
//   - Files that are near-copies share a fold: real folders hold bursts and reposts, and a copy on each side of a
//     split flatters every learner, the memorising ones most.
//   - The pass mark is verdict() below. It was fixed in the plan before any real number existed.

const fs = require('fs');
const path = require('path');

const C = require('./common');
const { appLogisticFit, trainStandardisedFit, standardiser, knnFit } = require('./bench');
const { readFeatureCacheFile, listMediaEntries } = require(path.join(C.REPO, 'feature-cache-ledger.js'));
const { isMediaFile } = require(path.join(C.REPO, 'media-formats.js'));
const { extractFeatures } = require(path.join(C.REPO, 'feature-extractor.js'));

const STREAM_JSON = {
    parser: C.repoRequire('stream-json').parser,
    pick: C.repoRequire('stream-json/filters/Pick').pick,
    streamObject: C.repoRequire('stream-json/streamers/StreamObject').streamObject,
};

const FEATURE_DIM = 64;
const CLIP_DIM = 512;
const D = FEATURE_DIM + CLIP_DIM;
const CACHE_FILE = '.feature_cache.json';

// The dims a training vector fills from file metadata and a scoring vector leaves at extractFeatures' defaults:
// 42-47 file metadata, 54-56 faces, 57-61 video. The self-test checks this list against extractFeatures itself.
const METADATA_DIMS = [42, 43, 44, 45, 46, 47, 54, 55, 56, 57, 58, 59, 60, 61];
const SCORING_DEFAULTS = extractFeatures(
    { data: new Uint8ClampedArray(256 * 256 * 4).fill(255), width: 256, height: 256 },
    {}
);

// The pass mark's constants (plan § 2, verdict() below).
const MIN_LABELS_PER_CLASS = 30;
const MIN_AUC_GAIN = 0.03;
const Z_ALONE_WITHIN = 0.01;
const FIRST_60_SKIPPED_FROM_LIKE_SHARE = 0.9;
const SHOWN = 60;

// ---------------------------------------------------------------- reading a folder

/** A folder's cached vectors, by the app's own rule (ml-training.js _loadVectorCache); nothing here keeps a name. */
async function loadTrainingFolder(dir) {
    const listed = await listMediaEntries(dir, isMediaFile);
    const current = new Map(listed.map(({ name, stats }) => [name, stats]));
    const { version, entries } = await readFeatureCacheFile(path.join(dir, CACHE_FILE), {
        access: fs.promises.access,
        createReadStream: fs.createReadStream,
        json: STREAM_JSON,
    });
    const counts = {
        version,
        listed: current.size,
        cacheEntries: entries.length,
        pruned: 0,
        poisoned: 0,
        stale: 0,
        badVector: 0,
        noClip: 0,
        used: 0,
    };
    const vectors = new Float32Array(entries.length * D);
    for (const [name, raw] of entries) {
        const file = current.get(name);
        if (!file) {
            counts.pruned++;
        } else if (!raw.size || !raw.mtime) {
            counts.poisoned++;
        } else if (raw.size !== file.size || raw.mtime !== file.mtimeMs) {
            counts.stale++;
        } else if (!raw.vector || raw.vector.length !== FEATURE_DIM) {
            counts.badVector++;
        } else if (!raw.clipVector || raw.clipVector.length !== CLIP_DIM) {
            counts.noClip++;
        } else {
            const at = counts.used * D;
            vectors.set(raw.vector, at);
            vectors.set(raw.clipVector, at + FEATURE_DIM);
            counts.used++;
        }
    }
    return { vectors: vectors.subarray(0, counts.used * D), n: counts.used, counts };
}

/** One context in memory: likes first, as ml-worker.js orders them; `scored` is what a sort would see. */
function buildContext(like, dislike) {
    const n = like.n + dislike.n;
    const trained = new Float32Array(n * D);
    trained.set(like.vectors, 0);
    trained.set(dislike.vectors, like.n * D);
    const scored = trained.slice();
    for (let i = 0; i < n; i++) {
        for (const k of METADATA_DIMS) {
            scored[i * D + k] = SCORING_DEFAULTS[k];
        }
    }
    const labels = new Uint8Array(n);
    labels.fill(1, 0, like.n);
    return { n, likes: like.n, dislikes: dislike.n, trained, scored, labels };
}

const rowOf = (matrix, i) => matrix.subarray(i * D, (i + 1) * D);
const clipOf = (matrix, i) => matrix.subarray(i * D + FEATURE_DIM, (i + 1) * D);

// ---------------------------------------------------------------- near-duplicate groups

class UnionFind {
    constructor(n) {
        this.parent = Int32Array.from({ length: n }, (_, i) => i);
        this.size = new Int32Array(n).fill(1);
        this.largest = n > 0 ? 1 : 0;
    }
    find(i) {
        let root = i;
        while (this.parent[root] !== root) {
            root = this.parent[root];
        }
        while (this.parent[i] !== root) {
            const next = this.parent[i];
            this.parent[i] = root;
            i = next;
        }
        return root;
    }
    union(a, b) {
        let ra = this.find(a);
        let rb = this.find(b);
        if (ra === rb) {
            return;
        }
        if (this.size[ra] < this.size[rb]) {
            [ra, rb] = [rb, ra];
        }
        this.parent[rb] = ra;
        this.size[ra] += this.size[rb];
        this.largest = Math.max(this.largest, this.size[ra]);
    }
}

/**
 * Groups files joined by CLIP cosine at the first threshold of 0.95, 0.97, 0.99 whose largest group holds at most 5%
 * of the files, so a chain of similar shots cannot join half a folder. Decided from group sizes alone, before any
 * learner runs. Every pair is compared: O(n^2 x 512), a few minutes at 30k files.
 */
function groupNearDuplicates(matrix, n, onProgress = () => {}) {
    const ladder = [0.95, 0.97, 0.99];
    const sets = ladder.map(() => new UnionFind(n));
    const [low, mid, high] = ladder;
    const [setLow, setMid, setHigh] = sets;
    for (let i = 0; i < n; i++) {
        const a = i * D + FEATURE_DIM;
        for (let j = i + 1; j < n; j++) {
            const b = j * D + FEATURE_DIM;
            let s = 0;
            for (let k = 0; k < CLIP_DIM; k++) {
                s += matrix[a + k] * matrix[b + k];
            }
            if (s >= low) {
                setLow.union(i, j);
                if (s >= mid) {
                    setMid.union(i, j);
                    if (s >= high) {
                        setHigh.union(i, j);
                    }
                }
            }
        }
        if (i % 2000 === 0) {
            onProgress(i);
        }
    }
    const cap = Math.max(2, Math.floor(n * 0.05));
    let chosen = ladder.findIndex((_, t) => sets[t].largest <= cap);
    const capped = chosen === -1;
    chosen = capped ? ladder.length - 1 : chosen;
    const set = sets[chosen];
    const groupOf = new Int32Array(n);
    const sizes = new Map();
    for (let i = 0; i < n; i++) {
        const root = set.find(i);
        groupOf[i] = root;
        sizes.set(root, (sizes.get(root) || 0) + 1);
    }
    const multi = [...sizes.values()].filter((s) => s > 1);
    return {
        groupOf,
        threshold: ladder[chosen],
        capped,
        groups: sizes.size,
        multiFileGroups: multi.length,
        filesInMultiFileGroups: multi.reduce((a, b) => a + b, 0),
        largestGroup: set.largest,
    };
}

/** Folds that keep each group whole and share out each class evenly: largest groups first, then the emptiest fold. */
function assignFolds(groupOf, labels, folds, seed) {
    const groups = new Map();
    groupOf.forEach((g, i) => {
        let entry = groups.get(g);
        if (!entry) {
            entry = { members: [], likes: 0, dislikes: 0 };
            groups.set(g, entry);
        }
        entry.members.push(i);
        entry[labels[i] === 1 ? 'likes' : 'dislikes']++;
    });
    const totalLikes = Math.max(
        1,
        labels.reduce((a, b) => a + b, 0)
    );
    const totalDislikes = Math.max(1, labels.length - totalLikes);
    const order = C.shuffle([...groups.values()], C.mulberry32(seed));
    order.sort((a, b) => b.members.length - a.members.length); // Array.prototype.sort is stable
    const foldLikes = new Array(folds).fill(0);
    const foldDislikes = new Array(folds).fill(0);
    const foldOf = new Int32Array(labels.length);
    for (const g of order) {
        let best = 0;
        let bestCost = Infinity;
        for (let f = 0; f < folds; f++) {
            // Only the classes this group holds: a like-only group must not avoid a fold for its dislike count.
            const cost =
                (g.likes > 0 ? (foldLikes[f] + g.likes) / totalLikes : 0) +
                (g.dislikes > 0 ? (foldDislikes[f] + g.dislikes) / totalDislikes : 0);
            if (cost < bestCost) {
                bestCost = cost;
                best = f;
            }
        }
        foldLikes[best] += g.likes;
        foldDislikes[best] += g.dislikes;
        for (const i of g.members) {
            foldOf[i] = best;
        }
    }
    return foldOf;
}

// ---------------------------------------------------------------- the converged learner

/**
 * L2 logistic regression, 0.5|w|^2 + C * sum(log-loss), with the bias regularised as a constant feature: the objective
 * of logisticFit in bench.js, whose exact dual solver takes 6 s at 500 labels. L-BFGS with a backtracking line search.
 * The objective is 1-strongly convex, so |w - w*| <= |gradient|: the stopping rule bounds the error directly.
 */
function lbfgsLogistic(M, n, d, y, { cReg = 1, memory = 10, maxIter = 2000, tol = 1e-3 } = {}) {
    const dim = d + 1;
    const evaluate = (w, g) => {
        let loss = 0;
        g.fill(0);
        for (let i = 0; i < n; i++) {
            const at = i * d;
            let s = w[d];
            for (let k = 0; k < d; k++) {
                s += w[k] * M[at + k];
            }
            const margin = y[i] * s;
            loss += margin > -30 ? Math.log1p(Math.exp(-margin)) : -margin;
            const c = (-cReg * y[i]) / (1 + Math.exp(margin));
            for (let k = 0; k < d; k++) {
                g[k] += c * M[at + k];
            }
            g[d] += c;
        }
        let reg = 0;
        for (let k = 0; k < dim; k++) {
            reg += w[k] * w[k];
            g[k] += w[k];
        }
        return 0.5 * reg + cReg * loss;
    };
    const dot = (a, b) => {
        let s = 0;
        for (let k = 0; k < dim; k++) {
            s += a[k] * b[k];
        }
        return s;
    };

    let w = new Float64Array(dim);
    let g = new Float64Array(dim);
    let f = evaluate(w, g);
    const history = [];
    let converged = false;
    let iterations = 0;
    let nextW = new Float64Array(dim);
    let nextG = new Float64Array(dim);
    const direction = new Float64Array(dim);

    for (; iterations < maxIter; iterations++) {
        if (Math.sqrt(dot(g, g)) <= tol * Math.max(1, Math.sqrt(dot(w, w)))) {
            converged = true;
            break;
        }
        // Two-loop recursion.
        direction.set(g);
        const alphas = new Array(history.length);
        for (let h = history.length - 1; h >= 0; h--) {
            alphas[h] = history[h].rho * dot(history[h].s, direction);
            for (let k = 0; k < dim; k++) {
                direction[k] -= alphas[h] * history[h].y[k];
            }
        }
        if (history.length > 0) {
            const last = history[history.length - 1];
            const scale = dot(last.s, last.y) / dot(last.y, last.y);
            for (let k = 0; k < dim; k++) {
                direction[k] *= scale;
            }
        }
        for (let h = 0; h < history.length; h++) {
            const beta = history[h].rho * dot(history[h].y, direction);
            for (let k = 0; k < dim; k++) {
                direction[k] += (alphas[h] - beta) * history[h].s[k];
            }
        }
        let slope = -dot(g, direction);
        if (slope >= 0) {
            // Not a descent direction: restart from the gradient.
            history.length = 0;
            direction.set(g);
            slope = -dot(g, g);
        }
        // Backtracking (Armijo).
        let step = history.length === 0 ? Math.min(1, 1 / Math.sqrt(dot(g, g))) : 1;
        let nextF = Infinity;
        for (let tries = 0; tries < 40; tries++) {
            for (let k = 0; k < dim; k++) {
                nextW[k] = w[k] - step * direction[k];
            }
            nextF = evaluate(nextW, nextG);
            if (nextF <= f + 1e-4 * step * slope) {
                break;
            }
            step *= 0.5;
        }
        const s = new Float64Array(dim);
        const yk = new Float64Array(dim);
        for (let k = 0; k < dim; k++) {
            s[k] = nextW[k] - w[k];
            yk[k] = nextG[k] - g[k];
        }
        const curvature = dot(s, yk);
        if (curvature > 1e-10 * dot(yk, yk)) {
            history.push({ s, y: yk, rho: 1 / curvature });
            if (history.length > memory) {
                history.shift();
            }
        }
        if (!(nextF < f)) {
            // The line search found no descent: float precision has run out, so stop here and let the gradient say.
            converged = Math.sqrt(dot(g, g)) <= tol * Math.max(1, Math.sqrt(dot(w, w)));
            break;
        }
        [w, nextW] = [nextW, w];
        [g, nextG] = [nextG, g];
        f = nextF;
    }
    return { w: w.subarray(0, d), bias: w[d], iterations, converged };
}

function convergedFit(X, y) {
    const z = standardiser(X);
    const d = X[0].length;
    const n = X.length;
    const M = new Float32Array(n * d);
    X.forEach((x, i) => M.set(z(x), i * d));
    const fit = lbfgsLogistic(M, n, d, Int8Array.from(y));
    const score = (x) => {
        const v = z(x);
        let s = fit.bias;
        for (let k = 0; k < d; k++) {
            s += fit.w[k] * v[k];
        }
        return s;
    };
    score.solver = { iterations: fit.iterations, converged: fit.converged };
    return score;
}

// ---------------------------------------------------------------- metrics

function pairedStats(values) {
    const xs = values.filter((v) => Number.isFinite(v));
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const halfWidth = tCritical(n - 1) * Math.sqrt(variance / n);
    return {
        mean,
        low: mean - halfWidth,
        high: mean + halfWidth,
        won: xs.filter((v) => v > 0).length / n,
        n,
    };
}

function tCritical(df) {
    const table = {
        1: 12.706,
        2: 4.303,
        3: 3.182,
        4: 2.776,
        5: 2.571,
        6: 2.447,
        7: 2.365,
        8: 2.306,
        9: 2.262,
        10: 2.228,
    };
    if (df <= 10) {
        return table[df] ?? Infinity;
    }
    return df <= 20 ? 2.145 : df <= 30 ? 2.06 : 1.96;
}

/** Positions sorted best first, ties in a seeded random order: a list holds likes first, and a tie must not reward it. */
function rankOrder(scores, seed) {
    const order = C.shuffle(
        Array.from(scores, (_, i) => i),
        C.mulberry32(seed)
    );
    return order.sort((a, b) => scores[b] - scores[a]);
}
function likesInFirst(scores, labels, shown, seed) {
    return rankOrder(scores, seed)
        .slice(0, shown)
        .reduce((sum, i) => sum + labels[i], 0);
}
function dislikesInLast(scores, labels, shown, seed) {
    const order = rankOrder(scores, seed);
    return order.slice(Math.max(0, order.length - shown)).reduce((sum, i) => sum + (labels[i] === 0 ? 1 : 0), 0);
}

// ---------------------------------------------------------------- the evaluation

// What A1 would compare, on the full 576-dim vectors: today, step 1, step 2.
const MAIN_LEARNERS = {
    'app today': { fit: (X, y) => appLogisticFit(X, y) },
    'app + z-scoring': { fit: (X, y) => trainStandardisedFit(X, y) },
    'converged + z-scoring': { fit: (X, y) => convergedFit(X, y) },
};
// Context only; none takes part in the pass mark.
const CONTEXT_LEARNERS = {
    // The other way to close the training/scoring mismatch (spec § 12.3, "check first").
    'converged + z-scoring, metadata left out of training': { fit: (X, y) => convergedFit(X, y), trainOn: 'scored' },
    'app today, CLIP only': { fit: (X, y) => appLogisticFit(X, y), clipOnly: true },
    'converged + z-scoring, CLIP only': { fit: (X, y) => convergedFit(X, y), clipOnly: true },
};

function trainTest(labels, foldOf, fold) {
    const train = [];
    const test = [];
    for (let i = 0; i < labels.length; i++) {
        (foldOf[i] === fold ? test : train).push(i);
    }
    // Likes first, as ml-worker.js trainFromHistorical orders them.
    train.sort((a, b) => labels[b] - labels[a] || a - b);
    return { train, test };
}

function runLearner(ctx, labels, train, test, learner, seed) {
    const view = learner.clipOnly ? clipOf : rowOf;
    const trainMatrix = learner.trainOn === 'scored' ? ctx.scored : ctx.trained;
    const X = train.map((i) => view(trainMatrix, i));
    const y = train.map((i) => (labels[i] === 1 ? 1 : -1));
    const t0 = performance.now();
    const score = learner.fit(X, y);
    const fitMs = performance.now() - t0;
    const testLabels = test.map((i) => labels[i]);
    const scoredScores = test.map((i) => score(view(ctx.scored, i)));
    const trainedScores = learner.clipOnly ? scoredScores : test.map((i) => score(view(ctx.trained, i)));
    return {
        fitMs,
        solver: score.solver,
        auc: C.rocAuc(scoredScores, testLabels),
        aucAsTrained: C.rocAuc(trainedScores, testLabels),
        first60: likesInFirst(scoredScores, testLabels, SHOWN, seed),
        last60: dislikesInLast(scoredScores, testLabels, SHOWN, seed),
    };
}

function summarise(perFold, baseline) {
    const take = (key) => perFold.map((r) => r[key]);
    const out = {
        asScored: {
            auc: pairedStats(take('auc')),
            first60: pairedStats(take('first60')),
            last60: pairedStats(take('last60')),
        },
        asTrained: { auc: pairedStats(take('aucAsTrained')) },
        fit: { meanMs: Math.round(C.mean(take('fitMs'))) },
    };
    const solved = perFold.map((r) => r.solver).filter(Boolean);
    if (solved.length > 0) {
        out.fit.meanIterations = Math.round(C.mean(solved.map((s) => s.iterations)));
        out.fit.convergedShare = solved.filter((s) => s.converged).length / solved.length;
    }
    if (baseline) {
        const delta = (key) => perFold.map((r, i) => r[key] - baseline[i][key]);
        out.deltaVsToday = {
            auc: pairedStats(delta('auc')),
            first60: pairedStats(delta('first60')),
            last60: pairedStats(delta('last60')),
        };
    }
    return out;
}

/** One context, end to end. Everything returned is a number or a learner's name. */
function evaluateContext(ctx, options = {}) {
    const {
        folds = 5,
        repeats = 2,
        trials = 8,
        sizes = [3, 10, 30, 100, 300],
        seed = 1,
        knnTest = 500,
        log = () => {},
    } = options;
    const { labels } = ctx;

    log(`  grouping near-duplicates among ${ctx.n} files`);
    const grouping = groupNearDuplicates(ctx.trained, ctx.n, (i) => log(`    ${i}/${ctx.n}`));
    const mixed = new Map();
    grouping.groupOf.forEach((g, i) => {
        const entry = mixed.get(g) || { likes: 0, dislikes: 0 };
        entry[labels[i] === 1 ? 'likes' : 'dislikes']++;
        mixed.set(g, entry);
    });
    const mixedLabelGroups = [...mixed.values()].filter((e) => e.likes > 0 && e.dislikes > 0).length;
    const { groupOf, ...groupStats } = grouping;

    const foldSets = Array.from({ length: repeats }, (_, r) => assignFolds(groupOf, labels, folds, seed + r));

    // Main and context learners, paired fold by fold.
    const raw = {};
    const allLearners = { ...MAIN_LEARNERS, ...CONTEXT_LEARNERS };
    for (const name of Object.keys(allLearners)) {
        raw[name] = [];
    }
    foldSets.forEach((foldOf, r) => {
        for (let f = 0; f < folds; f++) {
            const { train, test } = trainTest(labels, foldOf, f);
            for (const [name, learner] of Object.entries(allLearners)) {
                raw[name].push(runLearner(ctx, labels, train, test, learner, seed + 1000 * r + f));
            }
            log(`  repeat ${r + 1}/${repeats} fold ${f + 1}/${folds} done`);
        }
    });
    const main = {};
    for (const name of Object.keys(MAIN_LEARNERS)) {
        main[name] = summarise(raw[name], name === 'app today' ? null : raw['app today']);
    }
    const contextLearners = {};
    for (const name of Object.keys(CONTEXT_LEARNERS)) {
        contextLearners[name] = summarise(raw[name], raw['app today']);
    }

    // The learning curve: n likes + n dislikes from the training part, ranked on the held-out fold.
    const curve = [];
    for (const n of sizes) {
        const perLearner = Object.fromEntries(Object.keys(MAIN_LEARNERS).map((name) => [name, []]));
        for (let t = 0; t < trials; t++) {
            const fold = t % folds;
            const { train, test } = trainTest(labels, foldSets[0], fold);
            const random = C.mulberry32(seed + 7000 + 100 * n + t);
            const pool = (cls) =>
                C.shuffle(
                    train.filter((i) => labels[i] === cls),
                    random
                ).slice(0, n);
            const likes = pool(1);
            const dislikes = pool(0);
            if (likes.length < n || dislikes.length < n) {
                continue;
            }
            for (const [name, learner] of Object.entries(MAIN_LEARNERS)) {
                perLearner[name].push(runLearner(ctx, labels, [...likes, ...dislikes], test, learner, seed + t));
            }
        }
        if (perLearner['app today'].length === 0) {
            continue;
        }
        for (const name of Object.keys(MAIN_LEARNERS)) {
            const aucs = perLearner[name].map((r) => r.auc);
            const row = { n, learner: name, auc: pairedStats(aucs) };
            if (name !== 'app today') {
                row.deltaVsToday = pairedStats(aucs.map((a, i) => a - perLearner['app today'][i].auc));
            }
            curve.push(row);
        }
        log(`  curve at ${n} per side done`);
    }

    // Control: labels shuffled across files must leave nothing to learn.
    const shuffledLabels = Uint8Array.from(C.shuffle([...labels], C.mulberry32(seed + 31)));
    const shuffledFolds = assignFolds(groupOf, shuffledLabels, folds, seed + 41);
    const shuffledRows = {};
    for (const [name, learner] of Object.entries(MAIN_LEARNERS)) {
        const aucs = [];
        for (let f = 0; f < folds; f++) {
            const { train, test } = trainTest(shuffledLabels, shuffledFolds, f);
            aucs.push(runLearner(ctx, shuffledLabels, train, test, learner, seed + f).auc);
        }
        shuffledRows[name] = C.mean(aucs);
    }
    const se = Math.sqrt((ctx.likes + ctx.dislikes + 1) / (12 * ctx.likes * ctx.dislikes));
    const tolerance = Math.max(0.01, 3 * se);
    const shuffled = {
        tolerance,
        rows: shuffledRows,
        ok: Object.values(shuffledRows).every((auc) => Math.abs(auc - 0.5) <= tolerance),
    };
    log('  shuffled-label control done');

    // Control: plain folds, near-copies free to straddle them. The gap to the grouped score is what grouping guards.
    const singletons = Int32Array.from({ length: ctx.n }, (_, i) => i);
    const plainOf = assignFolds(singletons, labels, folds, seed + 51);
    const plainFolds = {};
    for (const name of ['app today', 'converged + z-scoring']) {
        const aucs = [];
        for (let f = 0; f < folds; f++) {
            const { train, test } = trainTest(labels, plainOf, f);
            aucs.push(runLearner(ctx, labels, train, test, MAIN_LEARNERS[name], seed + f).auc);
        }
        plainFolds[name] = C.mean(aucs);
    }
    log('  plain-fold control done');

    // kNN-3 on CLIP, the report's best from 10+10 labels. Context only, on a held-out sample: it is O(train) per query.
    const knnAucs = [];
    for (let f = 0; f < folds; f++) {
        const { train, test } = trainTest(labels, foldSets[0], f);
        const sample = C.shuffle(test, C.mulberry32(seed + 61 + f)).slice(0, knnTest);
        const score = knnFit(
            train.map((i) => clipOf(ctx.trained, i)),
            train.map((i) => (labels[i] === 1 ? 1 : -1))
        );
        const auc = C.rocAuc(
            sample.map((i) => score(clipOf(ctx.trained, i))),
            sample.map((i) => labels[i])
        );
        knnAucs.push(auc);
    }
    log('  kNN done');

    return {
        grouping: { ...groupStats, mixedLabelGroups },
        main,
        contextLearners,
        curve,
        shuffled,
        plainFolds,
        knn: { auc: pairedStats(knnAucs), sampleSize: knnTest },
    };
}

// ---------------------------------------------------------------- the pass mark

/**
 * Fixed before any real number existed (plan § 2). Each context: { label, usable, likeShare, shuffledOk, candidates:
 * { 'app + z-scoring': { auc: {mean,low,high}, first60: {mean,low,high} }, 'converged + z-scoring': {...} } }.
 */
function verdict(contexts) {
    const usable = contexts.filter((c) => c.usable);
    if (usable.length === 0) {
        return { outcome: 'no verdict', perContext: [] };
    }
    const perContext = usable.map((c) => {
        const names = Object.keys(c.candidates);
        const best = names.reduce((a, b) => (c.candidates[b].auc.mean > c.candidates[a].auc.mean ? b : a));
        const { auc, first60 } = c.candidates[best];
        const first60Skipped = c.likeShare >= FIRST_60_SKIPPED_FROM_LIKE_SHARE;
        const gainMet = auc.mean >= MIN_AUC_GAIN;
        const ciAboveZero = auc.low > 0;
        const first60Held = first60Skipped || first60.high >= 0;
        const zGain = c.candidates['app + z-scoring'].auc.mean;
        const convergedGain = c.candidates['converged + z-scoring'].auc.mean;
        return {
            label: c.label,
            best,
            gain: auc.mean,
            gainMet,
            ciAboveZero,
            first60Held,
            first60Skipped,
            passes: gainMet && ciAboveZero && first60Held,
            zAloneEnough: convergedGain - zGain <= Z_ALONE_WITHIN,
        };
    });
    let outcome;
    if (usable.some((c) => !c.shuffledOk)) {
        outcome = 'void';
    } else if (perContext.every((c) => c.passes)) {
        outcome = perContext.every((c) => c.zAloneEnough) ? 'go, z-scoring only' : 'go';
    } else if (perContext.some((c) => c.passes)) {
        outcome = 'mixed';
    } else {
        outcome = 'wait';
    }
    return { outcome, perContext };
}

function verdictInput(context) {
    if (!context.result) {
        return { label: context.label, usable: false };
    }
    const take = (name) => ({
        auc: context.result.main[name].deltaVsToday.auc,
        first60: context.result.main[name].deltaVsToday.first60,
    });
    return {
        label: context.label,
        usable: true,
        likeShare: context.likes / (context.likes + context.dislikes),
        shuffledOk: context.result.shuffled.ok,
        candidates: {
            'app + z-scoring': take('app + z-scoring'),
            'converged + z-scoring': take('converged + z-scoring'),
        },
    };
}

// ---------------------------------------------------------------- the report

const fixed = (x, digits = 3) => (Number.isFinite(x) ? x.toFixed(digits) : 'n/a');
const signed = (x, digits = 3) => (x >= 0 ? '+' : '') + fixed(x, digits);
const interval = (s, digits = 3) => `${signed(s.mean, digits)} (${signed(s.low, digits)} to ${signed(s.high, digits)})`;

function renderMarkdown(contexts, outcome) {
    const lines = ['# Real-folder check of the like-model learner', ''];
    lines.push(`**Outcome by the pass mark: ${outcome.outcome}.**`, '');
    lines.push('| context | likes | dislikes | status | best candidate | AUC gain | passes |');
    lines.push('|---|---:|---:|---|---|---:|---|');
    for (const c of contexts) {
        const v = outcome.perContext.find((p) => p.label === c.label);
        lines.push(
            `| ${c.label} | ${c.likes ?? 'n/a'} | ${c.dislikes ?? 'n/a'} | ${c.status} | ${v ? v.best : ''} | ${v ? signed(v.gain) : ''} | ${v ? (v.passes ? 'yes' : 'no') : ''} |`
        );
    }
    for (const c of contexts) {
        lines.push('', `## Context ${c.label}`, '');
        lines.push(`Status: ${c.status}.`);
        if (c.counts) {
            lines.push(
                `Cache filter, likes: ${JSON.stringify(c.counts.like)}. Dislikes: ${JSON.stringify(c.counts.dislike)}.`
            );
        }
        if (!c.result) {
            continue;
        }
        const r = c.result;
        const g = r.grouping;
        lines.push(
            '',
            `Near-duplicate groups at cosine ${g.threshold}${g.capped ? ' (ladder exhausted)' : ''}: ${g.groups} groups, ${g.multiFileGroups} with copies, ${g.filesInMultiFileGroups} files in them, the largest ${g.largestGroup}, ${g.mixedLabelGroups} holding both a like and a dislike.`
        );
        lines.push(
            '',
            'Held-out ROC AUC, all labels, near-copies in one fold (mean of the folds; gain against app today with its paired 95% CI). "As scored" is the primary number: held-out files as a sort sees them.',
            '',
            '| learner | as scored | gain | share of folds won | as trained | likes in first 60 | change | dislikes in last 60 | fit ms | solver iterations |',
            '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
        );
        const row = (name, s) => {
            const d = s.deltaVsToday;
            lines.push(
                `| ${name} | ${fixed(s.asScored.auc.mean)} | ${d ? interval(d.auc) : ''} | ${d ? `${Math.round(d.auc.won * 100)}%` : ''} | ${fixed(s.asTrained.auc.mean)} | ${fixed(s.asScored.first60.mean, 1)} | ${d ? interval(d.first60, 1) : ''} | ${fixed(s.asScored.last60.mean, 1)} | ${s.fit.meanMs} | ${s.fit.meanIterations ?? ''} |`
            );
        };
        for (const [name, s] of Object.entries(r.main)) {
            row(name, s);
        }
        for (const [name, s] of Object.entries(r.contextLearners)) {
            row(`*${name}*`, s);
        }
        lines.push(
            '',
            `kNN-3 on CLIP, ${r.knn.sampleSize} held-out files per fold (context only): AUC ${fixed(r.knn.auc.mean)}.`,
            `Plain folds, copies free to straddle them: app today ${fixed(r.plainFolds['app today'])}, converged + z-scoring ${fixed(r.plainFolds['converged + z-scoring'])}.`,
            `Shuffled labels (control, must land within ${fixed(r.shuffled.tolerance)} of 0.5): ${Object.entries(
                r.shuffled.rows
            )
                .map(([name, auc]) => `${name} ${fixed(auc)}`)
                .join(', ')}: ${r.shuffled.ok ? 'passed' : 'FAILED'}.`
        );
        if (r.curve.length > 0) {
            lines.push('', 'Learning curve: n likes + n dislikes, AUC as scored, and the gain against app today.', '');
            lines.push('| n per side | app today | app + z-scoring | gain | converged + z-scoring | gain |');
            lines.push('|---:|---:|---:|---:|---:|---:|');
            for (const n of [...new Set(r.curve.map((x) => x.n))]) {
                const at = (name) => r.curve.find((x) => x.n === n && x.learner === name);
                const z = at('app + z-scoring');
                const conv = at('converged + z-scoring');
                lines.push(
                    `| ${n} | ${fixed(at('app today').auc.mean)} | ${fixed(z.auc.mean)} | ${interval(z.deltaVsToday)} | ${fixed(conv.auc.mean)} | ${interval(conv.deltaVsToday)} |`
                );
            }
        }
    }
    return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- the command line

function insideGitRepo(target) {
    let dir = path.resolve(target);
    for (;;) {
        if (fs.existsSync(path.join(dir, '.git'))) {
            return true;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return false;
        }
        dir = parent;
    }
}

function parseArgs(argv) {
    const args = { folds: 5, repeats: 2, trials: 8 };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        args[key] = ['folds', 'repeats', 'trials'].includes(key) ? Number(argv[i + 1]) : argv[i + 1];
    }
    return args;
}

async function main(argv) {
    const args = parseArgs(argv);
    if (!args.pairs || !args.out) {
        throw Object.assign(new Error('usage'), { code: 'USAGE' });
    }
    if (insideGitRepo(args.out) || insideGitRepo(args.pairs)) {
        console.error('refused: the output folder and the pairs file must be outside any git repository');
        process.exitCode = 2;
        return;
    }
    const pairs = C.readJson(args.pairs);
    fs.mkdirSync(args.out, { recursive: true });
    const log = (message) => console.log(message);
    const contexts = [];
    for (let p = 0; p < pairs.length; p++) {
        log(`pair ${p + 1}/${pairs.length}`);
        const context = { status: 'measured' };
        try {
            const like = await loadTrainingFolder(pairs[p].like);
            const dislike = await loadTrainingFolder(pairs[p].dislike);
            context.likes = like.n;
            context.dislikes = dislike.n;
            context.counts = { like: like.counts, dislike: dislike.counts };
            log(`  ${like.n} likes, ${dislike.n} dislikes after the cache filter`);
            if (Math.min(like.n, dislike.n) < MIN_LABELS_PER_CLASS) {
                context.status = `too small (under ${MIN_LABELS_PER_CLASS} labels in a class)`;
            } else {
                context.result = evaluateContext(buildContext(like, dislike), {
                    folds: args.folds,
                    repeats: args.repeats,
                    trials: args.trials,
                    log,
                });
            }
        } catch (error) {
            // The code alone: a Node error's message carries the path.
            context.status = `unreadable: ${error.code || error.name}`;
        }
        contexts.push(context);
        // Saved after every context, so a stopped run keeps what it measured. No letters yet: those follow size.
        C.writeJson(path.join(args.out, 'real-folders.partial.json'), contexts);
    }
    contexts.sort((a, b) => (b.likes || 0) + (b.dislikes || 0) - ((a.likes || 0) + (a.dislikes || 0)));
    contexts.forEach((c, i) => {
        c.label = String.fromCharCode(65 + i);
    });
    const outcome = verdict(contexts.map(verdictInput));
    C.writeJson(path.join(args.out, 'real-folders.json'), { generatedBy: 'real-folders.js', outcome, contexts });
    const markdown = renderMarkdown(contexts, outcome);
    fs.writeFileSync(path.join(args.out, 'real-folders.md'), markdown);
    fs.rmSync(path.join(args.out, 'real-folders.partial.json'), { force: true });
    console.log(markdown);
}

if (require.main === module) {
    main(process.argv.slice(2)).catch((error) => {
        // The code alone: a Node error's message carries the path, and this output may be pasted anywhere.
        console.error(`failed: ${error.code || error.name}`);
        process.exitCode = 1;
    });
}

module.exports = {
    FEATURE_DIM,
    CLIP_DIM,
    D,
    METADATA_DIMS,
    SCORING_DEFAULTS,
    loadTrainingFolder,
    buildContext,
    groupNearDuplicates,
    assignFolds,
    lbfgsLogistic,
    likesInFirst,
    dislikesInLast,
    pairedStats,
    evaluateContext,
    verdict,
};
