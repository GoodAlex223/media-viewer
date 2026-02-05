# Planning

Project planning, task management, and strategic direction.

---

## Overview

This directory contains documents for planning **what** to build and **why**, at both tactical and strategic levels.

| Level | Timeframe | Documents |
|-------|-----------|-----------|
| **Strategic** | Months/Years | ROADMAP.md, GOALS.md, MILESTONES.md |
| **Tactical** | Days/Weeks | TODO.md, BACKLOG.md |
| **Historical** | Past | DONE.md |

---

## Documents

### Task Management (Tactical)

| Document | Purpose |
|----------|---------|
| [TODO.md](TODO.md) | Active tasks, prioritized and ready to work |
| [BACKLOG.md](BACKLOG.md) | Ideas and tasks not yet prioritized |
| [DONE.md](DONE.md) | Completed tasks with learnings |

### Strategic Planning

| Document | Purpose |
|----------|---------|
| [ROADMAP.md](ROADMAP.md) | Long-term vision, major releases |
| [GOALS.md](GOALS.md) | Objectives and success metrics |
| [MILESTONES.md](MILESTONES.md) | Key targets with dates |

---

## Workflow

```
Ideas → BACKLOG.md → TODO.md → Work → DONE.md
                         ↑
              Guided by ROADMAP.md & GOALS.md
```

### Adding New Work

1. **New idea?** → Add to BACKLOG.md
2. **Ready to prioritize?** → Move to TODO.md with priority
3. **Starting work?** → Create plan in `plans/`
4. **Completed?** → Move to DONE.md with summary

### Strategic Review

Periodically review:
- [ ] Does TODO.md align with ROADMAP.md?
- [ ] Are GOALS.md metrics being tracked?
- [ ] Are MILESTONES.md dates realistic?
- [ ] Should BACKLOG.md items be promoted?

---

## Related

| Location | Purpose |
|----------|---------|
| [plans/](plans/) | Implementation plans (how to build) |
| [../archive/](../archive/) | Historical documentation |
| [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) | Decisions and patterns |

---

*For implementation details, see [plans/](plans/).*
*For completed plans, see [../archive/plans/](../archive/plans/).*
