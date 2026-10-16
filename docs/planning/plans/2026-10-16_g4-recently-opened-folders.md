# G4. Recently Opened Folders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G4 (🔵, 3 SP → ~4.5 SP); BACKLOG 🔵 [2026-07-01] "Add 'Recently opened folders' quick-access list"
**Spec**: [2026-10-16-g4-recently-opened-folders-design.md](../../superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md) (committed `96c9c94`, user-approved 2026-10-16; amended at planning — see Premise Corrections 1–6 — and by user ruling D3, Premise Correction 9)
**Created**: 2026-10-16
**Status**: Planned — approved 2026-10-16 with D3 added; execution: subagent-driven
**Last Updated**: 2026-10-16
**Branch**: `g4-recently-opened-folders` (from `main` @ `dd05eed`)
**Trial vehicle**: `typescript-lsp` (REVIEW-QUEUE § 5) — see **Pre-flight**. Note every LSP diagnostic it raises in the Progress Log, with what happened to it; G6 reads it out.

**Goal:** A folder that showed media is listed on the drop zone at the next start and in a ▾ menu beside change-folder while another folder is open; choosing it opens it with no folder dialog; a folder that is gone is dropped with a notice — and nothing widens what the main process does for the renderer.

**Architecture:** A new pure ES module `recent-folders.js` holds the list logic (parse and clamp the stored list, record, remove, serialize) and the click-time decision (`classifyRecentFolder`: grant status × exists → what to do), unit-tested directly. `MediaViewer` keeps the DOM and IPC glue: recording in `loadFolder`, the drop-zone list, the header menu (which owns the keyboard while open), and `openRecentFolder`, which validates on click through the existing guarded IPC. Change-folder's handler body becomes `switchToFolder`, the route the header menu opens through. No `main.js` or `preload.js` change.

**Tech Stack:** Electron 39 renderer (`media-viewer.js`, ES module, no bundler), Vitest 4 (node environment, extract-method tests), Playwright + Electron E2E (`tests/e2e/`), Prettier 3, ESLint 9 flat config.

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. The `PostToolUse` hook formats each edited JS file; lint-staged formats staged files at commit. `docs/` and `*.md` are Prettier-ignored. Code below may wrap differently after formatting — expected.
- **ESLint**: `curly: ['error', 'all']` (braces on **every** `if`/`for` body, single-line included), `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; prefix unused with `_`). The renderer's `htmlSinkGuard`: `innerHTML` takes only a static string; **this feature uses none** — every row is built with `createElement` + `textContent`.
- **No new IPC, no `preload.js` edit** (spec F5). The channels used: `getGrantStatus([path])` → `[true | false | 'unreachable']` or `null` when refused; `checkFolderExists(path)` → `true | false`, or `null` when refused; `openFolderDialog(defaultPath)` → picked path or `null`; `loadFolder(path)`.
- **Vitest runs in the node environment.** `MediaViewer` methods are tested by extracting their source and calling it with a mock `this`. An extracted method runs in the **global** scope: it sees `RecentFolders` only because the test file sets `globalThis.RecentFolders`, `window`/`document`/`localStorage` only through `globalThis`, and every `this.*` it touches must be on the mock context.
- **Glue reaches the module one way only**: `RecentFolders.<name>(…)` (namespace import). Never a bare imported name — an extracted method could not resolve it.
- **Path identity is exact string equality.** No `toLowerCase()`, no normalisation (memory `feedback_no_tolowercase_path_containment`).
- **Listing asks main nothing.** No grant-status, existence or load call from any render path — only `openRecentFolder` asks, on click (spec F7: one offline-share status query holds main ~21 s).
- **Exact strings**:
  - `localStorage` key `recentFolders`; value `{"version":1,"entries":[{"path":…,"openedAt":…}]}`; `MAX_RECENT_FOLDERS = 8`; `MAX_PATH_LENGTH = 4096`.
  - Heading `Recent folders` (both surfaces). Busy row path line `Checking…`. Current tag `current`.
  - ▾ button: text `▾`; `aria-label="Recent folders"`; title `Recent folders` when enabled, `No other recent folders` when disabled.
  - ✕ button: text `✕`; title `Remove from recent folders`; `aria-label` `` `Remove "${name}" from recent folders` ``.
  - Notices: `` `"${name}" no longer exists — removed from recent folders` `` (`warning`); `` `Confirm "${name}" — press Select Folder (security update)` `` (`info`); `` `"${name}" is on a drive that isn't connected` `` (`warning`); `showError("Couldn't open that folder")`; `` showError(`Failed to open folder: ${error.message}`) ``; the existing `'Wait for the move to finish'` (`info`, via `_refuseIfFileOpInFlight`).
  - `logError` payloads: `{ level: 'warn', message: \`Could not save recent folders: ${err.message}\`, source: 'renderer' }`; `{ level: 'warn', message: \`Recent folder check failed (status ${String(status)}, exists ${String(exists)})\`, source: 'renderer' }`.
  - IDs/classes: `#recentFoldersDrop.recent-folders` (inside `#dropZone`); `#recentFoldersAnchor.recent-folders-anchor` › `#recentFoldersBtn.change-folder-btn.recent-folders-btn` + `#recentFoldersMenu.recent-folders-menu` (`role="menu"`); shared `.recent-folders-heading`, `.recent-folders-list` (`<ul>`), `.recent-folder-row` (`<li>`), `.recent-folder-item` (`data-path`; `.current` + `disabled` for the folder on screen in the menu), `.recent-folder-name`, `.recent-folder-path`, `.recent-folder-current`, `.recent-folder-remove`; `.header.menu-open`.
- **Every new test must fail against the code before its step lands** — record the failure message in the Progress Log. A RED test that passes is zero coverage: find out why before continuing. Tests that pass by construction (guards) are labelled where they appear.
- **E2E**: `workers: 1`; `afterEach` null guards; launches share one renderer profile (localStorage survives a launch); each launch gets a fresh grant store; `page.reload()` keeps main's grants (a "restart" for the renderer). The header fades to `opacity: 0` and `pointer-events: none` at rest — add its `.show` class before clicking in it (memory: auto-hidden header). Playwright counts an `opacity: 0` element visible.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Never `--no-verify`. Pre-push runs the full E2E suite.
- **Grep rule (CLAUDE.md § Best Practices)**: when moving or changing a named function or a behaviour a comment describes, grep code, tests **and comments**, and re-read every comment attached to changed code.
- **Commits**: one per task; in subagent-driven mode the **controller** commits (memory `feedback_subagent_commits_vs_memory_hook`). Trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (or the executing model's own line).

## Review Focus

1. **A folder at a drive root** (`D:\`): `basename` returns `''`. Expected: the row shows the full path as its name, not an empty button. Pinned in Task 1 (unit: `folderDisplayName` falls back to the path).
2. **A very long folder name**: the name and path ellipsize; the ✕ stays inside the list, no horizontal overflow on the drop zone. Pinned in Task 2 (E2E: `a long folder name stays inside its row`).
3. **A held Enter that opened the menu**: auto-repeat must not choose the first row. Pinned in Task 3 (unit: `a held Enter chooses nothing`).
4. **Switching from the menu while a video plays**: the video is released and the new folder's image renders, with no error toast — change-folder's reset, now shared. Pinned in Task 4 (E2E: `…even from a playing video`).
5. **A mouse wheel over the open menu**: the document wheel handler would navigate the file behind it (and, on the AI order, record a skip). Expected: nothing changes behind the menu. Pinned in Task 3 (E2E: `…a wheel changes nothing…`).

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `recent-folders.js` | Create | Pure: `MAX_RECENT_FOLDERS`, `MAX_PATH_LENGTH`, `parseRecentFolders`, `recordRecentFolder`, `removeRecentFolder`, `serializeRecentFolders`, `folderDisplayName`, `classifyRecentFolder` (T1) |
| `media-viewer.js` | Modify | Namespace import, `recentFolders`, `_recordRecentFolder`/`_removeRecentFolder`/`_setRecentFolders`, `_buildRecentFolderRows`, `renderRecentFolders`, record in `loadFolder`, render in the constructor and `showDropZone` (T2); the menu: `_hasOtherRecentFolders`, `_updateRecentFoldersButton`, `toggle/open/closeRecentFoldersMenu`, `_renderRecentFoldersMenu`, `_refreshRecentFoldersMenu`, anchor show/hide (T3); `switchToFolder` (with the tournament leave prompt, D3) + `_switchToFolderNow`, `openRecentFolder`, `_openRecentFolderOn`, `_markRecentFolderBusy`, the row click (T4) |
| `index.html` | Modify | `#recentFoldersDrop` in `#dropZone` (T2); `#recentFoldersAnchor` after `#changeFolderBtn` (T3) |
| `styles.css` | Modify | List and row styles (T2); anchor, ▾ button, menu, `.header.menu-open`, current tag (T3) |
| `eslint.config.mjs` | Modify | `recent-folders.js` in block 2c (browser ES modules) (T1) |
| `tests/recent-folders.test.js` | Create | Pure-module tests (T1) |
| `tests/recent-folders-glue.test.js` | Create | Glue tests: persistence, recording, the render source scan (T2); menu keyboard ownership, button state, refresh (T3); the open flow table, `switchToFolder` (T4) |
| `tests/lint-guard.test.js` | Modify | `recent-folders.js` in `RENDERER_FILES` (T1) |
| `tests/like-or-skip-glue.test.js` | Modify | Control test: `_switchToFolderNow` replaces `setupEventListeners` in `EXEMPT`; change-folder tests' `folderCtx` gains `switchToFolder` and `_switchToFolderNow` (T4) |
| `tests/e2e/recent-folders.test.js` | Create | Drop-zone list (T2); header menu (T3); opening (T4) |
| `tests/e2e/helpers/electron-app.js` | Modify | `closeApp` and `launchApp` clear `recentFolders`; `mockFolderDialog` counts opens in `global.__mvDialogCalls` (T2) |
| `tests/e2e/visual-evidence.test.js` | Modify | Opt-in G4 evidence block (T1 before, T5 after) |
| `docs/superpowers/specs/assets/g4-*.png` | Create | `drop-zone-before` (T1); `drop-zone-after`, `header-menu-after` (T5) |
| `CLAUDE.md` | Modify | Architecture tree (T1); State Management + E2E helpers (T2); UI Components (T3); Async Patterns header-actions sentence + the State Management bullet's open flow (T4) |
| `README.md` | Modify | Features list (T5) |
| `docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md` | Modify | Planning amendments (committed with this plan) |
| `docs/README.md`, `docs/planning/plans/README.md` | Modify | This plan under Active Plans / Current Plans (committed with this plan) |

**Live-surface preflight** (plans README step 4) — every live surface asserting a claim G4 changes, diffed against the table above: `CLAUDE.md` § Architecture tree (no `recent-folders.js`) ✅ T1; § E2E helpers bullet (`closeApp`, `mockFolderDialog`) ✅ T2; § Async Patterns "`loadFolder` and the change-folder button (before its reset)" ✅ T4; § UI Components (header controls) ✅ T3; § Git Insights "Tournament Escape + mode-selector clicks both route through `switchMode('single')` → `showTournamentLeavePrompt`" (now also a header folder switch, D3) ✅ T4; `media-viewer.js` constructor comment on `_fileOpInFlight` ("the change-folder button") ✅ T4; `loadFolder`'s opening comment ("The change-folder button refuses before its own reset") ✅ T4; `tests/like-or-skip-glue.test.js` `EXEMPT.setupEventListeners` reason text ✅ T4; `tests/e2e/helpers/electron-app.js` `closeApp` comment ("Don't leak saved folders…") ✅ T2; `README.md` § Features ✅ T5. **Checked, no claim to change**: `PROJECT.md` (no folder-open claims), `docs/ARCHITECTURE.md` § Media Loading Flow ("User clicks 'Select Folder'" — still true; the module tree there omits every extracted module, a known residual from G2), the F1 help overlay (no new shortcut). **Not changed, deliberately**: BACKLOG / WEEKLY / TODO (checked off at closeout).

---

## Premise Corrections Made at Planning

1. **The open menu pins the header instead of closing on its `mouseleave` (spec amended, § 7, E13).** `_setupAutoHide` (`media-viewer.js:2741`) re-arms its 3 s hide only on `mouseenter` and on a mousemove in the top 50 px band. A pointer resting in the menu below the band would fade the header — and the menu, its child — to `opacity: 0` and `pointer-events: none` after 3 s. Crossing the gap between the button and the menu fires the header's `mouseleave` → `hide()` at once. So the open menu adds `.header.menu-open` (opacity 1, pointer-events auto) and removes it on close; it closes on Escape, an outside pointerdown, or a choice — not on `mouseleave`.
2. **The menu stops `wheel` propagation (spec amended, § 7, new E17).** The document wheel handler (`:2690-2733`) navigates whenever the pointer is not over media, so a wheel over the open menu would change the file behind it, and on the AI order a wheel Next records a skip (`nextMedia`).
3. **Text glyphs, no Lucide icons (spec amended, § 7).** The E2E harness stubs Lucide (`createIcons` is a no-op), so icon-only buttons render blank in the committed evidence. `▾` and `✕` render everywhere and need no `createIcons` call.
4. **The ▾ button sits in `#recentFoldersAnchor`** (the `position: relative` wrapper the menu is placed against); the anchor is what `hideDropZone`/`showDropZone` show and hide (spec amended, § 7).
5. **`classifyRecentFolder(status, exists)` and `folderDisplayName(path, basename)` are pure functions in the module** (spec amended, § 4): the § 6 decision table and the drive-root name fallback are tested without IPC or DOM.
6. **The evidence screenshots redact the temp root** (spec amended, § 9.3): E2E folders live under `%TEMP%`, inside the Windows profile, so the shots would commit the profile name; the path text is swapped for `D:\Photos` before each shot (text only, layout unchanged).
7. **Existing tests that the extraction of `switchToFolder` reaches** (measured on `dd05eed`): `tests/like-or-skip-glue.test.js` — the § 4 control test lists `setupEventListeners` in `EXEMPT` for the change-folder handler's `this.mediaFiles = []` (~L261), and "the change-folder button refuses before it wipes anything" runs the handler through `extractHandler("this.changeFolderBtn.addEventListener('click', async () => {")` (~L1175). After the move, the handler holds no assignment and calls `this.switchToFolder`. Both are updated in Task 4 so they keep pinning the same behaviour through the new method. No existing unit test drives `loadFolder`'s non-empty branch or a real `showDropZone`/`hideDropZone` (grep: every context mocks them), so T2–T3's new calls there break none.
8. **`tests/lint-guard.test.js`'s `RENDERER_FILES` omits the browser ES modules** (`like-or-skip.js` included). Task 1 adds `recent-folders.js` to it — that is the RED test for the ESLint block entry. `like-or-skip.js`'s absence is a Residual, not fixed here.
9. **A header folder switch during an unfinished tournament asks first (spec D3, user ruling after a side-agent note, verified on `dd05eed`).** `loadFolder` calls `exitTournamentMode()` and nulls `tournament.engine` without the Save/Discard/Cancel prompt that Escape, the mode buttons and the window close show (`switchMode` → `showTournamentLeavePrompt`). A pick's write is debounced 500 ms (`tournament.js` `PERSIST_DEBOUNCE_MS`, `_schedulePersist`), and `_drain` returns early once `!this.engine`, so a pick made within 500 ms of the switch was never written. Change-folder's OS dialog outlasted the debounce; two clicks on the ▾ menu need not. `switchToFolder` now shows the prompt before its reset and continues through `_switchToFolderNow` (Save & leave flushes first). The note's "one misclick" was overstated (▾ then a row), and the tournament was never lost — the state older than 500 ms stays on disk and resumes.

## Task Ordering

T1 (pure module + "before" evidence) first — the before screenshot must be taken before any renderer change. T2 (record, persist, drop-zone list) before T3 (the menu reuses T2's row builder and `_setRecentFolders`). T4 (open flow) after T3: `openRecentFolder` closes the menu, which T3 defines, and the menu route opens through `switchToFolder`, which T4 extracts. T5 (after evidence, README, branch checks) last. One commit per task.

**Model and effort** (WORKFLOW.md § 1.0):

| | Choice | Why |
|---|---|---|
| SP | 3 → ~5 | T1 0.75 (module, tests, before shot), T2 1 (record, persist, drop-zone list, helpers), T3 1.25 (menu + keyboard ownership), T4 1.5 (open flow, `switchToFolder`, the D3 leave prompt), T5 0.5 (after shots, README, checks). 1.7× — inside the 2× abort line. |
| Execution | **Sonnet 5.5 · `medium`** for T1, T2, T5 (fully spelled out); **Sonnet 5.5 · `high`** for T3 and T4 (the keyboard ownership's close paths, the open flow's guard order and its surface routing — easy to get subtly wrong) | Between the 3–4 and 5–7 SP rows: the plan carries the design, so Sonnet; `high` where verification matters. Escalate to Opus · `medium` for any RED test that unexpectedly passes. |
| Switch | The design ran on Opus; execution needs neither its model nor a high session effort. Subagent-driven picks the model per task; a native run should start a fresh session on Sonnet (it also loads the `typescript-lsp` plugin, see Pre-flight). | |
| Final review | Standard (`high`): the `regression-checker` agent on `media-viewer.js`, then `/code-review high` on the PR **in a separate chat** (memory `feedback_ask_before_in_chat_code_review` — ask first) | WEEKLY's first guess, confirmed: no new IPC, no `preload.js`, and the grant boundary is unchanged. |

---

## Pre-flight: the `typescript-lsp` trial (before Task 1's first code edit)

- [x] **Ask the user** before the global install (WEEKLY G4: "ask first — a global install"): `npm i -g typescript-language-server typescript`. On "no", skip the trial, log it, and continue — it is not a gate.
- [x] Install and enable `typescript-lsp@claude-plugins-official` at **project** scope (through `/plugin`; the user may need to run it). Expected: `.claude/settings.json` `enabledPlugins` gains `"typescript-lsp@claude-plugins-official": true` beside the three existing entries. `.claude/` is a protected path — the write prompts.
- [ ] Start the execution session after enabling (a native run: a fresh session; subagent-driven: confirm in the first implementer's transcript). After the first `.js` edit, look for a `diagnostics` record in the session transcript (`~/.claude/projects/<project-slug>/<session-id>.jsonl` — grep `diagnostics`). If none appears, check the plugin's status in `/plugin` and the Claude Code plugins documentation before concluding it did not run (memory: hook edits take effect late — re-probe). Log the outcome either way.

---

## Task 1: Pure module + "before" evidence

**Files:**
- Create: `recent-folders.js`, `tests/recent-folders.test.js`, `docs/superpowers/specs/assets/g4-drop-zone-before.png`
- Modify: `eslint.config.mjs:160` (block 2c `files`), `tests/lint-guard.test.js:19` (`RENDERER_FILES`), `tests/e2e/visual-evidence.test.js` (append the G4 block, imports), `CLAUDE.md` (Architecture tree)

**Interfaces:**
- Consumes: nothing.
- Produces (all named exports of `recent-folders.js`):
  - `MAX_RECENT_FOLDERS = 8`, `MAX_PATH_LENGTH = 4096`
  - `parseRecentFolders(raw: string|null): {path: string, openedAt: number}[]`
  - `recordRecentFolder(entries, path: string, now: number): entries` (new array)
  - `removeRecentFolder(entries, path: string): entries` (new array)
  - `serializeRecentFolders(entries): string`
  - `folderDisplayName(path: string, basename?: (p: string) => string): string`
  - `classifyRecentFolder(status: unknown, exists: unknown): 'open' | 'missing' | 'regrant' | 'unreachable' | 'error'`

- [x] **Step 1: Capture the "before" screenshot on the unchanged renderer**

Append to `tests/e2e/visual-evidence.test.js`. At the top of the file, add these imports after the existing two:

```js
import { cp, mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
```

At the end of the file:

```js
// G4 recently opened folders (2026-10-16, spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md
// § 9.3): the same scenario on both runs — three folders opened one after another, then a restart (a page
// reload; main keeps its grants) — so the before/after drop-zone pair differs only by the feature. Opt-in, like
// the blocks above. Paths are redacted before each shot: the temp root lives inside the Windows profile, so it
// is replaced by D:\Photos in the path text (text only; layout unchanged). Capture:
// G4_EVIDENCE_STAGE=before|after npx playwright test tests/e2e/visual-evidence.test.js -g "recent folders"
const G4_STAGE = process.env.G4_EVIDENCE_STAGE;
const G4_FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

test.describe('G4 recent folders visual evidence', () => {
    test.skip(!G4_STAGE, 'Opt-in only — set G4_EVIDENCE_STAGE=before|after to (re)capture');

    let electronApp, page, root;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (root) {
            await rm(root, { recursive: true, force: true });
            root = null;
        }
    });

    async function redactPaths(prefix) {
        await page.evaluate((p) => {
            for (const el of document.querySelectorAll('.recent-folder-path')) {
                if (el.textContent.startsWith(p)) {
                    el.textContent = 'D:\\Photos' + el.textContent.slice(p.length);
                }
            }
        }, prefix);
    }

    test('recent folders: the drop zone after a restart, and the header menu', async () => {
        root = await mkdtemp(join(tmpdir(), 'mv-e2e-g4ev-'));
        ({ electronApp, page } = await launchApp());
        for (const name of ['Wallpapers', 'Liked_2', 'Liked_3']) {
            const dir = join(root, name);
            await mkdir(dir);
            await cp(join(G4_FIXTURES, 'normal-320x240.png'), join(dir, 'normal-320x240.png'));
            await loadFolder(page, dir);
            await waitForMedia(page);
        }
        await page.reload();
        await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined');
        await redactPaths(root);
        await page.waitForTimeout(300);
        await captureScreenshot(page, `g4-drop-zone-${G4_STAGE}`);

        if (G4_STAGE === 'after') {
            await loadFolder(page, join(root, 'Liked_3'));
            await waitForMedia(page);
            await page.evaluate(() => document.querySelector('.header').classList.add('show'));
            await page.locator('#recentFoldersBtn').click();
            await page.locator('#recentFoldersMenu').waitFor();
            await redactPaths(root);
            await page.waitForTimeout(300);
            await captureScreenshot(page, 'g4-header-menu-after');
            await page.keyboard.press('Escape');
        }
    });
});
```

Run (PowerShell): `$env:G4_EVIDENCE_STAGE='before'; npx playwright test tests/e2e/visual-evidence.test.js -g "recent folders"; $env:G4_EVIDENCE_STAGE=$null`
Expected: 1 passed; `docs/superpowers/specs/assets/g4-drop-zone-before.png` exists. Look at it (Read tool): the bare drop zone — folder icon, "Select folder to view media files", the subtitle — and nothing else. A plain run (`npx playwright test tests/e2e/visual-evidence.test.js`) reports the G4 test skipped.

- [x] **Step 2: Write the failing module tests**

Create `tests/recent-folders.test.js`:

```js
// G4 recently opened folders (spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md
// §§ 5–6): the pure module, tested directly.
import { describe, it, expect } from 'vitest';
import {
    MAX_RECENT_FOLDERS,
    MAX_PATH_LENGTH,
    parseRecentFolders,
    recordRecentFolder,
    removeRecentFolder,
    serializeRecentFolders,
    folderDisplayName,
    classifyRecentFolder,
} from '../recent-folders.js';

const stored = (entries, version = 1) => JSON.stringify({ version, entries });
const entry = (path, openedAt = 1) => ({ path, openedAt });

describe('parseRecentFolders — validate and clamp (spec § 5)', () => {
    it('reads a valid list in stored order', () => {
        const list = [entry('C:\\a', 2), entry('C:\\b', 1)];
        expect(parseRecentFolders(stored(list))).toEqual(list);
    });

    it.each([
        ['nothing stored', null],
        ['not JSON', '{oops'],
        ['JSON null', 'null'],
        ['a bare array', '[]'],
        ['an unknown version', stored([entry('C:\\a')], 2)],
        ['entries that are not an array', JSON.stringify({ version: 1, entries: {} })],
    ])('reads %s as an empty list', (_label, raw) => {
        expect(parseRecentFolders(raw)).toEqual([]);
    });

    it('drops every invalid entry shape and keeps the valid one', () => {
        const raw = stored([
            null,
            'C:\\a',
            { openedAt: 1 },
            entry(''),
            entry(42),
            { path: 'C:\\b' },
            entry('C:\\c', -1),
            entry('C:\\d', '5'),
            entry('C:\\e', null),
            entry('C:\\ok', 5),
        ]);
        expect(parseRecentFolders(raw)).toEqual([entry('C:\\ok', 5)]);
    });

    it('drops a non-finite openedAt (JSON can spell one: 1e400 parses to Infinity)', () => {
        const raw = '{"version":1,"entries":[{"path":"C:\\\\x","openedAt":1e400},{"path":"C:\\\\y","openedAt":3}]}';
        expect(parseRecentFolders(raw)).toEqual([entry('C:\\y', 3)]);
    });

    it('keeps the first (newest) of duplicate paths', () => {
        expect(parseRecentFolders(stored([entry('C:\\a', 3), entry('C:\\b', 2), entry('C:\\a', 1)]))).toEqual([
            entry('C:\\a', 3),
            entry('C:\\b', 2),
        ]);
    });

    it('compares paths exactly: a case variant is a different folder', () => {
        const list = [entry('C:\\Pics', 2), entry('C:\\pics', 1)];
        expect(parseRecentFolders(stored(list))).toEqual(list);
    });

    it('caps the list at MAX_RECENT_FOLDERS, keeping the newest', () => {
        const list = Array.from({ length: MAX_RECENT_FOLDERS + 2 }, (_, i) => entry(`C:\\f${i}`, 100 - i));
        expect(parseRecentFolders(stored(list))).toEqual(list.slice(0, MAX_RECENT_FOLDERS));
    });

    it('keeps a path of exactly MAX_PATH_LENGTH characters and drops a longer one', () => {
        const atLimit = 'C:\\' + 'x'.repeat(MAX_PATH_LENGTH - 3);
        const over = atLimit + 'y';
        expect(parseRecentFolders(stored([entry(over), entry(atLimit)]))).toEqual([entry(atLimit)]);
    });

    it('keeps only path and openedAt', () => {
        expect(parseRecentFolders(stored([{ path: 'C:\\a', openedAt: 1, name: 'x', extra: true }]))).toEqual([
            entry('C:\\a', 1),
        ]);
    });
});

describe('recordRecentFolder', () => {
    it('puts a new folder first, stamped now', () => {
        expect(recordRecentFolder([entry('C:\\a', 1)], 'C:\\b', 50)).toEqual([entry('C:\\b', 50), entry('C:\\a', 1)]);
    });

    it('moves a listed folder to the front instead of listing it twice', () => {
        expect(recordRecentFolder([entry('C:\\a', 2), entry('C:\\b', 1)], 'C:\\b', 9)).toEqual([
            entry('C:\\b', 9),
            entry('C:\\a', 2),
        ]);
    });

    it('caps at MAX_RECENT_FOLDERS, dropping the oldest', () => {
        const full = Array.from({ length: MAX_RECENT_FOLDERS }, (_, i) => entry(`C:\\f${i}`, 100 - i));
        const result = recordRecentFolder(full, 'C:\\new', 200);
        expect(result).toHaveLength(MAX_RECENT_FOLDERS);
        expect(result[0]).toEqual(entry('C:\\new', 200));
        expect(result.map((e) => e.path)).not.toContain(`C:\\f${MAX_RECENT_FOLDERS - 1}`);
    });

    it('does not mutate its input', () => {
        const input = Object.freeze([Object.freeze(entry('C:\\a', 1))]);
        expect(() => recordRecentFolder(input, 'C:\\b', 2)).not.toThrow();
        expect(input).toEqual([entry('C:\\a', 1)]);
    });

    it.each([
        ['an empty path', ''],
        ['a non-string', 42],
        ['a path over MAX_PATH_LENGTH', 'C:\\' + 'x'.repeat(MAX_PATH_LENGTH)],
    ])('ignores %s', (_label, bad) => {
        const list = [entry('C:\\a', 1)];
        const result = recordRecentFolder(list, bad, 5);
        expect(result).toEqual(list);
        expect(result).not.toBe(list);
    });
});

describe('removeRecentFolder', () => {
    it('removes exactly that path', () => {
        expect(removeRecentFolder([entry('C:\\a'), entry('C:\\b')], 'C:\\a')).toEqual([entry('C:\\b')]);
    });

    it('leaves the list as it was for a path it does not hold, as a copy', () => {
        const list = [entry('C:\\a')];
        const result = removeRecentFolder(list, 'C:\\A');
        expect(result).toEqual(list);
        expect(result).not.toBe(list);
    });
});

describe('serializeRecentFolders', () => {
    it('writes the version-1 envelope that parse reads back', () => {
        const list = [entry('C:\\a', 2), entry('C:\\b', 1)];
        const text = serializeRecentFolders(list);
        expect(JSON.parse(text)).toEqual({ version: 1, entries: list });
        expect(parseRecentFolders(text)).toEqual(list);
    });

    it('writes only path and openedAt', () => {
        expect(JSON.parse(serializeRecentFolders([{ path: 'C:\\a', openedAt: 1, junk: 1 }]))).toEqual({
            version: 1,
            entries: [entry('C:\\a', 1)],
        });
    });
});

describe('folderDisplayName (Review Focus 1)', () => {
    const win = (p) => p.split('\\').filter(Boolean).pop() ?? '';

    it('is the last path segment', () => {
        expect(folderDisplayName('C:\\pics\\Liked_3', win)).toBe('Liked_3');
    });

    it('falls back to the whole path when there is no last segment (a drive root)', () => {
        expect(folderDisplayName('D:\\', () => '')).toBe('D:\\');
    });

    it('falls back to the whole path without a basename function (no Electron API)', () => {
        expect(folderDisplayName('C:\\pics\\Liked_3', undefined)).toBe('C:\\pics\\Liked_3');
    });
});

describe('classifyRecentFolder — the spec § 6 table', () => {
    it.each([
        [true, true, 'open'],
        [true, false, 'missing'],
        [true, null, 'regrant'], // the existence check was refused: as not granted
        [true, undefined, 'error'], // the existence check failed
        [false, undefined, 'regrant'],
        ['unreachable', undefined, 'unreachable'],
        [undefined, undefined, 'error'], // the status query failed or was refused (a null reply)
        ['granted', undefined, 'error'], // main maps statuses to true/false/'unreachable'; anything else is unexpected
    ])('status %s, exists %s → %s', (status, exists, outcome) => {
        expect(classifyRecentFolder(status, exists)).toBe(outcome);
    });
});
```

Also add `'recent-folders.js'` to `RENDERER_FILES` in `tests/lint-guard.test.js:19`:

```js
const RENDERER_FILES = [
    'media-viewer.js',
    'tournament.js',
    'fullscreen.js',
    'ml-training.js',
    'face-detector.js',
    'recent-folders.js',
];
```

- [x] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/recent-folders.test.js tests/lint-guard.test.js`
Expected: `recent-folders.test.js` fails to collect — `Error: Cannot find module '../recent-folders.js'`; `lint-guard.test.js` › "HTML sink guard in recent-folders.js" fails every `flags …` case (`expected [] to have a length of 1`): no ESLint block covers the file yet. Record both in the Progress Log.

- [x] **Step 4: Write the module**

Create `recent-folders.js`:

```js
// Recently opened folders (G4) — pure logic: no DOM, no IPC, no localStorage.
// Spec: docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md
// media-viewer.js imports this file as a namespace (`import * as RecentFolders`), so an extracted-method
// unit test supplies every function through one global (`globalThis.RecentFolders`).
//
// The validation here is hygiene, not a security control: main's grant check on every folder IPC is the
// boundary (spec § 5). A tampered list can only name folders that main then refuses.

export const MAX_RECENT_FOLDERS = 8;
export const MAX_PATH_LENGTH = 4096;
const STORAGE_VERSION = 1;

function isValidPath(p) {
    return typeof p === 'string' && p.length > 0 && p.length <= MAX_PATH_LENGTH;
}

function isValidEntry(e) {
    return (
        e !== null &&
        typeof e === 'object' &&
        isValidPath(e.path) &&
        typeof e.openedAt === 'number' &&
        Number.isFinite(e.openedAt) &&
        e.openedAt >= 0
    );
}

/**
 * The stored list, validated and clamped (spec § 5). Never throws: anything unreadable is an empty list.
 * Paths compare exactly — no case folding (NTFS can keep case-variant folders distinct).
 * @param {string|null} raw - localStorage.getItem('recentFolders')
 * @returns {{path: string, openedAt: number}[]} most recent first
 */
export function parseRecentFolders(raw) {
    if (typeof raw !== 'string') {
        return [];
    }
    let data;
    try {
        data = JSON.parse(raw);
    } catch (_err) {
        return [];
    }
    if (data === null || typeof data !== 'object' || data.version !== STORAGE_VERSION || !Array.isArray(data.entries)) {
        return [];
    }
    const seen = new Set();
    const out = [];
    for (const e of data.entries) {
        if (!isValidEntry(e) || seen.has(e.path)) {
            continue;
        }
        seen.add(e.path);
        out.push({ path: e.path, openedAt: e.openedAt });
        if (out.length === MAX_RECENT_FOLDERS) {
            break;
        }
    }
    return out;
}

/** A new list with `path` first (stamped `now`), any older copy removed, capped. An invalid path changes nothing. */
export function recordRecentFolder(entries, path, now) {
    if (!isValidPath(path)) {
        return entries.slice();
    }
    return [{ path, openedAt: now }, ...entries.filter((e) => e.path !== path)].slice(0, MAX_RECENT_FOLDERS);
}

/** A new list without `path`. */
export function removeRecentFolder(entries, path) {
    return entries.filter((e) => e.path !== path);
}

/** The localStorage value; parseRecentFolders reads it back. */
export function serializeRecentFolders(entries) {
    return JSON.stringify({
        version: STORAGE_VERSION,
        entries: entries.map(({ path, openedAt }) => ({ path, openedAt })),
    });
}

/** The name a row shows: the last path segment, or the whole path when there is none (a drive root). */
export function folderDisplayName(path, basename) {
    const name = typeof basename === 'function' ? basename(path) : '';
    return name || path;
}

/**
 * What a click on a listed folder does (spec § 6), from main's two answers:
 * `status` — getGrantStatus([path])[0]: true, false or 'unreachable' (undefined if the query failed or was refused);
 * `exists` — checkFolderExists(path), asked only when granted: true, false, or null when refused.
 * @returns {'open'|'missing'|'regrant'|'unreachable'|'error'}
 */
export function classifyRecentFolder(status, exists) {
    if (status === true) {
        if (exists === true) {
            return 'open';
        }
        if (exists === false) {
            return 'missing';
        }
        return exists === null ? 'regrant' : 'error';
    }
    if (status === false) {
        return 'regrant';
    }
    return status === 'unreachable' ? 'unreachable' : 'error';
}
```

In `eslint.config.mjs` block 2c (line 160):

```js
        files: [
            'fullscreen.js',
            'tournament-engine.js',
            'tournament.js',
            'ml-training.js',
            'like-or-skip.js',
            'recent-folders.js',
        ],
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/recent-folders.test.js tests/lint-guard.test.js` → all pass. Then `npm run lint` → 0 errors.

- [x] **Step 6: CLAUDE.md architecture tree**

In `CLAUDE.md` § Architecture, after the `like-or-skip.js` line:

```
├── recent-folders.js    # Pure ESM (G4 recent folders): parse/record/remove/serialize the localStorage list (cap 8, exact-path identity), folderDisplayName, classifyRecentFolder (grant status × exists → open/missing/regrant/unreachable/error); imported as a namespace (RecentFolders)
```

- [x] **Step 7: Commit**

```bash
git add recent-folders.js tests/recent-folders.test.js tests/lint-guard.test.js eslint.config.mjs tests/e2e/visual-evidence.test.js docs/superpowers/specs/assets/g4-drop-zone-before.png CLAUDE.md
git commit -m "feat(recent-folders): pure list module and click-time classifier; before screenshot (G4 T1)"
```

---

## Task 2: Record, persist and list on the drop zone

**Files:**
- Modify: `media-viewer.js` (import; constructor ~L294-296 and ~L355; `initializeElements` ~L420; `setupEventListeners` near the drop-zone listeners ~L2182; `loadFolder` success branch ~L3175; `showDropZone` ~L3234; new methods after `showDropZone`), `index.html:122-126`, `styles.css` (after `.drop-subtitle`, ~L569), `tests/e2e/helpers/electron-app.js` (`launchApp`, `closeApp`, `mockFolderDialog`), `CLAUDE.md`
- Create: `tests/recent-folders-glue.test.js`, `tests/e2e/recent-folders.test.js`

**Interfaces:**
- Consumes: `RecentFolders.parseRecentFolders`, `recordRecentFolder`, `removeRecentFolder`, `serializeRecentFolders`, `folderDisplayName` (T1).
- Produces:
  - `this.recentFolders: {path, openedAt}[]`; `this.recentFoldersDrop` (`#recentFoldersDrop`)
  - `_recordRecentFolder(folderPath: string): void`, `_removeRecentFolder(folderPath: string): void`
  - `_setRecentFolders(entries): void` — the only writer of `this.recentFolders` after the constructor; persists, then re-renders (T3 adds the menu refresh)
  - `_buildRecentFolderRows(surface: 'drop'|'menu'): HTMLLIElement[]` — rows with `.recent-folder-item` (`data-path`) and `.recent-folder-remove`; T4 adds the item click
  - `renderRecentFolders(): void`
  - E2E helpers: `global.__mvDialogCalls` (reset to 0 by each `mockFolderDialog`), `recentFolders` cleared by `launchApp` and `closeApp`

- [x] **Step 1: Write the failing glue tests**

Create `tests/recent-folders-glue.test.js`:

```js
// G4 recently opened folders glue (spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md):
// the MediaViewer methods that connect recent-folders.js to the app, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as RecentFolders from '../recent-folders.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// media-viewer.js imports the module as a namespace. An extracted method runs in the global scope, so it
// resolves `RecentFolders` through the global object.
globalThis.RecentFolders = RecentFolders;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** A MediaViewer method as a callable (the technique of like-or-skip-glue.test.js, sync or async). */
function extract(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(([^)]*)\\)\\s*\\{`, 'm'));
    if (!match) {
        throw new Error(`Could not find method: ${name}`);
    }
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') {
            depth++;
        } else if (source[i] === '}' && --depth === 0) {
            const Ctor = match[1] ? AsyncFunction : Function;
            return new Ctor(match[2], source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

const entry = (p, openedAt = 1) => ({ path: p, openedAt });

describe('_setRecentFolders — the one writer: persist, then re-render (spec § 5)', () => {
    const setRecentFolders = extract('_setRecentFolders');
    let origStorage;
    let origWindow;
    beforeEach(() => {
        origStorage = globalThis.localStorage;
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
    });
    afterEach(() => {
        globalThis.localStorage = origStorage;
        globalThis.window = origWindow;
    });

    const ctx = () => ({ recentFolders: [], renderRecentFolders: vi.fn() });

    it('stores the serialized list and re-renders the drop-zone list', () => {
        globalThis.localStorage = { setItem: vi.fn() };
        const c = ctx();
        const entries = [entry('C:\\a', 5)];
        setRecentFolders.call(c, entries);
        expect(c.recentFolders).toBe(entries);
        expect(globalThis.localStorage.setItem).toHaveBeenCalledWith(
            'recentFolders',
            RecentFolders.serializeRecentFolders(entries)
        );
        expect(c.renderRecentFolders).toHaveBeenCalledTimes(1);
    });

    it('a write that throws is logged, and the session list still updates and renders', () => {
        globalThis.localStorage = {
            setItem: vi.fn(() => {
                throw new Error('QuotaExceededError');
            }),
        };
        const c = ctx();
        const entries = [entry('C:\\a', 5)];
        expect(() => setRecentFolders.call(c, entries)).not.toThrow();
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith({
            level: 'warn',
            message: 'Could not save recent folders: QuotaExceededError',
            source: 'renderer',
        });
        expect(c.recentFolders).toBe(entries);
        expect(c.renderRecentFolders).toHaveBeenCalledTimes(1);
    });
});

describe('_recordRecentFolder / _removeRecentFolder', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('records a folder first, stamped now, through _setRecentFolders', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1000);
        const c = { recentFolders: [entry('C:\\a', 1)], _setRecentFolders: vi.fn() };
        extract('_recordRecentFolder').call(c, 'C:\\b');
        expect(c._setRecentFolders).toHaveBeenCalledWith([entry('C:\\b', 1000), entry('C:\\a', 1)]);
    });

    it('removes a folder through _setRecentFolders', () => {
        const c = { recentFolders: [entry('C:\\a'), entry('C:\\b')], _setRecentFolders: vi.fn() };
        extract('_removeRecentFolder').call(c, 'C:\\a');
        expect(c._setRecentFolders).toHaveBeenCalledWith([entry('C:\\b')]);
    });
});

describe('loadFolder records only a folder that showed media (spec § 5)', () => {
    const loadFolder = extract('loadFolder');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        globalThis.window = origWindow;
        vi.restoreAllMocks();
    });

    function withReply(reply) {
        globalThis.window = {
            electronAPI: {
                loadFolder: vi.fn(async () => reply),
                path: { basename: (p) => p.split('\\').pop() },
            },
        };
    }

    function loadCtx(overrides = {}) {
        return {
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            customLikeFolder: '',
            customDislikeFolder: '',
            customSpecialFolder: '',
            isTournamentMode: false,
            tournament: { engine: null },
            mediaFiles: [],
            originalMediaFiles: [],
            moveHistory: [],
            perceptualHashes: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            predictionScores: new Map(),
            sortSimilarityBtn: null,
            showLoadingSpinner: vi.fn(),
            hideLoadingSpinner: vi.fn(),
            showDropZone: vi.fn(),
            hideDropZone: vi.fn(),
            showError: vi.fn(),
            showNotification: vi.fn(),
            exitTournamentMode: vi.fn(),
            cancelBackgroundExtraction: vi.fn(),
            _abortInFlightPredictionSort: vi.fn(),
            _onOrderChanged: vi.fn(),
            loadBulkRatedFile: vi.fn(async () => {}),
            switchToSingleModeUI: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateSortPredictionButton: vi.fn(),
            _recordRecentFolder: vi.fn(),
            ...overrides,
        };
    }

    const file = { name: 'a.png', path: 'C:\\pics\\Liked_3\\a.png', size: 1, type: 'image/png' };

    it('records the folder once its first file is on screen', async () => {
        withReply({ success: true, files: [file] });
        const c = loadCtx();
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c._recordRecentFolder).toHaveBeenCalledTimes(1);
        expect(c._recordRecentFolder).toHaveBeenCalledWith('C:\\pics\\Liked_3');
        expect(c.showMedia.mock.invocationCallOrder[0]).toBeLessThan(
            c._recordRecentFolder.mock.invocationCallOrder[0]
        );
    });

    it('does not record an empty folder', async () => {
        withReply({ success: true, files: [] });
        const c = loadCtx();
        await loadFolder.call(c, 'C:\\pics\\Empty');
        expect(c._recordRecentFolder).not.toHaveBeenCalled();
        expect(c.showDropZone).toHaveBeenCalled();
    });

    it('does not record a folder that failed to load', async () => {
        withReply({ success: false, error: 'Not permitted' });
        const c = loadCtx();
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c._recordRecentFolder).not.toHaveBeenCalled();
    });

    it('does not record when showing the first file throws', async () => {
        withReply({ success: true, files: [file] });
        const c = loadCtx({ showMedia: vi.fn(async () => Promise.reject(new Error('boom'))) });
        await loadFolder.call(c, 'C:\\pics\\Liked_3');
        expect(c._recordRecentFolder).not.toHaveBeenCalled();
        expect(c.showError).toHaveBeenCalledWith('Failed to load folder: boom');
    });
});

describe('listing asks main nothing (spec F7) — guard, passes by construction', () => {
    const RENDER_PATHS = ['renderRecentFolders', '_buildRecentFolderRows'];

    it.each(RENDER_PATHS)('%s makes no grant, existence or load call', (name) => {
        expect(extract(name).toString()).not.toMatch(/getGrantStatus|checkFolderExists|loadFolder\(|switchToFolder\(/);
    });
});
```

Create `tests/e2e/recent-folders.test.js`:

```js
// G4 recently opened folders (spec docs/superpowers/specs/2026-10-16-g4-recently-opened-folders-design.md § 9.2).
// Every folder lives under this test's own mkdtemp root. A "restart" is a page reload: the renderer's
// constructor runs again over the same localStorage, and main keeps its grants.
import { test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { launchApp, closeApp, loadFolder, waitForMedia, mockFolderDialog } from './helpers/electron-app.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

let electronApp;
let page;
let root;

test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mv-e2e-recent-'));
    ({ electronApp, page } = await launchApp());
});

test.afterEach(async () => {
    if (electronApp) {
        await closeApp(electronApp);
    }
    if (root) {
        await rm(root, { recursive: true, force: true });
        root = undefined;
    }
});

/** A folder named `name` under this test's root, holding the named fixtures. */
async function makeFolder(name, files = ['red-1x1.png']) {
    const dir = join(root, name);
    await mkdir(dir, { recursive: true });
    for (const f of files) {
        await cp(join(FIXTURES, f), join(dir, f));
    }
    return dir;
}

async function waitForIdle() {
    await page.waitForFunction(
        () =>
            !window.mediaViewer.isLoading &&
            !window.mediaViewer.mediaNavigationInProgress &&
            !window.mediaViewer._fileOpInFlight
    );
}

/** Open each folder in turn, as the user would one after another (each is granted, as a dialog pick would be). */
async function openFolders(...dirs) {
    for (const dir of dirs) {
        await loadFolder(page, dir);
        await waitForMedia(page);
        await waitForIdle();
    }
}

async function restart() {
    await page.reload();
    await page.waitForFunction(() => typeof window.mediaViewer !== 'undefined');
}

const dialogCalls = () => electronApp.evaluate(() => global.__mvDialogCalls ?? 0);
const dropRows = () => page.locator('#recentFoldersDrop .recent-folder-item');
const dropNames = () => page.locator('#recentFoldersDrop .recent-folder-name').allTextContents();

test.describe('G4 recent folders — the drop-zone list', () => {
    test('a first launch shows no list', async () => {
        await expect(page.locator('#dropZone')).toBeVisible();
        await expect(page.locator('#recentFoldersDrop')).toBeHidden();
    });

    test('a folder that showed media is listed after a restart, newest first', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await expect(page.locator('#recentFoldersDrop')).toBeVisible();
        expect(await dropNames()).toEqual(['Liked_3', 'Wallpapers']);
        await expect(dropRows().first()).toHaveAttribute('title', b);
        await expect(page.locator('#recentFoldersDrop .recent-folder-path').first()).toHaveText(b);
    });

    test('✕ removes a folder from the list and from storage', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await page.locator('#recentFoldersDrop .recent-folder-remove').first().click();
        expect(await dropNames()).toEqual(['Wallpapers']);
        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('recentFolders')).entries.map((e) => e.path)
        );
        expect(stored).toEqual([a]);
        await page.locator('#recentFoldersDrop .recent-folder-remove').first().click();
        await expect(page.locator('#recentFoldersDrop')).toBeHidden();
    });

    test('a folder name is shown as text, never parsed as markup', async () => {
        // Windows forbids < and > in names; an innerHTML render would show this entity as "a&b".
        const odd = await makeFolder('a&amp;b');
        await openFolders(odd);
        await restart();
        expect(await dropNames()).toEqual(['a&amp;b']);
    });

    test('a long folder name stays inside its row (Review Focus 2)', async () => {
        const long = await makeFolder('L'.repeat(100));
        await openFolders(long);
        await restart();
        const fits = await page.evaluate(() => {
            const list = document.querySelector('#recentFoldersDrop .recent-folders-list').getBoundingClientRect();
            const remove = document.querySelector('#recentFoldersDrop .recent-folder-remove').getBoundingClientRect();
            return remove.right <= list.right + 0.5;
        });
        expect(fits).toBe(true);
    });

    test('clicking the list is not a click on the drop zone', async () => {
        const a = await makeFolder('Wallpapers');
        await openFolders(a);
        await restart();
        await mockFolderDialog(electronApp, a);
        await page.locator('#recentFoldersDrop .recent-folders-heading').click();
        expect(await dialogCalls()).toBe(0);
        await expect(page.locator('#dropZone')).toBeVisible();
        // Control: the drop zone outside the list still opens the dialog.
        await page.locator('#dropZone .drop-title').click();
        await expect.poll(dialogCalls).toBe(1);
    });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/recent-folders-glue.test.js`
Expected: the file fails to collect — `Error: Could not find method: _setRecentFolders`.
Run: `npx playwright test tests/e2e/recent-folders.test.js --reporter=line`
Expected: `a first launch shows no list` passes **by construction** (the element does not exist yet, so it is hidden — it guards the after-state, not RED); the other five fail — `#recentFoldersDrop` never becomes visible / `.recent-folders-heading` not found. Record in the Progress Log.

- [x] **Step 3: E2E helper changes**

In `tests/e2e/helpers/electron-app.js`:

`launchApp`, after the `waitForFunction(() => typeof window.mediaViewer !== 'undefined', …)` line:

```js
    // A recent-folders list left by a run that crashed before closeApp (G4): clear it and re-render, so every
    // test starts on the bare drop zone — app-launch.test.js clicks its centre.
    await page.evaluate(() => {
        localStorage.removeItem('recentFolders');
        window.mediaViewer.recentFolders = [];
        window.mediaViewer.renderRecentFolders?.();
    });
```

`closeApp`, the cleanup block:

```js
    // Don't leak saved folders into the next launch: since G1, a saved folder main has not
    // granted raises a re-confirm notice at startup, and E2E launches share one profile. The
    // recent-folders list (G4) would otherwise list folders from earlier tests on the drop zone.
    try {
        const win = electronApp.windows()[0];
        if (win) {
            await win.evaluate(() => {
                for (const k of ['customLikeFolder', 'customDislikeFolder', 'customSpecialFolder', 'recentFolders']) {
                    localStorage.removeItem(k);
                }
            });
        }
```

`mockFolderDialog`:

```js
export async function mockFolderDialog(electronApp, returnPath) {
    await electronApp.evaluate(({ ipcMain }, folderPath) => {
        ipcMain.removeHandler('open-folder-dialog');
        // How often the dialog opened since this mock was installed (G4: "no dialog" is asserted directly).
        global.__mvDialogCalls = 0;
        ipcMain.handle('open-folder-dialog', async (_event, defaultPath) => {
            global.__mvDialogCalls += 1;
            // Where the dialog would have opened (G1 re-pick opens it at the saved folder).
            global.__mvLastDialogDefaultPath = defaultPath;
            // A real pick grants the folder (G1); mirror that so later IPC on it is allowed.
            await global.__mvGrants?.grant(folderPath);
            return folderPath;
        });
    }, returnPath);
}
```

- [x] **Step 4: Markup and styles**

`index.html`, the drop zone (lines 122-126):

```html
            <div class="drop-zone" id="dropZone">
                <div class="drop-icon"><i data-lucide="folder"></i></div>
                <div class="drop-title">Select folder to view media files</div>
                <div class="drop-subtitle">Supports: JPG, PNG, GIF, MP4, WebM, MOV</div>
                <!-- Recently opened folders (G4): filled by renderRecentFolders(); hidden while empty. -->
                <div class="recent-folders" id="recentFoldersDrop" style="display: none">
                    <div class="recent-folders-heading">Recent folders</div>
                    <ul class="recent-folders-list"></ul>
                </div>
            </div>
```

`styles.css`, after the `.drop-subtitle` rule:

```css
/* Recently opened folders (G4): the drop-zone list; the header menu (below .change-folder-btn) shares
   the heading, list and row styles. */
.recent-folders {
    margin-top: var(--space-6);
    width: min(480px, 90%);
    flex-direction: column;
    gap: var(--space-2);
    cursor: default;
}

.recent-folders-heading {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.recent-folders-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.recent-folder-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
}

.recent-folder-item {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.recent-folder-item:hover:not(:disabled),
.recent-folder-item:focus-visible {
    background: rgba(0, 120, 212, 0.15);
    border-color: var(--color-primary-400);
    outline: none;
}

.recent-folder-item:disabled {
    cursor: default;
    opacity: 0.6;
}

.recent-folder-name,
.recent-folder-path {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.recent-folder-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
}

.recent-folder-path {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
}

.recent-folder-remove {
    flex: none;
    width: 32px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
}

.recent-folder-remove:hover,
.recent-folder-remove:focus-visible {
    color: var(--text-primary);
    border-color: var(--border-default);
    outline: none;
}
```

(`display` is not set on `.recent-folders`: `renderRecentFolders()` sets `flex` or `none` inline.)

- [x] **Step 5: The glue**

`media-viewer.js`:

Import (after the `LikeOrSkip` line 4):

```js
import * as RecentFolders from './recent-folders.js';
```

Constructor, after `this.customSpecialFolder = …` (~L296):

```js
        // Recently opened folders (G4): validated and clamped like the prefs above; a corrupted value reads as an
        // empty list. Hygiene only — main's grant check on every folder IPC is the boundary (spec § 5).
        this.recentFolders = RecentFolders.parseRecentFolders(localStorage.getItem('recentFolders'));
```

Constructor, after `this.updateSpecialButtonsState();` (~L356):

```js
        // The drop zone is visible at startup (index.html), so its recent-folders list renders now (G4).
        this.renderRecentFolders();
```

`initializeElements`, after `this.changeFolderBtn = …`:

```js
        this.recentFoldersDrop = document.getElementById('recentFoldersDrop');
```

`setupEventListeners`, after the drop zone's `drop` listener (~L2197):

```js
        if (this.recentFoldersDrop) {
            // The list sits inside the drop zone, whose click opens the dialog: a click on the list is not
            // a click on the drop zone (G4 spec F3).
            this.recentFoldersDrop.addEventListener('click', (e) => e.stopPropagation());
        }
```

`loadFolder`, the non-empty success branch, right after `this.updateFolderInfo();`:

```js
            // G4: only a folder that showed media is worth reopening (spec § 5).
            this._recordRecentFolder(folderPath);
```

`showDropZone`, right after `this.dropZone.style.display = 'flex';`:

```js
        this.renderRecentFolders();
```

New methods, after `showDropZone()`:

```js
    // G4 (spec § 5): the list changes only through these three. A write that throws (quota, a blocked
    // accessor) is logged; the session list still updates.
    _recordRecentFolder(folderPath) {
        this._setRecentFolders(RecentFolders.recordRecentFolder(this.recentFolders, folderPath, Date.now()));
    }

    _removeRecentFolder(folderPath) {
        this._setRecentFolders(RecentFolders.removeRecentFolder(this.recentFolders, folderPath));
    }

    _setRecentFolders(entries) {
        this.recentFolders = entries;
        try {
            localStorage.setItem('recentFolders', RecentFolders.serializeRecentFolders(entries));
        } catch (err) {
            window.electronAPI?.logError?.({
                level: 'warn',
                message: `Could not save recent folders: ${err.message}`,
                source: 'renderer',
            });
        }
        this.renderRecentFolders();
    }

    // One row per entry, for the drop-zone list ('drop') or the header menu ('menu'): the folder button (name;
    // full path, ellipsized, title = full path) and a sibling ✕ button. Text only — no markup is ever built
    // from a path (spec § 7). In the menu the folder on screen is marked current and disabled.
    _buildRecentFolderRows(surface) {
        return this.recentFolders.map(({ path: folderPath }) => {
            const name = RecentFolders.folderDisplayName(folderPath, window.electronAPI?.path?.basename);
            const isCurrent = surface === 'menu' && folderPath === this.baseFolderPath;

            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'recent-folder-item';
            item.title = folderPath;
            item.dataset.path = folderPath;
            if (surface === 'menu') {
                item.setAttribute('role', 'menuitem');
            }
            const nameEl = document.createElement('span');
            nameEl.className = 'recent-folder-name';
            nameEl.textContent = name;
            const pathEl = document.createElement('span');
            pathEl.className = 'recent-folder-path';
            pathEl.textContent = folderPath;
            item.append(nameEl, pathEl);
            if (isCurrent) {
                item.disabled = true;
                item.classList.add('current');
                const tag = document.createElement('span');
                tag.className = 'recent-folder-current';
                tag.textContent = 'current';
                item.append(tag);
            }

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'recent-folder-remove';
            remove.textContent = '✕';
            remove.title = 'Remove from recent folders';
            remove.setAttribute('aria-label', `Remove "${name}" from recent folders`);
            remove.addEventListener('click', () => this._removeRecentFolder(folderPath));

            const row = document.createElement('li');
            row.className = 'recent-folder-row';
            row.append(item, remove);
            return row;
        });
    }

    // The drop-zone list (spec § 7): hidden when empty, so a first launch looks as before. Runs at init, from
    // showDropZone() and after every change. It asks main nothing: a folder is checked when it is chosen,
    // never when it is listed — one status query on an offline share holds main ~21 s (spec F7).
    renderRecentFolders() {
        const container = this.recentFoldersDrop;
        if (!container) {
            return;
        }
        container.querySelector('.recent-folders-list').replaceChildren(...this._buildRecentFolderRows('drop'));
        container.style.display = this.recentFolders.length > 0 ? 'flex' : 'none';
    }
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/recent-folders-glue.test.js` → all pass. Then `npx vitest run` → the full unit suite green.
Run: `npx playwright test tests/e2e/recent-folders.test.js tests/e2e/app-launch.test.js --reporter=line` → all pass.

- [x] **Step 7: CLAUDE.md**

§ State Management, a new bullet after the Like-or-skip (G2) bullet:

```
- **Recently opened folders (G4)**: `this.recentFolders` (localStorage `recentFolders`, `{version:1, entries:[{path, openedAt}]}`, parsed and clamped by `RecentFolders.parseRecentFolders`, cap 8, exact-path identity) is recorded only by `loadFolder`'s non-empty success branch and changed only through `_setRecentFolders` (persist in try/catch → re-render). Rendering asks main nothing — a status query on an offline share holds main ~21 s; a folder is checked when it is chosen. The validation is hygiene; main's `kinds.grantedPath` is the boundary.
```

§ Testing (E2E) Helpers bullet — append: `` `closeApp` also clears `recentFolders`, and `launchApp` clears it at start; `mockFolderDialog` counts opens in `global.__mvDialogCalls` (reset on each install). ``

- [x] **Step 8: Commit**

```bash
git add media-viewer.js index.html styles.css tests/recent-folders-glue.test.js tests/e2e/recent-folders.test.js tests/e2e/helpers/electron-app.js CLAUDE.md
git commit -m "feat(recent-folders): record loaded folders and list them on the drop zone (G4 T2)"
```

---

## Task 3: The header ▾ menu

**Files:**
- Modify: `index.html` (after `#changeFolderBtn`, ~L62), `styles.css` (after `.change-folder-btn:hover`, ~L811), `media-viewer.js` (constructor; `initializeElements`; `setupEventListeners`; `hideDropZone`; `showDropZone`; `_setRecentFolders`; new methods after `renderRecentFolders`), `tests/recent-folders-glue.test.js`, `tests/e2e/recent-folders.test.js`, `CLAUDE.md`

**Interfaces:**
- Consumes: `_buildRecentFolderRows('menu')`, `_setRecentFolders`, `this.recentFolders`, `this.baseFolderPath`, `this.header` (T2 / existing).
- Produces:
  - `this.recentFoldersAnchor`, `this.recentFoldersBtn`, `this.recentFoldersMenu`; `this._recentMenuCleanup: (() => void) | null` — non-null exactly while the menu is open
  - `_hasOtherRecentFolders(): boolean`, `_updateRecentFoldersButton(): void`
  - `toggleRecentFoldersMenu()`, `openRecentFoldersMenu()`, `closeRecentFoldersMenu()` (idempotent; the one close path), `_renderRecentFoldersMenu()`, `_refreshRecentFoldersMenu()`

- [x] **Step 1: Write the failing tests**

In `tests/recent-folders-glue.test.js`, update the `_setRecentFolders` describe's `ctx` and its first test (the method gains two calls in this task):

```js
    const ctx = () => ({
        recentFolders: [],
        renderRecentFolders: vi.fn(),
        _updateRecentFoldersButton: vi.fn(),
        _refreshRecentFoldersMenu: vi.fn(),
    });
```

and in `stores the serialized list and re-renders the drop-zone list`, after the `renderRecentFolders` assertion:

```js
        expect(c._updateRecentFoldersButton).toHaveBeenCalledTimes(1);
        expect(c._refreshRecentFoldersMenu).toHaveBeenCalledTimes(1);
```

Extend the source-scan guard's list:

```js
    const RENDER_PATHS = ['renderRecentFolders', '_buildRecentFolderRows', '_renderRecentFoldersMenu', 'openRecentFoldersMenu'];
```

Append:

```js
describe('the ▾ button (spec § 7)', () => {
    const update = extract('_updateRecentFoldersButton');
    const btnCtx = (recentFolders, baseFolderPath) => ({
        recentFolders,
        baseFolderPath,
        recentFoldersBtn: { disabled: false, title: '' },
        _hasOtherRecentFolders: extract('_hasOtherRecentFolders'),
    });

    it('is disabled, and says why, when the only listed folder is the one on screen', () => {
        const c = btnCtx([entry('C:\\a')], 'C:\\a');
        update.call(c);
        expect(c.recentFoldersBtn).toEqual({ disabled: true, title: 'No other recent folders' });
    });

    it('is enabled when another folder is listed', () => {
        const c = btnCtx([entry('C:\\a'), entry('C:\\b')], 'C:\\a');
        update.call(c);
        expect(c.recentFoldersBtn).toEqual({ disabled: false, title: 'Recent folders' });
    });

    it('is disabled with an empty list', () => {
        const c = btnCtx([], '');
        update.call(c);
        expect(c.recentFoldersBtn.disabled).toBe(true);
    });
});

describe('the header menu owns the keyboard while open, and lets go on every close (spec § 7, § 11)', () => {
    const openMenu = extract('openRecentFoldersMenu');
    const closeMenu = extract('closeRecentFoldersMenu');
    let origDocument;
    let listeners;
    beforeEach(() => {
        origDocument = globalThis.document;
        listeners = new Map();
        globalThis.document = {
            activeElement: null,
            addEventListener: vi.fn((type, fn, capture) => listeners.set(`${type}:${capture}`, fn)),
            removeEventListener: vi.fn((type, fn, capture) => {
                if (listeners.get(`${type}:${capture}`) === fn) {
                    listeners.delete(`${type}:${capture}`);
                }
            }),
        };
    });
    afterEach(() => {
        globalThis.document = origDocument;
    });

    function menuCtx(recentFolders = [entry('C:\\a'), entry('C:\\b')]) {
        const rows = [
            { click: vi.fn(), focus: vi.fn() },
            { click: vi.fn(), focus: vi.fn() },
        ];
        for (const r of rows) {
            r.focus.mockImplementation(() => {
                globalThis.document.activeElement = r;
            });
        }
        const c = {
            _recentMenuCleanup: null,
            recentFolders,
            baseFolderPath: 'C:\\a',
            recentFoldersMenu: {
                style: { display: 'none' },
                querySelectorAll: () => rows,
                querySelector: () => rows[0],
                contains: (t) => rows.includes(t),
            },
            recentFoldersBtn: { setAttribute: vi.fn(), contains: () => false },
            header: { classList: { add: vi.fn(), remove: vi.fn() } },
            _renderRecentFoldersMenu: vi.fn(),
            _hasOtherRecentFolders: extract('_hasOtherRecentFolders'),
        };
        c.closeRecentFoldersMenu = () => closeMenu.call(c);
        return { c, rows };
    }
    const key = (k, extra = {}) => ({
        key: k,
        repeat: false,
        shiftKey: false,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
        ...extra,
    });
    const keydown = (e) => listeners.get('keydown:true')(e);

    it('opening adds three capture listeners, pins the header and focuses the first row', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        expect([...listeners.keys()].sort()).toEqual(['keydown:true', 'keyup:true', 'pointerdown:true']);
        expect(c.header.classList.add).toHaveBeenCalledWith('menu-open');
        expect(c.recentFoldersMenu.style.display).toBe('flex');
        expect(c.recentFoldersBtn.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
        expect(c._renderRecentFoldersMenu).toHaveBeenCalledTimes(1);
        expect(rows[0].focus).toHaveBeenCalled();
    });

    it('closing removes exactly those listeners and unpins; a second close does nothing', () => {
        const { c } = menuCtx();
        openMenu.call(c);
        c.closeRecentFoldersMenu();
        expect(listeners.size).toBe(0);
        expect(c._recentMenuCleanup).toBeNull();
        expect(c.header.classList.remove).toHaveBeenCalledWith('menu-open');
        expect(c.recentFoldersMenu.style.display).toBe('none');
        expect(c.recentFoldersBtn.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'false');
        const removals = globalThis.document.removeEventListener.mock.calls.length;
        c.closeRecentFoldersMenu();
        expect(globalThis.document.removeEventListener.mock.calls.length).toBe(removals);
    });

    it('does not open when nothing but the folder on screen is listed', () => {
        const { c } = menuCtx([entry('C:\\a')]);
        openMenu.call(c);
        expect(listeners.size).toBe(0);
        expect(c._recentMenuCleanup).toBeNull();
    });

    it('a rating key is swallowed and the menu stays open', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        const e = key('q');
        keydown(e);
        expect(e.preventDefault).toHaveBeenCalled();
        expect(e.stopImmediatePropagation).toHaveBeenCalled();
        expect(listeners.size).toBe(3);
        expect(rows[0].click).not.toHaveBeenCalled();
    });

    it('keyup is swallowed too', () => {
        const { c } = menuCtx();
        openMenu.call(c);
        const e = key('q');
        listeners.get('keyup:true')(e);
        expect(e.stopImmediatePropagation).toHaveBeenCalled();
    });

    it('Escape closes it', () => {
        const { c } = menuCtx();
        openMenu.call(c);
        keydown(key('Escape'));
        expect(listeners.size).toBe(0);
    });

    it('arrows and Tab move focus, wrapping; Enter chooses the focused row', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        expect(globalThis.document.activeElement).toBe(rows[0]);
        keydown(key('ArrowDown'));
        expect(globalThis.document.activeElement).toBe(rows[1]);
        keydown(key('Tab'));
        expect(globalThis.document.activeElement).toBe(rows[0]);
        keydown(key('ArrowUp'));
        expect(globalThis.document.activeElement).toBe(rows[1]);
        keydown(key('Tab', { shiftKey: true }));
        expect(globalThis.document.activeElement).toBe(rows[0]);
        keydown(key('Enter'));
        expect(rows[0].click).toHaveBeenCalledTimes(1);
    });

    it('a held Enter chooses nothing (Review Focus 3)', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        keydown(key('Enter', { repeat: true }));
        keydown(key(' ', { repeat: true }));
        expect(rows[0].click).not.toHaveBeenCalled();
    });

    it('a pointerdown outside closes it; inside does not', () => {
        const { c, rows } = menuCtx();
        openMenu.call(c);
        listeners.get('pointerdown:true')({ target: rows[1] });
        expect(listeners.size).toBe(3);
        listeners.get('pointerdown:true')({ target: {} });
        expect(listeners.size).toBe(0);
    });
});

describe('_refreshRecentFoldersMenu — after the list changed', () => {
    const refresh = extract('_refreshRecentFoldersMenu');
    const refreshCtx = (open, recentFolders) => ({
        _recentMenuCleanup: open ? vi.fn() : null,
        recentFolders,
        baseFolderPath: 'C:\\a',
        recentFoldersMenu: { querySelector: () => ({ focus: vi.fn() }) },
        _hasOtherRecentFolders: extract('_hasOtherRecentFolders'),
        _renderRecentFoldersMenu: vi.fn(),
        closeRecentFoldersMenu: vi.fn(),
    });

    it('does nothing while the menu is closed', () => {
        const c = refreshCtx(false, [entry('C:\\a'), entry('C:\\b')]);
        refresh.call(c);
        expect(c._renderRecentFoldersMenu).not.toHaveBeenCalled();
        expect(c.closeRecentFoldersMenu).not.toHaveBeenCalled();
    });

    it('rebuilds the open menu while another folder is left', () => {
        const c = refreshCtx(true, [entry('C:\\a'), entry('C:\\b')]);
        refresh.call(c);
        expect(c._renderRecentFoldersMenu).toHaveBeenCalledTimes(1);
        expect(c.closeRecentFoldersMenu).not.toHaveBeenCalled();
    });

    it('closes the menu when only the folder on screen is left', () => {
        const c = refreshCtx(true, [entry('C:\\a')]);
        refresh.call(c);
        expect(c.closeRecentFoldersMenu).toHaveBeenCalledTimes(1);
        expect(c._renderRecentFoldersMenu).not.toHaveBeenCalled();
    });
});
```

In `tests/e2e/recent-folders.test.js`, extend the imports — `readdir` joins the `fs/promises` import (`import { cp, mkdir, mkdtemp, readdir, rm } from 'fs/promises';`) and `seedLocalStorage` joins the helpers import — then, after the `dropNames` helper:

```js
const revealHeader = () => page.evaluate(() => document.querySelector('.header').classList.add('show'));
const menuNames = () => page.locator('#recentFoldersMenu .recent-folder-name').allTextContents();
```

and append:

```js
test.describe('G4 recent folders — the header menu', () => {
    test('the ▾ button is disabled while the only recent folder is the one on screen', async () => {
        const a = await makeFolder('Wallpapers');
        await openFolders(a);
        await expect(page.locator('#recentFoldersBtn')).toBeVisible();
        await expect(page.locator('#recentFoldersBtn')).toBeDisabled();
        await expect(page.locator('#recentFoldersBtn')).toHaveAttribute('title', 'No other recent folders');
    });

    test('the menu lists the other folders, the one on screen marked current; a click outside closes it', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await expect(page.locator('#recentFoldersMenu')).toBeVisible();
        expect(await menuNames()).toEqual(['Liked_3', 'Wallpapers']);
        const items = page.locator('#recentFoldersMenu .recent-folder-item');
        await expect(items.nth(0)).toBeDisabled();
        await expect(items.nth(0).locator('.recent-folder-current')).toHaveText('current');
        await expect(items.nth(1)).toBeEnabled();
        await expect(items.nth(1)).toBeFocused();
        await page.locator('#folderInfo').click();
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
    });

    test('✕ in the menu removes a folder; with nothing else left the menu closes', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await page.locator('#recentFoldersMenu .recent-folder-remove').nth(1).click();
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
        await expect(page.locator('#recentFoldersBtn')).toBeDisabled();
        const stored = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('recentFolders')).entries.map((e) => e.path)
        );
        expect(stored).toEqual([b]);
    });

    test('while the menu is open a rating key moves nothing, a wheel changes nothing, and Escape closes it (Review Focus 5)', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3', ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        const likeDir = join(root, 'liked');
        await mkdir(likeDir);
        await seedLocalStorage(page, { customLikeFolder: likeDir });
        await openFolders(a, b);
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await expect(page.locator('#recentFoldersMenu')).toBeVisible();

        await page.keyboard.press('q');
        const box = await page.locator('#recentFoldersMenu').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(500); // past the wheel debounce and a move's first await
        expect(await page.evaluate(() => window.mediaViewer.currentIndex)).toBe(0);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
        expect(await readdir(likeDir)).toEqual([]);

        await page.keyboard.press('Escape');
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
        expect(await page.evaluate(() => window.mediaViewer.isCompareMode || window.mediaViewer.isTournamentMode)).toBe(
            false
        );

        // Control: with the menu closed, the same key moves the file.
        await page.keyboard.press('q');
        await expect.poll(() => readdir(likeDir)).toHaveLength(1);
    });

    test('the header stays visible while the menu is open, past the auto-hide delay', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        const btn = await page.locator('#recentFoldersBtn').boundingBox();
        await page.mouse.move(btn.x + btn.width / 2, 10); // the top band: the header's own show(), which arms its 3 s hide
        await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
        await expect(page.locator('#recentFoldersMenu')).toBeVisible();
        const row = await page.locator('#recentFoldersMenu .recent-folder-item').nth(1).boundingBox();
        const pt = { x: row.x + row.width / 2, y: row.y + row.height / 2 };
        await page.mouse.move(pt.x, pt.y); // resting in the menu, below the band
        await page.waitForTimeout(4000); // the 3 s hide plus its opacity transition
        const state = await page.evaluate(
            (p) => ({
                opacity: getComputedStyle(document.querySelector('.header')).opacity,
                hit: document.elementFromPoint(p.x, p.y)?.closest('.recent-folder-item') != null,
            }),
            pt
        );
        expect(state).toEqual({ opacity: '1', hit: true });
    });
});
```

(`hit` uses `!= null`: `elementFromPoint` or `closest` may return `null`, and the optional chain yields `undefined`; `eqeqeq` is configured `{ null: 'ignore' }`, so this passes lint. `elementFromPoint` skips `pointer-events: none` elements, which is what makes `hit` discriminate.)

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/recent-folders-glue.test.js`
Expected: the file fails to collect — `Error: Could not find method: _updateRecentFoldersButton`.
Run: `npx playwright test tests/e2e/recent-folders.test.js -g "header menu" --reporter=line`
Expected: 5 failures — `#recentFoldersBtn` not found. Record in the Progress Log.

- [x] **Step 3: Markup and styles**

`index.html`, right after the `#changeFolderBtn` `</button>`:

```html
                <!-- Recently opened folders (G4): the ▾ beside change-folder and its menu. The anchor is the
                     menu's positioning box and is what hideDropZone()/showDropZone() show and hide. -->
                <div class="recent-folders-anchor" id="recentFoldersAnchor" style="display: none">
                    <button
                        class="change-folder-btn recent-folders-btn"
                        id="recentFoldersBtn"
                        type="button"
                        title="Recent folders"
                        aria-label="Recent folders"
                        aria-haspopup="menu"
                        aria-expanded="false"
                    >
                        ▾
                    </button>
                    <div class="recent-folders-menu" id="recentFoldersMenu" role="menu" style="display: none">
                        <div class="recent-folders-heading">Recent folders</div>
                        <ul class="recent-folders-list"></ul>
                    </div>
                </div>
```

`styles.css`, after `.change-folder-btn:hover`:

```css
/* Recently opened folders (G4): the ▾ beside change-folder and its menu. */
.recent-folders-anchor {
    position: relative;
    display: inline-flex;
}

.recent-folders-btn {
    padding: var(--space-2) var(--space-3);
}

.recent-folders-btn:disabled {
    opacity: 0.4;
    cursor: default;
}

.recent-folders-btn:disabled:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--border-default);
    color: var(--text-primary);
    box-shadow: none;
}

.recent-folders-menu {
    position: absolute;
    top: calc(100% + var(--space-2));
    right: 0;
    width: 360px;
    max-width: calc(100vw - 2 * var(--space-4));
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur-heavy);
    -webkit-backdrop-filter: var(--glass-blur-heavy);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-dropdown);
}

.recent-folder-item.current .recent-folder-name {
    padding-right: 64px;
}

.recent-folder-current {
    position: absolute;
    top: var(--space-2);
    right: var(--space-3);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
}

/* The open menu pins the header (G4 planning amendment): the auto-hide timer re-arms only in the top band,
   so a pointer resting in the menu would otherwise fade both out after 3 s. */
.header.menu-open {
    opacity: 1;
    pointer-events: auto;
}
```

- [x] **Step 4: The glue**

Constructor, after the `this.recentFolders = …` line:

```js
        this._recentMenuCleanup = null; // set exactly while #recentFoldersMenu is open: removes its listeners
```

`initializeElements`, after `this.recentFoldersDrop = …`:

```js
        this.recentFoldersAnchor = document.getElementById('recentFoldersAnchor');
        this.recentFoldersBtn = document.getElementById('recentFoldersBtn');
        this.recentFoldersMenu = document.getElementById('recentFoldersMenu');
```

`setupEventListeners`, after the `recentFoldersDrop` listener:

```js
        if (this.recentFoldersBtn) {
            this.recentFoldersBtn.addEventListener('click', () => this.toggleRecentFoldersMenu());
        }
        if (this.recentFoldersMenu) {
            // The document wheel handler navigates: over the open menu it would change the file behind it (and on
            // the AI order record a skip). The menu never scrolls — 8 rows at most.
            this.recentFoldersMenu.addEventListener('wheel', (e) => e.stopPropagation());
        }
```

`hideDropZone`, after the change-folder button block:

```js
        if (this.recentFoldersAnchor) {
            this.recentFoldersAnchor.style.display = 'inline-flex';
            this._updateRecentFoldersButton();
        }
```

`showDropZone`, after the change-folder button block:

```js
        this.closeRecentFoldersMenu();
        if (this.recentFoldersAnchor) {
            this.recentFoldersAnchor.style.display = 'none';
        }
```

`_setRecentFolders`, after `this.renderRecentFolders();`:

```js
        this._updateRecentFoldersButton();
        this._refreshRecentFoldersMenu();
```

New methods, after `renderRecentFolders()`:

```js
    // The ▾ button is enabled only when the menu would list a folder other than the one on screen.
    _hasOtherRecentFolders() {
        return this.recentFolders.some((entry) => entry.path !== this.baseFolderPath);
    }

    _updateRecentFoldersButton() {
        if (!this.recentFoldersBtn) {
            return;
        }
        const enabled = this._hasOtherRecentFolders();
        this.recentFoldersBtn.disabled = !enabled;
        this.recentFoldersBtn.title = enabled ? 'Recent folders' : 'No other recent folders';
    }

    toggleRecentFoldersMenu() {
        if (this._recentMenuCleanup) {
            this.closeRecentFoldersMenu();
        } else {
            this.openRecentFoldersMenu();
        }
    }

    // The header menu (spec § 7). While open it owns the keyboard — capture-phase document listeners, the
    // .bulk-dislike-modal pattern — so a rating key cannot move a file behind it; and it pins the header
    // (.menu-open): the header's auto-hide timer re-arms only in the top band, so a pointer resting in the menu
    // would otherwise fade both out after 3 s (planning amendment).
    openRecentFoldersMenu() {
        const menu = this.recentFoldersMenu;
        if (!menu || this._recentMenuCleanup || !this._hasOtherRecentFolders()) {
            return;
        }
        this._renderRecentFoldersMenu();
        menu.style.display = 'flex';
        this.recentFoldersBtn.setAttribute('aria-expanded', 'true');
        this.header.classList.add('menu-open');

        const swallow = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
        };
        const onKeydown = (e) => {
            swallow(e);
            const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
            const at = buttons.indexOf(document.activeElement);
            if (e.key === 'Escape') {
                this.closeRecentFoldersMenu();
            } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
                buttons[(at + 1) % buttons.length]?.focus();
            } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                buttons[(at <= 0 ? buttons.length : at) - 1]?.focus();
            } else if (e.repeat) {
                // a held Enter (the one that opened the menu) chooses nothing
            } else if ((e.key === 'Enter' || e.key === ' ') && at !== -1) {
                buttons[at].click();
            }
        };
        const onPointerDown = (e) => {
            if (!menu.contains(e.target) && !this.recentFoldersBtn.contains(e.target)) {
                this.closeRecentFoldersMenu();
            }
        };
        document.addEventListener('keydown', onKeydown, true);
        document.addEventListener('keyup', swallow, true);
        document.addEventListener('pointerdown', onPointerDown, true);
        this._recentMenuCleanup = () => {
            document.removeEventListener('keydown', onKeydown, true);
            document.removeEventListener('keyup', swallow, true);
            document.removeEventListener('pointerdown', onPointerDown, true);
        };
        menu.querySelector('button:not(:disabled)')?.focus();
    }

    // The one close path (spec § 11): every way out comes here, so the capture listeners never outlive the menu.
    // Idempotent.
    closeRecentFoldersMenu() {
        if (!this._recentMenuCleanup) {
            return;
        }
        this._recentMenuCleanup();
        this._recentMenuCleanup = null;
        this.recentFoldersMenu.style.display = 'none';
        this.recentFoldersBtn.setAttribute('aria-expanded', 'false');
        this.header.classList.remove('menu-open');
    }

    _renderRecentFoldersMenu() {
        this.recentFoldersMenu
            .querySelector('.recent-folders-list')
            .replaceChildren(...this._buildRecentFolderRows('menu'));
    }

    // After the list changed (a ✕ in the menu): rebuild the open menu, or close it when nothing else is left.
    _refreshRecentFoldersMenu() {
        if (!this._recentMenuCleanup) {
            return;
        }
        if (!this._hasOtherRecentFolders()) {
            this.closeRecentFoldersMenu();
            return;
        }
        this._renderRecentFoldersMenu();
        this.recentFoldersMenu.querySelector('button:not(:disabled)')?.focus();
    }
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/recent-folders-glue.test.js` → all pass; `npx vitest run` → green.
Run: `npx playwright test tests/e2e/recent-folders.test.js --reporter=line` → all pass.

- [x] **Step 6: CLAUDE.md**

§ UI Components, append:

```
Header recent-folders menu (G4): `#recentFoldersMenu`, a child of `.header` inside `#recentFoldersAnchor` (shown/hidden by `hideDropZone`/`showDropZone`) beside change-folder's `▾` (`#recentFoldersBtn`, disabled when nothing but the folder on screen is listed). While open it owns the keyboard (capture listeners; every key swallowed but Escape/arrows/Tab/Enter/Space; a held Enter chooses nothing; one close path `closeRecentFoldersMenu()`), stops `wheel` (the document handler would navigate behind it), and pins the header with `.header.menu-open` — the auto-hide timer re-arms only in the top band.
```

- [x] **Step 7: Commit**

```bash
git add media-viewer.js index.html styles.css tests/recent-folders-glue.test.js tests/e2e/recent-folders.test.js CLAUDE.md
git commit -m "feat(recent-folders): header menu beside change-folder that owns the keyboard while open (G4 T3)"
```

---

## Task 4: Open a recent folder — validate on click; `switchToFolder`

**Files:**
- Modify: `media-viewer.js` (constructor comment ~L112-117 + a new field; `setupEventListeners` change-folder handler ~L2217-2250; `loadFolder`'s opening comment ~L3083; `_buildRecentFolderRows`; new methods after `_refreshRecentFoldersMenu`), `tests/like-or-skip-glue.test.js` (~L258-262 `EXEMPT`; ~L1185 `folderCtx`), `tests/recent-folders-glue.test.js`, `tests/e2e/recent-folders.test.js`, `CLAUDE.md`

**Interfaces:**
- Consumes: `RecentFolders.classifyRecentFolder`, `folderDisplayName` (T1); `_removeRecentFolder`, `renderRecentFolders`, `_buildRecentFolderRows` (T2); `closeRecentFoldersMenu`, `this.recentFoldersMenu`, `this.recentFoldersDrop` (T3); existing `_refuseIfFileOpInFlight()`, `loadFolder(path)`.
- Produces:
  - `switchToFolder(folderPath: string): Promise<void>` — change-folder's entry: no-op checks, the file-op refusal, then **during an unfinished tournament** `showTournamentLeavePrompt(() => this._switchToFolderNow(folderPath))` and return (D3); otherwise `_switchToFolderNow`
  - `_switchToFolderNow(folderPath: string): Promise<void>` — change-folder's reset + load, unchanged, behind a second file-op refusal (it is also the prompt's continuation)
  - `openRecentFolder(folderPath: string, surface: 'drop'|'menu'): Promise<void>`
  - `_openRecentFolderOn(surface, folderPath): Promise<void>` — drop → `loadFolder`, menu → `switchToFolder`
  - `_markRecentFolderBusy(folderPath, surface): void`; field `_recentOpenInFlight: boolean`

- [x] **Step 1: Write the failing tests**

`tests/like-or-skip-glue.test.js` — the § 4 control test's `EXEMPT` (~L259): replace the `setupEventListeners` key with

```js
        _switchToFolderNow:
            "change-folder's reset (G4): empties the list once its file-op refusal passed, then loadFolder announces the folder",
```

and in "the change-folder button refuses before it wipes anything", add to `folderCtx`'s returned object (beside `_refuseIfFileOpInFlight`):

```js
            switchToFolder: extract('switchToFolder'),
            _switchToFolderNow: extract('_switchToFolderNow'),
```

Its three tests stay as they are: they now pin the same behaviour through the handler → `switchToFolder` → `_switchToFolderNow` (`isTournamentMode` is absent from the context, so no prompt).

`tests/recent-folders-glue.test.js` — append:

```js
describe('switchToFolder — change-folder, moved; asks first in an unfinished tournament (spec § 6, D3)', () => {
    const switchToFolder = extract('switchToFolder');
    const switchToFolderNow = extract('_switchToFolderNow');

    function tournamentCtx({ complete = false, ...overrides } = {}) {
        return {
            baseFolderPath: 'C:\\here',
            isTournamentMode: true,
            tournament: { engine: { isComplete: () => complete } },
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            showNotification: vi.fn(),
            showTournamentLeavePrompt: vi.fn(),
            _switchToFolderNow: vi.fn(async () => {}),
            ...overrides,
        };
    }

    it('during an unfinished tournament it shows the leave prompt and changes nothing until the user chooses', async () => {
        const c = tournamentCtx();
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showTournamentLeavePrompt).toHaveBeenCalledTimes(1);
        expect(c._switchToFolderNow).not.toHaveBeenCalled();
        // Save & leave or Discard runs the continuation: the switch itself.
        await c.showTournamentLeavePrompt.mock.calls[0][0]();
        expect(c._switchToFolderNow).toHaveBeenCalledWith('C:\\there');
    });

    it('a finished tournament switches at once, without the prompt', async () => {
        const c = tournamentCtx({ complete: true });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
        expect(c._switchToFolderNow).toHaveBeenCalledWith('C:\\there');
    });

    it('outside tournament mode it switches at once', async () => {
        const c = tournamentCtx({ isTournamentMode: false });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
        expect(c._switchToFolderNow).toHaveBeenCalledWith('C:\\there');
    });

    it('refuses during a file action before it asks', async () => {
        const c = tournamentCtx({ _fileOpInFlight: true });
        await switchToFolder.call(c, 'C:\\there');
        expect(c.showNotification).toHaveBeenCalledWith('Wait for the move to finish', 'info');
        expect(c.showTournamentLeavePrompt).not.toHaveBeenCalled();
    });

    it('the switch itself refuses before its reset when a file action started behind the prompt', async () => {
        const c = {
            _fileOpInFlight: true,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            showNotification: vi.fn(),
            mediaFiles: [{ path: 'C:\\here\\a.png' }],
            baseFolderPath: 'C:\\here',
            cleanupCurrentMedia: vi.fn(async () => {}),
            loadFolder: vi.fn(async () => {}),
        };
        await switchToFolderNow.call(c, 'C:\\there');
        expect(c.showNotification).toHaveBeenCalledWith('Wait for the move to finish', 'info');
        expect(c.cleanupCurrentMedia).not.toHaveBeenCalled();
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(c.mediaFiles).toHaveLength(1);
        expect(c.baseFolderPath).toBe('C:\\here');
    });

    it.each([
        ['no folder', null],
        ['the folder already open', 'C:\\a'],
    ])('does nothing for %s — and refuses nothing, even during a file action', async (_label, folderPath) => {
        const c = {
            baseFolderPath: 'C:\\a',
            _fileOpInFlight: true,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            showNotification: vi.fn(),
            cleanupCurrentMedia: vi.fn(async () => {}),
            loadFolder: vi.fn(async () => {}),
        };
        await switchToFolder.call(c, folderPath);
        expect(c.showNotification).not.toHaveBeenCalled();
        expect(c.cleanupCurrentMedia).not.toHaveBeenCalled();
        expect(c.loadFolder).not.toHaveBeenCalled();
    });
});

describe('openRecentFolder — validate on click (spec § 6)', () => {
    const openRecentFolder = extract('openRecentFolder');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    /** Main's answers: `status` is getGrantStatus's whole reply (an array, null when refused, or an Error to throw). */
    function api({ status = [true], exists = true, picked = null } = {}) {
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('\\').pop() },
                getGrantStatus: vi.fn(async () => {
                    if (status instanceof Error) {
                        throw status;
                    }
                    return status;
                }),
                checkFolderExists: vi.fn(async () => {
                    if (exists instanceof Error) {
                        throw exists;
                    }
                    return exists;
                }),
                openFolderDialog: vi.fn(async () => picked),
                logError: vi.fn(),
            },
        };
        return globalThis.window.electronAPI;
    }

    function openCtx(overrides = {}) {
        return {
            _recentOpenInFlight: false,
            _fileOpInFlight: false,
            _refuseIfFileOpInFlight: extract('_refuseIfFileOpInFlight'),
            _openRecentFolderOn: extract('_openRecentFolderOn'),
            _markRecentFolderBusy: vi.fn(),
            closeRecentFoldersMenu: vi.fn(),
            renderRecentFolders: vi.fn(),
            _removeRecentFolder: vi.fn(),
            switchToFolder: vi.fn(async () => {}),
            loadFolder: vi.fn(async () => {}),
            showNotification: vi.fn(),
            showError: vi.fn(),
            ...overrides,
        };
    }

    const DIR = 'C:\\pics\\Liked_3';

    it('a granted folder that exists opens from the drop zone through loadFolder, with no dialog', async () => {
        const e = api();
        // E7: the folder's last load was empty, which left baseFolderPath naming it — a retry still loads it.
        const c = openCtx({ baseFolderPath: DIR });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.loadFolder).toHaveBeenCalledWith(DIR);
        expect(c.switchToFolder).not.toHaveBeenCalled();
        expect(e.openFolderDialog).not.toHaveBeenCalled();
        expect(c.showNotification).not.toHaveBeenCalled();
        expect(c._markRecentFolderBusy).toHaveBeenCalledWith(DIR, 'drop');
    });

    it('from the header menu it opens through switchToFolder', async () => {
        api();
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'menu');
        expect(c.switchToFolder).toHaveBeenCalledWith(DIR);
        expect(c.loadFolder).not.toHaveBeenCalled();
    });

    it('the menu closes before anything opens', async () => {
        api();
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.closeRecentFoldersMenu.mock.invocationCallOrder[0]).toBeLessThan(
            c.loadFolder.mock.invocationCallOrder[0]
        );
    });

    it('a folder that no longer exists is removed with a notice, and nothing opens', async () => {
        const e = api({ exists: false });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c._removeRecentFolder).toHaveBeenCalledWith(DIR);
        expect(c.showNotification).toHaveBeenCalledWith(
            '"Liked_3" no longer exists — removed from recent folders',
            'warning'
        );
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(e.openFolderDialog).not.toHaveBeenCalled();
    });

    it('a folder main has not granted opens the dialog at that folder, then opens the pick', async () => {
        const e = api({ status: [false], picked: 'C:\\pics\\Picked' });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(e.checkFolderExists).not.toHaveBeenCalled();
        expect(c.showNotification).toHaveBeenCalledWith(
            'Confirm "Liked_3" — press Select Folder (security update)',
            'info'
        );
        expect(e.openFolderDialog).toHaveBeenCalledWith(DIR);
        expect(c.loadFolder).toHaveBeenCalledWith('C:\\pics\\Picked');
    });

    it('from the menu, the pick opens through switchToFolder', async () => {
        api({ status: [false], picked: 'C:\\pics\\Picked' });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'menu');
        expect(c.switchToFolder).toHaveBeenCalledWith('C:\\pics\\Picked');
    });

    it('a refused existence check (null) is treated as not granted', async () => {
        const e = api({ exists: null, picked: null });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(e.openFolderDialog).toHaveBeenCalledWith(DIR);
        expect(c._removeRecentFolder).not.toHaveBeenCalled();
    });

    it('a cancelled re-confirm dialog opens nothing', async () => {
        api({ status: [false], picked: null });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.loadFolder).not.toHaveBeenCalled();
        expect(c.switchToFolder).not.toHaveBeenCalled();
    });

    it('an unreachable folder is kept, with a notice', async () => {
        const e = api({ status: ['unreachable'] });
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.showNotification).toHaveBeenCalledWith('"Liked_3" is on a drive that isn\'t connected', 'warning');
        expect(c._removeRecentFolder).not.toHaveBeenCalled();
        expect(e.checkFolderExists).not.toHaveBeenCalled();
        expect(e.openFolderDialog).not.toHaveBeenCalled();
    });

    it.each([
        ['a refused status query (null)', { status: null }, 'status undefined, exists undefined'],
        ['a status query that throws', { status: new Error('ipc') }, 'status undefined, exists undefined'],
        ['an existence check that throws', { exists: new Error('ipc') }, 'status true, exists undefined'],
    ])('%s is an error: logged, shown, entry kept', async (_label, answers, detail) => {
        const e = api(answers);
        const c = openCtx();
        await openRecentFolder.call(c, DIR, 'drop');
        expect(e.logError).toHaveBeenCalledWith({
            level: 'warn',
            message: `Recent folder check failed (${detail})`,
            source: 'renderer',
        });
        expect(c.showError).toHaveBeenCalledWith("Couldn't open that folder");
        expect(c._removeRecentFolder).not.toHaveBeenCalled();
        expect(c.loadFolder).not.toHaveBeenCalled();
    });

    it('a second click while one is resolving is ignored', async () => {
        const e = api();
        const c = openCtx();
        const first = openRecentFolder.call(c, DIR, 'drop');
        await openRecentFolder.call(c, 'C:\\pics\\Other', 'drop');
        await first;
        expect(e.getGrantStatus).toHaveBeenCalledTimes(1);
        expect(c.loadFolder).toHaveBeenCalledTimes(1);
        expect(c.loadFolder).toHaveBeenCalledWith(DIR);
    });

    it('refused during a file action, with the notice, before any IPC', async () => {
        const e = api();
        const c = openCtx({ _fileOpInFlight: true });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.showNotification).toHaveBeenCalledWith('Wait for the move to finish', 'info');
        expect(e.getGrantStatus).not.toHaveBeenCalled();
        expect(c._recentOpenInFlight).toBe(false);
    });

    it('releases the flag and re-renders the list on every path — even when the open throws', async () => {
        api();
        const c = openCtx({ loadFolder: vi.fn(async () => Promise.reject(new Error('boom'))) });
        await openRecentFolder.call(c, DIR, 'drop');
        expect(c.showError).toHaveBeenCalledWith('Failed to open folder: boom');
        expect(c._recentOpenInFlight).toBe(false);
        expect(c.renderRecentFolders).toHaveBeenCalled();
    });
});
```

`tests/e2e/recent-folders.test.js` — add `waitForNotification` to the helpers import, then append:

```js
test.describe('G4 recent folders — opening one', () => {
    test('from the drop zone: it opens without the dialog, and moves to the front', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await mockFolderDialog(electronApp, b);
        await dropRows().filter({ hasText: 'Wallpapers' }).click();
        await waitForMedia(page);
        expect(await page.evaluate(() => window.mediaViewer.baseFolderPath)).toBe(a);
        expect(await dialogCalls()).toBe(0);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentFolders')).entries[0].path)).toBe(a);
    });

    test('from the header menu: it switches folders without the dialog, even from a playing video (Review Focus 4)', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Clips', ['playable-64x64.mp4']);
        await openFolders(a, b);
        await mockFolderDialog(electronApp, a);
        expect(await page.evaluate(() => window.mediaViewer.currentMedia?.tagName)).toBe('VIDEO');
        await revealHeader();
        await page.locator('#recentFoldersBtn').click();
        await page.locator('#recentFoldersMenu .recent-folder-item').filter({ hasText: 'Wallpapers' }).click();
        await expect(page.locator('#recentFoldersMenu')).toBeHidden();
        await page.waitForFunction((dir) => window.mediaViewer.baseFolderPath === dir, a);
        await waitForMedia(page);
        await waitForIdle();
        expect(await page.evaluate(() => window.mediaViewer.currentMedia?.tagName)).toBe('IMG');
        expect(await dialogCalls()).toBe(0);
        await expect(page.locator('.notification.error')).toHaveCount(0);
    });

    test('a folder that no longer exists is removed with a notice, and no dialog opens', async () => {
        const a = await makeFolder('Wallpapers');
        const b = await makeFolder('Liked_3');
        await openFolders(a, b);
        await restart();
        await rm(b, { recursive: true, force: true });
        await mockFolderDialog(electronApp, a);
        await dropRows().filter({ hasText: 'Liked_3' }).click();
        await waitForNotification(page, '"Liked_3" no longer exists — removed from recent folders');
        expect(await dropNames()).toEqual(['Wallpapers']);
        await expect(page.locator('#dropZone')).toBeVisible();
        expect(await dialogCalls()).toBe(0);
    });

    test('a folder main has not granted reopens through the dialog, opened at that folder', async () => {
        const c = await makeFolder('Liked_1'); // never granted: each launch starts with an empty grant store
        await page.evaluate(
            (dir) =>
                localStorage.setItem(
                    'recentFolders',
                    JSON.stringify({ version: 1, entries: [{ path: dir, openedAt: Date.now() }] })
                ),
            c
        );
        await restart();
        await mockFolderDialog(electronApp, c);
        await dropRows().first().click();
        await waitForNotification(page, 'Confirm "Liked_1" — press Select Folder (security update)');
        await waitForMedia(page);
        expect(await electronApp.evaluate(() => global.__mvLastDialogDefaultPath)).toBe(c);
        expect(await dialogCalls()).toBe(1);
        expect(await page.evaluate(() => window.mediaViewer.baseFolderPath)).toBe(c);
    });
});

// D3: the same Save & leave / Discard / Cancel prompt as Escape. Started the way tournament-mode.test.js does.
async function startTournament() {
    await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
    await expect(page.locator('#tournamentConfigModal')).toBeVisible();
    await page.locator('#tournamentRoundsSelect').fill('2');
    await page.locator('#tournamentConfigStart').click();
    await page.waitForFunction(() => window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine);
    await page.waitForFunction(() => !window.mediaViewer._tournamentRenderLoop && !window.mediaViewer.isLoading);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
}

async function pickOnce() {
    await page.keyboard.press('q');
    await page.waitForFunction(
        () => window.mediaViewer.tournament.engine.history.filter((e) => (e.kind ?? 'pick') !== 'prune').length === 1
    );
}

async function chooseFromMenu(name) {
    await revealHeader();
    await page.locator('#recentFoldersBtn').click();
    await page.locator('#recentFoldersMenu .recent-folder-item').filter({ hasText: name }).click();
}

test.describe('G4 recent folders — leaving an unfinished tournament (D3)', () => {
    test('a switch from the menu asks first; Cancel stays in the tournament, in this folder', async () => {
        const other = await makeFolder('Wallpapers');
        const here = await makeFolder('Liked_3', ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        await openFolders(other, here);
        await startTournament();
        await pickOnce();
        await chooseFromMenu('Wallpapers');
        await expect(page.locator('#tournamentResumeModal')).toBeVisible();
        await expect(page.locator('#tournamentResumeTitle')).toHaveText('Leave tournament?');
        await page.locator('#tournamentResumeCancel').click();
        await expect(page.locator('#tournamentResumeModal')).toBeHidden();
        expect(
            await page.evaluate(() => ({
                tournament: window.mediaViewer.isTournamentMode,
                engine: window.mediaViewer.tournament.engine !== null,
                folder: window.mediaViewer.baseFolderPath,
            }))
        ).toEqual({ tournament: true, engine: true, folder: here });
    });

    test('Save & leave writes the last pick, then switches', async () => {
        const other = await makeFolder('Wallpapers');
        const here = await makeFolder('Liked_3', ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        await openFolders(other, here);
        await startTournament();
        await pickOnce();
        // Taken at once, inside the 500 ms debounce: before D3 this pick was never written on a fast switch.
        const expected = await page.evaluate(() => JSON.stringify(window.mediaViewer.tournament.engine.serialize()));
        await chooseFromMenu('Wallpapers');
        await page.locator('#tournamentResumeAccept').click();
        await page.waitForFunction(
            (dir) => window.mediaViewer.baseFolderPath === dir && !window.mediaViewer.isTournamentMode,
            other
        );
        await waitForMedia(page);
        const onDisk = await page.evaluate(
            async (dir) => JSON.stringify((await window.electronAPI.readTournamentState(dir)).state),
            here
        );
        expect(onDisk).toBe(expected);
    });
});
```

(An unreachable drive cannot be simulated here; the `'unreachable'` row is covered by the unit test.)

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/recent-folders-glue.test.js tests/like-or-skip-glue.test.js`
Expected: `recent-folders-glue.test.js` fails to collect — `Error: Could not find method: switchToFolder`. In `like-or-skip-glue.test.js`: "every method that assigns this.mediaFiles is a known order-changer or a reviewed exemption" fails with `expected [ 'setupEventListeners' ] to deeply equal []` (the handler still assigns, and is no longer exempt); "every listed method still assigns this.mediaFiles (no stale entries)" fails with `expected [ '_switchToFolderNow' ] to deeply equal []`; and the three change-folder tests fail at `Could not find method: switchToFolder` (from `folderCtx`).
Run: `npx playwright test tests/e2e/recent-folders.test.js -g "opening one|unfinished tournament" --reporter=line`
Expected: 6 failures — a row click opens nothing (`waitForMedia` / `waitForNotification` time out), and in a tournament a menu pick shows no leave prompt (`#tournamentResumeModal` never visible). Record in the Progress Log.

- [x] **Step 3: The glue**

Constructor, after `this._recentMenuCleanup = null;`:

```js
        this._recentOpenInFlight = false; // openRecentFolder is resolving a click: further clicks are ignored
```

Constructor comment on `_fileOpInFlight` (~L114-117) — replace its last four lines, from `// finally. Any other file action…` through `// through _refuseIfFileOpInFlight().`, with:

```js
        // finally. Any other file action that arrives meanwhile is refused (G1), and so are the header
        // actions (switchMode, both sort handlers except the similarity sort's Cancel, loadFolder,
        // switchToFolder — the change-folder button and the header recent-folders menu — and a recent-folder
        // open), the tournament summary's Apply/Discard and the load-error Remove — G2/G4, through
        // _refuseIfFileOpInFlight().
```

`setupEventListeners`, replace the whole `if (this.changeFolderBtn) { … }` block (~L2217-2250) with:

```js
        if (this.changeFolderBtn) {
            this.changeFolderBtn.addEventListener('click', async () => {
                const folderPath = await window.electronAPI.openFolderDialog();
                if (folderPath) {
                    await this.switchToFolder(folderPath);
                }
            });
        }
```

`loadFolder`'s opening comment (~L3080-3084), the sentence "The change-folder button refuses before its own reset (G2 final review); this stays as defence in depth for the other callers." becomes "switchToFolder (change-folder, the header recent-folders menu) refuses before its own reset (G2 final review); this stays as defence in depth for the other callers."

`_buildRecentFolderRows`, the `if (isCurrent) { … }` block gains an `else`:

```js
            if (isCurrent) {
                item.disabled = true;
                item.classList.add('current');
                const tag = document.createElement('span');
                tag.className = 'recent-folder-current';
                tag.textContent = 'current';
                item.append(tag);
            } else {
                item.addEventListener('click', () => this.openRecentFolder(folderPath, surface));
            }
```

New methods, after `_refreshRecentFoldersMenu()`:

```js
    // #changeFolderBtn's handler body, moved here (G4 spec § 6) so the header's recent-folders menu opens a folder
    // exactly the way change-folder does, reset included. During an unfinished tournament both ask first, as Escape
    // and the mode buttons do (spec D3): loadFolder leaves the tournament without asking, and a pick made in the
    // last 500 ms was never written — the debounced write skips itself once the engine is gone. Save & leave
    // flushes it first.
    async switchToFolder(folderPath) {
        if (!folderPath || folderPath === this.baseFolderPath) {
            return;
        }
        if (this._refuseIfFileOpInFlight()) {
            return;
        }
        if (this.isTournamentMode && this.tournament.engine && !this.tournament.engine.isComplete()) {
            this.showTournamentLeavePrompt(() => this._switchToFolderNow(folderPath));
            return;
        }
        await this._switchToFolderNow(folderPath);
    }

    // The switch itself: change-folder's reset, then the load. Also the leave prompt's continuation, which runs
    // after the user chose — the prompt blocks clicks but not keys, so a special move can have started behind it.
    // If this refuses after Save & leave, the tournament is on disk and the engine dropped, so the next pick of
    // this folder switches without a second prompt.
    async _switchToFolderNow(folderPath) {
        // Before the reset below, not only in loadFolder (G2 final review F1): a pick during a
        // file action would otherwise wipe the list and the history, then be refused, and the
        // action would push onto the wiped history with an undo that targets ''.
        if (this._refuseIfFileOpInFlight()) {
            return;
        }
        await this.cleanupCurrentMedia();
        this.mediaFiles = [];
        this.currentIndex = 0;
        this.currentMedia = null;
        this.currentFolderPath = '';
        this.baseFolderPath = '';
        this.moveHistory = [];
        this.isLoading = false;
        this.isVideoLoading = false;
        this.videoEventListeners = [];
        this.mediaNavigationInProgress = false;
        this.isBeingCleaned = false;
        // Reset sorting state
        this.isSortedBySimilarity = false;
        this.originalMediaFiles = [];
        this.perceptualHashes.clear();
        if (this.sortSimilarityBtn) {
            this.sortSimilarityBtn.querySelector('.btn-label').textContent = 'Sort by Similarity';
        }
        this.hideDropZone();
        await this.loadFolder(folderPath);
    }

    // G4 spec § 6: a listed folder is checked when it is chosen, never when it is listed (one status query on an
    // offline share holds main ~21 s). Main's answers decide (RecentFolders.classifyRecentFolder): open it, drop
    // it as gone, re-confirm it through the dialog, or say its drive is absent.
    async openRecentFolder(folderPath, surface) {
        if (this._recentOpenInFlight || this._refuseIfFileOpInFlight()) {
            return;
        }
        this._recentOpenInFlight = true;
        try {
            const name = RecentFolders.folderDisplayName(folderPath, window.electronAPI?.path?.basename);
            this._markRecentFolderBusy(folderPath, surface);
            let status;
            let exists;
            try {
                status = (await window.electronAPI.getGrantStatus([folderPath]))?.[0];
                if (status === true) {
                    exists = await window.electronAPI.checkFolderExists(folderPath);
                }
            } catch (_err) {
                // an IPC failure leaves status or exists undefined: classified as 'error' below
            }
            const outcome = RecentFolders.classifyRecentFolder(status, exists);
            // Decided: the menu closes before the dialog, the open or a notice (spec § 6 step 2).
            this.closeRecentFoldersMenu();
            if (outcome === 'open') {
                await this._openRecentFolderOn(surface, folderPath);
            } else if (outcome === 'missing') {
                this._removeRecentFolder(folderPath);
                this.showNotification(`"${name}" no longer exists — removed from recent folders`, 'warning');
            } else if (outcome === 'regrant') {
                this.showNotification(`Confirm "${name}" — press Select Folder (security update)`, 'info');
                const picked = await window.electronAPI.openFolderDialog(folderPath);
                if (picked) {
                    await this._openRecentFolderOn(surface, picked);
                }
            } else if (outcome === 'unreachable') {
                this.showNotification(`"${name}" is on a drive that isn't connected`, 'warning');
            } else {
                window.electronAPI.logError?.({
                    level: 'warn',
                    message: `Recent folder check failed (status ${String(status)}, exists ${String(exists)})`,
                    source: 'renderer',
                });
                this.showError("Couldn't open that folder");
            }
        } catch (error) {
            console.error('Error opening a recent folder:', error);
            this.showError(`Failed to open folder: ${error.message}`);
        } finally {
            this._recentOpenInFlight = false;
            this.closeRecentFoldersMenu();
            this.renderRecentFolders();
        }
    }

    // Each surface opens like the existing button on it (spec § 6 step 4): the drop zone like its own click
    // (loadFolder), the header menu like change-folder (switchToFolder, reset included). switchToFolder's
    // same-folder no-op would swallow a drop-zone retry of a folder whose last load was empty.
    _openRecentFolderOn(surface, folderPath) {
        return surface === 'menu' ? this.switchToFolder(folderPath) : this.loadFolder(folderPath);
    }

    // The chosen row reads "Checking…" while main answers (spec § 6 step 2) — not the loading spinner, which
    // hides the drop zone (spec F9). The next render replaces the row.
    _markRecentFolderBusy(folderPath, surface) {
        const root = surface === 'menu' ? this.recentFoldersMenu : this.recentFoldersDrop;
        const item = [...(root?.querySelectorAll('.recent-folder-item') ?? [])].find(
            (el) => el.dataset.path === folderPath
        );
        if (item) {
            item.setAttribute('aria-busy', 'true');
            item.querySelector('.recent-folder-path').textContent = 'Checking…';
        }
    }
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/recent-folders-glue.test.js tests/like-or-skip-glue.test.js` → all pass; `npx vitest run` → green.
Run: `npx playwright test tests/e2e/recent-folders.test.js tests/e2e/app-launch.test.js tests/e2e/tournament-mode.test.js --reporter=line` → all pass.

**Mutation check (D3).** Step 2's tournament E2E failed before any open flow existed, which does not prove they catch a missing prompt. Temporarily delete the `if (this.isTournamentMode && …) { … return; }` block in `switchToFolder`, rerun `npx vitest run tests/recent-folders-glue.test.js` and `npx playwright test tests/e2e/recent-folders.test.js -g "unfinished tournament" --reporter=line`: expect the unit test "…shows the leave prompt…" and both D3 E2E to fail (`#tournamentResumeModal` never visible). Restore the block; rerun green. Log both runs.

- [x] **Step 5: Grep sweep** (Global Constraints): `changeFolderBtn`, `change-folder`, `switchToFolder`, `setupEventListeners`, `showTournamentLeavePrompt`, `exitTournamentMode` across code, tests **and comments** — every hit still true (e.g. comments that list where the leave prompt is shown: Escape, the mode buttons, the window close — now also a header folder switch). In particular the CLAUDE.md G2 note quoted in `tests/like-or-skip-glue.test.js`'s comments and the "the change-folder button refuses before it wipes anything" describe title (still true via `switchToFolder`).

- [x] **Step 6: CLAUDE.md**

§ Async Patterns, the File-op guard bullet: "`loadFolder` and the change-folder button (before its reset)" → "`loadFolder` and `switchToFolder` (the change-folder button and the header recent-folders menu, before its reset), and `openRecentFolder` (before any IPC)".

§ Git Insights, the "Tournament Escape + mode-selector clicks both route through `switchMode('single')` → `showTournamentLeavePrompt`" bullet — add after its first sentence: "A header folder switch (`switchToFolder`: change-folder and the ▾ menu) asks the same prompt first (G4 D3); the reset and load run as its continuation, `_switchToFolderNow`, and Save & leave flushes the 500 ms-debounced pick write, which `_drain` would otherwise skip once `loadFolder` nulls the engine."

§ State Management, the G4 bullet from T2 — append: "A click goes through `openRecentFolder(path, surface)`: single-flight, refused during a file action, then grant status → exists (`classifyRecentFolder`): open (drop zone → `loadFolder`; menu → `switchToFolder`, change-folder's extracted body), missing → removed with a notice, not granted → the dialog at that path, unreachable → kept. The clicked row reads "Checking…" (not the spinner, which hides the drop zone)."

- [x] **Step 7: Commit**

```bash
git add media-viewer.js tests/recent-folders-glue.test.js tests/like-or-skip-glue.test.js tests/e2e/recent-folders.test.js CLAUDE.md
git commit -m "feat(recent-folders): open a listed folder, validated on click; switchToFolder asks first in a tournament (G4 T4)"
```

---

## Task 5: "After" evidence, README, branch check

**Files:**
- Create: `docs/superpowers/specs/assets/g4-drop-zone-after.png`, `docs/superpowers/specs/assets/g4-header-menu-after.png`
- Modify: `README.md` (§ Features)

- [x] **Step 1: Capture**

Run (PowerShell): `$env:G4_EVIDENCE_STAGE='after'; npx playwright test tests/e2e/visual-evidence.test.js -g "recent folders"; $env:G4_EVIDENCE_STAGE=$null`
Expected: 1 passed; both PNGs exist.

- [x] **Step 2: Look at them** (Read tool) beside `g4-drop-zone-before.png`. Acceptance: `drop-zone-after` is the before shot plus a "RECENT FOLDERS" list under the subtitle — Liked_3, Liked_2, Wallpapers, each with its redacted `D:\Photos\…` path and a ✕ — and nothing else moved. `header-menu-after` shows the ▾ beside "Change source folder" and the menu below it: Liked_3 marked current (dimmed), Liked_2 and Wallpapers enabled, the first focused. No `C:\Users\…` text in either. Any layout defect is a finding: fix it in the owning task's files, re-capture, and log it.

- [x] **Step 3: README**

§ Features, after "Media Browsing":

```
- **Recent Folders** — Reopen a recently used folder from the start screen or the header's ▾ menu, without the folder picker
```

- [x] **Step 4: Commit**

```bash
git add docs/superpowers/specs/assets/g4-drop-zone-after.png docs/superpowers/specs/assets/g4-header-menu-after.png README.md
git commit -m "docs(recent-folders): after screenshots; README feature line (G4 T5)"
```

---

## Finish (after Task 5)

- [ ] `npx vitest run`, `npm run lint`, `npm run format:check` green; `git status --short` clean.
- [ ] `for i in 1 2 3; do npx playwright test tests/e2e/recent-folders.test.js --reporter=line || break; done` — three runs in a row.
- [ ] `npx playwright test` — the full suite once. An existing E2E that now fails because the drop zone or the header changed something it relied on is a finding; fix the test only if its premise was wrong, and log it.
- [ ] Grep sweep: `recentFolders`, `RecentFolders`, `switchToFolder`, `openRecentFolder`, `menu-open`, `__mvDialogCalls` across code, tests **and comments**; re-read every comment attached to changed code.
- [ ] Dispatch the `regression-checker` agent on `git diff main...HEAD -- media-viewer.js`; triage every finding against the spec.
- [ ] `typescript-lsp`: record in the Progress Log whether a `diagnostics` record appeared, and what each diagnostic was.
- [ ] Push (`git push -u origin g4-recently-opened-folders`; pre-push runs the full E2E suite). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [ ] Open the PR: spec + plan links, D0–D2, the planning amendments (Premise Corrections 1–6), RED→GREEN evidence per task, the before/after screenshots inline, test deltas, the Residuals, the `typescript-lsp` notes. **Ask the user** before running `/code-review` in this chat (memory `feedback_ask_before_in_chat_code_review`; the default is a separate chat). Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

1. **Open change-folder's dialog next to the current folder** — `#changeFolderBtn` opens the dialog at the OS default location; passing the current folder's parent as `defaultPath` would put sibling folders (`Liked_1` beside `Liked_3`) one click away. 🟤 candidate.
2. **The drop zone's subtitle is out of date** — "Supports: JPG, PNG, GIF, MP4, WebM, MOV" misses at least `.jxl` against `media-formats.js`; derive it from that list. 🟤 candidate.
3. **Rename the "drop" zone** — its title, id and class still say "drop" although dropping has not worked since Electron 32 (spec F1); the copy should say "Select a folder". 🟤 candidate (pairs with the drag-and-drop revival entry).

## Residuals for Extract (found while designing and planning — not fixed here)

- **`.notification.warning` has no style** — G1's re-confirm notice and G4's missing/unreachable notices render as the neutral default. → BACKLOG 🟤.
- **`tests/lint-guard.test.js`'s `RENDERER_FILES` omits `like-or-skip.js` and `tournament-engine.js`**, so the HTML-sink guard is not proven for them (G4 adds `recent-folders.js` only). → BACKLOG 🟤.
- **Keys still reach the dispatcher while the tournament leave prompt is open** (`#tournamentResumeModal` blocks clicks only): picks, undo and a special move (which holds `_fileOpInFlight`) can run behind it, for Escape's and the mode buttons' prompt as for D3's. `_applyModeSwitch` does not re-check the file-op guard after the user chooses; `_switchToFolderNow` does. Pre-existing; found while designing D3. → BACKLOG 🟤. Two consequences surfaced at the final review:
  - **Escape while D3's prompt is open.** It calls `switchMode('single')`, which re-binds the shared modal's Save and Discard to a mode switch. The folder switch is lost, and the user who meant Cancel ends up in single mode in the same folder. This is the same rebinding as Escape versus the mode buttons; `handleAppCloseRequest` guards against it with its title check, and the other paths have no such guard.
  - **A refused D3 continuation strands the tournament.** It leaves `isTournamentMode` true and `tournament.engine` null, so the tournament UI is inert until Escape, a mode button, or a re-pick. Nothing is corrupted.

  Both go in this same entry.
- **`loadFolder` has no load-generation guard.** Two overlapping loads (change-folder during a slow load, which predates G4) can interleave `loadBulkRatedFile`'s read with the other load's file list. They can then prune one folder's bulk-rated records against another folder's files and write the result into the wrong `.bulk_rated.json`. G4's own route into this (a stale click-time decision) is closed by the final fix wave's intent generation, F1. The root guard is not. → BACKLOG 🟤.
- **The header menu's ARIA structure.** `role="menu"` directly owns a heading, a `ul`/`li` list and ✕ buttons, with no `none` roles and no `aria-labelledby`. Screen readers will announce it poorly. → BACKLOG 🟤.
- **Recent-folders focus polish.** A ✕ on the drop zone re-renders the list, which drops keyboard focus to `body`. Closing the menu does not return focus to ▾. An arrow key pressed while a ✕ has focus jumps to the first or last row. → BACKLOG 🟤 (one entry).
- **The header menu shows through.** `.header` has a `backdrop-filter`, which makes it the menu's backdrop root, so the menu's `--glass-bg` blur sees only the header and its second row ghosts through. Below the header, the page shows through unblurred. An opaque menu background would fix it; the committed `g4-header-menu-after.png` would then need re-capturing. → BACKLOG 🟤.
- **`check-folder-exists` maps every `fs.access` error to `false`** (`main.js`). A transient share error therefore reads as "no longer exists", and the recent entry is dropped. The harm is a lost shortcut. → BACKLOG 🟤 (main-process change; it needs a security review of the channel).
- **A mouse wheel over the header itself navigates** (unverified at runtime): the document wheel handler excludes only media and the help overlay, so a wheel over the auto-shown header changes the file. Pre-existing; the menu stops it for itself only. → BACKLOG 🟤 after a probe.

## Closeout (after the merge, on `main`)

- [ ] Extract (Improvements + Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] From: G4 closeout`), archive this plan (`git mv` to `docs/archive/plans/`, indexed in `docs/README.md` Archived Plans), DONE.md entry, WEEKLY Summary-Table Status → `✅ PR #N` + the Thursday G4 Daily-Schedule row, check off the BACKLOG 🔵 [2026-07-01] "Add 'Recently opened folders'" entry — **in the closeout commit**.
- [ ] Remove this plan's row from [README.md](README.md) § Current Plans and from `docs/README.md` § Active Plans.
- [ ] Spec: a post-implementation note for anything the code departed from.
- [ ] Propagation check: re-read every live surface this plan touched (`CLAUDE.md`, `README.md`, the code comments, `index.html`) for a late correction that did not reach it.
- [ ] REVIEW-QUEUE § 5: hand the `typescript-lsp` evidence to G6.
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

## Progress Log

- **2026-10-16** — Branch `g4-recently-opened-folders` from `dd05eed`. User reordered G4 ahead of I1 (D0). Brainstormed section by section (D1 drop zone + header menu, D2 pure module + glue); spec `96c9c94`, approved. Planning-time measurements: the header auto-hide re-arm points (Premise Correction 1), the document wheel handler (2), the E2E Lucide stub (3), the tests the `switchToFolder` extraction reaches (7), `RENDERER_FILES` (8). Spec amended before any code (1–6). Plan `0fa22af`.
- **2026-10-16** — A side-agent note ("a header-menu pick mid-tournament skips the Save/Discard prompt; the last picks might not be written") verified against the code before acting: the missing prompt is real, and so is the lost tail (`PERSIST_DEBOUNCE_MS = 500`, `_drain` returns on `!this.engine` after `loadFolder` nulls it); "one misclick" was overstated (▾ then a row), and nothing older than 500 ms is lost. User ruling **D3**: the prompt goes in `switchToFolder`, for change-folder and the menu alike (Premise Correction 9). Task 4 grew to ~1.5 SP (total ~5). The user chose **subagent-driven** execution, after a `/compact`.
- **2026-10-16 — Pre-flight.** The user approved the global install: `typescript-language-server` 5.3.0 (+ `typescript`). The user enabled `typescript-lsp@claude-plugins-official` through `/plugin` (`95dd933`; `/plugin` rewrote `.claude/settings.json` at 2-space indent, and lint-staged restored 4 spaces, leaving a one-line diff). The controller session gained the `LSP` tool mid-turn. Diagnostics are checked at Finish.
- **2026-10-16 — Controller pre-flight scan, Ruling 1 (T3).** The plan's T3 code focuses `menu.querySelector('button:not(:disabled)')`, which in the menu is the current row's ✕: the current item is disabled and its ✕ is not (spec § 7). That contradicts T3's own E2E (`items.nth(1)` focused) and T5's acceptance. Ruling: open and refresh focus the first enabled `.recent-folder-item`; ArrowUp/ArrowDown cycle the enabled items, which are the spec's "rows"; Tab/Shift+Tab cycle every enabled button, ✕ included.
- **2026-10-16 — T1.** The before shot was taken on the unchanged renderer and shows the bare drop zone, with no folder icon because E2E stubs Lucide (Premise Correction 3). A plain run skips the G4 block. RED: `Cannot find module '../recent-folders.js'`, and 10 lint-guard `flags …` cases failed with `expected [] to have a length of 1`. GREEN: 127 tests in the two files; full suite 1443 passed, 1 skipped; lint 0 errors.
- **2026-10-16 — T2.** RED: the glue file fails to collect with `Could not find method: _setRecentFolders`. E2E: 5 failed, and `a first launch shows no list` passed, by construction as planned. GREEN: glue 10/10; recent-folders + app-launch E2E 11/11; full suite 1453 passed, 1 skipped; lint 0 errors. The brief's `loadCtx` needed no additions.
- **2026-10-16 — T3.** RED: the glue file fails to collect with `Could not find method: _updateRecentFoldersButton`, and all 5 header-menu E2E tests fail. GREEN: glue 27/27; recent-folders E2E 11/11 (the 4 s header pin and the focused-row assertion included); full suite 1470 passed, 1 skipped; lint 0 errors. Ruling 1 applied: open and refresh focus the first enabled row; arrows cycle the rows; Tab cycles every enabled button. **Plan defect, corrected by the implementer.** The Review Focus 5 E2E seeded only `customLikeFolder`, but `moveCurrentFile` refuses a rating unless both like and dislike folders are set ("Configure like/dislike folders"). So "a rating key moves nothing while the menu is open" passed with or without the menu, and only the closing control press failed. The test now seeds `customDislikeFolder` too. Two mutation checks show it discriminates: removing the menu's `stopImmediatePropagation` fails it, and so does removing its wheel `stopPropagation`.
- **2026-10-16 — T4.** RED matched Step 2: the glue file failed to collect (`switchToFolder`), and so did the two like-or-skip control tests and the three change-folder tests, as predicted. All 6 new E2E failed. GREEN: full suite 1492 passed, 1 skipped; recent-folders + app-launch + tournament-mode E2E 38 passed; lint 0 errors. **Mutation check (D3):** with the block removed, the unit test "…shows the leave prompt…" failed, and both D3 E2E failed because `#tournamentResumeModal`/`#tournamentResumeAccept` never became visible. The block was restored byte-identical (`cmp`) and the rerun was green. **Plan defect, corrected by the implementer:** the Save & leave E2E compared `JSON.stringify(engine.serialize())` strings, but `serialize()` stamps `lastUpdatedAt: Date.now()` (`tournament-engine.js:621`), so the flush's rewrite never equals the earlier snapshot. The test now compares the parsed objects without `lastUpdatedAt` and asserts `gamesPlayed === 1`. The mutation run fails that test at the missing prompt, which comes before the data assertion. So whether the data assertion separates the flush from the debounced write is not measured.
- **2026-10-16 — T5.** The after capture passed (1 test), and the controller looked at both shots. The drop zone lists Liked_3, Liked_2 and Wallpapers, each with a `D:\Photos\…` path and a ✕. The menu sits below the ▾: Liked_3 is dimmed and tagged "current", Liked_2 and Wallpapers are enabled. No `C:\Users` text appears in either shot. Deviations from the acceptance, all left for the final review to triage:
  - **The title moves.** The drop zone centres its content vertically, so the title and subtitle rise ~140 px once the list appears.
  - **No visible focus ring after a mouse open.** Chromium's `:focus-visible` heuristic does not apply to programmatic focus after a pointer click.
  - **The header shows through the menu.** The menu's `--glass-bg` is translucent, so a faint ghost of the header's second row shows behind it.
  - **Possible clipping with 8 rows** on windows under ~800 px tall, at ~75 px per row. Estimated, not measured.
- **2026-10-16 — Finish checks at `1c604aa`.**
  - **Static checks.** Lint shows 0 errors and 2 pre-existing `no-shadow` warnings. Every file the branch changed passes Prettier. `format:check` flags 6 files, all in the git-ignored `CLAUDE-SECURITY-*` scan folders.
  - **E2E.** recent-folders passed 17/17 in three runs in a row. The full suite: 157 passed, 6 skipped (the opt-in evidence tests).
  - **Grep sweep.** Every hit in code, tests, comments and CLAUDE.md is still true.
  - **regression-checker.** No regression at ≥80 % confidence. It flagged two low-confidence items:
    - a wheel off the open menu navigates behind it — ruled into the fix wave as F6;
    - Escape during D3's prompt re-targets the shared modal — recorded under Residuals.
- **2026-10-16 — Final whole-branch review (Opus): "with fixes".** One Important finding: a slow click-time check acts after the user has moved on. Before the fix, from the drop zone, it replaces folder B with no reset and no D3 prompt, wiping B's undo history. It also adds a non-modal route into overlapping `loadFolder` calls. The controller ruled six fixes into one fix wave:
  - **F1:** an intent generation guards the open flow, plus a re-check of the file-op guard before the regrant dialog and a busy-row test.
  - **F2:** the drop-zone handler guards list clicks itself, so the G2 F5 click-blur rule sees them.
  - **F3:** the Save & leave E2E proves the flush deterministically.
  - **F4:** the comment names the state a refused continuation leaves.
  - **F5:** the drop list scrolls instead of clipping. Measured: the 8th row is unreachable at the 600 px minimum window.
  - **F6:** the wheel is ignored while the menu is open.

  The rest went to Residuals, or are cosmetic or plan wording (ledger Ruling 5).
- **2026-10-16 — Fix wave (one fixer, Opus, two rounds).** Each fix was RED against the unfixed code, then GREEN.
  - **F1:** `_folderIntentGen` is bumped in `openFolderDialog` and change-folder before their dialogs, and in `loadFolder` after its refusal. `openRecentFolder` abandons a stale `'open'`/`'regrant'` decision. The new E2E failed at HEAD, with A replacing the B the user had just opened.
  - **F3:** the Save & leave E2E now clears the pending debounce and asserts the disk still reads `gamesPlayed` 0 before Save. Mutation: with `await this.tournament.flush()` deleted, it fails at the data assertion (1 vs 0); the code was restored byte-identical.
  - **F4:** comment, plus an `engine: null` guard test (it fails when the condition is mutated).
  - **F5:** the list is bounded at `calc(100vh - 260px)` and scrolls. At 800×600 the inner height measured 546 px, and the list bottom measured 602 before the fix.
  - **F6:** the wheel is ignored while the menu is open. It failed RED: `currentIndex` became 1.
  - **F2:** the briefed `contains(e.target)` guard was wrong. The ✕ re-render detaches the target before the click bubbles, so every ✕ opened the dialog (measured). Ruling 6 replaced it with `e.composedPath()`. Two tests pin it: a ✕ opens no dialog (fails under `contains()`), and a row clicked during a slow check keeps no focus (fails under the old `stopPropagation`).
  - **M7:** four guard tests for `_markRecentFolderBusy`.
  - **Totals:** unit 1505 passed, 1 skipped; recent-folders E2E 19/19 (three runs in round 1); lint 0 errors.

## Key Discoveries

_(filled during execution)_
