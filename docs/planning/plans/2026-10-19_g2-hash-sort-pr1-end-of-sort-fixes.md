# G2 PR 1. Similarity-Sort End-of-Run Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G2 (🔵 🏆, 8 SP → ~13 SP across two PRs, spec D7; this plan is **PR 1, ~6 SP**) ← TODO 🔴 [2026-06-18] "Speed up AI / similarity sorting on large folders (24k+ files)", slice PR2
**Spec**: [2026-10-19-g2-hash-sort-off-renderer-design.md](../../superpowers/specs/2026-10-19-g2-hash-sort-off-renderer-design.md) (committed `47d870c`, user-approved 2026-10-19; amended at planning — § 15, A1–A9, committed with this plan)
**Created**: 2026-10-19
**Status**: Approved 2026-10-19 ("Looks good") — executing, subagent-driven
**Last Updated**: 2026-10-19
**Branch**: `g2-hash-sort-off-renderer` (from `main` @ `bfc4cbf`). PR 2 (background hashing) gets its own plan and branch after this merges.

**Goal:** A similarity sort stops rewriting the list under a user who is using the app. It works on a snapshot taken at the press, with the algorithm and K captured then. It saves its hashes as it goes and on Cancel. No end path restores or resurrects a file, and nothing is written after a folder switch. A run ends in one of two ways: it applies its order at once if the user waited, or shows a sticky "Similarity order ready — Show" message if the user acted. Hashing stays on today's route; PR 2 moves it.

**Architecture:** A new pure ES module, `similarity-sort.js` (namespace `SimilaritySort`), holds three things: the list rule (`alignToLive`), the "did the user act" mark, and the hash-save schedule. `MediaViewer` gains one apply function, `_applySimilarityOrder(entry)`, and every way a similarity order reaches the screen goes through it: a cache hit, a direct apply and Show. It also gains the offer, the run token (`_similarityRunGen` plus the run's folder) and a restructured `handleSortBySimilarity`. `applyCachedSortOrder` and `insertNewFilesInSortedOrder` compute and **return** an order instead of writing `this.mediaFiles`, so no list write ever spans an `await`. Nothing changes in IPC, `main.js`, `preload.js` or `sorting-worker.js`.

**Tech Stack:** Electron 39 renderer (`media-viewer.js`, ES module, no bundler), Vitest 4 (node environment, extract-method tests), Playwright + Electron E2E (`tests/e2e/`), Prettier 3, ESLint 9 flat config.

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. The `PostToolUse` hook formats each edited JS file, and lint-staged formats staged files at commit. `docs/` and `*.md` are Prettier-ignored.
- **ESLint**: `curly: ['error', 'all']`, `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; prefix unused names with `_`). The renderer's `htmlSinkGuard` applies: no built string reaches `innerHTML`. This PR adds no markup; the sticky message uses `showNotification`'s existing `createElement` + `textContent` build.
- **Out of scope for PR 1** (spec § 13.1): no new IPC; no edit to `main.js`, `preload.js` or `sorting-worker.js`; `computePerceptualHash` and `blockhash` stay as they are. The "> 1000 files … could freeze the application" confirm keeps its wording (PR 2, my call 8).
- **Vitest runs in the node environment.** `MediaViewer` methods are tested by extracting their source and calling it with a mock `this`. An extracted method runs in the global scope, so it sees `SimilaritySort` only through `globalThis.SimilaritySort` (set it in every test file whose extracted methods call the module), sees `window`/`localStorage`/`confirm` only through `globalThis`, and needs every `this.*` it touches on the mock context.
- **The renderer reaches the module one way only**: `SimilaritySort.<name>(…)` through the namespace import. Never a bare imported name, which an extracted method could not resolve.
- **Path identity is exact string equality.** No `toLowerCase()` and no normalisation.
- **`this.mediaFiles` is assigned only inside a synchronous commit block.** No `await` may fall between reading the live list and assigning the new one; that gap is the resurrection bug this PR closes. `tests/like-or-skip-glue.test.js`'s § 4 control lists every assigning method, and its lists change only deliberately (T4).
- **Progress goes through `updateSortProgress` only** (CLAUDE.md, the shared-element gotcha).
- **Exact strings**:
  - Offer: message `Similarity order ready`, type `success`, action button `Show`; `showNotification` option `{ sticky: true }`; class `sticky` on the element.
  - Cancel: `❌ Sorting cancelled` (`info`), shown by the run's end. The Sort-button press only aborts (A3).
  - Failure: `` `❌ Error: ${error.message}` `` (`error`). The hash-count message is unchanged: `` `Only ${n} files have valid hashes. Need at least 2 to sort.` ``.
  - Refusals: `Wait for the move to finish` (via `_refuseIfFileOpInFlight`); `Wait for the folder to finish loading` (via `_refuseIfFolderLoadInFlight`); `Wait for the sort to finish` (`info`).
  - Success messages are unchanged: `` `✅ Sorted ${sortedCount} files with ${algorithmName}!` `` (`success`), and the cache hit's `` `✅ Restored cached ${algorithmName} order` `` with its stats suffix.
- **Perf line**: `Similarity sort: outcome=<done|offered|cancelled|failed|stale> total=<n>ms | load=<n>ms | extract=<n>ms | hash=<n>ms (new <N>, skipped <N>) | save=<n>ms | sort=<n>ms | apply=<n>ms | files=<N>`. Only the phases that ran appear, always in that order. `files` is the snapshot's length. Written through `_logSortPerf`, which gains `perf.label` and `perf.files` (A2).
- **Constants** (in `similarity-sort.js`): `HASH_SAVE_EVERY = 1000`; `HASH_SAVE_INTERVAL_MS = 60_000`. K is read once, at the press: `localStorage.getItem('sortKValue')`, parsed with `parseInt(…, 10)`, default `500` (as today, `media-viewer.js:7379`).
- **Every new test must fail against the code before its step lands.** Record the failure message in the Progress Log. A RED test that passes is zero coverage: find out why before continuing. Where a mutation check is named, run it and log both runs.
- **E2E**: `workers: 1`; null guards in `afterEach`; each launch gets a fresh grant store. The `.media-container` overlay blocks pointer events, so click with `{ force: true }` or use `page.evaluate`. Before an action guarded on `isLoading`/`mediaNavigationInProgress`, wait for both to clear (CLAUDE.md § E2E).
- **Pre-commit hook**: secret scan → docs-index guard → `CLAUDE.md` size warning → lint-staged → `npx vitest run`. Never use `--no-verify`. Pre-push runs the full E2E suite.
- **Grep rule** (CLAUDE.md § Best Practices): when changing a named method or a behaviour a comment describes, grep code, tests **and comments**, and re-read every comment attached to changed code. Comments known to need this: `handleSortBySimilarity`'s "Save original order (preserve existing snapshot…)" (`:7182`) and its catch comment (`:7427`); `insertNewFilesInSortedOrder`'s tests' "only assigns this.mediaFiles after the loop completes"; the `EXEMPT` reasons in `like-or-skip-glue.test.js`.
- **Commits**: one per task. In subagent-driven mode the **controller** commits (memory `feedback_subagent_commits_vs_memory_hook`). Trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, or the executing model's own line.

## Review Focus

1. **Every file moved away during a run** (the live list is empty when the run ends). Expected: nothing is applied or offered, no error, and the empty-state screen stays. Pinned in T4 (unit: `an emptied list is left alone`).
2. **The same folder reopened mid-run** (the gen changes, the path does not). Expected: the old run writes nothing, exactly as for a different folder. Pinned in T3 (unit: the stale test's `same folder reopened` case).
3. **Show after switching to compare mode.** Expected: the order applies and the first pair renders with the start file on the left. Pinned in T5 (E2E: `Show after switching to compare mode…`).
4. **Cancel during a cache hit's new-file placement** (the placement loop throws on abort). Expected: the list stays exactly as it was, since `applyCachedSortOrder` no longer writes it. Pinned in T4 (unit: `a cancel during the cache-hit placement leaves the list as it is`).
5. **× on the offer, then Sort again.** Expected: the saved order applies at once from `.sort_cache.json`, with no hashing (D3). Pinned in T5 (E2E: `× then Sort applies the saved order at once`).

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `similarity-sort.js` | Create | Pure: `alignToLive`, `takeUserMark`, `userActedSince`, `HASH_SAVE_EVERY`, `HASH_SAVE_INTERVAL_MS`, `isHashSaveDue` (T1) |
| `media-viewer.js` | Modify | Namespace import, and Restore Order through `alignToLive` on three paths (T2). The run: `_similarityRunGen`, `_isStaleSimilarityRun`, `_assertSimilarityRunLive`, `_invalidateSimilarityRun`; folder-explicit hash/sort cache I/O; `handleSortBySimilarity` on a snapshot with captured settings, saves, a no-restore cancel and failure, the CLIP branch on the same model; `_logSortPerf` label/files (T3). The end: `showNotification` `sticky` plus a return value; `applyCachedSortOrder`/`insertNewFilesInSortedOrder` return the order; `_applySimilarityOrder`, `_offerSimilarityOrder`, `_dismissSimilarityOffer`, `_onSimilarityShow`; the direct-vs-Show decision; the dismissal sites (T4) |
| `eslint.config.mjs` | Modify | `similarity-sort.js` in block 2c (T1) |
| `tests/similarity-sort.test.js` | Create | Pure-module tests (T1) |
| `tests/similarity-sort-glue.test.js` | Create | Restore Order ×3 (T2); the run (T3); the end (T4) |
| `tests/lint-guard.test.js` | Modify | `similarity-sort.js` in `RENDERER_FILES` (T1) |
| `tests/like-or-skip-glue.test.js` | Modify | The failed-sort test (no restore now) and "Cancel stays live" (no press notice) (T3); § 4 control lists, the `similarityCtx` mock shape, `_switchToFolderNow` contexts (T3/T4) |
| `tests/media-viewer-utils.test.js` | Modify | `insertNewFilesInSortedOrder`/`applyCachedSortOrder` assert return values (T4); `handleSortByPrediction` `makeCtx` stub (T4); `loadFolder` context stub (T3); `_logSortPerf` similarity case (T3); `loadHashCache` folder case (T3) |
| `tests/integration/cached-sort-path.test.js` | Modify | Assert the returned order (T4) |
| `tests/recent-folders-glue.test.js` | Modify | `_invalidateSimilarityRun` stub where `loadFolder`/`_switchToFolderNow` contexts reach it (T3), if the run shows they do |
| `tests/e2e/similarity-sort.test.js` | Create | Show, Cancel and folder-switch E2E (T5) |
| `CLAUDE.md` | Modify | Architecture tree (T1); § Async Patterns run bullet, § Error Handling sticky option, § Cache Management sort-cache line (T4) |
| `docs/ARCHITECTURE.md` | Modify | § Similarity Sorting Flow: the hash cache is `.hash_cache.json`, not IndexedDB; the last box applies or offers Show (T4) |
| `docs/superpowers/specs/2026-10-19-g2-hash-sort-off-renderer-design.md` | Modify | § 15 planning amendments (committed with this plan) |
| `docs/README.md`, `docs/planning/plans/README.md`, `docs/planning/WEEKLY.md`, `docs/planning/TODO.md` | Modify | This plan under Active/Current Plans; the D7 split and the G3 slip (committed with this plan) |

**Live-surface preflight** (plans README step 4): every live surface asserting a claim PR 1 changes, diffed against the table above.
- `CLAUDE.md` § Architecture tree (no `similarity-sort.js`): ✅ T1.
- § Cache Management "Sort cache: … `applyCachedSortOrder(data, algorithm)` resolves the metric…" (it now returns the order and writes nothing): ✅ T4.
- § Async Patterns file-op bullet, "A sort ALREADY running can still apply its result mid-action…" (the similarity sort now declines at a held guard): ✅ T4.
- § Detected Patterns / Error Handling, "user-facing errors via the notification system" (sticky option): ✅ T4.
- `docs/ARCHITECTURE.md` § Similarity Sorting Flow ("load from IndexedDB"; "reorder file list, refresh display"): ✅ T4.
- The code comments at `media-viewer.js:7182` and `:7427`: ✅ T3.
- `tests/like-or-skip-glue.test.js` `EXEMPT` reasons for `applyCachedSortOrder`/`insertNewFilesInSortedOrder`: ✅ T4.

**Checked, no claim to change**: `README.md` § Features ("Group visually similar images using perceptual hashing" is still true), `PROJECT.md`, `index.html`'s button title ("Shift+click to force re-sort (ignores cache)" is still true). **Not changed, deliberately**: BACKLOG (the three § 12 entries are checked off at closeout).

---

## Planning amendments (spec § 15, committed with this plan)

Measured on `bfc4cbf` while planning; each refines the approved design without changing a user ruling.

- **A1. Tournament entry restores through the same rule.** `restoreOriginalOrderForTournament` (`:5702`) filters `originalMediaFiles` without appending, so it drops the same files Restore Order does. One helper serves all three paths.
- **A2. The perf line gains `outcome=offered`**, for a run whose order waits behind Show. `done` means it was applied. `_logSortPerf` takes `perf.label` and `perf.files`, so both sorts share one formatter.
- **A3. The cancel notice moves to the run's end.** Today a press-cancel shows `❌ Sorting cancelled`, while the card's Cancel shows an error-styled `❌ Error: Sorting cancelled by user` from the catch. Now the run's end owns one notice for both.
- **A4. The apply function computes before it commits.** `applyCachedSortOrder` and `insertNewFilesInSortedOrder` return the order. The apply function waits for render idle, re-checks, then commits synchronously through `alignToLive`. The placement loop yields every 25 files, so a write inside it could resurrect a file moved during a yield. At commit:
  - a held file-op guard declines the apply, and the caller offers Show instead (a direct apply) or puts the offer back (Show);
  - an emptied list is left alone.
- **A5. A stale run releases its own flags.** It writes nothing that belongs to the folder now open, but still clears `isComputingHashes`, its own `sortAbortController` and the button, because nothing else would. `_invalidateSimilarityRun()`, called by `loadFolder` and `_switchToFolderNow`, aborts the run and clears its card.
- **A6. Cache I/O is folder-explicit.** `loadHashCache`, `saveHashCache`, `saveSortCache` and `deleteSortCache` take the run's folder. The hash load and save also check it against `baseFolderPath`: a load that resolves after a switch would otherwise fill the new folder's map with the old folder's paths, which the next save writes under the new folder's cache (F11's write, through `saveSortCache`'s own read-before-write too).
- **A7. Show also refuses while a folder load is in flight.**
- **A8. The end-of-run hash save is skipped when nothing new was hashed.**
- **A9. "A new sort" includes the AI sort.** Its start dismisses a pending offer.

## Existing tests these changes reach (measured on `bfc4cbf`)

- **`tests/like-or-skip-glue.test.js`**:
  - "a failed similarity sort keeps the skips" (~L201) asserts the catch's restore and generation bump. T3 rewrites it to the new rule: the list and `_orderGeneration` are untouched and the skips are kept.
  - "Cancel stays live" (~L1099) asserts the press's notice. T3 changes it to "aborts, notifies nothing itself" (A3).
  - The § 4 control (~L249): T4 removes `applyCachedSortOrder` and `insertNewFilesInSortedOrder` from `EXEMPT` (they no longer assign; the "no stale entries" test enforces it) and adds `_applySimilarityOrder` to `ORDER_CHANGERS`.
  - `similarityCtx`'s `applyCachedSortOrder` mock (~L1063) returns `{ order, stats }` from T4 on; its tests are refusals and never reach it.
  - The change-folder contexts (~L1209) gain `_invalidateSimilarityRun` (T3).
- **`tests/media-viewer-utils.test.js`**:
  - `insertNewFilesInSortedOrder` (6 tests, ~L446) and `applyCachedSortOrder` (4 tests, ~L617) read `ctx.mediaFiles`. T4 switches them to the return value, plus a "does not write `mediaFiles`" assertion.
  - `handleSortByPrediction`'s `makeCtx` (~L1354) gains `_dismissSimilarityOffer: vi.fn()` (T4).
  - The `loadFolder` describe (~L4365) gains `_invalidateSimilarityRun: vi.fn()` (T3).
- **`tests/integration/cached-sort-path.test.js`**: 3 tests read `ctx.mediaFiles`; T4 switches them to the returned order.
- **`tests/recent-folders-glue.test.js`**: the `loadFolder` context (~L134) and the `switchToFolder` contexts (~L609) may reach `_invalidateSimilarityRun`. Run the file after T3 and stub it where it fails.
- **E2E**: `sort-progress.test.js` runs a full sort with no user action, so it takes the direct-apply path and is unaffected. `security-csp-walk.test.js` calls `handleSortBySimilarity()` and is unaffected.

## Task Ordering

1. **T1**, the pure module, comes first.
2. **T2**, Restore Order on three paths, is small and independent; it lands first because T3–T4 rely on `alignToLive`.
3. **T3**, the run, makes the run write only what it owns. Its end still commits inline: it is already fixed (no restore, `alignToLive`, render after commit), but it does not yet offer Show.
4. **T4**, the end, replaces both commit sites with the apply function and adds the offer. It depends on T3's token.
5. **T5**, the E2E, needs T4.

One commit per task.

**Model and effort** (WORKFLOW.md § 1.0):

| | Choice | Why |
|---|---|---|
| SP | ~6 (spec § 13.1) | T1 0.5, T2 0.5, T3 2.25, T4 2, T5 0.75. |
| Execution | **Sonnet 5.5 · `medium`** for T1, T2 and T5, which are fully spelled out. **Opus 5.5 · `medium`** for T3 and T4. | T3–T4 hinge on the ordering "check after every `await`; compute, wait, re-check, then commit with no `await`" and on classifying stale before cancelled. A slip there resurrects or loses files, which is the bug class this PR exists to close. Escalate any RED test that unexpectedly passes to Opus. |
| Switch | Execution needs neither the design model nor a high effort. Subagent-driven execution picks the model per task; a native run should start a fresh session. | |
| Final review | **Deep (`max`)**, per spec § 13.1: the `regression-checker` agent on `media-viewer.js`, then `/code-review max` on the PR **in a separate chat** (memory `feedback_ask_before_in_chat_code_review`: ask first). | The change touches every path that writes the file list during a sort. |

---

## Task 1: Pure module `similarity-sort.js`

**Files:**
- Create: `similarity-sort.js`, `tests/similarity-sort.test.js`
- Modify: `eslint.config.mjs` (block 2c `files`, after `'recent-folders.js'`), `tests/lint-guard.test.js` (`RENDERER_FILES`, after `'recent-folders.js'`), `CLAUDE.md` (§ Architecture tree, after the `recent-folders.js` line)

**Interfaces:**
- Produces:
  - `alignToLive(orderedPaths: string[], liveFiles: {path: string}[]) → {path}[]`. Returns the **live** objects: first those whose path appears in `orderedPaths`, in that order and each once; then every live file whose path `orderedPaths` lacks, in live order. It never mutates its inputs.
  - `takeUserMark(viewer) → { currentPath, currentIndex, pairIndex, historyLength, historyTop, mode }`, where `viewer` has `{ mediaFiles, currentIndex, mlComparePairIndex, moveHistory, isCompareMode, isTournamentMode }`. `currentPath` is `mediaFiles[currentIndex]?.path ?? null`, `historyTop` is the last `moveHistory` entry (by identity) or `null`, and `mode` is `'tournament' | 'compare' | 'single'`.
  - `userActedSince(before, after) → boolean`: true when any of the six fields differs (`!==`).
  - `HASH_SAVE_EVERY = 1000`, `HASH_SAVE_INTERVAL_MS = 60_000`.
  - `isHashSaveDue({ newSinceSave, lastSaveAt, now }) → boolean`: `newSinceSave >= HASH_SAVE_EVERY || (newSinceSave > 0 && now - lastSaveAt >= HASH_SAVE_INTERVAL_MS)`.

- [x] **Step 1: Write the failing tests** in `tests/similarity-sort.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as SimilaritySort from '../similarity-sort.js';

const f = (...names) => names.map((n) => ({ name: n, path: `/f/${n}` }));
const paths = (files) => files.map((x) => x.path);

describe('alignToLive', () => {
    it('keeps the order for files still listed and drops the rest', () => {
        expect(paths(SimilaritySort.alignToLive(['/f/c', '/f/b', '/f/a'], f('a', 'c')))).toEqual(['/f/c', '/f/a']);
    });
    it('appends listed files the order lacks, in list order', () => {
        expect(paths(SimilaritySort.alignToLive(['/f/b'], f('a', 'b', 'c')))).toEqual(['/f/b', '/f/a', '/f/c']);
    });
    it('returns the live objects', () => {
        const live = f('a', 'b');
        expect(SimilaritySort.alignToLive(['/f/b', '/f/a'], live)[0]).toBe(live[1]);
    });
    it('lists a repeated path once', () => {
        expect(paths(SimilaritySort.alignToLive(['/f/a', '/f/a'], f('a', 'b')))).toEqual(['/f/a', '/f/b']);
    });
    it('an empty order gives the live list; an empty live list gives []', () => {
        const live = f('a', 'b');
        const out = SimilaritySort.alignToLive([], live);
        expect(paths(out)).toEqual(['/f/a', '/f/b']);
        expect(out).not.toBe(live);
        expect(SimilaritySort.alignToLive(['/f/a'], [])).toEqual([]);
    });
});

describe('takeUserMark / userActedSince', () => {
    const viewer = (o = {}) => ({
        mediaFiles: f('a', 'b', 'c'), currentIndex: 0, mlComparePairIndex: 0,
        moveHistory: [], isCompareMode: false, isTournamentMode: false, ...o,
    });
    const acted = (before, after) =>
        SimilaritySort.userActedSince(SimilaritySort.takeUserMark(before), SimilaritySort.takeUserMark(after));

    it('an unchanged viewer has not acted', () => {
        expect(acted(viewer(), viewer())).toBe(false);
    });
    it.each([
        ['navigated', { currentIndex: 1 }],
        ['the file under the cursor changed', { mediaFiles: f('b', 'c') }],
        ['moved a file', { moveHistory: [{}] }],
        ['switched to compare', { isCompareMode: true }],
        ['moved through AI compare pairs', { mlComparePairIndex: 2 }],
    ])('%s → acted', (_label, change) => {
        expect(acted(viewer(), viewer(change))).toBe(true);
    });
    it('a different entry at the same history depth has acted', () => {
        expect(acted(viewer({ moveHistory: [{ id: 1 }] }), viewer({ moveHistory: [{ id: 2 }] }))).toBe(true);
    });
    it('the same history entry object has not acted', () => {
        const e = {};
        expect(acted(viewer({ moveHistory: [e] }), viewer({ moveHistory: [e] }))).toBe(false);
    });
});

describe('isHashSaveDue', () => {
    it('is due at 1,000 new hashes, not at 999', () => {
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 1000, lastSaveAt: 0, now: 1 })).toBe(true);
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 999, lastSaveAt: 0, now: 1 })).toBe(false);
    });
    it('is due after 60 s with at least one new hash', () => {
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 1, lastSaveAt: 0, now: 60_000 })).toBe(true);
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 1, lastSaveAt: 0, now: 59_999 })).toBe(false);
    });
    it('is never due with nothing new', () => {
        expect(SimilaritySort.isHashSaveDue({ newSinceSave: 0, lastSaveAt: 0, now: 1e12 })).toBe(false);
    });
});
```

Add `'similarity-sort.js'` to `RENDERER_FILES` in `tests/lint-guard.test.js`. That is the RED test for the ESLint block entry, the pattern G4 used.

- [x] **Step 2: Run, expect failure**

Run: `npx vitest run tests/similarity-sort.test.js tests/lint-guard.test.js`
Expected: `Cannot find module '../similarity-sort.js'`, and the new `HTML sink guard in similarity-sort.js` cases fail.

- [x] **Step 3: Implement** `similarity-sort.js` with the Interfaces above. Header comment in the `like-or-skip.js` style: pure logic, no DOM, IPC or MediaViewer state; spec link; "imported as a namespace (`import * as SimilaritySort`), so an extracted-method test supplies it through `globalThis.SimilaritySort`". Add the file to ESLint block 2c.

`CLAUDE.md` § Architecture, after `recent-folders.js`:

```
├── similarity-sort.js   # Pure ESM: the similarity sort's list rule (alignToLive), the user-acted mark and the hash-save schedule; imported as a namespace (SimilaritySort)
```

- [x] **Step 4: Run, expect pass**: `npx vitest run tests/similarity-sort.test.js tests/lint-guard.test.js`, then `npm run lint`.

- [x] **Step 5: Commit** — `feat(similarity-sort): pure list rule, user-acted mark and save schedule (G2 PR1 T1)`

---

## Task 2: Restore Order keeps every listed file (three paths)

Closes BACKLOG 🟤 [2026-10-12] "Restore Order drops a file whose pre-sort move was undone after the sort", on both paths it names plus Tournament entry (A1).

**Files:**
- Create: `tests/similarity-sort-glue.test.js`
- Modify: `media-viewer.js`: the import (`import * as SimilaritySort from './similarity-sort.js';` after `RecentFolders`); `handleSortBySimilarity`'s restore branch (`:7163`); `handleSortByPrediction`'s toggle-off (`:9583-9586`); `restoreOriginalOrderForTournament` (`:5703-5706`)

**Interfaces:**
- Consumes: `SimilaritySort.alignToLive` (T1).
- Produces: `tests/similarity-sort-glue.test.js`, which sets `globalThis.SimilaritySort`, holds the `extract(name)` helper copied from `like-or-skip-glue.test.js:21-37`, the `media(...names)` factory (`{ name, path: '/f/<name>', size: 10, type: 'image/jpeg' }`) and a `similarityCtx(overrides)` factory. T3 and T4 extend all three.

- [x] **Step 1: Write the failing tests.** For each path, the list on screen is `[c, a, d]`: `b` was moved since the sort, and `d` was restored by an undo and is absent from the snapshot. `originalMediaFiles` is `[a, b, c]`.

```js
describe('Restore Order keeps every listed file (spec § 7, A1)', () => {
    it('similarity Restore Order: snapshot order, moved files dropped, restored files appended', async () => {
        // ctx: isSortedBySimilarity true, the guards' flags false, the stubs the restore branch touches
        await extract('handleSortBySimilarity').call(ctx, false);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'c', 'd']);
        expect(ctx._onOrderChanged).toHaveBeenCalledWith('other');
        expect(ctx.currentIndex).toBe(0);
    });
    it('AI toggle-off: the same rule', async () => {
        // ctx: isSortedByPrediction true, isMlEnabled true, guards false
        await extract('handleSortByPrediction').call(ctx);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'c', 'd']);
    });
    it('Tournament entry: the same rule', () => {
        // ctx: isSortedBySimilarity true
        extract('restoreOriginalOrderForTournament').call(ctx);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['a', 'c', 'd']);
    });
});
```

- [x] **Step 2: Run, expect failure** with `npx vitest run tests/similarity-sort-glue.test.js`. The similarity restore yields `['a','b','c']` (unfiltered, so `b` is resurrected and `d` lost); the AI and tournament paths yield `['a','c']`, losing `d`.

- [x] **Step 3: Implement.** All three paths assign `SimilaritySort.alignToLive(this.originalMediaFiles.map((f) => f.path), this.mediaFiles)`.
  - The AI toggle-off drops its `if (this.originalMediaFiles.length > 0)` guard, since an empty snapshot gives the live list.
  - `restoreOriginalOrderForTournament` keeps its `(isSortedBySimilarity || isSortedByPrediction) && originalMediaFiles.length > 0` condition.
  - Re-read the comment above each changed line.

- [x] **Step 4: Run, expect pass**: the glue file, then `npx vitest run` (the full suite: `like-or-skip-glue`'s control still sees the same three assigning methods).

- [x] **Step 5: Mutation check.** Make `alignToLive` skip its append loop. Expect all three T2 tests and T1's `appends…` test to fail. Restore it and rerun green. Log both runs.

- [x] **Step 6: Commit** — `fix(sort): Restore Order keeps files restored since the sort, on all three paths (G2 PR1 T2)`

---

## Task 3: The run writes only what it owns

Closes BACKLOG 🟤 [2026-10-12] "The similarity sort's catch restores a stale snapshot" (spec F9–F12; § 6.1, 6.3, 6.4, 6.5's CLIP half, 6.6, § 7).

**Files:**
- Modify: `media-viewer.js`:
  - constructor: `this._similarityRunGen = 0;` beside the sort state at `:149-152`;
  - `handleSortBySimilarity`;
  - `loadHashCache`, `saveHashCache`, `saveSortCache`, `deleteSortCache`;
  - `_logSortPerf`;
  - `loadFolder` (beside `_abortInFlightPredictionSort()`, `:3167`);
  - `_switchToFolderNow` (right after its refusals);
  - new `_isStaleSimilarityRun`, `_assertSimilarityRunLive`, `_invalidateSimilarityRun`.
- Modify tests: `tests/similarity-sort-glue.test.js`, `tests/like-or-skip-glue.test.js`, `tests/media-viewer-utils.test.js`, and `tests/recent-folders-glue.test.js` if needed.

**Interfaces:**
- Consumes: `SimilaritySort.isHashSaveDue`, `SimilaritySort.alignToLive` (T1).
- Produces:
  - **`run`**, a local in `handleSortBySimilarity`, captured once after the confirm and the Restore branch: `{ gen, folder, controller, algorithm, kValue, startIndex, startPath, snapshot, mark }`.
    - `gen` is `++this._similarityRunGen`; `folder` is `this.baseFolderPath`.
    - `controller` is a `new AbortController()`, also stored as `this.sortAbortController`.
    - `algorithm` is `this.sortAlgorithm`; `kValue` comes from `sortKValue` (Global Constraints).
    - `startIndex` is `this.currentIndex`; `startPath` is `this.mediaFiles[this.currentIndex]?.path ?? null`; `snapshot` is `[...this.mediaFiles]`.
    - `mark` is `SimilaritySort.takeUserMark(this)`. T4 reads it.
  - `_isStaleSimilarityRun(run) → boolean`: `run.gen !== this._similarityRunGen || run.folder !== this.baseFolderPath`.
  - `_assertSimilarityRunLive(run)`: throws `new Error('Sorting cancelled by user')` when the run is stale or `run.controller.signal.aborted`. It is called after **every** `await` in the run. The catch classifies by state, never by message.
  - `_invalidateSimilarityRun()`: bumps `_similarityRunGen`. If `isComputingHashes`, it also aborts `sortAbortController` and calls `clearProgressNotification()`. T4 adds the offer dismissal.
  - `loadHashCache(folderPath = this.baseFolderPath) → number`: reads `folderPath`; if `folderPath !== this.baseFolderPath` once the read resolves, it loads nothing and returns `0`.
  - `saveHashCache(folderPath = this.baseFolderPath)`: writes nothing unless `folderPath === this.baseFolderPath`; writes to `folderPath`.
  - `saveSortCache(algorithm, sortedPaths, startFile, folderPath = this.baseFolderPath)` and `deleteSortCache(algorithm, folderPath = this.baseFolderPath)`: read and write `folderPath` only.
  - `_logSortPerf(perf)`: the line's label is `perf.label ?? 'AI sort'` and its count is `perf.files ?? this.mediaFiles.length`.

**The run's behaviour** (replaces `:7173-7454`; the guards above `:7173` are unchanged except as noted):

1. **The press.** It now only aborts: drop the `❌ Sorting cancelled` notice at `:7126` (A3).
2. **Capture `run`.** Drop the start-of-run `originalMediaFiles` snapshot (`:7184-7186`); the commit takes it.
3. **Force re-sort**: `deleteSortCache(run.algorithm, run.folder)`, then assert live.
4. **Cache hit** (interim; T4 rewires it):
   - `loadSortCache(run.algorithm)` → assert live → `loadHashCache(run.folder)` → assert live.
   - Take the `originalMediaFiles` snapshot (unless `isSortedBySimilarity`) right before `applyCachedSortOrder(cached, run.algorithm)` → assert live.
   - Its saves pass `run.folder`. The rest is as today.
5. **Hash branch:**
   - `loadHashCache(run.folder)`, then assert live, before the `💾 Cache:` notice.
   - Loop over `run.snapshot`, skipping paths already in `perceptualHashes`: `await computePerceptualHash`, assert live, then store and count. A failed hash counts as skipped, as today.
   - After each stored hash, check `isHashSaveDue({ newSinceSave, lastSaveAt, now: Date.now() })`; when due, `await saveHashCache(run.folder)`, assert live, and reset both counters. Progress runs through `updateSortProgress` at today's cadence.
   - After the loop: fewer than 2 snapshot files with hashes → throw today's message.
   - End save only if `newSinceSave > 0` (A8), then assert live.
   - The Simple K notice uses `run.kValue`.
   - `runSortingWorker({ algorithm: run.algorithm, mediaFiles: run.snapshot.map((f) => ({ path: f.path })), hashes: Object.fromEntries(this.perceptualHashes), currentIndex: run.startIndex, maxComparisons: run.kValue })`, then assert live.
6. **CLIP branch** (my call 11):
   - After `kickoffBackgroundExtractionIfEnabled()`, assert live.
   - Collect vectors for `run.snapshot` files only.
   - `runSortingWorker({ algorithm: 'clip', mediaFiles: <snapshot paths>, clipVectors, currentIndex: run.startIndex })`, then assert live.
7. **Both computing branches**:
   - `saveSortCache(run.algorithm, sortedPaths, run.startPath, run.folder)`, then assert live.
   - Then the **interim commit** (T4 replaces it), a synchronous block:
     - take the `originalMediaFiles` snapshot unless `isSortedBySimilarity`;
     - `this.mediaFiles = SimilaritySort.alignToLive(sortedPaths, this.mediaFiles)`;
     - `isSortedBySimilarity = true`; `_onOrderChanged('other')`; `currentIndex = 0`;
     - the success notice; set a local `committed = true`.
8. **catch**, classifying stale first, then aborted, else failed:
   - **stale**: writes nothing (no `perceptualHashes`, cache, list, card or notice).
   - **cancelled / failed**:
     - if `newSinceSave > 0`, `await saveHashCache(run.folder)`;
     - `clearProgressNotification()`;
     - `❌ Sorting cancelled` (`info`) or `` `❌ Error: ${error.message}` `` (`error`);
     - **no list write**: delete the restore at `:7422-7432` and its comment.
9. **finally**:
   - `isComputingHashes = false`;
   - `if (this.sortAbortController === run.controller) this.sortAbortController = null;`
   - the button as today;
   - `this._logSortPerf(perf)`.
10. **After the finally**: render only `if (committed)` (today's `try/showMedia/catch` warning).

**The perf record:** `{ label: 'Similarity sort', start, outcome, files: run.snapshot.length, phases }`.
- `outcome` is `done` on commit, else from the catch.
- Accumulate milliseconds per phase in a local (`null` until the phase first runs).
- The finally builds `phases` in the fixed order `load`, `extract`, `hash` (note `` `new ${newHashes}, skipped ${skipped}` ``), `save` (every hash and sort save summed), `sort`, `apply`, skipping nulls. In T3, `apply` times the interim commit block.

**Wiring:**
- `loadFolder` calls `this._invalidateSimilarityRun()` on the line before `this._abortInFlightPredictionSort()` (`:3167`).
- `_switchToFolderNow` calls it right after its refusals, before `await this.cleanupCurrentMedia()`.
- Update the comment block at `:3158-3165`.

- [x] **Step 1: Write the failing tests** in `tests/similarity-sort-glue.test.js`, extending `similarityCtx`.
  - **Context.** Three images `a, b, c` in `/f`. `computePerceptualHash` is a `vi.fn` resolving `'0101'`, overridable per test.
  - **Stubs.** `runSortingWorker` resolves the reversed snapshot paths. Also stubbed: `loadSortCache` (→ `null`), `loadHashCache` (→ `0`), `saveHashCache`, `saveSortCache`, `deleteSortCache`, `updateSortProgress`, `clearProgressNotification`, `showNotification`, `showMedia`, `_onOrderChanged`, `_logSortPerf`, `kickoffBackgroundExtractionIfEnabled`.
  - **Real methods.** `_isStaleSimilarityRun` and `_assertSimilarityRunLive` are attached from `extract`.
  - **Globals.** `globalThis.window = { electronAPI: { path: { join: (a, b) => `${a}/${b}`, basename: (p) => p.split('/').pop() } } }`; `globalThis.localStorage` holding `sortKValue: '50'`; `globalThis.confirm = () => true`.

```js
describe('the run (spec § 6–7, T3)', () => {
    it('captures the algorithm and K at the press: a change mid-run sorts and saves with the captured ones', async () => {
        // the first computePerceptualHash call sets ctx.sortAlgorithm = 'mst' and sortKValue '7'
        expect(ctx.runSortingWorker).toHaveBeenCalledWith(expect.objectContaining({ algorithm: 'vptree', maxComparisons: 50 }));
        expect(ctx.saveSortCache.mock.calls[0][0]).toBe('vptree');
    });
    it('hashes the snapshot taken at the press, not the live list', async () => {
        // the first hash call splices b out of ctx.mediaFiles and pushes d
        expect(ctx.computePerceptualHash.mock.calls.map((c) => c[0])).toEqual(['/f/a', '/f/b', '/f/c']);
        expect(ctx.runSortingWorker.mock.calls[0][0].mediaFiles).toEqual([{ path: '/f/a' }, { path: '/f/b' }, { path: '/f/c' }]);
    });
    it('the commit drops files moved during the run and keeps files restored during it', async () => {
        // same mid-run change: b moved, d restored
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['c', 'a', 'd']);
    });
    it('Cancel leaves the list as it is and saves the hashes computed so far', async () => {
        // the second hash call aborts ctx.sortAbortController before resolving
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._onOrderChanged).not.toHaveBeenCalled();
        expect(ctx._orderGeneration).toBe(0);
        expect(ctx.saveHashCache).toHaveBeenCalledWith('/f');
        expect(ctx.saveSortCache).not.toHaveBeenCalled();
        expect(ctx.perceptualHashes.has('/f/b')).toBe(false); // the in-flight result is dropped
        expect(ctx.showNotification).toHaveBeenCalledWith('❌ Sorting cancelled', 'info');
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('cancelled');
        expect([ctx.isComputingHashes, ctx.sortAbortController]).toEqual([false, null]);
    });
    it('a failure leaves the list as it is, saves the hashes and reports the error', async () => {
        // only the first file hashes; the others reject
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx.saveHashCache).toHaveBeenCalledWith('/f');
        expect(ctx.showNotification).toHaveBeenCalledWith('❌ Error: Only 1 files have valid hashes. Need at least 2 to sort.', 'error');
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('failed');
    });
    it.each([
        ['another folder opened', (ctx) => { ctx._similarityRunGen++; ctx.baseFolderPath = '/g'; }],
        ['the same folder reopened', (ctx) => { ctx._similarityRunGen++; }],
    ])('a run made stale (%s) writes nothing', async (_label, switchFolder) => {
        // the first hash call runs switchFolder(ctx) and replaces ctx.mediaFiles/perceptualHashes with fresh ones
        expect(ctx.mediaFiles).toBe(newList);
        expect(ctx.perceptualHashes.size).toBe(0);
        for (const m of ['saveHashCache', 'saveSortCache', 'runSortingWorker', 'clearProgressNotification']) {
            expect(ctx[m], m).not.toHaveBeenCalled();
        }
        expect(ctx.showNotification.mock.calls.filter((c) => /cancelled|Error/.test(c[0]))).toEqual([]);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('stale');
        expect([ctx.isComputingHashes, ctx.sortAbortController]).toEqual([false, null]);
    });
    it('saves every 1,000 new hashes and once at the end', async () => {
        // 2,500 snapshot files, none cached (confirm stubbed true)
        expect(ctx.saveHashCache).toHaveBeenCalledTimes(3);
    });
    it('skips the end save when nothing new was hashed', async () => {
        // every snapshot path already in perceptualHashes
        expect(ctx.saveHashCache).not.toHaveBeenCalled();
        expect(ctx.runSortingWorker).toHaveBeenCalledOnce();
    });
    it('a CLIP run sorts the snapshot from the captured start file', async () => {
        // sortAlgorithm 'clip', enableClipFeatures true, clipVectorsNeedExtraction() → true, currentIndex 1,
        // clipCache holding vectors for a, b, c, plus d (in the live list only)
        expect(ctx.runSortingWorker).toHaveBeenCalledWith(expect.objectContaining({ algorithm: 'clip', currentIndex: 1 }));
        expect(Object.keys(ctx.runSortingWorker.mock.calls[0][0].clipVectors)).toEqual(['/f/a', '/f/b', '/f/c']);
    });
    it.each(['cancelled', 'stale'])('a CLIP run %s during its extraction wait writes nothing', async (how) => {
        // kickoffBackgroundExtractionIfEnabled aborts the controller, or bumps the gen
        expect(ctx.runSortingWorker).not.toHaveBeenCalled();
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx.saveHashCache).not.toHaveBeenCalled();
    });
    it('writes one perf record per run', async () => {
        // a clean hash run over a, b, c
        const [perf] = ctx._logSortPerf.mock.calls[0];
        expect(ctx._logSortPerf).toHaveBeenCalledOnce();
        expect(perf).toMatchObject({ label: 'Similarity sort', outcome: 'done', files: 3 });
        expect(perf.phases.map((p) => p[0])).toEqual(['load', 'hash', 'save', 'sort', 'apply']);
        expect(perf.phases[1][2]).toBe('new 3, skipped 0');
    });
});

describe('_invalidateSimilarityRun', () => {
    it('bumps the gen; while a run computes, also aborts it and clears its card', () => { /* … */ });
});
```

Also in `tests/media-viewer-utils.test.js`:
- `_logSortPerf`: `writes the label and file count it is given`. Given `{ label: 'Similarity sort', files: 2, start: 0, outcome: 'offered', phases: [['hash', 10, 'new 2, skipped 0']] }` with `performance.now()` at 1000, it writes `Similarity sort: outcome=offered total=1000ms | hash=10ms (new 2, skipped 0) | files=2`.
- `loadHashCache`: `loads nothing when the folder changed during the read`. The `readFolderCache` mock sets `ctx.baseFolderPath = '/g'` before resolving; expect `perceptualHashes` unchanged and a return of `0`.
- `saveHashCache`: `writes nothing for a folder that is no longer open` (`saveHashCache.call(ctx, '/old')` with `baseFolderPath '/f'` → `writeFolderCache` not called).
- `saveSortCache`: `reads and writes the folder it was given`. The read mock changes `baseFolderPath`; expect `writeFolderCache` called with the given folder.

And in `tests/like-or-skip-glue.test.js`:
- Rename "a failed similarity sort keeps the skips" to `a failed similarity sort leaves the list and the skips as they are`. Its ctx gains `_similarityRunGen: 0`, real `_isStaleSimilarityRun`/`_assertSimilarityRunLive`, `_logSortPerf: vi.fn()` and `saveHashCache: vi.fn()`. Assert `mediaFiles` unchanged, `_orderGeneration` `0`, skips kept, and no `Skipped list cleared` notice.
- "Cancel stays live": the press aborts and `showNotification` is not called.

- [x] **Step 2: Run, expect failure** with `npx vitest run tests/similarity-sort-glue.test.js tests/like-or-skip-glue.test.js tests/media-viewer-utils.test.js`. Expected: the run tests fail on today's code (the live list walked, the restore, no saves on cancel, the stale writes, no `label`); the two rewritten `like-or-skip-glue` tests fail; the four cache I/O tests fail.

- [x] **Step 3: Implement** the behaviour above. Re-read and update the comments at `:7182` (the snapshot now moves to the commit) and the removed catch. Add `_invalidateSimilarityRun: vi.fn()` to the `loadFolder` context in `media-viewer-utils.test.js` (~L4365) and to `like-or-skip-glue.test.js`'s change-folder contexts (~L1209). Run `tests/recent-folders-glue.test.js` and stub it there too wherever a context now fails on it.

- [x] **Step 4: Run, expect pass**: the three files, then `npx vitest run` and `npm run lint`.

- [x] **Step 5: Mutation checks.** Log each run.
  - Delete the `_assertSimilarityRunLive(run)` after `await this.computePerceptualHash(...)`: both stale cases and the cancel test fail.
  - Put back `this.mediaFiles = [...this.originalMediaFiles]` in the catch: the cancel and failure tests fail.

  Restore both and rerun green.

- [x] **Step 6: Commit** — `fix(sort): the similarity run works on a snapshot, saves as it goes, restores nothing and writes nothing once stale (G2 PR1 T3)`

---

## Task 4: How a run ends — one apply function, or Show

Closes BACKLOG 🟤 [2026-10-12] "A similarity-sort result can land under an in-flight render" (spec § 8, my calls 2–3, A4, A7, A9).

**Files:**
- Modify: `media-viewer.js`:
  - `showNotification`; `applyCachedSortOrder`; `insertNewFilesInSortedOrder`;
  - constructor: `this._similarityOffer = null;`;
  - `_invalidateSimilarityRun` (adds the dismissal); `handleSortBySimilarity`; `restoreOriginalOrderForTournament`;
  - `handleSortByPrediction`, at `this.isPredictionSorting = true` (`:9601`);
  - new `_applySimilarityOrder`, `_offerSimilarityOrder`, `_dismissSimilarityOffer`, `_onSimilarityShow`.
- Modify: `CLAUDE.md`, `docs/ARCHITECTURE.md`.
- Modify tests: `tests/similarity-sort-glue.test.js`, `tests/like-or-skip-glue.test.js`, `tests/media-viewer-utils.test.js`, `tests/integration/cached-sort-path.test.js`.

**Interfaces:**
- Consumes: T3's `run`, `_isStaleSimilarityRun`, `_assertSimilarityRunLive`, `_invalidateSimilarityRun`; `SimilaritySort.alignToLive`, `SimilaritySort.takeUserMark`, `SimilaritySort.userActedSince` (T1).
- Produces:
  - **`entry`**: `{ gen, folder, algorithm, sortedPaths: string[] /* basenames, the .sort_cache.json shape */, startFile, doneMessage }`.
    - A computing run builds it after `saveSortCache` with `await window.electronAPI.path.basename(p)` per path, the same conversion `saveSortCache` does.
    - A cache hit builds it as `{ ...cached, algorithm: run.algorithm, gen: run.gen, folder: run.folder, doneMessage }`.
  - `applyCachedSortOrder(cachedData, algorithm) → Promise<{ order: file[], stats: { cached, removed, added } }>`. It never assigns `this.mediaFiles`.
  - `insertNewFilesInSortedOrder(sortedFiles, newFiles, algorithm) → Promise<file[]>`. It never assigns `this.mediaFiles`; the abort throw is unchanged.
  - `_applySimilarityOrder(entry) → Promise<{ applied: true, stats, committedPaths } | { applied: false, reason: 'stale' | 'tournament' | 'busy' | 'empty' }>`. In order:
    1. `const { order, stats } = await this.applyCachedSortOrder(entry, entry.algorithm)`.
    2. `await this._waitForRenderIdle()`.
    3. With **no `await` from here to the commit's end**, decline (writing nothing) if the entry is stale, then if `isTournamentMode`, then if `_fileOpInFlight` (`'busy'`), then if `mediaFiles.length === 0`.
    4. Commit:
       - `if (!this.isSortedBySimilarity) this.originalMediaFiles = [...this.mediaFiles]`;
       - `this.mediaFiles = SimilaritySort.alignToLive(order.map((f) => f.path), this.mediaFiles)`;
       - `isSortedBySimilarity = true`; `_onOrderChanged('other')`; `currentIndex = 0`;
       - the button label `Restore Order`; capture `committedPaths`.
    5. `await this.showMedia()` inside today's try/catch warning.
  - `_offerSimilarityOrder(entry)`: dismisses any earlier offer, then `this._similarityOffer = { entry, element: this.showNotification('Similarity order ready', 'success', { sticky: true, actionButton: 'Show', actionCallback: () => this._onSimilarityShow() }) }`.
  - `_dismissSimilarityOffer()`: `this._similarityOffer?.element?.remove(); this._similarityOffer = null;`.
  - `_onSimilarityShow()`, in order:
    1. No offer, or `isTournamentMode` → return.
    2. A stale entry → dismiss, return.
    3. `_refuseIfFileOpInFlight()` or `_refuseIfFolderLoadInFlight()` → return; the offer stays.
    4. `isComputingHashes || isPredictionSorting` → `Wait for the sort to finish`; the offer stays.
    5. Otherwise dismiss, then `await _applySimilarityOrder(entry)`:
       - applied → `showNotification(entry.doneMessage, 'success')`;
       - `'busy'` → `_offerSimilarityOrder(entry)`;
       - a throw → `` `❌ Error: ${err.message}` `` (`error`).
  - `showNotification(message, type, options)` now returns its element. With `options.sticky`:
    - the class gains `sticky`;
    - neither prune counts or removes it (`.notification:not(.sticky)`, `.notification.info:not(.sticky)`);
    - no auto-close;
    - the action button runs the callback and does **not** close the notification.

    × still closes it.

**The run's end** (replaces T3's interim commit and the cache hit's direct apply):
- **Computing runs** (hash and CLIP), after `saveSortCache` and assert live, build `entry`. Then:
  - `userActedSince(run.mark, takeUserMark(this))` → `_offerSimilarityOrder(entry)`, outcome `offered`;
  - else `_applySimilarityOrder(entry)`, timed as `apply`:
    - applied → success notice, outcome `done`;
    - `'busy'` → offer, outcome `offered`;
    - `'empty'` or `'tournament'` → outcome `done` with nothing written;
    - `'stale'` cannot happen right after assert live, but treat it as stale.
- **Cache hit**: `_applySimilarityOrder(entry)` directly (my call 3).
  - Applied with `stats.added > 0` → `saveHashCache(run.folder)` and `saveSortCache(run.algorithm, committedPaths, committedPaths[0] ?? null, run.folder)`.
  - The `✅ Restored cached …` message as today; `'busy'` → offer.
- **Remove** T3's interim commit, the cache hit's start-of-apply snapshot, the trailing render block after `finally` (`_applySimilarityOrder` renders) and the `committed` flag.

**Dismissals:**
- `handleSortBySimilarity` calls `_dismissSimilarityOffer()` once a press has passed every refusal and the confirm, before the Restore branch. So a refused press keeps the offer, and both a Restore Order press and a new run dismiss it.
- `_invalidateSimilarityRun()` dismisses (a folder switch).
- `restoreOriginalOrderForTournament()` dismisses (Tournament entry).
- `handleSortByPrediction` dismisses where it sets `isPredictionSorting = true` (A9).

- [x] **Step 1: Write the failing tests.**

**T3's run tests from here on**:
- Their `similarityCtx` stubs `_applySimilarityOrder` (`vi.fn` resolving `{ applied: true, stats: { cached: 0, added: 0, removed: 0 }, committedPaths: [] }`), `_offerSimilarityOrder` and `_dismissSimilarityOffer`. With the real apply function, the placement would hash files restored mid-run and change their call lists.
- T3's `the commit drops files moved during the run…` is **deleted**: the commit now lives in `_applySimilarityOrder`, and its placement test below replaces it.
- Every other T3 run test keeps its assertions.

In `tests/similarity-sort-glue.test.js`:

```js
describe('_applySimilarityOrder (spec § 8, A4)', () => {
    it('drops files moved since, places files restored since by similarity, and lands on the start file', async () => {
        // real applyCachedSortOrder + insertNewFilesInSortedOrder (extracted) on the ctx; live [a, c, d, e];
        // entry.sortedPaths ['c', 'a', 'b', 'e']; hashes c 1111, a 0000, e 0011, d 0001
        const r = await apply.call(ctx, entry);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['c', 'a', 'd', 'e']);
        expect(r).toMatchObject({ applied: true, committedPaths: ['/f/c', '/f/a', '/f/d', '/f/e'] });
        expect(ctx.currentIndex).toBe(0);
        expect(ctx._onOrderChanged).toHaveBeenCalledWith('other');
        expect(ctx.isSortedBySimilarity).toBe(true);
    });
    it('computes, waits for an in-flight render, then commits', async () => {
        // applyCachedSortOrder, _waitForRenderIdle and _onOrderChanged mocks each push to `seq`
        expect(seq).toEqual(['compute', 'wait', 'commit']);
    });
    it.each([
        ['busy', (ctx) => { ctx._fileOpInFlight = true; }],
        ['stale', (ctx) => { ctx._similarityRunGen++; }],
        ['tournament', (ctx) => { ctx.isTournamentMode = true; }],
    ])('declines (%s) when the state changed during the wait, writing nothing', async (reason, change) => {
        // the _waitForRenderIdle mock runs change(ctx)
        expect(await apply.call(ctx, entry)).toEqual({ applied: false, reason });
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._onOrderChanged).not.toHaveBeenCalled();
    });
    it('an emptied list is left alone', async () => {
        // ctx.mediaFiles = [] (every file moved away during the run)
        expect(await apply.call(ctx, entry)).toEqual({ applied: false, reason: 'empty' });
        expect(ctx.showMedia).not.toHaveBeenCalled();
    });
    it.each([
        [false, 'takes the Restore Order snapshot now'],
        [true, 'keeps the existing snapshot (forced re-sort)'],
    ])('already sorted %s: %s', async (sorted) => { /* originalMediaFiles === the live list at commit, or unchanged */ });
});

describe('the offer and Show (spec D3, my call 2, A7)', () => {
    it('a new offer replaces an earlier one', () => { /* the first element's remove() called; _similarityOffer.entry is the second */ });
    // ctx carries the real _refuseIfFileOpInFlight and _refuseIfFolderLoadInFlight (extracted)
    it.each([
        ['in Tournament mode', { isTournamentMode: true }, []],
        ['during a file action', { _fileOpInFlight: true }, [['Wait for the move to finish', 'info']]],
        ['during a folder load', { _folderLoadInFlight: true }, [['Wait for the folder to finish loading', 'info']]],
        ['while a sort runs', { isComputingHashes: true }, [['Wait for the sort to finish', 'info']]],
    ])('Show refuses %s and keeps the offer', async (_l, state, notices) => {
        expect(ctx._applySimilarityOrder).not.toHaveBeenCalled();
        expect(ctx._similarityOffer).not.toBeNull();
        expect(ctx.showNotification.mock.calls).toEqual(notices);
    });
    it('Show on a stale offer dismisses it and applies nothing', async () => { /* … */ });
    it('Show applies the offered order and reports it', async () => {
        expect(ctx._applySimilarityOrder).toHaveBeenCalledWith(entry);
        expect(ctx.showNotification).toHaveBeenCalledWith(entry.doneMessage, 'success');
        expect(ctx._similarityOffer).toBeNull();
    });
    it('a busy commit puts the offer back', async () => { /* apply → { applied: false, reason: 'busy' } → _offerSimilarityOrder(entry) */ });
});

describe('how a run ends (my call 3)', () => {
    it('a computed run applies directly when the user did nothing', async () => {
        expect(ctx._applySimilarityOrder).toHaveBeenCalledWith(expect.objectContaining({
            algorithm: 'vptree', sortedPaths: ['c', 'b', 'a'], startFile: 'a', gen: ctx._similarityRunGen, folder: '/f',
        }));
        expect(ctx._offerSimilarityOrder).not.toHaveBeenCalled();
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('done');
    });
    it.each([
        ['navigated', (ctx) => { ctx.currentIndex = 1; }],
        ['rated a file', (ctx) => { ctx.moveHistory.push({}); }],
        ['switched to compare', (ctx) => { ctx.isCompareMode = true; }],
    ])('a computed run offers Show when the user %s during it', async (_l, act) => {
        expect(ctx._offerSimilarityOrder).toHaveBeenCalledOnce();
        expect(ctx._applySimilarityOrder).not.toHaveBeenCalled();
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('offered');
    });
    it('a busy direct apply falls back to Show', async () => { /* … outcome offered */ });
    it('a cache hit applies through the apply function with the captured algorithm', async () => {
        // loadSortCache → { algorithm: 'mst', sortedPaths: [...], timestamp }; sortAlgorithm 'vptree'
        expect(ctx._applySimilarityOrder.mock.calls[0][0]).toMatchObject({ algorithm: 'vptree', gen: ctx._similarityRunGen, folder: '/f' });
    });
    it('a cache hit with new files saves both caches from the committed order', async () => { /* saveSortCache('vptree', committedPaths, committedPaths[0], '/f') */ });
    it('a cancel during the cache-hit placement leaves the list as it is', async () => {
        // real _applySimilarityOrder; the applyCachedSortOrder mock aborts the run's controller, then throws 'Sorting cancelled by user'
        expect(ctx.mediaFiles).toBe(listBefore);
        expect(ctx._logSortPerf.mock.calls[0][0].outcome).toBe('cancelled');
    });
    it('a sort press that passes the refusals dismisses a pending offer; a refused one keeps it', async () => { /* … */ });
    it('Tournament entry and a folder switch dismiss the offer', () => {
        // restoreOriginalOrderForTournament and _invalidateSimilarityRun each call _dismissSimilarityOffer
    });
});
```

In `tests/media-viewer-utils.test.js`:
- The 6 `insertNewFilesInSortedOrder` and 4 `applyCachedSortOrder` tests assert on the returned value (`(await …).map(...)`, `(await …).order`, `.stats`). The two abort tests keep `ctx.mediaFiles` identity, and every test adds `expect(ctx.mediaFiles).toBe(listBefore)`.
- `handleSortByPrediction`'s `makeCtx` gains `_dismissSimilarityOffer: vi.fn()`. One successful-sort test asserts it was called once.

`tests/integration/cached-sort-path.test.js`: the 3 tests take `{ order, stats }`.

`tests/like-or-skip-glue.test.js` § 4 control:
- `ORDER_CHANGERS` gains `'_applySimilarityOrder'`;
- `EXEMPT` loses `applyCachedSortOrder` and `insertNewFilesInSortedOrder`;
- `similarityCtx`'s `applyCachedSortOrder` mock returns `{ order: [...this.mediaFiles].reverse(), stats: { cached: 4, added: 0, removed: 0 } }`.

- [x] **Step 2: Run, expect failure**: `npx vitest run tests/similarity-sort-glue.test.js tests/media-viewer-utils.test.js tests/integration/cached-sort-path.test.js tests/like-or-skip-glue.test.js`. Expected:
  - `Could not find method: _applySimilarityOrder` (the glue file fails to collect);
  - the return-value assertions fail (today `undefined`);
  - the control's "no stale entries" test fails once `EXEMPT` loses the two methods while they still assign.

- [x] **Step 3: Implement** the Interfaces and the run's end above.

- [x] **Step 4: Docs.**
  - `CLAUDE.md`:
    - **§ Async Patterns**, a new bullet after the file-op bullet:

      > - Similarity sort run (G2 PR 1, [spec](docs/superpowers/specs/2026-10-19-g2-hash-sort-off-renderer-design.md)):
      >   - **The press.** `handleSortBySimilarity` captures a `run`: `_similarityRunGen` (bumped by each run and by `_invalidateSimilarityRun()`, which `loadFolder` and `_switchToFolderNow` call), the folder, the algorithm and K, the start file and a snapshot of `mediaFiles`. It never reads the live list or the settings again.
      >   - **Stale runs.** After every `await`, `_assertSimilarityRunLive(run)` ends a stale or cancelled run. A stale run writes nothing that belongs to the folder now open; it only releases its own flags.
      >   - **Cancel and failure** restore nothing and save the hashes so far. Hashes are also saved every 1,000 hashes or 60 s.
      >   - **The apply function.** Every similarity order reaches the screen through `_applySimilarityOrder(entry)`. It computes the order (`applyCachedSortOrder` returns it), waits for render idle, then commits synchronously through `SimilaritySort.alignToLive`, or declines while a file action holds the guard.
      >   - **Direct or Show.** A computing run applies directly unless the user acted since the press (`SimilaritySort.userActedSince`: the on-screen file, `moveHistory` or the mode). Otherwise it offers a sticky "Similarity order ready — Show", dismissed by ×, a folder switch, a new sort or Tournament entry.
      >   - **Restore Order** (similarity, AI toggle-off, Tournament entry) is `alignToLive(originalMediaFiles, live)`.
    - **§ Async Patterns**, the file-op bullet: amend "A sort ALREADY running can still apply its result mid-action" to name the AI sort. The similarity sort's apply declines at a held guard.
    - **§ Detected Patterns, Error Handling**: add "`showNotification(…, { sticky: true })` stays until closed, is exempt from the 5-notification and info prunes, and leaves its action button's closing to the caller. `showNotification` returns its element."
    - **§ Cache Management, Sort cache**: add "`applyCachedSortOrder` returns `{ order, stats }` and, like `insertNewFilesInSortedOrder`, never writes `mediaFiles`. Hash/sort cache I/O takes the run's folder."
  - `docs/ARCHITECTURE.md` § Similarity Sorting Flow:
    - the first box: "compute hashes for snapshot images (or load from `.hash_cache.json`)";
    - the last box: "Renderer: apply now, or offer Show if the user acted (one apply function)".

- [x] **Step 5: Run, expect pass**: the four test files, then `npx vitest run`, `npm run lint`, `npm run format:check`.

- [x] **Step 6: Mutation checks.** Log each run.
  - Move `await this._waitForRenderIdle()` after the commit: `computes, waits … then commits` fails.
  - Delete the `_fileOpInFlight` decline: the `busy` case fails.
  - In `applyCachedSortOrder`, put back a `this.mediaFiles = …` write: the "writes nothing" assertions and the § 4 control fail.

  Restore each and rerun green.

- [x] **Step 7: Commit** — `fix(sort): one apply function for every similarity order; a run the user acted during ends with Show (G2 PR1 T4)`

---

## Task 5: E2E — Show, Cancel, folder switch

**Files:**
- Create: `tests/e2e/similarity-sort.test.js`

**Interfaces:**
- Consumes: T3–T4 behaviour; the helpers `launchApp`, `closeApp`, `loadFolder`, `seedLocalStorage`, `createTempFixtureDir`, `waitForMedia` (`tests/e2e/helpers/electron-app.js`).
- Produces, local to the file:
  - `gateHashing(page)`: wraps `window.mediaViewer.computePerceptualHash`. It counts calls in `window.__hashCalls` and holds call 2 and later on `window.__hashGate`, which `window.__openHashGate()` resolves.
  - `startSort(page)`: `window.__sortDone = window.mediaViewer.handleSortBySimilarity()`, not awaited.
  - `finishSort(page)`: opens the gate, then awaits `window.__sortDone`.
  - `waitForIdle(page)`: waits until neither `isLoading` nor `mediaNavigationInProgress` is set.

Fixtures: the default three PNGs. Tests that rate also seed `customLikeFolder` and `customDislikeFolder` (`moveCurrentFile` refuses without both). Read the list order from `mediaFiles`; never assume it.

- [x] **Step 1: Write the tests.** Wait for `__hashCalls >= 2` before acting mid-run.

```js
test('a run the user waited for applies at once', async () => {
    // no gate; await handleSortBySimilarity()
    expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(true);
    await expect(page.locator('.notification.sticky')).toHaveCount(0);
});

test('a run the user moved on during ends with Show, which survives 5 s and other notices, then applies from the start file', async () => {
    // gate; startSort; record startPath = mediaFiles[0].path; waitForIdle; nextMedia(); finishSort
    const offer = page.locator('.notification.sticky', { hasText: 'Similarity order ready' });
    await expect(offer).toBeVisible();
    expect(await page.evaluate(() => window.mediaViewer.isSortedBySimilarity)).toBe(false);
    await page.waitForTimeout(5000);
    await page.evaluate(() => { for (let i = 0; i < 6; i++) window.mediaViewer.showNotification(`n${i}`, 'info'); });
    await expect(offer).toBeVisible();
    await offer.locator('.notification-action').click({ force: true });
    await expect(offer).toHaveCount(0);
    // isSortedBySimilarity true, currentIndex 0, mediaFiles[0].path === startPath
});

test('a file rated during the run is absent after Show', async () => {
    // seed like/dislike folders; gate; startSort; waitForIdle; moveCurrentFile('like'); finishSort; click Show
    // the moved file's path is not in mediaFiles; mediaFiles.length === 2
});

test('Show after switching to compare mode renders the first pair from the start file', async () => {
    // gate; startSort; switchMode('compare'); finishSort; click Show
    // isCompareMode true; compareLeftFile.path === startPath (or mediaFiles[0].path === startPath and currentIndex 0)
});

test('a folder switch removes the Show message', async () => { /* offer visible → loadFolder(page, otherDir) → toHaveCount(0) */ });
test('entering Tournament mode removes the Show message', async () => { /* offer visible → switchMode('tournament') → toHaveCount(0) */ });

test('× then Sort applies the saved order at once without hashing', async () => {
    // offer visible → click its .notification-close → reset __hashCalls → await handleSortBySimilarity()
    // isSortedBySimilarity true; __hashCalls === 0; no .notification.sticky
});

test('Cancel leaves the list as it is and keeps the finished hashes', async () => {
    // record paths; gate; startSort; await __hashCalls >= 2; handleSortBySimilarity() (= Cancel); finishSort
    // mediaFiles paths unchanged; isSortedBySimilarity false; no .notification.sticky; no .sort_cache.json in dir;
    // .hash_cache.json keys === [basename of the first listed file]
});

test('a folder switch mid-run writes nothing to either folder and leaves the new list alone', async () => {
    // B = createTempFixtureDir(['normal-320x240.png', 'wide-short-64x4.png'])
    // gate; startSort in A; loadFolder(page, B.dir); finishSort
    // B has no .hash_cache.json and no .sort_cache.json; A has neither either (the stale run saved nothing);
    // mediaFiles names === B's two names; isComputingHashes false; no .notification.sticky
});
```

- [x] **Step 2: Run against T4's code**: `npx playwright test tests/e2e/similarity-sort.test.js --reporter=line`. Expected: all pass. These are E2E for behaviour T3–T4 already built (their unit tests were the RED tests). Make the RED proof here with mutations instead:
  - Remove the sticky exclusion from the 5-notification prune: `…survives 5 s and other notices…` fails.
  - Remove `_invalidateSimilarityRun()` from `loadFolder`: `a folder switch mid-run…` fails (an old-folder write lands, or the offer survives).

  Restore each and rerun green. Log the runs.

- [x] **Step 3: Stability**: `for i in 1 2 3; do npx playwright test tests/e2e/similarity-sort.test.js --reporter=line || break; done` passes three runs in a row.

- [x] **Step 4: Commit** — `test(e2e): similarity sort Show, Cancel and folder switch (G2 PR1 T5)`

---

## Task 6: Restore Order waits for an in-flight render (user-approved follow-up, 2026-10-19)

The final review found this as a pre-existing race. The user chose to fix it on this branch ("Agree, fix it now"). Restore Order's `showMedia()` returns early on `isLoading`. If Restore Order is pressed while a file is still rendering, the restored list and cursor sit under a screen that still shows another file, and a rating key would then move a file the user has not seen. M6 (the run renders after releasing its flags) makes this reachable right after a sort lands.

**Files:**
- Modify: `media-viewer.js` — the Restore Order branch of `handleSortBySimilarity`, and the toggle-off branch of `handleSortByPrediction`.
- Test: `tests/similarity-sort-glue.test.js`, `tests/e2e/similarity-sort.test.js`.

**Interfaces:**
- Consumes: `_waitForRenderIdle()` (existing; waits while `isLoading || mediaNavigationInProgress`, capped at 2 s), `_refuseIfFileOpInFlight()`, `_refuseIfFolderLoadInFlight()`, `_invalidateSimilarityRun()`, `SimilaritySort.alignToLive`.
- Produces: no new methods.

**Behaviour, the same for both paths:**
1. Everything up to and including `this._invalidateSimilarityRun()` stays as it is.
2. `await this._waitForRenderIdle()`.
3. With no `await` from here until the commit ends, re-check, in this order:
   - the path no longer applies (`!this.isSortedBySimilarity` for the similarity path, `!this.isSortedByPrediction` for the AI path; for example, a second press already restored, or a folder load reset it), `this.isTournamentMode`, `this.isComputingHashes`, `this.isPredictionSorting` → return silently;
   - `this._refuseIfFileOpInFlight()` → return (it shows `Wait for the move to finish`);
   - `this._refuseIfFolderLoadInFlight()` → return (it shows `Wait for the folder to finish loading`).
4. The existing synchronous restore (`alignToLive`, the flags, `_onOrderChanged('other')`, the indices), then `await this.showMedia()`, then the existing notice and label.

**Steps:**
- [x] **Step 1: Write the failing tests.** In `tests/similarity-sort-glue.test.js`:
  - For each path: `Restore Order waits for an in-flight render, then restores and renders`. The `_waitForRenderIdle`, `_onOrderChanged` and `showMedia` mocks push `'wait'`, `'commit'` and `'render'` to `seq`. Expect `seq` to equal `['wait', 'commit', 'render']`.
  - For the similarity path, `it.each` over a change made inside the `_waitForRenderIdle` mock:
    - already restored (`isSortedBySimilarity = false`);
    - a forced re-sort started (`isComputingHashes = true`);
    - an AI sort started (`isPredictionSorting = true`);
    - Tournament mode;
    - a file action (`_fileOpInFlight = true`, expect the notice `Wait for the move to finish`);
    - a folder load (`_folderLoadInFlight = true`, expect `Wait for the folder to finish loading`).

    In every case, expect `mediaFiles` to be the same array, `_onOrderChanged` not called, and `showMedia` not called. Use the real `_refuseIfFileOpInFlight` and `_refuseIfFolderLoadInFlight`.
  - For the AI path: the same `it.each`, over already restored (`isSortedByPrediction = false`), `isComputingHashes`, a file action, and a folder load.
- [x] **Step 2: Write the E2E test** in `tests/e2e/similarity-sort.test.js`: `Restore Order pressed during a render restores only after the render, and the screen shows the restored first file`.
  - Navigate to the second listed file first (`nextMedia()`, after `waitForIdle`). The sort starts from the start file, so the sorted first file then differs from the folder's first file.
  - Run the sort to completion. It applies directly, because nothing changed during it. Then `waitForIdle`.
  - Set `window.mediaViewer.isLoading = true` to simulate a render in flight, and start Restore Order without awaiting it (`window.__restoreDone = window.mediaViewer.handleSortBySimilarity()`).
  - After about 200 ms, expect the list to be still sorted: `isSortedBySimilarity` true.
  - Set `isLoading = false`, await `__restoreDone`, then `waitForIdle`.
  - Expect `isSortedBySimilarity` false, `currentIndex` 0, and the file shown on screen to be `mediaFiles[0]`. Find how the existing E2E files read the displayed file in single mode and reuse that; do not invent a new probe if one exists.
- [x] **Step 3: Run, expect failure.**
  - The unit tests fail on today's code: there is no wait, so the restore commits at once and `seq` lacks `'wait'`.
  - The E2E test fails: the restore lands at once, and `showMedia` returns early on the simulated `isLoading`.
  - Record both.
- [x] **Step 4: Implement** the behaviour above, on both paths. Re-read the comments on both branches.
- [x] **Step 5: Run, expect pass:**
  - the glue file;
  - `npx vitest run`;
  - `npm run lint`;
  - `npx playwright test tests/e2e/similarity-sort.test.js --reporter=line`, three runs in a row.
- [x] **Step 6: Mutation check.** Delete the `await this._waitForRenderIdle()` on the similarity path. The similarity unit tests and the new E2E test must fail. Restore with `git checkout -- media-viewer.js` only after the change is committed; until then, revert the one line by hand and confirm with `git diff`.
- [x] **Step 7: Report, not fix:** does any key reach a file action while the Tournament config modal is open? `restoreOriginalOrderForTournament` restores the list without a render, and the modal opens over the old file.
- [x] **Step 8: Commit** (controller): `fix(sort): Restore Order waits for an in-flight render before it restores (G2 PR1 T6)`.

## Finish (after Task 5)

- [x] `npx vitest run` (1,800 passed, 1 skipped at `cd1f24e`) and `npm run lint` (0 errors, 2 pre-existing warnings) are green. `npm run format:check` flags only the user's untracked `CLAUDE-SECURITY-2026*` folders; every changed file passes `prettier --check`. `git status --short` is clean apart from this plan.
- [x] `npx playwright test`: the full suite ran in the pre-push hook. The first push hit one failure, a premise fix (see the Progress Log). The second push passed 204, with 6 skipped.
- [x] **Final-review E2E mutations**, run 2026-10-19 after the user's go-ahead.
  - Baseline: 10/10.
  - Skipping Show's render fails only Review Focus #3's test, at the `compareLeftFile` check (expected `blue-1x1.png`, got `red-1x1.png`).
  - Skipping the computing path's `saveSortCache` fails only #5's test, at the `.sort_cache.json` check.
  - Both changes were restored through `git checkout`, and three stability runs passed 10/10 each.

  The steps as written:
  - make Show skip its render: Review Focus #3's test (`Show after switching to compare mode…`) must fail;
  - make the computing path skip `saveSortCache`: Review Focus #5's test (`× then Sort…`) must fail.

  Restore each change and rerun green. Then run the file three times for stability.
- [x] **Grep sweep** across code, tests **and comments**: done by the final whole-branch review (check 5). Every stale line it found was fixed in `bdfc8e0`, plus `docs/PROJECT_CONTEXT.md:39` in `cd1f24e`.
- [x] `wc -l media-viewer.js`: 11,802 at `05b5bae`, and **11,944 at `cd1f24e`** after the fix wave, against 11,439 at `bfc4cbf` (**+505**).
- [x] The `regression-checker` agent ran on `bfc4cbf..05b5bae`. It found 1 Important (the hash-cache overwrite after an unreadable read, fixed as F5) and 4 Minor (fixed or deferred; see the Progress Log).
- [x] Pushed (`1b3bc79`). Push with `git push -u origin g2-hash-sort-off-renderer` (pre-push runs the full E2E suite). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [x] **PR #85** opened (https://github.com/GoodAlex223/media-viewer/pull/85). Open the PR: spec and plan links; D3, D7 and my calls 2, 3, 11; amendments A1–A9; RED→GREEN and the mutation runs per task; test deltas; the Residuals. **Ask the user** before running `/code-review` in this chat; the default is a separate chat at `max`. Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

1. **A per-run hash map.** `perceptualHashes` is folder-wide state shared with `removeFileFromList`, which deletes a moved file's hash mid-run. A map owned by the run, merged at its end, would make "a stale run writes no hashes" structural instead of checked after each `await`. It would also fix a spec E2 gap the final review found: a file hashed, moved and restored (undo) during the hash phase loses its hash, because `removeFileFromList` deletes it and undo does not restore it, so the file lands at the end instead of by similarity. 🟤 candidate.
2. **The hash cache never prunes.** `saveHashCache` writes every entry in the map, including files long gone from the folder, and the load restores them all. Pruning to the listed files at save would bound the cache. Since the final fix wave's merge-on-save (F5), entries for moved-away files also persist across saves. The cache is keyed by file name with no size/mtime check, so a different file later given the same name reuses the old hash. 🟤 candidate.
3. **Show has no keyboard path.** The sticky message is mouse-only; a shortcut or focus on arrival would help a keyboard-driven user. 🟤 candidate.

## Residuals for Extract (found while designing and planning — not fixed here)

- **"The similarity sort leaves `isSortedByPrediction` set"** stays open (spec § 12). PR 1 makes it visible in a new way: Show applied over an AI order in compare mode pairs from `mlComparePairIndex`/the score list, not from `mediaFiles[0]`. → BACKLOG 🟤, the same entry (append the observation).
- **`_waitForRenderIdle` commits anyway after 2 s.** It is shared with the AI sort; a stranded `isLoading` lets an order land under a render. Pre-existing. → BACKLOG 🟤 if no entry covers it.

**Deferred review findings (execution, 2026-10-19).** Task reviews, the final whole-branch review and the regression check found these and judged them safe to defer. Each one → BACKLOG 🟤 at closeout, one entry per line. Related lines may share an entry, tagged with each other.
- **Test gaps, low risk:**
  - `takeUserMark`'s tournament branch of `mode` has no test, and nothing asserts its shape (for example, `currentPath` is `null` for an empty list). Tournament entry refuses while a run computes, so the run never sees that mode change.
  - The Tournament-entry Restore Order test checks only `mediaFiles`, not that both sorted flags clear or that `_onOrderChanged('other')` fires.
  - The AI toggle-off's dropped `originalMediaFiles.length > 0` guard has no test that pins it.
  - No test pins `_switchToFolderNow`'s order: refusals first, then `_invalidateSimilarityRun()`.
- **Test harness:**
  - `extract()`'s regex in the four glue test files handles one level of parentheses in a signature. Anything deeper fails loudly with "Could not find method".
  - The `like-or-skip-glue` § 4 control scans method headers one line at a time. A method whose signature Prettier wraps, and which assigns `this.mediaFiles`, would escape the control. It is latent: the final review found no wrapped header inside the class today. A guard test that fails on a wrapped header would close it.
  - The E2E `afterEach` does not null `electronApp`/`page`, so a later `beforeEach` failure would `closeApp` a stale app (a noisy teardown, never a false pass).
  - The E2E Cancel test relies on the snapshot's hash order: call 1 is ungated.
- **Small behaviour gaps:**
  - A Cancel during a save re-saves the same entries: `newSinceSave` resets after the assert, not before.
  - A run made stale by reopening the same folder still swaps that folder's own cache into the map in `loadHashCache`. The data is correct, but the "a stale run writes no hashes" rule is not kept literally.
  - The cache-hit `save` phase time is lost from the perf line when the first save goes stale.
  - The basename conversion before the apply is timed in no perf phase. It is synchronous in preload, so negligible.
  - `runSortingWorker`'s `complete`/`error` handlers null `this.sortingWorker` without an identity check. This is pre-existing; one run at a time.
  - A cache hit that falls back to Show offers a message without the cached/new/removed stats, which exist only after the apply.
  - × closes the offer's element but leaves `_similarityOffer` set until the next dismissal. Harmless; Show is not clickable.
  - A cancel during a cache hit's placement does not save the placement's hashes. Spec § 6.3; pre-existing.
  - After a folder switch, the Sort button reads "Sort by Similarity" while the old run unwinds (at most one in-flight hash). A click there is swallowed silently.
  - Show's placement rewrites a plain-text progress card that was already on screen (the shared element) into the sort-card form. Show then leaves it in place, with Cancel hidden, until that card's owner next updates it.
- **Found outside PR 1's scope** (the final review's "declined to judge" list):
  - ~~Restore Order renders without waiting for an in-flight render.~~ **Fixed in this PR as Task 6**, which the user approved.
  - **The Tournament entry modals, found in Task 6 Step 7** (a static trace, not run). While the Tournament config modal or the resume prompt is open, single-mode keys (`Q`, `W`, `1`, `F`) still reach file actions. Because `restoreOriginalOrderForTournament` restores the list without a render, those keys act on `mediaFiles[0]` while another file is on screen, so they can move a file the user has not seen. The resume prompt never moves focus into the Rounds box, so the very first key press counts. → Append these two facts to the existing BACKLOG entry "Refuse shortcut dispatch while a modal is open" (BACKLOG.md:641). Rate it by what it can move.
  - Turning CLIP off during a CLIP run, or with a CLIP offer pending: the run's save recreates the `'clip'` sort cache the toggle just deleted, and the offer survives.
  - `scoreComplete`/`sortComplete` clear the progress card unconditionally.
  - `applyPredictionSortResult` drops live files that are missing from the AI result.
  - A failed folder listing returns before the run is invalidated (the run still writes only to its own folder).

## Closeout (after the merge, on `main`)

- [ ] **Extract**: Improvements and Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] From: G2 PR 1 closeout`. Check off the three § 12 entries (catch restore, in-flight render, Restore Order) **in the closeout commit**.
- [ ] **Archive** this plan (`git mv` to `docs/archive/plans/`, indexed under Archived Plans in `docs/README.md`); remove its Active/Current Plans rows.
- [ ] **DONE.md** entry. WEEKLY: G2 stays open (PR 2 follows), so mark PR 1 on the G2 item and the Wednesday row only; the Summary-Table Status flips at PR 2's closeout.
- [ ] **Spec**: a post-implementation note for anything the code departed from.
- [ ] **Propagation check**: re-read `CLAUDE.md`, `docs/ARCHITECTURE.md` and the changed comments for a late correction that did not reach them.
- [ ] **Memory**: a session file and its MEMORY.md line; durable lessons only.
- [ ] **Next**: PR 2's plan, on a new branch from `main`.

## Progress Log

- **2026-10-19** — Branch `g2-hash-sort-off-renderer` from `bfc4cbf`. Brainstormed with a spike (Electron 39.1.2, real `Liked_1`/`Liked_2` images); spec `47d870c`, approved ("Design looks right"). D7 split G2 into two PRs; this plan is PR 1. Planning-time measurements gave amendments A1–A9 and the "existing tests reached" list.
- **2026-10-19** — Plan approved by the user ("Looks good"); execution method: subagent-driven (T1/T2/T5 Sonnet 5.5 · medium, T3/T4 Opus 5.5 · medium; controller commits).
- **2026-10-19** — **T1** `84449d6`: RED = module missing; the lint-guard RED proved by removing the ESLint 2c entry (10 HTML-sink cases fail). Review clean.
- **2026-10-19** — **T2** `43c9cdd`: RED 3/3 with the predicted values; mutation (skip `alignToLive`'s append loop) failed 3 T2 + 3 T1 tests. Review clean.
- **2026-10-19** — **T3** `184a3e6` + review fix `41f6a78`. RED: 20 behavioural failures; both mutations caught. The task review found a run made stale during the **worker phase** left an orphaned progress card and held `isComputingHashes` in the new folder for the rest of the worker's synchronous sort (the worker reads its abort flag only after its loop). Fix: `runSortingWorker` terminates its own worker and rejects on abort, and ignores late messages (Cancel in the worker phase is now immediate too).
- **2026-10-19** — **T4** `22f0a98` + `ca1d975`. Controller rulings beyond the plan: **P1** (the run clears the card after the apply, Show clears it only if no sort started); **R-T4a** (the placement checks liveness after every await, before any hash store, progress call or return — a stale placement would otherwise put the old folder's hashes into the new folder's map, A6); **R-T4b** (liveness belongs to the entry: `_applySimilarityOrder(entry, signal)`, so a Cancel during the render wait no longer commits, and an AI sort started during Show declines it as `'sorting'` without re-offering, A9). The extract/method-header regexes in four test files were widened for the new signatures. Review clean (7 minors deferred to the final review).
- **2026-10-19** — **T5** `05b5bae`: 10 E2E tests, 3 stable runs. Two plan defects found by the mutation proof and fixed in the tests: 6 `info` notices never reach the 5-notification prune (the info prune holds info at 2), so the test fires `success` notices; the mid-run folder-switch test passed without `loadFolder`'s invalidate (the folder half of the token catches it), so a same-folder-reload test was added.
- **2026-10-19** — `wc -l media-viewer.js`: **11,802** vs 11,439 at `bfc4cbf` (**+363**). PR 1 adds the run/apply/offer machinery; PR 2 is where hashing moves out.
- **2026-10-19** — **Final review** (Opus, `max`) of `3af82c3..05b5bae`: with fixes, 0 Critical. The 4 Important findings:
  - Review Focus #1 failed at the run level;
  - Show could be overtaken by a later order change;
  - Cancel in the CLIP branch did nothing for the whole extraction;
  - the #3 and #5 E2E tests could not fail.

  The **regression check** found 1 Important (an unreadable hash-cache read followed by a periodic save could shrink `.hash_cache.json`) and 4 Minor.
- **2026-10-19** — **Fix wave** `bdfc8e0` + `cd1f24e`:
  - F1 an emptied list ends the run quietly (outcome `declined`);
  - F2 Restore Order, the AI toggle-off and start, and Tournament entry call `_invalidateSimilarityRun()`;
  - F3 the CLIP kickoff takes the run's signal (R-F3b): the first ruling's precondition was disproved by the fixer's probe;
  - F4 the two E2E tests rewritten (not run);
  - F5 `saveHashCache` merges into the file on disk;
  - M1–M8 comments, the Show notice after a folder switch, the folder-load decline, docs, `declined`, `_applySimilarityOrder` neither renders nor sets the label, the card's Cancel hidden when no sort owns it, Show clears only a card it drew;
  - R-F6 a cache hit with new files renders before its saves (a pre-existing window where a rating key could move an unseen file).

  The scoped re-review (Opus) found all addressed and nothing new broken. One incident: a fixer's mutation-restore step copied an old scratchpad backup over `media-viewer.js`. It rebuilt from `bdfc8e0`, and the controller and the re-reviewer both verified that nothing earlier was reverted. Unit suite: 1,800 passed, 1 skipped.
- **2026-10-19** — **E2E on hold** at the user's request. The push waits too, because pre-push runs the full E2E suite.
- **2026-10-19** — User go-ahead for E2E. The final-review E2E mutations both caught their targets (Review Focus #3 and #5), and the file passed 3 stability runs at 10/10. Pushing; pre-push runs the full E2E suite.
- **2026-10-19** — First push blocked by pre-push E2E: 203 passed, 6 skipped, **1 failed**. `sort-progress.test.js` "Cancel button aborts the active sort controller" drew the card with a controller but no sort flag. Under M7, Cancel is hidden when no sort owns the card, so the test's premise no longer matched a real sort, which sets its flag before drawing the card. The test now sets `isComputingHashes = true` (a premise fix, per Finish). Both tests in that file pass.
- **2026-10-19** — Second push: full E2E **204 passed, 6 skipped**. **PR #85** opened. Waiting on the user for: a `/code-review` (default: a separate chat at `max`), the Restore-Order-during-render question (fix on this branch or BACKLOG), and the merge.
- **2026-10-19** — **T6** (user: "Agree, fix it now") `8928825` + review fix `08cdb55`. Both Restore Order paths wait for an in-flight render. They then re-check that the order did not change during the wait (`_orderGeneration`), and then the path flag, Tournament, a running sort, a file action and a folder load; after that they restore and render with no await between. RED→GREEN: 17 unit tests + 1 E2E. Removing the wait fails 7 unit tests and the E2E. The task review added the order-generation check: a cached similarity sort committing during the AI toggle-off's wait would otherwise make the restore land on the AI order. The scoped re-review found nothing open. Unit tests: 1,817 passed, 1 skipped; the E2E file 11/11 ×3. Step 7 found that keys reach file actions under the Tournament modals; this is pre-existing, and recorded in Residuals → the BACKLOG.md:641 entry.

## Key Discoveries

- **Posting `abort` to `sorting-worker.js` stops nothing mid-sort.** Its loops are synchronous, so `onmessage` runs only after they end. A stale run kept `isComputingHashes` and kept re-creating the progress card in the new folder for the rest of the sort. The fix is to terminate the worker and reject at once (T3 review).
- **Moving every file away is itself a user action.** `moveHistory` grows, so the run offered Show over an empty screen before the apply's `'empty'` decline could run. Review Focus #1 was pinned at the apply layer, but the defect lived in the run (final review).
- **An apply with no flag of its own is exposed to every later order change.** R-T4b's per-entry liveness stopped a foreign Cancel from ending Show. But a Restore Order press, Tournament entry, or an AI sort that started and finished during Show's apply still landed under it, and could overwrite the Restore Order snapshot. Every order-changing intent now invalidates the run counter (final review F2).
- **More save points widen a cache's loss surface.** `read-folder-cache` returns `null` for any read error. Periodic and cancel saves after an unreadable read would replace a 13k-entry `.hash_cache.json` with the few hashes computed so far. Before this PR, saves only ran after a complete run, which hid this (regression check; merge-on-save, F5).
- **Moving a notice to the run's end needs the run to end promptly.** A3 moved the cancel notice to the end of the run. The CLIP branch's extraction wait ignored the run's abort, so Cancel was silent for minutes (final review F3).
- **Two E2E checks could not fail**, which only the mutation proof showed:
  - six `info` notices never reach the 5-notification prune, because the info prune holds info notices at 2;
  - the folder half of the run token hid a missing counter bump in a different-folder test, so only a same-folder reload discriminates (T5).
- **The final review found two more Review Focus E2E tests that could not fail** (#3 and #5): the start file was already the left file of the compare pair, and a full re-sort also hashes nothing once `.hash_cache.json` exists.
