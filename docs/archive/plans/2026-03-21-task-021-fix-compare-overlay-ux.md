# TASK-021: Fix Compare Mode Overlay Controls UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix overlay control buttons in compare mode (and single mode) so they are reachable, clickable, and don't overlap video player controls.

**Architecture:** Pure CSS fix — change `position: fixed` to `position: absolute` so buttons stay inside the wrapper's hover area; add `transition-delay` for 500ms hide linger; uniform `bottom: 56px` to clear native video controls. One-line JS cleanup to remove obsolete side-specific CSS class assignment.

**Tech Stack:** CSS, JavaScript (Electron renderer)

**Spec:** `docs/superpowers/specs/2026-03-21-task-021-fix-compare-overlay-ux-design.md`

---

### Task 1: Update `.media-overlay-controls` base CSS rule

**Files:**
- Modify: `styles.css:1585-1594`

- [ ] **Step 1: Edit the `.media-overlay-controls` rule**

Change lines 1585-1594 from:

```css
.media-overlay-controls {
    position: fixed;
    bottom: 100px;
    display: flex;
    gap: 15px;
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: none;
    z-index: 10;
}
```

To:

```css
.media-overlay-controls {
    position: absolute;
    bottom: 56px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 15px;
    opacity: 0;
    transition: opacity 0.3s ease;
    transition-delay: 500ms;
    pointer-events: none;
    z-index: 10;
}
```

Changes:
- `position: fixed` → `position: absolute` (wrapper-relative, stays inside hover area)
- `bottom: 100px` → `bottom: 56px` (clears native video controls ~40px + 16px gap)
- Added `left: 50%; transform: translateX(-50%)` (uniform centering within wrapper)
- Added `transition-delay: 500ms` (buttons linger 500ms after cursor leaves)

---

### Task 2: Remove side-specific CSS classes

**Files:**
- Modify: `styles.css:1596-1602`

- [ ] **Step 1: Delete the `.media-overlay-controls-left` and `.media-overlay-controls-right` rules**

Remove lines 1596-1602:

```css
.media-overlay-controls-left {
    left: 25%;
}

.media-overlay-controls-right {
    right: 25%;
}
```

These are no longer needed — centering is handled by `left: 50%; transform: translateX(-50%)` on the base rule.

---

### Task 3: Add `transition-delay: 0s` to hover rule

**Files:**
- Modify: `styles.css:1604-1607` (line numbers after Task 2 deletion — will be ~1596-1599)

- [ ] **Step 1: Add `transition-delay: 0s` to the hover rule**

Change:

```css
.media-wrapper:hover .media-overlay-controls {
    opacity: 1;
    pointer-events: auto;
}
```

To:

```css
.media-wrapper:hover .media-overlay-controls {
    opacity: 1;
    pointer-events: auto;
    transition-delay: 0s;
}
```

This overrides the 500ms delay so buttons appear instantly on hover (delay only applies to hide).

---

### Task 4: Remove side-specific class from JS

**Files:**
- Modify: `media-viewer.js:2610`

- [ ] **Step 1: Remove the side-specific CSS class from `addMediaOverlayControls()`**

Change line 2610 from:

```javascript
controls.className = `media-overlay-controls media-overlay-controls-${side}`;
```

To:

```javascript
controls.className = 'media-overlay-controls';
```

The `side` parameter is still used by the function for button titles (lines 2615, 2625), click handlers (lines 2618-2619, 2628-2629), special folder moves (line 2641), and zoom popover targeting (lines 2660-2661) — only the CSS class assignment is removed.

---

### Task 5: Commit implementation

- [ ] **Step 1: Run lint and format checks**

Run: `npx eslint media-viewer.js && npx prettier --check styles.css`
Expected: No errors

- [ ] **Step 2: Run unit tests**

Run: `npm test`
Expected: All tests pass (CSS/DOM changes don't affect unit-tested code paths)

- [ ] **Step 3: Run E2E tests**

Run: `npm run test:e2e`
Expected: All tests pass (E2E tests use `{ force: true }` or `page.evaluate()`, unaffected by CSS position changes)

- [ ] **Step 4: Commit**

```bash
git add styles.css media-viewer.js
git commit -m "fix: overlay controls positioning and hover behavior (TASK-021)

- Change position: fixed → absolute so buttons stay inside wrapper hover area
- Add 500ms transition-delay on hide (instant show) for comfortable reach
- Set bottom: 56px to clear native video controls
- Center with left: 50% + transform: translateX(-50%)
- Remove obsolete side-specific CSS classes and JS class assignment
- Applies to both compare mode and single mode

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Launch app and open a folder with images**

Run: `npm start`

- [ ] **Step 2: Verify single mode overlay**
- Hover over media → buttons appear instantly
- Move cursor away → buttons linger ~500ms then fade
- Move cursor from media directly to a button → button stays visible and clickable
- Click each button (like, dislike, special, zoom) → all work

- [ ] **Step 3: Switch to compare mode (C key) and verify**
- Hover over left pane → buttons appear centered below media
- Hover over right pane → buttons appear centered below media
- Move cursor to buttons → buttons remain clickable
- Click like/dislike/special/zoom on both panes → all work

- [ ] **Step 4: Verify with video media**
- Open a folder with video files
- Overlay buttons should NOT overlap native video player controls (play, seek, volume)
- Both single and compare mode

- [ ] **Step 5: Verify fullscreen mode**
- Enter fullscreen (Z key) → overlay buttons should be hidden
- Exit fullscreen → overlay buttons reappear on hover

- [ ] **Step 6: Verify window resize**
- Resize window → buttons remain centered within each pane
