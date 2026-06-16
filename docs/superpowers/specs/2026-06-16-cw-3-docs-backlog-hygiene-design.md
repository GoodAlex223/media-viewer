# Group CW-3: Docs & Backlog Hygiene — Design Spec

**Date**: 2026-06-16
**Branch**: `cleanup/cw-3-docs-backlog-hygiene`
**Source**: WEEKLY.md (June 15–19 Cleanup Week), Group CW-3 — 🟤 Auto-Generated, 4 SP (Thursday slot)
**Status**: Approved

## Goal

Make the planning data trustworthy again. Three mechanical doc-hygiene tasks, shipped on one
branch / one PR:

1. Verify-and-flip stale BACKLOG checkboxes that are provably resolved but still unchecked, and
   recount the 🟤 pending-SP figure (it drives Cleanup-Week cadence).
2. Clear accumulated doc drift across CLAUDE.md, BACKLOG.md, docs/README.md, and one spec file.
3. Remove repo-root cruft (`docker init` scaffolding + a stray reserved-name `nul` file/line).

This is a **docs-and-config-only** change: **no production code** in any `*.js`, `index.html`,
`styles.css`, etc. is modified. Per the PR #46 learning, `/code-review` is a no-op on a docs-only
diff — ship with a manual review instead.

## The non-negotiable core: git-truth verification

Every checkbox flip and every "X already shipped" claim is gated on **actual git state**, never on
what a doc asserts. Concretely: `git log --oneline --all --grep=...`, `git show <sha>:<file>`,
`git log -S'<token>' -- <file>`. This is the hard lesson from the PR #37 incident — CLAUDE.md and
WEEKLY.md both claimed an abort-string was "normalized 2026-05-25" when that change only ever lived
on an unmerged branch; it was *not* on `main`. **The spec's candidate list below is a list of
suspects, not verdicts.** If git disproves a "known candidate," it stays unchecked and gets flagged.

## Scoping decisions (from brainstorming)

- **Sweep depth**: targeted + light scan — verify the named candidates against git, plus one quick
  pass over entries whose text says "shipped/resolved/✅" or cites a merged PR. **Not** an
  exhaustive walk of all ~203 unchecked items (far exceeds 2 SP).
- **Roadmap refresh**: explicitly **out of scope**. ROADMAP/MILESTONES/GOALS staleness is a separate
  strategic session, not folded into this docs-only PR.
- **Adjacent drift folded in** (all approved): `README.Docker.md` + the actual `nul` working-tree
  file; orphan docs/README.md link-refs; **and CW-4's `.gitignore` duplicate-line fix pulled
  forward** (since CW-3 already edits `.gitignore`).

---

## Task 1 — BACKLOG stale-checkbox verification sweep (2 SP) · 🟠 IMPORTANT

**Per-candidate method:**
1. Locate the entry in `docs/planning/BACKLOG.md`.
2. Verify resolution against **git** (find the commit that actually shipped it; confirm it is on
   `main`).
3. If provably resolved → flip `- [ ]` → `- [x]`, prepend a short
   `✅ Resolved <date> (<commit-sha>, <PR/Group>)` marker, **preserve the original entry text**
   (matches the existing resolved-entry style, e.g. the `[2026-06-07]` JXL streaming entry).
4. If **not** provably resolved → leave unchecked; note it in the PR/closeout (do not guess).
5. After all flips, **recount 🟤 pending SP** and record the new figure in WEEKLY.md Notes
   (the "🟤 tail remains after this week" note) + refresh the BACKLOG.md "Last Updated" header.

**Candidate list to verify** (spec's named set + light-scan):
- PR #36 abort-string normalization + design-spec-count items — claimed fixed in `853e1ee`.
  *(Extra scrutiny: this is the same family as the PR #37 trap; confirm `853e1ee` is on `main`.)*
- The two 🔵 [2026-05-03] CLIP extraction-UX items ("extraction starting" toast + toggle-on
  kickoff) — claimed shipped by PR #45 (Group C).
- "Pin Lucide CDN" — Group F (`@1.14.0` + SRI).
- "Double-init protection for `logger.js`" + "Unload CLIP model after extraction" — Group E.
- "CLIP-based similarity sorting" — Group D (2026-04-18).
- "Update `regression-checker.md` for FullscreenManager" — Group F.
- *light-scan*: any other entry whose body says "shipped/resolved/✅" or cites a merged PR yet is
  still `- [ ]`.

**Acceptance:** every flipped box cites a git-verified commit; any disproven candidate is left
unchecked and called out; the recounted 🟤 pending-SP figure is written into WEEKLY.md Notes.

---

## Task 2 — Doc one-liners bundle (1 SP)

**Each item is verified against the current file first** — several listed in WEEKLY.md may already
be done (e.g., the docs/README.md "Design Specs rows" for CLIP-silent-failure / TASK-024 / TASK-026
*already appear indexed*). An edit whose target is already correct is **skipped and logged**
"already done," not forced.

Confirmed-or-verify edits:

- **CLAUDE.md**
  - Wrap the `## Backlog Intake Rules` section in `<!-- MANUAL -->` … `<!-- /MANUAL -->` markers
    (PR #39 follow-up — protects it from auto-revision).
  - Add `backlog-structure` to the CLAUDE.md unit-test inventory list (PR #39 follow-up).
  - Kickoff doc-drift (PR #45 / deferred `revise-claude-md`): the
    `kickoffBackgroundExtractionIfEnabled` test block says 8 cases — update to the actual count
    (10), note `makeCtx` defaults and the empty-folder guard. *(Verify the live count in
    `tests/media-viewer-utils.test.js` before writing a number.)*
  - Git Insights tournament hash swap: UI integration is `acfc3b6`, **not** `6c73f9f` (which is the
    IPC/TournamentManager commit). *(Already git-verified 2026-06-11; re-confirm on apply.)*
  - Correct `.sort_cache_clip.json` → unified `.sort_cache.json` key `'clip'` wherever it appears in
    CLAUDE.md.
- **BACKLOG.md**
  - Retro `[possible-dup-of: ...]` tag on the kept `waitForTimeout` entry (PR #39 follow-up).
- **docs/README.md** (only the genuinely-missing rows, per per-item verification)
  - Design-Specs / Archived-Plans rows for CLIP-silent-failure (PR #34), TASK-024 (PR #22),
    TASK-026 (PR #24) — **add only if verification shows them absent**.
  - **Orphan link-refs (approved adjacent drift):** `[Tournament Mode Plan]` link-ref is defined
    (line ~78) with no Archived-Plans table row → add the row; `[TASK-028 CLIP Semantic Features]`
    link-ref is defined (line ~132) with no Design-Specs table row → add the row.
- **Spec-text fix:** the `.sort_cache_clip.json` → `.sort_cache.json` correction is applied to
  **both** the relevant spec file under `docs/superpowers/specs/` **and** CLAUDE.md (wherever the
  wrong filename appears).

**Acceptance:** every applied edit is needed (verified), every skipped edit is logged as already
done, and no edit introduces a claim that isn't true on `main`.

---

## Task 3 — Repo-root cruft removal (1 SP)

- **Docker scaffolding**: `git rm` `Dockerfile`, `compose.yaml`, `.dockerignore`, **and
  `README.Docker.md`** (the unlisted fourth file from the same `docker init`). Gate on a reference
  grep first — `git grep -i docker`, check `package.json` scripts — to confirm nothing depends on
  them. *(Spike result expected: zero references; the scaffolding is unused.)*
- **`nul`**: delete the `.gitignore` **line 2** (`nul`) **and** the actual reserved-name `nul`
  file in the working tree. Windows cannot `rm nul` (reserved device name) — use
  `Remove-Item -LiteralPath '\\?\<abs-path>\nul'` (fallback `cmd /c del \\.\nul`). Verify the file
  is gone and `git status` is clean afterward. *(The `nul` file is gitignored, so it is untracked —
  removing the ignore line would otherwise surface it in `git status`; removing both keeps the tree
  clean.)*
- **`.gitignore` duplicate (pulled from CW-4)**: remove the duplicate `!.claude/agents/` at line
  139 (lines 138–139 are identical).

**Acceptance:** all four docker files removed with no dangling references; the `nul` file and its
ignore line are gone; the `.gitignore` `!.claude/agents/` line appears exactly once; `git status`
clean.

---

## Verification

- **No production-code changes** → unit/E2E are a non-event. DONE.md entry records
  **"E2E: skipped (no JS changes)"** per the reporting convention; unit-test count unchanged (326).
- Husky pre-commit still runs Prettier on staged `*.md` / `*.json` (and ESLint on staged JS — none
  here). Allow the hook to format; do not bypass it.
- Manual review of the rendered diff (docs-only): confirm no broken markdown links, no half-flipped
  checkboxes, the 🟤 recount is present, and the cruft removal leaves `git status` clean.

## Ship & closeout bookkeeping

- Branch `cleanup/cw-3-docs-backlog-hygiene` → one PR (one-PR-per-CW-group rule). Manual review in
  lieu of `/code-review`.
- At closeout: check off each constituent BACKLOG entry individually (every flip cites its commit);
  update WEEKLY.md (CW-3 → Complete + the recounted 🟤 figure in Notes); add a DONE.md entry; add a
  TODO.md completion comment.
- **CW-4 boundary shift (record explicitly):** CW-4 (Friday) originally owned both the pre-archive
  checklist template block **and** the `.gitignore` duplicate-line fix. The `.gitignore` fix is done
  here in CW-3, so **CW-4 now owns only the pre-archive checklist block**, and **CW-4's branch must
  not touch `.gitignore`** (avoids a same-file collision). Note this in WEEKLY.md.

## Out of scope

- **Roadmap/Milestones/Goals refresh** — separate strategic session (user decision); not in this
  branch.
- **Exhaustive sweep** of all ~203 unchecked BACKLOG items — only the targeted candidate set + light
  scan; the rest of the 🟤 tail is left for the next Cleanup Week (the recount quantifies it).
- **Any production-code change** — if a doc edit reveals a real product bug or an entry that is
  *almost* resolved but has a genuine code gap, surface it to the user rather than fixing it under a
  docs task.
- **The pre-archive checklist template block and gitleaks/secret-guard** — those are CW-4 (Friday).
