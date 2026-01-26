# Manual Testing Scenarios

Manual testing checklists and scenarios for Media Viewer.

---

## Pre-Release Testing Checklist

Before any release, verify the following scenarios work correctly.

### Core Navigation

- [ ] Open folder via button
- [ ] Open folder via drag-and-drop
- [ ] Navigate with arrow keys (Left/Right)
- [ ] Navigate with A/D keys
- [ ] View media counter updates correctly
- [ ] Folder info displays correctly

### Single Mode

- [ ] Images display correctly
- [ ] Videos play with controls
- [ ] Video sound works
- [ ] Video skip buttons work (<<, >>)
- [ ] Zoom with mouse wheel
- [ ] Zoom with double-click (1x → 2x → 4x → 1x)
- [ ] Pan when zoomed (drag)
- [ ] ESC resets zoom

### Compare Mode

- [ ] Toggle to compare mode
- [ ] Both images display
- [ ] Click image → enters fullscreen
- [ ] Click again → exits fullscreen
- [ ] ESC exits fullscreen
- [ ] Zoom works independently per image
- [ ] Navigation shows pairs correctly

### Rating Workflow

- [ ] Like button works (Enter/F)
- [ ] Dislike button works (Space/J)
- [ ] Special button works
- [ ] Files move to correct folders
- [ ] Undo restores file (Backspace/Z)
- [ ] Rating notifications appear
- [ ] Rating notifications can be disabled

### Sorting

- [ ] Original order works
- [ ] Random shuffle works
- [ ] Similarity sort works (all 3 algorithms)
- [ ] AI sort works
- [ ] Sorting progress displays
- [ ] Sorting can be cancelled
- [ ] Sorting results cached

### Settings (F1)

- [ ] Help overlay opens
- [ ] Folder configuration works
- [ ] Settings persist after restart
- [ ] Toggle rating notifications
- [ ] Toggle auto-close errors

### Error Handling

- [ ] Invalid files show error notification
- [ ] Remove button removes failed file
- [ ] Errors can be dismissed
- [ ] Multiple errors stack correctly
- [ ] Auto-close setting works

---

## Feature-Specific Testing

### Video Fullscreen Toggle (2025-12-29)

- [ ] Compare mode: click image → enters fullscreen
- [ ] Compare mode: click image again → exits fullscreen
- [ ] Compare mode: click video → enters fullscreen
- [ ] Compare mode: click video again → exits fullscreen
- [ ] Compare mode: double-click video in fullscreen → exits (no zoom)
- [ ] Compare mode: overlay buttons work in fullscreen
- [ ] Compare mode: ESC key → exits fullscreen
- [ ] Normal mode: zoom still works

---

## Platform-Specific Testing

### Windows

- [ ] Alt+F4 closes application
- [ ] File paths with spaces work
- [ ] Long file paths work

### macOS

- [ ] Cmd+Q closes application
- [ ] Retina display renders correctly

### Linux

- [ ] Standard keyboard shortcuts work
- [ ] Various file systems supported

---

## Performance Testing

### Large Folders

- [ ] 100+ files loads smoothly
- [ ] 1000+ files loads (may take time)
- [ ] Navigation remains responsive

### Sorting Performance

- [ ] Similarity sort completes for 100 images
- [ ] Progress indicator updates smoothly
- [ ] Sorting doesn't freeze UI

### Memory Usage

- [ ] Memory stable after extended use
- [ ] No memory leaks when navigating

---

## Regression Testing

After any code change, verify:

1. Core navigation still works
2. Rating workflow still works
3. Both view modes work
4. Settings persist correctly

---

*Last Updated: 2026-01-26*
