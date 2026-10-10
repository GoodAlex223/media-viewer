# G1. High Security Findings Fix — Plan (public stub)

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G1 (🟤, 5 SP → ~6.5 SP); [TODO.md](../TODO.md) 🔴 [2026-10-08] "Fix the High security findings from the `claude-security` scan"; [BACKLOG.md](../BACKLOG.md) 🟤 `[2026-10-08] From: G4 trial batch` (three High stubs, one Medium, one Low)
**Created**: 2026-10-10
**Status**: In progress
**Branch**: `g1-security-findings-fix` (from `main` @ `d5fce61`)

> **Disclosure.** This repo is public and the findings are unfixed, so this plan stays at stub level: finding IDs, components, vulnerability classes. The design spec and the detailed implementation plan are kept **local** until merge, in the self-ignored scan report folder (user decision 2026-10-10). At the post-merge closeout the spec moves to `docs/superpowers/specs/` and is indexed in `docs/README.md`.

## Goal

Close the 2026-10-08 scan's three High findings (F1/F3, F4: renderer, CWE-79; F2: main-process file IPC, CWE-862), its Medium (F5: renderer, CWE-79) and its Low (F6/F7: tournament apply, CWE-22). Acceptance:

- each confirmed finding has a test that fails on `main` first
- `/claude-security` _Scan changes_ on the fix diff comes back clean for these sites (trial leg 2, started by the user)

## Approach

- The renderer builds the affected UI from DOM nodes instead of parsing HTML.
- The main process authorizes every path its file IPC acts on, against folders the user picked in its own dialog.
- Tournament-apply destinations are confined to the folder.
- Defense in depth: a Content-Security-Policy, a navigation lock, a sender-frame check on IPC, and a lint guard against interpolated HTML.
- Folders saved before the fix are re-confirmed once through the existing folder pickers.

**Route change (2026-10-10, user decision):** writing the detailed implementation plan in-session was stopped by the session's safety filter. Patches were drafted with `/claude-security` → suggest patches instead. It produced patches for F1, F4, F5, F6 and F7 and declined F2 and F3. F1 supersedes F4, F5 and F3, and F7 is chosen over its duplicate F6. F2 is built from the parts of the local plan that survived.

## Tasks

- [x] **A. Renderer sink set (F1/F3, F4, F5)** — `claude-security` patch F1, with its test probe made inert. `6cfe41f`
- [x] **B. Tournament-apply input check (F6/F7)** — `claude-security` patch F7. `2bae815`
- [x] **1. Folder grant store** (new main-process module, unit-tested). `23c0a69`
- [x] **2. IPC registration guard** (new main-process module, unit-tested). `43be8a9`
- [x] **3. E2E grant plumbing + RED tests** for the findings, committed under `test.fail` markers. `bffa77a`
- [x] **4. File IPC authorization (F2)** — `main.js`, `preload.js` (security review applies), renderer callers. `d5c9258`
- [x] **5. Tournament-apply confinement, completed (F6/F7)**, including a link check found by the patch review. `3bd95e7`
- [ ] **Remaining (to be planned):** saved-state validation, the remaining renderer sinks and the lint guard, the re-pick flow, CSP and the navigation lock, then verification (unit, E2E, user's _Scan changes_, deep review, manual real-folder session).

## Progress Log

- **2026-10-10** — Branch created. Design brainstormed and the spec approved section by section (kept local). Writing the detailed plan was interrupted after Task 5; the route changed to `claude-security` patch mode (above). Patch review: apply F1 and F7, skip F4, F5 and F6 as superseded, and build F2 from the local plan's Tasks 1–5.
- **2026-10-10** — Patches F1 and F7 applied, and Tasks 1–5 executed inline (TDD).
  - **Failing-first evidence:**
    - F1's unit tests fail 4/4 on the unfixed renderer.
    - Every finding-level E2E fails at its own assertion before its fix: checked on marker-stripped copies, or by reverting the fix.
    - A link-check E2E, added during Task 5, failed before the check existed.
  - **Results:** unit 998/998. Full E2E 107 passed / 4 skipped (the opt-in visual-evidence tests), with the IPC guard live.
  - **Known gap until the re-pick task lands:** like/dislike/special folders saved before this branch aren't granted. They work again after one re-pick through Settings → Browse.
  - **Closeout note:** removing the generic bridge passthrough closes two older BACKLOG entries about it.
  - **Next:** a fresh-context review of the branch so far.
- **2026-10-11** — The fresh-context review (range `d5fce61..3bd95e7`) returned **No**: 1 Critical, 4 Important, 7 Minor.
  - **Critical, held for the re-pick task:** the missing re-pick flow. It blocks merge; the re-pick task must refuse before any media teardown.
  - **The 4 Important findings,** all in the new authorization layer, are fixed in `80ee160`, each with a test that failed first.
  - **The Minor findings** are deferred to the closeout extract.
  - **After the fix pass:** unit 1006 passed, 1 skipped (a POSIX-only case). Full E2E 111 passed / 4 skipped.

## Key Discoveries

- Drag-and-drop folder loading has been dead since Electron 32: the renderer reads `File.path`, which Electron removed in favour of `webUtils.getPathForFile`. The installed version is 39.1.2. To be filed in BACKLOG 🟤 at closeout.

## Future Improvements

- Revive drag-and-drop folder loading through `webUtils.getPathForFile` in the preload, granting the dropped folder in main. Never trust a path the renderer supplies.
- A grant-store eviction policy and a "forget folder" action (relevant to WEEKLY G4, recently opened folders).
