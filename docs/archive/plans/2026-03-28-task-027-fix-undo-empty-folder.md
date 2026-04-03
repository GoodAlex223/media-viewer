# TASK-027: Fix Undo When No Media Remains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow undo (keyboard shortcut + button click) to work when all media files have been rated/moved out of a folder, restoring files and the correct view mode.

**Architecture:** Two targeted fixes in `media-viewer.js`: (1) keydown handler guard at line ~1729 allows undo through when `moveHistory` is non-empty, (2) `showEmptyStateWithUndo()` creates a visible empty-state UI with undo button. CSS styles for the new empty-state element. Unit + E2E tests.

**Tech Stack:** Vanilla JS (MediaViewer class), CSS, Vitest (unit), Playwright (E2E)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `media-viewer.js:~1729` | Keydown guard — allow undo action through in empty state |
| Modify | `media-viewer.js:~2294` | `showEmptyStateWithUndo()` — create visible empty-state UI |
| Modify | `media-viewer.js:~2337` | `showMedia()` — clean up empty-state element before rendering |
| Modify | `styles.css` | `.empty-state-undo` styling |
| Modify | `tests/media-viewer-utils.test.js` | Unit tests for new/changed methods |
| Create | `tests/e2e/undo-empty-state.test.js` | E2E tests for undo from empty state |

---

### Task 1: CSS — Add empty-state-undo styles

**Files:**
- Modify: `styles.css` (after `.drop-zone` block, around line ~508)

- [ ] **Step 1: Add `.empty-state-undo` CSS rules**

Add after the `.drop-zone.dragover` rule block (around line 508) in `styles.css`:

```css
.empty-state-undo {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--space-4);
}

.empty-state-undo-text {
    font-size: var(--font-size-xl);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
}

.empty-state-undo-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-elevated);
    color: var(--text-inverse);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--transition-fast);
}

.empty-state-undo-btn:hover {
    background: var(--color-primary-500);
    border-color: var(--color-primary-500);
}
```

- [ ] **Step 2: Commit CSS**

```bash
git add styles.css
git commit -m "style(TASK-027): add empty-state-undo CSS for undo prompt in empty folder state"
```

---

### Task 2: Fix keydown guard to allow undo in empty state

**Files:**
- Modify: `media-viewer.js:~1729`
- Test: `tests/media-viewer-utils.test.js`

- [ ] **Step 1: Write the failing unit test**

Add to `tests/media-viewer-utils.test.js`. First, at the top with the other `extractMethod` calls, add:

```js
const buildKeyString = extractMethod('buildKeyString');
```

Then add this test block at the end of the file:

```js
describe('keydown guard — undo in empty state', () => {
    it('buildKeyString produces correct string for Ctrl+KeyA', () => {
        const mockEvent = {
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            code: 'KeyA',
        };
        const result = buildKeyString.call({}, mockEvent);
        expect(result).toBe('Ctrl+KeyA');
    });

    it('buildKeyString produces correct string for plain key', () => {
        const mockEvent = {
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            code: 'KeyQ',
        };
        const result = buildKeyString.call({}, mockEvent);
        expect(result).toBe('KeyQ');
    });
});
```

- [ ] **Step 2: Run tests to verify they pass (buildKeyString already exists)**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS — these test the existing `buildKeyString` method.

- [ ] **Step 3: Modify the keydown guard in media-viewer.js**

In `media-viewer.js`, replace the early return at line ~1729:

```js
// BEFORE:
if (this.mediaFiles.length === 0) return;
```

With:

```js
// AFTER:
if (this.mediaFiles.length === 0) {
    // Allow undo shortcut even when no media remains
    const mode = this.isCompareMode ? 'compare' : 'single';
    const keyStr = this.buildKeyString(e);
    const action = this.shortcutReverseMap[mode]?.[keyStr];
    if (action === 'undo' && this.moveHistory.length > 0) {
        e.preventDefault();
        this.executeAction('undo');
    }
    return;
}
```

Note the `?.` optional chaining on `shortcutReverseMap[mode]` for safety — if the map hasn't been built yet (shouldn't happen, but defensive).

- [ ] **Step 4: Run unit tests to verify nothing breaks**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(TASK-027): allow undo shortcut through keydown guard when mediaFiles is empty"
```

---

### Task 3: Enhance showEmptyStateWithUndo() and cleanup in showMedia()

**Files:**
- Modify: `media-viewer.js:~2294` (`showEmptyStateWithUndo`)
- Modify: `media-viewer.js:~2337` (`showMedia`)

- [ ] **Step 1: Enhance showEmptyStateWithUndo()**

Replace the existing `showEmptyStateWithUndo()` method (line ~2294) with:

```js
showEmptyStateWithUndo() {
    if (this.currentMedia) {
        this.cleanupCurrentMedia();
    }
    this.hideLoadingSpinner();

    // Hide drop zone — this is "folder loaded but empty", not "no folder"
    this.dropZone.style.display = 'none';

    // Remove any existing empty-state element
    const existing = this.mediaContainer.querySelector('.empty-state-undo');
    if (existing) {
        existing.remove();
    }

    // Create empty-state undo prompt
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state-undo';

    const text = document.createElement('div');
    text.className = 'empty-state-undo-text';
    text.textContent = 'No media files remaining';
    emptyState.appendChild(text);

    const undoBtn = document.createElement('button');
    undoBtn.className = 'empty-state-undo-btn';
    undoBtn.textContent = 'Undo last move';
    undoBtn.addEventListener('click', () => this.handleCancel());
    emptyState.appendChild(undoBtn);

    this.mediaContainer.appendChild(emptyState);

    // Show appropriate controls bar with undo button visible
    if (this.isCompareMode) {
        this.compareControls.style.display = 'flex';
        this.controls.style.display = 'none';
    } else {
        this.controls.style.display = 'flex';
        this.compareControls.style.display = 'none';
    }

    this.updateFolderInfo();
    this.updateNavigationInfo();
}
```

- [ ] **Step 2: Add cleanup in showMedia()**

At the top of `showMedia()` (line ~2337), after the `if (this.mediaFiles.length === 0)` block and before the `isLoading` check, add cleanup for the empty-state element:

```js
async showMedia() {
    if (this.mediaFiles.length === 0) {
        if (this.moveHistory.length > 0) {
            this.showEmptyStateWithUndo();
        } else {
            this.showDropZone();
        }
        return;
    }

    // Clean up empty-state undo prompt if present
    const emptyState = this.mediaContainer.querySelector('.empty-state-undo');
    if (emptyState) {
        emptyState.remove();
    }

    if (this.isLoading || this.mediaNavigationInProgress) {
        return;
    }

    if (this.isCompareMode) {
        await this.showCompareMedia();
    } else {
        await this.showSingleMedia();
    }
}
```

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run`
Expected: All 148+ tests PASS

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "fix(TASK-027): enhance showEmptyStateWithUndo() with visible undo UI and cleanup in showMedia()"
```

---

### Task 4: E2E tests — undo from empty state

**Files:**
- Create: `tests/e2e/undo-empty-state.test.js`

- [ ] **Step 1: Write E2E test file**

Create `tests/e2e/undo-empty-state.test.js`:

```js
import { test, expect } from '@playwright/test';
import { join } from 'path';
import { access } from 'fs/promises';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
    waitForNotification,
} from './helpers/electron-app.js';

test.describe('Undo from empty state', () => {
    let electronApp, page, tmpFixtures;

    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

    test('single mode — undo via keyboard restores file after rating last one', async () => {
        // Setup: 1 file so rating it empties the folder
        tmpFixtures = await createTempFixtureDir(['red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Get the file name before rating
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Rate the only file — should trigger empty state
        await page.keyboard.press('q');
        await page.waitForTimeout(500);

        // Verify empty state: mediaFiles is empty, empty-state-undo element visible
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(0);

        const emptyStateVisible = await page.locator('.empty-state-undo').isVisible();
        expect(emptyStateVisible).toBe(true);

        // Undo via keyboard shortcut (Ctrl+A is the default undo key)
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(500);

        // Verify file restored
        const restoredCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(restoredCount).toBe(1);

        // Verify empty-state element is removed
        const emptyStateGone = await page.locator('.empty-state-undo').count();
        expect(emptyStateGone).toBe(0);

        // Verify media is displayed
        await waitForMedia(page);

        // Verify file is back in source folder
        await expect(access(join(tmpFixtures.dir, fileName))).resolves.toBeUndefined();
    });

    test('single mode — undo via button click restores file', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Rate the only file
        await page.keyboard.press('q');
        await page.waitForTimeout(500);

        // Click the undo button in the empty-state prompt
        await page.locator('.empty-state-undo-btn').click();
        await page.waitForTimeout(500);

        // Verify file restored and media displayed
        const restoredCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(restoredCount).toBe(1);
        await waitForMedia(page);

        await expect(access(join(tmpFixtures.dir, fileName))).resolves.toBeUndefined();
    });

    test('compare mode — undo restores both files in compare mode', async () => {
        // Setup: 2 files so rating the pair empties the folder
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);

        // Switch to compare mode
        await page.evaluate(() => {
            window.mediaViewer.toggleViewMode();
        });
        await page.waitForTimeout(1000);

        // Verify compare mode is active
        const inCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(inCompare).toBe(true);

        // Rate left file as "like" (default compare shortcut: 'q' for left-like)
        await page.keyboard.press('q');
        await page.waitForTimeout(1000);

        // Verify empty state
        const fileCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(fileCount).toBe(0);

        const emptyStateVisible = await page.locator('.empty-state-undo').isVisible();
        expect(emptyStateVisible).toBe(true);

        // Undo via keyboard
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(1000);

        // Verify both files restored
        const restoredCount = await page.evaluate(() => window.mediaViewer.mediaFiles.length);
        expect(restoredCount).toBe(2);

        // Verify still in compare mode
        const stillCompare = await page.evaluate(() => window.mediaViewer.isCompareMode);
        expect(stillCompare).toBe(true);

        // Verify empty-state element is removed
        const emptyStateGone = await page.locator('.empty-state-undo').count();
        expect(emptyStateGone).toBe(0);
    });
});
```

- [ ] **Step 2: Run E2E tests to verify they pass**

Run: `npx playwright test tests/e2e/undo-empty-state.test.js`
Expected: 3 tests PASS

If any fail, debug the specific failure — the most likely issues are:
- Timing: increase `waitForTimeout` values if the app is slow to respond
- Compare mode rating flow: the compare rating may move both files in one keystroke or require two keystrokes depending on the compare mode logic — check `moveComparePair()` behavior

- [ ] **Step 3: Run all E2E tests to check for regressions**

Run: `npx playwright test`
Expected: All existing E2E tests still PASS

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/undo-empty-state.test.js
git commit -m "test(TASK-027): add E2E tests for undo from empty folder state (single + compare + button click)"
```

---

### Task 5: Final verification and cleanup

**Files:** None new — verification only

- [ ] **Step 1: Run full unit test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run full E2E test suite**

Run: `npx playwright test`
Expected: All tests PASS

- [ ] **Step 3: Run lint and format**

Run: `npm run lint && npm run format:check`
Expected: No errors

- [ ] **Step 4: Final commit (if lint/format made changes)**

Only if formatting changes were needed:

```bash
git add -A
git commit -m "style(TASK-027): lint and format fixes"
```
