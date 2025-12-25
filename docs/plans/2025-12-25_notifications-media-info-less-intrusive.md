# Plan: Make Notifications and Media Info Less Intrusive

**Task**: Notifications and media info often cover half or all of the media when quickly rating and the window is half-screen size

**Status**: Planning
**Created**: 2025-12-25

---

## 1. Problem Analysis

### Current State

**Notifications:**
- Position: Fixed, top: 80px, left: 20px
- Size: max-width 350px, max-height 100px
- Behavior: Info notifs limited to 2, auto-close after 2-5s (errors persist)
- Animation: Slides in from left

**Media Info Panel:**
- Position: Fixed, top: 80px, right: 20px
- Size: min-width 250px, max-width 350px
- Behavior: Shows on hover near right edge, hides after 300ms mouseleave

### Problem Scenarios

1. **Half-screen window**: Both panels together consume ~700px horizontally (350+350), leaving little space for media
2. **Quick rating**: Notifications appear frequently, each lasting 2+ seconds
3. **Stacked notifications**: Even with 2-notification limit, they occupy vertical space
4. **Media info always visible on hover**: Activates unintentionally when mouse near right edge

---

## 2. Approaches Considered

### Approach A: Compact Mode with Auto-Collapse

**Description**: Reduce notification size and make media info collapsible by default

**Changes:**
- Notifications: Smaller, positioned at bottom-left corner
- Media info: Collapsed to small icon, expands on click (not hover)

**Pros:**
- Minimal screen obstruction
- User controls when to see details
- Works well at any window size

**Cons:**
- Requires click to see media info (extra interaction)
- Notifications at bottom may be less visible

### Approach B: Transparent Overlays with Fade

**Description**: Make both elements semi-transparent and fade quickly

**Changes:**
- Notifications: Reduce opacity to 70%, faster auto-close (1.5s for info)
- Media info: More transparent background (50% opacity)
- Both fade out faster when not hovered

**Pros:**
- Can still see content behind overlays
- Minimal UI changes required
- Preserves current positioning

**Cons:**
- Text may be harder to read
- Doesn't solve space issue on small screens
- Still covers media (just more transparent)

### Approach C: Corner Toast Notifications + Minimal Info Bar

**Description**: Redesign both components to be more compact and less intrusive

**Changes:**
- **Notifications**:
  - Move to bottom-right corner (out of main viewing area)
  - Smaller size, shorter text, compact design
  - Much faster auto-close for rating confirmations (1s)
  - Option to disable rating confirmations entirely
- **Media Info**:
  - Replace panel with small status bar at bottom
  - Shows essential info: filename, dimensions, size
  - Expandable on demand

**Pros:**
- Significantly less screen obstruction
- Bottom positioning is industry standard for toasts
- Compact info bar provides essential data without blocking
- Rating confirmations can be disabled for power users

**Cons:**
- Larger UI refactor
- Users accustomed to current positions may need adjustment
- Need to fit same info in smaller space

### Approach D: Smart Positioning Based on Window Size

**Description**: Dynamically adjust positioning and size based on viewport

**Changes:**
- Detect window size
- Small windows: Compact mode (tiny notifications, minimal info)
- Large windows: Current behavior maintained
- Auto-reposition to avoid covering center of screen

**Pros:**
- Adaptive to user's screen setup
- Preserves full info when space available
- Best of both worlds

**Cons:**
- More complex implementation
- May be confusing if behavior changes unexpectedly
- Edge cases when resizing

---

## 3. Assumptions

1. Users primarily focus on media content in center of screen
2. Rating confirmation notifications are helpful but not critical
3. Quick access to media dimensions/size is useful but not always needed
4. Users may work with various window sizes (full screen to half screen)
5. Current hover behavior for media info triggers accidentally

---

## 4. Edge Cases

1. **Extremely small window** (< 400px width): Both panels would overlap
2. **Very long filenames**: Currently truncated, but notification may still be wide
3. **Error notifications**: Must remain visible (cannot auto-close too fast)
4. **Multiple rapid operations**: Notifications could queue up
5. **Touch screens**: Hover-based media info doesn't work
6. **High-DPI displays**: Sizes may appear differently
7. **User mid-inspection**: Auto-close while user reading is frustrating
8. **Compare mode**: Two media info panels need different handling

---

## 5. Approved Approach

**Hybrid of Approach A + C**: Compact corner toasts with collapsible info

### User Decisions (2025-12-25)

| Setting | Choice |
|---------|--------|
| Notification position | Bottom-right corner |
| Rating confirmations | Optional (add toggle to disable) |
| Media info trigger | Click to show |

### Implementation Plan

#### Phase 1: Notification Improvements
1. Move notification container from top-left to bottom-right corner
2. Update CSS: change `top: 80px; left: 20px` to `bottom: 20px; right: 20px`
3. Update animation from `slideInLeft` to `slideInRight` (or `slideInUp`)
4. Reduce notification size (max-width: 280px for compact appearance)
5. Ensure notifications stack upward (newest at bottom)

#### Phase 2: Rating Confirmation Toggle
1. Add `showRatingConfirmations` setting (default: true)
2. Add toggle in settings panel UI
3. Modify like/dislike handlers to check setting before showing notification
4. Store setting in localStorage

#### Phase 3: Media Info Click-to-Show
1. Remove hover-based visibility logic (`setupFileInfoVisibility`)
2. Add persistent info button (ℹ icon) in top-right corner
3. Toggle panel visibility on button click
4. Panel appears/disappears with smooth animation
5. Update compare mode to use same click pattern

#### Phase 4: Polish & Testing
1. Ensure responsive behavior for various window sizes
2. Update mobile styles accordingly
3. Test all edge cases (rapid rating, resize, compare mode)
4. Verify no regressions in existing functionality

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users miss notifications at new position | Medium | Add brief transition period, keep error notifications prominent |
| Media info harder to access | Low | Clear visual indicator for info button |
| Backward compatibility | Low | Settings have sensible defaults matching current behavior |

---

## 7. Questions for User

1. **Notification position preference**: Bottom-right (recommended) or keep top-left?
2. **Rating confirmations**: Should there be an option to disable them entirely?
3. **Media info trigger**: Click-to-show (recommended) or keep hover behavior?

---

## Execution Log

#### [2025-12-25] — PHASE: Planning
- Explored current notification and media info implementation
- Identified 4 alternative approaches
- Selected hybrid approach (A+C) as recommended
- Awaiting user feedback on preferences

#### [2025-12-25] — PHASE: Implementation Complete

**Phase 1: Notification Improvements**
- Moved notification container from top-left to bottom-right corner
- Changed `flex-direction` to `column-reverse` for proper stacking (newest at bottom)
- Reduced notification size: max-width 280px, font-size 12px
- Added `slideInUp` and `slideOutDown` animations
- Updated mobile responsive styles

**Phase 2: Rating Confirmation Toggle**
- Added `showRatingConfirmations` setting (default: true)
- Setting stored in localStorage
- Added toggle checkbox in Help overlay (Settings section)
- Modified `moveCurrentFile`, `moveComparePair`, `moveCompareFile` to check setting

**Phase 3: Media Info Click-to-Show**
- Removed hover-based visibility logic from `setupFileInfoVisibility`
- Added persistent info button (ℹ) in top-right corner
- Added `toggleFileInfo()`, `showFileInfo()`, `hideFileInfo()` methods
- Added keyboard shortcut: I key to toggle info panel
- Added close button (×) in file info panel header
- Filename is clickable to copy (preserved functionality)
- Button hidden in compare mode, shown in single mode

**Phase 4: Polish**
- Added responsive mobile styles for info button and panel
- Updated Help overlay with I key shortcut documentation
- Added Settings section styling in CSS

**Files Modified:**
- `styles.css`: Notification positioning, animations, info button, settings styles
- `index.html`: Info button, settings toggle in help overlay, I key docs
- `media-viewer.js`: Settings logic, click handlers, visibility methods

---

*Last Updated: 2025-12-25*
*Status: Complete*
