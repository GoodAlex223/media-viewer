# TASK-026: Keyboard Shortcut Customization — Design Spec

**Date**: 2026-03-27
**Status**: Approved
**Origin**: TODO.md TASK-026 + Manual testing 2026-03-19 + ROADMAP.md v2.0

---

## Summary

Allow users to customize keyboard shortcuts for rating and navigation actions. Unify single/compare mode defaults to use the compare-mode QWER+AD layout. Make the existing help overlay shortcut display directly editable (click-to-remap).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Unified defaults | Compare-mode layout (QWER+AD) for both modes | User finds compare mode more comfortable; no existing users to break |
| UI approach | Edit existing help overlay shortcuts in-place (Option C) | Minimal UI change, reuses existing layout, help = single source of truth |
| Conflict handling | Block with warning | Safest, simplest; no confusing swaps or unbound actions |
| Customizable scope | Rating + navigation keys only | Utility keys (F1, Escape, Space, I, Z, X) stay fixed; keeps scope manageable |
| Arrow key fallback | None — fully replaced | No existing users; clean break to new defaults |
| Single mode mapping | Q=like, W=dislike (same as compare left media) | Consistent mental model across modes |
| Listening UX | Press-to-assign, Escape to cancel | Standard pattern (VS Code, games); no confirmation step needed |
| Architecture | Shortcut map object with reverse lookup (Approach A) | Data-driven; clean separation of config from logic; right level of abstraction |

## Data Model

### Default Shortcut Map

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

### Storage

- **localStorage key**: `'customShortcuts'`
- **Format**: JSON string of the same structure, containing only overrides (sparse)
- **Merge on load**: `Object.assign({}, DEFAULT_SHORTCUTS[mode], customShortcuts[mode])` per mode
- **Reset**: delete the localStorage key, reload defaults

### Key Representation

Uses `e.code` values (e.g., `'KeyQ'`, `'KeyD'`) for letter keys — keyboard-layout-independent. Modifiers stored as prefix: `'Ctrl+KeyA'`, `'Shift+KeyD'`.

### Reverse Map

Built once at startup and rebuilt on any remap:

```js
this.shortcutReverseMap = {
    single: { 'KeyQ': 'like', 'KeyW': 'dislike', 'KeyD': 'next', 'KeyA': 'previous', 'Ctrl+KeyA': 'undo' },
    compare: { 'KeyQ': 'leftLike', 'KeyW': 'leftDislike', 'KeyE': 'rightLike', 'KeyR': 'rightDislike', 'KeyD': 'next', 'KeyA': 'previous', 'Ctrl+KeyA': 'undo' },
};
```

## Keydown Handler Refactor

The current handler at `media-viewer.js:1686` is a long switch/case with mode branching. It becomes:

```js
// In keydown handler (after fixed utility key checks):
const mode = this.isCompareMode ? 'compare' : 'single';
const keyStr = buildKeyString(e);  // e.g. 'Ctrl+KeyA'
const action = this.shortcutReverseMap[mode][keyStr];
if (action) {
    e.preventDefault();
    this.signalUserActivity();
    this.executeAction(action);
}
```

### buildKeyString(e)

Normalizes a keyboard event into a lookup key:
- Prepends `'Ctrl+'` if `e.ctrlKey`
- Prepends `'Shift+'` if `e.shiftKey`
- Appends `e.code`
- Example: Ctrl+A → `'Ctrl+KeyA'`

### executeAction(action)

Small dispatcher mapping action names to method calls:

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

### Fixed Utility Shortcuts

These remain as hardcoded checks **before** the map lookup, unchanged from current behavior:
- `Escape` — exit fullscreen / reset zoom
- `F1` — toggle help overlay
- `Space` — play/pause video
- `KeyI` — toggle file info panel
- `KeyZ` — toggle left fullscreen (compare mode)
- `KeyX` — toggle right fullscreen (compare mode)

## Help Overlay UI Changes

### Dynamic Shortcut Rendering

Instead of static HTML, shortcut rows are generated from the shortcut map at startup. The HTML template keeps section headers ("Single View Mode", "Compare View Mode") but shortcut rows are injected dynamically via JS.

Each shortcut row:

```html
<div class="shortcut-row">
    <span class="shortcut-action">Like media</span>
    <kbd class="shortcut-key" data-action="like" data-mode="single">Q</kbd>
</div>
```

### Editable Key Cells

- Only rating + navigation `<kbd>` elements get the `shortcut-key` class (clickable)
- Utility shortcuts render as plain `<kbd>` (not clickable)
- Visual distinction: editable keys get a dashed border or hover effect to signal interactivity

### Listening Mode

1. User clicks a `<kbd class="shortcut-key">` element
2. Cell gets `.listening` CSS class (pulsing border, text changes to "Press a key...")
3. A temporary keydown listener captures the next keypress
4. **Conflict check**: if the key is already used by another action in the same mode, show inline warning "Already used by [action name]", stay in listening mode
5. **Valid key**: update the shortcut map, rebuild reverse map, update `<kbd>` text, save to localStorage
6. **Escape**: cancel listening mode, restore original key display

### Reset to Defaults Button

A "Reset to Defaults" button at the bottom of the shortcut sections:
- Clears `customShortcuts` from localStorage
- Rebuilds reverse map from defaults
- Re-renders all `<kbd>` text to default values

## Files Modified

| File | Changes |
|------|---------|
| `media-viewer.js` | Add DEFAULT_SHORTCUTS, shortcut loading/saving, reverse map builder, buildKeyString(), executeAction(), refactor keydown handler, listening mode logic, help overlay rendering |
| `index.html` | Replace static shortcut HTML with container divs for dynamic injection; add Reset button |
| `styles.css` | Add .shortcut-row, .shortcut-key, .shortcut-key:hover, .shortcut-key.listening, .shortcut-key.conflict styles |

## Testing

### Unit Tests

- **Shortcut map merge**: default + custom overrides produce correct merged map
- **Reverse map building**: key-to-action lookup correct for both modes
- **Conflict detection**: assigning a duplicate key is blocked, unique keys pass
- **Reset**: clearing custom shortcuts restores defaults
- **buildKeyString**: correctly normalizes modifier + code combinations
- **executeAction**: dispatches to correct method for each action name

### E2E Tests

- **Remap a shortcut**: open help overlay, click a key cell, press new key, verify it works for media interaction
- **Conflict warning**: try assigning a key already in use, verify warning appears and assignment is blocked
- **Reset to defaults**: remap a key, click reset, verify original key restored
- **Persistence**: remap a key, reload app, verify custom binding persists

## Out of Scope

- Customizing utility shortcuts (F1, Escape, Space, I, Z, X)
- Mouse/scroll wheel remapping
- Import/export shortcut profiles
- Per-folder shortcut profiles
- Keyboard shortcut recording for modifier-only combos (e.g., Ctrl alone)
