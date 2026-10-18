# G1. Confine Page-Side File Loads to the Granted Folders — Plan (public stub)

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G1 (🟤, ~5 SP → ~7 SP at planning); [TODO.md](../TODO.md) 🔴 [2026-10-11] "Confine page-side file loads to the granted folders (G1 residual I1)"; origin: the [G1 security fix](../../archive/plans/2026-10-10_g1-security-findings-fix.md)'s closeout residual I1
**Created**: 2026-10-18
**Status**: In review. The PR is open; the user's deep code review runs in a separate chat.
**Branch**: `g1-confine-page-file-loads` (from `main` @ `c50c087`)

> **Disclosure.** This repo is public and the residual is open, so this plan stays at stub level: component, class, severity. The design spec and the detailed implementation plan are kept **local** until merge, in the self-ignored scan report folder (WEEKLY ruling; G1 precedent). At the post-merge closeout the spec moves to `docs/superpowers/specs/` and is indexed in `docs/README.md`.

## Goal

Close residual I1 of the G1 security fix: page-side file loads in the renderer are not confined to the granted folders (access control; Important; not a regression). Acceptance, from WEEKLY:

- each confined load class has a test that fails on `main` first
- the E2E CSP walk (`tests/e2e/security-csp-walk.test.js`) stays green
- video seeking still works
- existing settings survive the change
- `/claude-security` _Scan changes_ on the branch diff comes back clean for these sites (a clean pass, not a clearance)

## Approach

- **Origin:** the window is served from the app's own scheme instead of `file://`.
- **What the page may load:** only the app's own files, and media from granted folders under the same read rule main's file IPC uses.
- **Policy:** the Content-Security-Policy becomes a response header.
- **Icons:** the icon library is vendored.
- **Defense in depth:** renderer network restrictions.
- **Settings:** a one-time migration carries existing settings to the new origin.

## Tasks

- [x] **1. RED end-to-end tests** for the page-load classes, committed under `test.fail` markers.
- [x] **2. One media-read rule** shared by main's file IPC and the page (main process, unit-tested).
- [x] **3. App scheme handler** (new main-process module, unit-tested).
- [x] **4. One-time settings migration** (new main-process module, unit-tested).
- [x] **5. Serve the window from the app scheme:** main process, the IPC sender check, the navigation lock, and renderer media URLs.
- [x] **6. Policy header; vendored icons.**
- [x] **7. Renderer network restrictions.**
- [x] **8. Behaviour tests:** video seeking, encoded folder names, reload, settings migration.
- [x] **9. Architecture notes,** at stub level until merge.
- [ ] **10. Verification:**
  - unit, E2E and lint suites
  - manual real-folder session (user), on a **copy** of the user's profile (`MV_USER_DATA_DIR`), so the one-time settings move happens on the copy; the real profile's marker is checked absent afterwards
  - _Scan changes_ (user)
  - whole-branch review
  - PR with a stub-level body
- [ ] **After the merge (closeout box, user):** the first launch on the real profile moves the settings the user has at that point. Check once that the folders, shortcuts and recent folders are current, then delete the profile copy.

## Also on this branch

- **REVIEW-QUEUE § 5 `"onFailure": "block"` trial vehicle.** `.claude/settings.json` sets it on the preload guard hook's entry.
  - **Probe, 2026-10-18:** passed. With the field unset and the hook script missing, a harmless command ran (the control). With the field set, the same command was blocked. The script was then restored unchanged.
  - **Still open:** whether the field causes spurious blocks. That half is read out at G6.

## Progress Log

- **2026-10-18** — Branch created from `main` @ `c50c087`.
  - The `onFailure` trial probe ran at session start and passed (above).
  - The design was brainstormed with a measured spike and approved section by section (spec kept local).
  - The detailed implementation plan was written (local).
  - **Estimate:** ~7 SP against ~5 planned. That's inside the 2× abort line, and the WEEKLY drop order absorbs it.
  - **Amendment (side-agent note, user-approved):** the pre-merge manual session runs on a copy of the profile.
    - **Why:** on the real profile, the one-time settings move would happen at test time. Builds run afterwards on older branches keep writing only the old store, so the merged version would show test-time settings.
    - **Effect:** the real profile moves at its first launch after the merge.
  - **Execution started (Native).**
    - **Task 1:** the RED end-to-end suite is committed. Every RED test was shown failing on the unfixed code first, with the outcomes recorded locally. One test is kept as a guard instead of a RED test, for a platform reason recorded locally; its rule keeps a RED test on the main-process side.
    - **Task 2:** one media-read rule, now shared by main's file IPC; it also checks the file a path resolves to. Its RED tests failed first and pass now.
    - **Task 3:** the app scheme handler module and its unit tests. A mutation check showed its two key controls are each caught by a test.
    - **Task 4:** the one-time settings migration module and its static page, unit-tested. One small change from the detailed plan, which the end-to-end migration test in Task 8 checks.
    - **Task 5:** the window is served from the app scheme. The IPC sender check, the navigation lock and the renderer's media URLs moved with it, and the old file-URL helper was deleted. The read tests from Task 1 now pass.
    - **Task 6:** the content policy is now a response header, and the icon library is vendored. Its hash was checked against the release's published integrity value before commit, and again on the committed bytes.
    - **Task 7:** the renderer network restrictions are in. Every RED test from Task 1 now passes with its marker removed, and the main-process network control still passes.
    - **Task 8:** behaviour tests for video seeking, encoded folder names, reload and the settings migration. A mutation check showed each can fail. The video test needed a much larger clip: a small one passed even with seeking support removed.
    - **Task 9:** CLAUDE.md and ARCHITECTURE.md describe the app scheme at stub level. The CLAUDE.md size warning fired: +1334 bytes, now 223 lines / 59,916 bytes (recorded for the size audit).
    - **Task 10, so far:** unit, E2E and lint suites are green. A fresh whole-branch review found no confinement break and two Important findings, both fixed with tests that failed first:
      - the one-time settings move now makes sure the settings are on disk before it records completion
      - two defense-in-depth controls gained tests that fail when the control is removed

      Six minor findings are deferred (listed locally; they reach BACKLOG at closeout).
    - **Manual session (user), on the profile copy:** the copy holds the marker and the real profile does not. The session log shows no cancelled requests and no settings-move warnings; its only refusals are the deferred source-map minor.
      - Video folders displayed, apart from a type the app has never supported.
      - Animated images, linked media inside a granted folder and the DevTools shortcut couldn't be checked by hand, so each now has an end-to-end test that a mutation check showed can fail.
    - **Task 10, verification done:**
      - In the manual session, the user confirmed the settings came across (the copy's marker counts 11 keys, all written) and that compare, tournament and AI sort behaved normally.
      - The user's _Scan changes_ came back with no findings. That is a clean pass, not a clearance.
      - The branch was pushed and the PR opened with a stub-level body. The deep code review runs in a separate chat.

## Key Discoveries

- **A small video can't test byte-range serving.** The player buffers a clip of a few hundred KB whole, so seeking works even with ranges ignored. The behaviour test uses a clip of tens of MB, and a mutation check proved it now fails without ranges.
- **Chromium keeps localStorage writes in memory for a few seconds.** A completion marker written straight after a write can outlive the data it records. An explicit storage flush comes first.
- **A test of existing code needs its own positive control.** The first probe for one of the controls passed with every control removed, so it was replaced by a check that a mutation can fail.

## Future Improvements

- **JXL decoder bytes:** now that the page is served from the app scheme, the decoder's wasm could load with a same-origin fetch instead of the IPC hop. At the least, the stated reason in CLAUDE.md and main.js should be reworded.
- **A deny-by-default permission handler for the window** (geolocation and similar), as one more defense-in-depth layer.
- **Move kinds:** classify the extension with `asciiFold` rather than `toLowerCase()`, for consistency with the shared read rule. Harmless today.
- **Content-read hardening** in the folder-grant code: two narrowing steps from a background review finding (pre-existing, accepted residual class; detail local until merge).
- **The deferred minor review findings**, listed in the local plan: window close during the settings move, the move's history entries, the icon library's source-map line, `MV_USER_DATA_DIR` validation, and three stale comments.
