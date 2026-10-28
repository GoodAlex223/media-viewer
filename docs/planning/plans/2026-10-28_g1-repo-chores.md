# G1 Repo Chores - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md § G1](../WEEKLY.md#g1-repo-chores-batch---repo-tooling--3-sp) · TODO 🟠 "Skip the pre-push E2E run when a push changes only paths the app never loads" (option 1 of BACKLOG 🔵 [2026-10-26] "Cut the pre-push E2E gate's cost: 10–12 min on every push that touches a non-docs file") · BACKLOG 🔵 [2026-10-28] "Retire the unused Context7 MCP server from `.mcp.json` and `.mcp.json.example`" · BACKLOG 🔵 [2026-10-22] "Add a LICENSE file (MIT, as `package.json` already declares)"
**Created**: 2026-10-28
**Status**: Approved — execute Native (user, 2026-10-28)
**Last Updated**: 2026-10-28

**Goal:** A push that changes only paths the app never loads skips the 10–12 min E2E run; the unused Context7 configuration is gone; the repo has a LICENSE file.

**Architecture:** `classifyPaths` in `scripts/check-e2e-needed.js` gains an explicit SKIP list; every path not on it stays RUN. The CLI's `git diff` gets `--no-renames`, so a moved file counts by its old path as well as its new one. A guard test fails if any RUN-classified file imports a file on the SKIP list. The other two chores are file deletions and one new file.

**Tech Stack:** Node CJS (the script), Vitest (tests), git, Husky v9 (unchanged).

**Spec:** none. This is a 3-SP small change, and the design was approved in chat on 2026-10-28 (brainstorm). It is recorded in § 2 below, which stands in for a spec.

## Global Constraints

- **Fail-safe**: a path that is not on the SKIP list is RUN, and any git, stdin or parse failure prints RUN. Both are unchanged from today.
- These never skip: `tests/e2e/`, `playwright.config.js`, `package.json` and `package-lock.json`.
- The CLI's stdout is exactly `RUN` or `SKIP`, and it never exits non-zero for a decision. `.husky/pre-push` is not edited.
- The copyright line is exactly `Copyright (c) 2025 GoodAlex223` (the user's ruling, 2026-10-28).
- This repository is public: no user file names, folder names or profile paths go into committed text.
- Code style: CommonJS in `scripts/`, Prettier (tabWidth 4, singleQuote, printWidth 120), LF.

## Review Focus

1. **An E2E test or an app file starts importing a file on the SKIP list.** A change to that file would then skip the suite that loads it. This is pinned by Task 3's guard test, with a planted control.
2. **A file moves between a runtime path and a SKIP path.** `git diff --name-only` lists only the new path of a rename. This was measured in a throwaway repo on 2026-10-28: `git mv main.js scripts/main.js` prints only `scripts/main.js`. Pinned by Task 2's CLI tests. The same gap exists today for moves into `docs/`.
3. **Prefix near-misses**: `docs-old/`, `scriptsx/`, `.claudex/`, `tests/integrationx/`, a nested `tests/sub/x.test.js` and a new top-level `tests/x.js` helper all RUN. Pinned by Task 1.
4. **Odd path spellings**: a path git quotes (`"scripts/\303\251.js"`, git's default `core.quotePath`), a backslash path, and a case variant (`Scripts/`) all RUN. This is the fail-safe direction. Pinned by Task 1.
5. **Paths that look like tooling but stay RUN**: `playwright.config.js`, `package.json`, `package-lock.json`, `LICENSE`, `.mcp.json.example`, `vendor/`, and a config name under a subfolder or with a suffix. Pinned by Task 1.

---

## 1. Task Overview

**Goal**: as above.

**Context**: PR #89 ran the 231-test suite (10–12 min) three times. Two of those runs changed only files the app never loads: `.claude/hooks/`, a unit test and the plan. G2's and G5's pushes this week are the same kind of change.

**Success Criteria**:
- [ ] Every class on the SKIP list skips, and a near-miss for each class runs (Task 1).
- [ ] A runtime file moved into `scripts/` or `docs/` runs E2E. A push that changes only `scripts/` skips, which shows the CLI can print SKIP at all (Task 2).
- [ ] No RUN-classified tracked file imports a SKIP-classified one, and the guard flags a planted import (Task 3).
- [ ] Run over this branch's own history, the CLI prints SKIP for the range through Task 3 and RUN for the whole branch (§ 7).
- [ ] `.mcp.json` and `.mcp.json.example` are gone, and `.gitignore:1` still ignores `.mcp.json` (Task 4).
- [ ] `LICENSE` matches GitHub's MIT template with the ruled copyright line, and README links to it (Task 5).

---

## 2. Analysis

### Approved design (brainstorm, 2026-10-28)

**SKIP list.** Paths not listed stay RUN.

| Class | Rule |
|---|---|
| Docs (existing) | any `*.md`; anything under `docs/` |
| Claude Code config | under `.claude/` |
| Maintenance scripts | under `scripts/` |
| Git hooks | under `.husky/` |
| Research prototypes | under `prototypes/` (G4's tree, not on `main` yet; the app never references it) |
| Unit tests | `tests/<name>.test.js` at the top of `tests/` only; under `tests/integration/`; the two unit-only helpers `tests/feature-cache-harness.js` and `tests/hash-pool-harness.js`, named exactly |
| Lint, format and unit-test configs | exactly `vitest.config.js`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` at the root |

These stay RUN by decision. `playwright.config.js` configures the E2E run itself, so only an E2E run checks it. `package.json` and the lockfile carry the dependencies and the entry point. `LICENSE`, `.vscode/`, `.superpowers/`, `.gitignore` and `.gitattributes` are cheap to add later (§ 6).

Measured 2026-10-28: no file under `tests/e2e/` imports anything from the top of `tests/` or from `scripts/`. Only unit tests import the two harness files.

**Renames.** The CLI diffs with `--no-renames`, so both paths of a move are classified.

**Context7.** Delete the untracked local `.mcp.json` (the user approved this 2026-10-28; its only server is `context7`, and its `--api-key` argument is empty). Delete the tracked `.mcp.json.example`, Claude's call, which the user accepted: an example with an empty server list teaches nothing. Remove `disabledMcpjsonServers` from the gitignored `.claude/settings.local.json`, and keep its `enabledPlugins` entries. Keep `.gitignore:1`. Add a dated correction beneath REVIEW-QUEUE.md § 1's "Already in use here" line. Frozen specs, plans, dated rows and the 2026-06-11 audit stay as written.

**LICENSE.** The standard MIT text, with `Copyright (c) 2025 GoodAlex223`. The year is the first-publication year (first commit 2025-06-21), and the holder is the GitHub handle. Both were Claude's suggestion, accepted by the user. README's § License links to the file, and `vendor/` keeps its own notices.

### Calls made in this plan (Claude's, for the user to check)

1. **Task 3's guard test** was not in the chat design. It enforces the design's premise: nothing a RUN path loads may sit on the SKIP list. Without it, that premise is a convention. It is a test only, with no behaviour change.
2. **The harness files are named exactly** rather than matched by a `tests/*.js` pattern, so a new top-level helper stays RUN until someone lists it (fail-safe).
3. **Git-quoted paths stay RUN.** The CLI does not switch to `-z` to unquote names, so a non-ASCII file name on the SKIP list runs the suite. That is the safe direction, and it is rare.
4. **The SKIP message changes** from "docs-only push" to "no path the app loads changed". The RUN messages are unchanged.

### Edge cases

| Case | Outcome |
|---|---|
| A runtime file deleted | its path is listed → RUN (unchanged) |
| A runtime file moved into a SKIP area | both paths are listed (`--no-renames`) → RUN |
| A multi-ref push, one ref all-SKIP and one with a runtime change | the union is classified → RUN (unchanged logic) |
| A change to `scripts/check-e2e-needed.js` itself | SKIP. The new gate judges its own push; its unit tests run at pre-commit. See § 6 for a stricter option |
| A change to `.husky/pre-push` | SKIP. Git runs the working-tree hook, so the edited hook is what decides |

### Risks

| Risk | Mitigation |
|---|---|
| A wrong SKIP lets a broken runtime change through | an explicit list, every unlisted path RUN, both-ways tests per class, Task 3's guard |
| The CLI test depends on git in `PATH` | git is required by the hook already; the test builds its repo under `os.tmpdir()` and removes it |

---

## 3. Implementation Plan

### Files Affected

| File | Change |
|---|---|
| `scripts/check-e2e-needed.js` | the SKIP list in `classifyPaths`; `--no-renames`; header comment, JSDoc and the SKIP message |
| `tests/check-e2e-needed.test.js` | both-ways cases, CLI tests, the guard |
| `CLAUDE.md:31` | the pre-push sentence |
| `PROJECT.md:65` | "skipped for docs-only pushes" comment (found by the live-surface preflight) |
| `.mcp.json` (untracked) | delete |
| `.mcp.json.example` | delete |
| `.claude/settings.local.json` (gitignored) | drop `disabledMcpjsonServers` |
| `docs/planning/REVIEW-QUEUE.md:57` | a dated correction beneath line 56–57 |
| `LICENSE` | create |
| `README.md:100–102` | link to `LICENSE` |
| `docs/planning/plans/README.md` | Current Plans row |

**Live-surface preflight** (plans README step 4): searched `README.md`, `PROJECT.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_CONTEXT.md`, `docs/README.md`, `.claude/`, `.husky/`, `scripts/` and `tests/` for the gate's claim (`git grep -i "pre-push\|docs-only push\|check-e2e-needed"`). Live claims were found in `CLAUDE.md:31`, `PROJECT.md:65` and the script's own comments, and all three are listed above. `CLAUDE.md:76` ("fails safe to RUN") stays true. The `docs/README.md` rows describe frozen CW-P documents.

### Model and Effort

Re-estimated after planning: **3 SP** holds (gate 2, Context7 0.5, LICENSE 0.5). Execute on **Sonnet · `high`**: the tasks are spelled out, and verification is the acceptance, so each class is tested both ways. Review **`max`** in a separate session, because a pre-push gate is a commit hook (§ 1.0 escalates one level). The planning session ran Opus, as WEEKLY's model line asked.

---

### Task 1: The SKIP list in `classifyPaths`

**Files:**
- Modify: `scripts/check-e2e-needed.js` (header comment lines 1–12, `classifyPaths` lines 34–50, the SKIP message line 116)
- Test: `tests/check-e2e-needed.test.js`

**Interfaces:**
- Produces: `classifyPaths(files: string[]): boolean`, with an unchanged signature: `true` = RUN, `false` = SKIP. Tasks 2 and 3 rely on it.

- [x] **Step 1: Write the failing tests.** In the existing `classifyPaths` test, remove `.husky/pre-push` from "returns true (run) for hook/config/html/css runtime paths", since it is a SKIP path now. Add:

```js
describe('classifyPaths — paths the app never loads skip E2E', () => {
    it.each([
        '.claude/hooks/format-edited-file.js',
        '.claude/settings.json',
        'scripts/check-e2e-needed.js',
        '.husky/pre-push',
        'prototypes/ai-sorting/harness.py',
        'tests/check-e2e-needed.test.js',
        'tests/integration/tournament-flow.test.js',
        'tests/feature-cache-harness.js',
        'tests/hash-pool-harness.js',
        'vitest.config.js',
        'eslint.config.mjs',
        '.prettierrc.json',
        '.prettierignore',
    ])('%s → SKIP', (p) => {
        expect(classifyPaths([p])).toBe(false);
    });

    it('skips a push made only of SKIP paths across classes', () => {
        expect(classifyPaths(['scripts/a.js', 'tests/a.test.js', '.claude/x.json', 'docs/x.txt', 'CLAUDE.md'])).toBe(false);
    });
});

describe('classifyPaths — near misses and look-alikes run E2E', () => {
    it.each([
        'tests/e2e/navigation.test.js',
        'tests/e2e/helpers/electron-app.js',
        'tests/e2e/fixtures/hash-fixtures.js',
        'tests/sub/nested.test.js',
        'tests/new-helper.js',
        'tests/integrationx/a.test.js',
        'scripts.js',
        'scriptsx/a.js',
        '.claudex/a.js',
        '.husky-old/pre-push',
        'docs-old/a.txt',
        'prototypes.js',
        'Scripts/a.js',
        'scripts\\a.js',
        '"scripts/\\303\\251.js"',
        'playwright.config.js',
        'package.json',
        'package-lock.json',
        'LICENSE',
        '.mcp.json.example',
        'vendor/lucide/lucide.min.js',
        'vitest.config.js.bak',
        'sub/vitest.config.js',
    ])('%s → RUN', (p) => {
        expect(classifyPaths([p])).toBe(true);
    });

    it('runs when one runtime path sits among SKIP paths', () => {
        expect(classifyPaths(['scripts/a.js', 'tests/a.test.js', '.claude/x.json', 'media-viewer.js'])).toBe(true);
    });
});
```

- [x] **Step 2: Run them and see them fail.** Run `npx vitest run tests/check-e2e-needed.test.js` from `C:/Users/alexm/Projects/media_viewer`. Expect 14 failures: all 13 SKIP rows and the all-SKIP mixed case, since today each of those paths classifies RUN. The 24 RUN cases already pass. They guard against an over-broad fix and are not the RED.
- [x] **Step 3: Implement.** In `scripts/check-e2e-needed.js`, add module-level constants above `classifyPaths`: `SKIP_DIRS` (prefixes ending in `/`: `docs/`, `.claude/`, `scripts/`, `.husky/`, `prototypes/`, `tests/integration/`), `SKIP_FILES` (a `Set` of the six exact paths), and `UNIT_TEST = /^tests\/[^/]+\.test\.js$/`. Add a comment saying these are paths the app never loads, and that anything else runs. `classifyPaths` keeps its empty-list and blank-entry handling, and a path is SKIP when it ends in `.md`, starts with a `SKIP_DIRS` entry, is in `SKIP_FILES`, or matches `UNIT_TEST`. Rewrite the header's "Conservative: RUN unless EVERY changed path is docs/markdown" sentence and the JSDoc to describe the list. Change the SKIP stderr line to `'pre-push: no path the app loads changed — skipping E2E.\n'`.
- [x] **Step 4: Run them and see them pass.** Same command. Expect PASS: 11 + 13 + 1 + 23 + 1 = 49 tests.
- [x] **Step 5: Commit.** `git add scripts/check-e2e-needed.js tests/check-e2e-needed.test.js`, then `git commit -m "feat(scripts): skip pre-push E2E for paths the app never loads"`.

### Task 2: Count both paths of a moved file

**Files:**
- Modify: `scripts/check-e2e-needed.js` (the `git diff` call in `changedFilesForRef`)
- Test: `tests/check-e2e-needed.test.js`
- Modify: `CLAUDE.md:31`, `PROJECT.md:65`

**Interfaces:**
- Consumes: Task 1's SKIP list (`scripts/` must be SKIP for the RED below).
- Produces: none for later tasks.

- [x] **Step 1: Write the failing tests.** Add a `describe('CLI on a real repo', { timeout: 30_000 }, …)`. A helper builds a repo under `fs.mkdtempSync(path.join(os.tmpdir(), 'mv-e2e-gate-'))`: `git init -q`, then write `main.js`, `scripts/a.js` and `docs/a.md` (each a few lines), then commit with `git -c user.name=t -c user.email=t@t commit -qm base`. A `decide(repo, base, head)` helper runs `spawnSync('node', [SCRIPT], { cwd: repo, input: \`refs/heads/x ${head} refs/heads/x ${base}\n\`, encoding: 'utf8' })`, where `SCRIPT` is `fileURLToPath(new URL('../scripts/check-e2e-needed.js', import.meta.url))`. A non-zero remote SHA makes the CLI diff against it, so no `origin` is needed. Remove each repo in `afterEach` with `fs.rmSync(dir, { recursive: true, force: true })`. Three tests:
  - `'prints SKIP for a push that changes only scripts/ (control: the CLI can skip)'`: edit `scripts/a.js` and commit. Expect `stdout === 'SKIP'` and `stderr` to contain `skipping E2E`.
  - `'prints RUN when a runtime file moves into scripts/'`: `git mv main.js scripts/main.js` and commit. Expect `stdout === 'RUN'`.
  - `'prints RUN when a runtime file moves into docs/'`: `git mv main.js docs/main.js` and commit. Expect `stdout === 'RUN'`.
- [x] **Step 2: Run them and see them fail.** Expect both move tests to FAIL with `stdout` `SKIP`, and the control to PASS. If the control fails too, the harness is broken: fix that first, because a CLI that never prints SKIP would make the move tests pass vacuously.
- [x] **Step 3: Implement.** Add `'--no-renames'` to the `git diff --name-only` arguments in `changedFilesForRef`, with a one-line comment saying a rename otherwise lists only its new path, so a runtime file moved into a SKIP area would skip.
- [x] **Step 4: Run them and see them pass.** Expect PASS: 52 tests in the file.
- [x] **Step 5: Update the live docs.**
  - `CLAUDE.md:31`: replace `(SKIP only when EVERY changed path is \`*.md\` or under \`docs/\`; any failure falls back to RUN)` with `(SKIP only when every changed path, a moved file's old path included, is one the app never loads: \`*.md\`, \`docs/\`, \`.claude/\`, \`scripts/\`, \`.husky/\`, \`prototypes/\`, the top-level unit tests and their two harnesses, \`tests/integration/\`, and the Vitest, ESLint and Prettier configs, never \`tests/e2e/\` or \`playwright.config.js\`; any failure falls back to RUN)`.
  - `PROJECT.md:65`: `(skipped for docs-only pushes)` becomes `(skipped when a push changes only paths the app never loads)`.
- [x] **Step 6: Commit.** `git add scripts/check-e2e-needed.js tests/check-e2e-needed.test.js CLAUDE.md PROJECT.md`, then `git commit -m "fix(scripts): count both paths of a moved file in the pre-push E2E gate"`.

### Task 3: Guard — nothing a RUN path loads is on the SKIP list

**Files:**
- Test: `tests/check-e2e-needed.test.js`

**Interfaces:**
- Consumes: `classifyPaths` (Task 1).

- [x] **Step 1: Write the guard and its planted control.** Add a test-local helper, `findSkipListImports(files: Array<{ path: string, source: string }>): string[]`. For each file, collect the relative specifiers: in any file, string literals starting with `./` or `../`; in `.html` files, also every `src="…"` and `href="…"` value with no `:` or `#`. Resolve each with `path.posix.normalize(path.posix.join(path.posix.dirname(file.path), spec))`. Return `"<file> → <resolved>"` for each one where `classifyPaths([resolved])` or `classifyPaths([resolved + '/x.js'])` is false. The second check covers a folder named without a trailing slash (`'./scripts'`). A comment states the helper's limits: it finds literal specifiers, not paths built from separate parts such as `path.join(__dirname, 'scripts', name)`. Two tests:
  - `'flags a planted import of a SKIP path (control)'`: input `[{ path: 'tests/e2e/a.test.js', source: "const x = require('../../scripts/x.js');" }, { path: 'index.html', source: '<script src="scripts/x.js"></script>' }, { path: 'main.js', source: "path.join(__dirname, './scripts')" }]`. Expect `['tests/e2e/a.test.js → scripts/x.js', 'index.html → scripts/x.js', 'main.js → scripts']`.
  - `'no tracked file that runs E2E imports a file on the SKIP list'`: run `git ls-files` with `execFileSync`, keep the paths where `classifyPaths([p])` is true, that end in `.js`, `.cjs`, `.mjs` or `.html`, and that are not under `vendor/`. Read each file, and expect `findSkipListImports(...)` to equal `[]`.
- [x] **Step 2: Run them.** Expect both to PASS: today's tree has no such import (measured 2026-10-28). The control is what shows the guard can fail. If the real-tree test reports an offender, read it: a string that is data rather than an import gets an explicit, commented exclusion in the test, and a real import means the SKIP list is wrong, so stop and report it.
- [x] **Step 3: Mutation check.** Make two temporary changes, one at a time, and confirm the control fails each time: (a) the helper returns `[]`; (b) the `resolved + '/x.js'` check is dropped, which should lose only `main.js → scripts`. Revert both. The file then holds 54 tests.
- [x] **Step 4: Commit.** `git add tests/check-e2e-needed.test.js`, then `git commit -m "test(scripts): guard that no E2E-loaded file imports a SKIP path"`.

### Task 4: Retire the Context7 MCP server

**Files:**
- Delete: `.mcp.json` (untracked), `.mcp.json.example`
- Modify: `.claude/settings.local.json` (gitignored), `docs/planning/REVIEW-QUEUE.md` (after line 57)

- [x] **Step 1: Re-read `.mcp.json`, masking any value.** Confirm that `context7` is still its only server and that the `--api-key` argument is still empty. If either has changed, stop and ask: the user's approval covered the file as described.
- [x] **Step 2: Delete both files.** Remove `.mcp.json` (approved by the user 2026-10-28), then `git rm .mcp.json.example`.
- [x] **Step 3: Edit `.claude/settings.local.json`.** Remove the `disabledMcpjsonServers` key and keep `enabledPlugins`. Verify with `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.local.json','utf8'))"`, which should exit 0.
- [x] **Step 4: Add the REVIEW-QUEUE correction.** Insert a new bullet beneath line 57, in the style of the 2026-10-27 one: `- _**Corrected 2026-10-28** (G1): Context7's \`.mcp.json\` server is retired. The local \`.mcp.json\` and the tracked \`.mcp.json.example\` are deleted, and \`disabledMcpjsonServers\` is gone from \`.claude/settings.local.json\`. The plugin copy stays off there and at user scope._`
- [x] **Step 5: Verify.**
  - `git check-ignore -v .mcp.json` prints `.gitignore:1:.mcp.json`.
  - `test ! -e .mcp.json && test ! -e .mcp.json.example` passes.
  - `git grep -n "mcp.json.example"` hits only dated or frozen text: `DONE.md`, `docs/security/`, `docs/superpowers/`, `docs/archive/`, and the BACKLOG, TODO and WEEKLY entries that Closeout ticks.
- [x] **Step 6: Commit.** `git add docs/planning/REVIEW-QUEUE.md` (the deletion is already staged), then `git commit -m "chore: retire the unused Context7 MCP server"`.

### Task 5: Add the LICENSE file

**Files:**
- Create: `LICENSE`
- Modify: `README.md:100–102`

- [ ] **Step 1: Write `LICENSE`.** Use GitHub's MIT template (`gh api licenses/mit --jq .body`), with `[year]` set to `2025` and `[fullname]` set to `GoodAlex223`. LF endings, and a trailing newline.
- [ ] **Step 2: Verify it against the source.** `diff <(gh api licenses/mit --jq .body | sed 's/\[year\]/2025/; s/\[fullname\]/GoodAlex223/') LICENSE` should print nothing, apart from a possible trailing-newline difference, which you note. `grep -c "Copyright (c) 2025 GoodAlex223" LICENSE` should print `1`.
- [ ] **Step 3: Edit README § License.** Replace the bare `MIT` with `MIT. See [LICENSE](LICENSE). The libraries under \`vendor/\` keep their own licenses.`
- [ ] **Step 4: Commit.** `git add LICENSE README.md`, then `git commit -m "docs: add the MIT LICENSE file"`.

---

## 4. Implementation Log

### 2026-10-28 — PHASE: Planning

- Branch `g1-repo-chores` from `main` `a3d00e8`. Brainstormed in chat: the user approved the gate design ("looks right"), the Context7 part and the `.mcp.json` delete ("Yes, OK"), and the copyright line Claude suggested.
- Found in recon: a rename lists only its new path (a probe in a throwaway repo). This widens with the SKIP list, and it already exists for `docs/`. Added `--no-renames` (Task 2).
- Baseline: 49 unit files, 2,375 passed, 1 skipped; `tests/check-e2e-needed.test.js` has 11.

### 2026-10-28 — PHASE: Execution (Native)

- Ledger: `.superpowers/sdd/2026-10-28_g1-repo-chores/progress.md` (git-ignored). The whole-branch review is not run in this session: `max`, in a separate session, asked first.
- **Task 1** (SKIP list): RED 14 failed / 35 passed of 49, as planned; GREEN 49/49. Renamed the edited test to "returns true (run) for config/html/css runtime paths", since its one hook path left it. The constants' comment also names `package.json` and the lockfile as never-SKIP (Global Constraints). The pre-commit full run hit one unrelated load flake (`tests/path-grants.test.js`'s case-sensitive-folder test timed out at 5.6 s against 5 s: an `fsutil.exe` spawn under the parallel suite; it passes alone). The refused commit left its files staged, and the retry was green: 2,413 passed, 1 skipped (2,375 + 38).
- **Task 2** (moved files): RED: the scripts/-only control printed SKIP, and both move tests printed SKIP (expected RUN). GREEN 52/52 with `--no-renames`; no `mv-e2e-gate-*` repo left in the temp folder. The CLI is spawned with `process.execPath` rather than `'node'`, so the test runs the same Node as Vitest. `CLAUDE.md:31` and `PROJECT.md:65` updated; no other live file says "docs-only".
- **Task 3** (guard): both tests passed on first run (54/54), as planned; the tree has no offender. Mutation (a), the helper returning `[]`, failed the control with all three entries missing; mutation (b), no `/x.js` probe, lost only `main.js → scripts`. Both reverted. Beyond the plan: a temporary intent-to-add `tests/e2e/zz-guard-probe.js` requiring `../../scripts/check-secrets.js` failed the real-tree test (`tests/e2e/zz-guard-probe.js → scripts/check-secrets.js`), which shows the `git ls-files` → filter → read path can fail too; the probe was removed. The real-tree test also asserts that it scanned more than 20 files, so an empty file list cannot pass it. The CLI tests' git helper now passes `-c core.autocrlf=false`, which silences the LF→CRLF warnings the system config printed into every pre-commit run.
- **Task 4** (Context7): re-read `.mcp.json` with values masked: `context7` was still its only server, with an empty `--api-key`, so the approval held. Deleted it and `git rm`'d `.mcp.json.example`. `.claude/settings.local.json` now holds only `enabledPlugins` (parses). REVIEW-QUEUE correction added at line 58. `git check-ignore -v .mcp.json` → `.gitignore:1:.mcp.json`. The remaining `mcp.json.example` hits are dated or frozen (the 2026-06-11 audit in `docs/archive/`, `docs/security/` and `docs/superpowers/specs/`, `DONE.md`, this plan, and the BACKLOG and WEEKLY entries closeout ticks), plus the `.mcp.json.example → RUN` test row, which tests a path string, not the file.

---

## 5. Key Discoveries

- `git diff --name-only` lists only the post-image path of a rename (diff.renames defaults on), so a path classifier sees only where a file went.

---

## 6. Future Improvements

### Enhancement Ideas

| Idea | Rationale | Effort | Priority |
|------|-----------|--------|----------|
| Force RUN when the push changes `scripts/check-e2e-needed.js` itself | the new gate judges its own push; a bug that wrongly SKIPs would let a runtime change in that same push through | XS | L |
| Name the path that forced RUN in the stderr note | today it says only "runtime code changed"; naming the path shows the user why a push waits, and which file to add to the list | XS | L |
| Add `LICENSE`, `.vscode/`, `.superpowers/`, `.gitignore` and `.gitattributes` to the SKIP list | none is loaded by the app; left RUN in G1 to keep the list to what the plan named | XS | L |
| Give `tests/path-grants.test.js`'s case-sensitive-folder test a longer timeout (🟤) | it spawns `fsutil.exe`, and under the parallel pre-commit run it took 5.6 s against Vitest's 5 s default, which refused a G1 commit (2026-10-28); it passes alone. Measure its spawn time under load before choosing a figure | XS | L |

### Spawned Tasks

| Task | Origin | Priority | Added to TODO.md |
|------|--------|----------|------------------|
| — | | | |

---

## 7. Testing

### Test Plan

- [ ] Unit: Tasks 1–3 (both ways per class, CLI on a real repo, guard with its planted control)
- [ ] Full `npx vitest run` from `C:/Users/alexm/Projects/media_viewer`: expect 49 files, and 2,375 + 43 = 2,418 passed, 1 skipped (Task 1 adds 38, Task 2 adds 3, Task 3 adds 2). Check the count, not just the exit code
- [ ] `npm run lint`; `npx prettier --check scripts/check-e2e-needed.js tests/check-e2e-needed.test.js`; `node scripts/check-docs-index.js`
- [ ] **Dogfood, both ways, on this branch's history.** `printf "refs/heads/g1-repo-chores <Task-3 SHA> refs/heads/g1-repo-chores $(git rev-parse origin/main)\n" | node scripts/check-e2e-needed.js` should print `SKIP`. The same with `HEAD` should print `RUN`, because Task 4 deletes `.mcp.json.example` and Task 5 adds `LICENSE`
- [ ] Push: the hook prints RUN and the full E2E suite passes. If only the known flake fails (TODO 🟠 "Ctrl+A undo restores the previous pair after a pick", G2's item), re-push once and record it here

### Test Results

| Test | Result | Notes |
|------|--------|-------|
| | | |

---

## 8. Review

- [ ] Self-review complete
- [ ] Code review in a separate session at `max`
- [ ] User approved

---

## 9. Closeout Artifacts

| Artifact | Done / N/A + reason |
|----------|---------------------|
| `BACKLOG.md` — improvements extracted (min 2, routed by source); annotate 🔵 [2026-10-26] (option 1 shipped, options 2–4 stay) and 🟡 [2026-07-10]; close 🔵 [2026-10-28] Context7 and 🔵 [2026-10-22] LICENSE | |
| `TODO.md` — tick the 🟠 SKIP-list item | |
| `DONE.md` — entry with plan link, summary, key changes | |
| `WEEKLY.md` — G1's Summary-Table Status and its Daily-Schedule row, each `✅ <merge-SHA>` | |
| `docs/README.md` — plan under Archived Plans (no spec) | |
| `docs/archive/plans/` — plan moved here, original deleted | |
