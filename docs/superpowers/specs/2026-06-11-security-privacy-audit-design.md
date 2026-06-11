# Group D — Security & Privacy Audit — Design

**Date:** 2026-06-11
**Branch:** `feature/security-privacy-audit`
**Source:** 🟡 Operational (WEEKLY.md Group D, 3 SP) — BACKLOG periodic items "Verify no secrets in git history" + "Anonymize author field in package.json"
**Status:** Approved (brainstorm)

## Purpose

A one-time, **non-destructive** verification that the repository contains no
accidentally-committed credentials (in git history or the working tree) and that
author/identity exposure is consciously understood and recorded. The deliverable
is a dated **audit report**, not production-code changes.

## Scope decisions (locked during brainstorm)

- **Non-destructive only.** No git history rewrite. The real PII (commit author
  `Alexey Minakov <alexminak32@gmail.com>` across all 524 commits) is already
  public on GitHub; rewriting every SHA on a repo with merged PRs is destructive,
  breaks clones/PR links, and is out of scope. Recorded as **accepted risk**.
- **Keep the `package.json` author handle.** `"author": "goodalex223"` is already
  anonymized (GitHub handle only — no real name, no email). Verdict: already
  satisfied; document the finding, no change.
- **One-time audit, no preventive tooling.** No pre-commit secret guard, no
  gitleaks/CI integration. Can be added later as its own task.

## Components

### 1. Secrets scan — git history (all branches)

High-signal `git log --all -S<pattern>` sweep for credential markers:
`AKIA` (AWS access key), `BEGIN …PRIVATE KEY` / `-----BEGIN`, `ghp_` (GitHub PAT),
`xoxb` (Slack), `AIza` (Google API key). Plus per-path history check for
`.mcp.json`, `.env`, `.env.*`.

**Preliminary result: clean.** Zero hits across 524 commits. `.mcp.json` and
`.env` were never committed on any branch.

### 2. Secrets scan — working tree (tracked files)

`git grep -niE` over the tracked set for the same credential markers plus generic
`api_key=` / `password=` / `secret=` / `token=` assignments, and a tracked
credential-file check (`.env`, `.pem`, `.key`, `.p12`, `.pfx`, `.mcp.json`).

**Preliminary result: clean.** Only benign matches:
- `compose.yaml` — commented-out `db-password` (Docker example, no value)
- `.mcp.json.example` — placeholder `YOUR_GITHUB_PAT` (correct hygiene)
- `CLAUDE.md` — the word "token" in prose

### 3. Identity / PII assessment

- `package.json` author: handle-only → **keep** (decision above).
- `.mcp.json`: a real local file exists and may hold a PAT; `.gitignore` correctly
  ignores it and it is absent from history → **safe, no action**.
- `.gitignore` correctly covers `.env`, `.env.*` (with `!.env.example`), `.mcp.json`.
- Commit-author PII: **accepted risk** (rationale above). Report records what a
  future rewrite would entail (`git filter-repo --mailmap`, force-push, GitHub-side
  scrub) so a later decision is informed.

### 4. Audit report artifact

Single new file: `docs/security/2026-06-11-security-privacy-audit.md`. Contents:
- Scope + the locked decisions
- Exact commands run (reproducible "re-run this audit" block)
- Findings table (history scan, working-tree scan, credential-file check,
  `.gitignore` coverage, identity assessment) — each with verdict
- Accepted-risk note (commit-author PII)
- Observations referred out, not acted on (see below)

## Out of scope (recorded, not done)

- **Git history rewrite** — accepted-risk, non-destructive scope.
- **Pre-commit secret guard / gitleaks** — future task.
- **Docker scaffolding cruft** — `Dockerfile`, `compose.yaml`, `.dockerignore`
  are tracked `docker init` output unrelated to this Electron desktop app. Flag as
  a 🟤 BACKLOG cleanup item; do not remove in this branch.
- **Minor `.gitignore` cruft** — stray `nul` entry (line 2) and the already-known
  duplicate `!.claude/agents/` line (existing BACKLOG item). Note in report only.

## Testing

No production code changes → no unit/E2E test changes. "Verification" is the audit
command set itself, with output captured verbatim in the report so the run is
auditable and repeatable.

## Deliverables checklist

- [ ] `docs/security/2026-06-11-security-privacy-audit.md` written with findings + reproducible commands
- [ ] `docs/README.md` indexes the new report
- [ ] 🟤 BACKLOG item filed: remove Docker scaffolding cruft (`Dockerfile`/`compose.yaml`/`.dockerignore`)
- [ ] No `package.json` change (finding: already anonymized)
- [ ] WEEKLY.md Group D items checked off; TODO→DONE transition
