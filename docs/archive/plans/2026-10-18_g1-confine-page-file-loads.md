# G1. Confine Page-Side File Loads to the Granted Folders — Plan (public stub)

**Task Reference**: [WEEKLY.md](../../planning/WEEKLY.md) § G1 (🟤, ~5 SP → ~7 SP at planning); TODO 🔴 [2026-10-11] "Confine page-side file loads to the granted folders (G1 residual I1)", now in [DONE.md](../../planning/DONE.md); origin: the [G1 security fix](2026-10-10_g1-security-findings-fix.md)'s closeout residual I1
**Spec**: [2026-10-18-g1-i1-page-load-confinement-design.md](../../superpowers/specs/2026-10-18-g1-i1-page-load-confinement-design.md), kept local until the merge and published at the closeout
**Created**: 2026-10-18
**Status**: Complete. Merged 2026-10-19 via PR #84 (merge `4548269`), after one PR review round. One user check remains, the first launch on the real profile (carried in [TODO.md](../../planning/TODO.md)).
**Branch**: `g1-confine-page-file-loads` (from `main` @ `c50c087`); deleted remote and local after the merge

> **Disclosure.** This plan stayed at stub level (component, class, severity) until the merge, because the repo is public and the residual was open. The design spec and the detailed implementation plan were kept **local** in the self-ignored scan report folder (WEEKLY ruling; G1 precedent). At the closeout the spec was published, and the execution rulings and deferred minors below were added. The detailed plan stays local.

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
- [x] **10. Verification:** done; PR #84, merged `4548269`.
  - unit, E2E and lint suites
  - manual real-folder session (user), on a **copy** of the user's profile (`MV_USER_DATA_DIR`), so the one-time settings move happens on the copy; the real profile's marker is checked absent afterwards
  - _Scan changes_ (user)
  - whole-branch review
  - PR with a stub-level body
- [x] **After the merge (closeout box, user):** the first launch on the real profile moves the settings the user has at that point. Check once that the folders, shortcuts and recent folders are current, then delete the profile copy. → **Carried to [TODO.md](../../planning/TODO.md) 🔴 at the closeout (2026-10-19); not yet run.** It is the user's step, and nothing else on this plan waits for it.

## Also on this branch

- **REVIEW-QUEUE § 5 `"onFailure": "block"` trial vehicle.** `.claude/settings.json` sets it on the preload guard hook's entry.
  - **Probe, 2026-10-18:** passed. With the field unset and the hook script missing, a harmless command ran (the control). With the field set, the same command was blocked. The script was then restored unchanged.
  - **Still open:** whether the field causes spurious blocks. That half is read out at G6.
  - **Evidence for G6 (closeout, 2026-10-19):** the session transcript holds only the probe's two hook events (the non-blocking control and the forced-failure block, 04:19 on 2026-10-18) and none after them through the closeout. Recorded in REVIEW-QUEUE § 5.

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
- **2026-10-19** — **Code review, round 1 (user, separate chat):** one issue, plausible and not reproduced by the reviewer; every claim in the description confirmed or accepted.
  - **Fixed:** a retry of the settings move, after a completed write whose completion record failed, wrote back any carried setting the user had removed in between. The write now leaves a mark on the new store, set last, and a retry that finds it writes nothing. A unit test and a fifth launch in the end-to-end settings-move test both failed on the old code first.
  - **Accepted, the reviewer's open trade-off:** a move that fails before its write leaves the session on an empty store; a setting set and then removed in that session comes back at the retry (Future Improvements).
  - **Nit:** the deferred-minors bullet below now names all six.
  - Fix commit `5b8393a`. Gates there: unit 1666 passed, 1 skipped; pre-push E2E 194 passed, 6 skipped.
- **2026-10-19** — **Merged** by the user's instruction: PR #84, merge `4548269` (15 commits; unit 1555 → 1666, E2E 163 → 194 passed). The branch was deleted remote and local.
  - **Closeout:** the spec was published to `docs/superpowers/specs/` with a post-implementation note. The G1 spec's residual I1 got a "closed by" note. This plan was archived with the rulings and deferred minors below. The improvements went to BACKLOG 🟤 [2026-10-19], and the real-profile check went to TODO 🔴.

## Execution Rulings (published after the merge)

Decisions taken during execution where the detailed plan was wrong or silent. Each is in the execution ledger with what it costs if wrong.

1. **Task 1, the page-side "media name, non-media link target" test passed on `main`.** Chromium's Windows `file:` loader serves a file symlink as 200 with an empty body. Kept as a branch guard; the class's RED test is the main-side read, which failed on `main`. _If wrong:_ one fewer RED-on-`main` data point; no coverage lost on the branch.
2. **Task 1, the plan's test code failed lint** (`no-shadow`, and `importScripts` undefined). Parameters were renamed, and the worker calls `self.importScripts`. _If wrong:_ nothing; same behaviour.
3. **Task 2:** the store tests reuse the file's module-level fixtures instead of the plan's shadowing local. _If wrong:_ nothing.
4. **Task 4, `READ_SCRIPT` enumerates through `localStorage.length` and `key(i)`.** The plan's `Object.keys(localStorage)` failed its own unit test against a Storage-shaped fake. The E2E settings-move test proves the new form in real Chromium. _If wrong:_ a one-line revert.
5. **Task 5, the media-URL source scan strips comments before matching:** it had matched prose in a comment. _If wrong:_ a `src` assignment written inside a comment-like line would escape the scan; none exist.
6. **Task 5:** `tests/video-release.test.js` also needed `globalThis.MediaUrl`. _If wrong:_ nothing.
7. **Task 8:** the video test seeds the dislike folder too, since ratings need both folders. _If wrong:_ nothing.
8. **Task 8, the video clip is ~43 MB, not "several MB".** The plan's ~550 KB clip still passed with range support forced off, because the player buffered it whole. _If wrong:_ about 0.5 s of encoding and 43 MB of temp disk per run.
9. **Final review, one comment in `main.js` was reworded** to say what the response-header CSP guarantees, instead of describing the gap it closes. _If wrong:_ one comment line.
10. **Final review, declined lines that stand as-is:**
    - the allowlist would serve an untracked top-level `.html`/`.css`/`.js` (all such files are tracked public source)
    - `'self'` covers `/@fs/` (media MIME types plus `nosniff`)
    - § 11's residuals, none made worse
    - media bytes pass through main's event loop (0.85 ms per request, measured)
    - hard links and lone-surrogate names (pre-existing)
    - linked `node_modules` return 404 (the spec's no-link rule)

    The move kinds' `toLowerCase()` and Electron's default permission handler became Future Improvements. _If wrong:_ each is a separate small follow-up.
11. **Task 10, the background per-commit review's check-then-read finding** is the spec's accepted § 11 race. It is present on `main` with the same split, and narrowed here: the media door reads the canonical target, and with egress closed a file read this way has no way off the machine. Two hardening follow-ups went to BACKLOG. I had first acknowledged it from its title only; a side-agent note caught that, and the ruling was made on the full text. _If wrong:_ a narrow, timing-dependent read of a non-media file into a page that can no longer send it anywhere.
12. **PR review round 1, the before-write case keeps the merge** (Future Improvements). _If wrong:_ a cleared folder or a reset shortcut map comes back once, after a rare double event.

## Deferred Minors (published after the merge)

From the final whole-branch review. None is a confinement break; all six went to BACKLOG 🟤 [2026-10-19].

1. The window's close is swallowed while `migrate.html` (or a failed `INDEX_URL`) shows, and `migrateStorage` has no timeout.
2. The first settings move leaves two `migrate.html` entries in the window's back history (no script runs there).
3. `lucide.min.js` ends with a `sourceMappingURL` and no map is vendored, so opening DevTools logs one refusal.
4. `MV_USER_DATA_DIR` goes to `app.setPath` unchecked: a relative or missing path breaks startup (dev only).
5. Stale prose: `security-csp-walk.test.js` says face-api loads "from file:"; the `ipc-guard.js` `pageId` comment says "A file: URL has no host" (a UNC URL has one; it still never matches); `CLAUDE.md`'s Data Flow and Imports lines don't mention the app scheme or `media-url.js`.
6. `tests/media-url.test.js`'s `ALLOWED_SRC` matches by variable name, so a raw path assigned through `url` or `fileUrl` would pass it.

## Key Discoveries

- **A small video can't test byte-range serving.** The player buffers a clip of a few hundred KB whole, so seeking works even with ranges ignored. The behaviour test uses a clip of tens of MB, and a mutation check proved it now fails without ranges.
- **Chromium keeps localStorage writes in memory for a few seconds.** A completion marker written straight after a write can outlive the data it records. An explicit storage flush comes first.
- **A test of existing code needs its own positive control.** The first probe for one of the controls passed with every control removed, so it was replaced by a check that a mutation can fail.

## Future Improvements

All extracted to [BACKLOG.md](../../planning/BACKLOG.md) 🟤 `[2026-10-19] From: G1 I1 closeout` at the closeout, except the permission handler, which already had an entry (annotated instead).

- **JXL decoder bytes:** now that the page is served from the app scheme, the decoder's wasm could load with a same-origin fetch instead of the IPC hop. At the least, the stated reason in CLAUDE.md and main.js should be reworded. (CLAUDE.md was reworded at the closeout; `main.js` still carries the old reason.)
- **A deny-by-default permission handler for the window** (geolocation and similar), as one more defense-in-depth layer.
- **Move kinds:** classify the extension with `asciiFold` rather than `toLowerCase()`, for consistency with the shared read rule. Harmless today.
- **Content-read hardening** in the folder-grant code, from the background per-commit review (ruling 11):
  - pass the canonical target the read rule returns to the content-read handlers (`read-file-buffer`, `probe-video`, the keyframe and CLIP reads), which today open the renderer's original string
  - make `canonicalize` refuse a dangling link leaf, which it now treats as a missing tail
- **Measure DNS prefetch and preconnect to a remote host** under the app scheme (spec § 11: mitigated but unmeasured).
- **Time video playback while main is busy** (CLIP extraction), now that media bytes go through main (PR review, considered and not raised).
- **Settings move, a failure before its write** (review round 1, accepted trade-off): the session starts on an empty store, so a setting the user sets and then removes there (a folder's clear button, the shortcut reset) comes back when the retry succeeds. Skipping the merge whenever the new store holds keys would drop every carried setting for a user who changed any one of them. Remedy if it bites: the four removal sites leave a tombstone instead of removing the key.
- **The deferred minor review findings** (listed above): window close during the settings move, the move's history entries, the icon library's source-map line, `MV_USER_DATA_DIR` validation, three stale comments, and the media-URL source test matching by variable name.
