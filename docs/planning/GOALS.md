# Goals

Project objectives and success metrics.

**Last Updated**: 2026-02-05
**Review Cycle**: Quarterly

---

## Mission

Provide the most efficient desktop tool for reviewing, rating, and organizing large media collections with intelligent sorting capabilities.

---

## Current Objectives

### Objective 1: Core Stability

**Description**: Ensure all existing features work reliably without bugs or regressions.

**Key Results**:
| Key Result | Target | Current | Status |
|------------|--------|---------|--------|
| Open bug count | 0 | 0 | 🟢 |
| Manual test checklist passing | 100% | ~90% | 🟡 |
| All TODO tasks completed | 100% | 0% | 🔴 |

**Timeline**: Q1 2026
**Owner**: goodalex223

---

### Objective 2: UX Refinement

**Description**: Polish user interactions for smooth, intuitive workflow.

**Key Results**:
| Key Result | Target | Current | Status |
|------------|--------|---------|--------|
| Video fullscreen toggle working | Done | In Progress | 🟡 |
| Visual scale controls | Done | Not Started | 🔴 |

**Timeline**: Q1 2026
**Owner**: goodalex223

---

## Non-Goals

Things we explicitly are NOT trying to do:

- **Multi-user support** — Single-user desktop application
- **Cloud storage** — Local files only (for now)
- **Mobile support** — Desktop (Electron) only
- **Video editing** — View and rate only, no editing

---

## Constraints

| Constraint | Description | Impact |
|------------|-------------|--------|
| No TypeScript | Plain JavaScript, no type checking | Manual verification needed |
| No automated tests | Manual testing only | Slower release cycle |
| Single renderer file | All UI logic in one ~6100-line file | Hard to navigate, risk of conflicts |

---

*See [ROADMAP.md](ROADMAP.md) for release planning.*
*See [MILESTONES.md](MILESTONES.md) for key dates.*
*See [TODO.md](TODO.md) for tactical execution.*
