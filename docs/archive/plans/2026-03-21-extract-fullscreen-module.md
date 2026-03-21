# Extract Fullscreen Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract fullscreen logic from media-viewer.js into a standalone FullscreenManager class, establishing the v2.0 modularization pattern.

**Architecture:** FullscreenManager is a stateful class exported from `fullscreen.js` (ES module). It owns the AbortControllers Map and all fullscreen enter/exit logic. MediaViewer instantiates it with two callbacks (`isZoomed`, `pauseOtherVideos`) and delegates all fullscreen calls to it.

**Tech Stack:** Vanilla JS (ES modules), Electron renderer, Vitest (unit), Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-03-21-task-019-extract-fullscreen-module-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `fullscreen.js` | FullscreenManager class — toggle, cleanup, abortController |
| Modify | `media-viewer.js:1,297,373,1634-1641,1674,1680,2377,2381,2548,2554,3350,3355,3678-3765` | Import FullscreenManager, instantiate, replace 10 call sites, delete 3 methods + 1 property |
| Modify | `eslint.config.mjs:1-12,106-107` | Add block 2c, update header to "Ten file-group blocks" |

---

### Task 1: Create fullscreen.js and add ESLint block 2c

**Files:**
- Create: `fullscreen.js`
- Modify: `eslint.config.mjs:1-12,106-107`

Note: These are combined into one task because the pre-commit hook runs ESLint on staged `.js` files — committing `fullscreen.js` without its ESLint block would fail.

- [ ] **Step 1: Create `fullscreen.js` with the FullscreenManager class**

Write the complete module. This is a direct extraction of three methods from `media-viewer.js` (L3678-L3765), with `this.` references to MediaViewer state replaced by constructor-injected callbacks. This will be the first `import`-able ES module in the project.

```js
/**
 * FullscreenManager — manages fullscreen enter/exit for media wrappers.
 *
 * Extracted from MediaViewer as the first v2.0 modularization step.
 * Pattern: stateful manager with constructor-injected callbacks for
 * host (MediaViewer) dependencies.
 */
export class FullscreenManager {
    /**
     * @param {Object} options
     * @param {(wrapper: HTMLElement) => boolean} options.isZoomed
     *   Returns true if the wrapper's media is zoomed (scale > 1).
     *   Used by click-to-exit handler to prevent exiting while zoomed.
     * @param {(wrapper: HTMLElement) => void} options.pauseOtherVideos
     *   Pauses video elements in other wrappers when entering fullscreen.
     *   Compare mode behavior — pauses the non-fullscreened pane's video.
     */
    constructor({ isZoomed, pauseOtherVideos }) {
        this.abortControllers = new Map(); // Map<HTMLElement, AbortController>
        this.isZoomed = isZoomed;
        this.pauseOtherVideos = pauseOtherVideos;
    }

    /**
     * Toggle fullscreen on a media wrapper element.
     * If already fullscreen, exits. Otherwise enters fullscreen.
     * @param {HTMLElement} wrapper - The .media-wrapper element
     */
    toggle(wrapper) {
        if (wrapper.classList.contains('fullscreen')) {
            this.cleanup(wrapper);
        } else {
            // Get the video element in this wrapper
            const video = wrapper.querySelector('video');
            const wasPlaying = video && !video.paused;

            // Store playback state on wrapper
            wrapper.dataset.wasPlaying = wasPlaying;

            // Pause other videos in compare mode
            this.pauseOtherVideos(wrapper);

            wrapper.classList.add('fullscreen');

            // Add indicator
            const indicator = document.createElement('div');
            indicator.className = 'fullscreen-indicator';
            indicator.textContent = 'Press ESC to exit fullscreen';
            wrapper.appendChild(indicator);

            // Resume video playback if it was playing
            if (video && wasPlaying) {
                // Small delay to ensure fullscreen transition completes
                setTimeout(() => {
                    video.play().catch((err) => console.log('Auto-play prevented:', err));
                }, 100);
            }

            // Click to exit (but not on overlay buttons or when zoomed)
            // Use AbortController so cleanup() can remove this listener
            // regardless of which exit path is taken (click, ESC, Z/X keys)
            const existing = this.abortControllers.get(wrapper);
            if (existing) existing.abort();
            const abortController = new AbortController();
            this.abortControllers.set(wrapper, abortController);
            const exitHandler = (e) => {
                // Don't exit if clicking on overlay buttons (like/dislike/special)
                if (e.target.closest('.overlay-btn') || e.target.closest('.media-overlay-controls')) {
                    return;
                }
                // Don't exit if media is zoomed (use ESC to exit when zoomed)
                if (this.isZoomed(wrapper)) {
                    return;
                }
                this.cleanup(wrapper);
            };
            wrapper.addEventListener('click', exitHandler, { signal: abortController.signal });
        }
    }

    /**
     * Exit fullscreen on a wrapper. Centralized cleanup — ALL exit paths route here.
     * No-op if wrapper is not in fullscreen (guards against double-calls).
     * @param {HTMLElement} wrapper - The .media-wrapper element
     */
    cleanup(wrapper) {
        if (!wrapper.classList.contains('fullscreen')) return;
        // Centralized fullscreen cleanup — ALL exit paths route through here
        // (no-op if wrapper is not in fullscreen; guards against double-calls)
        this.abortController(wrapper);

        wrapper.classList.remove('fullscreen');
        const indicator = wrapper.querySelector('.fullscreen-indicator');
        if (indicator) {
            indicator.remove();
        }

        // Restore video playback state if it was playing before fullscreen
        const video = wrapper.querySelector('video');
        if (video && wrapper.dataset.wasPlaying === 'true') {
            video.play().catch((err) => console.log('Auto-play prevented:', err));
        }
    }

    /**
     * Abort and delete the AbortController for a wrapper.
     * @param {HTMLElement} wrapper - The .media-wrapper element
     */
    abortController(wrapper) {
        const ctrl = this.abortControllers.get(wrapper);
        if (ctrl) {
            ctrl.abort();
            this.abortControllers.delete(wrapper);
        }
    }
}
```

- [ ] **Step 2: Update the ESLint header comment from "Nine" to "Ten" and add block 2c listing**

In `eslint.config.mjs`, change the header (lines 1-12):

```
// Nine file-group blocks:
```
to:
```
// Ten file-group blocks:
```

And add after the `2b` line (line 7):
```
//   2c. Browser renderer modules      — fullscreen.js (ES module, imported by media-viewer.js)
```

- [ ] **Step 3: Insert block 2c after block 2b (after line 106)**

Insert between the closing `},` of block 2b (line 106) and the `// 3a.` comment (line 108):

```js

    // 2c. Browser renderer modules (ES module — imported by media-viewer.js)
    {
        files: ['fullscreen.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },
```

- [ ] **Step 4: Verify lint passes on fullscreen.js**

Run: `npx eslint fullscreen.js`
Expected: No errors, no warnings.

- [ ] **Step 5: Verify lint passes on entire project**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add fullscreen.js eslint.config.mjs
git commit -m "feat: create FullscreenManager module with ESLint config (TASK-019)

Extract fullscreen logic into stateful manager class with
constructor-injected callbacks for isZoomed and pauseOtherVideos.
Add ESLint block 2c (Ten file-group blocks).
First v2.0 modularization step."
```

---

### Task 2: Integrate FullscreenManager into MediaViewer

**Files:**
- Modify: `media-viewer.js`

This task has three sub-steps: add the import + instantiation, rename all call sites, and delete the old methods. Do them in this order to keep the code working at each step.

- [ ] **Step 1: Add import at top of file and instantiate in constructor**

At the very top of `media-viewer.js` (line 1, before the `MinHeap` class), add:

```js
import { FullscreenManager } from './fullscreen.js';

```

In the constructor, replace the fullscreen state line (line 373):

```js
        // Fullscreen state
        this.fullscreenAbortControllers = new Map(); // Map<wrapper, AbortController>
```

with:

```js
        // Fullscreen manager (v2.0 module pattern — stateful manager with callbacks)
        this.fullscreen = new FullscreenManager({
            isZoomed: (wrapper) => {
                const target = wrapper.classList.contains('left-media-wrapper')
                    ? 'left'
                    : wrapper.classList.contains('right-media-wrapper')
                      ? 'right'
                      : 'single';
                return this.zoomState[target] && this.zoomState[target].scale > 1;
            },
            pauseOtherVideos: (wrapper) => {
                if (this.leftMedia && this.leftMedia.tagName === 'VIDEO' && this.leftMediaWrapper !== wrapper) {
                    this.leftMedia.pause();
                }
                if (this.rightMedia && this.rightMedia.tagName === 'VIDEO' && this.rightMediaWrapper !== wrapper) {
                    this.rightMedia.pause();
                }
            },
        });
```

- [ ] **Step 2: Rename all `this.cleanupFullscreen(` call sites to `this.fullscreen.cleanup(`**

There are exactly 6 external call sites. Replace each `this.cleanupFullscreen(` with `this.fullscreen.cleanup(`:

1. Line 1638: `this.cleanupFullscreen(this.leftMediaWrapper);` (ESC key handler)
2. Line 1641: `this.cleanupFullscreen(this.rightMediaWrapper);` (ESC key handler)
3. Line 2377: `this.cleanupFullscreen(this.leftMediaWrapper);` (showCompareMedia)
4. Line 2381: `this.cleanupFullscreen(this.rightMediaWrapper);` (showCompareMedia)
5. Line 3350: `this.cleanupFullscreen(this.leftMediaWrapper);` (toggleViewMode)
6. Line 3355: `this.cleanupFullscreen(this.rightMediaWrapper);` (toggleViewMode)

Do NOT rename the internal calls inside `toggleFullscreen` (line 3680) or `exitHandler` (line 3734) — those methods are deleted in Step 5.

- [ ] **Step 3: Rename all `this.toggleFullscreen(` call sites to `this.fullscreen.toggle(`**

There are exactly 4 call sites (the `toggleFullscreen` method itself calls `this.cleanupFullscreen` internally, but that's inside the method being deleted). Replace each `this.toggleFullscreen(` with `this.fullscreen.toggle(`:

1. Line 1674: `this.toggleFullscreen(this.leftMediaWrapper);` (Z key handler)
2. Line 1680: `this.toggleFullscreen(this.rightMediaWrapper);` (X key handler)
3. Line 2548: `this.toggleFullscreen(this.leftMediaWrapper);` (left wrapper click)
4. Line 2554: `this.toggleFullscreen(this.rightMediaWrapper);` (right wrapper click)

Search for `this.toggleFullscreen(` to find all of them. Do NOT rename the method definition itself (line ~3678) — that gets deleted in Step 5.

- [ ] **Step 4: Rename `this.abortFullscreenController(` call sites (if any external ones exist)**

Search for `this.abortFullscreenController(`. Per the spec review, this should have NO external callers — it's only called inside `cleanupFullscreen()` which is being deleted. Verify this: if the search only finds the method definition (line ~3759) and the internal call from `cleanupFullscreen` (line ~3744), skip this step. If there are external callers, rename them to `this.fullscreen.abortController(`.

- [ ] **Step 5: Delete the three old methods and the `fullscreenAbortControllers` comment**

Delete the following methods from MediaViewer (they now live in `fullscreen.js`):

1. `toggleFullscreen(wrapper)` — lines ~3678-3737
2. `cleanupFullscreen(wrapper)` — lines ~3740-3757
3. `abortFullscreenController(wrapper)` — lines ~3759-3765

These are consecutive in the file, between `this.isBeingCleaned = false;` (end of `cleanupCompareMedia`) and `// Visual Similarity Sorting Functions`. Delete from `toggleFullscreen(wrapper) {` through the closing `}` of `abortFullscreenController`, preserving the blank line and `// Visual Similarity Sorting Functions` comment after.

- [ ] **Step 6: Run unit tests**

Run: `npm test`
Expected: All 103 tests pass (no fullscreen unit tests exist, so this is a regression check).

- [ ] **Step 7: Run lint**

Run: `npm run lint`
Expected: No errors. The `FullscreenManager` import is used, old methods are gone, all call sites updated.

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js
git commit -m "refactor: integrate FullscreenManager into MediaViewer (TASK-019)

- Import FullscreenManager from ./fullscreen.js
- Instantiate with isZoomed and pauseOtherVideos callbacks
- Rename 10 call sites: toggle/cleanup/abortController
- Delete 3 methods + fullscreenAbortControllers Map from MediaViewer
- Net reduction: ~85 lines from media-viewer.js"
```

---

### Task 3: Run E2E tests and verify

**Files:** None (verification only)

- [ ] **Step 1: Run the full E2E test suite**

Run: `npm run test:e2e`
Expected: All tests pass, including `fullscreen.test.js` which exercises Z/X keys and Escape exit.

- [ ] **Step 2: If any tests fail, debug and fix**

The most likely failure mode is a timing issue or a selector change. The E2E tests use `page.evaluate()` to call methods like `window.mediaViewer.toggleFullscreen()` — if any test calls the old method name directly, it will need updating to `window.mediaViewer.fullscreen.toggle()`. Search the E2E test files:

```bash
grep -r "toggleFullscreen\|cleanupFullscreen\|abortFullscreenController" tests/e2e/
```

If matches are found, update them. If no matches, the tests use keyboard shortcuts (Z/X/Escape) which go through the keydown handler and will work without changes.

- [ ] **Step 3: Commit any E2E fixes (if needed)**

```bash
git add tests/e2e/
git commit -m "test: update E2E tests for FullscreenManager API (TASK-019)"
```

---

### Task 4: Update documentation

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: Add v2.0 modularization decision to PROJECT_CONTEXT.md**

In the "Architecture Decisions" table in `docs/PROJECT_CONTEXT.md`, add a new row:

```markdown
| Module extraction pattern | Stateful manager + callbacks | Clean boundaries, testable in isolation, no `this` coupling to host; first extraction: FullscreenManager | 2026-03 |
```

- [ ] **Step 2: Commit documentation**

```bash
git add docs/PROJECT_CONTEXT.md
git commit -m "docs: document v2.0 modularization pattern decision (TASK-019)

Add architecture decision for stateful manager + constructor-injected
callbacks as the standard module extraction pattern."
```

---

## Summary

| Task | What | Files | Commits |
|------|------|-------|---------|
| 1 | Create FullscreenManager module + ESLint block 2c | `fullscreen.js`, `eslint.config.mjs` | 1 |
| 2 | Integrate into MediaViewer | `media-viewer.js` | 1 |
| 3 | E2E verification | `tests/e2e/` (if needed) | 0-1 |
| 4 | Documentation | `docs/PROJECT_CONTEXT.md` | 1 |

**Total: 4 tasks, 3-4 commits, ~85 lines removed from media-viewer.js**
