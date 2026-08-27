# Planning

Project planning, task management, and strategic direction.

---

## Overview

This directory contains documents for planning **what** to build and **why**, at both tactical and strategic levels.

| Level          | Timeframe    | Documents                           |
| -------------- | ------------ | ----------------------------------- |
| **Strategic**  | Months/Years | ROADMAP.md, GOALS.md, MILESTONES.md |
| **Tactical**   | Days/Weeks   | WEEKLY.md, TODO.md, BACKLOG.md, REVIEW-QUEUE.md |
| **Historical** | Past         | DONE.md                             |

---

## Documents

### Task Management (Tactical)

| Document                           | Purpose                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| [WEEKLY.md](WEEKLY.md)             | Current week's plan: task groups, daily schedule, source quotas |
| [TODO.md](TODO.md)                 | Active tasks, prioritized and ready to work                    |
| [BACKLOG.md](BACKLOG.md)           | Ideas and tasks not yet prioritized                            |
| [DONE.md](DONE.md)                 | Completed tasks with learnings                                 |
| [REVIEW-QUEUE.md](REVIEW-QUEUE.md) | Weekly Reviews queue: parked candidates + verdict log          |

### Strategic Planning

| Document                       | Purpose                          |
| ------------------------------ | -------------------------------- |
| [ROADMAP.md](ROADMAP.md)       | Long-term vision, major releases |
| [GOALS.md](GOALS.md)           | Objectives and success metrics   |
| [MILESTONES.md](MILESTONES.md) | Key targets with dates           |

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

### Strategic Review (staleness check)

Run as part of every planning session, whatever its cadence (ROADMAP/GOALS/MILESTONES
are already listed planning Sources):

- If work shipped since the last plan **contradicts** the strategic docs (a feature
  landed outside the theme board, a Key Result was met or made obsolete, a milestone
  passed), **or** any of the three has `Last Updated` **older than 2 months** → file a
  🟡 Operational BACKLOG entry ("strategic-doc refresh", citing the specific drift).
- Small factual fixes (a number, a status flip) may instead ride along in that week's
  docs group — no dedicated refresh entry needed.

---

## Related

| Location                                       | Purpose                             |
| ---------------------------------------------- | ----------------------------------- |
| [plans/](plans/)                               | Implementation plans (how to build) |
| [../archive/](../archive/)                     | Historical documentation            |
| [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) | Decisions and patterns              |

---

_For implementation details, see [plans/](plans/)._
_For completed plans, see [../archive/plans/](../archive/plans/)._
