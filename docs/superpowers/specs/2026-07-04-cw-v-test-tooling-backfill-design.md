# Group CW-V: Test & Tooling Backfill — Design Spec

**Date**: 2026-07-04
**Branch**: `tests/cw-v-test-tooling-backfill`
**Source**: WEEKLY.md (July 6–10 Cleanup Week), Group CW-V — 🟤 Auto-Generated, 4 SP
**Status**: Approved

## Goal

Close four accumulated non-tournament test/tooling gaps on one branch / one PR. Mirrors
Group CW-2 from the first Cleanup Week.

This is a **test-only** change: no production code in `media-viewer.js`, `scripts/check-secrets.js`,
`index.html`, etc. is modified. Item 2's only "code" edit is the `methodSource` helper, which lives
inside the test file `tests/media-viewer-utils.test.js`. **If a test reveals a real product bug, stop
and surface it** rather than changing product code under a backfill task.

## Constituent BACKLOG / WEEKLY entries consumed

- 🟤 2026-06-19 (PR1 closeout): E2E smoke for the sort-progress card.
- 🟤 2026-06-25 (P3): Harden or document `methodSource()` test-helper brace-counting.
- 🟤 2026-06-18 (PR #52): Generate `extractAddedLines` fixtures from real `git diff` output.
- 🟤 2026-03-23 (TASK-023): Add regression test for play/pause icon toggle (oldest actionable 🟤 test item).

Check off each individually at closeout.

## Verification gap to respect

The pre-commit hook (Husky) runs **unit tests only** — it does **not** run E2E. Items 1 and 4 are
E2E (Playwright + Electron), so `npm run test:e2e` must be run locally and its output pasted before
claiming done. This is the same "silently-broken E2E can land" gap that bit CW-T; Group CW-P is
separately adding an automated E2E gate.

---

## Item 1 — Sort-progress card E2E smoke (Hybrid) → **new** `tests/e2e/sort-progress.test.js`

**Approach**: Hybrid — real sort for the appear/remove smoke (transient captured deterministically,
not by a racy poll); direct-drive for the cancel-wiring assertion (no race).

**Code under test**:
- `updateSortProgress({phase, current, total})` — [media-viewer.js:1218](../../../media-viewer.js) — builds
  the `.notification-progress` card with `.progress-phase`, `.progress-track/.progress-fill`,
  `.progress-counts`, and a `.progress-cancel` button wired to `this.sortAbortController?.abort()`.
- `handleSortBySimilarity()` — [media-viewer.js:5266](../../../media-viewer.js) — creates
  `this.sortAbortController` and drives `updateSortProgress` through the sort phases.
- `clearProgressNotification()` — [media-viewer.js:1207](../../../media-viewer.js) — `.remove()`s the card
  + nulls the ref; called in the sort completion path ([:5556](../../../media-viewer.js)). **Confirmed**:
  the card is removed (not merely hidden), so `not.toBeAttached()` is a valid assertion.

**Test A — appears then is removed during a real sort**:
1. Launch app; `createTempFixtureDir([...pngs])`; `loadFolder(tmp)`.
2. In-page, install a `MutationObserver` on `document.body` (childList + subtree + `attributes`/`class`
   filter) that sets `window.__sawProgressCard = true` the instant `document.querySelector('.notification-progress')`
   is truthy. Install **before** triggering the sort (the card can appear and vanish in <100ms on tiny
   fixtures — a poll would miss it; the observer will not). The `attributes` filter also catches the case
   where an existing reused `progressNotification` node merely gains the `notification-progress` class.
3. `await page.evaluate(() => window.mediaViewer.handleSortBySimilarity())`. **Note**: `page.evaluate`
   awaits a returned promise, so this resolves only after the whole sort finishes — by which point the
   card has appeared (captured by the observer) and been removed. Default sort algorithm is `vptree`
   (perceptual hashing, no CLIP), so a tiny 3-file folder completes in well under the test timeout.
4. `expect(await page.evaluate(() => window.__sawProgressCard)).toBe(true)` — proves it appeared.
5. `await expect(page.locator('.notification-progress')).not.toBeAttached()` — proves removal
   (the sort's completion path called `clearProgressNotification()`).
   *(No `isLoading` wait — the sort tracks `isComputingHashes`, and awaiting the evaluate already
   guarantees completion.)*

**Test B — Cancel button aborts (deterministic, no race)**:
1. In-page: `window.mediaViewer.sortAbortController = new AbortController()`.
2. In-page: `window.mediaViewer.updateSortProgress({ phase: 'Sorting…', current: 1, total: 4 })` to
   render the card in a known determinate state.
3. Click `.notification-progress .progress-cancel` (use `{force:true}` if the media overlay intercepts).
4. `await expect.poll(() => page.evaluate(() => window.mediaViewer.sortAbortController.signal.aborted)).toBe(true)`.

---

## Item 2 — `methodSource()` hardening (Document + guard) → edit `tests/media-viewer-utils.test.js`

**Code under test**: `methodSource(methodName)` — [tests/media-viewer-utils.test.js:81](../../../tests/media-viewer-utils.test.js) —
naive brace-counter (counts every `{`/`}` regardless of whether it sits inside a string/template/regex
literal). Today it has exactly **one** caller: `methodSource('loadFolder')`
([:2281](../../../tests/media-viewer-utils.test.js)), whose body is all-balanced, so the naive count is
provably correct for it.

**Changes**:
1. **Doc-comment warning** on `methodSource`: state that it brace-counts naively (every `{`/`}`
   regardless of context) and that the guard skips comment contents + checks string/template spans,
   leaving an unbalanced brace inside a comment, a regex literal, or an escaped `\{` in a string among
   the unguarded residuals.
2. **Guard — one precise rule**: the naive counter only miscounts when a `{` or `}` sits **inside** a
   string/template literal *unbalanced within its own span* (a balanced literal like `` `${x}` `` or
   `"{}"` is harmless; `"{"` or `` `}` `` is not). After locating the body, scan it tracking
   string (`'…'`, `"…"`), template (`` `…` ``) spans; throw if any span's internal brace balance is
   nonzero or a span is left unterminated:
   `methodSource(<name>): unbalanced brace inside a string/template literal — naive brace-counting is unsafe; extend the extractor`.
   **Comments must be skipped.** `loadFolder` has a `//` comment containing `folder's` — a scanner that
   only tracked strings would read that apostrophe as a string open and false-throw. So the scanner also
   tracks and skips **line (`//`) and block (`/* */`) comments** (apostrophes/braces inside them ignored).
   **Accepted residuals remain** (non-exhaustive): an unbalanced brace inside a **comment** (the guard skips
   comment contents, but `methodSource`'s naive OUTER counter still counts those braces), one inside a
   **regex literal** (`/…/`, not tracked), and — obscurely — an escaped `\{` inside a string. None is hit by
   a product caller; the doc-warning covers them, and a test pins the comment-residual behavior. *(Discovered during implementation: comment-skipping is
   required, not optional — the original "strings only" guard false-threw on `loadFolder`; a follow-up
   review then caught the inaccurate "regex is the sole residual" claim.)*
3. **Testability seam**: give `methodSource` an optional second param `methodSource(methodName, src = source)`
   so a test can pass a **synthetic source string** through the exact same extraction+guard path. This is
   a test-file-only change (no `media-viewer.js` edit) and lets the guard be tested against a crafted
   dangerous body.

**New unit tests**:
- The existing real `methodSource('loadFolder')` extraction still succeeds (guard does not
  false-positive on real code).
- The guard **throws** when passed a synthetic `src` whose target method body carries an **unbalanced**
  brace inside a literal span (e.g. a method whose body contains `` const s = `oops}`; ``), via the new
  `src`-override param.
- A balanced-literal body (e.g. `` `${a}` ``) does **not** throw — pins the "balanced literal is
  harmless" boundary so the guard isn't over-eager.

---

## Item 3 — `extractAddedLines` real-git fixtures → edit `tests/check-secrets.test.js`

**Code under test**: `extractAddedLines(diffText)` — [scripts/check-secrets.js:43](../../../scripts/check-secrets.js) —
parses `git diff --cached --unified=0` into added lines. Current tests
([check-secrets.test.js:67](../../../tests/check-secrets.test.js)) feed **hand-authored** diff strings.

**Changes**:
- **Keep** the existing hand-authored cases (fast, no subprocess, primary coverage).
- **Add** a `describe('extractAddedLines — real git diff')` that drives real git in an OS-temp repo and
  asserts on true `git diff --cached --unified=0` output for the three backlog-named cases:
  1. **No-trailing-newline replacement** — the case that emits the `\ No newline at end of file` marker
     (guards the existing marker-handling logic against real git output, not just a synthetic string).
  2. **Multi-file** staged diff — added lines attributed to the correct file paths across `+++ b/...`
     boundaries.
  3. **Binary-then-text** — a staged binary file (`Binary files … differ`, `inBinary` skip) followed by a
     staged text file whose added lines are still collected.
- **Setup/teardown**: `git init` in a scratch dir under the OS temp root; configure
  `-c core.autocrlf=false -c user.email=… -c user.name=…` (Windows CRLF + missing-identity guards);
  `git add`; capture `git diff --cached --unified=0`. `afterEach` removes the temp repo, guarded
  (`if (tmpRepo)`) so a setup failure doesn't throw a second error in cleanup.
- **Optional planted-secret assertion**: stage a line containing a real-shape token (assembled by
  concatenation, never a literal) and assert `extractAddedLines` + `scanForSecrets` flag it at the right
  file/line from *real* diff output — mirroring the existing integration test but end-to-end through git.

---

## Item 4 — Play/pause icon toggle regression → **new** `tests/e2e/video-controls.test.js`

**Code under test**:
- `index.html` declares `<i data-lucide="pause" id="pauseIcon">` and
  `<i data-lucide="play" id="playIcon" style="display:none">` ([index.html:156-157](../../../index.html)).
- `this.playIcon` / `this.pauseIcon` DOM refs cached in the constructor
  ([media-viewer.js:257-258](../../../media-viewer.js)).
- `onPlay` / `onPause` video-event handlers flip the two icons' `style.display`
  ([media-viewer.js:3428-3440](../../../media-viewer.js)): playing ⇒ `pauseIcon` shown / `playIcon` hidden;
  paused ⇒ reverse. Handlers guard on `currentMedia.tagName === 'VIDEO' && !isBeingCleaned`.
- `togglePlayPause()` — [media-viewer.js:3549](../../../media-viewer.js).

**Why the backlog frames this as "Lucide API drift / DOM-ref bugs"**: a rename of the icon IDs (DOM-ref
drift) or a change to the `data-lucide` icon names (icon drift) would silently break the visible toggle.

**E2E-harness constraint (important)**: `launchApp()` stubs the Lucide CDN with a **no-op**
`createIcons` ([tests/e2e/helpers/electron-app.js:56-57](../../../tests/e2e/helpers/electron-app.js)), so
`<i data-lucide>` elements are **never** rendered into `<svg>` under E2E. The test therefore does **not**
assert on rendered SVG (impossible here); it asserts on the two `<i>` elements, their `data-lucide`
attributes, and their `display` swap — which is exactly what catches DOM-ref/ID/icon-name drift and the
`onPlay`/`onPause` handler logic. (Real Lucide `createIcons` rendering is out of E2E scope; the
`{root: element}` gotcha is documented in CLAUDE.md.)

**Test — play/pause swaps the icons**:
1. Load a folder containing `tiny.mp4`; navigate to it; wait until
   `currentMedia?.tagName === 'VIDEO' && !isVideoLoading`.
2. Assert DOM refs resolve: `mediaViewer.playIcon` and `mediaViewer.pauseIcon` are non-null, and
   `playIcon.getAttribute('data-lucide') === 'play'` / `pauseIcon` `=== 'pause'` (catches ID/icon-name drift).
3. Deterministically pause via `mediaViewer.currentMedia.pause()` (bypasses the autoplay-initial-state
   ambiguity); assert `pauseIcon`→`display: none`, `playIcon`→`display: block` (the `onPause` handler).
4. Play via `mediaViewer.currentMedia` `muted=true` then `.play()` (await the promise); assert
   `pauseIcon`→`display: block`, `playIcon`→`display: none` (the `onPlay` handler). Assertions use
   retrying `toHaveCSS` to absorb the async `play`/`pause` events.
5. Also exercise the button path once via `togglePlayPause()` and assert the swap, so the
   `#playPauseBtn` click handler is covered end-to-end.
6. **`play()` / autoplay handling** (there is no existing video-play E2E test to copy): drive the swap by
   toggling the real video element and let its native `play`/`pause` events fire the handlers. If Electron's
   autoplay policy rejects `.play()` in this context, mute the element first (`currentMedia.muted = true`)
   and retry; as a last-resort fallback, dispatch synthetic `play`/`pause` `Event`s on `currentMedia` — the
   handlers are wired to those events ([media-viewer.js:3447-3448](../../../media-viewer.js)), so the
   icon-swap assertion still exercises the real `onPlay`/`onPause` code. Pin the exact mechanism during impl
   after observing whether muted `.play()` resolves under the test harness.

> **Implemented deviations (recorded at final review):** (a) the test uses synthetic
> `dispatchEvent('play'/'pause')` as the *primary* mechanism (codec-independent), not real `.play()` — so the
> autoplay handling of steps 4 & 6 turned out to be moot. (b) Step 5 (`togglePlayPause()` button-path
> coverage) was **deliberately dropped**: routing through `togglePlayPause()` → `media.play()` reintroduces
> the codec/autoplay-policy flake the synthetic approach exists to avoid, and the regression target
> (`#playIcon`/`#pauseIcon` ID/icon-name drift + the `onPlay`/`onPause` display flip) is fully covered
> without it. (c) The Lucide `<svg>`-render assertion was dropped — impossible under the E2E no-op stub.

---

## Non-goals

- No changes to sort, video, or secret-scan **behavior** — only new/hardened tests.
- Not migrating the existing hand-authored `extractAddedLines` fixtures away (kept as primary coverage).
- Not building a full JS tokenizer for `methodSource` — YAGNI with a single caller; the guard is the
  safety net.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| E2E flakiness (transient card, async video events) | `MutationObserver` capture (not poll); `toHaveCSS`/`waitForFunction`/`expect.poll` retrying assertions; existing `afterEach` null-guards. |
| Real-git test is subprocess/OS-sensitive (Windows CRLF, missing git identity) | `-c core.autocrlf=false`, explicit `user.email`/`user.name`; keep pure-string tests as primary coverage; guarded temp-dir cleanup. |
| `methodSource` guard false-positives on the real `loadFolder` body | Narrow the heuristic to *unbalanced brace inside a literal span*; tune against the real body during impl before finalizing. |

## Test-file inventory

| File | Action | Item |
|------|--------|------|
| `tests/e2e/sort-progress.test.js` | new | 1 |
| `tests/media-viewer-utils.test.js` | edit (`methodSource` + tests) | 2 |
| `tests/check-secrets.test.js` | edit (add real-git `describe`) | 3 |
| `tests/e2e/video-controls.test.js` | new | 4 |
