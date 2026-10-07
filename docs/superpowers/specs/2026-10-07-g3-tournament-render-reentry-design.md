# G3 Tournament Render Re-entry — Design Spec

**Task Reference**: WEEKLY.md Oct 5–9 § G3 (🟤, 5 SP → **~6 SP**, see § 9) ← BACKLOG 🟤 [2026-08-31] "G2 Task 4 revert — E2E measurement", item 1 "Un-awaited re-entrant `showTournamentPair()` from inside `_buildTournamentSide`"
**Created**: 2026-10-07
**Status**: Design approved section by section in brainstorming (2026-10-07); awaiting written-spec review
**Branch**: `g3-tournament-render-reentry` (from `main` @ `149b95d`, after G1 merged)

---

## 1. Goal

A tournament pair render has **exactly one way to restart itself**. A media failure never starts a second
render beside the one in flight, and the pair on screen never drifts from the engine's current pair. That
is also the precondition the 🟤 [2026-08-31] "Re-entrancy guard for the tournament handler family —
BLOCKED on item 1" has waited on since the G2 Task 4 revert.

| #   | Item                                                       | Files                                                                                                   | Source                       |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | One render owner; every tournament failure path reports into it | `media-viewer.js` (`showTournamentPair`, `showTournamentPairFast`, `_buildTournamentSide`, `showCompareMedia`'s tournament branches, new `_renderTournamentPairOnce` / `_skipFailedTournamentFile`), `tests/e2e/tournament-mode.test.js`, `tests/media-viewer-utils.test.js` | 🟤 [2026-08-31] item 1       |
| 2   | `logError` string arguments stop logging as `undefined`    | `logger.js` (new `normalizeRendererLogEntry`), `main.js` (`log-renderer-error` handler), `tests/logger.test.js` | Found while exploring (§ 2 F5) — user-approved ride-along |
| 3   | `-1` capture-net bounded retry gets its unit test          | `tests/media-viewer-utils.test.js`                                                                      | 🟤 [2026-07-02] CW-T closeout — folded in (§ 3 D7) |

**Non-goals.**
- **Item 2 — the handler-family guard — is not built here.** A pick, draw or undo pressed *while* a render
  is in flight still runs, exactly as today, and can still score a pair the user has not seen yet (§ 2 F4).
  This group delivers the primitive that guard needs and rewrites its BACKLOG entry as unblocked (§ 8).
- No change to `isLoading` ownership on the fast path (🟤 [2026-07-02] "fast-path swap doesn't set
  `isLoading`" stays open, annotated).
- No change to compare mode outside `isTournamentMode` branches: `showCompareMedia`'s missing-file / JXL
  retry, its `onError` Remove toast and `removeFailedFile` behave as today in compare mode.
- No change to `undoUserAction()`'s prune-absorbing semantics (G2's decision); § 5.2 explains the one case
  where it re-surfaces a skipped file.
- No change to `preload.js` (the `logError` fix is receiver-side only).

---

## 2. Findings that shaped the design

Every finding names its evidence. Line numbers are as read on 2026-10-07 (`main` @ `149b95d`); re-locate by
symbol before editing.

**F1 — The WEEKLY acceptance check already passes on unfixed code.** The tournament E2E file
(`tests/e2e/tournament-mode.test.js`, 9 cases) went **5/5 green on `main`** (45/45; 32.8–49.3 s per run),
measured 2026-10-07. "Green over at least five consecutive runs" therefore cannot distinguish fixed from
unfixed code. It stays as the regression bar (§ 7), and § 6 adds tests that fail on `main`.

**F2 — The "third site" premise is wrong.** The BACKLOG entry names `moveToSpecialFolder`'s "un-awaited
render" as the third site. Its tournament render (`media-viewer.js:1767`) is `await this.showTournamentPair()`
and has been at every commit checked: `ae9588d` (2026-07-03), `21668ac`, `937084c`, `6305a7a`. Its real
exposure is overlapping a *detached* failure render, which the owner removes like any other overlap. It
needs no edit of its own.

**F3 — The ready repro mostly runs through a path the entry does not name.** `tests/e2e/fixtures/tiny.mp4`
is a **32-byte stub** (one `ftyp` box), so it fails to decode deterministically, not intermittently. Which
code catches the failure depends on where random seeding deals it:
- **First pair:** `showTournamentPairFast` has no wrappers yet, so it falls back to `showCompareMedia`
  (`:4945-4948`), whose `setupCompareVideoHandlers` `onError` (`:3621-3633`) shows "Failed to load video"
  with a **Remove** button and keeps the file. Remove → `removeFailedFile` (`:1278`) → `showMedia()` →
  `showCompareMedia()`, which renders `mediaFiles[currentIndex..+1]` — **not the engine's pair**.
  `showCompareMedia`'s missing-file and JXL branches do the same through `_retryCompareAfterRemoval`
  (`:3129`, `:3319`, `:3352`, `:3392`). Today's E2E session logs show this path: `Failed to load video:
  tiny.mp4` from the compare handler, never `Tournament media failed to load`.
- **Later pair:** `_buildTournamentSide`'s own `error` listener (`:5024-5033`) calls `removeFileFromList()`
  then an **un-awaited** `showTournamentPair()`, from a DOM callback outside any handler. Its JXL catch
  (`:4999-5004`) does `return this.showTournamentPair()`, which the outer `showTournamentPairFast`'s
  `Promise.all` (`:4973`) then awaits: a render nested inside itself.
- The `error` listener is attached **outside** the tracked `videoEventListeners*` list, so
  `cleanupCompareMedia` (`:5684`) never removes it; it survives teardown of its element.

**F4 — Picks read the engine, not the screen.** `_tournamentPickFromSide` (`:5387`) takes its winner and
loser from `engine.getCurrentPair()`. Any window in which the screen shows a different pair (F3's
first-pair retry, or a failure render that has pruned the engine but not yet painted) records a verdict on
a pair the user never saw. Apply then moves files into `_Tier-N` folders from those verdicts. The overlap
part of this is what the owner removes; the press-during-render part is item 2 (§ 1 non-goals).

**F5 — 54 renderer diagnostics have never reached the session log.** `main.js:991` destructures
`{ level, message, source }` from the payload, but 37 direct `window.electronAPI.logError(...)` calls in
`media-viewer.js` and `tournament.js` pass a **string**, as do 17 `this.logError(...)` calls in
`ml-training.js` routed through the wrapper at `media-viewer.js:216`. Only 3 calls use the object form.
Every string call logs `[ERROR] [renderer] undefined` — observed in an E2E session log on 2026-10-07
(`%APPDATA%\Electron\logs\`, since rotated out; any tournament run with `tiny.mp4` reproduces it). That includes "Tournament media failed
to load", the "Tournament divergence" capture-net log and G2's "restore permanently failed" line.

**F6 — Two overlapping render calls leave orphaned media elements (traced from code).** In
`showTournamentPairFast`, render A's image-side cleanup completes synchronously and nulls `leftMedia`.
A then awaits `Promise.all(cleanups)`, render B's cleanups find nothing to clean, and both builds then
insert. B's `insertBefore` + `this.leftMedia = media` orphan A's element in the wrapper. It is still
displayed by its own `onLoad` (`display = 'block'`) and never cleaned up. Result: **two `.media-display`
elements per wrapper**, even with PNG-only fixtures. A failure render overlapping a pick's render does
exactly this.

**F7 — `showCompareMedia` leaves detached wrapper references behind.** It removes the old wrappers
(`:3237-3244`) without nulling `leftMediaWrapper`/`rightMediaWrapper`, and its missing-file / JXL branches
return before creating new ones (`:3325`). Today the retry rebuilds them. Under an owner whose next pass
takes the fast path, `showTournamentPairFast`'s `!this.leftMediaWrapper` check (`:4945`) would pass on a
**detached** div and render into it: nothing visible.

**F8 — Auto-skip changes what `engine.history.length` counts in four existing tests.** Recording a skip as
a tracked `'prune'` puts an entry on `engine.history` whenever `tiny.mp4` is dealt. Four cases in
`tournament-mode.test.js` (lines 184/189, 238, 287/292) use `tiny.mp4` with random seeding and wait on the
raw `history.length` (`=== 1` after a pick, `=== 0` after an undo). With a prune below the pick,
`undoUserAction()` leaves the prune and `=== 0` is never reached. No other E2E file is affected: the other
tournament tests (`overlay-controls`, `visual-evidence`, `rating-safety`) use PNG-only fixtures.

**F9 — Several waits in `tournament-mode.test.js` don't synchronise on anything.** After a pick they wait
for `!isLoading`, but the fast path never *sets* `isLoading`, so the wait passes at once.

**F10 — The `-1` capture net is reachable, contrary to its comment.** `showTournamentPair` (`:4887`) says
it is "unreachable after reconcileWithFiles". It is reached whenever a failure has removed a file from
`mediaFiles` but not yet from the engine (today's listener does exactly that), and after an undo absorbs a
skip's prune (§ 5.2).

---

## 3. Decisions

| #  | Decision | Chosen | Rejected (why) |
| -- | -------- | ------ | -------------- |
| D1 | Scope | Item 1 at **every** tournament render-restart path, including `showCompareMedia`'s first-pair branches | Named sites only (F3: the most common `tiny.mp4` path would stay a second, different restart mechanism); item 1 + item 2 together (~8–10 SP, against the 2× scope stop) |
| D2 | Mechanism | **Single-flight, coalescing `showTournamentPair()`** (§ 5.1) | Generation token (renders still overlap inside their awaits; the check spreads over every await, including `showCompareMedia`'s; a superseded caller's await resolves before the screen is right, so item 2 has nothing to wait on); render-awaits-load (every pick waits for media load, needs a timeout, and a late video error still needs D2's path) |
| D3 | What a failed tournament file does | **Auto-skip in every pair**: one warning toast, removed from `mediaFiles` and the engine as a tracked `'prune'`, the engine's next pair renders; the file stays on disk and Apply never moves it | Ask-first (Remove button) everywhere: leaves a blank side the user can still pick, so it needs item 2 first |
| D4 | Rule for code inside a render | **May request a render, never await one** | Awaiting the owner from inside a pass awaits itself: a deadlock |
| D5 | A pass that throws | **Logged; the loop continues while dirty; the owner's promise never rejects** | Propagate (today a throw escapes into the handlers' bare `await` as an unhandled rejection; under the owner it would also drop a request queued behind it) |
| D6 | `logError` string payloads | **Normalise at the receiver** (`main.js` via a pure `logger.js` helper) | Fix ~54 call sites (churn, and the next string call regresses it); change `preload.js` (security-review path for no gain) |
| D7 | `-1` bounded-retry unit test (🟤 [2026-07-02]) | **Fold in** | Leave open: this group changes exactly that recursion, and a test that it calls `_renderTournamentPairOnce` and not the owner is what catches a self-deadlock |

---

## 4. Phase 0 — reproduction (before any fix)

Run on this branch before any product change; record command, output and verdict in the plan.

1. **Write E1–E3 (§ 6.1) and run them against unchanged code.** Each must fail, for the reason it names:
   E1 with two `.media-display` elements in a wrapper (F6); E2 with the Remove toast and `tiny.mp4` still in
   `engine.files` (F3); E3 with more than one render in flight and/or two elements in a wrapper.
2. **Prove the mechanism fires from the real trigger, not only the synthetic double call.** E3 uses the
   real `tiny.mp4` failure in a later pair. Its RED output must show the failure was caught by
   `_buildTournamentSide`'s listener and not by `showCompareMedia`'s handler. On unchanged code that
   listener is anonymous, so the evidence is its `Skipping missing file` toast plus a `removeFileFromList`
   call for `tiny.mp4` recorded by an in-page wrapper, and the absence of a `Failed to load video` toast.
   A RED E1 alone proves the mechanism, not that production reaches it.
3. **Write the `normalizeRendererLogEntry` unit tests** and confirm they fail (function absent).
4. If any test **passes** on unchanged code, stop and find out why before going on. A RED test that
   passes is zero coverage.

---

## 5. Design

### 5.1 The render owner

`showTournamentPair()` becomes the **only** way a tournament render starts. Its current body moves,
unchanged except for D7's recursion target, to `_renderTournamentPairOnce(_pruneDepth = 0)`.

```js
// The single owner of tournament pair rendering. Single-flight and coalescing: a call during a
// render marks it dirty and returns the running loop's promise; the loop re-renders the engine's
// CURRENT pair until nothing is dirty, so intermediate pairs are never painted. The promise
// resolves when the screen shows the engine's pair, and never rejects (D5).
// Code running INSIDE a render may call this, but must never await it (D4).
showTournamentPair() {
    this._tournamentRenderDirty = true;
    if (!this._tournamentRenderLoop) this._tournamentRenderLoop = this._runTournamentRenderLoop();
    return this._tournamentRenderLoop;
}

async _runTournamentRenderLoop() {
    // Yield once so _tournamentRenderLoop is assigned before the first pass runs any code; a
    // request made synchronously inside that pass then joins this loop instead of starting another.
    await null;
    try {
        while (this._tournamentRenderDirty) {
            this._tournamentRenderDirty = false;
            try {
                await this._renderTournamentPairOnce();
            } catch (err) {
                window.electronAPI.logError?.(`Tournament render failed: ${err?.message ?? err}`);
            }
        }
    } finally {
        // Same synchronous continuation as the last while-check: no request can land in between.
        this._tournamentRenderLoop = null;
    }
}
```

Properties, each pinned by a unit test (§ 6.2):
- **Coalescing:** N requests during a pass produce exactly one extra pass; every caller's promise resolves
  after it.
- **No lost tail request:** the final `while` check and the `finally` run in one synchronous continuation.
- **No second loop from inside the first pass** (the initial `await null`).
- **Exit mid-loop is safe:** `_renderTournamentPairOnce` keeps its early returns (not tournament mode,
  engine null, complete, no pair), so a pass after `exitTournamentMode`, `loadFolder` or Apply does
  nothing. The loop can reach the summary modal more than once: the plan verifies
  `showTournamentSummaryModal()` is re-runnable (it rebuilds its body and reassigns `onclick`s).
- **The `-1` net recursion** (`:4910`) calls `_renderTournamentPairOnce(_pruneDepth + 1)`, never the owner
  (D4, D7).

**Call sites stay as they are.** The handlers, `moveToSpecialFolder`, Start and resume keep
`await this.showTournamentPair()`; the await now means "the screen shows the engine's current pair",
including any pass a failure added meanwhile. `moveToSpecialFolder` holds `_fileOpInFlight` (G1) across
that await, so a cascade of failures lengthens the hold. That is bounded, because each pass a failure
causes removes a file.

**Primitive for item 2:** `_tournamentRenderLoop !== null` means "a render is in flight", and its promise
means "the screen is right". Nothing in this group consumes it.

### 5.2 The failure path — `_skipFailedTournamentFile(file, { side, media } = {})`

The **only** thing any tournament media failure calls. In order:

1. Return if `!this.isTournamentMode || !this.tournament.engine`.
2. If `media` is given and is no longer `side === 'left' ? this.leftMedia : this.rightMedia`, return: a
   late event from a torn-down element.
3. Return if the file has already left both `mediaFiles` and `engine.files` (idempotent).
4. `logError` the path and the failure kind.
5. One warning toast for every kind (missing, undecodable, JXL): `Skipping <name> — couldn't be loaded`.
   No test asserts today's three different texts (checked 2026-10-07).
6. `removeFileFromList(path)`, `updateFolderInfo()`, then `engine.removeFile(path, { trackUndo: true })`
   (kind `'prune'`, D3), then `_schedulePersist(baseFolderPath)`. The engine removal happens **before** the
   render request, so the next pass sees the new pair without falling into the `-1` net.
7. Clear `isLoading` / `mediaNavigationInProgress` and `hideLoadingSpinner()`. This matches what compare's
   `onError` does today in the same situation, so a failed first pair cannot leave the controls dead.
   (`handleTournamentUndo`'s special branch treats `isLoading` as advisory and relies on its identity
   re-check, so clearing it here adds no hazard that compare's handler does not already add.)
8. `this.showTournamentPair()` **without await** (D4): it marks the running loop dirty, or starts one.

A shared `_attachTournamentFailureListener(media, side, file)` registers
`() => this._skipFailedTournamentFile(file, { side, media })` on `error` **through the side's tracked
`videoEventListeners*` list**, so `cleanupCompareMedia` removes it with the others (F3).

**Undo after a skip.** If the skip is the newest stack entry, `undoUserAction()` absorbs its prune together
with the pick below it, restoring the skipped file to `engine.files` but not to `mediaFiles`. When it is
next dealt, the `-1` net prunes it again with its own toast. This is correct (the prune is what keeps undo
consistent) and stays; § 8 corrects the net's "unreachable" comment to name this case (F10).

### 5.3 The sites

- **`_buildTournamentSide`**
  - Its untracked `error` listener (`:5024-5033`) is replaced by `_attachTournamentFailureListener`.
  - Its JXL catch (`:4999-5004`) calls `_skipFailedTournamentFile(file)` and returns. No
    `return this.showTournamentPair()`: under the owner that is a self-await (D4).
- **`showTournamentPairFast`**
  - Its fallback condition becomes `!this.leftMediaWrapper?.isConnected || !this.rightMediaWrapper?.isConnected` (F7).
  - After the build, it returns before `updateCompareFileInfo`/`updateNavigationInfo` when
    `_tournamentRenderDirty` is set, because the next pass paints the right info.
- **`showCompareMedia`, `isTournamentMode` branches only** (it renders a tournament's first pair, and the
  first pair after any failure that leaves no wrappers):
  - Missing file (`:3302-3320`) and JXL catches (`:3342-3353`, `:3382-3393`): call
    `_skipFailedTournamentFile` for each failed file and return, instead of `_retryCompareAfterRemoval`.
  - Handler setup (`:3357`, `:3367`, `:3397`, `:3407`): `setupCompare*Handlers(..., { skipErrorHandler:
    this.isTournamentMode })`, then `_attachTournamentFailureListener` when in tournament mode. No Remove
    toast in tournament mode.
  - Its `< 2`-files branch (`:3194`) is unreachable from the owner: a pass reaches `showCompareMedia` only
    after finding both pair files in `mediaFiles`. Unchanged.
- **`moveToSpecialFolder`**: no edit (F2).

### 5.4 `logError` normalisation

`logger.js` gains a pure, exported `normalizeRendererLogEntry(data)`:
- a string → `{ level: 'error', message: data, source: 'renderer' }`;
- an object → its fields, with `level` defaulting to `'error'` (anything other than `'warn'` counts as
  `'error'`) and `source` to `'renderer'`; a non-string `message` is `String()`-ed;
- anything else (including `undefined` or an `Error`-shaped value) → `{ level: 'error', message:
  String(data?.message ?? data), source: 'renderer' }`.

The `main.js:991` handler calls it before choosing `logger.warn` or `logger.error`. `preload.js` and every
renderer call site are unchanged; both forms keep working.

---

## 6. Testing

### 6.1 E2E — `tests/e2e/tournament-mode.test.js`

**Deterministic placement.** Round 1 is dealt with the real AI seeding path: the test sets
`predictionScores` for the fixtures before entering tournament mode (which enables the modal's AI option,
`:4745-4751`), chooses AI seeding and clicks Start. `buildAiSeedingPairings` pairs best against worst, so
the scores fix the pairs with no method stubs. Each test first **asserts the resulting pair**, so a
seeding change fails loudly instead of silently testing something else.

**An owner-idle wait helper** (`waitForTournamentIdle(page)`: `_tournamentRenderLoop === null && !isLoading`)
replaces the vacuous `!isLoading` waits after picks and undos (F9), including inside `enterAndStartTournament`.

New cases, each RED on unchanged code (§ 4):
- **E1 — two overlapping render requests.** PNG-only fixtures; `Promise.all([mv.showTournamentPair(),
  mv.showTournamentPair()])`; then exactly one `.media-display` per wrapper, and the files on screen
  (`compareLeftFile`/`compareRightFile`) equal `engine.getCurrentPair()`.
- **E2 — an unreadable file in the first pair is auto-skipped.** `tiny.mp4` placed in the first pair; after
  idle: it is in neither `mediaFiles` nor `engine.files`, no Remove toast exists, the pair on screen equals
  the engine's, and each wrapper holds exactly one `.media-display`. This also covers F7.
- **E3 — an unreadable file in a later pair fails while a user action renders.** `tiny.mp4` placed in round 1's
  second pair. One pick advances to it. A capture-phase `error` listener on the media container issues a
  draw at the instant of failure, so the draw's render and the failure overlap through the real
  `_buildTournamentSide` listener. Asserts: an in-page counter wrapped around `showTournamentPairFast`
  (present before and after the fix, so the same assertion runs RED and GREEN) shows at most one in
  flight at any time; one element per wrapper; screen equals engine;
  `tiny.mp4` gone from both lists; exactly one skip toast. It does **not** assert the draw's outcome, which
  is item 2's concern (F4).

**Existing cases updated (F8).** The four `history.length` waits count **user** entries
(`history.filter((e) => (e.kind ?? 'pick') !== 'prune').length`), so a skip's prune cannot make them
seeding-dependent. The resume case's `history.length === 0` (`:272`) is unaffected: a resumed engine
starts empty.

### 6.2 Unit — `tests/media-viewer-utils.test.js` and `tests/logger.test.js`

Owner and helper, via `extractMethod` / `extractAsyncMethod` with a mock ctx (`_renderTournamentPairOnce`
stubbed as a controllable deferred):
- coalescing: three requests during one pass → exactly two passes total; all three promises resolve after
  the second;
- a request made from inside a pass (including synchronously, before the pass's first await) joins the
  loop: one extra pass, no second loop, and no hang (raced against a timeout so a deadlock fails instead of
  stalling the suite);
- a request during the final pass is not lost;
- a pass that throws: logged, the loop continues while dirty, the promise resolves (D5);
- `_skipFailedTournamentFile`: stale `media` ignored; second call for the same file a no-op;
  `engine.removeFile` called with `{ trackUndo: true }` before the render request; flags cleared; returns
  without awaiting the owner;
- `_renderTournamentPairOnce` `-1` path (D7): `getMediaIndex` always `-1` → terminates at
  `showTournamentSummaryModal()` within the `_pruneDepth` cap, recursing into `_renderTournamentPairOnce`,
  never the owner;
- `normalizeRendererLogEntry`: string, full object, partial object (`level`/`source` defaulted),
  `level: 'warn'` kept, `undefined`, `Error`-shaped value — none yields an `undefined` message.

The existing **CHARACTERIZATION** test ("a second undo DOES re-enter mid-render") must **still pass**: item
2 is untouched, and that test remains its tripwire. Every other existing tournament unit test must pass
unchanged, or the plan names why it changed.

---

## 7. Acceptance

1. E1–E3 and the new unit tests RED on unchanged code (§ 4), green after; RED and GREEN outputs in the plan.
2. `tests/e2e/tournament-mode.test.js` green over **at least five consecutive runs** after the fix. This is
   the WEEKLY's bar, kept as a regression bar and labelled honestly (F1: it also passed 5/5 on `main`).
3. Full E2E suite through the real pre-push gate (no `SKIP=e2e`, no `--no-verify`).
4. Full unit suite green; the count recorded with its delta.
5. A session log from an E2E run that hits a skip shows the skip line as text, not `undefined` (D6).

---

## 8. Docs this change falsifies (correct in the same branch)

- `media-viewer.js` comments: `showTournamentPair`'s "Capture net: unreachable after reconcileWithFiles"
  (`:4887`, F10); `_buildTournamentSide`'s header ("purged … and the engine pair re-rendered");
  `handleTournamentUndo`'s comment naming "the un-awaited re-entrant renders in `_buildTournamentSide`" as
  the blocker (`:5135-5137`) — re-word to say the render is now single-flight and the guard itself is
  what remains; `showTournamentPairFast`'s header (fallback condition).
- `tests/media-viewer-utils.test.js` comments that name the re-entrant render as live (`:3970`, `:5371`):
  re-read and update; the CHARACTERIZATION test's note keeps pointing at item 2.
- `CLAUDE.md`:
  - a gotcha: "`showTournamentPair()` is single-flight and coalescing; inside a render, request — never
    await; every tournament media failure goes through `_skipFailedTournamentFile`";
  - the Compare Mode Validation line (the bounded retry and single-mode fallback do not apply in tournament
    mode);
  - the Error Handling line (`logError` accepts a string or an object).
- BACKLOG, at closeout:
  - 🟤 [2026-08-31] item 1 → closed, with F1–F3's premise corrections;
  - 🟤 [2026-07-03] "fast-path re-entrancy … sibling JXL object URL" → closed by the owner;
  - 🟤 [2026-07-02] "fast-path swap doesn't set `isLoading`" → annotated;
  - 🟤 [2026-07-02] "`-1` bounded-retry has no direct unit test" → closed (D7);
  - 🟤 [2026-08-31] item 2 → rewritten as **unblocked**, naming § 5.1's primitive and a starting direction
    (G1's precedent: refuse a pick or draw while a render is in flight; undo with a notice, or queued
    behind the owner's promise), without building it.
- `g2-serialization-wip` (`b155374`, on `origin`): decided at closeout with evidence. The lean is
  **delete**: its `_acquireTournamentRender` is a second serialization mechanism over renders the owner
  already serializes, and its `_isForeignLoadInFlight()` changes a shipped guard. Deleting strikes its three
  doc pointers (BACKLOG item 2, the G2 spec's DEC-1 note, the archived G2 plan's Task 4 note) and keeps the
  measurement table. Deleting the `origin` branch is outward-facing: **ask the user before
  `git push --delete`**.
- `docs/README.md` indexes this spec; WEEKLY G3 status at closeout.

---

## 9. Sizing and model

**~6 SP** (5 as planned, plus the first-pair `showCompareMedia` path, the `logError` ride-along and the
folded `-1` test), inside the 2× stop rule. Model per WORKFLOW.md § 1.0: write the plan on Opus · `xhigh`
(lifecycle reasoning: the owner's tail and nested-request semantics); execute on Opus · `medium`, with
Sonnet · `medium` acceptable for the `logError` ride-along and the E2E history-count updates the plan
spells out; review deep (`max`), because this changes the render lifecycle of a mode whose Apply moves
files.

---

## 10. Known trade-offs and residuals

- **Input during a render still lands (item 2).** By design (§ 1). After this group the hazard has one
  cause, not two.
- **A caller can wait for a pass it did not ask for.** Bounded by state changes (each failure pass removes a
  file); accepted as the meaning of "the screen is right".
- **A skipped file re-surfaces after an undo absorbs its prune**, and the `-1` net re-prunes it with a toast
  (§ 5.2). Correct, slightly noisy; not changed here.
- **`isLoading` stays advisory in tournament mode** (🟤 [2026-07-02], annotated).
- **The one-tick stale file info** after an in-render JXL skip is removed by § 5.3's early return; any
  other transient between passes is bounded by one pass.
