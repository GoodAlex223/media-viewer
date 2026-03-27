# Keyboard Shortcut Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to customize keyboard shortcuts for rating and navigation actions, with unified QWER+AD defaults for both single and compare modes.

**Architecture:** A `DEFAULT_SHORTCUTS` object defines all shortcut-to-action mappings. Custom overrides merge from localStorage. The keydown handler uses a reverse lookup map (key → action) instead of hardcoded switch/case. The help overlay renders shortcuts dynamically and supports click-to-remap with conflict detection.

**Tech Stack:** Vanilla JS (MediaViewer class), HTML/CSS, localStorage, Vitest (unit), Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-03-27-task-026-keyboard-shortcut-customization-design.md`

---

## File Structure

| File | Role |
|------|------|
| `media-viewer.js` | Add DEFAULT_SHORTCUTS constant, shortcut loading/merging/saving, reverse map builder, buildKeyString(), executeAction(), refactored keydown handler, help overlay rendering, listening mode logic |
| `index.html` | Replace static shortcut HTML sections with container divs for dynamic injection; add Reset to Defaults button |
| `styles.css` | Add .shortcut-key (editable), .shortcut-key:hover, .shortcut-key.listening, .shortcut-conflict-warning styles |
| `tests/keyboard-shortcuts.test.js` | Unit tests for buildKeyString, shortcut map merge, reverse map, conflict detection, executeAction |
| `tests/e2e/keyboard-shortcuts.test.js` | E2E tests for remap, conflict, reset, persistence |
| `tests/e2e/rating.test.js` | Update existing tests: ArrowUp→Q, ArrowDown→W, Ctrl+ArrowLeft→Ctrl+A |
| `tests/e2e/navigation.test.js` | Update existing tests: ArrowRight→D, ArrowLeft→A |
| `tests/e2e/compare-mode.test.js` | Update existing test: ArrowRight→D for compare navigation |

---

### Task 1: Add DEFAULT_SHORTCUTS constant and shortcut loading/merging

**Files:**
- Modify: `media-viewer.js` (top-level constant + constructor)
- Test: `tests/keyboard-shortcuts.test.js`

- [ ] **Step 1: Create test file with shortcut map merge tests**

Create `tests/keyboard-shortcuts.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// Extract the DEFAULT_SHORTCUTS constant from source
function extractDefaultShortcuts() {
    const match = source.match(/const DEFAULT_SHORTCUTS\s*=\s*(\{[\s\S]*?\n\});/);
    if (!match) throw new Error('Could not find DEFAULT_SHORTCUTS');
    return new Function(`return ${match[1]}`)();
}

// Extract method bodies using brace-counting (same pattern as media-viewer-utils.test.js)
function extractMethod(methodName) {
    const regex = new RegExp(`^\\s{4}${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = source.match(regex);
    if (!match) throw new Error(`Could not find method: ${methodName}`);
    const startIndex = match.index;
    let braceCount = 0;
    let methodEnd = -1;
    const searchStart = startIndex + match[0].length - 1;
    for (let i = searchStart; i < source.length; i++) {
        if (source[i] === '{') braceCount++;
        if (source[i] === '}') braceCount--;
        if (braceCount === 0) { methodEnd = i + 1; break; }
    }
    const methodBody = source.substring(searchStart + 1, methodEnd - 1);
    return new Function(match[1], methodBody);
}

describe('DEFAULT_SHORTCUTS', () => {
    it('has single and compare modes', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts).toHaveProperty('single');
        expect(shortcuts).toHaveProperty('compare');
    });

    it('single mode has like, dislike, next, previous, undo', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.single).toEqual({
            like: 'KeyQ',
            dislike: 'KeyW',
            next: 'KeyD',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
        });
    });

    it('compare mode has left/right like/dislike, next, previous, undo', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.compare).toEqual({
            leftLike: 'KeyQ',
            leftDislike: 'KeyW',
            rightLike: 'KeyE',
            rightDislike: 'KeyR',
            next: 'KeyD',
            previous: 'KeyA',
            undo: 'Ctrl+KeyA',
        });
    });
});

describe('loadShortcuts', () => {
    const loadShortcuts = extractMethod('loadShortcuts');

    it('returns defaults when no custom shortcuts in localStorage', () => {
        const defaults = extractDefaultShortcuts();
        const ctx = {
            localStorage: { getItem: () => null },
        };
        // loadShortcuts reads from localStorage and returns merged shortcuts
        // We test by calling with a mock context
        const result = loadShortcuts.call(ctx);
        expect(result.single).toEqual(defaults.single);
        expect(result.compare).toEqual(defaults.compare);
    });

    it('merges custom overrides with defaults', () => {
        const customShortcuts = {
            single: { like: 'KeyT' },
        };
        const ctx = {
            localStorage: { getItem: () => JSON.stringify(customShortcuts) },
        };
        const result = loadShortcuts.call(ctx);
        expect(result.single.like).toBe('KeyT');
        expect(result.single.dislike).toBe('KeyW'); // default preserved
        expect(result.compare.leftLike).toBe('KeyQ'); // compare untouched
    });

    it('handles invalid JSON in localStorage gracefully', () => {
        const ctx = {
            localStorage: { getItem: () => 'not-json' },
        };
        const result = loadShortcuts.call(ctx);
        const defaults = extractDefaultShortcuts();
        expect(result.single).toEqual(defaults.single);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: FAIL — cannot find DEFAULT_SHORTCUTS or loadShortcuts method

- [ ] **Step 3: Add DEFAULT_SHORTCUTS constant to media-viewer.js**

Add at the top of `media-viewer.js`, before the `class MediaViewer` declaration (after the existing imports):

```js
const DEFAULT_SHORTCUTS = {
    single: {
        like: 'KeyQ',
        dislike: 'KeyW',
        next: 'KeyD',
        previous: 'KeyA',
        undo: 'Ctrl+KeyA',
    },
    compare: {
        leftLike: 'KeyQ',
        leftDislike: 'KeyW',
        rightLike: 'KeyE',
        rightDislike: 'KeyR',
        next: 'KeyD',
        previous: 'KeyA',
        undo: 'Ctrl+KeyA',
    },
};
```

- [ ] **Step 4: Add loadShortcuts() method to MediaViewer class**

Add as a new method in MediaViewer (near constructor or utility methods):

```js
    loadShortcuts() {
        const raw = localStorage.getItem('customShortcuts');
        let custom = {};
        if (raw) {
            try {
                custom = JSON.parse(raw);
            } catch (_e) {
                // Invalid JSON — ignore and use defaults
            }
        }
        return {
            single: Object.assign({}, DEFAULT_SHORTCUTS.single, custom.single),
            compare: Object.assign({}, DEFAULT_SHORTCUTS.compare, custom.compare),
        };
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js
git commit -m "feat(TASK-026): add DEFAULT_SHORTCUTS constant and loadShortcuts method"
```

---

### Task 2: Add buildKeyString and reverse map builder

**Files:**
- Modify: `media-viewer.js`
- Modify: `tests/keyboard-shortcuts.test.js`

- [ ] **Step 1: Add unit tests for buildKeyString and buildReverseMap**

Append to `tests/keyboard-shortcuts.test.js`:

```js
describe('buildKeyString', () => {
    const buildKeyString = extractMethod('buildKeyString');

    it('returns e.code for simple key', () => {
        const e = { code: 'KeyQ', ctrlKey: false, shiftKey: false };
        expect(buildKeyString.call({}, e)).toBe('KeyQ');
    });

    it('prepends Ctrl+ when ctrlKey is true', () => {
        const e = { code: 'KeyA', ctrlKey: true, shiftKey: false };
        expect(buildKeyString.call({}, e)).toBe('Ctrl+KeyA');
    });

    it('prepends Shift+ when shiftKey is true', () => {
        const e = { code: 'KeyD', ctrlKey: false, shiftKey: true };
        expect(buildKeyString.call({}, e)).toBe('Shift+KeyD');
    });

    it('prepends both Ctrl+Shift+ when both are true', () => {
        const e = { code: 'KeyZ', ctrlKey: true, shiftKey: true };
        expect(buildKeyString.call({}, e)).toBe('Ctrl+Shift+KeyZ');
    });

    it('handles non-letter codes', () => {
        const e = { code: 'Space', ctrlKey: false, shiftKey: false };
        expect(buildKeyString.call({}, e)).toBe('Space');
    });
});

describe('buildReverseMap', () => {
    const buildReverseMap = extractMethod('buildReverseMap');

    it('builds correct reverse map for single mode', () => {
        const shortcuts = extractDefaultShortcuts();
        const ctx = { shortcuts };
        const result = buildReverseMap.call(ctx);
        expect(result.single['KeyQ']).toBe('like');
        expect(result.single['KeyW']).toBe('dislike');
        expect(result.single['KeyD']).toBe('next');
        expect(result.single['KeyA']).toBe('previous');
        expect(result.single['Ctrl+KeyA']).toBe('undo');
    });

    it('builds correct reverse map for compare mode', () => {
        const shortcuts = extractDefaultShortcuts();
        const ctx = { shortcuts };
        const result = buildReverseMap.call(ctx);
        expect(result.compare['KeyQ']).toBe('leftLike');
        expect(result.compare['KeyE']).toBe('rightLike');
        expect(result.compare['KeyR']).toBe('rightDislike');
    });

    it('reverse map reflects custom overrides', () => {
        const shortcuts = {
            single: { like: 'KeyT', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
        };
        const ctx = { shortcuts };
        const result = buildReverseMap.call(ctx);
        expect(result.single['KeyT']).toBe('like');
        expect(result.single['KeyQ']).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: FAIL — cannot find buildKeyString or buildReverseMap

- [ ] **Step 3: Add buildKeyString() method**

Add to MediaViewer class:

```js
    buildKeyString(e) {
        let key = '';
        if (e.ctrlKey) key += 'Ctrl+';
        if (e.shiftKey) key += 'Shift+';
        key += e.code;
        return key;
    }
```

- [ ] **Step 4: Add buildReverseMap() method**

Add to MediaViewer class:

```js
    buildReverseMap() {
        const reverse = { single: {}, compare: {} };
        for (const mode of ['single', 'compare']) {
            for (const [action, key] of Object.entries(this.shortcuts[mode])) {
                reverse[mode][key] = action;
            }
        }
        return reverse;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js
git commit -m "feat(TASK-026): add buildKeyString and buildReverseMap methods"
```

---

### Task 3: Add executeAction dispatcher and conflict detection

**Files:**
- Modify: `media-viewer.js`
- Modify: `tests/keyboard-shortcuts.test.js`

- [ ] **Step 1: Add unit tests for executeAction and conflict detection**

Append to `tests/keyboard-shortcuts.test.js`:

```js
describe('executeAction', () => {
    const executeAction = extractMethod('executeAction');

    it('calls handleLike for "like" action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'like');
        expect(ctx.handleLike).toHaveBeenCalledOnce();
        expect(ctx.handleDislike).not.toHaveBeenCalled();
    });

    it('calls nextMedia for "next" action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'next');
        expect(ctx.nextMedia).toHaveBeenCalledOnce();
    });

    it('calls handleRightDislike for "rightDislike" action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'rightDislike');
        expect(ctx.handleRightDislike).toHaveBeenCalledOnce();
    });

    it('does nothing for unknown action', () => {
        const ctx = {
            handleLike: vi.fn(),
            handleDislike: vi.fn(),
            nextMedia: vi.fn(),
            previousMedia: vi.fn(),
            handleCancel: vi.fn(),
            handleLeftLike: vi.fn(),
            handleLeftDislike: vi.fn(),
            handleRightLike: vi.fn(),
            handleRightDislike: vi.fn(),
        };
        executeAction.call(ctx, 'nonexistent');
        expect(ctx.handleLike).not.toHaveBeenCalled();
        expect(ctx.nextMedia).not.toHaveBeenCalled();
    });
});

describe('checkShortcutConflict', () => {
    const checkShortcutConflict = extractMethod('checkShortcutConflict');

    it('returns null when key is not in use', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyT')).toBeNull();
    });

    it('returns conflicting action name when key is already used', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyW')).toBe('dislike');
    });

    it('allows reassigning same key to same action', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            },
        };
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyQ')).toBeNull();
    });

    it('checks only within the same mode', () => {
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            },
        };
        // KeyE is used in compare mode but not in single mode
        expect(checkShortcutConflict.call(ctx, 'single', 'like', 'KeyE')).toBeNull();
    });
});
```

Add `vi` to the import at top of file:

```js
import { describe, it, expect, vi } from 'vitest';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: FAIL — cannot find executeAction or checkShortcutConflict

- [ ] **Step 3: Add executeAction() method**

Add to MediaViewer class:

```js
    executeAction(action) {
        const actions = {
            like: () => this.handleLike(),
            dislike: () => this.handleDislike(),
            next: () => this.nextMedia(),
            previous: () => this.previousMedia(),
            undo: () => this.handleCancel(),
            leftLike: () => this.handleLeftLike(),
            leftDislike: () => this.handleLeftDislike(),
            rightLike: () => this.handleRightLike(),
            rightDislike: () => this.handleRightDislike(),
        };
        actions[action]?.();
    }
```

- [ ] **Step 4: Add checkShortcutConflict() method**

Add to MediaViewer class:

```js
    checkShortcutConflict(mode, currentAction, newKey) {
        for (const [action, key] of Object.entries(this.shortcuts[mode])) {
            if (key === newKey && action !== currentAction) {
                return action;
            }
        }
        return null;
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js
git commit -m "feat(TASK-026): add executeAction dispatcher and checkShortcutConflict"
```

---

### Task 4: Add saveShortcut and resetShortcuts methods

**Files:**
- Modify: `media-viewer.js`
- Modify: `tests/keyboard-shortcuts.test.js`

- [ ] **Step 1: Add unit tests for saveShortcut and resetShortcuts**

Append to `tests/keyboard-shortcuts.test.js`:

```js
describe('saveShortcut', () => {
    const saveShortcut = extractMethod('saveShortcut');

    it('updates shortcut map and saves to localStorage', () => {
        const stored = {};
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                return { single: {}, compare: {} };
            },
            localStorage: {
                setItem: (k, v) => { stored[k] = v; },
            },
        };
        saveShortcut.call(ctx, 'single', 'like', 'KeyT');
        expect(ctx.shortcuts.single.like).toBe('KeyT');
        const saved = JSON.parse(stored.customShortcuts);
        expect(saved.single.like).toBe('KeyT');
    });

    it('rebuilds reverse map after save', () => {
        let rebuildCalled = false;
        const ctx = {
            shortcuts: {
                single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                rebuildCalled = true;
                return { single: {}, compare: {} };
            },
            localStorage: { setItem: () => {} },
        };
        saveShortcut.call(ctx, 'single', 'like', 'KeyT');
        expect(rebuildCalled).toBe(true);
    });
});

describe('resetShortcuts', () => {
    const resetShortcuts = extractMethod('resetShortcuts');

    it('restores defaults and clears localStorage', () => {
        let removedKey = null;
        const defaults = extractDefaultShortcuts();
        const ctx = {
            shortcuts: {
                single: { like: 'KeyT', dislike: 'KeyW', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                compare: { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR', next: 'KeyD', previous: 'KeyA', undo: 'Ctrl+KeyA' },
            },
            shortcutReverseMap: { single: {}, compare: {} },
            buildReverseMap() {
                return { single: {}, compare: {} };
            },
            localStorage: {
                removeItem: (k) => { removedKey = k; },
            },
        };
        resetShortcuts.call(ctx);
        expect(ctx.shortcuts.single).toEqual(defaults.single);
        expect(ctx.shortcuts.compare).toEqual(defaults.compare);
        expect(removedKey).toBe('customShortcuts');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: FAIL — cannot find saveShortcut or resetShortcuts

- [ ] **Step 3: Add saveShortcut() method**

Add to MediaViewer class:

```js
    saveShortcut(mode, action, newKey) {
        this.shortcuts[mode][action] = newKey;
        this.shortcutReverseMap = this.buildReverseMap();

        // Save only the diff from defaults to localStorage
        const custom = {};
        for (const m of ['single', 'compare']) {
            const diff = {};
            for (const [act, key] of Object.entries(this.shortcuts[m])) {
                if (key !== DEFAULT_SHORTCUTS[m][act]) {
                    diff[act] = key;
                }
            }
            if (Object.keys(diff).length > 0) {
                custom[m] = diff;
            }
        }
        if (Object.keys(custom).length > 0) {
            localStorage.setItem('customShortcuts', JSON.stringify(custom));
        } else {
            localStorage.removeItem('customShortcuts');
        }
    }
```

- [ ] **Step 4: Add resetShortcuts() method**

Add to MediaViewer class:

```js
    resetShortcuts() {
        this.shortcuts = {
            single: Object.assign({}, DEFAULT_SHORTCUTS.single),
            compare: Object.assign({}, DEFAULT_SHORTCUTS.compare),
        };
        this.shortcutReverseMap = this.buildReverseMap();
        localStorage.removeItem('customShortcuts');
        // renderShortcutRows() and attachShortcutKeyListeners() added in Tasks 7-8
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js
git commit -m "feat(TASK-026): add saveShortcut and resetShortcuts methods"
```

---

### Task 5: Refactor keydown handler to use reverse map lookup

**Files:**
- Modify: `media-viewer.js` (constructor + keydown handler at line ~1686)

- [ ] **Step 1: Initialize shortcuts in the constructor**

In the MediaViewer constructor, add after other localStorage loading (near line ~375):

```js
        this.shortcuts = this.loadShortcuts();
        this.shortcutReverseMap = this.buildReverseMap();
```

- [ ] **Step 2: Refactor the keydown handler**

Replace the keydown handler at line ~1686 (`document.addEventListener('keydown', (e) => { ... });`) with:

```js
        document.addEventListener('keydown', (e) => {
            if (this.mediaFiles.length === 0) return;

            // Block navigation during loading
            if (this.isLoading && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                return;
            }

            // Fixed utility shortcuts (not customizable)
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.leftMediaWrapper && this.leftMediaWrapper.classList.contains('fullscreen')) {
                    this.fullscreen.cleanup(this.leftMediaWrapper);
                }
                if (this.rightMediaWrapper && this.rightMediaWrapper.classList.contains('fullscreen')) {
                    this.fullscreen.cleanup(this.rightMediaWrapper);
                }
                if (this.isZoomed()) {
                    this.resetZoom('all');
                    return;
                }
                return;
            }

            if (e.key === 'F1') {
                e.preventDefault();
                this.toggleHelp();
                return;
            }

            if (!this.isCompareMode) {
                // Single mode fixed utilities
                if (e.key === ' ') {
                    e.preventDefault();
                    if (this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                        this.togglePlayPause();
                    }
                    return;
                }
                if (e.code === 'KeyI') {
                    e.preventDefault();
                    this.toggleFileInfo();
                    return;
                }
            } else {
                // Compare mode fixed utilities
                if (e.code === 'KeyZ') {
                    e.preventDefault();
                    if (this.leftMediaWrapper) {
                        this.fullscreen.toggle(this.leftMediaWrapper);
                    }
                    return;
                }
                if (e.code === 'KeyX') {
                    e.preventDefault();
                    if (this.rightMediaWrapper) {
                        this.fullscreen.toggle(this.rightMediaWrapper);
                    }
                    return;
                }
            }

            // Customizable shortcuts via reverse map lookup
            const mode = this.isCompareMode ? 'compare' : 'single';
            const keyStr = this.buildKeyString(e);
            const action = this.shortcutReverseMap[mode][keyStr];
            if (action && !this.isLoading) {
                e.preventDefault();
                this.signalUserActivity();
                this.executeAction(action);
            }
        });
```

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All 122+ unit tests PASS

- [ ] **Step 4: Commit**

```bash
git add media-viewer.js
git commit -m "refactor(TASK-026): replace hardcoded keydown switch/case with reverse map lookup"
```

---

### Task 6: Update index.html — dynamic shortcut containers and Reset button

**Files:**
- Modify: `index.html` (lines 246-287)

- [ ] **Step 1: Replace static shortcut HTML with dynamic containers**

Replace the four shortcut sections in index.html (lines 246-287, inside `.help-content`) with:

```html
                <h3>Keyboard Shortcuts</h3>
                <div id="shortcutSingleSection" class="shortcut-section">
                    <h4>Single View Mode</h4>
                    <div class="shortcut-grid" id="shortcutSingleGrid">
                        <!-- Rendered dynamically by renderShortcutRows() -->
                    </div>
                </div>
                <div id="shortcutCompareSection" class="shortcut-section">
                    <h4>Compare View Mode</h4>
                    <div class="shortcut-grid" id="shortcutCompareGrid">
                        <!-- Rendered dynamically by renderShortcutRows() -->
                    </div>
                </div>
                <div class="shortcut-section">
                    <h4>Zoom</h4>
                    <div class="shortcut-grid">
                        <div class="shortcut-item"><kbd>Scroll</kbd> <span>Zoom in/out (on media)</span></div>
                        <div class="shortcut-item"><kbd>Double-click</kbd> <span>Cycle zoom (1x → 2x → 4x)</span></div>
                        <div class="shortcut-item"><kbd>Drag</kbd> <span>Pan when zoomed</span></div>
                        <div class="shortcut-item"><kbd>Esc</kbd> <span>Reset zoom</span></div>
                    </div>
                </div>
                <div class="shortcut-section">
                    <h4>General</h4>
                    <div class="shortcut-grid">
                        <div class="shortcut-item"><kbd>Space</kbd> <span>Play/Pause video</span></div>
                        <div class="shortcut-item"><kbd>Esc</kbd> <span>Exit fullscreen / Reset zoom</span></div>
                        <div class="shortcut-item"><kbd>F1</kbd> <span>Show/Hide this help</span></div>
                        <div class="shortcut-item"><kbd>I</kbd> <span>Toggle file info panel</span></div>
                        <div class="shortcut-item"><kbd>Z</kbd> <span>Toggle left media fullscreen</span></div>
                        <div class="shortcut-item"><kbd>X</kbd> <span>Toggle right media fullscreen</span></div>
                    </div>
                </div>
                <div class="shortcut-section">
                    <button id="resetShortcutsBtn" class="folder-btn" title="Reset all shortcuts to defaults">Reset Shortcuts to Defaults</button>
                </div>
```

Note: the "Ctrl + ← Undo last move" entry from the General section is removed — undo is now shown as a customizable shortcut in each mode's section.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(TASK-026): replace static shortcut HTML with dynamic containers and Reset button"
```

---

### Task 7: Add renderShortcutRows() and wire up help overlay

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Add ACTION_LABELS constant**

Add near DEFAULT_SHORTCUTS at top of file:

```js
const ACTION_LABELS = {
    like: 'Like media',
    dislike: 'Dislike media',
    next: 'Next media',
    previous: 'Previous media',
    undo: 'Undo last move',
    leftLike: 'Left media Like',
    leftDislike: 'Left media Dislike',
    rightLike: 'Right media Like',
    rightDislike: 'Right media Dislike',
};
```

- [ ] **Step 2: Add keyDisplayName() helper method**

Add to MediaViewer class:

```js
    keyDisplayName(keyStr) {
        // Convert e.code format to human-readable display
        return keyStr
            .replace('Key', '')
            .replace('Digit', '')
            .replace('+Key', '+')
            .replace('+Digit', '+');
    }
```

- [ ] **Step 3: Add renderShortcutRows() method**

Add to MediaViewer class:

```js
    renderShortcutRows() {
        const singleGrid = document.getElementById('shortcutSingleGrid');
        const compareGrid = document.getElementById('shortcutCompareGrid');
        if (!singleGrid || !compareGrid) return;

        singleGrid.innerHTML = '';
        compareGrid.innerHTML = '';

        for (const [action, key] of Object.entries(this.shortcuts.single)) {
            const row = document.createElement('div');
            row.className = 'shortcut-item';
            row.innerHTML = `<kbd class="shortcut-key" data-action="${action}" data-mode="single">${this.keyDisplayName(key)}</kbd> <span>${ACTION_LABELS[action]}</span>`;
            singleGrid.appendChild(row);
        }

        for (const [action, key] of Object.entries(this.shortcuts.compare)) {
            const row = document.createElement('div');
            row.className = 'shortcut-item';
            row.innerHTML = `<kbd class="shortcut-key" data-action="${action}" data-mode="compare">${this.keyDisplayName(key)}</kbd> <span>${ACTION_LABELS[action]}</span>`;
            compareGrid.appendChild(row);
        }
    }
```

- [ ] **Step 4: Call renderShortcutRows() in constructor and wire Reset button**

In the constructor, after `this.shortcutReverseMap = this.buildReverseMap();`, add:

```js
        this.renderShortcutRows();
```

In the event listener setup section (near line ~1575 where helpCloseBtn is wired), add:

```js
        const resetShortcutsBtn = document.getElementById('resetShortcutsBtn');
        if (resetShortcutsBtn) {
            resetShortcutsBtn.addEventListener('click', () => this.resetShortcuts());
        }
```

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-026): add renderShortcutRows for dynamic help overlay shortcut display"
```

---

### Task 8: Add listening mode (click-to-remap) logic

**Files:**
- Modify: `media-viewer.js`

- [ ] **Step 1: Add startListeningMode() method**

Add to MediaViewer class:

```js
    startListeningMode(kbdElement) {
        // Cancel any existing listening mode
        this.stopListeningMode();

        const action = kbdElement.dataset.action;
        const mode = kbdElement.dataset.mode;
        const originalText = kbdElement.textContent;

        kbdElement.classList.add('listening');
        kbdElement.textContent = 'Press a key...';

        // Remove any existing conflict warning
        const existingWarning = kbdElement.parentElement.querySelector('.shortcut-conflict-warning');
        if (existingWarning) existingWarning.remove();

        this._listeningState = { kbdElement, action, mode, originalText };

        this._listeningHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Escape cancels listening mode
            if (e.key === 'Escape') {
                this.stopListeningMode();
                return;
            }

            // Ignore modifier-only keypresses
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            const newKey = this.buildKeyString(e);
            const conflict = this.checkShortcutConflict(mode, action, newKey);

            if (conflict) {
                // Show conflict warning
                const warning = document.createElement('div');
                warning.className = 'shortcut-conflict-warning';
                warning.textContent = `Already used by "${ACTION_LABELS[conflict]}"`;
                const existingWarn = kbdElement.parentElement.querySelector('.shortcut-conflict-warning');
                if (existingWarn) existingWarn.remove();
                kbdElement.parentElement.appendChild(warning);
                return; // Stay in listening mode
            }

            // Valid key — save and update display
            this.saveShortcut(mode, action, newKey);
            this.stopListeningMode();
            this.renderShortcutRows();
            this.attachShortcutKeyListeners();
        };

        document.addEventListener('keydown', this._listeningHandler, true);
    }
```

- [ ] **Step 2: Add stopListeningMode() method**

Add to MediaViewer class:

```js
    stopListeningMode() {
        if (!this._listeningState) return;

        const { kbdElement, action, mode } = this._listeningState;
        kbdElement.classList.remove('listening');
        kbdElement.textContent = this.keyDisplayName(this.shortcuts[mode][action]);

        // Remove conflict warning if present
        const warning = kbdElement.parentElement.querySelector('.shortcut-conflict-warning');
        if (warning) warning.remove();

        if (this._listeningHandler) {
            document.removeEventListener('keydown', this._listeningHandler, true);
            this._listeningHandler = null;
        }
        this._listeningState = null;
    }
```

- [ ] **Step 3: Add attachShortcutKeyListeners() method**

Add to MediaViewer class:

```js
    attachShortcutKeyListeners() {
        const keys = document.querySelectorAll('.shortcut-key');
        keys.forEach((kbd) => {
            // Remove old listener by cloning
            const newKbd = kbd.cloneNode(true);
            kbd.parentNode.replaceChild(newKbd, kbd);
            newKbd.addEventListener('click', () => this.startListeningMode(newKbd));
        });
    }
```

- [ ] **Step 4: Call attachShortcutKeyListeners() after renderShortcutRows()**

In the constructor, after `this.renderShortcutRows();`, add:

```js
        this.attachShortcutKeyListeners();
```

Also add `this.attachShortcutKeyListeners();` at the end of `resetShortcuts()`:

```js
    resetShortcuts() {
        this.shortcuts = {
            single: Object.assign({}, DEFAULT_SHORTCUTS.single),
            compare: Object.assign({}, DEFAULT_SHORTCUTS.compare),
        };
        this.shortcutReverseMap = this.buildReverseMap();
        localStorage.removeItem('customShortcuts');
        this.renderShortcutRows();
        this.attachShortcutKeyListeners();
    }
```

- [ ] **Step 5: Initialize listening state in constructor**

In the constructor, near other property declarations:

```js
        this._listeningState = null;
        this._listeningHandler = null;
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add media-viewer.js
git commit -m "feat(TASK-026): add click-to-remap listening mode for shortcut customization"
```

---

### Task 9: Add CSS styles for editable shortcuts and listening mode

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add shortcut customization styles**

Add after the existing `.shortcut-item span` rule (around line ~1821):

```css
/* Editable shortcut keys */
.shortcut-key {
    cursor: pointer;
    border: 1px dashed var(--border-default);
    transition: border-color 0.15s, background 0.15s;
}

.shortcut-key:hover {
    border-color: var(--accent-primary);
    background: rgba(124, 106, 239, 0.15);
}

.shortcut-key.listening {
    border-color: var(--accent-primary);
    background: rgba(124, 106, 239, 0.25);
    animation: pulse-border 1s ease-in-out infinite;
    color: var(--text-secondary);
    font-style: italic;
}

@keyframes pulse-border {
    0%, 100% { border-color: var(--accent-primary); }
    50% { border-color: transparent; }
}

.shortcut-conflict-warning {
    color: var(--color-error, #ef4444);
    font-size: var(--font-size-xs);
    margin-top: var(--space-1);
}
```

- [ ] **Step 2: Run full test suite to check no CSS parse issues**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat(TASK-026): add CSS styles for editable shortcuts and listening mode"
```

---

### Task 10: Update existing E2E tests for new default shortcuts

**Files:**
- Modify: `tests/e2e/rating.test.js`
- Modify: `tests/e2e/navigation.test.js`
- Modify: `tests/e2e/compare-mode.test.js`

- [ ] **Step 1: Update rating.test.js**

In `tests/e2e/rating.test.js`:

Replace all instances:
- `await page.keyboard.press('ArrowUp');` → `await page.keyboard.press('q');`
- `await page.keyboard.press('ArrowDown');` → `await page.keyboard.press('w');`
- `await page.keyboard.press('Control+ArrowLeft');` → `await page.keyboard.press('Control+a');`

Note: Playwright's `page.keyboard.press('q')` sends KeyQ code. For Ctrl combos, use `'Control+a'`.

- [ ] **Step 2: Update navigation.test.js**

In `tests/e2e/navigation.test.js`:

Replace all instances:
- `await page.keyboard.press('ArrowRight');` → `await page.keyboard.press('d');`
- `await page.keyboard.press('ArrowLeft');` → `await page.keyboard.press('a');`

- [ ] **Step 3: Update compare-mode.test.js**

In `tests/e2e/compare-mode.test.js`:

Replace:
- `await page.keyboard.press('ArrowRight');` → `await page.keyboard.press('d');`

Also update test description if it mentions "ArrowRight":
- `'navigates pairs with ArrowRight in compare mode'` → `'navigates pairs with D key in compare mode'`

- [ ] **Step 4: Run E2E tests**

Run: `npm run test:e2e`
Expected: All E2E tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/rating.test.js tests/e2e/navigation.test.js tests/e2e/compare-mode.test.js
git commit -m "test(TASK-026): update E2E tests for new QWER+AD default shortcuts"
```

---

### Task 11: Add E2E tests for shortcut customization

**Files:**
- Create: `tests/e2e/keyboard-shortcuts.test.js`

- [ ] **Step 1: Create E2E test file**

Create `tests/e2e/keyboard-shortcuts.test.js`:

```js
import { test, expect } from '@playwright/test';
import { access } from 'fs/promises';
import { join } from 'path';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    mockFolderDialog,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

test.describe('Keyboard Shortcut Customization', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
    });

    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });

    test('remap like shortcut and verify it works', async () => {
        // Open help overlay
        await page.keyboard.press('F1');
        await page.waitForSelector('#helpOverlay.show');

        // Find the "like" shortcut key in single mode and click it
        const likeKey = page.locator('.shortcut-key[data-action="like"][data-mode="single"]');
        await likeKey.click();

        // Verify listening mode
        await expect(likeKey).toHaveClass(/listening/);

        // Press new key (T)
        await page.keyboard.press('t');

        // Close help overlay
        await page.keyboard.press('F1');

        // Get current file name
        const fileName = await page.evaluate(() => {
            const mv = window.mediaViewer;
            return mv.mediaFiles[mv.currentIndex].name;
        });

        // Use new shortcut (T for like)
        await page.keyboard.press('t');
        await page.waitForTimeout(500);

        // Verify file was moved to like folder
        await expect(access(join(tmpFixtures.likeDir, fileName))).resolves.toBeUndefined();
    });

    test('conflict detection blocks duplicate key assignment', async () => {
        await page.keyboard.press('F1');
        await page.waitForSelector('#helpOverlay.show');

        // Click the "like" key (currently Q)
        const likeKey = page.locator('.shortcut-key[data-action="like"][data-mode="single"]');
        await likeKey.click();

        // Try to assign W (already used by dislike)
        await page.keyboard.press('w');

        // Should still be in listening mode
        await expect(likeKey).toHaveClass(/listening/);

        // Conflict warning should appear
        const warning = page.locator('.shortcut-conflict-warning');
        await expect(warning).toBeVisible();
        await expect(warning).toContainText('Dislike');
    });

    test('reset to defaults restores original shortcuts', async () => {
        // First, remap a key
        await page.evaluate(() => {
            window.mediaViewer.saveShortcut('single', 'like', 'KeyT');
            window.mediaViewer.renderShortcutRows();
            window.mediaViewer.attachShortcutKeyListeners();
        });

        // Open help and click reset
        await page.keyboard.press('F1');
        await page.waitForSelector('#helpOverlay.show');
        await page.locator('#resetShortcutsBtn').click();

        // Verify like key is back to Q
        const likeKey = page.locator('.shortcut-key[data-action="like"][data-mode="single"]');
        await expect(likeKey).toHaveText('Q');
    });

    test('custom shortcuts persist after reload', async () => {
        // Remap like to T
        await page.evaluate(() => {
            window.mediaViewer.saveShortcut('single', 'like', 'KeyT');
        });

        // Verify localStorage was set
        const stored = await page.evaluate(() => localStorage.getItem('customShortcuts'));
        expect(stored).toContain('KeyT');

        // Verify the shortcut map reflects the change
        const currentLike = await page.evaluate(() => window.mediaViewer.shortcuts.single.like);
        expect(currentLike).toBe('KeyT');
    });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `npm run test:e2e`
Expected: All E2E tests PASS (existing + new)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/keyboard-shortcuts.test.js
git commit -m "test(TASK-026): add E2E tests for shortcut remap, conflict, reset, persistence"
```

---

### Task 12: Run full test suite and final verification

**Files:** None (verification only)

- [ ] **Step 1: Run unit tests**

Run: `npx vitest run`
Expected: All unit tests PASS

- [ ] **Step 2: Run E2E tests**

Run: `npm run test:e2e`
Expected: All E2E tests PASS

- [ ] **Step 3: Run linting**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Run formatting check**

Run: `npm run format:check`
Expected: No formatting issues

- [ ] **Step 5: Final commit if any formatting/lint fixes needed**

```bash
npm run format
npm run lint:fix
git add -A
git commit -m "chore(TASK-026): lint and format fixes"
```
