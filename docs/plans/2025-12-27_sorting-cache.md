# Plan: Sorting Algorithm Cache

**Date**: 2025-12-27
**Status**: Planning

---

## 1. Problem Statement

User wants to cache sorting algorithm results so that:
1. Each algorithm (VP-Tree, MST, Simple) has its own cache
2. If a file no longer exists in the folder, skip it when restoring from cache
3. If a new file appears, it needs to be sorted based on the cached order

---

## 2. Current State Analysis

### Existing Caching
- **Hash cache**: `.hash_cache.json` - stores perceptual hashes (filename → hash)
- Located in the media folder
- Loaded when sorting starts, saved after hash computation

### Sorting Flow
1. User clicks "Sort by Similarity"
2. Hash cache loaded → new hashes computed → cache saved
3. Sorting runs in Web Worker
4. Results applied to `mediaFiles` array
5. Original order kept in `originalMediaFiles` for restore

---

## 3. Approaches Considered

### Approach A: Separate Cache Files Per Algorithm
- Files: `.sort_cache_vptree.json`, `.sort_cache_mst.json`, `.sort_cache_simple.json`
- **Pros**: Clean separation, algorithm-specific
- **Cons**: Multiple files to manage

### Approach B: Single Combined Cache File (Recommended)
- File: `.sort_cache.json` with algorithm keys
- **Pros**: Single file, easier management, can include metadata
- **Cons**: Slightly larger file

### Approach C: Extend Hash Cache
- Add sort order to `.hash_cache.json`
- **Pros**: Single file for everything
- **Cons**: Mixing concerns, harder to maintain

**Recommendation**: Approach B - Single combined cache file

---

## 4. Clarification Needed

### Question 1: New File Insertion Strategy
When a new file appears in the folder, how should it be inserted?

**Option A**: Add at the end of sorted list
- Simpler implementation
- New files always at the end
- User can re-sort to integrate them properly

**Option B**: Find best position based on similarity
- More complex (requires computing hash, finding neighbors)
- Better UX - new files appear near similar existing files
- May slow down cache loading

### Question 2: Cache Application Trigger
When should the cached order be applied?

**Option A**: Automatically when loading folder (if cache exists)
- Instant sorted view
- User may not expect this behavior

**Option B**: When user clicks "Sort by Similarity" (checks cache first)
- Consistent with current UX
- User explicitly requests sorting
- Can show "Using cached order" notification

### Question 3: Cache Invalidation
When should the cache be considered stale?

**Option A**: Never auto-invalidate, user re-sorts manually
**Option B**: Invalidate if >X% of files changed
**Option C**: Invalidate after N days

---

## 5. Proposed Implementation

### Cache Structure
```json
{
  "vptree": {
    "sortedPaths": ["file1.jpg", "file2.jpg", "file3.mp4"],
    "timestamp": 1735300000000,
    "startFile": "file5.jpg",
    "totalFiles": 150
  },
  "mst": { ... },
  "simple": { ... }
}
```

### Core Logic

#### On "Sort by Similarity" click:
1. Check if `.sort_cache.json` exists
2. If cache exists for current algorithm:
   - Load cached sorted paths
   - Filter out files that no longer exist
   - Handle new files (based on chosen strategy)
   - Apply order to `mediaFiles`
   - Show notification: "Restored cached order (X files, Y new, Z removed)"
3. If no cache:
   - Run sorting as usual
   - Save result to cache

#### Cache Save (after successful sort):
- Store sorted paths (filenames only, not full paths)
- Store timestamp and metadata
- Store algorithm name

#### Cache Load:
- Read cache file
- Reconstruct full paths
- Validate files exist
- Apply or merge with current file list

### Files to Modify
1. `media-viewer.js`:
   - Add `loadSortCache()` method
   - Add `saveSortCache()` method
   - Modify `toggleSimilaritySort()` to check cache first
   - Add new file handling logic

---

## 6. Edge Cases

1. **All cached files deleted**: Fall back to fresh sort
2. **Only new files**: Fresh sort (no benefit from cache)
3. **Cache from different algorithm**: Each algorithm has separate cache
4. **Corrupt cache file**: Handle gracefully, fall back to fresh sort
5. **Empty cache**: Treat as no cache

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Cache becomes stale | Show file count changes in notification |
| Disk space | Cache file is small (just filenames) |
| Performance on large folders | Async file operations, progress indication |

---

## 8. User Decisions (Confirmed 2025-12-27)

1. **New file insertion**: Find best position based on similarity
2. **Cache trigger**: Manual - apply when user clicks "Sort by Similarity"
3. **Cache invalidation**: Never auto-invalidate, user controls re-sort

---

## 9. Execution Log

#### [2025-12-27] — PHASE: Planning
- Analyzed current hash caching and sorting implementation
- Created plan document with 3 approaches
- Recommended single combined cache file approach
- Identified 3 key questions requiring user input

#### [2025-12-27] — PHASE: User Decision
- User confirmed: Find best position for new files
- User confirmed: Manual trigger (on button click)
- User confirmed: Never auto-invalidate

#### [2025-12-27] — PHASE: Implementation

**Methods added to media-viewer.js:**

1. `loadSortCache(algorithm)` - Loads cached sort order for specific algorithm
2. `saveSortCache(algorithm, sortedPaths, startFile)` - Saves sort order to cache
3. `applyCachedSortOrder(cachedData)` - Applies cached order, handles removed/new files
4. `insertNewFilesInSortedOrder(sortedFiles, newFiles)` - Finds best insertion positions for new files

**Modified methods:**

- `handleSortBySimilarity()` - Now checks cache first before performing full sort

**Cache file format:** `.sort_cache.json`
```json
{
  "vptree": {
    "sortedPaths": ["file1.jpg", "file2.jpg"],
    "timestamp": 1735300000000,
    "startFile": "file1.jpg",
    "totalFiles": 150
  }
}
```

#### [2025-12-27] — PHASE: Complete

- Implementation complete
- Syntax validation passed
- All methods integrated into existing sorting workflow

**Results obtained:**
- Sort cache system implemented with per-algorithm caching
- New files are inserted at optimal positions based on similarity
- Removed files are automatically skipped
- User receives feedback on cache usage (cached/new/removed counts)

**Improvements identified:**
1. Could add "Force re-sort" option to ignore cache when user wants fresh sort
2. Could add cache age display in notification
