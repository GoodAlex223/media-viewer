# Active Plans

Implementation plans for tasks currently in progress.

---

## Creating a Plan

1. Use template: `.claude/TEMPLATES/plan.md`
2. Save as: `YYYY-MM-DD_task-name.md`
3. Fill in all required sections before starting work
4. **Live-surface preflight** — list every live surface that asserts the claims this task
   corrects (`CLAUDE.md`, `PROJECT.md`, the various `README`s, prompts, templates), then diff
   that list against the plan's own "Files Affected". A spec's file list can silently narrow
   the governing propagation rule: G4's enumerated five files and omitted `PROJECT.md`, which
   carried the exact claims the refresh existed to kill — and which the global Knowledge
   Sources order reads *before* `docs/`. Caught by review, not by the plan.

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
      (enforced by `scripts/check-docs-index.js` in pre-commit — the commit fails without it)

### Closeout artifacts

Derive this list from the global `CLAUDE.md` § Task Completion rule, **not** from the plan's
own Outputs section. A hand-written Outputs list gets executed _instead of_ the rule it
implements, and its omissions read as completeness — they never reach the deviations ledger,
because a ledger records _chosen_ departures. Mark each **done** or **N/A with a reason**: an
explicit N/A is auditable, an omission is not.

| Artifact                                                                                                                                 | Done / N/A + reason |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `BACKLOG.md` — improvements extracted (min 2, routed by source: 🔵 user / 🟤 Claude / 🟡 ops)                                              |                     |
| `TODO.md` — actionable items, plus any § Spawned Tasks rows for out-of-tree work                                                          |                     |
| `DONE.md` — entry with plan link, summary, key changes                                                                                   |                     |
| `WEEKLY.md` — Summary-Table Status **and** the Daily-Schedule entry, each an identifier (`✅ <merge-SHA>`), never a bare ✅                 |                     |
| `docs/README.md` — plan under Archived Plans, spec under Design Specs                                                                    |                     |
| `docs/archive/plans/` — plan moved here, original deleted                                                                                |                     |

Two detection heuristics worth applying at review time: a "closeout" commit that touches
fewer artifacts than the rule names, and a deviations ledger with no entry for a skipped step.

**See [../../archive/plans/README.md](../../archive/plans/README.md) for complete step-by-step archive process.**

Quick reference:

```bash
mv docs/planning/plans/YYYY-MM-DD_task.md docs/archive/plans/
```

---

## Current Plans

| Plan                                                                           | Task                    | Status      | Started    |
| ------------------------------------------------------------------------------ | ----------------------- | ----------- | ---------- |
| [2026-09-02_g3-docs-process-guardrails.md](2026-09-02_g3-docs-process-guardrails.md) | G3 Docs & process guardrails | In Progress | 2026-09-02 |

---

_Template: [../../../.claude/TEMPLATES/plan.md](../../../.claude/TEMPLATES/plan.md)_
_Archive: [../../archive/plans/](../../archive/plans/)_
