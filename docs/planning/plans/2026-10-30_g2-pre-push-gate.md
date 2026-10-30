# G2 Pre-Push Gate - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md § G2](../WEEKLY.md#g2-pre-push-gate-batch---hooks-and-tests--4-sp) · BACKLOG 🟤 [2026-10-27] "Build the blocking renderer line ratchet: a pre-push check that fails when `media-viewer.js` is over a committed ceiling" · TODO 🟠 "Fix the flaky tournament E2E 'Ctrl+A undo restores the previous pair after a pick'" (← BACKLOG 🟤 [2026-10-11])
**Created**: 2026-10-30
**Status**: In progress — Tasks 1–3 and Task 4 Steps 1–3 done; the first push awaits the user (Task 4, Step 4)
**Last Updated**: 2026-10-30

**Goal:** A push whose merge into `origin/main` would carry a `media-viewer.js` over a committed ceiling is refused in seconds, a push to `main` is refused while the ceiling is above the count, E2E still gets git's ref lines, and three tournament E2E tests stop failing at random.

**Architecture:** A new CommonJS script, `scripts/check-line-ratchet.js`, fetches `origin`'s `main`, merges each pushed branch tip into it in memory with `git merge-tree --write-tree`, and compares the merged renderer's newline count with the merged `scripts/renderer-line-ceiling.txt`. Every failure refuses. `.husky/pre-push` reads git's ref lines once and gives the ratchet, then the unchanged E2E gate, its own copy. The flaky tests drop `tiny.mp4` from their fixtures.

**Tech Stack:** Node CJS (`scripts/`), git 2.38 (`merge-tree --write-tree`), POSIX `sh` under Husky v9 (`sh -e`), Vitest, Playwright + Electron.

**Spec:** [G2 pre-push gate design](../../superpowers/specs/2026-10-30-g2-pre-push-gate-design.md), approved by the user 2026-10-30 and committed as `5d72f64`. Read it with this plan. Its rulings (D1–D4) and its calls (§ 9) are not repeated here.

## Global Constraints

- The script is `scripts/check-line-ratchet.js`, the ceiling file is `scripts/renderer-line-ceiling.txt`, and the `SKIP` token is `ratchet` (spec § 9, calls 1–2).
- The count is the number of `\n` bytes in the committed blob, as `wc -l` counts (spec § 4). It is never read from the working tree.
- The starting ceiling is **11,529**, `main`'s count at `4054d11`. If `main`'s count has changed when the PR merges, D3 makes the closeout push set the file to the new count.
- The merge is `git merge-tree --write-tree --name-only --no-messages <origin main> <tip>` (D2). Resolve both commits first, and accept a result only with a tree OID on line 1. Git 2.38 exits 1 both for a conflict and for an unresolvable ref (spec § 4).
- Measured against `origin`'s `main`, fetched once per push, whatever remote `$1` names (spec § 5.2).
- Only updates whose remote ref is under `refs/heads/` and whose local sha is not all zeros are checked. Deletes and tags pass unchecked (spec § 5.2 step 1).
- Decision (D3): count > ceiling refuses everywhere; count < ceiling refuses on `refs/heads/main` and passes with a reminder elsewhere; equal passes. Any refusal fails the whole push.
- **Fail closed**: every failure to fetch, merge, read or parse refuses (spec § 3 anti-goals).
- The hook reads the ref lines once and gives each check its own copy. The ratchet runs first. The gate's rule is unchanged: E2E runs unless the gate printed exactly `SKIP` (spec § 5.1).
- Husky runs the hook as `sh -e` (`.husky/_/h:17`), and the hook test runs it the same way (spec § 9, call 12).
- No test fetches from GitHub or runs the real E2E suite (spec § 3). Temp repos scrub `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE`, and use a local bare `origin`.
- The repo is public: no user file names, folder names or profile paths in committed text.
- Code style: CommonJS in `scripts/`, pure exported functions plus a CLI under `require.main === module`. Prettier: tabWidth 4, singleQuote, printWidth 120, LF.
- `CLAUDE.md` is 67,227 bytes against `BYTE_TRIGGER` 69,000. Keep its edit short.
- Commit at each task's commit step. Push only when the user says so.

## Review Focus

1. **A `SKIP=e2e` push**, which is common on docs pushes, must still run the ratchet. Pinned by a Task 2 hook-test row.
2. **A ceiling file saved by a Windows editor**: a UTF-8 BOM, `\r\n` or spaces around the number must still parse. Otherwise every push is refused as "does not parse". Pinned by Task 1's `parseCeiling` rows.
3. **A renderer over 1 MiB.** It is 571,455 bytes today. `execFileSync`'s default `maxBuffer` of 1 MiB would throw `ENOBUFS` and refuse every push. Pinned by Task 1's row 12 and mutant M12.
4. **Several refs in one push** (two branches, or a branch with a tag or a delete). Each branch is measured under its own column, one refusal refuses all, and a tag or delete never refuses. Pinned by Task 1's rows 10–11.
5. **A worktree closeout push, `git push origin HEAD:main`.** Its local ref is `HEAD`, so selection must key on the remote ref alone. Pinned by Task 1's `selectUpdates` rows and case 6a, which pushes with local ref `HEAD`.

---

## 1. Task Overview

**Goal**: as above.

**Context**: the renderer went 11,451 → 11,945 → 11,529 lines in a week planned to stop its growth (spec § 1). On 2026-10-27 the user ruled that v2's "net `wc -l media-viewer.js` ≤ 0 per phase" rule gets a blocking control. It must be in place before v2 P1a's PR merges. In the same week, the tournament flake failed the pre-push E2E run twice.

**Success Criteria** (spec § 1):
- [ ] A push whose merge into `origin/main` carries a renderer over the ceiling is refused, in seconds, before the E2E decision (Task 1 cases 1, 3; Task 4).
- [x] Each planted case fails against its wrong rule and passes against the built check (Task 1, mutants M1–M9).
- [x] A push to `main` is refused while the ceiling is above the count (case 6a).
- [x] The E2E gate still receives git's ref lines after the ratchet has run (Task 2's stdin row, shown able to fail).
- [x] The flake is reproduced on demand before its fix, and the fixed tests pass on repeat (Task 3).
- [ ] The unit and E2E suites pass (Task 4).

---

## 2. Analysis

### Calls made in this plan (Claude's, for the user to check)

1. **Message text.** The spec leaves the wording to the builder. The plan fixes it so that the tests can pin it. Every line starts `pre-push ratchet: `, and the per-update line reads `<remote ref>: media-viewer.js <count> lines, ceiling <ceiling> — <verdict>`. The pinned verdict substrings:
   - `over by <n>`;
   - `lower the ceiling to <count>`, in the `main` refusal and in the branch reminder;
   - `at the ceiling`;
   - `<path> conflicts with origin/main — merge origin/main first`;
   - `cannot measure — <reason>`.

   A refusal also prints the ways out once: shrink the renderer, raise the ceiling in `scripts/renderer-line-ceiling.txt`, or `SKIP=ratchet git push`.
2. **A malformed ref line refuses.** A non-blank stdin line without four fields and two hex shas means the ratchet cannot measure. The E2E gate drops such a line instead. Git always sends well-formed lines, so the difference shows only on bad input. § 6 files one shared parser.
3. **The ceiling parse forgives editor noise.** A leading BOM, `\r` and spaces around a line are ignored. A comment is a line whose first non-blank character is `#`, and a trailing `# note` after the number does not parse.
4. **The fetch** is `git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main`, with a 60 s timeout. The explicit refspec does not depend on the clone's fetch config. Without the timeout, a hung network would hang the push; with it, the push is refused.
5. **Every git read in the script uses `maxBuffer: 64 * 1024 * 1024`**, as `check-e2e-needed.js` does (Review Focus 3).
6. **`check_failed` names `git push` when `HOOK_NAME` is `pre-push`**, and `git commit` otherwise. Spec § 5.1 asks for the fix; this is the mechanism.
7. **A unit test checks that the committed ceiling file parses.** It does not compare the ceiling with the count: that would move the push-time check to commit time, and the ruling allows a branch to grow partway through.
8. **Three CLI rows beyond the nine planted cases**: nothing selected (no fetch), two refs in one push, and a renderer over 1 MiB. Cases 4, 6 and 9 are split into sub-cases (4a/b, 6a/b, 9a–e) so that each mutant run can target one.
9. **Phase 0 seeds the first deal** (AI seeding, `tiny.mp4` scored highest). `tiny.mp4` is then always in the first pair, and the held skip always fires. With a random deal, the probe would reproduce only about half the time.
10. **The repeat run uses `--repeat-each=10`**, and adds `:397` and `:452` to it as controls. They keep `tiny.mp4`, and a failure there would show that they share the mechanism.
11. **A local end-to-end probe runs before the first GitHub push.** It does a real `git push` through the real hook and the real ratchet into a local bare `origin`, including a push to `main`. It measures the fetch-inside-a-push mechanism without GitHub. It is a scratch probe, not committed.
12. **The temp-repo `gitEnv` helper is copied** into the new test file, a fourth copy. Extracting it is the open 🟤 entry "Extract one shared temp-repo git-env helper for the unit tests", which gets a note at closeout.

### Edge cases

| Case | Outcome |
|---|---|
| A push of `main` and a branch together | each is measured under its own column, and one refusal refuses the push (rows 4b, 6a, 11) |
| A tag, a branch delete or an empty stdin | not selected: passes with no fetch (row 10) |
| A branch cut before G2, pushed after G2 merged | git runs the **checked-out** `.husky/pre-push`, so that branch runs no ratchet until it merges `main`. The next push to `main` measures the merge and refuses if needed: the spec's backstop (D2's second known limit). No code in G2 can reach another branch's hook, so the remedy is a practice: **merge `main` into such a branch before its next push** (a side agent's note, 2026-10-30; carried by § 9). Today that means this week's G3 (it changes the renderer, but has no branch yet; if it is cut before G2 merges, it skips the check) and the parked local `g3-departed-clips-parked` (cut 2026-10-13, +83 renderer lines; WEEKLY G4 proposes deleting it). `research/local-ai-sorting` does not touch the renderer |
| A branch that deletes the ceiling file | missing from the merge: refused (case 9c) |
| `main` moved on GitHub since the branch's base | the merge holds both sides (D2), and a conflict refuses with "merge origin/main first" |
| G2's own first push (`origin/main` has no ceiling file yet) | the branch adds it, and the merge holds it: measured at 11,529 / 11,529 |

### Risks

| Risk | Mitigation |
|---|---|
| The fetch inside a real push behaves differently from the probe (a credential helper, or a ref update racing the push's own update of `refs/remotes/origin/main`) | Task 4 measures it locally first (a push to a branch and to `main`), then on the first GitHub push. A structural failure stops work and goes to the user, with no fallback (spec § 4) |
| A fail-closed check blocks every push while GitHub is unreachable | `SKIP=ratchet` waives it for one push, and the push needs the network anyway (spec § 9, call 5) |
| The planted-case file slows the pre-commit unit run | one shared temp repo per file. Record the file's time in the full run (G1's hook-test file took 6.7–13.9 s) |
| Phase 0 does not reproduce | stop and report (Task 3, Step 2): the mechanism would then differ from the BACKLOG entry's |
| A mutant is left in the script | mutants run after the commit and are reverted with `git checkout -- <file>`. Check `git status` before the next step |

---

## 3. Implementation Plan

### Files Affected

| File | Change |
|---|---|
| `scripts/check-line-ratchet.js` | create: pure functions and the CLI |
| `scripts/renderer-line-ceiling.txt` | create: the ceiling, 11529 |
| `tests/check-line-ratchet.test.js` | create: pure rows, the planted cases, rows 10–12 |
| `.husky/pre-push` | the ratchet before the gate; the ref lines are read once |
| `.husky/skip.sh:27-38` | `check_failed`'s hint names `git push` in pre-push |
| `tests/check-e2e-needed.test.js:246-320` | hook test: the dispatching stub, `sh -e`, the new rows |
| `tests/husky-skip.test.js:10-17, 46-50` | `runSkip` takes a hook name; the `git push` row |
| `tests/e2e/tournament-mode.test.js:292, 351, 418` | drop `tiny.mp4` from three fixture lists |
| `CLAUDE.md:31, 76` | the pre-push sentence and the bypass tokens; the `scripts/` line |
| `PROJECT.md:65-66` | the pre-push comment and the bypass tokens |
| `docs/planning/GOALS.md:31, 83` | G-7's status cell; the "No CI service" row |
| `docs/README.md` (Active Plans), `docs/planning/plans/README.md` (Current Plans) | this plan's row |

**Live-surface preflight** (plans README step 4): ran `git grep -n -i "pre-push\|check-e2e-needed\|SKIP=e2e\|line ratchet\|wc -l media-viewer"` over `README.md`, `PROJECT.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_CONTEXT.md`, `docs/planning/GOALS.md`, `docs/README.md`, `.claude/`, `.husky/`, `scripts/`, `tests/` and `package.json` (2026-10-30). Live claims were found at `CLAUDE.md:31,76`, `PROJECT.md:65-66` and `GOALS.md:31,83`, and all are listed above. `PROJECT.md:21` ("pre-commit + pre-push") stays true. The `docs/README.md` hits are rows for frozen documents. `README.md`, `ARCHITECTURE.md` and `PROJECT_CONTEXT.md` have no hits.

### Model and Effort

Re-estimated after planning: **~4.25 SP** against WEEKLY's 4 and the spec's 4–4.5:
- Task 1: ~2 (the script, 18 CLI rows, the pure rows, 12 mutants);
- Task 2: ~0.75;
- Task 3: ~1 (two probe runs and a 50-run repeat);
- Task 4: ~0.5.

**Execute on Sonnet · `high`**, as WEEKLY G2's model line says. The plan pins each case's numbers, each mutant and each message substring, and gives the hook's body. What remains is local judgement inside one function or one test. One exception goes back to the user rather than being pushed through: Phase 0 failing to reproduce is a diagnosis, not execution.

**Review at `max` in a separate session**, asked first. A pre-push gate is a hook, so WORKFLOW § 1.0 escalates it one level, as it did for G1.

**Execution approach: Native.** The four tasks are sequential, and each consumes the previous one's names. The whole-branch review at `max` is the independent check.

---

### Task 1: The ratchet check, planted cases first

**Files:**
- Create: `tests/check-line-ratchet.test.js`
- Create: `scripts/check-line-ratchet.js`
- Create: `scripts/renderer-line-ceiling.txt`

**Interfaces:**
- Produces, exported from `scripts/check-line-ratchet.js`:
  - `RENDERER = 'media-viewer.js'` and `CEILING_FILE = 'scripts/renderer-line-ceiling.txt'`;
  - `countLines(content: Buffer | string): number`, the number of `\n` bytes;
  - `parseCeiling(text: string): number | null`, where `null` means it does not parse;
  - `selectUpdates(stdin: string): Array<{ localRef, localSha, remoteRef, remoteSha }>`, which throws `Error` on a malformed non-blank line;
  - `parseMergeTree(stdout: string, status: number): { tree: string, conflicts: string[] } | null`, where `null` means git did not merge;
  - `decide(count: number, ceiling: number, remoteRef: string): 'pass' | 'remind' | 'over' | 'lower'`.
- CLI contract, which Task 2's hook relies on: the CLI reads the ref lines on stdin, exits 0 to pass and 1 to refuse, and writes every message to stderr and nothing to stdout.

- [x] **Step 1: Record the baseline.** Run `npx vitest run` from the repo root, with an uppercase drive letter in the cwd. Record the file count and the passed and skipped counts in § 4. G1's last run, at `ff4cccc`, was 2,431 passed and 1 skipped.

- [x] **Step 2: Write the planted cases and rows 10–12** in `tests/check-line-ratchet.test.js`, under `describe('CLI on a real repo with a local origin', { timeout: 120_000 })`.

  **Helpers**, at module level so that Step 3's rows can use `body`:
  - Copy `gitEnv` and `GIT_CONFIG` from `tests/check-e2e-needed.test.js:136-159`, with their comments.
  - Define `ZEROS = '0'.repeat(40)`, `S1 = 'a'.repeat(40)`, `S2 = 'b'.repeat(40)` and `T = 'e'.repeat(40)`.
  - `beforeAll`: create `root` with `fs.mkdtempSync(path.join(os.tmpdir(), 'mv-ratchet-'))`, then `git init -q --bare origin.git` and `git init -q work`, and in `work` run `git remote add origin <root>/origin.git`.
  - `afterAll` removes `root`, tolerating a held handle, as the sibling file does.
  - `commit(parent, files, message) → sha`: check out `parent` detached (or start an orphan for `null`), write each file (`null` deletes it), `add -A`, commit.
  - `publishMain(sha)`: `git push -q --force origin <sha>:refs/heads/main`.
  - `run(lines)`: `spawnSync(process.execPath, [SCRIPT], { cwd: work, input: lines.join('\n') + '\n', encoding: 'utf8', env: gitEnv() })`.
  - `branch(tip, ref = 'refs/heads/feature')` returns `` `${ref} ${tip} ${ref} ${ZEROS}` ``.
  - `body(n, { from = 1, tag = 'line' } = {})` returns the lines `` `${tag} ${i}` `` for `i` from `from` to `from + n - 1`, each ending in `\n`.
  - `ceiling(v)` returns `'# ceiling\n' + v + '\n'`.
  - `expectRefused(r, ...parts)`: `r.status === 1`, and stderr contains `pre-push ratchet: ` and each part.
  - `expectPassed(r, ...parts)` does the same with status 0.

  R is `media-viewer.js` and C is `scripts/renderer-line-ceiling.txt`. Each test publishes its own `main` first, so the tests share one repo but do not depend on each other's order.

  | Test name | Base, then `origin`'s `main` | Tip (from the base) and push line | Expect |
  |---|---|---|---|
  | `case 1: refuses a branch over the ceiling` | B = {R: body(100), C: ceiling(100)}; main = B | R: body(101); `branch(tip)` | refused: `media-viewer.js 101 lines, ceiling 100`, `over by 1`, `SKIP=ratchet git push`, `scripts/renderer-line-ceiling.txt` |
  | `case 2: passes a stale branch that did not touch the renderer` | S = {R: body(100), C: ceiling(105)}; main = S + {R: body(90, {from: 11}), C: ceiling(90)} | `docs/a.md`: `'a\n'` | passed: `media-viewer.js 90 lines, ceiling 90`, `at the ceiling` |
  | `case 3: refuses a stale branch that grew the renderer by 3` | S and main as in case 2 | R: body(100) + body(3, {tag: 'extra'}) | refused: `media-viewer.js 93 lines, ceiling 90`, `over by 3` |
  | `case 4a: passes a branch that raises the ceiling and grows to it` | B = {R: body(100), C: ceiling(100)}; main = B | R: body(105), C: ceiling(105); `branch(tip)` | passed: `media-viewer.js 105 lines, ceiling 105` |
  | `case 4b: passes the same raise pushed to main` | as 4a | same tip; `refs/heads/feature <tip> refs/heads/main <B>` | passed: `refs/heads/main: media-viewer.js 105 lines, ceiling 105` |
  | `case 5: refuses when both sides changed the ceiling to different values` | B = {R: body(100), C: ceiling(100)}; main = B + {R: body(95, {from: 6}), C: ceiling(95)} | R: body(100) + body(2, {tag: 'extra'}), C: ceiling(110) | refused: `scripts/renderer-line-ceiling.txt conflicts with origin/main — merge origin/main first` |
  | `case 6a: refuses a push to main while the ceiling is above the count` | L = {R: body(90), C: ceiling(95)}; main = L | `docs/a.md`; `HEAD <tip> refs/heads/main <L>` | refused: `media-viewer.js 90 lines, ceiling 95`, `lower the ceiling to 90` |
  | `case 6b: passes the same tip on a branch, with the reminder` | as 6a | same tip; `branch(tip)` | passed: `lower the ceiling to 90` |
  | `case 7: refuses when the renderer conflicts` | B = {R: body(100), C: ceiling(110)}; main = B with line 50 changed to `main 50` | line 50 changed to `branch 50` | refused: `media-viewer.js conflicts with origin/main — merge origin/main first` |
  | `case 8: counts a renderer change made on both sides once` | B = {R: body(100), C: ceiling(105)}; main = B + {R: body(100) + body(5, {tag: 'same'})} | the same R, in a separate commit | passed: `media-viewer.js 105 lines, ceiling 105` |
  | `case 9a: refuses when origin is unreachable` | B as in case 1; main = B; then `git remote set-url origin <root>/missing.git`, restored in `finally` | `docs/a.md` | refused: `cannot measure`, `could not fetch` |
  | `case 9b: refuses an unresolvable tip` | B as in case 1; main = B | the line `branch('c'.repeat(40))` | refused: `cannot measure`, `cannot resolve` |
  | `case 9c: refuses when the merge has no ceiling file` | B as in case 1; main = B | C deleted | refused: `cannot measure`, `scripts/renderer-line-ceiling.txt is missing` |
  | `case 9d: refuses when the merge has no renderer` | B as in case 1; main = B | R deleted | refused: `cannot measure`, `media-viewer.js is missing` |
  | `case 9e: refuses a ceiling that does not parse` | B as in case 1; main = B | C: `'abc\n'` | refused: `cannot measure`, `scripts/renderer-line-ceiling.txt does not parse` |
  | `row 10: passes without fetching when nothing is selected` | origin URL → `<root>/missing.git`, restored in `finally` | the lines `(delete) ${ZEROS} refs/heads/gone ${S2}`, `refs/tags/v1 ${S1} refs/tags/v1 ${ZEROS}`, `''` | status 0; stderr does not contain `cannot measure` |
  | `row 11: measures every ref and refuses the push when one is over` | B as in case 1; main = B | ok = B + `docs/a.md`; big = B + R: body(101); both lines (`refs/heads/ok`, `refs/heads/big`) | refused: `refs/heads/ok: media-viewer.js 100 lines, ceiling 100` and `refs/heads/big: media-viewer.js 101 lines, ceiling 100` |
  | `row 12: counts a renderer over 1 MiB` | B = {R: body(100000), C: ceiling(100000)}; main = B; assert `Buffer.byteLength(body(100000)) > 1024 * 1024` | `docs/a.md` | passed: `media-viewer.js 100000 lines, ceiling 100000` |

  Two notes on the table:
  - Main's changes in cases 2, 3 and 5 remove lines from the top of the renderer, and the branch appends at the end, so git merges them cleanly.
  - Each refusal row asserts a message that only the built check prints. When the script is absent, node exits 1 with "Cannot find module", so a row that asserted the exit code alone would pass vacuously.

- [x] **Step 3: Write the pure-function rows** in the same file. Each list is an `it.each` table, using Step 2's shas.
  - **`countLines`**: `''` → 0; `'a'` → 0; `'a\n'` → 1; `'a\nb'` → 1; `'a\n\n'` → 2; `Buffer.from('a\r\nb\r\n')` → 2; `Buffer.from(body(3))` → 3.
  - **`parseCeiling` parses**:
    - `'11529\n'` → 11529;
    - `'# c\n\n11529\n# d\n'` → 11529;
    - `'﻿11529\n'` → 11529;
    - `'11529\r\n'` → 11529;
    - `'  11529  \n'` → 11529;
    - `'  # indented\n7'` → 7;
    - `'007\n'` → 7.
  - **`parseCeiling` returns `null`** for: `''`, `'\n\n'`, `'# only\n'`, `'abc\n'`, `'1\n2\n'`, `'0\n'`, `'00\n'`, `'-5\n'`, `'+5\n'`, `'5.0\n'`, `'1e4\n'`, `'11 529\n'`, `'11,529\n'`, `'9007199254740993\n'`, `'11529 # note\n'`.
  - **`selectUpdates` selects**:
    - a branch update `refs/heads/x S1 refs/heads/x S2`;
    - a new branch `… refs/heads/x ZEROS`;
    - `HEAD S1 refs/heads/main S2`, which yields remoteRef `refs/heads/main`;
    - a raw sha as the local ref, `S1 S1 refs/heads/x ZEROS`;
    - a 64-hex sha;
    - two branch lines plus a tag line, which yields the two branches in order.
  - **`selectUpdates` drops**: a delete (`(delete) ZEROS refs/heads/gone S2`), a tag (`refs/tags/v1 S1 refs/tags/v1 ZEROS`), `''` and `'\n\n'`.
  - **`selectUpdates` throws** for: `'garbage'`, a three-field line, a five-field line, and a short sha (`refs/heads/x abc refs/heads/x S2`).
  - **`decide`**:
    - (101, 100, `refs/heads/x`) → `'over'`;
    - (101, 100, `refs/heads/main`) → `'over'`;
    - (99, 100, `refs/heads/main`) → `'lower'`;
    - (99, 100, `refs/heads/x`) → `'remind'`;
    - (99, 100, `refs/heads/mainline`) → `'remind'`;
    - (100, 100, `refs/heads/main`) → `'pass'`;
    - (100, 100, `refs/heads/x`) → `'pass'`.
  - **`parseMergeTree`**:
    - (`` `${T}\n` ``, 0) → `{ tree: T, conflicts: [] }`;
    - (`` `${T}\nmedia-viewer.js\nscripts/renderer-line-ceiling.txt\n\n` ``, 1) → both paths;
    - (`` `${T}\ndocs/a.md\n` ``, 1) → `['docs/a.md']`;
    - a 64-hex tree, status 0 → accepted;
    - each of these → `null`: (`''`, 1), which is git 2.38's unresolvable ref; (`''`, 0); (`` `${T}\n` ``, 128); (`'not-an-oid\n'`, 0); and (`` `${T}\nmedia-viewer.js\n` ``, 0), a clean exit that lists a conflict.
  - **`'the committed ceiling file parses to a positive integer'`**: `parseCeiling` of the repo's own `scripts/renderer-line-ceiling.txt` is greater than 0.

- [x] **Step 4: Run them and see them fail.** Run `npx vitest run tests/check-line-ratchet.test.js`. Expect every test to fail: the module is missing, so the pure rows throw on `require`, and the CLI rows see node's "Cannot find module". If any row passes, it is vacuous. Fix that row before going on.

- [x] **Step 5: Write `scripts/renderer-line-ceiling.txt` and the pure functions.** The ceiling file is exactly:

  ```
  # The renderer line ceiling (v2 spec § 11.1; the user's ruling of 2026-10-27). .husky/pre-push refuses
  # a push whose merge into origin/main carries a longer media-viewer.js, and a push to main while this is
  # above the count. Each v2 phase's PR lowers it to its new count; raising it is an explicit edit here.
  11529
  ```

  The script's header comment states what it measures, that it fails closed, and that it never writes the ceiling. `parseCeiling` strips a leading BOM, trims each line and skips blank lines and `#` lines. It needs exactly one remaining line matching `/^[0-9]+$/`, whose value is a safe integer ≥ 1. A sha is `/^[0-9a-f]{40}([0-9a-f]{24})?$/`, and a zero sha is `/^0+$/`. Run the file: the pure rows pass, and the CLI rows still fail.

- [x] **Step 6: Write the CLI** under `require.main === module`, in the order of spec § 5.2:
  1. Read stdin with `fs.readFileSync(0)` and run `selectUpdates`. If nothing is selected, exit 0 before any fetch.
  2. Fetch `main` once (call 4), then resolve `refs/remotes/origin/main^{commit}`.
  3. For each update, in order:
     - resolve the tip with `git rev-parse --verify --quiet <sha>^{commit}`;
     - run merge-tree with `spawnSync`, since exit 1 must not throw, and pass the result through `parseMergeTree`;
     - if `RENDERER` or `CEILING_FILE` is among the conflicts, print the conflict line (renderer first) and mark the push refused;
     - otherwise read both files from the tree as Buffers, where an absent path is "is missing", count, parse, `decide`, and print the update's line.
  4. After the loop, print the ways out once if anything was refused, then exit 1. Otherwise exit 0.

  Every failure throws an `Error` whose message is the reason:
  - a failed fetch: `could not fetch main from origin`;
  - an unresolvable commit: `cannot resolve <sha>`;
  - a merge `parseMergeTree` rejects: `git could not merge <sha> into origin/main`;
  - an absent path: `<path> is missing from the merge`;
  - a ceiling that `parseCeiling` rejects: `scripts/renderer-line-ceiling.txt does not parse`;
  - a malformed ref line: `selectUpdates`' own message.

  One top-level `catch` prints `pre-push ratchet: cannot measure — <reason>. Refusing the push.` with the ways out, and exits 1. Every `execFileSync` and `spawnSync` call passes `maxBuffer: 64 * 1024 * 1024`.

- [x] **Step 7: Run them and see them pass.** Same command. Expect every test in the file to pass. Record the count and the file's run time.

- [x] **Step 8: Commit.** `git add scripts/check-line-ratchet.js scripts/renderer-line-ceiling.txt tests/check-line-ratchet.test.js`, then `git commit -m "feat(scripts): the renderer line ratchet, measured on git's merge, failing closed"`. After the hook runs, check `git diff --cached` is empty: a refused commit leaves its files staged.

- [x] **Step 9: Show each case able to fail (spec § 6.2).** Apply one mutant at a time with Edit. Run its rows with `npx vitest run tests/check-line-ratchet.test.js -t "<case prefix>"`, record the result, and restore the file with `git checkout -- scripts/check-line-ratchet.js`. Each listed row must fail. Record any other rows that fail too.

  | Mutant | The wrong rule | Must fail |
  |---|---|---|
  | M1 | the CLI exits 0 whatever it decided | cases 1, 3, 5, 6a, 7, 9a–e; row 11 |
  | M2 | counts the tip's own `media-viewer.js` (`<tip>:media-viewer.js`), keeping the merged ceiling | case 2 (100 > 90) |
  | M3 | reads the ceiling from the tip's own tree | case 3 (93 ≤ 105 passes) |
  | M4a | ceiling = the lower of `origin/main`'s and the tip's | cases 4a, 4b (105 > 100) |
  | M4b | ceiling = `origin/main`'s, always | cases 4a, 4b |
  | M5 | ceiling from the tip's tree, and the ceiling file dropped from the conflict check | case 5 (97 ≤ 110 passes) |
  | M6a | `decide`: count < ceiling passes on `main` | case 6a |
  | M6b | `decide`: count < ceiling refuses on every ref | case 6b |
  | M7 | the renderer dropped from the conflict check, so the merged blob is counted with its markers | case 7 (104 ≤ 110 passes) |
  | M8 | count = `origin/main`'s count + (the tip's count − the merge base's count) | case 8 (110 > 105) |
  | M9 | the top-level `catch` exits 0 | cases 9a–e |
  | M12 | blob reads without `maxBuffer` | row 12 |

  End with `git status` clean, and run the whole file once more: all pass.

### Task 2: The hook, its test and the docs

**Files:**
- Modify: `.husky/pre-push` (whole file), `.husky/skip.sh:27-38`
- Test: `tests/check-e2e-needed.test.js:246-320` and the comment above it; `tests/husky-skip.test.js:10-17, 46-50`
- Modify: `CLAUDE.md:31, 76`, `PROJECT.md:65-66`, `docs/planning/GOALS.md:31, 83`

**Interfaces:**
- Consumes: Task 1's CLI contract, which is `node scripts/check-line-ratchet.js`, with exit 0 to pass, exit 1 to refuse, and messages on stderr.
- Produces: the hook order (tokens checked → ref lines read once → ratchet → gate), and `check_failed`'s hint, which names `git push` in the pre-push hook.

- [x] **Step 1: Write the failing tests.**
  - **The stub.** In the hook describe, the stub `node` now dispatches on `$1`. Its body is exact, because the stdin behaviour is what the tests prove:

    ```sh
    #!/bin/sh
    case "$1" in
    scripts/check-line-ratchet.js)
        input=$(cat)
        [ "$input" = "$EXPECT_STDIN" ] && echo "STUB-RATCHET got the ref lines" >&2
        exit "${RATCHET_EXIT:-0}" ;;
    scripts/check-e2e-needed.js)
        input=$(cat)
        if [ "$input" = "$EXPECT_STDIN" ]; then
            echo "STUB-GATE got the ref lines" >&2; printf "%s" "$STUB_OUT"
        else printf STDIN-LOST; fi
        exit "${STUB_EXIT:-0}" ;;
    *) exec "$(PATH=${PATH#*:} command -v node)" "$@" ;;
    esac
    ```

  - **`runHook`** becomes `runHook({ out = 'SKIP', exit = 0, ratchetExit = 0, skip } = {})`. It spawns `sh` with `['-e', '.husky/pre-push', 'origin', 'url']`, sets `SKIP` only when `skip` is given, and passes `RATCHET_EXIT`. The existing control and `it.each` rows keep their assertions, now through this signature.
  - **Rename the describe** to `'the pre-push hook: the ratchet first, then E2E unless the gate prints exactly SKIP'`, and rewrite its header comment to cover the ratchet stub and the stdin hand-off.
  - **Keep, unweakened**, the SKIP control's `STUB-GATE` assertion, the stubs' execute bits, and the `beforeAll` check that `sh` resolves both stubs first (spec § 6.3).
  - **New rows:**
    - `'gives the ratchet and then the gate the same ref lines (the stdin proof)'`: run with `{ out: 'SKIP' }`. Status 0. Stderr contains `STUB-RATCHET got the ref lines` before `STUB-GATE got the ref lines` (compare their `indexOf`).
    - `'stops the push when the ratchet refuses: neither the gate nor E2E runs'`: run with `{ ratchetExit: 1, out: 'RUN' }`. Status 1. Stderr contains `ratchet failed` and `SKIP=ratchet git push`, and does not contain `STUB-GATE`. Stdout does not contain `E2E-RAN`.
    - `'reports a missing ratchet command (exit 127) and stops the push'`: run with `{ ratchetExit: 127 }`. Status 127. Stderr contains `ratchet could not run — command not found (exit 127)`, and does not contain `STUB-GATE`.
    - `'SKIP=ratchet waives only the ratchet, and the gate still gets the ref lines'`: run with `{ skip: 'ratchet' }`. Status 0. Stderr does not contain `STUB-RATCHET` or `unknown SKIP token`, and contains both `SKIP=ratchet — the ratchet check did NOT run` and `STUB-GATE got the ref lines`.
    - `'SKIP=e2e still runs the ratchet'` (Review Focus 1): run with `{ skip: 'e2e', out: 'RUN' }`. Stderr contains `STUB-RATCHET got the ref lines` and `SKIP=e2e — the e2e check did NOT run`. Stdout does not contain `E2E-RAN`.
    - `'the stub hands any other node call to the real node'`: run `spawnSync('sh', ['-c', 'node -e "process.stdout.write(String(6*7))"'], { env: stubEnv(), encoding: 'utf8' })`. Stdout is `'42'`. If the `PATH=… command -v` prefix form does not find the real node under Git Bash, use the subshell form `"$(PATH=${PATH#*:}; command -v node)"`, and note it in § 4.
  - **`tests/husky-skip.test.js`:**
    - `runSkip(script, skipValue, hookName = 'test-hook')`.
    - The existing `check_failed` row also expects `SKIP=vitest git commit`.
    - New row `'check_failed names git push in the pre-push hook'`: run `runSkip('(exit 1) || check_failed ratchet', undefined, 'pre-push')`. Status 1. Stderr contains `SKIP=ratchet git push`, and does not contain `git commit`.

- [x] **Step 2: Run them and see them fail.** Run `npx vitest run tests/check-e2e-needed.test.js tests/husky-skip.test.js`.
  - Expect these to fail: the stdin proof, the refusal, 127, `SKIP=ratchet` (the token is unknown and nothing is skipped), `SKIP=e2e`, and the `git push` row.
  - Expect the control, the `it.each` rows, the real-node row and the `git commit` assertion to pass against today's hook.
  - If the control fails, the stub is broken: fix that first.

- [x] **Step 3: Implement.**
  - **`check_failed`**: the hint's command is `git push` when `$HOOK_NAME` is `pre-push`, and `git commit` otherwise.
  - **`.husky/pre-push`** becomes:

    ```sh
    # SKIP=ratchet waives the renderer line ratchet and SKIP=e2e the E2E suite, each for one push — see .husky/skip.sh.
    . "$(dirname "$0")/skip.sh"
    check_skip_tokens "ratchet e2e"

    # Git sends the ref lines on stdin once. Keep them and give each check its own copy: the gate prints SKIP
    # for an empty stdin, so a check that read git's stdin first would turn E2E off for every push.
    refs=$(cat)

    # Before the E2E decision, so a refused push costs seconds, not the suite.
    if ! skipped ratchet; then
        printf '%s\n' "$refs" | node scripts/check-line-ratchet.js || check_failed ratchet
    fi

    # Run unless the gate printed exactly SKIP: a crash after its token (RUNRUN, SKIPRUN), no output or
    # stray output all mean the decision is uncertain.
    decision=$(printf '%s\n' "$refs" | node scripts/check-e2e-needed.js || echo RUN)
    if [ "$decision" != "SKIP" ] && ! skipped e2e; then
        echo "pre-push: running the E2E suite before push (skip it for one push with: SKIP=e2e git push)…"
        npx playwright test
    fi
    ```

- [x] **Step 4: Run them and see them pass.** Same command. Every test in both files passes.

- [x] **Step 5: Update the live docs.**
  - **`CLAUDE.md:31`.** Replace `Pre-push hook (Husky): \`node scripts/check-e2e-needed.js\` decides` with:

    > Pre-push hook (Husky): `node scripts/check-line-ratchet.js` first (merges each pushed branch into a freshly fetched `origin/main` with `git merge-tree` and refuses when the merged `media-viewer.js` is over the ceiling in `scripts/renderer-line-ceiling.txt` or, on a push to `main`, under it; a conflict or any failure to measure refuses; raising the ceiling is an explicit edit of that file), then `node scripts/check-e2e-needed.js` decides

    Append to the sentence's end, before the bypass sentence: `; the hook reads git's ref lines once and gives each check its own copy (the gate skips on an empty stdin)`.

    Change `pre-push \`e2e\`` to `pre-push \`ratchet\`, \`e2e\``.
  - **`CLAUDE.md:76`.** After the `check-e2e-needed.js (…);` entry, insert `check-line-ratchet.js (pre-push renderer line ceiling, \`renderer-line-ceiling.txt\`; fails closed);`.
  - **`PROJECT.md:65`.** The line becomes `# Husky pre-push: renderer line ratchet (refuses a merge over scripts/renderer-line-ceiling.txt) -> conditional E2E (skipped when a push changes only paths the app never loads)`.
  - **`PROJECT.md:66`.** `| e2e` becomes `| ratchet, e2e`.
  - **`GOALS.md:31`.** In G-7's status cell, `the ratchet is filed, not built` becomes `the ratchet is built (G2): \`scripts/renderer-line-ceiling.txt\`, 11,529`.
  - **`GOALS.md:83`.** `+ pre-push (conditional E2E — skipped when …)` becomes `+ pre-push (the renderer line ratchet, then conditional E2E — skipped when …)`.
  - Update each doc's Last Updated line, if it has one.
  - Check `CLAUDE.md`'s size with `wc -c CLAUDE.md`, and record it. It must stay under 69,000 bytes.

- [x] **Step 6: Commit.** Run `git add .husky/pre-push .husky/skip.sh tests/check-e2e-needed.test.js tests/husky-skip.test.js CLAUDE.md PROJECT.md docs/planning/GOALS.md`, then `git commit -m "feat(husky): run the line ratchet before the E2E gate, each with its own copy of the ref lines"`. Check that `git diff --cached` is empty.

- [x] **Step 7: Show the stdin row able to fail (spec § 6.3).** Temporarily edit `.husky/pre-push` into the ↳ note's shape: delete `refs=$(cat)`, have the ratchet line read git's stdin directly (`node scripts/check-line-ratchet.js || check_failed ratchet`), and have the gate line read it too (`decision=$(node scripts/check-e2e-needed.js || echo RUN)`). Run the hook describe. Expect the stdin-proof row to fail (no `STUB-GATE`, and the gate prints `STDIN-LOST`), and record which other rows fail. Restore with `git checkout -- .husky/pre-push`, and check `git status` is clean.

### Task 3: The flaky tournament tests

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js:292, 351, 418`
- Probe, not committed: the same file, the Ctrl+A test

- [x] **Step 1: Confirm the two siblings the spec reads as unaffected.** Read `:397` ("undo button is disabled…") and `:452` ("tournament chrome hides…"), and record in § 4 why each is safe. The expected reasons:
  - `:397` waits with `waitForUserHistory`, which filters out prunes, and its button follows `peekUndoKind`, which skips them;
  - `:452` asserts only the chrome's visibility.

  If either reads the raw history, the pair or `currentIndex` across a window where a skip can land, it gets the fix too: record it and extend Step 4.

- [x] **Step 2: Phase 0, reproduce on the unfixed fixtures.** This is a temporary edit of the Ctrl+A test (`:291`).
  1. After `waitForMedia`, seed the deal. Call `setSeedScores(page, { 'tiny.mp4': 0.9, 'red-1x1.png': 0.7, 'green-1x1.png': 0.3, 'blue-1x1.png': 0.1 })`, and assert it returns `[['tiny.mp4', 'blue-1x1.png'], ['red-1x1.png', 'green-1x1.png']]`.
  2. Hold the skip. In `page.evaluate`, replace `window.mediaViewer._skipFailedTournamentFile` with a function that pushes `() => original.apply(mv, args)` onto `window.__heldSkips`. The failure listener resolves `this._skipFailedTournamentFile` when it fires, so the instance property takes effect.
  3. Call `enterAndStartTournament(page, { rounds: 2, aiSeeding: true })`.
  4. Capture `before` as the test does. Then wait for `window.__heldSkips.length === 1`, release with `window.__heldSkips.splice(0).forEach((f) => f())`, and call `waitForTournamentIdle(page)`.
  5. Run the rest of the test unchanged.

  Run `npx playwright test tests/e2e/tournament-mode.test.js -g "Ctrl\+A undo restores"`. Expect it to FAIL at `expect(after).toEqual(before)`, with `before` holding `tiny.mp4` and `blue-1x1.png`, and `after` holding `red-1x1.png` and `green-1x1.png`. Record the output in § 4.
  - If `enterAndStartTournament`'s idle wait never returns while the skip is held, the hold blocked a state the real flake passed through. Inline the helper's steps without its final idle wait, capture `before` once `__heldSkips.length === 1`, and record the deviation.
  - If it still does not fail, stop and report: the mechanism is not the BACKLOG entry's.

- [x] **Step 3: The probe's control.** Keep only the hold patch (no seeding, and no wait on `__heldSkips`), and run the Ctrl+A test with the three PNGs only. Expect PASS: the patch alone does not fail the test. Then restore the file with `git checkout -- tests/e2e/tournament-mode.test.js`, check that `git diff` is empty, and record both runs.

- [x] **Step 4: The fix.** Drop `'tiny.mp4'` from the `createTempFixtureDir` lists at `:292`, `:351` and `:418`, with one comment line above each:
  - `:292` and `:418`: `// No tiny.mp4: its decode-failure skip can land after the pair is read and change it (G2; undo past a skip is G3 E7's).`
  - `:351`: `// No tiny.mp4: its decode-failure skip can push a tracked prune after Continue, which the raw history read below counts (G2).`

- [x] **Step 5: Run them on repeat.** Run `npx playwright test tests/e2e/tournament-mode.test.js -g "Ctrl\+A undo restores|leave-prompt Save persists|mouse wheel does not navigate|undo button is disabled|tournament chrome hides" --repeat-each=10`. Expect 50 passed: the three fixed tests and the two controls, 10 runs each.
  - If a control fails, stop and report: it carries the mechanism too.
  - A launch that exits `0xC0000142` is the low-memory environment, not the code. Record it and rerun once.

- [x] **Step 6: Commit.** `git add tests/e2e/tournament-mode.test.js`, then `git commit -m "test(e2e): drop tiny.mp4 from three tournament tests it made flaky"`.

### Task 4: End-to-end verification and the first push

- [x] **Step 1: The suites and checks.**
  - Run `npx vitest run` from the repo root, with an uppercase drive letter in the cwd. Expect one more file than the baseline. The passed count must equal the baseline plus Task 1's file plus Task 2's seven new rows: check the count, not the exit code.
  - Run `npm run lint`, then `npx prettier --check scripts/check-line-ratchet.js tests/check-line-ratchet.test.js tests/check-e2e-needed.test.js tests/husky-skip.test.js tests/e2e/tournament-mode.test.js`, then `node scripts/check-docs-index.js`.

- [x] **Step 2: The local end-to-end probe** (scratch, not committed; call 11).
  - **Setup**: in a temp dir, create a bare `origin.git` and a `work` clone. Copy into the clone `.husky/pre-push`, `.husky/skip.sh`, `scripts/check-line-ratchet.js` and `scripts/check-e2e-needed.js`, with a 100-line `media-viewer.js` and a ceiling of 100, and push `main`. Point `core.hooksPath` at a dir whose `pre-push` runs `exec sh -e .husky/pre-push "$@"`. Put a stub `npx` first on `PATH`.
  - (a) Push a docs commit to a new branch. The push succeeds, and stderr shows `100 lines, ceiling 100 — at the ceiling` and the gate's decision.
  - (b) Commit one more renderer line and push. The push is refused, and the bare's branch ref is unchanged.
  - (c) Push the docs commit to `main`, which fast-forwards. The push succeeds, and `refs/remotes/origin/main` afterwards equals the pushed sha.
  - Record each push's time and output in § 4.
  - A structural failure here (the fetch refused or hanging, or a ref-update error) stops the work: report it to the user, with no fallback (spec § 4).

- [x] **Step 3: Dogfood on this repo without pushing.** Pipe `refs/heads/g2-pre-push-gate <HEAD sha> refs/heads/g2-pre-push-gate <zeros>` into `node scripts/check-line-ratchet.js`: this is a real fetch from GitHub outside a push. Then pipe the same line with remote ref `refs/heads/main`. Expect both to pass with `media-viewer.js 11529 lines, ceiling 11529 — at the ceiling`, unless `main` has moved. Record the times.

- [ ] **Step 4: Ask the user before pushing.** On approval, run `git push -u origin g2-pre-push-gate`.
  - Record the ratchet's line and its duration, the gate's decision (RUN, since `tests/e2e/` changed) and the E2E result.
  - If the ratchet fails structurally inside the real push, stop and ask the user (spec § 4).
  - If only an unrelated flake fails, re-push once and record it.

- [ ] **Step 5: The PR and the review.** Open the PR when the user asks. The review runs at `max` in a separate session, asked first.

---

## 4. Implementation Log

### 2026-10-30 — PHASE: Planning

- Branch `g2-pre-push-gate`, cut from `main` at `4054d11`. The spec was approved by the user ("looks right") and committed as `5d72f64`. This plan was written from it at `high`, as WEEKLY G2's model line asks.
- Measured for the plan:
  - the renderer is 571,455 bytes (Review Focus 3);
  - `.husky/_/h:17` runs `sh -e "$s" "$@"`;
  - the live surfaces are as listed in § 3.
- Found while planning:
  - git runs the checked-out hook, so a branch cut before G2 runs no ratchet until it merges `main` (§ 2, Edge cases);
  - node's exit 1 on a missing module would satisfy an exit-code-only refusal row, so every refusal row also pins a message (Task 1, Step 2).
- A side agent's note, relayed by the user: the same limit, with the remedy "merge `main` into older branches before pushing them". Accepted as a practice, since G2 cannot change another branch's hook. Checked against today's unmerged branches, and carried by a § 9 closeout row so that it reaches the groups still open.

### 2026-10-30 — PHASE: Implementation (Native, Sonnet · high)

- The user approved the plan ("looks good. Native"). The plan was committed as `e42e8ec`.
- **Task 1** (`25bc288`): baseline 49 files, 2,431 passed, 1 skipped. RED: 80 of 80 failed, the CLI rows on node's "Cannot find module". GREEN: 80 of 80 in about 19.5 s. All 12 mutants failed their named rows (M1: cases 1, 3, 5, 6a, 7, 9a–e, row 11; M2: 2, 3; M3: 2, 3; M4a: 4a, 4b, 9e; M4b: 4a, 4b, 9c, 9e; M5: 2, 3, 5; M6a: 6a and the `lower` pure row; M6b: 6b and two `remind` pure rows; M7: 7; M8: 8; M9: 9a–e; M12: row 12), plus the collateral rows listed.
  - Deviations: `parseMergeTree` also returns `null` for an exit 1 that lists no path, with one extra pure row; the test loads the module per row (`lib()`), so a missing module fails each row on its own; the passed/refused helpers also assert an empty stdout (the CLI contract). Wording choices: the fetch failure appends git's first stderr line; the reminder reads "lower the ceiling to N before this reaches main".
- **Task 2** (`7ff9a47`): RED was exactly the plan's set (stdin proof, refusal, 127, `SKIP=ratchet`, `SKIP=e2e`, the `git push` row); the control, the `it.each` rows, the real-node row and the `git commit` assertion passed against the old hook. The real-node stub row passed with the `PATH=${PATH#*:} command -v node` form, so the fallback was not needed. GREEN: 83 of 83 in the two files; full suite 50 files, 2,518 passed, 1 skipped (2,431 + 80 + 7). `CLAUDE.md` is 67,818 bytes. The stdin mutation (no `refs=$(cat)`, both checks reading git's stdin) failed the control and the stdin proof, and nothing else. A first attempt left the two pipes in place by mistake (my escaping) and failed four rows; the exact shape was then re-run.
  - `PROJECT.md`'s Last Updated moved from 2026-09-02 to 2026-10-30, which over-claims freshness for the rest of that file (ledgered as a ruling).
- **Task 3** (`7787f4d`):
  - `:397` is safe: it waits with `waitForUserHistory`, which filters prunes, and its button follows `peekUndoKind`, which skips them. `:452` asserts only the chrome's visibility.
  - Phase 0 (seeding that deals `tiny.mp4` against `blue-1x1.png`, and a held `_skipFailedTournamentFile`) failed at `expect(after).toEqual(before)`: `before` held `blue-1x1.png` and `tiny.mp4`, `after` held `green-1x1.png` and `red-1x1.png`. No fallback was needed.
  - The control (the hold patch only, the three PNGs) passed. The fix was applied at the three sites.
  - `--repeat-each=10` over the five tests: 50 passed in 2.7 minutes.
- **Task 4, Steps 1–3**: full suite 50 files, 2,518 passed, 1 skipped; lint, Prettier and the docs index clean.
  - Local end-to-end probe, with a local bare origin and the real hook through `core.hooksPath`: (a) a docs commit to a new branch passed in 1.3 s (`100 lines, ceiling 100 — at the ceiling`, the gate's SKIP); (b) one more renderer line was refused in 1.0 s (`101 lines, ceiling 100 — over by 1`) and the bare's branch ref was unchanged; (c) a docs commit pushed to `main` fast-forwarded in 1.3 s, and `refs/remotes/origin/main` afterwards equalled the pushed sha.
  - Dogfood against GitHub without pushing: `media-viewer.js 11529 lines, ceiling 11529 — at the ceiling` for the branch ref and for `refs/heads/main`, 1.2 s and 1.1 s, `origin/main` still `4054d11`.

---

## 5. Key Discoveries

- The flake's mechanism is the BACKLOG entry's: `tiny.mp4` is dealt into the first pair, and its decode-failure skip lands after the test reads the pair. Seeding plus a held skip reproduces it on demand, and the same hold on the three PNGs does not, so the cause is the fixture and not the hold.
- The unit suite for the ratchet needs no network: a local bare `origin` carries the real fetch, `merge-tree` and blob reads, so the 18 CLI rows take about 19 s together.
- A real push measures in about a second on a local origin and 1.1–1.2 s against GitHub, so a refused push costs far less than the E2E suite it now precedes.

---

## 6. Future Improvements

### Enhancement Ideas

| Idea | Rationale | Effort | Priority |
|------|-----------|--------|----------|
| Extend the ceiling to "the renderer plus `core/*.js`" once v2 P1a creates `core/` (🟤) | GOALS G-7 sets that target, but the ruling and this check name only `media-viewer.js` (spec § 3, non-goals), so code moved into `core/` is not counted | S | M |
| One ref-line parser for both pre-push scripts (🟤) | The gate drops a malformed line (and prints SKIP for garbage), while the ratchet refuses it (§ 2, call 2). A shared parser with the ratchet's policy would also close 🟤 "Make the gate print RUN for stdin that is not git's ref lines" | XS | L |
| A way to run the ratchet on the current branch without pushing (`npm run ratchet`) (🟤) | It would let a PR author see the merged count and set the ceiling before the push refuses it. Today that needs Task 4, Step 3's hand-built ref line | XS | L |

### Spawned Tasks

| Task | Origin | Priority | Added to TODO.md |
|------|--------|----------|------------------|
| _none yet_ | | | |

---

## 7. Testing

### Test Plan

- [x] Unit: Task 1 (the pure rows, 18 CLI rows, and the 12 mutants M1–M9 and M12); Task 2 (7 new rows, and the stdin mutation).
- [x] The full `npx vitest run`, checked by count (Task 4, Step 1).
- [x] `npm run lint`, `npx prettier --check …` and `node scripts/check-docs-index.js`.
- [x] E2E: Phase 0 and its control; the 50-run repeat (Task 3).
- [ ] The local end-to-end probe (Task 4, Step 2), the dogfood (Step 3), and the first push's full E2E run (Step 4).

### Test Results

| Test | Result | Notes |
|------|--------|-------|
| Baseline `npx vitest run` | 49 files, 2,431 passed, 1 skipped | At `e42e8ec` |
| `tests/check-line-ratchet.test.js` | RED 80 of 80 failed; GREEN 80 of 80 | About 19.5 s |
| Mutants M1–M9, M12 | each failed its named rows | § 4 |
| Hook test + `husky-skip` | 83 of 83; full suite 50 files, 2,518 passed, 1 skipped | 2,431 + 80 + 7 |
| Stdin mutation | the control and the stdin proof failed, nothing else | § 4 |
| Phase 0 / control | Phase 0 FAILED at `toEqual(before)` as predicted; the control PASSED | `before` = `blue-1x1.png` + `tiny.mp4` |
| Repeat run (50) | 50 passed | 2.7 minutes |
| Local end-to-end probe | (a) passed, (b) refused with the ref unchanged, (c) fast-forwarded | 1.3 s, 1.0 s, 1.3 s |
| Dogfood | 11529 / 11529 on both refs | 1.2 s, 1.1 s |
| First push | | awaits the user |

---

## 8. Review

- [ ] Self-review complete
- [ ] Code review at `max` in a separate session, all findings answered in the PR
- [ ] User approved (merge)

---

## 9. Closeout Artifacts

| Artifact | Done / N/A + reason |
|----------|---------------------|
| `BACKLOG.md`: improvements extracted (≥ 2, 🟤 under `[YYYY-MM-DD] From: G2 closeout`, each checked against BACKLOG first) | |
| `BACKLOG.md`: check off 🟤 [2026-10-27] "Build the blocking renderer line ratchet…", noting that D2's merge-tree measurement replaced its arithmetic; check off 🟤 [2026-10-11]'s flaky-test entry; annotate 🟤 "Extract one shared temp-repo git-env helper for the unit tests" (a fourth copy landed in `tests/check-line-ratchet.test.js`) | |
| `TODO.md`: tick the 🟠 flaky-test item | |
| `DONE.md`: entry with plan link, summary, key changes | |
| `WEEKLY.md`: G2's Summary-Table Status and both Daily-Schedule entries (lines 96 and 102) in WEEKLY's own form (`✅ PR #N`); G2's task boxes | |
| `docs/README.md`: plan under Archived Plans, spec row marked implemented, Active Plans row removed | |
| `docs/archive/plans/`: plan moved with `git mv`; `plans/README.md`'s row becomes a dated comment | |
| The ceiling equals `main`'s count after the merge (D3 makes the closeout push prove it) | |
| Branches cut before G2's merge (§ 2, Edge cases): list them with `git branch -a --no-merged origin/main`. Then add a ↳ note to the WEEKLY entry of each group still open (G3 and G4 as of 2026-10-30): "merge `main` before your next push, so the line ratchet runs". If `g3-departed-clips-parked` still exists, add the same line to 🟤 [2026-10-16] "Decide the parked source-CLIP reuse branch" (+83 renderer lines) | |
| Cited commit SHAs verified as ancestors of `main` | |
| Deploy record | N/A: a dev-tooling change, nothing deploy-tied |
| Live docs: every late finding corrected where a live doc states it (re-sweep `CLAUDE.md:31`, `PROJECT.md:65`, `GOALS.md:31,83`) | |
| Memory: durable decisions and patterns captured | |
