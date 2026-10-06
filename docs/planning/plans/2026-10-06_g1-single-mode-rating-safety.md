# G1. Single-Mode Rating Safety — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Task Reference**: [WEEKLY.md](../WEEKLY.md) § G1 (🔵 🏆, 7 SP → ~8 SP); TODO 🔴 [2026-10-04] "Stop a held Like key from firing overlapping file moves in single mode"; BACKLOG 🔵 [2026-10-04] "Add a special-folder hotkey to single mode", "Fix the single-mode Like/Dislike tooltips that show old hotkeys"
**Spec**: [2026-10-06-g1-single-mode-rating-safety-design.md](../../superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md) (committed `e385e0c`, user-approved 2026-10-06)
**Created**: 2026-10-06
**Status**: Implemented — Tasks 1–7 + final-review fix committed; awaiting push / PR
**Last Updated**: 2026-10-06 (execution + final review)
**Branch**: `g1-single-mode-rating-safety`

**Goal:** A held rating key fires one action, two file actions never run at once, the held-Like blank-view / dead-controls end state is reproduced and explained (or bounded), and single mode gets a `1` special hotkey plus like/dislike tooltips derived from the live bindings.

**Architecture:** Three independent defences, each with its own RED test: a keydown filter that drops auto-repeat for every bound action except `next`/`previous`; one exclusive `_fileOpInFlight` flag held across the five file-acting methods (refuse, never queue; undo refuses with a notice); and a narrowed `forceVideoCleanup` that only releases its own video. The hotkey and tooltips ride on the guarded path and the existing derivation helper, renamed `_shortcutSuffix`.

**Tech Stack:** Electron 39 renderer (`media-viewer.js`, ES module, no bundler), Vitest 4 (node environment, extract-method tests), Playwright + Electron E2E (`tests/e2e/`), Prettier 3, ESLint 9 flat config.

## Global Constraints

- **Prettier**: `tabWidth=4`, `useTabs=false`, `singleQuote`, `semi`, `trailingComma=es5`, `printWidth=120`, `arrowParens=always`, `endOfLine="lf"`. The `PostToolUse` hook formats every edited JS file; lint-staged formats staged files at commit. `docs/` and `*.md` are Prettier-ignored.
- **ESLint**: `eqeqeq`, `prefer-const`, `no-var`, `no-shadow` (warn), `no-unused-vars` (warn; prefix unused with `_`). New multi-line `if` bodies get braces.
- **Vitest runs in the node environment.** Methods are tested by `extractMethod` / `extractAsyncMethod` (source text → `Function`, invoked with `.call(mockCtx)`), so an extracted method **cannot see module-level constants** — a test that needs one assigns it to `globalThis` first (existing pattern: `globalThis.DEFAULT_SHORTCUTS = extractDefaultShortcuts()`). The mock ctx must supply every `this.*` the method touches.
- **Method names and signatures of the five guarded methods do not change** — `extractAsyncMethod('moveCurrentFile')` etc. must keep finding them, and the existing mock contexts (which lack `_fileOpInFlight`, read as `undefined` → falsy) must keep passing unmodified.
- **Exact strings** (copied from the spec):
  - Undo-refusal notice: `'A move is still in progress — press Undo again in a moment'`, type `'info'`.
  - `REPEATABLE_ACTIONS = new Set(['next', 'previous'])`.
  - `DEFAULT_SHORTCUTS.single.special = 'Digit1'`; `ACTION_LABELS.special = 'Move to special folder'`.
  - Titles: `'Like'`, `'Dislike'`, `'Like Left'`, `'Dislike Left'`, `'Like Right'`, `'Dislike Right'` + `_shortcutSuffix(mode, action)`.
- **Every new test must fail against the unfixed code before the fix lands** — record the failure message in the Progress Log. A RED test that passes is zero coverage: find out why before continuing.
- **E2E**: `workers: 1`; `afterEach` null guards (`if (electronApp)`, `if (tmpFixtures)`); the `.media-container` overlay blocks pointer events — use `page.evaluate` or `{ force: true }`; **E2E localStorage leaks across runs** (no per-run `userDataDir`) — any test that writes shortcuts must reset them in a `finally`.
- **Pre-commit hook**: secret scan → docs-index guard → lint-staged → `npx vitest run`. Never `--no-verify`. Pre-push runs the full E2E suite for any non-docs push.
- **Grep rule (CLAUDE.md § Best Practices)**: when renaming a symbol or changing behaviour a comment describes, grep code, tests **and comments**, and re-read every comment attached to changed code.
- **Reindent**: wrapping a method body in `try { … } finally { … }` re-indents it. Review diffs with `git diff -w`.
- **Commit trailer**: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A held key the dispatcher does not own** — e.g. holding a digit in a Settings number field. Expected: native repeat still works; the filter never calls `preventDefault` on an unbound key. Pinned in Task 2 (`_isSuppressedRepeat` with `action` `undefined`/`null`).
2. **A fast double-tap or a burst of mouse clicks** (`repeat: false`, invisible to the filter). Expected: exactly one file moves, no `ENOENT` toast, controls stay alive. Pinned in Task 4 (unit: second call never reaches `moveFile`; E2E: rapid `#likeBtn` clicks on a video).
3. **A move that fails or bails out mid-way** (rename `ENOENT`, declined folder-creation dialog). Expected: the flag is released, the next action works. Pinned in Task 4 (unit: failed move, early return inside the guarded section, failed undo restore) and Task 5 (failed pair move).
4. **Undo pressed during the session's very first move** (`moveHistory` still empty). Expected: the in-flight notice, not "No moves to undo". Pinned in Task 4 (unit).
5. **A user who already bound `1` to something in single mode.** Expected: their key keeps doing what they bound it to; `special` is left unbound and they are warned once — no file moved by their key. Pinned in Task 6 (unit: stored `next: 'Digit1'` → `special === null`, collision recorded, reverse map keeps `next`).

---

## File Structure

| File | Action | Responsibility after this change |
| --- | --- | --- |
| `media-viewer.js` | Modify | `REPEATABLE_ACTIONS` + `_isSuppressedRepeat` + both keydown branches (T2); `forceVideoCleanup` narrowing (T3); `_fileOpInFlight` field, guard in `moveCurrentFile` / `moveToSpecialFolder` / `handleCancel` / `nextMedia` / `previousMedia` (T4) and `moveComparePair` / `applyBulkRating` (T5); `special: 'Digit1'`, label, `executeAction` case (T6); `_shortcutSuffix` rename, eight derived titles, refresh from `saveShortcut`/`resetShortcuts` (T7) |
| `tests/keyboard-shortcuts.test.js` | Modify | `_isSuppressedRepeat` tests (T2); flipped single-mode shape / reverse-map / suffix tests, single `special` routing, single collision (T6); rename + refresh assertions (T7) |
| `tests/media-viewer-utils.test.js` | Modify | `forceVideoCleanup` (T3); guard tests + module-level `gatedApi` helper (T4, T5); rewritten single special-button test (T6); `updateRatingButtonsState` tooltips + rename (T7) |
| `tests/e2e/rating-safety.test.js` | Create | Held Like / held Next (T2); rapid clicks on a video, undo during a move (T4); compare Q-then-E (T5); held `1` (T6) |
| `tests/e2e/overlay-controls.test.js` | Modify | Overlay like/dislike titles follow a remap (T7) |
| `index.html` | Modify | `#likeBtn`/`#dislikeBtn` bare fallback titles + comment (T7) |
| `CLAUDE.md` | Modify | Keyboard Shortcuts: repeat rule (T2); Async Patterns + E2E: the guard (T4, T5); Git Insights shortcut bullets: single `special`, `_shortcutSuffix`, derived like/dislike titles (T6, T7) |
| `docs/superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md` | Modify | § 11 Phase 0 result (T1) |
| `tests/e2e/__probe-held-like.test.js` | Create, then delete | Throwaway Phase 0 probe — **never staged** |

**Live-surface preflight** (plans README step 4) — every live surface asserting a claim G1 changes, diffed against the table above: CLAUDE.md L167–169 (Keyboard Shortcuts — no repeat rule yet) ✅ T2; CLAUDE.md L186 (`_specialShortcutSuffix omits the suffix`) ✅ T7; CLAUDE.md L187 (single `#specialBtn` "stays bare"; like/dislike "stay hardcoded … offered-and-declined") ✅ T6/T7; `media-viewer.js` comments on `updateSpecialButtonsState`, `_specialShortcutSuffix`, `executeAction`'s `leftSpecial`, `_mergeModeShortcuts` (~L9431 names `_specialShortcutSuffix`), `applyBulkRating`'s re-entry comment ✅ in their tasks; `index.html` ~L185 special-title comment, ~L196/~L200 like/dislike titles ✅ T7. **Checked, no claim to change**: README.md (lists no shortcuts), `docs/ARCHITECTURE.md`, `PROJECT.md`, the F1 help overlay (single grid is rendered from `shortcuts.single`). **Not changed, deliberately**: BACKLOG / WEEKLY / TODO / docs/README.md / the archived G3 plan, which name `_specialShortcutSuffix` or the old behaviour as history — the TODO/BACKLOG entries are checked off at closeout, not rewritten.

---

## Premise Corrections Made at Planning

1. **The pinned-test count is neither four (WEEKLY/BACKLOG) nor five (spec § 5.4).** Re-read 2026-10-06, the tests that change are: `tests/keyboard-shortcuts.test.js` ~L54–62 (single-mode shape `toEqual` — in no earlier list), ~L88–93 (`single.special` undefined), ~L447–456 (reverse map `single['Digit1']` undefined), ~L729–733 (single suffix `''`); `tests/media-viewer-utils.test.js` ~L6224–6229 is **rewritten, not flipped** — its ctx is hand-built (`single: { like: 'KeyQ' }`), so it passes before and after; only its premise becomes false. ~L577–586 ("single mode does nothing for either special action") **stays valid** — `leftSpecial`/`rightSpecial` remain no-ops in single — and only its comment changes.
2. **`saveShortcut`/`resetShortcuts` gain a call, so seven existing test contexts need `updateRatingButtonsState: vi.fn()`** (`tests/keyboard-shortcuts.test.js` ~L778, ~L809, ~L829, ~L873, ~L904, ~L956, ~L975 — every ctx that already carries `updateSpecialButtonsState: vi.fn()`). Not optional chaining: production must call it unconditionally.
3. **Inline `try/finally`, not a runner.** A runner (`_withFileOp(() => this._impl())`) would move each body into a new method, breaking every existing `extractAsyncMethod` context and the source-order test that reads `methodSource('moveComparePair')`. Inline keeps names and contexts intact at the cost of a re-indent (review with `git diff -w`).
4. **No guarded method calls another guarded method** (verified by grep at planning: the callers are `handleLike`/`handleDislike`, the compare handlers, `handleTournamentSpecial`, `handleBothGood`/`handleBothBad`, `executeAction`, and button listeners). A nested call would be silently refused — Task 5 Step 9 re-verifies after the code lands, together with the spec § 5.1 per-call-site check of `showCompareMedia`'s `< 2` branch.
5. **Spec § 6 test 2 ("held Like with a video on screen") is driven by a burst of `#likeBtn` clicks** (Task 4 Step 9), not a held key. Once Task 2's filter lands, a held key can no longer start overlapping moves, so a held-key version would pass on the filter alone and prove nothing about the guard or the `forceVideoCleanup` narrowing. Clicks reproduce the same ~33 ms cadence through a path the filter cannot see. The held-key evidence is Phase 0 (Task 1) plus Task 2's held-Like test.
6. **Some new tests pass on unfixed code by construction**, and are labelled where they appear: the "releases the flag after …" tests (Tasks 4–5; the flag starts `false` and unfixed code never writes it), the held-Next test (Task 2, a must-not-fire check), and the two rewritten single special-button tests (Task 6, hand-built context). Each sits beside a RED test that proves the behaviour it pins exists.

## Task Ordering

Task 1 (Phase 0) gates everything: a **refuted** hypothesis stops the plan for a report. Tasks 2 and 3 are independent defences and each could ship alone. Task 4 introduces the flag; Task 5 extends it to compare and bulk. Task 6 must follow Task 4 (the hotkey uses the guarded path). Task 7 follows Task 6 (it renames the helper whose single-mode expectations Task 6 flips). One commit per task.

**Model and effort** (WORKFLOW.md § 1.0): SP 7 → ~8 (spec § 9) · execution mode: **user to choose** (recommendation at the end of this plan) · execute on **Opus 5.5 · `medium`** — switch effort now (`/effort medium`; the cache survives); the hotkey and tooltip tasks (6, 7) are Sonnet-eligible spelled-out work, but a model switch drops the cache in a one-session run, so stay on Opus unless the session is compacted anyway · escalate to `high` for Task 1's interpretation and for any RED test that unexpectedly passes · final review **thorough (`/code-review high`)** plus a `regression-checker` pass — WEEKLY's first guess, confirmed by the spec.

---

## Task 1: Phase 0 — reproduce the held-Like end state (spec § 4)

**Files:**
- Create (throwaway, never staged): `tests/e2e/__probe-held-like.test.js`
- Modify: `docs/superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md` (§ 11)

**Interfaces:**
- Consumes: the E2E helpers in `tests/e2e/helpers/electron-app.js` (`launchApp`, `closeApp`, `loadFolder`, `seedLocalStorage`, `createTempFixtureDir`).
- Produces: § 11 outcome (**confirmed** / **refuted** / **not reproduced**) and the value `SLOW_NEXT` — the fixture name that, placed right after the video, produced the stuck state (`'normal-320x240.png'`, or `'big.jpg'` if the large generated image was needed). Task 4 uses `SLOW_NEXT`.

- [x] **Step 1: Confirm the tree is clean and nothing has been fixed yet**

Run: `git status --short && git log --oneline -1`
Expected: empty status; HEAD is `e385e0c` or the plan commit on top of it. `media-viewer.js` must be unmodified — the probe measures the shipped code.

- [x] **Step 2: Write the probe**

Create `tests/e2e/__probe-held-like.test.js`:

```js
// THROWAWAY Phase 0 probe (G1 spec § 4). NEVER COMMIT — delete after § 11 is written.
// Runtime-only instrumentation: nothing in media-viewer.js changes.
import { test, expect } from '@playwright/test';
import { readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { launchApp, closeApp, loadFolder, seedLocalStorage, createTempFixtureDir } from './helpers/electron-app.js';

test.setTimeout(90_000);

async function holdKey(page, key, repeats) {
    await page.keyboard.down(key);
    for (let i = 0; i < repeats; i++) {
        await page.waitForTimeout(33);
        await page.keyboard.down(key); // Playwright: every down after the first carries repeat:true
    }
    await page.keyboard.up(key);
}

async function waitForIdle(page) {
    await page.waitForFunction(() => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress);
}

async function arrange(page, lead) {
    await waitForIdle(page);
    await page.evaluate(async (names) => {
        const mv = window.mediaViewer;
        const rank = (f) => (names.indexOf(f.name) === -1 ? names.length : names.indexOf(f.name));
        mv.mediaFiles.sort((a, b) => rank(a) - rank(b));
        mv.currentIndex = 0;
        await mv.showMedia();
    }, lead);
    await page.waitForFunction((first) => window.mediaViewer.mediaFiles[0]?.name === first, lead[0]);
    await waitForIdle(page);
}

async function instrument(page) {
    await page.evaluate(() => {
        const mv = window.mediaViewer;
        const probe = { repeats: 0, moveCalls: 0, fvcCalls: 0, clobbers: [], ignored: [], errors: [] };
        window.__probe = probe;
        document.addEventListener('keydown', (e) => e.repeat && probe.repeats++, true);
        const origMove = mv.moveCurrentFile.bind(mv);
        mv.moveCurrentFile = (...args) => {
            probe.moveCalls++;
            return origMove(...args);
        };
        const cleaned = new WeakSet();
        const origFvc = mv.forceVideoCleanup.bind(mv);
        mv.forceVideoCleanup = () => {
            probe.fvcCalls++;
            if (mv.currentMedia) cleaned.add(mv.currentMedia);
            return origFvc();
        };
        const origErr = mv.showError.bind(mv);
        mv.showError = (message, options) => {
            probe.errors.push(message);
            return origErr(message, options);
        };
        // clobber = forceVideoCleanup nulling an element it was never asked to clean
        let cm = mv.currentMedia;
        Object.defineProperty(mv, 'currentMedia', {
            configurable: true,
            get: () => cm,
            set: (v) => {
                if (v === null && cm && !cleaned.has(cm) && /forceVideoCleanup/.test(new Error().stack)) {
                    probe.clobbers.push(cm.tagName);
                }
                cm = v;
            },
        });
        // ignored-load = a displayed element's load/error arrives while currentMedia is something else
        for (const type of ['load', 'loadedmetadata', 'error']) {
            document.addEventListener(
                type,
                (e) => {
                    const t = e.target;
                    if (t instanceof Element && t.classList.contains('media-display') && mv.currentMedia !== t) {
                        probe.ignored.push(`${type}:${t.tagName}`);
                    }
                },
                true
            );
        }
    });
}

async function snapshot(page, likeDir) {
    const state = await page.evaluate(() => {
        const mv = window.mediaViewer;
        return {
            ...window.__probe,
            isLoading: mv.isLoading,
            navInProgress: mv.mediaNavigationInProgress,
            currentMediaTag: mv.currentMedia ? mv.currentMedia.tagName : null,
            mediaEls: [...document.querySelectorAll('.media-display')].map(
                (el) => `${el.tagName}:${getComputedStyle(el).display}`
            ),
            spinner: mv.loadingContainer.classList.contains('show'),
            remaining: mv.mediaFiles.length,
        };
    });
    state.liked = (await readdir(likeDir)).length;
    // Does Like still act? (handleLike guards on isLoading — a stuck flag makes this a no-op.)
    const before = state.remaining;
    await page.evaluate(() => window.mediaViewer.handleLike());
    await page.waitForTimeout(1500);
    state.likeStillActs = (await page.evaluate(() => window.mediaViewer.mediaFiles.length)) < before;
    return state;
}

async function setup(fixtures, { bigImage = false } = {}) {
    const tmp = await createTempFixtureDir(fixtures);
    const { electronApp, page } = await launchApp();
    await seedLocalStorage(page, { customLikeFolder: tmp.likeDir, customDislikeFolder: tmp.dislikeDir });
    if (bigImage) {
        const b64 = await page.evaluate(() => {
            const c = document.createElement('canvas');
            c.width = 4000;
            c.height = 3000;
            const ctx = c.getContext('2d');
            const img = ctx.createImageData(c.width, c.height);
            for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
            ctx.putImageData(img, 0, 0);
            return c.toDataURL('image/jpeg', 0.95).split(',')[1];
        });
        await writeFile(join(tmp.dir, 'big.jpg'), Buffer.from(b64, 'base64'));
    }
    await loadFolder(page, tmp.dir);
    await waitForIdle(page);
    return { tmp, electronApp, page };
}

for (const run of [
    { name: 'a-images-only', fixtures: ['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png'], lead: null },
    { name: 'b-video-then-320', fixtures: ['tiny.mp4', 'normal-320x240.png', 'red-1x1.png', 'green-1x1.png'], lead: ['tiny.mp4', 'normal-320x240.png'] },
    { name: 'b2-video-then-big', fixtures: ['tiny.mp4', 'red-1x1.png', 'green-1x1.png'], lead: ['tiny.mp4', 'big.jpg'], bigImage: true },
]) {
    test(`PROBE ${run.name}`, async () => {
        const { tmp, electronApp, page } = await setup(run.fixtures, run);
        try {
            if (run.lead) await arrange(page, run.lead);
            await instrument(page);
            await holdKey(page, 'q', 20);
            await page.waitForTimeout(3000);
            const state = await snapshot(page, tmp.likeDir);
            console.log(`PROBE-${run.name} ${JSON.stringify(state)}`);
            // Sentinels: the probe must prove it exercised the target.
            expect(state.repeats).toBeGreaterThanOrEqual(15);
            expect(state.moveCalls).toBeGreaterThanOrEqual(2);
            if (run.lead) expect(state.fvcCalls).toBeGreaterThanOrEqual(1);
        } finally {
            await closeApp(electronApp);
            await tmp.cleanup();
        }
    });
}
```

- [x] **Step 3: Run runs (a) and (b)**

Run: `npx playwright test tests/e2e/__probe-held-like.test.js -g "a-images-only|b-video-then-320" --reporter=list`
Expected: both tests pass their sentinels and print one `PROBE-…` JSON line each. A failed sentinel means the probe did not exercise the target (no repeat events reached the page, or only one move started) — fix the probe, do not interpret its output.

- [x] **Step 4: Run (b2) only if (b) did not stick**

"Stuck" means `isLoading === true` or `navInProgress === true` with `likeStillActs === false`. If (b) is stuck, skip this step. Otherwise:
Run: `npx playwright test tests/e2e/__probe-held-like.test.js -g "b2-video-then-big" --reporter=list`

- [x] **Step 5: Classify the outcome (spec § 4)**

| Outcome | Condition |
| --- | --- |
| **Confirmed** | (a): `liked > 1`, `errors` contain `Failed to move file`, **not** stuck. (b) or (b2): stuck, `clobbers.length ≥ 1`, `ignored.length ≥ 1`. |
| **Refuted** | (a) is stuck, **or** (b)/(b2) is stuck with `clobbers.length === 0`. → **STOP.** Write § 11 with the numbers, commit it (Step 7), and report to the user before any further task. |
| **Not reproduced** | Neither (b) nor (b2) sticks. Overlap + `ENOENT` in (a)/(b) still count as reproduced. Continue; § 11 bounds the end-state account to "mechanism traced, not reproduced". |

Set `SLOW_NEXT` = `'normal-320x240.png'` if (b) stuck, `'big.jpg'` if only (b2) did, else `'normal-320x240.png'` (not reproduced — the Task 4 E2E still guards the one-file / no-`ENOENT` outcome).

- [x] **Step 6: Delete the probe and write § 11**

Run: `rm tests/e2e/__probe-held-like.test.js && git status --short`
Expected: empty (the probe was never tracked).

Replace the body of spec § 11 ("Not yet run — …") with:

```markdown
**Run 2026-10-06** on `main` @ `e385e0c`'s code (no fix applied), E2E harness, Playwright `keyboard.down` ×21 at ~33 ms.

| Run | liked | `ENOENT` errors | stuck (`isLoading` / `navInProgress`) | clobbers | ignored loads | Like still acts | media elements |
| --- | --- | --- | --- | --- | --- | --- | --- |
| (a) images only | <n> | <n> | <yes/no> | <n> | <n> | <yes/no> | <list> |
| (b) video → 320×240 | … | … | … | … | … | … | … |
| (b2) video → 4000×3000 JPEG | <… or "not run — (b) stuck"> | | | | | | |

**Outcome: <Confirmed / Refuted / Not reproduced>.** <One paragraph: what the numbers show against F3's predictions; for Not reproduced, exactly what was and was not reproduced and what the committed E2E therefore cannot prove.> `SLOW_NEXT` for the Task 4 end-state E2E: `<value>`.
```

Fill every `<…>` from the `PROBE-…` lines. Also change the spec's `**Status**:` line to `Approved 2026-10-06; § 11 Phase 0 recorded`.

- [x] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md
git commit -m "docs(g1): Phase 0 result — <outcome> (spec § 11)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Log the outcome and `SLOW_NEXT` in this plan's Progress Log. **If Refuted: stop here and report.**

---

## Task 2: Key-repeat filter (spec D2, § 5.2)

**Files:**
- Modify: `media-viewer.js` (after `ACTION_LABELS` ~L60; keydown listener ~L2179–2271; new method beside `buildKeyString` ~L9460)
- Modify: `tests/keyboard-shortcuts.test.js`
- Create: `tests/e2e/rating-safety.test.js`
- Modify: `CLAUDE.md` (Keyboard Shortcuts, ~L167–169)

**Interfaces:**
- Produces: module constant `REPEATABLE_ACTIONS: Set<string>`; method `_isSuppressedRepeat(e: {repeat: boolean}, action: string|null|undefined): boolean`. E2E helpers in `tests/e2e/rating-safety.test.js` reused by Tasks 4–6: `holdKey(page, key, repeats = 20)`, `waitForIdle(page)`, `spyOnErrors(page)`, `errors(page)`, `countFiles(dir)`.

- [x] **Step 1: Write the failing unit tests**

In `tests/keyboard-shortcuts.test.js`, add below `extractActionLabels()` (~L39):

```js
function extractRepeatableActions() {
    const match = source.match(/const REPEATABLE_ACTIONS\s*=\s*(new Set\(\[[^\]]*\]\));/);
    if (!match) throw new Error('Could not find REPEATABLE_ACTIONS');
    return new Function(`return ${match[1]}`)();
}
```

Add a new describe after `describe('buildKeyString', …)` (~L420):

```js
describe('_isSuppressedRepeat (held-key filter, G1)', () => {
    const _isSuppressedRepeat = extractMethod('_isSuppressedRepeat');
    let origRepeatable;

    beforeEach(() => {
        origRepeatable = globalThis.REPEATABLE_ACTIONS;
        globalThis.REPEATABLE_ACTIONS = extractRepeatableActions();
    });

    afterEach(() => {
        globalThis.REPEATABLE_ACTIONS = origRepeatable;
    });

    it('lets navigation auto-repeat', () => {
        expect(_isSuppressedRepeat.call({}, { repeat: true }, 'next')).toBe(false);
        expect(_isSuppressedRepeat.call({}, { repeat: true }, 'previous')).toBe(false);
    });

    it('suppresses the auto-repeat of every other bound action, undo included', () => {
        const actions = ['like', 'dislike', 'special', 'undo', 'leftLike', 'rightDislike', 'leftSpecial'];
        for (const action of [...actions, 'bothGood', 'bothBad', 'bothWin', 'bothLose']) {
            expect(_isSuppressedRepeat.call({}, { repeat: true }, action), action).toBe(true);
        }
    });

    it('never suppresses a first (non-repeat) press', () => {
        expect(_isSuppressedRepeat.call({}, { repeat: false }, 'like')).toBe(false);
        expect(_isSuppressedRepeat.call({}, { repeat: false }, 'undo')).toBe(false);
    });

    // A held key the dispatcher does not own — typing in a Settings number field — must keep its
    // native repeat; a preventDefault there would break the field.
    it('never suppresses an unbound key', () => {
        expect(_isSuppressedRepeat.call({}, { repeat: true }, undefined)).toBe(false);
        expect(_isSuppressedRepeat.call({}, { repeat: true }, null)).toBe(false);
    });

    it('is consulted by both keydown branches (main and empty-state)', () => {
        expect(source.match(/this\._isSuppressedRepeat\(e, action\)/g)).toHaveLength(2);
    });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: FAIL — `Could not find method: _isSuppressedRepeat` (the describe throws while collecting).

- [x] **Step 3: Implement the constant and the method**

In `media-viewer.js`, directly after the `ACTION_LABELS` object (~L60):

```js
// Actions a held key may auto-repeat. Everything else — every rating, special and bulk action,
// tournament picks and draws, and undo — fires once per physical press: a held Q used to move
// files at the OS key-repeat rate (~30/s, G1). Navigation is the one place hold-to-repeat is wanted.
const REPEATABLE_ACTIONS = new Set(['next', 'previous']);
```

Directly above `buildKeyString(e) {` (~L9460):

```js
    // True for an auto-repeat keydown of a bound action outside REPEATABLE_ACTIONS. An unbound key
    // (action undefined) is never suppressed: the dispatcher does not own it, and a held key in a
    // text or number field must keep repeating.
    _isSuppressedRepeat(e, action) {
        return Boolean(action) && e.repeat === true && !REPEATABLE_ACTIONS.has(action);
    }
```

- [x] **Step 4: Call it from both keydown branches**

Empty-state branch (~L2184), replace:

```js
                const action = this.shortcutReverseMap[mode]?.[keyStr];
                // The undo shortcut must also fire for a tournament whose engine still holds an
```

with:

```js
                const action = this.shortcutReverseMap[mode]?.[keyStr];
                if (this._isSuppressedRepeat(e, action)) {
                    e.preventDefault();
                    return;
                }
                // The undo shortcut must also fire for a tournament whose engine still holds an
```

Main branch (~L2265), replace:

```js
            const action = this.shortcutReverseMap[mode]?.[keyStr];
            if (action && !this.isLoading) {
```

with:

```js
            const action = this.shortcutReverseMap[mode]?.[keyStr];
            if (this._isSuppressedRepeat(e, action)) {
                e.preventDefault();
                return;
            }
            if (action && !this.isLoading) {
```

- [x] **Step 5: Run the unit tests**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: PASS (all, including the five new).

- [x] **Step 6: Write the E2E file with the held-Like and held-Next tests**

Create `tests/e2e/rating-safety.test.js`:

```js
// G1 single-mode rating safety (docs/superpowers/specs/2026-10-06-g1-single-mode-rating-safety-design.md).
// A held key (Playwright: every keyboard.down after the first carries repeat:true) and overlapping
// file actions must never move more than the one file the user meant.
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

/** Press `key`, send `repeats` auto-repeat keydowns ~33 ms apart (the OS repeat rate), release. */
async function holdKey(page, key, repeats = 20) {
    await page.keyboard.down(key);
    for (let i = 0; i < repeats; i++) {
        await page.waitForTimeout(33);
        await page.keyboard.down(key);
    }
    await page.keyboard.up(key);
}

/** No render in flight — handlers guarding on these flags would otherwise no-op. */
async function waitForIdle(page) {
    await page.waitForFunction(
        () => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress,
        null,
        { timeout: 10_000 }
    );
}

/** Record every showError call (DOM toasts are capped at five, so the DOM undercounts). */
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

async function errors(page) {
    return page.evaluate(() => window.__errors);
}

async function countFiles(dir) {
    return (await readdir(dir)).length;
}

test.describe('Held keys fire once (G1)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png']);
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

    test('a held Like moves exactly one file', async () => {
        await holdKey(page, 'q');
        await page.waitForTimeout(1500);
        await waitForIdle(page);

        expect(await countFiles(tmpFixtures.likeDir)).toBe(1);
        expect(await page.evaluate(() => window.mediaViewer.mediaFiles.length)).toBe(3);
        expect(await errors(page)).toEqual([]);
    });

    // The must-not-fire half: navigation is the one action allowed to repeat. Passes before and
    // after the fix — its job is to catch an over-broad filter.
    test('a held Next still auto-repeats', async () => {
        await page.evaluate(() => {
            const mv = window.mediaViewer;
            window.__navs = 0;
            const original = mv.nextMedia.bind(mv);
            mv.nextMedia = () => {
                const before = mv.currentIndex;
                original();
                if (mv.currentIndex !== before) window.__navs++;
            };
        });
        await holdKey(page, 's');
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => window.__navs)).toBeGreaterThanOrEqual(2);
    });
});
```

- [x] **Step 7: Prove the held-Like test is RED on the unfixed code**

Run: `git stash push media-viewer.js && npx playwright test tests/e2e/rating-safety.test.js --reporter=list; git stash pop`
Expected: `a held Like moves exactly one file` FAILS (`likeDir` > 1 and/or `ENOENT` errors — matching Phase 0 run (a)); `a held Next still auto-repeats` PASSES. Record both in the Progress Log. If the held-Like test passes on the unfixed code, stop and find out why.

- [x] **Step 8: Run the E2E file on the fixed code**

Run: `npx playwright test tests/e2e/rating-safety.test.js --reporter=list`
Expected: 2 passed.

- [x] **Step 9: Document the rule in CLAUDE.md**

In `CLAUDE.md` § Detected Patterns → **Keyboard Shortcuts**, append a bullet after the `loadShortcuts()` bullet (~L169):

```markdown
- Key auto-repeat: both keydown branches (main and empty-state) drop an `e.repeat` event for every bound action outside `REPEATABLE_ACTIONS` (`next`, `previous`) via `_isSuppressedRepeat(e, action)`, calling `preventDefault` — a held rating key used to move files at the OS repeat rate (G1). An unbound key is never suppressed (a held key in a Settings field keeps repeating). A burst of discrete presses or clicks (`repeat: false`) is the in-flight guard's job, not this filter's.
```

- [x] **Step 10: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js tests/e2e/rating-safety.test.js CLAUDE.md
git commit -m "fix(g1): a held key fires bound actions once — repeat only for next/previous" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: `forceVideoCleanup` releases only its own video (spec D5, § 5.3)

**Files:**
- Modify: `media-viewer.js` (`forceVideoCleanup`, ~L1773–1806)
- Modify: `tests/media-viewer-utils.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `forceVideoCleanup()` contract — nulls `this.currentMedia` only when it is still the video captured at entry.

- [x] **Step 1: Write the failing unit tests**

Append to `tests/media-viewer-utils.test.js`:

```js
describe('forceVideoCleanup releases only its own video (G1 D5)', () => {
    const forceVideoCleanup = extractAsyncMethod('forceVideoCleanup');
    let origWindow;

    beforeEach(() => {
        origWindow = globalThis.window;
        globalThis.window = {}; // the method probes window.gc
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.window = origWindow;
    });

    function fakeVideo() {
        return {
            tagName: 'VIDEO',
            parentNode: {},
            currentTime: 3,
            pause: vi.fn(),
            load: vi.fn(),
            removeAttribute: vi.fn(),
            removeEventListener: vi.fn(),
            remove: vi.fn(),
        };
    }

    it('nulls currentMedia when it is still the video it cleaned', async () => {
        const video = fakeVideo();
        const ctx = { currentMedia: video, videoEventListeners: [], isBeingCleaned: false };
        const done = forceVideoCleanup.call(ctx);
        await vi.advanceTimersByTimeAsync(100);
        await done;
        expect(ctx.currentMedia).toBeNull();
        expect(video.remove).toHaveBeenCalledOnce();
        expect(ctx.isBeingCleaned).toBe(false);
    });

    // The held-Like end state (spec F3): a render installs the next media during the 100 ms wait.
    it('leaves alone a currentMedia that a render installed during its wait', async () => {
        const video = fakeVideo();
        const next = { tagName: 'IMG' };
        const ctx = { currentMedia: video, videoEventListeners: [], isBeingCleaned: false };
        const done = forceVideoCleanup.call(ctx);
        ctx.currentMedia = next;
        await vi.advanceTimersByTimeAsync(100);
        await done;
        expect(ctx.currentMedia).toBe(next);
        expect(video.remove).toHaveBeenCalledOnce();
    });
});
```

- [x] **Step 2: Run to verify the second test fails**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "forceVideoCleanup releases only"`
Expected: 1 failed (`expected null to be { tagName: 'IMG' }`), 1 passed.

- [x] **Step 3: Implement**

In `forceVideoCleanup`, replace:

```js
        // Remove from DOM
        if (video.parentNode) {
            video.remove();
        }

        this.currentMedia = null;
        this.isBeingCleaned = false;
```

with (pick the bracketed phrase that matches Task 1's outcome — `reproduced in Phase 0` / `traced in the code, not reproduced`):

```js
        // Remove from DOM
        if (video.parentNode) {
            video.remove();
        }

        // Release only our own reference. By the end of the 100 ms wait a render may already have
        // installed the NEXT media; nulling that one left its load handler (which requires
        // currentMedia to be its element) ignoring the event, so isLoading never cleared — the
        // held-Like blank view with dead controls (G1 spec F3, [reproduced in Phase 0]).
        if (this.currentMedia === video) {
            this.currentMedia = null;
        }
        this.isBeingCleaned = false;
```

- [x] **Step 4: Run the tests**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "forceVideoCleanup releases only"`
Expected: 2 passed.

- [x] **Step 5: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js
git commit -m "fix(g1): forceVideoCleanup no longer nulls the next render's media" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: The in-flight guard — single-mode moves, undo, navigation (spec D1, D3, D4, § 5.1)

**Files:**
- Modify: `media-viewer.js` — constructor (~L94), `nextMedia` (~L1398), `previousMedia` (~L1421), `moveCurrentFile` (~L1455–1563), `moveToSpecialFolder` (~L1565–1770), `handleCancel` (~L4054–4305)
- Modify: `tests/media-viewer-utils.test.js` (append)
- Modify: `tests/e2e/rating-safety.test.js` (append a describe)
- Modify: `CLAUDE.md` (Async Patterns; Testing (E2E))

**Interfaces:**
- Consumes: E2E helpers from Task 2; `SLOW_NEXT` from Task 1.
- Produces: instance field `_fileOpInFlight: boolean` (constructor `false`); contract — a guarded method returns immediately when it is `true`, otherwise sets it synchronously before its first `await` and clears it in `finally`. Module-level test helper `gatedApi({ moveResult } = {}) → { api, drain(...calls) }` in `tests/media-viewer-utils.test.js`, reused by Task 5.

- [x] **Step 1: Write the failing unit tests**

Append to `tests/media-viewer-utils.test.js`:

```js
// checkFolderExists / moveFile park on a gate, so a test can start a second call while the first
// is mid-await — the exact window a held key or a double-tap used to hit. drain() keeps opening the
// gate (each awaited IPC step parks on a fresh waiter; some methods also sleep between steps) until
// every given call has settled.
function gatedApi({ moveResult } = {}) {
    const waiters = [];
    const gate = () => new Promise((resolve) => waiters.push(resolve));
    const api = {
        path: { basename: (p) => p.split('/').pop() },
        checkFolderExists: vi.fn(async () => {
            await gate();
            return true;
        }),
        moveFile: vi.fn(async ({ targetFolder, fileName }) => {
            await gate();
            return moveResult ?? { success: true, targetPath: `${targetFolder}/${fileName}` };
        }),
    };
    const drain = async (...calls) => {
        let settled = false;
        Promise.allSettled(calls).then(() => {
            settled = true;
        });
        for (let i = 0; i < 400 && !settled; i++) {
            waiters.splice(0).forEach((resolve) => resolve());
            await new Promise((r) => setTimeout(r, 5));
        }
        return Promise.all(calls);
    };
    return { api, drain };
}

const IN_FLIGHT_NOTICE = 'A move is still in progress — press Undo again in a moment';

describe('_fileOpInFlight — one file action at a time (G1)', () => {
    const moveCurrentFile = extractAsyncMethod('moveCurrentFile');
    const moveToSpecialFolder = extractAsyncMethod('moveToSpecialFolder');
    const handleCancel = extractAsyncMethod('handleCancel');
    const nextMedia = extractMethod('nextMedia');
    const previousMedia = extractMethod('previousMedia');

    const previousLike = () => ({
        fileName: 'z.jpg',
        originalPath: '/f/z.jpg',
        newPath: '/liked/z.jpg',
        fileSize: 10,
        fileType: 'image/jpeg',
        actionType: 'like',
        mlFeatures: null,
    });

    function guardCtx(overrides = {}) {
        return {
            _fileOpInFlight: false,
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: false,
            isTournamentMode: false,
            isSortedByPrediction: false,
            isMlEnabled: false,
            mlWorker: null,
            currentMedia: null,
            mediaFiles: [
                { name: 'a.jpg', path: '/f/a.jpg', size: 10, type: 'image/jpeg' },
                { name: 'b.jpg', path: '/f/b.jpg', size: 10, type: 'image/jpeg' },
                { name: 'c.jpg', path: '/f/c.jpg', size: 10, type: 'image/jpeg' },
            ],
            currentIndex: 0,
            moveHistory: [],
            baseFolderPath: '/f',
            customLikeFolder: '/liked',
            customDislikeFolder: '/disliked',
            customSpecialFolder: '/special',
            showRatingConfirmations: false,
            featureCache: new Map(),
            areFoldersConfigured: () => true,
            getCombinedFeatures: () => null,
            _bulkPairKeysReferencing: () => [],
            removeFileFromList: vi.fn(function (p) {
                this.mediaFiles = this.mediaFiles.filter((f) => f.path !== p);
            }),
            restoreFeatureCachesFromHistory: vi.fn(),
            requestPredictionScores: vi.fn(),
            signalUserActivity: vi.fn(),
            updateFolderInfo: vi.fn(),
            showMedia: vi.fn(async () => {}),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showFolderCreationDialog: vi.fn(async () => false),
            showEmptyStateWithUndo: vi.fn(),
            showDropZone: vi.fn(),
            ...overrides,
        };
    }

    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    it('moveCurrentFile holds the flag from before its first await until it settles', async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx();
        const like = moveCurrentFile.call(ctx, 'like');
        expect(ctx._fileOpInFlight).toBe(true);
        await drain(like);
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it("a second moveCurrentFile during the first one's awaits never reaches moveFile", async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx();
        const first = moveCurrentFile.call(ctx, 'like');
        const second = moveCurrentFile.call(ctx, 'like');
        await drain(first, second);
        expect(api.moveFile).toHaveBeenCalledTimes(1);
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx.showError).not.toHaveBeenCalled();
    });

    it('moveCurrentFile releases the flag after a failed move', async () => {
        const { api, drain } = gatedApi({ moveResult: { success: false, error: 'ENOENT' } });
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx();
        await drain(moveCurrentFile.call(ctx, 'like'));
        expect(ctx.showError).toHaveBeenCalledWith('Failed to move file: ENOENT');
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('moveCurrentFile releases the flag after an early return inside the guarded section', async () => {
        const { api, drain } = gatedApi();
        api.checkFolderExists = vi.fn(async () => false); // → creation dialog, declined
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx();
        await drain(moveCurrentFile.call(ctx, 'like'));
        expect(ctx.showFolderCreationDialog).toHaveBeenCalledOnce();
        expect(api.moveFile).not.toHaveBeenCalled();
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it("a second single-mode moveToSpecialFolder during the first one's awaits never reaches moveFile", async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx();
        const first = moveToSpecialFolder.call(ctx);
        const second = moveToSpecialFolder.call(ctx);
        await drain(first, second);
        expect(api.moveFile).toHaveBeenCalledTimes(1);
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('moveToSpecialFolder is refused while a like is in flight', async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx();
        const like = moveCurrentFile.call(ctx, 'like');
        const special = moveToSpecialFolder.call(ctx);
        await drain(like, special);
        expect(api.moveFile).toHaveBeenCalledTimes(1);
        expect(api.moveFile.mock.calls[0][0].targetFolder).toBe('/liked');
    });

    it('handleCancel refuses with a notice while a move is in flight — even with an empty history', async () => {
        const { api } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx({ _fileOpInFlight: true });
        await handleCancel.call(ctx);
        expect(ctx.showNotification).toHaveBeenCalledWith(IN_FLIGHT_NOTICE, 'info');
        expect(ctx.showNotification).not.toHaveBeenCalledWith('No moves to undo', 'error');
        expect(api.moveFile).not.toHaveBeenCalled();
    });

    it('an undo pressed during a like does not reverse the previous move', async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx({ moveHistory: [previousLike()] });
        const like = moveCurrentFile.call(ctx, 'like');
        const undo = handleCancel.call(ctx);
        await drain(like, undo);
        expect(api.moveFile).toHaveBeenCalledTimes(1); // the like only
        expect(ctx.moveHistory.map((m) => m.fileName)).toEqual(['z.jpg', 'a.jpg']);
        expect(ctx.showNotification).toHaveBeenCalledWith(IN_FLIGHT_NOTICE, 'info');
    });

    it('handleCancel holds the flag during its own restore, so a like pressed then is refused', async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx({ moveHistory: [previousLike()] });
        const undo = handleCancel.call(ctx);
        expect(ctx._fileOpInFlight).toBe(true);
        const like = moveCurrentFile.call(ctx, 'like');
        await drain(undo, like);
        expect(api.moveFile).toHaveBeenCalledTimes(1); // the restore only
        expect(api.moveFile.mock.calls[0][0].sourcePath).toBe('/liked/z.jpg');
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('handleCancel releases the flag after a failed restore', async () => {
        const { api, drain } = gatedApi({ moveResult: { success: false, error: 'EBUSY' } });
        globalThis.window = { electronAPI: api };
        const ctx = guardCtx({ moveHistory: [previousLike()] });
        await drain(handleCancel.call(ctx));
        expect(ctx.showError).toHaveBeenCalledWith('Failed to undo move: EBUSY');
        expect(ctx.moveHistory).toHaveLength(1); // pushed back
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('nextMedia and previousMedia do not move while a file action is in flight', () => {
        const ctx = guardCtx({ _fileOpInFlight: true, currentIndex: 1 });
        nextMedia.call(ctx);
        previousMedia.call(ctx);
        expect(ctx.currentIndex).toBe(1);
        expect(ctx.showMedia).not.toHaveBeenCalled();
    });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "_fileOpInFlight — one file action"`
Expected **FAIL (8)**: holds-the-flag (`expected false to be true`); both second-call tests (`moveFile` called 2 times); special-while-like (2 calls); refuses-with-a-notice (`'No moves to undo'` shown instead); undo-during-a-like (the restore runs — 2 calls); holds-the-flag-during-restore (`expected false to be true`); navigation (`showMedia` called). Expected **PASS on unfixed code, by construction (3)**: the three "releases the flag after …" tests — `guardCtx` starts the flag at `false` and unfixed code never writes it. They pin the `finally` once the holds-the-flag tests prove the flag is set. Record the per-test result in the Progress Log.

- [x] **Step 3: Add the field**

In the constructor, after `this.isBeingCleaned = false; // Flag to prevent error notifications during cleanup` (~L94):

```js
        // Held by every file-acting method (moveCurrentFile, moveToSpecialFolder, handleCancel — and
        // moveComparePair, applyBulkRating) from before its first await until its finally. Any other
        // file action that arrives meanwhile is refused (G1). Not isLoading: render handlers clear
        // that at first paint, and showMedia() itself returns early on it.
        this._fileOpInFlight = false;
```

- [x] **Step 4: Guard navigation**

`nextMedia` (~L1398): `if (this.isLoading || this.mediaNavigationInProgress) return;` →

```js
        // A file action renders the next file itself; navigating underneath it raced that render.
        if (this.isLoading || this.mediaNavigationInProgress || this._fileOpInFlight) return;
```

`previousMedia` (~L1421): `if (this.mediaFiles.length === 0 || this.isLoading || this.mediaNavigationInProgress) return;` →

```js
        if (
            this.mediaFiles.length === 0 ||
            this.isLoading ||
            this.mediaNavigationInProgress ||
            this._fileOpInFlight
        ) {
            return;
        }
```

- [x] **Step 5: Guard `moveCurrentFile`**

Replace the head:

```js
    async moveCurrentFile(actionType) {
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        if (!this.areFoldersConfigured()) {
            this.showNotification('Configure like/dislike folders in Settings (F1)', 'error');
            return;
        }

        const currentFile = this.mediaFiles[this.currentIndex];
```

with:

```js
    async moveCurrentFile(actionType) {
        // One file action at a time (G1). A second Like arriving during this method's awaits read
        // the same currentFile and failed at fs.rename with ENOENT — and, with a video on screen,
        // raced forceVideoCleanup against the next render. Refused rather than queued: the press
        // targets a file the user has not seen yet.
        if (this._fileOpInFlight) return;
        if (this.mediaFiles.length === 0 || this.isLoading) return;
        if (!this.areFoldersConfigured()) {
            this.showNotification('Configure like/dislike folders in Settings (F1)', 'error');
            return;
        }

        this._fileOpInFlight = true;
        try {
            const currentFile = this.mediaFiles[this.currentIndex];
```

Replace the tail:

```js
            this.updateFolderInfo();
            this.showMedia();
        } catch (error) {
            console.error('Error moving file:', error);
            this.showError(`Failed to move file: ${error.message}`);
        }
    }

    async moveToSpecialFolder(side = null) {
```

with:

```js
            this.updateFolderInfo();
            // showMedia() sets isLoading synchronously, before finally releases _fileOpInFlight,
            // so the isLoading gates take over with no gap until the next file paints.
            this.showMedia();
        } catch (error) {
            console.error('Error moving file:', error);
            this.showError(`Failed to move file: ${error.message}`);
        }
        } finally {
            this._fileOpInFlight = false;
        }
    }

    async moveToSpecialFolder(side = null) {
```

Save; the formatter hook re-indents the body one level. Confirm with `git diff -w media-viewer.js` that only the guard lines changed in this method.

- [x] **Step 6: Guard `moveToSpecialFolder`**

Replace:

```js
        if (this.isLoading) return;
        this.signalUserActivity();

        // Determine which file to move based on mode and side
```

with:

```js
        // Shared by all three modes; see moveCurrentFile for why a second file action is refused.
        if (this.isLoading || this._fileOpInFlight) return;
        this.signalUserActivity();

        this._fileOpInFlight = true;
        try {
            // Determine which file to move based on mode and side
```

and the tail:

```js
        } catch (error) {
            console.error('Error moving file to special folder:', error);
            this.showError(`Failed to move file: ${error.message}`);
        }
    }

    // New method for thorough video cleanup before file operations
```

with:

```js
        } catch (error) {
            console.error('Error moving file to special folder:', error);
            this.showError(`Failed to move file: ${error.message}`);
        }
        } finally {
            this._fileOpInFlight = false;
        }
    }

    // New method for thorough video cleanup before file operations
```

- [x] **Step 7: Guard `handleCancel`**

Replace the head:

```js
    async handleCancel() {
        if (this.moveHistory.length === 0) {
```

with:

```js
    async handleCancel() {
        // Before the empty-history branch: an undo pressed during the session's first move would
        // otherwise read "No moves to undo". Refused WITH a notice — a silent drop lost a prompt
        // Ctrl+A in the tournament guard trial (BACKLOG 🟤 [2026-08-31]).
        if (this._fileOpInFlight) {
            this.showNotification('A move is still in progress — press Undo again in a moment', 'info');
            return;
        }

        if (this.moveHistory.length === 0) {
```

Then replace:

```js
        if (this.isLoading || this.mediaNavigationInProgress) return;
        this.signalUserActivity();

        // Check if last move was a special move in compare mode
```

with:

```js
        if (this.isLoading || this.mediaNavigationInProgress) return;
        this.signalUserActivity();

        // An undo moves files back across awaits too: hold the flag so a Like pressed meanwhile
        // cannot act on a list being restored underneath it.
        this._fileOpInFlight = true;
        try {
            // Check if last move was a special move in compare mode
```

and the tail (the single-mode branch's catch, ~L4299–4305):

```js
            } catch (error) {
                console.error('Error undoing move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(undoMove);
            }
        }
    }

    switchToSingleModeUI() {
```

with:

```js
            } catch (error) {
                console.error('Error undoing move:', error);
                this.showError(`Failed to undo move: ${error.message}`);
                this.moveHistory.push(undoMove);
            }
        }
        } finally {
            this._fileOpInFlight = false;
        }
    }

    switchToSingleModeUI() {
```

- [x] **Step 8: Run the unit suite**

Run: `npx vitest run`
Expected: all pass — the new describe and every pre-existing `moveCurrentFile` / `handleCancel` / `moveToSpecialFolder` test (their contexts lack `_fileOpInFlight`; `undefined` is falsy, then `finally` writes `false`).

- [x] **Step 9: Write the E2E tests**

Append to `tests/e2e/rating-safety.test.js` (set `SLOW_NEXT` from Task 1):

```js
// From Phase 0 (spec § 11): the file that, shown right after the video, exposed the stuck state.
const SLOW_NEXT = 'normal-320x240.png';

/** Reorder mediaFiles so `lead` comes first in that order, show the first, wait for it to settle. */
async function arrange(page, lead) {
    await waitForIdle(page);
    await page.evaluate(async (names) => {
        const mv = window.mediaViewer;
        const rank = (f) => (names.indexOf(f.name) === -1 ? names.length : names.indexOf(f.name));
        mv.mediaFiles.sort((a, b) => rank(a) - rank(b));
        mv.currentIndex = 0;
        await mv.showMedia();
    }, lead);
    await page.waitForFunction(
        (first) => window.mediaViewer.mediaFiles[0]?.name === first && window.mediaViewer.currentMedia !== null,
        lead[0]
    );
    await waitForIdle(page);
}

test.describe('One file action at a time (G1)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir([
            'red-1x1.png',
            'green-1x1.png',
            'blue-1x1.png',
            'normal-320x240.png',
            'tiny.mp4',
        ]);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
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

    // The held-Like end state (spec F3), driven by clicks: a burst the repeat filter cannot see,
    // at the cadence a held key used. tiny.mp4 may fail to decode here; it is still a <video>, so
    // forceVideoCleanup and its 500 ms wait still run.
    test('a burst of Like clicks on a video moves one file and leaves the controls alive', async () => {
        await arrange(page, ['tiny.mp4', SLOW_NEXT]);
        await page.evaluate(async () => {
            const btn = document.getElementById('likeBtn');
            for (let i = 0; i < 8; i++) {
                btn.click();
                await new Promise((r) => setTimeout(r, 33));
            }
        });
        await page.waitForTimeout(2000);
        await waitForIdle(page);

        expect(await countFiles(tmpFixtures.likeDir)).toBe(1);
        expect(await errors(page)).toEqual([]);
        const visible = await page.evaluate(
            () =>
                [...document.querySelectorAll('.media-display')].filter((el) => getComputedStyle(el).display !== 'none')
                    .length
        );
        expect(visible).toBe(1);

        // The controls still act: one more Like moves exactly one more file.
        await page.evaluate(() => window.mediaViewer.handleLike());
        await page.waitForTimeout(500);
        await waitForIdle(page);
        expect(await countFiles(tmpFixtures.likeDir)).toBe(2);
    });

    test('an Undo pressed during a move is refused with a notice and reverses nothing', async () => {
        await arrange(page, ['red-1x1.png', 'tiny.mp4']);
        await page.keyboard.press('q'); // a completed like — the move a wrong undo would reverse
        await page.waitForFunction(() => window.mediaViewer.currentMedia?.tagName === 'VIDEO');
        await waitForIdle(page);

        await page.keyboard.press('q'); // the video's move waits ~600 ms before fs.rename
        await page.keyboard.press('Control+KeyA');

        await expect(page.locator('.notification').filter({ hasText: 'A move is still in progress' })).toBeVisible();
        await page.waitForTimeout(1500);
        await waitForIdle(page);

        expect((await readdir(tmpFixtures.likeDir)).sort()).toEqual(['red-1x1.png', 'tiny.mp4']);
        expect(await page.evaluate(() => window.mediaViewer.moveHistory.length)).toBe(2);
    });
});
```

**Only if Task 1 set `SLOW_NEXT = 'big.jpg'`**: add `import { writeFile } from 'fs/promises';` and `import { join } from 'path';`, set `const SLOW_NEXT = 'big.jpg';`, and in this describe's `beforeEach` insert, between `seedLocalStorage(…)` and `loadFolder(…)`:

```js
        // A 12-MP noise JPEG decodes slowly enough for a stale timer to fire first (Phase 0, spec § 11).
        const b64 = await page.evaluate(() => {
            const c = document.createElement('canvas');
            c.width = 4000;
            c.height = 3000;
            const ctx = c.getContext('2d');
            const img = ctx.createImageData(c.width, c.height);
            for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
            ctx.putImageData(img, 0, 0);
            return c.toDataURL('image/jpeg', 0.95).split(',')[1];
        });
        await writeFile(join(tmpFixtures.dir, 'big.jpg'), Buffer.from(b64, 'base64'));
```

- [x] **Step 10: Prove both E2Es are RED without the guard**

Run: `git stash push media-viewer.js && npx playwright test tests/e2e/rating-safety.test.js -g "One file action" --reporter=list; git stash pop`
Expected (the stash removes only this task's uncommitted guard; Tasks 2–3 stay applied, which is the right baseline — clicks and a discrete Ctrl+A bypass the repeat filter, and the narrowing alone does not stop overlapping moves): the burst test FAILS (`ENOENT` errors and/or `likeDir` ≠ 1 and/or a stuck flag — `waitForIdle` timing out counts); the undo test FAILS (no notice, and `red-1x1.png` restored out of `liked`). Record both. A pass here means the test does not exercise the guard — stop and find out why.

- [x] **Step 11: Run the whole E2E file on the fixed code, three times**

Run: `for i in 1 2 3; do npx playwright test tests/e2e/rating-safety.test.js --reporter=line || break; done`
Expected: 4 passed, three runs in a row.

- [x] **Step 12: Document the guard in CLAUDE.md**

In § Detected Patterns → **Async Patterns**, append:

```markdown
- File-op guard (G1): `_fileOpInFlight` is held by `moveCurrentFile`, `moveToSpecialFolder` and `handleCancel` from before their first `await` until their `finally`. While it is set, every other file action is refused — ratings, special and navigation quietly (the press targets a file the user has not seen), undo with an `info` notice checked **before** the empty-history branch. Not `isLoading`: render handlers clear that at first paint, and `showMedia()` itself returns early on it. Handoff: each guarded method starts its render before its `finally`, and `showSingleMedia`/`showCompareMedia` set `isLoading` synchronously, so the gates hand over with no gap (exception: `showCompareMedia`'s `< 2`-files branch awaits cleanup first — the guarded compare paths handle `< 2` themselves). **No guarded method may call another** — the inner call would be silently refused. Tournament picks/draws and `handleTournamentUndo` are deliberately outside it (G3 / the BLOCKED tournament guard entry). `forceVideoCleanup` nulls `currentMedia` only if it is still the video it cleaned — an unconditional null clobbered the next render's element and stranded `isLoading` (the held-Like dead-controls state).
```

In § Code Conventions → **Testing (E2E — Playwright)**, append:

```markdown
- A file action started while another holds `_fileOpInFlight` is refused (undo shows a notice). An E2E that chains moves must let the previous one finish first — `waitForIdle` (no `isLoading`/`mediaNavigationInProgress`) after its render is enough, since the flag drops before the render it starts settles.
```

- [x] **Step 13: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js tests/e2e/rating-safety.test.js CLAUDE.md
git commit -m "fix(g1): one file action at a time — single-mode moves, undo, navigation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Extend the guard to compare pair moves and bulk rating (spec D3, F5)

**Files:**
- Modify: `media-viewer.js` — `moveComparePair` (~L5345–5588), `applyBulkRating` (~L8160–8202)
- Modify: `tests/media-viewer-utils.test.js` (append)
- Modify: `tests/e2e/rating-safety.test.js` (append a describe)
- Modify: `CLAUDE.md` (the Async Patterns bullet from Task 4)

**Interfaces:**
- Consumes: `_fileOpInFlight` (Task 4); `gatedApi` (Task 4, module scope); E2E helpers (Task 2).
- Produces: `moveComparePair` and `applyBulkRating` join the guarded set.

- [x] **Step 1: Write the failing unit tests**

Append to `tests/media-viewer-utils.test.js`:

```js
describe('_fileOpInFlight — compare pair moves and bulk rating (G1)', () => {
    const moveComparePair = extractAsyncMethod('moveComparePair');
    const applyBulkRating = extractAsyncMethod('applyBulkRating');
    const bulkPairKey = extractMethod('bulkPairKey');

    function pairCtx(overrides = {}) {
        const files = ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.jpg`, path: `/f/${n}.jpg`, size: 10, type: 'image/jpeg' }));
        return {
            _fileOpInFlight: false,
            isLoading: false,
            mediaNavigationInProgress: false,
            isCompareMode: true,
            isTournamentMode: false,
            isSortedByPrediction: false,
            isMlEnabled: false,
            mlWorker: null,
            leftMedia: null,
            rightMedia: null,
            mediaFiles: files,
            compareLeftFile: files[0],
            compareRightFile: files[1],
            currentIndex: 0,
            mlComparePairIndex: 0,
            moveHistory: [],
            customLikeFolder: '/liked',
            customDislikeFolder: '/disliked',
            showRatingConfirmations: false,
            areFoldersConfigured: () => true,
            _bulkPairKeysReferencing: () => [],
            removeFileFromList: vi.fn(function (p) {
                this.mediaFiles = this.mediaFiles.filter((f) => f.path !== p);
            }),
            cleanupCompareMedia: vi.fn(async () => {}),
            updateFolderInfo: vi.fn(),
            showMedia: vi.fn(async () => {}),
            showNotification: vi.fn(),
            showError: vi.fn(),
            showFolderCreationDialog: vi.fn(async () => false),
            switchToSingleModeUI: vi.fn(),
            hideLoadingSpinner: vi.fn(),
            showEmptyStateWithUndo: vi.fn(),
            ...overrides,
        };
    }

    let origWindow;
    beforeEach(() => {
        origWindow = globalThis.window;
    });
    afterEach(() => {
        globalThis.window = origWindow;
    });

    // Spec F5: Q then E used to run two pair moves on the same compare files.
    it('a second pair move during the first never reaches moveFile (Q then E)', async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = pairCtx();
        const q = moveComparePair.call(ctx, 'left', 'like', 'dislike');
        const e = moveComparePair.call(ctx, 'right', 'like', 'dislike');
        await drain(q, e);
        expect(api.moveFile.mock.calls.map(([arg]) => `${arg.fileName}->${arg.targetFolder}`)).toEqual([
            'a.jpg->/liked',
            'b.jpg->/disliked',
        ]);
        expect(ctx.mediaFiles.map((f) => f.name)).toEqual(['c.jpg', 'd.jpg']);
        expect(ctx.moveHistory).toHaveLength(2);
        expect(ctx.showError).not.toHaveBeenCalled();
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('moveComparePair releases the flag after a failed move', async () => {
        const { api, drain } = gatedApi({ moveResult: { success: false, error: 'ENOENT' } });
        globalThis.window = { electronAPI: api };
        const ctx = pairCtx();
        await drain(moveComparePair.call(ctx, 'left', 'like', 'dislike'));
        expect(ctx.showError).toHaveBeenCalledWith('Failed to move files: ENOENT');
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('a pair move is refused while another file action is in flight', async () => {
        const { api, drain } = gatedApi();
        globalThis.window = { electronAPI: api };
        const ctx = pairCtx({ _fileOpInFlight: true });
        await drain(moveComparePair.call(ctx, 'left', 'like', 'dislike'));
        expect(api.checkFolderExists).not.toHaveBeenCalled();
        expect(api.moveFile).not.toHaveBeenCalled();
    });

    function bulkCtx(overrides = {}) {
        const saves = [];
        const ctx = pairCtx({
            isSortedByPrediction: true,
            bulkRated: new Map(),
            bulkRatedPairs: new Set(),
            bulkPairKey,
            saveBulkRatedFile: vi.fn(() => new Promise((resolve) => saves.push(resolve))),
            computeValidComparePairs: () => [{}, {}],
            ...overrides,
        });
        return { ctx, releaseSaves: () => saves.splice(0).forEach((resolve) => resolve()) };
    }

    it("a second bulk rating during the first one's save is refused", async () => {
        const { ctx, releaseSaves } = bulkCtx();
        const first = applyBulkRating.call(ctx, 'good');
        const second = applyBulkRating.call(ctx, 'good');
        releaseSaves();
        await Promise.all([first, second]);
        expect(ctx.saveBulkRatedFile).toHaveBeenCalledOnce();
        expect(ctx.moveHistory).toHaveLength(1);
        expect(ctx._fileOpInFlight).toBe(false);
    });

    it('a bulk rating is refused while a pair move is in flight', async () => {
        const { ctx } = bulkCtx({ _fileOpInFlight: true });
        await applyBulkRating.call(ctx, 'bad');
        expect(ctx.saveBulkRatedFile).not.toHaveBeenCalled();
        expect(ctx.bulkRated.size).toBe(0);
        expect(ctx.moveHistory).toHaveLength(0);
    });
});
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "compare pair moves and bulk rating"`
Expected **FAIL (4)**: Q-then-E (more than two `moveFile` calls); refused-while-in-flight (`checkFolderExists` called); second bulk rating (two saves, two history entries); bulk refused-while-in-flight (`saveBulkRatedFile` called). Expected **PASS by construction (1)**: "releases the flag after a failed move" — same reason as Task 4 Step 2.

- [x] **Step 3: Guard `moveComparePair`**

Replace the head:

```js
    async moveComparePair(primarySide, primaryAction, secondaryAction) {
        if (this.isLoading) return;
        if (!this.areFoldersConfigured()) {
            this.showNotification('Configure like/dislike folders in Settings (F1)', 'error');
            return;
        }

        // Use stored file references (set by showCompareMedia)
```

with:

```js
    async moveComparePair(primarySide, primaryAction, secondaryAction) {
        // _fileOpInFlight (G1 spec F5): a quick Q-then-E ran two pair moves on the same compare
        // files — both moved, then each call's secondary failed with ENOENT before
        // removeFileFromList, leaving both as phantoms in mediaFiles with orphan history entries.
        // Checked here rather than in the handlers, whose tournament branch must stay unguarded.
        if (this.isLoading || this._fileOpInFlight) return;
        if (!this.areFoldersConfigured()) {
            this.showNotification('Configure like/dislike folders in Settings (F1)', 'error');
            return;
        }

        this._fileOpInFlight = true;
        try {
            // Use stored file references (set by showCompareMedia)
```

and the tail:

```js
        } catch (error) {
            console.error('Error moving compare files:', error);
            this.showError(`Failed to move files: ${error.message}`);
        }
    }

    async cleanupCompareMedia(side) {
```

with:

```js
        } catch (error) {
            console.error('Error moving compare files:', error);
            this.showError(`Failed to move files: ${error.message}`);
        }
        } finally {
            this._fileOpInFlight = false;
        }
    }

    async cleanupCompareMedia(side) {
```

- [x] **Step 4: Guard `applyBulkRating`**

Replace:

```js
    async applyBulkRating(bucket) {
        // Drop a re-entrant press while the previous rating's render is still in flight
        // (mediaNavigationInProgress, set by showMedia() and cleared once it settles): otherwise
        // a fast double D/F or a double-click re-rates the SAME on-screen pair before it
        // changes — duplicate bulkRated writes plus two moveHistory entries for one user action.
        if (!this.isSortedByPrediction || !this.isCompareMode || this.mediaNavigationInProgress) return;
        const left = this.compareLeftFile;
        const right = this.compareRightFile;
        if (!left || !right) return;

        const bulkFiles = [];
```

with:

```js
    async applyBulkRating(bucket) {
        // Drop a re-entrant press: otherwise a fast double D/F or a double-click re-rates the SAME
        // on-screen pair before it changes — duplicate bulkRated writes plus two moveHistory entries
        // for one user action. mediaNavigationInProgress covers the render; _fileOpInFlight (G1)
        // covers the earlier saveBulkRatedFile await, which nothing guarded, and any other file
        // action in flight.
        if (
            !this.isSortedByPrediction ||
            !this.isCompareMode ||
            this.mediaNavigationInProgress ||
            this._fileOpInFlight
        ) {
            return;
        }
        const left = this.compareLeftFile;
        const right = this.compareRightFile;
        if (!left || !right) return;

        this._fileOpInFlight = true;
        try {
            const bulkFiles = [];
```

and the tail:

```js
        this.showNotification(bucket === 'good' ? '👍 Both files marked good' : '👎 Both files marked bad', 'success');

        this.showMedia();
    }

    async handleBothGood() {
```

with:

```js
        this.showNotification(bucket === 'good' ? '👍 Both files marked good' : '👎 Both files marked bad', 'success');

        this.showMedia();
        } finally {
            this._fileOpInFlight = false;
        }
    }

    async handleBothGood() {
```

- [x] **Step 5: Run the unit suite**

Run: `npx vitest run`
Expected: all pass, including the pre-existing `applyBulkRating` tests and the source-order test that reads `methodSource('moveComparePair')`.

- [x] **Step 6: Write the compare E2E**

Append to `tests/e2e/rating-safety.test.js`:

```js
test.describe('Compare: one pair move at a time (G1)', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png', 'normal-320x240.png']);
        ({ electronApp, page } = await launchApp());
        await seedLocalStorage(page, {
            customLikeFolder: tmpFixtures.likeDir,
            customDislikeFolder: tmpFixtures.dislikeDir,
        });
        await loadFolder(page, tmpFixtures.dir);
        await waitForMedia(page);
        await waitForIdle(page);
        await page.evaluate(() => window.mediaViewer.switchMode('compare'));
        await page.waitForFunction(() => {
            const mv = window.mediaViewer;
            return (
                mv.isCompareMode &&
                mv.compareLeftFile &&
                mv.compareRightFile &&
                !mv.isLoading &&
                !mv.mediaNavigationInProgress
            );
        });
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

    // Spec F5 — two different keys, so the repeat filter cannot help.
    test('Q then E at once moves exactly one pair and leaves no phantom files', async () => {
        const [left, right] = await page.evaluate(() => [
            window.mediaViewer.compareLeftFile.name,
            window.mediaViewer.compareRightFile.name,
        ]);
        await page.keyboard.press('q');
        await page.keyboard.press('e');
        await page.waitForTimeout(1500);
        await waitForIdle(page);

        expect(await readdir(tmpFixtures.likeDir)).toEqual([left]);
        expect(await readdir(tmpFixtures.dislikeDir)).toEqual([right]);
        const listed = await page.evaluate(() => window.mediaViewer.mediaFiles.map((f) => f.name));
        expect(listed).toHaveLength(2);
        const onDisk = await readdir(tmpFixtures.dir);
        for (const name of listed) {
            expect(onDisk).toContain(name);
        }
        expect(await errors(page)).toEqual([]);
    });
});
```

- [x] **Step 7: Prove the compare E2E is RED without this task's guard**

Run: `git stash push media-viewer.js && npx playwright test tests/e2e/rating-safety.test.js -g "Compare: one pair" --reporter=list; git stash pop`
Expected: FAIL (both files in `liked`, phantom names listed, and/or `Failed to move files` errors). Record it. A pass means E arrived after the first pair move settled — find out why before continuing.

- [x] **Step 8: Run the E2E file three times**

Run: `for i in 1 2 3; do npx playwright test tests/e2e/rating-safety.test.js --reporter=line || break; done`
Expected: 5 passed, three runs in a row.

- [x] **Step 9: Re-verify that no guarded method calls another**

Run: `grep -n "this\.\(moveCurrentFile\|moveToSpecialFolder\|moveComparePair\|applyBulkRating\|handleCancel\)(" media-viewer.js`
Expected: callers only in `handleLike`/`handleDislike`, the four compare handlers, `handleTournamentSpecial`, `handleBothGood`/`handleBothBad`, `executeAction`, and button/empty-state listeners — **none inside a guarded method's body**. Any hit inside one is a silently refused nested call: stop and report.

Then verify, per call site, the spec § 5.1 exception — that no guarded compare path reaches `showCompareMedia`'s `< 2`-files branch (which awaits cleanup before setting any flag). Read and record in the Progress Log:
- `moveComparePair`: its TASK-022 block handles `mediaFiles.length < 2` (switch to single, `showMedia()` → `showSingleMedia`) and returns before the compare render.
- `moveToSpecialFolder` (compare branch): calls `showMedia()` only under `mediaFiles.length >= 2`; the `=== 1` and `0` cases switch to single first.
- `applyBulkRating`: moves no files, so the count it renders with is the `≥ 2` it started from.
- `handleCancel` (compare branches): only ever adds files back.
Any path that can reach the `< 2` branch with the flag about to drop is a gap: stop and report.

- [x] **Step 10: Update the CLAUDE.md guard bullet**

In the Async Patterns bullet written in Task 4, replace `is held by \`moveCurrentFile\`, \`moveToSpecialFolder\` and \`handleCancel\`` with `is held by \`moveCurrentFile\`, \`moveToSpecialFolder\`, \`moveComparePair\`, \`applyBulkRating\` and \`handleCancel\``, and replace `ratings, special and navigation quietly` with `ratings, special, bulk and navigation quietly`.

- [x] **Step 11: Commit**

```bash
git add media-viewer.js tests/media-viewer-utils.test.js tests/e2e/rating-safety.test.js CLAUDE.md
git commit -m "fix(g1): guard compare pair moves and bulk rating — no Q-then-E phantom files" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Single-mode special-folder hotkey `1` (spec D6, § 5.4)

**Files:**
- Modify: `media-viewer.js` — `DEFAULT_SHORTCUTS.single` (~L6–12), `ACTION_LABELS` (~L44–60), `executeAction` (~L9481–9516), comments in `updateSpecialButtonsState` (~L498) and above `_specialShortcutSuffix` (~L482–485)
- Modify: `tests/keyboard-shortcuts.test.js`, `tests/media-viewer-utils.test.js` (~L6192–6229)
- Modify: `tests/e2e/rating-safety.test.js`
- Modify: `CLAUDE.md` (~L187)

**Interfaces:**
- Consumes: the guarded `moveToSpecialFolder()` (Task 4).
- Produces: action name `special` in `shortcuts.single`; `executeAction('special')` → `moveToSpecialFolder()` in single mode only.

- [x] **Step 1: Flip the shape tests and add the routing and collision tests (failing)**

In `tests/keyboard-shortcuts.test.js`:

(a) ~L54: rename `'single mode has like, dislike, next, previous, undo'` → `'single mode has like, dislike, next, previous, undo, special'` and add `special: 'Digit1',` after `undo: 'Ctrl+KeyA',` in its `toEqual`.

(b) ~L88: replace the whole test with:

```js
    it('single mode binds special to Digit1 and has no side-specific special actions', () => {
        const shortcuts = extractDefaultShortcuts();
        expect(shortcuts.single.special).toBe('Digit1');
        expect(shortcuts.single.leftSpecial).toBeUndefined();
        expect(shortcuts.single.rightSpecial).toBeUndefined();
    });

    it('single mode has no duplicate key bindings', () => {
        const shortcuts = extractDefaultShortcuts();
        const keys = Object.values(shortcuts.single);
        expect(new Set(keys).size).toBe(keys.length);
    });
```

(c) ~L447: rename to `'maps Digit1/Digit2 to the special actions in every mode that binds them'` and replace its last two lines with:

```js
        expect(result.single['Digit1']).toBe('special');
        expect(result.single['Digit2']).toBeUndefined();
```

(d) ~L577: replace the comment above `'single mode does nothing for either special action'` with `// leftSpecial/rightSpecial stay compare/tournament-only: single binds \`special\` (Digit1) instead, so the reverse map never produces these there; the handler guard is the second line of defence.` — keep the test. Below it, inside the same `describe('special-folder actions route per mode')`, add:

```js
        it('single mode moves the current file to the special folder', () => {
            const ctx = specialCtx('single');
            executeAction.call(ctx, 'special');
            expect(ctx.moveToSpecialFolder).toHaveBeenCalledOnce();
            expect(ctx.moveToSpecialFolder).toHaveBeenCalledWith();
            expect(ctx.handleTournamentSpecial).not.toHaveBeenCalled();
        });

        it('compare and tournament ignore the single-mode special action', () => {
            for (const mode of ['compare', 'tournament']) {
                const ctx = specialCtx(mode);
                executeAction.call(ctx, 'special');
                expect(ctx.moveToSpecialFolder, mode).not.toHaveBeenCalled();
                expect(ctx.handleTournamentSpecial, mode).not.toHaveBeenCalled();
            }
        });
```

(e) ~L729: replace `'returns an empty string when the action is unbound in that mode'` with:

```js
    it('renders the single-mode special binding', () => {
        const ctx = ctxWith(extractDefaultShortcuts());
        expect(_specialShortcutSuffix.call(ctx, 'single', 'special')).toBe(' (1)');
    });

    it('returns an empty string when the action is unbound in that mode', () => {
        const ctx = ctxWith(extractDefaultShortcuts());
        expect(_specialShortcutSuffix.call(ctx, 'single', 'leftSpecial')).toBe('');
        const shortcuts = extractDefaultShortcuts();
        shortcuts.single.special = null; // yielded to a user remap by _mergeModeShortcuts
        expect(_specialShortcutSuffix.call(ctxWith(shortcuts), 'single', 'special')).toBe('');
    });
```

(f) In `describe('loadShortcuts — a stored remap outranks a later additive default')` (~L234), add:

```js
    // G1 adds single.special = 'Digit1'; a user who already put Digit1 on a single-mode action
    // keeps it, and the new action yields — no file moved by their key.
    it('leaves single-mode special unbound when a stored single remap holds Digit1', () => {
        globalThis.localStorage = {
            getItem: () =>
                JSON.stringify({
                    version: 2,
                    single: { like: 'KeyQ', dislike: 'KeyW', next: 'Digit1', previous: 'KeyA', undo: 'Ctrl+KeyA' },
                }),
            setItem: () => {},
        };
        const ctx = loadCtx();
        const shortcuts = loadShortcuts.call(ctx);
        expect(shortcuts.single.special).toBeNull();
        expect(buildReverseMap.call({ shortcuts }).single['Digit1']).toBe('next');
        expect(ctx._shortcutCollisions).toEqual([{ mode: 'single', action: 'special', key: 'Digit1', heldBy: 'next' }]);
    });
```

In `tests/media-viewer-utils.test.js`, `describe('updateSpecialButtonsState tooltips')` (~L6192): change `ctxWith`'s signature to `function ctxWith({ folder, compareOverrides = {}, singleOverrides = {} } = {})` and its `single:` line to `single: Object.assign({ like: 'KeyQ', special: 'Digit1' }, singleOverrides),`; replace the `'leaves the single-mode button bare, since single has no special binding'` test (and its two comment lines) with:

```js
    // G1 binds single-mode special to Digit1, so the single button carries a suffix too.
    // (Hand-built ctx: these two pass before Task 6 — they replace a test whose premise became
    // false; the RED evidence for the binding is the DEFAULT_SHORTCUTS tests.)
    it('shows the single-mode special hotkey on the single button', () => {
        const ctx = ctxWith({ folder: 'C:/special' });
        updateSpecialButtonsState.call(ctx);
        expect(ctx.specialBtn.title).toBe('Move to special folder (1)');
    });

    it('leaves the single-mode button bare when special is unbound', () => {
        const ctx = ctxWith({ folder: 'C:/special', singleOverrides: { special: null } });
        updateSpecialButtonsState.call(ctx);
        expect(ctx.specialBtn.title).toBe('Move to special folder');
    });
```

- [x] **Step 2: Run to verify the RED set fails**

Run: `npx vitest run tests/keyboard-shortcuts.test.js`
Expected: FAIL — (a) shape `toEqual`, (b) `special` undefined, (c) `single['Digit1']` undefined, (d) the single-routing test (`moveToSpecialFolder` not called), (e) `' (1)'` vs `''`, (f) `special` `undefined` vs `null`. The no-duplicates and compare/tournament-ignore tests may pass already — expected.

- [x] **Step 3: Implement**

`DEFAULT_SHORTCUTS.single`:

```js
    single: {
        like: 'KeyQ',
        dislike: 'KeyW',
        next: 'KeyS',
        previous: 'KeyA',
        undo: 'Ctrl+KeyA',
        // Additive (G1), matching compare/tournament's leftSpecial: no loadShortcuts version bump —
        // _mergeModeShortcuts leaves it unbound if a stored single-mode remap already holds Digit1.
        special: 'Digit1',
    },
```

`ACTION_LABELS`, after `undo: 'Undo last move',`:

```js
    special: 'Move to special folder',
```

`executeAction`, replace:

```js
            // Bound in compare and tournament only. Tournament needs the engine-sync wrapper;
            // compare goes straight to the move, the same path #leftSpecialBtn's click takes.
            // Single mode has no binding, so the reverse map never produces these there —
            // the mode check is the second line of defence, not the only one.
            leftSpecial: () => {
```

with:

```js
            // Single mode only; the reverse map produces `special` nowhere else, and the mode check
            // is the second line of defence. Same guarded path as #specialBtn's click.
            special: () => {
                if (!this.isCompareMode && !this.isTournamentMode) this.moveToSpecialFolder();
            },
            // Bound in compare and tournament only. Tournament needs the engine-sync wrapper;
            // compare goes straight to the move, the same path #leftSpecialBtn's click takes.
            // Single mode binds `special` instead, so the reverse map never produces these there —
            // the mode check is the second line of defence, not the only one.
            leftSpecial: () => {
```

Comments: above `_specialShortcutSuffix` replace `unbound in that mode — which is how single mode's tooltip stays bare without a special case, since shortcuts.single has no special action at all.` with `unbound in that mode (a default that yielded to a user remap, or an unknown mode).`; in `updateSpecialButtonsState` replace `// Single mode button — single has no special binding, so the suffix resolves to ''.` with `// Single mode button — suffix from single's \`special\` binding (Digit1 by default).`

- [x] **Step 4: Run the unit suite**

Run: `npx vitest run`
Expected: all pass (`tests/keyboard-shortcuts.test.js` ACTION_LABELS coverage tests included — `special` now has a label).

- [x] **Step 5: Add the held-`1` E2E (failing first)**

In `tests/e2e/rating-safety.test.js`, inside `describe('Held keys fire once (G1)')` (its `beforeEach` already seeds `customSpecialFolder`), add:

```js
    test('a held 1 in single mode moves exactly one file to the special folder', async () => {
        await holdKey(page, 'Digit1');
        await page.waitForTimeout(1500);
        await waitForIdle(page);

        expect(await countFiles(tmpFixtures.specialDir)).toBe(1);
        expect(await errors(page)).toEqual([]);
    });
```

Run: `git stash push media-viewer.js && npx playwright test tests/e2e/rating-safety.test.js -g "held 1" --reporter=list; git stash pop`
Expected: FAIL (`specialDir` has 0 — no binding). Then run it on the fixed code: `npx playwright test tests/e2e/rating-safety.test.js -g "held 1" --reporter=list` → PASS.

- [x] **Step 6: Update CLAUDE.md**

In the Git Insights bullet that begins `- Special-button tooltips are **derived, not hardcoded**` (~L187), replace `, which is how single mode's \`#specialBtn\` stays bare without a special case.` with `; single mode's \`#specialBtn\` reads ` (1)` since G1 bound \`special: 'Digit1'\` (additive — a yielded binding renders bare).` (Task 7 rewrites the rest of this bullet.)

- [x] **Step 7: Commit**

```bash
git add media-viewer.js tests/keyboard-shortcuts.test.js tests/media-viewer-utils.test.js tests/e2e/rating-safety.test.js CLAUDE.md
git commit -m "feat(g1): single-mode special-folder hotkey (1) on the guarded move path" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Like/Dislike tooltips from the live binding (spec D7, § 5.5)

**Files:**
- Modify: `media-viewer.js` — `_specialShortcutSuffix` → `_shortcutSuffix` (~L482–489) and all callers; `updateRatingButtonsState` (~L443–480); `addMediaOverlayControls` (~L3400–3442); `saveShortcut` (~L9532–9548); `resetShortcuts` (~L9657–9669); the `_mergeModeShortcuts` comment (~L9431)
- Modify: `tests/keyboard-shortcuts.test.js`, `tests/media-viewer-utils.test.js`, `tests/e2e/overlay-controls.test.js`
- Modify: `index.html` (~L185–200)
- Modify: `CLAUDE.md` (~L186–187)

**Interfaces:**
- Consumes: `special` single binding (Task 6).
- Produces: `_shortcutSuffix(mode: string, action: string): string` (replaces `_specialShortcutSuffix`); `updateRatingButtonsState()` derives all six static like/dislike titles and is called from `saveShortcut`/`resetShortcuts`.

- [x] **Step 1: Rename the helper (refactor, no behaviour change)**

Run: `grep -rn "_specialShortcutSuffix" media-viewer.js tests/ CLAUDE.md`
Replace every hit in those three locations with `_shortcutSuffix` (the method name, the four call sites, the `_mergeModeShortcuts` comment, the test `describe` titles, `extractMethod('_specialShortcutSuffix')` and the local `const` names in both test files, and the CLAUDE.md L186 mention). Replace the method's header comment with:

```js
    // The " (Q)" a button tooltip carries for `action` in `mode`, derived from the live binding
    // rather than hardcoded, so a remap in the F1 panel reaches the button. Returns '' when the
    // action is unbound in that mode (a default that yielded to a user remap, or an unknown mode).
```

Run: `npx vitest run` → all pass. Run: `grep -rn "_specialShortcutSuffix" media-viewer.js tests/ CLAUDE.md` → no output.

- [x] **Step 2: Add the `updateRatingButtonsState` tests (failing)**

In `tests/media-viewer-utils.test.js`, after `describe('updateSpecialButtonsState tooltips')`:

```js
describe('updateRatingButtonsState tooltips (G1)', () => {
    const updateRatingButtonsState = extractMethod('updateRatingButtonsState');
    const areFoldersConfigured = extractMethod('areFoldersConfigured');
    const _shortcutSuffix = extractMethod('_shortcutSuffix');
    const keyDisplayName = extractMethod('keyDisplayName');
    const BUTTONS = ['likeBtn', 'dislikeBtn', 'leftLikeBtn', 'leftDislikeBtn', 'rightLikeBtn', 'rightDislikeBtn'];
    let origDocument;

    beforeEach(() => {
        origDocument = globalThis.document;
        globalThis.document = { getElementById: () => null }; // #folderConfigWarning
    });

    afterEach(() => {
        globalThis.document = origDocument;
    });

    function ctxWith({ folders = true, single = {}, compare = {} } = {}) {
        const ctx = {
            customLikeFolder: folders ? '/liked' : '',
            customDislikeFolder: folders ? '/disliked' : '',
            shortcuts: {
                single: Object.assign({ like: 'KeyQ', dislike: 'KeyW' }, single),
                compare: Object.assign(
                    { leftLike: 'KeyQ', leftDislike: 'KeyW', rightLike: 'KeyE', rightDislike: 'KeyR' },
                    compare
                ),
            },
            areFoldersConfigured,
            _shortcutSuffix,
            keyDisplayName,
        };
        for (const b of BUTTONS) ctx[b] = { disabled: false, title: '' };
        return ctx;
    }

    it('shows the real default hotkeys (single mode read "Arrow Up"/"Arrow Down")', () => {
        const ctx = ctxWith();
        updateRatingButtonsState.call(ctx);
        expect(ctx.likeBtn.title).toBe('Like (Q)');
        expect(ctx.dislikeBtn.title).toBe('Dislike (W)');
        expect(ctx.leftLikeBtn.title).toBe('Like Left (Q)');
        expect(ctx.leftDislikeBtn.title).toBe('Dislike Left (W)');
        expect(ctx.rightLikeBtn.title).toBe('Like Right (E)');
        expect(ctx.rightDislikeBtn.title).toBe('Dislike Right (R)');
    });

    it('follows a remap in either mode', () => {
        const ctx = ctxWith({ single: { like: 'KeyT' }, compare: { rightDislike: 'Shift+KeyR' } });
        updateRatingButtonsState.call(ctx);
        expect(ctx.likeBtn.title).toBe('Like (T)');
        expect(ctx.rightDislikeBtn.title).toBe('Dislike Right (Shift+R)');
    });

    it('renders a bare label for an unbound action', () => {
        const ctx = ctxWith({ single: { dislike: null } });
        updateRatingButtonsState.call(ctx);
        expect(ctx.dislikeBtn.title).toBe('Dislike');
    });

    it('keeps the configure-folders tooltip, and disables, when folders are missing', () => {
        const ctx = ctxWith({ folders: false });
        updateRatingButtonsState.call(ctx);
        for (const b of BUTTONS) {
            expect(ctx[b].title, b).toBe('Configure like/dislike folders in Settings (F1)');
            expect(ctx[b].disabled, b).toBe(true);
        }
    });
});
```

Run: `npx vitest run tests/media-viewer-utils.test.js -t "updateRatingButtonsState tooltips"`
Expected: the first three FAIL (`'Like (Arrow Up)'`, `'Like (Arrow Up)'` vs `'Like (T)'`, `'Dislike (Arrow Down)'`); the configure-folders test passes already.

- [x] **Step 3: Implement `updateRatingButtonsState`**

Replace the method's body from `const enabled` through the end of the `rightDislikeBtn` block with:

```js
        const enabled = this.areFoldersConfigured();
        const tooltip = enabled ? '' : 'Configure like/dislike folders in Settings (F1)';
        // Hotkeys come from the live bindings (G1). The single-mode titles once read
        // 'Arrow Up'/'Arrow Down' — wrong even with the default Q/W.
        const title = (label, mode, action) => (enabled ? label + this._shortcutSuffix(mode, action) : tooltip);

        // Single mode buttons
        if (this.likeBtn) {
            this.likeBtn.disabled = !enabled;
            this.likeBtn.title = title('Like', 'single', 'like');
        }
        if (this.dislikeBtn) {
            this.dislikeBtn.disabled = !enabled;
            this.dislikeBtn.title = title('Dislike', 'single', 'dislike');
        }

        // Compare mode buttons. Like the special pair, these live in .left/.right-media-controls,
        // which CSS hides in tournament mode, so they always read the compare map.
        if (this.leftLikeBtn) {
            this.leftLikeBtn.disabled = !enabled;
            this.leftLikeBtn.title = title('Like Left', 'compare', 'leftLike');
        }
        if (this.leftDislikeBtn) {
            this.leftDislikeBtn.disabled = !enabled;
            this.leftDislikeBtn.title = title('Dislike Left', 'compare', 'leftDislike');
        }
        if (this.rightLikeBtn) {
            this.rightLikeBtn.disabled = !enabled;
            this.rightLikeBtn.title = title('Like Right', 'compare', 'rightLike');
        }
        if (this.rightDislikeBtn) {
            this.rightDislikeBtn.disabled = !enabled;
            this.rightDislikeBtn.title = title('Dislike Right', 'compare', 'rightDislike');
        }
```

Add above `updateRatingButtonsState() {`:

```js
    // Sole runtime owner of the six static like/dislike titles: overwrites index.html's at init,
    // on every like/dislike-folder browse/clear, and from saveShortcut/resetShortcuts.
```

Run: `npx vitest run tests/media-viewer-utils.test.js -t "updateRatingButtonsState tooltips"` → 4 passed.

- [x] **Step 4: Refresh from `saveShortcut` / `resetShortcuts` (failing first)**

In `tests/keyboard-shortcuts.test.js`, add `updateRatingButtonsState: vi.fn(),` directly after **every** `updateSpecialButtonsState: vi.fn(),` (`grep -n "updateSpecialButtonsState: vi.fn()," tests/keyboard-shortcuts.test.js` — seven sites). Then, in the test ending `saveShortcut.call(ctx, 'compare', 'leftSpecial', 'Digit9');` (~L831) and the test `'refreshes the special-button tooltips after restoring defaults'` (~L967), add after the existing `expect(ctx.updateSpecialButtonsState).toHaveBeenCalledOnce();`:

```js
        expect(ctx.updateRatingButtonsState).toHaveBeenCalledOnce();
```

and rename the latter test to `'refreshes the button tooltips after restoring defaults'`.

Run: `npx vitest run tests/keyboard-shortcuts.test.js` → the two new assertions FAIL (`called 0 times`).

In `saveShortcut`, replace:

```js
        // The special tooltips are derived from this.shortcuts; without this the button would
        // keep advertising the old key while the F1 row already shows the new one.
        this.updateSpecialButtonsState();
```

with:

```js
        // Button tooltips are derived from this.shortcuts; without these the buttons would keep
        // advertising the old key while the F1 row already shows the new one.
        this.updateSpecialButtonsState();
        this.updateRatingButtonsState();
```

In `resetShortcuts`, after `this.updateSpecialButtonsState();` add `this.updateRatingButtonsState();`.

Run: `npx vitest run` → all pass.

- [x] **Step 5: Derive the overlay titles**

In `addMediaOverlayControls`, directly after `controls.className = 'media-overlay-controls';` add:

```js
        // This bar is rebuilt on every compare AND tournament render, so reading the mode here keeps
        // every title's hotkey current with no separate refresh hook (tournament reuses Q/W/E/R for
        // picks, but each map can be remapped on its own).
        const overlayMode = this.isTournamentMode ? 'tournament' : 'compare';
```

Replace `likeBtn.title = side === 'left' ? 'Like Left (Q)' : 'Like Right (E)';` with:

```js
        likeBtn.title =
            side === 'left'
                ? 'Like Left' + this._shortcutSuffix(overlayMode, 'leftLike')
                : 'Like Right' + this._shortcutSuffix(overlayMode, 'rightLike');
```

Replace `dislikeBtn.title = side === 'left' ? 'Dislike Left (W)' : 'Dislike Right (R)';` with:

```js
        dislikeBtn.title =
            side === 'left'
                ? 'Dislike Left' + this._shortcutSuffix(overlayMode, 'leftDislike')
                : 'Dislike Right' + this._shortcutSuffix(overlayMode, 'rightDislike');
```

In the special-button block, delete the three-line comment `// This bar is built fresh on every compare AND tournament render, …` and the line `const specialMode = this.isTournamentMode ? 'tournament' : 'compare';`, and change `this._shortcutSuffix(specialMode, specialAction)` to `this._shortcutSuffix(overlayMode, specialAction)`.

- [x] **Step 6: Add the overlay E2E (failing first)**

In `tests/e2e/overlay-controls.test.js`, inside `describe('Overlay controls reachability (G2)')`, after `'compare: the Like button actually rates the file on short media'`:

```js
    test('compare: the overlay like/dislike titles follow a remapped binding (G1)', async () => {
        await enterCompare(page);
        const leftLike = page.locator('.overlay-bar-slot[data-side="left"] .overlay-like-btn');
        await expect(leftLike).toHaveAttribute('title', 'Like Left (Q)');
        try {
            await page.evaluate(() => window.mediaViewer.saveShortcut('compare', 'leftLike', 'KeyT'));
            await page.evaluate(() => window.mediaViewer.showMedia()); // the bar is rebuilt per render
            await page.waitForFunction(
                () => !window.mediaViewer.isLoading && !window.mediaViewer.mediaNavigationInProgress
            );
            await expect(leftLike).toHaveAttribute('title', 'Like Left (T)');
            await expect(page.locator('.overlay-bar-slot[data-side="right"] .overlay-dislike-btn')).toHaveAttribute(
                'title',
                'Dislike Right (R)'
            );
        } finally {
            // E2E localStorage persists across runs — never leave a remap behind.
            await page.evaluate(() => window.mediaViewer.resetShortcuts());
        }
    });
```

Run: `git stash push media-viewer.js && npx playwright test tests/e2e/overlay-controls.test.js -g "follow a remapped" --reporter=list; git stash pop`
Expected: FAIL (`'Like Left (Q)'` after the remap). Then `npx playwright test tests/e2e/overlay-controls.test.js --reporter=list` → all pass.

- [x] **Step 7: Bare fallback titles in `index.html`**

Replace the comment at ~L185–187:

```html
                <!-- The three special-btn titles below are a pre-JS fallback only:
                     updateSpecialButtonsState() overwrites them at init and appends the
                     bound hotkey, which cannot be expressed in static markup. -->
```

with:

```html
                <!-- The special-btn and like/dislike-btn titles below are pre-JS fallbacks only:
                     updateSpecialButtonsState() / updateRatingButtonsState() overwrite them at
                     init and append the bound hotkey, which cannot be expressed in static markup. -->
```

`id="likeBtn" title="Move to next folder (Q)"` → `id="likeBtn" title="Like"`; `id="dislikeBtn" title="Move to previous folder (W)"` → `id="dislikeBtn" title="Dislike"`.

- [x] **Step 8: Rewrite the CLAUDE.md tooltip bullet**

Replace the whole Git Insights bullet beginning `- Special-button tooltips are **derived, not hardcoded**` with:

```markdown
- Button tooltips are **derived, not hardcoded**: `_shortcutSuffix(mode, action)` renders the live binding as ` (Q)` and `''` when unbound (a default that yielded to a user remap, or an unknown mode). `updateSpecialButtonsState()` and `updateRatingButtonsState()` are the sole runtime owners of the special and like/dislike titles in `index.html` (they overwrite them at init and on every folder browse/clear, so editing the markup alone is futile — the markup carries bare fallbacks) and both are called from `saveShortcut`/`resetShortcuts` so a remap reaches the buttons. The compare-control buttons always read the `compare` map (CSS hides them in tournament mode); `addMediaOverlayControls` derives its like/dislike/special titles per render from `isTournamentMode ? 'tournament' : 'compare'`, so the overlay bar picks up a remap on the next pair. Single mode's `special` (`Digit1`, G1) is additive — no version bump. `#cancelBtn`'s `(Ctrl+A)` is still hardcoded (BACKLOG 🟤).
```

- [x] **Step 9: Sweep for stale prose**

Run: `grep -rn "Arrow Up\|Arrow Down\|stays bare\|no special binding\|has no special\|stay hardcoded\|_specialShortcutSuffix" media-viewer.js index.html tests/ CLAUDE.md`
Expected: no output. Re-read every comment attached to the code changed in this task.

- [x] **Step 10: Commit**

```bash
git add media-viewer.js index.html tests/keyboard-shortcuts.test.js tests/media-viewer-utils.test.js tests/e2e/overlay-controls.test.js CLAUDE.md
git commit -m "fix(g1): like/dislike tooltips follow the live binding — _shortcutSuffix" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Finish (after Task 7)

- [x] `npx vitest run`, `npm run lint`, `npm run format:check` green; `git status --short` clean. (917 unit; lint 0 errors, 2 pre-existing warnings.)
- [x] `for i in 1 2 3; do npx playwright test tests/e2e/rating-safety.test.js --reporter=line || break; done` — three runs in a row (spec § 7). (7 passed ×3 — the 7th is the final-review form-field test.)
- [x] `npx playwright test` — the full suite once. If an existing E2E fails because it fired a second file action before the first settled, fix **the test** (wait for idle), never the guard, and log a deviation. (83 passed, 4 skipped; no existing test relied on overlapping actions.)
- [x] Dispatch the `regression-checker` agent on the branch diff of `media-viewer.js` (`git diff main...HEAD -- media-viewer.js`); triage every finding against the spec.
- [ ] Push (`git push -u origin g1-single-mode-rating-safety`; the pre-push hook runs the full E2E suite). If GCM hands out the wrong identity, stop and ask (memory `reference_github_auth_identities`).
- [ ] Open the PR (body: spec link, Phase 0 table and outcome, the RED→GREEN evidence per task, test deltas, the residuals). Review **thorough (`/code-review high`)**.
- [ ] Merge only on the user's go-ahead.

## Improvements (minimum 2 required before Extract)

1. **`isBeingCleaned` is one boolean shared by `cleanupCurrentMedia`, `cleanupCompareMedia` and `forceVideoCleanup`** — any overlap among them resets it under another; a counter or per-element token is the robust shape (spec § 10). 🟤 candidate.
2. **`#cancelBtn`'s `Undo last move (Ctrl+A)` title is hardcoded** and lies after a remap — the same one-line `_shortcutSuffix` call, left out because the brief named the eight like/dislike titles (spec § 10). 🟤 candidate.
3. **Undo during a plain render is still dropped silently** — D1's notice covers the in-flight-move window only; `handleCancel`'s `isLoading || mediaNavigationInProgress` early return stays silent, the shape the tournament evidence warned against. 🟤 candidate.
4. **A hung IPC call now holds `_fileOpInFlight`** — file actions stay refused (visibly, through undo's notice) instead of racing; no timeout by design. If it is ever observed, log a warning when a file op exceeds N seconds before considering a watchdog (spec § 10). 🟤 candidate.

## Residuals for Extract (found while planning — not fixed here)

- Tournament picks / draws / `handleTournamentUndo` during a guarded tournament special move still run concurrently, as before (no regression, no fix) — annotate the 🟤 [2026-08-31] "Re-entrancy guard for the tournament handler family — BLOCKED on item 1" entry at closeout that `_fileOpInFlight` now exists and what it does not cover.
- WEEKLY G1's "flip the four tests G3 pinned" and the BACKLOG hotkey entry's four test locations were inaccurate (see Premise Corrections 1) — no edit (frozen history); the plan records the true set.

- Four pre-existing failure-path defects the final review set aside (ruled out of G1's scope, each → BACKLOG 🟤): (1) `moveComparePair` — a failed **secondary** move leaves the primary as a phantom in `mediaFiles` with an orphan history entry, after both compare media were already cleaned up; (2) a failed single-mode **video** move leaves a blank view (`forceVideoCleanup` already removed the element and nothing re-renders; controls stay alive); (3) `removeFailedFile(index)` (the "Remove" button on a load-error toast) is unguarded and index-based, so during or after a move it can drop the wrong list entry (not the file on disk); (4) loading another folder while a move holds `_fileOpInFlight` (e.g. with the folder-creation dialog open) lets the move finish against stale state.
- **Shortcuts still dispatch behind the open tournament config modal** (PR #74 review near-miss): the modal runs in `single` dispatch (`isTournamentMode` flips only on Start), and the review fix returns `select`s to shortcut dispatch, so a bound key pressed while `#tournamentSeedingSelect` (or a modal button) has focus acts on the file behind the modal — Q/W did before G1; `1` (special) is new. Text fields (Rounds) stay guarded. Candidate fix: refuse the reverse-map dispatch while any `.modal-overlay` is visible. → BACKLOG 🟤.
- Three final-review minors, deferred: the undo notice says "A move is still in progress" though the in-flight op may be an undo or a bulk rating (spec D1 fixed the wording); `moveToSpecialFolder` checks `customSpecialFolder` before `_fileOpInFlight`, so with no special folder set a press during another move shows an error toast instead of a quiet refusal; CLAUDE.md's guard-handoff sentence holds on success branches only (failure paths render nothing — safe). → BACKLOG 🟤 at closeout, one entry each.

## Closeout (after the merge, on `main`)

- [ ] Extract (Improvements + Residuals → BACKLOG 🟤 under `### [YYYY-MM-DD] G1 closeout`), archive this plan (`git mv` to `docs/archive/plans/`, indexed in `docs/README.md` Archived Plans), DONE.md entry, WEEKLY Summary-Table Status → `✅ PR #N` + the Tuesday and Wednesday G1 Daily-Schedule rows, check off TODO 🔴 [2026-10-04] (held Like) and BACKLOG 🔵 [2026-10-04] (special hotkey, tooltips) — **in the closeout commit**.
- [ ] Remove this plan's row from [README.md](README.md) § Current Plans (that table has gone stale on archive twice before).
- [ ] Propagation check: re-read every live surface this plan touched (CLAUDE.md, the code comments, index.html) for a late correction — especially Phase 0's outcome wording — that did not reach it.
- [ ] Memory: session file + MEMORY.md line; record durable lessons only.

## Progress Log

- **2026-10-06** — Brainstormed with the user (D1 undo refused with a notice; D2 repeat only for next/previous; D3 one shared guard incl. compare + bulk + undo; D4 refuse-not-queue flag); spec committed `e385e0c`; plan written. Planning-time verifications: Playwright `Keyboard.down` repeat semantics (Context7, `docs/src/api/class-keyboard.md`); the test-harness constraint that extracted methods cannot see module constants (existing `globalThis.DEFAULT_SHORTCUTS` pattern); the true pinned-test set (Premise Corrections 1); `showCompareMedia` sets `isLoading` synchronously except in its `< 2`-files branch; no guarded method calls another.

- **2026-10-06 — Task 1** `7b0d52f` — Phase 0 **confirmed** F3 (spec § 11): run (b) video → 320×240 stuck (`isLoading`/`navInProgress` true, 1 clobber, 1 ignored load, 4 `ENOENT`, image hidden under the spinner); run (a) images-only did not stick but liked all 4 files from one hold, with no `ENOENT` — the plan's "(a) logs ENOENT" criterion was timing-dependent (ruled). `SLOW_NEXT = 'normal-320x240.png'`; (b2) not needed.
- **2026-10-06 — Task 2** `8a3cf3d` — RED: held Like moved 4 (expected 1); held Next green before and after.
- **2026-10-06 — Task 3** `8fe5dd5` — RED: `expected null to be { tagName: 'IMG' }`.
- **2026-10-06 — Task 4** `2081430` — unit RED exactly as predicted (8 fail, 3 pass by construction). E2E RED with Tasks 2–3 applied: burst moved 2; undo notice absent. **Deviation (ruled)**: the burst test's error assertion narrowed to `Failed to move…` — `tiny.mp4`'s expected decode failure reaches `showError` too.
- **2026-10-06 — Task 5** `41b4b15` — unit RED 4 + 1 by construction; compare E2E RED (`Failed to move files: ENOENT`, phantom). Step 9: no nested guarded calls; the `< 2` branch is unreachable from guarded compare paths.
- **2026-10-06 — Task 6** `ff37561` — RED: the 6 predicted unit tests + held `1` (special folder empty). **Deviation (ruled)**: a 7th pinned test (`does not treat Digit1/Digit2 as reserved keys`) asserted single `Digit1` free — kept its intent with `Digit2`, added the new `Digit1 → special` conflict.
- **2026-10-06 — Task 7** `6403aa9` — RED: 3 tooltip unit (`'Like (Arrow Up)'`), 2 refresh (proven by removing only the two calls), overlay E2E (`Like Left (Q)`). **Deviation (ruled)**: the stale-prose sweep found an **8th** pin the plan missed — `tests/e2e/compare-mode.test.js` asserted the single `#specialBtn` bare; flipped. Lint follow-up `162609d` (no-shadow).
- **2026-10-06 — Final review** — fresh reviewer (Opus, `code-reviewer.md`) and `regression-checker`, independently, one **Critical**: the keydown listener never filtered editable targets, so with single `Digit1 → special`, typing "10" into the tournament Rounds box (the config modal is open while the dispatch mode is still `single`) moved the file behind the modal. Fixed `4a9d5d3` (`_isTextEntryTarget`, both branches, after Escape/F1) — unit + E2E RED → GREEN; unit 917/917, rating-safety 7/7 ×3, full E2E 83 passed / 4 skipped. No Important findings; three minors and four pre-existing out-of-scope items carried as Residuals.

- **2026-10-06 — PR #74 review** — 2 findings, both verified: (1) `_isTextEntryTarget` guarded `SELECT`, so a still-focused `#sortAlgorithmSelect` swallowed shortcuts and its type-ahead turned `S` into "Simple (Limited)" (persisted) — `SELECT` dropped from the guard; unit + E2E `after picking a sort algorithm, S still navigates…` RED (index 0, expected 1) → GREEN. (2) the four compare like/dislike titles in `index.html` still hardcoded `(Q)`–`(R)` under a comment / CLAUDE.md line calling the markup bare — made bare. Near-miss minor 3 (handoff "on success branches") fixed in the same CLAUDE.md edit.

## Key Discoveries

1. **The end state was one unconditional assignment.** `forceVideoCleanup`'s `this.currentMedia = null`, fired by a *stale* overlapping call 100 ms later, nulled the next render's element; its load handler then ignored the event and `isLoading` never cleared. The in-flight guard removes the overlap, but the narrowing removes the mechanism — either alone stops the freeze (the Task 4 RED run, with Task 3 applied, moved 2 files but did not stick).
2. **Review Focus 1 was written against the wrong premise.** It assumed digits were keys "the dispatcher does not own"; Task 6 made `Digit1` owned in single mode, and the tournament config modal runs in single-mode dispatch. The plan's own Task 2 pin (`action === undefined`) could not see it — both final reviewers did, independently. A new default binding needs a check of **every focusable field reachable in that mode**, not just of stored remaps.
3. **Test pins outnumbered every list made of them** — the brief said four, the spec five, the plan's planning-time re-count six; execution found eight (one unit, one E2E beyond the plan). The E2E one is invisible to the unit-only pre-commit hook; only the prose sweep caught it.
