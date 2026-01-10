// Face Detector - Lazy-loaded face detection using face-api.js
// Uses tiny_face_detector for fast detection

// State
let faceApiLoaded = false;
let modelsLoaded = false;
let loadingPromise = null;

// Model path (relative to node_modules)
const MODEL_PATH = './node_modules/@vladmandic/face-api/model';

/**
 * Dynamically load face-api.js library
 * @returns {Promise<void>}
 */
async function loadFaceApi() {
    if (faceApiLoaded) return;

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './node_modules/@vladmandic/face-api/dist/face-api.js';
        script.onload = () => {
            faceApiLoaded = true;
            console.log('face-api.js loaded');
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load face-api.js'));
        document.head.appendChild(script);
    });
}

/**
 * Load face detection models
 * @returns {Promise<void>}
 */
async function loadModels() {
    if (modelsLoaded) return;

    await loadFaceApi();

    // Load tiny face detector (fastest, smallest model)
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_PATH);

    modelsLoaded = true;
    console.log('Face detection models loaded');
}

/**
 * Initialize face detection (lazy load)
 * @returns {Promise<boolean>} True if initialization successful
 */
async function initFaceDetection() {
    if (modelsLoaded) return true;

    // Prevent multiple simultaneous loads
    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = (async () => {
        try {
            await loadModels();
            return true;
        } catch (error) {
            console.error('Failed to initialize face detection:', error);
            return false;
        } finally {
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}

/**
 * Detect faces in an image/canvas
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} input - Input media element
 * @param {Object} options - Detection options
 * @param {number} options.minConfidence - Minimum detection confidence (0-1, default: 0.5)
 * @param {number} options.inputSize - Input size for detection (default: 224)
 * @returns {Promise<Object>} Face detection results
 */
async function detectFaces(input, options = {}) {
    const {
        minConfidence = 0.5,
        inputSize = 224  // Smaller = faster, larger = more accurate
    } = options;

    // Initialize if needed
    const initialized = await initFaceDetection();
    if (!initialized) {
        return {
            hasFace: false,
            count: 0,
            areaRatio: 0,
            detections: [],
            error: 'Face detection not available'
        };
    }

    try {
        // Configure detector options
        const detectorOptions = new faceapi.TinyFaceDetectorOptions({
            inputSize: inputSize,
            scoreThreshold: minConfidence
        });

        // Detect all faces
        const detections = await faceapi.detectAllFaces(input, detectorOptions);

        // Calculate total face area ratio
        let totalFaceArea = 0;
        const inputWidth = input.width || input.videoWidth || input.naturalWidth;
        const inputHeight = input.height || input.videoHeight || input.naturalHeight;
        const totalArea = inputWidth * inputHeight;

        const faceData = detections.map(det => {
            const box = det.box;
            const area = box.width * box.height;
            totalFaceArea += area;

            return {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                score: det.score,
                areaRatio: area / totalArea
            };
        });

        return {
            hasFace: detections.length > 0,
            count: detections.length,
            areaRatio: totalArea > 0 ? Math.min(1, totalFaceArea / totalArea) : 0,
            detections: faceData
        };

    } catch (error) {
        console.error('Face detection error:', error);
        return {
            hasFace: false,
            count: 0,
            areaRatio: 0,
            detections: [],
            error: error.message
        };
    }
}

/**
 * Detect faces from ImageData (convenience method)
 * Creates a temporary canvas from ImageData
 * @param {ImageData} imageData - Image data to analyze
 * @returns {Promise<Object>} Face detection results
 */
async function detectFacesFromImageData(imageData) {
    // Create a canvas from ImageData
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    return detectFaces(canvas);
}

/**
 * Check if face detection is available
 * @returns {boolean}
 */
function isFaceDetectionAvailable() {
    return modelsLoaded;
}

/**
 * Check if face detection is currently loading
 * @returns {boolean}
 */
function isFaceDetectionLoading() {
    return loadingPromise !== null;
}

// Export for use in media-viewer
if (typeof window !== 'undefined') {
    window.FaceDetector = {
        init: initFaceDetection,
        detect: detectFaces,
        detectFromImageData: detectFacesFromImageData,
        isAvailable: isFaceDetectionAvailable,
        isLoading: isFaceDetectionLoading
    };
}
