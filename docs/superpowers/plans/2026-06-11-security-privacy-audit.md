# Security & Privacy Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a dated, reproducible security & privacy audit report confirming no credentials live in the repo (history or working tree) and recording the identity/PII posture as a conscious decision.

**Architecture:** Document-driven audit. Run a fixed set of `git log -S` / `git grep` commands, capture their verbatim output, and record findings + verdicts in a single report under `docs/security/`. No production code changes. The one identified cleanup (Docker scaffolding cruft) is referred out to BACKLOG, not acted on.

**Tech Stack:** Git CLI (`git log --all -S`, `git grep`, `git ls-files`, `git check-ignore`), PowerShell 7 (Windows shell), Markdown.

---

## Context for the implementing engineer

This is **not** a code task — there is no source file to edit, no unit test to write, and the pre-commit hook's lint-staged step will report "No staged files match any configured task" for Markdown-only commits (that is expected and fine; the hook still runs `vitest run`, which must pass).

The preliminary scan during brainstorming already came back **clean**. Your job is to re-run the commands cleanly, confirm the result still holds, and record it. If any command unexpectedly returns a hit that is NOT one of the three known-benign matches below, **stop and report** — do not write "clean" into the report.

**Known-benign matches (expected, not findings):**
- `compose.yaml` — a commented-out `db-password:` line (Docker example, no value)
- `.mcp.json.example` — the literal placeholder `YOUR_GITHUB_PAT`
- `CLAUDE.md` — the word "token" appearing in prose

**Shell notes (PowerShell 7 on Windows):**
- `git grep`/`git log -S` set `$LASTEXITCODE` to 1 when a pattern has no match — that is normal, not an error. Don't treat a non-zero exit as failure for these read-only scans.
- The repo working directory is already set; do **not** prefix commands with `cd`.

---

## Task 1: Create the audit report skeleton + run the git-history secrets scan

**Files:**
- Create: `docs/security/2026-06-11-security-privacy-audit.md`

- [ ] **Step 1: Run the git-history secrets scan and capture output**

Run (PowerShell):

```powershell
"=== history -S scan (all branches, 524 commits) ==="
foreach ($s in @('AKIA','-----BEGIN','BEGIN RSA PRIVATE','BEGIN PRIVATE','ghp_','xoxb','AIza','aws_secret_access_key')) {
  $r = git log --all --oneline -S $s 2>$null
  if ($r) { "HIT for '$s':"; $r } else { "clean: '$s'" }
}
"=== per-path history: were secret files ever committed? ==="
"`.mcp.json` history:"; git log --all --oneline -- .mcp.json
"`.env` / `.env.*` history:"; git log --all --oneline -- .env .env.*
"=== total commit count ==="
git log --all --oneline | Measure-Object -Line | Select-Object -ExpandProperty Lines
```

Expected: every pattern prints `clean: '<pattern>'`; both per-path history lines are empty; commit count ~524. If any `HIT for` appears, STOP and report.

- [ ] **Step 2: Create the report file with header + history-scan section**

Create `docs/security/2026-06-11-security-privacy-audit.md` with the content below (paste the real commit count from Step 1 in place of `524`). The outer fence here is **four** backticks so the inner ` ```powershell ` fences are literal — write the file with normal three-backtick fences.

````markdown
# Security & Privacy Audit — 2026-06-11

**Branch:** `feature/security-privacy-audit`
**Scope:** One-time, non-destructive audit (no git history rewrite). Verifies no
credentials in git history or the working tree; records identity/PII posture.
**Spec:** [docs/superpowers/specs/2026-06-11-security-privacy-audit-design.md](../superpowers/specs/2026-06-11-security-privacy-audit-design.md)
**Result:** ✅ PASS — no secrets found; identity exposure documented as accepted risk.

## Summary

| Check | Verdict |
|-------|---------|
| Secrets in git history (524 commits, all branches) | ✅ Clean |
| Secrets in working tree (tracked files) | ✅ Clean (3 benign matches) |
| Credential files ever committed (`.mcp.json`, `.env`) | ✅ Never committed |
| `.gitignore` coverage of secret files | ✅ Adequate |
| `package.json` author identity | ✅ Already anonymized (handle only) |
| Commit-author PII (name + email) | ⚠️ Accepted risk (see below) |

## 1. Git history secrets scan

Command:

```powershell
foreach ($s in @('AKIA','-----BEGIN','BEGIN RSA PRIVATE','BEGIN PRIVATE','ghp_','xoxb','AIza','aws_secret_access_key')) {
  git log --all --oneline -S $s
}
git log --all --oneline -- .mcp.json
git log --all --oneline -- .env .env.*
```

Result: **zero hits** for every credential marker across all 524 commits on all
branches. `.mcp.json` and `.env`/`.env.*` were never committed on any branch.
````

- [ ] **Step 3: Commit**

```powershell
git add docs/security/2026-06-11-security-privacy-audit.md
git commit -m @'
docs(security): audit report skeleton + git-history secrets scan

Zero credential markers across 524 commits (all branches); .mcp.json and
.env never committed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

Expected: commit succeeds; lint-staged prints "No staged files match any configured task"; vitest runs and passes (297/297).

---

## Task 2: Working-tree scan + identity/PII assessment sections

**Files:**
- Modify: `docs/security/2026-06-11-security-privacy-audit.md` (append sections 2–4)

- [ ] **Step 1: Run the working-tree secrets scan and capture output**

Run (PowerShell):

```powershell
"=== working-tree pattern scan ==="
$patterns = @{
  'AWS access key'='AKIA[0-9A-Z]{16}'; 'private key block'='BEGIN [A-Z ]*PRIVATE KEY'
  'GitHub PAT'='ghp_[A-Za-z0-9]{36}'; 'Slack token'='xox[baprs]-'
  'Google API key'='AIza[0-9A-Za-z_\-]{35}'; 'aws secret'='aws_secret_access_key'
  'api key assign'='api[_-]?key["'' ]*[:=]'; 'password assign'='password["'' ]*[:=]'
  'secret assign'='secret["'' ]*[:=]'; 'token assign'='token["'' ]*[:=]'
}
foreach ($k in $patterns.Keys) {
  $out = git grep -nIiE $patterns[$k] 2>$null
  if ($LASTEXITCODE -eq 0 -and $out) { "=== $k ==="; $out }
}
"=== tracked credential-like files? ==="
git ls-files | Select-String -Pattern '\.env$|\.pem$|\.key$|\.p12$|\.pfx$|^\.mcp\.json$|credential'
"=== is real .mcp.json gitignored + present locally? ==="
git check-ignore .mcp.json
if (Test-Path .mcp.json) { ".mcp.json exists locally (untracked)" }
```

Expected: only the three known-benign matches appear (compose.yaml `db-password`, `.mcp.json.example` placeholder, CLAUDE.md prose); no tracked credential files; `git check-ignore` prints `.mcp.json`. Any other hit → STOP and report.

- [ ] **Step 2: Append sections 2, 3, 4 to the report**

Append the content below to `docs/security/2026-06-11-security-privacy-audit.md` (four-backtick outer fence here is for nesting; write normal fences in the file):

````markdown
## 2. Working-tree secrets scan

`git grep -nIiE` over all tracked files for credential markers + generic
`api_key=`/`password=`/`secret=`/`token=` assignments. Result: **3 benign matches,
no real secrets:**

- `compose.yaml` — commented-out `db-password:` (Docker example, no value)
- `.mcp.json.example` — placeholder `YOUR_GITHUB_PAT` (correct hygiene; the real
  `.mcp.json` is gitignored and untracked)
- `CLAUDE.md` — the word "token" in prose

No tracked `.env`, `.pem`, `.key`, `.p12`, `.pfx`, or `.mcp.json` files.

## 3. `.gitignore` coverage

Verified `.gitignore` ignores the sensitive paths:

- `.env`, `.env.*` (with `!.env.example`)
- `.mcp.json` — confirmed via `git check-ignore .mcp.json`; a real local `.mcp.json`
  (may contain a GitHub PAT) exists untracked and is correctly excluded.

Minor cruft noted (not security-relevant, report-only): a stray `nul` entry on
line 2, and a duplicate `!.claude/agents/` line (already a known BACKLOG item).

## 4. Identity / PII assessment

- **`package.json` author** — `"author": "goodalex223"`: GitHub handle only, no real
  name or email. **Verdict: already anonymized — no change.** (Resolves BACKLOG
  "Anonymize author field in package.json".)
- **Commit-author identity** — all commits are authored as
  `Alexey Minakov <alexminak32@gmail.com>` / `GoodAlex223 <alexminak32@gmail.com>`.
  This real name + email is baked into every commit and is **already public** on
  the GitHub remote.

  **Accepted risk (non-destructive scope).** Not remediated this pass because a
  fix requires rewriting all 524 commits (`git filter-repo --mailmap` + force-push),
  which changes every SHA, breaks existing clones and merged-PR references, and is
  only meaningful if paired with a GitHub-side scrub. Recorded here so a future
  decision is informed rather than an oversight.

## 5. Out of scope (referred, not done)

- Git history rewrite (accepted risk above).
- Pre-commit secret guard / gitleaks (future task).
- Docker scaffolding cruft — `Dockerfile`, `compose.yaml`, `.dockerignore` are
  tracked `docker init` output unrelated to this Electron app. Filed to BACKLOG 🟤.

## Re-running this audit

Re-run the command blocks in sections 1 and 2 above. A passing audit prints
`clean:` for every history pattern, empty per-path history, and only the three
benign working-tree matches.
````

- [ ] **Step 3: Commit**

```powershell
git add docs/security/2026-06-11-security-privacy-audit.md
git commit -m @'
docs(security): working-tree scan + identity/PII assessment

3 benign working-tree matches, no real secrets. package.json author already
anonymized; commit-author PII recorded as accepted risk (non-destructive scope).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

Expected: commit succeeds; vitest passes.

---

## Task 3: Index the report, file the BACKLOG cleanup item, transition planning docs

**Files:**
- Modify: `docs/README.md` (add report to index)
- Modify: `docs/planning/BACKLOG.md` (🟤 Auto-Generated cleanup item)
- Modify: `docs/planning/WEEKLY.md` (check off Group D items)

- [ ] **Step 1: Index the report in `docs/README.md`**

Read `docs/README.md`, find where audit/security or misc docs are listed (or the most appropriate existing section), and add a link:

```markdown
- [Security & Privacy Audit (2026-06-11)](security/2026-06-11-security-privacy-audit.md) — one-time secrets + PII audit; result: PASS
```

If a "Design Specs" or similar section lists specs, also add the design spec row:

```markdown
- [Security & Privacy Audit — Design](superpowers/specs/2026-06-11-security-privacy-audit-design.md)
```

- [ ] **Step 2: File the Docker-cruft cleanup item in `docs/planning/BACKLOG.md`**

Read `docs/planning/BACKLOG.md`, find the 🟤 Auto-Generated section, and add (under a `### [2026-06-11] From: Group D security audit` intake-date heading, per the BACKLOG Process Rules):

```markdown
- [ ] **Remove Docker scaffolding cruft** — `Dockerfile`, `compose.yaml`, and
  `.dockerignore` are tracked `docker init` output with no relationship to this
  Electron desktop app (it is not containerized). Surfaced during the 2026-06-11
  security audit. Low effort; verify nothing references them before `git rm`.
```

- [ ] **Step 3: Check off Group D items in `docs/planning/WEEKLY.md`**

In `docs/planning/WEEKLY.md`, flip the two Group D checkboxes:

```markdown
- [x] **Verify no secrets in git history** — 2 SP, 🟢 NICE TO HAVE (high impact, low effort)
- [x] **Anonymize author field in package.json** — 1 SP, 🟢 NICE TO HAVE
```

Also flip the corresponding lines in the "Friday, June 5" daily block (`Verify no secrets in git history (2 SP)` and `Anonymize package.json author field (1 SP)`).

- [ ] **Step 4: Verify all docs are consistent and tests still pass**

Run:

```powershell
npx vitest run
```

Expected: 297/297 pass (no code changed). Then visually confirm the report renders
(no broken nested code fences) by reading the file.

- [ ] **Step 5: Commit**

```powershell
git add docs/README.md docs/planning/BACKLOG.md docs/planning/WEEKLY.md
git commit -m @'
docs(security): index audit report, file Docker-cruft cleanup, check off Group D

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

Expected: commit succeeds; vitest passes.

---

## Final verification (after all tasks)

- [ ] Report exists at `docs/security/2026-06-11-security-privacy-audit.md`, renders cleanly, result = PASS
- [ ] `docs/README.md` links the report
- [ ] BACKLOG has the Docker-cruft 🟤 item under a `[2026-06-11]` intake heading
- [ ] WEEKLY.md Group D both items checked
- [ ] `package.json` unchanged (finding: already anonymized)
- [ ] `npx vitest run` → 297/297 pass
- [ ] No production source files modified (`git diff --name-only main` shows only docs)
```
