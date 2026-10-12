# G2. Like-or-Skip Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G2 (🔵 🏆, 8 SP → ~10 SP); BACKLOG 🔵 [2026-10-04] "Add a bulk 'dislike the skipped files' action to single mode", "Show that the AI-sort order is out of date after ratings, and offer a one-click re-sort"
**Spec**: [2026-10-12-g2-like-or-skip-flow-design.md](../../superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md) (committed `d919f18`, user-approved 2026-10-12; amended at planning — see Premise Corrections 1–4)
**Created**: 2026-10-12
**Status**: In Progress — subagent-driven execution (user's choice, 2026-10-12)
**Last Updated**: 2026-10-12
**Branch**: `g2-like-or-skip-flow`
**Trial vehicle**: _You should know_ — enabled by the user 2026-10-12 (REVIEW-QUEUE § 5). Note every *Heads up* / *You should know* it raises in the Progress Log, with what happened to it; G6 reads it out.

**Goal:** On the AI order in single mode, every file the user passes with Next is remembered; `F` (or a button) plus one confirmation moves all of them to the dislike folder as one file action that one Ctrl+A undoes; and a "↻ Re-sort · N new" chip shows when the order is out of date and re-sorts without losing the skips.

**Architecture:** A new pure ES module `like-or-skip.js` holds the logic most likely to be wrong — the skip set, where the cursor lands after a batch, how an undo re-inserts files, how a re-sort parks skips, and the out-of-date count — and is unit-tested directly. `MediaViewer` keeps only IO and DOM glue: one order-change hook `_onOrderChanged(kind)` that every reorder of `mediaFiles` calls (enforced by a source-scan test), the guarded `dislikeSkippedFiles()` with its confirmation dialog, the `_undoSkipBatch()` branch of `handleCancel`, the button, the chip and the `F` binding. `media-viewer.js` imports the module as a namespace (`LikeOrSkip`) so extracted-method tests supply it through one global.

**Tech Stack:** Electron 39 renderer (`media-viewer.js`, ES module, no bundler), Vitest 4 (node environment, extract-method tests), Playwright + Electron E2E (`tests/e2e/`), Prettier 3, ESLint 9 flat config, Lucide icons via CDN.

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. The `PostToolUse` hook formats each edited JS file; lint-staged formats staged files at commit. `docs/` and `*.md` are Prettier-ignored. Code blocks below may wrap differently after formatting — that is expected.
- **ESLint**: `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; prefix unused with `_`), braces on multi-line `if` bodies. The renderer's `htmlSinkGuard`: `innerHTML` takes **only a static string** (a template literal with no `${}`); every dynamic value goes in through `textContent`.
- **Vitest runs in the node environment.** `MediaViewer` methods are tested by extracting their source and calling it with a mock `this`. An extracted method runs in the **global** scope: it sees `LikeOrSkip` only because the test file sets `globalThis.LikeOrSkip`, and every `this.*` it touches must be on the mock context.
- **Glue reaches the module two ways only**: the tracker instance as `this.likeOrSkip`, and pure functions as `LikeOrSkip.<name>(…)`. Never a bare imported name (an extracted method could not resolve it).
- **No guarded method calls another.** `dislikeSkippedFiles` must not call `moveCurrentFile`, `moveToSpecialFolder`, `handleCancel` or any other method that takes `_fileOpInFlight` — the inner call is silently refused. `_undoSkipBatch` takes no guard; it runs inside `handleCancel`'s.
- **Guard handoff** (CLAUDE.md § Async Patterns): a success branch that renders starts `showMedia()` **before** the `finally` releases `_fileOpInFlight` (`showSingleMedia` sets `isLoading` synchronously). A branch that renders nothing releases with nothing in flight.
- **Exact strings** (copied from the spec, plural via `LikeOrSkip.formatCount`):
  - Button label `Dislike ${count} skipped`; title `'Dislike all skipped files' + this._shortcutSuffix('single', 'dislikeSkipped')`.
  - Dialog title `` `Dislike ${count} skipped ${count === 1 ? 'file' : 'files'}?` `` → "Dislike 3 skipped files?" (not `formatCount`, whose word order would read "3 files skipped"). Body `They'll move to ${folderName}. One Undo${undoSuffix} brings them all back.`; on-screen line `Includes the file on screen.`; confirm `Move ${formatCount(count, 'file')}`; cancel `Cancel`.
  - Notices: `'Nothing skipped yet'` (`info`); `'Wait for the sort to finish'` (`info`); `'Configure like/dislike folders in Settings (F1)'` (`error`); `` `Moving ${formatCount(n, 'file')}…` `` (`info`, only when n > 50); `` `👎 Moved ${formatCount(n, 'file')} to ${folderName}` `` (`dislike`); partial via `showError`: `` `Moved ${moved} of ${total} — ${failed} failed: ${firstError}` ``; `` `Skipped list cleared (${formatCount(n, 'file')})` `` (`info`); `` `✅ Restored ${formatCount(n, 'file')}` `` (`success`); partial undo via `showError`: `` `Restored ${restored} of ${total} — ${failed} failed: ${firstError}` ``; `'Re-sorted by predicted preference'` (`success`).
  - Chip label `` `Re-sort · ${count} new` ``; title `` `${formatCount(count, 'rating')} since the last AI sort — re-sort to include them (retrains the model)` ``.
  - `DEFAULT_SHORTCUTS.single.dislikeSkipped = 'KeyF'`; `ACTION_LABELS.dislikeSkipped = 'Dislike all skipped'`.
  - History entry: `{ skipBatch: true, actionType: 'dislike', files, prevCurrentPath, orderGeneration }`.
  - IDs/classes: `#dislikeSkippedBtn` (`control-btn dislike-btn`), `#resortPredictionBtn` (`sort-prediction-btn resort-chip`), modal root `.bulk-dislike-modal`, `.bulk-dislike-btn-confirm`, `.bulk-dislike-btn-cancel`.
- **Every new test must fail against the code before its step lands** — record the failure message in the Progress Log. A RED test that passes is zero coverage: find out why before continuing. Tests that pass by construction are labelled where they appear.
- **E2E**: `workers: 1`; `afterEach` null guards (`if (electronApp)`, `if (tmpFixtures)`); `.media-container` blocks pointer events (use keys, `page.evaluate` or `{ force: true }`); a handler that guards on `isLoading`/`mediaNavigationInProgress`/`_fileOpInFlight` needs the app idle first (`waitForIdle`). The header and the controls bar fade to `opacity: 0` at rest — Playwright still counts them visible; screenshots add their `.show` class first.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Never `--no-verify`. Pre-push runs the full E2E suite for any non-docs push.
- **Grep rule (CLAUDE.md § Best Practices)**: when changing behaviour a comment describes, grep code, tests **and comments**, and re-read every comment attached to changed code.
- **Commits**: one per task; in subagent-driven mode the **controller** commits (memory: subagent commits vs the memory hook). Trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A skipped file deleted or renamed outside the app before `F`** — `moveFile` returns `ENOENT`. Expected: the other files still move; the failed file stays listed **and** skipped; the history entry holds only the files that moved; the notice names the error. Pinned in Task 3 (unit: `a failed rename does not stop the loop…`).
2. **A same-named file already in the dislike folder** — main suffixes ` (1)`. Expected: the history keeps the suffixed `newPath`; undo moves *that* path back and the file returns under its own name — or, if its name was taken in the source folder meanwhile, under `name (n).ext`, followed by the list, the caches and the cursor. Pinned in Task 4 (unit: `follows a restore that landed under a new name…`).
3. **Interleaved undo** — a Like made after a batch, then Ctrl+A twice. Expected: the first Ctrl+A reverses only the Like (single-file branch), the second the whole batch. Pinned in Task 4 (unit: `a Like made after the batch is undone first…`).
4. **The dislike folder vanished between configuring and pressing `F`**, and the user declines the create prompt. Expected: nothing moves, the guard is released, the skips are intact. Pinned in Task 3 (unit: `declining the create prompt moves nothing…`).
5. **A compare-mode excursion with skips pending.** Expected: in compare mode the button is hidden and `F` is Both bad (the mode-keyed reverse map), the `dislikeSkipped` action does nothing there, and back in single mode the button shows the same count. Pinned in Task 3 (unit: `updateDislikeSkippedButton` hide/show + `executeAction` gating).

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `like-or-skip.js` | Create | Pure: `SkipTracker`, `planCursorAfterBatch`, `planUndoReinsertion`, `formatCount` (T1); `trainingWeight`, `computeStaleCount` (T5); `parkSkippedOrder` (T6) |
| `media-viewer.js` | Modify | Namespace import, `likeOrSkip` + `_orderGeneration`, `_onOrderChanged`, skip recording in `nextMedia`, `forget` + `deferBulkSave` in `removeFileFromList`, hook calls at the seven reorder sites (T2); `dislikeSkipped` binding, `#dislikeSkippedBtn`, `updateDislikeSkippedButton`, `showBulkDislikeConfirm`, `dislikeSkippedFiles` (T3); `_undoSkipBatch` + its `handleCancel` dispatch (T4); `_staleMark`/`_pendingStaleMark`, `_updateResortChip`, chip refresh points (T5); `handleSortByPrediction({ resort })`, `applyPredictionSortResult(result, { resort })`, chip click (T6) |
| `index.html` | Modify | `#dislikeSkippedBtn` after `#dislikeBtn` (T3); `#resortPredictionBtn` after `#sortPredictionBtn` (T5) |
| `styles.css` | Modify | `.bulk-dislike-modal` shares the folder-creation shell, danger confirm (T3); `.resort-chip` (T5) |
| `eslint.config.mjs` | Modify | `like-or-skip.js` in block 2c (browser ES modules) (T1) |
| `tests/like-or-skip.test.js` | Create | Pure-module tests (T1, T5, T6) |
| `tests/like-or-skip-glue.test.js` | Create | Glue tests: order hook + source-scan control, skip recording, `forget`/`deferBulkSave` (T2); `dislikeSkippedFiles`, `updateDislikeSkippedButton` (T3); `_undoSkipBatch`, `handleCancel` dispatch (T4); marks, `_updateResortChip` (T5) |
| `tests/media-viewer-utils.test.js` | Modify | `globalThis.LikeOrSkip`; stubs in existing contexts (T2, T5); re-sort tests beside the existing `handleSortByPrediction` / `applyPredictionSortResult` blocks (T5, T6) |
| `tests/keyboard-shortcuts.test.js` | Modify | Single-mode shape, reverse map, collision, repeat filter, `executeAction`, seven save/reset contexts (T3) |
| `tests/e2e/like-or-skip.test.js` | Create | The flow, held `F` + stray keys, a video in the batch (T3); undo (T4); the chip (T5) |
| `tests/e2e/visual-evidence.test.js` | Modify | Opt-in like-or-skip evidence block (T1 before, T7 after) |
| `docs/superpowers/specs/assets/g2-like-or-skip-*.png` | Create | `single-before` (T1); `single-after`, `dialog-after` (T7) |
| `CLAUDE.md` | Modify | Architecture tree, Cache Management, State Management (T2); Async Patterns guard list, Keyboard Shortcuts, UI Components (T3); compare-pair-undo bullet (T4); like-or-skip bullet (T5); `predictionScores` sync bullet, tree line (T6) |
| `README.md` | Modify | Single-mode shortcut table → the real defaults (T3; see Premise Corrections 5) |
| `docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md` | Modify | Amendments at planning (committed with this plan) |
| `docs/README.md`, `docs/planning/plans/README.md` | Modify | This plan under Active Plans / Current Plans (committed with this plan) |

**Live-surface preflight** (plans README step 4) — every live surface asserting a claim G2 changes, diffed against the table above: `CLAUDE.md` § Architecture tree (no `like-or-skip.js`) ✅ T2/T6; § Cache Management `removeFileFromList()` bullet (cleanup list, "currentIndex adjustment") ✅ T2/T3; § Async Patterns "`_fileOpInFlight` is held by …" (five methods) ✅ T3; § Keyboard Shortcuts "Single mode's `special` … is additive" ✅ T3; § UI Components ✅ T3; § State Management compare-pair-undo bullet ("checks bulk-rating undo FIRST") ✅ T4; `predictionScores` sync bullet (`applyPredictionSortResult(result)`) ✅ T6; `media-viewer.js` constructor comment on `_fileOpInFlight` (names the guarded methods) ✅ T3; `removeFileFromList` JSDoc (cleanup list) ✅ T2; `applyPredictionSortResult` / `handleSortByPrediction` comments ("Toggle off — restore original order") ✅ T6; `README.md` § Basic Navigation (claims `F` = Like) ✅ T3. **Checked, no claim to change**: `PROJECT.md` (lists manager extractions — `like-or-skip.js` is a pure module, not a manager; its "~9,400 lines" is owned by the 🟤 [2026-09-02] derived-value sweep), `docs/ARCHITECTURE.md` (its file tree already omits every extracted module — Residual), the F1 help overlay (rendered from `shortcuts.single` + `ACTION_LABELS`). **Not changed, deliberately**: BACKLOG / WEEKLY / TODO (checked off at closeout, not rewritten).

---

## Premise Corrections Made at Planning

1. **The out-of-date count needs no undo hook (spec amended).** The approved § 8 mechanism (`reconcileMarkAfterUndo` in `handleCancel`'s `finally`) would have added a call to every `handleCancel` test context (four describes, fifteen calls) and a prefix comparison an in-place history splice could misalign. The mark is now a **snapshot of `moveHistory`'s entry references**; the count is the weighted symmetric difference by identity. Same semantics, same accepted overcount, nothing in `handleCancel`.
2. **Render rule made explicit (spec amended).** § 6 step 9 said "render iff torn down"; an *image* on screen that moves is not torn down but still shows a file that is gone. The rule is: render iff the file on screen moved **or** its media was torn down.
3. **A batch is refused while a sort runs, and its cursor is mapped by path (spec amended).** A chip re-sort can be running while the AI order is on screen; its `applyPredictionSortResult` reassigns `mediaFiles` and renders — even while the batch dialog is open (`showMedia` gates on `isLoading`, not `_fileOpInFlight`). So `dislikeSkippedFiles` refuses with `'Wait for the sort to finish'` while `isPredictionSorting || isComputingHashes`, and `planCursorAfterBatch` returns a **path** the glue maps onto the list as it is after the renames, not an index into the pre-batch list.
4. **A partial undo needs shifted indices (spec amended).** Re-inserting the restored files at their original indices is exact only when *every* file came back: with `a(0) b(1) c(2)` before `d` and `b` failing, `c` inserted at 2 into `[a, d]` lands after `d`. `planUndoReinsertion` takes `missing` (the original indices that did not come back) and shifts each position down by the missing indices before it.
5. **`README.md`'s shortcut table is stale and names `F`.** It lists `Enter / F` = Like, `Space / J` = Dislike, arrows, `Backspace / Z` = Undo — none of them the real single-mode defaults (Q, W, S, A, Ctrl+A, `1`). With `F` becoming "Dislike all skipped", the table would contradict the app on the very key; Task 3 rewrites it from `DEFAULT_SHORTCUTS.single`.
6. **The batch `forget`s through `removeFileFromList`, so four existing contexts need `likeOrSkip`** — `createContext` (`tests/media-viewer-utils.test.js` ~L321), `makeCtx` in "removeFileFromList bulk-rated purge" (~L2293), the inline ctx in "removeFileFromList prunes bulkRatedPairs keys…" (~L2439) and `cacheCtx` (~L2465). Also: `guardCtx` (~L6930, `nextMedia`), `baseCtx` in "applyPredictionSortResult" (~L949, `_onOrderChanged`), `makeCtx` in the `handleSortByPrediction` block (~L1331, `_onOrderChanged`, and in T5 `moveHistory`), `makeCtx` in the `loadFolder` block (~L4032, `_onOrderChanged`), and the seven `saveShortcut`/`resetShortcuts` contexts in `tests/keyboard-shortcuts.test.js` (~L878, 910, 931, 977, 1009, 1062, 1082 — each beside `updateSpecialButtonsState: vi.fn()`). Not optional chaining: production calls these unconditionally.
7. **The new glue tests get their own file with a 15-line `extract()` helper.** `tests/media-viewer-utils.test.js` is 7,859 lines, and three test files already carry their own extraction helpers (`media-viewer-utils`, `keyboard-shortcuts`, `ml-pair-selection`) — a fourth follows precedent. Re-sort tests stay in `media-viewer-utils` because they reuse its 70-line `handleSortByPrediction` context.
8. **The enclosing methods of every `this.mediaFiles =` assignment were measured** (`main` @ `15cec8c`): `constructor` L81, `setupEventListeners` L2098 (change-folder handler, then `loadFolder`), `loadFolder` L2992/L3003, `restoreOriginalOrderForTournament` L4740, `handleSortBySimilarity` L6180/L6411/L6439, `applyCachedSortOrder` L6900, `insertNewFilesInSortedOrder` L7048 (both inside the similarity sort's cache path), `applyPredictionSortResult` L7554, `handleSortByPrediction` L8499. The control test's lists are exactly these.

## Task Ordering

T1 (pure module + "before" evidence) first — the before screenshot must be taken before any renderer change. T2 (order hook + tracking) before T3 (the batch reads the tracker). T4 (undo) after T3 (it undoes T3's entry). **T5–T6 are the out-of-date hint — the WEEKLY's first drop on overrun**: nothing in T1–T4 depends on them, and T7 runs either way (its after-shot then simply has no chip). T5 (count + chip display) before T6 (re-sort + chip click) — the chip is not clickable until T6, because before T6 `handleSortByPrediction` on a sorted list means Restore Order. One commit per task.

**Model and effort** (WORKFLOW.md § 1.0):

| | Choice | Why |
|---|---|---|
| SP | 8 → ~10 | Spec § 13: module 2, hook + tracking 1, batch + dialog + button + `F` 2, undo 1.5, count + chip 1.5, re-sort 1, evidence + docs 1. 1.25× — inside the 2× abort line. |
| Execution | **Opus 5.5 · `medium`** for T2–T6 (guard handoff, cursor and re-insertion rules, the re-sort snapshot — easy to get subtly wrong); **Sonnet 5.5 · `medium`** for T1 and T7 (fully spelled out: pure functions with their tests, screenshot capture) | The § 1.0 8+ SP row starts Opus · `high`; execution steps down to `medium` because the plan carries the design. Escalate to `high` for any RED test that unexpectedly passes. |
| Switch | Effort to `medium` now (`/effort medium`; the cache survives). Subagent-driven picks the model per task, so no session model switch. | The brainstorm and plan ran at a higher effort; execution does not need it. |
| Final review | Deep: `/code-review max` on the branch diff + the `regression-checker` agent on `media-viewer.js` | The largest single file move the app makes; WEEKLY's first guess, confirmed. |

---

## Task 1: Pure module (skip set, batch and undo plans) + "before" evidence

**Files:**
- Modify: `tests/e2e/visual-evidence.test.js` (append a describe block)
- Create: `docs/superpowers/specs/assets/g2-like-or-skip-single-before.png`
- Create: `like-or-skip.js`
- Create: `tests/like-or-skip.test.js`
- Modify: `eslint.config.mjs:160` (block 2c `files`)

**Interfaces:**
- Consumes: nothing.
- Produces (exact):
  - `class SkipTracker { active: boolean; skipped: Set<string>; activate({ keepSkips = false } = {}): void; deactivate(): void; recordSkip(path: string): void; forget(path: string): void; restore(path: string): void; skippedIn(mediaFiles: Array<{path}>): Array<file> }`
  - `planCursorAfterBatch(filesBefore: Array<{path}>, movedPaths: Set<string>, currentIndex: number): string | null` — a path, or `null` when nothing survived.
  - `planUndoReinsertion(mediaFiles: Array, restored: Array<{ file, originalIndex: number }>, { orderUnchanged: boolean, missing?: number[] }): Array` — a new array.
  - `formatCount(n: number, noun: string): string` — `"1 file"`, `"3 files"`.

- [ ] **Step 1: Add the opt-in like-or-skip evidence block** — append to `tests/e2e/visual-evidence.test.js` (after the existing `test.describe('G2 visual evidence', …)` block; reuse the file's existing imports):

```js
// G2 like-or-skip (2026-10-12, spec docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md):
// the same scenario on both runs — AI order, three skips, one Like — so the before/after pair differs
// only by the feature. Opt-in, like the block above: a plain E2E run must never overwrite the
// committed PNGs. Capture: LIKE_OR_SKIP_EVIDENCE_STAGE=before|after npx playwright test
// tests/e2e/visual-evidence.test.js -g "like-or-skip"
const LOS_STAGE = process.env.LIKE_OR_SKIP_EVIDENCE_STAGE;

test.describe('G2 like-or-skip visual evidence', () => {
    test.skip(!LOS_STAGE, 'Opt-in only — set LIKE_OR_SKIP_EVIDENCE_STAGE=before|after to (re)capture');

    let electronApp, page, tmpFixtures;

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    const idle = () =>
        page.waitForFunction(
            () =>
                !window.mediaViewer.isLoading &&
                !window.mediaViewer.mediaNavigationInProgress &&
                !window.mediaViewer._fileOpInFlight
        );

    test('like-or-skip: single mode on the AI order after three skips and one Like', async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png']);
        await tmpFixtures.addFile('red-copy.png');
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await idle();

        const order = ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'red-copy.png', 'normal-320x240.png'];
        await page.evaluate((names) => {
            const scores = Object.fromEntries(names.map((n, i) => [n, 0.9 - i * 0.1]));
            window.mediaViewer.applyPredictionSortResult({ sortedFilenames: names, scores });
        }, order);
        await page.waitForFunction(() => window.mediaViewer.currentMedia !== null);
        await idle();

        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('s');
            await idle();
        }
        await page.keyboard.press('q'); // Like red-copy.png — the training set changes, so the chip has a count
        await idle();

        // The header and the controls bar fade to opacity 0 at rest; reveal both for the shot.
        await page.evaluate(() => {
            document.querySelector('.header').classList.add('show');
            document.getElementById('controls').classList.add('show');
        });
        await page.waitForTimeout(500);
        await captureScreenshot(page, `g2-like-or-skip-single-${LOS_STAGE}`);

        if (LOS_STAGE === 'after') {
            await page.keyboard.press('f');
            await page.locator('.bulk-dislike-modal').waitFor();
            await page.waitForTimeout(300);
            await captureScreenshot(page, 'g2-like-or-skip-dialog-after');
            await page.keyboard.press('Escape');
        }
    });
});
```

- [ ] **Step 2: Capture the "before" screenshot on the unchanged renderer**

Run (PowerShell): `$env:LIKE_OR_SKIP_EVIDENCE_STAGE='before'; npx playwright test tests/e2e/visual-evidence.test.js -g "like-or-skip"; $env:LIKE_OR_SKIP_EVIDENCE_STAGE=$null`
Expected: 1 passed; `docs/superpowers/specs/assets/g2-like-or-skip-single-before.png` exists. Open it (Read tool) and confirm: `normal-320x240.png` on screen, the single-mode bar with Zoom/Special/Undo/Like/Dislike and **no** "Dislike N skipped" button, the header with "Restore Order" and **no** re-sort chip. Then confirm the plain run skips it: `npx playwright test tests/e2e/visual-evidence.test.js` → the like-or-skip test reports skipped.

- [ ] **Step 3: Write the failing pure-module tests** — create `tests/like-or-skip.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { SkipTracker, planCursorAfterBatch, planUndoReinsertion, formatCount } from '../like-or-skip.js';

const file = (name) => ({ name, path: `/f/${name}` });
const files = (...names) => names.map(file);
const pathsOf = (list) => new Set(list.map((f) => f.path));
const names = (list) => list.map((f) => f.name);

describe('SkipTracker', () => {
    it('records nothing while inactive', () => {
        const t = new SkipTracker();
        t.recordSkip('/f/a');
        t.restore('/f/b');
        expect(t.active).toBe(false);
        expect(t.skipped.size).toBe(0);
    });

    it('records skips once active, and a fresh activation empties the set', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.recordSkip('/f/a');
        expect([...t.skipped]).toEqual(['/f/a']);
        t.activate();
        expect(t.skipped.size).toBe(0);
        expect(t.active).toBe(true);
    });

    it('a re-sort activation keeps the skips (spec D2)', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.activate({ keepSkips: true });
        expect([...t.skipped]).toEqual(['/f/a']);
    });

    it('deactivate stops tracking and drops the skips', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.deactivate();
        expect(t.active).toBe(false);
        expect(t.skipped.size).toBe(0);
    });

    it('forget drops a path in any state; restore re-adds only while active', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/a');
        t.forget('/f/a');
        expect(t.skipped.size).toBe(0);
        t.restore('/f/a');
        expect([...t.skipped]).toEqual(['/f/a']);
    });

    it('skippedIn returns the listed skips in list order, never an unlisted path', () => {
        const t = new SkipTracker();
        t.activate();
        t.recordSkip('/f/c');
        t.recordSkip('/f/a');
        t.recordSkip('/f/gone');
        expect(names(t.skippedIn(files('a', 'b', 'c')))).toEqual(['a', 'c']);
    });
});

describe('planCursorAfterBatch', () => {
    const list = files('a', 'b', 'c', 'd', 'e');

    it('follows the file on screen when it survives, with moved files before and after it', () => {
        expect(planCursorAfterBatch(list, pathsOf([list[0], list[1], list[4]]), 2)).toBe('/f/c');
    });

    it('lands on the first survivor after the file on screen when it moved', () => {
        expect(planCursorAfterBatch(list, pathsOf([list[0], list[1]]), 1)).toBe('/f/c');
        expect(planCursorAfterBatch(list, pathsOf([list[2]]), 2)).toBe('/f/d');
    });

    it('wraps to the first survivor when nothing survives after the file on screen', () => {
        expect(planCursorAfterBatch(list, pathsOf([list[3], list[4]]), 4)).toBe('/f/a');
    });

    it('returns null when every file moved', () => {
        expect(planCursorAfterBatch(list, pathsOf(list), 3)).toBeNull();
    });
});

describe('planUndoReinsertion', () => {
    it('rebuilds the exact pre-batch order when nothing was reordered', () => {
        const before = files('a', 'b', 'c', 'd', 'e');
        const after = [before[2], before[4]]; // a, b and d moved
        const restored = [
            { file: before[3], originalIndex: 3 },
            { file: before[0], originalIndex: 0 },
            { file: before[1], originalIndex: 1 },
        ];
        expect(names(planUndoReinsertion(after, restored, { orderUnchanged: true }))).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('shifts each position past the files that did not come back (partial undo)', () => {
        const before = files('a', 'b', 'c', 'd'); // a, b, c skipped; d on screen
        const restored = [
            { file: before[0], originalIndex: 0 },
            { file: before[2], originalIndex: 2 },
        ];
        const result = planUndoReinsertion([before[3]], restored, { orderUnchanged: true, missing: [1] });
        expect(names(result)).toEqual(['a', 'c', 'd']);
    });

    it('parks the restored files at the front, in their original order, after a reorder', () => {
        const restored = [
            { file: file('b'), originalIndex: 4 },
            { file: file('a'), originalIndex: 1 },
        ];
        expect(names(planUndoReinsertion(files('x', 'y'), restored, { orderUnchanged: false }))).toEqual([
            'a',
            'b',
            'x',
            'y',
        ]);
    });

    it('clamps an index past the end', () => {
        const result = planUndoReinsertion(files('x'), [{ file: file('a'), originalIndex: 9 }], { orderUnchanged: true });
        expect(names(result)).toEqual(['x', 'a']);
    });

    it('does not mutate its inputs', () => {
        const current = files('x');
        const restored = [{ file: file('a'), originalIndex: 0 }];
        planUndoReinsertion(current, restored, { orderUnchanged: true });
        expect(names(current)).toEqual(['x']);
        expect(restored).toHaveLength(1);
    });
});

describe('formatCount', () => {
    it('pluralises everything but one', () => {
        expect(formatCount(1, 'file')).toBe('1 file');
        expect(formatCount(3, 'file')).toBe('3 files');
        expect(formatCount(0, 'rating')).toBe('0 ratings');
    });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run tests/like-or-skip.test.js`
Expected: FAIL — the suite cannot load `../like-or-skip.js` (e.g. `Failed to load url ../like-or-skip.js` / `Cannot find module`). Record the message.

- [ ] **Step 5: Create `like-or-skip.js`**

```js
// Like-or-skip flow (G2) — pure logic: no DOM, no IPC, no MediaViewer state.
// Spec: docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md
// media-viewer.js imports this file as a namespace (`import * as LikeOrSkip`), so an extracted-method
// unit test supplies every function through one global (`globalThis.LikeOrSkip`).

/**
 * The files the user passed with Next while the AI order was on screen (spec § 5).
 * `active` is the feature's own "the AI order is what's on screen" token. It is deliberately not
 * isSortedByPrediction, which the similarity sort leaves set (spec F5).
 */
export class SkipTracker {
    constructor() {
        this.active = false;
        /** @type {Set<string>} file paths */
        this.skipped = new Set();
    }

    /** The AI order was applied. A fresh sort starts empty; a chip re-sort keeps the skips (spec D2). */
    activate({ keepSkips = false } = {}) {
        this.active = true;
        if (!keepSkips) this.skipped.clear();
    }

    /** The order on screen is no longer the AI order: tracking stops and the skips are dropped. */
    deactivate() {
        this.active = false;
        this.skipped.clear();
    }

    recordSkip(path) {
        if (this.active) this.skipped.add(path);
    }

    /** The file left the list (rated, moved or removed). */
    forget(path) {
        this.skipped.delete(path);
    }

    /** A batch undo put the file back: a skip again, but only while tracking is on. */
    restore(path) {
        if (this.active) this.skipped.add(path);
    }

    /** The skipped files still in `mediaFiles`, in list order — the only source of the count. */
    skippedIn(mediaFiles) {
        if (this.skipped.size === 0) return [];
        return mediaFiles.filter((f) => this.skipped.has(f.path));
    }
}

/**
 * Where the cursor lands after a batch removed `movedPaths` (spec § 6 step 8). Returns a PATH, not an
 * index: the caller maps it onto the list as it stands when the batch finishes, so nothing depends on
 * the list keeping its pre-batch order across the renames' awaits.
 * - the file on screen survived → that file;
 * - it moved → the first survivor after it in the pre-batch order, else the first survivor
 *   (moveCurrentFile's wrap-to-start);
 * - nothing survived → null.
 */
export function planCursorAfterBatch(filesBefore, movedPaths, currentIndex) {
    const survivors = filesBefore.filter((f) => !movedPaths.has(f.path));
    if (survivors.length === 0) return null;
    const onScreen = filesBefore[currentIndex];
    if (onScreen && !movedPaths.has(onScreen.path)) return onScreen.path;
    for (let i = currentIndex + 1; i < filesBefore.length; i++) {
        if (!movedPaths.has(filesBefore[i].path)) return filesBefore[i].path;
    }
    return survivors[0].path;
}

/**
 * The list after a batch undo puts `restored` ({ file, originalIndex }) back (spec § 7 step 2).
 * With no reorder since the batch, ascending re-insertion rebuilds the pre-batch order exactly; each
 * position is shifted down by the batch files that did not come back (`missing`, original indices),
 * which would otherwise have held the earlier slots. After a reorder the original indices mean
 * nothing, so the files are parked at the front in their original order — where skips live. Pure.
 */
export function planUndoReinsertion(mediaFiles, restored, { orderUnchanged, missing = [] }) {
    const ascending = [...restored].sort((a, b) => a.originalIndex - b.originalIndex);
    if (!orderUnchanged) return [...ascending.map((r) => r.file), ...mediaFiles];
    const result = [...mediaFiles];
    for (const { file, originalIndex } of ascending) {
        const position = originalIndex - missing.filter((m) => m < originalIndex).length;
        result.splice(Math.min(position, result.length), 0, file);
    }
    return result;
}

/** "1 file", "3 files" — the user-facing counts of this flow. */
export function formatCount(n, noun) {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
```

- [ ] **Step 6: Add the module to ESLint block 2c** — in `eslint.config.mjs`, change
`files: ['fullscreen.js', 'tournament-engine.js', 'tournament.js', 'ml-training.js'],` to
`files: ['fullscreen.js', 'tournament-engine.js', 'tournament.js', 'ml-training.js', 'like-or-skip.js'],`

- [ ] **Step 7: Run the tests and lint**

Run: `npx vitest run tests/like-or-skip.test.js` → Expected: PASS (16 tests).
Run: `npx eslint like-or-skip.js tests/like-or-skip.test.js tests/e2e/visual-evidence.test.js` → Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add like-or-skip.js tests/like-or-skip.test.js eslint.config.mjs tests/e2e/visual-evidence.test.js docs/superpowers/specs/assets/g2-like-or-skip-single-before.png
git commit -m "feat(like-or-skip): pure skip tracker and batch/undo plans; before evidence (G2 T1)"
```

---

## Task 2: Order-change hook and skip tracking

**Files:**
- Modify: `media-viewer.js` — import (top), constructor (after the `_fileOpInFlight` field ~L110), `removeFileFromList` (~L1367-1401), new `_onOrderChanged` after `_bulkPairKeysReferencing` (~L1414), `nextMedia` (~L1621-1623), `loadFolder` (~L2996, ~L3016), `restoreOriginalOrderForTournament` (~L4743), `handleSortBySimilarity` (~L6180, ~L6243, ~L6421, ~L6439), `applyPredictionSortResult` (~L7556), `handleSortByPrediction` toggle-off (~L8501)
- Create: `tests/like-or-skip-glue.test.js`
- Modify: `tests/media-viewer-utils.test.js` (top imports + the contexts in Premise Corrections 6)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `LikeOrSkip.SkipTracker`, `LikeOrSkip.formatCount` (T1).
- Produces: `this.likeOrSkip` (a `SkipTracker`); `this._orderGeneration` (number); `_onOrderChanged(kind: 'ai-fresh' | 'ai-resort' | 'other' | 'folder'): void`; `removeFileFromList(filePath, { deferBulkSave = false } = {})` (returns the old index, as today).

- [ ] **Step 1: Create the glue test file with the hook, recording, forget and control tests** — `tests/like-or-skip-glue.test.js`:

```js
// G2 like-or-skip glue (spec docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md):
// the MediaViewer methods that connect like-or-skip.js to the app, tested by extracting their source.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as LikeOrSkip from '../like-or-skip.js';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'media-viewer.js'), 'utf-8');

// media-viewer.js imports the module as a namespace. An extracted method runs in the global scope, so
// it resolves `LikeOrSkip` through the global object.
globalThis.LikeOrSkip = LikeOrSkip;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const METHOD_HEADER = /^ {4}(async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{\s*$/;
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function']);

/** A MediaViewer method as a callable (the technique of media-viewer-utils.test.js, sync or async). */
function extract(name) {
    const match = source.match(new RegExp(`^ {4}(async\\s+)?${name}\\(([^)]*)\\)\\s*\\{`, 'm'));
    if (!match) throw new Error(`Could not find method: ${name}`);
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) {
            const Ctor = match[1] ? AsyncFunction : Function;
            return new Ctor(match[2], source.slice(open + 1, i));
        }
    }
    throw new Error(`Unbalanced braces in: ${name}`);
}

const media = (...names) => names.map((n) => ({ name: n, path: `/f/${n}`, size: 10, type: 'image/jpeg' }));
const activeTracker = (...skippedPaths) => {
    const t = new LikeOrSkip.SkipTracker();
    t.activate();
    for (const p of skippedPaths) t.recordSkip(p);
    return t;
};

describe('_onOrderChanged — the one place a reorder is announced (spec § 4)', () => {
    const onOrderChanged = extract('_onOrderChanged');

    function hookCtx(overrides = {}) {
        return {
            _orderGeneration: 0,
            likeOrSkip: new LikeOrSkip.SkipTracker(),
            mediaFiles: media('a', 'b', 'c'),
            moveHistory: [],
            _staleMark: null,
            _pendingStaleMark: null,
            showNotification: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('a fresh AI sort turns tracking on with an empty set and bumps the generation', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a') });
        onOrderChanged.call(ctx, 'ai-fresh');
        expect(ctx.likeOrSkip.active).toBe(true);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
        expect(ctx._orderGeneration).toBe(1);
    });

    it('a re-sort keeps the skips', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a') });
        onOrderChanged.call(ctx, 'ai-resort');
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/a']);
    });

    it('leaving the AI order clears the skips and says how many', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a', '/f/c') });
        onOrderChanged.call(ctx, 'other');
        expect(ctx.likeOrSkip.active).toBe(false);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
        expect(ctx.showNotification).toHaveBeenCalledWith('Skipped list cleared (2 files)', 'info');
    });

    it('a folder change clears silently', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker('/f/a') });
        onOrderChanged.call(ctx, 'folder');
        expect(ctx.likeOrSkip.active).toBe(false);
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });

    it('no notice when nothing was skipped', () => {
        const ctx = hookCtx({ likeOrSkip: activeTracker() });
        onOrderChanged.call(ctx, 'other');
        expect(ctx.showNotification).not.toHaveBeenCalled();
    });
});

describe('nextMedia records a skip on the AI order (spec § 5)', () => {
    const nextMedia = extract('nextMedia');

    function navCtx(overrides = {}) {
        return {
            mediaFiles: media('a', 'b', 'c'),
            currentIndex: 0,
            isLoading: false,
            mediaNavigationInProgress: false,
            _fileOpInFlight: false,
            isCompareMode: false,
            isSortedByPrediction: true,
            mlComparePairIndex: 0,
            computeValidComparePairs: () => [],
            likeOrSkip: activeTracker(),
            signalUserActivity: vi.fn(),
            showMedia: vi.fn(),
            showDropZone: vi.fn(),
            ...overrides,
        };
    }

    it('records the file being left', () => {
        const ctx = navCtx();
        nextMedia.call(ctx);
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/a']);
        expect(ctx.currentIndex).toBe(1);
    });

    it('records nothing while tracking is off', () => {
        const ctx = navCtx({ likeOrSkip: new LikeOrSkip.SkipTracker() });
        nextMedia.call(ctx);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });

    it('records nothing for a refused Next (a render or a file action in flight)', () => {
        for (const flag of ['isLoading', 'mediaNavigationInProgress', '_fileOpInFlight']) {
            const ctx = navCtx({ [flag]: true });
            nextMedia.call(ctx);
            expect(ctx.likeOrSkip.skipped.size, flag).toBe(0);
        }
    });

    it('records nothing on a one-file list (Next goes nowhere)', () => {
        const ctx = navCtx({ mediaFiles: media('a') });
        nextMedia.call(ctx);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });

    it('records nothing in compare mode', () => {
        const ctx = navCtx({ isCompareMode: true });
        nextMedia.call(ctx);
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });
});

describe('removeFileFromList forgets the skip and can defer the bulk-rated save', () => {
    const removeFileFromList = extract('removeFileFromList');

    function listCtx(overrides = {}) {
        return {
            mediaFiles: media('a', 'b'),
            currentIndex: 0,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map([['a', 'good']]),
            bulkRatedPairs: new Set(),
            _bulkPairKeysReferencing: () => [],
            saveBulkRatedFile: vi.fn(),
            likeOrSkip: activeTracker('/f/a', '/f/b'),
            ...overrides,
        };
    }

    it('drops the removed path from the skipped set', () => {
        const ctx = listCtx();
        removeFileFromList.call(ctx, '/f/a');
        expect([...ctx.likeOrSkip.skipped]).toEqual(['/f/b']);
    });

    it('still saves the bulk-rated file by default', () => {
        const ctx = listCtx();
        removeFileFromList.call(ctx, '/f/a');
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('defers the save under { deferBulkSave: true }, still dropping the entry', () => {
        const ctx = listCtx();
        removeFileFromList.call(ctx, '/f/a', { deferBulkSave: true });
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
        expect(ctx.bulkRated.has('a')).toBe(false);
    });
});

describe('every reorder of mediaFiles goes through _onOrderChanged (spec § 4 control)', () => {
    // Methods that put a new ORDER of mediaFiles on screen. Each must call the hook.
    const ORDER_CHANGERS = [
        'loadFolder',
        'restoreOriginalOrderForTournament',
        'handleSortBySimilarity',
        'applyPredictionSortResult',
        'handleSortByPrediction',
    ];
    // Reviewed exemptions: assignments that are not a new order on screen, and why.
    const EXEMPT = {
        constructor: 'the initial empty list',
        setupEventListeners: 'the change-folder handler empties the list; loadFolder then announces the folder',
        applyCachedSortOrder: "runs inside handleSortBySimilarity's cache path, which announces on success",
        insertNewFilesInSortedOrder: 'runs inside applyCachedSortOrder (same)',
    };

    const lines = source.split('\n');
    const headerName = (line) => {
        const h = line.match(METHOD_HEADER);
        return h && !NOT_METHODS.has(h[2]) ? h[2] : null;
    };

    function assignmentSites() {
        const sites = new Set();
        let method = null;
        for (const line of lines) {
            method = headerName(line) ?? method;
            if (/\bthis\.mediaFiles = /.test(line)) sites.add(method);
        }
        return sites;
    }

    // From a method's header to the next method header — no brace counting, so string contents
    // cannot throw it off.
    function methodSlice(name) {
        const start = lines.findIndex((l) => headerName(l) === name);
        if (start === -1) throw new Error(`Could not find method: ${name}`);
        let end = start + 1;
        while (end < lines.length && !headerName(lines[end])) end++;
        return lines.slice(start, end).join('\n');
    }

    it('every method that assigns this.mediaFiles is a known order-changer or a reviewed exemption', () => {
        const unknown = [...assignmentSites()].filter((m) => !ORDER_CHANGERS.includes(m) && !(m in EXEMPT));
        expect(unknown).toEqual([]);
    });

    it('every order-changer calls _onOrderChanged', () => {
        expect(ORDER_CHANGERS.filter((m) => !methodSlice(m).includes('this._onOrderChanged('))).toEqual([]);
    });

    it('every listed method still assigns this.mediaFiles (no stale entries)', () => {
        const sites = assignmentSites();
        expect([...ORDER_CHANGERS, ...Object.keys(EXEMPT)].filter((m) => !sites.has(m))).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/like-or-skip-glue.test.js`
Expected: FAIL — `Could not find method: _onOrderChanged` (hook block); `nextMedia` "records the file being left" (`expected [] to deeply equal [ '/f/a' ]`); `removeFileFromList` "drops the removed path" and "defers the save"; control test 2 lists all five order-changers. Control tests 1 and 3 **pass by construction** (the lists match today's sites — Premise Corrections 8); they are the guard that stays. Record the messages.

- [ ] **Step 3: Import the module and add the constructor fields** — in `media-viewer.js`, after `import { MlTrainingManager } from './ml-training.js';` add:

```js
import * as LikeOrSkip from './like-or-skip.js';
```

and in the constructor, directly after the `this._fileOpInFlight = false;` line:

```js
        // Like-or-skip (G2): the files passed with Next while the AI order is on screen, and that token
        // itself (likeOrSkip.active). Changed only by _onOrderChanged, nextMedia and removeFileFromList
        // (spec §§ 4–5).
        this.likeOrSkip = new LikeOrSkip.SkipTracker();
        // Bumped by every reorder of mediaFiles. A batch undo restores exact positions only when no
        // reorder happened since the batch (spec § 7).
        this._orderGeneration = 0;
```

- [ ] **Step 4: Add `_onOrderChanged`** — directly after the closing brace of `_bulkPairKeysReferencing(fileName) { … }`:

```js
    // The one place a new ORDER of mediaFiles is announced (G2 spec § 4). Every method that puts a new
    // order on screen calls it; tests/like-or-skip-glue.test.js fails on a `this.mediaFiles =` outside
    // its reviewed list, so a new order-changing site cannot skip it silently.
    // 'ai-fresh' / 'ai-resort' turn like-or-skip tracking on (skips emptied / kept); 'other' / 'folder'
    // turn it off — 'other' tells the user how many un-disliked skips it discarded.
    _onOrderChanged(kind) {
        this._orderGeneration++;
        if (kind === 'ai-fresh' || kind === 'ai-resort') {
            this.likeOrSkip.activate({ keepSkips: kind === 'ai-resort' });
        } else {
            const discarded = this.likeOrSkip.skippedIn(this.mediaFiles).length;
            this.likeOrSkip.deactivate();
            if (discarded > 0 && kind !== 'folder') {
                this.showNotification(`Skipped list cleared (${LikeOrSkip.formatCount(discarded, 'file')})`, 'info');
            }
        }
    }
```

- [ ] **Step 5: Record the skip in `nextMedia`** — replace the single-mode branch

```js
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.mediaFiles.length;
        }
        this.showMedia();
```

with

```js
        } else {
            // Like-or-skip (G2): leaving a file with Next on the AI order records it as skipped. After the
            // guards above, so a refused Next records nothing; never on a one-file list, where Next stays put.
            if (this.mediaFiles.length > 1) this.likeOrSkip.recordSkip(this.mediaFiles[this.currentIndex].path);
            this.currentIndex = (this.currentIndex + 1) % this.mediaFiles.length;
        }
        this.showMedia();
```

- [ ] **Step 6: `forget` and `deferBulkSave` in `removeFileFromList`** — change the signature to `removeFileFromList(filePath, { deferBulkSave = false } = {}) {`; replace

```js
        if (this.bulkRated.delete(removedName)) {
            this.saveBulkRatedFile();
        }
```

with

```js
        // A batch (dislikeSkippedFiles) passes deferBulkSave and saves once at the end: one un-awaited
        // save per file would start overlapping writes of the same .bulk_rated.json.
        if (this.bulkRated.delete(removedName) && !deferBulkSave) {
            this.saveBulkRatedFile();
        }
```

and directly after the `for (const key of this._bulkPairKeysReferencing(removedName)) …` line add:

```js
        this.likeOrSkip.forget(filePath); // a rated or moved file is no longer a skip (G2)
```

Update the JSDoc above it: the cleanup list gains `bulkRated (save deferrable)`, `bulkRatedPairs keys` and `the like-or-skip set`, and add the line `@param {{deferBulkSave?: boolean}} [options] - skip the bulk-rated save; the caller saves once`.

- [ ] **Step 7: Call the hook at every reorder site** (all in `media-viewer.js`; re-locate by the quoted line):
  1. `loadFolder`, empty branch — after `this.moveHistory = [];` (the one followed by `this.tournament.engine = null;` and `this.showDropZone();`): `this._onOrderChanged('folder');`
  2. `loadFolder`, main branch — after `this.originalMediaFiles = [];` in the "Reset sorting state when loading new folder" block: `this._onOrderChanged('folder');`
  3. `restoreOriginalOrderForTournament` — after `this.isSortedByPrediction = false;`: `this._onOrderChanged('other');`
  4. `handleSortBySimilarity`, restore branch — after `this.isSortedBySimilarity = false;` (directly under `this.mediaFiles = [...this.originalMediaFiles];`): `this._onOrderChanged('other');`
  5. `handleSortBySimilarity`, cache success — after `this.isSortedBySimilarity = true;` under `// Sorting completed from cache!`: `this._onOrderChanged('other');`
  6. `handleSortBySimilarity`, fresh success — after `this.isSortedBySimilarity = true;` under `// Sorting completed successfully!`: `this._onOrderChanged('other');`
  7. `handleSortBySimilarity`, failure restore — after `this.originalMediaFiles = [];` inside `if (!wasAlreadySorted && this.originalMediaFiles.length > 0) {`: `this._onOrderChanged('other');`
  8. `applyPredictionSortResult` — after `this.isSortedByPrediction = true;`: `this._onOrderChanged('ai-fresh');`
  9. `handleSortByPrediction`, toggle-off — after `this.isSortedByPrediction = false;` inside `if (this.isSortedByPrediction) {`: `this._onOrderChanged('other');`

- [ ] **Step 8: Run the glue tests**

Run: `npx vitest run tests/like-or-skip-glue.test.js` → Expected: PASS.

- [ ] **Step 9: Run the whole unit suite and fix the existing contexts** — `npx vitest run`. Expected failures are exactly the contexts in Premise Corrections 6 (`Cannot read properties of undefined (reading 'forget')` / `'recordSkip'`, `this._onOrderChanged is not a function`). At the top of `tests/media-viewer-utils.test.js`, after the `MlTrainingManager` import, add:

```js
import * as LikeOrSkip from '../like-or-skip.js';
// Extracted methods resolve media-viewer.js's namespace import through the global object (G2).
globalThis.LikeOrSkip = LikeOrSkip;
```

then add `likeOrSkip: new LikeOrSkip.SkipTracker(),` to `createContext` (~L321), the bulk-rated-purge `makeCtx` (~L2293), the inline ctx of "removeFileFromList prunes bulkRatedPairs keys that reference the removed file" (~L2439), `cacheCtx` (~L2465) and `guardCtx` (~L6930); and `_onOrderChanged: vi.fn(),` to `baseCtx` in "applyPredictionSortResult" (~L949), `makeCtx` in the `handleSortByPrediction` block (~L1331) and `makeCtx` in the `loadFolder` block (~L4032). Re-run until green. Any failure outside this list is a finding — stop and log it.

- [ ] **Step 10: Update `CLAUDE.md`**
  - § Architecture tree, after the `ml-training.js` line: `├── like-or-skip.js      # Pure ESM (G2 like-or-skip): SkipTracker, batch cursor + undo re-insertion plans; imported as a namespace (LikeOrSkip)`
  - § Cache Management, the `removeFileFromList()` bullet: change "(+ `bulkRated`, with conditional `saveBulkRatedFile()`;" to "(+ `bulkRated`, with conditional `saveBulkRatedFile()` — skipped under `{ deferBulkSave: true }`, which a batch passes to save once;" and change "+ currentIndex adjustment." to "+ `likeOrSkip.forget(path)` + currentIndex adjustment."
  - § State Management, new bullet after "Empty state": `- **Like-or-skip (G2)**: \`this.likeOrSkip\` (\`LikeOrSkip.SkipTracker\`) records the file each single-mode Next leaves while the AI order is on screen. Its \`active\` flag is that token — not \`isSortedByPrediction\`, which the similarity sort leaves set. Every reorder of \`mediaFiles\` goes through \`_onOrderChanged(kind)\`: \`'ai-fresh'\`/\`'ai-resort'\` turn tracking on (skips emptied/kept), \`'other'\`/\`'folder'\` turn it off (\`'other'\` notices the discarded count); it also bumps \`_orderGeneration\`. \`tests/like-or-skip-glue.test.js\` fails on a new \`this.mediaFiles =\` outside its reviewed lists.`

- [ ] **Step 11: Lint, full unit run, commit**

Run: `npm run lint` (0 errors) and `npx vitest run` (all green).

```bash
git add media-viewer.js tests/like-or-skip-glue.test.js tests/media-viewer-utils.test.js CLAUDE.md
git commit -m "feat(like-or-skip): order-change hook and skip tracking on the AI order (G2 T2)"
```

---

## Task 3: Bulk "Dislike N skipped" — the guarded batch, its dialog, the button and `F`

**Files:**
- Modify: `media-viewer.js` — `DEFAULT_SHORTCUTS.single`, `ACTION_LABELS`, constructor `_fileOpInFlight` comment, `initializeElements` (~L377), `setupEventListeners` (~L2079), `_onOrderChanged`, `showMedia` (~L3218), new methods after `handleDislike()` (~L4360), `saveShortcut` (~L10086), `resetShortcuts` (~L10225), `executeAction` (~L10024)
- Modify: `index.html` (after `#dislikeBtn`, ~L216)
- Modify: `styles.css` (`.folder-creation-modal` ~L1527; new rules after `.folder-creation-btn-cancel:hover` ~L1617)
- Modify: `tests/like-or-skip-glue.test.js`, `tests/keyboard-shortcuts.test.js`
- Create: `tests/e2e/like-or-skip.test.js`
- Modify: `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `this.likeOrSkip`, `_onOrderChanged`, `removeFileFromList(path, { deferBulkSave })` (T2); `LikeOrSkip.planCursorAfterBatch`, `LikeOrSkip.formatCount` (T1).
- Produces: `async dislikeSkippedFiles(): void`; `showBulkDislikeConfirm({ count, folderName, includesOnScreen }): Promise<boolean>`; `updateDislikeSkippedButton(): void`; `this.dislikeSkippedBtn`; the history entry `{ skipBatch: true, actionType: 'dislike', files: Array<sub>, prevCurrentPath: string|null, orderGeneration: number }` where `sub = { file, originalIndex, fileName, originalPath, fileSize, mlFeatures, score, bulkBucket, newPath, prunedPairKeys? }`.

- [ ] **Step 1: Write the failing unit tests for the batch and the button** — append to `tests/like-or-skip-glue.test.js`:

```js
describe('dislikeSkippedFiles — one guarded batch (spec § 6)', () => {
    const dislikeSkippedFiles = extract('dislikeSkippedFiles');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function api({ exists = true, failNames = [] } = {}) {
        return {
            path: { basename: (p) => p.split('/').pop() },
            checkFolderExists: vi.fn(async () => exists),
            createFolder: vi.fn(async () => ({ success: true })),
            moveFile: vi.fn(async ({ targetFolder, fileName }) =>
                failNames.includes(fileName)
                    ? { success: false, error: 'ENOENT: no such file' }
                    : { success: true, targetPath: `${targetFolder}/${fileName}` }
            ),
        };
    }

    // a, b, c, d listed; d (index 3) on screen as an image; the test decides what was skipped.
    function batchCtx(skipped, overrides = {}) {
        return {
            _fileOpInFlight: false,
            isLoading: false,
            isCompareMode: false,
            isTournamentMode: false,
            isPredictionSorting: false,
            isComputingHashes: false,
            likeOrSkip: activeTracker(...skipped.map((n) => `/f/${n}`)),
            mediaFiles: media('a', 'b', 'c', 'd'),
            currentIndex: 3,
            currentMedia: { tagName: 'IMG' },
            customDislikeFolder: '/disliked',
            moveHistory: [],
            _orderGeneration: 7,
            predictionScores: new Map([['/f/a', 0.9]]),
            featureCache: new Map(),
            clipCache: new Map(),
            jxlFrameCache: new Map(),
            featureMetadata: new Map(),
            perceptualHashes: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            _bulkPairKeysReferencing: () => [],
            getCombinedFeatures: () => null,
            removeFileFromList: extract('removeFileFromList'),
            saveBulkRatedFile: vi.fn(async () => {}),
            _refuseIfNeedsRegrant: () => false,
            _refuseUngrantedFolder: vi.fn(),
            showBulkDislikeConfirm: vi.fn(async () => true),
            showFolderCreationDialog: vi.fn(async () => false),
            forceVideoCleanup: vi.fn(async () => {}),
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateNavigationInfo: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('moves every skipped file and records one history entry; the file on screen stays, unrendered', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b', 'c']);
        await dislikeSkippedFiles.call(ctx);

        expect(window.electronAPI.moveFile.mock.calls.map(([arg]) => arg.sourcePath)).toEqual(['/f/a', '/f/b', '/f/c']);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['d']);
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.moveHistory).toHaveLength(1);
        const entry = ctx.moveHistory[0];
        expect(entry).toMatchObject({ skipBatch: true, actionType: 'dislike', prevCurrentPath: '/f/d', orderGeneration: 7 });
        expect(entry.files.map((s) => [s.fileName, s.originalIndex, s.newPath])).toEqual([
            ['a', 0, '/disliked/a'],
            ['b', 1, '/disliked/b'],
            ['c', 2, '/disliked/c'],
        ]);
        expect(entry.files[0].score).toBe(0.9);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles)).toEqual([]);
        expect(ctx.showMedia).not.toHaveBeenCalled();
        expect(ctx.updateNavigationInfo).toHaveBeenCalled();
        expect(ctx.updateDislikeSkippedButton).toHaveBeenCalled();
        expect(ctx.showNotification).toHaveBeenCalledWith('👎 Moved 3 files to disliked', 'dislike');
        expect(ctx.showBulkDislikeConfirm).toHaveBeenCalledWith({ count: 3, folderName: 'disliked', includesOnScreen: false });
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('holds the guard across the dialog: a second call meanwhile shows no second dialog', async () => {
        globalThis.window = { electronAPI: api() };
        let answer;
        const ctx = batchCtx(['a'], { showBulkDislikeConfirm: vi.fn(() => new Promise((r) => (answer = r))) });
        const first = dislikeSkippedFiles.call(ctx);
        expect(ctx._fileOpInFlight).toBe(true);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showBulkDislikeConfirm).toHaveBeenCalledOnce();
        answer(false);
        await first;
        expect(ctx._fileOpInFlight).toBe(false);
        expect(window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx.showMedia).not.toHaveBeenCalled(); // a declined dialog renders nothing
    });

    it('refuses before taking the guard', async () => {
        const cases = [
            [{ _fileOpInFlight: true }, null],
            [{ isLoading: true }, null],
            [{ isCompareMode: true }, null],
            [{ isTournamentMode: true }, null],
            [{ likeOrSkip: new LikeOrSkip.SkipTracker() }, null],
            [{ isPredictionSorting: true }, ['Wait for the sort to finish', 'info']],
            [{ isComputingHashes: true }, ['Wait for the sort to finish', 'info']],
            [{ customDislikeFolder: '' }, ['Configure like/dislike folders in Settings (F1)', 'error']],
            [{ _refuseIfNeedsRegrant: () => true }, null],
        ];
        for (const [overrides, notice] of cases) {
            globalThis.window = { electronAPI: api() };
            const ctx = batchCtx(['a'], overrides);
            await dislikeSkippedFiles.call(ctx);
            const label = JSON.stringify(Object.keys(overrides));
            expect(ctx.showBulkDislikeConfirm, label).not.toHaveBeenCalled();
            expect(ctx._fileOpInFlight, label).toBe(overrides._fileOpInFlight === true);
            if (notice) expect(ctx.showNotification, label).toHaveBeenCalledWith(...notice);
        }
    });

    it('says so when nothing was skipped', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx([]);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledWith('Nothing skipped yet', 'info');
        expect(ctx.showBulkDislikeConfirm).not.toHaveBeenCalled();
    });

    // Review Focus 1
    it('a failed rename does not stop the loop; the failed file stays listed and skipped', async () => {
        globalThis.window = { electronAPI: api({ failNames: ['b'] }) };
        const ctx = batchCtx(['a', 'b', 'c']);
        await dislikeSkippedFiles.call(ctx);
        expect(window.electronAPI.moveFile).toHaveBeenCalledTimes(3);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['b', 'd']);
        expect(ctx.moveHistory[0].files.map((s) => s.fileName)).toEqual(['a', 'c']);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles).map((f) => f.name)).toEqual(['b']);
        expect(ctx.showError).toHaveBeenCalledWith('Moved 2 of 3 — 1 failed: ENOENT: no such file');
        expect(ctx.mediaFiles[ctx.currentIndex].name).toBe('d');
    });

    it('the file on screen in the batch: the cursor goes to the next survivor and the view renders', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b'], { currentIndex: 1 });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showBulkDislikeConfirm).toHaveBeenCalledWith({ count: 2, folderName: 'disliked', includesOnScreen: true });
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['c', 'd']);
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
        expect(ctx.forceVideoCleanup).not.toHaveBeenCalled(); // an image is not torn down
    });

    it('a video on screen in the batch is released first; if every rename fails it is still re-rendered', async () => {
        globalThis.window = { electronAPI: api({ failNames: ['a', 'b'] }) };
        const ctx = batchCtx(['a', 'b'], { currentIndex: 1, currentMedia: { tagName: 'VIDEO' } });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.forceVideoCleanup).toHaveBeenCalledOnce();
        expect(ctx.moveHistory).toEqual([]);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
        expect(ctx.mediaFiles).toHaveLength(4);
    }, 3000);

    it('a batch reaching the end of the list wraps the cursor to the first survivor', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['c', 'd']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b']);
        expect(ctx.currentIndex).toBe(0);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('emptying the list renders (the empty state)', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b', 'c', 'd']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.mediaFiles).toEqual([]);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('bulk-rated files are dropped with ONE save and captured for undo', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = batchCtx(['a', 'b'], { bulkRated: new Map([['a', 'good'], ['b', 'bad']]) });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
        expect(ctx.bulkRated.size).toBe(0);
        expect(ctx.moveHistory[0].files.map((s) => s.bulkBucket)).toEqual(['good', 'bad']);
    });

    // Review Focus 4
    it('declining the create prompt moves nothing and keeps the skips', async () => {
        globalThis.window = { electronAPI: api({ exists: false }) };
        const ctx = batchCtx(['a', 'b']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showFolderCreationDialog).toHaveBeenCalledWith('/disliked');
        expect(window.electronAPI.moveFile).not.toHaveBeenCalled();
        expect(ctx._fileOpInFlight).toBe(false);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles)).toHaveLength(2);
    });

    it('a folder main refuses (null) goes to _refuseUngrantedFolder, not the create prompt', async () => {
        globalThis.window = { electronAPI: api({ exists: null }) };
        const ctx = batchCtx(['a']);
        await dislikeSkippedFiles.call(ctx);
        expect(ctx._refuseUngrantedFolder).toHaveBeenCalledWith('dislike');
        expect(ctx.showFolderCreationDialog).not.toHaveBeenCalled();
        expect(window.electronAPI.moveFile).not.toHaveBeenCalled();
    });

    it('a large batch says it is moving first', async () => {
        globalThis.window = { electronAPI: api() };
        const many = Array.from({ length: 51 }, (_, i) => `f${i}`);
        const ctx = batchCtx(many, { mediaFiles: media(...many, 'd'), currentIndex: 51 });
        await dislikeSkippedFiles.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledWith('Moving 51 files…', 'info');
    });
});

describe('updateDislikeSkippedButton (spec § 9)', () => {
    const updateDislikeSkippedButton = extract('updateDislikeSkippedButton');

    function buttonCtx(overrides = {}) {
        const label = { textContent: '' };
        return {
            dislikeSkippedBtn: { style: { display: 'none' }, title: '', querySelector: () => label },
            _label: label,
            isCompareMode: false,
            isTournamentMode: false,
            mediaFiles: media('a', 'b', 'c'),
            likeOrSkip: activeTracker('/f/a', '/f/b'),
            shortcuts: { single: { dislikeSkipped: 'KeyF' } },
            keyDisplayName: (k) => k.replace('Key', ''),
            _shortcutSuffix: extract('_shortcutSuffix'),
            ...overrides,
        };
    }

    it('shows the count and the live binding', () => {
        const ctx = buttonCtx();
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.style.display).toBe('');
        expect(ctx._label.textContent).toBe('Dislike 2 skipped');
        expect(ctx.dislikeSkippedBtn.title).toBe('Dislike all skipped files (F)');
    });

    it('hides at zero', () => {
        const ctx = buttonCtx({ likeOrSkip: activeTracker() });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.style.display).toBe('none');
    });

    // Review Focus 5
    it('hides in compare mode and shows the same count back in single mode', () => {
        const ctx = buttonCtx({ isCompareMode: true });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.style.display).toBe('none');
        ctx.isCompareMode = false;
        updateDislikeSkippedButton.call(ctx);
        expect(ctx._label.textContent).toBe('Dislike 2 skipped');
    });

    it('drops the suffix when the action is unbound', () => {
        const ctx = buttonCtx({ shortcuts: { single: { dislikeSkipped: null } } });
        updateDislikeSkippedButton.call(ctx);
        expect(ctx.dislikeSkippedBtn.title).toBe('Dislike all skipped files');
    });
});
```

- [ ] **Step 2: Write the failing shortcut tests** — in `tests/keyboard-shortcuts.test.js`:
  1. Rename `'single mode has like, dislike, next, previous, undo, special'` to `'single mode has like, dislike, next, previous, undo, special, dislikeSkipped'` and add `dislikeSkipped: 'KeyF',` after `special: 'Digit1',` in its `toEqual`.
  2. In `'builds correct reverse map for single mode'` add `expect(result.single['KeyF']).toBe('dislikeSkipped');`.
  3. After the test `'leaves single-mode special unbound when a stored single remap holds Digit1'`, add:

```js
    // G2 adds single.dislikeSkipped = 'KeyF'; a user who already put KeyF on a single-mode action keeps
    // it, and the new action yields — no batch started by their key.
    it('leaves single-mode dislikeSkipped unbound when a stored single remap holds KeyF', () => {
        globalThis.localStorage = {
            getItem: () =>
                JSON.stringify({
                    version: 2,
                    single: { like: 'KeyQ', dislike: 'KeyW', next: 'KeyF', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                }),
            setItem: () => {},
        };
        const ctx = loadCtx();
        const shortcuts = loadShortcuts.call(ctx);
        expect(shortcuts.single.dislikeSkipped).toBeNull();
        expect(buildReverseMap.call({ shortcuts }).single['KeyF']).toBe('next');
        expect(ctx._shortcutCollisions).toContainEqual({ mode: 'single', action: 'dislikeSkipped', key: 'KeyF', heldBy: 'next' });
    });
```

  4. In `'suppresses the auto-repeat of every other bound action, undo included'` add `'dislikeSkipped'` to the `actions` array.
  5. In the `executeAction` describe, after the special-action block, add:

```js
    describe('dislikeSkipped (G2)', () => {
        const modeCtx = (mode) => ({
            isCompareMode: mode === 'compare',
            isTournamentMode: mode === 'tournament',
            dislikeSkippedFiles: vi.fn(),
        });

        it('single mode starts the bulk dislike', () => {
            const ctx = modeCtx('single');
            executeAction.call(ctx, 'dislikeSkipped');
            expect(ctx.dislikeSkippedFiles).toHaveBeenCalledOnce();
        });

        // Review Focus 5: the reverse map never produces it there; this is the second line of defence.
        it('compare and tournament ignore it', () => {
            for (const mode of ['compare', 'tournament']) {
                const ctx = modeCtx(mode);
                executeAction.call(ctx, 'dislikeSkipped');
                expect(ctx.dislikeSkippedFiles, mode).not.toHaveBeenCalled();
            }
        });
    });
```

  6. Add `updateDislikeSkippedButton: vi.fn(),` beside `updateSpecialButtonsState: vi.fn(),` in all seven `saveShortcut`/`resetShortcuts` contexts (~L878, 910, 931, 977, 1009, 1062, 1082), and in the first `saveShortcut` test add `expect(ctx.updateDislikeSkippedButton).toHaveBeenCalled();` (re-locate it by its ctx at ~L878).

- [ ] **Step 3: Write the failing E2E** — create `tests/e2e/like-or-skip.test.js`:

```js
// G2 like-or-skip flow (docs/superpowers/specs/2026-10-12-g2-like-or-skip-flow-design.md): on the AI
// order in single mode, Next records a skip; F and Enter dislike every skipped file in one action; one
// Ctrl+A puts the whole batch back.
import { test, expect } from '@playwright/test';
import { readdir } from 'fs/promises';
import {
    launchApp,
    closeApp,
    loadFolder,
    seedLocalStorage,
    createTempFixtureDir,
    waitForMedia,
} from './helpers/electron-app.js';

const ALL = ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png', 'tiny.mp4'];

/** No render and no file action in flight — handlers guarding on these flags would otherwise refuse. */
async function waitForIdle(page) {
    await page.waitForFunction(
        () =>
            !window.mediaViewer.isLoading &&
            !window.mediaViewer.mediaNavigationInProgress &&
            !window.mediaViewer._fileOpInFlight,
        null,
        { timeout: 10_000 }
    );
}

/** Apply an AI order through the production entry point — the sort itself is not under test here. */
async function enterAiOrder(page, order) {
    await waitForIdle(page);
    await page.evaluate((names) => {
        const scores = Object.fromEntries(names.map((n, i) => [n, 1 - i / names.length]));
        window.mediaViewer.applyPredictionSortResult({ sortedFilenames: names, scores });
    }, order);
    await page.waitForFunction(
        (first) => window.mediaViewer.mediaFiles[0]?.name === first && window.mediaViewer.currentMedia !== null,
        order[0]
    );
    await waitForIdle(page);
}

/** Press a key and wait for the render it started. */
async function press(page, key) {
    await page.keyboard.press(key);
    await waitForIdle(page);
}

/** Press `key`, send `repeats` auto-repeat keydowns ~33 ms apart (the OS repeat rate), release. */
async function holdKey(page, key, repeats = 10) {
    await page.keyboard.down(key);
    for (let i = 0; i < repeats; i++) {
        await page.waitForTimeout(33);
        await page.keyboard.down(key);
    }
    await page.keyboard.up(key);
}

const onScreen = (page) => page.evaluate(() => window.mediaViewer.mediaFiles[window.mediaViewer.currentIndex]?.name);
const listed = (page) => page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => f.name));

async function spyOnErrors(page) {
    await page.evaluate(() => {
        const mv = window.mediaViewer;
        window.__errors = [];
        const original = mv.showError.bind(mv);
        mv.showError = (message, options) => {
            window.__errors.push(message);
            return original(message, options);
        };
    });
}

test.describe('Like-or-skip (G2)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(ALL);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
            customSpecialFolder: tmpFixtures.specialDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await waitForIdle(page);
        await spyOnErrors(page);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
            tmpFixtures = null;
        }
    });

    test('three skips, F and Enter move the three skipped files; the file on screen stays, unrendered', async () => {
        await enterAiOrder(page, ALL);
        for (let i = 0; i < 3; i++) await press(page, 's');
        expect(await onScreen(page)).toBe('normal-320x240.png');
        await expect(page.locator('#dislikeSkippedBtn')).toBeVisible();
        await expect(page.locator('#dislikeSkippedBtn .btn-label')).toHaveText('Dislike 3 skipped');
        await page.evaluate(() => (window.__shown = window.mediaViewer.currentMedia));

        await page.keyboard.press('f');
        const modal = page.locator('.bulk-dislike-modal');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText('Dislike 3 skipped files?');
        await page.keyboard.press('Enter');
        await expect(modal).toHaveCount(0);
        await waitForIdle(page);

        expect((await readdir(tmpFixtures.dislikeDir)).sort()).toEqual(['blue-1x1.png', 'green-1x1.png', 'red-1x1.png']);
        expect(await listed(page)).toEqual(['normal-320x240.png', 'tiny.mp4']);
        expect(await onScreen(page)).toBe('normal-320x240.png');
        expect(await page.evaluate(() => window.mediaViewer.currentMedia === window.__shown)).toBe(true);
        await expect(page.locator('#dislikeSkippedBtn')).toBeHidden();
        expect(await page.evaluate(() => window.__errors)).toEqual([]);
    });

    test('a held F opens one dialog, and keys pressed while it is open reach no shortcut', async () => {
        await enterAiOrder(page, ALL);
        await press(page, 's');
        await press(page, 's');
        await holdKey(page, 'f');
        await expect(page.locator('.bulk-dislike-modal')).toHaveCount(1);
        await page.keyboard.press('q'); // Like — must not reach the dispatcher
        await page.keyboard.press('s'); // Next — nor this
        await page.keyboard.press('Control+a'); // Undo (spec E3) — nor this: no "No moves to undo" notice
        await page.keyboard.press('Escape');
        await expect(page.locator('.bulk-dislike-modal')).toHaveCount(0);
        await waitForIdle(page);

        await expect(page.locator('.notification').filter({ hasText: 'No moves to undo' })).toHaveCount(0);
        expect(await readdir(tmpFixtures.likeDir)).toEqual([]);
        expect(await readdir(tmpFixtures.dislikeDir)).toEqual([]);
        expect(await onScreen(page)).toBe('blue-1x1.png');
        await expect(page.locator('#dislikeSkippedBtn .btn-label')).toHaveText('Dislike 2 skipped');
    });

    test('a video on screen in the batch is released and moved; the cursor goes to the next file', async () => {
        const order = ['tiny.mp4', 'red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png'];
        await enterAiOrder(page, order);
        await press(page, 's'); // tiny.mp4 skipped
        await press(page, 'a'); // back on it: still skipped, now on screen
        expect(await onScreen(page)).toBe('tiny.mp4');
        expect(await page.evaluate(() => window.mediaViewer.currentMedia?.tagName)).toBe('VIDEO');

        await page.keyboard.press('f');
        const modal = page.locator('.bulk-dislike-modal');
        await expect(modal).toContainText('Includes the file on screen.');
        await page.keyboard.press('Enter');
        await expect(modal).toHaveCount(0);
        await waitForIdle(page);

        expect(await readdir(tmpFixtures.dislikeDir)).toEqual(['tiny.mp4']);
        expect(await onScreen(page)).toBe('red-1x1.png');
        // tiny.mp4's own decode failure ("Failed to load video") may be logged; a failed MOVE may not.
        expect((await page.evaluate(() => window.__errors)).filter((m) => m.startsWith('Moved'))).toEqual([]);
    });
});
```

- [ ] **Step 4: Run all three test sets to verify they fail**

Run: `npx vitest run tests/like-or-skip-glue.test.js tests/keyboard-shortcuts.test.js`
Expected: FAIL — `Could not find method: dislikeSkippedFiles` / `updateDislikeSkippedButton`; the single-mode shape `toEqual` (missing `dislikeSkipped`); reverse map `single['KeyF']` undefined; the KeyF collision test; `executeAction` single mode; the new `updateDislikeSkippedButton` assertion in `saveShortcut`. **Pass by construction**: the repeat-filter case (`_isSuppressedRepeat` suppresses *any* named action outside `REPEATABLE_ACTIONS`, so `'dislikeSkipped'` is suppressed today — the case pins that it stays out of the set), the `executeAction` compare/tournament case, and the seven save/reset contexts (extra stubs are harmless).
Run: `npx playwright test tests/e2e/like-or-skip.test.js`
Expected: FAIL — `#dislikeSkippedBtn` not found (test 1), no `.bulk-dislike-modal` (tests 2–3). Record the messages.

- [ ] **Step 5: The shortcut** — in `DEFAULT_SHORTCUTS.single`, after `special: 'Digit1',`:

```js
        // Additive (G2 like-or-skip), mirroring compare's F = Both bad: no loadShortcuts version bump —
        // _mergeModeShortcuts leaves it unbound if a stored single-mode remap already holds KeyF.
        dislikeSkipped: 'KeyF',
```

in `ACTION_LABELS`, after `special: 'Move to special folder',`: `dislikeSkipped: 'Dislike all skipped',`

and in `executeAction`'s `actions`, after the `special` entry:

```js
            // Single mode only, like `special`: the reverse map produces it nowhere else, and the mode
            // check is the second line of defence. Same guarded path as #dislikeSkippedBtn's click.
            dislikeSkipped: () => {
                if (!this.isCompareMode && !this.isTournamentMode) this.dislikeSkippedFiles();
            },
```

- [ ] **Step 6: The button** — in `index.html`, directly after the `#dislikeBtn` `</button>` inside `#controls`:

```html
                <!-- Like-or-skip (G2): hidden until the AI order has skips; updateDislikeSkippedButton()
                     owns its label, title and visibility. -->
                <button class="control-btn dislike-btn" id="dislikeSkippedBtn" title="Dislike all skipped files" style="display: none">
                    <span class="btn-icon"><i data-lucide="list-x"></i></span>
                    <span class="btn-label">Dislike skipped</span>
                </button>
```

In `initializeElements`, after `this.dislikeBtn = document.getElementById('dislikeBtn');`: `this.dislikeSkippedBtn = document.getElementById('dislikeSkippedBtn');`
In `setupEventListeners`, after `this.dislikeBtn.addEventListener('click', () => this.handleDislike());`:

```js
        if (this.dislikeSkippedBtn) {
            this.dislikeSkippedBtn.addEventListener('click', () => this.dislikeSkippedFiles());
        }
```

- [ ] **Step 7: The three methods** — directly after `handleDislike() { … }`:

```js
    // Sole owner of #dislikeSkippedBtn (G2 spec § 9): label, title and visibility follow the skipped set,
    // the mode and the live binding. Called on every render (showMedia), after a batch or an undo that
    // does not render, from _onOrderChanged, and from saveShortcut/resetShortcuts.
    updateDislikeSkippedButton() {
        if (!this.dislikeSkippedBtn) return;
        const count =
            this.isCompareMode || this.isTournamentMode ? 0 : this.likeOrSkip.skippedIn(this.mediaFiles).length;
        this.dislikeSkippedBtn.style.display = count > 0 ? '' : 'none';
        if (count === 0) return;
        this.dislikeSkippedBtn.querySelector('.btn-label').textContent = `Dislike ${count} skipped`;
        this.dislikeSkippedBtn.title = 'Dislike all skipped files' + this._shortcutSuffix('single', 'dislikeSkipped');
    }

    // The like-or-skip confirmation (G2 spec § 9). Static markup; the count and the folder go in as text
    // (G1 lint guard). While open it owns the keyboard: capture-phase listeners on document run before
    // the app's own keydown handler, so Enter/Escape decide, Tab moves between the two buttons, and no
    // other key reaches a shortcut. Both listeners come off on every close path.
    showBulkDislikeConfirm({ count, folderName, includesOnScreen }) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'bulk-dislike-modal';
            modal.innerHTML = `
                <div class="folder-creation-content">
                    <div class="folder-creation-title">
                        <i data-lucide="thumbs-down"></i>
                        <span class="bulk-dislike-title"></span>
                    </div>
                    <p class="folder-creation-text bulk-dislike-text"></p>
                    <p class="folder-creation-text bulk-dislike-onscreen"></p>
                    <div class="folder-creation-actions">
                        <button type="button" class="folder-creation-btn bulk-dislike-btn-confirm"></button>
                        <button type="button" class="folder-creation-btn folder-creation-btn-cancel bulk-dislike-btn-cancel">Cancel</button>
                    </div>
                </div>
            `;
            modal.querySelector('.bulk-dislike-title').textContent =
                `Dislike ${count} skipped ${count === 1 ? 'file' : 'files'}?`;
            modal.querySelector('.bulk-dislike-text').textContent =
                `They'll move to ${folderName}. One Undo${this._shortcutSuffix('single', 'undo')} brings them all back.`;
            modal.querySelector('.bulk-dislike-onscreen').textContent = includesOnScreen
                ? 'Includes the file on screen.'
                : '';
            const confirmBtn = modal.querySelector('.bulk-dislike-btn-confirm');
            const cancelBtn = modal.querySelector('.bulk-dislike-btn-cancel');
            confirmBtn.textContent = `Move ${LikeOrSkip.formatCount(count, 'file')}`;

            const close = (result) => {
                document.removeEventListener('keydown', onKeydown, true);
                document.removeEventListener('keyup', swallow, true);
                modal.remove();
                resolve(result);
            };
            const swallow = (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
            };
            const onKeydown = (e) => {
                swallow(e);
                if (e.key === 'Tab') {
                    (document.activeElement === confirmBtn ? cancelBtn : confirmBtn).focus();
                } else if (e.repeat) {
                    // a held key (the F that opened this, or Enter) decides nothing
                } else if (e.key === 'Enter') {
                    close(document.activeElement !== cancelBtn);
                } else if (e.key === 'Escape') {
                    close(false);
                }
            };
            document.addEventListener('keydown', onKeydown, true);
            document.addEventListener('keyup', swallow, true);
            confirmBtn.addEventListener('click', () => close(true));
            cancelBtn.addEventListener('click', () => close(false));

            document.body.appendChild(modal);
            if (typeof lucide !== 'undefined') {
                lucide.createIcons({ root: modal });
            }
            confirmBtn.focus();
        });
    }

    // Like-or-skip (G2 spec § 6): dislike every file passed with Next on the AI order, as ONE file action.
    // Holds _fileOpInFlight across the dialog and every rename, and never calls moveCurrentFile — a
    // guarded method calling another is silently refused. One history entry; one Ctrl+A undoes it.
    async dislikeSkippedFiles() {
        if (this._fileOpInFlight || this.isLoading) return;
        if (this.isCompareMode || this.isTournamentMode || !this.likeOrSkip.active) return;
        // A sort still running would reorder mediaFiles under the batch, dialog open or not.
        if (this.isPredictionSorting || this.isComputingHashes) {
            this.showNotification('Wait for the sort to finish', 'info');
            return;
        }
        if (this.likeOrSkip.skippedIn(this.mediaFiles).length === 0) {
            this.showNotification('Nothing skipped yet', 'info');
            return;
        }
        if (!this.customDislikeFolder) {
            this.showNotification('Configure like/dislike folders in Settings (F1)', 'error');
            return;
        }
        // Before the first await, as in moveCurrentFile: nothing is torn down for a move main would refuse.
        if (this._refuseIfNeedsRegrant(['dislike'], 'move')) return;

        this._fileOpInFlight = true;
        try {
            this.signalUserActivity();
            const batch = this.likeOrSkip.skippedIn(this.mediaFiles);
            const filesBefore = [...this.mediaFiles];
            const onScreen = this.mediaFiles[this.currentIndex] ?? null;
            const includesOnScreen = onScreen !== null && batch.includes(onScreen);
            const targetFolderPath = this.customDislikeFolder;
            const folderName = window.electronAPI.path.basename(targetFolderPath);

            const confirmed = await this.showBulkDislikeConfirm({ count: batch.length, folderName, includesOnScreen });
            if (!confirmed) return;

            // Checked (and created if the user agrees) before anything is torn down, as in moveCurrentFile.
            try {
                const folderExists = await window.electronAPI.checkFolderExists(targetFolderPath);
                if (folderExists === null) {
                    this._refuseUngrantedFolder('dislike'); // refused by main, not missing
                    return;
                }
                if (!folderExists) {
                    if (!(await this.showFolderCreationDialog(targetFolderPath))) return;
                    const createResult = await window.electronAPI.createFolder(targetFolderPath);
                    if (!createResult.success) throw new Error(createResult.error);
                }
            } catch (error) {
                console.error('Error preparing the dislike folder:', error);
                this.showError(`Failed to move files: ${error.message}`);
                return;
            }

            // Captured before any file leaves: undo rebuilds every per-file cache from these (spec § 6 step 4).
            const captured = batch.map((file) => {
                const combined = this.getCombinedFeatures(file.path);
                const raw = this.featureCache.get(file.path);
                const prunedPairKeys = this._bulkPairKeysReferencing(file.name);
                return {
                    file: { ...file },
                    originalIndex: filesBefore.indexOf(file),
                    fileName: file.name,
                    originalPath: file.path,
                    fileSize: file.size,
                    mlFeatures: combined ? Array.from(combined) : raw ? Array.from(raw) : null,
                    score: this.predictionScores.get(file.path),
                    bulkBucket: this.bulkRated.get(file.name),
                    ...(prunedPairKeys.length > 0 ? { prunedPairKeys } : {}),
                };
            });

            let tornDown = false;
            if (includesOnScreen && this.currentMedia && this.currentMedia.tagName === 'VIDEO') {
                await this.forceVideoCleanup();
                // Additional wait for file handles to be fully released (as moveCurrentFile)
                await new Promise((resolve) => setTimeout(resolve, 500));
                tornDown = true;
            }

            if (captured.length > 50) {
                this.showNotification(`Moving ${LikeOrSkip.formatCount(captured.length, 'file')}…`, 'info');
            }

            // One at a time: main's no-overwrite suffix probe (lstat, then rename) is not atomic.
            const moved = [];
            const failures = [];
            for (const sub of captured) {
                try {
                    const result = await window.electronAPI.moveFile({
                        sourcePath: sub.originalPath,
                        targetFolder: targetFolderPath,
                        fileName: sub.fileName,
                    });
                    if (!result.success) throw new Error(result.error);
                    moved.push({ ...sub, newPath: result.targetPath });
                } catch (error) {
                    failures.push(error.message);
                }
            }

            const movedPaths = new Set(moved.map((m) => m.originalPath));
            const target = LikeOrSkip.planCursorAfterBatch(filesBefore, movedPaths, this.currentIndex);
            for (const m of moved) this.removeFileFromList(m.originalPath, { deferBulkSave: true });
            if (moved.some((m) => m.bulkBucket)) await this.saveBulkRatedFile();
            // Mapped by path onto the list as it is now (removeFileFromList only clamps the index).
            const targetIndex = target ? this.mediaFiles.findIndex((f) => f.path === target) : -1;
            this.currentIndex = targetIndex === -1 ? 0 : targetIndex;

            if (moved.length > 0) {
                this.moveHistory.push({
                    skipBatch: true,
                    actionType: 'dislike',
                    files: moved,
                    prevCurrentPath: onScreen?.path ?? null,
                    orderGeneration: this._orderGeneration,
                });
            }
            if (failures.length === 0) {
                this.showNotification(`👎 Moved ${LikeOrSkip.formatCount(moved.length, 'file')} to ${folderName}`, 'dislike');
            } else {
                this.showError(`Moved ${moved.length} of ${captured.length} — ${failures.length} failed: ${failures[0]}`);
            }

            this.updateFolderInfo();
            if (tornDown || (onScreen !== null && movedPaths.has(onScreen.path))) {
                // showMedia() sets isLoading synchronously, before finally releases _fileOpInFlight.
                this.showMedia();
            } else {
                this.updateNavigationInfo();
                this.updateDislikeSkippedButton();
            }
        } finally {
            this._fileOpInFlight = false;
        }
    }
```

(Emptying the list implies the file on screen moved, so the empty-state render needs no separate condition.)

- [ ] **Step 8: Refresh points** — at the top of `showMedia()`, after `this.updateBulkRateButtonsVisibility();`: `this.updateDislikeSkippedButton();`. At the end of `_onOrderChanged` (after the `if/else`): `this.updateDislikeSkippedButton();`. In `saveShortcut` and `resetShortcuts`, after `this.updateRatingButtonsState();`: `this.updateDislikeSkippedButton();`. Update the constructor comment above `this._fileOpInFlight = false;` to list `dislikeSkippedFiles` among the holders.

- [ ] **Step 9: Styles** — in `styles.css`, change the selector `.folder-creation-modal {` to `.folder-creation-modal,\n.bulk-dislike-modal {`, and after the `.folder-creation-btn-cancel:hover { … }` rule add:

```css
/* Like-or-skip bulk dislike (G2): the folder-creation shell above, with a danger confirm. */
.bulk-dislike-btn-confirm {
    background: var(--color-danger);
    color: var(--text-inverse);
}

.bulk-dislike-btn-confirm:hover,
.bulk-dislike-btn-confirm:focus-visible {
    box-shadow: var(--shadow-glow-danger);
}
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run` → Expected: PASS (all).
Run: `npx playwright test tests/e2e/like-or-skip.test.js` three times in a row → Expected: 3 passed each time.

- [ ] **Step 11: Docs**
  - `README.md` § Basic Navigation: replace the table (from `| Key | Action |` through the `ESC` row) with the real single-mode defaults:

```markdown
| Key | Action |
|-----|--------|
| `Q` | Like current media |
| `W` | Dislike current media |
| `S` | Next media |
| `A` | Previous media |
| `1` | Move current media to the special folder |
| `F` | Dislike every file skipped on the AI order (after a confirmation) |
| `Ctrl+A` | Undo last action |
| `F1` | Open help/settings |
| `ESC` | Reset zoom / Exit fullscreen |

Single-mode defaults; every binding can be remapped in Settings (F1).
```
  - `CLAUDE.md` § Async Patterns, file-op guard bullet: "`_fileOpInFlight` is held by `moveCurrentFile`, `moveToSpecialFolder`, `moveComparePair`, `applyBulkRating` and `handleCancel`" → "…, `applyBulkRating`, `dislikeSkippedFiles` (G2 — across its confirmation dialog and every rename; refused while a sort runs) and `handleCancel`".
  - `CLAUDE.md` § Keyboard Shortcuts, after "Single mode's `special` (`Digit1`, G1) is additive — no version bump.": "So is single mode's `dislikeSkipped` (`KeyF`, G2)."
  - `CLAUDE.md` § UI Components, append: "Single-mode `#dislikeSkippedBtn` (owner `updateDislikeSkippedButton()`, refreshed from `showMedia()`) and `F` open `showBulkDislikeConfirm()`, a `.bulk-dislike-modal` that owns the keyboard while open (capture-phase `document` listeners, removed on every close path)."
  - `CLAUDE.md` § Cache Management `removeFileFromList()` bullet: after "+ currentIndex adjustment" add "(a clamp only — it never shifts the index, so a batch maps its cursor by path: `LikeOrSkip.planCursorAfterBatch`)".

- [ ] **Step 12: Lint and commit**

Run: `npm run lint` (0 errors), `npm run format:check`.

```bash
git add media-viewer.js index.html styles.css tests/like-or-skip-glue.test.js tests/keyboard-shortcuts.test.js tests/e2e/like-or-skip.test.js README.md CLAUDE.md
git commit -m "feat(like-or-skip): Dislike N skipped — one guarded batch behind a confirmation, F in single mode (G2 T3)"
```

---

## Task 4: One Ctrl+A undoes the whole batch

**Files:**
- Modify: `media-viewer.js` — `handleCancel` (after the `bothGood || bothBad` block, ~L4414); new `_undoSkipBatch` directly after `undoBulkRating` (~L4370)
- Modify: `tests/like-or-skip-glue.test.js` (new describes; `_undoSkipBatch` into the control test's `EXEMPT`)
- Modify: `tests/e2e/like-or-skip.test.js` (one test)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the `skipBatch` entry shape (T3); `LikeOrSkip.planUndoReinsertion` with `missing`, `LikeOrSkip.formatCount` (T1); `this.likeOrSkip.restore` (T1/T2); `_orderGeneration` (T2); `_followRestoredFile`, `restoreFeatureCachesFromHistory` (existing).
- Produces: `async _undoSkipBatch(entry): void` — not guarded; called only from `handleCancel`.

- [ ] **Step 1: Write the failing unit tests** — append to `tests/like-or-skip-glue.test.js`:

```js
describe('_undoSkipBatch — the whole batch back (spec § 7)', () => {
    const undoSkipBatch = extract('_undoSkipBatch');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function api({ failNames = [], renamed = {} } = {}) {
        return {
            path: { basename: (p) => p.split('/').pop() },
            moveFile: vi.fn(async ({ targetFolder, fileName }) =>
                failNames.includes(fileName)
                    ? { success: false, error: 'EBUSY: resource busy' }
                    : { success: true, targetPath: renamed[fileName] ?? `${targetFolder}/${fileName}` }
            ),
        };
    }

    // As dislikeSkippedFiles records it: `names` sat at indices 0..n-1, before d (on screen).
    function batchEntry(names, { prev = '/f/d', generation = 7, newPaths = {}, buckets = {} } = {}) {
        return {
            skipBatch: true,
            actionType: 'dislike',
            prevCurrentPath: prev,
            orderGeneration: generation,
            files: names.map((n, i) => ({
                file: { name: n, path: `/f/${n}`, size: 10, type: 'image/jpeg', mtimeMs: 5 },
                originalIndex: i,
                fileName: n,
                originalPath: `/f/${n}`,
                fileSize: 10,
                newPath: newPaths[n] ?? `/disliked/${n}`,
                mlFeatures: null,
                score: 0.5 + i / 10,
                bulkBucket: buckets[n],
            })),
        };
    }

    function undoCtx(overrides = {}) {
        const d = media('d')[0];
        return {
            baseFolderPath: '/f',
            mediaFiles: [d],
            currentIndex: 0,
            currentMedia: { tagName: 'IMG' },
            isCompareMode: false,
            likeOrSkip: activeTracker(),
            moveHistory: [],
            _orderGeneration: 7,
            predictionScores: new Map(),
            featureCache: new Map(),
            clipCache: new Map(),
            featureMetadata: new Map(),
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            restoreFeatureCachesFromHistory: extract('restoreFeatureCachesFromHistory'),
            _followRestoredFile: extract('_followRestoredFile'),
            saveBulkRatedFile: vi.fn(async () => {}),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            updateNavigationInfo: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('puts every file back on disk and in its original position; the cursor stays on the file it was on', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b', 'c']));
        expect(window.electronAPI.moveFile.mock.calls[0][0]).toEqual({
            sourcePath: '/disliked/a',
            targetFolder: '/f',
            fileName: 'a',
        });
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd']);
        expect(ctx.mediaFiles[0].mtimeMs).toBe(5); // the captured file object, not a rebuilt stub
        expect(ctx.currentIndex).toBe(3);
        expect(ctx.predictionScores.get('/f/b')).toBe(0.6);
        expect(ctx.likeOrSkip.skippedIn(ctx.mediaFiles).map((f) => f.name)).toEqual(['a', 'b', 'c']);
        expect(ctx.moveHistory).toEqual([]);
        expect(ctx.showNotification).toHaveBeenCalledWith('✅ Restored 3 files', 'success');
        expect(ctx.showMedia).not.toHaveBeenCalled(); // d is still the file on screen
        expect(ctx.updateNavigationInfo).toHaveBeenCalled();
    });

    it('parks the files at the front after a reorder since the batch', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ mediaFiles: media('x', 'd'), currentIndex: 1 });
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b'], { generation: 6 }));
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b', 'x', 'd']);
        expect(ctx.currentIndex).toBe(3);
    });

    // Review Focus 2
    it('follows a restore that landed under a new name, from a suffixed dislike-folder path', async () => {
        globalThis.window = { electronAPI: api({ renamed: { b: '/f/b (1)' } }) };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b'], { prev: '/f/b', newPaths: { b: '/disliked/b (1)' } }));
        expect(window.electronAPI.moveFile.mock.calls[1][0]).toEqual({
            sourcePath: '/disliked/b (1)',
            targetFolder: '/f',
            fileName: 'b',
        });
        expect(ctx.mediaFiles.map((f) => f.path)).toEqual(['/f/a', '/f/b (1)', '/f/d']);
        expect(ctx.mediaFiles[1].name).toBe('b (1)');
        expect(ctx.currentIndex).toBe(1); // the file that was on screen, under its new name
        expect(ctx.showMedia).toHaveBeenCalledOnce(); // b, not d, is the file to show
    });

    it('a partial failure pushes the failed files back as a smaller batch, and re-inserts the rest in order', async () => {
        globalThis.window = { electronAPI: api({ failNames: ['b'] }) };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b', 'c']));
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'c', 'd']);
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.moveHistory[0]).toMatchObject({ skipBatch: true, prevCurrentPath: '/f/d', orderGeneration: 7 });
        expect(ctx.moveHistory[0].files.map((s) => s.fileName)).toEqual(['b']);
        expect(ctx.showError).toHaveBeenCalledWith('Restored 2 of 3 — 1 failed: EBUSY: resource busy');
    });

    it('restores bulk-rated membership with one save', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx();
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b', 'c'], { buckets: { a: 'good', c: 'bad' } }));
        expect([...ctx.bulkRated]).toEqual([
            ['a', 'good'],
            ['c', 'bad'],
        ]);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
    });

    it('renders when the empty state was showing', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ mediaFiles: [], currentMedia: null });
        await undoSkipBatch.call(ctx, batchEntry(['a', 'b'], { prev: '/f/b' }));
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'b']);
        expect(ctx.currentIndex).toBe(1);
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('compare mode always re-renders', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ isCompareMode: true });
        await undoSkipBatch.call(ctx, batchEntry(['a']));
        expect(ctx.showMedia).toHaveBeenCalledOnce();
    });

    it('restored files are skips again only while tracking is on', async () => {
        globalThis.window = { electronAPI: api() };
        const ctx = undoCtx({ likeOrSkip: new LikeOrSkip.SkipTracker() });
        await undoSkipBatch.call(ctx, batchEntry(['a']));
        expect(ctx.likeOrSkip.skipped.size).toBe(0);
    });
});

describe('handleCancel routes a skipBatch entry to _undoSkipBatch, and only that entry', () => {
    const handleCancel = extract('handleCancel');
    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    function cancelCtx(history, overrides = {}) {
        return {
            _fileOpInFlight: false,
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: false,
            moveHistory: history,
            signalUserActivity: vi.fn(),
            showNotification: vi.fn(),
            _undoSkipBatch: vi.fn(async () => {}),
            ...overrides,
        };
    }

    it('pops the batch entry and hands it over inside the guard', async () => {
        const entry = { skipBatch: true, files: [] };
        const ctx = cancelCtx([entry]);
        let heldDuring;
        ctx._undoSkipBatch = vi.fn(async () => {
            heldDuring = ctx._fileOpInFlight;
        });
        await handleCancel.call(ctx);
        expect(ctx._undoSkipBatch).toHaveBeenCalledWith(entry);
        expect(ctx.moveHistory).toEqual([]);
        expect(heldDuring).toBe(true);
        expect(ctx._fileOpInFlight).toBe(false);
    });

    // Review Focus 3
    it('a Like made after the batch is undone first, by the single-file branch', async () => {
        globalThis.window = {
            electronAPI: {
                path: { basename: (p) => p.split('/').pop() },
                moveFile: vi.fn(async () => ({ success: true, targetPath: '/f/z.jpg' })),
            },
        };
        const batch = { skipBatch: true, files: [] };
        const like = {
            fileName: 'z.jpg',
            originalPath: '/f/z.jpg',
            newPath: '/liked/z.jpg',
            fileSize: 1,
            fileType: 'image/jpeg',
            actionType: 'like',
            mlFeatures: null,
        };
        const ctx = cancelCtx([batch, like], {
            baseFolderPath: '/f',
            mediaFiles: [],
            currentIndex: 0,
            _followRestoredFile: extract('_followRestoredFile'),
            restoreFeatureCachesFromHistory: vi.fn(),
            updateFolderInfo: vi.fn(),
            showMedia: vi.fn(async () => {}),
        });
        await handleCancel.call(ctx);
        expect(ctx._undoSkipBatch).not.toHaveBeenCalled();
        expect(ctx.moveHistory).toEqual([batch]);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['z.jpg']);
        await handleCancel.call(ctx);
        expect(ctx._undoSkipBatch).toHaveBeenCalledWith(batch);
    });
});
```

and add one test to `tests/e2e/like-or-skip.test.js`:

```js
    test('one Ctrl+A puts the whole batch back on disk, in order, with the cursor where it was', async () => {
        await enterAiOrder(page, ALL);
        for (let i = 0; i < 3; i++) await press(page, 's');
        await page.keyboard.press('f');
        await expect(page.locator('.bulk-dislike-modal')).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(page.locator('.bulk-dislike-modal')).toHaveCount(0);
        await waitForIdle(page);
        expect((await readdir(tmpFixtures.dislikeDir)).length).toBe(3);

        await page.keyboard.press('Control+a');
        await page.waitForFunction(() => window.mediaViewer.mediaFiles.length === 5);
        await waitForIdle(page);

        expect(await readdir(tmpFixtures.dislikeDir)).toEqual([]);
        expect(await listed(page)).toEqual(ALL);
        expect(await onScreen(page)).toBe('normal-320x240.png');
        await expect(page.locator('#dislikeSkippedBtn .btn-label')).toHaveText('Dislike 3 skipped');
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/like-or-skip-glue.test.js` → Expected: FAIL — `Could not find method: _undoSkipBatch`; both dispatch tests, because `_undoSkipBatch` is never called (the entry falls through to the single-file branch, which then throws on the missing `window`/`showError` or splices an `undefined`-named entry). The LIFO test's first half passes by construction (the single branch already handles the Like); its second half is the RED part.
Run: `npx playwright test tests/e2e/like-or-skip.test.js -g "Ctrl\+A"` → Expected: FAIL — `mediaFiles.length === 5` times out (the batch entry is not undoable). Record.

- [ ] **Step 3: Dispatch in `handleCancel`** — directly after the `if (lastMove.bothGood || lastMove.bothBad) { … return; }` block:

```js
            // Like-or-skip batch (G2 spec § 7): one entry, one Ctrl+A, the whole batch back.
            if (lastMove.skipBatch) {
                this.moveHistory.pop();
                await this._undoSkipBatch(lastMove);
                return;
            }
```

- [ ] **Step 4: `_undoSkipBatch`** — directly after `undoBulkRating(lastMove) { … }`:

```js
    // Batch undo for dislikeSkippedFiles (G2 spec § 7). Runs inside handleCancel's _fileOpInFlight hold
    // and takes no guard itself. The entry is already popped: files that fail to come back are pushed
    // back as a smaller skipBatch entry, so the next Ctrl+A retries just those.
    async _undoSkipBatch(entry) {
        const onScreenBefore = this.mediaFiles[this.currentIndex] ?? null;
        let targetPath = entry.prevCurrentPath;
        const restored = [];
        const failed = [];
        let firstError = null;
        for (const sub of entry.files) {
            try {
                const result = await window.electronAPI.moveFile({
                    sourcePath: sub.newPath,
                    targetFolder: this.baseFolderPath,
                    fileName: sub.fileName,
                });
                if (!result.success) throw new Error(result.error);
                const wasOnScreen = sub.originalPath === targetPath;
                this._followRestoredFile(sub, result); // lands at "name (n).ext" if the name was taken
                if (wasOnScreen) targetPath = sub.originalPath;
                restored.push(sub);
            } catch (error) {
                failed.push(sub);
                firstError ??= error.message;
            }
        }

        if (restored.length > 0) {
            const reinsert = restored.map((sub) => ({
                file: { ...sub.file, path: sub.originalPath, name: sub.fileName },
                originalIndex: sub.originalIndex,
            }));
            this.mediaFiles = LikeOrSkip.planUndoReinsertion(this.mediaFiles, reinsert, {
                orderUnchanged: entry.orderGeneration === this._orderGeneration,
                missing: failed.map((sub) => sub.originalIndex),
            });
            for (const sub of restored) {
                this.restoreFeatureCachesFromHistory(sub); // feature caches + rated-pair keys
                if (typeof sub.score === 'number') this.predictionScores.set(sub.originalPath, sub.score);
                if (sub.bulkBucket) this.bulkRated.set(sub.fileName, sub.bulkBucket);
                this.likeOrSkip.restore(sub.originalPath);
            }
            if (restored.some((sub) => sub.bulkBucket)) await this.saveBulkRatedFile();
        }
        if (failed.length > 0) {
            this.moveHistory.push({ ...entry, files: failed, prevCurrentPath: targetPath });
        }

        const targetIndex = targetPath ? this.mediaFiles.findIndex((f) => f.path === targetPath) : -1;
        if (targetIndex !== -1) {
            this.currentIndex = targetIndex;
        } else if (onScreenBefore) {
            this.currentIndex = Math.max(0, this.mediaFiles.indexOf(onScreenBefore));
        }

        if (failed.length === 0) {
            this.showNotification(`✅ Restored ${LikeOrSkip.formatCount(restored.length, 'file')}`, 'success');
        } else {
            this.showError(`Restored ${restored.length} of ${entry.files.length} — ${failed.length} failed: ${firstError}`);
        }
        this.updateFolderInfo();

        const nowOnScreen = this.mediaFiles[this.currentIndex] ?? null;
        if (this.isCompareMode || nowOnScreen !== onScreenBefore || !this.currentMedia) {
            await this.showMedia();
        } else {
            this.updateNavigationInfo();
            this.updateDislikeSkippedButton();
        }
    }
```

- [ ] **Step 5: Register the new assignment site** — in `tests/like-or-skip-glue.test.js`, add to `EXEMPT`: `_undoSkipBatch: 'a batch undo re-inserts files; the others keep their order',`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run` → Expected: PASS.
Run: `npx playwright test tests/e2e/like-or-skip.test.js` → Expected: 4 passed.

- [ ] **Step 7: `CLAUDE.md`** — § State Management, the "Compare-pair undo" bullet: after "then compare-pair." add "A `skipBatch` entry (G2 bulk dislike) goes to `_undoSkipBatch` beside the bulk check: exact original positions when `entry.orderGeneration === _orderGeneration`, else parked at the front; positions shift past files that failed to come back, which are pushed back as a smaller entry."

- [ ] **Step 8: Commit**

```bash
git add media-viewer.js tests/like-or-skip-glue.test.js tests/e2e/like-or-skip.test.js CLAUDE.md
git commit -m "feat(like-or-skip): one Ctrl+A undoes the whole batch (G2 T4)"
```

---

## Task 5: The out-of-date count and the "↻ Re-sort · N new" chip (display only)

**Out-of-date hint, part 1 of 2 — first drop on overrun (WEEKLY), together with Task 6.**

**Files:**
- Modify: `like-or-skip.js`, `tests/like-or-skip.test.js`
- Modify: `media-viewer.js` — constructor (after `_orderGeneration`), `_onOrderChanged`, `initializeElements` (~L446), `showMedia`, `showDropZone` (~L3109), `setSortControlsVisible` (~L4761), `updateSortPredictionButton` (~L8445), new `_updateResortChip` after it, `handleSortByPrediction` (~L8514, ~L8592, finally ~L8648), the no-render branches of `dislikeSkippedFiles` and `_undoSkipBatch`
- Modify: `index.html` (after `#sortPredictionBtn`), `styles.css` (after `.sort-prediction-btn .btn-icon svg`)
- Modify: `tests/like-or-skip-glue.test.js`, `tests/media-viewer-utils.test.js` (`handleSortByPrediction` `makeCtx`), `tests/e2e/like-or-skip.test.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `_onOrderChanged`, `likeOrSkip.active` (T2); the history entry shapes (existing + T3).
- Produces: `trainingWeight(entry): number`; `computeStaleCount(history: Array, markSnapshot: Array | null): number`; `this._staleMark: Array | null`; `this._pendingStaleMark: Array | null`; `_updateResortChip(): void`; `this.resortPredictionBtn`.

- [ ] **Step 1: Write the failing pure tests** — append to `tests/like-or-skip.test.js` (and add `trainingWeight, computeStaleCount` to its import):

```js
describe('trainingWeight', () => {
    it('counts the files an entry moved into or out of the training set', () => {
        expect(trainingWeight({ actionType: 'like' })).toBe(1);
        expect(trainingWeight({ actionType: 'dislike', compareMode: true })).toBe(1);
        expect(trainingWeight({ bothGood: true, bulkFiles: [{}, {}] })).toBe(2);
        expect(trainingWeight({ bothBad: true, bulkFiles: [{}, {}] })).toBe(2);
        expect(trainingWeight({ skipBatch: true, files: [{}, {}, {}] })).toBe(3);
        expect(trainingWeight({ actionType: 'special' })).toBe(0);
        expect(trainingWeight(undefined)).toBe(0);
    });
});

describe('computeStaleCount — the weighted symmetric difference since the mark (spec § 8)', () => {
    const like = () => ({ actionType: 'like' });

    it('is 0 with no mark (not on the AI order)', () => {
        expect(computeStaleCount([like()], null)).toBe(0);
    });

    it('counts ratings added since the mark', () => {
        const before = like();
        const mark = [before];
        expect(computeStaleCount([before, like(), { skipBatch: true, files: [{}, {}] }], mark)).toBe(3);
    });

    it('an undo of a post-mark rating takes it back off', () => {
        const before = like();
        expect(computeStaleCount([before], [before])).toBe(0);
    });

    it('an undo of a pre-mark rating adds to the count', () => {
        const a = like();
        const b = like();
        expect(computeStaleCount([a], [a, b])).toBe(1);
    });

    it('a failed undo that pushes the same entry back changes nothing', () => {
        const a = like();
        const history = [a];
        const mark = history.slice();
        history.pop();
        history.push(a);
        expect(computeStaleCount(history, mark)).toBe(0);
    });

    it('an in-place splice of a weight-0 entry changes nothing', () => {
        const a = like();
        const s = { actionType: 'special' };
        const b = like();
        expect(computeStaleCount([a, b], [a, s, b])).toBe(0);
    });

    it('a partially failed undo of a pre-mark batch overcounts, never undercounts', () => {
        const batch = { skipBatch: true, files: [{}, {}, {}] };
        const residual = { skipBatch: true, files: [{}] };
        // 2 files came back (true change 2); the hint says 4.
        expect(computeStaleCount([residual], [batch])).toBe(4);
    });
});
```

- [ ] **Step 2: Write the failing glue tests** — append to `tests/like-or-skip-glue.test.js`:

```js
describe('the out-of-date mark (spec § 8)', () => {
    const onOrderChanged = extract('_onOrderChanged');

    function markCtx(overrides = {}) {
        return {
            _orderGeneration: 0,
            likeOrSkip: new LikeOrSkip.SkipTracker(),
            mediaFiles: media('a'),
            moveHistory: [{ actionType: 'like' }],
            _staleMark: null,
            _pendingStaleMark: null,
            showNotification: vi.fn(),
            updateDislikeSkippedButton: vi.fn(),
            _updateResortChip: vi.fn(),
            ...overrides,
        };
    }

    it('an AI order commits the snapshot taken before training', () => {
        const pending = [];
        const ctx = markCtx({ _pendingStaleMark: pending });
        onOrderChanged.call(ctx, 'ai-fresh');
        expect(ctx._staleMark).toBe(pending);
        expect(ctx._pendingStaleMark).toBeNull();
    });

    it('an AI order applied outside a sort run snapshots the history now (same entry references)', () => {
        const ctx = markCtx();
        onOrderChanged.call(ctx, 'ai-fresh');
        expect(ctx._staleMark).not.toBe(ctx.moveHistory);
        expect(ctx._staleMark[0]).toBe(ctx.moveHistory[0]);
    });

    it('leaving the AI order drops the mark and refreshes the chip', () => {
        const ctx = markCtx({ _staleMark: [] });
        onOrderChanged.call(ctx, 'other');
        expect(ctx._staleMark).toBeNull();
        expect(ctx._updateResortChip).toHaveBeenCalled();
    });
});

describe('_updateResortChip (spec § 8)', () => {
    const updateResortChip = extract('_updateResortChip');

    function chipCtx(overrides = {}) {
        const label = { textContent: '' };
        const before = { actionType: 'like' };
        return {
            resortPredictionBtn: { style: { display: 'none' }, title: '', querySelector: () => label },
            _label: label,
            moveHistory: [before, { actionType: 'like' }, { actionType: 'dislike' }],
            _staleMark: [before],
            likeOrSkip: activeTracker(),
            isMlEnabled: true,
            isPredictionSorting: false,
            isTournamentMode: false,
            mediaFiles: media('a'),
            ...overrides,
        };
    }

    it('shows the count of training changes since the AI order was computed', () => {
        const ctx = chipCtx();
        updateResortChip.call(ctx);
        expect(ctx.resortPredictionBtn.style.display).toBe('inline-flex');
        expect(ctx._label.textContent).toBe('Re-sort · 2 new');
        expect(ctx.resortPredictionBtn.title).toBe(
            '2 ratings since the last AI sort — re-sort to include them (retrains the model)'
        );
    });

    it('stays hidden when the order is fresh, off the AI order, mid-sort, in tournament, with ML off or no files', () => {
        const hidden = [
            { moveHistory: [] , _staleMark: [] },
            { likeOrSkip: new LikeOrSkip.SkipTracker() },
            { isPredictionSorting: true },
            { isTournamentMode: true },
            { isMlEnabled: false },
            { mediaFiles: [] },
        ];
        for (const overrides of hidden) {
            const ctx = chipCtx(overrides);
            updateResortChip.call(ctx);
            expect(ctx.resortPredictionBtn.style.display, JSON.stringify(Object.keys(overrides))).toBe('none');
        }
    });
});
```

and in `tests/media-viewer-utils.test.js`, inside the `handleSortByPrediction` describe (after its first test):

```js
    it('takes the out-of-date mark before training reads the folders, and clears the pending mark on exit (G2)', async () => {
        const earlier = { actionType: 'like' };
        let markAtTraining;
        const ctx = makeCtx({ moveHistory: [earlier] });
        ctx.mlTraining = {
            ensureTrainedModel: () => {
                markAtTraining = ctx._pendingStaleMark;
                ctx.moveHistory.push({ actionType: 'like' }); // a rating made while training runs
                return Promise.resolve({ source: 'trained', stats: { isReady: true }, fingerprint: 'fp', descriptor: {} });
            },
        };
        await handleSortByPrediction.call(ctx);
        expect(markAtTraining).toEqual([earlier]);
        expect(markAtTraining[0]).toBe(earlier);
        expect(ctx._pendingStaleMark).toBeNull();
    });
```

and add to that block's `makeCtx` defaults: `moveHistory: [],` and `_pendingStaleMark: null,`.

Add to `tests/e2e/like-or-skip.test.js`:

```js
    test('the re-sort chip appears after a Like on the AI order, leaves on its undo, and is gone after Restore Order', async () => {
        await enterAiOrder(page, ALL);
        const chip = page.locator('#resortPredictionBtn');
        await expect(chip).toBeHidden();

        await press(page, 'q');
        await expect(chip).toBeVisible();
        await expect(chip.locator('.btn-label')).toHaveText('Re-sort · 1 new');

        await press(page, 'Control+a'); // the Like made after the sort: the training set is back
        await expect(chip).toBeHidden();

        await press(page, 'q');
        await expect(chip).toBeVisible();
        await page.evaluate(() => window.mediaViewer.handleSortByPrediction()); // Restore Order
        await waitForIdle(page);
        await expect(chip).toBeHidden();
    });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/like-or-skip.test.js tests/like-or-skip-glue.test.js tests/media-viewer-utils.test.js`
Expected: FAIL — `trainingWeight is not a function` (import); `Could not find method: _updateResortChip`; the mark tests (`_staleMark` stays `null`); the `handleSortByPrediction` mark test (`markAtTraining` undefined).
Run: `npx playwright test tests/e2e/like-or-skip.test.js -g "re-sort chip"` → Expected: FAIL — `#resortPredictionBtn` not found. Record.

- [ ] **Step 4: The pure functions** — append to `like-or-skip.js`:

```js
/** How many files a history entry moved into or out of the training set (spec § 8). */
export function trainingWeight(entry) {
    if (!entry) return 0;
    if (entry.skipBatch) return entry.files.length;
    if (entry.bothGood || entry.bothBad) return entry.bulkFiles?.length ?? 2;
    if (entry.actionType === 'like' || entry.actionType === 'dislike') return 1;
    return 0; // special moves and anything else that does not feed training
}

/**
 * Training-set changes since the AI order was computed (spec § 8): the weighted symmetric difference,
 * by identity, between the history then (`markSnapshot`, a copy of moveHistory's entry references) and
 * now. An undone pre-mark rating is in the snapshot only; a new rating in the history only; a failed
 * undo pushes the same object back and so counts nothing. Order-insensitive, so an in-place splice of
 * history cannot misalign it. 0 when there is no mark (not on the AI order).
 */
export function computeStaleCount(history, markSnapshot) {
    if (!markSnapshot) return 0;
    const now = new Set(history);
    const then = new Set(markSnapshot);
    let count = 0;
    for (const entry of markSnapshot) if (!now.has(entry)) count += trainingWeight(entry);
    for (const entry of history) if (!then.has(entry)) count += trainingWeight(entry);
    return count;
}
```

- [ ] **Step 5: The marks** — constructor, after `this._orderGeneration = 0;`:

```js
        // The out-of-date mark (G2 spec § 8): a snapshot of moveHistory's entry references taken when the
        // AI order on screen was computed (null off the AI order). _pendingStaleMark is the snapshot a
        // running sort took before training; _onOrderChanged commits it when the result applies.
        this._staleMark = null;
        this._pendingStaleMark = null;
```

Replace `_onOrderChanged` with its final form (the comment above it stays, plus one line on the mark):

```js
    _onOrderChanged(kind) {
        this._orderGeneration++;
        if (kind === 'ai-fresh' || kind === 'ai-resort') {
            this.likeOrSkip.activate({ keepSkips: kind === 'ai-resort' });
            // The training set this order was computed with (spec § 8): the snapshot the sort took before
            // training, else — an order applied outside a sort run — the history now.
            this._staleMark = this._pendingStaleMark ?? this.moveHistory.slice();
        } else {
            const discarded = this.likeOrSkip.skippedIn(this.mediaFiles).length;
            this.likeOrSkip.deactivate();
            this._staleMark = null;
            if (discarded > 0 && kind !== 'folder') {
                this.showNotification(`Skipped list cleared (${LikeOrSkip.formatCount(discarded, 'file')})`, 'info');
            }
        }
        this._pendingStaleMark = null;
        this.updateDislikeSkippedButton();
        this._updateResortChip();
    }
```

In `handleSortByPrediction`: after `this.isPredictionSorting = true;` add `this.updateSortPredictionButton(); // the re-sort chip hides while a sort runs`; directly before `const training = await this.mlTraining.ensureTrainedModel({ signal });` add

```js
            // The out-of-date mark (G2 spec § 8): the history BEFORE training reads the folders. A rating
            // made while the sort runs then counts as new even if training saw it — the hint may
            // overcount, never undercount. _onOrderChanged commits it when the result applies.
            this._pendingStaleMark = this.moveHistory.slice();
```

and in the `finally`, after `this.isPredictionSorting = false;`: `this._pendingStaleMark = null;` then `this.updateSortPredictionButton();`.

- [ ] **Step 6: The chip** — `index.html`, directly after the `#sortPredictionBtn` `</button>`:

```html
                <!-- Out-of-date AI order (G2): shown only while the training set has changed since the sort;
                     _updateResortChip() owns its label, title and visibility. -->
                <button class="sort-prediction-btn resort-chip" id="resortPredictionBtn" title="Re-sort with your new ratings" style="display: none">
                    <span class="btn-icon"><i data-lucide="refresh-cw"></i></span>
                    <span class="btn-label">Re-sort</span>
                </button>
```

`styles.css`, after the `.sort-prediction-btn .btn-icon svg { … }` rule:

```css
/* Out-of-date AI order (G2): a smaller sibling of the AI-sort button, shown only while stale. */
.resort-chip {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-xs);
}
```

`initializeElements`, after `this.sortPredictionBtn = document.getElementById('sortPredictionBtn');`: `this.resortPredictionBtn = document.getElementById('resortPredictionBtn');`

New method directly after `updateSortPredictionButton() { … }`:

```js
    // "↻ Re-sort · N new" (G2 spec § 8): visible only while the AI order is on screen and the training set
    // has changed since it was computed. Called from showMedia (every rating renders), from
    // updateSortPredictionButton, _onOrderChanged, and the batch / batch-undo branches that do not render.
    _updateResortChip() {
        if (!this.resortPredictionBtn) return;
        const count = LikeOrSkip.computeStaleCount(this.moveHistory, this._staleMark);
        const visible =
            count > 0 &&
            this.likeOrSkip.active &&
            this.isMlEnabled &&
            !this.isPredictionSorting &&
            !this.isTournamentMode &&
            this.mediaFiles.length > 0;
        this.resortPredictionBtn.style.display = visible ? 'inline-flex' : 'none';
        if (!visible) return;
        this.resortPredictionBtn.querySelector('.btn-label').textContent = `Re-sort · ${count} new`;
        this.resortPredictionBtn.title = `${LikeOrSkip.formatCount(count, 'rating')} since the last AI sort — re-sort to include them (retrains the model)`;
    }
```

Refresh and hide points: in `updateSortPredictionButton`, inside the tournament early-return branch add `this._updateResortChip();` before its `return;`, and add `this._updateResortChip();` as its last line. In `showMedia()`, after `this.updateDislikeSkippedButton();`: `this._updateResortChip();`. In `showDropZone()`, after the block that hides `this.sortPredictionBtn`: `if (this.resortPredictionBtn) this.resortPredictionBtn.style.display = 'none';`. In `setSortControlsVisible`'s `else` branch, after the `sortPredictionBtn` line: `if (this.resortPredictionBtn) this.resortPredictionBtn.style.display = 'none';`. In the no-render `else` branches of `dislikeSkippedFiles` and `_undoSkipBatch`, after `this.updateDislikeSkippedButton();`: `this._updateResortChip();`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run` → Expected: PASS.
Run: `npx playwright test tests/e2e/like-or-skip.test.js` → Expected: 5 passed.

- [ ] **Step 8: `CLAUDE.md`** — append to the like-or-skip State Management bullet: "The out-of-date chip `#resortPredictionBtn` (`_updateResortChip()`, refreshed from `showMedia()` and `updateSortPredictionButton()`) shows `LikeOrSkip.computeStaleCount(moveHistory, _staleMark)`: `_staleMark` is a snapshot of `moveHistory`'s entry references taken before training (`_pendingStaleMark`, committed by `_onOrderChanged`), counted as the weighted symmetric difference by identity — no undo hook."

- [ ] **Step 9: Commit**

```bash
git add like-or-skip.js tests/like-or-skip.test.js media-viewer.js index.html styles.css tests/like-or-skip-glue.test.js tests/media-viewer-utils.test.js tests/e2e/like-or-skip.test.js CLAUDE.md
git commit -m "feat(like-or-skip): out-of-date count and the Re-sort chip (G2 T5)"
```

---

## Task 6: One-click re-sort that keeps the skips

**Out-of-date hint, part 2 of 2.**

**Files:**
- Modify: `like-or-skip.js`, `tests/like-or-skip.test.js`
- Modify: `media-viewer.js` — `applyPredictionSortResult` (~L7536), `handleSortByPrediction` (~L8482-8508, ~L8607, ~L8640), `setupEventListeners` (~L2195)
- Modify: `tests/media-viewer-utils.test.js` (the `applyPredictionSortResult` and `handleSortByPrediction` blocks)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `this.likeOrSkip` (T2), `_onOrderChanged('ai-resort')` (T2), the chip (T5).
- Produces: `parkSkippedOrder(currentFiles, sortedFiles, skippedSet): { files, cursor }`; `handleSortByPrediction({ resort = false } = {})`; `applyPredictionSortResult(result, { resort = false } = {})`.

- [ ] **Step 1: Write the failing pure tests** — append to `tests/like-or-skip.test.js` (add `parkSkippedOrder` to the import):

```js
describe('parkSkippedOrder — re-sort keeps skips behind the cursor (spec D2, D3)', () => {
    it('puts the skips first in their current order, then the unjudged in the new model order', () => {
        const current = files('a', 'b', 'c', 'd', 'e'); // a and c skipped
        const sorted = files('e', 'c', 'd', 'b', 'a');
        const { files: result, cursor } = parkSkippedOrder(current, sorted, new Set(['/f/c', '/f/a']));
        expect(names(result)).toEqual(['a', 'c', 'e', 'd', 'b']);
        expect(cursor).toBe(2);
    });

    it('lands on 0 when every remaining file is skipped', () => {
        const current = files('a', 'b');
        const { files: result, cursor } = parkSkippedOrder(current, files('b', 'a'), new Set(['/f/a', '/f/b']));
        expect(names(result)).toEqual(['a', 'b']);
        expect(cursor).toBe(0);
    });

    it('keeps a skipped file the sort result left out (no features), and ignores stale paths', () => {
        const current = files('a', 'b', 'c');
        const { files: result } = parkSkippedOrder(current, files('c', 'b'), new Set(['/f/a', '/f/gone']));
        expect(names(result)).toEqual(['a', 'c', 'b']);
    });
});
```

- [ ] **Step 2: Write the failing glue tests** — in `tests/media-viewer-utils.test.js`, inside `describe('applyPredictionSortResult', …)` add `likeOrSkip: new LikeOrSkip.SkipTracker(), mlComparePairIndex: 3,` to `baseCtx`, then:

```js
    it('a fresh sort announces ai-fresh and lands on the top file', () => {
        const ctx = baseCtx();
        applyPredictionSortResult.call(ctx, { sortedFilenames: ['c.png', 'b.png', 'a.png'] });
        expect(ctx._onOrderChanged).toHaveBeenCalledWith('ai-fresh');
        expect(ctx.currentIndex).toBe(0);
    });

    it('a re-sort parks the skips first and lands on the new best unjudged file (G2)', () => {
        const ctx = baseCtx();
        ctx.likeOrSkip.activate();
        ctx.likeOrSkip.recordSkip('/d/a.png');
        const notice = vi.fn();
        ctx.showNotification = notice;
        applyPredictionSortResult.call(ctx, { sortedFilenames: ['c.png', 'b.png', 'a.png'] }, { resort: true });
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a.png', 'c.png', 'b.png']);
        expect(ctx.currentIndex).toBe(1);
        expect(ctx.mlComparePairIndex).toBe(0);
        expect(ctx._onOrderChanged).toHaveBeenCalledWith('ai-resort');
        expect(notice).toHaveBeenCalledWith('Re-sorted by predicted preference', 'success');
    });
```

and inside the `handleSortByPrediction` describe:

```js
    describe('re-sort from the chip (G2)', () => {
        const resortCtx = (overrides = {}) => {
            const likeOrSkip = new LikeOrSkip.SkipTracker();
            likeOrSkip.activate();
            const original = [{ name: 'b.png', path: '/d/b.png' }, { name: 'a.png', path: '/d/a.png' }];
            return makeCtx({
                isSortedByPrediction: true,
                likeOrSkip,
                originalMediaFiles: original,
                applyPredictionSortResult: vi.fn(() => true),
                runMlSort: vi.fn(() => Promise.resolve({ sortedFilenames: ['b.png', 'a.png'], scores: {} })),
                ...overrides,
            });
        };

        it('re-sorts instead of restoring the order, and passes resort on', async () => {
            const ctx = resortCtx();
            await handleSortByPrediction.call(ctx, { resort: true });
            expect(ctx.runMlSort).toHaveBeenCalledOnce();
            expect(ctx.applyPredictionSortResult).toHaveBeenCalledWith(expect.anything(), { resort: true });
            expect(ctx.isSortedByPrediction).toBe(true);
        });

        it('keeps the original-order snapshot, so Restore Order still returns the folder order', async () => {
            const ctx = resortCtx();
            const snapshot = ctx.originalMediaFiles;
            await handleSortByPrediction.call(ctx, { resort: true });
            expect(ctx.originalMediaFiles).toBe(snapshot);
        });

        it('does nothing when the AI order is no longer on screen', async () => {
            const ctx = resortCtx({ likeOrSkip: new LikeOrSkip.SkipTracker() });
            await handleSortByPrediction.call(ctx, { resort: true });
            expect(ctx.runMlSort).not.toHaveBeenCalled();
        });

        it('a plain click on a sorted list still restores the order', async () => {
            const ctx = resortCtx();
            await handleSortByPrediction.call(ctx);
            expect(ctx.runMlSort).not.toHaveBeenCalled();
            expect(ctx.isSortedByPrediction).toBe(false);
        });
    });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run tests/like-or-skip.test.js tests/media-viewer-utils.test.js`
Expected: FAIL — `parkSkippedOrder is not a function`; the resort `applyPredictionSortResult` test (order stays `['c.png','b.png','a.png']`, `ai-fresh`); `re-sorts instead of restoring` (`runMlSort` not called — the ignored `{ resort }` lets the toggle-off run). **Pass by construction on the unfixed code**, each labelled in the Progress Log: `a fresh sort announces ai-fresh` (T2 already calls the hook); `keeps the original-order snapshot` (the toggle-off returns before the snapshot line — the test exists to fail if the `if (!resort)` guard is ever dropped, which would replace the snapshot with a new array); `does nothing when the AI order is no longer on screen` and `a plain click … restores` (the toggle-off). Record.

- [ ] **Step 4: `parkSkippedOrder`** — append to `like-or-skip.js`:

```js
/**
 * The list a chip re-sort shows (spec D2, D3): the skipped files first, in their current relative order
 * (behind the cursor, where the like-or-skip flow keeps them), then every unjudged file in the new model
 * order. A skipped file the sort result left out (no features) stays parked rather than vanishing. The
 * cursor lands on the first unjudged file, or on 0 when every remaining file is skipped.
 */
export function parkSkippedOrder(currentFiles, sortedFiles, skippedSet) {
    const parked = currentFiles.filter((f) => skippedSet.has(f.path));
    const parkedPaths = new Set(parked.map((f) => f.path));
    const unjudged = sortedFiles.filter((f) => !parkedPaths.has(f.path));
    return { files: [...parked, ...unjudged], cursor: unjudged.length > 0 ? parked.length : 0 };
}
```

- [ ] **Step 5: `applyPredictionSortResult(result, { resort })`** — change the signature to `applyPredictionSortResult(result, { resort = false } = {}) {` and replace

```js
        this.mediaFiles = sorted;
        this.currentIndex = 0;
        this.isSortedByPrediction = true;
        this._onOrderChanged('ai-fresh');
        this.showMedia();
        this.updateSortPredictionButton();
        this.showNotification('Sorted by predicted preference', 'success');
        return true;
```

with

```js
        if (resort) {
            // A chip re-sort (G2 spec D2, D3): un-disliked skips stay parked behind the cursor, and the
            // cursor lands on the new best unjudged file — and in compare mode on the new best pair.
            const parked = LikeOrSkip.parkSkippedOrder(this.mediaFiles, sorted, this.likeOrSkip.skipped);
            this.mediaFiles = parked.files;
            this.currentIndex = parked.cursor;
            this.mlComparePairIndex = 0;
        } else {
            this.mediaFiles = sorted;
            this.currentIndex = 0;
        }
        this.isSortedByPrediction = true;
        this._onOrderChanged(resort ? 'ai-resort' : 'ai-fresh');
        this.showMedia();
        this.updateSortPredictionButton();
        this.showNotification(resort ? 'Re-sorted by predicted preference' : 'Sorted by predicted preference', 'success');
        return true;
```

- [ ] **Step 6: `handleSortByPrediction({ resort })`** — change the signature to `async handleSortByPrediction({ resort = false } = {}) {`. After the `if (!this.isMlEnabled) { … return; }` guard add:

```js
        // The chip re-sort (G2) acts only on the AI order it was shown for.
        if (resort && !this.likeOrSkip.active) return;
```

change `if (this.isSortedByPrediction) {` (the toggle-off) to `if (this.isSortedByPrediction && !resort) {` and its comment to `// Toggle off — restore original order. Not for the re-sort chip (G2), which re-sorts in place.`; replace `this.originalMediaFiles = [...this.mediaFiles];` with

```js
            // A re-sort (G2) keeps the snapshot from the first sort: the list on screen is already the AI
            // order, and copying it here would make Restore Order "restore" that.
            if (!resort) this.originalMediaFiles = [...this.mediaFiles];
```

and change `this.applyPredictionSortResult(result);` to `this.applyPredictionSortResult(result, { resort });`.

- [ ] **Step 7: Wire the chip** — `setupEventListeners`, after the `sortPredictionBtn` listener block:

```js
        // The out-of-date chip re-sorts in place, keeping skips (G2). Never the plain button's handler:
        // on a sorted list that one means Restore Order.
        if (this.resortPredictionBtn) {
            this.resortPredictionBtn.addEventListener('click', () => this.handleSortByPrediction({ resort: true }));
        }
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run` → Expected: PASS. Run: `npx playwright test tests/e2e/like-or-skip.test.js` → Expected: 5 passed.

- [ ] **Step 9: `CLAUDE.md`** — § Architecture tree `like-or-skip.js` line → `# Pure ESM (G2 like-or-skip): SkipTracker, batch cursor + undo re-insertion plans, re-sort parking, out-of-date count; imported as a namespace (LikeOrSkip)`; the `predictionScores` sync bullet: after "`applyPredictionSortResult(result)`" insert "(`{ resort }` on a chip re-sort — `handleSortByPrediction({ resort: true })` skips the toggle-off, keeps `originalMediaFiles`, and the result parks un-disliked skips first with the cursor on the first unjudged file)".

- [ ] **Step 10: Commit**

```bash
git add like-or-skip.js tests/like-or-skip.test.js media-viewer.js tests/media-viewer-utils.test.js CLAUDE.md
git commit -m "feat(like-or-skip): one-click re-sort that keeps the skips (G2 T6)"
```

---

## Task 7: "After" evidence and the branch check

**Files:**
- Create: `docs/superpowers/specs/assets/g2-like-or-skip-single-after.png`, `docs/superpowers/specs/assets/g2-like-or-skip-dialog-after.png`

- [ ] **Step 1: Capture**

Run (PowerShell): `$env:LIKE_OR_SKIP_EVIDENCE_STAGE='after'; npx playwright test tests/e2e/visual-evidence.test.js -g "like-or-skip"; $env:LIKE_OR_SKIP_EVIDENCE_STAGE=$null`
Expected: 1 passed; both PNGs exist.

- [ ] **Step 2: Look at them** (Read tool) beside `g2-like-or-skip-single-before.png`. Acceptance: in `single-after` the bar shows "DISLIKE 3 SKIPPED" after Dislike, the header shows "Restore Order" and "↻ Re-sort · 1 new" (absent if T5–T6 were dropped — say so in the PR); nothing else moved relative to `single-before`. In `dialog-after` the dialog reads "Dislike 3 skipped files?", names `disliked`, has "Move 3 files" (red) and "Cancel". Any layout defect is a finding: fix it in the owning task's files, re-capture, and log it.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/assets/g2-like-or-skip-single-after.png docs/superpowers/specs/assets/g2-like-or-skip-dialog-after.png
git commit -m "docs(like-or-skip): after screenshots — button, chip, confirmation (G2 T7)"
```

---

## Finish (after Task 7)

- [ ] `npx vitest run`, `npm run lint`, `npm run format:check` green; `git status --short` clean.
- [ ] `for i in 1 2 3; do npx playwright test tests/e2e/like-or-skip.test.js --reporter=line || break; done` — three runs in a row.
- [ ] `npx playwright test` — the full suite once. An existing E2E that now fails because `F` or the button changed something it relied on is a finding; fix the test only if its premise was wrong, and log it.
- [ ] Grep sweep (CLAUDE.md § Best Practices): `_onOrderChanged`, `skipBatch`, `dislikeSkipped`, `deferBulkSave`, `_staleMark`, `resort` across code, tests **and comments**; re-read every comment attached to changed code (especially `handleSortByPrediction`'s toggle-off, `applyPredictionSortResult`, `removeFileFromList`'s JSDoc, the `_fileOpInFlight` constructor comment).
- [ ] Dispatch the `regression-checker` agent on `git diff main...HEAD -- media-viewer.js`; triage every finding against the spec.
- [ ] Final review: `/code-review max` on the branch; fix, re-verify.
- [ ] Push (`git push -u origin g2-like-or-skip-flow`; pre-push runs the full E2E suite). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [ ] Open the PR: spec + plan links, the decisions D1–D6, the planning amendments (Premise Corrections 1–4), RED→GREEN evidence per task, the before/after screenshots inline, test deltas, the Residuals, and the *You should know* notes so far. Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

1. **The skipped set is session-only** — an app restart (or a crash) loses 15–20 un-disliked decisions. A per-folder `.skipped.json` beside `.bulk_rated.json` would keep them, validated as untrusted folder content (G1) and pruned on load. 🟤 candidate.
2. **One reusable confirmation dialog** — `showFolderCreationDialog`, `showBulkDislikeConfirm` and the tournament leave/resume prompts each build their own modal; a single `showConfirmDialog({ title, text, confirmLabel, danger })` with the keyboard ownership built in would also fix F9's listener leak by construction. 🟤 candidate.
3. **A progress card for very large batches** — above ~50 files the batch shows one up-front notice and then blocks input for the renames' duration; the sort-progress card (`updateSortProgress`) could show a determinate count, though it shares its element with a running sort (refused today). 🟤 candidate.

## Residuals for Extract (found while designing and planning — not fixed here)

- The four pre-existing defects of spec § 12, each → BACKLOG 🟤: (1) the similarity sort leaves `isSortedByPrediction` set (audit every reader of the flag alone); (2) `writeBulkRatedFile` is not atomic and `removeFileFromList` fires overlapping un-awaited saves (a compare-pair move of two bulk-rated files today); (3) single-move undo drops bulk-rated membership and the prediction score; (4) `showFolderCreationDialog` leaks its keydown listener on its click paths.
- `applyPredictionSortResult` silently drops every listed file the sort result omits (files with no features) from `mediaFiles` — pre-existing; the re-sort keeps *skipped* such files parked but not unjudged ones. → BACKLOG 🟤.
- `docs/ARCHITECTURE.md`'s file tree lists none of the extracted modules (`fullscreen.js`, `tournament*.js`, `ml-training.js`, now `like-or-skip.js`) — add to the 🟤 derived-value / docs-drift sweep. → BACKLOG 🟤.
- `README.md`'s other sections (view modes, sorting) were not audited beyond the shortcut table this plan corrects. → BACKLOG 🟤 if the closeout finds them stale.

## Closeout (after the merge, on `main`)

- [ ] Extract (Improvements + Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] From: G2 closeout`), archive this plan (`git mv` to `docs/archive/plans/`, indexed in `docs/README.md` Archived Plans), DONE.md entry, WEEKLY Summary-Table Status → `✅ PR #N` + the Tue/Wed/Thu G2 Daily-Schedule rows, check off both BACKLOG 🔵 [2026-10-04] entries — **in the closeout commit**.
- [ ] Remove this plan's row from [README.md](README.md) § Current Plans and from `docs/README.md` § Active Plans.
- [ ] Spec: add a post-implementation note (the frozen spec gets a note, not a rewrite) for anything the code departed from.
- [ ] Propagation check: re-read every live surface this plan touched (`CLAUDE.md`, `README.md`, the code comments, `index.html`) for a late correction that did not reach it.
- [ ] REVIEW-QUEUE § 5: hand the *You should know* notes and the side-agent token cost to G6.
- [ ] Memory: session file + MEMORY.md line; durable lessons only.

## Progress Log

- **2026-10-12** — Branch `g2-like-or-skip-flow` from `15cec8c`. Brainstormed with the user, section by section (D1 skips only on the AI order; D2 a re-sort keeps them parked behind the cursor; D3 land on the new best unjudged file; D4 a separate chip; D5 button + `F`; D6 pure module + glue); spec `d919f18`. The user enabled the *You should know* mod. Planning-time measurements: the enclosing method of every `this.mediaFiles =` (Premise Corrections 8); the existing test contexts each new call reaches (6); README's stale shortcut table (5). Spec amended before any code (1–4): snapshot mark, explicit render rule, batch refused during a sort + path-mapped cursor, shifted partial-undo indices.
- **2026-10-12** — Execution started, subagent-driven (user's choice). Pre-flight scan of the tasks against each other found one plan defect: the code blocks write single-line `if`/`for` bodies without braces, but `eslint.config.mjs` enforces `curly: ['error', 'all']` (the Global Constraints line saying "braces on multi-line `if` bodies" was wrong) — every implementer adds braces, logic unchanged.
- **2026-10-12 — Task 1** (Sonnet · medium). RED: `Error: Cannot find module '../like-or-skip.js' imported from '…/tests/like-or-skip.test.js'`. GREEN: 16/16. "Before" screenshot captured on the unchanged renderer: `normal-320x240.png` on screen; bar Zoom/Special/Undo/Like/Dislike, no "Dislike N skipped"; header "Restore Order", no chip. The plain evidence run reports the test skipped.
- **2026-10-12 — Task 2** (Opus · medium). RED: the glue file fails to collect at `Could not find method: _onOrderChanged`. A temporary copy with the hook describe removed showed the other expected failures: `records the file being left` (`expected [] to deeply equal [ '/f/a' ]`), `drops the removed path` (`expected [ '/f/a', '/f/b' ] to deeply equal [ '/f/b' ]`), `defers the save` (save called once), and control 2 (all five order-changers listed). **Pass by construction**: control tests 1 and 3, plus the negative cases (`records nothing while tracking is off / for a refused Next / on a one-file list / in compare mode`, `still saves by default`) — guards, not RED. GREEN: glue 16/16, full unit suite green. Step 9 fallout: 13 failures, all in the Premise Corrections 6 contexts.
  - **Review fix (deviation from Step 7 item 7):** the task review found that hook site 7 — `handleSortBySimilarity`'s catch-block restore — puts back the order the sort started from, without re-rendering, so a cancelled or failed similarity sort started from the AI order would have discarded the skips with a "Skipped list cleared" notice while the AI order stayed on screen (against spec D1). Ruling: site 7 bumps only `_orderGeneration` (a later batch undo then parks its files — the stale snapshot can resurrect a file moved mid-sort); eight hook calls, not nine. RED: `expected "vi.fn()" to not be called at all, but actually been called 1 times` (`_onOrderChanged`), from a new glue test that drives `handleSortBySimilarity` into its catch through a throwing `loadSortCache`. GREEN: glue 17/17, full unit suite green.
- **2026-10-12 — Task 3** (Opus · medium). RED (units): the glue file fails to collect at `Could not find method: dislikeSkippedFiles`; keyboard-shortcuts: the single-mode shape (`…(4)` vs `…(5)`), the KeyF collision (`expected undefined to be null`), reverse map `single['KeyF']` (`expected undefined to be 'dislikeSkipped'`), `executeAction` single mode (called 0 times), the `saveShortcut` refresh (`expected "vi.fn()" to be called at least once`). **Pass by construction** as labelled: the repeat-filter case, `executeAction` compare/tournament, the seven save/reset stubs. RED (E2E, 3/3): `#dislikeSkippedBtn` not found; `.bulk-dislike-modal` count 0; modal not found — test 3 got past `currentMedia.tagName === 'VIDEO'` first, so `tiny.mp4` does render as a `<video>`. GREEN: full unit suite green; like-or-skip E2E 3 runs in a row. Deviation: the brief's bare `window.electronAPI` assertions read `globalThis.window.electronAPI` (`no-undef` in the test block).

## Key Discoveries

_(filled at completion)_
