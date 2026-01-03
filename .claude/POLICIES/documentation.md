# Documentation Policy

Requirements for maintaining project documentation and knowledge preservation.

---

## Core Principle

**Every task generates knowledge. Knowledge must be captured before it's lost.**

---

## Document Types

| Document | Purpose | Location |
|----------|---------|----------|
| Plan documents | Task execution log | `docs/plans/YYYY-MM-DD_task.md` |
| TODO.md | Pending tasks | Root |
| DONE.md | Completed tasks | Root |
| PROJECT_CONTEXT.md | Architecture decisions | Root |
| CLAUDE.md | AI assistant rules | Root |
| ARCHITECTURE.md | System design | Root |

---

## Plan Documents

### When Required

**Every task from TODO.md must have a plan document.**

### Creation

Before starting any task:

```markdown
# [Task Name] - Implementation Plan

**Task Reference**: TODO.md Section X.Y.Z
**Created**: YYYY-MM-DD
**Status**: Planning
**Last Updated**: YYYY-MM-DD

## 1. Task Overview
**Goal**: [What]
**Context**: [Why]
**Success Criteria**: [How we know it's done]

## 2. Initial Plan
**Approach**: [Strategy]
**Steps**: [Numbered list]
**Files Affected**: [List]
**Risks**: [Potential issues]

## 3. Implementation Log
[Updated during execution]

## 4. Key Discoveries
[Filled after completion]

## 5. Future Improvements
[Ideas for follow-up]
```

### During Execution

Log each significant action:

```markdown
### [YYYY-MM-DD HH:MM] - [Activity]
**Done**: [Description]
**Decisions**: [Choices made]
**Discoveries**: [New information]
**Challenges**: [Problems solved]
```

### After Completion

Add discoveries section:

```markdown
## 4. Key Discoveries

**Technical Insights**:
- [Insight]: [Explanation]

**Architectural Decisions**:
- [Decision]: [Rationale, alternatives considered]

**Patterns Identified**:
- [Pattern]: [When to use]

**Anti-Patterns Avoided**:
- [Anti-pattern]: [Why bad]
```

---

## ⚠️ Improvement Tracking (MANDATORY)

### Core Principle

**Every sub-item and every completed task MUST generate improvement ideas.**

This is not optional. Improvement documentation is as important as the implementation itself.

**CRITICAL: Record improvements IMMEDIATELY after each sub-item completes. Do NOT batch improvements until task end. Update the plan file in `docs/plans/` after each sub-item.**

### After Each Sub-Item (Record Immediately)

**Stop and update the plan file with:**

| Field | What to Record |
|-------|----------------|
| Results obtained | Concrete outcomes achieved in this sub-item |
| Lessons learned | Insights and knowledge gained |
| Problems encountered | Issues faced and how they were resolved |
| What could be done better? | Specific improvement ideas |
| What shortcuts were taken? | Technical debt created |
| What related code needs similar changes? | Follow-up tasks identified |

**Format in plan file:**
```markdown
#### [YYYY-MM-DD HH:MM] — PHASE: Sub-Item Complete
- Sub-item: [what was finished]
- **Results obtained**: [achievements]
- **Lessons learned**: [insights]
- **Problems encountered**: [issues and resolutions]
- **Improvements identified**: [list]
- **Technical debt noted**: [if any]
- **Related code needing changes**: [if any]
```

### At Task Completion

**Minimum requirements:**

- [ ] 2+ enhancement ideas documented
- [ ] Technical debt identified and logged
- [ ] Performance opportunities noted
- [ ] Actionable items added to TODO.md

### Improvement Categories

```markdown
## 5. Future Improvements

### Enhancement Ideas (minimum 2)
| Idea | Rationale | Effort | Priority |
|------|-----------|--------|----------|
| [1]  | [Why]     | [H/M/L]| [H/M/L]  |
| [2]  | [Why]     | [H/M/L]| [H/M/L]  |

### Technical Debt
| Item | Why It Exists | Impact | Remediation |
|------|---------------|--------|-------------|
| [1]  | [Reason]      | [H/M/L]| [Approach]  |

### Performance Optimizations
| Area | Current State | Potential Gain | Effort |
|------|---------------|----------------|--------|
| [1]  | [Now]         | [Improvement]  | [H/M/L]|

### Spawned Tasks
| Task | Origin | Priority | Added to TODO.md |
|------|--------|----------|------------------|
| [1]  | [Step] | [H/M/L]  | [ ] Yes / [ ] No |
```

### Propagation to TODO.md

**All actionable improvements MUST be added to TODO.md:**

```markdown
### [ID] - [Improvement Title]
**Origin**: docs/plans/YYYY-MM-DD_task.md
**Spawned from**: [Original task]
**Priority**: [H/M/L]
**Description**: [What to improve and why]
```

### Why This Matters

- Captures insights while fresh in context
- Prevents knowledge loss between sessions
- Creates continuous improvement pipeline
- Documents technical debt explicitly
- Makes future work visible and plannable

---

## Task Completion Checklist

Before marking ANY task complete:

### Documentation Updates

- [ ] Task removed from TODO.md
- [ ] Task added to DONE.md with implementation details
- [ ] Plan document marked complete
- [ ] Architectural decisions added to PROJECT_CONTEXT.md
- [ ] New patterns/policies added to CLAUDE.md (if applicable)

### Verification

- [ ] All tests passing
- [ ] Pre-commit hooks passing
- [ ] Manual testing approved
- [ ] Code reviewed against policies

---

## TODO.md Format

```markdown
## [Category]

### [Task ID] - [Task Name]
**Priority**: High | Medium | Low
**Estimated effort**: [Hours/Days]
**Dependencies**: [Other tasks]
**Description**: [What needs to be done]
**Acceptance criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
```

---

## DONE.md Format

```markdown
## [Date] - [Task Name]

**Task Reference**: TODO.md [ID]
**Plan Document**: [Link]
**Duration**: [Actual time]

**Implementation**:
[Brief description of what was actually done]

**Key Decisions**:
- [Decision 1]: [Why]

**Lessons Learned**:
- [Lesson]

**Follow-up Tasks**:
- [If any spawned new tasks]
```

---

## Code Documentation

### Function/Method Documentation

Required for all public functions:

```javascript
/**
 * Calculate similarity score between two image hashes.
 *
 * @param {string} hash1 - First image perceptual hash
 * @param {string} hash2 - Second image perceptual hash
 * @returns {number} Similarity score between 0.0 and 1.0
 * @throws {Error} If either hash is invalid
 *
 * @example
 * calculateSimilarity('abc123', 'abc124')
 * // returns 0.95
 */
function calculateSimilarity(hash1, hash2) {
    // ...
}
```

### Inline Comments

Use for non-obvious code:

```javascript
// Sort by similarity descending, then by name for ties
// This ensures consistent ordering across sessions
files.sort((a, b) => b.similarity - a.similarity || a.name.localeCompare(b.name));
```

### Override Comments

When user overrides AI recommendation:

```javascript
// USER OVERRIDE: 2025-01-15
// Approach: Using global state object
// Concerns: State management complexity, testing difficulty
// Justification: "Simpler than implementing full state manager for MVP"
// Revisit: When adding undo/redo feature
const appState = {};
```

### Manual Testing Fix Comments

When fixing issues found during testing:

```javascript
// Manual testing fix (2025-01-15): Handle missing file
// Found during testing: crash when file is deleted during viewing
// Root cause: No existence check before loading
if (!file || !file.path) {
    return;
}
```

---

## Commit Messages

Format:

```
[type]: [Short description]

[Body: What and why, not how]

Refs: #[issue] or TODO.md [section]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `docs`: Documentation only
- `test`: Test changes
- `chore`: Maintenance

Example:

```
feat: Add post filtering by rating

Implements rating filter for recommendation engine.
Users can now filter posts by safe/questionable/explicit.

- Added filter_by_rating() to PostList
- Updated recommendation algorithm to apply filter
- Added tests for all rating types

Refs: TODO.md 2.3.1
```

---

## Knowledge Propagation

When completing a task, evaluate what should propagate:

| Discovery Type | Propagate To |
|---------------|--------------|
| Architectural decision | PROJECT_CONTEXT.md |
| New development pattern | CLAUDE.md |
| Reusable code pattern | Code comments + CLAUDE.md |
| Bug fix pattern | Regression test + docs |
| Breaking change | ARCHITECTURE.md |

---

## Timestamps

Always include timestamps on:

- Plan document creation/updates
- Decision records
- Override comments
- Manual testing fixes
- Status document "Last Verified"

Format: `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` for precision.

---

*See [../WORKFLOW.md](../WORKFLOW.md) for how documentation integrates with development phases.*
