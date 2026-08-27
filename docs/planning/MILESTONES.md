# Milestones

Key targets with dates.

**Last Updated**: 2026-08-27

---

## Overview

Milestones are significant checkpoints. They should be:
- **Specific** — Clear definition of "done"
- **Measurable** — Objectively verifiable
- **Time-bound** — Has a target date

---

## Upcoming Milestones

### 🎯 v2.0 modularization complete

**Target Date**: Q4 2026 (soft)
**Status**: 🟡 In Progress — 2 of 6 managers extracted

**Definition of Done**:
- [ ] ZoomManager extracted
- [ ] CompareManager extracted
- [ ] SortingManager extracted
- [ ] MLManager extracted
- [ ] Unit + E2E suites green after each extraction
- [ ] CLAUDE.md architecture section updated per extraction

**Dependencies**: none hard; sits in the roadmap's **Now** column as of 2026-08-27

**Risks**:
- Extractions compete for weekly capacity with user-flagged work (the ≥50% 🔵 quota floor)
- The renderer is currently growing faster than extraction shrinks it (~7,900 → ~9,400 lines, Jul → Aug 2026), so the "< ~6,000" target recedes with every feature week that skips an extraction

---

## Milestone Timeline

```
2026
Q3                          Q4
 │                           │
 ▼                           ▼
[24k AI-sort smooth] ✅     [v2.0 modularization]
shipped 2026-07-20          4 manager extractions
```

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| 24k AI-sort smooth end-to-end | July 2026 | ✅ Complete (2026-07-20) |
| v2.0 modularization complete | Q4 2026 (soft) | 🟡 In Progress (2/6) |

---

## Completed Milestones

### ✅ 24k AI-sort smooth end-to-end

**Completed**: 2026-07-20 (target was July 2026 — met)
**Result**: On Time

**What was delivered** (against the original Definition of Done):
- [x] Sort-by-Predicted shows a determinate progress card immediately (no silent ~40s wait)
- [x] Cached features are served — no redundant re-extraction on a warm cache
- [x] Cancel aborts the AI-sort path mid-run
- [x] Verified by a manual smoke on the real 24,000+ file folder — all 5 checks passed on a **20,929-file** folder

Shipped via PR #64 (merge `b6ff4ac`). Two defects were found and fixed **before** merge rather than deferred: an external-review data-loss regression (`b8b5636`) and a smoke-triggered cache-corruption route (`2777bdf` + `c947081`).

> **Scope note**: this milestone covered the *AI-sort* path only. The separate PR2 slice — hash/similarity sort off the renderer thread — remains open and is tracked as a 🔴 Key Result under [GOALS.md](GOALS.md) Objective 1, not as part of this milestone.

### ✅ v1.1 Polish Release

**Completed**: retro-declared 2026-08-27 (named features shipped 2026-02)
**Result**: Scope exceeded many times over

**What was delivered** (against the original Definition of Done):
- [x] Video fullscreen toggle — shipped 2026-02-05, later extracted into FullscreenManager
- [x] Visual scale controls — zoom slider + popover, E2E-covered (`zoom.test.js`)
- [x] "Manual testing checklist passed" — superseded: 513 unit + 55 E2E tests, hook-enforced, plus per-PR manual smokes
- [x] "All documentation up to date" — satisfied by the 2026-08-27 strategic-doc refresh

Beyond scope: Tournament mode, JXL viewer, CLIP semantic sorting, bulk-rate training, automated test suite, shortcut customization, local quality gates.

### ✅ v1.0 Core Features

**Completed**: 2025-12
**Result**: On Time

**What was delivered**:
- Media browsing with keyboard navigation
- Rating system (like/dislike/special)
- Compare mode for side-by-side viewing
- Visual similarity sorting (VP-Tree, MST)
- ML-based prediction sorting
- Image zoom and pan
- Face detection
- Sorting result caching
- Background feature extraction

---

## Health Summary

| Status | Count | Milestones |
|--------|-------|------------|
| ✅ Complete | 3 | v1.0 Core Features, v1.1 Polish, 24k AI-sort smooth |
| 🟡 In Progress | 1 | v2.0 modularization |

---

*See [ROADMAP.md](ROADMAP.md) for release context and the theme board.*
*See [TODO.md](TODO.md) for tactical tasks toward milestones.*
