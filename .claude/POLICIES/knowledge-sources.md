# Knowledge Sources Policy

**Purpose**: Ensure Claude Code uses project documentation as a knowledge base before planning and during task execution.

**Last Updated**: 2025-12-25

---

## 1. Pre-Task Documentation Review

### Before Starting ANY Significant Task

Claude MUST read the documentation index to identify relevant documents:

```
1. Read docs/README.md (documentation index)
2. Read docs/TODO.md (check for related tasks, context)
3. Identify domain-specific docs from the index
4. Read relevant documents before planning
```

### Task Type → Required Documents

| Task Type | Must Read | Should Read |
|-----------|-----------|-------------|
| **New Feature** | TODO.md, ARCHITECTURE.md | PROJECT_CONTEXT.md, related plans |
| **Bug Fix** | TODO.md | Related code files, existing plans |
| **Refactoring** | ARCHITECTURE.md, PROJECT_CONTEXT.md | Existing refactoring plans in archive |
| **UI Changes** | styles.css, index.html | media-viewer.js (UI logic) |
| **IPC/Main Process** | main.js, preload.js | Electron documentation |
| **Algorithm Changes** | media-viewer.js | PROJECT_CONTEXT.md (design decisions) |
| **Documentation** | docs/README.md | All docs in relevant section |

---

## 2. Document Discovery Protocol

### Step 1: Consult the Index

Always start with `docs/README.md` to find:
- Which documents exist
- Where they are located
- What topics they cover

### Step 2: Search for Related Content

Use these patterns to find relevant documentation:

```bash
# Find docs mentioning a topic
Grep pattern="topic_name" path="docs/"

# Find plan files for similar work
Glob pattern="docs/plans/*topic*.md"

# Check archive for historical context
Grep pattern="topic_name" path="docs/archive/"
```

### Step 3: Read Linked Documents

Follow links within documents to discover related content. Documentation is interconnected.

---

## 3. Document Maintenance Responsibilities

### During Task Execution

| Event | Required Action |
|-------|-----------------|
| Find outdated information | Note in plan file, fix before task completion |
| Discover undocumented pattern | Add to PROJECT_CONTEXT.md |
| Create new file/module | Document in relevant docs |
| Complete a plan | Move insights to PROJECT_CONTEXT.md |

### After Task Completion

1. **Update "Last Updated"** date on any modified documentation
2. **Index new docs** in docs/README.md
3. **Archive completed plans** if they only contain historical value
4. **Extract learnings** to permanent documentation

---

## 4. Archive Decision Tree

```
Is the document still actively referenced?
├── YES → Keep in main docs/
└── NO → Continue...

Does it contain guidance for future work?
├── YES → Keep in main docs/
└── NO → Continue...

Is it >3 months old without updates?
├── YES → Review for archiving
└── NO → Keep in main docs/

Does it document completed work only?
├── YES → Move to docs/archive/
└── NO → Keep in main docs/
```

### Archive Process

1. Move file to `docs/archive/`
2. Add entry to `docs/archive/README.md`
3. Remove from `docs/README.md` main sections
4. Update any links pointing to the old location

---

## 5. Knowledge Extraction Protocol

### When Completing Tasks

Before marking a task complete, extract knowledge to permanent docs:

```markdown
## Knowledge to Extract

1. **Patterns discovered** → PROJECT_CONTEXT.md
2. **Architectural decisions** → ARCHITECTURE.md or PROJECT_CONTEXT.md
3. **Bug fix patterns** → docs/bugfixes/ (if reusable)
4. **Testing insights** → TESTING.md
5. **Workflow improvements** → CLAUDE.md or .claude/WORKFLOW.md
```

### Plan File Lifecycle

```
1. CREATED: docs/plans/YYYY-MM-DD_task-name.md
2. ACTIVE: Updated during task execution
3. COMPLETE: All work done, learnings extracted
4. ARCHIVED: Move to docs/archive/ if only historical value remains
```

---

## 6. Document Freshness Indicators

### Check These Dates

Every document should have a "Last Updated" date. Documents need attention if:

| Age | Action |
|-----|--------|
| < 1 month | Current, no action needed |
| 1-3 months | Verify still accurate |
| 3-6 months | Review for updates or archiving |
| > 6 months | Strong candidate for archive or major update |

### Staleness Signals

- References to deleted files/functions
- Mentions removed features
- Contradicts current codebase
- Links to archived documents

---

## 7. Integration with Task Workflow

### Plan Phase

```
1. Read docs/README.md
2. Read docs/TODO.md (find task, check context)
3. Read docs/PROJECT_CONTEXT.md (understand patterns)
4. Read domain-specific docs
5. Check docs/plans/ for similar completed work
6. Create plan with documentation references
```

### Execute Phase

```
1. Update plan file with progress
2. Note any documentation issues found
3. Update docs if code changes affect them
```

### Complete Phase

```
1. Extract learnings to permanent docs
2. Update "Last Updated" on modified docs
3. Index any new documentation
4. Archive plan if appropriate
5. Update TODO.md and DONE.md
```

---

## 8. Quick Reference

### Find Documentation

```bash
# All docs
ls docs/

# Specific topic
grep -r "topic" docs/

# Plans
ls docs/plans/

# Archived
ls docs/archive/
```

### Document Locations

| Content Type | Location |
|--------------|----------|
| Active tasks | docs/TODO.md |
| Completed tasks | docs/DONE.md |
| Project patterns | docs/PROJECT_CONTEXT.md |
| Architecture | docs/ARCHITECTURE.md |
| Implementation plans | docs/plans/*.md |
| Historical docs | docs/archive/*.md |
| Main process code | main.js, preload.js |
| Renderer code | media-viewer.js |
| UI structure | index.html, styles.css |

---

*This policy ensures Claude Code maintains accurate, current documentation and uses project knowledge effectively.*
