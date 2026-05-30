# Planning Restructure — Source-Split Backlog, Weekly Quota, Lossless Migration

**Date**: 2026-05-30
**Author**: brainstorming session with user (alexminak32@gmail.com)
**Status**: Design — awaiting user review before plan generation
**Related**: `docs/planning/BACKLOG.md`, `docs/planning/WEEKLY.md`, `docs/planning/TODO.md`, `CLAUDE.md`
**Reference**: Mirrors the rating_bot project's planning restructure (spec at `C:\Users\alexm\Projects\rule_bots\rating_bot\docs\superpowers\specs\2026-05-30-planning-restructure-design.md`)

---

## Problem

`docs/planning/BACKLOG.md` (~740 lines, 251 checkboxes) is grouped by date-of-arrival and source-event. The freshest entries — which dominate weekly picks — are post-merge PR review follow-ups: PR #38 (2026-05-28), PR #36 (2026-05-25), PR #35 (2026-05-16), PR #34 (2026-05-10), PR #33 (2026-05-05), PR #32 (2026-04-30), and so on, with each PR review batch typically adding 3–6 sub-threshold items. The weekly-planning prompt has no concept of *source*; auto-generated cleanup easily crowds out user-raised feature work.

Concrete pattern: the user added 22+ feature proposals across five manual-testing intake batches (2026-05-30, 2026-05-05, 2026-04-18, 2026-04-08, 2026-03-19) — items covering bulk-rating buttons, position-indicator jump, lossless compression add-on, compare-mode variants, smarter extraction timing, add-on system, platform integrations, rotation buttons, etc. Most remain unscheduled. Meanwhile every PR generates ~3–6 sub-80 post-merge review items that land in BACKLOG.md.

**Root cause:** date-ordered structure + no source concept in the planning prompt. Without rate limits, the auto-generated pile grows faster than it drains, and the weekly plan reflects that growth.

This mirrors the exact pattern that motivated the rating_bot restructure. media_viewer differs in three ways: (1) no deploy pipeline, so genuine ops/monitoring content is rare; (2) BACKLOG.md has trailing thematic sections (`## Feature Ideas`, `## Enhancements`, `## Technical Debt`, `## Research Topics`, `## Spawned Improvements`, `## Rejected Ideas`, `## Promotion Criteria`) that don't exist in rating_bot in the same shape; (3) pre-commit infrastructure is Husky + Vitest (not Python `pre-commit`).

---

## Goal

Restructure planning so:

1. User-flagged feature work gets a guaranteed minimum share of every week (≥50% SP)
2. Auto-generated tech debt accumulates predictably and drains in scheduled cleanup weeks (every ~3 weeks)
3. The priority signal is unambiguous to Claude on every read of BACKLOG.md and on every weekly-planning invocation

## Hard Constraints

- **Nothing live in current BACKLOG.md is lost** during migration (no silent merges; live entries from markdown-table sections are converted to checkbox form, not dropped)
- **Strikethrough/promoted items may be dropped** — their final state is already in DONE.md / TODO.md
- **Rewording is allowed** (tightening language, splitting compound entries) — substance must survive
- All planning output remains in English (per global CLAUDE.md)
- Existing intake-date sub-grouping (`### [YYYY-MM-DD]`) is preserved within new source sections

## Out of Scope

- Changing milestone targets in MILESTONES.md / ROADMAP.md / GOALS.md
- Restructuring TODO.md or DONE.md
- Re-prioritizing individual entries — classification only; priority stays as currently marked
- Automated Quota Check audit script (human judgment lever; see Section 6)
- Retroactive re-planning of in-flight week (stays as-is or re-planned separately under new rules)
- Global `~/.claude/CLAUDE.md` — project-specific change only

---

## Design

The work is split into 6 design sections, each independently revertible.

### Section 1 — BACKLOG.md Restructure

Top-level file structure:

```
# Backlog

[Header — purpose, related files, Last Updated]

## 📌 Process Rules (READ BEFORE PROPOSING WORK)
[pinned rules — quotas, cap, cleanup-week cadence, intake routing]

## 🔵 User-Flagged Ideas
### [YYYY-MM-DD] Manual testing intake (batch N)
- [ ] Entry...

## 🟡 Operational & Observation Items
### [YYYY-MM-DD] <intake event description>
### [periodic] Regression-checker audit
- [ ] Entry...

## 🟤 Auto-Generated Tech Debt
### [YYYY-MM-DD] PR #N post-merge review
- [ ] Entry...

## Rejected Ideas
[verbatim — markdown table, ~5 lines]

## Promotion Criteria
[verbatim — process boilerplate, ~7 lines]
```

**Source definitions** (encoded in the pinned section):

- **🔵 User-Flagged Ideas** — anything the user raised directly: manual-testing intake (2026-05-30, 2026-05-05, 2026-04-18, 2026-04-08, 2026-03-19 batches), feature proposals, UX changes, bug reports. Default home for any user-raised item.
- **🟡 Operational & Observation Items** — periodic maintenance and audit work without a deploy pipeline analogue: regression-checker.md audits, Lucide CDN → bundled migration tracking, electron/Husky/Vitest upgrade watches, CLAUDE.md Git Insights freshness sweeps, recurring `docs/README.md` indexing checks, performance baseline refreshes.
- **🟤 Auto-Generated Tech Debt** — Claude/automation-surfaced: PR post-merge `/code-review` findings (PR #19–#38 entries), code-review-pr-N batches, multi-agent review sub-threshold findings, doc-hygiene cleanups (recurring "pre-archive checklist" pattern), test backfill, archival debt.

**Pinned 📌 Process Rules content** (load-bearing — drives Claude's behavior on every read):

```markdown
## 📌 Process Rules (READ BEFORE PROPOSING WORK)

This file is split into three source sections. Weekly planning MUST respect the quotas
below. The split exists because user-flagged feature work was systematically crowded
out by auto-generated PR-review follow-ups (root cause: BACKLOG was date-ordered,
planning prompt had no source concept).

### Source sections (in priority order for weekly picks)
- 🔵 User-Flagged Ideas — user-raised: manual-testing intake, features, bugs, UX.
- 🟡 Operational & Observation Items — periodic maintenance, audits, dep/version watches.
- 🟤 Auto-Generated Tech Debt — Claude/automation-surfaced: PR post-merge review, doc
  hygiene, test backfill, archival.

### Quotas (hard rules for weekly planning)
- ≥50% of weekly SP from 🔵 User-Flagged
- ≤25% of weekly SP from 🟡 Operational
- ≤1 group per week (batch OR solo) from 🟤 Auto-Generated, AND total auto-generated
  SP ≤25% of weekly SP. PR-review items accumulate; they are NOT spread across the week.
- Cleanup Week cadence: every ~3 weeks (or when 🟤 grows beyond ~20 SP pending), schedule
  a dedicated Cleanup Week that inverts the quota — note in WEEKLY.md header.
- Quota Check subsection mandatory in every WEEKLY.md Notes section.

### Intake rules (when adding NEW entries)
- User mentions it → 🔵 User-Flagged with intake date `### [YYYY-MM-DD]`
- PR post-merge review → 🟤 Auto-Generated under `### [YYYY-MM-DD] PR #N post-merge review`
- Periodic / audit → 🟡 Operational
- If unsure, ask before adding — default-to-🔵 if user-raised, default-to-🟤 if Claude-surfaced.
- One entry per concrete actionable item; do NOT merge entries on intake even if they
  look similar — explicit `[possible-dup-of: ...]` tag instead.

### Cross-references
- Active tasks: TODO.md
- Completed work: DONE.md
- Weekly plan: WEEKLY.md (must include Quota Check)
- Strategic direction: ROADMAP.md, GOALS.md, MILESTONES.md
```

**Quotas + Cleanup Week threshold:** numbers match rating_bot as a starting point (≥50% / ≤25% / ≤25%; ~3-week cadence; ~20 SP threshold). They are **tunable after the first weekly cycle** — calibrate to media_viewer's actual velocity (currently ~25 SP/week per `docs/planning/WEEKLY.md`).

**Intake-date sub-grouping** — within each top-level source section, entries stay grouped by `### [YYYY-MM-DD] <description>` exactly as today. This preserves chronology and makes drained-vs-stale visible.

**Entry format unchanged:** `- [ ] **Short title** — body with context, cross-refs, affected files`.

**Trailing structural blocks** (out of source-split):

- `## Rejected Ideas` — verbatim retention (markdown table; currently `*None yet*`).
- `## Promotion Criteria` — verbatim retention (process boilerplate; "Move items to TODO.md when: …").

### Section 2 — Weekly Planning Prompt Edits

The user's weekly-planning prompt is maintained locally (not in repo). The prompt's current `Task Selection Rules` has no concept of source. Six edits to align with the source-split design:

1. **`Sources` line — pinned-section reference**:
   > BACKLOG.md — candidate tasks. READ THE 📌 PROCESS RULES SECTION AT THE TOP FIRST — it defines source quotas and cap rules that constrain the selection below.

2. **`Sources` line — Cleanup Week awareness**:
   > WEEKLY.md — previous week's results, velocity, unfinished work; also note last Cleanup Week date to determine whether this week is due for one.

3. **`Task Selection Rules` — insert 4 new rules at the top**:
   - Source quota (hard rule): ≥50% of weekly SP MUST come from 🔵 User-Flagged. Carry-forward items count toward origin section. If <50% available, document shortfall in Notes and justify.
   - Auto-generated cap (hard rule): ≤1 group per week (batch OR solo) from 🟤 Auto-Generated, AND total auto-generated SP ≤25% of weekly SP. PR-review items NOT spread across the week.
   - Cleanup-week cadence: Every ~3 weeks (or when 🟤 grows beyond ~20 SP pending), schedule a dedicated Cleanup Week that inverts the quota. Note in header.
   - Operational cap: 🟡 Operational capped at ≤25% of weekly SP. Periodic but doesn't exempt the week from user-flagged quota.

4. **`Task Selection Rules` — revise carry-forward rule**:
   > Include any carry-forward items from the previous week before adding new work. Carry-forward items count against the source quota of their origin section — observational carry-forwards do NOT exempt the week from the ≥50% user-flagged rule.

5. **`Weekly Challenge` — revise**:
   > Add one stretch task marked with 🏆 — by default, pull from the 🔵 User-Flagged section (HIGH PRIORITY or strategic feature). Auto-generated correctness items may be the weekly challenge only in Cleanup Weeks. Briefly explain why you chose it.

6. **`Output Format` — Summary Table adds `Source` column; Notes section adds required `### Quota Check` subsection**:
   ```
   ### Quota Check
   - 🔵 User-Flagged SP: X / Y (Z%) — must be ≥50%
   - 🟡 Operational SP:  X / Y (Z%) — must be ≤25%
   - 🟤 Auto-Generated SP: X / Y (Z%) — must be ≤25% AND ≤1 group (batch or solo)
   - Cleanup Week status: [normal | due | active]
   - Last Cleanup Week: [date or "never"]
   - Compliance: ✅ all quotas met / ⚠️ deviation: [justification]
   ```

**Prompt verification checklist** (user pastes local prompt; assistant verifies alignment):

- [ ] `Sources` line includes "READ THE 📌 PROCESS RULES SECTION AT THE TOP FIRST"
- [ ] `Sources` line mentions Cleanup Week date awareness
- [ ] `Task Selection Rules` opens with 4 source/quota rules (≥50% user, ≤25% ops, ≤1 auto batch, cleanup cadence)
- [ ] Carry-forward rule includes "count against source quota of origin section"
- [ ] `Weekly Challenge` defaults to 🔵 User-Flagged section
- [ ] `Summary Table` includes `Source` column with 🔵/🟡/🟤 markers
- [ ] `Notes` includes mandatory `### Quota Check` subsection
- [ ] Header field includes Cleanup Week status when applicable

### Section 3 — CLAUDE.md Intake Rules Update

Add a new `## Backlog Intake Rules` section to project-root `CLAUDE.md` (~25 lines). Authoritative rules live in BACKLOG.md's 📌 Process Rules section; CLAUDE.md is a cross-reference and behavioral reminder.

**Insertion point:** between `## Code Conventions` and `## Detected Patterns` (working convention, not a code pattern).

Concrete text to add:

```markdown
## Backlog Intake Rules

BACKLOG.md is split into three source sections. Authoritative rules live in
`docs/planning/BACKLOG.md` 📌 Process Rules section — read it first. Summary:

### Where new entries go
- User mentioned it (in conversation, manual testing, idea sharing) → 🔵 User-Flagged
- Claude/automation surfaced it (PR post-merge review, /code-review pass,
  CLAUDE.md staleness, docs/README.md drift, archived-plan checklist) → 🟤 Auto-Generated
- Periodic maintenance, audits, dep/version watches (regression-checker audit, Lucide
  CDN→bundled migration tracking, electron/Husky upgrade watches) → 🟡 Operational
- Unsure → ask before adding; default-to-🔵 if user-raised, default-to-🟤 if Claude-surfaced.

### Intake format
- Group by intake date: `### [YYYY-MM-DD] <event description>`
- One entry per concrete actionable item; never silently merge similar entries on intake —
  tag `[possible-dup-of: <other-entry-title>]` instead
- Required entry shape: `- [ ] **Short title** — body with context, cross-refs,
  affected files`

### Rate limit on 🟤 Auto-Generated
- PR post-merge review follow-ups accumulate in a single `### [YYYY-MM-DD] PR #N
  post-merge review` section per PR — they do NOT spread into the weekly plan unless
  this week is a Cleanup Week (declared in WEEKLY.md header)
- When 🟤 grows beyond ~20 SP of pending items, surface this in the next planning
  conversation as a Cleanup Week trigger
```

Project-specific examples (regression-checker, Lucide CDN, archived-plan checklist) chosen to match real media_viewer patterns documented in CLAUDE.md "Git Insights".

**Failure mode this prevents:** the current pattern where every PR post-merge review session ends with "I added N follow-up items to BACKLOG.md" and those items immediately become candidates for next week's plan. Under the new rule, they go to 🟤 and wait for either a Cleanup Week or the ≤1 auto-batch-per-week slot.

Global `~/.claude/CLAUDE.md` is NOT modified — this restructure is project-specific.

### Section 4 — Migration Plan (Two-Pass, No-Loss)

#### Pass 1 — Classification Table (review gate)

Produce a single artifact at `docs/superpowers/specs/2026-05-30-planning-restructure-classification.md`. Contains a table with one row per existing section in BACKLOG.md, in current file order:

| # | Current header (line range) | Items | Proposed source | Proposed new header | Notes / splits / dups |
|---|---|---|---|---|---|
| 1 | `### [2026-05-30] From: manual testing` (L16–23) | 5 | 🔵 User | `### [2026-05-30] Manual testing intake` | — |
| 2 | `### [2026-05-28] From: PR #38 multi-agent review (post-merge)` (L29–35) | 4 | 🟤 Auto | `### [2026-05-28] PR #38 post-merge review follow-ups (4 sub-threshold items)` | — |
| ... | (one row per existing section, ~78 date-grouped + ~30 Spawned Improvements + live markdown-table entries) | ... | ... | ... | ... |

**Scope of the classification table:**

- Every `### [YYYY-MM-DD]`-style header in the top portion of BACKLOG.md (~78 sections)
- Every `### YYYY-MM-DD From:` header inside `## Spawned Improvements` (~30 sub-sections)
- Live (non-strikethrough) entries inside markdown tables (`## Feature Ideas`, `## Enhancements`, `## Technical Debt`, `## Research Topics`) — each live entry becomes a one-row classification target with a synthesized intake date from the existing "Source" / "Added" column
- `## Rejected Ideas` and `## Promotion Criteria` are **out of scope** — retained verbatim as trailing structural blocks (process content, not work)

**Strikethrough/promoted items dropped:** Items already promoted to TODO.md (~30 strikethrough entries across the markdown tables and Spawned Improvements) are not migrated. Their final state is already recorded in DONE.md / TODO.md.

User reviews the table. Misclassifications, splits, dups flagged via written feedback. Assistant revises the table until user approves. **No file edits during Pass 1.**

#### Pass 2 — Apply the rewrite

After table approval, produce a single rewrite commit:

1. Build new file: pinned 📌 Process Rules at top + 🔵 User section + 🟡 Ops section + 🟤 Auto section, then verbatim `## Rejected Ideas` + `## Promotion Criteria`
2. Move each section's contents wholesale into its assigned bucket — preserve intake-date sub-headers from the table
3. Convert live markdown-table entries to `- [ ] **Title** — body` checkbox form during migration
4. Run no-loss verification (below); embed result in commit message

#### No-loss verification (mechanical, not by sample)

Three checks before committing the rewrite:

1. **Checkbox count parity (with conversion accounting)**: count of `^- \[[ x]\] \*\*` lines in the new file == (live checkbox baseline) + (live markdown-table entries converted) − (strikethrough/promoted dropped).
2. **Bold-title set parity for date-grouped entries**: extract `^- \[[ x]\] \*\*<title>\*\*` from both files into sorted lists; compare. Date-grouped checkbox titles must be set-equal pre/post. Converted markdown-table entries are checked separately (per row of the classification table).
3. **Section round-trip**: every `### [...]` header in the Pass-1 table appears exactly once in the new file under its assigned source bucket.

If any check fails → abort commit, surface diff, fix, retry. Commit message embeds the three counts for auditability.

#### Reword pass (separate commit)

After the structural migration commits cleanly, an optional second commit can do targeted rewording — tightening wording, splitting compound entries, adding `[possible-dup-of: ...]` tags. Each reword:

- Listed in commit message: `old-title → new-title`
- Cannot drop a checkbox (parity check still holds)
- User reviews before commit

Structural changes (commit B) and content changes (commit E) stay separate so either can be reverted independently.

#### Failure recovery

Entire migration is one branch (`feature/planning-restructure`). If user rejects the rewrite at any point, branch is dropped and existing BACKLOG.md is untouched. No half-state risk.

### Section 5 — Sequencing & Tooling

#### Sequence of commits

Pre-implementation (design phase — already done by the time the plan runs):

- **Commit 0**: This spec file (`docs/superpowers/specs/2026-05-30-planning-restructure-design.md`), committed on `main` after the brainstorming session.

Implementation commits (on branch `feature/planning-restructure`):

| Step | Commit | Deliverable | Reviewer gate |
|---|---|---|---|
| 1 | A | Classification table at `docs/superpowers/specs/2026-05-30-planning-restructure-classification.md` | User audits before any file edit |
| 2 | B | `docs/planning/BACKLOG.md` structural rewrite — pinned 📌 + 3 source sections + verbatim trailing structural blocks; no-loss verification embedded in commit message | User spot-checks the diff |
| 3 | C | `CLAUDE.md` (project root) `## Backlog Intake Rules` section added | User spot-checks |
| 4 | D | `tests/backlog-structure.test.js` (Vitest unit test) | User spot-checks |
| 5 | E (optional) | Reword pass (tightening / splits / dup tags) — can defer indefinitely | User spot-checks each rename |
| 6 | — | PR against `main` | Standard review |
| 7 | — | **Prompt verification** (out of repo) — user pastes local prompt; assistant checks against 8-item checklist in Section 2 | Verbal confirmation |
| 8 | — | **First real-world test** — next weekly cycle under new prompt + restructured BACKLOG; verify Quota Check shows ✅ | Compare to old WEEKLY.md |

**Why this order:** classification is load-bearing — once approved, the rest is mechanical. CLAUDE.md update goes before the optional reword pass so the new intake rules apply to any entries adjusted during reword. Vitest test ships before the reword pass so the structural invariants are protected from that point forward.

#### Tooling: Vitest unit test (minimal by design)

`tests/backlog-structure.test.js` — reads `docs/planning/BACKLOG.md`, asserts all 4 required top-level headers are present:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKLOG_PATH = join(__dirname, '..', 'docs', 'planning', 'BACKLOG.md');

const REQUIRED_HEADERS = [
    '## 📌 Process Rules (READ BEFORE PROPOSING WORK)',
    '## 🔵 User-Flagged Ideas',
    '## 🟡 Operational & Observation Items',
    '## 🟤 Auto-Generated Tech Debt',
];

describe('BACKLOG.md structure', () => {
    it('retains all 4 required top-level headers', () => {
        const content = readFileSync(BACKLOG_PATH, 'utf-8');
        const missing = REQUIRED_HEADERS.filter((h) => !content.includes(h));
        expect(missing, `Missing required headers: ${missing.join(', ')}`).toEqual([]);
    });

    it('still has at least one entry in each source section', () => {
        // Heuristic guard against accidental gutting; each source section must
        // contain at least one ### sub-header
        const content = readFileSync(BACKLOG_PATH, 'utf-8');
        for (const header of REQUIRED_HEADERS.slice(1)) {
            const idx = content.indexOf(header);
            const next = content.indexOf('\n## ', idx + 1);
            const slice = content.slice(idx, next === -1 ? undefined : next);
            expect(slice, `${header} appears empty (no ### sub-header)`).toMatch(/^### /m);
        }
    });
});
```

Runs unconditionally via `.husky/pre-commit` (`npx vitest run` on line 2). No Husky / lint-staged config change required. ~30 LoC; mirrors project test patterns (`tests/logger.test.js`, `tests/media-viewer-utils.test.js`).

**No Quota Check audit script.** Considered and rejected: the Quota Check subsection in WEEKLY.md makes violations self-evident; "is this a Cleanup Week" logic gets complicated fast; human judgment is the right lever for "this deviation is justified." Over-engineering for a fundamentally human-judgment problem.

### Section 6 — Success Criteria

Verifiable after the first weekly cycle under the new rules:

- ✅ WEEKLY.md has 🔵 User-Flagged ≥50% SP
- ✅ Quota Check subsection present; shows ✅ Compliance (or written justification)
- ✅ ≤1 group (batch or solo) from 🟤 Auto-Generated AND total auto SP ≤25% of weekly SP
- ✅ At least one 🔵 User-Flagged item from one of the manual-testing intake batches (2026-05-30 / 2026-05-05 / 2026-04-18 / 2026-04-08 / 2026-03-19) is picked into the week (deferred batches start draining)
- ✅ BACKLOG.md checkbox count == expected post-migration count (no losses; accounts for the table→checkbox shape change)
- ✅ Vitest test passes locally and in the pre-commit hook; deliberate header deletion fails the test

If any criterion fails after the first cycle, triage: prompt needs further tightening, quota thresholds need adjustment, or a specific row's source-classification needs revision.

---

## Failure Modes & Mitigations

| Failure mode | Mitigation |
|---|---|
| Mis-classification of an existing section (e.g., a "Group F closeout" item is actually 🔵 user-raised, not 🟤 auto) | Pass 1 classification table is reviewer-gated; corrections happen before any file edit |
| Silent entry loss during rewrite | Three mechanical no-loss checks (checkbox count with conversion accounting, bold-title set parity, section round-trip) embedded in commit message |
| Pinned 📌 section accidentally deleted in a future edit | Vitest test fails the commit |
| Source section accidentally emptied | Second `it()` block in Vitest test catches it (asserts each source section has ≥1 `### ` sub-header) |
| Claude reverts to old habits and produces an imbalanced WEEKLY.md anyway | Quota Check subsection makes the violation self-evident; first-cycle verification catches within 7 days |
| Auto-generated section grows unboundedly even with ≤1 batch/week cap | Cleanup Week trigger at ~20 SP pending forces a drain cycle |
| Reword pass introduces a regression | Reword is a separate commit (E) — revertible without affecting structural commits (A–D) |
| User's local weekly-planning prompt drifts out of sync with this spec | Prompt verification checklist (Section 2) — user pastes prompt; assistant verifies against 8-item checklist |
| Markdown-table entry shape change loses a live item during conversion | Classification table tracks each table-row → checkbox conversion explicitly; baseline includes both forms; row-by-row presence is auditable |

---

## Open Questions (for plan generation phase, not blocking design approval)

- Cleanup Week threshold: 20 SP pending or different for media_viewer? Calibrate after first 2-3 normal weeks of data.
- Periodic items without an explicit intake date (e.g., "Audit remaining CLAUDE.md Git Insights for stale references") — use `### [periodic]` sub-header within 🟡 Ops? Default proposal: yes.
- Ambiguous 🟤 vs 🟡 borderline cases — e.g., "pre-archive checklist to prevent recurring archived-plan drift" is process hygiene (could be 🟡) but was Claude-surfaced during a code review (could be 🟤). Default proposal: 🟤 because the trigger was a code review, not a periodic schedule.

These are answered during plan generation (writing-plans skill), not during this design review.

---

## Deliverables

Pre-implementation (lands on `main` directly):

1. `docs/superpowers/specs/2026-05-30-planning-restructure-design.md` (this file)

Implementation (branch `feature/planning-restructure` → PR against `main`):

2. `docs/superpowers/specs/2026-05-30-planning-restructure-classification.md` (Pass 1 artifact, commit A)
3. `docs/planning/BACKLOG.md` rewritten — pinned 📌 + 3 source sections + verbatim trailing structural blocks (commit B)
4. `CLAUDE.md` with new `## Backlog Intake Rules` section (commit C)
5. `tests/backlog-structure.test.js` Vitest unit test (commit D)
6. (Optional, deferred) Reword commit(s) on individual entries (commit E)

Out-of-repo follow-ups (after PR merge):

7. User's local weekly-planning prompt updated against the 8-item verification checklist in Section 2
8. Next weekly plan executed under the new rules; Quota Check verified.

---

**End of Design**
