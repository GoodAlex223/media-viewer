# Security & Privacy Audit — 2026-06-11

**Branch:** `feature/security-privacy-audit`
**Scope:** One-time, non-destructive audit (no git history rewrite). Verifies no
credentials in git history or the working tree; records identity/PII posture.
**Spec:** [docs/superpowers/specs/2026-06-11-security-privacy-audit-design.md](../superpowers/specs/2026-06-11-security-privacy-audit-design.md)
**Result:** ✅ PASS — no secrets found; identity exposure documented as accepted risk.

## Summary

| Check | Verdict |
|-------|---------|
| Secrets in git history (all branches) | ✅ Clean |
| Secrets in working tree (tracked files) | ✅ Clean (4 benign matches) |
| Credential files ever committed (`.mcp.json`, `.env`) | ✅ Never committed |
| `.gitignore` coverage of secret files | ✅ Adequate |
| `package.json` author identity | ✅ Already anonymized (handle only) |
| Commit-author PII (name + email) | ⚠️ Accepted risk (see below) |

## 1. Git history secrets scan

Pickaxe (`-S`) scan across all branches for credential markers:

```powershell
foreach ($s in @('AKIA','-----BEGIN','BEGIN RSA PRIVATE','BEGIN PRIVATE','ghp_','xoxb','AIza','aws_secret_access_key')) {
  git log --all --oneline -S $s
}
git log --all --oneline -- .mcp.json
git log --all --oneline -- .env .env.*
```

Result: **zero hits** for every credential marker across the full history (530
commits on all branches, including this audit branch). `.mcp.json` and
`.env`/`.env.*` were never committed on any branch.

> **Self-reference caveat (for re-runs):** because this audit's own spec and plan
> documents contain the literal pattern strings (`AKIA`, `ghp_`, `xoxb`, …) as
> documentation, a raw `-S` scan will flag commits `ed13a8a` and `867480a` — these
> are the audit docs themselves, not secrets. Exclude them to see the true result:
>
> ```powershell
> git log --all --oneline -S 'ghp_' -- . `
>   ':(exclude)docs/superpowers/specs/2026-06-11-security-privacy-audit-design.md' `
>   ':(exclude)docs/superpowers/plans/2026-06-11-security-privacy-audit.md' `
>   ':(exclude)docs/security/'
> ```
>
> With those exclusions, every pattern reports clean.

## 2. Working-tree secrets scan

`git grep -nIiE` over all tracked files (excluding this branch's audit docs) for
credential markers + generic `api_key=`/`password=`/`secret=`/`token=` assignments.
Only two pattern categories fired, all **benign — no real secrets:**

- `.mcp.json.example` — placeholder `YOUR_GITHUB_PAT` (correct hygiene; the real
  `.mcp.json` is gitignored and untracked)
- `CLAUDE.md` — the word "token" in prose
- `media-viewer.js` — local variables named `token` / `_jxlAnimToken` (the
  animated-JXL identity-token teardown pattern), not credentials
- `compose.yaml` — commented-out `db-password:` (Docker example, no value)

No tracked `.env`, `.pem`, `.key`, `.p12`, `.pfx`, or `.mcp.json` files
(`git ls-files` credential-pattern check → none).

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
  fix requires rewriting every commit (`git filter-repo --mailmap` + force-push),
  which changes every SHA, breaks existing clones and merged-PR references, and is
  only meaningful if paired with a GitHub-side scrub. Recorded here so a future
  decision is informed rather than an oversight.

## 5. Out of scope (referred, not done)

- Git history rewrite (accepted risk above).
- Pre-commit secret guard / gitleaks (future task).
- Docker scaffolding cruft — `Dockerfile`, `compose.yaml`, `.dockerignore` are
  tracked `docker init` output unrelated to this Electron app. Filed to BACKLOG 🟤.

## Re-running this audit

Re-run the command blocks in sections 1 and 2 above (with the audit-doc exclusions
from the section 1 caveat). A passing audit prints `clean:` for every history
pattern, empty per-path history, and only the four benign working-tree matches.
