# G5. `CLAUDE.md` Size Audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G5 (🟡, 3 SP → ~4.5 SP); BACKLOG 🟡 [2026-09-21] "`CLAUDE.md` is at 212 lines, past the ~200 threshold…" and its 🟤 twin [2026-07-03] "CLAUDE.md is over its own ~200-line soft cap"
**Spec**: [2026-10-17-g5-claude-md-size-audit-design.md](../../superpowers/specs/2026-10-17-g5-claude-md-size-audit-design.md) (committed `1e934cb`; written spec approved by the user 2026-10-17)
**Created**: 2026-10-17
**Status**: Approved by the user 2026-10-17 (with the 25% headroom ruling, Premise Correction 6); execution: **Native**
**Last Updated**: 2026-10-17
**Branch**: `g5-claude-md-size-audit` (from `main` @ `506e041`)
**Runbook**: `docs/prompts/claude-md-audit.md` in `claude-code-universal-config`

**Goal:** `CLAUDE.md` holds durable rules only, every line something an agent must see before acting, with no rule lost; and a commit that grows it noticeably gets a warning.

**Architecture:** Read-only audit passes first (T1), whose findings feed a trim done in place, one commit per `##` section in file order (T2–T9), each removed sentence logged in a disposition table here. Then a new pure-plus-CLI Node script, `scripts/check-claude-md-size.js`, wired into the Husky pre-commit hook as a never-blocking byte-based warning, together with § Maintenance's authoring rule and new trigger (T10). An independent rule-loss check with a planted positive control, the link and reference checks, the size table and the migration recommendation close it (T11).

**Tech Stack:** Markdown (`CLAUDE.md`, docs), Node 20+ CommonJS (`scripts/`, no runtime dependencies), Vitest 4 (node environment, `createRequire` for CJS), Husky 9 POSIX `sh` hooks, Prettier 3, ESLint 9 flat config.

## Global Constraints

- **No heading renames** in `CLAUDE.md` (spec § 5). Every `##` heading and every bold sub-label cited elsewhere (`§ Cache Management`, `§ Async Patterns`, `§ Active gotchas`, `§ Best Practices`, `§ UI Components`, `§ Testing`, `§ Code Conventions`, `§ Architecture`) keeps its exact text. "Git Insights" keeps its name and its one-line pointer.
- **One commit per `##` section that changes, in file order** (spec § 5). A section with nothing to change gets a "no change" Progress Log row and no commit.
- **No line splitting or merging to move the line count.** Bullets merge only when they are duplicates (spec § 5).
- **Every removed sentence gets a disposition row before its commit** (spec § 1, § 5). Labels: `History`, `Walk-through`, `Duplicate`, `Readable from the code`. Tightened rules and kept "why" clauses need no row.
- **History exceptions** (spec § 5): keep a release name a rule depends on (e.g. "folders saved before G1 are re-confirmed once"); keep a verification caveat that changes what an agent would do (e.g. the docs not saying how a hook's `ask` behaves in `dontAsk`).
- **Spec pointer format**: `Design: [<short name> spec](docs/superpowers/specs/<file>.md)` — a repo-root-relative link, which resolves from `CLAUDE.md` at the root. Point at the spec that designed the contract; every pointer is checked in T11.
- **Warning figures** (spec § 6.2): `GROWTH_WARN_BYTES = 500`; `BYTE_TRIGGER` = the final `CLAUDE.md` size after T10's own edits, plus 25%, rounded up to the next 1,000 bytes. Both thresholds are exclusive. Lines are reported, never judged. The figures live only in the script; `CLAUDE.md` states none.
- **The script never blocks**: the CLI always exits 0; the hook line ends in `|| true`; a failure to measure prints `could not measure CLAUDE.md` to stderr.
- **Prettier** (`scripts/`, `tests/`): `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. `docs/` and `*.md` are Prettier-ignored.
- **ESLint**: `curly: ['error', 'all']` (braces on every `if` body, single-line included), `eqeqeq`, `prefer-const`, `no-var`; `scripts/**/*.js` is the Node-CJS block 6.
- **Protected paths**: writes under `.husky/` prompt (auto-mode classifier). Expected in T10.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run` (T10 adds the size warning after docs-index). Never `--no-verify`. Pre-push runs the full E2E suite because `scripts/` changes.
- **Public repo**: nothing secret or personal goes into a commit, the plan or the PR. `.mcp.json` is untracked and stays untouched.
- **Commits**: trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (or the executing model's own line). In subagent-driven mode the **controller** commits (memory `feedback_subagent_commits_vs_memory_hook`).

## Review Focus

1. **A load-bearing fact deleted as "history".** A sentence can carry a date or a PR number and still state the reason a control exists (e.g. "the `Bash(*preload.js*)` rule did not prompt for `cd <dir> && …`" is why the shell hook exists). Expected: the fact stays and only the date goes. Pinned in T11 (the rule-loss check, plus a re-read of every `History` row for an embedded rule).
2. **A `CLAUDE.md § X` citation elsewhere stops resolving.** BACKLOG and plans cite sub-labels by name. Expected: every cited label still exists. Pinned in T11 (Step 3, the citation grep).
3. **A spec pointer that does not resolve.** Expected: every link in `CLAUDE.md` names a tracked file. Pinned in T11 (Step 2, the link check, with a planted broken link as its control).
4. **The warning blocks a commit** — a crash, a run outside a repository, a first commit with no HEAD. Expected: the commit goes ahead every time. Pinned in T10 (the CLI tests: exit 0 in every case, plus a mutation run).
5. **A commit that adds a large bullet while deleting more.** The warning measures net growth, so it stays silent. Expected by design (spec § 6.2: staged minus HEAD). Pinned in T10 (unit test "net growth only"), so the behaviour is explicit rather than a surprise.

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `CLAUDE.md` | Modify | Trimmed per section (T2–T9); Backlog Intake pointer (T6); § Maintenance authoring rule and byte trigger, the chain clause in § Build, the `scripts/` row in § Architecture (T10) |
| `docs/planning/BACKLOG.md` | Modify | 📌 Process Rules gains the entry-shape line (T6); 🟤 [2026-08-27] migration entry gains the G5 recommendation annotation (T11) |
| `scripts/check-claude-md-size.js` | Create | Pure `measure`, `evaluate`, `formatWarning`; the figures; a never-blocking CLI (T10) |
| `tests/check-claude-md-size.test.js` | Create | Unit tests for the pure functions and the figures; CLI tests in temp git repos (T10) |
| `.husky/pre-commit` | Modify | Runs the size warning after docs-index, `|| true` (T10) |
| `PROJECT.md` | Modify | § Code Quality chain comment (T10); any wrong statement the T1 sweep finds |
| `docs/planning/GOALS.md` | Modify | Constraints row's pre-commit chain, which omits the docs-index guard (T1 sweep; dated comment beside `Last Updated`, no bump) |
| `docs/superpowers/specs/2026-10-17-g5-claude-md-size-audit-design.md` | Modify | Status: written spec approved (committed with this plan) |
| `docs/README.md`, `docs/planning/plans/README.md` | Modify | This plan under Active Plans / Current Plans (committed with this plan) |

**Live-surface preflight** (plans README step 4) — every live surface asserting a claim G5 changes, diffed against the table above:
- the pre-commit chain: `CLAUDE.md` § Build ✅ T10, `PROJECT.md` § Code Quality ✅ T10, `docs/planning/GOALS.md` Constraints row ✅ T1 (already stale: no docs-index; the size warning is not a gate, so it is not added there), `.husky/pre-commit` header comment ✅ T10;
- the audit trigger "~200 lines": `CLAUDE.md` § Maintenance ✅ T10; BACKLOG 🟡/🟤 entries (records, checked off at closeout);
- the `scripts/` inventory: `CLAUDE.md` § Architecture ✅ T10.
- **Checked, no claim to change**: `README.md` (no hook or `CLAUDE.md`-size claims), `docs/README.md` (indexes only).
- **Not changed, deliberately**: the sibling repo's content policy and runbook (G6 propagation, spec § 10); `docs/ARCHITECTURE.md` (spec § 9).

---

## Premise Corrections Made at Planning

1. **`docs/planning/GOALS.md` L74 omits the docs-index guard** from its pre-commit chain ("secret scan → lint-staged → the full unit suite"). Pre-existing drift, found by the planning-time chain sweep. Fixed in T1's sweep commit. Its `Last Updated` is **not** bumped: the stamp drives the strategic-review clock, and the file's own precedent (the 2026-10-09 comment beside it) records a non-refresh edit as a dated HTML comment.
2. **`BYTE_TRIGGER` is computed after T10's own `CLAUDE.md` edits**, not after T9. T10 adds the chain clause, the `scripts/` row and § Maintenance's new text; computing earlier would set the trigger ~0.5 KB lower than the spec intends.
3. **T10's own commit runs the new hook**, because Husky runs `.husky/pre-commit` from the working tree. If T10 grows `CLAUDE.md` by more than 500 bytes, its own commit prints the warning. Expected, and logged as a free live run.
4. **The CLI tests strip `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE`** from the spawned process's environment. Vitest runs inside the pre-commit hook, where git can export them, and the script's `git diff --cached` would read the real commit's index instead of the temp repo's (`tests/check-secrets.test.js` precedent). The no-repository test also sets `GIT_CEILING_DIRECTORIES`, so git cannot discover a repository above the temp dir.
5. **T11's link check reuses `extractLinks` from `scripts/check-docs-index.js`** (exported, pure, strips code spans and external URLs). No new code is committed for it.
6. **`BYTE_TRIGGER` headroom is 25%, not 10%** (user ruling at plan review, spec § 6.2 amended). A side-agent note: at a ~40 KB landing, 10% leaves ~4 KB, which last week's pace would cross within days, after which every growing commit warns. 25% leaves about one Cleanup-Week cycle at a guessed rule-only rate. Improvement 4 measures the real rate.

## Task Ordering

T1 (passes, sweep fixes) first: its findings are applied during the trims. T2–T9 in file order, because the homes ledger (below) decides where a duplicate lives, and a later section's home must still hold the fact when an earlier section drops its copy. T10 after T9: `BYTE_TRIGGER` needs the final size. T11 last: it checks the final file.

**Model and effort** (WORKFLOW.md § 1.0):

| | Choice | Why |
|---|---|---|
| SP | 3 → ~4.5 | T1 0.75 (four passes, sweep fixes), T2–T9 2.0 (Detected Patterns 0.75, Git Insights 0.5, the other six 0.75), T10 1.0 (script, tests, hook, docs), T11 0.5, Finish 0.25. 1.5× — inside the 2× stop line. |
| Execution | **Opus 5.5 · `medium`** for T1–T9 and T11 (the trim decides "why" versus history sentence by sentence — where a rule gets lost; spec D6). **Sonnet 5.5 · `medium`** for T10 (the plan holds its complete code). | The WEEKLY's first guess put the trims on Sonnet; they are judgment, not mechanics. |
| Switch | **Native chosen** (user, 2026-10-17): run on Opus · `medium` after the user's `/compact`; T10 may go to a Sonnet subagent. None for a native run on Opus · `medium`. Subagent-driven: name Sonnet for the T10 implementer. The rule-loss agent (T11) stays at the session's tier — verification never runs cheaper (WORKFLOW § 1.0 Subagents). | |
| Final review | Standard (`high`): `/code-review high` on the PR **in a separate chat** (memory `feedback_ask_before_in_chat_code_review` — ask first) | WEEKLY's first guess, confirmed: one never-blocking script and a docs trim. |

---

## Task 1: Read-only passes and sweep fixes

**Files:**
- Modify: `docs/planning/GOALS.md:5,74`; `PROJECT.md` and the other sweep surfaces only for wrong statements the sweep finds
- Create (scratchpad, not committed): `stale-refs.js`
- Log: this plan, § Pass Results

**Interfaces:**
- Produces: § Pass Results (prompt-audit findings, improver report, stale references, sweep table, `.mcp.json` result), which T2–T9 apply.

- [x] **Step 1: Baseline.** Run:

```bash
wc -lc CLAUDE.md
awk '/^## /{if(name)printf "%-36s %4d lines %6d bytes\n",name,l,b; name=$0; l=0; b=0} {l++; b+=length($0)+1} END{printf "%-36s %4d lines %6d bytes\n",name,l,b}' CLAUDE.md
```

Expected: `236 64203 CLAUDE.md` and the per-section table in spec § 2.2. A different number means `CLAUDE.md` changed after `506e041`: stop and re-baseline the spec's § 2 first.

- [x] **Step 2: `/claude-api prompt-audit`.** Invoke the `claude-api` skill with args `prompt-audit`. If the skill does not offer that subcommand, ask the user to run `/doctor prompt-audit` and paste its findings. Record each finding in § Pass Results with the section it applies to and the intended fix. Make no edit yet.

- [x] **Step 3: `/claude-md-improver`, report only.** Invoke `claude-md-management:claude-md-improver` on this repository. Take its quality report; decline its edits (spec D3 — a whole-file rewrite is the rejected approach B). Record its findings in § Pass Results.

- [x] **Step 4: Stale-reference probe.** Write this file with the Write tool (memory: the Bash tool halves backslashes) to `<scratchpad>/stale-refs.js`:

```js
// Throwaway: G5 T1 stale-reference probe. Not committed.
// Lists backticked tokens in CLAUDE.md that nothing tracked outside Markdown and docs/ mentions.
// The output is triaged by hand: runtime-only names (e.g. `.feature_cache.json`) are expected hits.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const SENTINEL = '__g5SentinelMissing__';
const md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8') + '\n`' + SENTINEL + '`\n';

const ids = new Set();
const paths = new Set();
for (const m of md.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim().replace(/\(.*$/, '');
    if (/^[\w.-]*\/[\w./*-]*$/.test(t) || /^[\w.-]+\.(js|cjs|mjs|json|html|css|png|mp4|jxl|sh|cmd)$/.test(t)) {
        paths.add(t.replace(/\*.*$/, ''));
    } else if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(t)) {
        const last = t.split('.').pop();
        if (last.length >= 5) {
            ids.add(last);
        }
    }
}

const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const codeFiles = tracked.filter(
    (f) =>
        !f.endsWith('.md') &&
        !f.startsWith('docs/') &&
        f !== 'package-lock.json' &&
        !/\.(png|jpe?g|gif|mp4|webm|jxl|wasm|ico)$/.test(f)
);
const corpus = codeFiles
    .map((f) => {
        try {
            return fs.readFileSync(path.join(root, f), 'utf8');
        } catch {
            return '';
        }
    })
    .join('\n');

const missingIds = [...ids].filter((t) => !corpus.includes(t)).sort();
const missingPaths = [...paths]
    .filter((p) => !tracked.some((f) => f === p || f.startsWith(p) || f.endsWith('/' + p)))
    .sort();

console.log(missingIds.includes(SENTINEL) ? 'SENTINEL OK' : 'SENTINEL MISSING: the probe is broken');
console.log(`\nIdentifiers not found in tracked code (${missingIds.length - 1}):`);
for (const t of missingIds) {
    if (t !== SENTINEL) {
        console.log('  ' + t);
    }
}
console.log(`\nPaths not found in git ls-files (${missingPaths.length}):`);
for (const p of missingPaths) {
    console.log('  ' + p);
}
```

Run: `node <scratchpad>/stale-refs.js "$(pwd)"`. Expected: first line `SENTINEL OK` (if not, the probe is broken; fix it before reading anything else). Triage each hit in § Pass Results as one of: **deleted code named only as history** (removed in its section task), **runtime-only name** (no action), **wrong name** (fixed in its section task). Keep the probe: T11 re-runs it.

- [x] **Step 5: Concept-vocabulary sweep.** Complete the concept list from `git log --since=2026-06-16 --format='%h %s' -- CLAUDE.md` and DONE.md entries since 2026-06-16: add every convention renamed or retired. Seed list and patterns:

| Concept | Phrasing families (pattern) |
|---|---|
| Section markers | `AUTO-MANAGED\|<!-- MANUAL\|Custom Notes` |
| The old `.claude/` commit rule | `never commit.{0,40}\.claude\|\.claude/\*\|only \.claude/agents` |
| Deferred compare refresh / worker updates | `deferred (compare )?refresh\|_beginDeferredCompareRefresh\|re-scoring window\|reverseUpdate\|type: ?'update'` |
| Online per-rating updates | `online (per-rating )?update\|previousScores` |
| Renderer sorting copies | `sortMediaBySimilarity\|renderer'?s? own cop` |
| Retired memory mechanisms (runbook, mandatory) | `Memory Protocol\|knowledge graph\|server-memory\|mcp__memory__` |
| `dead-rules-audit` (dropped as a compliance tool) | `dead-rules-audit` |

For each row run:

```bash
git grep -n -iE '<pattern>' -- CLAUDE.md PROJECT.md README.md docs/README.md docs/PROJECT_CONTEXT.md docs/planning/GOALS.md docs/planning/ROADMAP.md docs/planning/MILESTONES.md
```

Record each row with its pattern **and** its result (a hit list or "0 hits") in § Pass Results — a result without its filter cannot be told apart from an all-clear (runbook step 3). A hit in `CLAUDE.md` is applied in its section task. A wrong statement elsewhere is fixed in Step 7. A stale derived number elsewhere (e.g. `PROJECT.md`'s "~9,400 lines", "2 of 6 managers extracted") is listed under 🟤 [2026-09-02] "Sweep the repo's existing restated derived counts", not fixed.

- [x] **Step 6: `.mcp.json`.** Run: `git ls-files .mcp.json; grep -c "server-memory\|modelcontextprotocol/server-memory" .mcp.json`. Expected: no tracked file, count `0`. Record it. The Context7 key is not a finding (user ruling 2026-06-16).

- [x] **Step 7: Fix wrong statements in other live docs.** At least `docs/planning/GOALS.md` (Premise Correction 1). Replace L74's chain text `pre-commit (secret scan → lint-staged → the full unit suite; count in PROJECT.md)` with `pre-commit (secret scan → docs-index guard → lint-staged → the full unit suite; count in PROJECT.md)`, and append to L5's existing HTML comment, inside the `-->`: ` 2026-10-17: pre-commit chain corrected (G5 sweep). Not a refresh.` Apply any other Step 5 fix the same way.

- [x] **Step 8: Commit.**

```bash
git add docs/planning/GOALS.md docs/planning/plans/2026-10-17_g5-claude-md-size-audit.md   # plus any other Step 7 file
git commit -m "docs: G5 audit passes - findings logged; GOALS.md pre-commit chain corrected (G5 T1)"
```

---

## Tasks 2–9: the per-section trim

Each of T2–T9 follows the same five steps; the section notes below say what is already known about each. **The homes ledger** decides duplicates: when a section drops a fact whose home is later in the file, the later home must state it fully at that moment, and keeps it when its own task comes.

**Homes ledger (seeded at planning; extend it as duplicates turn up):**

| Fact | Home | Elsewhere → |
|---|---|---|
| CLIP runs in main; npm packages cannot resolve in Electron Web Workers | § Git Insights gotcha "`@huggingface/transformers` … cannot resolve in Electron Web Workers" | § Architecture Data Flow 1 and 4, § Detected Patterns → Async Patterns "CLIP extraction": drop the reason clause |
| `.claude/` allow-list: what is committed and why | § Git Insights gotcha "`.claude/` is **allow-listed**" | § Architecture tree `.claude/` row → one line naming the committed kinds, "see § Active gotchas" |
| `clip-image.js` limits and decode order | § Git Insights gotcha "CLIP's decoder is stricter than Chromium" | § Architecture `clip-image.js` blurb → purpose only |
| The tournament leave prompt (Save / Discard / Cancel) | § Git Insights gotcha "Tournament Escape + mode-selector clicks…" | § Detected Patterns → Recently opened folders: drop the prompt detail |
| The file-op guard contract | § Detected Patterns → Async Patterns "File-op guard" | § Code Conventions E2E bullet keeps only the test-side rule (let the previous move finish) |
| Folder grants, the re-confirm flow | § Detected Patterns → Security | Async Patterns' "since the security G1" sentence keeps only the move-order rule (folders checked before any media teardown) |

**The five steps, for each section task:**

- [ ] **Step 1: Read the section and its pass findings.** Read the section in `CLAUDE.md`, the § Pass Results rows that name it, and the homes ledger.
- [ ] **Step 2: Label and write the disposition table.** Label every sentence (spec § 5). Under § Disposition Tables, add `### T<N> — <section>` with one row per removed sentence:

```markdown
| # | Removed text (first words, quoted) | Label | Where it lives now |
|---|---|---|---|
| 1 | "Until G3 (2026-10-13) this made…" | History | DONE.md 2026-10-16 G3 entry; G3 spec |
| 2 | "The clicked row reads "Checking…"" | Walk-through | Design pointer → G4 spec § 6 |
| 3 | "npm packages can't resolve in Electron Web Workers" | Duplicate | § Git Insights gotcha (home) |
```

- [ ] **Step 3: Edit.** Apply the labels, the pass findings for this section, and the pointer format (Global Constraints). Re-read every remaining sentence once: each must be a rule or the one reason that makes a rule followable.
- [ ] **Step 4: Measure.** Run the Step 1 `awk` command from T1; log the section's bytes and lines before → after in the Progress Log.
- [ ] **Step 5: Commit.**

```bash
git add CLAUDE.md docs/planning/plans/2026-10-17_g5-claude-md-size-audit.md
git commit -m "docs(claude-md): trim <section> to durable rules (G5 T<N>)"
```

### Task 2: § Overview (472 B)

Likely nothing to change: a product summary the whole file depends on. If nothing changes, log "no change" and skip the commit.

### Task 3: § Build & Development Commands (1,521 B)

The commands block stays. The pre-commit paragraph (~1.1 KB) keeps each check's command, the order, the `SKIP=` tokens with the PowerShell form, and the `--no-verify` warning. Candidates: each check's internal description (the scripts' own headers hold it), "fail-fast first step". The new size-warning clause is added in T10, not here.

### Task 4: § Architecture (5,460 B)

- Per-file blurbs: keep each file's **purpose** and any rule an editor needs before touching it (e.g. `ml-model.js` 576-dim input, `jxl-decode-worker.js` module worker). Drop detail readable from the code: export lists (`sorting-worker.js`), constants, `media-viewer.js`'s line count (a derived number), `recent-folders.js`'s internals.
- `logger.js`: keep where the logs are (`%APPDATA%\media_viewer\logs`, and `%APPDATA%\Electron\logs` under E2E) and "no `Session ended` footer = crash or kill" — both diagnostic rules.
- `tests/` row: keep that `tiny.mp4` is an unplayable 32-byte stub and `playable-64x64.mp4` is a real clip (picking the wrong fixture silently tests nothing).
- `.claude/` row and Data Flow: per the homes ledger.

### Task 5: § Code Conventions (7,250 B)

- **Patterns**: drop "Planned next: ZoomManager, CompareManager, SortingManager…" (roadmap state; MILESTONES holds it).
- **Formatting & Linting**: the ESLint block list ("twelve file-group blocks…") is a derived count and readable from `eslint.config.mjs` — keep "one block per file group", the two G1 guards (main.js bans bare `ipcMain`; renderer `htmlSinkGuard`), "flat config replaces a rule's options per object, so merge into that array", and that `tests/lint-guard.test.js` proves both rules fire.
- **Testing (Unit)**: the worker-abort bullet keeps the rule (set via `self.onmessage({data:{type:'abort'}})`, reset via `resetAbort()`, `sorting-worker.js` only); its G4 history clause goes.
- **Testing (E2E)**: the helpers bullet (~900 B) keeps the API contract (`seedLocalStorage` order and `{ grant }`, `grantFolder`, `mockFolderDialog`, `loadFolder` grants, fresh grant store per launch, `closeApp`, Lucide stub, `createTempFixtureDir`, `recentFolders` cleared, `__mvDialogCalls`). The `mlWorker`-lazy bullet (~900 B) keeps: lazy; call `initializeMlWorker()`; 576-dim vectors; warm through `_runWorkerTraining` with ≥3 likes and ≥3 dislikes; `isSortedByPrediction = true` alone proves nothing; a bulk rating or its undo posts nothing to the worker. Its "Since G1 (`_beginDeferredCompareRefresh` and friends are deleted)" history goes.

### Task 6: § Backlog Intake Rules (1,466 B) — spec D4

**Files:** `CLAUDE.md`, `docs/planning/BACKLOG.md` (📌 Process Rules).

Replace the section body (everything between `## Backlog Intake Rules` and `## Detected Patterns`) with exactly these three lines, approved by the user:

```markdown
Read `docs/planning/BACKLOG.md` § 📌 Process Rules before filing an entry; they are authoritative.
Route by source: user-raised → 🔵 User-Flagged; Claude- or automation-surfaced → 🟤 Auto-Generated; periodic maintenance, audits and watches → 🟡 Operational. Unsure → ask.
Entry shape: `- [ ] **Short title** — body with context, cross-refs, affected files`.
```

In BACKLOG 📌 § Intake rules, after the bullet "One entry per concrete actionable item; do NOT merge entries on intake…", add:

```markdown
- Entry shape: `- [ ] **Short title** — body with context, cross-refs, affected files`
```

The disposition table lists each dropped block as `Duplicate` with its home in 📌 (source routing, date grouping, one entry per item and `[possible-dup-of: …]`, PR-review section per PR, the ~20 SP Cleanup Week trigger). Commit both files together.

### Task 7: § Detected Patterns (29,691 B)

The largest cut. Known items, by sub-label:
- **Error Handling**: drop "(before G3, every string logged as `undefined`)".
- **Data Structures**: keep "live only in `sorting-worker.js`; sorting is worker-only", the cosine-distance facts and the renderer copy's `1`-on-null rule. Drop the PR #54 history and "Shared-utility extraction tracked in BACKLOG" (transient).
- **State Management**: Like-or-skip → its contract (the `active` token, `_onOrderChanged(kind)` for every order reassignment, the glue test that fails on a new `this.mediaFiles =`, the stale count by identity) + `Design: [G2 spec](docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md)`. Recently opened folders → its contract (recorded only by `loadFolder`'s non-empty success branch; changed only through `_setRecentFolders`; rendering asks main nothing; `openRecentFolder` is single-flight and checks on click; `_folderIntentGen` drops a stale `'open'`/`'regrant'`; one folder load at a time via `_folderLoadInFlight` and why) + `Design: [G4 spec](docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md)`. `resetMlModel()` (~1.4 KB): keep what it resets, that the session-tier clear is load-bearing with one clause of why, the call sites, and that `loadFolder()` deliberately does not call it; drop the symptom chain.
- **Cache Management**: Training-vector cache (~1.9 KB) → the isolation contract (module-local Map **and** `{ useHostCache: false }`; source-folder maps read-only), the one-lock rule, the perf-log line, the `failed=N`/`noClip=N` meaning + `Design: [ML pipeline spec](docs/superpowers/specs/2026-09-10-ml-training-pipeline-design.md)`; drop "this shipped violated for most of the branch". Tournament persistence (~2.4 KB) → version 2 history-free, debounced single-flight + `flush()`/`cancelPending()`, atomic write, reconcile on resume, the render owner's never-await rule, `_skipFailedTournamentFile`, `_pruneUnlistedEngineFiles`, load-time validation + `Design: [render re-entry spec](docs/superpowers/specs/2026-10-07-g3-tournament-render-reentry-design.md)`.
- **UI Components** (~3.3 KB): keep the overlay bar's home (not inside `.media-wrapper`, and why), the explicit `grid-column` pins with their why, `removeZoomPopover` must not remove the toggle's parent, `#compareActionBar` hidden in tournament mode, the bulk-dislike modal and the recent-folders menu owning the keyboard (capture listeners, one close path), the wheel rule. Drop CSS values (`30px`/`96px`, `56px`, `opacity:.35`, the `max-height` calc) and the "caught by the committed visual evidence" history. Pointers: `Design: [overlay spec](docs/superpowers/specs/2026-09-13-g2-reachable-overlay-controls-design.md)`; the menu → the G4 spec.
- **Async Patterns**: CLIP extraction → homes ledger. File-op guard (~3.1 KB) keeps the full contract: the six holders, held from before the first `await` to the `finally`; quiet refusals versus undo's notice, checked before the empty-history branch; the header actions refused through `_refuseIfFileOpInFlight()`; why a running sort is the exception and the three refusals it forces; not `isLoading`, and why; the render handoff with its two exceptions; **no guarded method may call another**; `forceVideoCleanup` nulls `currentMedia` only if it still holds the video it cleaned; moves check folders before teardown; a refused check (`null`) goes to `_refuseUngrantedFolder`; `move-file` never replaces and undo follows `targetPath`. Add `Design: [rating-safety spec](docs/superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md)`. Drop the G-tags, "reproduced in G1's Phase 0", and the BACKLOG reference for the tournament handlers (keep the fact that picks, draws and `handleTournamentUndo` are deliberately outside the guard).
- **Compare Mode Validation**, **Key Dependencies**: drop the "(G3)" and "direct since G3" tags.
- **Security**: keep the spec link and every bullet's rule; drop "(G1, PR #78; …)" provenance and "Tracked as TODO 🔴" (state); keep the I1 caveat itself.
- **Keyboard Shortcuts**: the form-field bullet keeps the rule, what counts as a text field, why `select` is excluded (one clause), and its position after Escape/F1; drop the PR #74 and E2E-name history.

### Task 8: § Git Insights (15,723 B)

Keep the opening pointer sentence. For each gotcha keep the rule and one why; known history to drop: the CLIP-lease bullet's "Fixed at the kickoff site by `4ea65c3` (PR #34) and at the prediction-sort site by G5 four months later"; shortcut versioning's narrative (keep the consequence as its why: a stolen key silently moved a file); `_releaseVideo`'s "Until G3 (2026-10-13)…"; the CLIP-decoder bullet's "before G3's … 9 such images…" (keep: strict first, lenient fallback after; the two limits and why; buffer, not path, and why); "(PR #81 review #2)"; "(that peek was the G2 bug: …)" (keep that `moveHistory` must never be peeked); "would undo the PR #55 24k win" (keep: one O(n) snapshot per pruned file). This section is the home for three ledger rows — keep them complete.

### Task 9: § Best Practices (2,164 B)

The `preload.js` bullet (~1.2 KB) keeps: the rule; the enforcement (`permissions.ask` rules, the `PreToolUse` hook) and that the hook exists because the `Bash(*preload.js*)` rule missed `cd <dir> && … preload.js` (Review Focus 1); the docs caveat about `bypassPermissions`/`dontAsk`; the not-covered list. Drop the dates and the "18 `Bash` commands" count. The grep-rule bullet drops "(root cause of the PR #56 follow-ups)" and "(PR #70)", keeping "a comment that describes the old behaviour in prose survives the grep — re-read every comment attached to changed code".

---

## Task 10: The size warning, the authoring rule and the byte trigger

**Files:**
- Create: `scripts/check-claude-md-size.js`, `tests/check-claude-md-size.test.js`
- Modify: `.husky/pre-commit`, `CLAUDE.md` (§ Build, § Architecture `scripts/` row, § Maintenance), `PROJECT.md:64`

**Interfaces:**
- Produces (module exports of `scripts/check-claude-md-size.js`):
  - `measure(text: string): { lines: number, bytes: number }` — lines = count of `\n`; bytes = UTF-8 length.
  - `evaluate(before, after, limits: { growthWarnBytes: number, byteTrigger: number }): Array<'growth' | 'trigger'>`
  - `formatWarning(before, after, kinds, limits): string` — `''` when `kinds` is empty.
  - `GROWTH_WARN_BYTES: 500`, `BYTE_TRIGGER: number` (a positive multiple of 1,000).

- [ ] **Step 1: Write the failing tests** — `tests/check-claude-md-size.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SCRIPT = require.resolve('../scripts/check-claude-md-size.js');
const { measure, evaluate, formatWarning, GROWTH_WARN_BYTES, BYTE_TRIGGER } = require(SCRIPT);
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LIMITS = { growthWarnBytes: 500, byteTrigger: 10000 };
const size = (bytes, lines = 0) => ({ bytes, lines });

describe('measure', () => {
    it('counts lines the way wc -l does (newline characters)', () => {
        expect(measure('a\nb\n')).toEqual({ lines: 2, bytes: 4 });
    });

    it('does not count a last line that has no newline', () => {
        expect(measure('a\nb')).toEqual({ lines: 1, bytes: 3 });
    });

    it('counts UTF-8 bytes, not characters', () => {
        // '→' is 3 bytes and '🔵' is 4.
        expect(measure('→🔵\n')).toEqual({ lines: 1, bytes: 8 });
    });

    it('treats empty or missing text as zero', () => {
        expect(measure('')).toEqual({ lines: 0, bytes: 0 });
        expect(measure(undefined)).toEqual({ lines: 0, bytes: 0 });
    });
});

describe('evaluate', () => {
    it('does not warn at exactly the growth limit', () => {
        expect(evaluate(size(1000), size(1500), LIMITS)).toEqual([]);
    });

    it('warns one byte past the growth limit', () => {
        expect(evaluate(size(1000), size(1501), LIMITS)).toEqual(['growth']);
    });

    it('does not warn when growth ends exactly at the byte trigger', () => {
        expect(evaluate(size(9999), size(10000), LIMITS)).toEqual([]);
    });

    it('warns on any growth past the byte trigger', () => {
        expect(evaluate(size(10000), size(10001), LIMITS)).toEqual(['trigger']);
    });

    it('reports both when a large commit also crosses the trigger', () => {
        expect(evaluate(size(9800), size(10400), LIMITS)).toEqual(['growth', 'trigger']);
    });

    it('never warns on a shrink, even past the trigger', () => {
        expect(evaluate(size(12000), size(11000), LIMITS)).toEqual([]);
    });

    it('never warns when the size is unchanged, even past the trigger', () => {
        expect(evaluate(size(20000), size(20000), LIMITS)).toEqual([]);
    });

    it('measures net growth only: a commit that adds 800 bytes and removes 900 is silent', () => {
        expect(evaluate(size(5000), size(4900), LIMITS)).toEqual([]);
    });

    it('ignores a line-count rise when no byte limit is crossed', () => {
        expect(evaluate(size(1000, 10), size(1100, 60), LIMITS)).toEqual([]);
    });

    it('measures a missing HEAD copy as empty', () => {
        expect(evaluate(measure(''), size(600), LIMITS)).toEqual(['growth']);
    });
});

describe('formatWarning', () => {
    it('returns an empty string when there is nothing to warn about', () => {
        expect(formatWarning(size(1000), size(1100), [], LIMITS)).toBe('');
    });

    it('names the growth, the totals and the authoring rule', () => {
        const msg = formatWarning(size(1000, 10), size(1501, 12), ['growth'], LIMITS);
        expect(msg).toContain('+501 bytes (+2 lines)');
        expect(msg).toContain('now 12 lines / 1501 bytes');
        expect(msg).toContain('more than 500 bytes in one commit');
        expect(msg).toContain('one sentence plus at most one "why"');
        expect(msg).toContain('A warning only');
        expect(msg).not.toContain('audit trigger');
    });

    it('says the file is due for an audit past the trigger', () => {
        const msg = formatWarning(size(10000), size(10001), ['trigger'], LIMITS);
        expect(msg).toContain('past its 10000-byte audit trigger');
        expect(msg).toContain('CLAUDE.md § Maintenance');
        expect(msg).not.toContain('in one commit');
    });

    it('signs a falling line count', () => {
        expect(formatWarning(size(1000, 20), size(1600, 17), ['growth'], LIMITS)).toContain('(-3 lines)');
    });
});

describe('the figures', () => {
    it('warns on growth past 500 bytes (spec § 6.2)', () => {
        expect(GROWTH_WARN_BYTES).toBe(500);
    });

    it('has a byte trigger that is a positive multiple of 1,000', () => {
        expect(BYTE_TRIGGER).toBeGreaterThan(0);
        expect(BYTE_TRIGGER % 1000).toBe(0);
    });
});

describe('CLI: never blocks a commit', () => {
    let dir;

    // Vitest runs inside the pre-commit hook, where git can export these. The script's own git
    // calls would then read the real commit's index instead of the temp repo's.
    const env = { ...process.env };
    delete env.GIT_DIR;
    delete env.GIT_INDEX_FILE;
    delete env.GIT_WORK_TREE;
    const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env });
    const run = (extraEnv = {}) =>
        spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...env, ...extraEnv } });
    const write = (text) => fs.writeFileSync(path.join(dir, 'CLAUDE.md'), text);

    const initRepo = () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-size-'));
        git(['init', '--quiet']);
        git(['config', 'user.email', 'test@example.com']);
        git(['config', 'user.name', 'G5 Test']);
        git(['config', 'core.autocrlf', 'false']);
        git(['config', 'commit.gpgsign', 'false']);
    };

    const commitBase = () => {
        write('# Rules\n');
        git(['add', 'CLAUDE.md']);
        git(['commit', '--quiet', '-m', 'init']);
    };

    afterEach(() => {
        if (dir) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch {
                // Windows can briefly hold a .git pack handle; a leaked temp dir is harmless.
            }
            dir = undefined;
        }
    });

    it('warns on a staged growth past 500 bytes, and exits 0', () => {
        initRepo();
        commitBase();
        write('# Rules\n' + 'x'.repeat(600) + '\n');
        git(['add', 'CLAUDE.md']);
        const r = run();
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('more than 500 bytes in one commit');
    });

    it('is silent when CLAUDE.md changed but is not staged', () => {
        initRepo();
        commitBase();
        write('# Rules\n' + 'x'.repeat(600) + '\n');
        const r = run();
        expect(r.status).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('is silent when CLAUDE.md is staged for deletion', () => {
        initRepo();
        commitBase();
        git(['rm', '--quiet', 'CLAUDE.md']);
        const r = run();
        expect(r.status).toBe(0);
        expect(r.stderr).toBe('');
    });

    it('measures a first commit against an empty HEAD', () => {
        initRepo();
        write('x'.repeat(600) + '\n');
        git(['add', 'CLAUDE.md']);
        const r = run();
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('+601 bytes');
    });

    it('says it could not measure outside a git repository, and still exits 0', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-size-norepo-'));
        const r = run({ GIT_CEILING_DIRECTORIES: path.dirname(dir) });
        expect(r.status).toBe(0);
        expect(r.stderr).toContain('could not measure CLAUDE.md');
    });
});
```

- [ ] **Step 2: Run it to verify it fails.** Run: `npx vitest run tests/check-claude-md-size.test.js`. Expected: the file fails to collect — `Cannot find module '…/scripts/check-claude-md-size.js'` (from `require.resolve`). Log the message.

- [ ] **Step 3: Write the script** — `scripts/check-claude-md-size.js` (`BYTE_TRIGGER` starts at the provisional `52000`; Step 6 sets the real value):

```js
// Pre-commit CLAUDE.md size warning: says so when a commit grows CLAUDE.md past its limits.
//
// CLAUDE.md loads into every session, so its size is paid on every turn. Lines are a poor
// measure here: each rule is one line, and a rule grows by getting longer, so the line count
// barely moves while the bytes climb (2026-10-09 → 10-16: lines +9%, bytes +30%). Both
// warnings are therefore in bytes; lines are only reported.
//
// 1. GROWTH — the commit adds more than GROWTH_WARN_BYTES, net (staged copy minus HEAD's):
//    more than one rule plus its reason, the shape CLAUDE.md § Maintenance asks for.
// 2. TRIGGER — the staged copy is past BYTE_TRIGGER and the commit grows it at all. Past the
//    trigger the file is due for an audit (§ Maintenance). A shrinking commit never warns.
//
// NEVER BLOCKS: this is advice, not a gate. The CLI always exits 0, and the hook line ends in
// `|| true`. When it cannot measure, it says so on stderr: silence would read as a pass.
//
// SCOPE: it reads the git index and HEAD, not the working tree, because `git commit` commits
// the index (as check-docs-index.js does). Not staged, or staged for deletion: silent.
//
// `measure`, `evaluate` and `formatWarning` are pure and unit-tested. No runtime dependencies.

const GROWTH_WARN_BYTES = 500;
// The size after the G5 audit plus 25%, rounded up to the next 1,000. Change it only at an
// audit (CLAUDE.md § Maintenance).
const BYTE_TRIGGER = 52000;

/**
 * Size a text the way `wc -lc` would: lines are newline characters, bytes are UTF-8.
 * @param {string} text
 * @returns {{lines: number, bytes: number}}
 */
function measure(text) {
    const s = typeof text === 'string' ? text : '';
    return { lines: (s.match(/\n/g) || []).length, bytes: Buffer.byteLength(s, 'utf8') };
}

/**
 * Which warnings a commit earns. Both limits are exclusive: exactly at a limit is fine.
 * @param {{lines: number, bytes: number}} before HEAD's copy (zeroes when HEAD has none)
 * @param {{lines: number, bytes: number}} after the staged copy
 * @param {{growthWarnBytes: number, byteTrigger: number}} limits
 * @returns {Array<'growth'|'trigger'>}
 */
function evaluate(before, after, limits) {
    const delta = after.bytes - before.bytes;
    const kinds = [];
    if (delta > limits.growthWarnBytes) {
        kinds.push('growth');
    }
    if (delta > 0 && after.bytes > limits.byteTrigger) {
        kinds.push('trigger');
    }
    return kinds;
}

const signed = (n) => (n >= 0 ? `+${n}` : String(n));

/**
 * The warning text for `kinds`, or '' when there is nothing to warn about.
 * @param {{lines: number, bytes: number}} before
 * @param {{lines: number, bytes: number}} after
 * @param {Array<'growth'|'trigger'>} kinds
 * @param {{growthWarnBytes: number, byteTrigger: number}} limits
 * @returns {string}
 */
function formatWarning(before, after, kinds, limits) {
    if (!kinds || kinds.length === 0) {
        return '';
    }
    const out = [
        `⚠️  CLAUDE.md grows by ${signed(after.bytes - before.bytes)} bytes (${signed(after.lines - before.lines)} lines) ` +
            `in this commit — now ${after.lines} lines / ${after.bytes} bytes.`,
    ];
    if (kinds.includes('growth')) {
        out.push(`   • more than ${limits.growthWarnBytes} bytes in one commit`);
    }
    if (kinds.includes('trigger')) {
        out.push(
            `   • past its ${limits.byteTrigger}-byte audit trigger: the file is due for an audit (CLAUDE.md § Maintenance)`
        );
    }
    out.push('   A new rule is one sentence plus at most one "why"; history goes to DONE.md or the spec;');
    out.push('   extend an existing bullet rather than add a near-duplicate.');
    out.push('   (A warning only — the commit goes ahead.)');
    return out.join('\n');
}

module.exports = { measure, evaluate, formatWarning, GROWTH_WARN_BYTES, BYTE_TRIGGER };

// --- CLI: warn about the staged CLAUDE.md; never fail the commit ---
if (require.main === module) {
    const { execFileSync } = require('child_process');
    // stderr is piped, not inherited: `git show HEAD:CLAUDE.md` failing on a first commit is expected.
    const git = (args) =>
        execFileSync('git', args, {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

    try {
        const staged = git(['diff', '--cached', '--name-only', '--diff-filter=AMR', '--', 'CLAUDE.md']).trim();
        if (staged !== '') {
            const after = measure(git(['show', ':CLAUDE.md']));
            let headText = '';
            try {
                headText = git(['show', 'HEAD:CLAUDE.md']);
            } catch (_err) {
                headText = ''; // no commit yet, or CLAUDE.md is new in this commit
            }
            const before = measure(headText);
            const limits = { growthWarnBytes: GROWTH_WARN_BYTES, byteTrigger: BYTE_TRIGGER };
            const message = formatWarning(before, after, evaluate(before, after, limits), limits);
            if (message) {
                console.error(`\n${message}\n`);
            }
        }
    } catch (err) {
        const reason = String((err && err.message) || err).split('\n')[0];
        console.error(`check-claude-md-size: could not measure CLAUDE.md (not blocking): ${reason}`);
    }
    process.exit(0);
}
```

- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run tests/check-claude-md-size.test.js`. Expected: all pass (4 + 10 + 4 + 2 + 5 = 25). Then `npx eslint scripts/check-claude-md-size.js tests/check-claude-md-size.test.js` → 0 problems.

- [ ] **Step 5: Mutation runs.** Each must turn the named test red; restore and re-run green after each. Log both runs per mutation.
  1. In `evaluate`, change `delta > limits.growthWarnBytes` to `>=` → "does not warn at exactly the growth limit" fails.
  2. Make the CLI's outer `catch` block end with `process.exit(1);` (after its `console.error`) → "says it could not measure outside a git repository, and still exits 0" fails.
  3. Remove `--diff-filter=AMR` from the CLI's `git diff` → "is silent when CLAUDE.md is staged for deletion" fails (the script then tries `git show :CLAUDE.md` on a deleted path).

- [ ] **Step 6: Edit the docs and the hook, then set `BYTE_TRIGGER`.**

`.husky/pre-commit` — the whole file becomes:

```sh
# SKIP=<check>[,<check>…] waives single checks for one commit — see .husky/skip.sh.
# Checks: secrets, docs-index, lint-staged, vitest. --no-verify skips them ALL.
. "$(dirname "$0")/skip.sh"
check_skip_tokens "secrets docs-index lint-staged vitest"

# check_failed (skip.sh) adds the remedy for the two third-party checks; check-secrets.js and
# check-docs-index.js print their own.
skipped secrets || node scripts/check-secrets.js
skipped docs-index || node scripts/check-docs-index.js
# The CLAUDE.md size check only warns, so it has no SKIP token; `|| true` keeps even a crash
# from failing the commit.
node scripts/check-claude-md-size.js || true
skipped lint-staged || npx lint-staged || check_failed lint-staged
skipped vitest || npx vitest run || check_failed vitest
```

`CLAUDE.md` § Build & Development Commands — in the pre-commit sentence, insert after the `check-docs-index.js` clause and its `→`:

```markdown
`node scripts/check-claude-md-size.js` (warns, never blocks, when the staged `CLAUDE.md` grows past its limits) →
```

`CLAUDE.md` § Architecture — in the `scripts/` row, add to its list:

```markdown
check-claude-md-size.js (pre-commit `CLAUDE.md` size warning — measure/evaluate/formatWarning + a never-blocking CLI)
```

`CLAUDE.md` § Maintenance — the body becomes exactly:

```markdown
Manual-only, with no `AUTO-MANAGED` / `MANUAL` section markers: `revise-claude-md` and `claude-md-improver` edit the prose directly. Keep it durable-rules-only. A new rule is one sentence plus at most one "why"; history goes to DONE.md or the spec; extend an existing bullet rather than add a near-duplicate.
Audit quarterly, when the pre-commit size warning reports its byte trigger crossed, or when its tooling materially changes. Lines are not the trigger here: each rule is one line, so the line count barely moves while bytes grow. The warning's figures live in `scripts/check-claude-md-size.js`.
```

`PROJECT.md:64` — becomes:

```bash
# Husky pre-commit: secret scan -> docs-index guard -> CLAUDE.md size warning (never blocks) -> lint-staged -> unit tests
```

Then compute the trigger from the edited working-tree file (Premise Correction 2):

```bash
node -e "const b=require('fs').statSync('CLAUDE.md').size; console.log(b, Math.ceil(b*1.25/1000)*1000)"
```

Set `BYTE_TRIGGER` in the script to the second number and log both in the Progress Log. Re-run `npx vitest run tests/check-claude-md-size.test.js` → all pass.

- [ ] **Step 7: Commit.** Watch the hook's output: if T10 grows `CLAUDE.md` by more than 500 bytes, the new warning prints on this very commit (Premise Correction 3); log what it printed.

```bash
git add scripts/check-claude-md-size.js tests/check-claude-md-size.test.js .husky/pre-commit CLAUDE.md PROJECT.md docs/planning/plans/2026-10-17_g5-claude-md-size-audit.md
git commit -m "feat(hooks): never-blocking CLAUDE.md size warning in bytes; Maintenance authoring rule and byte trigger (G5 T10)"
```

- [ ] **Step 8: Live runs in the real repository.** Precondition: `git status --short` is empty. Each run ends with a restore to HEAD. (The commands avoid backslash escapes: the Bash tool can mangle them.)
  1. Growth: `node -e "require('fs').appendFileSync('CLAUDE.md','x'.repeat(1500)+String.fromCharCode(10))"`, `git add CLAUDE.md`, `node scripts/check-claude-md-size.js; echo "exit=$?"`. Expected: the warning with `more than 500 bytes in one commit` (and no trigger line, unless the trimmed size + 1.5 KB passes `BYTE_TRIGGER`), then `exit=0`.
  2. Shrink: restore (`git restore --source=HEAD --staged --worktree CLAUDE.md`), delete the file's last line (`sed -i '$ d' CLAUDE.md`), `git add CLAUDE.md`, `node scripts/check-claude-md-size.js; echo "exit=$?"`. Expected: no warning, `exit=0`.
  3. Restore: `git restore --source=HEAD --staged --worktree CLAUDE.md`; `git status --short` is empty again.

---

## Task 11: Verification, the size table and the migration recommendation

**Files:**
- Modify: `docs/planning/BACKLOG.md` (🟤 [2026-08-27] migration entry annotation); `CLAUDE.md` only to restore a rule or fix a link the checks flag
- Log: this plan

- [ ] **Step 1: Rule-loss check, with a positive control.**
  1. `git show main:CLAUDE.md > <scratchpad>/claude-old.md`; `cp CLAUDE.md <scratchpad>/claude-new.md`.
  2. In `claude-new.md` only, delete one rule that survived the trim — a clause in the middle of a bullet, not a bullet's first sentence (e.g. "`removeZoomPopover` must **not** remove the toggle button's parent", if it survived). Note privately which one; do not write it into the plan until the agent returns.
  3. Dispatch a fresh `general-purpose` agent on the session's model (verification never runs cheaper), with this prompt:

```text
You are checking that a rewrite of a project instruction file lost no rule.

OLD: <scratchpad>/claude-old.md
NEW: <scratchpad>/claude-new.md

Read only these two files. A "rule" is anything that tells an agent what to do, not to do, or
what is true about the code that it must know before acting, including conditions, exceptions,
scopes and the one reason given for a rule. History (which PR found something, dates, who
reviewed it) and UI detail are not rules.

For every rule in OLD, decide: PRESENT (same meaning in NEW, possibly reworded or moved),
WEAKENED (in NEW, but a condition, exception or scope is gone), or MISSING (nowhere in NEW).
A NEW line that says "Design: [... spec](...)" counts as a pointer only; the rule text itself
must still be in NEW to be PRESENT.

Report:
1. The number of rules you checked.
2. Every MISSING rule: quote the OLD text exactly.
3. Every WEAKENED rule: quote the OLD text and the NEW text exactly, and name what is gone.
Do not report PRESENT rules individually. Quote; do not paraphrase.
```

  4. Expected: the planted rule is in the MISSING list. If it is not, the check cannot fail: say so in the Progress Log, redo it (a smaller scope per agent — e.g. one run per `##` section), and do not trust any result until a run flags the plant.
  5. Triage every other MISSING or WEAKENED item: it must match a disposition-table row (`History`, `Walk-through` with a pointer, `Duplicate` with its home, `Readable from the code` with where), or the rule is restored to `CLAUDE.md`. Re-read every `History` row once for an embedded rule (Review Focus 1). Log the planted rule, the agent's counts and each triage decision.

- [ ] **Step 2: Link check, with a planted broken link.** Run from the repo root:

```bash
node -e "
const fs=require('fs'),path=require('path');
const {extractLinks}=require('./scripts/check-docs-index.js');
const md=fs.readFileSync('CLAUDE.md','utf8')+String.fromCharCode(10)+'[plant](no/such/file.md)';
const links=extractLinks(md);
const broken=links.filter(l=>!fs.existsSync(path.join(process.cwd(),l.target)));
console.log(broken.some(b=>b.target==='no/such/file.md')?'PLANT FLAGGED':'PLANT MISSED: the check is broken');
console.log(links.length-1,'links;',broken.filter(b=>b.target!=='no/such/file.md').map(b=>b.target));
"
```

Expected: `PLANT FLAGGED` and an empty broken list. Fix any broken pointer in `CLAUDE.md`.

- [ ] **Step 3: Citation check.** Run:

```bash
git grep -ohE "CLAUDE\.md(\]\([^)]*\))? ?§ ?[A-Z][A-Za-z&' -]{2,40}" -- . ':!docs/archive' | sed -E 's/.*§ ?//' | sort -u
```

For each label that names a section of **this** `CLAUDE.md` (not the global one's § Task Completion), confirm it still exists: `grep -n "^## <label>\|\*\*<label>" CLAUDE.md`. Expected: every one found. Fix the citation's target only by restoring a renamed label (Global Constraints: no renames).

- [ ] **Step 4: Stale references, re-run.** `node <scratchpad>/stale-refs.js "$(pwd)"`. Expected: `SENTINEL OK`, and no hit that T1 triaged as "deleted code named only as history" or "wrong name".

- [ ] **Step 5: Size table.** Run the T1 Step 1 commands. Record in the Progress Log, and later in the PR: lines, bytes and per-section bytes, before (spec § 2) → after, with the percentage cut.

- [ ] **Step 6: Migration recommendation.** Append to the 🟤 [2026-08-27] "Migrate path-conditional CLAUDE.md content to path-scoped rules" entry in BACKLOG a line `↳ **G5 recommendation (2026-10-17)**: …` holding: a table of block → proposed `.claude/rules/<file>.md` → `paths:` globs → which sessions it would save context in, built from the trimmed file (candidates: the Vitest conventions → `tests/**`; the E2E rules → `tests/e2e/**`; the worker conventions → `*-worker.js`; the security block → `main.js`, `path-grants.js`, `ipc-guard.js`, `preload.js`; the JXL gotchas → `jxl-decode-worker.js`, `media-formats.js`); the measured size of each block; the two caveats — rules attach only on a Read of a matching file, so create-time guidance cannot move, and almost every pattern concerns `media-viewer.js`, read in nearly every code session, so the saving lands mainly in docs and planning sessions; and that Backlog Intake Rules is no longer a candidate (T6, the global rule already loads with planning docs). The entry stays open.

- [ ] **Step 7: Commit.**

```bash
git add docs/planning/BACKLOG.md docs/planning/plans/2026-10-17_g5-claude-md-size-audit.md   # plus CLAUDE.md if a check restored anything
git commit -m "docs: G5 verification - rule-loss check, links, citations, size table; migration recommendation (G5 T11)"
```

---

## Finish (after Task 11)

- [ ] `npx vitest run`, `npm run lint`, `npm run format:check` green; `git status --short` clean.
- [ ] Re-read the whole of `CLAUDE.md` once, top to bottom, as a new session would.
- [ ] Push (`git push -u origin g5-claude-md-size-audit`; pre-push runs the full E2E suite, because `scripts/` changed). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [ ] Open the PR: spec + plan links, D1–D6, the bytes-only amendment, the size table, the pass results, the rule-loss check (counts, the control, triage), the RED→GREEN and mutation log for T10, the Residuals. **Ask the user** before running `/code-review` in this chat (the default is a separate chat). Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

1. **One canonical description of the pre-commit chain.** It is written out in four places (`CLAUDE.md` § Build, `PROJECT.md` § Code Quality, `GOALS.md` Constraints, the `.husky/pre-commit` header), and `GOALS.md` had already drifted (Premise Correction 1). The others could point at `CLAUDE.md` § Build. 🟤 candidate.
2. **Extend the size warning to `.claude/rules/*.md`** once the path-scoped migration creates them: a rule file loads with every matching Read, so its growth costs context too. 🟤 candidate, tagged to the 🟤 [2026-08-27] migration entry.
3. **Add the rule-loss check with a positive control to the sibling audit runbook** (`claude-md-audit.md` step 6 verifies size and references, not that no rule was lost). Cross-project: G6's propagation pass, beside D2's byte trigger. 🟤 candidate if G6 does not carry it.
4. **Measure `CLAUDE.md`'s growth rate under the authoring rule at Cleanup Week #5, and re-set `BYTE_TRIGGER` at that audit** — the 25% headroom (Premise Correction 6) rests on a guessed rate; `git log` byte deltas per commit since the G5 merge give the real one. 🟤 candidate (spec § 6.2 promises it).

## Residuals for Extract (found while designing and planning — not fixed here)

- **`PROJECT.md` and `GOALS.md` restate derived numbers that have gone stale** — `PROJECT.md` "~9,400 lines" (`media-viewer.js` is 11,451, measured 2026-10-17) and "2 of 6 managers extracted" (three are); `GOALS.md:76` "~9,400-line `media-viewer.js`" (T1 sweep). Already owned by 🟤 [2026-09-02] "Sweep the repo's existing restated derived counts"; at closeout, annotate that entry with these three instances instead of filing a new one.
- **`.claude/agents/regression-checker.md` contradicts `CLAUDE.md`** (T1 prompt-audit, Group 2): "~7400 line" renderer; "Extracted today: `FullscreenManager`" (three managers are); `removeFileFromList()` "must clear" three caches (CLAUDE.md § Cache Management lists the full set); "the 7 systems above" under eight headings. An agent briefed by it checks a stale contract. 🟤 candidate.
- **`.claude/skills/new-e2e-test/SKILL.md` is stale against `CLAUDE.md` § Testing (E2E)** (T1 prompt-audit, Group 2): "`tiny.mp4` currently fails to load … see WEEKLY G3" (it is a 32-byte unplayable stub by design); the fixture list omits `playable-64x64.mp4`; `seedLocalStorage` lacks the `{ grant }` option and call order. 🟤 candidate.

## Closeout (after the merge, on `main`)

- [ ] Extract (Improvements + Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] From: G5 closeout`), archive this plan (`git mv` to `docs/archive/plans/`, indexed in `docs/README.md` Archived Plans), DONE.md entry, WEEKLY Summary-Table Status → `✅ PR #N` + the Friday G5 Daily-Schedule row and the G5 item box, check off BACKLOG 🟡 [2026-09-21] and 🟤 [2026-07-03] — **in the closeout commit**.
- [ ] Remove this plan's row from [README.md](README.md) § Current Plans and from `docs/README.md` § Active Plans.
- [ ] Spec: a post-implementation note for anything the work departed from.
- [ ] Propagation check: re-read every live surface this plan touched (`CLAUDE.md`, `PROJECT.md`, `GOALS.md`, `.husky/pre-commit`, BACKLOG 📌) for a late correction that did not reach it.
- [ ] G6 hand-off: D2 (bytes, not ~200 lines) and Improvement 3 for the outbound propagation pass.
- [ ] Memory: session file + MEMORY.md line; durable lessons only.

**Closeout artifacts** (fill at closeout):

| Artifact | Done / N/A + reason |
| --- | --- |
| `BACKLOG.md` — improvements extracted (min 2, routed by source) | |
| `TODO.md` — actionable items, § Spawned Tasks rows | |
| `DONE.md` — entry with plan link, summary, key changes | |
| `WEEKLY.md` — Summary-Table Status **and** the Daily-Schedule entry, each an identifier | |
| `docs/README.md` — plan under Archived Plans, spec under Design Specs | |
| `docs/archive/plans/` — plan moved here, original deleted | |

## Pass Results

**Baseline (T1 Step 1)**: `236 64203 CLAUDE.md` at `2a598c2` — matches spec § 2.2 section by section (Overview 472, Build 1,521, Architecture 5,460, Code Conventions 7,250, Backlog Intake 1,466, Detected Patterns 29,691, Git Insights 15,723, Best Practices 2,164, Maintenance 339).

### P1 — `/claude-api prompt-audit` (T1 Step 2)

**Assumptions** (stated, per the guide's Step 0): scope = the project `CLAUDE.md` (the request named it). Also inventoried, for the Group 2 conflict check only: `.claude/agents/regression-checker.md`, `.claude/skills/new-e2e-test/SKILL.md` (no other `CLAUDE.md`/`AGENTS.md`; `.claude/rules/` is empty). Not read: `.claude/settings*.json`, `.mcp.json` (the guide's secret rule). Target model: Claude Opus 5.5 — the model running the audit, which reads the file. Deliverable 2 (the proposed diff) **is T2–T9**: each finding below names its section task, and that task's commit is its hunk (D3 — one commit per section).

**Summary.** The file's main problem is history and patch accretion, not pressure language. About 30 lines carry G-tags, PR numbers, review IDs, dates or a commit SHA. About 15 lines use migration-relative phrasing ("since G1", "before G3", "now live ONLY", "no longer exist") and describe a diff against a file the reader never saw. Two derived counts are contradicted by the repository. Counts: Group 1 — 4 findings; Group 2 — 5; Group 3 not applicable (no tool descriptions); Group 4 not applicable (no Claude API request code; the one subagent has no redundant twin).

| # | Location | Evidence (quoted / summarised) | Pattern | Why obsolete | Confidence | Action → task |
|---|---|---|---|---|---|---|
| A1 | `CLAUDE.md:39` | "`media-viewer.js` … (~9400 lines…)" | G2 Volatile specifics | `wc -l media-viewer.js` = 11,451; the repo contradicts it | High | remove the count (keep the purpose) → T4 |
| A2 | `CLAUDE.md:85` | "twelve file-group blocks (main, preload, …)" | G2 Volatile specifics | `eslint.config.mjs` has 15 entries, 13 with `files`; contradicted | High | rewrite to "one block per file group" → T5 |
| A3 | L34–36, 51–52, 137, 140, 142–144, 154, 157, 159, 161, 168, 170, 174, 190–191, 204, 213–215, 218, 221, 228, 231, 236 | G-tags, `PR #N`, "review #1", "F1/F5/F6", dates, `` `4ea65c3` ``, "Phase 0" | G2 History narratives | A rule's authority is the behaviour it prescribes, not the incident; incident IDs rot | High | remove the archaeology, keep the rule; keep a release name a rule depends on (Global Constraints) → T4, T5, T7, T8, T9, T10 |
| A4 | L38, 85, 102, 103, 135, 137, 159, 172, 190, 191, 204, 214, 215, 219 | "since G1", "Since G1 (… deleted)", "no longer exist", "before G3, every string logged as `undefined`", "now live ONLY", "now `version: 2`", "used to", "four months later", "Until G3", "that peek was the G2 bug" | G1d Migration-relative phrasing | Relative phrasing implies phantom alternatives; write current rules as the only rules. Exceptions kept: L100 "like one saved before G1" and L184 "folders saved before G1 are re-confirmed once" (a release name the rule depends on) | High | rewrite to current tense → T4, T5, T7, T8 |
| A5 | L76, 137, 168, 185, 209, 214, 228 | "Planned next: ZoomManager…", "tracked in BACKLOG", "(BACKLOG 🟤 [2026-08-31] … not built)", "Tracked as TODO 🔴", "(BACKLOG 🟤)", "(BACKLOG)" | G2 Time-sensitive content | Tracker state rots: it is true until the entry closes, and nothing updates `CLAUDE.md` then | High | remove the pointer, keep any fact an agent acts on (e.g. tournament handlers deliberately outside the guard; I1 itself) → T5, T7, T8, T9 |
| A6 | Detected Patterns: file-op guard (L168), recently opened folders (L143), tournament persistence (L159), UI Components (L161) | Bullets of 2–4 KB; narrow conditionals each traceable to one review finding (G4 final review F1/F5/F6, PR #81 review #1) | G1d Patch accretion | The reader navigates special cases instead of the contract | Medium | rewrite to the contract + `Design:` spec pointer (spec D1) → T7 |
| A7 | CLIP-in-main ×4 (L37 ×2, L170, L203); `.claude/` allow-list ×2 (L60, L212); file-op guard (L105, L168); leave prompt (L143, L213); folder grants (L168, L176–181) | The same fact stated in several sections | G1c Padding (repetition) | The copies agree, so the guide's keep-list item 8 would leave them; G5 removes them for size under spec D1, keeping one full home each (homes ledger) | Medium | dedupe to the home → T4, T5, T7 |
| A8 | L227 (Best Practices) | "Run `npm test` before committing (pre-commit hook enforces this)" | G1d Unenforced/enforced-in-code | The hook already runs the suite (§ Build); the live half of the bullet is the worker-export CJS rule | Medium | rewrite to the worker-export rule → T9 |
| A9 | ~30 in-sentence bold runs (Detected Patterns, Git Insights) | e.g. "**not**", "**never await**", "**No guarded method may call another**" | G1a Pressure language (emphasis) | Caps density is low (7 caps words, all contrastive "NOT"/"ONLY"); bold that marks a gotcha's lead rule is a scoped fix. Not a documented harm here | Low | flag — drop mid-sentence bold only where a sentence is rewritten anyway |

Zero-hit groups (filters recorded): 1b scaffolds `think step by step|take a deep breath|<scratchpad>|<thinking>|think (harder|less)|every N (tool calls|messages)|at most N (words|sentences)` → 0; 1a hedges `try to|if possible|ideally|you (tend to|often|sometimes)` → 1 grep hit (L155), a false positive (no hedge).

**Flags outside scope (Group 2 conflicts in other instruction files; not edited by G5 → Residuals)**:
- `.claude/agents/regression-checker.md` contradicts `CLAUDE.md`: "~7400 line" renderer (11,451); "Extracted today: `FullscreenManager`" (three managers are extracted); `removeFileFromList()` "must clear" three caches (CLAUDE.md § Cache Management lists nine stores plus pair keys and `likeOrSkip.forget`); its report template says "the 7 systems above" under eight headings.
- `.claude/skills/new-e2e-test/SKILL.md`: "`tiny.mp4` currently fails to load in the Playwright runs — see WEEKLY G3" (CLAUDE.md: a 32-byte unplayable stub by design, with `playable-64x64.mp4` as the real clip, which the skill's fixture list omits); `seedLocalStorage` is described without the `{ grant }` option or the call order CLAUDE.md § Testing (E2E) requires.

### P2 — `claude-md-improver`, report only (T1 Step 3)

Files found: 1 (`./CLAUDE.md`). **Score 82/100 (B)**: Commands 20/20 (all seven npm scripts exist; the hook chain and `SKIP=` are documented); Architecture 18/20 (every path in the tree exists; the renderer line count is stale); Non-obvious patterns 15/15; Conciseness 4/15 (64 KB; history, walk-throughs, duplicates); Currency 12/15 (two derived counts wrong — P1 A1, A2); Actionability 13/15. Recommended additions: none beyond T10's own. Its edits declined (D3).

### P3 — Stale-reference probe (T1 Step 4)

`SENTINEL OK`. 3 identifiers + 12 paths flagged; all **runtime-only or external** (no action): `MANUAL` (the retired marker's name, in § Maintenance), `bypassPermissions`/`dontAsk` (Claude Code permission modes); `.bulk_rated.json`, `.feature_cache.json`, `.sort_cache.json`, `.tournament_state.json`, `userData/ml-model-cache.json` (written at run time); `agents/`, `hooks/`, `rules/`, `skills/`, `settings.local.json`, `worktrees/` (relative names in the `.claude/` row; `rules/` is allow-listed and empty, the last two per-machine); `loader.js` (playwright-core's file). No deleted-code or wrong-name hit.

### P4 — Concept-vocabulary sweep (T1 Step 5)

Concept list completed from `git log --since=2026-06-16 -- CLAUDE.md` (61 commits): added the generic IPC calls (G1 security), the old preload/`.env` guard (replaced 2026-10-05), the single session log, `ml-worker.js`'s abort protocol (G4), tournament state v1, the "isLoading-only" guard claim, and the old `next` binding. Surfaces: `CLAUDE.md PROJECT.md README.md docs/README.md docs/PROJECT_CONTEXT.md docs/planning/GOALS.md docs/planning/ROADMAP.md docs/planning/MILESTONES.md`.

| Concept | Pattern | Result |
|---|---|---|
| Section markers | `AUTO-MANAGED\|<!-- MANUAL\|Custom Notes` | 1 — `CLAUDE.md:236` (states the markers are absent; correct; its PR #52 tag goes in T10) |
| Old `.claude/` commit rule | `never commit.{0,40}\.claude\|\.claude/\*\|only \.claude/agents` | 0 hits |
| Deferred compare refresh | `deferred (compare )?refresh\|_beginDeferredCompareRefresh\|re-scoring window\|reverseUpdate\|type: ?'update'` | 2 — `CLAUDE.md:102`, `:103` (both say it is gone: history clauses → T5) |
| Online per-rating updates | `online (per-rating )?update\|previousScores` | 2 — `docs/README.md:103`, `:243` (index rows describing archived work: records, no action) |
| Renderer sorting copies | `sortMediaBySimilarity\|renderer'?s? own cop` | 3 — `CLAUDE.md:42` (worker export list; exports exist; the list goes as readable-from-code → T4), `:137` (PR #54 history → T7); `docs/README.md:52` (archived-plan row: record) |
| Retired memory mechanisms | `Memory Protocol\|knowledge graph\|server-memory\|mcp__memory__` | 0 hits |
| `dead-rules-audit` | `dead-rules-audit` | 1 — `docs/README.md:236` (run-card index row: record) |
| Generic IPC calls (removed G1) | `generic (invoke\|readFile\|writeFile)\|electronAPI\.(invoke\|readFile\|writeFile)\b` | 1 — `CLAUDE.md:38` (a correct negative rule; drop "since G1" → T4) |
| Old preload/`.env` guard | `permissions\.deny\|deny rules?\|preload guard` | 0 hits |
| Single session log | `media-viewer\.log\b\|Session ended` | 1 — `CLAUDE.md:37` (describes the current per-launch log and the footer rule: correct) |
| `ml-worker.js` abort protocol | `ml-worker.{0,60}abort` | 1 — `docs/README.md:104` (archived-plan row: record) |
| Tournament state v1 | `version: ?1\b\|history-full\|persist(s\|ed)? (the )?(undo )?history` | 3 — `CLAUDE.md:143`, `:157` (other formats' `version:1`: correct), `:159` ("now `version: 2`" → drop "now", keep the legacy-resume rule → T7) |
| "isLoading-only" guard | `isLoading-only\|guard(s\|ed)? on isLoading` | 0 hits |
| Old `next` binding | `\bKeyD\b` | 1 — `CLAUDE.md:208` (the v1→v2 history; keep "the migration is at v2" → T8) |

No wrong statement outside `CLAUDE.md` except the planned `GOALS.md` chain (Step 7). One more stale derived number found: `GOALS.md:76` "~9,400-line `media-viewer.js`" (11,451) → Residuals (owned by 🟤 [2026-09-02]).

### P5 — `.mcp.json` (T1 Step 6)

`git ls-files .mcp.json` → empty (untracked); `server-memory` count → `0`. Nothing to do (the Context7 key is not a finding, user ruling 2026-06-16).

## Disposition Tables

_One `### T<N> — <section>` table per section task, written before its commit._

### T2 — Overview

No change: a product summary the whole file depends on.

### T3 — Build & Development Commands

| # | Removed text (first words, quoted) | Label | Where it lives now |
|---|---|---|---|
| 1 | "fail-fast first step" | Readable from the code | `.husky/pre-commit` (the check order) |
| 2 | "(ESLint --fix + Prettier on staged `*.{js,cjs}`, Prettier on staged `*.{json,css,html}`)" → "(ESLint --fix + Prettier on staged files)" | Readable from the code | `package.json` § `lint-staged` |
| 3 | "(unit tests must pass)" | Readable from the code | `.husky/pre-commit` (a failing `npx vitest run` fails the commit) |

Tightened, no row: "whole-tree `docs/README.md` index guard:" folded into the clause, which keeps the rule (both directories must be linked from `docs/README.md`, every link must resolve); "prints RUN/SKIP" → "decides RUN or SKIP"; "any git/parse failure fails safe to RUN" → "any failure falls back to RUN".

### T4 — Architecture

| # | Removed text (first words, quoted) | Label | Where it lives now |
|---|---|---|---|
| 1 | `main.js`: "JXL/CLIP/tournament/bulk-rated/feature-cache IPC" | Readable from the code | `main.js` handler registrations; Data Flow 1 names the same duties |
| 2 | `path-grants.js`, `ipc-guard.js`: "(G1 security)" | History | G1 security spec (linked from § Security) |
| 3 | `path-grants.js`: "canonical containment (realpath, compared exactly), entry vs content-read authorization" | Duplicate | § Detected Patterns → Security (home) |
| 4 | `clip-image.js`: "(G3)" and "(failOn none, ≤2^29 input px, 30 s timeout, ≤1024 px out, 3-ch sRGB) for files the strict read rejects" | History; Duplicate | § Active gotchas "CLIP's decoder is stricter than Chromium" (home: order, `2 ** 29`, 30 s, buffer); output size and colour space readable from `clip-image.js` |
| 5 | `logger.js`: "(init/log/warn/error/logPerf/cleanup/getLogPath, normalizeRendererLogEntry)", "in app.getPath('logs')", "(launches main.js, …)" | Readable from the code | `logger.js` exports; the two log directories stay |
| 6 | `preload.js`: "since G1" and ", CLIP, tournament, bulk-rated, logError" | History; Readable from the code | G1 security spec; `preload.js` |
| 7 | `media-viewer.js`: "~9400 lines" and "imports FullscreenManager + TournamentManager" | Readable from the code (a stale derived count — P1 A1) | `wc -l`; § Code Conventions → Imports names the extracted modules |
| 8 | `sorting-worker.js`: "exports MinHeap, VPTree, calculateHammingDistance, …" | Readable from the code | `sorting-worker.js` exports block |
| 9 | `ml-model.js`: "v3:" | Readable from the code | `ml-model.js` version constant |
| 10 | `like-or-skip.js`: "(G2 like-or-skip)" and the internals list | History; Readable from the code | G2 spec; `like-or-skip.js` |
| 11 | `recent-folders.js`: "(G4 recent folders)" and "parse/record/remove/serialize … (grant status × exists → …)" | History; Readable from the code / Duplicate | G4 spec; `recent-folders.js`; cap 8 + exact-path identity stay in § Detected Patterns → Recently opened folders (home) |
| 12 | `media-formats.js`: "(ESLint block 3b)" | Readable from the code | `eslint.config.mjs` |
| 13 | `scripts/`: the per-script function lists ("scanForSecrets + extractAddedLines + CLI", …) | Readable from the code | each script's exports; replaced by "each exports pure functions + a CLI" |
| 14 | `.claude/`: "(format-edited-file.js, guard-preload-bash.js)", "(reserved — allow-listed, still empty)", "(ask rules, hooks, plugin enables)", "— everything else per-machine" | Duplicate | § Active gotchas "`.claude/` is **allow-listed**" (home); `guard-preload-bash.js` named in § Best Practices |
| 15 | Data Flow 1: "(main-process IPC, not a Worker)"; Data Flow 4: "(npm packages can't resolve in Electron Web Workers)" | Duplicate | § Active gotchas "`@huggingface/transformers` … cannot resolve in Electron Web Workers" (home) |

**Deviation (T10 consequence)**: the `scripts/` row drops its per-script function lists, so T10's new entry follows the trimmed shape — `check-claude-md-size.js (pre-commit \`CLAUDE.md\` size warning, never blocks)` — not the plan's "measure/evaluate/formatWarning + a never-blocking CLI".

### T5 — Code Conventions

| # | Removed text (first words, quoted) | Label | Where it lives now |
|---|---|---|---|
| 1 | Patterns: "Planned next: ZoomManager, CompareManager, SortingManager, the rest of MLManager (sort orchestration)." | History (roadmap state) | `docs/planning/MILESTONES.md` v2.0 modularization |
| 2 | ESLint: "twelve file-group blocks (main, preload, renderer module/script, …)" → "one block per file group" | Readable from the code (a stale derived count — P1 A2) | `eslint.config.mjs` |
| 3 | ESLint: "Since G1 (security):" | History | G1 security spec; DONE.md 2026-10-11 |
| 4 | Unit, worker abort: "G4 deleted a protocol with no sender, and" | History | G4 ML pipeline integrity plan (archived); DONE.md |
| 5 | E2E, `isLoading` wait: "— not, since G1, by any deferred re-scoring window." | History | G1 bulk-rate follow-ups plan (archived) |
| 6 | E2E, `mlWorker`: "Since G1 (`_beginDeferredCompareRefresh` and friends are deleted)," | History | same |
| 7 | E2E, `mlWorker`: "(no more `update`/`reverseUpdate` — those message types no longer exist)" and ", with no deferred re-scoring window" | History (migration-relative — P1 A4) | same; the rule "posts nothing to the worker for the rating itself" stays |
| 8 | E2E, file actions: "A file action started while another holds `_fileOpInFlight` is refused (undo shows a notice)." | Duplicate | § Detected Patterns → Async Patterns "File-op guard" (home) |

## Progress Log

- **2026-10-16/17** — Branch `g5-claude-md-size-audit` from `506e041`. Brainstormed section by section: D1 mixed handling of non-rule text; D2 authoring rule + never-blocking warning; D3 approach A (in place, per section); D4 Backlog Intake Rules → a three-line pointer (the user asked for a recommendation and agreed); D5 migration recommended only; D6 the trim on Opus. While writing the spec, measuring its own claim ("each feature commit added 1–3 KB") showed 14 of 17 commits under 1 KB, and a 200-line trigger would have fired on every growing commit after a trim landing above 200 lines; user ruling: bytes only, 500-byte growth threshold, audit trigger moved to the byte trigger. A side agent raised the same line-trigger issue after the amendment; it was already resolved. Spec `1e934cb`, approved 2026-10-17.
- **2026-10-17 — Planning.** Measured: the chain is described in `CLAUDE.md`, `PROJECT.md`, `GOALS.md` (stale — no docs-index) and the hook header; `GOALS.md`'s non-refresh edit convention (dated comment beside `Last Updated`); the `check-secrets.test.js` temp-repo pattern and its env stripping; `extractLinks` is exported. Premise Corrections 1–5. **Plan code smoke-tested** before hand-off, extracted from this file into the scratchpad (not committed): `measure('→🔵\n')` = 1 line / 8 bytes; `evaluate` 9800→10400 = `['growth','trigger']`; the CLI warns on an unborn-HEAD first commit (+601 bytes, exit 0), is silent with nothing staged and on a staged deletion (exit 0), and outside a repository prints `could not measure CLAUDE.md` (exit 0). The vitest file itself first runs in T10 Step 2.
- **2026-10-17 — Plan review.** Approved. A side-agent note (10% headroom ≈ 4 KB, crossed within days at last week's pace) → user ruling: 25% headroom (Premise Correction 6, spec § 6.2 amended, Improvement 4 to measure the real rate). Execution: Native, after a `/compact`.
- **2026-10-17 — T1 (passes).** Baseline `236 64203` matches spec § 2.2. Prompt-audit: 9 findings (A1–A9; 2 High contradicted counts, history/migration-relative/tracker rows High, patch accretion and duplicates Medium, bold Low/flag) + 2 out-of-scope Group 2 conflicts (regression-checker agent, new-e2e-test skill) → Residuals. Improver: 82/100 (B), edits declined. Stale-ref probe: `SENTINEL OK`, 15 hits, all runtime-only/external. Sweep: 14 concepts, no wrong statement outside `CLAUDE.md` but the planned `GOALS.md` chain; `GOALS.md:76` "~9,400-line" → Residuals. `.mcp.json` untracked, 0 server-memory. `GOALS.md` L74 chain corrected, dated comment at L5.
- **2026-10-17 — T2 Overview: no change** (472 B, 11 lines). **T3 Build & Development Commands**: 1,521 → 1,406 B (−115), 13 → 13 lines; file 64,203 → 64,088 B.
- **2026-10-17 — T4 Architecture**: 5,460 → 4,378 B (−1,082), 42 → 42 lines; file 64,088 → 63,006 B. Homes ledger rows 1–3 applied (CLIP reason, `.claude/` allow-list, `clip-image.js` limits now only in their § Active gotchas homes). Deviation logged under the T4 table: the `scripts/` row lost its function lists, so T10's entry follows that shape.
- **2026-10-17 — T5 Code Conventions**: 7,250 → 6,669 B (−581), 35 → 35 lines; file 63,006 → 62,425 B. Homes ledger row 5 applied (the file-op guard contract lives only in Async Patterns; the E2E bullet keeps the test-side rule).

## Key Discoveries

_Filled during execution._
