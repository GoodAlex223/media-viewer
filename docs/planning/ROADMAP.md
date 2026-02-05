# Roadmap

Long-term vision and major releases.

**Last Updated**: 2026-02-05

---

## Vision

Make Media Viewer the most efficient tool for reviewing and organizing large media collections with intelligent sorting and prediction capabilities.

---

## Current Phase

**Phase**: Polish
**Focus**: Stability and core feature refinement
**Timeline**: Q1 2026

---

## Releases

### v1.1 — Polish Release (Target: Q1 2026)

**Theme**: Core stability and UX refinement
**Status**: 🔄 In Progress

**Goals**:
- [ ] Complete remaining UI/UX tasks
- [ ] All existing features stable and tested

**Key Features**:

| Feature | Status | Notes |
|---------|--------|-------|
| Video fullscreen toggle | In Progress | Click to exit fullscreen |
| Visual scale controls | Planned | UI for zoom manipulation |

**Success Criteria**:
- All TODO.md tasks complete
- Manual testing checklist passed

---

### v2.0 — Architecture (Target: TBD)

**Theme**: Code quality and maintainability
**Status**: ⬜ Not Started

**Goals**:
- [ ] Modularize media-viewer.js into separate files
- [ ] Add automated test framework

**Key Features**:

| Feature | Status | Notes |
|---------|--------|-------|
| Modularize media-viewer.js | Not Started | Split ~6100+ line file into modules |
| Automated testing | Not Started | Add Jest or similar framework |
| Keyboard shortcut customization | Not Started | User-configurable shortcuts |

---

### Future (v3.0+)

**Potential directions**:
- TypeScript migration for improved maintainability
- Plugin system for community extensions
- Cloud sync for preferences across devices
- Batch operations for multiple file processing
- Advanced ML features for better preference learning

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

- Keep documentation current with codebase
- Performance monitoring for large media collections
- Security review of file operations

---

## Principles

1. **Efficiency first**: Operations should feel instant for the user
2. **No data loss**: File operations must be safe and reversible (undo)
3. **Progressive enhancement**: Advanced features (ML, similarity) enhance but don't block core workflow

---

*See [TODO.md](TODO.md) for current tactical tasks.*
*See [MILESTONES.md](MILESTONES.md) for key dates.*
*See [BACKLOG.md](BACKLOG.md) for unprioritized ideas.*
