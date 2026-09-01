# G3 Docs & Process Guardrails — Implementation Plan

**Task Reference**: WEEKLY.md Aug 31–Sep 4 § G3 (🟤 + 1 🟡 folded, 6 SP) ← BACKLOG 🟤 `### [2026-08-27] From: G5 closeout` ×2, `### [2026-08-27] From: G4 closeout` ×4, `### [2026-07-04] PR #60` ×1, `### [2026-07-11] PR #63` ×1, three one-off index backfills, + 🟡 `### [2026-07-02] Vitest v4 full-suite worker flake`
**Created**: 2026-09-02
**Status**: In Progress
**Last Updated**: 2026-09-02

**Goal:** Replace two chronic manual-checklist failures with automation, clear the residue they left behind, and stop the local verification loop from costing a retry.

**Architecture:** One new dependency-free Node script in the established `scripts/` house pattern (pure functions + thin CLI, unit-tested) guards `docs/README.md` in **both** directions — every permanent plan/spec file has a link, and every link target resolves. The remaining five items are configuration and documentation edits with no runtime surface.

**Tech Stack:** Node CJS (`scripts/`), Husky hooks, Vitest (unit), Markdown docs, VS Code workspace settings.

**Spec:** None — brainstormed as a **bounded** change (design approved in-session 2026-09-02). Six independent items, each a well-scoped edit to code or docs that already exists.

## Global Constraints

- Branch: `g3-docs-process-guardrails`. **No PR** — push only (`git push -u origin g3-docs-process-guardrails`).
- **Every file change must go through the Edit/Write tools, never Bash heredoc/sed.** WEEKLY names this group the `dead-rules-audit` trial vehicle; the plugin's `PostToolUse` matcher is `Edit|MultiEdit|Write`, so Bash-authored edits are invisible to it and Friday's scorecard would read "compliant" having observed nothing. Bash stays available for reads, searches, and running tests.
- Prettier: tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, bracketSpacing, arrowParens=always, endOfLine=lf. `docs/` and `*.md` are `.prettierignore`d — do not reformat them.
- Unit baseline: **556 passing / 17 files** (`npx vitest run --no-file-parallelism`, verified 2026-09-02, 8.22s). The pre-commit hook runs the full suite and blocks on failure.
- Dependency-free: `scripts/` may use only Node built-ins (matches `check-secrets.js` / `check-e2e-needed.js`).
- Mutation-verify every new guard test: temporarily break the implementation, watch the test fail, restore.
- Stage docs by explicit path, never `git add -A` (editor format-on-save rewrites Markdown — the defect Task 4 exists to stop).

## Measured Corrections to the Source Entries

Recorded here because three of them change what the work is, and the entries they came from are frozen:

| Entry claims | Measured 2026-09-02 |
| --- | --- |
| "22 files unindexed" (counted 2026-08-29) | **27** as the finished guard counts them (24 after the dedup below) |
| Guard covers `superpowers/specs/` + `archive/plans/` | A **third** dir existed, `docs/superpowers/plans/` (3 files), named in neither the BACKLOG entry nor WEEKLY — it held **stale pre-completion duplicates** of three archived plans |
| (not stated) | `docs/README.md` held **1 broken link target** — `[Video Fullscreen Toggle]: planning/plans/…` resolved to nothing |

Two of these changed the work:

**Path-matching, not basename-matching.** A presence-only check ("does a link mention this basename?") scores `2025-12-29_video-fullscreen-toggle.md` as **indexed** — it was mentioned, via a dead path. That is why the first count came out at 26 by basename and **27** by full path: the file was both unindexed at its real location *and* the source of the one broken link. Presence-only cannot prevent the defect Task 2 cleans up by hand; the guard validates both directions.

**`docs/superpowers/plans/` was duplicate, not unindexed.** All three files are pre-completion copies of plans already in `docs/archive/plans/`; the archived twins are strict supersets (`**Status: Complete**` plus every checkbox flipped — the CLIP plan differs by ~50 of them). Indexing them would have enshrined three stale plans contradicting their canonical versions. **User decision 2026-09-02: delete the three copies** (the directory goes with them) and drop `superpowers/plans` from `INDEXED_DIRS`. Backfill: **24 rows**.

---

## Tasks

### Task 1 — `scripts/check-docs-index.js` + pre-commit wiring + 26-file backfill (3 SP)

Closes 🟤 [2026-08-27] G5 closeout (index automation), 🟤 [2026-07-04] PR #60 (Last Updated footer), and the three one-off backfills 🟤 [2026-05-06] / [2026-03-27] / [2026-03-24].

- [x] `tests/check-docs-index.test.js` first — 21 pure-function tests; red before implementation, then two mutations verified (basename-matching kills "matches on the full relative path"; unanchored `REFERENCE_DEF` kills "does not treat an indented colon line as a definition")
- [x] `scripts/check-docs-index.js`: `extractLinks`, `findUnindexed`, `findBrokenTargets` (+ `normalizeTarget`, `INDEXED_DIRS`); CLI walks the permanent dirs, reports MISSING and BROKEN separately, `exit 1` on either
- [x] Wire into `.husky/pre-commit` as step 2 (after the fail-fast secret scan, before `lint-staged`/`vitest`)
- [x] Delete the three stale `docs/superpowers/plans/` duplicates (user decision — see above)
- [x] Backfill all 24 rows into `docs/README.md` (19 archived plans + 5 specs), Purpose derived from each file's own H1/goal
- [x] Drop `docs/README.md`'s hand-maintained `*Last Updated*` footer, replaced by a note naming the guard that now enforces the index
- [x] Update `CLAUDE.md` — `scripts/` bullet + pre-commit hook prose (the doc-drift class that recurs on every script/hook addition)
- [x] **Unplanned, adjacent:** a stray blank line had split the Archived Plans table in two, so its last three rows rendered as a headerless table. Removed while backfilling that table.

**Scope call:** `docs/planning/plans/` holds *transient* active plans and is **not** presence-checked (a plan would have to be indexed on creation, then de-indexed on archive). Target-resolution still covers it, so a stale Active-Plans row fails.

**Firing scope:** whole-tree, not staged-files — a new spec must be indexed in the commit that creates it. Deliberate: the checklist has missed 7 times, so index-on-create is the point, and once backfilled to zero it stays at zero with no git plumbing in the script.

### Task 2 — Two dead `2025-12-29_video-fullscreen-toggle` rows (XS)

🟤 [2026-08-27] G4 closeout. Same files as Task 1's backfill, so it lands with it.

- [x] `docs/README.md`: § Active Plans now carries this branch's own plan; the video-fullscreen link definition was repointed at `archive/plans/` and its row moved into § Archived Plans
- [x] `docs/planning/plans/README.md`: § Current Plans row replaced with this branch's plan (the table is never empty in practice, and an empty table would have read as "no plans exist")

### Task 3 — Explicit `maxBuffer` in `check-e2e-needed.js` (XS)

🟤 [2026-07-11] PR #63.

- [ ] `64 * 1024 * 1024` on the `git diff --name-only` `execFileSync`, matching `check-secrets.js`. The sibling `merge-base` call returns one SHA and stays bare.

### Task 4 — Repo-level `.vscode/settings.json` (1 SP)

🟤 [2026-08-27] G4 closeout.

- [ ] New `.vscode/settings.json` with `[markdown]: { "editor.formatOnSave": false }` (`.gitignore` only ignores `.vscode-test`, so the file commits)

**Decision — the bracketed optional guard is dropped.** The entry offers "and/or a pre-commit guard rejecting staged `.md` hunks whose only change is whitespace/escape churn"; WEEKLY qualifies it "only if cheap". It is not cheap — separating escape churn from legitimate prose edits reliably needs most of a Markdown-aware differ, and a false positive blocks a real commit. The interim "stage docs by explicit path" rule already covers the `git add -A` half of the observed damage.

### Task 5 — Repo-side closeout conventions (1 SP)

🟤 [2026-08-27] G5 closeout + G4 closeout ×2 — the in-tree half of three items.

- [ ] `docs/planning/plans/README.md`: a **Closeout artifacts** block (BACKLOG · TODO · DONE · WEEKLY · `docs/README.md` · `docs/archive/plans/`, each done or **N/A with a reason**) + a **live-surface preflight** line
- [ ] `docs/planning/README.md`: a "do not restate a count or range derived from a list elsewhere" convention line
- [ ] The `.claude/TEMPLATES/` half is **out of tree** (global, gitignored) → record as a TODO § Spawned Tasks row for `claude-code-universal-config`, do not edit here

### Task 6 — 🟡 Stabilize `npx vitest run` under vitest v4 (1 SP)

🟡 [2026-07-02].

- [ ] `fileParallelism: false` in `vitest.config.js` (the workaround already proven on this repo) — try `pool: 'forks'` instead if the wall-clock cost is steep
- [ ] Confirm 5 consecutive full-suite runs are deterministic; record the wall-clock delta against the 8.22s baseline

---

## Implementation Log

- **2026-09-02** — Brainstormed as bounded; design approved in-session. Branch `g3-docs-process-guardrails` cut from `main` `38c9ef4`. Baseline measured: 556 unit tests / 17 files, 8.22s. Three premise corrections measured and recorded above.
- **2026-09-02** — Tasks 1 + 2 complete. TDD: test red (module absent) → 21 green → 2 mutations verified and reverted. Guard reproduced the measurement end-to-end (27 MISSING / 1 BROKEN), then drove the backfill to `EXIT=0`. Suite **556 → 577 passing / 18 files** (9.18s). No duplicate reference labels (113 definitions). ESLint + Prettier clean on both new files.
