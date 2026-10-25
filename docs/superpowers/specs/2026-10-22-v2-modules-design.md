# media_viewer v2: modules and redesign (design)

**Status:** approved by the user on 2026-10-22 ("Looks good"). The AI-sorting research report arrived with that
approval and was folded in afterwards; §21 lists exactly what changed, for the user to read.
**How it was made:** the user asked for a brainstorm and then chose to skip the question round. Every decision
quoted from the user's own notes is marked **(U)**. Every other decision is Claude's call, marked **(C)**, and §17
lists them all so they can be checked and flipped.
**Inputs read:** `PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_CONTEXT.md`, the planning docs
(`GOALS`, `ROADMAP`, `MILESTONES`, `WEEKLY`, `TODO`, and searches of `BACKLOG`, `DONE`, `REVIEW-QUEUE`), all
70 specs in `docs/superpowers/specs/` (53 product, security and strategy specs in a first pass; the 17 process,
test-tooling and weekly-review specs in a second), a map of today's code at `main` `bf5ec84`, and the two sibling projects
`C:\Users\alexm\Projects\media_parser` and `C:\Users\alexm\Projects\media_compression` (read only; their
secrets were not opened).
**Research inputs:**
- **AI sorting: folded in.** The report is `docs/research/2026-10-22-ai-sorting.md` in commit `96d9b22`. That
  commit is on branch `research/local-ai-sorting`; it was kept out of the G2 PR 2 merge.
  It is not in the planned `ai-sorting` worktree. It feeds §5.3, §12.1–§12.3, §13, §14, §16 and §17.
- **Downloaders: still pending.** Due under `.claude/worktrees/fetch-research/docs/research/`. §12.5 names what
  it may change.

Line numbers below refer to `main` `bf5ec84` unless stated. "The renderer" means `media-viewer.js`.

---

## 1. Why

**The user's own words.** The add-on idea is old and the user's. From BACKLOG [2026-04-08] (L255, translated
from Russian): the core viewer "already exists and it's decent"; the user does not want to clutter it "with
functionality the user may not even need", so add-ons should be installable, and that means first deciding "what
this application is, what its core functions are, and what should be moved out into add-ons". Further notes from
the user:

- "All sorting options can be moved into add-ons" (L256).
- Tournament mode "doesn't seem core (the same functions, just slightly more laboriously, can be had with
  regular compare mode)", so it becomes a plugin (L122).
- For platforms: "Better to add the ability to integrate content from the platforms than a full-fledged parser.
  Consider implementing it with existing tools such as gallery-dl" (L257).
- The `media_compression` code "could be added as an add-on module", but "most likely it will need rewriting"
  (L213).

The roadmap parks the add-on system under *Later* as "design first (define core-app identity …)", deferred to "a
separate future brainstorm" (`2026-07-12-g4-strategic-docs-refresh-design.md`:459). This is that brainstorm,
widened by the user on 2026-10-22 to include media fetching, compression, and a possible redesign.

**The renderer keeps growing.** `media-viewer.js` went 6,650 lines (March) → 9,418 (August) → 12,190 (PR #85) →
11,879 today, against a "< ~6,000" goal (GOALS:49). Since 2026-10-12 each feature ships a pure module beside the
renderer, but the glue stays inside it, so it still grows. Every edit of the file also costs about 1.1 s in the
formatter hook (`2026-10-17-weekly-reviews-run.md`:377–383). This week's theme is "stop the renderer's growth".
A module boundary with real controls is the structural answer.

**Three tools that should be one loop.** Today the user's media passes through three separate tools:
- `media_parser` (a stale Python scraper plus a Telegram bot for rating from a phone);
- media_viewer (view, rate, sort);
- `media_compression` (a PowerShell lossless JPEG XL converter run by hand).

The valuable idea in `media_parser` is the loop **fetch → rate → keep** (its `Liked_1`/`Liked_0` folders are
media_viewer's like/dislike folders in miniature). v2 puts that loop, plus compression, in one app.

---

## 2. What v2 is

- **A small core** that opens a folder, shows images and videos (JPEG XL included), rates by moving files
  (like / dislike / special), compares two files side by side, and undoes. **(U)** for "core stays
  uncluttered"; the exact list is §5.1 **(C)**.
- **First-party modules** that ship with the app and can be switched on and off: similarity sort, AI sort (with
  its media-features service), tournament, fetch, compression. **(C)** for the list, **(U)** for sorting and
  tournament moving out.
- **A module host** inside the app: a manifest per module, a host API that encodes today's hard-won rules, and
  main-process services for files, outside programs, and settings. §6–§8.
- **A shell redesign**: one shared action bar driven by the active mode, a side panel where module panels
  live, a jobs tray for long-running work, a Modules page, and the responsive pass. §11.
- **Built incrementally**, inside the working app, one shippable step at a time. No rewrite. §14.

**Name (C).** "v2.0" already names the internal modularization release (ROADMAP:61–80): six managers planned,
two extracted and a third (MLManager) half done, with "done" defined as the remaining four (Zoom, Compare,
Sorting, ML; MILESTONES:24). v2 *absorbs* it. The remaining extractions become module extractions (the
SortingManager becomes the similarity-sort module, MLManager's sort half becomes the AI-sort module) or
core-internal splits (ZoomManager, CompareManager). The board change belongs to the strategic refresh (WEEKLY
G5 of Oct 19–23, still open on 2026-10-25); see §19.

---

## 3. Goals, non-goals, anti-goals

### Goals

1. **G-1 Core identity.** A written, enforced line between core and modules (§5), so new features land in modules
   by default.
2. **G-2 Modules the user connects.** Each module can be turned on or off from a Modules page. Modules that need
   outside programs can be connected to them there. §10.
3. **G-3 Existing features move out unchanged.** Similarity sort, AI sort and tournament become modules with no
   change in behaviour. Their end-to-end suites keep the same assertions and stay green; only the path by which
   a test reaches moved state changes (§7.13). Element IDs that tests target are kept when markup moves into a
   module.
4. **G-4 Fetch.** Paste links (or import a list or a browser session file), the app downloads them with
   maintained open-source tools into an Inbox folder, and the Inbox opens in the viewer for rating.
5. **G-5 Compress.** Convert a folder's JPEG and PNG files to JPEG XL losslessly, in place, verified, without
   losing ratings, caches or training data, and revertible until the user finalizes.
6. **G-6 Redesign.** The shell gives modules a place in the UI, and the [2026-05-25] UI-architecture overhaul and
   responsive pass are delivered (BACKLOG L223–L224).
7. **G-7 The renderer shrinks.** Each extraction removes its code from `media-viewer.js`, and the file never grows
   across a v2 phase.
8. **G-8 Runs on Windows and Linux (U, 2026-10-22).** The user may move to Linux, and the repository is public,
   so others may clone it and use it. The app and its test suites run from source on both platforms and are
   tested on both at every phase exit. macOS should work, since nothing is Windows- or Linux-only without a
   fallback, but nobody tests it.

### Non-goals (v2)

- **Third-party modules**, a module store, or downloading modules from the internet. Modules are first-party and
  ship in the repo (§6.4). Installing a renderer-only module from a file the user picks comes last, in P7
  (§6.4). **(C)**
- **Sandboxed module execution** (each module in its own iframe or `WebContentsView` with its own session).
  Deferred until third-party modules are wanted; the manifest's declared capabilities are designed so that tier
  can be added later. **(C)**
- **Embedded players or streaming remote content in the app window** (BACKLOG L259), and rating from links
  without downloading (L258's no-download variant). They conflict with the offline renderer (§9). L258's
  download-then-rate variant is covered by Fetch. **(C)**
- **The Telegram bot / rating from a phone.** **(C)**
- **Auto-update and code signing.** Packaging itself is an optional last phase (P8); until then the app runs from
  source with `npm start`. **(C)**
- **Tested macOS support.** It should run, but nobody tests it. **(C)** Windows and Linux are goals (G-8).
- **Video compression or transcoding**, GIF and WebP conversion (§12.6). **(C)**
- **A UI framework, a bundler, or a TypeScript migration.** **(C)**, consistent with task-019's "native ES module
  import — no bundler" and the 2026-07-12 decision that dropped the TypeScript migration.
- **Cloud storage** stays a non-goal (GOALS:63).

### Anti-goals (failure even if it "works")

- **Any data loss.** A fetch overwriting a file, a compression deleting or corrupting an original, or a module
  lifecycle wiping a cache (the July 23,559 → 32 feature-cache loss is the precedent;
  `2026-10-21-feature-cache-wipe-design.md` § 3).
- **A slower core at 24k files.** Startup to first media, navigation and rating must not get slower with the
  default modules on.
- **Boundaries that re-create old bug classes**: modules with their own locks (08-30 DEC-1), awaiting renders
  inside a render pass (10-07), hooks kept by convention (10-12 § 4), or one module's teardown deleting another's
  DOM (09-13 F4).
- **The rating flow buried under chrome.** Rating stays one keypress, and the media stays the largest thing on
  screen.
- **The renderer growing during v2.**

---

## 4. Constraints

- **Security envelope (G1, G1 I1).** Every privileged IPC channel goes through `ipc-guard.js`: the sender must be
  the top-level `app://media-viewer/index.html` frame, and each argument must pass its declared kind. Main acts
  only inside folders the user picked in main's own dialog (`path-grants.js`). The page loads only allowlisted
  app files and granted media (`app-protocol.js`). A CSP response header applies, with `connect-src 'self'` and
  `frame-src 'none'` (main.js:52–66). The renderer has no network (main.js:341–349). The renderer never parses
  built HTML (lint). Threat model: untrusted *folder content*; a hostile local user or malware is out of scope
  (G1 § 1).
- **What main can do to files today**: create folders; move a media file into a granted folder, never replacing
  an existing one (a ` (n)` suffix on a clash, main.js:467–525); write fixed-name JSON; delete one fixed-name
  state file. **No IPC writes media bytes, overwrites an entry, or deletes a media file.** Fetch and compression
  need new, narrow capabilities (§8.6).
- **`sandbox: false`** stays for now. Its real dependency is probably `require('path')` in `preload.js`, used by
  18 `electronAPI.path.*` call sites (inferred by the security review). Not changed by v2.
- **Tier-1 files**: `preload.js` and the file-move handlers in `main.js` need explicit user approval to change
  (PROJECT.md:73–78). Every new IPC call in §8.8 is a preload change.
- **No packaging, no CI.** Gates are the local Husky hooks. A module ships as files in the repo.
- **Two platforms.** Today the app is used and tested only on Windows. REVIEW-QUEUE:25 and :94 call it
  Windows-only in practice. G-8 adds Linux. The code is mostly portable already:
  - Electron, `sharp`, onnxruntime-node and `ffmpeg-static` all ship Linux builds.
  - Paths come from `app.getPath`.
  - The end-to-end helpers already branch on `process.platform` (tests/e2e/helpers/electron-app.js:30, :43,
    :137).
  - Folder containment compares realpaths exactly, which suits a case-sensitive filesystem.

  New platform-specific code is confined to main-side services (§8.4–§8.6), each with a branch per platform and
  unit tests for both.
- **24k scale.** The user's real folders hold 24,000+ files. Real-scale checks are user-side smokes.
- **Tests read renderer source and internals.**
  - Twelve test files read `media-viewer.js` as text. The largest is `tests/media-viewer-utils.test.js` (8,792
    lines), which extracts `MediaViewer` methods by brace-counting. The others are `keyboard-shortcuts`,
    `ml-training`, `ml-pair-selection`, the three `*-glue` tests, `feature-cache-harness.js`,
    `integration/cached-sort-path`, `video-release`, `app-protocol` and `media-url`. Several carry their own copy
    of the extractor (BACKLOG L1442, "Extract `extractAsyncMethod` helper … on third use", long past).
  - End-to-end tests reach app state through `window.mediaViewer` 430 times in 25 files.
  - Moving code out of the renderer means rewiring these tests in the same phase (§15).
- **One renderer-editing group at a time** (WEEKLY rule). v2 phases are sequential where they touch the
  renderer.
- **G2 PR 2 has landed** (PR #87, merge `f5ddfa3`, 2026-10-25). Hashing now runs in a per-run worker pool
  (`hash-pool.js`, `hash-worker.js`, `perceptual-hash.js`, `main-thread-hash.js`, `hash-parity.js`), and
  folder-file writes go through `atomic-write.js`. The similarity module (§12.1) takes those files in. This
  spec's line numbers still refer to `bf5ec84`, from before that merge; P1b re-maps them.

---

## 5. Core and modules: the split

### 5.1 Core (cannot be switched off)

| Area | Why it is core |
|---|---|
| Folder lifecycle: open, grants, recent folders, drop zone, empty state | Everything starts here; "one folder load at a time" and "changing folder exits non-core modes" live here (CLAUDE.md § State Management) |
| Viewer: single view, navigation, video controls, JPEG XL decode/display, zoom, fullscreen, file info | The product's identity (**U**: "the core viewer … is decent") |
| Rating: like / dislike / special moves, folder settings | The core workflow; the like/dislike folders are also the AI training set |
| Compare mode and the reusable pair view | **U**: compare "can do the same job" as tournament, so it stays |
| Undo (the core history and the undo dispatcher) | Every file action must be reversible (ROADMAP principle 2) |
| The file-action guard, render ownership, order commit | The rules every module must go through (§7.12) |
| Shortcut registry and the F1 panel | Modules register actions into it (§7.8) |
| Notifications, progress, jobs tray, side panel, action bar, Modules page | Shell services (§11.2) |
| Settings, logging | Shared services |
| Module host (registry, loader, host API) and main's module services | §6–§8 |

Recent folders stays core **(C)**: opening folders is core, even though its pure half would make an easy first
module.

### 5.2 Modules

| Module id | What moves into it | Default on? | Depends on |
|---|---|---|---|
| `similarity` | Similarity sort: the four sorters (vptree, mst, simple, clip), hashing (the G2 PR 2 pool), `.hash_cache.json`, `.sort_cache.json`, new-file placement, the sort button and algorithm picker | On | `features` (optional; needed only by the clip sorter) |
| `features` | Media features service: the 64-dimension extractor and worker pool, the CLIP embedding client (the model runs in main until P4a moves it into a `utilityProcess`), background extraction, `.feature_cache.json` | On | — |
| `ai-sort` | AI preference sort: scorer, `MlTrainingManager`, the model cache, % badges, the re-sort chip, "Rebuild model", and its two add-ons: like-or-skip (bulk-dislike skipped files) and bulk rate (compare "Both good / Both bad", `.bulk_rated.json`), plus best-vs-worst pairing in compare | On | `features` |
| `tournament` | Tournament mode: engine, manager, the ~1,050 lines of renderer glue, modals, `.tournament_state.json`, tier apply | On | — |
| `fetch` | Downloading through gallery-dl and yt-dlp into an Inbox folder | **Off** | outside tools |
| `compression` | Lossless JPEG XL conversion in place | **Off** | outside tools |

Defaults **(C)**: existing features stay on, so the first v2 launch behaves like today. New modules start off
because they use the network or rewrite files.

### 5.3 Removed: face detection (C)

Face detection runs only inside `computeFeatures` (media-viewer.js:9509–9531), which only `MlTrainingManager`
calls. So it fills feature dims 54–56 for **training** vectors only, while every **scored** vector has zeros there.
That is part of a train/score skew already filed (G3-reuse § 2.2, R5). It has no UI, setting or badge, and
`this.enableFaceDetection` is never assigned, so it always runs. v2 removes it: `face-detector.js`, the
`@vladmandic/face-api` dependency, and its two app-scheme trees (app-protocol.js:38–39).

**Mechanism:** the `features` service zeroes dims 54–56 in every vector it hands out, cached or fresh, training
or scoring. A `FEATURE_VERSION` bump changes the training fingerprint, so the model retrains once.
- **No re-extraction.** `FEATURE_VERSION` only feeds the fingerprint (`ml-training.js` `DESCRIPTOR_KEYS`), and
  the cache readers check only the file-level `FEATURE_CACHE_VERSION` plus size and mtime
  (feature-cache-store.js:296, ml-training.js:245).
- **Why not purge the face values from the caches:** that would need a cache-format change, and the only
  existing invalidation discards whole cache files, CLIP vectors included. That would be the 24k-file
  re-extraction this design rules out.
- **Out of v2:** the rest of the skew (dims 42–47 file metadata and 57–61, also G3-reuse F1) stays as filed.
  Fixing it changes model behaviour, against G-3; it belongs to the AI work that follows the research report.

Lands with the `features` module (§12.2).

**If P4a's fp32 switch ships** (§12.2), its `FEATURE_CACHE_VERSION` bump re-extracts every vector anyway, so face
removal needs no zeroing step: re-extracted vectors carry zeros in dims 54–56 by construction. Zeroing at use is
the fallback if the fp32 switch, which the user accepted, is ever dropped.

---

## 6. What a module is

**In one sentence:** a module is a folder inside the app, `modules/<id>/`, holding a manifest, a renderer part the
app loads as an ES module and hands a *host* object, optional Web Workers, and optional main-process *adapters*
for outside programs; the user turns it on or off on the Modules page.

**Prior art, for orientation.** The trust model is Obsidian's: in-app plugins with full trust, a manifest and an
enable toggle. Declared contribution points and activation follow VS Code's manifest model. Outside programs run
under a supervised job runner, much like a build tool's task runner. No sandboxed plugin tier yet (Joplin and
Logseq run plugins in iframes; that is the deferred tier in §3).

### 6.1 Anatomy

```
modules/
  similarity/
    module.json           manifest (validated by main at startup)
    ui/index.js           export function activate(host) { … return { deactivate() } }
    ui/*.js               the module's renderer code (ES modules)
    workers/*.js          the module's Web Workers
  fetch/
    module.json
    ui/…
    main/gallery-dl.js    main-process adapter: required BY NAME from main/adapters/index.js
    main/yt-dlp.js
tests/modules/<id>/       the module's unit tests (vitest's tests/**/*.test.js already covers them)
```

Example manifest (values illustrative):

```json
{
  "id": "fetch",
  "name": "Fetch",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "Download media from links with gallery-dl and yt-dlp into your Inbox folder.",
  "entry": "ui/index.js",
  "defaultEnabled": false,
  "requires": [],
  "optional": [],
  "provides": [],
  "contributes": { "panels": ["fetch"], "settings": true, "shortcuts": [] },
  "folderFiles": [],
  "appData": ["gallery-dl-archive.sqlite3", "yt-dlp-archive.txt", "history.jsonl"],
  "workers": [],
  "jobs": ["fetch.gallery-dl", "fetch.yt-dlp"],
  "tools": [
    { "id": "gallery-dl", "optional": false },
    { "id": "yt-dlp", "optional": true }
  ],
  "permissions": { "network": true, "fileWrites": "create" },
  "legacySettingsKeys": []
}
```

| Field | Meaning | Checked by main at startup |
|---|---|---|
| `id` | kebab-case, unique | equals the folder name |
| `apiVersion` | the host API version the module targets | the host supports it, or the module is not loaded |
| `entry`, `workers`, `styles` | paths inside the module folder (`styles` are CSS files the host links when the module activates, under the existing CSP) | no `..`, no absolute paths, file exists |
| `defaultEnabled` | the toggle's state before the user touches it | boolean |
| `requires` / `optional` | other module ids | exist; no cycles |
| `provides` | service names other modules may `use` (§7.11) | unique across modules |
| `contributes` | contribution points used (§7.7) | known point names |
| `folderFiles` | per-folder files the module owns, by exact name, with a size cap and a `kind`: `cache` (recomputable; losing it costs time) or `data` (the user's work, such as bulk ratings or a saved tournament) | dot-file `.json` names; not owned by core or another module; a module owning a `data` file must handle renames (§7.3) before compression will run in a folder holding it |
| `appData` | file names under `userData/modules/<id>/` | plain names, no separators |
| `jobs` | job types from main's adapter registry | each type is registered in main |
| `tools` | outside programs from main's tool catalogue | each id is in the catalogue |
| `permissions.network` | the module launches programs that use the internet | shown on the Modules page |
| `permissions.fileWrites` | `none`, `create` (new files via a job) or `replace` (swap files, originals kept) | must cover every declared job type's needs |
| `legacySettingsKeys` | today's `localStorage` keys the module keeps using, so no settings migration is needed | strings |

### 6.2 Where each part runs

| Part | Process | Why |
|---|---|---|
| `ui/` | The app page (renderer), as an ES module served from `app://media-viewer/modules/<id>/ui/…` | Module code needs the DOM and the host's in-memory state. This is a code boundary, not a security boundary (§6.4). |
| `workers/` | Web Workers started by the module | Pixel work must stay in Chromium for results to match: hashes, 64-dimension features and JXL decoding depend on Chromium's decoder and canvas (G2 spec F3, F6) |
| `main/` adapters | Main, but only adapters that `main/adapters/index.js` requires by explicit path | Building a command line and reading a tool's output must happen in main, so the renderer can never choose an executable or pass raw flags |
| Outside programs (gallery-dl, yt-dlp, cjxl, djxl) | Child processes started by main's job runner | They are separate programs; main supervises them (§8.5) |
| The CLIP model (and later embedding models) | Main until P4a, then an Electron `utilityProcess` started by main | npm packages cannot load in Electron Web Workers, and the renderer is offline (CLAUDE.md § Active gotchas). In main, onnxruntime-node blocks the process that serves every image and IPC call, so P4a moves it out (§12.2) |

**Rule M-1 (C): main never runs code it discovered on disk.** Main reads `modules/*/module.json` as *data*. It
never `require`s a file because a manifest named it. Every main-side adapter is required statically from
`main/adapters/index.js`, so adding a module with a main part means a reviewed core change. A test pins this
(§15).

**Rule M-2 (C): module code talks to the app only through `host`.** Inside `modules/**/ui` and `workers`, lint
bans `window.mediaViewer`, `window.electronAPI`, imports of `media-viewer.js` or `core/*` (except the type-only
`core/host-api.js`), and other modules' files. Modules may touch the DOM only under the elements the host hands
them (panel roots, control slots), so lint also bans document-level lookups there (`document.querySelector*`,
`document.getElementById`, `document.body`). This is a control, not a convention.

**Lint blocks (C).** ESLint's flat config lists files by name, so a new tree is unchecked until it has a block
(`2026-07-10-cw-p-process-dx-guardrails-design.md`:28). P1a adds one each for `core/**`, `modules/*/ui/**`,
`modules/*/workers/**`, `main/**` and the adapters. The bare-`ipcMain` ban, today scoped to `main.js` only
(eslint.config.mjs:96), extends to `main/**` and every adapter, or a new main service could register IPC around
ipc-guard.

### 6.3 Rules every module follows (from today's invariants)

These are stated once here and enforced by the host API's shape (§7.12):

1. A module never holds its own lock over file actions; it runs them through `host.actions.runFileAction`.
2. A module never assigns the file list; it proposes an order through `host.order.apply`.
3. A module never awaits a render inside a render pass; it calls `host.render.request()`.
4. Every per-file piece of state a module keeps is purged through `onFileRemoved` (returning a stash the
   history entry keeps) and restored through `onFileRestored`; renamed through `onFileRenamed`.
5. Folder-file reads and writes carry the visit token; a module freezes its copy synchronously in
   `onVisitEnd`.
6. Cancelling settles every pending promise.
7. Long work reports only through the host's progress and jobs surfaces.
8. Everything read from a folder file is untrusted and validated by the module before use.

**When a module's code throws (C).**
- A hook or callback that throws is logged with the module id and skipped, and core's flow continues. A failed
  `onFileRemoved` never blocks a move.
- A veto hook that throws counts as "stay" and shows an error, so unfinished work is never discarded by
  accident.
- Stashes from `onFileRemoved` are stored per module id on the history entry, and each goes back only to its
  own module.

### 6.4 Trust model (C)

- **First-party only.** Until P7, modules come only from the app's own `modules/` directory. Main never looks for
  modules in the user's media folders or online. P7 adds exactly one more root,
  `userData/modules-installed/`, filled only by the user's explicit install (below).
- **Renderer modules are trusted code.** They run in the app frame, so ipc-guard cannot tell them from core
  (security review § 2a). Rule M-2 keeps them honest; it does not contain a malicious module.
- **What main enforces, per module**, through its services (§8): which per-folder file names it may read and
  write, which job types it may start, which tools those jobs may run, and which file-write capability those
  jobs have. A module that is switched off loses all of them.
- **Other people's installs.** Someone who clones the public repo gets the same first-party modules, reviewed in
  the same repository, so the trust model holds for them as it does for the user. The only path for outside code
  is P7's install-from-file, and it warns plainly. A sandbox for untrusted modules stays future work (§3).
- **What main does not enforce:** a child process (gallery-dl, cjxl) has the user's full rights and its own
  network. Main checks that a job's output folder is granted before it starts and checks what appeared or
  changed afterwards (§8.5–§8.6). It cannot stop the program from writing elsewhere.
- **Why not stronger now:** the threats in scope are bugs and untrusted folder or web content, not malicious
  modules. A sandboxed tier (a `WebContentsView` and session per module, its own preload, an identity check by
  `webContents` instead of URL, per-session protocol and egress rules) is a real project. It is deferred until
  third-party modules are wanted (§3).
- **Installing a module from a file (C, P7).** The user's April note asks to install and uninstall add-ons that
  are not in the main app (BACKLOG L255). v2 meets that last, in P7:
  - The Modules page gets **Install from file…**: main's own dialog picks a module folder or zip, main validates
    its manifest, copies it into `userData/modules-installed/<id>/`, and the app restarts.
  - **Uninstall** moves that folder to the Recycle Bin.
  - Installed modules are **renderer-only**: no `main/` part, no jobs, no tools (Rule M-1 still holds).
  - They are served from a second app-scheme root with the same realpath checks.
  - Installing warns plainly that a module can read and move the user's files.

  P1a keeps discovery and serving root-agnostic (a list of roots), so P7 adds a root rather than a redesign.

### 6.5 Lifecycle

1. **Discovery.** At startup main lists `modules/*/module.json` from the app directory, validates each against
   the manifest schema and the checks in §6.1, resolves `requires` and `optional`, and drops any module whose
   checks fail or whose required module is off or failed. It records why.
2. **Enabled state.** Main keeps it in `userData/modules.json`
   (`{ "version": 1, "enabled": { "<id>": true } }`), written atomically and only through a guarded IPC call from
   the Modules page. A module with no entry uses `defaultEnabled`.
3. **Activation.** After core has initialized, and before the drop zone takes input, the renderer gets the
   resolved list. It imports each enabled module's `entry` in dependency order and calls `activate(host)` with a
   host built for that module (§7). Each activation has a timeout (5 s **(C)**).
   - A module that throws or times out is marked *failed*. Its contributions are removed, the failure is logged
     and shown on the Modules page, and the app carries on.
   - `activate` only registers things. Heavy work (workers, models, cache reads) starts on first use, as
     `mlWorker` does today, so startup to first media does not slow down.
4. **Toggling takes effect on restart (C).** The Modules page offers "Restart now". It runs the normal close flow
   first: veto hooks (an unfinished tournament's Save / Discard / Cancel), then stopping jobs, then relaunch.
   Runtime activation and deactivation would buy convenience at the price of exactly the lifecycle bugs the
   project keeps fixing.
5. **Quit.** The host calls each module's `deactivate()` (if returned) during the existing close flow, after
   veto hooks have had their say (§7.5) and before main stops jobs (§8.5).
6. **Versions.** The host supports a list of `apiVersion`s (v2 ships `[1]`). Modules are first-party and move
   with the host, so this mostly guards the future.

---

## 7. Host API v1

`activate(host)` receives a frozen object built for that module. The module's id scopes its log lines, settings
keys, folder files, app data, jobs and services. The contract is written as JSDoc typedefs in
`core/host-api.js` (no TypeScript, no build step).

**The typedefs are documentation, not a control (C).** Without `checkJs`, nothing checks a module against them
(`2026-10-17-weekly-reviews-run.md`:293–295). The control is the contract tests in §15. Adding `checkJs`, a
`jsconfig.json` and `tsc --noEmit` (which needs `typescript@6`) is left out of v2. It can follow if the
`typescript-lsp` trial earns its place.

**Built incrementally (C).** The host grows phase by phase: each extraction adds only the groups it needs (§14
lists them). Nothing below is built speculatively.

### 7.1 Basics

```js
host.module            // { id, version, dataDir }
host.log.error(msg, detail?) / host.log.perf(line)   // prefixed with the module id; main strips newlines, caps length
host.settings.get(key, fallback) / set(key, value)   // localStorage "module.<id>.<key>", plus declared legacy keys
host.ui.notify(message, level, { sticky, action })   // the core notification system
```

### 7.2 Folder and visit

```js
host.folder.current()              // { path, name } | null
host.folder.onLoaded((visit, files) => …)          // after every successful load (files may be empty); visit = { id, isLive() }
host.folder.onVisitEnd((visit) => …)               // SYNCHRONOUS: freeze anything you will save (wipe spec § 5.4)
host.folder.onWillChange(async () => 'ok' | 'stay')   // veto for unfinished work (tournament's Save/Discard/Cancel)
```

### 7.3 Files and order

```js
host.files.list()                  // read-only snapshot: [{ name, path, size, mtimeMs, type }]
host.files.current()               // the file on screen (single) or the pair (compare)
host.files.onOrderChanged((kind) => …)       // 'folder' | 'similarity' | 'ai-fresh' | 'ai-resort' | 'restore' | …
host.files.onFileRemoved((path) => stash | undefined)    // stash is kept on the history entry
host.files.onFileRestored((path, stash) => …)
host.files.onFileRenamed(async (oldPath, newPath, { samePixels, sameBytes }) => …)  // resolve once your re-key is saved; see §12.6
host.order.apply(paths, { kind, startPath, offerIfUserActed }) // → 'applied' | 'offered' | 'declined'
host.order.restore()               // back to folder order (today's _restoreOriginalOrder, shared)
```

`host.order.apply` is today's `_applySimilarityOrder` (media-viewer.js:7897) made general: it waits for render
idle, re-checks, commits synchronously, calls the order-changed path (`_onOrderChanged`, :1527), and offers a
sticky "Show" when the user acted since the run started (`SimilaritySort.userActedSince`). It is the only way an
order reaches the screen.

**Renames are journaled (C).** Compression's renames must reach every module that keeps data keyed by file name,
even one that is off, or a folder the user has left, or after a crash. Otherwise:
- `loadBulkRatedFile` (media-viewer.js:9677–9687) prunes every name no longer in the folder, losing bulk ratings
  (training data);
- `reconcileWithFiles` (tournament.js:134) drops renamed files from a saved tournament.

So main records each rename it performs in a rename journal (§8.6), marked pending for every module owning a
folder file present in that folder.
- **While the folder is open**, the host calls `onFileRenamed`. When the module's promise resolves (its re-key is
  saved), the host acknowledges the entry for that module.
- **On a later load of that folder**, `onLoaded(visit, files, { renames })` hands each module its pending
  renames. The module applies them right after reading its folder file and before any pruning, saves, and
  acknowledges them through `visit.ackRenames()`.
- **Entries are deleted** once every listed module has acknowledged them. A module that stays off keeps its
  entries pending until it next opens that folder.

### 7.4 File actions and undo

```js
host.actions.runFileAction(label, async (tx) => { … })   // → result | { refused: reason }
//   tx.move(path, 'like' | 'dislike' | 'special' | { folder }) → historyEntry
//   tx.removeFromList(path, { deferSaves })   tx.render()
host.undo.registerKind(kind, async (entry, tx) => …)     // runs inside a file action
host.undo.push(kind, entry)
host.actions.isBusy()
```

`runFileAction` is today's `_fileOpInFlight` discipline as an API. It takes the guard before the first `await`,
refuses when busy (quietly for ratings and navigation, with "Wait for the move to finish" for header actions),
and starts the render before releasing the guard, so there is no gap. Calling it from inside another file
action is refused and logged as a bug ("no guarded method may call another").

### 7.5 Render, modes and lifecycle

```js
host.render.request()             // coalescing; returns nothing to await
host.render.whenIdle()            // for code OUTSIDE a render pass only
host.modes.register({
  id, label, icon, order,
  canEnter(ctx) → true | reason,
  enter(ctx), leave(ctx) → Promise<'leave' | 'stay'>,
  view: 'single' | 'pair' | 'custom',    // 'pair' borrows core's PairView, never compare's internals
  render(ctx),                           // called by the host's single render owner
  controls: ControlSpec[],               // see §11.2
  keymap: '<mode id>'                    // the shortcut map this mode uses
})
host.lifecycle.onBeforeQuit(async () => 'ok' | 'stay')
```

Core registers *single* and *compare* through the same registry. A folder change asks every non-core mode to
leave (with its veto), then lands in single mode, as today.

### 7.6 Sorting

```js
host.sorting.registerSorter({
  id, label, cacheKey, needs: ['hash'] | ['clip'],
  prepare(ctx, { signal, onProgress }),                       // compute missing inputs
  sort(inputs, { startPath, params, signal, onProgress }) → Promise<string[]>,
  placeNew?(cachedPaths, newFiles, inputs) → string[]
})
host.sorting.registerScorer({
  id, label,
  ensureReady(ctx, { signal, onProgress }) → { source, stats },
  score(files, { signal }) → Promise<Map<path, number>>
})
host.compare.registerPairProvider({ id, label, pairs(files, scores) → [[a, b], …] })   // AI best-vs-worst
```

Modules return data; only the host writes the file list. The host owns the Sort menu, the progress card and
Cancel. An unknown sorter id is an error (today an unknown algorithm silently runs Simple,
`sorting-worker.js`:783–786).

### 7.7 UI contribution points

| Point | What a module adds | Example |
|---|---|---|
| `host.ui.sortMenu` | entries (from registered sorters/scorers). Until P6a builds the unified Sort ▾ menu, this is a header slot where today's controls render with their current element IDs | similarity algorithms, AI sort |
| `host.ui.panel(id, { title, icon }) → rootElement` | a tab in the side panel | Fetch, Compression, AI details |
| `ControlSpec` in a mode | a control in the action bar or a pair-view overlay slot | tournament's Both win / Both lose |
| `host.ui.compareActions` | buttons in compare's action bar | Both good / Both bad (AI) |
| `host.ui.singleActions` | extra single-mode actions | Dislike skipped (AI) |
| `host.ui.settingsSection(title) → rootElement` | a section in F1 → Settings | AI badges, CLIP toggle |
| `host.ui.modal(options)` | a modal that owns the keyboard while open (capture listeners, every close path cleans up) | tournament config, bulk-dislike confirm |
| `host.ui.fileInfoSection(render)` | a section in the file-info panel | Fetch: the source page |
| `host.progress.start(label, { cancel }) → handle` | the one progress surface | sorts, training |
| `host.jobs` | rows in the jobs tray (§7.10) | downloads, compression runs |

Module DOM lives only under elements the host hands out. A module's teardown can never remove a node it did
not create (the 09-13 F4 bug).

### 7.8 Shortcuts

```js
host.shortcuts.registerActions(mode, {
  bothWin: { label: 'Both win', defaultKey: 'KeyD', run: () => …, repeatable: false }
})
```

The core registry keeps today's rules:
- **Remaps outrank defaults.** A stored remap beats a default that arrives later, and the new action is left
  unbound rather than stealing the key (`_mergeModeShortcuts`).
- **Repeat suppression.** Only `next` and `previous` may auto-repeat.
- **Text fields never fire shortcuts.**
- **Versioned migrations** for changed defaults.
- **Every registered mode gets a reverse map.** No mode's keys can silently do nothing.

A switched-off module's actions are not registered, and its stored remaps are kept for when it returns. The F1
panel shows a group per mode, including module modes. That also fixes the open item that tournament keys are
never shown or saved (BACKLOG L772–L773).

### 7.9 Storage

```js
host.store.folderFile('.hash_cache.json')   // only names declared in folderFiles
  .read(visit) → parsed | null | { error }      // the module validates; null = absent, never "0 entries"
  .write(visit, value)                          // atomic; refused if the visit ended or the ledger says stale
host.store.appData('history.jsonl')         // under userData/modules/<id>/; read/write/append
```

The feature cache keeps its streaming channels and ledger (wipe spec § 7.2). `features` owns it through a
streaming variant of `folderFile` that wraps today's `featureCache*` calls.

### 7.10 Jobs and tools

```js
host.jobs.start(type, params) → job       // type must be in the manifest's jobs
job.on('progress' | 'item' | 'done' | 'failed' | 'cancelled', handler)
job.cancel()
host.tools.status(toolId) → { found, path, version, meetsMinimum, hint }
```

The renderer passes typed `params` (for example `{ urls, inbox }`). Main validates them against the adapter's
schema and builds the command itself (§8.5).

### 7.11 Services between modules

```js
host.services.provide('features', api)    // only names in the manifest's provides
host.services.use('features')             // only ids in requires/optional; null when an optional one is off
```

### 7.12 The invariants the API encodes

| Today's rule (CLAUDE.md, specs) | Where it lives in v2 |
|---|---|
| One file action at a time; no guarded method calls another | `runFileAction` (refuses nesting) |
| Header actions refuse during a file action | `runFileAction`'s busy policy + `host.actions.isBusy()` |
| No gap at the render handoff | `tx.render()` starts before the guard drops |
| Single render owner; never await a render inside a pass | `host.render.request()` returns nothing to await |
| Every reorder goes through `_onOrderChanged` | only `host.order.apply/restore` assign the list (source-scan test, §15) |
| One apply function after render idle; run tokens | `host.order.apply` + visit/run `isLive()` |
| One per-file cleanup; undo restores what was purged | `onFileRemoved` stash → history entry → `onFileRestored` |
| A visit owns cache IO; "never read" is not "0 entries"; frozen-copy saves | `folderFile.read/write(visit)`, `onVisitEnd` synchronous |
| One folder load at a time; folder change exits non-core modes | core folder lifecycle + mode `leave` vetoes |
| Leaving an unfinished tournament asks Save/Discard/Cancel | `onWillChange` / mode `leave` / `onBeforeQuit` |
| Modals own the keyboard | `host.ui.modal` |
| Shortcut versioning and collision rules | core registry (§7.8) |
| One progress surface | `host.progress` / `host.jobs` |
| Cancel settles every pending promise | sorter/scorer `signal` contract; the host settles on cancel |
| Folder content is untrusted | modules validate `folderFile` reads; main caps sizes |
| ML pulls ratings from durable state | unchanged: `ai-sort` reads the like/dislike folders and `.bulk_rated.json` |

### 7.13 Test access (C)

End-to-end tests read app state through `window.mediaViewer` today (430 references in 25 files). That object
stays. `activate` may return a `testApi` beside `deactivate`, and core attaches it as
`window.mediaViewer.modules[<id>]`. Rule M-2 bars module code from reading `window.mediaViewer`; tests may.

When state moves into a module, its end-to-end tests keep the same assertions and change only the access path,
for example `window.mediaViewer.tournament.engine` → `window.mediaViewer.modules.tournament.engine`. Each
phase lists the test files it rewires (§15).

---

## 8. Main-process services for modules

New main-side code goes in a `main/` folder **(C)**, which the app scheme does not serve. Existing top-level main
files stay where they are.

### 8.1 Module registry

`main/module-registry.js` discovers and validates manifests (§6.5), keeps `userData/modules.json`, and answers
`list-modules` / `set-module-enabled` over guarded IPC. Every other service asks it whether a module is enabled
and what it declared.

### 8.2 Folder-file service

`main/folder-files.js` generalizes `read-folder-cache` / `write-folder-cache`, the tournament-state channels and
the bulk-rated channels into one pair, `folder-file-read` and `folder-file-write`, with these rules:
- Arguments `(moduleId, folder, name, value?)`: the folder must be granted, and the name must be declared by that
  enabled module (or core).
- `assertFixedPath` refuses planted links (main.js:312–325).
- Size caps come from the manifest.
- Writes go through the atomic writer (G2 PR 2's `atomic-write.js`: unique temp, fsync, rename, one write per
  target at a time).
- The renderer gets `null` for an absent file and a distinct error for an unreadable one.

Existing file names and formats are unchanged (§13). The feature cache keeps its streaming channels and ledger.

### 8.3 App-data store

`userData/modules/<id>/` per module, for declared names only, with the same atomic writer and an append mode for
logs such as `history.jsonl`. Existing app-level files keep their paths (`userData/ml-model-cache.json`,
`userData/folder-grants.json`); their modules declare them as legacy paths.

### 8.4 Tool catalogue and tool grants

`main/tools.js` holds a fixed catalogue of the outside programs v2 knows: `gallery-dl`, `yt-dlp`, `cjxl`, `djxl`.
Each entry has its executable names per platform, a version command and parse rule, and a minimum version where
one is a security floor (cjxl/djxl ≥ 0.11.2, which the `media_compression` archive track pins for a CVE fix). It
also has install hints per platform: Scoop or winget on Windows; the distribution's package manager or pipx on
Linux; Homebrew on macOS.

- **Detection** looks on `PATH` (Scoop shims included) and resolves each tool to one absolute path. Main reads
  the version of *that* path and spawns *that* path. A bare name can resolve to a second install at spawn time,
  for example a pip and a Scoop copy of `yt-dlp` (`2026-10-17-weekly-reviews-run.md`:256–260: a version check
  must read the binary that will run).
- **A user-chosen executable** is registered only through main's own file dialog: a *tool grant*, like folder
  grants. The renderer can never supply an executable path.
- Grants persist in `userData/tools.json`. Main re-reads the version before every job and refuses a job when the
  version is below the floor.
- **The app never updates a tool itself**, and never passes a tool's self-update flag. It shows the installed
  version and the update hint.
- **No hash pinning (C)**: Scoop updates would trip it constantly. The path is fixed by the grant, and the
  version is checked before every job.

### 8.5 Job runner and adapters

`main/job-runner.js` runs jobs. An adapter (`main/adapters/*.js`, or `modules/<id>/main/*.js` required by name
from `main/adapters/index.js`) declares:

```js
{
  type: 'fetch.gallery-dl',
  tools: ['gallery-dl'],
  fileWrites: 'create',
  maxConcurrent: 1,
  paramsSchema,                       // validated with the ipc-guard kinds style
  buildCommand(params, tools, ctx) → { file, args, cwd },   // no shell, ever
  onStdoutLine(line, ctx) → event | null,
  onExit(code, ctx) → result,
  verify?(ctx) → report
}
```

The supervisor:
- **Spawning.** `spawn`/`execFile` with `shell: false` and `windowsHide: true`. The cwd is a per-job temp folder
  under `userData`, swept at startup. The environment is reduced to what the tool needs (`PATH`, `SYSTEMROOT`,
  `TEMP`, `USERPROFILE`, …).
- **Load.** Below-normal process priority (`os.setPriority`).
- **Output.** stdout is framed by line, with a per-line and a total cap. stderr goes to the session log,
  redacted (§8.7).
- **Time.** An idle timeout and a total timeout per adapter.
- **Cancel** kills the whole process tree, because yt-dlp starts ffmpeg:
  - Windows: `taskkill /PID <pid> /T /F`;
  - Linux and macOS: the child is spawned `detached` as its own process group, and the group is signalled
    (`process.kill(-pid)`), TERM first, then KILL after a grace period.
- **Close and quit.**
  - Closing the window while jobs run asks to stop them, joining today's close-confirm flow (main.js:229–235,
    363–374).
  - Quitting cancels every job and waits briefly.
  - Startup sweeps leftover job temp folders. Nothing does that today (security review § 4).
- **Concurrency.** One compression run at a time per app. Fetch runs one job per tool unless the adapter allows
  more.
- **Events.** Results go to the renderer as `job-event` pushes. They are delivered only to the app page's
  `webContents`, and the preload hands each subscriber an unsubscribe function, as `onClipDownloadProgress`
  does.
- **No passthrough.** Users never type flags. Each adapter passes only allowlisted options, and makes its tool
  ignore user config files, because downloader config files and options can run commands (yt-dlp's
  `--exec`, gallery-dl's exec post-processors). The exact flags are left to the builder and the fetch research.
- **Transport.** stdio, never a localhost HTTP server: G1 I1 D1 rejected loopback servers for port exposure and
  DNS rebinding.

Jobs do not resume after a restart (C). The tools' download archives make a rerun cheap. Compression's run
ledger makes an interrupted run recoverable (§12.6).

### 8.6 File-write capabilities

Two new capabilities, each available only to jobs whose module declares it. Main's "never replace" move rule
stays as it is.

- **`create` (fetch).** The job's output folder must be inside a granted folder (the Inbox, granted through the
  folder dialog). Main lists the folder before and after the job, reports the new files to the module, and
  reports, but never deletes, anything unexpected (a non-media file, a file outside the folder the tool was
  told to use).
- **`replace` (compression).** The tool never touches originals. It writes into a temp folder inside the source
  folder, and main itself performs each swap, recording each step in a run ledger
  (`userData/modules/compression/runs/<runId>.jsonl`) before doing it:
  1. The original is moved into `<folder>/.compression-originals/<runId>/`.
  2. The verified file is moved to its final name.
  3. The new file's mtime is set to the original's.
  4. A swap whose target name exists is refused.

  Originals go to the Recycle Bin (`shell.trashItem`) only when the user finalizes the run. On Linux that is the
  desktop's freedesktop trash. Where no trash is available, finalizing refuses and the originals stay in the
  holding folder. **Nothing in v2 deletes a media file permanently.**

  With each swap, main also appends the rename to the **rename journal** (`userData/rename-journal.jsonl`):
  folder, old name, new name, `samePixels`/`sameBytes`, and the modules pending. The pending list is every
  enabled or disabled module whose declared folder file exists in that folder. The renderer acknowledges
  entries per module through a guarded channel (§7.3, §8.8).

### 8.7 Logging

Each module's lines are prefixed with its id. Main strips newlines and caps length on every renderer-supplied log
string, which also fixes today's forgeable `source` field (security review § 4). Job logs record tool, version,
exit code, counts and durations. URLs in logs keep only their host and path: query strings and credentials are
removed.

### 8.8 New IPC and preload (Tier 1)

Each of these is a `preload.js` change, so each needs explicit user approval when it is built (PROJECT.md tiers).
Each gets ipc-guard kinds and a line in a new test that pins the bridge's exact surface (no such test exists
today, security review § 1).

| Channel(s) | Phase |
|---|---|
| `list-modules`, `set-module-enabled`, `restart-app` | P1 |
| `folder-file-read`, `folder-file-write` (replacing the per-file cache and state channels as each moves) | P1–P6 |
| `app-data-read`, `app-data-write`, `app-data-append`, `module-app-data-delete` (the Modules page's delete, §10) | P3 |
| `tool-status`, `tool-choose` (main's dialog) | P3 |
| `job-start`, `job-cancel`, `onJobEvent` | P3 |
| `compression-run-revert`, `compression-run-finalize`, `rename-journal-pending`, `rename-journal-ack` | P5 |
| `set-ui-zoom` (Ctrl + / − through `webFrame` in the preload) | P7 |
| `module-install` (main's dialog), `module-uninstall` | P7 |

---

## 9. Security

| Invariant | v2 |
|---|---|
| Context isolation on, node integration off | kept |
| `sandbox: false` | kept (§4) |
| ipc-guard: top-level app page, typed arguments | kept; every new channel registers through it |
| Folder grants, dialog-only | kept; the Inbox and every compression folder are granted folders |
| Media-only content reads, `assertFixedPath` | kept; extended to every module folder file |
| App scheme allowlist | **extended**: serve `modules/*/module.json`, `modules/*/ui/**`, `modules/*/workers/**` (`.js .json .css .wasm`), never `modules/*/main/**` |
| CSP | kept unchanged (module code is `'self'`) |
| Renderer has no network | kept. Fetching happens in child processes main starts |
| Main's own network | unchanged: only model downloads, made from main or, from P4a, from the embeddings utility process; §12.2 pins each model revision and moves the cache to `userData` |
| No HTML parsing of built strings | kept; the lint's file list becomes a glob that covers `modules/**` and `core/**` |
| "No `file:` URLs in the renderer" source check | the same: becomes a glob |
| Untrusted folder content | kept; module folder files validated at load; downloaded files are untrusted like any folder content |
| Never replace on move | kept; `replace` is a separate, ledgered capability (§8.6) |
| `ffmpeg`/`ffprobe` local only | kept |
| **New**: tool grants, job runner without shell or passthrough, kill-tree, quit sweep | §8.4–§8.5 |
| **New**: module boundary lint (M-2), static adapter list (M-1), bridge-surface test | §6.2, §15 |
| **New**: lint blocks for every new tree; the bare-`ipcMain` ban extended from `main.js` to `main/**` and the adapters | §6.2 |
| **New**: no secrets stored | Fetch uses the browser's cookies through the tool's own option or a cookies file the user picks (path stored, file not copied); no passwords or tokens are stored. `safeStorage` only if a later module must store one |

**Network policy (C).** The renderer stays offline. Main's only own traffic is the CLIP model download. Programs
started by an enabled module with `permissions.network: true` use the network themselves; the Modules page says
so, and the job log records which hosts they were pointed at.

**Not enforced, stated plainly.** Renderer modules have the full bridge. Child processes have the user's rights.
The check-then-use window on paths (an accepted residual, I1 § 11) is wider for long jobs. These are acceptable
for first-party modules under the current threat model, and they are the reasons third-party modules are a
non-goal.

---

## 10. Finding and connecting modules

- **The Modules page** is a new tab in the F1 overlay, beside Shortcuts and Settings **(C)**. One row per module
  found in `modules/` (and, from P7, per installed module, with an **Uninstall** button):
  - name, version, a one-line description;
  - an on/off toggle;
  - status: *on*, *off*, *failed* (with the error), *needs connecting*, *disabled because <module> is off*;
  - badges: "Uses the internet", "Writes new files", "Replaces files", "Downloads an 87 MB model".
- **Connecting a tool.** A module that needs outside programs shows each one with its detected path and version,
  whether it meets the minimum, and buttons **Detect again**, **Choose…** (main's file dialog, a tool grant) and
  **How to install** (the catalogue's hint). A module whose required tool is missing can be turned on, but its
  panel shows the connect step instead of its controls.
- **Dependencies.** Turning off `features` shows that `ai-sort` (requires it) will turn off too, and that the
  similarity clip sorter will be hidden (optional). Turning on `ai-sort` offers to turn on `features`.
- **Restart.** Any change shows "Restart to apply" with a **Restart now** button.
- **First v2 launch.** Existing features are on, `fetch` and `compression` are off, and a one-time notice points
  to the Modules page.
- **Turning a module off never deletes its data.** Its folder files and app data stay on disk.
  - **App data** (`userData/modules/<id>/`) can be removed with an explicit "Delete this module's app data"
    action on its row. A confirmation lists the files first.
  - **Per-folder files** stay where they are. Main cannot know every folder a module ever wrote into, and the
    files are small dot-files that nothing reads while the module is off. A per-folder cleanup is out of scope.

---

## 11. The redesign

### 11.1 Architecture

- **`media-viewer.js` becomes the core coordinator.** Core services move into `core/*.js` ES modules: folder
  lifecycle, file list and order, render owner, file actions and undo, modes and the pair view, shortcuts, shell
  and UI services, module loader and host. Module code moves into `modules/*`. `MediaViewer` keeps the wiring.
- **The v2.0 pattern still applies inside core.** A stateful class takes constructor-injected callbacks, with no
  back-reference to the host (task-019; the regression checker's § 8). The full-injection form proven by
  `FeatureCacheStore` and `MlTrainingManager` is the model for the host itself.
- **Tests move with the code.** Each phase moves the tests for the methods it moves from
  `tests/media-viewer-utils.test.js` to direct imports of the new files.
- **Size target (C, soft):** the renderer plus `core/*.js` together stay below today's 11,879 lines, and
  `media-viewer.js` alone drops below 6,000 lines by the end of P6. The clusters that move out make that
  reachable: similarity and hashing ~1,500 lines, features, AI and bulk/like-or-skip ~2,500–3,000, tournament
  glue ~1,050.
- **The renderer may not grow, with teeth (C).** Every phase's exit criteria include "net `wc -l
  media-viewer.js` ≤ 0", measured in the phase's PR. The never-blocking warning this week's G5 is weighing
  cannot enforce an anti-goal on its own. A blocking check that ratchets the ceiling down after each phase is the
  recommended control, and the choice is G5's.

### 11.2 The shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▣ Liked_2 · 24,013 ▾   [ Single | Compare | Tournament ]   Sort ▾   ⚙ F1  ▤ │  top bar (auto-hides, as today)
├───────────────────────────────────────────────────────────┬──────────────┤
│                                                           │ side panel   │
│                                                           │ ┌──────────┐ │
│                        STAGE                              │ │Fetch     │ │
│              (media; single view or pair view)            │ │Compress  │ │
│                                                           │ │AI        │ │
│                                                           │ └──────────┘ │
│                                                           │ (collapsible)│
├───────────────────────────────────────────────────────────┴──────────────┤
│   ✗ Dislike     ★ Special     ↶ Undo     ♥ Like          ← the active mode's controls
└──────────────────────────────────────────────────────────────────────────┘
                                   jobs tray ▸ Fetching 3/10 · Compressing 120/900 · Sorting 40%
```

- **Top bar**: the folder pill and recent-folders menu (core), the mode switcher (registered modes), the Sort
  menu (registered sorters and scorers), F1, and the side-panel toggle. It keeps today's auto-hide.
- **Action bar**: one bar whose contents come from the active mode's `ControlSpec`s, the *mode-aware control
  registry* of BACKLOG L223. Each control names its action, so tooltips come from the live shortcut binding (as
  `_shortcutSuffix` does today). Pair-view overlay slots follow the same registry. The `#compareOverlayBar` from
  PR #70 is the working prototype (BACKLOG L792).
- **Side panel**: closed by default, the stage never shrinks below a minimum width, and its open/closed state and
  tab are remembered. Module panels live only here.
- **Jobs tray**: long-running work (sorts, extraction, training, downloads, compression runs) gets a row with
  progress and Cancel. It replaces today's progress card, which shares one DOM element with the notification
  (CLAUDE.md § Active gotchas). Notifications stay bottom-right, above the tray.
- **F1 overlay**: tabs for Shortcuts (a group per mode), Settings (core + module sections) and Modules.
- **Layering**: finish the z-index scale (six `--z-*` tokens exist, 13 of 22 declarations use them) so every
  layer comes from the scale.
- **Responsive pass** (BACKLOG L224): narrow, typical and wide breakpoints; thousands separators with a tooltip
  for exact counts; modals capped at `min(520px, 90vw)`.
- **UI zoom**: Ctrl + / − / 0 through `webFrame.setZoomFactor` (L261), persisted.
- **Visual style**: unchanged. The existing token system (61 custom properties, dark glass) carries over. No light
  theme in v2.
- **Command palette** (search every registered action): optional, last in the order (§14).

### 11.3 What does not change for the user

Keys and the rating flow, the like/dislike/special folders, undo behaviour, the per-folder files, tournament
saves, the model cache, the recent-folders list and folder grants. A user who never opens the Modules page sees
today's app in a cleaner shell.

---

## 12. Module charters

Each module gets its own spec and plan when its phase starts (the project's brainstorm → spec → plan flow). These
charters fix scope and the decisions those specs must honour.

### 12.1 `similarity` (the pilot)

- **Moves in**:
  - `handleSortBySimilarity` and its offer/Show path (media-viewer.js:7313–8089);
  - hashing: G2 PR 2's pool and workers (merged 2026-10-25), plus whatever hashing glue remains in the
    renderer (8090–8271 at `bf5ec84`);
  - the sort worker and its cache IO (8272–8796);
  - `similarity-sort.js`;
  - the sort button, algorithm picker and K setting.
- **Host groups it adds**: sorting (§7.6), `host.order.apply/restore`, `folderFile` (for `.hash_cache.json` and
  `.sort_cache.json`), progress, settings, shortcuts, visit tokens, `onFileRemoved`/`onFileRestored` (today's
  `perceptualHash` stash on history entries), and services (the clip sorter `use`s `features`).
- **Until `features` exists**, core provides a thin `features` service over today's feature store, so the clip
  sorter works from day one.
- **UI stays as it is**: the module renders today's controls into the host's header slot with their current IDs
  (`#sortSimilarityBtn`, `#sortAlgorithmSelect`, `#sortSettings`, `#sortKValue`). The unified Sort ▾ menu waits
  for P6a.
- **Done when**:
  - the four sorters run as registered sorters;
  - `media-viewer.js` loses those clusters;
  - the similarity end-to-end tests pass with the same assertions, `similarity-sort.test.js` and the
    similarity parts of `rating-safety`, `sort-progress` and `security-csp-walk` reaching moved state through
    §7.13;
  - a 24k smoke matches today's timings.
- **Why the pilot (C)**: the user already ruled that the SortingManager is the next extraction (WEEKLY), wants
  sorting as add-ons (U, L256), and G2 PR 2 has just made hashing module-shaped. It also exercises most of the
  host API at medium coupling.
- **The graph build is now the long part of a cold sort.** BACKLOG 🔵 [2026-10-25], "The similarity sort's
  graph-build phase is now the long part of a cold run", measured it at 361 s of a 943 s cold run on 14,201
  files. The module owns that work once P1b lands. A parallel build that keeps results identical belongs there,
  as its own task. A capped K needs the user's decision under the 2026-06-19 quality lock.
- **After P4a, the CLIP sorter becomes the default (C, from the AI research).** The hash sort puts same-subject
  photos next to each other 10.5 % of the time, against about 6 % by chance; every faithful embedding gets
  71–77 % (research § 3). The hash sorters stay selectable, and stay the default while `features` is off. This is
  a deliberate behaviour change, so it lands in P4c, not in the P1b extraction.
- **Group copies (P4c, from the AI research).** A new grouper finds near-duplicates: edited, cropped, mirrored or
  re-compressed copies.
  - **Model:** DINOv2-small with registers, fp32 (Apache-2.0, 88 MB, about 90–100 ms per image on the CPU), never
    its q8 file. It found 99.6 % of copy pairs at a threshold admitting 1 unrelated pair in 1,000. CLIP finds
    76–80 %, today's hash 38 % (research § 4).
  - **Method:** groups are connected components above one cosine threshold, found with the VP-tree that
    `sorting-worker.js` already has. The threshold is tuned on real folders.
  - **Presentation:** first a sorter whose order keeps each group contiguous, with group boundaries for a badge.
    A dedicated review view is for its own spec.
  - **Order:** it needs the `features` utility process first (the research: "do before adding a model"). A
    zero-download first version can threshold the CLIP vectors already cached (76 %).

### 12.2 `features` (shared service)

- **Moves in**:
  - the 64-dimension extractor and worker pool, and background extraction and its pause gate (10320–11458);
  - `computeFeatures` (9448);
  - `FeatureCacheStore` and `.feature_cache.json` v4;
  - the CLIP client side (`initClipModel`, `extractClipEmbedding`) and the CLIP lease.
- **Provides** `features`: `get(path)`, `ensure(paths, { signal, onProgress })`, and `embeddings.acquire(modelId)` /
  `release()`. Acquiring *loads and pins* the model, so the "acquire does not ensure" trap in CLAUDE.md goes away.
  A failed load comes back as an error, not as a silent `null`.
- **Decisions**:
  - face detection removed (§5.3);
  - the model revision pinned;
  - the model's cache directory moved from `node_modules/@huggingface/transformers/.cache/` (the library default,
    so a fresh `npm ci` re-downloads the model) to `userData/models/`.
- **Inference moves into an Electron `utilityProcess`, in P4a (C, from the AI research).**
  - **Why:** onnxruntime-node runs synchronously on the JavaScript thread. Each CLIP call freezes the main
    process, which serves every `app://` image and IPC call, for its own duration (p99 56–66 ms over a CLIP run),
    and loading freezes it once for 0.4–1.0 s. In a utility process the main thread's p99 stayed at about 20 ms,
    its idle level (research § 8). It also isolates native crashes and lets a model really unload.
  - **How:** main starts and supervises the process like the job runner's children: a restart after a crash,
    unload when idle, and a kill at quit. Main still checks folder grants before forwarding a path. The service
    API does not change.
- **CLIP switches from its q8 file to fp32, in the same change (C, from the AI research).**
  - **Why:** the q8 file moves the vectors (median cosine 0.915 with fp32) and erases most of the learnable
    quality signal. A quality taste reached AUC 0.55 on q8 against 0.66 on fp32, and strict copy detection drops
    from 0.80 to 0.76. The q8 file also crashed the process on DirectML (research § 5).
  - **Cost:**
    - 352 MB instead of 89 MB;
    - 0.5–0.74 GB while loaded instead of 0.15–0.24 GB, released when the utility process unloads;
    - about 1.3–1.5× the CPU time;
    - one re-extraction: `FEATURE_CACHE_VERSION` is bumped, so each folder's cache re-extracts in the background
      the first time an AI or CLIP sort needs it there.
  - **Decided (U, 2026-10-22): yes.** The user accepted the fp32 switch, which answers the research's open
    question 6.
  - **Other platforms.** Only the GPU path is Windows-specific. The fp32 file runs on the CPU wherever
    onnxruntime-node runs.
    - Off Windows it costs about 1.3–1.5× today's per-image CPU time (research § 8), inside the utility process,
      so browsing is not affected. The one-time re-extraction simply takes longer.
    - ONNX Runtime has GPU paths for macOS (CoreML) and Linux (CUDA), but the research did not measure them, so
      v2 does not promise them.
    - The service picks its accelerator at runtime, with the CPU as the fallback everywhere, and adds a provider
      only after measuring it.
    - On Linux, a supported platform (G-8, D21), this means the CPU path is the tested one.
- **GPU, optional.** DirectML on Windows (adapter 0), with fp32 files only: 20–30 ms per CLIP image on the RTX
  3050 Ti. DirectML is in sustained engineering (new work moved to Windows ML), but it ships inside onnxruntime-node
  and worked in the research.
- **The embeddings service is multi-model.** `embeddings.acquire(modelId)` serves:
  - CLIP B/32 fp32 now;
  - DINOv2-small for Group copies (§12.1, P4c);
  - SigLIP 2 later, when text search is wanted.

  Each model's vectors are cached per folder under its own model id. The builder chooses between a field in the
  feature cache and a sibling cache file; the streaming transport and the ledger apply either way. **Never ship
  the community q8 files of SigLIP 2 or DINOv2**: they are broken (median cosine 0.785 and 0.805 with fp32).

### 12.3 `ai-sort`

- **Moves in**:
  - `handleSortByPrediction` and its apply (9282, 9710–10319);
  - the ML worker glue (9069–9423) and `ml-training.js`;
  - badges, the re-sort chip, "Rebuild model";
  - like-or-skip (`like-or-skip.js` + glue);
  - bulk rate (`applyBulkRating`, `undoBulkRating`, `.bulk_rated.json`);
  - the best-vs-worst compare pairing (as a pair provider).
- **Host groups it adds**: scorer, pair provider, compare and single action contributions, `undo.registerKind`
  (bulk and `skipBatch`), and `onOrderChanged` (the like-or-skip token).
- **UI stays as it is.** Moved controls keep their IDs: `#sortPredictionBtn`, `#resortPredictionBtn`,
  `#dislikeSkippedBtn`, `#rebuildModelBtn`, `#bothGoodBtn` and `#bothBadBtn`.
- **Test access.** The seven end-to-end files that use AI internals reach them through §7.13's `testApi`. That
  includes the `mlWorker.postMessage` and `showMedia()` instrumentation CLAUDE.md prescribes.
- **Decisions**:
  - the model follows the training-set fingerprint, not the open folder (unchanged);
  - the model-cache file keeps its path;
  - tournament tier outcomes as training labels (BACKLOG L148) is a later `labels` service, not part of the
    extraction.
- **From the AI-sorting research: the learner is the weak link, and fixing it is the biggest single win.**
  - **Cause:** the 64 hand-crafted features (0 to 1 each) sit unscaled beside 512 CLIP numbers (about 0.044
    each), so a few epochs of plain SGD are dominated by the hand-crafted part (research § 1).
  - **Measured on synthetic subject tastes:**
    - z-scoring the inputs with the training files' own statistics lifts held-out ROC AUC by +0.10 to +0.20 at
      today's cost;
    - a converged L2 logistic regression (C = 1) on standardised inputs reaches +0.10 to +0.21, ranking at
      0.70–0.96 where the app reaches 0.57–0.86;
    - on the quality taste it helps only together with fp32 CLIP (§12.2).
- **The learner fix ships as its own small task, outside the module phases (C).**
  - **What changes:** z-scoring with the mean and standard deviation stored beside the weights and applied at
    scoring, plus a `TRAINING_CONFIG_VERSION` bump (about 1 SP). Then an L-BFGS-style primal solver: the
    prototype's exact dual solver grows to 6 s at 500 labels (about 2 SP; research, Recommendation 1).
  - **Why outside the phases:** the change lives in `ml-worker.js` and `ml-model.js`, not in the renderer. It
    neither waits for v2 nor grows `media-viewer.js`.
  - **When:** ideally before P4b, so the extraction carries the fixed learner. It is a deliberate behaviour
    change, so it is never part of an extraction (G-3).
  - **Gate: a real-data check.** The research's tastes are synthetic. The decisive test is the user's own
    like/dislike folders, cross-validated locally with nothing uploaded. **Decided (U, 2026-10-22): run it.**
    This answers the research's open question 7. A follow-up task runs the research harness on those folders
    before A1 ships (§19).
  - **Check first (inferred, not measured):** training vectors carry file metadata and face values that scoring
    vectors lack (dims 42–47 and 54–61, G3-reuse F1). With training-set standardisation, those scoring-time zeros
    become one constant offset. Ranking is unchanged, but the % badges, which are probabilities, shift. Fix the
    skew first, or accept shifted badges.
- **Skips stay out of training (unchanged, confirmed by the research).** With the better learner, passive skips
  used as weak dislikes cost 2–4 likes per 60 shown once the user also passes a fifth of the files they would have
  liked. The confirm-then-F path already captures their reliable part (research § 2).
- **Not in v2:**
  - SigLIP 2 and text search: research step 4, "when search is wanted"; the user skipped CLIP text search on
    2026-08-28 (BACKLOG L126);
  - a generic "best shot first" score;
  - face grouping;
  - learning from tournament picks.

  The scorer interface keeps all of them possible later without changing the host API.

### 12.4 `tournament`

- **Moves in**: `tournament-engine.js`, `tournament.js`, the renderer glue (5887–6939), the modals,
  `.tournament_state.json` and tier apply.
- **Prerequisites (C)**:
  - the control registry (§11.2);
  - mode registration (§7.5);
  - core's `PairView` component, so tournament stops reusing compare's internals (the 09-13 F4 and 10-07 F3/F6/F7
    bugs came from that sharing);
  - the leave/quit vetoes;
  - special moves through `runFileAction`;
  - its `engine.history` stack wired into the undo dispatcher as the active mode's handler.
- **Must keep**: the single render owner (§7.5), Save/Discard/Cancel on every exit, `UNDO_HISTORY_CAP`, the
  history-free v2 state file, and validation at load.
- **Adds `onFileRenamed`** support so compression can re-key saved state (§12.6).

### 12.5 `fetch`

- **Engines (C, provisional until the downloader research lands)**: gallery-dl for galleries, boorus,
  imageboards and social sites; yt-dlp for video pages. Each URL is routed by a domain rule table, with a
  per-run override. The user installs both (Scoop or winget on Windows; the package manager or pipx on Linux); the
  app does not bundle them, which also avoids
  the GPL question for gallery-dl.
- **Inputs**:
  - pasted links (one per line);
  - a text file of links;
  - a browser session export in Tab Session Manager's JSON format (the format of the session files the user
    already keeps beside `media_parser`), with a domain filter and de-duplication.
- **Output: the Inbox (C).** One granted folder, flat, so the viewer can open it directly; its listing is not
  recursive.
  - File names come from a per-engine template that includes the site and item id, so names never collide.
  - Both tools skip existing files.
  - Partial downloads stay in the tools' own `.part` files and are removed on cancel.
- **Rating**: the user rates the Inbox with the core viewer. Liked, disliked and special files move to the usual
  folders, so the Inbox empties like a mail inbox. This is `media_parser`'s fetch → rate → keep loop, without
  Telegram.
- **Duplicates across runs**: each tool's download archive, kept in `userData/modules/fetch/`.
- **Where a file came from**: `history.jsonl` in app data (time, page URL, engine, saved file names), shown in the
  file-info panel's Fetch section.
- **Politeness**: a default delay between requests and a rate limit, one job per tool at a time, and the tools'
  own browser-like identity. Nothing identifying (no email, account name or handle) is ever added to requests.
- **Credentials**: optional per-site cookies through the tool's browser-cookie option or a cookies file the user
  picks. No passwords are stored (§9).
- **Not in v2**: embedded players, scheduled feed watching, a Telegram bot, our own site scrapers.
- **`media_parser`'s code is not reused**: it is a generic `img`/`a` scraper with no timeouts, retries or safe
  writes, and its bot is Telegram-bound. Its loop and its session-file input carry over.
- **Open to the downloader research**: engine choice per site class, the exact safe flag sets (ignore user
  config, output templates, archive, metadata, rate limits), and any better-maintained tool. Fold them in when
  the report lands.

### 12.6 `compression`

- **Scope (C)**:
  - JPEG → JPEG XL by lossless transcoding (bit-exact reconstruction);
  - PNG → JPEG XL lossless (pixel-exact at the image's own bit depth).
  - GIF is out: its payoff is about 0.98 of the original size, about 27 s per file, and some files grow. WebP and
    video are also out.
- **Files are routed by their content**, sniffed from the bytes, not by extension. The user's collection has 832
  `.png` files that are WebP and 228 `.jpg` files that are PNG (media_compression archive spec § 1.2).
- **Per file**:
  1. Encode into `<folder>/.compression-tmp/<runId>/`.
  2. Verify:
     - JPEG: `djxl` reconstructs the JPEG, and its SHA-256 must equal the original's.
     - PNG: decode both files to raw pixels at full depth and compare.
  3. Keep the result only if it is smaller (by at least a threshold; 2 % **(C)**).
  4. Swap through main's ledgered `replace` (§8.6).
- **Metadata**:
  - JPEG transcoding keeps EXIF, XMP and ICC bit-exact.
  - **PNGs with text chunks other than XMP are skipped and reported**, because the encoder drops them, and AI
    generation prompts (A1111, ComfyUI) live there. The `media_compression` converter loses them silently
    today.
  - The original's mtime is kept (§8.6).
- **Where it runs**: on the open folder only, so every rename reaches the live file list and every module's hooks.
  To compress the like folder, open it.
  - **Switching folders** during a run asks "Stop compression?". If yes, the run stops at a batch boundary, its
    renames are delivered while the folder is still open, and the switch proceeds. The run can be continued
    later.
  - **Quitting** does the same through the close flow.
- **Refusals**:
  - while a sort, training or another job runs on the folder;
  - while the folder holds a `data`-kind folder file of a module that does not yet handle renames. Before P6b
    that is `tournament`'s `.tournament_state.json`.
- **Renames reach modules that are off, or a folder reopened after a crash**, through the rename journal (§7.3,
  §8.6). Bulk ratings and saved tournaments survive either way.
- **During a run**:
  - The user can keep browsing and rating.
  - Swaps commit in small batches through `runFileAction`, so they never overlap a user's move.
  - A file the user moved away is skipped at swap time.
- **Renames reach every module** through `onFileRenamed(old, new, { samePixels: true, sameBytes: false })`:
  - `features` re-keys CLIP vectors; the 64-dimension vector is re-extracted if any of its dimensions depend on
    file size or format (the builder checks `feature-extractor.js`).
  - `similarity` re-keys PNG hashes and recomputes JPEG hashes, because decoders can differ by a few pixels.
  - `ai-sort` re-keys `.bulk_rated.json`; sort caches rewrite paths.
  - Core rewrites the file list and the current file.
- **Revert and finalize**: the Compression panel lists runs with **Revert run** (originals back, JPEG XL files to
  the Recycle Bin, renames reversed through the same hook) and **Finalize run** (originals to the Recycle Bin).
  Compression is not on the Ctrl+A undo stack.
- **Crash safety**: the run ledger is written before each step. On launch, an incomplete run is reported with
  **Restore originals** and **Continue**. Every file is recoverable at every point.
- **Load**:
  - workers default to half the cores, with `cjxl --num_threads` capped;
  - below-normal priority;
  - a free-space check before starting (`fs.statfs`);
  - one run per app.
- **Platforms**: re-implementing in Node (D15) is also what makes compression run on Linux. The PowerShell
  pipeline is Windows-only, while `cjxl`, `djxl` and `sharp` exist on both.
- **Tools**: `cjxl` and `djxl` ≥ 0.11.2 through the tool catalogue. PNG decoding for verification uses `sharp`
  (already a dependency) and `djxl`'s own output. ImageMagick is not needed **(C)**.
- **Browsing speed is the price of the space saved (C).** The viewer shows JPEG XL the slow way. jxl-oxide
  decodes it in WebAssembly, and the pixels go through a PNG round trip before display (CLAUDE.md § Active
  gotchas), while JPEG and PNG use Chromium's native decoders. The savings are about 15 % on JPEG and 40 % on PNG
  (the `media_compression` bake-off ratios, 0.85 and 0.61). Fast flipping through 24k files is the app's core
  promise, so the trade-off is shown before every run, not assumed:
  - **Every run starts with a preview.** Before any swap, the module encodes a sample of the folder (about 30
    files, spread across sizes and types) into its temp folder. It times their display through the viewer's real
    JPEG XL path against the originals, and shows both sides in the form "about N GB saved; each image takes
    about X ms to appear instead of Y ms" (no figures are measured yet). The user then starts or cancels the run
    for that folder.
  - **The panel's advice** is to convert archives and folders the user rarely opens, and to leave the folders
    they rate daily as they are.
  - **P5's exit criteria** still include measuring navigation on a converted 24k copy before the user converts
    the main collection.
- **`media_compression` stays the reference, not a dependency (C)**. Its converter always exits 0, reports no
  progress, trusts unverified outputs on resume, and writes a separate tree. Its encoder settings, verification
  rules and lessons are carried over: temp-then-rename, content sniffing, keep-if-smaller, the cjxl version floor.
  Its cold-archive track is out of scope. This follows the user's own expectation that it "will need rewriting"
  (L213).

---

## 13. Data and migration

- **Per-folder files keep their names and formats**: `.feature_cache.json` v4, `.hash_cache.json`,
  `.sort_cache.json`, `.bulk_rated.json` v1, `.tournament_state.json` v2. Each is declared by its module. A format
  change needs its own version bump and migration, as today.
- **App data keeps its paths**: `ml-model-cache.json`, `folder-grants.json`. New module data goes under
  `userData/modules/<id>/`. New core files: `userData/modules.json`, `userData/tools.json`.
- **Settings keep their keys.** Modules declare the `localStorage` keys they already use
  (`legacySettingsKeys`): `sortAlgorithm`, `enableClipFeatures`, the ML toggles and so on. New settings use the
  `module.<id>.` prefix. `customShortcuts` stays one object; module actions are added to its per-mode maps under
  the existing collision rules, with no version bump for additive actions.
- **Face-detection removal** zeroes dims 54–56 at use and bumps `FEATURE_VERSION` (§5.3): one retrain, no
  re-extraction, caches untouched. If the fp32 switch ships, it rides that re-extraction instead.
- **The CLIP fp32 switch** (§12.2, accepted by the user) bumps `FEATURE_CACHE_VERSION`. Every folder's
  `.feature_cache.json` then re-extracts once, in the background and lazily, the first time an AI or CLIP sort
  needs that folder. It costs one ~352 MB download.
- **The learner fix** (§12.3) bumps `TRAINING_CONFIG_VERSION`, so cached models rebuild once.
- **The CLIP model cache move** (§12.2) costs one ~87 MB download, unless the builder copies the existing cache
  across.

---

## 14. Build order

Rough story points; the project's estimates have run about 1.9× low (WEEKLY), so read the totals as a range.

| Phase | Scope | Host groups added | Exit criteria | SP |
|---|---|---|---|---|
| **P0** Prerequisites | G2 PR 2 merged (done: PR #87, `f5ddfa3`, 2026-10-25); this spec approved (done, 2026-10-22); the G5 board change and the new BACKLOG entries (§19) | — | spec approved; board shows v2 | — |
| **P1a** Module host + Linux baseline | manifest schema, registry, `modules.json`, loader, failure isolation, the Modules tab (list, toggle, restart), app-scheme allowlist, lint M-2, static-adapter test (M-1), bridge-surface test, glob-based sink and `file:` checks, `folder-file-*` channels; first, today's app and suites run on Linux, and whatever fails there is fixed | basics, folder/visit, files (snapshot, events), storage | an empty module loads, fails safely and toggles; all suites green on Windows and Linux | ~10 |
| **P1b** `similarity` | §12.1 | sorting, order, progress, settings, shortcuts, removed/restored hooks, services | §12.1 "done when" | ~10 |
| **P2** Shell part 1 | side panel, jobs tray (the progress card moves into it), F1 tabs | `host.ui.panel`, `host.jobs` (UI half), `host.progress` | sorts report in the tray; panels open and close | ~6 |
| **P3a** Job runner and tools | §8.4–§8.5, close/quit integration, `app-data-*` | jobs, tools | a test adapter runs, cancels, kills its tree, survives quit | ~8 |
| **P3b** `fetch` | §12.5 | `create` capability | links → Inbox → rate; a rerun skips what it has | ~8 |
| **A1** Learner fix (any time, outside the phases) | §12.3: standardise, then fit to convergence, in `ml-worker.js`/`ml-model.js` | — | the user's real-data check run; models rebuild; badges checked (§12.3's offset note) | ~3 |
| **P4a** `features` | §12.2: the service, inference in a `utilityProcess`, CLIP fp32 with its cache-version bump (accepted by the user), DirectML on Windows and the CPU elsewhere, face detection removed | services | features served through the service; clip sorter switched to it; the main thread's event-loop p99 stays at its idle level during extraction; re-extraction runs in the background with progress in the tray | ~12 |
| **P4b** `ai-sort` | §12.3 | scorer, pair provider, action contributions, undo kinds | AI sort, like-or-skip, bulk rate behave as today (with A1's learner if it shipped); the real-worker E2E passes | ~10 |
| **P4c** Copies and default | §12.1: Group copies on DINOv2-small fp32; the CLIP sorter as default when `features` is on | — | copy groups found on fixtures and on one real folder, threshold tuned there | ~4 |
| **P5** `compression` | §12.6; renames in `similarity`, `features`, `ai-sort` and core; the rename journal in main and its replay in `onLoaded` | `onFileRenamed`, the rename journal, `replace` capability | lossless round trips on fixtures (mislabelled files and text-chunk PNGs included); crash-in-the-middle recovery tested; revert and finalize; renames survive a module being off and a crash (journal replay tested); a measured browse speed on a converted 24k copy | ~15 |
| **P6a** Control registry | the mode-aware action bar, `PairView`, the z-index scale (L223), the unified Sort ▾ menu (sort tests move from the header IDs to the menu) | modes, `ControlSpec` | single and compare run through the registry; overlay tests pass | ~10 |
| **P6b** `tournament` | §12.4, `onFileRenamed` for its state | vetoes | tournament suites pass with the same assertions (state reached through §7.13); compression stops refusing tournament folders | ~10 |
| **P7** Finish | responsive pass (L224), UI zoom (L261), the ZoomManager and CompareManager core splits, installing renderer-only modules from a file (§6.4), command palette (optional) | install/uninstall | the §11.1 size target | ~13–18 |
| **P8** Packaging (optional) | installable builds for people who will not run from source, for example with electron-builder: a Windows installer, a Linux AppImage or `.deb`. Includes serving `modules/` from the packed app, unpacking native modules (`sharp`, onnxruntime-node), and a first-run guide for outside tools. No auto-update or code signing (§3) | — | a fresh Windows and a fresh Linux machine install, open a folder and rate | ~5–8 |

Total: about 119–124 SP nominal (A1 included, the optional P8 not), so roughly seven normal weeks of v2 at full
user-flagged capacity, or twelve to fourteen with the historical slip and the Cleanup Weeks. A soft target is Q1
2027.

**The AI research's order is kept** (learner, then copies, then the utility process with fp32, then SigLIP 2),
with one change: the research's own rule that the utility process comes "before adding a model" puts P4a ahead of
P4c's DINOv2 part. A1 needs no module work and can ship first.

**Every phase also (C):**
1. Shows net `wc -l media-viewer.js` ≤ 0 in its PR (§11.1), and passes the unit and end-to-end suites on Linux as
   well as Windows (G-8).
2. Rewires the tests that read the code it moves (§4 lists the twelve source-reading files and the 430
   end-to-end references), and its plan names each file.
3. Sweeps unit tests, end-to-end tests, comments and `CLAUDE.md` for every symbol it moves (CLAUDE.md § Best
   Practices; `2026-07-10-cw-p-process-dx-guardrails-design.md`:147–153).
4. Moves the `CLAUDE.md` rules for the code it moves into `.claude/rules/<id>.md`, scoped to `modules/<id>/**`
   (or `core/**`).
   - It keeps every cited heading and runs the rule-loss check with a planted deletion (G5 size audit spec
     :100, :140).
   - `CLAUDE.md` is 63,634 bytes, 5.4 KB below its 69,000-byte trigger, so v2's rules cannot all land there.
   - This makes v2 the vehicle for BACKLOG L1033 ("Migrate path-conditional CLAUDE.md content to path-scoped
     rules"). The G5 audit judged that migration low-payoff only while nearly every rule concerned
     `media-viewer.js` (:52).
5. Keeps `docs/ARCHITECTURE.md` current. P1a rewrites its file tree and replaces its "Extension Points"
   section with the module architecture.
6. Indexes its spec and plan in `docs/README.md`, and checks off the BACKLOG entries it closes in its closeout
   commit.

**BACKLOG entries each phase closes**, cited by title:

| Phase | Entry |
|---|---|
| P1a | L601 "`docs/ARCHITECTURE.md`'s file tree omits every extracted module"; L1442 "Extract `extractAsyncMethod` helper to `tests/helpers/extract-method.js` on third use" (the first rewiring needs the shared helper) |
| P1b | L1811 "Event-based cache invalidation" (`onFileRemoved`); L1580 "Extract ShortcutManager module" (the registry becomes `core/shortcuts.js` when modules register actions); L516 "Extend the size warning to `.claude/rules/*.md` …" falls due with the first rules file |
| P4b | L1810 "Batch removal support" (`tx.removeFromList` with deferred saves, used by the bulk-dislike batch); L1560 "Centralized `insertFileIntoList()` method" (the undo dispatcher's restore path) |
| P6b | L772 "`saveShortcut()` silently drops the `tournament` mode …"; L773 "No tournament section in the F1 help overlay …" |
| P1b → P6b | L1033 "Migrate path-conditional CLAUDE.md content to path-scoped rules", one module at a time |
| P1a → P7 | the [2026-04-08] add-on entries L255–L256, the [2026-10-04] tournament entry L122, the [2026-05-30] compression entry L213, the [2026-05-25] overhaul pair L223–L224, L261 (UI zoom), as their phases ship |

**Why this order (C):**
- **Host first, proven on the pilot.** An API designed without a consumer drifts. Similarity is the consumer the
  user already ruled next.
- **Shell part 1 before the new modules**, because fetch and compression need the panel and the tray.
- **Fetch before AI extraction**, because it is new value for the user and independent of existing features.
  P3 and P4 may swap if the AI research makes the AI work more urgent.
- **Compression after `features` and `ai-sort` are modules**, so its rename hook is written once, in module
  form, instead of into the monolith.
- **Tournament last among extractions.** It is the riskiest (8 fix specs, 33 fix commits) and needs the control
  registry and `PairView` first.

**Scheduling:**
- G2 PR 2 merged on 2026-10-25. The Oct 19–23 week's G3 (ZoomManager), G4, G5 (the strategic refresh) and G6
  were still open then. If G3 does not happen, P7 absorbs the ZoomManager split.
- Cleanup Week #5 runs Oct 26–30.
- The earliest normal week for P1a is about Nov 2–6.
- Each phase is a whole task (design → implement → verify) in one weekly group, as the user ruled on 2026-10-10.

---

## 15. Verification

- **Behaviour unchanged.** Every extraction phase keeps the existing unit and end-to-end suites green with no
  assertion weakened. Moved tests import the new files directly.
- **Host contract tests.** Each host group has unit tests against a fake app state, and each module has tests
  against a fake host (the `MlTrainingManager` style). Concurrency rules get adversarial tests: nested
  `runFileAction`, an `order.apply` during a render, a save after `onVisitEnd`, cancel settling promises.
- **One real wiring test per module.** At least one test wires the real host to the real module. Fakes hide
  wiring bugs at exactly the boundary leaf tests stub out (`2026-05-21-pr-33-hygiene-and-integration-tests-design.md`
  :140; the ML pipeline shipped broken behind a green mock, ML spec § 13).
- **Every control proves it can fire.** Each lint rule and source scan below gets a planted violation that must
  fail (`2026-09-02-weekly-reviews-run.md`:253–271).
  - In P1a the `modules/**` and `core/**` globs match no code yet, so their planted fixtures are the only proof
    that they run.
  - Source scans take a synthetic `src` parameter (`2026-07-04-cw-v-test-tooling-backfill-design.md`:105–108)
    and state their blind spots: braces in comments and regex literals (:90–104).
- **Extractions move behaviour, not bugs' fixes.** An extraction that uncovers a product bug reports it, keeps
  the behaviour, and fixes it in its own change (`2026-06-15-cw-2-test-backfill-design.md`:13–15).
- **Visual evidence gates the shell phases** (P2, P6a, P7), using the `tests/e2e/visual-evidence.test.js` pattern.
  Visual checks failed before for lack of a gate, not of a tool (`2026-09-02-weekly-reviews-run.md`:205–209).
- **Known rewires:** `sort-progress.test.js` asserts the progress card that P2 replaces, and the tournament
  end-to-end tests read `tournament.engine` internals (CW-2 :62–119) that P6b moves (§7.13).
- **Controls, as tests or lint**:
  - a manifest-schema test over `modules/*`;
  - a test that main requires no file under `modules/**/main` except from `main/adapters/index.js` (M-1);
  - the M-2 lint;
  - a bridge-surface test;
  - glob-based sink and `file:` checks;
  - the `_onOrderChanged` source scan, widened to "only `core/order.js` assigns the list".
- **Data safety.**
  - Fetch: never overwrites (a clash fixture), and cancel leaves no partial files in the Inbox.
  - Compression: verify-failure fixtures (bad encode, size not smaller, mislabelled types, text-chunk PNGs), a
    kill at every ledger step followed by recovery, and revert/finalize round trips.
  - Folder files: the wipe-spec probes re-run against the folder-file service.
- **Real scale.** The user runs a 24k smoke after P1b, P4b, P5 and P6b. Each phase writes down the timings it must
  match: startup to first media, navigation, and sort times.
- **Linux runs (G-8).** Every phase exit runs the unit and end-to-end suites on Linux as well as Windows.
  - Until the user moves, WSL2 with its built-in GUI support on the user's Windows 11 machine is a candidate for
    the Electron runs. P1a confirms it works, or picks another Linux machine.
  - Platform branches (tool lookup, process-tree kill, trash) get unit tests for every platform, with the
    platform faked.
- **Nothing from the user's folders enters git (C).** This repository is public. Smoke results, real-data checks
  and copy-threshold tuning record only counts, timings and metrics. They never record the user's file names,
  folder names, per-file scores or images, and test fixtures never use them.
- **Security.** Each phase that adds IPC runs a `/claude-security` scan of its change. Each preload change gets
  explicit approval.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| The host API grows too big, too early | built per phase (§14); nothing speculative |
| An extraction breaks a 24k behaviour the fixtures cannot show | user smokes with recorded timings; phases small enough to revert |
| Test-harness migration cost is underestimated | twelve source-reading test files and 430 end-to-end references are assigned to the phases that move their code; moved tests import directly; a shared extractor helper (L1442) in P1a |
| `CLAUDE.md` overflows its size trigger | v2's rules go to path-scoped `.claude/rules/` files as code moves (§14) |
| The fp32 switch re-extracts every folder once (hours at 24k files on the CPU) | background and lazy, per folder, only when an AI or CLIP sort needs it; progress in the jobs tray; DirectML optional; the user decides first (§12.2 gate) |
| Larger downloads and memory (CLIP fp32 352 MB, DINOv2 88 MB; 0.5–0.74 GB while loaded) | the utility process unloads when idle; the user accepted the cost on 2026-10-22 |
| The research measured synthetic tastes on 500-px thumbnails | the learner fix waits for the real-data check the user agreed to on 2026-10-22; copy thresholds are tuned on a real folder (§12.1, §12.3) |
| Community q8 model files that are silently broken | fp32 files only for SigLIP 2 and DINOv2; a fidelity check (cosine against fp32) before any new model file ships |
| Linux support drifts, because daily use stays on Windows | both suites on Linux at every phase exit; platform code confined to a few main-side services with per-platform unit tests; P1a fixes today's gaps first |
| Compression loses data | originals held until finalize, ledger before every step, verify before swap, no permanent deletes, fixtures for every failure path |
| JPEG XL browsing is too slow after conversion | every run opens with a measured preview of display time against space saved, decided per folder; the panel advises converting rarely opened folders; P5 measures a converted 24k copy (§12.6) |
| Downloaders break as sites change, or sites object | maintained upstream tools the user updates; delays and rate limits; the user decides what to fetch |
| A new IPC weakens the security envelope | ipc-guard kinds, a bridge-surface test, a scan per phase, Tier-1 approval |
| A renderer module misbehaves (trusted code) | M-2 lint, failure isolation at activation, first-party review |
| Scope creep and estimate slip | phase exit criteria; a spillover line as soon as a slip is known (WEEKLY rule) |
| Collisions with in-flight renderer work | one renderer-editing phase at a time; G2 PR 2 has merged, so P1 waits only for its scheduled week (and for G3 if that is still running) |

---

## 17. Decisions made in this session

The user skipped the question round on 2026-10-22. These are therefore Claude's calls unless marked (U); each can
be flipped before approval. The five most worth checking first: **D6** (no install/uninstall until P7), **D16**
(compression replaces files in place), **D15** (compression re-implemented, not driven through the PowerShell
scripts), **D1** (v2 absorbs v2.0) and **D14** (fetch engines and the Inbox).

| # | Decision | Section |
|---|---|---|
| D1 | v2 absorbs the "v2.0 modularization" release; the board change goes to the G5 strategic refresh | §2 |
| D2 | Core = folder lifecycle (recent folders included), viewer, rating, compare, undo and shell services | §5.1 |
| D3 | Sorting and tournament leave the core **(U)**, as modules `similarity`, `features`, `ai-sort`, `tournament` | §5.2 |
| D4 | Existing features default on; fetch and compression default off | §5.2 |
| D5 | Face detection is removed: dims 54–56 zeroed at use, a `FEATURE_VERSION` bump, one retrain, no re-extraction | §5.3 |
| D6 | First-party modules ship with the app. Installing renderer-only modules from a file comes last (P7); no store, no downloads, no sandbox tier. The user's April note asked for install/uninstall (L255), so this is the call most worth checking | §6.4 |
| D7 | Module UI runs in the renderer as ES modules; outside programs run as supervised child processes; CLIP inference moves from main into a `utilityProcess` in P4a (D29) | §6.2 |
| D8 | Main never runs code discovered on disk (static adapter list) | §6.2 |
| D9 | Module toggles take effect on restart | §6.5 |
| D10 | Plain JavaScript, native ES modules, no framework, bundler or TypeScript; JSDoc types for the host API | §7, §3 |
| D11 | Existing per-folder file names, formats and settings keys are kept | §13 |
| D12 | Tools are installed by the user and detected, never bundled or auto-updated; executables are granted only through main's dialog | §8.4 |
| D13 | No secrets stored; cookies through the tools' own browser option or a user-picked file | §9 |
| D14 | Fetch uses gallery-dl + yt-dlp (provisional) into one flat Inbox folder; no Telegram, no embedded players **(U)** for "use existing tools like gallery-dl" | §12.5 |
| D15 | Compression is re-implemented in the app (main + cjxl/djxl), not driven through the PowerShell scripts | §12.6 |
| D16 | Compression swaps files in place, holding originals until "Finalize"; JPEG and PNG only; text-chunk PNGs skipped; each run opens with a measured preview of display time against space saved, because JPEG XL displays more slowly than JPEG and PNG | §12.6 |
| D17 | Compression runs on the open folder only | §12.6 |
| D18 | Similarity sort is the pilot module | §12.1 |
| D19 | The build order in §14 | §14 |
| D20 | The shell layout in §11.2: action bar, side panel, jobs tray, F1 tabs; style unchanged; dark theme only | §11.2 |
| D21 | Windows and Linux, from source, both tested at every phase exit **(U, 2026-10-22: the user may move to Linux, and others may use the public repo)**; macOS untested; packaging is an optional P8; no auto-update or code signing | §3, §4, §14, §15 |
| D22 | End-to-end tests keep their assertions and reach moved state through `window.mediaViewer.modules[<id>]` (`testApi`); element IDs are kept when markup moves | §7.13, G-3 |
| D23 | Every phase must show net renderer lines ≤ 0; a ratcheting blocking check is recommended to G5 | §11.1, §14 |
| D24 | v2's `CLAUDE.md` rules move to path-scoped `.claude/rules/<id>.md` files as code moves (BACKLOG L1033) | §14 |
| D25 | The JSDoc host types are documentation; the contract tests are the control; no `checkJs` in v2 | §7 |
| D26 | Compression's renames go through a main-written rename journal that modules replay; folder files declare `cache` or `data`; a folder switch stops a run at a batch boundary | §7.3, §8.6, §12.6 |
| D27 | The unified Sort ▾ menu lands in P6a; until then module controls render in a header slot with today's IDs | §7.7, §12.1 |
| D28 | The like-model learner fix (standardise, then converge) ships as its own task, A1, outside the module phases, gated by a real-data check the user agreed to **(U)** | §12.3, §14 |
| D29 | P4a moves CLIP inference into a `utilityProcess` and switches CLIP to its fp32 file with a `FEATURE_CACHE_VERSION` bump; the user accepted the switch **(U)**. DirectML on Windows; the CPU everywhere else | §12.2 |
| D30 | Group copies on DINOv2-small fp32 is a new `similarity` grouper (P4c), after the utility process | §12.1 |
| D31 | After P4a, the CLIP sorter becomes the default similarity sort; hash sorters stay selectable | §12.1 |
| D32 | SigLIP 2 and text search stay outside v2 until search is wanted; passive skips stay out of training | §12.3 |

---

## 18. Left to the builder

- The exact manifest JSON schema and validation messages.
- The host API's final names and argument shapes, within §7's groups and §7.12's rules.
- The exact tool flags, output templates and rule tables (with the downloader research).
- The DOM structure and CSS of the shell, within §11.2.
- The compression threshold, worker defaults and the free-space formula.
- Whether the side panel docks left or right (right in the sketch).
- Test file layout under `tests/modules/`.
- How `features` copies or re-downloads the CLIP model when its cache moves.

---

## 19. Follow-ups outside this spec

These are planning actions for the user's sessions, recorded here so they have a carrier.

1. **G5, the strategic refresh (still open from the Oct 19–23 week on 2026-10-25):**
   - replace the "v2.0 Modularization" release with v2 (this spec);
   - move the add-on theme from *Later* to *Now*/*Next* as v2's phases;
   - re-baseline GOALS Objective 2 to §11.1's target.
2. **BACKLOG intake (🔵, user-raised on 2026-10-22):**
   - a Fetch module entry (no home today; the nearest are L257 and L258);
   - a v2 shell-redesign entry, if it should be tracked apart from L223–L224;
   - an update to the compression entry L213: in-place swap, Windows and Linux, re-implemented.
   - Face-detection removal is Claude-surfaced: 🟤.
3. **Research reports:**
   - **The AI-sorting report is folded in** (§21).
   - **Its four 🟤 BACKLOG candidates are not filed.** They are the report's steps 1–4: learner, copies,
     utility process with fp32, SigLIP 2.
   - **Its open questions:**
     - **Answered by the user on 2026-10-22:** the fp32 switch (yes) and the real-data check (yes).
     - **Resolved: where the commit lives.** It was dropped from PR #87 before the merge (`f5ddfa3` does not
       contain it) and lives on `research/local-ai-sorting`, also on origin. Its own PR is still to come.
     - **Still the user's:** CC0 as public domain, and DINOv3's licence.
   - **Run the research harness on the user's own like/dislike folders** (agreed 2026-10-22), locally, before A1.
     **This repository is public.** Only overall numbers go into git: AUC values, label counts, timings. The
     file lists, per-file scores, embeddings and manifests made from the user's folders stay outside the repo
     (the session scratchpad, or `userData`) and are never committed. The research run committed its image lists
     and results only because they were public-domain photos. A file list that leaked into git could only be
     removed by rewriting history.
   - **When the downloader report lands**, amend §12.5 and D14 in a follow-up commit.
4. **Sibling repos:** REVIEW-QUEUE:137 asks whether `media_parser` and `media_compression` become propagation
   partners. Under this design they become references, not dependencies.
5. **For other users (G-8):**
   - `package.json` declares `"license": "MIT"`, but the repository has no LICENSE file, so its terms are not
     stated where people look. **Filed** as 🔵 BACKLOG [2026-10-22] "Add a LICENSE file (MIT, as `package.json`
     already declares)".
   - The README needs setup steps for Windows and Linux, including how to install the outside tools.

---

## 20. Sources

- **User notes:** BACKLOG.md L122, L148, L177, L213, L223–L224, L255–L261, L772–L773, L792.
- **Board:** ROADMAP.md:29–38, 61–80; GOALS.md:36–55, 62–76; `2026-07-12-g4-strategic-docs-refresh-design.md`
  (D1–D3, D8, :459).
- **Security:** `2026-10-10-g1-security-findings-fix-design.md`, `2026-10-18-g1-i1-page-load-confinement-design.md`
  (D1, D3, § 11); `ipc-guard.js`; `path-grants.js`; `app-protocol.js`:30–48; main.js:52–66, 92–119, 181–257,
  312–349, 467–525.
- **v2.0 pattern:** `2026-03-21-task-019-extract-fullscreen-module-design.md` § "Pattern Established for v2.0".
- **Invariants:** CLAUDE.md § Detected Patterns and § Active gotchas. Specs 10-06 (rating safety), 10-07
  (tournament render re-entry), 10-12 (like-or-skip), 10-16 (recent folders), 10-19 (hash sort off the renderer),
  10-21 (feature-cache wipe), 09-10 (ML training pipeline), 08-30 and 07-20 (tournament undo).
- **Code map at `bf5ec84`:** media-viewer.js clusters and line ranges as cited; `tests/media-viewer-utils.test.js`.
- **AI-sorting research:** `docs/research/2026-10-22-ai-sorting.md` and `prototypes/ai-sorting/`, commit
  `96d9b22` (branch `research/local-ai-sorting`): § 1 (learner), § 2 (skips), § 3 (similarity grouping), § 4
  (near-duplicates), § 5 (q8 files), § 8 (main-process stalls), Recommendation, Open questions.
- **Sibling projects:**
  - `media_parser` (`media_downloader.py`, `media_telegram_bot.py`, two commits, July 2025);
  - `media_compression` (`scripts/lib/MediaCompression.psm1`, `Convert-MediaToJxl.ps1`,
    `Remove-VerifiedOriginals.ps1`, `docs/superpowers/specs/2026-05-15-jxl-conversion-design.md`,
    `2026-08-27-cold-archive-design.md`).

---

## 21. Changes after the user's approval

The user approved the spec on 2026-10-22 ("Looks good") and handed over the AI-sorting research in the same
message. Folding that research in changed the following; everything else is as approved.

| Where | Change |
|---|---|
| §12.2, D29 | Inference moves into a `utilityProcess` in P4a (it was a late optional step), because CLIP calls measurably freeze the main process. CLIP switches from its q8 file to fp32, with a `FEATURE_CACHE_VERSION` bump and one background re-extraction, if the user accepts the download. The embeddings service becomes multi-model. DirectML optional. |
| §12.3, D28 | The like-model learner fix is the biggest win. It ships as its own task, A1, outside the module phases, gated by the user's real-data check. A note covers the badge offset that the training/scoring skew causes under standardisation. |
| §12.1, D30, D31 | New in P4c: Group copies on DINOv2-small fp32, and the CLIP sorter becomes the default once `features` is on. |
| §12.3, D32 | Confirmed: passive skips stay out of training. SigLIP 2 and text search stay outside v2. |
| §5.3, §13 | Face removal rides the fp32 re-extraction if that ships; zeroing at use is the fallback. |
| §14 | New rows A1 and P4c; P4a grows to ~12 SP; the total becomes ~117–122 SP. |
| §16 | Four new risks: re-extraction time, download and memory growth, synthetic research tastes, broken q8 files. |
| §19 | The research's unfiled BACKLOG candidates and its open questions for the user. |
| §12.2, §12.3, §16, §19, D28, D29 | The user's answers later on 2026-10-22: the fp32 switch accepted, with a note on other platforms (CPU everywhere, DirectML only on Windows); the real-data check agreed, as a follow-up before A1. |
| §15, §19 | Nothing from the user's folders enters this public repo; the real-data check commits overall numbers only. |
| §2, §4, §12.1, §14, §16, §19, D1 | 2026-10-25: G2 PR 2 merged (PR #87, `f5ddfa3`) without the research commit. The branch was rebased onto `main` `308d43c`, the references to that PR were updated, and the new graph-build BACKLOG entry was linked from §12.1. |
| G-8, §3, §4, §6.4, §8.4–§8.6, §12.6, §14, §15, §16, §19, D21 | Linux becomes a supported platform beside Windows, because the user may move to Linux and others may use the public repo: Linux test runs at every phase exit; per-platform tool hints, process-tree kill and trash; a Linux baseline in P1a (~10 SP); optional packaging as P8; a LICENSE file to consider. |
