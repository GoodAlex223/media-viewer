# TASK-022: Fix Compare Mode Last-Pair Error Cascade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Complete

**Goal:** Fix the infinite error notification loop when the last compare pair is rated, and preserve undo capability instead of showing a drop zone.

**Architecture:** Add `switchToSingleModeUI()` helper for non-toggling mode switch, `showEmptyStateWithUndo()` for empty state with undo. Fix `moveComparePair()` to detect <2 files and switch cleanly. Fix `showCompareMedia()` defense guards. Tag compare-mode history entries for single-mode undo.

**Tech Stack:** Vanilla JS (media-viewer.js), Vitest (unit tests), Playwright (E2E tests)

**Spec:** `docs/superpowers/specs/2026-03-22-task-022-fix-compare-last-pair-design.md`

---

### Task 1: Add `switchToSingleModeUI()` helper

**Files:**
- Modify: `media-viewer.js:3357` (insert new method before `toggleViewMode()`)

This is the foundation that all other tasks depend on.

- [x] **Step 1: Add `switchToSingleModeUI()` method**

Insert before `toggleViewMode()` (~line 3357):

```javascript
    switchToSingleModeUI() {
        this.isCompareMode = false;
        this.viewModeLabel.textContent = 'Single';
        this.controls.style.display = 'flex';
        this.compareControls.style.display = 'none';
        this.mediaContainer.classList.remove('compare-mode');
        this.videoControls.style.display = 'none';
        this.leftFileInfo.classList.remove('show');
        this.leftFileInfo.style.display = 'none';
        this.rightFileInfo.classList.remove('show');
        this.rightFileInfo.style.display = 'none';
        this.fileInfo.style.display = 'block';
        if (this.infoToggleBtn) {
            this.infoToggleBtn.style.display = 'flex';
        }
        this.hidePredictionBadges();
        this.closeAllZoomPopovers();
    }
```

- [x] **Step 2: Verify lint passes**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [x] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat: add switchToSingleModeUI() helper for non-toggling mode switch (TASK-022)"
```

---

### Task 2: Add `showEmptyStateWithUndo()` method

**Files:**
- Modify: `media-viewer.js` (insert near `showDropZone()` at ~line 2241)

- [x] **Step 1: Add `showEmptyStateWithUndo()` method**

Insert after `showDropZone()` method (~after line 2270):

```javascript
    showEmptyStateWithUndo() {
        if (this.currentMedia) {
            this.cleanupCurrentMedia();
        }
        this.hideLoadingSpinner();
        this.updateFolderInfo();
        this.updateNavigationInfo();
    }
```

- [x] **Step 2: Verify lint passes**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [x] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat: add showEmptyStateWithUndo() for empty state preserving undo (TASK-022)"
```

---

### Task 3: Fix `moveComparePair()` — early mode switch when <2 files remain

**Files:**
- Modify: `media-viewer.js:3636-3683` (after `removeFileFromList()` calls, before ML-deferred/showMedia branch)

This is the primary fix. After both files are removed (lines 3637-3638), insert a <2 files check before the ML-deferred path and normal `showMedia()` call.

- [x] **Step 1: Add early exit after file removal**

After line 3645 (`this.mlComparePairIndex = 0;`) and before the `if (this.currentIndex >= this.mediaFiles.length - 1)` block at line 3648, insert:

```javascript
            // TASK-022: Clean switch to single mode when <2 files remain
            if (this.mediaFiles.length < 2) {
                // Reset state flags
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
                this.hideLoadingSpinner();

                // Clear pending ML state
                if (this.pendingCompareTimeout) {
                    clearTimeout(this.pendingCompareTimeout);
                    this.pendingCompareTimeout = null;
                }
                this.pendingCompareRefresh = false;
                this.pendingCompareUpdates = 0;
                this.previousScores = null;

                // Clean up stale compare-mode wrapper DOM elements
                if (this.leftMediaWrapper) {
                    this.fullscreen.cleanup(this.leftMediaWrapper);
                    this.leftMediaWrapper.remove();
                    this.leftMediaWrapper = null;
                }
                if (this.rightMediaWrapper) {
                    this.fullscreen.cleanup(this.rightMediaWrapper);
                    this.rightMediaWrapper.remove();
                    this.rightMediaWrapper = null;
                }

                this.switchToSingleModeUI();
                this.updateFolderInfo();

                if (this.mediaFiles.length === 1) {
                    this.showNotification('Last pair rated — switched to single view', 'info');
                    this.currentIndex = 0;
                    await this.showMedia();
                } else {
                    this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                    this.showEmptyStateWithUndo();
                }
                return;
            }
```

- [x] **Step 2: Verify lint passes**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [x] **Step 3: Run unit tests**

Run: `npm test`
Expected: All tests pass

- [x] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "fix: early mode switch in moveComparePair when <2 files remain (TASK-022)"
```

---

### Task 4: Fix `showCompareMedia()` — defense-in-depth (both toggle bug instances)

**Files:**
- Modify: `media-viewer.js:2374-2378` (top guard)
- Modify: `media-viewer.js:2490-2500` (missing-file retry path guard)

Fix both instances of the `isCompareMode = false` + `toggleViewMode()` pattern.

- [x] **Step 1: Fix top guard (lines 2374-2378)**

Replace:
```javascript
        if (this.mediaFiles.length < 2) {
            this.showNotification('Need at least 2 media files for compare mode', 'error');
            this.isCompareMode = false;
            this.toggleViewMode();
            return;
        }
```

With:
```javascript
        if (this.mediaFiles.length < 2) {
            // Clean up any stale compare media from a prior render
            if (this.leftMedia) {
                await this.cleanupCompareMedia('left');
            }
            if (this.rightMedia) {
                await this.cleanupCompareMedia('right');
            }
            if (this.leftMediaWrapper) {
                this.fullscreen.cleanup(this.leftMediaWrapper);
                this.leftMediaWrapper.remove();
                this.leftMediaWrapper = null;
            }
            if (this.rightMediaWrapper) {
                this.fullscreen.cleanup(this.rightMediaWrapper);
                this.rightMediaWrapper.remove();
                this.rightMediaWrapper = null;
            }

            this.switchToSingleModeUI();

            if (this.mediaFiles.length === 1) {
                this.showNotification('Not enough files for compare mode', 'info');
                this.currentIndex = 0;
                await this.showMedia();
            } else if (this.moveHistory.length > 0) {
                this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                this.showEmptyStateWithUndo();
            } else {
                this.showDropZone();
            }
            return;
        }
```

- [x] **Step 2: Fix missing-file retry path guard (lines 2490-2500)**

Replace the block:
```javascript
            if (this.mediaFiles.length < 2) {
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
                this.hideLoadingSpinner();
                if (this.mediaFiles.length === 0) {
                    this.showDropZone();
                } else {
                    this.showNotification('Not enough files for compare mode', 'error');
                    this.isCompareMode = false;
                    this.toggleViewMode();
                }
                return;
            }
```

With:
```javascript
            if (this.mediaFiles.length < 2) {
                this.isLoading = false;
                this.mediaNavigationInProgress = false;
                this.hideLoadingSpinner();

                this.switchToSingleModeUI();

                if (this.mediaFiles.length === 1) {
                    this.showNotification('Not enough files for compare mode', 'info');
                    this.currentIndex = 0;
                    await this.showMedia();
                } else if (this.moveHistory.length > 0) {
                    this.showNotification('All files rated — press Ctrl+Z to undo', 'info');
                    this.showEmptyStateWithUndo();
                } else {
                    this.showDropZone();
                }
                return;
            }
```

- [x] **Step 3: Verify lint passes**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [x] **Step 4: Run unit tests**

Run: `npm test`
Expected: All tests pass

- [x] **Step 5: Commit**

```bash
git add media-viewer.js
git commit -m "fix: replace toggleViewMode with switchToSingleModeUI in showCompareMedia guards (TASK-022)"
```

---

### Task 5: Fix `showMedia()` — conditional drop zone based on undo history

**Files:**
- Modify: `media-viewer.js:2307-2309`

- [x] **Step 1: Update the empty guard**

Replace:
```javascript
        if (this.mediaFiles.length === 0) {
            this.showDropZone();
            return;
        }
```

With:
```javascript
        if (this.mediaFiles.length === 0) {
            if (this.moveHistory.length > 0) {
                this.showEmptyStateWithUndo();
            } else {
                this.showDropZone();
            }
            return;
        }
```

- [x] **Step 2: Verify lint passes**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [x] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "fix: show empty state with undo instead of drop zone when history exists (TASK-022)"
```

---

### Task 6: Tag compare-mode history entries and fix `handleCancel()` undo

**Files:**
- Modify: `media-viewer.js:3564` (primary move history push)
- Modify: `media-viewer.js:3599` (secondary move history push)
- Modify: `media-viewer.js:3315` (handleCancel single-mode branch)

- [x] **Step 1: Add `compareMode: true` to both history push calls in `moveComparePair()`**

At line ~3564, the primary move history push — add `compareMode: true`:
```javascript
            this.moveHistory.push({
                fileName: primaryFile.name,
                originalPath: primaryFile.path,
                newPath: primaryMoveResult.targetPath,
                fileSize: primaryFile.size,
                fileType: primaryFile.type,
                actionType: primaryAction,
                mlFeatures: primaryFeatures ? Array.from(primaryFeatures) : null,
                compareMode: true,
            });
```

At line ~3599, the secondary move history push — add `compareMode: true`:
```javascript
            this.moveHistory.push({
                fileName: secondaryFile.name,
                originalPath: secondaryFile.path,
                newPath: secondaryMoveResult.targetPath,
                fileSize: secondaryFile.size,
                fileType: secondaryFile.type,
                actionType: secondaryAction,
                mlFeatures: secondaryFeatures ? Array.from(secondaryFeatures) : null,
                compareMode: true,
            });
```

- [x] **Step 2: Add compare-pair detection to `handleCancel()` single-mode branch**

In `handleCancel()`, the single-mode branch starts at line ~3315 with `} else {`. Before this branch, insert a new branch that detects compare-pair history entries:

Replace:
```javascript
        } else {
            // Single mode - restore one file
            const undoMove = this.moveHistory.pop();
```

With:
```javascript
        } else if (
            !this.isCompareMode &&
            this.moveHistory.length >= 2 &&
            this.moveHistory[this.moveHistory.length - 1].compareMode &&
            this.moveHistory[this.moveHistory.length - 2].compareMode
        ) {
            // Single mode — undo last compare pair (both files in one action)
            const secondMove = this.moveHistory.pop();
            const firstMove = this.moveHistory.pop();

            try {
                const firstMoveResult = await window.electronAPI.moveFile({
                    sourcePath: firstMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: firstMove.fileName,
                });
                if (!firstMoveResult.success) {
                    throw new Error(firstMoveResult.error);
                }

                const secondMoveResult = await window.electronAPI.moveFile({
                    sourcePath: secondMove.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: secondMove.fileName,
                });
                if (!secondMoveResult.success) {
                    throw new Error(secondMoveResult.error);
                }

                this.mediaFiles.push({
                    name: firstMove.fileName,
                    path: firstMove.originalPath,
                    size: firstMove.fileSize,
                    type: firstMove.fileType,
                });
                this.mediaFiles.push({
                    name: secondMove.fileName,
                    path: secondMove.originalPath,
                    size: secondMove.fileSize,
                    type: secondMove.fileType,
                });

                if (firstMove.mlFeatures && firstMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(firstMove.mlFeatures, firstMove.actionType);
                }
                if (secondMove.mlFeatures && secondMove.actionType !== 'special') {
                    this.reverseMlModelUpdate(secondMove.mlFeatures, secondMove.actionType);
                }

                this.showNotification(`Restored ${firstMove.fileName}`, 'success');
                this.showNotification(`Restored ${secondMove.fileName}`, 'success');
                this.updateFolderInfo();

                this.currentIndex = this.mediaFiles.length - 2;
                await this.showMedia();
            } catch (error) {
                console.error('Error undoing compare pair move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(firstMove);
                this.moveHistory.push(secondMove);
            }
        } else {
            // Single mode - restore one file
            const undoMove = this.moveHistory.pop();
```

- [x] **Step 3: Verify lint passes**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [x] **Step 4: Run unit tests**

Run: `npm test`
Expected: All tests pass

- [x] **Step 5: Commit**

```bash
git add media-viewer.js
git commit -m "feat: tag compare history entries and support compare-pair undo from single mode (TASK-022)"
```

---

### Task 7: E2E test — last pair rated switches to single mode

**Files:**
- Modify: `tests/e2e/compare-mode.test.js`

- [x] **Step 1: Write E2E test for last-pair clean switch**

Add to the `Compare Mode` test.describe block:

```javascript
    test('switches to single mode when last pair is rated', async () => {
        // Load with only 2 files (minimum for compare mode)
        const twoFileTmp = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        // Launch fresh app with 2 files
        await closeApp(electronApp);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: twoFileTmp.likeDir,
            customDislikeFolder: twoFileTmp.dislikeDir,
        });
        await loadFolder(page, twoFileTmp.dir);
        await waitForMedia(page);

        // Enter compare mode
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Verify in compare mode
        const isCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompare).toBe(true);

        // Rate the pair (Q key = left like, right dislike)
        await page.evaluate(() => window.mediaViewer.handleLeftLike());
        await page.waitForTimeout(1000);

        // Should have switched to single mode (0 files remain)
        const isCompareAfter = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompareAfter).toBe(false);

        // Should NOT show drop zone
        const dropZoneVisible = await page.evaluate(
            () => document.querySelector('.drop-zone').style.display !== 'none'
        );
        expect(dropZoneVisible).toBe(false);

        // moveHistory should still have entries (undo available)
        const historyLength = await page.evaluate(() => window.mediaViewer.moveHistory.length);
        expect(historyLength).toBe(2);

        // Undo should restore both files
        await page.evaluate(() => window.mediaViewer.handleCancel());
        await page.waitForTimeout(1000);

        const filesAfterUndo = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(filesAfterUndo).toBe(2);

        // Clean up temp dir
        await twoFileTmp.cleanup();
    });
```

- [x] **Step 2: Run the E2E test**

Run: `npx playwright test tests/e2e/compare-mode.test.js --timeout 30000`
Expected: All tests pass including the new one

- [x] **Step 3: Commit**

```bash
git add tests/e2e/compare-mode.test.js
git commit -m "test: add E2E test for last-pair clean switch to single mode (TASK-022)"
```

---

### Task 8: Run full test suite and verify

**Files:** None (verification only)

- [x] **Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass

- [x] **Step 2: Run E2E tests**

Run: `npm run test:e2e`
Expected: All tests pass

- [x] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [x] **Step 4: Final commit if any formatting changes needed**

```bash
npm run format
git add -A
git commit -m "style: format code (TASK-022)"
```
(Only if formatting changes were needed)
