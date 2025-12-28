// Feature Extraction Worker
// Runs CPU-intensive feature extraction in a separate thread
// Receives pixel data from main thread, returns 50-dimensional feature vector

importScripts('feature-extractor.js');

/**
 * Message handler for worker
 * @param {MessageEvent} e - Message event with type and data
 */
self.onmessage = function(e) {
    const { type, data } = e.data;

    switch (type) {
        case 'extract':
            handleExtract(data);
            break;

        case 'batch':
            handleBatch(data);
            break;

        default:
            self.postMessage({
                type: 'error',
                id: data?.id,
                message: 'Unknown message type: ' + type
            });
    }
};

/**
 * Handle single file feature extraction
 * @param {Object} data - Extraction data
 * @param {number} data.id - Task ID for tracking
 * @param {Uint8ClampedArray} data.pixels - RGBA pixel data (256x256)
 * @param {number} data.width - Image width (256)
 * @param {number} data.height - Image height (256)
 */
function handleExtract({ id, pixels, width, height }) {
    try {
        // Reconstruct ImageData-like object from raw pixels
        const imageData = {
            data: new Uint8ClampedArray(pixels),
            width: width,
            height: height
        };

        const features = extractFeatures(imageData);

        // Transfer ownership of the buffer for efficiency
        self.postMessage({
            type: 'result',
            id: id,
            features: features
        }, [features.buffer]);

    } catch (error) {
        self.postMessage({
            type: 'error',
            id: id,
            message: error.message || 'Feature extraction failed'
        });
    }
}

/**
 * Handle batch feature extraction (multiple files)
 * @param {Object} data - Batch data
 * @param {Array} data.items - Array of {id, pixels, width, height}
 */
function handleBatch({ items }) {
    const results = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        try {
            const imageData = {
                data: new Uint8ClampedArray(item.pixels),
                width: item.width,
                height: item.height
            };

            const features = extractFeatures(imageData);

            results.push({
                id: item.id,
                features: Array.from(features),
                success: true
            });

        } catch (error) {
            results.push({
                id: item.id,
                success: false,
                error: error.message || 'Feature extraction failed'
            });
        }

        // Report progress every 5 items
        if ((i + 1) % 5 === 0 || i === items.length - 1) {
            self.postMessage({
                type: 'progress',
                current: i + 1,
                total: items.length
            });
        }
    }

    self.postMessage({
        type: 'batchComplete',
        results: results
    });
}

/**
 * Error handler for uncaught errors
 */
self.onerror = function(error) {
    self.postMessage({
        type: 'error',
        id: null,
        message: 'Worker error: ' + (error.message || error)
    });
};
