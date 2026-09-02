# G3 Docs & Process Guardrails — Implementation Plan

**Task Reference**: WEEKLY.md Aug 31–Sep 4 § G3 (🟤 + 1 🟡 folded, 6 SP) ← BACKLOG 🟤 `### [2026-08-27] From: G5 closeout` ×2, `### [2026-08-27] From: G4 closeout` ×4, `### [2026-07-04] PR #60` ×1, `### [2026-07-11] PR #63` ×1, three one-off index backfills, + 🟡 `### [2026-07-02] Vitest v4 full-suite worker flake`
**Created**: 2026-09-02
**Status**: Complete — all 6 tasks shipped; **MERGED to `main` 2026-09-02 as `45a0d9b`** (no PR, branch deleted)
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

**`docs/superpowers/plans/` was duplicate, not unindexed.** All three files are copies of plans already in `docs/archive/plans/`, and **no content exists only in a deleted copy** — that is the claim that justified deleting them, and it holds for all three. **User decision 2026-09-02: delete the three copies** (the directory goes with them) and drop `superpowers/plans` from `INDEXED_DIRS`. Backfill: **24 rows**.

⚠️ **Correction (review round, 2026-09-02).** The original wording here — and in commit `4b5950b`'s message, which cannot be amended — said the archived twins were "strict supersets (`**Status: Complete**` plus every checkbox flipped)". Measured, that holds for **one of three**:

| Deleted copy | Archived twin |
| --- | --- |
| CLIP semantic features | `Status: Complete` **and** all checkboxes flipped — the claim as written |
| TASK-026 keyboard shortcuts | `Status: Complete`, but **0 of 59** checkboxes flipped |
| TASK-027 undo empty folder | **byte-identical** — no `Status: Complete` at all |

The deletions remain correct; only the characterization was overstated. Note this is also why BACKLOG 🟤 "Archived plan has 60 unchecked checkboxes" stays **open** — it says the TASK-026 archive copy is in pre-execution state, and it is right.

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

- [x] `64 * 1024 * 1024` on the `git diff --name-only` `execFileSync`, matching `check-secrets.js`. The sibling `merge-base` call returns one SHA and stays bare. Comment records why it matters: `execFileSync` throws `ENOBUFS` rather than returning short, and the existing catch turns that into a fail-safe RUN — so the default 1 MB was a spurious-RUN risk, never a silent SKIP.

### Task 4 — Repo-level `.vscode/settings.json` (1 SP)

🟤 [2026-08-27] G4 closeout.

- [x] New `.vscode/settings.json` with `[markdown]: { "editor.formatOnSave": false }` (`.gitignore` only ignores `.vscode-test`, so the file commits). Added `"files.eol": "\n"` alongside it — `.gitattributes` already enforces LF, and the same class of editor-vs-repo fight is what this file exists to stop. JSONC comments carry the rationale; verified Prettier accepts them.

**Decision — the bracketed optional guard is dropped.** The entry offers "and/or a pre-commit guard rejecting staged `.md` hunks whose only change is whitespace/escape churn"; WEEKLY qualifies it "only if cheap". It is not cheap — separating escape churn from legitimate prose edits reliably needs most of a Markdown-aware differ, and a false positive blocks a real commit. The interim "stage docs by explicit path" rule already covers the `git add -A` half of the observed damage.

### Task 5 — Repo-side closeout conventions (1 SP)

🟤 [2026-08-27] G5 closeout + G4 closeout ×2 — the in-tree half of three items.

- [x] `docs/planning/plans/README.md`: a **Closeout artifacts** table (BACKLOG · TODO · DONE · WEEKLY · `docs/README.md` · `docs/archive/plans/`, each done or **N/A with a reason**) + the two review-time detection heuristics; **live-surface preflight** added as step 4 of § Creating a Plan, where it is actually read
- [x] `docs/planning/README.md`: § Document Conventions — "do not restate a count or range derived from a list elsewhere", with the G4 three-strikes evidence and the review-time tell
- [x] The `.claude/TEMPLATES/` half is **out of tree** (global, gitignored) → recorded as a TODO § Spawned Tasks row, cross-referencing the in-tree wording to copy from

### Task 6 — 🟡 Stabilize `npx vitest run` under vitest v4 (1 SP)

🟡 [2026-07-02].

- [x] **`pool: 'threads'`** in `vitest.config.js` — **not** `fileParallelism: false`, and the reason is measured, not assumed
- [x] 5 consecutive full-suite runs deterministic: 5/5 green, ~4.2s steady state (first run 9.2s cold)

**The flake did not reproduce.** 15 consecutive full-suite runs on the default `forks` pool were green (vitest 4.0.18, unchanged since the tests were introduced — never bumped, so no upstream fix explains it). The entry's own acceptance criterion, "5 consecutive deterministic runs", therefore already passed before any change. Its origin line is the tell: the failure surfaced "during the Group CW-T **subagent** run" — under concurrent load, not on an idle machine.

Measured wall clock, 3 runs each:

| Config | Wall clock | Verdict |
| --- | --- | --- |
| default (`forks`) | 4.24 / 5.14 / 4.97 s | the path that raced |
| `pool: 'threads'` | 4.43 / 4.26 / 4.21 s | **chosen** — marginally faster, different startup path |
| `fileParallelism: false` | 11.38 / 10.19 / 10.11 s | rejected: 2.2x on every commit, forever |

User decision 2026-09-02: take `threads`. It costs nothing and moves off the diagnosed mechanism, so the bet is cheap — but the honest caveat is recorded in the config comment and here: this mitigates a **diagnosed mechanism**, not a **reproduced failure**. Serializing would have removed the race by construction, at ~+5.8s on every commit to fix something that has never once failed a commit.

---

## Known Limitations

**An unclosed code fence in `docs/README.md` blanks the rest of the document.** `stripCode`
treats a half-open fence as running to EOF, so links after it are never extracted. Verified:
given `[Keep](a.md)` before an unterminated ` ``` `, `Keep` survives and everything after is
dropped. (Nested fences are fine — a 4-backtick fence correctly survives an inner 3-backtick
one.)

The consequence splits, and only one half is silent:

- Dropped links make their files report **MISSING** → the commit blocks. Fail-safe.
- A genuine **dead link** sitting after the fence goes unchecked. Silent.

Left as-is deliberately. The loud half fires first in practice: a malformed index surfaces as
MISSING before the silent half can matter, and the narrow window where it bites needs a
malformed document *plus* every plan/spec link surviving *plus* a dead link after the fence.

The alternative considered was bailing on an unterminated fence — consistent with this guard's
"any uncertainty blocks" invariant. Not taken, because a stricter parser that false-positives
blocks real commits, and training people to reach for `--no-verify` is the exact failure the
review's finding 3 identified (that flag also skips the fail-fast secret scan). If this ever
bites, bailing is the fix, and it is ~5 lines in `stripCode`.

---

## Key Discoveries

1. **A guard that reads the working tree does not guard a commit.** `git commit` commits the
   index. The first implementation read the worktree, so staging a new plan and forgetting
   `git add docs/README.md` landed an unindexed plan with the guard green — the exact failure
   it was built to stop. Sharpened by a rule this repo already had: *stage docs by explicit
   path, never `git add -A`* makes partial staging the **normal** path here, not an edge case.
   The guard failed open precisely where the manual checklist historically failed.
2. **Presence-checking by basename is a different, weaker guard than path-checking.**
   `2025-12-29_video-fullscreen-toggle.md` was *mentioned* in the index via a path it had not
   lived at for months. Basename matching called that indexed; full-path matching correctly
   reports one missing row **plus** one dead link. The source entry specced presence-only,
   which could not have prevented the very defect the same group cleaned up by hand.
3. **A probe that never executes the target returns a pass-shaped answer.** `require()` does not
   set `require.main`, so probing a CLI guarded by `require.main === module` measured an *empty
   program* and printed the result I expected. It "confirmed" a real defect twice on worthless
   evidence. Use `Module._load(path, null, true)` or a real subprocess — and be most suspicious
   of a probe that agrees with you. Same class as the defect under investigation: a check that
   cannot fail looks exactly like one that passes.
4. **The item's premise can be wrong in both directions at once.** The vitest flake never
   reproduced (15/15 green), *and* the entry's suggested remedy — "try `pool: 'forks'`" — was a
   no-op, because `forks` **is** v4's default. Verified empirically with an `isMainThread`
   probe rather than from docs. Measuring the premise before executing it changed the task from
   "apply the suggested fix" to "the suggested fix does nothing; here is what the options cost".
5. **Two indexes that must mirror each other is the disease, not the cure.** `docs/archive/plans/README.md`
   carried a second, unenforced table that had drifted to 18 of 60 plans. Backfilling it would
   have doubled the maintenance the guard exists to remove; deleting it and pointing at the one
   machine-checked list was the smaller and more durable change.

## Future Improvements

Filed to BACKLOG 🟤 `### [2026-09-02] From: G3 closeout` at close:

1. **An unclosed code fence silently un-checks every link after it** — `stripCode` runs a
   half-open fence to EOF; dropped links block loudly via MISSING, but a dead link after the
   fence goes unchecked. Fix is ~5 lines (bail on unterminated fence); deliberately deferred,
   reasoning in § Known Limitations above.
2. **`.husky/pre-commit` has no per-check bypass**, so any single false positive forces
   `--no-verify`, which also disarms the fail-fast secret scan. A `SKIP=<check>` convention
   would make strictness affordable — and removes the main argument against improvement 1.
3. **Sweep the repo's remaining restated derived counts** — this group added the convention but
   not the sweep, then hit two live instances inside its own scope (`7 times` was 8;
   `PROJECT.md`'s `529 unit` was 597). Delete each value in favour of an open-ended reference
   rather than refreshing it.

---

## Implementation Log

- **2026-09-02** — Brainstormed as bounded; design approved in-session. Branch `g3-docs-process-guardrails` cut from `main` `38c9ef4`. Baseline measured: 556 unit tests / 17 files, 8.22s. Three premise corrections measured and recorded above.
- **2026-09-02 (review round)** — 5-reviewer review + execution-based checks. **2 blocking, both real, both fixed.**
  - **B1 — the guard read the working tree, so partial staging bypassed it entirely.** `git commit` commits the index; staging a new plan and forgetting to `git add docs/README.md` landed an unindexed plan with the guard green. Not exotic here: this repo's own rule is to stage docs by explicit path rather than `git add -A`, which makes partial staging the *normal* path — the guard failed open exactly where the checklist historically failed. Now sourced from the index (`git show :docs/README.md`, `git ls-files`), with `--worktree` for manual runs. Reproduced before, verified failing-then-passing after.
  - **B2 — the `readdirSync` catch swallowed every errno**, not just the ENOENT its comment justified, silently zeroing the MISSING half while BROKEN kept passing. A verbatim repeat of PR #63's one Minor (`018f0d2`, "uncertainty, not a legitimate no-op") — same invariant, one script later. Now ENOENT-only; everything else blocks. ⚠️ My first two probes of this were **invalid** — `require()` does not set `require.main`, so the CLI never ran and the "exit 0" proved nothing. Re-verified with `Module._load(path, null, true)`: old code exits **0 with no output**, new code exits 1 with a message.
  - **F3–F5 (guard correctness)** — the remedy text no longer suggests `--no-verify` (which routes around the fail-fast secret scan, four unconditional hook lines up). Markdown parsing rewritten: titled links, `<angle-bracket>` targets and bracket-containing labels used to extract as *nothing* (false MISSING); fenced blocks and code spans used to extract as *live links* — the false **negative** being the serious one, since a plan "indexed" only by an illustrative snippet would pass. Tests 21 → 41.
  - **F6–F10 (doc truth)** — `PROJECT.md`'s hook chain was the one live surface left stale, which this branch's own new live-surface preflight names explicitly; the "the commit fails without it" annotation was an over-claim twice over (the guard is section-agnostic, and see B1); BACKLOG `[2026-03-27]` and the 🟡 vitest entry marked resolved, the latter reworded because its "try `pool: 'forks'`" was a no-op — `forks` **is** v4's default, verified empirically with an `isMainThread` probe; `docs/archive/plans/README.md` carried a second, unenforced index that had drifted to 18 of 60 — deleted rather than mirrored, since keeping two indexes in sync is the failure this guard exists to end; and two comments restated counts their own enumerations contradicted, one of which this branch's *own* new "don't restate a derived count" convention forbids. Fixed by dropping the number and referencing the list.
- **2026-09-02** — Tasks 3–6 complete (commit 2). `maxBuffer` parity landed with a comment naming the actual failure mode. `.vscode/settings.json` created (Prettier accepts the JSONC comments). Closeout conventions split across the two planning READMEs, with the out-of-tree template half filed as a Spawned Task. Vitest: flake unreproducible in 15 runs; three configs measured; `pool: 'threads'` chosen on cost grounds; 5/5 deterministic after the change. **Status: all 6 tasks shipped.**
- **2026-09-02** — Tasks 1 + 2 complete. TDD: test red (module absent) → 21 green → 2 mutations verified and reverted. Guard reproduced the measurement end-to-end (27 MISSING / 1 BROKEN), then drove the backfill to `EXIT=0`. Suite **556 → 577 passing / 18 files** (9.18s). No duplicate reference labels (113 definitions). ESLint + Prettier clean on both new files.
