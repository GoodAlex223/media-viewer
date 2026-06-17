# CW-4: Process & Security Guards — Design Spec

**Date:** 2026-06-17
**Branch:** `cleanup/cw-4-process-security-guards`
**Group:** Cleanup Week CW-4 (Friday, 3 SP) — `🟡 Operational`
**Status:** Approved — ready for implementation plan
**Source items:** [WEEKLY.md](../../planning/WEEKLY.md) Group CW-4; [BACKLOG.md](../../planning/BACKLOG.md) `[2026-06-11]` Group D security-audit follow-up (tier a), `[2026-04-30]` pre-archive checklist, `[2026-06-16]` CW-3 / PR #50 SHA-ancestor convention.

---

## 1. Overview

Two independent process/tooling guards, batched into one branch / one PR:

1. **Pre-commit secret guard (tier a)** — a regex scan of staged content that blocks a commit containing high-signal credential markers, with **no new runtime dependency**. Closes the Group D audit referral.
2. **Pre-archive checklist** — strengthen the repo-tracked archive-process docs with the steps that recurringly drift (flip checkboxes, add `Status: Complete`, index plans **and** specs, verify cited SHAs are ancestors of `main`).

Both are preventive: they keep already-clean state (no secrets; tidy archived plans) from regressing as the project grows.

### Non-goals (stay in BACKLOG)

- **Gitleaks (tier b)** — heavier, adds a dependency/config; deferred.
- **Automated SHA-ancestor test/hook** (BACKLOG `[2026-06-16]` #198, S–M) — only the one-line *convention* lands in the checklist here; the mechanical check stays deferred.
- **`.gitignore` edits** — CW-3 already owns/finished the `.gitignore` work; **this branch must not touch `.gitignore`** (boundary recorded in WEEKLY.md).
- **Commit-author PII** — accepted risk (audit §4); unchanged.
- **Editing the global `.claude/TEMPLATES/plan.md`** — it is gitignored and outside the repo, so an edit produces nothing committable. The committable home is the tracked archive READMEs.

---

## 2. Item 1 — Pre-commit secret guard

### 2.1 Architecture

| File | Action | Purpose |
|------|--------|---------|
| `scripts/check-secrets.js` | Create | CommonJS. Exports a pure `scanForSecrets(text)`. A CLI section (`if (require.main === module)`) reads the staged diff, scans added lines, reports hits, and sets the exit code. |
| `tests/check-secrets.test.js` | Create | Vitest unit tests for `scanForSecrets` — positive case per marker + false-positive cases. |
| `eslint.config.mjs` | Modify | Add a `scripts/**/*.js` config block (Node, `sourceType: 'commonjs'`, `sharedRules` + `no-undef`) so the hook's own `eslint --fix` lints the new script correctly. |
| `.husky/pre-commit` | Modify | Prepend `node scripts/check-secrets.js` **before** `npx lint-staged` / `npx vitest run` (fail fast, cheapest check first). |

### 2.2 The detector — `scanForSecrets(text)`

Pure, git-agnostic, synchronous. Input: a string (one diff line, or any text). Output: an array of `{ pattern, match }` (empty ⇒ no secrets) — it reports *what* matched, not *where* (the CLI owns file/line context). This is the unit-tested surface; the git plumbing is a thin CLI wrapper around it.

Patterns match the full token **shape**, not bare prefixes, so documentation prose (e.g. the markdown `` `ghp_` ``) does not match:

| Marker | Regex |
|--------|-------|
| AWS access key ID | `AKIA[0-9A-Z]{16}` |
| GitHub token (classic family) | `gh[opsru]_[A-Za-z0-9]{36}` |
| Slack token | `xox[baprs]-[0-9A-Za-z-]{10,}` |
| Google API key | `AIza[0-9A-Za-z_\-]{35}` |
| Private key block | `-----BEGIN (?:RSA \| EC \| DSA \| OPENSSH \| PGP )?PRIVATE KEY-----` |

> The `gh[opsru]_` class broadens the audit's `ghp_` to the full GitHub PAT family (`gho_`/`ghu_`/`ghs_`/`ghr_`) for robustness — still specific (prefix + 36 chars).

### 2.3 The CLI wrapper

1. Run `git diff --cached --unified=0 --diff-filter=ACM` (added/copied/modified; skips pure deletions).
2. Walk the unified diff: track the current file path (`+++ b/...`) and the new-file line number (from `@@` hunk headers); collect only **added** lines (prefix `+`, excluding the `+++` header). Skip binary hunks (`Binary files ... differ`).
3. Call `scanForSecrets` on **each added line** (so the CLI can pair every hit with the file path + line number it is already tracking).
4. On any hit: print each as `path:line — <marker name>`, print a one-line remediation note (unstage / remove the secret; `git commit --no-verify` bypasses for a genuine false positive), and `process.exit(1)`.
5. No hits ⇒ `process.exit(0)`.

### 2.4 Self-reference safety (critical edge case)

This is the exact footgun the audit §1 caveat called out — the guard's own code, its tests, and the planning docs all *mention* the markers. Three mechanisms keep it from flagging itself or its own change:

- **Pattern specificity.** The regex *source* (`AKIA[0-9A-Z]{16}`) is not a real 20-char token, so the AWS regex does not match its own definition. Bare prefixes in prose lack the required length ⇒ no match.
- **Concatenated test fixtures.** `tests/check-secrets.test.js` constructs real-shape tokens at runtime (e.g. `'AKIA' + 'A'.repeat(16)`, `['xoxb-', '0'.repeat(20)].join('')`) so **no full-shape literal ever sits on disk** — committing the test file does not trip the guard, yet `scanForSecrets` still sees the assembled string and detects it.
- **Docs convention.** This spec, the plan, and any future doc reference **bare prefixes / regexes only — never a full-shape literal token.** The guard scans `docs/` too (no path exclusion), so this is an authoring rule, not a carve-out.

### 2.5 Edge cases

| Edge case | Handling |
|-----------|----------|
| Marker prefix in prose (`` `ghp_` ``, `AKIA` alone) | No match — pattern requires full length |
| Guard's own regex source / concatenated fixtures | No match — see §2.4 |
| Binary staged file | Skipped (binary hunk detected, not scanned) |
| Removed lines (deletions) | Ignored — only `+` added lines scanned |
| Empty staged set / deletions-only commit | Exit 0, no output |
| Renamed/copied file | `git diff` still emits added content; scanned normally |
| Genuine false positive (coincidental match) | `git commit --no-verify` escape hatch (noted in failure message) |
| All five markers planted | All reported; commit blocked (positive tests assert this) |

### 2.6 Validation

- **Unit:** `tests/check-secrets.test.js` — one positive per marker, plus false-positive cases (bare prefix in prose, the regex-source string, an empty string, a removed-line-only diff fragment). Target ≥ 10 cases.
- **Audit re-run:** execute the audit §1 (git-history pickaxe) and §2 (working-tree `git grep`) command blocks from [docs/security/2026-06-11-security-privacy-audit.md](../../security/2026-06-11-security-privacy-audit.md) (with the audit-doc exclusions) — must still report clean.
- **Manual smoke:** stage a file containing a concatenated fake key → `git commit` is blocked with the right message → unstage; confirm a normal commit still succeeds and the hook still runs lint-staged + vitest afterward.

---

## 3. Item 2 — Pre-archive checklist

The recurring drift (PRs #19/#20/#27/#29/#32, and the PR #50 stale-SHA straggler) is that archived plans land with `[ ]` checkboxes, no `Status: Complete`, the spec un-indexed, and occasionally a cited SHA that only ever lived on a dead branch. The fix adds the missing steps to the **tracked** archive docs.

### 3.1 `docs/archive/plans/README.md` (canonical "Complete Archive Process")

- **Step 1 (Verify Plan Completion):** add explicit lines — flip every `- [ ]` inside the plan to `- [x]`; set `Status: Complete` in the plan's header.
- **Step 5 (Update Documentation Index):** make it explicit that **both** the plan **and** its design spec are indexed in `docs/README.md` (per the PR #36 follow-up note — specs were the commonly-missed half).
- **New step / line:** verify any commit SHAs cited in the plan / DONE.md / CLAUDE.md are ancestors of `main`: `git merge-base --is-ancestor <sha> main` (folds in the explicit CW-3 / PR #50 request).
- **Quick Checklist:** add matching one-line entries for each of the above.

### 3.2 `docs/planning/plans/README.md` (short "After Completion" list)

Mirror the same four items so the checklist is consistent whether a reader starts from the active-plans or archived-plans README.

### 3.3 Scope guard

Documentation-only edits to two tracked files. No `.gitignore`, no template files, no code.

---

## 4. Testing & acceptance

| Check | Expectation |
|-------|-------------|
| `tests/check-secrets.test.js` | All cases pass (≥10) |
| Full unit suite (`npx vitest run`) | Green (326 → ~336+; case count rises by the new file's tests) |
| `npm run lint` | Clean, including the new `scripts/` block |
| `npm run format:check` | Clean |
| Pre-commit hook on this branch | Runs secret scan → lint-staged → vitest; commits succeed (no self-trip) |
| Manual planted-secret smoke | Commit blocked then succeeds after unstage |
| Audit §1/§2 re-run | Clean |
| E2E | Not run — no renderer/main/worker changes (noted in DONE.md) |

### Acceptance criteria

- [ ] `scripts/check-secrets.js` detects all five marker categories and exits non-zero on a staged hit.
- [ ] Committing the guard + its tests does **not** trip the guard (self-reference safety holds).
- [ ] `.husky/pre-commit` runs the scan before lint-staged/vitest.
- [ ] `eslint.config.mjs` has a `scripts/` block; lint + format clean.
- [ ] Archive READMEs include: flip-checkboxes, `Status: Complete`, index plans **and** specs, verify cited SHAs are ancestors of `main`.
- [ ] Branch touches no `.gitignore` and no global template.
- [ ] Full unit suite green; audit §1/§2 re-run clean.

---

## 5. Files affected

| File | Action |
|------|--------|
| `scripts/check-secrets.js` | Create |
| `tests/check-secrets.test.js` | Create |
| `eslint.config.mjs` | Modify (add `scripts/` block) |
| `.husky/pre-commit` | Modify (prepend secret scan) |
| `docs/archive/plans/README.md` | Modify (checklist steps) |
| `docs/planning/plans/README.md` | Modify (mirror checklist) |
