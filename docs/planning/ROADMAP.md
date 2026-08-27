# Roadmap

Long-term vision, active themes, and releases.

**Last Updated**: 2026-08-27

---

## Vision

Make Media Viewer the most efficient tool for reviewing and organizing large media collections with intelligent sorting and prediction capabilities.

---

## Current Phase

**Phase**: Scale & Modularize
**Focus**: Hold the 24k-folder gains while carving the renderer into modules
**Timeline**: H2 2026

---

## Theme Board

Work flows weekly from [BACKLOG.md](BACKLOG.md) → [WEEKLY.md](WEEKLY.md); this board is the strategic map of where the themes sit, not a duplicate task list.

### Now

- **24k-folder performance — remainder** — the AI-sort half shipped (PR #64, smoke-verified on a 20,929-file folder). What remains is the **PR2 slice: hash/similarity sort off the renderer thread**. Tracked as TODO 🔴 "Speed up AI / similarity sorting on large folders (24k+)", which stays open.
- **v2.0 modularization** — extract ZoomManager, CompareManager, SortingManager, MLManager (see the v2.0 release below). **Promoted from Next on 2026-08-27**: the renderer grew ~1,550 lines between July and August while extraction was paused, so modularization is losing ground to feature work. This is where the architecture effort should go next.

### Next

- **UI architecture overhaul** — mode-aware control registry, centralized z-index scale (CSS custom properties), responsive pass for window sizes / large counts. BACKLOG [2026-05-25]; explicitly a prerequisite before any 4th mode ships.

### Later

- **Add-on / extension system** — design first (define core-app identity: what is core, what is an add-on), then in dependency order: sorting-as-add-ons, lossless-compression port (`media_compression` project), platform integrations (YouTube/TikTok/Twitter/Instagram/Civitai), link-based rating. BACKLOG [2026-04-08] cluster + [2026-05-30] compression entry.
- **Progressive loading** — thumbnail / lowest-quality-first display while full media loads. BACKLOG [2026-04-08].

> **Drained on 2026-08-27**: the *rating & tournament UX polish* theme is no longer a standing Now item — tournament undo reliability, the mouse-wheel guard, header auto-hide (PR #65) and bulk-rate re-pair avoidance (PR #66) all shipped. Further items of this kind re-enter through normal BACKLOG intake from 24k dogfooding rather than holding a board slot.

---

## Releases

### v1.1 — Polish Release ✅ Shipped

**Theme**: Core stability and UX refinement
**Status**: ✅ Complete (retro-declared 2026-08-27; scope long since exceeded)

Named features:

| Feature | Status | Notes |
|---------|--------|-------|
| Video fullscreen toggle | ✅ Shipped 2026-02 | Later extracted into FullscreenManager |
| Visual scale controls | ✅ Shipped | Zoom slider + popover; E2E-covered (`zoom.test.js`) |

Shipped far beyond the v1.1 scope (Feb–Aug 2026): Tournament mode (Swiss engine, persistence, session undo), JXL + animated-JXL viewer, CLIP semantic sorting + 576-dim ML pipeline, bulk-rate corrective training, automated test suite (513 unit + 55 E2E), keyboard-shortcut customization, local quality gates (pre-commit secret scan/lint/unit; conditional pre-push E2E).

### v2.0 — Modularization 🔄 In Progress

**Theme**: Carve the monolithic renderer into manager modules (v2.0 pattern: stateful manager class + constructor-injected host callbacks)
**Status**: 🔄 In Progress — 2 of 6 managers extracted
**Done when**: ZoomManager, CompareManager, SortingManager, and MLManager are extracted with unit + E2E suites green.

| Module | Status |
|--------|--------|
| FullscreenManager (`fullscreen.js`) | ✅ Extracted |
| TournamentManager (`tournament.js`) + TournamentEngine (`tournament-engine.js`) | ✅ Extracted |
| ZoomManager | ⬜ Planned |
| CompareManager | ⬜ Planned |
| SortingManager | ⬜ Planned |
| MLManager | ⬜ Planned |

Originally-planned v2.0 features delivered early: automated testing (Vitest + Playwright, hook-enforced), keyboard-shortcut customization.

> **Losing ground.** `media-viewer.js` went from ~7,900 lines (2026-07-12) to ~9,400 (2026-08-27) — +1,550, with no extraction in that window. Feature work is adding to the renderer faster than modularization is removing from it. This is the reason v2.0 moved into the **Now** column.

**Target**: Q4 2026 (soft)

---

## Completed Milestones

### v1.0 — Core Features ✅

- [x] Media browsing with keyboard navigation
- [x] Rating system (like/dislike/special)
- [x] Compare mode for side-by-side viewing
- [x] Visual similarity sorting (VP-Tree, MST)
- [x] ML-based prediction sorting
- [x] Image zoom and pan
- [x] Face detection
- [x] Sorting result caching
- [x] Background feature extraction

---

## Ongoing

- Keep documentation current with codebase (weekly-planning staleness check — see [README.md](README.md) § Strategic Review)
- Performance monitoring for large media collections
- Security review of file operations

---

## Principles

1. **Efficiency first**: Operations should feel instant for the user
2. **No data loss**: File operations must be safe and reversible (undo)
3. **Progressive enhancement**: Advanced features (ML, similarity) enhance but don't block core workflow

---

*See [WEEKLY.md](WEEKLY.md) for the current week's plan.*
*See [MILESTONES.md](MILESTONES.md) for key dates.*
*See [BACKLOG.md](BACKLOG.md) for the full idea/task pool.*
