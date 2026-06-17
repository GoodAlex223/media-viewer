# CW-4: Process & Security Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dependency-free pre-commit secret guard and harden the pre-archive checklist docs, batched into one branch / one PR.

**Architecture:** A pure CommonJS detector (`scanForSecrets`) + a pure diff parser (`extractAddedLines`) live in `scripts/check-secrets.js`; both are unit-tested. A thin CLI section shells out to `git diff --cached`, runs the two pure functions, and sets the exit code. `.husky/pre-commit` calls the script first (fail-fast). Item 2 is documentation-only edits to two tracked archive READMEs.

**Tech Stack:** Node.js (CommonJS), Vitest, ESLint flat config, Husky v9.

**Spec:** [docs/superpowers/specs/2026-06-17-cw-4-process-security-guards-design.md](../specs/2026-06-17-cw-4-process-security-guards-design.md)

## Global Constraints

- **No new runtime dependency** — secret guard uses only Node built-ins (`child_process`) + regex.
- **CommonJS** for `scripts/*.js` (`require`, `module.exports`, `require.main === module` CLI guard).
- **Self-reference safety** — regex patterns match full token *shape* (not bare prefixes); test fixtures build real-shape tokens by **concatenation** so no full-shape literal sits on disk; docs reference bare prefixes / regex only.
- **Branch must NOT touch `.gitignore`** (CW-3 boundary) and must NOT edit the global `.claude/TEMPLATES/plan.md` (uncommittable).
- **Detector reports *what*, not *where*** — `scanForSecrets(text)` returns `[{pattern, match}]`; the CLI owns file/line context.
- Pre-commit hook order after this work: `node scripts/check-secrets.js` → `npx lint-staged` → `npx vitest run`.
- ESLint: CJS modules imported in ESM tests via `createRequire(import.meta.url)` then `require('../scripts/check-secrets.js')`.
- Prettier: tabWidth=4, useTabs=false, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always, endOfLine="lf".

---

## File Structure

| File | Responsibility |
|------|----------------|
| `scripts/check-secrets.js` (create) | `scanForSecrets(text)` + `extractAddedLines(diffText)` (pure, exported) + CLI `main()` behind `require.main === module` guard. |
| `tests/check-secrets.test.js` (create) | Vitest unit tests for both pure functions. |
| `eslint.config.mjs` (modify) | Add a `scripts/**/*.js` block (Node CJS, `sharedRules` + `no-undef`). |
| `.husky/pre-commit` (modify) | Prepend the secret scan before lint-staged/vitest. |
| `docs/archive/plans/README.md` (modify) | Add the recurring-drift steps to "Complete Archive Process" + "Quick Checklist". |
| `docs/planning/plans/README.md` (modify) | Mirror the checklist items in "After Completion". |

---

## Task 1: Secret detector `scanForSecrets` + ESLint scaffolding

**Files:**
- Modify: `eslint.config.mjs` (add `scripts/` block)
- Create: `scripts/check-secrets.js` (detector + exports only)
- Test: `tests/check-secrets.test.js`

**Interfaces:**
- Produces: `scanForSecrets(text: string) => Array<{ pattern: string, match: string }>` — one entry per *distinct* marker category found in `text` (empty array ⇒ none). Exported via `module.exports`.

- [ ] **Step 1: Add the `scripts/` ESLint block**

In `eslint.config.mjs`, insert this block immediately **after** block `5b` (the E2E test files block ending at the `},` before `eslintConfigPrettier`) and before the `// Disable ESLint rules that conflict with Prettier` comment:

```js
    // 6. Build / maintenance scripts (Node CJS — run via `node scripts/*.js`)
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
        rules: {
            ...sharedRules,
            'no-undef': 'error',
        },
    },
```

Also update the header comment block: change the count line `//   Ten file-group blocks:` to `//   Twelve file-group blocks:` and add a new line after the `5b.` entry:

```
//   6.  Build / maintenance scripts — scripts/**/*.js (Node CJS)
```

- [ ] **Step 2: Write the failing tests for `scanForSecrets`**

Create `tests/check-secrets.test.js`. Note the concatenation in fixtures — no full-shape literal lives on disk:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { scanForSecrets } = require('../scripts/check-secrets.js');

// Real-shape sample tokens, assembled at runtime so no literal secret
// sits in this file (would otherwise be flagged by the guard scanning itself).
const SAMPLES = {
    aws: 'AKIA' + 'ABCDEFGHIJKLMNOP', // AKIA + 16 uppercase/digits
    github: 'ghp_' + 'a'.repeat(36),
    githubFamily: 'ghs_' + 'B'.repeat(36),
    slack: 'xoxb-' + '1'.repeat(20),
    google: 'AIza' + 'a'.repeat(35),
    // Split mid-"PRIVATE" so no full-shape literal sits on disk (would otherwise
    // be a real match for the private-key pattern when the guard scans this file).
    privKey: '-----BEGIN OPENSSH PRIV' + 'ATE KEY-----',
    privKeyPlain: '-----BEGIN PRIV' + 'ATE KEY-----',
};

describe('scanForSecrets — positive detection', () => {
    it('detects an AWS access key ID', () => {
        const hits = scanForSecrets(`const k = "${SAMPLES.aws}";`);
        expect(hits.map((h) => h.pattern)).toContain('AWS access key ID');
    });
    it('detects a GitHub token (ghp_)', () => {
        expect(scanForSecrets(SAMPLES.github).map((h) => h.pattern)).toContain('GitHub token');
    });
    it('detects the broader GitHub token family (ghs_)', () => {
        expect(scanForSecrets(SAMPLES.githubFamily).map((h) => h.pattern)).toContain('GitHub token');
    });
    it('detects a Slack token', () => {
        expect(scanForSecrets(SAMPLES.slack).map((h) => h.pattern)).toContain('Slack token');
    });
    it('detects a Google API key', () => {
        expect(scanForSecrets(SAMPLES.google).map((h) => h.pattern)).toContain('Google API key');
    });
    it('detects a private key block (OPENSSH)', () => {
        expect(scanForSecrets(SAMPLES.privKey).map((h) => h.pattern)).toContain('Private key block');
    });
    it('detects a plain private key block', () => {
        expect(scanForSecrets(SAMPLES.privKeyPlain).map((h) => h.pattern)).toContain('Private key block');
    });
    it('returns the matched substring in `match`', () => {
        const [hit] = scanForSecrets(SAMPLES.github);
        expect(hit.match).toBe(SAMPLES.github);
    });
});

describe('scanForSecrets — false positives (must NOT match)', () => {
    it('ignores bare marker prefixes in prose', () => {
        const prose = 'The audit looks for AKIA, ghp_, xoxb-, AIza, and BEGIN PRIVATE KEY markers.';
        expect(scanForSecrets(prose)).toEqual([]);
    });
    it('ignores regex-source-style strings (prefix followed by a bracket class)', () => {
        const src = 'regex: /AKIA[0-9A-Z]{16}/ and /ghp_[A-Za-z0-9]{36}/';
        expect(scanForSecrets(src)).toEqual([]);
    });
    it('ignores an empty string', () => {
        expect(scanForSecrets('')).toEqual([]);
    });
    it('ignores ordinary code with no secrets', () => {
        expect(scanForSecrets('const total = a + b; // sum')).toEqual([]);
    });
});
```

- [ ] **Step 3: Run the tests — verify they fail**

Run: `npx vitest run check-secrets`
Expected: FAIL — `Cannot find module '../scripts/check-secrets.js'`.

- [ ] **Step 4: Implement the detector**

Create `scripts/check-secrets.js`:

```js
// Pre-commit secret guard (tier a): regex scan of staged content for
// high-signal credential markers. No runtime dependencies.
//
// `scanForSecrets` and `extractAddedLines` are pure and unit-tested; the
// CLI section at the bottom is a thin git wrapper. Patterns match the full
// token SHAPE (not bare prefixes), so this file does not flag its own
// regex sources and prose mentions of the markers do not match.

const SECRET_PATTERNS = [
    { name: 'AWS access key ID', regex: /AKIA[0-9A-Z]{16}/ },
    { name: 'GitHub token', regex: /gh[opsru]_[A-Za-z0-9]{36}/ },
    { name: 'Slack token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
    { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{35}/ },
    { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
];

/**
 * Scan a string for credential markers.
 * @param {string} text
 * @returns {Array<{pattern: string, match: string}>}
 */
function scanForSecrets(text) {
    const hits = [];
    for (const { name, regex } of SECRET_PATTERNS) {
        const m = typeof text === 'string' ? text.match(regex) : null;
        if (m) {
            hits.push({ pattern: name, match: m[0] });
        }
    }
    return hits;
}

module.exports = { scanForSecrets, SECRET_PATTERNS };
```

- [ ] **Step 5: Run the tests — verify they pass**

Run: `npx vitest run check-secrets`
Expected: PASS (12 tests).

- [ ] **Step 6: Lint + format the new files**

Run: `npx eslint scripts/check-secrets.js tests/check-secrets.test.js eslint.config.mjs` → no errors.
Run: `npx prettier --check scripts/check-secrets.js tests/check-secrets.test.js` → "All matched files use Prettier code style!" (run `npx prettier --write` on them first if needed).

- [ ] **Step 7: Commit**

```bash
git add scripts/check-secrets.js tests/check-secrets.test.js eslint.config.mjs
git commit -m "feat(security): add scanForSecrets credential detector + scripts ESLint block"
```
(The pre-commit hook runs lint-staged + the full vitest suite; the secret scan is not wired yet, so this commit is safe regardless.)

---

## Task 2: Diff parser `extractAddedLines` + CLI wrapper

**Files:**
- Modify: `scripts/check-secrets.js` (add `extractAddedLines` + CLI `main`)
- Test: `tests/check-secrets.test.js` (add a `describe` block)

**Interfaces:**
- Consumes: `scanForSecrets` (Task 1).
- Produces: `extractAddedLines(diffText: string) => Array<{ file: string|null, line: number, text: string }>` — added (`+`) lines only, with the new-file line number; skips binary hunks; ignores removed lines. Exported via `module.exports`.

- [ ] **Step 1: Write the failing tests for `extractAddedLines`**

Append to `tests/check-secrets.test.js`. First update the import line to also pull in `extractAddedLines`:

```js
const { scanForSecrets, extractAddedLines } = require('../scripts/check-secrets.js');
```

Then add:

```js
describe('extractAddedLines — unified=0 diff parsing', () => {
    const diff = [
        'diff --git a/app.js b/app.js',
        'index 0000000..1111111 100644',
        '--- a/app.js',
        '+++ b/app.js',
        '@@ -0,0 +1,2 @@',
        '+const key = "value";',
        '+const other = 2;',
        '@@ -10,1 +12,1 @@',
        '-const removed = old;',
        '+const replaced = next;',
    ].join('\n');

    it('collects only added lines with correct paths', () => {
        const added = extractAddedLines(diff);
        expect(added.map((a) => a.text)).toEqual([
            'const key = "value";',
            'const other = 2;',
            'const replaced = next;',
        ]);
        expect(added.every((a) => a.file === 'app.js')).toBe(true);
    });

    it('assigns new-file line numbers from the hunk header', () => {
        const added = extractAddedLines(diff);
        expect(added.map((a) => a.line)).toEqual([1, 2, 12]);
    });

    it('ignores removed lines', () => {
        const added = extractAddedLines(diff);
        expect(added.some((a) => a.text.includes('removed'))).toBe(false);
    });

    it('skips binary hunks', () => {
        const bin = [
            'diff --git a/img.png b/img.png',
            '--- a/img.png',
            '+++ b/img.png',
            'Binary files a/img.png and b/img.png differ',
        ].join('\n');
        expect(extractAddedLines(bin)).toEqual([]);
    });

    it('returns [] for an empty diff', () => {
        expect(extractAddedLines('')).toEqual([]);
    });

    it('integrates with scanForSecrets to flag a planted key in added lines', () => {
        const planted = ['+++ b/config.js', '@@ -0,0 +1,1 @@', '+token = "ghp_' + 'a'.repeat(36) + '"'].join('\n');
        const findings = extractAddedLines(planted).flatMap((a) =>
            scanForSecrets(a.text).map((h) => ({ file: a.file, line: a.line, pattern: h.pattern }))
        );
        expect(findings).toEqual([{ file: 'config.js', line: 1, pattern: 'GitHub token' }]);
    });
});
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `npx vitest run check-secrets`
Expected: FAIL — `extractAddedLines is not a function`.

- [ ] **Step 3: Implement `extractAddedLines` + the CLI**

In `scripts/check-secrets.js`, add `extractAddedLines` above the `module.exports` line:

```js
/**
 * Parse a `git diff --cached --unified=0` text into added lines.
 * Header lines that appear before the first @@ are harmless: `newLineNo`
 * is reset by every hunk header, and no `+` content is collected until then.
 * @param {string} diffText
 * @returns {Array<{file: string|null, line: number, text: string}>}
 */
function extractAddedLines(diffText) {
    const added = [];
    let file = null;
    let newLineNo = 0;
    let inBinary = false;
    for (const raw of diffText.split('\n')) {
        if (raw.startsWith('+++ ')) {
            const p = raw.slice(4).trim();
            file = p === '/dev/null' ? null : p.replace(/^b\//, '');
            inBinary = false;
            continue;
        }
        if (raw.startsWith('--- ')) {
            continue;
        }
        if (raw.startsWith('Binary files')) {
            inBinary = true;
            continue;
        }
        if (raw.startsWith('@@')) {
            const m = raw.match(/\+(\d+)/);
            newLineNo = m ? parseInt(m[1], 10) : 0;
            continue;
        }
        if (inBinary) {
            continue;
        }
        if (raw.startsWith('+')) {
            added.push({ file, line: newLineNo, text: raw.slice(1) });
            newLineNo++;
        } else if (raw.startsWith('-')) {
            // removed line — does not advance the new-file line counter
        } else {
            newLineNo++;
        }
    }
    return added;
}
```

Update the export line:

```js
module.exports = { scanForSecrets, extractAddedLines, SECRET_PATTERNS };
```

Then append the CLI section at the very bottom of the file:

```js
// --- CLI: scan the staged diff, block the commit on any hit ---
if (require.main === module) {
    const { execSync } = require('child_process');
    let diff = '';
    try {
        diff = execSync('git diff --cached --unified=0 --diff-filter=ACM', {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (err) {
        console.error('check-secrets: failed to read staged diff:', err.message);
        process.exit(1);
    }

    const findings = [];
    for (const { file, line, text } of extractAddedLines(diff)) {
        for (const hit of scanForSecrets(text)) {
            findings.push({ file, line, pattern: hit.pattern });
        }
    }

    if (findings.length > 0) {
        console.error('\n⛔ Potential secret(s) found in staged changes:\n');
        for (const f of findings) {
            console.error(`  ${f.file}:${f.line} — ${f.pattern}`);
        }
        console.error(
            '\nRemove the secret(s) and re-stage. If this is a genuine false positive,' +
                ' bypass with: git commit --no-verify\n'
        );
        process.exit(1);
    }
    process.exit(0);
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `npx vitest run check-secrets`
Expected: PASS (18 tests total).

- [ ] **Step 5: Lint + format**

Run: `npx eslint scripts/check-secrets.js tests/check-secrets.test.js` → no errors.
Run: `npx prettier --check scripts/check-secrets.js tests/check-secrets.test.js` (run `--write` first if needed).

- [ ] **Step 6: Manually verify the CLI runs clean on its own staged change**

Run: `git add scripts/check-secrets.js tests/check-secrets.test.js && node scripts/check-secrets.js; echo "exit=$?"`
Expected: no output, `exit=0` (the file's own regex sources do not self-match; the test fixtures use concatenation).

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(security): add staged-diff parser + CLI to check-secrets"
```

---

## Task 3: Wire the secret guard into the pre-commit hook

**Files:**
- Modify: `.husky/pre-commit`

**Interfaces:**
- Consumes: `scripts/check-secrets.js` CLI (Task 2).

- [ ] **Step 1: Prepend the secret scan to the hook**

Edit `.husky/pre-commit` so it reads exactly:

```sh
node scripts/check-secrets.js
npx lint-staged
npx vitest run
```

(The scan runs first — a leaked secret blocks immediately, before formatting or the test suite.)

- [ ] **Step 2: Verify the happy path (this commit exercises the hook)**

Stage and commit the hook change. The pre-commit hook now runs the secret scan over the staged diff (`.husky/pre-commit`, one added line — no secret), then lint-staged, then vitest.

```bash
git add .husky/pre-commit
git commit -m "build(husky): run secret scan in pre-commit before lint-staged/vitest"
```
Expected: commit succeeds (scan clean → lint-staged → 18 new + existing tests pass).

- [ ] **Step 3: Manually verify the guard BLOCKS a planted secret**

```bash
printf 'const k = "AKIA%s";\n' "ABCDEFGHIJKLMNOP" > /tmp/secret-smoke.js
cp /tmp/secret-smoke.js secret-smoke.js
git add secret-smoke.js
node scripts/check-secrets.js; echo "exit=$?"
```
Expected: prints `secret-smoke.js:1 — AWS access key ID` and `exit=1`.

- [ ] **Step 4: Clean up the smoke file**

```bash
git restore --staged secret-smoke.js
rm -f secret-smoke.js /tmp/secret-smoke.js
git status --short
```
Expected: clean working tree (no `secret-smoke.js`).

---

## Task 4: Harden the pre-archive checklist docs

**Files:**
- Modify: `docs/archive/plans/README.md`
- Modify: `docs/planning/plans/README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Strengthen "Step 1: Verify Plan Completion" in `docs/archive/plans/README.md`**

Replace the existing checklist under `### Step 1: Verify Plan Completion` (the five `- [ ]` lines) with:

```markdown
- [ ] All implementation steps marked `[x]` complete
- [ ] **Flip every remaining `- [ ]` inside the plan to `- [x]`** (Success Criteria, Implementation Steps, Test Plan, Review)
- [ ] **Set the plan header `Status:` to `Complete`**
- [ ] All tests passing
- [ ] "Key Discoveries" section is filled in
- [ ] "Future Improvements" section has **minimum 2 items**
- [ ] Execution log contains "Sub-Item Complete" entries for all sub-items
- [ ] **Verify every commit SHA cited in the plan / DONE.md / CLAUDE.md is an ancestor of `main`** — `git merge-base --is-ancestor <sha> main` (catches dead-branch citations like the recurring PR #37 stale-SHA trap)
```

- [ ] **Step 2: Clarify "Step 5: Update Documentation Index" in `docs/archive/plans/README.md`**

Replace the two bullet lines under `### Step 5: Update Documentation Index` with:

```markdown
- Update `../../README.md` — move the plan from "Active Plans" to "Archived Plans"
- Update `../../README.md` — add the **design spec** under "Design Specs" (specs are the commonly-missed half — index BOTH the plan AND its spec)
- Update `../README.md` — add to "Archived Documents" table (if a non-plan doc)
```

- [ ] **Step 3: Extend the "Quick Checklist" in `docs/archive/plans/README.md`**

Replace the `## Quick Checklist` list with:

```markdown
- [ ] Plan completion verified (all steps done, tests pass)
- [ ] All in-plan checkboxes flipped to `[x]` and header `Status: Complete`
- [ ] Cited commit SHAs verified as ancestors of `main`
- [ ] Improvements extracted to BACKLOG.md (categorized appropriately)
- [ ] Summary added to DONE.md (with lessons learned)
- [ ] Plan moved to docs/archive/plans/
- [ ] .claude/plans/ copy deleted (if exists)
- [ ] docs/README.md updated — Active Plans → Archived Plans **and** spec added under Design Specs
- [ ] docs/archive/README.md updated
```

Also bump the `*Last Updated: 2026-04-29*` line at the bottom to `*Last Updated: 2026-06-17*`.

- [ ] **Step 4: Mirror the items in `docs/planning/plans/README.md`**

Replace the list under `## After Completion` (`Move to archive when ALL are true:`) with:

```markdown
- [ ] All steps marked `[x]` complete
- [ ] **All in-plan checkboxes flipped to `[x]`; plan header `Status: Complete`**
- [ ] Tests passing
- [ ] "Key Discoveries" filled in
- [ ] "Future Improvements" has 2+ items
- [ ] **Improvements extracted to BACKLOG.md** (categorized appropriately)
- [ ] **Cited commit SHAs verified as ancestors of `main`** (`git merge-base --is-ancestor <sha> main`)
- [ ] Summary added to `../DONE.md`
- [ ] **Indexed in `docs/README.md` — plan under Archived Plans AND spec under Design Specs**
```

- [ ] **Step 5: Verify the docs render and commit**

Run: `git diff --stat docs/archive/plans/README.md docs/planning/plans/README.md` → both modified.
(No Prettier on `docs/**` — it is in `.prettierignore`.)

```bash
git add docs/archive/plans/README.md docs/planning/plans/README.md
git commit -m "docs(process): add flip-checkboxes/Status/spec-index/SHA-ancestor steps to pre-archive checklist"
```

---

## Task 5: Final validation

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite green**

Run: `npx vitest run`
Expected: all files pass; total = 326 + 18 = **344 tests** across 15 files.

- [ ] **Step 2: Lint + format clean repo-wide**

Run: `npm run lint` → no errors (includes the new `scripts/` block).
Run: `npm run format:check` → no errors.

- [ ] **Step 3: Re-run the security audit §1/§2 command blocks**

From [docs/security/2026-06-11-security-privacy-audit.md](../../security/2026-06-11-security-privacy-audit.md), run the §1 git-history pickaxe loop and the §2 working-tree `git grep`, applying the audit-doc exclusions from the §1 caveat.
Expected: clean — zero history hits; only the documented benign working-tree matches (now also the new spec/plan/script, which use bare prefixes / concatenation and contain no full-shape literal token).

- [ ] **Step 4: Confirm scope guards held**

Run: `git diff --name-only main...HEAD`
Expected: exactly these six paths, and **no `.gitignore`**:
```
.husky/pre-commit
docs/archive/plans/README.md
docs/planning/plans/README.md
docs/superpowers/plans/2026-06-17-cw-4-process-security-guards.md
docs/superpowers/specs/2026-06-17-cw-4-process-security-guards-design.md
eslint.config.mjs
scripts/check-secrets.js
tests/check-secrets.test.js
```

---

## Self-Review Notes

- **Spec coverage:** Item 1 detector → Task 1; CLI/diff-parse → Task 2; hook wiring → Task 3; ESLint block → Task 1 Step 1. Item 2 both READMEs → Task 4. Validation (audit re-run, full suite, scope guard) → Task 5. All spec §4 acceptance criteria mapped.
- **Self-reference safety:** verified in Task 1 (concatenated fixtures), Task 2 Step 6 (CLI clean on own change), Task 3 Step 2 (hook self-commit succeeds).
- **Type consistency:** `scanForSecrets(text) → [{pattern, match}]` and `extractAddedLines(diffText) → [{file, line, text}]` used identically across Tasks 1, 2, and the CLI.
- **Out of scope (not in any task):** gitleaks, the automated SHA-ancestor test/hook, `.gitignore`, the global template, commit-author PII — all remain in BACKLOG per the spec non-goals.
- **Known doc drift (file as follow-up, do NOT fix here):** CLAUDE.md says "eleven file-group blocks" for ESLint; this adds a twelfth. Touching CLAUDE.md is out of CW-4 scope (and a stashed CLAUDE.md change exists on `main`). File a 🟤 follow-up at closeout.
