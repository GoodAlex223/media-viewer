# v2 P1a: the module host - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) G1 (Nov 16–20, 🏆)
**Created**: 2026-11-11
**Status**: Approved 2026-11-11 — Native execution (one session) after `/compact`; Task 1 next
**Last Updated**: 2026-11-11
**Branch**: `g1-v2-p1a-module-host` (from `main` `d7b0fb8`)

**Goal:** the app discovers first-party modules, loads the enabled ones in dependency order through a host object, survives a module that throws or hangs, and lets the user switch modules on and off from F1 with a restart. Nothing the user does today changes.

**Architecture:** main reads `modules/*/module.json` as data (`main/module-registry.js`), keeps the toggles in `modules.json`, and serves module files through the app scheme. The renderer's `core/module-host.js` imports each enabled entry and calls `activate(host)` with a frozen per-module host. Per-folder files get three new owner-checked channels (`main/folder-files.js`), proven end to end by a test module. No existing folder file moves in P1a (C2).

**Tech Stack:** Electron 39, plain JavaScript (CommonJS in main, native ES modules in the renderer, no bundler), Vitest 4, Playwright, ESLint 9 flat config.

**Spec:** [v2 modules spec](../../superpowers/specs/2026-10-22-v2-modules-design.md) § 14's P1a row, with §§ 6, 7.1–7.3, 7.9, 7.13, 8.1–8.2, 8.7–8.8, 9, 10, 11.1 and 15. The Linux baseline is dropped (§ 21, 2026-11-11). Builders read the spec sections named in each task. This plan records where P1a narrows or settles them (§ 2 "Builder calls").

---

## Global Constraints

- Renderer ceiling: `wc -l media-viewer.js` is **11,597** at `d7b0fb8` and equals `scripts/renderer-line-ceiling.txt`. The PR shows a net ≤ 0 and lowers the ceiling to its final count (spec § 11.1; the user's ruling of 2026-10-27).
- Host API: `apiVersion` **1**; the host supports `[1]` (spec § 6.5 step 6).
- Activation timeout: **5 s** per module, covering import and `activate` together (spec § 6.5 step 3).
- `modules.json` shape: `{ "version": 1, "enabled": { "<id>": true } }`, written atomically, only through a guarded IPC call (spec § 6.5 step 2).
- Served from the app scheme: `core/**` (`.js .css`), `modules/*/module.json`, `modules/*/ui/**` and `modules/*/workers/**` (`.js .json .css .wasm`). **Never** `main/**` or `modules/*/main/**` (spec § 9).
- Rule M-1: main never `require`s a file because a manifest named it, and lint bans a non-literal `require()`/`import()` in every main-process file. Rule M-2: module code reaches the app only through `host` (spec § 6.2).
- Every lint rule and source scan gets a planted violation that must fail (spec § 15).
- `preload.js` is Tier 1 (PROJECT.md). Its exact delta, six additions and no removals, is in Task 6, for approval with this plan. Each edit still prompts.
- Folder content is untrusted: a read that fails is never "absent", and "never read" is never "no ratings" (CLAUDE.md § Cache Management, bulk-rated bullet).
- Nothing from the user's folders enters git. Fixtures are synthetic.
- Unit runs use the capital-C path `C:/Users/alexm/Projects/media_viewer`, and each run's reported test count is checked (memory: Vitest `no tests` is a check that ran nothing).

## Review Focus

1. **A folder-file read that fails is never "absent".** That covers a guard refusal, an owner that is off, a file over its cap, a link, and an IPC that throws. If any of these reads as `absent`, a module's next save replaces data it never read: P1b's caches first, and P4b's bulk ratings, which exist nowhere else. Tests: Task 3 (main), Task 9 (the host maps an IPC rejection to `unreadable`), Task 12 (E2E 8, a guard refusal through the real bridge).
2. **A save asked for while a visit is live finishes into that visit's folder, even if the next folder opens first.** A call after the visit ends is refused. A module freezing its copy in `onVisitEnd` depends on the first half. A late write into the wrong folder is what the second half prevents. Tests: Task 9.
3. **Startup with zero, slow or broken modules.** With no modules, the first folder load waits for only one IPC round trip. With a hung module it waits at most 5 s, and a `listModules` that throws or returns `null` still lets folders load. This matters at 24k files, where the spec's anti-goal is a slower core. Tests: Task 9 (fake timers), Task 10 (`loadFolder` gate).
4. **Restart beside the close flow.** Cancel on the tournament leave prompt leaves the app open and arms nothing, so a later ordinary close never relaunches. A close request during a restart's save closes without relaunching, and nothing traps the window. Tests: Task 10.
5. **Hand-edited or corrupt `modules.json` and manifests.** That means a BOM, wrong types, unknown ids, a 10 MB file, or a duplicate id or folder-file name across modules. Startup must not crash: defaults apply with a logged reason, and duplicates invalidate every module involved, deterministically. Tests: Task 2.

---

## 1. Task Overview

**Goal**: spec § 14 P1a. **Exit criteria**: an empty module loads, fails safely, cascades and toggles; all suites are green on Windows; net `wc -l media-viewer.js` ≤ 0.

**Context**: the start of the v2 pilot (P1a + P1b, early January 2027, soft). P1b (similarity) is the host's first real consumer, so P1a builds only what P1b and the exit criteria need. That includes the per-folder file service, whose first production caller is P1b's two cache files.

**Success Criteria**:
- [ ] The exit criteria above, proven by `tests/e2e/modules.test.js`
- [ ] Every new lint rule and scan fails on a planted violation
- [ ] The existing unit and E2E suites pass with no assertion weakened
- [ ] `/security-review` of the branch run, with its findings answered (spec § 15: a phase that adds IPC is scanned)
- [ ] The renderer line count is at or below 11,597, and the ceiling is lowered to the final count

## 2. Analysis

### Builder calls (Claude's, for the user to check)

These narrow or settle the approved spec. Task 13 records each one that changes a spec statement as a § 21 row.

| # | Call | Why |
|---|---|---|
| C1 | **`files.onFileRemoved/onFileRestored` and the history-entry stashes move to P1b.** P1a's `files` group is `list()` only | No P1a module uses them. Their first consumer is similarity's perceptual hashes, and P1b rewires the same call sites (`removeFileFromList`, `_captureUndoFields`, `restoreFeatureCachesFromHistory`). Spec § 7: "nothing below is built speculatively" |
| C2 | **No existing folder file moves onto `folder-file-*` in P1a.** `core` declares no folder files, and `readBulkRatedFile`/`writeBulkRatedFile` stay as they are. *Reversed 2026-11-11, with the user's agreement, from "move `.bulk_rated.json` now".* | The ratings can't be rebuilt, and P4b moves them into `ai-sort` anyway. Moving them now would change their read and save code twice; waiting changes it once, straight onto `host.store.folderFile`. A cache file would also change twice (P1b moves both), and today's cache read can't tell missing from unreadable. The channels are still proven to fire: the E2E fixture module drives read, write and delete through the real host, bridge and main (Task 12). Their first production callers are P1b's caches |
| C3 | **Notifications move to `core/notifications.js`**, and `showNotification` stays as a one-line delegate | This pays for P1a's wiring under the ceiling (about −92 / +38 lines). `host.ui.notify` wraps it (spec § 5.1 lists notifications as core). The 131 call sites and the E2E wrappers of `mv.showNotification` stay unchanged |
| C4 | **The Modules list is an F1 overlay section.** P2 turns the overlay's sections into tabs | F1 has no tabs today, and spec § 14 puts "F1 tabs" in P2 |
| C5 | **Test modules live in `tests/e2e/fixtures/modules/`.** That folder is served as a second module root only when both `MV_E2E_STATE_DIR` and `MV_E2E_MODULE_ROOT` are set. P1a ships no `modules/` folder, and a missing root means zero modules | Nothing test-only reaches the user's Modules list. Spec § 6.4 already asks for discovery over a list of roots |
| C6 | **Strict manifests.** Unknown keys are refused. Keys whose meaning arrives later (`uses`, `provides`, `contributes`, `appData`, `workers`, `styles`, `jobs`, `tools`, `permissions`, `legacySettingsKeys`) must be absent or empty until their phase widens the validator | No validation code exists for a field nothing honours, and a later manifest that uses a key early gets a clear error |
| C7 | **One per-launch E2E state folder, `MV_E2E_STATE_DIR`.** It holds `modules.json` now, and P3a's and P5's stores later | Spec § 7.13 names four stores; three do not exist yet. One folder isolates them by construction |
| C8 | **`restart-app` is a send, trusted by sender identity like `app-close-allow`**, and the renderer sends it only at the end of its own close flow | Modules are deactivated by then, so a refused restart would strand the window. Main never arms a relaunch that a Cancel could leave behind |
| C9 | **Visit liveness is checked synchronously at each store call.** A write asked for while the visit is live, including inside `onVisitEnd`, finishes into that visit's folder; later calls are refused | Reconciles spec § 7.9 ("refused if the visit ended") with § 6.3 rule 5 (freeze in `onVisitEnd`), the way `FeatureCacheStore.endVisit()` already saves its frozen copy (wipe spec D3) |
| C10 | **Toggle prompts about dependents, badges and the first-v2-launch notice wait for P1b+.** P1a rows show status and "restart to apply" | P1a has no modules with dependents, permissions or anything to announce |
| C11 | **BACKLOG "Extract `extractAsyncMethod` helper…" moves to P1b** | P1a's one rewired test imports `core/notifications.js` directly. P1b's similarity rewiring is the "third use" the entry waits for |
| C12 | **Log hardening (spec § 8.7) lands with `host.log`.** Newlines are folded, length capped, `source` restricted | `host.log` promises it, and it fixes today's forgeable `source` |
| C13 | **🟤 "Extend the size warning to `.claude/rules/*.md`…" falls due here, and goes to Cleanup Week #6** beside the 🟡 `CLAUDE.md` audit | Same script and the same week. P1a's two rules files are small |
| C14 | **An unreadable `modules.json` means defaults for that launch**, with a logged warning. The next toggle rewrites the file | Toggles are not user data, and every existing feature defaults on |
| C15 | **A duplicate module id, or a folder-file name declared twice, invalidates every module involved** | Deterministic, with no "first wins" order dependence |

**G5 note (BACKLOG 🟤 [2026-11-06] "Note at v2 P1a's planning…")**: the spec's "`CLAUDE.md` is 66,578 bytes … so v2's rules cannot land there" rested on the old 69,000-byte trigger. G5 (PR #98) re-set the trigger to 85,000 without an audit. The requirement, moving the moved code's rules into `.claude/rules/`, stands. Its reason is now the owed audit (🟡 "Audit `CLAUDE.md`: it passed its 69,000-byte trigger…", Cleanup Week #6, still owed), not a lack of room. The entry cites "§ 19 step 4", but the sentence is at § 14, "Every phase also", item 4. Task 13 adds a dated note there.

### Edge cases

| Edge case | Handling |
|---|---|
| No `modules/` folder (production P1a) | The registry lists zero modules, the Modules section reads "No modules yet", and `loadFolder` waits for one `listModules` round trip |
| A module activates after its timeout | Its result is ignored and its host disposed: handlers dropped, store calls refused with "module is not active" |
| A module's `onLoaded` throws or rejects | Logged with the module id, and the other handlers still run (spec § 6.3) |
| A folder dropped during startup | `loadFolder` awaits `moduleHost.ready` after its refusals and the spinner, inside the try that holds `_folderLoadInFlight` |
| 24k files and no module listening | `beginVisit` builds no file snapshot when no handler is registered |
| Restart with an unfinished tournament | The same leave prompt as a close. Save or Discard restarts; Cancel stays |
| Two quick toggles | The writer queues per target in call order, so the last click wins on disk |
| A folder file over its cap on disk | The read is `unreadable` ("too large"); a module treats it as never read and does not overwrite it |

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| GOALS G-7's soft target (renderer + `core/*.js` below 11,945) is exceeded: the host is new code, about 640 lines | Med | Measured and stated in the PR. It feeds Cleanup Week #6's 🟤 "Extend the line ceiling to the renderer plus `core/*.js`…" decision |
| ~10 SP against the week's 9 | Med | WEEKLY's overrun rule: a `**Spillover**` line on Sunday Nov 22 if this has not merged |
| `app.relaunch` under Playwright | Low | The E2E stubs it in main and asserts through the session log, as `rating-data-safety.test.js:405` reads its log |
| G2 merges first and moves the line count | Low | Merge `main` before the last push; set the ceiling from the merged count |

---

## 3. Implementation Plan

### Files Affected

| File | Action | Purpose |
|---|---|---|
| `main/module-registry.js` | Create | Discovery, validation, resolution, `modules.json` (Task 2) |
| `main/folder-files.js` | Create | Tagged read, atomic write, delete, owner checks (Task 3) |
| `main/module-ipc.js` | Create | `list-modules`, `set-module-enabled`, `folder-file-*` registrations (Task 6) |
| `core/notifications.js` | Create | `Notifier`, moved from `showNotification` (Task 8) |
| `core/host-api.js` | Create | JSDoc typedefs only (Task 9) |
| `core/module-host.js` | Create | Loader, per-module host, visits (Task 9) |
| `core/modules-panel.js` | Create | Row model and DOM for the Modules section (Task 11) |
| `main.js` | Modify | Registry, folder files and protocol wiring; `restart-app`. Outside the file-move handlers |
| `preload.js` | Modify (Tier 1) | +6 keys (Task 6) |
| `app-protocol.js` | Modify | `core/**` and module roots (Task 4) |
| `logger.js` | Modify | Renderer log hardening (Task 5) |
| `media-viewer.js` | Modify | Delegate, host wiring, visits, restart |
| `index.html`, `styles.css` | Modify | Modules section |
| `eslint.config.mjs` | Modify | New blocks, M-1, M-2, `mv/module-imports` (Task 1) |
| `tests/lint-guard.test.js`, `tests/media-url.test.js`, `tests/check-e2e-needed.test.js` | Modify | Planted proofs, glob-based lists (Task 1) |
| `tests/module-boundary.test.js`, `tests/module-registry.test.js`, `tests/folder-files.test.js`, `tests/bridge-surface.test.js`, `tests/module-host.test.js`, `tests/modules-panel.test.js` | Create | New units |
| `tests/app-protocol.test.js`, `tests/logger.test.js`, `tests/media-viewer-utils.test.js`, `tests/similarity-sort-glue.test.js`, `tests/rating-data-safety-glue.test.js` | Modify | New cases, rewires |
| `tests/e2e/helpers/electron-app.js` | Modify | `stateDir`, `moduleRoot`, `modulesEnabled` |
| `tests/e2e/fixtures/modules/*` | Create | Seven fixture modules (Task 12) |
| `tests/e2e/modules.test.js` | Create | Exit-criteria E2E |
| `scripts/renderer-line-ceiling.txt` | Modify | The final count |
| `CLAUDE.md`, `.claude/rules/core.md`, `.claude/rules/modules.md` | Modify / Create | Task 13 |
| `docs/ARCHITECTURE.md`, `PROJECT.md`, `docs/README.md`, `docs/planning/plans/README.md`, the v2 spec | Modify | Task 13 |

**Live-surface preflight**: every live surface asserting a claim this changes.
- `CLAUDE.md`: the Architecture tree (new `core/`, `modules/`, `main/`); § Error Handling (the `showNotification` sentence moves to `.claude/rules/core.md`); § Testing (E2E) helpers bullet (`launchApp` options); § Security (new channels, the module roots served); § Build & Development (a fixture root env var, if documented there).
- `PROJECT.md`: Project Structure table and Known Limitations line count.
- `docs/ARCHITECTURE.md`: file tree and "Extension Points".
- `.claude/agents/regression-checker.md`: grep for `showNotification` and `notificationContainer`; update a stale claim if it names them.
- Comment sweep: every comment near `showNotification` and `handleAppCloseRequest`, across code, tests and docs other than archives and specs (CLAUDE.md § Best Practices).

### Dependencies

- G2 (compare special move) merges first. This branch merges `main` before its last push, so the ratchet measures both (WEEKLY § Parallel Work).
- The user approves this plan, including the `preload.js` delta, before Task 1.
- The review session (Fri) carries the Codex CLI trial (WEEKLY G1 fourth item): the user installs the CLI and runs `codex login` there.

### Model and Effort

| | Choice | Why |
|---|---|---|
| SP | 9 → **~10** | The ~9 assumed the spec row minus Linux. P1a also carries the notifications move the ceiling forces (~0.5) and the restart close-flow work. It sheds the files events (C1), the extractor helper (C11) and the bulk-rated rewire (C2, reversed). At the measured ~1.6–1.9× slip, the real figure may reach 16–19 |
| Execution | Opus · `medium` | The design is settled here, so `xhigh` no longer has a reason (WEEKLY's first guess). Sonnet · `medium` would do for Tasks 5, 8 and 12's fixtures, but one session keeps the `preload.js` prompts under the enforced main-session hook (CLAUDE.md § Best Practices: subagent shells are not covered) |
| Switch | `/effort medium` and a `/compact` before Task 1 | Natural break: plan approved |
| Final review | `/code-review max`, Opus, in a **separate chat** (ask first), plus the Codex CLI trial on the same commit | The 8+ SP row: IPC, Tier 1 and a ratings file |

---

### Task 1: Lint blocks and the glob-based source checks

Spec § 6.2 ("Lint blocks", M-1, M-2), § 9, § 15. **First**, so every new file is linted from its first commit.

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `tests/lint-guard.test.js`, `tests/media-url.test.js`, `tests/check-e2e-needed.test.js`
- Create: `tests/module-boundary.test.js`

**Interfaces:**
- Produces: lint blocks for `core/**/*.js` (browser ES module and `htmlSinkGuard`); `modules/*/ui/**/*.js` (browser ES module, `htmlSinkGuard` + M-2 merged into one `no-restricted-syntax` array, and `mv/module-imports`); `modules/*/workers/**/*.js` (worker globals, the same rules); `main/**/*.js` and `modules/*/main/**/*.js` (Node CJS, the bare-`ipcMain` ban and the non-literal `require`/`import` ban).
- Produces: `findModuleRequires(src) → string[]` (exported from the test file's helper section), plus `RENDERER_FILES` in `tests/media-url.test.js`, built as the named root list + `core/**/*.js` + `modules/*/{ui,workers}/**/*.js` read from disk.

- [x] **Step 1: Write the failing lint cases in `tests/lint-guard.test.js`**

Add to `RENDERER_FILES` the virtual paths `core/x.js`, `modules/x/ui/index.js`, `modules/x/ui/sub/y.js` and `modules/x/workers/w.js`, plus every real file matched by `core/**/*.js` (none yet). For the module globs, use the prelude `const el = createRoot();\nconst name = String(Date.now());\n`; `no-undef` is not counted, and `document.body` would trip M-2. Then add:

```js
describe.each(['modules/x/ui/index.js', 'modules/x/workers/w.js'])('M-2 in %s', (asFile) => {
    it.each([
        ['window.mediaViewer', "window.mediaViewer.loadFolder('x');"],
        ['window.electronAPI', 'window.electronAPI.moveFile({});'],
        ['a computed electronAPI', "window['electronAPI'];"],
        ['globalThis.electronAPI', 'globalThis.electronAPI;'],
        ['document.querySelector', "document.querySelector('.x');"],
        ['document.querySelectorAll', "document.querySelectorAll('.x');"],
        ['document.getElementById', "document.getElementById('x');"],
        ['document.getElementsByClassName', "document.getElementsByClassName('x');"],
        ['document.body', 'document.body.append(1);'],
    ])('flags %s', async (_l, line) => expect(await restricted(line + '\n', asFile)).toHaveLength(1));
    it.each([
        ['host calls', "host.ui.notify('x');"],
        ['a lookup under a handed-over root', "createRoot().querySelector('.x');"],
    ])('allows %s', async (_l, line) => expect(await restricted(line + '\n', asFile)).toHaveLength(0));
});
it('core may look up the document (M-2 is for modules only)', async () => {
    expect(await restricted("document.getElementById('x');\n", 'core/x.js')).toHaveLength(0);
});
```

Add an `imports(code, asFile)` helper filtered to `ruleId === 'mv/module-imports'`, with these cases in `modules/x/ui/index.js`:
- **Flagged, 1 each:** `import '../../../media-viewer.js';`, `import '../../../core/module-host.js';`, `import '../../y/ui/a.js';`, `import 'lodash';`, `export * from '../../y/ui/a.js';`, `import('../../y/ui/a.js');`.
- **Allowed:** `import './a.js';`, `import '../workers/w.js';`, `import '../../../core/host-api.js';`.

In `modules/x/workers/w.js`, `import '../ui/a.js';` is allowed and `import '../../../core/x.js';` is flagged.

M-1 lint, in `main.js`, `logger.js`, `ipc-guard.js`, `main/x.js` and `modules/x/main/a.js`:
- **Flagged, 1 each:** `require(name);`, ``require(`./${name}`);``, `import(name);`.
- **Allowed:** `require('path');`, `import('@huggingface/transformers');`.

Add the bare-`ipcMain` cases you already have, run against `main/x.js` and `modules/x/main/a.js`. The existing `ipc-guard.js` case must still pass.

- [x] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/lint-guard.test.js` from `C:/Users/alexm/Projects/media_viewer`
Expected: FAIL on the new globs (no block matches `core/x.js` or `modules/…`), on M-2, on `mv/module-imports` and on M-1.

- [x] **Step 3: Implement the blocks in `eslint.config.mjs`**

- Split today's 1c selector into `IPC_MAIN_BAN` and add `DYNAMIC_LOAD_BAN`:
  ```
  CallExpression[callee.name='require'][arguments.0.type!='Literal']
  ImportExpression[source.type!='Literal']
  ```
  - Block 1 gets `['error', ...DYNAMIC_LOAD_BAN]`.
  - 1c (`main.js`) gets `['error', ...IPC_MAIN_BAN, ...DYNAMIC_LOAD_BAN]`. Flat config replaces options per object, so 1c must carry both.
  - The `main/**`/`modules/*/main/**` block gets both.
- M-2 selectors:
  - ``MemberExpression[object.name=/^(window|globalThis|self)$/][property.name=/^(mediaViewer|electronAPI)$/]``, plus its computed `property.value` twin;
  - ``MemberExpression[object.name='document'][property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName|body)$/]``.

  Merge them into one array with `htmlSinkGuard` for the two module blocks.
- `mv/module-imports`: a local plugin object in the config file. For each `ImportDeclaration`, `ExportAllDeclaration`, `ExportNamedDeclaration` with a source, and `ImportExpression` with a literal source:
  1. Flag a specifier that does not start with `./` or `../`.
  2. Otherwise resolve it with `path.posix` against the file's repo-relative directory (`path.relative(context.cwd, context.filename)`, separators turned to `/`).
  3. Allow it only if the result starts with `modules/<id>/` (the file's own first two segments) or equals `core/host-api.js`.
- Update the header comment's block list.

- [x] **Step 4: Run the lint tests and see them pass**

Run: `npx vitest run tests/lint-guard.test.js`
Expected: PASS. Note the count; it grows by the new cases.

- [x] **Step 5: Write `tests/module-boundary.test.js` (M-1's source scan)**

- `findModuleRequires(src)` returns every string-literal argument of `require(`/`import(` that contains `modules/`, after stripping comments.
- The scanned files are block 1's `files` (read from the imported `eslint.config.mjs`, so the two lists cannot drift), plus `main/**/*.js` and `modules/*/main/**/*.js` from disk.
- Assertions:
  - A planted `require('../modules/fetch/main/gallery-dl.js')` is found.
  - No scanned file except `main/adapters/index.js` has a hit.
  - Block 1's file list includes `main.js`.
- The header states the blind spots: a non-literal argument (lint covers it), and a `require(` inside a string or regex literal.

Run: `npx vitest run tests/module-boundary.test.js`. Expected: PASS, and the planted case is the proof that it fires.

- [x] **Step 6: Make the `file:` check glob-based in `tests/media-url.test.js`**

- Build `RENDERER_FILES` from the named root list + `core/**/*.js` + `modules/*/{ui,workers}/**/*.js` on disk.
- Widen `loadedByThePage`'s three regexes to `[a-z0-9/-]+\.js`, and resolve each reference against the referring file's directory, so `./core/a.js` and a `./b.js` inside `core/` are both found.
- Add `namesFileUrl(src)` and a planted case, `namesFileUrl("x.src = 'file:///c:/a.jpg';") === true`, then use it in the existing loop.

Run: `npx vitest run tests/media-url.test.js`. Expected: PASS.

- [x] **Step 7: Pin the E2E gate for the new trees in `tests/check-e2e-needed.test.js`**

Add RUN rows for `core/module-host.js`, `modules/x/ui/index.js`, `main/folder-files.js` and `tests/e2e/fixtures/modules/x/module.json`. They pass today, since anything unlisted runs; the rows stop a later SKIP edit from swallowing them.

Run: `npx vitest run tests/check-e2e-needed.test.js`. Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add eslint.config.mjs tests/lint-guard.test.js tests/module-boundary.test.js tests/media-url.test.js tests/check-e2e-needed.test.js
git commit -m "test(lint): v2 P1a module-boundary lint blocks, each proven by a planted violation"
```

---

### Task 2: The module registry

Spec §§ 6.1, 6.5 steps 1–2, 8.1.

**Files:**
- Create: `main/module-registry.js`
- Test: `tests/module-registry.test.js`

**Interfaces:**
- Produces (CJS, no Electron import):
  ```js
  SUPPORTED_API_VERSIONS            // Object.freeze([1])
  CORE_RESERVED_FOLDER_FILES        // Object.freeze(['.bulk_rated.json', '.feature_cache.json', '.hash_cache.json',
                                    //   '.sort_cache.json', '.tournament_state.json']): today's per-folder files, which
                                    //   core still reads and writes itself; each later phase moves its names to a module
  validateManifest(json, { folderName }) → { ok: true, manifest } | { ok: false, errors: string[] }
  createModuleRegistry({ fs, roots, statePath, writer, logger, reservedFolderFiles = CORE_RESERVED_FOLDER_FILES })
    // roots: [{ dir, kind: 'app' | 'e2e' }]; writer: an atomic-write.js writer
    → { load(): Promise<void>, list(): RegistryList, setEnabled(id, enabled): Promise<RegistryList | { error }>,
        moduleDir(id): string | null, folderFileDecl(owner, name): { kind, maxBytes } | null, isActive(id): boolean }
  ```
- `RegistryList` = `{ apiVersions: [1], order: string[], restartNeeded: boolean, modules: ModuleRow[] }`
- `ModuleRow` = `{ id, name, version, description, root: 'app' | 'e2e', entryPath: 'modules/<id>/<entry>', status: 'enabled' | 'off' | 'blocked' | 'invalid', reason: string | null, enabledAtLaunch, enabledNext, defaultEnabled, requires, optional, folderFiles: [{ name, kind, maxBytes }] }`. `list()` never includes a filesystem path.

**The P1a manifest:**

| Key | Rule |
|---|---|
| `id` | `/^[a-z][a-z0-9-]{0,39}$/`, equals the folder name, not `core` |
| `name` | string, 1–60 chars |
| `version` | `/^\d+\.\d+\.\d+$/` |
| `apiVersion` | integer in `SUPPORTED_API_VERSIONS` |
| `description` | string, 0–200 chars |
| `entry` | `/^ui\/[A-Za-z0-9._\/-]+\.js$/`, no `.` or `..` segment, no `//`; a regular file at load |
| `defaultEnabled` | boolean |
| `requires`, `optional` | arrays of at most 16 ids each, no self, no duplicates, no id in both |
| `folderFiles` | at most 8 of `{ name: /^\.[A-Za-z0-9_-]{1,58}\.json$/, kind: 'cache' \| 'data', maxBytes: integer 1–268435456 }`, names unique, none in `reservedFolderFiles` ("`<name>` is owned by core") |
| `uses`, `provides`, `contributes`, `appData`, `workers`, `styles`, `jobs`, `tools`, `permissions`, `legacySettingsKeys` | absent, `[]` or `{}` (C6), else "`<key>` is not supported yet by host API v1 (arrives with a later phase)" |
| any other key | refused: "unknown key `<key>`" |

`module.json` is read as UTF-8 with any BOM stripped, and is refused over 65,536 bytes.

**Resolution (in `load()`):**
1. Each root's `realpath`. A missing root is skipped with no error.
2. Each subfolder holding `module.json`: validate, or record `invalid` with the joined errors as its reason.
3. A duplicate id across roots, or a `folderFiles` name declared by two modules: every module involved is `invalid` (C15).
4. Cycles over `requires ∪ optional`: every member is `invalid` with "dependency cycle: a → b → a".
5. In topological order (ties by id):
   - not wanted (`enabled[id] ?? defaultEnabled` is false) → `off`;
   - a required id not installed → `blocked`, "requires `<id>`, which is not installed";
   - a required module not `enabled` → `blocked`, "disabled because `<dep>` is off" (or "is not valid", or "is disabled").

   An `optional` id only affects order.
6. `order` = the topological order of every non-invalid module.
7. `modules.json`:
   - absent → `{}`;
   - unreadable or malformed → `{}` with `logger.warn('modules', …)` (C14);
   - entries for unknown ids are kept and written back unchanged.

`setEnabled(id, enabled)` refuses an unknown or `invalid` id with `{ error }`. Otherwise it writes `{ version: 1, enabled: { ...current, [id]: enabled } }` through the writer and returns `list()` with `enabledNext` updated. `restartNeeded` is true while any `enabledNext !== enabledAtLaunch`. A failed write returns `{ error }` and changes nothing in memory.

`isActive(id)` is `enabledAtLaunch && status === 'enabled'`. `folderFileDecl(owner, name)` requires `isActive(owner)` and the name in that manifest. There is no `core` owner in P1a (C2). `moduleDir(id)` returns the realpath'd folder for any non-`invalid` module, or `null`.

- [x] **Step 1: Write the failing tests**

Run every case through an in-memory `fs` fake (`readdir`, `stat`, `readFile`, `realpath`) and a recording writer:
- `validateManifest`: one valid fixture passes. Each row of the table above fails, with the error naming the key. A BOM-prefixed file parses; a 65,537-byte file is refused.
- Resolution:
  - an empty root list gives `{ modules: [], order: [] }`;
  - a missing `modules/` folder gives zero modules;
  - `requires` absent → blocked, with the reason text above;
  - the dependency off → blocked "disabled because b is off";
  - the dependency invalid → blocked "is not valid";
  - a two-module cycle → both invalid;
  - an `optional` dependency orders without blocking;
  - a duplicate id across two roots → both invalid;
  - a folder-file name shared by two modules → both invalid;
  - a module declaring `.bulk_rated.json` → invalid.
- `modules.json`: absent, malformed (`{"version":1,"enabled":[]}`), a string, a 10 MB file, and unknown ids kept on write.
- `setEnabled`: writes the exact JSON; two calls in order yield the second state; an `invalid` id is refused; a failed write leaves `list()` unchanged; `restartNeeded` flips on and back off.
- `folderFileDecl`: an active module's declared name; null for owner `'core'`; null for an off module's declared name; null for an undeclared name.
- `moduleDir`: null for an invalid module.

- [x] **Step 2: Run and see them fail**

Run: `npx vitest run tests/module-registry.test.js`. Expected: FAIL (`Cannot find module '../main/module-registry'`).

- [x] **Step 3: Implement `main/module-registry.js` to the interface above**

- [x] **Step 4: Run and see them pass, and check the count**

Run: `npx vitest run tests/module-registry.test.js`. Expected: PASS, with the count equal to the cases written.

- [x] **Step 5: Commit**

```bash
git add main/module-registry.js tests/module-registry.test.js
git commit -m "feat(modules): v2 P1a module registry - manifests, resolution, modules.json"
```

---

### Task 3: The folder-file service

Spec §§ 7.9, 8.2.

**Files:**
- Create: `main/folder-files.js`
- Test: `tests/folder-files.test.js`

**Interfaces:**
- Consumes: `registry.folderFileDecl(owner, name)` (Task 2); `atomic-write.js`'s `writeFileAtomic` and `readRecoveryCopy`; main's `assertFixedPath`.
- Produces:
  ```js
  createFolderFiles({ fs, registry, assertPath, writer, readRecoveryCopy, logger })
    → { read(owner, folder, name): Promise<ReadResult>,
        write(owner, folder, name, value): Promise<{ success: true } | { success: false, error }>,
        remove(owner, folder, name): Promise<{ success: true } | { success: false, error }> }
  // ReadResult = { status: 'ok', value, recovered: boolean } | { status: 'absent' } | { status: 'unreadable', reason: string }
  ```

**Rules:**
- An undeclared `(owner, name)` gives `unreadable`/`error`, reason "Not permitted". The guard refuses first; this is the second check.
- **read**:
  1. `assertPath(join(folder, name))`.
  2. If `lstat` size > `maxBytes`, the read is `unreadable` "too large".
  3. `JSON.parse` the text. ENOENT → `absent`.
  4. A `SyntaxError` → `readRecoveryCopy(…, { parse: JSON.parse })`: a copy gives `ok` with `recovered: true` and logs `warn('main', '<name> did not parse (…); read its last whole copy')` (today's line, generalized); no copy gives `unreadable` "does not parse".
  5. Any other error → `unreadable` with its message.
- **write**:
  1. `text = JSON.stringify(value, null, 2)` (today's bulk-rated format).
  2. `undefined` → error "not JSON".
  3. `Buffer.byteLength(text) > maxBytes` → error "too large".
  4. `writer.writeFileAtomic`.
- **remove**:
  1. `assertPath`.
  2. Unlink. ENOENT counts as success, and a directory at that name is an error.

- [x] **Step 1: Write the failing tests**

Use a temp folder (`fs.mkdtemp`), the real `atomic-write.js` writer and a stub registry. Cases:
- **read:** `ok` with `recovered: false`; `absent`; torn file + whole tmp → `ok`, `recovered: true`; torn file, no tmp → `unreadable` "does not parse"; over cap → `unreadable` "too large"; a link at the name → `unreadable`; undeclared → `unreadable` "Not permitted"; an `EACCES` stub → `unreadable`.
- **write:** round-trips through read; over cap refused, file unchanged; `undefined` refused; undeclared refused, nothing written.
- **remove:** removes; absent counts as success; undeclared refused, file kept.

- [x] **Step 2: Run and see them fail.** Run: `npx vitest run tests/folder-files.test.js`. Expected: FAIL (module missing).
- [x] **Step 3: Implement `main/folder-files.js`**
- [x] **Step 4: Run and see them pass.** Expected: PASS, with the count checked.
- [x] **Step 5: Commit**

```bash
git add main/folder-files.js tests/folder-files.test.js
git commit -m "feat(modules): v2 P1a folder-file service - tagged read, atomic write, delete"
```

---

### Task 4: The app scheme serves `core/` and module roots

Spec § 9 (allowlist row), § 6.4 (roots).

**Files:**
- Modify: `app-protocol.js`
- Test: `tests/app-protocol.test.js`

**Interfaces:**
- Produces: `createAppProtocol({ appRoot, resolveModuleDir = () => null, resolveMediaRead, getMimeType, csp, logger })`.
- Produces: exported pure `moduleFilePath(segments, resolveModuleDir) → string | null`.
- Changes: `isServedAppPath(segments)` also admits `['core', …, '<name>.js|.css']` (two or more segments).

**`moduleFilePath` rules:**
- `segments[0] === 'modules'`, and `dir = resolveModuleDir(segments[1])` must be non-null.
- `rest = segments.slice(2)` is admitted iff:
  - `rest` is exactly `['module.json']`, or
  - `rest[0]` is `ui` or `workers`, with two or more segments, ending in `.js`, `.json`, `.css` or `.wasm`.
- Returns `path.join(dir, ...rest)`.
- `serveAppFile` takes its `joined` path from the static rule (as today) or from this, then applies today's realpath-equals-joined check, so a link inside a module folder is refused like one in the app folder.

- [x] **Step 1: Write the failing tests**

- **Served (200):** `core/a.js`, `core/sub/b.css`, `modules/m/module.json`, `modules/m/ui/index.js`, `modules/m/ui/x/y.css`, `modules/m/workers/w.js`, `modules/m/workers/d.wasm`. Each comes from a temp root with `resolveModuleDir` mapping `m`.
- **404:**
  - `core/a.json`, `core/.hidden.js`;
  - `main/folder-files.js`, `modules/m/main/a.js`, `modules/m/package.json`, `modules/m/ui`;
  - `modules/unknown/ui/index.js` (resolver returns null);
  - `modules/m/ui/../main/a.js` (encoded `%2E%2E`);
  - a link at `modules/m/ui/link.js`.

- [x] **Step 2: Run and see them fail.** Run: `npx vitest run tests/app-protocol.test.js`. Expected: FAIL on the new cases.
- [x] **Step 3: Implement**
- [x] **Step 4: Run and see them pass.** Expected: PASS; the existing cases are unchanged.
- [x] **Step 5: Commit** `feat(protocol): v2 P1a - serve core/ and module roots, never main code`

---

### Task 5: Renderer log hardening

Spec § 8.7.

**Files:**
- Modify: `logger.js` (`normalizeRendererLogEntry`, and a new export `sanitizeLogText(text, max)`), `main.js`'s `log-perf` handler
- Test: `tests/logger.test.js`

**Interfaces:**
- Produces: `sanitizeLogText(text, max) → string`. Every run of `[\r\n]+` becomes ` ⏎ `, and text over `max` is cut to `max` with `… [+N chars]` appended.
- `normalizeRendererLogEntry`:
  - `message` → `sanitizeLogText(message, 8000)`;
  - `source` kept only if it matches `/^[a-z][a-z0-9:-]{0,63}$/`, else `'renderer'`.
- `log-perf` → `logger.logPerf(sanitizeLogText(message ?? '', 2000))`.

- [x] **Step 1: Failing tests**:
  - `'a\nb\r\nc'` → `'a ⏎ b ⏎ c'`;
  - 8,001 chars → 8,000 + `… [+1 chars]`;
  - a `source` of `'x]\n[main'` → `'renderer'`;
  - `'module:e2e-empty'` kept;
  - `'hash-pool'` kept.

  The existing normalize cases are unchanged.
- [x] **Step 2: Run and see them fail.** Run: `npx vitest run tests/logger.test.js`.
- [x] **Step 3: Implement**
- [x] **Step 4: Run and see them pass**
- [x] **Step 5: Commit** `fix(logger): fold newlines, cap length and restrict source on renderer log lines (v2 § 8.7)`

---

### Task 6: Main wiring, module IPC, restart, the bridge additions and the bridge-surface test

Spec §§ 6.5, 7.13 (isolation), 8.1, 8.8.

**Files:**
- Create: `main/module-ipc.js`
- Modify: `main.js`, `preload.js` (Tier 1)
- Create: `tests/bridge-surface.test.js`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `registerModuleIpc({ guard, registry, folderFiles })` registers:
  - `list-modules` `[]` → `registry.list()`, `rejectValue: null`;
  - `set-module-enabled` `[kinds.string, oneOf(true, false)]` → `registry.setEnabled`;
  - `folder-file-read` `[ownerKind, kinds.grantedPath, declaredName]`, `rejectValue: { status: 'unreadable', reason: 'Not permitted' }`;
  - `folder-file-write` `[ownerKind, kinds.grantedPath, declaredName, kinds.any]` (default reject);
  - `folder-file-delete` `[ownerKind, kinds.grantedPath, declaredName]` (default reject).

  With `ownerKind = (v) => typeof v === 'string' && registry.isActive(v)` (no `core` owner in P1a, C2) and `declaredName = (v, args) => kinds.basename(v) && registry.folderFileDecl(args[0], v) !== null`.
- `main.js`, in `whenReady` after the grant load:
  - `stateDir = process.env.MV_E2E_STATE_DIR || app.getPath('userData')`;
  - roots: `[{ dir: path.join(APP_ROOT, 'modules'), kind: 'app' }]`, plus `{ dir: process.env.MV_E2E_MODULE_ROOT, kind: 'e2e' }` only when **both** env vars are set;
  - `modules.json` at `path.join(stateDir, 'modules.json')`;
  - a second `createAtomicWriter` whose `assertPath` refuses a link (lstat; ENOENT is fine);
  - `await registry.load()`, then `console.log('Modules: <n> found, <n> enabled')`;
  - the protocol gets `resolveModuleDir: (id) => registry.moduleDir(id)`;
  - `createFolderFiles({ fs, registry, assertPath: assertFixedPath, writer: atomicWriter, readRecoveryCopy, logger })`, then `registerModuleIpc`;
  - `global.__mvModules = registry` inside the existing `MV_E2E_GRANTS_FILE` block.
- `restart-app` in `main.js` (C8). Hoist `app-close-allow`'s identity check into `const isMainWindowSender = (event) => …` and give it to both:
  ```js
  guard.on('restart-app', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
          console.log('Restart requested: relaunching after close');
          app.relaunch();
          isQuitting = true;
          mainWindow.close();
      }
  }, { isTrusted: isMainWindowSender });
  ```
- **`preload.js` delta (Tier 1, for approval)**, added after `writeBulkRatedFile`:
  ```js
      // Modules (v2 P1a): main's resolved list, the toggle (it takes effect on restart), and the restart, which the
      // renderer sends only once its own close flow has run.
      listModules: () => ipcRenderer.invoke('list-modules'),
      setModuleEnabled: (id, enabled) => ipcRenderer.invoke('set-module-enabled', id, enabled),
      restartApp: () => ipcRenderer.send('restart-app'),
      // Per-folder files by owner and declared name (v2 P1a): main checks that the owner declared the name.
      folderFileRead: (owner, folderPath, name) => ipcRenderer.invoke('folder-file-read', owner, folderPath, name),
      folderFileWrite: (owner, folderPath, name, value) =>
          ipcRenderer.invoke('folder-file-write', owner, folderPath, name, value),
      folderFileDelete: (owner, folderPath, name) => ipcRenderer.invoke('folder-file-delete', owner, folderPath, name),
  ```

- [x] **Step 1: Write `tests/bridge-surface.test.js`, failing**

- `surfaceOf(src)` runs a preload source through `new Function('require', 'window', 'console', src)`. Its fake `require` returns:
  - `electron`: a `contextBridge` that captures `exposeInMainWorld`, and an `ipcRenderer` whose `invoke`/`send`/`on` record their channel;
  - `path`: Node's `path`.

  It then calls every function key once with placeholder arguments and returns `{ [key]: [method, channel] }`, with `path.*` as `['path', null]`.
- Assertions:
  1. `surfaceOf(read('preload.js'))` deep-equals a pinned `EXPECTED`: today's 39 top-level keys (`path` counted once, with its four functions) plus the six above.
  2. A planted copy with one extra key does **not** equal `EXPECTED`.
  3. Every `invoke`/`send` channel appears in `/guard\.(?:handle|on)\(\s*'([^']+)'/g` over `main.js` + `main/**/*.js`.
  4. Every `on` channel (`clip-download-progress`, `app-close-requested`) appears as a quoted string in `main.js`.

- [x] **Step 2: Run and see it fail.** Run: `npx vitest run tests/bridge-surface.test.js`. Expected: FAIL; the six keys and channels are missing.
- [x] **Step 3: Implement `main/module-ipc.js`, the `main.js` wiring and the `preload.js` delta.** The edit prompts. That is the Tier-1 approval at work, not a fault.
- [x] **Step 4: Run the bridge test and the whole unit suite.** Run: `npx vitest run`. Expected: PASS, with `main-hardening` unchanged.
- [x] **Step 5: Smoke the app.** Run `npm start`, check the session log has `Modules: 0 found, 0 enabled`, then quit.
- [x] **Step 6: Commit** `feat(modules): v2 P1a module IPC, restart-app and the bridge-surface pin`

---

### Task 7: (removed 2026-11-11, C2 reversed)

The bulk ratings stay on `readBulkRatedFile`/`writeBulkRatedFile` in P1a. They move once, in P4b, straight onto `host.store.folderFile`. The numbering of later tasks is kept.

---

### Task 8: Notifications move to `core/notifications.js` (C3)

**Files:**
- Create: `core/notifications.js`
- Modify: `media-viewer.js` (`showNotification` becomes a delegate; `this.notifier` is built in `initializeElements` right after `notificationContainer`), `tests/similarity-sort-glue.test.js` (:2466 imports `Notifier` directly)

**Interfaces:**
- Produces: `export class Notifier { constructor({ container, autoCloseErrors /* () => boolean */ }); show(message, type = 'success', options = {}) → HTMLElement }`, with today's `showNotification` body moved unchanged (`this.notificationContainer` → `this.container`; `this.autoCloseErrors` → `this.autoCloseErrors()`).
- `MediaViewer.showNotification(message, type = 'success', options = {}) { return this.notifier.show(message, type, options); }`.

- [x] **Step 1: Repoint the glue test at `new Notifier({ container: container(), autoCloseErrors: () => true }).show(…)`, with the same assertions.** It fails until the file exists. Run: `npx vitest run tests/similarity-sort-glue.test.js -t "returns its element"`. Expected: FAIL.
- [x] **Step 2: Move the body; add the delegate; build the notifier**
- [x] **Step 3: Run the unit suite and `wc -l media-viewer.js`.** Expected: PASS, and about −92 lines.
- [x] **Step 4: Commit** `refactor(core): move the notification system to core/notifications.js`

---

### Task 9: The module host

Spec §§ 6.3 ("When a module's code throws"), 6.5 step 3, 7.1–7.3 (P1a part), 7.9, 7.13.

**Files:**
- Create: `core/host-api.js` (JSDoc typedefs for `Host`, `Visit`, `FileEntry`, `ReadResult`, `ModuleExports`; `export {};`)
- Create: `core/module-host.js`
- Test: `tests/module-host.test.js`

**Interfaces:**
- Consumes: `RegistryList` (Task 2) via `api.listModules()`.
- Produces:
  ```js
  export const ACTIVATION_TIMEOUT_MS = 5000;
  export class ModuleHost {
      constructor({ api, notify, getFiles, importModule, timeoutMs = ACTIVATION_TIMEOUT_MS, storage = globalThis.localStorage })
      // api: { listModules, folderFileRead, folderFileWrite, folderFileDelete, logError, logPerf }
      // importModule default: (entryPath) => import(new URL(entryPath, document.baseURI).href)
      start(): Promise<void>            // idempotent; never rejects
      ready: Promise<void>              // settles when start() does
      testApis: object                  // id → testApi; MediaViewer exposes it as this.modules
      list(): RegistryList | null       // as fetched at start
      outcome(id): { state: 'active' | 'failed' | 'blocked', reason } | null
      beginVisit(folderPath, files): void
      endVisit(): void                  // synchronous
      deactivateAll(): Promise<void>    // reverse activation order; never rejects
  }
  ```
- **The per-module host** (frozen, every group frozen):
  - `module: { id, version }`
  - `log.error(msg, detail?)` → `api.logError({ level: 'error', message: detail ? `${msg}: ${detail}` : msg, source: `module:${id}` })`; `log.perf(line)` → `api.logPerf(`[${id}] ${line}`)`
  - `settings.get(key, fallback)` / `settings.set(key, value)`: the key matches `/^[A-Za-z0-9_.-]{1,64}$/` or the call throws. Storage key `module.<id>.<key>`, JSON. `get` returns `fallback` on a missing key or a parse error; `set` catches and logs a storage failure.
  - `ui.notify(message, level = 'info', { sticky = false, action } = {})`: level is one of `info|success|warning|error`, else `info`. `action = { label, run }` maps to `actionButton`/`actionCallback`. Returns `{ close() }`.
  - `folder.current()` → `{ path, name } | null`; `folder.onLoaded(fn)` and `folder.onVisitEnd(fn)` each return a disposer.
  - `files.list()` → a frozen snapshot of `{ name, path, size, mtimeMs, type }` from `getFiles()`.
  - `store.folderFile(name)`: an undeclared name throws `Error("<id>: folder file <name> is not declared in module.json")`. It returns `{ read(visit), write(visit, value), delete(visit) }`.
    - A visit from another host throws.
    - A visit not live at the call gives `{ status: 'unreadable', reason: 'visit ended' }` / `{ success: false, error: 'visit ended' }`, with no IPC.
    - An inactive module gives the same, with reason `'module is not active'`.
    - Otherwise the IPC is issued **synchronously**, so the value is cloned at the call (C9), and a rejection maps to `unreadable` / `{ success: false, error }`.
- **Activation:**
  - For each id in `list.order` whose row is `enabled`: if any `requires` entry has an outcome other than `active`, the module is `blocked`, "disabled because <dep> failed to start". Otherwise `importModule(entryPath)`, then `activate(host)`, under **one** `timeoutMs` race.
  - A result `{ deactivate?, testApi? }` makes it `active`. A throw, a non-function `activate` or the timeout makes it `failed` with the error text (timeout: "did not finish activating within 5 s"), sent through `api.logError`, and the module's host is disposed.
  - When `listModules` throws or returns `null`, the error is logged and there are zero modules.
- **Visits:**
  - `beginVisit` ends any live visit first. It creates `Visit = Object.freeze({ id, folder, isLive })` and calls each `onLoaded(visit, files)`, without awaiting. The snapshot is built only if a handler exists. A handler's throw or rejection is logged with its module id.
  - `endVisit` calls each `onVisitEnd(visit)` while the visit is still live, then marks it dead. It is idempotent.

- [x] **Step 1: Write the failing tests**

Use a fake `api`, a fake `importModule` returning crafted module objects, fake timers and a `Map`-backed storage.

Activation:
- order follows `list.order`;
- throw → failed + logged with `source: 'module:x'`;
- the timeout at 5,000 ms (not 4,999) → failed, and a later resolve is ignored;
- a dependent of a failed module is blocked with the reason text;
- a non-`enabled` row is not imported;
- `listModules` rejects → `ready` resolves and there are zero modules;
- `testApis` is filled only for active modules.

Host:
- frozen, so assigning `host.x` throws in strict mode;
- the settings key namespace, the fallback on bad JSON, a bad key throws;
- notify maps the action;
- log prefixes.

Visits and store:
- `onLoaded` gets the live visit and the snapshot;
- no snapshot is built when nothing listens (spy on `getFiles`);
- a throwing handler does not stop the next one;
- a write inside `onVisitEnd` reaches `api.folderFileWrite` with the old folder;
- a write after `endVisit` is refused with no IPC;
- a read of an ended visit is refused;
- an undeclared name throws;
- a failed module's store refuses;
- `deactivateAll` runs in reverse order and survives a throwing `deactivate`.

- [x] **Step 2: Run and see them fail.** Run: `npx vitest run tests/module-host.test.js`. Expected: FAIL.
- [x] **Step 3: Implement**
- [x] **Step 4: Run and see them pass; check the count**
- [x] **Step 5: Commit** `feat(core): v2 P1a module host - loader, per-module host, visits`

---

### Task 10: MediaViewer wiring and Restart through the close flow

**Files:**
- Modify: `media-viewer.js`
- Test: `tests/rating-data-safety-glue.test.js` (the close-flow cases live there), `tests/media-viewer-utils.test.js` (`loadFolder` mocks gain `moduleHost`)

**Interfaces:**
- Consumes: `ModuleHost` (Task 9).
- Changes:
  - **Constructor:** after `initializeElements()`, build `this.moduleHost = new ModuleHost({ api: window.electronAPI, notify: (…a) => this.showNotification(…a), getFiles: () => this.mediaFiles })`, then `this.modules = this.moduleHost.testApis`, then `this.moduleHost.start()` (not awaited).
  - **`loadFolder`:** `await this.moduleHost.ready;` right after `this.showLoadingSpinner()`, inside the `try` that holds `_folderLoadInFlight`, so a wait on a slow module shows the spinner.
  - **Visit begin:** `this.moduleHost.beginVisit(folderPath, this.mediaFiles)` right after each of the two `featureCacheStore.beginVisit(folderPath)` calls.
  - **Visit end:** `this.moduleHost.endVisit()` right after each of the two `featureCacheStore.endVisit()` calls (`loadFolder`, `_switchToFolderNow`).
  - **`handleAppCloseRequest({ restart = false } = {})`:**
    - The in-flight branch allows a close only when `!restart`, and a restart pressed during a close-save is ignored.
    - The leave-prompt continuation and the plain branch pass `restart` to `_saveThenAllowClose(restart)`.
    - The catch calls `restart ? restartApp() : allowAppClose()`.
    - The main-close listener at :2655 still calls it with no argument.
  - **`_saveThenAllowClose(restart = false)`:** its `finally` calls `window.electronAPI[restart ? 'restartApp' : 'allowAppClose']()`.
  - **`_settleSavesForClose`:** after the file-action wait, `this.moduleHost.endVisit()`, then `this.moduleHost.deactivateAll()` joins the `allSettled` list.

- [x] **Step 1: Write the failing glue cases**
  - restart + no tournament → after the saves, `restartApp` is called once and `allowAppClose` never;
  - restart + an unfinished tournament → the leave prompt opens, and its continuation calls `restartApp`;
  - restart, then the prompt's Cancel → neither call, and a later plain close calls `allowAppClose`, not `restartApp`;
  - a main close request while a restart save is in flight with the note shown → `allowAppClose`, never `restartApp`;
  - `_settleSavesForClose` calls `endVisit` before `deactivateAll`;
  - `loadFolder` awaits `ready` before `window.electronAPI.loadFolder` (a never-resolving `ready` means no listing call).

  Run: `npx vitest run tests/rating-data-safety-glue.test.js`. Expected: FAIL.
- [x] **Step 2: Implement the wiring**
- [x] **Step 3: Run the whole unit suite.** Run: `npx vitest run`. Expected: PASS.
- [x] **Step 4: Measure.** `wc -l media-viewer.js` must still be below 11,597, and the number goes in the log.
- [x] **Step 5: Commit** `feat(modules): wire the module host into folder visits, quit and restart`

---

### Task 11: The Modules section

Spec § 10 (P1a part, C4, C10).

**Files:**
- Create: `core/modules-panel.js`
- Modify: `index.html` (a `.shortcut-section.modules-section#modulesSection` after the Settings section: `<h4>Modules</h4>`, `#modulesList`, and a hidden `#modulesRestartBar` holding "Restart to apply" and `#modulesRestartBtn` "Restart now"), `styles.css` (`.modules-list`, `.module-row`, `.module-row-status`, `.modules-restart-bar`, from existing tokens), `media-viewer.js` (construct and render after `ready`)
- Test: `tests/modules-panel.test.js`

**Interfaces:**
- Produces:
  ```js
  export function describeModuleRows(list, outcomeOf) → { empty: boolean, restartNeeded: boolean,
      rows: [{ id, name, version, description, checked, toggleDisabled, status }] }
  export class ModulesPanel {
      constructor({ root, api /* { setModuleEnabled } */, notify, getList, outcomeOf, requestRestart })
      render(): void
  }
  ```
- Status text:
  - `invalid` → `Not valid: <reason>`
  - `off` → `Off`
  - `blocked` → the reason, capitalized
  - `enabled` with outcome `active` → `On`; `failed` → `Failed: <reason>`; `blocked` → the reason, capitalized
  - When `enabledNext !== enabledAtLaunch`, append ` — restart to apply`.
  - `checked = enabledNext`; `toggleDisabled = status === 'invalid'`.
- A null or empty list gives `empty: true`, and the panel shows "No modules yet".
- On a toggle the panel awaits `api.setModuleEnabled`. On `{ error }` or `null` it reverts the box and calls `notify('Could not save the module setting: <error>', 'error')`. Otherwise it stores the new list and re-renders. The restart bar shows iff `restartNeeded`. "Restart now" calls `requestRestart()`, which is `() => this.handleAppCloseRequest({ restart: true })`.
- The DOM is built with `createElement`/`textContent` only (lint-enforced).

- [x] **Step 1: Write the failing row-model tests**: every status row above; the restart suffix; `empty` for a null and an empty list; `toggleDisabled` only for invalid. Run: `npx vitest run tests/modules-panel.test.js`. Expected: FAIL.
- [x] **Step 2: Implement; wire `this.moduleHost.ready.then(() => this.modulesPanel.render())`**
- [x] **Step 3: Run the units and lint.** Run: `npx vitest run` and `npm run lint`. Expected: PASS.
- [x] **Step 4: Smoke it.** `npm start`, F1: the Modules section reads "No modules yet".
- [x] **Step 5: Commit** `feat(modules): the Modules section in F1 - rows, toggle, restart`

---

### Task 12: E2E isolation, fixture modules and the exit-criteria suite

Spec § 7.13 (per-launch isolation), § 14 exit criteria.

**Files:**
- Modify: `tests/e2e/helpers/electron-app.js`
- Create: `tests/e2e/fixtures/modules/{e2e-empty,e2e-throws,e2e-hangs,e2e-needs-throws,e2e-needs-empty,e2e-storage,e2e-invalid}/` (each `module.json` + `ui/index.js`; all `defaultEnabled: false`)
- Create: `tests/e2e/modules.test.js`

**Interfaces:**
- `launchApp({ migrationMarker, env, stateDir, moduleRoot, modulesEnabled } = {})`:
  - `MV_E2E_STATE_DIR` is `stateDir` when given (the caller owns and removes it), else the per-launch grants folder, which `closeApp` already removes.
  - `moduleRoot` sets `MV_E2E_MODULE_ROOT`.
  - `modulesEnabled` writes `{ version: 1, enabled: modulesEnabled }` to `<stateDir>/modules.json` before launch.
  - An inherited `MV_E2E_STATE_DIR` or `MV_E2E_MODULE_ROOT` is dropped, the same way `MV_HASH_PARITY` is.
  - Exports `MODULE_FIXTURES_DIR`.
- **Fixtures:**
  - `e2e-empty` returns `{ testApi: { activated: true, hostKeys: Object.keys(host).sort() }, deactivate() {} }`.
  - `e2e-throws` throws `Error('e2e-throws: planted activation failure')`.
  - `e2e-hangs` returns a promise that never settles.
  - `e2e-needs-throws` and `e2e-needs-empty` require those two.
  - `e2e-storage` declares `{ name: '.e2e_module_state.json', kind: 'data', maxBytes: 4096 }`, records every `onLoaded` visit and `onVisitEnd`, and exposes `testApi` methods `read()`, `write(v)`, `remove()` (against its newest visit), `writeTo(visitIndex, v)` and `readUndeclared()`.
  - `e2e-invalid`'s manifest `id` is `e2e-other`.

- [x] **Step 1: Write `tests/e2e/modules.test.js`**
  1. **Default launch, no root:** F1's `#modulesSection` reads "No modules yet"; `window.mediaViewer.modules` deep-equals `{}`; a folder loads and a like moves a file.
  2. **Fixture root + `e2e-empty` enabled:** `modules['e2e-empty'].activated === true`, and `hostKeys` deep-equals `['files','folder','log','module','settings','store','ui']`.
  3. **`e2e-throws` + `e2e-needs-throws` enabled:**
     - the row texts are "Failed: e2e-throws: planted activation failure" and "Disabled because e2e-throws failed to start";
     - the session log has a `module:e2e-throws` line;
     - a folder loads and a like still moves the file.
  4. **`e2e-hangs` enabled:** the row reads "Failed: did not finish activating within 5 s", and a folder loaded right after launch shows media within 10 s.
  5. **Discovery-time statuses:** `e2e-invalid` reads "Not valid: …folder name…", and `e2e-needs-empty` enabled with `e2e-empty` off reads "Disabled because e2e-empty is off".
  6. **Toggle and restart:**
     1. With an explicit `stateDir`, turn `e2e-empty` on in F1. The restart bar shows, and `<stateDir>/modules.json` has `"e2e-empty": true`.
     2. Stub `app.relaunch` in main to `() => console.log('MV_E2E relaunch stub')`, then click "Restart now" and await the app's `close` event.
     3. The newest session log has both `Restart requested` and `MV_E2E relaunch stub`, the second after the first.
     4. `launchApp` again with the same `stateDir`: `modules['e2e-empty'].activated === true`.
  7. **Storage through the visit:** enable `e2e-storage` and load a temp folder.
     - `write({ n: 1 })` puts that JSON on disk; `read()` gives `{ status: 'ok', value: { n: 1 }, recovered: false }`; `remove()` deletes it, and the next `read()` is `absent`.
     - After a second folder loads, `writeTo(0, …)` gives `{ success: false, error: 'visit ended' }` and nothing is written into either folder.
     - `readUndeclared()` throws "not declared".
  8. **Main refuses an inactive owner:** with `e2e-storage` off, `window.electronAPI.folderFileRead('e2e-storage', <granted folder>, '.e2e_module_state.json')` gives `{ status: 'unreadable', reason: 'Not permitted' }`.
  9. **Isolation:** a launch that toggles `e2e-empty` on, then a fresh `launchApp({ moduleRoot })` with no `stateDir`: the module is off.
- [x] **Step 2: Run it.** Run: `npx playwright test tests/e2e/modules.test.js`. Expected: FAIL first on the missing helper options; implement them; then PASS.
- [x] **Step 3: Run the full E2E suite.** Run: `npm run test:e2e`. Expected: PASS. If a launch exits with `0xC0000142` under low memory, record it as environment and rerun only that file (memory: E2E memory guard).
- [x] **Step 4: Commit** `test(e2e): v2 P1a - modules load, fail safely, cascade, toggle; per-launch module state`

---

### Task 13: Docs, rules and the line ceiling

**Files:** `CLAUDE.md`, `.claude/rules/core.md`, `.claude/rules/modules.md`, `docs/ARCHITECTURE.md`, `PROJECT.md`, `docs/README.md`, `docs/planning/plans/README.md`, the v2 spec, `scripts/renderer-line-ceiling.txt`

- [x] **Step 1: `.claude/rules/core.md`** (`paths: ["core/**"]`): the moved notification rule (sticky: exempt from the prunes; the action button leaves closing to the caller; returns the element) and the v2.0 pattern for core classes.

  **`.claude/rules/modules.md`** (`paths: ["modules/**", "main/**", "core/module-host.js", "core/host-api.js", "core/modules-panel.js", "tests/e2e/fixtures/modules/**"]`):
  - M-1 and M-2, each with its control;
  - the strict manifest and how a later phase widens it (C6);
  - visit liveness at the call (C9);
  - the 5 s timeout and the cascade;
  - restart only through the close flow (C8);
  - `MV_E2E_STATE_DIR` / `MV_E2E_MODULE_ROOT` and `launchApp`'s options;
  - "a failed folder-file read is never absent".

  Every cited `CLAUDE.md` heading is kept.
- [x] **Step 2: `CLAUDE.md`**:
  - Architecture tree: `core/`, `modules/`, `main/`, `tests/e2e/fixtures/modules/`, one line each;
  - § Error Handling: "via the notification system (`core/notifications.js`)", with the moved sentence removed;
  - § Testing (E2E): `launchApp`'s new options, in one clause;
  - § Security: the new channels and the served module roots, in one clause.

  Record the bytes before and after.
- [x] **Step 3: Rule-loss check, with a planted control** (G5 size-audit spec § 7). A fresh agent at this session's tier gets `CLAUDE.md` from `main`, and the new `CLAUDE.md` + both rules files with one more rule quietly deleted from a scratch copy. It lists every old rule as present, reworded or missing. If it misses the planted deletion, redo the check. Every other "missing" is restored.
- [x] **Step 4: `docs/ARCHITECTURE.md`**: rewrite the file tree (this closes 🟤 "`docs/ARCHITECTURE.md`'s file tree omits every extracted module"), and replace "Extension Points" with the module architecture: roots, registry, host, folder-file service, M-1/M-2, restart. **`PROJECT.md`**: the structure table and the line count.
- [x] **Step 5: The spec.** Add a § 21 row: "v2 P1a plan (2026-11-11): C1–C15", one clause each for C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11. Add a dated note on § 14 "Every phase also" item 4: the G5 note above.
- [x] **Step 6: Indexes.** Add this plan to `docs/README.md` § Active Plans and to `docs/planning/plans/README.md`'s Current Plans table.
- [x] **Step 7: The ceiling.** After merging `main` (G2), set `scripts/renderer-line-ceiling.txt` to the exact `wc -l media-viewer.js`. Record `wc -l core/*.js` and the sum against GOALS G-7's 11,945 in this plan's log.
- [x] **Step 8: Commit** `docs: v2 P1a - architecture, rules files, spec § 21, line ceiling`

---

### Task 14: Verify

- [ ] `npx vitest run` (record the count), `npm run lint`, `npm run format:check`
- [ ] `npm run test:e2e` (the pre-push hook runs it anyway; record the count)
- [ ] `/security-review` of the branch; each finding answered in this plan's log (spec § 15)
- [ ] Mutation checks, each in a scratch copy, never the shared checkout (memory: mutate in a copy):
  1. `folder-file-read`'s `rejectValue` set to `{ status: 'absent' }` → a Review Focus 1 test fails;
  2. `endVisit` marks the visit dead before calling the handlers → the "write inside `onVisitEnd`" test fails;
  3. the timeout set to 6,000 → the 5,000 ms test fails;
  4. `ownerKind` accepting any string → E2E 8 fails;
  5. `isServedAppPath` admitting `main` → an app-protocol 404 case fails.
- [ ] Manual smoke on a copy of the real profile (`MV_USER_DATA_DIR`, since P1a changes the quit flow that saves ratings):
  1. open a folder that has bulk ratings, and check they load;
  2. rate "Both good" and undo;
  3. F1 shows "No modules yet";
  4. quit, and check the log has `Quit save:`.
- [ ] Re-run Step 1's units and lint after any fix

### Task 15: PR, review and close-out (after the user's approval)

- [ ] Push, then check the PR's commit list (a shared checkout can add commits); open the PR with the line counts and the security-review summary
- [ ] Review in a separate chat (`/code-review max`, asked first) and the Codex CLI trial on the same commit (WEEKLY G1 fourth item: record the model, `/status`, allowance and wall time)
- [ ] After merge, the close-out per `~/.claude/rules/planning-closeout.md`, including:
  - flip P1a's rows on ROADMAP's v2 table and GOALS G-1 and G-2 by hand;
  - check off 🟤 "`docs/ARCHITECTURE.md`'s file tree…" and 🟤 "Note at v2 P1a's planning…";
  - add a dated note to 🟤 "Extract `extractAsyncMethod`…" (moved to P1b, C11) and to 🟤 "Extend the size warning to `.claude/rules/*.md`…" (due now, Cleanup Week #6, C13)

---

## 4. Implementation Log

### 2026-11-11 — PHASE: Planning
- The user skipped the brainstorm questions; the approved v2 spec is the design. C1–C15 are Claude's calls, listed for review.
- C2 reversed the same day, on a side agent's flag and with the user's agreement: no existing folder file moves in P1a, and the bulk ratings move once, in P4b. Task 7 was removed (numbering kept), and `core` reserves today's five folder-file names instead of owning one. SP ~11 → ~10.
- **Approved by the user** ("Looks right"), with C1–C15 as written and C2 reversed. The approval covers Task 6's `preload.js` delta (six additions, no removals) as the Tier-1 sign-off; each edit still prompts. **Execution: Native**, chosen by the user, in one session after `/compact`. The plan is uncommitted at approval; it goes in with Task 1's first commit, or a `docs(plan)` commit just before it.
- Measured at `d7b0fb8`: `media-viewer.js` 11,597 lines, equal to the ceiling; no `core/`, `modules/` or `main/`; F1 has no tabs; `readBulkRatedFile`/`writeBulkRatedFile` have 2 renderer call sites, 2 E2E files and 12 unit mock sites.

### 2026-11-11 — PHASE: Implementation (Native, one session)
- **Task 1 done.** Lint blocks 1d (`main/**`, `modules/*/main/**`), 2d (`core/**`), 2e/2f (module `ui/`, `workers/`); M-1 on block 1 and 1c; M-2 merged with the HTML sink guard; local rule `mv/module-imports`. `tests/lint-guard.test.js` 240 → 331 (90 new cases failed first, all on the expected groups), `tests/module-boundary.test.js` 4, `tests/media-url.test.js` 12, `tests/check-e2e-needed.test.js` 81. Whole-repo lint unchanged (0 errors, the same 2 warnings as `main`).
  - Ruling: `mv/module-imports` also flags an `import()` of a computed name in module code (the plan named literal sources only). A computed name is a hole no reader can check; P1a modules need none. Cost if wrong: one case and one message to drop.
  - Ruling: in `media-url.test.js`'s walk, an `import`/`importScripts` resolves against the referring file, a `<script src>`/`new Worker` URL against the page (the plan said "the referring file" for all). That is how the browser resolves them. Cost if wrong: none today, every worker is at the root.

- **Task 2 done.** `main/module-registry.js`; `tests/module-registry.test.js` 92 cases (RED on the missing module first).
  - Ruling: required manifest keys are `id`, `name`, `version`, `apiVersion`, `entry`, `defaultEnabled`; `description`, `requires`, `optional`, `folderFiles` default to `''`/`[]` (the plan's table did not say which are required). Cost if wrong: a fixture manifest gains or loses a key.
  - Ruling: a module folder whose realpath differs from its joined path (a link) is `invalid`, so `moduleDir` never hands the protocol a folder outside its root. Cost if wrong: one refusal to relax.
  - Ruling: `setEnabled` calls run one at a time, each from the last written state, so two quick toggles of different modules both reach disk (the writer's per-target queue alone kept only the last). Cost if wrong: none.
  - Ruling: `modules.json` over 65,536 bytes counts as unreadable (defaults, one warning), like the manifest cap. Cost if wrong: one constant.

- **Task 3 done.** `main/folder-files.js`; `tests/folder-files.test.js` 18 cases (RED on the missing module first).
  - Ruling: write and delete of one file run one at a time in call order inside the service, so a delete asked for after a write is never overtaken by it (the atomic writer orders writes only). Cost if wrong: none; a few lines.
  - Ruling: a folder at the name, on read, is `unreadable` "not a file" (the plan named only the delete case). Cost if wrong: none.

- **Task 4 done.** `app-protocol.js` serves `core/**` (`.js .css`) and module files through `moduleFilePath`; `tests/app-protocol.test.js` 77 → 100 (11 new cases failed first; the link cases passed before, as refusals should).
  - Note for Task 6: the protocol compares Node's JS realpath, so the registry must get the JS realpath too (`fs.promises.realpath` is the native one, which resolves a subst or mapped drive and would refuse every module file). Task 6 passes `{ ...fs.promises, realpath: promisify(fs.realpath) }`.

- **Security review of Task 3** (`cc72c66`; the background commit scan, three MEDIUM findings), fixed with failing tests first:
  1. A case differential: NTFS folds case, so a declared `.BULK_RATED.json` was core's ratings file on disk. Folder-file names are now lower-case ASCII only (the plan's regex allowed `A-Z`), and `folder-files.js` also refuses any name that is a core name once ASCII-folded.
  2. The cap bounded the result, not the read: a file that grew after its size check was read whole. Reads now go through one handle and stop at `maxBytes + 1` bytes.
  3. The recovery read had no cap: a planted huge tmp beside a torn file was read whole. It now goes through the same bounded read, and a tmp over the cap is skipped.
  - `tests/folder-files.test.js` 18 → 21, `tests/module-registry.test.js` 92 → 94; all five new cases failed first.
  - Ruling: folder-file names are lower-case only (deviates from the plan's `[A-Za-z0-9_-]`). Cost if wrong: a module author renames a file.

- **Task 5 done.** `logger.sanitizeLogText`; `normalizeRendererLogEntry` folds, caps at 8,000 and restricts `source`; `log-perf` caps at 2,000. `tests/logger.test.js` 46 → 56 (10 failed first). Every existing perf line (AI sort, ML training, hash parity) is a single line well under 2,000 characters; the existing sources (`renderer`, `hash-pool`, `model-cache`, `session`) all match the new rule.

- **Task 6 done.** `main/module-ipc.js`; `main.js` wires the registry (JS realpath; its own link-refusing writer for `modules.json`, since the state folder is not granted), the folder-file service, the protocol's `resolveModuleDir`, `global.__mvModules`, and `restart-app` beside `app-close-allow` on one hoisted `isMainWindowSender`; `assertFixedPath`'s link half is now `refuseLink`, shared. `preload.js` +6 keys exactly as approved. `tests/bridge-surface.test.js` 4 (RED on 39 keys vs 45 first), `tests/module-ipc.test.js` 10 (RED on the missing module first). Unit suite 61 files, 2,942 passed, 1 skipped; `main-hardening` unchanged. Smoke on an empty scratch profile (`MV_USER_DATA_DIR`): the session log reads `Modules: 0 found, 0 enabled`, with no error.
  - Ruling: added `tests/module-ipc.test.js` (the plan named only the bridge test). It pins the refusal values at unit level, so Task 14's mutation 1 (`rejectValue` → absent) fails in the unit suite as well as in E2E 8. Cost if wrong: one test file.
  - Ruling: the registry loads and the module channels register before `createWindow`, so the page's first `listModules` finds its handler (the plan said "after the grant load" without placing it against the window). Cost if wrong: a few ms of startup with no modules folder.

- **Task 8 done.** `core/notifications.js` (`Notifier`, body moved unchanged; `autoCloseErrors` is a getter read at each show). `showNotification` is a one-line delegate; `this.notifier` is built in `initializeElements` beside `notificationContainer`. `wc -l media-viewer.js` 11,597 → **11,505** (−92). Glue tests repointed at `Notifier` (RED on the missing module first) plus two new: the setting is read at each show, and the delegate passes every call through. Unit suite 2,958 passed; `lint-guard` and `media-url` now include `core/notifications.js` by glob (357 between them).

- **Task 9 done.** `core/host-api.js` (typedefs), `core/module-host.js` (`ModuleHost`, `ACTIVATION_TIMEOUT_MS`). `tests/module-host.test.js` 40 cases (RED on the missing module first; one test bug fixed on the way: a capture that kept the newest visit instead of the first). Fake timers pin the 5,000 ms edge. The C9 case (a write inside `onVisitEnd` reaches the old folder) is what Task 14's mutation 2 will break.
  - Ruling: `beginVisit(folderPath)` takes no files argument; its snapshot comes from `getFiles()`, the same source as `files.list()` (the plan had `beginVisit(folderPath, files)` and a `getFiles` spy, which conflict). Cost if wrong: one argument.
  - Ruling: a dependent of a module the host itself blocked reads "disabled because X is disabled" (the plan named only "failed to start", for a failed dependency). Cost if wrong: one string.
  - Ruling: an IPC reply that is not a known shape reads as `unreadable` "no reply" (or `{ success: false, error: 'no reply' }`), never absent. Cost if wrong: none.
  - Ruling: `start()` also catches an unexpected throw in its own loop and logs it under `modules`, so it never rejects (a case added for it, RED first). Cost if wrong: none.

- **Task 10 done.** `MediaViewer` builds the host after `initializeElements` (`this.modules` = `testApis`; `start()` not awaited); `loadFolder` awaits `ready` right after the spinner; `beginVisit`/`endVisit` follow each `featureCacheStore` call (a source-order test pins all four). `handleAppCloseRequest({ restart })`, `_saveThenAllowClose(restart)`, and `_settleSavesForClose` ends the modules' visit (in its own try) and adds `deactivateAll()` to the settled list. 10 new glue cases (8 failed first; the 3 that passed early guard against a restart armed where none may be, and fail on a naive implementation). Unit suite 62 files, 3,038 passed. **`wc -l media-viewer.js` = 11,534** (ceiling 11,597).
  - Ruling: a plain close let through during a restart's save turns the relaunch off (`_closeRestarts = false`), so the save's `finally` sends `allowAppClose`, not `restartApp`; and main's `restart-app` arms nothing once `isQuitting` is set. The plan's "closes without relaunching" needed both: the restart save's own `finally` would otherwise still send `restartApp` before the window is gone. Cost if wrong: none.
  - Ruling: `deactivateAll()` also waits for every store call still in flight (a module's `onVisitEnd` save is issued at once, and the quit must not close before main has it), under the close flow's 15 s cap. Test added to `module-host.test.js`, RED first. Cost if wrong: a quit waits for a module's last write.
  - Ruling: the shared `stubModuleHost()` lives in `tests/feature-cache-harness.js` beside `stubFeatureCacheStore`, and the four context builders that run `loadFolder`/`_switchToFolderNow` get it, plus member 6's close context. No assertion changed. Cost if wrong: none.

- **Task 11 done.** `core/modules-panel.js` (`describeModuleRows`, `ModulesPanel`), the `#modulesSection` markup after Settings, and its styles from existing tokens (`.modules-restart-bar[hidden]` restated, since `display: flex` outranks the attribute). `tests/modules-panel.test.js` 19 (RED on the missing module first): every status, the restart suffix, `empty`, `toggleDisabled`, and the toggle's save, revert-and-notify on a refusal, error, null or rejection, and Restart now. Unit suite 63 files, 3,071 passed. **`wc -l media-viewer.js` = 11,544.**
  - Ruling: an enabled module with no outcome reads "Not started" (the plan's table had no row for it). Cost if wrong: one string.
  - Ruling: Step 4's manual F1 smoke ("No modules yet") is done by E2E case 1 in Task 12, which opens F1 and reads the section on a real launch. Cost if wrong: none; E2E is stronger.

- **Task 12 done.** `launchApp({ stateDir, moduleRoot, modulesEnabled })` and `MODULE_FIXTURES_DIR`; every launch now gets its own `MV_E2E_STATE_DIR`, and inherited module variables are dropped. Seven fixture modules. `tests/e2e/modules.test.js` 9 cases: first run RED (the helper export missing), then 5 failing on F1, then 9/9. **Full E2E suite: 264 passed, 7 skipped, 12.0 min.**
  - Ruling: the E2E opens F1 with `toggleHelp()` (what the header's help button calls), not the F1 key. With no folder open, the keydown handler passes only undo, by design (CLAUDE.md § State Management, empty state). Cost if wrong: none; the section's visibility is still asserted.
  - Ruling: E2E 6 reads the log file that was newest before Restart now (captured before the click), since the relaunched app writes a new one. Cost if wrong: none.

- **Task 13 done.** `.claude/rules/core.md` and `.claude/rules/modules.md`; `CLAUDE.md` (Architecture tree, Imports, § Testing (E2E) helpers, § Error Handling pointer, the Quit bullet, § Security's IPC guard and app-scheme bullets, the `.claude/` gotcha) **71,287 → 72,422 bytes**; `docs/ARCHITECTURE.md` file tree rewritten from `git ls-files` and "Extension Points" replaced by "Modules (v2)"; `PROJECT.md` structure rows and line count; both plan indexes; the spec's § 21 row (C1–C11) and § 14 item 4 note.
  - **Rule-loss check** (a fresh Opus agent, `main`'s `CLAUDE.md` against the new one plus both rules files, one rule secretly deleted): it **found the planted deletion** (`buildReverseMap()` must enumerate every mode string), so the check is valid. It counted 169 rule-bearing units: 161 byte-identical, 6 changed by additions only, 1 split. Other findings, all fixed: "`showNotification` returns its element" survived only by implication, and the sticky rule's callers are in `media-viewer.js`, where `core.md` does not load. The sentence is restored in § Error Handling, and `core.md` keeps the full form. The `.claude/` gotcha's "`rules/` … (empty today)" was stale and is corrected.
  - Ruling: the sticky/return sentence stays in `CLAUDE.md` as well as `core.md` (the plan moved it). Its readers edit `media-viewer.js`, where only `CLAUDE.md` loads. Cost if wrong: 198 bytes.
  - **Ceiling:** `scripts/renderer-line-ceiling.txt` 11,597 → **11,544**. G2 has not merged (`origin/main` = `d7b0fb8`), so Task 15 re-measures after merging `main`.
  - **GOALS G-7:** `media-viewer.js` 11,544 + `core/*.js` 682 (`host-api` 47, `module-host` 374, `modules-panel` 147, `notifications` 114) = **12,226**, 281 over the soft 11,945 (the plan predicted ~235). It goes in the PR, and feeds Cleanup Week #6's ceiling-extension decision.

- **Task 14 (verify), all but the manual smoke:**
  - Units 63 files, **3,071 passed, 1 skipped**. Lint: 0 errors, the same 2 warnings as `main`. `format:check` fails only on ten git-ignored local `CLAUDE-SECURITY-*` scan outputs, which are not branch files; every file this branch changed passes Prettier.
  - E2E: **264 passed, 7 skipped** (Task 12, 12.0 min). Since then only docs, rules and the ceiling file changed; the pre-push hook runs the suite again.
  - **`/security-review`** (spec § 15): **no findings** at the >80% bar. It checked:
    - traversal through `folder-file-*`;
    - reaching core's five files (the case fold included);
    - owner and name spoofing;
    - the app scheme serving main code, a link, or a file outside a module folder;
    - a manifest loading code;
    - a folder-file write planting module code;
    - untrusted senders on the new channels;
    - the E2E root;
    - HTML injection in `core/`;
    - log forging;
    - the capped recovery read.

    It noted two items below the bar: `moduleDir` serves the files of off or blocked modules (app-shipped, so nothing is exposed), and module isolation from `window.electronAPI` is lint-only (it matters only if modules stop being app-shipped).
  - **Mutation checks**, each in a scratch copy:
    - 1 (`rejectValue` → absent): killed, `module-ipc` 5 fail.
    - 2 (`endVisit` marks the visit dead first): killed, `module-host` 2 fail.
    - 3 (6,000 ms): killed, 4 fail.
    - 4 (`ownerKind` takes any string): **survives by design**. `declaredName` → `folderFileDecl` already requires the owner to be active, so the two checks are one check keyed on one fact. **4b** (`folderFileDecl` without that check) is killed, `module-registry` 1 fail.
    - 5 (serve `main/`): killed, `app-protocol` 2 fail.
  - **Owed by the user:** the manual smoke on a copy of the real profile (below, under the handoff).

## 5. Key Discoveries

_(filled during execution)_

## 6. Future Improvements

| Item | Origin | Where it goes |
|---|---|---|
| Rules-file size warning falls due with P1a's first rules files | C13 | BACKLOG 🟤 note → Cleanup Week #6 |
| Extractor helper waits for P1b | C11 | BACKLOG 🟤 note |
| P1b's two caches become `folder-file-*`'s first production callers; the bulk ratings move once, in P4b, onto `host.store.folderFile` | C2 | The spec's § 21 row (Task 13); P1b's and P4b's plans |
| `readBulkRatedFile` and its recovery read have no size cap (main reads the file, or a planted tmp, whole). Same class as P1a security findings 2 and 3, pre-existing, and out of scope under C2 | Security review, Task 3 | BACKLOG 🟤 at closeout; P4b moves the ratings onto the capped service anyway |
| Renderer + `core/*.js` over GOALS G-7's soft 11,945 once the host exists | Risks | The Cleanup Week #6 ceiling-extension decision |

## 7. Testing

See Tasks 1–14. Results are recorded at Task 14.

## 8. Review

_(filled at Task 15)_

## 9. Closeout Artifacts

| Artifact | Done / N/A + reason |
|---|---|
| `BACKLOG.md` — improvements extracted, routed by source | |
| `TODO.md` — actionable items, plus § Spawned Tasks rows | |
| `docs/archive/plans/` — plan moved here, original deleted | |
| `DONE.md` — entry with plan link, summary, key changes | |
| `WEEKLY.md` — Summary-Table Status an identifier; Daily-Schedule entry marked done | |
| `BACKLOG.md` / `TODO.md` — every entry this task closed checked off, in the closeout commit | |
| Deploy record | N/A: no deploy (Electron app run from source) |
| Live docs — late findings corrected where a live doc asserts them | |
| `docs/README.md` — plan and spec indexed | |
| Memory — durable decisions and patterns captured | |
| ROADMAP v2 table, GOALS G-1/G-2 — P1a flipped by hand (WEEKLY G1) | |
