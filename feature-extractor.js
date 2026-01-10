// Feature Extractor - Extracts rich visual features from ImageData
// Used for ML-based preference prediction
// Version 2: 64-dimensional feature vector

const FEATURE_VERSION = 2;
const FEATURE_DIM = 64;

/**
 * Extract comprehensive feature vector from ImageData
 * @param {ImageData} imageData - 256x256 RGBA image
 * @param {Object} metadata - Optional file metadata
 * @param {number} metadata.width - Original image width
 * @param {number} metadata.height - Original image height
 * @param {number} metadata.fileSize - File size in bytes
 * @param {boolean} metadata.isVideo - Whether this is a video
 * @param {string} metadata.format - File format (jpg, png, gif, etc.)
 * @param {Object} metadata.videoInfo - Video info (duration, fps, hasAudio, bitrate)
 * @param {Object} metadata.faceInfo - Face detection info (count, areaRatio)
 * @returns {Float32Array} - 64-dimensional feature vector
 */
function extractFeatures(imageData, metadata = {}) {
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

    // Pre-compute grayscale for multiple features
    const gray = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
        const idx = i * 4;
        gray[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
    }

    const features = new Float32Array(FEATURE_DIM);
    let featureIdx = 0;

    // ========================================================================
    // ORIGINAL FEATURES (0-41)
    // ========================================================================

    // 1. Hue histogram (12 bins, 30 degrees each) - slots 0-11
    const hueHist = computeHistogram(
        hslPixels.map(p => p.h),
        12, 0, 360
    );
    for (let i = 0; i < 12; i++) {
        features[featureIdx++] = hueHist[i];
    }

    // 2. Saturation histogram (6 bins) - slots 12-17
    const satHist = computeHistogram(
        hslPixels.map(p => p.s),
        6, 0, 1
    );
    for (let i = 0; i < 6; i++) {
        features[featureIdx++] = satHist[i];
    }

    // 3. Lightness histogram (6 bins) - slots 18-23
    const lightHist = computeHistogram(
        hslPixels.map(p => p.l),
        6, 0, 1
    );
    for (let i = 0; i < 6; i++) {
        features[featureIdx++] = lightHist[i];
    }

    // 4. Dominant colors (k-means with k=3, 9 features: 3 colors x H,S,L) - slots 24-32
    const dominantColors = extractDominantColors(hslPixels, 3);
    for (const color of dominantColors) {
        features[featureIdx++] = color.h / 360; // Normalize to 0-1
        features[featureIdx++] = color.s;
        features[featureIdx++] = color.l;
    }

    // 5. Global statistics - slots 33-37
    const saturations = hslPixels.map(p => p.s);
    const lightnesses = hslPixels.map(p => p.l);

    features[featureIdx++] = mean(saturations);                    // 33: avgSaturation
    features[featureIdx++] = mean(lightnesses);                    // 34: avgBrightness
    features[featureIdx++] = Math.min(1, stdDev(lightnesses) * 2); // 35: contrast (scaled)
    features[featureIdx++] = computeColorfulness(data);            // 36: colorfulness
    features[featureIdx++] = (computeWarmth(data) + 1) / 2;        // 37: warmth (normalized -1,1 to 0,1)

    // 6. Edge/texture features - slots 38-41
    const edgeData = computeEdges(imageData);
    features[featureIdx++] = edgeData.density;                     // 38: edge density
    features[featureIdx++] = edgeData.horizontalRatio;             // 39: horizontal ratio
    features[featureIdx++] = edgeData.verticalRatio;               // 40: vertical ratio
    features[featureIdx++] = computeComplexity(data, pixelCount);  // 41: complexity

    // ========================================================================
    // FILE METADATA FEATURES (42-47)
    // ========================================================================

    // 42: Aspect ratio (normalized: 0.3-3.0 mapped to 0-1)
    const origWidth = metadata.width || width;
    const origHeight = metadata.height || height;
    const aspectRatio = origWidth / origHeight;
    features[featureIdx++] = Math.min(1, Math.max(0, (aspectRatio - 0.3) / 2.7));

    // 43: Resolution bucket (0: <720p, 0.5: HD, 1: FHD+)
    const maxDim = Math.max(origWidth, origHeight);
    if (maxDim >= 1920) {
        features[featureIdx++] = 1.0;       // FHD+
    } else if (maxDim >= 1280) {
        features[featureIdx++] = 0.5;       // HD
    } else {
        features[featureIdx++] = 0.0;       // <720p
    }

    // 44: File size (log normalized)
    const fileSize = metadata.fileSize || 0;
    features[featureIdx++] = fileSize > 0 ? Math.min(1, Math.log10(fileSize) / 8) : 0;

    // 45: Is video
    features[featureIdx++] = metadata.isVideo ? 1 : 0;

    // 46: Is PNG (quality indicator)
    const format = (metadata.format || '').toLowerCase();
    features[featureIdx++] = format === 'png' ? 1 : 0;

    // 47: Is animated (GIF or video)
    features[featureIdx++] = (metadata.isVideo || format === 'gif') ? 1 : 0;

    // ========================================================================
    // PERCEPTUAL QUALITY FEATURES (48-53)
    // ========================================================================

    // 48: Sharpness
    features[featureIdx++] = computeSharpness(gray, width, height);

    // 49: Symmetry
    features[featureIdx++] = computeSymmetry(imageData);

    // 50: Rule of thirds
    features[featureIdx++] = computeRuleOfThirds(gray, width, height);

    // 51: Visual balance
    features[featureIdx++] = computeVisualBalance(imageData);

    // 52: Color harmony
    features[featureIdx++] = computeColorHarmony(hslPixels);

    // 53: Noise level
    features[featureIdx++] = computeNoiseLevel(imageData);

    // ========================================================================
    // FACE FEATURES (54-56) - filled by caller or default to 0
    // ========================================================================

    const faceInfo = metadata.faceInfo || {};
    features[featureIdx++] = faceInfo.hasFace ? 1 : 0;                           // 54: has face
    features[featureIdx++] = Math.min(1, (faceInfo.count || 0) / 5);             // 55: face count (normalized)
    features[featureIdx++] = faceInfo.areaRatio || 0;                            // 56: face area ratio

    // ========================================================================
    // VIDEO FEATURES (57-63) - filled by caller, 0 for images
    // ========================================================================

    const videoInfo = metadata.videoInfo || {};
    const isVideo = metadata.isVideo;

    // 57: Duration (log normalized) - log10(seconds+1)/3
    features[featureIdx++] = isVideo && videoInfo.duration ?
        Math.min(1, Math.log10(videoInfo.duration + 1) / 3) : 0;

    // 58: Frame rate (normalized) - fps/60
    features[featureIdx++] = isVideo && videoInfo.fps ?
        Math.min(1, videoInfo.fps / 60) : 0;

    // 59: Has audio
    features[featureIdx++] = isVideo && videoInfo.hasAudio ? 1 : 0;

    // 60: Bitrate (log normalized) - log10(kbps)/5
    features[featureIdx++] = isVideo && videoInfo.bitrate ?
        Math.min(1, Math.log10(videoInfo.bitrate) / 5) : 0;

    // 61: Motion amount (0 for now, requires multi-frame analysis)
    features[featureIdx++] = videoInfo.motionAmount || 0;

    // 62-63: Reserved
    features[featureIdx++] = 0;
    features[featureIdx++] = 0;

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

// ============================================================================
// NEW PERCEPTUAL QUALITY FEATURES (v2)
// ============================================================================

/**
 * Compute sharpness using Laplacian variance
 * Higher values indicate sharper images
 * @param {Float32Array} gray - Grayscale image data (0-1 normalized)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {number} Sharpness score (0-1)
 */
function computeSharpness(gray, width, height) {
    // Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
    const laplacian = [];

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const lap = -4 * gray[idx] +
                        gray[idx - width] +
                        gray[idx + width] +
                        gray[idx - 1] +
                        gray[idx + 1];
            laplacian.push(lap);
        }
    }

    // Variance of Laplacian
    const variance = stdDev(laplacian) ** 2;

    // Normalize: typical sharp images have variance > 0.01
    // Blur images have variance < 0.001
    return Math.min(1, variance * 50);
}

/**
 * Compute left-right symmetry score
 * @param {ImageData} imageData - Image data
 * @returns {number} Symmetry score (0-1, higher = more symmetric)
 */
function computeSymmetry(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const halfWidth = Math.floor(width / 2);

    let totalDiff = 0;
    let pixelCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < halfWidth; x++) {
            const leftIdx = (y * width + x) * 4;
            const rightIdx = (y * width + (width - 1 - x)) * 4;

            // Compare RGB values
            const diffR = Math.abs(data[leftIdx] - data[rightIdx]) / 255;
            const diffG = Math.abs(data[leftIdx + 1] - data[rightIdx + 1]) / 255;
            const diffB = Math.abs(data[leftIdx + 2] - data[rightIdx + 2]) / 255;

            totalDiff += (diffR + diffG + diffB) / 3;
            pixelCount++;
        }
    }

    const avgDiff = totalDiff / pixelCount;
    // Invert: low diff = high symmetry
    return 1 - Math.min(1, avgDiff * 3);
}

/**
 * Compute rule of thirds score
 * Measures how much visual interest aligns with thirds grid intersections
 * @param {Float32Array} gray - Grayscale image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {number} Rule of thirds score (0-1)
 */
function computeRuleOfThirds(gray, width, height) {
    // Compute gradient magnitude for interest detection
    const gradients = new Float32Array((width - 2) * (height - 2));

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const gx = gray[idx + 1] - gray[idx - 1];
            const gy = gray[idx + width] - gray[idx - width];
            gradients[(y - 1) * (width - 2) + (x - 1)] = Math.sqrt(gx * gx + gy * gy);
        }
    }

    // Define thirds intersection points (4 points)
    const thirdX1 = Math.floor(width / 3);
    const thirdX2 = Math.floor(2 * width / 3);
    const thirdY1 = Math.floor(height / 3);
    const thirdY2 = Math.floor(2 * height / 3);

    const intersections = [
        { x: thirdX1, y: thirdY1 },
        { x: thirdX2, y: thirdY1 },
        { x: thirdX1, y: thirdY2 },
        { x: thirdX2, y: thirdY2 }
    ];

    // Sample area around each intersection (radius = width/12)
    const radius = Math.floor(width / 12);
    let intersectionEnergy = 0;
    let totalEnergy = 0;

    // Total gradient energy
    for (let i = 0; i < gradients.length; i++) {
        totalEnergy += gradients[i];
    }

    if (totalEnergy === 0) return 0.5;

    // Energy around intersection points
    for (const point of intersections) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = point.x + dx - 1;
                const y = point.y + dy - 1;
                if (x >= 0 && x < width - 2 && y >= 0 && y < height - 2) {
                    intersectionEnergy += gradients[y * (width - 2) + x];
                }
            }
        }
    }

    // Normalize by expected random distribution
    const intersectionArea = 4 * (2 * radius + 1) * (2 * radius + 1);
    const totalArea = (width - 2) * (height - 2);
    const expectedRatio = intersectionArea / totalArea;
    const actualRatio = intersectionEnergy / totalEnergy;

    // Score: ratio of actual to expected (clamped)
    return Math.min(1, actualRatio / (expectedRatio * 2));
}

/**
 * Compute visual balance score
 * Measures how centered the visual weight is
 * @param {ImageData} imageData - Image data
 * @returns {number} Balance score (0-1, 1 = perfectly centered)
 */
function computeVisualBalance(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    let weightedX = 0;
    let weightedY = 0;
    let totalWeight = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            // Use luminance as weight
            const weight = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
            weightedX += x * weight;
            weightedY += y * weight;
            totalWeight += weight;
        }
    }

    if (totalWeight === 0) return 0.5;

    // Centroid position (normalized to 0-1)
    const centroidX = weightedX / totalWeight / width;
    const centroidY = weightedY / totalWeight / height;

    // Distance from center (0.5, 0.5)
    const distFromCenter = Math.sqrt(
        (centroidX - 0.5) ** 2 + (centroidY - 0.5) ** 2
    );

    // Max distance is ~0.707 (corner to center)
    // Invert: close to center = high balance
    return 1 - Math.min(1, distFromCenter * 2);
}

/**
 * Compute color harmony score
 * Detects complementary, analogous, and triadic color schemes
 * @param {Array<{h: number, s: number, l: number}>} hslPixels - Array of HSL pixels
 * @returns {number} Harmony score (0-1)
 */
function computeColorHarmony(hslPixels) {
    // Build hue histogram with higher resolution
    const hueBins = 36; // 10 degree bins
    const hueHist = new Array(hueBins).fill(0);
    let saturatedCount = 0;

    for (const pixel of hslPixels) {
        if (pixel.s > 0.2) { // Only consider saturated pixels
            const bin = Math.floor(pixel.h / 10) % hueBins;
            hueHist[bin]++;
            saturatedCount++;
        }
    }

    if (saturatedCount < 100) return 0.5; // Not enough color data

    // Normalize histogram
    for (let i = 0; i < hueBins; i++) {
        hueHist[i] /= saturatedCount;
    }

    // Find dominant hues (peaks in histogram)
    const peaks = [];
    for (let i = 0; i < hueBins; i++) {
        const prev = hueHist[(i - 1 + hueBins) % hueBins];
        const next = hueHist[(i + 1) % hueBins];
        if (hueHist[i] > prev && hueHist[i] > next && hueHist[i] > 0.05) {
            peaks.push({ bin: i, weight: hueHist[i] });
        }
    }

    if (peaks.length === 0) return 0.5;
    if (peaks.length === 1) return 0.8; // Monochromatic = harmonious

    // Check for harmony patterns
    let harmonyScore = 0;

    // Sort peaks by weight
    peaks.sort((a, b) => b.weight - a.weight);
    const dominant = peaks[0].bin;

    for (let i = 1; i < Math.min(3, peaks.length); i++) {
        const diff = Math.abs(peaks[i].bin - dominant);
        const hueDiff = Math.min(diff, hueBins - diff) * 10; // Convert to degrees

        // Complementary: ~180 degrees
        if (hueDiff >= 150 && hueDiff <= 210) {
            harmonyScore += 0.4 * peaks[i].weight;
        }
        // Triadic: ~120 degrees
        else if (hueDiff >= 100 && hueDiff <= 140) {
            harmonyScore += 0.3 * peaks[i].weight;
        }
        // Analogous: ~30 degrees
        else if (hueDiff <= 40) {
            harmonyScore += 0.35 * peaks[i].weight;
        }
        // Split-complementary: ~150 degrees
        else if (hueDiff >= 130 && hueDiff <= 170) {
            harmonyScore += 0.25 * peaks[i].weight;
        }
    }

    return Math.min(1, 0.3 + harmonyScore);
}

/**
 * Compute noise level using high-frequency energy
 * @param {ImageData} imageData - Image data
 * @returns {number} Noise level (0-1, 0 = clean, 1 = noisy)
 */
function computeNoiseLevel(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    // Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    }

    // High-pass filter (difference from local average)
    let highFreqEnergy = 0;
    let totalEnergy = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            const center = gray[idx];

            // 3x3 average
            let avg = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    avg += gray[(y + dy) * width + (x + dx)];
                }
            }
            avg /= 9;

            // High frequency = difference from local average
            const highFreq = Math.abs(center - avg);
            highFreqEnergy += highFreq * highFreq;
            totalEnergy += center * center;
        }
    }

    if (totalEnergy === 0) return 0;

    // Ratio of high frequency to total energy
    const ratio = highFreqEnergy / totalEnergy;

    // Normalize: typical noise ratio is 0.001-0.1
    return Math.min(1, ratio * 10);
}

// Export for use in both main thread and worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractFeatures,
        rgbToHsl,
        computeHistogram,
        computeSharpness,
        computeSymmetry,
        computeRuleOfThirds,
        computeVisualBalance,
        computeColorHarmony,
        computeNoiseLevel,
        FEATURE_VERSION,
        FEATURE_DIM
    };
}
