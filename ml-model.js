// ML Model - Online Logistic Regression with weighted loss for class imbalance
// Used for preference prediction based on visual features
// Version 2: 64-dimensional feature vector support

const ML_MODEL_VERSION = 2;
const DEFAULT_FEATURE_DIM = 64;

/**
 * Online Logistic Regression classifier with SGD updates
 * Supports weighted loss for handling class imbalance (more dislikes than likes)
 */
class OnlineLogisticRegression {
    /**
     * @param {number} featureDim - Number of features (default: 64)
     */
    constructor(featureDim = DEFAULT_FEATURE_DIM) {
        this.featureDim = featureDim;
        this.weights = new Float32Array(featureDim + 1); // +1 for bias term
        this.learningRate = 0.1;          // Initial learning rate
        this.regularization = 0.001;       // L2 regularization strength

        // Class counts for imbalance handling
        this.positiveCount = 0;
        this.negativeCount = 0;
        this.totalSamples = 0;

        // For adaptive learning rate
        this.decayRate = 0.0001;
    }

    /**
     * Sigmoid activation function with numerical stability
     * @param {number} z - Input value
     * @returns {number} Sigmoid output (0-1)
     */
    sigmoid(z) {
        if (z > 20) return 1;
        if (z < -20) return 0;
        return 1 / (1 + Math.exp(-z));
    }

    /**
     * Predict probability for a single sample
     * @param {Float32Array|number[]} features - Feature vector
     * @returns {number} Probability of positive class (0-1)
     */
    predict(features) {
        // Linear combination: z = w·x + b
        let z = this.weights[this.featureDim]; // Bias term

        for (let i = 0; i < this.featureDim; i++) {
            z += this.weights[i] * (features[i] || 0);
        }

        return this.sigmoid(z);
    }

    /**
     * Batch predict for multiple samples
     * @param {Array<Float32Array|number[]>} featuresBatch - Array of feature vectors
     * @returns {number[]} Array of probabilities
     */
    predictBatch(featuresBatch) {
        return featuresBatch.map(f => this.predict(f));
    }

    /**
     * Update model with a single sample (online learning)
     * Uses weighted loss to handle class imbalance
     * @param {Float32Array|number[]} features - Feature vector
     * @param {number} label - True label (1 = like, 0 = dislike)
     * @returns {number} Prediction made before update
     */
    update(features, label) {
        // Update class counts
        if (label === 1) {
            this.positiveCount++;
        } else {
            this.negativeCount++;
        }
        this.totalSamples++;

        // Compute class weight for imbalance handling
        // Rare class gets higher weight
        const totalClasses = this.positiveCount + this.negativeCount;
        let sampleWeight = 1.0;

        if (totalClasses > 10) {
            // Only apply weighting after some samples accumulated
            if (label === 1 && this.positiveCount > 0) {
                // Positive (like) is rare, weight it higher
                sampleWeight = totalClasses / (2 * this.positiveCount);
            } else if (label === 0 && this.negativeCount > 0) {
                // Negative (dislike) is common, weight it lower
                sampleWeight = totalClasses / (2 * this.negativeCount);
            }
            // Cap weight to prevent extreme values
            sampleWeight = Math.min(5.0, Math.max(0.2, sampleWeight));
        }

        // Forward pass - get prediction before update
        const prediction = this.predict(features);
        const error = label - prediction;

        // Adaptive learning rate (decreases over time for convergence)
        const adaptiveLR = this.learningRate / (1 + this.totalSamples * this.decayRate);

        // Gradient descent update with L2 regularization
        for (let i = 0; i < this.featureDim; i++) {
            const featureVal = features[i] || 0;
            const gradient = sampleWeight * error * featureVal - this.regularization * this.weights[i];
            this.weights[i] += adaptiveLR * gradient;
        }

        // Bias update (no regularization on bias)
        this.weights[this.featureDim] += adaptiveLR * sampleWeight * error;

        return prediction;
    }

    /**
     * Reverse a previous update (for undo functionality)
     * Applies negative gradient to approximately reverse the effect
     * @param {Float32Array|number[]} features - Feature vector of the sample to reverse
     * @param {number} label - Original label (1 = like, 0 = dislike)
     */
    reverseUpdate(features, label) {
        // Decrement class counts
        if (label === 1) {
            this.positiveCount = Math.max(0, this.positiveCount - 1);
        } else {
            this.negativeCount = Math.max(0, this.negativeCount - 1);
        }
        this.totalSamples = Math.max(0, this.totalSamples - 1);

        // Apply reverse gradient (same logic as update but with negative error)
        const totalClasses = this.positiveCount + this.negativeCount;
        let sampleWeight = 1.0;

        if (totalClasses > 10) {
            if (label === 1 && this.positiveCount > 0) {
                sampleWeight = totalClasses / (2 * this.positiveCount);
            } else if (label === 0 && this.negativeCount > 0) {
                sampleWeight = totalClasses / (2 * this.negativeCount);
            }
            sampleWeight = Math.min(5.0, Math.max(0.2, sampleWeight));
        }

        const prediction = this.predict(features);
        // Reverse: use negative error direction
        const error = -(label - prediction);

        // Use slightly higher learning rate for reversal to ensure effect is undone
        const adaptiveLR = (this.learningRate * 1.2) / (1 + this.totalSamples * this.decayRate);

        for (let i = 0; i < this.featureDim; i++) {
            const featureVal = features[i] || 0;
            const gradient = sampleWeight * error * featureVal - this.regularization * this.weights[i];
            this.weights[i] += adaptiveLR * gradient;
        }

        this.weights[this.featureDim] += adaptiveLR * sampleWeight * error;
    }

    /**
     * Batch training for initial model fitting
     * @param {Array<Float32Array|number[]>} featuresArray - Array of feature vectors
     * @param {number[]} labelsArray - Array of labels
     * @param {number} epochs - Number of training epochs (default: 5)
     */
    trainBatch(featuresArray, labelsArray, epochs = 5) {
        if (featuresArray.length === 0) return;

        for (let epoch = 0; epoch < epochs; epoch++) {
            // Shuffle indices for SGD
            const indices = Array.from({ length: featuresArray.length }, (_, i) => i);
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            // Process samples in shuffled order
            for (const idx of indices) {
                this.update(featuresArray[idx], labelsArray[idx]);
            }
        }
    }

    /**
     * Check if model has enough samples for reliable predictions
     * @returns {boolean} True if model is ready
     */
    hasEnoughSamples() {
        // Need at least 3 of each class for meaningful predictions
        return this.positiveCount >= 3 && this.negativeCount >= 3;
    }

    /**
     * Get model statistics
     * @returns {Object} Stats object
     */
    getStats() {
        return {
            totalSamples: this.totalSamples,
            positiveCount: this.positiveCount,
            negativeCount: this.negativeCount,
            classBalance: this.positiveCount / (this.positiveCount + this.negativeCount || 1),
            isReady: this.hasEnoughSamples(),
            featureDim: this.featureDim
        };
    }

    /**
     * Get feature importance (absolute weight values)
     * @returns {number[]} Array of importance scores
     */
    getFeatureImportance() {
        const importance = [];
        for (let i = 0; i < this.featureDim; i++) {
            importance.push(Math.abs(this.weights[i]));
        }
        return importance;
    }

    /**
     * Reset model to initial state
     */
    reset() {
        this.weights = new Float32Array(this.featureDim + 1);
        this.positiveCount = 0;
        this.negativeCount = 0;
        this.totalSamples = 0;
    }

    /**
     * Export model state for persistence
     * @returns {Object} Serializable model state
     */
    toJSON() {
        return {
            version: ML_MODEL_VERSION,
            featureDim: this.featureDim,
            weights: Array.from(this.weights),
            positiveCount: this.positiveCount,
            negativeCount: this.negativeCount,
            totalSamples: this.totalSamples,
            learningRate: this.learningRate,
            regularization: this.regularization
        };
    }

    /**
     * Import model state from JSON
     * Validates version and feature dimension compatibility
     * @param {Object} json - Serialized model state
     * @returns {OnlineLogisticRegression|null} Restored model instance or null if incompatible
     */
    static fromJSON(json) {
        // Check version compatibility
        if (json.version !== ML_MODEL_VERSION) {
            console.warn(`Model version mismatch: saved=${json.version}, current=${ML_MODEL_VERSION}`);
            return null; // Incompatible version, requires retrain
        }

        // Check feature dimension compatibility
        if (json.featureDim !== DEFAULT_FEATURE_DIM) {
            console.warn(`Feature dimension mismatch: saved=${json.featureDim}, current=${DEFAULT_FEATURE_DIM}`);
            return null; // Incompatible dimensions, requires retrain
        }

        const model = new OnlineLogisticRegression(json.featureDim);
        model.weights = new Float32Array(json.weights);
        model.positiveCount = json.positiveCount;
        model.negativeCount = json.negativeCount;
        model.totalSamples = json.totalSamples;
        model.learningRate = json.learningRate || 0.1;
        model.regularization = json.regularization || 0.001;
        return model;
    }

    /**
     * Check if a saved model JSON is compatible with current version
     * @param {Object} json - Serialized model state
     * @returns {boolean} True if compatible
     */
    static isCompatible(json) {
        return json &&
               json.version === ML_MODEL_VERSION &&
               json.featureDim === DEFAULT_FEATURE_DIM;
    }
}

// Export for use in both main thread and worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OnlineLogisticRegression,
        ML_MODEL_VERSION,
        DEFAULT_FEATURE_DIM
    };
}
