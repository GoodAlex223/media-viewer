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
| [2026-04-20-group-e-resource-management.md](2026-04-20-group-e-resource-management.md) | Group E: Resource Management (CLIP unload + logger guard) | 2026-04-21 |
| [2026-04-29-group-f-build-dx.md](2026-04-29-group-f-build-dx.md) | Group F: Build & DX (Lucide CDN pin + regression-checker update) | 2026-04-29 |
| [2026-06-19-sort-responsiveness-core.md](2026-06-19-sort-responsiveness-core.md) | Group P1: Sort responsiveness core (progress/cancel card + O(n²) MST-fallback fix + yielding + dead-code removal), PR1 of 3 | 2026-06-19 |
| [2026-06-24-tournament-large-folder-perf.md](2026-06-24-tournament-large-folder-perf.md) | Group P2: Tournament large-folder performance (debounced single-flight persistence + O(n) consumed-marker pairing + cached path→index Map + slim v2 history-free payload + atomic write) | 2026-06-24 |
| [2026-06-25-extraction-timing.md](2026-06-25-extraction-timing.md) | Group P3: Feature-extraction timing — lazy / on-demand (remove folder-open + CLIP-toggle kickoffs; conditional on-demand CLIP-sort trigger gated by `clipVectorsNeedExtraction`) — MERGED 2026-06-26 via PR #56 (`9d65500`) | 2026-06-25 |
| [2026-06-26-weekly-reviews-first-run.md](2026-06-26-weekly-reviews-first-run.md) | Group WR: Weekly Reviews first run (4 verdicts: pr-review-toolkit `adopt`; test-writer-fixer / TDD Guard / local-model review `defer`) — ⚪ Overhead, no code PR | 2026-06-26 |
| [2026-06-30-tournament-exit-affordances.md](2026-06-30-tournament-exit-affordances.md) | Group T1: Tournament exit affordances (in-tournament exit button + confirm-before-app-close, both reusing `showTournamentLeavePrompt`) | 2026-06-30 |
| [2026-07-01-cw-t-tournament-correctness-hardening.md](2026-07-01-cw-t-tournament-correctness-hardening.md) | Group CW-T: Tournament correctness, persistence & hardening (O(1) inverse-delta undo + `showTournamentPairFast` wrapper-reuse render + `reconcileWithFiles`-on-every-entry closing the live-engine gap + hardened `-1` divergence capture + persistent perf log + 6 debt items) — real-24k smoke PASSED; MERGED 2026-07-03 via PR #59 (`ae9588d`) | 2026-07-02 |
| [2026-07-03-cw-d-docs-claude-md-hygiene.md](2026-07-03-cw-d-docs-claude-md-hygiene.md) | Group CW-D: Docs & CLAUDE.md hygiene (5 deferred `revise-claude-md`/doc-drift items — 3 tournament gotchas + debounced-persistence/`v2` note + MinHeap/VPTree worker-only note into CLAUDE.md; PR2/PR3 per-phase framing into DONE/TODO; manual-only maintenance decision D1) — docs-only; MERGED 2026-07-04 via PR #60 (`dba3ecf`) | 2026-07-03 |
| [2026-07-04-cw-v-test-tooling-backfill.md](2026-07-04-cw-v-test-tooling-backfill.md) | Group CW-V: Test & tooling backfill (comment-aware `methodSource` brace guard + `src` seam; `extractAddedLines` real-git-diff fixtures; sort-progress card E2E; play/pause icon toggle E2E via synthetic events) — test-only; 423 unit / full E2E 52/52; MERGED via PR #61 (`85f1f29`) | 2026-07-05 |
| [2026-07-13-ai-sort-startup-ux.md](2026-07-13-ai-sort-startup-ux.md) | Group G1: AI-sort startup UX & incremental cache-load (phased/cancelable `handleSortByPrediction` + awaitable `runMlSort` with `sortRunId` stale-guard + atomic incremental `loadFeatureCache` (staged-local, commit-on-complete) + binary `Float32Array` transport for `feature-cache-chunk` + unified sort-card progress + warm-cache gate) — PR3 slice of the 🔴 "Speed up AI/similarity sorting" TODO (stays OPEN, PR2 remains); two post-review incidents fixed in-branch (data-loss regression `b8b5636`; 24k-smoke cache-corruption `2777bdf`+`c947081`); 434→471 unit / full E2E 52/52; user-side 24k smoke PASSED 2026-07-20; MERGED via PR #64 (`b6ff4ac`) | 2026-07-20 |

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

*Last Updated: 2026-07-20 (added Group G1 AI-sort startup UX & incremental cache-load plan)*
