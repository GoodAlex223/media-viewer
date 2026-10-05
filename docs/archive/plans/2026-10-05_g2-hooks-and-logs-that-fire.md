# G2. Hooks and Logs That Actually Fire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../../planning/WEEKLY.md) § G2 (🟤 + 1 🔵 folded, 8 SP → ~9 SP); BACKLOG 🟤 `[2026-09-24]` ×3, 🟤 `[2026-09-02]` G3 closeout, 🔵 `[2026-10-05]`
**Spec**: [2026-10-05-g2-hooks-and-logs-that-fire-design.md](../../superpowers/specs/2026-10-05-g2-hooks-and-logs-that-fire-design.md) (committed `e797f43`, user-approved 2026-10-05)
**Created**: 2026-10-05
**Status**: Complete — merged `83c6df0` (PR #73, 3 review rounds + close-out, LGTM)
**Last Updated**: 2026-10-05 (closeout)
**Branch**: `g2-hooks-and-logs-that-fire`

**Goal:** Make every protection G2 names demonstrably fire — a `preload.js`/`.env` guard, a formatter that touches only the edited file, a per-check commit-hook bypass — and keep the app's session logs after a clean quit.

**Architecture:** The guard becomes declarative `permissions.ask` rules in a now-versioned `.claude/settings.json`; the formatter is a small Node CJS hook script (`.claude/hooks/format-edited-file.js`, pure `planFormat` + CLI) run in exec form; the Husky bypass is a sourced POSIX helper (`.husky/skip.sh`); the logger writes one dated file per launch and prunes to the newest 10. Each piece ships with unit tests for its decision logic and a live must-fire / must-not-fire probe for the part only Claude Code, git or Electron can exercise.

**Tech Stack:** Node 22 (CJS for hooks/scripts), POSIX `sh` (Git Bash on Windows, Husky 9 runs hooks with `sh -e`), Prettier 3.8.1, ESLint 9 flat config, Vitest 4 (node environment), Electron 39.

---

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. `docs/` and `*.md` are Prettier-ignored.
- **ESLint**: `eqeqeq`, `curly`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; prefix unused with `_`).
- **Vitest runs in the node environment**; tests live in `tests/**/*.test.js` (not `tests/e2e/**`). CJS modules are loaded with `createRequire(import.meta.url)`.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Never `--no-verify`. Pre-push runs the full E2E suite for any non-docs push.
- **No full-shape secret literal anywhere** — not in code, tests, or this plan (the secret scan reads staged lines). Assemble probe tokens at runtime: `'AKIA' + 'ABCDEFGHIJKLMNOP'`.
- **Shell cwd stays at the repo root** until Task 1's formatter hook is live (memory `project_prettier_hook_formats_cwd`): the old hook formats the whole cwd on every Edit/Write.
- **No branch switch until G2 merges** (spec F8): once `.claude/settings.json`, `.claude/hooks/`, `.claude/skills/` are tracked here, `git checkout main` deletes them from disk.
- **`.claude/` and `.husky/` are protected paths** — in auto mode, writes there are routed to the classifier and may prompt. Expected; not a failure.
- **`.claude/settings.local.json` is never committed.**
- **Grep rule (CLAUDE.md)**: when changing behaviour a comment describes, grep code, tests *and comments* for it (here: `media-viewer.log`, `--no-verify`, `.claude/*`), and re-read every comment attached to changed code.
- **Commit trailer**: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A hook path in a form the unit tests did not model** — Claude Code may send `c:/Users/…` (lowercase drive, forward slashes) while the script's root is `C:\Users\…`. Expected: still formatted. Pinned in Task 1 (`planFormat` win32 cases).
2. **Prettier cannot format the edited file** (a JS syntax error mid-refactor). Expected: the hook exits 0, leaves the file exactly as written, says why on stderr. Pinned in Task 1 (CLI test).
3. **A `SKIP` value left set in a PowerShell session, or mistyped / mis-cased** (`SKIP=SECRETS`, `SKIP=secret`). Expected: nothing is skipped by accident, every skip and every unknown token warns. Pinned in Task 3.
4. **An old session log that cannot be deleted** (held open by a viewer). Expected: the app still starts and logs; pruning retries next launch. Pinned in Task 4.
5. **Two launches in the same second** (double-click, crash-restart). Expected: no session overwrites another. Pinned in Task 4.

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `.gitignore` | Modify | Allow-list: `agents/`, `hooks/`, `rules/`, `settings.json`, `skills/` under `.claude/` |
| `.claude/settings.json` | Track + rewrite | `permissions.ask` guard rules; PostToolUse formatter hook (exec form); plugin enables (unchanged) |
| `.claude/hooks/format-edited-file.js` | Create | `planFormat({filePath, root}, pathImpl)` + CLI: run Prettier on the one edited in-repo file, from the repo root; always exit 0 |
| `tests/format-edited-file.test.js` | Create | `planFormat` decisions (posix + win32) and CLI behaviour on real files |
| `eslint.config.mjs` | Modify | Scripts block also covers `.claude/hooks/**/*.js` |
| `.claude/skills/new-e2e-test/SKILL.md` | Track + fix | Template `afterEach` null guards; current fixture list |
| `.husky/skip.sh` | Create | `skipped <token>`, `check_skip_tokens "<known>"` — sourced by both hooks |
| `.husky/pre-commit`, `.husky/pre-push` | Modify | Each check behind `skipped <token> \|\|`; remedy trailers name the token |
| `tests/husky-skip.test.js` | Create | `skip.sh` behaviour via a spawned `sh` (explicit skip when `sh` is absent) |
| `scripts/check-secrets.js`, `scripts/check-docs-index.js` | Modify | Remedy text names its own `SKIP` token |
| `logger.js` | Rewrite | Dated session files, newest-10 prune, header/footer, local-date timestamps |
| `main.js` | Modify | One build/log-path line after `logger.init` |
| `tests/logger.test.js` | Rewrite | Retention, naming, collision, footer, local date, prune-failure |
| `media-viewer.js`, `tests/media-viewer-utils.test.js` | Modify (comments only) | "`media-viewer.log`" → "the session log" |
| `tests/e2e/helpers/electron-app.js` | Modify (comment only) | Records why launching `main.js` keeps E2E logs apart |
| `CLAUDE.md` | Modify | L27 hook prose, L34 `logger.js`, L56 `.claude/` tree line, L190 `.claude/` gotcha, L204 preload line |
| `PROJECT.md` | Modify | Code-quality block: the `SKIP` line |
| `docs/planning/WEEKLY.md`, `docs/planning/BACKLOG.md` | Modify | Log-location correction (after the Task 4 probe) |

**Live-surface preflight** (plans README step 4) — every live surface asserting a claim G2 changes, diffed against the table above: `.husky/pre-push` echo (`--no-verify`) ✅ in table; `scripts/check-secrets.js` remedy ✅; CLAUDE.md L27/L56/L190/L204/L34 ✅; `logger.js` comments ✅; `media-viewer.js` ~4807/~5040 and `media-viewer-utils.test.js` ~5269 comments ✅; WEEKLY L40 + BACKLOG L72 log-path note ✅. **Not changed, deliberately**: `preload.js:64` (talks about the perf log, still true); DONE.md / archived plans / specs (frozen history); WEEKLY L27 and TODO L5/L31 (they record that *that* session's log was deleted — still true). **Closeout annotations, not edits now**: BACKLOG L256 (E2E-gate friction — `SKIP=e2e` now exists), BACKLOG L513 (unclosed fence — the per-check bypass it was waiting on has landed).

---

## Premise Corrections Made at Planning

1. **The guard is not a hook any more** (user decision D1, spec § 3) — the WEEKLY item's "choose between `exit 2` and `permissionDecision: ask`" is superseded by `permissions.ask` rules, verified on the permissions / permission-modes pages to prompt in every mode.
2. **The WEEKLY/BACKLOG log-location note is very likely reversed** (spec F5) — Task 4 confirms by probe before Task 5 corrects it.
3. **`scripts/check-e2e-needed.js` needs no change** although WEEKLY lists it (spec § 5.3) — it prints no remedy text.
4. **Exec-form hook syntax verified** (hooks reference, 2026-10-05): _"Claude Code resolves `command` as an executable on `PATH` and spawns it directly with `args` as the argument vector … path placeholders … are substituted into `command` and into each `args` element"_; example `{"type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/format.js", "--fix"]}`. `timeout` is in seconds (default 600 for command hooks).

## Task Ordering

Task 1 first (the old Prettier hook taxes every later edit). Task 2 needs Task 1's `.gitignore`. Tasks 3 and 4 are independent of each other; Task 5 needs Task 4's probe result. One commit per task (C1–C5 in the spec).

**Model and effort** (WORKFLOW.md § 1.0): SP 8 → ~9 · execution mode **Native** (user, 2026-10-05) · execute on **Opus 5.5 · `medium`** for all five tasks · switch: effort now (`xhigh` → `medium` via `/effort medium`; the cache survives on Opus 5.5), no model switch — a model switch drops the cache in a one-session run, and the Sonnet-eligible Tasks 2/4/5 are ~4.5 SP of spelled-out work (optional cheap break if wanted: after Task 3's commit, `/compact` then `/model sonnet`, switching back after) · escalate to `high` only if a probe fails from a skipped or rushed step · final review on **Opus 5.5 · `max`** (`/code-review max` on the branch) — the deep review WEEKLY and the spec planned, for the only enforcement around `preload.js` and the secret scan. (The spec's per-task Opus/Sonnet split assumed subagent execution.) The live probes (Task 1 Steps 9–10, Task 3 Step 8, Task 4 Step 7) run in this session — Claude Code's hooks and `ask` prompts are observed here, and Task 1 Step 10 needs the user at the keyboard.

---

## Task 1: Claude Code config under git — guard rules + formatter hook (C1)

**Files:**
- Create: `.claude/hooks/format-edited-file.js`, `tests/format-edited-file.test.js`
- Modify: `.gitignore` (the `.claude/*` block at the end), `.claude/settings.json` (full rewrite), `eslint.config.mjs` (scripts block, ~L242), `CLAUDE.md` (L56, L190, L204)

**Interfaces:**
- Consumes: nothing.
- Produces: `planFormat({ filePath, root }, pathImpl = path) → { action: 'skip', reason: string } | { action: 'format', relPath: string }` (CommonJS export of `.claude/hooks/format-edited-file.js`); the `.gitignore` allow-list that Task 2 relies on to make `.claude/skills/` committable.

- [x] **Step 1: Back up the files that tracking will expose to branch switches (spec F8)**

```bash
cd /c/Users/alexm/Projects/media_viewer
BK="C:/Users/alexm/AppData/Local/Temp/claude/c--Users-alexm-Projects-media-viewer/fceea8c9-28f3-4cdf-83c5-53fe18294cb9/scratchpad/g2-backup"
mkdir -p "$BK" && cp -r .claude/settings.json .claude/settings.local.json .claude/skills "$BK/" && find "$BK" -type f
```
Expected: three files listed (`settings.json`, `settings.local.json`, `skills/new-e2e-test/SKILL.md`).

- [x] **Step 2: Write the failing tests** — create `tests/format-edited-file.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { planFormat } = require('../.claude/hooks/format-edited-file.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'format-edited-file.js');
const UGLY_JS = 'const   a  =  {b:1}\n';
const PRETTY_JS = 'const a = { b: 1 };\n';

describe('planFormat — which edited file gets formatted', () => {
    it('skips a missing, empty or blank path (the old hook formatted the whole cwd here)', () => {
        for (const filePath of [undefined, null, '', '   ']) {
            expect(planFormat({ filePath, root: '/r/repo' }, path.posix)).toEqual({
                action: 'skip',
                reason: 'no file path',
            });
        }
    });

    it('formats a file inside the project, as a root-relative path', () => {
        expect(planFormat({ filePath: '/r/repo/src/a.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'format',
            relPath: 'src/a.js',
        });
    });

    it('skips a sibling directory that merely shares the root as a prefix', () => {
        expect(planFormat({ filePath: '/r/repoX/a.js', root: '/r/repo' }, path.posix).action).toBe('skip');
    });

    it('skips a path that escapes the root through ..', () => {
        expect(planFormat({ filePath: '/r/repo/../b.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'skip',
            reason: 'outside the project',
        });
    });

    it('does not mistake a root file whose name starts with .. for an escape', () => {
        expect(planFormat({ filePath: '/r/repo/..foo.js', root: '/r/repo' }, path.posix)).toEqual({
            action: 'format',
            relPath: '..foo.js',
        });
    });

    it('skips the root directory itself', () => {
        expect(planFormat({ filePath: '/r/repo', root: '/r/repo' }, path.posix).action).toBe('skip');
    });

    it('win32: formats a lowercase-drive, forward-slash path under an uppercase-drive root', () => {
        const root = String.raw`C:\Users\a\repo`;
        expect(planFormat({ filePath: 'c:/Users/a/repo/x.js', root }, path.win32)).toEqual({
            action: 'format',
            relPath: 'x.js',
        });
    });

    it('win32: skips a file on another drive', () => {
        const root = String.raw`C:\Users\a\repo`;
        expect(planFormat({ filePath: String.raw`D:\x.js`, root }, path.win32).action).toBe('skip');
    });

    it('win32: skips a memory file under ~/.claude (outside the project)', () => {
        const root = String.raw`C:\Users\a\Projects\repo`;
        const memory = String.raw`C:\Users\a\.claude\projects\p\memory\note.md`;
        expect(planFormat({ filePath: memory, root }, path.win32)).toEqual({
            action: 'skip',
            reason: 'outside the project',
        });
    });
});

describe('format-edited-file CLI — run as Claude Code runs it', () => {
    const created = [];
    const probe = (relPath, content) => {
        const abs = path.join(ROOT, relPath);
        fs.writeFileSync(abs, content);
        created.push(abs);
        return abs;
    };
    const runHook = (stdin, cwd = ROOT) => spawnSync(process.execPath, [HOOK], { input: stdin, cwd, encoding: 'utf8' });
    const edited = (filePath) => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } });

    afterEach(() => {
        for (const abs of created.splice(0)) {
            fs.rmSync(abs, { force: true });
        }
    });

    it('formats the one edited in-repo file and leaves a mis-formatted sibling untouched — from a subdirectory cwd', () => {
        // The session cwd is docs/planning: a hook that inherited it (instead of running Prettier
        // from the repo root) would either miss the file or lose .prettierignore — both caught here
        // and by the next test.
        const a = probe(`tests/__fmt_probe_a_${process.pid}.js`, UGLY_JS);
        const b = probe(`tests/__fmt_probe_b_${process.pid}.js`, UGLY_JS);
        const result = runHook(edited(a), path.join(ROOT, 'docs', 'planning'));
        expect(result.status).toBe(0);
        expect(fs.readFileSync(a, 'utf8')).toBe(PRETTY_JS);
        expect(fs.readFileSync(b, 'utf8')).toBe(UGLY_JS);
    });

    it('honours .prettierignore even when the session cwd is a subdirectory', () => {
        const md = probe(`docs/__fmt_probe_${process.pid}.md`, '*  x\n*  y\n');
        const result = runHook(edited(md), path.join(ROOT, 'docs', 'planning'));
        expect(result.status).toBe(0);
        expect(fs.readFileSync(md, 'utf8')).toBe('*  x\n*  y\n');
    });

    it('leaves a file outside the repo untouched', () => {
        const outside = path.join(os.tmpdir(), `__fmt_probe_outside_${process.pid}.js`);
        fs.writeFileSync(outside, UGLY_JS);
        created.push(outside);
        expect(runHook(edited(outside)).status).toBe(0);
        expect(fs.readFileSync(outside, 'utf8')).toBe(UGLY_JS);
    });

    it('exits 0 on empty, malformed or path-less input', () => {
        expect(runHook('').status).toBe(0);
        expect(runHook('{not json').status).toBe(0);
        expect(runHook(JSON.stringify({ tool_input: {} })).status).toBe(0);
    });

    it('exits 0 and leaves an unparseable file exactly as written, saying why on stderr', () => {
        const bad = probe(`tests/__fmt_probe_bad_${process.pid}.js`, 'const = ;\n');
        const result = runHook(edited(bad));
        expect(result.status).toBe(0);
        expect(fs.readFileSync(bad, 'utf8')).toBe('const = ;\n');
        expect(result.stderr).toContain('prettier did not format');
    });
});
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/format-edited-file.test.js`
Expected: FAIL — `Cannot find module '../.claude/hooks/format-edited-file.js'`.

- [x] **Step 4: Write the hook script** — create `.claude/hooks/format-edited-file.js`:

```js
// PostToolUse hook (.claude/settings.json): run Prettier on the ONE file an Edit/Write just
// changed — never on the session's working directory.
//
// The hook this replaces ran `npx prettier --write "$CLAUDE_FILE_PATH"`. Claude Code sets no
// such variable (hook input arrives as JSON on stdin), so every edit ran `prettier --write ""`,
// which formats everything under the cwd; from docs/planning that rewrote seven Markdown files
// the repo deliberately leaves unformatted (2026-09-24). This script reads the path from stdin,
// skips paths outside the repo (Prettier would format them with THIS repo's config — memory
// files under ~/.claude are Edit/Write targets in every session), and runs Prettier from the
// repo root, so .prettierignore and .gitignore apply wherever the session's cwd is.
//
// `planFormat` is pure and unit-tested (tests/format-edited-file.test.js). The CLI always exits
// 0: a PostToolUse hook cannot undo the edit, and a syntax error is lint-staged's to report.

const path = require('path');

/**
 * Decide whether the edited file gets formatted.
 * @param {{filePath: unknown, root: string}} input
 * @param {typeof path} [pathImpl] - injectable so win32 behaviour is testable on any OS
 * @returns {{action: 'skip', reason: string} | {action: 'format', relPath: string}}
 */
function planFormat({ filePath, root }, pathImpl = path) {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
        return { action: 'skip', reason: 'no file path' };
    }
    // win32 relative() compares case-insensitively, so `c:/…` vs `C:\…` resolves inside the root.
    const relPath = pathImpl.relative(root, pathImpl.resolve(root, filePath));
    const escapes = relPath === '..' || relPath.startsWith(`..${pathImpl.sep}`);
    if (relPath === '' || escapes || pathImpl.isAbsolute(relPath)) {
        return { action: 'skip', reason: 'outside the project' };
    }
    return { action: 'format', relPath };
}

module.exports = { planFormat };

// --- CLI: read the hook's stdin JSON, format the edited file, always exit 0 ---
if (require.main === module) {
    const fs = require('fs');
    const { spawnSync } = require('child_process');
    const root = path.resolve(__dirname, '..', '..');

    let filePath = '';
    try {
        filePath = JSON.parse(fs.readFileSync(0, 'utf8'))?.tool_input?.file_path ?? '';
    } catch (err) {
        process.stderr.write(`format-edited-file: unreadable hook input (${err.message}) — skipped\n`);
        process.exit(0);
    }

    const plan = planFormat({ filePath, root });
    if (plan.action === 'format') {
        const prettierBin = path.join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
        const result = spawnSync(
            process.execPath,
            [prettierBin, '--write', '--ignore-unknown', '--log-level', 'warn', plan.relPath],
            { cwd: root, encoding: 'utf8' }
        );
        if (result.error || result.status !== 0) {
            const why = (result.error?.message ?? result.stderr ?? '').trim();
            process.stderr.write(`format-edited-file: prettier did not format ${plan.relPath}: ${why}\n`);
        }
    }
    process.exit(0);
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/format-edited-file.test.js`
Expected: PASS (14 tests). Then `git status --short` — no `__fmt_probe_*` file left behind.

- [x] **Step 6: Make ESLint cover `.claude/hooks/` and prove it reaches the file** — in `eslint.config.mjs`, change the scripts block's comment and `files` line:

```js
    // 6. Build / maintenance scripts and Claude Code hook scripts (Node CJS — `node scripts/*.js`,
    //    `node .claude/hooks/*.js`)
    {
        files: ['scripts/**/*.js', '.claude/hooks/**/*.js'],
```

Run:
```bash
npx eslint .claude/hooks/format-edited-file.js tests/format-edited-file.test.js && echo LINT-CLEAN
npx eslint --print-config .claude/hooks/format-edited-file.js | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('sourceType:', c.languageOptions.sourceType)"
npx eslint . --format json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('npm run lint reaches the hook:', r.some((f) => f.filePath.replace(/\\\\/g, '/').endsWith('.claude/hooks/format-edited-file.js')))"
```
Expected: `LINT-CLEAN`; `sourceType: commonjs`; `npm run lint reaches the hook: true`. (`false` on the last line means `eslint .` skips the dot-directory — stop and add it explicitly rather than ship a lint block that never runs.)

- [x] **Step 7: Settle the `.gitignore` allow-list** — replace the last block but one of `.gitignore`:

```gitignore
# Claude Code configuration (per-developer, except shared agents)
.claude/*
!.claude/agents/
```
with:
```gitignore
# Claude Code configuration — committed: shared agents, hook scripts, path-scoped rules, project
# settings (permission rules, hooks, plugin enables) and project skills. Everything else under
# .claude/ is per-machine (settings.local.json, worktrees/, …) and stays out.
.claude/*
!.claude/agents/
!.claude/hooks/
!.claude/rules/
!.claude/settings.json
!.claude/skills/
```

Run: `git status --short --untracked-files=all .claude && git check-ignore -v .claude/settings.local.json`
Expected: `?? .claude/hooks/format-edited-file.js`, `?? .claude/settings.json`, `?? .claude/skills/new-e2e-test/SKILL.md`; and `.gitignore:…:.claude/*	.claude/settings.local.json` (still ignored).

- [x] **Step 8: Rewrite `.claude/settings.json`** (protected path — the write may prompt):

```json
{
    "permissions": {
        "ask": ["Edit(/preload.js)", "Edit(/**/.env)", "Edit(/**/.env.*)", "Bash(*preload.js*)"]
    },
    "hooks": {
        "PostToolUse": [
            {
                "matcher": "Edit|Write",
                "hooks": [
                    {
                        "type": "command",
                        "command": "node",
                        "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/format-edited-file.js"],
                        "timeout": 30
                    }
                ]
            }
        ]
    },
    "enabledPlugins": {
        "superpowers@claude-plugins-official": true,
        "pr-review-toolkit@claude-plugins-official": false
    }
}
```
Then check it carries no machine-specific path: `grep -n -i -E "c:|users|alexm|appdata" .claude/settings.json` → no output.

- [x] **Step 9: Probe the formatter — it must fire on the edited file, and only on it.** The two-file setup **discriminates** the new hook from the old one (the old one would format both). Create both via Bash (Bash does not trigger the hook):

```bash
printf 'const   a  =  {b:1}\n' > scripts/__probe_a.js && printf 'const   a  =  {b:1}\n' > scripts/__probe_b.js
SP="C:/Users/alexm/AppData/Local/Temp/claude/c--Users-alexm-Projects-media-viewer/fceea8c9-28f3-4cdf-83c5-53fe18294cb9/scratchpad"
printf 'const   a  =  {b:1}\n' > "$SP/__probe_c.js" && sha256sum "$SP/__probe_c.js"
```
Then, with the **Read tool** followed by the **Edit tool** (Edit refuses a file not Read in the session): in `scripts/__probe_a.js` replace `{b:1}` with `{b:2}`; in `$SP/__probe_c.js` replace `{b:1}` with `{b:2}`. Then:
```bash
cat scripts/__probe_a.js scripts/__probe_b.js "$SP/__probe_c.js"; sha256sum "$SP/__probe_c.js"
```
Expected: `__probe_a.js` → `const a = { b: 2 };` (**must fire**); `__probe_b.js` → still `const   a  =  {b:1}` (**must not fire**); `__probe_c.js` → `const   a  =  {b:2}` unformatted (**must not fire** — outside the repo). If `__probe_a.js` is unformatted, the hook did not reload: ask the user to run `/hooks` and confirm the PostToolUse entry, then repeat.
**Only after that passes**, the subdirectory probe: `cd docs/planning` in a Bash call, then use the Edit tool to make a one-character change to `docs/planning/TODO.md`'s `**Last Updated**` line (and revert it the same way), then `cd /c/Users/alexm/Projects/media_viewer && git status --short docs/` → empty (**must not fire** — no planning doc reformatted). Clean up: `rm scripts/__probe_a.js scripts/__probe_b.js "$SP/__probe_c.js"`.

- [x] **Step 10: Probe the guard — USER AT THE KEYBOARD (~2 min).** Tell the user each prompt is expected and which answer to give:
  1. **Write tool** → create `.env` at the repo root with content `PROBE=1` → **must prompt**; user answers **No**. Then `ls -a | grep -c '^\.env$'` → `0`.
  2. **Read** `preload.js` (reads are not guarded), then `cd docs/planning` in a Bash call; then **Edit tool** on `preload.js` replacing its last line with that same line plus a trailing blank line → **must prompt** even from a subdirectory cwd (the `/` anchor); user answers **No**. Then `cd /c/Users/alexm/Projects/media_viewer && git status --short preload.js` → empty.
  3. Bash: `grep -c contextBridge preload.js` → **must prompt** (the Bash rule); user answers **Yes** (a read).
  4. **Write tool** → create `scripts/__probe_ok.txt` with `ok` → **must NOT prompt**. Then `rm scripts/__probe_ok.txt`.

  Record each outcome in the Progress Log. Any probe that behaves otherwise blocks the commit — re-read the rule syntax against the permissions page before retrying.

- [x] **Step 11: Update `CLAUDE.md`** — three edits:
  - L56, replace `├── .claude/agents/      # Shared agent definitions tracked in git (other .claude/* gitignored)` with
    `├── .claude/             # Committed: agents/, hooks/ (format-edited-file.js), rules/, settings.json (ask rules, hooks, plugin enables), skills/ — everything else per-machine`
  - L190, replace the whole bullet starting `` - `.claude/*` is gitignored except `` with:
    ``- `.claude/` is **allow-listed** in `.gitignore`: `agents/`, `hooks/`, `rules/`, `settings.json` and `skills/` are committed and reviewed like code; `settings.local.json`, `worktrees/` and anything else Claude Code writes stay per-machine — add a new shared kind to the allow-list rather than committing past the ignore. Checking out a commit from before they were tracked (pre-G2, e.g. while bisecting) deletes them from the working tree until you return. Writes under `.claude/` and `.husky/` are protected-path writes (auto mode routes them to the classifier).``
  - L204, replace `- Changes to preload.js require security review` with:
    ``- Changes to preload.js require security review — **enforced**: `permissions.ask` rules in `.claude/settings.json` prompt before any edit tool touches `preload.js` or a `.env` file, and before any Bash command that names `preload.js`, in every permission mode (auto included). **Not covered**: Bash writes to a `.env` file, and Bash commands that change `preload.js` without naming it (`git checkout -- .`, `git stash pop`, a `*.js` glob).``

- [x] **Step 12: Run the whole unit suite and lint**

Run: `npx vitest run && npm run lint`
Expected: all test files pass (previous total 837 + 14 new); lint reports 0 errors.

- [x] **Step 13: Commit C1** (stage explicitly — the skill is Task 2's):

```bash
git add .gitignore .claude/settings.json .claude/hooks/format-edited-file.js tests/format-edited-file.test.js eslint.config.mjs CLAUDE.md
git status --short   # expect: .claude/skills/… still untracked, nothing else unstaged
git commit -F - <<'EOF'
feat(g2): version .claude/settings.json — ask rules replace the dead preload/.env hook, formatter formats only the edited file

- .gitignore allow-lists .claude/{agents,hooks,rules,skills}/ and settings.json;
  settings.local.json stays per-machine
- permissions.ask: Edit(/preload.js), Edit(/**/.env), Edit(/**/.env.*), Bash(*preload.js*)
  — prompts in every mode, auto included (the old PreToolUse hook read an unset
  variable and exited 1, so it never fired and could not block)
- PostToolUse: .claude/hooks/format-edited-file.js reads tool_input.file_path from
  stdin, skips paths outside the repo, runs Prettier from the repo root (the old
  hook ran `prettier --write ""` and formatted the whole cwd)
- ESLint scripts block covers .claude/hooks/; CLAUDE.md names what is committed,
  the enforcement, and its Bash gaps

Probes (plan Task 1 Steps 9–10): formatter fired on the edited file only; guard
prompted for .env, preload.js (from a subdirectory cwd) and a Bash read; an
ordinary write did not prompt.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 2: Commit the `new-e2e-test` skill, fixed where it misleads (C2)

**Files:**
- Modify + track: `.claude/skills/new-e2e-test/SKILL.md` (L39-42 template `afterEach`, L57-60 lifecycle bullets, L63 fixtures)

**Interfaces:**
- Consumes: Task 1's `.gitignore` allow-list (`!.claude/skills/`).
- Produces: nothing code-facing.

Checked at planning against CLAUDE.md § Testing (E2E) and `tests/e2e/helpers/electron-app.js`: the helper names, `createTempFixtureDir`'s `{ dir, likeDir, dislikeDir, specialDir, cleanup, addFile }` return, `#helpOverlay`, and the file-naming list are current. Two things mislead.

- [x] **Step 1: Guard the template's `afterEach`** (CLAUDE.md: _"`afterEach` null guards: guard `if (electronApp)`/`if (tmpFixtures)`/`if (page)` before cleanup — `.catch()` only handles rejections, not a sync TypeError on undefined"_). Replace L39-42:

```js
    test.afterEach(async () => {
        await closeApp(electronApp);
        await tmpFixtures.cleanup();
    });
```
with:
```js
    test.afterEach(async () => {
        // Null guards: a beforeEach that threw leaves these undefined, and a TypeError here
        // would mask the real failure (CLAUDE.md § Testing (E2E)).
        if (electronApp) await closeApp(electronApp);
        if (tmpFixtures) await tmpFixtures.cleanup();
    });
```
and replace the two lifecycle bullets at L58-60 (`` - `closeApp(electronApp)` in afterEach … `` through `` … guard cleanup: `if (tmpFixtures) await tmpFixtures.cleanup()`. ``) with:
```markdown
- `closeApp(electronApp)` in afterEach — handles Windows process tree cleanup.
- `tmpFixtures.cleanup()` in afterEach — removes temp dirs.
- **Guard every cleanup** (`if (electronApp)`, `if (tmpFixtures)`, `if (page)`): when `beforeEach` throws, these are undefined, and an unguarded call throws a TypeError that hides the original failure.
```

- [x] **Step 2: Bring the fixture list up to date.** Replace L63:
```markdown
- Available: `red-1x1.png`, `green-1x1.png`, `blue-1x1.png`, `tiny.mp4` in `tests/e2e/fixtures/`.
```
with:
```markdown
- Available in `tests/e2e/fixtures/`: `red-1x1.png`, `green-1x1.png`, `blue-1x1.png`, `normal-320x240.png`, `wide-short-64x4.png`, `static.jxl`, `tiny.mp4` (`generate.js` rebuilds the images). Note: `tiny.mp4` currently fails to load in the Playwright runs — see WEEKLY G3 before relying on video playback.
```

- [x] **Step 3: Verify nothing else in the skill contradicts CLAUDE.md**

Run: `grep -n -E "afterEach|cleanup|fixtures|seedLocalStorage" .claude/skills/new-e2e-test/SKILL.md`
Expected: every `cleanup`/`closeApp` call in the template is guarded; `seedLocalStorage` is described as called after `launchApp()` and before `loadFolder()` (L34-35 — already true).

- [x] **Step 4: Commit C2**

```bash
git add .claude/skills/new-e2e-test/SKILL.md
git commit -F - <<'EOF'
docs(g2): commit the new-e2e-test project skill (guarded afterEach, current fixtures)

Tracked for the first time now that .claude/skills/ is allow-listed. Two fixes
where it would mislead: the template's afterEach cleanup is null-guarded per
CLAUDE.md § Testing (E2E), and the fixture list names all seven fixtures.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 3: `SKIP=<check>` — per-check bypass for the Husky hooks (C3)

**Files:**
- Create: `.husky/skip.sh`, `tests/husky-skip.test.js`
- Modify: `.husky/pre-commit` (all 4 lines), `.husky/pre-push` (all 5 lines), `scripts/check-secrets.js:113-117`, `scripts/check-docs-index.js:279-283`, `CLAUDE.md` L27 (last sentence), `PROJECT.md` L64-65

**Interfaces:**
- Consumes: nothing.
- Produces: shell functions `skipped <token>` (exit 0 = skip, warns on stderr) and `check_skip_tokens "<space-separated known tokens>"` (warns per unknown token), defined by sourcing `.husky/skip.sh`; reads `SKIP` and optional `HOOK_NAME` from the environment. Tokens: `secrets`, `docs-index`, `lint-staged`, `vitest` (pre-commit); `e2e` (pre-push).

- [x] **Step 1: Write the failing tests** — create `tests/husky-skip.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shAvailable = spawnSync('sh', ['-c', 'exit 0']).status === 0;

// Source .husky/skip.sh in a fresh sh and run `script` against a given SKIP value.
function runSkip(script, skipValue) {
    const env = { ...process.env, HOOK_NAME: 'test-hook' };
    delete env.SKIP;
    if (skipValue !== undefined) {
        env.SKIP = skipValue;
    }
    return spawnSync('sh', ['-c', `. ./.husky/skip.sh; ${script}`], { cwd: ROOT, env, encoding: 'utf8' });
}
const verdict = (token, skipValue) =>
    runSkip(`if skipped ${token}; then echo SKIPPED; else echo RAN; fi`, skipValue).stdout.trim();

describe.skipIf(!shAvailable)('.husky/skip.sh (needs sh on PATH — Git Bash on Windows)', () => {
    it('runs every check when SKIP is unset or empty', () => {
        expect(verdict('secrets')).toBe('RAN');
        expect(verdict('secrets', '')).toBe('RAN');
    });

    it('skips an exactly named check and warns on stderr every time', () => {
        const result = runSkip('skipped secrets && echo SKIPPED', 'secrets');
        expect(result.stdout.trim()).toBe('SKIPPED');
        expect(result.stderr).toContain('test-hook: SKIP=secrets — the secrets check did NOT run');
    });

    it('accepts a comma-separated list with spaces', () => {
        expect(verdict('secrets', 'docs-index, secrets')).toBe('SKIPPED');
        expect(verdict('docs-index', 'docs-index, secrets')).toBe('SKIPPED');
        expect(verdict('vitest', 'docs-index, secrets')).toBe('RAN');
    });

    it('matches whole tokens only — never a prefix, a longer token, or another case', () => {
        expect(verdict('docs-index', 'docs')).toBe('RAN');
        expect(verdict('secrets', 'secrets-x')).toBe('RAN');
        expect(verdict('secrets', 'SECRETS')).toBe('RAN');
    });

    it('check_skip_tokens warns about each unknown token and names the known ones', () => {
        const result = runSkip('check_skip_tokens "secrets vitest"', 'secret,vitest,SECRETS');
        expect(result.stderr).toContain("unknown SKIP token 'secret' — this hook's checks are: secrets vitest");
        expect(result.stderr).toContain("unknown SKIP token 'SECRETS'");
        expect(result.stderr).not.toContain("'vitest'");
    });

    it('check_skip_tokens is silent when every token is known, and does not glob-expand', () => {
        expect(runSkip('check_skip_tokens "secrets vitest"', 'vitest').stderr).toBe('');
        const globbed = runSkip('check_skip_tokens "secrets"', '*');
        expect(globbed.stderr).toContain("unknown SKIP token '*'");
        expect(globbed.stderr).not.toContain('package.json');
    });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/husky-skip.test.js`
Expected: FAIL — `sh` cannot source `./.husky/skip.sh` (No such file), so stdout is empty and every `toBe('RAN')`/`toBe('SKIPPED')` fails. (If the suite reports **skipped**, `sh` is not on `PATH` — stop: the tests would prove nothing on this machine.)

- [x] **Step 3: Write `.husky/skip.sh`**

```sh
# Sourced by .husky/pre-commit and .husky/pre-push — Husky runs only files named after git hooks.
#
# SKIP=<check>[,<check>…] waives the named checks for one command:
#     SKIP=docs-index git commit …
#     PowerShell:  $env:SKIP='docs-index'; git commit …; $env:SKIP=$null
# Prefer it to --no-verify, which skips EVERY check, the secret scan included. Every skip
# warns, every time: a $env:SKIP left set in a terminal would otherwise waive that check
# silently on every later commit.

HOOK_NAME=${HOOK_NAME:-$(basename "$0")}
SKIP_LIST=",$(printf '%s' "${SKIP-}" | tr -d ' '),"

# skipped <token> — exit 0 (and warn) when <token> is listed in SKIP. Whole tokens only:
# SKIP=docs never waives docs-index.
skipped() {
    case "$SKIP_LIST" in
        *",$1,"*)
            echo "⚠️  $HOOK_NAME: SKIP=$1 — the $1 check did NOT run" >&2
            return 0
            ;;
    esac
    return 1
}

# check_skip_tokens "<known tokens>" — warn about each SKIP token this hook does not know
# (a typo, or a pre-commit token during a push). Nothing is skipped by mistake: an unknown
# token matches no check, so the check runs. Subshell + set -f: a token like * must not
# glob-expand into file names.
check_skip_tokens() (
    set -f
    for t in $(printf '%s' "${SKIP-}" | tr ',' ' '); do
        case " $1 " in
            *" $t "*) ;;
            *) echo "⚠️  $HOOK_NAME: unknown SKIP token '$t' — this hook's checks are: $1" >&2 ;;
        esac
    done
)
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/husky-skip.test.js`
Expected: PASS (6 tests, none skipped).

- [x] **Step 5: Rewrite the hooks.** `.husky/pre-commit`:

```sh
# SKIP=<check>[,<check>…] waives single checks for one commit — see .husky/skip.sh.
# Checks: secrets, docs-index, lint-staged, vitest. --no-verify skips them ALL.
. "$(dirname "$0")/skip.sh"
check_skip_tokens "secrets docs-index lint-staged vitest"

# Remedy trailer for the two third-party checks; check-secrets.js and check-docs-index.js
# print their own.
fail() {
    echo "pre-commit: $1 failed — fix it, or waive this check only: SKIP=$1 git commit …" >&2
    exit 1
}

skipped secrets || node scripts/check-secrets.js
skipped docs-index || node scripts/check-docs-index.js
skipped lint-staged || npx lint-staged || fail lint-staged
skipped vitest || npx vitest run || fail vitest
```

`.husky/pre-push`:
```sh
# SKIP=e2e waives the E2E suite for one push — see .husky/skip.sh.
. "$(dirname "$0")/skip.sh"
check_skip_tokens "e2e"

decision=$(node scripts/check-e2e-needed.js || echo RUN)
if [ "$decision" = "RUN" ] && ! skipped e2e; then
    echo "pre-push: running the E2E suite before push (skip it for one push with: SKIP=e2e git push)…"
    npx playwright test
fi
```

- [x] **Step 6: Point each remedy at its own token.** `scripts/check-secrets.js` L113-117, replace:
```js
        console.error(
            '\nRemove the secret(s) and re-stage. If this is a genuine false positive,' +
                ' bypass with: git commit --no-verify\n'
        );
```
with:
```js
        console.error(
            '\nRemove the secret(s) and re-stage. If this is a genuine false positive, skip this check only:\n' +
                "  SKIP=secrets git commit …    (PowerShell: $env:SKIP='secrets'; git commit …; $env:SKIP=$null)\n"
        );
```
`scripts/check-docs-index.js` L279-283, replace:
```js
    console.error(
        'Add a row + link for each missing file, and repoint or remove each dead link.\n' +
            'Then stage docs/README.md — this reads the index, so an unstaged fix will not clear it.\n' +
            'Re-check without committing: node scripts/check-docs-index.js\n'
    );
```
with:
```js
    console.error(
        'Add a row + link for each missing file, and repoint or remove each dead link.\n' +
            'Then stage docs/README.md — this reads the index, so an unstaged fix will not clear it.\n' +
            'Re-check without committing: node scripts/check-docs-index.js\n' +
            'False positive? Skip this check only: SKIP=docs-index git commit …\n'
    );
```

- [x] **Step 7: Docs.** `CLAUDE.md` L27 — replace the final sentence `Bypass a WIP push with \`git push --no-verify\`.` with:
``**Per-check bypass**: `SKIP=<check>[,<check>…]` waives the named checks for one command and warns on every skip — pre-commit tokens `secrets`, `docs-index`, `lint-staged`, `vitest`; pre-push `e2e` (shared helper `.husky/skip.sh`; PowerShell: `$env:SKIP='docs-index'; git commit …; $env:SKIP=$null`). `--no-verify` is the last resort: it disables every check, the secret scan included.``
`PROJECT.md` L64-65 — after `# Husky pre-push: conditional E2E (skipped for docs-only pushes)` add:
```
# Per-check bypass: SKIP=<check> git commit|push — secrets, docs-index, lint-staged, vitest | e2e (see CLAUDE.md)
```

- [x] **Step 8: Probe the hook — the bypass must waive only what it names.** Stage this task's files first (lint-staged hides *unstaged* changes in partially-staged files; with everything staged it hides nothing, so `sh` keeps reading an unchanged `.husky/pre-commit`). Then stage a fake secret and run the hook directly — `git commit` never runs:

```bash
git add .husky/skip.sh .husky/pre-commit .husky/pre-push tests/husky-skip.test.js scripts/check-secrets.js scripts/check-docs-index.js CLAUDE.md PROJECT.md
node -e "require('fs').writeFileSync('probe-secret.txt', 'key=' + 'AKIA' + 'ABCDEFGHIJKLMNOP' + '\n')" && git add probe-secret.txt
echo "--- A: no SKIP";            sh -e .husky/pre-commit; echo "exit=$?"
echo "--- B: SKIP=docs-index";   SKIP=docs-index sh -e .husky/pre-commit; echo "exit=$?"
echo "--- C: SKIP=secrets";      SKIP=secrets sh -e .husky/pre-commit; echo "exit=$?"
git rm --cached -q probe-secret.txt && rm probe-secret.txt && git status --short
```
Expected: **A** — `⛔ Potential secret(s)` naming `probe-secret.txt`, the new `SKIP=secrets` remedy line, `exit=1` (**must fire**). **B** — the `SKIP=docs-index` warning, then the same secret block, `exit=1` (**waiving one check must not disarm another**). **C** — `⚠️  pre-commit: SKIP=secrets — the secrets check did NOT run`, then docs-index, lint-staged and vitest run, `exit=0` (**must not fire**). Final status: only this task's files staged, no `probe-secret.txt`.
Then the pre-push typo warning: `SKIP=e2ee sh -c '. ./.husky/skip.sh; HOOK_NAME=pre-push; check_skip_tokens "e2e"'` → `unknown SKIP token 'e2ee'`.

- [x] **Step 9: Run the whole unit suite**

Run: `npx vitest run`
Expected: all pass (Task 1 total + 6).

- [x] **Step 10: Commit C3** (the hook runs for real — with the new pre-commit file):

```bash
git commit -F - <<'EOF'
feat(g2): SKIP=<check> per-check bypass for the Husky hooks

One false positive no longer forces --no-verify past the secret scan.
.husky/skip.sh (sourced by both hooks) provides skipped/check_skip_tokens:
whole-token matching, a stderr warning on every skip, a warning naming the
valid tokens for every unknown one (nothing is skipped by mistake).
Tokens: secrets, docs-index, lint-staged, vitest (pre-commit); e2e (pre-push).
check-secrets.js and check-docs-index.js name their own token; the two
third-party checks get a fail trailer. check-e2e-needed.js is unchanged by
design — it prints no remedy text.

Probe (plan Task 3 Step 8): a staged fake secret blocked with no SKIP and
with SKIP=docs-index; SKIP=secrets waived only the secret scan.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 4: Keep session logs — dated files, newest 10 (C4)

**Files:**
- Rewrite: `logger.js` (all 114 lines), `tests/logger.test.js` (all 169 lines)
- Modify: `main.js` (after the console interception, ~L159), `media-viewer.js` (~L4807, ~L5040 comments), `tests/media-viewer-utils.test.js` (~L5269 comment), `tests/e2e/helpers/electron-app.js` (`getLaunchArgs` comment, ~L30), `CLAUDE.md` L34

**Interfaces:**
- Consumes: nothing.
- Produces: unchanged exports `{ init, log, warn, error, logPerf, cleanup, getLogPath }`; `getLogPath()` now returns `<logDir>/media-viewer-YYYY-MM-DD_HH-MM-SS[-N].log`; log files carry a first line `[…] [INFO] [logger] Session started (pid N)` and, after `cleanup()`, a last line `[…] [INFO] [logger] Session ended (clean quit)`.

- [x] **Step 1: Write the failing tests** — replace `tests/logger.test.js` entirely:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);

const SESSION_LOG = /^media-viewer-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?\.log$/;
const pad = (n) => String(n).padStart(2, '0');

describe('logger', () => {
    let logger;
    let testLogDir;

    const sessionLogs = () =>
        fs
            .readdirSync(testLogDir)
            .filter((name) => SESSION_LOG.test(name))
            .sort();
    const readLines = (file = logger.getLogPath()) => fs.readFileSync(file, 'utf8').trim().split('\n');
    const at = (second) => vi.setSystemTime(new Date(2026, 9, 5, 10, 0, second)); // local 2026-10-05 10:00:ss

    beforeEach(() => {
        testLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
        // Fresh require for each test to reset module state
        delete require.cache[require.resolve('../logger')];
        logger = require('../logger');
    });

    afterEach(() => {
        try {
            logger.cleanup();
        } catch (_e) {
            // ignore if already cleaned up
        }
        vi.useRealTimers();
        vi.restoreAllMocks();
        fs.rmSync(testLogDir, { recursive: true, force: true });
    });

    describe('init()', () => {
        it('creates a dated session log in the specified directory', () => {
            logger.init(testLogDir);
            const logPath = logger.getLogPath();
            expect(path.dirname(logPath)).toBe(testLogDir);
            expect(path.basename(logPath)).toMatch(SESSION_LOG);
            expect(fs.existsSync(logPath)).toBe(true);
        });

        it('names the file by the local start time', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date(2026, 9, 6, 1, 30, 5)); // local 2026-10-06 01:30:05
            logger.init(testLogDir);
            expect(path.basename(logger.getLogPath())).toBe('media-viewer-2026-10-06_01-30-05.log');
        });

        it('opens the session with a header line naming the pid', () => {
            logger.init(testLogDir);
            expect(readLines()[0]).toMatch(
                new RegExp(`\\[INFO\\] \\[logger\\] Session started \\(pid ${process.pid}\\)$`)
            );
        });

        it('creates directory if it does not exist', () => {
            const nestedDir = path.join(testLogDir, 'nested', 'logs');
            logger.init(nestedDir);
            expect(fs.existsSync(nestedDir)).toBe(true);
            expect(path.dirname(logger.getLogPath())).toBe(nestedDir);
        });

        it('closes existing fd before opening a new one on second init', () => {
            const closeSyncSpy = vi.spyOn(fs, 'closeSync');
            logger.init(testLogDir);
            const callsAfterFirst = closeSyncSpy.mock.calls.length;
            logger.init(testLogDir);
            const callsAfterSecond = closeSyncSpy.mock.calls.length;
            expect(callsAfterSecond).toBe(callsAfterFirst + 1);
        });

        it('gives a second session started in the same second its own file', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            at(0);
            logger.init(testLogDir);
            const first = logger.getLogPath();
            logger.cleanup();
            logger.init(testLogDir);
            expect(path.basename(logger.getLogPath())).toBe('media-viewer-2026-10-05_10-00-00-2.log');
            expect(readLines(first).at(-1)).toMatch(/Session ended \(clean quit\)$/);
        });
    });

    describe('retention', () => {
        it('keeps only the newest 10 session logs', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            for (let s = 0; s < 11; s++) {
                at(s);
                logger.init(testLogDir);
                logger.cleanup();
            }
            const kept = sessionLogs();
            expect(kept).toHaveLength(10);
            expect(kept).not.toContain('media-viewer-2026-10-05_10-00-00.log');
            expect(kept).toContain('media-viewer-2026-10-05_10-00-10.log');
        });

        it('never prunes the perf log or a legacy media-viewer.log', () => {
            const legacy = path.join(testLogDir, 'media-viewer.log');
            const perf = path.join(testLogDir, 'media-viewer-perf.log');
            fs.writeFileSync(legacy, 'legacy crash log\n');
            fs.writeFileSync(perf, 'perf\n');
            vi.useFakeTimers({ toFake: ['Date'] });
            for (let s = 0; s < 12; s++) {
                at(s);
                logger.init(testLogDir);
                logger.cleanup();
            }
            expect(fs.readFileSync(legacy, 'utf8')).toBe('legacy crash log\n');
            expect(fs.readFileSync(perf, 'utf8')).toBe('perf\n');
            expect(sessionLogs()).toHaveLength(10);
        });

        it('still starts the session when an old log cannot be deleted', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            for (let s = 0; s < 10; s++) {
                at(s);
                logger.init(testLogDir);
                logger.cleanup();
            }
            vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
                const err = new Error('EBUSY: resource busy or locked');
                err.code = 'EBUSY';
                throw err;
            });
            at(10);
            expect(() => logger.init(testLogDir)).not.toThrow();
            logger.log('main', 'still logging');
            expect(readLines().at(-1)).toMatch(/\[INFO\] \[main\] still logging$/);
            expect(sessionLogs()).toHaveLength(11); // nothing could be pruned — retried on the next launch
        });
    });

    describe('log/warn/error()', () => {
        it('writes INFO line with timestamp, level, source, and message', () => {
            logger.init(testLogDir);
            logger.log('main', 'Application started');
            expect(readLines().at(-1)).toMatch(
                /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] \[main\] Application started$/
            );
        });

        it('writes WARN line', () => {
            logger.init(testLogDir);
            logger.warn('main', 'Something unusual');
            expect(readLines().at(-1)).toMatch(/\[WARN\] \[main\] Something unusual$/);
        });

        it('writes ERROR line', () => {
            logger.init(testLogDir);
            logger.error('renderer', 'Uncaught TypeError');
            expect(readLines().at(-1)).toMatch(/\[ERROR\] \[renderer\] Uncaught TypeError$/);
        });

        it('appends multiple lines within a session, after the header', () => {
            logger.init(testLogDir);
            logger.log('main', 'First');
            logger.warn('main', 'Second');
            logger.error('renderer', 'Third');
            const lines = readLines().slice(1);
            expect(lines).toHaveLength(3);
            expect(lines[0]).toContain('[INFO]');
            expect(lines[1]).toContain('[WARN]');
            expect(lines[2]).toContain('[ERROR]');
        });

        it('stamps the local date, not the UTC date', () => {
            // The hour whose UTC date differs from the local one: just after midnight east of UTC,
            // just before midnight west of it. At UTC+0 no hour discriminates and this passes
            // either way — it was RED on the UTC+3 machine it was written on.
            const offsetMinutes = -new Date(2026, 9, 6, 12).getTimezoneOffset();
            const hour = offsetMinutes >= 0 ? 0 : 23;
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date(2026, 9, 6, hour, 15, 0));
            logger.init(testLogDir);
            logger.log('main', 'late');
            expect(readLines().at(-1)).toBe(`[2026-10-06 ${pad(hour)}:15:00.000] [INFO] [main] late`);
        });
    });

    describe('cleanup()', () => {
        it('keeps the session log and ends it with a clean-quit footer', () => {
            logger.init(testLogDir);
            const logFile = logger.getLogPath();
            logger.cleanup();
            expect(fs.existsSync(logFile)).toBe(true);
            expect(readLines(logFile).at(-1)).toMatch(/\[INFO\] \[logger\] Session ended \(clean quit\)$/);
        });

        it('leaves no footer on a session that never reached cleanup (a crash or a kill)', () => {
            logger.init(testLogDir);
            logger.log('main', 'working');
            expect(readLines().at(-1)).not.toMatch(/Session ended/);
        });

        it('resets logPath to null', () => {
            logger.init(testLogDir);
            logger.cleanup();
            expect(logger.getLogPath()).toBeNull();
        });

        it('is safe to call before init', () => {
            expect(() => logger.cleanup()).not.toThrow();
        });

        it('is safe to call twice', () => {
            logger.init(testLogDir);
            logger.cleanup();
            expect(() => logger.cleanup()).not.toThrow();
        });
    });

    describe('getLogPath()', () => {
        it('returns null before init', () => {
            expect(logger.getLogPath()).toBeNull();
        });
    });

    describe('logPerf()', () => {
        it('appends a [PERF] line to media-viewer-perf.log', () => {
            logger.init(testLogDir);
            logger.logPerf('resume: 42ms');
            const content = fs.readFileSync(path.join(testLogDir, 'media-viewer-perf.log'), 'utf-8');
            expect(content).toContain('[PERF] resume: 42ms');
        });

        it('persists the perf log across cleanup, alongside the session log', () => {
            logger.init(testLogDir);
            logger.logPerf('x: 1ms');
            logger.cleanup();
            expect(fs.existsSync(path.join(testLogDir, 'media-viewer-perf.log'))).toBe(true);
            expect(sessionLogs()).toHaveLength(1); // the session log survives quit too (G2)
        });

        it('appends across sessions (init does not truncate the perf log)', () => {
            logger.init(testLogDir);
            logger.logPerf('session1');
            logger.cleanup();
            logger.init(testLogDir);
            logger.logPerf('session2');
            const content = fs.readFileSync(path.join(testLogDir, 'media-viewer-perf.log'), 'utf-8');
            expect(content).toContain('session1');
            expect(content).toContain('session2');
        });

        it('is a no-op before init (does not throw, writes nothing)', () => {
            expect(() => logger.logPerf('x')).not.toThrow();
        });
    });
});
```

- [x] **Step 2: Run the tests to verify they fail — and that the local-date test is RED**

Run: `npx vitest run tests/logger.test.js`
Expected: FAIL — at least `creates a dated session log` (name is `media-viewer.log`), `opens the session with a header line`, `keeps only the newest 10`, `keeps the session log and ends it with a clean-quit footer` (file deleted), and **`stamps the local date, not the UTC date`** (expected `[2026-10-06 00:15…`, received `[2026-10-05 00:15…` on this UTC+3 machine). If the local-date test passes here, stop — it proves nothing (feedback: a RED test that passes is zero coverage).

- [x] **Step 3: Rewrite `logger.js`**

```js
const fs = require('fs');
const path = require('path');

// Session log: one file per app launch, named by its local start time
// (media-viewer-YYYY-MM-DD_HH-MM-SS.log). init() keeps the newest SESSION_LOGS_KEPT; cleanup()
// writes a clean-quit footer and closes the file WITHOUT deleting it, so a kept log with no
// footer is a crash or a kill. Until G2 (2026-10-05) the log was truncated on launch and deleted
// on quit, on the TASK-025 assumption that errors mean crashes — a session that broke the app
// without crashing it lost its evidence that way.
const SESSION_LOGS_KEPT = 10;
const SESSION_LOG_PATTERN = /^media-viewer-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(?:-(\d+))?\.log$/;
const MAX_SAME_SECOND_SESSIONS = 100;

let logPath = null;
let logFd = null;
// Persistent perf/diagnostics log. Unlike the session logs (one per launch, pruned to the newest
// SESSION_LOGS_KEPT), this is append-mode, never pruned, and accumulates across sessions so
// real-run timings can be reviewed after the app closes. Opened lazily on first logPerf() call.
let perfFd = null;
let perfLogDir = null;

function pad(value, width = 2) {
    return String(value).padStart(width, '0');
}

// Local calendar date. (toISOString() is UTC: paired with the local time it stamped yesterday's
// date on every line written between local midnight and the UTC offset.)
function formatLocalDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sessionLogName(date, sequence) {
    const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
    const suffix = sequence > 1 ? `-${sequence}` : '';
    return `media-viewer-${formatLocalDate(date)}_${time}${suffix}.log`;
}

// 'wx' never reuses a file: a second session started in the same second gets -2, -3, …
function openSessionLog(logDir, date) {
    for (let sequence = 1; sequence <= MAX_SAME_SECOND_SESSIONS; sequence++) {
        const candidate = path.join(logDir, sessionLogName(date, sequence));
        try {
            return { fd: fs.openSync(candidate, 'wx'), filePath: candidate };
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
    }
    throw new Error(`logger: no free session-log name for ${sessionLogName(date, 1)}`);
}

// Delete all but the newest `keep` session logs. Only names matching SESSION_LOG_PATTERN are
// candidates, so media-viewer-perf.log and a legacy media-viewer.log are never touched. Best
// effort and never throws: a file held open elsewhere stays and is retried on the next launch.
function pruneSessionLogs(logDir, keep) {
    let names;
    try {
        names = fs.readdirSync(logDir);
    } catch (_e) {
        return;
    }
    const sessions = names
        .map((name) => {
            const match = SESSION_LOG_PATTERN.exec(name);
            return match ? { name, stamp: match[1], sequence: match[2] ? Number(match[2]) : 1 } : null;
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.stamp !== b.stamp) {
                return a.stamp < b.stamp ? 1 : -1;
            }
            return b.sequence - a.sequence;
        });
    for (const old of sessions.slice(keep)) {
        try {
            fs.unlinkSync(path.join(logDir, old.name));
        } catch (_e) {
            // Held open or already gone — retried on the next launch.
        }
    }
}

function init(logDir) {
    if (logFd !== null) {
        try {
            fs.closeSync(logFd);
        } catch (_e) {
            // fd already invalid — proceed with re-init
        }
        logFd = null;
    }
    // Reset the perf fd so it lazily reopens under the (possibly new) logDir; do NOT truncate
    // the perf log (append-mode, persists across sessions).
    if (perfFd !== null) {
        try {
            fs.closeSync(perfFd);
        } catch (_e) {
            // fd already invalid
        }
        perfFd = null;
    }
    perfLogDir = logDir;
    fs.mkdirSync(logDir, { recursive: true });
    const session = openSessionLog(logDir, new Date());
    logFd = session.fd;
    logPath = session.filePath;
    writeEntry('INFO', 'logger', `Session started (pid ${process.pid})`);
    pruneSessionLogs(logDir, SESSION_LOGS_KEPT);
}

function formatTimestamp() {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    return `${formatLocalDate(now)} ${time}.${pad(now.getMilliseconds(), 3)}`;
}

function writeEntry(level, source, message) {
    if (logFd === null) {
        return;
    }
    const line = `[${formatTimestamp()}] [${level}] [${source}] ${message}\n`;
    fs.writeSync(logFd, line);
}

function log(source, message) {
    writeEntry('INFO', source, message);
}

function warn(source, message) {
    writeEntry('WARN', source, message);
}

function error(source, message) {
    writeEntry('ERROR', source, message);
}

// Append a diagnostics line to the persistent perf log (media-viewer-perf.log). Survives quit
// (never unlinked, never pruned) and accumulates across sessions (append-mode) so real-run
// behavior can be reviewed after the fact. No-op before init().
function logPerf(message) {
    if (perfLogDir === null) {
        return;
    }
    try {
        if (perfFd === null) {
            perfFd = fs.openSync(path.join(perfLogDir, 'media-viewer-perf.log'), 'a');
        }
        fs.writeSync(perfFd, `[${formatTimestamp()}] [PERF] ${message}\n`);
    } catch (_e) {
        // Best-effort diagnostics — never let a logging failure surface to the app.
    }
}

// Clean quit: footer, then close. The session log is KEPT (pruned only by a later init()).
function cleanup() {
    // Close (but never delete) the persistent perf log first — it must survive quit.
    if (perfFd !== null) {
        try {
            fs.closeSync(perfFd);
        } catch (_e) {
            // fd already invalid
        }
        perfFd = null;
    }
    if (logFd === null) {
        return;
    }
    try {
        writeEntry('INFO', 'logger', 'Session ended (clean quit)');
    } catch (_e) {
        // A failed footer must not stop the close below.
    }
    try {
        fs.closeSync(logFd);
    } catch (_e) {
        // File descriptor may already be invalid
    }
    logFd = null;
    logPath = null;
}

function getLogPath() {
    return logPath;
}

module.exports = { init, log, warn, error, logPerf, cleanup, getLogPath };
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/logger.test.js`
Expected: PASS (24 tests).

- [x] **Step 5: `main.js` — say which build wrote each log.** After the `console.error = (...args) => { … };` block (just before `createWindow();`, ~L160), add:

```js
    // First line through the intercepted console, so every kept session log says which build wrote it.
    console.log(
        `Media Viewer ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'dev'}) — session log: ${logger.getLogPath()}`
    );
```

- [x] **Step 6: Comments that name the old file** — replace the text only:
  - `media-viewer.js` ~L4807: `// repro is diagnosable in media-viewer.log, then prune + retry (bounded).` → `// repro is diagnosable in the session log, then prune + retry (bounded).`
  - `media-viewer.js` ~L5040: `// it is lost to console.error alone (not forwarded to media-viewer.log).` → `// it is lost to console.error alone (not forwarded to the session log).`
  - `tests/media-viewer-utils.test.js` ~L5269: `// Finding 5: the OS error behind the permanent discard must reach media-viewer.log, not` → `// Finding 5: the OS error behind the permanent discard must reach the session log, not`

Then the sweep: `grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive --exclude-dir=specs --exclude-dir=.superpowers -E "media-viewer\.log|deleted on quit|truncated on init" --include=*.js --include=*.cjs .` → the only hits are `logger.js` (its history comment and the legacy-file note in `pruneSessionLogs`) and `tests/logger.test.js` (the legacy-file test). Any other hit is a stale description — fix it.

- [x] **Step 7: Probe — where the logs live, and that they survive.** (Confirms spec F5 before any doc states it.)

```bash
DEV="$APPDATA/media_viewer/logs"; E2E="$APPDATA/Electron/logs"
ls "$DEV" "$E2E" 2>&1 | grep -c '^media-viewer-2' ; date
```
Start the app in the background (`npm start`, Bash `run_in_background`), wait until a new dated file appears (poll `ls -t "$DEV" | head -1` with a Monitor until-loop — never a fixed sleep), then close it cleanly: `taskkill //IM electron.exe` (no `//F`: sends WM_CLOSE → the window's close flow → `will-quit` → `cleanup()`). If the window does not close, ask the user to close it. Then:
```bash
f=$(ls -t "$DEV"/media-viewer-2*.log | head -1); echo "$f"; head -2 "$f"; tail -1 "$f"
```
Expected: the file is in `%APPDATA%\media_viewer\logs\` (**F5 confirmed** — if it lands in `Electron\logs` instead, stop and report: Task 5's correction and the comment below are then wrong); line 1 `Session started (pid …)`, line 2 `Media Viewer … (dev) — session log: …`, last line `Session ended (clean quit)` (**must survive a clean quit**).
Relaunch, wait for a second new file, then kill: `taskkill //F //IM electron.exe`. Expected: two dated files from this probe, the first still ending in the footer (**must survive a relaunch**), the second with **no** footer (**a kill must not look like a clean quit**).
E2E side: `npx playwright test tests/e2e/app-launch.test.js` → new dated files appear in `%APPDATA%\Electron\logs\` and **none** in `%APPDATA%\media_viewer\logs\`.

- [x] **Step 8: Record the launch-path dependency** (only if Step 7 confirmed F5). In `tests/e2e/helpers/electron-app.js`, directly above `function getLaunchArgs() {`, add:

```js
// Launching main.js directly (not the project directory) means Electron reads no package.json, so
// the app runs as "Electron": its userData — and its session logs — live under %APPDATA%\Electron\,
// apart from the real app's %APPDATA%\media_viewer\. That separation is what stops an E2E run (one
// launch per test) from pruning a debugging session's log away (logger.js keeps the newest 10).
// Keep it if this launch path ever changes.
```

- [x] **Step 9: `CLAUDE.md` L34** — replace `├── logger.js            # File logger (init/log/warn/error/cleanup/getLogPath) → app.getPath('logs')/media-viewer.log` with:
``├── logger.js            # Session logger (init/log/warn/error/cleanup/getLogPath): one media-viewer-<YYYY-MM-DD_HH-MM-SS>.log per launch in app.getPath('logs'), newest 10 kept, never deleted on quit (no "Session ended" footer = crash/kill) + append-only media-viewer-perf.log. `npm start` → %APPDATA%\media_viewer\logs; E2E (launches main.js, app name "Electron") → %APPDATA%\Electron\logs``

- [x] **Step 10: Run the whole unit suite and lint**

Run: `npx vitest run && npm run lint`
Expected: all pass; 0 lint errors.

- [x] **Step 11: Commit C4**

```bash
git add logger.js tests/logger.test.js main.js media-viewer.js tests/media-viewer-utils.test.js tests/e2e/helpers/electron-app.js CLAUDE.md
git commit -F - <<'EOF'
feat(g2): keep session logs — one dated file per launch, newest 10, never deleted on quit

TASK-025 truncated media-viewer.log on launch and deleted it on quit, assuming
errors mean crashes; the held-Like session broke the app without crashing it
and its evidence was deleted. Now: media-viewer-YYYY-MM-DD_HH-MM-SS.log per
launch ('wx' — same-second launches get -2, -3), pruned to the newest 10 by a
pattern that never touches media-viewer-perf.log or a legacy media-viewer.log,
best-effort deletes (a held file is retried next launch). Header names the pid;
cleanup() writes a "Session ended (clean quit)" footer — no footer means a
crash or kill. Also fixes timestamps that paired a UTC date with a local time
(yesterday's date on every line after local midnight at UTC+3). main.js logs
the build and log path; comments naming the old file updated; the E2E helper
records why launching main.js keeps E2E logs apart.

Probe (plan Task 4 Step 7): npm start logs to %APPDATA%\media_viewer\logs, E2E
to %APPDATA%\Electron\logs; a clean quit keeps the file with its footer, a
relaunch keeps it, a kill leaves no footer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Task 5: Correct the log-location note in the planning docs (C5)

**Files:**
- Modify: `docs/planning/WEEKLY.md` L40, `docs/planning/BACKLOG.md` L72

**Interfaces:**
- Consumes: Task 4 Step 7's confirmed locations. If Step 7 contradicted F5, do not run this task — write the measured paths instead, and record the contradiction in Key Discoveries.

- [x] **Step 1: WEEKLY L40** — replace `Note where the logs live — dev runs via \`npm start\` write to \`%APPDATA%\Electron\logs\`, not \`%APPDATA%\media_viewer\logs\`.` with:
``Note where the logs live — **corrected 2026-10-05 by G2's probe**: dev runs via `npm start` write to `%APPDATA%\media_viewer\logs\`; E2E runs (which launch `main.js` directly, so the app is named "Electron") write to `%APPDATA%\Electron\logs\`.``

- [x] **Step 2: BACKLOG L72** — replace `Measured 2026-10-05: neither \`%APPDATA%\Electron\logs\` (dev runs via \`npm start\`, where the app name is "Electron") nor \`%APPDATA%\media_viewer\logs\` holds a \`media-viewer.log\`` with:
``Measured 2026-10-05: neither `%APPDATA%\Electron\logs\` (E2E runs, which launch `main.js` directly so the app name is "Electron" — corrected by G2's probe; this entry first attributed it to `npm start`) nor `%APPDATA%\media_viewer\logs\` (`npm start`) holds a `media-viewer.log` ``
(the rest of the sentence — `, and the persistent media-viewer-perf.log in each has no move errors.` — is unchanged).

- [x] **Step 3: Verify and commit C5**

Run: `node scripts/check-docs-index.js && git diff --stat`
Expected: exit 0; two files, a few lines each.

```bash
git add docs/planning/WEEKLY.md docs/planning/BACKLOG.md
git commit -F - <<'EOF'
docs(g2): correct where session logs live (npm start → media_viewer\logs, E2E → Electron\logs)

The WEEKLY G2 item and the BACKLOG 2026-10-05 entry had the two directories
reversed; G2's Task 4 probe measured them. The entry's conclusion (the held-Like
session's log was gone) is unaffected — both directories were checked.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Finish (after Task 5)

- [x] `npx vitest run` and `npm run lint` green; `git status --short` clean.
- [x] Push (`git push -u origin g2-hooks-and-logs-that-fire`) — the pre-push hook runs the full E2E suite (non-docs push). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [x] Open the PR (body: spec link, the five probe results, test deltas, the named Bash gaps).
- [x] Review **deep (`max`)** — C1 and C3 are the only enforcement around `preload.js` and the secret scan.
- [x] Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

1. **Detect any writer of `preload.js`, not just the ones the rules see** — a `FileChanged` hook (hooks reference: _"To run a hook when a specific file changes on disk, whatever wrote it, use a FileChanged hook"_) could flag `git checkout` / glob / `.env`-via-Bash writes after the fact. 🟤 candidate.
2. **Bound `media-viewer-perf.log`** — append-only and never pruned (48 KB in the E2E directory, 2026-07-05 → 09-21); rotate by size or prune by age alongside the session logs. 🟤 candidate.
3. **E2E runs share one `userData` across runs** (memory: localStorage leaks between runs) — the same launch-path fact Task 4 records; a per-run `--user-data-dir` would isolate both state and logs explicitly instead of by accident. 🟤 candidate.
4. **Session-log retention in released builds** (PR #73 review, near-miss, recorded not fixed) — retained logs carry folder paths and error stacks, and no file has a size cap; D5 keeps the newest 10 in every build. Options the BACKLOG 🔵 [2026-10-05] entry already listed: keep only in dev runs (`!app.isPackaged`), or keep only sessions that logged a warning/error; or add a per-file size cap. 🟤 candidate.

## Residuals for Extract (found while planning — not fixed here)

- `.claude/skills/new-e2e-test/SKILL.md` omits the `isLoading` / `mediaNavigationInProgress` wait and the lazy-`mlWorker` rule — both live in CLAUDE.md (always loaded), so the omission does not mislead; left as is.
- BACKLOG L256 (pre-push E2E-gate friction) — annotate at closeout that `SKIP=e2e` now exists as a per-push waiver.
- BACKLOG L513 (unclosed code fence) — annotate at closeout that the per-check bypass it was paired with has landed, removing the stated reason for not making the parser stricter.

## Closeout (after the merge, on `main`)

- [x] Extract (Improvements + Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] G2 closeout`), archive this plan, DONE.md entry, WEEKLY Status → `✅ PR #N` + both Daily-Schedule rows, check off the five BACKLOG entries G2 closed (🟤 [2026-09-24] ×3, 🟤 [2026-09-02] pre-commit bypass, 🔵 [2026-10-05] logs) — **in the closeout commit**.
- [x] Memory: delete `project_prettier_hook_formats_cwd.md` and its `MEMORY.md` line (the workaround retires); session memory file.
- [x] Propagation check: re-read every live surface this plan touched for a late correction that did not reach it.

## Progress Log

- **2026-10-05** — Brainstormed with the user (decisions D1 ask rules + Bash rule, D3 skills committed, D5 dated files ×10); spec committed `e797f43`; plan written. Planning-time verifications: exec-form hook syntax (hooks reference), `planFormat` path cases and the prune order (scratch script), Prettier `--log-level` flag, the skill's helper/fixture claims against `tests/e2e/helpers/electron-app.js`.

- **2026-10-05 — Task 1** — Formatter probe passed both halves (edited file formatted, mis-formatted sibling and out-of-repo file untouched; a `docs/planning`-cwd edit left every planning doc byte-identical). Guard probe: `.env` Write and `preload.js` Edit (from a subdirectory cwd) prompted — the user's "No" blocked both; an ordinary write did not prompt. **Deviation**: the `Bash(*preload.js*)` rule missed `cd <project dir> && … preload.js` three times → user-directed `PreToolUse` hook `guard-preload-bash.js` (spec D1a) + `tests/guard-preload-bash.test.js` (10); its first live probe came too soon after the settings edit, the instrumented re-run prompted.
- **2026-10-05 — Task 2** `021f24e` — skill committed; template guards written with braces (ESLint `curly: all`), not the plan's one-line form.
- **2026-10-05 — Task 3** `7eb1b9b` — `SKIP` probe: no SKIP and `SKIP=docs-index` both blocked by the staged fake secret; `SKIP=secrets` waived only the scan (other three ran, 867 tests); typo token warned. (Plan's Expected for `SKIP=docs-index` named a warning that cannot print — `secrets` aborts first.)
- **2026-10-05 — Task 4** `427b8ee` — local-date test RED on this UTC+3 machine (`10-05` vs `10-06`) before the fix. Live: `npm start` → `%APPDATA%\media_viewer\logs` (F5 confirmed) with header + build line; clean close (WM_CLOSE) kept the file with its footer; relaunch kept it; `taskkill /F` left no footer; E2E `app-launch` (5 tests) wrote 5 dated files to `Electron\logs` only.
- **2026-10-05 — Task 5** `1f2ba1a` — WEEKLY + BACKLOG log-location note corrected. Unit tests 837 → 874; lint 0 errors (2 pre-existing warnings in untouched test files).
- **2026-10-05 — PR #73 review** — `3dbcbc5`: prune never deletes the current session log and orders by mtime (reproduced: 10 future-stamped logs made `init()` unlink its own file); stale ESLint header. Then the near-misses: `SKIP` spaces separate tokens, `fail` → `check_failed` in `skip.sh` (keeps the status; 127 → "run npm install"), `init()` header write guarded, `sessionLogName` → `buildSessionLogName`, 20 s timeouts on the spawning test blocks, CLAUDE.md wording (`rules/` reserved; mode claims limited to what the docs and the probes support; `logPerf` listed). The code blocks above are the plan as written; `fail()` and `sessionLogName` there are superseded.

## Key Discoveries

1. **A `Bash(...)` ask rule did not catch `cd <project dir> && X`**, although the permissions page says ask rules apply when any subcommand matches. Claude Code strips a `cd` to the current directory before hooks see the command; a hook on the command text closed the gap where the rule did not. Measured, not inferred — the next Weekly Reviews may want to report it upstream.
2. **A settings.json hook edit is not always live on the very next tool call** — the first probe after wiring the hook saw no prompt; the same probe minutes later did. A "hook is dead" conclusion needs a second probe (or an invocation log) before it is believed.
