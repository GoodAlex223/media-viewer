# Group CW-V: Test & Tooling Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four accumulated non-tournament test/tooling gaps (sort-progress E2E smoke, `methodSource()` brace-count guard, real-git `extractAddedLines` fixtures, play/pause icon regression) on one branch / one PR.

**Architecture:** Test-only. Two unit-test edits (`tests/media-viewer-utils.test.js`, `tests/check-secrets.test.js`) and two new Playwright E2E files (`tests/e2e/sort-progress.test.js`, `tests/e2e/video-controls.test.js`). No production code in `media-viewer.js` / `scripts/check-secrets.js` / `index.html` changes. The only non-test logic added is the `methodSource` guard, which lives inside the test file.

**Tech Stack:** Vitest (unit), Playwright + Electron (E2E), Node `child_process`/`fs`/`os` (real-git fixtures).

## Global Constraints

- **Test-only.** Do not modify `media-viewer.js`, `scripts/check-secrets.js`, `index.html`, or any product file. **If a test surfaces a real product bug, STOP and surface it** — do not change product code under a backfill task.
- **Branch:** `tests/cw-v-test-tooling-backfill` (already created & checked out).
- **Pre-commit hook runs UNIT tests only** — it does **not** run E2E. Items 1 & 4 (E2E) must be verified with `npm run test:e2e` locally and the output shown before claiming done.
- **Prettier:** tabWidth=4, singleQuote, semi, trailingComma=es5, printWidth=120, arrowParens=always, LF endings. ESLint flat config; unused vars prefixed `_`. `eqeqeq`/`curly`/`prefer-const`/`no-var`.
- **Secrets:** never write a full-shape credential literal into any file — assemble by concatenation (e.g. `'ghp_' + 'a'.repeat(36)`), matching the existing `tests/check-secrets.test.js` convention (the pre-commit secret guard scans staged content).
- **Regression backfill note:** Items 1, 3, and 4 test **existing** behavior, so their tests should pass **green on first run** (they are not red-first TDD). The discipline for those is: write the test → run it → confirm PASS → sanity-check it is meaningful (would fail if the behavior regressed). Only Item 2 (the guard) is genuine red-first TDD (new logic).

---

## Task 1: `methodSource()` literal-brace guard (Item 2)

**Files:**
- Modify: `tests/media-viewer-utils.test.js` — the `methodSource` helper (currently lines 79–95) + add a new `describe` block.
- Test: `tests/media-viewer-utils.test.js` (same file — the helper under test lives here).

**Interfaces:**
- Consumes: module-level `source` const (already defined at top of the file: the read `media-viewer.js` text).
- Produces:
  - `assertLiteralBracesBalanced(methodName: string, body: string): void` — throws if `body` has an unbalanced brace inside a string/template literal, or ends mid-literal.
  - `methodSource(methodName: string, src: string = source): string` — unchanged behavior for safe bodies; now guarded and accepts a `src` override for testing.

### Background (why this guard, and why it's correct)

The existing `methodSource` brace-counts **naively** — it counts every `{`/`}` regardless of context. That is corrupted only when a brace inside a string/template literal is **unbalanced within its own literal span** (e.g. `"{"`, or a bare `}` in template text). A *balanced* literal (`` `${x}` ``, `"{}"`) nets to zero and is harmless. The guard scans each string/template span and throws if any span's internal brace balance is nonzero (or a span is unterminated).

**Comments must be skipped.** The sole current caller, `loadFolder`, has a `//` comment containing `folder's` (an apostrophe). A scanner that only tracks string/template spans would treat that apostrophe as opening a single-quote span, swallow real code, and false-throw — so the guard **skips line (`//`) and block (`/* */`) comments** (an apostrophe or brace inside a comment is ignored). This keeps the guard from false-positiving on live code while still catching a brace-in-string/template caller. **Regex literals (`/…/`) are the one untracked residual** — a brace inside a regex would be miscounted; no product caller hits it, and the doc-warning covers it.

- [ ] **Step 1: Write the failing guard tests**

Add this `describe` block to `tests/media-viewer-utils.test.js` (place it immediately after the existing `expect(methodSource('loadFolder'))...` regression test, near line 2281, so it sits with the other `methodSource` usage):

```javascript
describe('methodSource — literal-brace guard', () => {
    // Wrap body lines into a minimal 4-space-indented class method so the
    // class-method regex (`^\s{4}(?:async\s+)?name\(`) matches, then feed it
    // through methodSource via the `src` override — no media-viewer.js edit needed.
    const wrap = (bodyLines) =>
        ['class X {', '    sample() {', ...bodyLines.map((l) => '        ' + l), '    }', '}'].join('\n');

    it('extracts the real loadFolder body without throwing (guard passes on live code)', () => {
        expect(() => methodSource('loadFolder')).not.toThrow();
        expect(methodSource('loadFolder')).not.toContain('kickoffBackgroundExtractionIfEnabled');
    });

    it('does not throw on a balanced template interpolation (`${x}` nets to zero)', () => {
        const src = wrap(['const s = `value ${x} end`;', 'return s;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });

    it('does not throw on a balanced brace pair inside a string ("{}" nets to zero)', () => {
        const src = wrap(['const s = "{}";', 'return s;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });

    it('throws on an unbalanced open brace inside a string ("{")', () => {
        const src = wrap(['const s = "oops {";', 'return s;']);
        expect(() => methodSource('sample', src)).toThrow(/string\/template literal/);
    });

    it('throws on an unbalanced close brace in template text (`}`)', () => {
        const src = wrap(['const s = `oops }`;', 'return s;']);
        expect(() => methodSource('sample', src)).toThrow(/string\/template literal/);
    });

    it("does not throw on an apostrophe inside a line comment (the loadFolder failure mode)", () => {
        // Without comment-skipping, the apostrophe in `folder's` would open a phantom
        // single-quote span that swallows code and false-throws. Comment is skipped now.
        const src = wrap(["// refresh the folder's view", 'const s = `${x}`;', 'return s;']);
        expect(() => methodSource('sample', src)).not.toThrow();
    });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/media-viewer-utils.test.js -t "literal-brace guard"`
Expected: FAIL — the "throws on…" cases fail because `methodSource` currently accepts a second arg but ignores guarding (the `src` param does not exist yet, so `methodSource('sample', src)` ignores `src` and looks up `sample` in the real source → "Could not find method: sample"). This confirms the tests exercise the not-yet-built behavior.

- [ ] **Step 3: Add the guard helper + wire it into `methodSource`**

In `tests/media-viewer-utils.test.js`, **replace** the current `methodSource` function (lines ~79–95) with the guard helper followed by the updated `methodSource`:

```javascript
// Guard for methodSource's naive brace counter (below). The counter is corrupted
// only by an *unbalanced* brace inside a string/template literal (e.g. `"{"`, a bare
// `}` in template text). A balanced literal (`${x}`, `"{}"`) nets to zero and is safe.
// Line/block comments ARE skipped, so an apostrophe or brace inside a comment can't
// corrupt the scan (loadFolder has a `folder's` line comment). Regex literals are the
// SOLE untracked residual — a brace inside a regex would be miscounted; no caller hits
// it, and the doc-warning covers it. Throws if any string/template span's brace balance
// is nonzero, or a string/template span is left unterminated.
function assertLiteralBracesBalanced(methodName, body) {
    let state = 'CODE'; // CODE | SQ | DQ | TMPL | LINE_CMT | BLOCK_CMT
    let escaped = false;
    let spanBalance = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        const next = body[i + 1];
        if (state === 'CODE') {
            if (c === "'") {
                state = 'SQ';
                spanBalance = 0;
            } else if (c === '"') {
                state = 'DQ';
                spanBalance = 0;
            } else if (c === '`') {
                state = 'TMPL';
                spanBalance = 0;
            } else if (c === '/' && next === '/') {
                state = 'LINE_CMT';
                i++; // consume the second '/'
            } else if (c === '/' && next === '*') {
                state = 'BLOCK_CMT';
                i++; // consume the '*'
            }
            // A lone `/` (division or a regex literal) stays in CODE — regex spans are
            // the documented residual; a brace inside one would be miscounted.
            continue;
        }
        if (state === 'LINE_CMT') {
            if (c === '\n') state = 'CODE';
            continue;
        }
        if (state === 'BLOCK_CMT') {
            if (c === '*' && next === '/') {
                state = 'CODE';
                i++; // consume the '/'
            }
            continue;
        }
        // Inside a string/template span (SQ | DQ | TMPL).
        if (escaped) {
            escaped = false;
            continue;
        }
        if (c === '\\') {
            escaped = true;
            continue;
        }
        const closer = state === 'SQ' ? "'" : state === 'DQ' ? '"' : '`';
        if (c === closer) {
            if (spanBalance !== 0) {
                throw new Error(
                    `methodSource(${methodName}): unbalanced brace inside a string/template literal — ` +
                        `naive brace-counting is unsafe for this method; extend the extractor.`
                );
            }
            state = 'CODE';
        } else if (c === '{') {
            spanBalance++;
        } else if (c === '}') {
            spanBalance--;
        }
    }
    if (state === 'SQ' || state === 'DQ' || state === 'TMPL') {
        throw new Error(
            `methodSource(${methodName}): body ends inside an unterminated string/template literal — ` +
                `naive brace-counting truncated the method; extend the extractor.`
        );
    }
}

// Returns the raw source text of a top-level MediaViewer method body (for regression
// assertions that a call was added/removed). Handles both `name(` and `async name(`.
//
// WARNING: brace-counting is NAIVE — it counts every `{`/`}` regardless of context.
// It is only correct for method bodies whose literals contain no *unbalanced* brace.
// `assertLiteralBracesBalanced` (which skips comments and checks string/template spans)
// throws on a violating body rather than returning a silently-wrong slice; a brace
// inside a regex literal is the one unguarded residual. Only caller today: `loadFolder`.
// The `src` override lets the guard be unit-tested against synthetic source.
function methodSource(methodName, src = source) {
    const regex = new RegExp(`^\\s{4}(?:async\\s+)?${methodName}\\(([^)]*)\\)\\s*\\{`, 'm');
    const match = src.match(regex);
    if (!match) {
        throw new Error(`Could not find method: ${methodName}`);
    }
    const searchStart = match.index + match[0].length - 1; // position of opening {
    let braceCount = 0;
    for (let i = searchStart; i < src.length; i++) {
        if (src[i] === '{') braceCount++;
        if (src[i] === '}') braceCount--;
        if (braceCount === 0) {
            const body = src.substring(searchStart + 1, i);
            assertLiteralBracesBalanced(methodName, body);
            return body;
        }
    }
    throw new Error(`Unbalanced braces for method: ${methodName}`);
}
```

- [ ] **Step 4: Run the guard tests + the full file to verify PASS (incl. loadFolder still green)**

Run: `npx vitest run tests/media-viewer-utils.test.js`
Expected: PASS — all guard tests pass AND the pre-existing 144 tests (incl. the `methodSource('loadFolder')` regression at line 2281) stay green. **Critical checkpoint:** if `methodSource('loadFolder')` now throws, the guard is false-positiving on real code — STOP and inspect `loadFolder` for a brace inside a plain string; do not loosen the guard blindly (surface it).

- [ ] **Step 5: Commit**

```bash
git add tests/media-viewer-utils.test.js
git commit -m "test(utils): guard methodSource() naive brace-counting against literal braces

Adds assertLiteralBracesBalanced + a src-override seam so the guard is
unit-testable; throws on an unbalanced brace inside a string/template
literal instead of returning a silently-wrong slice. loadFolder (sole
caller) stays green. Item 2 of Group CW-V.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `extractAddedLines` real-git-diff fixtures (Item 3)

**Files:**
- Modify: `tests/check-secrets.test.js` — extend the `vitest` import with `afterEach`, add Node requires, add a `describe` block.
- Test: `tests/check-secrets.test.js` (same file).

**Interfaces:**
- Consumes: `extractAddedLines(diffText: string): Array<{file: string|null, line: number, text: string}>` and `scanForSecrets(text: string): Array<{pattern: string, match: string}>` (already imported at top of file from `../scripts/check-secrets.js`).
- Produces: nothing consumed by later tasks.

### Notes
- Drives real `git` in an OS-temp repo, then asserts `extractAddedLines` on the **actual** `git diff --cached --unified=0` output. Keeps the existing hand-authored string cases untouched (they remain primary coverage).
- `git` is on PATH in this repo (the pre-commit hook shells out to it). Configure `core.autocrlf=false` so diff line-shapes are stable on Windows, and set a throwaway git identity so `commit` doesn't fail on a machine with no global config.
- A **new binary file** under `--unified=0` emits `Binary files /dev/null and b/<name> differ` with **no** `+++ b/<name>` header and no `+` content lines, so it contributes nothing to `extractAddedLines`. Order filenames so the binary sorts first (`img.bin` < `note.txt`) to exercise "binary then text".

- [ ] **Step 1: Extend imports/requires at the top of `tests/check-secrets.test.js`**

Change the first import line:

```javascript
import { describe, it, expect } from 'vitest';
```

to:

```javascript
import { describe, it, expect, afterEach } from 'vitest';
```

And add these requires immediately after the existing `const { scanForSecrets, extractAddedLines } = require('../scripts/check-secrets.js');` line:

```javascript
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
```

- [ ] **Step 2: Write the real-git test block (expected to pass on first run)**

Append this `describe` block to the end of `tests/check-secrets.test.js`:

```javascript
describe('extractAddedLines — real git diff output', () => {
    let repoDir;

    const git = (args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' });

    const initRepo = () => {
        repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-git-'));
        git(['init', '--quiet']);
        git(['config', 'user.email', 'test@example.com']);
        git(['config', 'user.name', 'CW-V Test']);
        git(['config', 'core.autocrlf', 'false']); // stable LF line-shapes on Windows
        git(['config', 'commit.gpgsign', 'false']);
    };

    const stagedDiff = () => git(['diff', '--cached', '--unified=0']);

    afterEach(() => {
        if (repoDir) {
            try {
                fs.rmSync(repoDir, { recursive: true, force: true });
            } catch {
                // Windows can briefly hold a .git pack handle; a leaked temp dir is harmless.
            }
            repoDir = undefined;
        }
    });

    it('parses a no-trailing-newline replacement (the "\\ No newline" marker)', () => {
        initRepo();
        fs.writeFileSync(path.join(repoDir, 'f.txt'), 'old secret line'); // no trailing \n
        git(['add', 'f.txt']);
        git(['commit', '--quiet', '-m', 'init']);
        fs.writeFileSync(path.join(repoDir, 'f.txt'), 'new secret line'); // no trailing \n
        git(['add', 'f.txt']);

        expect(extractAddedLines(stagedDiff())).toEqual([{ file: 'f.txt', line: 1, text: 'new secret line' }]);
    });

    it('attributes added lines to the correct file across a multi-file staged diff', () => {
        initRepo();
        fs.writeFileSync(path.join(repoDir, 'a.txt'), 'alpha one\nalpha two\n');
        fs.writeFileSync(path.join(repoDir, 'b.txt'), 'beta one\n');
        git(['add', 'a.txt', 'b.txt']);

        expect(extractAddedLines(stagedDiff())).toEqual([
            { file: 'a.txt', line: 1, text: 'alpha one' },
            { file: 'a.txt', line: 2, text: 'alpha two' },
            { file: 'b.txt', line: 1, text: 'beta one' },
        ]);
    });

    it('skips a staged binary file but still collects the following text file', () => {
        initRepo();
        // NUL bytes make git treat this as binary ("Binary files ... differ").
        fs.writeFileSync(path.join(repoDir, 'img.bin'), Buffer.from([0, 1, 2, 0, 3, 255]));
        fs.writeFileSync(path.join(repoDir, 'note.txt'), 'text secret line\n');
        git(['add', 'img.bin', 'note.txt']);

        expect(extractAddedLines(stagedDiff())).toEqual([{ file: 'note.txt', line: 1, text: 'text secret line' }]);
    });

    it('flags a planted key from real diff output (end-to-end through git)', () => {
        initRepo();
        const token = 'ghp_' + 'a'.repeat(36); // assembled — never a literal on disk
        fs.writeFileSync(path.join(repoDir, 'config.js'), `const t = "${token}";\n`);
        git(['add', 'config.js']);

        const findings = extractAddedLines(stagedDiff()).flatMap((a) =>
            scanForSecrets(a.text).map((h) => ({ file: a.file, line: a.line, pattern: h.pattern }))
        );
        expect(findings).toEqual([{ file: 'config.js', line: 1, pattern: 'GitHub token' }]);
    });
});
```

- [ ] **Step 3: Run the new block and confirm PASS**

Run: `npx vitest run tests/check-secrets.test.js -t "real git diff output"`
Expected: PASS (4 tests). If any FAIL, the diff shape differs from the assertion — inspect the actual `git diff --cached --unified=0` (log `stagedDiff()`) and reconcile; a genuine mismatch vs `extractAddedLines` behavior is a real bug → STOP and surface (do not edit `scripts/check-secrets.js` under this backfill task without flagging).

- [ ] **Step 4: Run the full file (existing hand-authored cases still green)**

Run: `npx vitest run tests/check-secrets.test.js`
Expected: PASS (19 existing + 4 new = 23).

- [ ] **Step 5: Commit**

```bash
git add tests/check-secrets.test.js
git commit -m "test(check-secrets): drive extractAddedLines from real git diff output

Adds a temp-repo describe block asserting on actual
git diff --cached --unified=0 for no-trailing-newline, multi-file, and
binary-then-text cases + an end-to-end planted-key flag. Existing
hand-authored string cases kept as primary coverage. Item 3 of CW-V.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Sort-progress card E2E smoke (Item 1)

**Files:**
- Create: `tests/e2e/sort-progress.test.js`
- Test: itself (Playwright).

**Interfaces:**
- Consumes helpers from `./helpers/electron-app.js`: `launchApp()`, `closeApp(electronApp)`, `loadFolder(page, dir)`, `createTempFixtureDir(names?)`.
- Consumes renderer surface (via `page.evaluate`): `window.mediaViewer.handleSortBySimilarity()`, `window.mediaViewer.updateSortProgress({phase, current, total})`, `window.mediaViewer.sortAbortController`. DOM: `.notification-progress`, `.notification-progress .progress-cancel`.

### Notes
- Default `sortAlgorithm` is `'vptree'` (perceptual hashing, **no CLIP** → no model download); a 3-file tiny-PNG folder sorts in well under the test timeout.
- The card is transient (`clearProgressNotification()` `.remove()`s it in the sort's completion path). A `MutationObserver` installed **before** the sort captures the appearance deterministically; a poll could miss it.
- `page.evaluate` **awaits** a returned promise, so `await page.evaluate(() => window.mediaViewer.handleSortBySimilarity())` resolves only after the whole sort finishes — after the card has appeared (captured) and been removed.
- Cancel is tested by a **deterministic wiring check** (fresh `AbortController` + direct `updateSortProgress` render + click), avoiding a race against the real sort's auto-completion.

- [ ] **Step 1: Create the E2E file**

Create `tests/e2e/sort-progress.test.js`:

```javascript
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir } from './helpers/electron-app.js';

test.describe('Sort progress card', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['red-1x1.png', 'green-1x1.png', 'blue-1x1.png']);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('appears during a real sort and is removed on completion', async () => {
        // Install the observer BEFORE sorting: the card can appear and vanish in <100ms
        // on tiny fixtures, faster than any poll. childList catches a newly appended node;
        // the class attribute filter catches a reused node that gains .notification-progress.
        await page.evaluate(() => {
            window.__sawProgressCard = false;
            const check = () => {
                if (document.querySelector('.notification-progress')) {
                    window.__sawProgressCard = true;
                }
            };
            new MutationObserver(check).observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class'],
            });
            check();
        });

        // page.evaluate awaits the returned promise → resolves only after the sort finishes.
        await page.evaluate(() => window.mediaViewer.handleSortBySimilarity());

        expect(await page.evaluate(() => window.__sawProgressCard)).toBe(true);
        await expect(page.locator('.notification-progress')).not.toBeAttached();
    });

    test('Cancel button aborts the active sort controller', async () => {
        // Deterministic wiring check (no race with the real sort): install a fresh abort
        // controller, render the card, click Cancel, assert the controller was aborted.
        await page.evaluate(() => {
            window.mediaViewer.sortAbortController = new AbortController();
            window.mediaViewer.updateSortProgress({ phase: 'Sorting…', current: 1, total: 4 });
        });

        await expect(page.locator('.notification-progress')).toBeAttached();
        await page.locator('.notification-progress .progress-cancel').click({ force: true });

        await expect
            .poll(() => page.evaluate(() => window.mediaViewer.sortAbortController.signal.aborted))
            .toBe(true);
    });
});
```

- [ ] **Step 2: Run the new E2E file and confirm PASS**

Run: `npx playwright test tests/e2e/sort-progress.test.js`
Expected: PASS (2 tests). If "appears…" fails with `__sawProgressCard === false`, the sort completed without ever rendering the card — inspect (unexpected: at least one `updateSortProgress` call fires for vptree). If the sort hangs, confirm `sortAlgorithm` resolved to `vptree` (log `window.mediaViewer.sortAlgorithm`).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sort-progress.test.js
git commit -m "test(e2e): smoke the sort-progress card appear/remove + cancel wiring

New Playwright file: a real vptree sort with a MutationObserver capture
of the transient .notification-progress card + removal assertion, plus a
deterministic Cancel->sortAbortController.abort() wiring check. Item 1 of CW-V.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Play/pause icon toggle E2E regression (Item 4)

**Files:**
- Create: `tests/e2e/video-controls.test.js`
- Test: itself (Playwright).

**Interfaces:**
- Consumes helpers: `launchApp()`, `closeApp(electronApp)`, `loadFolder(page, dir)`, `createTempFixtureDir(names)`.
- Consumes renderer surface: `window.mediaViewer.currentMedia` (a `<video>`), `window.mediaViewer.playIcon` / `.pauseIcon` (the `<i>` elements), `window.mediaViewer.togglePlayPause()`. DOM: `#playIcon`, `#pauseIcon`.

### Notes
- **Codec-independent by design.** `onPlay`/`onPause` are real `addEventListener('play'/'pause')` bindings on `currentMedia` ([media-viewer.js:3454-3455]). Dispatching a synthetic `new Event('play')`/`'pause'` fires those handlers regardless of whether the mp4 actually decodes — this is the robust way to test the icon-swap logic (the regression target) without depending on Electron's H.264 support or autoplay policy.
- **Lucide is stubbed to a no-op in E2E** ([electron-app.js:56-57]) → `<i data-lucide>` is never rendered to `<svg>`. The test asserts on the `<i>` elements, their `data-lucide` names, and their `display` swap (catches DOM-ref/ID/icon-name drift + handler logic). Do **not** assert on a rendered `<svg>` — impossible here.
- Wait on `currentMedia?.tagName === 'VIDEO'` (set synchronously in `showMedia`), **not** `waitForMedia()` — the latter needs the video to become visible, which won't happen if the codec can't decode. A single-file `tiny.mp4` folder makes the video the current media immediately.
- `#videoControls` is shown (`display:flex`) for a video, so the icons' own computed `display` reflects the inline value the handlers set.

- [ ] **Step 1: Create the E2E file**

Create `tests/e2e/video-controls.test.js`:

```javascript
import { test, expect } from '@playwright/test';
import { launchApp, closeApp, loadFolder, createTempFixtureDir } from './helpers/electron-app.js';

test.describe('Video play/pause icon toggle', () => {
    let electronApp, page, tmpFixtures;

    test.beforeEach(async () => {
        tmpFixtures = await createTempFixtureDir(['tiny.mp4']);
        ({ electronApp, page } = await launchApp());
        await loadFolder(page, tmpFixtures.dir);
        // currentMedia is set synchronously when showMedia renders the video; do NOT
        // use waitForMedia (needs the video to decode+become visible, which may not happen).
        await page.waitForFunction(() => window.mediaViewer.currentMedia?.tagName === 'VIDEO', null, {
            timeout: 10_000,
        });
    });

    test.afterEach(async () => {
        if (electronApp) {
            await closeApp(electronApp);
        }
        if (tmpFixtures) {
            await tmpFixtures.cleanup();
        }
    });

    test('play/pause events swap the play and pause icons', async () => {
        const playIcon = page.locator('#playIcon');
        const pauseIcon = page.locator('#pauseIcon');

        // DOM refs + icon-name integrity (catches ID / data-lucide drift).
        const refs = await page.evaluate(() => ({
            playRef: !!window.mediaViewer.playIcon,
            pauseRef: !!window.mediaViewer.pauseIcon,
            playName: window.mediaViewer.playIcon?.getAttribute('data-lucide'),
            pauseName: window.mediaViewer.pauseIcon?.getAttribute('data-lucide'),
        }));
        expect(refs).toEqual({ playRef: true, pauseRef: true, playName: 'play', pauseName: 'pause' });

        // Synthetic 'pause' event → onPause: show play icon, hide pause icon.
        await page.evaluate(() => window.mediaViewer.currentMedia.dispatchEvent(new Event('pause')));
        await expect(playIcon).toHaveCSS('display', 'block');
        await expect(pauseIcon).toHaveCSS('display', 'none');

        // Synthetic 'play' event → onPlay: show pause icon, hide play icon.
        await page.evaluate(() => window.mediaViewer.currentMedia.dispatchEvent(new Event('play')));
        await expect(pauseIcon).toHaveCSS('display', 'block');
        await expect(playIcon).toHaveCSS('display', 'none');
    });
});
```

- [ ] **Step 2: Run the new E2E file and confirm PASS**

Run: `npx playwright test tests/e2e/video-controls.test.js`
Expected: PASS (1 test). If the `beforeEach` `waitForFunction` times out, the folder didn't load the mp4 as `currentMedia` — confirm `tiny.mp4` is in the fixture dir and is the sole file. If a `toHaveCSS` assertion fails, inspect whether `onPlay`/`onPause` still target `this.playIcon`/`this.pauseIcon` (a real regression → surface).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/video-controls.test.js
git commit -m "test(e2e): regression-test the play/pause icon toggle

New Playwright file: dispatches synthetic play/pause events on the video
(codec-independent) and asserts the #playIcon/#pauseIcon display swap +
data-lucide name integrity. Catches DOM-ref/icon drift and onPlay/onPause
handler bugs. Item 4 of CW-V (oldest actionable test-coverage item).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full-suite verification + open PR

**Files:** none (verification + PR).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — 411 prior + new unit tests (Task 1 guard tests, Task 2 real-git tests) all green. Note: vitest v4.0.18 has an occasional parallel flake on Windows (can surface as `code 134`); a plain re-run passes. If it recurs, `npx vitest run --no-file-parallelism`.

- [ ] **Step 2: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS — the two new files plus all existing E2E green. (E2E is NOT run by the pre-commit hook, so this manual run is the gate.) Paste the summary line.

- [ ] **Step 3: Run lint + format check**

Run: `npm run lint && npm run format:check`
Expected: no errors.

- [ ] **Step 4: Push the branch and open the PR**

```bash
git push -u origin tests/cw-v-test-tooling-backfill
gh pr create --title "test(cw-v): sort-progress E2E, methodSource guard, real-git fixtures, play/pause regression" --body "$(cat <<'EOF'
Group CW-V: Test & tooling backfill (test-only, 4 SP). Spec: docs/superpowers/specs/2026-07-04-cw-v-test-tooling-backfill-design.md

- **Item 1** — E2E smoke for the sort-progress card (appear/remove via MutationObserver capture + deterministic Cancel→abort). `tests/e2e/sort-progress.test.js`.
- **Item 2** — `methodSource()` naive brace-counting guard + doc-warning + `src`-override test seam. `tests/media-viewer-utils.test.js`.
- **Item 3** — `extractAddedLines` fixtures from real `git diff` output (no-newline / multi-file / binary-then-text). `tests/check-secrets.test.js`.
- **Item 4** — play/pause icon toggle regression (synthetic play/pause events, codec-independent). `tests/e2e/video-controls.test.js`.

No production code changed. Unit suite + full E2E run locally green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Post-approval closeout (per CLAUDE.md workflow — do AFTER user approval + merge)**

Not part of implementation. At closeout: check off each CW-V item in `WEEKLY.md` (lines 60–63 and the July 9 daily entry line 142), move to `DONE.md`, archive this plan to `docs/archive/plans/` (flip in-plan step boxes to `- [x]`), and capture any learnings to memory.

---

## Self-Review

**1. Spec coverage** — every spec item maps to a task:
- Item 1 (sort-progress E2E, hybrid) → Task 3 ✓ (MutationObserver capture + direct-drive cancel, both spec tests A & B).
- Item 2 (methodSource document+guard+seam) → Task 1 ✓ (doc-warning, precise per-span guard, `src` override, balanced-literal + unbalanced-literal + loadFolder tests).
- Item 3 (real-git fixtures, keep hand-authored) → Task 2 ✓ (no-newline, multi-file, binary-then-text, planted-key; existing cases untouched).
- Item 4 (play/pause E2E, Lucide-stub-aware) → Task 4 ✓ (synthetic events, data-lucide integrity, display swap; SVG assertion dropped per stub).
- Verification-gap constraint (E2E not hook-run) → Task 5 Step 2 ✓.

**2. Placeholder scan** — no "TBD"/"TODO"/"add appropriate…"; every code step shows complete code; every run step shows the command + expected result. ✓

**3. Type consistency** — `assertLiteralBracesBalanced(methodName, body)` and `methodSource(methodName, src = source)` names/signatures match between Task 1's helper definition and its tests. `extractAddedLines`/`scanForSecrets` shapes match `scripts/check-secrets.js`. `handleSortBySimilarity()`/`updateSortProgress({phase,current,total})`/`sortAbortController`/`clearProgressNotification()` match media-viewer.js. `currentMedia`/`playIcon`/`pauseIcon`/`togglePlayPause` match media-viewer.js. Helper signatures (`createTempFixtureDir`, `loadFolder`, `launchApp`, `closeApp`) match `electron-app.js`. ✓

**Deviation noted honestly:** Items 1/3/4 are regression tests of existing behavior, so their tests pass green on first run (not red-first). Only Task 1's guard is genuine red-first TDD. Each such task's run-step says "confirm PASS; a failure means a real bug → STOP and surface" per the Global Constraints.
