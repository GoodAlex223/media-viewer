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
