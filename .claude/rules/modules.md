---
paths:
  - "modules/**"
  - "main/**"
  - "core/module-host.js"
  - "core/host-api.js"
  - "core/modules-panel.js"
  - "tests/e2e/fixtures/modules/**"
---

# Modules (v2)

Spec: [v2 modules](../../docs/superpowers/specs/2026-10-22-v2-modules-design.md). P1a built the host, plan [v2 P1a](../../docs/planning/plans/2026-11-11_v2-p1a-module-host.md), builder calls C1–C15.

- **M-1: main never requires a module's code.** It reads `module.json` as data. Lint bans a computed `require()`/`import()` in every main-process file (`DYNAMIC_LOAD_BAN`: block 1, 1c, and 1d for `main/**` and `modules/*/main/**`). `tests/module-boundary.test.js` scans the literal names; only `main/adapters/index.js` (a later phase) may name module code. Both have planted controls.
- **M-2: module code reaches the app only through `host`.** In `modules/*/ui/**` and `modules/*/workers/**`, lint bans `window`/`globalThis`/`self` `.mediaViewer`/`.electronAPI` and document-wide lookups (`querySelector*`, `getElementBy*`, `body`). `mv/module-imports` allows imports only of the module's own files and `core/host-api.js`, and refuses a computed `import()`. `tests/lint-guard.test.js` plants each.
- **Strict manifests (C6).** Unknown keys are refused. Keys whose meaning arrives later (`uses`, `provides`, `contributes`, `appData`, `workers`, `styles`, `jobs`, `tools`, `permissions`, `legacySettingsKeys`) must be absent or empty. A later phase widens `validateManifest` and its tests together. Folder-file names are lower-case ASCII (NTFS folds case), and today's five per-folder files are reserved for core (`CORE_RESERVED_FOLDER_FILES`) until the phase that moves each one.
- **Duplicates and cycles invalidate everything involved (C15)**: a duplicate id, a folder file two modules declare, or a dependency cycle. Nothing depends on read order.
- **A failed folder-file read is never `absent`.** Main's refusals give `unreadable` ("Not permitted"), and so do over the cap, a link, a folder, an IPC rejection and a reply of unknown shape. Treat `unreadable` as never read, and never save over it. Reads stop at `maxBytes + 1` bytes, and so does the recovery read.
- **Visits are checked at the call (C9).** A store call while its visit is live, including inside `onVisitEnd`, issues its IPC at once into that visit's folder. A call after the visit ends is refused with no IPC. A module freezes its state in `onVisitEnd`, synchronously. The quit waits for those calls (`deactivateAll`).
- **Activation.** One 5 s race covers import plus `activate`. A throw, a missing `activate` or the timeout makes the module `failed`, disposes its host and blocks its dependents. A late result is ignored.
- **Restart only through the close flow (C8).** The renderer sends `restart-app` only at the end of `_saveThenAllowClose(true)`. A Cancel on the leave prompt arms nothing, and a plain close during a restart's save turns the relaunch off. Main ignores `restart-app` once `isQuitting` is set.
- **The registry uses Node's JS realpath** (`promisify(fs.realpath)`), the one `app-protocol.js` compares module files against. The native one resolves a subst or mapped drive and would refuse every module file.
- **E2E.**
  - Every launch keeps `modules.json` in its own `MV_E2E_STATE_DIR`.
  - The fixture root `tests/e2e/fixtures/modules/` (`MODULE_FIXTURES_DIR`) is read only when `MV_E2E_MODULE_ROOT` is also set.
  - `launchApp({ stateDir, moduleRoot, modulesEnabled })`. An inherited value of either variable is dropped.
  - F1 opens only once a folder is open, so the tests open the overlay with `toggleHelp()`.
