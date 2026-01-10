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

| Plan | Task | Archived Date |
|------|------|---------------|
| [2025-12-25_notifications-media-info-less-intrusive.md](2025-12-25_notifications-media-info-less-intrusive.md) | Less intrusive notifications | 2026-01-10 |
| [2025-12-27_sorting-cache.md](2025-12-27_sorting-cache.md) | Sorting algorithm cache | 2026-01-10 |
| [2025-12-28_background-feature-extraction.md](2025-12-28_background-feature-extraction.md) | Background feature extraction | 2026-01-10 |
| [2026-01-02_compare-mode-ai-sort-bug.md](2026-01-02_compare-mode-ai-sort-bug.md) | Compare mode AI sort bug | 2026-01-10 |

---

## Complete Archive Process

### Step 1: Verify Plan Completion

Before archiving, confirm ALL criteria above are met:

- [ ] All implementation steps marked `[x]` complete
- [ ] All tests passing
- [ ] "Key Discoveries" section is filled in
- [ ] "Future Improvements" section has **minimum 2 items**
- [ ] Execution log contains "Sub-Item Complete" entries for all sub-items

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
mv docs/plans/YYYY-MM-DD_task-name.md docs/archive/plans/

# Also delete .claude/plans/ copy if exists
rm .claude/plans/YYYY-MM-DD_task-name.md
```

### Step 5: Update Documentation Index

- Update `../plans/README.md` — remove from "Current Plans" table
- Update `../README.md` — add to "Completed Plans" table
- Update `../../README.md` — if plan was listed in "Implementation Plans"

---

## Quick Checklist

- [ ] Plan completion verified (all steps done, tests pass)
- [ ] Improvements extracted to BACKLOG.md (categorized appropriately)
- [ ] Summary added to DONE.md (with lessons learned)
- [ ] Plan moved to docs/archive/plans/
- [ ] .claude/plans/ copy deleted (if exists)
- [ ] docs/plans/README.md updated
- [ ] docs/archive/README.md updated

---

*Last Updated: 2026-01-10*
