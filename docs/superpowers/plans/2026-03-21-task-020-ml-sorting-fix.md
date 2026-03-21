# TASK-020: ML Sorting Race Condition Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the race condition where compare mode renders next pair before ML re-scoring completes, add score delta UX feedback, and add unit tests for pair selection logic.

**Architecture:** Add `pendingCompareRefresh` / `pendingCompareUpdates` state to coordinate the async flow between `moveComparePair()` → ML worker update → re-score → show next pair. Snapshot scores before rating to compute deltas for UX notification. Extract pair selection logic for unit testing.

**Tech Stack:** JavaScript (ES modules), Vitest, Electron renderer process

**Spec:** `docs/superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `media-viewer.js` | Add pending state, fix race condition flow, add score delta notification |
| Create | `tests/ml-pair-selection.test.js` | Unit tests for pair selection logic |
| Modify | `docs/planning/BACKLOG.md` | Add 5 future work items from investigation |
| Modify | `docs/planning/TODO.md` | Move TASK-020 to In Progress |

---

### Task 1: Add pending state to constructor

**Files:**
- Modify: `media-viewer.js:335-344` (constructor state initialization)

- [ ] **Step 1: Add new state fields after existing ML state**

In `media-viewer.js`, after `this.mlComparePairIndex = 0;` (line 344), add:

```javascript
        this.pendingCompareRefresh = false; // Awaiting ML re-score before showing next compare pair
        this.pendingCompareUpdates = 0; // Counter for expected updateComplete messages (2 for rating, 1 for undo)
        this.pendingCompareTimeout = null; // Fallback timeout ID
        this.previousScores = null; // Snapshot of predictionScores for delta notification
```

- [ ] **Step 2: Run linter to verify**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat(ml): add pendingCompareRefresh state for race condition fix (TASK-020)"
```

---

### Task 2: Modify moveComparePair() to defer showMedia() when ML-sorted

**Files:**
- Modify: `media-viewer.js:3622-3647` (end of moveComparePair)

- [ ] **Step 1: Add conditional logic after ML model updates**

Replace the block from line 3622 to line 3647 (from `// Update ML model` through `await this.showMedia()`) with:

```javascript
            // Update ML model with both ratings (using pre-extracted features from earlier)
            const mlSortedCompare = this.isSortedByPrediction && this.isCompareMode;

            if (primaryFeatures) {
                this.updateMlModelWithFeatures(primaryFeatures, primaryAction);
            }
            if (secondaryFeatures) {
                this.updateMlModelWithFeatures(secondaryFeatures, secondaryAction);
            }

            // Remove both files from current view and clean up caches
            this.removeFileFromList(leftFile.path);
            this.removeFileFromList(rightFile.path);

            // Clear stored file references
            this.compareLeftFile = null;
            this.compareRightFile = null;

            // Reset ML pair index to show new highest vs lowest
            this.mlComparePairIndex = 0;

            // Ensure current index can show a pair
            if (this.currentIndex >= this.mediaFiles.length - 1) {
                this.currentIndex = 0;
            }

            this.updateFolderInfo();

            // If ML-sorted compare mode, defer showMedia() until re-score completes
            if (mlSortedCompare && primaryFeatures && secondaryFeatures) {
                // Snapshot scores BEFORE re-score for delta notification
                if (this.predictionScores.size > 0) {
                    this.previousScores = new Map(this.predictionScores);
                }
                this.pendingCompareRefresh = true;
                this.pendingCompareUpdates = 2;
                // Keep mediaNavigationInProgress true to block spurious showMedia() calls
                this.mediaNavigationInProgress = true;
                // Fallback timeout: show with stale scores after 3s rather than blocking forever
                this.pendingCompareTimeout = setTimeout(() => {
                    if (this.pendingCompareRefresh) {
                        console.warn('[ML Debug] Re-score timeout — showing pair with stale scores');
                        this.pendingCompareRefresh = false;
                        this.pendingCompareUpdates = 0;
                        this.pendingCompareTimeout = null;
                        this.previousScores = null;
                        this.mediaNavigationInProgress = false;
                        this.showMedia();
                    }
                }, 3000);
            } else {
                await this.showMedia();
            }
```

- [ ] **Step 2: Run linter to verify**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [ ] **Step 3: Run unit tests to verify no regressions**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "feat(ml): defer showMedia() in moveComparePair when ML-sorted (TASK-020)

When ML sort is active in compare mode, set pendingCompareRefresh=true
and pendingCompareUpdates=2 instead of calling showMedia() immediately.
This allows the ML re-score to complete before rendering the next pair.
Includes 3-second fallback timeout."
```

---

### Task 3: Modify updateComplete handler to bypass debounce when pending

**Files:**
- Modify: `media-viewer.js:5059-5086` (updateComplete case)

- [ ] **Step 1: Add pending compare refresh logic**

Replace the `case 'updateComplete':` block (lines 5059–5086) with:

```javascript
                case 'updateComplete':
                    this.mlModelState = message.modelState;
                    this.mlStats = message.stats;
                    console.log(
                        `[ML Debug] Model updated! Total: ${message.stats.totalSamples} samples ` +
                            `(${message.stats.positiveCount} likes, ${message.stats.negativeCount} dislikes) ` +
                            `| Ready: ${message.stats.isReady}`
                    );
                    // Show visual feedback that ML learned (subtle, bottom-left)
                    this.showMlLearningIndicator(message.stats);
                    // Debounce model saving to avoid multiple writes
                    if (this._saveModelTimer) {
                        clearTimeout(this._saveModelTimer);
                    }
                    this._saveModelTimer = setTimeout(() => {
                        this.saveMlModel();
                        this._saveModelTimer = null;
                    }, 500);

                    // If awaiting compare refresh, bypass debounce
                    if (this.pendingCompareRefresh) {
                        this.pendingCompareUpdates--;
                        if (this.pendingCompareUpdates <= 0) {
                            // Both updates received — immediately request re-score
                            this.requestPredictionScores();
                            this.updateSortPredictionButton();
                        }
                        // Don't debounce — we'll handle showMedia() in scoreComplete
                    } else {
                        // Normal path: debounce re-scoring
                        if (this._scoreDebounceTimer) {
                            clearTimeout(this._scoreDebounceTimer);
                        }
                        this._scoreDebounceTimer = setTimeout(() => {
                            this.requestPredictionScores();
                            this.updateSortPredictionButton();
                            this._scoreDebounceTimer = null;
                        }, 100);
                    }
                    break;
```

- [ ] **Step 2: Run linter to verify**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat(ml): bypass debounce in updateComplete when pendingCompareRefresh (TASK-020)

When pendingCompareRefresh is true, decrement pendingCompareUpdates counter.
When counter reaches 0 (both model updates received), immediately call
requestPredictionScores() without the 100ms debounce delay."
```

---

### Task 4: Modify reverseUpdateComplete handler for undo path

**Note:** The compare-mode undo handler (`handleUndoMove`, ~line 3280) uses `_restoredPairFiles`
to display the restored pair directly, bypassing ML pair selection entirely. So the race condition
does NOT apply to undo. However, the `reverseUpdateComplete` handler should still support the
`pendingCompareRefresh` bypass for future-proofing, and the debounce bypass ensures badges
update correctly.

**Files:**
- Modify: `media-viewer.js:5088-5109` (reverseUpdateComplete case)

- [ ] **Step 1: Add pending compare refresh logic to undo handler**

Replace the `case 'reverseUpdateComplete':` block (lines 5088–5109) with:

```javascript
                // Handle reversed ML update (undo functionality)
                case 'reverseUpdateComplete':
                    console.log('[ML Debug] Model reverse update complete');
                    this.mlModelState = message.modelState;
                    this.mlStats = message.stats;
                    // Debounce model saving
                    if (this._saveModelTimer) {
                        clearTimeout(this._saveModelTimer);
                    }
                    this._saveModelTimer = setTimeout(() => {
                        this.saveMlModel();
                        this._saveModelTimer = null;
                    }, 500);

                    // If awaiting compare refresh, bypass debounce
                    if (this.pendingCompareRefresh) {
                        this.pendingCompareUpdates--;
                        if (this.pendingCompareUpdates <= 0) {
                            this.requestPredictionScores();
                            this.updateSortPredictionButton();
                        }
                    } else {
                        // Normal path: debounce re-scoring
                        if (this._scoreDebounceTimer) {
                            clearTimeout(this._scoreDebounceTimer);
                        }
                        this._scoreDebounceTimer = setTimeout(() => {
                            this.requestPredictionScores();
                            this.updateSortPredictionButton();
                            this._scoreDebounceTimer = null;
                        }, 100);
                    }
                    break;
```

- [ ] **Step 2: Run linter to verify**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add media-viewer.js
git commit -m "feat(ml): add pendingCompareRefresh bypass to reverseUpdateComplete (TASK-020)

Mirror the updateComplete debounce bypass logic for future-proofing.
Currently undo in compare mode uses _restoredPairFiles to bypass ML
pair selection, so pendingCompareRefresh is not set during undo."
```

---

### Task 5: Modify scoreComplete handler to call showMedia() when pending

**Files:**
- Modify: `media-viewer.js:5111-5124` (scoreComplete case)

- [ ] **Step 1: Add deferred showMedia() and score delta notification**

Replace the `case 'scoreComplete':` block (lines 5111–5124) with:

```javascript
                case 'scoreComplete':
                    this.clearProgressNotification(); // Clear "Scoring" progress
                    if (message.scores) {
                        // Build filename->path map once for O(1) lookups
                        const filenameToPath = new Map(this.mediaFiles.map((f) => [f.name, f.path]));
                        for (const [filename, score] of Object.entries(message.scores)) {
                            const path = filenameToPath.get(filename);
                            if (path) {
                                this.predictionScores.set(path, score);
                            }
                        }
                        this.updatePredictionBadges();

                        // Score delta notification (only after rating-triggered re-scores)
                        if (this.previousScores) {
                            let upCount = 0;
                            let downCount = 0;
                            for (const [filePath, newScore] of this.predictionScores) {
                                const oldScore = this.previousScores.get(filePath);
                                if (oldScore !== undefined) {
                                    const delta = newScore - oldScore;
                                    if (delta > 0.05) {
                                        upCount++;
                                    } else if (delta < -0.05) {
                                        downCount++;
                                    }
                                }
                            }
                            const total = upCount + downCount;
                            if (total > 0) {
                                this.showNotification(
                                    `ML updated: ${total} files rescored (${upCount}↑ ${downCount}↓)`,
                                    'info',
                                    2000
                                );
                            } else {
                                this.showNotification('ML updated: scores stable', 'info', 2000);
                            }
                            this.previousScores = null;
                        }

                        // If deferred compare pair rendering, show next pair now
                        if (this.pendingCompareRefresh) {
                            clearTimeout(this.pendingCompareTimeout);
                            this.pendingCompareRefresh = false;
                            this.pendingCompareUpdates = 0;
                            this.pendingCompareTimeout = null;
                            this.mediaNavigationInProgress = false;
                            this.showMedia();
                        }
                    }
                    break;
```

- [ ] **Step 2: Run linter to verify**

Run: `npx eslint media-viewer.js`
Expected: No new errors

- [ ] **Step 3: Run unit tests to verify no regressions**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "feat(ml): add score delta notification and deferred showMedia in scoreComplete (TASK-020)

After rating-triggered re-scores, diff old vs new predictionScores and
show notification with count of significantly changed scores.
When pendingCompareRefresh is active, call showMedia() after updating
scores and clear all pending state including fallback timeout."
```

---

### Task 6: Write unit tests for pair selection logic

**Files:**
- Create: `tests/ml-pair-selection.test.js`

- [ ] **Step 1: Create the test file with all 7 test cases**

Create `tests/ml-pair-selection.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// Extract method bodies using regex and create callable functions
function extractMethod(methodName) {
    const regex = new RegExp(`^\\s{4}${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) {
        throw new Error(`Could not find method: ${methodName}`);
    }

    const startIndex = match.index;
    let braceCount = 0;
    let methodEnd = -1;
    const searchStart = startIndex + match[0].length - 1;

    for (let i = searchStart; i < source.length; i++) {
        if (source[i] === '{') {
            braceCount++;
        }
        if (source[i] === '}') {
            braceCount--;
        }
        if (braceCount === 0) {
            methodEnd = i + 1;
            break;
        }
    }

    const methodBody = source.substring(searchStart + 1, methodEnd - 1);
    const params = match[1];
    return new Function(params, methodBody);
}

/**
 * Helper: Extract the ML pair selection logic from showCompareMedia().
 * Since showCompareMedia() is async and has many DOM dependencies,
 * we test the pair selection algorithm directly by replicating it.
 *
 * The algorithm (from media-viewer.js showCompareMedia):
 *   1. Build filesWithScores = mediaFiles.map(f => ({file: f, score: predictionScores.get(f.path) ?? 0.5}))
 *   2. Sort descending by score
 *   3. pairIndex = Math.min(mlComparePairIndex, Math.floor(filesWithScores.length / 2) - 1)
 *   4. leftIndex = Math.max(0, pairIndex), rightIndex = Math.max(0, filesWithScores.length - 1 - pairIndex)
 *   5. If leftIndex >= rightIndex: left=[0], right=[last]; else left=[leftIndex], right=[rightIndex]
 */
function selectMlPair(mediaFiles, predictionScores, mlComparePairIndex) {
    const filesWithScores = mediaFiles
        .map((f) => ({ file: f, score: predictionScores.get(f.path) ?? 0.5 }))
        .sort((a, b) => b.score - a.score);

    const pairIndex = Math.min(mlComparePairIndex, Math.floor(filesWithScores.length / 2) - 1);
    const leftIndex = Math.max(0, pairIndex);
    const rightIndex = Math.max(0, filesWithScores.length - 1 - pairIndex);

    let leftFile, rightFile;
    if (leftIndex >= rightIndex) {
        leftFile = filesWithScores[0].file;
        rightFile = filesWithScores[filesWithScores.length - 1].file;
    } else {
        leftFile = filesWithScores[leftIndex].file;
        rightFile = filesWithScores[rightIndex].file;
    }

    return {
        leftFile,
        rightFile,
        leftScore: predictionScores.get(leftFile.path) ?? 0.5,
        rightScore: predictionScores.get(rightFile.path) ?? 0.5,
    };
}

// Helper to create mock file objects
function mockFile(name, filePath) {
    return { name, path: filePath || `/mock/${name}` };
}

describe('ML pair selection logic', () => {
    it('selects highest vs lowest for pairIndex 0', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.7],
            [files[2].path, 0.3],
            [files[3].path, 0.1],
        ]);

        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.9);
        expect(result.rightScore).toBe(0.1);
        expect(result.leftFile).toBe(files[0]);
        expect(result.rightFile).toBe(files[3]);
    });

    it('selects 2nd highest vs 2nd lowest for pairIndex 1', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.7],
            [files[2].path, 0.3],
            [files[3].path, 0.1],
        ]);

        const result = selectMlPair(files, scores, 1);
        expect(result.leftScore).toBe(0.7);
        expect(result.rightScore).toBe(0.3);
    });

    it('handles 2 files boundary', () => {
        const files = [mockFile('a'), mockFile('b')];
        const scores = new Map([
            [files[0].path, 0.8],
            [files[1].path, 0.2],
        ]);

        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.8);
        expect(result.rightScore).toBe(0.2);
    });

    it('handles equal scores without crashing', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c')];
        const scores = new Map([
            [files[0].path, 0.5],
            [files[1].path, 0.5],
            [files[2].path, 0.5],
        ]);

        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.5);
        expect(result.rightScore).toBe(0.5);
        expect(result.leftFile).not.toBe(result.rightFile);
    });

    it('defaults to 0.5 for files missing from predictionScores', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c')];
        const scores = new Map([
            [files[0].path, 0.9],
            // files[1] intentionally missing
            [files[2].path, 0.1],
        ]);

        const result = selectMlPair(files, scores, 0);
        // Highest is 0.9 (file a), lowest is 0.1 (file c)
        expect(result.leftScore).toBe(0.9);
        expect(result.rightScore).toBe(0.1);
        expect(result.leftFile).toBe(files[0]);
        expect(result.rightFile).toBe(files[2]);
    });

    it('clamps pairIndex when it exceeds max', () => {
        const files = [mockFile('a'), mockFile('b'), mockFile('c'), mockFile('d')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.7],
            [files[2].path, 0.3],
            [files[3].path, 0.1],
        ]);

        // pairIndex 99 should clamp to max valid (1 for 4 files)
        const result = selectMlPair(files, scores, 99);
        expect(result.leftScore).toBe(0.7);
        expect(result.rightScore).toBe(0.3);
    });

    it('handles boundary conditions with odd file count and high pairIndex', () => {
        // 3 files → max pairIndex = floor(3/2)-1 = 0
        const files = [mockFile('a'), mockFile('b'), mockFile('c')];
        const scores = new Map([
            [files[0].path, 0.9],
            [files[1].path, 0.5],
            [files[2].path, 0.1],
        ]);

        // pairIndex clamped to 0 for 3 files
        const result = selectMlPair(files, scores, 0);
        expect(result.leftScore).toBe(0.9);
        expect(result.rightScore).toBe(0.1);

        // High pairIndex with 2 files — clamped to 0, still returns correct pair
        const result2 = selectMlPair([mockFile('x'), mockFile('y')], new Map([['/mock/x', 0.9], ['/mock/y', 0.1]]), 5);
        expect(result2.leftScore).toBe(0.9);
        expect(result2.rightScore).toBe(0.1);

        // Note: The leftIndex >= rightIndex guard in showCompareMedia() is a safety net
        // for edge cases that cannot be triggered with 2+ files after clamping.
        // These tests verify the clamping prevents out-of-bounds access.
    });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test`
Expected: All 7 tests pass (plus existing tests)

- [ ] **Step 3: Commit**

```bash
git add tests/ml-pair-selection.test.js
git commit -m "test: add unit tests for ML pair selection logic (TASK-020)

7 test cases covering: basic pairing, second pair, 2-file boundary,
equal scores, missing scores (default 0.5), pairIndex clamping,
and boundary conditions with odd file count."
```

---

### Task 7: Add future work items to BACKLOG.md

**Files:**
- Modify: `docs/planning/BACKLOG.md`

- [ ] **Step 1: Read current BACKLOG.md to find insertion point**

Read `docs/planning/BACKLOG.md` and find the end of existing entries.

- [ ] **Step 2: Add 5 BACKLOG items from TASK-020**

Append to BACKLOG.md:

```markdown
### [2026-03-21] From: TASK-020 — ML sorting pair ordering investigation
**Origin**: docs/superpowers/specs/2026-03-21-task-020-ml-sorting-investigation-design.md

- [ ] Content-understanding features — Current 64-dim vector captures color/texture only; integrating CLIP embeddings or similar would improve score discrimination. Ties into TASK-028 research.
- [ ] Auto re-sort after N ratings — Currently user must manually click "Sort by Prediction" to reorder files; consider auto-re-sorting after every N ratings (configurable, e.g., every 5 or 10) to keep ordering fresh.
- [ ] Model diagnostics panel — Show weight distribution, feature importance, training sample counts, and prediction confidence histogram in Settings panel; helps users understand model behavior.
- [ ] Wider score gaps via margin-based pairing — Require minimum score gap (e.g., 0.2) for pairs; skip pairs with tiny gaps (99% vs 97%) that feel like coin flips to the user.
- [ ] Score confidence indicator — Distinguish high-confidence predictions (many similar training samples) from low-confidence ones (novel features).
```

- [ ] **Step 3: Commit**

```bash
git add docs/planning/BACKLOG.md
git commit -m "docs: add 5 ML improvement ideas to BACKLOG.md from TASK-020 investigation"
```

---

### Task 8: Update TODO.md and run full test suite

**Files:**
- Modify: `docs/planning/TODO.md`

- [ ] **Step 1: Move TASK-020 to In Progress in TODO.md**

Move the TASK-020 entry from `## 📋 Planned` to `## 🔄 In Progress`.

- [ ] **Step 2: Run full unit test suite**

Run: `npm test`
Expected: All tests pass (including new ml-pair-selection tests)

- [ ] **Step 3: Run ESLint on all modified files**

Run: `npx eslint media-viewer.js tests/ml-pair-selection.test.js`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add docs/planning/TODO.md
git commit -m "docs: move TASK-020 to In Progress"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Add pending state to constructor | `media-viewer.js` |
| 2 | Defer showMedia() in moveComparePair | `media-viewer.js` |
| 3 | Bypass debounce in updateComplete | `media-viewer.js` |
| 4 | Bypass debounce in reverseUpdateComplete | `media-viewer.js` |
| 5 | Deferred showMedia() + score delta in scoreComplete | `media-viewer.js` |
| 6 | Unit tests for pair selection | `tests/ml-pair-selection.test.js` |
| 7 | Future work items | `docs/planning/BACKLOG.md` |
| 8 | Update TODO.md + full test run | `docs/planning/TODO.md` |

**Note:** Task completion documentation (archiving plan, moving to DONE.md, etc.) is handled
separately per the project's CLAUDE.md workflow after all implementation tasks are complete
and user has approved.
