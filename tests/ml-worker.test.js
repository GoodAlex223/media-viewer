import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ml-worker.js runs under importScripts('ml-model.js') in a real Worker, which puts
// ml-model.js's classes in global scope. Reproduce that: load the CJS exports and hang
// them on globalThis, then stub importScripts + self before require()-ing the worker.
// (House pattern: tests/sorting-worker.test.js stubs globalThis.self the same way.)
const {
    OnlineLogisticRegression,
    ML_MODEL_VERSION,
    DEFAULT_FEATURE_DIM,
    TRAINING_CONFIG_VERSION,
} = require('../ml-model.js');

const posted = [];
globalThis.OnlineLogisticRegression = OnlineLogisticRegression;
globalThis.ML_MODEL_VERSION = ML_MODEL_VERSION;
globalThis.DEFAULT_FEATURE_DIM = DEFAULT_FEATURE_DIM;
globalThis.TRAINING_CONFIG_VERSION = TRAINING_CONFIG_VERSION;
globalThis.importScripts = () => {};
globalThis.self = { onmessage: null, postMessage: (m) => posted.push(m) };

require('../ml-worker.js');

const send = (msg) => globalThis.self.onmessage({ data: msg });
const lastOfType = (type) => [...posted].reverse().find((m) => m.type === type);
const vec = (n, fill) => Array.from({ length: n }, () => fill);

beforeEach(() => {
    posted.length = 0;
    send({ type: 'init', data: {} });
    posted.length = 0;
});

describe('ml-worker trainHistorical (G1)', () => {
    it('resets before training, so training twice yields the same counts', () => {
        const liked = [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)];
        const disliked = [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)];

        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 7 } });
        const first = lastOfType('trainComplete').stats;

        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 7 } });
        const second = lastOfType('trainComplete').stats;

        expect(second.positiveCount).toBe(first.positiveCount);
        expect(second.negativeCount).toBe(first.negativeCount);
    });

    it('reports the real sample counts, not counts multiplied by epochs', () => {
        const liked = [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)];
        const disliked = [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)];
        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 7 } });
        const stats = lastOfType('trainComplete').stats;
        expect(stats.positiveCount).toBe(3);
        expect(stats.negativeCount).toBe(3);
    });

    it('is deterministic for a fixed seed', () => {
        const liked = [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)];
        const disliked = [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)];
        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 42 } });
        const a = lastOfType('trainComplete').modelState.weights;
        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 42 } });
        const b = lastOfType('trainComplete').modelState.weights;
        expect(b).toEqual(a);
    });

    it('honors an explicit seed of 0 instead of silently falling back to 1', () => {
        // 0 is falsy in JS. seedFromFingerprint(fingerprint) (Task 2) is defined as
        // parseInt(String(fingerprint).slice(0, 8), 16) >>> 0, whose range includes 0 — a
        // `data.seed || 1` fallback would silently retrain a fingerprint-0 seed as seed 1,
        // breaking the cache's seed-determinism guarantee for that one fingerprint.
        const liked = [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)];
        const disliked = [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)];

        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 0 } });
        const seedZeroA = lastOfType('trainComplete').modelState.weights;

        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 0 } });
        const seedZeroB = lastOfType('trainComplete').modelState.weights;

        send({ type: 'trainHistorical', data: { likedFeatures: liked, dislikedFeatures: disliked, seed: 1 } });
        const seedOne = lastOfType('trainComplete').modelState.weights;

        expect(seedZeroB).toEqual(seedZeroA);
        expect(seedOne).not.toEqual(seedZeroA);
    });
});

describe('ml-worker initComplete (G1)', () => {
    it('echoes the training config version alongside the model version', () => {
        posted.length = 0;
        send({ type: 'init', data: {} });
        const reply = lastOfType('initComplete');
        expect(reply.modelVersion).toBe(ML_MODEL_VERSION);
        expect(reply.featureDim).toBe(DEFAULT_FEATURE_DIM);
        expect(reply.trainingConfigVersion).toBe(TRAINING_CONFIG_VERSION);
    });
});

describe('online-update messages removed (G1)', () => {
    it('answers an update message with an unknown-type error', () => {
        posted.length = 0;
        send({ type: 'update', data: { features: vec(576, 0.5), label: 1 } });
        const err = lastOfType('error');
        expect(err).toBeDefined();
        expect(err.message).toContain('Unknown message type');
    });

    it('answers a reverseUpdate message with an unknown-type error', () => {
        posted.length = 0;
        send({ type: 'reverseUpdate', data: { features: vec(576, 0.5), label: 1 } });
        expect(lastOfType('error')).toBeDefined();
    });

    it('still trains, so update() survives as the trainBatch primitive', () => {
        send({
            type: 'trainHistorical',
            data: { likedFeatures: [vec(576, 0.4)], dislikedFeatures: [vec(576, -0.4)], seed: 1 },
        });
        expect(lastOfType('trainComplete')).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// G4 — the rest of the worker's message contract.
//
// G1 built this harness and pinned trainHistorical + initComplete. Everything below was
// unpinned: the four updateProgress sites, and the reply shape of every message type other
// than trainHistorical. The renderer-side consumers are tested; the worker's own output was not,
// which is how G5 changed a progress label with no direct coverage.
//
// Assertions are exact strings on purpose. These labels reach the user through the sort card and
// the plain-text notification, and the renderer routes on `type` — a rename should have to update
// the test that documents the contract, not slip through a regex.
// ---------------------------------------------------------------------------

// ≥3 likes and ≥3 dislikes: below that, model.hasEnoughSamples() is false and scoreFiles refuses.
const trained = (seed = 7) =>
    send({
        type: 'trainHistorical',
        data: {
            likedFeatures: [vec(576, 0.4), vec(576, 0.5), vec(576, 0.6)],
            dislikedFeatures: [vec(576, -0.4), vec(576, -0.5), vec(576, -0.6)],
            seed,
        },
    });

const progressOf = (msgs) => msgs.filter((m) => m.type === 'progress');

describe('ml-worker updateProgress sites (G4)', () => {
    it('trainHistorical brackets the run with a 0/N start and an N/N finish', () => {
        trained();
        const progress = progressOf(posted);
        expect(progress).toEqual([
            { type: 'progress', message: 'Training from historical data...', current: 0, total: 6 },
            { type: 'progress', message: 'Training complete', current: 6, total: 6 },
        ]);
    });

    it('emits no progress at all for an empty training set (it returns before the first site)', () => {
        send({ type: 'trainHistorical', data: { likedFeatures: [], dislikedFeatures: [] } });
        expect(progressOf(posted)).toEqual([]);
        expect(lastOfType('trainComplete').stats.totalSamples).toBe(0);
    });

    it('scoreAll opens with a 0/N tick carrying the real file count', () => {
        trained();
        posted.length = 0;
        send({ type: 'scoreAll', data: { allFeatures: { 'a.png': vec(576, 0.1), 'b.png': vec(576, 0.2) } } });
        expect(progressOf(posted)[0]).toEqual({
            type: 'progress',
            message: 'Scoring files...',
            current: 0,
            total: 2,
        });
    });

    // The in-loop site fires only every 100th file. Both consumers render current/total
    // themselves, so the message stays a bare label — embedding the counts printed them twice.
    it('scoreAll ticks every 100 files and never embeds the counts in the label', () => {
        trained();
        posted.length = 0;
        const allFeatures = {};
        for (let i = 0; i < 250; i++) allFeatures[`f${i}.png`] = vec(576, 0.1);
        send({ type: 'scoreAll', data: { allFeatures } });

        const progress = progressOf(posted);
        expect(progress.map((p) => p.current)).toEqual([0, 100, 200]);
        for (const p of progress) {
            expect(p.message).toBe('Scoring files...');
            expect(p.total).toBe(250);
        }
    });

    it('does not tick mid-loop for a run shorter than 100 files', () => {
        trained();
        posted.length = 0;
        const allFeatures = {};
        for (let i = 0; i < 99; i++) allFeatures[`f${i}.png`] = vec(576, 0.1);
        send({ type: 'scoreAll', data: { allFeatures } });
        expect(progressOf(posted).map((p) => p.current)).toEqual([0]);
    });
});

describe('ml-worker scoreComplete shapes (G4)', () => {
    it('refuses with the exact sample-count reason before the model has enough of both classes', () => {
        send({
            type: 'trainHistorical',
            data: { likedFeatures: [vec(576, 0.4), vec(576, 0.5)], dislikedFeatures: [vec(576, -0.4)] },
        });
        send({ type: 'scoreAll', data: { allFeatures: { 'a.png': vec(576, 0.1) } } });

        const reply = lastOfType('scoreComplete');
        expect(reply.scores).toBeNull();
        expect(reply.reason).toBe('Need more samples (2 likes, 1 dislikes)');
    });

    it('scores every file and reports stats once trained', () => {
        trained();
        send({ type: 'scoreAll', data: { allFeatures: { 'a.png': vec(576, 0.6), 'b.png': vec(576, -0.6) } } });

        const reply = lastOfType('scoreComplete');
        expect(Object.keys(reply.scores).sort()).toEqual(['a.png', 'b.png']);
        expect(reply.reason).toBeUndefined();
        expect(reply.stats.isReady).toBe(true);
        for (const score of Object.values(reply.scores)) {
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        }
    });

    it('gives a featureless file the neutral 0.5 rather than dropping or failing it', () => {
        trained();
        send({ type: 'scoreAll', data: { allFeatures: { 'good.png': vec(576, 0.6), 'empty.png': [] } } });

        const reply = lastOfType('scoreComplete');
        expect(reply.scores['empty.png']).toBe(0.5);
        expect(reply.scores['good.png']).not.toBe(0.5);
    });

    // `data.allFeatures || {}` in the dispatch substitutes an empty map, so a null payload takes
    // the benign path rather than throwing out of Object.keys. Pinned so the defaulting is not
    // quietly dropped — without it this becomes a type:'error' the sort path does not expect.
    it('treats a null allFeatures payload as an empty map, not an error', () => {
        trained();
        posted.length = 0;
        send({ type: 'scoreAll', data: { allFeatures: null } });
        expect(lastOfType('scoreComplete').scores).toEqual({});
        expect(lastOfType('error')).toBeUndefined();
    });
});

describe('ml-worker sortComplete shapes (G4)', () => {
    it('returns filenames highest-score-first and echoes the sortRunId', () => {
        trained();
        send({
            type: 'getSortedOrder',
            data: { allFeatures: { low: vec(576, -0.6), high: vec(576, 0.6) }, sortRunId: 42 },
        });

        const reply = lastOfType('sortComplete');
        expect(reply.sortRunId).toBe(42);
        expect(reply.sortedFilenames).toEqual(['high', 'low']);
        expect(reply.scores.high).toBeGreaterThan(reply.scores.low);
        expect(reply.stats.isReady).toBe(true);
    });

    // The renderer awaits runMlSort on this reply. A refusal must still arrive AS a sortComplete
    // or the promise never settles and both sort paths wedge behind the mutual-exclusion guard.
    it('still replies sortComplete — never type:error — when the model cannot score', () => {
        send({ type: 'reset' });
        posted.length = 0;
        send({ type: 'getSortedOrder', data: { allFeatures: { a: vec(576, 0.1) }, sortRunId: 9 } });

        const reply = lastOfType('sortComplete');
        expect(reply.sortedFilenames).toBeNull();
        expect(reply.reason).toBe('Need more samples (0 likes, 0 dislikes)');
        expect(reply.sortRunId).toBe(9);
        expect(lastOfType('error')).toBeUndefined();
    });
});

describe('ml-worker getModel / reset / unknown type (G4)', () => {
    it('getModel answers with modelState plus stats, and leaves the model alone', () => {
        trained();
        const before = lastOfType('trainComplete').stats;
        posted.length = 0;

        send({ type: 'getModel' });

        const reply = lastOfType('modelState');
        expect(reply.stats).toEqual(before);
        expect(reply.modelState.version).toBe(ML_MODEL_VERSION);
        expect(reply.modelState.featureDim).toBe(DEFAULT_FEATURE_DIM);
    });

    it('reset zeroes both class counts and returns the fresh state', () => {
        trained();
        send({ type: 'reset' });

        const reply = lastOfType('resetComplete');
        expect(reply.stats.positiveCount).toBe(0);
        expect(reply.stats.negativeCount).toBe(0);
        expect(reply.stats.isReady).toBe(false);
        expect(reply.modelState.version).toBe(ML_MODEL_VERSION);
    });

    it('answers an unknown type by naming it', () => {
        send({ type: 'nonsense' });
        expect(lastOfType('error').message).toBe('Unknown message type: nonsense');
    });

    // G4: the abort protocol is gone. It had no sender, and scoreFiles' synchronous loop could
    // not have observed a mid-run flag anyway. 'abort' is now just another stray type.
    it('answers abort with the unknown-type error, the protocol having been removed', () => {
        send({ type: 'abort' });
        expect(lastOfType('error').message).toBe('Unknown message type: abort');
    });

    it('an abort message cannot suppress a subsequent scoring run', () => {
        trained();
        send({ type: 'abort' });
        posted.length = 0;
        send({ type: 'scoreAll', data: { allFeatures: { 'a.png': vec(576, 0.6) } } });

        const reply = lastOfType('scoreComplete');
        expect(reply.scores).not.toBeNull();
        expect(reply.reason).toBeUndefined();
    });
});
