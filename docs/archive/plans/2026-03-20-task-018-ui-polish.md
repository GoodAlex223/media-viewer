# TASK-018: UI Polish — Button Press Effects and Fullscreen Guard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `:active` press animation to all `.control-btn` elements and add an early-return guard to `cleanupFullscreen()`.

**Architecture:** Pure CSS for button press feedback (no JS). Single-line guard in `cleanupFullscreen()` to prevent redundant operations on double-calls. Two independent changes — CSS in `styles.css`, JS in `media-viewer.js`.

**Tech Stack:** CSS pseudo-classes, vanilla JS

**Spec:** `docs/superpowers/specs/2026-03-20-task-018-ui-polish-design.md`

**Branch:** `feature/task-018-ui-polish` (already created and checked out)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `styles.css:1060` | Add `.control-btn:active:not(:disabled)` rule after `.overlay-zoom-btn:hover:not(:disabled)` |
| Modify | `media-viewer.js:3740` | Add early-return guard to `cleanupFullscreen()` |

---

## Task 1: Button Press `:active` Effect

**Files:**
- Modify: `styles.css:1060` (insert after `.overlay-zoom-btn:hover:not(:disabled)` closing brace)

- [ ] **Step 1: Add the `:active` rule**

Insert after line 1060 (the closing `}` of `.overlay-zoom-btn:hover:not(:disabled)`), before the `/* Zoom popover */` comment at line 1062:

```css
.control-btn:active:not(:disabled) {
    transform: scale(0.93);
    opacity: 0.85;
    transition-duration: 50ms;
}
```

This must go **after** all per-button `:hover` rules so that at equal specificity (0, 3, 0), source order gives `:active` precedence over `:hover` during simultaneous hover+press. The per-button hover rules are:
- `.like-btn:hover:not(:disabled)` (line 642)
- `.dislike-btn:hover:not(:disabled)` (line 655)
- `.cancel-btn:hover:not(:disabled)` (line 668)
- `.special-btn:hover:not(:disabled)` (line 681)
- `.zoom-toggle-btn:hover:not(:disabled)` (line 1037)
- `.overlay-zoom-btn:hover:not(:disabled)` (line 1056) — **last one**

- [ ] **Step 2: Run Prettier to format and verify**

Run: `npx prettier --write styles.css && npx prettier --check styles.css`
Expected: File formatted (if needed) and check passes

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: All tests pass (CSS-only change, no unit test impact)

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "feat: Add :active press animation to control buttons

Scale-down (0.93) + opacity (0.85) with 50ms transition for snappy
press feedback. Placed after all per-button :hover rules for correct
source-order specificity tie-breaking."
```

---

## Task 2: Fullscreen Early-Return Guard

**Files:**
- Modify: `media-viewer.js:3740` (add guard at top of `cleanupFullscreen()`)

No new tests added — the double-call scenario (e.g., ESC after Z key) is a redundant-operation guard, not a behavior change. Existing E2E tests in `tests/e2e/fullscreen.test.js` exercise the normal cleanup path and will catch any regression from the guard.

- [ ] **Step 1: Add the guard**

At line 3740, the current `cleanupFullscreen()` starts:

```js
cleanupFullscreen(wrapper) {
    // Centralized fullscreen cleanup — ALL exit paths route through here:
    // graceful (click, ESC, Z/X) and destructive (mode switch, pair navigation)
    this.abortFullscreenController(wrapper);
```

Change to:

```js
cleanupFullscreen(wrapper) {
    if (!wrapper.classList.contains('fullscreen')) return;
    // Centralized fullscreen cleanup — ALL exit paths route through here:
    // graceful (click, ESC, Z/X) and destructive (mode switch, pair navigation)
    this.abortFullscreenController(wrapper);
```

This prevents redundant `video.play()` calls when `cleanupFullscreen()` is called on a wrapper that is not in fullscreen (e.g., ESC after Z key already exited).

- [ ] **Step 2: Run linter**

Run: `npx eslint media-viewer.js`
Expected: No new warnings or errors

- [ ] **Step 3: Run unit tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Run E2E tests**

Run: `npm run test:e2e`
Expected: All E2E tests pass (fullscreen tests exercise the cleanup path)

- [ ] **Step 5: Commit**

```bash
git add media-viewer.js
git commit -m "fix: Add early-return guard in cleanupFullscreen()

Skip cleanup when wrapper is not in fullscreen state. Prevents
redundant video.play() calls on double-invocations (e.g., ESC
after Z key)."
```

---

## Task 3: Final Verification and CLAUDE.md Update

**Files:**
- Modify: `CLAUDE.md` (update Git Insights section)

- [ ] **Step 1: Run full test suite**

Run: `npm test && npm run test:e2e`
Expected: All unit and E2E tests pass

- [ ] **Step 2: Run full lint check**

Run: `npm run lint && npm run format:check`
Expected: No errors, no formatting issues

- [ ] **Step 3: Update CLAUDE.md Git Insights**

Replace the existing planned TASK-018 bullet (line 245):

```markdown
- TASK-018 🟡: UI polish — add `:active` press animation to all `.control-btn` elements; add early-return guard in cleanupFullscreen() when wrapper is not in fullscreen
```

With the completion bullet:

```markdown
- TASK-018 completed: UI polish — added `:active` press animation to all `.control-btn` elements (scale-down + opacity with 50ms transition); added early-return guard in `cleanupFullscreen()` when wrapper is not in fullscreen
```

- [ ] **Step 4: Commit CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "docs: Update CLAUDE.md with TASK-018 changes"
```
