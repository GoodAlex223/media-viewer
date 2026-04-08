import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { OnlineLogisticRegression, ML_MODEL_VERSION, DEFAULT_FEATURE_DIM } = require('../ml-model');

describe('OnlineLogisticRegression', () => {
    describe('constructor', () => {
        it('initializes with default feature dimension', () => {
            const model = new OnlineLogisticRegression();
            expect(model.featureDim).toBe(576);
            expect(model.weights.length).toBe(577); // featureDim + 1 for bias
            expect(model.totalSamples).toBe(0);
            expect(model.positiveCount).toBe(0);
            expect(model.negativeCount).toBe(0);
        });

        it('initializes with custom feature dimension', () => {
            const model = new OnlineLogisticRegression(10);
            expect(model.featureDim).toBe(10);
            expect(model.weights.length).toBe(11);
        });
    });

    describe('sigmoid', () => {
        it('returns 0.5 for z=0', () => {
            const model = new OnlineLogisticRegression();
            expect(model.sigmoid(0)).toBe(0.5);
        });

        it('clips to 1 for z > 20', () => {
            const model = new OnlineLogisticRegression();
            expect(model.sigmoid(21)).toBe(1);
            expect(model.sigmoid(100)).toBe(1);
        });

        it('clips to 0 for z < -20', () => {
            const model = new OnlineLogisticRegression();
            expect(model.sigmoid(-21)).toBe(0);
            expect(model.sigmoid(-100)).toBe(0);
        });

        it('returns values between 0 and 1 for normal inputs', () => {
            const model = new OnlineLogisticRegression();
            expect(model.sigmoid(1)).toBeGreaterThan(0.5);
            expect(model.sigmoid(1)).toBeLessThan(1);
            expect(model.sigmoid(-1)).toBeGreaterThan(0);
            expect(model.sigmoid(-1)).toBeLessThan(0.5);
        });

        it('is monotonically increasing', () => {
            const model = new OnlineLogisticRegression();
            const values = [-10, -5, -1, 0, 1, 5, 10];
            for (let i = 1; i < values.length; i++) {
                expect(model.sigmoid(values[i])).toBeGreaterThan(model.sigmoid(values[i - 1]));
            }
        });
    });

    describe('predict', () => {
        it('returns 0.5 for zero weights and zero features', () => {
            const model = new OnlineLogisticRegression(4);
            const features = [0, 0, 0, 0];
            expect(model.predict(features)).toBe(0.5);
        });

        it('handles feature vector shorter than featureDim', () => {
            const model = new OnlineLogisticRegression(4);
            const features = [0, 0]; // only 2 of 4 features
            expect(model.predict(features)).toBe(0.5);
        });

        it('returns higher probability when weights align with features', () => {
            const model = new OnlineLogisticRegression(4);
            model.weights[0] = 1.0; // positive weight for feature 0
            const features = [1, 0, 0, 0];
            expect(model.predict(features)).toBeGreaterThan(0.5);
        });
    });

    describe('predictBatch', () => {
        it('returns empty array for empty input', () => {
            const model = new OnlineLogisticRegression(4);
            expect(model.predictBatch([])).toEqual([]);
        });

        it('returns predictions for each input', () => {
            const model = new OnlineLogisticRegression(4);
            const batch = [
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ];
            const results = model.predictBatch(batch);
            expect(results).toHaveLength(2);
            expect(results[0]).toBe(0.5);
            expect(results[1]).toBe(0.5);
        });
    });

    describe('update', () => {
        it('returns pre-update prediction', () => {
            const model = new OnlineLogisticRegression(4);
            const prediction = model.update([1, 0, 0, 0], 1);
            expect(prediction).toBe(0.5); // fresh model predicts 0.5
        });

        it('increments positive count for label=1', () => {
            const model = new OnlineLogisticRegression(4);
            model.update([1, 0, 0, 0], 1);
            expect(model.positiveCount).toBe(1);
            expect(model.negativeCount).toBe(0);
            expect(model.totalSamples).toBe(1);
        });

        it('increments negative count for label=0', () => {
            const model = new OnlineLogisticRegression(4);
            model.update([1, 0, 0, 0], 0);
            expect(model.negativeCount).toBe(1);
            expect(model.positiveCount).toBe(0);
        });

        it('shifts predictions toward label=1 after positive update', () => {
            const model = new OnlineLogisticRegression(4);
            const features = [1, 0.5, 0.3, 0.1];
            model.update(features, 1);
            expect(model.predict(features)).toBeGreaterThan(0.5);
        });

        it('shifts predictions toward label=0 after negative update', () => {
            const model = new OnlineLogisticRegression(4);
            const features = [1, 0.5, 0.3, 0.1];
            model.update(features, 0);
            expect(model.predict(features)).toBeLessThan(0.5);
        });
    });

    describe('reverseUpdate', () => {
        it('approximately reverses a prior update', () => {
            const model = new OnlineLogisticRegression(4);
            const features = [1, 0.5, 0.3, 0.1];
            const beforePrediction = model.predict(features);
            model.update(features, 1);
            model.reverseUpdate(features, 1);
            const afterPrediction = model.predict(features);
            // Not exact reversal due to 1.2x LR multiplier, but should be close
            expect(Math.abs(afterPrediction - beforePrediction)).toBeLessThan(0.05);
        });

        it('floors class counts at 0', () => {
            const model = new OnlineLogisticRegression(4);
            model.reverseUpdate([1, 0, 0, 0], 1);
            expect(model.positiveCount).toBe(0);
            expect(model.totalSamples).toBe(0);
        });
    });

    describe('hasEnoughSamples', () => {
        it('returns false with no samples', () => {
            const model = new OnlineLogisticRegression(4);
            expect(model.hasEnoughSamples()).toBe(false);
        });

        it('returns false with 2 positive and 2 negative', () => {
            const model = new OnlineLogisticRegression(4);
            model.positiveCount = 2;
            model.negativeCount = 2;
            expect(model.hasEnoughSamples()).toBe(false);
        });

        it('returns true with 3 positive and 3 negative', () => {
            const model = new OnlineLogisticRegression(4);
            model.positiveCount = 3;
            model.negativeCount = 3;
            expect(model.hasEnoughSamples()).toBe(true);
        });
    });

    describe('getStats', () => {
        it('returns correct stats for fresh model', () => {
            const model = new OnlineLogisticRegression();
            const stats = model.getStats();
            expect(stats.totalSamples).toBe(0);
            expect(stats.positiveCount).toBe(0);
            expect(stats.negativeCount).toBe(0);
            expect(stats.classBalance).toBe(0);
            expect(stats.isReady).toBe(false);
            expect(stats.featureDim).toBe(576);
        });
    });

    describe('getFeatureImportance', () => {
        it('returns array of correct length', () => {
            const model = new OnlineLogisticRegression(4);
            const importance = model.getFeatureImportance();
            expect(importance).toHaveLength(4);
        });

        it('returns absolute weight values', () => {
            const model = new OnlineLogisticRegression(4);
            model.weights[0] = -0.5;
            model.weights[1] = 0.3;
            const importance = model.getFeatureImportance();
            expect(importance[0]).toBe(0.5);
            expect(importance[1]).toBeCloseTo(0.3);
        });
    });

    describe('reset', () => {
        it('restores model to initial state', () => {
            const model = new OnlineLogisticRegression(4);
            model.update([1, 0.5, 0.3, 0.1], 1);
            model.update([0.2, 0.8, 0.1, 0.9], 0);
            model.reset();
            expect(model.totalSamples).toBe(0);
            expect(model.positiveCount).toBe(0);
            expect(model.negativeCount).toBe(0);
            expect(model.predict([1, 0, 0, 0])).toBe(0.5);
        });
    });

    describe('toJSON / fromJSON', () => {
        it('round-trips correctly', () => {
            const model = new OnlineLogisticRegression();
            model.update([0.5, 0.3, 0.1, 0.9, ...new Array(572).fill(0)], 1);
            model.update([0.1, 0.8, 0.5, 0.2, ...new Array(572).fill(0)], 0);
            const json = model.toJSON();
            const restored = OnlineLogisticRegression.fromJSON(json);
            expect(restored).not.toBeNull();

            const testFeatures = [0.5, 0.3, 0.1, 0.9, ...new Array(572).fill(0)];
            expect(restored.predict(testFeatures)).toBeCloseTo(model.predict(testFeatures));
            expect(restored.totalSamples).toBe(model.totalSamples);
            expect(restored.positiveCount).toBe(model.positiveCount);
        });

        it('returns null for version mismatch', () => {
            const json = { version: 999, featureDim: 64, weights: [] };
            expect(OnlineLogisticRegression.fromJSON(json)).toBeNull();
        });

        it('returns null for dimension mismatch', () => {
            const json = { version: ML_MODEL_VERSION, featureDim: 32, weights: [] };
            expect(OnlineLogisticRegression.fromJSON(json)).toBeNull();
        });

        it('uses fallback values for missing learningRate/regularization', () => {
            const model = new OnlineLogisticRegression();
            const json = model.toJSON();
            delete json.learningRate;
            delete json.regularization;
            const restored = OnlineLogisticRegression.fromJSON(json);
            expect(restored.learningRate).toBe(0.1);
            expect(restored.regularization).toBe(0.001);
        });
    });

    describe('isCompatible', () => {
        it('returns true for compatible JSON', () => {
            expect(
                OnlineLogisticRegression.isCompatible({ version: ML_MODEL_VERSION, featureDim: DEFAULT_FEATURE_DIM })
            ).toBe(true);
        });

        it('returns falsy for null', () => {
            expect(OnlineLogisticRegression.isCompatible(null)).toBeFalsy();
        });

        it('returns false for wrong version', () => {
            expect(OnlineLogisticRegression.isCompatible({ version: 999, featureDim: DEFAULT_FEATURE_DIM })).toBe(
                false
            );
        });

        it('returns false for wrong dimension', () => {
            expect(OnlineLogisticRegression.isCompatible({ version: ML_MODEL_VERSION, featureDim: 32 })).toBe(false);
        });
    });

    describe('trainBatch', () => {
        it('does nothing with empty arrays', () => {
            const model = new OnlineLogisticRegression(4);
            model.trainBatch([], []);
            expect(model.totalSamples).toBe(0);
        });

        it('trains on all samples across epochs', () => {
            const model = new OnlineLogisticRegression(4);
            const features = [
                [1, 0, 0, 0],
                [0, 1, 0, 0],
            ];
            const labels = [1, 0];
            model.trainBatch(features, labels, 1);
            expect(model.totalSamples).toBe(2);
        });
    });
});
