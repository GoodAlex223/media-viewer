# G1. Confine Page-Side File Loads to the Granted Folders — Plan (public stub)

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G1 (🟤, ~5 SP → ~7 SP at planning); [TODO.md](../TODO.md) 🔴 [2026-10-11] "Confine page-side file loads to the granted folders (G1 residual I1)"; origin: the [G1 security fix](../../archive/plans/2026-10-10_g1-security-findings-fix.md)'s closeout residual I1
**Created**: 2026-10-18
**Status**: Planned. The design is approved; the user chooses the execution method.
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

- [ ] **1. RED end-to-end tests** for the page-load classes, committed under `test.fail` markers.
- [ ] **2. One media-read rule** shared by main's file IPC and the page (main process, unit-tested).
- [ ] **3. App scheme handler** (new main-process module, unit-tested).
- [ ] **4. One-time settings migration** (new main-process module, unit-tested).
- [ ] **5. Serve the window from the app scheme:** main process, the IPC sender check, the navigation lock, and renderer media URLs.
- [ ] **6. Policy header; vendored icons.**
- [ ] **7. Renderer network restrictions.**
- [ ] **8. Behaviour tests:** video seeking, encoded folder names, reload, settings migration.
- [ ] **9. Architecture notes,** at stub level until merge.
- [ ] **10. Verification:**
  - unit, E2E and lint suites
  - manual real-folder session (user)
  - _Scan changes_ (user)
  - whole-branch review
  - PR with a stub-level body

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

## Key Discoveries

_Filled in during execution._

## Future Improvements

_At least two, by closeout._
