# CLIP Semantic Features Implementation Plan

**Status: Complete** (2026-04-07). All 12 tasks implemented. Key deviation: CLIP inference moved from Web Worker to main process IPC (npm packages can't resolve in Electron Workers). Also fixed pre-existing ML model retrain bug.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 512-dim CLIP semantic embeddings to the ML prediction pipeline, concatenated with existing 64-dim hand-crafted features, to improve preference prediction quality.

**Architecture:** New `clip-worker.js` Web Worker uses `@huggingface/transformers` to run CLIP ViT-B/32 (q8). For videos, ffmpeg extracts keyframes via scene-change detection, then CLIP embeddings are averaged. The existing `startBackgroundFeatureExtraction()` loop gains a second worker call per file. Feature cache bumps v3->v4 to store `clipVector`. ML model dimension changes from 64 to 576.

**Tech Stack:** `@huggingface/transformers` (includes `onnxruntime-node`), `ffmpeg-static`, existing Vitest + Playwright test infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-05-task-028-clip-semantic-features-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `clip-worker.js` | Create | Web Worker: load CLIP model, extract 512-dim embeddings, handle video keyframe embeddings |
| `media-viewer.js` | Modify | Cache v4 format, CLIP worker lifecycle, background extraction integration, settings toggle, feature concatenation for ML |
| `ml-model.js` | Modify | Update `DEFAULT_FEATURE_DIM` from 64 to 576 |
| `ml-worker.js` | Modify | Update version comment, no logic changes (dim comes from model) |
| `main.js` | Modify | Add IPC handler for ffmpeg keyframe extraction |
| `preload.js` | Modify | Expose `extractKeyframes` IPC bridge |
| `index.html` | Modify | Add CLIP settings toggle in settings panel |
| `eslint.config.mjs` | Modify | Add `clip-worker.js` to worker ESLint block |
| `package.json` | Modify | Add `@huggingface/transformers` and `ffmpeg-static` dependencies |
| `tests/clip-worker.test.js` | Create | Unit tests for CLIP worker message handling and embedding logic |
| `tests/e2e/clip-graceful-degradation.spec.js` | Create | E2E test for offline/disabled CLIP behavior |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [x] **Step 1: Install @huggingface/transformers and ffmpeg-static**

```bash
npm install @huggingface/transformers ffmpeg-static
```

- [x] **Step 2: Verify installation**

```bash
node -e "require('@huggingface/transformers'); console.log('transformers OK')"
node -e "console.log(require('ffmpeg-static'))"
```

Expected: prints path to ffmpeg binary, no errors.

- [x] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @huggingface/transformers and ffmpeg-static for CLIP features"
```

---

## Task 2: Add ffmpeg Keyframe Extraction IPC Handler

**Files:**
- Modify: `main.js:0-17` (add ffmpeg-static require near ffprobe)
- Modify: `main.js` (add IPC handler near existing `probeVideo` handler)
- Modify: `preload.js` (expose `extractKeyframes` bridge)

- [x] **Step 1: Add ffmpeg-static require in main.js**

In `main.js`, after the ffprobe loading block (line 15), add:

```javascript
// ffmpeg for video keyframe extraction
let ffmpegPath;
try {
    ffmpegPath = require('ffmpeg-static');
    console.log('ffmpeg loaded from:', ffmpegPath);
} catch (e) {
    console.warn('ffmpeg-static not available:', e.message);
    ffmpegPath = null;
}
```

- [x] **Step 2: Add extractKeyframes IPC handler in main.js**

Add near the existing `handle('probeVideo', ...)` handler:

```javascript
ipcMain.handle('extractKeyframes', async (_event, videoPath, maxFrames = 20) => {
    if (!ffmpegPath) {
        return { success: false, error: 'ffmpeg not available' };
    }

    const os = require('os');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mv-keyframes-'));

    try {
        // Scene-change detection: extract frames where scene score > 0.3
        const outputPattern = path.join(tempDir, 'frame-%03d.png');
        await execFileAsync(ffmpegPath, [
            '-i', videoPath,
            '-vf', `select='gt(scene,0.3)',setpts=N/FRAME_RATE/TB`,
            '-frames:v', String(maxFrames),
            '-vsync', 'vfr',
            outputPattern,
        ], { timeout: 60000 });

        // Read extracted frames
        const files = await fs.readdir(tempDir);
        const framePaths = files
            .filter((f) => f.endsWith('.png'))
            .sort()
            .map((f) => path.join(tempDir, f));

        // Fallback: if scene detection yielded < 3 frames, sample uniformly
        if (framePaths.length < 3) {
            // Clean up scene-detected frames
            for (const fp of framePaths) {
                await fs.unlink(fp).catch(() => {});
            }

            // Get duration for uniform sampling
            let duration = 10; // default fallback
            if (ffprobePath) {
                try {
                    const probeResult = await execFileAsync(ffprobePath, [
                        '-v', 'error',
                        '-show_entries', 'format=duration',
                        '-of', 'default=noprint_wrappers=1:nokey=1',
                        videoPath,
                    ]);
                    duration = parseFloat(probeResult.stdout.trim()) || 10;
                } catch (_e) {
                    // Use default duration
                }
            }

            // Extract first, middle, last frames
            const timestamps = [0, duration / 2, Math.max(0, duration - 0.1)];
            const fallbackPaths = [];
            for (let idx = 0; idx < timestamps.length; idx++) {
                const outPath = path.join(tempDir, `fallback-${idx}.png`);
                try {
                    await execFileAsync(ffmpegPath, [
                        '-ss', String(timestamps[idx]),
                        '-i', videoPath,
                        '-frames:v', '1',
                        '-q:v', '2',
                        outPath,
                    ], { timeout: 15000 });
                    fallbackPaths.push(outPath);
                } catch (_e) {
                    // Skip failed frame
                }
            }

            return { success: true, framePaths: fallbackPaths, tempDir };
        }

        return { success: true, framePaths, tempDir };
    } catch (error) {
        // Clean up temp dir on error
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return { success: false, error: error.message };
    }
});

ipcMain.handle('cleanupKeyframes', async (_event, tempDir) => {
    try {
        await fs.rm(tempDir, { recursive: true, force: true });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
```

- [x] **Step 3: Expose in preload.js**

Add to the `contextBridge.exposeInMainWorld` block in `preload.js`:

```javascript
extractKeyframes: (videoPath, maxFrames) => ipcRenderer.invoke('extractKeyframes', videoPath, maxFrames),
cleanupKeyframes: (tempDir) => ipcRenderer.invoke('cleanupKeyframes', tempDir),
```

- [x] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no new errors.

- [x] **Step 5: Commit**

```bash
git add main.js preload.js
git commit -m "feat(TASK-028): add ffmpeg keyframe extraction IPC handler"
```

---

## Task 3: Create clip-worker.js

**Files:**
- Create: `clip-worker.js`

- [x] **Step 1: Write the clip-worker.js file**

Note: `clip-worker.js` uses dynamic `import()` for `@huggingface/transformers` (ESM package). The Worker MUST be created as a module worker in media-viewer.js: `new Worker('clip-worker.js', { type: 'module' })`. This is supported in Electron 30+ (Chromium 124+). The CJS export block at the bottom is for unit testing via `createRequire`.

```javascript
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
        const { AutoProcessor, CLIPVisionModelWithProjection } = await import('@huggingface/transformers');

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
        self.postMessage({ type: 'modelError', error: error.message });
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

    const { RawImage } = await import('@huggingface/transformers');

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
                    self.postMessage(
                        { type: 'result', id, embedding: embedding.buffer },
                        [embedding.buffer]
                    );
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
                isLoaded: pipeline !== null || visionModel !== null,
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
```

- [x] **Step 2: Run lint**

```bash
npx eslint clip-worker.js
```

Note: This will fail until Task 8 (ESLint config). Verify no syntax errors by checking the output — `no-undef` errors for `self`/`module` are expected and will be fixed in Task 8.

- [x] **Step 3: Commit**

```bash
git add clip-worker.js
git commit -m "feat(TASK-028): create clip-worker.js for CLIP embedding extraction"
```

---

## Task 4: Write Unit Tests for clip-worker.js

**Files:**
- Create: `tests/clip-worker.test.js`

- [x] **Step 1: Write unit tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Stub Web Worker globals before requiring
const origSelf = globalThis.self;
globalThis.self = { onmessage: null, postMessage: () => {} };

const { averageEmbeddings, CLIP_EMBEDDING_DIM, CLIP_MODEL_ID } = require('../clip-worker');

describe('clip-worker', () => {
    afterEach(() => {
        globalThis.self = origSelf;
    });

    describe('constants', () => {
        it('CLIP_EMBEDDING_DIM is 512', () => {
            expect(CLIP_EMBEDDING_DIM).toBe(512);
        });

        it('CLIP_MODEL_ID is Xenova/clip-vit-base-patch32', () => {
            expect(CLIP_MODEL_ID).toBe('Xenova/clip-vit-base-patch32');
        });
    });

    describe('averageEmbeddings', () => {
        it('returns null for empty array', () => {
            expect(averageEmbeddings([])).toBeNull();
        });

        it('returns the single embedding unchanged for single-element array', () => {
            const emb = new Float32Array(512);
            emb[0] = 0.5;
            emb[1] = 0.8;
            const result = averageEmbeddings([emb]);
            expect(result).toBe(emb); // Same reference
        });

        it('averages two embeddings and normalizes', () => {
            const emb1 = new Float32Array(512).fill(0);
            const emb2 = new Float32Array(512).fill(0);
            emb1[0] = 1.0;
            emb2[0] = 0.0;
            emb2[1] = 1.0;

            const result = averageEmbeddings([emb1, emb2]);

            // Average of [1,0,...] and [0,1,...] = [0.5, 0.5, ...]
            // Then normalized: magnitude = sqrt(0.25 + 0.25) = sqrt(0.5) ~= 0.707
            // result[0] = 0.5 / 0.707 ~= 0.707
            expect(result[0]).toBeCloseTo(0.707, 2);
            expect(result[1]).toBeCloseTo(0.707, 2);
            expect(result[2]).toBeCloseTo(0, 5);
        });

        it('produces unit-length vector', () => {
            const emb1 = new Float32Array(512);
            const emb2 = new Float32Array(512);
            emb1[0] = 0.3;
            emb1[10] = 0.9;
            emb2[0] = 0.7;
            emb2[5] = 0.4;

            const result = averageEmbeddings([emb1, emb2]);

            let norm = 0;
            for (let i = 0; i < 512; i++) {
                norm += result[i] * result[i];
            }
            expect(Math.sqrt(norm)).toBeCloseTo(1.0, 4);
        });

        it('handles three embeddings', () => {
            const embs = [
                new Float32Array(512).fill(0),
                new Float32Array(512).fill(0),
                new Float32Array(512).fill(0),
            ];
            embs[0][0] = 1.0;
            embs[1][0] = 1.0;
            embs[2][0] = 1.0;

            const result = averageEmbeddings(embs);

            // All point in same direction → normalized result[0] should be 1.0
            expect(result[0]).toBeCloseTo(1.0, 4);
        });

        it('returns Float32Array of correct dimension', () => {
            const emb1 = new Float32Array(512).fill(0);
            const emb2 = new Float32Array(512).fill(0);
            emb1[0] = 1;
            emb2[0] = 1;

            const result = averageEmbeddings([emb1, emb2]);
            expect(result).toBeInstanceOf(Float32Array);
            expect(result.length).toBe(512);
        });
    });
});
```

- [x] **Step 2: Run tests to verify they pass**

```bash
npx vitest run tests/clip-worker.test.js
```

Expected: all tests pass. The `averageEmbeddings` function is pure math — no model loading needed.

- [x] **Step 3: Commit**

```bash
git add tests/clip-worker.test.js
git commit -m "test(TASK-028): add unit tests for clip-worker averageEmbeddings"
```

---

## Task 5: Update ML Model Dimension

**Files:**
- Modify: `ml-model.js:4-5`
- Modify: `ml-worker.js:0-2`

- [x] **Step 1: Update DEFAULT_FEATURE_DIM in ml-model.js**

Change line 5 in `ml-model.js`:

```javascript
// Before:
const DEFAULT_FEATURE_DIM = 64;

// After:
const DEFAULT_FEATURE_DIM = 576; // 64 hand-crafted + 512 CLIP semantic
```

Also bump ML_MODEL_VERSION on line 4:

```javascript
// Before:
const ML_MODEL_VERSION = 2;

// After:
const ML_MODEL_VERSION = 3;
```

- [x] **Step 2: Update ml-worker.js comment**

Change lines 0-2 in `ml-worker.js`:

```javascript
// Before:
// ML Worker - Web Worker for preference prediction computations
// Runs ML operations in separate thread to prevent UI freeze
// Version 2: 64-dimensional feature vector support

// After:
// ML Worker - Web Worker for preference prediction computations
// Runs ML operations in separate thread to prevent UI freeze
// Version 3: 576-dimensional feature vector support (64 hand-crafted + 512 CLIP)
```

- [x] **Step 3: Update existing unit tests for new dimension**

In `tests/ml-model.test.js`, find all hardcoded `64` dimension references and update to `576`. Search for `DEFAULT_FEATURE_DIM` and `64` in tests.

Key changes:
- Any test creating `new OnlineLogisticRegression()` without args now gets 576-dim
- Tests that create `new OnlineLogisticRegression(64)` with explicit 64 stay at 64 (they test custom dims)
- Tests that create feature vectors with `new Float32Array(64)` for default model need to change to `new Float32Array(576)`
- The "returns null for dimension mismatch" test should use a non-576 dimension

- [x] **Step 4: Run tests**

```bash
npx vitest run tests/ml-model.test.js
```

Expected: all 36 tests pass with updated dimensions.

- [x] **Step 5: Commit**

```bash
git add ml-model.js ml-worker.js tests/ml-model.test.js
git commit -m "feat(TASK-028): update ML model dimension from 64 to 576 (64+512 CLIP)"
```

---

## Task 6: Update Feature Cache Format v3 -> v4

**Files:**
- Modify: `media-viewer.js:5562` (FEATURE_CACHE_VERSION)
- Modify: `media-viewer.js:5564-5625` (loadFeatureCache)
- Modify: `media-viewer.js:5627-5666` (saveFeatureCache)

- [x] **Step 1: Bump cache version**

At line 5562 in `media-viewer.js`:

```javascript
// Before:
static FEATURE_CACHE_VERSION = 3;

// After:
static FEATURE_CACHE_VERSION = 4;
```

- [x] **Step 2: Update loadFeatureCache() to load clipVector**

In `loadFeatureCache()`, after the existing `featureCache.set()` at line 5616, add CLIP vector loading. Also update the cache file structure expectation.

Replace the loop body (lines 5594-5618) with:

```javascript
for (const [filename, entry] of Object.entries(parsed.features || {})) {
    // Prune: skip files no longer in folder
    const currentFile = currentFiles.get(filename);
    if (!currentFile) continue;

    // Validate dimension (hand-crafted features)
    if (entry.vector?.length !== expectedDim) {
        console.warn(
            `Skipping cached features for ${filename}: wrong dimension (${entry.vector?.length} vs ${expectedDim})`
        );
        continue;
    }

    // Validate size + mtime (skip stale entries)
    if (entry.size !== currentFile.size || entry.mtime !== currentFile.mtimeMs) {
        console.log(
            `Feature cache stale for ${filename}: size ${entry.size}→${currentFile.size}, mtime ${entry.mtime}→${currentFile.mtimeMs}`
        );
        continue;
    }

    const fullPath = await window.electronAPI.path.join(this.baseFolderPath, filename);
    this.featureCache.set(fullPath, new Float32Array(entry.vector));
    this.featureMetadata.set(fullPath, { size: entry.size, mtime: entry.mtime });

    // Load CLIP vector if present
    if (entry.clipVector && entry.clipVector.length === 512) {
        this.clipCache.set(fullPath, new Float32Array(entry.clipVector));
    }
}
```

- [x] **Step 3: Update saveFeatureCache() to save clipVector**

In `saveFeatureCache()`, update the features object construction (lines 5638-5652) to include clipVector:

```javascript
for (const [fullPath, featureArray] of this.featureCache.entries()) {
    const filename = await window.electronAPI.path.basename(fullPath);
    const meta = this.featureMetadata.get(fullPath);
    const clipVector = this.clipCache.get(fullPath);

    if (meta) {
        features[filename] = {
            vector: Array.from(featureArray),
            clipVector: clipVector ? Array.from(clipVector) : null,
            size: meta.size,
            mtime: meta.mtime,
        };
    } else {
        const fileInfo = this.mediaFiles.find((f) => f.path === fullPath);
        features[filename] = {
            vector: Array.from(featureArray),
            clipVector: clipVector ? Array.from(clipVector) : null,
            size: fileInfo?.size || 0,
            mtime: fileInfo?.mtimeMs || 0,
        };
    }
}
```

Also update the JSON structure to reflect new dim info:

```javascript
await window.electronAPI.writeFile(
    cacheFile,
    JSON.stringify({
        version: MediaViewer.FEATURE_CACHE_VERSION,
        featureDim: 64,
        clipDim: 512,
        features,
    })
);
```

- [x] **Step 4: Initialize clipCache in constructor**

Find the constructor section where `this.featureCache = new Map()` is initialized and add:

```javascript
this.clipCache = new Map();
```

- [x] **Step 5: Update removeFileFromList() to clean clipCache**

Find `removeFileFromList()` where `featureCache`, `predictionScores`, etc. are deleted. Add:

```javascript
this.clipCache.delete(removedFile.path);
```

- [x] **Step 6: Run tests**

```bash
npm test
```

Expected: all tests pass (cache format change doesn't affect existing unit tests since they don't test the cache directly).

- [x] **Step 7: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-028): update feature cache format v3->v4 with clipVector field"
```

---

## Task 7: Add CLIP Settings Toggle

**Files:**
- Modify: `index.html:279-341` (settings panel)
- Modify: `media-viewer.js` (constructor, settings wiring)

- [x] **Step 1: Add toggle HTML in index.html**

In `index.html`, inside the `.settings-grid` div, after the `featureWorkerCountInput` label (around line 302), add:

```html
<label class="setting-item">
    <input type="checkbox" id="clipFeaturesToggle" checked />
    <span>Enable CLIP semantic features (512-dim, ~87 MB model)</span>
</label>
```

- [x] **Step 2: Wire toggle in media-viewer.js constructor**

Find where other settings toggles are loaded from localStorage in the constructor (near `showRatingConfirmations`, `autoCloseErrors`, etc.). Add:

```javascript
this.enableClipFeatures = localStorage.getItem('enableClipFeatures') !== 'false'; // default ON
```

Find where settings change listeners are attached (near other toggle listeners). Add:

```javascript
const clipToggle = document.getElementById('clipFeaturesToggle');
if (clipToggle) {
    clipToggle.checked = this.enableClipFeatures;
    clipToggle.addEventListener('change', () => {
        this.enableClipFeatures = clipToggle.checked;
        localStorage.setItem('enableClipFeatures', clipToggle.checked);
    });
}
```

- [x] **Step 3: Run the app to verify toggle appears**

```bash
npm start
```

Press F1 to open help/settings panel. Verify "Enable CLIP semantic features" toggle appears and persists across restarts.

- [x] **Step 4: Commit**

```bash
git add index.html media-viewer.js
git commit -m "feat(TASK-028): add CLIP semantic features settings toggle"
```

---

## Task 8: Integrate CLIP Worker into Background Extraction

**Files:**
- Modify: `media-viewer.js` (CLIP worker lifecycle, extraction loop, feature concatenation)

This is the largest task — it wires everything together.

- [x] **Step 1: Add CLIP worker initialization**

Find where `featureWorkers` are created (search for `new Worker('feature-worker.js')`). Near that code, add CLIP worker initialization:

```javascript
// Initialize CLIP worker (single worker — model is heavy)
this.clipWorker = null;
this.clipWorkerReady = false;
this.clipModelDownloading = false;

if (this.enableClipFeatures) {
    this.initClipWorker();
}
```

Add the `initClipWorker()` method:

```javascript
initClipWorker() {
    try {
        this.clipWorker = new Worker('clip-worker.js', { type: 'module' });
        this.clipWorker.onmessage = (e) => this.handleClipWorkerMessage(e);
        this.clipWorker.onerror = (err) => {
            console.error('CLIP worker error:', err.message);
            this.clipWorkerReady = false;
        };
        // Trigger model loading
        this.clipWorker.postMessage({ type: 'loadModel' });
    } catch (err) {
        console.warn('Failed to create CLIP worker:', err.message);
        this.clipWorker = null;
    }
}

handleClipWorkerMessage(e) {
    const { type } = e.data;

    switch (type) {
        case 'modelReady':
            this.clipWorkerReady = true;
            this.clipModelDownloading = false;
            this.showNotification('CLIP model loaded', 'success');
            break;

        case 'modelError':
            this.clipWorkerReady = false;
            this.clipModelDownloading = false;
            console.error('CLIP model failed to load:', e.data.error);
            this.showNotification('CLIP model unavailable — using basic features only', 'warning');
            break;

        case 'downloadProgress':
            this.clipModelDownloading = true;
            if (e.data.progress % 10 === 0) {
                this.showNotification(
                    `Downloading CLIP model... ${e.data.progress}%`,
                    'info'
                );
            }
            break;

        default:
            // result, batchResult, error — handled via pending promise callbacks
            break;
    }
}
```

- [x] **Step 2: Add CLIP extraction helper method**

```javascript
/**
 * Extract CLIP embedding for a single file.
 * For images: extract directly. For videos: extract keyframes then average.
 * @param {string} filePath - Path to the media file
 * @param {ImageData|null} imageData - Pre-loaded image data (for images)
 * @returns {Promise<Float32Array|null>} 512-dim CLIP embedding or null
 */
async extractClipEmbedding(filePath, imageData = null) {
    if (!this.clipWorker || !this.clipWorkerReady || !this.enableClipFeatures) {
        return null;
    }

    const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);

    if (isVideo) {
        return this.extractClipFromVideo(filePath);
    }

    // For images: use provided imageData or load it
    if (!imageData) {
        try {
            imageData = await this.loadMediaAsImageData(filePath);
        } catch (err) {
            console.warn('Failed to load image for CLIP:', err.message);
            return null;
        }
    }

    return new Promise((resolve) => {
        const id = `clip-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
            resolve(null);
        }, 30000);

        const handler = (e) => {
            if (e.data.id !== id) return;
            clearTimeout(timeout);
            this.clipWorker.removeEventListener('message', handler);

            if (e.data.type === 'result') {
                resolve(new Float32Array(e.data.embedding));
            } else {
                console.warn('CLIP extraction error:', e.data.error);
                resolve(null);
            }
        };

        this.clipWorker.addEventListener('message', handler);
        this.clipWorker.postMessage({
            type: 'extract',
            data: {
                id,
                pixelData: imageData.data,
                width: imageData.width,
                height: imageData.height,
            },
        });
    });
}
```

- [x] **Step 3: Add video CLIP extraction method**

```javascript
/**
 * Extract CLIP embedding from video by extracting keyframes and averaging.
 * @param {string} filePath - Path to video file
 * @returns {Promise<Float32Array|null>} Averaged 512-dim embedding or null
 */
async extractClipFromVideo(filePath) {
    if (!window.electronAPI.extractKeyframes) return null;

    try {
        const result = await window.electronAPI.extractKeyframes(filePath, 20);
        if (!result.success || !result.framePaths || result.framePaths.length === 0) {
            return null;
        }

        // Load each keyframe as ImageData
        const frames = [];
        for (const framePath of result.framePaths) {
            try {
                const imgData = await this.loadMediaAsImageData(framePath);
                frames.push({
                    pixelData: imgData.data,
                    width: imgData.width,
                    height: imgData.height,
                });
            } catch (err) {
                console.warn(`Failed to load keyframe ${framePath}:`, err.message);
            }
        }

        // Clean up temp files
        if (result.tempDir) {
            window.electronAPI.cleanupKeyframes(result.tempDir).catch(() => {});
        }

        if (frames.length === 0) return null;

        // Send batch to CLIP worker for averaged embedding
        return new Promise((resolve) => {
            const id = `clip-video-${Date.now()}-${Math.random()}`;
            const timeout = setTimeout(() => resolve(null), 120000); // 2min for video

            const handler = (e) => {
                if (e.data.id !== id) return;
                clearTimeout(timeout);
                this.clipWorker.removeEventListener('message', handler);

                if (e.data.type === 'batchResult') {
                    resolve(new Float32Array(e.data.embedding));
                } else {
                    resolve(null);
                }
            };

            this.clipWorker.addEventListener('message', handler);
            this.clipWorker.postMessage({
                type: 'extractBatch',
                data: { id, frames },
            });
        });
    } catch (err) {
        console.warn('Video CLIP extraction failed:', err.message);
        return null;
    }
}
```

- [x] **Step 4: Integrate into startBackgroundFeatureExtraction()**

In `startBackgroundFeatureExtraction()` (line 6623), modify the inner loop to also extract CLIP embeddings. After the existing `enqueueFeatureExtraction()` call (line 6681), add CLIP extraction:

Replace the inner `for` loop body (lines 6673-6698) with:

```javascript
for (const { file, index } of batch) {
    if (this.backgroundExtractionAbort?.signal.aborted) {
        break;
    }

    try {
        const imageData = await this.loadMediaAsImageData(file.path);
        const priority = this.calculateFeaturePriority(index);

        // Extract hand-crafted features (existing)
        const featurePromise = this.enqueueFeatureExtraction(file.path, imageData, priority)
            .then(() => {
                if (this.extractionRunId !== runId) return;
            })
            .catch((err) => {
                if (this.extractionRunId !== runId) return;
                console.warn(`Feature extraction failed for ${file.name}:`, err.message);
            });

        // Extract CLIP embedding (new, parallel with feature extraction)
        const clipPromise = this.extractClipEmbedding(file.path, imageData)
            .then((clipVector) => {
                if (this.extractionRunId !== runId) return;
                if (clipVector) {
                    this.clipCache.set(file.path, clipVector);
                    this.featureCacheDirty = true;
                }
            })
            .catch((err) => {
                if (this.extractionRunId !== runId) return;
                console.warn(`CLIP extraction failed for ${file.name}:`, err.message);
            });

        // Wait for both, then update progress
        const combinedPromise = Promise.all([featurePromise, clipPromise]).then(() => {
            if (this.extractionRunId !== runId) return;
            completedCount++;
            this.recordExtractionCompletion(completedCount, totalCount);
        });

        promises.push(combinedPromise);
    } catch (err) {
        console.warn(`Failed to load ${file.name}:`, err.message);
        completedCount++;
        this.showBackgroundExtractionProgress(completedCount, totalCount);
    }
}
```

- [x] **Step 5: Update filter to check both caches**

In the same function, update the `filesToProcess` filter (line 6640) to check whether both hand-crafted and CLIP features are cached:

```javascript
// Before:
.filter(({ file }) => !this.featureCache.has(file.path));

// After:
.filter(({ file }) => {
    const hasFeatures = this.featureCache.has(file.path);
    const hasClip = !this.enableClipFeatures || this.clipCache.has(file.path);
    return !hasFeatures || !hasClip;
});
```

- [x] **Step 6: Run the app and test background extraction**

```bash
npm start
```

Open a folder with images. Verify:
- Progress pill shows extraction progress
- No crashes or console errors
- CLIP model download notification appears on first run

- [x] **Step 7: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-028): integrate CLIP worker into background extraction loop"
```

---

## Task 9: Concatenate Features for ML Pipeline

**Files:**
- Modify: `media-viewer.js` (requestPredictionScores, update calls, trainFromHistoricalRatings)

- [x] **Step 1: Add feature concatenation helper**

Add this method to the MediaViewer class:

```javascript
/**
 * Build combined feature vector (64 hand-crafted + 512 CLIP = 576-dim).
 * If CLIP is unavailable for a file, zero-pads the CLIP portion.
 * @param {string} filePath - File path to look up in caches
 * @returns {number[]|null} 576-dim array or null if no features at all
 */
getCombinedFeatures(filePath) {
    const features = this.featureCache.get(filePath);
    if (!features) return null;

    const combined = new Float32Array(576);
    combined.set(features, 0); // First 64 dims: hand-crafted

    const clipVector = this.clipCache.get(filePath);
    if (clipVector) {
        combined.set(clipVector, 64); // Dims 64-575: CLIP
    }
    // Otherwise dims 64-575 remain zero (graceful degradation)

    return Array.from(combined);
}
```

- [x] **Step 2: Update requestPredictionScores()**

At line 5924, replace the feature-gathering loop:

```javascript
// Before:
for (const file of this.mediaFiles) {
    const features = this.featureCache.get(file.path);
    if (features) {
        allFeatures[file.name] = Array.from(features);
    }
}

// After:
for (const file of this.mediaFiles) {
    const combined = this.getCombinedFeatures(file.path);
    if (combined) {
        allFeatures[file.name] = combined;
    }
}
```

- [x] **Step 3: Update ML update calls (rating a file)**

Find the two `type: 'update'` postMessage calls (around lines 6166-6170 and 6193-6197). Update both to use combined features:

```javascript
// Before:
this.mlWorker.postMessage({
    type: 'update',
    data: {
        features: Array.from(features),
        label: actionType === 'like' ? 1 : 0,
    },
});

// After:
const combinedFeatures = this.getCombinedFeatures(currentFile.path);
if (combinedFeatures) {
    this.mlWorker.postMessage({
        type: 'update',
        data: {
            features: combinedFeatures,
            label: actionType === 'like' ? 1 : 0,
        },
    });
}
```

Note: Need to identify the `currentFile` from context at each call site. Look at how `features` is obtained before each call — it comes from `this.featureCache.get()`. Replace that lookup chain with `getCombinedFeatures()`.

- [x] **Step 4: Update trainFromHistoricalRatings()**

In `trainFromHistoricalRatings()` (line 5825), the `computeFeatures()` calls produce 64-dim vectors. These need to also run CLIP. Update the feature extraction loops:

```javascript
// For liked files (lines 5853-5865):
for (let i = 0; i < likedFiles.length; i++) {
    const file = likedFiles[i];
    try {
        const features = await this.computeFeatures(file.path);
        const clipVector = await this.extractClipEmbedding(file.path);

        const combined = new Float32Array(576);
        combined.set(features, 0);
        if (clipVector) combined.set(clipVector, 64);

        likedFeatures.push(Array.from(combined));

        if ((i + 1) % 10 === 0) {
            this.updateProgressNotification(`Processing likes: ${i + 1}/${likedFiles.length}`);
        }
    } catch (err) {
        console.warn(`Skipping ${file.name}:`, err.message);
    }
}

// Same pattern for disliked files (lines 5868-5880)
```

- [x] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass. ML model tests use 576-dim (from Task 5). The feature concatenation is straightforward array ops.

- [x] **Step 6: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-028): concatenate 64+512 features for ML prediction pipeline"
```

---

## Task 10: Update ESLint Config

**Files:**
- Modify: `eslint.config.mjs` (add new block for clip-worker.js)

- [x] **Step 1: Add clip-worker.js ESLint block**

`clip-worker.js` is a module worker (uses dynamic `import()` and CJS exports for testing). Add a new block after block 3a:

```javascript
// 3c. CLIP Worker (module worker — dynamic import + conditional CJS exports for testing)
{
    files: ['clip-worker.js'],
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
        globals: {
            ...globals.worker,
            module: 'readonly',
        },
    },
    rules: {
        ...sharedRules,
        'no-undef': 'error',
    },
},
```

- [x] **Step 2: Run full lint**

```bash
npm run lint
```

Expected: no errors. `clip-worker.js` now recognized as a worker file with proper globals.

- [x] **Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore(TASK-028): add clip-worker.js to ESLint worker config block"
```

---

## Task 11: E2E Test — Graceful Degradation

**Files:**
- Create: `tests/e2e/clip-graceful-degradation.spec.js`

- [x] **Step 1: Write E2E test for CLIP disabled via settings**

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, loadFolder, createTempFixtureDir, seedLocalStorage } = require('./helpers/electron-app');

test.describe('CLIP graceful degradation', () => {
    let electronApp, page;

    test.afterEach(async () => {
        await closeApp(electronApp);
    });

    test('app works normally with CLIP features disabled', async () => {
        const fixtureDir = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());

        // Disable CLIP features
        await seedLocalStorage(page, { enableClipFeatures: 'false' });
        await loadFolder(electronApp, page, fixtureDir);

        // Verify media loads normally
        const mediaContainer = page.locator('.media-container');
        await expect(mediaContainer).toBeVisible();

        // Verify no CLIP-related errors in console
        const errors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error' && msg.text().includes('CLIP')) {
                errors.push(msg.text());
            }
        });

        // Navigate through files
        await page.keyboard.press('d');
        await page.waitForTimeout(500);

        expect(errors).toHaveLength(0);
    });

    test('app starts with CLIP enabled by default', async () => {
        const fixtureDir = await createTempFixtureDir();
        ({ electronApp, page } = await launchApp());
        await loadFolder(electronApp, page, fixtureDir);

        // Check that enableClipFeatures defaults to true
        const clipEnabled = await page.evaluate(() => {
            return window.mediaViewer?.enableClipFeatures;
        });
        expect(clipEnabled).toBe(true);
    });
});
```

- [x] **Step 2: Run E2E tests**

```bash
npm run test:e2e
```

Expected: all E2E tests pass including the new ones.

- [x] **Step 3: Commit**

```bash
git add tests/e2e/clip-graceful-degradation.spec.js
git commit -m "test(TASK-028): add E2E tests for CLIP graceful degradation"
```

---

## Task 12: Documentation & Final Verification

**Files:**
- Modify: `docs/planning/TODO.md` (move TASK-028 to In Progress)

- [x] **Step 1: Run full test suite**

```bash
npm test && npm run test:e2e
```

Expected: all unit and E2E tests pass.

- [x] **Step 2: Run lint and format**

```bash
npm run lint && npm run format:check
```

Expected: clean output.

- [x] **Step 3: Manual testing**

1. Start the app: `npm start`
2. Open a folder with mixed media (images + videos)
3. Verify CLIP model download progress notification on first run
4. Verify background extraction completes without errors
5. Rate several files (like/dislike) and verify ML predictions update
6. Toggle CLIP off in settings, reload folder — verify extraction works with 64-dim only
7. Check `.feature_cache.json` in the folder — verify v4 format with `clipVector` fields

- [x] **Step 4: Update TODO.md**

Move TASK-028 to In Progress section if not already done.

- [x] **Step 5: Commit documentation**

```bash
git add docs/planning/TODO.md
git commit -m "docs(TASK-028): update task status to in progress"
```
