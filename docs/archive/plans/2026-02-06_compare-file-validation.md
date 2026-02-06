# TASK-004: Validation in showCompareMedia() for file existence

**Status**: Complete
**Created**: 2026-02-06
**Completed**: 2026-02-06
**Effort**: S
**Origin**: [2026-01-02_compare-mode-ai-sort-bug.md](2026-01-02_compare-mode-ai-sort-bug.md)

---

## 1. Problem

`showCompareMedia()` does not validate that selected files still exist on disk before attempting to display them. If files are moved or deleted externally, the browser's img/video error event fires, showing an error notification with a manual "Remove" button — a reactive, user-driven recovery rather than proactive validation.

Additionally, the compare-mode error handlers (`setupCompareImageHandlers` and `setupCompareVideoHandlers`) calculate `failedIndex` using `currentIndex` (assuming sequential pairing), which is incorrect for ML-sorted pairs.

## 2. Solution

### Approach chosen: Minimal inline validation

Added a validation block in `showCompareMedia()` after pair selection but before DOM element creation:
1. Parallel file existence check via new `check-file-exists` IPC handler
2. Missing files removed via existing `removeFileFromList()`
3. Warning notification shown ("Skipped N missing file(s)")
4. Bounded recursive retry (max 10) to find next valid pair
5. Graceful fallback when <2 files remain

### Bug fix
Changed `failedIndex` calculation from `side === 'left' ? this.currentIndex : this.currentIndex + 1` to `this.mediaFiles.findIndex(f => f.path === file.path)` — works for all pair selection strategies.

## 3. Files Modified

| File | Change |
|------|--------|
| main.js | Added `check-file-exists` IPC handler (mirrors `check-folder-exists`) |
| preload.js | Added `checkFileExists` bridge method |
| media-viewer.js | Added validation block in `showCompareMedia()`, `retryCount` parameter, fixed `failedIndex` in both compare error handlers |

## 4. Key Discoveries

- No `checkFileExists` IPC channel existed — only `checkFolderExists`
- Compare-mode error handlers assumed sequential pairing (bug for ML-sorted mode)
- Recursive retry naturally terminates because each call removes at least 1 file, but a depth guard (max 10) prevents deep call stacks

## 5. Future Improvements

1. **Add same validation to `showSingleMedia()`** — Same vulnerability exists in single view mode. Files deleted externally trigger browser error events instead of being proactively caught. (IDEA)
2. **Batch file validation on folder refresh** — Validate all files in `mediaFiles[]` at once, removing stale entries. Useful for long-running sessions where folder contents change. (IDEA)
3. **Unified file validation helper** — If both single and compare mode need validation, extract a shared `validateAndRemoveMissingFiles(files)` method. (IDEA — only if improvement #1 is implemented)
