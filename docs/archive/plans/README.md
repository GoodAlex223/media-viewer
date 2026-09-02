# Archived Plans

Completed implementation plans preserved for historical reference.

---

## What Goes Here

Plans are archived when:

1. All implementation steps are marked `[x]` complete
2. All tests are passing
3. "Key Discoveries" section is filled in
4. "Future Improvements" section has minimum 2 items
5. Improvements extracted to BACKLOG.md

---

## Archived Plans

**The index lives in [`docs/README.md` § Archived Plans](../../README.md).** It is the single
canonical list, and it is machine-enforced: `scripts/check-docs-index.js` fails the commit if a
file in this directory has no link there, or if any link there does not resolve.

This page deliberately keeps **no second table**. The one it used to carry had drifted to 18 of
60 plans — a hand-maintained mirror of an enforced list is guaranteed to lose, and keeping two
indexes in sync is the failure mode the guard exists to end. `git log -p -- docs/archive/plans/README.md`
recovers the old rows if anyone needs them. Everything below is the archive **process**, which
is what this page is for.

---

## Complete Archive Process

### Step 1: Verify Plan Completion

Before archiving, confirm ALL criteria above are met:

- [ ] All implementation steps marked `[x]` complete
- [ ] **Flip every remaining `- [ ]` inside the plan to `- [x]`** (Success Criteria, Implementation Steps, Test Plan, Review)
- [ ] **Set the plan header `Status:` to `Complete`**
- [ ] All tests passing
- [ ] "Key Discoveries" section is filled in
- [ ] "Future Improvements" section has **minimum 2 items**
- [ ] Execution log contains "Sub-Item Complete" entries for all sub-items
- [ ] **Verify every commit SHA cited in the plan / DONE.md / CLAUDE.md is an ancestor of `main`** — `git merge-base --is-ancestor <sha> main` (catches dead-branch citations like the recurring PR #37 stale-SHA trap)

### Step 2: Extract Improvements to BACKLOG.md

Review the plan's "Future Improvements" and "Key Discoveries" sections:

1. **Open** [../../planning/BACKLOG.md](../../planning/BACKLOG.md)
2. **Categorize each improvement** into the appropriate section:
   - **Feature Ideas** → New functionality concepts
   - **Enhancements** → Improvements to existing features
   - **Technical Debt** → Issues to address later
   - **Research Topics** → Areas needing investigation
3. **Add entries** with Value/Effort estimates and source ("Plan: YYYY-MM-DD_task-name")
4. **Update** the "Last Updated" date in BACKLOG.md

### Step 3: Add Summary to DONE.md

1. **Open** [../../planning/DONE.md](../../planning/DONE.md)
2. **Add entry** under the current month section:

```markdown
### [Date] - [Task Name]

**Task Reference**: TODO.md TASK-XXX
**Plan Document**: [docs/archive/plans/YYYY-MM-DD_task.md](../archive/plans/YYYY-MM-DD_task.md)
**Duration**: [Actual time]

**Implementation**:
[Brief description of what was actually done]

**Key Decisions**:

- [Decision 1]: [Why]

**Lessons Learned**:

- [Lesson from the plan]

**Follow-up Tasks**:

- [Link to any new TODO.md items spawned]
```

3. **Update** the "Last Updated" date

### Step 4: Move Plan to Archive

```bash
# Move completed plan from active to archive
mv docs/planning/plans/YYYY-MM-DD_task-name.md docs/archive/plans/

# Also delete .claude/plans/ copy if exists
rm .claude/plans/YYYY-MM-DD_task-name.md
```

### Step 5: Update Documentation Index

- Update `../../README.md` — move the plan from "Active Plans" to "Archived Plans"
- Update `../../README.md` — add the **design spec** under "Design Specs" (specs are the commonly-missed half — index BOTH the plan AND its spec)
- Update `../README.md` — add to "Archived Documents" table (if a non-plan doc)

> The pre-commit guard checks steps 5's first two bullets for you, and it reads the **git
> index** — so stage `docs/README.md` in the same commit as the moved plan, or the guard fires.

---

## Quick Checklist

- [ ] Plan completion verified (all steps done, tests pass)
- [ ] All in-plan checkboxes flipped to `[x]` and header `Status: Complete`
- [ ] Cited commit SHAs verified as ancestors of `main`
- [ ] Improvements extracted to BACKLOG.md (categorized appropriately)
- [ ] Summary added to DONE.md (with lessons learned)
- [ ] Plan moved to docs/archive/plans/
- [ ] .claude/plans/ copy deleted (if exists)
- [ ] docs/README.md updated — Active Plans → Archived Plans **and** spec added under Design Specs
- [ ] docs/archive/README.md updated

---

_There is deliberately no "Last Updated" line here — git records when this file last changed,
and the footer this page used to carry went stale exactly the way `docs/README.md`'s did._