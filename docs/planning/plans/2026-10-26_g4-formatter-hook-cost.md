# G4 Formatter Hook Per-Edit Cost - Implementation Plan

**Task Reference**: [WEEKLY.md § G4](../WEEKLY.md#g4-formatter-hook-per-edit-cost-solo---claude-code-hooks--2-sp) · BACKLOG 🔵 [2026-10-17] "Cut the formatter hook's per-edit cost: 1.1 s on each `media-viewer.js` edit, 0.2 s on each ignored `.md` edit"
**Created**: 2026-10-26
**Status**: In Progress
**Last Updated**: 2026-10-26

> A 2-SP task (the 1–2 SP row of WORKFLOW.md § 1.0), so the checkpoints are shortened: no spec, and no
> brainstorm (the user skipped its questions, 2026-10-26). The design decisions are recorded here instead.

---

## 1. Task Overview

**Goal**: Cut the wait after each `Edit`/`Write` by not spawning Prettier where its run buys nothing (a
file Prettier ignores) or costs more than it is worth per edit (`media-viewer.js`, which lint-staged
formats at commit).

**Context**: `.claude/hooks/format-edited-file.js` runs synchronously after every `Edit` and `Write`
("By default, hooks block Claude's execution until they complete", hooks reference). Re-timed here
before any change (§ 4): `media-viewer.js` **1,133 ms** median, an ignored `.md` **213 ms**, and `node`
alone 60 ms. A session that edits the renderer 100 times waits about two minutes on the hook.

**Success Criteria**:
- [x] An edit to a file Prettier ignores spawns no Prettier: the hook costs about a `node` start, plus
      ~15 ms for the matcher (229 → 83 ms, § 4).
- [x] An edit to the root `media-viewer.js` spawns no Prettier (1,384 → 65 ms, § 4).
- [x] Every other in-repo file is formatted as before (positive control PASS; `path-grants.js`
      404 → 398 ms, unchanged).
- [x] The pre-check's verdict equals Prettier's own for every tracked file plus a probe set covering
      each ignore-pattern class (a parity test, so "no behaviour change" is measured, not assumed).
- [x] Re-timed with the entry's probe (10 runs per file, median and max) before and after.

---

## 2. Analysis

### Problem Restatement

Two costs. (1) For an ignored file, Prettier starts (~150 ms) only to skip it. (2) For the renderer,
Prettier's own parse and print of ~573 KB costs ~1.1 s on every edit, mostly to confirm that a
formatted file is still formatted.

### Approaches Considered

| Approach | Pros | Cons |
|----------|------|------|
| (1a) Pre-check `.prettierignore` only (the entry's wording) | One file | Misses what Prettier also skips (`.gitignore`); not an exact mirror, so "no behaviour change" holds only because Prettier re-checks |
| **(1b) Mirror Prettier's own check: `.gitignore` + `.prettierignore`** | Skips exactly what Prettier skips; one rule to state and to test | Two files to read (a few ms) |
| (1c) Ask Prettier (`getFileInfo`) | Exact by construction | Loads Prettier, which is the ~150 ms being cut |
| **(2a) Exempt the root `media-viewer.js` by name** | Removes the 1.1 s outright; a small `planFormat` change; the exemption is visible in code review | The renderer stays unformatted between commits |
| (2b) Exempt by size threshold | Covers future large files | Silently widens the "unformatted until commit" policy as files grow |
| (2c) `Stop` hook + a `PostToolUse` recorder | Renderer formatted at the end of each turn | Stop input carries no edited-file list (hooks reference), so it needs a state file; M effort; still 1.1 s per turn |
| (2d) `"async": true` | No wait | **Lost update** (below) |

### Selected Approach

**(1b) + (2a).**

- **(1b) is my call, a deviation from the entry's wording, and it changes nothing observable.**
  Prettier 3.8.1's CLI default `--ignore-path` is `[".gitignore", ".prettierignore"]`
  (`node_modules/prettier/internal/legacy-cli.mjs`). Its matcher, `createSingleIsIgnoredFunction` in
  `node_modules/prettier/index.mjs`, appends `node_modules` to each file's content. It builds
  `ignore({ allowRelativePaths: true })` from the bundled `ignore@7.0.5` (`THIRD-PARTY-NOTICES.md`).
  It treats a file as ignored when **any** of the per-file matchers says
  `checkIgnore(posixRelPath).ignored`. The hook does the same, with the same library version pinned
  exactly (`7.0.14` is three days old, and nine patch releases landed between July and October 2026).
- **(2a) is the entry's recommendation.** lint-staged formats `media-viewer.js` at commit
  (`package.json`: `*.{js,cjs}` → `eslint --fix`, `prettier --write`).
- **(2d) rejected by mechanism, so no measurement can favour it.** The hooks reference says an async hook
  starts and "Claude Code … immediately continues without waiting for it to finish". Prettier's CLI
  reads the file, formats it, and writes `output` with no re-read (`formatFiles` in `legacy-cli.mjs`).
  So an edit that lands while Prettier formats is overwritten by the format of the older text.
- **(2c) not chosen.** Commit-time formatting already exists, and the recorder is M effort for a
  1.1 s-per-turn result.

### Assumptions

- Same-message `Edit` calls run their `PostToolUse` hook before the next `Edit` starts. **Measured**
  2026-10-26 (§ 4); the reference says only that PostToolUse "fires concurrently when Claude makes
  parallel tool calls".
- lint-staged and the pre-commit hook stay as `CLAUDE.md` describes them (lint-staged before vitest).

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| win32 relative path with backslashes | Converted to `/` before `checkIgnore`, as Prettier's `slash()` does |
| Case (`a.MD`) | `ignore` defaults to `ignorecase: true`; Prettier does not override it, nor does the hook |
| An ignore file is missing | Content is `''` + `node_modules`, as in Prettier |
| `ignore` cannot be loaded | Never-ignored fallback: Prettier decides, which is today's behaviour |
| `tests/media-viewer.js` (same basename, nested) | Not exempt: the exemption is the root-relative path |
| A negated pattern (`!.claude/hooks/` after `.claude/*`) | Mirrored by the library; the parity test covers `.claude/hooks/*.js` |
| `media-viewer.js` named with another case on win32 | Not exempt, so it is formatted (the old cost, never a skip) |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The pre-check skips a file Prettier would format | Med: unformatted until commit (lint-staged formats `js/cjs/json/css/html`) | The parity test over every tracked file plus probes |
| Prettier upgrades its bundled `ignore` or its default ignore paths | Low | Three tests read the installed Prettier and fail on drift: the parity test, the CLI default ignore files, and the bundled `ignore` version (PR #89 review round 1, findings 1–2) |
| Mid-session `npm test` reads an unformatted renderer | Low: `extractMethod` matches `^\s{4}name(…) {`, and edits keep the file's indentation | Commit-time vitest runs after lint-staged |
| A commit that bypasses lint-staged (`SKIP=lint-staged`, `--no-verify`) commits the renderer unformatted | Low: cosmetic; the next commit that stages it carries the reformat diff | **Residual**, stated in the hook's header; `npm run format` repairs it. The premise that lint-staged formats it is now a test (review finding 3) |

---

## 3. Implementation Plan

### Files Affected

| File | Action | Purpose |
|------|--------|---------|
| `.claude/hooks/format-edited-file.js` | Modify | `createIsIgnored(root)`, `planFormat` gains `isIgnored` and the exemption; header comment |
| `tests/format-edited-file.test.js` | Modify | planFormat cases, parity test, a CLI test that proves no spawn |
| `package.json`, `package-lock.json` | Modify | `ignore` `7.0.5` exact, devDependency |
| `CLAUDE.md` | Modify | § Architecture `.claude/` line: what the hook formats |
| `docs/planning/plans/README.md` | Modify | Current Plans row |

`.claude/settings.json` is **not** touched (the matcher stays `Edit|Write`), so the review stays light.

**Live-surface preflight:** `CLAUDE.md:78` ("format-edited-file.js formats each edited file") and the
hook's own header comment both assert what the hook formats; both are in the table. The dated specs
(`2026-10-05-g2-hooks-and-logs-that-fire-design.md`, `2026-10-17-weekly-reviews-run.md`) are history.
`PROJECT.md`, `docs/README.md` and `docs/ARCHITECTURE.md` make no claim about it (grep, 2026-10-26).

### Model and Effort

| | Choice | Why |
|---|---|---|
| SP | 2 → 2 | The parity test adds little; no settings change |
| Execution | this session (Opus) | WEEKLY named Sonnet · `medium`, same session, no switch; a switch now would discard the context built so far |
| Switch | none | — |
| Final review | light (`medium`), in a separate chat | `.claude/settings.json` untouched, so no step up to `high` |

### Implementation Steps

1. [x] Baseline timing with the entry's probe (§ 4).
2. [x] `npm install --save-dev --save-exact ignore@7.0.5`.
3. [x] RED: planFormat cases (ignored, exempt, nested name, posix path to `isIgnored`); parity vs
       `prettier.getFileInfo`; CLI no-spawn test in a temp root without Prettier.
4. [x] GREEN: implement in the hook.
5. [x] Header comment and `CLAUDE.md:78`.
6. [x] Full `npx vitest run`, ESLint and Prettier on the changed files; re-time after with both
       controls; `git status` unchanged.
7. [ ] Hand to the user: commit and PR on approval; code review in a separate chat.

---

## 4. Implementation Log

### 2026-10-26 — PHASE: Planning

- **Baseline** (scratchpad probe `time-hook.js`, node v22.17.1, 10 runs each, median / max):
  `media-viewer.js` (572.7 KB) **1,133 / 1,518 ms**; `path-grants.js` (13.5 KB) 350 / 390 ms;
  `docs/planning/TODO.md` (55.9 KB, ignored) **213 / 223 ms**; out-of-project skip path 60 / 64 ms.
  Positive control (planted `.js` formatted) PASS; negative control (planted ignored `.md` untouched)
  PASS; `git status` unchanged. Matches the entry's 2026-10-17 figures.
- **Race probe on today's synchronous hook**: a scratch `tests/__race_probe.js`, two `Edit`s in one
  message (the first unformatted, the second five lines below it). Result: both edits present and
  the first formatted. Had the second edit run while Prettier formatted the first, it would have been
  lost. So no race on this host; the probe file is deleted.
- `.prettierignore` has 7 entries, not the entry's 6 (`vendor/lucide/` since): reading the file, not
  copying it, is confirmed right.

### 2026-10-26 — PHASE: Implementation

- `ignore` `7.0.5` installed exact as a devDependency. eslint's `ignore@5.3.2` now nests under
  `eslint/` and `@eslint/eslintrc/` (lockfile only).
- RED: 5 of the 10 new tests failed on the old hook. The other 5 passed on it: the passing-check case
  (old and new behaviour agree there), and four more because the old hook never consults an ignore
  check: the throwing-check fallback, the outside-path order, the nested renderer name and the
  unloadable-library fallback. Each of those four was then shown to bite by a mutation (below). An
  eleventh test (the renderer skips without consulting the check) came with Deviation 2.
- GREEN: 25/25 in the file, full suite 48 files / 2,329 passed / 1 skipped.
- **Deviation 1 (my call)**: the matcher mirrors Prettier's `.gitignore` + `.prettierignore`, not
  `.prettierignore` alone (§ 2, Selected Approach).
- **Deviation 2 (from measurement)**: the first build made the matcher eagerly. The after-timing showed
  +10 ms on the out-of-project path, and an in-process timing put the build at ~8 ms plus ~6 ms for the
  first check. The CLI now builds it on first use, and `planFormat` tests the exemption before the
  ignore check, so no-path, out-of-project and renderer edits never build it. If the build throws, it
  lands in `planFormat`'s existing catch (Prettier decides), which removed a second try/catch.
- **Mutations** (scratchpad `mutate-hook.js`, each applied alone, the file restored byte-identical by
  SHA-1): no try/catch around the check; the check asked before the outside test; exempt by basename;
  the fallback ignores everything; no `node_modules` append; `.prettierignore` only; no exemption; no
  posix conversion; the ignore check before the exemption. **9 of 9 killed** (1–5 tests fail each).
- **Re-time, interleaved A/B** (scratchpad `ab-hook.js`: main's hook and this one swapped in place,
  3 rounds × 10 runs per file per version, median / max of 30). A sequential re-run had first shown
  the out-of-project path at 75 ms against 60 ms with the same code on that path: the machine's floor
  had moved, so only an interleaved comparison is fair.

  | File | Before | After |
  |------|--------|-------|
  | `media-viewer.js` (572.7 KB) | 1,384 / 1,599 ms | **65 / 87 ms** |
  | `docs/planning/TODO.md` (ignored) | 229 / 300 ms | **83 / 109 ms** |
  | `path-grants.js` (formatted) | 404 / 456 ms | 398 / 579 ms |
  | out-of-project | 68 / 101 ms | 71 / 97 ms |

  Controls on the final hook (`time-hook.js`): planted unformatted `.js` formatted PASS; planted
  unformatted ignored `.md` untouched PASS; `git status` unchanged.

### 2026-10-26 — PHASE: Review round 1 (PR #89, `/code-review` at `medium`, separate session)

Five findings, each checked against the code before any change, and all five accepted:

1. **The parity test could not see the CLI's default.** It passed the hook's own list to `getFileInfo`,
   which has no default ignore path. New test: `prettier --file-info` (the CLI, so the default applies)
   on `logs/a.js`, which only `.gitignore` matches, and `docs/x.js`, which only `.prettierignore`
   matches. Both must read ignored, and `new-module.js` must not. Controls: each probe reads *not*
   ignored under the other file alone, so a default that dropped either file fails the test. Adding a
   default file is not covered, by design: the hook would then only spawn more.
2. **Nothing tied the pin to Prettier.** New test: the installed `ignore` version equals the single
   `## ignore@v…` line in Prettier's `THIRD-PARTY-NOTICES.md`.
3. **The renderer rests on lint-staged.** New test: lint-staged's own `generateTasks` (imported from
   `node_modules/lint-staged/lib`), with `package.json`'s config, gives every `LEFT_TO_COMMIT` path a
   task that runs `prettier --write`. Control: a `*.cjs`-only config gives none. `LEFT_TO_COMMIT` is
   exported. The bypass case is a residual (§ 2 Risks), stated in the hook's header.
4. **Read errors.** `createIsIgnored` now rethrows anything but `ENOENT`, as Prettier's `readFile`
   does, so `planFormat`'s catch hands the edit to Prettier, which reports the error. New test:
   `.prettierignore` as a directory (EISDIR) throws.
5. **The unloadable-library test depended on the machine.** It now plants a throwing
   `<tmpRoot>/node_modules/ignore`, which the copied hook resolves before any ancestor's or global
   `node_modules`. The stub leaves a sentinel file, which proves it ran.

Also the held-back nit: the `git ls-files` spawn's status is asserted. RED: 2 of the 5 new tests failed
on the round-0 hook (findings 3 and 4); the other three pass by design and carry their own controls.
Mutations: 10 of 10 killed (M10: swallow every read error). Full suite 48 files / 2,333 passed / 1 skipped.

### 2026-10-26 — PHASE: Review round 2 (PR #89, inline review of `c91d12b..3ba954b`)

All five round-1 responses accepted. One finding, low and docs-only: this plan said "E2E | Not run" and
called round 1 "light", contradicting the PR reply. Fixed: § 7 carries both E2E runs, and the round-1
heading names `/code-review` at `medium`. Two of the three held-back items taken, since each was a line
or two: the header no longer overclaims ("fails there" now names the direction it covers: an upgrade
that would make the hook skip a file Prettier formats), and the EISDIR test asserts `error.code`,
not a bare `.toThrow()`. Left as held back: the lint-staged import by path, which fails loudly on a
layout change.

---

## 5. Key Discoveries

**Technical Insights**:
- Prettier 3's CLI ignores what `.gitignore` matches as well as `.prettierignore`, by default; the
  entry named only the second.
- Prettier's `--write` reads, formats and writes with no re-read, so any concurrent writer loses its
  edit; that, not a timing measurement, is what rules out `"async": true`.
- On this host a same-message `Edit`'s `PostToolUse` hook finishes before the next `Edit` starts
  (probe, § 4), although the reference says only that PostToolUse "fires concurrently" for parallel calls.

**Patterns Identified**:
- A pre-check that mirrors a tool's own rule is tested by parity with the installed tool, not by
  re-deriving the rule in the test.
- An untouched file cannot show that a spawn was skipped. Run the hook from a root where the spawn
  fails loudly, with a control path that does spawn.
- Hook timings drift by tens of milliseconds within minutes: compare versions interleaved.

---

## 6. Future Improvements

### Enhancement Ideas

| Idea | Rationale | Effort | Priority |
|------|-----------|--------|----------|
| Skip files Prettier has no parser for (`--ignore-unknown` today spawns Prettier to learn it) | Same ~150 ms as an ignored file, for `.txt`/`.sh`/`.cmd`/`LICENSE` edits | M (needs Prettier's language table without loading Prettier) | L |
| Make `extractMethod`'s lookup indentation-independent | Mid-session tests read an unformatted renderer now | L | L |
| Commit the interleaved A/B timing probe (`scripts/`) | Two re-times so far, each a hand-written probe; the sequential form misled once (§ 4) | L | L |

### Technical Debt

| Item | Why It Exists | Impact | Remediation |
|------|---------------|--------|-------------|
| `ignore` pinned to Prettier's bundled version by hand | Exact mirror of Prettier's matcher | L | The bundled-version test fails on drift; re-pin on a Prettier upgrade |

---

## 7. Testing

### Test Plan

- [x] Unit: `planFormat` (ignored, exempt, nested same name, posix path handed to `isIgnored`, default never-ignored)
- [x] Parity: `createIsIgnored(ROOT)` vs `prettier.getFileInfo` over tracked files plus probes
- [x] CLI: a temp root without Prettier, where an ignored or exempt path gives no spawn error, and a
      `.js` (the control) does
- [x] Acceptance: re-time after (§ 4), both controls

### Test Results

| Test | Result | Notes |
|------|--------|-------|
| `tests/format-edited-file.test.js` | Pass (29) | 7 new `planFormat` cases, 2 parity, 2 CLI no-spawn; review round 1: read error, CLI default, bundled version, lint-staged premise |
| Full `npx vitest run` | Pass | 48 files, 2,333 passed, 1 skipped (review round 1) |
| Mutations | 10 / 10 killed | § 4 |
| ESLint, Prettier (changed files), `check-docs-index.js` | Pass | |
| E2E (pre-push hook) | Pass | 225 passed, 6 skipped on `c91d12b` (9.9 min) and on `3ba954b` (11.7 min) |

---

## 8. Review

- [ ] Self-review complete
- [ ] Code review (light, separate chat)
- [ ] User approved

---

## 9. Closeout Artifacts

| Artifact | Done / N/A + reason |
|----------|---------------------|
| `BACKLOG.md` — improvements extracted (min 2, routed by source) | |
| `TODO.md` — actionable items, plus § Spawned Tasks rows for out-of-tree work | |
| `docs/archive/plans/` — plan moved here, original deleted | |
| `DONE.md` — entry with plan link, summary, key changes | |
| `WEEKLY.md` — Summary-Table Status an identifier, never a bare ✅; Daily-Schedule entry marked done | |
| `BACKLOG.md` / `TODO.md` — every entry this task closed checked off, in the closeout commit | |
| Deploy record | |
| Live docs — every late finding corrected where a live doc asserts it | |
| `docs/README.md` — plan indexed | |
| Memory — durable decisions and patterns captured | |
