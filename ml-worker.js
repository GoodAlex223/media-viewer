// ML Worker - Web Worker for preference prediction computations
// Runs ML operations in separate thread to prevent UI freeze

// Import dependencies (will be inlined for worker)
importScripts('ml-model.js');

// Model instance
let model = null;

// Abort flag for cancellable operations
let abortFlag = false;

/**
 * Send progress update to main thread
 * @param {string} message - Progress message
 * @param {number} current - Current progress
 * @param {number} total - Total items
 */
function updateProgress(message, current, total) {
    self.postMessage({ type: 'progress', message, current, total });
}

/**
 * Initialize or restore model
 * @param {Object|null} savedModel - Previously saved model state
 */
function initializeModel(savedModel) {
    if (savedModel && savedModel.weights) {
        try {
            model = OnlineLogisticRegression.fromJSON(savedModel);
            console.log('ML Model restored:', model.getStats());
        } catch (error) {
            console.error('Failed to restore model, creating new:', error);
            model = new OnlineLogisticRegression(50);
        }
    } else {
        model = new OnlineLogisticRegression(50);
        console.log('ML Model initialized fresh');
    }
}

/**
 * Train model from historical data (files in like/dislike folders)
 * @param {Array<number[]>} likedFeatures - Features of liked files
 * @param {Array<number[]>} dislikedFeatures - Features of disliked files
 * @returns {Object} Training result
 */
function trainFromHistorical(likedFeatures, dislikedFeatures) {
    if (!model) {
        initializeModel(null);
    }

    const totalSamples = likedFeatures.length + dislikedFeatures.length;

    if (totalSamples === 0) {
        return {
            type: 'trainComplete',
            stats: model.getStats(),
            modelState: model.toJSON()
        };
    }

    updateProgress('Training from historical data...', 0, totalSamples);

    // Combine features and labels
    const features = [...likedFeatures, ...dislikedFeatures];
    const labels = [
        ...new Array(likedFeatures.length).fill(1),
        ...new Array(dislikedFeatures.length).fill(0)
    ];

    // Batch train with multiple epochs
    const epochs = Math.min(10, Math.max(3, Math.floor(50 / totalSamples)));
    model.trainBatch(features, labels, epochs);

    updateProgress('Training complete', totalSamples, totalSamples);

    return {
        type: 'trainComplete',
        stats: model.getStats(),
        modelState: model.toJSON()
    };
}

/**
 * Incremental model update after new rating
 * @param {number[]} features - Feature vector of rated file
 * @param {number} label - Rating (1 = like, 0 = dislike)
 * @returns {Object} Update result
 */
function updateModel(features, label) {
    if (!model) {
        return { type: 'error', message: 'Model not initialized' };
    }

    const prediction = model.update(features, label);

    return {
        type: 'updateComplete',
        prediction,
        stats: model.getStats(),
        modelState: model.toJSON()
    };
}

/**
 * Reverse a previous model update (for undo functionality)
 * @param {number[]} features - Feature vector of the sample to reverse
 * @param {number} label - Original label (1 = like, 0 = dislike)
 * @returns {Object} Reverse update result
 */
function reverseUpdateModel(features, label) {
    if (!model) {
        return { type: 'error', message: 'Model not initialized' };
    }

    model.reverseUpdate(features, label);

    return {
        type: 'reverseUpdateComplete',
        stats: model.getStats(),
        modelState: model.toJSON()
    };
}

/**
 * Score all files with current model
 * @param {Object} allFeatures - Map of filename to features
 * @returns {Object} Scoring result
 */
function scoreFiles(allFeatures) {
    if (!model) {
        return {
            type: 'scoreComplete',
            scores: null,
            reason: 'Model not initialized'
        };
    }

    if (!model.hasEnoughSamples()) {
        return {
            type: 'scoreComplete',
            scores: null,
            reason: `Need more samples (${model.positiveCount} likes, ${model.negativeCount} dislikes)`
        };
    }

    const filenames = Object.keys(allFeatures);
    const scores = {};

    updateProgress('Scoring files...', 0, filenames.length);

    for (let i = 0; i < filenames.length; i++) {
        if (abortFlag) {
            return {
                type: 'scoreComplete',
                scores: null,
                reason: 'Scoring cancelled'
            };
        }

        const filename = filenames[i];
        const features = allFeatures[filename];

        if (features && features.length > 0) {
            scores[filename] = model.predict(features);
        } else {
            scores[filename] = 0.5; // Default score for files without features
        }

        if ((i + 1) % 100 === 0) {
            updateProgress(`Scoring: ${i + 1}/${filenames.length}`, i + 1, filenames.length);
        }
    }

    return {
        type: 'scoreComplete',
        scores,
        stats: model.getStats()
    };
}

/**
 * Get sorted file order by prediction score
 * @param {Object} allFeatures - Map of filename to features
 * @returns {Object} Sorted result
 */
function getSortedOrder(allFeatures) {
    const scoreResult = scoreFiles(allFeatures);

    if (!scoreResult.scores) {
        return {
            type: 'sortComplete',
            sortedFilenames: null,
            reason: scoreResult.reason
        };
    }

    // Sort filenames by score (descending - highest probability first)
    const sortedFilenames = Object.keys(scoreResult.scores).sort((a, b) => {
        return scoreResult.scores[b] - scoreResult.scores[a];
    });

    return {
        type: 'sortComplete',
        sortedFilenames,
        scores: scoreResult.scores,
        stats: model.getStats()
    };
}

/**
 * Reset model to initial state
 * @returns {Object} Reset result
 */
function resetModel() {
    if (model) {
        model.reset();
    } else {
        model = new OnlineLogisticRegression(50);
    }

    return {
        type: 'resetComplete',
        stats: model.getStats(),
        modelState: model.toJSON()
    };
}

/**
 * Message handler for worker
 */
self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'abort':
            abortFlag = true;
            break;

        case 'init':
            abortFlag = false;
            initializeModel(data?.savedModel);
            self.postMessage({
                type: 'initComplete',
                stats: model?.getStats(),
                modelState: model?.toJSON()
            });
            break;

        case 'trainHistorical':
            abortFlag = false;
            try {
                const trainResult = trainFromHistorical(
                    data.likedFeatures || [],
                    data.dislikedFeatures || []
                );
                self.postMessage(trainResult);
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: 'Training failed: ' + error.message
                });
            }
            break;

        case 'update':
            try {
                const updateResult = updateModel(data.features, data.label);
                self.postMessage(updateResult);
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: 'Update failed: ' + error.message
                });
            }
            break;

        case 'reverseUpdate':
            try {
                const reverseResult = reverseUpdateModel(data.features, data.label);
                self.postMessage(reverseResult);
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: 'Reverse update failed: ' + error.message
                });
            }
            break;

        case 'scoreAll':
            abortFlag = false;
            try {
                const scoreResult = scoreFiles(data.allFeatures || {});
                self.postMessage(scoreResult);
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: 'Scoring failed: ' + error.message
                });
            }
            break;

        case 'getSortedOrder':
            abortFlag = false;
            try {
                const sortResult = getSortedOrder(data.allFeatures || {});
                self.postMessage(sortResult);
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: 'Sorting failed: ' + error.message
                });
            }
            break;

        case 'getModel':
            self.postMessage({
                type: 'modelState',
                modelState: model?.toJSON(),
                stats: model?.getStats()
            });
            break;

        case 'reset':
            try {
                const resetResult = resetModel();
                self.postMessage(resetResult);
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: 'Reset failed: ' + error.message
                });
            }
            break;

        default:
            self.postMessage({
                type: 'error',
                message: 'Unknown message type: ' + type
            });
    }
};
