# Group CW-D: Docs & CLAUDE.md Hygiene — Design Spec

**Date**: 2026-07-03
**Branch**: `docs/cw-d-claude-md-hygiene`
**Source**: 🟤 Auto-Generated (Cleanup Week, July 6–10 plan — Group CW-D)
**Type**: docs-only consolidation pass (`revise-claude-md` class). Manual review, **no `/code-review` fan-out** per the [2026-06-29] docs-only convention.
**Total SP**: 4

## Purpose

A single consolidation pass clearing five deferred `revise-claude-md` / doc-drift backlog
items accumulated across the June sprint (PRs #52–#59). Scheduled deliberately **after
Group CW-T merged (PR #59, `ae9588d`, 2026-07-03)** so the tournament-persistence and
undo documentation reflects **post-fix** behavior, not the stale pre-CW-T wording captured
when the backlog items were filed. Mirrors Group CW-3 from the first Cleanup Week.

No code behavior changes. Output is documentation only.

## Decisions (settled during brainstorming)

- **D1 — CLAUDE.md maintenance mode = manual-only** (item 5). The AUTO-MANAGED/MANUAL/END
  markers stripped in PR #52 stay stripped; the file is durable-rules prose maintained by
  hand. `revise-claude-md` / `claude-md-improver` edit prose directly (no section-scoped
  auto-rewrites). This is documented in the file, not reverted.
- **D2 — line-ref scope = CLAUDE.md note only** (item 3). Fix CLAUDE.md's Data-Structures
  note (mark MinHeap/VPTree worker-only). Do **not** sweep the stale `media-viewer.js:~NNNN`
  refs (shifted ~925 lines by PR1's dead-code removal) that live in dated, historical
  BACKLOG/TODO entries — rewriting refs inside settled records is churn with little payoff.

## Verification gate (applies to every edit)

Before writing any CLAUDE.md line, **verify the claim against current post-CW-T code**
(`media-viewer.js`, `tournament.js`, `tournament-engine.js`). The pre-CW-T backlog wording
for items 1 & 2 predates the O(1) inverse-delta undo + `showTournamentPairFast` rework, so
it must be **adapted, not pasted**. If a claim turns out to be false in current code, flag
it and omit rather than document a fiction — a documented fiction is worse than an omission.

Sites to read/grep before writing:
- `loadFolder()` — confirm tournament exit on both empty/non-empty branches (nulls `tournament.engine`).
- `handleTournamentUndo` — confirm the two paths (`engine.undo()` vs `actionType === 'special'`).
- `moveToSpecialFolder` (tournament branch) — special-move removeFile is untracked by `engine.undo()`.
- `TournamentEngine.undo()` / `removeFile(file, {trackUndo})` — confirm `filesSnapshot` kept
  only at the auto-prune `-1` site; special path stays untracked (two-stack separation).
- `_schedulePersist` / `_drain` / `flush` / `cancelPending` — debounced single-flight persist.
- `deserialize` / `version` — `.tournament_state.json` `version:2`, O(n), history-free; v1 still resumes.
- `reconcileWithFiles` / `_enterResumedTournamentUI` — reconcile-on-every-entry (idempotent).
- `showTournamentPairFast` — CW-T fast-path render (wrapper reuse).
- CLAUDE.md line ~129 Data-Structures — MinHeap/VPTree + `calculateCosineDistance` dual-location.

## Per-item edit plan

### Item 1 — Fold 3 tournament gotchas into CLAUDE.md *Active gotchas*
Source: BACKLOG [2026-06-25] branch-salvage (commit `7e71bb3`, no longer reachable).
Add three concise gotchas (verified against current code, adapted to post-CW-T mechanics):
1. **Tournament mode is folder-scoped** — `loadFolder()` exits tournament mode on both the
   empty and non-empty branches (nulls `tournament.engine`), so switching folders always
   returns to single mode (mirrors the compare-mode reset).
2. **`handleTournamentUndo` has two paths** — default `engine.undo()` (post-CW-T: O(1)
   inverse-delta) vs. the special-move branch (`lastMove.actionType === 'special'`), where
   `engine.removeFile` is **not** `engine.undo()`-tracked, so undo manually restores the file
   on disk (`moveFile` IPC), re-adds to `mediaFiles` + `engine.files`,
   `restoreFeatureCachesFromHistory`, re-persists, re-renders; on error pushes `lastMove` back.
3. **`engine.files` vs `strategy.files` diverge after `removeFile()`** — `engine.files` is
   authoritative for `getTierBreakdown()` / `handleApply()`; undo entries carry `filesSnapshot`
   (recorded `{trackUndo:true}` **only** at the auto-prune `-1` removeFile site) so tier counts
   survive a removeFile→undo, because `strategy.serialize()` does not capture engine-level
   files removed between picks. The special-move path is intentionally left untracked so the
   renderer special-undo stack and `engine.undo()` stack do not desync.

### Item 2 — Document tournament debounced persistence + session-only undo + v2 payload
Source: BACKLOG [2026-06-24] Group P2.
Add to CLAUDE.md *Cache Management* (tournament sub-note):
- Trailing-edge **debounced single-flight** persist (`_schedulePersist` → `_drain`; `flush()`
  forces a durable write; `cancelPending()` drops a queued write).
- **Undo is session-only** — no longer persisted; capped at 100 in-memory picks.
- `.tournament_state.json` is now **`version:2`** — O(n), history-free (v1 still resumes).
- State write is **atomic** (temp + rename).
- Structural-mutation persists are debounced by design; a crash inside the debounce window
  **self-heals via `reconcileWithFiles` on every tournament entry** (idempotent, via
  `_enterResumedTournamentUI`).
- CW-T fast-path render: `showTournamentPairFast` reuses the compare wrappers instead of a
  full `showCompareMedia` DOM teardown per pair.

### Item 3 — CLAUDE.md MinHeap/VPTree worker-only note
Source: BACKLOG [2026-06-19] PR1 dead-code removal.
Edit the *Detected Patterns → Data Structures* note (~line 129): note MinHeap/VPTree now live
**only in `sorting-worker.js`** (the renderer's own copies + the three `sortMediaBySimilarity*`
renderer methods were deleted in PR #54/PR1). Keep the still-true statement that
`calculateCosineDistance` exists in both `sorting-worker.js` and the `MediaViewer` class
(renderer copy returns `1` on null/mismatch). Per D2, no planning-doc line-ref sweep.

### Item 4 — Correct "PR2/PR3 = raw-speed continuation" framing
Source: BACKLOG [2026-06-21] PR #54 review-reception.
Files: `docs/planning/DONE.md` (lines ~242, ~265), `docs/planning/TODO.md` (line ~36).
Replace the "raw-speed continuation" framing with the precise per-phase cost map:
- PR2 (hash off-thread) removes the **cold-cache perceptual-hashing** wait — **hash sorts only**.
- PR3 (incremental cache-load) removes the ~40s **feature-cache-load** wait.
- **Neither PR2 nor PR3 touches the O(n·K) neighbor-graph build** (K≈1,550 @ 24k) — that is the
  visual-similarity sort's remaining wall-time floor, moved only by workstream #7 (parallelize
  `findKNearest`) or relaxing the quality-lock to a bounded K-cap (user-declined in PR1).
- The **AI-prediction sort has no graph build** (O(n) scoring + O(n log n) sort) so it is fully
  addressed by PR3 + PR1's progress; the graph-build floor is specific to vptree/mst/clip
  *similarity* sorts.

### Item 5 — Document manual-only CLAUDE.md maintenance mode
Source: BACKLOG [2026-06-18] PR #52. Per D1.
Add one concise note to CLAUDE.md stating maintenance is **manual-only**: no AUTO-MANAGED /
MANUAL markers (deliberately stripped in PR #52); `revise-claude-md` / `claude-md-improver`
edit the prose directly rather than keying on section markers. Placement: a short line in the
file's header/overview area (kept to one line to avoid meta-clutter in a durable-rules file).

## Success criteria

- All 5 backlog items resolvable to ✅ (checked off in BACKLOG.md + WEEKLY.md).
- Every new/changed CLAUDE.md line traceable to a **verified** current-code fact.
- No code behavior change; no test file touched.
- Prettier sanity-checked on touched `*.md` (CLAUDE.md itself is Prettier-ignored per config).
- Docs read consistently — no contradiction between the new tournament notes and existing
  tournament gotchas already in CLAUDE.md.

## Non-goals

- Re-introducing AUTO-MANAGED markers (rejected — D1).
- Sweeping historical `media-viewer.js:~NNNN` line-refs in TODO/BACKLOG (rejected — D2).
- Any doc-drift item not in the 5 listed (e.g. the still-open [2026-06-17] check-secrets test
  items, [2026-06-20] progress-card items — those belong to CW-V / future passes).
- Any code, test, or config change.

## Close-out

Docs-only → manual review (no `/code-review` fan-out). On approval: check off the 5 BACKLOG
entries + the WEEKLY Summary-Table status (`✅ PR #N`) and the Wed/Thu Daily-Schedule entries,
archive this spec's plan, transition CW-D → DONE.md, commit doc changes, capture any durable
learnings to memory.
