# TASK-019: Extract Fullscreen Module from media-viewer.js

**Date**: 2026-03-21
**Status**: Approved
**Approach**: Stateful manager object (Option B)

---

## Problem

`media-viewer.js` is ~6650 lines. TASK-019 begins the v2.0 modularization effort by extracting fullscreen logic into a separate module. This is architecturally significant because it establishes the extraction pattern (stateful manager with constructor-injected callbacks) that all future module extractions will follow.

## Design

### Module: `fullscreen.js`

New file at project root. ES module (`export class`), imported by `media-viewer.js` via native `import` (already loaded as `<script type="module">`). Browser-only module — depends on DOM APIs (`document.createElement`, `classList`, `dataset`).

#### Class: `FullscreenManager`

```js
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

    toggle(wrapper)          // Enter or exit fullscreen on a wrapper
    cleanup(wrapper)         // Exit fullscreen — all exit paths route here
    abortController(wrapper) // Abort and delete the AbortController for a wrapper
}
```

**State owned**:
- `abortControllers` Map (moved from `MediaViewer.fullscreenAbortControllers`)
- `wasPlaying` playback state stored on wrapper elements via `wrapper.dataset.wasPlaying` (DOM-resident, not in manager properties)

**Constructor callbacks**:
- `isZoomed(wrapper)` — checks zoom state to prevent click-to-exit while zoomed
- `pauseOtherVideos(wrapper)` — pauses videos in non-target wrappers on enter

### Method: `toggle(wrapper)`

Logic moved from `MediaViewer.toggleFullscreen()` (~60 lines, L3678-L3737):

- If wrapper has `.fullscreen` class: delegate to `this.cleanup(wrapper)`
- Else: save video playback state, call `this.pauseOtherVideos(wrapper)`, add `.fullscreen` class, create indicator element, resume video if was playing, set up click-to-exit handler with AbortController (excludes clicks on `.overlay-btn` and `.media-overlay-controls`; uses `this.isZoomed(wrapper)` guard to prevent exit while zoomed)

### Method: `cleanup(wrapper)`

Logic moved from `MediaViewer.cleanupFullscreen()` (~17 lines, L3740-L3757):

- Early-return guard: skip if wrapper lacks `.fullscreen` class
- Call `this.abortController(wrapper)` to remove click listener
- Remove `.fullscreen` class and `.fullscreen-indicator` element
- Restore video playback state

### Method: `abortController(wrapper)`

Logic moved from `MediaViewer.abortFullscreenController()` (~6 lines, L3759-L3764):

- Get controller from Map, abort it, delete from Map

## Integration with MediaViewer

### Instantiation

In MediaViewer constructor, after state initialization:

```js
import { FullscreenManager } from './fullscreen.js';

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

### Call Site Changes

Mechanical renames, no logic changes:

| Current | New |
|---------|-----|
| `this.toggleFullscreen(wrapper)` | `this.fullscreen.toggle(wrapper)` |
| `this.cleanupFullscreen(wrapper)` | `this.fullscreen.cleanup(wrapper)` |
| `this.abortFullscreenController(wrapper)` | `this.fullscreen.abortController(wrapper)` |

10 external call sites to rename (5 `toggleFullscreen` → `fullscreen.toggle`, 5 `cleanupFullscreen` → `fullscreen.cleanup`), plus 1 constructor property removal. `abortFullscreenController` has no external callers — only called internally within `cleanupFullscreen`, so it moves wholesale into the manager.

### Removed from MediaViewer

- `toggleFullscreen()` method
- `cleanupFullscreen()` method
- `abortFullscreenController()` method
- `fullscreenAbortControllers` Map property in constructor

### Kept in MediaViewer

- All call sites (they delegate to `this.fullscreen.*`)
- `isInFullscreen` local helper in `setupZoomEvents()` — one-liner DOM check, not part of fullscreen domain

## ESLint Configuration

New block `2c` in `eslint.config.mjs`, inserted after existing block `2b` (face-detector.js):

```js
// 2c. Browser renderer modules (ES module -- imported by media-viewer.js)
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

Header comment updated from "Nine file-group blocks" to "Ten file-group blocks" with new block listed.

## What Does NOT Change

- **CSS**: `.fullscreen` class rules stay in `styles.css`
- **`index.html`**: No new `<script>` tag — `fullscreen.js` is imported by the module `media-viewer.js`
- **`isInFullscreen`** local in `setupZoomEvents`: stays as-is (one-liner, not fullscreen domain)

## Testing Strategy

- **Unit tests** (`npm test`): Must pass (regression check; no fullscreen unit tests exist today)
- **E2E tests** (`npm run test:e2e`): Must pass — `fullscreen.test.js` exercises Z/X keys and Escape through MediaViewer's delegation, validating the extracted code
- **No new unit tests** in this task — E2E already covers the behavior; dedicated FullscreenManager unit tests are a follow-up opportunity

## Pattern Established for v2.0

This extraction establishes the template for future modularization:

1. **Stateful manager class** — owns its domain state, exported from its own ES module
2. **Constructor-injected callbacks** — explicit dependencies on host (MediaViewer) state, no `this` coupling
3. **Delegation from host** — MediaViewer instantiates manager and delegates calls; call sites change from `this.methodName()` to `this.manager.methodName()`
4. **ESLint block per module** — browser module with only the globals it actually needs
5. **Native ES module import** — no bundler, leveraging existing `<script type="module">` loading

Future candidates: ZoomManager, CompareManager, SortingManager, MLManager.
