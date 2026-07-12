# G4: Strategic-Doc Refresh & CLAUDE.md Pre-Push Gate Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `docs/planning/GOALS.md`, `ROADMAP.md`, `MILESTONES.md` from their frozen 2026-02-05 state to July-2026 reality, sync CLAUDE.md to the pre-push E2E gate, and install the weekly-planning staleness rule — all content pre-decided and embedded in the approved spec.

**Architecture:** Docs-only change on branch `docs/g4-strategic-docs-refresh` (already exists, spec committed as `41d9233`). The spec — [`docs/superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md`](../../superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md) — embeds **near-final replacement content**; this plan is the mechanical procedure to apply it. No strategic judgment is required or permitted: where this plan says "copy the fenced block from spec § 4.X", copy it **verbatim** (do not retype, do not paraphrase), replacing only the `<DATE>` placeholders.

**Tech Stack:** Markdown, git, PowerShell (Windows), `gh` CLI. No application code changes.

## Global Constraints

- **Docs-only.** The final diff may touch ONLY: `docs/planning/GOALS.md`, `docs/planning/ROADMAP.md`, `docs/planning/MILESTONES.md`, `CLAUDE.md`, `docs/planning/README.md` (+ this plan file's own checkboxes and, at closeout, the usual planning docs). If any other file appears in `git status`, stop and investigate.
- **Content source of truth** = spec § 4 fenced blocks. Verbatim copy; only `<DATE>` → execution date (`YYYY-MM-DD`).
- **Facts discipline** (spec § 3): re-run every fact command first (Task 1). Small numeric drift → use the fresh number everywhere. Structural contradiction (new manager extracted, G1 already ✅ in WEEKLY, pre-push hook changed) → **STOP and report to the user**; do not improvise.
- **LF line endings** (`.gitattributes` enforces). Prettier ignores `docs/` and `*.md` — no formatting-hook effects.
- The pre-commit hook runs the unit suite on every commit — expect **434 passed** (or the fresh Task-1 count).
- The pre-push hook must print the docs-only **SKIP** message on push. If it starts the full E2E suite instead, a non-docs file is in the diff — stop and investigate before pushing again.
- **No `/code-review` fan-out**: docs-only PR → manual user review (the [2026-06-29] convention, restated in WEEKLY Notes).
- All communication in English.

---

### Task 1: Preflight — branch + fact re-verification

**Files:**
- No edits. Read: spec § 3; `docs/planning/WEEKLY.md` (G1 row); `.husky/pre-push`; `scripts/check-e2e-needed.js` (header comment).

**Interfaces:**
- Produces: a confirmed fact set (unit count, E2E count, renderer line count, G1 status) used verbatim by Tasks 2–5.

- [ ] **Step 1: Confirm branch and clean tree**

Run:
```powershell
git checkout docs/g4-strategic-docs-refresh && git status --short
```
Expected: branch switch succeeds (or already on it); no unexpected modified files.

- [ ] **Step 2: Re-run the spec § 3 fact commands**

Run each and note the fresh values:
```powershell
npx vitest run --no-file-parallelism 2>&1 | Select-String 'Test Files|Tests '
npx playwright test --list 2>$null | Select-Object -Last 1
(Get-Content media-viewer.js | Measure-Object -Line).Lines
Test-Path fullscreen.js, tournament.js, tournament-engine.js
Select-String 'Video fullscreen toggle' docs/planning/DONE.md | Select-Object -First 1
npx playwright test --list 2>$null | Select-String 'zoom' | Select-Object -First 2
```
Expected (as of 2026-07-12): `434 passed (434)` / 16 files; `Total: 52 tests in 13 files`; `7864`; `True True True`; a DONE.md hit; zoom.test.js entries.

- [ ] **Step 3: Check G1 status in WEEKLY.md**

Run:
```powershell
Select-String 'G1 \|' docs/planning/WEEKLY.md
```
Expected: G1 row Status `⬜ Planned` → spec content applies as written. If G1 shows `✅ PR #N`: **structural drift** — the three G1-dependent KRs in spec § 4.1 Objective 1 and the first milestone in § 4.3 must flip to shipped wording. STOP and report to the user before writing (per spec § 3), proposing the flipped wording.

- [ ] **Step 4: Confirm the pre-push gate behavior is unchanged**

Read `.husky/pre-push` (5 lines) and the header comment of `scripts/check-e2e-needed.js`. Expected: `node scripts/check-e2e-needed.js` prints RUN/SKIP; SKIP only when every changed path is `*.md` or under `docs/`; fail-safe → RUN; bypass `git push --no-verify`. If different, STOP and report (CLAUDE.md Edit 2 in Task 5 would document fiction).

- [ ] **Step 5: Decide drift handling**

If every value matched: proceed. If only numbers moved (e.g. 435 tests): note the fresh numbers — Tasks 2–5 substitute them wherever the stale number appears in the spec content. No commit in this task.

---

### Task 2: Replace `docs/planning/GOALS.md`

**Files:**
- Modify: `docs/planning/GOALS.md` (full replacement)
- Source: spec § 4.1 fenced block

**Interfaces:**
- Consumes: Task 1 fact set (test counts in the Constraints table, `~7,900` renderer size, G1 status wording).
- Produces: GOALS.md referenced by ROADMAP/MILESTONES cross-links (Tasks 3–4) and by the README staleness rule (Task 6).

- [ ] **Step 1: Apply the replacement**

Open spec § 4.1. Copy the entire ```` ```markdown ```` fenced block verbatim as the new full content of `docs/planning/GOALS.md`. Replace `<DATE>` (1 occurrence, the `Last Updated` line) with today's date. Substitute any Task-1 fresh numbers.

- [ ] **Step 2: Verify no stale content remains**

Run:
```powershell
Select-String -Path docs/planning/GOALS.md -Pattern '6100|No automated tests|Q1 2026|<DATE>|Core Stability|UX Refinement'
```
Expected: **no output**.

- [ ] **Step 3: Verify the new anchors are present**

Run:
```powershell
Select-String -Path docs/planning/GOALS.md -Pattern '24k-Scale Responsiveness|Maintainable Architecture|No CI service|staleness check'
```
Expected: ≥4 matching lines.

- [ ] **Step 4: Commit**

```powershell
git add docs/planning/GOALS.md
git commit -m "docs(planning): rewrite GOALS.md to July 2026 reality (G4)"
```
Expected: pre-commit passes (unit suite green).

---

### Task 3: Replace `docs/planning/ROADMAP.md`

**Files:**
- Modify: `docs/planning/ROADMAP.md` (full replacement)
- Source: spec § 4.2 fenced block

**Interfaces:**
- Consumes: Task 1 fact set; D1/D3 decisions already baked into the spec content.
- Produces: the theme board + v1.1-closed/v2.0-in-progress release sections that MILESTONES.md (Task 4) mirrors.

- [ ] **Step 1: Apply the replacement**

Copy the spec § 4.2 ```` ```markdown ```` fenced block verbatim as the new full content of `docs/planning/ROADMAP.md`. Replace `<DATE>` (2 occurrences: `Last Updated` + the v1.1 "retro-declared" line). Substitute Task-1 fresh numbers.

- [ ] **Step 2: Verify no stale content remains**

Run:
```powershell
Select-String -Path docs/planning/ROADMAP.md -Pattern '6100|Q1 2026|<DATE>|Not Started \(Target: TBD\)|Future \(v3\.0\+\)|TypeScript migration|Cloud sync'
```
Expected: **no output** (the old v3.0+ speculative list is deliberately dropped per spec § 4.2 note).

- [ ] **Step 3: Verify the new structure is present**

Run:
```powershell
Select-String -Path docs/planning/ROADMAP.md -Pattern '## Theme Board|### Now|### Next|### Later|Shipped|Modularization'
```
Expected: matches for every pattern (Now/Next/Later headers, v1.1 ✅ Shipped, v2.0 Modularization).

- [ ] **Step 4: Commit**

```powershell
git add docs/planning/ROADMAP.md
git commit -m "docs(planning): ROADMAP.md — close v1.1, v2.0 = modularization, theme board (G4)"
```

---

### Task 4: Replace `docs/planning/MILESTONES.md`

**Files:**
- Modify: `docs/planning/MILESTONES.md` (full replacement)
- Source: spec § 4.3 fenced block (**note: it is a 4-backtick fence** because the content itself contains a 3-backtick timeline diagram — copy everything between the ````` ````markdown ````` markers, keeping the inner ``` diagram fence intact)

**Interfaces:**
- Consumes: Task 1 fact set; the two milestone targets (July 2026; Q4 2026 soft) approved in the spec.
- Produces: milestone statuses consistent with ROADMAP (Task 3) — v1.1 ✅ in both, v2.0 in-progress in both.

- [ ] **Step 1: Apply the replacement**

Copy the spec § 4.3 fenced block verbatim as the new full content of `docs/planning/MILESTONES.md`. Replace `<DATE>` (3 occurrences: `Last Updated`, v1.1 "retro-declared", v1.1 "strategic-doc refresh" DoD line). Substitute Task-1 fresh numbers.

- [ ] **Step 2: Verify no stale content remains**

Run:
```powershell
Select-String -Path docs/planning/MILESTONES.md -Pattern 'Q1 2026|<DATE>|TASK-002.*Not Started|v1\.1 Polish \| Q1|On Track'
```
Expected: **no output**.

- [ ] **Step 3: Verify the new milestones + intact diagram**

Run:
```powershell
Select-String -Path docs/planning/MILESTONES.md -Pattern '24k AI-sort smooth|v2\.0 modularization complete|24k AI-sort smooth\]|✅ Complete \| 2'
```
Expected: the two new 🎯 milestones, the timeline diagram line, and the Health Summary `✅ Complete | 2` row all present.

- [ ] **Step 4: Commit**

```powershell
git add docs/planning/MILESTONES.md
git commit -m "docs(planning): MILESTONES.md — v1.1 retro-closed, two honest 2026 milestones (G4)"
```

---

### Task 5: CLAUDE.md — three surgical edits

**Files:**
- Modify: `CLAUDE.md` (3 string edits — NOT a rewrite; source: spec § 4.4)

**Interfaces:**
- Consumes: Task 1 confirmation that the pre-push gate behavior matches spec § 3; fresh renderer line count.
- Produces: CLAUDE.md consistent with `scripts/`, `.husky/`, and the strategic docs' `~7,900` figure.

- [ ] **Step 1: Edit 1 — Architecture tree `scripts/` bullet**

Find the line beginning `├── scripts/` and replace it exactly per spec § 4.4 Edit 1 (appends `; check-e2e-needed.js (pre-push E2E gate decision — parsePushRefs/classifyPaths + fail-safe RUN/SKIP CLI)`).

- [ ] **Step 2: Edit 2 — hook prose**

In "Build & Development Commands", replace the sentence `E2E is NOT run by the hook.` with the spec § 4.4 Edit 2 replacement text (pre-push RUN/SKIP behavior, docs-only skip, fail-safe → RUN, `git push --no-verify` bypass) — copy it verbatim.

- [ ] **Step 3: Edit 3 — renderer line count**

Run:
```powershell
Select-String -Path CLAUDE.md -Pattern '8400'
```
Replace every occurrence's `~8400` with `~7,900` (or the Task-1 fresh figure rounded to the nearest hundred with a `~`).

- [ ] **Step 4: Verify**

Run:
```powershell
Select-String -Path CLAUDE.md -Pattern '8400'
Select-String -Path CLAUDE.md -Pattern 'check-e2e-needed'
```
Expected: first command **no output**; second command **≥2 matches** (tree bullet + hook prose).

- [ ] **Step 5: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs(claude-md): sync pre-push E2E gate + renderer line count (G4, 🟤 [2026-07-11])"
```

---

### Task 6: `docs/planning/README.md` — staleness rule + missing table rows

**Files:**
- Modify: `docs/planning/README.md` (2 edits; source: spec § 4.5)

**Interfaces:**
- Consumes: nothing from other tasks (independent), but its staleness rule is what GOALS.md's `Review Cycle` line (Task 2) points at.
- Produces: the in-repo home of the weekly-planning staleness check.

- [ ] **Step 1: Edit 1 — replace `### Strategic Review`**

Replace the entire existing `### Strategic Review` section (heading + the four "Periodically review" checkboxes) with the spec § 4.5 Edit 1 fenced block, verbatim.

- [ ] **Step 2: Edit 2 — add missing document rows**

In the "Task Management (Tactical)" table, add the two rows from spec § 4.5 Edit 2 (WEEKLY.md, REVIEW-QUEUE.md). In the Overview table, change the Tactical row's Documents cell from `TODO.md, BACKLOG.md` to `WEEKLY.md, TODO.md, BACKLOG.md, REVIEW-QUEUE.md`.

- [ ] **Step 3: Verify**

Run:
```powershell
Select-String -Path docs/planning/README.md -Pattern 'staleness check|WEEKLY.md|REVIEW-QUEUE.md|🟡 Operational BACKLOG'
Select-String -Path docs/planning/README.md -Pattern 'Periodically review'
```
Expected: first command matches all four patterns; second command **no output**.

- [ ] **Step 4: Commit**

```powershell
git add docs/planning/README.md
git commit -m "docs(planning): README — weekly staleness rule + WEEKLY/REVIEW-QUEUE index rows (G4)"
```

---

### Task 7: Final sweep, push, PR

**Files:**
- No new edits (fixes only if the sweep fails). Read: all five changed files.

**Interfaces:**
- Consumes: Tasks 2–6 complete.
- Produces: pushed branch + open docs-only PR for the user's manual review.

- [ ] **Step 1: Cross-doc leftover-fiction sweep** (spec § 6 rule 4)

Run:
```powershell
Select-String -Path docs/planning/GOALS.md, docs/planning/ROADMAP.md, docs/planning/MILESTONES.md -Pattern '6100|No automated tests|Q1 2026|<DATE>'
```
Expected: **no output**. Any hit → fix in the offending file, amendless follow-up commit `docs(planning): fix leftover stale reference (G4 sweep)`.

- [ ] **Step 2: Link-target check**

Every relative link used by the new content must resolve:
```powershell
Test-Path docs/planning/README.md, docs/planning/WEEKLY.md, docs/planning/TODO.md, docs/planning/BACKLOG.md, docs/planning/MILESTONES.md, docs/planning/ROADMAP.md, docs/planning/GOALS.md, docs/planning/REVIEW-QUEUE.md
```
Expected: all `True`.

- [ ] **Step 3: Confirm the diff is docs-only**

Run:
```powershell
git diff main --name-only
```
Expected: exactly the five § Global-Constraints files + `docs/superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md` + `docs/planning/plans/2026-07-12_g4-strategic-docs-refresh.md`. Anything else → stop and investigate.

- [ ] **Step 4: Push — expect the SKIP message**

Run:
```powershell
git push -u origin docs/g4-strategic-docs-refresh
```
Expected: pre-push prints the docs-only skip line (from `check-e2e-needed.js` → SKIP) and does NOT start Playwright. If E2E starts, abort (Ctrl+C is fine — the hook only gates the push), run Step 3 again, investigate.

- [ ] **Step 5: Open the PR**

```powershell
gh pr create --title "docs(G4): strategic-doc refresh to July 2026 reality + CLAUDE.md pre-push gate sync" --body @'
## Summary
- Rewrite GOALS.md / ROADMAP.md / MILESTONES.md from their frozen 2026-02-05 state to verified July-2026 reality (hybrid model: v1.1 retro-closed ✅, v2.0 = modularization arc, Now/Next/Later theme board) — 🟡 [2026-07-01]
- Sync CLAUDE.md to the pre-push E2E gate (scripts/ bullet + hook prose) and fix the stale ~8400 renderer line count (actual: ~7,900) — 🟤 [2026-07-11] PR #63 post-merge
- Install the weekly-planning staleness rule in docs/planning/README.md § Strategic Review + add missing WEEKLY/REVIEW-QUEUE index rows

Spec (user-approved 2026-07-12, decisions D1–D5): docs/superpowers/specs/2026-07-12-g4-strategic-docs-refresh-design.md

## Verification
- All spec § 3 facts re-verified at execution time (unit / E2E counts, renderer lines, gate behavior)
- Leftover-fiction sweep clean (`6100`, `No automated tests`, `Q1 2026`, `<DATE>`)
- Docs-only diff; pre-push gate printed the docs-only SKIP (live-validating the gate)

**Docs-only PR → manual review, no `/code-review` fan-out (per the [2026-06-29] convention).**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```
Expected: PR URL printed. Report it to the user together with the § 5 reminder below.

- [ ] **Step 6: Remind the user of their out-of-repo action** (spec § 5)

Tell the user to add this line to their local weekly-planning prompt:
> Strategic-docs staleness check: compare ROADMAP/GOALS/MILESTONES against what shipped since the last plan; if contradicted or `Last Updated` > 2 months, file a 🟡 "strategic-doc refresh" BACKLOG entry.

---

### Task 8: Closeout (GATED — only after the user approves/merges the PR)

**Files:**
- Modify: `docs/planning/WEEKLY.md`, `docs/planning/BACKLOG.md`, `docs/planning/TODO.md` (if a G4 row exists), `docs/planning/DONE.md`, `docs/README.md`
- Move: this plan → `docs/archive/plans/2026-07-12_g4-strategic-docs-refresh.md`

**Interfaces:**
- Consumes: merged PR number `#N`.
- Produces: closed-out G4 per CLAUDE.md § Task Completion.

- [ ] **Step 1: Check off shipped work**

- WEEKLY.md: G4 Summary-Table Status → `✅ PR #N` (the number, never a bare ✅) AND the Friday Daily-Schedule G4 entry; check both G4 task boxes (🟡 refresh + 🟤 doc-sync).
- BACKLOG.md: check off the 🟡 [2026-07-01] strategic-doc-refresh entry and the 🟤 [2026-07-11] CLAUDE.md doc-sync entry (grep for them; annotate `✅ Resolved <date> via PR #N`).

- [ ] **Step 2: DONE.md entry**

Add a dated G4 entry: summary (strategic docs refreshed to reality — hybrid model, theme board, staleness rule; CLAUDE.md gate sync + line-count fix), plan link (archived path), PR #N, spec link.

- [ ] **Step 3: Archive this plan**

```powershell
git mv docs/planning/plans/2026-07-12_g4-strategic-docs-refresh.md docs/archive/plans/2026-07-12_g4-strategic-docs-refresh.md
```
Flip all remaining `- [ ]` step boxes in the archived copy to `- [x]` (line-start boxes only). Add a row + link-ref in `docs/README.md` § Archived Plans:
`| [G4 Strategic-Doc Refresh Plan][] | Strategic docs refreshed to July-2026 reality (v1.1 closed, v2.0 = modularization, theme board) + CLAUDE.md pre-push gate sync + weekly staleness rule (Group G4) |`
and `[G4 Strategic-Doc Refresh Plan]: archive/plans/2026-07-12_g4-strategic-docs-refresh.md`.

- [ ] **Step 4: Extract ≥2 improvements to BACKLOG** (routed 🟤, per Backlog Intake Rules, `### [<date>] G4 closeout` group)

Seed candidates (verify still-unfiled first; tag `[possible-dup-of: …]` if similar): (1) automate the CLAUDE.md-vs-`scripts/`+`.husky/` drift guard (recurring class: PR #51 → PR #63 → G4); (2) WEEKLY.md "~8400-line"-style numeric claims — consider sourcing recurring numbers (test count, renderer lines) from one place at plan-write time.

- [ ] **Step 5: Commit closeout**

```powershell
git add -A
git commit -m "docs(planning): G4 closeout — WEEKLY/BACKLOG/DONE + plan archive (PR #N)"
```
Then capture durable learnings to memory per CLAUDE.md § Task Completion step 5.
