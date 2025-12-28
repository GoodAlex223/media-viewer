# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

---

## ⚠️ CRITICAL RULES (Absolute Priority)

### 1. English-Only Communication

**ALL communication MUST be in English.**

- If user writes in another language → Stop, request English, wait
- If English has errors → Correct politely, confirm understanding, then proceed
- Applies to: messages, code comments, documentation, commits

### 2. Think Before Acting

**NEVER start coding immediately. Follow the Thinking Protocol.**

See: [.claude/POLICIES/critical-thinking.md](.claude/POLICIES/critical-thinking.md)

### 3. Plan-Execute-Verify Cycle

Every task follows this cycle:

```
PLAN → EXECUTE → VERIFY → DOCUMENT → COMPLETE
```

See: [.claude/WORKFLOW.md](.claude/WORKFLOW.md)

---

## Thinking Protocol

### Phase 1: EXPLORE (Before Any Code)

1. **Restate the problem** in your own words
2. **Identify 3+ alternative approaches** — never settle on first idea
3. **Ask "What am I missing?"** — actively look for blind spots
4. **List at least 5 edge cases** early
5. **Search for existing code** that solves similar problems

### Phase 2: CHALLENGE

1. **Play devil's advocate** against your proposed solution
2. **List explicit assumptions** you're making
3. **Stress-test mentally**: "What would break this?"
4. **Consider**: maintenance burden in 6 months

### Phase 3: SYNTHESIZE

Present findings in structured format:

```markdown
## Analysis Summary

**Problem**: [Restated problem]

**Approaches Considered**:
1. [Approach A] — Pros: ... / Cons: ...
2. [Approach B] — Pros: ... / Cons: ...
3. [Approach C] — Pros: ... / Cons: ...

**Assumptions**:
- [Assumption 1]
- [Assumption 2]

**Edge Cases**:
- [Case 1]: How handled
- [Case 2]: How handled

**Recommended Approach**: [Choice with reasoning]

**Risks**: [Key risks and mitigations]
```

### Forced Perspective Shifts

Before finalizing, ask yourself:

- "How would this break at 10x scale?"
- "What if the user's assumption is wrong?"
- "Is there a simpler way I dismissed too quickly?"
- "What would a senior engineer critique here?"

---

## Execution Checkpoints

### Every 50 Lines of Code

- [ ] Does this still align with original plan?
- [ ] Have I introduced deviations? → Document them
- [ ] Can I run partial tests?

### Before Any File Save

- [ ] Re-read the original requirement
- [ ] Does this address the actual ask?
- [ ] Are there obvious bugs?

### Phase-Based Execution

**If the plan has phases, implement ONE phase at a time.**

1. Complete all tasks within current phase
2. Verify phase completion (tests passing, acceptance criteria met)
3. Document phase results in plan file
4. Only then proceed to next phase

**Rationale**: Prevents context overload, ensures incremental verification, and allows course correction between phases.

### If Stuck for 3+ Attempts

**STOP immediately.**

1. Document what was tried
2. Document what failed and why
3. Ask user for clarification
4. Do NOT keep trying blindly

---

## Abort Conditions

**Claude MUST stop and consult user when:**

1. Task scope exceeds original estimate by 2x
2. Discovered requirement conflicts with existing architecture
3. 3+ test failures after 3 fix attempts
4. Uncertainty about security implications
5. Found potential data loss scenario
6. Need to modify Tier 4 (critical) systems
7. Ambiguity that could lead to wrong implementation

---

## Execution Log Format

**Plan files MUST be created in `docs/plans/YYYY-MM-DD_task-name.md` and updated continuously as work progresses.**

For every task, maintain a running log in the plan document:

```markdown
### Execution Log

#### [YYYY-MM-DD HH:MM] — PHASE: Planning
- Goal understood: [summary]
- Approach chosen: [brief]
- Risks identified: [list]

#### [YYYY-MM-DD HH:MM] — PHASE: Implementation
- Step completed: [what]
- Deviation from plan: [yes/no, why]
- Unexpected discovery: [if any]

#### [YYYY-MM-DD HH:MM] — PHASE: Sub-Item Complete ⚠️ MANDATORY AFTER EACH SUB-ITEM
- Sub-item: [what was finished]
- **Results obtained**: [what was achieved]
- **Lessons learned**: [insights gained during this sub-item]
- **Problems encountered**: [issues faced and how resolved]
- **Improvements identified**: [what could be better]
  - [Improvement 1]
  - [Improvement 2]
- **Technical debt noted**: [if any]
- **Related code needing similar changes**: [if any]

#### [YYYY-MM-DD HH:MM] — PHASE: Blocked
- Blocker: [description]
- Attempts made: [list]
- Resolution: [how solved / escalated to user]

#### [YYYY-MM-DD HH:MM] — PHASE: Complete
- Final approach: [summary]
- Tests passing: [yes/no]
- Documentation updated: [list]
- **Improvements documented**: [count, see Section 5]
- **Added to TODO.md**: [list of spawned tasks]
```

**CRITICAL**: The "Sub-Item Complete" log entry is NOT optional. It MUST be written to the plan file immediately after completing each sub-item, NOT batched until the end of the task.

---

## ⚠️ Improvement Tracking

**MANDATORY after every sub-item and at task completion.**

**CRITICAL: Improvements must be recorded IMMEDIATELY after each sub-item completes, not batched until the end. Update the plan file in `docs/plans/` after each sub-item.**

### After Each Sub-Item (Record Immediately)

| Question | Must Document |
|----------|---------------|
| What results were obtained? | Concrete outcomes achieved |
| What lessons were learned? | Insights gained during work |
| What problems were encountered? | Issues faced and resolutions |
| What could be done better? | Specific improvements identified |
| What shortcuts were taken? | Technical debt created |
| What related code needs similar changes? | Follow-up work identified |

### At Task Completion

Document in plan file Section 5:
- Minimum 2 enhancement ideas
- Technical debt identified
- Performance opportunities
- Actionable items → add to TODO.md

### Document Indexing

**All created documents MUST be indexed in [docs/README.md](docs/README.md).**

This file serves as the central index for all project documentation. When creating new documents:
1. Add entry to the appropriate section in `docs/README.md`
2. Include brief description of document purpose
3. Keep index alphabetically or logically organized

See: [.claude/POLICIES/documentation.md](.claude/POLICIES/documentation.md)

---

## Critical Analysis Policy

### Core Principle: Professional Skepticism

**Before implementing ANY request, Claude MUST:**

1. **Analyze critically** — Don't blindly accept user assertions
2. **Evaluate against best practices** — Compare with industry standards
3. **Identify potential issues** — Look for flaws, edge cases, alternatives
4. **Propose improvements** — Suggest better approaches
5. **Explain trade-offs** — Discuss pros/cons clearly

### What to Question

| Area | Questions to Ask |
|------|------------------|
| Architecture | Right pattern? Scales? Unnecessary coupling? |
| Algorithm | Most efficient? Time/space complexity? Edge cases? |
| Code Structure | SOLID? DRY? Matches codebase patterns? |
| Types | Properly constrained? Invalid states possible? |

### Response Pattern for Concerns

```markdown
**Analysis of your request:**

I notice [specific concern]. Here's my analysis:

**Potential Issues:**
- [Issue 1]
- [Issue 2]

**Alternative Approach:**
[Better solution]

**Trade-offs:**
- Your approach: [pros/cons]
- Suggested: [pros/cons]

**Recommendation:**
I suggest [approach] because [reasoning].

Options:
1. Your original approach
2. My suggested alternative
3. Hybrid approach
```

### User Override Policy

If user insists on their approach despite concerns:

1. **User MUST provide justification**
2. **Claude documents the decision** in code:

```javascript
// USER OVERRIDE: [Date]
// Approach: [what was chosen]
// Concerns raised: [list]
// User justification: "[their reasoning]"
```

3. **Only then proceed with implementation**

---

## Linked Policies

| Document | Purpose |
|----------|---------|
| [.claude/WORKFLOW.md](.claude/WORKFLOW.md) | Development workflow, TDD, CI/CD |
| [.claude/POLICIES/critical-thinking.md](.claude/POLICIES/critical-thinking.md) | Deep analysis requirements |
| [.claude/POLICIES/testing.md](.claude/POLICIES/testing.md) | Testing standards, coverage |
| [.claude/POLICIES/documentation.md](.claude/POLICIES/documentation.md) | Documentation requirements |
| [.claude/POLICIES/knowledge-sources.md](.claude/POLICIES/knowledge-sources.md) | Knowledge sources and document maintenance |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, breaking changes |

---

## Knowledge Sources

**Before planning any significant task, Claude MUST consult project documentation.**

See: [.claude/POLICIES/knowledge-sources.md](.claude/POLICIES/knowledge-sources.md)

### Required Reading (Before Planning)

| Document | When to Consult | Purpose |
|----------|-----------------|---------|
| [docs/README.md](docs/README.md) | Always | Documentation index - find relevant docs |
| [docs/TODO.md](docs/TODO.md) | Always | Active tasks, context, related work |
| [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) | Architecture/design tasks | Project decisions, patterns, history |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code changes | System architecture, layer responsibilities |
| [docs/plans/](docs/plans/) | Complex tasks | Existing plans, lessons learned |

### Document Maintenance Rules

Claude is responsible for keeping documentation current:

| Condition | Action |
|-----------|--------|
| Document references deleted code/files | Update or archive the document |
| Document >3 months without updates | Review for relevance, update "Last Updated" |
| New patterns/decisions emerge | Update PROJECT_CONTEXT.md |
| New documentation created | Index in docs/README.md |
| Document no longer relevant | Move to docs/archive/, update archive/README.md |
| Task completed with learnings | Extract insights to PROJECT_CONTEXT.md |

### Archive Criteria

Move documents to `docs/archive/` when:
- The work they describe is complete and merged
- They contain only historical context (no active guidance)
- They are superseded by newer documentation
- They haven't been referenced in >6 months

---

## Project Overview

Electron-based desktop application for efficiently browsing, rating, and managing media files (images and videos). Features advanced similarity-based sorting using perceptual image hashing algorithms.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Main Process | `main.js` | Electron main process, IPC handlers, file operations |
| Preload | `preload.js` | Security bridge between renderer and main process |
| Renderer | `media-viewer.js` | Core application logic (UI, algorithms, state) |
| UI Template | `index.html` | Main HTML structure |
| Styles | `styles.css` | UI styling and theming |

### Key Features

| Feature | Implementation |
|---------|----------------|
| Similarity Sorting | VP-Tree + MST algorithms using blockhash |
| View Modes | Single and Compare (side-by-side) |
| Image Zoom | Mouse wheel, double-click, pan support |
| Rating System | Like/Dislike with automatic folder management |
| Video Playback | Custom controls (play/pause, volume, progress) |

### Supported Formats

**Images**: JPG, JPEG, PNG, GIF, WebP
**Videos**: MP4, WebM, MOV

### Commands

```bash
# Run application (development)
npm start

# Run tests (not yet configured)
npm test
```

---

## Quick Reference

### Before Starting Any Task

1. ✅ Read and understand the requirement
2. ✅ Create plan document in `docs/plans/`
3. ✅ Think through alternatives (minimum 3)
4. ✅ Identify edge cases (minimum 5)
5. ✅ Search for existing similar code
6. ✅ Present analysis to user if complex

### During Implementation

1. ✅ Follow TDD — tests first
2. ✅ Log progress in plan document
3. ✅ Check alignment every 50 lines
4. ✅ Stop if stuck after 3 attempts

### Before Completion

1. ✅ All tests passing
2. ✅ Pre-commit hooks passing
3. ✅ Manual testing checklist created
4. ✅ Wait for user approval before push
5. ✅ **Document improvements** (minimum 2 per task)
6. ✅ **Add actionable improvements to TODO.md**
7. ✅ Update all documentation
8. ✅ Move task from TODO.md to DONE.md

---

*For detailed policies, see linked documents in `.claude/` directory.*
