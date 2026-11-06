# G5 `CLAUDE.md` Byte-Trigger Re-set - Implementation Plan

**Task Reference**: WEEKLY.md Oct 26–30 § G5 (🟡, 1 SP) ← BACKLOG 🟡 [2026-10-17] "Measure `CLAUDE.md`'s growth under the authoring rule at Cleanup Week #5, and re-set `BYTE_TRIGGER` there"
**Created**: 2026-11-06
**Status**: In Progress
**Last Updated**: 2026-11-06
**Branch**: `g5-claude-md-byte-trigger` (from `main` @ `2e5afc9`; one PR)
**Design**: no spec. A small change; the user skipped the brainstorming questions (2026-11-06), so the choices below are my calls, listed in § 2 for review.

---

## 1. Task Overview

**Goal**: replace the guessed `BYTE_TRIGGER` (69,000) in `scripts/check-claude-md-size.js` with one sized from `CLAUDE.md`'s measured growth under the § Maintenance authoring rule, as the size-audit spec § 6.2 promised.

**Context**: the G5 audit (PR #82, merge `3fb797e`) set 69,000 as the landing plus ~10 KB, on a guessed growth rate. The WEEKLY entry's rule: take the per-commit byte deltas since `3fb797e`, then set the trigger to the size at this measurement plus about one Cleanup-Week cycle of measured growth, rounded up to the next 1,000.

**Success Criteria**:
- [ ] The growth since `3fb797e` is measured per commit and per landing on `main`, and recorded here.
- [ ] `BYTE_TRIGGER` and its comment state the new figure and how it was derived.
- [ ] A live run shows the change takes effect: a staged growth that printed the trigger line under 69,000 no longer does.
- [ ] The audit that the crossed 69,000 trigger now calls for is recorded as a follow-up (§ 6), not silently cancelled by the re-set.

---

## 2. Analysis

### Problem Restatement

The trigger fired before it was re-set. `CLAUDE.md` passed 69,000 on 2026-11-02 (G3's `233a672`) and is 71,287 bytes now. Every commit that grew it since has printed "due for an audit". WEEKLY planned G5 on 2026-10-28, when the file was 66,944 bytes, so the group carries the re-set only, not an audit. The spec meant the re-set to happen at an audit ("re-set the trigger at that audit", § 6.2), and the script's comment says "Change it only at an audit". Re-setting now without a trim raises the bar over a warning that has already fired, so the audit must stay owed explicitly.

### Measurements (2026-11-06, `wc -c`-equivalent UTF-8 bytes of each commit's `CLAUDE.md`)

- **Base**: `3fb797e` (2026-10-17) 58,582 bytes / 216 lines. **Now**: `2e5afc9` 71,287 bytes / 247 lines. **Growth**: +12,705 bytes (+21.7%), +31 lines (+14.4%), in 20 calendar days, about two plan-weeks (Oct 19–23 and Oct 26–30, both spilled).
- **Rate against the week before the audit**: 14.7 KB in one week then (spec § 2.1, old style), ~6.4 KB a plan-week now. The authoring rule slowed growth to a bit under half; it did not stop it.
- **Per commit, against its own parent** (non-merge commits touching `CLAUDE.md`): 41 commits; 37 grew it, 3 shrank it; 9 added more than 500 bytes (the growth warning's threshold), 4 of them review-round answers (`de04008` PR #85 +1,488, `bdfc8e0` G2 PR 1 final review +827, `e3c2fae` PR #87 r1 +900, `1014cf9` PR #95 r1 +1,014). The largest: `233a672` G3 +1,960, `22f0a98` G2 PR 1 +1,908, `7cb1930` G1 I1 +1,334.
- **Per landing on `main`** (first-parent):

  | Landing | Date | Size after | Δ |
  |---|---|---:|---:|
  | PR #84 G1 I1 (`4548269`) | 10-19 | 59,949 | +1,367 |
  | G1 I1 closeout (`c4fcab6`) | 10-19 | 60,077 | +128 |
  | PR #85 G2 PR 1 (`f668611`) | 10-21 | 62,705 | +2,628 |
  | PR #86 feature-cache wipe (`654fb3e`) | 10-22 | 63,549 | +844 |
  | its closeout (`bf5ec84`) | 10-22 | 63,634 | +85 |
  | PR #87 G2 PR 2 (`f5ddfa3`) | 10-25 | 66,578 | +2,944 |
  | PR #89 formatter hook (`7f75013`) | 10-26 | 66,668 | +90 |
  | PR #90 ZoomManager (`082e3b2`) | 10-26 | 66,944 | +276 |
  | PR #93 repo chores (`4894a13`) | 10-30 | 67,227 | +283 |
  | PR #94 pre-push gate (`a80cc37`) | 10-30 | 67,944 | +717 |
  | PR #95 rating safety (`b9c76c0`) | 11-03 | 71,114 | +3,170 |
  | PR #96 reload roles (`59218f3`) | 11-05 | 71,287 | +173 |

  Three feature PRs (#85, #87, #95) carry 8.7 KB of the 12.7 KB.

### Approaches Considered

| Approach | Pros | Cons |
|----------|------|------|
| **A. Re-set by the entry's formula from the size now; record the owed audit as a follow-up** | The approved WEEKLY scope (1 SP). Stops the warning firing on every growing commit, which § 6.2's headroom was sized to avoid. | The file grows to ~85 KB before the trigger fires again (~21k tokens a turn, bytes ÷ 4). Needs the audit kept owed by a record, since the trigger no longer shows it. |
| B. Audit (trim) now, then re-set from the trimmed size | What § 6.2 meant. | The last audit took ~4.5 SP: over 2× G5's 1 SP, a stop-and-ask point. v2 P1a moves these rules into `.claude/rules/` soon (v2 spec § 19 step 4), so a trim now edits the same bullets twice. |
| C. Leave 69,000 until the audit | The trigger keeps saying the truth. | Not the task. Every growing commit warns for a cycle, which teaches the reader to ignore the warning. |

### Selected Approach

**A**, with the audit carried as a 🟡 follow-up for the next Cleanup Week or v2 P1a's rule move, whichever comes first (§ 6). My call, since the user skipped the questions.

**Cycle basis (my call)**: the BACKLOG cadence is "every ~3 weeks", and the window is calendar-dated, so a cycle is 21 days. 12,705 bytes ÷ 20 days × 21 = 13,340 bytes; 71,287 + 13,340 = 84,627, rounded up to **85,000**. Counting three plan-weeks instead (12,705 ÷ 2 × 3 = 19,058) gives 91,000; the lower figure keeps the backstop tighter while an audit is owed.

### Assumptions

- The 20-day window's rate holds for the next cycle. P1a moves rules out of `CLAUDE.md`, so the real rate may well be lower; the trigger is then a backstop, and the scheduled audit does not depend on it.
- No other branch changes `CLAUDE.md` before this one merges (G6 has not started); if one does, the figure is re-measured before the merge.

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| The file is already past the old trigger | The re-set moves the bar over it; the audit stays owed in § 6 and goes to BACKLOG at closeout. |
| A commit grows `CLAUDE.md` while it sits between 71,287 and 85,000 | Only the 500-byte growth warning can fire; the trigger line does not. The live run checks this. |
| `tests/check-claude-md-size.test.js` checks the constant's shape | It asserts `> 0` and a multiple of 1,000; 85,000 satisfies both. The other tests pass their limits in, so they do not depend on the figure. |
| This PR changes `CLAUDE.md` | It does not: the figure lives only in the script (§ Maintenance names the script as its owner). |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The re-set reads as silencing a fired warning | Med | The comment says so plainly, and the audit is a § 6 follow-up with a slot. |
| The file runs to ~85 KB before the next audit | Med | The audit is due at the next Cleanup Week whatever the trigger says; P1a's rule move shrinks the file. |

---

## 3. Implementation Plan

### Files Affected

| File | Action | Purpose |
|------|--------|---------|
| `scripts/check-claude-md-size.js` | Modify | `BYTE_TRIGGER` 69000 → 85000, and its comment |
| `docs/planning/plans/2026-11-06_g5-claude-md-byte-trigger.md` | Create | This plan |
| `docs/planning/plans/README.md` | Modify | The Current Plans row |

**Live-surface preflight:** the figure 69,000 appears, outside `docs/archive/`, in the script (live, changed here), the BACKLOG entry this closes (checked off at closeout), and dated records: DONE.md, WEEKLY.md, `docs/README.md`'s spec row, the size-audit spec, the 2026-10-17 Weekly Reviews run, the G2 pre-push spec (§ "measured 2026-10-30") and the v2 modules spec (§ 19 step 4, "66,578 bytes at `308d43c`, 2.4 KB below its 69,000-byte trigger, so v2's rules cannot land there"). The records are dated measurements and stay. `CLAUDE.md` § Maintenance states no figure, by design. The v2 line's conclusion now rests on the owed audit rather than on the trigger (§ 6).

### Dependencies

- None. `npm ci` ran in the worktree so the hooks run.

### Model and Effort

| | Choice | Why |
|---|---|---|
| SP | 1 → 1 | Measurement, a constant and its comment, a live run, this plan. |
| Execution | Sonnet · `medium` per WEEKLY; ran on Opus 5.5 | The session started on Opus. Switching would rebuild the cache for a change this small, so it stays. |
| Switch | none | — |
| Final review | light (`medium`), separate chat | The diff is one constant and a comment. |

### Implementation Steps

1. [x] Measure per-commit and per-landing deltas since `3fb797e` (§ 2).
2. [x] Positive control: a staged +600-byte `CLAUDE.md` growth prints the growth line and the trigger line under 69,000.
3. [x] Set `BYTE_TRIGGER` to 85,000 and rewrite its comment.
4. [x] The same staged growth prints the growth line only; restore the index and working tree, and check that `git diff --cached` names nothing.
5. [x] `npm test`, ESLint and `npx prettier --check` on the script.
6. [x] Commit through the hooks; stop for the user's approval to push (WORKFLOW § 3.4).
7. [ ] After approval: push, PR, review in a separate chat, merge, closeout. Push and PR done: PR #98.

---

## 4. Implementation Log

### 2026-11-06 07:36 — PHASE: Planning
- Goal understood: re-set the trigger from measured growth.
- Discovery: the trigger had already fired (2026-11-02), so the re-set is not at an audit as § 6.2 assumed. The user skipped the questions; approach A chosen, with the audit kept as a follow-up.

### 2026-11-06 07:38 — PHASE: Implementation
- Steps 2–5 done; no deviation. The comment now says the re-measure was not an audit and the audit is still owed, so the old rule "change it only at an audit" keeps its meaning instead of being quietly broken.
- The probe was a 600-byte HTML comment appended to the worktree's `CLAUDE.md` and staged; afterwards `git restore --staged` and `git restore` put both back (index empty, 71,287 bytes).
- Committed `085a94d` through the hooks (Vitest 2,636 passed, 1 skipped).

### 2026-11-06 — PHASE: Review
- The user approved the push. The ratchet passed (`media-viewer.js` 11,597 lines, at its ceiling) and the E2E gate skipped. PR #98 opened, not a draft. Review: light (`medium`), in a separate chat.

---

## 5. Key Discoveries

<!-- Filled at completion -->

---

## 6. Future Improvements

### Enhancement Ideas

| Idea | Rationale | Effort | Priority |
|------|-----------|--------|----------|
| **Audit `CLAUDE.md`: the 69,000 trigger was crossed on 2026-11-02 (`233a672`)** — 🟡, at the next Cleanup Week (#6) or folded into v2 P1a's move of rules into `.claude/rules/`, whichever comes first; re-set `BYTE_TRIGGER` there from the size after the trim, with the rate in § 2 | § Maintenance makes a crossed trigger an audit; this re-set moved the bar without one. Doing it inside P1a avoids trimming bullets P1a is about to move. | M (~2–3 SP) | H |
| **The v2 spec's reason for path-scoped rules cites the 69,000 trigger** (§ 19 step 4) — 🟤; its conclusion now rests on the owed audit, not on 2.4 KB of room. A one-line note at P1a's planning, not an edit to the approved spec now | A reader of P1a's plan may read 85,000 as room for v2's rules in `CLAUDE.md`. | L | L |

### Technical Debt

None found.

### Performance Optimizations

None found.

### Spawned Tasks

None: the global ~200-line audit trigger is already a TODO § Spawned Tasks row.

---

## 7. Testing

### Test Plan
- [x] Unit: `tests/check-claude-md-size.test.js` (the constant's shape) and the full `npm test`.
- [x] Live: steps 2 and 4, a positive control and the same run after the change.

### Test Results

| Test | Result | Notes |
|------|--------|-------|
| Live, before (69,000) | Pass | Staged +599 bytes → 71,886: both lines, "more than 500 bytes" and "past its 69000-byte audit trigger"; exit 0 |
| Live, after (85,000) | Pass | The same staged growth: the 500-byte line only; exit 0 |
| Boundary, `evaluate` with the exported limits | Pass | 85,000 → 85,001 gives `["trigger"]`; 84,999 → 85,000 gives `[]` |
| `npx vitest run` | Pass | 56 files; 2,636 passed, 1 skipped |
| ESLint, Prettier `--check` on the script | Pass | — |
