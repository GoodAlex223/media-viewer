# Weekly Reviews (First Run) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note — this is research/process, not TDD code.** There is no application code and no test cycle. "Tasks" are deep-research runs and documentation edits; "verification" is reviewing that the recorded rows/entries have the right shape (date, source, verdict, note). Do not look for `npm test` deltas — no code is touched. The pre-commit hook still runs on the single docs commit (Task 7) and must pass clean.

**Goal:** Execute the first run of the recurring Weekly Reviews batch — review the top not-yet-reviewed candidate in each of 4 categories, record verdicts in REVIEW-QUEUE.md, file BACKLOG entries for any adopts, and check off the WEEKLY.md Group WR boxes.

**Architecture:** Four independent deep-research runs (one per category) produce candidate findings; a synthesis step applies a project-fit verdict rubric and writes the results into three planning docs (REVIEW-QUEUE.md verdict rows + Next-up, BACKLOG.md 🟤 entries for adopts, WEEKLY.md checkboxes); one commit on the `chore/weekly-reviews-2026-06-26` branch.

**Tech Stack:** `deep-research` skill (web search + fetch + adversarial verification), Markdown doc edits. No npm packages, no code.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md`). Every task implicitly includes these:

- **Relevance lens = hybrid:** source the genuinely-best current candidates broadly, but judge `adopt | pass | defer` by *"does this help THIS project's solo-dev-with-Claude-Code Electron workflow?"* (JS, no bundler, Vitest + Playwright, Electron desktop app).
- **Depth = deep-research harness, one run per category** (4 runs total). Not a skim, not one combined pass.
- **Recency target = current as of June 2026.** Rely on live web fetch (assistant training cutoff is Jan 2026). Reviewed logs are empty (first run) → every candidate is eligible.
- **`adopt` is hands-off:** an adopt files a 🟤 Auto-Generated BACKLOG entry to *trial/integrate later*. Do **not** install a plugin or change project behavior in this branch.
- **"Plugin" = Claude Code plugin.** Category 1a = official Claude Code plugin marketplace; 1b = Claude Code plugins outside the official store.
- **4 verdict rows total** this week (Plugins yields 2: store + wider; + 1 Claude-bp + 1 non-Claude-bp).
- **Verdict rubric:** `adopt` = directly useful now → BACKLOG entry · `defer` = project-relevant but blocked (timing/dependency/needs eval) → park under *Next-up*, no BACKLOG entry · `pass` = not a fit / not better than current → logged in Reviewed log only.
- **No-candidate fallback:** if a category genuinely has no strong not-yet-reviewed candidate, record a `pass` row with a "no strong candidate this week" note rather than forcing an adopt.
- **Branch:** all edits on `chore/weekly-reviews-2026-06-26`. Single commit (Task 7).

---

## Files

- **Read/research only (no edits):** live web via the `deep-research` skill.
- **Modify: `docs/planning/REVIEW-QUEUE.md`** — append verdict rows to the three Reviewed logs; park runners-up under Next-up; add a methodology pointer to the header.
- **Modify: `docs/planning/BACKLOG.md`** — insert a `### [2026-06-26] From: Weekly Reviews (week of June 22)` heading + one 🟤 entry per adopt at the top of the `## 🟤 Auto-Generated Tech Debt` section (line 205). **Conditional** — only if ≥1 adopt.
- **Modify: `docs/planning/WEEKLY.md`** — check off Group WR boxes (lines 78–80) and the Thu/Fri schedule lines (137, 152).

The four research findings are runtime-determined — the doc tasks below specify exact **location, format, and decision rubric**, not literal final prose (the candidate names/verdicts are not knowable until the research runs).

---

### Task 1: Deep-research — Plugins / official Claude Code marketplace

**Files:** none edited (research only). Capture findings in conversation/controller state for Task 5.

**Interfaces:**
- Produces: a `Finding` for category **1a** = `{ category: 'plugins-store', topPick, runnersUp[2-3], draftVerdict, projectFitRationale, sources[] }`. Task 5 consumes all four Findings.

- [ ] **Step 1: Run the deep-research skill**

Invoke the `deep-research` skill with this question (args):

> "As of June 2026, what is the single best Claude Code plugin available in the **official** Claude Code plugin marketplace for a solo developer building an Electron desktop app (JavaScript, no bundler, Vitest + Playwright) using Claude Code? Rank the top candidates, recommend one, note 2–3 runners-up, and cite sources (marketplace listing / repo / docs)."

- [ ] **Step 2: Capture the structured finding**

Record: top pick (name + 1-line what-it-does + listing URL), 2–3 runners-up, a draft verdict (your first read of adopt/pass/defer under the hybrid lens), an explicit *fit-to-this-project* rationale, and sources. If the research surfaces no concrete official-marketplace plugin worth reviewing, record that explicitly (→ no-candidate `pass` in Task 5).

- [ ] **Step 3: Verify the finding is reviewable**

Check: the finding names a concrete plugin (or an explicit "no candidate"), has ≥1 source URL, and a project-fit sentence. No commit (research produces no artifact yet).

---

### Task 2: Deep-research — Plugins / wider internet

**Files:** none edited (research only).

**Interfaces:**
- Produces: a `Finding` for category **1b** = `{ category: 'plugins-wider', topPick, runnersUp[2-3], draftVerdict, projectFitRationale, sources[] }`.

- [ ] **Step 1: Run the deep-research skill**

Invoke the `deep-research` skill with this question (args):

> "As of June 2026, what is the best Claude Code plugin hosted **outside** the official Claude Code plugin marketplace (community marketplaces, `awesome-claude-code`-style lists, GitHub repos) for a solo developer building an Electron desktop app with Claude Code? Rank candidates, recommend one, note 2–3 runners-up, cite sources. Exclude anything already covered as an official-marketplace plugin in this same week's review."

- [ ] **Step 2: Capture the structured finding**

Same shape as Task 1 Step 2, with `category: 'plugins-wider'`. Ensure the pick is genuinely *outside* the official store (distinct from Task 1's pick).

- [ ] **Step 3: Verify the finding is reviewable**

Same check as Task 1 Step 3. No commit.

---

### Task 3: Deep-research — Claude best-practice

**Files:** none edited (research only).

**Interfaces:**
- Produces: a `Finding` for category **2** = `{ category: 'claude-bp', topPick, runnersUp[2-3], draftVerdict, projectFitRationale, sources[] }`.

- [ ] **Step 1: Run the deep-research skill**

Invoke the `deep-research` skill with this question (args):

> "As of June 2026, what is the most valuable practice or workflow technique for using Claude / Claude Code / Claude Design / Claude Cowork effectively, especially for solo software development? Recommend one top practice, note 2–3 runners-up, and cite sources (official docs, Anthropic posts, well-supported community write-ups)."

- [ ] **Step 2: Capture the structured finding**

Same shape, `category: 'claude-bp'`. The "pick" here is a *practice/technique*, not a package — the fit rationale should say concretely how it would change this project's Claude-Code dev loop.

- [ ] **Step 3: Verify the finding is reviewable**

Same check. No commit.

---

### Task 4: Deep-research — Non-Claude AI best-practice

**Files:** none edited (research only).

**Interfaces:**
- Produces: a `Finding` for category **3** = `{ category: 'non-claude-bp', topPick, runnersUp[2-3], draftVerdict, projectFitRationale, sources[] }`.

- [ ] **Step 1: Run the deep-research skill**

Invoke the `deep-research` skill with this question (args):

> "As of June 2026, what is the most valuable best-practice or technique for using AI models/tools **other than** Claude (e.g. other LLMs, coding assistants, local models, AI dev tooling) that would benefit a solo developer's software workflow? Recommend one, note 2–3 runners-up, cite sources."

- [ ] **Step 2: Capture the structured finding**

Same shape, `category: 'non-claude-bp'`. Keep it strictly non-Claude.

- [ ] **Step 3: Verify the finding is reviewable**

Same check. No commit.

---

### Task 5: Synthesize verdicts + write REVIEW-QUEUE.md

**Files:**
- Modify: `docs/planning/REVIEW-QUEUE.md`

**Interfaces:**
- Consumes: the four `Finding`s from Tasks 1–4.
- Produces: 4 verdict rows + parked runners-up + a header methodology pointer. Task 6 consumes the set of rows whose verdict is `adopt`.

- [ ] **Step 1: Decide each verdict under the hybrid rubric**

For each of the 5 picks (1a, 1b, 2, 3 — note category 1 = two picks), apply the Global-Constraints rubric: `adopt` (useful now), `defer` (relevant-but-blocked), or `pass` (not a fit / not better than current / no strong candidate). Write down the one-line justification each row's Notes cell will carry.

- [ ] **Step 2: Add the methodology pointer to the header**

In `docs/planning/REVIEW-QUEUE.md`, after the `**Created**:` line (line 5), add:

```markdown
**Methodology**: see [`docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md`](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md) — the reusable "how we run Weekly Reviews" reference (relevance lens, depth, verdict rubric).
```

- [ ] **Step 3: Write the Plugins rows (2 rows) + Next-up**

Replace the `| _(none yet)_ | | | | |` placeholder row in the **§1 Plugins → Reviewed log** table with two real rows (columns: `Date | Item | Source | Verdict | Notes`). Format:

```markdown
| 2026-06-26 | <store pick name> | store: <listing URL> | <adopt\|pass\|defer> | <one-line justification> |
| 2026-06-26 | <wider pick name> | wider: <repo/list URL> | <adopt\|pass\|defer> | <one-line justification> |
```

Replace the §1 **Next-up** `- _(none yet)_` with the parked runners-up from Tasks 1–2 (one bullet each: `- <name> — <why parked / source>`), or leave `- _(none yet)_` if none worth parking.

- [ ] **Step 4: Write the Claude best-practice row (1 row) + Next-up**

Same edit in **§2 Claude best-practices**: one row (`Source` = the practice's source link), plus Next-up runners-up from Task 3.

- [ ] **Step 5: Write the Non-Claude best-practice row (1 row) + Next-up**

Same edit in **§3 Non-Claude AI best-practices**: one row, plus Next-up runners-up from Task 4.

- [ ] **Step 6: Verify row shape**

Re-read REVIEW-QUEUE.md. Confirm: exactly 4 data rows (2 + 1 + 1, plus the placeholder removed from each table that got a row), every row dated `2026-06-26`, every `Source` cell non-empty, every `Verdict` ∈ {adopt, pass, defer}, every `Notes` cell a one-liner. No commit yet (batched in Task 7).

---

### Task 6: File BACKLOG.md 🟤 entries for adopts (conditional)

**Files:**
- Modify: `docs/planning/BACKLOG.md` (only if ≥1 row in Task 5 was `adopt`)

**Interfaces:**
- Consumes: the `adopt` rows from Task 5.

- [ ] **Step 1: Branch on adopt count**

If Task 5 produced **zero** `adopt` rows, skip this task entirely (record "no adopts this week → no BACKLOG entries" in the closeout note) and proceed to Task 7. Otherwise continue.

- [ ] **Step 2: Insert the dated heading + entries**

At the top of the `## 🟤 Auto-Generated Tech Debt` section (immediately after line 205, before `### [2026-06-25] Group P3 …`), insert:

```markdown
### [2026-06-26] From: Weekly Reviews (week of June 22) — <N> adopt(s)

**Origin**: First run of the recurring Weekly Reviews batch (Group WR; see [REVIEW-QUEUE.md](REVIEW-QUEUE.md) + spec `2026-06-26-weekly-reviews-first-run-design.md`). Each item below is a category pick verdicted `adopt` under the hybrid project-fit lens — a trial/integration candidate for this project's Claude-Code dev workflow, not yet evaluated in-repo. Claude-surfaced.

- [ ] **Trial <pick name> (<category>)** — <what it is + concretely how it would help this project's solo-dev-with-Claude-Code Electron workflow>. Source: <URL>. Effort: <XS/S/M>. Affected: <files/config it would touch, or "evaluation only">.
```

One `- [ ]` bullet per adopt. Newest-date-first ordering puts this heading above the `[2026-06-25]` ones.

- [ ] **Step 3: Verify**

Re-read the inserted section. Confirm: one bullet per adopt row from Task 5, each with a source URL and an effort tag; heading date `2026-06-26`; placed at the top of the 🟤 section. No commit yet.

---

### Task 7: Check off WEEKLY.md boxes + commit

**Files:**
- Modify: `docs/planning/WEEKLY.md`

- [ ] **Step 1: Check off the Group WR boxes**

In `docs/planning/WEEKLY.md`, flip these `- [ ]` → `- [x]` (append a short `— DONE 2026-06-26` note to each, matching the file's existing style):
- Line 78 `**Plugins review (2 SP)**`
- Line 79 `**Claude best-practices (1 SP)**`
- Line 80 `**Non-Claude AI best-practices (1 SP)**`

- [ ] **Step 2: Check off the Thu/Fri schedule lines**

Flip:
- Line 137 `Weekly Reviews: Claude + non-Claude best-practices rows (start)` → `- [x]`
- Line 152 `Weekly Reviews: plugins ×2 (store + wider internet) …` → `- [x]`

(If line numbers have drifted from the doc edits, match by text.)

- [ ] **Step 3: Commit all doc edits**

```bash
git add docs/planning/REVIEW-QUEUE.md docs/planning/WEEKLY.md docs/superpowers/plans/2026-06-26-weekly-reviews-first-run.md
# add BACKLOG.md only if Task 6 ran:
git add docs/planning/BACKLOG.md 2>/dev/null
git commit -m "docs(reviews): Group WR Weekly Reviews first run — 5 verdicts, $(N) adopt(s)"
```

Use a concrete count in the message (e.g. "1 adopt", "0 adopts"). The pre-commit hook runs check-secrets → lint-staged (skips `.md`) → vitest (381 unit, must stay green); docs-only change should pass clean.

- [ ] **Step 4: Verify the commit**

Run `git show --stat HEAD`. Confirm only the intended docs changed and the commit message reflects the real adopt count.

---

## Closeout (after Task 7)

Not plan tasks, but the project's task-completion ritual (CLAUDE.md) applies at the end:
- This is ⚪ Overhead with **no code PR** (WEEKLY.md): the branch can merge to `main` directly or via a lightweight PR per the user's call at finish-time (use `finishing-a-development-branch`).
- Update the WEEKLY.md Summary Table Group WR status + DONE.md if the week's other groups are being closed out together.
- Capture any durable learning from the first run (e.g. methodology adjustments) into memory.

---

## Self-Review

**Spec coverage** (each spec section → task):
- Categories 1a/1b/2/3 → Tasks 1/2/3/4. ✅
- D1 hybrid lens → Global Constraints + Task 5 Step 1. ✅
- D2 deep-research per category → Tasks 1–4 each invoke the skill. ✅
- D3 recency / empty-logs → Global Constraints. ✅
- D4 adopt hands-off → Global Constraints + Task 6 (BACKLOG entry, no install). ✅
- Verdict rubric → Global Constraints + Task 5 Step 1. ✅
- Outputs: REVIEW-QUEUE rows + Next-up + header pointer → Task 5; BACKLOG adopts → Task 6; WEEKLY boxes → Task 7; commit → Task 7. ✅
- Scope guards (4 runs/4 rows, no installs, no-candidate fallback) → Global Constraints. ✅
- Verification (row-shape review) → Task 5 Step 6 / Task 6 Step 3 / Task 7 Step 4. ✅

**Placeholder scan:** The `<pick name>`, `<URL>`, `<N>` tokens are intentional fill-slots for runtime-determined research results (the candidates aren't knowable until Tasks 1–4 run) — they are accompanied by exact format + location + decision rubric, which is the most concrete a research-driven doc edit can be. No vague "add error handling"-style gaps. ✅

**Type consistency:** The `Finding` shape `{ category, topPick, runnersUp, draftVerdict, projectFitRationale, sources }` is defined identically across Tasks 1–4 and consumed in Task 5. Verdict vocabulary `{adopt, pass, defer}` is used consistently. ✅
