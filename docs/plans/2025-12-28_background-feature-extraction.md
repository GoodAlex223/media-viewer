# Plan: Background Feature Extraction with Worker Pool

**Date**: 2025-12-28
**Status**: Complete

---

## 1. Problem Statement

Feature extraction for ML prediction was slow and blocked the UI. Solution implemented:

1. Move CPU-intensive feature computation to Web Workers
2. Pre-extract features in background after folder load
3. Prioritize nearby files for better UX during navigation

---

## 2. Architecture

```
Main Thread (DOM access)              Workers (CPU-intensive)
┌─────────────────────────┐           ┌──────────────────────┐
│ loadMediaAsImageData()  │──pixels──▶│ Feature Worker 1     │
│   - Load image/video    │           │ Feature Worker 2     │
│   - Draw to 256x256     │           │ Feature Worker 3     │
│   - Extract ImageData   │           │ Feature Worker 4     │
│                         │◀─features─│                      │
│ Worker Pool Manager     │           └──────────────────────┘
│   - Priority queue      │
│   - Worker dispatch     │
│   - Auto-save cache     │
└─────────────────────────┘
```

**Key Constraint**: Workers cannot access DOM. Solution:

- Main thread loads media and extracts pixel data
- Workers receive pixels and compute features (histograms, k-means, edges)

---

## 3. Files Created/Modified

| File | Action | Key Changes |
|------|--------|-------------|
| `feature-worker.js` | CREATE | Worker with importScripts, extract/batch handlers |
| `media-viewer.js` | MODIFY | Worker pool, background extraction, UI indicator |

---

## 4. Key Methods Added

### feature-worker.js

- `handleExtract()` - Single file extraction
- `handleBatch()` - Batch extraction with progress

### media-viewer.js

- `initializeFeaturePool()` - Create 4 workers on app start
- `shutdownFeaturePool()` - Terminate workers, reject pending
- `handleFeatureWorkerMessage()` - Process results, cache features
- `handleFeatureWorkerError()` - Respawn crashed workers
- `calculateFeaturePriority()` - Distance from currentIndex
- `enqueueFeatureExtraction()` - Add to priority queue
- `dispatchNextFeatureTask()` - Assign to available worker
- `cancelPendingFeatureExtractions()` - Clear queue
- `loadMediaAsImageData()` - Extract 256x256 frame from media
- `startBackgroundFeatureExtraction()` - Main entry point
- `cancelBackgroundExtraction()` - Stop ongoing extraction
- `showBackgroundExtractionProgress()` - Subtle UI indicator
- `hideBackgroundExtractionProgress()` - Remove indicator
- `startFeatureCacheAutoSave()` - 30-second interval
- `stopFeatureCacheAutoSave()` - Clear interval

---

## 5. Priority Algorithm

```javascript
// Lower value = higher priority
// Files near current viewing position extracted first
priority = Math.abs(fileIndex - currentIndex) * 2 + (fileIndex < currentIndex ? 1 : 0)
```

---

## 6. Integration Points

1. **Constructor**: Added worker pool state properties
2. **initializeFeaturePool()**: Called after `initializeMlWorker()` in constructor
3. **loadFolder()**: Calls `startBackgroundFeatureExtraction()` after ML init
4. **loadFolder()**: Calls `cancelBackgroundExtraction()` when resetting state

---

## 7. UI Indicator

Subtle progress indicator in bottom-left corner:

- Shows spinning icon + "Extracting features: X/Y (Z%)"
- Auto-hides when complete
- Non-intrusive, doesn't block interaction

---

## 8. Risk Mitigations Implemented

| Risk | Mitigation |
|------|------------|
| Worker crash | Respawn worker, retry task (max 2) |
| Memory pressure | Batch 10 files, process sequentially |
| Folder change mid-extraction | AbortController, clear queue |
| Cache not saved | Auto-save every 30 seconds when dirty |

---

## 9. Execution Log

#### [2025-12-28] — PHASE: Planning

- Analyzed current feature extraction flow
- Identified DOM constraint requiring hybrid approach
- Designed worker pool architecture

#### [2025-12-28] — PHASE: Implementation

- Created `feature-worker.js` with extract/batch handlers
- Added worker pool state properties in constructor
- Implemented worker pool management methods
- Added background extraction with priority queue
- Added subtle UI progress indicator
- Integrated with `loadFolder()` lifecycle
- Added auto-save cache functionality

#### [2025-12-28] — PHASE: Complete

- Syntax validation passed for both files
- All methods integrated into existing workflow

**Results obtained:**

- Background feature extraction with 4-worker pool
- Priority-based extraction (nearby files first)
- Non-blocking UI during extraction
- Automatic cache save every 30 seconds
- Worker crash recovery with respawn

#### [2025-12-28] — PHASE: Bug Fixes

- Fixed duplicate progress bars issue (requestPredictionScores now only uses cached features)
- Changed extraction trigger: now only starts when user clicks "Sort by Predicted" button
- Fixed scoring progress notification not clearing after completion
- Fixed prediction badge overlapping info icon (moved to top: 130px)
- Fixed compare mode navigation (was calling undefined `showComparePair()`)
- Fixed ML compare mode: left=highest score, right=lowest score
- Fixed prediction badges not showing in compare mode:
  - Added distinct classes `left-media-wrapper` and `right-media-wrapper`
  - Updated `updatePredictionBadges()` to use `compareLeftFile`/`compareRightFile` references
- Fixed single mode badge persisting in compare mode:
  - Added `hidePredictionBadges()` call in `toggleViewMode()`
  - Updated `updatePredictionBadges()` to explicitly hide other mode's badges
- Fixed ML compare mode navigation not working:
  - Added `mlComparePairIndex` property to track which pair to show
  - Updated `nextMedia()`/`previousMedia()` to change pair index in ML mode
  - Updated `showCompareMedia()` to use pair index (0=highest vs lowest, 1=2nd highest vs 2nd lowest, etc.)
  - Reset pair index to 0 after rating (in `moveComparePair()`)
- Reduced pair loading delay after rating from 300ms to 100ms
- Fixed loading errors when restoring order:
  - Filter `originalMediaFiles` to only include files still in `mediaFiles`
  - Prevents errors from trying to load moved/rated files
- Changed ML training to only happen on button click:
  - Removed `trainFromHistoricalRatings()` from `loadFolder()`
  - Added `trainFromHistoricalRatingsAndWait()` with promise-based waiting
  - Training now triggers in `handleSortByPrediction()` before sorting
- Fixed ML features only active after sorting applied:
  - Changed conditions from `isMlEnabled && predictionScores.size >= 2` to `isSortedByPrediction`
  - Updated `nextMedia()`/`previousMedia()` to use regular navigation before sorting
  - Updated `showCompareMedia()` to show consecutive pairs before sorting
  - Updated `updateNavigationInfo()` to show file indices before sorting
  - Updated `updatePredictionBadges()` to hide badges before sorting applied
- Fixed undo showing wrong pair in ML-sorted compare mode:
  - `handleCancel()` now calculates correct `mlComparePairIndex` after restoring files
  - Finds restored file's position in score-sorted list and sets pair index accordingly
- Added ML model undo functionality:
  - `reverseUpdate()` method in ml-model.js reverses gradient updates
  - `reverseUpdateModel()` handler in ml-worker.js
  - `reverseMlModelUpdate()` in media-viewer.js
  - Move history now stores `mlFeatures` for each rating
  - `handleCancel()` calls `reverseMlModelUpdate()` to undo ML learning
- Fixed undo showing wrong/duplicate files in ML-sorted compare mode:
  - Added `_restoredPairFiles` flag to store exact restored files
  - `showCompareMedia()` checks this flag first and displays exact restored pair
  - Bypasses ML pair selection for restored files

**Results obtained:**

- Background extraction only runs on user request (Sort by Predicted button)
- Compare mode correctly shows highest-scored file on left, lowest on right
- Prediction badges display correctly in both single and compare modes
- Navigation works in ML compare mode (shows different pairs)
- Faster pair transitions after rating
- Restore order works correctly even after rating files
- Compare mode uses regular consecutive order before AI sorting is applied
- Percentage indicators hidden until sorting is applied
- Undo in ML-sorted compare mode correctly shows the restored pair

**Improvements identified:**

1. Could add setting to configure worker count
2. Could pause extraction when user is actively navigating
3. Could show estimated time remaining
