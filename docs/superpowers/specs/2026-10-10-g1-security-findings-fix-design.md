# G1 — Security findings fix: main-process file IPC authorization + renderer HTML encoding

**Status**: **Implemented**: merged 2026-10-11 via [PR #78](https://github.com/GoodAlex223/media-viewer/pull/78) (merge `e5cd3a8`). Design approved section by section in chat on 2026-10-10. §12 records every amendment made during execution and review.
**Branch**: `g1-security-findings-fix` (deleted after the merge). Plan: [archive/plans/2026-10-10_g1-security-findings-fix.md](../../archive/plans/2026-10-10_g1-security-findings-fix.md)
**Scheduled**: [WEEKLY.md](../../planning/WEEKLY.md) G1 (Oct 12–16) ← TODO 🔴 [2026-10-08] ← BACKLOG 🟤 `[2026-10-08] From: G4 trial batch`
**Findings**: F1–F7 of the 2026-10-08 `claude-security` scan. Each one is summarized in the [post-merge write-up on PR #78](https://github.com/GoodAlex223/media-viewer/pull/78#issuecomment-6111546302). The scan report itself stays local and self-ignored.

> **Disclosure**: this spec was kept local until the merge (user decision D1), and was published at the closeout on 2026-10-11. The one open residual, §10 I1 (page-side loads not confined to granted folders), is described here as a design gap, not as an exploit recipe. It was closed on 2026-10-19 by PR #84 (merge `4548269`); see the [I1 spec](2026-10-18-g1-i1-page-load-confinement-design.md).

---

## 1. Intent

Close the scan's three High findings (F1/F3, F4, F2), the Medium (F5) and the Low (F6/F7) before G2 (bulk move, confirmation text) and G4 (reopen a folder by path, folder-name list) build on the same file IPC and HTML rendering.

**Success** is all three of:
- every confirmed finding has a test that fails on `main` and passes on the branch
- the user's `/claude-security` _Scan changes_ on the branch diff comes back clean for these sites (trial leg 2)
- the app's existing workflows still work: the unit and E2E suites pass, and one manual real-folder session succeeds

**Threat model**: untrusted *folder content* (a downloaded or shared media pack, a synced folder) that the user opens in the app. Not in scope: a hostile local user, or malware already running as the user.

**Assumptions**: Windows is the primary platform, but the paths logic must also be correct on macOS and Linux. There is a single user (the owner), so a one-time re-confirmation is acceptable friction.

## 2. Decisions (user rulings, 2026-10-10)

| # | Decision | Ruling |
|---|---|---|
| D1 | Where the spec lives until merge | **Local**, in the report folder. A stub plan is committed in `docs/planning/plans/`. The full spec moves to `docs/superpowers/specs/` at closeout. Push only when the PR opens. |
| D2 | Authorization model | **Persisted granted roots**, owned by main. A root is added **only** by main's own native folder dialog. |
| D3 | Migrating like/dislike/special folders saved before the fix | **One-time re-pick**, through the existing browse buttons, with the dialog opened at the saved path. |
| D4 | Defense-in-depth scope | **All four layers**: CSP, navigation lock, sender-frame check, lint guard on `innerHTML`. |
| D5 | Code structure | A **pure `path-grants.js` module** plus a **`handle(channel, argKinds, fn)` registration wrapper** in `main.js`. |

Rejected alternatives, kept for the record:
- **Session-only grants**: re-pick on every launch, and G4 could not reopen by path.
- **API narrowing without roots**: move and create would stay unconfined, so F2 would stay open.
- **Trusted first-run import**: a one-shot IPC, and it trusts `localStorage` that a compromise before the fix could have written.
- **Main owning the folder settings**: a larger interface change, and it still needs a migration.
- **Inline per-handler checks**: easy to forget on a new handler, and testable only through E2E.

## 3. Main-process authorization (F2)

### 3.1 `path-grants.js` (new, CommonJS, no Electron import)

Unit-tested with Vitest via `createRequire`, the same as `media-formats.js` and `logger.js`. File system access is injected or uses `fs.promises`, so tests run against temp directories.

- **`createGrantStore({ storePath, fs, platform })`** returns `{ load(), grant(root), isGranted(p), resolveAllowed(p), list() }`.
- **Canonical form**: run `path.resolve`, then `fs.realpath.native` on the longest existing prefix, then append the remaining segments. After `path.resolve` those segments contain no `..`. On `win32`, comparison uses a case-folded copy, but the canonical path keeps its real case for display and use.
- **Containment**: `p` is inside root `r` when `p === r` or `p` starts with `r + path.sep`. This is boundary-aware, so `C:\Photos2` is not inside `C:\Photos`. A junction or symlink inside a root that leads outside it resolves to its target, and the target is checked, so it is rejected.
- **`grant(root)`**: canonicalize, de-duplicate (case-folded on `win32`), append `{ path, grantedAt }`, and save atomically (`.tmp` then `fs.rename`, as the ML model cache does).
- **`load()`**: read `{ version: 1, roots: [...] }` from `userData/folder-grants.json`. If the file is missing, unreadable, the wrong version or the wrong shape, there are **no grants**. That fails closed, and a warning is logged. Unknown fields are ignored.
- **`resolveAllowed(p)`** returns the canonical path, or `null`. A non-absolute `p` (`!path.isAbsolute(p)`) is `null`, so there is no dependence on main's working directory.
- **The handler receives the renderer's original argument, unchanged.** The check runs on the canonical form, but the canonical string is **not** substituted. Substituting it would change every path `load-folder` returns for a folder reached through a junction or spelled in a different case, and every path-keyed store would stop matching: the feature cache, the sort cache, bulk-rated, and the tournament state's `files`, which reconcile would prune wholesale. The original string and its canonical form name the same object, apart from the race below.
- **No eviction cap.** Roots grow only through user dialog picks. A "forget folder" option and a cap are residuals for G4 (§ 10).

**Residual (accepted)**: there is a race between the check and the use if a directory inside a granted root is swapped for a junction during that window. That needs write access to the folder at the right instant, which is outside this threat model, and is noted in the residuals.

### 3.2 Temp-directory tracking

`extractKeyframes` adds every directory it creates with `mkdtemp` to an in-memory `Set` (canonical form). `cleanupKeyframes(dir)` acts only on a member of the set, and removes it from the set after a successful removal. Its own error path, which removes the directory on failure, also removes it from the set. A frame path is allowed when it is a **direct child** of a tracked directory.

### 3.3 `handle(channel, argKinds, fn)` / `on(channel, fn)` wrapper (`ipc-guard.js`, new, CommonJS)

It is a separate module because § 7.1 unit-tests it, and Vitest cannot load `main.js`, which loads Electron. `createIpcGuard({ ipcMain, grants, tempDirs, expectedUrl, logger })` returns `{ handle, on }`, and `main.js` builds it once in `app.whenReady`. Add an ESLint block entry for it, alongside `media-formats.js`.

Every privileged `ipcMain.handle` and `ipcMain.on` registration goes through the wrapper. Order of checks:

1. **Sender-frame check**: `event.senderFrame` must exist, be the top-level frame (`parent === null`), and have a URL equal to `pathToFileURL(path.join(__dirname, 'index.html')).href`. Any query string or fragment is ignored in the comparison.
2. **Argument check**: each positional argument is validated by its declared kind (table below). A per-channel validator function is also allowed.
3. **On rejection**: return the channel's **existing failure shape** (`{ success: false, error: 'Not permitted' }`, `null` or `false`, matching what the renderer already handles), and log a `warn` via `logger` with the channel and the reason. Never throw. `on` channels drop the message.

Argument kinds:

| Kind | Accepts |
|---|---|
| `grantedPath` | an absolute-path string whose `resolveAllowed` is non-null; the handler receives the original string (§ 3.1) |
| `basename` | a non-empty string with no `/`, `\` or NUL, not `.` or `..`, and on `win32` no `:` |
| `grantedOrTempPath` | a `grantedPath`, or a direct child of a tracked temp directory |
| `trackedTempDir` | a member of the tracked temp-directory set |
| `int(min, max)` | `Number.isSafeInteger` within the range |
| `any` | no check; used only where the value never reaches a path, which must be justified per channel |

### 3.4 Channel table

| Channel | Arguments → kinds | Notes |
|---|---|---|
| `open-folder-dialog` | `defaultPath?` → optional string, passed to the dialog only | On a confirmed pick: `grant(result)`, then return the path. The **only** grant site. |
| `get-grant-status` *(new)* | `paths` → array of strings, length ≤ 16 | Returns one boolean per path. It reveals only grant membership. |
| `load-folder` | `grantedPath` | |
| `move-file` | `{ sourcePath: grantedPath, targetFolder: grantedPath, fileName: basename }` | The handler also asserts that the joined target is inside `targetFolder`. |
| `readTournamentState`, `writeTournamentState`, `deleteTournamentState` | `grantedPath` (+ `any` state) | State is serialized only, never used as a path. |
| `readBulkRatedFile`, `writeBulkRatedFile` | `grantedPath` (+ `any` data) | Same. |
| `applyTournamentResults` | `grantedPath`, plus the tier validator (§ 5) | |
| `check-folder-exists`, `check-file-exists` | `grantedPath` | Returns `false` when not permitted. |
| `create-folder` | `grantedPath` | |
| `read-file`, `write-file` | **removed** | |
| `read-folder-cache` *(new)* | `grantedPath`, `name ∈ {'hash','sort'}` | Main joins `.hash_cache.json` or `.sort_cache.json`. |
| `write-folder-cache` *(new)* | `grantedPath`, `name ∈ {'hash','sort'}`, `data` string | Same; the write is atomic. |
| `read-file-buffer` | `grantedPath` | |
| `feature-cache-open` | `grantedPath` (a **folder**) | Main joins `.feature_cache.json`. |
| `feature-cache-write-open` | `grantedPath` (folder), `header` | Header values are only ever `JSON.stringify`ed. |
| `feature-cache-chunk`, `-close`, `-write-chunk`, `-write-close` | sender check only | They operate on main's own session state. |
| `probe-video` | `grantedPath` | |
| `extractKeyframes` | `grantedPath`, `int(1, 100)` | |
| `cleanupKeyframes` | `trackedTempDir` | |
| `extractClipEmbedding` | `grantedPath` | |
| `extractClipEmbeddingBatch` | array (length ≤ 100) of `grantedOrTempPath` | |
| `extractClipEmbeddingFromBuffer` | `ArrayBuffer` or `Uint8Array` | |
| `read-ml-model-cache`, `write-ml-model-cache`, `read-jxl-wasm`, `loadClipModel`, `unloadClipModel` | sender check only | Fixed paths. |
| `log-renderer-error`, `log-perf`, `app-close-allow` (`on`) | sender check only | |

**Plan check**: grep `main.js` for `ipcMain.handle(` and `ipcMain.on(` after the change. Every hit must be inside the wrapper, and a unit test or lint rule asserts there is no bare registration.

### 3.5 Bridge changes (`preload.js` — permission prompts by design)

- **Removed**: `invoke(channel, data)` (0 callers), `readFile`, `writeFile`.
- **Added**: `readFolderCache(folder, name)`, `writeFolderCache(folder, name, data)`, `getGrantStatus(paths)`.
- **Changed**: `openFolderDialog(defaultPath?)`; `featureCacheOpen(folder)` and `featureCacheWriteOpen(folder, header)` now take the **folder**.
- **Unchanged**: everything else, including the pure `path` helpers.

Renderer follow-ups:
- the hash and sort cache callers in `media-viewer.js` move to `readFolderCache` and `writeFolderCache`
- the feature-cache callers in `media-viewer.js`, and the injected callbacks for `ml-training.js`, pass folders
- the **dead** `readFile`/`writeFile` fallback branches of the feature-cache load and save (reached only when `featureCacheOpen` or `featureCacheWriteOpen` is absent, which never happens) are **deleted**, not ported

## 4. Renderer: sinks, state validation, re-pick flow (F1/F3, F4, F5)

### 4.1 Sinks → DOM building

Every `innerHTML` assignment that interpolates a value is rebuilt with `createElement`, `textContent` and `append`. Icons become real `<i data-lucide="…">` elements, rendered with `lucide.createIcons({ root })`, never `{ nodes }`. There is **no `escapeHtml` helper**: opt-in escaping is what failed here.

| Site | Finding |
|---|---|
| `showTournamentContinuePrompt` body | F1/F3 |
| `showTournamentSummaryModal` body (tier rows + footer) | F4 |
| `showTournamentLeavePrompt` body | F5 |
| `showFolderCreationDialog` (folder path) | not in the scan; found 2026-10-10 |
| Extraction indicator (2 branches) | internal numbers; converted for the lint guard (static SVG constant + `textContent`) |
| Shortcut-row builders (2) | internal values; converted for the lint guard |
| Progress-card skeleton (static string concatenation) | becomes a single literal |

### 4.2 Tournament-state validation (in `tournament-engine.js`, pure ESM)

`SwissStrategy.deserialize` and `TournamentEngine.deserialize` validate before constructing anything. On failure they throw one specific error, `InvalidTournamentStateError`.

- Counters (`gamesPlayed`, `currentRound` and similar) are non-negative safe integers.
- `options.rounds` is an integer in **[1, 50]**, the config modal's own clamp. The upper bound matters beyond type safety: the summary iterates tiers `0..rounds`, so an unbounded value would freeze the UI.
- Every `winCounts` value is a non-negative integer **≤ 2 × rounds**, and every key is a string. Integer-ness is the safety property. The bound is deliberately loose: draws and byes each add exactly 1 (`tournament-engine.js`), so a count above `rounds` should be impossible, but a tight bound that turned out wrong would reject a legitimate saved tournament. The plan pins the "never above `rounds`" invariant with a test instead of enforcing it at load.
- `byes` is an array of strings.
- `files` is an array of strings, and `roundQueue` is an array of string pairs.
- The top-level `gamesPlayed`, if present, follows the same counter rule.
- **Unknown fields are ignored**, so the format stays forward-compatible. A legacy `version: 1` payload still resumes, as today.

`tournament.js`'s resume path catches `InvalidTournamentStateError`, treats the state as **absent**, shows an `info` notice ("Saved tournament couldn't be read — starting fresh") and offers a fresh start. It does **not** delete the file automatically; a fresh start overwrites it through the normal persist path. `main.js`'s `readTournamentState` stays a plain byte pipe, so there is no second validator to drift.

**Plan task: trace, don't assume.** Trace `.bulk_rated.json`, `.sort_cache.json` and `.hash_cache.json` from read to every consumer, and confirm none reaches an HTML sink, or reaches a path argument except through § 3's checks. Each hit becomes its own item: fixed in G1 if it is a sink, filed if it is defense in depth.

### 4.3 Re-pick flow (D3)

- **At startup** (constructor, after `initializeElements()`): call `getGrantStatus()` on the non-empty saved `customLikeFolder`, `customDislikeFolder` and `customSpecialFolder`. Each ungranted one is marked in `this.folderNeedsRegrant` (a `Set` of `'like' | 'dislike' | 'special'`).
- **Notice**: if the set is non-empty, show one `info` notice: "Re-confirm your <like / dislike / special> folder(s) — click the folder button (security update)."
- **Tooltips**: `updateRatingButtonsState()` and `updateSpecialButtonsState()`, the sole runtime owners of those titles, append "needs re-confirming" for a marked folder.
- **Re-pick**: the browse handlers call `openFolderDialog(savedPath)`. On a pick, main grants it; the renderer saves it, as today, and clears the mark.
- **Moves**: `moveCurrentFile`, `moveToSpecialFolder`, `moveComparePair` and `applyBulkRating` check the mark **before** the existence check and the folder-creation dialog, and refuse with the same notice. This happens inside the existing `_fileOpInFlight` bracket, so it is a declined branch: it renders nothing and leaves nothing in flight, per the G1 file-op guard's handoff rule.
- **AI sort**: `handleSortByPrediction` checks the like and dislike marks before Phase 1 and stops with the notice. No training, and nothing cached.
- **Backstop**: if a refusal still reaches `ml-training.js` (a folder ungranted mid-session, for example), its existing failed-scan path applies: a warning, and `scanFailed` keeps the model out of the cache (`ml-training.js` cacheability condition). Nothing new is needed there, but a test pins it for the refusal case.

## 5. Tournament apply confinement (F6/F7)

A per-channel validator on `applyTournamentResults` runs **before any `mkdir` or `rename`**. It is all or nothing: any invalid entry rejects the whole call, so there are no partial moves.

- `tierAssignments` is a plain object with at most 100 000 entries.
- Each **key** resolves (canonical form) to a **direct child** of the canonical `folderPath`, and `isMediaFile(ext)` is true for it.
- Each **value** is `int(0, 100)`, which is 2 × the maximum rounds and matches § 4.2's loose bound. Integer-ness is what makes the `_Tier-<n>` name safe.

Belt-and-braces inside the loop: the computed tier directory and the final destination path must each be inside the canonical `folderPath`. If not, that file goes to `failed`, which is unreachable once the validator passes.

## 6. Hardening (D4)

### 6.1 Content-Security-Policy (meta tag in `index.html`)

Starting policy. Directives marked ⚖ are **measured** in the plan, not guessed.

```
default-src 'none';
script-src 'self' https://unpkg.com/lucide@1.14.0/dist/umd/lucide.min.js 'wasm-unsafe-eval';
style-src 'self' ⚖'unsafe-inline';
img-src 'self' file: blob: data:;
media-src 'self' file: blob:;
font-src 'self' data:;
worker-src 'self' ⚖blob:;
connect-src 'self' ⚖file:;
object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none';
```

- The inline Lucide-init `<script>` in `index.html` moves into `media-viewer.js`'s init. The SRI on the Lucide tag is kept.
- ⚖ items to measure:
  - whether `style-src` needs `'unsafe-inline'` (static style attributes in markup strings)
  - whether dedicated workers (`sorting-worker`, `ml-worker`, `feature-worker`, the module `jxl-decode-worker`) inherit the page policy for `file:` and still compile WASM
  - whether face-api model loading needs `connect-src file:`
- **Make breakage loud**: a `securitypolicyviolation` listener in the renderer forwards each violation (directive, blocked URI) to `electronAPI.logError` as a `warn`. A new E2E walks the main flows (load a folder; image, video and JXL; compare; tournament; AI sort) and asserts **zero violations**.

### 6.2 Navigation lock (`main.js`, `createWindow`)

- `webContents.on('will-navigate', e => preventDefault())` unless the URL is the app's `index.html`.
- `webContents.setWindowOpenHandler(() => ({ action: 'deny' }))`.
- Rejections are logged as `warn`.

### 6.3 Sender-frame check

Specified in § 3.3, step 1. It applies to every channel, the `on` channels included.

### 6.4 Lint guard (`eslint.config.mjs`, every renderer file block)

`no-restricted-syntax` (error). Draft selectors:

- `AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]:not([right.type='Literal']):not([right.type='TemplateLiteral'][right.expressions.length=0])`
- `CallExpression[callee.property.name='insertAdjacentHTML']`
- `CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]`

Merge with any existing `no-restricted-syntax` entries in those blocks (flat config replaces, not concatenates, a rule's options). **Prove it fires**: a Vitest test lints snippets through ESLint's Node API (`new ESLint({ overrideConfigFile })` / `lintText`). It must flag an interpolated assignment, a concatenation and `insertAdjacentHTML`, and must pass a static literal, an empty string and an expression-free template.

## 7. Testing

### 7.1 RED-first tests (each must fail on `main`)

Probes use an **inert marker**, an element such as `<b data-probe>` or a flag-setting attribute, never an executable payload with side effects. The test only needs to detect that markup was parsed or that a call was honoured.

| Finding | Test | Layer |
|---|---|---|
| F1/F3 | `showTournamentContinuePrompt` given a state whose counter is a markup string: no `[data-probe]` element exists, and the string appears as text | E2E (`page.evaluate`, method called directly; Vitest runs in `node`, with no DOM) |
| F4 | the same, for `showTournamentSummaryModal` via an engine whose `rounds` is a string | E2E |
| F5 | the same, for `showTournamentLeavePrompt` | E2E |
| 4th sink | the same, for `showFolderCreationDialog` given a path containing markup | E2E |
| State validation | `deserialize` rejects a non-integer counter, out-of-range `rounds` and non-integer `winCounts`; resume treats the state as absent | Vitest (`tournament-engine.test.js`, `tournament.test.js`) |
| F2 | from the page, `readFileBuffer`, `checkFileExists`, `createFolder` and `cleanupKeyframes` on a path in the test's own temp area that was never granted are all refused, and nothing is created or removed | E2E |
| F2 (unit) | `path-grants.js`: boundary (`C:\a` vs `C:\ab`), case on `win32`, a junction or symlink out of a root, a nonexistent target under a root, a `..` escape, a corrupt store, the wrong version, de-duplication, an atomic save | Vitest |
| F2 (wrapper) | a foreign sender URL, a sub-frame and a null frame are refused; each argument kind is accepted and rejected correctly, including a relative path; the handler receives the **original** argument string, not the canonical one; a bare-registration check | Vitest (fake `ipcMain`/`event`) |
| F6/F7 | `applyTournamentResults` with a non-integer tier, or a key that is not a direct child, is refused, and **no** directory is created anywhere. The test runs inside a temp parent, so any escape on `main` lands in the test sandbox. | E2E |
| CSP | an inline event-handler attribute inserted by the test does not run its flag-setter | E2E |
| CSP zero-violation walk | § 6.1 | E2E |
| Navigation lock | assigning `location` to another `file:` page leaves the window on `index.html` | E2E |
| Lint guard | § 6.4 | Vitest |
| Re-pick | an ungranted saved like folder produces the notice and the tooltip suffix; a move is refused with no folder-creation dialog; after a mocked dialog pick the move succeeds; the AI sort stops before training | E2E (+ Vitest for the pure parts) |

### 7.2 E2E grant isolation (hard requirement)

E2E runs share `%APPDATA%\Electron` (no `userDataDir` isolation). A grant left over from an earlier run could make an F2 test pass for the wrong reason. The plan **measures and picks** one of these:
- a per-run `--user-data-dir` for the launched app
- a test-only store-path override honoured by main

The chosen mechanism must also isolate `localStorage`, or the plan must say why it doesn't need to.

Knock-on work in `tests/e2e/helpers/electron-app.js`:
- `mockFolderDialog` replaces the whole handler today, so it must also grant (or call through to a main-side grant).
- `loadFolder(page, path)` calls the renderer directly, bypassing the dialog, so it must grant first.
- Tests that seed like, dislike or special folders through `seedLocalStorage` need a `grantFolder(electronApp, path)` helper.

The main-side grant hook for tests must be reachable **only** through `electronApp.evaluate`, which runs in the main process, and **never** through the preload bridge.

## 8. Acceptance

- [ ] Every § 7.1 row fails on `main` (recorded per test in the plan log) and passes on the branch.
- [ ] `npm test`, `npm run lint` and `npm run test:e2e` all pass; the CSP zero-violation walk passes.
- [ ] The user runs `/claude-security` → _Scan changes_ on the local branch; it is clean for these sites, and the result is read out into REVIEW-QUEUE § 5 (trial leg 2).
- [ ] Deep review (`max`): every finding is ruled on.
- [ ] Manual real-folder session: re-pick like, dislike and special; rate in single and compare; bulk-rate; AI sort; tournament start, leave, resume and apply; a JXL (static and animated); a video with keyframes and CLIP.

## 9. Disclosure process (D1)

- **Local until merge**: this spec and the detailed implementation plan (`CLAUDE-SECURITY-20261008-084826/2026-10-10-g1-implementation-plan.md`).
- **Committed on the branch**: the stub plan `docs/planning/plans/2026-10-10_g1-security-findings-fix.md`, with tasks named by finding ID and generic fix (for example "F2 — file IPC authorization"), a progress log, and test pass/fail records without field or sink names.
- **Commit messages**: stub level (for example `fix(security): G1 task 4 — renderer sink set`).
- **Before every commit**, grep the staged prose (docs plus the message) for: field names from the report, sink method names, `.tournament_state`, `onerror`, `innerHTML`, line numbers. Code and code comments are exempt; they go public with the diff when the PR opens.
- **Push** only when the PR opens. Scan changes and the deep review run on the local branch.
- **After merge**: full detail goes public in the PR, as a comment or body edit through REST (`gh pr edit` fails, per memory). The spec moves to `docs/superpowers/specs/` and is indexed. The BACKLOG stubs are checked off with full text.

## 10. Out of scope / residuals

Filed at closeout:
- **Drag-and-drop folder loading is dead** (`handleFolderDrop` reads `File.path`, removed in Electron 32; installed 39.1.2). It always shows "Please drop a folder". → BACKLOG 🟤. A revival must grant through `webUtils.getPathForFile` inside the preload, never from a path the renderer supplies.
- **Grant-store eviction and "forget folder"** → G4 residual.
- **Race between the check and the use** inside a granted root (§ 3.1) → documented residual.
- **`sandbox: false`** stays (the file operations need it; out of scope).
- The 🟤 entry on the Workflow-subagent `preload.js` guard gap stays separate.

Docs to update at closeout: the `CLAUDE.md` Security and Architecture tree (`path-grants.js`, `ipc-guard.js`, CSP, the grant store in userData, the "no bare `ipcMain` registration" rule), `docs/ARCHITECTURE.md`, and the TODO 🔴 item and BACKLOG stubs.

## 11. Estimate and models

- **SP**: about 6.5 against 5 planned. That's over plan but within the 2x abort line.

| Area | SP |
|---|---|
| Authorization core (module, wrapper, channel migration, bridge) | 2 |
| Sinks and validation | 1 |
| Re-pick | 1 |
| Apply confinement | 0.25 |
| CSP and navigation lock | 0.75 |
| Lint | 0.25 |
| E2E isolation and helpers | ~1 |

- **Execute**:
  - Opus · `high` for the `path-grants.js`, wrapper, `main.js` and `preload.js` tasks: the authorization core, a step up from WEEKLY's `medium`.
  - Opus · `medium` for the sinks, lint, CSP, E2E and re-pick tasks.
- **Review**: deep (`max`).

## 12. Amendments (2026-10-10/11, after the patch review and the Tasks 1–5 review)

- **§3.5 correction.** The feature-cache `readFile`/`writeFile` fallbacks are reachable (a streaming load that throws falls through to the single read), so they are kept and routed through `read-folder-cache`/`write-folder-cache` with name `'feature'`, not deleted. The legacy writes now check their result: a failed write no longer re-baselines the shrink guard.
- **§3.4 correction.** `write-folder-cache` stays a plain write, as the old `write-file` was. It is not atomic (behaviour-preserving; deferred minor M3).
- **§4.3 correction.** `applyBulkRating` moves no files, so it needs no re-pick check. **New requirement (review C1):** the re-pick refusal must come before any media teardown. `moveComparePair` cleans both panes, and `moveCurrentFile` cleans a video, before their existence checks.
- **§5 addition.** Every `_Tier-N` must `realpath` to exactly `<realpath(folder)>/_Tier-N`, checked for each tier before the first rename. The containment re-check uses a separator-aware helper, so drive-root folders work.
- **§3.1 addition.** Paths with a `.` or `..` segment are refused outright, not normalized: POSIX resolves a link before `..`.
- **§3.3 addition.** Fixed-name files (`assertFixedPath`) are checked at the concrete path: there must be no link at the name, and the path must resolve inside a granted folder. This applies to every cache, state and `.tmp` file a handler opens.
- **§3.3 addition.** The window is loaded and authorized from one `INDEX_HTML` constant. `app-close-allow` is trusted by sender identity (`event.sender === mainWindow.webContents`), so closing can never be refused.
- **Still to do (from the reviews):** pass ffmpeg/ffprobe `-protocol_whitelist file` (verify the flag first). Deferred minors M1–M7 are in the ledger.
- **§6.1 measured (2026-10-11).** The final policy is the draft minus `worker-src blob:` and `connect-src file:`, both of which the zero-violation walk shows are unnecessary. In a `file://` page, `'self'` covers the local face models. Kept, because removing each broke the walk: `'wasm-unsafe-eval'`, style `'unsafe-inline'` and `img-src blob:`.
- **§12 TODO done.** ffmpeg/ffprobe run through one wrapper that passes `-protocol_whitelist file` (measured on the bundled builds; the build's nested default is already `file,crypto`).
- **§4.2 trace result.** No cache reaches an HTML sink or a path. Hash-cache values reached a loop bound and are now validated at load.
- **§10 residual (whole-branch review I1, measured 2026-10-11).** The app runs from a `file://` page, where CSP `'self'` matches every `file:` URL. So the page's own loads are not confined to the granted folders. The measured detail stays in the git-ignored local copy of this spec until the fix merges. The IPC guard confines what MAIN does (reads, writes, moves, creates, deletes). It does not confine what the PAGE loads. Not a regression; the sink fixes close the entry point. Closing it needs a protocol-level design: serve the app from a custom scheme, or `protocol.handle('file', …)` limited to the app directory, granted roots and tracked temp dirs, with video range requests in scope. This is a follow-up, to be scheduled before G4 builds on the grant model. The docs must not claim that grants confine renderer reads.
  - **Closed 2026-10-19 by PR #84 (merge `4548269`)**, designed in the [I1 spec](2026-10-18-g1-i1-page-load-confinement-design.md). The window is served from `app://media-viewer/`, which serves only allowlisted app files and granted media. The CSP is a response header, so workers get one too, and renderer network requests (WebRTC included) are cut off. Main's keyframe temp folders were dropped from scope: the page never loads them (I1 spec D4).
- **§3.1/§3.4 amendment (review M-a, user: fix before merge).**
  - **Entry operations** (move source, existence) are authorized by the folder that holds the entry. The entry itself may be a link to anywhere.
  - **Content reads** follow a link out of a granted folder only to a media file. This keeps symlinked media fully working, including CLIP, JXL decoding and video probing, while a planted link to a non-media file is refused.
  - **For the I1 follow-up:** its protocol design must decide the same question for page-side loads. **Decided (I1 spec D12):** page-side loads go through the same read rule, `createMediaReadRule`, which also checks the resolved target's extension. So a link to media displays, and a link to a non-media file is refused.
- **§4.3 amendment (review M-b, user: fix before merge).**
  - Grant status is three-state. A granted folder whose drive is absent reads as `unreachable`, not as needing re-confirmation.
  - Moves and the AI sort refuse it with "check that its drive is connected", then re-check in the background so the next press works once the drive is back.
