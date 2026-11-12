---
name: run-media-viewer
description: Run, start and drive the media_viewer Electron app on Windows, on a throwaway profile, and take screenshots of it. Use when asked to run or start the app, screenshot it, click through a flow in the real app, do a manual smoke test, or check that a change works in the running app rather than in the test suites.
---

Drive the real app with `.claude/skills/run-media-viewer/driver.mjs`. It launches the app the way `npm start` does, on a throwaway profile, and runs one command per stdin line. All paths below are relative to the repo root.

## Prerequisites

Windows, Node, and `npm ci` done (Playwright and Electron come from `devDependencies`). The CLIP model the AI sort uses is cached in `node_modules/@huggingface/transformers/.cache/` after its first download.

## Run (agent path)

A smoke of rating and undo in compare mode with the AI sort, as run and passed (about 40 s):

```bash
node .claude/skills/run-media-viewer/driver.mjs <<'EOF'
# Synthetic folders; never a real media folder (a rating writes the folder's own files).
fixtures
dialog {fixtures}/like
click #likeFolderBrowse
wait window.mediaViewer.customLikeFolder.endsWith('like')
dialog {fixtures}/dislike
click #dislikeFolderBrowse
wait window.mediaViewer.customDislikeFolder.endsWith('dislike')
open {fixtures}/source
expect window.mediaViewer.bulkRated.size === 3 && window.mediaViewer.bulkRated.get('s03.jpg') === 'bad'
click #modeBtnCompare
idle
click #sortPredictionBtn
wait 180000 window.mediaViewer.isSortedByPrediction && !window.mediaViewer.isPredictionSorting
idle
eval window.__pair = [window.mediaViewer.compareLeftFile.name, window.mediaViewer.compareRightFile.name]
eval window.__before = window.__pair.map((n) => window.mediaViewer.bulkRated.get(n) ?? null)
key KeyD
wait window.__pair.every((n) => window.mediaViewer.bulkRated.get(n) === 'good')
idle
ss both-good
key Control+KeyA
wait window.__pair.every((n, i) => (window.mediaViewer.bulkRated.get(n) ?? null) === window.__before[i])
idle
console
close
logs 3
EOF
```

It prints each command, then `PASS`, `ERROR:` or the value, and ends with `done: all passed`. `logs` shows the run's `ML training:`, `AI sort:` and `Quit save:` lines.

What the driver does:
- **Profile.** A fresh empty profile in `%TEMP%\mv-run-profile-*`, deleted at the end. `--copy-real-profile` copies `%APPDATA%\media_viewer` into it first; `--profile <dir>` uses a folder you own; `--keep-profile` keeps it for inspection. The real profile itself is refused.
- **Launch.** The project directory, as `npm start`, so the app runs as `media_viewer` and its logs go to `<profile>\logs`. No `MV_*` variable is inherited.
- **Folder dialog.** Replaced by a queue (`dialog`, `open`). Main's own handler still grants each pick. An empty queue answers Cancel.
- **End.** On end of input it closes like the window's X, which runs the app's close flow, then prints `done: all passed` or `done: N failed`. The exit code is 1 if any `expect` failed or any command errored.

Screenshots land in `%TEMP%\mv-shots\` (override with `SHOT_DIR`).

| Command | What it does |
|---|---|
| `fixtures` | Writes synthetic folders under `{fixtures}` (`%TEMP%\mv-run-fixtures`): `source` (10 images and a `.bulk_rated.json`: `s01`, `s02` good, `s03` bad), `like` (4), `dislike` (4) |
| `open <folder>` | Queues the folder, opens it through `openFolderDialog`, waits for idle, prints the file count |
| `dialog <folder>` | Queues a folder for the next dialog (the Settings Browse buttons, change-folder) |
| `click <css>` | DOM click (not a coordinate click) |
| `key <key>` | A key press, Playwright names: `KeyD`, `Control+KeyA`, `F1`, `Escape` |
| `idle [ms]` | Waits until no render, load or file action is in flight |
| `wait [ms] <js>` | Waits until the expression is true (30 s default) |
| `expect <js>` | Prints `PASS` or `FAIL` for the expression; a FAIL fails the run |
| `eval <js>` / `text <css>` | Prints the value as JSON / the element's text |
| `ss <name>` | Screenshot to `<SHOT_DIR>\<name>.png`. Look at it |
| `console` | Renderer errors and warnings since the last call |
| `logs [n]` | The newest session log's last n lines, and this run's perf-log lines |
| `close` | Closes like the window's X and reports the time |
| `sleep <ms>`, `help` | |

`{fixtures}` in any line expands to the fixtures folder. Lines starting with `#` are comments.

## Run (human path)

`npm start` opens a window on your real profile. Set `MV_USER_DATA_DIR` to a copy of `%APPDATA%\media_viewer` first for anything that migrates stored state (`CLAUDE.md`).

## Test

`npm test` (unit) and `npm run test:e2e` (Playwright, about 12 minutes). This skill does not replace them.

## Gotchas

- **A rating writes the open folder's own files.** `.bulk_rated.json` exists nowhere else, and a profile copy does not cover media folders. Use `fixtures`; never open a real media folder, even with `--copy-real-profile`.
- **The app's CSP refuses `page.waitForFunction` with a string** (no `unsafe-eval`): it builds a function inside the page. `page.evaluate` with a string goes through CDP and works, so `wait` and `idle` poll with it. Pass a function, never a string, if you add a `waitForFunction`.
- **The compare pair is `compareLeftFile` and `compareRightFile`**, not `mediaFiles[currentIndex]` and the next one. Both good and Both bad rate those two.
- **F1 does nothing while no folder is open**: the empty state's key handler passes only undo. Settings controls take a `click` without opening it.
- **The saved folders in a profile copy may be gone.** On 2026-11-12 the real profile's like and dislike folders, and five of its six recent folders, no longer existed, so the AI sort could not run on them. Set the folders through `dialog` and the Browse buttons, as above.
- **Launch the project directory, not `main.js`.** `main.js` alone runs as "Electron", whose profile is the E2E suite's `%APPDATA%\Electron`. Electron 39 also refuses Playwright's `--remote-debugging-port=0`, so the driver launches through `tests/e2e/helpers/electron-wrapper.cmd`.
- **Paths in a heredoc**: use `{fixtures}` and forward slashes. The Bash tool halves backslashes.
- **The first AI sort on a fresh profile trains and loads CLIP**, 10–12 s here, so give its `wait` a long timeout (180000 above).

## Troubleshooting

- **`EvalError: Evaluating a string as JavaScript violates the following Content Security Policy directive`**: a string passed to `page.waitForFunction`. Use `wait`, or pass a function.
- **`driver failed: refusing to run on the real profile`**: `--profile` named `%APPDATA%\media_viewer` (in any letter case). Use `--copy-real-profile`.
- **`FAIL  <expression>  -> false`**: the expression was false; check its starting value with `eval` (for example `baseFolderPath` starts as `''`, not `null`).
