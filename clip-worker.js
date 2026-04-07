// CLIP Worker - Web Worker for CLIP semantic embedding extraction
// Uses @huggingface/transformers to run CLIP ViT-B/32 (q8) locally
// Produces 512-dimensional semantic embeddings

const CLIP_EMBEDDING_DIM = 512;
const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';

let processor = null;
let visionModel = null;
let isModelLoading = false;
let modelLoadError = null;

/**
 * Load the CLIP model (lazy, first call only).
 * Posts download progress to main thread.
 */
async function loadModel() {
    if (visionModel) return true;
    if (modelLoadError) return false;
    if (isModelLoading) {
        // Wait for in-progress load
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (!isModelLoading) {
                    clearInterval(check);
                    resolve(visionModel !== null);
                }
            }, 100);
        });
    }

    isModelLoading = true;

    try {
        const { AutoProcessor, CLIPVisionModelWithProjection } =
            await import('./node_modules/@huggingface/transformers/dist/transformers.web.js');

        processor = await AutoProcessor.from_pretrained(CLIP_MODEL_ID, {
            progress_callback: (progress) => {
                if (progress.status === 'progress') {
                    self.postMessage({
                        type: 'downloadProgress',
                        progress: Math.round(progress.progress || 0),
                        file: progress.file || '',
                    });
                }
            },
        });

        visionModel = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL_ID, {
            dtype: 'q8',
            progress_callback: (progress) => {
                if (progress.status === 'progress') {
                    self.postMessage({
                        type: 'downloadProgress',
                        progress: Math.round(progress.progress || 0),
                        file: progress.file || '',
                    });
                }
            },
        });

        isModelLoading = false;
        self.postMessage({ type: 'modelReady' });
        return true;
    } catch (error) {
        isModelLoading = false;
        modelLoadError = error.message;
        self.postMessage({ type: 'modelError', error: `${error.message}\n${error.stack}` });
        return false;
    }
}

/**
 * Extract CLIP embedding from raw pixel data (RGBA Uint8ClampedArray).
 * @param {Uint8ClampedArray} pixelData - RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Float32Array} 512-dim embedding or null
 */
async function extractEmbedding(pixelData, width, height) {
    if (!processor || !visionModel) {
        const loaded = await loadModel();
        if (!loaded) return null;
    }

    const { RawImage } = await import('./node_modules/@huggingface/transformers/dist/transformers.web.js');

    // Create RawImage from pixel data (RGBA)
    const image = new RawImage(pixelData, width, height, 4);

    // Process image through CLIP vision encoder
    const inputs = await processor(image);
    const output = await visionModel(inputs);

    // Extract the image embedding (normalized)
    const embedding = output.image_embeds.data;
    const result = new Float32Array(CLIP_EMBEDDING_DIM);

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < CLIP_EMBEDDING_DIM; i++) {
        norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);

    for (let i = 0; i < CLIP_EMBEDDING_DIM; i++) {
        result[i] = norm > 0 ? embedding[i] / norm : 0;
    }

    return result;
}

/**
 * Average multiple embeddings into one.
 * @param {Float32Array[]} embeddings - Array of 512-dim embeddings
 * @returns {Float32Array} Averaged 512-dim embedding
 */
function averageEmbeddings(embeddings) {
    if (embeddings.length === 0) return null;
    if (embeddings.length === 1) return embeddings[0];

    const result = new Float32Array(CLIP_EMBEDDING_DIM);
    for (const emb of embeddings) {
        for (let i = 0; i < CLIP_EMBEDDING_DIM; i++) {
            result[i] += emb[i];
        }
    }

    // Normalize averaged vector
    let norm = 0;
    for (let i = 0; i < CLIP_EMBEDDING_DIM; i++) {
        result[i] /= embeddings.length;
        norm += result[i] * result[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < CLIP_EMBEDDING_DIM; i++) {
        result[i] = norm > 0 ? result[i] / norm : 0;
    }

    return result;
}

// Message handler
self.onmessage = async function (e) {
    const { type, data } = e.data;

    switch (type) {
        case 'loadModel': {
            const success = await loadModel();
            if (!success) {
                self.postMessage({ type: 'error', error: modelLoadError || 'Failed to load CLIP model' });
            }
            break;
        }

        case 'extract': {
            try {
                const { id, pixelData, width, height } = data;
                const embedding = await extractEmbedding(pixelData, width, height);

                if (embedding) {
                    self.postMessage({ type: 'result', id, embedding: embedding.buffer }, [embedding.buffer]);
                } else {
                    self.postMessage({ type: 'error', id, error: 'Embedding extraction failed' });
                }
            } catch (error) {
                self.postMessage({ type: 'error', id: data?.id, error: error.message });
            }
            break;
        }

        case 'extractBatch': {
            // For video keyframes: extract multiple frames, return averaged embedding
            try {
                const { id, frames } = data; // frames: [{ pixelData, width, height }, ...]
                const embeddings = [];

                for (const frame of frames) {
                    const emb = await extractEmbedding(frame.pixelData, frame.width, frame.height);
                    if (emb) {
                        embeddings.push(emb);
                    }
                }

                const averaged = averageEmbeddings(embeddings);
                if (averaged) {
                    self.postMessage(
                        { type: 'batchResult', id, embedding: averaged.buffer, frameCount: embeddings.length },
                        [averaged.buffer]
                    );
                } else {
                    self.postMessage({ type: 'error', id, error: 'No valid embeddings from frames' });
                }
            } catch (error) {
                self.postMessage({ type: 'error', id: data?.id, error: error.message });
            }
            break;
        }

        case 'getInfo': {
            self.postMessage({
                type: 'info',
                modelId: CLIP_MODEL_ID,
                embeddingDim: CLIP_EMBEDDING_DIM,
                isLoaded: visionModel !== null,
                error: modelLoadError,
            });
            break;
        }

        default:
            self.postMessage({ type: 'error', error: `Unknown message type: ${type}` });
    }
};

// Conditional CJS exports for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractEmbedding,
        averageEmbeddings,
        CLIP_EMBEDDING_DIM,
        CLIP_MODEL_ID,
    };
}
