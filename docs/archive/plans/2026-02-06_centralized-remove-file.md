# TASK-003: Centralized removeFile() Method

**Status**: Complete
**Date**: 2026-02-06
**Origin**: [2026-01-02_compare-mode-ai-sort-bug.md](2026-01-02_compare-mode-ai-sort-bug.md)

---

## 1. Problem

File removal logic was duplicated across 4 locations in `media-viewer.js`:
- `moveCurrentFile()` — single mode rating
- `moveToSpecialFolder()` — special folder move (single + compare)
- `moveComparePair()` — compare mode dual rating
- `removeFailedFile()` — failed file load

Each location had to remember to clean up `predictionScores` and `featureCache` Maps. Cache cleanup was inconsistent — `removeFailedFile()` had **no cache cleanup at all**, and `perceptualHashes` was never cleaned in any path.

## 2. Solution

Created `removeFileFromList(filePath)` method that centralizes:
- Array splice (find by path, remove)
- Cache cleanup: `predictionScores`, `featureCache`, `perceptualHashes`
- `currentIndex` adjustment (standardized to `Math.max(0, length - 1)`)
- Returns removed index for undo history calculations

All 4 call sites refactored to use it. Callers retain responsibility for UI updates, ML training, move history, and mode-specific logic.

## 3. Key Discoveries

- `removeFailedFile()` had a cache leak — never cleaned `predictionScores` or `featureCache`
- `perceptualHashes` Map was never cleaned in ANY removal path — unbounded growth
- Index adjustment strategies were inconsistent across paths (wrap to 0 vs cap to length-1)
- Path-based lookup in `removeFileFromList` eliminates the need to manage index order when removing multiple files (used in `moveComparePair`)

## 4. Changes Made

**Files Modified**: `media-viewer.js`

| Change | Lines | Description |
|--------|-------|-------------|
| New method | 860-882 | `removeFileFromList(filePath)` |
| removeFailedFile | 884-916 | Use centralized method (fixes cache leak) |
| moveCurrentFile | 1093-1094 | Replace 9 lines with 1 call |
| moveToSpecialFolder | 1222-1223 | Replace 11 lines with 1 call |
| moveComparePair | 3479-3481 | Replace 10 lines with 2 calls |

## 5. Future Improvements

1. **Batch removal support**: `removeFilesFromList(filePaths[])` for removing multiple files in one operation, avoiding repeated `findIndex` calls
2. **Event-based cache invalidation**: Emit a 'file-removed' event that caches can subscribe to, making it easier to add new caches without modifying removeFileFromList
3. **Undo insertion strategy standardization**: Currently undo restores files to different positions depending on mode (currentIndex, end of array, calculated position) — could benefit from a centralized `insertFileIntoList()` counterpart
