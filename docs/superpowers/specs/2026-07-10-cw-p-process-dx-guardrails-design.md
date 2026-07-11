# CW-P: Process & DX Guardrails — Design Spec

**Date:** 2026-07-10
**Branch:** `cleanup/cw-p-process-dx-guardrails`
**Group:** Cleanup Week CW-P (Friday, 3 SP) — `🟡 Operational` (+1 🟤 folded)
**Status:** Approved — ready for implementation plan
**Source items:** [WEEKLY.md](../../planning/WEEKLY.md) Group CW-P (lines 65–74, Fri line 157); [BACKLOG.md](../../planning/BACKLOG.md) `[2026-06-26]` PR #56 process observations (E2E-gate + ref-sweep), `[2026-06-26]`/`[2026-06-29]` Weekly-Reviews methodology follow-ups, `[2026-07-06]` PR #62 post-merge follow-ups (hybrid sourcing + run-card path, both fold into item 2).

---

## 1. Overview

Three process/DX guardrails, batched into one branch / one PR. Mirrors CW-4 from the first Cleanup Week (which built `check-secrets.js` the same way).

1. **Automated E2E gate (item 1)** — a Husky **pre-push** hook that runs the full Playwright E2E suite before a push that changes runtime code, and **skips** when the outgoing push touches only docs/markdown. Closes the "a behaviour change can land a silently-broken E2E test" gap (repo has no CI; the pre-commit hook runs unit tests only).
2. **Consolidate the Weekly-Reviews methodology (item 2)** — fold the 6 methodology fixes now scattered across 3 intake dates into one canonical section of the existing methodology spec, and update the REVIEW-QUEUE.md intro. Docs-only.
3. **Ref-sweep convention (item 3)** — add one concise line to the project CLAUDE.md "Best Practices" list: sweep tests **and** comments (not just live callers) when removing a named call site. Docs-only. (The one 🟤 item folded into this otherwise-🟡 group.)

Because item 1 adds a hook + a script (runtime/config), **this PR is not docs-only** → it *is* eligible for `/code-review` (unlike CW-D / WR this week).

### Non-goals (stay in BACKLOG)

- **GitHub Actions CI** (BACKLOG `[2026-06-26]` option b) — heavier (M–L), adds a workflow file + makes E2E flakiness a remote gating cost; deferred. The WEEKLY narrows item 1 to "pre-push hook *or* checklist rule."
- **Pre-merge-checklist-only route** (option c) — rejected at brainstorm: no CI means "pre-merge" has no automatable hook point, and it leans on the same discipline that already failed in PR #56. Superseded by the pre-push hook.
- **"Only changed E2E files" scoping** — rejected: it misses cross-file breakage, which is the *exact* PR #56 failure mode (a `media-viewer.js` edit broke `clip-graceful-degradation.test.js`, an unchanged E2E file). The gate runs the **whole** suite when any runtime file changes.
- **Extracting a dedicated standalone methodology doc** (item 2 alternative) — the existing `2026-06-26-weekly-reviews-first-run-design.md` is already REVIEW-QUEUE.md's canonical pointer; consolidating in place avoids doc churn (user decision).
- **A new in-repo checklist doc for item 3** — rejected in favour of the always-loaded CLAUDE.md Best Practices list (user decision).
- **No `eslint.config.mjs` change** — the `scripts/**/*.js` block already exists (line ~241), so the new script is linted without edits (unlike CW-4, which had to add the block).

---

## 2. Item 1 — Automated E2E gate (pre-push, code-aware skip)

### 2.1 Architecture

Follows the `check-secrets.js` precedent exactly: the risky/branchy logic lives in a **pure, unit-tested** Node module; the Husky hook is a thin shell wrapper; git plumbing is a thin CLI around the pure functions.

| File | Action | Purpose |
|------|--------|---------|
| `scripts/check-e2e-needed.js` | Create | CommonJS. Exports pure `parsePushRefs(stdin)` + `classifyPaths(files)`. A CLI (`if (require.main === module)`) reads git's pre-push stdin, computes the changed-file set per ref, classifies, and prints `RUN` / `SKIP` to stdout (a human note to stderr). |
| `tests/check-e2e-needed.test.js` | Create | Vitest units for the two pure helpers (runs in the existing pre-commit vitest gate). |
| `.husky/pre-push` | Create | husky v9 format (plain sh). Captures the script's decision and runs `npx playwright test` only on `RUN`. |

Baseline just measured: **52 E2E tests, 2m05s, all green.** ~2 min once per code push; docs-only pushes stay instant.

### 2.2 The pure helpers (unit-tested surface)

**`parsePushRefs(stdin)`** — parse git's pre-push stdin. Git writes one line per pushed ref:
`<local_ref> <local_sha> <remote_ref> <remote_sha>`. Returns an array of `{ localRef, localSha, remoteRef, remoteSha }`, **excluding** branch-delete refs (`local_sha` is all-zeros — nothing to test). A missing/blank stdin → `[]`.

**`classifyPaths(files)`** → `boolean` — the run/skip decision. Returns `true` (**run E2E**) unless **every** path is documentation. Conservative — "run when unsure":

| Path shape | Classified as |
|------------|---------------|
| `*.md` (any markdown, any depth) | docs → skippable |
| `docs/**` (anything under `docs/`, incl. non-`.md` specs) | docs → skippable |
| anything else — `*.js`, `*.cjs`, `*.mjs`, `index.html`, `styles.css`, `.husky/**`, `tests/e2e/**`, `package.json`, config | runtime → **run** |
| empty file list | skippable (nothing changed) |

Only these two docs globs are treated as safe-to-skip; everything else forces a run. A file that is *both* under `docs/` and `.md` is still docs. A `.md` at repo root (e.g. `CLAUDE.md`, `README.md`) is docs → skippable.

### 2.3 The CLI wrapper (git plumbing — thin, fail-safe)

1. Read all of stdin; `parsePushRefs`. A failure to *read* stdin (not an empty read) is uncertainty → **fail-safe RUN**, not the empty-stdin SKIP of step 2.
2. If stdin read cleanly but yielded no ref tuples → print `SKIP` (stderr: "no pushable refs"), exit 0.
3. For each ref, compute the changed-file set for the outgoing range:
   - `remote_sha` all-zeros (**new branch** on remote) → `git diff --name-only $(git merge-base origin/main <local_sha>) <local_sha>` — i.e. what this branch changes vs `main`.
   - otherwise (**existing branch**, incremental push) → `git diff --name-only <remote_sha> <local_sha>`.
   - any git/spawn failure (e.g. `origin/main` not fetched, no merge-base) → treat this ref as **runtime-changed** (fail-safe RUN).
4. Union the changed files; `classifyPaths`.
5. Print `RUN` or `SKIP` to **stdout** (the token the hook captures); write a one-line human explanation to **stderr**.
6. Always `process.exit(0)` for a *decision* — the hook decides whether to run E2E from the token, so the script never blocks the push itself. Only an unhandled internal throw exits non-zero, and the hook's `|| echo RUN` fallback converts even that into a run.

### 2.4 The hook — `.husky/pre-push`

```sh
decision=$(node scripts/check-e2e-needed.js || echo RUN)
if [ "$decision" = "RUN" ]; then
    echo "pre-push: runtime code changed — running E2E suite (npx playwright test)…"
    npx playwright test
fi
```

- husky v9.1.7 format — no shebang / no legacy `husky.sh` sourcing (matches the existing `.husky/pre-commit`).
- Git passes the ref lines on **stdin**, which husky preserves into the hook and thus into `node` (inherited).
- **Fail-safe:** a node crash → `decision=RUN` → E2E runs (never a silent skip).
- **Bypass:** `git push --no-verify` skips all pre-push hooks — documented in the CLAUDE.md note (item 3's neighbourhood) for WIP branches. A non-zero `playwright test` exit blocks the push (the intended gate).

### 2.5 Edge cases

| Edge case | Handling |
|-----------|----------|
| Docs-only push (`*.md` / `docs/**` only) | `SKIP` — no E2E; instant |
| Mixed docs + code | `RUN` (any runtime path forces it) |
| New branch, `origin/main` present | diff vs `merge-base origin/main` |
| New branch, `origin/main` missing / no merge-base | fail-safe `RUN` |
| Branch delete (`local_sha` all-zeros) | ref dropped by `parsePushRefs`; if no refs remain → `SKIP` |
| Multiple refs in one push | changed files unioned across refs |
| `git diff` / spawn error on a ref | that ref treated as runtime-changed → `RUN` |
| stdin unreadable (`readFileSync(0)` throws) | fail-safe `RUN` (distinct from a clean empty read, which is `SKIP`) |
| node script crashes entirely | hook `|| echo RUN` → `RUN` |
| WIP push the dev knows is fine | `git push --no-verify` |
| Pushing **this** branch (`.husky/` + `scripts/` changed) | `RUN` — dogfoods the gate on its own PR |

### 2.6 Validation

- **Unit:** `tests/check-e2e-needed.test.js` —
  - `parsePushRefs`: single ref; multiple refs; a delete ref (all-zero `local_sha`) dropped; new-branch (`remote_sha` all-zeros) preserved with its flag; empty/blank stdin → `[]`.
  - `classifyPaths`: docs-only (`*.md`, `docs/x/y.md`, `docs/specs/z.txt`) → `false`; a single `.js` among docs → `true`; `.husky/pre-push` / `index.html` / `styles.css` / `package.json` → `true`; empty list → `false`; root `CLAUDE.md` → `false`.
  - Target ≥ 10 cases.
- **Manual dry-run** (no real push): pipe synthetic git stdin into the CLI and assert the printed token.
  - `printf 'refs/heads/x SHA refs/heads/x 0000000000000000000000000000000000000000\n'` with a docs-only branch → prints `SKIP`.
  - same with a branch touching a `.js` file → prints `RUN`.
- **Suite still green:** `npx playwright test` → 52/52 (baseline confirmed 2026-07-10).
- **Hook wiring:** the pre-commit vitest gate runs the new unit file on commit; a real push of this branch triggers the E2E run (dogfood).

---

## 3. Item 2 — Consolidate the Weekly-Reviews methodology (docs)

### 3.1 The 6 fixes to fold

Scattered across three intake dates; all belong to "how we run Weekly Reviews":

| # | Fix | Origin |
|---|-----|--------|
| 1 | Default to **lightweight inline** `WebSearch` + a few `WebFetch` per category; reserve the deep-research harness for a rare, explicitly-requested single deep dive. | `[2026-06-26]` (retro; harness burned ~8M tokens / never verified) |
| 2 | **Never fan out multiple harnesses in parallel** — one workflow at a time if the harness is used at all. | `[2026-06-26]` |
| 3 | **Recognize docs-only PRs before the `/code-review` fan-out** — cheap `gh pr view N --json files`; if every path is `*.md`/`docs/**`, treat as docs-only and skip the agent fan-out. | `[2026-06-29]` |
| 4 | **Merge or explicitly defer a docs-only Weekly-Reviews PR in its originating session** — a dated "merge pending — <reason>" note in WEEKLY.md if parked, so it isn't a silent stale branch. | `[2026-06-29]` |
| 5 | **Hybrid candidate sourcing as the default** — fresh-check the live landscape **and** the parked *Next-up* item each week, then review whichever is strongest (a rote parked-first pass surfaced only weak picks on 2026-07-05). | `[2026-07-06]` |
| 6 | **Run-card instead of full spec + plan for codified-repeat ⚪-overhead tasks** — once the method is codified, brainstorm → short run-card → execute satisfies the design gate; no fresh `writing-plans` cycle each week. | `[2026-07-06]` |

### 3.2 `docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md`

Add a new **`## Methodology (canonical — current practice)`** section (placed after the existing "First-run retro (2026-06-26)" section, which it supersedes and absorbs — leave the retro as the historical "why", the new section as the operative "how"). Content = the 6 fixes above as a numbered list, each with a one-line rationale and its intake date. A short lead-in notes this section is the operative reference (superseding D2 in the Decisions block).

### 3.3 `docs/planning/REVIEW-QUEUE.md`

- Update the **intro sentence** — the current "pick the top **not-yet-reviewed** candidate (a parked **Next-up** item first, else the current live top hit via web search…)" becomes the **hybrid** wording: fresh-check the live landscape *and* the parked Next-up item, review whichever is strongest.
- Add a brief clause to the existing **Methodology** pointer line noting the two operative defaults the intro doesn't already state: lightweight inline research (no deep-research harness) and the run-card path for this recurring task.

Docs-only; no code touched.

---

## 4. Item 3 — Ref-sweep convention (CLAUDE.md)

Add **one** bullet to the project `CLAUDE.md` **"Best Practices"** list (the "When modifying this codebase:" bullets, alongside "The renderer file is large — search before adding duplicates"):

> - When removing or relocating a **named** function / handler / call site, grep the whole repo for the symbol across **tests and comments** — not just live callers — and update or delete each hit before committing. The unit-only pre-commit hook won't catch a stale E2E assertion or a stale code comment (root cause of the PR #56 follow-ups).

Concise, matches the existing bullet style, always loaded into context. No new doc, no `docs/README.md` index change. Keeps CLAUDE.md within its durable-rules budget (one line).

> Note: the source item names the superpowers `receiving-code-review` / `verification-before-completion` checklists, but those are **third-party plugin skills** in the global plugin cache — not in-repo and not durably editable from this project. CLAUDE.md Best Practices is the in-repo, diff-reviewable, always-loaded equivalent (user decision).

---

## 5. Testing & acceptance

| Check | Expectation |
|-------|-------------|
| `tests/check-e2e-needed.test.js` | All cases pass (≥10) |
| Full unit suite (`npx vitest run`) | Green (423 → ~433+; case count rises by the new file) |
| `npm run lint` | Clean, incl. the new `scripts/check-e2e-needed.js` (existing `scripts/` block covers it) |
| `npm run format:check` | Clean (Prettier ignores `docs/` & `*.md`; the new `.js` files are formatted) |
| Manual dry-run of the hook logic | docs-only stdin → `SKIP`; a `.js` path → `RUN` |
| `npx playwright test` | 52/52 green (unchanged by this branch) |
| Real push of this branch | Pre-push fires, classifies `RUN` (touches `.husky/`+`scripts/`), runs E2E |
| Docs edits (items 2/3) | Manual review + link sanity; no broken references |

### Acceptance criteria

- [ ] `scripts/check-e2e-needed.js` exports pure `parsePushRefs` + `classifyPaths`; CLI prints `RUN`/`SKIP` and never blocks the push itself.
- [ ] `classifyPaths` returns skip **only** when every path is `*.md`/`docs/**`; any runtime path → run; conservative on the unknown.
- [ ] `.husky/pre-push` runs `npx playwright test` only on `RUN`, with a `|| echo RUN` fail-safe; `--no-verify` bypass documented.
- [ ] `tests/check-e2e-needed.test.js` covers the ref-parse + classify cases (≥10); full unit suite green; lint + format clean.
- [ ] Weekly-Reviews spec has a canonical `## Methodology` section folding all 6 fixes; REVIEW-QUEUE.md intro updated to hybrid sourcing + operative-defaults pointer.
- [ ] CLAUDE.md Best Practices has the one-line ref-sweep convention.
- [ ] Closeout: WEEKLY.md CW-P boxes (lines 72–74 + Fri line 157) checked; Summary-Table status → `✅ PR #N`; the folded BACKLOG entries checked off (E2E-gate, methodology-fixes ×4, ref-sweep, + the two `[2026-07-06]` follow-ups that fold into item 2).

---

## 6. Files affected

| File | Action |
|------|--------|
| `scripts/check-e2e-needed.js` | Create (pure helpers + CLI) |
| `tests/check-e2e-needed.test.js` | Create (Vitest units) |
| `.husky/pre-push` | Create (hook wrapper) |
| `docs/superpowers/specs/2026-06-26-weekly-reviews-first-run-design.md` | Modify (canonical Methodology section) |
| `docs/planning/REVIEW-QUEUE.md` | Modify (hybrid-sourcing intro + pointer clause) |
| `CLAUDE.md` | Modify (one Best-Practices bullet) |
| `docs/planning/WEEKLY.md`, `docs/planning/BACKLOG.md` | Modify at **closeout** (check off boxes / entries) |
