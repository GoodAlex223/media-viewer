# Active Plans

Implementation plans for tasks currently in progress.

---

## Creating a Plan

1. Use template: `.claude/TEMPLATES/plan.md`
2. Save as: `YYYY-MM-DD_task-name.md`
3. Fill in all required sections before starting work

---

## During Execution

- Mark completed steps with `[x]`
- Add implementation log entries with timestamps
- Document discoveries and deviations
- Update "Files Affected" as changes are made

---

## After Completion

Move to archive when ALL are true:

- [ ] All steps marked `[x]` complete
- [ ] **All in-plan checkboxes flipped to `[x]`; plan header `Status: Complete`**
- [ ] Tests passing
- [ ] "Key Discoveries" filled in
- [ ] "Future Improvements" has 2+ items
- [ ] **Improvements extracted to BACKLOG.md** (categorized appropriately)
- [ ] **Cited commit SHAs verified as ancestors of `main`** (`git merge-base --is-ancestor <sha> main`)
- [ ] Summary added to `../DONE.md`
- [ ] **Indexed in `docs/README.md` — plan under Archived Plans AND spec under Design Specs**

**See [../../archive/plans/README.md](../../archive/plans/README.md) for complete step-by-step archive process.**

Quick reference:

```bash
mv docs/planning/plans/YYYY-MM-DD_task.md docs/archive/plans/
```

---

## Current Plans

| Plan                                                                           | Task                    | Status      | Started    |
| ------------------------------------------------------------------------------ | ----------------------- | ----------- | ---------- |
| [2026-08-30_g2-tournament-undo-hardening.md](2026-08-30_g2-tournament-undo-hardening.md) | G2 tournament undo hardening | In Progress | 2026-08-30 |
| [2025-12-29_video-fullscreen-toggle.md](2025-12-29_video-fullscreen-toggle.md) | Video fullscreen toggle | In Progress | 2025-12-29 |

---

_Template: [../../../.claude/TEMPLATES/plan.md](../../../.claude/TEMPLATES/plan.md)_
_Archive: [../../archive/plans/](../../archive/plans/)_
