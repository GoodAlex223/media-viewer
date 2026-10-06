# G1 Single-Mode Rating Safety — Design Spec

**Task Reference**: WEEKLY.md Oct 5–9 § G1 (🔵 🏆, 7 SP → **~8 SP**, see § 9) ← TODO 🔴 [2026-10-04] "Stop a held Like key from firing overlapping file moves in single mode", BACKLOG 🔵 [2026-10-04] "Add a special-folder hotkey to single mode" and "Fix the single-mode Like/Dislike tooltips that show old hotkeys"
**Created**: 2026-10-06
**Status**: Draft — awaiting user review
**Branch**: `g1-single-mode-rating-safety` (PR, per the week's branch/PR shape; G3 branches after this merges — both change `moveToSpecialFolder`)

---

## 1. Goal

Holding a rating key must never fire more than one file action, two file actions must never run at the
same time, and the reported blank-view / dead-controls end state must be explained by reproduction — or
bounded, with what is still unexplained said plainly. The two user requests that sit on the same code
land on the guarded path.

| #   | Item                                         | Files                                                                                                   | Source           |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | Held key → one action; one file op at a time | `media-viewer.js` (keydown dispatch, the five guarded methods, `nextMedia`/`previousMedia`, `forceVideoCleanup`), `tests/e2e/rating-safety.test.js` (new), unit tests | TODO 🔴 [2026-10-04] |
| 2   | Single-mode special-folder hotkey (`1`)      | `media-viewer.js` (`DEFAULT_SHORTCUTS`, `ACTION_LABELS`, `executeAction`), `tests/keyboard-shortcuts.test.js`, `tests/media-viewer-utils.test.js` | 🔵 [2026-10-04]  |
| 3   | Like/Dislike tooltips from the live binding  | `media-viewer.js` (`_specialShortcutSuffix` → `_shortcutSuffix`, `updateRatingButtonsState`, `addMediaOverlayControls`, `saveShortcut`, `resetShortcuts`), `index.html` | 🔵 [2026-10-04]  |

**Non-goals.**
- Tournament picks, draws and `handleTournamentUndo` stay unguarded — owned by G3 (render re-entry) and
  the 🟤 [2026-08-31] "Re-entrancy guard for the tournament handler family — BLOCKED on item 1". The
  only tournament surface this group touches is `moveToSpecialFolder`, because it is one function shared
  by all three modes.
- `#cancelBtn`'s `Undo last move (Ctrl+A)` title stays hardcoded (the brief names the eight like/dislike
  titles); filed as a residual (§ 10).
- No change to `isBeingCleaned`'s shape (a shared boolean across three cleanup paths); filed as a residual.
- No timeout on the in-flight flag (§ 10).
- No bulk "dislike the skipped files" action — 🔵 [2026-10-04], a follow-on that builds on this guard.

---

## 2. Findings that shaped the design

Every finding names its evidence. Line numbers are as read on 2026-10-06 (`main` @ `9705a6d`); re-locate
by symbol before editing.

**F1 — No key-repeat filter exists anywhere.** The keydown dispatcher (`media-viewer.js:~2262-2270`)
resolves the action through `shortcutReverseMap` and runs it when `!this.isLoading`; it never reads
`e.repeat`. The empty-state undo branch (`:~2180-2201`) doesn't either.

**F2 — No single-mode or compare move holds any flag across its awaits.** `handleLike`/`handleDislike`
(`:~4032-4042`) and `moveCurrentFile` (`:~1455`) check only `isLoading`; `moveCurrentFile` then awaits
optional feature extraction, `forceVideoCleanup()` + a fixed 500 ms wait for a video, `checkFolderExists`
and `moveFile`, setting neither `isLoading` nor `mediaNavigationInProgress`. `moveToSpecialFolder`
(`:~1565`) has the same shape. `moveComparePair` (`:~5345`) awaits feature extraction,
`cleanupCompareMedia` ×2 + 50 ms, then two `checkFolderExists`/`moveFile` rounds, also flagless — the
compare handlers' `mediaNavigationInProgress` check (`:~5314`) does not cover it. So at key-repeat rate
(~30/s) every repeat inside one move's await window starts another move, and each reads the same
`currentFile` (`:~1462`, read synchronously before the first await).

**F3 — `forceVideoCleanup` nulls `this.currentMedia` without checking what it is by then (leading
hypothesis for the end state; not yet reproduced).** `forceVideoCleanup` (`:~1773-1806`) captures
`video = this.currentMedia`, waits 100 ms, then runs `this.currentMedia = null` unconditionally. With a
video on screen and F2's overlap, the predicted sequence is:

1. Repeats at t≈0, 33, 66, 99 ms each start a move; each sees `currentMedia` still the video and runs its
   own `forceVideoCleanup`.
2. The first one's timer nulls `currentMedia` at t≈100; the repeat at t≈132 sees `null`, **skips** the
   500 ms video wait, moves the file at once and calls `showMedia()` → `showSingleMedia()` creates the
   next element and sets `isLoading = mediaNavigationInProgress = true`.
3. A **stale** `forceVideoCleanup` timer (started t≈66) fires after that element exists and nulls
   `this.currentMedia` — now the *new* element.
4. When the new element's `load` arrives, `setupImageHandlers`'s `onLoad` (`:~3580-3593`) requires
   `this.currentMedia` to be an `IMG` and sees `null`, so it does nothing. `isLoading` and
   `mediaNavigationInProgress` stay `true` for good, the element stays `display:none`, and every control
   gates on those flags → **blank view + dead controls**.
5. The other overlapping moves wake ~600 ms in and fail at `fs.rename` (`main.js:~248`) with `ENOENT`,
   each with its own `Failed to move file` toast → **the errors**.

Its predictions, which Phase 0 tests (§ 4): a video must be involved; the next element must finish loading
*after* a stale timer fires (true for multi-MB 4K wallpapers, perhaps not for 1×1 fixtures); images alone
give overlapping moves and `ENOENT` toasts but no stuck state.

**F4 — A Ctrl+A during a move's awaits runs concurrently and undoes the *previous* move.**
`handleCancel` (`:~4054-4064`) guards on `isLoading || mediaNavigationInProgress`, neither of which a
move sets (F2), and the in-flight move pushes its `moveHistory` entry only after `moveFile` resolves — so
the undo pops and reverses the entry beneath it.

**F5 — A quick Q-then-E in compare leaves phantom files.** Both calls read the same
`compareLeftFile`/`compareRightFile`. Call 1 moves left → like; call 2 moves right → like; call 1's
secondary move (right → dislike) then fails with `ENOENT` and throws before `removeFileFromList`; call 2's
secondary (left → dislike) fails the same way. Both files are gone from disk, both still sit in
`mediaFiles`, and two orphan `moveHistory` entries remain. The repeat filter cannot catch this — two
different keys.

**F6 — Tournament precedent (🟤 [2026-08-31], measured, not reasoned).** An `isLoading` mutex cannot
hold: render handlers clear it at first paint. A dedicated flag that drops the second action silently
lost a prompt Ctrl+A with no feedback. A serializing variant (`g2-serialization-wip`) still failed E2E
~1 run in 1.

**F7 — Playwright can produce real repeat events.** From the Playwright `Keyboard.down` reference
(`docs/src/api/class-keyboard.md`, via Context7, 2026-10-06): _"After the key is pressed once, subsequent
calls to `Keyboard.down` will have `repeat` set to true. To release the key, use `Keyboard.up`."_

**F8 — The single-mode like/dislike tooltips are wrong even with default bindings.**
`updateRatingButtonsState` (`:~443-473`) writes `'Like (Arrow Up)'` / `'Dislike (Arrow Down)'` (from
`dd2eaaf`, before configurable shortcuts); the real defaults are `Q`/`W`. The four compare titles there
and the two in `addMediaOverlayControls` (`:~3410`, `:~3420`) are right by default but lie after a remap.
`index.html:~196/~200`'s static titles ("Move to next folder (Q)") are overwritten at init.

---

## 3. Decisions

| #   | Decision | Rejected alternatives (and why) |
| --- | -------- | ------------------------------- |
| D1  | An undo pressed while a file op is in flight is **refused with a notice** (`info` toast: _"A move is still in progress — press Undo again in a moment"_). | **Defer** until the op and its render settle — needs a "render settled" signal the code lacks (the same missing piece the tournament guard is blocked on). **Drop silently** — F6's evidence. |
| D2  | Key auto-repeat is honoured **only for `next` / `previous`**; every other customizable action (like, dislike, special, bulk, tournament picks/draws, undo) fires once per physical press. | Filtering only the ratings — leaves held Ctrl+A walking back a streak of moves, one per render; undo moves files too. |
| D3  | **One shared guard** covers every file-acting entry point: `moveCurrentFile`, `moveToSpecialFolder`, `moveComparePair`, `applyBulkRating`, `handleCancel`. | Single-mode path only — leaves F5's phantom-file desync open; the guard is one primitive, so the extra coverage is cheap. |
| D4  | The guard is an **exclusive flag that refuses** (`_fileOpInFlight`), set synchronously before the first `await`, cleared in `finally`. | **Promise queue** — a queued rating lands on a file the user never saw (the bug again, slower); the tournament variant failed E2E. **`isLoading` across the move** — `showMedia()` itself returns early on `isLoading`, render handlers clear it at first paint, and it changes the flag's meaning for every other reader. |
| D5  | `forceVideoCleanup` nulls `this.currentMedia` **only if it is still the video it cleaned**. | Relying on the guard alone — the narrowing removes F3's mechanism itself, for any overlap the guard does not see. |
| D6  | Single mode's special action is **`Digit1`**, matching compare's `leftSpecial` and tournament's. No `loadShortcuts` version bump: `_mergeModeShortcuts` leaves it unbound (and warns once) if the user already holds `Digit1`. | — |
| D7  | `_specialShortcutSuffix` becomes **`_shortcutSuffix(mode, action)`** and feeds all eight like/dislike titles; `saveShortcut`/`resetShortcuts` refresh them. | Fixing only the two wrong literals — leaves the remap gap G3 declined, for the same one-line cost. |

---

## 4. Phase 0 — reproduction (before any fix)

A throwaway probe in the E2E harness; **not committed**. G2's log retention keeps the session log in
`%APPDATA%\Electron\logs\` (E2E launches `main.js` directly, so the app is named "Electron").

- **Drive**: one `keyboard.down('q')`, then ~20 more `down` calls ~33 ms apart (each with `repeat: true`,
  F7), then `keyboard.up('q')`; settle ~2 s.
- **Temporary instrumentation** (discriminates F3 from other mechanisms): a `logError` line when
  `forceVideoCleanup` nulls a `currentMedia` that is not its own `video` (`clobber`), and one when an
  image/video `load` handler ignores its event because `currentMedia` changed (`ignored-load`).
- **Two runs with different predictions**:
  - **(a) images only** — F3 predicts several files moved, a run of `ENOENT` toasts, **no** stuck state.
  - **(b) video on screen first** (`tiny.mp4`; it fails to load in the fixtures, but it is still a
    `<video>`, so `forceVideoCleanup` runs) — F3 predicts `clobber` → `ignored-load` → both flags stuck
    `true`, a hidden element, a dead Like button.
- **Recorded per run**: files in the like folder, `ENOENT` count, `isLoading`, `mediaNavigationInProgress`,
  count and visibility of `.media-display` elements, spinner state, whether a Like click still acts.
- **If (b) does not stick** because the fixture image loads before the stale timer fires, re-run with a
  large generated image (several MB, written into the temp dir) as the next file.
- **Outcomes**:
  - **Confirmed** — (b) sticks with a `clobber` line and (a) does not. Proceed.
  - **Refuted** — (a) sticks too, or (b) sticks without `clobber`. F3 is wrong or incomplete: **stop and
    report** before designing the fix further.
  - **Not reproduced** — record what *was* reproduced (overlap + `ENOENT`), and bound the end-state
    account to "mechanism traced, not reproduced", per WEEKLY's "or bound it".
- The result goes into § 11 of this spec before the fix lands. The committed regression E2Es (§ 6) are
  derived from this probe.

---

## 5. Design

### 5.1 The in-flight guard

- New constructor field: `this._fileOpInFlight = false`.
- Each guarded method checks it first. When clear, it sets it **synchronously before its first `await`**
  and clears it in a `finally`. The existing early returns that precede the set stay where they are.
- Guarded methods: `moveCurrentFile`, `moveToSpecialFolder`, `moveComparePair`, `applyBulkRating`,
  `handleCancel` (undo also moves files across awaits; a Like during an undo's `moveFile` would act on a
  list being mutated underneath it). Method names and signatures do not change. Whether the shape is an
  inline `try/finally` or a small runner is the plan's call, decided by what the existing
  `extractAsyncMethod` tests need.

| Arrives while a file op is in flight | Behaviour |
| ------------------------------------ | --------- |
| Like / dislike (single), compare pair rating, special, bulk | Refused quietly — it targets a file the user has not seen yet |
| Undo (key, `#cancelBtn`, compare undo, empty-state button) | Refused with D1's notice. The check runs **before** `handleCancel`'s "No moves to undo" branch, so a first-ever move in flight is not misreported |
| Next / previous / wheel navigation | Refused quietly — the check lives inside `nextMedia`/`previousMedia`; the move renders the next file anyway |

- **Handoff without a gap.** Each guarded method starts its render (`showMedia()` / `showTournamentPair()`)
  before its `finally` runs, and `showSingleMedia`/`showCompareMedia` set `isLoading` synchronously
  before their first `await`. So the existing `!isLoading` gates take over the instant the flag drops and
  hold until the next media paints. Unlike F6's tournament flag, the only follow-ups refused are a rating
  on an unseen file (intended) and an undo (now with a notice). **One known exception**:
  `showCompareMedia`'s `mediaFiles.length < 2` branch awaits `cleanupCompareMedia` before setting any
  flag. The guarded compare paths handle the `< 2` case themselves before rendering (`moveComparePair`'s
  TASK-022 branch, `moveToSpecialFolder`'s compare branch), so they should not reach it — the plan
  verifies that per call site rather than assuming it.
- **Placement for tournament.** The check sits inside `moveComparePair`, not in `handleLeftLike` and
  friends, whose tournament branch returns into `_tournamentPickFromSide` before reaching it — tournament
  picks are untouched. `handleTournamentSpecial` → `moveToSpecialFolder` is guarded (shared function);
  a refused call simply returns, and `handleTournamentSpecial` does nothing after it.
- A modal `showFolderCreationDialog` holds the flag while open — correct: the move is genuinely pending.

### 5.2 The key-repeat filter

- Module constant beside `DEFAULT_SHORTCUTS`: `const REPEATABLE_ACTIONS = new Set(['next', 'previous']);`
- The decision is a small pure method (e.g. `_isSuppressedRepeat(e, action)` → `e.repeat &&
  !REPEATABLE_ACTIONS.has(action)`) so it is unit-testable apart from the anonymous listener.
- Both keydown branches — main (`:~2262`) and empty-state (`:~2180`) — resolve the action, then
  `if (this._isSuppressedRepeat(e, action)) { e.preventDefault(); return; }`.
- The fixed utilities (Space, I, Z, X, Escape, F1) are unchanged.

### 5.3 `forceVideoCleanup` narrowing

`if (this.currentMedia === video) this.currentMedia = null;` replaces the unconditional null. The rest of
the method is unchanged. `isBeingCleaned` stays a shared boolean: the guard removes the overlap that made
it race, and a counter is filed as a residual (§ 10).

### 5.4 Single-mode special hotkey

- `DEFAULT_SHORTCUTS.single.special = 'Digit1'`; `ACTION_LABELS.special = 'Move to special folder'`. The
  F1 single grid renders the row from `shortcuts.single` with no further change.
- `executeAction` gains `special: () => { if (!this.isCompareMode && !this.isTournamentMode)
  this.moveToSpecialFolder(); }` — the mode check is the second line of defence, as for `leftSpecial`.
- Flip the **five** G3-pinned tests — the brief says four, but a re-count on 2026-10-06 found a fifth:
  `tests/keyboard-shortcuts.test.js` ~:88-92 (`single.special` undefined), **~:447-456** (the reverse
  map's `single['Digit1']` undefined — the one the brief missed), ~:580 (single does nothing for either
  special action), ~:731 (single suffix `''`), and `tests/media-viewer-utils.test.js` ~:6224-6226 (the
  bare single-mode button).
- `#specialBtn`'s title becomes "Move to special folder (1)" through the existing derivation.

### 5.5 Tooltips from the live binding

- Rename `_specialShortcutSuffix(mode, action)` → `_shortcutSuffix(mode, action)` (body unchanged:
  `' (<key>)'`, or `''` when unbound); update every call site and every test that names it.
- `updateRatingButtonsState`: single — `'Like' + this._shortcutSuffix('single', 'like')`, `'Dislike' +
  …('single', 'dislike')`; compare — `'Like Left' + …('compare', 'leftLike')`, `'Dislike Left'`,
  `'Like Right'`, `'Dislike Right'` likewise. The "Configure like/dislike folders" tooltip for the
  disabled state is unchanged.
- `addMediaOverlayControls`: the like/dislike titles read the same mode the special button already reads
  (`this.isTournamentMode ? 'tournament' : 'compare'`).
- Refresh: `saveShortcut` and `resetShortcuts` call `updateRatingButtonsState()` beside
  `updateSpecialButtonsState()`. The overlay bar is rebuilt per render, so it picks up a remap on the
  next pair (the existing special-button pattern).
- `index.html`: `#likeBtn`/`#dislikeBtn` static titles become plain "Like" / "Dislike", with a comment
  matching the special buttons' pre-JS-fallback note.

---

## 6. Testing

**E2E — new `tests/e2e/rating-safety.test.js`.** Each test must **fail against the current code** before
the fix (recorded in the plan; a RED test that passes is zero coverage).

1. **Held Like, images only** — `down('q')` + ~20 repeats → exactly 1 file in the like folder,
   `mediaFiles.length` down by exactly 1, no error toast.
2. **Held Like with a video on screen (end-state regression)** — after the hold and a settle:
   `isLoading === false`, `mediaNavigationInProgress === false`, exactly one visible `.media-display`, and
   a further discrete Like moves exactly one more file. If Phase 0 bounded rather than reproduced the end
   state, this test still guards the one-file outcome, and § 11 says what it cannot prove.
3. **Undo during an in-flight move** — like A; then, with video B on screen, press Q and at once Ctrl+A
   (the 500 ms video wait is the window) → D1's notice is shown, A stays in the like folder (not wrongly
   undone), B is moved, `moveHistory.length` is 2.
4. **Compare double-press** — Q then E at once → exactly one pair moved; no phantom in `mediaFiles`; the
   source folder's contents match `mediaFiles`.
5. **Held `Digit1` in single mode** — exactly one file in the special folder (hotkey + filter together).
6. **Held Next still repeats** — `down('s')` + repeats → `currentIndex` advances at least 2 (guards
   against over-filtering).

Fixtures via `createTempFixtureDir` (`tiny.mp4` where a video is needed; `afterEach` null guards per
CLAUDE.md). The `.media-container` overlay rule applies to any click.

**Unit (Vitest).**
- `_isSuppressedRepeat`: repeat × {next, previous, like, undo, special, bothGood, leftLike}.
- Per guarded method via `extractAsyncMethod`: a second call made while the first is parked on an
  `await` never reaches `moveFile`; the flag is cleared after a thrown error and after an early return
  inside the `try`; `handleCancel` shows D1's notice (and not "No moves to undo") while the flag is set.
- `nextMedia`/`previousMedia` do not move `currentIndex` while the flag is set.
- `forceVideoCleanup`: a `currentMedia` replaced during the 100 ms wait survives; its own video is nulled.
- Tooltips: default, remapped and unbound bindings for all eight titles; refresh from `saveShortcut` and
  `resetShortcuts`.
- Hotkey: the default, the reverse map, `executeAction('special')` acting only in single mode, a stored
  `Digit1` in single leaving `special` unbound with a collision recorded.
- The five flipped tests (§ 5.4).
- The `_specialShortcutSuffix` → `_shortcutSuffix` rename reaches the `extractMethod` sites in
  `tests/media-viewer-utils.test.js` (~:6048, ~:6194, ~:6213) and `tests/keyboard-shortcuts.test.js`.

---

## 7. Acceptance

- Phase 0's outcome (confirmed / refuted / bounded) is written into § 11 before the fix lands.
- Every new test is RED against the unfixed code, then GREEN.
- `npm test` and the full E2E suite green; tests 1–4 green **3 consecutive runs** (timing-sensitive).
- A `regression-checker` agent pass over the `media-viewer.js` diff, then a thorough (`high`) code review.
- § 8's docs corrected in the same branch; § 10's residuals carried as plan lines so closeout Extract
  files them to BACKLOG 🟤.
- Optional, not a gate: the user holds Q on the real folder.

---

## 8. Docs this change falsifies (correct in the same branch)

- `CLAUDE.md` § Git Insights, special-button tooltips gotcha: "how single mode's `#specialBtn` stays bare
  without a special case" and "The neighbouring like/dislike tooltips stay hardcoded … a deliberate,
  offered-and-declined scope boundary" — both become false.
- `CLAUDE.md` § Keyboard Shortcuts / any line saying single mode has no special binding; add the
  `REPEATABLE_ACTIONS` rule and the `_fileOpInFlight` guard where the move path and the async patterns are
  described.
- Code comments: `updateSpecialButtonsState` ("single has no special binding, so the suffix resolves to
  ''"), `_specialShortcutSuffix`'s header ("which is how single mode's tooltip stays bare"),
  `executeAction`'s `leftSpecial` comment ("Single mode has no binding"), `index.html:~185`'s special-title
  note (still true; extend to like/dislike).
- `CLAUDE.md` names `_specialShortcutSuffix` directly — rename it there too. The other hits (BACKLOG,
  WEEKLY, docs/README.md, the archived G3 plan) are historical records and stay as written.
- Per CLAUDE.md § Best Practices: grep the whole repo (tests and comments) for `_specialShortcutSuffix`
  and for prose describing the old behaviour, and re-read every comment attached to changed code.

---

## 9. Sizing and model

- **SP re-estimate: 7 → ~8.** D3 adds `moveComparePair`, `applyBulkRating` and `handleCancel` to the guard
  (+1); Phase 0 and D5 fit inside the original 4 for item 1.
- **Execution**: Opus · `medium` for Phase 0, the guard and the E2Es (timing-sensitive, edge cases);
  Sonnet · `medium` for the hotkey and tooltip steps the plan spells out; review thorough (`high`). This
  confirms WEEKLY's first guess (WORKFLOW.md § 1.0).
- **Overrun drop order** (WEEKLY Notes): the tooltip item goes first; the held-key fix is never dropped.

---

## 10. Known trade-offs and residuals

- **A hung IPC call holds the flag.** If `moveFile`/`checkFolderExists` never resolves, file actions stay
  refused instead of racing; D1's notice makes it visible. No timeout, because a slow network-drive move
  must still be allowed to finish. → 🟤 residual if it is ever observed.
- **`isBeingCleaned` is one boolean shared by `cleanupCurrentMedia`, `cleanupCompareMedia` and
  `forceVideoCleanup`.** Any overlap among them can reset it under another; a counter (or per-element
  token) is the robust shape. → 🟤 residual.
- **Tournament handlers vs an in-flight special move.** A pick or `handleTournamentUndo` during a guarded
  tournament special move still runs concurrently, as it does today — no regression, but no fix. → noted
  on the 🟤 BLOCKED guard entry.
- **`#cancelBtn`'s title is hardcoded `(Ctrl+A)`** and lies after a remap. → 🟤 residual (same
  `_shortcutSuffix` call).

---

## 11. Phase 0 result

Not yet run — it is the plan's first task, and nothing in § 5 is implemented until this section records
the outcome.
