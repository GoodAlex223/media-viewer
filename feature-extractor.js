// Feature Extractor - Extracts rich visual features from ImageData
// Used for ML-based preference prediction

/**
 * Extract comprehensive feature vector from ImageData
 * @param {ImageData} imageData - 256x256 RGBA image
 * @returns {Float32Array} - 50-dimensional feature vector
 */
function extractFeatures(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const pixelCount = width * height;

    // Convert all pixels to HSL for analysis
    const hslPixels = new Array(pixelCount);
    const rgbPixels = new Array(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        const r = data[idx] / 255;
        const g = data[idx + 1] / 255;
        const b = data[idx + 2] / 255;

        rgbPixels[i] = { r, g, b };
        hslPixels[i] = rgbToHsl(r, g, b);
    }

    const features = new Float32Array(50);
    let featureIdx = 0;

    // 1. Hue histogram (12 bins, 30 degrees each)
    const hueHist = computeHistogram(
        hslPixels.map(p => p.h),
        12, 0, 360
    );
    for (let i = 0; i < 12; i++) {
        features[featureIdx++] = hueHist[i];
    }

    // 2. Saturation histogram (6 bins)
    const satHist = computeHistogram(
        hslPixels.map(p => p.s),
        6, 0, 1
    );
    for (let i = 0; i < 6; i++) {
        features[featureIdx++] = satHist[i];
    }

    // 3. Lightness histogram (6 bins)
    const lightHist = computeHistogram(
        hslPixels.map(p => p.l),
        6, 0, 1
    );
    for (let i = 0; i < 6; i++) {
        features[featureIdx++] = lightHist[i];
    }

    // 4. Dominant colors (k-means with k=3, 9 features: 3 colors x H,S,L)
    const dominantColors = extractDominantColors(hslPixels, 3);
    for (const color of dominantColors) {
        features[featureIdx++] = color.h / 360; // Normalize to 0-1
        features[featureIdx++] = color.s;
        features[featureIdx++] = color.l;
    }

    // 5. Global statistics
    const saturations = hslPixels.map(p => p.s);
    const lightnesses = hslPixels.map(p => p.l);

    features[featureIdx++] = mean(saturations);                    // avgSaturation
    features[featureIdx++] = mean(lightnesses);                    // avgBrightness
    features[featureIdx++] = Math.min(1, stdDev(lightnesses) * 2); // contrast (scaled)
    features[featureIdx++] = computeColorfulness(data);            // colorfulness
    features[featureIdx++] = (computeWarmth(data) + 1) / 2;        // warmth (normalized -1,1 to 0,1)

    // 6. Edge/texture features
    const edgeData = computeEdges(imageData);
    features[featureIdx++] = edgeData.density;
    features[featureIdx++] = edgeData.horizontalRatio;
    features[featureIdx++] = edgeData.verticalRatio;
    features[featureIdx++] = computeComplexity(data, pixelCount);

    // Padding (reserved for future features)
    while (featureIdx < 50) {
        features[featureIdx++] = 0;
    }

    return features;
}

/**
 * Convert RGB to HSL color space
 * @param {number} r - Red (0-1)
 * @param {number} g - Green (0-1)
 * @param {number} b - Blue (0-1)
 * @returns {{h: number, s: number, l: number}} HSL values
 */
function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return { h: h * 360, s, l };
}

/**
 * Compute normalized histogram
 * @param {number[]} values - Array of values
 * @param {number} bins - Number of bins
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number[]} Normalized histogram
 */
function computeHistogram(values, bins, min, max) {
    const hist = new Array(bins).fill(0);
    const range = max - min;

    for (const val of values) {
        const bin = Math.min(bins - 1, Math.floor((val - min) / range * bins));
        hist[bin]++;
    }

    // Normalize
    const total = values.length;
    return hist.map(v => v / total);
}

/**
 * Extract dominant colors using simplified k-means clustering
 * @param {Array<{h: number, s: number, l: number}>} hslPixels - Array of HSL pixels
 * @param {number} k - Number of clusters
 * @returns {Array<{h: number, s: number, l: number}>} Dominant colors
 */
function extractDominantColors(hslPixels, k) {
    // Sample for performance (use up to 1000 random pixels)
    const sampleSize = Math.min(1000, hslPixels.length);
    const sampled = [];
    const step = Math.floor(hslPixels.length / sampleSize);

    for (let i = 0; i < sampleSize; i++) {
        sampled.push(hslPixels[i * step]);
    }

    // Initialize centroids with evenly spaced samples
    let centroids = [];
    for (let i = 0; i < k; i++) {
        const idx = Math.floor((i / k) * sampled.length);
        centroids.push({ ...sampled[idx] });
    }

    // K-means iterations
    for (let iter = 0; iter < 10; iter++) {
        const clusters = Array.from({ length: k }, () => []);

        // Assign pixels to nearest centroid
        for (const pixel of sampled) {
            let minDist = Infinity;
            let bestCluster = 0;

            for (let i = 0; i < k; i++) {
                const dist = hslDistance(pixel, centroids[i]);
                if (dist < minDist) {
                    minDist = dist;
                    bestCluster = i;
                }
            }
            clusters[bestCluster].push(pixel);
        }

        // Update centroids
        for (let i = 0; i < k; i++) {
            if (clusters[i].length > 0) {
                centroids[i] = {
                    h: mean(clusters[i].map(p => p.h)),
                    s: mean(clusters[i].map(p => p.s)),
                    l: mean(clusters[i].map(p => p.l)),
                    count: clusters[i].length
                };
            }
        }
    }

    // Sort by cluster size (most dominant first)
    centroids.sort((a, b) => (b.count || 0) - (a.count || 0));

    return centroids;
}

/**
 * Calculate distance between two HSL colors
 * Uses weighted distance accounting for hue circularity
 * @param {Object} c1 - First color {h, s, l}
 * @param {Object} c2 - Second color {h, s, l}
 * @returns {number} Distance
 */
function hslDistance(c1, c2) {
    // Hue is circular, so we need to handle wrap-around
    let hueDiff = Math.abs(c1.h - c2.h);
    if (hueDiff > 180) hueDiff = 360 - hueDiff;
    hueDiff /= 180; // Normalize to 0-1

    const satDiff = c1.s - c2.s;
    const lightDiff = c1.l - c2.l;

    // Weight hue less for low saturation colors (grays)
    const avgSat = (c1.s + c2.s) / 2;
    const hueWeight = avgSat;

    return Math.sqrt(
        hueWeight * hueDiff * hueDiff +
        satDiff * satDiff +
        lightDiff * lightDiff
    );
}

/**
 * Compute Sobel edge detection features
 * @param {ImageData} imageData - Input image data
 * @returns {{density: number, horizontalRatio: number, verticalRatio: number}}
 */
function computeEdges(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    // Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        const idx = i / 4;
        gray[idx] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    }

    // Sobel edge detection
    let totalEdge = 0;
    let horizEdge = 0;
    let vertEdge = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;

            // Horizontal gradient (Gx) - detects vertical edges
            const gx = -gray[idx - width - 1] + gray[idx - width + 1]
                     - 2 * gray[idx - 1] + 2 * gray[idx + 1]
                     - gray[idx + width - 1] + gray[idx + width + 1];

            // Vertical gradient (Gy) - detects horizontal edges
            const gy = -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1]
                     + gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];

            const magnitude = Math.sqrt(gx * gx + gy * gy);
            totalEdge += magnitude;
            horizEdge += Math.abs(gy);
            vertEdge += Math.abs(gx);
        }
    }

    const edgePixels = (width - 2) * (height - 2);
    const maxEdge = edgePixels * 4; // Normalization factor

    return {
        density: Math.min(1, totalEdge / maxEdge),
        horizontalRatio: totalEdge > 0 ? horizEdge / (horizEdge + vertEdge) : 0.5,
        verticalRatio: totalEdge > 0 ? vertEdge / (horizEdge + vertEdge) : 0.5
    };
}

/**
 * Compute colorfulness metric (Hasler & Susstrunk, 2003)
 * @param {Uint8ClampedArray} data - RGBA pixel data
 * @returns {number} Colorfulness score (0-1)
 */
function computeColorfulness(data) {
    const rg = [];
    const yb = [];

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        rg.push(r - g);
        yb.push(0.5 * (r + g) - b);
    }

    const sigmaRg = stdDev(rg);
    const sigmaYb = stdDev(yb);
    const muRg = mean(rg);
    const muYb = mean(yb);

    const colorfulness = Math.sqrt(sigmaRg * sigmaRg + sigmaYb * sigmaYb) +
                        0.3 * Math.sqrt(muRg * muRg + muYb * muYb);

    // Normalize to 0-1 (200 is approximate max for very colorful images)
    return Math.min(1, colorfulness / 200);
}

/**
 * Compute color temperature (warmth)
 * Positive = warm (reds/oranges), Negative = cool (blues)
 * @param {Uint8ClampedArray} data - RGBA pixel data
 * @returns {number} Warmth score (-1 to 1)
 */
function computeWarmth(data) {
    let warmSum = 0;
    let pixelCount = 0;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Warm colors have high R, low B
        // Cool colors have low R, high B
        warmSum += (r - b) / 255;
        pixelCount++;
    }

    return warmSum / pixelCount;
}

/**
 * Compute image complexity based on unique color count
 * @param {Uint8ClampedArray} data - RGBA pixel data
 * @param {number} pixelCount - Total pixel count
 * @returns {number} Complexity score (0-1)
 */
function computeComplexity(data, pixelCount) {
    // Quantize colors to reduce noise (5-bit per channel)
    const uniqueColors = new Set();

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i] >> 3;      // 5-bit
        const g = data[i + 1] >> 3;
        const b = data[i + 2] >> 3;

        const colorKey = (r << 10) | (g << 5) | b;
        uniqueColors.add(colorKey);
    }

    // Max unique colors with 5-bit quantization = 32^3 = 32768
    // But typically images have far fewer
    // Normalize against expected range (up to 5000 unique colors is complex)
    return Math.min(1, uniqueColors.size / 5000);
}

/**
 * Calculate mean of array
 * @param {number[]} arr - Input array
 * @returns {number} Mean value
 */
function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation of array
 * @param {number[]} arr - Input array
 * @returns {number} Standard deviation
 */
function stdDev(arr) {
    if (arr.length === 0) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length);
}

// Export for use in both main thread and worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractFeatures, rgbToHsl, computeHistogram };
}
