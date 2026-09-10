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
