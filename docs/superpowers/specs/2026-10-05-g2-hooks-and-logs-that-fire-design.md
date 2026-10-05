# G2 Hooks and Logs That Actually Fire — Design Spec

**Task Reference**: WEEKLY.md Oct 5–9 § G2 (🟤 + 1 🔵 folded, 8 SP → **~9 SP**, see § 9) ← BACKLOG 🟤 `[2026-09-24]` ×3 (Weekly Reviews §2 adopt + the two dead-hook entries), 🟤 `[2026-09-02]` G3 closeout (pre-commit bypass), 🔵 `[2026-10-05]` (keep session logs)
**Created**: 2026-10-05
**Status**: Draft — awaiting user review
**Branch**: `g2-hooks-and-logs-that-fire` (PR, per the week's branch/PR shape)

---

## 1. Goal

Every protection this group names must **demonstrably fire**, and the app's session log must survive a
clean quit. Acceptance is a probe per protection with a half that must fire and a half that must not
(§ 7) — never a green suite alone, because a check that cannot fail looks exactly like one that passes.

| #   | Item                                                    | Files                                                                                          | Source              |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------- |
| 1   | `.claude/` config under version control                 | `.gitignore`, `.claude/settings.json`, `.claude/skills/new-e2e-test/SKILL.md`, `CLAUDE.md`     | 🟤 [2026-09-24]     |
| 2   | `preload.js` / `.env` guard that fires                  | `.claude/settings.json`, `CLAUDE.md`                                                           | 🟤 [2026-09-24]     |
| 3   | Formatter hook that formats only the edited file        | `.claude/settings.json`, `.claude/hooks/format-edited-file.js`, `eslint.config.mjs`, new test  | 🟤 [2026-09-24]     |
| 4   | Per-check bypass for the Husky hooks (`SKIP=<check>`)   | `.husky/skip.sh` (new), `.husky/pre-commit`, `.husky/pre-push`, `scripts/check-secrets.js`, `scripts/check-docs-index.js`, new test, `CLAUDE.md`, `PROJECT.md` | 🟤 [2026-09-02]     |
| 5   | Keep session logs after a clean quit                    | `logger.js`, `main.js`, `tests/logger.test.js`, `tests/e2e/helpers/electron-app.js` (comment), `CLAUDE.md` | 🔵 [2026-10-05]     |

**Non-goals.** No "Open logs folder" UI action (it would touch `preload.js` and the renderer for a
convenience the CLAUDE.md log-path line covers). No bound on `media-viewer-perf.log` growth (§ 10). No
guard on *reading* `.env` files (the original hook guarded writes only). No `CLAUDE.md` size audit (the
overdue 🟡 item stays deferred, per WEEKLY Notes — it would bury this group's `CLAUDE.md` diff).

---

## 2. Findings that shaped the design

Every finding names its evidence. Documentation quotes are from Anthropic's own pages, fetched
2026-10-05; probes ran on this machine the same day.

**F1 — A hook's `ask` *does* prompt under auto mode, and an `ask` permission rule prompts in every mode.**
[permission-modes](https://code.claude.com/docs/en/permission-modes): _"Claude Code doesn't add the option
to prompts forced by one of your `ask` rules or by a hook, because auto mode still shows you those prompts,
so switching wouldn't remove them."_ The same page: _"Claude Code doesn't auto-approve the following in any
mode, including `bypassPermissions`"_, in a list whose first item is _"Tools matched by an explicit ask
rule"_. This answers the open question the WEEKLY item carried ("check first how `ask` behaves under auto
mode").

**F2 — A declarative `ask` rule covers more than the hook could, and anchors at the project root.**
[permissions](https://code.claude.com/docs/en/permissions): _"`Edit` rules apply to all built-in tools that
edit files."_ Its path table: `/path` is a _"Path relative to the settings source"_ (the project root, for
project settings), so the rule holds whatever the session's cwd is. On Bash rules: _"Deny and ask rules
apply when any subcommand matches them, including a command nested inside a subshell … even in auto
mode."_ The same page is explicit about the limit: a Bash rule _"covers the invocation Claude usually
produces and isn't a security boundary around the program."_ The threat here is an accidental edit by
Claude, not an adversary, so that limit is acceptable — and it is named in `CLAUDE.md`.

**F3 — Prettier formats an out-of-repo file with this repo's config, and honours `.prettierignore` only
from the root.** Probe (`prettier --check`, scratch files): a mis-formatted `.js` in the scratchpad,
checked from the repo root → flagged for formatting (the fixed hook would have rewritten it — memory files
under `~/.claude/` are Edit/Write targets in every session). `docs/planning/WEEKLY.md` passed explicitly
from the root → skipped (ignored). The same file from a `docs/planning` cwd → flagged (the 2026-09-24
incident, reproduced for one file). Adding `--ignore-path ../../.prettierignore` → skipped. So the fix needs
**both** a fixed cwd and an outside-the-repo skip; the BACKLOG entry named only the first.

**F4 — `.claude/` and `.husky/` are protected paths.** permission-modes, protected-paths table: writes there are
_"routed to the classifier"_ in auto mode. A hook script under `.claude/hooks/` therefore gets a review
whenever it is edited; one under `scripts/` would not.

**F5 — The WEEKLY/BACKLOG note on where logs live is very likely reversed.** The two perf logs say so:
`%APPDATA%\Electron\logs\media-viewer-perf.log` holds `tournament state read+parse: 2ms` lines (fixture-sized
— E2E), last written 2026-09-21; `%APPDATA%\media_viewer\logs\media-viewer-perf.log` holds `174ms` /
`146ms` reads (a real folder), last written 2026-07-21. Mechanism: the E2E helper launches `main.js`
directly (`getLaunchArgs()`), so Electron reads no `package.json` and names the app "Electron"; `npm start`
is `electron .`, which reads `"name": "media_viewer"`. **To be confirmed by a probe before any doc is
corrected** (plan step; the evidence is strong but indirect). Consequence for item 5: E2E launches rotate a
different directory from real sessions, so a pre-push E2E run cannot evict a debugging log — but only by
accident of the launch path, which is why § 6 records it.

**F6 — Log timestamps mix a UTC date with a local time.** `formatTimestamp()` builds the date from
`toISOString()` and the time from `toTimeString()`. Probe at this machine's UTC+3: local 2026-10-06 01:30
is stamped `2026-10-05 01:30:00`. Invisible while every log was deleted on quit; it would misdate exactly
the late-night sessions once logs are kept. Folded into item 5.

**F7 — Husky's `sh -e` still fails the hook through `skipped x || cmd`.** Probe:
`sh -e -c 'f(){ return 1; }; f || false; echo NOT-ABORTED'` → no output, exit 1. The failure of the last
command in an AND-OR list triggers errexit, so the `skipped <token> || <check>` shape is safe.

**F8 — Tracking these files makes branch switches delete them.** Once `.claude/settings.json`,
`.claude/hooks/` and `.claude/skills/` are tracked on this branch, `git checkout main` removes them from the
working tree (main does not track them; ignore rules do not prevent the removal) until G2 merges. While the
branch is checked out elsewhere, the guard, the formatter, the project's `superpowers` plugin enable and the
`new-e2e-test` skill all vanish. See § 8 for the handling.

---

## 3. Decisions

| ID  | Decision                                                                                                         | Decided by                          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| D1  | Replace the `PreToolUse` guard hook with `permissions.ask` rules, including a Bash rule for commands naming `preload.js` | User, 2026-10-05 (over a fixed hook with `ask`, a hard `exit 2` block, or file-tool rules only) |
| D1a | **Amended during execution (Task 1 probe)**: add a `PreToolUse` hook `.claude/hooks/guard-preload-bash.js` (matcher `Bash\|PowerShell`, `permissionDecision: "ask"` when the command text names `preload.js`) beside the rules. The `Bash(*preload.js*)` rule prompted for `grep … preload.js` and `true && grep … preload.js` but not for `cd <project dir> && grep … preload.js` (3 misses, re-tested); instrumented, Claude Code hands hooks such a command with the `cd` stripped, and the hook's `ask` then prompted. PowerShell is matched too — the hooks guide: _"matching `Bash` alone is not enough"_ | User, 2026-10-05, after the re-test |
| D2  | Formatter stays a hook: a Node script in `.claude/hooks/`, run in exec form                                       | Design (F3, F4); user-approved § 1  |
| D3  | Un-ignore list: `agents/`, `hooks/`, `rules/`, `settings.json`, `skills/`; commit `new-e2e-test` after a staleness check | User, 2026-10-05 (over keeping `skills/` ignored, or a deny-list) |
| D4  | `SKIP=<check>` via a shared, sourced `.husky/skip.sh`; tokens name the check                                       | Design; user-approved § 2           |
| D5  | Session logs: dated files, keep the newest 10; header and clean-quit footer lines                                  | User, 2026-10-05 (over 5 files, a rename chain, or WARN/ERROR-only retention) |
| D6  | Fix the UTC-date/local-time timestamp mix in the same change                                                       | Design (F6); user-approved § 3      |

---

## 4. Claude Code configuration (items 1–3, one commit)

### 4.1 `.gitignore`

Keep the allow-list shape (default-deny for anything Claude Code adds per-machine later):

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

`rules/` is listed now so the path-scoped-rules migration (🟤 [2026-08-27]) needs no second `.gitignore`
change; git does not track an empty directory, so it is inert until then.

### 4.2 `.claude/settings.json`

```jsonc
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
    "enabledPlugins": { "superpowers@claude-plugins-official": true, "pr-review-toolkit@claude-plugins-official": false }
}
```

- The dead `PreToolUse` hook is **deleted**, not repaired (D1).
- `Edit(/**/.env.*)` also matches `.env.example` — accepted (no such file exists; one prompt if one ever does).
- `Bash(*preload.js*)` prompts on Bash *reads* that name the file too (`grep x preload.js`) — accepted cost of
  covering `sed -i` / heredoc writes, which auto mode encourages and an `Edit|Write`-only guard cannot see.
- **Named gaps** (recorded in `CLAUDE.md`, per "a guard can be real and still partial"): Bash writes to a
  `.env` file; Bash commands that change `preload.js` without naming it (`git checkout -- .`, `git stash pop`,
  a glob such as `sed -i … *.js`).
- The exec-form field shape (`command` + `args`, the `${CLAUDE_PROJECT_DIR}` placeholder) is verified against
  the hooks reference as the plan's first step; fallback is the shell form
  `node "$CLAUDE_PROJECT_DIR/.claude/hooks/format-edited-file.js"` (Git Bash is installed, and the hooks
  reference says command hooks default to `bash`).
- Checked 2026-10-05: no machine-specific path in the file.

### 4.3 `.claude/hooks/format-edited-file.js`

CommonJS, Node built-ins only, the `scripts/check-*.js` pattern: exported pure functions plus a CLI under
`require.main === module`.

- **`planFormat({ filePath, root })`** → `{ action: 'skip', reason }` or `{ action: 'format', relPath }`:
  - empty / missing `filePath` → skip (`'no file path'`). This is the old hook's failure mode; it must never
    reach Prettier.
  - outside `root` (`path.relative` begins with `..`, or is absolute — a different drive) → skip
    (`'outside the project'`). On Windows `path.relative` compares case-insensitively, which covers the
    `c:\` / `C:\` split this repo is opened under (unit-tested, not assumed).
  - otherwise → format, with `relPath` relative to `root`.
- **CLI**: read stdin fully, `JSON.parse`, take `tool_input.file_path`; `root = path.resolve(__dirname, '..', '..')`
  (the script's own location, so no environment variable is trusted). On `format`, spawn
  `process.execPath <root>/node_modules/prettier/bin/prettier.cjs --write --ignore-unknown <relPath>` with
  `cwd: root` — the invocation lint-staged makes, so Prettier's default ignore files (`.gitignore`,
  `.prettierignore`) resolve from the root wherever the session's cwd is.
- **Always exit 0.** A `PostToolUse` hook cannot undo the edit (hooks reference: exit 2 only _"shows stderr to
  Claude; the tool already ran"_), and a syntax error in an edited JS file is lint-staged's to report. Malformed
  stdin, a missing Prettier binary or a Prettier failure write one line to stderr (debug log) and exit 0.
- `timeout: 30` — the 10-minute default would stall a session on a hung Prettier.

### 4.4 Supporting edits

- `eslint.config.mjs`: the `scripts/**/*.js` block's `files` gains `.claude/hooks/**/*.js` (Node CJS globals).
  The plan verifies that `npm run lint` actually reaches the dot-directory (a lint block that never runs is a
  check that cannot fail).
- `CLAUDE.md`: the `.claude/*` gotcha is rewritten to name what *is* committed; the Architecture tree's
  `.claude/agents/` line becomes a `.claude/` line; the Best Practices "Changes to preload.js require security
  review" line says it is now enforced by an `ask` rule and names the § 4.2 gaps.
- `new-e2e-test` skill: compared against `CLAUDE.md`'s current E2E rules (e.g. the `afterEach` null guards it
  may predate); a line that would mislead is fixed, anything larger becomes a BACKLOG entry. Its own commit.

---

## 5. Per-check bypass for the Husky hooks (item 4)

### 5.1 `.husky/skip.sh` (new, sourced — Husky runs only files named after git hooks)

```sh
# Sourced by .husky/pre-commit and .husky/pre-push.
# SKIP=<check>[,<check>…] waives the named checks for one command, e.g.  SKIP=docs-index git commit …
# Prefer it to --no-verify, which skips EVERY check, the secret scan included.
HOOK_NAME=${HOOK_NAME:-$(basename "$0")}
SKIP_LIST=",$(printf '%s' "${SKIP-}" | tr -d ' '),"

skipped() {   # skipped <token> → 0 (and a loud warning) when <token> is listed in SKIP
    case "$SKIP_LIST" in
        *",$1,"*) echo "⚠️  $HOOK_NAME: SKIP=$1 — the $1 check did NOT run" >&2; return 0 ;;
    esac
    return 1
}

check_skip_tokens() {   # check_skip_tokens "<known tokens>" → warn about each SKIP token this hook does not know
    for t in $(printf '%s' "${SKIP-}" | tr ',' ' '); do
        case " $1 " in
            *" $t "*) ;;
            *) echo "⚠️  $HOOK_NAME: unknown SKIP token '$t' — this hook's checks are: $1" >&2 ;;
        esac
    done
}
```

- Whole-token matching: `SKIP=docs` never waives `docs-index`; `SKIP=secrets-x` never waives `secrets`.
- **Every skip warns, every time, on stderr.** A `$env:SKIP` left set in a PowerShell terminal would otherwise
  waive that check silently on every later commit in that terminal.
- An unknown token (a typo, or a pre-commit token during a push) warns and lists the valid tokens; nothing is
  skipped by mistake — the check runs, which fails safe.

### 5.2 The hooks

```sh
# .husky/pre-commit
. "$(dirname "$0")/skip.sh"
check_skip_tokens "secrets docs-index lint-staged vitest"
fail() { echo "pre-commit: $1 failed — fix it, or waive this check only: SKIP=$1 git commit …" >&2; exit 1; }

skipped secrets     || node scripts/check-secrets.js
skipped docs-index  || node scripts/check-docs-index.js
skipped lint-staged || npx lint-staged  || fail lint-staged
skipped vitest      || npx vitest run   || fail vitest
```

```sh
# .husky/pre-push
. "$(dirname "$0")/skip.sh"
check_skip_tokens "e2e"
decision=$(node scripts/check-e2e-needed.js || echo RUN)
if [ "$decision" = "RUN" ] && ! skipped e2e; then
    echo "pre-push: running the E2E suite before push (skip it with: SKIP=e2e git push)…"
    npx playwright test
fi
```

**Amended after PR #73 review**: `fail` became `check_failed` in `skip.sh` — it keeps the failing exit status and, for 127 (command not found), says to run `npm install` instead of suggesting `SKIP` (an `exit 1` had also hidden Husky's own 127 message); and spaces now separate `SKIP` tokens like commas (`tr -d ' '` had fused `docs-index secrets` into one silently-unmatched token).

`fail` trailers only for the two third-party checks; `check-secrets.js` and `check-docs-index.js` print their
own remedy, and a second message would only repeat it.

### 5.3 Remedy text

- `scripts/check-secrets.js`: _"…If this is a genuine false positive, skip this check only: `SKIP=secrets git commit …`"_
  replaces the `--no-verify` advice.
- `scripts/check-docs-index.js`: adds _"False positive? Skip this check only: `SKIP=docs-index git commit …`"_.
- `scripts/check-e2e-needed.js`: **unchanged, deliberately** — it prints no remedy text (the pre-push echo above
  does), and its RUN/SKIP decision is not what a bypass waives. The WEEKLY item lists it as affected; this is why
  it is not touched.
- `CLAUDE.md` hook prose + `PROJECT.md` gates line: the token list; the PowerShell form
  `$env:SKIP='docs-index'; git commit …; $env:SKIP=$null`; `--no-verify` kept as the last resort that disables
  everything.

---

## 6. Keep session logs (item 5)

### 6.1 `logger.js`

- **`init(logDir)`**: `mkdirSync`; open `media-viewer-YYYY-MM-DD_HH-MM-SS.log` (local time) with `'wx'`; on
  `EEXIST` (two launches in one second) try `-2`, `-3`, … (bounded; past the bound, throw as `openSync` does
  today). First line: `Session started (pid <pid>)`. Then **prune**: list the directory, keep only names matching
  `^media-viewer-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?\.log$`, order newest first (timestamp, then suffix
  number), delete all but the newest `SESSION_LOGS_KEPT = 10` (the current file counts). **Amended after PR #73
  review**: the current session's file is never a prune candidate, and the others are ordered by modification
  time (name stamp, then suffix, only break ties) — name order let logs stamped "after now" (clock set back, a
  move west, DST fall-back) evict the new log itself, and then the previous session. Each delete is
  best-effort — a file held open elsewhere is skipped and retried on the next launch. Prune never throws.
- **The pattern is the safety boundary**: `media-viewer-perf.log` and a legacy `media-viewer.log` (e.g. left by a
  crash before this change) do not match it and are never deleted.
- **`cleanup()`**: write `Session ended (clean quit)`, close the fd, **do not unlink**; `logPath` → `null`. In a
  kept log, a missing footer now means a crash or a kill — the distinction the TASK-025 design (errors mean
  crashes) got wrong.
- **`formatTimestamp()`**: date from local getters (`getFullYear` / `getMonth` / `getDate`), matching the
  already-local time (D6).
- **`getLogPath()`**: the current session's file.
- **`logPerf()`** and the perf log: unchanged (append-mode, never pruned).
- Comments that state the old lifecycle are rewritten in the same commit (`logger.js` lines 6–8 and 65–67;
  `media-viewer.js` ~4807 and ~5040 say "`media-viewer.log`" and become "the session log"; the
  `media-viewer-utils.test.js` ~5269 comment likewise). Grep for `media-viewer.log` across code, tests and
  comments before committing, per `CLAUDE.md` Best Practices.

### 6.2 `main.js`

After `logger.init(...)` and the console interception, one line through the intercepted console:
`Media Viewer <app.getVersion()> (<packaged|dev>) — session log: <logger.getLogPath()>`, so a kept log says
which build wrote it. The `will-quit` handler is unchanged — only what `cleanup()` does changes.

### 6.3 Where the logs live

A probe confirms F5 first (launch each way, see which directory gains a dated file). Then:

- the `CLAUDE.md` `logger.js` line gives both paths and the retention rule;
- the F5 dependency is recorded twice: in that line, and as a comment on `getLaunchArgs()` in
  `tests/e2e/helpers/electron-app.js` ("launching `main.js`, not `.`, is also what keeps E2E logs out of the
  real app's log directory");
- the WEEKLY G2 item and the BACKLOG 🔵 [2026-10-05] entry get their location note corrected (they are live
  planning docs; the spec states the evidence, the correction states the probe).

### 6.4 `tests/logger.test.js`

- Flip: "deletes the log file" and the perf test's "main log deleted" → the file **survives** cleanup and ends
  with the footer.
- New: name matches the dated pattern; first line is the header; 11 `init`/`cleanup` cycles leave exactly the 10
  newest; `media-viewer-perf.log` and a legacy `media-viewer.log` survive the prune; a same-second collision
  gets `-2` (fake timers); date and time in a log line both agree with the local getters for a fixed system time.
- Kept: the double-init fd test, the `logPerf` append/no-op tests, `getLogPath()` before init.

---

## 7. Acceptance probes (recorded with their output in the plan)

| Probe | Must fire | Must NOT fire |
| ----- | --------- | ------------- |
| Guard (needs the user at the keyboard, ~2 min) | Write to a scratch `.env` → prompt (user declines); `grep x preload.js` via Bash → prompt | Write to an ordinary scratch file → no prompt |
| Formatter | Mis-formatted scratch `.js` inside the repo → formatted; `/hooks` lists the new hook (the reload happened) | From a `docs/planning` cwd, edit one planning doc → `git status` shows only that file; mis-formatted `.js` in the scratchpad → same hash before and after |
| SKIP (fake secret staged; `.husky/pre-commit` run directly via `sh -e`, so no commit is ever made) | No `SKIP` → blocked by `secrets`; `SKIP=docs-index` → still blocked by `secrets` | `SKIP=secrets` → warning printed, `secrets` does not run, the other three do |
| Log | `npm start`, clean quit → dated file remains, ends with the footer; relaunch → a second file, the first intact | End the app from Task Manager → that file has no footer |

Unit tests (`tests/format-edited-file.test.js`, `tests/husky-skip.test.js`, `tests/logger.test.js`) cover the
decision logic; the probes cover what unit tests cannot — that Claude Code, git and Electron actually invoke it.
`tests/husky-skip.test.js` spawns `sh`; when `sh` is not on `PATH` it is skipped **explicitly**
(`it.skipIf`, with the reason), never silently passed.

---

## 8. Delivery

**Commit order** (each commit passes the pre-commit hook on its own):

1. This spec (+ its `docs/README.md` row and link — the docs-index guard blocks it otherwise), then the plan.
2. **C1** — `.gitignore`, `.claude/settings.json`, `.claude/hooks/format-edited-file.js` + test, ESLint glob,
   `CLAUDE.md` (`.claude/` gotcha, Architecture-tree line, preload line). The two fixes are the first thing the
   review sees.
3. **C2** — the `new-e2e-test` skill (+ any staleness fix).
4. **C3** — `SKIP`: `.husky/*`, remedy texts, test, and its docs (`CLAUDE.md` hook prose, `PROJECT.md` gates line).
5. **C4** — logger: `logger.js`, `main.js`, tests, the comments of § 6.1, the E2E-helper comment, and the
   `CLAUDE.md` `logger.js` line.
6. **C5** — planning docs: the WEEKLY G2 item's and the BACKLOG 🔵 [2026-10-05] entry's log-path correction.

Each commit carries its own `CLAUDE.md` / `PROJECT.md` lines, so a reviewer reads a change and its
documentation together.

**F8 handling**: before C1, copy `.claude/settings.json`, `.claude/settings.local.json` and
`.claude/skills/` to the session scratchpad. No branch switch until G2 merges (WEEKLY already branches G1 after
it). If a switch is unavoidable, the files return on switching back; the backup covers a mistake.

**Closeout (after the merge, on `main`)**: delete the `project_prettier_hook_formats_cwd` memory and its
`MEMORY.md` line (its workaround retires); BACKLOG extracts per § 10; WEEKLY Status → `✅ PR #N`.

---

## 9. Sizing and model

~**9 SP** (8 planned): +0.5 the skill check, +0.5 the session header/footer and the timestamp fix; the
declarative guard removed a script and its tests.

- Execute **C1 and C3 on Opus · `medium`** — the formatter script and the shell helper hold the edge cases.
- Execute **C2, C4, C5 on Sonnet · `medium`**.
- Review **deep (`max`)** — unchanged from WEEKLY: C1 and C3 are the only enforcement around `preload.js`
  and the secret scan.

---

## 10. Known limitations and follow-ups

- **Bash coverage is partial by construction** (§ 4.2 named gaps; the docs call a Bash rule "not a security
  boundary"). A `FileChanged` hook on `preload.js` could *detect* any writer after the fact; not built — BACKLOG
  candidate at closeout.
- **`media-viewer-perf.log` grows without bound** (48 KB in the E2E directory, first line 2026-07-05, last
  2026-09-21). BACKLOG candidate at closeout.
- ~~**Log pruning orders by the local timestamp in the name**~~ — superseded after PR #73 review: pruning orders
  by modification time and never touches the current file (§ 6.1), which removes the DST/timezone mis-ordering.
  A system clock set *back* skews mtimes too: files written under the fast clock carry future mtimes that newer
  sessions never outrank. **Amended after PR #73 review round 2**: an mtime more than 5 minutes ahead of the clock
  sorts as oldest, so those files are pruned first and the previous session survives a relaunch.
- **`SKIP` cannot be set from VS Code's Source Control commit button.** Accepted — the terminal is where a
  false positive is diagnosed.
