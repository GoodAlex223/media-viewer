# Compare Mode Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix folder-switch bug where both Single and Compare Mode buttons appear simultaneously, and DRY the duplicated single-mode UI logic in `toggleViewMode()`.

**Architecture:** Two surgical edits to `media-viewer.js` — insert `switchToSingleModeUI()` call in `loadFolder()`, replace inline single-mode branch in `toggleViewMode()` with the same call. One new E2E test validates the folder-switch scenario.

**Tech Stack:** JavaScript (Electron renderer), Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-04-10-compare-mode-fix-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `media-viewer.js` | Modify (lines ~2247, ~3633-3649) | Bug fix + DRY refactor |
| `tests/e2e/compare-mode.test.js` | Modify (add test) | E2E coverage for folder-switch reset |

---

## Task 1: E2E Test — Folder switch resets compare mode

**Files:**
- Modify: `tests/e2e/compare-mode.test.js`

- [ ] **Step 1: Write the failing E2E test**

Add this test at the end of the `Compare Mode` describe block in `tests/e2e/compare-mode.test.js`, before the closing `});`:

```javascript
    test('resets to single mode when switching folders in compare mode', async () => {
        // Enter compare mode
        await page.evaluate(() => window.mediaViewer.toggleViewMode());
        await page.waitForTimeout(500);

        // Verify in compare mode
        const isCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompare).toBe(true);

        // Create a second folder with different fixtures
        const secondFolder = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);

        // Load second folder while still in compare mode
        await loadFolder(page, secondFolder.dir);
        await waitForMedia(page);

        // Should have reset to single mode
        const isCompareAfter = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(isCompareAfter).toBe(false);

        // Single mode UI should be active
        const viewModeLabel = await page.locator('#viewModeLabel').textContent();
        expect(viewModeLabel).toBe('Single');

        // .controls (single mode buttons) should be visible
        const controlsVisible = await page.evaluate(
            () => document.querySelector('.controls').style.display === 'flex'
        );
        expect(controlsVisible).toBe(true);

        // compare-mode class should be removed from media container
        const hasCompareClass = await page.evaluate(() =>
            document.querySelector('.media-container').classList.contains('compare-mode')
        );
        expect(hasCompareClass).toBe(false);

        // Clean up second folder
        await secondFolder.cleanup();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/compare-mode.test.js --grep "resets to single mode when switching folders" --timeout 30000`

Expected: FAIL — `isCompareAfter` will be `true` because `loadFolder()` doesn't reset compare mode.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/e2e/compare-mode.test.js
git commit -m "test: add E2E for folder switch resetting compare mode (red)"
```

---

## Task 2: Bug Fix — Reset compare mode in `loadFolder()`

**Files:**
- Modify: `media-viewer.js:2247-2248`

- [ ] **Step 1: Insert `switchToSingleModeUI()` in `loadFolder()`**

In `media-viewer.js`, between line 2247 (the `sortSimilarityBtn` block closing brace) and line 2248 (`this.hideDropZone()`), insert one line:

```javascript
            this.switchToSingleModeUI();
```

The result should look like:

```javascript
            if (this.sortSimilarityBtn) {
                this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Sort by Similarity';
            }
            this.switchToSingleModeUI();
            this.hideDropZone();
            await this.showMedia();
```

- [ ] **Step 2: Run the E2E test to verify it passes**

Run: `npx playwright test tests/e2e/compare-mode.test.js --grep "resets to single mode when switching folders" --timeout 30000`

Expected: PASS

- [ ] **Step 3: Run the full compare-mode E2E suite to check for regressions**

Run: `npx playwright test tests/e2e/compare-mode.test.js --timeout 30000`

Expected: All tests PASS (existing tests should be unaffected — they start in single mode and toggle themselves).

- [ ] **Step 4: Run unit tests**

Run: `npm test`

Expected: All 150 tests PASS (no unit tests touch `loadFolder()`).

- [ ] **Step 5: Commit the fix**

```bash
git add media-viewer.js
git commit -m "fix: reset compare mode on folder switch

loadFolder() did not reset isCompareMode, causing both Single Mode
and Compare Mode buttons to appear when switching folders while in
Compare Mode. Call switchToSingleModeUI() before hideDropZone()."
```

---

## Task 3: DRY — Replace `toggleViewMode()` single-mode branch

**Files:**
- Modify: `media-viewer.js:3633-3649`

- [ ] **Step 1: Replace the inline single-mode branch with `switchToSingleModeUI()`**

In `media-viewer.js`, replace lines 3633-3649 (the else-branch inside `toggleViewMode()`):

**Before:**
```javascript
        } else {
            this.viewModeLabel.textContent = 'Single';
            this.controls.style.display = 'flex';
            // Show info toggle button in single mode
            if (this.infoToggleBtn) {
                this.infoToggleBtn.style.display = 'flex';
            }
            this.compareControls.style.display = 'none';
            this.mediaContainer.classList.remove('compare-mode');
            // Hide compare file info panels in single mode
            this.leftFileInfo.classList.remove('show');
            this.rightFileInfo.classList.remove('show');
            this.leftFileInfo.style.display = 'none';
            this.rightFileInfo.style.display = 'none';
            // Show main file info panel in single mode
            this.fileInfo.style.display = 'block';
        }
```

**After:**
```javascript
        } else {
            this.switchToSingleModeUI();
        }
```

- [ ] **Step 2: Run the full compare-mode E2E suite**

Run: `npx playwright test tests/e2e/compare-mode.test.js --timeout 30000`

Expected: All tests PASS — `toggleViewMode()` now calls `switchToSingleModeUI()` which does the same work plus `hidePredictionBadges()` and `closeAllZoomPopovers()` (already called at top of `toggleViewMode()`, harmless duplicate).

- [ ] **Step 3: Run the full E2E suite for broader regression check**

Run: `npx playwright test --timeout 30000`

Expected: All E2E tests PASS.

- [ ] **Step 4: Run unit tests**

Run: `npm test`

Expected: All 150 tests PASS.

- [ ] **Step 5: Commit the DRY refactor**

```bash
git add media-viewer.js
git commit -m "refactor: DRY toggleViewMode() single-mode branch

Replace 17-line inline single-mode UI setup with single call to
switchToSingleModeUI(), which already handles all the same state."
```

---

## Summary

| Task | What | Files | Test |
|------|------|-------|------|
| 1 | Write failing E2E test | `tests/e2e/compare-mode.test.js` | Red |
| 2 | Fix `loadFolder()` to reset compare mode | `media-viewer.js:~2247` | Green |
| 3 | DRY `toggleViewMode()` else-branch | `media-viewer.js:~3633-3649` | Green (regression) |
