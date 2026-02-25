# TASK-006: Unified fullscreen exit cleanup method

**Status**: Complete
**Priority**: Medium
**Effort**: S (Small)
**Branch**: `feature/task-006-unified-fullscreen-cleanup`
**Origin**: [docs/archive/plans/2025-12-29_video-fullscreen-toggle.md](../../archive/plans/2025-12-29_video-fullscreen-toggle.md)

---

## 1. Problem Statement

Multiple fullscreen exit paths handled cleanup independently. The original task (written before TASK-005) identified duplication across click, ESC, and Z/X exit paths. TASK-005 introduced `exitFullscreen()` which centralized the three graceful exits, but two "destructive" paths (`toggleViewMode`, `showCompareMedia`) still called `abortFullscreenController()` directly, bypassing indicator removal and playback restoration.

## 2. Approach Chosen

**Approach A: Straight rename + route through**
- Renamed `exitFullscreen()` to `cleanupFullscreen()` (matches `cleanupCompareMedia`/`cleanupCurrentMedia` naming)
- Routed destructive paths through `cleanupFullscreen()` before `wrapper.remove()`
- No guard needed — method is naturally safe on non-fullscreen wrappers (all ops are no-ops)

**Alternatives considered:**
- **Guarded cleanup**: Add `if (!wrapper.classList.contains('fullscreen')) return;` — rejected because it would skip `abortFullscreenController()` which should always run
- **Layered cleanup**: Split into state/DOM cleanup layers — rejected as over-engineering for this codebase

## 3. Changes Made

| File | Change |
|------|--------|
| `media-viewer.js` | Renamed `exitFullscreen` → `cleanupFullscreen` (definition + 7 call sites); 2 destructive paths upgraded from `abortFullscreenController()` to `cleanupFullscreen()` |
| `CLAUDE.md` | Updated 2 stale references + auto-memory expanded Event Listener Lifecycle pattern |
| `docs/planning/BACKLOG.md` | Updated 1 stale reference |

## 4. Key Discoveries

- TASK-006's original 3 acceptance criteria (single method, centralized cleanup, all exit methods use it) were already satisfied by TASK-005's `exitFullscreen()` — the task predated the fix
- Extended scope to also cover destructive paths for future-proofing
- `cleanupCompareMedia()` removes video from DOM before `cleanupFullscreen()` runs in destructive paths, so `querySelector('video')` returns null — the `play()` call never fires (safe by design)

## 5. Future Improvements

1. **Early-return guard for cleanupFullscreen()**: Double-calls (e.g., ESC pressed while Z is processing) trigger redundant `video.play()`. Add `if (!wrapper.classList.contains('fullscreen')) return;` after `abortFullscreenController()` call. (Already in BACKLOG.md)
2. **Consolidate enterFullscreen into toggleFullscreen**: The enter branch of `toggleFullscreen()` is 55 lines. Could be extracted to a symmetric `setupFullscreen(wrapper)` method alongside `cleanupFullscreen(wrapper)` for clearer symmetry.

---

### Execution Log

#### 2026-02-24 — PHASE: Discovery
- Task well-defined in TODO.md with clear acceptance criteria
- Origin plan identified: 2025-12-29_video-fullscreen-toggle.md

#### 2026-02-24 — PHASE: Exploration
- Traced all 5 exit paths with line-by-line analysis
- Key finding: 3 graceful exits already unified, 2 destructive exits bypass cleanup
- Read origin plan — confirmed task was written before TASK-005

#### 2026-02-24 — PHASE: Implementation
- Renamed method + updated all 7 call sites
- Upgraded 2 destructive paths from abortFullscreenController to cleanupFullscreen
- Updated 3 stale documentation references

#### 2026-02-24 — PHASE: Review
- Code reviewer confirmed: no bugs, all edge cases safe, convention-compliant
- Cross-file search confirmed: no remaining exitFullscreen references in code

#### 2026-02-24 — PHASE: Complete
- Code commit: 9c36fdf
- Tests: No automated tests (manual testing required)
