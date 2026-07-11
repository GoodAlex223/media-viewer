# CW-P: Process & DX Guardrails — Implementation Plan

**Status:** Complete (2026-07-10) — all 5 tasks implemented via subagent-driven development (controller commits); per-task reviews Approved; final whole-branch review (opus) "Ready to merge: Yes" with one Minor (stdin-read fail-safe → RUN) folded in (`018f0d2`). 434/434 unit, full E2E 52/52, lint 0-err, format clean. On branch `cleanup/cw-p-process-dx-guardrails` (PR/merge pending at archive time).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land three process/DX guardrails on one branch/PR — an automated pre-push E2E gate, a consolidated Weekly-Reviews methodology, and a ref-sweep convention in CLAUDE.md.

**Architecture:** Item 1 mirrors the existing `scripts/check-secrets.js` precedent — pure, unit-tested decision helpers (`parsePushRefs`, `classifyPaths`) in a CJS module, a thin fail-safe git-wrapper CLI, and a plain-sh Husky v9 `pre-push` hook that runs the Playwright suite only when the outgoing push changes runtime code. Items 2 and 3 are documentation edits.

**Tech Stack:** Node CommonJS (`scripts/`), Vitest (unit), Husky v9.1.7 (git hooks), Playwright (E2E, invoked by the hook), Markdown (docs).

## Global Constraints

- **Prettier** (enforced on staged `*.{js,cjs}` by the pre-commit hook): `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. `.gitattributes` enforces LF. Prettier **ignores** `docs/` and `*.md` (so items 2/3 have no format gate — manual review is the gate; `CLAUDE.md` is `*.md` → also Prettier-ignored).
- **ESLint:** the `scripts/**/*.js` block already exists (`eslint.config.mjs` ~line 241, Node CJS, `sharedRules` + `no-undef`) — **no eslint change needed**. `sharedRules` include `eqeqeq`, `curly`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn). Prefix intentionally-unused caught errors with `_` (`caughtErrorsIgnorePattern: '^_'`).
- **CJS in scripts; ESM tests import via `createRequire`:** `const require = createRequire(import.meta.url); const {...} = require('../scripts/check-e2e-needed.js');`.
- **Husky v9.1.7 format:** hook files are plain sh — **no shebang, no `husky.sh` sourcing** (match the existing `.husky/pre-commit`). The `.husky/_/pre-push` wrapper is already installed, so creating `.husky/pre-push` activates it with no husky reconfiguration.
- **Pre-commit hook runs on every commit:** `node scripts/check-secrets.js` → `npx lint-staged` → `npx vitest run` (full unit suite, currently 423 tests). Every task's commit passes through it.
- **Conservative classification:** E2E runs unless **every** changed path is `*.md` or under `docs/`. Any unrecognized path counts as runtime. "Run when unsure."
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Spec:** [docs/superpowers/specs/2026-07-10-cw-p-process-dx-guardrails-design.md](../specs/2026-07-10-cw-p-process-dx-guardrails-design.md).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/check-e2e-needed.js` | Pure `parsePushRefs` + `classifyPaths` (unit-tested) + a thin fail-safe git-wrapper CLI that prints `RUN`/`SKIP`. |
| `tests/check-e2e-needed.test.js` | Vitest units for the two pure helpers. |
| `.husky/pre-push` | Runs `npx playwright test` only on a `RUN` decision; `\|\| echo RUN` fail-safe. |
| `docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md` | + canonical `## Methodology` section (6 fixes). |
| `docs/planning/REVIEW-QUEUE.md` | Hybrid-sourcing intro + operative-defaults pointer clause. |
| `CLAUDE.md` | One Best-Practices bullet (ref-sweep convention). |
| `docs/planning/WEEKLY.md`, `docs/planning/BACKLOG.md` | Closeout check-offs (Task 5). |

---

## Task 1: Pure decision helpers (`parsePushRefs`, `classifyPaths`)

**Files:**
- Create: `scripts/check-e2e-needed.js` (pure functions + `module.exports` only — the CLI block is added in Task 2)
- Test: `tests/check-e2e-needed.test.js`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - `parsePushRefs(stdin: string): Array<{localRef, localSha, remoteRef, remoteSha}>` — parses git pre-push stdin; drops branch-delete refs (all-zero `localSha`); blank input → `[]`.
  - `classifyPaths(files: string[]): boolean` — `true` (run E2E) if any path is runtime; `false` only when every path is `*.md`/`docs/**` or the list is empty.

- [x] **Step 1: Write the failing tests**

Create `tests/check-e2e-needed.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parsePushRefs, classifyPaths } = require('../scripts/check-e2e-needed.js');

const ZEROS = '0000000000000000000000000000000000000000';
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('parsePushRefs', () => {
    it('parses a single ref line', () => {
        const refs = parsePushRefs(`refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}\n`);
        expect(refs).toEqual([
            { localRef: 'refs/heads/main', localSha: SHA_A, remoteRef: 'refs/heads/main', remoteSha: SHA_B },
        ]);
    });

    it('parses multiple ref lines', () => {
        const stdin = `refs/heads/a ${SHA_A} refs/heads/a ${SHA_B}\n` + `refs/heads/b ${SHA_B} refs/heads/b ${ZEROS}\n`;
        expect(parsePushRefs(stdin)).toHaveLength(2);
    });

    it('drops a branch-delete ref (all-zero localSha)', () => {
        const stdin = `(delete) ${ZEROS} refs/heads/gone ${SHA_B}\n`;
        expect(parsePushRefs(stdin)).toEqual([]);
    });

    it('preserves a new-branch ref (all-zero remoteSha) with its zero remoteSha', () => {
        const refs = parsePushRefs(`refs/heads/new ${SHA_A} refs/heads/new ${ZEROS}\n`);
        expect(refs).toHaveLength(1);
        expect(refs[0].remoteSha).toBe(ZEROS);
    });

    it('returns [] for empty or whitespace-only stdin', () => {
        expect(parsePushRefs('')).toEqual([]);
        expect(parsePushRefs('   \n  \n')).toEqual([]);
    });
});

describe('classifyPaths', () => {
    it('returns false (skip) when every path is markdown', () => {
        expect(classifyPaths(['CLAUDE.md', 'docs/planning/WEEKLY.md', 'README.md'])).toBe(false);
    });

    it('returns false (skip) when every path is under docs/ (incl. non-md)', () => {
        expect(classifyPaths(['docs/superpowers/specs/x.md', 'docs/planning/notes.txt'])).toBe(false);
    });

    it('returns true (run) when any path is a JS source file', () => {
        expect(classifyPaths(['docs/planning/WEEKLY.md', 'media-viewer.js'])).toBe(true);
    });

    it('returns true (run) for hook/config/html/css runtime paths', () => {
        expect(classifyPaths(['.husky/pre-push'])).toBe(true);
        expect(classifyPaths(['index.html'])).toBe(true);
        expect(classifyPaths(['styles.css'])).toBe(true);
        expect(classifyPaths(['package.json'])).toBe(true);
        expect(classifyPaths(['tests/e2e/navigation.test.js'])).toBe(true);
    });

    it('returns false (skip) for an empty list', () => {
        expect(classifyPaths([])).toBe(false);
    });

    it('treats a root-level .md as docs (skip)', () => {
        expect(classifyPaths(['CLAUDE.md'])).toBe(false);
    });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/check-e2e-needed.test.js`
Expected: FAIL — `Cannot find module '../scripts/check-e2e-needed.js'`.

- [x] **Step 3: Write the minimal implementation**

Create `scripts/check-e2e-needed.js`:

```javascript
// Pre-push E2E gate decision helper.
//
// Reads git's pre-push stdin (one `<local_ref> <local_sha> <remote_ref> <remote_sha>`
// line per pushed ref), computes the changed-file set for the outgoing range, and prints
// `RUN` or `SKIP` to stdout. `.husky/pre-push` runs the Playwright E2E suite only on
// `RUN`. Conservative: RUN unless EVERY changed path is docs/markdown.
//
// `parsePushRefs` and `classifyPaths` are pure and unit-tested. The CLI section (added in
// Task 2) is a thin, fail-safe git wrapper: it prints RUN on any git/parse failure so a
// broken lookup never silently skips the suite, and it never exits non-zero for a decision
// (the hook decides whether to run E2E from the printed token, so the script itself never
// blocks the push).

const ZERO_SHA = /^0+$/;

/**
 * Parse git pre-push stdin into ref tuples. Branch-delete refs (local sha all-zeros —
 * nothing to test) are dropped. Blank/empty input → [].
 * @param {string} stdin
 * @returns {Array<{localRef:string, localSha:string, remoteRef:string, remoteSha:string}>}
 */
function parsePushRefs(stdin) {
    if (!stdin) return [];
    const refs = [];
    for (const line of stdin.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [localRef, localSha, remoteRef, remoteSha] = trimmed.split(/\s+/);
        if (!localSha || ZERO_SHA.test(localSha)) continue;
        refs.push({ localRef, localSha, remoteRef, remoteSha });
    }
    return refs;
}

/**
 * Decide whether the E2E suite must run for a set of changed paths. Returns true (RUN) if
 * ANY path is runtime code; false (SKIP) only when every path is documentation (`*.md` or
 * under `docs/`) or the list is empty. Conservative — an unrecognized path counts as runtime.
 * @param {string[]} files
 * @returns {boolean}
 */
function classifyPaths(files) {
    if (!files || files.length === 0) return false;
    return files.some((f) => {
        const p = (f || '').trim();
        if (!p) return false;
        if (p.endsWith('.md')) return false;
        if (p.startsWith('docs/')) return false;
        return true;
    });
}

module.exports = { parsePushRefs, classifyPaths };
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/check-e2e-needed.test.js`
Expected: PASS (all 11 cases green — 5 `parsePushRefs` + 6 `classifyPaths`).

- [x] **Step 5: Lint the new script**

Run: `npx eslint scripts/check-e2e-needed.js tests/check-e2e-needed.test.js`
Expected: no errors (warnings allowed, but there should be none).

- [x] **Step 6: Commit**

```bash
git add scripts/check-e2e-needed.js tests/check-e2e-needed.test.js
git commit -m "$(cat <<'EOF'
feat(scripts): add pure pre-push E2E-gate decision helpers

parsePushRefs + classifyPaths (check-secrets.js precedent): parse git
pre-push stdin, drop delete refs; classify a changed-file set as run
(any runtime path) vs skip (docs/markdown only). Unit-tested; CLI + hook
follow in the next task.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: CLI wrapper + `.husky/pre-push` hook

**Files:**
- Modify: `scripts/check-e2e-needed.js` (append the `if (require.main === module)` CLI block after `module.exports`)
- Create: `.husky/pre-push`

**Interfaces:**
- Consumes: `parsePushRefs`, `classifyPaths` from Task 1 (module scope).
- Produces: a CLI that reads stdin (git pre-push format) and writes `RUN` or `SKIP` to stdout (human notes to stderr); `.husky/pre-push` that runs `npx playwright test` on `RUN`.

- [x] **Step 1: Append the CLI block to `scripts/check-e2e-needed.js`**

Add **after** the `module.exports = { parsePushRefs, classifyPaths };` line:

```javascript

// --- CLI: read git's pre-push stdin, print RUN/SKIP for the hook to consume ---
if (require.main === module) {
    const { execFileSync } = require('child_process');
    const fs = require('fs');

    // Changed files for one ref; returns null on any git failure (caller forces RUN).
    const changedFilesForRef = (ref) => {
        try {
            let base;
            if (ZERO_SHA.test(ref.remoteSha || '')) {
                // New branch on remote → diff vs the merge-base with main.
                base = execFileSync('git', ['merge-base', 'origin/main', ref.localSha], {
                    encoding: 'utf8',
                }).trim();
            } else {
                base = ref.remoteSha;
            }
            if (!base) return null;
            return execFileSync('git', ['diff', '--name-only', base, ref.localSha], { encoding: 'utf8' })
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
        } catch (_err) {
            return null;
        }
    };

    const decide = () => {
        let stdin = '';
        try {
            stdin = fs.readFileSync(0, 'utf8');
        } catch (_err) {
            stdin = '';
        }
        const refs = parsePushRefs(stdin);
        if (refs.length === 0) {
            process.stderr.write('pre-push: no pushable refs — skipping E2E.\n');
            return 'SKIP';
        }
        const allFiles = [];
        for (const ref of refs) {
            const files = changedFilesForRef(ref);
            if (files === null) {
                process.stderr.write('pre-push: could not determine changed files — running E2E (fail-safe).\n');
                return 'RUN';
            }
            allFiles.push(...files);
        }
        if (classifyPaths(allFiles)) {
            process.stderr.write('pre-push: runtime code changed — running E2E.\n');
            return 'RUN';
        }
        process.stderr.write('pre-push: docs-only push — skipping E2E.\n');
        return 'SKIP';
    };

    process.stdout.write(decide());
}
```

- [x] **Step 2: Create the hook `.husky/pre-push`**

```sh
decision=$(node scripts/check-e2e-needed.js || echo RUN)
if [ "$decision" = "RUN" ]; then
    echo "pre-push: running the E2E suite before push (bypass a WIP push with: git push --no-verify)…"
    npx playwright test
fi
```

- [x] **Step 3: Dry-run the CLI — no-refs → SKIP**

Run: `printf '' | node scripts/check-e2e-needed.js; echo " <-decision"`
Expected: stderr `pre-push: no pushable refs — skipping E2E.` and stdout `SKIP <-decision`.

- [x] **Step 4: Dry-run the CLI — empty diff (base == head) → SKIP**

Run:
```bash
H=$(git rev-parse HEAD); printf "refs/heads/x $H refs/heads/x $H\n" | node scripts/check-e2e-needed.js; echo " <-decision"
```
Expected: `git diff HEAD HEAD` is empty → `classifyPaths([])` → stdout `SKIP <-decision`.

- [x] **Step 5: Dry-run the CLI — docs-only real diff → SKIP**

Run (uses the spec commit, which changed only a `docs/**` file):
```bash
S=$(git log --grep='add CW-P process' --format=%H -1); printf "refs/heads/x $S refs/heads/x $S~1\n" | node scripts/check-e2e-needed.js; echo " <-decision"
```
Expected: diff is `docs/superpowers/specs/2026-07-10-…md` only → stdout `SKIP <-decision`.

- [x] **Step 6: Dry-run the CLI — this branch vs origin/main (new-branch path) → RUN**

Run:
```bash
H=$(git rev-parse HEAD); printf "refs/heads/x $H refs/heads/x 0000000000000000000000000000000000000000\n" | node scripts/check-e2e-needed.js; echo " <-decision"
```
Expected: merge-base(origin/main, HEAD) diff includes `scripts/` + `.husky/` + `tests/` → stdout `RUN <-decision`. (If `origin/main` is not fetched locally, the fail-safe also yields `RUN` — either way, `RUN`.)

- [x] **Step 7: Lint**

Run: `npx eslint scripts/check-e2e-needed.js`
Expected: no errors (the `_err` caught-error prefix satisfies `no-unused-vars`).

- [x] **Step 8: Commit**

```bash
git add scripts/check-e2e-needed.js .husky/pre-push
git commit -m "$(cat <<'EOF'
feat(husky): add code-aware pre-push E2E gate

CLI wrapper around parsePushRefs/classifyPaths: reads git pre-push stdin,
diffs the outgoing range (merge-base vs origin/main for a new branch, else
remoteSha), prints RUN/SKIP. .husky/pre-push runs `npx playwright test` only
on RUN, with a `|| echo RUN` fail-safe so a crash never silently skips. Docs-
only pushes skip; --no-verify bypasses WIP. Closes the no-CI "silently-broken
E2E can land" gap (pre-commit runs unit only) — PR #56 root cause.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

> **Note:** the actual first *push* of this branch will trigger the hook and run the full E2E suite (~2m05s, 52 tests) because `.husky/`+`scripts/`+`tests/` changed — this is the intended dogfood. Confirm it goes green at push time.

---

## Task 3: Consolidate the Weekly-Reviews methodology (docs)

**Files:**
- Modify: `docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md` (add a canonical `## Methodology` section)
- Modify: `docs/planning/REVIEW-QUEUE.md` (hybrid-sourcing intro + pointer clause)

**Interfaces:** none (docs).

- [x] **Step 1: Append the canonical Methodology section to the first-run spec**

Add at the **end** of `docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md` (after the "First-run retro (2026-06-26)" section — the retro stays as the historical "why"; this section is the operative "how"):

```markdown

---

## Methodology (canonical — current practice)

This section is the operative "how we run Weekly Reviews" reference, superseding **D2** in the
Decisions block above. It consolidates every methodology fix surfaced across the first two runs.

1. **Lightweight inline research is the default.** Use a few targeted `WebSearch` + 2–3 `WebFetch`
   per category, in the main thread. Do **not** invoke the deep-research harness for a routine
   review — the first run's 4 harness runs burned ~8M tokens and the adversarial-verification phase
   never completed once. Reserve the harness for a rare, explicitly-requested single deep dive.
   *(retro [2026-06-26])*
2. **Never fan out multiple harnesses in parallel.** If the harness is used at all, run **one
   workflow at a time** — the parallel multi-agent burst is what tripped server-side rate limiting.
   *(retro [2026-06-26])*
3. **Recognize docs-only PRs before the `/code-review` fan-out.** A Weekly-Reviews PR is
   docs-only (Prettier already ignores `docs/`/`*.md`), so `/code-review` cannot surface a code
   finding. Pre-check `gh pr view <N> --json files`; if every changed path is `*.md`/`docs/**` with
   no code/config, treat it as docs-only and skip the agent fan-out (post a docs-only acknowledgment
   instead of the standard "No issues found" template). *([2026-06-29])*
4. **Merge or explicitly defer the docs-only PR in its originating session.** The recurring
   Weekly-Reviews PR carries no code risk (the pre-commit hook already gates the docs). Close the
   loop in-session: either merge it, or, if intentionally parking it, drop a dated
   "merge pending — <reason>" note in WEEKLY.md so it isn't a silent stale branch. *([2026-06-29])*
5. **Hybrid candidate sourcing is the default.** Each week, per category, fresh-check the live
   landscape (a `WebSearch` for the current best) **and** consider the parked *Next-up* item, then
   review whichever is strongest — do not rote-pick the parked item first. On 2026-07-05 a
   parked-first pass would have surfaced only weak picks; the fresh check found the two real adopts
   (`typescript-lsp`, autonomous verification). *([2026-07-06])*
6. **Run-card, not a fresh spec + plan, for this codified-repeat task.** Because the methodology is
   already codified here, a Weekly-Reviews run needs only brainstorm → a short run-card → execute;
   the brainstorming design-gate is satisfied by approving the run-card. Recurring ⚪-overhead tasks
   whose method is already codified do **not** need a fresh `writing-plans` cycle each time.
   *([2026-07-06])*
```

- [x] **Step 2: Update the REVIEW-QUEUE.md intro**

In `docs/planning/REVIEW-QUEUE.md`, replace the sourcing clause of the first paragraph. Change:

```
Each week, per category: pick the top **not-yet-reviewed** candidate (a parked **Next-up** item first, else the current live top hit via web search, excluding the Reviewed log); do a short review; append a verdict row (`adopt | pass | defer`); park notable runners-up under **Next-up**. On an `adopt`, also file a 🟤 Auto-Generated entry in BACKLOG.md.
```

to:

```
Each week, per category, use **hybrid sourcing**: fresh-check the live landscape (a `WebSearch` for the current best, excluding the Reviewed log) **and** consider the parked **Next-up** item, then review whichever is strongest — do not rote-pick the parked item. Use **lightweight inline research** (a few `WebSearch` + 2–3 `WebFetch`; never the deep-research harness for a routine review). Append a verdict row (`adopt | pass | defer`); park notable runners-up under **Next-up**. On an `adopt`, also file a 🟤 Auto-Generated entry in BACKLOG.md.
```

- [x] **Step 3: Extend the REVIEW-QUEUE.md Methodology pointer**

Change the **Methodology** line:

```
**Methodology**: see [`docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md`](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md) — the reusable "how we run Weekly Reviews" reference (hybrid relevance lens, depth, verdict rubric).
```

to:

```
**Methodology**: see the **Methodology (canonical — current practice)** section of [`docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md`](../superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md) — the reusable "how we run Weekly Reviews" reference (hybrid sourcing, lightweight inline research, docs-only-PR handling, run-card path, verdict rubric).
```

- [x] **Step 4: Verify the edits render + links resolve**

Run: `git diff --stat docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md docs/planning/REVIEW-QUEUE.md`
Read both changed regions back; confirm: the new `## Methodology` section has all 6 numbered fixes, the REVIEW-QUEUE intro reads hybrid + lightweight, and the relative link `../superpowers/specs/…` is unchanged (still valid).

- [x] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md docs/planning/REVIEW-QUEUE.md
git commit -m "$(cat <<'EOF'
docs(wr): consolidate Weekly-Reviews methodology (6 fixes)

Fold the 6 methodology fixes scattered across 3 intake dates into a canonical
"Methodology (current practice)" section of the first-run spec (supersedes D2):
lightweight inline research over the deep-research harness; no parallel harness
fan-out; recognize docs-only PRs pre-/code-review; merge/defer docs-only PR
in-session; hybrid fresh-check+parked sourcing; run-card path for codified
repeats. Update REVIEW-QUEUE.md intro to hybrid sourcing + the pointer clause.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Ref-sweep convention (CLAUDE.md)

**Files:**
- Modify: `CLAUDE.md` (one bullet in the "Best Practices" list)

**Interfaces:** none (docs).

- [x] **Step 1: Add the bullet**

In `CLAUDE.md`, under `## Best Practices` → "When modifying this codebase:", insert a new bullet immediately **after** the line `- The renderer file is large — search before adding duplicates`:

```markdown
- When removing or relocating a **named** function / handler / call site, grep the whole repo for the symbol across **tests and comments** — not just live callers — and update or delete each hit before committing. The unit-only pre-commit hook won't catch a stale E2E assertion or a stale code comment (root cause of the PR #56 follow-ups).
```

- [x] **Step 2: Verify**

Run: `git diff CLAUDE.md`
Expected: exactly one added bullet in the Best Practices list; no other lines changed.

- [x] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude-md): add ref-sweep convention to Best Practices

When removing a named call site, grep tests AND comments (not just live
callers) before committing — the unit-only pre-commit hook won't catch a
stale E2E assertion or comment (PR #56 root cause). Folds the one 🟤 item
into Group CW-P.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Closeout (WEEKLY + BACKLOG check-offs)

> Run at task completion, after user approval + PR merge (the Summary-Table status needs the PR number). Per the CLAUDE.md "Task Completion" workflow.

**Files:**
- Modify: `docs/planning/WEEKLY.md`
- Modify: `docs/planning/BACKLOG.md`

- [x] **Step 1: Check off the WEEKLY.md CW-P task boxes**

In `docs/planning/WEEKLY.md`, flip the three CW-P group boxes (lines ~72–74) `- [ ]` → `- [x]` and the Friday-schedule CW-P line (~157) `- [ ]` → `- [x]`.

- [x] **Step 2: Update the WEEKLY.md Summary Table**

Set the CW-P row Status (line ~180) from `Planned` to `✅ **MERGED <date> via PR #N** (merge <sha>, …)` once merged (use the real PR number + merge SHA — never a bare `✅`).

- [x] **Step 3: Check off the folded BACKLOG entries**

In `docs/planning/BACKLOG.md`, mark the constituent entries `- [x]` with a `✅ done <date> (CW-P, PR #N)` annotation:
- `[2026-06-26]` PR #56 process observations — "No automated gate runs E2E…" (item 1) + "Adopt a 'sweep references when removing a named call site' convention" (item 3).
- `[2026-06-26]`/`[2026-06-29]` Weekly-Reviews methodology follow-ups: "Recognize docs-only PRs before the `/code-review` fan-out" + "Merge or explicitly defer a Weekly Reviews docs-only PR in its originating session".
- `[2026-07-06]` PR #62 post-merge follow-ups (both fold into item 2): "Codify hybrid 'fresh-check + best pick' candidate sourcing…" + "Codify the 'run-card instead of full spec + plan' lightweight path…".

- [x] **Step 4: Commit**

```bash
git add docs/planning/WEEKLY.md docs/planning/BACKLOG.md
git commit -m "$(cat <<'EOF'
docs(planning): CW-P closeout — check off WEEKLY + folded BACKLOG entries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

- [x] Full unit suite green: `npx vitest run` → 423 → 434 (Task 1 adds 11 cases).
- [x] Lint clean: `npm run lint`.
- [x] Format clean: `npm run format:check` (JS only; `docs/` + `*.md` ignored).
- [x] E2E baseline intact: `npx playwright test` → 52/52.
- [x] Hook dogfood: pushing the branch triggers the E2E run (RUN decision) and goes green.
- [x] Spec acceptance criteria (§5 of the spec) all satisfied.
- [x] `/code-review` (this PR is not docs-only — item 1 adds a hook + script).

---

## Self-Review (completed during planning)

**Spec coverage:** item 1 → Tasks 1–2; item 2 → Task 3; item 3 → Task 4; closeout → Task 5. All spec §2–§4 requirements mapped.
**Placeholder scan:** no TBD/TODO/"add error handling"; every code + doc step shows the actual content.
**Type consistency:** `parsePushRefs`/`classifyPaths` signatures identical across Task 1 (definition), Task 1 tests, and Task 2 (CLI consumer). `RUN`/`SKIP` string tokens consistent between the CLI (`process.stdout.write`) and the hook (`[ "$decision" = "RUN" ]`).
