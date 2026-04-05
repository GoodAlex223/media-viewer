# TASK-028: CLIP Semantic Features for ML Prediction

**Date:** 2026-04-05
**Status:** Design approved
**Priority:** Normal (research + implementation)
**Origin:** Manual testing 2026-03-19

---

## Problem

The current ML prediction pipeline uses a 64-dimensional hand-crafted feature vector (color histograms, texture, metadata, face detection) fed into an online logistic regression model. These features capture visual statistics but have no understanding of *what is depicted* in the media. A beach photo and a blue wall might score similarly because both are blue — but semantically they're completely different.

Adding semantic content understanding would let the model learn preferences like "I like photos of cats" or "I dislike screenshots of text" rather than just "I like blue, high-contrast images."

## Solution

Integrate OpenAI's CLIP (Contrastive Language-Image Pre-training) model via Hugging Face's Transformers.js library. CLIP produces 512-dimensional semantic embeddings that capture what's in an image — objects, scenes, styles, moods — in a way that pure statistical features cannot.

## Requirements

- **Goal:** Improve ML prediction quality by adding 512-dim CLIP semantic embeddings to the existing 64-dim feature vector
- **Content types:** Mixed (photos, memes, screenshots, art, videos)
- **Speed:** Accuracy over speed — background extraction at ~100ms/image is acceptable
- **Model size:** No constraints — ~87 MB quantized model is fine
- **Privacy:** All processing local, no cloud APIs
- **Video:** Extract as many keyframes as needed via scene-change detection

---

## Architecture

### New Component: `clip-worker.js`

A dedicated Web Worker (following the existing pattern from `feature-worker.js` / `ml-worker.js`). Loads Transformers.js, downloads/caches the CLIP model on first use, and exposes extract-embedding messages.

### Data Flow

```
Image/Video file
    |
    +-- [Image] --> clip-worker.js --> 512-dim Float32Array (CLIP embedding)
    |                                        |
    +-- [Video] --> ffmpeg keyframes --> clip-worker.js per frame --> averaged 512-dim embedding
    |                                        |
    +-- [Existing] feature-worker.js --> 64-dim Float32Array (hand-crafted features)
    |                                        |
    v                                        v
    Concatenated 576-dim vector --> ml-worker.js (logistic regression)
```

### Key Architecture Points

- CLIP worker runs alongside the existing feature worker during background extraction
- Both extractions happen in parallel per file (independent workers)
- ML model input dimension grows from 64 to 576 (64 hand-crafted + 512 CLIP)
- Hand-crafted features stay — they capture things CLIP doesn't (file metadata, aspect ratio, face count, video bitrate). The two vectors are complementary.

### Model Lifecycle

- **First run:** Transformers.js auto-downloads CLIP ViT-B/32 (q8, ~87 MB) to `~/.cache/huggingface/`
- **Subsequent runs:** loads from local cache, no network needed
- **Progress callback** to UI during initial download via notification system

---

## Video Keyframe Extraction

### Strategy

Extract keyframes using ffmpeg with scene-change detection rather than fixed-interval sampling.

### Algorithm

1. Get video duration and fps via ffprobe (already used in the app)
2. Extract frames at scene changes using ffmpeg's `select='gt(scene,0.3)'` filter — detects visual transitions
3. **Fallback:** if scene detection yields < 3 frames, sample uniformly (first, middle, last)
4. **Cap:** max ~20 keyframes per video (diminishing returns beyond that)
5. Run CLIP on each keyframe, **average all embeddings** into a single 512-dim vector

### Why Scene-Change Detection

- A 10-second clip might have 1 scene; a 2-minute clip might have 30 cuts
- Adapts naturally — more frames where content changes, fewer where it's static
- Avoids wasting time on duplicate frames from still segments

### Temporary Files

Keyframes extracted to OS temp dir, cleaned up immediately after CLIP processing. No permanent frame storage.

---

## ML Model Integration

### Feature Vector Concatenation

- Current: `Float32Array(64)` --> `OnlineLogisticRegression(dim=64)`
- New: `Float32Array(64) + Float32Array(512)` --> `OnlineLogisticRegression(dim=576)`
- The `OnlineLogisticRegression` constructor already accepts configurable `dim` — change from 64 to 576

### Cache Migration (v3 -> v4)

| Field | v3 (current) | v4 (new) |
|-------|-------------|----------|
| `vector` | `Float32Array(64)` | `Float32Array(64)` |
| `clipVector` | n/a | `Float32Array(512)` or `null` |
| `size` | number | number |
| `mtime` | number | number |

- Bump `FEATURE_CACHE_VERSION` 3->4 (auto-invalidates old caches, existing behavior)
- Files with only hand-crafted features (CLIP not yet extracted) store `clipVector: null`
- ML model uses zero-padded 512-dim for files where CLIP hasn't run yet

### ML Model Retraining

- Folder with v3 cache -> full re-extraction triggered (same as v2->v3 migration)
- Trained model auto-resets on dimension mismatch (64->576) — already handled in `ml-model.js` via version/dim check in `fromJSON`
- Historical ratings re-train from files in like/dislike folders using new 576-dim features

### Graceful Degradation

- CLIP model download fails (offline, disk full): app works normally with 64-dim features, no crash
- CLIP extraction is optional — logistic regression handles zero-padded dimensions for unprocessed files

---

## UX & Progress Feedback

### Model Download (First Run)

- Progress notification: "Downloading CLIP model (87 MB)... 45%" via existing notification system
- Download triggered lazily on first folder load, not on app startup
- Download failure: error notification, continue with hand-crafted features only

### Background Extraction

- Existing progress pill unchanged: "Extracting features... 12/150"
- CLIP extraction runs as part of same background extraction loop (second worker call per file)
- ETA calculation (TASK-010) naturally accounts for slower per-file time
- Pause-on-navigation (TASK-011) applies via same `awaitExtractionGate()` mechanism

### Settings Panel

- New toggle: "Enable CLIP semantic features" (default: ON)
- When disabled: skip CLIP extraction entirely, ML model uses 64-dim only
- Allows opt-out on very slow machines without losing existing functionality

### No New UI Surfaces

This is purely a behind-the-scenes improvement to ML prediction quality. No tags, labels, or search UI in this task scope.

---

## Dependencies

### New npm Dependencies

| Package | Purpose | Size Impact |
|---------|---------|-------------|
| `@huggingface/transformers` | CLIP model loading, tokenization, inference | Pulls in `onnxruntime-node` (~150 MB native binaries) |
| `ffmpeg-static` | ffmpeg binary for keyframe extraction | ~70-100 MB platform-specific binary |

### Platform Support

- `onnxruntime-node`: Windows (x64/arm64), macOS (x64/arm64), Linux (x64/arm64)
- CPU-only inference with WASM/SIMD acceleration, no GPU required
- Model cache: `~/.cache/huggingface/` (cross-platform, user-writable)

---

## Scope Boundaries

### In Scope

- CLIP embedding extraction (images + video keyframes)
- Feature vector concatenation (64 + 512 = 576-dim)
- ML model dimension upgrade
- Cache format migration v3->v4
- Settings toggle for CLIP features
- Model download progress UI
- Graceful degradation when CLIP unavailable

### NOT In Scope (Future Tasks)

- Text-based search ("find photos of dogs") — embeddings enable it but UI is separate
- Replacing blockhash similarity sorting with CLIP embeddings
- Replacing hand-crafted features entirely
- CLIP model fine-tuning
- SigLIP/MobileCLIP as alternative models (could be a settings option later)

---

## Testing

- **Unit tests:** Mock Transformers.js pipeline, verify embedding concatenation, cache format v4, zero-padding for missing CLIP vectors, keyframe count logic
- **E2E:** Verify graceful degradation when model unavailable (offline mode), settings toggle behavior
- **Manual:** Compare ML prediction accuracy before/after on a real media folder

---

## Research Findings Summary

| Model | Size (q8) | Output | Dims | CPU Speed | JS Ready? |
|-------|-----------|--------|------|-----------|-----------|
| **CLIP ViT-B/32** | ~87 MB | embeddings | 512 | ~100ms | YES (Transformers.js) |
| SigLIP-base | ~90 MB | embeddings | 768 | ~120ms | YES |
| MobileCLIP-S0 | ~30 MB | embeddings | 512 | ~40ms | YES |
| MobileNet (TF.js) | ~16 MB | labels | 1000 classes | ~12ms | YES |
| Florence-2-base | ~450 MB | text/boxes | n/a | ~3-5s | YES |
| BLIP-2 / LLaVA | 3-13 GB | text | n/a | too slow | NO |

**Selected: CLIP ViT-B/32 (q8)** — best balance of semantic quality, inference speed, and JS ecosystem support.
