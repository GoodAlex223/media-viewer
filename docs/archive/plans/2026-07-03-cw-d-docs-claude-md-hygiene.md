# Group CW-D: Docs & CLAUDE.md Hygiene Implementation Plan

> ✅ **COMPLETE 2026-07-03** — All 5 edit tasks (Tasks 1–5) implemented, verified against current post-CW-T code, and committed on branch `docs/cw-d-claude-md-hygiene` (`1dee056`, `c622338`, `4d15c39`, `318ab27`, `46ebec3`). Shipped via **PR #60** (docs-only, manual review). 411 unit tests green throughout. Task 6 (closeout) executed on the same branch per user choice. Spec: [../specs/2026-07-03-cw-d-docs-claude-md-hygiene-design.md](../specs/2026-07-03-cw-d-docs-claude-md-hygiene-design.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear five deferred `revise-claude-md` / doc-drift backlog items by updating CLAUDE.md, DONE.md, and TODO.md to reflect current post-CW-T behavior — documentation only, no code change.

**Architecture:** Verify-then-edit sequential pass. Each edit is gated by a verification step that greps/reads the real method in current code before any claim is written; if code contradicts the draft, the executor corrects the draft rather than documenting a fiction. All four CLAUDE.md edits touch different sections of the one file (no collision); item 4 touches two planning docs. One branch (`docs/cw-d-claude-md-hygiene`), separate commit per task, docs-only PR, manual review.

**Tech Stack:** Markdown only. No test framework applies to doc content — the "test" per task is the verification-against-code gate + a post-edit consistency re-read. Spec: [docs/superpowers/specs/2026-07-03-cw-d-docs-claude-md-hygiene-design.md](../specs/2026-07-03-cw-d-docs-claude-md-hygiene-design.md).

## Global Constraints

- **English only**, prose style matches existing CLAUDE.md (terse, gotcha-per-line, backtick code refs).
- **Verify before writing** — every documented claim must be literally true in current `media-viewer.js` / `tournament.js` / `tournament-engine.js` / `sorting-worker.js`. Flag-and-omit beats documenting a fiction.
- **No code / test / config change.** No `*.js`, no `*.json`, no test file touched.
- **CLAUDE.md is Prettier-ignored** (per `.prettierignore` / config) — do not expect `format:check` to cover it; hand-check line style. DONE.md/TODO.md are also under `docs/` which Prettier ignores.
- **Manual review only** — docs-only per the [2026-06-29] convention; do NOT run `/code-review`.
- **D1**: CLAUDE.md maintenance is manual-only; do not re-introduce AUTO-MANAGED/MANUAL markers.
- **D2**: do NOT sweep historical `media-viewer.js:~NNNN` line-refs in TODO/BACKLOG.
- **Commit trailer**: end each commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Fold 3 tournament gotchas into CLAUDE.md *Active gotchas*

**Files:**
- Modify: `CLAUDE.md` (Git Insights → **Active gotchas** bulleted list)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: 3 new gotcha bullets. Later tasks must not contradict them.

- [ ] **Step 1: Verify each gotcha against current code.** Read these sites and confirm the claim holds post-CW-T:
  - `grep -n "loadFolder" media-viewer.js` → confirm tournament mode is exited (nulls `tournament.engine`) on both the empty and non-empty branches.
  - `grep -n "handleTournamentUndo" media-viewer.js` → confirm two paths: default `engine.undo()` vs `lastMove.actionType === 'special'` (special branch does manual disk restore via `moveFile` IPC + re-add to `mediaFiles`/`engine.files` + `restoreFeatureCachesFromHistory` + re-persist + re-render; pushes `lastMove` back on error).
  - In `tournament-engine.js`, read `undo()` + `removeFile(file, opts)` → confirm `filesSnapshot` is captured on undo entries and that `removeFile` is called with `{trackUndo:true}` **only** at the auto-prune `-1` site (special-move removal stays untracked to keep the renderer special-undo stack and `engine.undo()` stack from desyncing).

  Expected: all three hold. If any differs, adjust that bullet's wording to match the code before Step 2.

- [ ] **Step 2: Add the 3 bullets** to the end of the **Active gotchas** list in `CLAUDE.md` (Read the file first to match the exact list indentation). Draft text (adjust only if Step 1 found a discrepancy):

```markdown
- Tournament mode is **folder-scoped** — `loadFolder()` exits tournament mode (nulls `tournament.engine`) on both its empty and non-empty branches, so switching folders always drops back to single mode (mirrors the compare-mode reset).
- `handleTournamentUndo` has **two paths**: default `engine.undo()` (O(1) inverse-delta since CW-T) vs the special-move branch (`lastMove.actionType === 'special'`). The special path's `engine.removeFile` is NOT `engine.undo()`-tracked, so undo manually restores the file on disk (`moveFile` IPC), re-adds it to `mediaFiles` + `engine.files`, calls `restoreFeatureCachesFromHistory`, re-persists, re-renders, and on error pushes `lastMove` back.
- `engine.files` vs `strategy.files` **diverge after `removeFile()`** — `engine.files` is authoritative for `getTierBreakdown()`/`handleApply()`. Undo entries carry `filesSnapshot` (recorded via `removeFile(file, {trackUndo:true})` ONLY at the `engine.undo()`-reversed auto-prune `-1` site) so tier counts survive a removeFile→undo; `strategy.serialize()` alone does not capture engine-level files removed between picks. The special-move removal is deliberately left untracked so the two undo stacks stay in sync.
```

- [ ] **Step 3: Consistency re-read.** Re-read the edited **Active gotchas** section top to bottom. Confirm the 3 new bullets do not duplicate or contradict the existing tournament gotcha ("Tournament Escape + mode-selector clicks both route through `switchMode('single')`…"). No overlap expected (that one is about the leave-prompt; these are about folder-scope, undo paths, and file divergence).

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): fold 3 tournament gotchas into Active gotchas (CW-D item 1)

Folder-scoped exit, two-path handleTournamentUndo, engine.files vs
strategy.files divergence — salvaged from deleted-branch commit 7e71bb3,
verified + adapted to post-CW-T O(1) inverse-delta undo.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Document tournament debounced persistence + session-only undo + v2 payload

**Files:**
- Modify: `CLAUDE.md` (Detected Patterns → **Cache Management** bullet list)

**Interfaces:**
- Consumes: Task 1's gotchas (must stay consistent — same undo/removeFile mechanics).
- Produces: a tournament-persistence sub-note under Cache Management.

- [ ] **Step 1: Verify persistence mechanics against current code.** Confirm:
  - `grep -n "_schedulePersist\|_drain\|flush\|cancelPending" tournament.js media-viewer.js` → trailing-edge debounced single-flight write exists; `flush()` forces a durable write; `cancelPending()` drops a queued write.
  - `grep -n "version" tournament.js tournament-engine.js` and read `deserialize` → `.tournament_state.json` is `version: 2`, O(n), history-free; a v1 payload still resumes.
  - Confirm undo is session-only (history no longer persisted) and capped at 100 (`grep -n "UNDO_HISTORY_CAP\|100" tournament-engine.js`).
  - Confirm the write is atomic (temp file + rename): `grep -n "rename\|\.tmp\|writeTournament" main.js tournament.js`.
  - `grep -n "reconcileWithFiles\|_enterResumedTournamentUI" tournament.js media-viewer.js` → reconciliation runs on every tournament entry (idempotent), self-healing a debounce-window loss.
  - `grep -n "showTournamentPairFast" media-viewer.js` → CW-T fast-path render (reuses compare wrappers).

  Expected: all hold. Correct any drifted detail before Step 2.

- [ ] **Step 2: Add a tournament-persistence bullet** to the **Cache Management** list in `CLAUDE.md` (Read first; match the existing sub-bullet style — a bold lead-in then prose). Draft text (adjust per Step 1):

```markdown
- Tournament persistence: `.tournament_state.json` per source folder, now `version: 2` — O(n), **history-free** (undo is session-only, in-memory, capped at 100 picks; v1 payloads still resume). Writes are trailing-edge **debounced single-flight** (`_schedulePersist` → `_drain`; `flush()` forces a durable write e.g. Save & leave; `cancelPending()` drops a queued write e.g. Discard) and **atomic** (temp + rename). Structural-mutation writes (reconcile prune, missing-file removal, special-move removal) are debounced by design — a crash inside the debounce window self-heals because `reconcileWithFiles` runs on **every** tournament entry (idempotent, via `_enterResumedTournamentUI`). Per-pick render uses `showTournamentPairFast` (reuses the compare wrappers) instead of a full `showCompareMedia` teardown.
```

- [ ] **Step 3: Consistency re-read.** Re-read the Cache Management list. Confirm the new bullet does not contradict the existing bulk-rated / sort-cache / JXL bullets and that the undo/removeFile mechanics agree with Task 1.

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): document tournament debounced persistence + v2 payload (CW-D item 2)

Debounced single-flight (_schedulePersist/_drain/flush/cancelPending),
session-only undo (cap 100), version:2 history-free O(n) state, atomic
temp+rename, reconcile-on-every-entry self-heal, showTournamentPairFast.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mark MinHeap/VPTree worker-only in CLAUDE.md Data Structures

**Files:**
- Modify: `CLAUDE.md` (Detected Patterns → **Data Structures**, ~line 129)

**Interfaces:**
- Consumes: nothing.
- Produces: corrected Data-Structures note.

- [ ] **Step 1: Verify the renderer no longer defines them.** Run:
  - `grep -n "class MinHeap\|class VPTree" media-viewer.js sorting-worker.js` → expect matches ONLY in `sorting-worker.js` (renderer copies deleted in PR #54/PR1).
  - `grep -n "calculateCosineDistance" media-viewer.js sorting-worker.js` → confirm it still exists in BOTH (the dual-location note stays true).

  Expected: MinHeap/VPTree worker-only; `calculateCosineDistance` still dual. If a MinHeap/VPTree class is still in the renderer, STOP and report (the premise is false).

- [ ] **Step 2: Edit the Data Structures note.** Read `CLAUDE.md` ~line 129, then update the sentence so it states MinHeap/VPTree now live only in `sorting-worker.js`. Draft replacement for the opening of that note (keep the rest of the sentence about `calculateCosineDistance` and cosine distance intact):

```markdown
**Data Structures**: MinHeap (priority queue) and VPTree (nearest neighbor) now live ONLY in `sorting-worker.js` (the renderer's own copies + the `sortMediaBySimilarity*` renderer methods were deleted in PR #54/PR1 — sorting is worker-only). Perceptual hashing (image similarity), cosine distance for CLIP (`1 - dot(a,b)` on unit-normalized 512-dim). `calculateCosineDistance` exists in both `sorting-worker.js` and the `MediaViewer` class — the renderer copy returns `1` (not `Infinity`) on null/mismatched input (cosine is bounded [0,2]; 1 = "no signal"). Shared-utility extraction tracked in BACKLOG.
```

- [ ] **Step 3: Cross-check the Architecture tree.** Read the `sorting-worker.js` line in the Architecture file-tree (~line 39). It already says the worker "exports MinHeap, VPTree, …" — that is still correct (no edit needed). Confirm no other CLAUDE.md line claims the renderer has MinHeap/VPTree.

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): note MinHeap/VPTree are worker-only post PR #54 (CW-D item 3)

Renderer copies + sortMediaBySimilarity* methods removed in PR1; Data
Structures note updated. calculateCosineDistance dual-location note kept
(still true). No planning-doc line-ref sweep (D2).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Correct "PR2/PR3 = raw-speed" framing in DONE.md + TODO.md

**Files:**
- Modify: `docs/planning/DONE.md` (lines ~242, ~265)
- Modify: `docs/planning/TODO.md` (line ~36 NOTE comment)

**Interfaces:**
- Consumes: nothing (planning-doc framing only — no code claim to verify beyond the cost map, which is documented in BACKLOG [2026-06-21]).
- Produces: precise per-phase cost map wording.

- [ ] **Step 1: Confirm the cost map** from BACKLOG [2026-06-21] (already read): PR2 = cold-cache hashing wait (hash sorts only); PR3 = ~40s feature-cache-load wait; NEITHER touches the O(n·K) neighbor-graph build (K≈1,550 @ 24k), which is the visual-similarity floor moved only by #7 (parallel build) or a relaxed quality-lock (K-cap); AI-prediction sort has no graph build (fully addressed by PR3 + PR1). No code grep needed — this is a framing correction.

- [ ] **Step 2: Edit DONE.md line ~242.** Read the file, then replace:

```
  Raw-speed lives in PR2/PR3 + deferred #7.
```

with:

```
  PR2 (hash off-thread) removes the cold-cache hashing wait (hash sorts only) and PR3 removes the ~40s
  cache-load wait, but NEITHER touches the O(n·K) graph-build floor — that moves only via #7 (parallel
  build) or relaxing the quality-lock (K-cap). The AI-prediction sort has no graph build and is fully
  addressed by PR3 + PR1.
```

- [ ] **Step 3: Edit DONE.md line ~265.** Replace:

```
PR2 (hash off-thread) + PR3 (incremental cache-load) remain for the full P1 win.
```

with:

```
PR2 (hash off-thread, hash sorts only) + PR3 (incremental cache-load, ~40s) remain — they remove the
hashing + cache-load waits but NOT the O(n·K) neighbor-graph-build floor (that needs #7 or a K-cap);
the AI-prediction sort has no graph build and is already fully addressed by PR3 + PR1.
```

- [ ] **Step 4: Edit TODO.md line ~36.** Read the file, then within the NOTE comment replace the fragment:

```
raw-speed wins are PR2/PR3 (+ deferred #7 parallel build)
```

with:

```
PR2/PR3 remove the hashing + cache-load waits but NOT the O(n·K) neighbor-graph-build floor (moved only by #7 parallel build or a relaxed quality-lock K-cap); the AI-prediction sort has no graph build and is fully addressed by PR3 + PR1
```

- [ ] **Step 5: Consistency re-read.** Re-read all three edited spots. Confirm they now tell the same per-phase story and none still calls PR2/PR3 the "raw-speed continuation/win" without the graph-build caveat.

- [ ] **Step 6: Commit.**

```bash
git add docs/planning/DONE.md docs/planning/TODO.md
git commit -m "docs(planning): correct PR2/PR3 raw-speed framing to per-phase cost map (CW-D item 4)

PR2/PR3 remove hashing + cache-load waits but NOT the O(n·K) graph-build
floor; AI-prediction sort has no graph build (fully addressed by PR3+PR1).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Document manual-only CLAUDE.md maintenance mode

**Files:**
- Modify: `CLAUDE.md` (new short **Maintenance** footer note)

**Interfaces:**
- Consumes: D1.
- Produces: a one-line maintenance-mode statement.

- [ ] **Step 1: Confirm no markers exist.** `grep -n "AUTO-MANAGED\|<!-- MANUAL\|END " CLAUDE.md` → expect 0 hits (already stripped in PR #52). If any marker remains, STOP and report.

- [ ] **Step 2: Add a short Maintenance note** at the very end of `CLAUDE.md` (Read the file to confirm it ends with the `## Best Practices` section, then append after it). Keep it to a single line to avoid meta-clutter in a durable-rules file:

```markdown

## Maintenance

Manual-only. This file carries no `AUTO-MANAGED` / `MANUAL` section markers (deliberately stripped in PR #52) — `revise-claude-md` / `claude-md-improver` edit the prose directly rather than keying on markers. Keep it durable-rules-only; audit quarterly or when it crosses ~200 lines.
```

- [ ] **Step 3: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): document manual-only maintenance mode (CW-D item 5)

Markers stripped in PR #52 stay stripped (D1); revise-claude-md edits prose
directly. Adds a one-line Maintenance footer.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Close-out — check off backlog/weekly, archive, transition

**Files:**
- Modify: `docs/planning/BACKLOG.md` (check off the 5 CW-D items)
- Modify: `docs/planning/WEEKLY.md` (Summary-Table status + Wed/Thu Daily-Schedule entries + the 5 group checkboxes)
- Modify: `docs/planning/DONE.md` (add a CW-D closeout entry)
- Modify: `docs/planning/TODO.md` (remove/annotate any CW-D staging entry if present)
- Move: `docs/superpowers/plans/2026-07-03-cw-d-docs-claude-md-hygiene.md` → `docs/archive/plans/` (per the archive convention)

**Interfaces:**
- Consumes: Tasks 1–5 complete.
- Produces: closed-out planning state. (This task runs at merge/approval time, not before the PR — see note.)

- [ ] **Step 1: Check off the 5 BACKLOG items.** In `docs/planning/BACKLOG.md`, flip each of the 5 CW-D source entries `- [ ]` → `- [x]` with a `✅ Resolved 2026-07-03 (Group CW-D)` note:
  - [2026-06-25] "Fold 3 still-accurate tournament gotchas into CLAUDE.md" (line ~301)
  - [2026-06-24] "Document tournament debounced single-flight persistence … in CLAUDE.md" (line ~310)
  - [2026-06-19] "CLAUDE.md / docs drift from PR1 dead-code removal" (line ~332)
  - [2026-06-21] "Correct the 'PR2/PR3 = raw-speed continuation' framing" (line ~317)
  - [2026-06-18] "Decide CLAUDE.md maintenance mode now that all AUTO-MANAGED / MANUAL markers are stripped" (line ~338) — annotate the decision: **manual-only** (D1).

- [ ] **Step 2: Update WEEKLY.md.** Check off the 5 Group CW-D task checkboxes (lines ~47–51), the Wed/Thu Daily-Schedule CW-D entries (lines ~126, ~141), and set the Summary-Table CW-D **Status** (line ~178) to `✅ PR #N` (the real PR number once opened/merged).

- [ ] **Step 3: Add a DONE.md entry** summarizing CW-D (the 5 items, the 2 decisions, files touched, PR link, plan-archive link).

- [ ] **Step 4: Archive the plan.** `git mv docs/superpowers/plans/2026-07-03-cw-d-docs-claude-md-hygiene.md docs/archive/plans/` and mark it complete at the top.

- [ ] **Step 5: Commit the doc/planning changes.**

```bash
git add docs/planning/ docs/archive/plans/ docs/superpowers/
git commit -m "docs(closeout): Group CW-D — check off 5 items, archive plan, transition to DONE

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Note:** Task 6 is the closeout ritual and runs **after** the PR is approved/merged (WEEKLY status needs the real PR #). During implementation, stop after Task 5, run the review/PR flow, then return here.

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Item 1 → Task 1. Item 2 → Task 2. Item 3 → Task 3. Item 4 → Task 4. Item 5 → Task 5.
- D1 (manual-only) → Task 5. D2 (no line-ref sweep) → Task 3 Step 4 + Global Constraints.
- Verification gate → Step 1 of Tasks 1, 2, 3, 5 (Task 4 is framing-only, no code claim).
- Close-out → Task 6. Non-goals → Global Constraints + Task 3 (no sweep), Task 5 (no markers).
- No gaps.

**2. Placeholder scan** — no "TBD"/"add error handling"/"similar to Task N". Every edit step has concrete draft text. The only intentional variable is the PR number in Task 6 Step 2 (`PR #N`), which cannot exist until the PR is opened — flagged inline, not a placeholder.

**3. Type/name consistency** — method/field names used across tasks are consistent and match the codebase vocabulary: `engine.files`/`strategy.files`, `handleTournamentUndo`, `removeFile(file, {trackUndo:true})`, `filesSnapshot`, `_schedulePersist`/`_drain`/`flush`/`cancelPending`, `reconcileWithFiles`/`_enterResumedTournamentUI`, `showTournamentPairFast`, `calculateCosineDistance`. Task 2 undo mechanics agree with Task 1. No name drift.
