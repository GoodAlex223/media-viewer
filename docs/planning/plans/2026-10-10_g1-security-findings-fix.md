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
- [x] **9. Re-pick flow** for like/dislike/special folders saved before the fix:
  - checked against main at startup, with one notice and a hint in the button tooltips
  - moves and the AI sort refused up front, before any media is torn down
  - re-confirmed through the existing Settings → Browse buttons
- [x] **6. Saved-state validation:**
  - A saved tournament that fails validation is treated as absent: a notice, then a fresh start.
  - Legacy saves still resume.
- [x] **7. Remaining renderer sinks + lint guard:**
  - The last UI built from HTML strings (one dialog, three internal-value sites) no longer parses any value.
  - A lint rule bans built strings reaching the HTML parser in renderer code.
  - A second lint rule bans IPC registration in the main process that bypasses the guard.
  - A test proves both rules fire.
- [x] **8. Content-Security-Policy, navigation lock, media-tool protocol pin:**
  - **Policy:** each directive was measured by an E2E walk of the main flows, which asserts zero violations and that each flow actually ran.
  - **Violation logging:** every violation reaches the session log.
  - **Navigation:** the window can't navigate away or open new windows.
  - **ffmpeg/ffprobe:** restricted to local files.
- [x] **Fresh whole-branch review:**
  - Verdict "with fixes": no Critical findings, one Important.
  - **Fix pass 2:** a test for the real grant site, the re-check race, and the residual note.
  - **Fix pass 3 (the user has both setups):** symlinked media keeps working, and a folder on an absent drive reads as unreachable, not as needing re-confirmation.
  - Each fix has a test that failed first.
- [x] **Commit security review (background):** two path-authorization findings on the newest commit.
  - Investigated by measurement. One was real and predates that commit: a case-handling mismatch in containment.
  - It's fixed at every site, with tests that failed first.
- [x] **User's _Scan changes_ (trial leg 2):**
  - It covered the branch through its first 15 commits: no findings, verified, run at `high` because `max` is retired.
  - The three later commits weren't covered.
  - A path-authorization issue found and fixed afterwards lay inside its range. That's recorded for the trial's evaluation.
- [ ] **Remaining:** a _Scan changes_ re-run covering the three later commits, the deep review, the manual real-folder session, then the PR.

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
- **2026-10-11** — Task 9 (re-pick flow) done. This closes the review's Critical finding and the known gap above.
  - **Failing-first evidence:**
    - 8 new E2E tests failed at their own assertions on the unfixed renderer.
    - The new unit tests failed first.
    - A mutation that moved the check after the media teardown made the two "nothing torn down" assertions fail.
  - **Beyond the spec:** saved folders are re-checked after each folder load, because a folder's grant also covers any saved folder inside it.
  - **Results:** unit 1021 passed, 1 skipped. Full E2E 119 passed / 4 skipped.
- **2026-10-11** — Task 6 (saved-state validation) done.
  - **Failing-first evidence:**
    - The new unit tests failed first.
    - A validator that accepts everything makes every reject case fail.
  - **Property test:** every state reached in seeded random tournaments validates.
  - **Compatibility:** the version-1 save format was checked against the last commit that wrote it.
  - **Results:** unit 1071 passed, 1 skipped. Tournament and security E2E 36/36.
  - **Cache trace (spec):** the three per-folder caches were followed from read to every consumer.
    - No HTML or path exposure.
    - One cache's values are now checked at load. A malformed entry is recomputed (test failed first).
    - Two defense-in-depth residuals go to the closeout extract.
- **2026-10-11** — Task 7 (remaining sinks + lint guard) done.
  - **Failing-first evidence:** the lint test failed on every case it must flag, while its allow cases passed.
  - **Conversion:** ESLint then flagged exactly the remaining sites, and 0 after the conversion.
  - **Results:** unit 1149 passed, 1 skipped. Full E2E 118 passed, 4 skipped, 1 known flake (an existing tournament test passed 8/8 on repeat; filed for the extract).
- **2026-10-11** — Task 8 (CSP, navigation lock, media-tool pin) done.
  - **Failing-first evidence:** each new test failed first.
  - **Policy measurement:** directives were removed one at a time and the walk caught each one that mattered. Two directives the draft carried proved unnecessary and were dropped.
  - **Remaining markers:** none of the RED-until-fixed markers remain.

## Key Discoveries

- Drag-and-drop folder loading has been dead since Electron 32: the renderer reads `File.path`, which Electron removed in favour of `webUtils.getPathForFile`. The installed version is 39.1.2. To be filed in BACKLOG 🟤 at closeout.

## Future Improvements

- Revive drag-and-drop folder loading through `webUtils.getPathForFile` in the preload, granting the dropped folder in main. Never trust a path the renderer supplies.
- A grant-store eviction policy and a "forget folder" action (relevant to WEEKLY G4, recently opened folders).

## Residuals (extract to BACKLOG 🟤 at closeout)

Recorded 2026-10-11 from the whole-branch review and the task ledger. Details are in the local spec § 10/§ 12 and the ledger; they go public after merge.

- **Page-side file loads are not yet confined to granted folders** (review I1, Important; not a regression). Closing this needs a protocol-level design. **User decision 2026-10-11:** a follow-up task before G4 builds on the grant model. The design must also decide the symlinked-media question for page-side loads (see the M-a fix).
- The lint guard should gain three more HTML-parsing APIs (review M-e). None is used today.
- CSP violations raised in the page head before the renderer loads aren't logged in production (review M-f). The walk catches them in tests.
- Deny device permission requests by default (review, declined-to-judge). Measure clipboard use first.
- Per-folder cache reads have no size cap (cache trace).
- The move handler should get the spec's one-line containment re-check on the joined target, as defense in depth (review M-g). It's redundant today: the file-name check already refuses separators and dot segments.
- Flaky tests: the secret-scan test's 5 s timeout under load; the tournament undo E2E when the undecodable test video lands in the first pair.
