# Development Workflow

This document defines the mandatory development workflow for all code changes.

---

## Overview

Every task follows this cycle:

```
PLAN → EXECUTE → VERIFY → DOCUMENT → COMPLETE
```

Each phase has mandatory checkpoints that must be satisfied before proceeding.

---

## Task Decomposition for Large Tasks

**When a task is large, complex, or voluminous, it MUST be divided into phases.**

### Criteria for Phase Division

A task requires phase division when ANY of these apply:
- Affects 5+ files
- Requires 3+ distinct implementation steps
- Involves multiple subsystems
- Estimated complexity exceeds 100 lines of changes
- Contains multiple independent sub-features

### Phase Execution Protocol

1. **Divide into logical phases** — Each phase should be a complete, testable unit
2. **Execute one phase at a time** — Complete each phase fully before proceeding
3. **Pause and report after each phase**:
   - Report what was accomplished
   - Document results in the plan file (see Execution Log)
   - List any deviations or discoveries
   - **Wait for developer confirmation to proceed**
4. **Apply completion rules to each phase** — Each phase follows the same rigor as a full task:
   - Results obtained
   - Lessons learned
   - Problems encountered
   - Improvements identified

### Phase Report Template

After completing each phase, provide:

```markdown
### Phase [N] Complete: [Phase Name]

**Accomplished**:
- [What was done]

**Files Modified**:
- [file.py] - [change description]

**Tests Status**: [Passing/Failing/Pending]

**Discoveries/Deviations**:
- [Any unexpected findings or plan changes]

**Ready for Phase [N+1]**: [Brief description of next phase]

⏸️ **Awaiting confirmation to proceed...**
```

### Developer Control

- Developer may approve, modify, or halt at any phase checkpoint
- If halted, document current state and remaining phases in plan file
- Phase boundaries are natural save points for complex work

---

## Phase 1: PLAN

### 1.1 Create Plan Document

**Before starting ANY task from TODO.md:**

Create a plan document in `docs/plans/` with filename: `YYYY-MM-DD_task-name.md`

Required sections:

```markdown
# [Task Name] - Implementation Plan

**Task Reference**: TODO.md Section X.Y.Z
**Created**: YYYY-MM-DD
**Status**: Planning | In Progress | Complete
**Last Updated**: YYYY-MM-DD

---

## 1. Task Overview

**Goal**: [Clear statement of objective]
**Context**: [Why this matters]
**Success Criteria**: [How we know it's done]

---

## 2. Initial Plan

**Approach**: [High-level strategy]

**Steps**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Files Affected**: [List]
**Dependencies**: [Other tasks/systems]
**Risks**: [Potential issues]

---

## 3. Implementation Log

[Updated during execution - see Phase 2]

---

## 4. Key Discoveries

[Filled after completion - see Phase 4]
```

### 1.2 Analysis Requirements

Before proceeding to implementation:

- [ ] Problem restated in own words
- [ ] 3+ alternative approaches considered
- [ ] 5+ edge cases identified
- [ ] Existing similar code searched
- [ ] Trade-offs documented
- [ ] Recommended approach justified

### 1.3 User Confirmation

For complex tasks, present analysis summary and get user confirmation before coding.

---

## Phase 2: EXECUTE

### 2.1 Test-Driven Development (TDD)

**Mandatory sequence:**

1. **Write tests first** — Cover expected behavior
2. **Run tests** — Verify they fail (test the tests)
3. **Implement code** — Make tests pass
4. **Refactor** — Clean up while tests stay green
5. **Add edge case tests** — Cover discovered edge cases

### 2.2 Implementation Logging

Update plan document during execution:

```markdown
### [YYYY-MM-DD HH:MM] - [Activity]

**What was done**: [Description]
**Decisions made**: [Key choices with rationale]
**Discoveries**: [New information]
**Challenges**: [Problems and solutions]
**Deviation from plan**: [If any, with reason]
```

### 2.3 Checkpoints

**Every 50 lines of code:**
- [ ] Still aligned with plan?
- [ ] Deviations documented?
- [ ] Partial tests runnable?

**Before any file save:**
- [ ] Addresses actual requirement?
- [ ] No obvious bugs?
- [ ] Types correct?

### 2.4 Stuck Protocol

If stuck after 3 attempts:

1. **STOP** — Do not continue blindly
2. **Document** — What was tried, what failed
3. **Ask** — Request user clarification
4. **Wait** — Do not proceed without guidance

---

## Phase 3: VERIFY

### 3.1 Automated Verification

Before any commit:

```bash
# Run linting (if configured)
npm run lint

# Run tests (when configured)
npm test

# Build check
npm start  # Verify app launches without errors
```

**All must pass before proceeding.**

### 3.2 Manual Testing Gate

**Create testing checklist** at `docs/manual_testing_checklist.md`:

```markdown
# Manual Testing Checklist

**Feature**: [Name]
**Date**: YYYY-MM-DD
**Plan Document**: [Link]
**Status**: Pending Testing

---

## Summary of Changes

**Files Modified**:
- [file.js] - [what changed]

**New Files**:
- [file.js] - [purpose]

---

## Testing Checklist

### Functional Tests
- [ ] **Test 1**: [Description]
  - Steps: [Instructions]
  - Expected: [Result]

### Edge Cases
- [ ] **Edge 1**: [Description]
  - Trigger: [How]
  - Expected: [Behavior]

### Regression Tests
- [ ] [Existing feature still works]

---

## Test Results

**Tested By**: [Name]
**Date**: YYYY-MM-DD

### Issues Found
| # | Description | Severity | Status |
|---|------------|----------|--------|
| 1 | [Issue]    | High/Med/Low | Open/Fixed |

---

## Sign-off

- [ ] All tests passed
- [ ] No regressions
- [ ] Ready to push

**Approved**: [ ] Yes / [ ] No
```

### 3.3 User Approval

**Mandatory before push:**

1. Notify user that changes are ready
2. Provide testing checklist link
3. **Wait for explicit approval**
4. If issues found → fix → return to 3.1
5. Only push after "approved" or equivalent confirmation

---

## Phase 4: DOCUMENT

### 4.1 Required Documentation Updates

Before marking complete:

| Item | Action |
|------|--------|
| TODO.md | Remove task |
| DONE.md | Add task with implementation details |
| Plan document | Mark complete, add discoveries |
| PROJECT_CONTEXT.md | Add architectural decisions |
| CLAUDE.md | Add new patterns/policies if applicable |

### 4.2 Plan Document Completion

**CRITICAL: The plan document in `docs/plans/YYYY-MM-DD_task-name.md` must be updated CONTINUOUSLY throughout task execution, not just at completion.**

Add to plan document:

```markdown
## 4. Key Discoveries

**Technical Insights**:
- [Insight with explanation]

**Architectural Decisions**:
- [Decision: why made, alternatives considered]

**Patterns Identified**:
- [Pattern: where applies, benefits]

**Anti-Patterns Avoided**:
- [Anti-pattern: why problematic]

---

## 5. Future Improvements ⚠️ MANDATORY

**Claude MUST document improvements IMMEDIATELY after EVERY sub-item completes, not batched until task end.**

### After Each Sub-Item (Record Immediately in Plan File)

Update the plan file with a "Sub-Item Complete" log entry containing:

| Field | Description |
|-------|-------------|
| Results obtained | What was concretely achieved |
| Lessons learned | Insights gained during this sub-item |
| Problems encountered | Issues faced and how they were resolved |
| Improvements identified | What could be done better (minimum 1) |
| Technical debt noted | Shortcuts taken that should be addressed |
| Related code | Other areas needing similar changes |

**This is NOT optional. Each sub-item completion MUST trigger a plan file update.**

### At Task Completion
Record ALL of the following:

**Enhancement Ideas** (minimum 2):
- [Idea 1]: [Rationale, estimated effort, priority]
- [Idea 2]: [Rationale, estimated effort, priority]

**Technical Debt Identified**:
- [Debt item]: [Why it exists, impact, remediation approach]

**Performance Optimizations**:
- [Optimization]: [Current state, potential improvement, effort]

**Code Quality Improvements**:
- [Improvement]: [Where applies, benefit]

**Related Tasks Spawned**:
- [Task]: [Relationship to this work, add to TODO.md if actionable]

**Questions for Future Investigation**:
- [Question]: [Why it matters, when to revisit]
```

### 4.3 Improvement Tracking Workflow

**CRITICAL: Improvements must propagate to TODO.md**

After documenting improvements in plan document:

1. **Evaluate each improvement** — Is it actionable? Worth doing?
2. **Add to TODO.md** — Create task entry for accepted improvements
3. **Tag with origin** — Reference the plan document that spawned it
4. **Prioritize** — Assign priority based on impact/effort

Example TODO.md entry:
```markdown
### [ID] - [Improvement from Task X]
**Origin**: docs/plans/YYYY-MM-DD_original-task.md
**Priority**: Medium
**Spawned from**: [Original task description]
**Description**: [What to improve]
```

### 4.3 Code Documentation

For non-obvious code:

```python
# Manual testing fix (YYYY-MM-DD): Handle edge case where...
# This check is needed because...
if edge_case:
    special_handling()
```

---

## Phase 5: COMPLETE

### 5.1 Final Checklist

- [ ] All tests passing
- [ ] Pre-commit hooks passing
- [ ] User approved manual testing
- [ ] TODO.md updated
- [ ] DONE.md updated
- [ ] Plan document completed
- [ ] Code pushed to repository

### 5.2 Git Workflow

```bash
# Stage changes
git add [files]

# Commit with descriptive message
git commit -m "[type]: [description]

[Body explaining what and why]

Refs: #[issue] or TODO.md X.Y.Z"

# Push after user approval
git push origin [branch]
```

Commit types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

---

## Type Safety Requirements

### JSDoc Type Annotations

**Use JSDoc comments for type documentation:**

```javascript
/**
 * Process media files and return filtered results
 * @param {Array<MediaFile>} files - Array of media file objects
 * @param {Object} options - Processing options
 * @param {number} [options.limit=10] - Maximum files to return
 * @returns {Array<MediaFile>} Filtered media files
 */
function processMediaFiles(files, options = {}) {
    // ...
}
```

### Runtime Validation

For user input and external data:

```javascript
/**
 * Validate and sanitize user configuration
 * @param {Object} config - User configuration object
 * @throws {Error} If configuration is invalid
 */
function validateConfig(config) {
    if (typeof config.kValue !== 'number' || config.kValue < 1) {
        throw new Error('K value must be a positive number');
    }
}
```

---

## Code Reuse Policy

### Before Writing New Code

1. **Search for existing implementations**
   ```bash
   grep -r "similarFunction" *.js
   ```

2. **Evaluate reusability**
   - Can existing code be used as-is?
   - Can it be generalized?

3. **Prefer composition** over duplication:
   ```javascript
   // Good: Compose existing utilities
   function newFeature() {
       const data = existingGetData();
       return existingTransform(data);
   }
   ```

### When to Write New

Only when:
- Thorough search found nothing
- Existing code too specialized to generalize
- Reusing would create bad coupling

---

## Emergency Procedures

### Rollback

If deployed changes cause issues:

```bash
# Revert to previous commit
git revert HEAD

# Or reset to known good state
git reset --hard [good-commit]
git push --force origin [branch]
```

### Hotfix

For critical production issues:

1. Branch from main: `git checkout -b hotfix/[name]`
2. Minimal fix only
3. Expedited testing (critical paths only)
4. Direct merge to main
5. Document in incident report

---

*See [CLAUDE.md](../CLAUDE.md) for thinking protocol and analysis requirements.*
