# Plan: Cache Age Display in Sorting Notification

**Date**: 2026-03-05
**Task**: TASK-008
**Status**: Complete
**Effort**: S
**Origin**: [docs/archive/plans/2025-12-27_sorting-cache.md](../../archive/plans/2025-12-27_sorting-cache.md)

---

## 1. Problem Statement

When restoring a cached sort order, the notification shows file counts but not when the cache was created. Users have no way to gauge cache freshness without inspecting the `.sort_cache.json` file directly.

---

## 2. Current State Analysis

- Sort cache already stores `timestamp: Date.now()` in `.sort_cache.json` (per algorithm entry)
- The timestamp field was never read or displayed — metadata only
- Notification format: `"✅ Restored cached VP-Tree order (42 cached, 3 new)"`
- No date/time formatting utilities exist in the codebase

---

## 3. Approach

Single approach (task too small for alternatives):
1. Add `formatTimeAgo(timestamp)` utility method to MediaViewer
2. Append cache age to existing notification message

**Format chosen**: Append after stats with em-dash separator
- Example: `"✅ Restored cached VP-Tree order (42 cached, 3 new) — cached 2 hours ago"`

**Time granularity**: Standard relative
- just now / X minutes ago / X hours ago / X days ago / X weeks ago
- Proper singular/plural handling

---

## 4. Implementation

### Files Modified

**media-viewer.js** (2 changes):

1. **Added `formatTimeAgo(timestamp)` method** (line 729-740)
   - Converts epoch ms to human-readable relative time
   - Handles: just now, minutes, hours, days, weeks
   - Proper singular/plural for all units

2. **Modified cache restore notification** (line 3813-3815)
   - Added `typeof cachedSortData.timestamp === 'number'` guard
   - Appends `— cached {timeAgo}` to existing message
   - Backwards-compatible: old caches without timestamp show no age

---

## 5. Key Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Message format | Append after stats | Preserves existing useful info (cached/new/removed counts) |
| Time format | Standard relative | Clear, familiar format |
| Timestamp guard | `typeof === 'number'` | Safer than truthy check (handles timestamp=0 edge case) |
| Future timestamp handling | Falls through to "just now" | Acceptable for clock skew; "in the future" text would confuse users |

---

## 6. Future Improvements

1. **Reuse `formatTimeAgo` for other timestamps** — Could be used for ML model age, hash cache age, or any other cached data display
2. **Month-level granularity** — Currently stops at weeks; very old caches show "52 weeks ago" instead of "12 months ago". Acceptable for now since stale caches are typically re-sorted.

---

## Execution Log

#### [2026-03-05] — PHASE: Planning
- Task well-defined from origin plan (sorting-cache improvements #2)
- Cache already stores timestamp — just needs formatting and display
- Explored sorting cache system and notification patterns via code-explorer agents

#### [2026-03-05] — PHASE: Implementation
- Added formatTimeAgo() method near other utilities (before showNotification)
- Modified cache restore notification to append age
- Used typeof guard per code review feedback

#### [2026-03-05] — PHASE: Review
- Code reviewer identified falsy timestamp check — fixed to typeof === 'number'
- Future timestamp edge case deemed acceptable (returns "just now")

#### [2026-03-05] — PHASE: Complete
- Both acceptance criteria met
- Commit: feat: Show cache age in sorting notification (TASK-008)
