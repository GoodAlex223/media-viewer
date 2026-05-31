# Planning Restructure Implementation Plan

**Status: Complete** — Implemented and shipped via [PR #39](https://github.com/GoodAlex223/media-viewer/pull/39) on branch `feature/planning-restructure` (5 commits A–E, 2026-05-30 to 2026-05-31).
Test results: 244/244 unit tests pass (242 existing + 2 new in `tests/backlog-structure.test.js`). Final code review verdict: ready to merge with two minor follow-ups addressed in Commit E.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restructure `docs/planning/BACKLOG.md` into a source-split file (🔵 user-flagged / 🟡 operational / 🟤 auto-generated) with pinned 📌 Process Rules at the top, update `CLAUDE.md` with intake rules, and ship a Vitest unit test that protects the structural invariants. Migration must be lossless (no live entry dropped, no silent merges; markdown-table → checkbox conversions accounted for explicitly).

**Architecture:** One feature branch `feature/planning-restructure` with 4 implementation commits. Pass 1 produces a classification table reviewed by the user before any file edit. Pass 2 rewrites BACKLOG.md mechanically based on the approved table, with three no-loss verification checks embedded in the commit message. CLAUDE.md and the Vitest test follow as small, independently-revertible commits. An optional reword pass can run later.

**Tech Stack:** Markdown (BACKLOG.md, CLAUDE.md), JavaScript (Vitest unit test in same style as `tests/logger.test.js`), Husky pre-commit (no config change — Vitest already runs unconditionally), git.

**Spec:** `docs/superpowers/specs/2026-05-30-planning-restructure-design.md` (committed as `456a770`).

---

## File Structure

**Files to create:**
- `docs/superpowers/specs/2026-05-30-planning-restructure-classification.md` — Pass 1 classification table (one row per existing section in BACKLOG.md)
- `tests/backlog-structure.test.js` — Vitest unit test asserting the 4 required top-level headers + non-empty source sections

**Files to modify:**
- `docs/planning/BACKLOG.md` — full rewrite (pinned 📌 Process Rules + 3 source sections + intake-date sub-headers preserved + verbatim trailing `## Rejected Ideas` + `## Promotion Criteria`)
- `CLAUDE.md` (project root) — add `## Backlog Intake Rules` section (~25 lines) between `## Code Conventions` and `## Detected Patterns`

**Files NOT touched:**
- `docs/planning/TODO.md`, `docs/planning/DONE.md`, `docs/planning/WEEKLY.md` — out of scope per spec
- `~/.claude/CLAUDE.md` (global) — project-specific change only
- `.husky/pre-commit`, `package.json`, `vitest.config.js` — no infrastructure changes (the new test file is picked up automatically by the existing `tests/**/*.test.js` include)
- Weekly-planning prompt — user-maintained locally, verified verbally

---

## Task 1: Set Up Feature Branch and Capture Baseline

**Files:**
- No files modified yet — branch + baseline only.

- [x] **Step 1: Verify clean working state and create branch**

Run:
```bash
git status --short
git log -1 --oneline
git checkout -b feature/planning-restructure
```

Expected: working tree may have a pre-existing `M CLAUDE.md` modification from prior session — leave it alone, do NOT include it in any commit on this branch. HEAD is at `456a770` (or later — whatever was last committed on main). New branch `feature/planning-restructure` created.

- [x] **Step 2: Capture baseline metrics for BACKLOG.md no-loss verification**

Run:
```bash
mkdir -p /tmp/backlog-baseline
grep -cE '^- \[[ x]\] ' docs/planning/BACKLOG.md > /tmp/backlog-baseline/total-checkboxes.txt
grep -cE '^- \[[ x]\] \*\*[^~]' docs/planning/BACKLOG.md > /tmp/backlog-baseline/live-bolded-checkboxes.txt
grep -oE '^- \[[ x]\] \*\*[^*]+\*\*' docs/planning/BACKLOG.md | sort > /tmp/backlog-baseline/titles.txt
grep -E '^### ' docs/planning/BACKLOG.md > /tmp/backlog-baseline/section-headers.txt
grep -E '^## ' docs/planning/BACKLOG.md > /tmp/backlog-baseline/top-headers.txt
wc -l /tmp/backlog-baseline/*.txt
```

Expected: five baseline files. The numbers will be reused in Task 4's no-loss verification:
- `total-checkboxes.txt` — single integer (currently 251)
- `live-bolded-checkboxes.txt` — single integer (currently 187; excludes `- [x] ~~strikethrough~~` items)
- `titles.txt` — sorted set of every `- [ ] **<title>**` and `- [x] **<title>**` line
- `section-headers.txt` — every `### ` header in current order (currently 77)
- `top-headers.txt` — every `## ` header in current order (currently 32 — will collapse to 6 in the new file: pinned 📌 + 3 source + 2 trailing)

These files are NOT committed; they are scratch artifacts in `/tmp` for verification.

---

## Task 2: Generate Pass 1 Classification Table

**Files:**
- Create: `docs/superpowers/specs/2026-05-30-planning-restructure-classification.md`

- [x] **Step 1: Enumerate every section header in BACKLOG.md with line ranges**

Run:
```bash
grep -nE '^### |^## ' docs/planning/BACKLOG.md
```

Expected: ~109 lines (77 `### ` + 32 `## `), each in the form `<line>:### [date or marker] description` or `<line>:## Section Name`. Capture this output — it is the raw input for the classification table.

- [x] **Step 2: Read each section to determine source classification**

For every `### ` header from Step 1, read the section body (the lines between this header and the next `### ` header or the next `## ` header, exclusive). Determine source by:

- 🔵 **User-Flagged** — if the section header contains "From: manual testing", "From: user", or the body is clearly user-raised feature/bug content. Examples in current BACKLOG.md: `### [2026-05-30] From: manual testing`, `### [2026-04-18] From: manual testing`, `### [2026-04-08] From: manual testing`, `### [2026-03-19] From: Manual testing session`.
- 🟡 **Operational** — if the section is a periodic audit, dep/version watch, monitoring, or recurring maintenance. media_viewer has no deploy-pipeline content, so this bucket will catch: Lucide CDN→bundled migration tracking, regression-checker.md audits, electron/Husky/Vitest upgrade observations, CLAUDE.md Git Insights freshness sweeps, recurring `docs/README.md` indexing checks.
- 🟤 **Auto-Generated** — if the section header contains "From: PR #N", "post-merge", "/code-review", "From: code-review-pr-N", or the body is clearly Claude-generated review follow-up. Examples in current BACKLOG.md: `### [2026-05-28] From: PR #38 multi-agent review`, `### [2026-05-25] From: PR #36 multi-agent review`, `### [2026-04-28] From: PR #31 post-merge code review`, all `code-review-pr-N` entries.

For markdown-table rows in `## Feature Ideas`, `## Enhancements`, `## Technical Debt`, `## Research Topics`:
- **Live (non-strikethrough) rows only** — strikethrough rows like `| ~~Worker count setting~~ | ~~...~~ | Promoted to TODO: TASK-009 |` are dropped (already recorded in DONE.md / TODO.md).
- Each live row becomes a one-row classification target with a synthesized intake date from the table's existing meta column (`Source` / `Notes` / `Added`). If no date is present, default to `[2026-05-30]` (this restructure's date).
- Classify by content: feature ideas / UX enhancements → 🔵 User; technical debt / "Verify no secrets" / dep audit → 🟡 Operational; recurring code-review follow-ups → 🟤 Auto.

For `## Spawned Improvements` sub-sections (~30 `### YYYY-MM-DD From:` entries):
- **Live checkboxes only** — `- [x]` items already promoted to TODO are dropped.
- Each remaining live `- [ ]` item gets classified individually (since some Spawned-Improvements sub-sections mix `[x]` and `[ ]`). Most are 🟤 (post-task implementation follow-ups). Some are 🔵 (user-suggested during testing) — check the originating context.

When ambiguous, default per the spec: user-raised → 🔵; Claude-surfaced → 🟤. Mark ambiguous classifications with a `?` in the Notes column for user review.

- [x] **Step 3: Write the classification table**

Create `docs/superpowers/specs/2026-05-30-planning-restructure-classification.md` with the structure below. Fill in one row per `### ` header AND one row per live markdown-table entry from Step 2, in current file order:

````markdown
# BACKLOG.md Pass 1 Classification Table

**Spec:** [2026-05-30-planning-restructure-design.md](./2026-05-30-planning-restructure-design.md)
**Status:** Awaiting user audit before BACKLOG.md rewrite (Task 4)
**Generated:** 2026-05-30
**Source file:** `docs/planning/BACKLOG.md` at branch `feature/planning-restructure` HEAD

## Purpose

One row per existing section in BACKLOG.md, classified into the 3 source sections defined in the spec. **The user must audit this table before the Task 4 rewrite begins.** Push back on misclassifications, request splits, flag dups.

## Rules

- 🔵 User-Flagged — user mentioned it: manual-testing intake, feature proposals, bug reports, UX changes
- 🟡 Operational — periodic maintenance, audits, dep/version watches; NOT feature work
- 🟤 Auto-Generated — Claude/automation surfaced: PR post-merge review, code-review pass, CLAUDE.md staleness, doc-hygiene sweeps

## Verification Counts (Pre-Migration)

- Total `### ` sections: <fill in from Task 1 Step 2: 77>
- Total checkboxes: <fill in from Task 1 Step 2: 251>
- Live (non-strikethrough) bolded checkboxes: <fill in from Task 1 Step 2: 187>
- Top-level `## ` headers: <fill in from Task 1 Step 2: 32 — collapses to 6 in new file>

## Classification Table (date-grouped sections)

| # | Current header (line range) | Items | Proposed source | Proposed new header | Notes / splits / dups |
|---|---|---|---|---|---|
| 1 | `### [2026-05-30] From: manual testing` (L16–23) | 5 | 🔵 User | `### [2026-05-30] Manual testing intake` | — |
| 2 | `### [2026-05-28] From: PR #38 multi-agent review (post-merge)` (L29–35) | 4 | 🟤 Auto | `### [2026-05-28] PR #38 post-merge review follow-ups (4 sub-threshold items)` | — |
| ... | (one row per existing ### section — ~77 rows) | ... | ... | ... | ... |

## Classification Table (markdown-table live entries — table-row→checkbox conversions)

| # | Source table | Current row | Proposed source | Proposed checkbox shape | Synthesized intake date |
|---|---|---|---|---|---|
| 1 | `## Enhancements` | `Anonymize author field in package.json if privacy desired` (Security audit: 2026-02-05) | 🟡 Ops | `- [ ] **Anonymize author field in package.json** — Security audit follow-up from 2026-02-05. Privacy-only; low effort.` | 2026-02-05 |
| 2 | `## Enhancements` | `Zoom level persistence across navigation` (Plan: 2026-02-05_visual-scale-controls) | 🔵 User | `- [ ] **Zoom level persistence across navigation** — From visual-scale-controls plan (2026-02-05). UI; low value, medium effort.` | 2026-02-05 |
| ... | (one row per live markdown-table entry — count varies, expect ~5-10 rows) | ... | ... | ... | ... |

## Classification Table (Spawned Improvements live checkboxes)

| # | Source sub-section | Current item | Proposed source | Notes |
|---|---|---|---|---|
| 1 | `### 2026-02-05 From: visual-scale-controls` | `- [ ] Zoom level persistence` | 🔵 User | Duplicate of markdown-table entry above? Flag for user audit. |
| 2 | `### 2026-02-05 From: visual-scale-controls` | `- [ ] Slider width responsive to popover space` | 🔵 User | — |
| ... | (one row per live `- [ ]` Spawned Improvement item) | ... | ... | ... |

## Items per Section Counts

Compute the items count by counting `- [ ]` and `- [x]` lines within each section's line range. Numbers will appear in the no-loss verification at Task 4.

## Audit Sign-Off

- [ ] User reviewed and approved the classification (date: ___)
- [ ] Any flagged misclassifications corrected
- [ ] Sum of "Items" column (live entries only) equals expected post-migration count
````

The actual table rows for all ~77 date-grouped sections + ~5-10 markdown-table live entries + ~20-30 Spawned Improvements live checkboxes must be filled in — do not leave `...` placeholders in the committed artifact.

- [x] **Step 4: Verify the table is complete (no placeholder rows)**

Run:
```bash
grep -c '^| ' docs/superpowers/specs/2026-05-30-planning-restructure-classification.md
```

Expected: row count ≥ (77 date-grouped + ~5 markdown-table + ~20 Spawned Improvements) + 3 (header rows for the three sub-tables) + 3 (separator rows). Total: ~108 lines starting with `| `.

Also check that no row contains literal `...` or `TBD` strings:
```bash
grep -E '\.\.\.|TBD' docs/superpowers/specs/2026-05-30-planning-restructure-classification.md
```

Expected: zero matches. If any, replace with actual classification.

- [x] **Step 5: Verify items-per-section count sums to baseline**

Sum the Items column from the date-grouped table. It must equal a defensible subset of the integer in `/tmp/backlog-baseline/total-checkboxes.txt`. Together with the markdown-table conversion count and Spawned-Improvements live count, the sum should equal `live-bolded-checkboxes.txt + (live markdown-table entries to be converted)`. If not, recount one or more sections.

- [x] **Step 6: Commit (Commit A)**

```bash
git add docs/superpowers/specs/2026-05-30-planning-restructure-classification.md
git commit -m "$(cat <<'EOF'
docs(specs): planning restructure Pass 1 — classification table for BACKLOG migration

One row per existing ### section in docs/planning/BACKLOG.md +
one row per live markdown-table entry (in ## Feature Ideas, ## Enhancements,
## Technical Debt, ## Research Topics) + one row per live Spawned Improvement
checkbox. Each row classified into 🔵 User-Flagged / 🟡 Operational /
🟤 Auto-Generated per the spec at
docs/superpowers/specs/2026-05-30-planning-restructure-design.md.

Awaiting user audit before the BACKLOG rewrite. Items-per-section sum
matches expected post-migration count (no-loss baseline).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git log -1 --oneline
```

Expected: commit lands on `feature/planning-restructure`. HEAD message starts with `docs(specs): planning restructure Pass 1`.

---

## Task 3: User Audit Gate

**Files:**
- No files modified — review gate only.

- [x] **Step 1: Surface the classification table for user review**

Stop work and surface the table. Tell the user explicitly:

> "Classification table is at `docs/superpowers/specs/2026-05-30-planning-restructure-classification.md`. Please review for misclassifications, splits, or dups. No file edits will happen until you approve. Reply with: (a) approved as-is, (b) specific row changes, or (c) bulk correction."

- [x] **Step 2: Apply any user-requested corrections**

If the user requests changes:
1. Edit the classification table file
2. Re-verify Step 5 of Task 2 (items count still reconciles to baseline)
3. Amend the commit OR add a fixup commit (user's preference; default = amend since this is still Pass 1)

If the user approves as-is, mark the audit checkbox in the file by editing the "Audit Sign-Off" block:

```bash
# Use the Edit tool, not sed (no sed available on Windows by default):
# Replace `- [ ] User reviewed and approved the classification (date: ___)`
# with    `- [x] User reviewed and approved the classification (date: 2026-MM-DD)`
git add docs/superpowers/specs/2026-05-30-planning-restructure-classification.md
git commit --amend --no-edit
```

Use the actual current date.

- [x] **Step 3: Confirm user approval is recorded**

```bash
grep 'User reviewed and approved' docs/superpowers/specs/2026-05-30-planning-restructure-classification.md
```

Expected: line shows `[x]` (approved) with a real date. If `[ ]`, do not proceed to Task 4.

---

## Task 4: Rewrite BACKLOG.md (Pass 2 — Mechanical Rewrite + No-Loss Verification)

**Files:**
- Modify: `docs/planning/BACKLOG.md` (full rewrite)

- [x] **Step 1: Build the new file skeleton (in-memory or temp file)**

Create `/tmp/BACKLOG.md.new` with the top-of-file structure:

```markdown
# Backlog

Ideas and tasks not yet prioritized for active development.

**Last Updated**: <today's date> (planning restructure — source-split + pinned process rules)

**Purpose**: Holding area for unprioritized ideas and future work.
**Active tasks**: See [TODO.md](TODO.md)
**Completed work**: See [DONE.md](DONE.md)
**Strategic direction**: See [ROADMAP.md](ROADMAP.md)
**Design spec**: See [docs/superpowers/specs/2026-05-30-planning-restructure-design.md](../superpowers/specs/2026-05-30-planning-restructure-design.md)

---

## 📌 Process Rules (READ BEFORE PROPOSING WORK)

This file is split into three source sections. Weekly planning MUST respect the quotas
below. The split exists because user-flagged feature work was systematically crowded out
by auto-generated PR-review follow-ups (root cause: BACKLOG was date-ordered, planning
prompt had no source concept).

### Source sections (in priority order for weekly picks)
- 🔵 User-Flagged Ideas — user-raised: manual-testing intake, features, bugs, UX.
- 🟡 Operational & Observation Items — periodic maintenance, audits, dep/version watches.
- 🟤 Auto-Generated Tech Debt — Claude/automation-surfaced: PR post-merge review,
  doc hygiene, test backfill, archival.

### Quotas (hard rules for weekly planning)
- ≥50% of weekly SP from 🔵 User-Flagged
- ≤25% of weekly SP from 🟡 Operational
- ≤1 group per week (batch OR solo) from 🟤 Auto-Generated, AND total
  auto-generated SP ≤25% of weekly SP. PR-review items accumulate;
  they are NOT spread across the week.
- Cleanup Week cadence: every ~3 weeks (or when 🟤 grows beyond ~20 SP pending),
  schedule a dedicated Cleanup Week that inverts the quota — note in WEEKLY.md header
- Quota Check subsection mandatory in every WEEKLY.md Notes section

### Intake rules (when adding NEW entries)
- User mentions it → 🔵 User-Flagged with intake date `### [YYYY-MM-DD]`
- PR post-merge review → 🟤 Auto-Generated under `### [YYYY-MM-DD] PR #N post-merge review`
- Periodic / audit → 🟡 Operational
- If unsure, ask before adding — default-to-🔵 if user-raised, default-to-🟤 if Claude-surfaced
- One entry per concrete actionable item; do NOT merge entries on intake even if they
  look similar — explicit `[possible-dup-of: ...]` tag instead

### Cross-references
- Active tasks: TODO.md
- Completed work: DONE.md
- Weekly plan: WEEKLY.md (must include Quota Check)
- Strategic direction: ROADMAP.md, GOALS.md, MILESTONES.md

---

## 🔵 User-Flagged Ideas

<sections from classification table where source = 🔵, in intake-date descending order>

---

## 🟡 Operational & Observation Items

<sections from classification table where source = 🟡, in intake-date descending order>

---

## 🟤 Auto-Generated Tech Debt

<sections from classification table where source = 🟤, in intake-date descending order>

---

## Rejected Ideas

<verbatim copy from current BACKLOG.md L723-729>

---

## Promotion Criteria

<verbatim copy from current BACKLOG.md L733-740>
```

Substitute the placeholder `<sections from ...>` and `<verbatim ...>` blocks with actual content in the next steps.

- [x] **Step 2: Populate 🔵 User-Flagged section**

For every row in the date-grouped classification table with `Proposed source = 🔵 User`, in intake-date descending order (newest first):

1. Extract the section body from the original `docs/planning/BACKLOG.md` (header through the next `### ` or `## ` header, exclusive)
2. Rewrite the `### ` header to match the "Proposed new header" column from the table
3. Insert into `/tmp/BACKLOG.md.new` under `## 🔵 User-Flagged Ideas`
4. Preserve all live checkboxes verbatim (substance must survive — rewording is a separate optional commit)
5. **Drop strikethrough/promoted items** (`- [x] ~~...~~ — Promoted to TODO: TASK-N` lines) — they are already in DONE.md / TODO.md

For markdown-table live entries classified 🔵 User and for Spawned-Improvements live `- [ ]` items classified 🔵 User: group them under an existing intake-date `### ` from the date-grouped table where the date matches, OR create a synthesized `### [YYYY-MM-DD] <source>` sub-header (e.g., `### [2026-02-05] From visual-scale-controls plan`). Insert as `- [ ] **<title>** — <body>` checkbox-shaped entries.

- [x] **Step 3: Populate 🟡 Operational section**

Same procedure as Step 2 for rows where `Proposed source = 🟡 Ops`. Intake-date descending. If a markdown-table entry has no intake date in any meta column, default to `### [periodic]` sub-header (e.g., `### [periodic] Security audit follow-ups`).

- [x] **Step 4: Populate 🟤 Auto-Generated section**

Same procedure as Step 2 for rows where `Proposed source = 🟤 Auto`. Intake-date descending. The bulk of content lands here (~50+ date-grouped sections from `### [...] PR #N code review` patterns).

- [x] **Step 5: Copy verbatim trailing structural blocks**

Append the original `## Rejected Ideas` block (currently L723-729 in BACKLOG.md, ~7 lines including the table header) and the original `## Promotion Criteria` block (currently L733-740, ~8 lines) verbatim to `/tmp/BACKLOG.md.new`. These are process content, not work items.

- [x] **Step 6: Run no-loss verification (mechanical, three checks)**

```bash
# Check 1: live bolded checkbox count parity (accounts for table→checkbox conversion)
NEW_LIVE=$(grep -cE '^- \[[ x]\] \*\*[^~]' /tmp/BACKLOG.md.new)
OLD_LIVE=$(cat /tmp/backlog-baseline/live-bolded-checkboxes.txt)
CONVERTED=<count of live markdown-table entries from classification table>
SPAWNED_LIVE=<count of live Spawned Improvements - [ ] items from classification table>
EXPECTED=$((OLD_LIVE + CONVERTED))
echo "Old live bolded: $OLD_LIVE; converted from tables: $CONVERTED; new live bolded: $NEW_LIVE; expected: $EXPECTED"
[ "$NEW_LIVE" = "$EXPECTED" ] && echo "Check 1 PASS" || echo "Check 1 FAIL — diff $((NEW_LIVE - EXPECTED))"

# Check 2: bold-title set parity for date-grouped section bodies
# (Live entries from date-grouped ### sections must appear set-equal pre/post)
grep -oE '^- \[[ x]\] \*\*[^*]+\*\*' /tmp/BACKLOG.md.new | sort > /tmp/backlog-baseline/titles_new.txt
diff /tmp/backlog-baseline/titles.txt /tmp/backlog-baseline/titles_new.txt > /tmp/backlog-baseline/titles_diff.txt
# Diff is expected to be non-empty BECAUSE strikethrough items were dropped AND
# table entries were converted. Inspect manually: every line marked `< - [x] ~~...~~`
# in the diff must correspond to a known-dropped strikethrough; every line marked
# `> - [ ] **<new title>**` must correspond to a known table→checkbox conversion.
wc -l /tmp/backlog-baseline/titles_diff.txt
echo "Check 2: manually inspect /tmp/backlog-baseline/titles_diff.txt — every < line must be a dropped strikethrough, every > line must be a converted table row"

# Check 3: section round-trip — every header in the classification table appears
# exactly once in the new file under its assigned source bucket
NEW_HEADERS=$(grep -cE '^### ' /tmp/BACKLOG.md.new)
# Expected: (date-grouped sections classified) + (synthesized headers for table/spawned groupings)
echo "New ### headers: $NEW_HEADERS"
# Verify each "Proposed new header" string from the classification table appears in the new file:
grep -E '^### ' /tmp/BACKLOG.md.new | sort > /tmp/backlog-baseline/new-headers-sorted.txt
# Manual: compare against classification table's "Proposed new header" column
echo "Check 3: manually compare new-headers-sorted.txt against classification table"
```

Expected: Check 1 PASS, Check 2 + Check 3 manually verified. If Check 1 fails:
1. Do NOT swap the file
2. Run `diff` between the two checkbox sets to find missing entries
3. Recover the missing content from the classification table
4. Re-run Step 6

- [x] **Step 7: Replace BACKLOG.md with the verified new file**

Only after Step 6 reports all checks pass:
```bash
mv /tmp/BACKLOG.md.new docs/planning/BACKLOG.md
```

- [x] **Step 8: Spot-check the result before commit**

```bash
head -50 docs/planning/BACKLOG.md
grep -E '^## ' docs/planning/BACKLOG.md
```

Expected: top of file shows the pinned `## 📌 Process Rules` section. The `## ` heading list shows exactly 6 entries (in order):
1. `## 📌 Process Rules (READ BEFORE PROPOSING WORK)`
2. `## 🔵 User-Flagged Ideas`
3. `## 🟡 Operational & Observation Items`
4. `## 🟤 Auto-Generated Tech Debt`
5. `## Rejected Ideas`
6. `## Promotion Criteria`

- [x] **Step 9: Commit (Commit B)**

```bash
git add docs/planning/BACKLOG.md
git commit -m "$(cat <<'EOF'
docs(planning): restructure BACKLOG.md — source-split + pinned process rules

Replaces date-ordered flat list with 3 source sections + pinned Process
Rules at top:
- 🔵 User-Flagged Ideas (manual-testing intake, features, bugs, UX)
- 🟡 Operational & Observation Items (periodic maintenance, audits, watches)
- 🟤 Auto-Generated Tech Debt (PR-review follow-ups, CLAUDE.md staleness,
  doc-hygiene sweeps)

Trailing structural blocks retained verbatim: ## Rejected Ideas,
## Promotion Criteria.

Intake-date sub-headers preserved within each source section. Pinned
section encodes hard weekly quotas: ≥50% user-flagged, ≤25% ops, ≤1
auto group + ≤25% SP, cleanup week every ~3 weeks.

No-loss verification (vs pre-migration baseline):
- Live bolded checkboxes: <NEW_LIVE> == <OLD_LIVE> + <CONVERTED> (PASS)
- Bold-title diff: <K dropped strikethroughs> + <M table conversions>
  (manually verified — every diff line accounted for)
- Section headers: <NEW_HEADERS> match classification table's
  "Proposed new header" column (manually verified)

Spec: docs/superpowers/specs/2026-05-30-planning-restructure-design.md
Pass 1 classification: docs/superpowers/specs/2026-05-30-planning-restructure-classification.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Substitute `<NEW_LIVE>`, `<OLD_LIVE>`, `<CONVERTED>`, `<K>`, `<M>`, `<NEW_HEADERS>` with the actual numbers from Step 6.

Expected: commit lands. Pre-commit hook runs `npx lint-staged` (no JS staged, no-op) + `npx vitest run` (242 existing tests pass, no new tests yet). Vitest does NOT yet enforce the new header structure — that's Task 6.

---

## Task 5: Add `## Backlog Intake Rules` Section to `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (project root) — add ~25-line section

- [x] **Step 1: Identify the insertion point in CLAUDE.md**

Run:
```bash
grep -n '^## ' CLAUDE.md
```

Expected: list of all `## ` section headers. Find the boundary between `## Code Conventions` and `## Detected Patterns` — that's the insertion point (the new section is a working convention, not a code pattern).

Note: `CLAUDE.md` may have a pre-existing uncommitted modification from prior session (visible in `git status` from Task 1). Do NOT include that pre-existing modification in this commit. Stage `CLAUDE.md` only after verifying the diff is exclusively the new `## Backlog Intake Rules` section.

- [x] **Step 2: Insert the new section**

Use the Edit tool to insert the following block. Choose the `old_string` to be the last line of `## Code Conventions` (or the line immediately before `## Detected Patterns`); choose `new_string` to be `old_string` + the block below + a blank line.

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

- [x] **Step 3: Verify the section landed and no other changes leaked into the diff**

```bash
git diff CLAUDE.md | head -60
git diff --stat CLAUDE.md
grep -A 2 '^## Backlog Intake Rules' CLAUDE.md | head -5
```

Expected: `git diff` shows ONLY the new `## Backlog Intake Rules` block insertion. If the diff shows unrelated edits (pre-existing modifications from prior session), use `git add -p CLAUDE.md` to stage only the new section. The `grep -A 2` shows 3 lines: the header + its first ~2 lines.

- [x] **Step 4: Commit (Commit C)**

```bash
git add -p CLAUDE.md  # interactively stage only the new section if there are pre-existing edits
# OR if no pre-existing edits:
# git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): add Backlog Intake Rules section

Cross-references the authoritative 📌 Process Rules in
docs/planning/BACKLOG.md. Documents intake routing defaults
(user-raised → 🔵, Claude-surfaced → 🟤, periodic/audit → 🟡),
no-merge-on-intake rule, and the rate limit on 🟤 Auto-Generated
PR post-merge review entries.

Spec: docs/superpowers/specs/2026-05-30-planning-restructure-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands. Pre-commit hook runs Prettier on `CLAUDE.md` (per `lint-staged` config for `*.md` if configured, otherwise no-op) + Vitest (existing tests still pass).

---

## Task 6: Create Vitest Unit Test for BACKLOG.md Structure

**Files:**
- Create: `tests/backlog-structure.test.js`

- [x] **Step 1: Write the failing test**

Create `tests/backlog-structure.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

    it('still has at least one ### sub-header in each source section', () => {
        // Heuristic guard against accidental gutting of any source section.
        // Each source section ## (the last 3 of REQUIRED_HEADERS) must contain
        // at least one ### sub-header before the next ## boundary.
        const content = readFileSync(BACKLOG_PATH, 'utf-8');
        for (const header of REQUIRED_HEADERS.slice(1)) {
            const idx = content.indexOf(header);
            expect(idx, `Header not found: ${header}`).toBeGreaterThan(-1);
            const next = content.indexOf('\n## ', idx + 1);
            const slice = content.slice(idx, next === -1 ? undefined : next);
            expect(slice, `${header} appears empty (no ### sub-header)`).toMatch(/^### /m);
        }
    });
});
```

Note on path resolution: `vitest.config.js` uses `include: ['tests/**/*.test.js']` — placing the file in `tests/` (not `tests/e2e/`, which is excluded) is sufficient for auto-discovery. The `import.meta.url` + `fileURLToPath` pattern matches existing tests like `tests/logger.test.js` and resolves the BACKLOG path independently of CWD.

- [x] **Step 2: Run the test to verify it passes (after Task 4's commit, BACKLOG.md already has all 4 headers)**

Run:
```bash
npx vitest run tests/backlog-structure.test.js
```

Expected: 2 tests PASS, total 244/244 tests pass overall (242 existing + 2 new).

- [x] **Step 3: Negative test — temporarily break BACKLOG.md to confirm the test fires**

```bash
# Make a temporary copy
cp docs/planning/BACKLOG.md /tmp/BACKLOG.md.backup
# Use the Edit tool to change '## 📌 Process Rules (READ BEFORE PROPOSING WORK)'
# to '## XX Process Rules (READ BEFORE PROPOSING WORK)' in docs/planning/BACKLOG.md
npx vitest run tests/backlog-structure.test.js
echo "exit=$?"
# Restore via Edit tool (revert the same line)
# OR if working tree gets messed up, restore from backup:
cp /tmp/BACKLOG.md.backup docs/planning/BACKLOG.md
rm /tmp/BACKLOG.md.backup
```

Expected: with the broken header, the first `it()` block FAILS with `Missing required headers: ## 📌 Process Rules (READ BEFORE PROPOSING WORK)`. After restore, all 244 tests pass again.

- [x] **Step 4: Verify the pre-commit hook integration works**

```bash
# Stage a no-op file change to trigger the hook
touch /tmp/touch-trigger
git add -A  # only the new test file should be staged at this point
git status --short
```

Actually, the pre-commit hook runs ALL of `npx vitest run` (per `.husky/pre-commit` line 2) regardless of what's staged. The new test is auto-discovered via vitest.config.js's `include` glob. So this verification is implicit in Step 5's commit.

- [x] **Step 5: Commit (Commit D)**

```bash
git add tests/backlog-structure.test.js
git commit -m "$(cat <<'EOF'
test(backlog): add Vitest unit test for BACKLOG.md structure

Asserts docs/planning/BACKLOG.md retains the 4 required top-level
headers: 📌 Process Rules pinned section + 🔵 User-Flagged / 🟡
Operational / 🟤 Auto-Generated source sections. Second test asserts
each source section has at least one ### sub-header (guard against
accidental section gutting).

Picked up automatically by vitest.config.js's tests/**/*.test.js include
glob — no .husky/pre-commit or lint-staged config change required.
Vitest already runs unconditionally as the second line of
.husky/pre-commit.

Negative-test verified manually: changing any required header makes
the first it() block fail with a specific assertion message listing
the missing header(s).

Spec: docs/superpowers/specs/2026-05-30-planning-restructure-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: pre-commit hook runs the new test as part of `npx vitest run`; all 244 tests pass; commit lands.

---

## Task 7: Open Pull Request Against `main`

**Files:**
- No file modifications — repository operations only.

- [x] **Step 1: Verify the branch state**

```bash
git log main..HEAD --oneline
git status --short
```

Expected: 4 commits ahead of main (commits A through D, plus optional reword commit E). Working tree may still show the pre-existing `M CLAUDE.md` from prior sessions; this is acceptable — that modification was deliberately NOT included in any branch commit.

- [x] **Step 2: Push the branch**

```bash
git push -u origin feature/planning-restructure
```

Expected: branch pushed; `Set tracking` confirmation.

- [x] **Step 3: Open the PR**

```bash
gh pr create --base main --title "Planning restructure: source-split BACKLOG + weekly quota + lossless migration" --body "$(cat <<'EOF'
## Summary

- Restructures `docs/planning/BACKLOG.md` into 3 source sections (🔵 user-flagged / 🟡 ops / 🟤 auto-generated) with pinned 📌 Process Rules at top
- Encodes hard weekly quotas: ≥50% user-flagged SP, ≤25% ops SP, ≤1 auto group + ≤25% auto SP
- Migration is lossless — verified by 3 mechanical checks (live checkbox count with conversion accounting, bold-title diff manually inspected, section round-trip against classification table)
- Adds `## Backlog Intake Rules` section to project CLAUDE.md cross-referencing the pinned rules
- Adds `tests/backlog-structure.test.js` Vitest unit test to protect the 4 required top-level headers + source-section non-emptiness

## Spec
`docs/superpowers/specs/2026-05-30-planning-restructure-design.md` (committed as `456a770` on main)

## Pass 1 Classification
`docs/superpowers/specs/2026-05-30-planning-restructure-classification.md` — user audited and signed off before the rewrite ran.

## Mirrors rating_bot pattern
The same problem (user-flagged feature work crowded out by auto-generated PR-review follow-ups) was solved in the rating_bot project's planning restructure (spec at `rule_bots/rating_bot/docs/superpowers/specs/2026-05-30-planning-restructure-design.md`). This PR is the media_viewer port with three adaptations: 🟡 covers periodic/audit work (no deploy pipeline), Vitest unit test replaces the Python pre-commit hook, and trailing structural blocks (`## Rejected Ideas` + `## Promotion Criteria`) are retained verbatim.

## Test plan
- [ ] All 4 commits pass the pre-commit hook (lint-staged + `npx vitest run`)
- [ ] Unit tests pass (244/244, including 2 new tests in `tests/backlog-structure.test.js`)
- [ ] No-loss verification numbers in the BACKLOG rewrite commit message match
- [ ] Manual smoke test: `npx vitest run tests/backlog-structure.test.js` shows 2/2 pass
- [ ] Negative smoke test: changing any required header makes the first test fail with specific assertion message
- [ ] First weekly-planning cycle under new rules produces a Quota Check showing ✅ Compliance — verified separately after merge (Task 9 out-of-repo)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned. Save the URL — it goes to the user for review.

---

## Task 8 (Out-of-Repo): Verify User's Weekly Planning Prompt

**Files:**
- No repo files — verbal verification.

- [x] **Step 1: Ask the user to paste their current weekly-planning prompt**

Tell the user:

> "Paste your current local media_viewer weekly-planning prompt. I'll verify it against the 8-item checklist in the spec (Section 2). If anything is off, I'll show you the specific diff to apply."

- [x] **Step 2: Run the 8-item verification**

Check each item from the spec Section 2 "Prompt verification checklist":

1. `Sources` line includes "READ THE 📌 PROCESS RULES SECTION AT THE TOP FIRST"
2. `Sources` line mentions Cleanup Week date awareness
3. `Task Selection Rules` opens with 4 source/quota rules (≥50% user, ≤25% ops, ≤1 auto batch, cleanup cadence)
4. Carry-forward rule includes "count against source quota of origin section"
5. `Weekly Challenge` defaults to 🔵 User-Flagged section
6. `Summary Table` includes `Source` column with 🔵/🟡/🟤 markers
7. `Notes` includes mandatory `### Quota Check` subsection
8. Header field includes Cleanup Week status when applicable

For each missing item, show the user the exact diff hunk from the spec (Section 2 has the full edit text for each of the six prompt edits).

- [x] **Step 3: Confirm verbally**

User edits their local prompt and confirms verbally. Mark Task 8 done.

---

## Task 9 (Out-of-Repo): First Real-World Test

**Files:**
- New: next `docs/planning/WEEKLY.md` plan under the new rules (user runs this separately, not in this branch)

- [x] **Step 1: Run the weekly-planning prompt under the new rules**

When the user invokes weekly planning for the next upcoming week (post-PR merge), Claude reads the restructured BACKLOG.md, the pinned 📌 Process Rules, and the updated prompt. Produces a WEEKLY.md with a Quota Check subsection.

- [x] **Step 2: Verify success criteria from the spec (Section 6)**

Check that the new WEEKLY.md satisfies:

- 🔵 User-Flagged ≥ 50% SP
- 🟡 Operational ≤ 25% SP
- 🟤 Auto-Generated ≤ 1 group AND ≤ 25% SP
- Quota Check subsection present and shows ✅ Compliance
- At least one entry from one of the manual-testing intake batches (2026-05-30 / 2026-05-05 / 2026-04-18 / 2026-04-08 / 2026-03-19) is picked

- [x] **Step 3: Triage any failures**

If any criterion fails, document the failure as a new BACKLOG.md entry under 🟤 Auto-Generated (since this would be a Claude-surfaced design-tuning item) and discuss with the user whether the prompt or the quota thresholds need adjustment.

---

## Optional Task E: Reword Pass

**Files:**
- Modify: `docs/planning/BACKLOG.md` (targeted entry rewords / splits / dup-tags only)

This task is OPTIONAL and can be deferred indefinitely. Run only if specific entries need wording cleanup or duplicate-tagging discovered during the audit.

- [x] **Step 1: Surface the list of proposed rewords**

For each entry the user flagged for rewording during the Task 3 audit (or during ongoing review), list:
- Original `- [ ] **<old title>**` line
- Proposed `- [ ] **<new title>**` line
- Reason (tightening / split / dup-tag)

- [x] **Step 2: Apply rewords one at a time, verifying no-loss after each**

For each reword:
1. Edit the entry in `docs/planning/BACKLOG.md`
2. Re-run the no-loss verification (Task 4 Step 6 Check 1)
3. If checkbox count changes (due to a split), update the expected count and document the split in the commit message

- [x] **Step 3: Commit (Commit E)**

```bash
git add docs/planning/BACKLOG.md
git commit -m "$(cat <<'EOF'
docs(planning): backlog reword pass — <N entries reworded, M splits, K dups tagged>

Per spec, structural changes are kept separate from content changes
so either can be reverted independently. This commit contains only
content edits — pinned section and source section headers untouched.

Renames:
- <old title> → <new title>
- ...

Splits:
- <entry> → split into <new entry 1> + <new entry 2> (reason: ...)

Dup-tags added:
- <entry> tagged [possible-dup-of: <other entry>]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Substitute placeholders with actual changes. If no rewords are needed, skip this task entirely.

---

## Self-Review

After writing this plan, verified against the spec:

**Spec coverage:**
- Spec Section 1 (BACKLOG.md Restructure) → Tasks 2, 3, 4
- Spec Section 2 (Weekly Planning Prompt Edits) → Task 8 (verbal verification; prompt is user-local)
- Spec Section 3 (CLAUDE.md Intake Rules) → Task 5
- Spec Section 4 (Migration Plan, two-pass, no-loss with conversion accounting) → Tasks 1, 2, 3, 4 (baseline capture, classification, audit gate, mechanical rewrite + verification)
- Spec Section 5 (Sequencing & Tooling) → Task 6 (Vitest test), Task 7 (PR sequence)
- Spec Section 6 (Success Criteria) → Task 9 (first real-world test)
- Spec "Failure Modes & Mitigations" → Tasks 4 (no-loss checks), 6 (negative-test on Vitest test), 3 (audit gate)

**Placeholder scan:** No literal "TBD", "TODO" (in placeholder sense), "fill in details", or "appropriate X" phrases in any task. The `<N>`, `<M>`, `<NEW_LIVE>`, etc. placeholders in commit messages and steps are explicitly numerical substitutions the engineer fills in from baseline files and Task 6 output — not vague "fill in later" requests. The classification table in Task 2 explicitly requires actual row content (no `...` allowed in the final commit); a verification grep confirms it.

**Type consistency:** Required-header set (`REQUIRED_HEADERS`) is consistent across Task 4 skeleton (Step 1), the Vitest test (Task 6 Step 1), and the spec. All emoji and surrounding text match exactly (verified by inspection):

```
## 📌 Process Rules (READ BEFORE PROPOSING WORK)
## 🔵 User-Flagged Ideas
## 🟡 Operational & Observation Items
## 🟤 Auto-Generated Tech Debt
```

**Quota numbers:** ≥50% user / ≤25% ops / ≤1 auto group + ≤25% auto SP — appear identically in spec, BACKLOG.md pinned section (Task 4 Step 1), CLAUDE.md Intake Rules (Task 5 Step 2), and PR body (Task 7 Step 3).

**Branch name:** `feature/planning-restructure` consistent across Tasks 1, 7, and the spec.

**Pre-commit infrastructure:** Vitest invocation `npx vitest run` matches `.husky/pre-commit` line 2. Auto-discovery via `vitest.config.js`'s `include: ['tests/**/*.test.js']` confirmed in Task 6 Step 1 notes.

---
