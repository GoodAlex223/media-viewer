# Compare Mode AI Sort Bug Fix

**Date**: 2026-01-02
**Status**: Complete

## Problem Description

When sorting by AI in Compare Mode, media that has already been rated is sometimes displayed, even though the media information shows different media.

## Analysis

### Root Cause 1: Wrong file selection in onLoad handlers

In `setupCompareImageHandlers()` (line 2241) and `setupCompareVideoHandlers()` (line 2295), the `onLoad`/`onLoadedMetadata` handlers call `updateCompareFileInfo()` with files from `currentIndex`:

```javascript
// Lines 2249-2252 and 2303-2306
if (this.mediaFiles.length >= 2 && this.currentIndex + 1 < this.mediaFiles.length) {
    const leftFile = this.mediaFiles[this.currentIndex];
    const rightFile = this.mediaFiles[this.currentIndex + 1];
    this.updateCompareFileInfo(leftFile, rightFile);
}
```

**The Bug**: When sorted by AI prediction, the displayed files are NOT at `currentIndex` and `currentIndex + 1`. They are selected based on `mlComparePairIndex` from a score-sorted list (see lines 2088-2111). This causes a mismatch between:
- Visual display: Correct files from AI-sorted selection
- File info: Wrong files from `currentIndex` positions

### Root Cause 2: Stale prediction scores not cleaned up

When files are removed from `mediaFiles` (after rating), their entries in `predictionScores` and `featureCache` are not removed:
- Line 1039: Single mode file removal
- Lines 3115-3116: Compare mode pair removal

While this doesn't directly cause wrong file display (since selection iterates over `mediaFiles`), it:
- Wastes memory
- Can cause `predictionScores.size >= 2` check to pass incorrectly
- May cause confusion in edge cases

## Solution

### Fix 1: Use stored file references in onLoad handlers

Replace `mediaFiles[currentIndex]` with `this.compareLeftFile`/`this.compareRightFile`:

```javascript
const onLoad = () => {
    if (media && media.tagName === 'IMG' && !this.isBeingCleaned) {
        media.style.display = 'block';

        // Use stored file references (works for both AI-sorted and regular mode)
        if (this.compareLeftFile && this.compareRightFile) {
            this.updateCompareFileInfo(this.compareLeftFile, this.compareRightFile);
        }
        // ... rest of handler
    }
};
```

### Fix 2: Clean up caches when files are removed

After `mediaFiles.splice()`, delete corresponding entries:

```javascript
// After removing files
this.predictionScores.delete(removedFile.path);
this.featureCache.delete(removedFile.path);
```

## Files to Modify

- `media-viewer.js`:
  - Lines 2249-2252: `setupCompareImageHandlers()` - use compareLeftFile/compareRightFile
  - Lines 2303-2306: `setupCompareVideoHandlers()` - use compareLeftFile/compareRightFile
  - Line 1039: Add cache cleanup for single mode
  - Lines 3115-3116: Add cache cleanup for compare mode

## Execution Log

### [2026-01-02] - PHASE: Analysis
- Root causes identified
- Two issues found: wrong file selection + stale cache
- Solution designed

### [2026-01-02] - PHASE: Implementation

**Fix 1: onLoad handlers (lines 2249-2252, 2301-2305)**
- Changed from using `mediaFiles[currentIndex]` to `compareLeftFile`/`compareRightFile`
- Now correctly shows file info for AI-sorted files

**Fix 2: Copy filename handlers (lines 1315-1347)**
- Changed from using `mediaFiles[currentIndex]` to `compareLeftFile`/`compareRightFile`
- Now correctly copies the filename of the displayed file in AI-sorted mode

**Fix 3: Cache cleanup**
- Added `predictionScores.delete()` and `featureCache.delete()` in three locations:
  - Line 1041-1043: Single mode rating (moveCurrentFile)
  - Line 1150-1152: Special folder move (moveToSpecialFolder)
  - Line 3116-3120: Compare mode rating (moveComparePair)

**Results:**
- Syntax check passed
- All file removal locations now clean up caches

**Lessons learned:**
- When files are selected using a different algorithm (AI sorting vs currentIndex), all code paths that reference file metadata must use the same selection method
- Caches should always be cleaned up when their associated data is removed

**Problems encountered:**
- None - straightforward fix once root cause identified

**Improvements identified:**
- Consider creating a centralized `removeFile()` method that handles both array removal and cache cleanup
- Add validation in `showCompareMedia()` to ensure selected files still exist

### [2026-01-02] - PHASE: Complete

- All fixes implemented and syntax verified
- Three categories of bugs fixed:
  1. File info display mismatch in AI sorting mode
  2. Copy filename copying wrong file in AI sorting mode
  3. Stale cache entries not cleaned up on file removal
- Manual testing required by user

---

*Last Updated: 2026-01-02*
