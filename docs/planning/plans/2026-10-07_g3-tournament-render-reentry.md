# G3. Tournament Render Re-entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G3 (🟤, 5 SP → ~6 SP); BACKLOG 🟤 [2026-08-31] "G2 Task 4 revert — E2E measurement", item 1 "Un-awaited re-entrant `showTournamentPair()` from inside `_buildTournamentSide`"; folds in 🟤 [2026-07-02] "`showTournamentPair` −1 bounded-retry branch has no direct unit test"
**Spec**: [2026-10-07-g3-tournament-render-reentry-design.md](../../superpowers/specs/2026-10-07-g3-tournament-render-reentry-design.md) (committed `bdada4c`, user-approved 2026-10-07)
**Created**: 2026-10-07
**Status**: Implemented — Tasks 1–4 + final-review fix pass committed; awaiting push / PR
**Last Updated**: 2026-10-07
**Branch**: `g3-tournament-render-reentry` (from `main` @ `149b95d`)

**Goal:** A tournament pair render has exactly one way to restart itself: `showTournamentPair()` becomes a single-flight, coalescing owner, and every tournament media failure — first pair included — auto-skips through one helper that requests a render and never runs one.

**Architecture:** `showTournamentPair()` keeps its name and every caller, but now only marks the render dirty and returns the running loop's promise; `_runTournamentRenderLoop()` runs `_renderTournamentPairOnce()` (the old body) until nothing is dirty. `_skipFailedTournamentFile()` drops a failed file from `mediaFiles` and the engine (tracked `'prune'`), toasts once, clears the load flags and requests the next pass; `_buildTournamentSide` and `showCompareMedia`'s tournament branches call only that. A receiver-side `logger.normalizeRendererLogEntry()` stops 54 string `logError` calls from logging as `undefined`.

**Tech Stack:** Electron 39 renderer (`media-viewer.js`, ES module, no bundler), Node main process (`main.js`, `logger.js`, CommonJS), Vitest 4 (node environment, extract-method tests), Playwright 1.58 + Electron E2E (`tests/e2e/`), Prettier 3, ESLint 9 flat config.

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. The `PostToolUse` hook formats every edited JS file; lint-staged formats staged files at commit. `docs/` and `*.md` are Prettier-ignored. Code blocks below are pre-format; let Prettier wrap long lines.
- **ESLint**: `eqeqeq`, `curly`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; prefix unused with `_`).
- **Vitest runs in the node environment.** Methods are tested via `extractMethod(name)` (matches `    name(params) {`, non-async) or `extractAsyncMethod(name)` (matches `    async name(params) {`), which turn source text into a `Function` invoked with `.call(ctx)`. After Task 3, **`showTournamentPair` is NOT async** (use `extractMethod`); `_runTournamentRenderLoop` and `_renderTournamentPairOnce` are async. Extract **inside each `it`** in new tests, so a missing method fails that test, not the whole 900-test file at collection time. The mock ctx must supply every `this.*` the method touches; `window`/`document` are absent unless a test sets `globalThis.window` / `globalThis.document` (restore in `afterEach`).
- **D4 — never await the owner from inside a render pass.** Code reachable from `_renderTournamentPairOnce` (`showTournamentPairFast`, `_buildTournamentSide`, `showCompareMedia`, `_skipFailedTournamentFile`) may call `this.showTournamentPair()` but must not `await` or `return` it: the pass would wait on the loop it belongs to.
- **Exact strings** (spec § 5):
  - Skip toast: `` `Skipping ${file.name} — couldn't be loaded` ``, type `'warning'` (an em dash, U+2014).
  - Skip log (string form, on purpose — Acceptance 5 proves the normaliser with it): `` `Tournament file skipped (${reason}): ${file.path}` ``, `reason` ∈ `'load' | 'missing' | 'decode'`.
  - Failed-pass log: `` `Tournament render failed: ${err?.message ?? err}` ``.
  - Empty log payload: `'(empty renderer log entry)'`.
- **New instance fields** (constructor): `this._tournamentRenderLoop = null;` `this._tournamentRenderDirty = false;`.
- **Every new test must fail against the code it guards before the fix lands** — record the failure in the Progress Log. A RED test that passes is zero coverage: find out why before continuing. Tests that pass on unfixed code by construction are labelled where they appear.
- **RED E2E tests are committed with Playwright's `test.fail(true, '…')`** (Task 1), which runs the test and requires it to fail ("Expected to fail, but passed." otherwise — Playwright 1.58 docs, `class-test.md` / reporter `base.ts`). The task that fixes a test deletes its marker line. This keeps every commit's suite green and makes a fix that lands with its marker still present fail loudly.
- **E2E**: `workers: 1`; `afterEach` null guards (`if (page)`, `if (electronApp)`, `if (tmpFixtures)`); the `.media-container` overlay blocks pointer events — use `page.evaluate`, `page.keyboard`, or `{ force: true }`. The new instrumentation wraps **instance** methods at runtime only (`mv.showTournamentPairFast = …`); `media-viewer.js` stays untouched by tests.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Never `--no-verify`, never `SKIP=` for a real failure. Pre-push runs the full E2E suite for any non-docs push.
- **Grep rule (CLAUDE.md § Best Practices)**: when changing behaviour a comment describes, grep code, tests **and comments** for the symbol, and re-read every comment attached to changed code.
- **Commit trailer**: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An undecodable JXL in a later pair** — the in-render failure site (`_buildTournamentSide`'s JXL catch, which today nests a render inside itself); none of the spec's E1–E3 reaches it. Expected: skipped with one toast, no `File missing` follow-up, one render in flight, the engine's next pair on screen. Pinned in Task 4 (E2E `G3 E4`).
2. **Both files of the first pair missing from disk** (two failures in one pass, through `showCompareMedia`'s `checkFileExists` branch). Expected: both skipped, one toast each, the engine's next pair renders — never `mediaFiles[currentIndex..+1]`. Pinned in Task 4 (E2E `G3 E5`).
3. **Skips leave fewer than two files.** Expected: the tournament summary, still in tournament mode, `isLoading` cleared so its buttons work — not a blank side, not an exit to single mode. Pinned in Task 4 (E2E `G3 E6`).
4. **Undo right after a skip** (the newest stack entry is the skip's prune, a pick below it). Expected: the pick is undone and its pair shown; the skipped file is back in the engine but not in `mediaFiles` (spec § 5.2) and is re-pruned when next dealt; the screen always matches the engine. Pinned in Task 4 (E2E `G3 E7`).
5. **A failure that arrives after the pair moved on, or after leaving tournament mode** (a torn-down element; `isTournamentMode` false; engine null after a folder switch or Apply). Expected: silently ignored — no toast, no list mutation, no render request. Pinned in Task 4 (unit: stale media, not-tournament, engine null).

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `media-viewer.js` | Modify | Constructor fields (T3); `showTournamentPair` owner + `_runTournamentRenderLoop` + `_renderTournamentPairOnce` (T3); `_buildTournamentSide` JXL catch request-not-await (T3) → helper (T4); `_skipFailedTournamentFile` + `_attachTournamentFailureListener` (T4); `showTournamentPairFast` `isConnected` fallback + dirty early return (T4); `showCompareMedia` tournament branches (T4); comments named in spec § 8 (T3, T4) |
| `logger.js` | Modify | `normalizeRendererLogEntry` (pure, exported) (T2) |
| `main.js` | Modify | `log-renderer-error` handler normalises its payload (T2) |
| `tests/logger.test.js` | Modify | `normalizeRendererLogEntry` cases + `main.js` wiring check (T2) |
| `tests/media-viewer-utils.test.js` | Modify | Owner tests + `-1` net test (T3); skip-helper + attach tests (T4); two stale comments (T3) |
| `tests/e2e/tournament-mode.test.js` | Modify | Helpers (`waitForTournamentIdle`, `instrumentRender`, `setSeedScores`, `screenState`, `expectScreenMatchesEngine`, `failureMessages`), `enterAndStartTournament` AI-seeding option, idle waits, E1–E3 RED (T1); E1 marker removed (T3); E2/E3 markers removed, E4–E7, `waitForUserHistory` + four history-count waits (T4) |
| `CLAUDE.md` | Modify | `logger.js` line + Error Handling line (T2); line 152 owner sentence (T3); line 152 skip clause, line 163 Compare Mode Validation, line 200 tracked removals (T4) |
| `docs/superpowers/specs/2026-10-07-g3-tournament-render-reentry-design.md` | Modify | Status line (plan commit); § 11 Phase 0 result (T1) |
| `docs/planning/plans/README.md` | Modify | Current Plans row (plan commit; removed at closeout) |

**Live-surface preflight** (plans README step 4) — every live surface asserting a claim G3 changes, diffed against the table above: CLAUDE.md L34 (`logger.js` exports), L130 (`logError` forwarding), L152 (per-pair render; structural-mutation writes list), L163 (Compare Mode Validation: bounded retry → single mode), L200 (tracked removals) ✅ T2–T4; `media-viewer.js` comments at `showTournamentPair` (capture net "unreachable"), `_buildTournamentSide` header, `showTournamentPairFast` header, `handleTournamentUndo` (`:5090-5099` advisory note, `:5132-5139` blocker note) ✅ T3/T4; `tests/media-viewer-utils.test.js` `:3969-3972` and `:5370-5373` (name the re-entrant render as live) ✅ T3. **Checked, no claim to change**: README.md, PROJECT.md, `docs/ARCHITECTURE.md`, `.claude/agents/regression-checker.md` (none names the render path or `logError`'s payload); `tests/media-viewer-utils.test.js` `:5191-5194` and `:6166-6170` (still true); `tournament.js` (never calls `showTournamentPair`). **Not changed, deliberately**: BACKLOG / WEEKLY / DONE / archived plans and specs naming the old behaviour as history — entries are closed or annotated at closeout, not rewritten.

---

## Premise Corrections Made at Planning

1. **Task 3 cannot leave `_buildTournamentSide`'s JXL catch for Task 4.** It does `return this.showTournamentPair()`, which `showTournamentPairFast`'s `Promise.all` awaits. Once `showTournamentPair` is the owner, that is a pass awaiting its own loop: an undecodable JXL in a later pair would **deadlock** the render. Task 3 turns it into a request (`this.showTournamentPair(); return;`); Task 4 replaces it with the helper.
2. **The spec's E3 trigger ("a capture-phase `error` listener issues a draw at the instant of failure") would test the wrong thing on fixed code.** A capture listener on an ancestor runs *before* the app's listener on the element, and microtasks run between them: the draw's render would tear the element down (removing the now-tracked failure listener) and the failure would be ignored as stale — correct behaviour, but not the overlap under test. The listener schedules the draw with `setTimeout(…, 0)` instead, which lands it while the failure's own render is in flight. Same overlap on pre-G3 code (the detached render sits in a 100 ms video cleanup).
3. **Spec § 4.2's "`removeFileFromList` call recorded by an in-page wrapper" is replaced by the toast list.** `'Skipping missing file'` is emitted from exactly one place, `_buildTournamentSide`'s error listener (`media-viewer.js:5028`, `grep -c` = 1), so E3's printed `failureMessages` on pre-G3 code is the evidence that the real trigger fired, with less instrumentation.
4. **The E2E idle wait tests `!mv._tournamentRenderLoop`, not `=== null`** — the field does not exist before Task 3, and RED runs must fail on assertions, not hang to a timeout (a timeout does not count as the failure `test.fail` expects).
5. **`main.js:991` destructures its argument, so `logError()` / `logError(null)` throws a TypeError in the main process's IPC handler** — the normaliser also removes that crash (spec F5 named only the `undefined` text).
6. **Spec § 4.3 (the normaliser's RED) is Task 2's own RED step**, not a separate Phase 0 step: the change touches no renderer code, so its order relative to Phase 0 does not matter.
7. **CLAUDE.md is 216 lines, over its own ~200 soft cap** (BACKLOG 🟤 [2026-07-04], open). The owner rule goes into line 152's existing "Per-pair render…" sentence, not a new bullet (spec § 8 said "a gotcha"; this is that gotcha's shape).
8. **Review Focus adds four E2E cases (E4–E7) beyond the spec's E1–E3**, and the skip helper gains `updateFolderInfo()` (the toolbar count) beside spec § 5.2 step 6.
9. **Verified unaffected:** every existing handler unit test mocks `showTournamentPair` (`tests/media-viewer-utils.test.js` `:3913`, `:5058`, `:5354`, `:5382`); the `<2-files fallback` tests (`:4079-4129`) execute only `showCompareMedia`'s first branch; `showTournamentSummaryModal()` is re-runnable (it rebuilds its body, reassigns its `onclick`s and sets `display`), so a loop reaching it twice is harmless; background extraction never calls `removeFileFromList`.

## Task Ordering

Task 1 (Phase 0) runs first, against unchanged code, and gates everything: a RED test that passes, or fails for a reason other than the one it names, stops the plan for a report. Task 2 is independent (main process only). Task 3 introduces the owner and must precede Task 4, whose failure path relies on it. One commit per task.

**Model and effort** (WORKFLOW.md § 1.0): SP 5 → ~6 (spec § 9) · execution mode: **user to choose** (recommendation at the end of this plan) · execute on **Opus 5.5 · `medium`** — switch now (`/effort medium`); Task 2 and Task 4's E2E history-count edits are Sonnet-eligible spelled-out work, but a model switch drops the cache in a one-session run, so stay on Opus · escalate to `high` for Task 1's interpretation and for any RED test that unexpectedly passes · final review **deep (`/code-review max`)** plus a `regression-checker` pass (spec § 9).

---

## Task 1: Phase 0 — RED E2E tests against unchanged code (spec § 4)

**Files:**
- Modify: `tests/e2e/tournament-mode.test.js`
- Modify: `docs/superpowers/specs/2026-10-07-g3-tournament-render-reentry-design.md` (append § 11)

**Interfaces:**
- Consumes: `launchApp`, `closeApp`, `loadFolder`, `createTempFixtureDir`, `waitForMedia` (`tests/e2e/helpers/electron-app.js`); the renderer's `window.mediaViewer`.
- Produces (module-local to the test file, used by Tasks 3–4): `waitForTournamentIdle(page)`, `instrumentRender(page)` (sets `window.__fast = { inFlight, max, calls }`, `window.__msgs: string[]`, `window.__tinyFailed: boolean`), `setSeedScores(page, scoresByName) → Promise<string[][]>` (round-1 pairs as basenames), `screenState(page) → Promise<{ shown, srcs, engine, leftCount, rightCount, engineFiles, mediaFiles, fastMax, msgs }>`, `expectScreenMatchesEngine(s)`, `failureMessages(s) → string[]`, `SKIP_TINY`, and `enterAndStartTournament(page, { rounds, aiSeeding = false })`.

- [x] **Step 1: Confirm the tree holds no product change**

Run: `git status --short && git log --oneline -3`
Expected: empty status; HEAD is the plan commit on top of `bdada4c`. `git diff 149b95d -- media-viewer.js main.js logger.js` prints nothing — Phase 0 measures the shipped code.

- [x] **Step 2: Add the helpers and the AI-seeding option**

In `tests/e2e/tournament-mode.test.js`, replace the whole `enterAndStartTournament` function (lines 6–31) with the block below, which adds the helpers above it:

```js
/** The skip toast G3's failure path shows for the tiny.mp4 fixture (a 32-byte stub that never decodes). */
const SKIP_TINY = "Skipping tiny.mp4 — couldn't be loaded";

/**
 * The tournament render is idle: no render loop (G3's owner — absent before G3, hence the falsy
 * test rather than `=== null`, so pre-G3 runs fail on their assertions instead of timing out), no
 * load in flight, and — when instrumentRender() ran — no showTournamentPairFast call executing.
 */
async function waitForTournamentIdle(page) {
    await page.waitForFunction(() => {
        const mv = window.mediaViewer;
        const fast = window.__fast;
        return !mv._tournamentRenderLoop && !mv.isLoading && (!fast || fast.inFlight === 0);
    });
}

/**
 * Runtime-only instrumentation (media-viewer.js is untouched): count concurrent
 * showTournamentPairFast executions, record every toast (showError routes through
 * showNotification), and flag the moment tiny.mp4's media element fails. Call before Start.
 */
async function instrumentRender(page) {
    await page.evaluate(() => {
        const mv = window.mediaViewer;
        window.__fast = { inFlight: 0, max: 0, calls: 0 };
        const fast = mv.showTournamentPairFast.bind(mv);
        mv.showTournamentPairFast = async (...args) => {
            const s = window.__fast;
            s.calls += 1;
            s.inFlight += 1;
            s.max = Math.max(s.max, s.inFlight);
            try {
                return await fast(...args);
            } finally {
                s.inFlight -= 1;
            }
        };
        window.__msgs = [];
        const notify = mv.showNotification.bind(mv);
        mv.showNotification = (message, ...rest) => {
            window.__msgs.push(String(message));
            return notify(message, ...rest);
        };
        window.__tinyFailed = false;
        document.addEventListener(
            'error',
            (e) => {
                if (String(e.target?.src ?? '').includes('tiny.mp4')) window.__tinyFailed = true;
            },
            true
        );
    });
}

/**
 * Give each fixture a prediction score so AI seeding (best vs worst) deals round 1
 * deterministically. Returns the round-1 pairs that seeding will produce (basenames), so the test
 * asserts the placement before relying on it. Call before entering tournament mode: the config
 * modal enables its AI option only when predictionScores holds 2+ entries.
 */
async function setSeedScores(page, scoresByName) {
    return page.evaluate((scores) => {
        const mv = window.mediaViewer;
        for (const f of mv.mediaFiles) {
            if (f.name in scores) mv.predictionScores.set(f.path, scores[f.name]);
        }
        const base = (p) => p.split(/[\\/]/).pop();
        return (mv.buildAiSeedingPairings() ?? []).map(([a, b]) => [base(a), base(b)]);
    }, scoresByName);
}

/** What the render chose, what is painted, and what the engine and the lists hold — as basenames. */
async function screenState(page) {
    return page.evaluate(() => {
        const mv = window.mediaViewer;
        const base = (p) => (p ? decodeURIComponent(String(p)).split(/[\\/]/).pop() : null);
        const pair = mv.tournament.engine?.getCurrentPair() ?? null;
        const painted = (side) => document.querySelector(`.${side}-media-wrapper .media-display`);
        return {
            shown: [base(mv.compareLeftFile?.path), base(mv.compareRightFile?.path)],
            srcs: [base(painted('left')?.getAttribute('src')), base(painted('right')?.getAttribute('src'))],
            engine: pair ? [base(pair.left), base(pair.right)] : null,
            leftCount: document.querySelectorAll('.left-media-wrapper .media-display').length,
            rightCount: document.querySelectorAll('.right-media-wrapper .media-display').length,
            engineFiles: (mv.tournament.engine?.files ?? []).map(base),
            mediaFiles: mv.mediaFiles.map((f) => f.name),
            fastMax: window.__fast?.max ?? null,
            msgs: window.__msgs ?? [],
        };
    });
}

/** The engine's pair is on screen, painted once: one media element per side. Soft, so every miss prints. */
function expectScreenMatchesEngine(s) {
    expect.soft(s.leftCount, 'left wrapper holds exactly one media element').toBe(1);
    expect.soft(s.rightCount, 'right wrapper holds exactly one media element').toBe(1);
    expect.soft(s.engine, 'the engine has a current pair').not.toBeNull();
    expect.soft(s.shown, 'the pair the render chose is the engine pair').toEqual(s.engine);
    expect.soft(s.srcs, 'the painted elements show the engine pair').toEqual(s.engine);
}

/** Every toast about a failed or removed file, in order — the whole list prints when an assertion misses. */
function failureMessages(s) {
    return s.msgs.filter((m) => /Skipp|Failed to load|File missing|undecodable/.test(m));
}

/**
 * Enter tournament mode through the real config modal and start a tournament.
 * Hybrid driving: switchMode + modal interaction are real; waits are state-based.
 * `aiSeeding` picks the modal's AI option (best vs worst) — call setSeedScores() first, or the
 * option is disabled and the toHaveValue check fails instead of silently seeding at random.
 */
async function enterAndStartTournament(page, { rounds, aiSeeding = false }) {
    // No saved state for a fresh temp folder → the config modal (not the continue prompt).
    await page.evaluate(() => window.mediaViewer.switchMode('tournament'));
    await expect(page.locator('#tournamentConfigModal')).toBeVisible();

    await page.locator('#tournamentRoundsSelect').fill(String(rounds));
    if (aiSeeding) {
        await page.locator('#tournamentSeedingSelect').selectOption('ai');
        await expect(page.locator('#tournamentSeedingSelect')).toHaveValue('ai');
    }
    await page.locator('#tournamentConfigStart').click();

    // Wait until the first pair is rendered and the render is idle (G3: the owner's loop has
    // finished and nothing is loading — a bare !isLoading wait passes at once on the fast path,
    // which never sets the flag).
    await page.waitForFunction(() => window.mediaViewer.isTournamentMode && window.mediaViewer.tournament.engine);
    await waitForTournamentIdle(page);
    // Confirm the compare layout rendered. Use toBeAttached (not toBeVisible): the idle wait
    // above is the real readiness gate, and a wrapper hosting a still-loading video side can be
    // transiently visibility:hidden, which flakes toBeVisible.
    await expect(page.locator('.left-media-wrapper')).toBeAttached();

    // The config modal focused #tournamentRoundsSelect; drop focus so subsequent
    // page.keyboard presses are not absorbed by the (now hidden) number input.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
}
```

- [x] **Step 3: Replace the three vacuous post-pick waits (spec F9)**

The line `        await page.waitForFunction(() => !window.mediaViewer.isLoading);` occurs exactly three times (after the pick in the Ctrl+A, leave-prompt and undo-button tests). Replace all three with:

```js
        await waitForTournamentIdle(page);
```

Run: `grep -n "!window.mediaViewer.isLoading" tests/e2e/tournament-mode.test.js`
Expected: one hit only — the resume test's combined `isTournamentMode && engine !== null && !isLoading` wait (`:266-271`), which stays.

- [x] **Step 4: Append E1–E3 at the end of the `describe` block (after the chrome test)**

```js
    // ── G3: one way for a tournament render to restart itself (spec 2026-10-07) ──
    // Round 1 is dealt by the real AI seeding path (best vs worst over predictionScores), so each
    // test knows where tiny.mp4 — a 32-byte stub that never decodes — sits before relying on it.

    test('G3 E1: two overlapping render requests leave one media element per side', async () => {
        test.fail(true, 'RED by design until G3 Task 3 (render owner) — delete this line there');
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
        ]);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 2 });

        // Two requests at once — what a media-failure render plus a pick's render amounted to.
        await page.evaluate(async () => {
            window.__fast.max = 0;
            const mv = window.mediaViewer;
            await Promise.all([mv.showTournamentPair(), mv.showTournamentPair()]);
        });
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.fastMax, 'at most one pair render in flight').toBe(1);
        expectScreenMatchesEngine(s);
    });

    test('G3 E2: an unreadable file in the first pair is skipped and the engine pair renders', async () => {
        test.fail(true, 'RED by design until G3 Task 4 (failure path) — delete this line there');
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'blue-1x1.png': 0.3,
            'tiny.mp4': 0.1,
        });
        expect(pairs, 'tiny.mp4 is dealt into the first pair').toEqual([
            ['red-1x1.png', 'tiny.mp4'],
            ['green-1x1.png', 'blue-1x1.png'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 2, aiSeeding: true });
        await page.waitForFunction(() => window.__tinyFailed);
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.mediaFiles, 'skipped from the list').not.toContain('tiny.mp4');
        expect.soft(s.engineFiles, 'skipped from the tournament').not.toContain('tiny.mp4');
        expect.soft(failureMessages(s), 'one skip toast, no Remove-button error').toEqual([SKIP_TINY]);
        expectScreenMatchesEngine(s);
    });

    test('G3 E3: a file that fails in a later pair while a draw renders leaves one render in flight', async () => {
        test.fail(true, 'RED by design until G3 Task 4 (failure path) — delete this line there');
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'tiny.mp4': 0.3,
            'blue-1x1.png': 0.1,
        });
        expect(pairs, 'tiny.mp4 is dealt into the second pair').toEqual([
            ['red-1x1.png', 'blue-1x1.png'],
            ['green-1x1.png', 'tiny.mp4'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 3, aiSeeding: true });
        expect((await screenState(page)).engine).toEqual(['red-1x1.png', 'blue-1x1.png']);

        // When tiny.mp4 fails, issue a draw — a user action whose render overlaps the failure's own.
        await page.evaluate(() => {
            document.addEventListener(
                'error',
                (e) => {
                    if (window.__drawIssued || !String(e.target?.src ?? '').includes('tiny.mp4')) return;
                    window.__drawIssued = true;
                    window.__fast.max = 0;
                    // A task, not a microtask: microtasks run between this capture listener and the
                    // app's own listener on the element, so a draw issued here would tear the element
                    // down first and the failure would be (correctly) ignored as stale. On the next
                    // task the failure has been handled and its render is in flight.
                    setTimeout(() => {
                        window.__draw = window.mediaViewer.handleTournamentDraw('lose');
                    }, 0);
                },
                true
            );
        });
        await page.keyboard.press('q'); // red beats blue → (green, tiny) renders through the fast path
        await page.waitForFunction(() => window.__draw !== undefined);
        await page.evaluate(() => window.__draw);
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.fastMax, 'at most one pair render in flight').toBe(1);
        expect.soft(s.mediaFiles, 'skipped from the list').not.toContain('tiny.mp4');
        expect.soft(s.engineFiles, 'skipped from the tournament').not.toContain('tiny.mp4');
        // The whole list prints on a miss. Before G3, 'Skipping missing file' comes only from
        // _buildTournamentSide's own error listener — Phase 0's evidence that the real trigger fired.
        expect.soft(failureMessages(s), 'one skip toast; the -1 capture net not needed').toEqual([SKIP_TINY]);
        expectScreenMatchesEngine(s);
    });
```

- [x] **Step 5: Run each new test WITHOUT its marker against unchanged code and record why it fails**

Temporarily comment out the three `test.fail(...)` lines (do not stage this state). Run:

`npx playwright test tests/e2e/tournament-mode.test.js -g "G3 E" --reporter=line`

Expected — all three FAIL, each for its named reason (record the soft-assertion output in the Progress Log):
- **E1**: `at most one pair render in flight` — received `2`; and `left/right wrapper holds exactly one media element` — received `2` (spec F6).
- **E2**: `skipped from the list` and `skipped from the tournament` — `tiny.mp4` still present; `one skip toast, no Remove-button error` — received `["❌ Failed to load video: tiny.mp4"]` (spec F3, first-pair path).
- **E3**: `at most one pair render in flight` — received `2`; `one skip toast; …` — received a list containing `"Skipping missing file"` and no `Failed to load video` entry (the real trigger went through `_buildTournamentSide`'s listener — spec § 4.2).

If any test **passes**, or fails only on a setup assertion (`pairs` placement, `toHaveValue('ai')`, the E3 first-pair check), or times out: STOP, fix the test, re-run. Do not continue to Step 6 on a RED that has not shown its named reason.

- [x] **Step 6: Restore the markers and run the whole file**

Uncomment the three `test.fail(...)` lines. Run: `npx playwright test tests/e2e/tournament-mode.test.js --reporter=line`
Expected: `12 passed` (9 existing + 3 expected failures reported as passed). An "Expected to fail, but passed." line means a test went green on unchanged code — STOP.

- [x] **Step 7: Record the Phase 0 result in the spec**

Append to the spec:

```markdown
---

## 11. Phase 0 result (2026-10-07)

Run on unchanged code (`media-viewer.js`, `main.js`, `logger.js` identical to `149b95d`), each test
without its `test.fail` marker:

| Test | Result | Named reason observed |
| ---- | ------ | --------------------- |
| E1 | <FAIL/PASS> | <paste: fastMax received, left/right counts received> |
| E2 | <FAIL/PASS> | <paste: lists still holding tiny.mp4; failure messages received> |
| E3 | <FAIL/PASS> | <paste: fastMax received; failure messages received> |

<one paragraph: whether each failed for the reason it names, and the E3 evidence that the real
trigger fired through `_buildTournamentSide`'s listener>
```

Fill every `<…>` from Step 5's output before committing (the angle brackets are this step's input slots, not text to keep).

- [x] **Step 8: Commit**

```bash
git add tests/e2e/tournament-mode.test.js docs/superpowers/specs/2026-10-07-g3-tournament-render-reentry-design.md docs/planning/plans/2026-10-07_g3-tournament-render-reentry.md
git commit -m "test(g3): Phase 0 — RED E2E for tournament render re-entry

E1-E3 fail on unchanged code for their named reasons (spec § 11) and
are committed under test.fail, which each fixing task removes. Adds
render instrumentation, deterministic AI seeding and an owner-aware
idle wait; the three post-pick !isLoading waits synchronised on nothing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: `logError` payloads normalised at the receiver (spec D6, § 5.4)

**Files:**
- Modify: `logger.js` (new function before `module.exports`, `:216`)
- Modify: `main.js:991-994`
- Modify: `tests/logger.test.js` (new `describe` inside `describe('logger')`, after `describe('logPerf()')`)
- Modify: `CLAUDE.md:34`, `CLAUDE.md:130`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `logger.normalizeRendererLogEntry(data: unknown) → { level: 'warn' | 'error', message: string, source: string }`.

- [x] **Step 1: Write the failing tests**

In `tests/logger.test.js`, inside `describe('logger', …)` after the `describe('logPerf()', …)` block:

```js
    describe('normalizeRendererLogEntry()', () => {
        it('wraps a plain string as an error from the renderer', () => {
            expect(logger.normalizeRendererLogEntry('JXL decode failed: x')).toEqual({
                level: 'error',
                message: 'JXL decode failed: x',
                source: 'renderer',
            });
        });

        it('keeps a full object entry as it is', () => {
            expect(logger.normalizeRendererLogEntry({ level: 'warn', message: 'm', source: 'ml' })).toEqual({
                level: 'warn',
                message: 'm',
                source: 'ml',
            });
        });

        it("defaults a partial object's level and source", () => {
            expect(logger.normalizeRendererLogEntry({ message: 'm' })).toEqual({
                level: 'error',
                message: 'm',
                source: 'renderer',
            });
        });

        it('treats any level other than warn as error', () => {
            expect(logger.normalizeRendererLogEntry({ level: 'info', message: 'm' }).level).toBe('error');
        });

        it('never logs a bare "undefined" for a missing payload', () => {
            for (const data of [undefined, null]) {
                expect(logger.normalizeRendererLogEntry(data)).toEqual({
                    level: 'error',
                    message: '(empty renderer log entry)',
                    source: 'renderer',
                });
            }
        });

        it('uses the message of an Error-shaped value', () => {
            expect(logger.normalizeRendererLogEntry(new Error('boom')).message).toBe('boom');
        });

        it('serialises an object with no message instead of dropping it', () => {
            expect(logger.normalizeRendererLogEntry({ level: 'warn', code: 7 })).toEqual({
                level: 'warn',
                message: '{"level":"warn","code":7}',
                source: 'renderer',
            });
        });

        // Source-text wiring check: main.js's IPC handler is not unit-testable (it needs ipcMain).
        it("is what main.js's log-renderer-error handler logs with", () => {
            const src = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
            const start = src.indexOf("ipcMain.on('log-renderer-error'");
            expect(start).toBeGreaterThan(-1);
            const handler = src.slice(start, src.indexOf('});', start));
            expect(handler).toContain('logger.normalizeRendererLogEntry(');
        });
    });
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/logger.test.js`
Expected: 8 FAIL — seven with `TypeError: logger.normalizeRendererLogEntry is not a function`, the wiring check with `expected '…' to contain 'logger.normalizeRendererLogEntry('`.

- [x] **Step 3: Implement**

In `logger.js`, directly above `module.exports`:

```js
// The payload of the renderer's window.electronAPI.logError(...), normalised. Most renderer call
// sites pass a plain string; a few pass { level, message, source }. The IPC handler used to
// destructure the object form only, so every string logged as "undefined" — and an undefined or
// null payload threw inside the handler (G3).
function normalizeRendererLogEntry(data) {
    if (data == null) return { level: 'error', message: '(empty renderer log entry)', source: 'renderer' };
    if (typeof data !== 'object') return { level: 'error', message: String(data), source: 'renderer' };
    let message = data.message;
    if (message == null) {
        try {
            message = JSON.stringify(data);
        } catch (_err) {
            message = String(data);
        }
    }
    return {
        level: data.level === 'warn' ? 'warn' : 'error',
        message: String(message),
        source: typeof data.source === 'string' && data.source ? data.source : 'renderer',
    };
}
```

and change the export line to:

```js
module.exports = { init, log, warn, error, logPerf, cleanup, getLogPath, normalizeRendererLogEntry };
```

In `main.js`, replace the handler (`:990-994`):

```js
    // Receive renderer errors for file logging (fire-and-forget). Callers pass a string or
    // { level, message, source }; normalise both (see logger.normalizeRendererLogEntry).
    ipcMain.on('log-renderer-error', (_event, data) => {
        const { level, message, source } = logger.normalizeRendererLogEntry(data);
        const fn = level === 'warn' ? logger.warn : logger.error;
        fn(source, message);
    });
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/logger.test.js`
Expected: all PASS. Then `npx vitest run` — expected **925** passing (917 + 8).

- [x] **Step 5: Update CLAUDE.md**

- Line 34 (`logger.js`): change `# Session logger (init/log/warn/error/logPerf/cleanup/getLogPath):` to `# Session logger (init/log/warn/error/logPerf/cleanup/getLogPath, normalizeRendererLogEntry):`.
- Line 130: after `forwarded to the main-process file logger via \`window.electronAPI.logError\` (fire-and-forget)` insert `, which accepts a plain string or \`{ level, message, source }\` — \`main.js\` normalises both via \`logger.normalizeRendererLogEntry\` (before G3, every string logged as \`undefined\`)`.

- [x] **Step 6: Commit**

```bash
git add logger.js main.js tests/logger.test.js CLAUDE.md
git commit -m "fix(logger): log renderer string payloads instead of 'undefined'

main.js destructured { level, message, source } from every log-renderer-
error payload, but 54 renderer diagnostics pass a plain string, so each
logged as 'undefined' (and an undefined/null payload threw in the
handler). normalizeRendererLogEntry accepts both forms.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: The render owner (spec D2, D4, D5, D7, § 5.1)

**Files:**
- Modify: `media-viewer.js` — constructor (`:99`), `showTournamentPair` (`:4862-4935`), `_buildTournamentSide` JXL catch (`:4999-5004`), `handleTournamentUndo` comment (`:5132-5139`)
- Modify: `tests/media-viewer-utils.test.js` — append two `describe` blocks; comments at `:3969-3972` and `:5370-5373`
- Modify: `tests/e2e/tournament-mode.test.js` — delete E1's `test.fail` line
- Modify: `CLAUDE.md:152`

**Interfaces:**
- Consumes: Task 1's E1.
- Produces: `showTournamentPair(): Promise<void>` (sync method returning the loop promise; never rejects); `async _runTournamentRenderLoop(): Promise<void>`; `async _renderTournamentPairOnce(_pruneDepth = 0): Promise<void>` (the old body); fields `_tournamentRenderLoop: Promise<void> | null`, `_tournamentRenderDirty: boolean`.

- [x] **Step 1: Write the failing unit tests**

Append to the end of `tests/media-viewer-utils.test.js`:

```js
describe('G3 tournament render owner (showTournamentPair: single-flight, coalescing)', () => {
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    // Each pass is a deferred the test releases: releases[i]() settles the i-th deferred pass.
    // Methods are extracted inside makeCtx so a missing method fails the test, not the file.
    function makeCtx() {
        const releases = [];
        const ctx = {
            _tournamentRenderDirty: false,
            _tournamentRenderLoop: null,
            showTournamentPair: extractMethod('showTournamentPair'),
            _runTournamentRenderLoop: vi.fn(extractAsyncMethod('_runTournamentRenderLoop')),
            _renderTournamentPairOnce: vi.fn(() => new Promise((resolve) => releases.push(resolve))),
        };
        return { ctx, releases };
    }
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('coalesces requests made during a pass into exactly one extra pass', async () => {
        const { ctx, releases } = makeCtx();
        const first = ctx.showTournamentPair();
        await flush();
        expect(ctx._renderTournamentPairOnce).toHaveBeenCalledTimes(1);

        expect(ctx.showTournamentPair()).toBe(first);
        expect(ctx.showTournamentPair()).toBe(first);
        expect(ctx.showTournamentPair()).toBe(first);
        let settled = false;
        first.then(() => (settled = true));

        releases[0]();
        await flush();
        expect(ctx._renderTournamentPairOnce).toHaveBeenCalledTimes(2);
        expect(settled).toBe(false); // nobody resolves before the pass that covers their request

        releases[1]();
        await first;
        expect(ctx._renderTournamentPairOnce).toHaveBeenCalledTimes(2);
        expect(ctx._runTournamentRenderLoop).toHaveBeenCalledTimes(1);
        expect(ctx._tournamentRenderLoop).toBeNull();
    });

    it('a request made synchronously inside the first pass joins the running loop', async () => {
        const { ctx, releases } = makeCtx();
        ctx._renderTournamentPairOnce.mockImplementationOnce(function () {
            this.showTournamentPair(); // e.g. a failure reported before the pass's first await
            return Promise.resolve();
        });
        const done = ctx.showTournamentPair();
        await flush();
        expect(ctx._runTournamentRenderLoop).toHaveBeenCalledTimes(1); // no second loop
        expect(ctx._renderTournamentPairOnce).toHaveBeenCalledTimes(2);
        releases[0]();
        await Promise.race([
            done,
            new Promise((_resolve, reject) => setTimeout(() => reject(new Error('render loop hung')), 1000)),
        ]);
    });

    it('a request landing just as the last pass finishes is still served', async () => {
        const { ctx, releases } = makeCtx();
        const first = ctx.showTournamentPair();
        await flush();
        let second;
        releases[0]();
        queueMicrotask(() => (second = ctx.showTournamentPair()));
        await first;
        await flush();
        expect(ctx._renderTournamentPairOnce).toHaveBeenCalledTimes(2);
        releases[1]();
        await second;
        expect(ctx._tournamentRenderLoop).toBeNull();
    });

    it('a pass that throws is logged, a request queued behind it still runs, and the promise resolves', async () => {
        const { ctx, releases } = makeCtx();
        ctx._renderTournamentPairOnce.mockImplementationOnce(function () {
            this.showTournamentPair();
            return Promise.reject(new Error('boom'));
        });
        const done = ctx.showTournamentPair();
        await flush();
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith('Tournament render failed: boom');
        expect(ctx._renderTournamentPairOnce).toHaveBeenCalledTimes(2);
        releases[0]();
        await expect(done).resolves.toBeUndefined();
        expect(ctx._tournamentRenderLoop).toBeNull();
    });
});

describe('G3 _renderTournamentPairOnce -1 capture net (bounded retry, D7)', () => {
    let origWindow, origDocument;

    beforeEach(() => {
        origWindow = globalThis.window;
        origDocument = globalThis.document;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
        globalThis.document = { getElementById: () => ({ textContent: '', disabled: false }) };
    });
    afterEach(() => {
        globalThis.window = origWindow;
        globalThis.document = origDocument;
    });

    it('terminates at the summary within the depth cap, recursing into itself and never the owner', async () => {
        const ctx = {
            isTournamentMode: true,
            mediaFiles: [{ path: '/a.png' }, { path: '/b.png' }],
            isSortedByPrediction: false,
            isSortedBySimilarity: false,
            baseFolderPath: '/dir',
            tournament: {
                engine: {
                    files: ['/x.png', '/y.png'],
                    isComplete: () => false,
                    getCurrentPair: () => ({ left: '/x.png', right: '/y.png' }),
                    peekUndoKind: () => null,
                    removeFile: vi.fn(),
                },
                getProgressText: () => '',
                getTierBreakdownText: () => '',
                _schedulePersist: vi.fn(),
            },
            getMediaIndex: () => -1, // every engine pair is absent: the net never resolves a pair
            showNotification: vi.fn(),
            showTournamentSummaryModal: vi.fn(),
            showTournamentPair: vi.fn(), // the owner: must never be called from inside a pass
        };
        ctx._renderTournamentPairOnce = vi.fn(extractAsyncMethod('_renderTournamentPairOnce'));

        await ctx._renderTournamentPairOnce();

        expect(ctx.showTournamentSummaryModal).toHaveBeenCalledTimes(1);
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
        // Cap is `_pruneDepth > mediaFiles.length + 1`: depths 0..4 run, depth 4 falls to the summary.
        expect(ctx._renderTournamentPairOnce).toHaveBeenCalledTimes(ctx.mediaFiles.length + 3);
        expect(ctx.tournament.engine.removeFile).toHaveBeenCalledWith('/x.png', { trackUndo: true });
    });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "G3"`
Expected: 5 FAIL — the four owner tests with `Could not find method: showTournamentPair` (today it is `async showTournamentPair(_pruneDepth = 0)`, which `extractMethod` does not match), the `-1` test with `Could not find async method: _renderTournamentPairOnce`.

- [x] **Step 3: Add the constructor fields**

In `media-viewer.js`, after `this._tournamentRestoreFailures = new WeakMap();` (`:99`):

```js
        // Tournament render owner state (G3) — see showTournamentPair.
        this._tournamentRenderLoop = null;
        this._tournamentRenderDirty = false;
```

- [x] **Step 4: Split `showTournamentPair` into the owner, the loop and the pass**

Replace the method's first two lines (`:4862-4863`):

```js
    async showTournamentPair(_pruneDepth = 0) {
        if (!this.isTournamentMode || !this.tournament.engine) return;
```

with:

```js
    // The single owner of tournament pair rendering (G3). Single-flight and coalescing: a call
    // during a render marks it dirty and returns the running loop's promise; the loop re-renders
    // the engine's CURRENT pair until nothing is dirty, so intermediate pairs are never painted.
    // The promise resolves when the screen shows the engine's pair, and never rejects.
    // Code running INSIDE a render pass (showTournamentPairFast, _buildTournamentSide,
    // showCompareMedia's tournament branches) may call this, but must never await it: the pass
    // would be waiting on the loop it belongs to.
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
                    // One failed pass must not end the loop: a request queued behind it still runs.
                    window.electronAPI.logError?.(`Tournament render failed: ${err?.message ?? err}`);
                }
            }
        } finally {
            // Same synchronous continuation as the last while-check: no request can land in between.
            this._tournamentRenderLoop = null;
        }
    }

    // One render pass of the engine's current pair. Only the owner (showTournamentPair) calls this,
    // apart from the -1 capture net's own bounded recursion below.
    async _renderTournamentPairOnce(_pruneDepth = 0) {
        if (!this.isTournamentMode || !this.tournament.engine) return;
```

Then replace the recursion (`:4910`):

```js
            return this.showTournamentPair(_pruneDepth + 1);
```

with:

```js
            // Recurse into the pass, never the owner: awaiting the owner from inside a pass waits
            // on the loop this pass belongs to.
            return this._renderTournamentPairOnce(_pruneDepth + 1);
```

- [x] **Step 5: Make `_buildTournamentSide`'s JXL catch request instead of await (Premise Correction 1)**

Replace (`:5003`):

```js
                    return this.showTournamentPair(); // re-render the (now different) engine pair
```

with:

```js
                    // Request, never await: this runs inside a pass of the render owner, and awaiting
                    // the owner here would wait on the loop this pass belongs to.
                    this.showTournamentPair();
                    return;
```

Run: `grep -n "showTournamentPair(" media-viewer.js`
Expected: every remaining `await this.showTournamentPair()` is in a handler or entry point (`moveToSpecialFolder`, the Start `onclick`, `handleTournamentPick`, `handleTournamentDraw`, `handleTournamentUndo` ×2, `_enterResumedTournamentUI`); the error listener in `_buildTournamentSide` and the JXL catch call it without `await`/`return`. Record the list in the Progress Log.

- [x] **Step 6: Update the comments that name the re-entrant render as live**

`media-viewer.js` `handleTournamentUndo` (`:5134-5137`) — replace:

```js
            // during the await (see the advisory note above). Nothing serializes the tournament
            // handler family — the re-entrancy guard that would have is BACKLOG [2026-08-31],
            // blocked on the un-awaited re-entrant renders in _buildTournamentSide — so isLoading
            // is the only thing in the way, and it is advisory. Reachable, not theoretical. BOTH
```

with:

```js
            // during the await (see the advisory note above). Nothing serializes the tournament
            // handler family — the render itself is single-flight since G3 (showTournamentPair), but
            // the handler guard is still BACKLOG [2026-08-31] item 2 — so isLoading is the only
            // thing in the way, and it is advisory. Reachable, not theoretical. BOTH
```

`tests/media-viewer-utils.test.js` `:3969-3972` — replace the four `// NOTE:` lines with:

```js
    // NOTE: the four re-entrancy cases that stood here were reverted with Task 4 on 2026-08-31, because
    // _buildTournamentSide re-entered the render from a DOM error callback outside every handler. G3
    // (2026-10-07) made the render single-flight (showTournamentPair is its owner), which removes that
    // re-entry; the handler guard itself is still BACKLOG [2026-08-31] item 2. isLoading remains the
    // only (advisory) guard; the cases above pin what it does and does not do.
```

`tests/media-viewer-utils.test.js` `:5370-5373` — replace:

```js
        // Task 4 added a lock here and was reverted on 2026-08-31: any lock over this handler
        // family either misses the re-entrant render path (_buildTournamentSide's DOM error
        // callback calls showTournamentPair() un-awaited, bypassing every handler) and silently
        // drops user input, or covers it and wedges. Measured both. See BACKLOG [2026-08-31].
```

with:

```js
        // Task 4 added a lock here and was reverted on 2026-08-31: at the time _buildTournamentSide's
        // DOM error callback re-entered the render outside every handler, so any lock over this
        // family either dropped user input or wedged (measured both). G3 made the render
        // single-flight, which unblocks a real guard — BACKLOG [2026-08-31] item 2, not built yet.
```

- [x] **Step 7: Run the unit tests**

Run: `npx vitest run`
Expected: **930** passing (925 + 5), including the CHARACTERIZATION test (`a second undo DOES re-enter mid-render`) — still green, item 2 untouched.

- [x] **Step 8: Turn E1 green**

In `tests/e2e/tournament-mode.test.js`, delete the line `        test.fail(true, 'RED by design until G3 Task 3 (render owner) — delete this line there');`.

Run: `npx playwright test tests/e2e/tournament-mode.test.js --reporter=line`
Expected: `12 passed` — E1 now genuinely passes; E2 and E3 still fail as expected (on this code the old listener's toast is `Skipping missing file` and the `-1` net adds `File missing — removed from tournament: tiny.mp4`, so their message assertions still miss). An "Expected to fail, but passed." for E2 or E3 means a premise moved — STOP and report.

- [x] **Step 9: Update CLAUDE.md line 152**

After the sentence `Per-pair render uses \`showTournamentPairFast\` (reuses the compare wrappers) instead of a full \`showCompareMedia\` teardown.` append:

`` `showTournamentPair()` is the render's single-flight, coalescing **owner** (G3): a call during a render marks it dirty and returns the running loop's promise, which resolves once the screen shows the engine's current pair and never rejects; code inside a render pass may request a render but must **never await** one (it would await its own loop — `_renderTournamentPairOnce` is the pass, and the `-1` net recurses into it, not the owner).``

- [x] **Step 10: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js tests/e2e/tournament-mode.test.js CLAUDE.md
git commit -m "fix(g3): one owner for the tournament pair render

showTournamentPair() is now single-flight and coalescing: a call during a
render marks it dirty and returns the running loop's promise, and the
loop re-renders the engine's current pair until nothing is dirty. Two
overlapping requests no longer orphan a media element per side (E1).
A pass that throws is logged and the loop goes on. The -1 net recurses
into the pass, and _buildTournamentSide's JXL catch requests instead of
awaiting, either of which would otherwise await its own loop.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: The failure path — one helper at every site (spec D3, § 5.2, § 5.3)

**Files:**
- Modify: `media-viewer.js` — new `_skipFailedTournamentFile` + `_attachTournamentFailureListener` (place directly after `_buildTournamentSide`); `_buildTournamentSide` (header, JXL catch, error listener); `showTournamentPairFast` (header, fallback, dirty return); `showCompareMedia` (`:3302`, `:3342-3353`, `:3357`, `:3367`, `:3382-3393`, `:3397`, `:3407`); `_renderTournamentPairOnce` capture-net comment; `handleTournamentUndo` advisory comment (`:5090-5099`)
- Modify: `tests/media-viewer-utils.test.js` — append two `describe` blocks
- Modify: `tests/e2e/tournament-mode.test.js` — import, `waitForUserHistory`, four history waits, delete E2/E3 markers, E4–E7
- Modify: `CLAUDE.md:152`, `:163`, `:200`

**Interfaces:**
- Consumes: Task 3's `showTournamentPair()` (request without awaiting) and `_tournamentRenderDirty`; Task 1's E2E helpers.
- Produces: `_skipFailedTournamentFile(file: {name, path}, { side = null, media = null, reason = 'load' } = {}): void`; `_attachTournamentFailureListener(media: HTMLMediaElement, side: 'left' | 'right', file: {name, path}): void`; test helper `waitForUserHistory(page, n)`.

- [x] **Step 1: Write the failing unit tests**

Append to `tests/media-viewer-utils.test.js`:

```js
describe('G3 _skipFailedTournamentFile — the one tournament failure path', () => {
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = { electronAPI: { logError: vi.fn() } };
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    const FILE = { name: 'tiny.mp4', path: '/dir/tiny.mp4' };
    function makeCtx(overrides = {}) {
        const media = { tagName: 'VIDEO' };
        const ctx = {
            isTournamentMode: true,
            baseFolderPath: '/dir',
            mediaFiles: [{ name: 'a.png', path: '/dir/a.png' }, { ...FILE }],
            leftMedia: { tagName: 'IMG' },
            rightMedia: media,
            isLoading: true,
            mediaNavigationInProgress: true,
            tournament: {
                engine: { files: ['/dir/a.png', '/dir/tiny.mp4'], removeFile: vi.fn() },
                _schedulePersist: vi.fn(),
            },
            removeFileFromList: vi.fn(),
            updateFolderInfo: vi.fn(),
            showNotification: vi.fn(),
            hideLoadingSpinner: vi.fn(),
            showTournamentPair: vi.fn(() => new Promise(() => {})), // never settles: must not be awaited
            ...overrides,
        };
        return { ctx, media };
    }
    const skip = () => extractMethod('_skipFailedTournamentFile');

    it('drops the file from both lists as a tracked prune, then requests a render without awaiting it', () => {
        const { ctx, media } = makeCtx();
        const ret = skip().call(ctx, FILE, { side: 'right', media, reason: 'load' });

        expect(ret).toBeUndefined(); // not the owner's promise — a caller inside a pass must not await it
        expect(ctx.removeFileFromList).toHaveBeenCalledWith('/dir/tiny.mp4');
        expect(ctx.updateFolderInfo).toHaveBeenCalled();
        expect(ctx.tournament.engine.removeFile).toHaveBeenCalledWith('/dir/tiny.mp4', { trackUndo: true });
        expect(ctx.tournament._schedulePersist).toHaveBeenCalledWith('/dir');
        expect(ctx.showNotification).toHaveBeenCalledTimes(1);
        expect(ctx.showNotification).toHaveBeenCalledWith("Skipping tiny.mp4 — couldn't be loaded", 'warning');
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith(
            'Tournament file skipped (load): /dir/tiny.mp4'
        );
        expect(ctx.isLoading).toBe(false);
        expect(ctx.mediaNavigationInProgress).toBe(false);
        expect(ctx.hideLoadingSpinner).toHaveBeenCalled();
        expect(ctx.showTournamentPair).toHaveBeenCalledTimes(1);
        // The engine is pruned BEFORE the request, or the next pass falls into the -1 capture net
        // instead of rendering the engine's new pair.
        expect(ctx.tournament.engine.removeFile.mock.invocationCallOrder[0]).toBeLessThan(
            ctx.showTournamentPair.mock.invocationCallOrder[0]
        );
    });

    it('skips a file with no media element (missing on disk, undecodable)', () => {
        const { ctx } = makeCtx();
        skip().call(ctx, FILE, { reason: 'missing' });
        expect(ctx.tournament.engine.removeFile).toHaveBeenCalledWith('/dir/tiny.mp4', { trackUndo: true });
        expect(globalThis.window.electronAPI.logError).toHaveBeenCalledWith(
            'Tournament file skipped (missing): /dir/tiny.mp4'
        );
        expect(ctx.showTournamentPair).toHaveBeenCalledTimes(1);
    });

    it('ignores a failure from an element that is no longer on screen (Review Focus 5)', () => {
        const { ctx } = makeCtx();
        skip().call(ctx, FILE, { side: 'right', media: { tagName: 'VIDEO' } }); // a torn-down element
        expect(ctx.removeFileFromList).not.toHaveBeenCalled();
        expect(ctx.tournament.engine.removeFile).not.toHaveBeenCalled();
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });

    it('is a no-op for a file already gone from both lists', () => {
        const { ctx, media } = makeCtx({ mediaFiles: [{ name: 'a.png', path: '/dir/a.png' }] });
        ctx.tournament.engine.files = ['/dir/a.png'];
        skip().call(ctx, FILE, { side: 'right', media });
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });

    it('does nothing once tournament mode has been left (Review Focus 5)', () => {
        const { ctx, media } = makeCtx({ isTournamentMode: false });
        skip().call(ctx, FILE, { side: 'right', media });
        expect(ctx.removeFileFromList).not.toHaveBeenCalled();
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });

    it('does nothing when the engine is gone — folder switched or Apply (Review Focus 5)', () => {
        const { ctx, media } = makeCtx();
        ctx.tournament.engine = null;
        skip().call(ctx, FILE, { side: 'right', media });
        expect(ctx.removeFileFromList).not.toHaveBeenCalled();
        expect(ctx.showNotification).not.toHaveBeenCalled();
        expect(ctx.showTournamentPair).not.toHaveBeenCalled();
    });
});

describe('G3 _attachTournamentFailureListener', () => {
    it("registers on the side's tracked list, so cleanupCompareMedia removes it with the others", () => {
        const attach = extractMethod('_attachTournamentFailureListener');
        const media = { addEventListener: vi.fn() };
        const file = { name: 'tiny.mp4', path: '/dir/tiny.mp4' };
        const ctx = { videoEventListenersLeft: [], videoEventListenersRight: [], _skipFailedTournamentFile: vi.fn() };

        attach.call(ctx, media, 'right', file);

        expect(ctx.videoEventListenersLeft).toHaveLength(0);
        expect(ctx.videoEventListenersRight).toHaveLength(1);
        const { event, handler } = ctx.videoEventListenersRight[0];
        expect(event).toBe('error');
        expect(media.addEventListener).toHaveBeenCalledWith('error', handler, { once: true });
        handler();
        expect(ctx._skipFailedTournamentFile).toHaveBeenCalledWith(file, { side: 'right', media, reason: 'load' });
    });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "G3 _"`
Expected: 7 FAIL — six with `Could not find method: _skipFailedTournamentFile`, one with `Could not find method: _attachTournamentFailureListener`. (`-t "G3 _"` also matches Task 3's `-1` test, which stays green.)

- [x] **Step 3: Add the Review Focus E2E cases and the history helper**

In `tests/e2e/tournament-mode.test.js`:

Change the second import line to:

```js
import { access, rm, writeFile } from 'fs/promises';
```

Add below `failureMessages`:

```js
/** Wait until the undo stack holds `n` user entries — a skip's system 'prune' does not count (G3). */
async function waitForUserHistory(page, n) {
    await page.waitForFunction(
        (want) =>
            window.mediaViewer.tournament.engine.history.filter((e) => (e.kind ?? 'pick') !== 'prune').length ===
            want,
        n
    );
}
```

Append after E3, inside the `describe`:

```js
    test('G3 E4: an undecodable JXL in a later pair is skipped inside the render (Review Focus 1)', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        // Garbage bytes under a .jxl name: listed as image/jxl, rejected by the decoder. Named to sort
        // last, so the file single mode shows on folder load is a PNG, not this one.
        await writeFile(join(tmpFixtures.dir, 'zz-bad.jxl'), 'not a jxl file');
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'zz-bad.jxl': 0.3,
            'blue-1x1.png': 0.1,
        });
        expect(pairs, 'zz-bad.jxl is dealt into the second pair').toEqual([
            ['red-1x1.png', 'blue-1x1.png'],
            ['green-1x1.png', 'zz-bad.jxl'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 3, aiSeeding: true });
        expect((await screenState(page)).engine).toEqual(['red-1x1.png', 'blue-1x1.png']);

        await page.evaluate(() => (window.__fast.max = 0));
        await page.keyboard.press('q'); // red beats blue → (green, zz-bad.jxl): its decode fails mid-render
        await page.waitForFunction(() => window.__msgs.some((m) => /zz-bad\.jxl|undecodable/.test(m)));
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        expect.soft(s.fastMax, 'the failure re-rendered through the owner, not nested').toBe(1);
        expect.soft(s.mediaFiles).not.toContain('zz-bad.jxl');
        expect.soft(s.engineFiles).not.toContain('zz-bad.jxl');
        expect.soft(failureMessages(s)).toEqual(["Skipping zz-bad.jxl — couldn't be loaded"]);
        expectScreenMatchesEngine(s);
    });

    test('G3 E5: both files of the first pair missing from disk are skipped (Review Focus 2)', async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
        ]);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'blue-1x1.png': 0.3,
            'normal-320x240.png': 0.1,
        });
        expect(pairs).toEqual([
            ['red-1x1.png', 'normal-320x240.png'],
            ['green-1x1.png', 'blue-1x1.png'],
        ]);
        // Gone from disk after the folder loaded: still listed, so the tournament deals them first.
        await rm(join(tmpFixtures.dir, 'red-1x1.png'));
        await rm(join(tmpFixtures.dir, 'normal-320x240.png'));
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 2, aiSeeding: true });
        await page.waitForFunction(() => window.__msgs.some((m) => /^Skipp/.test(m)));
        await waitForTournamentIdle(page);

        const s = await screenState(page);
        for (const gone of ['red-1x1.png', 'normal-320x240.png']) {
            expect.soft(s.mediaFiles).not.toContain(gone);
            expect.soft(s.engineFiles).not.toContain(gone);
        }
        expect.soft(failureMessages(s)).toEqual([
            "Skipping red-1x1.png — couldn't be loaded",
            "Skipping normal-320x240.png — couldn't be loaded",
        ]);
        expectScreenMatchesEngine(s);
    });

    test('G3 E6: skips that leave one file end at the summary, still in tournament mode (Review Focus 3)', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, { 'red-1x1.png': 0.9, 'tiny.mp4': 0.1 });
        expect(pairs).toEqual([['red-1x1.png', 'tiny.mp4']]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 1, aiSeeding: true });
        await page.waitForFunction(() => window.__tinyFailed);
        await waitForTournamentIdle(page);

        await expect(page.locator('#tournamentSummaryModal')).toBeVisible();
        const flags = await page.evaluate(() => ({
            tournament: window.mediaViewer.isTournamentMode,
            loading: window.mediaViewer.isLoading,
            nav: window.mediaViewer.mediaNavigationInProgress,
        }));
        expect(flags).toEqual({ tournament: true, loading: false, nav: false });
        const s = await screenState(page);
        expect(s.engineFiles).toEqual(['red-1x1.png']);
        expect(failureMessages(s)).toEqual([SKIP_TINY]);
    });

    test('G3 E7: undo right after a skip restores the pick; the skipped file is re-pruned when dealt (Review Focus 4)', async () => {
        // Pins spec § 5.2's undo semantics, which G3 must preserve — may pass on pre-G3 code by construction.
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'tiny.mp4']);
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        const pairs = await setSeedScores(page, {
            'red-1x1.png': 0.9,
            'green-1x1.png': 0.7,
            'tiny.mp4': 0.3,
            'blue-1x1.png': 0.1,
        });
        expect(pairs).toEqual([
            ['red-1x1.png', 'blue-1x1.png'],
            ['green-1x1.png', 'tiny.mp4'],
        ]);
        await instrumentRender(page);
        await enterAndStartTournament(page, { rounds: 3, aiSeeding: true });

        await page.keyboard.press('q'); // red beats blue → (green, tiny), which fails and is skipped
        await page.waitForFunction(() => window.__tinyFailed);
        await waitForTournamentIdle(page);
        let s = await screenState(page);
        expect(s.engineFiles).not.toContain('tiny.mp4');

        await page.keyboard.press('Control+a'); // the newest entry is the skip's prune; the pick lies below it
        await waitForUserHistory(page, 0);
        await waitForTournamentIdle(page);
        s = await screenState(page);
        expect(s.engine, 'the pick is undone').toEqual(['red-1x1.png', 'blue-1x1.png']);
        expect(s.engineFiles, 'undo absorbed the prune: back in the engine (spec § 5.2)').toContain('tiny.mp4');
        expect(s.mediaFiles, '…but not in the list').not.toContain('tiny.mp4');
        expectScreenMatchesEngine(s);

        await page.keyboard.press('q'); // red beats blue again → tiny is dealt while absent from the list
        await waitForUserHistory(page, 1);
        await waitForTournamentIdle(page);
        s = await screenState(page);
        expect(s.engineFiles, 'the -1 capture net re-pruned it').not.toContain('tiny.mp4');
        expectScreenMatchesEngine(s);
    });
```

- [x] **Step 4: Run E4–E7 to see them fail on Task 3's code**

Run: `npx playwright test tests/e2e/tournament-mode.test.js -g "G3 E[4-7]" --reporter=line`
Expected:
- **E4 FAIL** — `failureMessages` received `["Skipping undecodable JXL file", "File missing — removed from tournament: zz-bad.jxl"]`. If E4 instead **times out** waiting for the message, the garbage bytes did not reject in the decoder: STOP and report (the fixture needs a different corruption).
- **E5 FAIL** — the engine still holds `red-1x1.png`/`normal-320x240.png`, and `shown` ≠ `engine` (the retry rendered `mediaFiles[0..1]`).
- **E6 FAIL** — the summary modal is not visible (the first pair stayed up behind the `Failed to load video` toast).
- **E7** — may pass (it pins semantics G3 preserves); record the result either way.

- [x] **Step 5: Implement the helper and the listener**

In `media-viewer.js`, directly after `_buildTournamentSide`'s closing brace, add:

```js
    // The ONE tournament media-failure path (G3). A missing, undecodable or unloadable file is
    // skipped: dropped from mediaFiles and from the engine as a tracked 'prune' (so undoUserAction
    // stays consistent), with one toast, and the engine's next pair requested. Every failure site
    // calls this — _buildTournamentSide (load error, JXL decode) and showCompareMedia's tournament
    // branches (first pair). It never renders and never awaits the render: callers can be inside a
    // pass of the render owner (see showTournamentPair), and awaiting it there would wait on itself.
    _skipFailedTournamentFile(file, { side = null, media = null, reason = 'load' } = {}) {
        const engine = this.tournament.engine;
        if (!this.isTournamentMode || !engine) return;
        // A late event from an element a later render already tore down: not the file on screen.
        if (media && media !== (side === 'left' ? this.leftMedia : this.rightMedia)) return;
        const inList = this.mediaFiles.some((f) => f.path === file.path);
        if (!inList && !engine.files.includes(file.path)) return; // already skipped
        window.electronAPI.logError?.(`Tournament file skipped (${reason}): ${file.path}`);
        this.showNotification(`Skipping ${file.name} — couldn't be loaded`, 'warning');
        this.removeFileFromList(file.path);
        this.updateFolderInfo();
        // Before the render request, so the next pass renders the engine's new pair instead of
        // falling into the -1 capture net in _renderTournamentPairOnce.
        engine.removeFile(file.path, { trackUndo: true });
        this.tournament._schedulePersist(this.baseFolderPath);
        // As compare's onError does: a failed first pair (showCompareMedia set these) must not leave
        // the controls dead. isLoading is advisory in tournament mode (see handleTournamentUndo).
        this.isLoading = false;
        this.mediaNavigationInProgress = false;
        this.hideLoadingSpinner();
        this.showTournamentPair();
    }

    // Route a tournament media element's load failure to _skipFailedTournamentFile. Registered on the
    // side's tracked listener list, so cleanupCompareMedia removes it with the others — the untracked
    // listener it replaces outlived its element (G3).
    _attachTournamentFailureListener(media, side, file) {
        const listeners = side === 'left' ? this.videoEventListenersLeft : this.videoEventListenersRight;
        const onFailed = () => this._skipFailedTournamentFile(file, { side, media, reason: 'load' });
        listeners.push({ event: 'error', handler: onFailed });
        media.addEventListener('error', onFailed, { once: true });
    }
```

- [x] **Step 6: Route `_buildTournamentSide` through the helper**

Replace the JXL catch body Task 3 left:

```js
                } catch (err) {
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.showNotification('Skipping undecodable JXL file', 'warning');
                    this.removeFileFromList(file.path);
                    // Request, never await: this runs inside a pass of the render owner, and awaiting
                    // the owner here would wait on the loop this pass belongs to.
                    this.showTournamentPair();
                    return;
                }
```

with:

```js
                } catch (err) {
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    // The one tournament failure path; it requests the next pass itself, never awaits it.
                    this._skipFailedTournamentFile(file, { reason: 'decode' });
                    return;
                }
```

Replace the untracked listener:

```js
        media.addEventListener(
            'error',
            () => {
                window.electronAPI.logError?.('Tournament media failed to load: ' + file.path);
                this.showNotification('Skipping missing file', 'warning');
                this.removeFileFromList(file.path);
                this.showTournamentPair();
            },
            { once: true }
        );
```

with:

```js
        this._attachTournamentFailureListener(media, side, file);
```

Replace the last two header lines of `_buildTournamentSide`'s comment:

```js
    // showTournamentPairFast's phase separation). A missing or undecodable file is purged
    // (mirrors showCompareMedia) and the engine pair re-rendered.
```

with:

```js
    // showTournamentPairFast's phase separation). A file that fails to load or decode goes to
    // _skipFailedTournamentFile, which drops it and requests the engine's next pair; this method
    // never renders (it runs inside a pass of the render owner).
```

- [x] **Step 7: `showTournamentPairFast` — detached-wrapper fallback and stale-pair return**

Replace:

```js
        if (!this.leftMediaWrapper || !this.rightMediaWrapper) {
```

with:

```js
        // isConnected, not mere presence: showCompareMedia removes the old wrappers before it can
        // fail and return without new ones, leaving these fields on detached divs (G3).
        if (!this.leftMediaWrapper?.isConnected || !this.rightMediaWrapper?.isConnected) {
```

Replace:

```js
        await Promise.all([this._buildTournamentSide('left', leftFile), this._buildTournamentSide('right', rightFile)]);
        this.updateCompareFileInfo(leftFile, rightFile);
```

with:

```js
        await Promise.all([this._buildTournamentSide('left', leftFile), this._buildTournamentSide('right', rightFile)]);
        // A side that failed to build has already requested the next pass, which paints the engine's
        // new pair and its info — don't paint this stale pair's info first.
        if (this._tournamentRenderDirty) return;
        this.updateCompareFileInfo(leftFile, rightFile);
```

In the header comment, replace `showCompareMedia for the first pair (no wrappers yet). Both sides re-render atomically` with `showCompareMedia for the first pair, or whenever the wrappers are not in the document. Both sides re-render atomically`.

- [x] **Step 8: `showCompareMedia` — tournament branches**

Missing files — replace:

```js
        let removedCount = 0;
        if (!leftExists) {
```

with:

```js
        // Tournament mode: this render is a pass of the tournament render owner (it draws the first
        // pair, and any pair after a failure that left no wrappers). Skip each missing file through
        // the one tournament failure path and let the owner's next pass render the engine's pair —
        // _retryCompareAfterRemoval would render mediaFiles[currentIndex..+1], a pair the engine is
        // not on (G3). Request, never await: we are inside a pass.
        if (this.isTournamentMode && (!leftExists || !rightExists)) {
            if (!leftExists) this._skipFailedTournamentFile(leftFile, { reason: 'missing' });
            if (!rightExists) this._skipFailedTournamentFile(rightFile, { reason: 'missing' });
            return;
        }

        let removedCount = 0;
        if (!leftExists) {
```

Left JXL catch — replace:

```js
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.showNotification('Skipping undecodable JXL file', 'warning');
                    this.leftMedia = null; // detached <img>, never appended
```

with:

```js
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.leftMedia = null; // detached <img>, never appended
                    if (this.isTournamentMode) {
                        // The one tournament failure path — see the missing-file branch above.
                        this._skipFailedTournamentFile(leftFile, { reason: 'decode' });
                        return;
                    }
                    this.showNotification('Skipping undecodable JXL file', 'warning');
```

Right JXL catch — the same edit with `rightMedia` / `rightFile`: replace

```js
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.showNotification('Skipping undecodable JXL file', 'warning');
                    this.rightMedia = null; // detached <img>, never appended
```

with:

```js
                    window.electronAPI.logError('JXL decode failed: ' + (err && err.message ? err.message : err));
                    this.rightMedia = null; // detached <img>, never appended
                    if (this.isTournamentMode) {
                        // The one tournament failure path — see the missing-file branch above.
                        this._skipFailedTournamentFile(rightFile, { reason: 'decode' });
                        return;
                    }
                    this.showNotification('Skipping undecodable JXL file', 'warning');
```

Handler setup — replace each of the four lines, keeping the attach **immediately after** its `setupCompare*Handlers` call (the element's `src` is already set, and the right side may `await` a JXL decode before the render reaches any later point, so a later attach could miss the left side's error):

```js
            this.setupCompareImageHandlers(this.leftMedia, leftFile, 'left');
```
→
```js
            // Tournament mode: a load failure goes through the one tournament failure path (auto-skip),
            // never compare's Remove toast, whose removeFailedFile → showMedia renders a pair the
            // engine is not on (G3). Attached right after src, before the render's next await.
            this.setupCompareImageHandlers(this.leftMedia, leftFile, 'left', { skipErrorHandler: this.isTournamentMode });
            if (this.isTournamentMode) this._attachTournamentFailureListener(this.leftMedia, 'left', leftFile);
```

```js
            this.setupCompareVideoHandlers(this.leftMedia, leftFile, 'left');
```
→
```js
            this.setupCompareVideoHandlers(this.leftMedia, leftFile, 'left', { skipErrorHandler: this.isTournamentMode });
            if (this.isTournamentMode) this._attachTournamentFailureListener(this.leftMedia, 'left', leftFile);
```

```js
            this.setupCompareImageHandlers(this.rightMedia, rightFile, 'right');
```
→
```js
            this.setupCompareImageHandlers(this.rightMedia, rightFile, 'right', { skipErrorHandler: this.isTournamentMode });
            if (this.isTournamentMode) this._attachTournamentFailureListener(this.rightMedia, 'right', rightFile);
```

```js
            this.setupCompareVideoHandlers(this.rightMedia, rightFile, 'right');
```
→
```js
            this.setupCompareVideoHandlers(this.rightMedia, rightFile, 'right', { skipErrorHandler: this.isTournamentMode });
            if (this.isTournamentMode) this._attachTournamentFailureListener(this.rightMedia, 'right', rightFile);
```

- [x] **Step 9: Correct the two comments this task falsifies (spec F10, § 8)**

In `_renderTournamentPairOnce`, replace:

```js
            // Capture net: unreachable after reconcileWithFiles (see _enterResumedTournamentUI).
            // If it still fires, the engine/mediaFiles diverged — log the shape so a real 24k
            // repro is diagnosable in the session log, then prune + retry (bounded).
```

with:

```js
            // Capture net: an engine file absent from mediaFiles. Expected after an undo whose
            // undoUserAction() absorbed a skip's prune — the skipped file returns to the engine but
            // not to mediaFiles (see _skipFailedTournamentFile); otherwise the engine and mediaFiles
            // diverged in a way reconcileWithFiles missed. Log the shape so a real 24k repro is
            // diagnosable in the session log, then prune + retry (bounded).
```

In `handleTournamentUndo` (`:5095-5097`), replace:

```js
            // ADVISORY ONLY — isLoading is not exclusively owned. showTournamentPairFast never sets it,
            // but the setupCompare*Handlers it attaches CLEAR it on bothLoaded/onError, so a pair render
```

with:

```js
            // ADVISORY ONLY — isLoading is not exclusively owned. showTournamentPairFast never sets it,
            // but the setupCompare*Handlers it attaches CLEAR it on bothLoaded (and
            // _skipFailedTournamentFile clears it on a tournament media failure), so a pair render
```

Run: `grep -n "Skipping missing file\|Tournament media failed to load\|_retryCompareAfterRemoval(" media-viewer.js`
Expected: no `Skipping missing file` and no `Tournament media failed to load`; `_retryCompareAfterRemoval(` only at its definition and the three compare-mode call sites (now reached only when `!isTournamentMode`).

- [x] **Step 10: Run the unit tests**

Run: `npx vitest run`
Expected: **937** passing (930 + 7).

- [x] **Step 11: Count user entries in the four existing history waits (spec F8) and turn E2/E3 green**

In `tests/e2e/tournament-mode.test.js`:
- Replace every `        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 1);` (three: the Ctrl+A, leave-prompt and undo-button tests) with `        await waitForUserHistory(page, 1);`.
- Replace every `        await page.waitForFunction(() => window.mediaViewer.tournament.engine.history.length === 0);` (two: Ctrl+A and undo-button tests) with `        await waitForUserHistory(page, 0);`.
- Delete E2's and E3's `test.fail(...)` lines.

Run: `grep -n "history.length" tests/e2e/tournament-mode.test.js`
Expected: the two `history.length > 0` waits in the 2-file PNG draw tests and the resume test's `historyLen` read — no tiny.mp4 in any of them, so a prune cannot appear.

- [x] **Step 12: Run the tournament file**

Run: `npx playwright test tests/e2e/tournament-mode.test.js --reporter=line`
Expected: `16 passed`, with no "Expected to fail" line left (`grep -c "test.fail" tests/e2e/tournament-mode.test.js` → `0`).

- [x] **Step 13: Update CLAUDE.md**

- Line 152: in `Structural-mutation writes (reconcile prune, \`-1\` missing-file removal, special-move removal)` add `, load-failure skip` after `\`-1\` missing-file removal`; and append to the owner sentence Task 3 added: `` Every tournament media failure — load error, JXL decode, missing file, first pair included — goes through `_skipFailedTournamentFile` (tracked `'prune'`, one toast, next pair requested, flags cleared); it never renders itself.``
- Line 163: append ` Compare mode only: in tournament mode a failed file is skipped through \`_skipFailedTournamentFile\` and the engine's next pair rendered — the retry would render \`mediaFiles[currentIndex..+1]\`, a pair the engine is not on (G3).`
- Line 200: replace `The \`-1\` auto-prune and the special-move removal pass \`{trackUndo: true}\` (kinds \`'prune'\` and \`'special'\`)` with `The \`-1\` auto-prune, the load-failure skip (\`_skipFailedTournamentFile\`) and the special-move removal pass \`{trackUndo: true}\` (kinds \`'prune'\`, \`'prune'\` and \`'special'\`)`.

- [x] **Step 14: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js tests/e2e/tournament-mode.test.js CLAUDE.md
git commit -m "fix(g3): every tournament media failure auto-skips through one helper

_skipFailedTournamentFile drops a failed file from mediaFiles and the
engine (tracked prune), toasts once, clears the load flags and requests
the next pass without awaiting it. _buildTournamentSide's load and JXL
failures and showCompareMedia's first-pair branches all call it, so the
first pair no longer shows a Remove toast or retries onto a pair the
engine is not on. Its error listener is now tracked, so cleanup removes
it. Fast-path fallback checks isConnected: a failed showCompareMedia
leaves detached wrappers. E2-E7 green; history waits count user entries.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Finish (after Task 4)

- [x] `npx vitest run` (937), `npm run lint` (0 errors), `npm run format:check`; `git status --short` clean.
- [x] **Regression bar (spec § 7.2):** `S=$(mktemp -d); for i in 1 2 3 4 5; do npx playwright test tests/e2e/tournament-mode.test.js --reporter=line > "$S/after-run-$i.log" 2>&1; echo "run $i exit=$?"; done` — five consecutive green runs (16/16 each). Any failure resets the count; investigate before re-running, never retry-until-green.
- [x] **Acceptance 5 (spec § 7.5):** after a run, `grep -h "Tournament file skipped" "$APPDATA/Electron/logs"/media-viewer-*.log | head -3` shows the skip line as text, and `grep -c "\[renderer\] undefined$" "$APPDATA/Electron/logs"/media-viewer-*.log` is 0 for those sessions.
- [x] `npx playwright test` — the full suite once (expected 91 passed / 4 skipped: 84 + 7 new). An existing non-tournament test that changes behaviour is a finding — triage against the spec, never paper over it.
- [x] Dispatch the `regression-checker` agent on `git diff main...HEAD -- media-viewer.js`; triage every finding against the spec.
- [ ] Push (`git push -u origin g3-tournament-render-reentry`; the pre-push hook runs the full E2E suite). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [ ] Open the PR (body: spec link, Phase 0 table, RED → GREEN per task, test deltas, the residuals). Review **deep (`/code-review max`)**.
- [ ] Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

1. **Undo past a skip re-surfaces the skipped file with an ERROR-level log** — the `-1` net logs `Tournament divergence` at ERROR (the string form now reaches the log) and toasts `File missing — removed from tournament` for an expected, documented case (spec § 5.2). Candidate: remember skipped paths for the session and re-prune them quietly, or log that case at `warn`. 🟤 candidate.
2. **String `logError` calls all log at ERROR**, warnings included (the skip line among them). After the normaliser they at least read as text; candidate: pass `{ level: 'warn', … }` at the sites that report expected conditions. 🟤 candidate.
3. **`showCompareMedia` leaves detached wrapper references in compare mode too** (spec F7): the tournament fast path now checks `isConnected`, but other readers of `leftMediaWrapper`/`rightMediaWrapper` (fullscreen, zoom) can still hold a detached div after a failed compare render. Candidate: null the fields where the wrappers are removed. 🟤 candidate.
4. **A coalesced pass after a failure-plus-request re-renders the same pair** (cleanup + rebuild of identical media — a flicker). Candidate: skip a pass whose engine pair equals the pair already painted, unless a failure marked it. 🟤 candidate; measure before acting.

## Residuals for Extract (found while planning — not fixed here)

- **Final-review minors, deferred** (→ BACKLOG 🟤 at closeout, one entry each): (1) Review Focus 5 was overstated — a failure after a pick but before teardown still skips the file (harmless); (2) the re-prune after an undo-past-skip toasts `File missing — removed from tournament: <full path>` for a file still on disk (pairs with Improvement 1); (3) the owner's promise waits on every pass that joins the loop, and `moveToSpecialFolder` holds `_fileOpInFlight` across it, so special moves are refused during rapid picking; (4) `_skipFailedTournamentFile`'s stale / already-skipped returns don't clear `isLoading` (unreachable per the reviewer's trace); (5) `normalizeRendererLogEntry` JSON-stringifies a message-less object (the spec said `String()`) and stringifies an object `message` as `[object Object]` — note in spec § 12.
- **"Both Win button records a win-win draw" intermittent click interception** — failed 1 of ~17 full-file runs on this branch (`.media-container` intercepts pointer events on `#tournamentBothWinBtn` for 30 s after the bottom chrome was revealed); unreproduced under trace; `main` 13/13. Not attributable to G3; if it recurs, capture the trace (`--trace=retain-on-failure`) before acting. → BACKLOG 🟤.

- **Input during a render still lands** — a pick, draw or undo pressed while a pass is in flight scores the engine's pair, which may not be on screen yet (spec F4, item 2). E3 even exercises it (its draw scores an unseen pair) without asserting on it. At closeout, rewrite 🟤 [2026-08-31] item 2 as unblocked (spec § 8).
- **`overlay-controls` and `visual-evidence` tournament tests still wait on `!isLoading`** after Start; harmless with their PNG-only fixtures (the first pair renders through `showCompareMedia`, which does set the flag), but `waitForTournamentIdle` is the correct sync point if either ever adds a fixture that fails. No action unless that happens.

## Closeout (after the merge, on `main`)

- [ ] **BACKLOG** (spec § 8): close 🟤 [2026-08-31] item 1 with the premise corrections (spec F1–F3); close 🟤 [2026-07-03] "fast-path re-entrancy … sibling JXL object URL" (by the owner) and 🟤 [2026-07-02] "`-1` bounded-retry has no direct unit test" (D7); annotate 🟤 [2026-07-02] "fast-path swap doesn't set `isLoading`"; rewrite 🟤 [2026-08-31] item 2 as **unblocked** (the primitive: `_tournamentRenderLoop` / its promise; the direction: G1's refuse-pick-or-draw-during-a-render precedent, undo with a notice or queued behind the owner's promise). Extract Improvements + Residuals under `### [YYYY-MM-DD] From: G3 closeout`.
- [ ] **`g2-serialization-wip`** (`b155374`): decide with evidence (lean: delete — its `_acquireTournamentRender` duplicates the owner and `_isForeignLoadInFlight()` changes a shipped guard). If deleting: strike its three doc pointers (BACKLOG item 2, the G2 spec's DEC-1 note, the archived G2 plan's Task 4 note), keep the measurement table, and **ask the user before `git push origin --delete g2-serialization-wip`**.
- [ ] DONE.md entry; WEEKLY Summary-Table Status → `✅ PR #N` + the Wednesday and Thursday G3 Daily-Schedule rows; archive this plan (`git mv` to `docs/archive/plans/`, indexed in `docs/README.md` Archived Plans); remove its row from [README.md](README.md) § Current Plans; spec § 12 post-implementation notes — all **in the closeout commit**.
- [ ] Closeout artifacts table ([README.md](README.md) § Closeout artifacts) — every row done or N/A with a reason.
- [ ] Propagation check: re-read every live surface this plan touched (CLAUDE.md lines 34/130/152/163/200, the code comments) for a late correction that did not reach it.
- [ ] Memory: session file + MEMORY.md line; durable lessons only.

## Progress Log

- **2026-10-07** — Brainstormed with the user (D1 scope: every tournament render-restart path, item 2 left as a decision; D6 `logError` ride-along; D3 auto-skip everywhere; D2 coalescing owner). Measured before designing: the tournament file 5/5 green on `main` (45/45), so the WEEKLY's five-run bar cannot fail on unfixed code; `tiny.mp4` is a 32-byte stub; the "third site" has been awaited since at least `ae9588d`; 54 string `logError` calls log `undefined`. Spec committed `bdada4c`, user-approved; plan written. Planning-time verifications: Playwright 1.58 `test.fail` semantics (Context7, `/microsoft/playwright`); the AI-seeding pair order (`buildAiSeedingPairings`, best vs worst → `roundQueue`); `engine.removeFile` and `removeFileFromList` are no-ops for an absent file; `showTournamentSummaryModal` is re-runnable; `'Skipping missing file'` is emitted from one place only; and Premise Corrections 1–2 above.
- **2026-10-07 — Execution mode**: user chose Native (inline, one final fresh reviewer).
- **2026-10-07 — Task 1** `4a7a1b1` — Phase 0 RED on unchanged code, each for its named reason (spec § 11): E1 fastMax 2 + 2 elements per wrapper; E2 tiny.mp4 still in both lists, `["❌ Failed to load video: tiny.mp4"]`; E3 fastMax 2, 2 per wrapper, `["Skipping missing file", "File missing — removed from tournament: …tiny.mp4"]` (real trigger via the `_buildTournamentSide` listener). Markers restored: 12 passed.
- **2026-10-07 — Task 2** `11f45aa` — RED: 7× `TypeError: logger.normalizeRendererLogEntry is not a function` + the wiring check. GREEN 36/36; suite 925.
- **2026-10-07 — Task 3** `34324c0` — RED: 4× `Could not find method: showTournamentPair` + 1× `_renderTournamentPairOnce`. Call sites after the split: 7 awaited (handlers/entry points), 2 un-awaited (JXL catch, error listener). Suite 930 (CHARACTERIZATION still green); E1 marker removed, file 12 passed (E2/E3 still expected-fail).
- **2026-10-07 — Task 4** `cfe29be` — unit RED 6× `_skipFailedTournamentFile` + 1× `_attachTournamentFailureListener`; E2E on Task-3 code: E4 `["Skipping undecodable JXL file", "File missing — … zz-bad.jxl"]`, E5 engine still holds the deleted pair + screen (blue, green) ≠ engine (red, normal), E6 summary hidden, E7 passed (by construction, as planned). GREEN: suite 937; tournament file 16 passed, no markers left. Lint 0 errors (2 pre-existing warnings), format clean.
- **2026-10-07 — Finish** — regression bar 5/5 (80/80); Acceptance 5 confirmed (skip line logged as text; no `[renderer] undefined` in 10 session logs); full E2E 91 passed / 4 skipped; lint 0 errors; `regression-checker`: no issues ≥ 80, compare mode unchanged.
- **2026-10-07 — Final review** (fresh Opus reviewer): 0 Critical / 0 Important / 8 Minor, "ready to merge". Re-graded by effect: Minor 4 → **Important** (an undo-restored skipped file that only draws byes would be tiered, so Apply moves it or fails) — fixed `45be916`, `_pruneUnlistedEngineFiles()` before both summary returns, 2 unit tests RED → GREEN, suite 939; Minor 1 + the wording half of Minor 5 → fixed as doc edits (KNOWN HOLES item 2; owner promise "resolves when no render is pending"). Five minors deferred (Residuals below). **Flake**: "Both Win button records a win-win draw" failed one full-file run (click intercepted by `.media-container` for 30 s) and one other run failed uncaptured; unreproduced under trace (20/20 isolated, 30/30 with its predecessor, 8/8 full-file), `main` control 13/13 — ruled not attributable to G3, carried as a residual.

## Key Discoveries

1. **Introducing the owner without converting the in-render callers creates a deadlock the old code did not have.** `_buildTournamentSide`'s JXL catch returned the render's promise into the outer `Promise.all` — harmless while renders could nest, a self-await once they cannot (Premise Correction 1). "Single-flight" and "nobody inside awaits it" have to land in the same commit.
2. **Event dispatch order decides what an "at the instant of failure" test measures.** Ancestor capture listeners run before the target's own listeners, with a microtask checkpoint between, so an action issued there wins the race against the failure handling it was meant to overlap (Premise Correction 2).
