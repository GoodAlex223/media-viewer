'use strict';
// Self-test for real-folders.js. Run from the repo root:
//   node --test prototypes/ai-sorting/real-folders.selftest.js
// It sits beside the prototype, outside the app's Vitest suite, so the prototype stays deletable whole. Every fixture
// is synthetic; nothing here reads a real folder.

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const C = require('./common');
const { logisticFit, standardiser } = require('./bench');
const RF = require('./real-folders');
const { extractFeatures } = require(path.join(C.REPO, 'feature-extractor.js'));

const { FEATURE_DIM, CLIP_DIM, D } = RF;
const SCRIPT = path.join(__dirname, 'real-folders.js');
const tempDirs = [];
function tempDir(prefix = 'rf-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}
after(() => {
    for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------- synthetic vectors

function gaussian(random) {
    return Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
}
function unitVector(random, dim) {
    const v = new Float32Array(dim);
    for (let k = 0; k < dim; k++) {
        v[k] = gaussian(random);
    }
    return C.l2normalize(v);
}
function blend(a, b, weightOfB) {
    const out = new Float32Array(a.length);
    for (let k = 0; k < a.length; k++) {
        out[k] = a[k] * (1 - weightOfB) + b[k] * weightOfB;
    }
    return C.l2normalize(out);
}
function randomFeatures(random) {
    const f = new Float32Array(FEATURE_DIM);
    for (let k = 0; k < FEATURE_DIM; k++) {
        f[k] = random();
    }
    return f;
}
function combined(feature, clip) {
    const row = new Float32Array(D);
    row.set(feature, 0);
    row.set(clip, FEATURE_DIM);
    return row;
}

/** A context directly in memory, likes first. `rowOf(i, isLike, random)` builds each file's 576-dim row. */
function memoryContext(likes, dislikes, rowOf, seed = 7) {
    const random = C.mulberry32(seed);
    const make = (n, isLike) => {
        const vectors = new Float32Array(n * D);
        for (let i = 0; i < n; i++) {
            vectors.set(rowOf(i, isLike, random), i * D);
        }
        return { vectors, n, counts: { used: n } };
    };
    return RF.buildContext(make(likes, true), make(dislikes, false));
}

const QUICK = { folds: 3, repeats: 1, trials: 2, sizes: [3, 10], knnTest: 30 };

function writeCacheFolder(dir, items, version = 4) {
    fs.mkdirSync(dir, { recursive: true });
    const features = {};
    for (const item of items) {
        if (item.onDisk !== false) {
            fs.writeFileSync(path.join(dir, item.name), 'media bytes');
        }
        const stat = item.onDisk !== false ? fs.statSync(path.join(dir, item.name)) : { size: 10, mtimeMs: 1000 };
        features[item.name] = {
            vector: item.vector === undefined ? [...randomFeatures(C.mulberry32(1))] : item.vector,
            clipVector: item.clipVector === undefined ? [...new Float32Array(CLIP_DIM).fill(0.04)] : item.clipVector,
            size: item.size ?? stat.size,
            mtime: item.mtime ?? stat.mtimeMs,
        };
    }
    fs.writeFileSync(path.join(dir, '.feature_cache.json'), JSON.stringify({ version, features }));
}

// ---------------------------------------------------------------- reading a folder's cache

describe('loadTrainingFolder', () => {
    test('applies the app’s rule, counts every skip, and keeps vector before CLIP', async () => {
        const dir = tempDir();
        const feature = Array.from({ length: FEATURE_DIM }, (_, k) => k / 100);
        const clip = Array.from({ length: CLIP_DIM }, (_, k) => k / 1000);
        writeCacheFolder(dir, [
            { name: 'good.jpg', vector: feature, clipVector: clip },
            { name: 'stale-size.jpg', size: 999999 },
            { name: 'stale-mtime.jpg', mtime: 12345 },
            { name: 'pruned.jpg', onDisk: false },
            { name: 'poisoned.jpg', size: 0 },
            { name: 'short-vector.jpg', vector: [1, 2, 3] },
            { name: 'no-clip.jpg', clipVector: null },
        ]);
        fs.writeFileSync(path.join(dir, 'not-media.txt'), 'x');

        const loaded = await RF.loadTrainingFolder(dir);

        assert.deepEqual(
            { ...loaded.counts },
            {
                version: 4,
                listed: 6,
                cacheEntries: 7,
                pruned: 1,
                poisoned: 1,
                stale: 2,
                badVector: 1,
                noClip: 1,
                used: 1,
            }
        );
        assert.equal(loaded.n, 1);
        assert.ok(Math.abs(loaded.vectors[1] - 0.01) < 1e-6, 'vector half comes first');
        assert.ok(Math.abs(loaded.vectors[FEATURE_DIM + 2] - 0.002) < 1e-6, 'CLIP half follows at offset 64');
    });

    test('a cache of another version is refused, as ml-training.js refuses it (review #6)', async () => {
        const dir = tempDir();
        writeCacheFolder(dir, [{ name: 'a.jpg' }, { name: 'b.jpg' }], RF.FEATURE_CACHE_VERSION + 1);
        await assert.rejects(RF.loadTrainingFolder(dir), { code: 'CACHE_VERSION' });
        // Control: the same folder at the app's version loads.
        writeCacheFolder(dir, [{ name: 'a.jpg' }, { name: 'b.jpg' }], RF.FEATURE_CACHE_VERSION);
        assert.equal((await RF.loadTrainingFolder(dir)).n, 2);
    });

    test('the version it expects is the app’s FEATURE_CACHE_VERSION', () => {
        const source = fs.readFileSync(path.join(C.REPO, 'media-viewer.js'), 'utf8');
        const match = source.match(/static FEATURE_CACHE_VERSION = (\d+);/);
        assert.ok(match, 'the constant is still declared this way');
        assert.equal(RF.FEATURE_CACHE_VERSION, Number(match[1]));
    });
});

// ---------------------------------------------------------------- one pair, end to end

describe('measurePair (review #1)', () => {
    function smallPair(root, n = 40) {
        const random = C.mulberry32(5);
        const make = (dir) =>
            writeCacheFolder(
                dir,
                Array.from({ length: n }, (_, i) => ({ name: `f${i}.jpg`, vector: [...randomFeatures(random)] }))
            );
        const like = path.join(root, 'like');
        const dislike = path.join(root, 'dislike');
        make(like);
        make(dislike);
        return { like, dislike };
    }

    test('an evaluation that throws fails the run instead of leaving the verdict to the other contexts', async () => {
        const pair = smallPair(tempDir());
        const boom = () => {
            throw new RangeError('evaluation failed');
        };
        await assert.rejects(RF.measurePair(pair, {}, boom), RangeError);
    });

    test('a folder that cannot be read is a status, and evaluation is not attempted', async () => {
        let called = false;
        const missing = path.join(tempDir(), 'missing');
        const context = await RF.measurePair({ like: missing, dislike: missing }, {}, () => {
            called = true;
        });
        assert.equal(context.status, 'unreadable: ENOENT');
        assert.equal(called, false);
    });

    test('a context under the floor is a status, and evaluation is not attempted', async () => {
        let called = false;
        const context = await RF.measurePair(smallPair(tempDir(), 5), {}, () => {
            called = true;
        });
        assert.match(context.status, /^too small/);
        assert.equal(context.likes, 5);
        assert.equal(called, false);
    });

    test('a usable context is evaluated with the options given', async () => {
        let seen;
        const context = await RF.measurePair(smallPair(tempDir()), { folds: 3 }, (ctx, options) => {
            seen = { n: ctx.n, folds: options.folds };
            return { marker: true };
        });
        assert.deepEqual(seen, { n: 80, folds: 3 });
        assert.equal(context.status, 'measured');
        assert.deepEqual(context.result, { marker: true });
    });
});

// ---------------------------------------------------------------- the flags

describe('parseArgs (review #7)', () => {
    const base = ['--pairs', 'p.json', '--out', 'o'];
    const usage = { code: 'USAGE' };

    test('defaults, and valid values taken as integers', () => {
        assert.deepEqual(RF.parseArgs(base), { folds: 5, repeats: 2, trials: 8, pairs: 'p.json', out: 'o' });
        assert.deepEqual(RF.parseArgs([...base, '--folds', '3', '--repeats', '1', '--trials', '2']), {
            folds: 3,
            repeats: 1,
            trials: 2,
            pairs: 'p.json',
            out: 'o',
        });
    });

    test('a number that is not an integer, or below its minimum, is refused', () => {
        for (const bad of [
            ['--folds', 'abc'],
            ['--folds', '2.5'],
            ['--folds', '1'],
            ['--repeats', '0'],
            ['--trials', '1'],
            ['--trials', ''],
        ]) {
            assert.throws(() => RF.parseArgs([...base, ...bad]), usage, bad.join(' '));
        }
    });

    test('an unknown flag, a missing value, or a missing --pairs or --out is refused', () => {
        assert.throws(() => RF.parseArgs([...base, '--fold', '10']), usage);
        assert.throws(() => RF.parseArgs([...base, '--folds']), usage);
        assert.throws(() => RF.parseArgs(['--pairs', 'p.json']), usage);
        assert.throws(() => RF.parseArgs(['--out', 'o']), usage);
    });
});

// ---------------------------------------------------------------- what a scoring vector looks like

describe('the as-scored transform', () => {
    const image = () => {
        const random = C.mulberry32(3);
        const data = new Uint8ClampedArray(256 * 256 * 4);
        for (let i = 0; i < data.length; i++) {
            data[i] = i % 4 === 3 ? 255 : Math.floor(random() * 256);
        }
        return { data, width: 256, height: 256 };
    };
    // A video fills most dims, and only a PNG fills dim 46, so the two together cover every metadata dim.
    const video = {
        width: 3000,
        height: 1000,
        fileSize: 5000000,
        isVideo: true,
        format: 'mp4',
        videoInfo: { duration: 60, fps: 30, hasAudio: true, bitrate: 2000, motionAmount: 0.5 },
        faceInfo: { hasFace: true, count: 2, areaRatio: 0.3 },
    };
    const png = { width: 3000, height: 1000, fileSize: 5000000, format: 'png' };

    test('METADATA_DIMS is exactly what metadata changes in the app’s own extractFeatures', () => {
        const without = extractFeatures(image(), {});
        const differing = new Set();
        for (const metadata of [video, png]) {
            const withMetadata = extractFeatures(image(), metadata);
            for (let k = 0; k < FEATURE_DIM; k++) {
                if (withMetadata[k] !== without[k]) {
                    differing.add(k);
                }
            }
        }
        assert.deepEqual(
            [...differing].sort((a, b) => a - b),
            RF.METADATA_DIMS
        );
    });

    test('defaults are the values extractFeatures produces with no metadata', () => {
        const without = extractFeatures(image(), {});
        for (const k of RF.METADATA_DIMS) {
            assert.equal(RF.SCORING_DEFAULTS[k], without[k], `dim ${k}`);
        }
        assert.ok(Math.abs(RF.SCORING_DEFAULTS[42] - 0.2593) < 1e-3, 'a 256x256 canvas reads as aspect ratio 1');
    });

    test('buildContext replaces only those dims, and only in the scored copy', () => {
        const random = C.mulberry32(5);
        const row = combined(randomFeatures(random), unitVector(random, CLIP_DIM));
        const ctx = RF.buildContext(
            { vectors: row, n: 1, counts: { used: 1 } },
            { vectors: row.slice(), n: 1, counts: { used: 1 } }
        );
        assert.deepEqual([...ctx.labels], [1, 0]);
        for (let k = 0; k < D; k++) {
            assert.equal(ctx.trained[k], row[k], 'the trained copy is untouched');
            const expected = RF.METADATA_DIMS.includes(k) ? RF.SCORING_DEFAULTS[k] : row[k];
            assert.ok(Math.abs(ctx.scored[k] - expected) < 1e-6, `scored dim ${k}`);
        }
    });
});

// ---------------------------------------------------------------- the solver

describe('lbfgsLogistic', () => {
    test('reaches the same optimum as the report’s exact dual solver', () => {
        const random = C.mulberry32(11);
        const n = 60;
        const d = 24;
        const X = Array.from({ length: n }, (_, i) => {
            const v = new Float32Array(d);
            for (let k = 0; k < d; k++) {
                v[k] = gaussian(random) + (i < n / 2 && k < 3 ? 0.8 : 0);
            }
            return v;
        });
        const y = X.map((_, i) => (i < n / 2 ? 1 : -1));
        const z = standardiser(X);
        const Z = X.map((x) => z(x));
        const exact = logisticFit(
            Z,
            y,
            y.map(() => 1)
        );
        const M = new Float32Array(n * d);
        Z.forEach((v, i) => M.set(v, i * d));
        const fit = RF.lbfgsLogistic(M, n, d, Int8Array.from(y), { tol: 1e-6 });

        assert.equal(fit.converged, true);
        for (const v of Z) {
            let s = fit.bias;
            for (let k = 0; k < d; k++) {
                s += fit.w[k] * v[k];
            }
            assert.ok(Math.abs(s - exact(v)) < 1e-3, `score ${s} vs exact ${exact(v)}`);
        }
    });
});

// ---------------------------------------------------------------- near-duplicates and folds

describe('groupNearDuplicates', () => {
    test('joins copies and keeps the base threshold when no group is large', () => {
        const random = C.mulberry32(13);
        const n = 60;
        const M = new Float32Array(n * D);
        for (let i = 0; i < n; i++) {
            M.set(combined(randomFeatures(random), unitVector(random, CLIP_DIM)), i * D);
        }
        for (let pair = 0; pair < 5; pair++) {
            M.copyWithin((pair * 2 + 1) * D, pair * 2 * D, (pair * 2 + 1) * D);
        }
        const g = RF.groupNearDuplicates(M, n);
        assert.equal(g.threshold, 0.95);
        assert.equal(g.groups, 55);
        assert.equal(g.multiFileGroups, 5);
        assert.equal(g.filesInMultiFileGroups, 10);
        assert.equal(g.groupOf[0], g.groupOf[1]);
        assert.notEqual(g.groupOf[0], g.groupOf[2]);
    });

    test('climbs the ladder when a chain would swallow more than 5% of the files', () => {
        const random = C.mulberry32(17);
        const n = 100;
        const M = new Float32Array(n * D);
        const base = unitVector(random, CLIP_DIM);
        for (let i = 0; i < n; i++) {
            let clip;
            if (i < 30) {
                // Pairwise cosine is about 0.97-0.98: joined at 0.95 and 0.97, apart at 0.99.
                clip = new Float32Array(base);
                clip[i] += 0.12;
                clip = C.l2normalize(clip);
            } else {
                clip = unitVector(random, CLIP_DIM);
            }
            M.set(combined(randomFeatures(random), clip), i * D);
        }
        const g = RF.groupNearDuplicates(M, n);
        assert.equal(g.threshold, 0.99);
        assert.equal(g.groups, 100);
    });
});

describe('assignFolds', () => {
    const groupOf = Int32Array.from({ length: 200 }, (_, i) => Math.floor(i / 4));
    const moreLikes = Uint8Array.from({ length: 200 }, (_, i) => (i < 120 ? 1 : 0));
    const moreDislikes = moreLikes.map((v) => 1 - v);

    for (const [name, labels] of [
        ['more likes', moreLikes],
        ['more dislikes', moreDislikes],
    ]) {
        test(`${name}: never splits a group, balances each class, and follows its seed`, () => {
            const a = RF.assignFolds(groupOf, labels, 5, 1);
            const perGroup = new Map();
            a.forEach((fold, i) => {
                const seen = perGroup.get(groupOf[i]);
                assert.ok(seen === undefined || seen === fold, 'a group crossed folds');
                perGroup.set(groupOf[i], fold);
            });
            const count = (cls) => {
                const c = new Array(5).fill(0);
                a.forEach((fold, i) => {
                    if (labels[i] === cls) {
                        c[fold]++;
                    }
                });
                return c;
            };
            assert.ok(Math.max(...count(1)) - Math.min(...count(1)) <= 4, `likes ${count(1)}`);
            assert.ok(Math.max(...count(0)) - Math.min(...count(0)) <= 4, `dislikes ${count(0)}`);
            assert.deepEqual([...a], [...RF.assignFolds(groupOf, labels, 5, 1)]);
            assert.notDeepEqual([...a], [...RF.assignFolds(groupOf, labels, 5, 2)]);
        });
    }
});

// ---------------------------------------------------------------- metrics

describe('countAtEnd', () => {
    test('a tie is broken at random, not by list order', () => {
        const scores = new Array(200).fill(0.5);
        const labels = Array.from({ length: 200 }, (_, i) => (i < 100 ? 1 : 0));
        const top = RF.likesInFirst(scores, labels, 60, 1);
        assert.ok(top > 15 && top < 45, `likes come first in the list, and ties must not reward that: ${top}`);
    });
    test('counts likes first and dislikes last', () => {
        const scores = [0.9, 0.8, 0.7, 0.2, 0.1];
        const labels = [1, 1, 0, 0, 0];
        assert.equal(RF.likesInFirst(scores, labels, 2, 1), 2);
        assert.equal(RF.dislikesInLast(scores, labels, 2, 1), 2);
        assert.equal(RF.likesInFirst(scores, labels, 60, 1), 2, 'a short list is simply all of it');
    });
});

describe('pairedStats', () => {
    test('a mean, a t interval and the share won', () => {
        const s = RF.pairedStats([0.1, 0.1, 0.1, 0.1, 0.1]);
        assert.ok(Math.abs(s.mean - 0.1) < 1e-12);
        assert.ok(Math.abs(s.low - 0.1) < 1e-12);
        assert.equal(s.won, 1);
        const wide = RF.pairedStats([-0.2, 0.2, -0.2, 0.2]);
        assert.ok(wide.low < 0 && wide.high > 0);
        assert.equal(wide.won, 0.5);
    });
});

// ---------------------------------------------------------------- the whole evaluation, with planted truths

describe('evaluateContext', () => {
    test('a real signal: every learner finds it, shuffled labels sit at 0.5, and the shape is complete', () => {
        const directions = { like: null, dislike: null };
        const ctx = memoryContext(150, 150, (i, isLike, random) => {
            directions.like ??= unitVector(C.mulberry32(21), CLIP_DIM);
            directions.dislike ??= unitVector(C.mulberry32(22), CLIP_DIM);
            const clip = blend(unitVector(random, CLIP_DIM), isLike ? directions.like : directions.dislike, 0.25);
            return combined(randomFeatures(random), clip);
        });
        const r = RF.evaluateContext(ctx, QUICK);

        for (const name of ['app today', 'app + z-scoring', 'converged + z-scoring']) {
            assert.ok(r.main[name].asScored.auc.mean > 0.85, `${name}: ${r.main[name].asScored.auc.mean}`);
        }
        assert.equal(r.shuffled.ok, true, JSON.stringify(r.shuffled));
        assert.ok(r.main['converged + z-scoring'].deltaVsToday.auc.n === 3);
        assert.equal(r.main['converged + z-scoring'].fit.convergedShare, 1);
        assert.ok(r.main['app today'].asScored.first60.mean > 0);
        assert.ok(r.curve.find((row) => row.n === 10 && row.learner === 'app + z-scoring'));
        assert.ok(r.contextLearners['converged + z-scoring, CLIP only'].asScored.auc.mean > 0.85);
        assert.ok(r.knn.auc.mean > 0.7);
        assert.ok(r.plainFolds['app today'] > 0.7);
    });

    test('a planted metadata leak fools the as-trained score and not the as-scored one', () => {
        const ctx = memoryContext(120, 120, (i, isLike, random) => {
            const feature = randomFeatures(random);
            // isVideo and isAnimated move together in real files, and a sort sees neither.
            feature[45] = isLike ? 1 : 0;
            feature[47] = isLike ? 1 : 0;
            return combined(feature, unitVector(random, CLIP_DIM));
        });
        const r = RF.evaluateContext(ctx, QUICK);
        const converged = r.main['converged + z-scoring'];
        assert.ok(converged.asTrained.auc.mean > 0.9, `as trained ${converged.asTrained.auc.mean}`);
        assert.ok(Math.abs(converged.asScored.auc.mean - 0.5) < 0.12, `as scored ${converged.asScored.auc.mean}`);
    });

    test('planted copies inflate plain folds and not grouped folds', () => {
        const scenes = 40;
        const copies = 6;
        const sceneVectors = Array.from({ length: scenes }, (_, s) => {
            const random = C.mulberry32(100 + s);
            return { clip: unitVector(random, CLIP_DIM), feature: randomFeatures(random), like: s < scenes / 2 };
        });
        const rowFor = (isLike) => {
            const pool = sceneVectors.filter((s) => s.like === isLike);
            return (i, random) => {
                const scene = pool[Math.floor(i / copies) % pool.length];
                return combined(scene.feature, blend(scene.clip, unitVector(random, CLIP_DIM), 0.05));
            };
        };
        const like = rowFor(true);
        const dislike = rowFor(false);
        const ctx = memoryContext((scenes / 2) * copies, (scenes / 2) * copies, (i, isLike, random) =>
            isLike ? like(i, random) : dislike(i, random)
        );
        const r = RF.evaluateContext(ctx, QUICK);
        assert.equal(r.grouping.multiFileGroups, scenes, 'each scene is one group');
        assert.ok(r.plainFolds['converged + z-scoring'] > 0.9, `plain ${r.plainFolds['converged + z-scoring']}`);
        const grouped = r.main['converged + z-scoring'].asScored.auc.mean;
        assert.ok(grouped < 0.75, `grouped ${grouped}`);
    });
});

// ---------------------------------------------------------------- the pass mark

describe('verdict', () => {
    const ci = (mean, low, high) => ({ mean, low, high });
    const context = (zGain, convergedGain, overrides = {}) => ({
        label: 'A',
        usable: true,
        likeShare: 0.5,
        shuffledOk: true,
        candidates: {
            'app + z-scoring': { auc: ci(zGain, zGain - 0.01, zGain + 0.01), first60: ci(1, 0, 2) },
            'converged + z-scoring': {
                auc: ci(convergedGain, convergedGain - 0.01, convergedGain + 0.01),
                first60: ci(1, 0, 2),
            },
        },
        ...overrides,
    });

    test('go: every usable context passes', () => {
        assert.equal(RF.verdict([context(0.03, 0.08), context(0.02, 0.1)]).outcome, 'go');
    });
    test('go, z-scoring only: z-scoring alone is within 0.01 of the converged fit everywhere', () => {
        assert.equal(RF.verdict([context(0.05, 0.055), context(0.042, 0.05)]).outcome, 'go, z-scoring only');
    });
    test('mixed: some pass', () => {
        assert.equal(RF.verdict([context(0.05, 0.08), context(0.005, 0.01)]).outcome, 'mixed');
    });
    test('wait: none pass', () => {
        assert.equal(RF.verdict([context(0.01, 0.02), context(0.005, 0.029)]).outcome, 'wait');
    });
    test('exactly +0.03 passes, and a gain below it does not', () => {
        assert.equal(RF.verdict([context(0.0, 0.03)]).perContext[0].passes, true);
        assert.equal(RF.verdict([context(0.0, 0.0299)]).perContext[0].passes, false);
    });
    test('a CI touching zero fails, however large the mean', () => {
        const c = context(0.0, 0.2);
        c.candidates['converged + z-scoring'].auc = ci(0.2, 0, 0.4);
        assert.equal(RF.verdict([c]).perContext[0].passes, false);
    });
    test('a real drop in likes among the first 60 fails', () => {
        const c = context(0.0, 0.1);
        c.candidates['converged + z-scoring'].first60 = ci(-3, -5, -1);
        assert.equal(RF.verdict([c]).perContext[0].passes, false);
    });
    test('a noisy change in likes among the first 60 does not fail', () => {
        const c = context(0.0, 0.1);
        c.candidates['converged + z-scoring'].first60 = ci(-1, -5, 3);
        assert.equal(RF.verdict([c]).perContext[0].passes, true);
    });
    test('the first-60 clause is skipped at 90% likes and above', () => {
        const c = context(0.0, 0.1, { likeShare: 0.9 });
        c.candidates['converged + z-scoring'].first60 = ci(-3, -5, -1);
        const v = RF.verdict([c]).perContext[0];
        assert.equal(v.passes, true);
        assert.equal(v.first60Skipped, true);
    });
    test('an unusable context takes no part', () => {
        assert.equal(RF.verdict([context(0.05, 0.08), { label: 'C', usable: false }]).outcome, 'go');
        assert.equal(RF.verdict([{ label: 'C', usable: false }]).outcome, 'no verdict');
    });
    test('an unread context makes it no verdict, even when every other context passes (review round 2, #3)', () => {
        const unread = { label: 'C', usable: false, unread: true };
        const result = RF.verdict([context(0.05, 0.08), unread]);
        assert.equal(result.outcome, 'no verdict');
        assert.deepEqual(result.unread, ['C']);
        assert.equal(result.perContext.length, 1, 'the readable contexts are still judged, for the report');
        // A failed shuffled-label control still outranks it: those numbers are not used at all.
        assert.equal(RF.verdict([context(0.05, 0.08, { shuffledOk: false }), unread]).outcome, 'void');
    });
    test('verdictInput: an unreadable context is unread, and one under the floor is not', () => {
        assert.equal(RF.verdictInput({ label: 'C', status: 'unreadable: CACHE_VERSION' }).unread, true);
        assert.equal(
            RF.verdictInput({ label: 'C', status: 'too small (under 30 labels in a class)', likes: 4, dislikes: 22 })
                .unread,
            false
        );
    });
    test('void: a failed shuffled-label control outranks every number', () => {
        assert.equal(RF.verdict([context(0.05, 0.08, { shuffledOk: false })]).outcome, 'void');
    });
});

// ---------------------------------------------------------------- the command line and its privacy

describe('the command line', () => {
    const SENTINEL = 'SENTINELNAME';
    function fixtureFolders(root) {
        const random = C.mulberry32(31);
        const make = (dir, n, direction) => {
            writeCacheFolder(
                dir,
                Array.from({ length: n }, (_, i) => ({
                    name: `${SENTINEL}-${i}.jpg`,
                    vector: [...randomFeatures(random)],
                    clipVector: [...blend(unitVector(random, CLIP_DIM), direction, 0.3)],
                }))
            );
        };
        const like = path.join(root, `${SENTINEL}-like-folder`);
        const dislike = path.join(root, `${SENTINEL}-dislike-folder`);
        make(like, 40, unitVector(C.mulberry32(41), CLIP_DIM));
        make(dislike, 40, unitVector(C.mulberry32(42), CLIP_DIM));
        return { like, dislike };
    }
    function run(args) {
        return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 180000 });
    }
    const FAST = ['--folds', '3', '--repeats', '1', '--trials', '2'];

    test('no file or folder name reaches any output, and the numbers do', () => {
        const root = tempDir();
        const out = tempDir('rf-out-');
        const { like, dislike } = fixtureFolders(root);
        const pairs = path.join(root, 'pairs.json');
        fs.writeFileSync(pairs, JSON.stringify([{ like, dislike }]));
        // Control: the sentinel really is in what the script reads.
        assert.ok(fs.readFileSync(path.join(like, '.feature_cache.json'), 'utf8').includes(SENTINEL));
        assert.ok(fs.readFileSync(pairs, 'utf8').includes(SENTINEL));

        const r = run(['--pairs', pairs, '--out', out, ...FAST]);

        assert.equal(r.status, 0, r.stderr);
        assert.ok(r.stdout.includes('Context A'), 'it reports');
        assert.ok(!r.stdout.includes(SENTINEL), 'stdout');
        assert.ok(!r.stderr.includes(SENTINEL), 'stderr');
        const written = fs.readdirSync(out);
        assert.ok(written.includes('real-folders.json') && written.includes('real-folders.md'));
        for (const file of written) {
            assert.ok(!fs.readFileSync(path.join(out, file), 'utf8').includes(SENTINEL), file);
            assert.ok(!file.includes(SENTINEL), file);
        }
    });

    test('a folder that cannot be read reports its error code, never its path', () => {
        const root = tempDir();
        const out = tempDir('rf-out-');
        const missing = path.join(root, `${SENTINEL}-missing`);
        const pairs = path.join(root, 'pairs.json');
        fs.writeFileSync(pairs, JSON.stringify([{ like: missing, dislike: missing }]));

        const r = run(['--pairs', pairs, '--out', out, ...FAST]);

        assert.equal(r.status, 0, r.stderr);
        assert.ok(r.stdout.includes('ENOENT'), r.stdout);
        assert.ok(r.stdout.includes('Context A could not be read'), r.stdout);
        assert.ok(!(r.stdout + r.stderr).includes(SENTINEL));
    });

    test('an unreadable pair beside a measured one gives no verdict, and says which (review round 2, #3)', () => {
        const root = tempDir();
        const out = tempDir('rf-out-');
        const { like, dislike } = fixtureFolders(root);
        const missing = path.join(root, `${SENTINEL}-missing`);
        const pairs = path.join(root, 'pairs.json');
        fs.writeFileSync(
            pairs,
            JSON.stringify([
                { like, dislike },
                { like: missing, dislike: missing },
            ])
        );

        const r = run(['--pairs', pairs, '--out', out, ...FAST]);

        assert.equal(r.status, 0, r.stderr);
        assert.ok(r.stdout.includes('**Outcome by the pass mark: no verdict.**'), r.stdout);
        assert.ok(r.stdout.includes('Context B could not be read'), r.stdout);
        assert.ok(r.stdout.includes('## Context A'), 'the readable context is still reported');
        assert.ok(!(r.stdout + r.stderr).includes(SENTINEL));
    });

    test('a broken pairs file fails without naming anything', () => {
        const root = tempDir();
        const pairs = path.join(root, `${SENTINEL}-pairs.json`);
        fs.writeFileSync(pairs, '{ not json');
        const r = run(['--pairs', pairs, '--out', tempDir('rf-out-'), ...FAST]);
        assert.notEqual(r.status, 0);
        assert.ok(!(r.stdout + r.stderr).includes(SENTINEL), r.stderr);
    });

    test('a fatal error whose message carries a path still names nothing', () => {
        // A missing pairs file: unlike a parse error, Node's ENOENT message holds the whole path.
        const missing = path.join(tempDir(), `${SENTINEL}-pairs.json`);
        const r = run(['--pairs', missing, '--out', tempDir('rf-out-'), ...FAST]);
        assert.notEqual(r.status, 0);
        assert.ok(r.stderr.includes('ENOENT'), `it says what failed: ${r.stderr}`);
        assert.ok(!(r.stdout + r.stderr).includes(SENTINEL), r.stderr);
    });

    test('it refuses an output folder or a pairs file inside a git repository', () => {
        const outside = tempDir();
        const pairs = path.join(outside, 'pairs.json');
        fs.writeFileSync(pairs, '[]');
        const insideOut = path.join(C.REPO, 'real-folders-output-must-not-exist');
        const r1 = run(['--pairs', pairs, '--out', insideOut, ...FAST]);
        assert.notEqual(r1.status, 0);
        assert.ok(r1.stderr.includes('refused'), r1.stderr);
        assert.equal(fs.existsSync(insideOut), false);

        const tracked = path.join(C.REPO, 'package.json');
        const r2 = run(['--pairs', tracked, '--out', tempDir('rf-out-'), ...FAST]);
        assert.notEqual(r2.status, 0);
        assert.ok(r2.stderr.includes('refused'), r2.stderr);
    });

    test('a junction into a git repository does not get past the refusal (review #5)', () => {
        // A throwaway "repository" (the guard looks for a .git entry) and a junction to a folder inside it.
        const repo = tempDir('rf-repo-');
        fs.mkdirSync(path.join(repo, '.git'));
        const inner = path.join(repo, 'inner');
        fs.mkdirSync(inner);
        const link = path.join(tempDir('rf-link-'), 'link');
        fs.symlinkSync(inner, link, 'junction');
        try {
            const outside = tempDir();
            const pairs = path.join(outside, 'pairs.json');
            fs.writeFileSync(pairs, '[]');
            // Control: the junction leads where the test says it does.
            assert.equal(fs.realpathSync.native(link), fs.realpathSync.native(inner));

            const r1 = run(['--pairs', pairs, '--out', path.join(link, 'out'), ...FAST]);
            assert.notEqual(r1.status, 0);
            assert.ok(r1.stderr.includes('refused'), r1.stderr);
            assert.deepEqual(fs.readdirSync(inner), [], 'nothing was written into the repository');

            fs.writeFileSync(path.join(inner, 'pairs.json'), '[]');
            const r2 = run(['--pairs', path.join(link, 'pairs.json'), '--out', tempDir('rf-out-'), ...FAST]);
            assert.notEqual(r2.status, 0);
            assert.ok(r2.stderr.includes('refused'), r2.stderr);
        } finally {
            // Remove the junction itself before the temp folders go, so no cleanup can follow it.
            fs.unlinkSync(link);
        }
    });

    test('an unknown flag fails with the usage line, names nothing, and writes nothing (review #7)', () => {
        const out = path.join(tempDir(), 'out');
        const pairs = path.join(tempDir(), 'pairs.json');
        fs.writeFileSync(pairs, '[]');
        const r = run(['--pairs', pairs, '--out', out, `--${SENTINEL}`, '3']);
        assert.notEqual(r.status, 0);
        assert.ok(r.stderr.includes('USAGE'), r.stderr);
        assert.ok(!(r.stdout + r.stderr).includes(SENTINEL), r.stderr);
        assert.equal(fs.existsSync(out), false);
    });
});
